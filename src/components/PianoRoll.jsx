import React, { useRef, useState, useEffect, useCallback } from 'react';

const NOTES = ['B','A#','A','G#','G','F#','F','E','D#','D','C#','C'];
const FLAT_MAP = { 'Eb':'D#', 'Ab':'G#', 'Bb':'A#', 'Db':'C#', 'Gb':'F#' };
function normalizeNoteName(n) {
  if (!n) return n;
  const flat = n.slice(0, -1);
  return FLAT_MAP[flat] ? FLAT_MAP[flat] + n.slice(-1) : n;
}
const OCTAVES = [5,4,3,2];
const ALL_NOTES = OCTAVES.flatMap(oct => NOTES.map(n => `${n}${oct}`));
const NOTE_HEIGHT = 14;
const BEAT_WIDTH = 60;
const BEATS = 16;
const VEL_LANE_H = 52;

function pitchToNote(pitch) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const oct = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${oct}`;
}

function normalizeNote(n, idx) {
  const id = n.id || String(idx);
  let noteName = normalizeNoteName(n.note);
  if (!noteName && n.pitch != null) noteName = pitchToNote(n.pitch);

  let time = n.time;
  if (time == null && n.start != null) {
    const beats = n.start * 4;
    const bar  = Math.floor(beats / 4);
    const beat = Math.floor(beats % 4);
    time = `${bar}:${beat}:0`;
  }

  let duration = n.duration;
  if (typeof duration === 'number') {
    const beats = duration * 4;
    duration = beats >= 2 ? '2n' : beats >= 1 ? '4n' : beats >= 0.5 ? '8n' : '16n';
  }
  duration = duration || '4n';

  return { id, note: noteName || 'C4', time: time || '0:0:0', duration, velocity: n.velocity ?? 0.7 };
}

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function PianoRoll({ session, dispatch }) {
  const selectedClip = session.tracks.flatMap(t => t.clips).find(c => c.id === session.selectedClipId)
    || session.tracks.flatMap(t => t.clips).find(c => (c.notes?.length || 0) > 0)
    || null;
  const selectedTrack = session.tracks.find(t => t.clips.some(c => c === selectedClip))
    || session.tracks.find(t => t.id === session.selectedTrackId)
    || session.tracks[0]
    || null;

  const gridRef = useRef(null);
  const keysRef = useRef(null);
  const velRef  = useRef(null);
  const [quantize, setQuantize] = useState('4n');
  const [rawNotes, setRawNotes] = useState(() => (selectedClip?.notes || []).map(normalizeNote));
  const [draggingVel, setDraggingVel] = useState(null); // noteId being dragged

  useEffect(() => {
    setRawNotes((selectedClip?.notes || []).map(normalizeNote));
  }, [selectedClip?.id]);

  const sync = useCallback((newNotes) => {
    setRawNotes(newNotes);
    if (selectedClip && selectedTrack) {
      dispatch({ type: 'UPDATE_CLIP', trackId: selectedTrack.id, clipId: selectedClip.id, changes: { notes: newNotes } });
    }
  }, [selectedClip, selectedTrack, dispatch]);

  // Sync horizontal scroll between grid and velocity lane
  const handleGridScroll = () => {
    if (keysRef.current && gridRef.current)
      keysRef.current.scrollTop = gridRef.current.scrollTop;
    if (velRef.current && gridRef.current)
      velRef.current.scrollLeft = gridRef.current.scrollLeft;
  };
  const handleVelScroll = () => {
    if (gridRef.current && velRef.current)
      gridRef.current.scrollLeft = velRef.current.scrollLeft;
  };

  const handleGridClick = (e) => {
    if (e.button !== 0 || !selectedTrack) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + gridRef.current.scrollLeft;
    const y = e.clientY - rect.top  + gridRef.current.scrollTop;

    const noteIdx = Math.floor(y / NOTE_HEIGHT);
    if (noteIdx < 0 || noteIdx >= ALL_NOTES.length) return;

    const beat = x / BEAT_WIDTH;
    const qMap = { '16n': 0.25, '8n': 0.5, '4n': 1, '2n': 2 };
    const qGrid = qMap[quantize] || 1;
    const snappedBeat = Math.floor(beat / qGrid) * qGrid;
    const bar  = Math.floor(snappedBeat / 4);
    const beatInBar = snappedBeat % 4;

    const newNote = {
      id: genId(),
      note: ALL_NOTES[noteIdx],
      time: `${bar}:${Math.floor(beatInBar)}:0`,
      duration: quantize,
      velocity: 0.8,
    };

    if (!selectedClip) {
      const clipId = genId();
      dispatch({ type: 'ADD_CLIP', trackId: selectedTrack.id, clip: { id: clipId, type: 'synth', name: 'New Clip', start: 0, length: 4, notes: [newNote] } });
      dispatch({ type: 'SELECT_CLIP', clipId });
      setRawNotes([newNote]);
      return;
    }

    sync([...rawNotes, newNote]);
  };

  const handleNoteRightClick = (e, noteId) => {
    e.preventDefault();
    sync(rawNotes.filter(n => n.id !== noteId));
  };

  // Velocity lane drag
  const handleVelPointerDown = (e, noteId) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingVel(noteId);
    updateVelocity(e, noteId);
  };

  const updateVelocity = (e, noteId) => {
    const rect = e.currentTarget.closest('.vel-bar-hit')?.getBoundingClientRect()
      || e.currentTarget.getBoundingClientRect();
    const laneEl = velRef.current;
    if (!laneEl) return;
    const laneRect = laneEl.getBoundingClientRect();
    const y = e.clientY - laneRect.top;
    const vel = Math.max(0.05, Math.min(1, 1 - y / VEL_LANE_H));
    sync(rawNotes.map(n => n.id === noteId ? { ...n, velocity: +vel.toFixed(2) } : n));
  };

  const handleVelPointerMove = (e) => {
    if (!draggingVel) return;
    updateVelocity(e, draggingVel);
  };

  const handleVelPointerUp = () => setDraggingVel(null);

  const handleAddClip = () => {
    if (!selectedTrack) return;
    const clipId = genId();
    dispatch({ type: 'ADD_CLIP', trackId: selectedTrack.id, clip: { id: clipId, type: 'synth', name: 'New Clip', start: 0, length: 4, notes: [] } });
    dispatch({ type: 'SELECT_CLIP', clipId });
    setRawNotes([]);
  };

  const handleClear = () => sync([]);

  const noteToPos = (note) => {
    const noteIdx = ALL_NOTES.indexOf(note.note);
    let beatPos = 0;
    if (typeof note.time === 'string') {
      const [bar = 0, beat = 0, tick = 0] = note.time.split(':').map(Number);
      beatPos = bar * 4 + beat + tick / 4;
    } else {
      beatPos = parseFloat(note.time) || 0;
    }
    const qMap = { '16n': 0.25, '8n': 0.5, '4n': 1, '2n': 2 };
    const durationBeats = qMap[note.duration] ?? 1;
    return { noteIdx, beatPos, durationBeats };
  };

  const trackColor = selectedTrack?.color || 'var(--amber)';
  const noTrack = !selectedTrack;

  return (
    <div className="piano-roll">
      <div className="piano-roll-header">
        <button className="panel-tab" onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' })}>← Mixer</button>
        <span className="panel-tab active">
          Piano Roll{selectedClip ? ` — ${selectedClip.name}` : selectedTrack ? ` — ${selectedTrack.name}` : ''}
        </span>

        <div className="pr-quantize">
          <span className="pr-q-label">Q</span>
          {['16n','8n','4n','2n'].map(q => (
            <button key={q} className={`pr-q-btn${quantize === q ? ' active' : ''}`} onClick={() => setQuantize(q)}>{q}</button>
          ))}
        </div>

        <div className="pr-actions">
          {selectedClip && (
            <button className="pr-clear-btn" onClick={handleClear} title="Clear all notes">Clear</button>
          )}
          {!noTrack && (
            <button className="pr-add-btn" onClick={handleAddClip}>+ New Clip</button>
          )}
        </div>
      </div>

      {noTrack ? (
        <div className="pr-empty">Select a track to start editing notes.</div>
      ) : (
        <>
          <div className="piano-roll-body">
            <div className="piano-keys" ref={keysRef} style={{ overflowY: 'hidden' }}>
              {ALL_NOTES.map(note => {
                const isBlack = note.includes('#');
                return (
                  <div key={note} className={`piano-key ${isBlack ? 'black' : 'white'}`} style={{ height: NOTE_HEIGHT }}>
                    {!isBlack && <span className="key-label">{note}</span>}
                  </div>
                );
              })}
            </div>
            <div className="note-grid" ref={gridRef} onClick={handleGridClick} onScroll={handleGridScroll}>
              {Array.from({ length: BEATS }, (_, i) => (
                <div key={i} className="beat-line" style={{ left: i * BEAT_WIDTH }} />
              ))}
              {ALL_NOTES.map((note, i) => (
                <div key={note} className={`note-line ${note.includes('#') ? 'black-line' : ''}`} style={{ top: i * NOTE_HEIGHT }} />
              ))}
              {rawNotes.map(note => {
                const { noteIdx, beatPos, durationBeats } = noteToPos(note);
                if (noteIdx === -1) return null;
                return (
                  <div
                    key={note.id}
                    className="piano-note"
                    style={{
                      top: noteIdx * NOTE_HEIGHT,
                      left: beatPos * BEAT_WIDTH,
                      width: Math.max(4, durationBeats * BEAT_WIDTH - 2),
                      height: NOTE_HEIGHT - 1,
                      background: trackColor,
                      opacity: 0.4 + (note.velocity ?? 0.8) * 0.6,
                      boxShadow: `0 0 6px ${trackColor}66`,
                    }}
                    onContextMenu={e => handleNoteRightClick(e, note.id)}
                  />
                );
              })}
              {rawNotes.length === 0 && (
                <div className="pr-grid-hint">Click to place notes · Right-click to delete</div>
              )}
            </div>
          </div>

          {/* Velocity lane */}
          <div className="vel-lane-row">
            <div className="vel-lane-label">VEL</div>
            <div
              className="vel-lane"
              ref={velRef}
              style={{ height: VEL_LANE_H }}
              onScroll={handleVelScroll}
              onPointerMove={handleVelPointerMove}
              onPointerUp={handleVelPointerUp}
            >
              <div className="vel-lane-inner" style={{ width: BEATS * BEAT_WIDTH }}>
                {rawNotes.map(note => {
                  const { beatPos } = noteToPos(note);
                  const vel = note.velocity ?? 0.8;
                  const barH = Math.max(4, vel * (VEL_LANE_H - 4));
                  return (
                    <div
                      key={note.id}
                      className={`vel-bar-hit${draggingVel === note.id ? ' dragging' : ''}`}
                      style={{ left: beatPos * BEAT_WIDTH, width: Math.max(6, BEAT_WIDTH * 0.5) }}
                      onPointerDown={e => handleVelPointerDown(e, note.id)}
                    >
                      <div
                        className="vel-bar"
                        style={{
                          height: barH,
                          background: trackColor,
                          opacity: 0.5 + vel * 0.5,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


const NOTES = ['B','A#','A','G#','G','F#','F','E','D#','D','C#','C'];
const FLAT_MAP = { 'Eb':'D#', 'Ab':'G#', 'Bb':'A#', 'Db':'C#', 'Gb':'F#' };
function normalizeNoteName(n) {
  if (!n) return n;
  const flat = n.slice(0, -1);
  return FLAT_MAP[flat] ? FLAT_MAP[flat] + n.slice(-1) : n;
};
const OCTAVES = [5,4,3,2];
const ALL_NOTES = OCTAVES.flatMap(oct => NOTES.map(n => `${n}${oct}`));
const NOTE_HEIGHT = 14;
const BEAT_WIDTH = 60;
const BEATS = 16;

// MIDI pitch number → note string (e.g. 60 → "C4")
function pitchToNote(pitch) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const oct = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${oct}`;
}

