import { describe, expect, it } from 'vitest';
import type { RunResult, TimeSeries } from '@thermo2d/core';
import { differenceField, fieldAt, fieldRange, makeLocator, pointHistory, probeValueAt, sampleSeries } from './fieldUtils.js';

/** Two-triangle unit square, field = x + 10 y at t=0, doubled at t=60. */
function square(): RunResult {
  const nodes = new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const triangles = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const f0 = new Float32Array([0, 1, 11, 10]);
  const f1 = new Float32Array([0, 2, 22, 20]);
  return {
    analysisId: 'a',
    scenarioId: null,
    mode: 'transient',
    mesh: {
      nodes,
      triangles,
      elementRegion: new Int32Array([0, 0]),
      regions: [{ id: 'r', materialId: null, kind: 'region', elementCount: 2, area: 1 }],
      boundary: [],
      stats: { nodeCount: 4, elementCount: 2, minAngleDeg: 45, minEdge: 1, maxEdge: 1.41, poorElements: 0 },
      warnings: [],
    },
    times: [0, 60],
    fields: [f0, f1],
    probes: [{ id: 'p', position: [0.5, 0.5], found: true, element: 0 }],
    probeTimes: new Float64Array([0, 30, 60]),
    probeValues: [new Float64Array([5.5, 8.25, 11])],
    energy: { storedChange: 0, boundaryIn: 0, sourceIn: 0, relativeImbalance: 0 },
    stats: { steps: 2, rejectedSteps: 0, newtonIterations: 2, wallTimeMs: 1, linearSolver: 'pcg', nodeCount: 4, elementCount: 2 },
    warnings: [],
  };
}

describe('field utilities', () => {
  it('interpolates fields between snapshots and clamps', () => {
    const r = square();
    expect(Array.from(fieldAt(r, -5))).toEqual([0, 1, 11, 10]);
    expect(Array.from(fieldAt(r, 30))).toEqual([0, 1.5, 16.5, 15]);
    expect(Array.from(fieldAt(r, 999))).toEqual([0, 2, 22, 20]);
    expect(fieldRange(fieldAt(r, 0))).toEqual([0, 11]);
  });

  it('reads probe histories at any time', () => {
    const r = square();
    expect(probeValueAt(r, 'p', 15)).toBeCloseTo(6.875);
    expect(probeValueAt(r, 'p', 100)).toBe(11);
    expect(probeValueAt(r, 'nope', 0)).toBeNull();
  });

  it('locates elements and interpolates linearly', () => {
    const r = square();
    const loc = makeLocator(r, 4);
    expect(loc.value(r.fields[0], 0.25, 0.1)).toBeCloseTo(0.25 + 1);
    expect(loc.value(r.fields[0], 0.5, 0.5)).toBeCloseTo(5.5);
    expect(loc.value(r.fields[0], 2, 2)).toBeNull();
    const h = pointHistory(r, loc, [0.5, 0.5]);
    expect(h?.v.map((v) => +v.toFixed(3))).toEqual([5.5, 11]);
  });

  it('samples series with hold/repeat/step', () => {
    const s: TimeSeries = { id: 's', name: 's', points: [[0, 20], [100, 120]], interpolation: 'linear', afterEnd: 'hold', unit: '°C', source: { kind: 'manual' } };
    const a = sampleSeries(s, 200, 4);
    expect(a.v).toEqual([20, 70, 120, 120, 120]);
    const b = sampleSeries({ ...s, afterEnd: 'repeat' }, 200, 4);
    expect(b.v[3]).toBe(70);
    const c = sampleSeries({ ...s, interpolation: 'step' }, 100, 2);
    expect(c.v).toEqual([20, 20, 120]);
  });

  it('computes a difference field with a symmetric limit', () => {
    const r = square();
    const d = differenceField(r, r, 60);
    expect(Array.from(d.field)).toEqual([0, 0, 0, 0]);
    expect(d.limit).toBe(0.1);
  });
});

import { withProjectProbes } from './fieldUtils.js';
import type { Project } from '@thermo2d/core';

describe('withProjectProbes', () => {
  // One right triangle (0,0)-(100,0)-(0,100) with θ = x at every snapshot; two snapshots at t = 0 and 60.
  const mesh = {
    nodes: new Float64Array([0, 0, 100, 0, 0, 100]),
    triangles: new Uint32Array([0, 1, 2]),
    elementRegion: new Int32Array([0]),
    regions: [{ id: 'r', materialId: 'm', kind: 'region' as const, elementCount: 1, area: 5000 }],
    boundary: [],
    stats: { nodeCount: 3, elementCount: 1, minAngleDeg: 45, minEdge: 100, maxEdge: 141, poorElements: 0 },
    warnings: [],
  };
  const result = {
    analysisId: 'a', scenarioId: null, mode: 'transient', mesh,
    times: [0, 60], fields: [new Float32Array([0, 100, 0]), new Float32Array([0, 100, 0])],
    probes: [{ id: 'p', position: [10, 10], found: true, element: 0 }],
    probeTimes: new Float64Array([0, 30, 60]), probeValues: [new Float64Array([10, 10, 10])],
    energy: { storedChange: 0, boundaryIn: 0, sourceIn: 0, relativeImbalance: 0 },
    stats: { steps: 2, rejectedSteps: 0, newtonIterations: 2, wallTimeMs: 1, linearSolver: 'x', nodeCount: 3, elementCount: 1 },
    warnings: [],
  } as unknown as RunResult;
  it('re-samples a probe that was moved after the run', () => {
    const project = { probes: [{ id: 'p', name: 'P', position: [50, 10], kind: 'manual' }] } as unknown as Project;
    const out = withProjectProbes(result, project);
    expect(out.probes[0].position).toEqual([50, 10]);
    expect(Array.from(out.probeValues[0])).toEqual([50, 50, 50]);
    expect(result.probeValues[0][0]).toBe(10); // input untouched
  });
  it('returns the same object when nothing changed', () => {
    const project = { probes: [{ id: 'p', name: 'P', position: [10, 10], kind: 'manual' }] } as unknown as Project;
    expect(withProjectProbes(result, project)).toBe(result);
  });
});
