import React, { useState, useCallback } from 'react';

function genId() { return Math.random().toString(36).substr(2, 9); }

export default function DrumSequencer({ session, dispatch }) {
  // Resolve the selected clip — prefer explicitly selected drum clip,
  // then fall back to first drum clip in selected track, then any drum clip.
  const selectedEntry = (() => {
    // Check if selected clip is a drum clip
    for (const t of session.tracks) {
      const c = t.clips.find(c => c.id === session.selectedClipId && c.type === 'drum');
      if (c) return { clip: c, track: t };
    }
    // Fall back to first drum clip on selected track
    const selTrack = session.tracks.find(t => t.id === session.selectedTrackId);
    if (selTrack) {
      const c = selTrack.clips.find(c => c.type === 'drum');
      if (c) return { clip: c, track: selTrack };
    }
    // Any drum clip
    for (const t of session.tracks) {
      const c = t.clips.find(c => c.type === 'drum');
      if (c) return { clip: c, track: t };
    }
    return null;
  })();

  const selectedClip = selectedEntry?.clip || null;
  const selectedTrack = selectedEntry?.track || null;

  // Local pattern state — initialize from clip, reset on clip change
  const [pattern, setPattern] = useState(() =>
    selectedClip?.pattern || Array(16).fill(false)
  );
  const [loadedClipId, setLoadedClipId] = useState(selectedClip?.id || null);

  if (selectedClip?.id !== loadedClipId) {
    setLoadedClipId(selectedClip?.id || null);
    setPattern(selectedClip?.pattern || Array(16).fill(false));
  }

  const steps = pattern.length;

  const toggleStep = useCallback((i) => {
    const newPattern = pattern.map((v, idx) => idx === i ? !v : v);
    setPattern(newPattern);
    if (selectedClip && selectedTrack) {
      dispatch({
        type: 'UPDATE_DRUM_PATTERN',
        trackId: selectedTrack.id,
        clipId: selectedClip.id,
        pattern: newPattern,
      });
    }
  }, [pattern, selectedClip, selectedTrack, dispatch]);

  const handleClear = useCallback(() => {
    const cleared = Array(steps).fill(false);
    setPattern(cleared);
    if (selectedClip && selectedTrack) {
      dispatch({
        type: 'UPDATE_DRUM_PATTERN',
        trackId: selectedTrack.id,
        clipId: selectedClip.id,
        pattern: cleared,
      });
    }
  }, [steps, selectedClip, selectedTrack, dispatch]);

  const handleAddBar = useCallback(() => {
    const extended = [...pattern, ...Array(16).fill(false)];
    setPattern(extended);
    if (selectedClip && selectedTrack) {
      const barsPerStep = (selectedClip.length || 1) / steps;
      const newLength = barsPerStep * extended.length;
      dispatch({
        type: 'UPDATE_DRUM_PATTERN',
        trackId: selectedTrack.id,
        clipId: selectedClip.id,
        pattern: extended,
      });
      dispatch({
        type: 'UPDATE_CLIP',
        trackId: selectedTrack.id,
        clipId: selectedClip.id,
        changes: { length: newLength },
      });
    }
  }, [pattern, steps, selectedClip, selectedTrack, dispatch]);

  const handleNewClip = useCallback(() => {
    if (!selectedTrack) return;
    const clipId = genId();
    dispatch({
      type: 'ADD_CLIP',
      trackId: selectedTrack.id,
      clip: {
        id: clipId,
        type: 'drum',
        name: 'Drum Pattern',
        start: 0,
        length: 1,
        pattern: Array(16).fill(false),
        notes: [],
      },
    });
    dispatch({ type: 'SELECT_CLIP', clipId });
  }, [selectedTrack, dispatch]);

  return (
    <div className="drum-sequencer">
      {/* Header */}
      <div className="drum-seq-header">
        <button
          className="panel-tab"
          onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' })}
        >
          &larr; Mixer
        </button>

        <span className="panel-tab active">
          Drum Sequencer
          {selectedClip ? ` — ${selectedClip.name}` : selectedTrack ? ` — ${selectedTrack.name}` : ''}
        </span>

        {selectedClip && (
          <span className="drum-seq-clip-info">
            {steps} steps &middot; {selectedClip.length || 1} bar{(selectedClip.length || 1) !== 1 ? 's' : ''}
          </span>
        )}

        <div className="drum-seq-actions">
          {selectedClip && (
            <>
              <button
                className="ds-add-bar-btn"
                onClick={handleAddBar}
                title="Add one bar (16 steps)"
              >
                + Bar
              </button>
              <button
                className="pr-clear-btn"
                onClick={handleClear}
                title="Clear all steps"
              >
                Clear
              </button>
            </>
          )}
          {selectedTrack && (
            <button className="pr-add-btn" onClick={handleNewClip}>
              + New Pattern
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!selectedTrack ? (
        <div className="pr-empty">Select a drum track to start editing patterns.</div>
      ) : !selectedClip ? (
        <div className="pr-empty">
          No drum pattern found. Click &quot;+ New Pattern&quot; to create one.
        </div>
      ) : (
        <div className="drum-seq-body">
          {/* Beat group labels (one per 4 steps = one beat) */}
          <div className="drum-seq-beat-labels">
            {Array.from({ length: Math.ceil(steps / 4) }, (_, beat) => (
              <div
                key={beat}
                className="drum-seq-beat-label"
                style={{ width: `${100 / (steps / 4)}%` }}
              >
                {beat + 1}
              </div>
            ))}
          </div>

          {/* Step buttons */}
          <div className="drum-seq-steps">
            {pattern.map((active, i) => {
              const isBarBoundary = i > 0 && i % 4 === 0;
              return (
                <React.Fragment key={i}>
                  {isBarBoundary && <div className="drum-seq-bar-sep" />}
                  <button
                    className={`drum-step${active ? ' active' : ''}`}
                    style={active ? {
                      background: 'var(--amber-bright)',
                      borderColor: 'var(--amber-bright)',
                      boxShadow: '0 0 10px rgba(245,166,35,0.7), 0 0 22px rgba(245,166,35,0.3)',
                    } : {}}
                    onClick={() => toggleStep(i)}
                    title={`Step ${i + 1}`}
                    aria-pressed={active}
                  />
                </React.Fragment>
              );
            })}
          </div>

          {/* Step number labels */}
          <div className="drum-seq-step-labels">
            {pattern.map((_, i) => {
              const isBarBoundary = i > 0 && i % 4 === 0;
              return (
                <React.Fragment key={i}>
                  {isBarBoundary && <div className="drum-seq-bar-sep-label" />}
                  <span className="drum-step-label">{i + 1}</span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
