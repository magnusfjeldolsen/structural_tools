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
  limitStateRows,
  RESULT_VIEW_ENVELOPE,
  withResultView,
  CHECK_ORDER,
  CHECK_LABELS,
  checkRows,
  checkText,
  CHECK_PASS_TEXT,
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
  RUN_ALL_ANALYSIS,
  RUN_ALL_BLOCK_ORDER,
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
  SLS_ROW_TYPE_LABELS,
  slsRowTypeLabel,
  SLS_CHECK_ORDER,
  SLS_CHECK_LABELS,
  slsCheckRows,
  SLS_REASON_CODES,
  SLS_REASON_TEXT,
  slsReasonText,
  slsRowUtilisation,
  slsHeadlineCrack,
} from '../js/results.js';
// `RUN_ALL` hentes fra kilden sin: testen «samme streng som store.js» er
// hele grunnen til at `results.js` kan skrive av strengen 'all' i stedet for
// å importere hele tilstandslaget.
import { RUN_ALL } from '../js/store.js';

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
/**
 * `run_all_partial` beskriver en KJØRING som falt ut, ikke noe galt med
 * tverrsnittet — derfor `RUNTIME_CODES` og ikke `VALIDATION_CODES`. Uten
 * teksten ville en delvis «kjør alle» vist plassholderen «Unspecified
 * message from the calculation engine», som leses som en motorfeil.
 */
test('run_all_partial er med, i RUNTIME_CODES, og sier hva som mangler', () => {
  assert.ok(RUNTIME_CODES.includes('run_all_partial'));
  assert.ok(!VALIDATION_CODES.includes('run_all_partial'), 'den beskriver ikke tverrsnittet');
  const msg = messageForCode('run_all_partial');
  assert.ok(!msg.includes('Unspecified message'));
  assert.match(msg, /Run all/);
  assert.match(msg, /did not complete/i);
  assert.match(msg, /detail/i, 'leseren må få vite HVOR den ser hvilken analyse som falt ut');
});

