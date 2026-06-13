import React, { useState } from 'react';

const TRACK_COLORS = ['#c4a882','#6ba3c4','#9b82c4','#6bc49b','#c46b6b','#c4b86b','#6bc4bc','#c46bb8'];

// Minimal SVG icons that read at 14px
const TypeIcon = ({ type }) => {
  if (type === 'drum') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <ellipse cx="7" cy="4.5" rx="5" ry="2" />
      <line x1="2" y1="4.5" x2="2" y2="9.5" />
      <line x1="12" y1="4.5" x2="12" y2="9.5" />
      <ellipse cx="7" cy="9.5" rx="5" ry="2" />
    </svg>
  );
  if (type === 'midi') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="2" y="4" width="2.5" height="6" rx="0.5" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="5.75" y="5.5" width="2.5" height="4.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.6" />
      <rect x="9.5" y="3" width="2.5" height="7.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.8" />
    </svg>
  );
  if (type === 'audio') return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M1.5 7c1-3 1.5-3 2.5 0s1.5 3 2.5 0 1.5-3 2.5 0 1.5 3 2.5 0" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M5 5.5a2 2 0 0 1 4 0c0 1.5-2 2.5-2 3.5" />
      <circle cx="7" cy="11" r="0.6" fill="currentColor" />
    </svg>
  );
};

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function TrackList({ session, dispatch }) {
  const [editingId, setEditingId]       = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [showAddMenu, setShowAddMenu]   = useState(false);

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
            onClick={() => dispatch({ type: 'SELECT_TRACK', trackId: track.id })}
          >
            {/* Left accent bar = track color */}
            <div className="track-color-bar" style={{ background: track.color }} />

            <div className="track-row-body">
              {/* Top row: icon + name + arm */}
              <div className="track-row-top">
                <span className="track-icon" style={{ color: track.color }}>
                  <TypeIcon type={track.type} />
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
                    className={`track-btn arm-btn${session.armedTrackId === track.id ? ' armed' : ''}`}
                    onClick={() => dispatch({ type: 'ARM_TRACK', trackId: track.id })}
                    title="Arm for recording"
                  >R</button>
                  <button
                    className="track-btn delete-btn"
                    onClick={() => dispatch({ type: 'REMOVE_TRACK', trackId: track.id })}
                    title="Delete track"
                  >
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                      <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Bottom row: M / S + volume fader + color swatch */}
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
