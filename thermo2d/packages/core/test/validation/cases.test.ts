/**
 * Spec §14 validation cases owned by the solver: 1, 2, 3, 8, 9, 12, 13.
 * Meshes come from the structured grid helper; tolerances are the spec's.
 */
import { describe, expect, it } from 'vitest';
import { gridMesh } from '../helpers/gridMesh.js';
import { constSeries, convBc, edges, erfc, fireBc, fixedBc, fnSeries, makeInput } from '../helpers/input.js';
import { constantMaterial, tableMaterial, concreteEn1992Rows } from '../../src/solver/material.js';
import { runToEnd } from '../../src/solver/run.js';
import { iso834 } from '../../src/solver/series.js';
import { interpolateField, heatFlowAcrossEdges, uValue } from '../../src/post/index.js';
import { fieldAtTime } from '../../src/post/field.js';

describe('case 1: semi-infinite slab, fixed surface temperature step', () => {
  it('matches erfc within 0.5 K', () => {
    const lambda = 1, rho = 2000, cp = 1000, a = lambda / (rho * cp); // 5e-7 m²/s
    const mesh = gridMesh({ x0: 0, x1: 300, y0: 0, y1: 10, nx: 300, ny: 2 });
    const input = makeInput({
      mesh,
      materials: { r: constantMaterial(lambda, cp, rho) },
      series: [constSeries('hot', 120)],
      bcs: [fixedBc('left', 'hot', edges('r', 3))],
      analysis: { mode: 'transient', duration: 3600, dt: 5, initialTemperature: 20, outputInterval: 3600 },
    });
    const res = runToEnd(input);
    const field = fieldAtTime(res, 3600);
    let maxErr = 0;
    for (const xmm of [5, 10, 20, 40, 60, 100]) {
      const x = xmm * 1e-3;
      const exact = 20 + 100 * erfc(x / (2 * Math.sqrt(a * 3600)));
      const num = interpolateField(mesh, field, [xmm, 5])!;
      maxErr = Math.max(maxErr, Math.abs(num - exact));
    }
    expect(maxErr).toBeLessThan(0.5);
    // case 9 on a Dirichlet problem: energy balance via the reaction flux
    expect(res.energy.relativeImbalance).toBeLessThan(0.01);
    expect(res.stats.linearSolver).toBe('skyline-cholesky-rcm'); // linear problem → factorised once and reused
  });
});

/** 1D slab with symmetric convection: Σ Cn exp(−λn² Fo) cos(λn ξ), λn tan λn = Bi. */
function slabSeries(bi: number, fo: number, xi: number, terms = 40): number {
  let sum = 0;
  for (let n = 0; n < terms; n++) {
    // root of λ tan λ = Bi in (nπ, nπ + π/2)
    let lo = n * Math.PI + 1e-9, hi = n * Math.PI + Math.PI / 2 - 1e-9;
    for (let k = 0; k < 100; k++) {
      const mid = 0.5 * (lo + hi);
      if (mid * Math.tan(mid) - bi > 0) hi = mid;
      else lo = mid;
    }
    const l = 0.5 * (lo + hi);
    const c = (2 * Math.sin(l)) / (l + Math.sin(l) * Math.cos(l));
    sum += c * Math.exp(-l * l * fo) * Math.cos(l * xi);
  }
  return sum;
}

describe('case 2: rectangle with convection on all faces', () => {
  const lambda = 1, rho = 2000, cp = 1000, a = lambda / (rho * cp);
  const Lx = 0.1, Ly = 0.05; // half-widths, m (200 × 100 mm rectangle)
  const alpha = 10;
  const t = 3600;
  const exact = (xmm: number, ymm: number) => {
    const xi = (xmm * 1e-3 - Lx) / Lx, eta = (ymm * 1e-3 - Ly) / Ly;
    return 0 + 100 * slabSeries((alpha * Lx) / lambda, (a * t) / (Lx * Lx), xi) * slabSeries((alpha * Ly) / lambda, (a * t) / (Ly * Ly), eta);
  };
  const run = (timeIntegration: 'backward-euler' | 'crank-nicolson', dt: number) => {
    const mesh = gridMesh({ x0: 0, x1: 200, y0: 0, y1: 100, nx: 40, ny: 20 });
    const input = makeInput({
      mesh,
      materials: { r: constantMaterial(lambda, cp, rho) },
      series: [constSeries('air', 0)],
      bcs: [convBc('all', 'air', alpha, edges('r', 0, 1, 2, 3))],
      analysis: { mode: 'transient', duration: t, dt, initialTemperature: 100, outputInterval: t, timeIntegration },
    });
    const res = runToEnd(input);
    const field = fieldAtTime(res, t);
    let maxErr = 0;
    for (const [x, y] of [[100, 50], [50, 25], [10, 50], [100, 5], [190, 95]] as [number, number][]) {
      maxErr = Math.max(maxErr, Math.abs(interpolateField(mesh, field, [x, y])! - exact(x, y)));
    }
    return { maxErr, res };
  };
  it('backward Euler within 1 % of the range', () => {
    const { maxErr, res } = run('backward-euler', 10);
    expect(maxErr).toBeLessThan(1.0);
    expect(res.energy.relativeImbalance).toBeLessThan(0.01);
  });
  it('Crank–Nicolson is at least as accurate as backward Euler at the same step', () => {
    const be = run('backward-euler', 30).maxErr;
    const cn = run('crank-nicolson', 30).maxErr;
    expect(cn).toBeLessThanOrEqual(be + 1e-6);
    expect(cn).toBeLessThan(1.0);
  });
});

