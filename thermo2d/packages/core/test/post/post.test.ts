import { describe, expect, it } from 'vitest';
import { gridMesh } from '../helpers/gridMesh.js';
import { constSeries, convBc, edges, makeInput } from '../helpers/input.js';
import { barycentric, interpolateField, locateElement } from '../../src/post/locate.js';
import { fieldAtTime, isotherm, lineProfile, reducedSection } from '../../src/post/field.js';
import { condensationCheck, dewPoint, evaluateMetrics, lookupReduction, probeValueAt, rebarTable, timeToThreshold } from '../../src/post/metrics.js';
import { fRsi, psiValue, surfaceTemperatures, uValue } from '../../src/post/flux.js';
import { constantMaterial } from '../../src/solver/material.js';
import { runToEnd } from '../../src/solver/run.js';
import { createEmptyProject } from '../../src/model/defaults.js';
import type { RunResult } from '../../src/solver/types.js';

const mesh = gridMesh({ x0: 0, x1: 100, y0: 0, y1: 50, nx: 10, ny: 5 });
const n = mesh.nodes.length / 2;
const linear = new Float32Array(n);
for (let i = 0; i < n; i++) linear[i] = 2 * mesh.nodes[2 * i] + mesh.nodes[2 * i + 1]; // θ = 2x + y

describe('locate and interpolate', () => {
  it('interpolates a linear field exactly, including on edges and vertices', () => {
    expect(interpolateField(mesh, linear, [33.3, 17.7])).toBeCloseTo(2 * 33.3 + 17.7, 9);
    expect(interpolateField(mesh, linear, [0, 0])).toBeCloseTo(0, 9);
    expect(interpolateField(mesh, linear, [100, 50])).toBeCloseTo(250, 9);
    expect(interpolateField(mesh, linear, [50, 0])).toBeCloseTo(100, 9);
    expect(interpolateField(mesh, linear, [101, 10])).toBeNull();
    expect(locateElement(mesh, [-1, -1])).toBe(-1);
    const e = locateElement(mesh, [5, 5]);
    const w = barycentric(mesh, e, [5, 5]);
    expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 12);
  });
});

describe('field post-processing', () => {
  it('isotherm of a linear field is the straight line 2x + y = level', () => {
    const segs = isotherm(mesh, linear, 100);
    expect(segs.length).toBeGreaterThan(0);
    for (let i = 0; i < segs.length; i += 2) expect(2 * segs[i] + segs[i + 1]).toBeCloseTo(100, 6);
  });
  it('line profile samples along the line', () => {
    const p = lineProfile(mesh, linear, [0, 10], [100, 10], 11);
    expect(p.s[10]).toBeCloseTo(100);
    expect(p.values[5]).toBeCloseTo(2 * 50 + 10, 9);
  });
  it('reduced section counts the cold part', () => {
    const rs = reducedSection(mesh, linear, 100); // cold: 2x + y < 100 → roughly a triangle of area ~ (50×50)/2 + ...
    expect(rs.area).toBeGreaterThan(1000);
    expect(rs.area).toBeLessThan(2500);
    expect(rs.bounds!.minX).toBe(0);
    expect(rs.width).toBeLessThanOrEqual(60);
  });
  it('fieldAtTime interpolates between snapshots', () => {
    const r = { times: [0, 10, 20], fields: [Float32Array.of(0), Float32Array.of(10), Float32Array.of(40)] } as unknown as RunResult;
    expect(fieldAtTime(r, 5)[0]).toBeCloseTo(5);
    expect(fieldAtTime(r, 15)[0]).toBeCloseTo(25);
    expect(fieldAtTime(r, 99)[0]).toBe(40);
    expect(fieldAtTime(r, -1)[0]).toBe(0);
  });
});

describe('metrics helpers', () => {
  it('timeToThreshold interpolates the crossing', () => {
    expect(timeToThreshold([0, 10, 20], [0, 50, 100], 75)).toBeCloseTo(15);
    expect(timeToThreshold([0, 10], [0, 50], 75)).toBeNull();
    expect(timeToThreshold([0, 10], [80, 90], 75)).toBe(0);
  });
  it('lookupReduction interpolates and clamps', () => {
    const table = { id: 'ks', name: 'ks', points: [[20, 1], [400, 1], [500, 0.78], [1200, 0]] as [number, number][], source: { text: 'test' } };
    expect(lookupReduction(table, 0)).toBe(1);
    expect(lookupReduction(table, 450)).toBeCloseTo(0.89);
    expect(lookupReduction(table, 2000)).toBe(0);
  });
  it('dew point and condensation check', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.3, 0);
    const c = condensationCheck(8, 20, -10, 50);
    expect(c.condensation).toBe(true);
    expect(c.fRsiRequired).toBeCloseTo((c.dewPoint + 10) / 30, 6);
  });
  it('U, ψ and f_Rsi formulas', () => {
    expect(uValue(-3, 1, 20, -10)).toBeCloseTo(0.1);
    expect(psiValue(15, 20, -10, [{ u: 0.2, l: 1 }, { u: 0.3, l: 0.5 }])).toBeCloseTo(0.5 - 0.35);
    expect(fRsi(15, 20, -10)).toBeCloseTo(25 / 30);
  });
});

