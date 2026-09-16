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
 * med standard `cover`/`stirrup_dia`/`spacing` (`createStore()` sine
 * standardverdier er nøyaktig STD fra §2.3/§3.3).
 */
const START_LAYERS = () => [
  { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true },
  { id: 'L2', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 94, dc_auto: true },
];

const startStore = () => createStore({ layers: START_LAYERS() });

test('addLayer stables nytt lag etter EC2 8.2 — andre Ø20-laget i bunn blir dc = 94 (§2.3)', () => {
  const store = createStore(); // standard: ett lag, L1 Ø20 bunn, dc = 53
  const layer = store.addLayer({ dia: 20, edge: 'bottom' });
  assert.equal(layer.dc, 94);
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
  assert.equal(layers.find((l) => l.id === 'L1').dc, 59);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 117);
});

test('updateLayer({dia}) lar et LÅST lag stå — §3.3: L2 låst dc:120, L1 → Ø20', () => {
  const store = startStore();
  store.updateLayer('L2', { dc: 120 }); // låser L2
  store.updateLayer('L1', { dia: 20 }); // samme verdi, men en endring i patchen skal likevel trigge recompute
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53);
  const l2 = layers.find((l) => l.id === 'L2');
  assert.equal(l2.dc_auto, false);
  assert.equal(l2.dc, 120);
});

test('setState({cover}) flytter alle dc_auto-lag — §3.3: cover 35 → 45', () => {
  const store = startStore();
  store.setState({ cover: 45 });
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 63);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 104);
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
  // Tilbake til stablet posisjon bak L1 (53) — ikke stående på 999. Dette er
  // §3.1 sin «begge veier skal virke», med `dc_auto` som eneste input.
  assert.equal(l2.dc, 94);
});

test('setSectionType fram og tilbake bevarer dc_auto, både låst og ulåst lag', () => {
  const store = createStore({
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 53, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 120, dc_auto: false },
    ],
  });
  store.setSectionType('slab');
  store.setSectionType('beam');
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc_auto, true);
  assert.equal(layers.find((l) => l.id === 'L2').dc_auto, false);
});

