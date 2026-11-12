/**
 * polygon.test.mjs — utvekslingsformatet, normaliseringen, tverrsnittsstørrelsene og
 * gyldighetskontrollen for fritt tverrsnitt (sak #83).
 *
 * Referansesnittet er den SAMME fila `test_polygon.py` bruker
 * (`fixtures/section-hd265-7holes.json`), mot de SAMME analytiske tallene. Det er det
 * som holder `polygon.js` og `csc_polygon.py` i takt: begge treffer samme fasit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  chordIntervals,
  circleInConcrete,
  normalizePolygon,
  parseSectionDocument,
  polygonBounds,
  polygonIssues,
  polygonProps,
  rectanglePolygon,
  SECTION_FORMAT,
  toSectionDocument,
} from '../js/polygon.js';

const HD265_TEXT = readFileSync(
  fileURLToPath(new URL('./fixtures/section-hd265-7holes.json', import.meta.url)), 'utf8');

const HD_B = 1200; const HD_H = 265; const HD_D = 140; const HD_N = 7;
const A_EXACT = HD_B * HD_H - HD_N * Math.PI * HD_D ** 2 / 4;
const IY_EXACT = HD_B * HD_H ** 3 / 12 - HD_N * Math.PI * HD_D ** 4 / 64;

function hd265() {
  const parsed = parseSectionDocument(HD265_TEXT);
  assert.equal(parsed.ok, true, parsed.error);
  return normalizePolygon(parsed.polygon);
}

/* ---------------- formatet ---------------- */

test('referansefila leses: 4 ytre hjørner, 7 hull à 32 hjørner, navn med', () => {
  const parsed = parseSectionDocument(HD265_TEXT);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.polygon.outer.length, 4);
  assert.equal(parsed.polygon.holes.length, 7);
  for (const h of parsed.polygon.holes) assert.equal(h.length, 32);
  assert.match(parsed.name, /HD265/);
});

test('formatet: feil «format», versjon og enhet avvises med melding, kaster aldri', () => {
  const base = { format: SECTION_FORMAT, version: 1, units: 'mm', outer: [[0, 0], [1, 0], [1, 1]] };
  for (const [doc, re] of [
    ['{ ikke json', /not valid JSON/],
    ['[1,2]', /JSON object/],
    [{ ...base, format: 'noe-annet' }, /not a cross-section file/],
    [{ ...base, version: 2 }, /Unsupported version/],
    [{ ...base, units: 'm' }, /only "mm"/],
    [{ ...base, outer: [[0, 0], [1, 0]] }, /at least three distinct/],
    [{ ...base, outer: [[0, 0], [1, 0], [1, 'x']] }, /finite number pair/],
    [{ ...base, outer: [[0, 0], [1, 0], [1]] }, /\[y, z\] pair/],
    [{ ...base, holes: 'nei' }, /list of rings/],
    [null, /JSON object/],
  ]) {
    const r = parseSectionDocument(doc);
    assert.equal(r.ok, false, JSON.stringify(doc));
    assert.match(r.error, re);
  }
});

test('formatet: lukket ring godtas (siste punkt = første fjernes), holes kan mangle', () => {
  const r = parseSectionDocument({
    format: SECTION_FORMAT, version: 1, units: 'mm',
    outer: [[0, 0], [10, 0], [10, 5], [0, 5], [0, 0]],
  });
  assert.equal(r.ok, true);
  assert.equal(r.polygon.outer.length, 4);
  assert.deepEqual(r.polygon.holes, []);
});

test('toSectionDocument → parseSectionDocument er en rundtur', () => {
  const p = hd265();
  const back = parseSectionDocument(JSON.stringify(toSectionDocument(p, 'x')));
  assert.equal(back.ok, true);
  assert.deepEqual(back.polygon, p);
  assert.equal(back.name, 'x');
});

/* ---------------- normalisering ---------------- */

test('normalizePolygon: omskrevet rektangel sentrert i origo, idempotent', () => {
  const p = hd265();
  const b = polygonBounds(p);
  assert.equal(b.yMin, -600); assert.equal(b.yMax, 600);
  assert.equal(b.zMin, -132.5); assert.equal(b.zMax, 132.5);
  assert.deepEqual(normalizePolygon(p), p, 'en andre normalisering skal ikke flytte noe');
});

/* ---------------- størrelser: akseptkriterium 1 ---------------- */

test('A og I_y for referansesnittet innenfor 0,5 % av sirkelhullene (akseptkriterium)', () => {
  const props = polygonProps(hd265());
  const errA = props.area / A_EXACT - 1;
  const errI = props.I_y / IY_EXACT - 1;
  assert.ok(Math.abs(errA) < 0.005, `A avviker ${(errA * 100).toFixed(3)} %`);
  assert.ok(Math.abs(errI) < 0.005, `I_y avviker ${(errI * 100).toFixed(3)} %`);
  // Innskrevet mangekant: MINDRE hull, MER betong — begge feilene er positive.
  assert.ok(errA > 0 && errI > 0);
  assert.ok(Math.abs(props.z_c) < 1e-9);
});

