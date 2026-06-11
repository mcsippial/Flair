import { pollPrediction, downloadAudio } from './musicGen';

const BASE = 'https://flair-proxy.macsippial.workers.dev/v1';

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

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  // 1. Create prediction
  let createRes;
  try {
    createRes = await fetch(`${BASE}/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: { audio: audioUrl, model: 'htdemucs' },
      }),
    });
  } catch (err) {
    throw new Error(`Demucs create — network error: ${err.message}`);
  }
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(`Demucs create — HTTP ${createRes.status}: ${body.slice(0, 300)}`);
  }

  const createData = await createRes.json();
  if (!createData.id) throw new Error(`Demucs create — no ID: ${JSON.stringify(createData)}`);

  // 2. Poll (resilient to transient blips, 6 min timeout)
  const pred = await pollPrediction(createData.id, 360000);

  // 3. Parse output
  const parsed = parseStemOutput(pred.output).filter(s => s.name.toLowerCase() !== 'vocals');
  if (!parsed.length)
    throw new Error(`Demucs no usable stems (raw output: ${JSON.stringify(pred.output)})`);

  // 4. Download stems in parallel
  onProgress?.('Downloading stems…');
  return Promise.all(
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
}
