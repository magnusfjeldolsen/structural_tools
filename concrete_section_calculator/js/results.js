/**
 * results.js — resultatformatering og norske statustekster.
 *
 * HVORFOR DENNE FILA FINNES
 * Motoren snakker maskin: koder, SI-enheter, `null` der et tall ikke finnes,
 * og engelsk pakketekst i `detail`. UI-et og rapporten snakker norsk, kN og
 * kNm. Oversettelsen må skje ETT sted, ellers får statuspillen og rapporten
 * hver sin formulering av samme forhold — og da er det ikke lenger mulig å se
 * om de er uenige om ORDET eller om TALLET.
 *
 * TRE INVARIANTER SOM BESKYTTES HER
 *
 * 1. `detail` VISES ALDRI SOM HOVEDMELDING. `structuralcodes` sine advarsler er
 *    exceptions med engelsk pakketekst (plan §3.5), og de er skrevet for den
 *    som leser pakkens kildekode — ikke for en prosjekterende. Derfor er
 *    `CODE_MESSAGES` under den eneste kilden til hovedmeldingen, og en UKJENT
 *    kode gir en norsk plassholder med koden i, ikke den engelske teksten.
 *    Faller det tilbake til engelsk «ved et uhell», oppdages det aldri — det
 *    ser bare ut som en detaljert melding.
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
 * Norsk tallformat. Desimalkomma, og tankestrek for alt som ikke er et tall.
 *
 * `-0,0` lukes bort med vilje: en tøyning på −4·10⁻⁷ er null, og «−0,0 ‰» får
 * en leser til å lure på hvilken vei det går.
 */
