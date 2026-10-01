/// <reference path="./cdt2d.d.ts" />
/**
 * Mesher: size-field point placement → constrained Delaunay (cdt2d) →
 * classification by centroid → Laplacian smoothing → boundary bookkeeping.
 * See DECISIONS.md D2 and D4. Deterministic: no randomness anywhere.
 */
import cdt2d from 'cdt2d';
import type { EdgeRef, Polygon, Vec2 } from '../model/types.js';
import { pointInPolygon, polygonArea, polygonBounds, polygonsBounds, ringArea } from '../geometry/ring.js';
import { regionsOverlap, validatePolygon } from '../geometry/validate.js';
import { edgeKey, MeshError, type BoundarySegment, type Mesh, type MeshInput, type MeshRegionInput, type MeshWarning } from './types.js';
import { SizeFieldEvaluator, type SizeSource } from './sizefield.js';
import { PointGrid, SegmentGrid } from './spatial.js';

interface Constraint {
  /** Canonical endpoint order (lexicographic) so shared edges sample identically. */
  a: Vec2;
  b: Vec2;
  h: number;
  sources: { regionIndex: number; ring: number; edgeIndex: number; forward: boolean }[];
}

const MERGE_TOL = 1e-6;

function keyOf(x: number, y: number): string {
  return `${Math.round(x / MERGE_TOL)},${Math.round(y / MERGE_TOL)}`;
}

function lexLess(a: Vec2, b: Vec2): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

/** Positions along a→b (fractions 0..1, exclusive of the ends) from the density 1/h(s). */
function gradedFractions(a: Vec2, b: Vec2, field: SizeFieldEvaluator, hEdge: number): number[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const M = Math.max(8, Math.min(4000, Math.ceil((L / Math.max(field.minSize, 1e-3)) * 2)));
  const cum = new Float64Array(M + 1);
  let acc = 0;
  let prev = 1 / Math.min(hEdge, field.h(a[0], a[1]));
  for (let i = 1; i <= M; i++) {
    const t = i / M;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const cur = 1 / Math.min(hEdge, field.h(x, y));
    acc += ((prev + cur) / 2) * (L / M);
    cum[i] = acc;
    prev = cur;
  }
  const n = Math.max(1, Math.round(acc));
  const out: number[] = [];
  let k = 1;
  for (let i = 1; i <= M && k < n; i++) {
    const target = (k * acc) / n;
    if (cum[i] >= target) {
      const c0 = cum[i - 1];
      const c1 = cum[i];
      const f = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
      out.push(((i - 1) + f) / M);
      k++;
    }
  }
  return out;
}

