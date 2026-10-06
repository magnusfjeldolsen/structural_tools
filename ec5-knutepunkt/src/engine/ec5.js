// Beregningsmotor for dybeltype-forbindelser etter NS-EN 1995-1-1:2004+A1:2008+NA:2010, kapittel 8.
// Motoren er ren (ingen DOM) og returnerer en sporbar beregningsgang («trace») der hvert
// steg har formel, innsatte verdier, resultat og referanse til standardens punkt/ligning.
//
// Enheter: N, mm, N/mm², kg/m³. Vinkler i grader.
//
// Forkortelser i referanser: EC5 = NS-EN 1995-1-1, NA = norsk nasjonalt tillegg.

import { TIMBER, GAMMA_M, KMOD, KMOD_REF, STEEL_PLATE } from './materials.js';
import { minSpacings, checkSpacings } from './spacing.js';

const rad = (deg) => (deg * Math.PI) / 180;
const r2 = (x) => Math.round(x * 100) / 100;

export class Trace {
  constructor() { this.steps = []; this.warnings = []; this.errors = []; }
  add(step) { this.steps.push(step); return step.value; }
  warn(text, ref) { this.warnings.push({ text, ref }); }
  error(text, ref) { this.errors.push({ text, ref }); }
}

// ---------------------------------------------------------------------------
// Festemiddel-regler: hvilke regler (spiker eller bolt) gjelder for festemiddelet?
// ---------------------------------------------------------------------------
export function fastenerRules(f) {
  if (f.type === 'nail') return { rule: 'nail', d: f.d, ref: 'EC5 8.3.1' };
  if (f.type === 'bolt') return { rule: 'bolt', d: f.d, ref: 'EC5 8.5.1' };
  if (f.type === 'dowel') return { rule: 'bolt', d: f.d, ref: 'EC5 8.6 (viser til 8.5.1)' };
  // Treskruer, EC5 8.7.1(2)–(4). Effektiv diameter d_ef = 1,1·d1 (kjernediameter).
  const d_ef = f.d_ef ?? 1.1 * f.d1;
  if (d_ef <= 6) return { rule: 'nail', d: d_ef, ref: 'EC5 8.7.1(2)–(3): d_ef = 1,1·d₁ ≤ 6 mm → spikerregler (8.3.1)' };
  return { rule: 'bolt', d: d_ef, ref: 'EC5 8.7.1(4): d_ef > 6 mm → boltregler (8.5.1); d_ef = 1,1·d₁ benyttet konservativt' };
}

// ---------------------------------------------------------------------------
// Karakteristisk hullkanttrykkstyrke f_h,k
// ---------------------------------------------------------------------------
export function embedmentStrength(tr, tag, timber, rules, alpha, predrilled) {
  const { d } = rules;
  const rho_k = timber.rho_k;
  if (rules.rule === 'nail') {
    if (predrilled) {
      const v = 0.082 * (1 - 0.01 * d) * rho_k;
      return tr.add({ id: `fh_${tag}`, title: `Hullkanttrykkstyrke ${tag}, forboret`, ref: 'EC5 lign. (8.16)',
        formula: 'f_h,k = 0,082·(1 − 0,01·d)·ρ_k', subs: `0,082·(1 − 0,01·${r2(d)})·${rho_k}`, value: v, unit: 'N/mm²' });
    }
    const v = 0.082 * rho_k * Math.pow(d, -0.3);
    return tr.add({ id: `fh_${tag}`, title: `Hullkanttrykkstyrke ${tag}, ikke forboret`, ref: 'EC5 lign. (8.15)',
      formula: 'f_h,k = 0,082·ρ_k·d^−0,3', subs: `0,082·${rho_k}·${r2(d)}^−0,3`, value: v, unit: 'N/mm²' });
  }
  // Boltregler
  const fh0 = 0.082 * (1 - 0.01 * d) * rho_k;
  tr.add({ id: `fh0_${tag}`, title: `Hullkanttrykkstyrke ${tag} parallelt fibrene`, ref: 'EC5 lign. (8.32)',
    formula: 'f_h,0,k = 0,082·(1 − 0,01·d)·ρ_k', subs: `0,082·(1 − 0,01·${r2(d)})·${rho_k}`, value: fh0, unit: 'N/mm²' });
  const k90 = timber.type === 'hardwood' ? 0.90 + 0.015 * d : timber.type === 'lvl' ? 1.30 + 0.015 * d : 1.35 + 0.015 * d;
  tr.add({ id: `k90_${tag}`, title: `Faktor k₉₀ ${tag} (bartre)`, ref: 'EC5 lign. (8.33)',
    formula: 'k₉₀ = 1,35 + 0,015·d', subs: `1,35 + 0,015·${r2(d)}`, value: k90, unit: '' });
  const a = rad(alpha);
  const v = fh0 / (k90 * Math.sin(a) ** 2 + Math.cos(a) ** 2);
  return tr.add({ id: `fh_${tag}`, title: `Hullkanttrykkstyrke ${tag} ved vinkel α = ${alpha}°`, ref: 'EC5 lign. (8.31)',
    formula: 'f_h,α,k = f_h,0,k / (k₉₀·sin²α + cos²α)', subs: `${r2(fh0)} / (${r2(k90)}·sin²${alpha}° + cos²${alpha}°)`, value: v, unit: 'N/mm²' });
}

