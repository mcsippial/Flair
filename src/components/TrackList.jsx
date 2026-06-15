import React, { useState } from 'react';

const TRACK_COLORS = ['#c4a882','#6ba3c4','#9b82c4','#6bc49b','#c46b6b','#c4b86b','#6bc4bc','#c46bb8'];

// Instrument-specific icons at 14px
function TypeIcon({ type, instrument }) {
  const inst = instrument || '';

  // Drum kit
  if (type === 'drum') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <ellipse cx="7" cy="5" rx="4.5" ry="1.8" />
      <line x1="2.5" y1="5" x2="2.5" y2="9.5" />
      <line x1="11.5" y1="5" x2="11.5" y2="9.5" />
      <ellipse cx="7" cy="9.5" rx="4.5" ry="1.8" />
      <line x1="7" y1="3.2" x2="5" y2="1" strokeWidth="1" />
      <line x1="7" y1="3.2" x2="9" y2="1" strokeWidth="1" />
    </svg>
  );

  // Audio waveform
  if (type === 'audio') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <line x1="1.5" y1="7" x2="1.5" y2="7" />
      <line x1="3" y1="5" x2="3" y2="9" />
      <line x1="4.5" y1="3" x2="4.5" y2="11" />
      <line x1="6" y1="5.5" x2="6" y2="8.5" />
      <line x1="7.5" y1="4" x2="7.5" y2="10" />
      <line x1="9" y1="5.5" x2="9" y2="8.5" />
      <line x1="10.5" y1="3.5" x2="10.5" y2="10.5" />
      <line x1="12" y1="5" x2="12" y2="9" />
    </svg>
  );

  // Bass — low sine wave
  if (inst === 'bass') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M1 9c1.5-5 2.5-5 4 0s2.5 5 4 0s2 -3 3.5 0" />
      <line x1="1" y1="11" x2="13" y2="11" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );

  // Lead / melody — single note with flag
  if (inst === 'lead') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <ellipse cx="4.5" cy="10.5" rx="2.2" ry="1.5" fill="currentColor" opacity="0.85" stroke="none" />
      <line x1="6.7" y1="10.5" x2="6.7" y2="2.5" />
      <path d="M6.7 2.5 C9 2 11 3.5 10.5 5.5 C10 7 7.5 7 6.7 6.5" fill="currentColor" opacity="0.7" stroke="none" />
    </svg>
  );

  // Pad / chords — stacked bars
  if (inst === 'pad') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="1.5" y="3" width="11" height="1.8" rx="0.5" opacity="0.9" />
      <rect x="1.5" y="6.1" width="11" height="1.8" rx="0.5" opacity="0.7" />
      <rect x="1.5" y="9.2" width="11" height="1.8" rx="0.5" opacity="0.5" />
    </svg>
  );

  // Keys / piano — keyboard
  if (inst === 'keys') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <rect x="1.5" y="4" width="11" height="7" rx="1" />
      <line x1="4" y1="4" x2="4" y2="11" />
      <line x1="7" y1="4" x2="7" y2="11" />
      <line x1="10" y1="4" x2="10" y2="11" />
      <rect x="2.8" y="4" width="1.4" height="4" rx="0.4" fill="currentColor" stroke="none" />
      <rect x="5.8" y="4" width="1.4" height="4" rx="0.4" fill="currentColor" stroke="none" />
      <rect x="8.8" y="4" width="1.4" height="4" rx="0.4" fill="currentColor" stroke="none" />
    </svg>
  );

  // Default midi / synth — waveform bars
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="1.5" y="5" width="2" height="5" rx="0.4" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="4.5" y="3.5" width="2" height="6.5" rx="0.4" fill="currentColor" stroke="none" opacity="0.7" />
      <rect x="7.5" y="2" width="2" height="8" rx="0.4" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="10.5" y="5" width="2" height="5" rx="0.4" fill="currentColor" stroke="none" opacity="0.6" />
    </svg>
  );
}

function genId() { return Math.random().toString(36).substr(2, 9); }

const DEFAULT_HEIGHT = 58;
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 120;

