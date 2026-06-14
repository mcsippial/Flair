import React, { useState, useRef, useCallback } from 'react';
import Knob from './Knob';
import Tone from 'tone';
import { setMasterVolume } from '../engine/audioEngine';
import { exportMix, exportStems } from '../engine/exportAudio';

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export default function TopBar({ session, dispatch, onPlayStop, onRecord, onOpenSettings, canUndo, canRedo }) {
  const [tapTimes, setTapTimes] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState('0:0:0');
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tapTimeout = useRef(null);

  const hasAudio = session.tracks.some(t => t.type === 'audio' && t.clips.length);

  const runExport = async (which) => {
    setShowExport(false);
    setExporting(true);
    try {
      if (which === 'mix') await exportMix(session);
      else await exportStems(session);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

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
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="0" width="2" height="12"/><polygon points="11,0 3,6 11,12"/></svg>
        </button>
        <button
          className={`transport-btn play${session.isPlaying ? ' active' : ''}`}
          onClick={onPlayStop}
          title="Play / Stop (Space)"
        >
          {session.isPlaying
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="0" width="4" height="12"/><rect x="7" y="0" width="4" height="12"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="1,0 11,6 1,12"/></svg>}
        </button>
        <button
          className={`transport-btn record${session.isRecording ? ' recording' : ''}`}
          onClick={onRecord}
          disabled={!session.armedTrackId}
          title={session.armedTrackId ? (session.isRecording ? 'Stop recording' : 'Record') : 'Arm a track to record'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="5"/></svg>
        </button>
      </div>

      <div className="top-divider" />

      <div className="undo-redo">
        <button className="transport-btn" onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo} title="Undo">Undo</button>
        <button className="transport-btn" onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo} title="Redo">Redo</button>
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
              <div><span>Duplicate clip</span><span>Cmd+D</span></div>
              <div><span>Copy / Paste clip</span><span>Cmd+C / V</span></div>
              <div><span>Delete clip</span><span>Del</span></div>
              <div><span>Deselect</span><span>Esc</span></div>
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="API Key Settings">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="2.2"/>
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1l1.1-1.1M10 4l1.1-1.1"/>
          </svg>
        </button>
        <div className="export-wrap">
          <button
            className="export-btn"
            disabled={!hasAudio || exporting}
            onClick={() => setShowExport(s => !s)}
            title={hasAudio ? 'Export to WAV' : 'No audio to export'}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          {showExport && !exporting && (
            <div className="export-menu" onMouseLeave={() => setShowExport(false)}>
              <button onClick={() => runExport('mix')}>Export Mix (WAV)</button>
              <button onClick={() => runExport('stems')}>Export Stems (WAV)</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
