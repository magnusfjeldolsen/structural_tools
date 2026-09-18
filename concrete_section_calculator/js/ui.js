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
 * SAMME fysiske bøyle, og raden er eneste kilde (`rebar.js:stirrupCoverDia`) —
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

import { BAR_DIAMETERS, CONCRETE_GRADES, CONCRETE_LAWS, STEEL_GRADES, STEEL_LAWS, derivedMaterials,
  matchConcreteGrade, matchSteelGrade } from './materials.js';
import { bindNumericInput, evaluate } from './numeric-input.js';
import { aswPerSpacing, layerArea, layerBarCount, layerDepth, recomputeAutoDc, stackedDc,
  suggestedDc, totalArea, totalAswPerSpacing } from './rebar.js';
import { activeComboTheta, allowedAnalyses, axialForcesPresent, derived, sectionHeight, sectionWidth, thetaFor, validate }
  from './section.js';
import { drawSection } from './section-draw.js';
import { momentCurvatureSvg, nmDomainSvg, radialUtilisation } from './charts.js';
import { attachChartTips } from './chart-tips.js';
import { attachHints } from './hints.js';
import { isCancellable, phaseLabel, TOTAL_DOWNLOAD_BYTES } from './solver-client.js';
import { RUN_ALL, defaultState } from './store.js';
import { fromDocument, toDocument } from './serialize.js';
import {
  DASH, analysisBlock, analysisLabel, checkRows, comboLabel, compressionEdgeLabel, describeWarnings,
  designMoment, directionFromTheta, directionLabel, failureModeLabel, failureModeNote, failureState,
  fmtArea,
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

/**
 * Tegneflata til geometrifiguren i seksjon 2, i `drawSection`s egne enheter.
 *
 * Tallene er IKKE skjermpiksler. `.svg-fit > svg { width: 100% }` strekker
 * figuren til kolonnebredden uansett, så det eneste disse to gjør er å sette
 * SIDEFORHOLDET på viewBox-en — og dermed hvor mye av flata tverrsnittet får.
 *
 * HØYDEN MÅ SENDES. Uten den arver skjermen `DEFAULT_MAX_HEIGHT = 110`
 * rapport-mm fra `section-draw.js`, som er en A4-regel: den finnes for at en høy
 * bjelke ikke skal sprenge en utskrevet side. Målt band den bjelken til
 * `scale = min(0,795 ; 0,256)` — betongen ble 75 × 150 px og fylte 25,6 % av
 * figurbredden. Skjermen har ingen sidebrytning å ta hensyn til, og skal derfor
 * ikke betale for den.
 *
 * HVORFOR NØYAKTIG 300 × 300: en KVADRATISK tegneflate er den nøytrale
 * løsningen når den samme boksen må bære både et stående og et liggende snitt.
 * Bjelken 300×600 er 1:2 og plata 1000×200 er 5:1; ingen boks kan fylles av
 * begge, så valget står mellom å favorisere den ene eller ingen. Kvadratet
 * favoriserer ingen: det stående snittet fyller høyden, det liggende fyller
 * bredden. Regelen «figuren blir aldri høyere enn den er bred» er dessuten en
 * grense man kan lese, ikke et tall som er skrudd til på ett tverrsnitt.
 *
 * Marginene spiser av flata, så bjelken lander på 44 % av bredden og plata på
 * 77 % — plata er breddebundet og rører ikke høyden i det hele tatt.
 */
const GEO_DRAW_WIDTH = 300;
const GEO_DRAW_HEIGHT = 300;

/**
 * REGISTERET BAK SPØRSMÅLSTEGNENE (runde 8 §4).
 *
 * Nøkkelen står i markupen som `data-hint="…"`, verdien er teksten boblen
 * viser. `js/hints.js` kjenner ingen av dem — den slår bare opp.
 *
 * HVORFOR TEKSTEN BLE FLYTTET HIT OG IKKE SLETTET
 * Hver av disse sto som permanent brødtekst i et kapittel, og hver av dem er
 * ofte den eneste forklaringen av hvorfor et tall er som det er. Det som
 * forsvant er PLASSEN de tok, ikke opplysningen. Spørsmålstegnet er samtidig
 * et skritt videre enn de 17 `title`-attributtene runde 6 flyttet tekst til:
 * et `title` har ingen synlig affordans, så den som ikke alt vet at det finnes
 * noe å peke på, får aldri vite det.
 *
 * ÉN NØKKEL, ÉN TEKST, FLERE MERKER. Skal den samme forklaringen stå to
 * steder, peker BEGGE merkene på den samme nøkkelen. En tekst som er skrevet
 * av to ganger begynner å avvike fra seg selv ved første rettelse — og det er
 * nøyaktig den feilformen som hadde satt «samme fysiske bøyle»-setningen i to
 * litt ulike utgaver før denne runden.
 *
 * Teksten er brukervendt og derfor ENGELSK, som resten av grensesnittet.
 */
export const HINTS = {
  // Sto som `<p>` nederst i seksjon 4. Den handler om ALLE radene og kunne
  // derfor ikke bli en `title` på én av dem — men den leses én gang og huskes,
  // og trengte ikke stå framme etterpå.
  loads:
    'Every combination is checked; the one with the highest utilisation within '
    + '[N<sub>min</sub>, N<sub>max</sub>] governs the headline numbers and the drawing.',

  // Sto i `#ana-active-combo`, sammen med NAVNET på den aktive kombinasjonen.
  // Navnet er levende og blir stående; regelen bak det er statisk og flyttet
  // hit. Delingen er poenget: et tall som endrer seg skal være synlig, en
  // regel som aldri endrer seg trenger ikke være det.
  analysis:
    'Moment–curvature is a single curve and therefore runs for the active combination alone. '
    + 'Bending resistance and the N–M domain run every combination and report the governing one.',

  // TRE UTGAVER BLE ÉN. Den samme opplysningen sto som en linje under den
  // første bøyleraden, som `title` på bøyleradens Ø, og som `title` på
  // geometrifeltet — tre litt ulike setninger om ett faktum, altså nøyaktig
  // den feilformen som har bitt modulen hver runde. Teksten er skrevet om så
  // den leses riktig fra BEGGE ender: `stirrup-dia` har to merker, ett hvert
  // sted, og de peker på denne ene strengen.
  'stirrup-dia':
    'The stirrup diameter lives only here. It sets the shear capacity AND the cover the '
    + 'longitudinal bars sit inside, so changing it moves every layer whose d<sub>c</sub> is '
    + 'derived. With several rows the largest diameter governs the cover — the conservative '
    + 'reading, since the bar nearest the surface is the one that decides.',

  // De tre siste sto som `<p>` nederst i hver sin avdekkingsboks, altså bak et
  // klikk allerede — men de gjorde boksen lengre hver eneste gang den var åpen.
  'material-factors':
    'α<sub>cc</sub>, γ<sub>c</sub> and γ<sub>s</sub> cannot be 0: the calculation engine silently '
    + 'treats 0 as 1.0 / 1.5 / 1.15, and the result would then not match what the report prints.',

  'strut-angle':
    'The variable strut inclination method, EC2 6.2.3(2): cot θ between 1.0 and 2.5, that is θ '
    + 'between 45° and 21.8°. A flatter strut (θ → 21.8°) raises V<sub>Rd,s</sub> and lowers '
    + 'V<sub>Rd,max</sub>. The lever arm is taken as z = z<sub>factor</sub>·d with '
    + 'z<sub>factor</sub> = 0.9 as the usual approximation. Both apply to every stirrup row.',

  'bar-spacing':
    'Minimum clear distance between parallel bars or horizontal layers, EC2 8.2(2): the greatest '
    + 'of k<sub>1</sub>·Ø, (d<sub>g</sub> + k<sub>2</sub>) and 20 mm. Recommended k<sub>1</sub> = 1, '
    + 'k<sub>2</sub> = 5. Applies both to bar spacing within a layer and between stacked layers. '
    + 'The side cover is what the same check measures the bars in from each edge.',
};

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

/**
 * «Beregn»-knappen sier hva den kjører (endringsrunde 2 §6).
 *
 * TO LENGDER, ÉN OPPFØRING. Den lange teksten var skrevet for den brede
 * knappen i den gamle seksjon 6; i bunnlinja — som nå er den ENESTE knappen —
 * dyttet «Calculate N–M interaction domain» inspeksjonsstripa ut av linja.
 * `short` står i knappen og `long` i `title`, så det lange svaret fortsatt er
 * ett sekunds peking unna. De to ligger i SAMME oppføring med vilje: to
 * parallelle objekter er to lister som kan komme i utakt når en femte analyse
 * dukker opp.
 */
const CALC_VERB = {
  bending: { short: 'Calculate M_Rd', long: 'Calculate bending resistance' },
  moment_curvature: { short: 'Calculate M–κ', long: 'Calculate moment–curvature' },
  nm_domain: { short: 'Calculate N–M', long: 'Calculate N–M interaction domain' },
  [RUN_ALL]: { short: 'Run all', long: 'Run all analyses' },
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
 * `V_Rd` og `V_Ed` under skjærmerket i hovedresultatet.
 *
 * `η_V` alene sier hvor langt man er fra grensa, men ikke hva grensa ER — og
 * det er kapasiteten en ingeniør skriver ned. Tallet sto bare i skjærpanelet
 * lenger nede og i rapporten; nå står det der utnyttelsen står.
 *
 * `governing_mode` avgjør hvilket tall som ER `V_Rd`: `V_Rd,c` alene uten
 * bøyler, ellers `min(V_Rd,s ; V_Rd,max)`. `V_Rd,c` LEGGES ALDRI TIL `V_Rd,s`
 * (EC2 6.2.3(2)) — de tre tallene står ved siden av hverandre i panelet under,
 * og her vises bare det ene som gjelder.
 */
function vRdLine(combo) {
  const sh = combo && combo.shear;
  if (!sh || !sh.evaluated) return '';
  const vRd = toNum(sh.V_Rd);
  if (vRd === null) return '';
  return `<div class="text-[11px] opacity-70 num">V<sub>Rd</sub> ${fmtForceKN(vRd)} kN`
    + ` · V<sub>Ed</sub> ${fmtForceKN(toNum(sh.V_Ed))} kN</div>`;
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
    ${vRdLine(combo)}
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

/* ================================================================== *
 * Bunnlinjas inspeksjonsstripe
 * ================================================================== */

/**
 * De FEM cellene i inspeksjonsstripa — som rene data, uten DOM.
 *
 * HVORFOR EN EGEN, REN FUNKSJON
 * Stripa er det eneste stedet tallene står mens man fyller ut skjemaet, og
 * den kan derfor ikke verifiseres bare i nettleseren. Formen (alltid fem
 * celler, samme rekkefølge, aldri flere eller færre) er nettopp det som gjorde
 * at stripa hoppet, og det er en påstand en test kan holde fast.
 *
 * ALLTID FEM, OGSÅ UTEN RESULTAT. Formatererne i `results.js` gir «–» for
 * `null` av seg selv, så tom-tilstanden trenger ingen egen gren — den er den
 * samme koden med `null` inn. Det er dét som gjør at stripa ikke bytter antall
 * celler ved første beregning.
 *
 * `x` i mm og `V_Rd` er borte: `x/d` bærer samme informasjon i den formen en
 * ingeniør vurderer den (0,45 / 0,35), og `V_Rd` er implisert av η_V og står
 * fullt ut i skjærpanelet.
 *
 * BRUDDTILSTANDEN LESES GJENNOM `failureState`, IKKE `result.bending`.
 * Stripa slo før opp `result.bending || analysisBlock(result)` — motsatt
 * prioritet av `results.js:failureState`, som rapporten og resultatseksjonen
 * bruker. Med «Run all» finnes BEGGE blokkene, og `primary` kan være
 * `nm_domain`: bunnlinja viste da bruddformen fra bøyekallet mens papiret
 * viste den fra omhyllingen, for samme kjøring. To kilder til samme tall.
 *
 * @param {object|null} result  §5.2-resultatet, eller `null`/`{ok:false}`
 * @param {{perMeter?: string}} [opts]  `'/m'` for plate, ellers `''`
 * @returns {Array<{key:string,label:string,value:string,status:object|null,
 *                  title:string,hide:string}>}
 */
export function bottomBarCells(result, { perMeter = '' } = {}) {
  const ok = result && result.ok === true ? result : null;
  const fs = (ok && failureState(ok)) || {};
  // `shearGoverningCombo` er `null` når ingen kombinasjon fikk skjær evaluert.
  // Cella står likevel, med «–»: en celle som kommer og går er den samme
  // hoppingen som tom-tilstanden, bare sjeldnere og derfor vanskeligere å se.
  const etaV = ok ? shearHeadlineUtilisation(ok) : null;
  const eta = ok ? headlineUtilisation(ok) : null;
  const etaStatus = utilisationStatus(eta);
  const etaVStatus = utilisationStatus(etaV);
  const mode = failureModeLabel(fs.failure_mode);
  return [
    { key: 'eta', label: 'η', value: fmtRatio(eta, 2), status: etaStatus, hide: '',
      title: `${HEADLINE_UTILISATION_LABEL} — ${etaStatus.label}` },
    { key: 'eta_V', label: 'η_V', value: fmtRatio(etaV, 2), status: etaVStatus, hide: '',
      title: `${SHEAR_UTILISATION_LABEL} — ${etaVStatus.label}` },
    { key: 'M_Rd', label: 'M_Rd', value: `${fmtMomentKNm(momentCapacity(ok))} kNm${perMeter}`,
      status: null, hide: '',
      title: 'Design bending resistance of the governing load combination' },
    // x/d ryker under 1024 px, bruddformen under 1280 px. η og η_V ryker aldri.
    { key: 'x_over_d', label: 'x/d', value: fmtRatio(fs.x_over_d), status: null, hide: 'lg',
      title: 'Neutral axis depth over effective depth, x/d' },
    { key: 'failure_mode', label: 'Mode', value: mode, status: null, hide: 'xl',
      title: `Failure mode — ${mode}` },
  ];
}

/**
 * Cellene som HTML. Høydene ligger i `.bar-cell*` i `index.html` og ikke her,
 * fordi en høyde i en malstreng er en høyde ingen finner igjen når stripa
 * hopper neste gang.
 */
export function bottomBarStripHtml(result, opts) {
  return bottomBarCells(result, opts).map((c) => {
    // Statuscellene henter farge OG ramme fra `utilisationStatus().classes`.
    // De plain cellene har ingen ramme i det hele tatt — `.bar-cell` har
    // `box-sizing: border-box` og fast høyde, så de to typene blir like høye
    // uansett.
    const skin = c.status ? `border px-2 rounded ${esc(c.status.classes)}` : 'text-slate-200';
    const hide = c.hide ? ` bar-cell-${c.hide}` : '';
    return `<div class="bar-cell ${skin}${hide}" data-cell="${esc(c.key)}" title="${esc(c.title)}">` +
      `<div class="bar-cell-l">${esc(c.label)}</div>` +
      `<div class="bar-cell-v num">${esc(c.value)}</div></div>`;
  }).join('');
}

/**
 * Markupen for ÉN armeringsrad (runde 8 §2).
 *
 * HVORFOR HELE RADEN ER EN KNAPP
 * Målt: raden er 940 × 47,5 px, blyanten som åpnet den var 29 × 27,5 px —
 * 1,8 % av flaten — og `.lact { opacity: 0 }` gjorde den usynlig til musa var
 * over raden. Målet er nå hele raden.
 *
 * HVORFOR `<button>` OG IKKE `<div role="button">`
 * `tabindex` er forbudt i hele modulen (`tests/form-structure.test.mjs`), og
 * en `<div>` uten `tabindex` er ikke tastaturnåbar. Skranken velger altså
 * formen for oss, og den velger riktig: en ekte knapp får Tab og Enter gratis.
 *
 * HVORFOR BOT/TOP, DUPLISER OG SLETT LIGGER SOM SØSKEN
 * Nestede knapper er ugyldig HTML. De tre ligger derfor i `.lact` ved siden av
 * radknappen, ikke inne i den, og beholder sine egne tab-stopp. Blyanten er
 * samtidig nedgradert fra knapp til `<span>`: den er nå bare et merke som sier
 * at raden kan åpnes. Uten den nedgraderingen hadde «åpne» kostet TO tab-stopp
 * — radknappen og blyanten — og raden fått fem i stedet for dagens fire.
 *
 * HVORFOR DEN LIGGER PÅ MODULNIVÅ OG ER REN
 * Nøyaktig som `bottomBarStripHtml`: tastaturmodellen for raden ER markupen,
 * og den kan bare testes uten DOM hvis strengen kan bygges uten DOM.
 *
 * Feltene i `view` er FERDIG formatert HTML fra `renderLayers` (`label`, `dc`
 * og `facts` inneholder `<b>` og `<sub>`), ikke rå tall. Tallene skal ha
 * nøyaktig én kilde, og den er opptegningen som allerede har `theta`,
 * `sectionHeight` og `isLocked` for hånden. `id` er det ene som eskapes her,
 * fordi det er det ene som havner i et attributt.
 */
export function layerRowHtml(view) {
  const { id, edge, label, dc, facts, open = false, editor = '' } = view;
  const eid = esc(id);
  return `<div class="lrow bg-slate-800/40">
    <div class="flex items-stretch">
      <button type="button" class="lmain flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-[13px]"
              data-open="${eid}" aria-expanded="${open ? 'true' : 'false'}" title="Edit all fields">
        <span class="w-6 shrink-0 text-slate-500 text-[11px]">${eid}</span>
        <span class="min-w-[116px] num">${label}</span>
        <span class="text-slate-400 num">${dc}</span>
        <span class="text-slate-500 num hidden md:inline ml-3">${facts}</span>
        <span class="lcaret ml-auto pl-2 text-slate-500">${open ? '▾' : '✎'}</span>
      </button>
      <span class="lact flex items-center gap-1 pr-2">
        <button type="button" class="chip !py-0.5 !px-2 !text-[11px]" data-edge="${eid}"
                title="Switch to ${edge === 'bottom' ? 'top' : 'bottom'}">${edge === 'bottom' ? 'BOT' : 'TOP'}</button>
        <button type="button" class="px-2 py-1 rounded hover:bg-slate-700 text-slate-400" data-dup="${eid}" title="Duplicate">⧉</button>
        <button type="button" class="px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300" data-del="${eid}" title="Delete">✕</button>
      </span>
    </div>
    ${editor}
  </div>`;
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

/* ================================================================== *
 * Progressiv avdekking (runde 6 §2.1 og §2.6)
 * ================================================================== */

/**
 * De sammenfoldbare boksene, og HVILKE deler av tilstanden hver av dem eier.
 *
 * HVORFOR EN TABELL OG IKKE TRE if-er
 * De to reglene som gjør skjuling trygg (§2.6) spør begge om det samme:
 * «hvilken boks inneholder denne tilstanden?». Regel 1 spør med en feltsti fra
 * `validate()` (`'concrete.alpha_cc'`, `'shear.stirrups.0.spacing'`), regel 2
 * spør med en verdi som avviker fra standarden. Svarte de to fra hver sin
 * håndskrevne liste, ville en ny `<details>` kunne bli lagt til den ene og
 * glemt i den andre — og resultatet er en skjult boks som inneholder et felt
 * `validate()` klager på. Altså en kalkulator som lyver i stillhet, som er
 * nøyaktig det §2.6 finnes for å hindre.
 *
 * `paths` er hva boksen INNEHOLDER. `derived` er den delmengden av innholdet
 * som ALLEREDE står utenfor boksen, og som derfor ikke er et skjult avvik:
 * `k` og `ε_uk` bestemmes av kvalitetsnedtrekket rett over boksen og er
 * readonly så lenge det treffer. Å folde ut faktorene hver gang noen velger
 * B500NA ville vært en åpning uten en eneste ny opplysning i.
 *
 * `concrete.fck` og `steel.fyk` står ikke i tabellen i det hele tatt: de har
 * ingen felt inne i noen boks, bare nedtrekkene utenfor.
 */
export const DISCLOSURE_BOXES = [
  {
    id: 'adv-material',
    paths: ['concrete.gamma_c', 'concrete.alpha_cc', 'concrete.law',
      'steel.gamma_s', 'steel.gamma_eps', 'steel.Es', 'steel.k', 'steel.epsuk', 'steel.law'],
    derived: ['steel.k', 'steel.epsuk'],
  },
  // Hele `shear`: bøylerader, trykkstavvinkel og z-faktor ligger i samme boks.
  { id: 'adv-shear', paths: ['shear'] },
  { id: 'adv-spacing', paths: ['cover_side', 'spacing'] },
];

/** Verdien på en punktsti i et objekt, eller `undefined`. */
function valueAtPath(obj, path) {
  return path.split('.').reduce((o, key) => (o === null || o === undefined ? undefined : o[key]), obj);
}

/**
 * Dekker `prefix` stien `path`? SEGMENTVIS, ikke `startsWith`: uten det ville
 * prefikset `'steel.k'` dekket `'steel.k1'` den dagen et slikt felt finnes,
 * og feil boks hadde blitt åpnet uten at noe feilet.
 */
function pathCoveredBy(path, prefix) {
  return path === prefix || String(path).startsWith(prefix + '.');
}

/** Boksen som eier feltstien, eller `null` om ingen gjør det. */
export function boxForField(path) {
  if (!path) return null;
  const box = DISCLOSURE_BOXES.find((b) => b.paths.some((p) => pathCoveredBy(path, p)));
  return box ? box.id : null;
}

/**
 * REGEL 1 (§2.6): en boks som inneholder et felt `validate()` klager på, MÅ
 * åpnes. Uten den blir en skjult `γ_c = 0` en kalkulator som lyver — feilen
 * står i valideringsboksen, men feltet den peker på er usynlig.
 *
 * @param {Array<{field?: string}>} issues  `validate()`-utdata
 * @returns {string[]} id-ene til boksene som må åpnes
 */
export function boxesForIssues(issues = []) {
  const ids = new Set();
  for (const issue of issues) {
    const id = boxForField(issue && issue.field);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/** Dyp likhet for TALL, STRENGER, LISTER og FLATE OBJEKTER — som er alt
 *  tilstanden kan inneholde (`store.js`: flat og serialiserbar). Skrevet ut i
 *  stedet for `JSON.stringify`-sammenlikning fordi den siste er avhengig av
 *  NØKKELREKKEFØLGEN: en lastet fil kan gi `{z_factor, strut_angle_deg}` der
 *  standarden gir `{strut_angle_deg, z_factor}`, og boksen ville da åpnet seg
 *  for et avvik som ikke finnes. */
function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number(a) === Number(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameValue(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/**
 * REGEL 3 (§2.6): en boks åpnes ved oppstart og etter lasting hvis en verdi
 * inne i den AVVIKER fra standarden.
 *
 * Uten denne skjuler en innlastet fil med θ = 30° nettopp det som gjør den
 * fila spesiell — brukeren ser en helt vanlig bjelke, og den ene verdien som
 * forklarer hvorfor kapasiteten er som den er, står bak et klikk ingen vet at
 * de skal ta.
 *
 * Regelen kjøres BARE ved oppstart og lasting, ikke ved hver opptegning: gjorde
 * den det, ville en boks med et avvik vært umulig å lukke igjen, og brukerens
 * eget klikk ville blitt overstyrt av automatikken.
 *
 * @param {object} state
 * @param {object} [baseline]  standardtilstanden, injiserbar for testing
 * @returns {string[]}
 */
/**
 * Bokser som må stå åpne SÅ LENGE innholdet finnes — ikke bare ved oppstart.
 *
 * HVORFOR SKJÆRBOKSEN ER ET UNNTAK
 * Plan §2.1 setter bøyle-Ø og c/c blant feltene som ALLTID er synlige, mens
 * oppdraget gjør skjærboksen til en `<details>`. De to henger bare sammen
 * fordi en tom bøyleliste ikke har noen Ø og ingen c/c å vise: da er boksen
 * tom, og sammendraget sier alt (V_Rd = V_Rd,c). I det øyeblikket det finnes en
 * rad, er det to felt som etter planen ikke skal kunne gjemme seg.
 *
 * `boxesForNonDefaults` alene holdt ikke: den kjøres bare ved oppstart og
 * lasting, og `ModuleAPI.setInputs()` kan legge inn en bøylerad midt i økten.
 * Målt i nettleseren sto boksen da lukket med en rad inni — Ø og c/c usynlige,
 * stikk i strid med §2.1. Denne kjøres ved hver opptegning, og fordi
 * `openBoxes` bare kan ÅPNE, kan den ikke rive fokus ut av noe.
 *
 * @param {object} state
 * @returns {string[]}
 */
export function boxesAlwaysOpen(state = {}) {
  const stirrups = (state.shear && state.shear.stirrups) || [];
  return stirrups.length ? ['adv-shear'] : [];
}

export function boxesForNonDefaults(state = {}, baseline = defaultState()) {
  return DISCLOSURE_BOXES
    .filter((box) => box.paths
      .filter((p) => !(box.derived || []).includes(p))
      .some((p) => !sameValue(valueAtPath(state, p), valueAtPath(baseline, p))))
    .map((box) => box.id);
}

/* ================================================================== *
 * Tastaturmodellen (runde 6 §2.3)
 * ================================================================== */

/**
 * ÉN TABELL, TRE LESERE.
 *
 * Tasten står nøyaktig ett sted. Handleren slår opp i den (`shortcutFor`),
 * hurtigtastmerkene som dukker opp når `Alt` holdes leser den (`data-key`), og
 * hjelpelista bygges av den (`shortcutHelpRows`). Det er hele gevinsten:
 * FØR denne runden sto `B`/`P` i tre eksemplarer — i `setupKeyboard`, i
 * hjelpetabellen i `index.html`, og ingen steder på kontrollen selv — og
 * hjelpen kunne derfor love en tast som ikke fantes, eller tie om en som
 * fantes. Nå kan en snarvei verken bli udokumentert eller feildokumentert:
 * det finnes ikke to steder å skrive den.
 *
 * VENSTRE HÅND ALENE. Brukerens krav er at høyre hånd blir på musa. Alle
 * bokstavtastene her ligger på venstre halvdel av tastaturet. Det er grunnen
 * til at `P` for plate er borte: `T` (toggle) veksler i stedet, og den ligger
 * der venstre pekefinger allerede er.
 *
 * VAKTEN ER AVLEDET, IKKE FLAGGET. En kombinasjon virker fra et tekstfelt hviss
 * den har en modifikator (`Ctrl`/`Alt`). Det er ikke en konvensjon vi har valgt
 * å følge, det er den eneste regelen som ikke kan komme i utakt med seg selv:
 * en bar bokstav MÅ blokkeres i et felt, ellers kan man ikke skrive «beam» i et
 * navnefelt. `Escape` er det ene unntaket (`always`) — den skriver ingen
 * bokstav, og «lukk overlegget» er meningsløs hvis den slutter å virke i det
 * øyeblikket fokus står i et felt inne i overlegget.
 *
 * `mark` er kontrollen merket henges på, `action` er hva handleren gjør, og
 * radene UTEN `action` er rene dokumentasjonsrader: tastene virker (de er
 * skrevet i `setupShorthand`), men de eies ikke av `setupKeyboard`. De står
 * her fordi hjelpen skal være fullstendig, ikke bare korrekt.
 */
export const SHORTCUTS = [
  // ---- Med modifikator: virker OGSÅ fra et tekstfelt ----
  {
    action: 'calc',
    combos: ['Ctrl+Space', 'Ctrl+Enter'],
    kbd: '#kbd-calc',
    help: 'Calculate — works from inside a text field too',
  },
  {
    // BESTILT AV BRUKEREN, OG MÅLT. `Alt+Mellomrom` er systemets vindusmeny på
    // Windows, og på maskinen dette ble målt på kommer den ikke engang så
    // langt: PowerToys Run har den som global hurtigtast, og sida får BARE
    // `Alt`-nedslaget — mellomrommet dukker aldri opp, og forgrunnsvinduet blir
    // PowerToys. Et globalt tastegrep skjer FØR nettleseren, så `preventDefault()`
    // kan ikke hjelpe. Derfor er `Ctrl+Shift+Mellomrom` ikke en høflighet, men
    // den kombinasjonen som faktisk bærer funksjonen — og hjelpeteksten sier det
    // rett ut, i stedet for å la brukeren tro at verktøyet er i stykker.
    action: 'runAll',
    // REKKEFØLGEN ER RANGERINGEN: den første er den som vises på tastemerket og i
    // hjelpen. `Ctrl+Shift+Mellomrom` står derfor først — den er den eneste som
    // ALLTID når fram. `Alt+Mellomrom` beholdes fordi den er bestilt og virker på
    // en maskin uten en launcher som har tatt den, men å love den ville vært å
    // love noe vi ikke rår over.
    combos: ['Ctrl+Shift+Space', 'Alt+Space'],
    help: 'Run every analysis. Alt+Space also works unless Windows or a launcher has taken it',
  },
  {
    action: 'duplicate',
    combos: ['D', 'Alt+D'],
    mark: '#dup-last',
    kbd: '#kbd-dup',
    help: 'Duplicate the last reinforcement layer',
  },
  {
    action: 'advancedAll',
    combos: ['Alt+E'],
    help: 'Open or close every Advanced box at once',
  },
  {
    action: 'closeOverlay',
    combos: ['Escape'],
    always: true,
    help: 'Close this list, or the report',
  },

  // ---- Uten modifikator: blokkert av `inField()` ----
  { action: 'focusShorthand', combos: ['A'], mark: '#sh-input', help: 'Focus the shorthand line' },
  {
    action: 'focusSection',
    combos: ['F'],
    help: 'Focus the first field in the section you are looking at',
  },
  {
    action: 'toggleType',
    combos: ['T'],
    mark: '#type-seg',
    help: 'Step to the next cross-section type — beam ⇄ slab',
  },
  {
    action: 'toggleAdvanced',
    combos: ['E'],
    help: 'Open or close Advanced in the section you are looking at',
  },
  { action: 'toggleReport', combos: ['R'], mark: '#btn-report', help: 'Open or close the report' },
  { action: 'help', combos: ['?'], mark: '#btn-help', help: 'This list' },

  // Sifrene LESES AV `ANALYSES`, ikke skrevet av. En femte analyse skal ikke
  // kunne havne i chipraden uten å få tasten sin — og heller ikke uten å få
  // linja si i hjelpen. `Digit`-tokenet er `e.code`, ikke `e.key`: da svarer
  // det numeriske tastaturet likt, og et layout der `1` sitter et annet sted
  // oppfører seg fortsatt som tastaturets øverste rad.
  ...ANALYSES.map(([value], i) => ({
    action: 'analysis',
    index: i,
    combos: [`Digit${i + 1}`],
    mark: `#ana-chips [data-v="${value}"]`,
    help: value === RUN_ALL ? RUN_ALL_LABEL : analysisLabel(value),
  })),

  // ---- Dokumentasjonsrader: eid av `setupShorthand`, ikke av handleren ----
  { combos: ['Enter'], kbd: '#kbd-add', help: 'Add the layer in the shorthand line' },
  { combos: ['ArrowUp'], help: 'Recall the previous shorthand line' },
];

/**
 * Deler `'Ctrl+Shift+Space'` i modifikatorer og tastetoken.
 *
 * @param {string} combo
 * @returns {{ctrl: boolean, alt: boolean, shift: boolean, key: string}}
 */
export function parseCombo(combo) {
  const parts = String(combo).split('+');
  const key = parts.pop();
  return {
    ctrl: parts.includes('Ctrl'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    key,
  };
}

/** Har kombinasjonen en modifikator — altså: virker den fra et tekstfelt? */
function hasModifier(combo) {
  const c = parseCombo(combo);
  return c.ctrl || c.alt;
}

/**
 * Treffer tastetokenet hendelsen?
 *
 * TO REPRESENTASJONER MED VILJE. `e.code` er den FYSISKE tasten og brukes der
 * fysikken er poenget: sifrene (slik at det numeriske tastaturet svarer likt)
 * og mellomrom (som `Alt` kan forkludre `e.key` for). `e.key` er TEGNET og
 * brukes til bokstavene, slik at et norsk layout fortsatt gir `?` på den
 * tasten som er merket `?`.
 */
function keyMatches(token, e) {
  if (/^Digit[0-9]$/.test(token)) return e.code === token || e.code === `Numpad${token.slice(5)}`;
  if (token === 'Space') return e.code === 'Space' || e.key === ' ';
  if (token.length === 1) return String(e.key).toLowerCase() === token.toLowerCase();
  return e.key === token;
}

/**
 * Modifikatorene, STRENGT — og det er en rettelse, ikke pedanteri.
 *
 * Den gamle koden spurte `e.altKey && e.key === 'd'`. På et norsk tastatur
 * setter `AltGr` BÅDE `ctrlKey` og `altKey`, så `AltGr`-kombinasjoner midt i
 * en innskriving fyrte «dupliser siste lag». Her må `Ctrl` være AV for at
 * `Alt+D` skal telle, og da kan `AltGr` ikke lenger treffe.
 *
 * `Shift` sammenliknes IKKE for ettegnstokener: der bærer `e.key` allerede
 * skiftet (`?` ER Shift+`+` på norsk layout), og en streng sammenlikning ville
 * krevd at vi visste hvilket layout brukeren har.
 */
function modsMatch(c, e) {
  const ctrl = Boolean(e.ctrlKey || e.metaKey);
  if (ctrl !== c.ctrl) return false;
  if (Boolean(e.altKey) !== c.alt) return false;
  if (c.key.length === 1) return true;
  return Boolean(e.shiftKey) === c.shift;
}

/**
 * Hvilken handling hendelsen utløser, eller `null`.
 *
 * REN: tar en hendelseslignende verdi og en kontekst, rører ingen DOM. Det er
 * det som gjør tastaturmodellen testbar uten nettleser — og dermed det som
 * gjør at «virker `Alt+D` fra et tekstfelt?» er et spørsmål med et svar i
 * `node --test`, ikke en påstand i en rapport.
 *
 * @param {{key?: string, code?: string, ctrlKey?: boolean, altKey?: boolean,
 *          shiftKey?: boolean, metaKey?: boolean}} e
 * @param {{inField?: boolean}} [ctx]
 * @returns {{action: string, combo: string, index?: number}|null}
 */
export function shortcutFor(e, ctx = {}) {
  const inField = Boolean(ctx.inField);
  for (const s of SHORTCUTS) {
    if (!s.action) continue; // dokumentasjonsrad — eid av en annen oppkobling
    for (const combo of s.combos) {
      const c = parseCombo(combo);
      if (!modsMatch(c, e) || !keyMatches(c.key, e)) continue;
      // VAKTEN. `continue` og ikke `return null`: en bar `D` som blokkeres i et
      // felt skal ikke kunne stenge for `Alt+D` lenger nede i tabellen.
      if (inField && !(c.ctrl || c.alt || s.always)) continue;
      return s.index === undefined ? { action: s.action, combo } : { action: s.action, combo, index: s.index };
    }
  }
  return null;
}

/** Visningsnavnet på ett tastetoken. */
const KEY_NAMES = { Space: 'Space', Enter: '⏎', ArrowUp: '↑', Escape: 'Esc' };

/** Modifikatorer som skrives som TEGN i de trange hintene på knappene.
 *  `⌃Space` er teksten som allerede sto i bunnlinja; bunnlinja er målt opp til
 *  siste piksel (§2.4), og `Ctrl+Space` er fire tegn bredere. `Alt` har ingen
 *  oppføring med vilje — `⌥` er Mac-notasjon, og dette verktøyet brukes på
 *  Windows. */
const KEY_SYMBOLS = { Ctrl: '⌃', Shift: '⇧' };

/**
 * Tastenavnene i en kombinasjon, i rekkefølge: `'Ctrl+Digit1' → ['Ctrl', '1']`.
 * Brukes både av hjelpelista og av merkene, så de to kan ikke vise ulik tast.
 */
export function comboKeys(combo) {
  const parts = String(combo).split('+');
  const key = parts.pop();
  const name = /^Digit[0-9]$/.test(key)
    ? key.slice(5)
    : KEY_NAMES[key] || (key.length === 1 ? key.toUpperCase() : key);
  return parts.concat(name);
}

/**
 * Merket som skal stå oppå kontrollen: den FØRSTE modifikatorfrie
 * kombinasjonen. Et merke er en invitasjon til å trykke én tast; står det
 * `Ctrl+Space` på en knapp, er det ikke lenger et merke, det er en fotnote.
 *
 * @returns {string|null} `null` når snarveien ikke har en bar tast
 */
export function markKey(entry) {
  const bare = (entry.combos || []).find((c) => !hasModifier(c));
  if (!bare) return null;
  const keys = comboKeys(bare);
  return keys.length === 1 ? keys[0] : null;
}

/**
 * Kombinasjonen som skal stå trykt på knappen: den FØRSTE med modifikator,
 * ellers den første i det hele tatt.
 *
 * Motsatt regel av `markKey`, og med vilje. Et merke dukker opp mens `Alt`
 * holdes og handler om øyeblikket — der er den bare tasten den raskeste. Et
 * hint står permanent på knappen og leses når som helst, også med markøren i
 * et felt, og da må det være den kombinasjonen som virker DERFRA. `D` på
 * dupliseringsknappen ville løyet i nøyaktig det tilfellet knappen er nærmest.
 */
export function hintCombo(entry) {
  return (entry.combos || []).find(hasModifier) || (entry.combos || [])[0];
}

/**
 * Kort skrivemåte for hintene som står PÅ knappene («⌃Space», «Alt+D»).
 * Tegnmodifikatorer limes inntil tasten, ordmodifikatorer får `+`.
 */
export function comboShort(combo) {
  let out = '';
  for (const k of comboKeys(combo)) {
    const sym = KEY_SYMBOLS[k];
    if (sym) { out += sym; continue; }
    out += out && !Object.values(KEY_SYMBOLS).includes(out.slice(-1)) ? `+${k}` : k;
  }
  return out;
}

/**
 * Hjelpelista, som RADER og ikke som markup — så den kan sjekkes uten DOM.
 *
 * @returns {Array<{keys: string[][], help: string}>}
 */
export function shortcutHelpRows() {
  return SHORTCUTS.map((s) => ({ keys: s.combos.map(comboKeys), help: s.help }));
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

  /** Seksjonen brukeren ser på nå — svaret `F` og `E` trenger.
   *
   *  SKRIVES AV `setupNav`. Den IntersectionObserver-en visste dette fra før,
   *  men skrev bare til navlenkene; en ny observasjonslogikk her ville vært to
   *  kilder til «hvor er vi», og de to ville drevet fra hverandre i det
   *  øyeblikket noen justerte `rootMargin`. Startverdien er den øverste
   *  seksjonen, som ER den som er i visning før observatøren har sagt noe —
   *  og det eneste rimelige svaret i en nettleser uten IntersectionObserver,
   *  der `setupNav` returnerer med én gang. */
  let visibleSection = 's-mat';
  /** Hvilket lag som står åpent i radeditoren. `null` = ingen. */
  let editing = null;
  /** Kjører en beregning nå? */
  let busy = false;
  /**
   * Håndtaket til spørsmålstegnene, satt i `mount()`.
   *
   * Startverdien er et LUKKET håndtak og ikke `null`, fordi `topOverlay()`
   * spør det først av alle: i en test — eller i det vesle vinduet før
   * `mount()` har kjørt — ville `null` gitt en TypeError inne i
   * `Escape`-lytteren, altså en tast som slutter å virke i stedet for en
   * feilmelding noen ser.
   */
  let hints = { isOpen: () => false, close: () => {} };
  /** Siste linjer i korthåndsfeltet, for ↑. */
  const shHistory = [];
  /**
   * Har brukeren BEDT om å skrive sine egne staltall?
   *
   * `matchSteelGrade` er den ENE kilden til hvilken kvalitet tilstanden har, og
   * `k`/`ε_uk` er readonly så lenge den treffer. Men da måtte det finnes en vei
   * ut: uten dette flagget ville feltene vært låst til en kvalitet som
   * treffer, og «Custom…» ville vært en tilstand ingen kunne komme seg TIL —
   * en blindvei planen ikke hadde sett. Flagget bærer INGEN tallverdi; det sier
   * bare at nedtrekket skal stå på «Custom…» og feltene være åpne. Det nulles
   * i det øyeblikket brukeren velger en ekte kvalitet igjen.
   */
  let steelGradeCustom = false;

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
    // `store.setState` regner selv `dc_auto`-lagene på nytt når `cover`
    // endres (endringsrunde 2 §3.4). Bøylediameteren står ikke her lenger —
    // den bor i bøyleraden, og `updateStirrup` regner om.
    bindField('#i-cover', (s) => s.cover, (v) => store.setState({ cover: v }), { min: 0 });
    bindField('#i-cover-side', (s) => s.cover_side, (v) => store.setState({ cover_side: v }), { min: 0 });

    bindField('#i-gamma-c', (s) => s.concrete.gamma_c, (v) => store.patch('concrete', { gamma_c: v }), { min: 0.0001 });
    bindField('#i-alpha-cc', (s) => s.concrete.alpha_cc, (v) => store.patch('concrete', { alpha_cc: v }), { min: 0.0001 });
    bindField('#i-gamma-s', (s) => s.steel.gamma_s, (v) => store.patch('steel', { gamma_s: v }), { min: 0.0001 });
    bindField('#i-k', (s) => s.steel.k, (v) => store.patch('steel', { k: v }), { min: 1 });
    bindField('#i-epsuk', (s) => s.steel.epsuk, (v) => store.patch('steel', { epsuk: v }), { min: 0.0001 });
    bindField('#i-gamma-eps', (s) => s.steel.gamma_eps, (v) => store.patch('steel', { gamma_eps: v }), { min: 0.0001 });
    // `E_s` har ligget i tilstanden siden første versjon og går inn i
    // `ε_yd = f_yd/E_s`, som rapporten trykker — men hadde ingen kontroll noe
    // sted (runde 6 §2.2). Nedre grense 1 MPa, ikke 0: `steelProps` DELER på
    // den, og en null ga `ε_yd = Infinity` i rapporten uten en eneste advarsel.
    bindField('#i-es', (s) => s.steel.Es, (v) => store.patch('steel', { Es: v }), { min: 1 });

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

    /* ── kvalitetsnedtrekkene (runde 6 §2.2) ──────────────────────────────
       ⚠ FELLE: `<option>`-ene fylles HER, ÉN gang, og ALDRI inne i `render()`.
       Et `select.innerHTML = …` river ut og bygger opp igjen hvert eneste
       `<option>`-element. Gjøres det midt i en opptegning — og `render()`
       kjøres fra hvert eneste felt i skjemaet — mister nedtrekket fokus, og en
       liste som står åpen lukker seg under fingeren på brukeren. Det er samme
       felle `comboEditInFlight` og `stirrupEditInFlight` finnes for, bare med
       `<option>` i stedet for radene. `render()` skal BARE sette `.value`. */
    const fckSel = $('#i-fck');
    if (fckSel) {
      // «Custom…» er DEAKTIVERT, ikke valgbar: det finnes ikke noe felt for en
      // egen `f_ck`, så et valg her ville ikke hatt noe å gjøre. Den står bare
      // så en lastet fil med f.eks. f_ck = 33 får en ÆRLIG merkelapp i stedet
      // for et tomt nedtrekk. `mat-summary` trykker selve tallet ved siden av.
      fckSel.innerHTML = CONCRETE_GRADES
        .map((g) => `<option value="${g.fck}">${esc(g.label)}</option>`).join('')
        + `<option value="custom" disabled>Custom…</option>`;
      fckSel.addEventListener('change', () => {
        const fck = Number(fckSel.value);
        if (!Number.isFinite(fck)) return;
        store.patch('concrete', { fck });
        invalidate();
        render();
      });
    }
    const steelSel = $('#i-steel-grade');
    if (steelSel) {
      // «Custom…» er her derimot VALGBAR, og det er selve låsopplåseren: den
      // rører ingen verdi, den sier bare at `k` og `ε_uk` skal kunne skrives.
      steelSel.innerHTML = STEEL_GRADES
        .map((g) => `<option value="${esc(g.label)}">${esc(g.label)}</option>`).join('')
        + `<option value="custom">Custom…</option>`;
      steelSel.addEventListener('change', () => {
        const grade = STEEL_GRADES.find((g) => g.label === steelSel.value);
        steelGradeCustom = !grade;
        if (grade) {
          // ÉN skriver. Kvaliteten setter alle tre tallene i samme `patch`,
          // og etterpå er det `matchSteelGrade` som LESER dem tilbake — ingen
          // parallell «valgt kvalitet» å holde i takt med tilstanden.
          store.patch('steel', { fyk: grade.fyk, k: grade.k, epsuk: grade.epsuk });
          invalidate();
        }
        render();
      });
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
    put('#i-es', s.steel.Es, 0);

    /* ── kvalitetsnedtrekkene: AVLEDET fra tilstanden, aldri omvendt ──────
       Verdien settes, `<option>`-ene røres ikke — se fella i `setupFields`. */
    const fckSel = $('#i-fck');
    if (fckSel && fckSel !== document.activeElement) {
      const grade = matchConcreteGrade(s.concrete.fck);
      fckSel.value = grade ? String(grade.fck) : 'custom';
    }
    const steelGrade = matchSteelGrade(s.steel);
    const steelSel = $('#i-steel-grade');
    if (steelSel && steelSel !== document.activeElement) {
      steelSel.value = steelGradeCustom || !steelGrade ? 'custom' : steelGrade.label;
    }
    // `k` og `ε_uk` ER kvalitetens tall så lenge en kvalitet treffer. Låst
    // fremfor bare gråtonet: et felt som tar imot et tastetrykk og deretter
    // motsies av nedtrekket over er nøyaktig de TO SKRIVERNE §2.2 fjerner.
    // `readOnly`, ikke `disabled`: et `disabled`-felt faller ut av tab-ringen,
    // og brukeren mister muligheten til å TABBE FORBI og lese verdien.
    const locked = Boolean(steelGrade) && !steelGradeCustom;
    for (const sel of ['#i-k', '#i-epsuk']) {
      const el = $(sel);
      if (!el) continue;
      el.readOnly = locked;
      el.classList.toggle('opacity-60', locked);
      el.title = locked
        ? `Set by the reinforcement grade (${steelGrade.label}). Choose "Custom…" in the grade list to edit it.`
        : 'Custom value — the grade list shows "Custom…" until it matches a standard grade again.';
    }

    const isSlab = s.sectionType === 'slab';
    const b = $('#i-b');
    if (b) {
      // Plata er ALLTID 1000 mm: alt regnes per meter (plan §1). Feltet vises,
      // men er låst — et redigerbart felt som ikke virker er verre enn et låst.
      b.disabled = isSlab;
      b.classList.toggle('opacity-60', isSlab);
    }
    const side = $('#w-cover-side');
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
      // Selve radformen ligger i `layerRowHtml` på modulnivå. Her bygges bare
      // tallene, og de bygges ÉN gang hver: `area`, `d` og `n` over er de
      // eneste kildene til A_s, d og antall jern i denne raden.
      return layerRowHtml({
        id: layer.id,
        edge: layer.edge,
        label,
        dc: `d<sub>c</sub> ${fmtNumber(layer.dc, 1)}` +
          (isLocked(layer.id) ? ' <span title="Derived automatically (EC2 8.2 stacking)">🔒</span>' : ''),
        facts: `A<sub>s</sub> ${fmtArea(area)} mm²${perMeter} · d ${fmtLength(d, 0)} mm · ${n} bars`,
        open,
        editor: open ? rowEditor(layer, s) : '',
      });
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
    /*
     * FOKUS MAA GJENOPPRETTES ETTER `render()`.
     *
     * `render()` bygger `#layers` med `innerHTML`, saa knappen som ble klikket
     * er et ANNET element etterpaa — det gamle er kastet, og fokus faller til
     * `<body>`. Med mus merkes det ikke. Med tastatur er det alvorlig: du
     * tabber til raden, trykker Enter, og har ingen posisjon lenger. Neste Tab
     * starter fra toppen av dokumentet.
     *
     * Dette er samme felle som `comboEditInFlight` og `stirrupEditInFlight`
     * finnes for, men den kan ikke loeses paa samme maate her: der hindrer
     * flagget omtegningen, mens her ER omtegningen hele poenget — editoren skal
     * jo dukke opp. Derfor gjenopprettes fokus i stedet, paa det nye elementet
     * med samme `data-open`.
     */
    // Slaar opp paa `dataset` i stedet for en attributt-selektor: en lag-id gaar
    // rett inn i selektoren ellers, og «L1» er trygg i dag uten at noe HOLDER den
    // trygg i morgen.
    const refocusRow = (id) => {
      for (const el of host.querySelectorAll('[data-open]')) {
        if (el.dataset.open === id) { el.focus(); return; }
      }
    };
    host.querySelectorAll('[data-open]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.open;
        editing = editing === id ? null : id;
        render();
        refocusRow(id);
      };
    });
    host.querySelectorAll('[data-close]').forEach((el) => {
      el.onclick = () => {
        // `editing` ER raden som lukkes — `data-close` baerer ingen id.
        const id = editing;
        editing = null;
        render();
        // Tilbake til radknappen editoren hoerte til, ikke til `<body>`.
        if (id) refocusRow(id);
      };
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
    const isSlab = s.sectionType === 'slab';

    if (!list.length) {
      // Tom liste er IKKE et hull i skjemaet: den er signalet til motoren om å
      // ta V_Rd,c-veien (EC2 6.2.1(4)). For en plate er den tilstanden
      // PERMANENT (§A1 i store.js) — teksten skal derfor ikke tilby en knapp
      // som ikke finnes, og heller ikke ligge under en bjelke som ennå ikke
      // har fått bøyler.
      host.innerHTML = isSlab
        ? `<div class="px-3 py-3 text-[12px] text-slate-500">Shear reinforcement is not designed for ` +
          `slabs in this version. EC2 6.2.3 and 9.2.2 are beam rules, and 9.3.2 does not allow shear ` +
          `reinforcement in slabs thinner than 200 mm. The shear capacity reported is V<sub>Rd,c</sub> ` +
          `to EC2 6.2.2 — the concrete alone, per metre of slab width.</div>`
        : `<div class="px-3 py-3 text-[12px] text-slate-500">No stirrups. The shear capacity is then ` +
          `V<sub>Rd</sub> = V<sub>Rd,c</sub> — the concrete alone (EC2 6.2.1(4)), which is what a slab ` +
          `normally relies on. Press "+ Add stirrups" to add shear reinforcement.</div>`;
      return;
    }

    // `st` alene: løpenummeret `i` trengtes bare til linja som forklarte at
    // denne Ø-en og geometriens er den samme. Den står nå i `HINTS`, og merket
    // under peker på den — så forklaringen er der på ALLE rader i stedet for
    // bare den første, uten å koste en eneste linje i noen av dem.
    //
    // Geometrikolonnen er FAST smal (`minmax(0,26rem)` i index.html, ≈390px
    // innvendig etter padding) uansett vindusbredde — en fast pikselbredde
    // (`!w-NN`) på fire felt pluss en tekst og en knapp gikk derfor aldri opp,
    // og f_ywk var den som måtte gi etter og falle ned på egen linje.
    // Løsningen er et `grid grid-cols-4`: de fire feltene deler bredden som
    // LIKE BRØKDELER av raden i stedet for faste piksler, så de alltid er
    // like store og alltid på linje, uansett hvor smal kolonnen er.
    // A_sw/s og sletteknappen flyttes til en EGEN rad under, høyrejustert med
    // `ml-auto` — de er et sammendrag av raden over, ikke et femte felt som
    // skal konkurrere med de fire om samme grid.
    //
    // Merkelappen ligger over feltet (`.field-label`, SAMME mønster som
    // b/h/cover-raden lenger opp i skjemaet), ikke inni samme flex-linje som
    // input-en: «legs» og «f_ywk» er lengre tekst enn «Ø» og «c/c», og delte
    // de linja med input-en ville de fire boksene likevel blitt ULIKE store
    // — bare grid-CELLA var lik, ikke input-en inni den.
    host.innerHTML = list.map((st) => `<div class="px-3 py-2 text-[13px]">
      <div class="flex items-start gap-2">
        <span class="w-6 pt-4 text-slate-500 text-[11px] shrink-0">${esc(st.id)}</span>
        <div class="grid grid-cols-4 gap-2 flex-1 min-w-0">
          <label class="min-w-0">
            <span class="field-label">Ø</span>
            <span class="relative flex items-center">
              <input type="text" class="!w-full min-w-0 !pr-5" data-sf="dia" data-s="${esc(st.id)}" value="${fmtNumber(st.dia, 1)}" aria-label="Stirrup diameter [mm]">
              <button type="button" class="hint absolute right-0.5 top-1/2 -translate-y-1/2" data-hint="stirrup-dia" aria-expanded="false"
                      aria-label="About the stirrup diameter">?</button>
            </span>
          </label>
          <label class="min-w-0">
            <span class="field-label">c/c</span>
            <input type="text" class="!w-full min-w-0" data-sf="spacing" data-s="${esc(st.id)}" value="${fmtNumber(st.spacing, 1)}" aria-label="Stirrup spacing s [mm]">
          </label>
          <label class="min-w-0"
                 title="Number of legs crossing the shear plane — all of them count in A_sw (EC2 6.2.3).">
            <span class="field-label">legs</span>
            <input type="text" class="!w-full min-w-0" data-sf="legs" data-s="${esc(st.id)}" value="${fmtNumber(st.legs, 0)}" aria-label="Number of legs">
          </label>
          <label class="min-w-0">
            <span class="field-label">f<sub>ywk</sub></span>
            <input type="text" class="!w-full min-w-0" data-sf="fywk" data-s="${esc(st.id)}" value="${fmtNumber(st.fywk, 0)}" aria-label="f_ywk [MPa]">
          </label>
        </div>
      </div>
      <div class="flex items-center gap-2 mt-1 pl-8">
        <span class="text-[11px] text-slate-500 num hidden md:inline">A<sub>sw</sub>/s ${fmtNumber(aswPerSpacing(st), 3)} mm²/mm</span>
        <button type="button" class="ml-auto px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300"
                data-remove-stirrup="${esc(st.id)}" title="Remove stirrup row">✕</button>
      </div>
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
      // `stirrupCoverDia` tar den groveste blant radene. To rader
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
      // STEG 2, H2: en ikke-ULS-rad er ikke kontrollert (SLS er ikke
      // implementert), og tones ned for å si det visuelt, ikke bare i teksten.
      const isUls = combo.type === 'uls';
      return `<div class="px-3 py-2 text-[13px] ${active ? 'bg-sky-950/30' : ''} ${isUls ? '' : 'opacity-60'}">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="chip !py-0.5 !px-2 !text-[11px] shrink-0" data-active-combo="${esc(combo.id)}"
                  data-on="${String(active)}" title="${active ? 'Active — used for moment–curvature' : 'Set active for moment–curvature'}">
            ${active ? '● ' + esc(combo.id) : esc(combo.id)}
          </button>
          <select class="!w-32 !text-[11px]" data-cf="type" data-c="${esc(combo.id)}" aria-label="Combination type" title="Only ULS rows are checked in this version — serviceability (SLS) is not implemented.">
            <option value="uls" ${combo.type === 'uls' ? 'selected' : ''}>ULS</option>
            <option value="characteristic" ${combo.type === 'characteristic' ? 'selected' : ''}>Characteristic</option>
            <option value="quasi_permanent" ${combo.type === 'quasi_permanent' ? 'selected' : ''}>Quasi-permanent</option>
          </select>
          <input type="text" class="!w-28" data-cf="name" data-c="${esc(combo.id)}" value="${esc(combo.name)}" placeholder="name" aria-label="Combination name">
          <label class="flex items-center gap-1 text-[11px] text-slate-500"
                 title="Axial force [kN] — compression is negative.">N<sub>Ed</sub>
            <input type="text" class="!w-24" data-cf="N_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.N_Ed, 2)}" aria-label="N_Ed [kN], compression negative"></label>
          <label class="flex items-center gap-1 text-[11px] text-slate-500" title="Sign convention follows fib structuralcodes: sagging (compression at the top face) is negative.">M<sub>Ed</sub> [kNm] — sagging negative
            <input type="text" class="!w-24" data-cf="M_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.M_Ed, 2)}" aria-label="M_Ed [kNm], sagging negative"></label>
          <label class="flex items-center gap-1 text-[11px] text-slate-500"
                 title="Shear force [kN] — a magnitude; its sign does not affect the shear capacity.">V<sub>Ed</sub>
            <input type="text" class="!w-24" data-cf="V_Ed" data-c="${esc(combo.id)}" value="${fmtNumber(combo.V_Ed, 2)}" aria-label="V_Ed [kN], magnitude — the sign does not matter"></label>
          <button type="button" class="ml-auto px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  data-remove-combo="${esc(combo.id)}" ${s.combos.length <= 1 ? 'disabled' : ''}
                  title="${s.combos.length <= 1 ? 'The last combination cannot be removed' : 'Remove combination'}">✕</button>
        </div>
        <div class="mt-1 text-[11px] text-slate-500 num" data-m-interp="${esc(combo.id)}">${esc(momentInterpretation(combo.M_Ed))}</div>
        ${isUls ? '' : `<div class="mt-0.5 text-[11px] text-amber-500/80" data-combo-sls-note="${esc(combo.id)}">Not checked — SLS is not implemented yet</div>`}
      </div>`;
    }).join('');
    bindComboRows(host);
  }

  function bindComboRows(host) {
    // STEG 2, H3: `<select>`-en for kombinasjonstype. UTEN `comboEditInFlight`
    // — det flagget finnes for å hindre at `innerHTML`-omtegningen spiser
    // TAB-en fra et TEKSTFELT (planens felle 11); en `<select>` mister ikke
    // fokus på samme måte, og med flagget på ville raden ikke blitt tegnet om
    // — altså ingen nedtoning, og `enforceActiveCombo` sin flytting av aktiv
    // rad ville ikke vist seg.
    host.querySelectorAll('select[data-cf="type"]').forEach((el) => {
      el.onchange = () => {
        store.updateCombo(el.dataset.c, { type: el.value });
        invalidate();
        render();
      };
    });
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
    // §2.6: en innlastet fil med θ = 30° skal ikke skjule nettopp det som gjør
    // den fila spesiell. Kalles FØR `render()`, så den første opptegningen
    // allerede har boksene i riktig stilling — ellers ville de blinket opp
    // etterpå. Den låste `k`/`ε_uk`-tilstanden nullstilles samtidig: en fil
    // bærer tall, ikke en beslutning om å redigere dem.
    steelGradeCustom = false;
    if (state) revealNonDefaults();
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

  /**
   * Motorstatusen står nå TRE steder, og hvert av dem svarer på sitt spørsmål:
   * `#engine-pill` i toppen (hvilken tilstand), `#bar-engine` i bunnlinja (hvor
   * langt, med punkttelleren), og `#engine-banner` øverst i resultatseksjonen —
   * KUN ved havari.
   *
   * FRAMDRIFTSLINJA ER BORTE med seksjon 6. Den fortalte i prosent det pilla og
   * bunnlinja sier i ord, og en fjerde visning av samme tall er en fjerde ting
   * som kan bli hengende etter. FEIL-TILSTANDEN er derimot flyttet, ikke
   * slettet: «Retry» var den ENESTE veien tilbake fra en havarert oppvarming,
   * og den bodde bare i `#engine-card`.
   */
  function renderEngine() {
    const st = client.getStatus();
    const pill = $('#engine-pill');
    const banner = $('#engine-banner');
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

    // Punkttelleren fulgte framdriftslinja i `#engine-card`. Den er DEN ENESTE
    // meldingen om at en 20-punkts M–κ faktisk beveger seg, så den flyttes hit
    // i stedet for å forsvinne med seksjonen.
    const counter = st.done !== null && st.total
      ? ` · point ${fmtNumber(st.done, 0)} of ${fmtNumber(st.total, 0)}`
      : '';

    if (pill) {
      pill.innerHTML = `<span class="w-2 h-2 rounded-full ${dot}"></span><span class="text-slate-300 num">${esc(short)}</span>`;
    }
    if (barEng) {
      barEng.innerHTML = st.state === 'ready'
        ? `<span class="text-emerald-400">● ready</span> · ${esc(st.ready?.runtime || '')}`
        : `<span class="num">${esc(short + counter)}</span>`;
    }
    if (!banner) return;

    if (st.state !== 'failed') { banner.innerHTML = ''; return; }

    // §3.9 krav 3: en feilet oppvarming skal ALDRI låse sida. Skjemaet og
    // tegningen virker; bare tallene mangler, og knappen er klikkbar.
    banner.innerHTML = `<div class="flex items-start gap-3 rounded-lg border border-rose-600/50 bg-rose-950/30 p-3 mb-3">
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

  /**
   * Ruller til valideringsboksen — det ENE stedet meldingene står etter at
   * seksjon 6 ble slettet. Både merket i bunnlinja og `main.js`, som stopper
   * kjøringen på en `error`, går hit.
   *
   * IKKE til feltet `issues[0].field` peker på, enda det ville vært bedre:
   * `validate()` gir feltstier (`'concrete.alpha_cc'`, `'layers.3.dc'`), men
   * det finnes ingen kobling fra en slik sti til en DOM-node. En tabell her
   * ville vært EN ANDRE kilde til paret `setupFields()` allerede eier — den
   * koblingen hører hjemme i `bindField`, ikke her.
   */
  function scrollToValidation() {
    const host = $('#validation');
    if (host) host.scrollIntoView({ block: 'center' });
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
   * gjorde — arbeidsarkets eneste alvorlige svakhet. η, η_V, M_Rd, x/d og
   * bruddform står derfor fast i bunnlinja ved siden av ΣA_s og d.
   *
   * SELVE CELLENE BYGGES AV `bottomBarStripHtml`, som er ren og testbar.
   * Denne funksjonen eier bare DOM-en rundt.
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
    // Samme fem celler med og uten resultat. Uten et gyldig resultat står de
    // med «–», ALDRI med gamle tall — alt som kunne gjort tallene ugyldige har
    // allerede kastet dem (`invalidate()`).
    if (strip) strip.innerHTML = bottomBarStripHtml(result, { perMeter });

    // Valideringsmerket. Det TELLER bare; teksten står i `#validation`, som
    // klikket ruller til. To steder som skriver ut den samme meldingen ville
    // vært to steder å glemme å oppdatere.
    const issuesBtn = $('#bar-issues');
    if (issuesBtn) {
      const issues = validate(s);
      const errors = issues.filter((i) => i.severity === 'error').length;
      const warnings = issues.length - errors;
      issuesBtn.hidden = issues.length === 0;
      if (issues.length) {
        const bad = errors > 0;
        issuesBtn.className = 'shrink-0 px-2 py-1 rounded border text-[11px] leading-none num ' +
          (bad ? 'border-rose-600/50 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50'
               : 'border-amber-600/50 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50');
        issuesBtn.textContent = `${bad ? '✕' : '⚠'} ${errors || warnings}`;
        issuesBtn.title = bad
          ? `${errors} error${errors === 1 ? '' : 's'} block the calculation — click to see them`
          : `${warnings} warning${warnings === 1 ? '' : 's'} — click to see them`;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Knapper
   * ---------------------------------------------------------------- */

  /**
   * ÉN «Beregn» og ÉN «Avbryt», ikke to av hver. Løkkene over selektorlister
   * er borte sammen med seksjon 6: så lenge det fantes to knapper med samme
   * oppgave, var det også to steder en tilstand kunne bli hengende igjen.
   */
  function renderButtons() {
    const s = store.getState();
    const cancellable = busy && isCancellable(s.analysis);

    const run = $('#btn-run-bar');
    if (run) {
      run.disabled = busy;
      run.classList.toggle('opacity-60', busy);
      run.classList.toggle('cursor-wait', busy);
      // «Beregn» sier hva den kjører (endringsrunde 2 §6) — kort i knappen,
      // helt ut i `title`, fra samme oppføring.
      const verb = CALC_VERB[s.analysis];
      const label = $('#btn-run-bar-label');
      if (label) label.textContent = verb ? verb.short : 'Calculate';
      run.title = verb ? verb.long : 'Calculate';
    }

    const cancel = $('#btn-cancel-bar');
    if (cancel) {
      // «Avbryt» er DEAKTIVERT for bøyekapasitet og M–N-diagram (plan §3.7):
      // de tar 30–140 ms, og eneste måten å angre dem på er å rive ned en
      // 10 MB runtime. En knapp som koster mer enn jobben den avbryter er
      // verre enn ingen knapp.
      cancel.style.display = busy ? '' : 'none';
      cancel.disabled = !cancellable;
      cancel.classList.toggle('opacity-40', !cancellable);
      cancel.title = !cancellable
        ? 'This analysis takes under a tenth of a second and cannot be cancelled.'
        // «Kjør alle» ER avbrytbar fordi den inneholder moment–krumning
        // (`CANCELLABLE_ANALYSES` i `solver-client.js`), men den stopper
        // mellom faser — «punktene» er bare det halve svaret der.
        : s.analysis === RUN_ALL
        ? 'Cancel the run. The phases that already finished are kept.'
        : 'Cancel the moment–curvature run. Points already calculated are kept.';
    }
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

    // `#fck-chips` og `#fyk-chips` er borte (runde 6 §2.2). Brikkeraden for
    // stål skrev `fyk`, `k` OG `epsuk` samtidig som `k` og `ε_uk` hadde egne
    // felt rett under — to skrivere til samme verdi. Nedtrekkene er ren
    // AVLEDNING av tilstanden og settes i `syncFields()`.
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
      //
      // LINJA ER DELT I TO (runde 8 §4), og skillet er ikke lengde, men
      // levetid: NAVNET endrer seg når brukeren bytter kombinasjon og må
      // derfor stå framme, mens REGELEN bak det — hvorfor M–κ bare kjører én
      // — er den samme for alltid og ligger nå bak `HINTS.analysis`. Samme
      // grunn til at `data-m-interp` ikke ble flyttet noe sted: et tall som
      // svarer på det du nettopp skrev, er en bedre lærer enn et avsnitt.
      anaActive.textContent = `Active combination: ${label} — used for moment–curvature.`;
    }

    const mats = derivedMaterials(s);
    const matSum = $('#mat-summary');
    if (matSum) {
      // SAMME oppslag som nedtrekkene bruker. Linja sto før med sin egen
      // `CONCRETE_GRADES.find(...)` og skrev stålkvaliteten som `B${fyk}` —
      // altså «B500» for BÅDE B500NA og B500NC, som er to ulike kvaliteter med
      // ε_uk 2,5 % mot 7,5 %. Sammendraget kunne dermed ikke skille dem, mens
      // nedtrekket kunne: to kilder til samme opplysning, og den kortere av
      // dem var den som løy.
      const cGrade = matchConcreteGrade(s.concrete.fck);
      const sGrade = matchSteelGrade(s.steel);
      matSum.innerHTML = `${esc(cGrade ? cGrade.label : `f_ck ${fmtNumber(s.concrete.fck, 0)} MPa`)} · ` +
        `${esc(sGrade ? sGrade.label : `f_yk ${fmtNumber(s.steel.fyk, 0)} MPa (custom)`)} · ` +
        `${esc(lawLabel(s.concrete.law))}`;
    }
    const facSum = $('#fac-summary');
    if (facSum) {
      // §2.6: EN SAMMENFOLDET BOKS MÅ TRYKKE VERDIENE SINE I SUMMARY. Alle sju
      // tallene som bor bak dette klikket står her, så en avvikende γ_c eller
      // en E_s som ikke er 200 GPa kan ses UTEN å åpne boksen. Det er
      // forskjellen på å skjule og å skjule bort.
      facSum.innerHTML = `Factors and material model — γ<sub>c</sub> ${fmtNumber(s.concrete.gamma_c, 2)} · ` +
        `α<sub>cc</sub> ${fmtNumber(s.concrete.alpha_cc, 2)} · γ<sub>s</sub> ${fmtNumber(s.steel.gamma_s, 2)} · ` +
        `γ<sub>ε</sub> ${fmtNumber(s.steel.gamma_eps, 2)} · k ${fmtNumber(s.steel.k, 2)} · ` +
        `ε<sub>uk</sub> ${fmtPercent(s.steel.epsuk, 1)} % · E<sub>s</sub> ${fmtNumber(s.steel.Es, 0)} MPa`;
    }
    const spacingSum = $('#spacing-summary');
    if (spacingSum) {
      // Samme regel. `cover_side` er ikke med for plata — den har ingen
      // sidekant å måle fra, og feltet er skjult (`syncFields`). Et tall i
      // sammendraget for et felt som ikke finnes ville vært et tall ingen kan
      // rette.
      const side = s.sectionType === 'slab' ? '' : `c<sub>side</sub> ${fmtNumber(s.cover_side, 0)} mm · `;
      spacingSum.innerHTML = `${side}k<sub>1</sub> ${fmtNumber(s.spacing.k1, 2)} · ` +
        `k<sub>2</sub> ${fmtNumber(s.spacing.k2, 2)} · d<sub>g</sub> ${fmtNumber(s.spacing.d_g, 0)} mm`;
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
      drawGeo.innerHTML = drawSection(s, {
        width: GEO_DRAW_WIDTH, height: GEO_DRAW_HEIGHT,
        unit: 'px', theme: 'dark', showDims: true, showLabels: true,
      });
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
      // §2.6: boksen er nå sammenfoldbar, og da må sammendraget bære ALLE
      // verdiene bak klikket — også θ og z_factor, som avgjør V_Rd,s og
      // V_Rd,max. Uten dem kunne en fil med θ = 30° sett ut som en fil med 45°.
      // θ og z_factor styrer bare V_Rd,s/V_Rd,max, som ikke regnes for en
      // plate (§A1 i store.js) — sammendraget skal derfor ikke vise dem for
      // en plate, det ville påstått at trykkstavvinkelen betydde noe den ikke gjør.
      const strut = `θ ${fmtNumber(s.shear.strut_angle_deg, 1)}° · ` +
        `z ${fmtNumber(s.shear.z_factor, 2)}·d`;
      shearSum.innerHTML = list.length
        ? `${list.length} row${list.length === 1 ? '' : 's'} · ΣA<sub>sw</sub>/s ` +
          `${fmtNumber(totalAswPerSpacing(list), 3)} mm²/mm · ${strut}`
        : s.sectionType === 'slab'
          ? `V<sub>Rd</sub> = V<sub>Rd,c</sub> · no shear reinforcement (slab)`
          : `No stirrups · V<sub>Rd</sub> = V<sub>Rd,c</sub> · ${strut}`;
    }
    // Knappen er en no-op når raden allerede finnes (se `setupShear`), og
    // hintlinja forklarer noe brukeren ennå ikke har å se på — begge hører
    // til FØR raden finnes, ikke etter. `render()` kjører på hver endring
    // (også fjerning av raden), så synligheten må settes her, ikke bare ved
    // oppstart. En plate skal ALDRI se knappen eller hintet: den får aldri
    // bøyler (§A1 i store.js), og knappen ville uansett vært en no-op.
    const hasStirrups = (s.shear?.stirrups || []).length > 0;
    const isSlabSection = s.sectionType === 'slab';
    const addStirrupBtn = $('#add-stirrup');
    if (addStirrupBtn) addStirrupBtn.classList.toggle('hidden', hasStirrups || isSlabSection);
    const shearHint = $('#shear-hint');
    if (shearHint) {
      shearHint.classList.toggle('hidden', hasStirrups || isSlabSection);
      shearHint.innerHTML = hasStirrups
        ? ''
        : 'The legs are drawn in the section, bent around the bars they meet.';
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

    // REGEL 1 (§2.6), og den kjøres FØR `renderValidation()` med vilje: står
    // meldingen «α_cc må være større enn 0» i boksen mens feltet den peker på
    // er sammenfoldet, er kalkulatoren en kalkulator som lyver. `openBoxes`
    // kan bare ÅPNE — se der for hvorfor det aldri er lov å lukke.
    openBoxes(boxesForIssues(validate(s)));
    // …og §2.1: felt som skal være ALLTID synlige kan ikke ligge i en lukket
    // boks bare fordi de ble lagt inn utenom UI-et.
    openBoxes(boxesAlwaysOpen(s));
    renderValidation();
    renderResult();
    renderBottomBar();
    renderButtons();
    renderEngine();
  }

  /* ---------------------------------------------------------------- *
   * Progressiv avdekking — DOM-siden (§2.6)
   * ---------------------------------------------------------------- */

  /**
   * Hvilke bokser som står åpne lagres i `sessionStorage`, IKKE i `store.js`.
   *
   * `store.js:20` slår fast at lagring er kuttet med vilje, og tilstanden der
   * er MODELLEN — det som havner i payloaden til motoren og i den lagrede
   * fila. Om en boks er foldet ut er en visningspreferanse: den skal ikke bli
   * med i en delt fil, den skal ikke kaste resultatet, og den skal ikke måtte
   * versjoneres i `SCHEMA_VERSION`. `sessionStorage` og ikke `localStorage`
   * fordi preferansen hører til ØKTEN — neste gang er det gjerne et annet snitt.
   */
  const DISCLOSURE_KEY = 'csc:disclosure';

  function readDisclosure() {
    // Privat modus og blokkerte informasjonskapsler KASTER på `sessionStorage`.
    // Et skjema som ikke lar seg fylle ut fordi en visningspreferanse ikke kunne
    // leses ville vært en absurd feil, så all lagring er «best effort».
    try {
      return JSON.parse(sessionStorage.getItem(DISCLOSURE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeDisclosure(map) {
    try {
      sessionStorage.setItem(DISCLOSURE_KEY, JSON.stringify(map));
    } catch {
      /* ingen lagring tilgjengelig — boksene oppfører seg som en fersk økt */
    }
  }

  /**
   * AUTOMATIKKEN FÅR BARE ÅPNE, ALDRI LUKKE (§2.6 regel 2).
   *
   * Å lukke en `<details>` som inneholder fokus flytter fokus til `<body>` midt
   * i en Tab — og `render()` kjøres fra hvert eneste felt, altså nettopp mens
   * brukeren tabber. Det er den ENESTE måten avdekkingen kan ødelegge
   * tastaturnavigasjonen på, og derfor finnes det ingen `closeBoxes`.
   *
   * `el.open` settes bare når den er `false`: en tilordning av `true` til en
   * allerede åpen `<details>` fyrer riktignok ingen `toggle`, men en sjekk her
   * er billigere enn å stole på det.
   */
  function openBoxes(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !el.open) el.open = true;
    }
  }

  /** REGEL 3 (§2.6): avvik fra standarden skal ikke kunne gjemme seg. Kjøres
   *  ved oppstart og etter hver lasting — ikke ved hver opptegning, ellers
   *  ville en boks med et avvik vært umulig å lukke igjen. */
  function revealNonDefaults() {
    openBoxes(boxesForNonDefaults(store.getState()));
  }

  function setupDisclosure() {
    for (const box of DISCLOSURE_BOXES) {
      const el = document.getElementById(box.id);
      if (!el) continue;
      const saved = readDisclosure()[box.id];
      if (typeof saved === 'boolean') el.open = saved;
      // `toggle` og ikke `click` på summary: `<details>` kan også åpnes av
      // tastatur, av «finn på siden» i nettleseren, og av `openBoxes` over.
      // `toggle` er det ene stedet alle de veiene møtes.
      el.addEventListener('toggle', () => {
        const map = readDisclosure();
        map[box.id] = el.open;
        writeDisclosure(map);
      });
    }
    revealNonDefaults();
  }

  /* ---------------------------------------------------------------- *
   * Tastatur
   * ---------------------------------------------------------------- */

  const inField = () => {
    const a = document.activeElement;
    return Boolean(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };

  /**
   * `<details>`-boksene i én seksjon — eller alle, uten argument.
   *
   * LESER `DISCLOSURE_BOXES`, ikke DOM-en: den lista er allerede den ene
   * kilden til hvilke bokser som er «Advanced» (regel 1 og 3 leser den), og en
   * `document.querySelectorAll('details')` ville i tillegg fanget
   * forutsetningsboksen nederst i resultatseksjonen — som ikke er et
   * inndatafelt og ikke har noe i `E` å gjøre.
   */
  function advancedBoxes(sectionId) {
    const sec = sectionId ? document.getElementById(sectionId) : null;
    return DISCLOSURE_BOXES
      .map((b) => document.getElementById(b.id))
      .filter((el) => el && (!sec || sec.contains(el)));
  }

  /**
   * ALLE ELLER INGEN. Geometriseksjonen har to bokser; vekslet `E` dem hver
   * for seg, ville andre trykk lukket den ene og åpnet den andre, og tredje
   * trykk gitt utgangsstillingen igjen — en bryter uten av-stilling.
   *
   * Lukking flytter fokus til `<summary>` FØRST når fokus står inne i boksen.
   * Regel 2 (§2.6) forbyr AUTOMATIKKEN å lukke, nettopp fordi en lukket
   * `<details>` kaster fokus til `<body>`. Her er det brukeren selv som
   * lukker, men prisen er den samme, og den er betalt med to linjer.
   */
  function toggleBoxes(list) {
    if (!list.length) return;
    const open = list.some((el) => !el.open);
    for (const el of list) {
      if (!open && el.contains(document.activeElement)) {
        const sum = el.querySelector('summary');
        if (sum) sum.focus();
      }
      el.open = open;
    }
  }

  /** Står rapporten åpen? */
  const reportOpen = () => { const r = $('#report-overlay'); return Boolean(r && !r.hidden); };

  /** SAMME DØR SOM MUSEKLIKKET. `main.js` eier lukkingen av rapporten; et
   *  `overlay.hidden = true` her ville vært en andre kilde til den samme
   *  tilstandsovergangen, og den ville sluttet å følge med den dagen lukkingen
   *  fikk noe mer å gjøre. */
  const closeReport = () => $('#report-close')?.click();

  /** Overlegget som ligger øverst nå, eller `null`. `Escape` lukker ETT om
   *  gangen: rapporten kan stå åpen bak hjelpelista. */
  function topOverlay() {
    // HINTET LIGGER ØVERST, og det er gratis: `Escape` har allerede en lytter,
    // og et låst hint er det siste brukeren åpnet. Sto sjekken lenger ned,
    // ville Escape lukket rapporten UNDER en hint som ble stående igjen og
    // pekte på et merke som ikke lenger var på skjermen. En fjerde
    // tastelytter ville dessuten vært en andre kilde til «hva lukker hva».
    if (hints.isOpen()) return hints.close;
    const help = $('#help');
    if (help && !help.classList.contains('hidden')) return () => help.classList.add('hidden');
    return reportOpen() ? closeReport : null;
  }

  /** Handlingene, slått opp på navn. Tabellen `SHORTCUTS` sier HVILKEN tast;
   *  denne sier HVA den gjør. Ingen tast er skrevet her. */
  const ACTIONS = {
    calc: () => onCalculate(),
    runAll: () => {
      // «Kjør alle» er en analyse som alle andre (`RUN_ALL` i `ANALYSES`), og
      // den er ALLTID lovlig. Samme tre linjer som chippen gjør — velg, kast
      // det gamle svaret, tegn — og så kjør.
      if (store.getState().analysis !== RUN_ALL) {
        store.setState({ analysis: RUN_ALL });
        invalidate();
        render();
      }
      onCalculate();
    },
    duplicate: () => duplicateLast(),
    advancedAll: () => toggleBoxes(advancedBoxes()),
    toggleAdvanced: () => toggleBoxes(advancedBoxes(visibleSection)),
    closeOverlay: () => { const close = topOverlay(); if (close) close(); },
    focusShorthand: () => {
      const f = $('#sh-input');
      if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
    },
    focusSection: () => {
      // Overgangen fra mus til tastatur: man har rullet dit med musa, og vil
      // skrive. Bare ekte inndatafelt teller — en knapp er ikke noe å skrive i,
      // og `F` i resultatseksjonen skal derfor ikke flytte fokus i det hele
      // tatt framfor å lande på «Print».
      const sec = document.getElementById(visibleSection);
      const f = sec && sec.querySelector('input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([readonly])');
      if (f) f.focus();
    },
    toggleType: () => {
      // EN SYKLING OVER EN LISTE, ikke en if/else (§2.3). Lista er segmentets
      // egne knapper — den SAMME lista musa klikker i. Kommer T-tverrsnittet
      // veikartet lover, får det tasten sin av å finnes i markupen, og ingen
      // her må huske å utvide en `if`.
      //
      // Og `.click()` framfor `store.setSectionType(...)`: knappens egen
      // handler nullstiller også radeditoren (`editing = null`). Den gamle
      // `B`/`P`-koden gjorde det IKKE, så en åpen radeditor ble stående igjen
      // over et tverrsnittsbytte som hadde skrevet om alle lagene under den.
      const btns = $$('#type-seg button[data-v]');
      if (!btns.length) return;
      const cur = btns.findIndex((b) => b.dataset.v === store.getState().sectionType);
      btns[(cur + 1) % btns.length].click();
    },
    toggleReport: () => { if (reportOpen()) closeReport(); else onReport(); },
    help: () => $('#help')?.classList.toggle('hidden'),
    analysis: (hit) => {
      const entry = ANALYSES[hit.index];
      if (!entry) return;
      // Samme dør som chippen (§2): tast `1` skal IKKE kunne sette
      // `analysis: 'bending'` når en kombinasjon har aksialkraft. Uten denne
      // sjekken var snarveien den ANDRE veien inn regelen ellers glemte å
      // stenge.
      if (allowedAnalyses(store.getState()).concat(RUN_ALL).includes(entry[0])) {
        store.setState({ analysis: entry[0] }); invalidate(); render();
      }
    },
  };

  /* -- Hurtigtastmerker: hold Alt, se tastene ------------------------ */

  /** Hvor lenge `Alt` må holdes. Kort nok til å føles umiddelbart, langt nok
   *  til at `Alt+D` og `Alt+Tab` ikke blinker merker på skjermen. */
  const KEYTIP_HOLD_MS = 300;
  let keyTipTimer = null;
  let keyTipsOn = false;

  /**
   * Merkene leser `SHORTCUTS`. Det er hele poenget med dem: står tasten i
   * tabellen, står den på kontrollen, og en snarvei kan ikke bli udokumentert.
   *
   * MERKET HENGES PÅ FORELDEREN til et `<input>`/`<select>`: `::after` finnes
   * ikke på erstattede elementer, så et merke på selve feltet ville vært
   * usynlig — den tause varianten av å ikke ha merket i det hele tatt.
   *
   * En DEAKTIVERT kontroll får ikke merke. Et merke er et løfte om at tasten
   * virker, og på en grå chip ville løftet vært falskt.
   */
  function showKeyTips() {
    for (const s of SHORTCUTS) {
      if (!s.mark) continue;
      const key = markKey(s);
      if (!key) continue;
      const el = $(s.mark);
      if (!el || el.disabled) continue;
      const host = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? el.parentElement : el;
      if (host) host.setAttribute('data-key', key);
    }
    keyTipsOn = true;
  }

  /** Ryddes på `keyup` OG på `window.blur` — uten den siste henger merkene
   *  igjen etter `Alt+Tab`, fordi `keyup` for Alt da aldri kommer til sida. */
  function hideKeyTips() {
    if (keyTipTimer !== null) { clearTimeout(keyTipTimer); keyTipTimer = null; }
    if (!keyTipsOn) return;
    for (const el of $$('[data-key]')) el.removeAttribute('data-key');
    keyTipsOn = false;
  }

  /* -- Hjelpelista og hintene på knappene ---------------------------- */

  /**
   * Hjelpeoverlegget BYGGES av `SHORTCUTS`, det skrives ikke i `index.html`.
   * Den håndskrevne tabellen der lovet `B`/`P` lenge etter at tastene var
   * omdiskutert, og tidde om `Alt+E` — en hjelpetekst er den eneste
   * dokumentasjonen ingen test leser, med mindre den er avledet.
   */
  function renderHelp() {
    const body = $('#help-rows');
    if (!body) return;
    body.innerHTML = shortcutHelpRows().map((r) => {
      const keys = r.keys
        .map((k) => k.map((n) => `<kbd>${esc(n)}</kbd>`).join(' '))
        .join(' <span class="text-slate-600">/</span> ');
      return `<tr><td class="whitespace-nowrap align-top">${keys}</td>` +
             `<td class="text-slate-300">${esc(r.help)}</td></tr>`;
    }).join('');
  }

  /** De faste hintene på knappene («⌃Space» i bunnlinja) fylles fra samme
   *  tabell. Sto de i markupen, ville de vært en tredje kilde til tasten. */
  function renderShortcutHints() {
    for (const s of SHORTCUTS) {
      if (!s.kbd) continue;
      const el = $(s.kbd);
      if (el) el.textContent = comboShort(hintCombo(s));
    }
  }

  function setupKeyboard() {
    renderHelp();
    renderShortcutHints();

    document.addEventListener('keydown', (e) => {
      // `Alt` alene: hold den, og merkene kommer. `e.repeat` filtrerer bort
      // autogjentakelsen — uten den ville timeren blitt satt på nytt for hvert
      // gjentatte keydown og merkene aldri kommet.
      if (e.key === 'Alt' && !e.ctrlKey) {
        if (!e.repeat && !keyTipsOn && keyTipTimer === null) {
          keyTipTimer = setTimeout(() => { keyTipTimer = null; showKeyTips(); }, KEYTIP_HOLD_MS);
        }
        return;
      }

      const hit = shortcutFor(e, { inField: inField() });
      if (!hit) return;
      // `preventDefault()` på ALT som treffer: det er dette som holder
      // `Alt+Mellomrom` unna Windows' vindusmeny, og `Mellomrom` unna å rulle
      // sida. Ligger den bare på noen av grenene, er forskjellen usynlig helt
      // til den ene tasten som manglet den gjør noe annet enn den lover.
      e.preventDefault();
      hideKeyTips();
      const run = ACTIONS[hit.action];
      if (run) run(hit);
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' || !e.altKey) hideKeyTips();
    });
    window.addEventListener('blur', hideKeyTips);
  }

  /* ---------------------------------------------------------------- *
   * Oppstart
   * ---------------------------------------------------------------- */

  function setupButtons() {
    const run = $('#btn-run-bar');
    if (run) run.onclick = () => onCalculate();
    const cancel = $('#btn-cancel-bar');
    if (cancel) cancel.onclick = () => onCancel();
    // Merket er en snarvei TIL forklaringen, ikke forklaringen selv.
    const issues = $('#bar-issues');
    if (issues) issues.onclick = () => scrollToValidation();
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
    // `s-calc` er borte (seksjon 6 slettet). Lista må følge navigasjonen i
    // `index.html`: en id som ikke finnes gir ingen feil, bare en lenke som
    // aldri lyser opp — den tause varianten.
    const ids = ['s-mat', 's-geo', 's-arm', 's-last', 's-ana', 's-res'];

    /**
     * ÉN OBSERVATØR OVER ALLE SEKSJONENE, og svaret er den ØVERSTE som er i
     * båndet.
     *
     * Før var det seks observatører, én per seksjon, og hver av dem skrev
     * navlenkene når NETTOPP DEN krysset inn. Vinneren var altså «den som
     * fyrte sist», og båndet (110 px til 45 % av høyden ≈ 300 px) rommer to
     * seksjoner om gangen. MÅLT i nettleseren, 1440×900, rulling gjennom alle
     * seks og tilbake: 5 av 11 stillinger lyste på feil lenke, og ved oppstart
     * — med brukeren øverst på sida — lyste «2 Geometry».
     *
     * Verre: en seksjon som ALLEREDE krysser og fortsetter å gjøre det, får
     * ingen ny hendelse. Rullet man til en slik seksjon, ble svaret stående
     * på den forrige uten at noe skjedde.
     *
     * Det var til å leve med så lenge svaret bare farget en lenke. Fra nå av
     * er det svaret `F` og `E` handler på — «fokuser første felt i seksjonen
     * du ser på» som lander i en annen seksjon er ikke en unøyaktighet, det er
     * en snarvei som gjør noe annet enn den sier. Derfor ett sett, én
     * avgjørelse, og en regel som ikke avhenger av rekkefølgen hendelsene kom
     * i: dokumentrekkefølgen.
     */
    const inView = new Set();
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) inView.add(en.target.id);
        else inView.delete(en.target.id);
      }
      // Ingen seksjon i båndet (man ruller mellom to): BEHOLD forrige svar.
      // Et tomt svar ville gjort både navlenkene og `F` blinde i mellomrommet.
      //
      // ÉN KJENT BEGRENSNING, MÅLT: nederst på sida (scrollY = maks) kan de to
      // siste seksjonene ikke nå opp i båndet i det hele tatt, og svaret blir
      // stående på «4 Loads» enda man ser på resultatet. Å rette det krever en
      // rulle-lytter i tillegg til observatøren — altså en ANDRE kilde til det
      // samme spørsmålet, som er nøyaktig feilformen denne funksjonen nettopp
      // ble kvitt. Den dagen seksjonene får mer innhold under seg, forsvinner
      // tilfellet av seg selv.
      const id = ids.find((i) => inView.has(i));
      if (!id) return;
      visibleSection = id;
      $$('.navlink').forEach((a) => { a.dataset.on = String(a.getAttribute('href') === `#${id}`); });
    }, { rootMargin: '-110px 0px -55% 0px', threshold: 0 });

    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) obs.observe(node);
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
      // FØR `render()`: `setupDisclosure` leser den lagrede stillingen og
      // åpner det som avviker fra standarden. Kjørte den etterpå, ville
      // boksene stått feil gjennom den første opptegningen.
      setupDisclosure();
      // Pekerboblene henges på resultatseksjonen én gang. Figurene byttes ut
      // ved hver beregning, men lytteren sitter over dem og overlever det.
      attachChartTips(document.getElementById('s-res'));
      // PÅ `document.body`, ikke på hver seksjon. Merkene står i statisk
      // markup i dag, men et merke inne i en radliste ville dødd ved neste
      // `innerHTML` hvis lytteren satt lenger inn — og «klikk utenfor lukker»
      // krever uansett at klikk hvor som helst på sida når fram hit.
      hints = attachHints(document.body, HINTS);
      render();
    },
    render,
    renderEngine,
    /** Ruller til valideringsboksen. `main.js` bruker den når `validate()`
     *  stoppet kjøringen — boksen flyttet med seksjon 6, og et hardkodet
     *  `#s-calc` i `main.js` ville bare rullet til ingenting. */
    scrollToValidation,
    /** Beregningen er i gang / ferdig — styrer «Beregn» og «Avbryt». */
    setBusy(value) {
      busy = Boolean(value);
      renderButtons();
    },
  };
}
