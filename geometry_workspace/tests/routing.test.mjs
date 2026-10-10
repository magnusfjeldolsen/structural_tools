/**
 * routing.test.mjs — ΔN-rutingen gjennom `computeReinforcement` (#59).
 *
 *   node geometry_workspace/tests/routing.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Tester hele broen modell → mekanikk, ikke bare grafen, fordi feilen som
 * rettes her satt i samspillet: `overConstrained` flagget en kjede som
 * statisk ubestemt, og broen satte da ΔN = 0 for skjøten mot den nye delen.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// polygon-clipping er en UMD-fil; som data-URL kjører den med `window` satt,
// slik nettleseren gjør, og geometry.js finner den når broen lastes etterpå.
globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const { computeReinforcement } = await import(pathToFileURL(fileURLToPath(new URL('../js/reinforcement-ui.js', import.meta.url))).href);

let failed = 0;
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failed++;
    console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const shape = (id, pts, stage, E) => ({ id, name: id, points: pts, stage, include: true, factor: 1, role: 'solid', material: { name: '', E } });
const joint = (id, a, b, connector = { rows: 1, spacing: 200, Kser: 5000 }) => ({ id, name: id, a, b, share: null, connector });
const state = (shapes, joints, after) => ({
  unit: 'mm', shapes, joints,
  loads: { before: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 }, after: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0, ...after }, L: 1000 },
});

console.log('Kjede eksisterende–eksisterende–ny (feilen i #59)');
{
  // Betong 300×250 + 300×250 (E 33 000), limtre 300×120 under (E 13 000), N_etter = 20 kN.
  // HÅNDREGNING: EA_ny = 13000·36000 = 4,68e8; EA_tot = 33000·150000 + 4,68e8 = 5,418e9
  //   ΔN = 20 000 · 4,68e8/5,418e9 = 1 727,57 N;  q_N = ΔN/L = 1,7276 N/mm
  const res = computeReinforcement(state(
    [shape('lower', R(0, 0, 300, 250), 'existing', 33000), shape('upper', R(0, 250, 300, 250), 'existing', 33000), shape('fresh', R(0, -120, 300, 120), 'new', 13000)],
    [joint('jLF', [0, 0], [300, 0]), joint('jUL', [0, 250], [300, 250])],
    { N: 20 },
  ));
  const jLF = res.joints.find((j) => j.id === 'jLF');
  ok('skjøten mot ny del får ΔN = 1 727,57 N', close(jLF.dN, 20000 * 4.68e8 / 5.418e9), `fikk ${jLF.dN}`);
  ok('q_N = 1,7276 N/mm', close(jLF.qN, 20000 * 4.68e8 / 5.418e9 / 1000), `fikk ${jLF.qN}`);
  ok('ikke flagget statisk ubestemt', jLF.overConstrained === false);
  ok('ingen «statisk ubestemt»-advarsel', !res.warnings.some((w) => /ubestemt/.test(w.text)));
}

console.log('Trekant: ny plate festet til to eksisterende deler som også er skjøtet sammen');
{
  // Nedre og øvre betong 300×250, stålplate 40×500 på høyre side, festet med
  // én skjøt til hver. Ekte sløyfe: plata henger på to skjøter.
  // ΔN = 20 000 · (210000·20000)/(33000·150000 + 210000·20000)
  const EAp = 210000 * 40 * 500;
  const dN = 20000 * EAp / (33000 * 150000 + EAp);
  const stiff = (Kser) => ({ rows: 1, spacing: 100, Kser });
  const res = computeReinforcement(state(
    [shape('lower', R(0, 0, 300, 250), 'existing', 33000), shape('upper', R(0, 250, 300, 250), 'existing', 33000), shape('plate', R(300, 0, 40, 500), 'new', 210000)],
    [joint('jUL', [0, 250], [300, 250]), joint('jLP', [300, 0], [300, 250], stiff(3000)), joint('jUP', [300, 250], [300, 500], stiff(1000))],
    { N: 20 },
  ));
  const by = (id) => res.joints.find((j) => j.id === id);
  ok('eksisterende–eksisterende-skjøten fører ikke ΔN inn i plata', by('jUL').dN === 0, `fikk ${by('jUL').dN}`);
  // HÅNDREGNING: k = K·rader/s → 30 og 10 N/mm²; andeler 30/40 = 0,75 og 10/40 = 0,25
  ok('stivest skjøt tar 75 %', close(by('jLP').shareApplied, 0.75), `fikk ${by('jLP').shareApplied}`);
  ok('mykest skjøt tar 25 %', close(by('jUP').shareApplied, 0.25), `fikk ${by('jUP').shareApplied}`);
  ok('summen er hele ΔN', close(by('jLP').dN + by('jUP').dN, dN), `fikk ${by('jLP').dN + by('jUP').dN}, ventet ${dN}`);
  ok('grunnlaget står som stivhet', by('jLP').shareBasis === 'stivhet' && by('jUP').shareBasis === 'stivhet');
  ok('advarselen sier at fordelingen er en antakelse etter k',
    res.warnings.some((w) => /skjøtestivheten k \(antakelse\)/.test(w.text)), res.warnings.map((w) => w.text).join(' | '));

  // Brukerens andel vinner over stivheten.
  const st = state(
    [shape('lower', R(0, 0, 300, 250), 'existing', 33000), shape('upper', R(0, 250, 300, 250), 'existing', 33000), shape('plate', R(300, 0, 40, 500), 'new', 210000)],
    [joint('jUL', [0, 250], [300, 250]), { ...joint('jLP', [300, 0], [300, 250], stiff(3000)), share: 0.4 }, { ...joint('jUP', [300, 250], [300, 500], stiff(1000)), share: 0.6 }],
    { N: 20 },
  );
  const res2 = computeReinforcement(st);
  ok('brukerens andel vinner', close(res2.joints.find((j) => j.id === 'jLP').shareApplied, 0.4) && res2.joints.find((j) => j.id === 'jLP').shareBasis === 'bruker');
}

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
