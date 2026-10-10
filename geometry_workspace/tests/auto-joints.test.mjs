/**
 * auto-joints.test.mjs — automatiske skjøter mellom eksisterende og ny del (#61).
 *
 *   node geometry_workspace/tests/auto-joints.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Regelen (CONTEXT.md): en automatisk skjøt ligger langs hver felles kant
 * mellom en eksisterende og en ny del, utledet fra geometrien. Mellom to
 * eksisterende deler: ingen (de er stivt forbundet; tegn en skjøt for å se
 * kraften der). Overlapper en ny del en eksisterende: ingen skjøt, men varsel.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { autoJoints } = await import(url('../js/joints.js'));
const { effectiveJoints } = await import(url('../js/store.js'));

let failed = 0;
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const near = (p, q, tol = 1e-6) => Math.abs(p[0] - q[0]) < tol && Math.abs(p[1] - q[1]) < tol;
const sameSeg = (j, a, b) => (near(j.a, a) && near(j.b, b)) || (near(j.a, b) && near(j.b, a));

const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const sh = (id, points, stage = 'existing') => ({ id, name: id, points, stage, include: true, role: 'solid' });
const TOL = 0.1;

console.log('Felles kant');
{
  const r = autoJoints([sh('E', R(0, 0, 100, 200)), sh('N', R(100, 50, 40, 100), 'new')], [], TOL);
  ok('én automatisk skjøt', r.joints.length === 1, JSON.stringify(r.joints));
  ok('langs den felles delen av kanten: (100,50)–(100,150)', r.joints[0] && sameSeg(r.joints[0], [100, 50], [100, 150]), JSON.stringify(r.joints[0]));
  ok('merket automatisk, med delparet', r.joints[0] && r.joints[0].auto === true && r.joints[0].pair.join('|') === 'E|N');
  ok('ingen overlapp', r.overlaps.length === 0);
}

console.log('Ikke mellom to eksisterende');
{
  const r = autoJoints([sh('E1', R(0, 0, 100, 200)), sh('E2', R(100, 0, 40, 200))], [], TOL);
  ok('ingen skjøt', r.joints.length === 0);
}

console.log('Overlapp gir varsel, ikke skjøt');
{
  const r = autoJoints([sh('E', R(0, 0, 100, 200)), sh('N', R(90, 50, 40, 100), 'new')], [], TOL);
  ok('ingen skjøt', r.joints.length === 0);
  ok('overlappen meldes', r.overlaps.length === 1 && r.overlaps[0].existingId === 'E' && r.overlaps[0].newId === 'N', JSON.stringify(r.overlaps));
}

console.log('Glippe er ikke kontakt');
{
  const r = autoJoints([sh('E', R(0, 0, 100, 200)), sh('N', R(101, 50, 40, 100), 'new')], [], TOL);
  ok('1 mm glippe gir ingen skjøt', r.joints.length === 0);
}

console.log('Rotert');
{
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const rot = (pts) => pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const r = autoJoints([sh('E', rot(R(0, 0, 100, 200))), sh('N', rot(R(100, 50, 40, 100)), 'new')], [], TOL);
  ok('én skjøt', r.joints.length === 1);
  const j = r.joints[0];
  ok('lengde 100', j && Math.abs(Math.hypot(j.b[0] - j.a[0], j.b[1] - j.a[1]) - 100) < 1e-6);
}

console.log('Kjede: ny del inntil to eksisterende');
{
  const r = autoJoints([sh('E1', R(0, 0, 100, 100)), sh('E2', R(0, 100, 100, 100)), sh('N', R(100, 0, 40, 200), 'new')], [], TOL);
  ok('to skjøter, én per eksisterende del', r.joints.length === 2 && new Set(r.joints.map((j) => j.pair[0])).size === 2);
}

console.log('Tegnet skjøt på samme kant vinner');
{
  const drawn = [{ id: 'j1', a: [100, 0], b: [100, 200] }];
  const r = autoJoints([sh('E', R(0, 0, 100, 200)), sh('N', R(100, 50, 40, 100), 'new')], drawn, TOL);
  ok('ingen automatisk skjøt', r.joints.length === 0);
}

console.log('Data følger delparet, ikke koordinatene');
{
  const state = {
    shapes: [sh('E', R(0, 0, 100, 200)), sh('N', R(100, 50, 40, 100), 'new')],
    joints: [],
    autoJointData: {},
  };
  const first = effectiveJoints(state);
  const id = first[0].id;
  state.autoJointData[id] = { qT: 2.5, connector: { rows: 2, spacing: 80, Kser: 3000 } };
  // Flytt begge delene sammen: kanten finnes fortsatt, med samme id.
  state.shapes = state.shapes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x + 500, y + 20]) }));
  const moved = effectiveJoints(state);
  ok('samme id etter flytting', moved.length === 1 && moved[0].id === id);
  ok('innstillingene følger med', moved[0].qT === 2.5 && moved[0].connector.spacing === 80);
  ok('ny posisjon', near(moved[0].a, [600, 70]) || near(moved[0].b, [600, 70]), JSON.stringify(moved[0]));
  ok('autonavn', /E/.test(moved[0].name) && /N/.test(moved[0].name), moved[0].name);
  // Flytt bare den nye delen bort: kanten forsvinner, og skjøten med den.
  state.shapes = [state.shapes[0], { ...state.shapes[1], points: state.shapes[1].points.map(([x, y]) => [x + 50, y]) }];
  ok('skjøten forsvinner når kanten gjør det', effectiveJoints(state).length === 0);
}

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
