/**
 * share-link.test.mjs — den delbare lenka (oppgave C).
 *
 * TESTES UTEN DOM: `share-link.js` er DOM-fri med vilje, og Node 18+ har både
 * `CompressionStream` og `DecompressionStream` globalt. Det er ingen jsdom her,
 * og det er poenget — trenger denne fila en DOM for å testes, har den fått
 * ansvar som hører hjemme i `ui.js`.
 *
 * TO TING PRØVES:
 *   1. RUNDTUREN. `fromLink(await toLink(s))` skal gi NØYAKTIG `s` tilbake, med
 *      `result: null`. Ikke «nesten» — en lenke som mister ett felt er verre
 *      enn en som ikke virker, fordi den ser ut som den virket.
 *   2. STØRRELSESBUDSJETTET. Tallene under er en VAKTPOST, ikke dokumentasjon:
 *      legger noen et felt i `defaultState()` som sprenger budsjettet, blir
 *      dette rødt med én gang — i stedet for at noen oppdager det den dagen en
 *      e-postklient brekker lenka i to.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LINK_PREFIX, fromLink, toLink } from '../js/share-link.js';
import { DOCUMENT_FORMAT, DOCUMENT_SCHEMA, toDocument } from '../js/serialize.js';
import { defaultState } from '../js/store.js';
import { createLayer } from '../js/rebar.js';

/* ================================================================== *
 * Tilstandene som måles
 * ================================================================== */

/** `defaultState()` slik en rundtur skal gi den tilbake. */
function baseState() {
  return { ...defaultState(), result: null };
}

/**
 * TUNGT SNITT: 6 lag, 8 kombinasjoner (ULS og begge SLS-typene), 3 bøylerader,
 * valgt eksponeringsklasse og FULL dokumenttekst med prosjekt, tittel, forfatter
 * og et notat på fire linjer. Dette er den STØRSTE tilstanden en prosjekterende
 * realistisk deler — ikke et konstruert verstetilfelle, og ikke standarden med
 * ett felt endret.
 */
function heavyState() {
  const base = defaultState();
  const shell = { ...base, geometry: { b: 450, h: 900 }, cover: 35, cover_side: 35 };
  return {
    ...shell,
    concrete: { fck: 45, gamma_c: 1.45, alpha_cc: 1.0, law: 'bilinearcompression' },
    analysis: 'nm_domain',
    // GJENNOM `createLayer`, ikke skrevet for hånd. Et `mode: 'spacing'`-lag
    // får et AVLEDET `count` av fabrikken, og et håndskrevet fikstur uten det
    // ville gjort rundturstesten rød på en forskjell lenka ikke har skyld i —
    // `fromDocument` normaliserer hvert lag gjennom nøyaktig denne fabrikken.
    layers: [
      { id: 'L1', mode: 'bars', dia: 25, count: 5, edge: 'bottom', dc: 62, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 25, count: 4, edge: 'bottom', dc: 112, dc_auto: false },
      { id: 'L3', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 160, dc_auto: false },
      { id: 'L4', mode: 'bars', dia: 16, count: 4, edge: 'top', dc: 55, dc_auto: false },
      { id: 'L5', mode: 'spacing', dia: 12, spacing: 150, edge: 'top', dc: 95, dc_auto: false },
      { id: 'L6', mode: 'spacing', dia: 12, spacing: 200, edge: 'top', dc: 140, dc_auto: false },
    ].map((layer) => createLayer(shell, layer)),
    combos: [
      { id: 'C1', name: 'ULS 1 — 1.35G + 1.5Q', type: 'uls', N_Ed: -250, M_Ed: -820, V_Ed: 410 },
      { id: 'C2', name: 'ULS 2 — 1.2G + 1.5Q + W', type: 'uls', N_Ed: -1250, M_Ed: -640, V_Ed: 355 },
      { id: 'C3', name: 'ULS 3 — uplift', type: 'uls', N_Ed: 180, M_Ed: 410, V_Ed: 220 },
      { id: 'C4', name: 'ULS 4 — accidental', type: 'uls', N_Ed: -900, M_Ed: -300, V_Ed: 150 },
      { id: 'C5', name: 'SLS characteristic', type: 'characteristic', N_Ed: -180, M_Ed: -560, V_Ed: 0 },
      { id: 'C6', name: 'SLS characteristic — wind', type: 'characteristic', N_Ed: -1100, M_Ed: -520, V_Ed: 0 },
      { id: 'C7', name: 'SLS quasi-permanent', type: 'quasi_permanent', N_Ed: -180, M_Ed: -390, V_Ed: 0 },
      { id: 'C8', name: 'SLS quasi-permanent — wind', type: 'quasi_permanent', N_Ed: -1100, M_Ed: -300, V_Ed: 0 },
    ],
    activeCombo: 'C2',
    shear: {
      strut_angle_deg: 35,
      z_factor: 0.9,
      stirrups: [
        { id: 'S1', dia: 12, spacing: 100, legs: 4, fywk: 500, alpha: 90 },
        { id: 'S2', dia: 12, spacing: 150, legs: 2, fywk: 500, alpha: 90 },
        { id: 'S3', dia: 10, spacing: 200, legs: 2, fywk: 500, alpha: 90 },
      ],
    },
    sls: { ...base.sls, exposure_class: 'XD3', w_max_override: 0.2, phi_ef: 2.4, h0_override: 260 },
    doc: {
      project: 'Kvartal 7 — parkeringskjeller, akse D/12',
      title: 'Bjelke B-204, felt og opplegg',
      author: 'Magnus Fjeld Olsen, Tommerdal Radgivende Ingeniorer',
      date: '2026-09-21',
      note: 'Kontroll av bjelke B-204 for ULS boyning, skjaer og SLS rissvidde. '
        + 'Eksponeringsklasse XD3 med skjerpet rissviddekrav 0,2 mm etter byggherrens '
        + 'kravspesifikasjon kapittel 5.3. Bjelken er kontinuerlig over tre felt; '
        + 'opplagsmomentet er dimensjonerende. Se statisk beregning kap. 4 for lastnedforing.',
    },
    result: null,
  };
}

