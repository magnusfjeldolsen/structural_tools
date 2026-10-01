/**
 * Boundary heat flow, surface temperatures and the building-physics quantities
 * derived from them (U, ψ, f_Rsi). Positive heat flow = into the body. W per metre depth.
 */
import type { BoundaryCondition, EdgeRef } from '../model/types.js';
import { edgeKey, type Mesh } from '../mesh/types.js';
import type { MaterialEvaluator, RunResult, SeriesEvaluator } from '../solver/types.js';
import { fieldAtTime } from './field.js';

const SIGMA = 5.67e-8;
const K0 = 273.15;
const GAUSS = 1 / Math.sqrt(3);
const MM = 1e-3;

const EDGE_ELEMENT_CACHE = new WeakMap<Mesh, Map<number, number>>();

/** Map boundary segment (a,b) → adjacent element, built once per mesh. */
function boundaryElementMap(mesh: Mesh): Map<number, number> {
  let map = EDGE_ELEMENT_CACHE.get(mesh);
  if (map) return map;
  map = new Map();
  const n = mesh.nodes.length / 2;
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const wanted = new Set<number>();
  for (const s of mesh.boundary) wanted.add(key(s.a, s.b));
  const tri = mesh.triangles;
  for (let e = 0; e < tri.length / 3; e++) {
    for (let k = 0; k < 3; k++) {
      const kk = key(tri[3 * e + k], tri[3 * e + ((k + 1) % 3)]);
      if (wanted.has(kk)) map.set(kk, e);
    }
  }
  EDGE_ELEMENT_CACHE.set(mesh, map);
  return map;
}

export interface HeatFlowResult {
  /** Total heat flow into the body through the edges, W/m. */
  total: number;
  /** Total edge length, m. */
  length: number;
  /** Mean flux density, W/m². */
  meanFlux: number;
  /** Edges whose flow could not be evaluated (fixed temperature without materials). */
  skipped: number;
}

/**
 * Heat flow into the body across the given edges at time t.
 * For flux-type conditions the flow follows from the condition and the surface temperature;
 * for fixed-temperature edges the conduction flux λ∇θ·n of the adjacent element is used
 * (needs `materials` by region id); edges without a condition are insulated (0).
 */
export function heatFlowAcrossEdges(
  result: RunResult,
  boundaryConditions: BoundaryCondition[],
  series: Record<string, SeriesEvaluator>,
  edgeRefs: EdgeRef[],
  t: number,
  materials?: Record<string, MaterialEvaluator>,
): HeatFlowResult {
  const mesh = result.mesh;
  const field = fieldAtTime(result, t);
  const wanted = new Set(edgeRefs.map(edgeKey));
  const bcByKey = new Map<string, BoundaryCondition>();
  for (const bc of boundaryConditions) for (const ref of bc.edgeRefs) bcByKey.set(edgeKey(ref), bc);
  const elemMap = boundaryElementMap(mesh);
  const n = mesh.nodes.length / 2;
  let total = 0, length = 0, skipped = 0;
  for (const seg of mesh.boundary) {
    const key = edgeKey(seg.edgeRef);
    if (!wanted.has(key)) continue;
    const { nodes } = mesh;
    const dx = (nodes[2 * seg.b] - nodes[2 * seg.a]) * MM, dy = (nodes[2 * seg.b + 1] - nodes[2 * seg.a + 1]) * MM;
    const L = Math.hypot(dx, dy);
    length += L;
    const bc = bcByKey.get(key);
    if (!bc || bc.type === 'insulated') continue;
    const ta = field[seg.a], tb = field[seg.b];
    if (bc.type === 'fixed') {
      const mat = materials?.[mesh.regions[seg.regionIndex].id];
      const e = elemMap.get(seg.a < seg.b ? seg.a * n + seg.b : seg.b * n + seg.a);
      if (!mat || e === undefined) {
        skipped++;
        continue;
      }
      // gradient of the linear element (per m)
      const tri = mesh.triangles;
      const i0 = tri[3 * e], i1 = tri[3 * e + 1], i2 = tri[3 * e + 2];
      const x0 = nodes[2 * i0] * MM, y0 = nodes[2 * i0 + 1] * MM, x1 = nodes[2 * i1] * MM, y1 = nodes[2 * i1 + 1] * MM, x2 = nodes[2 * i2] * MM, y2 = nodes[2 * i2 + 1] * MM;
      const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      const gx = ((y1 - y2) * field[i0] + (y2 - y0) * field[i1] + (y0 - y1) * field[i2]) / det;
      const gy = ((x2 - x1) * field[i0] + (x0 - x2) * field[i1] + (x1 - x0) * field[i2]) / det;
      // outward normal of a→b with the body on the left
      const nx = dy / L, ny = -dx / L;
      const lam = mat.lambda((ta + tb) / 2);
      total += lam * (gx * nx + gy * ny) * L; // λ ∇θ·n_out > 0 → heat flows inward
      continue;
    }
    let q = 0;
    for (let g = 0; g < 2; g++) {
      const xi = g === 0 ? -GAUSS : GAUSS;
      const ts = 0.5 * (1 - xi) * ta + 0.5 * (1 + xi) * tb;
      if (bc.type === 'convection') {
        const alpha = bc.alpha ?? (bc.surfaceResistance ? 1 / bc.surfaceResistance : 0);
        q += 0.5 * alpha * ((series[bc.airSeriesId]?.at(t) ?? ts) - ts);
      } else if (bc.type === 'convection-radiation') {
        const tg = series[bc.gasSeriesId]?.at(t) ?? ts;
        const tr = bc.radiationSeriesId ? series[bc.radiationSeriesId]?.at(t) ?? tg : tg;
        const epsM = bc.epsM ?? materials?.[mesh.regions[seg.regionIndex].id]?.emissivity ?? 0.8;
        const Tr = tr + K0, Ts = ts + K0;
        q += 0.5 * (bc.alphaC * (tg - ts) + bc.phi * epsM * bc.epsF * SIGMA * (Tr ** 4 - Ts ** 4));
      } else if (bc.type === 'flux') {
        q += 0.5 * (series[bc.fluxSeriesId]?.at(t) ?? 0);
      }
    }
    total += q * L;
  }
  return { total, length, meanFlux: length > 0 ? total / length : 0, skipped };
}

