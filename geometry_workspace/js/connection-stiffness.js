/**
 * connection-stiffness.js — hvor forbindelsesstivheten kommer fra.
 *
 * §3 i `global-devspecs/geometry_workspace-composite-plan.md`. Brukeren spurte
 * hvor `K_ser` skal hentes fra; svaret skal ligge i verktøyet og ikke i et
 * regneark ved siden av.
 *
 * Rene funksjoner. Ingen DOM, ingen store, ingen three.js.
 *
 * ------------------------------------------------------------------
 * INGEN IMPORTER — med vilje
 * ------------------------------------------------------------------
 * Fila importerer ingenting, på samme måte som `reinforcement.js`. Det er
 * ikke tilfeldig: testriggen (`tests/*.test.mjs`) laster modulene som
 * data-URL, og en relativ `import` kan ikke løses derfra uten et ekstra
 * omskrivingssteg. Hold fila selvstendig.
 *
 * `reinforcement.js` sin `connectorStiffness()` er BEHOLDT uendret av samme
 * grunn (den er allerede i bruk fra `volkersen`-veien og er dekket av
 * `tests/reinforcement.test.mjs`). `glueStiffness` / `jointStiffness` her er
 * den utvidede versjonen — med skjærplan — og er den nye koden skal bruke.
 *
 * ------------------------------------------------------------------
 * ENHETER
 * ------------------------------------------------------------------
 *   ρ_m [kg/m³]   d, d_c [mm]   K_ser, K_u [N/mm] per festemiddel per skjærplan
 *   k [N/mm per mm skjøtelengde] = [N/mm²]  ← det `volkersen` og γ-metoden vil ha
 */

/** Numerisk nulltoleranse. Samme størrelsesorden som i geometry.js / reinforcement.js. */
export const EPS = 1e-9;

/* ------------------------------------------------------------------ *
 * Hjelpere
 * ------------------------------------------------------------------ */

