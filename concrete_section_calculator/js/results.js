/**
 * results.js — resultatformatering og engelske statustekster.
 *
 * HVORFOR DENNE FILA FINNES
 * Motoren snakker maskin: koder, SI-enheter, `null` der et tall ikke finnes,
 * og engelsk pakketekst i `detail`. UI-et og rapporten er nå ALLE engelske
 * (endringsrunde 2, §1), og kN/kNm. Oversettelsen må skje ETT sted, ellers får
 * statuspillen og rapporten hver sin formulering av samme forhold — og da er
 * det ikke lenger mulig å se om de er uenige om ORDET eller om TALLET.
 *
 * TRE INVARIANTER SOM BESKYTTES HER
 *
 * 1. `detail` VISES ALDRI SOM HOVEDMELDING. `structuralcodes` sine advarsler er
 *    exceptions med engelsk pakketekst (plan §3.5), og de er skrevet for den
 *    som leser pakkens kildekode — ikke for en prosjekterende. Derfor er
 *    `CODE_MESSAGES` under den eneste kilden til hovedmeldingen, og en UKJENT
 *    kode gir en plassholder MED koden i, ikke pakkens egen `message`. Faller
 *    det tilbake til pakketeksten «ved et uhell», oppdages det aldri — det ser
 *    bare ut som en detaljert melding.
 *
 * 2. UTNYTTELSESTERSKLENE STÅR BARE HER (plan §7). Statuspillen i UI-et og
 *    resultatboksen i rapporten leser samme `UTILISATION_THRESHOLDS` og samme
 *    `utilisationStatus()`. Skrev rapporten sin egen `> 1.0 ? rød : grønn`,
 *    ville en senere justering av «nær grensa»-terskelen truffet ett av de to
 *    stedene, og skjermen og papiret ville sagt ulike ting om samme tall.
 *
 * 3. ALLE NUMERISKE FELT KAN VÆRE `null` (plan §5.4). `x` og `x_over_d` er
 *    `null` ved nær rent trykk, og `_num()` i `engine.py` gjør hvilket som
 *    helst ikke-endelig tall til `null` framfor å sende `Infinity`/`NaN` som
 *    `JSON.parse` uansett ville kastet på. Formatererne under returnerer
 *    tankestrek for det, aldri «NaN» og aldri «0».
 *
 * HOVEDTALLET OG SEKUNDÆRTALLET
 * `utilisation` i resultatet er ALLTID den vertikale, `M_Ed / M_Rd(N_Ed)`, og
 * er identisk i alle tre analysene (plan §5.2). Den radielle λ fra
 * `charts.js` er et SEKUNDÆRT lastveitall. De to merkes forskjellig her —
 * `HEADLINE_UTILISATION_LABEL` mot `RADIAL_UTILISATION_LABEL` — nettopp fordi
 * de ikke er utbyttbare, og fordi samme snitt og last ikke skal kunne vise to
 * ulike η i to faner.
 *
 * LASTKOMBINASJONER (endringsrunde 2, §4.3)
 * Hver analyseblokk bærer nå `combinations` (alle kombinasjonene som ble
 * regnet) og `governing` (id-en til den som styrer toppnivåfeltene, eller
 * `null` hvis ingen var innenfor [N_min, N_max]). `governingCombo()` og
 * `comboLabel()` slår opp DEN kombinasjonen, slik at rapporten kan si
 * uttrykkelig hvilken av flere lastkombinasjoner et tall gjelder — i stedet
 * for å late som om det bare fantes én.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

import { CONCRETE_LAWS, STEEL_LAWS } from './materials.js';

/* ================================================================== *
 * Tall
 * ================================================================== */

/** Tankestreken som står der et tall ikke finnes. Én kilde, så tester kan låse den. */
export const DASH = '–';

/**
 * Trygg tallkonvertering. `null`, `undefined`, tom streng, `NaN` og
 * `±Infinity` blir alle `null` — ikke 0. Et manglende tall som blir 0 er den
 * verste varianten: det ser ut som et svar.
 */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Engelsk tallformat. Desimalpunktum, og tankestrek for alt som ikke er et
 * tall.
 *
 * `-0.0` lukes bort med vilje: en tøyning på −4·10⁻⁷ er null, og «−0.0 ‰» får
 * en leser til å lure på hvilken vei det går.
 */
export function fmtNumber(value, decimals = 2) {
  const x = toNum(value);
  if (x === null) return DASH;
  let s = x.toFixed(decimals);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s;
}

/** Lengde [mm] slik motoren gir den. */
export function fmtLength(mm, decimals = 1) {
  return fmtNumber(mm, decimals);
}

/** Areal [mm²]. */
export function fmtArea(mm2, decimals = 0) {
  return fmtNumber(mm2, decimals);
}

/** Spenning [MPa]. */
export function fmtStress(mpa, decimals = 1) {
  return fmtNumber(mpa, decimals);
}

/** Kraft: motoren gir N, rapporten viser kN (plan §6). */
export function fmtForceKN(newton, decimals = 1) {
  const x = toNum(newton);
  return x === null ? DASH : fmtNumber(x / 1e3, decimals);
}

/** Moment: motoren gir Nmm, rapporten viser kNm. */
export function fmtMomentKNm(nmm, decimals = 1) {
  const x = toNum(nmm);
  return x === null ? DASH : fmtNumber(x / 1e6, decimals);
}

/**
 * Tøyning i promille. Rå tøyning gir merkelapper som `0.0035` som ingen leser
 * av et betongsnitt; ‰ er den enheten EC2 selv bruker i figurene.
 */
export function fmtStrainPermille(eps, decimals = 2) {
  const x = toNum(eps);
  return x === null ? DASH : fmtNumber(x * 1e3, decimals);
}

/** Krumning i 10⁻⁶/mm, samme akseenhet som `momentCurvatureSvg` bruker. */
export function fmtCurvature(chi, decimals = 2) {
  const x = toNum(chi);
  return x === null ? DASH : fmtNumber(x * 1e6, decimals);
}

/** Forholdstall uten enhet (x/d, ρ, η). */
export function fmtRatio(v, decimals = 3) {
  return fmtNumber(v, decimals);
}

/** Andel som prosent. `0.93` -> `93.0`. */
export function fmtPercent(v, decimals = 1) {
  const x = toNum(v);
  return x === null ? DASH : fmtNumber(x * 100, decimals);
}

/* ================================================================== *
 * Utnyttelse — tersklene, ETT sted (plan §7)
 * ================================================================== */

/**
 * Grensene mellom fargenivåene.
 *
 * `ok` er satt til 0,90 og ikke 1,00 med vilje: et snitt på 0,98 er formelt i
 * orden, men det er ikke et snitt man vil se en grønn pille på når lasten
 * senere justeres opp med to prosent. `over` er 1,00 eksakt — det er
 * bruddgrensetilstanden, ikke en smakssak, og det finnes ingen «nesten OK»
 * over den.
 */
export const UTILISATION_THRESHOLDS = Object.freeze({
  /** η ≤ ok  ⇒ 'ok' */
  ok: 0.9,
  /** ok < η ≤ over ⇒ 'high'; η > over ⇒ 'over' */
  over: 1.0,
});

/**
 * Nivåene, med både en hex-farge (papir, SVG, hva som helst) og et sett
 * Tailwind-klasser til den mørke statuspillen i UI-et. Begge ligger her fordi
 * fargen er en del av statusen, ikke av visningen: en grønn pille og en rød
 * rapportboks for samme η er en selvmotsigelse brukeren ikke kan løse.
 */
