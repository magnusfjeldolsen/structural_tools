import { describe, expect, it } from 'vitest';
import { regenerateRebars, rebarPolygon, checkRebars, stirrupPath, stirrupPolygon } from '../../src/rebar/index.js';
import { createEmptyProject } from '../../src/model/defaults.js';
import { polygonArea, pointInPolygon } from '../../src/geometry/ring.js';
import type { Polygon, Project } from '../../src/model/types.js';

const rect = (x: number, y: number, w: number, h: number): Polygon => ({ outer: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], holes: [] });

function beam(): Project {
  const p = createEmptyProject();
  p.regions.push({ id: 'r', name: 'Beam', polygon: rect(0, 0, 300, 500), materialId: 'c', source: 'drawn' });
  return p;
}

describe('rebar sets', () => {
  it('edge bars: count, cover to surface, stable ids and names', () => {
    const p = beam();
    p.rebarSets.push({ id: 's1', name: 'bottom', kind: 'edge', regionId: 'r', edgeRef: { regionId: 'r', ring: 0, edgeIndex: 0 }, diameter: 20, materialId: 's', cover: 35, count: 4 });
    const q = regenerateRebars(p);
    expect(q.rebars.length).toBe(4);
    expect(q.rebars.map((b) => b.name)).toEqual(['B1', 'B2', 'B3', 'B4']);
    for (const b of q.rebars) expect(b.centre[1]).toBeCloseTo(45, 9);
    expect(q.rebars[0].centre[0]).toBeCloseTo(45, 9);
    expect(q.rebars[3].centre[0]).toBeCloseTo(255, 9);
    expect(q.rebars[1].centre[0]).toBeCloseTo(45 + 210 / 3, 9);
    const ids = q.rebars.map((b) => b.id);
    // change the beam width: bars follow the edge, ids stay
    q.regions[0].polygon = rect(0, 0, 400, 500);
    const q2 = regenerateRebars(q);
    expect(q2.rebars.map((b) => b.id)).toEqual(ids);
    expect(q2.rebars[3].centre[0]).toBeCloseTo(355, 9);
    // cover to centre
    q2.settings.coverReference = 'centre';
    expect(regenerateRebars(q2).rebars[0].centre[1]).toBeCloseTo(35, 9);
  });
  it('spacing, corners, ring, grid, manual and detached bars', () => {
    const p = beam();
    p.rebarSets.push({ id: 'sp', name: 'top', kind: 'edge', regionId: 'r', edgeRef: { regionId: 'r', ring: 0, edgeIndex: 2 }, diameter: 12, materialId: 's', cover: 30, spacing: 100 });
    p.rebarSets.push({ id: 'co', name: 'corners', kind: 'corner', regionId: 'r', corners: [0, 1], diameter: 16, materialId: 's', cover: 30 });
    p.rebars.push({ id: 'm', name: '', centre: [150, 250], diameter: 10, materialId: 's' });
    const q = regenerateRebars(p);
    const top = q.rebars.filter((b) => b.setId === 'sp');
    expect(top.length).toBe(3); // usable = 300 − 2·36 = 228 → 0,100,200
    for (const b of top) expect(b.centre[1]).toBeCloseTo(500 - 36, 9);
    const corners = q.rebars.filter((b) => b.setId === 'co');
    expect(corners.length).toBe(2);
    expect(corners[0].centre[0]).toBeCloseTo(38, 6);
    expect(corners[0].centre[1]).toBeCloseTo(38, 6);
    expect(q.rebars.find((b) => b.id === 'm')?.name).toBe('B6');

    const col = createEmptyProject();
    const ring: Polygon = { outer: [], holes: [] };
    for (let i = 0; i < 48; i++) ring.outer.push([200 + 200 * Math.cos((2 * Math.PI * i) / 48), 200 + 200 * Math.sin((2 * Math.PI * i) / 48)]);
    col.regions.push({ id: 'c', name: 'col', polygon: ring, materialId: 'c', source: 'drawn' });
    col.rebarSets.push({ id: 'rg', name: 'ring', kind: 'ring', regionId: 'c', diameter: 20, materialId: 's', cover: 40, count: 8 });
    const cq = regenerateRebars(col);
    expect(cq.rebars.length).toBe(8);
    for (const b of cq.rebars) expect(Math.hypot(b.centre[0] - 200, b.centre[1] - 200)).toBeCloseTo(150, 0);

    const slab = createEmptyProject();
    slab.regions.push({ id: 's', name: 'slab', polygon: rect(0, 0, 1000, 200), materialId: 'c', source: 'drawn' });
    slab.rebarSets.push({ id: 'g', name: 'grid', kind: 'grid', regionId: 's', diameter: 12, materialId: 's', cover: 30, spacingX: 150, spacingY: 100 });
    const sq = regenerateRebars(slab);
    expect(sq.rebars.length).toBeGreaterThan(6);
    for (const b of sq.rebars) expect(pointInPolygon(slab.regions[0].polygon, b.centre)).toBe(true);
  });
  it('stirrup path and polygon, rebar polygon', () => {
    const p = beam();
    p.rebarSets.push({ id: 'st', name: 'stirrup', kind: 'stirrup', regionId: 'r', diameter: 10, materialId: 's', cover: 30, meshed: true });
    const path = stirrupPath(p.rebarSets[0], p)!;
    expect(path.length).toBeGreaterThanOrEqual(4);
    const poly = stirrupPolygon(p.rebarSets[0], p)!;
    expect(poly.holes.length).toBe(1);
    expect(polygonArea(poly)).toBeGreaterThan(0);
    expect(regenerateRebars(p).rebars.length).toBe(0);
    const rp = rebarPolygon({ centre: [0, 0], diameter: 20 }, 16);
    expect(rp.outer.length).toBe(16);
    expect(polygonArea(rp)).toBeGreaterThan(Math.PI * 100 * 0.95);
  });
  it('checks warn about small cover, close bars and bars outside', () => {
    const p = beam();
    p.rebars.push({ id: 'a', name: 'B1', centre: [15, 15], diameter: 20, materialId: 's' });
    p.rebars.push({ id: 'b', name: 'B2', centre: [40, 15], diameter: 20, materialId: 's' });
    p.rebars.push({ id: 'c', name: 'B3', centre: [400, 15], diameter: 20, materialId: 's' });
    const issues = checkRebars(p);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(issues.some((i) => i.code === 'cover-small')).toBe(true);
    expect(issues.some((i) => i.code === 'spacing-small')).toBe(true);
    expect(issues.some((i) => i.code === 'bar-outside')).toBe(true);
  });
});
