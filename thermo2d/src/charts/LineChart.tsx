import { useCallback, useMemo, useRef, useState } from 'react';
import { autoTimeUnit, formatTick, linearScale, niceDomain, niceStep, niceTicks, TIME_UNIT_SECONDS, type TimeUnit } from './scale.js';

export interface LineSeries {
  id: string;
  name: string;
  /** Time in seconds. */
  t: ArrayLike<number>;
  v: ArrayLike<number>;
  color: string;
  dashed?: boolean;
  /** Thin, muted line (used for the boundary curve overlay). */
  muted?: boolean;
}

export interface LineChartProps {
  series: LineSeries[];
  width?: number;
  height?: number;
  yLabel?: string;
  timeUnit?: TimeUnit;
  /** Vertical cursor at this time (s); draggable when onSelectTime is given. */
  cursorTime?: number;
  onSelectTime?: (t: number) => void;
  /** Horizontal reference lines (e.g. 500 °C). */
  refLines?: { value: number; label?: string; color?: string }[];
  formatValue?: (v: number) => string;
}

const M = { l: 52, r: 14, t: 12, b: 34 };

/** Multi-series time chart with hover readout, click/drag time cursor and a legend. Pure SVG. */
export function LineChart({ series, width = 640, height = 300, yLabel = '°C', timeUnit, cursorTime, onSelectTime, refLines = [], formatValue }: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const { tMax, unit, xs, ys, yTicks, xTicks } = useMemo(() => {
    let tMax = 0;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const s of series) {
      const n = Math.min(s.t.length, s.v.length);
      if (n) tMax = Math.max(tMax, s.t[n - 1]);
      for (let i = 0; i < n; i++) {
        const v = s.v[i];
        if (isFinite(v)) {
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      }
    }
    for (const r of refLines) {
      vMin = Math.min(vMin, r.value);
      vMax = Math.max(vMax, r.value);
    }
    if (!isFinite(vMin)) [vMin, vMax] = [0, 1];
    const unit = timeUnit ?? autoTimeUnit(tMax);
    const k = TIME_UNIT_SECONDS[unit];
    const [y0, y1] = niceDomain(vMin, vMax, 6);
    const xs = linearScale([0, Math.max(tMax / k, 1e-9)], [M.l, width - M.r]);
    const ys = linearScale([y0, y1], [height - M.b, M.t]);
    return { tMax, unit, xs, ys, yTicks: niceTicks(y0, y1, 6), xTicks: niceTicks(0, tMax / k, 7) };
  }, [series, width, height, timeUnit, refLines]);

  const k = TIME_UNIT_SECONDS[unit];
  const paths = useMemo(
    () =>
      series.map((s) => {
        const n = Math.min(s.t.length, s.v.length);
        const step = Math.max(1, Math.floor(n / 2000));
        let d = '';
        let pen = false;
        for (let i = 0; i < n; i += step) {
          const v = s.v[i];
          if (!isFinite(v)) {
            pen = false;
            continue;
          }
          d += `${pen ? 'L' : 'M'}${xs(s.t[i] / k).toFixed(1)},${ys(v).toFixed(1)}`;
          pen = true;
        }
        return d;
      }),
    [series, xs, ys, k],
  );

  const timeAtClient = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * width;
      const t = Math.max(0, Math.min(tMax, xs.invert(px) * k));
      return t;
    },
    [width, tMax, xs, k],
  );

  const onMove = (e: React.MouseEvent) => {
    const t = timeAtClient(e.clientX);
    setHover(t);
    if (dragging && t !== null) onSelectTime?.(t);
  };

  const fmt = formatValue ?? ((v: number) => formatTick(v, 0.1));
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const xStep = niceStep(tMax / k, 7);
  const hoverRows = hover === null ? [] : series.map((s) => ({ s, v: sampleAt(s, hover) }));
  const cursorX = cursorTime !== undefined ? xs(cursorTime / k) : null;

  return (
    <svg
      ref={svgRef}
      className="t2d-chart"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, cursor: onSelectTime ? 'crosshair' : 'default', userSelect: 'none' }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setHover(null);
        setDragging(false);
      }}
      onMouseDown={(e) => {
        if (!onSelectTime) return;
        setDragging(true);
        const t = timeAtClient(e.clientX);
        if (t !== null) onSelectTime(t);
      }}
      onMouseUp={() => setDragging(false)}
    >
      <g className="t2d-chart-grid">
        {yTicks.map((v) => (
          <line key={`y${v}`} x1={M.l} x2={width - M.r} y1={ys(v)} y2={ys(v)} />
        ))}
        {xTicks.map((v) => (
          <line key={`x${v}`} x1={xs(v)} x2={xs(v)} y1={M.t} y2={height - M.b} />
        ))}
      </g>
      <g className="t2d-chart-axis">
        <line x1={M.l} x2={width - M.r} y1={height - M.b} y2={height - M.b} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={height - M.b} />
        {yTicks.map((v) => (
          <text key={`yl${v}`} x={M.l - 6} y={ys(v) + 4} textAnchor="end">
            {formatTick(v, yStep)}
          </text>
        ))}
        {xTicks.map((v) => (
          <text key={`xl${v}`} x={xs(v)} y={height - M.b + 16} textAnchor="middle">
            {formatTick(v, xStep)}
          </text>
        ))}
        <text x={width - M.r} y={height - 4} textAnchor="end" className="t2d-chart-label">
          {unit}
        </text>
        <text x={4} y={M.t + 4} className="t2d-chart-label">
          {yLabel}
        </text>
      </g>
      {refLines.map((r, i) => (
        <g key={`ref${i}`} className="t2d-chart-ref">
          <line x1={M.l} x2={width - M.r} y1={ys(r.value)} y2={ys(r.value)} stroke={r.color ?? '#dc2626'} strokeDasharray="4 3" />
          {r.label && (
            <text x={width - M.r - 2} y={ys(r.value) - 3} textAnchor="end" fill={r.color ?? '#dc2626'}>
              {r.label}
            </text>
          )}
        </g>
      ))}
      <g fill="none" strokeLinejoin="round">
        {series.map((s, i) => (
          <path key={s.id} d={paths[i]} stroke={s.color} strokeWidth={s.muted ? 1 : 1.8} strokeDasharray={s.dashed ? '6 4' : s.muted ? '2 3' : undefined} opacity={s.muted ? 0.75 : 1} />
        ))}
      </g>
      {cursorX !== null && cursorX >= M.l && cursorX <= width - M.r && (
        <g className="t2d-chart-cursor">
          <line x1={cursorX} x2={cursorX} y1={M.t} y2={height - M.b} />
          <polygon points={`${cursorX - 5},${M.t} ${cursorX + 5},${M.t} ${cursorX},${M.t + 7}`} />
        </g>
      )}
      {hover !== null && (
        <g className="t2d-chart-hover">
          <line x1={xs(hover / k)} x2={xs(hover / k)} y1={M.t} y2={height - M.b} />
          {hoverRows.map(({ s, v }) => (v === null ? null : <circle key={s.id} cx={xs(hover / k)} cy={ys(v)} r={3} fill={s.color} />))}
          <HoverBox x={xs(hover / k)} y={M.t + 4} width={width} rows={[`t = ${formatTick(hover / k, xStep / 10)} ${unit}`, ...hoverRows.filter((r) => r.v !== null).map((r) => `${r.s.name}: ${fmt(r.v as number)}`)]} />
        </g>
      )}
      <Legend series={series} x={M.l + 6} y={M.t + 6} />
    </svg>
  );
}

