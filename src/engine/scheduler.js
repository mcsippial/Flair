import * as Tone from 'tone';
import { getTrackNodes, setTrackNodes, disposeAllTracks, getMasterGain, getMasterReverb, getMasterDelay } from './audioEngine';
import { createDrumInstruments, createMidiInstrument } from './instruments';

let scheduledParts = [];

export function scheduleSession(tracks) {
  clearSchedule();
  disposeAllTracks();
  tracks.forEach(track => scheduleTrack(track));
}

export function scheduleTrack(track) {
  if (track.type === 'drum') scheduleDrumTrack(track);
  else if (track.type === 'midi' || track.type === 'ai') scheduleMidiTrack(track);
}

function buildFxChain(track) {
  const dest = getMasterGain() || Tone.getDestination();
  const eq = new Tone.EQ3({ low: (track.eq?.low || 0) * 12, mid: (track.eq?.mid || 0) * 12, high: (track.eq?.high || 0) * 12 });
  const panner = new Tone.Panner(track.pan || 0);
  const send_reverb = new Tone.Gain(track.reverb || 0);
  const send_delay  = new Tone.Gain(track.delay  || 0);

  // chain: instrument → eq → panner → master gain
  panner.connect(dest);
  eq.connect(panner);
  // parallel sends to reverb/delay buses
  if (getMasterReverb()) send_reverb.connect(getMasterReverb());
  if (getMasterDelay())  send_delay.connect(getMasterDelay());
  eq.connect(send_reverb);
  eq.connect(send_delay);

  return { eq, panner, send_reverb, send_delay, input: eq };
}

function scheduleDrumTrack(track) {
  const instruments = createDrumInstruments();
  const fx = buildFxChain(track);
  const meter = new Tone.Meter();

  // reconnect instruments to eq instead of direct destination
  instruments.kick.disconnect();
  instruments.snare.disconnect();
  instruments.hihat.disconnect();
  instruments.kick.connect(fx.input);
  instruments.snare.connect(fx.input);
  instruments.hihat.connect(fx.input);
  instruments.kick.connect(meter);

  const nodes = { ...instruments, meter, ...fx };
  setTrackNodes(track.id, nodes);
  const { kick, snare, hihat } = nodes;

  track.clips.forEach(clip => {
    const part = new Tone.Part((time, note) => {
      if (note.drum === 'kick')   kick.triggerAttackRelease('C1', '8n', time, note.velocity || 0.8);
      else if (note.drum === 'snare') snare.triggerAttackRelease('8n', time, note.velocity || 0.6);
      else if (note.drum === 'hihat') hihat.triggerAttackRelease('16n', time, note.velocity || 0.4);
    }, clip.notes || []);
    part.start(`${clip.start}m`);
    part.loop = true;
    part.loopEnd = `${clip.length}m`;
    scheduledParts.push(part);
  });
}

function scheduleMidiTrack(track) {
  const synth = createMidiInstrument(track.instrument || 'keys');
  const fx = buildFxChain(track);
  const meter = new Tone.Meter();

  synth.disconnect();
  synth.connect(fx.input);
  synth.connect(meter);

  const nodes = { synth, meter, ...fx };
  setTrackNodes(track.id, nodes);

  track.clips.forEach(clip => {
    if (!clip.notes?.length) return;
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
    part.start(`${clip.start}m`);
    part.loop = true;
    part.loopEnd = `${clip.length}m`;
    scheduledParts.push(part);
  });
}

export function clearSchedule() {
  scheduledParts.forEach(p => { try { p.stop(); p.dispose(); } catch(e) {} });
  scheduledParts = [];
}
