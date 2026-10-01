import { describe, expect, it } from 'vitest';
import { TEMPLATES, buildTemplate } from '../../src/templates/index.js';
import { polygonArea, ringIsCCW, polygonBounds } from '../../src/geometry/ring.js';
import { validatePolygon, regionsOverlap } from '../../src/geometry/validate.js';

describe('templates', () => {
  it('every template builds valid, CCW, non-overlapping regions from defaults', () => {
    for (const t of TEMPLATES) {
      const { regions } = buildTemplate(t.id);
      expect(regions.length).toBeGreaterThan(0);
      for (const r of regions) {
        expect(validatePolygon(r.polygon)).toEqual([]);
        expect(ringIsCCW(r.polygon.outer)).toBe(true);
        expect(polygonArea(r.polygon)).toBeGreaterThan(0);
      }
      for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) expect(regionsOverlap(regions[i].polygon, regions[j].polygon)).not.toBe('overlap');
      const b = polygonBounds(regions[0].polygon);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-9);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it('parameters drive the shapes', () => {
    expect(polygonArea(buildTemplate('rect-beam', { b: 300, h: 500 }).regions[0].polygon)).toBeCloseTo(150000, 6);
    expect(polygonArea(buildTemplate('t-beam', { b: 300, h: 600, bf: 800, hf: 150 }).regions[0].polygon)).toBeCloseTo(300 * 450 + 800 * 150, 6);
    expect(polygonArea(buildTemplate('box', { b: 600, h: 800, tw: 150, tf: 150 }).regions[0].polygon)).toBeCloseTo(600 * 800 - 300 * 500, 6);
    const hc = buildTemplate('hollow-core-strip', { b: 1200, h: 265, nCores: 5, coreD: 180 }).regions[0].polygon;
    expect(hc.holes.length).toBe(5);
    const wall = buildTemplate('layered-wall', { layers: '150 concrete|200 insulation|13 gypsum', width: 1000 }).regions;
    expect(wall.length).toBe(3);
    expect(wall[1].materialHint).toBe('insulation');
    expect(polygonBounds(wall[2].polygon).maxX).toBeCloseTo(363, 9);
    expect(() => buildTemplate('nope')).toThrow(/Unknown template/);
    expect(() => buildTemplate('rect-beam', { b: -5 })).toThrow(/must be a number/);
  });
});
