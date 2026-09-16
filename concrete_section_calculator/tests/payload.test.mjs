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
import { barPositions, equivalentStrip } from '../js/rebar.js';
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
  stirrup_dia: 0,
  cover_side: 40,
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50, dc_auto: false }],
  // Endringsrunde 2 §4.1: `loads` er erstattet av `combos` + `activeCombo`.
  // Endringsrunde 4 §1.2: ingen `direction` lenger — `M_Ed` er signert, og
  // `V_Ed` er nytt (§3.4).
  combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
  activeCombo: 'C1',
  analysis: 'bending',
  // Standard skjærtilstand (§3.4): ingen bøyler.
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  doc: { project: '', title: '', author: '', date: '', note: '' },
  result: null,
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

/** Formen §4.2 krever — delt av begge testene pga. felles struktur. */
const oneCombo = { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0, theta: 0 };

/** `section.shear` med tom bøyleliste — formen §3.4/v3 §4.1 krever. */
const noStirrups = { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] };

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
  };
  assert.deepEqual(built, expected);
  assert.equal(JSON.stringify(built), JSON.stringify(expected));
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
  state.stirrup_dia = 8;

  const built = buildPayload(state);
  const geometry = { b: 300, h: 600 };
  built.section.rebar.forEach((entry, i) => {
    assert.deepEqual(entry.bars, barPositions(state.layers[i], geometry, state));
  });
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
  assert.ok(!/null/.test(text.replace('"mc_chi":null', '')), 'uventet null i payloaden');
  assert.doesNotThrow(() => JSON.parse(text));
});

/* ---------------- endringsrunde 5 §B — bindingen når helt ut i kontrakten ---------------- */

/**
 * Den fysiske bøyla er ETT tall, og det må gjelde HELE veien: fra feltet
 * brukeren skriver i, via jernkoordinatene, til `section.shear` motoren
 * regner V_Rd,s av. Testen går gjennom `store.js`, ikke gjennom en håndskrevet
 * stat, nettopp fordi det er DER bindingen bor — en payload bygget av to tall
 * som spriker er akkurat feilen som ikke gir noe utslag før noen måler bjelka.
 */
test('bøylediameteren er ÉN verdi i payloaden: jernkoordinatene og section.shear ser samme bøyle', () => {
  const store = createStore({
    geometry: { b: 300, h: 600 },
    cover: 35,
    cover_side: 35,
    stirrup_dia: 8,
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true }],
  });
  store.addStirrup();
  store.updateStirrup('S1', { dia: 12 });

  const s = store.getState();
  const built = buildPayload(s);
  assert.equal(built.section.shear.stirrups[0].dia, 12);
  // Jernene ligger nå 12 mm inn fra sidedekket, ikke 8 — `barPositions` leser
  // `state.stirrup_dia`, som bindingen har flyttet.
  assert.deepEqual(
    built.section.rebar[0].bars,
    barPositions(s.layers[0], { b: 300, h: 600 }, s)
  );
  assert.equal(built.section.rebar[0].bars[2].y, 300 / 2 - 35 - 12 - 10);
  // …og jernet har flyttet seg NEDOVER like mye: dc = 35 + 12 + 10 = 57 måles
  // fra underkanten, altså z = −300 + 57.
  assert.equal(built.section.rebar[0].bars[0].z, -600 / 2 + 57);
});
