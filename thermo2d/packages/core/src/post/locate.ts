/**
 * Point location and shape-function interpolation on a triangle mesh.
 * Coordinates in mm (same as Mesh.nodes). A uniform bucket grid over the mesh
 * bounding box is built once per mesh and cached on the mesh object.
 */
import type { Mesh } from '../mesh/types.js';
import type { Vec2 } from '../model/types.js';

interface BucketIndex {
  minX: number;
  minY: number;
  cell: number;
  nx: number;
  ny: number;
  ptr: Int32Array;
  items: Int32Array;
}

const CACHE = new WeakMap<Mesh, BucketIndex>();

function bucketIndex(mesh: Mesh): BucketIndex {
  let idx = CACHE.get(mesh);
  if (idx) return idx;
  const { nodes, triangles } = mesh;
  const m = triangles.length / 3;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nodes.length; i += 2) {
    const x = nodes[i], y = nodes[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
  const cell = Math.max(Math.sqrt((w * h) / Math.max(m, 1)) * 2, 1e-6);
  const nx = Math.max(1, Math.min(2048, Math.ceil(w / cell) + 1));
  const ny = Math.max(1, Math.min(2048, Math.ceil(h / cell) + 1));
  const counts = new Int32Array(nx * ny + 1);
  const cellOf = (x: number, y: number): [number, number] => [
    Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell))),
    Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cell))),
  ];
  const tb = new Int32Array(4 * m);
  for (let e = 0; e < m; e++) {
    let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const n = triangles[3 * e + k];
      const x = nodes[2 * n], y = nodes[2 * n + 1];
      if (x < ex0) ex0 = x;
      if (x > ex1) ex1 = x;
      if (y < ey0) ey0 = y;
      if (y > ey1) ey1 = y;
    }
    const [cx0, cy0] = cellOf(ex0, ey0);
    const [cx1, cy1] = cellOf(ex1, ey1);
    tb[4 * e] = cx0;
    tb[4 * e + 1] = cy0;
    tb[4 * e + 2] = cx1;
    tb[4 * e + 3] = cy1;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) counts[cy * nx + cx + 1]++;
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const ptr = counts;
  const fill = ptr.slice(0, nx * ny);
  const items = new Int32Array(ptr[nx * ny]);
  for (let e = 0; e < m; e++) {
    for (let cy = tb[4 * e + 1]; cy <= tb[4 * e + 3]; cy++)
      for (let cx = tb[4 * e]; cx <= tb[4 * e + 2]; cx++) items[fill[cy * nx + cx]++] = e;
  }
  idx = { minX, minY, cell, nx, ny, ptr, items };
  CACHE.set(mesh, idx);
  return idx;
}

/** Barycentric coordinates of p in element e: [w0, w1, w2] (sum 1). */
export function barycentric(mesh: Mesh, e: number, p: Vec2): [number, number, number] {
  const { nodes, triangles } = mesh;
  const a = triangles[3 * e], b = triangles[3 * e + 1], c = triangles[3 * e + 2];
  const x0 = nodes[2 * a], y0 = nodes[2 * a + 1];
  const x1 = nodes[2 * b], y1 = nodes[2 * b + 1];
  const x2 = nodes[2 * c], y2 = nodes[2 * c + 1];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (det === 0) return [NaN, NaN, NaN];
  const w1 = ((p[0] - x0) * (y2 - y0) - (x2 - x0) * (p[1] - y0)) / det;
  const w2 = ((x1 - x0) * (p[1] - y0) - (p[0] - x0) * (y1 - y0)) / det;
  return [1 - w1 - w2, w1, w2];
}

/** Element containing p (tolerance relative to element size), or -1. */
export function locateElement(mesh: Mesh, p: Vec2, tol = 1e-9): number {
  const idx = bucketIndex(mesh);
  const cx = Math.floor((p[0] - idx.minX) / idx.cell);
  const cy = Math.floor((p[1] - idx.minY) / idx.cell);
  if (cx < 0 || cy < 0 || cx >= idx.nx || cy >= idx.ny) return -1;
  const c = cy * idx.nx + cx;
  let best = -1;
  let bestMin = -Infinity;
  for (let k = idx.ptr[c], end = idx.ptr[c + 1]; k < end; k++) {
    const e = idx.items[k];
    const w = barycentric(mesh, e, p);
    const mn = Math.min(w[0], w[1], w[2]);
    if (mn >= -tol) return e;
    if (mn > bestMin) {
      bestMin = mn;
      best = e;
    }
  }
  // points marginally outside (e.g. on a slightly curved boundary): accept within 1e-6
  return bestMin >= -1e-6 ? best : -1;
}

/** Shape-function interpolation of a nodal field at p (mm), or null when p is outside the mesh. */
export function interpolateField(mesh: Mesh, field: ArrayLike<number>, p: Vec2): number | null {
  const e = locateElement(mesh, p);
  if (e < 0) return null;
  const w = barycentric(mesh, e, p);
  const t = mesh.triangles;
  return w[0] * field[t[3 * e]] + w[1] * field[t[3 * e + 1]] + w[2] * field[t[3 * e + 2]];
}

/** Precompute (element, weights) for many points; element -1 when outside. */
export function locateMany(mesh: Mesh, points: Vec2[]): { element: Int32Array; weights: Float64Array } {
  const element = new Int32Array(points.length);
  const weights = new Float64Array(3 * points.length);
  for (let i = 0; i < points.length; i++) {
    const e = locateElement(mesh, points[i]);
    element[i] = e;
    if (e >= 0) {
      const w = barycentric(mesh, e, points[i]);
      weights[3 * i] = w[0];
      weights[3 * i + 1] = w[1];
      weights[3 * i + 2] = w[2];
    }
  }
  return { element, weights };
}
