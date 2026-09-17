/**
 * bottom-bar.test.mjs — inspeksjonsstripa i bunnlinja (runde 6 §2.4).
 *
 * HVORFOR DENNE FILA FINNES
 * Stripa er det eneste stedet tallene står mens man fyller ut skjemaet, og den
 * kunne fram til nå bare ses i nettleseren. Målt ved 1440 px var cellene 22–58
 * px brede og 26–53 px HØYE, og `top` varierte fra 842 til 855 — 13 px
 * vertikal spretting mellom to opptegninger av samme linje.
 *
 * Tre uavhengige årsaker, og bare den ene av dem er CSS:
 *   1. ingen `white-space: nowrap`      → index.html
 *   2. cellehøyden bestemt av innholdet → index.html
 *   3. ingen `flex-shrink: 0`           → index.html
 * Den fjerde, som CSS ikke kan nå: ANTALLET celler endret seg. Tom-tilstanden
 * tegnet ÉN celle, et resultat med skjær tegnet SJU. Første beregning flyttet
 * derfor hele linja, nøyaktig i det øyeblikket det irriterer mest.
 *
 * Testene her holder fast det CSS-en ikke kan holde: at det ALLTID er de samme
 * fem cellene i samme rekkefølge, at de bærer høydeklassene i stedet for egne
 * høyder, og at bruddtilstanden leses gjennom `failureState` — den ene kilden
 * rapporten også bruker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bottomBarCells, bottomBarStripHtml } from '../js/ui.js';
import { DASH } from '../js/results.js';

const KEYS = ['eta', 'eta_V', 'M_Rd', 'x_over_d', 'failure_mode'];
const LABELS = ['η', 'η_V', 'M_Rd', 'x/d', 'Mode'];

/** Én skjærblokk slik motoren gir den (§4.2). */
const shear = () => ({
  evaluated: true, V_Ed: 180000, V_Rd: 210000, V_Rd_c: 95000,
  governing_mode: 'stirrups', utilisation: 0.857,
});

/** Et bøyeresultat med skjær — det vanlige tilfellet. */
const full = () => ({
  ok: true,
  analysis: 'bending',
  bending: {
    M_Rd: -2.156e8,
    utilisation: 0.81,
    x_over_d: 0.452,
    failure_mode: 'concrete_crushing',
    combinations: [{ id: 'C1', name: 'ULS 1', within_limits: true, shear: shear() }],
    governing: 'C1',
    shear_governing: 'C1',
  },
});

const keysOf = (r, o) => bottomBarCells(r, o).map((c) => c.key);

/* ---------------- antallet, som er den fjerde årsaken ---------------- */

test('ALLTID de samme fem cellene, i samme rekkefølge — med og uten resultat', () => {
  // Dette er påstanden den gamle koden brøt: `null` ga ÉN celle, `full()` ga
  // SJU, og et resultat uten skjær ga SEKS. Linja kunne altså ikke være rolig
  // uansett hvor mange høyder CSS-en låste.
  for (const r of [null, undefined, { ok: false }, { ok: true, analysis: 'bending' }, full()]) {
    assert.deepEqual(keysOf(r), KEYS);
    assert.deepEqual(bottomBarCells(r).map((c) => c.label), LABELS);
  }
});

test('tom-tilstanden tegner de fem med tankestrek, ikke med gamle tall', () => {
  const cells = bottomBarCells(null);
  assert.equal(cells[0].value, DASH, 'η');
  assert.equal(cells[1].value, DASH, 'η_V');
  assert.equal(cells[2].value, `${DASH} kNm`, 'M_Rd bærer enheten også når tallet mangler');
  assert.equal(cells[3].value, DASH, 'x/d');
  assert.equal(cells[4].value, DASH, 'bruddform');
  // Et ubesvart spørsmål er ikke et bestått spørsmål: merket skal være grått,
  // ikke grønt. `utilisationStatus(null)` er den ene kilden til den regelen.
  assert.equal(cells[0].status.level, 'unknown');
  assert.equal(cells[1].status.level, 'unknown');
});

test('η_V-cella står også når INGEN kombinasjon fikk skjær evaluert', () => {
  // Før sto merket bare når `shearGoverningCombo` fant en rad. En celle som
  // kommer og går er den samme hoppingen som tom-tilstanden, bare sjeldnere
  // og derfor vanskeligere å få øye på.
  const r = full();
  r.bending.shear_governing = null;
  const cells = bottomBarCells(r);
  assert.deepEqual(cells.map((c) => c.key), KEYS);
  assert.equal(cells[1].value, DASH);
  assert.equal(cells[1].status.level, 'unknown');
});

/* ---------------- de to cellene som skulle bort ---------------- */

