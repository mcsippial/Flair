import React, { useState, useRef, useEffect } from 'react';

const CHIPS = [
  { id: 'beat', icon: '🥁', label: 'Beat' },
  { id: 'song', icon: '🎵', label: 'Song' },
  { id: 'loop', icon: '🔁', label: 'Loop' },
  { id: 'freestyle', icon: '🎸', label: 'Freestyle' },
  { id: 'surprise', icon: '✨', label: 'Surprise me' },
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['minor', 'major'];
const MOODS = ['cinematic', 'energetic', 'melancholic', 'hypnotic', 'dark', 'uplifting'];

function genId() { return Math.random().toString(36).substr(2, 9); }

function getNote(root, semitones) {
  const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return notes[(notes.indexOf(root) + semitones) % 12] + '3';
}

const LOOP_BARS = 16;

function repeatPattern(notes, patternBars, totalBars) {
  const result = [];
  for (let rep = 0; rep < totalBars / patternBars; rep++) {
    notes.forEach(n => {
      const parts = n.time.split(':').map(Number);
      const newBar = parts[0] + rep * patternBars;
      result.push({ ...n, time: `${newBar}:${parts[1] || 0}:${parts[2] || 0}` });
    });
  }
  return result;
}

function buildSession(key, scale, bpm, type) {
  const drumPattern = [
    { time: '0:0:0', drum: 'kick', velocity: 0.9 },
    { time: '0:1:0', drum: 'snare', velocity: 0.7 },
    { time: '0:0:2', drum: 'hihat', velocity: 0.35 },
    { time: '0:1:2', drum: 'hihat', velocity: 0.35 },
    { time: '0:2:0', drum: 'kick', velocity: 0.85 },
    { time: '0:2:2', drum: 'hihat', velocity: 0.35 },
    { time: '0:3:0', drum: 'snare', velocity: 0.7 },
    { time: '0:3:2', drum: 'hihat', velocity: 0.35 },
  ];
  const bassPattern = [
    { time: '0:0:0', note: `${key}2`, duration: '4n', velocity: 0.8 },
    { time: '0:1:2', note: `${key}2`, duration: '8n', velocity: 0.6 },
    { time: '0:2:0', note: `${key}2`, duration: '4n', velocity: 0.75 },
    { time: '0:3:0', note: `${key}2`, duration: '8n', velocity: 0.6 },
  ];
  const padPattern = [
    { time: '0:0:0', note: `${key}3`, duration: '2n', velocity: 0.45 },
    { time: '0:0:0', note: getNote(key, scale === 'minor' ? 3 : 4), duration: '2n', velocity: 0.38 },
    { time: '0:2:0', note: `${key}3`, duration: '2n', velocity: 0.45 },
    { time: '0:2:0', note: getNote(key, 7), duration: '2n', velocity: 0.35 },
  ];

  const tracks = [
    {
      id: genId(), name: 'Drums', type: 'drum', color: '#c4a882',
      muted: false, solo: false, armed: false, volume: 0.8, pan: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: [{ id: genId(), name: 'Pattern', start: 0, length: LOOP_BARS, notes: repeatPattern(drumPattern, 1, LOOP_BARS), type: 'drum' }],
    },
    {
      id: genId(), name: 'Bass', type: 'midi', instrument: 'bass', color: '#6ba3c4',
      muted: false, solo: false, armed: false, volume: 0.75, pan: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: [{ id: genId(), name: 'Bass Line', start: 0, length: LOOP_BARS, notes: repeatPattern(bassPattern, 1, LOOP_BARS), type: 'midi' }],
    },
  ];

  if (type !== 'beat') {
    tracks.push({
      id: genId(), name: 'Chords', type: 'midi', instrument: 'pad', color: '#9b82c4',
      muted: false, solo: false, armed: false, volume: 0.55, pan: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: [{ id: genId(), name: 'Chords', start: 0, length: LOOP_BARS, notes: repeatPattern(padPattern, 1, LOOP_BARS), type: 'midi' }],
    });
  }

  return tracks;
}

function parseIntent(text) {
  const lower = text.toLowerCase();
  const type = lower.includes('beat') || lower.includes('drum') ? 'beat'
    : lower.includes('loop') ? 'loop'
    : 'song';

  const keyMatch = text.match(/\b([A-G]#?)\s*(major|minor|maj|min)?\b/i);
  const key = keyMatch ? keyMatch[1] : KEYS[Math.floor(Math.random() * 12)];
  const scale = lower.includes('major') || lower.includes('maj') ? 'major' : 'minor';

  const bpmMatch = text.match(/(\d{2,3})\s*bpm/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1]) : Math.floor(Math.random() * 50) + 90;

  const mood = MOODS.find(m => lower.includes(m)) || MOODS[Math.floor(Math.random() * MOODS.length)];

  return { type, key, scale, bpm: Math.max(60, Math.min(200, bpm)), mood };
}

export default function StartScreen({ onDismiss, dispatch }) {
  const [input, setInput] = useState('');
  const [building, setBuilding] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const scaffold = (text, chipId) => {
    const intent = chipId === 'surprise'
      ? { type: 'song', key: KEYS[Math.floor(Math.random()*12)], scale: SCALES[Math.floor(Math.random()*2)], bpm: Math.floor(Math.random()*60)+80, mood: MOODS[Math.floor(Math.random()*6)] }
      : parseIntent(text || chipId || 'song');

    setBuilding(true);

    setTimeout(() => {
      const tracks = buildSession(intent.key, intent.scale, intent.bpm, intent.type);
      dispatch({ type: 'UPDATE_BPM', bpm: intent.bpm });
      dispatch({ type: 'UPDATE_KEY', key: intent.key, scale: intent.scale });
      tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: {
          id: genId(), role: 'assistant', timestamp: Date.now(),
          text: chipId === 'surprise'
            ? `I went with ${intent.bpm} BPM in ${intent.key} ${intent.scale} — something ${intent.mood}. Drums, bass, and chords ready. Hit play.`
            : `Built you a ${intent.type === 'beat' ? 'drum and bass pattern' : 'full starter session'} at ${intent.bpm} BPM in ${intent.key} ${intent.scale}. ${text ? `Vibing with: "${text}".` : ''} Hit play.`,
        }
      });
      onDismiss();
    }, 600);
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    scaffold(input.trim(), null);
  };

  const handleChip = (chip) => {
    scaffold(input.trim(), chip.id);
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
            <p className="start-building-text">Building your session...</p>
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
                  <span className="start-chip-icon">{chip.icon}</span>
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
