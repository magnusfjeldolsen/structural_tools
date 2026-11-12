/**
 * dxf-robust.test.mjs — DXF-import mot tegninger slik de faktisk ser ut (#85,
 * review av PR #86): fjerne entiteter, duplikat geometri, store tegninger,
 * koordinater langt fra origo og slurvete tall.
 *
 *   node geometry_workspace/tests/dxf-robust.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers. Hvert tilfelle
 * er reprodusert i reviewen; tallet koden ga FØR rettingen står i kommentaren.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../../cad2d/vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const dxf = await import(url('../../cad2d/js/io/dxf.js'));
const { analyze, ringProps } = await import(url('../../cad2d/js/geometry/polygon.js'));
const { exportSection, sectionProps } = await import(url('../../cad2d/js/io/section-export.js'));
const { importDxf, describeImport, parseDxf, shapeList, resolveDxfUnit } = dxf;

let failed = 0;
let passed = 0;
function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const area = (ring) => Math.abs(ringProps(ring).A);
const netOf = (res) => res.regions.reduce((a, g) => a + area(g.outer) - g.holes.reduce((s, h) => s + area(h), 0), 0);
const shapesOf = (res) => shapeList(res).map((s, i) => ({ id: `s${i}`, include: true, factor: 1, ...s }));

const wrap = (body, header = '') =>
  ['0', 'SECTION', '2', 'HEADER', header, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', body, '0', 'ENDSEC', '0', 'EOF']
    .filter((s) => s !== '')
    .join('\n');
const LINE = (x1, y1, x2, y2) => `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0`;
const CIRCLE = (x, y, r) => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n40\n${r}`;
const LWPOLY = (verts, closed = true) =>
  `0\nLWPOLYLINE\n8\n0\n90\n${verts.length}\n70\n${closed ? 1 : 0}\n` +
  verts.map(([x, y, b]) => `10\n${x}\n20\n${y}` + (b ? `\n42\n${b}` : '')).join('\n');
const RECT_LINES = (x, y, w, h) => [LINE(x, y, x + w, y), LINE(x + w, y, x + w, y + h), LINE(x + w, y + h, x, y + h), LINE(x, y + h, x, y)];

const A_HD = 1200 * 265 - 7 * Math.PI * 4900;
const hd = (X = 0, Y = 0) =>
  [...RECT_LINES(X, Y, 1200, 265), ...[0, 1, 2, 3, 4, 5, 6].map((k) => CIRCLE(X + 600 + (k - 3) * 165, Y + 132.5, 70))].join('\n');

/* ---------------- B1: toleransen blåses ikke opp av fjerne entiteter ---------------- */

console.log('B1 Fjern entitet blåser ikke opp toleransen');
{
  // FØR: toleranse 141 → 1 form, 0 hull, A = 318 000
  const r = importDxf(wrap(hd() + '\n' + CIRCLE(1e7, 1e7, 5)));
  const hdRegion = r.regions.find((g) => Math.abs(area(g.outer) - 318000) < 1);
  ok('hulldekket har fortsatt sju hull', hdRegion && hdRegion.holes.length === 7, describeImport(r));
  ok('den fjerne sirkelen er en egen form', r.regions.length === 2);
}

console.log('B1 Tegningsramme rundt et lite snitt');
{
  // Ramme 84 100 × 59 400 av LINE, snitt 300 × 300 med et Ø1-hull.
  // FØR: én form (ramma), snittet ble hull i ramma, Ø1-hullet borte.
  const frame = RECT_LINES(0, 0, 84100, 59400).join('\n');
  const sec = LWPOLY([[1000, 1000], [1300, 1000], [1300, 1300], [1000, 1300]]) + '\n' + CIRCLE(1150, 1150, 0.5);
  const r = importDxf(wrap(frame + '\n' + sec));
  const all = r.regions.flatMap((g) => [g.outer, ...g.holes]);
  ok('Ø1-hullet er med', all.some((ring) => Math.abs(area(ring) - Math.PI * 0.25) < 1e-9), describeImport(r));
  // En lukket ramme ER en kontur, og etter partallsregelen blir snittet hull i
  // den. Det kan ikke importen vite bedre uten lag; meldingen sier hva som
  // skjedde, og brukeren sletter ramma. Her låses at dybdene er riktige.
  ok('ramme → snitt som hull → Ø1 som øy (dybde 2)', r.regions.length === 2 && r.regions[1].depth === 2, JSON.stringify(r.regions.map((g) => g.depth)));
}

