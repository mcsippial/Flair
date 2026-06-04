import React, { useState, useRef, useCallback } from 'react';
import Knob from './Knob';
import * as Tone from 'tone';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function TopBar({ session, dispatch, onPlayStop, onOpenSettings, canUndo, canRedo }) {
  const [tapTimes, setTapTimes] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const tapTimeout = useRef(null);
  const [timeDisplay, setTimeDisplay] = useState('0:0:0');

  React.useEffect(() => {
    if (!session.isPlaying) { setTimeDisplay('0:0:0'); return; }
    const interval = setInterval(() => {
      const pos = Tone.Transport.position;
      setTimeDisplay(pos || '0:0:0');
    }, 100);
    return () => clearInterval(interval);
  }, [session.isPlaying]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    setTapTimes(prev => {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      tapTimeout.current = setTimeout(() => setTapTimes([]), 3000);
      const newTaps = [...prev, now];
      if (newTaps.length >= 3) {
        const intervals = [];
        for (let i = 1; i < newTaps.length; i++) intervals.push(newTaps[i] - newTaps[i-1]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const bpm = Math.round(60000 / avg);
        if (bpm >= 40 && bpm <= 240) {
          dispatch({ type: 'UPDATE_BPM', bpm });
          Tone.Transport.bpm.value = bpm;
        }
      }
      return newTaps.slice(-8);
    });
  }, [dispatch]);

  return (
    <header className="top-bar">
      <span className="wordmark">Flair</span>
      <div className="top-divider" />

      <div className="transport">
        <button className="transport-btn" onClick={() => {
          Tone.Transport.stop();
          dispatch({ type: 'SET_PLAYHEAD', position: 0 });
        }} title="Rewind">|◀</button>
        <button className="transport-btn" onClick={() => {
          Tone.Transport.stop();
          dispatch({ type: 'SET_PLAYING', isPlaying: false });
          dispatch({ type: 'SET_PLAYHEAD', position: 0 });
        }} title="Stop">■</button>
        <button className={`transport-btn play ${session.isPlaying ? 'active' : ''}`} onClick={onPlayStop} title="Play/Stop">
          {session.isPlaying ? '⏸' : '▶'}
        </button>
        <button className="transport-btn" title="Recording — coming in v2" disabled style={{ opacity: 0.4 }}>⏺</button>
      </div>

      <div className="top-divider" />

      <div className="undo-redo">
        <button
          className={`transport-btn ${!canUndo ? 'dim' : ''}`}
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={!canUndo}
          title="Undo (Cmd+Z)"
        >↩</button>
        <button
          className={`transport-btn ${!canRedo ? 'dim' : ''}`}
          onClick={() => dispatch({ type: 'REDO' })}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z)"
        >↪</button>
      </div>

      <div className="bpm-control">
        <input
          className="bpm-input"
          type="number"
          value={session.bpm}
          min={40} max={240}
          onChange={e => {
            const v = parseInt(e.target.value);
            if (v >= 40 && v <= 240) {
              dispatch({ type: 'UPDATE_BPM', bpm: v });
              Tone.Transport.bpm.value = v;
            }
          }}
        />
        <span className="bpm-label">BPM</span>
        <button className="tap-btn" onClick={handleTap}>TAP</button>
      </div>

      <div className="key-control">
        <select
          className="key-select"
          value={session.key}
          onChange={e => dispatch({ type: 'UPDATE_KEY', key: e.target.value, scale: session.scale })}
        >
          {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button
          className={`scale-toggle ${session.scale === 'minor' ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'UPDATE_KEY', key: session.key, scale: session.scale === 'minor' ? 'major' : 'minor' })}
        >
          {session.scale}
        </button>
      </div>

      <div className="time-display">{timeDisplay}</div>

      <div className="top-divider" />

      <div className="master-volume">
        <Knob value={0.8} min={0} max={1} label="VOL" />
      </div>

      <div className="top-right">
        <div
          className="shortcut-hint"
          onMouseEnter={() => setShowShortcuts(true)}
          onMouseLeave={() => setShowShortcuts(false)}
        >
          ?
          {showShortcuts && (
            <div className="shortcuts-tooltip">
              <div>Space — Play/Stop</div>
              <div>Cmd+Z — Undo</div>
              <div>Cmd+Shift+Z — Redo</div>
              <div>M — Mute track</div>
              <div>S — Solo track</div>
              <div>Esc — Deselect</div>
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings">⚙</button>
        <button className="export-btn" disabled title="Export — coming soon" style={{ opacity: 0.4 }}>Export</button>
      </div>
    </header>
  );
}
