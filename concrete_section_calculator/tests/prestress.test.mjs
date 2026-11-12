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
  isPrestressedLayer, notionalSize, PRESTRESS_STEEL_DEFAULTS, prestressCreep, resolveCreep,
  selfWeightMoment,
} from '../js/materials.js';
import { validate } from '../js/section.js';
import { fromDocument, toDocument } from '../js/serialize.js';
import { prestressLossRows, prestressStageRows } from '../js/results.js';
import { prestressSection } from '../js/ui.js';
import { buildReportHtml } from '../js/report.js';

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
  // SLS-boksens belastningsalder står BEVISST på standarden 28 døgn: alderen ved
  // overføring er forspenningens egen inndata (review B3), og tapene skal ikke se 28.
  store.patch('sls', { RH: 50, cement: 'R', t_life: 50 * 365 });
  store.patch('prestress', { fck_t0: 30, t0_transfer: 1, span: 10, density: 25 });
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
  assert.equal(p.prestress.phi, prestressCreep(s).phi);
  assert.equal(p.prestress.phi_source, 'derived');
  assert.equal(p.prestress.h0, notionalSize(s));
  assert.equal(p.prestress.M_transfer, prestressMoments(s).M_transfer * 1e6);
  assert.equal(p.prestress.sigma_p_inf, null);
  assert.equal(p.prestress.cement, 'R');
  assert.equal(p.prestress.t0, 1);
});

test('kryptallet i referansen er håndregningens (32-kanten, h₀ med halve hullomkretsen)', () => {
  const s = prestressedStore().getState();
  // docs/prestress-hand-calc.py, 32-gon: phi = 2.70959049, h0 = 94.443134
  assert.ok(Math.abs(prestressCreep(s).phi - 2.70959049) < 1e-7);
  assert.ok(Math.abs(notionalSize(s) - 94.443134) < 1e-5);
});

test('negativt σ_p0 sendes RÅTT, slik at motoren kan avvise det høylytt', () => {
  const store = prestressedStore();
  const id = store.getState().layers[0].id;
  store.updateLayer(id, { prestress: { ...PRESTRESS_STEEL_DEFAULTS, sigma_p0: -1100 } });
  assert.equal(buildPayload(store.getState()).section.rebar[0].prestress.sigma_p0, -1100);
});

/* ---------------- resultatkort og rapport ---------------- */

// Et utsnitt av motorens svar for referansetilstanden (CPython 2026-11-12), nok til å
// tegne tabellen. Tallene er motorens; formateringen er det som prøves her.
const RESULT = {
  ok: true,
  prestress: {
    uls_prestrain: 'long_term',
    M_transfer: -65917009.77, M_permanent: -65917009.77,
    materials: { fck_t0: 30, Ecm_t0: 32836.6, fctm_t0: 2.721 },
    tendons: [{ id: 'L1', area: 930, sigma_p0: 1100, fp01k: 1640, fpk: 1860, Ep: 195000 }],
    losses: [{
      id: 'L1', source: 'ec2_5_46', sigma_p0: 1100, sigma_p_inf: 867.723, d_sigma_total: 232.277,
      d_sigma_el: 34.156, term_shrinkage: 108.442, term_creep: 73.145, term_relaxation: 16.534,
      phi: 2.7096, eps_cs: 0.0006368, d_sigma_pr: 23.666, relaxation_class: 2, rho_1000: 2.5,
      mu: 0.573, sigma_c_qp: 5.7517, denominator: 1.1451,
    }],
    stages: [
      { stage: 'transfer', M: -65917009.77, sigma_c_top: -3.10556, sigma_c_bottom: -6.29295,
        tendons: [{ id: 'L1', sigma_p: 1065.844 }], chi: 3.66295e-7, uncracked: true,
        f_ct: 2.721, M_dec: -151511468, M_cr: -188525141 },
      { stage: 'long_term', M: -65917009.77, sigma_c_top: -3.46638, sigma_c_bottom: -4.18512,
        tendons: [{ id: 'L1', sigma_p: 867.723 }], chi: 2.773e-7, uncracked: true,
        f_ct: 3.795, M_dec: -122628558, M_cr: -174059698 },
      { stage: 'loaded', combo: 'C3', combo_name: 'Characteristic 3', M: -200e6, dM: -134.083e6,
        sigma_c_top: -22.18478, sigma_c_bottom: 0, tendons: [{ id: 'L1', sigma_p: 1106.047 }],
        chi: -7.623e-6, uncracked: false, f_ct: 3.795 },
    ],
  },
};

test('stegradene: merkelapp, formatering og risset/urisset', () => {
  const rows = prestressStageRows(RESULT);
  assert.deepEqual(rows.map((r) => r.stage), ['transfer', 'long_term', 'loaded']);
  assert.equal(rows[0].top, '-3.11');
  assert.equal(rows[0].sigma_p, '1065.8');
  assert.equal(rows[0].M_cr, '-188.5');
  assert.equal(rows[2].label, 'Loaded t∞ · Characteristic 3');
  assert.equal(rows[2].state, 'cracked');
  assert.equal(rows[2].M_dec, '–');
  assert.deepEqual(prestressStageRows({ ok: true }), []);
});

test('tapene: hvert ledd for seg, og summen av leddene er totalen', () => {
  const [l] = prestressLossRows(RESULT);
  assert.deepEqual(l.rows.map(([k]) => k), [
    'Elastic shortening at transfer', 'Shrinkage ε_cs·E_p / D', 'Creep α·φ·σ_c,QP / D',
    'Relaxation 0.8·Δσ_pr / D']);
  const sum = l.rows.reduce((a, [, v]) => a + Number(v), 0);
  assert.ok(Math.abs(sum - Number(l.total)) < 0.15);
});

