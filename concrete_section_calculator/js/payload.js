/**
 * payload.js — tilstanden → motorens JSON-kontrakt (plan §5.1).
 *
 * HVORFOR ALL GEOMETRI SKJER HER
 * Motoren kjenner ikke «senteravstand», «overdekning» eller «bøyle». Den får
 * ferdige koordinater i mm, sentrert om origo. Ville vi delt regnestykket
 * mellom JS og Python, måtte begge sider hatt samme forståelse av
 * aksesystemet — og den ene ville før eller siden fått den motsatt. Derfor:
 * `payload.js` gjør ALT, `engine.py` gjør INGENTING med geometri.
 *
 * INVARIANTENE SOM BESKYTTES HER
 *
 * 1. `barPositions()` er eneste kilde til jernkoordinater. Denne fila regner
 *    dem IKKE selv — den kaller `rebar.js`, akkurat som tegningen gjør. Testen
 *    påstår at `payload.section.rebar[i].bars` er dypt lik `barPositions(...)`.
 *
 * 2. Enheter. Tilstanden er i kN og kNm fordi det er det ingeniører skriver;
 *    kontrakten er i N og Nmm fordi det er det `structuralcodes` regner i.
 *    Konverteringen skjer på ÉN linje hver, her, og ingen andre steder.
 *
 * 3. `alpha_cc`, `gamma_c` og `gamma_s` kan ikke være 0 eller tomme. I pakken
 *    er egenskapene `self._x or default`, så 0 blir STILLE 1,0 / 1,5 / 1,15 i
 *    stedet for en feil (plan §3.6). En rapport som trykker «α_cc = 0» ved
 *    siden av et tall regnet med 1,0 er verre enn ingen rapport, så vi kaster.
 *
 * 4. `integrator` er HARDKODET til `'marin'`. `fiber` er kuttet med begrunnelse
 *    (plan §1.2) og et ukjent integratornavn faller stille tilbake til marin —
 *    å tilby valget ville vært å tilby en løgn. Det finnes derfor ingen
 *    `options.integrator` i tilstanden heller.
 *
 * 5. `complete_domain` er ALLTID `true`: 69 punkter koster 28 ms, og uten den
 *    finnes ingen omhylling å treffe for et støttemoment.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

import { SCHEMA_VERSION } from './meta.js';
import { ftkOf } from './materials.js';
import { activeComboTheta, sectionHeight, sectionWidth, thetaFor } from './section.js';
import { barPositions, equivalentStrip, layerArea, stirrupCoverDia } from './rebar.js';

/** kN → N. */
const KN_TO_N = 1000;
/** kNm → Nmm. */
const KNM_TO_NMM = 1e6;

function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Kaster hvis en faktor er 0, tom eller ikke et tall. Se invariant 3.
 * @param {number|string} value
 * @param {string} label norsk feltnavn til feilmeldingen
 */
function requirePositive(value, label) {
  const n = num(value);
  if (!(n > 0)) {
    throw new Error(
      `${label} må være et tall større enn 0. ` +
        'Verdien 0 eller et tomt felt gir en stille standardverdi i motoren, ' +
        'og et resultat som ikke stemmer med det rapporten trykker.'
    );
  }
  return n;
}

/**
 * Ett armeringslag oversatt til kontraktens form.
 *
 * `mode: 'spacing'` (plate) blir en UTSMURT stripe, ikke diskrete jern
 * (plan §4.3). Stripa er verifisert innenfor 0,17 % mot diskrete jern og er
 * standardmodellen — `smear_mode: 'bars'` er kuttet i plan §1.2.
 */
function rebarEntry(layer, state) {
  const geometry = { b: sectionWidth(state), h: sectionHeight(state) };
  const area = layerArea(layer);
  if (layer.mode === 'spacing') {
    const strip = equivalentStrip(layer, geometry.h);
    return {
      id: layer.id,
      kind: 'strip',
      area,
      strip: { width: strip.width, height: strip.height, z: strip.z },
    };
  }
  return {
    id: layer.id,
    kind: 'bars',
    area,
    // IKKE regn koordinatene her. Se invariant 1.
    //
    // `stirrup_dia` MAA overstyres. `barPositions` leser `opts.stirrup_dia` for
    // den vannrette innrykkingen, og det TILSTANDSFELTET finnes ikke lenger —
    // boeyla bor bare i `shear.stirrups`. Sendte vi `state` raatt, ville
    // payloaden regnet hvert jern med boeyle = 0 og lagt dem Ø_boeyle for langt
    // ut mot sidekanten, mens tegningen og `dc` brukte riktig tall.
    // MAALT paa standardbjelken: payloaden ga y = 105 der tegningen ga 93.
    // Ingenting krasjer, og `M_Rd` endrer seg knapt for enakset boeyning fordi
    // `z` er riktig — det er nettopp derfor den er farlig.
    bars: barPositions(layer, geometry, { ...state, stirrup_dia: stirrupCoverDia(state) }),
  };
}

