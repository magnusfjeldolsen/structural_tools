/** Pure helpers for the drawing tools (model mm, y up). */
import type { Polygon, Ring, Vec2 } from '@thermo2d/core';

export function rectFromCorners(a: Vec2, b: Vec2): Ring {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export function rectFromSize(origin: Vec2, w: number, h: number): Ring {
  return rectFromCorners(origin, [origin[0] + w, origin[1] + h]);
}

export function circleRingAt(c: Vec2, r: number, segments?: number): Ring {
  const n = segments ?? Math.min(128, Math.max(16, Math.ceil((2 * Math.PI * r) / 3)));
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return ring;
}

/**
 * Points along the circular arc through a, m (a point on the arc) and b, in
 * order from a to b, EXCLUDING a and INCLUDING b. Collinear input → [b].
 */
export function arcThrough(a: Vec2, m: Vec2, b: Vec2, maxSegLen = 3, minSegments = 6): Vec2[] {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], mx = m[0], my = m[1];
  const d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
  if (Math.abs(d) < 1e-9) return [b];
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, m2 = mx * mx + my * my;
  const cx = (a2 * (my - by) + m2 * (by - ay) + b2 * (ay - my)) / d;
  const cy = (a2 * (bx - mx) + m2 * (ax - bx) + b2 * (mx - ax)) / d;
  const r = Math.hypot(ax - cx, ay - cy);
  const ta = Math.atan2(ay - cy, ax - cx);
  const tm = Math.atan2(my - cy, mx - cx);
  const tb = Math.atan2(by - cy, bx - cx);
  // Sweep direction: CCW if m lies on the CCW path from a to b.
  const ccwSweep = (from: number, to: number) => ((to - from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const sweepCCW = ccwSweep(ta, tb);
  const mOnCCW = ccwSweep(ta, tm) < sweepCCW;
  const sweep = mOnCCW ? sweepCCW : -(2 * Math.PI - sweepCCW);
  const n = Math.max(minSegments, Math.ceil((Math.abs(sweep) * r) / maxSegLen));
  const pts: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = ta + (sweep * i) / n;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  pts[pts.length - 1] = [bx, by];
  return pts;
}

/** Parse typed dimensions like "300x500", "300 x 500", "300;500", "300,500" or a single "250". Decimal comma allowed. */
export function parseDims(text: string): number[] {
  const parts = text
    .trim()
    .replace(/,(?=\d{1,2}(\D|$))/g, '.')
    .split(/\s*[x×*;,]\s*|\s+/i)
    .filter((s) => s.length > 0);
  const nums = parts.map((s) => Number(s.replace(',', '.')));
  return nums.every((n) => Number.isFinite(n)) && nums.length > 0 ? nums : [];
}

/** Parse "L" or "L@angle" (degrees) or "L<angle" for polygon segment entry. */
export function parseSegmentEntry(text: string): { length: number; angleDeg?: number } | null {
  const m = text.trim().replace(',', '.').match(/^(-?[\d.]+)\s*(?:[@<]\s*(-?[\d.]+))?$/);
  if (!m) return null;
  const length = Number(m[1]);
  if (!Number.isFinite(length)) return null;
  const angleDeg = m[2] !== undefined ? Number(m[2]) : undefined;
  return { length, angleDeg };
}

export function pointAt(from: Vec2, length: number, angleDeg: number): Vec2 {
  const a = (angleDeg * Math.PI) / 180;
  return [from[0] + length * Math.cos(a), from[1] + length * Math.sin(a)];
}

export function ringBoundsOf(rings: Ring[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export function allRings(p: Polygon): Ring[] {
  return [p.outer, ...p.holes];
}

export function ringCentroidOf(ring: Ring): Vec2 {
  let a = 0, cx = 0, cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) return ring[0] ?? [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRingSimple(p: Vec2, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygonSimple(p: Vec2, poly: Polygon): boolean {
  if (!pointInRingSimple(p, poly.outer)) return false;
  for (const h of poly.holes) if (pointInRingSimple(p, h)) return false;
  return true;
}

/** Distance from a point to the nearest edge of a ring, and that edge index. */
export function nearestEdge(p: Vec2, ring: Ring): { index: number; distance: number } {
  let best = { index: -1, distance: Infinity };
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
    if (d < best.distance) best = { index: i, distance: d };
  }
  return best;
}

export function ringAreaOf(ring: Ring): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function polygonAreaOf(p: Polygon): number {
  return Math.abs(ringAreaOf(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(ringAreaOf(h)), 0);
}
