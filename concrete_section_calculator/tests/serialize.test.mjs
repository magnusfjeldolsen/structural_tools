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
import { createStore, defaultState } from '../js/store.js';
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

test('rundtur med to lag og to kombinasjoner, signert M_Ed og V_Ed, uten aksialkraft', () => {
  const s = {
    ...defaultState(),
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 41, dc_auto: false },
    ],
    combos: [
      // STEG 2: `type` er med — fromDocument→createCombo fyller det ALLTID
      // inn (planens felle-liste), og en deepEqual mot HELE state må derfor
      // ha det her også for at rundturen skal stemme.
      { id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: -150, V_Ed: 0 },
      { id: 'C2', name: 'ULS 2', type: 'uls', N_Ed: 0, M_Ed: 250, V_Ed: 120 },
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

/*
 * ===========================================================================
 * STEG 2 — R5/R6: `combo_type_unknown`-noten (§D1)
 * ===========================================================================
 * BARE når fila FAKTISK hadde et `type`-felt createCombo måtte rette. En fil
 * helt uten feltet (alle filer fra før denne runden) skal IKKE gi noten —
 * det er nøyaktig det `document_field_defaulted` allerede dekker.
 */

test('R5 — fil med combo.type:"tull" gir en combo_type_unknown-note (severity warning), og raden blir uls', () => {
  const doc = toDocument(defaultState());
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', type: 'tull', N_Ed: 0, M_Ed: 0, V_Ed: 0 }];
  const { state, notes } = fromDocument(doc);
  assert.equal(state.combos[0].type, 'uls');
  const warn = notes.filter((n) => n.code === 'combo_type_unknown');
  assert.equal(warn.length, 1);
  assert.equal(warn[0].severity, 'warning');
  assert.equal(warn[0].field, 'C1');
});

test('R6 — fil HELT UTEN type-felt på combo gir INGEN combo_type_unknown-note, og raden blir uls', () => {
  const doc = toDocument(defaultState());
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 }];
  assert.ok(!('type' in doc.state.combos[0]), 'forutsetningen for testen: feltet er fysisk fraværende');
  const { state, notes } = fromDocument(doc);
  assert.equal(state.combos[0].type, 'uls');
  assert.ok(!notes.some((n) => n.code === 'combo_type_unknown'),
    'et felt som ALDRI var der er ikke det samme som et felt som var der og var ugyldig — dekket av document_field_defaulted');
});

test('R5b — en gyldig type gir INGEN combo_type_unknown-note', () => {
  const doc = toDocument(defaultState());
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', type: 'quasi_permanent', N_Ed: 0, M_Ed: 0, V_Ed: 0 }];
  const { state, notes } = fromDocument(doc);
  assert.equal(state.combos[0].type, 'quasi_permanent');
  assert.ok(!notes.some((n) => n.code === 'combo_type_unknown'));
});

test('state.result settes ALLTID til null, selv om fila skulle inneholde noe annet', () => {
  const doc = toDocument(defaultState());
  doc.state.result = { M_Rd: 999 }; // skal ikke kunne skje via toDocument, men fromDocument er robust uansett
  const { state } = fromDocument(doc);
  assert.equal(state.result, null);
});

/* ---------------- endringsrunde 4 §8 — shear i NESTED_GROUPS ---------------- */

/**
 * STANDARDBØYLA ER IKKE LENGER EN TOM LISTE.
 *
 * `fromDocument` fyller hull fra `defaultState()`, og standardtilstanden er en
 * BJELKE med én bøylerad (EC2 9.2.2 krever minimumsskjærarmering, og bøylas
 * diameter har ingen annen hjemplass etter at geometrifeltet ble fjernet). En
 * fil uten `shear` får derfor den raden, ikke en tom liste. Tallene her er
 * skrevet ut med vilje i stedet for å leses fra `defaultState()` — en test som
 * sammenlikner standarden med seg selv sier ingenting.
 */
const DEFAULT_STIRRUP_ROW = { id: 'S1', dia: 12, spacing: 150, legs: 2, fywk: 500, alpha: 90 };

