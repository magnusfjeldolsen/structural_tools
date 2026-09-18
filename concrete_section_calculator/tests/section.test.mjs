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
  allowedAnalyses,
  asMax,
  asMin,
  axialForcesPresent,
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
  cover_side: 40,
  spacing: { k1: 1, k2: 5, d_g: 16 },
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50, dc_auto: false }],
  // `M_Ed = 0` er feltmoment etter regelen (M_Ed <= 0 ⇒ θ = 0) — samme som
  // den gamle default-retningen «sagging» ga. Ingen `direction` lenger.
  combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
  activeCombo: 'C1',
  analysis: 'bending',
  // Standard skjærtilstand: ingen bøyler, gyldig trykkstavvinkel — et snitt
  // uten denne skal IKKE feile skjærvalideringen bare fordi det ikke handler
  // om skjær.
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
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

test('thetaFor: M_Ed <= 0 gir feltmoment (θ=0), M_Ed > 0 gir støttemoment (θ=π) — endringsrunde 4 §1.3', () => {
  assert.equal(thetaFor(-250), 0);
  assert.equal(thetaFor(0), 0);
  assert.equal(thetaFor(250), Math.PI);
  // NaN/manglende: samme fallback som den gamle default-retningen «sagging».
  assert.equal(thetaFor(NaN), 0);
  assert.equal(thetaFor(undefined), 0);
});

test('axialForcesPresent: eksakt null, ingen toleranse — NaN/tom teller som fravær (§2)', () => {
  assert.equal(axialForcesPresent(beamState()), false);
  assert.equal(axialForcesPresent(beamState({ combos: [{ id: 'C1', N_Ed: -500, M_Ed: 0 }] })), true);
  assert.equal(axialForcesPresent(beamState({ combos: [{ id: 'C1', N_Ed: 500, M_Ed: 0 }] })), true);
  assert.equal(axialForcesPresent(beamState({ combos: [{ id: 'C1', N_Ed: 0.0001, M_Ed: 0 }] })), true);
  assert.equal(axialForcesPresent(beamState({ combos: [{ id: 'C1', N_Ed: NaN, M_Ed: 0 }] })), false);
  assert.equal(axialForcesPresent(beamState({ combos: [{ id: 'C1', N_Ed: '', M_Ed: 0 }] })), false);
  // Én av flere er nok.
  assert.equal(
    axialForcesPresent(
      beamState({
        combos: [
          { id: 'C1', N_Ed: 0, M_Ed: 0 },
          { id: 'C2', N_Ed: -100, M_Ed: 0 },
        ],
      })
    ),
    true
  );
});

test('allowedAnalyses: uten aksialkraft alle tre, med aksialkraft uten bending (§2)', () => {
  assert.deepEqual(allowedAnalyses(beamState()), ['bending', 'moment_curvature', 'nm_domain']);
  const withN = beamState({ combos: [{ id: 'C1', N_Ed: -500, M_Ed: 0 }] });
  assert.deepEqual(allowedAnalyses(withN), ['moment_curvature', 'nm_domain']);
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
const doubleState = (patch = {}) =>
  beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 50 },
    ],
    ...patch,
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

test('asMin/derived/layerSummary følger den AKTIVE kombinasjonens M_Ed-fortegn, ikke en fjernet state.direction (§7)', () => {
  const hog = doubleState({
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 250, V_Ed: 0 }],
    activeCombo: 'C1',
  });
  // M_Ed > 0 ⇒ støttemoment ⇒ strekksiden snur til OK-laget (L2, dc=50, altså
  // 550 mm fra den NÅ nederste trykkanten).
  const d = derived(hog);
  assert.equal(d.theta, Math.PI);
  assert.equal(d.d_eff, 550);
  assert.ok(Math.abs(d.As_tension - 2 * ((Math.PI * 144) / 4)) < 1e-12);

  const rows = layerSummary(hog);
  // Lagets EGEN dybde snur også — L1 (UK) er nå nær trykkanten, L2 (OK) langt unna.
  assert.equal(rows[0].d, 50);
  assert.equal(rows[1].d, 550);

  // Et annet aktivt combo-id enn den eneste raden faller tilbake på θ=0
  // (ingen match ⇒ M_Ed undefined ⇒ thetaFor(undefined) = 0).
  const noMatch = doubleState({
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 250, V_Ed: 0 }],
    activeCombo: 'C9',
  });
  assert.equal(derived(noMatch).theta, 0);
});

/* ---------------- validate: regel for regel ---------------- */

/** Referansebjelken med en last på, slik at `no_load` ikke slår inn. */
const loaded = (patch = {}) =>
  beamState({ combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: -250, V_Ed: 0 }], ...patch });

