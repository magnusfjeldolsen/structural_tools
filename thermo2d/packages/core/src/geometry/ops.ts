/**
 * Editing operations on polygons: split by line, fillet/chamfer a vertex,
 * merge collinear vertices, affine transforms.
 */
import type { Polygon, Ring, Vec2 } from '../model/types.js';
import type { Transform } from '../commands/types.js';
import { booleanOp } from './boolean.js';
import { dist, normalizePolygon, orient, polygonsBounds, ringIsCCW, reverseRing } from './ring.js';

/** Split a polygon by an infinite line through p1–p2. Returns the pieces on both sides (normalised). */
export function splitPolygon(p: Polygon, line: [Vec2, Vec2]): Polygon[] {
  const [a, b] = line;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 1e-12) return [normalizePolygon(p)];
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const bb = polygonsBounds([p]);
  const R = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) + Math.hypot(a[0] - bb.minX, a[1] - bb.minY) + 10;
  // Two big half-plane rectangles along the line
  const half = (sign: number): Polygon => ({
    outer: [
      [a[0] - ux * R, a[1] - uy * R],
      [a[0] + ux * R, a[1] + uy * R],
      [a[0] + ux * R + sign * nx * R, a[1] + uy * R + sign * ny * R],
      [a[0] - ux * R + sign * nx * R, a[1] - uy * R + sign * ny * R],
    ],
    holes: [],
  });
  const left = booleanOp('intersect', [p], [normalizePolygon(half(1))]);
  const right = booleanOp('intersect', [p], [normalizePolygon(half(-1))]);
  const out = [...left, ...right];
  return out.length ? out : [normalizePolygon(p)];
}

function ringOf(p: Polygon, ring: number): Ring {
  return ring === 0 ? p.outer : p.holes[ring - 1];
}

function withRing(p: Polygon, ring: number, r: Ring): Polygon {
  if (ring === 0) return { outer: r, holes: p.holes };
  const holes = p.holes.slice();
  holes[ring - 1] = r;
  return { outer: p.outer, holes };
}

/** Fillet vertex `index` of a polygon ring (ring 0 = outer). */
export function filletPolygonVertex(p: Polygon, ring: number, index: number, radius: number, segments?: number): Polygon {
  return withRing(p, ring, filletVertex(ringOf(p, ring), index, radius, segments));
}

/** Replace vertex `index` with a circular arc of `radius` tangent to both adjacent edges. */
export function filletVertex(r: Ring, index: number, radius: number, segments?: number): Ring {
  const n = r.length;
  if (n < 3 || radius <= 0) return r;
  const prev = r[(index + n - 1) % n];
  const cur = r[index];
  const next = r[(index + 1) % n];
  const v1: Vec2 = [prev[0] - cur[0], prev[1] - cur[1]];
  const v2: Vec2 = [next[0] - cur[0], next[1] - cur[1]];
  const l1 = Math.hypot(v1[0], v1[1]);
  const l2 = Math.hypot(v2[0], v2[1]);
  if (l1 < 1e-9 || l2 < 1e-9) return r;
  const u1: Vec2 = [v1[0] / l1, v1[1] / l1];
  const u2: Vec2 = [v2[0] / l2, v2[1] / l2];
  const cosA = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
  const angle = Math.acos(cosA); // interior angle at the vertex
  if (angle < 1e-6 || Math.PI - angle < 1e-6) return r;
  const t = radius / Math.tan(angle / 2); // tangent length
  const tt = Math.min(t, l1 * 0.999, l2 * 0.999);
  const rr = tt * Math.tan(angle / 2);
  const p1: Vec2 = [cur[0] + u1[0] * tt, cur[1] + u1[1] * tt];
  const p2: Vec2 = [cur[0] + u2[0] * tt, cur[1] + u2[1] * tt];
  // centre along the bisector
  const bis: Vec2 = [u1[0] + u2[0], u1[1] + u2[1]];
  const bl = Math.hypot(bis[0], bis[1]);
  const dc = rr / Math.sin(angle / 2);
  const c: Vec2 = [cur[0] + (bis[0] / bl) * dc, cur[1] + (bis[1] / bl) * dc];
  const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
  const a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
  let sweep = a2 - a1;
  // choose the short arc (fillet arcs are < 180°)
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const segs = segments ?? Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * 8));
  const arc: Ring = [];
  for (let i = 0; i <= segs; i++) {
    const ang = a1 + (sweep * i) / segs;
    arc.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]);
  }
  return [...r.slice(0, index), ...arc, ...r.slice(index + 1)];
}

