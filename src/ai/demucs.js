import { pollPrediction, downloadAudio } from './musicGen';

const BASE = 'https://flair-proxy.macsippial.workers.dev';

const STEM_COLORS  = { drums: '#c4a882', bass: '#6ba3c4', other: '#9b82c4', vocals: '#82c49b', guitar: '#82b8c4', piano: '#c482c4' };
const STEM_VOLUMES = { drums: 0.85,      bass: 0.82,      other: 0.72,      vocals: 0.68,      guitar: 0.70,      piano: 0.70 };

function parseStemOutput(output) {
  if (!output) return [];
  if (Array.isArray(output) && output[0]?.audio)
    return output.map(s => ({ name: s.name, url: s.audio }));
  if (!Array.isArray(output) && typeof output === 'object')
    return Object.entries(output).map(([name, url]) => ({ name, url }));
  if (Array.isArray(output) && typeof output[0] === 'string')
    return output.map((url, i) => ({ name: ['drums','bass','other','vocals'][i] ?? `stem${i}`, url }));
  return [];
}

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  // Use the model endpoint — always runs the latest deployed version, no hash needed.
  // The Worker proxies /models/... → https://api.replicate.com/models/...
  let createRes;
  try {
    createRes = await fetch(`${BASE}/v1/models/ryan5453/demucs/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

  // Poll with 8 min timeout (cold starts on shared GPUs can be slow)
  const pred = await pollPrediction(createData.id, 480000);

  const parsed = parseStemOutput(pred.output).filter(s => s.name.toLowerCase() !== 'vocals');
  if (!parsed.length)
    throw new Error(`Demucs no usable stems (raw output: ${JSON.stringify(pred.output)})`);

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

