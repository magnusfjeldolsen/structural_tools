/**
 * results.test.mjs — kodetabellen, tersklene og tallformateringen.
 *
 * TESTENE HER ER VALGT ETTER HVILKEN FEIL DE FANGER, ikke etter dekning:
 *
 *  - En ny kode fra motoren uten engelsk tekst ville dukket opp i UI-et som
 *    «Unspecified message». `alle koder har en engelsk melding` fanger det i
 *    test i stedet.
 *  - Rå pakketekst som siver ut som HOVEDMELDING ser ut som en grundig melding
 *    og oppdages derfor aldri ved lesing. Egen test.
 *  - `null` som blir «NaN» eller — verre — «0» er plan §5.4 sin hovedfelle.
 *  - To steder som definerer utnyttelsesterskler kan gi grønn pille og rød
 *    rapport for samme tall. Testen låser at det finnes ETT sted.
 *  - Endringsrunde 2 (§1) oversatte ALT brukersynlig til engelsk. §1.5 sin
 *    mekaniske sjekk kjøres her rekursivt over samtlige tabeller i §1.3, slik
 *    at en glemt norsk streng ikke overlever neste gang noen legger til en
 *    kode uten å lese hele fila.
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
  SEVERITY_LABELS,
  FAILURE_MODES,
  failureModeLabel,
  failureModeNote,
  CHECK_ORDER,
  CHECK_LABELS,
  checkRows,
  checkText,
  directionLabel,
  directionFromTheta,
  analysisLabel,
  ANALYSIS_LABELS,
  sectionTypeLabel,
  SECTION_TYPE_LABELS,
  lawLabel,
  compressionEdgeLabel,
  tensionEdgeLabel,
  analysisBlock,
  failureState,
  failureStateIsAtNEd,
  headlineUtilisation,
  momentCapacity,
  allCombinations,
  governingCombo,
  comboLabel,
  isUsable,
  shearGoverningCombo,
  shearHeadlineUtilisation,
  SHEAR_UTILISATION_LABEL,
  SHEAR_GOVERNING_MODE_LABELS,
  shearGoverningModeLabel,
} from '../js/results.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const BENDING = fixture('result-bending-beam-300x600');
const MC = fixture('result-mc-beam-300x600');
const NMDOM = fixture('result-nmdomain-beam-300x600');

/* ================================================================== *
 * Kodetabellen
 * ================================================================== */

test('alle koder i plan §5.3 har en engelsk melding', () => {
  for (const code of ENGINE_CODES) {
    const msg = CODE_MESSAGES[code];
    assert.ok(msg, `mangler engelsk melding for «${code}»`);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 20, `meldingen for «${code}» er for kort til å hjelpe noen`);
    // En melding som bare gjentar koden er ingen oversettelse.
    assert.ok(!msg.includes(code), `meldingen for «${code}» er bare koden om igjen`);
  }
});

test('validerings- og kjøretidskodene er dekket av samme tabell', () => {
  for (const code of [...VALIDATION_CODES, ...RUNTIME_CODES]) {
    assert.ok(CODE_MESSAGES[code], `mangler engelsk melding for «${code}»`);
  }
});

test('de nye kodene fra endringsrunde 2 er med (§1.3, §2.4, §5)', () => {
  assert.ok(VALIDATION_CODES.includes('insufficient_layer_spacing'));
  assert.ok(RUNTIME_CODES.includes('document_not_recognised'));
  assert.ok(RUNTIME_CODES.includes('document_field_ignored'));
  assert.ok(RUNTIME_CODES.includes('document_field_defaulted'));
  // §1.4 sine ordrette tekster.
  assert.equal(
    CODE_MESSAGES.insufficient_layer_spacing,
    'Clear distance between reinforcement layers is below the EC2 8.2(2) minimum.'
  );
  assert.equal(
    CODE_MESSAGES.document_not_recognised,
    'This is not a concrete section calculator file.'
  );
  assert.equal(CODE_MESSAGES.document_field_ignored, 'An unknown field in the file was ignored.');
  assert.equal(
    CODE_MESSAGES.document_field_defaulted,
    'A missing field in the file was filled with its default.'
  );
  assert.equal(
    CODE_MESSAGES.axial_out_of_range,
    "N_Ed is outside the section's axial capacity [N_min, N_max]."
  );
  assert.equal(
    CODE_MESSAGES.layers_overlap,
    'Reinforcement layers overlap. The calculation is still valid, but the input is ' +
      'almost certainly wrong.'
  );
});

