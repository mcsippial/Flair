import React, { useState, useEffect, useRef } from 'react';
import Knob from './Knob';
import VUMeter from './VUMeter';
import { applyTrackFx, setMasterVolume, getTrackNodes, getMasterMeter } from '../engine/audioEngine';

export default function Mixer({ session, dispatch }) {
  const [meterLevels, setMeterLevels] = useState({});
  const rafRef = useRef(null);

  useEffect(() => {
    const poll = () => {
      const levels = {};
      session.tracks.forEach(t => {
        const nodes = getTrackNodes(t.id);
        if (nodes?.meter) {
          const v = nodes.meter.getValue();
          levels[t.id] = typeof v === 'number' ? v : (Array.isArray(v) ? v[0] : -60);
        }
      });
      const masterMeter = getMasterMeter();
      if (masterMeter) {
        const v = masterMeter.getValue();
        levels.__master = typeof v === 'number' ? v : (Array.isArray(v) ? v[0] : -60);
      }
      setMeterLevels(levels);
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, [session.tracks]);

  const updateEq = (track, band, val) => {
    const eq = { ...track.eq, [band]: val };
    dispatch({ type: 'UPDATE_TRACK', trackId: track.id, changes: { eq } });
    applyTrackFx(track.id, { eq });
  };

  const updatePan = (track, val) => {
    dispatch({ type: 'UPDATE_TRACK', trackId: track.id, changes: { pan: val } });
    applyTrackFx(track.id, { pan: val });
  };

  const updateSend = (track, key, val) => {
    dispatch({ type: 'UPDATE_TRACK', trackId: track.id, changes: { [key]: val } });
    applyTrackFx(track.id, { [key]: val });
  };

  return (
    <div className="mixer">
      <div className="mixer-header">
        <button className="panel-tab active">Mixer</button>
        <button className="panel-tab" onClick={() => dispatch({ type: 'SET_OPEN_PANEL', panel: 'pianoroll' })}>Piano Roll</button>
      </div>
      <div className="mixer-strips">
        {session.tracks.map(track => (
          <div key={track.id} className="channel-strip" style={{ borderTop: `3px solid ${track.color}` }}>
            <span className="strip-name">{track.name}</span>
            <div className="eq-knobs">
              <Knob size={22} label="HI"  value={track.eq?.high ?? 0} min={-1} max={1} onChange={v => updateEq(track, 'high', v)} />
              <Knob size={22} label="MID" value={track.eq?.mid  ?? 0} min={-1} max={1} onChange={v => updateEq(track, 'mid',  v)} />
              <Knob size={22} label="LO"  value={track.eq?.low  ?? 0} min={-1} max={1} onChange={v => updateEq(track, 'low',  v)} />
            </div>
            <div className="send-knobs">
              <Knob size={20} label="REV" value={track.reverb ?? 0} min={0} max={1} onChange={v => updateSend(track, 'reverb', v)} />
              <Knob size={20} label="DLY" value={track.delay  ?? 0} min={0} max={1} onChange={v => updateSend(track, 'delay',  v)} />
              <Knob size={20} label="PAN" value={track.pan ?? 0} min={-1} max={1} onChange={v => updatePan(track, v)} />
            </div>
            <div className="fader-section">
              <input
                className="volume-fader"
                type="range" min={0} max={1} step={0.01}
                value={track.volume}
                onChange={e => dispatch({ type: 'SET_TRACK_VOLUME', trackId: track.id, volume: parseFloat(e.target.value) })}
              />
              <div className="strip-meters">
                <VUMeter level={meterLevels[track.id] ?? -60} vertical />
                <VUMeter level={meterLevels[track.id] ?? -60} vertical />
              </div>
            </div>
            <div className="strip-buttons">
              <button className={`track-btn ${track.muted ? 'active' : ''}`} onClick={() => dispatch({ type: 'MUTE_TRACK', trackId: track.id })}>M</button>
              <button className={`track-btn ${track.solo  ? 'active' : ''}`} onClick={() => dispatch({ type: 'SOLO_TRACK',  trackId: track.id })}>S</button>
            </div>
            <div className="color-dot" style={{ background: track.color }} />
          </div>
        ))}

        <div className="channel-strip master">
          <span className="strip-name">MASTER</span>
          <div className="fader-section">
            <input
              className="volume-fader"
              type="range" min={0} max={1} step={0.01}
              defaultValue={0.8}
              onChange={e => setMasterVolume(parseFloat(e.target.value))}
            />
            <div className="strip-meters">
              <VUMeter level={meterLevels.__master ?? -60} vertical />
              <VUMeter level={meterLevels.__master ?? -60} vertical />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
