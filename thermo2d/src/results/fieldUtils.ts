/**
 * Data helpers on top of RunResult: field at a time, probe series, boundary
 * curve for overlays, difference fields. Pure and small; the heavy lifting
 * (interpolation, isotherms) is in @thermo2d/core post.
 */
import type { BoundaryCondition, Project, RunResult, TimeSeries, Vec2 } from '@thermo2d/core';
import { barycentric } from './viewport.js';

/** Nodal field at time t, linearly interpolated between stored snapshots (clamped at the ends). */
export function fieldAt(result: RunResult, t: number): Float32Array {
  const { times, fields } = result;
  if (fields.length === 0) return new Float32Array(result.mesh.nodes.length / 2);
  if (fields.length === 1 || t <= times[0]) return fields[0];
  const last = fields.length - 1;
  if (t >= times[last]) return fields[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  if (times[hi] === times[lo]) return fields[lo];
  const f = (t - times[lo]) / (times[hi] - times[lo]);
  if (f < 1e-9) return fields[lo];
  if (f > 1 - 1e-9) return fields[hi];
  const a = fields[lo];
  const b = fields[hi];
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * f;
  return out;
}

export function fieldRange(field: ArrayLike<number>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return isFinite(min) ? [min, max] : [0, 0];
}

/** Value of the probe with id at time t from the stored per-step history (null when unknown). */
export function probeValueAt(result: RunResult, probeId: string, t: number): number | null {
  const i = result.probes.findIndex((p) => p.id === probeId);
  if (i < 0 || !result.probes[i].found) return null;
  const ts = result.probeTimes;
  const vs = result.probeValues[i];
  const n = Math.min(ts.length, vs.length);
  if (n === 0) return null;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = ts[hi] === ts[lo] ? 0 : (t - ts[lo]) / (ts[hi] - ts[lo]);
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

/** Simple local interpolation used only for ad-hoc points (hover, temporary probe); linear search over elements near a cached grid. */
export interface ElementLocator {
  locate(x: number, y: number): { element: number; w: [number, number, number] } | null;
  value(field: ArrayLike<number>, x: number, y: number): number | null;
}

export function makeLocator(result: RunResult, cells = 64): ElementLocator {
  const { nodes, triangles } = result.mesh;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nodes.length; i += 2) {
    if (nodes[i] < minX) minX = nodes[i];
    if (nodes[i] > maxX) maxX = nodes[i];
    if (nodes[i + 1] < minY) minY = nodes[i + 1];
    if (nodes[i + 1] > maxY) maxY = nodes[i + 1];
  }
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const nx = cells;
  const ny = Math.max(1, Math.round((cells * h) / w));
  const buckets: number[][] = new Array(nx * ny);
  const m = triangles.length / 3;
  const cellOf = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(nx - 1, Math.floor(((x - minX) / w) * nx)));
    const cy = Math.max(0, Math.min(ny - 1, Math.floor(((y - minY) / h) * ny)));
    return [cx, cy] as const;
  };
  for (let e = 0; e < m; e++) {
    const a = triangles[3 * e];
    const b = triangles[3 * e + 1];
    const c = triangles[3 * e + 2];
    const xs = [nodes[2 * a], nodes[2 * b], nodes[2 * c]];
    const ys = [nodes[2 * a + 1], nodes[2 * b + 1], nodes[2 * c + 1]];
    const [c0x, c0y] = cellOf(Math.min(...xs), Math.min(...ys));
    const [c1x, c1y] = cellOf(Math.max(...xs), Math.max(...ys));
    for (let j = c0y; j <= c1y; j++)
      for (let i = c0x; i <= c1x; i++) {
        const k = j * nx + i;
        (buckets[k] ??= []).push(e);
      }
  }
  const locate = (x: number, y: number) => {
    if (x < minX - 1e-6 || x > maxX + 1e-6 || y < minY - 1e-6 || y > maxY + 1e-6) return null;
    const [cx, cy] = cellOf(x, y);
    const list = buckets[cy * nx + cx];
    if (!list) return null;
    for (const e of list) {
      const a = triangles[3 * e];
      const b = triangles[3 * e + 1];
      const c = triangles[3 * e + 2];
      const wts = barycentric(x, y, nodes[2 * a], nodes[2 * a + 1], nodes[2 * b], nodes[2 * b + 1], nodes[2 * c], nodes[2 * c + 1], 1e-7);
      if (wts) return { element: e, w: wts };
    }
    return null;
  };
  return {
    locate,
    value(field, x, y) {
      const hit = locate(x, y);
      if (!hit) return null;
      const e = hit.element;
      return field[triangles[3 * e]] * hit.w[0] + field[triangles[3 * e + 1]] * hit.w[1] + field[triangles[3 * e + 2]] * hit.w[2];
    },
  };
}

/** Temperature history at an arbitrary point, sampled from the stored snapshots (for temporary/dragged probes). */
export function pointHistory(result: RunResult, locator: ElementLocator, p: Vec2): { t: number[]; v: number[] } | null {
  const hit = locator.locate(p[0], p[1]);
  if (!hit) return null;
  const { triangles } = result.mesh;
  const e = hit.element;
  const ia = triangles[3 * e];
  const ib = triangles[3 * e + 1];
  const ic = triangles[3 * e + 2];
  const t: number[] = [];
  const v: number[] = [];
  for (let k = 0; k < result.times.length; k++) {
    const f = result.fields[k];
    t.push(result.times[k]);
    v.push(f[ia] * hit.w[0] + f[ib] * hit.w[1] + f[ic] * hit.w[2]);
  }
  return { t, v };
}

