import React, { useRef, useState, useCallback } from 'react';

export default function Knob({ value = 0.5, min = 0, max = 1, label, size = 36, onChange }) {
  const [currentValue, setCurrentValue] = useState(value);
  const [showTooltip, setShowTooltip] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, startValue: 0 });

  const valueToAngle = (v) => {
    const pct = (v - min) / (max - min);
    return -135 + pct * 270;
  };

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { active: true, startY: e.clientY, startValue: currentValue };
    const onMove = (me) => {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startY - me.clientY;
      const range = max - min;
      const newVal = Math.max(min, Math.min(max, dragRef.current.startValue + (delta / 200) * range));
      setCurrentValue(newVal);
      onChange && onChange(newVal);
    };
    const onUp = () => {
      dragRef.current.active = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [currentValue, min, max, onChange]);

  const angle = valueToAngle(currentValue);
  const displayVal = Math.round((currentValue - min) / (max - min) * 100);

  return (
    <div className="knob-wrapper" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div
        className="knob-body"
        style={{ width: size, height: size }}
        onMouseDown={onMouseDown}
      >
        <div className="knob-tick" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      {label && <span className="knob-label">{label}</span>}
      {showTooltip && <div className="knob-tooltip">{displayVal}%</div>}
    </div>
  );
}
