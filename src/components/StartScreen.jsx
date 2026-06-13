import React, { useState, useRef, useEffect } from 'react';
import { generateTakes, separateTake } from '../ai/composeSession';
import { downloadAudio } from '../ai/audioUtils';

// Small inline icons so the format pills read as studio tools, not plain text.
const Icon = {
  beat: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="2" y1="9" x2="2" y2="11" /><line x1="5" y1="5" x2="5" y2="11" />
      <line x1="8" y1="3" x2="8" y2="11" /><line x1="11" y1="7" x2="11" y2="11" />
    </svg>
  ),
  song: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11V3l6-1.2V9.8" /><circle cx="3.5" cy="11" r="1.5" /><circle cx="9.5" cy="9.8" r="1.5" />
    </svg>
  ),
  loop: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5a4 4 0 0 1 7-1.5M11 9a4 4 0 0 1-7 1.5" /><path d="M10 2v2.5H7.5M4 12V9.5H6.5" />
    </svg>
  ),
  freestyle: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M1.5 7c1.5-4 2.5-4 3.5 0s2 4 3.5 0 2.5-4 4 0" />
    </svg>
  ),
  surprise: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.5l1.3 3L11.5 6 8.3 7.4 7 10.5 5.7 7.4 2.5 6l3.2-1.5z" /><path d="M11.5 10.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
    </svg>
  ),
};

const CHIPS = [
  { id: 'beat', label: 'Beat', icon: Icon.beat },
  { id: 'song', label: 'Song', icon: Icon.song },
  { id: 'loop', label: 'Loop', icon: Icon.loop },
  { id: 'freestyle', label: 'Freestyle', icon: Icon.freestyle },
  { id: 'surprise', label: 'Surprise me', icon: Icon.surprise },
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

export default function StartScreen({ onDismiss, dispatch }) {
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
                  <span className="start-chip-icon">{chip.icon}</span>
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
              <button className="start-blank" onClick={handleBlank}>or start blank</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
