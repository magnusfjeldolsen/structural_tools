/**
 * section-export.test.mjs — «Eksporter tverrsnitt» (#85): ett ytre polygon med
 * hull på formatet `structural-tools-section` v1, som concrete_section_calculator
 * leser (#83).
 *
 *   node geometry_workspace/tests/section-export.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Akser: workspacet har x mot høyre og y OPP (geometry.js, screenToWorld i
 * viewport.js snur skjermens y). Formatet har y vannrett og z opp. Altså
 *   y_snitt = x_workspace,  z_snitt = y_workspace
 * — ingen speiling, bare nye navn. Testene under låser det med en form som
 * ligger høyt oppe og en som er usymmetrisk.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { exportSection, sectionProps } = await import(url('../js/section-export.js'));
const { analyze, ringProps } = await import(url('../js/geometry.js'));
const { importDxf } = await import(url('../js/dxf.js'));

let failed = 0;
let passed = 0;
function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);
const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const solid = (id, points, extra = {}) => ({ id, points, role: 'solid', include: true, factor: 1, ...extra });
const hole = (id, points) => ({ id, points, role: 'void', include: true, factor: 1 });

console.log('Formatet');
{
  const r = exportSection([solid('a', R(0, 0, 100, 50))], { unit: 'mm' });
  ok('ok', r.ok, r.error);
  const s = r.section;
  ok('format/version/units', s.format === 'structural-tools-section' && s.version === 1 && s.units === 'mm');
  ok('nøklene i kontraktens rekkefølge', JSON.stringify(Object.keys(s)) === '["format","version","units","outer","holes"]', Object.keys(s).join());
  ok('åpen ring (siste ≠ første)', s.outer.length === 4 && JSON.stringify(s.outer[0]) !== JSON.stringify(s.outer[3]));
  ok('holes er en tom liste', Array.isArray(s.holes) && s.holes.length === 0);
  ok('ytre ring mot klokka i (y, z)', ringProps(s.outer).A > 0);
}

console.log('Akser: y = x, z = y (opp er opp)');
{
  // Rektangel x ∈ [0, 100], y ∈ [200, 250] → y ∈ [0, 100], z ∈ [200, 250]
  const s = exportSection([solid('a', R(0, 200, 100, 50))], { unit: 'mm' }).section;
  const ys = s.outer.map((p) => p[0]);
  const zs = s.outer.map((p) => p[1]);
  ok('y-spenn 0 … 100', Math.min(...ys) === 0 && Math.max(...ys) === 100);
  ok('z-spenn 200 … 250 (ikke speilet til −250 … −200)', Math.min(...zs) === 200 && Math.max(...zs) === 250);

  // Usymmetrisk T: flens øverst. Tyngdepunktet skal ligge over midthøyden.
  // Flens 200 × 40 i z ∈ [260, 300], steg 40 × 260 i z ∈ [0, 260].
  // A = 8000 + 10 400 = 18 400; z_c = (8000·280 + 10 400·130)/18 400 = 195,22
  const t = exportSection([solid('f', R(0, 260, 200, 40)), solid('w', R(80, 0, 40, 260))], { unit: 'mm' });
  ok('T: ett sammenhengende polygon', t.ok, t.error);
  const p = sectionProps(t.section);
  ok(`T: A = ${p.A.toFixed(1)} = 18 400`, Math.abs(p.A - 18400) < 1e-6);
  ok(`T: z_c = ${p.zc.toFixed(2)} = 195,22 (flensen er oppe)`, Math.abs(p.zc - (8000 * 280 + 10400 * 130) / 18400) < 1e-6);
  ok('T: y_c = 100', Math.abs(p.yc - 100) < 1e-9);
}

console.log('Hulldekke: eksport gir samme A og I som workspacet');
{
  const text = await readFile(fileURLToPath(new URL('./fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  // Importert i meter, slik at enhetsomregningen også testes: k = 1000
  const imp = importDxf(text, { scale: 0.001 });
  const g = imp.regions[0];
  const shapes = [...g.holes.map((h, i) => hole(`h${i}`, h)), solid('s', g.outer)];
  const ws = analyze(shapes, 'sum').result; // i m
  const r = exportSection(shapes, { unit: 'm' });
  ok('ok', r.ok, r.error);
  ok('sju hull', r.section.holes.length === 7);
  ok('hullene er åpne ringer med klokka', r.section.holes.every((h) => ringProps(h).A < 0 && JSON.stringify(h[0]) !== JSON.stringify(h[h.length - 1])));
  const p = sectionProps(r.section); // i mm
  const A_HD = 1200 * 265 - 7 * Math.PI * 4900;
  ok(`A = ${p.A.toFixed(1)} mm² = workspacet × 10⁶`, rel(p.A, ws.A * 1e6) < 1e-9);
  ok('A innenfor 0,5 % av analytisk', rel(p.A, A_HD) < 0.005, `${(100 * rel(p.A, A_HD)).toFixed(5)} %`);
  // I om horisontal tyngdepunktsakse: formatets I_y (∫z²) = workspacets Ix (∫y²)
  ok(`I_y = ${p.Iy.toExponential(6)} mm⁴ = workspacets Ix × 10¹²`, rel(p.Iy, ws.Ix * 1e12) < 1e-9, `${ws.Ix * 1e12}`);
  ok(`I_z = ${p.Iz.toExponential(6)} mm⁴ = workspacets Iy × 10¹²`, rel(p.Iz, ws.Iy * 1e12) < 1e-9);
  // Analytisk I_y: bh³/12 − 7·πr⁴/4 (kanalene på tyngdeaksen) = 1,8609e9 − 7·1,8857e7
  const Iy_an = (1200 * 265 ** 3) / 12 - 7 * (Math.PI * 70 ** 4) / 4;
  ok(`I_y innenfor 0,5 % av analytisk ${Iy_an.toExponential(5)}`, rel(p.Iy, Iy_an) < 0.005, `${(100 * rel(p.Iy, Iy_an)).toFixed(4)} %`);
}

console.log('Usammenhengende ytre konturer gir melding, ikke stille union');
{
  const shapes = [solid('a', R(0, 0, 100, 100)), solid('b', R(300, 0, 100, 100))];
  const r = exportSection(shapes, { unit: 'mm' });
  ok('avvist', r.ok === false && !r.section);
  ok('meldingen sier 2 deler', /2 usammenhengende/.test(r.error || ''), r.error);
  // Med bare den ene markert går det
  const r2 = exportSection(shapes, { unit: 'mm', selection: ['b'] });
  ok('markert del eksporteres alene', r2.ok && Math.abs(sectionProps(r2.section).A - 1e4) < 1e-9);
  ok('… og ligger der den ligger (y 300 … 400)', Math.min(...r2.section.outer.map((p) => p[0])) === 300);
}

console.log('Union av formene minus hull');
{
  // To rektangler som deler en kant blir ett; overlapp telles én gang og meldes
  const r = exportSection([hole('h', R(10, 10, 20, 20)), solid('a', R(0, 0, 100, 100)), solid('b', R(50, 0, 100, 100))], { unit: 'mm' });
  ok('ok', r.ok, r.error);
  ok('A = 150·100 − 20·20 = 14 600', Math.abs(sectionProps(r.section).A - 14600) < 1e-6);
  ok('overlappet meldes', r.warnings.some((w) => /overlapp/i.test(w)), JSON.stringify(r.warnings));
  // Utelatte former og hull utenfor
  const r2 = exportSection([solid('a', R(0, 0, 100, 100)), solid('x', R(500, 0, 10, 10), { include: false })], { unit: 'mm' });
  ok('form med include:false er ikke med', r2.ok && Math.abs(sectionProps(r2.section).A - 1e4) < 1e-9);
  // Hull som skjærer kanten blir en del av ytterkonturen, ikke et hull
  const r3 = exportSection([hole('n', R(-10, 40, 30, 20)), solid('a', R(0, 0, 100, 100))], { unit: 'mm' });
  ok('hakk i kanten: ingen hull, A = 10 000 − 400', r3.ok && r3.section.holes.length === 0 && Math.abs(sectionProps(r3.section).A - 9600) < 1e-6);
  // Vektfaktor ≠ 1 kan ikke uttrykkes i formatet
  const r4 = exportSection([solid('a', R(0, 0, 100, 100), { factor: 0.5 })], { unit: 'mm' });
  ok('vektfaktor meldes', r4.ok && r4.warnings.some((w) => /faktor/i.test(w)), JSON.stringify(r4.warnings));
}

console.log('Hullets plass i lista spiller ingen rolle');
{
  // Et hull skjærer alt fast areal det overlapper (#86), øverst eller nederst.
  for (const [ord, list] of [
    ['hull nederst', [solid('a', R(0, 0, 100, 100)), hole('h', R(10, 10, 20, 20))]],
    ['hull øverst', [hole('h', R(10, 10, 20, 20)), solid('a', R(0, 0, 100, 100))]],
  ]) {
    const r = exportSection(list, { unit: 'mm' });
    ok(`${ord}: A = 9 600, ingen advarsel`, r.ok && Math.abs(sectionProps(r.section).A - 9600) < 1e-9 && r.warnings.length === 0, JSON.stringify(r.warnings));
  }
  // Testene over med hullene flyttet nederst gir samme tall
  const r = exportSection([solid('a', R(0, 0, 100, 100)), solid('b', R(50, 0, 100, 100)), hole('h', R(10, 10, 20, 20))], { unit: 'mm' });
  ok('union minus hull, hull nederst: 14 600', Math.abs(sectionProps(r.section).A - 14600) < 1e-6);
  const r3 = exportSection([solid('a', R(0, 0, 100, 100)), hole('n', R(-10, 40, 30, 20))], { unit: 'mm' });
  ok('hakk i kanten, hull nederst: 9 600, ingen hull', r3.ok && r3.section.holes.length === 0 && Math.abs(sectionProps(r3.section).A - 9600) < 1e-6);
  const r5 = exportSection([solid('a', R(0, 0, 10, 10)), hole('h', R(-5, -5, 30, 30))], { unit: 'mm' });
  ok('hullet spiser alt, hull nederst', r5.ok === false && /ingen/i.test(r5.error), r5.error);
}

console.log('Ingenting å eksportere');
{
  ok('tom modell', exportSection([], { unit: 'mm' }).ok === false);
  ok('bare hull', exportSection([hole('h', R(0, 0, 10, 10))], { unit: 'mm' }).ok === false);
  const r = exportSection([hole('h', R(-5, -5, 30, 30)), solid('a', R(0, 0, 10, 10))], { unit: 'mm' });
  ok('hullet spiser alt', r.ok === false && /ingen/i.test(r.error), r.error);
}

console.log(failed ? `\n${failed} FEIL, ${passed} ok` : `\nAlle tester bestått (${passed})`);
process.exit(failed ? 1 : 0);
