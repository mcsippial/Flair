import * as Tone from 'tone';
import { getTrackNodes, setTrackNodes, disposeAllTracks } from './audioEngine';
import { createDrumInstruments, createMidiInstrument } from './instruments';

let scheduledParts = [];

export function scheduleSession(tracks) {
  clearSchedule();
  disposeAllTracks();
  tracks.forEach(track => scheduleTrack(track));
}

export function scheduleTrack(track) {
  if (track.type === 'drum') {
    scheduleDrumTrack(track);
  } else if (track.type === 'midi' || track.type === 'ai') {
    scheduleMidiTrack(track);
  }
}

function scheduleDrumTrack(track) {
  const instruments = createDrumInstruments();
  const meter = new Tone.Meter();
  const nodes = { ...instruments, meter };
  setTrackNodes(track.id, nodes);
  const { kick, snare, hihat } = nodes;

  track.clips.forEach(clip => {
    const startTime = `${clip.start}m`;
    const part = new Tone.Part((time, note) => {
      if (note.drum === 'kick') kick.triggerAttackRelease('C1', '8n', time, note.velocity || 0.8);
      else if (note.drum === 'snare') snare.triggerAttackRelease('8n', time, note.velocity || 0.6);
      else if (note.drum === 'hihat') hihat.triggerAttackRelease('16n', time, note.velocity || 0.4);
    }, clip.notes || []);
    part.start(startTime);
    part.loop = true;
    part.loopEnd = `${clip.length}m`;
    scheduledParts.push(part);
  });
}

function scheduleMidiTrack(track) {
  const preset = track.instrument || 'keys';
  const synth = createMidiInstrument(preset);
  const meter = new Tone.Meter();
  const nodes = { synth, meter };
  setTrackNodes(track.id, nodes);

  track.clips.forEach(clip => {
    if (!clip.notes || clip.notes.length === 0) return;
    const startTime = `${clip.start}m`;
    const events = clip.notes.map(n => {
      let t = n.time;
      if (typeof t === 'number') {
        const bar = Math.floor(t / 4);
        const beat = Math.floor(t % 4);
        const sixteenth = Math.round((t % 1) * 4);
        t = `${bar}:${beat}:${sixteenth}`;
      }
      return [t, n];
    });
    const part = new Tone.Part((time, note) => {
      synth.triggerAttackRelease(note.note, note.duration || '8n', time, note.velocity || 0.7);
    }, events);
    part.start(startTime);
    part.loop = true;
    part.loopEnd = `${clip.length}m`;
    scheduledParts.push(part);
  });
}

export function clearSchedule() {
  scheduledParts.forEach(p => { try { p.stop(); p.dispose(); } catch(e) {} });
  scheduledParts = [];
}
