import { SERIES_COLORS, type Theme } from './theme.js';
import { axes, esc, fmt, legend, linearScale, n, niceTicks, svgDocument, textTitle, themeColors, TIME_UNITS } from './svg.js';

export interface SeriesLine {
  name: string;
  /** Time in seconds. */
  t: ArrayLike<number>;
  v: ArrayLike<number>;
  color?: string;
  dashed?: boolean;
  width?: number;
}

export interface TimeSeriesFigureOptions {
  series: SeriesLine[];
  /** Drawn dashed on the same axes (e.g. the fire curve). */
  curveOverlay?: SeriesLine;
  title?: string;
  xUnit?: 's' | 'min' | 'h' | 'd';
  yLabel?: string;
  xLabel?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  /** Vertical cursor at this time (s). */
  cursorTime?: number;
  yRange?: [number, number];
  /** Horizontal reference lines, e.g. { value: 500, label: '500 °C' }. */
  references?: { value: number; label?: string; color?: string }[];
  /** Notes rendered under the plot (caption). */
  caption?: string;
}

function extent(lines: SeriesLine[], pick: 't' | 'v'): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of lines) {
    const a = l[pick];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!Number.isFinite(x)) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (hi === lo) return [lo - 1, hi + 1];
  return [lo, hi];
}

export function pathFor(line: SeriesLine, x: (t: number) => number, y: (v: number) => number, tScale: number): string {
  let d = '';
  let pen = false;
  for (let i = 0; i < line.t.length; i++) {
    const v = line.v[i];
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${n(x(line.t[i] / tScale))} ${n(y(v))}`;
    pen = true;
  }
  return d;
}

/** Temperature-versus-time chart with legend, optional fire-curve overlay and time cursor. */
export function timeSeriesFigure(o: TimeSeriesFigureOptions): string {
  const c = themeColors(o.theme);
  const W = o.width ?? 720;
  const H = o.height ?? 400;
  const unit = o.xUnit ?? 'min';
  const tScale = TIME_UNITS[unit];
  const all = [...o.series, ...(o.curveOverlay ? [o.curveOverlay] : [])];
  const [t0, t1] = extent(all, 't');
  const [v0, v1] = o.yRange ?? extent(all, 'v');
  const pad = (v1 - v0) * 0.05;
  const left = 64;
  const right = W - 16;
  const top = o.title ? 36 : 16;
  const legendRows = Math.ceil(all.length / Math.max(1, Math.floor((right - left) / 150)));
  const captionH = o.caption ? 18 : 0;
  const bottom = H - 46 - legendRows * 16 - captionH;
  const x = linearScale([t0 / tScale, t1 / tScale], [left, right]);
  const y = linearScale([v0 - pad, v1 + pad], [bottom, top]);
  const frame = { x, y, left, top, right, bottom };
  let body = '';
  if (o.title) body += textTitle(left, 22, o.title, c);
  body += axes(frame, c, { xLabel: o.xLabel ?? `t [${unit}]`, yLabel: o.yLabel ?? 'Temperature [°C]', xTicks: niceTicks(t0 / tScale, t1 / tScale, 8), yFmt: (v) => fmt(v, 0) });
  body += `<clipPath id="plot"><rect x="${n(left)}" y="${n(top)}" width="${n(right - left)}" height="${n(bottom - top)}"/></clipPath><g clip-path="url(#plot)">`;
  for (const r of o.references ?? []) {
    const py = y(r.value);
    body += `<line x1="${n(left)}" y1="${n(py)}" x2="${n(right)}" y2="${n(py)}" stroke="${r.color ?? c.muted}" stroke-width="1" stroke-dasharray="3,3"/>`;
    if (r.label) body += `<text x="${n(right - 4)}" y="${n(py - 3)}" text-anchor="end" font-size="10" fill="${c.muted}">${esc(r.label)}</text>`;
  }
  const items: { label: string; color: string; dashed?: boolean }[] = [];
  o.series.forEach((s, i) => {
    const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
    body += `<path d="${pathFor(s, x, y, tScale)}" fill="none" stroke="${color}" stroke-width="${s.width ?? 1.8}"${s.dashed ? ' stroke-dasharray="6,3"' : ''} data-series="${esc(s.name)}"/>`;
    items.push({ label: s.name, color, dashed: s.dashed });
  });
  if (o.curveOverlay) {
    const color = o.curveOverlay.color ?? c.muted;
    body += `<path d="${pathFor(o.curveOverlay, x, y, tScale)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="6,3" data-series="${esc(o.curveOverlay.name)}"/>`;
    items.push({ label: o.curveOverlay.name, color, dashed: true });
  }
  if (o.cursorTime !== undefined && Number.isFinite(o.cursorTime)) {
    const px = x(o.cursorTime / tScale);
    body += `<line x1="${n(px)}" y1="${n(top)}" x2="${n(px)}" y2="${n(bottom)}" stroke="${c.accent}" stroke-width="1.5" data-cursor="1"/>`;
    body += `<text x="${n(px + 4)}" y="${n(top + 12)}" font-size="11" fill="${c.accent}">t = ${fmt(o.cursorTime / tScale, 1)} ${unit}</text>`;
  }
  body += '</g>';
  body += legend(left, bottom + 52, items, c, Math.max(1, Math.floor((right - left) / 150)));
  if (o.caption) body += `<text x="${n(left)}" y="${n(H - 6)}" font-size="10" fill="${c.muted}">${esc(o.caption)}</text>`;
  return svgDocument(W, H, c, body, o.title);
}