console.log('B1 Lite kvadrat i en stor tegning forsvinner ikke');
{
  // FØR: 0,5 mm-kvadratet i en 100 m lang plate ble borte uten melding
  const r = importDxf(wrap([LWPOLY([[0, 0], [100000, 0], [100000, 1000], [0, 1000]]), LWPOLY([[500, 500], [500.5, 500], [500.5, 500.5], [500, 500.5]])].join('\n')));
  ok('platen har ett hull på 0,25 mm²', r.regions[0].holes.length === 1 && Math.abs(area(r.regions[0].holes[0]) - 0.25) < 1e-9, describeImport(r));
}

console.log('B1 Ring som faller bort, telles og meldes');
{
  // Tre linjer fram og tilbake: lukket, men uten areal
  const r = importDxf(wrap([LWPOLY([[0, 0], [10, 0], [20, 0]]), CIRCLE(100, 100, 10)].join('\n')));
  ok('én ring uten areal er droppet og talt', r.dropped === 1, JSON.stringify(r.dropped));
  ok('meldingen sier det', /1 kontur uten areal/.test(describeImport(r)), describeImport(r));
}

/* ---------------- B3: duplikat geometri ---------------- */

console.log('B3 Dobbel kant');
{
  // FØR: 0 former
  for (const [name, extra] of [['samme retning', LINE(0, 0, 100, 0)], ['motsatt retning', LINE(100, 0, 0, 0)]]) {
    const r = importDxf(wrap([extra, ...RECT_LINES(0, 0, 100, 50)].join('\n')));
    ok(`${name}: én form på 5 000`, r.regions.length === 1 && Math.abs(area(r.regions[0].outer) - 5000) < 1e-9, describeImport(r));
    ok(`${name}: duplikatet er talt`, r.duplicates.segments === 1);
  }
  const r = importDxf(wrap([...RECT_LINES(0, 0, 100, 50), LINE(0, 0, 100, 0)].join('\n')));
  ok('duplikat sist: én form', r.regions.length === 1 && r.openCount === 0, describeImport(r));
  ok('meldingen sier 1 dobbel', /1 dobbel/.test(describeImport(r)), describeImport(r));
}

console.log('B3 Ytre kontur både som LWPOLYLINE og LINE');
{
  // FØR: sum.A = 968 584 (dobbelt), priority mistet hullet (500 000)
  const r = importDxf(wrap([LWPOLY([[0, 0], [1000, 0], [1000, 500], [0, 500]]), ...RECT_LINES(0, 0, 1000, 500), CIRCLE(500, 250, 100)].join('\n')));
  const expect = 5e5 - Math.PI * 1e4;
  ok('én form med ett hull', r.regions.length === 1 && r.regions[0].holes.length === 1, describeImport(r));
  ok('én kontur slått sammen', r.duplicates.rings === 1);
  const sh = shapesOf(r);
  ok('sum = priority = forventet', rel(analyze(sh, 'sum').result.A, expect) < 1e-9 && rel(analyze(sh, 'priority').result.A, expect) < 1e-9);
}

console.log('B3 Hull både som bulge-polylinje og CIRCLE');
{
  // FØR: den ene ble øy i den andre; sum.A = 1 000 000 (hullet fylt igjen)
  const r = importDxf(wrap([LWPOLY([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]), LWPOLY([[400, 500, 1], [600, 500, 1]]), CIRCLE(500, 500, 100)].join('\n')));
  ok('én form med ett hull', r.regions.length === 1 && r.regions[0].holes.length === 1, describeImport(r));
  ok('sum.A = 1e6 − π·100²', rel(analyze(shapesOf(r), 'sum').result.A, 1e6 - Math.PI * 1e4) < 1e-9);
}

