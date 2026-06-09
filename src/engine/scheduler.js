import * as Tone from 'tone';
import { getTrackNodes, setTrackNodes, disposeAllTracks, disposeTrack,
         getMasterGain, getMasterReverb, getMasterDelay } from './audioEngine';
import { createDrumInstruments, createMidiInstrument } from './instruments';

let scheduledParts = [];

export function scheduleSession(tracks) {
  clearSchedule();
  disposeAllTracks();
  tracks.forEach(track => scheduleTrack(track));
}

export function scheduleTrack(track) {
  if (track.type === 'drum')                    scheduleDrumTrack(track);
  else if (track.type === 'midi' || track.type === 'ai') scheduleMidiTrack(track);
  else if (track.type === 'audio')              scheduleAudioTrack(track);
}

// ─── Per-track FX chain ───────────────────────────────────────────────────────
function buildFxChain(track) {
  const masterDest = getMasterGain() || Tone.getDestination();
  const eq = new Tone.EQ3({
    low:  (track.eq?.low  || 0) * 12,
    mid:  (track.eq?.mid  || 0) * 12,
    high: (track.eq?.high || 0) * 12,
  });
  const panner     = new Tone.Panner(track.pan || 0);
  const send_reverb = new Tone.Gain(track.reverb || 0);
  const send_delay  = new Tone.Gain(track.delay  || 0);

  panner.connect(masterDest);
  eq.connect(panner);
  if (getMasterReverb()) send_reverb.connect(getMasterReverb());
  if (getMasterDelay())  send_delay.connect(getMasterDelay());
  eq.connect(send_reverb);
  eq.connect(send_delay);

  return { eq, panner, send_reverb, send_delay, input: eq };
}

// ─── Drum track ───────────────────────────────────────────────────────────────
function scheduleDrumTrack(track) {
  const instruments = createDrumInstruments();
  const fx = buildFxChain(track);
  const meter = new Tone.Meter();

  instruments.kick.disconnect();
  instruments.snare.disconnect();
  instruments.hihat.disconnect();
  instruments.kick.connect(fx.input);
  instruments.snare.connect(fx.input);
  instruments.hihat.connect(fx.input);
  instruments.kick.connect(meter);

  setTrackNodes(track.id, { ...instruments, meter, ...fx });
  const { kick, snare, hihat } = instruments;

  track.clips.forEach(clip => {
    const part = new Tone.Part((time, note) => {
      if      (note.drum === 'kick')  kick.triggerAttackRelease('C1', '8n', time, note.velocity || 0.8);
      else if (note.drum === 'snare') snare.triggerAttackRelease('8n', time, note.velocity || 0.6);
      else if (note.drum === 'hihat') hihat.triggerAttackRelease('16n', time, note.velocity || 0.4);
    }, clip.notes || []);
    part.start(`${clip.start}m`);
    part.loop = true;
    part.loopEnd = `${clip.length}m`;
    scheduledParts.push(part);
  });
}

// ─── MIDI track ───────────────────────────────────────────────────────────────
function scheduleMidiTrack(track) {
  const synth = createMidiInstrument(track.instrument || 'keys');
  const fx = buildFxChain(track);
  const meter = new Tone.Meter();

  synth.disconnect();
  synth.connect(fx.input);
  synth.connect(meter);

  setTrackNodes(track.id, { synth, meter, ...fx });

  track.clips.forEach(clip => {
    if (!clip.notes?.length) return;
    const events = clip.notes.map(n => {
      let t = n.time;
      if (typeof t === 'number') {
        const bar      = Math.floor(t / 4);
        const beat     = Math.floor(t % 4);
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

// ─── Audio track (recorded clips) ────────────────────────────────────────────
function scheduleAudioTrack(track) {
  const fx = buildFxChain(track);
  const meter = new Tone.Meter();
  const players = [];

  track.clips.forEach(clip => {
    if (!clip.audioUrl) return;
    const player = new Tone.Player({ url: clip.audioUrl, loop: false });
    player.disconnect();
    player.connect(fx.input);
    player.connect(meter);
    players.push(player);

    // Schedule a one-shot trigger at the clip's bar offset. Tone.Transport
    // handles looping at the session level — we must NOT use a looping Part
    // here or player.start() fires every iteration and players stack.
    Tone.loaded().then(() => {
      const eventId = Tone.Transport.schedule(time => {
        // Stop any prior playback of this player before re-triggering
        try { player.stop(time); } catch (_) {}
        player.start(time);
      }, `${clip.start}m`);
      scheduledParts.push({ stop: () => Tone.Transport.clear(eventId), dispose: () => {} });
    });
  });

  setTrackNodes(track.id, { players, meter, ...fx });
}

export function clearSchedule() {
  scheduledParts.forEach(p => { try { p.stop(); p.dispose(); } catch(e) {} });
  scheduledParts = [];
}
