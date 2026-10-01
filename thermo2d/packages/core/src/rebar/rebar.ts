/**
 * Reinforcement generation. Bars are defined relative to their host region
 * (edge, corners, cover) and regenerated whenever the host geometry changes.
 */
import type { Issue } from '../commands/types.js';
import { offsetPolygon } from '../geometry/offset.js';
import { circleRing, circleSegments } from '../geometry/primitives.js';
import { dist, pointInPolygon, polygonArea, polygonCentroid, ringCentroid } from '../geometry/ring.js';
import { edgeEndpoints, edgeOutwardNormal, resolveEdgeRef } from '../geometry/edges.js';
import type { Polygon, Project, Rebar, RebarSet, Region, Ring, Vec2 } from '../model/types.js';

/** Distance from the host surface to the bar CENTRE for a set, per the project's cover reference. */
export function centreOffset(set: Pick<RebarSet, 'cover' | 'diameter'>, project: Pick<Project, 'settings'>): number {
  return project.settings.coverReference === 'surface' ? set.cover + set.diameter / 2 : set.cover;
}

/** Circle polygon of a bar; segments default from the size rule in geometry/primitives. */
export function rebarPolygon(rebar: Pick<Rebar, 'centre' | 'diameter'>, segments?: number): Polygon {
  const r = rebar.diameter / 2;
  return { outer: circleRing(rebar.centre[0], rebar.centre[1], r, segments ?? Math.min(24, Math.max(12, circleSegments(r)))), holes: [] };
}

/** The cover-offset polygon of a region (inward by the centre offset); largest piece when the offset splits. */
export function coverPolygon(region: Region, offsetMm: number): Polygon | null {
  const pieces = offsetPolygon(region.polygon, -offsetMm);
  if (!pieces.length) return null;
  return pieces.reduce((best, p) => (polygonArea(p) > polygonArea(best) ? p : best));
}

/** Closed stirrup path for a stirrup set: the cover-offset outline at (cover + Ø/2) from the surface. */
export function stirrupPath(set: RebarSet, project: Project): Ring | null {
  const region = project.regions.find((r) => r.id === set.regionId);
  if (!region) return null;
  const off = project.settings.coverReference === 'surface' ? set.cover + set.diameter / 2 : set.cover;
  const cp = coverPolygon(region, off);
  return cp ? cp.outer : null;
}

/** Stirrup as a thin steel band of thickness Ø (for the advanced "mesh stirrup" option). */
export function stirrupPolygon(set: RebarSet, project: Project): Polygon | null {
  const path = stirrupPath(set, project);
  if (!path) return null;
  const outer = offsetPolygon({ outer: path, holes: [] }, set.diameter / 2);
  const inner = offsetPolygon({ outer: path, holes: [] }, -set.diameter / 2);
  if (!outer.length) return null;
  const o = outer.reduce((b, p) => (polygonArea(p) > polygonArea(b) ? p : b));
  return { outer: o.outer, holes: inner.length ? [inner[0].outer.slice().reverse()] : [] };
}

