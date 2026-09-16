/**
 * serialize.test.mjs — lagre/laste-kontrakten (endringsrunde 2 §5.1).
 *
 * `fromDocument` skal ALDRI kaste — en korrupt eller feilvalgt fil er en
 * hverdagslig brukerfeil, ikke en programfeil. Halve fila handler derfor om
 * å mate den søppel og se at den svarer med et notat i stedet for et unntak.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DOCUMENT_FORMAT, DOCUMENT_SCHEMA, fromDocument, toDocument } from '../js/serialize.js';
import { defaultState } from '../js/store.js';
import { MODULE_VERSION } from '../js/meta.js';

test('toDocument: konvolutt med format, doc_schema, app_version, saved_at og state', () => {
  const state = { ...defaultState(), result: { M_Rd: 123 } };
  const doc = toDocument(state);
  assert.equal(doc.format, DOCUMENT_FORMAT);
  assert.equal(doc.doc_schema, DOCUMENT_SCHEMA);
  assert.equal(doc.app_version, MODULE_VERSION);
  assert.ok(!Number.isNaN(Date.parse(doc.saved_at)));
  // `result` er ALDRI med — det gjelder tall som var sanne DA fila ble lagret.
  assert.ok(!('result' in doc.state));
  assert.equal(doc.state.geometry.b, 300);
});

test('rundtur: fromDocument(toDocument(s)).state er dypt lik s, uten særtilfeller', () => {
  const s = { ...defaultState(), result: null };
  const { state, notes } = fromDocument(toDocument(s));
  assert.deepEqual(state, s);
  assert.deepEqual(notes, []);
});

test('rundtur med to lag og to kombinasjoner, ulik retning', () => {
  const s = {
    ...defaultState(),
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 41, dc_auto: false },
    ],
    combos: [
      { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 150, direction: 'sagging' },
      { id: 'C2', name: 'ULS 2', N_Ed: -500, M_Ed: 250, direction: 'hogging' },
    ],
    activeCombo: 'C2',
    result: null,
  };
  const { state, notes } = fromDocument(toDocument(s));
  assert.deepEqual(state, s);
  assert.deepEqual(notes, []);
});

test('fromDocument(null/{}/{format:"annet"}) gjenkjenner ikke fila, og kaster aldri', () => {
  for (const bad of [null, {}, { format: 'annet' }, undefined, 42, 'tekst', []]) {
    assert.doesNotThrow(() => fromDocument(bad));
    const { state, notes } = fromDocument(bad);
    assert.equal(state, null);
    assert.deepEqual(notes, [{ code: 'document_not_recognised', severity: 'error' }]);
  }
});

test('fil uten spacing: standard {k1:1,k2:5,d_g:16} og ett document_field_defaulted', () => {
  const doc = toDocument(defaultState());
  delete doc.state.spacing;
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.spacing, { k1: 1, k2: 5, d_g: 16 });
  const defaulted = notes.filter((n) => n.code === 'document_field_defaulted');
  assert.equal(defaulted.length, 1);
  assert.equal(defaulted[0].field, 'spacing');
});

test('fil som mangler ETT felt i en nøstet gruppe: standardverdien fylles inn stille', () => {
  const doc = toDocument(defaultState());
  delete doc.state.spacing.k2; // ikke hele gruppa, bare ett felt i den
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.spacing, { k1: 1, k2: 5, d_g: 16 });
  // Toppnivånøkkelen `spacing` FANTES — ingen defaulted-melding for den.
  assert.ok(!notes.some((n) => n.code === 'document_field_defaulted' && n.field === 'spacing'));
});

test('fil med state.tullefelt: ett document_field_ignored, resten uendret', () => {
  const doc = toDocument(defaultState());
  doc.state.tullefelt = 'noe rart';
  const { state, notes } = fromDocument(doc);
  const ignored = notes.filter((n) => n.code === 'document_field_ignored');
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].field, 'tullefelt');
  assert.ok(!('tullefelt' in state));
  assert.deepEqual(state, { ...defaultState(), result: null });
});

test('layers[i]/combos[i] renses IKKE feltvis — normaliseres gjennom createLayer/createCombo', () => {
  const doc = toDocument(defaultState());
  // `mode: 'spacing'` mangler legitimt `count`, og har et felt slabene bruker
  // som bjelker ikke har. En feltvis rensing ville kastet dette.
  doc.state.layers = [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 150, edge: 'bottom', dc: 31, dc_auto: true }];
  doc.state.sectionType = 'slab';
  doc.state.geometry = { b: 1000, h: 200 };
  const { state } = fromDocument(doc);
  assert.equal(state.layers[0].mode, 'spacing');
  assert.equal(state.layers[0].spacing, 150);
  assert.ok(!('count' in state.layers[0]));
});

test('state.result settes ALLTID til null, selv om fila skulle inneholde noe annet', () => {
  const doc = toDocument(defaultState());
  doc.state.result = { M_Rd: 999 }; // skal ikke kunne skje via toDocument, men fromDocument er robust uansett
  const { state } = fromDocument(doc);
  assert.equal(state.result, null);
});
