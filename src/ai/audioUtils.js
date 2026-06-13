// Small audio helpers shared across the AI pipeline.
const PROXY = 'https://flair-proxy.macsippial.workers.dev';

// Download an audio URL through the Worker proxy and return a blob URL the
// DAW can play offline (avoids cross-origin CDN issues).
export async function downloadAudio(rawUrl) {
  if (!rawUrl) throw new Error('downloadAudio called with null/empty URL');
  const res = await fetch(`${PROXY}/download?url=${encodeURIComponent(rawUrl)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`download ${res.status}: ${body.slice(0, 200)} [url: ${String(rawUrl).slice(0, 80)}]`);
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('Audio download returned empty file');
  return URL.createObjectURL(blob);
}

// Read the real duration (seconds) of an audio blob/URL via a detached element.
export function getAudioDuration(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => reject(new Error('Could not read audio duration'));
    audio.src = url;
  });
}
