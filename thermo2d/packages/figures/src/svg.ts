/** Small SVG string helpers: escaping, number formatting, axes and ticks. */
import type { Theme, ThemeColors } from './theme.js';
import { THEMES } from './theme.js';

export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Compact number formatting for labels. */
export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(Math.min(digits, 1));
  return v.toFixed(digits);
}

export function n(v: number): string {
  return Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '0';
}

export function themeColors(theme: Theme = 'light'): ThemeColors {
  return THEMES[theme] ?? THEMES.light;
}

/** "Nice" tick values covering [lo, hi] with roughly `count` ticks. */
export function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (hi <= lo) return [lo];
  const span = hi - lo;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

export interface PlotFrame {
  x: Scale;
  y: Scale;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Axes with ticks, grid lines and labels inside a plot frame. */
export function axes(frame: PlotFrame, c: ThemeColors, opts: { xLabel?: string; yLabel?: string; xTicks?: number[]; yTicks?: number[]; xFmt?: (v: number) => string; yFmt?: (v: number) => string } = {}): string {
  const xt = opts.xTicks ?? niceTicks(frame.x.domain[0], frame.x.domain[1]);
  const yt = opts.yTicks ?? niceTicks(frame.y.domain[0], frame.y.domain[1]);
  const xf = opts.xFmt ?? ((v) => fmt(v, 0));
  const yf = opts.yFmt ?? ((v) => fmt(v, 0));
  let s = '';
  for (const v of xt) {
    const px = frame.x(v);
    s += `<line x1="${n(px)}" y1="${n(frame.top)}" x2="${n(px)}" y2="${n(frame.bottom)}" stroke="${c.grid}" stroke-width="1"/>`;
    s += `<text x="${n(px)}" y="${n(frame.bottom + 16)}" text-anchor="middle" font-size="11" fill="${c.fg}">${esc(xf(v))}</text>`;
  }
  for (const v of yt) {
    const py = frame.y(v);
    s += `<line x1="${n(frame.left)}" y1="${n(py)}" x2="${n(frame.right)}" y2="${n(py)}" stroke="${c.grid}" stroke-width="1"/>`;
    s += `<text x="${n(frame.left - 6)}" y="${n(py + 4)}" text-anchor="end" font-size="11" fill="${c.fg}">${esc(yf(v))}</text>`;
  }
  s += `<rect x="${n(frame.left)}" y="${n(frame.top)}" width="${n(frame.right - frame.left)}" height="${n(frame.bottom - frame.top)}" fill="none" stroke="${c.axis}" stroke-width="1"/>`;
  if (opts.xLabel) s += `<text x="${n((frame.left + frame.right) / 2)}" y="${n(frame.bottom + 34)}" text-anchor="middle" font-size="12" fill="${c.fg}">${esc(opts.xLabel)}</text>`;
  if (opts.yLabel) s += `<text transform="translate(${n(frame.left - 44)},${n((frame.top + frame.bottom) / 2)}) rotate(-90)" text-anchor="middle" font-size="12" fill="${c.fg}">${esc(opts.yLabel)}</text>`;
  return s;
}

export function svgDocument(width: number, height: number, c: ThemeColors, body: string, title?: string): string {
  const t = title ? `<title>${esc(title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}" font-family="${esc(c.font)}">${t}<rect width="${n(width)}" height="${n(height)}" fill="${c.bg}"/>${body}</svg>`;
}

export function textTitle(x: number, y: number, text: string, c: ThemeColors, size = 14): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="600" fill="${c.fg}">${esc(text)}</text>`;
}

export function legend(x: number, y: number, items: { label: string; color: string; dashed?: boolean; swatch?: 'line' | 'box' }[], c: ThemeColors, columns = 1, colWidth = 150): string {
  let s = '';
  items.forEach((it, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const px = x + col * colWidth;
    const py = y + row * 16;
    if (it.swatch === 'box') s += `<rect x="${n(px)}" y="${n(py - 9)}" width="14" height="10" fill="${it.color}" stroke="${c.axis}" stroke-width="0.5"/>`;
    else s += `<line x1="${n(px)}" y1="${n(py - 4)}" x2="${n(px + 18)}" y2="${n(py - 4)}" stroke="${it.color}" stroke-width="2"${it.dashed ? ' stroke-dasharray="5,3"' : ''}/>`;
    s += `<text x="${n(px + 22)}" y="${n(py)}" font-size="11" fill="${c.fg}">${esc(it.label)}</text>`;
  });
  return s;
}

export const TIME_UNITS: Record<'s' | 'min' | 'h' | 'd', number> = { s: 1, min: 60, h: 3600, d: 86400 };
