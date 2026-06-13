import { pollPrediction, downloadAudio } from './musicGen';

const BASE = 'https://flair-proxy.macsippial.workers.dev';

const STEM_COLORS  = { drums: '#c4a882', bass: '#6ba3c4', other: '#9b82c4', vocals: '#82c49b', guitar: '#82b8c4', piano: '#c482c4' };
const STEM_VOLUMES = { drums: 0.85,      bass: 0.82,      other: 0.72,      vocals: 0.68,      guitar: 0.70,      piano: 0.70 };

function parseStemOutput(output) {
  if (!output) return [];
  let stems = [];
  if (Array.isArray(output) && output[0]?.audio)
    stems = output.map(s => ({ name: s.name, url: s.audio }));
  else if (!Array.isArray(output) && typeof output === 'object')
    stems = Object.entries(output).map(([name, url]) => ({ name, url }));
  else if (Array.isArray(output) && typeof output[0] === 'string')
    stems = output.map((url, i) => ({ name: ['drums','bass','other','vocals','guitar','piano'][i] ?? `stem${i}`, url }));
  // Drop vocals and any stem with a null/empty URL
  return stems.filter(s => s.url && s.name.toLowerCase() !== 'vocals');
}

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  // Use the model endpoint — always runs the latest deployed version, no hash needed.
  // The Worker proxies /models/... → https://api.replicate.com/models/...
  let createRes;
  try {
    createRes = await fetch(`${BASE}/v1/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953',
        // htdemucs_6s = 6-source model: drums, bass, other, vocals, guitar, piano.
        // Gives more granular, individually-labeled stems than the 4-source default.
        input: { audio: audioUrl, model: 'htdemucs_6s' },
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
  const pred = await pollPrediction(createData.id, 600000);

  const parsed = parseStemOutput(pred.output);
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

