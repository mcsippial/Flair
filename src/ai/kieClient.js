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

export async function generateMusicTakes(spec, onProgress) {
  onProgress?.('Generating with Suno V5…');

  // Accept a plain style string (back-compat) or { style, title, weirdness }.
  const style = typeof spec === 'string' ? spec : spec.style;
  const title = (typeof spec === 'object' && spec.title) || 'Flair Session';
  const w = Math.max(0, Math.min(1, typeof spec === 'object' && typeof spec.weirdness === 'number' ? spec.weirdness : 0.45));
  // Lower weirdness → tighter adherence to the requested style (more faithful).
  const styleWeight = +(0.5 + (1 - w) * 0.3).toFixed(2);

  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // customMode + instrumental requires `style` and `title`. Custom mode
      // gives Suno more compositional freedom than a prose prompt, which yields
      // more unique output and avoids kie.ai's catalog-match rejection.
      customMode: true,
      instrumental: true,
      model: MODEL,
      style,
      title,
      // Exclude over-represented/derivative output to steer into sparser space.
      negativeTags: 'derivative, generic, stock music',
      styleWeight,                  // higher when weirdness is low → faithful
      weirdnessConstraint: w,       // producer-controlled experimentation level
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
      const msg = d.errorMessage || d.msg || status;
      if (/catalog|existing recording|copyright/i.test(msg)) {
        throw new Error(
          'Stem separation was blocked — the generated track was too similar to a known recording. ' +
          'Try generating again with a more specific or unusual description.'
        );
      }
      throw new Error(`Stem split failed: ${msg}`);
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
// `origin`/`source` cover the original full-mix track; vocals/instrumental are
// the 2-stem split, not the per-instrument stems we want.
const NON_STEM = /callback|image|video|cover|thumb|stream|source|origin|info|vocal|instrumental/i;

// kie.ai's split_stem response carries the per-instrument stems as flat
// "<instrument>Url" keys (drumsUrl, bassUrl, guitarUrl, pianoUrl, synthUrl, …).
// It ALSO carries an `originData` array describing the ORIGINAL full mix — which
// is NOT a stem. We must read the flat instrument keys first and only fall back
// to an array shape if no flat keys exist, otherwise every "stem" ends up being
// the same original track.
function parseStemResponse(resp) {
  if (!resp) return [];

  // 1) Preferred: flat per-instrument "<name>Url" keys.
  let raw = Object.entries(resp)
    .filter(([k, v]) => /url$/i.test(k) && typeof v === 'string' && v)
    .map(([k, v]) => ({ name: k.replace(/url$/i, ''), url: v }));
  console.log('[kieClient] parseStemResponse flat url-keys:', raw.map(s => s.name));

  // 2) Fallback: an explicit array of stem objects (never originData — that's
  //    the source mix). Only used if no flat instrument keys were present.
  if (!raw.length) {
    const arr = resp.stems ?? resp.data ?? (Array.isArray(resp) ? resp : null);
    if (Array.isArray(arr)) {
      console.log('[kieClient] parseStemResponse array path, keys[0]:', arr[0] ? Object.keys(arr[0]) : 'empty');
      raw = arr.map(s => ({
        name: s.stem_type_group_name ?? s.stemTypeGroupName ?? s.stemType ?? s.type ?? s.name ?? s.label,
        url: s.audio_url ?? s.audioUrl ?? s.url ?? s.wavUrl ?? s.fileUrl,
      }));
    }
  }

  // Dedupe by URL so a stem that appears under two aliases isn't doubled.
  const seen = new Set();
  return raw
    .filter(s => {
      if (!s.url || !s.name || s.url === CALLBACK) return false;
      if (NON_STEM.test(s.name)) return false;
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })
    .map(s => {
      const m = stemMeta(s.name);
      const label = m.key.charAt(0).toUpperCase() + m.key.slice(1);
      return { name: label, url: s.url, color: m.color, volume: m.volume };
    });
}