/** Tallformatering for «innsatte tall»-strengene. Punktum som desimalskille — UI-laget formaterer selv til nb-NO. */
function n(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(4);
  return String(Math.round(v * 1e6) / 1e6);
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

/* ================================================================== *
 * §3.1 — Eurokode 5, tabell 7.1
 * ================================================================== */

/**
 * Middeldensitet for forbindelsen [kg/m³].
 *
 * EC5 7.1(2): er de to delene av ULIKE treslag med middeldensitet ρ_m,1 og
 * ρ_m,2, brukes det GEOMETRISKE middelet
 *
 *      ρ_m = √(ρ_m,1 · ρ_m,2)
 *
 * Det geometriske (ikke aritmetiske) middelet er valgt fordi K_ser går som
 * ρ^1,5 — en potensfunksjon — og et geometrisk middel er det som gjør
 * uttrykket konsistent når man skalerer begge densitetene med samme faktor.
 * Er bare én densitet oppgitt, brukes den som den er.
 *
 * @param {number} rho1 [kg/m³]
 * @param {number} [rho2] [kg/m³] — utelates for ett treslag
 * @returns {number} ρ_m [kg/m³], NaN hvis inndata mangler
 */
export function meanDensity(rho1, rho2) {
  const a = num(rho1);
  const b = num(rho2);
  if (!(a > 0)) return NaN;
  if (!(b > 0)) return a;
  return Math.sqrt(a * b);
}

/**
 * Festemiddeltypene i EC5 tabell 7.1, med formel og hvilke mål de trenger.
 * `needs` er `'d'` (festemiddeldiameter) eller `'dc'` (dyblens ytterdiameter).
 *
 * `fn(rho, d, dc)` gir K_ser [N/mm] per festemiddel per skjærplan.
 */
export const EC5_FASTENERS = Object.freeze([
  Object.freeze({
    key: 'dowel',
    label: 'Dybler, bolter (med/uten klaring), skruer, spiker med forboring',
    needs: 'd',
    formula: 'K_ser = ρ_m^1,5 · d / 23',
    fn: (rho, d) => (Math.pow(rho, 1.5) * d) / 23,
    subst: (rho, d) => `${n(rho)}^1.5 · ${n(d)} / 23`,
  }),
  Object.freeze({
    key: 'nail',
    label: 'Spiker uten forboring',
    needs: 'd',
    formula: 'K_ser = ρ_m^1,5 · d^0,8 / 30',
    fn: (rho, d) => (Math.pow(rho, 1.5) * Math.pow(d, 0.8)) / 30,
    subst: (rho, d) => `${n(rho)}^1.5 · ${n(d)}^0.8 / 30`,
  }),
  Object.freeze({
    key: 'staple',
    label: 'Klammer',
    needs: 'd',
    formula: 'K_ser = ρ_m^1,5 · d^0,8 / 80',
    fn: (rho, d) => (Math.pow(rho, 1.5) * Math.pow(d, 0.8)) / 80,
    subst: (rho, d) => `${n(rho)}^1.5 · ${n(d)}^0.8 / 80`,
  }),
  Object.freeze({
    key: 'splitring',
    label: 'Ringdybler / skivedybler',
    needs: 'dc',
    formula: 'K_ser = ρ_m · d_c / 2',
    fn: (rho, d, dc) => (rho * dc) / 2,
    subst: (rho, d, dc) => `${n(rho)} · ${n(dc)} / 2`,
  }),
  Object.freeze({
    key: 'toothedplate',
    label: 'Tannplatedybler',
    needs: 'dc',
    formula: 'K_ser = 1,5 · ρ_m · d_c / 4',
    fn: (rho, d, dc) => (1.5 * rho * dc) / 4,
    subst: (rho, d, dc) => `1.5 · ${n(rho)} · ${n(dc)} / 4`,
  }),
]);

/** Oppslag på nøkkel. `null` for ukjent navn — ingen stille bytte av festemiddel. */
export function ec5Fastener(key) {
  return EC5_FASTENERS.find((f) => f.key === key) || null;
}

/**
 * Kontaktflaten mellom de to delene, og faktoren `K_ser` skal ganges med.
 *
 * EC5 7.1(3): for **stål-mot-tre** og **betong-mot-tre** skal `K_ser`
 * MULTIPLISERES MED 2. Begrunnelsen i koden er at tabellverdiene forutsetter
 * at BEGGE delene deformerer seg som trevirke; er den ene delen stål eller
 * betong, er hulltrykksdeformasjonen i praksis bare på den ene siden, og
 * forbindelsen blir dobbelt så stiv.
 */
export const EC5_CONTACTS = Object.freeze([
  Object.freeze({ key: 'timber-timber', label: 'Tre mot tre (eller trebasert plate)', factor: 1 }),
  Object.freeze({ key: 'steel-timber', label: 'Stål mot tre', factor: 2 }),
  Object.freeze({ key: 'concrete-timber', label: 'Betong mot tre', factor: 2 }),
]);

/** Faktoren for en kontaktflate; ukjent nøkkel gir 1 (ingen stille dobling). */
export function contactFactor(key) {
  const c = EC5_CONTACTS.find((x) => x.key === key);
  return c ? c.factor : 1;
}

/**
 * Grensetilstandene. EC5 2.2.2(1): i BRUDDGRENSETILSTANDEN brukes
 *
 *      K_u = (2/3) · K_ser
 *
 * `K_ser` er bruksgrensetilstandens (SLS) forskyvningsmodul; `K_u` er den
 * lavere sekantstivheten ved kapasitetsnivå.
 */
export const STATES = Object.freeze([
  Object.freeze({ key: 'SLS', label: 'Bruksgrense (K_ser)', factor: 1 }),
  Object.freeze({ key: 'ULS', label: 'Bruddgrense (K_u = ⅔·K_ser)', factor: 2 / 3 }),
]);

/** Faktoren for en grensetilstand; ukjent nøkkel gir 1 (SLS). */
export function stateFactor(key) {
  const s = STATES.find((x) => x.key === key);
  return s ? s.factor : 1;
}

/**
 * @typedef {Object} SlipModulus
 * @property {'ec5'|'eta'} source   Hvor tallet kommer fra
 * @property {string} label         Menneskelesbar beskrivelse
 * @property {number} Kser          Bruksgrense, per festemiddel per skjærplan [N/mm]
 * @property {number} Ku            Bruddgrense = ⅔·K_ser [N/mm]
 * @property {number} K             Den som gjelder for valgt `state` [N/mm]
 * @property {'SLS'|'ULS'} state
 * @property {number} rhoMean       ρ_m [kg/m³] (NaN for ETA-kilden)
 * @property {number} factor        Kontaktfaktoren (1 eller 2)
 * @property {string} formula       Symbolsk formel
 * @property {string} substituted   Formel med innsatte tall
 * @property {boolean} valid
 * @property {string[]} notes       Forbehold som SKAL vises i UI-et
 */

/**
 * `K_ser` etter EC5 tabell 7.1.
 *
 * REKKEFØLGEN i utregningen, som også er den som står i `substituted`:
 *   1. ρ_m — geometrisk middel hvis to treslag er oppgitt (`meanDensity`).
 *   2. tabellformelen for valgt festemiddel.
 *   3. × 2 for stål-mot-tre / betong-mot-tre.
 *   4. × ⅔ hvis bruddgrensetilstand er valgt.
 * Punkt 3 kommer FØR punkt 4 fordi doblingen er en egenskap ved forbindelsen,
 * mens ⅔ er en egenskap ved lasttilstanden. Rekkefølgen er likegyldig for
 * produktet, men rekkefølgen i teksten skal speile hvor tallene kommer fra.
 *
 * @param {{fastener?: string, rho?: number, rho1?: number, rho2?: number,
 *          d?: number, dc?: number, contact?: string, state?: 'SLS'|'ULS'}} arg
 * @returns {SlipModulus}
 */
export function ec5Kser({
  fastener = 'dowel',
  rho,
  rho1,
  rho2,
  d,
  dc,
  contact = 'timber-timber',
  state = 'SLS',
} = {}) {
  const type = ec5Fastener(fastener);
  const notes = [EC5_HELP.timberOnly];
  const st = state === 'ULS' ? 'ULS' : 'SLS';

  const rhoMean = meanDensity(rho1 !== undefined ? rho1 : rho, rho2);
  const dd = num(d);
  const ddc = num(dc);
  const kf = contactFactor(contact);
  if (kf !== 1) notes.push(EC5_HELP.doubling);

  const needed = type ? (type.needs === 'dc' ? ddc : dd) : NaN;
  const okInput = !!type && rhoMean > 0 && needed > 0;

  if (!okInput) {
    return {
      source: 'ec5',
      label: type ? type.label : 'ukjent festemiddel',
      Kser: 0, Ku: 0, K: 0, state: st,
      rhoMean: Number.isFinite(rhoMean) ? rhoMean : NaN,
      factor: kf,
      formula: type ? type.formula : '',
      substituted: '',
      valid: false,
      notes,
    };
  }

  const base = type.fn(rhoMean, dd, ddc);
  const Kser = base * kf;
  const Ku = (2 / 3) * Kser;
  const K = st === 'ULS' ? Ku : Kser;

  const twoSpecies = num(rho1) > 0 && num(rho2) > 0;
  const parts = [];
  if (twoSpecies) {
    parts.push(`ρ_m = √(${n(num(rho1))} · ${n(num(rho2))}) = ${n(rhoMean)} kg/m³`);
  }
  parts.push(`${type.formula.replace('K_ser = ', '')} = ${type.subst(rhoMean, dd, ddc)} = ${n(base)} N/mm`);
  if (kf !== 1) parts.push(`× ${kf} (${(EC5_CONTACTS.find((c) => c.key === contact) || {}).label}) = ${n(Kser)} N/mm`);
  if (st === 'ULS') parts.push(`K_u = ⅔ · ${n(Kser)} = ${n(Ku)} N/mm`);

  return {
    source: 'ec5',
    label: type.label,
    Kser,
    Ku,
    K,
    state: st,
    rhoMean,
    factor: kf,
    formula: type.formula + (kf !== 1 ? `  × ${kf} (${contact})` : '') + (st === 'ULS' ? '   K_u = ⅔·K_ser' : ''),
    substituted: parts.join('\n'),
    valid: K > 0,
    notes,
  };
}

/**
 * `K_ser` lagt inn fritt, typisk fra en ETA eller en produktgodkjenning.
 *
 * Dette er en LIKESTILT kilde, ikke en nødløsning (§3.2): for stål-mot-stål
 * finnes det ingen EC5-formel i det hele tatt, og for proprietære
 * festemidler er ETA-verdien den eneste ærlige veien. Feltet skal derfor
 * ligge like synlig i UI-et som EC5-veien.
 *
 * Er `Ku` oppgitt direkte (noen godkjenninger gir begge), brukes den som den
 * er. Ellers utledes den av `K_u = ⅔·K_ser` som for EC5.
 *
 * @param {{Kser?: number, Ku?: number, state?: 'SLS'|'ULS', label?: string}} arg
 * @returns {SlipModulus}
 */
export function etaKser({ Kser, Ku, state = 'SLS', label = 'Fritt innlagt (ETA / produktgodkjenning)' } = {}) {
  const st = state === 'ULS' ? 'ULS' : 'SLS';
  const ks = num(Kser);
  const kuGiven = num(Ku);
  const valid = ks > 0 || kuGiven > 0;
  const kser = ks > 0 ? ks : (kuGiven > 0 ? (3 / 2) * kuGiven : 0);
  const ku = kuGiven > 0 ? kuGiven : (2 / 3) * kser;
  const K = st === 'ULS' ? ku : kser;

  const lines = [`K_ser = ${n(kser)} N/mm (oppgitt)`];
  if (st === 'ULS') {
    lines.push(kuGiven > 0
      ? `K_u = ${n(ku)} N/mm (oppgitt)`
      : `K_u = ⅔ · ${n(kser)} = ${n(ku)} N/mm`);
  }

  return {
    source: 'eta',
    label,
    Kser: kser,
    Ku: ku,
    K,
    state: st,
    rhoMean: NaN,
    factor: 1,
    formula: 'K_ser oppgitt direkte' + (st === 'ULS' ? ';  K_u = ⅔·K_ser' : ''),
    substituted: lines.join('\n'),
    valid,
    notes: [EC5_HELP.eta],
  };
}

/**
 * Felles inngang: velger EC5-veien eller den fritt innlagte etter `source`.
 * Gjør det lett for UI-et å ha ÉN kodesti uansett hvilken radioknapp brukeren
 * har valgt.
 *
 * @param {{source?: 'ec5'|'eta'} & Object} input
 * @returns {SlipModulus}
 */
export function slipModulus(input = {}) {
  return input.source === 'eta' ? etaKser(input) : ec5Kser(input);
}

/* ================================================================== *
 * §3.2 — lim
 * ================================================================== */

/**
 * Limfugens stivhet per lengdeenhet av skjøten.
 *
 *      k = G_a · b / t_a          [N/mm per mm] = [N/mm²]
 *
 * ENHETSKONTROLL: (N/mm²)·mm/mm = N/mm². ✓
 *
 * UTLEDNING: limlaget skjærdeformeres. En glidning `u` over en limtykkelse
 * `t_a` gir skjærtøyning γ = u/t_a, altså skjærspenning τ = G_a·u/t_a. Kraften
 * per lengdeenhet av skjøten er τ ganget med heftbredden `b`, altså
 * q = G_a·b·u/t_a, og stivheten k = q/u = G_a·b/t_a.
 *
 * @param {{Ga?: number, ta?: number, bondWidth?: number}} arg
 *   `Ga` [N/mm²], `ta` [mm], `bondWidth` = heftbredden `b` [mm]
 * @returns {number} k [N/mm²], 0 hvis inndata mangler
 */
export function glueStiffness({ Ga, ta, bondWidth } = {}) {
  const G = num(Ga);
  const t = num(ta);
  const b = num(bondWidth);
  if (!(G > 0) || !(t > 0) || !(b > 0)) return 0;
  return (G * b) / t;
}

/* ================================================================== *
 * §3.3 — smøring til fugestivhet
 * ================================================================== */

/**
 * Fugestivhet per lengdeenhet av skjøten — det tallet både Volkersen og
 * γ-metoden faktisk regner med:
 *
 *      k = n_skjærplan · n_rader · K / s        [N/mm per mm] = [N/mm²]
 *
 * `K` er per festemiddel per SKJÆRPLAN (som EC5 gir den), `n_rader` er antall
 * rader på tvers av bjelken, `s` er senteravstanden langs bjelkeaksen.
 *
 * ENHETSKONTROLL: (N/mm)·(1/mm) = N/mm². ✓
 *
 * MERK om navnene: planens §3.3 kaller dette `K`, mens §4 bruker `K` om
 * per-festemiddel-verdien og skriver `s` eksplisitt i γ-uttrykket. Det er
 * samme størrelse skrevet på to måter — `s/K_festemiddel = 1/k` — men for å
 * unngå at de blandes heter den PER-LENGDE-stivheten `k` (liten k) overalt i
 * denne modulen og i `gammaMethod`, akkurat som i `volkersen`.
 *
 * @param {{K?: number, Kser?: number, rows?: number, spacing?: number, shearPlanes?: number}} arg
 * @returns {number} k [N/mm²], 0 hvis inndata mangler
 */
export function jointStiffness({ K, Kser, rows = 1, spacing, shearPlanes = 1 } = {}) {
  const kf = num(K) > 0 ? num(K) : num(Kser);
  const r = num(rows) > 0 ? num(rows) : 1;
  const p = num(shearPlanes) > 0 ? num(shearPlanes) : 1;
  const s = num(spacing);
  if (!(kf > 0) || !(s > 0)) return 0;
  return (p * r * kf) / s;
}

/**
 * Fugestivheten `k` [N/mm²] for en hel forbindelse, uansett type — den ene
 * inngangen UI-et og γ-metoden kan bruke.
 *
 *   'glue'  → `glueStiffness` (krever heftbredde)
 *   'screw' → `jointStiffness` med `K` fra `slipModulus` (eller `connector.Kser`)
 *   'weld'  → `Infinity` (stiv forbindelse; γ → 1, altså full samvirkning)
 *
 * Sveis returnerer `Infinity` og ikke et stort tall, slik at γ-metoden kan
 * svare eksakt 1 i stedet for «0,9997» — en sveis ER stiv i denne
 * sammenhengen, og å late som noe annet er villedende.
 *
 * @param {{connector: object, bondWidth?: number, slip?: SlipModulus}} arg
 * @returns {{k: number, kind: string, formula: string, substituted: string, valid: boolean}}
 */
export function interfaceStiffness({ connector, bondWidth, slip } = {}) {
  const c = connector || {};
  if (c.kind === 'weld') {
    return {
      k: Infinity,
      kind: 'weld',
      formula: 'k → ∞ (sveis regnes som stiv forbindelse)',
      substituted: 'γ = 1 — full samvirkning',
      valid: true,
    };
  }
  if (c.kind === 'glue') {
    const k = glueStiffness({ Ga: c.Ga, ta: c.ta, bondWidth });
    return {
      k,
      kind: 'glue',
      formula: 'k = G_a · b / t_a',
      substituted: `${n(num(c.Ga))} · ${n(num(bondWidth))} / ${n(num(c.ta))} = ${n(k)} N/mm²`,
      valid: k > 0,
    };
  }
  const K = slip && slip.valid ? slip.K : num(c.Kser);
  const rows = num(c.rows) > 0 ? num(c.rows) : 1;
  const planes = num(c.shearPlanes) > 0 ? num(c.shearPlanes) : 1;
  const s = num(c.spacing);
  const k = jointStiffness({ K, rows, spacing: s, shearPlanes: planes });
  return {
    k,
    kind: 'screw',
    formula: 'k = n_skjærplan · n_rader · K / s',
    substituted: `${n(planes)} · ${n(rows)} · ${n(K)} / ${n(s)} = ${n(k)} N/mm²`,
    valid: k > 0,
  };
}

/* ================================================================== *
 * Hjelpetekst — §3 krever eksplisitt at kilden står i UI-et
 * ================================================================== */

/** Tekster UI-laget (bølge B) skal vise. Samlet her så de ikke skrives om for hånd tre steder. */
export const EC5_HELP = Object.freeze({
  source:
    'Formlene er NS-EN 1995-1-1 (Eurokode 5) tabell 7.1 — forskyvningsmodulen ' +
    'K_ser per festemiddel per skjærplan, i N/mm, med middeldensitet ρ_m i kg/m³ ' +
    'og diameter i mm.',
  timberOnly:
    'EC5-formlene gjelder TREVIRKE. De skal ikke brukes ukritisk på stål eller ' +
    'på proprietære festemidler — for stål-mot-stål finnes ingen EC5-formel, og ' +
    'da er en verdi fra ETA/produktgodkjenning den eneste ærlige veien.',
  doubling:
    'K_ser er doblet: EC5 7.1(3) sier at K_ser skal multipliseres med 2 for ' +
    'stål-mot-tre og betong-mot-tre, fordi hulltrykksdeformasjonen bare skjer i ' +
    'den ene av de to delene.',
  states:
    'K_ser er bruksgrensetilstandens forskyvningsmodul. I bruddgrensetilstand ' +
    'brukes K_u = ⅔·K_ser (EC5 2.2.2(1)). Velg tilstand bevisst — nedbøyning ' +
    'regnes med K_ser, kapasitetskontroll med K_u.',
  eta:
    'Verdien er lagt inn direkte og er ikke kontrollert mot EC5. Oppgi kilde ' +
    '(ETA-nummer eller produktgodkjenning) i dokumentasjonen.',
  density:
    'Med to ulike treslag brukes det geometriske middelet ρ_m = √(ρ_m,1·ρ_m,2) ' +
    '(EC5 7.1(2)). ρ_m er MIDDELdensiteten, ikke den karakteristiske ρ_k.',
});

/**
 * Middeldensitet for noen vanlige trekvaliteter [kg/m³] — ρ_mean, ikke ρ_k.
 * Tallene er de karakteristiske middelverdiene fra NS-EN 338 (konstruksjonsvirke)
 * og NS-EN 14080 (limtre). Brukeren skal kunne overstyre fritt.
 */
export const TIMBER_DENSITIES = Object.freeze([
  Object.freeze({ name: 'C14', rho: 350 }),
  Object.freeze({ name: 'C18', rho: 380 }),
  Object.freeze({ name: 'C24', rho: 420 }),
  Object.freeze({ name: 'C30', rho: 460 }),
  Object.freeze({ name: 'GL24h', rho: 420 }),
  Object.freeze({ name: 'GL28h', rho: 460 }),
  Object.freeze({ name: 'GL30c', rho: 430 }),
  Object.freeze({ name: 'GL32h', rho: 490 }),
]);

/** Oppslag på navn; `null` for ukjent (ingen stille bytte av trekvalitet). */
export function timberDensity(name) {
  const t = TIMBER_DENSITIES.find((x) => x.name === name);
  return t ? t.rho : null;
}
