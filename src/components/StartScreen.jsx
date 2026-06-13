import React, { useState, useRef, useEffect } from 'react';
import { generateTakes, separateTake } from '../ai/composeSession';

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

export default function StartScreen({ onDismiss, dispatch }) {
  const [input, setInput]       = useState('');
  const [screen, setScreen]     = useState('prompt'); // 'prompt' | 'audition'
  const [building, setBuilding] = useState(false);
  const [loadingLine, setLoadingLine] = useState('');
  const [takes, setTakes]       = useState([]);
  const [takeMeta, setTakeMeta] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);
  const inputRef        = useRef(null);
  const loadingInterval = useRef(null);
  const auditionAudio   = useRef(null);

  useEffect(() => {
    if (screen === 'prompt') inputRef.current?.focus();
  }, [screen]);

  // Stop any audition playback when this screen unmounts.
  useEffect(() => () => { auditionAudio.current?.pause(); }, []);

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
        text: `Generated ${result.tracks.length} stems at ${result.bpm} BPM in ${result.key} ${result.scale}. Mix, mute, and solo each track independently.`,
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

    setBuilding(true);
    startLoadingLines();

    try {
      const { bpm, key, scale, takes } = await generateTakes(intent, handleProgress);
      stopLoadingLines();
      if (!takes?.length) throw new Error('Suno returned no takes');

      // Only one take came back — skip the audition step and separate directly.
      if (takes.length === 1) {
        await runSeparation(takes[0].url, { bpm, key, scale });
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

  // Phase 2: run Demucs on the chosen take and load the session.
  const runSeparation = async (url, meta) => {
    auditionAudio.current?.pause();
    setPlayingIdx(null);
    setScreen('prompt'); // building spinner renders over this
    setBuilding(true);
    stopLoadingLines();
    setLoadingLine('Separating stems…');
    try {
      const result = await separateTake(url, meta, handleProgress);
      stopLoadingLines();
      dispatchResult(result);
      onDismiss();
    } catch (err) {
      stopLoadingLines();
      failWith(err);
    }
  };

  const toggleAudition = (i, url) => {
    if (!auditionAudio.current) auditionAudio.current = new Audio();
    const a = auditionAudio.current;
    if (playingIdx === i) {
      a.pause();
      setPlayingIdx(null);
      return;
    }
    a.pause();
    a.src = url;
    a.currentTime = 0;
    a.onended = () => setPlayingIdx(null);
    a.play().catch(() => setPlayingIdx(null));
    setPlayingIdx(i);
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

        ) : screen === 'audition' ? (
          <div className="start-input-section">
            <p className="start-prompt-label">Your track is ready — pick a take</p>
            <p className="start-key-desc">
              A/B the two versions. Only the one you choose gets split into stems.
            </p>
            <div className="audition-takes">
              {takes.map((take, i) => (
                <div key={i} className="audition-row">
                  <button
                    className={`audition-play ${playingIdx === i ? 'playing' : ''}`}
                    onClick={() => toggleAudition(i, take.url)}
                    title={playingIdx === i ? 'Pause' : 'Play'}
                  >
                    {playingIdx === i ? '❚❚' : '▶'}
                  </button>
                  <span className="audition-label">
                    Take {String.fromCharCode(65 + i)}
                    {take.duration ? <span className="audition-dur"> · {fmtDur(take.duration)}</span> : null}
                  </span>
                  <button className="audition-use" onClick={() => runSeparation(take.url, takeMeta)}>
                    Use this take →
                  </button>
                </div>
              ))}
            </div>
            <button className="start-blank" onClick={onDismiss}>cancel — start blank</button>
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