function barsForSet(set: RebarSet, project: Project): Vec2[] {
  const region = project.regions.find((r) => r.id === set.regionId);
  if (!region) return [];
  const off = centreOffset(set, project);
  switch (set.kind) {
    case 'edge': {
      if (!set.edgeRef) return [];
      const res = resolveEdgeRef(project, set.edgeRef);
      if (!res) return [];
      const [a, b] = edgeEndpoints(res.points, res.index);
      const n = edgeOutwardNormal(res.points, res.index);
      const L = dist(a, b);
      const ux = (b[0] - a[0]) / L;
      const uy = (b[1] - a[1]) / L;
      const start = set.startOffset ?? off;
      const end = set.endOffset ?? off;
      const usable = L - start - end;
      if (usable < 0) return [];
      let count: number;
      if (set.count && set.count > 0) count = Math.round(set.count);
      else if (set.spacing && set.spacing > 0) count = Math.floor(usable / set.spacing + 1e-9) + 1;
      else count = 2;
      const pts: Vec2[] = [];
      for (let i = 0; i < count; i++) {
        const s = count === 1 ? start + usable / 2 : set.count ? start + (usable * i) / (count - 1) : start + i * (set.spacing as number);
        pts.push([a[0] + ux * s - n[0] * off, a[1] + uy * s - n[1] * off]);
      }
      return pts;
    }
    case 'corner': {
      const cp = coverPolygon(region, off);
      if (!cp) return [];
      const corners = set.corners && set.corners.length ? set.corners : region.polygon.outer.map((_, i) => i);
      const pts: Vec2[] = [];
      for (const vi of corners) {
        const v = region.polygon.outer[vi];
        if (!v) continue;
        // nearest vertex of the offset polygon to the original corner
        let best: Vec2 | null = null;
        let bd = Infinity;
        for (const q of cp.outer) {
          const d = dist(q, v);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) pts.push(best);
      }
      return pts;
    }
    case 'grid': {
      const cp = coverPolygon(region, off);
      if (!cp) return [];
      const sx = set.spacingX ?? set.spacing ?? 150;
      const sy = set.spacingY ?? set.spacing ?? 150;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of cp.outer) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const pts: Vec2[] = [];
      const nx = Math.floor((maxX - minX) / sx + 1e-9);
      const ny = Math.floor((maxY - minY) / sy + 1e-9);
      const ox = minX + ((maxX - minX) - nx * sx) / 2;
      const oy = minY + ((maxY - minY) - ny * sy) / 2;
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const p: Vec2 = [ox + i * sx, oy + j * sy];
          if (pointInPolygon(cp, p)) pts.push(p);
        }
      }
      return pts;
    }
    case 'ring': {
      const c = polygonCentroid(region.polygon);
      // radius of the host circle ≈ mean distance from centroid to outline
      const rHost = region.polygon.outer.reduce((s, q) => s + dist(q, c), 0) / region.polygon.outer.length;
      const r = rHost - off;
      const count = Math.max(1, Math.round(set.count ?? (set.spacing ? (2 * Math.PI * r) / set.spacing : 6)));
      const pts: Vec2[] = [];
      for (let i = 0; i < count; i++) {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / count; // first bar at the bottom
        pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
      }
      return pts;
    }
    case 'stirrup':
    case 'manual':
      return [];
  }
}

function sortLeftRightBottomTop(pts: { p: Vec2; i: number }[]): { p: Vec2; i: number }[] {
  return pts.slice().sort((a, b) => a.p[1] - b.p[1] || a.p[0] - b.p[0]);
}

/**
 * Recompute the bars of every set from the host geometry. Manual and detached bars
 * are kept. Ids are stable for the same (setId, setIndex). Names "B1", "B2", …
 * are assigned by set order, then bottom-to-top, left-to-right.
 */
