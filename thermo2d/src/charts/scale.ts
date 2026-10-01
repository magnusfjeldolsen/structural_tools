/** Pure scale helpers for the SVG charts (no React). */

export interface LinearScale {
  (v: number): number;
  invert(p: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as LinearScale;
  f.invert = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  f.domain = domain;
  f.range = range;
  return f;
}

/** A "nice" step (1, 2, 5 × 10ⁿ) so that the domain gets roughly `count` ticks. */
export function niceStep(span: number, count = 6): number {
  if (!(span > 0) || !isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const nice = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
  return nice * mag;
}

/** Tick values covering [min, max] at a nice step; the ends are included when they land on a tick. */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!isFinite(min) || !isFinite(max)) return [];
  if (min === max) return [min];
  if (min > max) [min, max] = [max, min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(roundTo(v, step));
  return ticks;
}

/** Extend [min, max] outward to the nearest nice tick on each side. */
export function niceDomain(min: number, max: number, count = 6): [number, number] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  const step = niceStep(max - min, count);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

function roundTo(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(12, decimals)));
}

/** Compact number formatting for tick labels (no trailing zeros, thousands stay plain). */
export function formatTick(v: number, step?: number): string {
  if (!isFinite(v)) return '';
  const decimals = step ? Math.max(0, -Math.floor(Math.log10(step))) : 2;
  const s = Math.abs(v) < 1e-12 ? '0' : v.toFixed(Math.min(6, decimals));
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export type TimeUnit = 's' | 'min' | 'h' | 'd';

export const TIME_UNIT_SECONDS: Record<TimeUnit, number> = { s: 1, min: 60, h: 3600, d: 86400 };

/** Pick the unit that keeps the axis numbers readable for a run of `duration` seconds. */
export function autoTimeUnit(duration: number): TimeUnit {
  if (duration <= 600) return 's';
  if (duration <= 3 * 86400) return duration <= 36000 ? 'min' : 'h';
  return 'd';
}
