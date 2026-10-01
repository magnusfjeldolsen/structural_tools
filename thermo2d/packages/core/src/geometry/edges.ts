/**
 * Edge addressing. An EdgeRef is (regionId, ring, edgeIndex) plus a geometric
 * fingerprint so it can be re-attached when vertex edits shift indices.
 */
import type { EdgeRef, Polygon, Project, Region, Ring, Vec2 } from '../model/types.js';
import { dist } from './ring.js';

export function ringOfPolygon(p: Polygon, ring: number): Ring | undefined {
  return ring === 0 ? p.outer : p.holes[ring - 1];
}

export function edgeEndpoints(r: Ring, index: number): [Vec2, Vec2] {
  return [r[index], r[(index + 1) % r.length]];
}

export function edgeLength(r: Ring, index: number): number {
  const [a, b] = edgeEndpoints(r, index);
  return dist(a, b);
}

export function edgeMidpoint(r: Ring, index: number): Vec2 {
  const [a, b] = edgeEndpoints(r, index);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Unit normal pointing out of the material. Outer ring is CCW → outward is to the right of a→b; holes are CW → also to the right. */
export function edgeOutwardNormal(r: Ring, index: number, _isHole?: boolean): Vec2 {
  const [a, b] = edgeEndpoints(r, index);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

/** Fingerprint from the rounded midpoint, length and direction (0.01 mm / 0.1°). */
export function edgeFingerprint(r: Ring, index: number): string {
  const [a, b] = edgeEndpoints(r, index);
  const m = edgeMidpoint(r, index);
  const l = dist(a, b);
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  ang = Math.round(ang * 10) / 10;
  if (ang <= -180) ang += 360;
  const f = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
  return `${f(m[0])},${f(m[1])}|${f(l)}|${ang}`;
}

export function fingerprintEdgeRef(region: Region, ref: EdgeRef): EdgeRef {
  const r = ringOfPolygon(region.polygon, ref.ring);
  if (!r || ref.edgeIndex < 0 || ref.edgeIndex >= r.length) return { ...ref };
  return { regionId: region.id, ring: ref.ring, edgeIndex: ref.edgeIndex, fingerprint: edgeFingerprint(r, ref.edgeIndex) };
}

/**
 * Resolve an EdgeRef against the current geometry. If the index still matches the
 * fingerprint (or there is no fingerprint) it is used; otherwise the ring is
 * searched for the fingerprint; otherwise null (the edge is gone).
 */
export interface ResolvedEdge {
  /** Ring index: 0 = outer, k >= 1 = holes[k-1]. */
  ring: number;
  index: number;
  region: Region;
  /** The ring's points. */
  points: Ring;
}

export function resolveEdgeRef(project: Pick<Project, 'regions'>, ref: EdgeRef): ResolvedEdge | null {
  const region = project.regions.find((x) => x.id === ref.regionId);
  if (!region) return null;
  const ring = ringOfPolygon(region.polygon, ref.ring);
  if (ring && ref.edgeIndex >= 0 && ref.edgeIndex < ring.length) {
    if (!ref.fingerprint || edgeFingerprint(ring, ref.edgeIndex) === ref.fingerprint) {
      return { region, points: ring, ring: ref.ring, index: ref.edgeIndex };
    }
  }
  if (!ref.fingerprint) return null;
  const rings = [region.polygon.outer, ...region.polygon.holes];
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri];
    for (let i = 0; i < r.length; i++) {
      if (edgeFingerprint(r, i) === ref.fingerprint) return { region, points: r, ring: ri, index: i };
    }
  }
  return null;
}

/** All edges of a region (outer ring and holes) as fingerprinted refs. */
export function edgesOfRegion(region: Region): EdgeRef[] {
  const out: EdgeRef[] = [];
  const rings = [region.polygon.outer, ...region.polygon.holes];
  rings.forEach((r, ri) => {
    for (let i = 0; i < r.length; i++) out.push({ regionId: region.id, ring: ri, edgeIndex: i, fingerprint: edgeFingerprint(r, i) });
  });
  return out;
}

/**
 * Edges of a region that face the outside of the whole section, i.e. are not
 * shared with (lying on the boundary of) another region, and not facing a nested
 * region. Shared edges are detected by midpoint-on-other-boundary within tol.
 */
export function exteriorEdgesOfRegion(project: Pick<Project, 'regions'>, regionId: string, tol = 1e-6): EdgeRef[] {
  const region = project.regions.find((x) => x.id === regionId);
  if (!region) return [];
  const others = project.regions.filter((x) => x.id !== regionId);
  return edgesOfRegion(region).filter((ref) => {
    const ring = ringOfPolygon(region.polygon, ref.ring)!;
    const m = edgeMidpoint(ring, ref.edgeIndex);
    for (const o of others) {
      for (const r of [o.polygon.outer, ...o.polygon.holes]) {
        for (let i = 0; i < r.length; i++) {
          const [a, b] = edgeEndpoints(r, i);
          if (distanceToSegment(m, a, b) <= tol) return false;
        }
      }
    }
    return true;
  });
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/** Classify an edge of a CCW outer ring by the direction of its outward normal. */
export function edgeSide(r: Ring, index: number): 'bottom' | 'top' | 'left' | 'right' {
  const [nx, ny] = edgeOutwardNormal(r, index);
  if (Math.abs(nx) >= Math.abs(ny)) return nx > 0 ? 'right' : 'left';
  return ny > 0 ? 'top' : 'bottom';
}
