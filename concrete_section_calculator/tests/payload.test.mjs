/**
 * payload.test.mjs — kontrakten mot motoren.
 *
 * TO PÅSTANDER BÆRER HELE FILA
 *
 * 1. Payloadens FORM stemmer med kontrakten i endringsrunde 2 §4.2 — særlig at
 *    `loads` nå er `{combinations: [...], active}`, ikke `{N_Ed, M_Ed}`
 *    direkte. De to formtestene sammenlikner mot en LITERAL skrevet her, ikke
 *    mot `tests/fixtures/payload-beam-300x600.json` / `payload-slab-1000x200.json`
 *    — de fixturene bærer ennå den GAMLE `loads`-formen og blir regenerert av
 *    koordinatoren etter denne runden (endringsrunde 2, §8). Når det er gjort,
 *    kan disse to testene igjen lese fixturen i stedet for literalen, men
 *    frem til da ville en sammenlikning mot fila bare bevist at payloaden er
 *    lik en kontrakt vi vet er utdatert.
 *
 * 2. `payload.section.rebar[i].bars` er dypt lik `barPositions(...)`. Det er
 *    den eneste maskinelle garantien for at tegningen og motoren ser det samme
 *    tverrsnittet (plan §4.2). Faller den, kan figuren og kapasiteten sprike i
 *    stillhet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPayload } from '../js/payload.js';
import { barPositions, stirrupCoverDia, equivalentStrip } from '../js/rebar.js';
import { createStore } from '../js/store.js';

/** Referansebjelken, plan §3.6. Merk α_cc = 1,0 og overdekning 40 uten bøyle. */
const BEAM_STATE = {
  schema: 1,
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
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50, dc_auto: false }],
  // Endringsrunde 2 §4.1: `loads` er erstattet av `combos` + `activeCombo`.
  // Endringsrunde 4 §1.2: ingen `direction` lenger — `M_Ed` er signert, og
  // `V_Ed` er nytt (§3.4).
  // STEG 2: `type` er med — `createCombo` (rebar.js) setter den alltid, og
  // `payload.js` sender den rått videre (§C1).
  combos: [{ id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
  activeCombo: 'C1',
  analysis: 'bending',
  // Standard skjærtilstand (§3.4): ingen bøyler.
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  doc: { project: '', title: '', author: '', date: '', note: '' },
  result: null,
  // SLS §5-standarden, lagt til denne runden — samme verdier `defaultState()`
  // gir. Uten denne fikk `payload.sls.phi_ef` `num(undefined)` = NaN, som
  // JSON-serialiserer til `null` og slapp gjennom «ingen NaN»-testen under.
  sls: {
    exposure_class: null,
    w_max_override: null,
    phi_ef: 2.0,
    assume_cracked: false,
    sigma_c_char_factor: 0.6,
    sigma_c_qp_factor: 0.45,
    sigma_s_char_factor: 0.8,
  },
};

/** Referanseplata, 1000×200, Ø12 c/c 113, overdekning 25. */
const SLAB_STATE = {
  ...BEAM_STATE,
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25,
  cover_side: 25,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31, dc_auto: false }],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Formen §4.2 krever — delt av begge testene pga. felles struktur.
 * STEG 2, §C1: `type` rett etter `name` — SAMME nøkkelrekkefølge som
 * `payload.js` faktisk bygger, siden testen sammenlikner med `JSON.stringify`
 * og ikke bare `deepEqual` (planens felle 8).
 */
const oneCombo = { id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0, theta: 0 };

/** `section.shear` med tom bøyleliste — formen §3.4/v3 §4.1 krever. */
const noStirrups = { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] };

/**
 * `payload.sls` (SLS-spec §4) for BEAM_STATE/SLAB_STATE sin standard `sls`
 * (§5): ingen klasse valgt, derfor `w_max`/`exposure_class`/`w_max_source`/
 * `sigma_c_char_required` NULL, med grunnen `no_exposure_class`.
 */