export const UTILISATION_LEVELS = Object.freeze({
  ok: Object.freeze({
    level: 'ok',
    label: 'OK',
    color: '#15803d',
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  }),
  high: Object.freeze({
    level: 'high',
    label: 'Near capacity limit',
    color: '#a16207',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  }),
  over: Object.freeze({
    level: 'over',
    label: 'Capacity exceeded',
    color: '#b91c1c',
    classes: 'bg-red-500/15 text-red-300 border-red-500/40',
  }),
  unknown: Object.freeze({
    level: 'unknown',
    label: 'Not calculated',
    color: '#555555',
    classes: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  }),
});

/**
 * Utnyttelse -> status. `null`/manglende tall gir `unknown`, ikke `ok` — et
 * ubesvart spørsmål er ikke et bestått spørsmål.
 *
 * @param {number|null|undefined} eta
 * @returns {{level:string, label:string, color:string, classes:string}}
 */
export function utilisationStatus(eta) {
  const x = toNum(eta);
  if (x === null) return UTILISATION_LEVELS.unknown;
  if (x > UTILISATION_THRESHOLDS.over) return UTILISATION_LEVELS.over;
  if (x > UTILISATION_THRESHOLDS.ok) return UTILISATION_LEVELS.high;
  return UTILISATION_LEVELS.ok;
}

/** Merkelappen på hovedtallet. Formelen står i den, så den ikke kan forveksles. */
export const HEADLINE_UTILISATION_LABEL = 'η = M_Ed / M_Rd(N_Ed)';

/**
 * Merkelappen på den radielle λ fra `charts.js`. Ordet «load path» står i den
 * fordi det er DET som skiller de to tallene: λ følger en proporsjonal økning
 * av både N og M, η holder N fast. De besvarer ulike spørsmål.
 */
export const RADIAL_UTILISATION_LABEL = 'λ (load path — secondary)';

/* ================================================================== *
 * Koder -> engelsk (plan §5.3, §1.3, §1.4)
 * ================================================================== */

/**
 * Minimumssettet fra plan §5.3. Står som egen liste slik at
 * `results.test.mjs` kan påstå at hver eneste av dem har en engelsk tekst —
 * det er den testen som fanger en ny motorkode som ellers ville dukket opp i
 * UI-et som «Unspecified message».
 */
export const ENGINE_CODES = Object.freeze([
  'no_convergence',
  'mc_truncated',
  'bar_in_compression_zone',
  'axial_out_of_range',
  'as_min_not_met',
  'as_max_exceeded',
  'ductility_limit',
  'bar_outside_section',
  // Lagt til etter at motoren begynte å sammenligne pakkas eget sistepunkt på
  // M–κ med M_Rd. Den utløses på STANDARDOPPSETTET (α_cc = 0,85), så uten en
  // tekst ville den vanligste kjøringen vist «Unspecified message».
  'mc_endpoint_mismatch',
  // Skjær, endringsrunde 4 (§4.1b, §4.2). `shear_asl_ambiguous` er `info` og
  // ventet (M_Ed = 0 har ingen strekkside fra momentet). `shear_not_evaluated`
  // er `warning` og kom av en ekte krasj VRdmax/Asw_max fanget under bølge 1 —
  // se `engine.py:_shear_result`.
  'shear_asl_ambiguous',
  'shear_not_evaluated',
  /* --- Runde 6 steg 1: treverdige kontroller (plan §1.1–§1.7) ---
   *
   * HVORFOR TEKSTENE MÅ LIGGE HER OG IKKE I MOTOREN: `describeWarning()`
   * under KASTER motorens egen `message` for enhver kode som står i
   * `CODE_MESSAGES`, og viser bare `detail` ved siden av tabellteksten. Det
   * betyr at den generiske forklaringen — den som sier hva forholdet ER —
   * bare kan komme herfra. Motorens `detail` er tallene i det konkrete
   * tilfellet, ikke forklaringen.
   *
   * Alvorlighetsgraden settes av motoren i `w.severity`; den er skrevet opp
   * her fordi den er en del av kontrakten og ellers bare finnes ett sted:
   *   error   `bending_capacity_exceeded`, `m_rd_below_m_cr`
   *   info    `ductility_not_applicable`, `as_min_not_applicable`
   *   warning `checks_not_evaluated`, `assessment_incomplete`
   *
   * De to `*_not_applicable` er `info` og ikke `warning` med vilje (plan
   * §1.7): «klausulen gjelder ikke denne tilstanden» er ikke et avvik, og en
   * gul trekant på den ville lært brukeren å overse gule trekanter. */
  'bending_capacity_exceeded',
  'm_rd_below_m_cr',
  // MÅLT, IKKE ANTATT: motoren i denne grenen sender sprøbruddet under navnet
  // `brittle_failure_risk` (`engine.py:1379`), ikke `m_rd_below_m_cr` som
  // kontrakten sier. Begge står her så lista er en sann beskrivelse av hva
  // lesesiden kan møte — ikke av hva den skulle ha møtt. Én av dem skal bort
  // når motoren og kontrakten er enige.
  'brittle_failure_risk',
  'ductility_not_applicable',
  'as_min_not_applicable',
  'checks_not_evaluated',
  'assessment_incomplete',
  // STEG 2 — lastkombinasjonstype (§E6). Ingen `uls`-rad i det hele tatt er en
  // ANNEN situasjon enn `axial_out_of_range` (som fortsatt betyr: det FANTES
  // uls-rader, men ingen av dem lå i [n_min, n_max]) — to ulike meldinger.
  'no_uls_combination',
  'mc_active_not_uls',
  /* --- SLS (spec §4) — de tre eneste nye VARSELKODENE, alle `warning`.
   * Grunnkodene PÅ ett SLS-felt (`state_reason`, `crack_reason`, …) er en
   * ANNEN tabell, `SLS_REASON_CODES`/`SLS_REASON_TEXT` under — se den
   * seksjonens hodekommentar for hvorfor de to ikke skal blandes. */
  'sls_incomplete',
  'sls_crack_width_exceeded',
  'sls_stress_limit_exceeded',
]);

/** Kodene `section.js` sin `validate()` kan produsere. Samme tabell, ett oppslag. */
export const VALIDATION_CODES = Object.freeze([
  'invalid_height',
  'invalid_width',
  'no_reinforcement',
  'no_load',
  'invalid_alpha_cc',
  'invalid_gamma_c',
  'invalid_gamma_s',
  'invalid_k',
  'layer_too_wide',
  'layers_overlap',
  // EC2 8.2(2) fri avstand mellom lag (endringsrunde 2, §2.4).
  'insufficient_layer_spacing',
  // Skjærvalidering, endringsrunde 4 §4.4 — samme tabell, ett oppslag.
  'stirrup_spacing_exceeds_max',
  'asw_below_minimum',
  'stirrup_legs_spacing_exceeds_max',
  'invalid_strut_angle',
  'stirrup_alpha_unsupported',
  'stirrup_mixed_fywk',
  'stirrup_multiple_rows_unsupported',
]);

/** Kodene som beskriver svikt i worker/runtime eller i et lastet dokument, ikke i tverrsnittet. */
export const RUNTIME_CODES = Object.freeze([
  'runtime_load_failed',
  'engine_error',
  'worker_error',
  'cancelled',
  'invalid_payload',
  'schema_mismatch',
  // Serialisering (endringsrunde 2, §5) — `fromDocument()` sine merknadskoder.
  'document_not_recognised',
  'document_field_ignored',
  'document_field_defaulted',
  // Serialisering, endringsrunde 4 §2 — en lagret fil med `analysis: 'bending'`
  // og `N_Ed ≠ 0` normaliseres til `nm_domain` ved lasting.
  'analysis_forced_to_nm_domain',
  // «Kjør alle», endringsrunde 5 §D. Den hører hjemme HER og ikke blant
  // valideringskodene: den beskriver en KJØRING som falt ut, ikke noe galt
  // med tverrsnittet. `solver-client.js` eksporterer den som
  // `RUN_ALL_PARTIAL_CODE`.
  'run_all_partial',
  // STEG 2 — `serialize.js:fromDocument` sin note når en fil hadde et `type`-
  // felt `createCombo` måtte rette. En fil HELT UTEN `type` gir IKKE denne
  // noten (den er dekket av `document_field_defaulted`) — se serialize.js.
  'combo_type_unknown',
]);

