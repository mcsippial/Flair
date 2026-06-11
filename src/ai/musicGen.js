const PROXY = 'https://flair-proxy.macsippial.workers.dev';
const BASE = `${PROXY}/v1`;

const KEY_STORAGE = 'flair_replicate_key';

export function getReplicateKey() {
  return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_REPLICATE_API_KEY || null;
}

export function setReplicateKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createPrediction(body, attempt = 0) {
  const res = await fetch(`${BASE}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    if (attempt >= 5) throw new Error('Rate limited after 5 retries — try again in a minute');
    const data = await res.json().catch(() => ({}));
    await sleep(((data.retry_after || 15) + 2) * 1000);
    return createPrediction(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error(`Replicate returned no prediction ID: ${JSON.stringify(data)}`);
  return data;
}

export async function pollPrediction(id, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(4000);
    const res = await fetch(`${BASE}/predictions/${id}`);
    const pred = await res.json();
    if (pred.status === 'succeeded') return pred;
    if (pred.status === 'failed') throw new Error(`Prediction failed: ${pred.error || JSON.stringify(pred)}`);
  }
  throw new Error('Prediction timed out');
}

export async function downloadAudio(rawUrl) {
  const proxyUrl = `${PROXY}/download?url=${encodeURIComponent(rawUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Audio download failed: ${res.status}`);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('Audio download returned empty file');
  return URL.createObjectURL(blob);
}

// Returns the raw Replicate CDN URL (needed for Demucs input)
export async function generateMusicUrl(prompt, durationSecs = 30) {
  const { id } = await createPrediction({
    version: '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
    input: {
      prompt,
      model_version: 'stereo-large',
      duration: Math.min(Math.round(durationSecs), 30),
      output_format: 'mp3',
      normalization_strategy: 'loudness',
    },
  });

  const pred = await pollPrediction(id);
  const rawUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!rawUrl) throw new Error(`MusicGen returned no audio URL`);
  return rawUrl;
}

// Convenience: generate and immediately download to a blob URL
export async function generateMusicClip(prompt, durationSecs = 30) {
  const rawUrl = await generateMusicUrl(prompt, durationSecs);
  return downloadAudio(rawUrl);
}
