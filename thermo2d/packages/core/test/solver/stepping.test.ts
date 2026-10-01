import { describe, expect, it } from 'vitest';
import { gridMesh } from '../helpers/gridMesh.js';
import { constSeries, edges, fireBc, fixedBc, fnSeries, makeInput } from '../helpers/input.js';
import { constantMaterial, tableMaterial, concreteEn1992Rows, steelEn1993Rows } from '../../src/solver/material.js';
import { createRun, runToEnd } from '../../src/solver/run.js';
import { iso834 } from '../../src/solver/series.js';

describe('material evaluators', () => {
  it('constant material enthalpy is ρ·cp·θ', () => {
    const m = constantMaterial(2, 900, 2300);
    expect(m.enthalpy(100)).toBeCloseTo(2300 * 900 * 100);
    expect(m.rhoCp(500)).toBe(2300 * 900);
    expect(m.isConstant).toBe(true);
  });
  it('EN 1992-1-2 concrete table reproduces the standard at tabulated points', () => {
    const rows = concreteEn1992Rows(3, 'lower');
    const at = (th: number) => rows.find((r) => r.theta === th)!;
    expect(at(20).lambda).toBeCloseTo(1.36 - 0.136 * 0.2 + 0.0057 * 0.04, 6);
    expect(at(100).cp).toBe(900);
    expect(at(115).cp).toBe(2020);
    expect(at(200).cp).toBe(1000);
    expect(at(400).cp).toBe(1100);
    expect(at(200).rho).toBeCloseTo(2300 * 0.98, 6);
    expect(at(400).rho).toBeCloseTo(2300 * 0.95, 6);
    expect(at(1200).rho).toBeCloseTo(2300 * 0.88, 6);
    const steel = steelEn1993Rows();
    expect(steel.find((r) => r.theta === 20)!.lambda).toBeCloseTo(54 - 0.0333 * 20, 6);
    expect(steel.find((r) => r.theta === 1000)!.lambda).toBe(27.3);
    expect(steel.find((r) => r.theta === 20)!.cp).toBeCloseTo(439.8, 0);
  });
  it('a step across the moisture peak absorbs the whole peak energy', () => {
    const rows = concreteEn1992Rows(3, 'lower');
    const m = tableMaterial(rows, 0.7, 'concrete');
    // fine Simpson integration of the piecewise-linear ρ·cp between 90 and 130 °C
    const rc = (th: number) => {
      let i = 0;
      while (i < rows.length - 2 && rows[i + 1].theta <= th) i++;
      const a = rows[i], b = rows[i + 1];
      const f = (th - a.theta) / (b.theta - a.theta);
      return (a.rho + f * (b.rho - a.rho)) * (a.cp + f * (b.cp - a.cp));
    };
    let integral = 0;
    const N = 4000, h = 40 / N;
    for (let k = 0; k < N; k++) integral += (h / 6) * (rc(90 + k * h) + 4 * rc(90 + (k + 0.5) * h) + rc(90 + (k + 1) * h));
    const dH = m.enthalpy(130) - m.enthalpy(90);
    expect(Math.abs(dH - integral) / integral).toBeLessThan(2e-3);
    // and it is much more than the dry value would give (900 J/kgK): peak visible
    expect(dH).toBeGreaterThan(1.3 * 2300 * 900 * 40);
  });
});

