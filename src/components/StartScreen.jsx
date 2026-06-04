import React, { useState } from 'react';

const TILES = [
  { id: 'beat', icon: '🥁', label: 'Beat', desc: 'drums, bass, groove' },
  { id: 'song', icon: '🎵', label: 'Song', desc: 'full arrangement' },
  { id: 'loop', icon: '🔁', label: 'Loop', desc: 'repeating section' },
  { id: 'freestyle', icon: '🎸', label: 'Freestyle', desc: 'no plan, just start' },
  { id: 'sample', icon: '🎙️', label: 'From a sample', desc: 'coming in v2', disabled: true },
  { id: 'surprise', icon: '✨', label: 'Surprise me', desc: 'AI picks everything' },
];

const FOLLOW_UPS = {
  beat: "What's the energy — slow burn or high energy?",
  song: "Any artists or sounds you're feeling?",
  loop: "What vibe — hypnotic, danceable, or something else?",
  freestyle: "Any key or tempo in mind, or totally open?",
  surprise: null,
};

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['minor', 'major'];
const MOODS = ['cinematic', 'energetic', 'melancholic', 'hypnotic', 'dark', 'uplifting'];

function genId() { return Math.random().toString(36).substr(2, 9); }

function getNote(root, semitones) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const idx = notes.indexOf(root);
  const newIdx = (idx + semitones) % 12;
  return notes[newIdx] + '3';
}

function buildStarterSession(key, scale, bpm, mood, type) {
  const rootNote = key;
  const chordNotes = scale === 'minor'
    ? [`${rootNote}3`, getNote(rootNote, 3), getNote(rootNote, 7)]
    : [`${rootNote}3`, getNote(rootNote, 4), getNote(rootNote, 7)];

  const drumNotes = [
    { time: 0, drum: 'kick', velocity: 0.9 },
    { time: '0:1:0', drum: 'snare', velocity: 0.7 },
    { time: '0:1:2', drum: 'hihat', velocity: 0.4 },
    { time: '0:2:0', drum: 'kick', velocity: 0.9 },
    { time: '0:2:2', drum: 'hihat', velocity: 0.4 },
    { time: '0:3:0', drum: 'snare', velocity: 0.7 },
    { time: '0:3:2', drum: 'hihat', velocity: 0.4 },
    { time: '0:0:2', drum: 'hihat', velocity: 0.3 },
    { time: '0:1:0', drum: 'hihat', velocity: 0.3 },
  ];

  const bassNotes = [
    { time: 0, note: `${rootNote}2`, duration: '4n', velocity: 0.8 },
    { time: '0:1:0', note: `${rootNote}2`, duration: '8n', velocity: 0.6 },
    { time: '0:2:0', note: `${rootNote}2`, duration: '4n', velocity: 0.8 },
    { time: '0:3:0', note: `${rootNote}2`, duration: '8n', velocity: 0.6 },
  ];

  const padNotes = [
    { time: 0, note: chordNotes[0], duration: '2n', velocity: 0.5 },
    { time: 0, note: chordNotes[1], duration: '2n', velocity: 0.4 },
    { time: '0:2:0', note: chordNotes[0], duration: '2n', velocity: 0.5 },
    { time: '0:2:0', note: chordNotes[2], duration: '2n', velocity: 0.4 },
  ];

  const tracks = [];

  tracks.push({
    id: genId(), name: 'Drums', type: 'drum', color: '#c4a882',
    muted: false, solo: false, armed: false, volume: 0.8, pan: 0,
    eq: { low: 0, mid: 0, high: 0 },
    clips: [{ id: genId(), name: 'Drum Pattern', start: 0, length: 4, notes: drumNotes, type: 'drum' }],
  });

  tracks.push({
    id: genId(), name: 'Bass', type: 'midi', instrument: 'bass', color: '#7eb8d4',
    muted: false, solo: false, armed: false, volume: 0.75, pan: 0,
    eq: { low: 0, mid: 0, high: 0 },
    clips: [{ id: genId(), name: 'Bass Line', start: 0, length: 4, notes: bassNotes, type: 'midi' }],
  });

  if (type !== 'beat') {
    tracks.push({
      id: genId(), name: 'Chord Pad', type: 'midi', instrument: 'pad', color: '#9b7eb8',
      muted: false, solo: false, armed: false, volume: 0.6, pan: 0,
      eq: { low: 0, mid: 0, high: 0 },
      clips: [{ id: genId(), name: 'Chords', start: 0, length: 4, notes: padNotes, type: 'midi' }],
    });
  }

  return tracks;
}

