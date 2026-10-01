/** Snapping: pure functions over rings and points in model mm. */
import type { Ring, Vec2 } from '@thermo2d/core';

export type SnapKind = 'vertex' | 'intersection' | 'midpoint' | 'centre' | 'perpendicular' | 'edge' | 'grid';

export interface SnapOptions {
  grid: boolean;
  vertex: boolean;
  midpoint: boolean;
  centre: boolean;
  intersection: boolean;
  perpendicular: boolean;
  edge: boolean;
}

export const DEFAULT_SNAP: SnapOptions = { grid: true, vertex: true, midpoint: true, centre: true, intersection: true, perpendicular: true, edge: false };

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
}

export interface SnapContext {
  rings: Ring[];
  centres: Vec2[];
  gridSpacing: number;
  /** Search tolerance in mm (derived from px tolerance / scale). */
  tolerance: number;
  options: SnapOptions;
  /** Previous point of the shape being drawn (for perpendicular snaps and ortho). */
  reference?: Vec2;
}

const PRIORITY: Record<SnapKind, number> = { vertex: 0, intersection: 1, midpoint: 2, centre: 3, perpendicular: 4, edge: 5, grid: 6 };

function d2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { point: [a[0] + t * vx, a[1] + t * vy], t };
}

export function segmentsIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const qp = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

export function snapToGrid(p: Vec2, spacing: number): Vec2 {
  return [Math.round(p[0] / spacing) * spacing, Math.round(p[1] / spacing) * spacing];
}

export function snapPoint(cursor: Vec2, ctx: SnapContext): SnapResult | null {
  const tol2 = ctx.tolerance * ctx.tolerance;
  const cands: SnapResult[] = [];
  const o = ctx.options;
  const near: { a: Vec2; b: Vec2 }[] = [];

  for (const ring of ctx.rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      if (o.vertex && d2(a, cursor) <= tol2) cands.push({ point: a, kind: 'vertex' });
      // is the segment near the cursor at all?
      const np = nearestOnSegment(cursor, a, b);
      if (d2(np.point, cursor) <= tol2 * 9) {
        near.push({ a, b });
        if (o.midpoint) {
          const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (d2(m, cursor) <= tol2) cands.push({ point: m, kind: 'midpoint' });
        }
        if (o.perpendicular && ctx.reference) {
          const foot = nearestOnSegment(ctx.reference, a, b);
          if (foot.t > 0 && foot.t < 1 && d2(foot.point, cursor) <= tol2) cands.push({ point: foot.point, kind: 'perpendicular' });
        }
        if (o.edge && d2(np.point, cursor) <= tol2) cands.push({ point: np.point, kind: 'edge' });
      }
    }
  }
  if (o.intersection) {
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const x = segmentsIntersection(near[i].a, near[i].b, near[j].a, near[j].b);
        if (x && d2(x, cursor) <= tol2) cands.push({ point: x, kind: 'intersection' });
      }
    }
  }
  if (o.centre) {
    for (const c of ctx.centres) if (d2(c, cursor) <= tol2) cands.push({ point: c, kind: 'centre' });
  }
  if (o.grid && ctx.gridSpacing > 0) {
    const g = snapToGrid(cursor, ctx.gridSpacing);
    if (d2(g, cursor) <= tol2) cands.push({ point: g, kind: 'grid' });
  }
  if (cands.length === 0) return null;
  cands.sort((p, q) => PRIORITY[p.kind] - PRIORITY[q.kind] || d2(p.point, cursor) - d2(q.point, cursor));
  return cands[0];
}

/** Constrain a point to horizontal/vertical from a reference (Shift while drawing). */
export function orthoConstrain(p: Vec2, ref: Vec2): Vec2 {
  return Math.abs(p[0] - ref[0]) >= Math.abs(p[1] - ref[1]) ? [p[0], ref[1]] : [ref[0], p[1]];
}
