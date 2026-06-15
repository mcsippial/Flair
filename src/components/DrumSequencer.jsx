import React, { useCallback } from 'react';

const DEFAULT_STEPS = 16;

export default function DrumSequencer({ session, dispatch }) {
  const selectedClip = session.tracks
    .flatMap(t => t.clips.map(c => ({ ...c, _trackId: t.id })))
    .find(c => c.id === session.selectedClipId && c.type === 'drum')
    || session.tracks
      .flatMap(t => t.clips.map(c => ({ ...c, _trackId: t.id })))
      .find(c => c.type === 'drum')
    || null;

  const selectedTrack = selectedClip
    ? session.tracks.find(t => t.id === selectedClip._trackId)
    : null;

  const pattern = selectedClip?.pattern || Array(DEFAULT_STEPS).fill(false);
  const stepCount = pattern.length;

  const toggleStep = useCallback((i) => {
    if (!selectedClip || !selectedTrack) return;
    const newPattern = [...pattern];
    newPattern[i] = !newPattern[i];
    dispatch({
      type: 'UPDATE_DRUM_PATTERN',
      trackId: selectedTrack.id,
      clipId: selectedClip.id,
      pattern: newPattern,
    });
  }, [selectedClip, selectedTrack, pattern, dispatch]);

  const handleClear = () => {
    if (!selectedClip || !selectedTrack) return;
    dispatch({
      type: 'UPDATE_DRUM_PATTERN',
      trackId: selectedTrack.id,
      clipId: selectedClip.id,
      pattern: Array(stepCount).fill(false),
    });
  };

  const handleAddBar = () => {
    if (!selectedClip || !selectedTrack) return;
    dispatch({
      type: 'UPDATE_DRUM_PATTERN',
      trackId: selectedTrack.id,
      clipId: selectedClip.id,
      pattern: [...pattern, ...Array(16).fill(false)],
    });
  };

  const trackColor = selectedTrack?.color || 'var(--amber-bright)';

  return (
    <div className="drum-sequencer">
      <div className="drum-seq-header">
        <button
          className="panel-tab"
          onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'mixer' })}
        >
          &larr; Mixer
        </button>
        <span className="panel-tab active">
          Drum Sequencer
          {selectedTrack ? ` — ${selectedTrack.name}` : ''}
          {selectedClip ? ` / ${selectedClip.name}` : ''}
        </span>
        <div className="drum-seq-actions">
          {selectedClip && (
            <>
              <button className="pr-clear-btn" onClick={handleClear}>Clear</button>
              <button className="pr-add-btn" onClick={handleAddBar}>+ Add Bar</button>
            </>
          )}
        </div>
      </div>

      {!selectedClip ? (
        <div className="pr-empty">Select a drum clip to edit its pattern.</div>
      ) : (
        <div className="drum-seq-body">
          <div className="drum-seq-info">
            <span className="drum-seq-clip-label">
              {stepCount} steps &nbsp;&middot;&nbsp; {stepCount / 16} bar{stepCount / 16 !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="drum-seq-grid">
            {pattern.map((active, i) => (
              <button
                key={i}
                className={`drum-step${active ? ' active' : ''}${i > 0 && i % 4 === 0 ? ' bar-start' : ''}`}
                style={active ? {
                  background: trackColor,
                  boxShadow: `0 0 8px ${trackColor}, 0 0 18px ${trackColor}66`,
                  borderColor: trackColor,
                } : {}}
                onClick={() => toggleStep(i)}
                title={`Step ${i + 1}`}
              >
                <span className="drum-step-num">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
