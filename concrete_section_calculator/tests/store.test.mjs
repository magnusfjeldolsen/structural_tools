/**
 * store.test.mjs — koblingene i endringsrunde 2 §3.4: hvor `recomputeAutoDc`
 * faktisk hektes på, og at `cloneState` klarer `combos` som array.
 *
 * Dette er der bestillingens punkt 2 («en duplisert kopi skal ikke låses fast
 * på originalens plass») og punkt 7 («endret diameter oppdaterer plasseringen,
 * med mindre dc er satt manuelt») faktisk lever — `rebar.js` sine tester
 * dekker bare de rene funksjonene, ikke at `store.js` kaller dem på riktig
 * sted til riktig tid.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore, RUN_ALL } from '../js/store.js';

/**
 * START fra §3.3-tabellen: L1 og L2, begge Ø20 i bunn, begge `dc_auto`,
 * med standard `cover`/bøylerad/`spacing` (`createStore()` sine
 * standardverdier er nøyaktig STD fra §2.3/§3.3).
 */
const START_LAYERS = () => [
  { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 57, dc_auto: true },
  { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 98, dc_auto: true },
];

const startStore = () => createStore({ layers: START_LAYERS() });

test('addLayer stables nytt lag etter EC2 8.2 — andre Ø20-laget i bunn blir dc = 98 (§2.3)', () => {
  const store = createStore(); // standard: ett lag, L1 Ø20 bunn, dc = 53
  const layer = store.addLayer({ dia: 20, edge: 'bottom' });
  assert.equal(layer.dc, 98);
  assert.equal(layer.dc_auto, true);
});

test('duplicateLayer av et LÅST lag: kopien får dc_auto:true og stables — ikke 120 (bestillingens punkt 2)', () => {
  const store = createStore();
  const [l1] = store.getState().layers;
  store.updateLayer(l1.id, { dc: 120 }); // brukeren skriver en verdi: laget låses
  const locked = store.getState().layers.find((l) => l.id === l1.id);
  assert.equal(locked.dc_auto, false);
  assert.equal(locked.dc, 120);

  const copy = store.duplicateLayer(l1.id);
  assert.equal(copy.dc_auto, true);
  // 120 + (20+20)/2 + minClearBetween(20,20,std) = 120 + 20 + 21 = 161 — IKKE
  // 120. En kopi som arvet den låste dc-en ville landet oppå originalen.
  assert.equal(copy.dc, 161);
  assert.notEqual(copy.dc, locked.dc);
});

test('updateLayer({dia}) flytter et dc_auto-lag — §3.3: L1 → Ø32', () => {
  const store = startStore();
  store.updateLayer('L1', { dia: 32 });
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 63);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 121);
});

test('updateLayer({dia}) lar et LÅST lag stå — §3.3: L2 låst dc:120, L1 → Ø20', () => {
  const store = startStore();
  store.updateLayer('L2', { dc: 120 }); // låser L2
  store.updateLayer('L1', { dia: 20 }); // samme verdi, men en endring i patchen skal likevel trigge recompute
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 57);
  const l2 = layers.find((l) => l.id === 'L2');
  assert.equal(l2.dc_auto, false);
  assert.equal(l2.dc, 120);
});

test('setState({cover}) flytter alle dc_auto-lag — §3.3: cover 35 → 45', () => {
  const store = startStore();
  store.setState({ cover: 45 });
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 67);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 108);
});

test('updateLayer({dc}) låser laget; updateLayer({dc_auto:true}) låser opp og regner om UMIDDELBART', () => {
  const store = startStore();
  store.updateLayer('L2', { dc: 999 });
  let l2 = store.getState().layers.find((l) => l.id === 'L2');
  assert.equal(l2.dc_auto, false);
  assert.equal(l2.dc, 999);

  store.updateLayer('L2', { dc_auto: true });
  l2 = store.getState().layers.find((l) => l.id === 'L2');
  assert.equal(l2.dc_auto, true);
  // Tilbake til stablet posisjon bak L1 (57) — ikke stående på 999. Dette er
  // §3.1 sin «begge veier skal virke», med `dc_auto` som eneste input.
  assert.equal(l2.dc, 98);
});

test('setSectionType fram og tilbake bevarer dc_auto, både låst og ulåst lag', () => {
  const store = createStore({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 57, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 120, dc_auto: false },
    ],
  });
  store.setSectionType('slab');
  store.setSectionType('beam');
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc_auto, true);
  assert.equal(layers.find((l) => l.id === 'L2').dc_auto, false);
});

test("patch('spacing', {d_g:32}) flytter lagene — §2.3: L2 blir 114, L1 uendret", () => {
  const store = startStore();
  store.patch('spacing', { d_g: 32 });
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 57); // suggestedDc uendret av d_g
  assert.equal(layers.find((l) => l.id === 'L2').dc, 114);
});

test('cloneState via setState: combos forblir en ARRAY, aldri {0:…,1:…}', () => {
  const store = createStore();
  store.setState({ direction: 'hogging' });
  const { combos } = store.getState();
  assert.ok(Array.isArray(combos), 'combos er ikke lenger en array etter cloneState');
  assert.equal(combos.length, 1);
  assert.equal(combos[0].id, 'C1');
});

test('cloneState kloner shear.stirrups som en NY array — mutasjon utenfra skal ikke nå tilstanden', () => {
  const store = createStore({ shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] } });
  const before = store.getState().shear.stirrups;
  store.setState({ analysis: 'bending' }); // hvilken som helst setState trigger cloneState
  const after = store.getState().shear.stirrups;
  assert.notEqual(before, after, 'stirrups skal være en NY array etter cloneState');
  assert.notEqual(before[0], after[0], 'hver bøylerad skal også være et NYTT objekt');
  assert.deepEqual(after, before);
});

/* ---------------- endringsrunde 4 §2 — enforceAnalysis (hullet D3 fant) ---------------- */
// Planen navnga tre «dører» inn til `analysis: 'bending'` med aksialkraft —
// chippen, tasten `1`, en lagret fil — men velger brukeren «Bending
// resistance» FØR aksialkraften kommer inn, sto `state.analysis` urørt.
// Regelen gjelder tilstanden, ikke inngangen til den: `store.js` tvinger nå
// `analysis` innenfor `allowedAnalyses(state)` etter alt som rører `combos`,
// og etter `setInputs` (`replaceState`), som planen feilaktig kalte unntatt.

