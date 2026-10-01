import { describe, expect, it } from 'vitest';
import type { Material } from '../../src/model/types.js';
import {
  airLayerResistance,
  compileMaterial,
  concreteCp,
  concreteDensityRatio,
  concreteLambda,
  evaluateMaterial,
  steelCp,
  steelLambda,
  timberCp,
  timberDensityRatio,
  timberLambda,
} from '../../src/library/index.js';

const mat = (model: Material['model'], name = 'm'): Material => ({
  id: name,
  name,
  category: 'custom',
  model,
  emissivity: 0.8,
  validRange: [20, 1200],
  source: { text: 'test' },
  quality: 'user',
  tags: [],
  origin: 'user',
});

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('EN 1992-1-2 concrete (validation case 4)', () => {
  it('λ upper/lower at tabulated temperatures (Figure 3.7)', () => {
    // values from the formulas at 20, 100, 400, 800, 1200 °C
    expect(rel(concreteLambda(20, 'upper'), 1.9514)).toBeLessThan(0.005);
    expect(rel(concreteLambda(20, 'lower'), 1.3330)).toBeLessThan(0.005);
    expect(rel(concreteLambda(100, 'upper'), 1.7656)).toBeLessThan(0.005);
    expect(rel(concreteLambda(400, 'lower'), 0.9072)).toBeLessThan(0.005);
    expect(rel(concreteLambda(800, 'upper'), 0.724)).toBeLessThan(0.005);
    expect(rel(concreteLambda(1200, 'lower'), 0.5488)).toBeLessThan(0.005);
    // below 20 °C held at the 20 °C value
    expect(concreteLambda(-10, 'lower')).toBeCloseTo(concreteLambda(20, 'lower'), 10);
  });

  it('cp dry follows §3.3.2 (3.6a–d)', () => {
    expect(concreteCp(20, 0)).toBe(900);
    expect(concreteCp(100, 0)).toBe(900);
    expect(concreteCp(150, 0)).toBe(950);
    expect(concreteCp(200, 0)).toBe(1000);
    expect(concreteCp(300, 0)).toBe(1050);
    expect(concreteCp(400, 0)).toBe(1100);
    expect(concreteCp(1000, 0)).toBe(1100);
  });

  it('moisture peak: 1470 (1.5 %), 2020 (3 %), 5600 (10 %) between 100 and 115 °C, linear to 1000 at 200 °C', () => {
    expect(concreteCp(105, 1.5)).toBe(1470);
    expect(concreteCp(115, 3)).toBe(2020);
    expect(concreteCp(100, 10)).toBe(5600);
    expect(concreteCp(200, 3)).toBeCloseTo(1000, 9);
    // midway 115 → 200 for u = 1.5 %: 1470 + (1000 − 1470)·0.5
    expect(concreteCp(157.5, 1.5)).toBeCloseTo(1235, 9);
    // interpolated moisture 2.25 % → midway between 1470 and 2020
    expect(concreteCp(110, 2.25)).toBeCloseTo(1745, 9);
    expect(concreteCp(99, 3)).toBe(900);
    expect(concreteCp(201, 3)).toBeCloseTo(1000.5, 9);
  });

  it('density ratio §3.3.2(3)', () => {
    expect(concreteDensityRatio(20)).toBe(1);
    expect(concreteDensityRatio(115)).toBe(1);
    expect(concreteDensityRatio(200)).toBeCloseTo(0.98, 9);
    expect(concreteDensityRatio(400)).toBeCloseTo(0.95, 9);
    expect(concreteDensityRatio(1200)).toBeCloseTo(0.88, 9);
  });

  it('evaluateMaterial for the concrete model uses ρ20', () => {
    const m = mat({ kind: 'concrete-en1992-1-2', aggregate: 'siliceous', moisture: 1.5, conductivity: 'lower', rho20: 2400 });
    const p = evaluateMaterial(m, 300);
    expect(p.rho).toBeCloseTo(2400 * 0.965, 6);
    expect(p.cp).toBe(1050);
    expect(p.lambda).toBeCloseTo(concreteLambda(300, 'lower'), 12);
  });
});

describe('EN 1993-1-2 steel', () => {
  it('λ and cp at reference temperatures', () => {
    expect(steelLambda(20)).toBeCloseTo(53.334, 3);
    expect(steelLambda(800)).toBe(27.3);
    expect(steelLambda(1000)).toBe(27.3);
    expect(steelCp(20)).toBeCloseTo(439.8, 0);
    expect(steelCp(600)).toBeCloseTo(760.2, 0); // 666 + 13002/138
    expect(steelCp(900)).toBe(650);
  });
  it('cp peaks near 735 °C at about 5000 J/kgK', () => {
    let best = 0;
    let at = 0;
    for (let t = 700; t <= 760; t += 0.5) {
      const v = steelCp(t);
      if (v > best) {
        best = v;
        at = t;
      }
    }
    expect(at).toBeGreaterThan(733);
    expect(at).toBeLessThan(737);
    expect(best).toBeGreaterThan(4500);
    expect(best).toBeLessThan(5200);
  });
});