const defaultSls = {
  phi_ef: 2.0,
  exposure_class: null,
  w_max: null,
  w_max_source: null,
  w_max_reason: 'no_exposure_class',
  // Stadium II på forespørsel: `false` er «regn tilstanden», ikke «ikke spurt».
  assume_cracked: false,
  sigma_c_char_factor: 0.6,
  sigma_c_qp_factor: 0.45,
  sigma_s_char_factor: 0.8,
  sigma_c_char_required: null,
};

test('bjelkepayloaden har formen fra endringsrunde 2 §4.2', () => {
  const built = buildPayload(BEAM_STATE);
  const expected = {
    schema: 1,
    analysis: 'bending',
    section: {
      type: 'beam',
      b: 300,
      h: 600,
      concrete: { fck: 30, gamma_c: 1.5, alpha_cc: 1.0, law: 'parabolarectangle' },
      steel: {
        fyk: 500,
        Es: 200000,
        ftk: 540,
        k: 1.08,
        epsuk: 0.075,
        gamma_eps: 0.9,
        gamma_s: 1.15,
        law: 'elasticplastic',
      },
      rebar: [
        {
          id: 'L1',
          kind: 'bars',
          area: 942.4777960769379,
          bars: [
            { y: -100, z: -250, dia: 20 },
            { y: 0, z: -250, dia: 20 },
            { y: 100, z: -250, dia: 20 },
          ],
        },
      ],
      shear: noStirrups,
    },
    loads: { combinations: [oneCombo], active: 'C1' },
    options: {
      theta: 0,
      integrator: 'marin',
      subtract_bar_area: false,
      complete_domain: true,
      mc_pre_yield: 10,
      mc_post_yield: 10,
      mc_chi: null,
    },
    sls: defaultSls,
  };
  assert.deepEqual(built, expected);
  // …og med SAMME nøkkelrekkefølge, ikke bare `deepEqual`-lik.
  assert.equal(JSON.stringify(built), JSON.stringify(expected));
});

test('platepayloaden har formen fra endringsrunde 2 §4.2', () => {
  const built = buildPayload(SLAB_STATE);
  const expected = {
    schema: 1,
    analysis: 'bending',
    section: {
      type: 'slab',
      b: 1000,
      h: 200,
      concrete: { fck: 30, gamma_c: 1.5, alpha_cc: 1.0, law: 'parabolarectangle' },
      steel: {
        fyk: 500,
        Es: 200000,
        ftk: 540,
        k: 1.08,
        epsuk: 0.075,
        gamma_eps: 0.9,
        gamma_s: 1.15,
        law: 'elasticplastic',
      },
      rebar: [
        {
          id: 'L1',
          kind: 'strip',
          area: 1000.8613763648898,
          strip: { width: 83.40511469707415, height: 12, z: -69 },
        },
      ],
      shear: noStirrups,
    },
    loads: { combinations: [oneCombo], active: 'C1' },
    options: {
      theta: 0,
      integrator: 'marin',
      subtract_bar_area: false,
      complete_domain: true,
      mc_pre_yield: 10,
      mc_post_yield: 10,
      mc_chi: null,
    },
    sls: defaultSls,
  };
  assert.deepEqual(built, expected);
  assert.equal(JSON.stringify(built), JSON.stringify(expected));
});

/**
 * R7 — STEG 2, §C1/C3. `type` er et RÅTT felt (normalisert allerede i
 * `createCombo`), på nøyaktig samme sti nøkkelrekkefølge-testene over allerede
 * bestått beviser: `payload.loads.combinations[i].type` — IKKE
 * `payload.section.combos[i].type`, som v5 (feilaktig) navnga (§C3).
 */
test('R7 — type ligger i loads.combinations[i], ikke under section', () => {
  const state = clone(BEAM_STATE);
  state.combos = [
    { id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0 },
    { id: 'C2', name: 'SLS 1', type: 'characteristic', N_Ed: 0, M_Ed: 0, V_Ed: 0 },
  ];
  const built = buildPayload(state);
  assert.equal(built.loads.combinations[0].type, 'uls');
  assert.equal(built.loads.combinations[1].type, 'characteristic');
  assert.ok(!('combos' in built.section), 'payloaden har ingen section.combos — v5 sin sti var feil');
});

