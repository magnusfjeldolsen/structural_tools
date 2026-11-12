/**
 * area-consistency.test.mjs — samme areal overalt (#85, review av PR #86).
 *
 *   node geometry_workspace/tests/area-consistency.test.mjs
 *
 * Et tverrsnitt med hull skal gi samme A i 'sum', i 'priority', i det
 * panelet viser («Areal, skallmodell» / «Areal, fysisk») og i eksporten —
 * med hullet hvor som helst i formlista (hull skjærer alt fast areal).
 * Pluss: eksporten skriver aldri koordinater langt fra origo, og aldri
 * ringer som berører seg selv.
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const vendor = await readFile(fileURLToPath(new URL('../../cad2d/vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { analyze, ringProps } = await import(url('../../cad2d/js/geometry/polygon.js'));
const { exportSection, sectionProps } = await import(url('../../cad2d/js/io/section-export.js'));
const { importDxf, shapeList } = await import(url('../../cad2d/js/io/dxf.js'));
const { areaRows } = await import(url('../js/ui.js'));

let failed = 0;
let passed = 0;
function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);
const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const S = (id, p, e = {}) => ({ id, points: p, role: 'solid', include: true, factor: 1, ...e });
const V = (id, p) => ({ id, points: p, role: 'void', include: true, factor: 1 });
const shapesOf = (res) => shapeList(res).map((s, i) => ({ id: `s${i}`, include: true, factor: 1, ...s }));
const row = (rows, label) => (rows.find((r) => r.label.startsWith(label)) || {}).value;

const wrap = (body) => ['0', 'SECTION', '2', 'ENTITIES', body, '0', 'ENDSEC', '0', 'EOF'].join('\n');
const LWPOLY = (v) => `0\nLWPOLYLINE\n8\n0\n90\n${v.length}\n70\n1\n` + v.map(([x, y]) => `10\n${x}\n20\n${y}`).join('\n');
const CIRCLE = (x, y, r) => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n40\n${r}`;
const sq = (x0, s) => LWPOLY(R(x0, x0, s, s));

/* ---------------- Hullregelen: hull skjærer alt, i alle modi ---------------- */

// Brukerens avgjørelse (#86): et hull skjærer ALT fast areal det overlapper,
// uansett plass i formlista og modus. Øy i hull støttes ikke — øya skjæres bort,
// og det meldes. Hvert tilfelle kjøres med hullet både øverst og nederst.
const orders = (list) => [
  ['hull øverst', [...list.filter((x) => x.role === 'void'), ...list.filter((x) => x.role !== 'void')]],
  ['hull nederst', [...list.filter((x) => x.role !== 'void'), ...list.filter((x) => x.role === 'void')]],
];
function allAgree(name, list, expectA) {
  for (const [ord, sh] of orders(list)) {
    const s = analyze(sh, 'sum');
    const p = analyze(sh, 'priority');
    const rows = areaRows(s);
    const e = exportSection(sh, { unit: 'mm' });
    const eA = e.ok ? sectionProps(e.section).A : NaN;
    ok(
      `${name}, ${ord}: sum ${s.result.A.toFixed(1)}, priority ${p.result.A.toFixed(1)}, fysisk ${s.netArea.toFixed(1)}, skallmodell ${row(rows, 'Areal, skallmodell').toFixed(1)}, eksport ${eA.toFixed(1)} = ${expectA}`,
      [s.result.A, p.result.A, s.netArea, p.netArea, row(rows, 'Areal, skallmodell'), eA].every((v) => Math.abs(v - expectA) < 1e-6 * Math.max(1, expectA)),
      e.error
    );
  }
}

console.log('Hull nederst i lista skjærer like mye som øverst');
allAgree('hull 20×20 i 100×100', [S('a', R(0, 0, 100, 100)), V('h', R(10, 10, 20, 20))], 9600);
allAgree('hull som stikker ut', [S('a', R(0, 0, 100, 100)), V('h', R(-10, 40, 30, 20))], 9600);
allAgree('to hull som overlapper hverandre', [S('a', R(0, 0, 100, 100)), V('h1', R(10, 10, 20, 20)), V('h2', R(20, 10, 20, 20))], 10000 - 600);

