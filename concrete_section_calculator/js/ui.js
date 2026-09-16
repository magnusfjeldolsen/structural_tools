/**
 * ui.js — DOM-bindingen for arbeidsarket.
 *
 * HVORFOR ARBEIDSARKET OG IKKE TO-PANELS-OPPSETTET
 * UX-porten valgte mockup A (`docs/mockups/a-arbeidsark.html`): ett rullende
 * ark, materiale → geometri → armering → last → analyse → beregn → resultat,
 * med «Beregn» i en fast bunnlinje som er i rekkevidde fra hver seksjon. Den
 * koster null museklikk for det som gjentas mest — å legge inn
 * armeringslag — og den har samme dokumentform som A4-rapporten i §8, slik at
 * skjerm og papir deler mental modell.
 *
 * TRE TING ER HENTET FRA DEN FORKASTEDE MOCKUP B, FORDI A ER SVAKERE DER:
 * 1. **🔒 på `d_c`.** A regnet auto-`d_c` uten å vise at den var avledet.
 *    Hengelåsen holder `layer.dc_auto` og gjør regelen synlig — flagget lever
 *    i TILSTANDEN (`rebar.js`/`store.js`, endringsrunde 2 §3.1), ikke i en
 *    lokal Map her, nettopp for at det skal overleve lagre/laste (§5).
 * 2. **Inspeksjonsstripa i bunnlinja.** A-ens eneste alvorlige svakhet var at
 *    man måtte rulle ned for å se hva en endring gjorde. η, M_Rd, x, x/d og
 *    bruddform står nå ved siden av ΣA_s og d, alltid synlig.
 * 3. **Ø-brikkeraden i RADEDITOREN** — ikke i innleggingslinja. Korthånden
 *    forblir hovedveien; brikkene er utveien for den som ikke vil lære den.
 *
 * DET ENE SOM IKKE ER HENTET FRA B: fane-som-analysevalg. Et klikk på en fane
 * ville blitt et motorkall brukeren ikke ba om. Analysevalget er derfor en
 * uttrykkelig kontroll i sitt eget steg (§6, endringsrunde 2), ikke en fane.
 *
 * KORTHÅNDEN ER EN SNARVEI, ALDRI EN FORUTSETNING
 * `3Ø20 b 50` er den raske veien inn. Men HVERT felt er også redigerbart i
 * radeditoren uten å kjenne grammatikken — antall, Ø, kant og `d_c` har hver
 * sin kontroll. En bruker som aldri leser plassholderen skal kunne gjøre alt.
 *
 * ARBEIDSDELING
 * Denne fila eier DOM-en og ingenting annet. Tall, regler og tekster kommer fra
 * `section.js`, `rebar.js`, `materials.js`, `serialize.js` og `results.js`;
 * figurene fra `section-draw.js` og `charts.js`. Blir noe her regnet på nytt,
 * er det en feil — da kan tegningen bli uenig med tallet uten at en test merker
 * det.
 *
 * ETTER EN KJØRING GJELDER `result.section_props`, ALDRI JS-ESTIMATET.
 * `section.derived()` merker seg selv med `d_eff_source: 'geometric-estimate'`
 * nettopp for at de to ikke skal kunne forveksles (plan §5.2).
 *
 * KOMBINASJONER (endringsrunde 2 §4) ERSTATTER DEN ENE LASTVIRKNINGEN
 * `state.loads.N_Ed`/`M_Ed` finnes ikke lenger. `state.combos` er en liste,
 * `state.activeCombo` styrer hvilken moment–krumning regner på. Motoren
 * speiler den GOVERNING kombinasjonen i alle toppnivåfelt (§4.3), så
 * `renderResult()` under leser dem uendret — den vet ikke, og trenger ikke
 * vite, at det finnes flere rader bak tallet.
 *
 * SKJÆR ER FØRSTEKLASSES (endringsrunde 5 §B/§C)
 * Bøylene legges inn i geometriseksjonen, rett under «Stirrup Ø» — det er
 * SAMME fysiske bøyle, og bindingen (`store.js:syncStirrupDia`) er bare
 * troverdig hvis de to feltene kan ses i samme blikk. Skjærresultatet vises
 * med et EGET η_V-merke ved siden av η, aldri slått sammen med det: bøying og
 * skjær kan styres av helt ulike lastkombinasjoner, og et snitt skal aldri
 * vise to ulike η under samme navn. Alt skjærinnhold leses gjennom
 * `analysisBlock`, så det står der uansett hvilken analyse som ble kjørt.
 *
 * `markLoadChange()`-HEURISTIKKEN ER BORTE (§4.7)
 * Før var `M_Ed` det eneste feltet som IKKE kastet resultatet. Med
 * kombinasjoner holder ikke det: `governing` kan bytte rad når en `M_Ed`
 * endres, og da er toppnivåfeltene og plottet regnet for feil last. Enhver
 * endring i `combos` (og `activeCombo`, av samme grunn for moment–krumning)
 * går derfor gjennom `invalidate()`, uten unntak.
 */

import { BAR_DIAMETERS, CONCRETE_GRADES, CONCRETE_LAWS, STEEL_GRADES, STEEL_LAWS, derivedMaterials }
  from './materials.js';
import { bindNumericInput, evaluate } from './numeric-input.js';
import { aswPerSpacing, layerArea, layerBarCount, layerDepth, recomputeAutoDc, stackedDc,
  suggestedDc, totalArea, totalAswPerSpacing } from './rebar.js';
import { activeComboTheta, allowedAnalyses, axialForcesPresent, derived, sectionHeight, sectionWidth, thetaFor, validate }
  from './section.js';
import { drawSection } from './section-draw.js';
import { momentCurvatureSvg, nmDomainSvg, radialUtilisation } from './charts.js';
import { attachChartTips } from './chart-tips.js';
import { isCancellable, phaseLabel, TOTAL_DOWNLOAD_BYTES } from './solver-client.js';
import { RUN_ALL } from './store.js';
import { fromDocument, toDocument } from './serialize.js';
import {
  DASH, analysisBlock, analysisLabel, checkRows, comboLabel, compressionEdgeLabel, describeWarnings,
  designMoment, directionFromTheta, directionLabel, failureModeLabel, failureModeNote, fmtArea,
  fmtCurvature, fmtForceKN, fmtLength, fmtMomentKNm, fmtNumber, fmtPercent, fmtRatio,
  fmtStrainPermille, fmtStress, governingCombo, headlineUtilisation, lawLabel, messageForCode,
  momentCapacity, sectionTypeLabel, shearGoverningCombo, shearGoverningModeLabel,
  shearHeadlineUtilisation, toNum, utilisationStatus, HEADLINE_UTILISATION_LABEL,
  RADIAL_UTILISATION_LABEL, SHEAR_UTILISATION_LABEL,
} from './results.js';

/* ================================================================== *
 * Småting
 * ================================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** Rå motortekst kan inneholde `<` og `&`. Den skal vises, ikke tolkes. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** MB til statuslinja. */
function mb(bytes) {
  return fmtNumber((Number(bytes) || 0) / 1e6, 1);
}

/** Beskrivelsene av de tre analysene. Kostnaden står i teksten med vilje —
 *  de MÅLTE tidene fra hovedplan §3.7, ikke anslag (endringsrunde 2 §6). */
const ANALYSES = [
  ['bending', 'M_Rd for every load combination. About 55 ms per combination.'],
  ['moment_curvature', 'M(κ) for the active load combination only. 20 points, about 1.8 s.'],
  ['nm_domain', 'Full capacity envelope with every load combination plotted. About 125 ms plus 55 ms per combination.'],
  // «Kjør alle» (§D) er en KLIENTSIDE-analyse: `solver-client.js` kjører de
  // lovlige analysene etter hverandre og fletter blokkene til ett resultat.
  // Motoren kjenner den ikke, og tasten `4` velger den som de tre andre.
  [RUN_ALL, 'Runs every analysis that is available and keeps all of them — three phases, one after the other. The report then prints both plots.'],
];

/**
 * Merkelappen på «Kjør alle»-chippen. Står HER og ikke i `results.js` sin
 * `ANALYSIS_LABELS` fordi den fila eies av en annen arbeidsstrøm denne runden
 * — når `'all'` kommer inn der, skal DEN være kilden, og denne konstanten skal
 * bort. Fram til da ville `analysisLabel('all')` gitt «–» på chippen.
 */
const RUN_ALL_LABEL = 'Run all';

/** «Beregn»-knappen sier hva den kjører (endringsrunde 2 §6). */
const CALC_VERB = {
  bending: 'Calculate bending resistance',
  moment_curvature: 'Calculate moment–curvature',
  nm_domain: 'Calculate N–M interaction domain',
  [RUN_ALL]: 'Run all analyses',
};

/* ================================================================== *
 * Korthånd
 * ================================================================== */

/**
 * Tolker korthåndslinja.
 *
 *   `3Ø20 b 50`      3 stk Ø20, underkant, d_c = 50
 *   `2x25 t`          2 stk Ø25, overkant, d_c avledet
 *   `Ø12 c113 b 31`   Ø12 c/c 113, underkant, d_c = 31
 *   `Ø10/150`         Ø10 c/c 150, underkant, d_c avledet
 *
 * `b`/`bottom` og `t`/`top` er de engelske kantordene; de gamle norske
 * (`uk`/`underkant`/`bunn`, `ok`/`overkant`/`topp`) godtas FORTSATT — å fjerne
 * dem ville vært å ta noe fra brukeren uten grunn, bare fordi skjermteksten nå
 * er engelsk.
 *
 * `dcGiven` sier om brukeren SKREV `d_c`. Merk at et NYTT lag likevel alltid
 * legges inn med `dc_auto: true` av `store.addLayer` (endringsrunde 2 §3.4) —
 * det er `addFromShorthand()` under som, når `dcGiven` er sann, ETTERSENDER
 * verdien som en egen `updateLayer`-kall, for det er DEN handlingen som låser
 * laget (§3.1: «brukeren skriver en verdi i d_c-feltet»).
 *
 * @returns {{mode:string, dia:number, count?:number, spacing?:number,
 *            edge:string, dc:number, dcGiven:boolean}|null} `null` ved uleselig linje
 */
export function parseShorthand(raw, state = {}) {
  let t = ` ${String(raw ?? '').toLowerCase().replace(/,/g, '.').trim()} `;
  if (!t.trim()) return null;

  let edge = 'bottom';
  if (/\b(ok|overkant|topp|top|t)\b/.test(t)) {
    edge = 'top';
    t = t.replace(/\b(ok|overkant|topp|top|t)\b/g, ' ');
  } else {
    t = t.replace(/\b(uk|underkant|bunn|bottom|b)\b/g, ' ');
  }

  let spacing = null;
  let m = t.match(/(?:c\/?c|cc|c|\/)\s*(\d+(?:\.\d+)?)/);
  if (m) { spacing = Number(m[1]); t = t.replace(m[0], ' '); }

  let count = null;
  let dia = null;
  m = t.match(/(\d+)\s*[x×*]\s*(?:ø|o)?\s*(\d+(?:\.\d+)?)/);
  if (m) { count = Number(m[1]); dia = Number(m[2]); t = t.replace(m[0], ' '); }
  if (dia === null) {
    m = t.match(/(\d+)\s*ø\s*(\d+(?:\.\d+)?)/);
    if (m) { count = Number(m[1]); dia = Number(m[2]); t = t.replace(m[0], ' '); }
  }
  if (dia === null) {
    m = t.match(/ø\s*(\d+(?:\.\d+)?)/);
    if (m) { dia = Number(m[1]); t = t.replace(m[0], ' '); }
  }
  if (dia === null || !(dia > 0)) return null;

  const rest = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const dcGiven = rest.length > 0;
  const dc = dcGiven ? rest[0] : suggestedDc(state, dia);

  if (spacing !== null) {
    return { mode: 'spacing', dia, spacing, edge, dc, dcGiven };
  }
  return { mode: 'bars', dia, count: count === null ? 1 : count, edge, dc, dcGiven };
}

/** Laget tilbake til korthånd — brukes i hjelpeteksten og ved duplisering. */
export function shorthandOf(layer = {}) {
  const e = layer.edge === 'top' ? 't' : 'b';
  return layer.mode === 'spacing'
    ? `Ø${layer.dia} c${fmtNumber(layer.spacing, 0)} ${e} ${fmtNumber(layer.dc, 0)}`
    : `${layer.count}Ø${layer.dia} ${e} ${fmtNumber(layer.dc, 0)}`;
}

/* ================================================================== *
 * UI-et
 * ================================================================== */

/* ================================================================== *
 * Resultatvisning — rene strengbyggere
 *
 * Ligger på MODULNIVÅ og ikke inne i `createUI`: de rører ikke DOM-en, bare
 * `result`, og da kan de testes i `node --test` uten en nettleser. Det er
 * nettopp her feilen `governingLabel` bar på kunne levd uoppdaget — den
 * returnerte alltid `null`, og ingen test kunne nå den.
 * ================================================================== */

