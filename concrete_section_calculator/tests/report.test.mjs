/**
 * report.test.mjs — A4-rapporten.
 *
 * Rapporten testes på STRUKTUR og INNHOLD, ikke på ordlyd: at kapitlene
 * kommer i rekkefølgen plan §8 krever, at figuren står FØRST i kapittel 2, at
 * hver av de tre analysene får sitt eget plott, og at de opplysningene som gjør
 * rapporten etterprøvbar faktisk står der. En test som låste hele HTML-strengen
 * ville feilet på hver eneste formuleringsendring uten å ha fanget en eneste
 * ekte feil.
 *
 * FIRE FEIL DISSE TESTENE FINNES FOR
 *
 *  1. Et kapittel som glir opp eller ned. Hver enkelt tabell ser fortsatt
 *     riktig ut, så feilen er usynlig ved lesing. `data-sec` gjør den målbar.
 *  2. Feil plott for analysen — eller ingen plott. Moment–krumning som viser
 *     M–N-omhyllingen er en rapport som lyver med et korrekt diagram.
 *  3. Norsk tekst eller «NaN»/«undefined» på papiret. Begge deler er ting man
 *     oppdager når rapporten er sendt, ikke før (endringsrunde 2, §1, §1.5).
 *  4. Kapittel 5 som sier «ved N_Ed = X kN» som om det var ett lasttilfelle,
 *     når det i virkeligheten var ti lastkombinasjoner og governing hoppet
 *     til en annen rad (endringsrunde 2, §4.3, §10 B4 punkt 4).
 *
 * `buildReportHtml` er DOM-fri (plan §2.3 punkt 2) og returnerer en streng, så
 * alt under kjøres i vanlig node uten jsdom.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReportHtml, REPORT_FIGURE_WIDTH_MM, PRINT_ROOT_ID } from '../js/report.js';
import { MODULE_NAME, MODULE_VERSION, STRUCTURALCODES_VERSION } from '../js/meta.js';
import { DASH, CODE_MESSAGES, UTILISATION_LEVELS, utilisationStatus } from '../js/results.js';

const fixture = (name) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8')
  );

/**
 * Referansebjelken, plan §3.6. `combos`/`activeCombo` erstatter `loads`
 * (endringsrunde 2, §4.1, §4.7) — samme tilstandsform som `store.js` nå bruker.
 */
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
  spacing: { k1: 1.0, k2: 5.0, d_g: 16 },
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50, dc_auto: false }],
  // ENDRINGSRUNDE 4 §1.2/§7: ingen `direction` — verken på kombinasjonen eller
  // på `state`. Retningen ER fortegnet på `M_Ed` (`M_Ed <= 0` er sagging).
  combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
  activeCombo: 'C1',
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
  analysis: 'bending',
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  doc: { project: 'Test project', title: 'Beam B1', author: 'MFO', date: '16.09.2026', note: '' },
  result: null,
};

/** Referanseplata 1000×200, Ø12 c/c 113. */
const SLAB_STATE = {
  ...BEAM_STATE,
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25,
  cover_side: 25,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31, dc_auto: false }],
  doc: { ...BEAM_STATE.doc, title: 'Slab D1' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Samme escaping som `esc()` i `report.js`. Flere av de engelske
 * CODE_MESSAGES-tekstene har en apostrof («the section's axial capacity»,
 * «the package's own last point») som blir `&#39;` i HTML-en — en test som
 * sammenligner mot den RÅ kodetabellteksten uten å gjøre det samme ville
 * aldri finne den i utdataen, og det ville ikke bevist noe om rapporten.
 */
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const BENDING = fixture('result-bending-beam-300x600');
const MC = fixture('result-mc-beam-300x600');
const NMDOM = fixture('result-nmdomain-beam-300x600');
const SLAB_BENDING = fixture('result-bending-slab-1000x200');

/**
 * Et «kjør alle»-svar, bygget slik `solver-client.js` sin `runAll()` bygger
 * det (endringsrunde 5 §D): MOTORENS egne blokker, uendret, under sine egne
 * navn, og `primary` som peker på kapasitetsanalysen. Det finnes INGEN
 * `result.all`, og `analysis` er 'all' — derfor kan ingenting i rapporten
 * lenger gate på analysenavnet.
 */
function runAllResult(primary = 'bending', blocks = ['bending', 'nm_domain', 'moment_curvature']) {
  const src = { bending: BENDING, nm_domain: NMDOM, moment_curvature: MC };
  const r = {
    ok: true,
    schema: BENDING.schema,
    analysis: 'all',
    primary,
    meta: BENDING.meta,
    materials: BENDING.materials,
    section_props: BENDING.section_props,
    checks: BENDING.checks,
    warnings: [],
  };
  for (const b of blocks) r[b] = clone(src[b][b]);
  return r;
}

/** Kapittelnumrene i den rekkefølgen de står i dokumentet. */
function chapterOrder(html) {
  return [...html.matchAll(/data-sec="(\d+)"/g)].map((m) => Number(m[1]));
}

/** Innholdet i ett kapittel — fram til neste `data-sec`, eller slutten. */
function chapterBody(html, nr) {
  const start = html.indexOf(`data-sec="${nr}"`);
  assert.notEqual(start, -1, `mangler kapittel ${nr}`);
  const next = html.indexOf('data-sec="', start + 10);
  return html.slice(start, next === -1 ? html.length : next);
}

/* ================================================================== *
 * Struktur
 * ================================================================== */

test('kapitlene står i rekkefølgen plan §8 krever, én gang hver', () => {
  for (const [state, result] of [
    [BEAM_STATE, BENDING],
    [BEAM_STATE, MC],
    [BEAM_STATE, NMDOM],
    [SLAB_STATE, SLAB_BENDING],
    [BEAM_STATE, null],
  ]) {
    const order = chapterOrder(buildReportHtml(state, result));
    assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7]);
  }
});

test('kapitteloverskriftene er nummererte og engelske', () => {
  const html = buildReportHtml(BEAM_STATE, BENDING);
  assert.match(html, /<h3>1\. Documentation<\/h3>/);
  assert.match(html, /<h3>2\. Cross-section and materials<\/h3>/);
  assert.match(html, /<h3>3\. Reinforcement<\/h3>/);
  assert.match(html, /<h3>4\. Loads and combinations<\/h3>/);
  assert.match(html, /<h3>5\. Result<\/h3>/);
  assert.match(html, /<h3>6\. Plot/);
  assert.match(html, /<h3>7\. Assumptions and method<\/h3>/);
});

test('topplinja bærer modulnavn og versjon fra meta.js', () => {
  const html = buildReportHtml(BEAM_STATE, BENDING);
  assert.ok(html.includes(MODULE_NAME));
  assert.ok(html.includes(`v${MODULE_VERSION}`));
  assert.ok(html.includes('Beam B1'), 'tittelen fra doc skal stå i topplinja');
  assert.ok(html.includes('Test project'));
  assert.ok(html.includes('MFO'));
});

/* ================================================================== *
 * Figur og plott
 * ================================================================== */

test('figuren står FØRST i kapittel 2, før tabellene', () => {
  const ch2 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 2);
  const fig = ch2.indexOf('<figure');
  const tbl = ch2.indexOf('<table');
  assert.notEqual(fig, -1, 'kapittel 2 mangler figuren');
  assert.notEqual(tbl, -1, 'kapittel 2 mangler tabellene');
  assert.ok(fig < tbl, 'figuren må stå før tabellene');
  assert.ok(ch2.includes('data-role="concrete"'), 'figuren skal være tverrsnittstegningen');
});

test('rapportfiguren er 174 mm bred, som trykkflaten på A4', () => {
  assert.equal(REPORT_FIGURE_WIDTH_MM, 174);
  const ch2 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 2);
  assert.match(ch2, /<svg[^>]*width="174mm"/);
  assert.match(ch2, /viewBox="/);
});

test('kapittel 2 viser snittet slik det er MATET INN — uten nøytralakse', () => {
  const ch2 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 2);
  assert.ok(!ch2.includes('data-role="na"'), 'resultatoverlegget hører hjemme i kapittel 6');
});

