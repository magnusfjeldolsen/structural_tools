/**
 * section.test.mjs — avledede tverrsnittsstørrelser og valideringen.
 *
 * Valideringen testes regel for regel, med ett eget tilfelle per regel i plan
 * §4.4. En samletest på «gir feil» ville bestått selv om fire av de fem reglene
 * var borte.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  asMax,
  asMin,
  derived,
  grossArea,
  isValid,
  layerSummary,
  sectionBounds,
  sectionWidth,
  thetaFor,
  validate,
} from '../js/section.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

/** Referansebjelken. Gyldig — alle negative tester muterer en kopi av denne. */
const beamState = (patch = {}) => ({
  sectionType: 'beam',
  geometry: { b: 300, h: 600 },
  concrete: { fck: 30, gamma_c: 1.5, alpha_cc: 1.0, law: 'parabolarectangle' },
  steel: {
    fyk: 500,
    Es: 200000,
    k: 1.08,
    epsuk: 0.075,
    gamma_eps: 0.9,
    gamma_s: 1.15,
    law: 'elasticplastic',
  },
  cover: 40,
  stirrup_dia: 0,
  cover_side: 40,
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
  loads: { N_Ed: 0, M_Ed: 0 },
  direction: 'sagging',
  analysis: 'bending',
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  ...patch,
});

const codes = (state) => validate(state).map((m) => m.code);
const find = (state, code) => validate(state).find((m) => m.code === code);

test('plata er alltid 1000 mm bred, uansett hva geometry.b sier', () => {
  // Uten dette ville «per meter» vært en løgn: arealet regnes per meter,
  // men betongen ville vært 250 mm bred.
  assert.equal(sectionWidth({ sectionType: 'slab', geometry: { b: 250, h: 200 } }), 1000);
  assert.equal(sectionWidth(beamState()), 300);
});

test('tverrsnittet er sentrert om origo', () => {
  assert.deepEqual(sectionBounds(beamState()), {
    minY: -150,
    maxY: 150,
    minZ: -300,
    maxZ: 300,
  });
});

test('thetaFor: feltmoment = 0, støttemoment = π', () => {
  assert.equal(thetaFor('sagging'), 0);
  assert.equal(thetaFor('hogging'), Math.PI);
});

test('derived() stemmer med section_props fra motoren', () => {
  const ours = derived(beamState());
  const theirs = fixture('result-bending-beam-300x600').section_props;
  for (const key of ['Ag', 'As_total', 'rho', 'b_t', 'd_eff', 'As_min', 'As_max']) {
    assert.ok(
      Math.abs(ours[key] - theirs[key]) <= Math.abs(theirs[key]) * 1e-12,
      `${key}: ${ours[key]} != ${theirs[key]}`
    );
  }
});

test('As_min og As_max etter EC2 9.2.1.1, ikke pakkens rissviddeminimum', () => {
  const s = beamState();
  assert.ok(Math.abs(asMin(s) - 248.51696759748907) < 1e-9);
  assert.equal(asMax(s), 7200);
  assert.equal(grossArea(s), 180000);
  // Med mykt stål (lav fyk) styrer 0,26·fctm/fyk-leddet; med høyt fyk tar
  // 0,0013-gulvet over. Begge greinene skal være i bruk.
  const soft = beamState({ steel: { ...s.steel, fyk: 200 } });
  assert.ok(asMin(soft) > 0.0013 * 300 * 550);
  const hard = beamState({ steel: { ...s.steel, fyk: 900 } });
  assert.ok(Math.abs(asMin(hard) - 0.0013 * 300 * 550) < 1e-9);
});

/** Dobbeltarmert: 3Ø20 i UK + 2Ø12 i OK, begge med dc = 50. */
const doubleState = () =>
  beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 50 },
    ],
  });

test('derived(): d_eff er et ESTIMAT, d_eff_all er vektet over alle lag', () => {
  const s = doubleState();
  const d = derived(s);

  // Estimatet fra den geometriske strekksiden — det UI-en viser før første
  // beregning.
  assert.equal(d.d_eff, 550);
  assert.equal(d.d_eff_source, 'geometric-estimate');
  // Vektet over alle lag: motorens `d_eff_all`.
  assert.ok(Math.abs(d.d_eff_all - 453.23) < 0.01, `d_eff_all = ${d.d_eff_all}`);

  assert.ok(Math.abs(d.As_tension - 3 * ((Math.PI * 400) / 4)) < 1e-12);
  assert.ok(d.As_total > d.As_tension, 'trykkarmeringen skal telle med i As_total');

  // ρ er EC2 sin ρ_l: strekkarmeringen over b_t·d, ikke total armering.
  assert.ok(Math.abs(d.rho - d.As_tension / (300 * 550)) < 1e-15);
  assert.notEqual(d.rho, d.As_total / (300 * 550));

  // A_s,min følger estimatet d = 550, ikke 453. Med 453 ville minimumet blitt
  // ~18 % for lite — på usikker side.
  assert.ok(Math.abs(asMin(s) - 248.51696759748907) < 1e-9);
  assert.ok(asMin(s) > (0.26 * 2.896468153816889 * 300 * 455) / 500);

  // INGEN påstand her om hva motoren ville sagt: EC2-d avhenger av
  // tøyningsplanet ved brudd, som JS-siden ikke har.
});

test('layerSummary gir lagets EGEN dybde, også for trykkarmering', () => {
  const rows = layerSummary(doubleState());
  assert.equal(rows[0].d, 550);
  // Trykkarmeringen skal vise 50 mm fra trykkanten, ikke snittets d_eff.
  assert.equal(rows[1].d, 50);
});

