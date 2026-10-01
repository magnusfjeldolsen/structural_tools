import { describe, expect, it } from 'vitest';
import { divergingEdges, polyArea, temperatureEdges, triangleBandPolygons } from './isobands.js';

const tri = { xa: 0, ya: 0, xb: 100, yb: 0, xc: 0, yc: 100 }; // area 5000
const area = (polys: { poly: number[] }[]) => polys.reduce((s, p) => s + Math.abs(polyArea(p.poly)), 0);

describe('isobands', () => {
  it('a triangle inside one band yields exactly that triangle', () => {
    const out = triangleBandPolygons(tri.xa, tri.ya, 120, tri.xb, tri.yb, 150, tri.xc, tri.yc, 180, temperatureEdges(0, 1100, 100));
    expect(out).toHaveLength(1);
    expect(out[0].band).toBe(1);
    expect(Math.abs(polyArea(out[0].poly))).toBeCloseTo(5000, 6);
  });

  it('band polygons partition the triangle (areas sum to the triangle area) and have no NaN', () => {
    const edges = temperatureEdges(0, 1100, 100);
    const cases: [number, number, number][] = [
      [20, 450, 1050],
      [0, 100, 200], // vertices exactly on boundaries
      [100, 100, 350], // two equal values on a boundary
      [999, 999, 999], // constant
      [-50, 50, 1250], // outside the scale on both sides
      [333.3, 333.3, 1100],
    ];
    for (const [va, vb, vc] of cases) {
      const out = triangleBandPolygons(tri.xa, tri.ya, va, tri.xb, tri.yb, vb, tri.xc, tri.yc, vc, edges);
      expect(area(out), `values ${va},${vb},${vc}`).toBeCloseTo(5000, 4);
      for (const p of out) for (const v of p.poly) expect(Number.isFinite(v)).toBe(true);
      // Each band appears at most once per triangle.
      const bands = out.map((p) => p.band);
      expect(new Set(bands).size).toBe(bands.length);
      for (const b of bands) expect(b >= 0 && b < edges.length - 1).toBe(true);
    }
  });

  it('splits a triangle spanning three bands into three pieces with linear boundaries', () => {
    const out = triangleBandPolygons(0, 0, 50, 100, 0, 50, 0, 100, 250, temperatureEdges(0, 1100, 100));
    expect(out.map((p) => p.band).sort()).toEqual([0, 1, 2]);
    // θ = 100 along y = 25, θ = 200 along y = 75 → areas 5000·(1−0.75²), 5000·(0.75²−0.25²), 5000·0.25²
    const byBand = Object.fromEntries(out.map((p) => [p.band, Math.abs(polyArea(p.poly))]));
    expect(byBand[0]).toBeCloseTo(5000 * (1 - 0.75 * 0.75), 4);
    expect(byBand[1]).toBeCloseTo(5000 * (0.75 * 0.75 - 0.25 * 0.25), 4);
    expect(byBand[2]).toBeCloseTo(5000 * 0.25 * 0.25, 4);
  });

  it('builds symmetric diverging edges', () => {
    const e = divergingEdges(50, 10);
    expect(e[0]).toBe(-50);
    expect(e[10]).toBe(50);
    expect(e[5]).toBeCloseTo(0, 12);
  });
});
