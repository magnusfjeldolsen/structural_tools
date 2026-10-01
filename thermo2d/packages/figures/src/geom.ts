/** Geometry helpers for section drawings: fitting, outlines, isotherms (local, so figures do not wait on core/post). */
import type { Mesh } from '@thermo2d/core';
import type { Polygon, Vec2 } from '@thermo2d/core';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxOfPoints(pts: ArrayLike<number>): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export function boxOfPolygons(polys: Polygon[]): Box {
  const flat: number[] = [];
  for (const p of polys) for (const r of [p.outer, ...p.holes]) for (const [x, y] of r) flat.push(x, y);
  return boxOfPoints(flat);
}

export function unionBox(a: Box, b: Box): Box {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export interface Fit {
  /** mm → px, y flipped (up is up). */
  x(v: number): number;
  y(v: number): number;
  scale: number;
  box: Box;
}

/** Fit a bounding box into a pixel rectangle, preserving aspect ratio, y up. */
export function fitBox(box: Box, px: { left: number; top: number; width: number; height: number }, margin = 0.04): Fit {
  const w = Math.max(1e-9, box.maxX - box.minX);
  const h = Math.max(1e-9, box.maxY - box.minY);
  const mw = w * margin, mh = h * margin;
  const scale = Math.min(px.width / (w + 2 * mw), px.height / (h + 2 * mh));
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const pcx = px.left + px.width / 2;
  const pcy = px.top + px.height / 2;
  return {
    x: (v) => pcx + (v - cx) * scale,
    y: (v) => pcy - (v - cy) * scale,
    scale,
    box,
  };
}

/** Isotherm at `theta` on a linear-triangle field: marching triangles, returns segments in mm. */
export function isothermSegments(mesh: Mesh, field: ArrayLike<number>, theta: number): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  const tri = mesh.triangles;
  const nd = mesh.nodes;
  for (let e = 0; e < tri.length; e += 3) {
    const ia = tri[e], ib = tri[e + 1], ic = tri[e + 2];
    const va = field[ia], vb = field[ib], vc = field[ic];
    const pts: Vec2[] = [];
    const cross = (i: number, j: number, vi: number, vj: number) => {
      if ((vi < theta && vj >= theta) || (vj < theta && vi >= theta)) {
        const f = (theta - vi) / (vj - vi);
        pts.push([nd[2 * i] + (nd[2 * j] - nd[2 * i]) * f, nd[2 * i + 1] + (nd[2 * j + 1] - nd[2 * i + 1]) * f]);
      }
    };
    cross(ia, ib, va, vb);
    cross(ib, ic, vb, vc);
    cross(ic, ia, vc, va);
    if (pts.length === 2) out.push([pts[0], pts[1]]);
  }
  return out;
}

/** Edges of the mesh that separate two regions (material interfaces), as node-index pairs. */
export function interfaceEdges(mesh: Mesh): [number, number][] {
  const seen = new Map<string, number>();
  const out: [number, number][] = [];
  const tri = mesh.triangles;
  for (let e = 0; e < tri.length; e += 3) {
    const r = mesh.elementRegion[e / 3];
    for (let k = 0; k < 3; k++) {
      const a = tri[e + k], b = tri[e + ((k + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const prev = seen.get(key);
      if (prev === undefined) seen.set(key, r);
      else if (prev !== r) out.push([a, b]);
    }
  }
  return out;
}

export function polygonPath(p: Polygon, fit: Fit): string {
  const ring = (r: Vec2[]) => (r.length ? `M${r.map(([x, y]) => `${fit.x(x).toFixed(2)} ${fit.y(y).toFixed(2)}`).join('L')}Z` : '');
  return ring(p.outer) + p.holes.map(ring).join('');
}