test('layerSummary gir id, areal, z og d per lag', () => {
  const [l] = layerSummary(beamState());
  assert.equal(l.id, 'L1');
  assert.equal(l.z, -250);
  assert.equal(l.d, 550);
  assert.equal(l.count, 3);
});

/* ---------------- validate: regel for regel ---------------- */

test('validate: et gyldig tverrsnitt gir ingen meldinger', () => {
  assert.deepEqual(validate(beamState()), []);
  assert.equal(isValid(beamState()), true);
});

test('validate regel 1: jern utenfor tverrsnittet', () => {
  // dc + Ø/2 = 610 > h = 600. Motoren ville regnet glad videre med full
  // stålspenning og ingen betong rundt.
  const s = beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 600 }] });
  const m = find(s, 'bar_outside_section');
  assert.ok(m, 'mangler bar_outside_section');
  assert.equal(m.severity, 'error');
  assert.match(m.message, /utenfor tverrsnittet/);
  assert.equal(m.field, 'layers.0.dc');
  assert.equal(isValid(s), false);
  // Akkurat innenfor skal fortsatt være greit.
  assert.ok(!find(beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 589 }] }), 'bar_outside_section'));
});

test('validate regel 2: laget får ikke plass i bredden', () => {
  // 4Ø25 i b = 300: 2·40 + 4·25 + 3·25 = 255 <= 300, altså OK…
  assert.ok(!find(beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 25, count: 4, edge: 'bottom', dc: 60 }] }), 'layer_too_wide'));
  // …men 6Ø25 trenger 2·40 + 150 + 125 = 355 mm.
  const s = beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 25, count: 6, edge: 'bottom', dc: 60 }] });
  const m = find(s, 'layer_too_wide');
  assert.ok(m, 'mangler layer_too_wide');
  assert.equal(m.severity, 'error');
  assert.match(m.message, /plass i bredden/);

  // Fri avstand har et gulv på 20 mm (EC2 8.2): 10Ø8 trenger
  // 2·40 + 80 + 9·20 = 340 mm, selv om 9·Ø bare er 72 mm.
  const thin = beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 8, count: 10, edge: 'bottom', dc: 44 }] });
  assert.ok(find(thin, 'layer_too_wide'), 'minste fri avstand 20 mm mangler');

  // Plata har ingen bøyler og ingen sidekant å sprenge — regelen gjelder ikke.
  const slab = beamState({
    sectionType: 'slab',
    geometry: { b: 1000, h: 200 },
    layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
  });
  assert.ok(!find(slab, 'layer_too_wide'));
});

test('validate regel 3: materialfaktorer som ikke kan være 0', () => {
  // 0 og tomt felt gir STILLE standardverdier i structuralcodes — derfor error.
  assert.ok(find(beamState({ concrete: { ...beamState().concrete, alpha_cc: 0 } }), 'invalid_alpha_cc'));
  assert.ok(find(beamState({ concrete: { ...beamState().concrete, alpha_cc: '' } }), 'invalid_alpha_cc'));
  assert.ok(find(beamState({ concrete: { ...beamState().concrete, gamma_c: 0 } }), 'invalid_gamma_c'));
  assert.ok(find(beamState({ steel: { ...beamState().steel, gamma_s: 0 } }), 'invalid_gamma_s'));
  // k < 1 ville betydd at ftk < fyk — fysisk umulig, og gir negativ Eh.
  assert.ok(find(beamState({ steel: { ...beamState().steel, k: 0.95 } }), 'invalid_k'));
  assert.ok(!find(beamState({ steel: { ...beamState().steel, k: 1 } }), 'invalid_k'));
});

test('validate regel 4: grunnleggende geometri og minst ett lag', () => {
  assert.ok(find(beamState({ geometry: { b: 300, h: 0 } }), 'invalid_height'));
  assert.ok(find(beamState({ geometry: { b: 0, h: 600 } }), 'invalid_width'));
  assert.ok(find(beamState({ geometry: { b: -10, h: 600 } }), 'invalid_width'));
  const bare = find(beamState({ layers: [] }), 'no_reinforcement');
  assert.ok(bare);
  assert.equal(bare.severity, 'error');
});

test('validate regel 5: overlappende lag er ADVARSEL, ikke feil', () => {
  // h − dc_top − dc_bottom = 600 − 295 − 295 = 10 < (20+20)/2 = 20.
  const s = beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 295 },
      { id: 'L2', mode: 'bars', dia: 20, count: 2, edge: 'top', dc: 295 },
    ],
  });
  const m = find(s, 'layers_overlap');
  assert.ok(m, 'mangler layers_overlap');
  // ULS-momentet blir riktig fordi arealene integreres uavhengig — derfor
  // skal dette IKKE blokkere beregningen.
  assert.equal(m.severity, 'warning');
  assert.equal(isValid(s), true);

  // Lag som ligger fra hverandre skal ikke varsles.
  const ok = beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 },
      { id: 'L2', mode: 'bars', dia: 20, count: 2, edge: 'top', dc: 50 },
    ],
  });
  assert.ok(!find(ok, 'layers_overlap'));
});

test('validate melder flere feil samtidig, i rekkefølge geometri → material → lag', () => {
  const s = beamState({
    geometry: { b: 300, h: 0 },
    concrete: { ...beamState().concrete, gamma_c: 0 },
  });
  const c = codes(s);
  assert.ok(c.includes('invalid_height'));
  assert.ok(c.includes('invalid_gamma_c'));
  assert.ok(c.indexOf('invalid_height') < c.indexOf('invalid_gamma_c'));
});