test('fil uten shear: standardverdien med bjelkens bøylerad, og ett document_field_defaulted', () => {
  const doc = toDocument(defaultState());
  delete doc.state.shear;
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.shear,
    { strut_angle_deg: 45, z_factor: 0.9, stirrups: [DEFAULT_STIRRUP_ROW] });
  const defaulted = notes.filter((n) => n.code === 'document_field_defaulted' && n.field === 'shear');
  assert.equal(defaulted.length, 1);
});

test('fil med DELVIS shear-objekt: manglende felt fylles fra standarden, IKKE undefined (§8, five-things #5)', () => {
  const doc = toDocument(defaultState());
  // Bare z_factor lagret — strut_angle_deg og stirrups mangler.
  doc.state.shear = { z_factor: 0.8 };
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.shear,
    { strut_angle_deg: 45, z_factor: 0.8, stirrups: [DEFAULT_STIRRUP_ROW] });
  assert.ok(state.shear.strut_angle_deg !== undefined, 'strut_angle_deg skal IKKE bli undefined');
  // Toppnivånøkkelen `shear` FANTES i fila — ingen defaulted-melding for den.
  assert.ok(!notes.some((n) => n.code === 'document_field_defaulted' && n.field === 'shear'));
});

test('fil med TOM stirrups-liste beholder den tomme lista — det er en lovlig tilstand', () => {
  // «Ingen bøyler» (V_Rd,c-veien) skiller seg fra «fila sa ingenting om
  // bøyler». Fylte standarden inn en rad her, ville en plate eller en bjelke
  // brukeren bevisst har tømt fått bøyler tilbake ved hver lasting — og
  // `dc` ville hoppet 12 mm med dem.
  const doc = toDocument(defaultState());
  doc.state.shear = { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] };
  const { state } = fromDocument(doc);
  assert.deepEqual(state.shear.stirrups, []);
});

test('fil med FULLT shear-objekt inkludert bøylerader: bevares uendret', () => {
  const doc = toDocument(defaultState());
  doc.state.shear = {
    strut_angle_deg: 30,
    z_factor: 0.85,
    stirrups: [{ id: 'S1', dia: 10, spacing: 200, legs: 4, fywk: 400, alpha: 90 }],
  };
  const { state } = fromDocument(doc);
  assert.deepEqual(state.shear, doc.state.shear);
});

/* ---------------- endringsrunde 4 §2 — normalisering av analysis ved N_Ed ≠ 0 ---------------- */

test('fil med analysis:"bending" og N_Ed ≠ 0 normaliseres til nm_domain, med en analysis_forced_to_nm_domain-note', () => {
  const doc = toDocument(defaultState());
  doc.state.analysis = 'bending';
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', N_Ed: -500, M_Ed: 0, V_Ed: 0 }];
  const { state, notes } = fromDocument(doc);
  assert.equal(state.analysis, 'nm_domain');
  const forced = notes.filter((n) => n.code === 'analysis_forced_to_nm_domain');
  assert.equal(forced.length, 1);
  assert.equal(forced[0].severity, 'info');
});

test('fil med analysis:"bending" og N_Ed = 0 for ALLE kombinasjoner: ingen normalisering', () => {
  const doc = toDocument(defaultState());
  doc.state.analysis = 'bending';
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 150, V_Ed: 0 }];
  const { state, notes } = fromDocument(doc);
  assert.equal(state.analysis, 'bending');
  assert.ok(!notes.some((n) => n.code === 'analysis_forced_to_nm_domain'));
});

test('fil med analysis:"moment_curvature" og N_Ed ≠ 0: IKKE normalisert — regelen gjelder bare bending', () => {
  const doc = toDocument(defaultState());
  doc.state.analysis = 'moment_curvature';
  doc.state.combos = [{ id: 'C1', name: 'ULS 1', N_Ed: -500, M_Ed: 0, V_Ed: 0 }];
  const { state, notes } = fromDocument(doc);
  assert.equal(state.analysis, 'moment_curvature');
  assert.ok(!notes.some((n) => n.code === 'analysis_forced_to_nm_domain'));
});