/**
 * Skjær og fortegn, endringsrunde 4 (§4.1b, §4.2, §4.4, §4.5, §2). Åtte nye
 * koder totalt: to fra motoren (`shear_asl_ambiguous`, `shear_not_evaluated`),
 * seks fra `section.js` sin skjærvalidering, og `analysis_forced_to_nm_domain`
 * fra `serialize.js`. Den generiske testen over («alle koder ... har en
 * engelsk melding») dekker dem allerede — denne testen låser i tillegg at de
 * faktisk STÅR i riktig kodeliste, som er nøyaktig det plan §10 punkt 3 ber om.
 */
test('de nye kodene fra endringsrunde 4 er med, i riktig liste (§4.4, §4.5, §2)', () => {
  assert.ok(ENGINE_CODES.includes('shear_asl_ambiguous'));
  assert.ok(ENGINE_CODES.includes('shear_not_evaluated'));
  assert.ok(VALIDATION_CODES.includes('stirrup_spacing_exceeds_max'));
  assert.ok(VALIDATION_CODES.includes('asw_below_minimum'));
  assert.ok(VALIDATION_CODES.includes('stirrup_legs_spacing_exceeds_max'));
  assert.ok(VALIDATION_CODES.includes('invalid_strut_angle'));
  assert.ok(VALIDATION_CODES.includes('stirrup_alpha_unsupported'));
  assert.ok(VALIDATION_CODES.includes('stirrup_mixed_fywk'));
  assert.ok(RUNTIME_CODES.includes('analysis_forced_to_nm_domain'));
  // Ingen av dem skal lekke som «Unspecified message» — det er nettopp feilen
  // testen finnes for.
  for (const code of [
    'shear_asl_ambiguous', 'shear_not_evaluated', 'stirrup_spacing_exceeds_max',
    'asw_below_minimum', 'stirrup_legs_spacing_exceeds_max', 'invalid_strut_angle',
    'stirrup_alpha_unsupported', 'stirrup_mixed_fywk', 'analysis_forced_to_nm_domain',
  ]) {
    assert.ok(!messageForCode(code).includes('Unspecified message'), `«${code}» mangler tekst`);
  }
});