/**
 * Kodetabellen. Meldingene er skrevet for en prosjekterende: hva som er
 * observert, og hva det betyr for resultatet. Ikke hvilken Python-funksjon som
 * kastet — det står i `detail`.
 */
/**
 * Sprøbruddteksten som EGEN konstant, fordi den må kunne stå under to nøkler
 * uten å bli to tekster. Se kommentaren ved `brittle_failure_risk` under.
 */
const M_RD_BELOW_M_CR_MESSAGE =
  'The bending resistance is smaller than the cracking moment, |M_Rd| < M_cr = ' +
  'W·(f_ctm − N_Ed/A_c). The section fails the instant the concrete cracks, without ' +
  'warning and without deflection to announce it. EC2 9.2.1.1(1) treats a section in ' +
  'this state as unreinforced, whatever reinforcement it holds elsewhere.';

export const CODE_MESSAGES = Object.freeze({
  /* --- motoren (plan §5.3) --- */
  no_convergence:
    'The calculation did not converge across the full strain range. The result shown ' +
    'is the last point found, and the capacity may be underestimated.',
  mc_truncated:
    'The moment–curvature curve is truncated: the engine stopped before the last ' +
    'planned curvature point. The curve is correct as far as it goes, but the failure ' +
    'point is missing.',
  mc_endpoint_mismatch:
    'The curve ends at the bending resistance M_Rd, which is the exact value. The ' +
    "package's own last curvature point lies slightly off, because the equilibrium " +
    'search at failure found a different strain plane than the curvature grid reached. ' +
    "The difference is information about the curve's endpoint, not about the capacity " +
    '— M_Rd is unchanged.',
  bar_in_compression_zone:
    'One or more reinforcement bars lie in the compression zone at failure. With ' +
    'subtract_bar_area = off, the concrete the bar displaces is counted twice, so the ' +
    'capacity ends up slightly on the unsafe side.',
  axial_out_of_range:
    "N_Ed is outside the section's axial capacity [N_min, N_max].",
  as_min_not_met:
    'The reinforcement area is less than the minimum reinforcement A_s,min per EC2 ' +
    '9.2.1.1. The section may fail in a brittle manner at cracking.',
  as_max_exceeded:
    'The reinforcement area exceeds A_s,max = 0.04·A_c per EC2 9.2.1.1(3). Also check ' +
    'the constructability.',
  ductility_limit:
    'The ductility requirement is not met: the tension reinforcement does not yield ' +
    'before the concrete crushes. The failure is brittle and without warning.',
  bar_outside_section:
    'A reinforcement layer lies wholly or partly outside the concrete cross-section. ' +
    'The bar is integrated without surrounding concrete, and the capacity becomes ' +
    'unreliable.',
  shear_asl_ambiguous:
    'M_Ed = 0 for this combination gives no tension side from the moment. The side ' +
    'with the least flexural tension reinforcement is used for A_sl and d — the more ' +
    'conservative of the two.',
  shear_not_evaluated:
    'The shear capacity could not be computed for this load combination: the axial ' +
    'force is too far outside the range the cross-section can carry for the ' +
    'compression strut check to apply. V_Rd is not available for this row.',

  /* --- runde 6 steg 1: treverdige kontroller (plan §1.1–§1.7) --- */
  bending_capacity_exceeded:
    'The design moment exceeds the bending resistance for at least one load ' +
    'combination: M_Ed > M_Rd(N_Ed). The section does not carry the applied moment. ' +
    'Everything else in this report describes a section that would already have failed.',
  m_rd_below_m_cr: M_RD_BELOW_M_CR_MESSAGE,
  /**
   * PROVISORISK ALIAS. Motoren i denne grenen sender koden som
   * `brittle_failure_risk` (`engine.py:1379`), mens kontrakten for denne runden
   * sier `m_rd_below_m_cr`. Uten oppføringen her faller en `error`-advarsel om
   * sprøbrudd — den alvorligste beskjeden modulen kan gi — ned på
   * plassholderen «Unspecified message from the calculation engine», som
   * leseren tar for en programfeil og ikke for en tverrsnittsfeil.
   *
   * Det er SAMME strengkonstant, ikke en kopi: to skrivemåter av én kode er
   * ubehagelig, men to ULIKE tekster for samme forhold ville vært den feilen
   * hele denne fila finnes for å hindre. En test låser at de er identiske.
   * Fjernes når motoren og lesesiden er enige om ett navn.
   */
  brittle_failure_risk: M_RD_BELOW_M_CR_MESSAGE,
  ductility_not_applicable:
    'The ductility requirement was not assessed. No reinforcement lies in the tension ' +
    'zone at the failure strain plane, so there is no tension steel strain to hold ' +
    'against ε_yd. The requirement asks a question this state does not pose — it was ' +
    'neither met nor missed. Check the brittle-failure row instead.',
  as_min_not_applicable:
    'Minimum reinforcement A_s,min was not assessed. EC2 9.2.1.1 builds it from the ' +
    'effective depth d of the tension reinforcement, which does not exist when no ' +
    'layer lies in tension. The brittle-failure row |M_Rd| ≥ M_cr states the same ' +
    'physical requirement without needing d, so nothing is left unchecked.',
  checks_not_evaluated:
    'One or more checks could not be evaluated, because the state they ask about was ' +
    'never computed. Those rows read "–": unanswered, neither passed nor failed.',
  assessment_incomplete:
    'The overall assessment is inconclusive. At least one check could not be ' +
    'answered, so this section has not been vouched for. The technical detail names ' +
    'the rows that are open. Read "–" as a question still open, never as a pass.',
  /* --- STEG 2 — lastkombinasjonstype --- */
  mc_active_not_uls:
    'Moment–curvature traces the failure state of the ACTIVE load combination, and that '
    + 'row is not a ULS combination. Make a ULS row the active one.',
  no_uls_combination:
    'No load combination is of type ULS, so there is no resistance check to run. Any ' +
    'serviceability rows are still evaluated below, in their own section.',

  /* --- SLS (spec §4, §6.3) --- */
  sls_incomplete:
    'One or more serviceability checks under EC2 7.2 or 7.3.4 could not be answered, ' +
    'because a row state, a stress limit or a crack width was never resolved. The ' +
    'technical detail names which checks are open — read them as unanswered, never as ' +
    'passed.',
  sls_crack_width_exceeded:
    'The calculated crack width exceeds the limit w_max for at least one quasi-permanent ' +
    'load combination (EC2 7.3.4). The technical detail names the row and the two ' +
    'numbers compared.',
  sls_stress_limit_exceeded:
    'A stress limit under EC2 7.2 is exceeded for at least one serviceability load ' +
    'combination. The technical detail names which limit.',

  /* --- validering (`section.js`) --- */
  invalid_height: 'Height h must be greater than 0.',
  invalid_width: 'Width b must be greater than 0.',
  no_load:
    'No load effect has been entered: every load combination has N_Ed = M_Ed = V_Ed = 0. '
    + 'The calculation still runs, but the utilisation is 0 and the result says nothing '
    + 'about the section. Enter the design moment in section 4.',
  no_reinforcement: 'The cross-section must have at least one reinforcement layer.',
  invalid_alpha_cc:
    'α_cc must be greater than 0. The package silently interprets 0 as 1.0, so the ' +
    'field cannot be left empty.',
  invalid_gamma_c:
    'γ_c must be greater than 0. The package silently interprets 0 as 1.5, so the ' +
    'field cannot be left empty.',
  invalid_gamma_s: 'γ_s must be greater than 0.',
  invalid_k: 'k = f_tk/f_yk must be at least 1.0.',
  layer_too_wide:
    'The reinforcement layer does not fit within the width given the clear distance ' +
    'requirement (EC2 8.2).',
  layers_overlap:
    'Reinforcement layers overlap. The calculation is still valid, but the input is ' +
    'almost certainly wrong.',
  insufficient_layer_spacing:
    'Clear distance between reinforcement layers is below the EC2 8.2(2) minimum.',
  stirrup_spacing_exceeds_max:
    'Stirrup spacing s exceeds s_l,max = 0.75·d (EC2 9.2.2(6)). Add stirrups or reduce ' +
    'the spacing.',
  asw_below_minimum:
    'The shear reinforcement ratio A_sw/s is below the EC2 9.2.2(5) minimum ' +
    'ρ_w,min·b_w. This applies only where stirrups are present at all — a section ' +
    'without shear reinforcement is not held to this minimum.',
  stirrup_legs_spacing_exceeds_max:
    'With more than two legs, the spacing between legs exceeds s_t,max = ' +
    'min(0.75·d, 600 mm) (EC2 9.2.2(8)). The outer legs still confine the section; ' +
    'the concrete between the inner legs may not.',
  invalid_strut_angle:
    'The strut angle must be between 21.8° and 45° (EC2 6.2.3(2)).',
  stirrup_alpha_unsupported:
    'Only vertical stirrups (α = 90°) are supported by this module.',
  stirrup_multiple_rows_unsupported:
    'Only one stirrup row is supported in this version. The engine would add the rows '
    + 'together as parallel stirrup sets, while the drawing and the cover only show the first.',
  stirrup_mixed_fywk:
    'All stirrup rows must share the same f_ywk: the shear capacity is computed from ' +
    'a single yield strength for the whole section.',

  /* --- kjøretid og dokument --- */
  runtime_load_failed:
    'The calculation engine could not be loaded. Check the network connection, or ' +
    'whether a filter blocks cdn.jsdelivr.net, and try again.',
  engine_error:
    'The calculation engine stopped with an internal error. The numbers from this run ' +
    'cannot be used.',
  worker_error:
    'The calculation thread did not respond as expected. Reload the page and try again.',
  cancelled: 'The calculation was cancelled.',
  invalid_payload:
    'The input sent to the engine was incomplete. Check the geometry, materials and ' +
    'reinforcement.',
  schema_mismatch:
    'The engine and the interface use different versions of the data contract. Clear ' +
    'the browser cache and reload the page.',
  document_not_recognised: 'This is not a concrete section calculator file.',
  document_field_ignored: 'An unknown field in the file was ignored.',
  document_field_defaulted: 'A missing field in the file was filled with its default.',
  run_all_partial:
    'One of the analyses in "Run all" did not complete. The results shown are from the ' +
    'analyses that did — the technical detail says which one is missing and why. ' +
    'Anything that analysis alone would have shown is absent from the result and from ' +
    'the report.',
  analysis_forced_to_nm_domain:
    'The file requested bending resistance with a non-zero axial force. A resistance ' +
    'quoted at a single axial force is one point on a curve, so the analysis was ' +
    'changed to the N–M interaction domain on load.',
  combo_type_unknown:
    'A load combination in the file had an unrecognised combination type. It has ' +
    'been treated as ULS.',
});

