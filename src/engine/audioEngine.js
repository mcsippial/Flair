import * as Tone from 'tone';

let masterLimiter, masterReverb, masterDelay;
const trackNodes = {}; // { trackId: { synth, meter, sequence } }
let toneStarted = false;

export async function ensureToneStarted() {
  if (!toneStarted) {
    await Tone.start();
    toneStarted = true;
  }
}

export function setupMasterBus() {
  masterLimiter = new Tone.Limiter(-3).toDestination();
  masterReverb = new Tone.Reverb({ decay: 2.5, wet: 0 }).connect(masterLimiter);
  masterDelay = new Tone.FeedbackDelay("8n", 0.3).connect(masterLimiter);
  masterDelay.wet.value = 0;
}

export function getTrackNodes(trackId) { return trackNodes[trackId]; }
export function setTrackNodes(trackId, nodes) { trackNodes[trackId] = nodes; }
export function disposeTrack(trackId) {
  const nodes = trackNodes[trackId];
  if (nodes) {
    if (nodes.sequence) nodes.sequence.dispose();
    if (nodes.synth) nodes.synth.dispose();
    if (nodes.meter) nodes.meter.dispose();
    delete trackNodes[trackId];
  }
}
export function getMasterLimiter() { return masterLimiter; }
export function getMasterReverb() { return masterReverb; }
export function getMasterDelay() { return masterDelay; }
