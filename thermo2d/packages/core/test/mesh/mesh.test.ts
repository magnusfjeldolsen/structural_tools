import { describe, expect, it } from 'vitest';
import { mesh, buildMeshInput } from '../../src/mesh/index.js';
import { MeshError, edgeKey, type Mesh, type MeshInput, type MeshRegionInput } from '../../src/mesh/types.js';
import { MESH_PRESETS, createEmptyProject } from '../../src/model/defaults.js';
import { circleRing } from '../../src/geometry/primitives.js';
import { edgeOutwardNormal, edgeEndpoints } from '../../src/geometry/edges.js';
import { polygonArea } from '../../src/geometry/ring.js';
import type { EdgeRef, Polygon } from '../../src/model/types.js';

const rect = (x: number, y: number, w: number, h: number): Polygon => ({ outer: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], holes: [] });
const normal = MESH_PRESETS.normal;

function elementAreas(m: Mesh): number[] {
  const areas = new Array<number>(m.regions.length).fill(0);
  for (let t = 0; t < m.stats.elementCount; t++) {
    const [a, b, c] = [m.triangles[3 * t], m.triangles[3 * t + 1], m.triangles[3 * t + 2]];
    const ax = m.nodes[2 * a], ay = m.nodes[2 * a + 1];
    const bx = m.nodes[2 * b], by = m.nodes[2 * b + 1];
    const cx = m.nodes[2 * c], cy = m.nodes[2 * c + 1];
    const s = ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    expect(s).toBeGreaterThan(0); // CCW
    areas[m.elementRegion[t]] += s;
  }
  return areas;
}

function boundaryLength(m: Mesh): number {
  let l = 0;
  for (const s of m.boundary) l += Math.hypot(m.nodes[2 * s.b] - m.nodes[2 * s.a], m.nodes[2 * s.b + 1] - m.nodes[2 * s.a + 1]);
  return l;
}

function beamWithBars(): MeshInput {
  const regions: MeshRegionInput[] = [{ id: 'conc', polygon: rect(0, 0, 300, 500), materialId: 'c', kind: 'region' }];
  const xs = [45, 150, 255];
  xs.forEach((x, i) => regions.push({ id: `b${i}`, polygon: { outer: circleRing(x, 45, 10, 16), holes: [] }, materialId: 's', kind: 'rebar' }));
  xs.forEach((x, i) => regions.push({ id: `t${i}`, polygon: { outer: circleRing(x, 455, 8, 16), holes: [] }, materialId: 's', kind: 'rebar' }));
  const exposedEdges: EdgeRef[] = [0, 1, 3].map((e) => ({ regionId: 'conc', ring: 0, edgeIndex: e }));
  return { regions, exposedEdges, size: normal };
}

