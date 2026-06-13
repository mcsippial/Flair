import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { useWaveform } from './useWaveform';

const BASE_BAR_WIDTH = 80;
const MIN_BARS = 16;

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

// Placeholder shown only while the real waveform is still decoding.
function AudioPlaceholder({ length }) {
  const bars = Math.max(1, Math.round(length));
  const points = Array.from({ length: bars * 4 }, (_, i) => {
    const h = 0.3 + 0.5 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7));
    return `${(i / (bars * 4)) * bars},${0.5 - h / 2} ${(i / (bars * 4)) * bars},${0.5 + h / 2}`;
  }).join(' ');
  return (
    <svg className="clip-svg-preview" viewBox={`0 0 ${bars} 1`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="0.04" opacity="0.25" />
    </svg>
  );
}

// Real waveform: decodes the stem's audio and draws actual amplitude peaks,
// windowed to the clip's trimmed region (offset → offset+length).
function AudioPreview({ clip, bpm }) {
  const data = useWaveform(clip.audioUrl);
  if (!data) return <AudioPlaceholder length={clip.length} />;

  const { peaks, duration } = data;
  let from = 0, to = peaks.length;
  if (duration > 0) {
    const secPerBar = (60 / (bpm || 120)) * 4;
    const offset = clip.offset || 0;
    const lenSec = (clip.length || 0) * secPerBar;
    from = Math.max(0, Math.floor((offset / duration) * peaks.length));
    to = Math.min(peaks.length, Math.ceil(((offset + lenSec) / duration) * peaks.length));
  }
  const slice = peaks.slice(from, Math.max(from + 1, to));
  const n = slice.length;

  return (
    <svg className="clip-svg-preview" viewBox={`0 0 ${n} 1`} preserveAspectRatio="none">
      {slice.map((v, i) => {
        const h = Math.max(0.02, v * 0.92);
        return (
          <line key={i} x1={i + 0.5} x2={i + 0.5}
            y1={0.5 - h / 2} y2={0.5 + h / 2}
            stroke="currentColor" strokeWidth={0.85} opacity={0.7} />
        );
      })}
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

// Visual fade ramps over a clip, from fadeIn/fadeOut seconds vs clip duration.
function FadeOverlay({ clip, bpm }) {
  const secPerBar = (60 / (bpm || 120)) * 4;
  const durSec = (clip.length || 0) * secPerBar;
  if (!durSec) return null;
  const fin = Math.min(1, (clip.fadeIn || 0) / durSec);
  const fout = Math.min(1, (clip.fadeOut || 0) / durSec);
  if (!fin && !fout) return null;
  return (
    <svg className="clip-fade-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
      {fin > 0 && (
        <polygon points={`0,0 ${fin},0 0,1`} fill="rgba(10,12,16,0.55)" />
      )}
      {fout > 0 && (
        <polygon points={`${1 - fout},0 1,0 1,1`} fill="rgba(10,12,16,0.55)" />
      )}
    </svg>
  );
}

export default function Timeline({ session, dispatch }) {
  const scrollRef = useRef(null);
  const [playheadX, setPlayheadX] = useState(0);
  const [zoom, setZoom] = useState(1);
  const BAR_WIDTH = Math.round(BASE_BAR_WIDTH * zoom);

  // Grow the timeline to fit the longest clip (+2 bars of headroom).
  const contentBars = session.tracks.reduce((max, t) => {
    const end = (t.clips || []).reduce((m, c) => Math.max(m, (c.start || 0) + (c.length || 0)), 0);
    return Math.max(max, end);
  }, 0);
  const BARS = Math.max(MIN_BARS, Math.ceil(contentBars) + 2);
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

  // ─── Clip editing: drag to move, trim from either edge ──────────────────────
  // Live updates are non-undoable; a single history snapshot is pushed on grab,
  // so one Undo reverts the whole drag.
  const startDrag = (e, track, clip, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const orig = { start: clip.start, length: clip.length, offset: clip.offset || 0 };
    const secPerBar = (60 / (session.bpm || 120)) * 4;
    const fileDur = clip.audioDuration || Infinity;
    dispatch({ type: 'PUSH_HISTORY' });

    const move = (ev) => {
      let dBars = (ev.clientX - startX) / BAR_WIDTH;
      if (!ev.shiftKey) dBars = Math.round(dBars * 4) / 4; // snap to 1/4 bar
      let changes;
      if (mode === 'move') {
        changes = { start: Math.max(0, +(orig.start + dBars).toFixed(4)) };
      } else if (mode === 'trim-left') {
        const ns = Math.max(0, orig.start + dBars);
        const delta = ns - orig.start;
        const nl = orig.length - delta;
        const noff = orig.offset + delta * secPerBar;
        if (nl < 0.25 || noff < 0) return;
        changes = { start: +ns.toFixed(4), length: +nl.toFixed(4), offset: +noff.toFixed(4) };
      } else { // trim-right
        let nl = Math.max(0.25, orig.length + dBars);
        if (orig.offset + nl * secPerBar > fileDur) nl = (fileDur - orig.offset) / secPerBar;
        changes = { length: +nl.toFixed(4) };
      }
      dispatch({ type: 'UPDATE_CLIP_LIVE', trackId: track.id, clipId: clip.id, changes });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Drag a fade handle to set fade-in / fade-out length (stored in seconds).
  const startFade = (e, track, clip, side) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const secPerBar = (60 / (session.bpm || 120)) * 4;
    const lenSec = (clip.length || 0) * secPerBar;
    const orig = side === 'in' ? (clip.fadeIn || 0) : (clip.fadeOut || 0);
    dispatch({ type: 'PUSH_HISTORY' });

    const move = (ev) => {
      const dSec = ((ev.clientX - startX) / BAR_WIDTH) * secPerBar;
      let val = side === 'in' ? orig + dSec : orig - dSec; // out handle grows leftward
      val = Math.max(0, Math.min(lenSec, val));
      const changes = side === 'in' ? { fadeIn: +val.toFixed(3) } : { fadeOut: +val.toFixed(3) };
      dispatch({ type: 'UPDATE_CLIP_LIVE', trackId: track.id, clipId: clip.id, changes });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Split an audio clip at the point you double-click.
  const splitClip = (e, track, clip) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relBars = (e.clientX - rect.left) / BAR_WIDTH;
    const atBar = clip.start + relBars;
    if (relBars > 0.1 && relBars < clip.length - 0.1) {
      dispatch({ type: 'SPLIT_CLIP', trackId: track.id, clipId: clip.id, atBar });
    }
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
                    className={`clip clip-${clip.type}${session.selectedClipId === clip.id ? ' selected' : ''}`}
                    style={{
                      left: clip.start * BAR_WIDTH,
                      width: clip.length * BAR_WIDTH - 2,
                      background: track.color + (clip.type === 'audio' ? '38' : '1e'),
                      borderColor: track.color + '99',
                      color: track.color,
                      cursor: 'grab',
                    }}
                    onPointerDown={e => {
                      // Ignore clicks that land on the trim / fade handles.
                      if (e.target.dataset?.handle) return;
                      dispatch({ type: 'SELECT_TRACK', trackId: track.id });
                      dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
                      startDrag(e, track, clip, 'move');
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      dispatch({ type: 'REMOVE_CLIP', trackId: track.id, clipId: clip.id });
                    }}
                    onDoubleClick={e => {
                      if (clip.type === 'midi') {
                        dispatch({ type: 'SET_OPEN_PANEL', panel: 'pianoroll' });
                        dispatch({ type: 'SELECT_CLIP', clipId: clip.id });
                      } else if (clip.type === 'audio') {
                        splitClip(e, track, clip);
                      }
                    }}
                    title="Drag move · edges trim · top corners fade · dbl-click split · right-click delete · Cmd+D duplicate"
                  >
                    <div
                      className="clip-handle clip-handle-left"
                      data-handle="left"
                      onPointerDown={e => startDrag(e, track, clip, 'trim-left')}
                    />
                    {clip.type === 'audio' && <FadeOverlay clip={clip} bpm={session.bpm} />}
                    <span className="clip-name">{clip.name}</span>
                    <div className="clip-preview">
                      {clip.type === 'midi' && <MidiPreview notes={clip.notes} length={clip.length} />}
                      {clip.type === 'drum' && <DrumPreview notes={clip.notes} length={clip.length} />}
                      {clip.type === 'audio' && <AudioPreview clip={clip} bpm={session.bpm} />}
                    </div>
                    {clip.type === 'audio' && (
                      <>
                        <div
                          className="clip-fade clip-fade-in"
                          data-handle="fade-in"
                          title="Drag to fade in"
                          style={{ left: Math.min(0.95, (clip.fadeIn || 0) / Math.max(0.001, clip.length * (60 / (session.bpm || 120) * 4))) * (clip.length * BAR_WIDTH - 2) }}
                          onPointerDown={e => startFade(e, track, clip, 'in')}
                        />
                        <div
                          className="clip-fade clip-fade-out"
                          data-handle="fade-out"
                          title="Drag to fade out"
                          style={{ right: Math.min(0.95, (clip.fadeOut || 0) / Math.max(0.001, clip.length * (60 / (session.bpm || 120) * 4))) * (clip.length * BAR_WIDTH - 2) }}
                          onPointerDown={e => startFade(e, track, clip, 'out')}
                        />
                      </>
                    )}
                    <div
                      className="clip-handle clip-handle-right"
                      data-handle="right"
                      onPointerDown={e => startDrag(e, track, clip, 'trim-right')}
                    />
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