/** Bjelken parkert i `stash` mens plata er aktiv — hele snittbytte-tilstanden. */
function stashedState() {
  const base = defaultState();
  return {
    ...base,
    sectionType: 'slab',
    geometry: { b: 1000, h: 250 },
    layers: [
      { id: 'L7', mode: 'spacing', dia: 16, spacing: 150, edge: 'bottom', dc: 43, dc_auto: true },
    ],
    shear: { ...base.shear, stirrups: [] },
    stash: {
      beam: {
        geometry: { b: 350, h: 700 },
        cover: 30,
        cover_side: 30,
        layers: [
          { id: 'L1', mode: 'bars', dia: 25, count: 4, edge: 'bottom', dc: 54, dc_auto: true },
          { id: 'L2', mode: 'bars', dia: 16, count: 2, edge: 'top', dc: 50, dc_auto: false },
        ],
        shear: {
          strut_angle_deg: 40,
          z_factor: 0.9,
          stirrups: [{ id: 'S1', dia: 10, spacing: 150, legs: 2, fywk: 500, alpha: 90 }],
        },
      },
      slab: null,
    },
    result: null,
  };
}

/* ================================================================== *
 * Rundturen
 * ================================================================== */

test('rundtur: fromLink(toLink(standardtilstanden)) er dypt lik tilstanden, uten noter', async () => {
  const s = baseState();
  const { state, notes } = await fromLink(await toLink(s));
  assert.deepEqual(state, s);
  assert.deepEqual(notes, []);
});

test('rundtur: et TUNGT snitt — 6 lag, 8 kombinasjoner, 3 bøylerader, full dokumenttekst', async () => {
  const s = heavyState();
  const { state, notes } = await fromLink(await toLink(s));
  assert.deepEqual(state, s);
  assert.deepEqual(notes, []);
});

test('rundtur: et PARKERT snitt i `stash` overlever lenka — begge snittene, ikke bare det aktive', async () => {
  const s = stashedState();
  const { state, notes } = await fromLink(await toLink(s));
  assert.deepEqual(state, s);
  assert.deepEqual(notes, []);
  // Eksplisitt, fordi dette er feilen som ville vært stille: en lenke som bare
  // bar det AKTIVE snittet ville sett helt riktig ut hos mottakeren — helt til
  // han byttet til bjelken og fant standardbjelken i stedet for sin egen.
  assert.equal(state.stash.beam.geometry.b, 350);
  assert.equal(state.stash.beam.layers.length, 2);
});

test('rundtur: `#` foran fragmentet tolereres — `location.hash` kan sendes rått inn', async () => {
  const s = baseState();
  const { state } = await fromLink(`#${await toLink(s)}`);
  assert.deepEqual(state, s);
});

/* ================================================================== *
 * `result` er ALDRI med
 * ================================================================== */

test('`result` er ALDRI med i lenka — verken i bytene eller i tilstanden som kommer ut', async () => {
  const s = { ...heavyState(), result: { ok: true, M_Rd: 1234.5, analysis: 'bending' } };
  const link = await toLink(s);

  // 1. Tilstanden som kommer ut har `result: null`, uansett hva som gikk inn.
  const { state } = await fromLink(link);
  assert.equal(state.result, null);

  // 2. Tallet finnes ikke i bytene i det hele tatt. `M_Rd` er motorens svar på
  //    tall som gjaldt DA lenka ble laget; å bære det med ville betydd at en
  //    mottaker kunne lese en kapasitet uten at noe var regnet i hans nettleser.
  const json = JSON.stringify(toDocument(s));
  assert.ok(!json.includes('1234.5'));
  assert.ok(!('result' in JSON.parse(json).state));
});