console.log('Hull over et dobbelttalt overlapp skjærer begge formene i sum');
{
  // a og b overlapper i x 50..100; hullet 60..80 × 10..30 ligger i overlappet.
  // sum: 10 000 + 10 000 − 2·400 = 19 200. Fysisk: 15 000 − 400 = 14 600.
  for (const [ord, sh] of orders([S('a', R(0, 0, 100, 100)), S('b', R(50, 0, 100, 100)), V('h', R(60, 10, 20, 20))])) {
    const s = analyze(sh, 'sum');
    const p = analyze(sh, 'priority');
    ok(`${ord}: sum = 19 200, priority = fysisk = 14 600`, Math.abs(s.result.A - 19200) < 1e-6 && Math.abs(p.result.A - 14600) < 1e-6 && Math.abs(s.netArea - 14600) < 1e-6, `${s.result.A} ${p.result.A} ${s.netArea}`);
    const rows = areaRows(s);
    ok(`${ord}: overlapp-rad = 5 000 − 400`, Math.abs(row(rows, 'Herav overlapp') - 4600) < 1e-6, JSON.stringify(rows));
  }
}

console.log('Øy i hull: skåret bort, og det meldes');
{
  // Kvadrat 100, hull 80, øy 20: øya ligger helt i hullet → A = 10 000 − 6 400.
  // FØR (forrige runde): 4 000 med øya; nå støttes ikke øy i hull.
  const res = importDxf(wrap([sq(0, 100), sq(10, 80), sq(40, 20)].join('\n')));
  const sh = shapesOf(res);
  allAgree('øy i hull', sh, 3600);
  const s = analyze(sh, 'sum');
  ok('analyze.swallowed peker på øya', s.swallowed.length === 1 && sh.find((x) => x.id === s.swallowed[0]).name === 'DXF 2', JSON.stringify(s.swallowed));
  const e = exportSection(sh, { unit: 'mm' });
  ok('eksporten melder øya', e.ok && e.warnings.some((w) => /helt inne i et hull/.test(w)), JSON.stringify(e.warnings));
  const four = shapesOf(importDxf(wrap([sq(0, 100), sq(10, 80), sq(30, 40), sq(40, 20)].join('\n'))));
  allAgree('fire nivåer 100/80/40/20', four, 3600);
}

/* ---------------- B6: panelets arealtall ---------------- */

console.log('B6 Panelet viser samme areal som analyze og eksporten');
{
  // FØR: «Areal, skallmodell» 318 000, «Herav overlapp, telt to ganger» 107 757
  const text = await readFile(fileURLToPath(new URL('./fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  const sh = shapesOf(importDxf(text));
  const e = exportSection(sh, { unit: 'mm' });
  const Aexp = sectionProps(e.section).A;
  for (const m of ['sum', 'priority']) {
    const a = analyze(sh, m);
    const rows = areaRows(a);
    ok(`${m}: skallmodell = ${row(rows, 'Areal, skallmodell')} = eksport ${Aexp.toFixed(1)}`, rel(row(rows, 'Areal, skallmodell'), Aexp) < 1e-9);
    ok(`${m}: fysisk = eksport`, rel(row(rows, 'Areal, fysisk'), Aexp) < 1e-9);
    ok(`${m}: ingen overlapp-rad`, !rows.some((r) => /overlapp/i.test(r.label)), JSON.stringify(rows));
    ok(`${m}: analyze.A = eksport`, rel(a.result.A, Aexp) < 1e-9);
  }
  // Ekte overlapp vises fortsatt: to 100×100 som overlapper 50×100, pluss et hull
  const a = analyze([V('h', R(10, 10, 20, 20)), S('a', R(0, 0, 100, 100)), S('b', R(50, 0, 100, 100))], 'sum');
  const rows = areaRows(a);
  ok('overlapp: skallmodell = 20 000 − 400', Math.abs(row(rows, 'Areal, skallmodell') - 19600) < 1e-9, JSON.stringify(rows));
  ok('overlapp: fysisk = 15 000 − 400', Math.abs(row(rows, 'Areal, fysisk') - 14600) < 1e-9);
  ok('overlapp: «telt to ganger» = 5 000', Math.abs(row(rows, 'Herav overlapp') - 5000) < 1e-9);
}

/* ---------------- B5: eksport langt fra origo ---------------- */

console.log('B5 Eksport av former som ligger langt fra origo');
{
  const text = await readFile(fileURLToPath(new URL('./fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  const base = shapesOf(importDxf(text));
  const ref = sectionProps(exportSection(base, { unit: 'mm' }).section);
  // FØR (6,6e6): rel. avvik i I 8,7e-4, og koordinatene 6,6e6 ble skrevet ut
  const far = base.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x + 6.6e6, y + 1e5]) }));
  const e = exportSection(far, { unit: 'mm' });
  const p = sectionProps(e.section);
  ok('ok', e.ok, e.error);
  ok('koordinatene er lokale', Math.max(...e.section.outer.flat().map(Math.abs)) < 1e4, JSON.stringify(e.section.outer[0]));
  ok('forskyvningen meldes', e.warnings.some((w) => /Flyttet/.test(w)), JSON.stringify(e.warnings));
  ok(`A innen 1e-9 (${rel(p.A, ref.A).toExponential(1)})`, rel(p.A, ref.A) < 1e-9);
  ok(`I_y og I_z innen 1e-9 (${rel(p.Iy, ref.Iy).toExponential(1)}, ${rel(p.Iz, ref.Iz).toExponential(1)})`, rel(p.Iy, ref.Iy) < 1e-9 && rel(p.Iz, ref.Iz) < 1e-9);
  const nearOrigin = exportSection(base.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x + 2000, y]) })), { unit: 'mm' });
  ok('nær origo: ikke flyttet', nearOrigin.ok && Math.min(...nearOrigin.section.outer.map((q) => q[0])) === 2000);
}

