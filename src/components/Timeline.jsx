import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';

const BARS = 16;
const BAR_WIDTH = 80;

export default function Timeline({ session, dispatch }) {
  const containerRef = useRef(null);
  const [playheadX, setPlayheadX] = useState(0);

  useEffect(() => {
    if (!session.isPlaying) { setPlayheadX(0); return; }
    let raf;
    const update = () => {
      const ticks = Tone.Transport.ticks;
      const ppq = Tone.Transport.PPQ;
      const bar = ticks / (ppq * 4);
      setPlayheadX(bar * BAR_WIDTH);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session.isPlaying]);

  const handleTimelineClick = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bar = Math.max(0, x / BAR_WIDTH);
    const ticks = bar * Tone.Transport.PPQ * 4;
    Tone.Transport.ticks = ticks;
    dispatch({ type: 'SET_PLAYHEAD', position: bar });
    setPlayheadX(x);
  };

  const hasNoTracks = session.tracks.length === 0;

  return (
    <div className="timeline" ref={containerRef}>
      <div className="timeline-ruler" onClick={handleTimelineClick}>
        {Array.from({ length: BARS }, (_, i) => (
          <div key={i} className="ruler-bar" style={{ left: i * BAR_WIDTH }}>
            <span className="ruler-label">{i + 1}</span>
          </div>
        ))}
        <div className="playhead" style={{ left: playheadX }} />
      </div>

      <div className="timeline-tracks">
        {hasNoTracks && (
          <div className="timeline-empty">
            Add a track to get started, or ask Flair to build something.
          </div>
        )}
        {session.tracks.map(track => (
          <div key={track.id} className="timeline-lane">
            {track.clips.map(clip => (
              <div
                key={clip.id}
                className={`clip clip-${clip.type}`}
                style={{
                  left: clip.start * BAR_WIDTH,
                  width: clip.length * BAR_WIDTH - 2,
                  background: track.color + '33',
                  borderColor: track.color,
                }}
                onClick={() => dispatch({ type: 'SELECT_TRACK', trackId: track.id })}
                onDoubleClick={() => {
                  if (clip.type === 'midi') {
                    dispatch({ type: 'SET_OPEN_PANEL', panel: 'pianoroll' });
                    dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
                  }
                }}
              >
                <span className="clip-name">{clip.name}</span>
                <div className="clip-preview">
                  {clip.type === 'midi' && clip.notes.slice(0, 20).map((n, i) => (
                    <div key={i} className="note-dot" style={{ left: `${(i / 20) * 100}%` }} />
                  ))}
                  {clip.type === 'drum' && clip.notes.slice(0, 16).map((n, i) => (
                    <div key={i} className="drum-dot" style={{ left: `${(i / 16) * 100}%`, opacity: n.velocity || 0.8 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="ai-chips">
        {session.aiSuggestions.slice(0, 3).map(chip => (
          <div
            key={chip.id}
            className="ai-chip"
            style={{
              left: (chip.bar || 0) * BAR_WIDTH,
              top: 40 + (session.tracks.findIndex(t => t.id === chip.trackId) || 0) * 56
            }}
          >
            <span>{chip.message}</span>
            <button className="chip-apply" onClick={() => dispatch({ type: 'REMOVE_AI_SUGGESTION', id: chip.id })}>Apply</button>
            <button className="chip-dismiss" onClick={() => dispatch({ type: 'REMOVE_AI_SUGGESTION', id: chip.id })}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
