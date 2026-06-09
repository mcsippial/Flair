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

// ─── Pad: warm triangle through lowpass, auto-wired for reverb ───────────────
// _padFilter is stored so scheduler.js can route it into the FX chain
export function makePad() {
  const filter = new Tone.Filter({ frequency: 1400, type: 'lowpass', rolloff: -12 });
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 1.0, decay: 0.2, sustain: 0.85, release: 4.0 },
    volume: -14,
  });
  synth.connect(filter);
  synth._padFilter = filter;
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
// Returns { kick, snare, snareFilter, hihat } — all disconnected from dest()
// so the scheduler can route them through the drum bus compressor.
export function createDrumInstruments() {
  // Kick: deep membrane with fast pitch drop
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 10,
    envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.18 },
    volume: 6,
  });

  // Snare: white noise through a bandpass filter centered around the body frequency
  const snareFilter = new Tone.Filter({ frequency: 2800, type: 'bandpass', rolloff: -12 });
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.05 },
    volume: 2,
  });
  snare.connect(snareFilter);

  // Hihat: MetalSynth sounds dramatically more realistic than NoiseSynth+highpass
  const hihat = new Tone.MetalSynth({
    frequency: 400,
    envelope: { attack: 0.001, decay: 0.08, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
    volume: -10,
  });

  return { kick, snare, snareFilter, hihat };
}