// Normalize any note format into { id, note (string), time (string), duration (string), velocity }
function normalizeNote(n, idx) {
  const id = n.id || String(idx);
  let noteName = normalizeNoteName(n.note);
  if (!noteName && n.pitch != null) noteName = pitchToNote(n.pitch);

  let time = n.time;
  if (time == null && n.start != null) {
    const beats = n.start * 4; // n.start is in bars
    const bar  = Math.floor(beats / 4);
    const beat = Math.floor(beats % 4);
    time = `${bar}:${beat}:0`;
  }

  let duration = n.duration;
  if (typeof duration === 'number') {
    // duration in bars → nearest named value
    const beats = duration * 4;
    duration = beats >= 2 ? '2n' : beats >= 1 ? '4n' : beats >= 0.5 ? '8n' : '16n';
  }
  duration = duration || '4n';

  return { id, note: noteName || 'C4', time: time || '0:0:0', duration, velocity: n.velocity ?? 0.7 };
}

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function PianoRoll({ session, dispatch }) {
  const selectedClip = session.tracks.flatMap(t => t.clips).find(c => c.id === session.selectedClipId)
    || session.tracks.flatMap(t => t.clips).find(c => (c.notes?.length || 0) > 0)
    || null;
  const selectedTrack = session.tracks.find(t => t.clips.some(c => c === selectedClip))
    || session.tracks.find(t => t.id === session.selectedTrackId)
    || session.tracks[0]
    || null;

  const gridRef = useRef(null);
  const keysRef = useRef(null);
  const [quantize, setQuantize] = useState('4n');
  const [rawNotes, setRawNotes] = useState(() => (selectedClip?.notes || []).map(normalizeNote));

  useEffect(() => {
    setRawNotes((selectedClip?.notes || []).map(normalizeNote));
  }, [selectedClip?.id]);

  const sync = useCallback((newNotes) => {
    setRawNotes(newNotes);
    if (selectedClip && selectedTrack) {
      dispatch({ type: 'UPDATE_CLIP', trackId: selectedTrack.id, clipId: selectedClip.id, changes: { notes: newNotes } });
    }
  }, [selectedClip, selectedTrack, dispatch]);

  const handleGridScroll = () => {
    if (keysRef.current && gridRef.current)
      keysRef.current.scrollTop = gridRef.current.scrollTop;
  };

  const handleGridClick = (e) => {
    if (e.button !== 0 || !selectedTrack) return;
    const rect = gridRef.current.getBoundingClientRect();
    // Account for scroll so note lands where you clicked, not offset by scrollTop
    const x = e.clientX - rect.left + gridRef.current.scrollLeft;
    const y = e.clientY - rect.top  + gridRef.current.scrollTop;

    const noteIdx = Math.floor(y / NOTE_HEIGHT);
    if (noteIdx < 0 || noteIdx >= ALL_NOTES.length) return;

    const beat = x / BEAT_WIDTH;
    const qMap = { '16n': 0.25, '8n': 0.5, '4n': 1, '2n': 2 };
    const qGrid = qMap[quantize] || 1;
    const snappedBeat = Math.floor(beat / qGrid) * qGrid;
    const bar  = Math.floor(snappedBeat / 4);
    const beatInBar = snappedBeat % 4;

    const newNote = {
      id: genId(),
      note: ALL_NOTES[noteIdx],
      time: `${bar}:${Math.floor(beatInBar)}:0`,
      duration: quantize,
      velocity: 0.8,
    };

    // If we don't have a clip yet, create one on the selected track first
    if (!selectedClip) {
      const clipId = genId();
      dispatch({ type: 'ADD_CLIP', trackId: selectedTrack.id, clip: { id: clipId, type: 'synth', name: 'New Clip', start: 0, length: 4, notes: [newNote] } });
      dispatch({ type: 'SELECT_CLIP', clipId });
      setRawNotes([newNote]);
      return;
    }

    sync([...rawNotes, newNote]);
  };

  const handleNoteRightClick = (e, noteId) => {
    e.preventDefault();
    sync(rawNotes.filter(n => n.id !== noteId));
  };

  const handleAddClip = () => {
    if (!selectedTrack) return;
    const clipId = genId();
    dispatch({ type: 'ADD_CLIP', trackId: selectedTrack.id, clip: { id: clipId, type: 'synth', name: 'New Clip', start: 0, length: 4, notes: [] } });
    dispatch({ type: 'SELECT_CLIP', clipId });
    setRawNotes([]);
  };

  const handleClear = () => sync([]);

  // Render position for a normalized note
  const noteToPos = (note) => {
    const noteIdx = ALL_NOTES.indexOf(note.note);
    let beatPos = 0;
    if (typeof note.time === 'string') {
      const [bar = 0, beat = 0, tick = 0] = note.time.split(':').map(Number);
      beatPos = bar * 4 + beat + tick / 4;
    } else {
      beatPos = parseFloat(note.time) || 0;
    }
    const qMap = { '16n': 0.25, '8n': 0.5, '4n': 1, '2n': 2 };
    const durationBeats = qMap[note.duration] ?? 1;
    return { noteIdx, beatPos, durationBeats };
  };

  const trackColor = selectedTrack?.color || 'var(--amber)';
  const noTrack = !selectedTrack;

  return (
    <div className="piano-roll">
      <div className="piano-roll-header">
        <button className="panel-tab" onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' })}>← Mixer</button>
        <span className="panel-tab active">
          Piano Roll{selectedClip ? ` — ${selectedClip.name}` : selectedTrack ? ` — ${selectedTrack.name}` : ''}
        </span>

        <div className="pr-quantize">
          <span className="pr-q-label">Q</span>
          {['16n','8n','4n','2n'].map(q => (
            <button key={q} className={`pr-q-btn${quantize === q ? ' active' : ''}`} onClick={() => setQuantize(q)}>{q}</button>
          ))}
        </div>

        <div className="pr-actions">
          {selectedClip && (
            <button className="pr-clear-btn" onClick={handleClear} title="Clear all notes">Clear</button>
          )}
          {!noTrack && (
            <button className="pr-add-btn" onClick={handleAddClip}>+ New Clip</button>
          )}
        </div>
      </div>

      {noTrack ? (
        <div className="pr-empty">Select a track to start editing notes.</div>
      ) : (
        <div className="piano-roll-body">
          <div className="piano-keys" ref={keysRef} style={{ overflowY: 'hidden' }}>
            {ALL_NOTES.map(note => {
              const isBlack = note.includes('#');
              return (
                <div key={note} className={`piano-key ${isBlack ? 'black' : 'white'}`} style={{ height: NOTE_HEIGHT }}>
                  {!isBlack && <span className="key-label">{note}</span>}
                </div>
              );
            })}
          </div>
          <div className="note-grid" ref={gridRef} onClick={handleGridClick} onScroll={handleGridScroll}>
            {/* Beat lines */}
            {Array.from({ length: BEATS }, (_, i) => (
              <div key={i} className="beat-line" style={{ left: i * BEAT_WIDTH }} />
            ))}
            {/* Note row lines */}
            {ALL_NOTES.map((note, i) => (
              <div key={note} className={`note-line ${note.includes('#') ? 'black-line' : ''}`} style={{ top: i * NOTE_HEIGHT }} />
            ))}
            {/* Notes */}
            {rawNotes.map(note => {
              const { noteIdx, beatPos, durationBeats } = noteToPos(note);
              if (noteIdx === -1) return null;
              return (
                <div
                  key={note.id}
                  className="piano-note"
                  style={{
                    top: noteIdx * NOTE_HEIGHT,
                    left: beatPos * BEAT_WIDTH,
                    width: Math.max(4, durationBeats * BEAT_WIDTH - 2),
                    height: NOTE_HEIGHT - 1,
                    background: trackColor,
                    boxShadow: `0 0 6px ${trackColor}66`,
                  }}
                  onContextMenu={e => handleNoteRightClick(e, note.id)}
                />
              );
            })}
            {/* Placeholder hint when empty */}
            {rawNotes.length === 0 && (
              <div className="pr-grid-hint">Click to place notes · Right-click to delete</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