test('polygonProps: rektangel gir b·h, b·h³/12, uansett omløpsretning', () => {
  const ccw = rectanglePolygon(300, 600);
  const cw = { outer: [...ccw.outer].reverse(), holes: [] };
  for (const p of [ccw, cw]) {
    const props = polygonProps(p);
    assert.equal(props.area, 180000);
    assert.ok(Math.abs(props.I_y / (300 * 600 ** 3 / 12) - 1) < 1e-14);
    assert.equal(props.b, 300); assert.equal(props.h, 600);
    assert.equal(props.perimeter_outer, 1800);
  }
});

test('polygonProps: T-snitt — tyngdepunkt og Steiner for hånd', () => {
  // Flens 600×100 over steg 200×400. Underkant z = 0.
  const t = { outer: [[-300, 400], [-300, 500], [300, 500], [300, 400], [100, 400], [100, 0],
    [-100, 0], [-100, 400]], holes: [] };
  const p = polygonProps(t);
  const aF = 60000; const aW = 80000;
  const zc = (aF * 450 + aW * 200) / (aF + aW);
  const iy = 600 * 100 ** 3 / 12 + aF * (450 - zc) ** 2 + 200 * 400 ** 3 / 12 + aW * (200 - zc) ** 2;
  assert.equal(p.area, aF + aW);
  assert.ok(Math.abs(p.z_c - zc) < 1e-9);
  assert.ok(Math.abs(p.I_y / iy - 1) < 1e-12);
});

/* ---------------- gyldighet ---------------- */

const sq = (cy, cz, a) => [[cy - a, cz - a], [cy + a, cz - a], [cy + a, cz + a], [cy - a, cz + a]];

test('polygonIssues: referansesnittet og rektangelet er gyldige', () => {
  assert.deepEqual(polygonIssues(hd265()), []);
  assert.deepEqual(polygonIssues(rectanglePolygon(300, 600)), []);
});

test('polygonIssues: samme fire feil som motoren fanger', () => {
  const outer = rectanglePolygon(400, 400).outer;
  const cases = [
    [{ outer, holes: [sq(0, 0, 50), sq(60, 0, 50)] }, 'polygon_holes_overlap'],
    [{ outer, holes: [sq(0, 0, 50), sq(100, 0, 50)] }, 'polygon_holes_overlap'], // berører
    [{ outer, holes: [sq(0, 0, 50), sq(0, 0, 20)] }, 'polygon_holes_overlap'], // ligger inni
    [{ outer, holes: [sq(180, 0, 50)] }, 'polygon_hole_outside'],
    [{ outer, holes: [sq(150, 0, 50)] }, 'polygon_hole_outside'], // berører randen
    [{ outer: [[-200, -200], [200, 200], [200, -200], [-200, 200]], holes: [] }, 'polygon_outer_invalid'],
    [{ outer, holes: [[[0, 0], [10, 10], [10, 0], [0, 10]]] }, 'polygon_hole_invalid'],
    [null, 'polygon_missing'],
  ];
  for (const [poly, code] of cases) {
    const issues = polygonIssues(poly);
    assert.ok(issues.some((i) => i.code === code), `${code}: fikk ${JSON.stringify(issues)}`);
  }
});

/* ---------------- kord og innsideprøve ---------------- */

test('chordIntervals: hulldekket i underflensen er ett parti, gjennom hullene åtte', () => {
  const p = hd265();
  assert.deepEqual(chordIntervals(p, -132.5 + 35), [[-600, 600]]);
  assert.equal(chordIntervals(p, 0).length, 8);
});

test('chordIntervals: T-snitt — steget nede, flensen oppe', () => {
  const t = normalizePolygon({ outer: [[-300, 400], [-300, 500], [300, 500], [300, 400],
    [100, 400], [100, 0], [-100, 0], [-100, 400]], holes: [] });
  assert.deepEqual(chordIntervals(t, -200), [[-100, 100]]);
  assert.deepEqual(chordIntervals(t, 230), [[-300, 300]]);
});

test('circleInConcrete: jern i hull, jern ved randen, jern i betong', () => {
  const p = hd265();
  assert.equal(circleInConcrete(p, 0, 0, 6), false, 'midt i hull 4');
  assert.equal(circleInConcrete(p, 0, -132.5 + 35, 6), true, 'underflensen');
  assert.equal(circleInConcrete(p, 0, -132.5 + 5, 6), false, 'stikker ut under');
  assert.equal(circleInConcrete(p, 0, -70 - 5, 6), false, 'stikker inn i hullet');
});
