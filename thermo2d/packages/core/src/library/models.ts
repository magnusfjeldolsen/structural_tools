/**
 * Material property models: θ (°C) → λ (W/mK), cp (J/kgK), ρ (kg/m³).
 * Formulas transcribed from EN 1992-1-2 §3.3, EN 1993-1-2 §3.4, EN 1995-1-2
 * Annex B and EN ISO 6946 Table 7. Every function documents its source.
 */
import type { Material, MaterialModel, MaterialTableRow } from '../model/types.js';
import type { MaterialEvaluator } from '../solver/types.js';

export interface Properties {
  lambda: number;
  cp: number;
  rho: number;
}

/** Linear interpolation in a sorted [x, y] table, holding the end values. */
export function interpTable(points: readonly (readonly [number, number])[], x: number): number {
  const n = points.length;
  if (n === 0) return NaN;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  if (x1 === x0) return y1;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

// ---------------------------------------------------------------------------
// Concrete, EN 1992-1-2:2004 §3.3
// ---------------------------------------------------------------------------

/** λ_c upper/lower limit, EN 1992-1-2 §3.3.3 (3.1)/(3.2), 20 ≤ θ ≤ 1200 °C. */
export function concreteLambda(theta: number, bound: 'lower' | 'upper'): number {
  const t = Math.min(Math.max(theta, 20), 1200) / 100;
  return bound === 'upper' ? 2 - 0.2451 * t + 0.0107 * t * t : 1.36 - 0.136 * t + 0.0057 * t * t;
}

/** Base specific heat (dry concrete), EN 1992-1-2 §3.3.2 (3.6a–d). */
export function concreteCpDry(theta: number): number {
  const t = Math.min(Math.max(theta, 20), 1200);
  if (t <= 100) return 900;
  if (t <= 200) return 900 + (t - 100);
  if (t <= 400) return 1000 + (t - 200) / 2;
  return 1100;
}

/** Peak specific heat for moisture content u (% by weight), EN 1992-1-2 §3.3.2(2): 1470 (1.5 %), 2020 (3 %), 5600 (10 %). */
export function concreteCpPeak(moisture: number): number {
  const u = Math.max(0, moisture);
  const pts: [number, number][] = [
    [0, 900],
    [1.5, 1470],
    [3, 2020],
    [10, 5600],
  ];
  if (u >= 10) return 5600 + ((u - 10) * (5600 - 2020)) / 7; // extrapolate gently
  return interpTable(pts, u);
}

/** Specific heat including the moisture peak: constant between 100 and 115 °C, linear decrease to the dry curve at 200 °C. */
export function concreteCp(theta: number, moisture: number): number {
  const dry = concreteCpDry(theta);
  if (moisture <= 0) return dry;
  const peak = concreteCpPeak(moisture);
  if (theta < 100 || theta > 200) return dry;
  if (theta <= 115) return peak;
  // 115 → 200: linear from peak to cp(200) = 1000
  return peak + ((1000 - peak) * (theta - 115)) / 85;
}

/** Density ratio ρ(θ)/ρ(20 °C), EN 1992-1-2 §3.3.2(3). */
export function concreteDensityRatio(theta: number): number {
  const t = Math.min(Math.max(theta, 20), 1200);
  if (t <= 115) return 1;
  if (t <= 200) return 1 - (0.02 * (t - 115)) / 85;
  if (t <= 400) return 0.98 - (0.03 * (t - 200)) / 200;
  return 0.95 - (0.07 * (t - 400)) / 800;
}

// ---------------------------------------------------------------------------
// Carbon steel, EN 1993-1-2:2005 §3.4.1
// ---------------------------------------------------------------------------

/** λ_a, EN 1993-1-2 §3.4.1.3. */
export function steelLambda(theta: number): number {
  const t = Math.min(Math.max(theta, 20), 1200);
  return t < 800 ? 54 - 3.33e-2 * t : 27.3;
}

/** c_a, EN 1993-1-2 §3.4.1.2 (peak 5000 J/kgK at 735 °C). */
export function steelCp(theta: number): number {
  const t = Math.min(Math.max(theta, 20), 1200);
  if (t < 600) return 425 + 7.73e-1 * t - 1.69e-3 * t * t + 2.22e-6 * t * t * t;
  if (t < 735) return 666 + 13002 / (738 - t);
  if (t < 900) return 545 + 17820 / (t - 731);
  return 650;
}

// ---------------------------------------------------------------------------
// Timber, EN 1995-1-2:2004 Annex B (Tables B.1 and B.2)
// ---------------------------------------------------------------------------

/** λ of wood and the char layer, Table B.2. */
export function timberLambda(theta: number): number {
  return interpTable(
    [
      [20, 0.12],
      [200, 0.15],
      [350, 0.07],
      [500, 0.09],
      [800, 0.35],
      [1200, 1.5],
    ],
    theta,
  );
}

/** cp of wood and the char layer, Table B.1, with the 99–120 °C evaporation plateau. */
export function timberCp(theta: number): number {
  const t = theta;
  if (t < 20) return 1530;
  if (t < 99) return 1530 + ((1770 - 1530) * (t - 20)) / 79;
  if (t <= 120) return 13600 + ((13500 - 13600) * (t - 99)) / 21;
  return interpTable(
    [
      [120, 2120],
      [200, 2000],
      [250, 1620],
      [300, 710],
      [350, 850],
      [400, 1000],
      [600, 1400],
      [800, 1650],
      [1200, 1650],
    ],
    t,
  );
}

/** Density ratio ρ(θ)/ρ_dry, Table B.1, ω = moisture content as a fraction (0.12 for 12 %). */
export function timberDensityRatio(theta: number, omega: number): number {
  const t = theta;
  if (t <= 99) return 1 + omega;
  if (t <= 120) return 1 + omega + ((1 - (1 + omega)) * (t - 99)) / 21;
  return interpTable(
    [
      [120, 1.0],
      [200, 1.0],
      [250, 0.93],
      [300, 0.76],
      [350, 0.52],
      [400, 0.38],
      [600, 0.28],
      [800, 0.26],
      [1200, 0.0],
    ],
    t,
  );
}

// ---------------------------------------------------------------------------
// Air layers, EN ISO 6946:2017 Table 7 (unventilated), §6.9.3 slightly ventilated
// ---------------------------------------------------------------------------

/** Thermal resistance (m²K/W) of an unventilated air layer by thickness (mm) and heat-flow direction. */
export function airLayerResistance(
  thickness: number,
  direction: 'horizontal' | 'upward' | 'downward',
  ventilation: 'unventilated' | 'slightly' = 'unventilated',
): number {
  const col = direction === 'horizontal' ? 1 : direction === 'upward' ? 2 : 3;
  // thickness mm | horizontal | upward | downward
  const rows: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [5, 0.11, 0.11, 0.11],
    [7, 0.13, 0.13, 0.13],
    [10, 0.15, 0.15, 0.15],
    [15, 0.17, 0.16, 0.17],
    [25, 0.18, 0.16, 0.19],
    [50, 0.18, 0.16, 0.21],
    [100, 0.18, 0.16, 0.22],
    [300, 0.18, 0.16, 0.23],
  ];
  const r = interpTable(
    rows.map((row) => [row[0], row[col]] as [number, number]),
    thickness,
  );
  return ventilation === 'slightly' ? r / 2 : r;
}

