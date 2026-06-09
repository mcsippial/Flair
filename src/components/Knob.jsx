import React, { useRef, useState, useCallback, useEffect } from 'react';

export default function Knob({ value = 0.5, min = 0, max = 1, label, size = 36, onChange }) {
  const [currentValue, setCurrentValue] = useState(value);
  const [showTooltip, setShowTooltip] = useState(false);
  const dragging = useRef(false);
  const dragRef = useRef({ startY: 0, startValue: 0 });

  // Sync external value changes unless the user is dragging
  useEffect(() => {
    if (!dragging.current) setCurrentValue(value);
  }, [value]);

  const valueToAngle = (v) => -135 + ((v - min) / (max - min)) * 270;

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    dragRef.current = { startY: e.clientY, startValue: currentValue };
    const onMove = (me) => {
      const delta = dragRef.current.startY - me.clientY;
      const newVal = Math.max(min, Math.min(max, dragRef.current.startValue + (delta / 200) * (max - min)));
      setCurrentValue(newVal);
      onChange?.(newVal);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [currentValue, min, max, onChange]);

  const angle = valueToAngle(currentValue);
  const displayVal = Math.round(((currentValue - min) / (max - min)) * 100);

  return (
    <div className="knob-wrapper" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div className="knob-body" style={{ width: size, height: size }} onMouseDown={onMouseDown}>
        <div className="knob-tick" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      {label && <span className="knob-label">{label}</span>}
      {showTooltip && <div className="knob-tooltip">{displayVal}%</div>}
    </div>
  );
}
