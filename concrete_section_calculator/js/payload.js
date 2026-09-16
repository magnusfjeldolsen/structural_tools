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
import { sectionHeight, sectionWidth, thetaFor } from './section.js';
import { barPositions, equivalentStrip, layerArea } from './rebar.js';

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
    bars: barPositions(layer, geometry, state),
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
  const loads = state.loads || {};
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
    },
    loads: {
      // Fortegn beholdes: n > 0 er STREKK, n < 0 er TRYKK (plan §3.6).
      N_Ed: num(loads.N_Ed) * KN_TO_N,
      // `M_Ed` er en STØRRELSE i retningen `direction` angir — derfor `abs`.
      M_Ed: Math.abs(num(loads.M_Ed)) * KNM_TO_NMM,
    },
    options: {
      theta: thetaFor(state.direction),
      integrator: 'marin',
      subtract_bar_area: !!options.subtract_bar_area,
      complete_domain: true,
      mc_pre_yield: num(options.mc_pre_yield),
      mc_post_yield: num(options.mc_post_yield),
      mc_chi: overrides.mc_chi === undefined ? null : overrides.mc_chi,
    },
  };
}
