/**
 * Derived quantities reported in tables, figures and MCP answers:
 * time-to-threshold, strength reduction lookups, rebar table, metrics, dew point.
 */
import type { BoundaryCondition, Material, Metric, Project, ReductionTable } from '../model/types.js';
import { edgeKey } from '../mesh/types.js';
import type { MaterialEvaluator, RunResult, SeriesEvaluator } from '../solver/types.js';
import { fieldAtTime, fieldRange } from './field.js';
import { fRsi, heatFlowAcrossEdges, psiValue, surfaceTemperatures, uValue } from './flux.js';
import { interpolateField } from './locate.js';

/** First time (s) at which the series reaches `threshold` (linear interpolation), or null. */
export function timeToThreshold(times: ArrayLike<number>, values: ArrayLike<number>, threshold: number): number | null {
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    if (v >= threshold) {
      if (i === 0) return times[0];
      const v0 = values[i - 1];
      if (Number.isNaN(v0) || v === v0) return times[i];
      const f = (threshold - v0) / (v - v0);
      return times[i - 1] + f * (times[i] - times[i - 1]);
    }
  }
  return null;
}

/** Linear interpolation in a reduction table (θ → k), clamped at the ends. */
export function lookupReduction(table: ReductionTable, theta: number): number {
  const pts = table.points;
  if (pts.length === 0) return NaN;
  if (theta <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (theta >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, k0] = pts[i], [t1, k1] = pts[i + 1];
    if (theta >= t0 && theta <= t1) return t1 === t0 ? k1 : k0 + ((theta - t0) / (t1 - t0)) * (k1 - k0);
  }
  return NaN;
}

/** Probe value at time t from the stored history (linear interpolation), or from the field when the probe was not recorded. */
export function probeValueAt(result: RunResult, probeIndex: number, t: number): number {
  const times = result.probeTimes, vals = result.probeValues[probeIndex];
  if (!vals || vals.length === 0) return NaN;
  if (t <= times[0]) return vals[0];
  const last = times.length - 1;
  if (t >= times[last]) return vals[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - times[lo]) / (times[hi] - times[lo]);
  return vals[lo] + f * (vals[hi] - vals[lo]);
}

export interface RebarRow {
  rebarId: string;
  name: string;
  x: number;
  y: number;
  diameter: number;
  materialId: string;
  /** Temperature at each requested time, °C. */
  temps: number[];
  /** k_s(θ) at each requested time (null when the material has no strength table). */
  ks: (number | null)[];
  /** Name of the reduction table used. */
  tableName: string | null;
}

/** Rebar temperatures and strength reduction at the given times. Uses the probe linked to each bar, else interpolates the field. */
export function rebarTable(project: Project, result: RunResult, times: number[]): RebarRow[] {
  const probeIndex = new Map<string, number>();
  result.probes.forEach((p, i) => probeIndex.set(p.id, i));
  const materialById = new Map<string, Material>(project.materials.map((m) => [m.id, m]));
  return project.rebars.map((bar) => {
    const probe = project.probes.find((p) => p.linkedRebarId === bar.id);
    const pIdx = probe ? probeIndex.get(probe.id) : undefined;
    const mat = materialById.get(bar.materialId);
    const table = mat?.strength?.find((s) => s.id === bar.strengthClassId) ?? mat?.strength?.[0] ?? null;
    const temps = times.map((t) => {
      if (pIdx !== undefined && result.probes[pIdx].found) return probeValueAt(result, pIdx, t);
      const v = interpolateField(result.mesh, fieldAtTime(result, t), bar.centre);
      return v ?? NaN;
    });
    return {
      rebarId: bar.id,
      name: bar.name,
      x: bar.centre[0],
      y: bar.centre[1],
      diameter: bar.diameter,
      materialId: bar.materialId,
      temps,
      ks: temps.map((th) => (table ? lookupReduction(table, th) : null)),
      tableName: table?.name ?? null,
    };
  });
}

export interface MetricResult {
  metricId: string;
  name: string;
  kind: Metric['kind'];
  value: number | null;
  unit: string;
  /** Time at which the metric was evaluated, s. */
  time: number;
  details: Record<string, number | string | null>;
}

