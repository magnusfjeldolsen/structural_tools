import { useMemo, useState } from 'react';
import { formatTick, linearScale, niceDomain, niceTicks } from './scale.js';

export interface ProfileSeries {
  id: string;
  name: string;
  /** Distance along the line, mm. */
  s: ArrayLike<number>;
  v: ArrayLike<number>;
  color: string;
  dashed?: boolean;
}

export interface ProfileChartProps {
  series: ProfileSeries[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  refLines?: { value: number; label?: string; color?: string }[];
}

const M = { l: 52, r: 14, t: 12, b: 34 };

/** Temperature along a line (depth profile). Pure SVG with hover readout. */
export function ProfileChart({ series, width = 640, height = 260, xLabel = 'mm', yLabel = '°C', refLines = [] }: ProfileChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const { xs, ys, xTicks, yTicks } = useMemo(() => {
    let sMax = 0;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const p of series) {
      const n = Math.min(p.s.length, p.v.length);
      for (let i = 0; i < n; i++) {
        sMax = Math.max(sMax, p.s[i]);
        const v = p.v[i];
        if (isFinite(v)) {
          vMin = Math.min(vMin, v);
          vMax = Math.max(vMax, v);
        }
      }
    }
    for (const r of refLines) {
      vMin = Math.min(vMin, r.value);
      vMax = Math.max(vMax, r.value);
    }
    if (!isFinite(vMin)) [vMin, vMax] = [0, 1];
    const [y0, y1] = niceDomain(vMin, vMax, 6);
    return {
      xs: linearScale([0, Math.max(sMax, 1e-9)], [M.l, width - M.r]),
      ys: linearScale([y0, y1], [height - M.b, M.t]),
      xTicks: niceTicks(0, sMax, 7),
      yTicks: niceTicks(y0, y1, 6),
    };
  }, [series, width, height, refLines]);

  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;

  return (
    <svg
      className="t2d-chart"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, userSelect: 'none' }}
      onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * width;
        setHover(Math.max(xs.domain[0], Math.min(xs.domain[1], xs.invert(px))));
      }}
      onMouseLeave={() => setHover(null)}
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
          {xLabel}
        </text>
        <text x={4} y={M.t + 4} className="t2d-chart-label">
          {yLabel}
        </text>
      </g>
      {refLines.map((r, i) => (
        <g key={i} className="t2d-chart-ref">
          <line x1={M.l} x2={width - M.r} y1={ys(r.value)} y2={ys(r.value)} stroke={r.color ?? '#dc2626'} strokeDasharray="4 3" />
          {r.label && (
            <text x={width - M.r - 2} y={ys(r.value) - 3} textAnchor="end" fill={r.color ?? '#dc2626'}>
              {r.label}
            </text>
          )}
        </g>
      ))}
      <g fill="none">
        {series.map((p) => {
          const n = Math.min(p.s.length, p.v.length);
          let d = '';
          let pen = false;
          for (let i = 0; i < n; i++) {
            if (!isFinite(p.v[i])) {
              pen = false;
              continue;
            }
            d += `${pen ? 'L' : 'M'}${xs(p.s[i]).toFixed(1)},${ys(p.v[i]).toFixed(1)}`;
            pen = true;
          }
          return <path key={p.id} d={d} stroke={p.color} strokeWidth={1.8} strokeDasharray={p.dashed ? '6 4' : undefined} />;
        })}
      </g>
      {hover !== null && (
        <g className="t2d-chart-hover">
          <line x1={xs(hover)} x2={xs(hover)} y1={M.t} y2={height - M.b} />
          {series.map((p) => {
            const v = interp(p, hover);
            return v === null ? null : (
              <g key={p.id}>
                <circle cx={xs(hover)} cy={ys(v)} r={3} fill={p.color} />
                <text x={xs(hover) + 6} y={ys(v) - 4}>
                  {formatTick(v, 0.1)}
                </text>
              </g>
            );
          })}
          <text x={xs(hover) + 6} y={height - M.b - 6}>
            {formatTick(hover, 0.1)} mm
          </text>
        </g>
      )}
      {series.length > 1 && (
        <g className="t2d-chart-legend">
          {series.map((p, i) => (
            <g key={p.id} transform={`translate(${M.l + 6},${M.t + 6 + i * 13})`}>
              <line x1={0} x2={16} y1={4} y2={4} stroke={p.color} strokeWidth={2} strokeDasharray={p.dashed ? '4 3' : undefined} />
              <text x={20} y={8}>
                {p.name}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function interp(p: ProfileSeries, s: number): number | null {
  const n = Math.min(p.s.length, p.v.length);
  if (!n || s < p.s[0] || s > p.s[n - 1]) return null;
  for (let i = 1; i < n; i++) {
    if (p.s[i] >= s) {
      const f = p.s[i] === p.s[i - 1] ? 0 : (s - p.s[i - 1]) / (p.s[i] - p.s[i - 1]);
      return p.v[i - 1] + (p.v[i] - p.v[i - 1]) * f;
    }
  }
  return p.v[n - 1];
}
