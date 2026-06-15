import React, { useState, useRef, useEffect } from 'react';
import { generateTakes, separateTake } from '../ai/composeSession';
import { downloadAudio } from '../ai/audioUtils';

// Icons rendered at call-time (not module-level) to avoid JSX TDZ issues.
function ChipIcon({ id }) {
  if (id === 'beat') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="2" y1="9" x2="2" y2="11" /><line x1="5" y1="5" x2="5" y2="11" />
      <line x1="8" y1="3" x2="8" y2="11" /><line x1="11" y1="7" x2="11" y2="11" />
    </svg>
  );
  if (id === 'song') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11V3l6-1.2V9.8" /><circle cx="3.5" cy="11" r="1.5" /><circle cx="9.5" cy="9.8" r="1.5" />
    </svg>
  );
  if (id === 'loop') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5a4 4 0 0 1 7-1.5M11 9a4 4 0 0 1-7 1.5" /><path d="M10 2v2.5H7.5M4 12V9.5H6.5" />
    </svg>
  );
  if (id === 'freestyle') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M1.5 7c1.5-4 2.5-4 3.5 0s2 4 3.5 0 2.5-4 4 0" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.5l1.3 3L11.5 6 8.3 7.4 7 10.5 5.7 7.4 2.5 6l3.2-1.5z" /><path d="M11.5 10.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
    </svg>
  );
}

const CHIPS = [
  { id: 'beat', label: 'Beat' },
  { id: 'song', label: 'Song' },
  { id: 'loop', label: 'Loop' },
  { id: 'freestyle', label: 'Freestyle' },
  { id: 'surprise', label: 'Surprise me' },
];

// Rotating prompt examples — show producers the range without cluttering the UI.
const EXAMPLES = [
  'Dark trap beat at 140 BPM with eerie bells',
  'Lo-fi jazz for a rainy midnight',
  '80s synthwave — neon, chrome, and Tears for Fears',
  'Cinematic orchestral build in D minor',
  'Dusty boom-bap with soul samples',
  'Afrobeats groove, warm and bright',
];

const KEYS   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALES = ['minor','major'];
const MOODS  = ['cinematic','energetic','melancholic','hypnotic','dark','uplifting'];

function genId() { return Math.random().toString(36).substr(2, 9); }

