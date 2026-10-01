import { describe, expect, it } from 'vitest';
import {
  booleanOp,
  chamferVertex,
  edgeFingerprint,
  edgeOutwardNormal,
  edgeSide,
  filletVertex,
  mergeCollinear,
  normalizePolygon,
  offsetPolygon,
  parseDxf,
  parseGeometryWorkspace,
  parsePolygonCsv,
  pointInPolygon,
  polygonArea,
  primitiveToPolygon,
  regionsOverlap,
  resolveEdgeRef,
  ringArea,
  ringIsCCW,
  splitPolygon,
  transformPolygon,
  validatePolygon,
} from '../../src/geometry/index.js';
import type { Polygon, Region } from '../../src/model/types.js';

const rect = (x: number, y: number, w: number, h: number): Polygon => ({
  outer: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
  holes: [],
});

describe('rings', () => {
  it('area and orientation', () => {
    expect(ringArea(rect(0, 0, 300, 500).outer)).toBeCloseTo(150000, 6);
    expect(ringIsCCW(rect(0, 0, 1, 1).outer)).toBe(true);
    const cw = rect(0, 0, 1, 1).outer.slice().reverse();
    expect(ringIsCCW(cw)).toBe(false);
    const n = normalizePolygon({ outer: cw, holes: [rect(0.2, 0.2, 0.5, 0.5).outer] });
    expect(ringIsCCW(n.outer)).toBe(true);
    expect(ringIsCCW(n.holes[0])).toBe(false);
    expect(polygonArea(n)).toBeCloseTo(0.75, 9);
  });
  it('point in polygon with holes', () => {
    const p = normalizePolygon({ outer: rect(0, 0, 10, 10).outer, holes: [rect(4, 4, 2, 2).outer] });
    expect(pointInPolygon(p, [1, 1])).toBe(true);
    expect(pointInPolygon(p, [5, 5])).toBe(false);
    expect(pointInPolygon(p, [11, 5])).toBe(false);
    expect(pointInPolygon(p, [0, 5])).toBe(true); // on boundary
  });
});

