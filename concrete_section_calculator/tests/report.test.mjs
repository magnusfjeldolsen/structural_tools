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
 * TRE FEIL DISSE TESTENE FINNES FOR
 *
 *  1. Et kapittel som glir opp eller ned. Hver enkelt tabell ser fortsatt
 *     riktig ut, så feilen er usynlig ved lesing. `data-sec` gjør den målbar.
 *  2. Feil plott for analysen — eller ingen plott. Moment–krumning som viser
 *     M–N-omhyllingen er en rapport som lyver med et korrekt diagram.
 *  3. Engelsk pakketekst eller «NaN»/«undefined» på papiret. Begge deler er
 *     ting man oppdager når rapporten er sendt, ikke før.
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

/** Referansebjelken, plan §3.6. Samme tilstand som `payload.test.mjs` bruker. */
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
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
  loads: { N_Ed: 0, M_Ed: 0 },
  direction: 'sagging',
  analysis: 'bending',
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  doc: { project: 'Testprosjekt', title: 'Bjelke B1', author: 'MFO', date: '16.09.2026', note: '' },
  result: null,
};

/** Referanseplata 1000×200, Ø12 c/c 113. */
const SLAB_STATE = {
  ...BEAM_STATE,
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25,
  cover_side: 25,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
  doc: { ...BEAM_STATE.doc, title: 'Dekke D1' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

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

test('kapitteloverskriftene er nummererte og norske', () => {
  const html = buildReportHtml(BEAM_STATE, BENDING);
  assert.match(html, /<h3>1\. Dokumentasjon<\/h3>/);
  assert.match(html, /<h3>2\. Tverrsnitt og materialer<\/h3>/);
  assert.match(html, /<h3>3\. Armering<\/h3>/);
  assert.match(html, /<h3>4\. Lastvirkning<\/h3>/);
  assert.match(html, /<h3>5\. Resultat<\/h3>/);
  assert.match(html, /<h3>6\. Plott/);
  assert.match(html, /<h3>7\. Forutsetninger og metode<\/h3>/);
});

test('topplinja bærer modulnavn og versjon fra meta.js', () => {
  const html = buildReportHtml(BEAM_STATE, BENDING);
  assert.ok(html.includes(MODULE_NAME));
  assert.ok(html.includes(`v${MODULE_VERSION}`));
  assert.ok(html.includes('Bjelke B1'), 'tittelen fra doc skal stå i topplinja');
  assert.ok(html.includes('Testprosjekt'));
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
  assert.match(mc, /moment–krumning/i);

  const dom = chapterBody(buildReportHtml(BEAM_STATE, NMDOM), 6);
  assert.ok(dom.includes('data-role="envelope"'), 'M–N: kapasitetsomhyllingen');
  assert.ok(!dom.includes('data-role="curve"'));
  assert.match(dom, /M–N/);
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
  assert.match(ch6, /rent trykk/);
});

test('uten resultat er kapittel 5 og 6 ærlige om at ingenting er beregnet', () => {
  const html = buildReportHtml(BEAM_STATE, null);
  assert.match(chapterBody(html, 5), /Ingen beregning er kjørt/);
  assert.match(chapterBody(html, 6), /tegnes når beregningen er utført/);
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
  assert.match(ch3, /d = d_eff, strekkarmering alene/);
  assert.match(ch3, /d_eff,all/);
  assert.match(ch3, /A_s i strekk/);
  assert.ok(ch3.includes('550,0'), 'EC2-d fra motoren skal stå');
  assert.ok(ch3.includes('453,0'), 'det arealvektede tallet skal stå ved siden av');
  // Valget skal være synlig, ikke skjult.
  assert.match(ch3, /strekkarmeringen/);
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

test('plata merkes «per meter» der mengdene er per meter', () => {
  const ch3 = chapterBody(buildReportHtml(SLAB_STATE, SLAB_BENDING), 3);
  assert.match(ch3, /per meter/);
  const beam3 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 3);
  assert.ok(!beam3.includes('per meter'), 'en bjelke regnes ikke per meter');
});

/* ================================================================== *
 * Last og resultat
 * ================================================================== */

test('lastkapitlet sier fortegnskonvensjonen og aksialintervallet', () => {
  const ch4 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 4);
  assert.match(ch4, /trykk negativ/i);
  assert.match(ch4, /størrelse i analysert retning/i);
  assert.match(ch4, /N_min/);
  assert.match(ch4, /N_max/);
  assert.ok(ch4.includes('-4010,4'), 'N_min i kN');
});

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

test('resultatkapitlet merker trykkanten etter retningen, ikke som «overkant»', () => {
  const sag = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(sag, /ε_c ved overkant/);

  const hog = clone(BENDING);
  hog.meta.theta = Math.PI;
  hog.meta.direction = 'hogging';
  const html = buildReportHtml({ ...BEAM_STATE, direction: 'hogging' }, hog);
  assert.match(chapterBody(html, 5), /ε_c ved underkant/);
  assert.ok(!chapterBody(html, 5).includes('ε_c ved overkant'));
});

test('kontrolltabellen står i resultatkapitlet', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.match(ch5, /Minimumsarmering/);
  assert.match(ch5, /Duktilitet/);
  assert.match(ch5, /Samlet vurdering/);
  assert.match(ch5, /Trykkbrudd i betongen/, 'bruddformen skal være oversatt');
});

test('den radielle λ er merket som sekundær lastvei, ikke som η', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, NMDOM), 5);
  assert.match(ch5, /lastvei/);
  assert.match(ch5, /sekundær/i);
  assert.match(ch5, /η = M_Ed \/ M_Rd\(N_Ed\)/);
  // Bøyekapasitet har ingen omhylling og skal derfor ikke nevne λ i det hele tatt.
  assert.ok(!chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5).includes('lastvei'));
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
  assert.ok(ch5.includes('220,4'), 'x ved N_Ed');
  assert.ok(ch5.includes('0,403'), 'x/d ved N_Ed');
  assert.match(ch5, /ε_s,maks/);
  assert.match(ch5, /κ_y/);
  assert.match(ch5, /Trykkbrudd i betongen/, 'bruddformen skal være oversatt');
  assert.match(ch5, /Tøyninger og spenninger per armeringslag ved N_Ed/);
  assert.ok(ch5.includes('434,8'), 'spenningen per lag');
});