/**
 * Engelsk melding for en kode.
 *
 * Ukjent kode gir en plassholder MED koden i — ikke `detail`, og ikke
 * motorens egen `message`. Det er poenget: en kode ingen har oversatt skal
 * være synlig som nettopp det, ikke gjemme seg bak rå pakketekst som ser ut
 * som en grundig melding.
 */
export function messageForCode(code, fallback) {
  const key = String(code || '').trim();
  if (Object.prototype.hasOwnProperty.call(CODE_MESSAGES, key)) return CODE_MESSAGES[key];
  if (fallback) return fallback;
  return `Unspecified message from the calculation engine (code: "${key || 'unknown'}"). ` +
         'The details are raw package text.';
}

/** Alvorlighetsgradene, engelsk. `info` finnes i kontrakten og skal ikke se ut som en feil. */
export const SEVERITY_LABELS = Object.freeze({
  info: 'Note',
  warning: 'Warning',
  error: 'Error',
});

export function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || SEVERITY_LABELS.warning;
}

/**
 * En advarsel fra motoren eller valideringen -> visningsklar form.
 *
 * `detail` samler ALL rå tekst: både `w.detail` og en eventuell `w.message`
 * som ikke kom fra kodetabellen. Dermed går ingenting tapt for den som vil
 * grave, samtidig som hovedmeldingen garantert er den oversatte teksten.
 *
 * `combo`/`combo_name` (endringsrunde 2, §4.4): en `axial_out_of_range`-
 * advarsel er merket med HVILKEN lastkombinasjon den gjelder, fordi
 * `messageForCode` kaster motorens egen `message` for kjente koder — uten
 * dette feltet ville kombinasjonsnavnet forsvunnet bak kodetabellen. Er
 * feltet satt, settes navnet (eller id-en, hvis navnet er tomt) foran
 * hovedmeldingen.
 *
 * @param {{code?:string, severity?:string, message?:string, detail?:string,
 *          combo?:string, combo_name?:string}} w
 */
export function describeWarning(w = {}) {
  const code = String(w.code || '').trim();
  const known = Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code);
  const raw = [];
  // Motorens egen `message` er bare rå tekst NÅR koden er ukjent; er koden
  // kjent, er tabellteksten den autoritative og `message` en dublett.
  if (!known && w.message) raw.push(String(w.message));
  if (w.detail) raw.push(String(w.detail));
  const base = messageForCode(code);
  const comboLabelText = String(w.combo_name || w.combo || '').trim();
  const message = comboLabelText ? `${comboLabelText}: ${base}` : base;
  return {
    code: code || 'unknown',
    severity: w.severity || 'warning',
    severityLabel: severityLabel(w.severity),
    message,
    combo: w.combo ?? null,
    combo_name: w.combo_name ?? null,
    detail: raw.length ? raw.join(' · ') : '',
    hasDetail: raw.length > 0,
  };
}

/** Hele `result.warnings`-lista, i samme rekkefølge motoren ga den. */
export function describeWarnings(warnings) {
  return (Array.isArray(warnings) ? warnings : []).map(describeWarning);
}

/** `{ok:false}`-svaret (plan §5.2). Samme regel: oversatt melding, rå tekst i detail. */
export function describeError(error = {}) {
  return describeWarning({ ...error, severity: 'error' });
}

/* ================================================================== *
 * Bruddform, kontroller og øvrige merkelapper
 * ================================================================== */

/**
 * `failure_mode`-verdiene (plan §5.2, utvidet i runde 6 §1.5). `note` sier hva
 * bruddformen betyr for duktiliteten — som er hele grunnen til at man leser
 * feltet.
 */