function HoverBox({ x, y, width, rows }: { x: number; y: number; width: number; rows: string[] }) {
  const w = Math.max(...rows.map((r) => r.length)) * 6.4 + 12;
  const h = rows.length * 14 + 8;
  const left = x + 10 + w > width ? x - 10 - w : x + 10;
  return (
    <g>
      <rect x={left} y={y} width={w} height={h} rx={3} />
      {rows.map((r, i) => (
        <text key={i} x={left + 6} y={y + 14 + i * 14}>
          {r}
        </text>
      ))}
    </g>
  );
}

function Legend({ series, x, y }: { series: LineSeries[]; x: number; y: number }) {
  const shown = series.filter((s) => !s.muted).slice(0, 12);
  if (shown.length <= 1 && !series.some((s) => s.muted)) return null;
  return (
    <g className="t2d-chart-legend">
      {[...shown, ...series.filter((s) => s.muted)].map((s, i) => (
        <g key={s.id} transform={`translate(${x},${y + i * 13})`}>
          <line x1={0} x2={16} y1={4} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed || s.muted ? '4 3' : undefined} />
          <text x={20} y={8}>
            {s.name}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Linear interpolation of a series at time t (null outside the range). */
export function sampleAt(s: LineSeries, t: number): number | null {
  const n = Math.min(s.t.length, s.v.length);
  if (n === 0 || t < s.t[0] || t > s.t[n - 1]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = s.t[lo];
  const t1 = s.t[hi];
  if (t1 === t0) return s.v[lo];
  const f = (t - t0) / (t1 - t0);
  return s.v[lo] + (s.v[hi] - s.v[lo]) * f;
}