test('tøyningsplanet for M–N merkes uttrykkelig som «ved N_Ed»', () => {
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, domainWithFailureState()), 5);
  assert.match(ch5, /Trykksonehøyde x \[mm\] ved N_Ed/);
  assert.match(ch5, /ikke et vilkårlig punkt på omhyllingen/);
  assert.ok(ch5.includes('-500,0'), 'N_Ed skal stå i merknaden, i kN');
  // Bøyeberegningen trenger ingen slik påminnelse — der er det selvsagt.
  const bend5 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 5);
  assert.ok(!bend5.includes('vilkårlig punkt'));
  assert.ok(!bend5.includes('Trykksonehøyde x [mm] ved N_Ed'));
  assert.match(bend5, /Trykksonehøyde x \[mm\]/);
});

test('mangler omhyllingen bruddtilstanden, faller kapitlet pent tilbake', () => {
  // Fixturen har ikke de åtte feltene — rapporten skal ikke finne på tall.
  const ch5 = chapterBody(buildReportHtml(BEAM_STATE, NMDOM), 5);
  assert.ok(!ch5.includes('Trykksonehøyde'));
  assert.match(ch5, /Punkter på omhyllingen/, 'resten av kapitlet står som før');
});

test('mc_endpoint_mismatch vises som merknad, ikke som ukjent kode', () => {
  const res = clone(MC);
  res.warnings = [
    {
      code: 'mc_endpoint_mismatch',
      severity: 'info',
      message: 'ignorert',
      detail: 'last point differs from M_Rd by 3.2 permille',
    },
  ];
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, res), 7);
  assert.ok(ch7.includes(CODE_MESSAGES.mc_endpoint_mismatch));
  assert.ok(ch7.includes('Merknad'));
  assert.ok(!ch7.includes('Uspesifisert melding'), 'koden skal være kjent nå');
  assert.ok(ch7.includes('<code>mc_endpoint_mismatch</code>'));
});