describe('validation', () => {
  it('accepts a rectangle, rejects a bow-tie in plain words', () => {
    expect(validatePolygon(rect(0, 0, 100, 50))).toEqual([]);
    const bow: Polygon = { outer: [[0, 0], [10, 10], [10, 0], [0, 10]], holes: [] };
    const issues = validatePolygon(bow, 'r1');
    expect(issues.some((i) => i.code === 'self-intersection')).toBe(true);
    expect(issues[0].message).toMatch(/overlaps itself/);
    expect(issues.find((i) => i.code === 'self-intersection')?.messageNb).toMatch(/overlapper seg selv/);
  });
  it('flags tiny edges, zero area and holes outside', () => {
    expect(validatePolygon({ outer: [[0, 0], [0.001, 0], [10, 0], [10, 10]], holes: [] }).some((i) => i.code === 'tiny-edge')).toBe(true);
    expect(validatePolygon({ outer: [[0, 0], [10, 0], [20, 0]], holes: [] }).some((i) => i.code === 'zero-area')).toBe(true);
    expect(validatePolygon({ outer: rect(0, 0, 10, 10).outer, holes: [rect(8, 8, 5, 5).outer] }).some((i) => i.code === 'hole-outside')).toBe(true);
  });
  it('classifies nested, overlapping and disjoint regions', () => {
    expect(regionsOverlap(rect(0, 0, 100, 100), rect(20, 20, 10, 10))).toBe('nested');
    expect(regionsOverlap(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe('overlap');
    expect(regionsOverlap(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe('none'); // shared edge
    expect(regionsOverlap(rect(0, 0, 100, 100), rect(200, 0, 100, 100))).toBe('none');
    const withHole = normalizePolygon({ outer: rect(0, 0, 100, 100).outer, holes: [rect(40, 40, 20, 20).outer] });
    expect(regionsOverlap(withHole, rect(45, 45, 10, 10))).toBe('none'); // inside the hole
  });
});

describe('booleans and offsets', () => {
  it('union, subtract, intersect, xor areas', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(50, 0, 100, 100);
    expect(polygonArea(booleanOp('union', [a], [b])[0])).toBeCloseTo(15000, 6);
    expect(polygonArea(booleanOp('intersect', [a], [b])[0])).toBeCloseTo(5000, 6);
    expect(polygonArea(booleanOp('subtract', [a], [b])[0])).toBeCloseTo(5000, 6);
    expect(booleanOp('xor', [a], [b]).reduce((s, p) => s + polygonArea(p), 0)).toBeCloseTo(10000, 6);
  });
  it('subtracting an inner shape makes a hole; tangent shapes stay valid', () => {
    const r = booleanOp('subtract', [rect(0, 0, 100, 100)], [rect(25, 25, 50, 50)]);
    expect(r.length).toBe(1);
    expect(r[0].holes.length).toBe(1);
    expect(polygonArea(r[0])).toBeCloseTo(7500, 6);
    expect(validatePolygon(r[0])).toEqual([]);
    const t = booleanOp('union', [rect(0, 0, 100, 100)], [rect(100, 0, 100, 100)]);
    expect(t.length).toBe(1);
    expect(polygonArea(t[0])).toBeCloseTo(20000, 6);
    expect(validatePolygon(t[0])).toEqual([]);
  });
  it('outward offset grows by about perimeter·d + πd²; inward shrinks and can vanish', () => {
    const out = offsetPolygon(rect(0, 0, 100, 50), 10);
    expect(out.length).toBe(1);
    const expected = 5000 + 300 * 10 + Math.PI * 100;
    expect(polygonArea(out[0])).toBeGreaterThan(expected * 0.995);
    expect(polygonArea(out[0])).toBeLessThan(expected * 1.02);
    const inn = offsetPolygon(rect(0, 0, 100, 50), -10);
    expect(inn.length).toBe(1);
    expect(polygonArea(inn[0])).toBeCloseTo(80 * 30, 3);
    expect(offsetPolygon(rect(0, 0, 100, 50), -30)).toEqual([]);
  });
  it('inward offset of a dumbbell splits; holes are offset too', () => {
    const dumbbell = booleanOp('union', [rect(0, 0, 100, 100)], [rect(100, 40, 50, 20), rect(150, 0, 100, 100)])[0];
    const pieces = offsetPolygon(dumbbell, -15);
    expect(pieces.length).toBe(2);
    const ring = normalizePolygon({ outer: rect(0, 0, 100, 100).outer, holes: [rect(40, 40, 20, 20).outer] });
    const off = offsetPolygon(ring, -5)[0];
    expect(off.holes.length).toBe(1);
    expect(polygonArea(off)).toBeLessThan(polygonArea(ring));
    expect(Math.abs(ringArea(off.holes[0]))).toBeGreaterThan(400);
  });
});

describe('editing ops', () => {
  it('split, fillet, chamfer, merge collinear, transforms', () => {
    const parts = splitPolygon(rect(0, 0, 100, 100), [[50, -10], [50, 200]]);
    expect(parts.length).toBe(2);
    expect(parts.reduce((s, p) => s + polygonArea(p), 0)).toBeCloseTo(10000, 6);

    const f: Polygon = { outer: filletVertex(rect(0, 0, 100, 100).outer, 0, 20), holes: [] };
    expect(f.outer.length).toBeGreaterThan(4);
    expect(Math.abs(polygonArea(f) - (10000 - (400 - Math.PI * 100)))).toBeLessThan(5); // arc is a polygon with 8 segments per 90°
    const c: Polygon = { outer: chamferVertex(rect(0, 0, 100, 100).outer, 0, 20), holes: [] };
    expect(c.outer.length).toBe(5);
    expect(polygonArea(c)).toBeCloseTo(10000 - 200, 6);

    const redundant: Polygon = { outer: [[0, 0], [50, 0], [100, 0], [100, 100], [0, 100]], holes: [] };
    expect(mergeCollinear(redundant).outer.length).toBe(4);

    const moved = transformPolygon(rect(0, 0, 10, 10), { kind: 'move', dx: 5, dy: 5 });
    expect(moved.outer[0]).toEqual([5, 5]);
    const mirrored = transformPolygon(rect(0, 0, 10, 10), { kind: 'mirror', axis: 'y' });
    expect(ringIsCCW(mirrored.outer)).toBe(true);
    expect(polygonArea(mirrored)).toBeCloseTo(100, 9);
    const rot = transformPolygon(rect(0, 0, 10, 10), { kind: 'rotate', cx: 0, cy: 0, angleDeg: 90 });
    expect(rot.outer[1][0]).toBeCloseTo(0, 9);
    expect(rot.outer[1][1]).toBeCloseTo(10, 9);
    const sc = transformPolygon(rect(0, 0, 10, 10), { kind: 'scale', cx: 0, cy: 0, sx: 2, sy: -1 });
    expect(ringIsCCW(sc.outer)).toBe(true);
  });
  it('primitives', () => {
    expect(polygonArea(primitiveToPolygon({ kind: 'rect', x: 0, y: 0, width: 3, height: 4 }))).toBeCloseTo(12, 9);
    const circ = primitiveToPolygon({ kind: 'circle', cx: 0, cy: 0, r: 10 });
    expect(circ.outer.length).toBeGreaterThanOrEqual(16);
    expect(polygonArea(circ)).toBeGreaterThan(Math.PI * 100 * 0.98);
    expect(primitiveToPolygon({ kind: 'regularPolygon', cx: 0, cy: 0, r: 1, n: 6 }).outer.length).toBe(6);
  });
});

describe('edges', () => {
  it('outward normals and sides on a CCW rectangle', () => {
    const r = rect(0, 0, 100, 50).outer;
    expect(edgeOutwardNormal(r, 0)[1]).toBeCloseTo(-1, 9);
    expect(edgeSide(r, 0)).toBe('bottom');
    expect(edgeSide(r, 1)).toBe('right');
    expect(edgeSide(r, 2)).toBe('top');
    expect(edgeSide(r, 3)).toBe('left');
  });
  it('fingerprint survives index shifts', () => {
    const region: Region = { id: 'r', name: 'r', polygon: rect(0, 0, 100, 50), materialId: null, source: 'drawn' };
    const fp = edgeFingerprint(region.polygon.outer, 2);
    // insert a vertex on the bottom edge → indices of later edges shift by one
    const edited: Region = { ...region, polygon: { outer: [[0, 0], [50, 0], [100, 0], [100, 50], [0, 50]], holes: [] } };
    const res = resolveEdgeRef({ regions: [edited] }, { regionId: 'r', ring: 0, edgeIndex: 2, fingerprint: fp });
    expect(res?.index).toBe(3);
    // An unmatched fingerprint with a still-valid index means the edge geometry changed (vertex moved): keep the index.
    expect(resolveEdgeRef({ regions: [edited] }, { regionId: 'r', ring: 0, edgeIndex: 2, fingerprint: 'nope' })?.index).toBe(2);
    expect(resolveEdgeRef({ regions: [edited] }, { regionId: 'r', ring: 0, edgeIndex: 9, fingerprint: 'nope' })).toBeNull();
  });
});

describe('importers', () => {
  it('geometry_workspace resolved block', () => {
    const json = {
      resolved: {
        unit: 'mm',
        notes: [],
        regions: [{ id: 'a', name: 'Plate', material: 'C30', rings: [{ outer: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], holes: [[[40, 40], [40, 60], [60, 60], [60, 40], [40, 40]]] }] }],
      },
    };
    const r = parseGeometryWorkspace(json);
    expect(r.length).toBe(1);
    expect(r[0].polygon.outer.length).toBe(4);
    expect(r[0].polygon.holes.length).toBe(1);
    expect(polygonArea(r[0].polygon)).toBeCloseTo(9600, 6);
    expect(r[0].materialHint).toBe('C30');
  });
  it('csv with decimal comma and dxf polylines', () => {
    const csv = 'x;y\n0;0\n100,5;0\n100,5;50\n0;50\n';
    const r = parsePolygonCsv(csv);
    expect(ringArea(r)).toBeCloseTo(100.5 * 50, 6);
    const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'A', '70', '1', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const d = parseDxf(dxf);
    expect(d.length).toBe(1);
    expect(ringArea(d[0])).toBeCloseTo(100, 6);
  });
});
