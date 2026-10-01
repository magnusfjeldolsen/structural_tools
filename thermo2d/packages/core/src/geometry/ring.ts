/**
 * Ring and polygon primitives. Rings are open (first point not repeated), in mm.
 * Outer rings CCW, holes CW after `normalizePolygon`.
 */
import { orient2d } from 'robust-predicates';
import type { Polygon, Ring, Vec2 } from '../model/types.js';

/** Signed area (shoelace), positive for CCW. mm². */
export function ringArea(ring: Ring): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return -a / 2;
}

export function ringIsCCW(ring: Ring): boolean {
  return ringArea(ring) > 0;
}

export function reverseRing(ring: Ring): Ring {
  return ring.slice().reverse();
}

/** Remove consecutive duplicate points (within tol) and a repeated closing point. */
export function cleanRing(ring: Ring, tol = 1e-9): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > tol || Math.abs(q[1] - p[1]) > tol) out.push([p[0], p[1]]);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol) out.pop();
    else break;
  }
  return out;
}

/** Outer CCW, holes CW, rings cleaned. Returns a new polygon. */
export function normalizePolygon(p: Polygon): Polygon {
  let outer = cleanRing(p.outer);
  if (outer.length >= 3 && !ringIsCCW(outer)) outer = reverseRing(outer);
  const holes = p.holes.map((h) => {
    const c = cleanRing(h);
    return c.length >= 3 && ringIsCCW(c) ? reverseRing(c) : c;
  });
  return { outer, holes };
}

/** Net area (outer minus holes), always ≥ 0 for a normalised polygon. mm². */
export function polygonArea(p: Polygon): number {
  let a = Math.abs(ringArea(p.outer));
  for (const h of p.holes) a -= Math.abs(ringArea(h));
  return a;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function ringBounds(ring: Ring, b?: Bounds): Bounds {
  const r = b ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of ring) {
    if (x < r.minX) r.minX = x;
    if (x > r.maxX) r.maxX = x;
    if (y < r.minY) r.minY = y;
    if (y > r.maxY) r.maxY = y;
  }
  return r;
}

export function polygonBounds(p: Polygon): Bounds {
  return ringBounds(p.outer);
}

export function polygonsBounds(ps: Polygon[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of ps) ringBounds(p.outer, b);
  return b;
}

/** Area centroid of a ring (any orientation). */
export function ringCentroid(ring: Ring): Vec2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    // degenerate: average of points
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Area centroid of a polygon with holes. */
export function polygonCentroid(p: Polygon): Vec2 {
  const a0 = Math.abs(ringArea(p.outer));
  const c0 = ringCentroid(p.outer);
  let sx = c0[0] * a0;
  let sy = c0[1] * a0;
  let a = a0;
  for (const h of p.holes) {
    const ah = Math.abs(ringArea(h));
    const ch = ringCentroid(h);
    sx -= ch[0] * ah;
    sy -= ch[1] * ah;
    a -= ah;
  }
  return a > 1e-12 ? [sx / a, sy / a] : c0;
}

/** Robust orientation: >0 if c is left of a→b, <0 right, 0 collinear. */
export function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
}

/** Point-in-ring by crossing number; points on the boundary count as inside. */
export function pointInRing(pt: Vec2, ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (pointOnSegment(pt, ring[i], ring[j])) return true;
    if (yi > y !== yj > y) {
      const xint = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xint) inside = !inside;
    }
  }
  return inside;
}

/** Inside the outer ring and not strictly inside any hole. */
export function pointInPolygon(p: Polygon, pt: Vec2): boolean {
  if (!pointInRing(pt, p.outer)) return false;
  for (const h of p.holes) {
    if (pointInRing(pt, h) && !pointOnRingBoundary(pt, h)) return false;
  }
  return true;
}

export function pointOnRingBoundary(pt: Vec2, ring: Ring, tol = 1e-9): boolean {
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) if (pointOnSegment(pt, ring[j], ring[i], tol)) return true;
  return false;
}

export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2, tol = 1e-9): boolean {
  const d = distancePointSegment(p, a, b);
  return d <= tol;
}

export function distancePointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx - p[0];
  const qy = a[1] + t * dy - p[1];
  return Math.hypot(qx, qy);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Proper or improper intersection of segments a–b and c–d.
 * Returns 'none', 'proper' (crossing in the interiors) or 'touch' (endpoint on the other segment / collinear overlap).
 */
export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): 'none' | 'proper' | 'touch' {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return 'proper';
  if (o1 === 0 && onSegmentCollinear(a, b, c)) return 'touch';
  if (o2 === 0 && onSegmentCollinear(a, b, d)) return 'touch';
  if (o3 === 0 && onSegmentCollinear(c, d, a)) return 'touch';
  if (o4 === 0 && onSegmentCollinear(c, d, b)) return 'touch';
  return 'none';
}

function onSegmentCollinear(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
  );
}

/** Intersection point of infinite lines through a–b and c–d, or null if parallel. */
export function lineLineIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

export function ringPerimeter(ring: Ring): number {
  let l = 0;
  for (let i = 0; i < ring.length; i++) l += dist(ring[i], ring[(i + 1) % ring.length]);
  return l;
}

/** Round coordinates to `decimals` (default 6) for stable serialisation / hashing. */
export function roundRing(ring: Ring, decimals = 6): Ring {
  const f = 10 ** decimals;
  return ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f]);
}

export function roundPolygon(p: Polygon, decimals = 6): Polygon {
  return { outer: roundRing(p.outer, decimals), holes: p.holes.map((h) => roundRing(h, decimals)) };
}

export function clonePolygon(p: Polygon): Polygon {
  return { outer: p.outer.map((q) => [q[0], q[1]] as Vec2), holes: p.holes.map((h) => h.map((q) => [q[0], q[1]] as Vec2)) };
}
