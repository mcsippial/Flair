import * as Tone from 'tone';

// Exports the edited arrangement to WAV by rendering offline — so trims,
// moves, fades, volume, pan and EQ are all baked into the output. Works on the
// audio (stem) tracks, which is what producers want to bounce.

const _decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
const _bufCache = new Map(); // audioUrl -> AudioBuffer

async function decode(url) {
  if (_bufCache.has(url)) return _bufCache.get(url);
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const buf = await _decodeCtx.decodeAudioData(arr);
  _bufCache.set(url, buf);
  return buf;
}

// Render the given audio tracks to a single WAV blob.
async function renderTracks(tracks, bpm) {
  const secPerBar = (60 / (bpm || 120)) * 4;

  // Predecode every clip's audio (offline Players need a ready buffer).
  const urls = [...new Set(tracks.flatMap(t => t.clips.map(c => c.audioUrl).filter(Boolean)))];
  const bufs = new Map();
  await Promise.all(urls.map(async u => bufs.set(u, await decode(u))));

  let endBars = 0;
  tracks.forEach(t => t.clips.forEach(c => {
    endBars = Math.max(endBars, (c.start || 0) + (c.length || 0));
  }));
  const duration = Math.max(1, endBars * secPerBar) + 0.5;

  const rendered = await Tone.Offline(() => {
    tracks.forEach(track => {
      const eq = new Tone.EQ3({
        low:  (track.eq?.low  || 0) * 12,
        mid:  (track.eq?.mid  || 0) * 12,
        high: (track.eq?.high || 0) * 12,
      });
      const panner = new Tone.Panner(track.pan || 0);
      const gain = new Tone.Gain(track.volume ?? 0.8);
      eq.connect(panner); panner.connect(gain); gain.toDestination();

      track.clips.forEach(clip => {
        const buf = bufs.get(clip.audioUrl);
        if (!buf) return;
        const player = new Tone.Player(buf);
        player.fadeIn  = clip.fadeIn  || 0;
        player.fadeOut = clip.fadeOut || 0;
        player.connect(eq);
        const startSec = (clip.start || 0) * secPerBar;
        const offset   = clip.offset || 0;
        const durSec   = (clip.length || 0) * secPerBar;
        player.start(startSec, offset, durSec);
      });
    });
  }, duration);

  return audioBufferToWav(rendered.get());
}

// Bounce the full mix (respects mute/solo).
export async function exportMix(session) {
  const anySolo = session.tracks.some(t => t.solo);
  const tracks = session.tracks.filter(t =>
    t.type === 'audio' && !t.muted && (!anySolo || t.solo));
  if (!tracks.length) throw new Error('No audio tracks to export');
  const wav = await renderTracks(tracks, session.bpm);
  download(wav, 'flair-mix.wav');
}

// Bounce each stem separately (one WAV per audio track).
export async function exportStems(session) {
  const tracks = session.tracks.filter(t => t.type === 'audio' && t.clips.length);
  if (!tracks.length) throw new Error('No stems to export');
  for (const track of tracks) {
    // Render this track alone at unity placement but keeping its own edits.
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

// Encode an AudioBuffer to a 16-bit PCM WAV Blob.
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
  view.setUint16(20, 1, true);            // PCM
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
