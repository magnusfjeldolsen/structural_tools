import { useMemo } from 'react';
import { formatTick, linearScale, niceDomain, niceTicks } from './scale.js';

export interface SweepPoint {
  label: string;
  x: number;
  y: number;
}

export interface SweepChartProps {
  points: SweepPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  color?: string;
}

const M = { l: 56, r: 14, t: 12, b: 36 };

/** Metric against a parameter (scenario sweeps): points joined by a line, labelled. */
export function SweepChart({ points, width = 480, height = 240, xLabel = '', yLabel = '', color = '#2563eb' }: SweepChartProps) {
  const { xs, ys, xTicks, yTicks } = useMemo(() => {
    const xsv = points.map((p) => p.x);
    const ysv = points.map((p) => p.y).filter(isFinite);
    const [x0, x1] = niceDomain(Math.min(...xsv, 0), Math.max(...xsv, 1), 5);
    const [y0, y1] = ysv.length ? niceDomain(Math.min(...ysv), Math.max(...ysv), 5) : [0, 1];
    return {
      xs: linearScale([x0, x1], [M.l, width - M.r]),
      ys: linearScale([y0, y1], [height - M.b, M.t]),
      xTicks: niceTicks(x0, x1, 5),
      yTicks: niceTicks(y0, y1, 5),
    };
  }, [points, width, height]);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join('');
  const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  return (
    <svg className="t2d-chart" viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
      <g className="t2d-chart-grid">
        {yTicks.map((v) => (
          <line key={`y${v}`} x1={M.l} x2={width - M.r} y1={ys(v)} y2={ys(v)} />
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
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} />
      {sorted.map((p, i) => (
        <g key={i}>
          <circle cx={xs(p.x)} cy={ys(p.y)} r={4} fill={color} />
          <text x={xs(p.x)} y={ys(p.y) - 8} textAnchor="middle" className="t2d-chart-label">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
