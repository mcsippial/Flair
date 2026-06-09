import React, { useRef, useState, useEffect } from 'react';

const NOTES = ['B','A#','A','G#','G','F#','F','E','D#','D','C#','C'];
const OCTAVES = [5,4,3,2];
const ALL_NOTES = OCTAVES.flatMap(oct => NOTES.map(n => `${n}${oct}`));
const NOTE_HEIGHT = 14;
const BEAT_WIDTH = 60;
const BEATS = 16;

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function PianoRoll({ session, dispatch }) {
  const selectedClip = session.tracks.flatMap(t => t.clips).find(c => c.id === session.selectedClipId)
    || session.tracks.flatMap(t => t.clips)[0];
  const selectedTrack = session.tracks.find(t => t.clips.some(c => c === selectedClip));

  const gridRef = useRef(null);
  const [notes, setNotes] = useState(selectedClip?.notes || []);

  useEffect(() => { setNotes(selectedClip?.notes || []); }, [selectedClip?.id]);

  const getNoteAtPos = (x, y) => {
    const noteIdx = Math.floor(y / NOTE_HEIGHT);
    const beat = x / BEAT_WIDTH;
    return { note: ALL_NOTES[noteIdx], beat, noteIdx };
  };

  const handleGridClick = (e) => {
    if (e.button !== 0) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { note, beat } = getNoteAtPos(x, y);
    const beatInt = Math.floor(beat);
    const beatFrac = Math.floor((beat % 1) * 4);
    const newNote = {
      id: genId(),
      time: `${beatInt}:${beatFrac}:0`,
      note,
      duration: '4n',
      velocity: 0.7
    };
    const newNotes = [...notes, newNote];
    setNotes(newNotes);
    if (selectedClip && selectedTrack) {
      dispatch({ type: 'UPDATE_CLIP', trackId: selectedTrack.id, clipId: selectedClip.id, changes: { notes: newNotes } });
    }
  };

  const handleNoteRightClick = (e, noteId) => {
    e.preventDefault();
    const newNotes = notes.filter(n => n.id !== noteId);
    setNotes(newNotes);
    if (selectedClip && selectedTrack) {
      dispatch({ type: 'UPDATE_CLIP', trackId: selectedTrack.id, clipId: selectedClip.id, changes: { notes: newNotes } });
    }
  };

  return (
    <div className="piano-roll">
      <div className="piano-roll-header">
        <button className="panel-tab" onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' })}>← Mixer</button>
        <span className="panel-tab active">Piano Roll{selectedClip ? ` — ${selectedClip.name}` : ''}</span>
        <button className="quantize-btn">Quantize</button>
      </div>
      <div className="piano-roll-body">
        <div className="piano-keys">
          {ALL_NOTES.map(note => {
            const isBlack = note.includes('#');
            return (
              <div key={note} className={`piano-key ${isBlack ? 'black' : 'white'}`} style={{ height: NOTE_HEIGHT }}>
                {!isBlack && <span className="key-label">{note}</span>}
              </div>
            );
          })}
        </div>
        <div className="note-grid" ref={gridRef} onClick={handleGridClick}>
          {Array.from({ length: BEATS }, (_, i) => (
            <div key={i} className="beat-line" style={{ left: i * BEAT_WIDTH }} />
          ))}
          {ALL_NOTES.map((note, i) => (
            <div key={note} className={`note-line ${note.includes('#') ? 'black-line' : ''}`} style={{ top: i * NOTE_HEIGHT }} />
          ))}
          {notes.map(note => {
            const noteIdx = ALL_NOTES.indexOf(note.note);
            if (noteIdx === -1) return null;
            // Parse beat position from time string like "1:2:0"
            let beatPos = 0;
            if (typeof note.time === 'string') {
              const parts = note.time.split(':').map(Number);
              beatPos = (parts[0] || 0) * 4 + (parts[1] || 0) + (parts[2] || 0) / 4;
            } else {
              beatPos = parseFloat(note.time) || 0;
            }
            const durationBeats = note.duration === '4n' ? 1 : note.duration === '8n' ? 0.5 : note.duration === '2n' ? 2 : note.duration === '16n' ? 0.25 : 1;
            return (
              <div
                key={note.id || note.time + note.note}
                className="piano-note"
                style={{
                  top: noteIdx * NOTE_HEIGHT,
                  left: beatPos * BEAT_WIDTH,
                  width: durationBeats * BEAT_WIDTH - 2,
                  height: NOTE_HEIGHT - 1,
                  background: selectedTrack?.color || 'var(--color-amber)',
                }}
                onContextMenu={e => handleNoteRightClick(e, note.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
