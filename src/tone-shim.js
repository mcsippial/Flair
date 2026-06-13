// Tone.js is loaded as a UMD global via <script> in index.html.
// This shim lets all existing `import * as Tone from 'tone'` calls
// pick up window.Tone without any bundler touching Tone's source.
export default window.Tone;

const T = window.Tone;
export const Transport = T.Transport;
export const Destination = T.Destination;
export const Gain = T.Gain;
export const Volume = T.Volume;
export const Panner = T.Panner;
export const Reverb = T.Reverb;
export const FeedbackDelay = T.FeedbackDelay;
export const Limiter = T.Limiter;
export const EQ3 = T.EQ3;
export const Meter = T.Meter;
export const Player = T.Player;
export const Synth = T.Synth;
export const PolySynth = T.PolySynth;
export const MembraneSynth = T.MembraneSynth;
export const MetalSynth = T.MetalSynth;
export const NoiseSynth = T.NoiseSynth;
export const Sequence = T.Sequence;
export const Part = T.Part;
export const Loop = T.Loop;
export const start = T.start;
export const loaded = T.loaded;
export const now = T.now;
export const gainToDb = T.gainToDb;
export const dbToGain = T.dbToGain;
export const getContext = T.getContext;
export const setContext = T.setContext;
export const connect = T.connect;
export const disconnect = T.disconnect;
export const getTransport = T.getTransport;
export const getDraw = T.getDraw;
export const getDestination = T.getDestination;
export const Offline = T.Offline;
export const Draw = T.Draw;
export const Time = T.Time;
export const Frequency = T.Frequency;
export const UserMedia = T.UserMedia;
export const Recorder = T.Recorder;
export const MonoSynth = T.MonoSynth;
export const Chorus = T.Chorus;
export const Filter = T.Filter;
export const Sampler = T.Sampler;
export const Chebyshev = T.Chebyshev;
export const Compressor = T.Compressor;