describe('mesher', () => {
  it('meshes a rectangle: areas, boundary, edge refs, quality, determinism', () => {
    const input: MeshInput = { regions: [{ id: 'r', polygon: rect(0, 0, 300, 500), materialId: null, kind: 'region' }], exposedEdges: [{ regionId: 'r', ring: 0, edgeIndex: 0 }], size: normal };
    const m = mesh(input);
    const areas = elementAreas(m);
    expect(areas[0]).toBeCloseTo(150000, 3);
    expect(boundaryLength(m)).toBeCloseTo(1600, 3);
    expect(m.stats.minAngleDeg).toBeGreaterThan(20);
    // every boundary segment's edgeRef matches its outward normal side
    for (const s of m.boundary) {
      const ring = input.regions[0].polygon.outer;
      const n = edgeOutwardNormal(ring, s.edgeRef.edgeIndex);
      const dx = m.nodes[2 * s.b] - m.nodes[2 * s.a];
      const dy = m.nodes[2 * s.b + 1] - m.nodes[2 * s.a + 1];
      const nSeg = [dy, -dx];
      const dot = (n[0] * nSeg[0] + n[1] * nSeg[1]) / Math.hypot(dx, dy);
      expect(dot).toBeCloseTo(1, 6);
    }
    // fine at the exposed bottom edge, coarser at the top
    const bottom = m.boundary.filter((s) => s.edgeRef.edgeIndex === 0).length;
    const top = m.boundary.filter((s) => s.edgeRef.edgeIndex === 2).length;
    expect(bottom).toBeGreaterThan(top * 2);
    const m2 = mesh(input);
    expect(Array.from(m2.nodes)).toEqual(Array.from(m.nodes));
    expect(Array.from(m2.triangles)).toEqual(Array.from(m.triangles));
  });

  it('nested rebar circles inside concrete (spec §9 trouble spot 1)', () => {
    const input = beamWithBars();
    const m = mesh(input);
    const areas = elementAreas(m);
    const total = areas.reduce((s, a) => s + a, 0);
    expect(total).toBeCloseTo(150000, 2);
    for (let i = 1; i < input.regions.length; i++) {
      expect(Math.abs(areas[i] - polygonArea(input.regions[i].polygon)) / polygonArea(input.regions[i].polygon)).toBeLessThan(1e-3);
    }
    expect(m.stats.elementCount).toBeGreaterThan(3000);
    expect(m.stats.elementCount).toBeLessThan(40000);
    expect(m.stats.minAngleDeg).toBeGreaterThan(20);
    expect(boundaryLength(m)).toBeCloseTo(1600, 3); // bar circles are interfaces, not boundary
    expect(m.boundary.every((s) => s.edgeRef.regionId === 'conc')).toBe(true);
  });

  it('two regions sharing an edge produce a conforming interface (trouble spot 2)', () => {
    const input: MeshInput = {
      regions: [
        { id: 'a', polygon: rect(0, 0, 100, 100), materialId: 'x', kind: 'region' },
        { id: 'b', polygon: rect(100, 0, 100, 100), materialId: 'y', kind: 'region' },
      ],
      exposedEdges: [{ regionId: 'a', ring: 0, edgeIndex: 0 }, { regionId: 'b', ring: 0, edgeIndex: 0 }],
      size: normal,
    };
    const m = mesh(input);
    const areas = elementAreas(m);
    expect(areas[0]).toBeCloseTo(10000, 3);
    expect(areas[1]).toBeCloseTo(10000, 3);
    expect(boundaryLength(m)).toBeCloseTo(600, 3);
    // no boundary segment on x = 100
    expect(m.boundary.some((s) => Math.abs(m.nodes[2 * s.a] - 100) < 1e-9 && Math.abs(m.nodes[2 * s.b] - 100) < 1e-9)).toBe(false);
  });

  it('partial shared edge (T-junction) still conforms', () => {
    const input: MeshInput = {
      regions: [
        { id: 'a', polygon: rect(0, 0, 300, 100), materialId: 'x', kind: 'region' },
        { id: 'b', polygon: rect(100, 100, 100, 100), materialId: 'y', kind: 'region' },
      ],
      exposedEdges: [],
      size: MESH_PRESETS.coarse,
    };
    const m = mesh(input);
    const areas = elementAreas(m);
    expect(areas[0]).toBeCloseTo(30000, 3);
    expect(areas[1]).toBeCloseTo(10000, 3);
    expect(boundaryLength(m)).toBeCloseTo(800 + 400 - 200, 3);
  });

  it('thin cover zone and holes', () => {
    const regions: MeshRegionInput[] = [
      { id: 'c', polygon: { outer: rect(0, 0, 300, 500).outer, holes: [rect(100, 200, 100, 100).outer.slice().reverse()] }, materialId: 'c', kind: 'region' },
      { id: 'bar', polygon: { outer: circleRing(30, 30, 10, 16), holes: [] }, materialId: 's', kind: 'rebar' },
    ];
    const m = mesh({ regions, exposedEdges: [{ regionId: 'c', ring: 0, edgeIndex: 0 }, { regionId: 'c', ring: 0, edgeIndex: 3 }], size: normal });
    const areas = elementAreas(m);
    expect(areas[0] + areas[1]).toBeCloseTo(140000, 2);
    expect(boundaryLength(m)).toBeCloseTo(1600 + 400, 3);
    expect(m.boundary.some((s) => s.edgeRef.ring === 1)).toBe(true);
    expect(m.stats.minAngleDeg).toBeGreaterThan(15);
  });

  it('sharp corner: reports a warning, does not hang', () => {
    const sharp: Polygon = { outer: [[0, 0], [300, 0], [300, 5], [0, 60]], holes: [] };
    const m = mesh({ regions: [{ id: 's', polygon: sharp, materialId: null, kind: 'region' }], exposedEdges: [{ regionId: 's', ring: 0, edgeIndex: 0 }], size: MESH_PRESETS.coarse });
    expect(elementAreas(m)[0]).toBeCloseTo(polygonArea(sharp), 2);
  });

  it('errors are plain and structured', () => {
    const bow: Polygon = { outer: [[0, 0], [10, 10], [10, 0], [0, 10]], holes: [] };
    expect(() => mesh({ regions: [{ id: 'x', polygon: bow, materialId: null, kind: 'region' }], exposedEdges: [], size: normal })).toThrowError(MeshError);
    try {
      mesh({ regions: [{ id: 'x', polygon: bow, materialId: null, kind: 'region' }], exposedEdges: [], size: normal });
    } catch (e) {
      const err = e as MeshError;
      expect(err.code).toBe('self-intersection');
      expect(err.message).toMatch(/overlaps itself/);
      expect(err.detail.regionId).toBe('x');
    }
    expect(() => mesh({ regions: [{ id: 'a', polygon: rect(0, 0, 100, 100), materialId: null, kind: 'region' }, { id: 'b', polygon: rect(50, 50, 100, 100), materialId: null, kind: 'region' }], exposedEdges: [], size: normal })).toThrowError(/overlap/);
    expect(() => mesh({ regions: [], exposedEdges: [], size: normal })).toThrowError(MeshError);
    expect(() => mesh({ regions: [{ id: 'a', polygon: rect(0, 0, 1000, 1000), materialId: null, kind: 'region' }], exposedEdges: [], size: { ...MESH_PRESETS.fine, maxElements: 500 } })).toThrowError(/elements/);
  });

  it('buildMeshInput adds rebar regions and exposed edges from the project', () => {
    const p = createEmptyProject();
    p.regions.push({ id: 'r', name: 'Beam', polygon: rect(0, 0, 300, 500), materialId: 'c', source: 'drawn' });
    p.rebars.push({ id: 'b1', name: 'B1', centre: [45, 45], diameter: 20, materialId: 's' });
    p.boundaryConditions.push({ id: 'bc', name: 'fire', type: 'convection-radiation', gasSeriesId: 'g', alphaC: 25, phi: 1, epsF: 1, edgeRefs: [{ regionId: 'r', ring: 0, edgeIndex: 0 }] });
    p.boundaryConditions.push({ id: 'ins', name: 'ins', type: 'insulated', edgeRefs: [{ regionId: 'r', ring: 0, edgeIndex: 2 }] });
    const input = buildMeshInput(p);
    expect(input.regions.length).toBe(2);
    expect(input.regions[1].kind).toBe('rebar');
    expect(input.exposedEdges.map(edgeKey)).toEqual(['r/0/0']);
    const m = mesh(input);
    expect(m.regions[1].materialId).toBe('s');
    const [a, b] = edgeEndpoints(p.regions[0].polygon.outer, 0);
    expect(a[1]).toBe(0);
    expect(b[1]).toBe(0);
  });
});
