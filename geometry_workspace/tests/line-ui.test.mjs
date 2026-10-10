/**
 * line-ui.test.mjs — linjeberegningen hele veien fra tegnet modell (#63).
 *
 *   node geometry_workspace/tests/line-ui.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { computeReinforcement } = await import(url('../js/reinforcement-ui.js'));
const { computeLine } = await import(url('../js/line-ui.js'));

let failed = 0;
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const close = (a, b, rel = 3e-3) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b);

const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const shape = (id, pts, stage, E) => ({ id, name: id, points: pts, stage, include: true, factor: 1, role: 'solid', material: { name: '', E } });
const joint = (id, a, b) => ({ id, name: id, a, b, share: null, qT: 0, connector: { rows: 2, spacing: 100, Kser: 2990 } });
const model = (shapes, joints, line) => ({
  unit: 'mm', shapes, joints, analysis: 'line',
  loads: { before: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 }, after: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 }, L: 1000 },
  line: { table: 'z\tN\tMx\tMy\n0\t60\t0\t0\n12\t60\t0\t0', za: null, zb: null, endA: 'loose', endB: 'loose', nAt: 'composite', restraint: 'xy', epsExisting: 0, epsNew: 0, ...line },
});
const run = (st) => computeLine(st, computeReinforcement(st));

console.log('SMath-caset fra tegningen');
{
  const st = model([shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)], [joint('j', [50, 0], [50, 130])], {});
  const lr = run(st);
  ok('regnes', lr.ok, lr.blocked.join(' | '));
  if (lr.ok) {
    // N₂∞ = 60 000·1,04544e8/1,75694e8; λ = √(59,8·(1/7,15e7 + 1/1,04544e8)); q_max ≈ N₂∞·λ (lang del)
    const Ninf = (60000 * 1.04544e8) / (7.15e7 + 1.04544e8);
    const lam = Math.sqrt(59.8 * (1 / 7.15e7 + 1 / 1.04544e8));
    ok('q_max ≈ 42,3 kN/m (K_ser)', close(Math.abs(lr.summary.qMax.ser), Ninf * lam * Math.tanh((lam * 12000) / 2)), lr.summary.qMax.ser);
    ok('F_v ≈ 2,11 kN', close(lr.summary.Fv.ser, (Ninf * lam * 100) / 2 / 1000), lr.summary.Fv.ser);
    ok('1/λ ≈ 843 mm', close(lr.summary.Lc.ser, 1 / lam, 1e-9), lr.summary.Lc.ser);
    ok('K_u gir lengre 1/λ: ×√(3/2)', close(lr.summary.Lc.u / lr.summary.Lc.ser, Math.sqrt(1.5), 1e-9));
    ok('N₁ = 60 kN i løs ende', close(lr.summary.N1max.u, 60, 1e-9), lr.summary.N1max.u);
  }
}

console.log('Sperrer');
{
  const base = [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)];
  ok('uten valg av angrepspunkt', run(model(base, [joint('j', [50, 0], [50, 130])], { nAt: null })).blocked.some((b) => /angriper/.test(b)));
  ok('uten valg av fastholding', run(model(base, [joint('j', [50, 0], [50, 130])], { restraint: null })).blocked.some((b) => /fastholding/.test(b)));
  ok('uten tabell', run(model(base, [joint('j', [50, 0], [50, 130])], { table: '' })).blocked.some((b) => /Lim inn/.test(b)));
  ok('uten skjøt', run(model(base, [], {})).blocked.some((b) => /Tegn skjøten/.test(b)));
  const gap = joint('j', [50, 0], [50, 130]);
  gap.connector = { rows: 2, spacing: 100, stiffSource: 'ec5', ec5Fastener: 'screw', ec5D: 8, ec5Contact: 'gap' };
  ok('glippe sperrer', run(model(base, [gap], {})).blocked.some((b) => /ingen kontakt/.test(b)));
}

console.log('To like, speilede nye deler');
{
  // Eksisterende 50×130 i midten, to like 48×130 på hver side.
  const st = model(
    [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('v', R(-48, 0, 48, 130), 'new', 11000), shape('h', R(50, 0, 48, 130), 'new', 11000)],
    [joint('jv', [0, 0], [0, 130]), joint('jh', [50, 0], [50, 130])],
    { restraint: 'free' },
  );
  const lr = run(st);
  ok('regnes som et par', lr.ok && lr.pick.pair, lr.blocked.join(' | '));
  if (lr.ok) {
    // To skjøter ⟹ k = 2·59,8; nye EA = 2·11000·6240; e = 0, så fri = fastholdt.
    const EA1 = 11000 * 6500, EA2 = 2 * 11000 * 6240;
    const lam = Math.sqrt(2 * 59.8 * (1 / EA1 + 1 / EA2));
    ok('1/λ fra summen av stivhetene, e = 0', close(lr.summary.Lc.ser, 1 / lam, 1e-6), `${lr.summary.Lc.ser} mot ${1 / lam}`);
    const Ninf = (60000 * EA2) / (EA1 + EA2);
    ok('q per skjøt = halvparten', close(Math.abs(lr.summary.qMax.ser), (Ninf * lam * Math.tanh((lam * 12000) / 2)) / 2), lr.summary.qMax.ser);
  }
  // Ulike deler: nektes.
  const st2 = model(
    [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('v', R(-36, 0, 36, 130), 'new', 11000), shape('h', R(50, 0, 48, 130), 'new', 11000)],
    [joint('jv', [0, 0], [0, 130]), joint('jh', [50, 0], [50, 130])],
    {},
  );
  ok('to ulike nye deler nektes', run(st2).blocked.some((b) => /to ulike/.test(b)));
}

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