/** Chamfer vertex `index` of a polygon ring (ring 0 = outer). */
export function chamferPolygonVertex(p: Polygon, ring: number, index: number, distance: number): Polygon {
  return withRing(p, ring, chamferVertex(ringOf(p, ring), index, distance));
}

/** Replace vertex `index` with a straight cut at `distance` along both adjacent edges. */
export function chamferVertex(r: Ring, index: number, distance: number): Ring {
  const n = r.length;
  if (n < 3 || distance <= 0) return r;
  const prev = r[(index + n - 1) % n];
  const cur = r[index];
  const next = r[(index + 1) % n];
  const l1 = dist(prev, cur);
  const l2 = dist(cur, next);
  const d = Math.min(distance, l1 * 0.999, l2 * 0.999);
  const p1: Vec2 = [cur[0] + ((prev[0] - cur[0]) / l1) * d, cur[1] + ((prev[1] - cur[1]) / l1) * d];
  const p2: Vec2 = [cur[0] + ((next[0] - cur[0]) / l2) * d, cur[1] + ((next[1] - cur[1]) / l2) * d];
  return [...r.slice(0, index), p1, p2, ...r.slice(index + 1)];
}

/** Drop vertices whose adjacent edges are collinear within `toleranceDeg`. */
export function mergeCollinearRing(r: Ring, toleranceDeg = 0.5): Ring {
  if (r.length <= 3) return r;
  const tol = Math.cos((toleranceDeg * Math.PI) / 180);
  const out: Ring = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[(i + n - 1) % n];
    const b = r[i];
    const c = r[(i + 1) % n];
    const v1: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const v2: Vec2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l1 < 1e-12) continue;
    const cosT = l2 < 1e-12 ? 1 : (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    if (cosT > tol && out.length + (n - i - 1) >= 3) continue; // same direction → redundant vertex
    out.push(b);
  }
  return out.length >= 3 ? out : r;
}

export function mergeCollinear(p: Polygon, toleranceDeg = 0.5): Polygon {
  return { outer: mergeCollinearRing(p.outer, toleranceDeg), holes: p.holes.map((h) => mergeCollinearRing(h, toleranceDeg)) };
}

export function transformPoint(pt: Vec2, t: Transform): Vec2 {
  switch (t.kind) {
    case 'move':
      return [pt[0] + t.dx, pt[1] + t.dy];
    case 'rotate': {
      const a = (t.angleDeg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = pt[0] - t.cx;
      const y = pt[1] - t.cy;
      return [t.cx + x * c - y * s, t.cy + x * s + y * c];
    }
    case 'scale':
      return [t.cx + (pt[0] - t.cx) * t.sx, t.cy + (pt[1] - t.cy) * t.sy];
    case 'mirror': {
      if (t.axis === 'x') return [pt[0], -pt[1]]; // mirror across the x axis (y → −y)
      if (t.axis === 'y') return [-pt[0], pt[1]];
      const { p1, p2 } = t.axis;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-18) return [pt[0], pt[1]];
      const s = ((pt[0] - p1[0]) * dx + (pt[1] - p1[1]) * dy) / l2;
      const fx = p1[0] + s * dx;
      const fy = p1[1] + s * dy;
      return [2 * fx - pt[0], 2 * fy - pt[1]];
    }
  }
}

export function transformRing(r: Ring, t: Transform): Ring {
  return r.map((p) => transformPoint(p, t));
}

/** Transform a polygon; mirrors and negative scales flip orientation, which is re-normalised. */
export function transformPolygon(p: Polygon, t: Transform): Polygon {
  const out: Polygon = { outer: transformRing(p.outer, t), holes: p.holes.map((h) => transformRing(h, t)) };
  const flips = t.kind === 'mirror' || (t.kind === 'scale' && t.sx * t.sy < 0);
  if (flips) {
    if (!ringIsCCW(out.outer)) out.outer = reverseRing(out.outer);
    out.holes = out.holes.map((h) => (ringIsCCW(h) ? reverseRing(h) : h));
  }
  return out;
}

/** True when the three points turn left (CCW). Exposed for editors. */
export function isLeftTurn(a: Vec2, b: Vec2, c: Vec2): boolean {
  return orient(a, b, c) > 0;
}