describe('metrics and rebar table on a steady run', () => {
  const wall = gridMesh({ x0: 0, x1: 200, y0: 0, y1: 20, nx: 20, ny: 2 });
  const input = makeInput({
    mesh: wall,
    materials: { r: constantMaterial(0.04, 1000, 30) },
    series: [constSeries('in', 20), constSeries('out', -10)],
    bcs: [convBc('inside', 'in', 1 / 0.13, edges('r', 3)), convBc('outside', 'out', 1 / 0.04, edges('r', 1))],
    analysis: { mode: 'steady', initialTemperature: 5 },
    probes: [{ id: 'pb', position: [100, 10] }],
  });
  const res = runToEnd(input);
  const R = 0.13 + 5 + 0.04;
  it('evaluateMetrics computes U, surface temperatures and f_Rsi', () => {
    const project = createEmptyProject('m');
    project.boundaryConditions = input.boundaryConditions;
    project.metrics = [
      { id: 'u', name: 'U', kind: 'u-value', edgeRefs: edges('r', 3) },
      { id: 'ts', name: 'Tsi', kind: 'min-surface-temperature', edgeRefs: edges('r', 3) },
      { id: 'f', name: 'fRsi', kind: 'f-rsi', edgeRefs: edges('r', 3) },
      { id: 'q', name: 'Q', kind: 'heat-flow', edgeRefs: edges('r', 1) },
      { id: 'p', name: 'probe', kind: 'probe-temperature', probeId: 'pb' },
      { id: 'mx', name: 'max', kind: 'max-temperature' },
    ];
    const out = evaluateMetrics(project, res, input.series);
    const byId = Object.fromEntries(out.map((m) => [m.metricId, m]));
    expect(byId.u.value!).toBeCloseTo(1 / R, 3);
    expect(byId.ts.value!).toBeCloseTo(20 - (30 / R) * 0.13, 2);
    expect(byId.f.value!).toBeCloseTo(1 - 0.13 / R, 3);
    expect(byId.q.value!).toBeCloseTo(-(30 / R) * 0.02, 3); // heat leaves through the outside face
    expect(byId.p.value!).toBeCloseTo(20 - (30 / R) * (0.13 + 2.5), 2);
    expect(byId.mx.value!).toBeCloseTo(20 - (30 / R) * 0.13, 2);
    expect(probeValueAt(res, 0, 0)).toBeCloseTo(byId.p.value!, 9);
    const st = surfaceTemperatures(res, edges('r', 1), 0);
    expect(st.mean).toBeCloseTo(-10 + (30 / R) * 0.04, 2);
    expect(st.length).toBeCloseTo(0.02, 9);
  });
  it('rebarTable reads bar temperatures and k_s', () => {
    const project = createEmptyProject('m');
    project.materials = [
      {
        id: 'steel',
        name: 'steel',
        category: 'metal',
        model: { kind: 'steel-en1993-1-2', rho: 7850 },
        emissivity: 0.7,
        validRange: [20, 1200],
        source: { text: 'test' },
        quality: 'standard',
        tags: [],
        origin: 'builtin',
        strength: [{ id: 'N', name: 'class N', points: [[20, 1], [1200, 0]], source: { text: 'test' } }],
      },
    ];
    project.rebars = [{ id: 'b1', name: 'B1', centre: [100, 10], diameter: 20, materialId: 'steel', strengthClassId: 'N' }];
    project.probes = [{ id: 'pb', name: 'B1', position: [100, 10], kind: 'rebar', linkedRebarId: 'b1' }];
    const rows = rebarTable(project, res, [0]);
    expect(rows).toHaveLength(1);
    expect(rows[0].temps[0]).toBeCloseTo(20 - (30 / R) * (0.13 + 2.5), 2);
    expect(rows[0].ks[0]).toBe(1); // below 20 °C the table clamps at k_s = 1
    expect(lookupReduction(project.materials[0].strength![0], 610)).toBeCloseTo(0.5, 6);
    expect(rows[0].tableName).toBe('class N');
  });
});