/** The gas/air series behind the first non-insulated boundary condition, for overlaying on probe charts. */
export function boundaryCurve(project: Project): TimeSeries | null {
  const ids: string[] = [];
  for (const bc of project.boundaryConditions as BoundaryCondition[]) {
    if (bc.type === 'convection-radiation') ids.push(bc.gasSeriesId);
    else if (bc.type === 'convection') ids.push(bc.airSeriesId);
    else if (bc.type === 'fixed') ids.push(bc.temperatureSeriesId);
  }
  for (const id of ids) {
    const s = project.timeSeries.find((x) => x.id === id);
    if (s && s.unit === '°C') return s;
  }
  return null;
}

/** Sample a time series on a regular grid up to tEnd (linear or step). */
export function sampleSeries(s: TimeSeries, tEnd: number, n = 400): { t: number[]; v: number[] } {
  const pts = s.points;
  const t: number[] = [];
  const v: number[] = [];
  if (!pts.length) return { t, v };
  const last = pts[pts.length - 1][0];
  const end = Math.max(tEnd, 0);
  for (let i = 0; i <= n; i++) {
    const ti = (end * i) / n;
    let tq = ti;
    if (ti > last) {
      if (s.afterEnd === 'repeat' && last > 0) tq = ti % last;
      else if (s.afterEnd === 'ambient') {
        t.push(ti);
        v.push(NaN);
        continue;
      } else tq = last;
    }
    t.push(ti);
    v.push(seriesValue(pts, tq, s.interpolation));
  }
  return { t, v };
}

function seriesValue(pts: [number, number][], t: number, interpolation: 'linear' | 'step'): number {
  if (t <= pts[0][0]) return pts[0][1];
  let lo = 0;
  let hi = pts.length - 1;
  if (t >= pts[hi][0]) return pts[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  if (interpolation === 'step') return pts[lo][1];
  const f = (t - pts[lo][0]) / (pts[hi][0] - pts[lo][0]);
  return pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f;
}

/** B − A on A's nodes when the meshes match, else B sampled onto A's nodes with a locator. */
export function differenceField(a: RunResult, b: RunResult, t: number): { field: Float32Array; limit: number } {
  const fa = fieldAt(a, t);
  const fb = fieldAt(b, t);
  const out = new Float32Array(fa.length);
  const same = a.mesh.nodes.length === b.mesh.nodes.length && a.mesh.triangles.length === b.mesh.triangles.length;
  if (same) {
    for (let i = 0; i < fa.length; i++) out[i] = fb[i] - fa[i];
  } else {
    const loc = makeLocator(b);
    const nodes = a.mesh.nodes;
    for (let i = 0; i < fa.length; i++) {
      const vb = loc.value(fb, nodes[2 * i], nodes[2 * i + 1]);
      out[i] = vb === null ? 0 : vb - fa[i];
    }
  }
  let limit = 0;
  for (let i = 0; i < out.length; i++) limit = Math.max(limit, Math.abs(out[i]));
  return { field: out, limit: Math.max(limit, 0.1) };
}

/** Rebar probe ids in the project (probes linked to a rebar or of kind 'rebar'). */
export function rebarProbeIds(project: Project): Set<string> {
  return new Set(project.probes.filter((p) => p.kind === 'rebar' || p.linkedRebarId).map((p) => p.id));
}

export const SERIES_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#9333ea', '#ea580c', '#0d9488', '#4f46e5', '#b91c1c', '#059669', '#c026d3', '#78716c',
];

export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

/**
 * Probes added to the project after the run (pinned clicks, typed rows) are read from the stored
 * snapshots, so adding a probe never requires a rerun. Their histories are sampled on the run's
 * probe time grid by linear interpolation between snapshots.
 */
export function withProjectProbes(result: RunResult, project: Project): RunResult {
  if (result.times.length === 0) return result;
  const byId = new Map(result.probes.map((p, i) => [p.id, i]));
  // New probes, and probes whose position changed since the run (dragged or edited), are sampled from the snapshots.
  const pending = project.probes.filter((p) => {
    if (p.enabled === false) return false;
    const i = byId.get(p.id);
    if (i === undefined) return true;
    const q = result.probes[i].position;
    return Math.abs(q[0] - p.position[0]) > 1e-6 || Math.abs(q[1] - p.position[1]) > 1e-6;
  });
  if (pending.length === 0) return result;
  const locator = makeLocator(result);
  const probes = result.probes.slice();
  const probeValues = result.probeValues.slice();
  const times = result.probeTimes.length ? Array.from(result.probeTimes) : result.times;
  const probeTimes = result.probeTimes.length ? result.probeTimes : Float64Array.from(result.times);
  let changed = false;
  for (const p of pending) {
    const hist = pointHistory(result, locator, p.position);
    if (!hist) continue;
    const vals = new Float64Array(times.length);
    for (let k = 0; k < times.length; k++) vals[k] = interpSeries(hist.t, hist.v, times[k]);
    const hit = locator.locate(p.position[0], p.position[1]);
    const entry = { id: p.id, position: [p.position[0], p.position[1]] as Vec2, found: true, element: hit?.element ?? -1 };
    const i = byId.get(p.id);
    if (i === undefined) {
      probes.push(entry);
      probeValues.push(vals);
    } else {
      probes[i] = entry;
      probeValues[i] = vals;
    }
    changed = true;
  }
  return changed ? { ...result, probes, probeValues, probeTimes } : result;
}

function interpSeries(ts: number[], vs: number[], t: number): number {
  if (t <= ts[0]) return vs[0];
  if (t >= ts[ts.length - 1]) return vs[vs.length - 1];
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = ts[hi] === ts[lo] ? 0 : (t - ts[lo]) / (ts[hi] - ts[lo]);
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}
