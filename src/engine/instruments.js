import * as Tone from 'tone';
import { getMasterGain } from './audioEngine';

function dest() { return getMasterGain() || Tone.getDestination(); }

// ─── Sampler configs ──────────────────────────────────────────────────────────
const PIANO_URLS = {
  A0:'A0.mp3', C1:'C1.mp3', F1:'F1.mp3', A1:'A1.mp3',
  C2:'C2.mp3', F2:'F2.mp3', A2:'A2.mp3', C3:'C3.mp3',
  F3:'F3.mp3', A3:'A3.mp3', C4:'C4.mp3', F4:'F4.mp3',
  A4:'A4.mp3', C5:'C5.mp3', F5:'F5.mp3', A5:'A5.mp3',
  C6:'C6.mp3', F6:'F6.mp3', A6:'A6.mp3', C7:'C7.mp3',
};

const BASS_URLS = {
  'A1':'A1.mp3','A2':'A2.mp3','A3':'A3.mp3','A4':'A4.mp3',
  'E1':'E1.mp3','E2':'E2.mp3','E3':'E3.mp3','E4':'E4.mp3',
  'G1':'G1.mp3','G2':'G2.mp3','G3':'G3.mp3',
};

const TRUMPET_URLS = {
  'A3':'A3.mp3','A4':'A4.mp3','A#4':'As4.mp3',
  'C4':'C4.mp3','C5':'C5.mp3',
  'D4':'D4.mp3','D5':'D5.mp3',
  'E4':'E4.mp3','F4':'F4.mp3',
  'G3':'G3.mp3','G4':'G4.mp3','A#3':'As3.mp3',
};

const NBRO   = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
const TONEJS = 'https://tonejs.github.io/audio/salamander/';

function makeSampler(urls, baseUrl) {
  return new Tone.Sampler({ urls, baseUrl, release: 1 }).connect(dest());
}

// ─── Pad: warm AM synth with chorus, auto-wired for reverb ───────────────────
// _padFilter is stored so scheduler.js can route it into the FX chain
export function makePad() {
  const filter = new Tone.Filter({ frequency: 1800, type: 'lowpass', rolloff: -24 });
  const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.4, wet: 0.35 }).start();
  const synth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.8, decay: 0.3, sustain: 0.75, release: 3.5 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.5, decay: 0.4, sustain: 0.5, release: 2 },
    volume: -16,
  });
  synth.connect(filter);
  filter.connect(chorus);
  // scheduler routes _padFilter (the chorus output) into the FX chain
  synth._padFilter = chorus;
  synth._padChorus = chorus;
  return synth;
}

export function createMidiInstrument(preset = 'keys') {
  switch (preset) {
    case 'bass': return makeSampler(BASS_URLS, `${NBRO}bass-electric/`);
    case 'lead': return makeSampler(TRUMPET_URLS, `${NBRO}trumpet/`);
    case 'pad':  return makePad();
    case 'keys':
    default:     return makeSampler(PIANO_URLS, TONEJS);
  }
}

// ─── Drums ────────────────────────────────────────────────────────────────────
// Returns an object with triggerKick/triggerSnare/triggerHihat methods plus
// individual nodes and _nodes array for disposal.
// destination: the drum bus compressor input
export function createDrumInstruments(destination) {
  // Kick: deep membrane with Chebyshev punch, parallel dry+dist
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.15,
    octaves: 14,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.55, sustain: 0, release: 0.25 },
    volume: 8,
  });
  const kickDist = new Tone.Chebyshev(2);
  kick.connect(kickDist);
  kickDist.connect(destination);
  kick.connect(destination); // dry parallel

  // Snare: two-layer — noise crack + tonal body
  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.06 },
    volume: 2,
  });
  const snareBody = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
    volume: -8,
  });
  const snareHPF = new Tone.Filter({ frequency: 3000, type: 'highpass', rolloff: -24 });
  const snareMerge = new Tone.Gain(1);
  snareNoise.connect(snareHPF);
  snareHPF.connect(snareMerge);
  snareBody.connect(snareMerge);
  snareMerge.connect(destination);

  // Hihat: white noise through steep HPF — cleaner than MetalSynth
  const hihat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.01 },
    volume: -6,
  });
  const hihatHPF = new Tone.Filter({ frequency: 9000, type: 'highpass', rolloff: -48 });
  hihat.connect(hihatHPF);
  hihatHPF.connect(destination);

  return {
    triggerKick:   (time, vel) => kick.triggerAttackRelease('C1', '8n', time, vel),
    triggerSnare:  (time, vel) => {
      snareNoise.triggerAttackRelease('8n', time, vel);
      snareBody.triggerAttackRelease('D2', '16n', time, vel * 0.6);
    },
    triggerHihat:  (time, vel, duration = '16n') => hihat.triggerAttackRelease(duration, time, vel),
    // individual nodes for volume control
    kick, snareNoise, snareBody, hihat,
    // all nodes for disposal
    _nodes: [kick, kickDist, snareNoise, snareBody, snareHPF, snareMerge, hihat, hihatHPF],
  };
}
