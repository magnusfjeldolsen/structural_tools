/**
 * prestress.test.mjs — spennlag og stegdata gjennom tilstand, payload og lagring (sak #84).
 *
 * To krav bærer fila:
 *   1. BAKOVERKOMPATIBELT: en tilstand uten spennlag gir nøyaktig samme payload som før
 *      (ingen `prestress`-nøkkel, ingen `prestress` i lagene). Fixturene beviser det for
 *      de gamle tilstandene; her bevises det for en fersk og en lagret-og-lastet.
 *   2. SAMME TALL PÅ BEGGE SIDER: `payload-custom-hd265-prestressed.json` er `buildPayload`
 *      av referansetilstanden under, og `test_prestress.py` kjører den samme fila gjennom
 *      motoren og sammenlikner med håndregningen (`docs/prestress-hand-calc.py`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildPayload, concreteArea, prestressMoments } from '../js/payload.js';
import { createStore } from '../js/store.js';
import { parseSectionDocument, polygonProps } from '../js/polygon.js';
import { barArea, layerArea } from '../js/rebar.js';
import {
  isPrestressedLayer, notionalSize, PRESTRESS_STEEL_DEFAULTS, resolveCreep, selfWeightMoment,
} from '../js/materials.js';
import { fromDocument, toDocument } from '../js/serialize.js';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const HD265 = parseSectionDocument(readFileSync(fixture('section-hd265-7holes.json'), 'utf8')).polygon;

/**
 * Referansetilstanden = håndregningens antagelser: hulldekket, C45/55, 10 tau à 93 mm²
 * med senter 45 mm over underkant, σ_p0 = 1100, f_ck(t₀) = 30, egenvekt 25 kN/m³ over
 * 10 m, RH 50 %, sement R, overføring ved 1 døgn, 50 år. En ULS-rad og to
 * karakteristiske (−150 urisset, −200 risset).
 */
export function prestressedStore() {
  const store = createStore();
  store.setSectionType('custom');
  store.setCustomPolygon(HD265);
  store.patch('geometry', { bw: 220 });
  for (const st of store.getState().shear.stirrups) store.removeStirrup(st.id);
  const id = store.getState().layers[0].id;
  store.updateLayer(id, { dia: 12.5, count: 10, dc: 45, prestress: { ...PRESTRESS_STEEL_DEFAULTS } });
  store.patch('concrete', { fck: 45, alpha_cc: 1.0 });
  store.patch('sls', { RH: 50, cement: 'R', t0: 1, t_life: 50 * 365 });
  store.patch('prestress', { fck_t0: 30, span: 10, density: 25 });
  const c1 = store.getState().combos[0].id;
  store.updateCombo(c1, { M_Ed: -100 });
  store.addCombo({ type: 'characteristic', M_Ed: -150 });
  store.addCombo({ type: 'characteristic', M_Ed: -200 });
  return store;
}

test('et spennlag har arealet antall × A_p, ikke π·Ø²/4', () => {
  const layer = { mode: 'bars', dia: 12.5, count: 10, prestress: { ...PRESTRESS_STEEL_DEFAULTS } };
  assert.equal(layerArea(layer), 930);
  assert.notEqual(layerArea(layer), 10 * barArea(12.5));
  assert.equal(isPrestressedLayer(layer), true);
  assert.equal(isPrestressedLayer({ mode: 'bars', dia: 12, count: 3 }), false);
});

test('uten spennlag: ingen prestress-nøkkel noe sted i payloaden', () => {
  const p = buildPayload(createStore().getState());
  assert.ok(!('prestress' in p));
  assert.ok(p.section.rebar.every((r) => !('prestress' in r)));
});

test('en fil lagret uten spennlag gir samme payload etter lagring og lasting', () => {
  const s = createStore().getState();
  // En fil fra før saken har ingen `prestress`-gruppe i det hele tatt.
  const doc = toDocument(s);
  delete doc.state.prestress;
  const { state } = fromDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(buildPayload(state), buildPayload(s));
});