test('enforceAnalysis: updateCombo med N_Ed ≠ 0 tvinger analysis bort fra bending', () => {
  const store = createStore(); // analysis: 'bending' som standard, N_Ed: 0
  assert.equal(store.getState().analysis, 'bending');
  store.updateCombo('C1', { N_Ed: -500 });
  assert.equal(store.getState().analysis, 'nm_domain');
});

test('enforceAnalysis: addCombo med N_Ed ≠ 0 tvinger analysis bort fra bending', () => {
  const store = createStore();
  assert.equal(store.getState().analysis, 'bending');
  store.addCombo({ N_Ed: -200 });
  assert.equal(store.getState().analysis, 'nm_domain');
});

test('enforceAnalysis er ENVEIS: N_Ed tilbake til 0 skal IKKE flytte analysis tilbake til bending', () => {
  const store = createStore();
  store.updateCombo('C1', { N_Ed: -500 });
  assert.equal(store.getState().analysis, 'nm_domain');
  // Å flytte brukeren to ganger er verre enn å flytte hen én gang (§2).
  store.updateCombo('C1', { N_Ed: 0 });
  assert.equal(store.getState().analysis, 'nm_domain');
});

test('enforceAnalysis rører aldri moment_curvature — allowedAnalyses fjerner bare bending', () => {
  const store = createStore({ analysis: 'moment_curvature' });
  assert.equal(store.getState().analysis, 'moment_curvature');
  store.updateCombo('C1', { N_Ed: -500 });
  assert.equal(store.getState().analysis, 'moment_curvature');
  store.addCombo({ N_Ed: -300 });
  assert.equal(store.getState().analysis, 'moment_curvature');
});

test('enforceAnalysis gjelder også setInputs (replaceState) — planen kalte dette feilaktig et bevisst unntak', () => {
  const store = createStore();
  store.replaceState({ analysis: 'bending', combos: [{ id: 'C1', name: 'ULS 1', N_Ed: -500, M_Ed: 0, V_Ed: 0 }] });
  assert.equal(store.getState().analysis, 'nm_domain');
});

test('enforceAnalysis gjelder allerede ved construction — createStore med ulovlig starttilstand', () => {
  const store = createStore({
    analysis: 'bending',
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: -500, M_Ed: 0, V_Ed: 0 }],
  });
  assert.equal(store.getState().analysis, 'nm_domain');
});

test('removeCombo av den AKTIVE flytter activeCombo; den siste kan ikke fjernes', () => {
  const store = createStore();
  const c2 = store.addCombo({ name: 'ULS 2', N_Ed: -500, M_Ed: 250 });
  store.setActiveCombo(c2.id);
  assert.equal(store.getState().activeCombo, c2.id);

  store.removeCombo(c2.id);
  assert.equal(store.getState().combos.length, 1);
  assert.equal(store.getState().activeCombo, 'C1');

  // Den siste kombinasjonen kan ikke fjernes — ingen endring i det hele tatt.
  const before = store.getState();
  store.removeCombo('C1');
  assert.equal(store.getState().combos.length, 1);
  assert.equal(store.getState(), before);
});

/**
 * Plata er alltid 1000 mm bred, uansett hvilken dør staten kom inn gjennom.
 * `setSectionType` setter bredden, men `setInputs`/`replaceState` er en egen
 * dør — nøyaktig samme mønster som `enforceAnalysis` (§2.3). Uten denne kunne
 * `sectionWidth()` si 1000 til motoren mens `geometry.b` sa 300 til alt som
 * leste staten rått.
 */
test('replaceState: plate med bjelkebredde normaliseres til 1000 mm', () => {
  const store = createStore();
  const next = store.replaceState({
    sectionType: 'slab',
    geometry: { b: 300, h: 200 },
  });
  assert.equal(next.geometry.b, 1000);
});

test('replaceState: bjelkens bredde røres ikke', () => {
  const store = createStore();
  const next = store.replaceState({ sectionType: 'beam', geometry: { b: 450, h: 700 } });
  assert.equal(next.geometry.b, 450);
});

test('createStore: en plate gitt som initial-stat får riktig bredde', () => {
  const store = createStore({ sectionType: 'slab', geometry: { b: 250, h: 180 } });
  assert.equal(store.getState().geometry.b, 1000);
  assert.equal(store.getState().geometry.h, 180, 'høyden skal ikke røres');
});

/* ---------------- ÉN fysisk bøyle, ÉN kilde ---------------- */
/*
 * FØR: `state.stirrup_dia` (feltet «Stirrup Ø» i geometripanelet) og
 * `shear.stirrups[0].dia` var TO tall for ETT jern — det første styrte
 * jernenes plassering og `dc`, det andre skjærkapasiteten og bøyletegningen —
 * og en `syncStirrupDia` holdt dem i takt etter hver endring.
 *
 * NÅ: geometrifeltet er slettet, `syncStirrupDia` er slettet, og
 * `rebar.js:stirrupCoverDia` leser BARE `shear.stirrups`. Testene under er
 * derfor ikke lenger om at to tall holdes like — de er om at det bare finnes
 * ÉTT: `state.stirrup_dia` skal være `undefined`, og `dc` skal følge RADEN.
 *
 * At bjelken har en bøylerad fra start er det som gjør fjerningen ufarlig:
 * EC2 9.2.2 krever minimumsskjærarmering i bjelker, så en bjelke uten bøyler
 * er en tilstand som ikke finnes i virkeligheten, og `dc` hopper ikke 12 mm
 * idet brukeren åpner skjærpanelet.
 */

/** dc for standardlaget (Ø20 i bunn) = cover + bøyle + Ø/2. */
const dcOfL1 = (store) => store.getState().layers.find((l) => l.id === 'L1').dc;