test('bars kommer FRA barPositions — ingen parallell koordinatregning', () => {
  const state = clone(BEAM_STATE);
  // To lag med ulik diameter, antall og kant, slik at et hardkodet svar ikke
  // kan snike seg gjennom.
  state.layers = [
    { id: 'L1', mode: 'bars', dia: 25, count: 4, edge: 'bottom', dc: 60 },
    { id: 'L2', mode: 'bars', dia: 12, count: 1, edge: 'top', dc: 41 },
  ];
  state.cover_side = 35;
  // Bøyla bor i RADEN nå. `state.stirrup_dia` finnes ikke, så en test som
  // setter den ville beskrevet en tilstand appen ikke kan komme i.
  state.shear = { strut_angle_deg: 45, z_factor: 0.9,
    stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] };

  const built = buildPayload(state);
  const geometry = { b: 300, h: 600 };
  // Testen speiler `payload.js` sitt kall NØYAKTIG, inkludert at
  // `opts.stirrup_dia` fylles fra `stirrupCoverDia(state)`. Sendte den `state`
  // rått — slik payloaden gjorde før — ville den bestått mot en payload som
  // la jernene 8 mm for langt ut, fordi BEGGE leste et felt som ikke finnes.
  // En test som gjentar kallerens feil er verdiløs.
  const opts = { ...state, stirrup_dia: stirrupCoverDia(state) };
  built.section.rebar.forEach((entry, i) => {
    assert.deepEqual(entry.bars, barPositions(state.layers[i], geometry, opts));
  });
  // Og den uavhengige kontrollen: ytterste Ø25-jern skal stå i
  // 150 − 35 (cover_side) − 8 (bøyle) − 12,5 (Ø/2) = 94,5 mm.
  assert.equal(Math.max(...built.section.rebar[0].bars.map((b) => b.y)), 94.5);
  // Sanity: koordinatene er faktisk ulike per lag.
  assert.notDeepEqual(built.section.rebar[0].bars, built.section.rebar[1].bars);
});

test('platelag blir en utsmurt stripe, fra equivalentStrip', () => {
  const built = buildPayload(SLAB_STATE);
  const entry = built.section.rebar[0];
  assert.equal(entry.kind, 'strip');
  assert.ok(!('bars' in entry));
  assert.deepEqual(entry.strip, equivalentStrip(SLAB_STATE.layers[0], 200));
  // A_s ≈ 1000 mm²/m er hele grunnlaget for referanseplata.
  assert.ok(Math.abs(entry.area - 1000) < 1);
});

test('plata sender b = 1000 selv om geometry.b sier noe annet', () => {
  const state = clone(SLAB_STATE);
  state.geometry.b = 250;
  const built = buildPayload(state);
  assert.equal(built.section.b, 1000);
  // Jernkoordinatene skal også følge 1000, ikke 250.
  assert.deepEqual(
    built.section.rebar[0].strip,
    equivalentStrip(state.layers[0], 200)
  );
});

test('enheter konverteres ÉN gang: kN → N, kNm → Nmm og kN → N, per kombinasjon', () => {
  const state = clone(BEAM_STATE);
  state.combos = [{ id: 'C1', name: 'ULS 1', N_Ed: -200, M_Ed: 250, V_Ed: 120 }];
  const built = buildPayload(state);
  assert.equal(built.loads.combinations[0].N_Ed, -200000);
  assert.equal(built.loads.combinations[0].M_Ed, 250000000);
  assert.equal(built.loads.combinations[0].V_Ed, 120000);
});

test('M_Ed er SIGNERT per kombinasjon (endringsrunde 4 §1.2/§1.4) — fortegnet på inndata skal IKKE forsvinne', () => {
  const state = clone(BEAM_STATE);
  state.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: -250 }];
  // Ingen `abs` lenger: −250 kNm ⇒ −250 000 000 Nmm, uendret fortegn.
  assert.equal(buildPayload(state).loads.combinations[0].M_Ed, -250000000);
  state.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: 250 }];
  assert.equal(buildPayload(state).loads.combinations[0].M_Ed, 250000000);
  // N_Ed beholder som før fortegnet: n < 0 er TRYKK.
  state.combos = [{ id: 'C1', name: '', N_Ed: -500, M_Ed: 0 }];
  assert.equal(buildPayload(state).loads.combinations[0].N_Ed, -500000);
});

