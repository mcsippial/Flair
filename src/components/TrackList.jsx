import React, { useState } from 'react';

const TRACK_COLORS = ['#c4a882','#6ba3c4','#9b82c4','#6bc49b','#c46b6b','#c4b86b','#6bc4bc','#c46bb8'];
const TRACK_ICONS = { drum: '🥁', midi: '🎹', audio: '🎙', ai: '🤖' };

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function TrackList({ session, dispatch }) {
  const [editingId, setEditingId] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

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
      <div className="track-list-header"><span>Tracks</span></div>

      <div className="track-list-body">
        {session.tracks.map((track, idx) => (
          <div
            key={track.id}
            className={`track-row${session.selectedTrackId === track.id ? ' selected' : ''}`}
            onClick={() => dispatch({ type: 'SELECT_TRACK', trackId: track.id })}
          >
            <div className="track-color-bar" style={{ background: track.color }} />
            <span className="track-num">{idx + 1}</span>
            <span className="track-icon">{TRACK_ICONS[track.type] || '🎹'}</span>

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
              <span className="track-name" onDoubleClick={e => { e.stopPropagation(); setEditingId(track.id); }}>
                {track.name}
              </span>
            )}

            <div className="track-controls" onClick={e => e.stopPropagation()}>
              <div
                className="color-swatch"
                style={{ background: track.color }}
                onClick={e => { e.stopPropagation(); setShowColorPicker(showColorPicker === track.id ? null : track.id); }}
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
              <button
                className={`track-btn arm-btn${session.armedTrackId === track.id ? ' armed' : ''}`}
                onClick={() => dispatch({ type: 'ARM_TRACK', trackId: track.id })}
                title="Arm for recording">R</button>
              <button className={`track-btn${track.muted ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'MUTE_TRACK', trackId: track.id })}>M</button>
              <button className={`track-btn${track.solo ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SOLO_TRACK', trackId: track.id })}>S</button>
              <button className="track-btn delete-btn"
                onClick={() => dispatch({ type: 'REMOVE_TRACK', trackId: track.id })}
                title="Delete track">×</button>
            </div>

            <input
              className="track-volume"
              type="range" min={0} max={1} step={0.01}
              value={track.volume}
              onChange={e => dispatch({ type: 'SET_TRACK_VOLUME', trackId: track.id, volume: parseFloat(e.target.value) })}
              onClick={e => e.stopPropagation()}
            />
          </div>
        ))}
      </div>

      <div className="track-list-footer">
        <button className="add-track-btn" onClick={() => setShowAddMenu(!showAddMenu)}>+ Add Track</button>
        {showAddMenu && (
          <div className="add-track-menu">
            <button onClick={() => addTrack('midi')}>🎹 MIDI Track</button>
            <button onClick={() => addTrack('drum')}>🥁 Drum Track</button>
            <button onClick={() => addTrack('audio')}>🎙 Audio Track</button>
          </div>
        )}
      </div>
    </div>
  );
}