function endTime(result: RunResult): number {
  return result.times[result.times.length - 1] ?? 0;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Air temperature of the first convection-type condition on the given edges (or any other condition when `other` is true). */
function sideTemperature(bcs: BoundaryCondition[], series: Record<string, SeriesEvaluator>, edgeKeys: Set<string>, other: boolean, t: number): number | undefined {
  for (const bc of bcs) {
    const onEdges = bc.edgeRefs.some((r) => edgeKeys.has(edgeKey(r)));
    if (onEdges === other) continue;
    if (bc.type === 'convection') return series[bc.airSeriesId]?.at(t);
    if (bc.type === 'convection-radiation') return series[bc.gasSeriesId]?.at(t);
    if (bc.type === 'fixed') return series[bc.temperatureSeriesId]?.at(t);
  }
  return undefined;
}

/** Evaluate every metric of the project against a result. */
export function evaluateMetrics(project: Project, result: RunResult, series: Record<string, SeriesEvaluator>, materials?: Record<string, MaterialEvaluator>): MetricResult[] {
  const bcs = project.boundaryConditions;
  return project.metrics.map((metric): MetricResult => {
    const t = metric.time ?? endTime(result);
    const base = { metricId: metric.id, name: metric.name, kind: metric.kind, time: t };
    const edges = metric.edgeRefs ?? [];
    const keys = new Set(edges.map(edgeKey));
    const p = metric.params ?? {};
    const thetaIn = num(p.thetaInside) ?? sideTemperature(bcs, series, keys, false, t);
    const thetaOut = num(p.thetaOutside) ?? sideTemperature(bcs, series, keys, true, t);
    try {
      switch (metric.kind) {
        case 'heat-flow': {
          const q = heatFlowAcrossEdges(result, bcs, series, edges, t, materials);
          return { ...base, value: q.total, unit: 'W/m', details: { length_m: q.length, meanFlux_W_m2: q.meanFlux, skipped: q.skipped } };
        }
        case 'u-value': {
          const q = heatFlowAcrossEdges(result, bcs, series, edges, t, materials);
          const L = num(p.length) !== undefined ? (num(p.length) as number) * 1e-3 : q.length;
          if (thetaIn === undefined || thetaOut === undefined) return { ...base, value: null, unit: 'W/m²K', details: { error: 'thetaInside/thetaOutside unknown' } };
          return { ...base, value: uValue(q.total, L, thetaIn, thetaOut), unit: 'W/m²K', details: { heatFlow_W_m: q.total, length_m: L, thetaInside: thetaIn, thetaOutside: thetaOut } };
        }
        case 'psi-value': {
          const q = heatFlowAcrossEdges(result, bcs, series, edges, t, materials);
          if (thetaIn === undefined || thetaOut === undefined) return { ...base, value: null, unit: 'W/mK', details: { error: 'thetaInside/thetaOutside unknown' } };
          const parts: { u: number; l: number }[] = [];
          for (let i = 1; i <= 4; i++) {
            const u = num(p[`u${i}`]), l = num(p[`l${i}`]);
            if (u !== undefined && l !== undefined) parts.push({ u, l: l * 1e-3 });
          }
          return { ...base, value: psiValue(q.total, thetaIn, thetaOut, parts), unit: 'W/mK', details: { heatFlow_W_m: q.total, L2D_W_mK: Math.abs(q.total) / Math.abs(thetaIn - thetaOut), parts: parts.length } };
        }
        case 'min-surface-temperature':
        case 'mean-surface-temperature': {
          const s = surfaceTemperatures(result, edges, t);
          return { ...base, value: metric.kind === 'min-surface-temperature' ? s.min : s.mean, unit: '°C', details: { min: s.min, max: s.max, mean: s.mean, length_m: s.length } };
        }
        case 'f-rsi': {
          const s = surfaceTemperatures(result, edges, t);
          if (thetaIn === undefined || thetaOut === undefined) return { ...base, value: null, unit: '-', details: { error: 'thetaInside/thetaOutside unknown' } };
          return { ...base, value: fRsi(s.min, thetaIn, thetaOut), unit: '-', details: { thetaSurfaceMin: s.min, thetaInside: thetaIn, thetaOutside: thetaOut } };
        }
        case 'time-to-threshold': {
          const idx = result.probes.findIndex((pr) => pr.id === metric.probeId);
          if (idx < 0 || metric.threshold === undefined) return { ...base, value: null, unit: 's', details: { error: 'probe or threshold missing' } };
          const tt = timeToThreshold(result.probeTimes, result.probeValues[idx], metric.threshold);
          return { ...base, value: tt, unit: 's', details: { threshold: metric.threshold, probeId: metric.probeId ?? null, reached: tt === null ? 'no' : 'yes' } };
        }
        case 'max-temperature': {
          const r = fieldRange(fieldAtTime(result, t));
          return { ...base, value: r.max, unit: '°C', details: { min: r.min, max: r.max } };
        }
        case 'probe-temperature': {
          const idx = result.probes.findIndex((pr) => pr.id === metric.probeId);
          if (idx < 0) return { ...base, value: null, unit: '°C', details: { error: 'probe missing' } };
          return { ...base, value: probeValueAt(result, idx, t), unit: '°C', details: { probeId: metric.probeId ?? null } };
        }
        default:
          return { ...base, value: null, unit: '', details: { error: `unknown metric kind ${String(metric.kind)}` } };
      }
    } catch (err) {
      return { ...base, value: null, unit: '', details: { error: err instanceof Error ? err.message : String(err) } };
    }
  });
}

/** Dew point °C (Magnus formula, Sonntag 1990 coefficients) for air temperature θ and relative humidity RH in %. */
export function dewPoint(theta: number, rhPercent: number): number {
  const a = 17.62, b = 243.12;
  const rh = Math.min(100, Math.max(0.01, rhPercent)) / 100;
  const gamma = Math.log(rh) + (a * theta) / (b + theta);
  return (b * gamma) / (a - gamma);
}

export interface CondensationCheck {
  dewPoint: number;
  /** θ_surface − dew point, K (negative = condensation). */
  margin: number;
  condensation: boolean;
  /** Minimum temperature factor needed to avoid condensation, f_Rsi,min. */
  fRsiRequired: number;
}

/** Surface condensation check: surface temperature against the dew point of the indoor air. */
export function condensationCheck(thetaSurface: number, thetaInside: number, thetaOutside: number, rhPercent: number): CondensationCheck {
  const dp = dewPoint(thetaInside, rhPercent);
  const d = thetaInside - thetaOutside;
  return { dewPoint: dp, margin: thetaSurface - dp, condensation: thetaSurface < dp, fRsiRequired: d !== 0 ? (dp - thetaOutside) / d : NaN };
}