describe('EN 1995-1-2 Annex B timber', () => {
  it('table values', () => {
    expect(timberLambda(20)).toBe(0.12);
    expect(timberLambda(350)).toBe(0.07);
    expect(timberLambda(1200)).toBe(1.5);
    expect(timberCp(20)).toBe(1530);
    expect(timberCp(99)).toBe(13600);
    expect(timberCp(120)).toBe(13500);
    expect(timberCp(121)).toBeCloseTo(2120 - 1.5, 0);
    expect(timberCp(300)).toBe(710);
    expect(timberDensityRatio(20, 0.12)).toBe(1.12);
    expect(timberDensityRatio(120, 0.12)).toBe(1);
    expect(timberDensityRatio(300, 0.12)).toBe(0.76);
    expect(timberDensityRatio(1200, 0.12)).toBe(0);
  });
  it('density is floored at 1 % of ρ0 in the evaluator', () => {
    const m = mat({ kind: 'timber-en1995-1-2', rho0: 450, moisture: 12 });
    expect(evaluateMaterial(m, 1200).rho).toBeCloseTo(4.5, 9);
    expect(evaluateMaterial(m, 20).rho).toBeCloseTo(504, 9);
  });
});

describe('EN ISO 6946 air layers', () => {
  it('Table 7 values and interpolation', () => {
    expect(airLayerResistance(25, 'horizontal')).toBe(0.18);
    expect(airLayerResistance(25, 'downward')).toBe(0.19);
    expect(airLayerResistance(100, 'upward')).toBe(0.16);
    expect(airLayerResistance(20, 'horizontal')).toBeCloseTo(0.175, 9);
    expect(airLayerResistance(25, 'horizontal', 'slightly')).toBe(0.09);
    const m = mat({ kind: 'air-layer-iso6946', thickness: 25, direction: 'horizontal', ventilation: 'unventilated' });
    expect(evaluateMaterial(m, 20).lambda).toBeCloseTo(0.025 / 0.18, 9);
  });
});

describe('compileMaterial', () => {
  it('constant material: enthalpy linear, isConstant flag', () => {
    const ev = compileMaterial(mat({ kind: 'constant', lambda: 1.5, cp: 1000, rho: 2000 }));
    expect(ev.isConstant).toBe(true);
    expect(ev.lambda(500)).toBe(1.5);
    expect(ev.rhoCp(500)).toBe(2e6);
    expect(ev.enthalpy(100)).toBeCloseTo(2e8, 6);
    expect(ev.enthalpy(-20)).toBeCloseTo(-4e7, 6);
  });

  it('enthalpy is monotonic and equals ∫ρcp for the concrete model (with moisture peak)', () => {
    const m = mat({ kind: 'concrete-en1992-1-2', aggregate: 'siliceous', moisture: 3, conductivity: 'lower', rho20: 2300 });
    const ev = compileMaterial(m);
    expect(ev.isConstant).toBeFalsy();
    let prev = ev.enthalpy(-50);
    for (let t = -49; t <= 1300; t += 1) {
      const h = ev.enthalpy(t);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
    // numeric integral with fine steps between 90 and 130 °C (across the peak)
    let integral = 0;
    const dt = 0.01;
    for (let t = 90; t < 130; t += dt) {
      const p1 = evaluateMaterial(m, t);
      const p2 = evaluateMaterial(m, t + dt);
      integral += 0.5 * (p1.rho * p1.cp + p2.rho * p2.cp) * dt;
    }
    const dH = ev.enthalpy(130) - ev.enthalpy(90);
    // The 1 °C enthalpy grid smears the cp jump at exactly 100 °C over one degree (half a degree of
    // peak energy, < 1 % of ΔH over 90–130 °C); physically negligible, so 1 % is the tolerance here.
    expect(rel(dH, integral)).toBeLessThan(1e-2);
    // the peak adds energy: compare with the dry material
    const dry = compileMaterial(mat({ kind: 'concrete-en1992-1-2', aggregate: 'siliceous', moisture: 0, conductivity: 'lower', rho20: 2300 }));
    const extra = dH - (dry.enthalpy(130) - dry.enthalpy(90));
    expect(extra).toBeGreaterThan(2300 * 1000 * 15); // at least 15 K worth of the 2020 peak
    // rhoCp and lambda interpolate the model
    expect(rel(ev.rhoCp(300), 2300 * 0.965 * 1050)).toBeLessThan(1e-3);
    expect(rel(ev.lambda(650.5), concreteLambda(650.5, 'lower'))).toBeLessThan(1e-3);
    expect(ev.enthalpy(0)).toBe(0);
  });

  it('table model holds end values and interpolates', () => {
    const ev = compileMaterial(
      mat({
        kind: 'table',
        rows: [
          { theta: 0, lambda: 1, cp: 1000, rho: 1000 },
          { theta: 100, lambda: 2, cp: 2000, rho: 1000 },
        ],
      }),
    );
    expect(ev.lambda(50)).toBeCloseTo(1.5, 9);
    expect(ev.lambda(500)).toBe(2);
    expect(ev.rhoCp(-100)).toBe(1e6);
  });
});
