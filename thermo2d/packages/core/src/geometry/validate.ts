import type { Polygon, Ring, Vec2 } from '../model/types.js';
import type { Issue } from '../commands/types.js';
import { dist, pointInPolygon, pointInRing, ringArea, segmentIntersection } from './ring.js';

export const TINY_EDGE_MM = 0.01;

/** Self-intersection check for one ring: any two non-adjacent edges crossing or touching. */
export function ringSelfIntersects(ring: Ring): { i: number; j: number; point?: Vec2 } | null {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      const c = ring[j];
      const d = ring[(j + 1) % n];
      const r = segmentIntersection(a, b, c, d);
      if (r !== 'none') return { i, j, point: [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4] };
    }
  }
  return null;
}

function ringIssues(ring: Ring, ringIndex: number, regionId: string | undefined): Issue[] {
  const issues: Issue[] = [];
  const entity = regionId ? { collection: 'regions' as const, id: regionId } : undefined;
  const label = ringIndex === 0 ? 'outline' : `hole ${ringIndex}`;
  const labelNb = ringIndex === 0 ? 'omrisset' : `hull ${ringIndex}`;
  if (ring.length < 3) {
    issues.push({
      severity: 'error',
      code: 'too-few-points',
      message: `The ${label} needs at least 3 points.`,
      messageNb: `${labelNb[0].toUpperCase()}${labelNb.slice(1)} trenger minst 3 punkter.`,
      entity,
      ring: ringIndex,
    });
    return issues;
  }
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const l = dist(a, b);
    if (l <= 1e-9) {
      issues.push({
        severity: 'error',
        code: 'duplicate-point',
        message: `Point ${i + 1} of the ${label} is repeated.`,
        messageNb: `Punkt ${i + 1} i ${labelNb} er gjentatt.`,
        entity,
        ring: ringIndex,
        edgeIndex: i,
        point: a,
        suggestion: 'Delete one of the two points.',
      });
    } else if (l < TINY_EDGE_MM) {
      issues.push({
        severity: 'error',
        code: 'tiny-edge',
        message: `Edge ${i + 1} of the ${label} is shorter than ${TINY_EDGE_MM} mm.`,
        messageNb: `Kant ${i + 1} i ${labelNb} er kortere enn ${TINY_EDGE_MM} mm.`,
        entity,
        ring: ringIndex,
        edgeIndex: i,
        point: a,
        suggestion: 'Merge the two points.',
      });
    }
  }
  const si = ringSelfIntersects(ring);
  if (!si && Math.abs(ringArea(ring)) < 1e-6) {
    issues.push({
      severity: 'error',
      code: 'zero-area',
      message: `The ${label} has no area.`,
      messageNb: `${labelNb[0].toUpperCase()}${labelNb.slice(1)} har ikke noe areal.`,
      entity,
      ring: ringIndex,
    });
  }
  if (si) {
    issues.unshift({
      severity: 'error',
      code: 'self-intersection',
      message: `This shape overlaps itself (edges ${si.i + 1} and ${si.j + 1} of the ${label} cross).`,
      messageNb: `Denne formen overlapper seg selv (kant ${si.i + 1} og ${si.j + 1} i ${labelNb} krysser).`,
      entity,
      ring: ringIndex,
      edgeIndex: si.i,
      point: si.point,
      suggestion: 'Move the crossing points apart or redraw the shape.',
    });
  }
  return issues;
}

