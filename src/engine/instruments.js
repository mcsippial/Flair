import * as Tone from 'tone';
import { getMasterGain } from './audioEngine';

function dest() { return getMasterGain() || Tone.getDestination(); }

// ─── Bass — MonoSynth (designed for bass: built-in filter + filterEnvelope) ───
// Sounds like a plucked electric bass / subby synth bass
function makeBass() {
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope:   { attack: 0.01, decay: 0.25, sustain: 0.55, release: 1.2 },
    filter:     { Q: 2.5, frequency: 300, rolloff: -24, type: 'lowpass' },
    filterEnvelope: {
      attack: 0.01, decay: 0.18, sustain: 0.4, release: 1,
      baseFrequency: 180, octaves: 3, exponent: 2,
    },
    volume: -14,
  });
  bass.connect(dest());
  return bass;
}

// ─── Pad — PolySynth with gentle harmonics, chorus ───────────────────────────
export function makePad() {
  const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 4, depth: 0.45, wet: 0.4 }).start();
  const filter  = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -12 });
  const synth   = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },  // warm, organ-like harmonics
    envelope:   { attack: 0.65, decay: 0.4, sustain: 0.8, release: 3.5 },
    volume: -20,
  });
  synth.connect(filter);
  filter.connect(chorus);
  // scheduler connects chorus (_padFilter) into the FX chain — don't pre-connect to dest()
  synth._padFilter = chorus;
  synth._padChorus = chorus;
  return synth;
}

// ─── Keys / Piano — PolySynth fallback + Salamander sample upgrade ───────────
// Returns a proxy that transparently upgrades to real piano samples when loaded.
const PIANO_URLS = {
  A0:'A0.mp3', C1:'C1.mp3', F1:'F1.mp3', A1:'A1.mp3',
  C2:'C2.mp3', F2:'F2.mp3', A2:'A2.mp3', C3:'C3.mp3',
  F3:'F3.mp3', A3:'A3.mp3', C4:'C4.mp3', F4:'F4.mp3',
  A4:'A4.mp3', C5:'C5.mp3', F5:'F5.mp3', A5:'A5.mp3',
  C6:'C6.mp3', F6:'F6.mp3', A6:'A6.mp3', C7:'C7.mp3',
};
const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

function makeKeys() {
  // Immediate synth — sounds like a bright Rhodes/electric piano
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope:   { attack: 0.002, decay: 1.8, sustain: 0.08, release: 2.2 },
    volume: -18,
  });
  synth.connect(dest());

  let active = synth;

  // Upgrade to Salamander Grand Piano when it loads
  const sampler = new Tone.Sampler({
    urls: PIANO_URLS,
    baseUrl: SALAMANDER_BASE,
    release: 1.2,
    onload: () => {
      try { synth.disconnect(); } catch(_) {}
      sampler.connect(dest());
      active = sampler;
    },
    onerror: () => {}, // stay on synth
  });

  return {
    get volume()  { return active.volume; },
    triggerAttackRelease: (...args) => active.triggerAttackRelease(...args),
    triggerRelease: (...args) => { try { active.triggerRelease?.(...args); } catch(_) {} },
    connect:    (d) => active.connect(d),
    disconnect: ()  => { try { active.disconnect(); } catch(_) {} },
    dispose:    ()  => {
      try { synth.dispose(); }   catch(_) {}
      try { sampler.dispose(); } catch(_) {}
    },
    set:  (o) => { try { active.set?.(o); } catch(_) {} },
  };
}

// ─── Lead — MonoSynth, bright synth lead ─────────────────────────────────────
function makeLead() {
  const lead = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    envelope:   { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.5 },
    filter:     { Q: 1, frequency: 2000, rolloff: -12, type: 'lowpass' },
    filterEnvelope: {
      attack: 0.04, decay: 0.2, sustain: 0.6, release: 0.4,
      baseFrequency: 800, octaves: 2,
    },
    volume: -18,
  });
  lead.connect(dest());
  return lead;
}

