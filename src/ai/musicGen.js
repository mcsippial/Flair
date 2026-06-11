// When VITE_PROXY_URL is set (Cloudflare Worker), all Replicate calls go through
// it so the browser never hits api.replicate.com directly (CORS blocked).
// Without a proxy URL, the key is sent from the browser — local dev only.
const PROXY = import.meta.env.VITE_PROXY_URL;
const DIRECT = 'https://api.replicate.com';
const BASE = PROXY ? PROXY.replace(/\/$/, '') : `${DIRECT}/v1`;

const KEY_STORAGE = 'flair_replicate_key';

export function getReplicateKey() {
  return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_REPLICATE_API_KEY || null;
}

export function setReplicateKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function authHeaders() {
  // Proxy handles auth server-side; direct calls need the key from the client
  if (PROXY) return {};
  const key = getReplicateKey();
  return key ? { 'Authorization': `Token ${key}` } : {};
}

export async function generateMusicClip(prompt, durationSecs = 30) {
  if (!PROXY && !getReplicateKey()) throw new Error('No Replicate API key');

  const createRes = await fetch(`${BASE}/models/meta/musicgen/predictions`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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

  // Poll every 4s, up to 3 minutes
  for (let i = 0; i < 45; i++) {
    await sleep(4000);
    const pollRes = await fetch(`${BASE}/predictions/${id}`, {
      headers: authHeaders(),
    });
    const pred = await pollRes.json();

    if (pred.status === 'succeeded') {
      const blob = await fetch(pred.output).then(r => r.blob());
      return URL.createObjectURL(blob);
    }
    if (pred.status === 'failed') {
      throw new Error(pred.error || 'MusicGen generation failed');
    }
  }
  throw new Error('MusicGen timed out after 3 minutes');
}
