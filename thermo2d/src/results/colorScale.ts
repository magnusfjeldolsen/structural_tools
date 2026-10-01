/**
 * Colour scales for the temperature field. The sequential palette matches the
 * figure kit (blue → cyan → green → yellow → orange → red → magenta → white)
 * so a screenshot and an exported figure read the same.
 */

export interface BandScale {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_BANDS: BandScale = { min: 0, max: 1100, step: 100 };

const STOPS: [number, [number, number, number]][] = [
  [0.0, [30, 60, 200]],
  [0.12, [40, 130, 240]],
  [0.25, [40, 200, 220]],
  [0.37, [60, 200, 90]],
  [0.5, [220, 220, 40]],
  [0.62, [250, 160, 30]],
  [0.75, [230, 60, 30]],
  [0.87, [200, 30, 120]],
  [1.0, [255, 255, 255]],
];

function mix(c0: number[], c1: number[], f: number): [number, number, number] {
  return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
}

export function rgbString(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

/** Sequential colour for normalised u in [0, 1]. */
export function sequentialRgb(u: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, u));
  for (let i = 1; i < STOPS.length; i++) {
    const [u1, c1] = STOPS[i];
    if (x <= u1) {
      const [u0, c0] = STOPS[i - 1];
      return mix(c0, c1, u1 === u0 ? 0 : (x - u0) / (u1 - u0));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Diverging colour (blue − white − red) for u in [-1, 1]; used for difference fields. */
export function divergingRgb(u: number): [number, number, number] {
  const x = Math.max(-1, Math.min(1, u));
  return x < 0 ? mix([245, 245, 245], [33, 102, 172], -x) : mix([245, 245, 245], [178, 24, 43], x);
}

/** Number of bands in a scale (at least 1). */
export function bandCount(s: BandScale): number {
  if (!(s.step > 0) || !(s.max > s.min)) return 1;
  return Math.max(1, Math.round((s.max - s.min) / s.step));
}

/** Band index for a value: values below min → 0, above max → last band. */
export function bandIndex(v: number, s: BandScale): number {
  const n = bandCount(s);
  if (!isFinite(v)) return 0;
  const i = Math.floor((v - s.min) / s.step);
  return Math.max(0, Math.min(n - 1, i));
}

/** Colour of band i (mid-band sample of the sequential palette). */
export function bandColor(i: number, s: BandScale): string {
  const n = bandCount(s);
  return rgbString(sequentialRgb(n === 1 ? 0.5 : (i + 0.5) / n));
}

/** Precomputed colour per band, so the canvas can draw one path per band. */
export function bandColors(s: BandScale): string[] {
  const n = bandCount(s);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(bandColor(i, s));
  return out;
}

/** Band boundary values (n + 1 values from min to max). */
export function bandEdges(s: BandScale): number[] {
  const n = bandCount(s);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(s.min + i * s.step);
  return out;
}

/** Continuous colour for smooth shading. */
export function valueColor(v: number, s: BandScale): string {
  const u = s.max === s.min ? 0 : (v - s.min) / (s.max - s.min);
  return rgbString(sequentialRgb(u));
}

/** Symmetric diverging scale for a difference field: bands of ±limit in `n` steps. */
export function divergingBandColors(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rgbString(divergingRgb(((i + 0.5) / n) * 2 - 1)));
  return out;
}

export function divergingBandIndex(v: number, limit: number, n: number): number {
  if (!isFinite(v) || !(limit > 0)) return Math.floor(n / 2);
  const u = Math.max(-1, Math.min(1, v / limit));
  return Math.max(0, Math.min(n - 1, Math.floor(((u + 1) / 2) * n)));
}

/** Parse a user-typed scale, falling back to defaults when it makes no sense. */
export function sanitizeBands(min: number, max: number, step: number): BandScale {
  if (!isFinite(min) || !isFinite(max) || !isFinite(step) || step <= 0 || max <= min) return { ...DEFAULT_BANDS };
  const n = (max - min) / step;
  if (n > 200) return { min, max, step: (max - min) / 200 };
  return { min, max, step };
}
