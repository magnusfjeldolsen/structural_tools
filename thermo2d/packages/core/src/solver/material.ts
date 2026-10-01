import type { MaterialTableRow } from '../model/types.js';
import type { MaterialEvaluator } from './types.js';

/** Constant-property material. λ W/mK, cp J/kgK, ρ kg/m³. Enthalpy reference: H(0 °C) = 0. */
export function constantMaterial(
  lambda: number,
  cp: number,
  rho: number,
  emissivity = 0.8,
  name = 'constant',
): MaterialEvaluator {
  const rc = rho * cp;
  return {
    name,
    emissivity,
    validRange: [-273, 5000],
    isConstant: true,
    lambda: () => lambda,
    rhoCp: () => rc,
    enthalpy: (theta) => rc * theta,
  };
}

const T_MIN = -100;
const T_MAX = 1500;
const T_STEP = 1; // °C per table cell

/**
 * Tabulated material: rows (θ, λ, cp, ρ) linearly interpolated, held constant
 * outside the table. Enthalpy is the cumulative trapezoid integral of ρ·cp on a
 * 1 °C grid, so a step across a specific-heat peak captures the whole peak.
 * Uniform-grid tables make every evaluation O(1).
 */
export function tableMaterial(rows: MaterialTableRow[], emissivity = 0.8, name = 'table'): MaterialEvaluator {
  const sorted = rows.slice().sort((a, b) => a.theta - b.theta);
  if (sorted.length === 0) throw new Error(`Material "${name}" has no table rows`);
  const cells = Math.round((T_MAX - T_MIN) / T_STEP) + 1;
  const lam = new Float64Array(cells);
  const rc = new Float64Array(cells);
  const H = new Float64Array(cells);
  let j = 0;
  for (let i = 0; i < cells; i++) {
    const th = T_MIN + i * T_STEP;
    while (j < sorted.length - 2 && sorted[j + 1].theta <= th) j++;
    const a = sorted[j], b = sorted[Math.min(j + 1, sorted.length - 1)];
    let f = 0;
    if (b.theta > a.theta) f = Math.min(1, Math.max(0, (th - a.theta) / (b.theta - a.theta)));
    if (th <= sorted[0].theta) f = 0;
    if (th >= sorted[sorted.length - 1].theta) f = 1;
    lam[i] = a.lambda + f * (b.lambda - a.lambda);
    const cp = a.cp + f * (b.cp - a.cp);
    const rho = a.rho + f * (b.rho - a.rho);
    rc[i] = rho * cp;
  }
  // cumulative trapezoid, reference H(0 °C) = 0
  const i0 = Math.round((0 - T_MIN) / T_STEP);
  H[0] = 0;
  for (let i = 1; i < cells; i++) H[i] = H[i - 1] + 0.5 * (rc[i - 1] + rc[i]) * T_STEP;
  const H0 = H[i0];
  for (let i = 0; i < cells; i++) H[i] -= H0;
  const thetaMin = sorted[0].theta, thetaMax = sorted[sorted.length - 1].theta;

  const lookup = (tab: Float64Array, theta: number): number => {
    const x = (theta - T_MIN) / T_STEP;
    if (x <= 0) return tab[0];
    if (x >= cells - 1) return tab[cells - 1];
    const i = Math.floor(x);
    const f = x - i;
    return tab[i] + f * (tab[i + 1] - tab[i]);
  };
  return {
    name,
    emissivity,
    validRange: [thetaMin, thetaMax],
    isConstant: false,
    lambda: (theta) => lookup(lam, theta),
    rhoCp: (theta) => lookup(rc, theta),
    enthalpy: (theta) => {
      if (theta <= T_MIN) return H[0] + rc[0] * (theta - T_MIN);
      if (theta >= T_MAX) return H[cells - 1] + rc[cells - 1] * (theta - T_MAX);
      return lookup(H, theta);
    },
  };
}

