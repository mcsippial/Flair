import { sleep, downloadAudio } from './musicGen';

const PROXY = 'https://flair-proxy.macsippial.workers.dev';
const BASE  = `${PROXY}/v1`;

// cjwbw/demucs — confirmed version from replicate.com/cjwbw/demucs/versions
const DEMUCS_VERSION = 'abf8fe28e407afa6d8e41e86a759caccc0af8e49c3c68016006b62cb0968441e';

const STEM_COLORS  = { drums: '#c4a882', bass: '#6ba3c4', other: '#9b82c4', vocals: '#82c49b' };
const STEM_VOLUMES = { drums: 0.85,      bass: 0.82,      other: 0.72,      vocals: 0.68 };

function parseStemOutput(output) {
  if (!output) return [];
  // [{name, audio}]
  if (Array.isArray(output) && output[0]?.audio)
    return output.map(s => ({ name: s.name, url: s.audio }));
  // {drums: url, bass: url, …}
  if (!Array.isArray(output) && typeof output === 'object')
    return Object.entries(output).map(([name, url]) => ({ name, url }));
  // [url, url, …]
  if (Array.isArray(output) && typeof output[0] === 'string')
    return output.map((url, i) => ({ name: ['drums','bass','other','vocals'][i] ?? `stem${i}`, url }));
  return [];
}

async function safeFetch(label, url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`${label} — network error: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} — HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  // 1. Create prediction
  const createRes = await safeFetch('Demucs create', `${BASE}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: DEMUCS_VERSION,
      input: { audio: audioUrl, model: 'htdemucs' },
    }),
  });

  const createData = await createRes.json().catch(e => { throw new Error(`Demucs create parse: ${e.message}`); });
  if (!createData.id) throw new Error(`Demucs create — no ID in response: ${JSON.stringify(createData)}`);

  // 2. Poll until done (6 min timeout)
  const deadline = Date.now() + 360_000;
  let pred;
  while (Date.now() < deadline) {
    await sleep(5000);
    const pollRes = await safeFetch('Demucs poll', `${BASE}/predictions/${createData.id}`);
    pred = await pollRes.json().catch(e => { throw new Error(`Demucs poll parse: ${e.message}`); });

    if (pred.status === 'succeeded') break;
    if (pred.status === 'failed')
      throw new Error(`Demucs prediction failed: ${pred.error || JSON.stringify(pred)}`);
  }

  if (!pred || pred.status !== 'succeeded')
    throw new Error('Demucs timed out after 6 minutes');

  // 3. Parse output
  const parsed = parseStemOutput(pred.output).filter(s => s.name.toLowerCase() !== 'vocals');
  if (!parsed.length)
    throw new Error(`Demucs no usable stems (raw output: ${JSON.stringify(pred.output)})`);

  // 4. Download stems
  onProgress?.('Downloading stems…');
  const downloaded = await Promise.all(
    parsed.map(async ({ name, url }) => {
      let blobUrl;
      try {
        blobUrl = await downloadAudio(url);
      } catch (err) {
        throw new Error(`Demucs download "${name}": ${err.message}`);
      }
      const key = name.toLowerCase();
      return {
        name: key.charAt(0).toUpperCase() + key.slice(1),
        color: STEM_COLORS[key]  || '#7eb8d4',
        volume: STEM_VOLUMES[key] || 0.75,
        audioUrl: blobUrl,
      };
    })
  );

  return downloaded;
}
