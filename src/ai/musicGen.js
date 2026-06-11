const BASE = 'https://api.replicate.com/v1';
const KEY_STORAGE = 'flair_replicate_key';

export function getReplicateKey() {
  return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_REPLICATE_API_KEY || null;
}

export function setReplicateKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Generate music via Replicate MusicGen stereo-large.
// Returns a local blob URL (avoids any CORS issues with CDN playback).
export async function generateMusicClip(prompt, durationSecs = 30) {
  const key = getReplicateKey();
  if (!key) throw new Error('No Replicate API key');

  // Create prediction
  const createRes = await fetch(`${BASE}/models/meta/musicgen/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        model_version: 'stereo-large',
        prompt,
        duration: Math.min(Math.round(durationSecs), 30),
        output_format: 'mp3',
        normalization_strategy: 'loudness',
      },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Replicate ${createRes.status}: ${body}`);
  }

  const { id } = await createRes.json();

  // Poll every 4 s, up to 3 minutes
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const pollRes = await fetch(`${BASE}/predictions/${id}`, {
      headers: { 'Authorization': `Token ${key}` },
    });
    const pred = await pollRes.json();

    if (pred.status === 'succeeded') {
      const audioUrl = pred.output;
      // Download and convert to blob URL so Tone.Player can load it without CORS
      const blob = await fetch(audioUrl).then(r => r.blob());
      return URL.createObjectURL(blob);
    }
    if (pred.status === 'failed') {
      throw new Error(pred.error || 'MusicGen generation failed');
    }
  }
  throw new Error('MusicGen timed out after 3 minutes');
}
