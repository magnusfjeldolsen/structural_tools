/**
 * line-analysis.test.mjs — fasit for linjeberegningen (#63).
 *
 *   node geometry_workspace/tests/line-analysis.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Ligningen er N₂″ = λ²·(N₂ − N₂∞(z)). Hver lukket løsning under er regnet
 * for hånd i kommentaren, og testen sjekker BEGGE ender og ∫q — ikke bare
 * toppen. (En tidligere foreslått festet–løs-formel ga q = 0 i festet ende
 * og 42 % for lav topp ved λL = 1; den feilen skal ikke kunne snike seg inn.)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const L = await import(url('../js/line-analysis.js'));
const RF = await import(url('../js/reinforcement.js'));

let failed = 0;
let section = '';
function head(t) { section = t; console.log(t); }
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
function close(label, actual, expected, rel = 1e-3) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= rel * Math.max(1e-9, Math.abs(expected));
  ok(label, good, `fikk ${actual}, ventet ${expected} (±${rel * 100} %)`);
}

/* rektangel som Part: props om globalt origo, som geometry.js gir dem */
function rectPart(id, x0, y0, w, h, E) {
  const A = w * h, xc = x0 + w / 2, yc = y0 + h / 2;
  return { id, E, props: { A, Sx: A * yc, Sy: A * xc, Ix0: (w * h ** 3) / 12 + A * yc * yc, Iy0: (h * w ** 3) / 12 + A * xc * xc, Ixy0: A * xc * yc } };
}

/* konstant last, gitt direkte som N₂∞-funksjon */
const constant = (v) => () => v;

/* ------------------------------------------------------------------ */
head('1. Løs–løs, konstant N₂∞ (Volkersen, symmetrisk)');
for (const lamL of [0.5, 1, 10]) {
  const Lmm = 3000, lam = lamL / Lmm, Ninf = 35000;
  const s = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf: constant(Ninf), endA: 'loose', endB: 'loose' });
  // HÅNDREGNING: N₂ = N∞[1 − cosh(λ(z−L/2))/cosh(λL/2)], q(0) = N∞·λ·tanh(λL/2), q(L) = −q(0), N₂(L/2) = N∞(1 − 1/cosh(λL/2))
  close(`λL=${lamL}: q(0) = N∞λ·tanh(λL/2)`, s.q[0], Ninf * lam * Math.tanh(lamL / 2), 2e-3);
  close(`λL=${lamL}: q(L) = −q(0)`, s.q[s.q.length - 1], -Ninf * lam * Math.tanh(lamL / 2), 2e-3);
  const mid = Math.floor(s.z.length / 2);
  close(`λL=${lamL}: N₂ midt = N∞(1 − 1/cosh(λL/2))`, s.N2[mid], Ninf * (1 - 1 / Math.cosh(lamL / 2)), 2e-3);
  ok(`λL=${lamL}: N₂ = 0 i begge ender`, s.N2[0] === 0 && s.N2[s.N2.length - 1] === 0);
  close(`λL=${lamL}: ∫q dz = N₂(b) − N₂(a) = 0 (relativt til N∞)`, 1 + L.integrate(s.z, s.q) / Ninf, 1, 1e-3);
}

head('2. Festet–løs (festet i z = 0, løs i z = L)');
for (const lamL of [0.5, 1, 10]) {
  const Lmm = 3000, lam = lamL / Lmm, Ninf = 35000;
  const s = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf: constant(Ninf), endA: 'fixed', endB: 'loose' });
  // Speilet av løs-i-0: med ζ = L − z er N₂ = N∞(1 − cosh λζ + coth λL·sinh λζ).
  // Løs ende (z = L): |q| = N∞λ·coth(λL).  Festet ende (z = 0): |q| = N∞λ/sinh(λL).  ∫q = N₂(L) − N₂(0) = −N∞.
  close(`λL=${lamL}: |q| i løs ende = N∞λ·coth(λL)`, Math.abs(s.q[s.q.length - 1]), Ninf * lam / Math.tanh(lamL), 2e-3);
  close(`λL=${lamL}: |q| i festet ende = N∞λ/sinh(λL)`, Math.abs(s.q[0]), Ninf * lam / Math.sinh(lamL), 2e-3);
  ok(`λL=${lamL}: N₂(0) = N∞, N₂(L) = 0`, s.N2[0] === Ninf && s.N2[s.N2.length - 1] === 0);
  close(`λL=${lamL}: ∫q dz = −N∞`, L.integrate(s.z, s.q), -Ninf, 2e-3);
}

head('3. Festet–festet: ingen glidning, q = 0');
{
  const s = L.solveLine({ za: 0, zb: 3000, lambda: 1 / 840, nInf: constant(35000), endA: 'fixed', endB: 'fixed' });
  ok('N₂ = N∞ overalt', s.N2.every((v) => Math.abs(v - 35000) < 1e-6));
  ok('q = 0 overalt', s.q.every((v) => Math.abs(v) < 1e-6));
}