// ---------------------------------------------------------------------------
// Karakteristisk flytemoment M_y,Rk
// ---------------------------------------------------------------------------
export function yieldMoment(tr, f, rules) {
  if (f.M_yRk_override) {
    return tr.add({ id: 'My', title: 'Flytemoment fra ETA', ref: f.eta || 'Produsentens ETA', formula: 'M_y,Rk = verdi fra ETA', subs: '', value: f.M_yRk_override, unit: 'Nmm' });
  }
  const d = rules.d;
  const ref = rules.rule === 'nail' ? 'EC5 lign. (8.14)' : 'EC5 lign. (8.30)';
  const v = 0.3 * f.f_u * Math.pow(d, 2.6);
  return tr.add({ id: 'My', title: 'Karakteristisk flytemoment', ref,
    formula: 'M_y,Rk = 0,3·f_u·d^2,6', subs: `0,3·${f.f_u}·${r2(d)}^2,6`, value: v, unit: 'Nmm' });
}

// ---------------------------------------------------------------------------
// Aksialkapasitet per festemiddel (for taueffekt og uttrekk)
// ---------------------------------------------------------------------------
export function axialCapacity(tr, input, rules) {
  const f = input.fastener;
  const t1 = input.members.m1.t;
  const timber2 = TIMBER[input.members.m2.grade];
  const timber1 = input.connection.kind.startsWith('st') ? null : TIMBER[input.members.m1.grade];

  if (f.type === 'dowel') {
    tr.add({ id: 'Fax', title: 'Aksialkapasitet stålstavdybel', ref: 'EC5 8.2.2(2)', formula: 'F_ax,Rk = 0 (dybler har ingen taueffekt)', subs: '', value: 0, unit: 'N' });
    return 0;
  }

  if (f.type === 'bolt') {
    const A_w = Math.PI / 4 * (f.washer ** 2 - (f.d + 1) ** 2);
    const fc90 = (timber1 ?? timber2).f_c90k;
    const Fw = 3.0 * fc90 * A_w;
    tr.add({ id: 'Fax_w', title: 'Skivetrykk under bolt', ref: 'EC5 8.5.2(2)', formula: 'F_ax,Rk = 3,0·f_c,90,k·A_skive',
      subs: `3,0·${fc90}·${r2(A_w)}`, value: Fw, unit: 'N' });
    const A_s = Math.PI / 4 * (0.9 * f.d) ** 2; // tilnærmet spenningsareal
    const Ft = f.f_u * A_s;
    tr.add({ id: 'Fax_t', title: 'Strekkapasitet bolt (karakteristisk)', ref: 'NS-EN 1993-1-8 tab. 3.4 (F_t,Rk = f_ub·A_s), A_s ≈ π/4·(0,9d)²', formula: 'F_t,Rk = f_ub·A_s', subs: `${f.f_u}·${r2(A_s)}`, value: Ft, unit: 'N' });
    return tr.add({ id: 'Fax', title: 'Aksialkapasitet bolt', ref: 'EC5 8.5.2', formula: 'F_ax,Rk = min(skivetrykk; strekk)', subs: `min(${r2(Fw)}; ${r2(Ft)})`, value: Math.min(Fw, Ft), unit: 'N' });
  }

  if (f.type === 'nail') {
    const t_pen = f.l - t1;
    const rho = timber2.rho_k;
    const fax = 20e-6 * rho ** 2;
    tr.add({ id: 'fax', title: 'Uttrekksparameter glatt spiker', ref: 'EC5 lign. (8.25)', formula: 'f_ax,k = 20·10⁻⁶·ρ_k²', subs: `20·10⁻⁶·${rho}²`, value: fax, unit: 'N/mm²' });
    if (t_pen < 8 * f.d) { tr.warn(`Spissinntrengning t_pen = ${r2(t_pen)} mm < 8d = ${8 * f.d} mm: ingen aksialkapasitet regnes.`, 'EC5 8.3.2(7)'); return 0; }
    let red = 1;
    if (t_pen < 12 * f.d) { red = t_pen / (4 * f.d) - 2; tr.warn(`t_pen mellom 8d og 12d: aksialkapasitet redusert med faktor ${r2(red)}.`, 'EC5 8.3.2(7)'); }
    const v = fax * f.d * t_pen * red;
    return tr.add({ id: 'Fax', title: 'Uttrekkskapasitet glatt spiker', ref: 'EC5 lign. (8.23)', formula: 'F_ax,Rk = f_ax,k·d·t_pen·(red.)', subs: `${r2(fax)}·${f.d}·${r2(t_pen)}·${r2(red)}`, value: v, unit: 'N' });
  }

  // Treskruer, EC5 8.7.2
  const d = f.d;
  const tip = f.tipDeduction ?? d; // spiss trekkes fra effektiv gjengelengde (antakelse, konservativt)
  const l_ef2 = Math.max(0, f.l - t1 - tip);
  tr.add({ id: 'lef', title: 'Effektiv gjengelengde i spissdel (t₂-siden)', ref: 'Antakelse: spiss = 1·d trekkes fra; jf. EC5 8.7.2(3)', formula: 'l_ef = l − t₁ − d', subs: `${f.l} − ${t1} − ${r2(tip)}`, value: l_ef2, unit: 'mm' });
  if (d < 6 || d > 12) tr.warn(`Skruediameter d = ${d} mm utenfor gyldighetsområdet 6 ≤ d ≤ 12 mm for lign. (8.38)–(8.40). Bruk f_ax,k fra ETA.`, 'EC5 8.7.2(4)');
  if (f.d1 / d < 0.6 || f.d1 / d > 0.75) tr.warn(`Forhold d₁/d = ${r2(f.d1 / d)} utenfor 0,6–0,75.`, 'EC5 8.7.2(4)');
  if (l_ef2 < 6 * d) { tr.warn(`l_ef = ${r2(l_ef2)} mm < 6d = ${6 * d} mm: uttrekkskapasitet regnes ikke.`, 'EC5 8.7.2(3)'); }

  const withdrawal = (timber, l_ef, tag) => {
    if (l_ef < 6 * d) return Infinity;
    const fax = 0.52 * Math.pow(d, -0.5) * Math.pow(l_ef, -0.1) * Math.pow(timber.rho_k, 0.8);
    tr.add({ id: `fax_${tag}`, title: `Uttrekksparameter ${tag}`, ref: 'EC5 lign. (8.39)', formula: 'f_ax,k = 0,52·d^−0,5·l_ef^−0,1·ρ_k^0,8', subs: `0,52·${d}^−0,5·${r2(l_ef)}^−0,1·${timber.rho_k}^0,8`, value: fax, unit: 'N/mm²' });
    const kd = Math.min(d / 8, 1);
    tr.add({ id: `kd_${tag}`, title: `Faktor k_d`, ref: 'EC5 lign. (8.40)', formula: 'k_d = min(d/8; 1)', subs: `min(${d}/8; 1)`, value: kd, unit: '' });
    const v = fax * d * l_ef * kd; // α = 90° → nevner = 1
    return tr.add({ id: `Faxw_${tag}`, title: `Uttrekkskapasitet ${tag} (α = 90°)`, ref: 'EC5 lign. (8.38), n_ef = 1 per skrue', formula: 'F_ax,α,Rk = f_ax,k·d·l_ef·k_d / (1,2·cos²α + sin²α)', subs: `${r2(fax)}·${d}·${r2(l_ef)}·${r2(kd)} / 1`, value: v, unit: 'N' });
  };

  const F2 = withdrawal(timber2, l_ef2, 't₂');
  let F1;
  if (timber1 && f.fullyThreaded !== false) {
    F1 = withdrawal(timber1, t1, 't₁ (helgjenget)');
  } else if (timber1) {
    const fhead = f.f_headk ?? 10.5;
    F1 = fhead * f.d_head ** 2 * Math.pow(timber1.rho_k / 350, 0.8);
    tr.add({ id: 'Fhead', title: 'Hodegjennomtrekk t₁', ref: 'EC5 lign. (8.40b) / 8.7.2(5); f_head,k fra ETA (antatt 10,5 N/mm², ρ_a = 350)', formula: 'F_ax,Rk = f_head,k·d_h²·(ρ_k/ρ_a)^0,8', subs: `${fhead}·${f.d_head}²·(${timber1.rho_k}/350)^0,8`, value: F1, unit: 'N' });
  } else {
    F1 = Infinity; // stålplate: hodet holdes av platen
  }
  const Ft = f.f_tensk ?? Infinity;
  if (Number.isFinite(Ft)) tr.add({ id: 'Ftens', title: 'Strekkapasitet skrue', ref: 'EC5 8.7.2(6); f_tens,k fra ETA', formula: 'f_tens,k', subs: '', value: Ft, unit: 'N' });
  const v = Math.min(F1, F2, Ft);
  return tr.add({ id: 'Fax', title: 'Aksialkapasitet per skrue', ref: 'EC5 8.7.2', formula: 'F_ax,Rk = min(uttrekk t₁; uttrekk t₂; strekk)', subs: `min(${fmt(F1)}; ${fmt(F2)}; ${fmt(Ft)})`, value: Number.isFinite(v) ? v : 0, unit: 'N' });
}
const fmt = (x) => (Number.isFinite(x) ? r2(x) : '–');

