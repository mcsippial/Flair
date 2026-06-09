import React, { useState, useRef, useEffect } from 'react';
import { composeStarterSession } from '../ai/composeSession';
import { getApiKey, setApiKey } from '../ai/claudeClient';

const CHIPS = [
  { id: 'beat', label: 'Beat' },
  { id: 'song', label: 'Song' },
  { id: 'loop', label: 'Loop' },
  { id: 'freestyle', label: 'Freestyle' },
  { id: 'surprise', label: 'Surprise me' },
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['minor', 'major'];
const MOODS = ['cinematic', 'energetic', 'melancholic', 'hypnotic', 'dark', 'uplifting'];

function genId() { return Math.random().toString(36).substr(2, 9); }

function getNote(root, semitones) {
  const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return notes[(notes.indexOf(root) + semitones) % 12] + '3';
}

// Fallback procedural generator used when no API key is present
function buildFallbackSession(key, scale, type) {
  const chordRoots = scale === 'minor'
    ? [0, 8, 7, 10] // i - VI - VII - VII (Am-F-G-G style)
    : [0, 5, 7, 5];  // I - IV - V - IV
  const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const rootIdx = notes.indexOf(key);

  const drumNotes = [];
  const bassNotes = [];
  const padNotes = [];

  for (let bar = 0; bar < 16; bar++) {
    const chordRoot = notes[(rootIdx + chordRoots[Math.floor(bar / 2) % 4]) % 12];
    const isFill = bar % 4 === 3;
    const isDropBar = bar === 8;

    // Drums
    if (!isDropBar) {
      drumNotes.push({ time: `${bar}:0:0`, drum: 'kick', velocity: 0.9 });
      drumNotes.push({ time: `${bar}:1:0`, drum: 'snare', velocity: 0.7 });
      drumNotes.push({ time: `${bar}:2:0`, drum: 'kick', velocity: bar >= 8 ? 0.85 : 0.75 });
      drumNotes.push({ time: `${bar}:3:0`, drum: 'snare', velocity: 0.7 });
      [0, 1, 2, 3].forEach(beat => {
        drumNotes.push({ time: `${bar}:${beat}:2`, drum: 'hihat', velocity: bar >= 8 ? 0.4 : 0.3 });
      });
      if (isFill) {
        drumNotes.push({ time: `${bar}:3:1`, drum: 'kick', velocity: 0.8 });
        drumNotes.push({ time: `${bar}:3:2`, drum: 'snare', velocity: 0.6 });
        drumNotes.push({ time: `${bar}:3:3`, drum: 'kick', velocity: 0.75 });
      }
    } else {
      // drop bar: just kick and snare
      drumNotes.push({ time: `${bar}:0:0`, drum: 'kick', velocity: 0.9 });
      drumNotes.push({ time: `${bar}:2:0`, drum: 'snare', velocity: 0.65 });
    }

    // Bass - busier in section B
    bassNotes.push({ time: `${bar}:0:0`, note: `${chordRoot}2`, duration: '4n', velocity: 0.8 });
    bassNotes.push({ time: `${bar}:1:2`, note: `${chordRoot}2`, duration: '8n', velocity: 0.6 });
    bassNotes.push({ time: `${bar}:2:0`, note: `${chordRoot}2`, duration: '4n', velocity: 0.75 });
    if (bar >= 8) {
      bassNotes.push({ time: `${bar}:3:0`, note: `${chordRoot}2`, duration: '8n', velocity: 0.65 });
      bassNotes.push({ time: `${bar}:3:2`, note: `${chordRoot}2`, duration: '8n', velocity: 0.55 });
    }

    // Pad chords (change every 2 bars)
    if (bar % 2 === 0) {
      padNotes.push({ time: `${bar}:0:0`, note: `${chordRoot}3`, duration: '2n', velocity: 0.45 });
      padNotes.push({ time: `${bar}:0:0`, note: getNote(chordRoot, scale === 'minor' ? 3 : 4), duration: '2n', velocity: 0.38 });
      padNotes.push({ time: `${bar}:0:0`, note: getNote(chordRoot, 7), duration: '2n', velocity: 0.32 });
    }
  }

  const tracks = [
    { id: genId(), name: 'Drums', type: 'drum', color: '#c4a882', muted: false, solo: false, armed: false, volume: 0.8, pan: 0, eq: { low: 0, mid: 0, high: 0 }, clips: [{ id: genId(), name: 'Pattern', start: 0, length: 16, notes: drumNotes, type: 'drum' }] },
    { id: genId(), name: 'Bass', type: 'midi', instrument: 'bass', color: '#6ba3c4', muted: false, solo: false, armed: false, volume: 0.75, pan: 0, eq: { low: 0, mid: 0, high: 0 }, clips: [{ id: genId(), name: 'Bass Line', start: 0, length: 16, notes: bassNotes, type: 'midi' }] },
  ];
  if (type !== 'beat') {
    tracks.push({ id: genId(), name: 'Chords', type: 'midi', instrument: 'pad', color: '#9b82c4', muted: false, solo: false, armed: false, volume: 0.55, pan: 0, eq: { low: 0, mid: 0, high: 0 }, clips: [{ id: genId(), name: 'Chords', start: 0, length: 16, notes: padNotes, type: 'midi' }] });
  }
  return { tracks, bpm: Math.floor(Math.random() * 50) + 90, key, scale };
}

function parseIntent(text, chipId) {
  const lower = (text || '').toLowerCase();
  const type = chipId === 'beat' || lower.includes('beat') || lower.includes('drum') ? 'beat'
    : chipId === 'loop' || lower.includes('loop') ? 'loop'
    : 'song';

  const keyMatch = text?.match(/\b([A-G]#?)\s*(major|minor|maj|min)?\b/i);
  const key = keyMatch ? keyMatch[1] : KEYS[Math.floor(Math.random() * 12)];
  const scale = lower.includes('major') || lower.includes('maj') ? 'major' : 'minor';

  const bpmMatch = text?.match(/(\d{2,3})\s*bpm/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1]) : Math.floor(Math.random() * 50) + 90;

  const mood = MOODS.find(m => lower.includes(m)) || MOODS[Math.floor(Math.random() * MOODS.length)];

  return { type, key, scale, bpm: Math.max(60, Math.min(200, bpm)), mood, description: text };
}

const LOADING_LINES = [
  'Setting the key and tempo…',
  'Writing chord progression…',
  'Laying down the groove…',
  'Composing the bass line…',
  'Building section B…',
  'Almost there…',
];

export default function StartScreen({ onDismiss, dispatch }) {
  const [input, setInput] = useState('');
  const [building, setBuilding] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const inputRef = useRef(null);
  const loadingInterval = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const startLoadingLines = () => {
    let i = 0;
    loadingInterval.current = setInterval(() => {
      i = (i + 1) % LOADING_LINES.length;
      setLoadingLine(LOADING_LINES[i]);
    }, 1800);
  };

  const stopLoadingLines = () => {
    if (loadingInterval.current) clearInterval(loadingInterval.current);
  };

  const scaffold = async (text, chipId) => {
    const intent = chipId === 'surprise'
      ? { type: 'song', key: KEYS[Math.floor(Math.random()*12)], scale: SCALES[Math.floor(Math.random()*2)], bpm: Math.floor(Math.random()*60)+80, mood: MOODS[Math.floor(Math.random()*6)], description: text }
      : parseIntent(text, chipId);

    setBuilding(true);
    setLoadingLine(LOADING_LINES[0]);
    startLoadingLines();

    try {
      let result = null;
      if (getApiKey()) {
        result = await composeStarterSession(intent);
      }
      if (!result) {
        result = buildFallbackSession(intent.key, intent.scale, intent.type);
      }

      stopLoadingLines();
      dispatch({ type: 'UPDATE_BPM', bpm: result.bpm });
      dispatch({ type: 'UPDATE_KEY', key: result.key, scale: result.scale });
      result.tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: {
          id: genId(), role: 'assistant', timestamp: Date.now(),
          text: getApiKey()
            ? `Composed a 16-bar ${intent.type} at ${result.bpm} BPM in ${result.key} ${result.scale}. Section A and B are distinct — hit play and tell me what to change.`
            : `Built a starter session at ${result.bpm} BPM in ${result.key} ${result.scale}. Add your Claude API key in Settings to unlock AI composition.`,
        }
      });
      onDismiss();
    } catch (err) {
      stopLoadingLines();
      const fallback = buildFallbackSession(intent.key, intent.scale, intent.type);
      dispatch({ type: 'UPDATE_BPM', bpm: fallback.bpm });
      dispatch({ type: 'UPDATE_KEY', key: fallback.key, scale: fallback.scale });
      fallback.tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
      dispatch({ type: 'ADD_AI_MESSAGE', message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: `Composition failed (${err.message}) — loaded a starter session instead.` } });
      onDismiss();
    }
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    scaffold(input.trim(), null);
  };

  const handleChip = (chip) => {
    scaffold(input.trim() || null, chip.id);
  };

  const handleBlank = () => {
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: "Blank session. Tell me what you're building and I'll help from here." }
    });
    onDismiss();
  };

  return (
    <div className="start-overlay">
      <div className="start-inner">
        <div className="start-brand">
          <h1 className="start-wordmark">Flair</h1>
          <p className="start-tagline">Your AI studio.</p>
        </div>

        {building ? (
          <div className="start-building">
            <p className="start-building-text">{loadingLine}</p>
            <div className="start-building-dots">
              <span /><span /><span />
            </div>
          </div>
        ) : (
          <div className="start-input-section">
            <p className="start-prompt-label">What do you want to make?</p>
            <div className="start-input-wrap">
              <input
                ref={inputRef}
                className="start-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Describe a vibe, tempo, genre, anything..."
              />
              <button
                className="start-input-submit"
                onClick={handleSubmit}
                disabled={!input.trim()}
              >
                →
              </button>
            </div>

            <div className="start-chips">
              {CHIPS.map(chip => (
                <button
                  key={chip.id}
                  className="start-chip"
                  onClick={() => handleChip(chip)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <button className="start-blank" onClick={handleBlank}>
              or start blank
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
