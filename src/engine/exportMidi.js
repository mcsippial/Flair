/**
 * Minimal MIDI file writer — no external deps.
 * Exports all MIDI/synth clips from the session as a single Type-1 SMF.
 */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function noteNameToMidi(name) {
  if (!name) return 60;
  const match = name.match(/^([A-G]#?)(\d+)$/);
  if (!match) return 60;
  const idx = NOTE_NAMES.indexOf(match[1]);
  const oct = parseInt(match[2]);
  return (oct + 1) * 12 + idx;
}

function timeStringToTicks(timeStr, ppq) {
  if (!timeStr) return 0;
  const [bar = 0, beat = 0, tick = 0] = String(timeStr).split(':').map(Number);
  return Math.round((bar * 4 + beat + tick / 96) * ppq);
}

const DUR_BEATS = { '1n': 4, '2n': 2, '4n': 1, '8n': 0.5, '16n': 0.25, '32n': 0.125 };
function durationToTicks(dur, ppq) {
  const beats = typeof dur === 'number' ? dur * 4 : (DUR_BEATS[dur] ?? 1);
  return Math.round(beats * ppq);
}

function varLen(v) {
  const out = [];
  out.push(v & 0x7f);
  v >>= 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
  return out;
}

function writeUint32(v) {
  return [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
function writeUint16(v) { return [(v >> 8) & 0xff, v & 0xff]; }

function buildTempoEvent(bpm) {
  const uspb = Math.round(60_000_000 / bpm);
  return [0x00, 0xff, 0x51, 0x03, (uspb >> 16) & 0xff, (uspb >> 8) & 0xff, uspb & 0xff];
}

function buildTrackChunk(events) {
  // events: [{tick, data: [bytes]}]
  events.sort((a, b) => a.tick - b.tick);
  const bytes = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    bytes.push(...varLen(delta), ...ev.data);
  }
  // End of track
  bytes.push(0x00, 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x72, 0x6b, ...writeUint32(bytes.length)];
  return [...header, ...bytes];
}

export function exportSessionMidi(session) {
  const PPQ = 480;
  const bpm = session.bpm || 120;

  const midiTracks = session.tracks.filter(t =>
    (t.type === 'midi' || t.type === 'synth') && t.clips.some(c => c.notes?.length)
  );

  if (midiTracks.length === 0) {
    alert('No MIDI tracks with notes to export.');
    return;
  }

  // Track 0: tempo map
  const tempoTrack = buildTrackChunk([{ tick: 0, data: buildTempoEvent(bpm) }]);

  // One MIDI track per session track
  const trackChunks = midiTracks.map((track, idx) => {
    const ch = idx % 16;
    const events = [];

    // Track name meta event
    const nameBytes = Array.from(track.name).map(c => c.charCodeAt(0));
    events.push({ tick: 0, data: [0xff, 0x03, nameBytes.length, ...nameBytes] });

    for (const clip of track.clips) {
      const clipOffset = Math.round((clip.start || 0) * 4 * PPQ);
      for (const note of (clip.notes || [])) {
        const startTick = clipOffset + timeStringToTicks(note.time, PPQ);
        const durTicks  = durationToTicks(note.duration, PPQ);
        const pitch     = noteNameToMidi(note.note);
        const vel       = Math.round((note.velocity ?? 0.8) * 127);

        events.push({ tick: startTick,              data: [0x90 | ch, pitch, vel] });
        events.push({ tick: startTick + durTicks,   data: [0x80 | ch, pitch, 0] });
      }
    }

    return buildTrackChunk(events);
  });

  const numTracks = 1 + trackChunks.length;
  const header = [
    0x4d, 0x54, 0x68, 0x64,  // MThd
    ...writeUint32(6),
    ...writeUint16(1),         // Type 1
    ...writeUint16(numTracks),
    ...writeUint16(PPQ),
  ];

  const allBytes = new Uint8Array([...header, ...tempoTrack, ...trackChunks.flat()]);
  const blob = new Blob([allBytes], { type: 'audio/midi' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flair-export.mid';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