test('hver av de tre analysene får sitt eget, riktige plott', () => {
  const bend = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 6);
  assert.ok(bend.includes('data-role="na"'), 'bøyekapasitet: nøytralakse og trykksone');
  assert.ok(!bend.includes('data-role="envelope"'));

  const mc = chapterBody(buildReportHtml(BEAM_STATE, MC), 6);
  assert.ok(mc.includes('data-role="curve"'), 'moment–krumning: M(κ)-kurven');
  assert.ok(!mc.includes('data-role="envelope"'), 'feil plott er verre enn ingen');
  assert.match(mc, /moment–curvature/i);

  const dom = chapterBody(buildReportHtml(BEAM_STATE, NMDOM), 6);
  assert.ok(dom.includes('data-role="envelope"'), 'M–N: kapasitetsomhyllingen');
  assert.ok(!dom.includes('data-role="curve"'));
  assert.match(dom, /N–M/);
});

test('plottet er 174 mm bredt i alle tre analysene', () => {
  for (const res of [BENDING, MC, NMDOM]) {
    const ch6 = chapterBody(buildReportHtml(BEAM_STATE, res), 6);
    assert.match(ch6, /<svg[^>]*width="174mm"/, `mangler 174 mm-figur for ${res.analysis}`);
  }
});

/* ------------------------------------------------------------------ *
 * «Kjør alle»: rapporten trykker ALLE plottene som finnes (§D)
 * ------------------------------------------------------------------ */

/**
 * KJERNEKRAVET I §D: «alt skal vises i rapporten».
 *
 * Før sto gaten på ANALYSETYPEN (`analysis === 'moment_curvature'`), og et
 * «kjør alle»-resultat — `analysis: 'all'`, alle tre blokkene — falt gjennom
 * begge grenene og trykket ÉN figur. Både M–κ-kurven og M–N-omhyllingen var
 * borte fra papiret uten at noe feilet: kapitlet var der, det var bare
 * fattigere enn dataen. Gaten er nå «finnes blokka».
 */
test('«kjør alle»: kapittel 6 trykker både M–κ-kurven og M–N-omhyllingen', () => {
  const ch6 = chapterBody(buildReportHtml(BEAM_STATE, runAllResult('bending')), 6);
  assert.ok(ch6.includes('data-role="curve"'), 'M–κ-kurven mangler');
  assert.ok(ch6.includes('data-role="envelope"'), 'M–N-omhyllingen mangler');
  assert.ok(ch6.includes('data-role="na"'), 'bøyefiguren med nøytralaksen mangler');
  assert.equal((ch6.match(/<figure/g) || []).length, 3, 'tre plott, tre figurer');
  assert.equal((ch6.match(/width="174mm"/g) || []).length, 3, 'alle tre fyller trykkflaten');
  // Hver figur har sin egen overskrift — tre figurer under én tittel er en
  // rebus for leseren.
  assert.match(ch6, /<h4>Strain state at failure<\/h4>/);
  assert.match(ch6, /<h4>N–M diagram<\/h4>/);
  assert.match(ch6, /<h4>Moment–curvature<\/h4>/);
});

/**
 * Kapittelnummereringen er den ene egenskapen ved rapporten en endring kan
 * ødelegge helt stille (hodekommentaren). Tre plott skal ligge i ETT kapittel
 * 6, ikke i 6, 7 og 8 — ellers blir «Forutsetninger og metode» kapittel 9.
 */
test('«kjør alle» endrer ikke kapittelrekkefølgen — tre plott, ett kapittel 6', () => {
  const html = buildReportHtml(BEAM_STATE, runAllResult('bending'));
  assert.deepEqual(chapterOrder(html), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(html, /<h3>6\. Plots<\/h3>/, 'flere plott gir flertallsoverskrift');
  assert.match(html, /<h3>7\. Assumptions and method<\/h3>/);
  // Kapittel 1 skal si hvilken analyse som ble kjørt, ikke tankestrek.
  assert.match(chapterBody(html, 1), /Run all/);
});

/**
 * Motsatsen, og grunnen til at gaten ikke bare kunne fjernes: en ren
 * bøyeberegning skal fortsatt IKKE trykke to tomme diagrammer, og hvert av de
 * tre enkeltsvarene beholder sin egen, presise kapitteltittel.
 */
test('én analyse gir nøyaktig ett plott — ingen tomme diagrammer, ingen flertallstittel', () => {
  const cases = [
    [BENDING, 'Plot — strain state at failure', 'data-role="na"'],
    [MC, 'Plot — moment–curvature', 'data-role="curve"'],
    [NMDOM, 'Plot — N–M diagram', 'data-role="envelope"'],
  ];
  for (const [res, title, marker] of cases) {
    const html = buildReportHtml(BEAM_STATE, res);
    const ch6 = chapterBody(html, 6);
    assert.ok(ch6.includes(marker), `${res.analysis}: feil eller manglende plott`);
    assert.equal((ch6.match(/<figure/g) || []).length, 1, `${res.analysis}: ett plott, ikke flere`);
    assert.ok(html.includes(`<h3>6. ${title}</h3>`), `${res.analysis}: feil kapitteltittel`);
    assert.ok(!ch6.includes('<h4>'), `${res.analysis}: ett plott trenger ingen underoverskrift`);
  }
  // Den rene bøyerapporten har INGEN av de to diagrammene, akkurat som i dag.
  const bend6 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 6);
  assert.ok(!bend6.includes('data-role="curve"'));
  assert.ok(!bend6.includes('data-role="envelope"'));
});

/**
 * En DELVIS «kjør alle» (én analyse falt ut, `run_all_partial`) skal trykke
 * det som kom gjennom — verken en tom overskrift for den som mangler, eller
 * en bøyefigur det ikke finnes en bøyeblokk til.
 */
test('delvis «kjør alle»: bare plottene for blokkene som faktisk kom gjennom', () => {
  const ch6 = chapterBody(
    buildReportHtml(BEAM_STATE, runAllResult('nm_domain', ['nm_domain', 'moment_curvature'])),
    6
  );
  assert.ok(ch6.includes('data-role="envelope"'));
  assert.ok(ch6.includes('data-role="curve"'));
  assert.ok(!ch6.includes('data-role="na"'), 'ingen bøyefigur uten en bøyeblokk');
  assert.equal((ch6.match(/<figure/g) || []).length, 2);
  assert.ok(!ch6.includes('Strain state at failure'), 'ingen overskrift uten innhold');
});

/**
 * Et `ok: true`-svar uten en eneste analyseblokk bryter kontrakten, men skal
 * gi én ærlig setning — ikke inndatasnittet trykt under en overskrift som
 * lover et resultat.
 */
test('et resultat uten analyseblokk gir en ærlig setning, ikke en villedende figur', () => {
  const empty = runAllResult('bending', []);
  const ch6 = chapterBody(buildReportHtml(BEAM_STATE, empty), 6);
  assert.ok(!ch6.includes('<figure'));
  assert.ok(!ch6.includes('at failure'));
  assert.match(ch6, /nothing to\s+plot/);
});

test('uten nøytralakse tegnes ingen linje, og rapporten sier hvorfor', () => {
  // `x === null` ved nær rent trykk (plan §5.2).
  const res = clone(BENDING);
  res.bending.x = null;
  res.bending.x_over_d = null;
  const ch6 = chapterBody(buildReportHtml(BEAM_STATE, res), 6);
  assert.ok(!ch6.includes('data-role="na"'), 'en strek på slump er verre enn ingen strek');
  assert.match(ch6, /pure compression/);
});

test('uten resultat er kapittel 5 og 6 ærlige om at ingenting er beregnet', () => {
  const html = buildReportHtml(BEAM_STATE, null);
  assert.match(chapterBody(html, 5), /No calculation has been run/);
  assert.match(chapterBody(html, 6), /drawn once the calculation has been carried out/);
  // Men snittet og armeringen er kjent uten motoren, og skal stå.
  assert.ok(chapterBody(html, 2).includes('data-role="concrete"'));
  assert.match(chapterBody(html, 3), /3Ø20/);
});

/* ================================================================== *
 * Armering — de tre d-ene
 * ================================================================== */

test('armeringskapitlet viser d_eff som d, og d_eff_all ved siden av', () => {
  const res = clone(BENDING);
  res.section_props.d_eff_all = 453.0;
  res.section_props.As_tension = 942.4777960769379;
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, res), 3);
  assert.match(ch3, /d = d_eff, tension reinforcement alone/);
  assert.match(ch3, /d_eff,all/);
  assert.match(ch3, /A_s in tension/);
  assert.ok(ch3.includes('550.0'), 'EC2-d fra motoren skal stå');
  assert.ok(ch3.includes('453.0'), 'det arealvektede tallet skal stå ved siden av');
  // Valget skal være synlig, ikke skjult.
  assert.match(ch3, /tension reinforcement/);
});