test('et {ok:false}-svar rapporteres på norsk, ikke som rå ValueError', () => {
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
  assert.ok(ch5.includes(CODE_MESSAGES.axial_out_of_range));
  assert.ok(ch5.includes('ValueError'), 'rå tekst skal være tilgjengelig som detalj');
  const msgIdx = ch5.indexOf(CODE_MESSAGES.axial_out_of_range);
  const detIdx = ch5.indexOf('ValueError');
  assert.ok(msgIdx < detIdx, 'den norske meldingen er hovedmeldingen');
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
  assert.match(ch7, /Parabel–rektangel/, 'arbeidsdiagrammet');
  assert.match(ch7, /1992-1-1/, 'EC2-referansene');
});

test('scipy-substitusjonen står som en substitusjon, ikke som en fotnote', () => {
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(ch7, /erstattet av en verifisert numpy-ekvivalent/i);
  assert.match(ch7, /lu_factor/);
  assert.match(ch7, /0,000e\+00/, 'ekvivalensen er målt, og målingen skal stå');
});

test('den utsmurte stripa forklares for plata', () => {
  const slab7 = chapterBody(buildReportHtml(SLAB_STATE, SLAB_BENDING), 7);
  assert.match(slab7, /utsmurt/i);
  assert.match(slab7, /0,17 %/, 'verifikasjonen mot diskrete jern');
  // Bjelken får den motsatte opplysningen — diskrete jern — og ikke stripa som sin modell.
  const beam7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(beam7, /Diskrete jern/);
});

test('subtract_bar_area beskrives med den konsekvensen valget har', () => {
  const off = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(off, /subtract_bar_area = av/);
  assert.match(off, /usikker side/);

  const on = clone(BENDING);
  on.meta.subtract_bar_area = true;
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, on), 7);
  assert.match(ch7, /subtract_bar_area = på/);
  assert.match(ch7, /punsjert/);
});

test('ALLE advarsler står i kapittel 7, på norsk, med rå tekst som detalj', () => {
  const res = clone(BENDING);
  res.warnings = [
    {
      code: 'bar_in_compression_zone',
      severity: 'warning',
      message: 'ignorert',
      detail: 'Estimated error 2.1 kNm on the unsafe side',
    },
    {
      code: 'mc_truncated',
      severity: 'info',
      message: 'ignorert',
      detail: 'StructuralCodesWarning: convergence not achieved',
    },
  ];
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, res), 7);
  assert.ok(ch7.includes(CODE_MESSAGES.bar_in_compression_zone));
  assert.ok(ch7.includes(CODE_MESSAGES.mc_truncated));
  assert.ok(ch7.includes('Advarsel'));
  assert.ok(ch7.includes('Merknad'));
  assert.ok(ch7.includes('Estimated error 2.1 kNm'), 'detaljen skal være tilgjengelig');
  assert.ok(ch7.includes('<code>bar_in_compression_zone</code>'), 'koden er sporet');
});

test('uten advarsler sier rapporten det uttrykkelig', () => {
  const ch7 = chapterBody(buildReportHtml(BEAM_STATE, BENDING), 7);
  assert.match(ch7, /Ingen advarsler/);
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
  assert.match(html, /Trykksonehøyde x \[mm\]/);
  assert.match(html, /A_s,min/);
});

test('ingen rapportvariant lekker NaN, undefined eller [object Object]', () => {
  for (const [state, result] of [
    [BEAM_STATE, BENDING],
    [BEAM_STATE, MC],
    [BEAM_STATE, NMDOM],
    [SLAB_STATE, SLAB_BENDING],
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
  assert.match(html, /Ingen armeringslag lagt inn/);
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
