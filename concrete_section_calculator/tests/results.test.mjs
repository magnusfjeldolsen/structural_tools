/**
 * results.test.mjs — kodetabellen, tersklene og tallformateringen.
 *
 * TESTENE HER ER VALGT ETTER HVILKEN FEIL DE FANGER, ikke etter dekning:
 *
 *  - En ny kode fra motoren uten norsk tekst ville dukket opp i UI-et som
 *    «Uspesifisert melding». `alle koder har en norsk melding` fanger det i
 *    test i stedet.
 *  - Engelsk pakketekst som siver ut som HOVEDMELDING ser ut som en grundig
 *    melding og oppdages derfor aldri ved lesing. Egen test.
 *  - `null` som blir «NaN» eller — verre — «0» er plan §5.4 sin hovedfelle.
 *  - To steder som definerer utnyttelsesterskler kan gi grønn pille og rød
 *    rapport for samme tall. Testen låser at det finnes ETT sted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DASH,
  toNum,
  fmtNumber,
  fmtLength,
  fmtArea,
  fmtStress,
  fmtForceKN,
  fmtMomentKNm,
  fmtStrainPermille,
  fmtCurvature,
  fmtRatio,
  fmtPercent,
  UTILISATION_THRESHOLDS,
  UTILISATION_LEVELS,
  utilisationStatus,
  HEADLINE_UTILISATION_LABEL,
  RADIAL_UTILISATION_LABEL,
  ENGINE_CODES,
  VALIDATION_CODES,
  RUNTIME_CODES,
  CODE_MESSAGES,
  messageForCode,
  describeWarning,
  describeWarnings,
  describeError,
  severityLabel,
  FAILURE_MODES,
  failureModeLabel,
  failureModeNote,
  CHECK_ORDER,
  CHECK_LABELS,
  checkRows,
  checkText,
  directionLabel,
  analysisLabel,
  sectionTypeLabel,
  lawLabel,
  compressionEdgeLabel,
  tensionEdgeLabel,
  analysisBlock,
  headlineUtilisation,
  momentCapacity,
  isUsable,
} from '../js/results.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const BENDING = fixture('result-bending-beam-300x600');
const MC = fixture('result-mc-beam-300x600');
const NMDOM = fixture('result-nmdomain-beam-300x600');

/* ================================================================== *
 * Kodetabellen
 * ================================================================== */

test('alle koder i plan §5.3 har en norsk melding', () => {
  for (const code of ENGINE_CODES) {
    const msg = CODE_MESSAGES[code];
    assert.ok(msg, `mangler norsk melding for «${code}»`);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 20, `meldingen for «${code}» er for kort til å hjelpe noen`);
    // En melding som bare gjentar koden er ingen oversettelse.
    assert.ok(!msg.includes(code), `meldingen for «${code}» er bare koden om igjen`);
  }
});

test('validerings- og kjøretidskodene er dekket av samme tabell', () => {
  for (const code of [...VALIDATION_CODES, ...RUNTIME_CODES]) {
    assert.ok(CODE_MESSAGES[code], `mangler norsk melding for «${code}»`);
  }
});

test('meldingene er norske, ikke engelske', () => {
  // Grov, men effektiv: en engelsk pakketekst ville hatt engelske småord og
  // ingen norske særtegn. Alle tekstene her skal ha minst ett norsk tegn eller
  // et norsk funksjonsord.
  const norwegian = /[æøåÆØÅ]|\b(er|ikke|som|ved|med|og|kan|skal|blir|ble)\b/;
  for (const [code, msg] of Object.entries(CODE_MESSAGES)) {
    assert.match(msg, norwegian, `«${code}» ser ikke ut som norsk`);
  }
});

test('en kjent kode gir tabellteksten, og detail forblir detail', () => {
  const w = describeWarning({
    code: 'no_convergence',
    severity: 'warning',
    message: 'Convergence not achieved',
    detail: 'Maximum number of iterations reached in _newton_solver',
  });
  assert.equal(w.message, CODE_MESSAGES.no_convergence);
  // Den engelske teksten skal finnes — men bare som detalj.
  assert.ok(w.detail.includes('_newton_solver'));
  assert.ok(!w.message.includes('Convergence'));
  assert.equal(w.severityLabel, 'Advarsel');
});