export function fmtNumber(value, decimals = 2) {
  const x = toNum(value);
  if (x === null) return DASH;
  let s = x.toFixed(decimals);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s.replace('.', ',');
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
 * Tøyning i promille. Rå tøyning gir merkelapper som `0,0035` som ingen leser
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

/** Andel som prosent. `0.93` -> `93,0`. */
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
    label: 'Nær kapasitetsgrensa',
    color: '#a16207',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  }),
  over: Object.freeze({
    level: 'over',
    label: 'Kapasiteten er overskredet',
    color: '#b91c1c',
    classes: 'bg-red-500/15 text-red-300 border-red-500/40',
  }),
  unknown: Object.freeze({
    level: 'unknown',
    label: 'Ikke beregnet',
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
 * Merkelappen på den radielle λ fra `charts.js`. Ordet «lastvei» står i den
 * fordi det er DET som skiller de to tallene: λ følger en proporsjonal økning
 * av både N og M, η holder N fast. De besvarer ulike spørsmål.
 */
export const RADIAL_UTILISATION_LABEL = 'λ (lastvei — sekundært)';

/* ================================================================== *
 * Koder -> norsk (plan §5.3)
 * ================================================================== */

/**
 * Minimumssettet fra plan §5.3. Står som egen liste slik at
 * `results.test.mjs` kan påstå at hver eneste av dem har en norsk tekst — det
 * er den testen som fanger en ny motorkode som ellers ville dukket opp i UI-et
 * som «Uspesifisert melding».
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
  // norsk tekst ville den vanligste kjøringen vist «Uspesifisert melding».
  'mc_endpoint_mismatch',
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
]);

/** Kodene som beskriver svikt i worker/runtime, ikke i tverrsnittet. */
export const RUNTIME_CODES = Object.freeze([
  'runtime_load_failed',
  'engine_error',
  'worker_error',
  'cancelled',
  'invalid_payload',
  'schema_mismatch',
]);

/**
 * Kodetabellen. Meldingene er skrevet for en prosjekterende: hva som er
 * observert, og hva det betyr for resultatet. Ikke hvilken Python-funksjon som
 * kastet — det står i `detail`.
 */
export const CODE_MESSAGES = Object.freeze({
  /* --- motoren (plan §5.3) --- */
  no_convergence:
    'Beregningen konvergerte ikke for hele tøyningsområdet. Resultatet som vises ' +
    'er det siste punktet som ble funnet, og kapasiteten kan være undervurdert.',
  mc_truncated:
    'Moment–krumningskurven er avkortet: motoren stoppet før siste planlagte ' +
    'krumningspunkt. Kurven er riktig så langt den går, men bruddpunktet mangler.',
  mc_endpoint_mismatch:
    'Kurven avsluttes i bøyekapasiteten M_Rd, som er den eksakte verdien. ' +
    'Pakkens eget siste krumningspunkt ligger litt ved siden av, fordi ' +
    'likevektssøket ved brudd fant et annet tøyningsplan enn krumningsrutenettet ' +
    'traff. Forskjellen er en opplysning om kurvens endepunkt, ikke om ' +
    'kapasiteten — M_Rd står uendret.',
  bar_in_compression_zone:
    'Ett eller flere armeringsjern ligger i trykksonen ved brudd. Med ' +
    'subtract_bar_area = av telles betongen jernet fortrenger dobbelt, slik at ' +
    'kapasiteten blir liggende litt på usikker side.',
  axial_out_of_range:
    'Aksialkraften N_Ed ligger utenfor tverrsnittets aksialkapasitet ' +
    '[N_min, N_max]. Ingen bøyekapasitet finnes for denne normalkraften.',
  as_min_not_met:
    'Armeringsarealet er mindre enn minimumsarmeringen A_s,min etter EC2 ' +
    '9.2.1.1. Snittet kan få et sprøtt brudd ved opprissing.',
  as_max_exceeded:
    'Armeringsarealet overskrider A_s,max = 0,04·A_c etter EC2 9.2.1.1(3). ' +
    'Kontroller også støpbarheten.',
  ductility_limit:
    'Duktilitetskravet er ikke oppfylt: strekkarmeringen flyter ikke før ' +
    'betongen knuses. Bruddet blir sprøtt og uten forvarsel.',
  bar_outside_section:
    'Et armeringslag ligger helt eller delvis utenfor betongtverrsnittet. ' +
    'Jernet integreres uten omkringliggende betong, og kapasiteten blir tøvete.',

  /* --- validering (`section.js`) --- */
  invalid_height: 'Høyden h må være større enn 0.',
  invalid_width: 'Bredden b må være større enn 0.',
  no_reinforcement: 'Tverrsnittet må ha minst ett armeringslag.',
  invalid_alpha_cc:
    'α_cc må være større enn 0. Pakken tolker 0 stille som 1,0, så feltet kan ' +
    'ikke stå tomt.',
  invalid_gamma_c:
    'γ_c må være større enn 0. Pakken tolker 0 stille som 1,5, så feltet kan ' +
    'ikke stå tomt.',
  invalid_gamma_s: 'γ_s må være større enn 0.',
  invalid_k: 'k = f_tk/f_yk må være minst 1,0.',
  layer_too_wide:
    'Armeringslaget får ikke plass i bredden med kravet til fri avstand ' +
    '(EC2 8.2).',
  layers_overlap:
    'To armeringslag overlapper hverandre. Arealene integreres uavhengig, så ' +
    'ULS-momentet blir riktig — men inndataen er nesten alltid feil.',

  /* --- kjøretid --- */
  runtime_load_failed:
    'Beregningsmotoren kunne ikke lastes. Sjekk nettforbindelsen, eller om et ' +
    'filter blokkerer cdn.jsdelivr.net, og prøv igjen.',
  engine_error:
    'Beregningsmotoren stoppet med en intern feil. Tallene i denne kjøringen ' +
    'kan ikke brukes.',
  worker_error:
    'Beregnetråden svarte ikke som forventet. Last siden på nytt og prøv igjen.',
  cancelled: 'Beregningen ble avbrutt.',
  invalid_payload:
    'Inndataene til motoren var ufullstendige. Kontroller geometri, materialer ' +
    'og armering.',
  schema_mismatch:
    'Motoren og grensesnittet bruker ulik versjon av datakontrakten. Tøm ' +
    'nettleserens buffer og last siden på nytt.',
});

/**
 * Norsk melding for en kode.
 *
 * Ukjent kode gir en norsk plassholder MED koden i — ikke `detail`, og ikke
 * motorens egen `message`. Det er poenget: en kode ingen har oversatt skal
 * være synlig som nettopp det, ikke gjemme seg bak engelsk pakketekst som ser
 * ut som en grundig melding.
 */
export function messageForCode(code, fallback) {
  const key = String(code || '').trim();
  if (Object.prototype.hasOwnProperty.call(CODE_MESSAGES, key)) return CODE_MESSAGES[key];
  if (fallback) return fallback;
  return `Uspesifisert melding fra beregningsmotoren (kode: «${key || 'ukjent'}»). ` +
         'Detaljene er rå pakketekst.';
}

/** Alvorlighetsgradene, norsk. `info` finnes i kontrakten og skal ikke se ut som en feil. */
export const SEVERITY_LABELS = Object.freeze({
  info: 'Merknad',
  warning: 'Advarsel',
  error: 'Feil',
});

export function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || SEVERITY_LABELS.warning;
}

/**
 * En advarsel fra motoren eller valideringen -> visningsklar form.
 *
 * `detail` samler ALL rå tekst: både `w.detail` og en eventuell `w.message`
 * som ikke kom fra kodetabellen. Dermed går ingenting tapt for den som vil
 * grave, samtidig som hovedmeldingen garantert er norsk.
 *
 * @param {{code?:string, severity?:string, message?:string, detail?:string}} w
 */
export function describeWarning(w = {}) {
  const code = String(w.code || '').trim();
  const known = Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code);
  const raw = [];
  // Motorens egen `message` er bare rå tekst NÅR koden er ukjent; er koden
  // kjent, er tabellteksten den autoritative og `message` en dublett.
  if (!known && w.message) raw.push(String(w.message));
  if (w.detail) raw.push(String(w.detail));
  return {
    code: code || 'ukjent',
    severity: w.severity || 'warning',
    severityLabel: severityLabel(w.severity),
    message: messageForCode(code),
    detail: raw.length ? raw.join(' · ') : '',
    hasDetail: raw.length > 0,
  };
}