/* ================================================================== *
 * Konvolutten — det som ikke lar seg lese
 * ================================================================== */

test('konvolutten er `d1.` + base64url: ingen `+`, `/` eller `=` som må prosentkodes', async () => {
  const link = await toLink(heavyState());
  assert.ok(link.startsWith(LINK_PREFIX));
  assert.match(link.slice(LINK_PREFIX.length), /^[A-Za-z0-9_-]+$/);
});

test('ØDELAGT base64 gir `link_format_unsupported` uten å kaste, og laster ingen tilstand', async () => {
  const good = await toLink(baseState());
  const broken = [
    // Kappet på midten — nøyaktig det en e-postklient gjør ved linjebrekk.
    good.slice(0, Math.floor(good.length / 2)),
    // Ett tegn byttet ut: base64 går gjennom, men deflate-strømmen gjør det ikke.
    `${LINK_PREFIX}${'A'.repeat(40)}`,
    // Tegn som ikke finnes i base64url i det hele tatt.
    `${LINK_PREFIX}ikke base64 ***`,
    `${LINK_PREFIX}`,
  ];
  for (const fragment of broken) {
    await assert.doesNotReject(() => fromLink(fragment));
    const { state, notes } = await fromLink(fragment);
    assert.equal(state, null, `skulle ikke lastet noe fra «${fragment.slice(0, 20)}…»`);
    assert.deepEqual(notes, [{ code: 'link_format_unsupported', severity: 'error' }]);
  }
});

test('UKJENT PREFIKS gir samme note — også for tomt, `undefined` og et seksjonsanker', async () => {
  // `#s-geo` er ikke en teoretisk mulighet: navigasjonen i `index.html` skriver
  // nøyaktig den hashen, og en oppstart må kunne se forskjell.
  for (const fragment of ['', undefined, null, 42, 's-geo', '#s-geo', 'd2.AAAA', 'd1', 'D1.AAAA']) {
    await assert.doesNotReject(() => fromLink(fragment));
    const { state, notes } = await fromLink(fragment);
    assert.equal(state, null);
    assert.deepEqual(notes, [{ code: 'link_format_unsupported', severity: 'error' }]);
  }
});

/* ================================================================== *
 * `doc_schema` — hullet som traff både fil og lenke
 * ================================================================== */

test('`doc_schema: 2` gir `document_schema_newer` (warning) og LASTER tilstanden likevel', async () => {
  const s = heavyState();
  // Bygg konvolutten for hånd, med et dokument fra en tenkt nyere versjon.
  const doc = { ...toDocument(s), doc_schema: DOCUMENT_SCHEMA + 1 };
  const json = JSON.stringify(doc);
  const packed = await new Response(
    new Blob([new TextEncoder().encode(json)]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer();
  const b64 = Buffer.from(packed).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const { state, notes } = await fromLink(LINK_PREFIX + b64);
  assert.ok(notes.some((n) => n.code === 'document_schema_newer' && n.severity === 'warning'));
  // Og tilstanden er LASTET, ikke forkastet — det er hele forskjellen på
  // `warning` og `error` her.
  assert.ok(state);
  assert.equal(state.geometry.b, 450);
  assert.equal(state.combos.length, 8);
  assert.equal(doc.format, DOCUMENT_FORMAT);
});

/* ================================================================== *
 * STØRRELSESBUDSJETTET — en vaktpost, ikke dokumentasjon
 * ================================================================== */

test('STØRRELSESBUDSJETT: standardtilstanden er under 1 000 tegn (målt ~853, 2026-09-21)', async () => {
  const link = await toLink(baseState());
  assert.ok(
    link.length < 1000,
    `standardtilstanden ble ${link.length} tegn. Budsjettet er 1 000. Et nytt felt i `
    + 'defaultState() har sprengt det — enten må feltet vekk, eller så må budsjettet '
    + 'heves BEVISST, med en ny måling i hodet på share-link.js.'
  );
});

test('STØRRELSESBUDSJETT: et tungt snitt er under 2 000 tegn (målt ~1 610, 2026-09-21)', async () => {
  const link = await toLink(heavyState());
  assert.ok(
    link.length < 2000,
    `det tunge snittet ble ${link.length} tegn. Budsjettet er 2 000 — grensa der en `
    + 'lenke fortsatt overlever et e-postfelt.'
  );
});

test('komprimeringen tjener til livets opphold: lenka er under to tredeler av rå base64', async () => {
  // Uten komprimering ble det tunge snittet MÅLT til 3 840 tegn. Testen sier
  // ikke «omtrent så mye mindre», den sier at gevinsten fortsatt er så stor at
  // konvoluttformen er verdt kravet om `CompressionStream`.
  const s = heavyState();
  const raw = Buffer.from(JSON.stringify(toDocument(s)), 'utf8').toString('base64url');
  const link = await toLink(s);
  assert.ok(link.length < raw.length * (2 / 3), `${link.length} mot ${raw.length} rå`);
});
