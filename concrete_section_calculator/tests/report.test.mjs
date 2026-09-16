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
  stirrup_dia: 0,
  cover_side: 40,
  spacing: { k1: 1.0, k2: 5.0, d_g: 16 },
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50, dc_auto: false }],
  combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, direction: 'sagging' }],
  activeCombo: 'C1',
  direction: 'sagging',
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

test('mangler motoren d_eff_all, blir det tankestrek — ikke et oppdiktet tall', () => {
  const ch3 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.ok(ch3.includes('d_eff,all'));
  assert.ok(ch3.includes(DASH));
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

test('lastkapitlet sier fortegnskonvensjonen og aksialintervallet', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 4);
  assert.match(ch4, /compression negative/i);
  assert.match(ch4, /magnitude in the analysed direction/i);
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

test('resultatboksen bærer status fra results.js sine terskler', () => {
  const low = buildReportHtml(BEAM_STATE, BENDING);
  assert.ok(low.includes('data-level="ok"'));
  assert.ok(low.includes(UTILISATION_LEVELS.ok.label));

  const over = clone(BENDING);
  over.bending.M_Ed = 300e6;
  over.bending.utilisation = 300e6 / over.bending.M_Rd;
  const html = buildReportHtml(BEAM_STATE, over);
  assert.equal(utilisationStatus(over.bending.utilisation).level, 'over');
  assert.ok(html.includes('data-level="over"'));
  assert.ok(html.includes(UTILISATION_LEVELS.over.label));
});

test('resultatkapitlet merker trykkanten etter retningen, ikke som «top face» ukritisk', () => {
  const sag = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(sag, /ε_c at top face/);

  const hog = clone(BENDING);
  hog.meta.theta = Math.PI;
  hog.meta.direction = 'hogging';
  const html = buildReportHtml({ ...BEAM_STATE, direction: 'hogging' }, hog);
  assert.match(chapterBody(html, 5), /ε_c at bottom face/);
  assert.ok(!chapterBody(html, 5).includes('ε_c at top face'));
});

test('kontrolltabellen står i resultatkapitlet', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(ch5, /Minimum reinforcement/);
  assert.match(ch5, /Ductility/);
  assert.match(ch5, /Overall assessment/);
  assert.match(ch5, /Concrete crushing/, 'bruddformen skal være oversatt');
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