export const FAILURE_MODES = Object.freeze({
  concrete_crushing: Object.freeze({
    label: 'Concrete crushing',
    note:
      'The concrete reaches ε_cu while the tension reinforcement has yielded. This is ' +
      'the normal, warned failure for an under-reinforced section.',
  }),
  steel_rupture: Object.freeze({
    label: 'Steel rupture',
    note:
      'The reinforcement reaches ε_ud before the concrete crushes. The section is ' +
      'under-reinforced; the failure is signalled by large deflections and cracking.',
  }),
  over_reinforced: Object.freeze({
    label: 'Over-reinforced — steel does not yield',
    note:
      'The concrete crushes before the tension reinforcement reaches the yield ' +
      'strain. The failure is brittle and without warning.',
  }),
  compression_no_tension: Object.freeze({
    label: 'Compression only — no tension zone',
    note:
      'The entire cross-section is in compression at failure. The bending resistance ' +
      'is governed by the axial force, not by the reinforcement in tension.',
  }),
  /**
   * Runde 6 steg 1 (plan §1.5). Utløses av |M_Rd| < M_cr og står FORAN
   * `steel_rupture` i motorens `_classify`.
   *
   * HVORFOR EN EGEN BRUDDFORM OG IKKE `over_reinforced`: tøyningstilstanden i
   * det målte hogging-tilfellet ER at betongen knuses før jernet flyter, så
   * `over_reinforced` er ikke galt som tilstandsbeskrivelse. Men den er galt
   * som FORKLARING — den sier «du har for mye armering» til en som har for
   * lite på den siden som står i strekk, og den handlingen brukeren utleder
   * (fjerne jern) gjør snittet verre. Navnet må peke på tiltaket.
   *
   * Uten denne oppføringen skriver `failureModeLabel` «Unknown failure mode
   * ("unreinforced_tension_zone")» rett ut i rapporten.
   */
  unreinforced_tension_zone: Object.freeze({
    label: 'Unreinforced tension zone — fails at cracking',
    note:
      'The bending resistance is below the cracking moment M_cr, so the section fails ' +
      'in the same instant the concrete cracks: there is no reserve between first crack ' +
      'and collapse, and no deflection to warn anyone. EC2 9.2.1.1(1) treats a section ' +
      'in this state as unreinforced. The remedy is reinforcement on the face that ' +
      'carries tension, not less reinforcement elsewhere.',
  }),
});

export function failureModeLabel(mode) {
  return FAILURE_MODES[mode]?.label || (mode ? `Unknown failure mode ("${mode}")` : DASH);
}

export function failureModeNote(mode) {
  return FAILURE_MODES[mode]?.note || '';
}

/**
 * `checks`-blokka (plan §5.2). Rekkefølgen er fast slik at kontrolltabellen i
 * rapporten ikke stokker om seg når motoren endrer nøkkelrekkefølge —
 * `Object.keys` gir ingen garanti man kan trykke på papir.
 */
export const CHECK_ORDER = Object.freeze([
  'geometry_ok',
  'axial_ok',
  'as_min_ok',
  // Runde 6 §1.5 — RETT ETTER `as_min_ok`, fordi de to svarer på samme
  // klausul: A_s,min er EC2 9.2.1.1 sitt forenklede surrogat for nettopp
  // |M_Rd| ≥ M_cr. Står de ved siden av hverandre, ser leseren umiddelbart
  // når surrogatet og det fysiske kriteriet er uenige — og det er akkurat der
  // `d` har degenerert, altså der A_s,min ikke lenger gjelder.
  'brittle_ok',
  'as_max_ok',
  'ductility_ok',
  // Runde 6 §1.2 — RETT FØR `shear_ok`: de to er lastvirkning-mot-kapasitet-
  // kontrollene og er symmetriske (η = M_Ed/M_Rd mot η_V = V_Ed/V_Rd). Sto
  // bøyekontrollen lenger opp, ville den blitt lest som en armeringsregel.
  'bending_ok',
  // Skjær, endringsrunde 4 §4.3 — FØR `all_ok`, som fortsatt skal stå sist:
  // uten disse tre her emitterer `checkRows()` dem aldri, og de tre nye
  // kontrollene ville vært stille fraværende fra rapporten (plan §10 punkt 2).
  'shear_ok',
  'asw_min_ok',
  'stirrup_spacing_ok',
  'all_ok',
]);

export const CHECK_LABELS = Object.freeze({
  geometry_ok: 'Geometry and reinforcement placement',
  axial_ok: 'N_Ed within [N_min, N_max]',
  as_min_ok: 'Minimum reinforcement A_s,min (EC2 9.2.1.1)',
  brittle_ok: 'Brittle failure — M_Rd ≥ M_cr (EC2 9.2.1.1(1))',
  as_max_ok: 'Maximum reinforcement A_s,max = 0.04·A_c',
  ductility_ok: 'Ductility — tension reinforcement yields at failure',
  // Ordlyden speiler `shear_ok` med vilje: samme setningsform for samme slags
  // kontroll, så en leser ser at de to hører sammen uten å bli fortalt det.
  bending_ok: 'Bending capacity M_Ed ≤ M_Rd(N_Ed), all combinations',
  shear_ok: 'Shear capacity V_Ed ≤ V_Rd, all combinations (EC2 6.2)',
  asw_min_ok: 'Minimum shear reinforcement A_sw/s ≥ A_sw/s,min (EC2 9.2.2(5))',
  stirrup_spacing_ok: 'Stirrup spacing s ≤ s_l,max (EC2 9.2.2(6))',
  all_ok: 'Overall assessment',
});

export const CHECK_PASS_TEXT = 'OK';
export const CHECK_FAIL_TEXT = 'Not OK';
/** En kontroll motoren ikke rapporterte er UBESVART, ikke bestått. */
export const CHECK_UNKNOWN_TEXT = DASH;

export function checkText(ok) {
  if (ok === true) return CHECK_PASS_TEXT;
  if (ok === false) return CHECK_FAIL_TEXT;
  return CHECK_UNKNOWN_TEXT;
}

/** Kontrolltabellen, ferdig sortert og oversatt. */
export function checkRows(checks = {}) {
  return CHECK_ORDER.map((key) => {
    const ok = Object.prototype.hasOwnProperty.call(checks || {}, key) ? checks[key] : null;
    return { key, label: CHECK_LABELS[key], ok, text: checkText(ok) };
  });
}

/** Retningen, med hvilken kant som er i trykk — det er dét man må vite. */
export const DIRECTION_LABELS = Object.freeze({
  sagging: 'Sagging — compression at the top face (θ = 0)',
  hogging: 'Hogging — compression at the bottom face (θ = π)',
});

export function directionLabel(direction) {
  return DIRECTION_LABELS[direction] || DASH;
}

/**
 * Retningen en KOMBINASJON selv bærer, avledet fra dens `theta` (plan §4.1,
 * §4.3 — kombinasjonene lagres med `theta`, ikke med `direction`-strengen).
 * `null` for et ikke-tall, slik at kallere kan skille «ukjent» fra «sagging».
 */
export function directionFromTheta(theta) {
  const t = toNum(theta);
  if (t === null) return null;
  return Math.abs(t) > Math.PI / 2 ? 'hogging' : 'sagging';
}

/**
 * «Kjør alle» (endringsrunde 5 §D). Verdien er den SAMME strengen som
 * `store.js` eksporterer som `RUN_ALL`, men den er skrevet av her i stedet for
 * importert: `results.js` er ren og avhenger bare av `materials.js` (jf.
 * hodekommentaren), mens `store.js` drar med seg `rebar.js` og `section.js` —
 * hele tilstandslaget inn i en formateringsfil. Duplikatet er i stedet låst av
 * en test som importerer BEGGE og påstår at de er like, slik at de ikke kan
 * drive fra hverandre uten at testen faller.
 */
