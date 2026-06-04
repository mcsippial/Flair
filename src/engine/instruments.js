import * as Tone from 'tone';

export function createDrumInstruments() {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.08, octaves: 5,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 }
  });
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 }
  });
  const hihat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }
  });
  const hihatFilter = new Tone.Filter(8000, 'highpass');
  hihat.connect(hihatFilter);
  hihatFilter.toDestination();
  kick.toDestination();
  snare.toDestination();
  return { kick, snare, hihat };
}

export function createMidiInstrument(preset = 'keys') {
  const presets = {
    bass: { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 } },
    pad: { oscillator: { type: 'sine' }, envelope: { attack: 0.5, decay: 1, sustain: 0.8, release: 2 } },
    keys: { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.5, sustain: 0.3, release: 1 } },
    lead: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 } },
  };
  const synth = new Tone.PolySynth(Tone.Synth, presets[preset] || presets.keys);
  synth.toDestination();
  return synth;
}