test('V_Ed er en STØRRELSE — fortegnet på skjærkraften betyr ingenting (§4.1c)', () => {
  const state = clone(BEAM_STATE);
  state.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: 0, V_Ed: -120 }];
  assert.equal(buildPayload(state).loads.combinations[0].V_Ed, 120000);
  state.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: 0, V_Ed: 120 }];
  assert.equal(buildPayload(state).loads.combinations[0].V_Ed, 120000);
});

test('theta overlever (§1.3): følger RADENS EGEN M_Ed-fortegn, options.theta følger DEN AKTIVE kombinasjonen', () => {
  assert.equal(buildPayload(BEAM_STATE).loads.combinations[0].theta, 0);
  const state = clone(BEAM_STATE);
  state.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: 250 }];
  assert.equal(buildPayload(state).loads.combinations[0].theta, Math.PI);
  // `options.theta` følger den AKTIVE kombinasjonens M_Ed — ikke et fjernet
  // `state.direction`, og ikke nødvendigvis samme som en annen rads theta.
  assert.equal(buildPayload(BEAM_STATE).options.theta, 0);
  const hog = clone(BEAM_STATE);
  hog.combos = [{ id: 'C1', name: '', N_Ed: 0, M_Ed: 250 }];
  hog.activeCombo = 'C1';
  assert.equal(buildPayload(hog).options.theta, Math.PI);
});

test('flere kombinasjoner blir flere rader, i samme rekkefølge', () => {
  const state = clone(BEAM_STATE);
  state.combos = [
    { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: -150, V_Ed: 0 },
    { id: 'C2', name: 'ULS 2', N_Ed: -500, M_Ed: 250, V_Ed: 0 },
  ];
  state.activeCombo = 'C2';
  const built = buildPayload(state);
  assert.equal(built.loads.combinations.length, 2);
  assert.equal(built.loads.combinations[0].id, 'C1');
  assert.equal(built.loads.combinations[0].M_Ed, -150000000);
  assert.equal(built.loads.combinations[0].theta, 0);
  assert.equal(built.loads.combinations[1].id, 'C2');
  assert.equal(built.loads.combinations[1].N_Ed, -500000);
  assert.equal(built.loads.combinations[1].theta, Math.PI);
  assert.equal(built.loads.active, 'C2');
  // options.theta følger AKTIV (C2, M_Ed=250 ⇒ π), ikke C1.
  assert.equal(built.options.theta, Math.PI);
});

test('section.shear: strut_angle_deg, z_factor og bøylerader oversettes uendret (§3.4)', () => {
  const state = clone(BEAM_STATE);
  state.shear = {
    strut_angle_deg: 30,
    z_factor: 0.85,
    stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }],
  };
  const built = buildPayload(state);
  assert.deepEqual(built.section.shear, {
    strut_angle_deg: 30,
    z_factor: 0.85,
    stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }],
  });
});

test('section.shear er ALLTID med, også med tom stirrups-liste — motoren regner skjær for alle kombinasjoner', () => {
  const built = buildPayload(BEAM_STATE);
  assert.deepEqual(built.section.shear, { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] });
});

test('ftk regnes som k·fyk og sendes alltid med', () => {
  assert.equal(buildPayload(BEAM_STATE).section.steel.ftk, 540);
  const s = clone(BEAM_STATE);
  s.steel.k = 1.05;
  // ftk mater n_max via check_axial_load, som kjøres FØR hver analyse — er den
  // borte eller feil, feiler motoren for begge arbeidsdiagram.
  assert.equal(buildPayload(s).section.steel.ftk, 525);
});

test('integrator er hardkodet marin og complete_domain alltid true', () => {
  const state = clone(BEAM_STATE);
  // Selv om noen prøver å snike inn et valg i options, skal det ignoreres:
  // et ukjent integratornavn faller STILLE tilbake til marin i pakken.
  state.options.integrator = 'fiber';
  state.options.complete_domain = false;
  const built = buildPayload(state);
  assert.equal(built.options.integrator, 'marin');
  assert.equal(built.options.complete_domain, true);
  assert.ok(!('meshSize' in built.options));
});

