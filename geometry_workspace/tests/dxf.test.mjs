/**
 * dxf.test.mjs — DXF-import (#85): parser, areallik diskretisering, sammensying
 * og hull.
 *
 *   node geometry_workspace/tests/dxf.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers. DXF-ene er
 * håndskrevne og små; fasitarealene er regnet for hånd i kommentarene.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const dxf = await import(url('../js/dxf.js'));
const { analyze, ringProps } = await import(url('../js/geometry.js'));
const { parseDxf, importDxf, describeImport, areaEqualRadius, circleRing, entitiesToPaths } = dxf;

let failed = 0;
let passed = 0;
function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const area = (ring) => Math.abs(ringProps(ring).A);

/* ---------------- små DXF-byggere ---------------- */

const wrap = (body, header = '') =>
  ['0', 'SECTION', '2', 'HEADER', header, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', body, '0', 'ENDSEC', '0', 'EOF']
    .filter((s) => s !== '')
    .join('\n');
const LINE = (x1, y1, x2, y2) => `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0`;
const CIRCLE = (x, y, r, extra = '') => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n40\n${r}${extra}`;
const ARC = (x, y, r, a0, a1) => `0\nARC\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n40\n${r}\n50\n${a0}\n51\n${a1}`;
const LWPOLY = (verts, closed = true) =>
  `0\nLWPOLYLINE\n8\n0\n90\n${verts.length}\n70\n${closed ? 1 : 0}\n` +
  verts.map(([x, y, b]) => `10\n${x}\n20\n${y}` + (b ? `\n42\n${b}` : '')).join('\n');

/* ---------------- 1. hulldekket fra akseptkriteriet ---------------- */

// Rektangel 1200 × 265 og sju Ø140-kanaler, c/c 165, midt i høyden.
// Analytisk: A = 1200·265 − 7·π·70² = 318 000 − 107 756,6 = 210 243,4 mm².
const A_HD = 1200 * 265 - 7 * Math.PI * 70 * 70;
const holeCentres = [0, 1, 2, 3, 4, 5, 6].map((k) => [600 + (k - 3) * 165, 132.5]);
const HD = wrap(
  LWPOLY([[0, 0], [1200, 0], [1200, 265], [0, 265]]) + '\n' + holeCentres.map(([x, y]) => CIRCLE(x, y, 70)).join('\n'),
  '9\n$INSUNITS\n70\n4'
);

console.log('Hulldekke 1200×265 med 7 × Ø140');
{
  const r = importDxf(HD);
  ok('én form', r.regions.length === 1, `fikk ${r.regions.length}`);
  ok('sju hull', r.regions[0] && r.regions[0].holes.length === 7);
  ok('$INSUNITS = 4 (mm) lest', r.insunits === 4 && dxf.INSUNITS_TO_UNIT[r.insunits] === 'mm');
  const net = area(r.regions[0].outer) - r.regions[0].holes.reduce((a, h) => a + area(h), 0);
  ok(`A = ${net.toFixed(1)} innenfor 0,5 % av ${A_HD.toFixed(1)}`, rel(net, A_HD) < 0.005, `avvik ${(100 * rel(net, A_HD)).toFixed(4)} %`);
  // Areallik: avviket er bare avrunding, ikke diskretisering
  ok('areallik — avvik < 1e-9', rel(net, A_HD) < 1e-9, `avvik ${rel(net, A_HD)}`);

  // Hele veien inn i workspacets modell: én solid + sju void-former, 'sum'.
  const shapes = [
    ...r.regions[0].holes.map((h, i) => ({ id: `h${i}`, points: h, role: 'void', include: true })),
    { id: 's', points: r.regions[0].outer, role: 'solid', include: true },
  ];
  const a = analyze(shapes, 'sum');
  ok(`analyze('sum').A = ${a.result.A.toFixed(1)}`, rel(a.result.A, A_HD) < 1e-9);
  const ap = analyze(shapes, 'priority');
  ok(`analyze('priority').A = ${ap.result.A.toFixed(1)} (hull foran i lista)`, rel(ap.result.A, A_HD) < 1e-6);
  ok('netArea fra Clipper stemmer', rel(a.netArea, A_HD) < 1e-6, `${a.netArea}`);
  // Tyngdepunkt: symmetrisk, (600, 132,5)
  ok('tyngdepunkt (600; 132,5)', Math.abs(a.result.cx - 600) < 1e-6 && Math.abs(a.result.cy - 132.5) < 1e-6);
}

console.log('Areallik sirkel');
{
  // n·R²·sin(2π/n)/2 = π·r²
  for (const n of [8, 32, 48]) {
    const ring = circleRing([0, 0], 70, n);
    ok(`n = ${n}: areal = π·70²`, rel(area(ring), Math.PI * 4900) < 1e-12);
  }
  // Innskrevet 32-kant ville gitt −0,64 % — R må være større enn r
  ok('R > r', areaEqualRadius(70, 32) > 70);
}

/* ---------------- 2. bue: sirkelsegment med kjent areal ---------------- */

console.log('Bue + korde = sirkelsegment');
{
  // r = 100, θ = 120°: A = r²/2·(θ − sin θ) = 5000·(2,094395 − 0,866025) = 6 141,85
  const th = (2 * Math.PI) / 3;
  const Aseg = (100 * 100) / 2 * (th - Math.sin(th));
  const a1 = [100 * Math.cos(th), 100 * Math.sin(th)];
  const r = importDxf(wrap(ARC(0, 0, 100, 0, 120) + '\n' + LINE(a1[0], a1[1], 100, 0)));
  ok('én form', r.regions.length === 1);
  const A = r.regions[0] ? area(r.regions[0].outer) : 0;
  ok(`A = ${A.toFixed(2)} innenfor 0,5 % av ${Aseg.toFixed(2)}`, rel(A, Aseg) < 0.005, `avvik ${(100 * rel(A, Aseg)).toFixed(4)} %`);
  ok('areallik — avvik < 1e-9', rel(A, Aseg) < 1e-9);
}

console.log('Bue som krysser 0° (350° → 10°)');
{
  // θ = 20°: A = 5000·(0,349066 − 0,342020) = 35,23
  const th = (20 * Math.PI) / 180;
  const Aseg = 5000 * (th - Math.sin(th));
  const p0 = [100 * Math.cos(-th / 2), 100 * Math.sin(-th / 2)];
  const p1 = [p0[0], -p0[1]];
  const r = importDxf(wrap(ARC(0, 0, 100, 350, 10) + '\n' + LINE(p1[0], p1[1], p0[0], p0[1])));
  ok('én form', r.regions.length === 1);
  const A = r.regions[0] ? area(r.regions[0].outer) : 0;
  ok(`A = ${A.toFixed(3)} ≈ ${Aseg.toFixed(3)}`, rel(A, Aseg) < 1e-9);
}

console.log('Bulge i LWPOLYLINE');
{
  // (0,0) bulge 1 → (200,0) → lukket: halvsirkel med r = 100. Bulge 1 er
  // mot klokka fra (0,0) til (200,0), altså under x-aksen. A = π·100²/2.
  const r = importDxf(wrap(LWPOLY([[0, 0, 1], [200, 0]])));
  ok('én form', r.regions.length === 1);
  const ring = r.regions[0] ? r.regions[0].outer : [];
  ok('halvsirkelens areal', rel(area(ring), (Math.PI * 1e4) / 2) < 1e-9, `${area(ring)}`);
  ok('buen går under x-aksen (positiv bulge = mot klokka)', ring.every((p) => p[1] <= 1e-9));
  // Negativ bulge: over x-aksen
  const r2 = importDxf(wrap(LWPOLY([[0, 0, -1], [200, 0]])));
  ok('negativ bulge: over x-aksen', r2.regions[0].outer.every((p) => p[1] >= -1e-9));
  // Avrundet rektangel: 200 × 100 med kvartsirkler R = 20 i hjørnene.
  // A = 200·100 − (4 − π)·20² = 20 000 − 343,36 = 19 656,64
  const b = Math.tan(Math.PI / 8); // 90° bue
  const rr = importDxf(wrap(LWPOLY([[20, 0], [180, 0, b], [200, 20], [200, 80, b], [180, 100], [20, 100, b], [0, 80], [0, 20, b]])));
  const Ar = 20000 - (4 - Math.PI) * 400;
  ok(`avrundet rektangel A = ${area(rr.regions[0].outer).toFixed(2)} ≈ ${Ar.toFixed(2)}`, rel(area(rr.regions[0].outer), Ar) < 1e-9);
}

/* ---------------- 3. løse linjer som må sys sammen ---------------- */

console.log('Løse linjer sys sammen');
{
  // Rektangel 300 × 200 av fire linjer i blandet rekkefølge og retning, med
  // en glippe på 1e-4 i ett hjørne. Pluss en Ø100-sirkel inni.
  const body = [
    LINE(300, 200, 0, 200), // baklengs
    LINE(0, 0, 300, 0),
    LINE(0, 200.0001, 0, 0), // glippe i (0, 200)
    LINE(300, 0, 300, 200),
    CIRCLE(150, 100, 50),
  ].join('\n');
  const r = importDxf(wrap(body));
  ok('én form', r.regions.length === 1, JSON.stringify(r.regions.map((x) => x.outer.length)));
  ok('ett hull', r.regions[0] && r.regions[0].holes.length === 1);
  ok('ingen åpne konturer', r.openCount === 0);
  const A = area(r.regions[0].outer) - area(r.regions[0].holes[0]);
  const Aa = 300 * 200 - Math.PI * 2500;
  ok(`A ≈ ${Aa.toFixed(1)}`, rel(A, Aa) < 1e-5, `${A}`);
  ok('rektangelet har fire hjørner', r.regions[0].outer.length === 4);
}

console.log('Åpen kontur meldes, importeres ikke');
{
  const r = importDxf(wrap([LINE(0, 0, 100, 0), LINE(100, 0, 100, 100), CIRCLE(500, 500, 10)].join('\n')));
  ok('bare sirkelen ble form', r.regions.length === 1);
  ok('én åpen kontur', r.openCount === 1);
  ok('meldingen sier det', /1 åpen kontur/.test(describeImport(r)), describeImport(r));
}

/* ---------------- 4. ustøttede entiteter ---------------- */

console.log('Ustøttet entitet telles og meldes');
{
  const evil = '<img src=x onerror=alert(1)>';
  const body = [
    CIRCLE(0, 0, 10),
    `0\nSPLINE\n8\n0\n70\n8\n71\n3`,
    `0\nSPLINE\n8\n0\n70\n8\n71\n3`,
    `0\nELLIPSE\n8\n0\n10\n0\n20\n0\n11\n5\n21\n0\n40\n0.5`,
    `0\nINSERT\n8\n0\n2\nBLOKK\n10\n0\n20\n0`,
    `0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n2.5\n1\n${evil}`,
  ].join('\n');
  const r = importDxf(wrap(body));
  ok('sirkelen er importert', r.regions.length === 1);
  ok('2 SPLINE', r.skipped.SPLINE === 2);
  ok('1 ELLIPSE, 1 INSERT, 1 TEXT', r.skipped.ELLIPSE === 1 && r.skipped.INSERT === 1 && r.skipped.TEXT === 1, JSON.stringify(r.skipped));
  const msg = describeImport(r);
  ok('meldingen teller 5 hoppet over', /Hoppet over 5/.test(msg) && /2 SPLINE/.test(msg), msg);
  ok('teksten fra fila er ikke med i meldingen', !msg.includes(evil) && !msg.includes('<'), msg);
}

/* ---------------- 5. diverse ---------------- */

console.log('Øy i et hull blir egen form');
{
  const body = [
    LWPOLY([[0, 0], [100, 0], [100, 100], [0, 100]]),
    LWPOLY([[10, 10], [90, 10], [90, 90], [10, 90]]),
    LWPOLY([[40, 40], [60, 40], [60, 60], [40, 60]]),
  ].join('\n');
  const r = importDxf(wrap(body));
  ok('to former', r.regions.length === 2);
  ok('den ytre har ett hull, øya ingen', r.regions[0].holes.length === 1 && r.regions[1].holes.length === 0);
  ok('ringer mot klokka', r.regions.every((g) => ringProps(g.outer).A > 0));
}

console.log('POLYLINE med VERTEX/SEQEND');
{
  const v = (x, y) => `0\nVERTEX\n8\n0\n10\n${x}\n20\n${y}\n30\n0`;
  const body = `0\nPOLYLINE\n8\n0\n66\n1\n70\n1\n${v(0, 0)}\n${v(50, 0)}\n${v(50, 40)}\n${v(0, 40)}\n0\nSEQEND\n8\n0\n${CIRCLE(500, 0, 5)}`;
  const r = importDxf(wrap(body));
  ok('to former (polylinja og sirkelen etter SEQEND)', r.regions.length === 2);
  ok('polylinja: 50 × 40', r.regions.some((g) => Math.abs(area(g.outer) - 2000) < 1e-9));
}

console.log('Speilet entitet (ekstrusjon 0,0,−1)');
{
  const parsed = parseDxf(wrap(CIRCLE(100, 20, 5, '\n210\n0\n220\n0\n230\n-1')));
  ok('x speilet til −100', parsed.entities[0].c[0] === -100 && parsed.entities[0].c[1] === 20);
  // Speilet bue 0°→90° om (0,0) i OCS ligger i 2. kvadrant i WCS
  const p = entitiesToPaths(parseDxf(wrap(ARC(0, 0, 10, 0, 90) + '\n210\n0\n220\n0\n230\n-1')).entities)[0];
  ok('speilet bue i 2. kvadrant', p.points.every(([x, y]) => x <= 1e-9 && y >= -1e-9));
}

console.log('Enhet ved import');
{
  const r = importDxf(wrap(LWPOLY([[0, 0], [1.2, 0], [1.2, 0.265], [0, 0.265]])), { scale: 1000 });
  ok('m → mm: 1,2 × 0,265 m = 318 000 mm²', Math.abs(area(r.regions[0].outer) - 318000) < 1e-6);
}

console.log('Feil som skal gi melding');
{
  let msg = '';
  try { parseDxf('AutoCAD Binary DXF\r\n\x1a\x00'); } catch (e) { msg = e.message; }
  ok('binær DXF avvises', /Binær/.test(msg));
  msg = '';
  try { parseDxf('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF'); } catch (e) { msg = e.message; }
  ok('uten ENTITIES avvises', /ENTITIES/.test(msg));
}

console.log('Eksempelfila tests/fixtures/hulldekke.dxf');
{
  const text = await readFile(fileURLToPath(new URL('./fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  const r = importDxf(text);
  ok('én form med sju hull', r.regions.length === 1 && r.regions[0].holes.length === 7);
  const net = area(r.regions[0].outer) - r.regions[0].holes.reduce((a, h) => a + area(h), 0);
  ok(`A innenfor 0,5 % (${(100 * rel(net, A_HD)).toExponential(2)} %)`, rel(net, A_HD) < 0.005);
  ok('ingen hoppet over', Object.keys(r.skipped).length === 0, JSON.stringify(r.skipped));
}

console.log(failed ? `\n${failed} FEIL, ${passed} ok` : `\nAlle tester bestått (${passed})`);
process.exit(failed ? 1 : 0);
