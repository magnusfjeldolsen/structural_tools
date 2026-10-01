/**
 * Field post-processing: time interpolation, line profiles, isotherms, reduced section.
 * Coordinates in mm, temperatures in °C.
 */
import type { Mesh } from '../mesh/types.js';
import type { Vec2 } from '../model/types.js';
import type { RunResult } from '../solver/types.js';
import { interpolateField } from './locate.js';

/** Nodal field at time t, linearly interpolated between stored snapshots (clamped at the ends). */
export function fieldAtTime(result: RunResult, t: number): Float32Array {
  const { times, fields } = result;
  if (fields.length === 0) throw new Error('The result has no snapshots.');
  if (t <= times[0]) return fields[0];
  const last = times.length - 1;
  if (t >= times[last]) return fields[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  if (times[lo] === t) return fields[lo];
  const f = (t - times[lo]) / (times[hi] - times[lo]);
  const a = fields[lo], b = fields[hi];
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + f * (b[i] - a[i]);
  return out;
}

export interface LineProfile {
  /** Distance along the line from `from`, mm. */
  s: number[];
  points: Vec2[];
  /** Temperature or null outside the mesh. */
  values: (number | null)[];
}

export function lineProfile(mesh: Mesh, field: ArrayLike<number>, from: Vec2, to: Vec2, samples = 50): LineProfile {
  const n = Math.max(2, Math.floor(samples));
  const s: number[] = [], points: Vec2[] = [], values: (number | null)[] = [];
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const p: Vec2 = [from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])];
    s.push(f * L);
    points.push(p);
    values.push(interpolateField(mesh, field, p));
  }
  return { s, points, values };
}

/**
 * Isotherm at level `theta` by marching triangles. Returns segments as a flat array
 * [x1, y1, x2, y2, ...] in mm.
 */
export function isotherm(mesh: Mesh, field: ArrayLike<number>, theta: number): Float64Array {
  const { nodes, triangles } = mesh;
  const m = triangles.length / 3;
  const out: number[] = [];
  const px = [0, 0, 0], py = [0, 0, 0];
  for (let e = 0; e < m; e++) {
    let cnt = 0;
    for (let k = 0; k < 3; k++) {
      const i = triangles[3 * e + k], j = triangles[3 * e + ((k + 1) % 3)];
      let vi = field[i] - theta, vj = field[j] - theta;
      if (vi === 0) vi = 1e-12;
      if (vj === 0) vj = 1e-12;
      if (vi * vj < 0) {
        const f = vi / (vi - vj);
        px[cnt] = nodes[2 * i] + f * (nodes[2 * j] - nodes[2 * i]);
        py[cnt] = nodes[2 * i + 1] + f * (nodes[2 * j + 1] - nodes[2 * i + 1]);
        cnt++;
      }
    }
    if (cnt === 2) out.push(px[0], py[0], px[1], py[1]);
  }
  return Float64Array.from(out);
}

export interface ReducedSection {
  /** Area of elements whose centroid temperature is below `theta`, mm². */
  area: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  width: number;
  height: number;
  coldNodeCount: number;
  coldElementCount: number;
  /** Isotherm segments, [x1,y1,x2,y2,...]. */
  isotherm: Float64Array;
}

/** Reduced cross-section: the part colder than `theta` (e.g. 500 °C isotherm method, EN 1992-1-2 Annex B.1). */
export function reducedSection(mesh: Mesh, field: ArrayLike<number>, theta: number): ReducedSection {
  const { nodes, triangles } = mesh;
  const m = triangles.length / 3;
  let area = 0, coldElementCount = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const coldNode = new Uint8Array(nodes.length / 2);
  for (let e = 0; e < m; e++) {
    const a = triangles[3 * e], b = triangles[3 * e + 1], c = triangles[3 * e + 2];
    const tc = (field[a] + field[b] + field[c]) / 3;
    if (tc >= theta) continue;
    coldElementCount++;
    const x0 = nodes[2 * a], y0 = nodes[2 * a + 1], x1 = nodes[2 * b], y1 = nodes[2 * b + 1], x2 = nodes[2 * c], y2 = nodes[2 * c + 1];
    area += 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
    for (const i of [a, b, c]) {
      coldNode[i] = 1;
      const x = nodes[2 * i], y = nodes[2 * i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  let coldNodeCount = 0;
  for (let i = 0; i < coldNode.length; i++) coldNodeCount += coldNode[i];
  const bounds = coldElementCount > 0 ? { minX, minY, maxX, maxY } : null;
  return {
    area,
    bounds,
    width: bounds ? maxX - minX : 0,
    height: bounds ? maxY - minY : 0,
    coldNodeCount,
    coldElementCount,
    isotherm: isotherm(mesh, field, theta),
  };
}

/** Min/max of a field. */
export function fieldRange(field: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