test('x i mm og V_Rd finnes ikke lenger i stripa', () => {
  // `x/d` bærer samme informasjon i den formen en ingeniør vurderer den
  // (0,45 / 0,35); `x` alene er et mellomregningstall som hører hjemme i
  // resultatseksjonen. `V_Rd` er implisert av η_V og står i skjærpanelet.
  const cells = bottomBarCells(full());
  assert.deepEqual(cells.map((c) => c.key), KEYS);
  assert.ok(!cells.some((c) => c.label === 'x'), 'ingen celle med etiketten «x»');
  assert.ok(!cells.some((c) => c.label === 'V_Rd'), 'ingen V_Rd-celle');
  // `V_Rd` står fortsatt i η_V-cellas `title` — det er formelen bak tallet,
  // ikke en celle. Enheten er derimot avslørende: kN uten m fantes bare i
  // V_Rd-cella, og mm bare i x-cella.
  const values = cells.map((c) => c.value).join(' ');
  assert.ok(!/\bkN\b/.test(values), 'kN hørte til V_Rd, som er borte');
  assert.ok(!/\bmm\b/.test(values), 'mm hørte til x, som er borte');
});

/* ---------------- én kilde til bruddtilstanden ---------------- */

test('bruddtilstanden leses gjennom failureState, ikke gjennom result.bending', () => {
  // «Kjør alle» har BEGGE blokkene. `analysisBlock` peker på `primary`, og
  // `failureState` arver det — rapporten og resultatseksjonen viser derfor
  // nm_domain-tilstanden. Stripa slo opp `result.bending || analysisBlock(...)`
  // med motsatt prioritet og viste bøyeblokkas tilstand for samme kjøring:
  // to kilder til samme tall, og bare den ene sto på papiret.
  const r = {
    ok: true,
    analysis: 'all',
    primary: 'nm_domain',
    bending: { M_Rd: -6.4e6, utilisation: 0.2, x_over_d: 0.11, failure_mode: 'steel_rupture' },
    nm_domain: {
      M_Rd_at_N: -2.156e8, utilisation: 0.81, x_over_d: 0.452,
      failure_mode: 'concrete_crushing',
    },
  };
  const cells = bottomBarCells(r);
  assert.equal(cells[3].value, '0.452', 'x/d skal komme fra nm_domain-blokka');
  assert.equal(cells[4].value, 'Concrete crushing');
  assert.equal(cells[0].value, '0.81', 'η kommer fra samme blokk');
  assert.equal(cells[2].value, '-215.6 kNm', 'og M_Rd_at_N, ikke bøyeblokkas M_Rd');
});

/* ---------------- høydene ligger i CSS, ikke i malstrengen ---------------- */

test('hver celle bærer høydeklassene, og ingen celle setter sin egen høyde', () => {
  const html = bottomBarStripHtml(full());
  assert.equal((html.match(/class="bar-cell /g) || []).length, 5);
  assert.equal((html.match(/"bar-cell-l"/g) || []).length, 5, 'etikettrad: 12 px');
  assert.equal((html.match(/"bar-cell-v num"/g) || []).length, 5, 'verdirad: 18 px');
  // Høyden hører hjemme i style-blokka i index.html. En `style=`-høyde eller en
  // `text-xl` her ville vært den andre kilden, og den som ikke blir funnet
  // igjen neste gang linja hopper.
  assert.ok(!html.includes('style='), 'ingen innebygde stiler');
  assert.ok(!html.includes('text-xl'), 'ingen skriftstørrelse i malstrengen');
  assert.ok(!html.includes('leading-tight'), 'linjehøyden bestemmes ikke her');
});

test('x/d ryker under 1024 px og bruddformen under 1280 px — η aldri', () => {
  const cells = bottomBarCells(full());
  assert.equal(cells[0].hide, '', 'η står i alle bredder');
  assert.equal(cells[1].hide, '', 'η_V står i alle bredder');
  assert.equal(cells[2].hide, '', 'M_Rd står i alle bredder');
  assert.equal(cells[3].hide, 'lg');
  assert.equal(cells[4].hide, 'xl');
  const html = bottomBarStripHtml(full());
  assert.match(html, /bar-cell-lg/);
  assert.match(html, /bar-cell-xl/);
});

/* ---------------- plate ---------------- */

test('M_Rd får «/m» for plate, og bare M_Rd', () => {
  const cells = bottomBarCells(full(), { perMeter: '/m' });
  assert.equal(cells[2].value, '-215.6 kNm/m');
  // η er dimensjonsløs, og x/d likeså — «/m» på dem ville vært tøv.
  assert.ok(!cells[0].value.includes('/m'));
  assert.ok(!cells[3].value.includes('/m'));
});

/* ---------------- statusfargen har én kilde ---------------- */

test('fargen på η og η_V kommer fra utilisationStatus, ikke fra stripa', () => {
  const r = full();
  r.bending.utilisation = 1.4;
  const cells = bottomBarCells(r);
  assert.equal(cells[0].status.level, 'over');
  assert.equal(cells[1].status.level, 'ok', 'η_V = 0,857 er sin egen historie');
  const html = bottomBarStripHtml(r);
  assert.ok(html.includes(cells[0].status.classes), 'klassene skrives rått fra results.js');
  // Ingen hardkodet farge i malstrengen: ville rød pille og grønn rapportrad
  // for samme η vært mulig, er det nettopp den selvmotsigelsen `results.js`
  // finnes for å hindre.
  assert.ok(!/(rose|emerald|amber|red)-\d{3}/.test(html.replace(/class="bar-cell [^"]*"/g, '')),
    'fargenavn skal bare komme inn via status.classes');
});