// ---------------------------------------------------------------------------
// Generic evaluation
// ---------------------------------------------------------------------------

function tableRows(rows: MaterialTableRow[]): { l: [number, number][]; c: [number, number][]; r: [number, number][] } {
  const sorted = [...rows].sort((a, b) => a.theta - b.theta);
  return {
    l: sorted.map((x) => [x.theta, x.lambda]),
    c: sorted.map((x) => [x.theta, x.cp]),
    r: sorted.map((x) => [x.theta, x.rho]),
  };
}

/** Evaluate λ, cp, ρ of any material model at θ (°C). */
export function evaluateModel(model: MaterialModel, theta: number): Properties {
  switch (model.kind) {
    case 'constant':
      return { lambda: model.lambda, cp: model.cp, rho: model.rho };
    case 'table': {
      const t = tableRows(model.rows);
      return { lambda: interpTable(t.l, theta), cp: interpTable(t.c, theta), rho: interpTable(t.r, theta) };
    }
    case 'concrete-en1992-1-2':
      return {
        lambda: concreteLambda(theta, model.conductivity),
        cp: concreteCp(theta, model.moisture),
        rho: model.rho20 * concreteDensityRatio(theta),
      };
    case 'steel-en1993-1-2':
      return { lambda: steelLambda(theta), cp: steelCp(theta), rho: model.rho };
    case 'timber-en1995-1-2': {
      const omega = model.moisture / 100;
      // Floor the density at 1 % of ρ0 so the capacity never vanishes (Table B.1 reaches 0 at 1200 °C).
      const rho = Math.max(model.rho0 * timberDensityRatio(theta, omega), 0.01 * model.rho0);
      return { lambda: timberLambda(theta), cp: timberCp(theta), rho };
    }
    case 'air-layer-iso6946': {
      const R = airLayerResistance(model.thickness, model.direction, model.ventilation);
      const lambda = R > 0 ? model.thickness / 1000 / R : 0.025;
      return { lambda, cp: 1008, rho: 1.2 };
    }
  }
}