head('4. Hopp ΔN midt i en lang del');
{
  // Lang del (λL = 40), N₂∞ hopper fra r·N_l til r·N_h midt på.
  // Uendelig del: q = r·ΔN·λ/2·e^(−λ|z−ξ|) ⟹ topp r·ΔN·λ/2 på begge sider av hoppet.
  // N₂(ξ) = r·(N_l + N_h)/2 ⟹ N₁ på høy side = N_h − N₂ = (1−r)·N_h + r·ΔN/2.
  const Lmm = 12000, lam = 40 / Lmm, r = 0.6, Nl = 40000, Nh = 70000, dN = Nh - Nl;
  const nInf = (z, side) => (z < Lmm / 2 ? r * Nl : z > Lmm / 2 ? r * Nh : side < 0 ? r * Nl : side > 0 ? r * Nh : r * (Nl + Nh) / 2);
  const s = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf, endA: 'fixed', endB: 'fixed', jumps: [Lmm / 2] });
  const iMid = s.z.findIndex((z) => z >= Lmm / 2);
  const qPeak = Math.max(...s.q.slice(iMid - 3, iMid + 4).map(Math.abs));
  close('topp ved hoppet = r·ΔN·λ/2', qPeak, (r * dN * lam) / 2, 1e-2);
  close('N₂ ved hoppet = r·(N_l+N_h)/2', s.N2[iMid], (r * (Nl + Nh)) / 2, 1e-2);
  close('N₁ på høy side = (1−r)·N_h + r·ΔN/2', Nh - s.N2[iMid], (1 - r) * Nh + (r * dN) / 2, 1e-2);
}

/* ------------------------------------------------------------------ */
head('5. To lag: N₂∞ og λ fra tegnede deler');
{
  // SMath-caset: 50×130 eksisterende og 48×198 ny, C24 (E = 11 000), side om side.
  const ex = [rectPart('ex', 0, 0, 50, 130, 11000)];
  const nw = [rectPart('nw', 50, 0, 48, 198, 11000)];
  const both = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'xy', nAt: 'composite' });
  // HÅNDREGNING: EA₁ = 11000·6500 = 7,15e7; EA₂ = 11000·9504 = 1,04544e8
  close('EA₁', both.EA1, 7.15e7, 1e-9);
  close('EA₂', both.EA2, 1.04544e8, 1e-9);
  // Fastholdt om begge akser: λ² = k(1/EA₁ + 1/EA₂), k = 2·2990/100 = 59,8 N/mm²
  const k = (2 * 2990) / 100;
  const lam = Math.sqrt(L.lambda2(both, k));
  close('1/λ ≈ 842 mm (e-leddet borte når fastholdt)', 1 / lam, 1 / Math.sqrt(k * (1 / 7.15e7 + 1 / 1.04544e8)), 1e-9);
  // N₂∞ = N·EA₂/EA = 60 000·1,04544e8/1,75694e8 = 35 702 N  (arket: «35,6 kN» med avrundede arealer)
  const Ninf = L.nInfinity(both, { N: 60000 });
  close('N₂∞ = N·EA₂/EA', Ninf, (60000 * 1.04544e8) / (7.15e7 + 1.04544e8), 1e-9);
  // Lang del (12 m), løse ender: q_max = N₂∞·λ·tanh(λL/2) ≈ N₂∞·λ;  F = q·a/n = q·100/2
  const s = L.solveLine({ za: 0, zb: 12000, lambda: lam, nInf: constant(Ninf), endA: 'loose', endB: 'loose' });
  close('q_max ≈ 42 N/mm', Math.abs(s.q[0]), Ninf * lam * Math.tanh((lam * 12000) / 2), 2e-3);
  close('kraft i ytterste skrue ≈ 2,1 kN', (Math.abs(s.q[0]) * 100) / 2 / 1000, (Ninf * lam * 100) / 2 / 1000, 3e-3);

  // Fri: e = (e_y, e_x) = (99 − 65, 74 − 25) = (34, 49) mm teller med i λ² — λ blir større.
  const free = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'free', nAt: 'composite' });
  ok('fri gir større λ enn fastholdt', L.lambda2(free, k) > L.lambda2(both, k));
  // N i sammensatt tyngdepunkt gir r·N også når delene er eksentriske (full samvirkning, ingen krumning).
  close('N i sammensatt tyngdepunkt: N₂∞ = r·N uansett e', L.nInfinity(free, { N: 60000 }), Ninf, 1e-9);
  // N i eksisterende tyngdepunkt, fri: momentet N·(c₁ − c) bøyer — den nye delen får mindre.
  const freeEx = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'free', nAt: 'existing' });
  ok('N i eksisterende tyngdepunkt, fri: N₂∞ < r·N', L.nInfinity(freeEx, { N: 60000 }) < Ninf);
  // …men fastholdt tar fastholdingen momentet: N₂∞ = r·N igjen.
  const bothEx = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'xy', nAt: 'existing' });
  close('N i eksisterende tyngdepunkt, fastholdt: N₂∞ = r·N', L.nInfinity(bothEx, { N: 60000 }), Ninf, 1e-9);
}