test('standardbjelken HAR en bøylerad, og dc er regnet med den', () => {
  const s = createStore().getState();
  assert.equal(s.sectionType, 'beam');
  assert.equal(s.shear.stirrups.length, 1, 'EC2 9.2.2: en bjelke uten bøyler finnes ikke');
  assert.equal(s.shear.stirrups[0].id, 'S1');
  assert.equal(s.shear.stirrups[0].dia, 12);
  assert.equal(s.shear.stirrups[0].alpha, 90, 'section.js avviser alt annet enn α = 90° i v1');
  assert.equal(s.layers[0].dc, 57, 'dc = 35 + 12 + 20/2 — bøyla i raden, ikke et geometrifelt');
});

test('geometrifeltet finnes ikke: state.stirrup_dia er undefined, og dc følger RADEN', () => {
  const store = createStore();
  assert.equal(store.getState().stirrup_dia, undefined, 'ÉN kilde — feltet er borte');
  store.updateStirrup('S1', { dia: 16 });
  assert.equal(store.getState().stirrup_dia, undefined, 'og det kommer ikke tilbake');
  assert.equal(dcOfL1(store), 61, 'dc = 35 + 16 + 10 — raden alene bestemmer');
});

test('addStirrup: en ny rad med SAMME diameter flytter ikke jernene', () => {
  const store = createStore();
  assert.equal(dcOfL1(store), 57); // 35 + 12 + 10
  const row = store.addStirrup();
  assert.equal(row.dia, 12, 'fabrikkens DEFAULT_STIRRUP_DIA — den bøyla det alt er regnet plass til');
  assert.equal(row.alpha, 90);
  assert.equal(row.id, 'S2', 'S1 er standardbjelkens egen rad');
  assert.equal(dcOfL1(store), 57, 'dc skal stå stille når den groveste bøyla er den samme');
});

test('addStirrup: en GROVERE rad flytter jernene — overdekningen følger den groveste bøyla', () => {
  // Brukerens eksplisitte krav: overdekningen tilpasses den groveste bøyla som
  // berører jernet. Det er også den konservative lesningen med flere rader.
  const store = createStore();
  const row = store.addStirrup({ dia: 16 });
  assert.equal(row.id, 'S2');
  assert.deepEqual(store.getState().shear.stirrups.map((st) => st.dia), [12, 16]);
  assert.equal(dcOfL1(store), 61, 'dc = 35 + 16 + 10 — den STØRSTE av 12 og 16');
});

test('updateStirrup({dia}) flytter dc_auto-lagene — raden er eneste kilde', () => {
  const store = createStore();
  store.updateStirrup('S1', { dia: 10 });
  assert.equal(dcOfL1(store), 55, 'dc = 35 + 10 + 10 — jernene flytter seg med bøyla');
  store.updateStirrup('S1', { dia: 12 });
  assert.equal(dcOfL1(store), 57, 'og tilbake igjen');
});

test('et LÅST lag (dc_auto: false) står stille når bøylediameteren endres', () => {
  const store = createStore();
  store.updateLayer('L1', { dc: 60 }); // brukerens egen verdi låser laget
  store.updateStirrup('S1', { dia: 16 });
  assert.equal(dcOfL1(store), 60, 'en overstyrt dc eies av brukeren, ikke av bøyla');
});

test('removeStirrup: fjernes den SISTE raden, faller dc til cover + Ø/2', () => {
  // Det er den ærlige tilbakemeldingen. Før ble en usynlig diameter stående
  // igjen i geometrifeltet og spiste 12 mm av høyden uten at noen kunne se det.
  const store = createStore();
  assert.equal(dcOfL1(store), 57); // 35 + 12 + 10
  store.removeStirrup('S1');
  const s = store.getState();
  assert.equal(s.shear.stirrups.length, 0);
  assert.equal(s.stirrup_dia, undefined, 'det finnes ikke noe tall å la bli stående');
  assert.equal(dcOfL1(store), 45, 'dc = 35 + 0 + 20/2');
});

test('removeStirrup: med flere rader gjelder den groveste som er IGJEN', () => {
  const store = createStore();
  store.addStirrup({ dia: 16 });
  assert.equal(dcOfL1(store), 61); // 35 + 16 + 10
  store.removeStirrup('S2');
  assert.equal(dcOfL1(store), 57, 'Ø16 er borte, Ø12 gjelder igjen: 35 + 12 + 10');
});

test('bøylerad-id-er teller aldri ned — S2 skal ikke kunne bety to ulike rader i samme økt', () => {
  const store = createStore(); // standardbjelken eier allerede S1
  assert.equal(store.addStirrup().id, 'S2');
  store.removeStirrup('S2');
  assert.equal(store.addStirrup().id, 'S3');
});

test('replaceState: bøyleraden i fila bestemmer dc, og et etterlatt stirrup_dia teller ikke', () => {
  const store = createStore();
  // Håndredigert/eldre fil: Ø10-bøyler, og et geometrifelt som ligger igjen på
  // 8 fra den gang feltet fantes. Feltet er ikke lenger en kilde til noe.
  // Laget mangler `dc`, så `replaceState` må regne det ut — og den REGNER det
  // av raden. Leste den et etterlatt `stirrup_dia: 8`, ville jernet havnet
  // 2 mm feil uten at noe klaget.
  const next = store.replaceState({
    stirrup_dia: 8,
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 10, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc_auto: true }],
  });
  assert.equal(next.layers.find((l) => l.id === 'L1').dc, 55, 'dc = 35 + 10 + 20/2 — raden er fasit');
});

test('replaceState normaliserer bøylerader gjennom createStirrup — en fil uten alpha får α = 90', () => {
  const store = createStore();
  const next = store.replaceState({
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 200, legs: 4, fywk: 500 }] },
  });
  assert.equal(next.shear.stirrups[0].alpha, 90);
  assert.equal(next.shear.stirrups[0].legs, 4, 'radens egne verdier skal overleve normaliseringen');
  assert.equal(next.shear.stirrups[0].spacing, 200);
  assert.equal(next.shear.stirrups[0].dia, 8, 'og diameteren — fabrikken skal ikke overstyre den');
});

