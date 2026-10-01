/** Pure viewport math: model mm (y up) ↔ screen px (y down). */
import type { Vec2 } from '@thermo2d/core';

export interface Viewport {
  /** px per mm */
  scale: number;
  /** screen position of the model origin */
  ox: number;
  oy: number;
}

export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function toScreen(v: Viewport, p: Vec2): Vec2 {
  return [v.ox + p[0] * v.scale, v.oy - p[1] * v.scale];
}

export function toModel(v: Viewport, s: Vec2): Vec2 {
  return [(s[0] - v.ox) / v.scale, (v.oy - s[1]) / v.scale];
}

/** Zoom by `factor` keeping the model point under `screenPt` fixed. */
export function zoomAt(v: Viewport, screenPt: Vec2, factor: number, min = 0.02, max = 400): Viewport {
  const scale = Math.min(max, Math.max(min, v.scale * factor));
  const f = scale / v.scale;
  return { scale, ox: screenPt[0] - (screenPt[0] - v.ox) * f, oy: screenPt[1] - (screenPt[1] - v.oy) * f };
}

export function pan(v: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...v, ox: v.ox + dxPx, oy: v.oy + dyPx };
}

export function fitBounds(b: Bounds2 | null, widthPx: number, heightPx: number, marginPx = 40): Viewport {
  if (!b || !(b.maxX > b.minX) || !(b.maxY > b.minY)) {
    return { scale: Math.max(0.1, Math.min(widthPx, heightPx) / 800), ox: widthPx / 2 - 150, oy: heightPx / 2 + 150 };
  }
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const scale = Math.min((widthPx - 2 * marginPx) / w, (heightPx - 2 * marginPx) / h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { scale, ox: widthPx / 2 - cx * scale, oy: heightPx / 2 + cy * scale };
}

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** Grid spacing in mm so that lines are at least `minPx` apart. */
export function gridSpacing(scale: number, minPx = 24): number {
  for (const s of STEPS) if (s * scale >= minPx) return s;
  return STEPS[STEPS.length - 1];
}

/** Visible model-space rectangle. */
export function visibleBounds(v: Viewport, widthPx: number, heightPx: number): Bounds2 {
  const a = toModel(v, [0, heightPx]);
  const b = toModel(v, [widthPx, 0]);
  return { minX: a[0], minY: a[1], maxX: b[0], maxY: b[1] };
}

export function formatMm(x: number): string {
  const a = Math.abs(x);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : 2;
  return x.toFixed(d).replace(/\.?0+$/, '');
}