export default function TrackList({ session, dispatch, trackHeights = {}, setTrackHeight }) {
  const [editingId, setEditingId]       = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [showAddMenu, setShowAddMenu]   = useState(false);

  const startResize = (e, trackId) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = trackHeights[trackId] ?? DEFAULT_HEIGHT;

    const onMove = (ev) => {
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)));
      setTrackHeight?.(trackId, newH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const addTrack = (type) => {
    dispatch({
      type: 'ADD_TRACK',
      track: {
        id: genId(),
        name: type === 'drum' ? 'Drums' : type === 'midi' ? 'MIDI' : type === 'audio' ? 'Audio' : 'AI Track',
        type,
        color: TRACK_COLORS[session.tracks.length % TRACK_COLORS.length],
        muted: false, solo: false, armed: false,
        volume: 0.8, pan: 0, reverb: 0, delay: 0, eq: { low: 0, mid: 0, high: 0 },
        clips: [],
      }
    });
    setShowAddMenu(false);
  };

  return (
    <div className="track-list">
      <div className="track-list-header">
        <span>Tracks</span>
        <span className="track-list-count">{session.tracks.length}</span>
      </div>

      <div className="track-list-body">
        {session.tracks.map((track, idx) => (
          <div
            key={track.id}
            className={`track-row${session.selectedTrackId === track.id ? ' selected' : ''}${track.muted ? ' muted' : ''}`}
            style={{ height: trackHeights[track.id] ?? DEFAULT_HEIGHT }}
            onClick={() => dispatch({ type: 'SELECT_TRACK', trackId: track.id })}
          >
            {/* Left accent bar = track color */}
            <div className="track-color-bar" style={{ background: track.color }} />

            <div className="track-row-body">
              {/* Top row: icon + name + arm */}
              <div className="track-row-top">
                <span className="track-icon" style={{ color: track.color }}>
                  <TypeIcon type={track.type} instrument={track.instrument} />
                </span>

                {editingId === track.id ? (
                  <input
                    className="track-name-input"
                    defaultValue={track.name}
                    autoFocus
                    onBlur={e => {
                      dispatch({ type: 'UPDATE_TRACK', trackId: track.id, changes: { name: e.target.value } });
                      setEditingId(null);
                    }}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="track-name"
                    onDoubleClick={e => { e.stopPropagation(); setEditingId(track.id); }}
                    title="Double-click to rename"
                  >
                    {track.name}
                  </span>
                )}

                <div className="track-row-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="track-btn delete-btn"
                    onClick={() => dispatch({ type: 'REMOVE_TRACK', trackId: track.id })}
                    title="Delete track"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Bottom row: M / S / R + volume fader + color swatch — all on the same line */}
              <div className="track-row-bottom" onClick={e => e.stopPropagation()}>
                <button
                  className={`track-ms-btn${track.muted ? ' ms-active muted' : ''}`}
                  onClick={() => dispatch({ type: 'MUTE_TRACK', trackId: track.id })}
                  title="Mute (M)"
                >M</button>
                <button
                  className={`track-ms-btn${track.solo ? ' ms-active solo' : ''}`}
                  onClick={() => dispatch({ type: 'SOLO_TRACK', trackId: track.id })}
                  title="Solo (S)"
                >S</button>
                <button
                  className={`track-ms-btn arm-btn${session.armedTrackId === track.id ? ' armed' : ''}`}
                  onClick={() => dispatch({ type: 'ARM_TRACK', trackId: track.id })}
                  title="Arm for recording"
                >R</button>

                <input
                  className="track-fader"
                  type="range" min={0} max={1} step={0.01}
                  value={track.volume}
                  style={{ '--fill': `${track.volume * 100}%` }}
                  title={`Volume: ${Math.round(track.volume * 100)}%`}
                  onChange={e => dispatch({ type: 'SET_TRACK_VOLUME', trackId: track.id, volume: parseFloat(e.target.value) })}
                />

                <div
                  className="color-swatch"
                  style={{ background: track.color }}
                  onClick={e => { e.stopPropagation(); setShowColorPicker(showColorPicker === track.id ? null : track.id); }}
                  title="Change color"
                />
                {showColorPicker === track.id && (
                  <div className="color-picker" onClick={e => e.stopPropagation()}>
                    {TRACK_COLORS.map(c => (
                      <div key={c} className="color-option" style={{ background: c }}
                        onClick={() => { dispatch({ type: 'UPDATE_TRACK', trackId: track.id, changes: { color: c } }); setShowColorPicker(null); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div
              className="track-resize-handle"
              onPointerDown={e => startResize(e, track.id)}
            />
          </div>
        ))}
      </div>

      <div className="track-list-footer">
        <button className="add-track-btn" onClick={() => setShowAddMenu(!showAddMenu)}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="5.5" y1="1" x2="5.5" y2="10" /><line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
          Add Track
        </button>
        {showAddMenu && (
          <div className="add-track-menu">
            <button onClick={() => addTrack('midi')}>
              <span style={{color:'#6ba3c4'}}>▪</span> MIDI Track
            </button>
            <button onClick={() => addTrack('drum')}>
              <span style={{color:'#c4a882'}}>▪</span> Drum Track
            </button>
            <button onClick={() => addTrack('audio')}>
              <span style={{color:'#6bc49b'}}>▪</span> Audio Track
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
