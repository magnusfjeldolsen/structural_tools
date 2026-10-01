import { useEffect, useRef, useState } from 'react';
import { formatTime, parseTime } from './format.js';
import type { TFn } from './i18n.js';

export interface TimeControlsProps {
  times: number[];
  t: number;
  onChange: (t: number) => void;
  tr: TFn;
}

/** Slider over the snapshot times with play/pause, stepping and typed entry. */
export function TimeControls({ times, t, onChange, tr }: TimeControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [typed, setTyped] = useState('');
  const raf = useRef<number | null>(null);
  const tMax = times.length ? times[times.length - 1] : 0;
  const single = times.length <= 1;

  useEffect(() => {
    if (!playing || single) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * (tMax / 20) * speed; // full run in ~20 s at speed 1
      last = now;
      onChange(t + dt >= tMax ? 0 : t + dt);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, t, tMax, onChange, single]);

  const stepTo = (dir: 1 | -1) => {
    if (single) return;
    let i = 0;
    for (let k = 0; k < times.length; k++) if (times[k] <= t + 1e-9) i = k;
    const j = Math.max(0, Math.min(times.length - 1, i + dir));
    onChange(times[j]);
  };

  return (
    <div className="t2d-time">
      <button onClick={() => setPlaying((p) => !p)} disabled={single} title={playing ? tr('pause') : tr('play')}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button onClick={() => stepTo(-1)} disabled={single} title={tr('stepBack')}>
        ◀
      </button>
      <button onClick={() => stepTo(1)} disabled={single} title={tr('stepForward')}>
        ▶|
      </button>
      <input type="range" min={0} max={tMax} step={tMax > 0 ? tMax / 1000 : 1} value={t} disabled={single} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={tr('time')} />
      <span className="t2d-time-label">
        {tr('time')}: <b>{single ? tr('steadyState') : formatTime(t)}</b>
      </span>
      <span className="t2d-row">
        <input
          type="text"
          style={{ width: 70 }}
          placeholder={tr('goTo')}
          value={typed}
          disabled={single}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseTime(typed);
              if (v !== null) onChange(Math.max(0, Math.min(tMax, v)));
              setTyped('');
            }
          }}
          title={tr('goTo')}
        />
        <select value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} title={tr('speed')} disabled={single}>
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
