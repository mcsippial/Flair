import Tone from 'tone';

let masterLimiter, masterGain, masterReverb, masterDelay;
const trackNodes = {};
let toneStarted = false;

// ─── Recording state ──────────────────────────────────────────────────────────
let mic = null;
let recorder = null;
let isRecording = false;

export async function ensureToneStarted() {
  if (!toneStarted) {
    await Tone.start();
    setupMasterBus();
    toneStarted = true;
  }
}

let masterMeter;

export function setupMasterBus() {
  masterLimiter = new Tone.Limiter(-3).toDestination();
  masterMeter = new Tone.Meter();
  masterGain = new Tone.Gain(0.8).connect(masterLimiter);
  masterGain.connect(masterMeter);
  // Reverb and delay are aux RETURNS: each track's send_reverb / send_delay gain
  // controls how much of that track is sent here. The return itself must be 100%
  // wet, otherwise the send knobs add only dry signal and produce no audible
  // reverb/delay tail.
  masterReverb = new Tone.Reverb({ decay: 2.5, wet: 1 }).connect(masterGain);
  masterDelay = new Tone.FeedbackDelay('8n', 0.3).connect(masterGain);
  masterDelay.wet.value = 1;
}

export function getMasterMeter() { return masterMeter; }

export function setMasterVolume(v) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

// ─── Metronome ────────────────────────────────────────────────────────────────
let metroPart = null;
let metroEnabled = false;

export function setMetronome(enabled) {
  metroEnabled = enabled;
  if (!enabled) {
    metroPart?.stop();
    metroPart?.dispose();
    metroPart = null;
    return;
  }
  if (metroPart) return; // already running
  const click = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
    volume: -8,
  }).toDestination();

  metroPart = new Tone.Sequence((time, beat) => {
    const freq = beat === 0 ? 1400 : 900;
    const vol  = beat === 0 ? -6 : -14;
    click.volume.value = vol;
    click.triggerAttackRelease(freq, '32n', time);
  }, [0, 1, 2, 3], '4n');

  metroPart.start(0);
}

export function getMetronomeEnabled() { return metroEnabled; }

// ─── Track nodes ──────────────────────────────────────────────────────────────
export function getTrackNodes(trackId) { return trackNodes[trackId]; }
export function setTrackNodes(trackId, nodes) { trackNodes[trackId] = nodes; }

export function applyTrackFx(trackId, { eq, pan, reverb, delay } = {}) {
  const nodes = trackNodes[trackId];
  if (!nodes) return;
  if (nodes.eq && eq) {
    if (eq.low  !== undefined) nodes.eq.low.value  = eq.low  * 12;
    if (eq.mid  !== undefined) nodes.eq.mid.value  = eq.mid  * 12;
    if (eq.high !== undefined) nodes.eq.high.value = eq.high * 12;
  }
  if (nodes.panner    && pan     !== undefined) nodes.panner.pan.value       = pan;
  if (nodes.send_reverb && reverb !== undefined) nodes.send_reverb.gain.value = reverb;
  if (nodes.send_delay  && delay  !== undefined) nodes.send_delay.gain.value  = delay;
}

export function disposeTrack(trackId) {
  const nodes = trackNodes[trackId];
  if (nodes) {
    // Dispose individual named nodes
    ['sequence','synth','padFilter','player',
     'drumBus','meter','eq','panner','send_reverb','send_delay'].forEach(k => {
      try { if (nodes[k]) nodes[k].dispose(); } catch(e) {}
    });
    // Dispose all drum internal nodes (filters, gains, dist) if present
    if (Array.isArray(nodes._drumNodes)) {
      nodes._drumNodes.forEach(n => { try { n.dispose(); } catch(e) {} });
    }
    delete trackNodes[trackId];
  }
}

export function disposeAllTracks() {
  Object.keys(trackNodes).forEach(id => disposeTrack(id));
}

// ─── Recording ────────────────────────────────────────────────────────────────
export async function startRecording() {
  if (isRecording) return;
  await ensureToneStarted();

  mic = new Tone.UserMedia();
  recorder = new Tone.Recorder();
  mic.connect(recorder);

  await mic.open(); // triggers browser mic permission prompt
  recorder.start();
  isRecording = true;
}

export async function stopRecording() {
  if (!isRecording || !recorder) return null;
  isRecording = false;

  const blob = await recorder.stop();
  try { mic.close(); mic.dispose(); } catch(e) {}
  try { recorder.dispose(); } catch(e) {}
  mic = null;
  recorder = null;

  return URL.createObjectURL(blob);
}

export function getIsRecording() { return isRecording; }

// ─── Master bus getters ───────────────────────────────────────────────────────
export function getMasterLimiter() { return masterLimiter; }
export function getMasterGain()    { return masterGain; }
export function getMasterReverb()  { return masterReverb; }
export function getMasterDelay()   { return masterDelay; }