test('resultatkortet finnes bare med result.prestress', () => {
  assert.equal(prestressSection({ ok: true }), '');
  const html = prestressSection(RESULT);
  assert.match(html, /Prestress stages/);
  assert.equal((html.match(/<tr class="border-t/g) || []).length, 3);
  assert.match(html, /not checks against the EC2 7.2 limits/);
});

test('rapporten: kapittel 6 er stegtabellen for et forspent snitt, ellers uendret', () => {
  const s = prestressedStore().getState();
  const html = buildReportHtml(s, RESULT);
  const ch6 = html.slice(html.indexOf('data-sec="6"'), html.indexOf('data-sec="7"'));
  assert.match(ch6, /Prestress stages/);
  assert.match(ch6, /Loaded t∞ · Characteristic 3/);
  assert.match(ch6, /after losses/);
  const plain = buildReportHtml(createStore().getState(), null);
  assert.doesNotMatch(plain, /Prestress stages/);
});

/* ---------------- review av PR #89 ---------------- */

test('B3: tapenes φ regnes av alderen ved overføring, ikke av SLS-boksens t₀ eller φ_ef', () => {
  const store = prestressedStore();
  const before = prestressCreep(store.getState()).phi;
  // FØR: payloaden sendte resolveCreep(state).phi — med SLS-boksens 28 døgn ga det
  // φ = 1,83 i stedet for 2,71, og en φ_ef-overstyring for rissvidden gikk rett i tapet.
  assert.ok(Math.abs(resolveCreep(store.getState()).phi - 1.83) < 0.01);
  store.patch('sls', { phi_ef: 0.5 });
  assert.equal(buildPayload(store.getState()).prestress.phi, before);
  assert.ok(Math.abs(before - 2.70959049) < 1e-7);
  store.patch('prestress', { t0_transfer: 28 });
  assert.ok(Math.abs(buildPayload(store.getState()).prestress.phi - 1.83) < 0.01);
  store.patch('prestress', { phi_override: 2.2 });
  const p = buildPayload(store.getState()).prestress;
  assert.equal(p.phi, 2.2);
  assert.equal(p.phi_source, 'manual');
});

test('B3/F6: f_ck(t₀) og alder ved overføring er påkrevd — validering og payload, ingen standard', () => {
  for (const field of ['fck_t0', 't0_transfer']) {
    const store = prestressedStore();
    store.patch('prestress', { [field]: null });
    const codes = validate(store.getState()).filter((m) => m.severity === 'error').map((m) => m.code);
    assert.ok(codes.includes(field === 'fck_t0' ? 'prestress_fck_t0_missing' : 'prestress_t0_missing'), field);
    assert.throws(() => buildPayload(store.getState()), /must be given/);
  }
  // Uten spennlag: ingen av feilene.
  assert.ok(!validate(createStore().getState()).some((m) => m.code.startsWith('prestress_')));
});

test('B2/F3: et steg som ikke er tilgjengelig vises med grunnen, uten tall', () => {
  const res = JSON.parse(JSON.stringify(RESULT));
  res.prestress.stages[1] = { stage: 'long_term', available: false, reason: 'passive_with_tendons',
    reason_text: 'The section has non-prestressed reinforcement together with the tendons.', M: -65.9e6 };
  const rows = prestressStageRows(res);
  assert.equal(rows[1].available, false);
  assert.equal(rows[1].top, '–');
  assert.equal(rows[1].M_cr, '–');
  const html = prestressSection(res);
  assert.match(html, /Not available — The section has non-prestressed reinforcement/);
  const rep = buildReportHtml(prestressedStore().getState(), res);
  assert.match(rep, /not available/);
});

test('F7: lagtabellen i rapporten viser tauets totale tøyning, σ_p/f_pd og riktig tilstand', () => {
  const res = JSON.parse(JSON.stringify(RESULT));
  res.analysis = 'bending';
  res.section_props = { M_cr: 81974569.6, M_cr_basis: 'prestressed_long_term' };
  res.bending = { M_Rd: -64.67e6, failure_mode: 'unreinforced_tension_zone', combinations: [],
    layers: [{ id: 'L1', z: -87.5, eps: -0.0012, eps_0: 0.0044, eps_total: 0.0032, sigma: 624.0,
      utilisation: 0.4376, compression: true, prestressed: true }] };
  const html = buildReportHtml(prestressedStore().getState(), res);
  const tbl = html.slice(html.indexOf('Strains and stresses per reinforcement layer'));
  assert.match(tbl, /L1 \(tendon\)/);
  assert.match(tbl, /σ_p\/f_pd/);
  assert.match(tbl, /<td class="num">3\.20<\/td>/);        // ε+ε₀ = 3,20 ‰, ikke −1,20
  assert.doesNotMatch(tbl.slice(0, tbl.indexOf('</table>')), /Compression/);
  assert.match(html, /M_cr with prestress after losses/);
});

test('payload-custom-hd265-prestressed.json er buildPayload av referansetilstanden', () => {
  const expected = JSON.parse(readFileSync(fixture('payload-custom-hd265-prestressed.json'), 'utf8'));
  const actual = JSON.parse(JSON.stringify(buildPayload(prestressedStore().getState())));
  assert.deepEqual(actual, expected);
});