test('α_cc, γ_c og γ_s på 0 eller tomt skal KASTE, ikke bli standardverdier', () => {
  for (const [group, key] of [
    ['concrete', 'alpha_cc'],
    ['concrete', 'gamma_c'],
    ['steel', 'gamma_s'],
  ]) {
    for (const bad of [0, '', null, undefined, NaN, -1]) {
      const state = clone(BEAM_STATE);
      state[group][key] = bad;
      assert.throws(
        () => buildPayload(state),
        /større enn 0/,
        `${group}.${key} = ${String(bad)} slapp gjennom`
      );
    }
  }
});

test('mc_chi er null som standard og settes av overrides', () => {
  assert.equal(buildPayload(BEAM_STATE).options.mc_chi, null);
  const one = buildPayload(BEAM_STATE, { analysis: 'moment_curvature', mc_chi: -5.7e-6 });
  assert.equal(one.analysis, 'moment_curvature');
  assert.equal(one.options.mc_chi, -5.7e-6);
  // Alt annet skal være uendret mellom to påfølgende krumningskall.
  const a = buildPayload(BEAM_STATE, { analysis: 'moment_curvature', mc_chi: -1e-6 });
  const b = buildPayload(BEAM_STATE, { analysis: 'moment_curvature', mc_chi: -2e-6 });
  delete a.options.mc_chi;
  delete b.options.mc_chi;
  assert.deepEqual(a, b);
});

test('payloaden er ren JSON — ingen NaN, Infinity eller undefined', () => {
  const text = JSON.stringify(buildPayload(BEAM_STATE));
  // `mc_chi` og `sls`s fire ubesvarte SLS-felt (§4/§5) er LOVLIGE `null`-er i
  // kontrakten — BEAM_STATE har ingen valgt eksponeringsklasse, så
  // `exposure_class`/`w_max`/`w_max_source` er `null` og `w_max_reason` er
  // strengen 'no_exposure_class' (ikke null). Alt ANNET null ville fortsatt
  // vært en NaN som slapp gjennom.
  const withoutLegitimateNulls = text
    .replace('"mc_chi":null', '')
    .replace('"exposure_class":null', '')
    .replace('"w_max":null', '')
    .replace('"w_max_source":null', '')
    .replace('"sigma_c_char_required":null', '');
  assert.ok(!/null/.test(withoutLegitimateNulls), 'uventet null i payloaden');
  assert.doesNotThrow(() => JSON.parse(text));
});

/* ---------------- ÉN bøyle, helt ut i kontrakten ---------------- */

/**
 * Den fysiske bøyla er ETT jern, og det må gjelde HELE veien: fra raden
 * brukeren skriver i, via jernkoordinatene, til `section.shear` motoren regner
 * V_Rd,s av. Testen går gjennom `store.js`, ikke en håndskrevet tilstand,
 * nettopp fordi det er DER tilstanden bygges — en payload bygget av to tall
 * som spriker er akkurat feilen som ikke gir utslag før noen måler bjelka.
 *
 * ⚠ DENNE TESTEN ER RØD, OG DEN HAR RETT.
 * `payload.js:94` kaller `barPositions(layer, geometry, state)` — den sender
 * `state` RÅTT som `opts`, og `barPositions` leser `opts.stirrup_dia`. Det
 * feltet finnes ikke lenger, så payloaden regner jernene med bøyle = 0 og
 * legger dem Ø_bøyle mm for langt ut mot sidekanten. `section-draw.js` (linje
 * 360 og 737) ble rettet i samme runde og sender `stirrup_dia:
 * stirrupCoverDia(state)`. Tegningen og payloaden er dermed uenige om hvor
 * jernene står — nøyaktig den sviktformen `rebar.js` sin hodekommentar kaller
 * den verste som finnes, og som denne fila er skrevet for å fange.
 *
 * Rettelsen hører hjemme i produksjonskoden, ikke her:
 *   bars: barPositions(layer, geometry, { ...state, stirrup_dia: stirrupCoverDia(state) })
 */