/**
 * Navn/id på GOVERNING kombinasjon — vises ved siden av η/M_Rd slik at det
 * alltid er synlig at toppnivåfeltene gjelder ÉN bestemt rad, ikke et
 * gjennomsnitt eller den siste raden brukeren rørte (§4.3, §4.7).
 */
export function governingLabel(result) {
  // `governing` og `combinations` ligger i ANALYSEBLOKKA, ikke på toppnivå
  // (`engine.py:1299-1301`, og likedan for M–κ og M–N). Funksjonen leste dem
  // på `result` selv og returnerte derfor ALLTID `null` — merkelappen har
  // aldri vært synlig. `analysisBlock`/`governingCombo` i `results.js` er de
  // samme oppslagene rapporten bruker, så de to kan ikke komme i utakt.
  const id = analysisBlock(result)?.governing;
  if (!id) return null;
  const combo = governingCombo(result);
  return combo && combo.name ? `${combo.name} (${id})` : id;
}

/**
 * Skjærmerket: ETT eget tall, ved siden av η — ALDRI slått sammen med det.
 * De svarer på to ulike spørsmål, og en rad med stor `V_Ed` og lite `M_Ed`
 * kan styre skjær uten å være i nærheten av å styre bøying. Samme utforming
 * som rapporten (`report.js`), slik at skjerm og papir viser samme merke.
 *
 * `null` når INGEN kombinasjon fikk skjær evaluert — da skal det ikke stå
 * noe oppdiktet merke der.
 */
export function shearBadge(result) {
  const combo = shearGoverningCombo(result);
  if (!combo) return '';
  const eta = shearHeadlineUtilisation(result);
  const st = utilisationStatus(eta);
  return `<div class="rounded-lg border px-3 py-1.5 ${esc(st.classes)}">
    <div class="text-[11px] uppercase tracking-wide opacity-80">Shear <span class="normal-case">η<sub>V</sub></span></div>
    <div class="text-2xl font-bold num">${fmtRatio(eta, 2)}</div>
    <div class="text-[11px] opacity-70 num">${esc(SHEAR_UTILISATION_LABEL)} · ${esc(comboLabel(combo))}</div>
  </div>`;
}

/**
 * Skjærpanelet i høyre kolonne. Samme tall, samme rekkefølge og samme note
 * som rapportens skjærkapittel (`report.js`) — `V_Rd,c` LEGGES ALDRI TIL
 * `V_Rd,s` (EC2 6.2.3(2)); `governing_mode` velger hvilket tall som ER
 * `V_Rd`. Tre V_Rd-tall ved siden av hverandre er akkurat der en leser
 * ellers ville gjettet på en sum.
 *
 * Vises UANSETT analyse: motoren fyller `shear` i alle tre analyseblokkene
 * (`engine.py`), og `shearGoverningCombo` leser gjennom `analysisBlock`.
 */
