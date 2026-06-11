import { pollPrediction, downloadAudio } from './musicGen';

const BASE = 'https://flair-proxy.macsippial.workers.dev/v1';

const DEMUCS_VERSION = 'b26a4313b4d75983d60657f80dfa93b9beb354f6e4fa29ecd27ffe14d60117f6';

const STEM_COLORS = {
  drums:  '#c4a882',
  bass:   '#6ba3c4',
  other:  '#9b82c4',
  vocals: '#82c49b',
};

const STEM_VOLUMES = {
  drums:  0.85,
  bass:   0.82,
  other:  0.72,
  vocals: 0.68,
};

// Normalise whatever Demucs returns into [{name, audioUrl}]
function parseStemOutput(output) {
  if (!output) return [];

  // Format A: [{name, audio}]  (ryan5453/demucs)
  if (Array.isArray(output) && output[0]?.audio) {
    return output.map(s => ({ name: s.name, url: s.audio }));
  }

  // Format B: {drums: url, bass: url, …}
  if (!Array.isArray(output) && typeof output === 'object') {
    return Object.entries(output).map(([name, url]) => ({ name, url }));
  }

  // Format C: plain array of URLs — map to standard stem names in order
  if (Array.isArray(output) && typeof output[0] === 'string') {
    const names = ['drums', 'bass', 'other', 'vocals'];
    return output.map((url, i) => ({ name: names[i] ?? `stem${i}`, url }));
  }

  return [];
}

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  let res;
  try {
    res = await fetch(`${BASE}/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: {
          audio: audioUrl,
          model: 'htdemucs',
        },
      }),
    });
  } catch (err) {
    throw new Error(`Demucs network error creating prediction: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Demucs ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error(`Demucs returned no prediction ID: ${JSON.stringify(data)}`);

  const pred = await pollPrediction(data.id, 360000);

  const parsed = parseStemOutput(pred.output)
    .filter(s => s.name.toLowerCase() !== 'vocals');

  if (!parsed.length) {
    throw new Error(`Demucs returned no stems (raw output: ${JSON.stringify(pred.output)})`);
  }

  onProgress?.('Downloading stems…');

  const downloaded = await Promise.all(
    parsed.map(async ({ name, url }) => {
      const blobUrl = await downloadAudio(url);
      const key = name.toLowerCase();
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      return {
        name: label,
        color: STEM_COLORS[key] || '#7eb8d4',
        volume: STEM_VOLUMES[key] || 0.75,
        audioUrl: blobUrl,
      };
    })
  );

  return downloaded;
}