test('en kjent kode dupliserer ikke motorens message inn i detail', () => {
  const w = describeWarning({
    code: 'mc_truncated',
    message: 'noe motoren skrev',
    detail: 'rå pakketekst',
  });
  assert.equal(w.detail, 'rå pakketekst');
});

test('en UKJENT kode gir norsk plassholder, aldri den engelske teksten', () => {
  const w = describeWarning({
    code: 'some_new_upstream_code',
    severity: 'warning',
    message: 'Something went sideways in the integrator',
    detail: 'RuntimeWarning: invalid value encountered',
  });
  assert.ok(w.message.includes('some_new_upstream_code'), 'koden må være synlig');
  assert.ok(!w.message.includes('Something went sideways'));
  assert.ok(!w.message.includes('RuntimeWarning'));
  // Ingenting går tapt: begge rå tekster ligger i detail.
  assert.ok(w.detail.includes('Something went sideways'));
  assert.ok(w.detail.includes('RuntimeWarning'));
});

test('describeWarnings tåler tomt, manglende og rart', () => {
  assert.deepEqual(describeWarnings(undefined), []);
  assert.deepEqual(describeWarnings(null), []);
  assert.deepEqual(describeWarnings(BENDING.warnings), []);
  const [w] = describeWarnings([{}]);
  assert.equal(w.code, 'ukjent');
  assert.equal(w.hasDetail, false);
});

test('describeError merker alltid alvorlighet som feil', () => {
  const e = describeError({ code: 'axial_out_of_range', detail: 'ValueError: n out of range' });
  assert.equal(e.severity, 'error');
  assert.equal(e.severityLabel, 'Feil');
  assert.equal(e.message, CODE_MESSAGES.axial_out_of_range);
});

test('severityLabel dekker alle tre gradene i kontrakten', () => {
  assert.equal(severityLabel('info'), 'Merknad');
  assert.equal(severityLabel('warning'), 'Advarsel');
  assert.equal(severityLabel('error'), 'Feil');
});

test('messageForCode med fallback bruker fallback, ikke plassholderen', () => {
  assert.equal(messageForCode('helt_ny_kode', 'Egen tekst.'), 'Egen tekst.');
  assert.equal(messageForCode('no_convergence', 'Egen tekst.'), CODE_MESSAGES.no_convergence);
});

/* ================================================================== *
 * Tall og `null` (plan §5.4)
 * ================================================================== */

test('null blir tankestrek i ALLE formaterere', () => {
  const formatters = [
    fmtNumber,
    fmtLength,
    fmtArea,
    fmtStress,
    fmtForceKN,
    fmtMomentKNm,
    fmtStrainPermille,
    fmtCurvature,
    fmtRatio,
    fmtPercent,
  ];
  for (const f of formatters) {
    for (const v of [null, undefined, '', NaN, Infinity, -Infinity, 'tull']) {
      assert.equal(f(v), DASH, `${f.name}(${String(v)}) skal gi tankestrek`);
    }
  }
});

test('null blir ALDRI 0 — det er den farlige varianten', () => {
  assert.equal(toNum(null), null);
  assert.equal(toNum(''), null);
  assert.equal(toNum(undefined), null);
  assert.notEqual(fmtNumber(null, 0), '0');
  assert.equal(toNum(0), 0);
  assert.equal(fmtNumber(0, 1), '0,0');
});

test('x og x_over_d kan legitimt være null og skal vises som tankestrek', () => {
  // Nær rent trykk setter `engine.py` begge til null (plan §5.2).
  const b = { ...BENDING.bending, x: null, x_over_d: null, chi_y: null };
  assert.equal(fmtLength(b.x, 1), DASH);
  assert.equal(fmtRatio(b.x_over_d, 3), DASH);
  assert.equal(fmtCurvature(b.chi_y), DASH);
});

test('norsk desimalkomma, og ingen «-0»', () => {
  assert.equal(fmtNumber(3.14159, 2), '3,14');
  assert.equal(fmtNumber(-3.14159, 2), '-3,14');
  assert.equal(fmtNumber(-0.0001, 2), '0,00');
  assert.equal(fmtNumber(-0, 1), '0,0');
});

