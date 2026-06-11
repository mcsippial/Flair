import React, { useState, useRef, useEffect } from 'react';
import { composeStarterSession } from '../ai/composeSession';
import { getApiKey, setApiKey } from '../ai/claudeClient';
import { getReplicateKey, setReplicateKey } from '../ai/musicGen';

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

const LOADING_STEMS = [
  'Decomposing into stems…',
  'Generating drums…',
  'Generating bass…',
  'Generating chords…',
  'Generating melody…',
  'Mixing stems…',
  'Almost done…',
];

const LOADING_MIDI = [
  'Setting the key and tempo…',
  'Writing chord progression…',
  'Laying down the groove…',
  'Composing the bass line…',
  'Building section B…',
  'Almost there…',
];

function initialScreen() {
  if (!getReplicateKey() && !getApiKey()) return 'replicate';
  return 'prompt';
}

export default function StartScreen({ onDismiss, dispatch }) {
  const [input, setInput]           = useState('');
  const [screen, setScreen]         = useState(initialScreen);
  const [replicateKey, setRepKey]   = useState(getReplicateKey() || '');
  const [claudeKey, setClaudeKey]   = useState(getApiKey() || '');
  const [building, setBuilding]     = useState(false);
  const [loadingLine, setLoadingLine] = useState('');
  const [stemProgress, setStemProgress] = useState(null); // null = not stem mode
  const inputRef     = useRef(null);
  const repKeyRef    = useRef(null);
  const claudeKeyRef = useRef(null);
  const loadingInterval = useRef(null);

  const usingStems = !!getReplicateKey();

  useEffect(() => {
    if (screen === 'replicate') repKeyRef.current?.focus();
    else if (screen === 'claude') claudeKeyRef.current?.focus();
    else inputRef.current?.focus();
  }, [screen]);

  const saveReplicateKey = () => {
    setReplicateKey(replicateKey.trim());
    setScreen('prompt');
  };

  const saveClaudeKey = () => {
    setApiKey(claudeKey.trim());
    setScreen('prompt');
  };

  const startLoadingLines = (lines) => {
    let i = 0;
    setLoadingLine(lines[0]);
    loadingInterval.current = setInterval(() => {
      i = (i + 1) % lines.length;
      setLoadingLine(lines[i]);
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
    const usingRepl = !!getReplicateKey();
    startLoadingLines(usingRepl ? LOADING_STEMS : LOADING_MIDI);

    const handleStemProgress = (update) => {
      setStemProgress(prev => typeof update === 'function' ? update(prev || []) : update);
    };

    try {
      const result = await composeStarterSession(intent, usingRepl ? handleStemProgress : null);
      stopLoadingLines();
      setStemProgress(null);

      dispatch({ type: 'UPDATE_BPM', bpm: result.bpm });
      dispatch({ type: 'UPDATE_KEY', key: result.key, scale: result.scale });
      result.tracks.forEach(track => dispatch({ type: 'ADD_TRACK', track }));

      const isStems = result.tracks.some(t => t.type === 'audio');
      const desc = isStems
        ? `Generated ${result.tracks.length} stems at ${result.bpm} BPM in ${result.key} ${result.scale}. Each stem is a separate track — mix, mute, and solo them independently.`
        : `Composed a 16-bar ${intent.type} at ${result.bpm} BPM in ${result.key} ${result.scale}. Hit play and tell me what to change.`;

      dispatch({
        type: 'ADD_AI_MESSAGE',
        message: { id: genId(), role: 'assistant', timestamp: Date.now(), text: desc },
      });
      onDismiss();
    } catch (err) {
      stopLoadingLines();
      setStemProgress(null);
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

        ) : screen === 'replicate' ? (
          <div className="start-input-section">
            <p className="start-prompt-label">Replicate API key — for AI stem generation</p>
            <p className="start-key-desc">
              Generates real audio stems (drums, bass, chords, melody) separately<br />
              so you can mix and mute each track independently. Free key at <span className="start-key-link">replicate.com</span>
            </p>
            <div className="start-input-wrap">
              <input
                ref={repKeyRef}
                className="start-input"
                type="password"
                value={replicateKey}
                onChange={e => setRepKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && replicateKey.trim() && saveReplicateKey()}
                placeholder="r8_..."
              />
              <button className="start-input-submit" onClick={saveReplicateKey} disabled={!replicateKey.trim()}>→</button>
            </div>
            <button className="start-blank" onClick={() => setScreen('claude')}>
              use Claude API key instead (MIDI synthesis)
            </button>
            <button className="start-blank" style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }} onClick={() => setScreen('prompt')}>
              skip — start without AI
            </button>
          </div>

        ) : screen === 'claude' ? (
          <div className="start-input-section">
            <p className="start-prompt-label">Claude API key — for AI chat and MIDI composition</p>
            <div className="start-input-wrap">
              <input
                ref={claudeKeyRef}
                className="start-input"
                type="password"
                value={claudeKey}
                onChange={e => setClaudeKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && claudeKey.trim() && saveClaudeKey()}
                placeholder="sk-ant-api03-..."
              />
              <button className="start-input-submit" onClick={saveClaudeKey} disabled={!claudeKey.trim()}>→</button>
            </div>
            <button className="start-blank" onClick={() => setScreen('replicate')}>← back</button>
            <button className="start-blank" style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }} onClick={() => setScreen('prompt')}>skip</button>
          </div>

        ) : (
          <div className="start-input-section">
            <p className="start-prompt-label">What do you want to make?</p>
            {usingStems && (
              <p className="start-mode-badge">MusicGen · 4 stems · real audio</p>
            )}
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
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <button className="start-blank" style={{ fontSize: 11, opacity: 0.45, marginTop: 0 }}
                onClick={() => setScreen('replicate')}>change Replicate key</button>
              <button className="start-blank" style={{ fontSize: 11, opacity: 0.45, marginTop: 0 }}
                onClick={() => setScreen('claude')}>change Claude key</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