export function shearPanel(result) {
  const combo = shearGoverningCombo(result);
  const sh = combo?.shear;
  if (!sh || !sh.evaluated) {
    return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-400 mb-1.5">Shear (EC2 6.2)</div>
      <p class="text-[12px] text-slate-500">No shear capacity could be evaluated for any load combination.</p></div>`;
  }
  const asw = (v) => (v === null || v === undefined ? DASH : fmtNumber(v, 4));
  return panel('Shear (EC2 6.2)', [
    ['Governing combination', esc(comboLabel(combo)), ''],
    ['V<sub>Ed</sub>', fmtForceKN(sh.V_Ed), 'kN'],
    ['V<sub>Rd</sub>', fmtForceKN(sh.V_Rd), 'kN'],
    [SHEAR_UTILISATION_LABEL, fmtRatio(sh.utilisation, 2), ''],
    ['Governing mode', esc(shearGoverningModeLabel(sh.governing_mode)), ''],
    ['V<sub>Rd,c</sub>', fmtForceKN(sh.V_Rd_c), 'kN'],
    ['V<sub>Rd,s</sub>', fmtForceKN(sh.V_Rd_s), 'kN'],
    ['V<sub>Rd,max</sub>', fmtForceKN(sh.V_Rd_max), 'kN'],
    ['d (shear)', fmtLength(sh.d, 1), 'mm'],
    ['z = z<sub>factor</sub>·d', fmtLength(sh.z, 1), 'mm'],
    ['A<sub>sl</sub>', fmtArea(sh.Asl), 'mm²'],
    ['A<sub>sw</sub>/s', asw(sh.asw_s), 'mm²/mm'],
    ['A<sub>sw</sub>/s,min', asw(sh.asw_s_min), 'mm²/mm'],
    ['A<sub>sw</sub>/s,required', asw(sh.asw_s_required), 'mm²/mm'],
    ['s<sub>l,max</sub>', fmtLength(sh.sl_max, 0), 'mm'],
    ['s<sub>t,max</sub>', fmtLength(sh.st_max, 0), 'mm'],
  ]) + `<p class="text-[11px] text-slate-500 mt-1 leading-snug">V<sub>Rd,c</sub> is never added to ` +
    `V<sub>Rd,s</sub> (EC2 6.2.3(2)) — the governing mode decides which one is V<sub>Rd</sub>. ` +
    `V<sub>Rd,c</sub> is reported either way: it is the number that says whether stirrups were needed at all.</p>`;
}

function panel(title, items) {
  return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
    <div class="text-xs text-slate-400 mb-1.5">${esc(title)}</div>${rows(items)}</div>`;
}

function rows(items) {
  return items.map(([k, v, u]) => `<div class="flex justify-between gap-3 py-[3px] border-b border-slate-800">
    <span class="text-slate-400">${k}</span>
    <span class="num text-slate-100">${v}${u ? ` <span class="text-slate-500">${u}</span>` : ''}</span></div>`).join('');
}

/**
 * Kobler DOM-en i `index.html` til tilstanden.
 *
 * @param {object} deps
 * @param {object} deps.store        `store.js`
 * @param {object} deps.client       `solver-client.js`
 * @param {() => void} deps.onCalculate
 * @param {() => void} deps.onCancel
 * @param {() => void} deps.onReport
 * @param {() => void} deps.onRetryWarmup
 */
export function createUI(deps) {
  const { store, client } = deps;
  const onCalculate = deps.onCalculate || (() => {});
  const onCancel = deps.onCancel || (() => {});
  const onReport = deps.onReport || (() => {});
  const onRetryWarmup = deps.onRetryWarmup || (() => {});

  /** Hvilket lag som står åpent i radeditoren. `null` = ingen. */
  let editing = null;
  /** Kjører en beregning nå? */
  let busy = false;
  /** Siste linjer i korthåndsfeltet, for ↑. */
  const shHistory = [];

  /**
   * Er `d_c` LÅST (avledet) for laget med denne id-en?
   *
   * Leser `layer.dc_auto` fra TILSTANDEN (endringsrunde 2 §3.1) — det er ikke
   * lenger en lokal Map her. Det er det som gjør at låsen overlever
   * lagre/laste (§5): flagget er en del av laget, ikke av denne økten.
   */
  function isLocked(id) {
    const layer = store.getState().layers.find((l) => l.id === id);
    return layer ? layer.dc_auto !== false : true;
  }

  /**
   * Hva `dc` VILLE vært for `layerId` dersom laget var låst — brukt i
   * radeditorens hjelpetekst («den avledede verdien ville vært X mm»).
   *
   * Kjører HELE `recomputeAutoDc` på en HYPOTETISK tilstand, ikke bare
   * `suggestedDc`: et lag som er stablet oppå et annet (EC2 8.2, §2.2) får
   * ikke riktig tall av den enkle formelen alene, og en feil «ville vært»
   * er verre enn ingen — det er nøyaktig tallet brukeren vurderer å stole på.
   */
  function autoDcPreview(state, layerId) {
    const hypothetical = {
      ...state,
      layers: state.layers.map((l) => (l.id === layerId ? { ...l, dc_auto: true } : l)),
    };
    const recomputed = recomputeAutoDc(hypothetical);
    const found = recomputed.find((l) => l.id === layerId);
    return found ? found.dc : null;
  }

  /* ---------------------------------------------------------------- *
   * Felter
   * ---------------------------------------------------------------- */

  /** Uttrykksfelt bundet til én sti i tilstanden. */
  function bindField(sel, read, write, rules, after) {
    const el = $(sel);
    if (!el) return;
    bindNumericInput(el, (value) => {
      if (value === null) {
        // Uleselig eller utenfor området: legg tilbake det som gjelder.
        el.value = fmtNumber(read(store.getState()));
        return;
      }
      write(value);
      (after || invalidate)();
      render();
    }, rules);
  }

  /**
   * KASTER resultatet. Kalles av ALT som endrer noe resultatet ble regnet for
   * — inkludert enhver endring i `combos`/`activeCombo` (§4.7). Det finnes
   * ikke lenger noe unntak: `markLoadChange()` er fjernet, for `governing` kan
   * bytte rad når en `M_Ed` endres, og da er BÅDE toppnivåfeltene OG plottet
   * regnet for en annen last enn den som står i skjemaet.
   *
   * HVORFOR IKKE BARE MERKE DET SOM FORELDET
   * Et resultat som ligger igjen ved siden av en tilstand det ikke gjelder for,
   * er en felle: rapporten (`report.js`) bygges av `state` OG `state.result`
   * sammen, og ville da trykt tøyningsmerkelapper for feltmoment ved siden av
   * kapasitetstall regnet for støttemoment — uten at noe feiler. En grå
   * «foreldet»-etikett hjelper ikke, for papiret arver ikke etiketten.
   */
  function invalidate() {
    if (store.getState().result) store.setResult(null);
  }

  function setupFields() {
    bindField('#i-b', (s) => s.geometry.b, (v) => {
      if (store.getState().sectionType !== 'slab') store.patch('geometry', { b: v });
    }, { min: 1 });
    bindField('#i-h', (s) => s.geometry.h, (v) => store.patch('geometry', { h: v }), { min: 1 });
    // `store.setState` regner selv `dc_auto`-lagene på nytt når `cover`/
    // `stirrup_dia` endres (endringsrunde 2 §3.4) — det trengs ingen egen
    // resync her lenger. `store.resyncCover()` er slettet av samme grunn.
    bindField('#i-cover', (s) => s.cover, (v) => store.setState({ cover: v }), { min: 0 });
    bindField('#i-stirrup', (s) => s.stirrup_dia, (v) => store.setState({ stirrup_dia: v }), { min: 0 });
    bindField('#i-cover-side', (s) => s.cover_side, (v) => store.setState({ cover_side: v }), { min: 0 });

    bindField('#i-gamma-c', (s) => s.concrete.gamma_c, (v) => store.patch('concrete', { gamma_c: v }), { min: 0.0001 });
    bindField('#i-alpha-cc', (s) => s.concrete.alpha_cc, (v) => store.patch('concrete', { alpha_cc: v }), { min: 0.0001 });
    bindField('#i-gamma-s', (s) => s.steel.gamma_s, (v) => store.patch('steel', { gamma_s: v }), { min: 0.0001 });
    bindField('#i-k', (s) => s.steel.k, (v) => store.patch('steel', { k: v }), { min: 1 });
    bindField('#i-epsuk', (s) => s.steel.epsuk, (v) => store.patch('steel', { epsuk: v }), { min: 0.0001 });
    bindField('#i-gamma-eps', (s) => s.steel.gamma_eps, (v) => store.patch('steel', { gamma_eps: v }), { min: 0.0001 });

    // Skjær, «Advanced» (§B). INGEN `min`/`max` på trykkstavvinkelen med
    // vilje: `evaluateBounded` AVVISER en verdi utenfor området og legger
    // stille tilbake den gamle, mens `validate()` i `section.js` allerede har
    // den ferdige EC2 6.2.3(2)-meldingen med både grensen og verdien brukeren
    // skrev. En stille avvisning ville tatt den forklaringen fra brukeren.
    bindField('#i-strut-angle', (s) => s.shear.strut_angle_deg,
      (v) => store.patch('shear', { strut_angle_deg: v }));
    // `z_factor` har derimot INGEN validering bak seg, og z = z_factor·d er
    // meningsløs utenfor (0, 1]. Her er avvisningen det eneste vernet.
    bindField('#i-z-factor', (s) => s.shear.z_factor,
      (v) => store.patch('shear', { z_factor: v }), { min: 0.01, max: 1 });

    // EC2 8.2(2) — k1/k2 er NA-parametere, d_g er ikke det, men inngår i
    // samme formel (endringsrunde 2 §2). `store.patch('spacing', …)` regner
    // selv `dc_auto`-lagene på nytt.
    bindField('#i-k1', (s) => s.spacing.k1, (v) => store.patch('spacing', { k1: v }), { min: 0.0001 });
    bindField('#i-k2', (s) => s.spacing.k2, (v) => store.patch('spacing', { k2: v }), { min: 0 });
    bindField('#i-dg', (s) => s.spacing.d_g, (v) => store.patch('spacing', { d_g: v }), { min: 0 });

    // Dokumentfeltene går bare i rapportens topptekst. De rører ikke noe tall,
    // og skal derfor ALDRI kaste resultatet.
    for (const key of ['project', 'title', 'author', 'date', 'note']) {
      const el = $(`#doc-${key}`);
      if (!el) continue;
      el.addEventListener('input', () => store.patch('doc', { [key]: el.value }));
    }

    const lawC = $('#i-law-c');
    if (lawC) {
      lawC.innerHTML = CONCRETE_LAWS.map((l) => `<option value="${l.value}">${esc(l.label)}</option>`).join('');
      lawC.addEventListener('change', () => { store.patch('concrete', { law: lawC.value }); invalidate(); render(); });
    }
    const lawS = $('#i-law-s');
    if (lawS) {
      lawS.innerHTML = STEEL_LAWS.map((l) => `<option value="${l.value}">${esc(l.label)}</option>`).join('');
      lawS.addEventListener('change', () => { store.patch('steel', { law: lawS.value }); invalidate(); render(); });
    }
  }

  /** Feltverdiene skrives bare når feltet IKKE har fokus — ellers hopper markøren. */
  function syncFields() {
    const s = store.getState();
    const put = (sel, value, decimals = 3) => {
      const el = $(sel);
      if (!el || el === document.activeElement) return;
      el.value = fmtNumber(value, decimals);
    };
    put('#i-b', sectionWidth(s), 1);
    put('#i-h', s.geometry.h, 1);
    put('#i-cover', s.cover, 1);
    put('#i-stirrup', s.stirrup_dia, 1);
    put('#i-cover-side', s.cover_side, 1);
    put('#i-strut-angle', s.shear.strut_angle_deg, 1);
    put('#i-z-factor', s.shear.z_factor, 3);
    put('#i-k1', s.spacing.k1);
    put('#i-k2', s.spacing.k2);
    put('#i-dg', s.spacing.d_g, 1);
    put('#i-gamma-c', s.concrete.gamma_c);
    put('#i-alpha-cc', s.concrete.alpha_cc);
    put('#i-gamma-s', s.steel.gamma_s);
    put('#i-k', s.steel.k);
    put('#i-epsuk', s.steel.epsuk, 5);
    put('#i-gamma-eps', s.steel.gamma_eps);

    const isSlab = s.sectionType === 'slab';
    const b = $('#i-b');
    if (b) {
      // Plata er ALLTID 1000 mm: alt regnes per meter (plan §1). Feltet vises,
      // men er låst — et redigerbart felt som ikke virker er verre enn et låst.
      b.disabled = isSlab;
      b.classList.toggle('opacity-60', isSlab);
    }
    const stir = $('#w-stirrup');
    const side = $('#w-cover-side');
    // «Stirrup Ø» skjules for plata fordi den normalt ikke har bøyler — men
    // legger brukeren inn en bøylerad likevel, ER tallet i bruk (det er SAMME
    // verdi som radens Ø, §B), og et felt som styrer noe skal ikke være
    // usynlig. Merknaden i bøyleraden peker nettopp hit.
    if (stir) stir.style.display = isSlab && !(s.shear?.stirrups || []).length ? 'none' : '';
    if (side) side.style.display = isSlab ? 'none' : '';

    const lawC = $('#i-law-c');
    if (lawC) lawC.value = s.concrete.law;
    const lawS = $('#i-law-s');
    if (lawS) lawS.value = s.steel.law;
  }

  /* ---------------------------------------------------------------- *
   * Segmenter og brikker
   * ---------------------------------------------------------------- */

  function renderSegment(sel, current, onPick) {
    const el = $(sel);
    if (!el) return;
    for (const btn of Array.from(el.children)) {
      btn.dataset.on = String(btn.dataset.v === current);
      btn.onclick = () => onPick(btn.dataset.v);
    }
  }

  /**
   * `items[i].disabled` (endringsrunde 4 §2) gjør chippen `disabled` med dempet
   * stil og ingen klikkhandler — MEN `title` beholdes, for den er der
   * begrunnelsen står («et resistance quoted at a single axial force is one
   * point on a curve»). En deaktivert chip UTEN grunn i `title` er like
   * uforklarlig som et felt som bare avviser tastetrykket.
   */
  function renderChips(sel, items, current, onPick) {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = items
      .map((i) => `<button type="button" class="chip${i.disabled ? ' opacity-40 cursor-not-allowed' : ''}" ` +
                  `data-v="${esc(i.value)}" data-on="${String(i.value === current)}" ` +
                  `${i.disabled ? 'disabled' : ''} title="${esc(i.title || '')}">${esc(i.label)}</button>`)
      .join('');
    for (const btn of Array.from(el.children)) {
      if (btn.disabled) continue;
      btn.onclick = () => onPick(btn.dataset.v);
    }
  }

  /* ---------------------------------------------------------------- *
   * Armering
   * ---------------------------------------------------------------- */

  function renderLayers() {
    const host = $('#layers');
    if (!host) return;
    const s = store.getState();
    // `state.direction` finnes ikke lenger (endringsrunde 4 §1.2) — retningen ER
    // fortegnet på den AKTIVE kombinasjonens `M_Ed`. `thetaFor(s.direction)` ville
    // fra nå av bare fått `undefined` inn og alltid svart θ = 0, uten feilmelding.
    const theta = activeComboTheta(s);
    const isSlab = s.sectionType === 'slab';
    const perMeter = isSlab ? '/m' : '';

    if (!s.layers.length) {
      host.innerHTML =
        `<div class="px-4 py-6 text-center text-sm text-slate-500">No reinforcement layers yet. ` +
        `Type <span class="font-mono text-sky-300">${isSlab ? 'Ø12 c113 b 31' : '3Ø20 b 50'}</span> ` +
        `in the line above, or press "+ New layer" and fill in the fields.</div>`;
      return;
    }

    host.innerHTML = s.layers.map((layer) => {
      const area = layerArea(layer);
      const d = layerDepth(layer, sectionHeight(s), theta);
      const n = layerBarCount(layer);
      const label = layer.mode === 'spacing'
        ? `<b class="text-amber-300">Ø${fmtNumber(layer.dia, 1)}</b> c/c <b class="text-amber-300">${fmtNumber(layer.spacing, 0)}</b>`
        : `<b class="text-amber-300">${fmtNumber(layer.count, 0)}</b> × <b class="text-amber-300">Ø${fmtNumber(layer.dia, 1)}</b>`;
      const open = editing === layer.id;
      return `<div class="lrow bg-slate-800/40">
        <div class="flex items-center gap-3 px-3 py-2.5 text-[13px]">
          <span class="w-6 text-slate-500 text-[11px]">${esc(layer.id)}</span>
          <span class="min-w-[116px] num">${label}</span>
          <button type="button" class="chip !py-0.5 !px-2 !text-[11px]" data-edge="${esc(layer.id)}"
                  title="Switch to ${layer.edge === 'bottom' ? 'top' : 'bottom'}">${layer.edge === 'bottom' ? 'BOT' : 'TOP'}</button>
          <span class="text-slate-400 num">d<sub>c</sub> ${fmtNumber(layer.dc, 1)}${isLocked(layer.id) ? ' <span title="Derived automatically (EC2 8.2 stacking)">🔒</span>' : ''}</span>
          <span class="text-slate-500 num hidden md:inline ml-3">A<sub>s</sub> ${fmtArea(area)} mm²${perMeter} · d ${fmtLength(d, 0)} mm · ${n} bars</span>
          <span class="lact ml-auto flex gap-1">
            <button type="button" class="px-2 py-1 rounded hover:bg-slate-700 text-slate-300" data-open="${esc(layer.id)}"
                    title="Edit all fields">${open ? '▾' : '✎'}</button>
            <button type="button" class="px-2 py-1 rounded hover:bg-slate-700 text-slate-400" data-dup="${esc(layer.id)}" title="Duplicate">⧉</button>
            <button type="button" class="px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300" data-del="${esc(layer.id)}" title="Delete">✕</button>
          </span>
        </div>
        ${open ? rowEditor(layer, s) : ''}
      </div>`;
    }).join('');

    bindLayerRows(host);
  }

  /**
   * Radeditoren: HVERT felt redigerbart uten å kunne grammatikken.
   *
   * Ø-brikkeraden er den ene tingen som er hentet fra mockup B, og den ligger
   * HER og ikke i innleggingslinja: korthånden skal fortsatt være hovedveien,
   * mens brikkene er utveien for den som ikke vil lære den. Brikker kan ikke
   * uttrykke en vilkårlig verdi, så tallfeltet ved siden av er ikke overflødig
   * — c/c 113 fra platefixturen står ikke på noen brikkeliste.
   */
  function rowEditor(layer, state) {
    const isSpacing = layer.mode === 'spacing';
    const locked = isLocked(layer.id);
    const auto = autoDcPreview(state, layer.id);
    return `<div class="px-3 pb-3 pt-1 border-t border-slate-700/60 grid gap-3 md:grid-cols-[1fr_auto]">
      <div class="space-y-2">
        <div>
          <span class="field-label">Diameter Ø [mm]</span>
          <div class="flex flex-wrap items-center gap-1.5">
            ${BAR_DIAMETERS.map((d) => `<button type="button" class="chip !text-[11px]" data-dia="${esc(layer.id)}" data-v="${d}" data-on="${String(Number(layer.dia) === d)}">${d}</button>`).join('')}
            <input type="text" class="!w-20 ml-1" data-f="dia" data-l="${esc(layer.id)}" value="${fmtNumber(layer.dia, 2)}" aria-label="Diameter">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 max-w-md">
          ${isSpacing
            ? `<label><span class="field-label">Spacing c/c [mm]</span><input type="text" data-f="spacing" data-l="${esc(layer.id)}" value="${fmtNumber(layer.spacing, 1)}"></label>`
            : `<label><span class="field-label">Number of bars</span><input type="text" data-f="count" data-l="${esc(layer.id)}" value="${fmtNumber(layer.count, 0)}"></label>`}
          <div>
            <span class="field-label">Edge d<sub>c</sub> is measured from</span>
            <div class="seg w-full" data-edgeseg="${esc(layer.id)}">
              <button type="button" data-v="bottom" data-on="${String(layer.edge !== 'top')}" class="flex-1">Bottom</button>
              <button type="button" data-v="top" data-on="${String(layer.edge === 'top')}" class="flex-1">Top</button>
            </div>
          </div>
        </div>
        <div class="max-w-md">
          <span class="field-label">d<sub>c</sub> — edge to bar CENTRE [mm]</span>
          <div class="flex items-center gap-2">
            <button type="button" class="chip shrink-0" data-lock="${esc(layer.id)}"
                    title="${locked ? 'Unlock to type d_c yourself' : 'Lock to the EC2 8.2 derived value'}">${locked ? '🔒 derived' : '🔓 custom value'}</button>
            <input type="text" data-f="dc" data-l="${esc(layer.id)}" value="${fmtNumber(layer.dc, 2)}"
                   ${locked ? 'readonly class="opacity-60"' : ''} aria-label="d_c">
          </div>
          <p class="text-[11px] text-slate-500 mt-1 num">
            ${locked
              ? `Kept at the EC2 8.2 derived value = <b>${fmtNumber(auto, 2)} mm</b>, recalculated whenever cover, stirrup diameter, this layer's Ø, or a layer stacked below it on the same edge changes.`
              : `Entered manually. The derived value would be ${fmtNumber(auto, 2)} mm.`}
          </p>
        </div>
      </div>
      <div class="text-[11px] text-slate-500 num md:text-right md:w-44 space-y-1">
        <div>Shorthand: <span class="font-mono text-slate-400">${esc(shorthandOf(layer))}</span></div>
        <div>A<sub>s</sub> ${fmtArea(layerArea(layer))} mm²${state.sectionType === 'slab' ? '/m' : ''}</div>
        <div>${layerBarCount(layer)} bars drawn</div>
        <button type="button" class="chip mt-1" data-close="1">Close</button>
      </div>
    </div>`;
  }

  function bindLayerRows(host) {
    host.querySelectorAll('[data-open]').forEach((el) => {
      el.onclick = () => { editing = editing === el.dataset.open ? null : el.dataset.open; render(); };
    });
    host.querySelectorAll('[data-close]').forEach((el) => {
      el.onclick = () => { editing = null; render(); };
    });
    host.querySelectorAll('[data-edge]').forEach((el) => {
      el.onclick = () => {
        const layer = store.getState().layers.find((l) => l.id === el.dataset.edge);
        if (!layer) return;
        store.updateLayer(layer.id, { edge: layer.edge === 'top' ? 'bottom' : 'top' });
        invalidate(); render();
      };
    });
    host.querySelectorAll('[data-edgeseg]').forEach((el) => {
      for (const btn of Array.from(el.children)) {
        btn.onclick = () => { store.updateLayer(el.dataset.edgeseg, { edge: btn.dataset.v }); invalidate(); render(); };
      }
    });
    host.querySelectorAll('[data-dup]').forEach((el) => {
      el.onclick = () => {
        // `store.duplicateLayer` setter ALLTID `dc_auto: true` på kopien og
        // stabler den utenfor kilden (§3.4, bestillingens punkt 2) — ingen
        // lokal bokføring trengs her lenger.
        store.duplicateLayer(el.dataset.dup);
        invalidate(); render();
      };
    });
    host.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => {
        store.removeLayer(el.dataset.del);
        if (editing === el.dataset.del) editing = null;
        invalidate(); render();
      };
    });
    host.querySelectorAll('[data-dia]').forEach((el) => {
      el.onclick = () => { setLayerValue(el.dataset.dia, 'dia', Number(el.dataset.v)); };
    });
    host.querySelectorAll('[data-lock]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.lock;
        // Åpner låsen igjen: sett `dc_auto: true`. `store.updateLayer` regner
        // selv `dc` på nytt med det samme (§3.1) — ingen egen resync trengs.
        store.updateLayer(id, { dc_auto: !isLocked(id) });
        invalidate(); render();
      };
    });
    host.querySelectorAll('input[data-f]').forEach((el) => {
      bindNumericInput(el, (value) => {
        if (value === null) { render(); return; }
        setLayerValue(el.dataset.l, el.dataset.f, value);
      }, el.dataset.f === 'count' ? { min: 1, integer: true } : { min: 0.01 });
    });
  }

  /**
   * Én feltendring i et lag.
   *
   * `store.updateLayer` gjør nå ALT selv (§3.4): skriver brukeren `dc`, låser
   * den laget FØRST og regner de andre auto-lagene på nytt; endres `dia`
   * eller `edge`, flyttes ethvert `dc_auto`-lag på kanten. Denne funksjonen
   * skal derfor IKKE lenger regne `dc` selv — gjorde den det, ville den
   * komme i veien for `recomputeAutoDc`s egen stabling (§2.2).
   */
  function setLayerValue(id, field, value) {
    store.updateLayer(id, { [field]: value });
    invalidate();
    render();
  }

  /* ---------------------------------------------------------------- *
   * Skjærarmering (§B)
   * ---------------------------------------------------------------- */

  /**
   * Samme vakt som `comboEditInFlight` under, og av nøyaktig samme grunn:
   * `render()` bygger radlista på nytt med `innerHTML`, og `blur` fyrer FØR
   * TAB flytter fokus. Uten flagget finnes elementet nettleseren var på vei
   * til ikke lenger, og fokus faller ut av gruppa midt i inntastingen — den
   * regresjonen ble merket med én gang forrige gang den slapp gjennom.
   * Strukturelle endringer (legg til / fjern rad) setter det IKKE: der er
   * omtegningen hele poenget.
   */
  let stirrupEditInFlight = false;

  function renderStirrups() {
    const host = $('#stirrups');
    if (!host) return;
    if (stirrupEditInFlight) return;
    const s = store.getState();
    // `list`, ikke `rows`: `rows()` er den modulnivå-funksjonen som bygger
    // nøkkel/verdi-linjene i resultatpanelet, og en skygge her ville vært en
    // felle for den neste som skulle bruke den.
    const list = s.shear?.stirrups || [];

    if (!list.length) {
      // Tom liste er IKKE et hull i skjemaet: den er signalet til motoren om å
      // ta V_Rd,c-veien (EC2 6.2.1(4)), og riktig svar for en plate og for en
      // bjelke som ennå ikke har fått bøyler.
      host.innerHTML =
        `<div class="px-3 py-3 text-[12px] text-slate-500">No stirrups. The shear capacity is then ` +
        `V<sub>Rd</sub> = V<sub>Rd,c</sub> — the concrete alone (EC2 6.2.1(4)), which is what a slab ` +
        `normally relies on. Press "+ Add stirrups" to add shear reinforcement.</div>`;
      return;
    }

    host.innerHTML = list.map((st, i) => `<div class="px-3 py-2 text-[13px]">
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-6 text-slate-500 text-[11px]">${esc(st.id)}</span>
        <label class="flex items-center gap-1 text-[11px] text-slate-500"
               title="The same physical stirrup as &quot;Stirrup Ø&quot; above — changing it moves every automatic d_c.">Ø
          <input type="text" class="!w-16" data-sf="dia" data-s="${esc(st.id)}" value="${fmtNumber(st.dia, 1)}" aria-label="Stirrup diameter [mm]"></label>
        <label class="flex items-center gap-1 text-[11px] text-slate-500">c/c
          <input type="text" class="!w-20" data-sf="spacing" data-s="${esc(st.id)}" value="${fmtNumber(st.spacing, 1)}" aria-label="Stirrup spacing s [mm]"></label>
        <label class="flex items-center gap-1 text-[11px] text-slate-500"
               title="Number of legs crossing the shear plane — all of them count in A_sw (EC2 6.2.3).">legs
          <input type="text" class="!w-14" data-sf="legs" data-s="${esc(st.id)}" value="${fmtNumber(st.legs, 0)}" aria-label="Number of legs"></label>
        <label class="flex items-center gap-1 text-[11px] text-slate-500">f<sub>ywk</sub>
          <input type="text" class="!w-20" data-sf="fywk" data-s="${esc(st.id)}" value="${fmtNumber(st.fywk, 0)}" aria-label="f_ywk [MPa]"></label>
        <span class="text-[11px] text-slate-500 num hidden md:inline">A<sub>sw</sub>/s ${fmtNumber(aswPerSpacing(st), 3)} mm²/mm</span>
        <button type="button" class="ml-auto px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300"
                data-remove-stirrup="${esc(st.id)}" title="Remove stirrup row">✕</button>
      </div>
      ${i === 0 ? `<div class="mt-1 text-[11px] text-slate-500">Ø is the same number as "Stirrup Ø" in the cover row above — one physical stirrup, one value. Changing it moves every layer whose d<sub>c</sub> is derived.</div>` : ''}
    </div>`).join('');

    bindStirrupRows(host);
  }

  function bindStirrupRows(host) {
    host.querySelectorAll('[data-remove-stirrup]').forEach((el) => {
      el.onclick = () => { store.removeStirrup(el.dataset.removeStirrup); invalidate(); render(); };
    });
    host.querySelectorAll('input[data-sf]').forEach((el) => {
      const field = el.dataset.sf;
      // `legs` er et ANTALL (heltall, minst 2 — en bøyle har to ben). `dia` og
      // `spacing` avvises under 1 mm: `aswPerSpacing` deler på `spacing`, og
      // en null der ville gitt et uendelig A_sw/s som ingen validering fanger.
      // `fywk` har ingen øvre grense her — valideringen krever bare at alle
      // rader er enige.
      const rules = field === 'legs' ? { min: 2, integer: true } : { min: 1 };
      bindNumericInput(el, (value) => {
        if (value === null) { render(); return; }
        store.updateStirrup(el.dataset.s, { [field]: value });
        // Feltet normaliseres PÅ STEDET, og raden bygges IKKE om — se
        // `stirrupEditInFlight`. Resten av sida (tegning, validering,
        // bunnlinje) skal derimot oppdateres, derfor et fullt `render()`.
        el.value = fmtNumber(value, field === 'legs' ? 0 : 1);
        stirrupEditInFlight = true;
        invalidate();
        render();
        stirrupEditInFlight = false;
      }, rules);
    });
  }

  function setupShear() {
    const add = $('#add-stirrup');
    if (!add) return;
    add.onclick = () => {
      // BARE NAAR LISTA ER TOM. `python/engine.py:617-625` summerer alle rader
      // som PARALLELLE boeylesett, mens `section-draw.js` bare tegner rad 0 og
      // `store.js:syncStirrupDia` bare binder rad 0 til `stirrup_dia`. To rader
      // ga derfor maalt 2,7x kapasiteten uten at figuren endret seg med en
      // eneste piksel. Lista forblir en LISTE i modellen — veikartet lover
      // flere soner — men UI-et tilbyr én rad til den stoetten er reell.
      if ((store.getState().shear?.stirrups || []).length > 0) return;
      store.addStirrup();
      invalidate();
      render();
    };
  }

  /* ---------------------------------------------------------------- *
   * Korthåndslinja
   * ---------------------------------------------------------------- */

  function addFromShorthand() {
    const field = $('#sh-input');
    if (!field) return;
    const parsed = parseShorthand(field.value, store.getState());
    if (!parsed) {
      field.classList.add('!border-rose-500');
      setTimeout(() => field.classList.remove('!border-rose-500'), 800);
      return;
    }
    const { dcGiven, dc, ...values } = parsed;
    const layer = store.addLayer(values);
    // `store.addLayer` stabler ALLTID det nye laget med `dc_auto: true`
    // (§3.4) — skrev brukeren en egen `d_c` i korthånden, må den ettersendes
    // som en eksplisitt `updateLayer`, for DET er handlingen som låser laget
    // (§3.1: «brukeren skriver en verdi i d_c-feltet»).
    if (dcGiven) store.updateLayer(layer.id, { dc });
    shHistory.push(field.value);
    field.value = '';
    invalidate();
    render();
    field.focus();
  }

  function setupShorthand() {
    const field = $('#sh-input');
    if (!field) return;
    field.addEventListener('input', () => {
      const prev = $('#sh-preview');
      if (!prev) return;
      if (!field.value.trim()) { prev.innerHTML = ''; return; }
      const p = parseShorthand(field.value, store.getState());
      prev.innerHTML = p
        ? `→ ${p.mode === 'bars' ? `${p.count} × Ø${p.dia}` : `Ø${p.dia} c/c ${fmtNumber(p.spacing, 0)}`} · ` +
          `${p.edge === 'bottom' ? 'Bottom' : 'Top'} · d<sub>c</sub> ${fmtNumber(p.dc, 1)}${p.dcGiven ? '' : ' (derived 🔒)'} · ` +
          `A<sub>s</sub> ${fmtArea(layerArea(p))} mm²`
        : `<span class="text-rose-400">Can’t parse this line. Use the examples, or press "+ New layer" and fill in the fields.</span>`;
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addFromShorthand(); }
      if (e.key === 'ArrowUp' && !field.value && shHistory.length) {
        field.value = shHistory[shHistory.length - 1];
        field.dispatchEvent(new Event('input'));
      }
      if (e.key === 'Escape') field.blur();
    });
    const add = $('#sh-add');
    if (add) add.onclick = addFromShorthand;

    const plain = $('#add-layer');
    if (plain) {
      plain.onclick = () => {
        const layer = store.addLayer();
        // Nytt tomt lag åpnes i editoren: da ser en ny bruker med én gang at
        // alt kan skrives inn i felter, uten å kjenne korthånden. `dc_auto`
        // er allerede `true` fra `store.addLayer`.
        editing = layer.id;
        invalidate();
        render();
      };
    }
    const dup = $('#dup-last');
    if (dup) dup.onclick = duplicateLast;
  }

  function duplicateLast() {
    const layers = store.getState().layers;
    if (!layers.length) return;
    const last = layers[layers.length - 1];
    store.duplicateLayer(last.id);
    invalidate();
    render();
  }

  /* ---------------------------------------------------------------- *
   * Lastkombinasjoner (endringsrunde 2 §4)
   * ---------------------------------------------------------------- */

  /**
   * Tabellen over `state.combos`. Hver rad er navn, N_Ed, signert M_Ed og V_Ed
   * (endringsrunde 4 §1/§3 — INGEN egen retningskontroll lenger, fortegnet på
   * M_Ed ER retningen), pluss en knapp som velger `activeCombo` (den
   * moment–krumning regner på, §4.3) og en fjernknapp som er deaktivert på den
   * siste raden — `store` nekter uansett å fjerne den, men en deaktivert knapp
   * er en klarere beskjed enn et klikk som ikke gjør noe.
   */
  /**
   * Settes mens en feltredigering i kombinasjonstabellen behandles.
   *
   * HVORFOR: `render()` bygde tabellen på nytt med `innerHTML` ved hver `blur`.
   * Trykker man TAB, fyrer `blur` FØRST, DOM-en erstattes, og elementet
   * nettleseren var i ferd med å flytte fokus til finnes ikke lenger — fokus
   * falt ut av tabellen. Radene er allerede korrekte når brukeren selv har
   * skrevet i dem, så omtegningen har ingenting å rette.
   *
   * Strukturelle endringer — legge til, fjerne, bytte aktiv rad eller retning —
   * setter IKKE flagget, for der er omtegningen hele poenget.
   */
  let comboEditInFlight = false;

  /**
   * Tolkningen av ETT `M_Ed`-tall — opplysningsplikten fra plan §1.7.
   *
   * `structuralcodes` sin konvensjon er MOTSATT norsk praksis: sagging er
   * NEGATIV. En setning som bare gjentar tallet hjelper ikke — den må si hvilken
   * kant som er i trykk, for det er DET en norsk ingeniør ellers ville gjettet feil på.
   * Bruker `thetaFor`/`directionFromTheta`/`compressionEdgeLabel`, SAMME regel
   * motoren og `activeComboTheta` bruker, ikke en egen kopi av `<= 0`-testen.
   *
   * @param {number} mEd
   * @returns {string} tom streng når `mEd` ikke er et tall (feltet er under redigering)
   */
  function momentInterpretation(mEd) {
    const v = Number(mEd);
    if (!Number.isFinite(v)) return '';
    const theta = thetaFor(v);
    const dir = directionFromTheta(theta) || (v <= 0 ? 'sagging' : 'hogging');
    return `${fmtNumber(v, 1)} kNm → ${dir}, compression at the ${compressionEdgeLabel(theta)}`;
  }

  /** Interpretasjonslinja for kombinasjon `id`, eller `null` om den ikke er tegnet. */
  function interpEl(host, id) {
    return Array.from(host.querySelectorAll('[data-m-interp]')).find((n) => n.dataset.mInterp === id) || null;
  }

  function renderCombos() {
    const host = $('#combos');
    if (!host) return;
    if (comboEditInFlight) return;
    const s = store.getState();
    host.innerHTML = s.combos.map((combo) => {
      const active = combo.id === s.activeCombo;
      return `<div class="px-3 py-2 text-[13px] ${active ? 'bg-sky-950/30' : ''}">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="chip !py-0.5 !px-2 !text-[11px] shrink-0" data-active-combo="${esc(combo.id)}"
                  data-on="${String(active)}" title="${active ? 'Active — used for moment–curvature' : 'Set active for moment–curvature'}">
            ${active ? '● ' + esc(combo.id) : esc(combo.id)}
          </button>
          <input type="text" class="!w-28" data-cf="name" data-c="${esc(combo.id)}" value="${esc(combo.name)}" placeholder="name" aria-label="Combination name">
          <label class="flex items-center gap-1 text-[11px] text-slate-500">N<sub>Ed</sub>
            <input type="text" class="!w-24" data-cf="N_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.N_Ed, 2)}" aria-label="N_Ed [kN], compression negative"></label>
          <label class="flex items-center gap-1 text-[11px] text-slate-500" title="Sign convention follows fib structuralcodes: sagging (compression at the top face) is negative.">M<sub>Ed</sub> [kNm] — sagging negative
            <input type="text" class="!w-24" data-cf="M_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.M_Ed, 2)}" aria-label="M_Ed [kNm], sagging negative"></label>
          <label class="flex items-center gap-1 text-[11px] text-slate-500">V<sub>Ed</sub>
            <input type="text" class="!w-24" data-cf="V_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.V_Ed, 2)}" aria-label="V_Ed [kN], magnitude — the sign does not matter"></label>
          <button type="button" class="ml-auto px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  data-remove-combo="${esc(combo.id)}" ${s.combos.length <= 1 ? 'disabled' : ''}
                  title="${s.combos.length <= 1 ? 'The last combination cannot be removed' : 'Remove combination'}">✕</button>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 num" data-m-interp="${esc(combo.id)}">${esc(momentInterpretation(combo.M_Ed))}</div>
      </div>`;
    }).join('');
    bindComboRows(host);
  }

  function bindComboRows(host) {
    host.querySelectorAll('[data-active-combo]').forEach((el) => {
      el.onclick = () => {
        store.setActiveCombo(el.dataset.activeCombo);
        // Moment–krumning regner BARE den aktive kombinasjonen (§4.3): bytter
        // den, gjaldt et liggende resultat en annen last enn den brukeren nå
        // ser på.
        invalidate();
        render();
      };
    });
    host.querySelectorAll('[data-remove-combo]').forEach((el) => {
      el.onclick = () => {
        if (el.disabled) return;
        store.removeCombo(el.dataset.removeCombo);
        invalidate();
        render();
      };
    });
    host.querySelectorAll('input[data-cf="name"]').forEach((el) => {
      el.addEventListener('input', () => {
        store.updateCombo(el.dataset.c, { name: el.value });
        comboEditInFlight = true;
        invalidate();
        render();
        comboEditInFlight = false;
      });
      // Ingen omtegning ved `blur`. Feltet viser allerede det brukeren skrev, og
      // en omtegning her ville spist TAB-en som utløste den.
    });
    host.querySelectorAll('input[data-cf="N_Ed"]').forEach((el) => {
      bindNumericInput(el, (value) => {
        if (value === null) { render(); return; }
        store.updateCombo(el.dataset.c, { N_Ed: value });
        // Feltet normaliseres PÅ STEDET. Å bygge om raden her ville tatt TAB-en.
        el.value = fmtNumber(value, 2);
        comboEditInFlight = true;
        invalidate();
        render();
        comboEditInFlight = false;
      });
    });
    host.querySelectorAll('input[data-cf="M_Ed"]').forEach((el) => {
      // Levende tolkningslinje (plan §1.7): oppdateres ved HVERT tastetrykk, ikke
      // bare ved commit (`bindNumericInput` skriver først til tilstanden ved
      // blur/Enter) — poenget er at brukeren ser hvilken kant som kommer i trykk
      // FØR hen forlater feltet, ikke etterpå.
      el.addEventListener('input', () => {
        const target = interpEl(host, el.dataset.c);
        if (!target) return;
        const v = evaluate(el.value);
        target.textContent = v === null ? '' : momentInterpretation(v);
      });
      bindNumericInput(el, (value) => {
        if (value === null) { render(); return; }
        // M_Ed er SIGNERT (endringsrunde 4 §1.2/§1.4): sagging er NEGATIV,
        // structuralcodes sin egen konvensjon. INGEN `Math.abs` og INGEN
        // `{min: 0}` her lenger — den kombinasjonen ville stille avvist ethvert
        // feltmoment (negativt tall), og hele den signerte momentfunksjonen
        // ville vært dødfødt uten en eneste feilmelding.
        store.updateCombo(el.dataset.c, { M_Ed: value });
        el.value = fmtNumber(value, 2);
        comboEditInFlight = true;
        invalidate();
        render();
        comboEditInFlight = false;
      });
    });
    host.querySelectorAll('input[data-cf="V_Ed"]').forEach((el) => {
      bindNumericInput(el, (value) => {
        if (value === null) { render(); return; }
        // V_Ed er en STØRRELSE (§4.1c): `payload.js` tar `Math.abs` uansett
        // fortegn, så feltet legger IKKE `min: 0` på — det ville gitt nøyaktig
        // den samme stille avvisningen som M_Ed-bugen dette runden retter.
        store.updateCombo(el.dataset.c, { V_Ed: value });
        el.value = fmtNumber(value, 2);
        comboEditInFlight = true;
        invalidate();
        render();
        comboEditInFlight = false;
      });
    });
  }

  function setupCombos() {
    const add = $('#add-combo');
    if (add) {
      add.onclick = () => {
        const combo = store.addCombo();
        // Den nye raden blir aktiv med det samme: brukeren la den til for å
        // gjøre noe med den, ikke for å se den ligge urørt bak den forrige.
        store.setActiveCombo(combo.id);
        invalidate();
        render();
      };
    }
  }

  /* ---------------------------------------------------------------- *
   * Lagre / laste (bestillingens punkt 6, endringsrunde 2 §5)
   * ---------------------------------------------------------------- */

  /** `<doc.title>.csc.json`, rensket til trygge tegn; `section` uten tittel. */
  function docFileName(state) {
    const raw = (state.doc && state.doc.title) || 'section';
    const safe = String(raw).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    return `${safe}.csc.json`;
  }

  function saveJson() {
    const state = store.getState();
    const doc = toDocument(state);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docFileName(state);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Notene fra `fromDocument` vises som andre advarsler (§5.2) — samme
   *  `describeWarning`/`CODE_MESSAGES`-vei som resultatets `warnings`. */
  function renderDocNotes(notes) {
    const host = $('#doc-load-notes');
    if (!host) return;
    if (!notes || !notes.length) { host.innerHTML = ''; return; }
    const described = describeWarnings(notes.map((n) => ({
      code: n.code,
      severity: n.severity,
      detail: n.field ? `field: ${n.field}` : '',
    })));
    host.innerHTML = described.map((w) => `<div class="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
      w.severity === 'error' ? 'border-rose-600/50 bg-rose-950/30 text-rose-200' : 'border-sky-600/50 bg-sky-950/20 text-sky-200'
    }"><span>${w.severity === 'error' ? '✕' : 'ℹ'}</span><span><b>${esc(w.severityLabel)}:</b> ${esc(w.message)}${
      w.hasDetail ? ` <span class="opacity-70">(${esc(w.detail)})</span>` : ''}</span></div>`).join('');
  }

  async function loadJsonFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      // `fromDocument` kaster aldri, men en fil som ikke engang er gyldig
      // JSON kommer ikke dit — samme kode, samme visning.
      renderDocNotes([{ code: 'document_not_recognised', severity: 'error' }]);
      return;
    }
    const { state, notes } = fromDocument(parsed);
    if (state) store.replaceState(state);
    renderDocNotes(notes);
    render();
  }

  function setupDocIO() {
    const save = $('#doc-save-json');
    if (save) save.onclick = saveJson;
    const load = $('#doc-load-json');
    const input = $('#doc-load-input');
    if (load && input) {
      load.onclick = () => input.click();
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        loadJsonFile(file).finally(() => { input.value = ''; });
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Motorstatus (plan §3.9)
   * ---------------------------------------------------------------- */

  function renderEngine() {
    const st = client.getStatus();
    const pill = $('#engine-pill');
    const card = $('#engine-card');
    const barEng = $('#bar-engine');

    const dot = {
      idle: 'bg-slate-500', loading: 'bg-amber-400 animate-pulse',
      solving: 'bg-sky-400 animate-pulse', ready: 'bg-emerald-400', failed: 'bg-rose-500',
    }[st.state] || 'bg-slate-500';

    const short = st.state === 'ready' ? 'Engine ready'
      : st.state === 'failed' ? 'Engine failed'
      : st.state === 'idle' ? 'Engine not started'
      : st.state === 'solving' ? `${phaseLabel(st.phase)} …`
      : `${phaseLabel(st.phase)} · ≈ ${mb(st.bytes)} / ${mb(TOTAL_DOWNLOAD_BYTES)} MB`;

    if (pill) {
      pill.innerHTML = `<span class="w-2 h-2 rounded-full ${dot}"></span><span class="text-slate-300 num">${esc(short)}</span>`;
    }
    if (barEng) {
      barEng.innerHTML = st.state === 'ready'
        ? `<span class="text-emerald-400">● ready</span> · ${esc(st.ready?.runtime || '')}`
        : `<span class="num">${esc(short)}</span>`;
    }
    if (!card) return;

    if (st.state === 'failed') {
      // §3.9 krav 3: en feilet oppvarming skal ALDRI låse sida. Skjemaet og
      // tegningen virker; bare tallene mangler, og knappen er klikkbar.
      card.innerHTML = `<div class="flex items-start gap-3">
        <span class="text-rose-400 text-lg leading-none mt-0.5">⚠</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-rose-300">${esc(messageForCode(st.error?.code, ''))}</p>
          ${st.error?.detail ? `<details class="mt-1"><summary class="text-[11px] text-slate-500">Technical detail</summary>
             <pre class="text-[10px] text-slate-500 whitespace-pre-wrap mt-1">${esc(st.error.detail)}</pre></details>` : ''}
          <p class="text-[11px] text-slate-500 mt-1">The form still works, and the section drawing is plain JS. Only the numbers are missing.</p>
        </div>
        <button type="button" id="engine-retry" class="shrink-0 px-3 py-1.5 text-xs rounded bg-rose-800 hover:bg-rose-700 border border-rose-600">Retry</button>
      </div>`;
      const retry = $('#engine-retry');
      if (retry) retry.onclick = () => onRetryWarmup();
      return;
    }

    const pct = st.state === 'ready' ? 100 : Math.max(0, Math.min(100, Math.round(st.pct)));
    const bar = st.state === 'ready' ? 'bg-emerald-500' : st.state === 'solving' ? 'bg-sky-500' : 'bg-amber-500';
    const counter = st.done !== null && st.total
      ? ` · point ${fmtNumber(st.done, 0)} of ${fmtNumber(st.total, 0)}`
      : '';
    card.innerHTML = `
      <div class="flex items-baseline gap-2 text-[12px]">
        <span class="text-slate-300">${esc(st.state === 'ready' ? `Engine ready · structuralcodes ${st.ready?.structuralcodes_version || ''}` : short + counter)}</span>
        <span class="ml-auto num text-slate-500">${pct} %</span>
      </div>
      <div class="h-1.5 mt-2 rounded-full bg-slate-700 overflow-hidden">
        <div class="h-full ${bar} transition-[width] duration-150" style="width:${pct}%"></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-2 leading-snug">${
        st.state === 'ready'
          ? 'The engine finished loading while you filled in the form. The next calculation starts immediately.'
          : st.state === 'idle'
          ? 'The engine has not been downloaded yet — the browser is set to save data. It loads when you press "Calculate".'
          : 'The engine is loading in the background while you fill in the form. You can press "Calculate" now — it runs as soon as the engine is ready.'
      }</p>`;
  }

  /* ---------------------------------------------------------------- *
   * Validering
   * ---------------------------------------------------------------- */

  function renderValidation() {
    const host = $('#validation');
    if (!host) return;
    const issues = validate(store.getState());
    if (!issues.length) { host.innerHTML = ''; return; }
    host.innerHTML = issues.map((i) => {
      const isError = i.severity === 'error';
      // `validate()` (section.js) svarer på norsk og er ikke B3-eid denne
      // runden — men den vises ALDRI rått. `messageForCode` slår opp den
      // engelske teksten for nøyaktig disse kodene (§1.3); `i.message` er
      // bare reserven for en kode ingen har oversatt ennå.
      return `<div class="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
        isError ? 'border-rose-600/50 bg-rose-950/30 text-rose-200' : 'border-amber-600/50 bg-amber-950/30 text-amber-200'
      }"><span>${isError ? '✕' : '⚠'}</span><span>${esc(messageForCode(i.code, i.message))}</span></div>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- *
   * Resultat
   * ---------------------------------------------------------------- */

  function renderResult() {
    const body = $('#res-body');
    const summary = $('#res-summary');
    if (!body) return;
    const s = store.getState();
    const result = s.result;

    if (!result) {
      if (summary) summary.textContent = '';
      body.innerHTML = `<div class="rounded-lg border border-dashed border-slate-700 px-5 py-10 text-center">
        <p class="text-slate-400 text-sm">No calculation run yet.</p>
        <p class="text-slate-600 text-xs mt-1">Press <kbd>Ctrl</kbd> <kbd>Space</kbd> — or "Calculate" in the bottom bar.</p></div>`;
      return;
    }

    if (result.ok !== true) {
      // `{ok: false}` er et SVAR, ikke en krasj (plan §3.3). Det skal vises som
      // et resultat med tallene motoren faktisk klarte å oppgi.
      const code = result.error?.code || 'engine_error';
      if (summary) summary.textContent = 'No capacity found';
      body.innerHTML = `<div class="rounded-xl border border-rose-600/50 bg-rose-950/20 p-4 space-y-2">
        <div class="text-rose-200 font-medium">${esc(messageForCode(code, ''))}</div>
        ${result.error?.detail ? `<details><summary class="text-[11px] text-slate-400">Technical detail</summary>
           <pre class="text-[10px] text-slate-500 whitespace-pre-wrap mt-1">${esc(result.error.detail)}</pre></details>` : ''}
        <p class="text-[12px] text-slate-400">This is the engine's answer to the input, not a bug in the program.</p>
      </div>`;
      return;
    }

    const block = analysisBlock(result) || {};
    const eta = headlineUtilisation(result);
    const status = utilisationStatus(eta);
    const mRd = momentCapacity(result);
    const props = result.section_props || {};
    const mats = result.materials || {};
    const bending = result.bending || block;
    const perMeter = s.sectionType === 'slab' ? '/m' : '';
    const gov = governingLabel(result);

    const etaV = shearHeadlineUtilisation(result);

    if (summary) {
      summary.innerHTML = `M<sub>Rd</sub> ${fmtMomentKNm(mRd)} kNm${perMeter} · η ${fmtRatio(eta, 2)}` +
        // η_V står med EGEN merkelapp også her. Uten den ville to tall stått
        // ved siden av hverandre uten å si hvilket spørsmål de svarer på.
        (shearGoverningCombo(result) ? ` · η<sub>V</sub> ${fmtRatio(etaV, 2)}` : '') +
        (gov ? ` · governing ${esc(gov)}` : '');
    }

    const chart = renderChart(result, s);
    const warnings = describeWarnings(result.warnings);

    body.innerHTML = `
      <div class="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div class="space-y-4">
          <div class="rounded-xl border p-4 ${esc(status.classes)}">
            <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div class="text-[11px] uppercase tracking-wide opacity-80">Utilisation <span class="normal-case">η</span></div>
                <div class="text-4xl font-bold num">${fmtRatio(eta, 2)}</div>
                <div class="text-[11px] opacity-70 num">${esc(HEADLINE_UTILISATION_LABEL)}${gov ? ` · governing ${esc(gov)}` : ''}</div>
              </div>
              <div class="text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">M<sub>Rd</sub></div>
                <div class="text-2xl font-semibold num">${fmtMomentKNm(mRd)} <span class="text-sm text-slate-400">kNm${perMeter}</span></div>
                <div class="text-[11px] text-slate-400 num">M<sub>Ed</sub> = ${fmtMomentKNm(designMoment(result))} kNm${perMeter}</div>
              </div>
              <div class="text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">Failure mode</div>
                <div class="text-lg font-medium text-sky-300">${esc(failureModeLabel(bending.failure_mode))}</div>
                <div class="text-[11px] text-slate-400 num">x/d = ${fmtRatio(bending.x_over_d)}</div>
              </div>
              ${shearBadge(result)}
              <div class="ml-auto text-right text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">Status</div>
                <div class="text-lg">${esc(status.label)}</div>
              </div>
            </div>
            <p class="text-[11px] mt-2 opacity-70">${esc(failureModeNote(bending.failure_mode))}</p>
          </div>

          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-1">Section with neutral axis and compression zone</div>
            <div class="svg-fit" id="draw-result"></div>
            <p class="text-[11px] text-slate-500 mt-1 num">
              ε(z) = ε<sub>a</sub> + χ<sub>y</sub>·z · compression at ${esc(compressionEdgeLabel(result.meta?.theta))} · compression negative
            </p>
          </div>

          ${chart}

          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-2">Strain and stress per reinforcement layer</div>
            ${layerTable(bending, mats)}
          </div>

          ${warnings.length ? `<div class="space-y-2">${warnings.map((w) => `
            <div class="rounded-lg border px-3 py-2 text-[12px] ${w.severity === 'error'
              ? 'border-rose-600/50 bg-rose-950/30 text-rose-200'
              : 'border-amber-600/50 bg-amber-950/30 text-amber-200'}">
              <b>${esc(w.severityLabel)}:</b> ${esc(w.message)}
              ${w.hasDetail ? `<details class="mt-1"><summary class="text-[11px] opacity-70">Technical detail</summary>
                <pre class="text-[10px] whitespace-pre-wrap mt-1 opacity-80">${esc(w.detail)}</pre></details>` : ''}
            </div>`).join('')}</div>` : ''}
        </div>

        <div class="space-y-3 text-[12px]">
          ${panel('Failure state', [
            ['Neutral axis x', fmtLength(bending.x), 'mm'],
            ['x / d', fmtRatio(bending.x_over_d), ''],
            ['ε<sub>c</sub> at compression face', fmtStrainPermille(bending.eps_c_top), '‰'],
            ['ε<sub>s,max</sub>', fmtStrainPermille(bending.eps_s_max), '‰'],
            ['ε<sub>a</sub> (at the origin)', fmtStrainPermille(bending.eps_a, 3), '‰'],
            ['χ<sub>y</sub>', fmtCurvature(bending.chi_y), '10⁻⁶/mm'],
          ])}
          ${panel('Section (from the engine)', [
            ['A<sub>g</sub>', fmtArea(props.Ag), 'mm²'],
            ['ΣA<sub>s</sub>', fmtArea(props.As_total, 1), `mm²${perMeter}`],
            ['A<sub>s</sub> in tension', fmtArea(props.As_tension, 1), `mm²${perMeter}`],
            ['d (EC2, tension reinforcement)', fmtLength(props.d_eff), 'mm'],
            ['d (weighted over all layers)', fmtLength(props.d_eff_all), 'mm'],
            ['ρ = A<sub>s</sub>/(b<sub>t</sub>·d)', fmtPercent(props.rho, 3), '%'],
            ['A<sub>s,min</sub>', fmtArea(props.As_min, 1), 'mm²'],
            ['A<sub>s,max</sub>', fmtArea(props.As_max), 'mm²'],
            ['N<sub>min</sub> … N<sub>max</sub>', `${fmtNumber(toNum(props.n_min) / 1e3, 0)} … ${fmtNumber(toNum(props.n_max) / 1e3, 0)}`, 'kN'],
          ])}
          ${shearPanel(result)}
          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-1.5">Checks</div>
            ${checkRows(result.checks).map((r) => `<div class="flex items-start gap-2 py-1">
              <span class="${r.ok === true ? 'text-emerald-400' : r.ok === false ? 'text-rose-400' : 'text-slate-500'} mt-px">${r.ok === true ? '✓' : r.ok === false ? '✕' : '–'}</span>
              <span class="text-slate-200">${esc(r.label)}</span>
              <span class="text-slate-500 ml-auto num">${esc(r.text)}</span></div>`).join('')}
          </div>
          <details class="rounded-lg border border-slate-700 bg-slate-900/50">
            <summary class="px-3 py-2 text-xs text-slate-400 hover:text-slate-200">Material values ▸</summary>
            <div class="px-3 pb-3">${rows([
              ['f<sub>cd</sub>', fmtStress(mats.fcd), 'MPa'],
              ['f<sub>ctm</sub>', fmtStress(mats.fctm, 2), 'MPa'],
              ['E<sub>cm</sub>', fmtStress(mats.Ecm, 0), 'MPa'],
              [`ε<sub>${esc(String(mats.eps_c_name || '').replace('eps_', ''))}</sub>`, fmtStrainPermille(mats.eps_c), '‰'],
              [`ε<sub>${esc(String(mats.eps_cu_name || '').replace('eps_', ''))}</sub>`, fmtStrainPermille(mats.eps_cu), '‰'],
              ['f<sub>yd</sub>', fmtStress(mats.fyd), 'MPa'],
              ['f<sub>td</sub>', fmtStress(mats.ftd), 'MPa'],
              ['ε<sub>yd</sub>', fmtStrainPermille(mats.eps_yd, 3), '‰'],
              ['ε<sub>ud</sub>', fmtStrainPermille(mats.eps_ud, 1), '‰'],
              ['Concrete law', esc(lawLabel(mats.law_concrete)), ''],
              ['Steel law', esc(lawLabel(mats.law_steel)), ''],
            ])}</div>
          </details>
          <p class="text-[11px] text-slate-600 num leading-relaxed">
            ${esc(analysisLabel(result.analysis))} · ${esc(directionLabel(result.meta?.direction))}<br>
            structuralcodes ${esc(result.meta?.structuralcodes_version || '')} · ${esc(result.meta?.runtime || '')} ·
            integrator ${esc(result.meta?.integrator || '')} · scipy: ${esc(result.meta?.scipy || '')} ·
            ${fmtNumber(result.meta?.wall_time_ms, 0)} ms
          </p>
        </div>
      </div>`;

    const drawHost = $('#draw-result');
    if (drawHost) {
      const x = toNum(bending.x);
      drawHost.innerHTML = drawSection(s, {
        width: 460, unit: 'px', theme: 'dark', showDims: true, showLabels: true,
        // `s.direction` finnes ikke lenger (§7) — reserven er den AKTIVE
        // kombinasjonens egen θ, samme kilde som resten av skjemaet bruker
        // før et resultat foreligger.
        overlay: x === null ? null : { x, theta: toNum(result.meta?.theta) ?? activeComboTheta(s) },
      });
    }
  }

  function layerTable(bending, mats) {
    const layers = Array.isArray(bending.layers) ? bending.layers : [];
    if (!layers.length) return `<p class="text-[12px] text-slate-500">${DASH}</p>`;
    const fyd = toNum(mats.fyd);
    return `<table class="w-full text-[12px] num">
      <thead><tr class="text-slate-400 text-left border-b border-slate-700">
        <th class="py-1 font-medium">Layer</th><th class="font-medium">z</th><th class="font-medium">ε</th>
        <th class="font-medium">σ<sub>s</sub></th><th class="font-medium">σ/f<sub>yd</sub></th>
        <th class="font-medium">State</th></tr></thead>
      <tbody>${layers.map((l) => {
        const sigma = toNum(l.sigma);
        const ratio = sigma !== null && fyd ? sigma / fyd : null;
        return `<tr class="border-b border-slate-800">
          <td class="py-1 text-amber-300">${esc(l.id)}</td>
          <td>${fmtLength(l.z, 0)} mm</td>
          <td>${fmtStrainPermille(l.eps)} ‰</td>
          <td>${fmtStress(l.sigma)} MPa</td>
          <td>${fmtRatio(ratio)}</td>
          <td class="${l.compression ? 'text-sky-300' : 'text-amber-200'}">${l.compression ? 'compression' : 'tension'}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  /**
   * Figurene under resultatkortet.
   *
   * PÅ HVILKEN BLOKK SOM FINNES, IKKE PÅ `result.analysis`. «Kjør alle» (§D)
   * leverer ett resultat med FLERE analyseblokker, og da skal begge figurene
   * trykkes — akkurat som rapporten gjør. For de tre enkeltanalysene er dette
   * nøyaktig samme oppførsel som før: `bending` har ingen av blokkene, og de
   * to andre har bare sin egen.
   */
  function renderChart(result, s) {
    return [mcChart(result, s), nmChart(result, s)].filter(Boolean).join('');
  }

  function mcChart(result, s) {
    const perMeter = s.sectionType === 'slab' ? '/m' : '';
    if (result.moment_curvature) {
      const mc = result.moment_curvature || {};
      // Motoren regner moment–krumning for ÉN kombinasjon (§4.3, `meta.mc_active_combo`)
      // — kortet sier det med navn, slik at det aldri kan leses som «for alle».
      const comboId = result.meta?.mc_active_combo;
      const combo = comboId ? s.combos.find((c) => c.id === comboId) : null;
      // Lokalt navn, IKKE `comboLabel` — det er importert fra `results.js` og
      // ville blitt skygget bare inne i denne funksjonen.
      const mcCombo = combo ? `${combo.name || combo.id} (${combo.id})` : comboId || DASH;
      const nEdKN = toNum(mc.N_Ed) / 1e3;
      // Moment–krumning er UNNTATT fra auto-N–M-regelen (§2): M(κ) ved fast N er
      // én entydig kurve, ikke ett punkt plukket fra en flate. Men kortet
      // rapporterer likevel M_Rd/utnyttelse ved DENNE ene aksialkraften, så det
      // skal merkes når den er ≠ 0 — ellers leser man M_Rd som om den gjaldt
      // hele tverrsnittets kapasitet, ikke ett snitt av N–M-flaten.
      const axialNote = nEdKN !== 0
        ? `<p class="text-[11px] text-amber-300 mt-1 num">M<sub>Rd</sub> at N<sub>Ed</sub> = ${fmtNumber(nEdKN, 1)} kN — see the interaction domain for the full picture.</p>`
        : '';
      return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <div class="text-xs text-slate-400 mb-1">Moment–curvature for ${esc(mcCombo)} — the active combination only — at N<sub>Ed</sub> = ${fmtNumber(nEdKN, 1)} kN</div>
        ${axialNote}
        <div class="svg-fit">${momentCurvatureSvg(mc, { width: 620, unit: 'px', theme: 'dark' })}</div>
        <p class="text-[11px] text-slate-500 mt-1 num">
          ${fmtNumber((mc.kappa || []).length, 0)} points${mc.truncated ? ' — the curve is TRUNCATED' : ''}.
          ${mc.yield_index === null || mc.yield_index === undefined ? 'The yield point is not identified.' : `Yields at point ${fmtNumber(mc.yield_index + 1, 0)}.`}
          The final point should equal M<sub>Rd</sub> = ${fmtMomentKNm(mc.M_Rd)} kNm${perMeter}.
        </p></div>`;
    }
    return '';
  }

  function nmChart(result) {
    if (result.nm_domain) {
      const dom = result.nm_domain || {};
      const rad = radialUtilisation(dom, toNum(dom.N_Ed) / 1e3, toNum(dom.M_Ed) / 1e6);
      return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <div class="text-xs text-slate-400 mb-1">M–N envelope with every load combination plotted, governing marked</div>
        <div class="svg-fit">${nmDomainSvg(dom, { width: 620, unit: 'px', theme: 'dark' })}</div>
        <p class="text-[11px] text-slate-500 mt-1 num">
          η is the VERTICAL utilisation M<sub>Ed</sub>/M<sub>Rd</sub>(N<sub>Ed</sub>) — the same figure in all three analyses.
          ${esc(RADIAL_UTILISATION_LABEL)} = ${fmtRatio(rad.eta, 2)}.
        </p></div>`;
    }
    return '';
  }

  /* ---------------------------------------------------------------- *
   * Bunnlinje med inspeksjonsstripe
   * ---------------------------------------------------------------- */

  /**
   * Inspeksjonsstripa (hentet fra mockup B).
   *
   * Uten den måtte man rulle ned til resultatseksjonen for å se hva en endring
   * gjorde — arbeidsarkets eneste alvorlige svakhet. η, M_Rd, x, x/d og
   * bruddform står derfor fast i bunnlinja ved siden av ΣA_s og d.
   *
   * ΣA_s og d hentes fra `result.section_props` etter en kjøring, og fra
   * `derived()` før den — men da MERKET som estimat, slik at ingen kan tro at
   * den geometriske `d` er EC2-`d` (plan §5.2).
   */
  function renderBottomBar() {
    const s = store.getState();
    const result = s.result && s.result.ok === true ? s.result : null;
    const est = derived(s);
    const perMeter = s.sectionType === 'slab' ? '/m' : '';

    const thumb = $('#bar-thumb');
    if (thumb) {
      thumb.innerHTML = drawSection(s, {
        width: 44, unit: 'px', theme: 'dark', showDims: false, showLabels: false,
      });
    }

    const geo = $('#bar-geo');
    if (geo) {
      // `s.direction` finnes ikke lenger (§7) — retningen som vises her er den
      // AKTIVE kombinasjonens egen, avledet fra dens `M_Ed`-fortegn.
      const dir = directionFromTheta(activeComboTheta(s)) || 'sagging';
      geo.innerHTML = `${esc(sectionTypeLabel(s.sectionType))} ${fmtNumber(sectionWidth(s), 0)}×${fmtNumber(s.geometry.h, 0)} · ` +
        `C${fmtNumber(s.concrete.fck, 0)} · ${esc(dir)}`;
    }

    const arm = $('#bar-arm');
    if (arm) {
      const As = result ? toNum(result.section_props?.As_total) : totalArea(s.layers);
      const d = result ? toNum(result.section_props?.d_eff) : est.d_eff;
      arm.innerHTML = `ΣA<sub>s</sub> ${fmtArea(As)} mm²${perMeter} · d ${fmtLength(d, 0)} mm` +
        (result ? '' : ' <span class="text-slate-600">(estimate)</span>');
    }

    const strip = $('#bar-inspect');
    if (strip) {
      if (!result) {
        // Uten et gyldig resultat står stripa TOM, ikke med gamle tall. Alt
        // som kunne gjort tallene ugyldige har alt kastet dem (`invalidate()`).
        strip.innerHTML = `<div class="leading-tight"><div class="text-[9px] text-slate-500">η</div>` +
          `<div class="text-xl font-bold num text-slate-700">${DASH}</div></div>`;
      } else {
        const eta = headlineUtilisation(result);
        const status = utilisationStatus(eta);
        const bending = result.bending || analysisBlock(result) || {};
        const cell = (label, value) =>
          `<div class="leading-tight"><div class="text-[9px] uppercase text-slate-500">${label}</div>` +
          `<div class="num text-slate-200">${value}</div></div>`;
        // Fargen og merkelappen kommer fra `results.js` sin `utilisationStatus`
        // — samme kilde som rapporten bruker (plan §7: tersklene står ETT sted).
        // η_V får sitt EGET merke ved siden av η, med sin egen farge. De to
        // slås aldri sammen: bøying og skjær kan ha helt ulik utnyttelse, og
        // ofte i helt ulike lastkombinasjoner. Merket står bare når noen
        // kombinasjon faktisk fikk skjær evaluert.
        const etaV = shearHeadlineUtilisation(result);
        const shearStatus = utilisationStatus(etaV);
        const shearCell = shearGoverningCombo(result)
          ? `<div class="leading-tight px-2 py-0.5 rounded border ${esc(shearStatus.classes)}" title="${esc(SHEAR_UTILISATION_LABEL)} — ${esc(shearStatus.label)}">
               <div class="text-[9px] opacity-70">η_V</div>
               <div class="text-xl font-bold num">${fmtRatio(etaV, 2)}</div></div>`
          : '';
        strip.innerHTML =
          `<div class="leading-tight px-2 py-0.5 rounded border ${esc(status.classes)}" title="${esc(status.label)}">
             <div class="text-[9px] opacity-70">η</div>
             <div class="text-xl font-bold num">${fmtRatio(eta, 2)}</div></div>` +
          shearCell +
          cell('M_Rd', `${fmtMomentKNm(momentCapacity(result))} kNm${perMeter}`) +
          (shearGoverningCombo(result)
            ? cell('V_Rd', `${fmtForceKN(shearGoverningCombo(result).shear?.V_Rd)} kN${perMeter}`)
            : '') +
          cell('x', `${fmtLength(bending.x)} mm`) +
          cell('x/d', fmtRatio(bending.x_over_d)) +
          cell('Failure mode', esc(failureModeLabel(bending.failure_mode)));
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Knapper
   * ---------------------------------------------------------------- */

  function renderButtons() {
    const s = store.getState();
    const cancellable = busy && isCancellable(s.analysis);
    for (const sel of ['#btn-run', '#btn-run-bar']) {
      const el = $(sel);
      if (!el) continue;
      el.disabled = busy;
      el.classList.toggle('opacity-60', busy);
      el.classList.toggle('cursor-wait', busy);
    }
    for (const sel of ['#btn-cancel', '#btn-cancel-bar']) {
      const el = $(sel);
      if (!el) continue;
      // «Avbryt» er DEAKTIVERT for bøyekapasitet og M–N-diagram (plan §3.7):
      // de tar 30–140 ms, og eneste måten å angre dem på er å rive ned en
      // 10 MB runtime. En knapp som koster mer enn jobben den avbryter er
      // verre enn ingen knapp.
      el.style.display = busy ? '' : 'none';
      el.disabled = !cancellable;
      el.classList.toggle('opacity-40', !cancellable);
      el.title = !cancellable
        ? 'This analysis takes under a tenth of a second and cannot be cancelled.'
        // «Kjør alle» ER avbrytbar fordi den inneholder moment–krumning
        // (`CANCELLABLE_ANALYSES` i `solver-client.js`), men den stopper
        // mellom faser — «punktene» er bare det halve svaret der.
        : s.analysis === RUN_ALL
        ? 'Cancel the run. The phases that already finished are kept.'
        : 'Cancel the moment–curvature run. Points already calculated are kept.';
    }
    // «Beregn» sier hva den kjører (endringsrunde 2 §6).
    const runLabel = CALC_VERB[s.analysis] || 'Calculate';
    const lbl1 = $('#btn-run-label');
    if (lbl1) lbl1.textContent = runLabel;
    const lbl2 = $('#btn-run-bar-label');
    if (lbl2) lbl2.textContent = runLabel;
  }

  /* ---------------------------------------------------------------- *
   * Full opptegning
   * ---------------------------------------------------------------- */

  function render() {
    const s = store.getState();
    syncFields();

    renderSegment('#type-seg', s.sectionType, (v) => {
      if (v === s.sectionType) return;
      store.setSectionType(v);
      // Lagene er konvertert mellom `bars` og `spacing`; `dc_auto` følger
      // laget (§3.4) og er fortsatt gyldig. Resultatet gjelder derimot et
      // annet tverrsnitt.
      invalidate();
      editing = null;
      render();
    });
    // `#dir-seg` (det GLOBALE retningsvalget) er fjernet (§7, plan-tabellen
    // `js/ui.js:1317-1318`) — sammen med kombinasjonsradens eget segment
    // (§7, `693-694`) var det den ANDRE av de to kontrollene som måtte bort.
    // Retningen finnes nå BARE som fortegnet på hver kombinasjons `M_Ed`.

    renderChips('#fck-chips', CONCRETE_GRADES.map((g) => ({ value: String(g.fck), label: g.label })),
      String(s.concrete.fck), (v) => { store.patch('concrete', { fck: Number(v) }); invalidate(); render(); });
    renderChips('#fyk-chips', STEEL_GRADES.map((g) => ({ value: String(g.fyk) + '|' + g.k + '|' + g.epsuk, label: g.label })),
      `${s.steel.fyk}|${s.steel.k}|${s.steel.epsuk}`, (v) => {
        const [fyk, k, epsuk] = v.split('|').map(Number);
        store.patch('steel', { fyk, k, epsuk });
        invalidate(); render();
      });
    // Auto-N–M-regelen (§2): med aksialkraft er «Bending resistance» ETT punkt
    // plukket fra en flate, ikke et selvstendig svar. `allowedAnalyses` er den
    // ENE kilden til hvilke analyser som er lovlige — samme funksjon tast `1`
    // under sjekker, og som `serialize.js` normaliserer en lastet fil mot.
    // `RUN_ALL` er ALLTID lovlig: den kjører nettopp de analysene
    // `allowedAnalyses` slipper gjennom, så regelen kan ikke brytes av å velge
    // den. Unntaket står også i `store.js:enforceAnalysis` — begge to skal bort
    // den dagen `section.js:allowedAnalyses` kjenner verdien selv.
    const allowedAna = allowedAnalyses(s).concat(RUN_ALL);
    renderChips('#ana-chips', ANALYSES.map(([value, desc]) => ({
      value,
      label: value === RUN_ALL ? RUN_ALL_LABEL : analysisLabel(value),
      disabled: !allowedAna.includes(value),
      title: allowedAna.includes(value)
        ? desc
        : 'A resistance quoted at a single axial force is one point on a curve. ' + desc,
    })), s.analysis, (v) => { store.setState({ analysis: v }); invalidate(); render(); });
    const anaDesc = $('#ana-desc');
    if (anaDesc) anaDesc.textContent = (ANALYSES.find((a) => a[0] === s.analysis) || ['', ''])[1];
    const anaActive = $('#ana-active-combo');
    if (anaActive) {
      const active = s.combos.find((c) => c.id === s.activeCombo);
      const label = active ? `${active.name || active.id} (${active.id})` : s.activeCombo;
      // M–κ skal ALDRI kunne leses som «for alle kombinasjoner» (endringsrunde
      // 2 §6) — derfor navngis den aktive kombinasjonen her, ikke bare i
      // kombinasjonstabellen.
      anaActive.textContent = `Active combination: ${label} — used for moment–curvature. ` +
        'Bending resistance and the N–M domain run every combination and report the governing one.';
    }

    const mats = derivedMaterials(s);
    const matSum = $('#mat-summary');
    if (matSum) {
      const grade = CONCRETE_GRADES.find((g) => g.fck === Number(s.concrete.fck));
      matSum.innerHTML = `${esc(grade ? grade.label : `f<sub>ck</sub> ${fmtNumber(s.concrete.fck, 0)}`)} · ` +
        `B${fmtNumber(s.steel.fyk, 0)} · ${esc(lawLabel(s.concrete.law))}`;
    }
    const facSum = $('#fac-summary');
    if (facSum) {
      facSum.innerHTML = `Factors and stress–strain law — γ<sub>c</sub> ${fmtNumber(s.concrete.gamma_c, 2)} · ` +
        `α<sub>cc</sub> ${fmtNumber(s.concrete.alpha_cc, 2)} · γ<sub>s</sub> ${fmtNumber(s.steel.gamma_s, 2)} · ` +
        `k ${fmtNumber(s.steel.k, 2)} · ε<sub>uk</sub> ${fmtPercent(s.steel.epsuk, 1)} %`;
    }
    const matDer = $('#mat-derived');
    if (matDer) {
      const cell = (k, v, u) => `<div><span class="text-slate-500">${k}</span> <span class="text-slate-200">${v}</span> <span class="text-slate-600">${u}</span></div>`;
      matDer.innerHTML =
        cell('f<sub>cd</sub>', fmtStress(mats.fcd), 'MPa') +
        cell('f<sub>ctm</sub>', fmtStress(mats.fctm, 2), 'MPa') +
        cell('E<sub>cm</sub>', fmtStress(mats.Ecm, 0), 'MPa') +
        cell('f<sub>yd</sub>', fmtStress(mats.fyd), 'MPa') +
        cell('ε<sub>ud</sub>', fmtStrainPermille(mats.eps_ud, 1), '‰');
    }

    const geoSum = $('#geo-summary');
    if (geoSum) geoSum.innerHTML = `${fmtNumber(sectionWidth(s), 0)} × ${fmtNumber(s.geometry.h, 0)} mm`;

    // Tegningen er REN JS og skal stå ferdig lenge før motoren finnes (§3.9).
    // Den kalles derfor her, i den vanlige opptegningen, uten noen som helst
    // sjekk mot motorstatus.
    const drawGeo = $('#draw-geo');
    if (drawGeo) {
      drawGeo.innerHTML = drawSection(s, { width: 300, unit: 'px', theme: 'dark', showDims: true, showLabels: true });
    }

    renderLayers();
    renderStirrups();
    renderCombos();

    const shearSum = $('#shear-summary');
    if (shearSum) {
      // `list`, ikke `rows` — se `renderStirrups`.
      const list = s.shear?.stirrups || [];
      // `totalAswPerSpacing` fra `rebar.js` — SAMME funksjon `section.js` sin
      // minstekrav-kontroll og motoren summerer med. Regnes den om her, kan
      // skjemaet og feilmeldingen komme til å si to ulike ting.
      shearSum.innerHTML = list.length
        ? `${list.length} row${list.length === 1 ? '' : 's'} · ΣA<sub>sw</sub>/s ` +
          `${fmtNumber(totalAswPerSpacing(list), 3)} mm²/mm · θ ${fmtNumber(s.shear.strut_angle_deg, 1)}°`
        : 'No stirrups · V<sub>Rd</sub> = V<sub>Rd,c</sub>';
    }
    const shearHint = $('#shear-hint');
    if (shearHint) {
      shearHint.innerHTML = (s.shear?.stirrups || []).length
        ? 'The legs are drawn in the section, bent around the bars they meet.'
        : '';
    }

    const est = derived(s);
    const perMeter = s.sectionType === 'slab' ? '/m' : '';
    const armSum = $('#arm-summary');
    if (armSum) {
      armSum.innerHTML = `${s.layers.length} layers · ΣA<sub>s</sub> ${fmtArea(est.As_total)} mm²${perMeter}`;
    }
    const armTot = $('#arm-total');
    if (armTot) {
      armTot.innerHTML = `ΣA<sub>s</sub> ${fmtArea(est.As_total)} mm²${perMeter} · ` +
        `d ≈ ${fmtLength(est.d_eff, 0)} mm · ρ ≈ ${fmtPercent(est.rho, 3)} % ` +
        `<span class="text-slate-600">(estimate until the engine has run)</span>`;
    }
    const armWarn = $('#arm-warn');
    if (armWarn) {
      armWarn.innerHTML = est.As_total < est.As_min
        ? `⚠ below A<sub>s,min</sub> ≈ ${fmtArea(est.As_min)} mm²`
        : '';
    }

    const shInput = $('#sh-input');
    if (shInput) shInput.placeholder = s.sectionType === 'slab' ? 'Ø12 c113 b 31' : '3Ø20 b 50';
    const shHint = $('#sh-hint');
    if (shHint) {
      // `stackedDc`, ikke `suggestedDc`: hjelpeteksten skal vise hva EC2 8.2
      // faktisk gir NESTE lag på kanten (§2.2), ikke bare tallet for et lag
      // uten nabo.
      shHint.innerHTML = s.sectionType === 'slab'
        ? `<span class="font-mono text-slate-400">Ø12 c113 b 31</span> · <span class="font-mono text-slate-400">Ø10/150 t</span> · ` +
          `d<sub>c</sub> omitted = ${fmtNumber(stackedDc(s, 'bottom', 12), 1)} mm (next in the EC2 8.2 stack) 🔒`
        : `<span class="font-mono text-slate-400">3Ø20 b 50</span> · <span class="font-mono text-slate-400">2x25 t</span> · ` +
          `d<sub>c</sub> omitted = ${fmtNumber(stackedDc(s, 'bottom', 20), 1)} mm (next in the EC2 8.2 stack) 🔒`;
    }

    const loadSum = $('#load-summary');
    if (loadSum) {
      const active = s.combos.find((c) => c.id === s.activeCombo);
      const n = s.combos.length;
      // `s.direction` finnes ikke lenger (§7) — vises her er den AKTIVE
      // kombinasjonens EGEN retning, avledet fra dens `M_Ed`-fortegn.
      const dir = directionFromTheta(activeComboTheta(s));
      loadSum.innerHTML = `${n} combination${n === 1 ? '' : 's'} · active ` +
        `${esc(active ? (active.name || active.id) : s.activeCombo)} · ${esc(directionLabel(dir))}`;
    }

    renderValidation();
    renderResult();
    renderBottomBar();
    renderButtons();
    renderEngine();
  }

  /* ---------------------------------------------------------------- *
   * Tastatur
   * ---------------------------------------------------------------- */

  const inField = () => {
    const a = document.activeElement;
    return Boolean(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };

  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onCalculate(); return; }
      // Ctrl+mellomrom (bestillingens punkt 5, plan §6): Ctrl+Enter er ALIAS,
      // ikke erstattet — begge må ligge HER, FØR `inField()`-sjekken under,
      // ellers virker de ikke fra et tekstfelt, som er nettopp der «Beregn»
      // trengs mest (man har akkurat skrevet inn et tall).
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); onCalculate(); return; }
      if (e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicateLast(); return; }
      if (e.key === 'Escape') { const h = $('#help'); if (h) h.classList.add('hidden'); }
      if (inField() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        const f = $('#sh-input');
        if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
      } else if (k === 'b') { store.setSectionType('beam'); invalidate(); render(); }
      else if (k === 'p') { store.setSectionType('slab'); invalidate(); render(); }
      // `f`/`s` (retning) er fjernet (§6, §7) — retningen finnes ikke lenger
      // som et eget felt å snarveie til, bare som fortegnet på M_Ed.
      // `4` er «kjør alle» — samme rekkefølge som chippene, som er `ANALYSES`
      // sin egen. Tallene leses av lista, ikke skrevet av: en femte analyse
      // skal ikke kunne havne i chipraden uten å få tasten sin.
      else if (Number(k) >= 1 && Number(k) <= ANALYSES.length) {
        const value = ANALYSES[Number(k) - 1][0];
        // Samme dør som chippen (§2): tast `1` skal IKKE kunne sette
        // `analysis: 'bending'` når en kombinasjon har aksialkraft. Uten denne
        // sjekken var snarveien den ANDRE veien inn regelen ellers glemte å
        // stenge.
        if (allowedAnalyses(store.getState()).concat(RUN_ALL).includes(value)) {
          store.setState({ analysis: value }); invalidate(); render();
        }
      }
      else if (k === '?' || (e.shiftKey && k === '/')) { const h = $('#help'); if (h) h.classList.toggle('hidden'); }
    });
  }

  /* ---------------------------------------------------------------- *
   * Oppstart
   * ---------------------------------------------------------------- */

  function setupButtons() {
    for (const sel of ['#btn-run', '#btn-run-bar']) {
      const el = $(sel);
      if (el) el.onclick = () => onCalculate();
    }
    for (const sel of ['#btn-cancel', '#btn-cancel-bar']) {
      const el = $(sel);
      if (el) el.onclick = () => onCancel();
    }
    const report = $('#btn-report');
    if (report) report.onclick = () => onReport();
    const help = $('#btn-help');
    if (help) help.onclick = () => $('#help')?.classList.toggle('hidden');
    const helpClose = $('#help-close');
    if (helpClose) helpClose.onclick = () => $('#help')?.classList.add('hidden');
    const helpBg = $('#help');
    if (helpBg) helpBg.onclick = (e) => { if (e.target === helpBg) helpBg.classList.add('hidden'); };
  }

  function setupNav() {
    if (!('IntersectionObserver' in window)) return;
    const ids = ['s-mat', 's-geo', 's-arm', 's-last', 's-ana', 's-calc', 's-res'];
    for (const id of ids) {
      const node = document.getElementById(id);
      if (!node) continue;
      const obs = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          $$('.navlink').forEach((a) => { a.dataset.on = String(a.getAttribute('href') === `#${id}`); });
        }
      }, { rootMargin: '-110px 0px -55% 0px', threshold: 0 });
      obs.observe(node);
    }
  }

  return {
    /** Kobler opp alt som bindes én gang. */
    mount() {
      setupFields();
      setupShorthand();
      setupShear();
      setupCombos();
      setupDocIO();
      setupButtons();
      setupKeyboard();
      setupNav();
      // Pekerboblene henges på resultatseksjonen én gang. Figurene byttes ut
      // ved hver beregning, men lytteren sitter over dem og overlever det.
      attachChartTips(document.getElementById('s-res'));
      render();
    },
    render,
    renderEngine,
    /** Beregningen er i gang / ferdig — styrer «Beregn» og «Avbryt». */
    setBusy(value) {
      busy = Boolean(value);
      renderButtons();
    },
  };
}
