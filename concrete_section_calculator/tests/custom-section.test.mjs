/**
 * custom-section.test.mjs — fritt tverrsnitt gjennom tilstand, payload, validering,
 * tegning og lagring (sak #83).
 *
 * Det viktigste kravet her er det veikartet kaller husets feilform: TO KILDER TIL SAMME
 * TALL. Polygonet er den ene kilden; `geometry.b`/`h`, jernkoordinatene, arealet, `h₀`
 * og figuren skal alle være avledet av det, og testene sammenlikner dem med hverandre i
 * stedet for med konstanter.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildPayload } from '../js/payload.js';
import { createStore } from '../js/store.js';
import { parseSectionDocument, polygonProps } from '../js/polygon.js';
import { barPositions, stirrupCoverDia } from '../js/rebar.js';
import { barGeometry, derived, grossArea, minShearChord, sectionHeight, sectionWidth, validate } from '../js/section.js';
import { EPS_A_LABEL } from '../js/results.js';
import { buildReportHtml } from '../js/report.js';
import { CUSTOM_HOLE_PERIMETER_WEIGHT, notionalSize } from '../js/materials.js';
import { fromDocument, toDocument } from '../js/serialize.js';
import { drawSection } from '../js/section-draw.js';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const HD265 = parseSectionDocument(readFileSync(fixture('section-hd265-7holes.json'), 'utf8')).polygon;

/**
 * Referansetilstanden: hulldekket, 10 Ø12 i underflensen 35 mm fra underkant, ingen
 * bøyler, b_w = summen av stegene (1200 − 7·140 = 220), én ULS-rad med skjær.
 * `payload-custom-hd265.json` er `buildPayload` av NØYAKTIG denne tilstanden, og
 * `test_polygon.py` kjører den samme fila gjennom motoren.
 */
export function hd265Store() {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon(HD265);
  store.patch('geometry', { bw: 220 });
  for (const st of store.getState().shear.stirrups) store.removeStirrup(st.id);
  const id = store.getState().layers[0].id;
  store.updateLayer(id, { dia: 12, count: 10, dc: 35 });
  store.updateCombo(store.getState().combos[0].id, { M_Ed: -50, V_Ed: 100 });
  store.patch('concrete', { alpha_cc: 1.0 });
  return store;
}

/* ---------------- tilstand ---------------- */

test('fersk «custom» er bjelkens 300×600 som polygon, med b_w = 300', () => {
  const store = createStore();
  store.setSectionType('custom');
  const s = store.getState();
  assert.equal(s.sectionType, 'custom');
  assert.equal(sectionWidth(s), 300);
  assert.equal(sectionHeight(s), 600);
  assert.equal(grossArea(s), 180000);
  assert.equal(s.geometry.bw, 300);
});

test('rektangel som polygon: payloadens jern er NØYAKTIG bjelkens jern', () => {
  const beam = createStore();
  const custom = createStore();
  custom.setSectionType('custom');
  const pb = buildPayload(beam.getState());
  const pc = buildPayload(custom.getState());
  // Id-en er ny (`L2`: løpenummeret teller aldri ned), alt annet skal være likt.
  const noId = (rebar) => rebar.map(({ id, ...rest }) => rest);
  assert.deepEqual(noId(pc.section.rebar), noId(pb.section.rebar));
  assert.equal(pc.section.shape, 'polygon');
  assert.ok(!('b' in pc.section) && !('h' in pc.section), 'polygonet ER geometrien — ikke b/h i tillegg');
  assert.equal(pc.section.bw, 300);
});

test('setCustomPolygon: normaliserer, setter b/h fra polygonet, nullstiller b_w', () => {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon(HD265);
  const s = store.getState();
  assert.equal(s.geometry.b, 1200);
  assert.equal(s.geometry.h, 265);
  assert.equal(s.geometry.bw, null);
  assert.equal(s.geometry.outer[0][0], -600);
  assert.equal(s.geometry.outer[0][1], -132.5);
  assert.equal(grossArea(s), polygonProps(HD265).area);
});

test('setCustomPolygon er en no-op når typen ikke er custom', () => {
  const store = createStore();
  assert.equal(store.setCustomPolygon(HD265), null);
  assert.ok(!('outer' in store.getState().geometry));
});

test('b/h kan ikke skrives forbi polygonet — patch(h) på et polygon rettes tilbake', () => {
  const store = hd265Store();
  store.patch('geometry', { h: 400, b: 10 });
  const s = store.getState();
  assert.equal(s.geometry.h, 265);
  assert.equal(s.geometry.b, 1200);
});