test('createStore: bøyleraden i initialtilstanden er eneste kilde til dc', () => {
  const store = createStore({
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 999, dc_auto: true }],
  });
  assert.equal(store.getState().stirrup_dia, undefined, 'geometrifeltet finnes ikke');
  // `createStore` regner ikke om ved oppstart — en lastet fil eier sine tall.
  // Den første endringen som UTLØSER omregning skal lese raden, ikke et felt
  // som er borte: står det 0 der, havner jernet 8 mm feil.
  store.setState({ cover: 35 });
  assert.equal(dcOfL1(store), 53, 'dc = 35 + 8 + 20/2');
});

/* ---------------- endringsrunde 5 §D — «Kjør alle» ---------------- */

test('enforceAnalysis slipper RUN_ALL gjennom — den kjører nettopp de lovlige analysene', () => {
  const store = createStore();
  store.setState({ analysis: RUN_ALL });
  // En aksialkraft stenger `bending`, men ikke «kjør alle»: den hopper bare
  // over den analysen. Uten unntaket ville ethvert tastetrykk i
  // kombinasjonstabellen kastet brukeren tilbake til nm_domain.
  store.updateCombo('C1', { N_Ed: -500 });
  assert.equal(store.getState().analysis, RUN_ALL);
});

test('RUN_ALL overlever replaceState (setInputs og en lastet fil)', () => {
  const store = createStore();
  assert.equal(store.replaceState({ analysis: RUN_ALL }).analysis, RUN_ALL);
});

/**
 * REGRESJON: et lag med `dc_auto: true` men UTEN `dc` hadde ingen plassering.
 * `layerCentroidZ` ga `null`, tegningen forkastet jernet fra bøylesnappingen og
 * plasserte det i `py(z || 0)` — midt i tverrsnittet, uten en eneste advarsel.
 * En lagret fil har alltid `dc`, så dette gjelder `setInputs()` fra et
 * arbeidsflyt-kall. Fella i vakten: `Number(null)` er 0, og 0 er endelig.
 */
test('replaceState: et dc_auto-lag uten dc får plasseringen sin regnet ut', () => {
  const store = createStore();
  const s = store.replaceState({
    sectionType: 'beam',
    geometry: { b: 300, h: 600 },
    cover: 35, cover_side: 35,
    // Bøyla står i RADEN, ikke i geometrien: det er `shear.stirrups` som
    // bærer diameteren `suggestedDc` legger til.
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 4, edge: 'bottom', dc: null, dc_auto: true }],
  });
  // suggestedDc = cover + Ø_bøyle + dia/2 = 35 + 8 + 10
  assert.equal(s.layers[0].dc, 53);
  assert.ok(Number.isFinite(s.layers[0].dc), 'dc skal være et tall, ikke null');
});

test('replaceState: en lagret fil med dc runder tilbake UENDRET', () => {
  const store = createStore();
  const s = store.replaceState({
    sectionType: 'beam',
    geometry: { b: 300, h: 600 },
    cover: 35, cover_side: 35,
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 120, dc_auto: true }],
  });
  assert.equal(s.layers[0].dc, 120, 'utfyllingen skal BARE gjelde lag som mangler dc');
});

/* ============================================================================ *
 * runde 8 §1 — bjelke og plate er TO UAVHENGIGE SNITT
 *
 * Tallene i kommentarene under er MÅLT på koden før denne runden. Hver eneste
 * test her feiler på den gamle `setSectionType`, som konverterte lagene
 * destruktivt og lot geometrien være delt mellom de to typene.
 * ============================================================================ */

/**
 * Alt som beskriver selve snittet og oppgaven — `stash` og `result` holdt utenfor.
 *
 * `stash` MÅ utelates fra sammenligningen, og det er ikke en oppmykning av
 * «bit-identisk»: etter en rundtur HAR stashet endret seg, for det er nå plata
 * du nettopp redigerte som ligger parkert der. Krevde vi stashet uendret, ville
 * vi bedt om at funksjonen ikke virker. `result` er motorens, og gjelder uansett
 * gamle tall.
 */
const sectionOf = ({ result, stash, ...rest }) => rest;

/** Bjelke 300×600 med TO lag (det ene låst) og en bøylerad. */
const beamStore = () => createStore({
  geometry: { b: 300, h: 600 },
  layers: [
    { id: 'L1', mode: 'bars', dia: 20, count: 5, edge: 'bottom', dc: 57, dc_auto: true },
    { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 120, dc_auto: false },
  ],
  shear: {
    strut_angle_deg: 45,
    z_factor: 0.9,
    stirrups: [{ id: 'S1', dia: 12, spacing: 150, legs: 2, fywk: 500, alpha: 90 }],
  },
});

/**
 * DEN ENE TESTEN SOM BEVISER AT STASHET VIRKER.
 *
 * Målt før: bjelke 300×600 → plate → bjelke ga 1000×600 med 3 jern i stedet for
 * 5, og bøylene hadde vært innom plata og forskjøvet dens `dc` med 12 mm.
 */
test('bjelke → plate (endre alt) → bjelke: snittet er BIT-IDENTISK med utgangspunktet', () => {
  const store = beamStore();
  const before = sectionOf(store.getState());

  store.setSectionType('slab');
  // Endre ALT på plata — ingenting av dette har noe med bjelken å gjøre.
  store.patch('geometry', { h: 260 });
  store.setState({ cover: 20 });
  store.updateLayer(store.getState().layers[0].id, { dia: 16, spacing: 125 });
  store.addLayer({ edge: 'top' });
  // Plata får aldri bøyler (steg 1, §A1/A3 i store.js) — kallet er nå en
  // no-op (returnerer `null`) i stedet for å legge på en rad som likevel
  // ikke skulle følge med tilbake til bjelken.
  assert.equal(store.addStirrup(), null);

  store.setSectionType('beam');
  assert.deepEqual(sectionOf(store.getState()), before);
});

test('bredden kommer tilbake — målt før: 300 → plate → bjelke ga 1000', () => {
  const store = createStore({ geometry: { b: 300, h: 600 } });
  store.setSectionType('slab');
  assert.equal(store.getState().geometry.b, 1000, 'plata er alltid 1000 mm');
  store.setSectionType('beam');
  assert.equal(store.getState().geometry.b, 300, 'bjelkens egen bredde, ikke platas');
});