test('enhetene konverteres slik rapporten viser dem', () => {
  assert.equal(fmtForceKN(-4010438.409731036, 1), '-4010,4');   // N -> kN
  assert.equal(fmtMomentKNm(215006759.18601915, 1), '215,0');   // Nmm -> kNm
  assert.equal(fmtStrainPermille(-0.0035, 2), '-3,50');         // - -> ‰
  assert.equal(fmtCurvature(-4.065559497688457e-5, 2), '-40,66'); // 1/mm -> 1e-6/mm
  assert.equal(fmtPercent(0.93, 1), '93,0');
});

/* ================================================================== *
 * Terskler — ETT sted (plan §7)
 * ================================================================== */

test('tersklene er konsistente og ordnet', () => {
  assert.ok(UTILISATION_THRESHOLDS.ok < UTILISATION_THRESHOLDS.over);
  assert.equal(UTILISATION_THRESHOLDS.over, 1.0, 'bruddgrensen er 1,0, ikke en smakssak');
  assert.ok(Object.isFrozen(UTILISATION_THRESHOLDS), 'tersklene skal ikke kunne endres av en konsument');
});

test('utilisationStatus følger tersklene, og bare dem', () => {
  const t = UTILISATION_THRESHOLDS;
  assert.equal(utilisationStatus(0).level, 'ok');
  assert.equal(utilisationStatus(t.ok).level, 'ok', 'grensa selv er fortsatt ok');
  assert.equal(utilisationStatus(t.ok + 1e-9).level, 'high');
  assert.equal(utilisationStatus(t.over).level, 'high', '1,0 eksakt er ikke overskredet');
  assert.equal(utilisationStatus(t.over + 1e-9).level, 'over');
  assert.equal(utilisationStatus(2.5).level, 'over');
});

test('manglende utnyttelse er UBESVART, ikke bestått', () => {
  for (const v of [null, undefined, NaN, '']) {
    assert.equal(utilisationStatus(v).level, 'unknown');
  }
  assert.notEqual(utilisationStatus(null).level, 'ok');
});

test('hvert nivå har både farge og klasser, og fargene er ulike', () => {
  const levels = Object.values(UTILISATION_LEVELS);
  for (const l of levels) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(l.color), `${l.level} mangler en gyldig hex-farge`);
    assert.ok(l.classes.length > 0, `${l.level} mangler pilleklasser`);
    assert.ok(l.label.length > 0);
  }
  const colors = new Set(levels.map((l) => l.color));
  assert.equal(colors.size, levels.length, 'to nivåer med samme farge er ikke to nivåer');
});

test('nøkkelen i UTILISATION_LEVELS er lik nivånavnet den bærer', () => {
  for (const [key, val] of Object.entries(UTILISATION_LEVELS)) {
    assert.equal(key, val.level);
  }
});

test('hovedtallet og lastveitallet har ulike, selvforklarende merkelapper', () => {
  assert.notEqual(HEADLINE_UTILISATION_LABEL, RADIAL_UTILISATION_LABEL);
  assert.ok(HEADLINE_UTILISATION_LABEL.includes('M_Rd'), 'formelen skal stå i merkelappen');
  assert.match(RADIAL_UTILISATION_LABEL, /lastvei/i, 'λ må merkes som lastvei, ikke som η');
});

/* ================================================================== *
 * Bruddform og kontroller
 * ================================================================== */

test('alle fire failure_mode-verdiene har norsk navn og en forklaring', () => {
  const modes = ['concrete_crushing', 'steel_rupture', 'over_reinforced', 'compression_no_tension'];
  for (const m of modes) {
    assert.ok(FAILURE_MODES[m], `mangler ${m}`);
    assert.ok(failureModeLabel(m).length > 3);
    assert.ok(failureModeNote(m).length > 20, `${m} mangler forklaring`);
  }
  const labels = new Set(modes.map(failureModeLabel));
  assert.equal(labels.size, modes.length, 'to bruddformer med samme navn');
});

test('ukjent bruddform skjules ikke', () => {
  assert.match(failureModeLabel('noe_nytt'), /Ukjent bruddform/);
  assert.equal(failureModeLabel(null), DASH);
});