test('parkering: custom → bjelke → custom gir tilbake det samme polygonet', () => {
  const store = hd265Store();
  const before = JSON.stringify(store.getState().geometry);
  store.setSectionType('beam');
  assert.equal(store.getState().geometry.b, 300);
  assert.ok(!('outer' in store.getState().geometry));
  store.setSectionType('custom');
  assert.equal(JSON.stringify(store.getState().geometry), before);
});

test('lagret fil runder tilbake til nøyaktig samme polygon og b_w', () => {
  const store = hd265Store();
  const doc = JSON.parse(JSON.stringify(toDocument(store.getState())));
  const { state } = fromDocument(doc);
  const back = createStore();
  back.replaceState(state);
  assert.deepEqual(back.getState().geometry, store.getState().geometry);
  assert.deepEqual(buildPayload(back.getState()), buildPayload(store.getState()));
});

/* ---------------- avledede tall ---------------- */

test('derived(): A_g fra polygonet, b_t/ρ/A_s,min ikke tilgjengelig (NaN), A_s,max = 0,04·A_c', () => {
  const s = hd265Store().getState();
  const d = derived(s);
  assert.equal(d.Ag, polygonProps(HD265).area);
  assert.ok(Number.isNaN(d.b_t));
  assert.ok(Number.isNaN(d.rho));
  assert.ok(Number.isNaN(d.As_min));
  assert.equal(d.As_max, 0.04 * d.Ag);
});

test('h₀ = 2A/(u_ytre + ½·u_hull) for et fritt tverrsnitt', () => {
  const s = hd265Store().getState();
  const p = polygonProps(HD265);
  assert.equal(CUSTOM_HOLE_PERIMETER_WEIGHT, 0.5);
  const expected = (2 * p.area) / (p.perimeter_outer + 0.5 * p.perimeter_holes);
  assert.ok(Math.abs(notionalSize(s) - expected) < 1e-9);
  // Rektangelet som polygon har ingen hull: samme h₀ som bjelken.
  const beam = createStore().getState();
  const rect = createStore();
  rect.setSectionType('custom');
  assert.ok(Math.abs(notionalSize(rect.getState()) - notionalSize(beam)) < 1e-9);
});

/* ---------------- jernplassering og validering ---------------- */

test('jernene i underflensen fordeles over hele bredden, innenfor sidedekningen', () => {
  const s = hd265Store().getState();
  const bars = barPositions(s.layers[0], barGeometry(s), { ...s, stirrup_dia: stirrupCoverDia(s) });
  assert.equal(bars.length, 10);
  assert.equal(bars[0].y, -600 + 35 + 6);
  assert.equal(bars[9].y, 600 - 35 - 6);
  assert.equal(bars[0].z, -132.5 + 35);
  assert.deepEqual(validate(s).filter((m) => m.severity === 'error'), []);
});

test('T-snitt: underkantlaget havner i steget, ikke ut i lufta under flensen', () => {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon({ outer: [[-300, 400], [-300, 500], [300, 500], [300, 400], [100, 400],
    [100, 0], [-100, 0], [-100, 400]], holes: [] });
  const s = store.getState();
  const bars = barPositions(s.layers[0], barGeometry(s), { ...s, stirrup_dia: stirrupCoverDia(s) });
  for (const b of bars) assert.ok(Math.abs(b.y) <= 100 - 35, `y = ${b.y} utenfor steget`);
  assert.deepEqual(buildPayload(s).section.rebar[0].bars, bars, 'payload og tegning: samme jern');
});

test('standardlaget 3Ø20 i hulldekket stikker inn i et hull: bar_outside_concrete', () => {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon(HD265);
  const codes = validate(store.getState()).map((m) => m.code);
  assert.ok(codes.includes('bar_outside_concrete'), codes.join(', '));
});

test('et lag i hullhøyden: layer_span_ambiguous, ikke et stille valg av ett parti', () => {
  const store = hd265Store();
  store.updateLayer(store.getState().layers[0].id, { dc: 132.5 });
  const m = validate(store.getState()).find((x) => x.code === 'layer_span_ambiguous');
  assert.ok(m, 'mangler layer_span_ambiguous');
  assert.equal(m.severity, 'error');
  assert.match(m.message, /8 partier/);
});

test('b_w mangler og V_Ed ≠ 0: advarsel bw_missing, og payloaden har ingen bw', () => {
  const store = hd265Store();
  store.patch('geometry', { bw: null });
  const s = store.getState();
  assert.ok(validate(s).some((m) => m.code === 'bw_missing' && m.severity === 'warning'));
  assert.ok(!('bw' in buildPayload(s).section));
});

