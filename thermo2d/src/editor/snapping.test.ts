import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAP, segmentsIntersection, snapPoint, snapToGrid, orthoConstrain } from './snapping.js';
import { arcThrough, parseDims, parseSegmentEntry, rectFromCorners, ringAreaOf } from './geometryTools.js';
import { fitBounds, gridSpacing, toModel, toScreen, zoomAt } from './viewport.js';
import type { Ring } from '@thermo2d/core';

const square: Ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

describe('snapping', () => {
  it('prefers a vertex over the grid', () => {
    const s = snapPoint([2, 1], { rings: [square], centres: [], gridSpacing: 10, tolerance: 5, options: DEFAULT_SNAP });
    expect(s?.kind).toBe('vertex');
    expect(s?.point).toEqual([0, 0]);
  });
  it('finds midpoints and centres', () => {
    const mid = snapPoint([51, -2], { rings: [square], centres: [], gridSpacing: 1000, tolerance: 4, options: DEFAULT_SNAP });
    expect(mid?.kind).toBe('midpoint');
    expect(mid?.point).toEqual([50, 0]);
    const c = snapPoint([49, 52], { rings: [square], centres: [[50, 50]], gridSpacing: 1000, tolerance: 4, options: DEFAULT_SNAP });
    expect(c?.kind).toBe('centre');
  });
  it('snaps to the grid when nothing else is near', () => {
    const s = snapPoint([31, 48], { rings: [square], centres: [], gridSpacing: 10, tolerance: 3, options: DEFAULT_SNAP });
    expect(s?.kind).toBe('grid');
    expect(s?.point).toEqual([30, 50]);
    expect(snapToGrid([31, 48], 10)).toEqual([30, 50]);
  });
  it('finds intersections of nearby edges', () => {
    const cross: Ring = [
      [50, -10],
      [60, -10],
      [60, 110],
      [50, 110],
    ];
    const s = snapPoint([50.5, 1], { rings: [square, cross], centres: [], gridSpacing: 1000, tolerance: 3, options: { ...DEFAULT_SNAP, vertex: false, midpoint: false } });
    expect(s?.kind).toBe('intersection');
    expect(s?.point[0]).toBeCloseTo(50);
    expect(s?.point[1]).toBeCloseTo(0);
    expect(segmentsIntersection([0, 0], [10, 10], [0, 10], [10, 0])).toEqual([5, 5]);
    expect(segmentsIntersection([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
  });
  it('ortho constrains to the dominant axis', () => {
    expect(orthoConstrain([10, 2], [0, 0])).toEqual([10, 0]);
    expect(orthoConstrain([2, 10], [0, 0])).toEqual([0, 10]);
  });
});

describe('geometry tools', () => {
  it('builds CCW rectangles from any two corners', () => {
    expect(ringAreaOf(rectFromCorners([100, 100], [0, 0]))).toBe(10000);
  });
  it('parses typed dimensions', () => {
    expect(parseDims('300x500')).toEqual([300, 500]);
    expect(parseDims('300 X 500')).toEqual([300, 500]);
    expect(parseDims('250')).toEqual([250]);
    expect(parseDims('12,5;20')).toEqual([12.5, 20]);
    expect(parseDims('abc')).toEqual([]);
    expect(parseSegmentEntry('100@45')).toEqual({ length: 100, angleDeg: 45 });
    expect(parseSegmentEntry('100')).toEqual({ length: 100, angleDeg: undefined });
  });
  it('discretises a three-point arc ending at the end point', () => {
    const pts = arcThrough([0, 0], [50, 50], [100, 0]);
    expect(pts[pts.length - 1]).toEqual([100, 0]);
    for (const p of pts) expect(Math.hypot(p[0] - 50, p[1] - 0)).toBeCloseTo(50, 6);
    expect(pts.some((p) => p[1] > 40)).toBe(true);
  });
});

describe('viewport', () => {
  it('round-trips model and screen coordinates', () => {
    const vp = { scale: 2, ox: 100, oy: 500 };
    const p: [number, number] = [37, 91];
    const s = toScreen(vp, p);
    expect(toModel(vp, s)).toEqual(p);
  });
  it('keeps the point under the cursor fixed when zooming', () => {
    const vp = { scale: 1, ox: 0, oy: 600 };
    const cursor: [number, number] = [300, 200];
    const before = toModel(vp, cursor);
    const after = toModel(zoomAt(vp, cursor, 1.5), cursor);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });
  it('fits bounds inside the view and picks a readable grid', () => {
    const vp = fitBounds({ minX: 0, minY: 0, maxX: 300, maxY: 500 }, 800, 600, 40);
    const tl = toScreen(vp, [0, 500]);
    const br = toScreen(vp, [300, 0]);
    expect(tl[0]).toBeGreaterThanOrEqual(39);
    expect(br[1]).toBeLessThanOrEqual(561);
    expect(gridSpacing(1)).toBe(25);
    expect(gridSpacing(10)).toBe(5);
  });
});
