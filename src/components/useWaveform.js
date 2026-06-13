import { useState, useEffect } from 'react';

// Decodes an audio URL into normalized peak data so clips render a REAL waveform
// (drums look spiky, bass smooth, etc.) instead of a generic block. Results are
// cached per URL — decoding is expensive and stems never change once loaded.
const cache = new Map(); // url -> { peaks: Float32Array, duration: number }
const pending = new Map(); // url -> Promise

let _ctx;
function audioCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

async function computePeaks(url, buckets) {
  if (cache.has(url)) return cache.get(url);
  if (pending.has(url)) return pending.get(url);

  const job = (async () => {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const audio = await audioCtx().decodeAudioData(arr);
    const ch = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / buckets));
    const peaks = new Float32Array(buckets);
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const s = i * block;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(ch[s + j] || 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    // Normalize to the loudest peak so quiet stems are still visible.
    let peak = 0;
    for (const v of peaks) if (v > peak) peak = v;
    if (peak > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= peak;

    const result = { peaks, duration: audio.duration };
    cache.set(url, result);
    pending.delete(url);
    return result;
  })().catch(err => { pending.delete(url); throw err; });

  pending.set(url, job);
  return job;
}

// Returns { peaks, duration } once decoded, or null while loading/on failure.
export function useWaveform(url, buckets = 280) {
  const [data, setData] = useState(() => cache.get(url) || null);
  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { setData(cache.get(url)); return; }
    let alive = true;
    computePeaks(url, buckets)
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [url, buckets]);
  return data;
}