export const RUN_ALL_ANALYSIS = 'all';

/**
 * Rekkefølgen `analysisBlock()` leter i når et «kjør alle»-resultat MANGLER
 * `primary` (eller peker på en analyse som falt ut). Bøying står først med
 * vilje: `solver-client.js` sin `runAllPlan` tar bare bøying med når INGEN
 * kombinasjon har aksialkraft, så finnes blokka i det hele tatt, ER den
 * kapasitetsanalysen. `moment_curvature` står sist fordi den ikke bærer noe
 * bruddplan — den er en kurve, ikke en kapasitetsberegning.
 */
export const RUN_ALL_BLOCK_ORDER = Object.freeze(['bending', 'nm_domain', 'moment_curvature']);

export const ANALYSIS_LABELS = Object.freeze({
  bending: 'Bending resistance',
  moment_curvature: 'Moment–curvature',
  nm_domain: 'N–M interaction domain',
  // Samme ordlyd som chippen i `ui.js` har i dag, slik at den lokale
  // `RUN_ALL_LABEL` der kan slettes uten at teksten på skjermen endrer seg.
  [RUN_ALL_ANALYSIS]: 'Run all',
});

export function analysisLabel(analysis) {
  return ANALYSIS_LABELS[analysis] || DASH;
}

export const SECTION_TYPE_LABELS = Object.freeze({
  beam: 'Beam',
  slab: 'Slab (per metre width)',
});

export function sectionTypeLabel(type) {
  return SECTION_TYPE_LABELS[type] || DASH;
}

/**
 * Arbeidsdiagramnavnene hentes fra `materials.js` sine lister i stedet for å
 * skrives av. To lister ville kunnet si ulike ting om samme `law`-verdi, og
 * rapporten er akkurat stedet der det ville stått uimotsagt.
 */
const LAW_LABELS = Object.freeze({
  ...Object.fromEntries(CONCRETE_LAWS.map((l) => [l.value, l.label])),
  ...Object.fromEntries(STEEL_LAWS.map((l) => [l.value, l.label])),
});

export function lawLabel(value) {
  return LAW_LABELS[value] || (value ? String(value) : DASH);
}

/**
 * Hvilken KANT som er i trykk for den analyserte retningen.
 *
 * Dette er ikke pynt: `bending.eps_c_top` er tøyningen ved TRYKKANTEN for den
 * analyserte retningen (plan §5.2), og for støttemoment (θ = π) er det
 * UNDERKANTEN. Skriver rapporten «top face» ukritisk, står det feil kant ved
 * riktig tall — den typen feil ingen oppdager fordi tallet stemmer.
 */
export function compressionEdgeLabel(theta) {
  const t = toNum(theta);
  if (t === null) return DASH;
  return Math.abs(Math.cos(t)) < 1e-9 ? 'compression face' : Math.cos(t) >= 0 ? 'top face' : 'bottom face';
}

/** Motsatt kant av `compressionEdgeLabel`. */
export function tensionEdgeLabel(theta) {
  const c = compressionEdgeLabel(theta);
  if (c === 'top face') return 'bottom face';
  if (c === 'bottom face') return 'top face';
  return c;
}

/* ================================================================== *
 * Oppslag i resultatet
 * ================================================================== */

/**
 * Analysens egen blokk (`bending` | `moment_curvature` | `nm_domain`).
 *
 * «KJØR ALLE» HAR INGEN EGEN BLOKK (endringsrunde 5 §D). `analysis: 'all'` er
 * en KLIENTSIDE-analyse: `solver-client.js` kjører de lovlige analysene etter
 * hverandre og legger hver motorblokk under sitt eget navn, med `primary` som
 * peker på KAPASITETSanalysen (`nm_domain` når en kombinasjon har aksialkraft,
 * ellers `bending`). `result.all` finnes altså ikke, og uten denne grenen
 * ville funksjonen returnert `null` — og hele resultatpanelet og rapporten
 * ville vist tankestrek for en kjøring som faktisk har alle tallene.
 *
 * REGELEN STÅR BARE HER (plan §D). `headlineUtilisation`, `momentCapacity`,
 * `failureState`, `allCombinations`, `governingCombo` og
 * `shearGoverningCombo` går alle gjennom denne ene funksjonen og arver den.
 * Skrives regelen av ett sted til, er det det stedet som blir stående igjen
 * når «kjør alle» en dag får en fjerde blokk.
 *
 * EN BLOKK KAN MANGLE: feiler én analyse, leverer klienten de andre og setter
 * en `run_all_partial`-advarsel. Da kan `result[result.primary]` være
 * `undefined`, og vi faller tilbake på `RUN_ALL_BLOCK_ORDER` i stedet for å
 * kaste eller å svare `null` mens det fortsatt finnes tall å vise.
 */
export function analysisBlock(result) {
  if (!result || !result.analysis) return null;
  if (result.analysis === RUN_ALL_ANALYSIS) {
    for (const key of [result.primary, ...RUN_ALL_BLOCK_ORDER]) {
      if (key && result[key]) return result[key];
    }
    return null;
  }
  return result[result.analysis] || null;
}

/**
 * Hovedtallet: den VERTIKALE utnyttelsen, `M_Ed / M_Rd(N_Ed)`. Identisk i alle
 * tre analysene (plan §5.2), og derfor hentet fra analysens egen blokk uten
 * noen omregning.
 */
export function headlineUtilisation(result) {
  return toNum(analysisBlock(result)?.utilisation);
}

/**
 * Blokka som bærer BRUDDTILSTANDEN: `eps_a`, `chi_y`, `x`, `x_over_d`,
 * `eps_c_top`, `eps_s_max`, `failure_mode` og `layers`.
 *
 * HVORFOR DETTE IKKE ER `result.bending`
 * `nm_domain` bærer nå de samme åtte feltene, med NØYAKTIG samme nøkkelnavn,
 * for tilstanden ved `N_Ed`. Slo rapporten opp i `result.bending` direkte,
 * ville hele tøyningsplanet forsvunnet fra M–N-rapporten uten at noe feilet —
 * kapittel 5 ville bare vært kortere. `failure_mode` brukes som markør fordi
 * det er feltet som finnes hvis og bare hvis blokka faktisk beskriver et
 * bruddplan.
 *
 * MERK at feltene i `nm_domain` gjelder tilstanden ved `N_Ed`, ikke et
 * vilkårlig punkt på omhyllingen. Se `failureStateIsAtNEd()` — rapporten skal
 * si det der tallene vises, ellers er de misvisende.
 */
export function failureState(result) {
  const blk = analysisBlock(result);
  if (blk && blk.failure_mode !== undefined) return blk;
  if (result?.bending?.failure_mode !== undefined) return result.bending;
  return null;
}

/**
 * Sant når bruddtilstanden hører til en omhylling og derfor MÅ merkes med at
 * den gjelder ved `N_Ed`. For `bending` er det selvsagt og trenger ingen
 * påminnelse; for `nm_domain` er det tvert imot det leseren lett tar feil av,
 * fordi resten av blokka beskriver 69 andre punkter.
 */
export function failureStateIsAtNEd(result) {
  // MARKEREN ER BLOKKA, IKKE ANALYSENAVNET (endringsrunde 5 §D). Med
  // `analysis: 'all'` er navnet 'all' selv om tallene kommer fra
  // `nm_domain`-blokka, og en test mot analysenavnet ville droppet nettopp
  // den merknaden som sier at tallene gjelder ett punkt og ikke hele
  // omhyllingen — riktige tall uten forbeholdet de trenger.
  const fs = failureState(result);
  return fs !== null && fs === result?.nm_domain;
}