test("patch('spacing', {d_g:32}) flytter lagene — §2.3: L2 blir 110, L1 uendret", () => {
  const store = startStore();
  store.patch('spacing', { d_g: 32 });
  const layers = store.getState().layers;
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53); // suggestedDc uendret av d_g
  assert.equal(layers.find((l) => l.id === 'L2').dc, 110);
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

/* ---------------- endringsrunde 5 §B — ÉN fysisk bøyle, ETT tall ---------------- */
// `state.stirrup_dia` (feltet «Stirrup Ø») og `shear.stirrups[0].dia` var TO
// uavhengige tall: det første styrte jernenes plassering og `dc`
// (`rebar.js:suggestedDc`), det andre skjærkapasiteten og bøyletegningen.
// Ingen validering bandt dem, så Ø10 i skjærraden ga jern som fortsatt ble
// regnet med Ø8. Testene under er skrevet mot bindingen, ikke mot koden:
// hver av dem feiler på den gamle `store.js`.

/** dc for standardlaget (Ø20 i bunn) = cover + bøyle + Ø/2. */
const dcOfL1 = (store) => store.getState().layers.find((l) => l.id === 'L1').dc;

test('addStirrup arver dia fra stirrup_dia — å legge inn bøyler flytter ALDRI jernene av seg selv', () => {
  const store = createStore();
  assert.equal(dcOfL1(store), 53); // 35 + 8 + 10
  const row = store.addStirrup();
  assert.equal(row.dia, 8, 'den nye raden skal være den bøyla det alt er regnet plass til');
  assert.equal(row.alpha, 90, 'section.js avviser alt annet enn α = 90° i v1');
  assert.equal(row.id, 'S1');
  assert.equal(dcOfL1(store), 53, 'dc skal stå stille når diameteren er den samme');
});

test('updateStirrup({dia}) flytter dc_auto-lagene — bøylediameteren er ETT tall (§B)', () => {
  const store = createStore();
  store.addStirrup();
  store.updateStirrup('S1', { dia: 12 });
  assert.equal(store.getState().stirrup_dia, 12, 'geometrifeltet skal følge bøyleraden');
  assert.equal(dcOfL1(store), 57, 'dc = 35 + 12 + 10 — jernene flytter seg med bøyla');
});

test('setState({stirrup_dia}) skriver GJENNOM til bøyleraden — ikke to tall som spriker', () => {
  const store = createStore();
  store.addStirrup();
  store.setState({ stirrup_dia: 10 });
  const s = store.getState();
  assert.equal(s.shear.stirrups[0].dia, 10);
  assert.equal(s.stirrup_dia, 10);
  assert.equal(dcOfL1(store), 55, 'dc = 35 + 10 + 10');
});

test('et LÅST lag (dc_auto: false) står stille når bøylediameteren endres', () => {
  const store = createStore();
  store.addStirrup();
  store.updateLayer('L1', { dc: 60 }); // brukerens egen verdi låser laget
  store.updateStirrup('S1', { dia: 16 });
  assert.equal(store.getState().stirrup_dia, 16);
  assert.equal(dcOfL1(store), 60, 'en overstyrt dc eies av brukeren, ikke av bøyla');
});

test('removeStirrup: uten bøyler oppfører stirrup_dia seg som før — verdien blir stående', () => {
  const store = createStore();
  store.addStirrup();
  store.updateStirrup('S1', { dia: 12 });
  store.removeStirrup('S1');
  const s = store.getState();
  assert.equal(s.shear.stirrups.length, 0);
  assert.equal(s.stirrup_dia, 12, 'bøyla er borte, men overdekningen jernene ligger etter er ikke det');
  assert.equal(dcOfL1(store), 57);
});

test('bøylerad-id-er teller aldri ned — S1 skal ikke kunne bety to ulike rader i samme økt', () => {
  const store = createStore();
  store.addStirrup();
  store.removeStirrup('S1');
  assert.equal(store.addStirrup().id, 'S2');
});

test('replaceState: en fil der de to tallene spriker løses i BØYLERADENS favør, og lagene flytter seg', () => {
  const store = createStore();
  // Håndredigert/eldre fil: Ø10-bøyler, men geometrifeltet ligger igjen på 8.
  const next = store.replaceState({
    stirrup_dia: 8,
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 10, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
  });
  assert.equal(next.stirrup_dia, 10, 'bøyla brukeren faktisk har lagt inn er fasit');
  assert.equal(next.layers.find((l) => l.id === 'L1').dc, 55, 'dc = 35 + 10 + 10');
});

test('replaceState normaliserer bøylerader gjennom createStirrup — en fil uten alpha får α = 90', () => {
  const store = createStore();
  const next = store.replaceState({
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 8, spacing: 200, legs: 4, fywk: 500 }] },
  });
  assert.equal(next.shear.stirrups[0].alpha, 90);
  assert.equal(next.shear.stirrups[0].legs, 4, 'radens egne verdier skal overleve normaliseringen');
  assert.equal(next.shear.stirrups[0].spacing, 200);
});

test('createStore: initialtilstand med en bøylerad binder stirrup_dia med det samme', () => {
  const store = createStore({
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ id: 'S1', dia: 12, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
  });
  assert.equal(store.getState().stirrup_dia, 12);
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
    cover: 35, cover_side: 35, stirrup_dia: 8,
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 4, edge: 'bottom', dc: null, dc_auto: true }],
  });
  // suggestedDc = cover + stirrup_dia + dia/2 = 35 + 8 + 10
  assert.equal(s.layers[0].dc, 53);
  assert.ok(Number.isFinite(s.layers[0].dc), 'dc skal være et tall, ikke null');
});

test('replaceState: en lagret fil med dc runder tilbake UENDRET', () => {
  const store = createStore();
  const s = store.replaceState({
    sectionType: 'beam',
    geometry: { b: 300, h: 600 },
    cover: 35, cover_side: 35, stirrup_dia: 8,
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 120, dc_auto: true }],
  });
  assert.equal(s.layers[0].dc, 120, 'utfyllingen skal BARE gjelde lag som mangler dc');
});