function fmtDur(s) {
  if (!s || !isFinite(s)) return '';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function parseIntent(text, chipId) {
  const lower = (text || '').toLowerCase();
  const type = chipId === 'beat' || lower.includes('beat') || lower.includes('drum') ? 'beat'
    : chipId === 'loop' || lower.includes('loop') ? 'loop'
    : 'song';
  const keyMatch = text?.match(/\b([A-G]#?)\s*(major|minor|maj|min)?\b/i);
  const key   = keyMatch ? keyMatch[1] : KEYS[Math.floor(Math.random() * 12)];
  const scale = lower.includes('major') || lower.includes('maj') ? 'major' : 'minor';
  const bpmMatch = text?.match(/(\d{2,3})\s*bpm/i);
  const bpm   = bpmMatch ? parseInt(bpmMatch[1]) : Math.floor(Math.random() * 50) + 90;
  const mood  = MOODS.find(m => lower.includes(m)) || MOODS[Math.floor(Math.random() * MOODS.length)];
  return { type, key, scale, bpm: Math.max(60, Math.min(200, bpm)), mood, description: text };
}

const LOADING_LINES = [
  'Crafting your track…',
  'Still working…',
  'Almost there…',
];

export default function StartScreen({ onDismiss, dispatch, savedData }) {
  const [input, setInput]       = useState('');
  const [screen, setScreen]     = useState('prompt'); // 'prompt' | 'audition'
  const [building, setBuilding] = useState(false);
  const [loadingLine, setLoadingLine] = useState('');
  const [takes, setTakes]       = useState([]);
  const [takeMeta, setTakeMeta] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);
  const [downloadingIdx, setDownloadingIdx] = useState(null);
  const [weirdness, setWeirdness] = useState(0.45); // 0 = faithful, 1 = experimental
  const [exIdx, setExIdx]       = useState(0);
  const inputRef        = useRef(null);
  const loadingInterval = useRef(null);
  const auditionAudio   = useRef(null);
  const playingIdxRef   = useRef(null);
  const intentRef       = useRef(null); // kept so we can regenerate on a catalog block

  useEffect(() => {
    if (screen === 'prompt') inputRef.current?.focus();
  }, [screen]);

  // Cycle example prompts while the field is empty, so the placeholder feels alive.
  useEffect(() => {
    if (screen !== 'prompt' || input) return;
    const iv = setInterval(() => setExIdx(i => (i + 1) % EXAMPLES.length), 3600);
    return () => clearInterval(iv);
  }, [screen, input]);

  // One audio element drives all audition playback. React state is synced
  // FROM the element's own play/pause/ended events — never guessed — so a
  // superseded play() (AbortError) can't desync the UI.
  useEffect(() => {
    const a = new Audio();
    auditionAudio.current = a;
    const onPlay  = () => setPlayingIdx(playingIdxRef.current);
    const onStop  = () => setPlayingIdx(null);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onStop);
    a.addEventListener('ended', onStop);
    return () => {
      a.pause();
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onStop);
      a.removeEventListener('ended', onStop);
      auditionAudio.current = null;
    };
  }, []);

  const startLoadingLines = () => {
    let i = 0;
    setLoadingLine(LOADING_LINES[0]);
    loadingInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_LINES.length;
      setLoadingLine(LOADING_LINES[i]);
    }, 2800);
  };

  const stopLoadingLines = () => {
    if (loadingInterval.current) clearInterval(loadingInterval.current);
  };

  const handleProgress = (msg) => {
    if (typeof msg === 'string') {
      stopLoadingLines();
      setLoadingLine(msg);
    }
  };

  const dispatchResult = (result) => {
    dispatch({ type: 'UPDATE_BPM', bpm: result.bpm });
    dispatch({ type: 'UPDATE_KEY', key: result.key, scale: result.scale });
    result.tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: {
        id: genId(), role: 'assistant', timestamp: Date.now(),
        text: `${result.tracks.length} tracks at ${result.bpm} BPM in ${result.key} ${result.scale}. Ask me to tweak anything.`,
      },
    });
  };

  const failWith = (err) => {
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: `Generation failed: ${err.message}` },
    });
    onDismiss();
  };

  // Phase 1: generate the two takes, then show the audition step.
  const scaffold = async (text, chipId) => {
    const intent = chipId === 'surprise'
      ? { type: 'song', key: KEYS[Math.floor(Math.random()*12)], scale: SCALES[Math.floor(Math.random()*2)], bpm: Math.floor(Math.random()*60)+80, mood: MOODS[Math.floor(Math.random()*6)], description: text }
      : parseIntent(text, chipId);
    intent.weirdness = weirdness;
    intentRef.current = intent;

    setBuilding(true);
    startLoadingLines();

    try {
      const { bpm, key, scale, takes } = await generateTakes(intent, handleProgress);
      stopLoadingLines();
      if (!takes?.length) throw new Error('Suno returned no takes');

      // Only one take came back — skip the audition step and separate directly.
      if (takes.length === 1) {
        await runSeparation(takes[0], { bpm, key, scale });
        return;
      }

      setTakeMeta({ bpm, key, scale });
      setTakes(takes);
      setBuilding(false);
      setScreen('audition');
    } catch (err) {
      stopLoadingLines();
      failWith(err);
    }
  };

  // Phase 2: split the chosen take into native stems and load the session.
  // If kie.ai blocks the split because the take matched an existing recording,
  // transparently regenerate a fresh, unique take and retry — the producer
  // never sees a dead-end, they just wait a little longer.
  const runSeparation = async (take, meta) => {
    auditionAudio.current?.pause();
    setPlayingIdx(null);
    setScreen('prompt'); // building spinner renders over this
    setBuilding(true);
    stopLoadingLines();
    setLoadingLine('Separating stems…');

    const MAX_ATTEMPTS = 3;
    let curTake = take, curMeta = meta;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const result = await separateTake(curTake, curMeta, handleProgress);
          stopLoadingLines();
          dispatchResult(result);
          onDismiss();
          return;
        } catch (err) {
          const isCatalogBlock = /known recording|catalog|too similar|copyright/i.test(err.message);
          if (!isCatalogBlock || attempt === MAX_ATTEMPTS - 1 || !intentRef.current) throw err;
          stopLoadingLines();
          setLoadingLine('That take matched an existing recording — generating a fresh, unique take…');
          const regen = await generateTakes(intentRef.current, handleProgress);
          if (!regen.takes?.length) throw err;
          curTake = regen.takes[0];
          curMeta = { bpm: regen.bpm, key: regen.key, scale: regen.scale };
        }
      }
    } catch (err) {
      stopLoadingLines();
      failWith(err);
    }
  };

  // Download a take's full mix (for reference / external use) via the proxy.
  const downloadTake = async (take, i) => {
    if (downloadingIdx !== null) return;
    setDownloadingIdx(i);
    try {
      const blobUrl = await downloadAudio(take.url);
      const a = document.createElement('a');
      const label = (take.title || `Take ${String.fromCharCode(65 + i)}`).replace(/[^\w]+/g, '_');
      a.href = blobUrl;
      a.download = `${label}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    } catch (err) {
      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: `Download failed: ${err.message}` },
      });
    } finally {
      setDownloadingIdx(null);
    }
  };

  const toggleAudition = (i, url) => {
    const a = auditionAudio.current;
    if (!a) return;
    // Clicking the take that's currently playing → pause it.
    if (playingIdx === i && !a.paused) {
      a.pause();
      return;
    }
    // Otherwise (re)start this take from the top. The 'play'/'pause'
    // listeners update playingIdx; AbortError from a superseded load is ignored.
    playingIdxRef.current = i;
    if (a.src !== url) a.src = url;
    a.currentTime = 0;
    a.play().catch(() => {});
  };

  const handleSubmit = () => { if (input.trim()) scaffold(input.trim(), null); };
  const handleChip   = (chip) => scaffold(input.trim() || null, chip.id);
  const handleBlank  = () => {
    dispatch({ type: 'ADD_AI_MESSAGE', message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: "Blank session. Tell me what you're building and I'll help." } });
    onDismiss();
  };

  const handleDemo = () => {
    // Lo-fi hip hop beat at 130 BPM in C minor
    // Drum patterns: 16 steps per bar (step 0=beat1, 4=beat2, 8=beat3, 12=beat4)
    // Kick: 0, 6, 8, 14 — syncopated lo-fi bounce
    // Snare: 4, 12 — backbeat
    // Hi-hat: every even step with step 3 and 11 added for swing feel
    const kickPattern  = Array.from({length:16}, (_,i) => [0,6,8,14].includes(i));
    const snarePattern = Array.from({length:16}, (_,i) => [4,12].includes(i));
    const hihatPattern = Array.from({length:16}, (_,i) => [0,2,3,4,6,8,10,11,12,14].includes(i));

    const tracks = [
      // ── Drums ──────────────────────────────────────────────────────────────
      {
        id: genId(), name: 'Kick', type: 'drum', color: '#e05048',
        volume: 0.88, muted: false, solo: false, pan: 0,
        eq: { low: 0.25, mid: -0.1, high: -0.2 }, reverb: 0, delay: 0,
        comp: { enabled: true, threshold: -18, ratio: 6 },
        clips: [{ id: genId(), type: 'drum', name: 'Kick Loop', start: 0, length: 16,
          pattern: kickPattern }],
      },
      {
        id: genId(), name: 'Snare', type: 'drum', color: '#d4781a',
        volume: 0.72, muted: false, solo: false, pan: 0,
        eq: { low: -0.2, mid: 0.15, high: 0.1 }, reverb: 0.18, delay: 0,
        comp: { enabled: true, threshold: -20, ratio: 4 },
        clips: [{ id: genId(), type: 'drum', name: 'Snare', start: 0, length: 16,
          pattern: snarePattern }],
      },
      {
        id: genId(), name: 'Hi-Hat', type: 'drum', color: '#c8aa44',
        volume: 0.52, muted: false, solo: false, pan: 0.08,
        eq: { low: -0.5, mid: -0.1, high: 0.2 }, reverb: 0.05, delay: 0,
        clips: [{ id: genId(), type: 'drum', name: 'Hi-Hat', start: 0, length: 16,
          pattern: hihatPattern }],
      },

      // ── Bass (C minor pentatonic groove) ───────────────────────────────────
      {
        id: genId(), name: 'Bass', type: 'synth', instrument: 'bass', color: '#4a9e6a',
        volume: 0.82, muted: false, solo: false, pan: 0,
        eq: { low: 0.3, mid: 0, high: -0.25 }, reverb: 0, delay: 0,
        comp: { enabled: true, threshold: -22, ratio: 5 },
        clips: [{ id: genId(), type: 'midi', name: 'Bass', start: 0, length: 16, notes: [
          // Bar 0 — root groove
          { id: genId(), note: 'C2',  time: '0:0:0', duration: '8n', velocity: 0.90 },
          { id: genId(), note: 'C2',  time: '0:1:2', duration: '16n', velocity: 0.55 },
          { id: genId(), note: 'G2',  time: '0:2:0', duration: '8n', velocity: 0.75 },
          { id: genId(), note: 'Bb2', time: '0:3:2', duration: '16n', velocity: 0.50 },
          // Bar 1
          { id: genId(), note: 'Ab2', time: '1:0:0', duration: '8n', velocity: 0.85 },
          { id: genId(), note: 'G2',  time: '1:1:0', duration: '8n', velocity: 0.65 },
          { id: genId(), note: 'F2',  time: '1:2:0', duration: '8n', velocity: 0.78 },
          { id: genId(), note: 'Eb2', time: '1:3:2', duration: '16n', velocity: 0.48 },
          // Bar 2
          { id: genId(), note: 'C2',  time: '2:0:0', duration: '8n', velocity: 0.92 },
          { id: genId(), note: 'C2',  time: '2:1:2', duration: '16n', velocity: 0.52 },
          { id: genId(), note: 'D2',  time: '2:2:0', duration: '8n', velocity: 0.70 },
          { id: genId(), note: 'Eb2', time: '2:3:0', duration: '8n', velocity: 0.60 },
          // Bar 3
          { id: genId(), note: 'F2',  time: '3:0:0', duration: '4n', velocity: 0.80 },
          { id: genId(), note: 'G2',  time: '3:2:0', duration: '8n', velocity: 0.68 },
          { id: genId(), note: 'Ab2', time: '3:3:0', duration: '8n', velocity: 0.58 },
          // Bars 4–7 (variation with octave jumps)
          { id: genId(), note: 'C2',  time: '4:0:0', duration: '8n', velocity: 0.88 },
          { id: genId(), note: 'C3',  time: '4:0:2', duration: '16n', velocity: 0.45 },
          { id: genId(), note: 'Bb2', time: '4:1:2', duration: '16n', velocity: 0.55 },
          { id: genId(), note: 'G2',  time: '4:2:0', duration: '8n', velocity: 0.72 },
          { id: genId(), note: 'F2',  time: '4:3:2', duration: '16n', velocity: 0.48 },
          { id: genId(), note: 'Ab2', time: '5:0:0', duration: '4n', velocity: 0.83 },
          { id: genId(), note: 'G2',  time: '5:2:0', duration: '8n', velocity: 0.65 },
          { id: genId(), note: 'F2',  time: '5:3:0', duration: '8n', velocity: 0.57 },
          { id: genId(), note: 'Eb2', time: '6:0:0', duration: '8n', velocity: 0.86 },
          { id: genId(), note: 'F2',  time: '6:1:0', duration: '8n', velocity: 0.60 },
          { id: genId(), note: 'G2',  time: '6:2:0', duration: '4n', velocity: 0.75 },
          { id: genId(), note: 'C2',  time: '7:0:0', duration: '2n', velocity: 0.90 },
          { id: genId(), note: 'G2',  time: '7:2:2', duration: '8n', velocity: 0.55 },
        ]}],
      },

      // ── Rhodes Chord Pad ───────────────────────────────────────────────────
      {
        id: genId(), name: 'Rhodes', type: 'synth', instrument: 'pad', color: '#5888aa',
        volume: 0.58, muted: false, solo: false, pan: -0.18,
        eq: { low: -0.15, mid: 0.05, high: 0.1 }, reverb: 0.42, delay: 0.08,
        clips: [{ id: genId(), type: 'midi', name: 'Chords', start: 0, length: 16, notes: [
          // Cm7 — bars 0–1
          { id: genId(), note: 'C3',  time: '0:0:0', duration: '2n', velocity: 0.62 },
          { id: genId(), note: 'Eb3', time: '0:0:0', duration: '2n', velocity: 0.58 },
          { id: genId(), note: 'G3',  time: '0:0:0', duration: '2n', velocity: 0.55 },
          { id: genId(), note: 'Bb3', time: '0:0:0', duration: '2n', velocity: 0.52 },
          { id: genId(), note: 'C3',  time: '0:2:0', duration: '2n', velocity: 0.58 },
          { id: genId(), note: 'Eb3', time: '0:2:0', duration: '2n', velocity: 0.54 },
          { id: genId(), note: 'G3',  time: '0:2:0', duration: '2n', velocity: 0.50 },
          // Fm7 — bars 2–3
          { id: genId(), note: 'F3',  time: '2:0:0', duration: '2n', velocity: 0.60 },
          { id: genId(), note: 'Ab3', time: '2:0:0', duration: '2n', velocity: 0.56 },
          { id: genId(), note: 'C4',  time: '2:0:0', duration: '2n', velocity: 0.54 },
          { id: genId(), note: 'Eb4', time: '2:0:0', duration: '2n', velocity: 0.48 },
          { id: genId(), note: 'F3',  time: '2:2:0', duration: '2n', velocity: 0.55 },
          { id: genId(), note: 'Ab3', time: '2:2:0', duration: '2n', velocity: 0.52 },
          // Abmaj7 — bars 4–5
          { id: genId(), note: 'Ab3', time: '4:0:0', duration: '2n', velocity: 0.64 },
          { id: genId(), note: 'C4',  time: '4:0:0', duration: '2n', velocity: 0.58 },
          { id: genId(), note: 'Eb4', time: '4:0:0', duration: '2n', velocity: 0.54 },
          { id: genId(), note: 'G4',  time: '4:0:0', duration: '2n', velocity: 0.48 },
          { id: genId(), note: 'Ab3', time: '4:2:0', duration: '2n', velocity: 0.58 },
          { id: genId(), note: 'C4',  time: '4:2:0', duration: '2n', velocity: 0.52 },
          // G7 — bars 6–7
          { id: genId(), note: 'G3',  time: '6:0:0', duration: '2n', velocity: 0.66 },
          { id: genId(), note: 'B3',  time: '6:0:0', duration: '2n', velocity: 0.60 },
          { id: genId(), note: 'D4',  time: '6:0:0', duration: '2n', velocity: 0.56 },
          { id: genId(), note: 'F4',  time: '6:0:0', duration: '2n', velocity: 0.50 },
          { id: genId(), note: 'G3',  time: '6:2:0', duration: '2n', velocity: 0.60 },
          { id: genId(), note: 'D4',  time: '6:2:0', duration: '2n', velocity: 0.54 },
        ]}],
      },

      // ── Lead Melody ───────────────────────────────────────────────────────
      {
        id: genId(), name: 'Melody', type: 'synth', instrument: 'lead', color: '#9b6abf',
        volume: 0.62, muted: false, solo: false, pan: 0.22,
        eq: { low: -0.2, mid: 0.15, high: 0.05 }, reverb: 0.28, delay: 0.18,
        clips: [{ id: genId(), type: 'midi', name: 'Melody', start: 0, length: 16, notes: [
          // Phrase A (bars 0–3)
          { id: genId(), note: 'G4',  time: '0:0:0', duration: '8n',  velocity: 0.78 },
          { id: genId(), note: 'Bb4', time: '0:1:0', duration: '16n', velocity: 0.60 },
          { id: genId(), note: 'C5',  time: '0:1:2', duration: '4n',  velocity: 0.85 },
          { id: genId(), note: 'Bb4', time: '0:3:0', duration: '8n',  velocity: 0.65 },
          { id: genId(), note: 'G4',  time: '1:0:0', duration: '8n',  velocity: 0.72 },
          { id: genId(), note: 'Eb4', time: '1:1:0', duration: '4n',  velocity: 0.80 },
          { id: genId(), note: 'F4',  time: '1:3:0', duration: '8n',  velocity: 0.58 },
          { id: genId(), note: 'G4',  time: '1:3:2', duration: '16n', velocity: 0.44 },
          // Phrase B (bars 2–3)
          { id: genId(), note: 'Ab4', time: '2:0:0', duration: '4n',  velocity: 0.82 },
          { id: genId(), note: 'G4',  time: '2:2:0', duration: '8n',  velocity: 0.68 },
          { id: genId(), note: 'F4',  time: '2:3:0', duration: '16n', velocity: 0.52 },
          { id: genId(), note: 'Eb4', time: '3:0:0', duration: '8n',  velocity: 0.76 },
          { id: genId(), note: 'D4',  time: '3:1:0', duration: '16n', velocity: 0.48 },
          { id: genId(), note: 'Eb4', time: '3:1:2', duration: '8n',  velocity: 0.62 },
          { id: genId(), note: 'G4',  time: '3:3:0', duration: '4n',  velocity: 0.70 },
          // Development (bars 4–7)
          { id: genId(), note: 'C5',  time: '4:0:0', duration: '8n',  velocity: 0.88 },
          { id: genId(), note: 'D5',  time: '4:1:0', duration: '16n', velocity: 0.62 },
          { id: genId(), note: 'Eb5', time: '4:1:2', duration: '4n',  velocity: 0.90 },
          { id: genId(), note: 'C5',  time: '4:3:2', duration: '16n', velocity: 0.55 },
          { id: genId(), note: 'Bb4', time: '5:0:0', duration: '8n',  velocity: 0.75 },
          { id: genId(), note: 'Ab4', time: '5:1:0', duration: '4n',  velocity: 0.82 },
          { id: genId(), note: 'G4',  time: '5:3:0', duration: '8n',  velocity: 0.60 },
          { id: genId(), note: 'F4',  time: '6:0:0', duration: '16n', velocity: 0.52 },
          { id: genId(), note: 'G4',  time: '6:0:2', duration: '8n',  velocity: 0.70 },
          { id: genId(), note: 'Ab4', time: '6:1:2', duration: '4n',  velocity: 0.78 },
          { id: genId(), note: 'G4',  time: '6:3:2', duration: '16n', velocity: 0.48 },
          { id: genId(), note: 'C5',  time: '7:0:0', duration: '2n',  velocity: 0.86 },
          { id: genId(), note: 'Bb4', time: '7:2:2', duration: '8n',  velocity: 0.52 },
          { id: genId(), note: 'G4',  time: '7:3:2', duration: '16n', velocity: 0.40 },
        ]}],
      },

      // ── Vinyl / Texture placeholder ────────────────────────────────────────
      {
        id: genId(), name: 'Vinyl FX', type: 'audio', color: '#7ab8c0',
        volume: 0.30, muted: false, solo: false, pan: 0,
        eq: { low: 0.1, mid: 0, high: -0.1 }, reverb: 0, delay: 0,
        clips: [],
      },
    ];

    tracks.forEach(t => dispatch({ type: 'ADD_TRACK', track: t }));
    dispatch({ type: 'UPDATE_BPM', bpm: 130 });
    dispatch({ type: 'UPDATE_KEY', key: 'C', scale: 'minor' });
    dispatch({ type: 'ADD_AI_MESSAGE', message: {
      id: genId(), role: 'assistant', timestamp: Date.now(),
      text: "Lo-fi beat loaded. Ask me to change the chords, swap the melody, adjust the vibe, or anything else."
    }});
    onDismiss();
  };

  const weirdLabel = weirdness <= 0.3 ? 'Faithful' : weirdness >= 0.7 ? 'Experimental' : 'Balanced';

  return (
    <div className="start-overlay">
      {/* Ambient studio backdrop */}
      <div className="start-bg" aria-hidden="true">
        <div className="start-glow start-glow-1" />
        <div className="start-glow start-glow-2" />
        <div className="start-grain" />
      </div>

      <div className="start-inner">
        {savedData && (
          <div className="start-restore-banner">
            <span className="start-restore-text">You have a previous session saved.</span>
            <button
              className="start-restore-btn"
              onClick={() => {
                dispatch({ type: 'LOAD_SESSION', data: savedData });
                onDismiss();
              }}
            >
              Restore previous session
            </button>
          </div>
        )}
        <div className="start-brand">
          <h1 className="start-wordmark">Flair</h1>
          <p className="start-tagline">The AI studio for producers</p>
        </div>

        {building ? (
          <div className="start-building">
            <div className="start-building-ring"><span /><span /><span /></div>
            <p className="start-building-text">{loadingLine}</p>
          </div>

        ) : screen === 'audition' ? (
          <div className="start-input-section">
            <p className="start-prompt-label">Your track is ready — pick a take</p>
            <p className="start-key-desc">
              A/B the two versions. Only the one you choose gets split into stems.
            </p>
            <div className="audition-takes">
              {takes.map((take, i) => (
                <div key={i} className={`audition-row ${playingIdx === i ? 'is-playing' : ''}`}>
                  <button
                    className={`audition-play ${playingIdx === i ? 'playing' : ''}`}
                    onClick={() => toggleAudition(i, take.url)}
                    title={playingIdx === i ? 'Pause' : 'Play'}
                  >
                    {playingIdx === i
                      ? <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="0" width="3.5" height="11" rx="0.5"/><rect x="6.5" y="0" width="3.5" height="11" rx="0.5"/></svg>
                      : <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><polygon points="1,0 11,5.5 1,11"/></svg>}
                  </button>
                  <div className="audition-meta">
                    <span className="audition-label">Take {String.fromCharCode(65 + i)}</span>
                    {take.duration ? <span className="audition-dur">{fmtDur(take.duration)}</span> : null}
                  </div>
                  <button
                    className="audition-download"
                    onClick={() => downloadTake(take, i)}
                    disabled={downloadingIdx !== null}
                    title="Download this take"
                  >
                    {downloadingIdx === i
                      ? '…'
                      : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.5v7M3.5 5.5l3 3 3-3M2 11h9"/></svg>}
                  </button>
                  <button className="audition-use" onClick={() => runSeparation(take, takeMeta)}>
                    Use this take →
                  </button>
                </div>
              ))}
            </div>
            <button className="start-blank" onClick={handleDemo}>load demo session</button>
            <button className="start-blank" onClick={onDismiss}>cancel — start blank</button>
          </div>

        ) : (
          <div className="start-input-section">
            <div className="start-input-wrap">
              <input
                ref={inputRef}
                className="start-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Describe a sound, a mood, a vibe…"
              />
              <button className="start-input-submit" onClick={handleSubmit} disabled={!input.trim()} title="Generate">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8 4l4 4-4 4"/></svg>
              </button>
            </div>

            {/* Rotating example suggestion — click to use it */}
            <button
              className="start-example"
              onClick={() => { setInput(EXAMPLES[exIdx]); inputRef.current?.focus(); }}
              title="Use this example"
            >
              <span className="start-example-try">Try</span>
              <span key={exIdx} className="start-example-text">{EXAMPLES[exIdx]}</span>
            </button>

            <div className="start-chips">
              {CHIPS.map(chip => (
                <button key={chip.id} className="start-chip" onClick={() => handleChip(chip)}>
                  <span className="start-chip-icon"><ChipIcon id={chip.id} /></span>
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="start-weirdness">
              <div className="start-weirdness-head">
                <span>Adventurousness</span>
                <span className="start-weirdness-val">{weirdLabel} · {Math.round(weirdness * 100)}%</span>
              </div>
              <input
                className="start-weirdness-slider"
                type="range" min="0" max="1" step="0.05"
                value={weirdness}
                style={{ '--fill': `${weirdness * 100}%` }}
                onChange={e => setWeirdness(parseFloat(e.target.value))}
              />
              <div className="start-weirdness-scale">
                <span>Stay true to the genre</span>
                <span>Push the boundaries</span>
              </div>
            </div>

            <div className="start-foot">
              <span className="start-mode-badge">Suno V5 · native stems</span>
              <button className="start-blank" onClick={handleDemo}>load demo session</button>
              <button className="start-blank" onClick={handleBlank}>or start blank</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