test('meldingene er engelske, ikke norske', () => {
  // Grov, men effektiv: en norsk tekst ville hatt norske særtegn eller norske
  // funksjonsord. Ingen av meldingene her skal ha noe av det.
  const norwegian = /[æøåÆØÅ]|\b(er|ikke|som|ved|med|og|kan|skal|blir|ble)\b/i;
  for (const [code, msg] of Object.entries(CODE_MESSAGES)) {
    assert.doesNotMatch(msg, norwegian, `«${code}» ser ut som norsk`);
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
  // Den rå pakketeksten skal finnes — men bare som detalj.
  assert.ok(w.detail.includes('_newton_solver'));
  assert.ok(!w.message.includes('Convergence not achieved'));
  assert.equal(w.severityLabel, 'Warning');
});

test('en kjent kode dupliserer ikke motorens message inn i detail', () => {
  const w = describeWarning({
    code: 'mc_truncated',
    message: 'something the engine wrote',
    detail: 'raw package text',
  });
  assert.equal(w.detail, 'raw package text');
});

test('en UKJENT kode gir en plassholder, aldri motorens egen tekst', () => {
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
  assert.equal(w.code, 'unknown');
  assert.equal(w.hasDetail, false);
});

test('describeError merker alltid alvorlighet som feil', () => {
  const e = describeError({ code: 'axial_out_of_range', detail: 'ValueError: n out of range' });
  assert.equal(e.severity, 'error');
  assert.equal(e.severityLabel, 'Error');
  assert.equal(e.message, CODE_MESSAGES.axial_out_of_range);
});

test('severityLabel dekker alle tre gradene i kontrakten', () => {
  assert.equal(severityLabel('info'), 'Note');
  assert.equal(severityLabel('warning'), 'Warning');
  assert.equal(severityLabel('error'), 'Error');
  assert.equal(SEVERITY_LABELS.info, 'Note');
});

test('messageForCode med fallback bruker fallback, ikke plassholderen', () => {
  assert.equal(messageForCode('helt_ny_kode', 'Custom text.'), 'Custom text.');
  assert.equal(messageForCode('no_convergence', 'Custom text.'), CODE_MESSAGES.no_convergence);
});

/* ================================================================== *
 * Lastkombinasjoner i advarselen (endringsrunde 2, §4.4)
 * ================================================================== */

test('combo_name settes foran teksten når motoren merker advarselen med en kombinasjon', () => {
  const w = describeWarning({
    code: 'axial_out_of_range',
    severity: 'warning',
    combo: 'C3',
    combo_name: 'ULS 3',
    detail: 'n=-5e6 outside [n_min, n_max]',
  });
  assert.ok(w.message.startsWith('ULS 3: '), `«${w.message}» mangler kombinasjonsnavnet foran`);
  assert.ok(w.message.includes(CODE_MESSAGES.axial_out_of_range));
  assert.equal(w.combo, 'C3');
  assert.equal(w.combo_name, 'ULS 3');
});

test('mangler combo_name, brukes combo (id-en) i stedet', () => {
  const w = describeWarning({ code: 'axial_out_of_range', combo: 'C1', combo_name: '' });
  assert.ok(w.message.startsWith('C1: '));
});

test('verken combo eller combo_name, ingen prefiks — teksten er identisk med kodetabellen', () => {
  const w = describeWarning({ code: 'axial_out_of_range' });
  assert.equal(w.message, CODE_MESSAGES.axial_out_of_range);
  assert.equal(w.combo, null);
  assert.equal(w.combo_name, null);
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
  assert.equal(fmtNumber(0, 1), '0.0');
});

test('x og x_over_d kan legitimt være null og skal vises som tankestrek', () => {
  // Nær rent trykk setter `engine.py` begge til null (plan §5.2).
  const b = { ...BENDING.bending, x: null, x_over_d: null, chi_y: null };
  assert.equal(fmtLength(b.x, 1), DASH);
  assert.equal(fmtRatio(b.x_over_d, 3), DASH);
  assert.equal(fmtCurvature(b.chi_y), DASH);
});

test('engelsk desimalpunktum, og ingen «-0»', () => {
  assert.equal(fmtNumber(3.14159, 2), '3.14');
  assert.equal(fmtNumber(-3.14159, 2), '-3.14');
  assert.equal(fmtNumber(-0.0001, 2), '0.00');
  assert.equal(fmtNumber(-0, 1), '0.0');
  // fmtNumber skal ALDRI konvertere punktum til komma lenger (§0 punkt 1, §10 B4 punkt 1).
  assert.ok(!fmtNumber(1234.5, 1).includes(','));
});

test('enhetene konverteres slik rapporten viser dem', () => {
  assert.equal(fmtForceKN(-4010438.409731036, 1), '-4010.4');   // N -> kN
  assert.equal(fmtMomentKNm(215006759.18601915, 1), '215.0');   // Nmm -> kNm
  assert.equal(fmtStrainPermille(-0.0035, 2), '-3.50');         // - -> ‰
  assert.equal(fmtCurvature(-4.065559497688457e-5, 2), '-40.66'); // 1/mm -> 1e-6/mm
  assert.equal(fmtPercent(0.93, 1), '93.0');
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
  assert.match(RADIAL_UTILISATION_LABEL, /load path/i, 'λ må merkes som en lastvei, ikke som η');
});

/* ================================================================== *
 * Bruddform og kontroller
 * ================================================================== */

test('alle fire failure_mode-verdiene har et engelsk navn og en forklaring', () => {
  const modes = ['concrete_crushing', 'steel_rupture', 'over_reinforced', 'compression_no_tension'];
  for (const m of modes) {
    assert.ok(FAILURE_MODES[m], `mangler ${m}`);
    assert.ok(failureModeLabel(m).length > 3);
    assert.ok(failureModeNote(m).length > 20, `${m} mangler forklaring`);
  }
  const labels = new Set(modes.map(failureModeLabel));
  assert.equal(labels.size, modes.length, 'to bruddformer med samme navn');
});

test('§1.4 sine ordrette failure_mode-navn', () => {
  assert.equal(FAILURE_MODES.concrete_crushing.label, 'Concrete crushing');
  assert.equal(FAILURE_MODES.steel_rupture.label, 'Steel rupture');
  assert.equal(FAILURE_MODES.over_reinforced.label, 'Over-reinforced — steel does not yield');
  assert.equal(FAILURE_MODES.compression_no_tension.label, 'Compression only — no tension zone');
});

test('ukjent bruddform skjules ikke', () => {
  assert.match(failureModeLabel('noe_nytt'), /Unknown failure mode/);
  assert.equal(failureModeLabel(null), DASH);
});

test('fixturens bruddform er oversatt', () => {
  assert.equal(failureModeLabel(BENDING.bending.failure_mode), FAILURE_MODES.concrete_crushing.label);
});

test('kontrolltabellen har fast rekkefølge og engelske navn', () => {
  const rows = checkRows(BENDING.checks);
  assert.deepEqual(rows.map((r) => r.key), [...CHECK_ORDER]);
  for (const r of rows) {
    assert.equal(r.label, CHECK_LABELS[r.key]);
    assert.equal(r.text, 'OK');
  }
  assert.equal(rows[rows.length - 1].key, 'all_ok', 'den samlede vurderingen står sist');
});

test('§1.4 sine ordrette CHECK_LABELS', () => {
  assert.equal(CHECK_LABELS.as_min_ok, 'Minimum reinforcement A_s,min (EC2 9.2.1.1)');
  assert.equal(CHECK_LABELS.ductility_ok, 'Ductility — tension reinforcement yields at failure');
});

/**
 * De TRE nye skjærkontrollene (endringsrunde 4 §4.3/§10 punkt 2). Uten dem i
 * `CHECK_ORDER` emitterer `checkRows()` dem aldri — motorens `checks.shear_ok`
 * osv. ville da vært beregnet, men usynlig i rapporten. `all_ok` skal
 * FORTSATT stå sist: den samler nå skjær òg (motorens §0 «checks gained
 * shear_ok, asw_min_ok, stirrup_spacing_ok, and all_ok now folds in those
 * three»).
 */
test('CHECK_ORDER er utvidet med skjær, og checkRows() viser dem faktisk', () => {
  assert.ok(CHECK_ORDER.includes('shear_ok'));
  assert.ok(CHECK_ORDER.includes('asw_min_ok'));
  assert.ok(CHECK_ORDER.includes('stirrup_spacing_ok'));
  assert.equal(CHECK_ORDER[CHECK_ORDER.length - 1], 'all_ok');
  // Fixturen bærer nå motorens ekte `checks`-blokk med de tre nye feltene —
  // se `result-bending-beam-300x600.json`.
  const rows = checkRows(BENDING.checks);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.shear_ok.text, 'OK');
  assert.equal(byKey.asw_min_ok.text, 'OK');
  assert.equal(byKey.stirrup_spacing_ok.text, 'OK');
  assert.equal(byKey.shear_ok.label, CHECK_LABELS.shear_ok);
});

