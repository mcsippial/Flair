const PROXY = 'https://flair-proxy.macsippial.workers.dev';
const BASE = `${PROXY}/v1`;

const KEY_STORAGE = 'flair_replicate_key';

export function getReplicateKey() {
  return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_REPLICATE_API_KEY || null;
}

export function setReplicateKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// MusicGen stereo-large — pinned version ID from Replicate
const MUSICGEN_VERSION = '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';

async function createPrediction(prompt, durationSecs, attempt = 0) {
  const res = await fetch(`${BASE}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: MUSICGEN_VERSION,
      input: {
        prompt,
        duration: Math.min(Math.round(durationSecs), 30),
        output_format: 'mp3',
        normalization_strategy: 'loudness',
      },
    }),
  });

  if (res.status === 429) {
    if (attempt >= 5) throw new Error('Rate limited after 5 retries — try again in a minute');
    const body = await res.json().catch(() => ({}));
    const wait = ((body.retry_after || 15) + 2) * 1000;
    await sleep(wait);
    return createPrediction(prompt, durationSecs, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${res.status}: ${body}`);
  }

  return res.json();
}

export async function generateMusicClip(prompt, durationSecs = 30) {
  const { id } = await createPrediction(prompt, durationSecs);

  // Poll every 4s, up to 3 minutes
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const pollRes = await fetch(`${BASE}/predictions/${id}`);
    const pred = await pollRes.json();

    if (pred.status === 'succeeded') {
      const rawUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      const proxyUrl = `${PROXY}/download?url=${encodeURIComponent(rawUrl)}`;
      const blob = await fetch(proxyUrl).then(r => r.blob());
      return URL.createObjectURL(blob);
    }
    if (pred.status === 'failed') {
      throw new Error(pred.error || 'MusicGen generation failed');
    }
  }
  throw new Error('MusicGen timed out after 3 minutes');
}
