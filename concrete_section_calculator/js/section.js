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
  layersOnEdge,
  minClearBetween,
  minClearDistance,
  stirrupCoverDia,
  tensionArea,
  totalArea,
  totalAswPerSpacing,
} from './rebar.js';

/** Plata er ALLTID 1000 mm bred — alt regnes per meter (plan §1). */
export const SLAB_WIDTH = 1000;

// Selve konstanten bor i `rebar.js` (`minClearDistance` sin forbruker), for å
// unngå en sirkulær import mellom denne fila og den. Re-eksportert her fordi
// dette er der navnet historisk har hørt hjemme, og andre filer importerer
// det herfra.
export { MIN_CLEAR_SPACING } from './rebar.js';

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
 * `M_Ed` (signert, `structuralcodes` sin egen konvensjon) → θ i radianer.
 *
 * ENDRINGSRUNDE 4 §1.2/§1.3: `direction` finnes ikke lenger — retningen ER
 * fortegnet. Regelen er eksakt `M_Ed <= 0 ⇒ θ = 0` (trykksone ØVERST,
 * feltmoment — sagging er NEGATIV i denne konvensjonen, IKKE norsk praksis),
 * `M_Ed > 0 ⇒ θ = π` (trykksone NEDERST, støttemoment). `NaN`/`undefined`
 * havner i `<= 0`-grenen, samme fallback som den gamle default-retningen
 * («sagging») ga.
 *
 * @param {number} M_Ed
 * @returns {number} 0 eller Math.PI
 */
export function thetaFor(M_Ed) {
  return Number(M_Ed) > 0 ? Math.PI : 0;
}

/** Kombinasjonen `state.activeCombo` peker på, eller `null`. */
export function activeCombo(state = {}) {
  return (state.combos || []).find((c) => c.id === state.activeCombo) || null;
}

/**
 * θ for den AKTIVE kombinasjonen. Brukt til estimatene som skal vises FØR
 * første beregning (`asMin`, `derived`, `layerSummary`) og til payloadens
 * `options.theta` (§1.3) — som er tverrsnittstegningens retning, ikke en
 * bestemt rads. Erstatter det gamle `state.direction`.
 */
export function activeComboTheta(state = {}) {
  const c = activeCombo(state);
  return thetaFor(c ? c.M_Ed : undefined);
}

/**
 * Sant når NOEN kombinasjon har en ikke-null aksialkraft (§2, endringsrunde 4).
 *
 * EKSAKT NULL, ingen toleranse — verdiene kommer rett fra brukerens felt via
 * `evaluate()`. `NaN`/tom teller som FRAVÆR, ikke som «har aksialkraft»: et
 * tomt felt er ikke det samme som en bevisst 0, men her skal begge tolkes
 * likt (ingen grunn til å automatisk kreve N–M for et tomt/ugyldig felt).
 *
 * @param {object} state
 */
export function axialForcesPresent(state = {}) {
  return (state.combos || []).some((c) => {
    const n = num(c.N_Ed);
    return Number.isFinite(n) && n !== 0;
  });
}

/**
 * Analysene brukeren får velge blant. Uten aksialkraft: alle tre. Med: uten
 * `'bending'` — «et resistance quoted at a single axial force is one point on
 * a curve» (§2). Rekkefølgen er den UI-en viser dem i.
 *
 * @param {object} state
 * @returns {Array<'bending'|'moment_curvature'|'nm_domain'>}
 */
