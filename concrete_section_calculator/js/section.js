/**
 * section.js — geometrimodellen, de avledede størrelsene, og valideringen.
 *
 * HVORFOR VALIDERINGEN RETURNERER EN LISTE OG IKKE KASTER
 * Et halvutfylt skjema er normaltilstanden mens brukeren skriver, ikke en
 * feilsituasjon. `validate()` gir derfor en liste med `{code, severity,
 * message, field}` som UI-en kan tegne ved feltene og rapporten kan gjenta —
 * og den gir NORSK tekst, fordi alternativet er at en rå engelsk `ValueError`
 * fra `structuralcodes` lekker ut i grensesnittet (plan §4.4).
 *
 * INVARIANTEN SOM BESKYTTES HER
 * Regel 1 er den viktige: et jern som ligger UTENFOR tverrsnittet integreres
 * glad med full stålspenning og uten omkringliggende betong. Motoren feiler
 * ikke, den svarer bare med et tøvete tall. Det er derfor `dc + Ø/2 < h`
 * sjekkes på JS-siden, før payloaden i det hele tatt bygges.
 *
 * `N_Ed` mot `n_min`/`n_max` sjekkes IKKE her: de tallene finnes først etter at
 * motoren har regnet dem, og hører derfor hjemme i `engine.py` (plan §5.3).
 *
 * SAMME GRENSE GJELDER `derived()`: `d_eff`, `As_tension` og `rho` derfra er
 * ESTIMATER for skjemaet før første beregning. EC2-`d` avhenger av
 * tøyningsplanet ved brudd, som bare motoren har. Se `derived()` og
 * `rebar.js:effectiveDepthGeometric()`.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

import { concreteProps } from './materials.js';
import {
  effectiveDepth,
  effectiveDepthGeometric,
  layerArea,
  layerBarCount,
  layerCentroidZ,
  layerDepth,
  tensionArea,
  totalArea,
} from './rebar.js';

/** Plata er ALLTID 1000 mm bred — alt regnes per meter (plan §1). */
export const SLAB_WIDTH = 1000;

/** Minste fri avstand mellom jern i et lag, EC2 8.2. */
export const MIN_CLEAR_SPACING = 20;

function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Tverrsnittsbredden. Plata overstyrer `geometry.b` — brukeren skal ikke kunne
 * skrive noe annet enn 1000 og få et resultat som later som det er per meter.
 */
export function sectionWidth(state = {}) {
  if (state.sectionType === 'slab') return SLAB_WIDTH;
  return num((state.geometry || {}).b);
}

export function sectionHeight(state = {}) {
  return num((state.geometry || {}).h);
}

/**
 * Momentretning → θ i radianer. θ = 0 gir trykksone ØVERST (feltmoment),
 * θ = π gir trykksone NEDERST (støttemoment).
 */
export function thetaFor(direction) {
  return direction === 'hogging' ? Math.PI : 0;
}

/** Tverrsnittets ytterkanter, sentrert om origo (plan §3.6: nullpunkt i (0,0)). */
export function sectionBounds(state = {}) {
  const b = sectionWidth(state);
  const h = sectionHeight(state);
  return { minY: -b / 2, maxY: b / 2, minZ: -h / 2, maxZ: h / 2 };
}

/** Brutto betongareal [mm²]. Stålarealet trekkes IKKE fra (plan §3.8). */
export function grossArea(state = {}) {
  return sectionWidth(state) * sectionHeight(state);
}

/**
 * Bøyeminimum etter EC2 9.2.1.1. Finnes IKKE i `structuralcodes` —
 * `ec2_2004.As_min` er rissviddeminimum etter 7.3.2 med en helt annen
 * signatur (plan §3.6). Derfor regnes det her.
 *
 * `d` er ESTIMATET `effectiveDepthGeometric`, ikke `effectiveDepth` (som er
 * vektet over alle lag). Med trykkarmeringen med i vektingen trekkes `d` ned,
 * og minimumet blir for LITE — altså på usikker side. Estimatet finnes for at
 * `A_s,min` skal kunne vises i skjemaet FØR første beregning; etter en kjøring
 * gjelder motorens tall.
 */