/** Plain-words validation of one polygon. Empty array = valid. */
export function validatePolygon(p: Polygon, regionId?: string): Issue[] {
  const issues = ringIssues(p.outer, 0, regionId);
  p.holes.forEach((h, k) => {
    issues.push(...ringIssues(h, k + 1, regionId));
    if (h.length >= 3 && issues.every((x) => x.code !== 'self-intersection')) {
      const inside = h.every((pt) => pointInRing(pt, p.outer));
      const crosses = h.some((pt, i) => {
        const q = h[(i + 1) % h.length];
        return p.outer.some((a, j) => segmentIntersection(pt, q, a, p.outer[(j + 1) % p.outer.length]) === 'proper');
      });
      if (!inside || crosses) {
        issues.push({
          severity: 'error',
          code: 'hole-outside',
          message: `Hole ${k + 1} is not fully inside the outline.`,
          messageNb: `Hull ${k + 1} ligger ikke helt inne i omrisset.`,
          entity: regionId ? { collection: 'regions', id: regionId } : undefined,
          ring: k + 1,
          suggestion: 'Move the hole inside the shape, or subtract it from the shape instead.',
        });
      }
    }
  });
  return issues;
}

/**
 * Relationship of two polygons: 'nested' when one lies fully inside the other
 * (allowed: rebars in concrete), 'overlap' when they partially overlap
 * (an error for meshing), 'none' when disjoint or merely touching.
 */
export function regionsOverlap(a: Polygon, b: Polygon): 'none' | 'nested' | 'overlap' {
  const edgesCross = (p: Polygon, q: Polygon): boolean => {
    const ringsP = [p.outer, ...p.holes];
    const ringsQ = [q.outer, ...q.holes];
    for (const rp of ringsP) {
      for (let i = 0; i < rp.length; i++) {
        const a1 = rp[i];
        const a2 = rp[(i + 1) % rp.length];
        for (const rq of ringsQ) {
          for (let j = 0; j < rq.length; j++) {
            if (segmentIntersection(a1, a2, rq[j], rq[(j + 1) % rq.length]) === 'proper') return true;
          }
        }
      }
    }
    return false;
  };
  if (edgesCross(a, b)) return 'overlap';
  const bInA = b.outer.every((pt) => pointInPolygon(a, pt));
  const aInB = a.outer.every((pt) => pointInPolygon(b, pt));
  if (bInA || aInB) {
    // Fully contained, but if it sits in a hole of the other it is disjoint. Use the centroid-ish test on an interior sample.
    const inner = bInA ? b : a;
    const outerP = bInA ? a : b;
    const sample = interiorSample(inner);
    return sample && pointInPolygon(outerP, sample) ? 'nested' : 'none';
  }
  // Same-vertex overlap without crossing edges (e.g. identical polygons) → check an interior point of each
  const sa = interiorSample(a);
  const sb = interiorSample(b);
  if (sa && pointInPolygon(b, sa) && !onBoundary(sa, b)) return sb && pointInPolygon(a, sb) ? 'overlap' : 'nested';
  if (sb && pointInPolygon(a, sb) && !onBoundary(sb, a)) return 'nested';
  return 'none';
}

function onBoundary(pt: Vec2, p: Polygon): boolean {
  for (const r of [p.outer, ...p.holes]) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const d = Math.abs((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])) / Math.max(1e-12, dist(a, b));
      if (d < 1e-9 && pt[0] >= Math.min(a[0], b[0]) - 1e-9 && pt[0] <= Math.max(a[0], b[0]) + 1e-9 && pt[1] >= Math.min(a[1], b[1]) - 1e-9 && pt[1] <= Math.max(a[1], b[1]) + 1e-9) return true;
    }
  }
  return false;
}

/** A point strictly inside the polygon: the centroid of the first ear-ish triangle that lies inside. */
export function interiorSample(p: Polygon): Vec2 | null {
  const r = p.outer;
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[(i + n - 1) % n];
    const b = r[i];
    const c = r[(i + 1) % n];
    const cand: Vec2 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (pointInPolygon(p, cand) && !onBoundary(cand, p)) return cand;
    // shrink towards b
    const cand2: Vec2 = [b[0] * 0.9 + cand[0] * 0.1, b[1] * 0.9 + cand[1] * 0.1];
    if (pointInPolygon(p, cand2) && !onBoundary(cand2, p)) return cand2;
  }
  return null;
}