/**
 * Skjærkonfigurasjonen → kontraktens `section.shear` (endringsrunde 3 §4.1,
 * feltnavnet oppdatert til `strut_angle_deg` per endringsrunde 4 §3.4 —
 * IKKE `theta`, det navnet betyr bøyeretning i radianer overalt ellers i
 * kontrakten, og en strøket 45 ville lest som feltmoment uten feilmelding).
 *
 * ALLTID med, også med tom `stirrups`-liste: endringsrunde 4 vil ha skjær
 * regnet for ALLE kombinasjoner i alle tre analysene (§3.4, §9), ikke bare
 * når brukeren har lagt inn bøyler — en tom liste ER signalet til motoren om
 * å ta `V_Rd,c`-veien (`governing_mode: 'no_stirrups'`), ikke et signal om å
 * hoppe over skjær.
 */
function shearSection(state) {
  const shear = state.shear || {};
  return {
    strut_angle_deg: num(shear.strut_angle_deg),
    z_factor: num(shear.z_factor),
    stirrups: (shear.stirrups || []).map((st) => ({
      id: st.id,
      dia: num(st.dia),
      spacing: num(st.spacing),
      legs: num(st.legs),
      fywk: num(st.fywk),
      alpha: num(st.alpha),
    })),
  };
}

/**
 * Bygger payloaden.
 *
 * @param {object} state tilstanden fra `store.js`
 * @param {{analysis?: string, mc_chi?: number|null}} [overrides]
 *        `mc_chi` settes når JS driver moment–krumning ett punkt om gangen
 *        (plan §3.7) — da er det den eneste forskjellen mellom to kall.
 * @returns {object} payload etter plan §5.1
 */
export function buildPayload(state = {}, overrides = {}) {
  const concrete = state.concrete || {};
  const steel = state.steel || {};
  const combos = state.combos || [];
  const options = state.options || {};

  const alpha_cc = requirePositive(concrete.alpha_cc, 'α_cc');
  const gamma_c = requirePositive(concrete.gamma_c, 'γ_c');
  const gamma_s = requirePositive(steel.gamma_s, 'γ_s');

  const b = sectionWidth(state);
  const h = sectionHeight(state);

  return {
    schema: SCHEMA_VERSION,
    analysis: overrides.analysis || state.analysis || 'bending',
    section: {
      type: state.sectionType === 'slab' ? 'slab' : 'beam',
      b,
      h,
      concrete: {
        // `fck` er et TALL, aldri strengen 'C30/37' (plan §3.6).
        fck: num(concrete.fck),
        gamma_c,
        alpha_cc,
        law: concrete.law,
      },
      steel: {
        fyk: num(steel.fyk),
        Es: num(steel.Es),
        // `ftk` har ingen standardverdi i pakken og er påkrevd for BEGGE
        // arbeidsdiagram — den mater `n_max` via `check_axial_load`, som
        // kjøres før hver eneste analyse.
        ftk: ftkOf(steel),
        k: num(steel.k),
        epsuk: num(steel.epsuk),
        gamma_eps: num(steel.gamma_eps),
        gamma_s,
        law: steel.law,
      },
      rebar: (state.layers || []).map((layer) => rebarEntry(layer, state)),
      shear: shearSection(state),
    },
    // Én kombinasjon per rad i lastkombinasjonstabellen (§4.2). Motoren
    // regner alle og finner selv hvilken som er GOVERNING (§4.3) — det er
    // derfor `active` er med og ikke bare en enkelt N_Ed/M_Ed slik det pleide.
    loads: {
      combinations: combos.map((c) => ({
        id: c.id,
        name: c.name || '',
        // Fortegn beholdes: n > 0 er STREKK, n < 0 er TRYKK (plan §3.6).
        N_Ed: num(c.N_Ed) * KN_TO_N,
        // `M_Ed` er SIGNERT, `structuralcodes` sin egen konvensjon —
        // endringsrunde 4 §1.2/§1.4: IKKE `abs` lenger, fortegnet ER
        // retningen. `theta` overlever likevel (§1.3), utledet fra RADENS
        // EGEN `M_Ed`, ikke fra tilstandens.
        M_Ed: num(c.M_Ed) * KNM_TO_NMM,
        // `V_Ed` er en STØRRELSE — fortegnet på skjærkraften betyr ingenting
        // for kapasiteten (§4.1c), så vi tar `abs` her, i motsetning til M_Ed.
        V_Ed: Math.abs(num(c.V_Ed)) * KN_TO_N,
        theta: thetaFor(c.M_Ed),
      })),
      active: state.activeCombo,
    },
    options: {
      // §1.3: DETTE ER IKKE en forenkling som kan fjernes. Seks
      // pytest-tilfeller driver støttemoment gjennom `options.theta` med
      // fixturer der `M_Ed = 0` — uten dette feltet finnes ingen måte å be om
      // en støttemoment-M–κ på. Utledes fra den AKTIVE kombinasjonens
      // `M_Ed`, IKKE fra en fjernet `state.direction`.
      theta: activeComboTheta(state),
      integrator: 'marin',
      subtract_bar_area: !!options.subtract_bar_area,
      complete_domain: true,
      mc_pre_yield: num(options.mc_pre_yield),
      mc_post_yield: num(options.mc_post_yield),
      mc_chi: overrides.mc_chi === undefined ? null : overrides.mc_chi,
    },
  };
}