// Andel av Johansen-kapasitet taueffekten maksimalt kan utgjøre, EC5 8.2.2(2)
export function ropeLimit(f) {
  return { nail: 0.15, screw: 1.0, bolt: 0.25, dowel: 0 }[f.type];
}

// ---------------------------------------------------------------------------
// Johansen-uttrykk: tre-mot-tre (8.2.2) og stål-mot-tre (8.2.3)
// ---------------------------------------------------------------------------
function johansenTT(tr, kind, fh1, fh2, t1, t2, d, My, Fax, ropeLim) {
  const beta = fh2 / fh1;
  tr.add({ id: 'beta', title: 'Forhold hullkanttrykkstyrker', ref: 'EC5 lign. (8.8)', formula: 'β = f_h,2,k / f_h,1,k', subs: `${r2(fh2)} / ${r2(fh1)}`, value: beta, unit: '' });
  const modes = [];
  const push = (id, label, joh, hasRope) => {
    const rope = hasRope ? Math.min(Fax / 4, ropeLim * joh) : 0;
    modes.push({ id, label, johansen: joh, rope, value: joh + rope });
  };
  if (kind === 'tt-single') {
    push('a', '(a) Hullkanttrykk t₁', fh1 * t1 * d, false);
    push('b', '(b) Hullkanttrykk t₂', fh2 * t2 * d, false);
    const c = (fh1 * t1 * d) / (1 + beta) * (Math.sqrt(beta + 2 * beta ** 2 * (1 + t2 / t1 + (t2 / t1) ** 2) + beta ** 3 * (t2 / t1) ** 2) - beta * (1 + t2 / t1));
    push('c', '(c) Rotasjon (stiv dybel)', c, true);
    const dd = 1.05 * (fh1 * t1 * d) / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + (4 * beta * (2 + beta) * My) / (fh1 * d * t1 ** 2)) - beta);
    push('d', '(d) Ett flyteledd, t₁', dd, true);
    const e = 1.05 * (fh1 * t2 * d) / (1 + 2 * beta) * (Math.sqrt(2 * beta ** 2 * (1 + beta) + (4 * beta * (1 + 2 * beta) * My) / (fh1 * d * t2 ** 2)) - beta);
    push('e', '(e) Ett flyteledd, t₂', e, true);
    const ff = 1.15 * Math.sqrt((2 * beta) / (1 + beta)) * Math.sqrt(2 * My * fh1 * d);
    push('f', '(f) To flyteledd', ff, true);
    return { modes, ref: 'EC5 lign. (8.6), ett snitt' };
  }
  // dobbeltsnitt: t1 = ytterdeler, t2 = midtdel
  push('g', '(g) Hullkanttrykk t₁', fh1 * t1 * d, false);
  push('h', '(h) Hullkanttrykk t₂ (halv)', 0.5 * fh2 * t2 * d, false);
  const j = 1.05 * (fh1 * t1 * d) / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + (4 * beta * (2 + beta) * My) / (fh1 * d * t1 ** 2)) - beta);
  push('j', '(j) Ett flyteledd, t₁', j, true);
  const k = 1.15 * Math.sqrt((2 * beta) / (1 + beta)) * Math.sqrt(2 * My * fh1 * d);
  push('k', '(k) To flyteledd', k, true);
  return { modes, ref: 'EC5 lign. (8.7), per snitt (to snitt)' };
}

