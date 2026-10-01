import { describe, expect, it } from 'vitest';
import { bandColors, bandCount, bandEdges, bandIndex, DEFAULT_BANDS, divergingBandIndex, sanitizeBands, sequentialRgb } from './colorScale.js';

describe('colour scale', () => {
  it('default scale has 11 bands of 100 °C', () => {
    expect(bandCount(DEFAULT_BANDS)).toBe(11);
    expect(bandEdges(DEFAULT_BANDS)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]);
    expect(bandColors(DEFAULT_BANDS)).toHaveLength(11);
  });

  it('maps values to bands and clamps the ends', () => {
    expect(bandIndex(-10, DEFAULT_BANDS)).toBe(0);
    expect(bandIndex(20, DEFAULT_BANDS)).toBe(0);
    expect(bandIndex(100, DEFAULT_BANDS)).toBe(1);
    expect(bandIndex(499.9, DEFAULT_BANDS)).toBe(4);
    expect(bandIndex(500, DEFAULT_BANDS)).toBe(5);
    expect(bandIndex(1500, DEFAULT_BANDS)).toBe(10);
    expect(bandIndex(NaN, DEFAULT_BANDS)).toBe(0);
  });

  it('sequential palette runs from blue through warm colours to white', () => {
    const [r0, , b0] = sequentialRgb(0);
    const [r1, g1, b1] = sequentialRgb(1);
    expect(b0).toBeGreaterThan(r0);
    expect([r1, g1, b1]).toEqual([255, 255, 255]);
    // Cold half is blue-dominant, hot half is red-dominant.
    for (let u = 0; u < 0.3; u += 0.05) {
      const [r, , b] = sequentialRgb(u);
      expect(b).toBeGreaterThan(r);
    }
    for (let u = 0.6; u < 0.9; u += 0.05) {
      const [r, , b] = sequentialRgb(u);
      expect(r).toBeGreaterThan(b);
    }
    expect(sequentialRgb(-1)).toEqual(sequentialRgb(0));
    expect(sequentialRgb(2)).toEqual(sequentialRgb(1));
  });

  it('diverging index is centred', () => {
    expect(divergingBandIndex(0, 50, 10)).toBe(5);
    expect(divergingBandIndex(-100, 50, 10)).toBe(0);
    expect(divergingBandIndex(100, 50, 10)).toBe(9);
  });

  it('sanitises silly user scales', () => {
    expect(sanitizeBands(0, 0, 100)).toEqual(DEFAULT_BANDS);
    expect(sanitizeBands(0, 100, -1)).toEqual(DEFAULT_BANDS);
    expect(sanitizeBands(0, 100, 0.01).step).toBeCloseTo(0.5);
    expect(sanitizeBands(20, 300, 20)).toEqual({ min: 20, max: 300, step: 20 });
  });
});