export default function StartScreen({ onDismiss, dispatch }) {
  const [selected, setSelected] = useState(null);
  const [answer, setAnswer] = useState('');
  const [step, setStep] = useState('tiles');

  const handleTileClick = (tile) => {
    if (tile.disabled) return;
    if (tile.id === 'surprise') {
      handleSurprise();
      return;
    }
    setSelected(tile);
    setStep('followup');
  };

  const handleSurprise = () => {
    const bpm = Math.floor(Math.random() * 60) + 80;
    const key = KEYS[Math.floor(Math.random() * KEYS.length)];
    const scale = SCALES[Math.floor(Math.random() * SCALES.length)];
    const mood = MOODS[Math.floor(Math.random() * MOODS.length)];

    const tracks = buildStarterSession(key, scale, bpm, mood, 'song');

    dispatch({ type: 'UPDATE_BPM', bpm });
    dispatch({ type: 'UPDATE_KEY', key, scale });
    tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: {
        id: genId(),
        role: 'assistant',
        text: `I went with ${bpm} BPM in ${key} ${scale} — something ${mood} and a little heavy. Built you a tight drum pattern, root-note bass line, and a chord pad to set the tone. Press play and see where it takes you.`,
        timestamp: Date.now(),
      }
    });
    onDismiss();
  };

  const handleStart = () => {
    const bpm = 120;
    const key = 'C';
    const scale = 'minor';
    const tracks = buildStarterSession(key, scale, bpm, 'energetic', selected.id);

    dispatch({ type: 'UPDATE_BPM', bpm });
    tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: {
        id: genId(),
        role: 'assistant',
        text: `${selected.id === 'beat' ? 'Tight drum pattern, punchy bass — ready to groove.' : 'Got your session started with drums, bass, and chords.'} ${answer ? `Keeping your vibe in mind: "${answer}".` : ''} Hit play and let's build from here.`,
        timestamp: Date.now(),
      }
    });
    onDismiss();
  };

  const handleBlank = () => {
    dispatch({
      type: 'ADD_AI_MESSAGE',
      message: {
        id: genId(),
        role: 'assistant',
        text: "Blank session ready. I'm here when you need me — just start playing or tell me what you're building.",
        timestamp: Date.now(),
      }
    });
    onDismiss();
  };

  return (
    <div className="start-screen-overlay">
      <div className="start-screen">
        <h1 className="start-title">What are we making today?</h1>
        {step === 'tiles' && (
          <>
            <div className="start-tiles">
              {TILES.map(tile => (
                <button
                  key={tile.id}
                  className={`start-tile ${tile.disabled ? 'disabled' : ''}`}
                  onClick={() => handleTileClick(tile)}
                  title={tile.disabled ? 'Sample import — coming in v2' : ''}
                  disabled={tile.disabled}
                >
                  <span className="tile-icon">{tile.icon}</span>
                  <span className="tile-label">{tile.label}</span>
                  <span className="tile-desc">{tile.desc}</span>
                </button>
              ))}
            </div>
            <button className="start-blank" onClick={handleBlank}>Start blank</button>
          </>
        )}
        {step === 'followup' && selected && (
          <div className="followup">
            <p className="followup-question">{FOLLOW_UPS[selected.id]}</p>
            <input
              className="followup-input"
              autoFocus
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="Type your answer..."
            />
            <div className="followup-actions">
              <button className="btn-primary" onClick={handleStart}>Let's go →</button>
              <button className="btn-secondary" onClick={() => setStep('tiles')}>← Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