/**
 * Verdien i én `kvTable`-rad, slått opp på etiketten.
 *
 * HVORFOR IKKE `html.includes(DASH)`: `kvTable`-etikettene inneholder selv
 * tankestrek — `[–]` er enheten på ρ — så en test som bare leter etter tegnet
 * i kapitlet passerer uansett hva raden den mener å teste faktisk viser. Den
 * gamle `d_eff_all`-testen under gjorde nettopp det og kunne ikke feile.
 */
function kvValue(html, label) {
  const literal = escapeHtml(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<th>${literal}</th><td[^>]*>([^<]*)</td>`));
  assert.ok(m, `fant ingen rad med etiketten «${label}»`);
  return m[1];
}

test('mangler motoren d_eff_all, blir det tankestrek — ikke et oppdiktet tall', () => {
  // Fixturen HAR `d_eff_all` (550). Den må fjernes for at testen skal handle
  // om det den heter — ellers påstår den bare at tegnet «–» finnes et sted i
  // kapitlet, hvilket det alltid gjør (enheten på ρ er «[–]»).
  const res = clone(BENDING);
  delete res.section_props.d_eff_all;
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, res), 3);
  assert.equal(kvValue(ch3, 'd_eff,all, area-weighted over all layers [mm]'), DASH);
  // Og med tallet til stede skal det faktisk trykkes.
  const medTall = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.equal(kvValue(medTall, 'd_eff,all, area-weighted over all layers [mm]'), '550.0');
});

/* ------------------------------------------------------------------ *
 * Runde 6 — ρ-etiketten, M_cr og strek der ingenting står i strekk
 * ------------------------------------------------------------------ */

/**
 * ETIKETTEN LØY OM TALLET (drive-by-feil, uavhengig av runde 6 ellers).
 * Raden sto som «ρ = ΣA_s/(b_t·d)», mens motoren sender
 * `as_tension / (b · d_eff)` (`engine.py:1264`). For et enkeltarmert snitt er
 * de to like, så feilen var usynlig i fixturen — men for et dobbeltarmert
 * snitt spriker de, og leseren som regnet etter fikk et annet tall enn det som
 * sto, uten noen måte å se hvem som tok feil.
 *
 * Testen skiller de to ved å gi fixturen trykkarmering: ΣA_s = 1942,5 mm²
 * mens As_tension = 942,5 mm². Da er ΣA_s/(b·d) = 0,0118 og
 * As_tension/(b·d_eff) = 0,0057 — og tallet som trykkes skal lystre etiketten.
 *
 * Ville FEILET før: etiketten inneholdt «ΣA_s/(b_t·d)».
 */
test('ρ-raden navngir den formelen tallet faktisk kommer av', () => {
  const res = clone(BENDING);
  res.section_props.As_total = 1942.4777960769379; // 942,5 i strekk + 1000 i trykk
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, res), 3);

  assert.ok(!ch3.includes('ΣA_s/(b_t·d)'), 'den gamle etiketten beskriver et annet tall');
  const label = 'ρ_l = A_s,tension/(b_t·d_eff) [–]';
  const printed = kvValue(ch3, label);

  const p = res.section_props;
  const etterEtiketten = (p.As_tension / (p.b_t * p.d_eff)).toFixed(4);
  const etterGammelEtikett = (p.As_total / (p.b_t * p.d_eff)).toFixed(4);
  assert.notEqual(etterEtiketten, etterGammelEtikett, 'fixturen skiller ikke de to formlene');
  assert.equal(printed, etterEtiketten, 'tallet lystrer ikke etiketten sin');
  assert.notEqual(printed, etterGammelEtikett);
});

/**
 * M_cr ER DET FYSISKE KRITERIET A_s,min BARE ER ET SURROGAT FOR (plan §1.5).
 * Står det ikke i rapporten, kan leseren ikke etterprøve `brittle_ok` — og
 * `brittle_ok` er den kontrollen som fanger snittet der A_s,min består
 * vakuøst. Raden skal stå RETT VED A_s,min, ikke i et annet kapittel.
 *
 * Ville FEILET før: ingen rad het M_cr.
 */
test('M_cr står i armeringskapitlet, rett ved A_s,min', () => {
  const res = clone(BENDING);
  res.section_props.M_cr = 52_100_000; // N·mm — plan §1.5 sin målte 52,1 kNm
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, res), 3);

  const label = 'M_cr = W·(f_ctm − N_Ed/A_c) [kNm]';
  assert.equal(kvValue(ch3, label), '52.1', 'M_cr skal trykkes i kNm, ikke i N·mm');

  // Rekkefølgen er en del av påstanden: A_s,min og M_cr skal kunne leses i
  // samme blikk, fordi hele poenget er å se når de to er uenige.
  const iAsMin = ch3.indexOf('A_s,min [mm');
  const iMcr = ch3.indexOf('M_cr = W');
  const iAsMax = ch3.indexOf('A_s,max [mm');
  assert.ok(iAsMin > -1 && iMcr > iAsMin && iAsMax > iMcr, 'M_cr står ikke mellom min og max');
});

/**
 * Motoren sender `M_cr` som `null` når referanseraden ligger utenfor
 * `[n_min, n_max]` — riss-momentet regnes før aksialsjekken, og et tall for en
 * lasttilstand motoren selv har forkastet skal ikke stå i rapporten.
 *
 * Rapporten skal da si «–», ikke «undefined», ikke «NaN», og aller minst et
 * nulltall, som ville lest som «snittet risser ved 0 kNm» — den mest
 * optimistiske påstanden som finnes.
 *
 * Fraværet KONSTRUERES her. Testen leste før et fixtur som tilfeldigvis manglet
 * feltet, og sluttet dermed å teste noe den dagen motoren begynte å sende det.
 */
test('uten M_cr fra motoren blir raden tankestrek, ikke null', () => {
  const uten = JSON.parse(JSON.stringify(BENDING));
  delete uten.section_props.M_cr;
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, uten), 3);
  const v = kvValue(ch3, 'M_cr = W·(f_ctm − N_Ed/A_c) [kNm]');
  assert.equal(v, DASH);
  assert.notEqual(v, '0.0');

  // Og eksplisitt `null`, som er det motoren faktisk sender.
  const nullet = JSON.parse(JSON.stringify(BENDING));
  nullet.section_props.M_cr = null;
  const ch3b = chapterBody(buildReportHtml(BEAM_STATE, nullet), 3);
  assert.equal(kvValue(ch3b, 'M_cr = W·(f_ctm − N_Ed/A_c) [kNm]'), DASH);

  // Men NÅR tallet finnes, skal det stå der — ellers ville testen over bestått
  // på en rapport som aldri trykker M_cr i det hele tatt.
  const ch3c = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.equal(kvValue(ch3c, 'M_cr = W·(f_ctm − N_Ed/A_c) [kNm]'), '52.1');
});

/**
 * Plata regnes per meter, og W = b·h²/6 med b = 1000 mm. Notatet lenger nede
 * merker bare «reinforcement quantities», så et moment må merkes i etiketten
 * sin — ellers leses 19,3 kNm/m som 19,3 kNm for hele plata.
 */
test('M_cr for plate merkes per meter i etiketten', () => {
  const res = clone(SLAB_BENDING);
  res.section_props.M_cr = 19_300_000;
  const ch3 = chapterBody(buildReportHtml(SLAB_STATE, res), 3);
  assert.equal(kvValue(ch3, 'M_cr = W·(f_ctm − N_Ed/A_c) [kNm] per metre'), '19.3');
  // Bjelken skal IKKE ha merkingen.
  const beam3 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.ok(beam3.includes('M_cr = W·(f_ctm − N_Ed/A_c) [kNm]<'), 'bjelken regnes ikke per meter');
});

/**
 * Plan §1.3: fallbacken i `_effective_depth` fjernes, så et snitt uten
 * armering i strekk gir `d_eff = null` i stedet for dagens oppdiktede
 * `d = 50 mm` og `ρ = 6,28 %`. Tre rader blir da «–» samtidig, og uten en
 * setning om hvorfor ser det ut som en programfeil framfor en opplysning om
 * tverrsnittet.
 *
 * Ville FEILET før: notatet fantes ikke, og tre tomme rader sto uforklart.
 */
test('rent trykkpåkjent snitt: d_eff, ρ og A_s,min blir strek, og notatet forklarer det', () => {
  const res = clone(BENDING);
  res.section_props.d_eff = null;
  res.section_props.rho = null;
  res.section_props.As_min = null;
  res.section_props.As_tension = 0;
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, res), 3);

  assert.equal(kvValue(ch3, 'd = d_eff, tension reinforcement alone [mm]'), DASH);
  assert.equal(kvValue(ch3, 'ρ_l = A_s,tension/(b_t·d_eff) [–]'), DASH);
  assert.equal(kvValue(ch3, 'A_s,min [mm²]'), DASH);
  // Tallet 0 er en ekte opplysning og skal IKKE bli strek: «ingen armering i
  // strekk» er noe annet enn «vet ikke».
  assert.equal(kvValue(ch3, 'A_s in tension [mm²]'), '0');

  assert.match(ch3, /no reinforcement lies in the tension zone at failure/i);
  assert.match(ch3, /M_cr/, 'notatet skal peke leseren på kontrollen som fortsatt gjelder');
  assert.ok(!ch3.includes('undefined'));
  assert.ok(!ch3.includes('NaN'));

  // Og det motsatte: et normalt snitt har ingen strek å forklare, og skal
  // derfor ikke bære noten. En note som står uansett lærer leseren å hoppe
  // over noter — og da forsvinner også den som betyr noe.
  const normal = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.ok(
    !/no reinforcement lies in the tension zone/i.test(normal),
    'noten står på et snitt som har armering i strekk'
  );
});

test('lagtabellen viser betegnelsen slik den legges inn', () => {
  assert.match(chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3), /3Ø20/);
  assert.match(chapterBody(buildReportHtml(SLAB_STATE, SLAB_BENDING), 3), /Ø12 c\/c 113/);
});

test('plata merkes «per metre» der mengdene er per meter', () => {
  const ch3 = chapterBody(buildReportHtml(SLAB_STATE, SLAB_BENDING), 3);
  assert.match(ch3, /per metre/);
  const beam3 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.ok(!beam3.includes('per metre'), 'en bjelke regnes ikke per meter');
});

/* ================================================================== *
 * Last og lastkombinasjoner (endringsrunde 2, §4.3, §10 B4 punkt 4)
 * ================================================================== */

/**
 * ENDRINGSRUNDE 4 §1.7: «magnitude in the analysed direction» var sant under
 * den gamle speilte konvensjonen. `M_Ed` er nå RÅTT og fortegnsatt, sagging
 * negativ (`structuralcodes` sin egen konvensjon, ikke norsk praksis) — og
 * konvensjonssetningen fra §1.7 skal stå her, ikke bare i UI-et.
 */
test('lastkapitlet sier fortegnskonvensjonen og aksialintervallet', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 4);
  assert.match(ch4, /compression negative/i);
  assert.match(ch4, /sagging negative/i);
  assert.match(ch4, /sagging \(compression at the top face\) is negative/i, 'ordrett fra §1.7');
  assert.match(ch4, /structuralcodes/);
  assert.match(ch4, /N_min/);
  assert.match(ch4, /N_max/);
  assert.ok(ch4.includes('-4010.4'), 'N_min i kN');
});

/**
 * Tre kombinasjoner, tallene fra plan §4.6, injisert i et KLONET fixturresultat
 * — motoren regner reelt bare én kombinasjon i fixturene, så testen bygger
 * selv de andre to i stedet for å late som fixturen hadde dem.
 */
function threeCombos(base, governing = 'C2') {
  const r = clone(base);
  const blk = r[r.analysis];
  blk.combinations = [
    {
      id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 150e6, theta: 0,
      M_Rd: 215006759.18601915, utilisation: 0.6976524857538235, within_limits: true,
    },
    {
      id: 'C2', name: 'ULS 2', N_Ed: -500000, M_Ed: 250e6, theta: 0,
      M_Rd: 305396902.98483205, utilisation: 0.818606860634787, within_limits: true,
    },
    {
      id: 'C3', name: 'ULS 3', N_Ed: -5000000, M_Ed: 0, theta: 0,
      M_Rd: null, utilisation: null, within_limits: false,
    },
  ];
  blk.governing = governing;
  if (governing) {
    const g = blk.combinations.find((c) => c.id === governing);
    Object.assign(blk, { N_Ed: g.N_Ed, M_Ed: g.M_Ed, M_Rd: g.M_Rd, utilisation: g.utilisation });
  }
  return r;
}

test('kapittel 4 viser ALLE lastkombinasjonene, ikke bare governing', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, threeCombos(BENDING)), 4);
  assert.match(ch4, /Load combinations/);
  assert.match(ch4, /ULS 1/);
  assert.match(ch4, /ULS 2/);
  assert.match(ch4, /ULS 3/);
  // C2 er governing.
  assert.match(ch4, /data-role="combo-governing"/);
  assert.match(ch4, /Governing/);
  // C3 er utenfor [N_min, N_max] og skal si det, ikke gjette på et tall.
  assert.match(ch4, /Outside \[N_min, N_max\]/);
});

test('kombinasjonstabellen viser N_Ed/M_Ed i kN/kNm, ikke rå N/Nmm', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, threeCombos(BENDING)), 4);
  assert.ok(ch4.includes('-500.0'), 'C2 sin N_Ed i kN');
  assert.ok(ch4.includes('250.0'), 'C2 sin M_Ed i kNm');
});

/*
 * ===========================================================================
 * STEG 2 — R16/R17/R18: «Not checked», DASH-cellene og bakoverkompatibilitet
 * ===========================================================================
 */

/** En ULS-rad og en `characteristic`-rad (SLS, ukontrollert) — samme mønster som `threeCombos`. */
function withUncheckedCombo(base) {
  const r = clone(base);
  const blk = r[r.analysis];
  blk.combinations = [
    {
      id: 'C1', name: 'ULS 1', type: 'uls', checked: true,
      N_Ed: 0, M_Ed: 150e6, theta: 0,
      M_Rd: 215006759.18601915, utilisation: 0.6976524857538235, within_limits: true,
      V_Ed: 0, shear: null,
    },
    {
      id: 'C2', name: 'SLS 1', type: 'characteristic', checked: false,
      N_Ed: -100000, M_Ed: 80e6, theta: 0,
      M_Rd: null, utilisation: null, within_limits: null,
      V_Ed: 40000, shear: null,
    },
  ];
  blk.governing = 'C1';
  Object.assign(blk, {
    N_Ed: 0, M_Ed: 150e6,
    M_Rd: 215006759.18601915, utilisation: 0.6976524857538235,
  });
  return r;
}

test('R16 — en ikke-ULS-rad STÅR i kombinasjonstabellen med «Not checked», ikke utelatt', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, withUncheckedCombo(BENDING)), 4);
  assert.match(ch4, /ULS 1/, 'den kontrollerte raden er der som før');
  assert.match(ch4, /SLS 1/, 'den UKONTROLLERTE raden er også der — den skal ALDRI forsvinne (G6)');
  assert.match(ch4, /Not checked/);
});

test('R17 — samme rad viser DASH i η-, V_Ed- og η_V-kolonnene, og SLS-fotnoten står under tabellen', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, withUncheckedCombo(BENDING)), 4);
  assert.match(ch4, /Serviceability checks are not implemented in this version\./, 'G5-fotnoten');
  // Radraden for C2 (SLS 1) skal ha DASH i η/V_Ed/η_V — tre DASH-er i den ene raden.
  const row = ch4.slice(ch4.indexOf('SLS 1'), ch4.indexOf('SLS 1') + 400);
  const dashesInRow = (row.match(new RegExp(DASH, 'g')) || []).length;
  assert.ok(dashesInRow >= 3, `forventet minst 3 DASH i SLS-raden (η, V_Ed, η_V), fikk ${dashesInRow}`);
});

test('R18 — en resultatfixtur UTEN checked-feltet (de seks committede) gir NØYAKTIG samme statustekster som før', () => {
  // BENDING er en committet fixtur uten `checked`/`type` på sine kombinasjoner
  // (de fantes ikke før STEG 2). `c.checked === false`, ALDRI `!c.checked` —
  // ellers ville `undefined` blitt lest som «ikke kontrollert» og hver
  // eneste gamle fixtur fått «Not checked» på en rad som faktisk ER en uls-rad.
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 4);
  assert.ok(!ch4.includes('Not checked'), 'undefined skal IKKE tolkes som ukontrollert (planens felle 13)');
});

test('resultatkapitlet sier UTTRYKKELIG hvilken kombinasjon tallene gjelder', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, threeCombos(BENDING)), 5);
  assert.match(ch5, /Governing load combination/);
  assert.match(ch5, /ULS 2/);
  assert.match(ch5, /governing of 3/);
});

test('uten kandidat innenfor [N_min, N_max] sier kapittel 5 det, ikke et gjettet navn', () => {
  const res = threeCombos(BENDING, null);
  res.bending.M_Rd = null;
  res.bending.utilisation = null;
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);
  assert.match(ch5, /None within \[N_min, N_max\]/);
  assert.match(ch5, /of 3/);
});

test('kun én kombinasjon: kapittel 5 nevner den likevel, ikke bare et bart tall', () => {
  // Fixturen bærer allerede combinations/governing med ett element (§4.2 sin
  // gamle-form-reserve gir nettopp ett `C1`).
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(ch5, /Governing load combination/);
  assert.match(ch5, /governing of 1/);
});

/* ================================================================== *
 * Resultat
 * ================================================================== */

/**
 * ENDRINGSRUNDE 4 §1.4/§1.6: `M_Rd` er nå RÅTT og NEGATIVT for feltkapasitet
 * (`bending.M_Rd = -215006759.186...`, samme absoluttverdi som før). `300e6 /
 * over.bending.M_Rd` uten `abs` gir dermed et NEGATIVT tall som aldri kunne
 * blitt 'over' — testen låste seg selv til den gamle, positive konvensjonen.
 * `utilisation` er en STØRRELSE (§1.4: `|M_Ed| / |M_Rd|`), akkurat som motoren
 * selv nå regner den.
 */
test('resultatboksen bærer status fra results.js sine terskler', () => {
  const low = buildReportHtml(BEAM_STATE, BENDING);
  assert.ok(low.includes('data-level="ok"'));
  assert.ok(low.includes(UTILISATION_LEVELS.ok.label));

  const over = clone(BENDING);
  over.bending.M_Ed = -300e6;
  over.bending.utilisation = Math.abs(-300e6) / Math.abs(over.bending.M_Rd);
  const html = buildReportHtml(BEAM_STATE, over);
  assert.equal(utilisationStatus(over.bending.utilisation).level, 'over');
  assert.ok(html.includes('data-level="over"'));
  assert.ok(html.includes(UTILISATION_LEVELS.over.label));
});

/**
 * ENDRINGSRUNDE 4 §1.2/§7: `state.direction` finnes ikke lenger. `thetaOf()`
 * leser primært `result.meta.theta` (satt her), med den AKTIVE kombinasjonens
 * fortegnsatte `M_Ed` som reserve — ALDRI et `direction`-felt på `state`.
 */
test('resultatkapitlet merker trykkanten etter retningen, ikke som «top face» ukritisk', () => {
  const sag = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(sag, /ε_c at top face/);

  const hog = clone(BENDING);
  hog.meta.theta = Math.PI;
  const html = buildReportHtml(BEAM_STATE, hog);
  assert.match(chapterBody(html, 5), /ε_c at bottom face/);
  assert.ok(!chapterBody(html, 5).includes('ε_c at top face'));
});

/**
 * Reserven: UTEN `result.meta.theta` (f.eks. før første kjøring) skal
 * retningen komme fra den AKTIVE kombinasjonens `M_Ed`-fortegn — positivt
 * `M_Ed` er støttemoment (θ = π), akkurat som `section.js:thetaFor`.
 */
test('uten meta.theta faller retningen tilbake til den aktive kombinasjonens M_Ed-fortegn', () => {
  const hoggingState = {
    ...BEAM_STATE,
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 250, V_Ed: 0 }],
  };
  const ch2 = chapterBody(buildReportHtml(hoggingState, null), 2);
  assert.match(ch2, /Hogging — compression at the bottom face/);

  const saggingState = {
    ...BEAM_STATE,
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: -250, V_Ed: 0 }],
  };
  const ch2sag = chapterBody(buildReportHtml(saggingState, null), 2);
  assert.match(ch2sag, /Sagging — compression at the top face/);
});

test('kontrolltabellen står i resultatkapitlet', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(ch5, /Minimum reinforcement/);
  assert.match(ch5, /Ductility/);
  assert.match(ch5, /Overall assessment/);
  assert.match(ch5, /Concrete crushing/, 'bruddformen skal være oversatt');
});

/**
 * ENDRINGSRUNDE 4 §10 punkt 2: uten `CHECK_ORDER` utvidet i `results.js`
 * ville de tre skjærkontrollene motoren nå sender (`checks.shear_ok` osv.,
 * fixturen bærer dem allerede) vært stille fraværende fra rapporten. Denne
 * testen leser dem der leseren faktisk møter dem — i selve HTML-en.
 */
test('de tre nye skjærkontrollene står i kontrolltabellen', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(ch5, /Shear capacity V_Ed/);
  assert.match(ch5, /Minimum shear reinforcement/);
  assert.match(ch5, /Stirrup spacing/);
});

/* ------------------------------------------------------------------ *
 * Runde 6 — bøye- og sprøbruddkontrollen på papiret
 * ------------------------------------------------------------------ */

/**
 * Plan §1.2/§1.5: begge de nye kontrollene skal FAKTISK stå i tabellen leseren
 * ser, ikke bare i `CHECK_ORDER`. Testen leser HTML-en, ikke tabellen — det er
 * forskjellen på at kontrollen finnes og at den er synlig.
 *
 * Ville FEILET før: `CHECK_ORDER` hadde verken `bending_ok` eller
 * `brittle_ok`, så `checkRows()` emitterte dem ikke og radene fantes ikke.
 */
test('bøye- og sprøbruddkontrollen står i kontrolltabellen, med status', () => {
  const res = clone(BENDING);
  res.checks = { ...res.checks, bending_ok: false, brittle_ok: false };
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);
  assert.match(ch5, /Bending capacity M_Ed/);
  assert.match(ch5, /Brittle failure/);
  // Statusen skal følge med, ikke bare etiketten.
  assert.match(
    ch5,
    /Bending capacity M_Ed[^<]*<\/td><td[^>]*>Not OK<\/td>/,
    'bøyekontrollen står uten status'
  );
  assert.match(ch5, /Brittle failure[^<]*<\/td><td[^>]*>Not OK<\/td>/);
});

/**
 * Plan §1.1: `null` skal trykkes som «–» i hver eneste rad, aldri som «OK» og
 * aldri som tom celle. Den tomme cellen er den farligste: `esc(undefined)` gir
 * tom streng, så en glemt etikett eller en tapt verdi ville blitt en rad som
 * bare ser ferdig ut.
 */
test('null i hver eneste kontroll gir en fullstendig tabell med bare strek', () => {
  const res = clone(BENDING);
  res.checks = Object.fromEntries(Object.keys(res.checks).map((k) => [k, null]));
  res.checks.bending_ok = null;
  res.checks.brittle_ok = null;
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);

  assert.ok(!ch5.includes('undefined'));
  assert.ok(!ch5.includes('NaN'));
  assert.ok(!/<td[^>]*><\/td>/.test(ch5), 'en tom statuscelle ser ut som en ferdig rad');
  // Ingen kontroll får lese som bestått når ingen ble besvart.
  assert.ok(!/<\/td><td[^>]*>OK<\/td>/.test(ch5), 'ubesvart ble til bestått');
  assert.match(ch5, new RegExp(`Overall assessment</td><td[^>]*>${DASH}</td>`));
});

/**
 * Plan §1.5: `failureModeLabel` skriver «Unknown failure mode ("...")» for en
 * verdi den ikke kjenner, og `failureModeNote` blir tom — altså står den nye
 * bruddformen på papiret som en programfeil uten forklaring.
 *
 * Ville FEILET før: `FAILURE_MODES` manglet `unreinforced_tension_zone`.
 */
test('unreinforced_tension_zone trykkes med navn og forklaring, ikke som ukjent', () => {
  const res = clone(BENDING);
  res.bending.failure_mode = 'unreinforced_tension_zone';
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);
  assert.ok(!ch5.includes('Unknown failure mode'), 'bruddformen står som ukjent');
  assert.match(ch5, /Unreinforced tension zone/);
  // Forklaringen er hele grunnen til at feltet leses: den skal si hva leseren
  // skal GJØRE, og «mer armering på strekksiden» er noe annet enn «mindre
  // armering», som `over_reinforced` ville sagt.
  assert.match(ch5, /cracking moment M_cr/i);
  assert.match(ch5, /reinforcement on the face that carries tension/i);
});

/* ================================================================== *
 * Skjær (endringsrunde 4 §4.2, §4.3)
 * ================================================================== */

/**
 * Referansefixturen bærer `shear: null` per kombinasjon — motoren sender det
 * når payloaden ikke hadde `section.shear` (eldre kontrakt). Rapporten skal
 * si det ÆRLIG, ikke late som et merke eller en tabell fantes.
 */
test('uten skjærdata i det hele tatt: ingen skjærmerke, og kapittel 5 sier det rett ut', () => {
  const html = buildReportHtml(BEAM_STATE, BENDING);
  const ch5 = chapterBody(html, 5);
  assert.ok(!ch5.includes('result-shear'), 'intet skjærmerke uten skjærdata');
  assert.match(ch5, /No shear capacity could be evaluated/);
});

/**
 * Tallene her er de MÅLTE fra plan §4.2 (referansebjelken, 2Ø8 c/c 150).
 * Fixturen kjenner ikke skjær (eldre kontrakt), så testen setter den inn på
 * én kombinasjon selv — samme mønster som `threeCombos()` bruker for bøying.
 */
function withShear(base, governing = 'C1') {
  const r = clone(base);
  // ENDRINGSRUNDE 5: skjæret legges i HVER analyseblokk resultatet bærer, ikke
  // bare i `r[r.analysis]`. To grunner: motoren garanterer nå bit-identisk
  // skjær i alle tre analysene (bølge 1), og et «kjør alle»-resultat har
  // `analysis: 'all'` — det finnes ingen `r.all` å legge noe i.
  for (const key of ['bending', 'nm_domain', 'moment_curvature']) {
    const blk = r[key];
    if (!blk || !Array.isArray(blk.combinations)) continue;
    blk.shear_governing = governing;
    const combo = blk.combinations.find((c) => c.id === governing) || blk.combinations[0];
    combo.V_Ed = 120000.0;
    combo.shear = {
      evaluated: true, V_Ed: 120000.0,
      V_Rd: 143453.3, V_Rd_c: 81615.2393, V_Rd_s: 143453.3, V_Rd_max: 779803.2,
      governing_mode: 'stirrups', utilisation: 0.83651,
      Asl: 942.4778, d: 547.0, bw: 300.0, z: 492.3,
      asw_s: 0.670206, asw_s_min: 0.262907, asw_s_required: 0.560634,
      sl_max: 410.25, st_max: 410.25,
    };
  }
  return r;
}

/**
 * SKJÆRET ER ANALYSE-AGNOSTISK (§4.3, endringsrunde 5 §D punkt 4).
 *
 * Motoren garanterer fra bølge 1 at skjærblokka og de tre skjærkontrollene er
 * BIT-IDENTISKE i alle analysene for samme payload. Testene under kjørte
 * tidligere bare mot BENDING-fixturen, og hadde derfor ikke fanget at
 * `analysisBlock()` ikke kjente 'all' — da forsvinner hele skjærkapitlet og
 * skjærmerket fra en «kjør alle»-rapport, stille.
 */
const SHEAR_CASES = () => [
  ['bending', withShear(BENDING)],
  ['moment_curvature', withShear(MC)],
  ['nm_domain', withShear(NMDOM)],
  ['all', withShear(runAllResult('bending'))],
];

test('skjærmerket viser η_V ved siden av η_M, EGET tall, ikke slått sammen (§4.3)', () => {
  for (const [name, res] of SHEAR_CASES()) {
    const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);
    assert.match(ch5, /class="result-main result-shear"/, name);
    assert.match(ch5, /η_V = V_Ed \/ V_Rd/, name);
    assert.match(ch5, /V 0\.84/, `${name}: V_Ed/V_Rd = 0,83651, avrundet til 2 desimaler`);
    // η_M (hovedtallet) skal FORTSATT stå, uendret av at skjæret er lagt til.
    assert.match(ch5, /η = M_Ed \/ M_Rd\(N_Ed\)/, name);
  }
});

test('skjærdelen av kapittel 5 viser V_Rd,c/V_Rd,s/V_Rd,max og governing mode, aldri summert', () => {
  for (const [name, res] of SHEAR_CASES()) {
    const ch5 = chapterBody(buildReportHtml(BEAM_STATE, res), 5);
    assert.match(ch5, /<h4>Shear<\/h4>/, name);
    assert.ok(ch5.includes('143.5'), `${name}: V_Rd i kN`);
    assert.ok(ch5.includes('81.6'), `${name}: V_Rd,c i kN`);
    assert.match(ch5, /Stirrups govern/, name);
    assert.ok(ch5.includes('942'), `${name}: A_sl`);
    assert.match(ch5, /V_Rd,c is never added to V_Rd,s/, name);
  }
});

test('lastkombinasjonstabellen (kapittel 4) får V_Ed- og η_V-kolonner, og markerer skjær-governing', () => {
  for (const [name, res] of SHEAR_CASES()) {
    const ch4 = chapterBody(buildReportHtml(BEAM_STATE, res), 4);
    assert.match(ch4, /V_Ed \[kN\]/, name);
    assert.match(ch4, /η_V \[–\]/, name);
    assert.match(ch4, /data-shear-governing="true"/, name);
    assert.ok(ch4.includes('120.0'), `${name}: V_Ed i kN`);
    assert.ok(ch4.includes('0.837'), `${name}: η_V med tre desimaler, som η_M`);
  }
});

test('den radielle λ er merket som sekundær lastvei, ikke som η', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, NMDOM), 5);
  assert.match(ch5, /load path/);
  assert.match(ch5, /secondary/i);
  assert.match(ch5, /η = M_Ed \/ M_Rd\(N_Ed\)/);
  // Bøyekapasitet har ingen omhylling og skal derfor ikke nevne load path i det hele tatt.
  assert.ok(!chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5).includes('load path'));
});

/**
 * `nm_domain` bærer bruddtilstanden ved N_Ed med NØYAKTIG samme åtte
 * nøkkelnavn som `bending`. Tallene er de målte fra nettleseren ved
 * N_Ed = −500 kN.
 */
function domainWithFailureState() {
  const r = clone(NMDOM);
  Object.assign(r.nm_domain, {
    N_Ed: -500000,
    M_Ed: 250e6,
    utilisation: 0.82,
    eps_a: 0.00123,
    chi_y: -1.5e-5,
    x: 220.4,
    x_over_d: 0.403,
    eps_c_top: -0.0035,
    eps_s_max: 0.0049,
    failure_mode: 'concrete_crushing',
    layers: [{ id: 'L1', z: -250.0, eps: 0.0049, sigma: 434.8, compression: false }],
  });
  return r;
}

test('M–N-rapporten viser bruddtilstanden ved N_Ed, ikke bare omhyllingen', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, domainWithFailureState()), 5);
  assert.ok(ch5.includes('220.4'), 'x ved N_Ed');
  assert.ok(ch5.includes('0.403'), 'x/d ved N_Ed');
  assert.match(ch5, /ε_s,max/);
  assert.match(ch5, /κ_y/);
  assert.match(ch5, /Concrete crushing/, 'bruddformen skal være oversatt');
  assert.match(ch5, /Strains and stresses per reinforcement layer at N_Ed/);
  assert.ok(ch5.includes('434.8'), 'spenningen per lag');
});

test('tøyningsplanet for M–N merkes uttrykkelig som «at N_Ed», med kombinasjonsnavnet', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, domainWithFailureState()), 5);
  assert.match(ch5, /Compression zone depth x \[mm\] at N_Ed/);
  assert.match(ch5, /not an arbitrary point on the envelope/);
  assert.ok(ch5.includes('-500.0'), 'N_Ed skal stå i merknaden, i kN');
  // Fixturen har ett element i combinations (id C1) — navnet skal stå i merknaden.
  assert.match(ch5, /load combination C1/);
  // Bøyeberegningen trenger ingen slik påminnelse — der er det selvsagt.
  const bend5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.ok(!bend5.includes('arbitrary point'));
  assert.ok(!bend5.includes('Compression zone depth x [mm] at N_Ed'));
  assert.match(bend5, /Compression zone depth x \[mm\]/);
});

/**
 * DEN ENE AV DE TO PÅKREVDE OMSKRIVINGENE (task-briefen).
 *
 * Fixturen `NMDOM` bærer nå `combinations`/`governing` (regenerert etter
 * bølge 1) og kan derfor IKKE lenger brukes direkte til å bevise at
 * fallbacket virker — `failureState()` ville uansett funnet `failure_mode`
 * et sted. Testen bygger derfor sitt EGET, bevisst STRIPPEDE
 * `nm_domain`-resultat: en omhylling med tall, men UTEN noen av de åtte
 * bruddtilstandsfeltene, slik en ekte motorkjøring ville sett ut hvis
 * `N_Ed` lå utenfor [N_min, N_max] og ingen kombinasjon var governing
 * (§4.3 regel 4 — se `governing: null`-varianten i egen test over).
 */
test('mangler omhyllingen bruddtilstanden, faller kapitlet pent tilbake', () => {
  const stripped = {
    ok: true,
    schema: NMDOM.schema,
    analysis: 'nm_domain',
    meta: NMDOM.meta,
    materials: NMDOM.materials,
    section_props: NMDOM.section_props,
    checks: NMDOM.checks,
    warnings: [],
    nm_domain: {
      n: [0.1, 0.2, 0.3],
      m: [0.4, 0.5, 0.6],
      field_num: 3,
      N_Ed: -500000,
      M_Ed: 250e6,
      M_Rd_at_N: null,
      M_Rd: null,
      utilisation: null,
      N_min: NMDOM.nm_domain.N_min,
      N_max: NMDOM.nm_domain.N_max,
      // Bevisst UTEN eps_a, chi_y, x, x_over_d, eps_c_top, eps_s_max,
      // failure_mode, layers — det er nøyaktig fraværet av disse åtte
      // feltene testen skal bevise at rapporten tåler.
      combinations: [
        { id: 'C1', name: 'ULS 1', N_Ed: -500000, M_Ed: 250e6, theta: 0, within_limits: false },
      ],
      governing: null,
    },
  };
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, stripped), 5);
  assert.ok(!ch5.includes('Compression zone depth'), 'ingen bruddtilstand å vise fram');
  assert.ok(!ch5.includes('Failure mode'));
  assert.match(ch5, /Points on the envelope/, 'resten av kapitlet står som før');
  assert.match(ch5, /None within \[N_min, N_max\]/, 'governing null skal sies rett ut');
});

test('mc_endpoint_mismatch vises som merknad, ikke som ukjent kode', () => {
  const res = clone(MC);
  res.warnings = [
    {
      code: 'mc_endpoint_mismatch',
      severity: 'info',
      message: 'ignored',
      detail: 'last point differs from M_Rd by 3.2 permille',
    },
  ];
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, res), 7);
  assert.ok(ch7.includes(escapeHtml(CODE_MESSAGES.mc_endpoint_mismatch)));
  assert.ok(ch7.includes('Note'));
  assert.ok(!ch7.includes('Unspecified message'), 'koden skal være kjent nå');
  assert.ok(ch7.includes('<code>mc_endpoint_mismatch</code>'));
});

test('et {ok:false}-svar rapporteres oversatt, ikke som rå ValueError', () => {
  const bad = {
    ok: false,
    schema: 1,
    error: {
      code: 'axial_out_of_range',
      message: 'irrelevant',
      detail: 'ValueError: n=-5e6 is outside [n_min, n_max]',
    },
  };
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, bad), 5);
  assert.ok(ch5.includes(escapeHtml(CODE_MESSAGES.axial_out_of_range)));
  assert.ok(ch5.includes('ValueError'), 'rå tekst skal være tilgjengelig som detalj');
  const msgIdx = ch5.indexOf(escapeHtml(CODE_MESSAGES.axial_out_of_range));
  const detIdx = ch5.indexOf('ValueError');
  assert.ok(msgIdx < detIdx, 'den oversatte meldingen er hovedmeldingen');
});

/**
 * DEN ANDRE AV DE TO PÅKREVDE OMSKRIVINGENE (task-briefen).
 *
 * `{ok:false}` bærer nå HELE konvolutten (endringsrunde 2, §4.4) — `checks`,
 * `section_props`, `meta` og en analyseblokk er alle til stede selv når
 * INGEN kombinasjon var innenfor [N_min, N_max]. Testen bygger et resultat
 * som ser akkurat slik ut, og viser at kapittel 2/3 bruker de EKTE tallene
 * fra det mislykkede resultatet — ikke `derived(state)` — fordi et resultat
 * som finnes ikke skal behandles som tomt.
 */
test('{ok:false} med full konvolutt: kapittel 2 og 3 bruker motorens EGNE tall, ikke derived(state)', () => {
  const bad = {
    ok: false,
    schema: 1,
    analysis: 'bending',
    meta: BENDING.meta,
    materials: BENDING.materials,
    // Et tall som IKKE kan komme fra `derived(state)` — det beviser at
    // rapporten faktisk leste `result.section_props` og ikke regnet selv.
    section_props: { ...BENDING.section_props, Ag: 999999 },
    checks: { ...BENDING.checks, axial_ok: false, all_ok: false },
    warnings: [],
    error: {
      code: 'axial_out_of_range',
      message: 'irrelevant',
      detail: 'n_min=-4010438.4, n_max=442554.8',
    },
    bending: {
      N_Ed: -5000000, M_Ed: 0, M_Rd: null, utilisation: null,
      x: null, x_over_d: null, eps_a: null, chi_y: null,
      eps_c_top: null, eps_s_max: null, failure_mode: null, layers: null,
      combinations: [
        { id: 'C1', name: 'ULS 1', N_Ed: -5000000, M_Ed: 0, theta: 0, within_limits: false },
      ],
      governing: null,
    },
  };
  const html = buildReportHtml(BEAM_STATE, bad);
  assert.ok(chapterBody(html, 2).includes('999999'), 'section_props fra det mislykkede resultatet skal brukes');
  // Kapittel 5 skal fortsatt vise selve feilen, ikke late som alt gikk bra.
  assert.ok(chapterBody(html, 5).includes(escapeHtml(CODE_MESSAGES.axial_out_of_range)));
});

/* ================================================================== *
 * Kapittel 7 — det som gjør rapporten etterprøvbar
 * ================================================================== */

test('metodekapitlet sier det plan §8 punkt 7 krever', () => {
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(ch7, /marin/i, 'integratoren');
  assert.match(ch7, /subtract_bar_area/, 'stålarealtrekket');
  assert.match(ch7, /scipy/, 'substitusjonen');
  assert.match(ch7, /numpy/i, 'hva den er erstattet MED');
  assert.ok(ch7.includes(STRUCTURALCODES_VERSION), 'structuralcodes-versjonen');
  assert.ok(ch7.includes('1992-1-1'), 'EC2-referansene');
});

test('scipy-substitusjonen står som en substitusjon, ikke som en fotnote', () => {
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(ch7, /replaced by a verified numpy equivalent/i);
  assert.match(ch7, /lu_factor/);
  assert.match(ch7, /0\.000e\+00/, 'ekvivalensen er målt, og målingen skal stå');
});

test('den utsmurte stripa forklares for plata', () => {
  const slab7 = chapterBody(buildReportHtml(SLAB_STATE, SLAB_BENDING), 7);
  assert.match(slab7, /smeared/i);
  assert.match(slab7, /0\.17 %/, 'verifikasjonen mot diskrete jern');
  // Bjelken får den motsatte opplysningen — diskrete jern — og ikke stripa som sin modell.
  const beam7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(beam7, /Discrete bars/);
});

test('subtract_bar_area beskrives med den konsekvensen valget har', () => {
  const off = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(off, /subtract_bar_area = off/);
  assert.match(off, /unsafe side/);

  const on = clone(BENDING);
  on.meta.subtract_bar_area = true;
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, on), 7);
  assert.match(ch7, /subtract_bar_area = on/);
  assert.match(ch7, /punched out/);
});

test('ALLE advarsler står i kapittel 7, oversatt, med rå tekst som detalj', () => {
  const res = clone(BENDING);
  res.warnings = [
    {
      code: 'bar_in_compression_zone',
      severity: 'warning',
      message: 'ignored',
      detail: 'Estimated error 2.1 kNm on the unsafe side',
    },
    {
      code: 'mc_truncated',
      severity: 'info',
      message: 'ignored',
      detail: 'StructuralCodesWarning: convergence not achieved',
    },
  ];
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, res), 7);
  assert.ok(ch7.includes(CODE_MESSAGES.bar_in_compression_zone));
  assert.ok(ch7.includes(CODE_MESSAGES.mc_truncated));
  assert.ok(ch7.includes('Warning'));
  assert.ok(ch7.includes('Note'));
  assert.ok(ch7.includes('Estimated error 2.1 kNm'), 'detaljen skal være tilgjengelig');
  assert.ok(ch7.includes('<code>bar_in_compression_zone</code>'), 'koden er sporet');
});

test('en axial_out_of_range-advarsel merket med kombinasjon viser navnet i kapittel 7', () => {
  const res = clone(BENDING);
  res.warnings = [
    {
      code: 'axial_out_of_range',
      severity: 'warning',
      combo: 'C3',
      combo_name: 'ULS 3',
      detail: 'n=-5e6 outside [n_min, n_max]',
    },
  ];
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, res), 7);
  assert.match(ch7, /ULS 3: /, 'kombinasjonsnavnet skal stå foran hovedmeldingen');
  assert.ok(ch7.includes(escapeHtml(CODE_MESSAGES.axial_out_of_range)));
});

test('uten advarsler sier rapporten det uttrykkelig', () => {
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(ch7, /No warnings/);
});

/* ================================================================== *
 * Tall som ikke finnes (plan §5.4)
 * ================================================================== */

test('et null-tall blir tankestrek på papiret, aldri NaN eller 0', () => {
  const res = clone(BENDING);
  res.bending.x = null;
  res.bending.x_over_d = null;
  res.bending.chi_y = null;
  res.bending.eps_c_top = null;
  res.section_props.As_min = null;
  const html = buildReportHtml(BEAM_STATE, res);
  assert.ok(html.includes(DASH));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('Infinity'));
  assert.ok(!html.includes('[object Object]'));
  // Merkelappene skal fortsatt stå — det er DE som gjør tankestreken lesbar.
  assert.match(html, /Compression zone depth x \[mm\]/);
  assert.match(html, /A_s,min/);
});

test('ingen rapportvariant lekker NaN, undefined eller [object Object]', () => {
  for (const [state, result] of [
    [BEAM_STATE, BENDING],
    [BEAM_STATE, MC],
    [BEAM_STATE, NMDOM],
    [SLAB_STATE, SLAB_BENDING],
    [BEAM_STATE, threeCombos(BENDING)],
    [BEAM_STATE, runAllResult('bending')],
    [BEAM_STATE, runAllResult('nm_domain', ['nm_domain', 'moment_curvature'])],
    [BEAM_STATE, null],
    [{}, null],
  ]) {
    const html = buildReportHtml(state, result);
    assert.ok(!html.includes('NaN'), 'NaN på papir');
    assert.ok(!html.includes('undefined'), 'undefined på papir');
    assert.ok(!html.includes('[object Object]'));
  }
});

test('en tom tilstand gir en rapport, ikke et unntak', () => {
  const html = buildReportHtml({}, null);
  assert.deepEqual(chapterOrder(html), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(html, /No reinforcement layers entered/);
});

/* ================================================================== *
 * Sikkerhet i formateringen
 * ================================================================== */

test('fritekst fra brukeren escapes', () => {
  const st = {
    ...BEAM_STATE,
    doc: { ...BEAM_STATE.doc, title: '<script>alert(1)</script>', project: 'A & B' },
  };
  const html = buildReportHtml(st, BENDING);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B'));
});

/* ================================================================== *
 * Utskriftsriggen
 * ================================================================== */

test('utskriftsroten heter det print.css skjuler og viser', () => {
  assert.equal(PRINT_ROOT_ID, 'cscPrintRoot');
  const css = readFileSync(fileURLToPath(new URL('../print.css', import.meta.url)), 'utf8');
  assert.ok(css.includes(`#${PRINT_ROOT_ID}`), 'print.css må kjenne utskriftsroten');
  assert.ok(
    css.includes(`body > #${PRINT_ROOT_ID}`),
    'den ene strukturelle regelen må peke på roten'
  );
  assert.ok(css.includes('@media print'), 'print.css må ha en utskriftsdel');
  assert.ok(css.includes('size: A4 portrait'), 'A4 stående');
  assert.ok(css.includes('174mm'), 'samme trykkflate som REPORT_FIGURE_WIDTH_MM');
});

