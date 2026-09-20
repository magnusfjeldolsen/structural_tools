/**
 * report.js — A4-rapporten for betongtverrsnittet.
 *
 * HVORFOR REKKEFØLGEN ER SOM DEN ER (plan §8)
 * Kapittel 1–7 står i den rekkefølgen en kontrollerende leser dem: hvem og
 * hva (1), hvilket snitt (2), hvor mye armering (3), hvilken last (4), hva
 * det ble (5), hvordan det ser ut (6), og til slutt hva som er forutsatt (7).
 * Rekkefølgen er testet, ikke bare skrevet ned, fordi den er den eneste
 * egenskapen ved rapporten en senere endring kan ødelegge helt stille: et
 * kapittel som glir opp eller ned ser fortsatt riktig ut i hver enkelt tabell.
 *
 * FIGUREN FØRST I KAPITTEL 2
 * Et tverrsnitt er det leseren må se for å forstå resten. Tabellene under
 * figuren er en oppramsing av tall som ikke betyr noe før man vet hva de
 * beskriver.
 *
 * TO FIGURER, IKKE ÉN GJENTATT
 * Kapittel 2 viser snittet slik det er MATET INN. Kapittel 6 viser RESULTATET:
 * for bøyekapasitet er det samme snitt med nøytralakse og trykksone lagt på,
 * for moment–krumning og M–N er det plottet fra `charts.js`. Det er derfor
 * kapittel 6 aldri er tomt for noen av de tre analysene — «plott» betyr
 * resultatet tegnet, ikke nødvendigvis et diagram.
 *
 * HVA RAPPORTEN IKKE GJØR
 * Den regner ingenting selv. Etter en kjøring kommer HVER verdi fra
 * `result` (plan §5.2), og `d` kommer fra `result.section_props.d_eff` —
 * aldri fra `rebar.js`, som ikke har tøyningsplanet og derfor ikke KAN
 * gjengi EC2-`d` for et dobbeltarmert snitt (plan §5.2). Før første kjøring
 * brukes `derived(state)` og `derivedMaterials(state)`, som har nøyaktig de
 * samme feltnavnene — én kodevei, og en drift mellom JS og motor blir synlig
 * som en tallforskjell i samme felt i stedet for å gjemme seg i to strukturer.
 *
 * `{ok:false}` ER IKKE TOM (endringsrunde 2, §4.4). Motoren sender nå HELE
 * konvolutten — `section_props`, `materials`, `checks`, `meta` og en
 * analyseblokk — selv når INGEN lastkombinasjon var innenfor
 * [N_min, N_max]. `propsOf`/`materialsOf` under leser derfor resultatet
 * uansett `ok`, og faller bare tilbake til `derived(state)` når feltet
 * faktisk mangler (eldre fixtur, eller ingen kjøring i det hele tatt).
 *
 * VERSJONEN KOMMER FRA `meta.js`
 * Ikke fra `MODULE_CONFIG` i `index.html`: den ligger i et skript-scope denne
 * fila ikke importerer fra (plan §8 punkt 1). To håndskrevne versjonsstrenger
 * ville uunngåelig sakket fra hverandre.
 *
 * BYGGES PÅ FORESPØRSEL
 * Aldri i store-abonnentens renderløkke. Rapporten kaller `drawSection` og
 * plottefunksjonene, og ingenting ved den trenger å være ferskt før noen
 * faktisk åpner overlegget eller trykker Ctrl+P.
 *
 * `buildReportHtml` er DOM-fri og ren (plan §2.3 punkt 2) — den returnerer en
 * streng. Bare `stageReportForPrint`/`clearPrintStage` nederst rører DOM-en,
 * og de gjør det først når de KALLES, slik at fila kan importeres i node.
 */

import { MODULE_NAME, MODULE_VERSION, STRUCTURALCODES_VERSION } from './meta.js';
import { derived, thetaFor, sectionWidth, sectionHeight, layerSummary } from './section.js';
import { derivedMaterials, resolveCreep } from './materials.js';
import { drawSection, layerLabel } from './section-draw.js';
import { momentCurvatureSvg, nmDomainSvg, radialUtilisation } from './charts.js';
import {
  DASH,
  toNum,
  fmtNumber,
  fmtLength,
  fmtArea,
  fmtStress,
  fmtForceKN,
  fmtMomentKNm,
  fmtStrainPermille,
  fmtCurvature,
  fmtRatio,
  fmtPercent,
  utilisationStatus,
  HEADLINE_UTILISATION_LABEL,
  RADIAL_UTILISATION_LABEL,
  describeWarnings,
  describeError,
  failureModeLabel,
  failureModeNote,
  checkRows,
  checkText,
  slsCheckRows,
  slsReasonText,
  slsRowTypeLabel,
  directionLabel,
  directionFromTheta,
  analysisLabel,
  sectionTypeLabel,
  lawLabel,
  compressionEdgeLabel,
  analysisBlock,
  failureState,
  failureStateIsAtNEd,
  headlineUtilisation,
  momentCapacity,
  allCombinations,
  governingCombo,
  comboLabel,
  shearGoverningCombo,
  shearHeadlineUtilisation,
  SHEAR_UTILISATION_LABEL,
  shearGoverningModeLabel,
} from './results.js';

/**
 * Trykkflaten på A4 med margene i `print.css`: 210 − 20 − 16 = 174 mm.
 * Figurene får nøyaktig dette, slik at de fyller spalta uten å stikke ut.
 */
export const REPORT_FIGURE_WIDTH_MM = 174;

/** Utskriftsroten i `index.html`. Direkte barn av `<body>` — se `print.css`. */
export const PRINT_ROOT_ID = 'cscPrintRoot';

/** Overlegget rapporten bygges i på skjerm. */
export const OVERLAY_SELECTOR = '#report-overlay .report-content';

/* ------------------------------------------------------------------ *
 * Småting
 * ------------------------------------------------------------------ */

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Nøkkel/verdi-tabell. `rows` er `[label, verdi]`, og verdien er ALLEREDE
 * formatert og escapet.
 *
 * Høyrestilling avgjøres av innholdet, ikke av kallstedet: tall og tankestrek
 * står i en tallkolonne, tekst som «Sagging — compression at the top face»
 * gjør ikke. Én regel her slår tjue `align`-argumenter som noen før eller
 * siden glemmer.
 */
function isNumericCell(value) {
  const v = String(value).trim();
  return v === DASH || /^[-–]?\d/.test(v);
}

function kvTable(rows) {
  const body = rows
    .filter(Boolean)
    .map(([label, value]) => {
      const cls = isNumericCell(value) ? ' class="num"' : '';
      return `<tr><th>${esc(label)}</th><td${cls}>${value}</td></tr>`;
    })
    .join('');
  return `<table class="kv"><tbody>${body}</tbody></table>`;
}

