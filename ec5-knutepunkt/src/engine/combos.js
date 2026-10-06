// Lastkombinasjoner i bruddgrensetilstand (STR) etter NS-EN 1990:2002+A1:2005+NA:2016.
// Norge benytter ligningssettet (6.10a) og (6.10b) med verdier fra tabell NA.A1.2(B):
//   (6.10a): Σ γ_G,j·G_k,j  "+"  γ_Q,1·ψ_0,1·Q_k,1  "+"  Σ γ_Q,i·ψ_0,i·Q_k,i        γ_G = 1,35
//   (6.10b): Σ ξ·γ_G,j·G_k,j "+" γ_Q,1·Q_k,1        "+"  Σ γ_Q,i·ψ_0,i·Q_k,i        ξ·γ_G = 0,89·1,35 = 1,20
//   γ_Q = 1,5. Ugunstig/gunstig egenlast: γ_G,inf = 1,0 (ikke behandlet her; alle G antas ugunstig).
//
// Lastvarighetsklassen for en kombinasjon bestemmes av lasten med kortest varighet
// (NS-EN 1995-1-1 3.1.3(2)).
//
// Hver last er en kraftvektor i knutepunktets plan: (Fx, Fy) i kN, der x er fiberretning
// i hoveddel 1 (t₁) og y er på tvers. Vinkelen α_i for del i beregnes fra resultanten.

import { LOAD_CATEGORIES, DURATION_ORDER } from './materials.js';

export const GAMMA = { G_sup: 1.35, xi: 0.89, Q: 1.5, ref: 'NS-EN 1990 tabell NA.A1.2(B)' };

export function ulsCombinations(loads) {
  const G = loads.filter((l) => LOAD_CATEGORIES[l.category].permanent);
  const Q = loads.filter((l) => !LOAD_CATEGORIES[l.category].permanent);
  const combos = [];
  const sumG = (gamma) => G.reduce((acc, l) => ({ x: acc.x + gamma * l.Fx, y: acc.y + gamma * l.Fy, terms: [...acc.terms, `${gamma.toFixed(2)}·${l.name}`] }), { x: 0, y: 0, terms: [] });

  const durationOf = (list) => {
    const idx = Math.max(0, ...list.map((l) => DURATION_ORDER.indexOf(LOAD_CATEGORIES[l.category].duration)));
    return DURATION_ORDER[idx];
  };

  // (6.10a): alle variable med ψ0
  {
    const g = sumG(GAMMA.G_sup);
    let x = g.x, y = g.y; const terms = [...g.terms];
    Q.forEach((l) => { const psi = LOAD_CATEGORIES[l.category].psi0; x += GAMMA.Q * psi * l.Fx; y += GAMMA.Q * psi * l.Fy; terms.push(`${GAMMA.Q}·${psi}·${l.name}`); });
    combos.push({ id: 'K1', eq: '6.10a', label: 'Egenlast dominerende', terms, Fx: x, Fy: y, duration: durationOf([...G, ...Q]), ref: 'NS-EN 1990 lign. (6.10a), NA.A1.2(B)' });
  }
  // (6.10b): hver variabel som dominerende
  Q.forEach((dom, i) => {
    const g = sumG(GAMMA.xi * GAMMA.G_sup);
    let x = g.x, y = g.y; const terms = [...g.terms];
    x += GAMMA.Q * dom.Fx; y += GAMMA.Q * dom.Fy; terms.push(`${GAMMA.Q}·${dom.name}`);
    Q.filter((l) => l !== dom).forEach((l) => { const psi = LOAD_CATEGORIES[l.category].psi0; x += GAMMA.Q * psi * l.Fx; y += GAMMA.Q * psi * l.Fy; terms.push(`${GAMMA.Q}·${psi}·${l.name}`); });
    combos.push({ id: `K${i + 2}`, eq: '6.10b', label: `${dom.name} dominerende`, terms, Fx: x, Fy: y, duration: durationOf([...G, ...Q]), ref: 'NS-EN 1990 lign. (6.10b), NA.A1.2(B), ξ = 0,89' });
  });
  if (Q.length === 0) {
    // Kun egenlast: 6.10b uten variable laster er også relevant, men 6.10a er strengere. Behold K1.
  }
  return combos.map((c) => ({ ...c, F: Math.hypot(c.Fx, c.Fy), alpha: angleToGrain(c.Fx, c.Fy) }));
}

// Bruksgrense, karakteristisk kombinasjon (6.14b): Σ G + Q_1 + Σ ψ_0 Q_i (kun til forskyvningsinfo).
export function slsCharacteristic(loads) {
  const G = loads.filter((l) => LOAD_CATEGORIES[l.category].permanent);
  const Q = loads.filter((l) => !LOAD_CATEGORIES[l.category].permanent);
  let best = null;
  const gx = G.reduce((s, l) => s + l.Fx, 0), gy = G.reduce((s, l) => s + l.Fy, 0);
  if (Q.length === 0) return { Fx: gx, Fy: gy, F: Math.hypot(gx, gy), ref: 'NS-EN 1990 lign. (6.14b)' };
  Q.forEach((dom) => {
    let x = gx + dom.Fx, y = gy + dom.Fy;
    Q.filter((l) => l !== dom).forEach((l) => { const psi = LOAD_CATEGORIES[l.category].psi0; x += psi * l.Fx; y += psi * l.Fy; });
    const F = Math.hypot(x, y);
    if (!best || F > best.F) best = { Fx: x, Fy: y, F, ref: 'NS-EN 1990 lign. (6.14b)' };
  });
  return best;
}

// Vinkel mellom kraft og fiberretning (0–90°), x = fiberretning.
export function angleToGrain(Fx, Fy) {
  if (Math.abs(Fx) < 1e-9 && Math.abs(Fy) < 1e-9) return 0;
  const a = Math.atan2(Math.abs(Fy), Math.abs(Fx)) * 180 / Math.PI;
  return Math.round(a * 10) / 10;
}