/* ---------------- runde 8 §1 — det parkerte snittet i `stash` ---------------- */

test('gammel fil uten stash: standarden {beam:null, slab:null} og ett document_field_defaulted', () => {
  // Riktig oppførsel, ikke en mangel: den AKTIVE geometrien er den som betyr
  // noe, og en fil lagret før runde 8 har bare den ene.
  const doc = toDocument(defaultState());
  delete doc.state.stash;
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.stash, { beam: null, slab: null });
  const defaulted = notes.filter((n) => n.code === 'document_field_defaulted' && n.field === 'stash');
  assert.equal(defaulted.length, 1);
});

test('stash erstattes I SIN HELHET — den er med vilje IKKE i NESTED_GROUPS', () => {
  // Grunnen `stash` ikke flettes felt for felt som `geometry` og `shear`: en
  // halv `stash` er ikke et snitt med manglende felt, det er et snitt som ikke
  // finnes. Ble den flettet, ville en fil med bare `slab` fått en `beam: null`
  // den aldri hadde — og en delvis `slab` ville blitt fylt med bjelkens
  // standardverdier, altså en plate satt sammen av to ulike snitt.
  const doc = toDocument(defaultState());
  doc.state.stash = { slab: { geometry: { b: 1000, h: 260 } } };
  const { state } = fromDocument(doc);
  assert.deepEqual(state.stash, { slab: { geometry: { b: 1000, h: 260 } } });
  assert.ok(!('beam' in state.stash), 'en fletting ville lagt igjen en beam: null fila ikke hadde');
});

test('rundtur gjennom fil: bjelken overlever lagring mens PLATA er den aktive', () => {
  // Dette er hele poenget sett fra brukeren: lagre mens du tegner på plata, åpne
  // fila i morgen, bytt til bjelke — og bjelken står som du forlot den.
  const store = createStore({ geometry: { b: 300, h: 600 } });
  store.setSectionType('slab');
  store.patch('geometry', { h: 260 });

  const { state, notes } = fromDocument(toDocument(store.snapshot()));
  assert.deepEqual(notes, []);
  assert.equal(state.geometry.h, 260, 'plata er fortsatt den aktive');

  const reopened = createStore(state);
  reopened.setSectionType('beam');
  assert.equal(reopened.getState().geometry.b, 300);
  assert.equal(reopened.getState().geometry.h, 600);
});

/*
 * ===========================================================================
 * SLS §5 — `sls` i `NESTED_GROUPS`, SAMME grunn som `shear` allerede står der.
 *
 * FØR denne endringen var `sls` IKKE i `NESTED_GROUPS`: en fil med et DELVIS
 * `sls`-objekt (t.d. bare `exposure_class`) ville tatt «erstatt hel»-grenen
 * i `fromDocument` og gitt `phi_ef: undefined` — ikke `2.0`. Testen under
 * viser nettopp det tilfellet.
 * ===========================================================================
 */

test('fil uten sls: standardverdien (§5) — ingen klasse, phi_ef utledet, de tre 7.2-faktorene', () => {
  const doc = toDocument(defaultState());
  delete doc.state.sls;
  const { state, notes } = fromDocument(doc);
  assert.deepEqual(state.sls, {
    exposure_class: null,
    w_max_override: null,
    phi_ef: null,
    h0_override: null,
    RH: 50,
    t0: 28,
    t_life: 50 * 365,
    cement: 'N',
    assume_cracked: false,
    sigma_c_char_factor: 0.6,
    sigma_c_qp_factor: 0.45,
    sigma_s_char_factor: 0.8,
  });
  assert.equal(notes.filter((n) => n.code === 'document_field_defaulted' && n.field === 'sls').length, 1);
});