test('høyden lekker ikke — verken fra bjelken til plata eller motsatt', () => {
  const store = createStore({ geometry: { b: 300, h: 600 } });
  store.setSectionType('slab');
  assert.equal(store.getState().geometry.h, 200, 'platas standardhøyde, ikke bjelkens 600');
  store.patch('geometry', { h: 260 });
  store.setSectionType('beam');
  assert.equal(store.getState().geometry.h, 600, 'bjelken beholder sin egen høyde');
  store.patch('geometry', { h: 700 });
  store.setSectionType('slab');
  assert.equal(store.getState().geometry.h, 260, 'plata står der brukeren forlot den');
});

test('plata starter på Ø12 c/c 200 — og bjelkens lag kommer tilbake med count i behold', () => {
  const store = createStore({
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 5, edge: 'bottom', dc: 57, dc_auto: true }],
  });
  store.setSectionType('slab');
  const [slab] = store.getState().layers;
  assert.equal(slab.mode, 'spacing');
  assert.equal(slab.dia, 12);
  assert.equal(slab.spacing, 200);
  assert.ok(!('count' in slab), 'et platelag har ingen count');

  store.setSectionType('beam');
  const [beam] = store.getState().layers;
  // Målt før: 5 jern ble til 3, fordi konverteringen skrev `count: 3` på vei ut.
  assert.equal(beam.count, 5);
  assert.equal(beam.dia, 20);
  assert.ok(!('spacing' in beam), 'et bjelkelag har ingen senteravstand');
});

test('bøylene følger ikke med på plata — platas dc blir ikke 12 mm for stor', () => {
  const store = createStore(); // standardbjelken har allerede S1 (Ø12)
  store.setSectionType('slab');
  const slab = store.getState();
  assert.deepEqual(slab.shear.stirrups, [], 'en plate har ingen bøyler');
  // 35 + 0 + 12/2. Målt før: bøyla fulgte med og ga 53, altså 12 mm for dypt.
  assert.equal(slab.layers[0].dc, 41);

  store.setSectionType('beam');
  const beam = store.getState();
  assert.equal(beam.shear.stirrups.length, 1, 'bjelkens bøylerad står der den ble forlatt');
  assert.equal(beam.layers[0].dc, 57); // 35 + 12 + 20/2
});

test('NØYAKTIG ETT snitt er levende: stashet for den AKTIVE typen er null', () => {
  const store = createStore({ geometry: { b: 300, h: 600 } });
  assert.deepEqual(store.getState().stash, { beam: null, slab: null });

  store.setSectionType('slab');
  let s = store.getState();
  // To kopier av samme snitt ville vært to kilder til samme tall — den
  // feilformen modulen har blitt bitt av i hver eneste runde.
  assert.equal(s.stash.slab, null, 'det aktive snittet bor i toppnivåfeltene');
  assert.equal(s.stash.beam.geometry.b, 300);
  assert.equal(s.stash.beam.geometry.h, 600);

  store.setSectionType('beam');
  s = store.getState();
  assert.equal(s.stash.beam, null);
  assert.equal(s.stash.slab.geometry.h, 200);
});

test('det parkerte snittet deler ikke lag-arrayen med det aktive', () => {
  const store = createStore();
  store.setSectionType('slab');
  const parked = JSON.stringify(store.getState().stash.beam);
  // Begge disse kjører `applyAutoDc` på det AKTIVE snittet. Delte de to
  // arrayen, ville bjelkens jern flyttet seg her — usynlig, helt til brukeren
  // byttet tilbake.
  store.setState({ cover: 60 });
  store.addLayer({ edge: 'top' });
  assert.equal(JSON.stringify(store.getState().stash.beam), parked);
});

test('spacing (k1/k2/d_g) er FELLES — en endring på plata flytter også bjelkens jern', () => {
  // EC2-parameterne beskriver betongen på byggeplassen, ikke snittformen, og
  // skal derfor IKKE stashes. 114 er §2.3 sitt tall for d_g = 32 — samme som
  // testen lenger oppe, bare med turen innom plata i mellom.
  const store = startStore();
  store.setSectionType('slab');
  store.patch('spacing', { d_g: 32 });
  store.setSectionType('beam');
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 57);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 114);
});

test('lag-id-er er unike i HELE økten — et ferskt platelag arver ikke bjelkens L1', () => {
  const store = createStore(); // bjelken har L1
  store.setSectionType('slab');
  assert.equal(store.getState().layers[0].id, 'L2', 'plata får en fersk id, ikke bjelkens');
  assert.equal(store.addLayer({ edge: 'top' }).id, 'L3');
  store.setSectionType('beam');
  // L2 og L3 ligger nå PARKERT. Telte vi bare de aktive lagene, ville neste id
  // blitt L2 — og «L2» ville betydd to ulike lag i samme økt.
  assert.equal(store.addLayer({ edge: 'top' }).id, 'L4');
});

test('setSectionType til samme type er en no-op — snittet stasher ikke seg selv', () => {
  const store = createStore();
  const before = store.getState();
  assert.equal(store.setSectionType('beam'), before);
  assert.deepEqual(store.getState().stash, { beam: null, slab: null });
});