test('validate: et gyldig, lastet tverrsnitt gir ingen meldinger', () => {
  assert.deepEqual(validate(loaded()), []);
  assert.equal(isValid(loaded()), true);
  // `beamState()` har standardtilstandens nullaster, og da er `no_load` den
  // ENESTE meldingen — resten av snittet er fortsatt feilfritt.
  assert.deepEqual(codes(beamState()), ['no_load']);
  assert.equal(isValid(beamState()), true);
});

/* ---------------- Runde 6 §2.1 — no_load ---------------- */

test('validate no_load: alle kombinasjoner null gir ADVARSEL, ikke feil', () => {
  const m = find(beamState(), 'no_load');
  assert.ok(m, 'mangler no_load');
  assert.equal(m.severity, 'warning');
  assert.equal(m.field, 'combos');
  // Advarsel, ikke feil: `main.js` stopper kjøringen på `severity: 'error'`,
  // og et snitt uten last SKAL fortsatt kunne regnes (M_Rd er interessant i
  // seg selv). Meldingen forklarer hvorfor svaret ser tomt ut.
  assert.equal(isValid(beamState()), true);
});

test('validate no_load: ÉN last hvor som helst er nok til å slå den av', () => {
  const combo = (patch) => [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0, ...patch }];
  assert.ok(!find(beamState({ combos: combo({ M_Ed: -250 }) }), 'no_load'));
  assert.ok(!find(beamState({ combos: combo({ M_Ed: 250 }) }), 'no_load'), 'støttemoment teller også');
  assert.ok(!find(beamState({ combos: combo({ N_Ed: -500 }) }), 'no_load'));
  assert.ok(!find(beamState({ combos: combo({ V_Ed: 120 }) }), 'no_load'));
  // Flere rader: én lastet rad holder, selv om den ikke er den aktive.
  const mixed = beamState({
    combos: [
      { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 },
      { id: 'C2', name: 'ULS 2', N_Ed: 0, M_Ed: -250, V_Ed: 0 },
    ],
  });
  assert.ok(!find(mixed, 'no_load'));
  // …men to tomme rader er fortsatt ingen last.
  assert.ok(find(beamState({ combos: [...combo({}), { id: 'C2', N_Ed: 0, M_Ed: 0, V_Ed: 0 }] }), 'no_load'));
});

test('validate no_load: tomt/uleselig felt teller som FRAVÆR av last', () => {
  // Samme konvensjon som `axialForcesPresent` (§2): et tomt felt er ikke en
  // last. Uten dette ville advarselen forsvunnet mens brukeren slettet et
  // siffer, og kommet tilbake — blinking er verre enn ingen melding.
  assert.ok(find(beamState({ combos: [{ id: 'C1', N_Ed: '', M_Ed: null, V_Ed: undefined }] }), 'no_load'));
  assert.ok(find(beamState({ combos: [{ id: 'C1', N_Ed: 0, M_Ed: 'x', V_Ed: 0 }] }), 'no_load'));
  // Ingen kombinasjoner i det hele tatt er også ingen last.
  assert.ok(find(beamState({ combos: [] }), 'no_load'));
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

  // Fri avstand følger nå minClearDistance(dia, spacing): std-spacing
  // (k1=1, k2=5, d_g=16) gir max(8, 21, 20) = 21 mm, ikke det gamle gulvet på
  // 20. 10Ø8 trenger derfor 2·40 + 80 + 9·21 = 349 mm, selv om 9·Ø bare er 72 mm.
  const thin = beamState({ layers: [{ id: 'L1', mode: 'bars', dia: 8, count: 10, edge: 'bottom', dc: 44 }] });
  assert.ok(find(thin, 'layer_too_wide'), 'minste fri avstand etter EC2 8.2 mangler');

  // Plata har ingen bøyler og ingen sidekant å sprenge — regelen gjelder ikke.
  const slab = beamState({
    sectionType: 'slab',
    geometry: { b: 1000, h: 200 },
    layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
  });
  assert.ok(!find(slab, 'layer_too_wide'));
});