describe('case 3: steady two-material wall with convection', () => {
  it('matches resistances in series within 0.1 K', () => {
    const mesh = gridMesh({ x0: 0, x1: 300, y0: 0, y1: 20, nx: 30, ny: 2, regionOf: (x) => (x < 100 ? 'A' : 'B'), boundaryRegionId: 'A' });
    const input = makeInput({
      mesh,
      materials: { A: constantMaterial(1, 1000, 2000), B: constantMaterial(0.04, 1000, 30) },
      series: [constSeries('in', 20), constSeries('out', -10)],
      bcs: [convBc('inside', 'in', 1 / 0.13, edges('A', 3)), convBc('outside', 'out', 1 / 0.04, edges('A', 1))],
      analysis: { mode: 'steady', initialTemperature: 5 },
    });
    const res = runToEnd(input);
    const R = 0.13 + 0.1 / 1 + 0.2 / 0.04 + 0.04;
    const q = 30 / R;
    const field = res.fields[0];
    expect(Math.abs(interpolateField(mesh, field, [0, 10])! - (20 - q * 0.13))).toBeLessThan(0.1);
    expect(Math.abs(interpolateField(mesh, field, [100, 10])! - (20 - q * 0.23))).toBeLessThan(0.1);
    expect(Math.abs(interpolateField(mesh, field, [300, 10])! - (-10 + q * 0.04))).toBeLessThan(0.1);
    expect(res.stats.linearSolver).toBe('skyline-cholesky-rcm');
    // heat flow across the inside face equals q × height
    const flow = heatFlowAcrossEdges(res, input.boundaryConditions, input.series, edges('A', 3), 0);
    expect(Math.abs(flow.total - q * 0.02) / (q * 0.02)).toBeLessThan(1e-3);
  });
});

describe('cases 8 and 9: symmetric fire exposure, energy balance', () => {
  it('mirrored probes agree within 0.1 K and the energy balance closes within 1 %', () => {
    const mesh = gridMesh({ x0: 0, x1: 200, y0: 0, y1: 100, nx: 40, ny: 20, pattern: 'cross' });
    const concrete = tableMaterial(concreteEn1992Rows(1.5, 'lower'), 0.7, 'concrete');
    const input = makeInput({
      mesh,
      materials: { r: concrete },
      series: [fnSeries('iso', iso834, 3600, 5), constSeries('amb', 20)],
      bcs: [fireBc('fire', 'iso', edges('r', 0, 1, 3)), convBc('top', 'amb', 4, edges('r', 2))],
      analysis: { mode: 'transient', duration: 1800, dt: 10, initialTemperature: 20, outputInterval: 600, adaptive: { enabled: true, maxDeltaPerStep: 50, minDt: 1 } },
      probes: [
        { id: 'L', position: [50, 30] },
        { id: 'R', position: [150, 30] },
        { id: 'c', position: [100, 30] },
      ],
    });
    const res = runToEnd(input);
    const L = res.probeValues[0], R = res.probeValues[1];
    let maxDiff = 0;
    for (let i = 0; i < L.length; i++) maxDiff = Math.max(maxDiff, Math.abs(L[i] - R[i]));
    expect(maxDiff).toBeLessThan(0.1);
    expect(L[L.length - 1]).toBeGreaterThan(100); // fire actually heated the section
    expect(res.energy.relativeImbalance).toBeLessThan(0.01);
    expect(res.times).toEqual([0, 600, 1200, 1800]);
    expect(res.probeTimes[res.probeTimes.length - 1]).toBeCloseTo(1800, 6);
  });
});