function johansenST(tr, kind, fh, t, ts, d, My, Fax, ropeLim) {
  // t = tykkelse av tredel som festemidlet står i (t1 for ett snitt / ytre stålplater: t2 midtdel)
  const push = (arr, id, label, joh, hasRope) => {
    const rope = hasRope ? Math.min(Fax / 4, ropeLim * joh) : 0;
    arr.push({ id, label, johansen: joh, rope, value: joh + rope });
  };
  const thin = [], thick = [];
  let ref;
  if (kind === 'st-single') {
    push(thin, 'a', '(a) Tynn plate, hullkanttrykk', 0.4 * fh * t * d, false);
    push(thin, 'b', '(b) Tynn plate, ett flyteledd', 1.15 * Math.sqrt(2 * My * fh * d), true);
    push(thick, 'c', '(c) Tykk plate, ett flyteledd', fh * t * d * (Math.sqrt(2 + (4 * My) / (fh * d * t ** 2)) - 1), true);
    push(thick, 'd', '(d) Tykk plate, to flyteledd', 2.3 * Math.sqrt(My * fh * d), true);
    push(thick, 'e', '(e) Tykk plate, hullkanttrykk', fh * t * d, false);
    ref = 'EC5 lign. (8.9)–(8.10), ett snitt';
  } else if (kind === 'st-double-central') {
    push(thick, 'f', '(f) Hullkanttrykk t₁', fh * t * d, false);
    push(thick, 'g', '(g) Ett flyteledd', fh * t * d * (Math.sqrt(2 + (4 * My) / (fh * d * t ** 2)) - 1), true);
    push(thick, 'h', '(h) To flyteledd', 2.3 * Math.sqrt(My * fh * d), true);
    ref = 'EC5 lign. (8.11), per snitt (to snitt), plate i midten (tykkelse uten betydning)';
    return { modes: thick, ref };
  } else { // st-double-outer
    push(thin, 'j', '(j) Tynne ytterplater, hullkanttrykk t₂', 0.5 * fh * t * d, false);
    push(thin, 'k', '(k) Tynne ytterplater, ett flyteledd', 1.15 * Math.sqrt(2 * My * fh * d), true);
    push(thick, 'l', '(l) Tykke ytterplater, hullkanttrykk t₂', 0.5 * fh * t * d, false);
    push(thick, 'm', '(m) Tykke ytterplater, to flyteledd', 2.3 * Math.sqrt(My * fh * d), true);
    ref = 'EC5 lign. (8.12)–(8.13), per snitt (to snitt)';
  }
  const Rthin = Math.min(...thin.map((m) => m.value));
  const Rthick = Math.min(...thick.map((m) => m.value));
  let modes, note;
  if (ts <= 0.5 * d) { modes = thin; note = `t_s = ${ts} mm ≤ 0,5d → tynn plate`; }
  else if (ts >= d) { modes = thick; note = `t_s = ${ts} mm ≥ d → tykk plate`; }
  else {
    const w = (ts - 0.5 * d) / (0.5 * d);
    const R = Rthin + w * (Rthick - Rthin);
    modes = [...thin.map((m) => ({ ...m, info: true })), ...thick.map((m) => ({ ...m, info: true })), { id: 'int', label: `Interpolert mellom tynn (${r2(Rthin)} N) og tykk (${r2(Rthick)} N)`, johansen: R, rope: 0, value: R, interpolated: true }];
    note = `0,5d < t_s < d → lineær interpolasjon, EC5 8.2.3(1)`;
  }
  tr.add({ id: 'plate', title: 'Klassifisering av stålplate', ref: 'EC5 8.2.3(1)', formula: 'tynn: t_s ≤ 0,5d; tykk: t_s ≥ d', subs: note, value: ts / d, unit: '' });
  return { modes, ref };
}