/* ---------------- F1: ugyldige ringer ---------------- */

console.log('F1 Eksporten validerer ringene sine');
{
  const g = 1e-7;
  // Ramme av fire rektangler, ett forskjøvet 1e-7: FØR ga det en ytre ring som
  // berører seg selv i (10, 10) — ugyldig polygon hos mottakeren.
  const cases = {
    'ramme, venstre side 1e-7 høyere': [S('a', R(0, 0, 100, 10)), S('b', R(0, 10 + g, 10, 80 - g)), S('c', R(90, 10, 10, 80)), S('d', R(0, 90, 100, 10))],
    'ramme, toppen 1e-7 høyere': [S('a', R(0, 0, 100, 10)), S('b', R(0, 10, 10, 80)), S('c', R(90, 10, 10, 80)), S('d', R(0, 90 + g, 100, 10))],
    'hull som berører kanten i et punkt': [V('v', [[50, 0], [60, 10], [50, 20], [40, 10]]), S('a', R(0, 0, 100, 100))],
    'to hull som berører hverandre i et punkt': [V('v1', [[30, 40], [40, 50], [30, 60], [20, 50]]), V('v2', [[50, 40], [60, 50], [50, 60], [40, 50]]), S('a', R(0, 0, 100, 100))],
  };
  for (const [name, sh] of Object.entries(cases)) {
    const e = exportSection(sh, { unit: 'mm' });
    if (!e.ok) { ok(`${name}: nektet med melding`, /berører seg selv|uten areal|usammenhengende/.test(e.error), e.error); continue; }
    const rings = [e.section.outer, ...e.section.holes];
    const key = (q) => `${q[0]},${q[1]}`;
    const repeated = rings.some((ring) => new Set(ring.map(key)).size !== ring.length);
    const tinyHole = e.section.holes.some((h) => Math.abs(ringProps(h).A) < 1e-6);
    ok(`${name}: gyldig (ingen gjentatte punkt, ingen hull uten areal)`, !repeated && !tinyHole, JSON.stringify(e.section).slice(0, 200));
  }
  // Et vanlig, gyldig tilfelle skal fortsatt gå
  ok('vanlig hull går', exportSection([V('v', R(20, 20, 20, 20)), S('a', R(0, 0, 100, 100))], { unit: 'mm' }).ok);
}

console.log(failed ? `\n${failed} FEIL, ${passed} ok` : `\nAlle tester bestått (${passed})`);
process.exit(failed ? 1 : 0);