describe('case 12: layered wall U-value (EN ISO 6946)', () => {
  it('matches the hand calculation within 0.1 %', () => {
    // 13 mm gypsum (0.25) | 200 mm mineral wool (0.037) | 100 mm concrete (2.0); Rsi 0.13, Rse 0.04
    const mesh = gridMesh({
      x0: 0,
      x1: 313,
      y0: 0,
      y1: 10,
      nx: 313,
      ny: 1,
      regionOf: (x) => (x < 13 ? 'gyp' : x < 213 ? 'mw' : 'con'),
      boundaryRegionId: 'gyp',
    });
    const input = makeInput({
      mesh,
      materials: { gyp: constantMaterial(0.25, 1000, 800), mw: constantMaterial(0.037, 1000, 30), con: constantMaterial(2.0, 1000, 2300) },
      series: [constSeries('in', 20), constSeries('out', -10)],
      bcs: [convBc('inside', 'in', 1 / 0.13, edges('gyp', 3)), convBc('outside', 'out', 1 / 0.04, edges('gyp', 1))],
      analysis: { mode: 'steady', initialTemperature: 5 },
    });
    const res = runToEnd(input);
    const flow = heatFlowAcrossEdges(res, input.boundaryConditions, input.series, edges('gyp', 3), 0);
    const U = uValue(flow.total, flow.length, 20, -10);
    const Uexact = 1 / (0.13 + 0.013 / 0.25 + 0.2 / 0.037 + 0.1 / 2.0 + 0.04);
    expect(Math.abs(U - Uexact) / Uexact).toBeLessThan(1e-3);
  });
});

describe('case 13: periodic sinusoidal surface temperature on a thick slab', () => {
  it('amplitude damping and phase lag match the analytical solution within 1 %', () => {
    const lambda = 1, rho = 2000, cp = 1000, a = lambda / (rho * cp);
    const P = 86400, omega = (2 * Math.PI) / P;
    const delta = Math.sqrt((2 * a) / omega);
    const mesh = gridMesh({ x0: 0, x1: 1000, y0: 0, y1: 10, nx: 200, ny: 1 });
    const surface = (t: number) => 10 + 10 * Math.sin(omega * t);
    const input = makeInput({
      mesh,
      materials: { r: constantMaterial(lambda, cp, rho) },
      series: [fnSeries('surf', surface, P, 300, 'repeat')],
      bcs: [fixedBc('left', 'surf', edges('r', 3))],
      analysis: { mode: 'periodic', duration: P, dt: 300, initialTemperature: 10, outputInterval: 3600, periodic: { maxCycles: 12, tolerance: 0.005 } },
      probes: [{ id: 'p', position: [100, 5] }],
    });
    const res = runToEnd(input);
    expect(res.stats.cycles).toBeGreaterThan(1);
    // least-squares fit of C + A sin(ωt) + B cos(ωt) on the last cycle
    const ts = res.probeTimes, vs = res.probeValues[0];
    let sS = 0, sC = 0, sSS = 0, sCC = 0, sSC = 0, sV = 0, sVS = 0, sVC = 0, n = 0;
    for (let i = 1; i < ts.length; i++) {
      const s = Math.sin(omega * ts[i]), c = Math.cos(omega * ts[i]), v = vs[i];
      sS += s; sC += c; sSS += s * s; sCC += c * c; sSC += s * c; sV += v; sVS += v * s; sVC += v * c; n++;
    }
    // solve 3×3 normal equations [n sS sC; sS sSS sSC; sC sSC sCC] [C A B] = [sV sVS sVC]
    const M = [
      [n, sS, sC],
      [sS, sSS, sSC],
      [sC, sSC, sCC],
    ];
    const rhs = [sV, sVS, sVC];
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const f = M[j][i] / M[i][i];
        for (let k = i; k < 3; k++) M[j][k] -= f * M[i][k];
        rhs[j] -= f * rhs[i];
      }
    }
    const sol = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = rhs[i];
      for (let k = i + 1; k < 3; k++) s -= M[i][k] * sol[k];
      sol[i] = s / M[i][i];
    }
    const A = sol[1], B = sol[2];
    const amp = Math.hypot(A, B);
    const phase = Math.atan2(-B, A); // v = amp·sin(ωt − phase)
    const x = 0.1;
    const ampExact = 10 * Math.exp(-x / delta);
    const phaseExact = x / delta;
    expect(Math.abs(amp - ampExact) / ampExact).toBeLessThan(0.01);
    expect(Math.abs(phase - phaseExact) / (2 * Math.PI)).toBeLessThan(0.01);
    expect(Math.abs(sol[0] - 10)).toBeLessThan(0.1);
  });
});
