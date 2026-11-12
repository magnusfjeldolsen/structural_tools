/**
 * cad-editor.test.mjs — tegningen fra cad2d-editoren i tilstanden (#93).
 *
 * Kravet: tegningen (`geometry.cad`) er ALDRI en kilde til tall. Polygonet er det.
 * Tegningen følger med i fila så formene kan redigeres igjen, og den forsvinner når
 * polygonet kommer fra et annet sted (fil, innliming), så editoren aldri kan vise
 * former som ikke er det snittet som regnes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPayload } from '../js/payload.js';
import { createStore } from '../js/store.js';
import { parseSectionDocument, polygonProps } from '../js/polygon.js';
import { fromDocument, toDocument } from '../js/serialize.js';

// cad2d trenger polygon-clipping som i nettleseren (window.polygonClipping)
globalThis.window = globalThis;
const vendor = readFileSync(fileURLToPath(new URL('../../cad2d/vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const cad2d = (rel) => import(pathToFileURL(fileURLToPath(new URL(`../../cad2d/js/${rel}`, import.meta.url))).href);
const { CadDocument } = await cad2d('core/document.js');
const { importDxfText, sectionOf } = await cad2d('io/project.js');

const DXF = readFileSync(fileURLToPath(new URL('../../geometry_workspace/tests/fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
const HD265 = parseSectionDocument(readFileSync(fileURLToPath(new URL('./fixtures/section-hd265-7holes.json', import.meta.url)), 'utf8')).polygon;

/** Det csc gjør ved OK i editoren. */
function drawnHollowCore() {
  const doc = new CadDocument();
  importDxfText(doc, DXF);
  const r = sectionOf(doc);
  assert.ok(r.ok, r.error);
  return { section: r.section, cad: doc.toObject() };
}

test('OK fra editoren: polygonet går inn i Custom-veien, tegningen lagres ved siden av', () => {
  const store = createStore();
  store.setSectionType('custom');
  const { section, cad } = drawnHollowCore();
  store.setCustomPolygon(section, { cad });
  const g = store.getState().geometry;
  assert.equal(g.holes.length, 7);
  assert.equal(g.cad.format, 'cad2d.document');
  assert.equal(g.cad.shapes.length, 8);
  assert.equal(Math.round(polygonProps({ outer: g.outer, holes: g.holes }).area), 210243);
  assert.equal(g.bw, null, 'b_w nullstilles som ved fil');
});

test('tegningen er ikke en kilde til tall: payload er lik med og uten tegning', () => {
  const { section, cad } = drawnHollowCore();
  const a = createStore();
  a.setSectionType('custom');
  a.setCustomPolygon(section, { cad });
  const b = createStore();
  b.setSectionType('custom');
  b.setCustomPolygon(section);
  assert.deepEqual(buildPayload(a.getState()), buildPayload(b.getState()));
  assert.ok(!JSON.stringify(buildPayload(a.getState())).includes('cad2d.document'));
});

test('polygon fra fil eller innliming fjerner en gammel tegning', () => {
  const store = createStore();
  store.setSectionType('custom');
  const { section, cad } = drawnHollowCore();
  store.setCustomPolygon(section, { cad });
  store.setCustomPolygon(HD265);
  assert.ok(!('cad' in store.getState().geometry));
});

test('tegningen følger med i lagret fil og tilbake', () => {
  const store = createStore();
  store.setSectionType('custom');
  const { section, cad } = drawnHollowCore();
  store.setCustomPolygon(section, { cad });
  const back = fromDocument(JSON.parse(JSON.stringify(toDocument(store.getState()))));
  assert.deepEqual(back.state.geometry.cad, store.getState().geometry.cad);
  const doc = new CadDocument();
  doc.fromJSON(back.state.geometry.cad);
  assert.equal(doc.list('shape').length, 8, 'formene kan redigeres igjen');
});

test('bjelke og plate er urørt: setCustomPolygon gjør ingenting utenfor Custom', () => {
  const store = createStore();
  const before = JSON.stringify(store.getState());
  const { section, cad } = drawnHollowCore();
  assert.equal(store.setCustomPolygon(section, { cad }), null);
  assert.equal(JSON.stringify(store.getState()), before);
});