test('fil med DELVIS sls-objekt: manglende felt fylles fra standarden, IKKE undefined (§5, akkurat som shear §8)', () => {
  const doc = toDocument(defaultState());
  doc.state.sls = { exposure_class: 'XC3' };
  const { state } = fromDocument(doc);
  assert.equal(state.sls.exposure_class, 'XC3', 'den lagrede verdien overlever');
  // MIGRERINGEN: en fil LAGRET DA `phi_ef` VAR ET FAST TALL bærer `phi_ef: 2.0`,
  // og den skal fortsatt gi nøyaktig samme svar. Den leses derfor som en
  // OVERSTYRING på 2,0 — ikke som en verdi som skal erstattes av utledningen.
  // En fil UTEN `sls` i det hele tatt har aldri hatt et kryptall, og får
  // utledningen.
  assert.equal(state.sls.phi_ef, null, 'uten et lagret phi_ef skal det utledes');
  assert.ok(state.sls.phi_ef !== undefined);
  assert.equal(state.sls.RH, 50, 'krypinndataene fylles fra standarden');
  assert.equal(state.sls.cement, 'N');
});

// MERK: `fromDocument` selv validerer IKKE `exposure_class` — den bare
// slår sammen nøstede grupper (mønsteret over, likt `shear`). En ugyldig
// klasse i fila overlever HIT UENDRET; det er `store.replaceState()` som
// kjører `enforceSlsParams` på veien inn i staten (store.test.mjs: SLS-8),
// akkurat som en ugyldig `combo.type` normaliseres av `createCombo` her,
// men en ULOVLIG `activeCombo`-plassering først rettes av `enforceActiveCombo`
// i store.js, ikke i denne fila.

/* ================================================================== *
 * `doc_schema` — skrevet siden dag én, LEST først nå (oppgave C2)
 * ================================================================== */

test('doc_schema STØRRE enn DOCUMENT_SCHEMA: `document_schema_newer` (warning), og fila leses videre', () => {
  const doc = { ...toDocument(defaultState()), doc_schema: DOCUMENT_SCHEMA + 1 };
  doc.state.geometry = { b: 425, h: 875 };
  const { state, notes } = fromDocument(doc);
  const note = notes.find((n) => n.code === 'document_schema_newer');
  assert.ok(note, 'noten skal finnes');
  assert.equal(note.severity, 'warning');
  // «Les videre» er ikke en detalj, det er hele beslutningen: flettinga er
  // felt-for-felt mot standarden, så en nyere fil gir en GYLDIG tilstand
  // uansett. Å nekte ville vært å kaste en fil brukeren kan bruke.
  assert.ok(state, 'tilstanden skal være lastet, ikke forkastet');
  assert.equal(state.geometry.b, 425);
  assert.equal(state.geometry.h, 875);
});

test('doc_schema LIK eller LAVERE gir INGEN note — 1 er den eneste versjonen som har eksistert', () => {
  for (const schema of [DOCUMENT_SCHEMA, 0, -3, undefined, null, 'tull', NaN]) {
    const doc = { ...toDocument(defaultState()), doc_schema: schema };
    const { state, notes } = fromDocument(doc);
    assert.ok(state);
    assert.equal(
      notes.some((n) => n.code === 'document_schema_newer'), false,
      `doc_schema=${String(schema)} skal ikke gi noten`
    );
  }
});

test('resultView deles med lenka, men en rad som ikke finnes faller til envelope', () => {
  // Visningen er med i dokumentet fordi en delt lenke skal vise mottakeren det
  // samme som avsenderen så på. Men id-en kan være foreldet: avsenderen slettet
  // raden, eller lenka er eldre enn den. Da er envelopen det riktige svaret —
  // ikke en tom seksjon 6, og ikke en velger låst til et navn ingen kan se.
  const st = createStore();
  st.addCombo();
  st.setResultView('C2');
  const doc = JSON.parse(JSON.stringify(toDocument(st.getState())));
  assert.equal(doc.state.resultView, 'C2', 'visningen skal følge med dokumentet');

  doc.state.resultView = 'C9';
  const mottaker = createStore();
  mottaker.replaceState(fromDocument(doc).state);
  assert.equal(mottaker.getState().resultView, 'envelope');
});
