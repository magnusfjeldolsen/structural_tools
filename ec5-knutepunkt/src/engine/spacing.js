// Minste avstander for dybeltype-festemidler.
// Tabell 8.2 (spiker), tabell 8.4 (bolter), tabell 8.5 (dybler), 8.7.1(5)/tabell 8.6 (skruer).
// α = vinkel mellom kraft og fiberretning. Retur i mm.

const rad = (deg) => (deg * Math.PI) / 180;

export function minSpacings(rules, f, alpha, predrilled, rho_k) {
  const d = rules.d;
  const a = rad(alpha);
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  let ref;
  const out = {};
  if (rules.rule === 'nail') {
    if (f.type === 'screw') ref = 'EC5 8.7.1(5) → tabell 8.2 (skruer med d_ef ≤ 6 mm)';
    else ref = 'EC5 tabell 8.2';
    if (predrilled) {
      out.a1 = (4 + c) * d; out.a2 = (3 + s) * d;
      out.a3t = (7 + 5 * c) * d; out.a3c = 7 * d;
      out.a4t = (d < 5 ? 3 + 2 * s : 3 + 4 * s) * d; out.a4c = 3 * d;
      ref += ' (forboret)';
    } else {
      const hi = rho_k > 420; // ρ_k > 420 kg/m³: økte avstander
      const m = hi ? 1.4 : 1; // Tabell 8.2 har egne kolonner; tilnærmet med faktor i mangel av fulle uttrykk
      out.a1 = (d < 5 ? 5 + 5 * c : 5 + 7 * c) * d * m; out.a2 = 5 * d * m;
      out.a3t = (10 + 5 * c) * d * m; out.a3c = 10 * d * m;
      out.a4t = (d < 5 ? 5 + 2 * s : 5 + 5 * s) * d * m; out.a4c = 5 * d * m;
      ref += ' (ikke forboret' + (hi ? ', ρ_k > 420: økt ca. 40 %, verifiser mot tabell' : '') + ')';
    }
  } else if (f.type === 'dowel') {
    ref = 'EC5 tabell 8.5';
    out.a1 = (3 + 2 * c) * d; out.a2 = 3 * d;
    out.a3t = Math.max(7 * d, 80); out.a3c = boltA3c(alpha, d);
    out.a4t = Math.max((2 + 2 * s) * d, 3 * d); out.a4c = 3 * d;
  } else {
    ref = f.type === 'screw' ? 'EC5 8.7.1(4) → tabell 8.4 (skruer med d_ef > 6 mm)' : 'EC5 tabell 8.4';
    out.a1 = (4 + c) * d; out.a2 = 4 * d;
    out.a3t = Math.max(7 * d, 80); out.a3c = boltA3c(alpha, d);
    out.a4t = Math.max((2 + 2 * s) * d, 3 * d); out.a4c = 3 * d;
  }
  return { ...out, ref, d };
}

function boltA3c(alpha, d) {
  // Tabell 8.4/8.5, ubelastet ende. α her er vinkel kraft/fiber, ende belastet mot 180°-siden.
  const s = Math.abs(Math.sin(rad(alpha)));
  if (alpha >= 60) return Math.max((1 + 6 * s) * d, 4 * d);
  return 4 * d;
}

export const SPACING_LABELS = {
  a1: 'a₁ – avstand i rad, parallelt fibrene',
  a2: 'a₂ – avstand mellom rader, på tvers av fibrene',
  a3t: 'a₃,t – avstand til belastet ende',
  a3c: 'a₃,c – avstand til ubelastet ende',
  a4t: 'a₄,t – avstand til belastet kant',
  a4c: 'a₄,c – avstand til ubelastet kant',
};

export function checkSpacings(min, pattern) {
  return ['a1', 'a2', 'a3t', 'a3c', 'a4t', 'a4c'].map((k) => {
    const na = (k === 'a1' && pattern.n1 <= 1) || (k === 'a2' && pattern.n2 <= 1);
    return { key: k, label: SPACING_LABELS[k], min: min[k], actual: pattern[k], ok: na || pattern[k] + 1e-9 >= min[k], na, ref: min.ref };
  });
}