test('fixturens bruddform er oversatt', () => {
  assert.equal(failureModeLabel(BENDING.bending.failure_mode), FAILURE_MODES.concrete_crushing.label);
});

test('kontrolltabellen har fast rekkefølge og norske navn', () => {
  const rows = checkRows(BENDING.checks);
  assert.deepEqual(rows.map((r) => r.key), [...CHECK_ORDER]);
  for (const r of rows) {
    assert.equal(r.label, CHECK_LABELS[r.key]);
    assert.equal(r.text, 'OK');
  }
  assert.equal(rows[rows.length - 1].key, 'all_ok', 'den samlede vurderingen står sist');
});

test('en kontroll motoren ikke rapporterte er ubesvart, ikke bestått', () => {
  const rows = checkRows({ as_min_ok: false });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.as_min_ok.text, 'Ikke OK');
  assert.equal(byKey.all_ok.text, DASH);
  assert.equal(checkText(undefined), DASH);
});

/* ================================================================== *
 * Merkelapper
 * ================================================================== */

test('retningsnavnene sier hvilken kant som er i trykk', () => {
  assert.match(directionLabel('sagging'), /overkant/);
  assert.match(directionLabel('hogging'), /underkant/);
  assert.equal(directionLabel('noe'), DASH);
});

test('trykkanten følger theta — ikke ordet «overkant» ukritisk', () => {
  assert.equal(compressionEdgeLabel(0), 'overkant');
  assert.equal(compressionEdgeLabel(Math.PI), 'underkant');
  assert.equal(tensionEdgeLabel(0), 'underkant');
  assert.equal(tensionEdgeLabel(Math.PI), 'overkant');
  assert.equal(compressionEdgeLabel(null), DASH);
});

test('analyse- og tverrsnittsnavn er norske', () => {
  assert.equal(analysisLabel('bending'), 'Bøyekapasitet');
  assert.equal(analysisLabel('moment_curvature'), 'Moment–krumning');
  assert.equal(analysisLabel('nm_domain'), 'M–N-diagram');
  assert.match(sectionTypeLabel('slab'), /per meter/);
});

test('lovnavnene kommer fra materials.js, ikke fra en avskrift', () => {
  assert.match(lawLabel('parabolarectangle'), /Parabel/);
  assert.match(lawLabel('elasticplastic'), /fasthetsøkning/);
  // En ukjent lov vises som den er, ikke som tankestrek — da ser man hva som skjedde.
  assert.equal(lawLabel('sargin'), 'sargin');
});

/* ================================================================== *
 * Oppslag i resultatet
 * ================================================================== */

test('hovedtallet er den VERTIKALE utnyttelsen i alle tre analysene', () => {
  assert.equal(headlineUtilisation(BENDING), BENDING.bending.utilisation);
  assert.equal(headlineUtilisation(MC), MC.moment_curvature.utilisation);
  assert.equal(headlineUtilisation(NMDOM), NMDOM.nm_domain.utilisation);
  // Samme snitt og last ⇒ samme η. Det er hele poenget med definisjonen.
  assert.equal(headlineUtilisation(BENDING), headlineUtilisation(MC));
  assert.equal(headlineUtilisation(MC), headlineUtilisation(NMDOM));
});

test('momentkapasiteten hentes fra riktig felt i hver analyse', () => {
  assert.equal(momentCapacity(BENDING), BENDING.bending.M_Rd);
  assert.equal(momentCapacity(MC), MC.moment_curvature.M_Rd);
  // `nm_domain` bærer den som M_Rd_at_N — samme tall, annet navn.
  assert.equal(momentCapacity(NMDOM), NMDOM.nm_domain.M_Rd_at_N);
  assert.equal(momentCapacity(BENDING), momentCapacity(NMDOM));
});

test('analysisBlock tåler et resultat uten analyse', () => {
  assert.equal(analysisBlock(null), null);
  assert.equal(analysisBlock({}), null);
  assert.equal(analysisBlock({ analysis: 'bending' }), null);
});

test('{ok:false} er et gyldig svar, men ikke et brukbart resultat', () => {
  assert.equal(isUsable(BENDING), true);
  assert.equal(isUsable({ ok: false, error: { code: 'axial_out_of_range' } }), false);
  assert.equal(isUsable(null), false);
});