export function createMidiInstrument(preset = 'keys') {
  switch (preset) {
    case 'bass':  return makeBass();
    case 'lead':  return makeLead();
    case 'pad':   return makePad();
    case 'keys':
    default:      return makeKeys();
  }
}

// ─── Drums ────────────────────────────────────────────────────────────────────
// buildSynthKit: synthesized fallback — always available immediately

function buildSynthKit(destination) {
  // Kick: MembraneSynth + Chebyshev saturation for punch
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.1,
    octaves: 10,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.18 },
    volume: 4,
  });
  const kickDist = new Tone.Chebyshev(3);
  const kickGain = new Tone.Gain(0.7);
  kick.connect(kickDist);
  kickDist.connect(destination);
  kick.connect(kickGain);
  kickGain.connect(destination); // dry blend

  // Snare: bandpass noise crack + tonal body
  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
    volume: 2,
  });
  const snareBPF   = new Tone.Filter({ frequency: 4500, Q: 0.8, type: 'bandpass' });
  const snareBody  = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
    volume: -10,
  });
  const snareMerge = new Tone.Gain(1);
  snareNoise.connect(snareBPF);
  snareBPF.connect(snareMerge);
  snareBody.connect(snareMerge);
  snareMerge.connect(destination);

  // Hihat: high-pass noise, very short
  const hihat    = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.055, sustain: 0, release: 0.01 },
    volume: -8,
  });
  const hihatHPF = new Tone.Filter({ frequency: 10000, type: 'highpass', rolloff: -24 });
  hihat.connect(hihatHPF);
  hihatHPF.connect(destination);

  return {
    triggerKick:  (time, vel) => kick.triggerAttackRelease('C1', '8n', time, vel),
    triggerSnare: (time, vel) => {
      snareNoise.triggerAttackRelease('8n', time, vel);
      snareBody.triggerAttackRelease('D2', '16n', time, vel * 0.5);
    },
    triggerHihat: (time, vel) => hihat.triggerAttackRelease('8n', time, vel),
    kick, snareNoise, snareBody: snareBody, hihat,
    _nodes: [kick, kickDist, kickGain, snareNoise, snareBPF, snareBody, snareMerge, hihat, hihatHPF],
  };
}

const DRUM_BASE = 'https://tonejs.github.io/audio/drum-rack/';

export function createDrumInstruments(destination) {
  const synthKit = buildSynthKit(destination);

  let sampleKit = null;
  const sampler = new Tone.Sampler({
    urls: {
      C2:    'kick.mp3',
      D2:    'snare.mp3',
      'F#2': 'hihat.mp3',
      A2:    'openhat.mp3',
      'C#2': 'clap.mp3',
    },
    baseUrl: DRUM_BASE,
    onload: () => {
      // Disconnect synthesis once real samples are ready
      synthKit._nodes.forEach(n => { try { n.disconnect(); } catch(_) {} });
      sampler.connect(destination);
      sampleKit = {
        triggerKick:    (t, v) => sampler.triggerAttackRelease('C2',  '8n',  t, v),
        triggerSnare:   (t, v) => { sampler.triggerAttackRelease('D2',  '8n',  t, v);
                                    sampler.triggerAttackRelease('C#2', '8n',  t, v * 0.4); },
        triggerHihat:   (t, v) => sampler.triggerAttackRelease('F#2', '16n', t, v),
        triggerOpenhat: (t, v) => sampler.triggerAttackRelease('A2',  '4n',  t, v),
      };
    },
    onerror: () => { sampleKit = null; },
  });

  const kit = () => sampleKit || synthKit;

  return {
    triggerKick:    (t, v) => kit().triggerKick(t, v),
    triggerSnare:   (t, v) => kit().triggerSnare(t, v),
    triggerHihat:   (t, v) => kit().triggerHihat(t, v),
    triggerOpenhat: (t, v) => kit().triggerOpenhat ? kit().triggerOpenhat(t, v) : kit().triggerHihat(t, v * 1.2),
    _synth:   synthKit,
    _sampler: sampler,
    _nodes:   [...synthKit._nodes, sampler],
    kick:      synthKit.kick,
    snareNoise: synthKit.snareNoise,
    hihat:     synthKit.hihat,
  };
}
