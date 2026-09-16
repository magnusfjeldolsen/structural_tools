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

import { createStore } from '../js/store.js';

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
