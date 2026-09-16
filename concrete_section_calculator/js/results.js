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
]);

/** Kodene `section.js` sin `validate()` kan produsere. Samme tabell, ett oppslag. */
export const VALIDATION_CODES = Object.freeze([
  'invalid_height',
  'invalid_width',
  'no_reinforcement',
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
]);

/**
 * Kodetabellen. Meldingene er skrevet for en prosjekterende: hva som er
 * observert, og hva det betyr for resultatet. Ikke hvilken Python-funksjon som
 * kastet — det står i `detail`.
 */
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

  /* --- validering (`section.js`) --- */
  invalid_height: 'Height h must be greater than 0.',
  invalid_width: 'Width b must be greater than 0.',
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
  analysis_forced_to_nm_domain:
    'The file requested bending resistance with a non-zero axial force. A resistance ' +
    'quoted at a single axial force is one point on a curve, so the analysis was ' +
    'changed to the N–M interaction domain on load.',
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
 * De fire `failure_mode`-verdiene (plan §5.2). `note` sier hva bruddformen
 * betyr for duktiliteten — som er hele grunnen til at man leser feltet.
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
  'as_max_ok',
  'ductility_ok',
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
  as_max_ok: 'Maximum reinforcement A_s,max = 0.04·A_c',
  ductility_ok: 'Ductility — tension reinforcement yields at failure',
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

export const ANALYSIS_LABELS = Object.freeze({
  bending: 'Bending resistance',
  moment_curvature: 'Moment–curvature',
  nm_domain: 'N–M interaction domain',
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

/** Analysens egen blokk (`bending` | `moment_curvature` | `nm_domain`). */
export function analysisBlock(result) {
  if (!result || !result.analysis) return null;
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
  return result?.analysis === 'nm_domain' && failureState(result) !== null;
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
