import type { TimeSeries } from '../model/types.js';
import type { SeriesEvaluator } from './types.js';

/**
 * Compile a TimeSeries into an evaluator. t in s, value in the series unit.
 *  - t before the first point → first value
 *  - after the last point: hold / repeat (periodic from the first point) / ambient
 *  - 'linear' interpolates, 'step' holds the previous point's value
 */
export function compileSeries(series: TimeSeries, ambient: number): SeriesEvaluator {
  const pts = series.points.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const ts = new Float64Array(n);
  const vs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ts[i] = pts[i][0];
    vs[i] = pts[i][1];
  }
  const name = series.name;
  if (n === 0) return { name, at: () => ambient };
  const t0 = ts[0], tEnd = ts[n - 1];
  const period = tEnd - t0;
  const linear = series.interpolation !== 'step';
  const afterEnd = series.afterEnd;
  return {
    name,
    at(t: number): number {
      if (t <= t0) return vs[0];
      if (t >= tEnd) {
        if (afterEnd === 'hold') return vs[n - 1];
        if (afterEnd === 'ambient') return t === tEnd ? vs[n - 1] : ambient;
        if (period <= 0) return vs[n - 1];
        t = t0 + ((t - t0) % period);
        if (t <= t0) return vs[0];
      }
      // binary search: largest i with ts[i] <= t
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ts[mid] <= t) lo = mid;
        else hi = mid;
      }
      if (!linear) return vs[lo];
      const dt = ts[hi] - ts[lo];
      if (dt <= 0) return vs[hi];
      const f = (t - ts[lo]) / dt;
      return vs[lo] + f * (vs[hi] - vs[lo]);
    },
  };
}

export function constantSeries(value: number, name = 'constant'): SeriesEvaluator {
  return { name, at: () => value };
}

/** ISO 834 standard fire: θg = 20 + 345·log10(8t + 1), t in min (EN 1991-1-2 §3.2.1). Used by tests and the bench. */
export function iso834(tSeconds: number): number {
  return 20 + 345 * Math.log10(8 * (tSeconds / 60) + 1);
}
