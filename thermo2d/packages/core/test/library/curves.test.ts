import { describe, expect, it } from 'vitest';
import {
  CURVE_LIBRARY,
  generateCurve,
  getLibraryItem,
  hydrocarbon,
  interpTable,
  iso834,
  parametricFire,
  repeatSeries,
  sampleTimes,
  seriesFromLibrary,
  sumSeries,
} from '../../src/library/index.js';

describe('nominal fire curves (EN 1991-1-2 §3.2)', () => {
  it('ISO 834 at 30/60/90/120 min = 842/945/1006/1049 °C', () => {
    expect(iso834(30)).toBeCloseTo(841.8, 0);
    expect(iso834(60)).toBeCloseTo(945.3, 0);
    expect(iso834(90)).toBeCloseTo(1005.8, 0);
    expect(iso834(120)).toBeCloseTo(1049.0, 0);
    expect(Math.abs(iso834(30) - 842)).toBeLessThan(0.5);
    expect(Math.abs(iso834(60) - 945)).toBeLessThan(0.5);
    expect(Math.abs(iso834(90) - 1006)).toBeLessThan(0.5);
    expect(Math.abs(iso834(120) - 1049)).toBeLessThan(0.5);
    expect(iso834(0)).toBe(20);
  });

  it('hydrocarbon curve approaches the 1100 °C plateau', () => {
    expect(hydrocarbon(60)).toBeGreaterThan(1099);
    expect(hydrocarbon(60)).toBeLessThan(1100.01);
    expect(hydrocarbon(5)).toBeCloseTo(948, 0);
  });

  it('generated series: dense start, sorted, no duplicates, ends at duration', () => {
    const pts = generateCurve('iso834', {}, 5400);
    expect(pts[0]).toEqual([0, 20]);
    expect(pts[1][0]).toBe(1);
    expect(pts[pts.length - 1][0]).toBe(5400);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThan(pts[i - 1][0]);
    expect(interpTable(pts, 1800)).toBeCloseTo(iso834(30), 6);
    expect(sampleTimes(10, 2.5)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it('tabulated tunnel curves and ASTM E119', () => {
    expect(interpTable(generateCurve('rws', {}, 7200), 3600)).toBe(1350);
    expect(interpTable(generateCurve('astm-e119', {}, 7200), 3600)).toBe(927);
    expect(interpTable(generateCurve('rabt-ztv-rail', {}, 10200), 1800)).toBe(1200);
    expect(interpTable(generateCurve('rabt-ztv-road', {}, 8400), 8400)).toBe(15);
  });

  it('cooling: base curve until tCool, then linear to ambient', () => {
    const pts = generateCurve('cooling', { base: 'iso834', tCool: 3600, coolDuration: 1800, ambient: 20 }, 7200);
    expect(interpTable(pts, 1800)).toBeCloseTo(iso834(30), 3);
    expect(interpTable(pts, 3600)).toBeCloseTo(iso834(60), 3);
    expect(interpTable(pts, 4500)).toBeCloseTo((iso834(60) + 20) / 2, 3);
    expect(interpTable(pts, 6000)).toBe(20);
  });
});

describe('parametric fire (EN 1991-1-2 Annex A)', () => {
  it('heating follows the Γ-scaled curve and reaches θmax, then cools', () => {
    const f = parametricFire({ O: 0.04, b: 1160, qtd: 200, growth: 'medium' }); // Γ = 1 → same as (A.1) with t* = t
    // tmax = max(0.2e-3·200/0.04, 0.333) = 1 h
    expect(f(0)).toBeCloseTo(20, 6);
    expect(f(1800)).toBeCloseTo(20 + 1305 * (1 - 0.324 * Math.exp(-0.1) - 0.204 * Math.exp(-0.85) - 0.472 * Math.exp(-9.5)), 3);
    const thetaMax = f(3600);
    expect(thetaMax).toBeGreaterThan(900);
    expect(f(3600 + 600)).toBeLessThan(thetaMax);
    // cooling rate 250 K/h for t*max = 1 (0.5 < t*max < 2 → 250(3 − 1) = 500 K/h)
    expect(thetaMax - f(3600 + 1800)).toBeCloseTo(250, 0);
    expect(f(36000)).toBe(20);
  });

  it('throws plain-language errors outside the validity limits', () => {
    expect(() => parametricFire({ O: 0.3, b: 1000, qtd: 200, growth: 'fast' })).toThrow(/O = 0.3 is outside the validity range 0.02–0.2/);
    expect(() => parametricFire({ O: 0.1, b: 50, qtd: 200, growth: 'fast' })).toThrow(/b = 50/);
    expect(() => parametricFire({ O: 0.1, b: 1000, qtd: 2000, growth: 'fast' })).toThrow(/qtd = 2000/);
    expect(() => generateCurve('parametric', { O: 0.01, b: 1000, qtd: 100 })).toThrow(/validity/);
  });

  it('fuel-controlled case uses Γlim in the heating phase', () => {
    const f = parametricFire({ O: 0.1, b: 1000, qtd: 60, growth: 'medium' });
    // tmax = max(0.12, 0.333) = tlim → fuel controlled; the curve must still be monotonic up to 20 min
    let prev = f(0);
    for (let t = 60; t <= 1200; t += 60) {
      expect(f(t)).toBeGreaterThan(prev);
      prev = f(t);
    }
    expect(f(1200)).toBeGreaterThan(f(3600));
  });
});

describe('climate generators', () => {
  it('constant, step, ramp, sinusoid', () => {
    expect(generateCurve('constant', { value: 21 }, 100)).toEqual([
      [0, 21],
      [100, 21],
    ]);
    expect(generateCurve('step', { before: 20, after: 0, tStep: 50 }, 100)).toEqual([
      [0, 20],
      [50, 0],
      [100, 0],
    ]);
    const ramp = generateCurve('ramp', { from: 0, to: 10, tStart: 10, tEnd: 20 }, 30);
    expect(interpTable(ramp, 5)).toBe(0);
    expect(interpTable(ramp, 15)).toBe(5);
    expect(interpTable(ramp, 25)).toBe(10);
    const sin = generateCurve('sinusoid', { mean: 5, amplitude: 10, period: 86400, phase: 54000, step: 3600 }, 86400);
    expect(interpTable(sin, 54000)).toBeCloseTo(15, 9);
    expect(interpTable(sin, 54000 - 43200)).toBeCloseTo(-5, 9);
    expect(sin.length).toBe(25);
  });

  it('repeat and sum', () => {
    const day: [number, number][] = [
      [0, 0],
      [43200, 10],
      [86400, 0],
    ];
    const week = repeatSeries(day, 7);
    expect(week[week.length - 1][0]).toBe(7 * 86400);
    expect(week.length).toBe(1 + 2 * 7);
    expect(interpTable(week, 86400 + 43200)).toBe(10);
    const s = sumSeries(day, [
      [0, 1],
      [86400, 1],
    ]);
    expect(interpTable(s, 43200)).toBe(11);
    expect(generateCurve('repeat', { points: JSON.stringify(day), times: 2 }).length).toBe(5);
  });
});

describe('curve library items', () => {
  it('every curve item generates a valid series with citation', () => {
    for (const item of CURVE_LIBRARY) {
      expect(item.source.text.length).toBeGreaterThan(5);
      const s = seriesFromLibrary(item);
      expect(s.points.length).toBeGreaterThan(1);
      expect(s.source.kind).toBe('preset');
      expect(s.source.ref).toBe(item.id);
      expect(s.source.citation?.text).toBe(item.source.text);
      for (let i = 1; i < s.points.length; i++) expect(s.points[i][0]).toBeGreaterThan(s.points[i - 1][0]);
    }
  });
  it('seriesFromLibrary applies parameter overrides and duration', () => {
    const item = getLibraryItem('iso834')!;
    const s = seriesFromLibrary(item, { ambient: 10 }, 600, 'ts1');
    expect(s.id).toBe('ts1');
    expect(s.points[0][1]).toBe(10);
    expect(s.points[s.points.length - 1][0]).toBe(600);
    expect(s.source.params?.ambient).toBe(10);
  });
});