console.log('B3 To identiske sirkler');
{
  // FØR: hullet trukket fra to ganger, sum.A = 7 486,7
  const r = importDxf(wrap([LWPOLY([[0, 0], [100, 0], [100, 100], [0, 100]]), CIRCLE(50, 50, 20), CIRCLE(50, 50, 20)].join('\n')));
  ok('ett hull', r.regions[0].holes.length === 1);
  ok('sum.A = 10 000 − π·400', rel(analyze(shapesOf(r), 'sum').result.A, 1e4 - Math.PI * 400) < 1e-9);
}

console.log('B3 Ytre kontur to ganger, 1e-6 forskjøvet');
{
  // FØR: den indre ble hull i den ytre, sirkelen øy; eksport «ok» med A ≈ 0
  const r = importDxf(wrap([LWPOLY([[0, 0], [1000, 0], [1000, 500], [0, 500]]), LWPOLY([[1e-6, 1e-6], [1000 - 1e-6, 1e-6], [1000 - 1e-6, 500 - 1e-6], [1e-6, 500 - 1e-6]]), CIRCLE(500, 250, 100)].join('\n')));
  ok('én form med ett hull', r.regions.length === 1 && r.regions[0].holes.length === 1, describeImport(r));
  const e = exportSection(shapesOf(r), { unit: 'mm' });
  ok('eksporten gir 5e5 − π·1e4', e.ok && rel(sectionProps(e.section).A, 5e5 - Math.PI * 1e4) < 1e-6, e.error);
}

console.log('B3 Nesten sammenfallende konturer gir advarsel');
{
  // To kvadrater som skiller seg med 0,005 % i areal: ikke like, men et hull
  // på 0,05 mm langs kanten av en 1 m plate er nesten sikkert en tegnefeil.
  const r = importDxf(wrap([LWPOLY([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]), LWPOLY([[0.01, 0.01], [999.99, 0.01], [999.99, 999.99], [0.01, 999.99]])].join('\n')));
  ok('ingen stille hull', r.regions.every((g) => g.holes.length === 0), JSON.stringify(r.regions.map((g) => g.holes.length)));
  ok('advarsel', r.nearDuplicates === 1 && /nesten sammenfallende/.test(describeImport(r)), describeImport(r));
}

/* ---------------- B4: ytelse ---------------- */

console.log('B4 2000 sirkler i et rektangel');
{
  // FØR: 134 s (500 sirkler: 5,9 s)
  const c = [LWPOLY([[-10, -10], [2010, -10], [2010, 2010], [-10, 2010]])];
  for (let i = 0; i < 2000; i++) c.push(CIRCLE((i % 100) * 20 + 5, Math.floor(i / 100) * 20 + 5, 4));
  const t = Date.now();
  const r = importDxf(wrap(c.join('\n')));
  const ms = Date.now() - t;
  ok(`2000 hull på ${ms} ms (< 2000)`, ms < 2000 && r.regions.length === 1 && r.regions[0].holes.length === 2000);
}

console.log('B4 2000 kvadrater av 8000 løse linjer');
{
  const parts = [];
  for (let i = 0; i < 2000; i++) parts.push(...RECT_LINES((i % 100) * 20, Math.floor(i / 100) * 20, 10, 10));
  const t = Date.now();
  const r = importDxf(wrap(parts.join('\n')));
  const ms = Date.now() - t;
  ok(`2000 former på ${ms} ms (< 2000)`, ms < 2000 && r.regions.length === 2000);
}

/* ---------------- B5: langt fra origo ---------------- */