test('validate regel 2: breddekontrollen leser BØYLERADEN, ikke et geometrifelt', () => {
  // `section.js` regner `2·(cover_side + Ø_bøyle) + n·Ø + (n−1)·clear`.
  // Ø_bøyle kom fra `state.stirrup_dia`; det feltet finnes ikke lenger, og
  // tallet hentes nå fra `shear.stirrups` gjennom `stirrupCoverDia` — samme
  // kilde som `dc` og som jernkoordinatene. Var den ikke det, ville
  // valideringen sagt god for en bredde figuren viser som for trang.
  //
  // 4Ø25 i b = 270: clear = max(1·25, 16+5, 20) = 25
  //   uten bøyle:  2·40        + 100 + 75 = 255 ≤ 270  → OK
  //   med Ø12:     2·(40 + 12) + 100 + 75 = 279 > 270  → for trangt
  const layers = [{ id: 'L1', mode: 'bars', dia: 25, count: 4, edge: 'bottom', dc: 60 }];
  const geometry = { b: 270, h: 600 };
  const row = (dia, id = 'S1') => ({ id, dia, spacing: 150, legs: 2, fywk: 500, alpha: 90 });
  const shear = (...rows) => ({ strut_angle_deg: 45, z_factor: 0.9, stirrups: rows });

  assert.ok(!find(beamState({ geometry, layers }), 'layer_too_wide'),
    'uten bøylerad er det 255 mm som trengs');
  assert.ok(find(beamState({ geometry, layers, shear: shear(row(12)) }), 'layer_too_wide'),
    'Ø12-bøyla skal spise 24 mm av bredden');

  // Flere rader: den GROVESTE gjelder, som i `stirrupCoverDia`.
  //   Ø6 alene:    2·(40 + 6)  + 175 = 267 ≤ 270  → OK
  //   Ø6 og Ø12:   2·(40 + 12) + 175 = 279 > 270  → for trangt
  assert.ok(!find(beamState({ geometry, layers, shear: shear(row(6)) }), 'layer_too_wide'),
    '2·(40+6) + 175 = 267 ≤ 270');
  assert.ok(find(beamState({ geometry, layers, shear: shear(row(6), row(12, 'S2')) }),
    'layer_too_wide'), 'den groveste bøyla styrer, ikke den første raden');
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

test('validate ny regel: insufficient_layer_spacing er ADVARSEL, ikke feil (EC2 8.2(2))', () => {
  // To Ø20 på SAMME kant: senteravstand 30 mm ⇒ fri avstand (overflate til
  // overflate) = 30 − 20 = 10 mm, som er mindre enn kravet på 21 mm
  // (max(k1·Ø, d_g+k2, 20) = max(20, 21, 20) = 21) — men IKKE så lite at
  // sylindrene overlapper (det ville krevd fri avstand < 0).
  const s = beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53 },
      { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 83 },
    ],
  });
  const m = find(s, 'insufficient_layer_spacing');
  assert.ok(m, 'mangler insufficient_layer_spacing');
  assert.equal(m.severity, 'warning');
  assert.equal(isValid(s), true);
  // Ikke samtidig et overlapp — de er to ulike terskler.
  assert.ok(!find(s, 'layers_overlap'));

  // Samme to lag, men langt nok fra hverandre (30 mm ekstra) skal ikke varsles.
  const ok = beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53 },
      { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 94 },
    ],
  });
  assert.ok(!find(ok, 'insufficient_layer_spacing'));

  // Lag på ULIKE kanter skal aldri sammenliknes mot hverandre av denne regelen.
  const otherEdge = beamState({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53 },
      { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'top', dc: 60 },
    ],
  });
  assert.ok(!find(otherEdge, 'insufficient_layer_spacing'));

  // k1/k2/d_g fra state.spacing slår gjennom i kravet.
  const wideGravel = beamState({
    spacing: { k1: 1, k2: 5, d_g: 32 },
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53 },
      { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 94 },
    ],
  });
  assert.ok(find(wideGravel, 'insufficient_layer_spacing'), 'd_g = 32 skjerper kravet til 37 mm');
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

/* ---------------- §4.4 (endringsrunde 4) — skjærvalidering, regel for regel ---------------- */

// Referansebjelken i beamState() har d_eff = 550 (L1 bottom, dc=50) ⇒
// sl_max = 0,75·550 = 412,5, st_max = min(412.5, 600) = 412.5.
// rho_w_min = 0,08·√30/500 = 8,7636e-4, uavhengig av d ⇒ Asw_s_min ved
// bw = 300 er 0,262907 mm²/mm — tallet plan v4 §4.2 selv oppgir.

test('validate: tom bøyleliste gir INGEN skjærmeldinger utover en evt. ugyldig vinkel (minimumsunntaket)', () => {
  const s = beamState({ shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] } });
  assert.ok(!find(s, 'asw_below_minimum'), 'minstekravet skal IKKE gjelde uten bøyler');
  assert.ok(!find(s, 'stirrup_spacing_exceeds_max'));
  assert.ok(!find(s, 'stirrup_legs_spacing_exceeds_max'));
  assert.ok(!find(s, 'stirrup_alpha_unsupported'));
  assert.ok(!find(s, 'stirrup_mixed_fywk'));
  assert.equal(isValid(s), true);
});