export function mesh(input: MeshInput): Mesh {
  const { regions, size } = input;
  if (!regions.length) throw new MeshError('empty', 'There is nothing to mesh yet: draw a shape first.', { hint: 'Add a region.' });

  // 1. Validate
  for (const r of regions) {
    const issues = validatePolygon(r.polygon, r.id).filter((i) => i.severity === 'error');
    if (issues.length) {
      const i = issues[0];
      const code = (i.code === 'self-intersection' || i.code === 'zero-area' || i.code === 'tiny-edge' || i.code === 'hole-outside' ? i.code : 'self-intersection') as MeshError['code'];
      throw new MeshError(code, i.message, { regionId: r.id, ring: i.ring, edgeIndex: i.edgeIndex, point: i.point, hint: i.suggestion });
    }
  }
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (regionsOverlap(regions[i].polygon, regions[j].polygon) === 'overlap') {
        throw new MeshError('overlap', `"${regions[i].id}" and "${regions[j].id}" partly overlap each other.`, {
          regionId: regions[j].id,
          hint: 'Use subtract or union so each point of the section belongs to one region, or move one region fully inside the other.',
        });
      }
    }
  }

  const exposed = new Set(input.exposedEdges.map(edgeKey));
  const areas = regions.map((r) => polygonArea(r.polygon));
  const bboxes = regions.map((r) => polygonBounds(r.polygon));

  // 2. Constraints with local size, merged by canonical endpoints
  const constraintMap = new Map<string, Constraint>();
  const sources: SizeSource[] = [];
  regions.forEach((r, regionIndex) => {
    const rings = [r.polygon.outer, ...r.polygon.holes];
    rings.forEach((ring, ringIndex) => {
      for (let e = 0; e < ring.length; e++) {
        const p = ring[e];
        const q = ring[(e + 1) % ring.length];
        const isRebar = r.kind !== 'region';
        const isExposed = exposed.has(edgeKey({ regionId: r.id, ring: ringIndex, edgeIndex: e }));
        const h = isRebar ? size.rebarSize : isExposed ? size.boundarySize : size.interiorSize;
        if (isRebar || isExposed) sources.push({ a: p, b: q, h });
        const forward = lexLess(p, q);
        const a = forward ? p : q;
        const b = forward ? q : p;
        const k = `${keyOf(a[0], a[1])}|${keyOf(b[0], b[1])}`;
        const c = constraintMap.get(k);
        const src = { regionIndex, ring: ringIndex, edgeIndex: e, forward };
        if (c) {
          c.h = Math.min(c.h, h);
          c.sources.push(src);
        } else constraintMap.set(k, { a, b, h, sources: [src] });
      }
    });
  });
  const field = new SizeFieldEvaluator(size, sources);

  // 3. Points: constraint samples first (dedup), then interior points
  const pts: number[][] = [];
  const pointIndex = new Map<string, number>();
  const addPoint = (x: number, y: number): number => {
    const k = keyOf(x, y);
    const idx = pointIndex.get(k);
    if (idx !== undefined) return idx;
    const i = pts.length;
    pts.push([x, y]);
    pointIndex.set(k, i);
    return i;
  };
  interface SubSeg {
    i: number;
    j: number;
    c: Constraint;
  }
  const subSegs: SubSeg[] = [];
  const constraints = [...constraintMap.values()];
  for (const c of constraints) {
    const chain = [addPoint(c.a[0], c.a[1])];
    for (const f of gradedFractions(c.a, c.b, field, c.h)) chain.push(addPoint(c.a[0] + (c.b[0] - c.a[0]) * f, c.a[1] + (c.b[1] - c.a[1]) * f));
    chain.push(addPoint(c.b[0], c.b[1]));
    for (let k = 0; k + 1 < chain.length; k++) if (chain[k] !== chain[k + 1]) subSegs.push({ i: chain[k], j: chain[k + 1], c });
  }
  const nConstraintPts = pts.length;

  // 3b. T-junctions: split sub-segments at constraint points lying on them (touching regions with partial shared edges)
  const bbAll = polygonsBounds(regions.map((r) => r.polygon));
  const cell = Math.max(size.interiorSize, 1);
  const ptGrid = new PointGrid(cell);
  for (const p of pts) ptGrid.add(p[0], p[1]);
  const splitSegs: SubSeg[] = [];
  for (const s of subSegs) {
    const a = pts[s.i];
    const b = pts[s.j];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    const near = ptGrid.within(mx, my, half + 1e-6).filter((k) => k !== s.i && k !== s.j);
    const onSeg: { k: number; t: number }[] = [];
    for (const k of near) {
      const p = pts[k];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const qx = a[0] + t * dx - p[0];
      const qy = a[1] + t * dy - p[1];
      if (qx * qx + qy * qy < 1e-12) onSeg.push({ k, t });
    }
    if (!onSeg.length) {
      splitSegs.push(s);
      continue;
    }
    onSeg.sort((u, v) => u.t - v.t);
    let prev = s.i;
    for (const o of onSeg) {
      splitSegs.push({ i: prev, j: o.k, c: s.c });
      prev = o.k;
    }
    splitSegs.push({ i: prev, j: s.j, c: s.c });
  }

  // 3c. Interior points on a graded triangular lattice, coarse → fine
  const segGrid = new SegmentGrid(cell);
  for (const s of splitSegs) segGrid.add(pts[s.i] as Vec2, pts[s.j] as Vec2);
  const levels: number[] = [];
  for (let s = size.interiorSize; s >= field.minSize * 0.9 && levels.length < 12; s /= 2) levels.push(s);
  const containing = (x: number, y: number): number => {
    let best = -1;
    let bestArea = Infinity;
    for (let r = 0; r < regions.length; r++) {
      const bb = bboxes[r];
      if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
      if (areas[r] < bestArea && pointInPolygon(regions[r].polygon, [x, y])) {
        best = r;
        bestArea = areas[r];
      }
    }
    return best;
  };
  const budget = Math.max(1000, Math.floor(size.maxElements / 2));
  for (let li = 0; li < levels.length; li++) {
    const s = levels[li];
    const rowH = (s * Math.sqrt(3)) / 2;
    const ny = Math.ceil((bbAll.maxY - bbAll.minY) / rowH) + 1;
    const nx = Math.ceil((bbAll.maxX - bbAll.minX) / s) + 1;
    for (let iy = 0; iy <= ny; iy++) {
      const y = bbAll.minY + iy * rowH;
      const shift = iy % 2 ? s / 2 : 0;
      for (let ix = 0; ix <= nx; ix++) {
        const x = bbAll.minX + ix * s + shift;
        const h = field.h(x, y);
        const coarsest = li === 0;
        if (!(h >= s * 0.75 && (coarsest || h < s * 1.5))) continue;
        if (containing(x, y) < 0) continue;
        const dSeg = segGrid.nearestDist(x, y, h);
        if (dSeg < 0.5 * h) continue;
        const dPt = Math.sqrt(ptGrid.nearestDist2(x, y, h));
        if (dPt < 0.6 * Math.min(h, s)) continue;
        addPoint(x, y);
        ptGrid.add(x, y);
        if (pts.length > budget) {
          throw new MeshError('too-many-elements', `The mesh would need more than ${size.maxElements} elements.`, {
            hint: 'Choose a coarser mesh preset or raise the element limit under Advanced.',
          });
        }
      }
    }
  }

  // 4. Constrained Delaunay
  const edges = splitSegs.map((s) => [s.i, s.j]);
  let tris: number[][];
  try {
    tris = cdt2d(pts, edges, { delaunay: true, interior: true, exterior: true });
  } catch (err) {
    throw new MeshError('internal', 'The triangulation failed on this geometry.', { hint: String(err) });
  }

  // 5. Classify triangles by centroid → smallest containing region; drop outside/hole triangles
  const keptTris: number[][] = [];
  const keptRegion: number[] = [];
  for (const t of tris) {
    const a = pts[t[0]];
    const b = pts[t[1]];
    const c = pts[t[2]];
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const r = containing(cx, cy);
    if (r < 0) continue;
    // ensure CCW
    const area2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area2) < 1e-12) continue;
    keptTris.push(area2 > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]);
    keptRegion.push(r);
  }
  if (!keptTris.length) throw new MeshError('empty', 'No elements ended up inside the regions.', { hint: 'Check that the outline is a closed shape with an area.' });
  if (keptTris.length > size.maxElements) {
    throw new MeshError('too-many-elements', `The mesh has ${keptTris.length} elements, more than the limit of ${size.maxElements}.`, {
      hint: 'Choose a coarser mesh preset or raise the element limit under Advanced.',
    });
  }

  // 6. Laplacian smoothing of free (non-constraint) nodes, rejecting inversions
  const n = pts.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i][0];
    ys[i] = pts[i][1];
  }
  const nbr: number[][] = Array.from({ length: n }, () => []);
  const triOf: number[][] = Array.from({ length: n }, () => []);
  keptTris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const u = t[k];
      const v = t[(k + 1) % 3];
      nbr[u].push(v);
      nbr[v].push(u);
      triOf[u].push(ti);
    }
  });
  const signedArea2 = (t: number[], moved: number, mx: number, my: number): number => {
    const px = (i: number) => (i === moved ? mx : xs[i]);
    const py = (i: number) => (i === moved ? my : ys[i]);
    return (px(t[1]) - px(t[0])) * (py(t[2]) - py(t[0])) - (py(t[1]) - py(t[0])) * (px(t[2]) - px(t[0]));
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let i = nConstraintPts; i < n; i++) {
      const nb = nbr[i];
      if (!nb.length) continue;
      let sx = 0;
      let sy = 0;
      for (const j of nb) {
        sx += xs[j];
        sy += ys[j];
      }
      const mx = sx / nb.length;
      const my = sy / nb.length;
      let ok = true;
      for (const ti of triOf[i]) {
        if (signedArea2(keptTris[ti], i, mx, my) <= 1e-9) {
          ok = false;
          break;
        }
      }
      if (ok) {
        xs[i] = mx;
        ys[i] = my;
      }
    }
  }

  // 7. Compact node numbering to used nodes only
  const used = new Int32Array(n).fill(-1);
  let m = 0;
  for (const t of keptTris) for (const v of t) if (used[v] < 0) used[v] = m++;
  const nodes = new Float64Array(2 * m);
  for (let i = 0; i < n; i++) {
    if (used[i] >= 0) {
      nodes[2 * used[i]] = xs[i];
      nodes[2 * used[i] + 1] = ys[i];
    }
  }
  const triangles = new Uint32Array(3 * keptTris.length);
  const elementRegion = new Int32Array(keptTris.length);
  keptTris.forEach((t, ti) => {
    triangles[3 * ti] = used[t[0]];
    triangles[3 * ti + 1] = used[t[1]];
    triangles[3 * ti + 2] = used[t[2]];
    elementRegion[ti] = keptRegion[ti];
  });

  // 8. Boundary segments: triangle edges used once; map to source EdgeRef via constraint bookkeeping
  const constraintByEdge = new Map<string, Constraint>();
  for (const s of splitSegs) constraintByEdge.set(s.i < s.j ? `${s.i}-${s.j}` : `${s.j}-${s.i}`, s.c);
  const edgeUse = new Map<string, number>();
  keptTris.forEach((t) => {
    for (let k = 0; k < 3; k++) {
      const u = t[k];
      const v = t[(k + 1) % 3];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  });
  const boundary: BoundarySegment[] = [];
  const warnings: MeshWarning[] = [];
  let unmapped = 0;
  keptTris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const u = t[k];
      const v = t[(k + 1) % 3];
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (edgeUse.get(key) !== 1) continue;
      const c = constraintByEdge.get(key);
      const regionIndex = keptRegion[ti];
      const src = c?.sources.find((s) => s.regionIndex === regionIndex) ?? c?.sources[0];
      if (!src) {
        unmapped++;
        continue;
      }
      const ref: EdgeRef = { regionId: regions[src.regionIndex].id, ring: src.ring, edgeIndex: src.edgeIndex };
      boundary.push({ a: used[u], b: used[v], regionIndex, edgeRef: ref });
    }
  });
  if (unmapped) warnings.push({ code: 'unmapped-boundary', message: `${unmapped} boundary edges could not be traced to a drawn edge; they are treated as insulated.` });

  // 9. Stats
  let minAngle = 180;
  let minEdge = Infinity;
  let maxEdge = 0;
  let poor = 0;
  let worstPt: Vec2 = [0, 0];
  const regionCount = new Array<number>(regions.length).fill(0);
  const regionArea = new Array<number>(regions.length).fill(0);
  for (let ti = 0; ti < keptTris.length; ti++) {
    const i0 = triangles[3 * ti];
    const i1 = triangles[3 * ti + 1];
    const i2 = triangles[3 * ti + 2];
    const ax = nodes[2 * i0];
    const ay = nodes[2 * i0 + 1];
    const bx = nodes[2 * i1];
    const by = nodes[2 * i1 + 1];
    const cx = nodes[2 * i2];
    const cy = nodes[2 * i2 + 1];
    const la = Math.hypot(cx - bx, cy - by);
    const lb = Math.hypot(cx - ax, cy - ay);
    const lc = Math.hypot(bx - ax, by - ay);
    minEdge = Math.min(minEdge, la, lb, lc);
    maxEdge = Math.max(maxEdge, la, lb, lc);
    const ang = (a: number, b: number, c: number) => (Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c)))) * 180) / Math.PI;
    const tMin = Math.min(ang(la, lb, lc), ang(lb, lc, la), ang(lc, la, lb));
    if (tMin < minAngle) {
      minAngle = tMin;
      worstPt = [(ax + bx + cx) / 3, (ay + by + cy) / 3];
    }
    if (tMin < size.minAngle) poor++;
    regionCount[elementRegion[ti]]++;
    regionArea[elementRegion[ti]] += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
  }
  if (minAngle < 8) {
    warnings.push({
      code: 'unrefinable',
      message: `A very thin element (${minAngle.toFixed(1)}°) sits near (${worstPt[0].toFixed(1)}, ${worstPt[1].toFixed(1)}) mm; results there may be less accurate. A sharp corner or two nearly touching edges is the usual cause.`,
      point: worstPt,
    });
  }
  regions.forEach((r, i) => {
    if (regionCount[i] === 0) warnings.push({ code: 'empty-region', message: `Region "${r.id}" received no elements (it may be covered by another region).`, regionId: r.id });
  });

  return {
    nodes,
    triangles,
    elementRegion,
    regions: regions.map((r, i) => ({ id: r.id, materialId: r.materialId, kind: r.kind, elementCount: regionCount[i], area: regionArea[i] })),
    boundary,
    stats: { nodeCount: m, elementCount: keptTris.length, minAngleDeg: minAngle, minEdge, maxEdge, poorElements: poor },
    warnings,
  };
}

/** Exposed for tests: net polygon area helper re-export. */
export function inputArea(regions: MeshRegionInput[]): number {
  return regions.reduce((s, r) => s + Math.abs(ringArea(r.polygon.outer)) - r.polygon.holes.reduce((q, h) => q + Math.abs(ringArea(h)), 0), 0);
}

export type { Polygon };
