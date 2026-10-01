/**
 * Polygon offset built from booleans (DECISIONS.md D3):
 *   outward d > 0:  P ∪ (edge rectangles of width d) ∪ (vertex discs of radius d)
 *   inward  d < 0:  P \ (edge rectangles) \ (vertex discs)   — may split or vanish
 * Holes are handled by the same construction (their edges are offset too).
 * Round joins: ~8 disc segments per 90°.
 */
import type { Polygon, Ring, Vec2 } from '../model/types.js';
import { booleanOp, unionAll } from './boolean.js';
import { dist, normalizePolygon } from './ring.js';

function edgeRect(a: Vec2, b: Vec2, d: number): Ring {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 1e-12) return [];
  const nx = (-dy / l) * d;
  const ny = (dx / l) * d;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

export function discRing(c: Vec2, r: number, segments?: number): Ring {
  const n = segments ?? Math.max(16, Math.ceil(32 * Math.min(1, r / 50)) + 8);
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    ring.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return ring;
}

function ringSweep(ring: Ring, d: number): Polygon[] {
  const parts: Polygon[] = [];
  const n = ring.length;
  // Slightly enlarge the disc radius so the polygonal disc circumscribes the true circle (keeps offset distance ≥ d).
  const segs = 32;
  const rDisc = d / Math.cos(Math.PI / segs);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (dist(a, b) < 1e-12) continue;
    const rect = edgeRect(a, b, d);
    if (rect.length) parts.push(normalizePolygon({ outer: rect, holes: [] }));
    parts.push({ outer: discRing(a, rDisc, segs), holes: [] });
  }
  return parts;
}

/**
 * Offset a polygon by `distance` mm (positive outward, negative inward).
 * Returns zero, one or several polygons (inward offsets can split or vanish).
 */
export function offsetPolygon(p: Polygon, distance: number): Polygon[] {
  const poly = normalizePolygon(p);
  if (Math.abs(distance) < 1e-9) return [poly];
  const d = Math.abs(distance);
  const sweep: Polygon[] = [];
  for (const ring of [poly.outer, ...poly.holes]) sweep.push(...ringSweep(ring, d));
  const swept = unionAll(sweep);
  if (distance > 0) return booleanOp('union', [poly], swept);
  return booleanOp('subtract', [poly], swept);
}

/** Offset every polygon of a list and union the result. */
export function offsetPolygons(ps: Polygon[], distance: number): Polygon[] {
  const out: Polygon[] = [];
  for (const p of ps) out.push(...offsetPolygon(p, distance));
  return distance > 0 ? unionAll(out) : out;
}
