/** Line-profile, overlay and sweep figures. Same style as timeSeriesFigure. */
import type { Mesh, RunResult } from '@thermo2d/core';
import { SERIES_COLORS, type Theme } from './theme.js';
import { axes, esc, fmt, legend, linearScale, n, svgDocument, textTitle, themeColors } from './svg.js';
import { timeSeriesFigure, type SeriesLine, type TimeSeriesFigureOptions } from './timeSeries.js';
import { fieldFigure, type FieldFigureOptions } from './field.js';

export interface ProfileLine {
  name: string;
  /** Distance along the line, mm. */
  s: ArrayLike<number>;
  v: ArrayLike<number>;
  color?: string;
  dashed?: boolean;
}

export interface LineProfileFigureOptions {
  profiles: ProfileLine[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  references?: { value: number; label?: string }[];
}

/** Temperature along a line across the section (e.g. depth from the exposed face). */
export function lineProfileFigure(o: LineProfileFigureOptions): string {
  const c = themeColors(o.theme);
  const W = o.width ?? 640;
  const H = o.height ?? 380;
  let s0 = Infinity, s1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of o.profiles) {
    for (let i = 0; i < p.s.length; i++) {
      const s = p.s[i], v = p.v[i];
      if (Number.isFinite(s)) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
      if (Number.isFinite(v)) { v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    }
  }
  if (!Number.isFinite(s0)) { s0 = 0; s1 = 1; }
  if (!Number.isFinite(v0)) { v0 = 0; v1 = 1; }
  if (v1 === v0) { v1 = v0 + 1; }
  const pad = (v1 - v0) * 0.05;
  const left = 64, right = W - 16, top = o.title ? 36 : 16;
  const rows = Math.ceil(o.profiles.length / Math.max(1, Math.floor((right - left) / 150)));
  const bottom = H - 46 - rows * 16;
  const x = linearScale([s0, s1], [left, right]);
  const y = linearScale([v0 - pad, v1 + pad], [bottom, top]);
  let body = '';
  if (o.title) body += textTitle(left, 22, o.title, c);
  body += axes({ x, y, left, top, right, bottom }, c, { xLabel: o.xLabel ?? 'Distance [mm]', yLabel: o.yLabel ?? 'Temperature [°C]' });
  for (const r of o.references ?? []) {
    const py = y(r.value);
    body += `<line x1="${n(left)}" y1="${n(py)}" x2="${n(right)}" y2="${n(py)}" stroke="${c.muted}" stroke-dasharray="3,3"/>`;
    if (r.label) body += `<text x="${n(right - 4)}" y="${n(py - 3)}" text-anchor="end" font-size="10" fill="${c.muted}">${esc(r.label)}</text>`;
  }
  const items: { label: string; color: string; dashed?: boolean }[] = [];
  o.profiles.forEach((p, i) => {
    const color = p.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
    let d = '';
    let pen = false;
    for (let k = 0; k < p.s.length; k++) {
      if (!Number.isFinite(p.v[k])) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${n(x(p.s[k]))} ${n(y(p.v[k]))}`;
      pen = true;
    }
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"${p.dashed ? ' stroke-dasharray="6,3"' : ''}/>`;
    items.push({ label: p.name, color, dashed: p.dashed });
  });
  body += legend(left, bottom + 52, items, c, Math.max(1, Math.floor((right - left) / 150)));
  return svgDocument(W, H, c, body, o.title);
}

export interface OverlayFigureOptions extends Omit<TimeSeriesFigureOptions, 'series'> {
  /** Several results; each probe becomes one line per result (solid / dashed / dotted by result). */
  results: { label: string; result: RunResult }[];
  /** Restrict to these probe ids (default: all probes of the first result). */
  probeIds?: string[];
}

/** Probe curves of several scenarios on one chart. */
export function overlayFigure(o: OverlayFigureOptions): string {
  const series: SeriesLine[] = [];
  const first = o.results[0]?.result;
  const ids = o.probeIds ?? first?.probes.map((p) => p.id) ?? [];
  ids.forEach((id, pi) => {
    o.results.forEach((r, ri) => {
      const k = r.result.probes.findIndex((p) => p.id === id);
      if (k < 0) return;
      const name = `${probeName(r.result, k)} – ${r.label}`;
      series.push({ name, t: r.result.probeTimes, v: r.result.probeValues[k], color: SERIES_COLORS[pi % SERIES_COLORS.length], dashed: ri > 0, width: ri === 0 ? 2 : 1.4 });
    });
  });
  return timeSeriesFigure({ ...o, series });
}

function probeName(r: RunResult, k: number): string {
  return r.probes[k]?.id ?? `P${k + 1}`;
}

/** Difference field B − A (same mesh required; falls back to A's mesh with a warning text). */
export function differenceFigure(o: { a: { mesh: Mesh; field: ArrayLike<number> }; b: { mesh: Mesh; field: ArrayLike<number> }; title?: string; theme?: Theme; width?: number; height?: number; maxAbs?: number }): string {
  const na = o.a.field.length, nb = o.b.field.length;
  if (na !== nb || o.a.mesh.triangles.length !== o.b.mesh.triangles.length) {
    const c = themeColors(o.theme);
    return svgDocument(o.width ?? 720, 80, c, `<text x="16" y="40" fill="${c.fg}" font-size="12">${esc('Difference field needs the same mesh in both results (compare probes instead).')}</text>`, o.title);
  }
  const diff = new Float64Array(na);
  let m = 0;
  for (let i = 0; i < na; i++) { diff[i] = o.b.field[i] - o.a.field[i]; m = Math.max(m, Math.abs(diff[i])); }
  const maxAbs = o.maxAbs ?? Math.max(1, Math.ceil(m / 5) * 5);
  const opts: FieldFigureOptions = { mesh: o.a.mesh, field: diff, bands: { min: -maxAbs, max: maxAbs, step: maxAbs / 5 }, palette: 'diverging', title: o.title ?? 'Difference B − A', theme: o.theme, width: o.width, height: o.height, unitLabel: 'ΔK' };
  return fieldFigure(opts);
}

export interface SweepFigureOptions {
  /** Parameter values (numeric) and the metric per value. */
  points: { x: number; y: number; label?: string }[];
  parameterLabel: string;
  metricLabel: string;
  title?: string;
  width?: number;
  height?: number;
  theme?: Theme;
}

/** Metric versus parameter for a sweep. */
export function sweepFigure(o: SweepFigureOptions): string {
  const c = themeColors(o.theme);
  const W = o.width ?? 560;
  const H = o.height ?? 360;
  const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y).filter(Number.isFinite);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const py = (y1 - y0 || 1) * 0.1, px = (x1 - x0 || 1) * 0.08;
  const left = 70, right = W - 20, top = o.title ? 36 : 16, bottom = H - 46;
  const x = linearScale([x0 - px, x1 + px], [left, right]);
  const y = linearScale([y0 - py, y1 + py], [bottom, top]);
  let body = '';
  if (o.title) body += textTitle(left, 22, o.title, c);
  body += axes({ x, y, left, top, right, bottom }, c, { xLabel: o.parameterLabel, yLabel: o.metricLabel, yFmt: (v) => fmt(v, 2) });
  const sorted = [...o.points].sort((a, b) => a.x - b.x);
  body += `<path d="${sorted.map((p, i) => `${i ? 'L' : 'M'}${n(x(p.x))} ${n(y(p.y))}`).join('')}" fill="none" stroke="${c.accent}" stroke-width="2"/>`;
  for (const p of sorted) {
    body += `<circle cx="${n(x(p.x))}" cy="${n(y(p.y))}" r="4" fill="${c.accent}"/>`;
    body += `<text x="${n(x(p.x))}" y="${n(y(p.y) - 8)}" text-anchor="middle" font-size="10" fill="${c.fg}">${esc(p.label ?? fmt(p.y, 2))}</text>`;
  }
  return svgDocument(W, H, c, body, o.title);
}