export interface SurfaceTemperatures {
  min: number;
  max: number;
  /** Length-weighted mean, °C. */
  mean: number;
  /** Total length, m. */
  length: number;
}

/** Surface temperature statistics on the given edges at time t. */
export function surfaceTemperatures(result: RunResult, edgeRefs: EdgeRef[], t: number): SurfaceTemperatures {
  const mesh = result.mesh;
  const field = fieldAtTime(result, t);
  const wanted = new Set(edgeRefs.map(edgeKey));
  let min = Infinity, max = -Infinity, sum = 0, length = 0;
  for (const seg of mesh.boundary) {
    if (!wanted.has(edgeKey(seg.edgeRef))) continue;
    const ta = field[seg.a], tb = field[seg.b];
    const L = Math.hypot(mesh.nodes[2 * seg.b] - mesh.nodes[2 * seg.a], mesh.nodes[2 * seg.b + 1] - mesh.nodes[2 * seg.a + 1]) * MM;
    min = Math.min(min, ta, tb);
    max = Math.max(max, ta, tb);
    sum += 0.5 * (ta + tb) * L;
    length += L;
  }
  return { min, max, mean: length > 0 ? sum / length : NaN, length };
}

/** U-value W/m²K from a heat flow Q (W/m) through a length L (m) with temperature difference Δθ. */
export function uValue(heatFlow: number, length: number, thetaInside: number, thetaOutside: number): number {
  const d = thetaInside - thetaOutside;
  if (length <= 0 || d === 0) return NaN;
  return Math.abs(heatFlow) / (length * Math.abs(d));
}

/** Linear thermal transmittance ψ = L2D − Σ Uᵢ·lᵢ (EN ISO 10211), with L2D = |Q| / Δθ in W/mK; lᵢ in m. */
export function psiValue(heatFlow: number, thetaInside: number, thetaOutside: number, parts: { u: number; l: number }[]): number {
  const d = Math.abs(thetaInside - thetaOutside);
  if (d === 0) return NaN;
  const l2d = Math.abs(heatFlow) / d;
  return l2d - parts.reduce((s, p) => s + p.u * p.l, 0);
}

/** Temperature factor f_Rsi = (θ_si − θ_e) / (θ_i − θ_e) (EN ISO 13788). */
export function fRsi(thetaSurfaceInsideMin: number, thetaInside: number, thetaOutside: number): number {
  const d = thetaInside - thetaOutside;
  if (d === 0) return NaN;
  return (thetaSurfaceInsideMin - thetaOutside) / d;
}