head('6. Full samvirkning: N₂∞ fra M stemmer med axialInGroup');
{
  // Skjevt tverrsnitt: bjelke + ensidig lamell, momenter om begge akser.
  const ex = [rectPart('ex', 0, 0, 100, 300, 11000)];
  const nw = [rectPart('nw', 100, -40, 60, 40, 210000)];
  const lay = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'free', nAt: 'composite' });
  const Mx = 25e6, My = -8e6;
  const ref = RF.axialInGroup({ Mx, My, groupParts: nw, section: [...ex, ...nw] });
  close('N₂∞(M) = κ_x·ES*_x + κ_y·ES*_y', L.nInfinity(lay, { Mx, My }), ref.NG, 1e-9);
}

head('7. Fri tøyning per del');
{
  const ex = [rectPart('ex', 0, 0, 50, 130, 11000)];
  const nw = [rectPart('nw', 50, 0, 48, 198, 11000)];
  const lay = L.twoLayer({ existingParts: ex, newParts: nw, restraint: 'xy', nAt: 'composite' });
  // EA* = EA₁·EA₂/(EA₁+EA₂); ε_eks − ε_ny = 3e-4 ⟹ N₂∞ = EA*·3e-4 (ny del krymper → strekk)
  const EAs = (7.15e7 * 1.04544e8) / (7.15e7 + 1.04544e8);
  close('N₂∞ = EA*·(ε_eks − ε_ny)', L.nInfinity(lay, { epsExisting: 0, epsNew: -3e-4 }), EAs * 3e-4, 1e-9);
  close('like fri tøyning gir ingenting', L.nInfinity(lay, { epsExisting: 2e-4, epsNew: 2e-4 }), 0, 1e-9);
}

head('8. Invarianter');
{
  const Lmm = 6000, lam = 3 / Lmm;
  const f = (z) => 20000 + 15000 * Math.sin((Math.PI * z) / Lmm);
  const a = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf: (z) => f(z), endA: 'loose', endB: 'fixed' });
  const b = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf: (z) => f(Lmm - z), endA: 'fixed', endB: 'loose' });
  const n = a.z.length;
  ok('speiling z → L−z gir speilet N₂', a.N2.every((v, i) => Math.abs(v - b.N2[n - 1 - i]) < 1e-6 * 35000));
  const c = L.solveLine({ za: 0, zb: Lmm, lambda: lam, nInf: (z) => 2 * f(z), endA: 'loose', endB: 'fixed' });
  ok('dobbel last gir doble krefter', c.q.every((v, i) => Math.abs(v - 2 * a.q[i]) < 1e-6 * 35000 * lam));
  close('∫q dz = N₂(b) − N₂(a)', L.integrate(a.z, a.q), a.N2[n - 1] - a.N2[0], 2e-3);
}

/* ------------------------------------------------------------------ */
head('9. Lastetabellen');
{
  const t = L.parseLoadTable('z\tN\tMx\tMy\tN_før\n0\t10,5\t0\t0\t0\n3\t10,5\t2,25\t0\t0\n3\t30\t2,25\t0\t0\n6\t30\t0\t0\t0\n');
  ok('fire rader, overskrift hoppet over', t.rows.length === 4 && t.errors.length === 0, JSON.stringify(t));
  close('komma er desimaltegn', t.rows[0].N, 10.5, 1e-12);
  ok('hopp = to rader med samme z', t.jumps.length === 1 && t.jumps[0] === 3, JSON.stringify(t.jumps));
  const semi = L.parseLoadTable('0;5\n2;5;1\n');
  ok('semikolon og manglende kolonner = 0', semi.rows.length === 2 && semi.rows[0].Mx === 0 && semi.rows[1].Mx === 1);
  const bad = L.parseLoadTable('0 1\n2 1\n1 1\n');
  ok('z som går baklengs gir feil', bad.errors.length === 1);
  // Lineær interpolasjon og grenseverdier ved hoppet, i N/Nmm og mm.
  const d = L.loadAt(t.rows, 1500, 0);
  close('N ved z = 1,5 m', d.N, 10500, 1e-12);
  close('M_x ved z = 1,5 m (kNm → Nmm)', d.Mx, 1.125e6, 1e-12);
  close('venstre grense ved hoppet', L.loadAt(t.rows, 3000, -1).N, 10500, 1e-12);
  close('høyre grense ved hoppet', L.loadAt(t.rows, 3000, +1).N, 30000, 1e-12);
  close('midt på hoppet: snittet', L.loadAt(t.rows, 3000, 0).N, 20250, 1e-12);
}

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