test('spennlaget og stegdataene overlever lagring og lasting', () => {
  const s = prestressedStore().getState();
  const { state } = fromDocument(JSON.parse(JSON.stringify(toDocument(s))));
  assert.deepEqual(buildPayload(state), buildPayload(s));
  assert.equal(state.layers[0].prestress.area_per_tendon, 93);
  assert.equal(state.prestress.fck_t0, 30);
});

test('egenvektsmomentet er −ρ·A·L²/8 av polygonets eget areal', () => {
  const s = prestressedStore().getState();
  const a = polygonProps(HD265).area;
  assert.equal(concreteArea(s), a);
  const mg = selfWeightMoment(a, 25, 10);
  assert.ok(Math.abs(mg - (-25 * (a / 1e6) * 100) / 8) < 1e-12);
  const m = prestressMoments(s);
  assert.equal(m.M_transfer, mg);
  assert.equal(m.M_permanent, mg);
  assert.equal(m.transfer_source, 'self_weight');
  assert.equal(selfWeightMoment(a, 25, null), null);
});

test('et oppgitt overføringsmoment vinner over egenvekten, og det permanente følger det', () => {
  const store = prestressedStore();
  store.patch('prestress', { M_transfer: -40 });
  let m = prestressMoments(store.getState());
  assert.equal(m.M_transfer, -40);
  assert.equal(m.M_permanent, -40);
  store.patch('prestress', { M_permanent: -70 });
  m = prestressMoments(store.getState());
  assert.equal(m.M_permanent, -70);
});

test('payloaden bærer spennlagets materiale og stegdataene, med kryptallet fra skjemaet', () => {
  const s = prestressedStore().getState();
  const p = buildPayload(s);
  const layer = p.section.rebar[0];
  assert.equal(layer.area, 930);
  assert.equal(layer.prestress.area_per_tendon, 93);
  assert.equal(layer.prestress.sigma_p0, 1100);
  assert.equal(layer.prestress.fp01k, 1640);
  assert.equal(layer.prestress.fpk, 1860);
  assert.ok(layer.bars.every((b) => Math.abs(b.z - (-265 / 2 + 45)) < 1e-9));
  assert.equal(p.prestress.fck_t0, 30);
  assert.equal(p.prestress.phi, resolveCreep(s).phi);
  assert.equal(p.prestress.h0, notionalSize(s));
  assert.equal(p.prestress.M_transfer, prestressMoments(s).M_transfer * 1e6);
  assert.equal(p.prestress.sigma_p_inf, null);
  assert.equal(p.prestress.cement, 'R');
  assert.equal(p.prestress.t0, 1);
});

test('kryptallet i referansen er håndregningens (32-kanten, h₀ med halve hullomkretsen)', () => {
  const s = prestressedStore().getState();
  // docs/prestress-hand-calc.py, 32-gon: phi = 2.70959049, h0 = 94.443134
  assert.ok(Math.abs(resolveCreep(s).phi - 2.70959049) < 1e-7);
  assert.ok(Math.abs(notionalSize(s) - 94.443134) < 1e-5);
});

test('negativt σ_p0 sendes RÅTT, slik at motoren kan avvise det høylytt', () => {
  const store = prestressedStore();
  const id = store.getState().layers[0].id;
  store.updateLayer(id, { prestress: { ...PRESTRESS_STEEL_DEFAULTS, sigma_p0: -1100 } });
  assert.equal(buildPayload(store.getState()).section.rebar[0].prestress.sigma_p0, -1100);
});

test('payload-custom-hd265-prestressed.json er buildPayload av referansetilstanden', () => {
  const expected = JSON.parse(readFileSync(fixture('payload-custom-hd265-prestressed.json'), 'utf8'));
  const actual = JSON.parse(JSON.stringify(buildPayload(prestressedStore().getState())));
  assert.deepEqual(actual, expected);
});
