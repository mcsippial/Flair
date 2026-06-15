import React, { useRef, useEffect, useState } from 'react';

const PEAK_HOLD_MS = 2000;
const PEAK_DECAY_RATE = 0.003; // fraction per ms

export default function VUMeter({ level = 0, vertical = true }) {
  const pct = Math.min(1, Math.max(0, (level + 60) / 60));
  const color = pct > 0.9 ? '#e04030' : pct > 0.7 ? 'var(--amber-bright)' : '#2ea86a';

  const peakRef = useRef(pct);
  const peakTimeRef = useRef(Date.now());
  const [peakPct, setPeakPct] = useState(pct);
  const rafRef = useRef(null);

  useEffect(() => {
    if (pct >= peakRef.current) {
      peakRef.current = pct;
      peakTimeRef.current = Date.now();
    }

    const animate = () => {
      const now = Date.now();
      const elapsed = now - peakTimeRef.current;
      if (elapsed > PEAK_HOLD_MS) {
        peakRef.current = Math.max(0, peakRef.current - PEAK_DECAY_RATE * 16);
      }
      setPeakPct(peakRef.current);
      if (peakRef.current > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pct]);

  const peakColor = peakPct > 0.9 ? '#e04030' : peakPct > 0.7 ? 'var(--amber-bright)' : '#2ea86a';

  if (vertical) {
    return (
      <div className="vu-meter-v" style={{ position: 'relative' }}>
        <div className="vu-bar" style={{ height: `${pct * 100}%`, background: color }} />
        {peakPct > 0 && (
          <div style={{
            position: 'absolute',
            bottom: `${peakPct * 100}%`,
            left: 0,
            right: 0,
            height: '2px',
            background: peakColor,
            opacity: 0.9,
            pointerEvents: 'none',
          }} />
        )}
      </div>
    );
  }
  return (
    <div className="vu-meter-h" style={{ position: 'relative' }}>
      <div className="vu-bar-h" style={{ width: `${pct * 100}%`, background: color }} />
      {peakPct > 0 && (
        <div style={{
          position: 'absolute',
          left: `${peakPct * 100}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: peakColor,
          opacity: 0.9,
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