// ---------------------------------------------------------------------------
// Effektivt antall festemidler i en rad
// ---------------------------------------------------------------------------
export function effectiveNumber(tr, rules, f, n, a1, alpha) {
  if (n <= 1) return tr.add({ id: 'nef', title: 'Effektivt antall i rad', ref: 'EC5 8.5.1.1(4)', formula: 'n_ef = n (ett festemiddel)', subs: '', value: n, unit: '' });
  const d = rules.d;
  let nef0, ref, formula, subs;
  if (rules.rule === 'nail') {
    // Tabell 8.1, k_ef interpolert
    const s = a1 / d;
    let kef;
    if (s >= 14) kef = 1.0; else if (s >= 10) kef = 0.85 + (s - 10) / 4 * 0.15; else if (s >= 7) kef = 0.7 + (s - 7) / 3 * 0.15; else if (s >= 4) kef = 0.5 + (s - 4) / 3 * 0.2; else kef = 0.5;
    tr.add({ id: 'kef', title: 'Eksponent k_ef', ref: 'EC5 tabell 8.1 (lineær interpolasjon tillatt)', formula: 'k_ef = f(a₁/d)', subs: `a₁/d = ${r2(s)}`, value: kef, unit: '' });
    nef0 = Math.pow(n, kef); ref = 'EC5 lign. (8.17)'; formula = 'n_ef = n^k_ef'; subs = `${n}^${r2(kef)}`;
  } else {
    nef0 = Math.min(n, Math.pow(n, 0.9) * Math.pow(a1 / (13 * d), 0.25));
    ref = 'EC5 lign. (8.34)'; formula = 'n_ef = min(n; n^0,9·(a₁/(13d))^¼)'; subs = `min(${n}; ${n}^0,9·(${a1}/(13·${r2(d)}))^¼)`;
  }
  const nef_par = tr.add({ id: 'nef0', title: 'Effektivt antall i rad, kraft parallelt fibrene', ref, formula, subs, value: nef0, unit: '' });
  if (alpha === 0) return nef_par;
  // 8.5.1.1(5) / 8.3.1.1(8): for 0 < α < 90 interpoleres lineært mellom n_ef og n
  const v = nef_par + (n - nef_par) * (alpha / 90);
  return tr.add({ id: 'nef', title: `Effektivt antall i rad ved α = ${alpha}°`, ref: 'EC5 8.5.1.1(5) / 8.3.1.1(8)', formula: 'n_ef,α = n_ef,0 + (n − n_ef,0)·α/90°', subs: `${r2(nef_par)} + (${n} − ${r2(nef_par)})·${alpha}/90`, value: v, unit: '' });
}