test('INVARIANTENE kjøres etter gjenoppretting — stashet er tilstand, ikke en omgåelse', () => {
  const store = createStore({
    sectionType: 'beam',
    stash: {
      beam: null,
      slab: {
        geometry: { b: 300, h: 220 }, // en bjelkebredde som ligger igjen i et platestash
        layers: [{ id: 'L9', mode: 'spacing', dia: 12, spacing: 200, edge: 'bottom', dc: 41, dc_auto: true }],
        // `alpha` mangler, som i en håndredigert fil.
        shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S9', dia: 10, spacing: 200, legs: 2, fywk: 500 }] },
        cover: 35, cover_side: 35,
      },
    },
  });
  store.setSectionType('slab');
  const s = store.getState();
  assert.equal(s.geometry.b, 1000, 'enforceSlabWidth');
  // STEG 1 (§A1/A2 i store.js): et håndredigert `stash.slab` med en bøylerad
  // er nettopp den fjerde døra planen navngir — `enforceSlabStirrups` kjøres
  // ETTER normaliseringen gjennom `createStirrup` (som satte `alpha: 90` før
  // runden), men tømmer likevel lista, fordi plata aldri skal ha bøyler.
  assert.deepEqual(s.shear.stirrups, [], 'plata får aldri bøyler, heller ikke fra et håndredigert stash');
  assert.equal(s.stirrup_dia, undefined, 'ÉN kilde — geometrifeltet finnes ikke');
  // …og `dc` regnes UTEN bøyle: 35 + 0 + 12/2 = 41. Målt tidligere (før steg 1)
  // som 51 — 10 mm for dypt, fordi S9 da fikk telle med.
  assert.equal(s.layers[0].dc, 41);
  // Og løpenummeret hopper forbi L9, som ligger i det gjenopprettede snittet.
  assert.equal(store.addLayer({ edge: 'top' }).id, 'L10');
});

test('et HALVT stash fylles fra et ferskt snitt — ikke fra typen du forlot', () => {
  // `fromDocument` erstatter `stash` i sin helhet uten å normalisere innmaten,
  // så en håndredigert fil kan ha et platestash med bare geometri. Beholdt vi
  // da bjelkens `bars`-lag, ville «5Ø20» blitt regnet som armering PER METER —
  // A_s feil med en faktor, uten et eneste varsel.
  const store = createStore({
    sectionType: 'beam',
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 5, edge: 'bottom', dc: 57, dc_auto: true }],
    stash: { beam: null, slab: { geometry: { b: 1000, h: 240 } } },
  });
  store.setSectionType('slab');
  const s = store.getState();
  assert.equal(s.geometry.h, 240, 'det fila FAKTISK hadde, brukes');
  assert.equal(s.layers.length, 1);
  assert.equal(s.layers[0].mode, 'spacing', 'et platelag, ikke bjelkens bars-lag');
  assert.equal(s.layers[0].spacing, 200);
  assert.equal(s.cover, 35, 'manglende felt kommer fra standarden');
  assert.deepEqual(s.shear.stirrups, []);
});

test('et stash med TOM lag-liste får ikke et lag dyttet på seg', () => {
  // Null lag er en lovlig tilstand (brukeren kan slette den siste raden), og
  // skiller seg fra «fila sa ingenting om lag». `Array.isArray` og ikke
  // `.length` er hele forskjellen.
  const store = createStore({
    sectionType: 'beam',
    stash: { beam: null, slab: { geometry: { b: 1000, h: 200 }, layers: [] } },
  });
  store.setSectionType('slab');
  assert.deepEqual(store.getState().layers, []);
});

/*
 * ===========================================================================
 * STEG 1 — SKJÆRARMERING UT AV PLATE (V_Rd,c blir værende)
 * ===========================================================================
 * EC2 6.2.3 og 9.2.2 er bjelkeregler, og 9.3.2 tillater ikke skjærarmering i
 * plater tynnere enn 200 mm. V_Rd,c etter 6.2.2 gjelder derimot per meter
 * platebredde, og skal fortsatt regnes — derfor tømmes bare `stirrups`-lista,
 * `section.shear` sendes fortsatt (tom `stirrups`-liste ER V_Rd,c-signalet).
 * Regelen ligger ÉTT sted (`enforceSlabStirrups` i store.js), kalt fra alle
 * fem dørene inn til tilstanden.
 */

test('S1 — createStore med sectionType:slab og en bøylerad ⇒ stirrups tømmes (konstruktørdøra)', () => {
  const s = createStore({
    sectionType: 'slab',
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 12, spacing: 200, legs: 2, fywk: 500, alpha: 90 }] },
  }).getState();
  assert.deepEqual(s.shear.stirrups, [], 'plata får aldri bøyler, heller ikke fra initial-staten');
});

test('S2 — addStirrup() på en plate returnerer null og legger ikke til noe (knapp-døra)', () => {
  const store = createStore();
  store.setSectionType('slab');
  assert.equal(store.addStirrup(), null, 'plata får aldri bøyler — programmatisk kall er en no-op');
  assert.equal(store.getState().shear.stirrups.length, 0);
});

test('S3 — replaceState (setInputs / lastet fil) med plate og bøylerad ⇒ tom liste', () => {
  const store = createStore();
  store.replaceState({
    sectionType: 'slab',
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 12, spacing: 200, legs: 2, fywk: 500, alpha: 90 }] },
  });
  assert.deepEqual(store.getState().shear.stirrups, [], 'setInputs/lastet fil er en av de fem dørene');
});

test('S4 — patch("shear", {stirrups}) på en aktiv plate ⇒ tom liste', () => {
  const store = createStore();
  store.setSectionType('slab');
  store.patch('shear', { stirrups: [{ id: 'S1', dia: 12, spacing: 200, legs: 2, fywk: 500, alpha: 90 }] });
  assert.deepEqual(store.getState().shear.stirrups, [], '`patch` er en lovlig, om uvanlig, vei inn i shear');
});

test('S5 — setState({sectionType:"slab"}) på en bjelke med bøylerad ⇒ tom liste', () => {
  const store = createStore(); // standardbjelken har allerede S1
  assert.equal(store.getState().shear.stirrups.length, 1);
  store.setState({ sectionType: 'slab' });
  assert.deepEqual(store.getState().shear.stirrups, [], '`setState` bærer ikke bjelkens bøylerad over på plata');
});

test('S6 — et HÅNDREDIGERT stash.slab med bøyler ryddes når man bytter TIL den platen', () => {
  const store = createStore({
    sectionType: 'beam',
    stash: {
      slab: {
        geometry: { b: 1000, h: 240 },
        shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S9', dia: 10, spacing: 200, legs: 2, fywk: 500 }] },
      },
    },
  });
  store.setSectionType('slab');
  assert.deepEqual(store.getState().shear.stirrups, [], 'et gjenopprettet stash er tilstand, ikke en omgåelse av regelen');
});