/**
 * Normal-weight concrete per EN 1992-1-2 §3.3 as a table (used by the bench and tests;
 * the library module has the released, cited version).
 * λ lower: 1.36 − 0.136(θ/100) + 0.0057(θ/100)²; upper: 2 − 0.2451(θ/100) + 0.0107(θ/100)² [§3.3.3]
 * cp: 900 (20–100), 900+(θ−100) (100–200), 1000+(θ−200)/2 (200–400), 1100 (400–1200) [§3.3.2(1)],
 * moisture peak cp,peak between 100 and 115 °C, linear to 1000 at 200 °C [§3.3.2(2)]:
 * 1470 (1.5 %), 2020 (3 %), 5600 (10 %), interpolated linearly for other contents.
 * ρ: ρ(20) up to 115 °C, then ×(1−0.02(θ−115)/85) to 200, ×(0.98−0.03(θ−200)/200) to 400,
 * ×(0.95−0.07(θ−400)/800) to 1200 [§3.3.2(3)].
 */
export function concreteEn1992Rows(moisturePct = 1.5, conductivity: 'lower' | 'upper' = 'lower', rho20 = 2300): MaterialTableRow[] {
  const rows: MaterialTableRow[] = [];
  const peak = moisturePeak(moisturePct);
  const thetas: number[] = [];
  for (let t = 0; t <= 1200; t += 5) thetas.push(t);
  for (const t of [100, 115, 200, 400]) if (!thetas.includes(t)) thetas.push(t);
  thetas.sort((a, b) => a - b);
  for (const th of thetas) {
    const x = th / 100;
    const lambda = conductivity === 'lower' ? 1.36 - 0.136 * x + 0.0057 * x * x : 2 - 0.2451 * x + 0.0107 * x * x;
    let cp: number;
    if (th <= 100) cp = 900;
    else if (th <= 115) cp = peak;
    else if (th <= 200) cp = peak + ((1000 - peak) * (th - 115)) / 85;
    else if (th <= 400) cp = 1000 + (th - 200) / 2;
    else cp = 1100;
    if (th > 100 && th <= 115 && peak < 900 + (th - 100)) cp = 900 + (th - 100);
    let rho: number;
    if (th <= 115) rho = rho20;
    else if (th <= 200) rho = rho20 * (1 - (0.02 * (th - 115)) / 85);
    else if (th <= 400) rho = rho20 * (0.98 - (0.03 * (th - 200)) / 200);
    else rho = rho20 * (0.95 - (0.07 * (th - 400)) / 800);
    rows.push({ theta: th, lambda, cp, rho });
  }
  // the dry curve continues to rise between 100 and 200 (900→1000); the peak must not sit below it
  return rows;
}

function moisturePeak(u: number): number {
  const pts: [number, number][] = [
    [0, 900],
    [1.5, 1470],
    [3, 2020],
    [10, 5600],
  ];
  if (u <= 0) return 900;
  if (u >= 10) return 5600;
  for (let i = 0; i < pts.length - 1; i++) {
    if (u >= pts[i][0] && u <= pts[i + 1][0]) {
      const f = (u - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + f * (pts[i + 1][1] - pts[i][1]);
    }
  }
  return 900;
}

/** Carbon steel per EN 1993-1-2 §3.4.1: λ = 54 − 0.0333θ (≤ 800 °C) else 27.3; cp piecewise with the 735 °C peak; ρ = 7850. */
export function steelEn1993Rows(rho = 7850): MaterialTableRow[] {
  const rows: MaterialTableRow[] = [];
  const thetas: number[] = [];
  for (let t = 0; t <= 1200; t += 5) thetas.push(t);
  for (const t of [600, 735, 800, 900]) if (!thetas.includes(t)) thetas.push(t);
  for (let t = 700; t <= 760; t += 1) if (!thetas.includes(t)) thetas.push(t);
  thetas.sort((a, b) => a - b);
  for (const th of thetas) {
    const lambda = th <= 800 ? 54 - 0.0333 * th : 27.3;
    let cp: number;
    if (th < 20) cp = 425 + 0.773 * 20 - 1.69e-3 * 400 + 2.22e-6 * 8000;
    else if (th < 600) cp = 425 + 0.773 * th - 1.69e-3 * th * th + 2.22e-6 * th * th * th;
    else if (th < 735) cp = 666 + 13002 / (738 - th);
    else if (th < 900) cp = 545 + 17820 / (th - 731);
    else cp = 650;
    rows.push({ theta: th, lambda, cp, rho });
  }
  return rows;
}
