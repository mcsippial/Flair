import React from 'react';

export default function VUMeter({ level = 0, vertical = true }) {
  const pct = Math.min(1, Math.max(0, (level + 60) / 60));
  const color = pct > 0.9 ? 'var(--color-red-clip)' : pct > 0.7 ? 'var(--color-amber)' : 'var(--color-green-meter)';

  if (vertical) {
    return (
      <div className="vu-meter-v">
        <div className="vu-bar" style={{ height: `${pct * 100}%`, background: color }} />
      </div>
    );
  }
  return (
    <div className="vu-meter-h">
      <div className="vu-bar-h" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}