console.log('B5 Hulldekke på 6,6e9 / 1e8 (delte koordinater)');
{
  const ref = analyze(shapesOf(importDxf(wrap(hd()))), 'sum').result;
  for (const [X, Y] of [[6.6e6, 1e5], [6.6e9, 1e8]]) {
    // FØR (6,6e9): A = 317 952 i ytterkonturen, rel. avvik i Ix 6e8
    const r = importDxf(wrap(hd(X, Y)));
    ok(`${X}: én form, sju hull`, r.regions.length === 1 && r.regions[0].holes.length === 7);
    ok(`${X}: flyttet til lokalt origo`, r.offset && r.offset[0] !== 0, JSON.stringify(r.offset));
    ok(`${X}: forskyvningen er i meldingen`, /Flyttet/.test(describeImport(r)), describeImport(r));
    const a = analyze(shapesOf(r), 'sum').result;
    ok(`${X}: A innen 1e-9 (${rel(a.A, ref.A).toExponential(1)})`, rel(a.A, ref.A) < 1e-9);
    ok(`${X}: Ix og Iy innen 1e-9`, rel(a.Ix, ref.Ix) < 1e-9 && rel(a.Iy, ref.Iy) < 1e-9, `${rel(a.Ix, ref.Ix)} ${rel(a.Iy, ref.Iy)}`);
    ok(`${X}: forskyvning + lokal = opprinnelig plassering`, Math.abs(r.offset[0] + Math.min(...r.regions[0].outer.map((p) => p[0])) - X) < 1e-3);
  }
  const near = importDxf(wrap(hd(2000, 0)));
  ok('nær origo: ikke flyttet', near.offset === null);
}

/* ---------------- F5/F6/F7/F11 ---------------- */

console.log('F5 Tomme linjer etter EOF');
{
  // FØR: «forventet en gruppekode»
  let err = '';
  try { importDxf(wrap(hd()) + '\r\n\r\n\n'); } catch (e) { err = e.message; }
  ok('ingen feil', err === '', err);
  try { importDxf(wrap(hd()) + '\n\u001a'); } catch (e) { err = e.message; }
  ok('søppel etter EOF ignoreres', err === '', err);
}

console.log('F6 Ugyldige tall avvises med linjenummer');
{
  // FØR: «1,5» ble stille 1, «abc» ble 0
  let err = '';
  try { parseDxf(wrap(LWPOLY([[0, 0], ['1,5', 0], ['1,5', 1], [0, 1]]))); } catch (e) { err = e.message; }
  ok('«1,5» avvist', /1,5/.test(err) && /linje \d+/.test(err), err);
  err = '';
  try { parseDxf(wrap(CIRCLE(0, 0, 'abc'))); } catch (e) { err = e.message; }
  ok('«abc» avvist', /abc/.test(err) && /linje \d+/.test(err), err);
  ok('1e3, -.5 og +2. godtas', parseDxf(wrap(CIRCLE('1e3', '-.5', '+2.'))).entities[0].r === 2);
}

console.log('F7 Parserens advarsler vises');
{
  const r = importDxf(wrap(CIRCLE(0, 0, 1) + '\n0\nVERTEX\n8\n0\n10\n0\n20\n0'));
  ok('advarselen er med i meldingen', r.warnings.length === 1 && describeImport(r).includes(r.warnings[0]), describeImport(r));
}

console.log('F11 $INSUNITS som forvalg');
{
  ok('auto + fila sier m → m, fra fila', JSON.stringify(resolveDxfUnit('auto', 6)) === '{"unit":"m","fromFile":true}');
  ok('auto + ingenting → mm, antatt', JSON.stringify(resolveDxfUnit('auto', null)) === '{"unit":"mm","fromFile":false}');
  ok('auto + ukjent (1 = tommer) → mm, antatt', resolveDxfUnit('auto', 1).unit === 'mm' && !resolveDxfUnit('auto', 1).fromFile);
  ok('brukerens valg overstyrer fila', resolveDxfUnit('cm', 6).unit === 'cm');
  // scale som funksjon av $INSUNITS
  const r = importDxf(wrap(LWPOLY([[0, 0], [1.2, 0], [1.2, 0.265], [0, 0.265]]), '9\n$INSUNITS\n70\n6'), {
    scale: (ins) => (resolveDxfUnit('auto', ins).unit === 'm' ? 1000 : 1),
  });
  ok('m-fil i mm-modell: 318 000 mm²', Math.abs(area(r.regions[0].outer) - 318000) < 1e-6);
}

console.log(failed ? `\n${failed} FEIL, ${passed} ok` : `\nAlle tester bestått (${passed})`);
process.exit(failed ? 1 : 0);