test('S7 — bjelken er URØRT: standardstoren har fortsatt S1, og addStirrup virker på bjelke', () => {
  const store = createStore();
  assert.equal(store.getState().shear.stirrups.length, 1);
  assert.equal(store.getState().shear.stirrups[0].id, 'S1');
  const row = store.addStirrup();
  assert.equal(row.id, 'S2', 'addStirrup virker fortsatt normalt på en bjelke');
  assert.equal(store.getState().shear.stirrups.length, 2);
});

test('S8 — dc følger med: bjelke med Ø12-bøyle → plate ⇒ dc = cover + dia/2 (ingen bøyle å ligge innenfor)', () => {
  const store = createStore(); // standardlag L1 er Ø20 i bunn, standardbøyle S1 er Ø12
  assert.equal(store.getState().layers[0].dc, 57, '35 + 12 + 20/2 — bøyla i raden teller fortsatt på bjelken');
  store.setSectionType('slab');
  const slab = store.getState().layers[0];
  // Denne testen fanger feil rekkefølge mellom tømmingen og `applyAutoDc`:
  // kjøres `applyAutoDc` FØR lista tømmes, blir `dc` stående 12 mm for stor
  // (målt i runde 8: d = 543 der 555 er riktig).
  assert.equal(slab.dc, 41, '35 + 0 + 12/2 — ingen bøyle på plata lenger');
});

test('S9 — payloaden beholder V_Rd,c-veien: section.shear for en plate er et OBJEKT med stirrups:[]', async () => {
  const { buildPayload } = await import('../js/payload.js');
  const store = createStore();
  store.setSectionType('slab');
  const payload = buildPayload(store.getState());
  const shear = payload.section.shear;
  assert.notEqual(shear, null, 'IKKE fraværende — en null her tar bort V_Rd,c helt (engine.py shear_ctx = None)');
  assert.deepEqual(shear.stirrups, [], 'tom liste er signalet motoren bruker for V_Rd,c-veien, ikke et manglende objekt');
});

/*
 * ===========================================================================
 * STEG 2 — R3/R4: `enforceActiveCombo` fra HVER av de syv dørene
 * ===========================================================================
 * `activeCombo` skal peke på FØRSTE uls-rad når den peker på noe annet.
 * ÉNVEIS: finnes ingen uls-rad, står `activeCombo` urørt (R4).
 */

function comboRow(id, type, name) {
  return { id, name: name || id, type, N_Ed: 0, M_Ed: 0, V_Ed: 0 };
}

test('R3a — createStore (konstruktørdøra): activeCombo peker på en ikke-uls-rad ⇒ flyttes til første uls', () => {
  const store = createStore({
    combos: [comboRow('C1', 'characteristic'), comboRow('C2', 'uls')],
    activeCombo: 'C1',
  });
  assert.equal(store.getState().activeCombo, 'C2');
});

test('R3b — setState: håndhevingen kjører her — ett av de to hullene v5 §2.4 navnga', () => {
  const store = createStore();
  store.setState({
    combos: [comboRow('C1', 'uls'), comboRow('C2', 'characteristic')],
    activeCombo: 'C2',
  });
  assert.equal(store.getState().activeCombo, 'C1', 'setState hadde INGEN håndheving før STEG 2');
});

test('R3c — addCombo: en nyopprettet uls-rad kan bli det eneste kandidatet og flytte aktiv', () => {
  const store = createStore({
    combos: [comboRow('C1', 'quasi_permanent')],
    activeCombo: 'C1',
  });
  // Ingen uls-rad ennå: activeCombo skal stå urørt (R4-regelen) helt til én finnes.
  assert.equal(store.getState().activeCombo, 'C1');
  const added = store.addCombo({ type: 'uls' });
  assert.equal(store.getState().activeCombo, added.id, 'nå finnes en uls-rad, og aktiv flyttes til den');
});

test('R3d — updateCombo: redigerer man den AKTIVE raden til characteristic, flyttes aktiv til neste uls', () => {
  const store = createStore({
    combos: [comboRow('C1', 'uls'), comboRow('C2', 'uls')],
    activeCombo: 'C1',
  });
  store.updateCombo('C1', { type: 'characteristic' });
  assert.equal(store.getState().activeCombo, 'C2');
});

test('R3e — removeCombo: fjernes den aktive og den nye aktive (combos[0]) er ikke uls, flyttes den videre', () => {
  const store = createStore({
    combos: [comboRow('C1', 'characteristic'), comboRow('C2', 'uls'), comboRow('C3', 'uls')],
    activeCombo: 'C2',
  });
  store.removeCombo('C2');
  // `removeCombo` sin egen regel setter først activeCombo til combos[0].id ('C1',
  // characteristic) — `enforceActiveCombo` skal så flytte den videre til 'C3'.
  assert.equal(store.getState().activeCombo, 'C3');
});

test('R3f — setActiveCombo: den VIKTIGSTE testen (v5 §2.4) — å KLIKKE en SLS-rad til aktiv bounces umiddelbart', () => {
  const store = createStore({
    combos: [comboRow('C1', 'uls'), comboRow('C2', 'characteristic')],
    activeCombo: 'C1',
  });
  store.setActiveCombo('C2');
  assert.equal(store.getState().activeCombo, 'C1', 'setActiveCombo hadde INGEN håndheving før STEG 2');
});

test('R3g — replaceState (setInputs/lastet fil): activeCombo pekt på en ikke-uls-rad rettes', () => {
  const store = createStore();
  store.replaceState({
    combos: [comboRow('C1', 'characteristic'), comboRow('C2', 'uls')],
    activeCombo: 'C1',
  });
  assert.equal(store.getState().activeCombo, 'C2');
});

test('R4 — ingen uls-rad i det hele tatt ⇒ activeCombo står URØRT (regelen er enveis)', () => {
  const store = createStore();
  store.replaceState({
    combos: [comboRow('C1', 'characteristic'), comboRow('C2', 'quasi_permanent')],
    activeCombo: 'C2',
  });
  assert.equal(store.getState().activeCombo, 'C2', 'ingen uls-kandidat — motorens no_uls_combination gjelder, ikke en stille omplassering');
  // Samme regel gjennom setActiveCombo: å klikke den andre SLS-raden skal heller
  // ikke bounce noe sted, fordi det uansett ikke finnes noe uls-mål å bounce til.
  store.setActiveCombo('C1');
  assert.equal(store.getState().activeCombo, 'C1');
});