/**
 * Momentkapasiteten, uansett analyse. `nm_domain` bærer den som `M_Rd_at_N`
 * fordi den kommer fra et eget bøyekall ved `N_Ed` — samme tall, annet navn.
 */
export function momentCapacity(result) {
  const b = analysisBlock(result);
  if (!b) return null;
  return toNum(b.M_Rd !== undefined ? b.M_Rd : b.M_Rd_at_N);
}

/** Dimensjonerende moment slik analysen så det (Nmm, størrelse). */
export function designMoment(result) {
  return toNum(analysisBlock(result)?.M_Ed);
}

/** Dimensjonerende normalkraft (N, fortegnsatt — trykk negativ). */
export function designAxial(result) {
  return toNum(analysisBlock(result)?.N_Ed);
}

/** Status for hovedtallet, klar til pille og rapportboks. */
export function resultStatus(result) {
  return utilisationStatus(headlineUtilisation(result));
}

/**
 * ALLE lastkombinasjonene analysen ble kjørt mot (endringsrunde 2, §4.3), i
 * den rekkefølgen motoren ga dem. Tom array når blokka ikke bærer feltet
 * (eldre fixtur, eller en test som bevisst strippet det).
 */
export function allCombinations(result) {
  const blk = analysisBlock(result);
  return Array.isArray(blk?.combinations) ? blk.combinations : [];
}

/**
 * Kombinasjonen som STYRER toppnivåfeltene i analyseblokka (plan §4.3).
 * `null` når blokka ikke har `governing` (eldre fixtur) eller når INGEN
 * kombinasjon var innenfor [N_min, N_max] — da er toppnivåfeltene hentet fra
 * den FØRSTE kombinasjonen i stedet, men ingen er «governing».
 */
export function governingCombo(result) {
  const blk = analysisBlock(result);
  const id = blk?.governing;
  if (id === undefined || id === null) return null;
  return allCombinations(result).find((c) => c.id === id) || null;
}

/**
 * Visningsnavnet for en kombinasjon: navnet hvis satt, ellers id-en. Samme
 * regel som `charts.js` sin `nmDomainSvg` bruker på lastpunktene (plan §7) —
 * én kilde til «hva kaller vi denne raden», ikke to formuleringer av det.
 */
export function comboLabel(combo) {
  if (!combo) return DASH;
  const name = String(combo.name || '').trim();
  return name || String(combo.id || '') || DASH;
}

/**
 * Kombinasjonen som styrer SKJÆR (`<analyse>.shear_governing`, plan §4.3) —
 * et EGET, uavhengig valg fra `governing`: en rad med stor `V_Ed` og lite
 * `M_Ed` kan styre skjær uten i nærheten av å styre bøying. `null` når ingen
 * kombinasjon fikk `shear.evaluated: true` (eldre fixtur uten
 * `section.shear` i payloaden, eller alle utenfor trykkstavens gyldige
 * aksialintervall).
 */
export function shearGoverningCombo(result) {
  const blk = analysisBlock(result);
  const id = blk?.shear_governing;
  if (id === undefined || id === null) return null;
  return allCombinations(result).find((c) => c.id === id) || null;
}

/** η_V for den skjær-dimensjonerende kombinasjonen, eller `null`. */
export function shearHeadlineUtilisation(result) {
  return toNum(shearGoverningCombo(result)?.shear?.utilisation);
}

/**
 * Merkelappen på skjærmerket. STÅR ALENE, ved siden av `HEADLINE_UTILISATION_LABEL`
 * — de to slås ALDRI sammen til ett tall (plan §4.3): samme snitt skal aldri
 * vise to ulike η under samme navn.
 */
export const SHEAR_UTILISATION_LABEL = 'η_V = V_Ed / V_Rd';

/** `governing_mode` fra skjærresultatet (plan §4.2), engelsk. */
export const SHEAR_GOVERNING_MODE_LABELS = Object.freeze({
  no_stirrups: 'No stirrups — V_Rd = V_Rd,c',
  stirrups: 'Stirrups govern — V_Rd = V_Rd,s',
  strut_crushing: 'Strut crushing governs — V_Rd = V_Rd,max',
});

export function shearGoverningModeLabel(mode) {
  return SHEAR_GOVERNING_MODE_LABELS[mode] || (mode ? `Unknown mode ("${mode}")` : DASH);
}

/**
 * Er resultatet brukbart? `ok: false` sendes som et gyldig `result` fra
 * workeren (plan §3.3) — `axial_out_of_range` er et svar brukeren skal se, og
 * skal derfor ikke behandles som en krasj her heller.
 */
export function isUsable(result) {
  return Boolean(result && result.ok);
}

/* ================================================================== *
 * SLS — EC2 7.2 (spenningsbegrensning) og 7.3.4 (rissvidde)
 * global-devspecs/concrete_section_calculator-sls.md §4, §6, §14
 *
 * HVORFOR EN EGEN SEKSJON HER OG IKKE I `CODE_MESSAGES`
 * `result.sls.rows[i].state_reason`/`crack_reason` og `crack.ok_reason` er
 * IKKE motorens `warnings`-koder (`ENGINE_CODES` over) — de er grunnkoder på
 * ETT FELT i én rad, aldri en hendelse i `result.warnings`. Blander vi de to
 * tabellene, kan en rissvidde-grunnkode ved et uhell slå ut som «Unspecified
 * message from the calculation engine» i STEDET for varselteksten, eller
 * omvendt. Én tabell, én betydning.
 *
 * INGEN PROSA FRA EC2 ER GJENGITT (spec §14). Etikettene og forklaringene
 * under er formulert av oss; punktreferansen er en HENVISNING (fakta), ikke
 * et sitat.
 * ================================================================== */

/** Radtypene SLS faktisk bærer (spec §1.5). `uls`-rader kommer aldri hit. */
export const SLS_ROW_TYPE_LABELS = Object.freeze({
  characteristic: 'Characteristic',
  quasi_permanent: 'Quasi-permanent',
});

export function slsRowTypeLabel(type) {
  return SLS_ROW_TYPE_LABELS[type] || DASH;
}

/**
 * `sls.checks`-nøklene, i den rekkefølgen spec §4 lister dem — betong under
 * karakteristisk last, stål under karakteristisk last, betong VED PÅFØRING
 * under tilnærmet permanent last, rissvidde. Etikettene er de spec §4 selv
 * gir (våre egne ord, med punktreferanse — ikke standardens tekst).
 */
export const SLS_CHECK_ORDER = Object.freeze([
  'sigma_c_char_ok',
  'sigma_s_char_ok',
  'sigma_c_qp_ok',
  'crack_width_ok',
]);

export const SLS_CHECK_LABELS = Object.freeze({
  sigma_c_char_ok: 'Concrete stress under characteristic load ≤ k·f_ck (EC2 7.2(2))',
  sigma_s_char_ok: 'Reinforcement stress under characteristic load ≤ k·f_yk (EC2 7.2(5))',
  sigma_c_qp_ok:
    'Concrete stress at first loading under quasi-permanent load ≤ k·f_ck — the ' +
    'condition for treating creep as linear (EC2 7.2(3))',
  crack_width_ok: 'Crack width w_k ≤ w_max (EC2 7.3.4)',
});

