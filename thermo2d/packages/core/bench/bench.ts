/**
 * Performance bench for the spec §10 targets. Run: npx tsx packages/core/bench/bench.ts
 *  A. 300×500 mm beam, 6 bars (steel squares), ~20 000 nodes, ISO 834 on three sides, 90 min at Δt = 5 s.
 *  B. 1 000×300 mm wall, ~10 000 nodes, one year at 1 h steps with a sinusoidal outdoor temperature.
 */
import { gridMesh } from '../test/helpers/gridMesh.js';
import { constSeries, convBc, edges, fireBc, fixedBc, fnSeries, makeInput } from '../test/helpers/input.js';
import { concreteEn1992Rows, constantMaterial, steelEn1993Rows, tableMaterial } from '../src/solver/material.js';
import { runToEnd } from '../src/solver/run.js';
import { iso834 } from '../src/solver/series.js';

function beam() {
  const bars: [number, number][] = [
    [50, 50],
    [150, 50],
    [250, 50],
    [50, 450],
    [150, 450],
    [250, 450],
  ];
  const mesh = gridMesh({
    x0: 0,
    x1: 300,
    y0: 0,
    y1: 500,
    nx: 100,
    ny: 167,
    regionOf: (x, y) => (bars.some(([bx, by]) => Math.abs(x - bx) < 9 && Math.abs(y - by) < 9) ? 'steel' : 'c'),
    boundaryRegionId: 'c',
  });
  const input = makeInput({
    mesh,
    materials: { c: tableMaterial(concreteEn1992Rows(1.5, 'lower'), 0.7, 'concrete'), steel: tableMaterial(steelEn1993Rows(), 0.7, 'steel') },
    series: [fnSeries('iso', iso834, 7200, 5), constSeries('amb', 20)],
    bcs: [fireBc('fire', 'iso', edges('c', 0, 1, 3)), convBc('top', 'amb', 4, edges('c', 2))],
    analysis: { mode: 'transient', duration: 5400, dt: 5, initialTemperature: 20, outputInterval: 300 },
    probes: bars.map(([x, y], i) => ({ id: `B${i + 1}`, position: [x, y] })),
  });
  const t0 = performance.now();
  const res = runToEnd(input);
  const ms = performance.now() - t0;
  console.log(`A. beam 300×500, ${res.stats.nodeCount} nodes, ${res.stats.elementCount} elements, 90 min @ 5 s`);
  console.log(`   wall ${(ms / 1000).toFixed(1)} s (target < 30 s), steps ${res.stats.steps}, Newton ${res.stats.newtonIterations} (${(res.stats.newtonIterations / res.stats.steps).toFixed(2)}/step), solver ${res.stats.linearSolver}`);
  console.log(`   bar temperatures at 90 min: ${res.probeValues.map((v) => v[v.length - 1].toFixed(0)).join(', ')} °C; energy imbalance ${res.energy.relativeImbalance.toExponential(2)}`);
  if (res.warnings.length) console.log(`   warnings: ${res.warnings.join(' | ')}`);
}

function wall() {
  const mesh = gridMesh({ x0: 0, x1: 1000, y0: 0, y1: 300, nx: 180, ny: 54, regionOf: (x, y) => (y < 100 ? 'ins' : 'c'), boundaryRegionId: 'ins' });
  const year = 365 * 86400;
  const outdoor = (t: number) => 5 - 12 * Math.cos((2 * Math.PI * t) / year) - 4 * Math.cos((2 * Math.PI * t) / 86400);
  const input = makeInput({
    mesh,
    materials: { c: constantMaterial(2.0, 900, 2300), ins: constantMaterial(0.037, 1000, 30) },
    series: [fnSeries('out', outdoor, year, 3600), constSeries('in', 21)],
    bcs: [convBc('outside', 'out', 25, edges('ins', 0)), convBc('inside', 'in', 1 / 0.13, edges('ins', 2))],
    analysis: { mode: 'transient', duration: year, dt: 3600, initialTemperature: 10, outputInterval: 30 * 86400 },
    probes: [{ id: 'mid', position: [500, 150] }],
  });
  const t0 = performance.now();
  const res = runToEnd(input);
  const ms = performance.now() - t0;
  console.log(`B. wall 1000×300, ${res.stats.nodeCount} nodes, ${res.stats.elementCount} elements, 1 year @ 1 h`);
  console.log(`   wall ${(ms / 1000).toFixed(1)} s (target < 30 s), steps ${res.stats.steps}, Newton ${res.stats.newtonIterations}, solver ${res.stats.linearSolver}`);
  console.log(`   energy imbalance ${res.energy.relativeImbalance.toExponential(2)}`);
  if (res.warnings.length) console.log(`   warnings: ${res.warnings.join(' | ')}`);
}

function fixedWall() {
  // a linear problem with Dirichlet faces: exercises the direct path with factorisation reuse
  const mesh = gridMesh({ x0: 0, x1: 1000, y0: 0, y1: 300, nx: 180, ny: 54 });
  const year = 365 * 86400;
  const input = makeInput({
    mesh,
    materials: { r: constantMaterial(2.0, 900, 2300) },
    series: [fnSeries('out', (t) => 5 - 12 * Math.cos((2 * Math.PI * t) / year), year, 3600), constSeries('in', 21)],
    bcs: [fixedBc('outside', 'out', edges('r', 0)), fixedBc('inside', 'in', edges('r', 2))],
    analysis: { mode: 'transient', duration: year, dt: 3600, initialTemperature: 10, outputInterval: 30 * 86400 },
  });
  const t0 = performance.now();
  const res = runToEnd(input);
  console.log(`C. wall with fixed faces: wall ${((performance.now() - t0) / 1000).toFixed(1)} s, steps ${res.stats.steps}, solver ${res.stats.linearSolver}, imbalance ${res.energy.relativeImbalance.toExponential(2)}`);
}

beam();
wall();
fixedWall();