/** Vanlig tabell med overskriftsrad. Cellene er ferdig formatert og escapet. */
function table(headers, rows, opts = {}) {
  const num = opts.num || [];
  const th = headers
    .map((h, i) => `<th${num.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`)
    .join('');
  const tr = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td${num.includes(i) ? ' class="num"' : ''}>${c}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/**
 * `eps_cu2` -> `ε_cu2`. Navnet KOMMER fra motoren (`materials.eps_cu_name`) og
 * er lovavhengig, så det kan ikke skrives som en fast streng — men det skal
 * heller ikke stå som Python-feltnavn på et A4-ark.
 */
function strainSymbol(name, fallback = 'eps_cu') {
  return `ε_${String(name || fallback).replace(/^eps_/, '')}`;
}

/** To blokker side om side. Er den ene tom, får den andre full bredde. */
function twoCol(a, b) {
  if (!a || !a.trim()) return b || '';
  if (!b || !b.trim()) return a;
  return `<div class="two-col atomic">${a}${b}</div>`;
}

/**
 * Kapittelramme. `data-sec` er kapittelnummeret, og den er der FOR TESTEN:
 * rekkefølgen kan påstås uten å parse overskriftstekst, som ellers ville låst
 * testen til ordlyden.
 */
function chapter(nr, title, body, cls = '') {
  return `<section class="chapter ${cls}" data-sec="${nr}">
    <h3>${nr}. ${esc(title)}</h3>
    ${body}
  </section>`;
}

/* ------------------------------------------------------------------ *
 * Kildevalg: resultatet vinner, tilstanden er reserven
 * ------------------------------------------------------------------ */

/**
 * `section_props` fra motoren når den har kjørt, ellers `derived(state)`.
 * Feltnavnene er identiske med vilje (`section.js` sin hodekommentar), så
 * resten av rapporten slipper å vite hvilken kilde den leser fra.
 *
 * LESER `result` UANSETT `ok` (endringsrunde 2, §4.4): et `{ok:false}`-svar
 * bærer nå ekte `section_props` (geometrien og materialene ble regnet FØR
 * aksialsjekken felte alle kombinasjonene), og et resultat som finnes skal
 * ikke behandles som om det var tomt.
 */
function propsOf(state, result) {
  if (result && result.section_props) return result.section_props;
  try {
    return derived(state || {});
  } catch {
    return {};
  }
}

/** Samme mønster for materialene. */
function materialsOf(state, result) {
  if (result && result.materials) return result.materials;
  try {
    return derivedMaterials(state || {});
  } catch {
    return {};
  }
}

/**
 * Retningen motoren faktisk regnet med, ellers den den aktive kombinasjonen
 * ville gitt.
 *
 * ENDRINGSRUNDE 4 §1.2/§7: `state.direction` finnes ikke lenger — retningen
 * ER fortegnet på `M_Ed`. Reserven leser derfor den aktive kombinasjonens
 * `M_Ed` gjennom `thetaFor` (samme regel som `section.js:activeComboTheta`),
 * IKKE `state.direction`: det feltet er alltid `undefined` nå, og
 * `thetaFor(undefined)` ville stille gitt θ = 0 for ALT — inkludert et snitt
 * hvor den aktive raden faktisk er et støttemoment.
 */
function thetaOf(state, result) {
  const t = toNum(result?.meta?.theta);
  if (t !== null) return t;
  try {
    return thetaFor(activeComboOf(state)?.M_Ed);
  } catch {
    return 0;
  }
}

/** Den kombinasjonen `state.activeCombo` peker på, eller den første. Reserven
 *  for lastvisningen FØR noen kjøring har funnet en governing kombinasjon. */
function activeComboOf(state) {
  const combos = Array.isArray(state?.combos) ? state.combos : [];
  if (!combos.length) return null;
  return combos.find((c) => c.id === state?.activeCombo) || combos[0];
}

/* ------------------------------------------------------------------ *
 * 1. Topptekst
 * ------------------------------------------------------------------ */

function headBlock(state) {
  const doc = state?.doc || {};
  const title = String(doc.title || '').trim() || 'Concrete cross-section — ULS check';
  return `<div class="print-head">
    <b>${esc(title)}</b>
    <span>${esc(MODULE_NAME)} v${esc(MODULE_VERSION)}</span>
  </div>`;
}

function docBlock(state, result) {
  const doc = state?.doc || {};
  const rows = [
    ['Project', esc(String(doc.project || '').trim() || DASH)],
    ['Prepared by', esc(String(doc.author || '').trim() || DASH)],
    ['Date', esc(String(doc.date || '').trim() || today())],
    ['Analysis', esc(analysisLabel(result?.analysis || state?.analysis))],
  ];
  const note = String(doc.note || '').trim();
  const noteHtml = note
    ? `<p class="note whitespace-pre-wrap">${esc(note)}</p>`
    : '';
  return chapter(1, 'Documentation', kvTable(rows) + noteHtml, 'atomic keep-with-next');
}

/* ------------------------------------------------------------------ *
 * 2. Tverrsnitt — figur FØRST
 * ------------------------------------------------------------------ */

/** Figuren, eller en ærlig plassholder. En tom <figure> ser ut som en feil i CSS. */
function figure(state, overlay, caption) {
  let svg = '';
  try {
    svg = drawSection(state || {}, {
      width: REPORT_FIGURE_WIDTH_MM,
      unit: 'mm',
      theme: 'print',
      showDims: true,
      showLabels: true,
      overlay: overlay || null,
    });
  } catch {
    svg = '';
  }
  if (!svg) {
    return `<figure class="atomic"><p class="muted">The cross-section could not be drawn
      with the input given.</p></figure>`;
  }
  const cap = caption ? `<figcaption>${esc(caption)}</figcaption>` : '';
  return `<figure class="atomic report-figure-wrap">${svg}${cap}</figure>`;
}

/**
 * `theta` kommer INN fra `sectionChapter` (samme kilde som resten av
 * rapporten bruker, `thetaOf`) — ikke fra `state?.direction`, som ikke
 * finnes lenger (endringsrunde 4 §7). Retningen ER fortegnet på den aktive
 * kombinasjonens `M_Ed`.
 */
function geometryTable(state, props, theta) {
  const type = state?.sectionType;
  const b = toNum(props.b_t) ?? sectionWidth(state || {});
  const h = sectionHeight(state || {});
  return kvTable([
    ['Section type', esc(sectionTypeLabel(type))],
    [type === 'slab' ? 'Width b [mm] (per metre)' : 'Width b [mm]', fmtLength(b, 0)],
    ['Height h [mm]', fmtLength(h, 0)],
    ['Concrete area A_c [mm²]', fmtArea(props.Ag)],
    ['Moment direction', esc(directionLabel(directionFromTheta(theta)))],
  ]);
}

/**
 * Materialtabellen. Tøyningsnavnene kommer fra `materials.eps_c_name` /
 * `eps_cu_name` og ALDRI fra en fast streng: grensene er lovavhengige, og
 * «ε_cu2 = 0,0035» trykt for et bilineært diagram er riktig tall med feil
 * merkelapp — den feilen finnes det ingen måte å oppdage på i etterkant.
 */
function materialTable(m) {
  return kvTable([
    ['f_ck [MPa]', fmtStress(m.fck)],
    ['α_cc [–]', fmtNumber(m.alpha_cc, 2)],
    ['γ_c [–]', fmtNumber(m.gamma_c, 2)],
    ['f_cd = α_cc·f_ck/γ_c [MPa]', fmtStress(m.fcd, 2)],
    ['f_ctm [MPa]', fmtStress(m.fctm, 2)],
    ['E_cm [MPa]', fmtNumber(m.Ecm, 0)],
    ['Concrete stress–strain law', esc(lawLabel(m.law_concrete))],
    [`${strainSymbol(m.eps_c_name, 'eps_c')} [‰]`, fmtStrainPermille(m.eps_c)],
    [`${strainSymbol(m.eps_cu_name, 'eps_cu')} [‰]`, fmtStrainPermille(m.eps_cu)],
    ['f_yk [MPa]', fmtStress(m.fyk)],
    ['k = f_tk/f_yk [–]', fmtNumber(m.k, 2)],
    ['f_tk [MPa]', fmtStress(m.ftk)],
    ['E_s [MPa]', fmtNumber(m.Es, 0)],
    ['γ_s [–]', fmtNumber(m.gamma_s, 2)],
    ['f_yd [MPa]', fmtStress(m.fyd, 1)],
    ['f_td [MPa]', fmtStress(m.ftd, 1)],
    ['Reinforcement stress–strain law', esc(lawLabel(m.law_steel))],
    ['ε_yd [‰]', fmtStrainPermille(m.eps_yd)],
    ['ε_uk [‰]', fmtStrainPermille(m.eps_uk, 1)],
    ['γ_ε [–]', fmtNumber(m.gamma_eps, 2)],
    ['ε_ud = γ_ε·ε_uk [‰]', fmtStrainPermille(m.eps_ud, 1)],
  ]);
}

function sectionChapter(state, result, props, materials) {
  const theta = thetaOf(state, result);
  const body =
    figure(state, null, 'Cross-section with reinforcement, as entered.') +
    twoCol(
      `<div><h4>Geometry</h4>${geometryTable(state, props, theta)}</div>`,
      `<div><h4>Materials</h4>${materialTable(materials)}</div>`
    );
  return chapter(2, 'Cross-section and materials', body);
}

/* ------------------------------------------------------------------ *
 * 3. Armering
 * ------------------------------------------------------------------ */

/**
 * Lagtabellen pluss sumlinja.
 *
 * `d` per lag er lagets EGEN avstand fra trykkanten (`layerSummary`), ikke
 * snittets `d_eff`. Et trykkarmeringslag skal vise sin faktiske avstand, ikke
 * arve strekkarmeringens.
 *
 * DE TRE d-ENE STÅR ALLE TRE, med vilje. `d_eff` er EC2 sin — strekkarmeringen
 * alene — og er den `A_s,min` regnes med. `d_eff_all` er arealvektet over alle
 * lag. Valget mellom dem er en faglig vurdering motoren har tatt på grunnlag
 * av tøyningsplanet ved brudd, og et valg som ikke står i rapporten er et valg
 * leseren ikke kan etterprøve. For referansebjelken med trykkarmering skiller
 * de to seg med nesten 100 mm.
 */
function rebarChapter(state, result, props) {
  const layers = state?.layers || [];
  const perMeter = state?.sectionType === 'slab' ? ' per metre' : '';
  let summary = [];
  try {
    summary = layerSummary(state || {});
  } catch {
    summary = [];
  }
  const byId = new Map(summary.map((s) => [s.id, s]));

  const rows = layers.map((l, i) => {
    const s = byId.get(l.id) || {};
    return [
      esc(l.id || `L${i + 1}`),
      esc(layerLabel(l)),
      esc(l.edge === 'top' ? 'Top' : 'Bottom'),
      fmtLength(l.dc, 0),
      fmtArea(s.area),
      fmtLength(s.z, 1),
      fmtLength(s.d, 1),
    ];
  });

  const layerTable = rows.length
    ? table(
        ['Layer', 'Label', 'Edge', `d_c [mm]`, `A_s [mm²]${perMeter}`, 'z [mm]', 'd [mm]'],
        rows,
        { num: [3, 4, 5, 6] }
      )
    : '<p class="muted">No reinforcement layers entered.</p>';

  const dEff = toNum(props.d_eff);
  const dAll = toNum(props.d_eff_all);
  const asTension = toNum(props.As_tension);

  const totals = kvTable([
    [`ΣA_s [mm²]${perMeter}`, fmtArea(props.As_total)],
    [
      `A_s in tension [mm²]${perMeter}`,
      asTension === null ? DASH : fmtArea(asTension),
    ],
    ['d = d_eff, tension reinforcement alone [mm]', fmtLength(dEff, 1)],
    ['d_eff,all, area-weighted over all layers [mm]', dAll === null ? DASH : fmtLength(dAll, 1)],
    // ETIKETTRETTELSE (runde 6). Sto tidligere «ρ = ΣA_s/(b_t·d)», men tallet
    // motoren sender er `as_tension / (b · d_eff)` (`engine.py:1264`, med sin
    // egen fem linjers begrunnelse for at teller og nevner må gjelde SAMME
    // armering). For et dobbeltarmert snitt gjorde den gamle etiketten tallet
    // uetterprøvbart: leseren som regnet ΣA_s/(b·d) etter fikk et annet svar
    // enn det som sto, og hadde ingen måte å se hvem av dem som var feil.
    ['ρ_l = A_s,tension/(b_t·d_eff) [–]', fmtRatio(props.rho, 4)],
    [`A_s,min [mm²]${perMeter}`, fmtArea(props.As_min)],
    // M_cr står RETT VED A_s,min fordi A_s,min er EC2 9.2.1.1 sitt forenklede
    // surrogat for nettopp |M_Rd| ≥ M_cr (plan §1.5). Leseren skal kunne se
    // begge tallene samtidig: de er nesten ekvivalente der `d` er ekte, og
    // divergerer bare der `d` har degenerert — hvilket er nøyaktig tilfellet
    // der A_s,min består vakuøst. Per meter for plate, fordi W = b·h²/6 med
    // b = 1000 mm; notatet under om «reinforcement quantities» dekker ikke et
    // moment, så merkingen må stå i etiketten.
    [`M_cr = W·(f_ctm − N_Ed/A_c) [kNm]${perMeter}`, fmtMomentKNm(props.M_cr)],
    [`A_s,max [mm²]${perMeter}`, fmtArea(props.As_max)],
  ]);

  const note =
    `<p class="note">EC2 9.2.1.1 defines <b>d</b> as the distance from the compression ` +
    `face to the centroid of the <b>tension reinforcement</b>. That is <b>d_eff</b> ` +
    `above, and it is the one A_s,min = max(0.26·f_ctm/f_yk·b_t·d ; 0.0013·b_t·d) is ` +
    `calculated with. Which layers are in tension is decided by the strain plane at ` +
    `failure, not by the geometry — <b>d_eff,all</b> stands next to it precisely so the ` +
    `choice is visible.</p>` +
    // Runde 6 §1.3: fallbacken i `_effective_depth` er fjernet, så et snitt
    // uten armering i strekk gir `d_eff = null` i stedet for et oppdiktet
    // tall. Uten denne setningen ser en rad med «–» ut som en feil i
    // programmet framfor det den er: en opplysning om tverrsnittstilstanden.
    // `${DASH}` og ikke en hardkodet tankestrek: teksten MÅ vise det samme
    // tegnet tabellcellene faktisk får, ellers peker forklaringen på et
    // symbol som ikke finnes i tabellen over den.
    // Betinget av `d_eff === null` og ikke fast: `ρ_l` og `A_s,min` er BEGGE
    // avledet av `d_eff`, så de tre radene blir strek i samme øyeblikk og av
    // samme grunn. En note som sto der uansett ville forklart noe leseren ikke
    // ser, og lært ham å hoppe over notene.
    (dEff === null
      ? `<p class="note"><b>d_eff</b>, <b>ρ_l</b> and <b>A_s,min</b> read ` +
        `${DASH} because no reinforcement lies in the tension zone at failure. EC2 ` +
        `9.2.1.1 has no effective depth to build those figures from, and a number ` +
        `printed anyway would be invented. The brittle-failure check |M_Rd| ≥ M_cr ` +
        `in chapter 5 is the one that still applies to such a section.</p>`
      : '') +
    (state?.sectionType === 'slab'
      ? `<p class="note">All reinforcement quantities for the slab are <b>per metre width</b>.</p>`
      : '');

  return chapter(3, 'Reinforcement', layerTable + twoCol(totals, note));
}

/* ------------------------------------------------------------------ *
 * 4. Last og lastkombinasjoner
 * ------------------------------------------------------------------ */

/**
 * Tabellen over ALLE lastkombinasjonene analysen ble kjørt mot (endringsrunde
 * 2, §4.3, §10 B4 punkt 4).
 *
 * HVORFOR DENNE FINNES
 * Før kombinasjoner fantes ett eneste lasttilfelle, og «ved N_Ed = X kN» i
 * kapittel 5 var en fullstendig beskrivelse. Med ti kombinasjoner er den
 * samme setningen aktivt misvisende — den ser ut som om bare én last ble
 * kontrollert. Tabellen her viser dem ALLE, og hvilken (`governing`) som
 * styrer tallene i resten av rapporten.
 *
 * Kombinasjoner utenfor [N_min, N_max] (`within_limits: false`) stopper ikke
 * de andre (plan §4.4) og vises med egen status i stedet for oppdiktede tall.
 */
/**
 * `V_Ed`/η_V-kolonnene og markøren for skjær-dimensjonerende rad er nye
 * (endringsrunde 4 §4.2/§4.3). `shear_governing` er et EGET, uavhengig valg
 * fra `governing` (bøying) — en rad med stor `V_Ed` og lite `M_Ed` kan styre
 * skjær helt uavhengig av hvilken rad som styrer bøying, derfor en egen
 * `data-shear-governing`-markør i stedet for å gjenbruke `data-role`, som
 * alt betyr «denne raden styrer BØYING» (plan §5.2 sin advarsel om å ikke slå
 * sammen de to η-ene gjelder også hvilken RAD som fremheves).
 */
// STEG 2 — lesbar etikett for lastkombinasjonstypen. `undefined` (gamle
// resultatfixturer uten `type`-felt) gir DASH, ikke en gjettet type — feltet
// fantes ikke i den kjøringen, og skal ikke late som det gjorde.
const COMBO_TYPE_LABELS = Object.freeze({
  uls: 'ULS',
  characteristic: 'Characteristic',
  quasi_permanent: 'Quasi-permanent',
});

function combinationsBlock(result) {
  const combos = allCombinations(result);
  if (!combos.length) return '';
  const governingId = analysisBlock(result)?.governing;
  // I moment–krumning ER `governing` den AKTIVE raden — den kurven tilhører —
  // ikke raden med størst utnyttelse. Å trykke «Governing» på den ville vært
  // direkte feil: en annen rad kan ha mange ganger momentet og stå uten tall.
  const governingWord = result?.analysis === 'moment_curvature' ? 'Curve row' : 'Governing';
  const shearGoverningId = analysisBlock(result)?.shear_governing;
  const hasShearGoverning = shearGoverningId !== null && shearGoverningId !== undefined;
  // STEG 2, G6: raden skal ALDRI forsvinne fra tabellen — den står med «Not
  // checked» i stedet. `some(...)` alene, uten filter, dekker derfor alle rader.
  const hasUnchecked = combos.some((c) => c.checked === false);
  const rows = combos
    .map((c) => {
      const isGoverning = governingId !== null && governingId !== undefined && c.id === governingId;
      const isShearGoverning = hasShearGoverning && c.id === shearGoverningId;
      // G3: `c.checked === false`, ALDRI `!c.checked` — de seks committede
      // `result-*.json`-fixturene har ikke feltet, og `undefined` skal gi
      // NØYAKTIG dagens oppførsel (planens felle 13).
      const notChecked = c.checked === false;
      const outOfRange = !notChecked && c.within_limits === false;
      // `flexure_solved === false` med `within_limits` i behold betyr at
      // moment–krumning tok raden med BARE for skjærets skyld: kurven hører til
      // den aktive kombinasjonen, og de øvrige radene er ikke bøyeregnet.
      // Uten denne cellen sto slike rader HELT tomme, med «–» under η, rett ved
      // siden av en rad merket «Governing» som kunne ha en tjuendedel av
      // momentet. Leseren hadde da ingen måte å se at tallet manglet med vilje.
      const shearOnly = !notChecked && !outOfRange && c.flexure_solved === false;
      const dir = directionFromTheta(c.theta);
      const label = esc(comboLabel(c));
      const typeLabel = c.type in COMBO_TYPE_LABELS ? COMBO_TYPE_LABELS[c.type] : DASH;
      const status = notChecked
        ? 'Not checked'
        : outOfRange
          ? 'Outside [N_min, N_max]'
          : shearOnly
            ? 'Shear only'
            : isGoverning
              ? governingWord
              : '';
      const shear = c.shear;
      const shearEta = shear && shear.evaluated ? toNum(shear.utilisation) : null;
      const shearCell = shearEta === null ? DASH : fmtRatio(shearEta, 3);
      return `<tr${isGoverning ? ' data-role="combo-governing"' : ''}${
        isShearGoverning ? ' data-shear-governing="true"' : ''
      }>` +
        `<td>${isGoverning ? `<b>${label}</b>` : label}</td>` +
        `<td>${esc(typeLabel)}</td>` +
        `<td class="num">${fmtForceKN(c.N_Ed)}</td>` +
        `<td class="num">${fmtMomentKNm(c.M_Ed)}</td>` +
        `<td>${esc(dir ? directionLabel(dir) : DASH)}</td>` +
        `<td class="num">${notChecked || outOfRange || shearOnly ? DASH : fmtRatio(c.utilisation, 3)}</td>` +
        `<td class="num">${notChecked ? DASH : fmtForceKN(c.V_Ed)}</td>` +
        `<td class="num">${notChecked ? DASH : (isShearGoverning ? `<b>${shearCell}</b>` : shearCell)}</td>` +
        `<td>${esc(status)}</td>` +
        `</tr>`;
    })
    .join('');
  const mcNote = result?.analysis === 'moment_curvature' && combos.some((c) => c.flexure_solved === false && c.checked !== false)
    ? `<p class="note">Moment–curvature solves the bending state for the active load ` +
      `combination only — the curve belongs to that row. The other rows are carried ` +
      `along for the shear check, and are marked <b>Shear only</b>. Run the bending ` +
      `resistance or the N–M interaction domain to get η for every row.</p>`
    : '';
  const shearNote = hasShearGoverning
    ? `<p class="note">Bold η_V marks the load combination governing shear. It may be a ` +
      `different row than the one governing bending (above): a large V_Ed with a small ` +
      `M_Ed can control shear without ever being close to controlling bending.</p>`
    : '';
  // G5: fotnote når minst én rad er ukontrollert for BRUDD (ikke type ULS).
  // RETTET (spec §6.3): påstanden var at SLS ikke fantes i det hele tatt —
  // det er ikke lenger sant (spec-kapittelet §4). Setningen sier nå bare det
  // som ER sant: raden bærer ingen bruddkontroll, og en eventuell rissvidde-
  // eller spenningskontroll for den står i sin egen seksjon (kapittel 6),
  // ikke i denne tabellen. Plassert ved siden av `mcNote`/`shearNote` —
  // samme mønster, samme sted.
  const slsNote = hasUnchecked
    ? `<p class="note">Rows that are not of type ULS carry no resistance check here. Any ` +
      `serviceability row among them is still evaluated, in its own Serviceability chapter.</p>`
    : '';
  return (
    `<h4>Load combinations</h4>` +
    `<table><thead><tr><th>Combination</th><th>Type</th><th class="num">N_Ed [kN]</th>` +
    `<th class="num">M_Ed [kNm]</th><th>Direction</th><th class="num">η [–]</th>` +
    `<th class="num">V_Ed [kN]</th><th class="num">η_V [–]</th>` +
    `<th>Status</th></tr></thead><tbody>${rows}</tbody></table>${mcNote}${shearNote}${slsNote}`
  );
}

/**
 * `N_Ed` er fortegnsatt (trykk negativ). `M_Ed` er nå OGSÅ fortegnsatt,
 * `structuralcodes` sin egen konvensjon (endringsrunde 4 §1.2): sagging er
 * NEGATIV, støttemoment er POSITIV. Det er MOTSATT av norsk praksis, og
 * derfor står konvensjonssetningen (§1.7) rett under tabellen — ikke bare i
 * UI-et — og «Direction» er avledet fra fortegnet, ikke fra et eget felt.
 *
 * RESERVEN (endringsrunde 2, §4.7) er nå den AKTIVE kombinasjonen i
 * `state.combos`, ikke `state.loads` — det feltet finnes ikke lenger.
 */
function loadsChapter(state, result, props) {
  const blk = analysisBlock(result);
  const combo = activeComboOf(state);
  const nEd = toNum(blk?.N_Ed) ?? (combo && toNum(combo.N_Ed) !== null
    ? toNum(combo.N_Ed) * 1e3
    : null);
  const mEd = toNum(blk?.M_Ed) ?? (combo && toNum(combo.M_Ed) !== null
    ? toNum(combo.M_Ed) * 1e6
    : null);
  // `null` betyr «ingen last kjent ennå», og skal IKKE lese som sagging
  // (θ = 0 er `thetaFor`s fallback for et ikke-tall) — se `directionLabel(null) -> DASH`.
  const dir = mEd === null ? null : directionFromTheta(thetaFor(mEd));

  const rows = [
    ['N_Ed [kN] (compression negative)', fmtForceKN(nEd)],
    ['M_Ed [kNm] (sagging negative — see note below)', fmtMomentKNm(mEd)],
    ['Direction', esc(directionLabel(dir))],
    ['N_min [kN]', fmtForceKN(props.n_min ?? props.N_min)],
    ['N_max [kN]', fmtForceKN(props.n_max ?? props.N_max)],
  ];
  const note =
    `<p class="note">Sign convention follows fib <code>structuralcodes</code>: sagging ` +
    `(compression at the top face) is negative.</p>` +
    `<p class="note">The axial range [N_min, N_max] is the cross-section's pure ` +
    `compression and tension capacity. If N_Ed falls outside it, there is no bending ` +
    `resistance to check against, and the engine responds with ` +
    `<code>axial_out_of_range</code> before anything is calculated.</p>`;
  return chapter(4, 'Loads and combinations', kvTable(rows) + combinationsBlock(result) + note);
}

/* ------------------------------------------------------------------ *
 * 5. Resultat
 * ------------------------------------------------------------------ */

function strainTable(fs, atNEd) {
  const layers = Array.isArray(fs?.layers) ? fs.layers : [];
  if (!layers.length) return '';
  const rows = layers.map((l) => [
    esc(l.id || DASH),
    fmtLength(l.z, 1),
    fmtStrainPermille(l.eps),
    fmtStress(l.sigma, 1),
    esc(l.compression ? 'Compression' : 'Tension'),
    l.utilisation === undefined || l.utilisation === null ? DASH : fmtRatio(l.utilisation, 3),
  ]);
  return (
    `<h4>Strains and stresses per reinforcement layer${atNEd ? ' at N_Ed' : ''}</h4>` +
    table(['Layer', 'z [mm]', 'ε [‰]', 'σ [MPa]', 'State', 'σ/f_yd'], rows, {
      num: [1, 2, 3, 5],
    })
  );
}

/**
 * Skjærdelen av resultatkapitlet (endringsrunde 4 §4.2/§4.3).
 *
 * Viser den SKJÆR-dimensjonerende kombinasjonen, som kan være en helt annen
 * rad enn den som styrer bøying (`gCombo` over) — en rad med stor `V_Ed` og
 * lite `M_Ed` styrer skjær uten å være i nærheten av å styre bøying.
 *
 * `V_Rd,c` LEGGES ALDRI TIL `V_Rd,s` (EC2 6.2.3(2)) — `governing_mode` velger
 * hvilket tall som ER `V_Rd`, det summeres ikke. Notatet under tabellen sier
 * dette eksplisitt, fordi det er akkurat den typen regel en leser ellers ville
 * gjettet feil på ved synet av tre V_Rd-tall ved siden av hverandre.
 *
 * INGEN skjærdata i det hele tatt (eldre fixtur uten `section.shear` i
 * payloaden, eller ingen kombinasjon kunne få skjær evaluert) gir én ærlig
 * setning, ikke en tom tabell eller stillhet.
 */
function shearSection(result) {
  if (!analysisBlock(result)) return '';
  const combo = shearGoverningCombo(result);
  if (!combo || !combo.shear || !combo.shear.evaluated) {
    return (
      `<h4>Shear</h4><p class="muted">No shear capacity could be evaluated for any load ` +
      `combination.</p>`
    );
  }
  const s = combo.shear;
  const rows = [
    ['Governing load combination', esc(comboLabel(combo))],
    ['V_Ed [kN]', fmtForceKN(s.V_Ed)],
    ['V_Rd [kN]', fmtForceKN(s.V_Rd)],
    ['V_Rd,c [kN]', fmtForceKN(s.V_Rd_c)],
    ['V_Rd,s [kN]', fmtForceKN(s.V_Rd_s)],
    ['V_Rd,max [kN]', fmtForceKN(s.V_Rd_max)],
    ['Governing mode', esc(shearGoverningModeLabel(s.governing_mode))],
    [`${esc(SHEAR_UTILISATION_LABEL)} [–]`, fmtRatio(s.utilisation, 3)],
    ['A_sl [mm²]', fmtArea(s.Asl)],
    ['d [mm]', fmtLength(s.d, 1)],
    ['b_w [mm]', fmtLength(s.bw, 0)],
    ['z = z_factor·d [mm]', fmtLength(s.z, 1)],
    ['A_sw/s [mm²/mm]', s.asw_s === null || s.asw_s === undefined ? DASH : fmtNumber(s.asw_s, 4)],
    [
      'A_sw/s,min [mm²/mm]',
      s.asw_s_min === null || s.asw_s_min === undefined ? DASH : fmtNumber(s.asw_s_min, 4),
    ],
    [
      'A_sw/s,required [mm²/mm]',
      s.asw_s_required === null || s.asw_s_required === undefined
        ? DASH
        : fmtNumber(s.asw_s_required, 4),
    ],
    ['s_l,max [mm]', fmtLength(s.sl_max, 0)],
    ['s_t,max [mm]', fmtLength(s.st_max, 0)],
  ];
  const note =
    `<p class="note">V_Rd,c is never added to V_Rd,s (EC2 6.2.3(2)); the governing mode ` +
    `above decides whether V_Rd,c (no stirrups needed) or min(V_Rd,s, V_Rd,max) applies. ` +
    `V_Rd,c is reported regardless — it is the number that says whether stirrups were ` +
    `needed at all.</p>`;
  return `<h4>Shear</h4>${kvTable(rows)}${note}`;
}

/**
 * Resultatboksen.
 *
 * `eps_c_top` heter «top» i kontrakten, men ER tøyningen ved TRYKKANTEN for
 * den analyserte retningen — for støttemoment (θ = π) altså underkanten.
 * Merkelappen hentes derfor fra `compressionEdgeLabel(theta)` og skrives
 * aldri som «top face» rett ut.
 *
 * HVILKEN KOMBINASJON (endringsrunde 2, §10 B4 punkt 4)
 * Med flere lastkombinasjoner er «ved N_Ed = X kN» alene ikke lenger nok —
 * kapitlet sier derfor uttrykkelig hvilken kombinasjon (`governingCombo`)
 * tallene under gjelder, og henviser til kombinasjonstabellen i kapittel 4
 * for de øvrige.
 */
function resultChapter(state, result) {
  if (!result) {
    return chapter(
      5,
      'Result',
      '<p class="muted">No calculation has been run. The capacity figures are filled ' +
        'in once the calculation has been carried out.</p>',
      'atomic'
    );
  }
  if (!result.ok) {
    const e = describeError(result.error || {});
    return chapter(
      5,
      'Result',
      `<p class="warn"><b>${esc(e.severityLabel)}:</b> ${esc(e.message)}</p>` +
        (e.hasDetail ? `<p class="muted text-xs">${esc(e.detail)}</p>` : ''),
      'atomic'
    );
  }

  const blk = analysisBlock(result) || {};
  // IKKE `result.bending`: `nm_domain` bærer de samme åtte feltene for
  // tilstanden ved N_Ed. Se `failureState()` i `results.js`.
  const fs = failureState(result);
  const atNEd = failureStateIsAtNEd(result);
  const theta = thetaOf(state, result);
  const eta = headlineUtilisation(result);
  const status = utilisationStatus(eta);
  const mRd = momentCapacity(result);
  const combos = allCombinations(result);
  const gCombo = governingCombo(result);

  /**
   * Skjærmerket (endringsrunde 4 §4.3). ETT eget tall, ALDRI slått sammen med
   * `eta`/`HEADLINE_UTILISATION_LABEL` over — hele poenget med at terskelen og
   * etiketten bor ETT sted (`results.js`) er at samme snitt aldri viser to
   * ulike η under samme navn. Vises bare når NOEN kombinasjon faktisk fikk
   * skjær evaluert; en eldre fixtur uten `section.shear` skal ikke vise et
   * oppdiktet merke.
   */
  const shearCombo = shearGoverningCombo(result);
  const etaShear = shearHeadlineUtilisation(result);
  const shearStatus = utilisationStatus(etaShear);
  const shearBadge = shearCombo
    ? `<div class="result-main result-shear" data-level="${esc(shearStatus.level)}">` +
      `<span class="result-label">${esc(SHEAR_UTILISATION_LABEL)}</span>` +
      `<span class="result-value">V ${fmtRatio(etaShear, 2)}</span></div>`
    : '';

  const head =
    `<div class="result-box atomic" data-level="${esc(status.level)}">` +
    `<div class="result-main"><span class="result-label">M_Rd</span>` +
    `<span class="result-value">${fmtMomentKNm(mRd)} kNm${
      state?.sectionType === 'slab' ? '/m' : ''
    }</span></div>` +
    `<div class="result-main"><span class="result-label">${esc(
      HEADLINE_UTILISATION_LABEL
    )}</span>` +
    `<span class="result-value">${fmtRatio(eta, 3)}</span></div>` +
    shearBadge +
    `<div class="result-status">${esc(status.label)}</div>` +
    `</div>`;

  const rows = [
    ['M_Rd [kNm]', fmtMomentKNm(mRd)],
    ['M_Ed [kNm]', fmtMomentKNm(blk.M_Ed)],
    [`${HEADLINE_UTILISATION_LABEL} [–]`, fmtRatio(eta, 3)],
    ['Utilisation [%]', fmtPercent(eta, 1)],
    combos.length
      ? [
          'Governing load combination',
          gCombo
            ? `${esc(comboLabel(gCombo))} (governing of ${combos.length})`
            : `None within [N_min, N_max] (of ${combos.length})`,
        ]
      : null,
  ];
  if (fs) {
    const at = atNEd ? ' at N_Ed' : '';
    rows.push(
      [`Compression zone depth x [mm]${at}`, fmtLength(fs.x, 1)],
      ['x/d [–]', fmtRatio(fs.x_over_d, 3)],
      [`ε_c at ${compressionEdgeLabel(theta)} [‰]`, fmtStrainPermille(fs.eps_c_top)],
      ['ε_s,max [‰]', fmtStrainPermille(fs.eps_s_max)],
      ['ε_a at the centroid [‰]', fmtStrainPermille(fs.eps_a)],
      ['κ_y [10⁻⁶/mm]', fmtCurvature(fs.chi_y)],
      ['Failure mode', esc(failureModeLabel(fs.failure_mode))]
    );
  }
  const mc = result.moment_curvature;
  if (mc) {
    rows.push(
      ['Points on the M–κ curve', fmtNumber((mc.kappa || []).length, 0)],
      [
        'Yield point (index)',
        mc.yield_index === null || mc.yield_index === undefined
          ? DASH
          : fmtNumber(mc.yield_index, 0),
      ],
      ['Curve truncated', mc.truncated ? 'Yes' : 'No']
    );
  }
  const dom = result.nm_domain;
  if (dom) {
    /**
     * INGEN `Math.abs()` PÅ `dom.M_Ed` HER (endringsrunde 4 §5.2).
     *
     * `dom.M_Ed` er nå RÅTT — fortegnet ER retningen (§1.4). `radialUtilisation`
     * regner en lastvei fra origo gjennom PUNKTET (N_Ed, M_Ed) til der den
     * krysser omhyllingen, og omhyllingen selv er nå rå (D5, §5.2). Tas `abs`
     * her, havner et støttemoment-punkt på FELTGRENEN i stedet for sin egen —
     * målt på (−500 kN, −150 kNm): η = 3,67 i stedet for riktig 0,413. Dette
     * ER «den dyrekjøpte lærdommen» `charts.js` sin hodekommentar viser til.
     */
    const rad = radialUtilisation(
      dom,
      (toNum(dom.N_Ed) || 0) / 1e3,
      (toNum(dom.M_Ed) || 0) / 1e6
    );
    /*
     * λ ER UTNYTTELSEN, IKKE FAKTOREN. `radialUtilisation` returnerer
     * `lambda` = faktoren som skalerer lasten ut til omhyllingen (1,242 =
     * 24 % reserve) og `eta` = 1/λ = 0,805. Rapporten skrev før `lambda`
     * under merkelappen `RADIAL_UTILISATION_LABEL` mens `ui.js` skrev `eta`
     * under NØYAKTIG samme merkelapp — «λ (load path — secondary)» betydde
     * da 1,242 på papiret og 0,805 på skjermen. En utnyttelse er et tall som
     * skal være ≤ 1 når det holder, så λ er `eta`, og faktoren får sin egen
     * rad med sitt eget navn.
     */
    rows.push(
      ['Points on the envelope', fmtNumber((dom.n || []).length, 0)],
      [`${RADIAL_UTILISATION_LABEL} [–]`, rad.eta ? fmtRatio(rad.eta, 3) : DASH],
      [
        'Load factor to the envelope [–]',
        Number.isFinite(rad.lambda) ? fmtRatio(rad.lambda, 3) : DASH,
      ]
    );
  }

  const xNote =
    fs && toNum(fs.x) === null
      ? `<p class="note">The compression zone depth is not given: the neutral axis ` +
        `lies more than 10·h from the centroid, i.e. practically at infinity. This ` +
        `happens near pure compression, where a finite number there would be ` +
        `meaningless.</p>`
      : '';

  /**
   * Uten denne merknaden leses tøyningsplanet som om det gjaldt omhyllingen.
   * Det gjør det ikke: de åtte feltene beskriver ÉN tilstand — den ved N_Ed —
   * mens resten av kapitlet handler om 69 andre punkter.
   */
  const atNEdNote = atNEd
    ? `<p class="note">Compression zone depth, strains and failure mode above are for ` +
      `the state <b>at N_Ed = ${fmtForceKN(blk.N_Ed)} kN` +
      `${gCombo ? ` (load combination ${esc(comboLabel(gCombo))})` : ''}</b> — that is, ` +
      `the one point the load lies on, not an arbitrary point on the envelope. It is ` +
      `the same section and the same strain plane a pure bending calculation at this ` +
      `axial force would give.</p>`
    : '';

  const radNote = dom
    ? `<p class="note">The headline figure is the <b>vertical</b> utilisation ` +
      `${esc(HEADLINE_UTILISATION_LABEL)}, which holds N_Ed fixed. The radial λ above ` +
      `follows a <b>load path</b> where N and M grow together, and is a secondary ` +
      `figure — the two answer different questions and should not be compared.</p>`
    : '';

  const checks = table(
    ['Check', 'Status'],
    checkRows(result.checks || {}).map((c) => [esc(c.label), esc(c.text)])
  );

  const modeNote = fs && failureModeNote(fs.failure_mode)
    ? `<p class="note">${esc(failureModeNote(fs.failure_mode))}</p>`
    : '';

  return chapter(
    5,
    'Result',
    head +
      twoCol(
        `<div><h4>Capacity and strain plane</h4>${kvTable(rows)}</div>`,
        `<div><h4>Checks</h4>${checks}${modeNote}</div>`
      ) +
      strainTable(fs, atNEd) +
      xNote +
      atNEdNote +
      radNote +
      shearSection(result)
  );
}

/* ------------------------------------------------------------------ *
 * 6. Serviceability — EC2 7.2 og 7.3.4
 * global-devspecs/concrete_section_calculator-sls.md §4, §7
 * ------------------------------------------------------------------ */

/**
 * Kapitlet FINNES ALLTID (spec §7) — betinget nummerering («hopper kapittel 6
 * når det ikke er noe å si») er verre enn ett kapittel med én linje, fordi det
 * gjør nummereringen av 7 og 8 avhengig av inndata. Uten `result.sls` (ingen
 * SLS-inndata, eller ingen characteristic/quasi_permanent-rad, spec §4) sier
 * kapitlet det rett ut, ellers ingenting.
 *
 * LESES UANSETT `result.ok` (spec §6.2, samme regel som resultatkapitlet):
 * motoren setter `common['sls']` FØR aksialsjekken kan felle hele kjøringen,
 * så en `{ok:false}`-konvolutt kan bære en ferdig regnet rissvidde. Å gjemme
 * den bak en ULS-feilboks ville vært akkurat den tause skjulingen §6.2
 * advarer mot.
 */
function slsChapter(state, result) {
  const sls = result?.sls;
  if (!sls) {
    return chapter(
      6,
      'Serviceability',
      '<p class="muted">No serviceability combinations were given, so no serviceability ' +
        'check was carried out.</p>',
      'atomic'
    );
  }

  const rows = Array.isArray(sls.rows) ? sls.rows : [];
  const lim = sls.limits || {};

  // PARAMETERBLOKKEN (spec §7 punkt 1) bærer BARE de størrelsene som er de
  // SAMME for alle rader (`sls`-toppnivået). `k1`/`k2`/`k3`/`k4`, `h_c,eff` og
  // resten av 7.3.4-kjeden hører til ÉN rad (k2 avhenger av radens eps_r,
  // spec §3.4) og står derfor i radens egen tabell under, ikke her — to
  // tabeller som begge påsto å eie samme tall ville vært nøyaktig
  // to-kilder-feilen doktrinen navngir.
  const wMaxRow = sls.w_max === null || sls.w_max === undefined
    ? [`w_max`, `${DASH} (${esc(slsReasonText(sls.w_max_reason))})`]
    : [`w_max`, `${fmtLength(sls.w_max, 2)} mm (${esc(sls.w_max_source === 'manual' ? 'manual override' : 'from exposure class')})`];
  // HVOR φ KOM FRA, paa samme linje som tallet. Rapporten skal vaere
  // minimalistisk, men gjoere beregningen GJENSKAPBAR — og et kryptall uten
  // sine fire inndata kan ingen regne etter. Derfor ikke fire nye rader, men
  // én parentes: den koster én linje og gjoer kapittelet etterproevbart.
  const creep = resolveCreep(state);
  const sls_ = state.sls || {};
  const creepOrigin = creep.source === 'manual'
    ? 'manual override'
    : creep.source === 'derived'
      ? `EC2 Annex B: RH ${fmtNumber(sls_.RH, 0)} %, t_0 ${fmtNumber(sls_.t0, 0)} d, `
        + `t ${fmtNumber(sls_.t_life, 0)} d, cement ${esc(sls_.cement)}, `
        + `h_0 ${fmtLength(creep.chain?.h0, 0)} mm`
      : esc(slsReasonText(creep.reason));

  const paramRows = [
    ['φ_ef', `${fmtNumber(sls.phi_ef, 2)} (${creepOrigin})`],
    ['E_cm [MPa]', fmtStress(sls.Ecm, 0)],
    ['E_c,eff = E_cm/(1+φ_ef) [MPa]', fmtStress(sls.Ec_eff, 0)],
    ['α_e = E_s/E_cm — EC2 7.3.4(2), lign. 7.9', fmtRatio(sls.alpha_e, 4)],
    ['f_ct,eff = f_ctm [MPa]', fmtStress(sls.f_ct_eff, 2)],
    ['Exposure class', sls.exposure_class ? esc(sls.exposure_class) : DASH],
    wMaxRow,
    ['k_c,char — EC2 7.2(2)', fmtRatio(lim.sigma_c_char_factor, 2)],
    [
      'σ_c,char limit = k_c,char·f_ck [MPa]',
      lim.sigma_c_char_required === false
        ? `${DASH} (not required — the exposure class is outside XD/XF/XS)`
        : lim.sigma_c_char_required === null
          ? `${DASH} (no exposure class selected)`
          : fmtStress(lim.sigma_c_char, 1),
    ],
    ['k_c,qp — EC2 7.2(3)', fmtRatio(lim.sigma_c_qp_factor, 2)],
    ['σ_c,qp limit = k_c,qp·f_ck [MPa]', fmtStress(lim.sigma_c_qp, 1)],
    ['k_s,char — EC2 7.2(5)', fmtRatio(lim.sigma_s_char_factor, 2)],
    ['σ_s,char limit = k_s,char·f_yk [MPa]', fmtStress(lim.sigma_s_char, 1)],
  ];

  const checksTable = table(
    ['Check', 'Status'],
    slsCheckRows(sls).map((r) => [
      esc(r.label),
      r.applicable ? esc(r.text) : `<span class="muted">${esc(r.reason)}</span>`,
    ])
  );

  const modelNotes =
    '<p class="note">Linear-elastic analysis of the cracked section: concrete carries no ' +
    'tension, and the transformed area n·A_s sits on the gross rectangle without ' +
    'punching a hole for the bars — the same convention the ULS chapter uses with ' +
    'subtract_bar_area off, so reinforcement inside the compression zone is counted ' +
    'together with the concrete it displaces.</p>' +
    '<p class="note">A row is cracked when the tensile stress in the UNCRACKED, ' +
    'transformed section (always with E_cm, EC2 7.1(2)) exceeds f_ct,eff above. That is a ' +
    'different rectangle than the gross one the bending chapter\'s cracking moment M_cr ' +
    'uses, so the two criteria disagree in a band a few per cent above M_cr — this ' +
    'section never carries an M_cr figure at all, precisely so the two are never read as ' +
    'the same number.</p>' +
    '<p class="note">For a quasi-permanent row, the concrete compression stress is given ' +
    'TWICE, on purpose: <i>at first loading</i> (E_cm, no creep) is the one EC2 7.2(3) is ' +
    'checked against, because non-linear creep is governed by the stress when the load ' +
    'was first applied (EC2 3.1.4) — checking it against the already-crept stress would ' +
    'assume the answer. <i>Long-term</i> (with φ_ef) is the state the rest of that row\'s ' +
    'figures are computed on. The two are never the same figure and are never shown ' +
    'without their own label.</p>' +
    '<p class="note">This chapter\'s neutral axis depth x is a different quantity from the ' +
    'bending chapter\'s x at failure — the two strain planes answer different questions ' +
    'and should not be read side by side without their labels.</p>' +
    '<p class="note">Shrinkage plays no part: EC2 2004 7.3.4 carries no shrinkage term in ' +
    'its crack-width equations, so none is added here. w_k is a calculated check value ' +
    'against a limit, not a prediction of a width anyone could measure on the ' +
    'structure.</p>';

  const rowsHtml = rows.map((row) => slsRowSection(row)).join('');

  return chapter(
    6,
    'Serviceability',
    `<h4>Parameters</h4>${kvTable(paramRows)}` +
      rowsHtml +
      `<h4>Checks</h4>${checksTable}` +
      modelNotes
  );
}

/**
 * Én rads HELE kjede (spec §3.2, §7 punkt 2), ukomprimert — det er her
 * etterprøvbarheten bor, ikke på skjermen (§6.2). De tre grenvalgene
 * (`h_c,eff`, lign. 7.9, `s_r,max`) er markert med FET tekst, som spec §7
 * krever.
 */
function slsRowSection(row) {
  const typeLabel = slsRowTypeLabel(row.type);
  const head = `<h4>${esc(comboLabel(row))} — ${esc(typeLabel)}</h4>`;

  const top = [
    ['N_Ed [kN]', fmtForceKN(row.N_Ed)],
    ['M_Ed [kNm]', fmtMomentKNm(row.M_Ed)],
    ['σ_ct,uncracked [MPa] (EC2 7.1(2), always E_cm)', fmtStress(row.sigma_ct_uncracked, 3)],
    ['Cracked', row.cracked ? 'Yes' : 'No'],
    ['E_c used [MPa]', fmtStress(row.Ec_used, 0)],
    ['n_sec = E_s/E_c,used', fmtRatio(row.n_sec, 4)],
  ];

  if (!row.state) {
    return (
      head + kvTable(top) +
      `<p class="note">${esc(slsReasonText(row.state_reason))}</p>`
    );
  }

  const st = row.state;
  const stateRows = [
    ['x [mm]', fmtLength(st.x, 3)],
    ['z_na [mm]', fmtLength(st.z_na, 3)],
    ['ε_a [‰]', fmtStrainPermille(st.eps_a, 4)],
    ['χ_y [10⁻⁶/mm]', fmtCurvature(st.chi_y, 4)],
    ['σ_c at the compression face [MPa]', fmtStress(st.sigma_c, 4)],
    ['ε at the outer tension face [‰]', fmtStrainPermille(st.eps_1, 4)],
    ['ε at the opposite face [‰]', fmtStrainPermille(st.eps_2, 4)],
    ['σ_s,max, all layers [MPa]', fmtStress(st.sigma_s_max, 3)],
  ];

  const initialRows = row.type === 'quasi_permanent'
    ? [row.sigma_c_initial === null
      ? ['σ_c at first loading (E_cm) [MPa]', `${DASH} (${esc(slsReasonText(row.sigma_c_initial_reason))})`]
      : ['σ_c at first loading (E_cm) [MPa]', fmtStress(row.sigma_c_initial, 4)]]
    : [];

  let stressHtml = '';
  if (row.stress) {
    const s = row.stress;
    const stressRows = [
      [`σ_c checked (${s.sigma_c_checked === 'initial' ? 'at first loading' : 'this row\'s own state'}) [MPa]`, fmtStress(s.sigma_c, 4)],
      ['σ_c limit [MPa]', fmtStress(s.sigma_c_limit, 1)],
      ['σ_c utilisation [–]', fmtRatio(s.sigma_c_util, 4)],
      // Samme regel som i UI-et: er dommen `null` fordi grensa IKKE GJELDER
      // (EC2 7.2(2) utenfor XD/XF/XS), skal papiret si det og ikke bare sette
      // en tankestrek som ser ut som et tall som glapp. Rapporten skal kunne
      // leses alene, og en ubegrunnet tankestrek er ikke etterprøvbar.
      ['σ_c ≤ limit', s.sigma_c_ok === null && s.sigma_c_ok_reason
        ? `${DASH} (${esc(slsReasonText(s.sigma_c_ok_reason))})`
        : checkText(s.sigma_c_ok)],
      ['σ_s, largest of all layers [MPa]', fmtStress(s.sigma_s, 3)],
      ['σ_s limit [MPa]', fmtStress(s.sigma_s_limit, 1)],
      ['σ_s utilisation [–]', fmtRatio(s.sigma_s_util, 4)],
      ['σ_s ≤ limit', s.sigma_s_ok === null && s.sigma_s_ok_reason
        ? `${DASH} (${esc(slsReasonText(s.sigma_s_ok_reason))})`
        : checkText(s.sigma_s_ok)],
    ];
    stressHtml = `<h5>EC2 7.2 — stress limits</h5>${kvTable(stressRows)}`;
  }

  let crackHtml = '';
  if (row.crack) {
    const c = row.crack;
    const crackRows = [
      ['d — centroid of the tension layers [mm]', fmtLength(c.d, 2)],
      ['x [mm]', fmtLength(c.x, 3)],
      [
        // Grenvalget skal stå FREMHEVET (spec §3.3/§7 punkt 2) — i VERDIEN,
        // ikke i etiketten: `kvTable()` escaper etiketten (den er brukertekst
        // i andre rader), men lar verdien stå urørt fordi kalleren her
        // allerede har formatert og escapet den (samme kontrakt som resten
        // av rapporten bruker for `<b>`/`<i>` i tabellverdier).
        'h_c,eff [mm] (spec §3.3, EC2 7.3.2(3))',
        `<b>${fmtLength(c.h_c_eff, 3)}</b> — governing: <b>${esc(c.h_c_eff_governing)}</b> ` +
        `(2.5(h−d)=${fmtLength(c.h_c_eff_candidates?.['2.5(h-d)'], 1)}, ` +
        `(h−x)/3=${fmtLength(c.h_c_eff_candidates?.['(h-x)/3'], 1)}, h/2=${fmtLength(c.h_c_eff_candidates?.['h/2'], 1)})`,
      ],
      ['A_c,eff = b·h_c,eff [mm²]', fmtArea(c.A_c_eff, 0)],
      ['A_s,eff, tension layers inside A_c,eff [mm²]', fmtArea(c.A_s_eff, 1)],
      ['Layers inside A_c,eff', c.layers_in_zone?.length ? esc(c.layers_in_zone.join(', ')) : DASH],
      ['ρ_p,eff = A_s,eff/A_c,eff — EC2 7.10', fmtNumber(c.rho_p_eff, 6)],
      ['α_e — EC2 7.3.4(2), lign. 7.9 (E_cm, never E_c,eff)', fmtRatio(c.alpha_e, 4)],
      ['k_t — EC2 lign. 7.9 (0.4: this is the long-term, quasi-permanent case)', fmtNumber(c.k_t, 2)],
      ['σ_s, governing tension layer inside A_c,eff [MPa]', `${fmtStress(c.sigma_s, 3)} (${esc(c.sigma_s_layer)})`],
      [
        'ε_sm−ε_cm [–] — EC2 lign. 7.9',
        `<b>${fmtNumber(c.eps_sm_eps_cm, 6)}</b> — governing: <b>${esc(c.eps_governing)}</b> ` +
        `(main term=${fmtNumber(c.eps_equation, 6)}, floor 0.6σ_s/E_s=${fmtNumber(c.eps_floor, 6)})`,
      ],
      ['ε_1, outer tension face', fmtStrainPermille(c.eps_1, 4)],
      ['ε_2, opposite face', fmtStrainPermille(c.eps_2, 4)],
      ['ε_r = max(0,ε_2)/ε_1, into k2 — EC2 lign. 7.13', fmtRatio(c.eps_r, 4)],
      ['k1 (bond) / k2 / k3 / k4 — EC2 7.3.4', `${fmtNumber(c.k1, 3)} / ${fmtNumber(c.k2, 3)} / ${fmtNumber(c.k3, 3)} / ${fmtNumber(c.k4, 3)}`],
      ['c — cover to the outermost bar surface [mm]', fmtLength(c.c, 2)],
      ['φ_eq = Σn·φ²/Σn·φ — EC2 lign. 7.12 [mm]', fmtLength(c.phi_eq, 2)],
      ['Bar spacing s [mm]', fmtLength(c.bar_spacing, 1)],
      ['Spacing threshold 5(c+φ/2) [mm]', fmtLength(c.spacing_threshold, 1)],
      [
        's_r,max [mm] — EC2 lign. 7.11',
        `<b>${fmtLength(c.sr_max, 3)}</b> — governing: <b>${esc(c.sr_max_branch)}</b> ` +
        `(close=${fmtLength(c.sr_max_close, 2)}, far=${fmtLength(c.sr_max_far, 2)})`,
      ],
      ['w_k = s_r,max·(ε_sm−ε_cm) — EC2 lign. 7.8 [mm]', fmtNumber(c.w_k, 6)],
      ['w_max [mm]', c.w_max === null ? `${DASH} (${esc(slsReasonText(c.ok_reason))})` : fmtLength(c.w_max, 2)],
      ['Utilisation w_k/w_max [–]', fmtRatio(c.utilisation, 4)],
      ['w_k ≤ w_max', checkText(c.ok)],
    ];
    crackHtml = `<h5>EC2 7.3.4 — crack width</h5>${kvTable(crackRows)}`;
  } else if (row.crack_reason) {
    crackHtml = `<h5>EC2 7.3.4 — crack width</h5><p class="note">${esc(slsReasonText(row.crack_reason))}</p>`;
  }

  return head + kvTable(top) + kvTable(stateRows) + (initialRows.length ? kvTable(initialRows) : '') + stressHtml + crackHtml;
}

/* ------------------------------------------------------------------ *
 * 7. Plott
 * ------------------------------------------------------------------ */

/**
 * Resultatet tegnet. ETT kapittel 7, men ikke nødvendigvis én figur: kapitlet
 * trykker hvert plott resultatet bærer en blokk for (se `plotParts`). For de
 * tre enkeltanalysene er det fortsatt nøyaktig én — og da beholder kapitlet
 * sin egen, presise overskrift i stedet for et intetsigende «Plots».
 *
 * KAPITTELNUMMERET FLYTTET FRA 6 TIL 7 (spec §7): SLS-kapittelet («6 ·
 * Serviceability») er skjøvet inn FØR plottet, fordi resultatkapitlet (5)
 * og bruksgrensevurderingen hører sammen — «hva det ble» før «hvordan det
 * ser ut». Et «kjør alle» som la hvert plott i sitt eget kapittel ville
 * flyttet kapittel 8 til 9 og brutt rekkefølgen — den ene egenskapen ved
 * rapporten en senere endring kan ødelegge helt stille.
 */
function plotChapter(state, result) {
  if (!result || !result.ok) {
    return chapter(
      7,
      'Plot',
      '<p class="muted">The plot is drawn once the calculation has been carried out.</p>',
      'atomic'
    );
  }

  const parts = plotParts(state, result);
  if (!parts.length) {
    // Et `ok: true`-svar uten en eneste analyseblokk bryter kontrakten (§5.2).
    // Da er en ærlig setning riktigere enn å tegne inndatasnittet under
    // overskriften «ved brudd» — den figuren ville sett ut som et resultat.
    return chapter(
      7,
      'Plot',
      '<p class="muted">The result carries no analysis block, so there is nothing to ' +
        'plot.</p>',
      'atomic'
    );
  }
  if (parts.length === 1) return chapter(7, `Plot — ${parts[0].suffix}`, parts[0].html);
  return chapter(
    7,
    'Plots',
    parts.map((p) => `<h4>${esc(p.heading)}</h4>${p.html}`).join('')
  );
}

/**
 * Plottene resultatet FAKTISK bærer, i den rekkefølgen «kjør alle» regner dem
 * (`runAllPlan` i `solver-client.js`): kapasiteten først, kurven sist.
 *
 * GATEN ER «FINNES BLOKKA», IKKE «HVILKEN ANALYSE» (endringsrunde 5 §D).
 * Før stod det `analysis === 'moment_curvature' && result.moment_curvature`,
 * og et «kjør alle»-resultat — som har `analysis: 'all'` og alle tre blokkene
 * — ville falt helt gjennom til bøyegrenen og trykket ÉN figur. Både M–κ og
 * M–N ville vært borte fra papiret uten at noe feilet. Med blokka som gate får
 * hver enkeltanalyse nøyaktig sitt ene plott som før, og «kjør alle» får dem
 * alle sammen.
 */
function plotParts(state, result) {
  const parts = [];

  // Bøyekapasitet: snittet med nøytralakse og trykksone. `x === null` betyr at
  // nøytralaksen er praktisk talt uendelig langt unna — da tegnes ingen linje,
  // og figuren sier det i stedet for å plassere en strek på slump.
  if (result.bending) {
    // BØYEBLOKKAS eget `x`, ikke `failureState(result)`: i et «kjør alle»-svar
    // peker `failureState` på KAPASITETSanalysen, og er den `nm_domain`, ville
    // nøytralaksen fra omhyllingen blitt tegnet inn i bøyefiguren.
    const x = toNum(result.bending.x);
    const theta = thetaOf(state, result);
    const caption =
      x === null
        ? 'Cross-section at failure. The neutral axis is not drawn: it lies outside any ' +
          'meaningful range (near pure compression).'
        : `Cross-section at failure, with the neutral axis and the hatched compression ` +
          `zone. Compression at the ${compressionEdgeLabel(theta)}, x = ${fmtLength(x, 1)} mm.`;
    parts.push({
      suffix: 'strain state at failure',
      heading: 'Strain state at failure',
      html: figure(state, x === null ? null : { x, theta }, caption),
    });
  }

  if (result.nm_domain) {
    const svg = nmDomainSvg(result.nm_domain, {
      width: REPORT_FIGURE_WIDTH_MM,
      unit: 'mm',
      theme: 'print',
    });
    // ENDRINGSRUNDE 4 §5.2: «+M er den analyserte retningen» var sant bare
    // under den gamle speilingen (θ-avhengig fortegn). Omhyllingen er nå RÅ —
    // samme fortegnskonvensjon som resten av rapporten, ALDRI speilet per
    // kombinasjon — så teksten sier konvensjonen rett ut i stedet.
    parts.push({
      suffix: 'N–M diagram',
      heading: 'N–M diagram',
      html: `<figure class="atomic report-figure-wrap">${svg}<figcaption>Capacity envelope
        with the load point(s) and the load path. Sign convention follows fib
        structuralcodes: sagging (compression at the top face) is negative, hogging is
        positive; N points upward with its own sign, i.e. compression downward. The
        strain plane and failure mode at N_Ed are given in chapter 5.</figcaption></figure>`,
    });
  }

  if (result.moment_curvature) {
    const svg = momentCurvatureSvg(result.moment_curvature, {
      width: REPORT_FIGURE_WIDTH_MM,
      unit: 'mm',
      theme: 'print',
    });
    // ENDRINGSRUNDE 4 §5.1/§5.2: teksten under figuren sier ikke lenger «κ og
    // M er størrelser» som et faktum om DATAEN — dataen er nå rå og fortegnsatt
    // (§1.4). Størrelsene som vises i selve kurven kommer fra en LOKAL `abs` i
    // `momentCurvatureSvg` (D5, det ENESTE tillatte unntaket, §5.1) — teksten
    // her sier derfor uttrykkelig at det er PLOTTET som magnitude, og henviser
    // til konvensjonen i stedet for å late som fortegnet ikke fantes.
    parts.push({
      suffix: 'moment–curvature',
      heading: 'Moment–curvature',
      html: `<figure class="atomic report-figure-wrap">${svg}<figcaption>M(κ) at N_Ed, with
        M_Ed and the yield point plotted as magnitudes. Sagging moment is negative in
        the underlying data (chapter 4); the curve has only one branch, so the sign
        carries no information here.</figcaption></figure>`,
    });
  }

  return parts;
}

/* ------------------------------------------------------------------ *
 * 7. Forutsetninger og metode
 * ------------------------------------------------------------------ */

/**
 * Kapittelet som gjør rapporten etterprøvbar.
 *
 * `scipy`-punktet står her fordi det MÅ stå: modulen kjører ikke ekte scipy,
 * men en numpy-ekvivalent. Den er verifisert bit-identisk (0,000e+00 relativt
 * avvik) mot ekte scipy, og det er nettopp derfor det er ufarlig å si det
 * høyt. En rapport som tier om substitusjonen ville vært den samme rapporten
 * — men uten muligheten for leseren til å vurdere den.
 */
/**
 * Hva `meta.scipy` faktisk betyr for DENNE kjøringen.
 *
 * `'real'` forekommer når tallene kommer fra en skrivebordskjøring (CPython
 * med ekte scipy) framfor fra nettleseren. Å trykke «scipy: real» rett under
 * en setning om at scipy er erstattet, ville vært en selvmotsigelse leseren
 * måtte løse selv.
 */
function scipyStatusText(scipy) {
  if (scipy === 'real') {
    return `<b>real <code>scipy</code></b> — these figures come from a desktop run, ` +
           `not from the browser. The substitution above applies to the browser run, ` +
           `and gives, by definition, the same numbers.`;
  }
  return `<code>scipy: ${esc(scipy || 'stub')}</code> — the numpy equivalent is in use.`;
}

function methodChapter(state, result) {
  const meta = result?.meta || {};
  const m = materialsOf(state, result);
  const subtract =
    meta.subtract_bar_area !== undefined
      ? meta.subtract_bar_area
      : state?.options?.subtract_bar_area;
  const scVersion = meta.structuralcodes_version || STRUCTURALCODES_VERSION;
  const isSlab = state?.sectionType === 'slab';

  const items = [
    `<li><b>Calculation core.</b> fib <code>structuralcodes</code> ` +
      `${esc(scVersion)}, unmodified, run in the browser` +
      `${meta.runtime ? ` on ${esc(meta.runtime)}` : ''}. The module does not calculate ` +
      `the capacity itself.</li>`,

    `<li><b>Integrator: ${esc(meta.integrator || 'marin')}.</b> The marin integrator ` +
      `integrates the stresses analytically over the polygons. <code>fiber</code> is not ` +
      `offered: it requires <code>triangle</code>, which is unavailable for WebAssembly, ` +
      `and it also gives a measurably wrong last point in moment–curvature.</li>`,

    `<li><b>Stress–strain law.</b> Concrete: ${esc(lawLabel(m.law_concrete))}. ` +
      `Reinforcement: ${esc(lawLabel(m.law_steel))}. The strain limits follow the ` +
      `chosen concrete law — here ${esc(strainSymbol(m.eps_cu_name))} = ` +
      `${fmtStrainPermille(m.eps_cu)} ‰. <code>sargin</code> is not offered in a ULS ` +
      `tool: it is built on f_cm, not f_cd.</li>`,

    isSlab
      ? `<li><b>Smeared reinforcement strip.</b> The slab is calculated per metre. Each ` +
        `reinforcement layer is sent to the engine as a continuous strip with height Ø ` +
        `and width A_s/Ø at the same centroid as the actual bars. Verified within ` +
        `<b>0.17 %</b> against discrete bars. The drawing shows the bars at their actual ` +
        `spacing — the model and the drawing describe the same reinforcement.</li>`
      : `<li><b>Discrete bars.</b> The beam's reinforcement is modelled as point bars ` +
        `with area π·Ø²/4 at the coordinates the figure shows. (Slabs, in contrast, are ` +
        `calculated with a smeared strip, verified within 0.17 %.)</li>`,

    `<li><b>subtract_bar_area = ${subtract ? 'on' : 'off'}.</b> ` +
      (subtract
        ? `The concrete beneath each bar is punched out, so the steel is not counted ` +
          `twice with the concrete it displaces.`
        : `Upstream default behaviour: the reinforcement area is added without ` +
          `punching a hole in the concrete polygon. A bar in the compression zone is ` +
          `therefore counted together with the concrete it displaces, and the capacity ` +
          `ends up marginally on the unsafe side. Where that is the case, it is noted as ` +
          `a separate warning below, with a quantified estimate.`) +
      `</li>`,

    `<li><b><code>scipy</code> is replaced by a verified numpy equivalent.</b> The ` +
      `package uses <code>scipy.linalg.lu_factor</code>/<code>lu_solve</code> solely as ` +
      `one linear solve, and it has been swapped here for ` +
      `<code>numpy.linalg.solve</code> — the same LU factorisation with partial ` +
      `pivoting (LAPACK). The equivalence is measured at <b>0.000e+00 relative ` +
      `deviation</b> on the bending resistance, every moment–curvature point and the ` +
      `entire N–M diagram, and is asserted by a dedicated test. ` +
      // RETTET (spec §6.3): «crack width control (SLS)» var usant fra og med SLS-
      // kapittelet (§4) — rissvidden regnes nå, i lukket form, uten scipy. Det
      // som FAKTISK går via scipy inne i 2004-grenen er BARE den forenklede
      // 7.3.3-tabellmetoden (`griddata`, se `_section_7_3_crack_control.py`),
      // som denne modulen ikke bruker (§3.1) — pluss hele EN 1992-1-1:2023.
      `The package's other scipy functions belong to EN 1992-1-1:2023, which is ` +
      `outside this module's scope. Inside the 2004 code, the only scipy user is ` +
      `EC2 7.3.3's simplified table lookup for crack control — this module computes ` +
      `7.3.4 directly instead, in closed form, and never reaches that lookup. ` +
      `They are stubbed to <b>throw</b>, not to approximate. ` +
      `Status in this run: ${scipyStatusText(meta.scipy)}</li>`,

    `<li><b>Code basis.</b> EC2 (NS-EN 1992-1-1:2004) 3.1.6 and 3.1.7 for the ` +
      `concrete's stress–strain law, 3.2.7 for the reinforcement's, 6.1 for bending ` +
      `with axial force, and 9.2.1.1 for A_s,min and A_s,max. The material factors are ` +
      `those given, not a national annex read in automatically.</li>`,

    // RETTET (spec §6.3): «cracking ... are not checked» ble usant i det denne
    // modulen fikk en serviceability-seksjon (7.2/7.3.4). Setningen sier nå hva
    // ER gjort der, og navngir de delene av risskontrollen som FORTSATT står
    // utenfor (7.3.2 minimumsarmering og et snitt i rent strekk, se den
    // seksjonens egne forutsetninger) — en rad kan svare med et åpent spørsmål
    // der, ikke bare bestått/ikke bestått.
    `<li><b>Scope.</b> Ultimate limit state for bending with axial force. A ` +
      `serviceability assessment under EC2 7.2 (stress limits) and 7.3.4 (crack ` +
      `width) is carried out for the load combinations marked characteristic or ` +
      `quasi-permanent — see the Serviceability chapter for its own assumptions ` +
      `and open questions. Deflection, torsion, anchorage and fire are <b>not</b> ` +
      `checked, and neither is EC2 7.3.2 minimum reinforcement for crack control ` +
      `or a cross-section entirely in tension.</li>`,
  ];

  const warnings = describeWarnings(result?.warnings);
  const warnHtml = warnings.length
    ? `<h4>Warnings from the calculation</h4>` +
      table(
        ['Severity', 'Message', 'Code'],
        warnings.map((w) => [
          esc(w.severityLabel),
          esc(w.message) + (w.hasDetail ? `<br><span class="muted text-xs">${esc(w.detail)}</span>` : ''),
          `<code>${esc(w.code)}</code>`,
        ])
      )
    : `<h4>Warnings from the calculation</h4><p class="muted">No warnings.</p>`;

  return chapter(
    8,
    'Assumptions and method',
    `<ul class="method">${items.join('')}</ul>${warnHtml}`
  );
}

/* ------------------------------------------------------------------ *
 * Dokumentet
 * ------------------------------------------------------------------ */

/**
 * Hele rapporten som en HTML-streng, klar til å legges i `.report-content`.
 *
 * @param {object} state   store-tilstanden (§4.1)
 * @param {object|null} result  siste resultat (§5.2), eller `null` før kjøring
 * @returns {string}
 */
export function buildReportHtml(state, result = null) {
  const st = state || {};
  const res = result !== null && result !== undefined ? result : st.result || null;
  // `res` gis UANSETT `ok` — se hodekommentaren om `{ok:false}` og §4.4.
  // `propsOf`/`materialsOf` faller selv tilbake til `derived(state)` når
  // resultatet mangler feltet, så det er trygt å gi dem et resultat som
  // finnes men har `ok: false`.
  const props = propsOf(st, res);
  const materials = materialsOf(st, res);

  return [
    headBlock(st),
    docBlock(st, res),
    sectionChapter(st, res, props, materials),
    rebarChapter(st, res, props),
    loadsChapter(st, res, props),
    resultChapter(st, res),
    slsChapter(st, res),
    plotChapter(st, res),
    methodChapter(st, res),
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Utskriftsriggen
 * ------------------------------------------------------------------ */

/**
 * Kloner rapporten inn i `#cscPrintRoot`, som er et direkte barn av `<body>`.
 *
 * KLONE, ikke flytte: avbrytes utskriften, skal skjermvisningen stå urørt.
 * Det er også grunnen til at `clearPrintStage()` bare tømmer roten og aldri
 * rører overlegget. Se `print.css` for hvorfor klonen må ut av apptreet i det
 * hele tatt.
 */
export function stageReportForPrint() {
  const root = document.getElementById(PRINT_ROOT_ID);
  const content = document.querySelector(OVERLAY_SELECTOR);
  if (!root || !content) return false;
  root.innerHTML = '';
  const clone = content.cloneNode(true);
  clone.removeAttribute('data-page-guides'); // sidegrensene er en skjermting
  root.appendChild(clone);
  root.hidden = false;
  return true;
}

export function clearPrintStage() {
  const root = document.getElementById(PRINT_ROOT_ID);
  if (!root) return;
  root.innerHTML = '';
  root.hidden = true;
}