export function asMin(state = {}) {
  const b_t = sectionWidth(state);
  const d = effectiveDepthGeometric(
    state.layers || [],
    sectionHeight(state),
    thetaFor(state.direction)
  );
  const fctm = concreteProps(state.concrete).fctm;
  const fyk = num((state.steel || {}).fyk);
  return Math.max((0.26 * fctm * b_t * d) / fyk, 0.0013 * b_t * d);
}

/** Maksimum armering, EC2 9.2.1.1(3): `A_s,max = 0,04·A_c`. */
export function asMax(state = {}) {
  return 0.04 * grossArea(state);
}

/**
 * Alle avledede tverrsnittsstørrelser, med SAMME feltnavn som
 * `result.section_props` (plan §5.2), slik at skjemaet kan vise dem FØR motoren
 * har svart.
 *
 * ⚠ `d_eff`, `As_tension` og `rho` herfra er ESTIMATER.
 * De bygger på den GEOMETRISKE strekksiden, fordi JS-siden ikke har noe
 * tøyningsplan. Motoren leser strekksiden av tøyningsplanet ved brudd, og der
 * nøytralaksen havner under begge armeringslagene står begge i strekk — A1 har
 * målt `d = 146,8 mm` i et tilfelle der den geometriske regelen sier 550.
 *
 * ETTER EN KJØRING SKAL UI OG RAPPORT BRUKE `result.section_props`, ALDRI
 * DISSE TALLENE. `d_eff_source` er satt nettopp for at ingen skal kunne blande
 * dem sammen ved et uhell. `Ag`, `As_total`, `b_t` og `As_max` er derimot ren
 * geometri og gjelder uansett.
 */
export function derived(state = {}) {
  const b = sectionWidth(state);
  const h = sectionHeight(state);
  const theta = thetaFor(state.direction);
  const layers = state.layers || [];
  // `d_eff` = estimatet fra den geometriske strekksiden. `d_eff_all` = vektet
  // over alle lag, som er motorens `d_eff_all` og et eksakt geometrisk tall.
  const d = effectiveDepthGeometric(layers, h, theta);
  const asT = tensionArea(layers, h, theta);
  return {
    Ag: b * h,
    As_total: totalArea(layers),
    As_tension: asT,
    // EC2 sin ρ_l: teller og nevner fra SAMME utvalg.
    rho: asT / (b * d),
    b_t: b,
    d_eff: d,
    d_eff_all: effectiveDepth(layers, h, theta),
    As_min: asMin(state),
    As_max: asMax(state),
    theta,
    d_eff_source: 'geometric-estimate',
  };
}

/** Bygger ett meldingsobjekt. Egen funksjon bare for å slippe fem like literaler. */
function issue(code, severity, message, field) {
  return { code, severity, message, field };
}

/**
 * Validerer tilstanden. Rekkefølgen er geometri → materialfaktorer → lag →
 * lag-mot-lag, slik at den første meldingen brukeren ser er den mest
 * grunnleggende.
 *
 * @param {object} state
 * @returns {Array<{code:string, severity:'error'|'warning', message:string, field:string}>}
 */