test('en kontroll motoren ikke rapporterte er ubesvart, ikke bestått', () => {
  const rows = checkRows({ as_min_ok: false });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.as_min_ok.text, 'Not OK');
  assert.equal(byKey.all_ok.text, DASH);
  assert.equal(checkText(undefined), DASH);
});

/* ================================================================== *
 * Merkelapper
 * ================================================================== */

test('retningsnavnene sier hvilken kant som er i trykk', () => {
  assert.match(directionLabel('sagging'), /top face/);
  assert.match(directionLabel('hogging'), /bottom face/);
  assert.equal(directionLabel('noe'), DASH);
});

test('§1.4 sine ordrette DIRECTION_LABELS', () => {
  assert.equal(directionLabel('sagging'), 'Sagging — compression at the top face (θ = 0)');
  assert.equal(directionLabel('hogging'), 'Hogging — compression at the bottom face (θ = π)');
});

test('trykkanten følger theta — ikke ordet «top face» ukritisk', () => {
  assert.equal(compressionEdgeLabel(0), 'top face');
  assert.equal(compressionEdgeLabel(Math.PI), 'bottom face');
  assert.equal(tensionEdgeLabel(0), 'bottom face');
  assert.equal(tensionEdgeLabel(Math.PI), 'top face');
  assert.equal(compressionEdgeLabel(null), DASH);
});

test('directionFromTheta avleder sagging/hogging fra en kombinasjons egen theta', () => {
  assert.equal(directionFromTheta(0), 'sagging');
  assert.equal(directionFromTheta(Math.PI), 'hogging');
  assert.equal(directionFromTheta(null), null);
  assert.equal(directionFromTheta(undefined), null);
});