/**
 * REGRESJON: en ugyldig `type` slapp gjennom tre av dørene.
 *
 * `createCombo` normaliserte, men `updateCombo`, `setState` og `replaceState`
 * gjorde det ikke. Målt: `updateCombo('C2', {type: 'søppel'})` ga «søppel» både
 * i staten OG i payloaden — og da sa de tre lagene hver sin ting om samme rad:
 * motoren normaliserte til `uls` og satte `checked: true`, `ui.js` leste
 * `type === 'uls'` som false og tonet raden ned med «Not checked», og
 * `<select>`-en viste «ULS» fordi ingen `<option>` matchet.
 */
test('en ugyldig kombinasjonstype faller til uls i ENHVER dør', () => {
  const store = createStore();
  store.addCombo({ name: 'C2' });

  store.updateCombo('C2', { type: 'søppel' });
  assert.equal(store.getState().combos[1].type, 'uls', 'updateCombo');

  store.setState({
    combos: [{ id: 'C1', name: 'x', type: 'tull', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
    activeCombo: 'C1',
  });
  assert.equal(store.getState().combos[0].type, 'uls', 'setState');

  store.replaceState({
    combos: [{ id: 'C1', name: 'y', type: null, N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
    activeCombo: 'C1',
  });
  assert.equal(store.getState().combos[0].type, 'uls', 'replaceState');

  // Og motsatt: en GYLDIG type skal stå. Ellers ville normaliseringen vært en
  // sletting, ikke en vakt.
  store.updateCombo('C1', { type: 'quasi_permanent' });
  assert.equal(store.getState().combos[0].type, 'quasi_permanent');
});

/*
 * ===========================================================================
 * SLS §5 — `enforceSlsParams`, samme mønster som `enforceComboTypes`
 * (§10 A2-oppdraget peker på DENNE tabellen: «hver av dørene»).
 *
 * FØR denne endringen fantes `state.sls` ikke i det hele tatt — `createStore`
 * ga `sls: undefined`, og `store.getState().sls.exposure_class` kastet
 * `TypeError: Cannot read properties of undefined`. Testene under ville
 * derfor feilet på nettopp den linja, ikke bare gitt feil verdi.
 * ===========================================================================
 */

test('SLS-1 — standardtilstanden: ingen klasse, phi_ef 2,0, de tre 7.2-faktorene (§5)', () => {
  const store = createStore();
  const sls = store.getState().sls;
  assert.equal(sls.exposure_class, null, 'vi finner ALDRI på en klasse');
  assert.equal(sls.w_max_override, null);
  assert.equal(sls.phi_ef, 2.0);
  assert.equal(sls.sigma_c_char_factor, 0.6);
  assert.equal(sls.sigma_c_qp_factor, 0.45);
  assert.equal(sls.sigma_s_char_factor, 0.8);
});

test('SLS-2 — createStore (konstruktørdøra): ukjent exposure_class ⇒ null, IKKE en nærmeste-klasse-gjetning', () => {
  const store = createStore({ sls: { exposure_class: 'XQ9' } });
  assert.equal(store.getState().sls.exposure_class, null);
});

test('SLS-3 — createStore: gyldig exposure_class overlever håndhevingen', () => {
  const store = createStore({ sls: { exposure_class: 'XD3' } });
  assert.equal(store.getState().sls.exposure_class, 'XD3');
});

test('SLS-4 — setState: samme håndheving som konstruktørdøra (§5 — «samme steder som enforceComboTypes»)', () => {
  const store = createStore();
  store.setState({ sls: { exposure_class: 'ikke-en-klasse', w_max_override: -1, phi_ef: -5 } });
  const sls = store.getState().sls;
  assert.equal(sls.exposure_class, null);
  assert.equal(sls.w_max_override, null, 'negativ override ⇒ bruk den avledede grensa');
  assert.equal(sls.phi_ef, 2.0, 'negativ phi_ef er ikke et lovlig kryptall');
});

test('SLS-5 — patch("sls", …): w_max_override som en STRENG (ikke et tall > 0) ⇒ null', () => {
  const store = createStore();
  store.patch('sls', { w_max_override: 'seksti' });
  assert.equal(store.getState().sls.w_max_override, null);
});

test('SLS-6 — patch("sls", …): en GYLDIG override på 0,20 mm overlever', () => {
  const store = createStore();
  store.patch('sls', { w_max_override: 0.2 });
  assert.equal(store.getState().sls.w_max_override, 0.2);
});

test('SLS-7 — de tre 7.2-faktorene: ikke et endelig tall > 0 ⇒ standardverdien, ÉN dør av gangen', () => {
  const store = createStore();
  store.patch('sls', { sigma_c_char_factor: 0, sigma_c_qp_factor: NaN, sigma_s_char_factor: -0.8 });
  const sls = store.getState().sls;
  assert.equal(sls.sigma_c_char_factor, 0.6);
  assert.equal(sls.sigma_c_qp_factor, 0.45);
  assert.equal(sls.sigma_s_char_factor, 0.8);
});

test('SLS-8 — replaceState (setInputs()): en lagret fil med en ugyldig klasse runder tilbake til null, ikke til feilen', () => {
  const store = createStore();
  store.replaceState({ ...store.getState(), sls: { ...store.getState().sls, exposure_class: 'X99' } });
  assert.equal(store.getState().sls.exposure_class, null);
});

test('SLS-9 — cloneState: en dupliserende operasjon deler IKKE sls-objektet ved referanse', () => {
  const store = createStore();
  const before = store.getState().sls;
  store.patch('sls', { phi_ef: 1.5 });
  assert.equal(before.phi_ef, 2.0, 'det GAMLE objektet skal stå urørt — cloneState kopierte, mutasjonen skrev ikke gjennom');
  assert.equal(store.getState().sls.phi_ef, 1.5);
});