export function validate(state = {}) {
  const out = [];
  const b = sectionWidth(state);
  const h = sectionHeight(state);
  const layers = state.layers || [];
  const concrete = state.concrete || {};
  const steel = state.steel || {};

  // --- 4. Grunnleggende geometri ---
  if (!(h > 0)) {
    out.push(issue('invalid_height', 'error', 'Høyden h må være større enn 0.', 'geometry.h'));
  }
  if (!(b > 0)) {
    out.push(issue('invalid_width', 'error', 'Bredden b må være større enn 0.', 'geometry.b'));
  }
  if (layers.length === 0) {
    out.push(
      issue('no_reinforcement', 'error', 'Tverrsnittet må ha minst ett armeringslag.', 'layers')
    );
  }

  // --- 3. Materialfaktorer ---
  // `alpha_cc` og `gamma_c` er `self._x or default` i pakken, så 0 blir stille
  // 1,0 / 1,5 i stedet for en feil. Derfor er dette en ERROR, ikke en advarsel.
  if (!(num(concrete.alpha_cc) > 0)) {
    out.push(
      issue('invalid_alpha_cc', 'error', 'α_cc må være større enn 0.', 'concrete.alpha_cc')
    );
  }
  if (!(num(concrete.gamma_c) > 0)) {
    out.push(issue('invalid_gamma_c', 'error', 'γ_c må være større enn 0.', 'concrete.gamma_c'));
  }
  if (!(num(steel.gamma_s) > 0)) {
    out.push(issue('invalid_gamma_s', 'error', 'γ_s må være større enn 0.', 'steel.gamma_s'));
  }
  if (!(num(steel.k) >= 1)) {
    out.push(
      issue('invalid_k', 'error', 'k = f_tk/f_yk må være minst 1,0.', 'steel.k')
    );
  }

  // --- 1 og 2. Per lag ---
  layers.forEach((layer, i) => {
    const dia = num(layer.dia);
    const dc = num(layer.dc);
    if (!(dc + dia / 2 < h)) {
      out.push(
        issue(
          'bar_outside_section',
          'error',
          `Lag ${layer.id || i + 1}: jernet ligger utenfor tverrsnittet (dc + Ø/2 = ` +
            `${dc + dia / 2} mm ≥ h = ${h} mm).`,
          `layers.${i}.dc`
        )
      );
    }
    if (state.sectionType !== 'slab' && layer.mode !== 'spacing') {
      const n = layerBarCount(layer);
      const clear = Math.max(dia, MIN_CLEAR_SPACING);
      const needed =
        2 * (num(state.cover_side) + num(state.stirrup_dia)) + n * dia + (n - 1) * clear;
      if (b < needed) {
        out.push(
          issue(
            'layer_too_wide',
            'error',
            `Lag ${layer.id || i + 1}: ${n}Ø${dia} får ikke plass i bredden. ` +
              `Trenger ${Math.round(needed)} mm, har ${b} mm.`,
            `layers.${i}.count`
          )
        );
      }
    }
  });

  // --- 5. Overlappende lag ---
  // Arealene integreres uavhengig, så ULS-momentet blir riktig — men inndataen
  // er nesten alltid feil. Derfor advarsel, ikke feil.
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const a = layers[i];
      const c = layers[j];
      const gap = Math.abs(layerCentroidZ(a, h) - layerCentroidZ(c, h));
      if (gap < (num(a.dia) + num(c.dia)) / 2) {
        out.push(
          issue(
            'layers_overlap',
            'warning',
            `Lag ${a.id || i + 1} og ${c.id || j + 1} overlapper hverandre. ` +
              'Arealene regnes hver for seg, så kontroller inndataen.',
            `layers.${j}.dc`
          )
        );
      }
    }
  }

  return out;
}

/** Sant når ingen melding har `severity: 'error'`. */
export function isValid(state) {
  return !validate(state).some((m) => m.severity === 'error');
}

/** Gjenbrukt av `payload.js` og UI-en — armering per lag, ferdig avledet. */
export function layerSummary(state = {}) {
  const h = sectionHeight(state);
  const theta = thetaFor(state.direction);
  return (state.layers || []).map((layer) => ({
    id: layer.id,
    area: layerArea(layer),
    z: layerCentroidZ(layer, h),
    // Lagets EGEN dybde, ikke snittets `d_eff`. `layerDepth` direkte, slik at
    // dette tallet ikke påvirkes av strekk/trykk-utvelgelsen i `effectiveDepth`
    // — også et trykkarmeringslag skal vise sin faktiske avstand fra trykkanten.
    d: layerDepth(layer, h, theta),
    count: layerBarCount(layer),
  }));
}