export function allowedAnalyses(state = {}) {
  const all = ['bending', 'moment_curvature', 'nm_domain'];
  return axialForcesPresent(state) ? all.filter((a) => a !== 'bending') : all;
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
    activeComboTheta(state)
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
  const theta = activeComboTheta(state);
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
 * Sant når kombinasjonen ikke påfører tverrsnittet noe som helst.
 *
 * NaN/tom teller som FRAVÆR av last — samme konvensjon som
 * `axialForcesPresent` over. Et halvskrevet felt er ikke en last, og den
 * motsatte lesningen ville fått advarselen til å blinke bort i det brukeren
 * sletter det siste sifferet.
 */
function comboIsUnloaded(c = {}) {
  return ['N_Ed', 'M_Ed', 'V_Ed'].every((key) => {
    const v = num(c[key]);
    return !Number.isFinite(v) || v === 0;
  });
}

/**
 * Validerer tilstanden. Rekkefølgen er geometri → lastvirkning →
 * materialfaktorer → lag → lag-mot-lag → skjær, slik at den første meldingen
 * brukeren ser er den mest grunnleggende.
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

  // --- 4b. Lastvirkning (runde 6 §2.1) ---
  // Standardtilstanden er `{N_Ed: 0, M_Ed: 0, V_Ed: 0}` (`store.js`), og med
  // `M_Ed = 0` blir η = 0 og hele svaret tomt. Det er den ENESTE seksjonen
  // uten en brukbar standardverdi, så en førstegangsbruker får et resultat som
  // ser vellykket ut og ikke inneholder noe. Advarselen står her, sammen med
  // geometri og armering, fordi lastvirkning er en av de tre tingene et snitt
  // ikke kan være uten — materialfaktorene under er parametere.
  //
  // ADVARSEL, IKKE FEIL, med vilje: `main.js` stopper kjøringen på
  // `severity: 'error'`, og `M_Rd` alene er et fullt gyldig spørsmål å stille.
  // En tom kombinasjonsliste faller i samme gren — ingen rader er like lite
  // last som bare nullrader.
  if ((state.combos || []).every(comboIsUnloaded)) {
    out.push(
      issue(
        'no_load',
        'warning',
        'Ingen lastvirkning er lagt inn: alle lastkombinasjoner har '
          + 'N_Ed = M_Ed = V_Ed = 0. Beregningen kjører, men utnyttelsen blir 0 og '
          + 'resultatet står tomt.',
        'combos'
      )
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
      // EC2 8.2(2), ikke lenger bare et gulv på 20 mm — k1/k2/d_g er
      // brukerstyrte NA-parametere (§2 i endringsrunde 2).
      const clear = minClearDistance(dia, state.spacing);
      const needed =
        2 * (num(state.cover_side) + stirrupCoverDia(state)) + n * dia + (n - 1) * clear;
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

  // --- 6. Fri avstand mellom lag på samme kant, EC2 8.2(2) ---
  // Sortert etter dc (`layersOnEdge`), IKKE arrayrekkefølge — to lag på samme
  // kant kan være tegnet i vilkårlig rekkefølge i `state.layers`. Advarsel,
  // ikke feil: beregningen er gyldig (arealene integreres uavhengig), det er
  // et utførbarhetsproblem, og brukeren kan ha overstyrt `dc` bevisst.
  for (const edge of ['bottom', 'top']) {
    const onEdge = layersOnEdge(layers, edge);
    for (let i = 0; i < onEdge.length - 1; i++) {
      const a = onEdge[i];
      const b = onEdge[i + 1];
      const free = Math.abs(num(b.dc) - num(a.dc)) - (num(a.dia) + num(b.dia)) / 2;
      const minClear = minClearBetween(a.dia, b.dia, state.spacing);
      if (free < minClear) {
        out.push(
          issue(
            'insufficient_layer_spacing',
            'warning',
            `Lag ${a.id ?? layers.indexOf(a) + 1} og ${b.id ?? layers.indexOf(b) + 1}: ` +
              `fri avstand ${free.toFixed(1)} mm er mindre enn kravet ${minClear} mm ` +
              'etter EC2 8.2(2).',
            `layers.${layers.indexOf(b)}.dc`
          )
        );
      }
    }
  }

  // --- 7. Skjær, EC2 6.2.3(2) og 9.2.2 (endringsrunde 4 §4.4) ---
  const shear = state.shear || {};
  const stirrups = shear.stirrups || [];
  const strutAngle = num(shear.strut_angle_deg);
  // Gjelder ALLTID, uansett om bøyler finnes: trykkstavvinkelen inngår også i
  // V_Rd,max (steg-knusing), som er relevant selv for et snitt uten bøyler
  // dersom brukeren senere legger dem til. Standardverdien 45° er gyldig, så
  // dette gir ingen falsk feil på en fersk plate.
  if (!(strutAngle >= 21.8 && strutAngle <= 45)) {
    out.push(
      issue(
        'invalid_strut_angle',
        'error',
        `Trykkstavvinkelen må ligge mellom 21,8° og 45° (EC2 6.2.3(2)). Har ${shear.strut_angle_deg}°.`,
        'shear.strut_angle_deg'
      )
    );
  }

  if (stirrups.length > 0) {
    // `d` til sl_max/st_max: samme geometriske ESTIMAT resten av skjemaet
    // viser FØR første beregning (se `derived()`) — motorens egen skjær-`d`
    // (endringsrunde 4 §4.1b) er per KOMBINASJON og finnes ikke før en kjøring.
    const d = derived(state).d_eff;
    const slMax = 0.75 * d;
    const stMax = Math.min(0.75 * d, 600);
    const bw = sectionWidth(state);
    // `d` er NaN når ingen armering står på strekksiden — f.eks. et
    // støttemoment på en bjelke med bare underkantjern. Da FINNES det ingen
    // s_l,max, og et tall regnet fra trykkarmeringen ville vært oppdiktet.
    //
    // MÅLT før reservegrenen i `tensionLayers` ble fjernet: nøyaktig det
    // snittet ga `s_l,max = 42,8 mm` og en HARD FEIL som blokkerte kjøringen.
    // Motoren svarer `evaluated: false` for den samme lasten og lar snittet
    // regnes. En kalkulator som nekter å regne på grunn av et tall den selv
    // har funnet på, er verre enn en som lar være å svare på ett punkt.
    const hasTensionDepth = Number.isFinite(d) && d > 0;

    // Motoren summerer radene som PARALLELLE bøylesett (`engine.py:617-625`),
    // men figuren tegner bare rad 0 og `stirrup_dia`/`dc` følger bare rad 0.
    // To rader ga målt 2,7 ganger kapasiteten uten at figuren endret seg. UI-et
    // tilbyr derfor bare én rad — men en fil eller et `setInputs`-kall går
    // utenom UI-et, og da skal det si fra i stedet for å regne i stillhet.
    if (stirrups.length > 1) {
      out.push(
        issue(
          'stirrup_multiple_rows_unsupported',
          'error',
          'Bare én bøylerad støttes i denne versjonen. Motoren ville summert radene '
            + 'som parallelle bøylesett, mens tegningen og overdekningen bare viser den første.',
          'shear.stirrups'
        )
      );
    }

    // Alle rader må ha samme f_ywk i v1 — `VRds` tar én felles `fyk`.
    const distinctFywk = new Set(stirrups.map((st) => num(st.fywk)));
    if (distinctFywk.size > 1) {
      out.push(
        issue(
          'stirrup_mixed_fywk',
          'error',
          'Alle bøylerader må ha samme f_ywk i v1 — VRds tar bare én felles f_yk.',
          'shear.stirrups'
        )
      );
    }

    stirrups.forEach((st, i) => {
      // FØRST: en senteravstand som ikke er positiv er ikke et skjevt tall, det
      // er ingen bøylerad. Motoren hopper over raden (`engine.py`, bøyleløkka),
      // og uten denne feilen ville brukeren sett en tegning med bøyler i, en
      // `A_sw/s` som ikke var et tall, og et svar som var regnet HELT UTEN
      // skjærarmering — tre beskrivelser av tre ulike snitt, alle grønne.
      //
      // `error` og ikke `warning`: alle tallene som følger av senteravstanden —
      // V_Rd,s, A_sw/s, minstekravet — er meningsløse til den er rettet.
      if (!(num(st.spacing) > 0)) {
        out.push(
          issue(
            'stirrup_spacing_not_positive',
            'error',
            `Bøyle ${st.id || i + 1}: senteravstanden må være større enn null. `
              + `Har s = ${st.spacing}.`,
            `shear.stirrups.${i}.spacing`
          )
        );
      }
      if (hasTensionDepth && num(st.spacing) > slMax) {
        out.push(
          issue(
            'stirrup_spacing_exceeds_max',
            'error',
            `Bøyle ${st.id || i + 1}: senteravstand ${st.spacing} mm overskrider ` +
              `s_l,max = 0,75·d = ${slMax.toFixed(1)} mm (EC2 9.2.2(6)).`,
            `shear.stirrups.${i}.spacing`
          )
        );
      }
      if (num(st.alpha) !== 90) {
        out.push(
          issue(
            'stirrup_alpha_unsupported',
            'error',
            `Bøyle ${st.id || i + 1}: kun α = 90° støttes i v1. Har α = ${st.alpha}°.`,
            `shear.stirrups.${i}.alpha`
          )
        );
      }
      // Benavstand er bare et tema med mer enn to ben — med to ben ER benene
      // de ytre, og det finnes ingen indre avstand å sjekke (§3.3).
      if (hasTensionDepth && num(st.legs) > 2) {
        const legPitch =
          (bw - 2 * (num(state.cover_side) + num(st.dia) / 2)) / (num(st.legs) - 1);
        if (legPitch > stMax) {
          out.push(
            issue(
              'stirrup_legs_spacing_exceeds_max',
              'warning',
              `Bøyle ${st.id || i + 1}: benavstand ${legPitch.toFixed(1)} mm overskrider ` +
                `s_t,max = min(0,75·d, 600) = ${stMax.toFixed(1)} mm (EC2 9.2.2(8)).`,
              `shear.stirrups.${i}.legs`
            )
          );
        }
      }
    });

    // MINIMUMSKRAVET GJELDER BARE NÅR BØYLER FINNES (EC2 6.2.1(4) og 9.3.2) —
    // uten dette unntaket ville standardplata (b_w = 1000, ingen bøyler)
    // fått en HARD feil på hver eneste kjøring, og det samme ville hver
    // bjelke gjort før brukeren rakk å legge inn bøyler.
    const rhoWMin = (0.08 * Math.sqrt(num((state.concrete || {}).fck))) / num(stirrups[0].fywk);
    const aswSMin = rhoWMin * bw;
    const aswS = totalAswPerSpacing(stirrups);
    // Hopp over minstekravet når en rad allerede er avvist over: da er `aswS`
    // regnet uten den raden, og en «A_sw/s = 0 er under minstekravet» ved siden
    // av «senteravstanden må være større enn null» er den samme feilen sagt to
    // ganger, hvorav den ene peker på feil årsak.
    const spacingBroken = stirrups.some((st) => !(num(st.spacing) > 0));
    if (!spacingBroken && aswS < aswSMin) {
      out.push(
        issue(
          'asw_below_minimum',
          'error',
          `A_sw/s = ${aswS.toFixed(4)} mm²/mm er mindre enn minstekravet ` +
            `${aswSMin.toFixed(4)} mm²/mm etter EC2 9.2.2(5).`,
          'shear.stirrups'
        )
      );
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
  const theta = activeComboTheta(state);
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
