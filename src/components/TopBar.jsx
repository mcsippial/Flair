import React, { useState, useRef, useCallback } from 'react';
import Knob from './Knob';
import * as Tone from 'tone';
import { setMasterVolume } from '../engine/audioEngine';

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export default function TopBar({ session, dispatch, onPlayStop, onOpenSettings, canUndo, canRedo }) {
  const [tapTimes, setTapTimes] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState('0:0:0');
  const tapTimeout = useRef(null);

  React.useEffect(() => {
    if (!session.isPlaying) { setTimeDisplay('0:0:0'); return; }
    const iv = setInterval(() => setTimeDisplay(Tone.Transport.position || '0:0:0'), 100);
    return () => clearInterval(iv);
  }, [session.isPlaying]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    setTapTimes(prev => {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      tapTimeout.current = setTimeout(() => setTapTimes([]), 3000);
      const taps = [...prev, now];
      if (taps.length >= 3) {
        const intervals = taps.slice(1).map((t, i) => t - taps[i]);
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        const bpm = Math.round(60000 / avg);
        if (bpm >= 40 && bpm <= 240) {
          dispatch({ type: 'UPDATE_BPM', bpm });
          Tone.Transport.bpm.value = bpm;
        }
      }
      return taps.slice(-8);
    });
  }, [dispatch]);

  return (
    <header className="top-bar">
      <span className="wordmark">Flair</span>
      <div className="top-divider" />

      <div className="transport">
        <button className="transport-btn" title="Rewind"
          onClick={() => { Tone.Transport.stop(); dispatch({ type: 'SET_PLAYHEAD', position: 0 }); }}>
          ⏮
        </button>
        <button
          className={`transport-btn play${session.isPlaying ? ' active' : ''}`}
          onClick={onPlayStop}
          title="Play / Stop (Space)"
        >
          {session.isPlaying ? '⏸' : '▶'}
        </button>
        <button className="transport-btn" title="Recording — coming in v2" disabled>⏺</button>
      </div>

      <div className="top-divider" />

      <div className="undo-redo">
        <button className="transport-btn" onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo} title="Undo">↩</button>
        <button className="transport-btn" onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo} title="Redo">↪</button>
      </div>

      <div className="top-divider" />

      <div className="bpm-control">
        <input
          className="bpm-input"
          type="number"
          value={session.bpm}
          min={40} max={240}
          onChange={e => {
            const v = parseInt(e.target.value);
            if (v >= 40 && v <= 240) { dispatch({ type: 'UPDATE_BPM', bpm: v }); Tone.Transport.bpm.value = v; }
          }}
        />
        <span className="bpm-label">BPM</span>
        <button className="tap-btn" onClick={handleTap}>TAP</button>
      </div>

      <div className="top-divider" />

      <div className="key-control">
        <select className="key-select" value={session.key}
          onChange={e => dispatch({ type: 'UPDATE_KEY', key: e.target.value, scale: session.scale })}>
          {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button
          className={`scale-toggle${session.scale === 'minor' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'UPDATE_KEY', key: session.key, scale: session.scale === 'minor' ? 'major' : 'minor' })}
        >
          {session.scale}
        </button>
      </div>

      <div className="top-divider" />

      <span className="time-display">{timeDisplay}</span>

      <div className="top-spacer" />

      <div className="master-volume">
        <Knob value={0.8} min={0} max={1} label="VOL" size={28} onChange={setMasterVolume} />
      </div>

      <div className="top-right">
        <div className="shortcut-hint"
          onMouseEnter={() => setShowShortcuts(true)}
          onMouseLeave={() => setShowShortcuts(false)}
        >
          ?
          {showShortcuts && (
            <div className="shortcuts-tooltip">
              <div><span>Play / Stop</span><span>Space</span></div>
              <div><span>Undo</span><span>Cmd+Z</span></div>
              <div><span>Redo</span><span>Cmd+Shift+Z</span></div>
              <div><span>Mute track</span><span>M</span></div>
              <div><span>Solo track</span><span>S</span></div>
              <div><span>Deselect</span><span>Esc</span></div>
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="API Key Settings">⚙</button>
        <button className="export-btn" disabled title="Coming soon">Export</button>
      </div>
    </header>
  );
}
