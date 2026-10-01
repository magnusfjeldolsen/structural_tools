import { describe, expect, it } from 'vitest';
import { barycentric, boundsOfNodes, fitViewport, hitMarker, niceGridSpacing, pan, toModel, toScreen, zoomAt } from './viewport.js';

describe('viewport math', () => {
  const nodes = new Float64Array([0, 0, 300, 0, 300, 500, 0, 500]);

  it('computes bounds', () => {
    expect(boundsOfNodes(nodes)).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 500 });
    expect(boundsOfNodes([])).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });

  it('fits the section centred with y up', () => {
    const v = fitViewport(boundsOfNodes(nodes), 800, 600, 0.1);
    const [sx0, sy0] = toScreen(v, 0, 0);
    const [sx1, sy1] = toScreen(v, 300, 500);
    expect(sx1).toBeGreaterThan(sx0);
    expect(sy1).toBeLessThan(sy0); // y up on screen
    expect((sx0 + sx1) / 2).toBeCloseTo(400);
    expect((sy0 + sy1) / 2).toBeCloseTo(300);
    expect(sy0 - sy1).toBeCloseTo(600 * 0.8);
  });

  it('round-trips screen and model coordinates', () => {
    const v = { scale: 2, ox: 100, oy: 700 };
    const [sx, sy] = toScreen(v, 150, 250);
    expect(toModel(v, sx, sy)).toEqual([150, 250]);
  });

  it('zooms about a fixed screen point and pans', () => {
    const v = { scale: 1, ox: 50, oy: 50 };
    const z = zoomAt(v, 200, 300, 2);
    expect(toModel(z, 200, 300)).toEqual(toModel(v, 200, 300));
    expect(z.scale).toBe(2);
    expect(pan(v, 10, -5)).toEqual({ scale: 1, ox: 60, oy: 45 });
  });

  it('hit-tests markers by nearest within radius', () => {
    const v = { scale: 1, ox: 0, oy: 500 };
    const markers = [
      { x: 100, y: 100 },
      { x: 104, y: 100 },
    ];
    expect(hitMarker(v, markers, 103, 400, 8)).toBe(1);
    expect(hitMarker(v, markers, 300, 400, 8)).toBe(-1);
  });

  it('barycentric weights sum to one and reject outside points', () => {
    const w = barycentric(1, 1, 0, 0, 4, 0, 0, 4);
    expect(w).not.toBeNull();
    expect(w![0] + w![1] + w![2]).toBeCloseTo(1);
    expect(barycentric(5, 5, 0, 0, 4, 0, 0, 4)).toBeNull();
    expect(barycentric(0, 0, 0, 0, 1, 0, 2, 0)).toBeNull(); // degenerate
  });

  it('picks a nice grid spacing', () => {
    expect(niceGridSpacing(1)).toBe(50);
    expect(niceGridSpacing(0.1)).toBe(500);
    expect(niceGridSpacing(4)).toBe(20);
  });
});