/**
 * `sls.checks`/`sls.not_applicable` → én radliste, ferdig sortert.
 *
 * IKKE `checkRows()` (over). Den gjør en MANGLENDE nøkkel til `null` —
 * riktig for `result.checks`, der en nøkkel alltid gjelder. I `sls.checks`
 * betyr en manglende nøkkel derimot «gjelder ikke for disse radene», og
 * grunnen står i `sls.not_applicable` (spec §4). Kjørte denne gjennom
 * `checkRows()`, ville hver `not_applicable`-linje vist en tankestrek som om
 * den var ubesvart — nøyaktig den forvekslingen §2.1 i spec-en advarer mot
 * for `sigma_c_char_ok = null` mot `not_applicable`.
 *
 * @param {object} sls  `result.sls`
 * @returns {Array<{key, label, ok, text, applicable, reason}>}
 */
export function slsCheckRows(sls = {}) {
  const checks = sls.checks || {};
  const notApplicable = sls.not_applicable || {};
  const out = [];
  for (const key of SLS_CHECK_ORDER) {
    if (Object.prototype.hasOwnProperty.call(checks, key)) {
      const ok = checks[key];
      out.push({ key, label: SLS_CHECK_LABELS[key], ok, text: checkText(ok), applicable: true, reason: '' });
    } else if (Object.prototype.hasOwnProperty.call(notApplicable, key)) {
      out.push({
        key, label: SLS_CHECK_LABELS[key], ok: null, text: '', applicable: false,
        reason: String(notApplicable[key] || ''),
      });
    }
  }
  return out;
}

/**
 * Grunnkodene motoren kan sette på ETT SLS-felt (spec §3.5, §11) — IKKE
 * varselkoder. To kilder samlet i én tabell: `state_reason`/`crack_reason`
 * (spec §1.2/§3.5, ni koder) og `w_max_reason`/`crack.ok_reason` (spec §2.1/
 * §3.5, to koder til). Rekkefølgen har ingen betydning; testen under påstår
 * at listen er UTTØMMENDE for det motoren faktisk emitterer (spec §4: «Den
 * engelske teksten bor i results.js ... en test skal påstå at hver kode
 * motoren kan emittere ... har en tekst, og at ingen tekst finnes uten en
 * kode»).
 */
export const SLS_REASON_CODES = Object.freeze([
  'uncracked',
  'not_quasi_permanent',
  'fully_in_tension',
  'no_equilibrium_cracked',
  'stresses_outside_elastic_range',
  'no_tension_reinforcement',
  'no_bonded_bars_in_effective_area',
  'no_tensile_stress_in_effective_area',
  'no_bar_spacing',
  'no_exposure_class',
  'no_crack_width_limit',
  'sigma_c_char_not_required',
]);

export const SLS_REASON_TEXT = Object.freeze({
  uncracked:
    'The section is uncracked: the tensile stress in the uncracked, transformed section ' +
    'does not exceed f_ct,eff (EC2 7.1(2)). There is no crack to size.',
  not_quasi_permanent:
    'Crack width is only assessed for a quasi-permanent load combination — a ' +
    'characteristic row answers the two stress limits instead.',
  fully_in_tension:
    'Both concrete faces are in tension in the uncracked state. A cross-section ' +
    'entirely in tension needs an effective tension zone per face rather than the ' +
    'single zone this assessment builds, and is outside its scope for now.',
  no_equilibrium_cracked:
    'No equilibrium was found for the cracked section with this reinforcement under ' +
    'this load. The linear cracked-section state cannot be answered for this row.',
  stresses_outside_elastic_range:
    'The linear-elastic model no longer holds: the reinforcement or the concrete has ' +
    'reached its strength in this state. A section already yielded or crushed under a ' +
    'service load cannot be described by a linear stress plane.',
  no_tension_reinforcement:
    'No reinforcement layer is in tension at this load, so there is no crack to size.',
  no_bonded_bars_in_effective_area:
    'No tension layer has its centroid inside the effective tension area A_c,eff, so no ' +
    'bar can be tied to the crack.',
  no_tensile_stress_in_effective_area:
    'The layers inside the effective tension area A_c,eff carry no tensile stress at ' +
    'this load.',
  no_bar_spacing:
    'None of the layers inside the effective tension area has a bar spacing to report ' +
    '— a layer with a single bar has no neighbour to measure to — so the crack spacing ' +
    'cannot be derived.',
  no_exposure_class:
    'No exposure class is selected, so no recommended crack width limit applies, and it ' +
    'is not known whether EC2 7.2(2) applies to the concrete stress either.',
  no_crack_width_limit:
    'The selected exposure class has no recommended crack width limit, and no manual ' +
    'value has been entered in its place.',
  sigma_c_char_not_required:
    'EC2 7.2(2) limits the concrete compressive stress under the characteristic ' +
    'combination only for the exposure classes where longitudinal cracking matters — ' +
    'XD, XF and XS. The stress is reported for this row, but no limit is imposed on it.',
});

/**
 * Engelsk tekst for en SLS-grunnkode. Ukjent kode gir en plassholder MED
 * koden i — samme regel som `messageForCode()`, og for samme grunn: en kode
 * ingen har oversatt skal være synlig som nettopp det.
 */
export function slsReasonText(code) {
  const key = String(code || '').trim();
  if (Object.prototype.hasOwnProperty.call(SLS_REASON_TEXT, key)) return SLS_REASON_TEXT[key];
  return key ? `Unspecified reason from the calculation engine (code: "${key}").` : DASH;
}

/**
 * Den STYRENDE utnyttelsen for ÉN SLS-rad — den STØRSTE av utnyttelsene som
 * FAKTISK ble regnet for raden (betongtrykk, stålstrekk, rissvidde). `null`
 * når INGEN av dem kunne regnes — en rad uten et eneste svar skal ikke vises
 * som en rad med margin (samme regel som `utilisationStatus(null)`).
 *
 * Dette er en SEKUNDÆR, avledet størrelse for den ene sammendragslinja per
 * rad (spec §6.2: «type · M_Ed · σ_c · σ_s · w_k · w_max · η»). Den siterer
 * ALDRI et tall som ikke står i raden selv — den velger bare den største av
 * de tallene som allerede er der.
 */
export function slsRowUtilisation(row = {}) {
  const vals = [];
  // RETTET i runde 10 (K5): en utnyttelse teller BARE når den tilhørende
  // kontrollen faktisk felte en dom. σ_c/0,6·f_ck er et tall også for en
  // XC-klasse, men EC2 7.2(2) gjelder ikke der, og η er «den styrende
  // utnyttelsen av det som ble kontrollert». Uten denne regelen kunne radens
  // η være drevet av nøyaktig den grensa kontrollisten over den sier ikke
  // gjelder — samme tall, to svar.
  const push = (v, ok) => {
    if (typeof ok !== 'boolean') return;
    const n = toNum(v);
    if (n !== null) vals.push(n);
  };
  push(row.stress?.sigma_c_util, row.stress?.sigma_c_ok);
  push(row.stress?.sigma_s_util, row.stress?.sigma_s_ok);
  push(row.crack?.utilisation, row.crack?.ok);
  return vals.length ? Math.max(...vals) : null;
}

/**
 * Rissvidden som skal stå bakerst i `#res-summary` (spec §6.2): den STØRSTE
 * `w_k` blant SLS-radene som faktisk fikk en regnet rissvidde. `null` når
 * INGEN rad har en — da skal sammendraget ikke få noe ekstra i det hele
 * tatt («Er ingen rissvidde regnet, står det ingenting. Ikke mer.»).
 */
export function slsHeadlineCrack(result) {
  const rows = Array.isArray(result?.sls?.rows) ? result.sls.rows : [];
  let worst = null;
  for (const row of rows) {
    const wk = toNum(row?.crack?.w_k);
    if (wk === null) continue;
    if (worst === null || wk > worst.w_k) worst = { w_k: wk, w_max: toNum(row.crack.w_max) };
  }
  return worst;
}