test('analyse- og tverrsnittsnavn er engelske', () => {
  assert.equal(analysisLabel('bending'), 'Bending resistance');
  assert.equal(analysisLabel('moment_curvature'), 'Moment–curvature');
  assert.equal(analysisLabel('nm_domain'), 'N–M interaction domain');
  assert.match(sectionTypeLabel('slab'), /per metre/);
});

test('§1.4 sine ordrette ANALYSIS_LABELS og SECTION_TYPE_LABELS', () => {
  assert.equal(ANALYSIS_LABELS.bending, 'Bending resistance');
  assert.equal(ANALYSIS_LABELS.moment_curvature, 'Moment–curvature');
  assert.equal(ANALYSIS_LABELS.nm_domain, 'N–M interaction domain');
  assert.equal(SECTION_TYPE_LABELS.slab, 'Slab (per metre width)');
});

test('lovnavnene kommer fra materials.js, ikke fra en avskrift', () => {
  assert.ok(lawLabel('parabolarectangle').length > 0);
  assert.ok(lawLabel('elasticplastic').length > 0);
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

test('mc_endpoint_mismatch er en INFO om kurvens endepunkt, ikke om kapasiteten', () => {
  const w = describeWarning({
    code: 'mc_endpoint_mismatch',
    severity: 'info',
    message: 'ignored',
    detail: 'last point -194.7 MNmm vs M_Rd -214.0 MNmm (3.2 permille)',
  });
  assert.equal(w.message, CODE_MESSAGES.mc_endpoint_mismatch);
  assert.equal(w.severityLabel, 'Note', 'info skal ikke se ut som en feil');
  assert.match(w.message, /M_Rd/, 'leseren må se at kapasiteten står urørt');
  assert.match(w.message, /strain plane/, 'og hvorfor endepunktene skiller seg');
  assert.ok(!w.message.includes('last point'), 'motorens egen tekst er ikke hovedmelding');
  assert.ok(w.detail.includes('194.7'));
});

test('bruddtilstanden hentes fra nm_domain òg, ikke bare fra bending', () => {
  // De åtte feltene har IDENTISKE nøkkelnavn i begge blokkene.
  assert.equal(failureState(BENDING), BENDING.bending);

  const dom = JSON.parse(JSON.stringify(NMDOM));
  Object.assign(dom.nm_domain, {
    eps_a: 0.0012,
    chi_y: -1.5e-5,
    x: 220.4,
    x_over_d: 0.403,
    eps_c_top: -0.0035,
    eps_s_max: 0.0049,
    failure_mode: 'concrete_crushing',
    layers: [{ id: 'L1', z: -250, eps: 0.0049, sigma: 434.8, compression: false }],
  });
  assert.equal(failureState(dom), dom.nm_domain);
  assert.equal(failureState(dom).x, 220.4);
});

test('bare omhyllingen trenger «ved N_Ed»-merkingen', () => {
  // Fixturen bærer nå combinations/governing, men INGEN bruddtilstand
  // (`failure_mode` er ikke satt på selve nm_domain-blokka i fixturen før vi
  // legger den til her) — testen bygger derfor et bevisst STRIPPET
  // omhyllingsresultat i stedet for å stole på at fixturen mangler feltet.
  const dom = JSON.parse(JSON.stringify(NMDOM));
  dom.nm_domain.failure_mode = 'concrete_crushing';
  assert.equal(failureStateIsAtNEd(dom), true);
  // For en ren bøyeberegning er det selvsagt og trenger ingen påminnelse.
  assert.equal(failureStateIsAtNEd(BENDING), false);

  const stripped = { analysis: 'nm_domain', nm_domain: { n: [], m: [] } };
  assert.equal(failureStateIsAtNEd(stripped), false);
  assert.equal(failureState(stripped), null);
});

test('failureState tåler et resultat uten bruddtilstand', () => {
  assert.equal(failureState(null), null);
  assert.equal(failureState(MC), null, 'M–κ-blokka bærer ikke et bruddplan');
  assert.equal(failureStateIsAtNEd(null), false);
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

/* ================================================================== *
 * Lastkombinasjoner (endringsrunde 2, §4.3)
 * ================================================================== */

test('allCombinations/governingCombo leser blokkas egne combinations/governing', () => {
  const combos = allCombinations(BENDING);
  assert.equal(combos.length, 1);
  assert.equal(combos[0].id, 'C1');
  const g = governingCombo(BENDING);
  assert.equal(g.id, 'C1');
  assert.equal(comboLabel(g), 'C1', 'tomt navn faller tilbake til id-en');
});

test('governingCombo er null når blokka ikke har governing, eller når ingen kombinasjon vant', () => {
  assert.deepEqual(allCombinations(null), []);
  assert.equal(governingCombo(null), null);
  assert.equal(governingCombo({ analysis: 'bending', bending: {} }), null);

  const noCandidate = {
    analysis: 'bending',
    bending: {
      governing: null,
      combinations: [{ id: 'C1', name: 'ULS 1', within_limits: false }],
    },
  };
  assert.equal(governingCombo(noCandidate), null);
  assert.equal(allCombinations(noCandidate).length, 1);
});

test('comboLabel bruker navnet når det er satt, ellers id-en, ellers tankestrek', () => {
  assert.equal(comboLabel({ id: 'C2', name: 'ULS 2' }), 'ULS 2');
  assert.equal(comboLabel({ id: 'C2', name: '' }), 'C2');
  assert.equal(comboLabel({ id: '', name: '' }), DASH);
  assert.equal(comboLabel(null), DASH);
});

test('en kombinasjon med flere rader: governing er den med størst utnyttelse blant within_limits', () => {
  const multi = {
    analysis: 'bending',
    bending: {
      governing: 'C2',
      combinations: [
        { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 150e6, utilisation: 0.6976524857538235, within_limits: true },
        { id: 'C2', name: 'ULS 2', N_Ed: -500e3, M_Ed: 250e6, utilisation: 0.818606860634787, within_limits: true },
        { id: 'C3', name: 'ULS 3', N_Ed: -5000e3, M_Ed: 0, utilisation: null, within_limits: false },
      ],
    },
  };
  assert.equal(allCombinations(multi).length, 3);
  assert.equal(governingCombo(multi).id, 'C2');
  assert.equal(comboLabel(governingCombo(multi)), 'ULS 2');
});

/* ================================================================== *
 * Skjær — eget governing-valg (endringsrunde 4 §4.3)
 * ================================================================== */

/**
 * `shear_governing` er et EGET, uavhengig valg fra `governing` (bøying) — en
 * rad med stor V_Ed og lite M_Ed kan styre skjær uten i nærheten av å styre
 * bøying (plan §4.3). `shearGoverningCombo` skal derfor kunne peke på en HELT
 * ANNEN rad enn `governingCombo`, i én og samme analyseblokk.
 */
test('shearGoverningCombo er uavhengig av governingCombo (bøying vs. skjær kan være ulike rader)', () => {
  const result = {
    analysis: 'bending',
    bending: {
      governing: 'C1',
      shear_governing: 'C2',
      combinations: [
        {
          id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 250e6, utilisation: 0.9, within_limits: true,
          V_Ed: 5000, shear: { evaluated: true, utilisation: 0.1 },
        },
        {
          id: 'C2', name: 'ULS 2', N_Ed: 0, M_Ed: 10e6, utilisation: 0.03, within_limits: true,
          V_Ed: 180000, shear: { evaluated: true, utilisation: 1.31 },
        },
      ],
    },
  };
  assert.equal(governingCombo(result).id, 'C1', 'bøying styres av den store momentraden');
  assert.equal(shearGoverningCombo(result).id, 'C2', 'skjær styres av den store skjærraden');
  assert.equal(shearHeadlineUtilisation(result), 1.31);
});

test('shearGoverningCombo/shearHeadlineUtilisation er null uten skjærdata (eldre fixtur)', () => {
  assert.equal(shearGoverningCombo(null), null);
  assert.equal(shearGoverningCombo(BENDING), null, 'referansefixturen har ingen section.shear i payloaden');
  assert.equal(shearHeadlineUtilisation(BENDING), null);
  const noCandidate = {
    analysis: 'bending',
    bending: { shear_governing: null, combinations: [{ id: 'C1', name: 'ULS 1' }] },
  };
  assert.equal(shearGoverningCombo(noCandidate), null);
});

test('SHEAR_UTILISATION_LABEL og HEADLINE_UTILISATION_LABEL er to ulike merkelapper (§4.3: aldri slått sammen)', () => {
  assert.notEqual(SHEAR_UTILISATION_LABEL, HEADLINE_UTILISATION_LABEL);
  assert.match(SHEAR_UTILISATION_LABEL, /V_Ed/);
  assert.match(SHEAR_UTILISATION_LABEL, /V_Rd/);
});

test('shearGoverningModeLabel oversetter governing_mode, og skjuler ikke en ukjent verdi', () => {
  assert.equal(shearGoverningModeLabel('no_stirrups'), SHEAR_GOVERNING_MODE_LABELS.no_stirrups);
  assert.equal(shearGoverningModeLabel('stirrups'), SHEAR_GOVERNING_MODE_LABELS.stirrups);
  assert.equal(shearGoverningModeLabel('strut_crushing'), SHEAR_GOVERNING_MODE_LABELS.strut_crushing);
  assert.match(shearGoverningModeLabel('noe_nytt'), /Unknown mode/);
  assert.equal(shearGoverningModeLabel(null), DASH);
});

/* ================================================================== *
 * §1.5 — mekanisk kontroll: alle tabellene, ingen norsk tekst igjen
 * ================================================================== */

test('§1.5: NORDIC/NORWEGIAN_WORDS-regexen selv oppfører seg som verifisert i planen', () => {
  // Stor `Ø` er IKKE med: det er diametersymbolet i korrekt engelsk utdata
  // som «3Ø20» og «Ø12 c/c 113». Liten `ø` ER med.
  const NORDIC = /[æåÆÅø]/;
  const NORWEGIAN_WORDS = new RegExp(
    '\\b(' + [
      'ikke', 'kapasitet', 'armering', 'tverrsnitt', 'beregning', 'utnyttelse',
      'advarsel', 'merknad', 'bjelke', 'krumning', 'overdekning', 'lastvirkning',
      'avstand', 'bredde', 'verdi', 'tverrsnittet', 'armeringen',
    ].join('|') + ')\\b',
    'i',
  );
  assert.match('Kapasiteten er ikke tilstrekkelig', NORWEGIAN_WORDS);
  assert.match('Armering i underkant', NORWEGIAN_WORDS);
  assert.doesNotMatch('Bending resistance of the cross-section', NORDIC);
  assert.doesNotMatch('Bending resistance of the cross-section', NORWEGIAN_WORDS);
  assert.doesNotMatch('The last point is tall and the plate lags', NORDIC);
  assert.doesNotMatch('The last point is tall and the plate lags', NORWEGIAN_WORDS);
  assert.doesNotMatch('Minimum reinforcement A_s,min (EC2 9.2.1.1)', NORDIC);
  assert.doesNotMatch('Minimum reinforcement A_s,min (EC2 9.2.1.1)', NORWEGIAN_WORDS);
  // 3Ø20 / Ø12 c/c 113: stor Ø slipper gjennom NORDIC uendret.
  assert.doesNotMatch('3Ø20', NORDIC);
  assert.doesNotMatch('Ø12 c/c 113', NORDIC);
});

test('§1.5: ingen av tabellene i §1.3 inneholder norsk tekst', () => {
  const NORDIC = /[æåÆÅø]/;
  const NORWEGIAN_WORDS = new RegExp(
    '\\b(' + [
      'ikke', 'kapasitet', 'armering', 'tverrsnitt', 'beregning', 'utnyttelse',
      'advarsel', 'merknad', 'bjelke', 'krumning', 'overdekning', 'lastvirkning',
      'avstand', 'bredde', 'verdi', 'tverrsnittet', 'armeringen',
    ].join('|') + ')\\b',
    'i',
  );

  function collectStrings(value, acc = []) {
    if (typeof value === 'string') acc.push(value);
    else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, acc));
    return acc;
  }

  const tables = {
    CODE_MESSAGES,
    SEVERITY_LABELS,
    FAILURE_MODES,
    CHECK_LABELS,
    DIRECTION_LABELS: { sagging: directionLabel('sagging'), hogging: directionLabel('hogging') },
    ANALYSIS_LABELS,
    SECTION_TYPE_LABELS,
    UTILISATION_LEVELS,
    SHEAR_GOVERNING_MODE_LABELS,
  };

  for (const [tableName, tbl] of Object.entries(tables)) {
    for (const s of collectStrings(tbl)) {
      assert.ok(!NORDIC.test(s), `${tableName}: nordisk tegn i «${s}»`);
      assert.ok(!NORWEGIAN_WORDS.test(s), `${tableName}: norsk ord i «${s}»`);
    }
  }
});