test('bøylediameteren er ÉN verdi i payloaden: jernkoordinatene og section.shear ser samme bøyle', () => {
  const store = createStore({
    geometry: { b: 300, h: 600 },
    cover: 35,
    cover_side: 35,
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true }],
  });
  // Standardbjelken har S1. Brukeren setter den til Ø12.
  store.updateStirrup('S1', { dia: 12 });

  const s = store.getState();
  const built = buildPayload(s);
  assert.equal(built.section.shear.stirrups[0].dia, 12);
  // Jernene skal ligge 12 mm inn fra sidedekket: 150 − 35 − 12 − 10 = 93.
  assert.equal(built.section.rebar[0].bars[2].y, 300 / 2 - 35 - 12 - 10,
    'payloaden rykker ikke jernene inn for bøyla — payload.js leser et felt som er borte');
  // …og jernet har flyttet seg NEDOVER like mye: dc = 35 + 12 + 10 = 57 måles
  // fra underkanten, altså z = −300 + 57. Denne veien ER riktig, fordi `dc`
  // regnes av `rebar.js:suggestedDc`, som leser bøyleraden.
  assert.equal(built.section.rebar[0].bars[0].z, -600 / 2 + 57);
});

/*
 * ===========================================================================
 * SLS §4 — `payload.sls` bærer TALL, aldri en klassestreng motoren skal slå
 * opp (materials.js:slsLimits er den ENE JS-kilden som kjenner tabellen).
 *
 * FØR denne endringen fantes `payload.sls` ikke: `built.sls` var `undefined`,
 * og `built.sls.w_max` under kastet `TypeError: Cannot read properties of
 * undefined (reading 'w_max')`. Det er beviset for at disse ville feilet.
 * ===========================================================================
 */

test('SLS-P1 — buildPayload: uten valgt klasse er sls.w_max null MED grunnen no_exposure_class, sigma_c_char_required null', () => {
  const store = createStore();
  const built = buildPayload(store.getState());
  assert.equal(built.sls.exposure_class, null);
  assert.equal(built.sls.w_max, null);
  assert.equal(built.sls.w_max_reason, 'no_exposure_class');
  assert.equal(built.sls.sigma_c_char_required, null);
  // UTLEDET, ikke gjettet: standardtilstanden har ingen overstyring, så
  // `resolveCreep` regner EC2 tillegg B for bjelken 300×600 i C30/37 ved
  // RH 50, t0 = 28 døgn og 50 år. Tallet er låst her fordi det er det
  // rapporten trykker og motoren regner med.
  assert.ok(Math.abs(built.sls.phi_ef - 2.3458) < 5e-4,
    `phi_ef = ${built.sls.phi_ef}, ventet ~2,3458 (EC2 tillegg B)`);
  assert.equal(built.sls.sigma_c_char_factor, 0.6);
  assert.equal(built.sls.sigma_c_qp_factor, 0.45);
  assert.equal(built.sls.sigma_s_char_factor, 0.8);
});

test('SLS-P2 — buildPayload: XC3 valgt ⇒ w_max 0,30 fra klassen, kilde class, sigma_c_char_required false', () => {
  const store = createStore();
  store.patch('sls', { exposure_class: 'XC3' });
  const built = buildPayload(store.getState());
  assert.equal(built.sls.exposure_class, 'XC3');
  assert.equal(built.sls.w_max, 0.3);
  assert.equal(built.sls.w_max_source, 'class');
  assert.equal(built.sls.sigma_c_char_required, false);
});

test('SLS-P3 — buildPayload: override vinner over klassen i payloaden også (§4/§11)', () => {
  const store = createStore();
  store.patch('sls', { exposure_class: 'XC3', w_max_override: 0.15 });
  const built = buildPayload(store.getState());
  assert.equal(built.sls.w_max, 0.15);
  assert.equal(built.sls.w_max_source, 'manual');
});

test('SLS-P4 — buildPayload: XD3 uten override ⇒ w_max null MED grunnen no_crack_width_limit — IKKE samme grunn som SLS-P1 (AC14)', () => {
  const store = createStore();
  store.patch('sls', { exposure_class: 'XD3' });
  const built = buildPayload(store.getState());
  assert.equal(built.sls.w_max, null);
  assert.equal(built.sls.w_max_reason, 'no_crack_width_limit');
  assert.equal(built.sls.sigma_c_char_required, true);
});