// ---------------------------------------------------------------------------
// Hovedberegning
// ---------------------------------------------------------------------------
export function calculateConnection(input) {
  const tr = new Trace();
  const { connection, members, fastener: f, pattern, serviceClass } = input;
  const kind = connection.kind;
  const isSteel = kind.startsWith('st');
  const rules = fastenerRules(f);
  tr.add({ id: 'rules', title: 'Regelsett for festemiddel', ref: rules.ref, formula: rules.rule === 'nail' ? 'Spikerregler (8.3.1)' : 'Boltregler (8.5.1)', subs: `d (beregning) = ${r2(rules.d)} mm`, value: rules.d, unit: 'mm' });
  const d = rules.d;

  const alpha1 = pattern.alpha1 ?? 0; // vinkel kraft/fiber i del 1
  const alpha2 = pattern.alpha2 ?? 0;
  const predrilled = f.predrilled ?? (f.type !== 'nail');

  const m1 = TIMBER[members.m1.grade];
  const m2 = TIMBER[members.m2.grade];
  const t1 = members.m1.t, t2 = members.m2.t;

  // Geometri-kontroller
  if (f.type === 'nail' || (f.type === 'screw' && rules.rule === 'nail')) {
    if (!predrilled) {
      const check = (tag, tm, t) => {
        const tmin = Math.max(7 * d, (13 * d - 30) * tm.rho_k / 400);
        if (t < tmin) tr.warn(`Tykkelse ${tag} = ${t} mm < minste tykkelse ${r2(tmin)} mm uten forboring (fare for oppsprekking).`, 'EC5 lign. (8.18), 8.3.1.2(6)');
      };
      if (!isSteel) check('t₁', m1, t1);
      check('t₂', m2, t2);
      if (m2.rho_k > 500 || (!isSteel && m1.rho_k > 500)) tr.error('ρ_k > 500 kg/m³ krever forboring.', 'EC5 8.3.1.2(2)');
    }
    const t_pen = f.l - (kind === 'tt-double' ? t1 : (isSteel ? 0 : t1));
    if (f.type === 'nail' && t_pen < 8 * d) tr.error(`Spissinntrengning ${r2(t_pen)} mm < 8d = ${8 * d} mm.`, 'EC5 8.3.1.2(1)');
  }
  if (isSteel && (f.type === 'screw' || f.type === 'nail')) {
    const tw = kind === 'st-single' ? t1 : t2;
    if (f.l > tw + (members.steel?.t_s ?? 0)) tr.warn(`Festemiddellengde ${f.l} mm overskrider tredel + plate (${tw + (members.steel?.t_s ?? 0)} mm).`, 'Geometri');
  }

  // Hullkanttrykk
  let fh1, fh2;
  if (kind === 'tt-single' || kind === 'tt-double') {
    fh1 = embedmentStrength(tr, 't₁', m1, rules, alpha1, predrilled);
    fh2 = embedmentStrength(tr, 't₂', m2, rules, alpha2, predrilled);
  } else if (kind === 'st-single') {
    fh1 = embedmentStrength(tr, 't₁', m1, rules, alpha1, predrilled);
  } else {
    fh2 = embedmentStrength(tr, 't₂', m2, rules, alpha2, predrilled);
  }

  const My = yieldMoment(tr, f, rules);
  const Fax = axialCapacity(tr, input, rules);
  const rl = ropeLimit(f);
  tr.add({ id: 'ropelim', title: 'Grense for taueffekt', ref: 'EC5 8.2.2(2)', formula: 'F_ax,Rk/4 ≤ andel·Johansen-del', subs: `andel = ${rl * 100} %`, value: rl, unit: '' });

  // Johansen
  let jres, planes;
  if (kind === 'tt-single') { jres = johansenTT(tr, kind, fh1, fh2, t1, t2, d, My, Fax, rl); planes = 1; }
  else if (kind === 'tt-double') { jres = johansenTT(tr, kind, fh1, fh2, t1, t2, d, My, Fax, rl); planes = 2; }
  else if (kind === 'st-single') { jres = johansenST(tr, kind, fh1, t1, members.steel.t_s, d, My, Fax, rl); planes = 1; }
  else if (kind === 'st-double-central') { jres = johansenST(tr, kind, fh2 ?? fh1, t1, members.steel.t_s, d, My, Fax, rl); planes = 2; }
  else { jres = johansenST(tr, kind, fh2, t2, members.steel.t_s, d, My, Fax, rl); planes = 2; }

  const governing = jres.modes.filter((m) => !m.info).reduce((a, b) => (b.value < a.value ? b : a));
  const FvRk = tr.add({ id: 'FvRk', title: 'Karakteristisk kapasitet per festemiddel per snitt', ref: jres.ref, formula: 'F_v,Rk = min(bruddformer)', subs: `dimensjonerende bruddform ${governing.label}`, value: governing.value, unit: 'N' });

  // Mønster: n1 i rad (langs fiber), n2 rader
  const n1 = pattern.n1, n2 = pattern.n2, n = n1 * n2;
  const alphaRef = isSteel ? (kind === 'st-single' ? alpha1 : alpha2) : Math.min(alpha1, alpha2);
  const nef_row = effectiveNumber(tr, rules, f, n1, pattern.a1, alphaRef);
  const nef = tr.add({ id: 'nef_tot', title: 'Effektivt antall totalt', ref: 'EC5 8.1.2(4)', formula: 'n_ef,tot = n_ef,rad · antall rader', subs: `${r2(nef_row)} · ${n2}`, value: nef_row * n2, unit: '' });
  const RkTot = tr.add({ id: 'RkTot', title: 'Karakteristisk kapasitet forbindelse', ref: 'EC5 8.1.2', formula: 'F_v,Rk,tot = n_ef,tot · antall snitt · F_v,Rk', subs: `${r2(nef)} · ${planes} · ${r2(FvRk)}`, value: nef * planes * FvRk, unit: 'N' });

  // Avstander
  const spacing = minSpacings(rules, f, alphaRef, predrilled, (isSteel ? m2 ?? m1 : m1).rho_k);
  const spacingCheck = checkSpacings(spacing, pattern);
  spacingCheck.filter((c) => !c.ok).forEach((c) => tr.error(`${c.label}: ${c.actual} mm < minste ${r2(c.min)} mm.`, c.ref));

  // Stivhet, tabell 7.1
  const rhoM = isSteel ? (m2 ?? m1).rho_mean : Math.sqrt(m1.rho_mean * m2.rho_mean);
  let Kser;
  if (rules.rule === 'nail' && !predrilled) Kser = Math.pow(rhoM, 1.5) * Math.pow(d, 0.8) / 30;
  else Kser = Math.pow(rhoM, 1.5) * d / 23;
  if (isSteel) Kser *= 2;
  tr.add({ id: 'Kser', title: 'Forskyvningsmodul per festemiddel per snitt', ref: `EC5 tabell 7.1${isSteel ? ', 7.1(3): ×2 for stål-mot-tre' : ''}${!isSteel ? ', 7.1(2): ρ_m = √(ρ_m,1·ρ_m,2)' : ''}`, formula: rules.rule === 'nail' && !predrilled ? 'K_ser = ρ_m^1,5·d^0,8/30' : 'K_ser = ρ_m^1,5·d/23', subs: `ρ_m = ${r2(rhoM)}, d = ${r2(d)}`, value: Kser, unit: 'N/mm' });
  const KserTot = n * planes * Kser;
  const Ku = tr.add({ id: 'Ku', title: 'Bruddgrensestivhet forbindelse', ref: 'EC5 lign. (2.1)', formula: 'K_u = 2/3·K_ser · n · snitt', subs: `2/3·${r2(Kser)}·${n}·${planes}`, value: (2 / 3) * KserTot, unit: 'N/mm' });

  // Oppsprekking (8.1.4) for tredeler belastet på tvers av fiber
  const splitting = [];
  const splitCheck = (tag, tm, t, h, alpha) => {
    if (!h || alpha === 0) return;
    const he = pattern.a4t + (n2 - 1) * pattern.a2;
    const F90 = 14 * t * 1 * Math.sqrt(he / (1 - he / h));
    tr.add({ id: `F90_${tag}`, title: `Oppsprekkingskapasitet ${tag}`, ref: 'EC5 lign. (8.4), w = 1', formula: 'F_90,Rk = 14·b·w·√(h_e/(1 − h_e/h))', subs: `14·${t}·1·√(${he}/(1 − ${he}/${h}))`, value: F90, unit: 'N' });
    splitting.push({ tag, F90Rk: F90, he, h, alpha, gammaM: GAMMA_M[tm.type].value });
  };
  if (!isSteel || kind === 'st-single') splitCheck('t₁', m1, kind === 'tt-double' ? 2 * t1 : t1, members.m1.h, alpha1);
  if (!isSteel || kind !== 'st-single') splitCheck('t₂', m2, t2, members.m2.h, alpha2);

  const gammaM = GAMMA_M.connection.value;
  return {
    rules, d, fh1, fh2, My, Fax, modes: jres.modes, governing, FvRk, planes, nef_row, nef, RkTot, n, Kser, KserTot, Ku,
    spacing, spacingCheck, splitting, gammaM, gammaMRef: GAMMA_M.connection.ref,
    trace: tr.steps, warnings: tr.warnings, errors: tr.errors,
    // Dimensjonerende kapasitet for gitt lastvarighetsklasse
    designCapacity(duration) {
      const kmod = KMOD[serviceClass][duration];
      return { kmod, kmodRef: KMOD_REF, Rd: kmod * RkTot / gammaM, RdPerFastener: kmod * FvRk / gammaM };
    },
  };
}