describe('stepping', () => {
  it('lands exactly on output times with a non-divisor time step and the adaptive controller', () => {
    const mesh = gridMesh({ x0: 0, x1: 100, y0: 0, y1: 50, nx: 10, ny: 5 });
    const input = makeInput({
      mesh,
      materials: { r: constantMaterial(1, 1000, 2000) },
      series: [constSeries('hot', 200)],
      bcs: [fixedBc('left', 'hot', edges('r', 3))],
      analysis: { mode: 'transient', duration: 300, dt: 7, initialTemperature: 20, outputInterval: 60, adaptive: { enabled: true, maxDeltaPerStep: 50, minDt: 0.5 } },
      probes: [{ id: 'p', position: [10, 25] }, { id: 'out', position: [500, 500] }],
    });
    const res = runToEnd(input);
    expect(res.times).toEqual([0, 60, 120, 180, 240, 300]);
    expect(res.probes[1].found).toBe(false);
    expect(Number.isNaN(res.probeValues[1][3])).toBe(true);
    expect(res.probeTimes[0]).toBe(0);
    expect(res.probeTimes[res.probeTimes.length - 1]).toBeCloseTo(300, 9);
    for (let i = 1; i < res.probeTimes.length; i++) expect(res.probeTimes[i]).toBeGreaterThan(res.probeTimes[i - 1]);
    expect(res.stats.steps).toBeGreaterThan(40);
  });

  it('the stepper can be cancelled and still returns a partial result', () => {
    const mesh = gridMesh({ x0: 0, x1: 100, y0: 0, y1: 50, nx: 10, ny: 5 });
    const input = makeInput({
      mesh,
      materials: { r: constantMaterial(1, 1000, 2000) },
      series: [constSeries('hot', 200)],
      bcs: [fixedBc('left', 'hot', edges('r', 3))],
      analysis: { mode: 'transient', duration: 600, dt: 10, initialTemperature: 20, outputInterval: 100 },
    });
    const run = createRun(input);
    for (let i = 0; i < 25; i++) run.step();
    expect(run.done).toBe(false);
    expect(run.t).toBeCloseTo(250, 9);
    const partial = run.result();
    expect(partial.times).toEqual([0, 100, 200]);
    expect(partial.stats.steps).toBe(25);
    const progressSnapshots: number[] = [];
    const full = runToEnd(input, { onProgress: (p) => progressSnapshots.push(p.fraction), shouldCancel: () => progressSnapshots.length >= 30 });
    expect(full.stats.steps).toBe(30);
  });

  it('nonlinear fire run with concrete and steel: converges, positive heating, PCG in use', () => {
    const mesh = gridMesh({
      x0: 0,
      x1: 200,
      y0: 0,
      y1: 100,
      nx: 40,
      ny: 20,
      regionOf: (x, y) => (Math.abs(x - 100) < 10 && Math.abs(y - 30) < 10 ? 'steel' : 'c'),
      boundaryRegionId: 'c',
    });
    const input = makeInput({
      mesh,
      materials: { c: tableMaterial(concreteEn1992Rows(1.5, 'lower'), 0.7, 'concrete'), steel: tableMaterial(steelEn1993Rows(), 0.7, 'steel') },
      series: [fnSeries('iso', iso834, 7200, 5)],
      bcs: [fireBc('fire', 'iso', edges('c', 0, 1, 3))],
      analysis: { mode: 'transient', duration: 1800, dt: 5, initialTemperature: 20, outputInterval: 300 },
      probes: [{ id: 'bar', position: [100, 30] }],
    });
    const res = runToEnd(input);
    const bar = res.probeValues[0];
    expect(bar[bar.length - 1]).toBeGreaterThan(200);
    expect(res.energy.relativeImbalance).toBeLessThan(0.01);
    expect(res.stats.newtonIterations / res.stats.steps).toBeLessThan(6);
    expect(res.stats.linearSolver).toBe('pcg-jacobi');
    expect(res.warnings.filter((w) => w.includes('did not converge'))).toHaveLength(0);
  });

  it('constant-property runs reuse the factorised system (linear path) and give the same answer as the nonlinear path', () => {
    const mesh = gridMesh({ x0: 0, x1: 100, y0: 0, y1: 50, nx: 20, ny: 10 });
    const rows = [
      { theta: 0, lambda: 1, cp: 1000, rho: 2000 },
      { theta: 1000, lambda: 1, cp: 1000, rho: 2000 },
    ];
    const mk = (m: ReturnType<typeof constantMaterial>) =>
      makeInput({
        mesh,
        materials: { r: m },
        series: [constSeries('hot', 200)],
        bcs: [fixedBc('left', 'hot', edges('r', 3))],
        analysis: { mode: 'transient', duration: 600, dt: 10, initialTemperature: 20, outputInterval: 600 },
        probes: [{ id: 'p', position: [20, 25] }],
      });
    const lin = runToEnd(mk(constantMaterial(1, 1000, 2000)));
    const tab = runToEnd(mk(tableMaterial(rows)));
    const a = lin.probeValues[0], b = tab.probeValues[0];
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    expect(maxDiff).toBeLessThan(1e-6);
    expect(lin.stats.newtonIterations).toBeLessThanOrEqual(tab.stats.newtonIterations);
  });
});