test('HVER kode motoren emitterer har en tekst i JS — lest ut av engine.py', () => {
  // DEN ENE KILDEN ER MOTOREN. Kodene har til nå stått i to håndholdte lister:
  // `_warning('…')` i `engine.py` og `CODE_MESSAGES` her. Ingen test bandt dem,
  // så en ny advarsel i motoren kunne nå brukeren som
  //
  //     «Unspecified message from the calculation engine (code: "…")»
  //
  // — teknisk sant, og fullstendig ubrukelig for den som skal avgjøre om
  // snittet holder. Det er ikke en teoretisk fare: `sls_crack_width_exceeded`,
  // `sls_incomplete` og `sls_stress_limit_exceeded` kom til i SLS-runden, og
  // ingen av dem står i `ENGINE_CODES` den dag i dag. De har tekst, men det er
  // fordi noen husket det, ikke fordi noe krevde det.
  //
  // Testen leser `engine.py` i stedet for å liste kodene på nytt her — en
  // håndskrevet liste ville vært nøyaktig den tredje kilden problemet handler
  // om.
  const engine = readFileSync(
    fileURLToPath(new URL('../python/engine.py', import.meta.url)), 'utf8'
  );
  const codes = [...new Set(
    [...engine.matchAll(/_warning\(\s*\n?\s*'([a-z0-9_]+)'/g)].map((m) => m[1])
  )].sort();
  // Går regexen i stykker (blir `_warning` skrevet om), skal testen si fra om
  // DET, ikke stille gå grønn på en tom liste.
  assert.ok(codes.length >= 19, `fant bare ${codes.length} koder i engine.py`);

  const missing = codes.filter((code) => {
    const [d] = describeWarnings([{ code, severity: 'warning', message: '', detail: '' }]);
    return /Unspecified message/.test(d.message);
  });
  assert.deepEqual(missing, [], `disse motorkodene mangler tekst i results.js: ${missing.join(', ')}`);
});

test('limitStateRows: en regnet w_k UTEN anbefalt grense staar likevel', () => {
  // MAALT paa XD3-plata (`result-bending-slab-1000x200-combos.json`): motoren gir
  // `w_k = 0,13886 mm` og `w_max = null`, fordi XD3 ikke har en anbefalt grense i
  // tabellen modulen bruker. Linja gatet paa `w_max`, saa HELE rissvidden
  // forsvant -- mens «Overall assessment» sto paa `null` uten en synlig grunn.
  // Fire groenne linjer over en samlet vurdering ingen kunne forklare.
  const res = fixture('result-bending-slab-1000x200-combos');
  const crack = limitStateRows(res).find((r) => r.key === 'crack');
  assert.ok(crack, 'rissviddelinja mangler selv om w_k er regnet');
  assert.ok(crack.leftValue > 0, `w_k = ${crack.leftValue}`);
  assert.equal(crack.rightValue, null, 'grensa skal vaere tom, ikke null-som-tall');
  assert.equal(crack.ok, null, 'ubesvart, ikke bestaatt');

  // Og motsatt: uten en regnet rissvidde skal linja fortsatt VAERE borte.
  const utenSls = { ...res, sls: { ...res.sls, rows: [] } };
  assert.equal(
    limitStateRows(utenSls).find((r) => r.key === 'crack'),
    undefined,
    'uten en regnet rissvidde skal linja ikke finnes'
  );
});

test('de nye kodene fra endringsrunde 4 er med, i riktig liste (§4.4, §4.5, §2)', () => {
  assert.ok(ENGINE_CODES.includes('shear_asl_ambiguous'));
  assert.ok(ENGINE_CODES.includes('shear_not_evaluated'));
  assert.ok(VALIDATION_CODES.includes('stirrup_spacing_exceeds_max'));
  assert.ok(VALIDATION_CODES.includes('stirrup_spacing_not_positive'));
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
    'stirrup_spacing_not_positive',
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

/**
 * ETIKETTKRAVET VAR TOMT (rettet i runde 6). Assertion-en her sto tidligere som
 *
 *     assert.equal(r.label, CHECK_LABELS[r.key]);
 *
 * og den er vakuøs: `checkRows()` SETTER `label` til nettopp `CHECK_LABELS[key]`,
 * så de to sidene er samme uttrykk. Mangler etiketten, er begge `undefined`, og
 * `assert.equal(undefined, undefined)` passerer. Testen som skulle vokte
 * etikettene kunne altså ikke oppdage en glemt etikett i det hele tatt — og en
 * glemt etikett trykkes ordrett som «undefined» i kontrolltabellen i rapporten.
 *
 * Kravet må formuleres uavhengig av kilden: hver nøkkel i `CHECK_ORDER` skal ha
 * en IKKE-TOM streng som ikke bare er nøkkelen om igjen.
 *
 * `text`-kravet er samtidig gjort betinget av at fixturen FAKTISK har nøkkelen.
 * Fixturene regenereres av koordinatoren etter at motoren har fått `bending_ok`
 * og `brittle_ok`; inntil da mangler de to i `checks`, og en ubetinget
 * `'OK'`-påstand ville vært en påstand om fixturens alder, ikke om koden.
 */
test('kontrolltabellen har fast rekkefølge og engelske navn', () => {
  const rows = checkRows(BENDING.checks);
  assert.deepEqual(rows.map((r) => r.key), [...CHECK_ORDER]);
  for (const r of rows) {
    assert.equal(typeof r.label, 'string', `«${r.key}» mangler etikett helt`);
    assert.ok(r.label.trim().length > 0, `«${r.key}» har tom etikett`);
    assert.notEqual(r.label, r.key, `«${r.key}» har nøkkelen som etikett`);
    // Referansefixturen er et snitt der ALT består. Enhver kontroll den
    // faktisk bærer, skal derfor lese «OK» — en «–» her ville betydd at
    // lesesiden mistet en verdi motoren sendte.
    if (Object.prototype.hasOwnProperty.call(BENDING.checks, r.key)) {
      assert.equal(r.text, 'OK', `«${r.key}» står i fixturen, men leses ikke som bestått`);
    }
  }
  assert.equal(rows[rows.length - 1].key, 'all_ok', 'den samlede vurderingen står sist');
});

/**
 * Samme krav, men stilt mot `CHECK_LABELS` direkte og med begge retninger:
 * ingen nøkkel i `CHECK_ORDER` uten etikett, OG ingen etikett uten nøkkel i
 * `CHECK_ORDER`. Den andre retningen fanger den motsatte feilen — en etikett
 * skrevet for en kontroll som aldri ble lagt inn i rekkefølgen, og som derfor
 * er usynlig i rapporten samtidig som den ser ferdig ut i kildekoden.
 */
test('CHECK_ORDER og CHECK_LABELS dekker nøyaktig hverandre', () => {
  for (const key of CHECK_ORDER) {
    const label = CHECK_LABELS[key];
    assert.equal(typeof label, 'string', `«${key}» står i CHECK_ORDER uten etikett`);
    assert.ok(label.trim().length > 3, `etiketten for «${key}» er for kort til å bety noe`);
    assert.ok(!label.includes('_ok'), `etiketten for «${key}» er bare nøkkelen`);
  }
  for (const key of Object.keys(CHECK_LABELS)) {
    assert.ok(CHECK_ORDER.includes(key), `«${key}» har etikett, men emitteres aldri`);
  }
  assert.equal(new Set(CHECK_ORDER).size, CHECK_ORDER.length, 'en kontroll står to ganger');
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

/* ------------------------------------------------------------------ *
 * Runde 6 steg 1 — bøyekontroll, sprøbrudd og treverdige svar
 * ------------------------------------------------------------------ */

/**
 * DEFEKT 1 (plan §1.2): det fantes ingen rad for `M_Ed ≤ M_Rd`. En bjelke
 * lastet 2,33 ganger over bøyekapasiteten rapporterte «Overall assessment: OK»
 * uten en eneste advarsel, fordi `utilisation` ble regnet og ingen leste den.
 *
 * Testen ville FEILET før endringen: `CHECK_ORDER` hadde ikke `bending_ok`,
 * så `checkRows()` emitterte aldri raden, uansett hva motoren sendte.
 *
 * Plasseringen er en del av påstanden. `bending_ok` skal stå RETT FØR
 * `shear_ok` — de to er de eneste lastvirkning-mot-kapasitet-kontrollene, og
 * en bøyekontroll plassert oppe blant armeringsreglene leses som en
 * armeringsregel.
 */
test('§1.2: bending_ok finnes, står rett før shear_ok, og emitteres', () => {
  assert.ok(CHECK_ORDER.includes('bending_ok'), 'ingen rad for M_Ed <= M_Rd');
  assert.equal(
    CHECK_ORDER[CHECK_ORDER.indexOf('shear_ok') - 1],
    'bending_ok',
    'bøyekontrollen skal stå rett før skjærkontrollen'
  );
  assert.equal(CHECK_ORDER[CHECK_ORDER.length - 1], 'all_ok', 'all_ok står fortsatt sist');
  const byKey = Object.fromEntries(
    checkRows({ bending_ok: false }).map((r) => [r.key, r])
  );
  assert.equal(byKey.bending_ok.text, 'Not OK');
  assert.equal(byKey.bending_ok.ok, false);
});

/**
 * DEFEKT 3 (plan §1.5): `as_min_ok` består vakuøst der `d` har degenerert.
 * `brittle_ok` er det fysiske kriteriet A_s,min bare er et surrogat for, og
 * plasseres derfor RETT ETTER `as_min_ok`: står de ved siden av hverandre,
 * ser leseren når surrogatet og kriteriet er uenige.
 *
 * Ville FEILET før: nøkkelen fantes ikke i `CHECK_ORDER`.
 */
test('§1.5: brittle_ok finnes, står rett etter as_min_ok, og emitteres', () => {
  assert.ok(CHECK_ORDER.includes('brittle_ok'), 'ingen rad for M_Rd >= M_cr');
  assert.equal(
    CHECK_ORDER[CHECK_ORDER.indexOf('as_min_ok') + 1],
    'brittle_ok',
    'sprøbruddkontrollen skal stå rett etter A_s,min — samme EC2-klausul'
  );
  const byKey = Object.fromEntries(
    checkRows({ as_min_ok: null, brittle_ok: false }).map((r) => [r.key, r])
  );
  assert.equal(byKey.as_min_ok.text, DASH, 'A_s,min uten gyldig d er ubesvart, ikke bestått');
  assert.equal(byKey.brittle_ok.text, 'Not OK');
});

/**
 * Etikettene ordrett. De er kontrakten mot rapporten og mot UI-et, og de er
 * det eneste stedet formelen bak kontrollen står skrevet for leseren.
 */
test('runde 6 sine ordrette CHECK_LABELS', () => {
  assert.equal(
    CHECK_LABELS.bending_ok,
    'Bending capacity M_Ed ≤ M_Rd(N_Ed), all combinations'
  );
  assert.equal(CHECK_LABELS.brittle_ok, 'Brittle failure — M_Rd ≥ M_cr (EC2 9.2.1.1(1))');
  // Formelen skal stå i etiketten, ikke bare navnet på kontrollen: en rad som
  // sier «Brittle failure: Not OK» uten kriteriet er ikke etterprøvbar.
  assert.match(CHECK_LABELS.bending_ok, /M_Rd/);
  assert.match(CHECK_LABELS.brittle_ok, /M_cr/);
});

/**
 * Plan §1.1: en kontroll har TRE svar, og `null` betyr «motoren kan ikke hevde
 * noen av delene». Lesesiden skal aldri gjøre `null` om til et av de to andre.
 * Særlig ikke til bestått — det er nettopp feilen `engine.py:1140`
 * (`as_min is None ⇒ True`) gjorde.
 */
test('§1.1: checkText er treverdig og gjør aldri ubesvart om til bestått', () => {
  assert.equal(checkText(true), 'OK');
  assert.equal(checkText(false), 'Not OK');
  assert.equal(checkText(null), DASH);
  assert.equal(checkText(undefined), DASH);
  // Ingen av de tre svarene kolliderer — ellers kunne rapporten ikke skilles ad.
  assert.equal(new Set([checkText(true), checkText(false), checkText(null)]).size, 3);
  // `ok` føres gjennom rått, slik at UI-et kan farge grønn/rød/grå på verdien
  // og ikke på teksten. `checkRows` må ikke normalisere `null` til `false`.
  const byKey = Object.fromEntries(
    checkRows({ ductility_ok: null, as_min_ok: null, all_ok: null }).map((r) => [r.key, r])
  );
  assert.equal(byKey.ductility_ok.ok, null);
  assert.equal(byKey.all_ok.ok, null);
  assert.equal(byKey.all_ok.text, DASH);
});

/**
 * HELE `CHECK_ORDER` med `null` i hver eneste kontroll. Det er tilstanden
 * «motoren regnet aldri bruddplanet», og lesesiden skal tåle den uten å kaste
 * og uten å finne på et svar.
 */
test('§1.1: alle kontroller null gir en fullstendig tabell med bare strek', () => {
  const allNull = Object.fromEntries(CHECK_ORDER.map((k) => [k, null]));
  const rows = checkRows(allNull);
  assert.equal(rows.length, CHECK_ORDER.length);
  for (const r of rows) {
    assert.equal(r.ok, null, `«${r.key}» mistet sin ubesvarte tilstand`);
    assert.equal(r.text, DASH, `«${r.key}» ble tolket som et svar`);
  }
  // Og den motsatte ytterligheten: en tom `checks`-blokk skal gi samme svar.
  for (const r of checkRows({})) assert.equal(r.text, DASH);
  for (const r of checkRows(undefined)) assert.equal(r.text, DASH);
});

/**
 * Plan §1.7: kodene for de nye tilstandene MÅ ha tekst i `CODE_MESSAGES`.
 * Grunnen er mekanisk, ikke kosmetisk — `describeWarning()` kaster motorens
 * egen `message` for enhver kode tabellen kjenner, og viser bare `detail` ved
 * siden av tabellteksten. Ligger forklaringen bare i motoren, forsvinner den.
 * Og mangler koden i tabellen, faller den til plassholderen «Unspecified
 * message from the calculation engine», som leses som en programfeil.
 *
 * Ville FEILET før: ingen av de seks kodene fantes.
 */
test('§1.7: de seks nye kodene har hver sin engelske forklaring', () => {
  const nye = [
    'bending_capacity_exceeded',
    'm_rd_below_m_cr',
    'ductility_not_applicable',
    'as_min_not_applicable',
    'checks_not_evaluated',
    'assessment_incomplete',
  ];
  for (const code of nye) {
    assert.ok(ENGINE_CODES.includes(code), `«${code}» mangler i ENGINE_CODES`);
    assert.ok(!messageForCode(code).includes('Unspecified message'), `«${code}» mangler tekst`);
    // Kjernen: tabellteksten skal overleve at motoren sender sin egen
    // `message`, fordi `describeWarning` forkaster den for kjente koder.
    const w = describeWarning({
      code,
      severity: 'warning',
      message: 'RAW ENGINE TEXT',
      detail: 'x=1',
    });
    assert.equal(w.message, CODE_MESSAGES[code], `«${code}» viste noe annet enn tabellteksten`);
    assert.ok(!w.message.includes('RAW ENGINE TEXT'));
    assert.match(w.detail, /x=1/, 'detaljen skal fortsatt være tilgjengelig');
  }
});

/**
 * TO NAVN PÅ SAMME KODE (målt 17.09, motoren i denne grenen).
 * `engine.py:1379` sender sprøbruddet som `brittle_failure_risk`, mens
 * kontrakten for runde 6 sier `m_rd_below_m_cr`. Lesesiden kjenner begge, med
 * SAMME strengkonstant — en `error`-advarsel om sprøbrudd som faller ned på
 * «Unspecified message from the calculation engine» ville lest som en
 * programfeil og ikke som den alvorligste beskjeden modulen kan gi.
 *
 * Denne testen finnes for å gjøre det umulig at de to skrivemåtene får hver
 * sin tekst. Den skal SLETTES sammen med den ene nøkkelen når motoren og
 * kontrakten er enige om ett navn — testen er et stillas, ikke et krav.
 */
test('sprøbruddkoden har samme tekst under begge skrivemåtene', () => {
  assert.equal(CODE_MESSAGES.brittle_failure_risk, CODE_MESSAGES.m_rd_below_m_cr);
  assert.ok(!messageForCode('brittle_failure_risk').includes('Unspecified message'));
  assert.ok(!messageForCode('m_rd_below_m_cr').includes('Unspecified message'));
});

/**
 * Plan §1.7, andre setning: ingen advarsel får sitere et tall som aldri ble
 * regnet. `engine.py` trykte ordrett «eps_s_max=None < eps_yd=0.00217» — en
 * påstand om et bruddplan som ikke finnes. Påstanden er testbar, og testes her
 * på lesesiden fordi det er `describeWarning` som faktisk slipper teksten ut.
 */
test('§1.7: «None» slipper aldri gjennom til en vist melding eller detalj', () => {
  for (const [code, msg] of Object.entries(CODE_MESSAGES)) {
    assert.ok(!/\bNone\b/.test(msg), `«${code}» siterer Python-None i meldingen`);
  }
  // Den historiske teksten, ordrett. Kommer den inn som `detail`, er det
  // motorens feil — men lesesiden skal ikke kunne skjule at den kom.
  const w = describeWarning({
    code: 'ductility_not_applicable',
    detail: 'eps_s_max=None < eps_yd=0.00217',
  });
  assert.equal(w.message, CODE_MESSAGES.ductility_not_applicable);
  assert.ok(!/\bNone\b/.test(w.message), 'hovedmeldingen skal aldri bære None');
});

/* ================================================================== *
 * SLS — EC2 7.2/7.3.4 (spec §4, §6, §11) — A3-delen
 *
 * `slsCheckRows`/`slsRowUtilisation` er VELGERE: de skal plukke riktig nøkkel
 * og den største av flere utnyttelser. Argumentene deres er derfor fortsatt
 * små, håndskrevne objekter — tallene i dem er SKILLEMERKER (0,5 mot 0,9 mot
 * 0,3), ikke påstander om hva motoren regner, og en fixturverdi ville gjort
 * testene dårligere, ikke bedre.
 *
 * Der en test derimot påstår noe om FORMEN motoren faktisk leverer, kommer
 * tallet fra fixturene under. Den formen er ikke lenger noe testen kan finne
 * på selv: `payload-*-combos.json` bærer en `sls`-blokk med begge SLS-typene,
 * og `docs/fixture-generator.py` kjører motoren på dem.
 * ================================================================== */

const BEAM_COMBOS = fixture('result-bending-beam-300x600-combos');
/** Plata kjøres med XD3, som EC2 ikke anbefaler noen rissviddegrense for —
 *  derfor er det HER AC14-formen (`crack` fylt, `w_max: null`) finnes uten at
 *  noen må dikte den opp. */
const SLAB_COMBOS = fixture('result-bending-slab-1000x200-combos');
const slsRow = (result, type) => result.sls.rows.find((r) => r.type === type);

test('SLS: hver kode motoren kan emittere PÅ ett rad-felt har en engelsk tekst (spec §3.5/§11)', () => {
  // Speiler '§1.7: de seks nye kodene ...' over, for den ANDRE tabellen.
  // Ville FEILET før denne runden: verken tabellen eller funksjonen fantes.
  for (const code of SLS_REASON_CODES) {
    assert.ok(SLS_REASON_TEXT[code], `mangler engelsk tekst for SLS-grunnen «${code}»`);
    assert.equal(typeof SLS_REASON_TEXT[code], 'string');
    assert.ok(SLS_REASON_TEXT[code].length > 20, `teksten for «${code}» er for kort til å hjelpe noen`);
    assert.equal(slsReasonText(code), SLS_REASON_TEXT[code]);
  }
  // UTTØMMENDE begge veier (spec §3.5: «Radene i tabellen over er
  // UTTØMMENDE for crack = null»): en tekst uten kode er en løs tråd ingen
  // kontroll fanger, like farlig som en kode uten tekst.
  assert.deepEqual(
    Object.keys(SLS_REASON_TEXT).sort(),
    [...SLS_REASON_CODES].sort(),
    'SLS_REASON_TEXT og SLS_REASON_CODES må liste NØYAKTIG de samme kodene',
  );
  // En ukjent kode skal IKKE late som den har tekst.
  assert.match(slsReasonText('made_up_code'), /Unspecified reason/);
  assert.equal(slsReasonText(''), DASH);
  assert.equal(slsReasonText(null), DASH);
});

test('SLS: de tre nye varselkodene er i ENGINE_CODES og har tekst uten "not implemented" (spec §4, §6.3)', () => {
  for (const code of ['sls_incomplete', 'sls_crack_width_exceeded', 'sls_stress_limit_exceeded']) {
    assert.ok(ENGINE_CODES.includes(code), `«${code}» mangler i ENGINE_CODES`);
    assert.ok(!messageForCode(code).includes('Unspecified message'), `«${code}» mangler tekst`);
  }
});

/**
 * RETTET (spec §6.3): denne koden påsto tidligere at «Serviceability checks
 * are not implemented in this version» — usant fra og med SLS-kapittelet.
 * Ville FEILET før: den gamle teksten inneholdt nettopp den påstanden.
 */
test('no_uls_combination sier ikke lenger at SLS er uimplementert (spec §6.3)', () => {
  const msg = CODE_MESSAGES.no_uls_combination;
  assert.ok(!/not implemented/i.test(msg), 'påstanden skal være fjernet, ikke omskrevet');
  assert.match(msg, /serviceability/i, 'skal peke videre til at SLS-rader fortsatt evalueres');
});

test('slsRowTypeLabel: engelske etiketter, tankestrek for ukjent (spec §1.5)', () => {
  assert.equal(slsRowTypeLabel('characteristic'), SLS_ROW_TYPE_LABELS.characteristic);
  assert.equal(slsRowTypeLabel('quasi_permanent'), SLS_ROW_TYPE_LABELS.quasi_permanent);
  assert.equal(slsRowTypeLabel('uls'), DASH, 'en ULS-rad skal aldri stå i SLS-tabellen');
  assert.equal(slsRowTypeLabel(undefined), DASH);
});

/**
 * `slsCheckRows` er IKKE `checkRows()`. Testen låser nettopp forskjellen
 * (spec §10, A3-kravet): en `not_applicable`-nøkkel skal IKKE vises som
 * ubesvart tankestrek — den skal vises MED sin grunn og uten hake/kryss.
 * Ville FEILET før: funksjonen fantes ikke.
 */
test('slsCheckRows: not_applicable skiller seg fra null (spec §4, §10)', () => {
  const sls = {
    checks: { sigma_c_char_ok: null, sigma_s_char_ok: true },
    not_applicable: {
      sigma_c_qp_ok: 'no quasi-permanent load combination is present',
      crack_width_ok: 'no quasi-permanent load combination is present',
    },
  };
  const rows = slsCheckRows(sls);
  assert.deepEqual(rows.map((r) => r.key), SLS_CHECK_ORDER, 'fast rekkefølge, spec §4');

  const cCharUnanswered = rows.find((r) => r.key === 'sigma_c_char_ok');
  assert.equal(cCharUnanswered.applicable, true, 'ubesvart er IKKE det samme som ikke-gjeldende');
  assert.equal(cCharUnanswered.ok, null);
  assert.equal(cCharUnanswered.text, DASH);
  assert.equal(cCharUnanswered.reason, '');

  const sCharOk = rows.find((r) => r.key === 'sigma_s_char_ok');
  assert.equal(sCharOk.ok, true);
  assert.equal(sCharOk.text, CHECK_PASS_TEXT);

  const cQpNA = rows.find((r) => r.key === 'sigma_c_qp_ok');
  assert.equal(cQpNA.applicable, false);
  assert.equal(cQpNA.ok, null);
  assert.equal(cQpNA.text, '', 'not_applicable har ingen hake/kryss/strek-symbol');
  assert.match(cQpNA.reason, /no quasi-permanent/);

  // En nøkkel som er HVERKEN i checks NOCH not_applicable finnes ikke i det
  // hele tatt her (spec: bare de som GJELDER, resten i not_applicable) —
  // `crack_width_ok` STÅR fordi den er i not_applicable, men en helt fjerde,
  // oppdiktet nøkkel skal aldri dukke opp.
  assert.equal(rows.length, 4, 'nøyaktig fire mulige nøkler, ingen oppdiktet');
});

/**
 * ANKERET: de tre velgerne over kjørt mot MOTORENS EGNE `sls`-blokker, ikke
 * mot et objekt testen har satt sammen. De to fixturene dekker hver sin gren
 * av `not_applicable`/`null`:
 *
 *   bjelken (XC3): `sigma_c_char_ok` er IKKE-GJELDENDE — EC2 7.2(2) stiller
 *     bare σ_c-grensen for XD/XF/XS, så nøkkelen ligger i `not_applicable`.
 *   plata (XD3):   `crack_width_ok` er UBESVART — klassen har ingen anbefalt
 *     w_max, så dommen kan ikke felles, og `null` er ikke det samme som «ok».
 *
 * De to skal aldri kunne bytte plass, og det var nettopp den forskjellen
 * ingen håndskrevet `sls`-blokk her kunne bevise.
 */
test('slsCheckRows mot motorens egne sls-blokker: ikke-gjeldende og ubesvart er to ulike ting', () => {
  const beam = slsCheckRows(BEAM_COMBOS.sls);
  const beamSigmaC = beam.find((r) => r.key === 'sigma_c_char_ok');
  assert.equal(beamSigmaC.applicable, false, 'XC3 krever ikke σ_c-grensen');
  assert.equal(beamSigmaC.text, '', 'ikke-gjeldende har ingen hake/kryss/strek');
  assert.ok(beamSigmaC.reason.length > 0, 'og den skal ha en grunn i klartekst');

  const slabCrack = slsCheckRows(SLAB_COMBOS.sls).find((r) => r.key === 'crack_width_ok');
  assert.equal(slabCrack.applicable, true, 'XD3 SKAL rissviddesjekkes — den mangler bare grensen');
  assert.equal(slabCrack.ok, null);
  assert.equal(slabCrack.text, DASH, 'ubesvart er en tankestrek, ikke en tom celle');
});

test('slsCheckRows: en nøkkel som verken er i checks eller not_applicable, uteblir', () => {
  const rows = slsCheckRows({ checks: { sigma_s_char_ok: true }, not_applicable: {} });
  assert.deepEqual(rows.map((r) => r.key), ['sigma_s_char_ok']);
});

test('slsCheckRows: tåler et sls-objekt uten checks/not_applicable', () => {
  assert.deepEqual(slsCheckRows({}), []);
  assert.deepEqual(slsCheckRows(), []);
});

/**
 * `slsRowUtilisation` siterer ALDRI et tall som ikke er regnet (doktrinen).
 * Ville FEILET før: funksjonen fantes ikke.
 */
test('slsRowUtilisation: den STØRSTE av de KONTROLLERTE utnyttelsene, null uten noen (doktrinen)', () => {
  assert.equal(
    slsRowUtilisation({
      stress: { sigma_c_util: 0.5, sigma_c_ok: true, sigma_s_util: 0.9, sigma_s_ok: true },
      crack: { utilisation: 0.3, ok: true },
    }),
    0.9,
  );
  assert.equal(
    slsRowUtilisation({
      stress: { sigma_c_util: null, sigma_c_ok: null, sigma_s_util: null, sigma_s_ok: null },
      crack: { utilisation: 0.845716, ok: false },
    }),
    0.845716,
  );
  assert.equal(slsRowUtilisation({ stress: null, crack: null }), null, 'ingen svar er null, ikke 0');
  assert.equal(slsRowUtilisation({}), null);
  assert.equal(slsRowUtilisation(), null);
});

test('slsRowUtilisation teller IKKE en grense som ikke gjelder (K5)', () => {
  // EC2 7.2(2) gjelder bare XD/XF/XS. For en XC-klasse setter motoren
  // `sigma_c_ok: null` MED en grunn, men utnyttelsen står igjen som det
  // faktumet den er. η skal da drives av stålet, ikke av en grense
  // kontrollista samtidig melder som «not applicable».
  const row = {
    stress: {
      sigma_c_util: 0.93, sigma_c_ok: null, sigma_c_ok_reason: 'sigma_c_char_not_required',
      sigma_s_util: 0.41, sigma_s_ok: true,
    },
    crack: null,
  };
  assert.equal(slsRowUtilisation(row), 0.41);

  // Og uten en eneste dom: ingen η, ikke η = 0,93.
  assert.equal(slsRowUtilisation({
    stress: { sigma_c_util: 0.93, sigma_c_ok: null, sigma_s_util: null, sigma_s_ok: null },
    crack: null,
  }), null);
});

/**
 * `slsHeadlineCrack`: den STØRSTE regnede `w_k` blant SLS-radene, eller
 * `null` når INGEN rad fikk en rissvidde regnet — «er ingen rissvidde
 * regnet, står det ingenting» (spec §6.2).
 */
test('slsHeadlineCrack: verste w_k blant radene, null uten en eneste', () => {
  // De to rissviddene er MOTORENS: plata (XD3) og bjelken (XC3), begge
  // kvasi-permanente. Bjelken er den største, så den skal vinne — og det er
  // dens w_max som følger med, ikke platas.
  const SLAB_WK = slsRow(SLAB_COMBOS, 'quasi_permanent').crack.w_k;
  const BEAM_CRACK = slsRow(BEAM_COMBOS, 'quasi_permanent').crack;
  assert.ok(BEAM_CRACK.w_k > SLAB_WK, 'forutsetningen for denne testen');
  const result = {
    sls: {
      rows: [
        { id: 'C1', crack: null, crack_reason: 'uncracked' },
        { id: 'C2', crack: { w_k: SLAB_WK, w_max: BEAM_CRACK.w_max } },
        { id: 'C3', crack: { w_k: BEAM_CRACK.w_k, w_max: BEAM_CRACK.w_max } },
      ],
    },
  };
  const worst = slsHeadlineCrack(result);
  assert.equal(worst.w_k, BEAM_CRACK.w_k);
  assert.equal(worst.w_max, BEAM_CRACK.w_max);

  assert.equal(slsHeadlineCrack({ sls: { rows: [{ crack: null }] } }), null);
  assert.equal(slsHeadlineCrack({ sls: { rows: [] } }), null);
  assert.equal(slsHeadlineCrack({}), null);
  assert.equal(slsHeadlineCrack(null), null);

  // AC14 (spec §9): en rad kan ha et FYLT crack-objekt med w_max: null (ingen
  // anbefalt grense). `slsHeadlineCrack` skal fortsatt gi w_k — den leser
  // ALDRI w_max som en forutsetning for at w_k finnes.
  const slabCrack = slsRow(SLAB_COMBOS, 'quasi_permanent').crack;
  assert.equal(slabCrack.w_max, null, 'XD3 har ingen anbefalt grense — det er poenget');
  const ac14 = slsHeadlineCrack({ sls: { rows: [{ crack: slabCrack }] } });
  assert.equal(ac14.w_k, slabCrack.w_k);
  assert.equal(ac14.w_max, null);
});

/**
 * Plan §1.5: uten denne oppføringen skriver `failureModeLabel` ordrett
 * «Unknown failure mode ("unreinforced_tension_zone")» i rapportens kapittel 5
 * — og `failureModeNote` blir tom, så forklaringen forsvinner helt.
 *
 * Ville FEILET før: `FAILURE_MODES` hadde bare de fire.
 */
test('§1.5: unreinforced_tension_zone er en kjent bruddform', () => {
  assert.ok(FAILURE_MODES.unreinforced_tension_zone, 'bruddformen mangler');
  const label = failureModeLabel('unreinforced_tension_zone');
  assert.ok(!label.includes('Unknown failure mode'), 'bruddformen vises som ukjent');
  assert.match(label, /[Uu]nreinforced/);
  const note = failureModeNote('unreinforced_tension_zone');
  assert.ok(note.length > 40, 'bruddformen mangler forklaring');
  assert.match(note, /M_cr/, 'forklaringen må nevne kriteriet den kommer av');
  // Den skal ikke kunne forveksles med `over_reinforced`, som er den motsatte
  // beskjeden: «for mye armering» mot «for lite på strekksiden».
  assert.notEqual(label, FAILURE_MODES.over_reinforced.label);
  const labels = Object.values(FAILURE_MODES).map((m) => m.label);
  assert.equal(new Set(labels).size, labels.length, 'to bruddformer med samme navn');
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

/**
 * «Kjør alle» er en analyse brukeren VELGER, og står i rapportens kapittel 1
 * («Analysis»). Uten en oppføring her ga `analysisLabel('all')` tankestrek — en
 * rapport med tall fra tre analyser og et tomt felt for hvilken som ble kjørt.
 */
test('«kjør alle» har sin egen merkelapp, ikke tankestrek', () => {
  assert.equal(ANALYSIS_LABELS[RUN_ALL_ANALYSIS], 'Run all');
  assert.equal(analysisLabel(RUN_ALL_ANALYSIS), 'Run all');
  assert.equal(analysisLabel('finnes_ikke'), DASH, 'en ukjent analyse er fortsatt tankestrek');
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

/* ================================================================== *
 * «Kjør alle» — én analyse som ikke har sin egen blokk (endringsrunde 5 §D)
 * ================================================================== */

/**
 * Et sammenflettet «kjør alle»-svar, bygget som `solver-client.js` sin
 * `runAll()` bygger det: MOTORENS egne blokker, uendret, under sine egne navn,
 * og `primary` som peker på kapasitetsanalysen. Det finnes ingen `result.all`
 * — det er nettopp derfor `analysisBlock()` trenger en egen gren.
 */
function runAllResult(primary = 'bending', blocks = ['bending', 'nm_domain', 'moment_curvature']) {
  const src = { bending: BENDING, nm_domain: NMDOM, moment_curvature: MC };
  const r = {
    ok: true,
    schema: 1,
    analysis: RUN_ALL_ANALYSIS,
    primary,
    meta: BENDING.meta,
    materials: BENDING.materials,
    section_props: BENDING.section_props,
    checks: BENDING.checks,
    warnings: [],
  };
  for (const b of blocks) r[b] = src[b][b];
  return r;
}

test('«samme streng som store.js»: RUN_ALL_ANALYSIS kan ikke drive fra RUN_ALL', async () => {
  // Duplikatet er tillatt fordi DENNE testen finnes. Endres den ene, faller den.
  assert.equal(RUN_ALL_ANALYSIS, RUN_ALL);
  assert.equal(RUN_ALL_ANALYSIS, 'all');
  // Og den TREDJE kopien: `solver-client.js` skriver strengen inn i resultatet.
  // Driver den, blir `merged.analysis` ulik `RUN_ALL_ANALYSIS`, `analysisBlock()`
  // returnerer null, og hele panelet og rapporten går til bindestrek.
  const client = await import('../js/solver-client.js');
  assert.equal(client.RUN_ALL_ANALYSIS, RUN_ALL_ANALYSIS);
  assert.ok(client.CANCELLABLE_ANALYSES.includes(RUN_ALL_ANALYSIS),
    '«Run all» er den lengste kjøringen i modulen og MÅ kunne avbrytes');
});

test('«samme streng som store.js»: RESULT_VIEW_ENVELOPE kan ikke drive fra RESULT_VIEW', async () => {
  // Samme avveining som for RUN_ALL over: `results.js` skal bare avhenge av
  // `materials.js`, og `store.js` skal ikke dra formateringslaget inn i
  // tilstandslaget. Duplikatet er tillatt fordi DENNE testen finnes.
  //
  // Driver de fra hverandre, blir konsekvensen stille og stygg: `store.js` ville
  // satt en `resultView` ingen `withResultView()` kjenner igjen, og seksjon 6
  // ville vist envelopen mens velgeren sto på en rad.
  const { RESULT_VIEW } = await import('../js/store.js');
  assert.equal(RESULT_VIEW_ENVELOPE, RESULT_VIEW);
  assert.equal(RESULT_VIEW_ENVELOPE, 'envelope');
  // …og den må ikke kunne kollidere med en kombinasjons-id.
  assert.ok(!/^C\d+$/.test(RESULT_VIEW_ENVELOPE));
});

test('analysisBlock peker på primary når analysis === «all», og på analysen ellers', () => {
  const bendingFirst = runAllResult('bending');
  assert.equal(analysisBlock(bendingFirst), bendingFirst.bending, 'primary bending');
  assert.equal(headlineUtilisation(bendingFirst), BENDING.bending.utilisation);
  assert.equal(momentCapacity(bendingFirst), BENDING.bending.M_Rd);

  const domainFirst = runAllResult('nm_domain');
  assert.equal(analysisBlock(domainFirst), domainFirst.nm_domain, 'primary nm_domain');
  assert.equal(headlineUtilisation(domainFirst), NMDOM.nm_domain.utilisation);
  assert.equal(momentCapacity(domainFirst), NMDOM.nm_domain.M_Rd_at_N);

  // Øvrige analyser er urørt: regelen gjelder BARE 'all'.
  assert.equal(analysisBlock(BENDING), BENDING.bending);
  assert.equal(analysisBlock(MC), MC.moment_curvature);
  assert.equal(analysisBlock(NMDOM), NMDOM.nm_domain);
});

test('en blokk som mangler i «kjør alle» gir en DEFINERT reserve, ikke et kast', () => {
  assert.deepEqual([...RUN_ALL_BLOCK_ORDER], ['bending', 'nm_domain', 'moment_curvature']);
  assert.ok(Object.isFrozen(RUN_ALL_BLOCK_ORDER));

  // `primary` mangler helt (eldre klient, eller et håndskrevet resultat).
  const noPrimary = runAllResult('bending');
  delete noPrimary.primary;
  assert.equal(analysisBlock(noPrimary), noPrimary.bending);

  // `primary` peker på analysen som FALT UT — den vanligste varianten, og
  // grunnen til at `run_all_partial` finnes i det hele tatt.
  const lostPrimary = runAllResult('nm_domain', ['bending', 'moment_curvature']);
  assert.equal(analysisBlock(lostPrimary), lostPrimary.bending);

  // Bare kurven kom gjennom: da er den svaret, ikke `null`.
  const onlyCurve = runAllResult('bending', ['moment_curvature']);
  assert.equal(analysisBlock(onlyCurve), onlyCurve.moment_curvature);

  // Ingen blokker i det hele tatt: `null`, og ingen unntak.
  const empty = runAllResult('bending', []);
  assert.equal(analysisBlock(empty), null);
  assert.equal(headlineUtilisation(empty), null);
  assert.deepEqual(allCombinations(empty), []);
});

test('oppslagene arver «kjør alle» fra analysisBlock — regelen står ETT sted', () => {
  const r = runAllResult('bending');
  assert.equal(allCombinations(r).length, BENDING.bending.combinations.length);
  assert.equal(governingCombo(r)?.id, BENDING.bending.governing);
  assert.equal(failureState(r), r.bending);

  // Skjær leses gjennom samme blokk. Fixturen har ingen `section.shear`, så
  // skjæret settes inn her — samme mønster som `report.test.mjs` bruker.
  const withShear = runAllResult('nm_domain');
  withShear.nm_domain = {
    ...withShear.nm_domain,
    shear_governing: 'C2',
    combinations: [
      { id: 'C1', name: 'ULS 1', shear: { evaluated: true, utilisation: 0.11 } },
      { id: 'C2', name: 'ULS 2', shear: { evaluated: true, utilisation: 0.84 } },
    ],
  };
  assert.equal(shearGoverningCombo(withShear)?.id, 'C2');
  assert.equal(shearHeadlineUtilisation(withShear), 0.84);
});

/**
 * «Ved N_Ed»-merkingen følger BLOKKA, ikke analysenavnet. Med
 * `analysis: 'all'` heter analysen 'all' selv når tallene kommer fra
 * omhyllingen — en test mot navnet ville sluppet tøyningsplanet ut i rapporten
 * UTEN forbeholdet om at det gjelder ett eneste punkt.
 */
test('failureStateIsAtNEd følger blokka også i «kjør alle»', () => {
  const domainFirst = runAllResult('nm_domain');
  assert.equal(failureState(domainFirst), domainFirst.nm_domain);
  assert.equal(failureStateIsAtNEd(domainFirst), true);

  const bendingFirst = runAllResult('bending');
  assert.equal(failureStateIsAtNEd(bendingFirst), false, 'bøyekapasitet trenger ingen påminnelse');

  // Enkeltanalysene oppfører seg nøyaktig som før.
  assert.equal(failureStateIsAtNEd(NMDOM), true);
  assert.equal(failureStateIsAtNEd(BENDING), false);
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
    // SLS (spec §4, §6.3) — samme mekaniske kontroll, ikke en egen norsk-sjekk.
    SLS_ROW_TYPE_LABELS,
    SLS_CHECK_LABELS,
    SLS_REASON_TEXT,
  };

  for (const [tableName, tbl] of Object.entries(tables)) {
    for (const s of collectStrings(tbl)) {
      assert.ok(!NORDIC.test(s), `${tableName}: nordisk tegn i «${s}»`);
      assert.ok(!NORWEGIAN_WORDS.test(s), `${tableName}: norsk ord i «${s}»`);
    }
  }
});

/**
 * REGRESJON: brukervendt tekst skal vaere ENGELSK, ogsaa utenfor `results.js`.
 *
 * `PHASE_LABELS` i `solver-client.js` sto paa norsk og gikk rett ut i statuspilla
 * oeverst paa sida og i bunnlinja — «Laster Python-kjernen» midt i et engelsk
 * grensesnitt. Spraaktestene fantes allerede, men leste bare `charts.js`,
 * `report.js` og `results.js`. Derfor sto det i fem runder uten aa falle.
 */
test('brukervendte faseetiketter i solver-client er engelske', async () => {
  const client = await import('../js/solver-client.js');
  // «Ø» er bardiameter-symbolet og er korrekt i engelsk utdata, saa det er ikke med.
  const nordisk = /[æåÆÅ]/;
  const norskeOrd = /(er|ikke|som|ved|med|og|kan|skal|blir|ble|laster|regner|starter|bygger|arbeider|kjernen|tverrsnittet)/i;
  for (const [fase, tekst] of Object.entries(client.PHASE_LABELS)) {
    assert.ok(!nordisk.test(tekst), `${fase}: nordisk tegn i «${tekst}»`);
    assert.ok(!norskeOrd.test(tekst), `${fase}: norsk ord i «${tekst}»`);
    assert.ok(tekst.length > 3, `${fase}: tom eller for kort etikett`);
  }
  const ukjent = client.phaseLabel('finnes-ikke');
  assert.ok(!norskeOrd.test(ukjent), `reservenavnet er norsk: «${ukjent}»`);
});

/* -------- withResultView: envelope mot én lastkombinasjon (runde 12) -------- */

const COMBOS_FIX = fixture('result-bending-beam-300x600-combos');

test('withResultView: envelopen er uendret, og ukjente id-er faller tilbake til den', () => {
  // En rad kan forsvinne på tre måter — slettet, et lastet dokument med andre
  // id-er, en delt lenke laget før raden ble til. Alle tre skal gi envelopen,
  // ikke en tom seksjon 6.
  assert.equal(withResultView(COMBOS_FIX, RESULT_VIEW_ENVELOPE), COMBOS_FIX);
  assert.equal(withResultView(COMBOS_FIX, null), COMBOS_FIX);
  assert.equal(withResultView(COMBOS_FIX, 'C99'), COMBOS_FIX);
});

test('withResultView: ÉN rad gir den radens tall, og motorens dom for den raden', () => {
  const row = COMBOS_FIX.bending.combinations.find((c) => c.id === 'C1');
  const view = withResultView(COMBOS_FIX, 'C1');

  // INGEN NY BEREGNING: tallene skal være radens egne, tegn for tegn.
  for (const key of ['M_Rd', 'x', 'x_over_d', 'failure_mode', 'utilisation', 'eps_a', 'chi_y']) {
    assert.deepEqual(view.bending[key], row[key], key);
  }
  assert.equal(view.bending.governing, 'C1');
  assert.equal(view.bending.shear_governing, 'C1');

  // DOMMEN KOMMER FRA MOTOREN, ikke fra en terskel gjentatt her.
  assert.equal(view.checks.bending_ok, row.bending_ok);
  assert.equal(view.checks.shear_ok, row.shear_ok);

  // Kilden er urørt — rapporten bygges av den og skal alltid være envelopen.
  assert.notEqual(view, COMBOS_FIX);
  assert.equal(COMBOS_FIX.bending.governing, 'C1');
});

test('withResultView: en ULS-rad har ingen rissvidde, og da står ikke linja', () => {
  // Uten dette ville envelopens rissvidde blitt stående under et radnavn den
  // ikke gjelder for — et tall lånt fra en annen last.
  const uls = limitStateRows(withResultView(COMBOS_FIX, 'C1')).map((r) => r.key);
  assert.ok(uls.includes('bending'));
  assert.ok(!uls.includes('crack'), 'en ULS-rad skal ikke ha rissviddelinje');

  // …og motsatt: en kvasi-permanent rad kontrolleres ikke for bruddgrense.
  const qp = COMBOS_FIX.sls.rows.find((r) => r.type === 'quasi_permanent');
  const keys = limitStateRows(withResultView(COMBOS_FIX, qp.id)).map((r) => r.key);
  assert.ok(keys.includes('crack'));
  assert.ok(!keys.includes('shear'), 'en SLS-rad har ingen skjærkontroll');
});

test('limitStateRows navngir raden hvert tall kom fra', () => {
  // Linjene ER en envelope, og per grensetilstand hver for seg. Uten navnet kan
  // leseren verken se det, eller vite hvilken rad hen skal gå tilbake til.
  const rows = limitStateRows(COMBOS_FIX);
  for (const r of rows) {
    assert.ok(r.combo, `${r.key} mangler radnavn`);
    assert.ok(r.combo.id, `${r.key} mangler id`);
  }
  const crack = rows.find((r) => r.key === 'crack');
  const qp = COMBOS_FIX.sls.rows.find((r) => r.type === 'quasi_permanent');
  assert.equal(crack.combo.id, qp.id, 'rissvidden skal peke på SLS-raden som gav den');
});
