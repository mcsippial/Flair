import * as Tone from 'tone';
import { getMasterGain } from './audioEngine';

function dest() { return getMasterGain() || Tone.getDestination(); }

// ─── Sampler configs ────────────────────────────────────────────────────────
// Keys: Salamander Grand Piano (official Tone.js CDN, very reliable)
const PIANO_URLS = {
  A0:'A0.mp3', C1:'C1.mp3', F1:'F1.mp3', A1:'A1.mp3',
  C2:'C2.mp3', F2:'F2.mp3', A2:'A2.mp3', C3:'C3.mp3',
  F3:'F3.mp3', A3:'A3.mp3', C4:'C4.mp3', F4:'F4.mp3',
  A4:'A4.mp3', C5:'C5.mp3', F5:'F5.mp3', A5:'A5.mp3',
  C6:'C6.mp3', F6:'F6.mp3', A6:'A6.mp3', C7:'C7.mp3',
};

// Bass: bass-electric (nbrosowsky tonejs-instruments)
const BASS_URLS = {
  'A1':'A1.mp3','A2':'A2.mp3','A3':'A3.mp3','A4':'A4.mp3',
  'E1':'E1.mp3','E2':'E2.mp3','E3':'E3.mp3','E4':'E4.mp3',
  'G1':'G1.mp3','G2':'G2.mp3','G3':'G3.mp3',
};

// Lead: trumpet (nbrosowsky tonejs-instruments)
const TRUMPET_URLS = {
  'A3':'A3.mp3','A4':'A4.mp3','A#4':'As4.mp3',
  'C4':'C4.mp3','C5':'C5.mp3',
  'D4':'D4.mp3','D5':'D5.mp3',
  'E4':'E4.mp3','F4':'F4.mp3',
  'G3':'G3.mp3','G4':'G4.mp3','A#3':'As3.mp3',
};

const NBRO = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
const TONEJS = 'https://tonejs.github.io/audio/salamander/';

// ─── Sampler factory ─────────────────────────────────────────────────────────
function makeSampler(urls, baseUrl) {
  return new Tone.Sampler({ urls, baseUrl, release: 1 }).connect(dest());
}

// ─── Pad: rich PolySynth (pads are inherently synthetic) ─────────────────────
function makePad() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsine', spread: 30, count: 3 },
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.9, release: 3 },
    volume: -8,
  }).connect(dest());
}

export function createMidiInstrument(preset = 'keys') {
  switch (preset) {
    case 'bass':
      return makeSampler(BASS_URLS, `${NBRO}bass-electric/`);
    case 'lead':
      return makeSampler(TRUMPET_URLS, `${NBRO}trumpet/`);
    case 'pad':
      return makePad();
    case 'keys':
    default:
      return makeSampler(PIANO_URLS, TONEJS);
  }
}

// ─── Drums: synthesis (MembraneSynth + NoiseSynth) ───────────────────────────
export function createDrumInstruments() {
  const d = dest();

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 6,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    volume: 2,
  }).connect(d);

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.06 },
    volume: -2,
  }).connect(d);

  const hihatFilter = new Tone.Filter(10000, 'highpass').connect(d);
  const hihat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume: -8,
  }).connect(hihatFilter);

  return { kick, snare, hihat, hihatFilter };
}