test('print.css forklarer hvorfor den ikke er den delte report-print.css', () => {
  // Uten denne begrunnelsen konsoliderer neste agent fila hjelpsomt bort
  // (plan §2.3 punkt 5). Testen er billig og holder kommentaren på plass.
  const css = readFileSync(fileURLToPath(new URL('../print.css', import.meta.url)), 'utf8');
  const head = css.slice(0, css.indexOf('*/'));
  assert.match(head, /assets\/css\/report-print\.css/);
  assert.match(head, /Konsolider/i);
  assert.match(head, /#cscPrintRoot/, 'klonemønsteret skal stå i hodekommentaren');
});

/* ================================================================== *
 * §1.5 — mekanisk kontroll: hele rapporten, for alle tre analysene
 * ================================================================== */

test('§1.5: buildReportHtml() inneholder ingen norsk tekst, for alle tre analysene', () => {
  const NORDIC = /[æåÆÅø]/g;
  const NORWEGIAN_WORDS = new RegExp(
    '\\b(' + [
      'ikke', 'kapasitet', 'armering', 'tverrsnitt', 'beregning', 'utnyttelse',
      'advarsel', 'merknad', 'bjelke', 'krumning', 'overdekning', 'lastvirkning',
      'avstand', 'bredde', 'verdi', 'tverrsnittet', 'armeringen',
    ].join('|') + ')\\b',
    'i',
  );

  for (const [state, result] of [
    [BEAM_STATE, BENDING],
    [BEAM_STATE, MC],
    [BEAM_STATE, NMDOM],
    [SLAB_STATE, SLAB_BENDING],
    [BEAM_STATE, runAllResult('bending')],
  ]) {
    const html = buildReportHtml(state, result);
    // Fjern SVG-en: `section-draw.js`/`charts.js` er B5 sitt ansvar og har sin
    // egen §1.5-test (plan §1.5 «Hvor den kjøres»). Denne testen dekker bare
    // det report.js selv skriver.
    const withoutSvg = html.replace(/<svg[\s\S]*?<\/svg>/g, '');
    for (const m of withoutSvg.matchAll(NORDIC)) {
      assert.fail(`nordisk tegn «${m[0]}» i rapporten (${result.analysis}): ...${withoutSvg.slice(Math.max(0, m.index - 40), m.index + 40)}...`);
    }
    const wordMatch = withoutSvg.match(NORWEGIAN_WORDS);
    assert.equal(wordMatch, null, `norsk ord i rapporten (${result.analysis}): «${wordMatch?.[0]}»`);
  }
});

/**
 * Regresjon: «λ (load path — secondary)» må bety det SAMME på papiret som på
 * skjermen. Rapporten skrev `rad.lambda` (faktoren ut til omhyllingen, 1,242)
 * under merkelappen, mens `ui.js` og figuren skrev `rad.eta` (0,805) under
 * nøyaktig samme merkelapp. En utnyttelse skal være ≤ 1 når den holder, så λ
 * er `eta`; faktoren har nå sin egen rad.
 */
test('rapporten: λ er den radielle UTNYTTELSEN, faktoren står på egen rad', async () => {
  const { radialUtilisation } = await import('../js/charts.js');
  // Standardfixturen har N_Ed = M_Ed = 0 (ingen last), og da finnes det ingen
  // stråle i det hele tatt. Lasten settes derfor eksplisitt.
  const loaded = clone(NMDOM);
  Object.assign(loaded.nm_domain, { N_Ed: -900e3, M_Ed: -250e6 });
  const dom = loaded.nm_domain;
  const rad = radialUtilisation(dom, dom.N_Ed / 1e3, dom.M_Ed / 1e6);
  assert.ok(rad.eta > 0 && rad.eta < 1, `forutsetningen: lasten ligger innenfor (eta=${rad.eta})`);
  assert.ok(Number.isFinite(rad.lambda) && rad.lambda > 1, 'forutsetningen: faktoren er endelig');

  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, loaded), 5);
  const rowOf = (label) => {
    const i = ch5.indexOf(label);
    assert.ok(i >= 0, `fant ikke raden «${label}»`);
    const m = /<t[dh][^>]*>([^<]*)</.exec(ch5.slice(i + label.length));
    assert.ok(m, `fant ingen verdi etter «${label}»`);
    return Number(m[1]);
  };
  assert.equal(rowOf('λ (load path'), Number(rad.eta.toFixed(3)));
  assert.equal(rowOf('Load factor to the envelope'), Number(rad.lambda.toFixed(3)));
  assert.ok(!ch5.includes('η_radial'), 'η er den vertikale utnyttelsen og skal ikke gjenbrukes her');
});
