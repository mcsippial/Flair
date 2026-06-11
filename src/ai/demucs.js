import { sleep, pollPrediction, downloadAudio } from './musicGen';

const PROXY = 'https://flair-proxy.macsippial.workers.dev';
const BASE = `${PROXY}/v1`;

// ryan5453/demucs — outputs [{name, audio}] for each stem
const DEMUCS_VERSION = 'b26a4313b4d75983d60657f80dfa93b9beb354f6e4fa29ecd27ffe14d60117f6';

const STEM_COLORS = {
  drums: '#c4a882',
  bass:  '#6ba3c4',
  other: '#9b82c4',
  melody: '#9b82c4',
};

const STEM_VOLUMES = {
  drums: 0.85,
  bass:  0.82,
  other: 0.72,
  melody: 0.72,
};

export async function separateStems(audioUrl, onProgress) {
  onProgress?.('Separating stems…');

  const res = await fetch(`${BASE}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: DEMUCS_VERSION,
      input: {
        audio: audioUrl,
        model: 'htdemucs',
        stem: 'none',   // separate all stems
        mp3: true,
        mp3_bitrate: 320,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Demucs ${res.status}: ${text}`);
  }

  const { id } = await res.json();
  if (!id) throw new Error('Demucs returned no prediction ID');

  const pred = await pollPrediction(id, 360000); // 6 min timeout

  // Output is [{name, audio}] — filter out vocals for instrumental tracks
  const stems = (Array.isArray(pred.output) ? pred.output : [])
    .filter(s => s.name !== 'vocals');

  if (!stems.length) throw new Error('Demucs returned no stems');

  onProgress?.('Downloading stems…');

  // Download all stems in parallel
  const downloaded = await Promise.all(
    stems.map(async (stem) => {
      const blobUrl = await downloadAudio(stem.audio);
      const key = stem.name.toLowerCase();
      return {
        name: stem.name.charAt(0).toUpperCase() + stem.name.slice(1),
        color: STEM_COLORS[key] || '#7eb8d4',
        volume: STEM_VOLUMES[key] || 0.75,
        audioUrl: blobUrl,
      };
    })
  );

  return downloaded;
}