export function regenerateRebars(project: Project): Project {
  const generated: Rebar[] = [];
  const oldBySet = new Map<string, Rebar[]>();
  for (const r of project.rebars) {
    if (r.setId) {
      const arr = oldBySet.get(r.setId) ?? [];
      arr.push(r);
      oldBySet.set(r.setId, arr);
    }
  }
  const setIds = new Set(project.rebarSets.map((s) => s.id));
  for (const set of project.rebarSets) {
    const pts = barsForSet(set, project);
    const olds = oldBySet.get(set.id) ?? [];
    const ordered = sortLeftRightBottomTop(pts.map((p, i) => ({ p, i })));
    ordered.forEach(({ p }, setIndex) => {
      const old = olds.find((o) => o.setIndex === setIndex);
      generated.push({
        id: old?.id ?? `${set.id}_b${setIndex}`,
        name: '',
        centre: [round6(p[0]), round6(p[1])],
        diameter: set.diameter,
        materialId: set.materialId,
        strengthClassId: set.strengthClassId,
        setId: set.id,
        setIndex,
        probe: old?.probe ?? true,
      });
    });
  }
  // manual / detached bars (setId absent, or pointing at a set that no longer exists → keep as manual)
  const manual = project.rebars.filter((r) => !r.setId || !setIds.has(r.setId)).map((r) => (r.setId && !setIds.has(r.setId) ? { ...r, setId: undefined, setIndex: undefined } : r));
  const all = [...generated, ...manual];
  // numbering: sets in order, then manual bars, bottom-to-top / left-to-right within each group
  let k = 1;
  const named: Rebar[] = [];
  for (const set of project.rebarSets) {
    for (const r of all.filter((x) => x.setId === set.id)) named.push({ ...r, name: `B${k++}` });
  }
  const manualSorted = manual.slice().sort((a, b) => a.centre[1] - b.centre[1] || a.centre[0] - b.centre[0]);
  for (const r of manualSorted) named.push({ ...r, name: `B${k++}` });
  return { ...project, rebars: named };
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Warnings about the reinforcement layout (never errors: the user decides). */
export function checkRebars(project: Project): Issue[] {
  const issues: Issue[] = [];
  const bars = project.rebars;
  const regionOf = (bar: Rebar): Region | undefined => {
    const set = bar.setId ? project.rebarSets.find((s) => s.id === bar.setId) : undefined;
    if (set) return project.regions.find((r) => r.id === set.regionId);
    return project.regions.find((r) => r.source !== 'derived' && pointInPolygon(r.polygon, bar.centre));
  };
  for (const bar of bars) {
    const host = regionOf(bar);
    const entity = { collection: 'rebars' as const, id: bar.id };
    if (!host || !pointInPolygon(host.polygon, bar.centre)) {
      issues.push({ severity: 'warning', code: 'bar-outside', message: `Bar ${bar.name} lies outside the concrete.`, messageNb: `Stang ${bar.name} ligger utenfor betongen.`, entity, point: bar.centre });
      continue;
    }
    // cover: distance from bar surface to the nearest outline edge
    let dMin = Infinity;
    for (const ring of [host.polygon.outer, ...host.polygon.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = edgeEndpoints(ring, i);
        dMin = Math.min(dMin, distPointSegment(bar.centre, a, b));
      }
    }
    const cover = dMin - bar.diameter / 2;
    if (cover < bar.diameter) {
      issues.push({
        severity: 'warning',
        code: 'cover-small',
        message: `Bar ${bar.name} has ${cover.toFixed(0)} mm cover, less than its diameter (${bar.diameter} mm).`,
        messageNb: `Stang ${bar.name} har ${cover.toFixed(0)} mm overdekning, mindre enn diameteren (${bar.diameter} mm).`,
        entity,
        point: bar.centre,
      });
    }
  }
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i];
      const b = bars[j];
      const clear = dist(a.centre, b.centre) - a.diameter / 2 - b.diameter / 2;
      if (clear < 0) {
        issues.push({ severity: 'warning', code: 'bars-overlap', message: `Bars ${a.name} and ${b.name} overlap.`, messageNb: `Stengene ${a.name} og ${b.name} overlapper.`, entity: { collection: 'rebars', id: b.id }, point: b.centre });
      } else if (clear < Math.max(20, a.diameter, b.diameter)) {
        issues.push({
          severity: 'warning',
          code: 'spacing-small',
          message: `Clear spacing between ${a.name} and ${b.name} is ${clear.toFixed(0)} mm (less than ${Math.max(20, a.diameter, b.diameter)} mm).`,
          messageNb: `Fri avstand mellom ${a.name} og ${b.name} er ${clear.toFixed(0)} mm (mindre enn ${Math.max(20, a.diameter, b.diameter)} mm).`,
          entity: { collection: 'rebars', id: b.id },
          point: b.centre,
        });
      }
    }
  }
  return issues;
}

function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

export { ringCentroid };
