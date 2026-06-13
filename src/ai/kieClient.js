// kie.ai client — Suno generation + native generative stems (WAV, up to 12).
// All requests are proxied through the Cloudflare Worker, which attaches the
// Bearer key. The provider requires a callBackUrl, but we poll record-info
// instead, so we pass the Worker's harmless /callback sink.

const PROXY = 'https://flair-proxy.macsippial.workers.dev';
const BASE = `${PROXY}/kieai`;
const CALLBACK = `${PROXY}/callback`;
const MODEL = 'V5';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Friendly label, color, and starting volume per native stem type.
const STEM_META = {
  drums:       { color: '#c4a882', volume: 0.85 },
  bass:        { color: '#6ba3c4', volume: 0.82 },
  guitar:      { color: '#82b8c4', volume: 0.74 },
  keyboard:    { color: '#c482c4', volume: 0.72 },
  piano:       { color: '#c482c4', volume: 0.72 },
  synth:       { color: '#9b82c4', volume: 0.70 },
  strings:     { color: '#c49b82', volume: 0.68 },
  brass:       { color: '#c4c082', volume: 0.68 },
  woodwinds:   { color: '#9bc482', volume: 0.66 },
  percussion:  { color: '#b8a882', volume: 0.74 },
  fx:          { color: '#828fc4', volume: 0.55 },
  other:       { color: '#9b82c4', volume: 0.68 },
};

function stemMeta(name) {
  const key = String(name).toLowerCase();
  for (const k of Object.keys(STEM_META)) {
    if (key.includes(k)) return { key: k, ...STEM_META[k] };
  }
  return { key, color: '#7eb8d4', volume: 0.7 };
}

// ─── Generation ──────────────────────────────────────────────────────────────

export async function generateMusicTakes(prompt, onProgress) {
  onProgress?.('Generating with Suno V5…');

  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customMode: false,
      instrumental: true,
      model: MODEL,
      prompt,
      callBackUrl: CALLBACK,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Suno create ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(`Suno create error: ${data.msg || JSON.stringify(data)}`);
  const taskId = data.data?.taskId ?? data.data?.task_id ?? data.taskId;
  if (!taskId) throw new Error(`Suno returned no taskId: ${JSON.stringify(data)}`);

  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await sleep(5000);
    let info;
    try {
      const r = await fetch(`${BASE}/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
      if (!r.ok) continue;
      info = await r.json();
    } catch { continue; }

    const d = info.data ?? info;
    const status = String(d.status ?? d.successFlag ?? '').toUpperCase();
    if (status.includes('FAIL') || status.includes('ERROR')) {
      throw new Error(`Suno generation failed: ${d.errorMessage || status}`);
    }

    const clips = d.response?.sunoData ?? d.response?.data ?? d.sunoData ?? [];
    const ready = clips.filter(c => c.audioUrl || c.audio_url);
    // Wait for the full SUCCESS so both takes are present.
    if (status === 'SUCCESS' && ready.length) {
      return {
        taskId,
        takes: ready.map((c, i) => ({
          url: c.audioUrl ?? c.audio_url,
          duration: c.duration ?? null,
          title: c.title || `Take ${String.fromCharCode(65 + i)}`,
          audioId: c.id ?? c.audioId ?? c.clipId,
          taskId,
        })),
      };
    }
  }
  throw new Error('Suno generation timed out');
}

// ─── Native stem separation (split_stem → up to 12 WAV stems) ────────────────

export async function separateNativeStems(taskId, audioId, onProgress) {
  onProgress?.('Separating stems…');

  const res = await fetch(`${BASE}/vocal-removal/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId,
      audioId,
      type: 'split_stem',
      callBackUrl: CALLBACK,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stem create ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(`Stem create error: ${data.msg || JSON.stringify(data)}`);
  const sepTaskId = data.data?.taskId ?? data.data?.task_id ?? data.taskId;
  if (!sepTaskId) throw new Error(`Stem split returned no taskId: ${JSON.stringify(data)}`);

  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await sleep(5000);
    let info;
    try {
      const r = await fetch(`${BASE}/vocal-removal/record-info?taskId=${encodeURIComponent(sepTaskId)}`);
      if (!r.ok) continue;
      info = await r.json();
    } catch { continue; }

    const d = info.data ?? info;
    const status = String(d.status ?? d.successFlag ?? '').toUpperCase();
    if (status.includes('FAIL') || status.includes('ERROR')) {
      throw new Error(`Stem split failed: ${d.errorMessage || status}`);
    }

    const rawForParse = d.response ?? d;
    // Always log so the raw shape is visible in DevTools when debugging.
    if (status === 'SUCCESS' || status.includes('COMPLETE') || status === '1') {
      console.log('[kieClient] stem poll SUCCESS raw:', JSON.stringify(rawForParse).slice(0, 2000));
    }
    const stems = parseStemResponse(rawForParse);
    if (stems.length) {
      console.log('[kieClient] parsed stems:', stems.map(s => s.name));
      return stems;
    }

    // Job done but nothing parsed → surface the raw shape instead of timing out.
    if (status === 'SUCCESS' || status.includes('COMPLETE') || status === '1') {
      throw new Error(`Stems done but none parsed. Raw: ${JSON.stringify(rawForParse).slice(0, 800)}`);
    }
  }
  throw new Error('Stem split timed out');
}

// Non-stem URL fields the response carries that must never be treated as stems.
const NON_STEM = /callback|image|video|cover|thumb|stream|source|origin|info/i;

// The split_stem response shape varies; handle an array of stems OR a flat set
// of "<name>Url" fields. Drop vocals/instrumental and any non-audio URL field.
function parseStemResponse(resp) {
  if (!resp) return [];
  let raw = [];

  const arr = resp.originData ?? resp.stems ?? resp.data ?? (Array.isArray(resp) ? resp : null);
  if (Array.isArray(arr)) {
    console.log('[kieClient] parseStemResponse: array path, length', arr.length, 'keys[0]', arr[0] ? Object.keys(arr[0]) : 'empty');
    raw = arr.map(s => ({
      name: s.stem_type_group_name ?? s.stemTypeGroupName ?? s.stemType ?? s.type ?? s.name ?? s.label,
      url: s.audio_url ?? s.audioUrl ?? s.url ?? s.wavUrl ?? s.fileUrl,
    }));
  } else {
    // Scan for keys like drumsUrl, bassUrl, guitarUrl, synthUrl, fxUrl…
    const flatEntries = Object.entries(resp)
      .filter(([k, v]) => /url$/i.test(k) && typeof v === 'string' && v);
    console.log('[kieClient] parseStemResponse: flat path, url-keys:', flatEntries.map(([k]) => k));
    raw = flatEntries.map(([k, v]) => ({ name: k.replace(/url$/i, ''), url: v }));
  }

  return raw
    .filter(s =>
      s.url && s.url !== CALLBACK && s.name &&
      !NON_STEM.test(s.name) &&
      !/vocal/i.test(s.name) && !/instrumental/i.test(s.name)
    )
    .map(s => {
      const m = stemMeta(s.name);
      const label = m.key.charAt(0).toUpperCase() + m.key.slice(1);
      return { name: label, url: s.url, color: m.color, volume: m.volume };
    });
}
