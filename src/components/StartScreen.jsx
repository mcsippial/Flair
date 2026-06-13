import React, { useState, useRef, useEffect } from 'react';
import { composeStarterSession } from '../ai/composeSession';
import { getApiKey } from '../ai/claudeClient';

const CHIPS = [
  { id: 'beat', label: 'Beat' },
  { id: 'song', label: 'Song' },
  { id: 'loop', label: 'Loop' },
  { id: 'freestyle', label: 'Freestyle' },
  { id: 'surprise', label: 'Surprise me' },
];

const KEYS   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALES = ['minor','major'];
const MOODS  = ['cinematic','energetic','melancholic','hypnotic','dark','uplifting'];

function genId() { return Math.random().toString(36).substr(2, 9); }

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

export default function StartScreen({ onDismiss, dispatch }) {
  const [input, setInput]       = useState('');
  const [screen, setScreen]     = useState('prompt');
  const [building, setBuilding] = useState(false);
  const [loadingLine, setLoadingLine] = useState('');
  const inputRef     = useRef(null);
  const loadingInterval = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [screen]);

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

  const scaffold = async (text, chipId) => {
    const intent = chipId === 'surprise'
      ? { type: 'song', key: KEYS[Math.floor(Math.random()*12)], scale: SCALES[Math.floor(Math.random()*2)], bpm: Math.floor(Math.random()*60)+80, mood: MOODS[Math.floor(Math.random()*6)], description: text }
      : parseIntent(text, chipId);

    setBuilding(true);
    startLoadingLines();

    const handleProgress = (msg) => {
      if (typeof msg === 'string') {
        stopLoadingLines();
        setLoadingLine(msg);
      }
    };

    try {
      const result = await composeStarterSession(intent, handleProgress);
      stopLoadingLines();

      dispatch({ type: 'UPDATE_BPM', bpm: result.bpm });
      dispatch({ type: 'UPDATE_KEY', key: result.key, scale: result.scale });
      result.tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));

      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: {
          id: genId(), role: 'assistant', timestamp: Date.now(),
          text: `Generated ${result.tracks.length} stems at ${result.bpm} BPM in ${result.key} ${result.scale}. Mix, mute, and solo each track independently.`,
        },
      });
      onDismiss();
    } catch (err) {
      stopLoadingLines();
      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: `Generation failed: ${err.message}` },
      });
      onDismiss();
    }
  };

  const handleSubmit = () => { if (input.trim()) scaffold(input.trim(), null); };
  const handleChip   = (chip) => scaffold(input.trim() || null, chip.id);
  const handleBlank  = () => {
    dispatch({ type: 'ADD_AI_MESSAGE', message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: "Blank session. Tell me what you're building and I'll help." } });
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
            <div className="start-building-dots"><span /><span /><span /></div>
          </div>

        ) : (
          <div className="start-input-section">
            <p className="start-prompt-label">What do you want to make?</p>
            <p className="start-mode-badge">Suno V5 + Demucs · real stems</p>
            <div className="start-input-wrap">
              <input
                ref={inputRef}
                className="start-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Dark trap beat at 140 BPM, lo-fi jazz, 80s synthwave…"
              />
              <button className="start-input-submit" onClick={handleSubmit} disabled={!input.trim()}>→</button>
            </div>

            <div className="start-chips">
              {CHIPS.map(chip => (
                <button key={chip.id} className="start-chip" onClick={() => handleChip(chip)}>
                  {chip.label}
                </button>
              ))}
            </div>

            <button className="start-blank" onClick={handleBlank}>or start blank</button>
          </div>
        )}
      </div>
    </div>
  );
}
