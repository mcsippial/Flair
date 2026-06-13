// Exports the arrangement to WAV by rendering with OfflineAudioContext — all
// trims, fades, volume and pan are baked in. Works on audio (stem) tracks only.

const _decodeCache = new Map(); // url → AudioBuffer

async function decodeCached(url) {
  if (_decodeCache.has(url)) return _decodeCache.get(url);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  ctx.close();
  _decodeCache.set(url, buf);
  return buf;
}

async function renderTracks(tracks, bpm) {
  const secPerBar = (60 / (bpm || 120)) * 4;

  const urls = [...new Set(tracks.flatMap(t => t.clips.map(c => c.audioUrl).filter(Boolean)))];
  if (!urls.length) throw new Error('No audio clips to export');

  const bufs = new Map();
  await Promise.all(urls.map(async u => bufs.set(u, await decodeCached(u))));

  let endBars = 0;
  tracks.forEach(t => t.clips.forEach(c => {
    endBars = Math.max(endBars, (c.start || 0) + (c.length || 0));
  }));
  const durationSec = Math.max(1, endBars * secPerBar) + 0.5;

  const sampleRate = 44100;
  const numChannels = 2;
  const offline = new OfflineAudioContext(numChannels, Math.ceil(durationSec * sampleRate), sampleRate);

  tracks.forEach(track => {
    const gainNode = offline.createGain();
    gainNode.gain.value = track.volume ?? 0.8;

    const panNode = offline.createStereoPanner();
    panNode.pan.value = track.pan || 0;

    gainNode.connect(panNode);
    panNode.connect(offline.destination);

    track.clips.forEach(clip => {
      const buf = bufs.get(clip.audioUrl);
      if (!buf) return;

      const src = offline.createBufferSource();
      src.buffer = buf;

      const startSec = (clip.start || 0) * secPerBar;
      const offset = clip.offset || 0;
      const durSec = (clip.length || 0) * secPerBar;

      // Fade in/out via gain envelope
      if ((clip.fadeIn || 0) > 0 || (clip.fadeOut || 0) > 0) {
        const clipGain = offline.createGain();
        clipGain.gain.value = 1;
        if ((clip.fadeIn || 0) > 0) {
          clipGain.gain.setValueAtTime(0, startSec);
          clipGain.gain.linearRampToValueAtTime(1, startSec + clip.fadeIn);
        }
        if ((clip.fadeOut || 0) > 0) {
          const fadeStart = startSec + durSec - clip.fadeOut;
          clipGain.gain.setValueAtTime(1, fadeStart);
          clipGain.gain.linearRampToValueAtTime(0, startSec + durSec);
        }
        src.connect(clipGain);
        clipGain.connect(gainNode);
      } else {
        src.connect(gainNode);
      }

      src.start(startSec, offset, durSec);
    });
  });

  const rendered = await offline.startRendering();
  return audioBufferToWav(rendered);
}

export async function exportMix(session) {
  const anySolo = session.tracks.some(t => t.solo);
  const tracks = session.tracks.filter(t =>
    t.type === 'audio' && !t.muted && (!anySolo || t.solo) && t.clips.length);
  if (!tracks.length) throw new Error('No active audio tracks to export');
  const wav = await renderTracks(tracks, session.bpm);
  download(wav, 'flair-mix.wav');
}

export async function exportStems(session) {
  const tracks = session.tracks.filter(t => t.type === 'audio' && t.clips.length);
  if (!tracks.length) throw new Error('No stems to export');
  for (const track of tracks) {
    const wav = await renderTracks([{ ...track, muted: false, solo: false }], session.bpm);
    const safe = String(track.name || 'stem').replace(/[^\w]+/g, '_');
    download(wav, `flair-${safe}.wav`);
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