export function evaluateMaterial(m: Material, theta: number): Properties {
  return evaluateModel(m.model, theta);
}

const H_MIN = -50;
const H_MAX = 1300;

/**
 * Compile a material into fast evaluators. Enthalpy H(θ) = ∫₀^θ ρ(θ')cp(θ') dθ' (J/m³) is
 * precomputed with the trapezoid rule on a 1 °C grid from −50 to 1300 °C, so the
 * moisture / evaporation peaks are integrated, not sampled. Between grid points H is linear.
 */
export function compileMaterial(m: Material): MaterialEvaluator {
  const model = m.model;
  const n = H_MAX - H_MIN + 1;
  const rc = new Float64Array(n);
  const lam = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = evaluateModel(model, H_MIN + i);
    rc[i] = p.rho * p.cp;
    lam[i] = p.lambda;
  }
  const H = new Float64Array(n);
  for (let i = 1; i < n; i++) H[i] = H[i - 1] + 0.5 * (rc[i - 1] + rc[i]);
  const H0 = H[0 - H_MIN];
  for (let i = 0; i < n; i++) H[i] -= H0;

  const idx = (theta: number): [number, number] => {
    if (!(theta > H_MIN)) return [0, 0];
    if (theta >= H_MAX) return [n - 1, 0];
    const x = theta - H_MIN;
    const i = Math.floor(x);
    return [i, x - i];
  };
  const isConstant = model.kind === 'constant';
  const c0 = isConstant ? evaluateModel(model, 20) : null;

  return {
    name: m.name,
    emissivity: m.emissivity,
    validRange: m.validRange,
    isConstant,
    lambda(theta: number): number {
      if (c0) return c0.lambda;
      const [i, f] = idx(theta);
      return i >= n - 1 ? lam[n - 1] : lam[i] + f * (lam[i + 1] - lam[i]);
    },
    rhoCp(theta: number): number {
      if (c0) return c0.rho * c0.cp;
      const [i, f] = idx(theta);
      return i >= n - 1 ? rc[n - 1] : rc[i] + f * (rc[i + 1] - rc[i]);
    },
    enthalpy(theta: number): number {
      if (c0) return c0.rho * c0.cp * theta;
      if (theta <= H_MIN) return H[0] + rc[0] * (theta - H_MIN);
      if (theta >= H_MAX) return H[n - 1] + rc[n - 1] * (theta - H_MAX);
      const [i, f] = idx(theta);
      // exact integral of the linear ρcp between grid points
      const a = rc[i];
      const b = rc[i + 1];
      return H[i] + f * a + 0.5 * f * f * (b - a);
    },
  };
}
