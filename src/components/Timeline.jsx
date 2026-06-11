import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';

const BASE_BAR_WIDTH = 80;
const BARS = 16;

function timeToBar(timeStr) {
  if (!timeStr) return 0;
  const p = String(timeStr).split(':').map(Number);
  return (p[0] || 0) + (p[1] || 0) / 4 + (p[2] || 0) / 16;
}

function noteToY(note) {
  if (!note) return 0.5;
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = String(note).match(/^([A-G]#?)(\d+)$/);
  if (!m) return 0.5;
  const semi = parseInt(m[2]) * 12 + NAMES.indexOf(m[1]);
  return 1 - Math.max(0, Math.min(1, (semi - 28) / 56));
}

function MidiPreview({ notes, length }) {
  if (!notes?.length) return null;
  return (
    <svg className="clip-svg-preview" viewBox={`0 0 ${length} 1`} preserveAspectRatio="none">
      {notes.map((n, i) => {
        const x = timeToBar(n.time);
        const y = noteToY(n.note);
        return (
          <rect key={i} x={x} y={Math.max(0, y - 0.06)} width={0.1} height={0.12}
            fill="currentColor" opacity={(n.velocity || 0.7) * 0.75} />
        );
      })}
    </svg>
  );
}

function AudioPreview({ length }) {
  const bars = Math.max(1, Math.round(length));
  const points = Array.from({ length: bars * 4 }, (_, i) => {
    const h = 0.3 + 0.5 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7));
    return `${(i / (bars * 4)) * bars},${0.5 - h / 2} ${(i / (bars * 4)) * bars},${0.5 + h / 2}`;
  }).join(' ');
  return (
    <svg className="clip-svg-preview" viewBox={`0 0 ${bars} 1`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="0.04" opacity="0.55" />
    </svg>
  );
}

function DrumPreview({ notes, length }) {
  if (!notes?.length) return null;
  const DRUM_Y = { kick: 0.82, snare: 0.48, hihat: 0.16, openhat: 0.22, clap: 0.44 };
  const DRUM_H = { kick: 0.28, snare: 0.2, hihat: 0.13, openhat: 0.16, clap: 0.2 };
  return (
    <svg className="clip-svg-preview" viewBox={`0 0 ${length} 1`} preserveAspectRatio="none">
      {notes.map((n, i) => {
        const x = timeToBar(n.time);
        const cy = DRUM_Y[n.drum] ?? 0.5;
        const h = DRUM_H[n.drum] ?? 0.15;
        return (
          <rect key={i} x={x} y={cy - h / 2} width={0.07} height={h}
            fill="currentColor" opacity={(n.velocity || 0.7) * 0.85} />
        );
      })}
    </svg>
  );
}

export default function Timeline({ session, dispatch }) {
  const scrollRef = useRef(null);
  const [playheadX, setPlayheadX] = useState(0);
  const [zoom, setZoom] = useState(1);
  const BAR_WIDTH = Math.round(BASE_BAR_WIDTH * zoom);
  const totalWidth = BARS * BAR_WIDTH;

  useEffect(() => {
    if (!session.isPlaying) { setPlayheadX(0); return; }
    let raf;
    const update = () => {
      const bar = Tone.Transport.ticks / (Tone.Transport.PPQ * 4);
      setPlayheadX(bar * BAR_WIDTH);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session.isPlaying, BAR_WIDTH]);

  const handleRulerClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft;
    const bar = Math.max(0, x / BAR_WIDTH);
    Tone.Transport.ticks = bar * Tone.Transport.PPQ * 4;
    dispatch({ type: 'SET_PLAYHEAD', position: bar });
    setPlayheadX(x);
  };

  const zoomIn  = (e) => { e?.stopPropagation(); setZoom(z => Math.min(4, +(z * 1.5).toFixed(2))); };
  const zoomOut = (e) => { e?.stopPropagation(); setZoom(z => Math.max(0.25, +(z / 1.5).toFixed(2))); };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }
  };

  return (
    <div className="timeline">
      <div className="timeline-scroll" ref={scrollRef} onWheel={handleWheel}>
        <div className="timeline-inner" style={{ width: totalWidth }}>

          <div className="timeline-ruler" onClick={handleRulerClick}>
            {Array.from({ length: BARS }, (_, i) => (
              <div key={i} className="ruler-bar" style={{ left: i * BAR_WIDTH, width: BAR_WIDTH }}>
                <span className="ruler-label">{i + 1}</span>
              </div>
            ))}
            <div className="playhead" style={{ left: playheadX }} />
            <div className="timeline-zoom-controls" onClick={e => e.stopPropagation()}>
              <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
              <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
              <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
            </div>
          </div>

          <div className="timeline-tracks">
            {session.tracks.length === 0 && (
              <div className="timeline-empty">Add a track or ask Flair to build something.</div>
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
                      background: track.color + (clip.type === 'audio' ? '38' : '1e'),
                      borderColor: track.color + '99',
                      color: track.color,
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
                      {clip.type === 'midi' && <MidiPreview notes={clip.notes} length={clip.length} />}
                      {clip.type === 'drum' && <DrumPreview notes={clip.notes} length={clip.length} />}
                      {clip.type === 'audio' && <AudioPreview length={clip.length} />}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

        </div>
      </div>

      {session.aiSuggestions?.length > 0 && (
        <div className="ai-chips">
          {session.aiSuggestions.slice(0, 3).map(chip => (
            <div
              key={chip.id}
              className="ai-chip"
              style={{
                left: (chip.bar || 0) * BAR_WIDTH,
                top: 28 + (session.tracks.findIndex(t => t.id === chip.trackId) || 0) * 52,
              }}
            >
              <span>{chip.message}</span>
              <button className="chip-apply" onClick={() => dispatch({ type: 'REMOVE_AI_SUGGESTION', id: chip.id })}>Apply</button>
              <button className="chip-dismiss" onClick={() => dispatch({ type: 'REMOVE_AI_SUGGESTION', id: chip.id })}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
