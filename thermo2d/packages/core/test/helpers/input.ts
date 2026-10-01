/** Builders for SolveInput in tests: series, boundary conditions and analyses with sensible defaults. */
import type { Analysis, BoundaryCondition, EdgeRef, TimeSeries } from '../../src/model/types.js';
import { defaultAnalysis } from '../../src/model/defaults.js';
import { compileSeries } from '../../src/solver/series.js';
import type { MaterialEvaluator, SeriesEvaluator, SolveInput, SolveProbe } from '../../src/solver/types.js';
import type { Mesh } from '../../src/mesh/types.js';

export function edges(regionId: string, ...edgeIndices: number[]): EdgeRef[] {
  return edgeIndices.map((edgeIndex) => ({ regionId, ring: 0, edgeIndex }));
}

export function constSeries(id: string, value: number): TimeSeries {
  return { id, name: id, points: [[0, value]], interpolation: 'linear', afterEnd: 'hold', unit: '°C', source: { kind: 'manual' } };
}

export function fnSeries(id: string, fn: (t: number) => number, tEnd: number, dt: number, afterEnd: TimeSeries['afterEnd'] = 'hold'): TimeSeries {
  const points: [number, number][] = [];
  for (let t = 0; t <= tEnd + 1e-9; t += dt) points.push([t, fn(t)]);
  return { id, name: id, points, interpolation: 'linear', afterEnd, unit: '°C', source: { kind: 'generated' } };
}

export function fixedBc(id: string, seriesId: string, edgeRefs: EdgeRef[]): BoundaryCondition {
  return { id, name: id, type: 'fixed', temperatureSeriesId: seriesId, edgeRefs };
}

export function convBc(id: string, seriesId: string, alpha: number, edgeRefs: EdgeRef[]): BoundaryCondition {
  return { id, name: id, type: 'convection', airSeriesId: seriesId, alpha, edgeRefs };
}

export function fireBc(id: string, seriesId: string, edgeRefs: EdgeRef[], epsM = 0.7): BoundaryCondition {
  return { id, name: id, type: 'convection-radiation', gasSeriesId: seriesId, alphaC: 25, phi: 1, epsM, epsF: 1, edgeRefs };
}

export interface InputOptions {
  mesh: Mesh;
  materials: Record<string, MaterialEvaluator>;
  series?: TimeSeries[];
  bcs?: BoundaryCondition[];
  analysis?: Partial<Analysis>;
  probes?: SolveProbe[];
  ambient?: number;
}

export function makeInput(o: InputOptions): SolveInput {
  const ambient = o.ambient ?? 20;
  const series: Record<string, SeriesEvaluator> = {};
  for (const s of o.series ?? []) series[s.id] = compileSeries(s, ambient);
  return {
    mesh: o.mesh,
    materials: o.materials,
    boundaryConditions: o.bcs ?? [],
    series,
    heatSources: [],
    analysis: defaultAnalysis({ id: 'a', name: 'test', adaptive: { enabled: false, maxDeltaPerStep: 50, minDt: 0.25 }, ...o.analysis }),
    probes: o.probes ?? [],
    ambientTemperature: ambient,
  };
}

/** Complementary error function, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 1 - y : 1 + y;
}