/** Hele `result.warnings`-lista, i samme rekkefølge motoren ga den. */
export function describeWarnings(warnings) {
  return (Array.isArray(warnings) ? warnings : []).map(describeWarning);
}

/** `{ok:false}`-svaret (plan §5.2). Samme regel: norsk melding, rå tekst i detail. */
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
    label: 'Trykkbrudd i betongen',
    note:
      'Betongen når ε_cu mens strekkarmeringen har flytt. Dette er det ' +
      'normale, varslede bruddet for et underarmert snitt.',
  }),
  steel_rupture: Object.freeze({
    label: 'Strekkbrudd i armeringen',
    note:
      'Armeringen når ε_ud før betongen knuses. Snittet er svakt armert; ' +
      'bruddet varsles av store nedbøyninger og riss.',
  }),
  over_reinforced: Object.freeze({
    label: 'Overarmert snitt',
    note:
      'Betongen knuses uten at strekkarmeringen har nådd flytetøyningen. ' +
      'Bruddet blir sprøtt og uten forvarsel.',
  }),
  compression_no_tension: Object.freeze({
    label: 'Rent trykk — ingen strekksone',
    note:
      'Hele tverrsnittet er i trykk ved brudd. Bøyekapasiteten styres av ' +
      'normalkraften, ikke av armeringen i strekk.',
  }),
});

export function failureModeLabel(mode) {
  return FAILURE_MODES[mode]?.label || (mode ? `Ukjent bruddform («${mode}»)` : DASH);
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
  'all_ok',
]);

export const CHECK_LABELS = Object.freeze({
  geometry_ok: 'Geometri og armeringsplassering',
  axial_ok: 'N_Ed innenfor [N_min, N_max]',
  as_min_ok: 'Minimumsarmering A_s,min (EC2 9.2.1.1)',
  as_max_ok: 'Maksimalarmering A_s,max = 0,04·A_c',
  ductility_ok: 'Duktilitet — strekkarmeringen flyter ved brudd',
  all_ok: 'Samlet vurdering',
});

export const CHECK_PASS_TEXT = 'OK';
export const CHECK_FAIL_TEXT = 'Ikke OK';
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
  sagging: 'Feltmoment — trykk i overkant (θ = 0)',
  hogging: 'Støttemoment — trykk i underkant (θ = π)',
});

export function directionLabel(direction) {
  return DIRECTION_LABELS[direction] || DASH;
}

export const ANALYSIS_LABELS = Object.freeze({
  bending: 'Bøyekapasitet',
  moment_curvature: 'Moment–krumning',
  nm_domain: 'M–N-diagram',
});

export function analysisLabel(analysis) {
  return ANALYSIS_LABELS[analysis] || DASH;
}

export const SECTION_TYPE_LABELS = Object.freeze({
  beam: 'Bjelke',
  slab: 'Plate (per meter bredde)',
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
 * UNDERKANTEN. Skriver rapporten «overkant» ukritisk, står det feil kant ved
 * riktig tall — den typen feil ingen oppdager fordi tallet stemmer.
 */
export function compressionEdgeLabel(theta) {
  const t = toNum(theta);
  if (t === null) return DASH;
  return Math.abs(Math.cos(t)) < 1e-9 ? 'trykkanten' : Math.cos(t) >= 0 ? 'overkant' : 'underkant';
}

/** Motsatt kant av `compressionEdgeLabel`. */
export function tensionEdgeLabel(theta) {
  const c = compressionEdgeLabel(theta);
  if (c === 'overkant') return 'underkant';
  if (c === 'underkant') return 'overkant';
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
 * Er resultatet brukbart? `ok: false` sendes som et gyldig `result` fra
 * workeren (plan §3.3) — `axial_out_of_range` er et svar brukeren skal se, og
 * skal derfor ikke behandles som en krasj her heller.
 */
export function isUsable(result) {
  return Boolean(result && result.ok);
}