test('validate skjær 1: stirrup_spacing_exceeds_max — spacing > sl_max = 0,75·d', () => {
  const s = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 12, spacing: 413, legs: 2, fywk: 500, alpha: 90 }],
    },
  });
  const m = find(s, 'stirrup_spacing_exceeds_max');
  assert.ok(m, 'mangler stirrup_spacing_exceeds_max');
  assert.equal(m.severity, 'error');
  // Akkurat innenfor (412 < 412,5) skal ikke varsles.
  const ok = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 12, spacing: 412, legs: 2, fywk: 500, alpha: 90 }],
    },
  });
  assert.ok(!find(ok, 'stirrup_spacing_exceeds_max'));
});

test('validate skjær 2: asw_below_minimum — KUN når lista er ikke-tom (§4.4)', () => {
  const s = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 6, spacing: 300, legs: 2, fywk: 500, alpha: 90 }],
    },
  });
  const m = find(s, 'asw_below_minimum');
  assert.ok(m, 'mangler asw_below_minimum');
  assert.equal(m.severity, 'error');
  assert.match(m.message, /0\.2629/);
});

test('validate skjær 3: stirrup_legs_spacing_exceeds_max — kun med legs > 2, ADVARSEL', () => {
  // Bred plate/bjelke, slik at benavstanden faktisk kan bli stor nok.
  const wide = beamState({
    geometry: { b: 2000, h: 600 },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 12, spacing: 100, legs: 3, fywk: 500, alpha: 90 }],
    },
  });
  const m = find(wide, 'stirrup_legs_spacing_exceeds_max');
  assert.ok(m, 'mangler stirrup_legs_spacing_exceeds_max');
  assert.equal(m.severity, 'warning');
  assert.equal(isValid(wide), true, 'en advarsel skal ikke gjøre snittet ugyldig');

  // legs = 2: ingen indre benavstand å sjekke, uansett bredde.
  const twoLegs = beamState({
    geometry: { b: 2000, h: 600 },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 12, spacing: 100, legs: 2, fywk: 500, alpha: 90 }],
    },
  });
  assert.ok(!find(twoLegs, 'stirrup_legs_spacing_exceeds_max'));
});

test('validate skjær 4: invalid_strut_angle — utenfor 21,8–45°, gjelder ALLTID', () => {
  const tooFlat = beamState({ shear: { strut_angle_deg: 20, z_factor: 0.9, stirrups: [] } });
  const m = find(tooFlat, 'invalid_strut_angle');
  assert.ok(m, 'mangler invalid_strut_angle for 20°');
  assert.equal(m.severity, 'error');

  const tooSteep = beamState({ shear: { strut_angle_deg: 46, z_factor: 0.9, stirrups: [] } });
  assert.ok(find(tooSteep, 'invalid_strut_angle'), 'mangler invalid_strut_angle for 46°');

  // Grensene selv skal være gyldige.
  assert.ok(!find(beamState({ shear: { strut_angle_deg: 21.8, z_factor: 0.9, stirrups: [] } }), 'invalid_strut_angle'));
  assert.ok(!find(beamState({ shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] } }), 'invalid_strut_angle'));
});

test('validate skjær 5: stirrup_alpha_unsupported — kun α = 90° i v1', () => {
  const s = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [{ id: 'S1', dia: 20, spacing: 100, legs: 2, fywk: 500, alpha: 45 }],
    },
  });
  const m = find(s, 'stirrup_alpha_unsupported');
  assert.ok(m, 'mangler stirrup_alpha_unsupported');
  assert.equal(m.severity, 'error');
});

test('validate skjær 6: stirrup_mixed_fywk — alle rader må ha samme f_ywk i v1', () => {
  const s = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [
        { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 },
        { id: 'S2', dia: 8, spacing: 150, legs: 2, fywk: 400, alpha: 90 },
      ],
    },
  });
  const m = find(s, 'stirrup_mixed_fywk');
  assert.ok(m, 'mangler stirrup_mixed_fywk');
  assert.equal(m.severity, 'error');

  // Samme f_ywk på begge rader: ingen melding.
  const same = beamState({
    shear: {
      strut_angle_deg: 45,
      z_factor: 0.9,
      stirrups: [
        { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 },
        { id: 'S2', dia: 6, spacing: 200, legs: 2, fywk: 500, alpha: 90 },
      ],
    },
  });
  assert.ok(!find(same, 'stirrup_mixed_fywk'));
});