test('ugyldig polygon: polygonfeilen står i skjemaet med detaljen', () => {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon({ outer: [[-200, -200], [200, -200], [200, 200], [-200, 200]],
    holes: [[[-50, -50], [50, -50], [50, 50], [-50, 50]], [[10, -50], [110, -50], [110, 50], [10, 50]]] });
  const m = validate(store.getState()).find((x) => x.code === 'polygon_holes_overlap');
  assert.ok(m && m.severity === 'error');
  assert.match(m.detail, /Holes 1 and 2/);
});

/* ---------------- tegning ---------------- */

test('figuren tegner polygonet med hull (evenodd), ikke et rektangel', () => {
  const s = hd265Store().getState();
  const svg = drawSection(s);
  assert.match(svg, /fill-rule="evenodd"/);
  // Én underbane per ring: ytre + 7 hull.
  const path = svg.match(/<path[^>]*class="[^"]*sd-concrete[^"]*"[^>]*d="([^"]+)"/) ||
    svg.match(/<path[^>]*d="([^"]+)"[^>]*class="[^"]*sd-concrete/);
  assert.ok(path, 'fant ingen betongbane');
  assert.equal((path[1].match(/M/g) || []).length, 8);
});

/* ---------------- payload-fixturen motoren kjører ---------------- */

test('payload-custom-hd265.json er buildPayload av referansetilstanden', () => {
  const expected = JSON.parse(readFileSync(fixture('payload-custom-hd265.json'), 'utf8'));
  const actual = JSON.parse(JSON.stringify(buildPayload(hd265Store().getState())));
  assert.deepEqual(actual, expected);
});

/* ---------------- review av #83 ---------------- */

test('b_w bredere enn snittet er en FEIL (før: 1200 ga V_Rd,c 147,7 kN, shear_ok true)', () => {
  for (const bw of [1200.5, 5000]) {
    const store = hd265Store();
    store.patch('geometry', { bw });
    const m = validate(store.getState()).find((x) => x.code === 'bw_exceeds_section');
    assert.ok(m, `b_w = ${bw}: mangler bw_exceeds_section`);
    assert.equal(m.severity, 'error');
  }
  const ok = hd265Store();
  ok.patch('geometry', { bw: 1200 });
  assert.ok(!validate(ok.getState()).some((x) => x.code === 'bw_exceeds_section'));
});

test('minste kordsum mellom strekkarmering og trykksone: 220 mm for hulldekket', () => {
  const s = hd265Store().getState();
  // Gjennom hullsentrene: 1200 − 7·140 (32-kanten har hjørner i sentrumshøyden).
  assert.ok(Math.abs(minShearChord(s) - 220) < 1e-6, String(minShearChord(s)));
});

test('b_w over minste kordsum: advarsel med tallet, og verdien fylles IKKE inn stille', () => {
  const store = hd265Store();
  store.patch('geometry', { bw: 1000 });
  const m = validate(store.getState()).find((x) => x.code === 'bw_exceeds_web');
  assert.ok(m && m.severity === 'warning');
  assert.match(m.detail, /220/);
  assert.equal(store.getState().geometry.bw, 1000);
  // b_w = 220 er innenfor: ingen advarsel.
  const ok = hd265Store();
  assert.ok(!validate(ok.getState()).some((x) => x.code === 'bw_exceeds_web'));
});

test('rapporten: b_w fra RESULTATET, og M_z-forutsetningen står på papiret', () => {
  const store = hd265Store();
  store.patch('geometry', { bw: 999 });   // skjemaet er endret ETTER kjøringen
  const result = JSON.parse(readFileSync(fixture('result-bending-beam-300x600.json'), 'utf8'));
  Object.assign(result.section_props, {
    shape: 'polygon', I_y: 1.73e9, z_c: 0, bw: 220, mz_ratio: 0.287, mz_ratio_limit: 0.05,
  });
  const html = buildReportHtml(store.getState(), result);
  assert.match(html, /Web width for shear b_w[^<]*<\/t[hd]>\s*<td[^>]*>220</);
  assert.doesNotMatch(html, />999</);
  assert.match(html, /ASSUMES LATERAL RESTRAINT/);
  assert.match(html, new RegExp(EPS_A_LABEL));
});

test('ε_a-teksten er ÉN konstant, brukt av både siden og rapporten', () => {
  const ui = readFileSync(fileURLToPath(new URL('../js/ui.js', import.meta.url)), 'utf8');
  const report = readFileSync(fileURLToPath(new URL('../js/report.js', import.meta.url)), 'utf8');
  assert.match(ui, /EPS_A_LABEL/);
  assert.match(report, /EPS_A_LABEL/);
  for (const src of [ui, report]) {
    assert.doesNotMatch(src, /ε_a at the centroid|ε<sub>a<\/sub> \(at the origin\)/);
  }
  assert.match(EPS_A_LABEL, /mid-height/);
});
