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
import { derivedMaterials } from './materials.js';
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
  directionLabel,
  analysisLabel,
  sectionTypeLabel,
  lawLabel,
  compressionEdgeLabel,
  analysisBlock,
  headlineUtilisation,
  momentCapacity,
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
 * står i en tallkolonne, tekst som «Feltmoment — trykk i overkant» gjør ikke.
 * Én regel her slår tjue `align`-argumenter som noen før eller siden glemmer.
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

/** Retningen motoren faktisk regnet med, ellers den valgte. */
function thetaOf(state, result) {
  const t = toNum(result?.meta?.theta);
  if (t !== null) return t;
  try {
    return thetaFor(state?.direction);
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ *
 * 1. Topptekst
 * ------------------------------------------------------------------ */

function headBlock(state) {
  const doc = state?.doc || {};
  const title = String(doc.title || '').trim() || 'Betongtverrsnitt — ULS-kontroll';
  return `<div class="print-head">
    <b>${esc(title)}</b>
    <span>${esc(MODULE_NAME)} v${esc(MODULE_VERSION)}</span>
  </div>`;
}

function docBlock(state, result) {
  const doc = state?.doc || {};
  const rows = [
    ['Prosjekt', esc(String(doc.project || '').trim() || DASH)],
    ['Utført av', esc(String(doc.author || '').trim() || DASH)],
    ['Dato', esc(String(doc.date || '').trim() || today())],
    ['Analyse', esc(analysisLabel(result?.analysis || state?.analysis))],
  ];
  const note = String(doc.note || '').trim();
  const noteHtml = note
    ? `<p class="note whitespace-pre-wrap">${esc(note)}</p>`
    : '';
  return chapter(1, 'Dokumentasjon', kvTable(rows) + noteHtml, 'atomic keep-with-next');
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
    return `<figure class="atomic"><p class="muted">Tverrsnittet kunne ikke tegnes med
      de oppgitte inndataene.</p></figure>`;
  }
  const cap = caption ? `<figcaption>${esc(caption)}</figcaption>` : '';
  return `<figure class="atomic report-figure-wrap">${svg}${cap}</figure>`;
}

function geometryTable(state, props) {
  const type = state?.sectionType;
  const b = toNum(props.b_t) ?? sectionWidth(state || {});
  const h = sectionHeight(state || {});
  return kvTable([
    ['Tverrsnittstype', esc(sectionTypeLabel(type))],
    [type === 'slab' ? 'Bredde b [mm] (per meter)' : 'Bredde b [mm]', fmtLength(b, 0)],
    ['Høyde h [mm]', fmtLength(h, 0)],
    ['Betongareal A_c [mm²]', fmtArea(props.Ag)],
    ['Momentretning', esc(directionLabel(state?.direction))],
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
    ['Arbeidsdiagram betong', esc(lawLabel(m.law_concrete))],
    [`${strainSymbol(m.eps_c_name, 'eps_c')} [‰]`, fmtStrainPermille(m.eps_c)],
    [`${strainSymbol(m.eps_cu_name, 'eps_cu')} [‰]`, fmtStrainPermille(m.eps_cu)],
    ['f_yk [MPa]', fmtStress(m.fyk)],
    ['k = f_tk/f_yk [–]', fmtNumber(m.k, 2)],
    ['f_tk [MPa]', fmtStress(m.ftk)],
    ['E_s [MPa]', fmtNumber(m.Es, 0)],
    ['γ_s [–]', fmtNumber(m.gamma_s, 2)],
    ['f_yd [MPa]', fmtStress(m.fyd, 1)],
    ['f_td [MPa]', fmtStress(m.ftd, 1)],
    ['Arbeidsdiagram armering', esc(lawLabel(m.law_steel))],
    ['ε_yd [‰]', fmtStrainPermille(m.eps_yd)],
    ['ε_uk [‰]', fmtStrainPermille(m.eps_uk, 1)],
    ['γ_ε [–]', fmtNumber(m.gamma_eps, 2)],
    ['ε_ud = γ_ε·ε_uk [‰]', fmtStrainPermille(m.eps_ud, 1)],
  ]);
}

function sectionChapter(state, result, props, materials) {
  const body =
    figure(state, null, 'Tverrsnitt med armering, slik det er matet inn.') +
    twoCol(
      `<div><h4>Geometri</h4>${geometryTable(state, props)}</div>`,
      `<div><h4>Materialer</h4>${materialTable(materials)}</div>`
    );
  return chapter(2, 'Tverrsnitt og materialer', body);
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
  const perMeter = state?.sectionType === 'slab' ? ' per meter' : '';
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
      esc(l.edge === 'top' ? 'Overkant' : 'Underkant'),
      fmtLength(l.dc, 0),
      fmtArea(s.area),
      fmtLength(s.z, 1),
      fmtLength(s.d, 1),
    ];
  });

  const layerTable = rows.length
    ? table(
        ['Lag', 'Betegnelse', 'Kant', `d_c [mm]`, `A_s [mm²]${perMeter}`, 'z [mm]', 'd [mm]'],
        rows,
        { num: [3, 4, 5, 6] }
      )
    : '<p class="muted">Ingen armeringslag lagt inn.</p>';

  const dEff = toNum(props.d_eff);
  const dAll = toNum(props.d_eff_all);
  const asTension = toNum(props.As_tension);

  const totals = kvTable([
    [`ΣA_s [mm²]${perMeter}`, fmtArea(props.As_total)],
    [
      `A_s i strekk [mm²]${perMeter}`,
      asTension === null ? DASH : fmtArea(asTension),
    ],
    ['d = d_eff, strekkarmering alene [mm]', fmtLength(dEff, 1)],
    ['d_eff,all, arealvektet over alle lag [mm]', dAll === null ? DASH : fmtLength(dAll, 1)],
    ['ρ = ΣA_s/(b_t·d) [–]', fmtRatio(props.rho, 4)],
    [`A_s,min [mm²]${perMeter}`, fmtArea(props.As_min)],
    [`A_s,max [mm²]${perMeter}`, fmtArea(props.As_max)],
  ]);

  const note =
    `<p class="note">EC2 9.2.1.1 definerer <b>d</b> som avstanden fra trykkanten til ` +
    `tyngdepunktet i <b>strekkarmeringen</b>. Det er <b>d_eff</b> over, og det er den ` +
    `A_s,min = maks(0,26·f_ctm/f_yk·b_t·d ; 0,0013·b_t·d) er regnet med. Hvilke lag som ` +
    `står i strekk avgjøres av tøyningsplanet ved brudd, ikke av geometrien — ` +
    `<b>d_eff,all</b> står ved siden av nettopp for at valget skal være synlig.</p>` +
    (state?.sectionType === 'slab'
      ? `<p class="note">Alle armeringsmengder for plata er <b>per meter bredde</b>.</p>`
      : '');

  return chapter(3, 'Armering', layerTable + twoCol(totals, note));
}

/* ------------------------------------------------------------------ *
 * 4. Lastvirkning
 * ------------------------------------------------------------------ */

/**
 * `N_Ed` er fortegnsatt (trykk negativ), `M_Ed` er en STØRRELSE i den
 * analyserte retningen (plan §4.1). Begge deler står uttrykkelig i tabellen,
 * fordi fortegnskonvensjonen er det eneste ved lastene man kan ta feil av.
 */
function loadsChapter(state, result, props) {
  const blk = analysisBlock(result);
  const nEd = toNum(blk?.N_Ed) ?? (toNum(state?.loads?.N_Ed) !== null
    ? toNum(state.loads.N_Ed) * 1e3
    : null);
  const mEd = toNum(blk?.M_Ed) ?? (toNum(state?.loads?.M_Ed) !== null
    ? toNum(state.loads.M_Ed) * 1e6
    : null);

  const rows = [
    ['N_Ed [kN] (trykk negativ)', fmtForceKN(nEd)],
    ['M_Ed [kNm] (størrelse i analysert retning)', fmtMomentKNm(mEd)],
    ['Retning', esc(directionLabel(state?.direction))],
    ['N_min [kN]', fmtForceKN(props.n_min ?? props.N_min)],
    ['N_max [kN]', fmtForceKN(props.n_max ?? props.N_max)],
  ];
  const note =
    `<p class="note">Aksialintervallet [N_min, N_max] er tverrsnittets rene ` +
    `trykk- og strekkapasitet. Ligger N_Ed utenfor det, finnes det ingen ` +
    `bøyekapasitet å kontrollere mot, og motoren svarer med ` +
    `<code>axial_out_of_range</code> før noe regnes.</p>`;
  return chapter(4, 'Lastvirkning', kvTable(rows) + note, 'atomic');
}

/* ------------------------------------------------------------------ *
 * 5. Resultat
 * ------------------------------------------------------------------ */

function strainTable(bending, theta) {
  const layers = Array.isArray(bending?.layers) ? bending.layers : [];
  if (!layers.length) return '';
  const rows = layers.map((l) => [
    esc(l.id || DASH),
    fmtLength(l.z, 1),
    fmtStrainPermille(l.eps),
    fmtStress(l.sigma, 1),
    esc(l.compression ? 'Trykk' : 'Strekk'),
    l.utilisation === undefined || l.utilisation === null ? DASH : fmtRatio(l.utilisation, 3),
  ]);
  return (
    `<h4>Tøyninger og spenninger per armeringslag</h4>` +
    table(['Lag', 'z [mm]', 'ε [‰]', 'σ [MPa]', 'Tilstand', 'σ/f_yd'], rows, {
      num: [1, 2, 3, 5],
    })
  );
}

/**
 * Resultatboksen.
 *
 * `eps_c_top` heter «top» i kontrakten, men ER tøyningen ved TRYKKANTEN for
 * den analyserte retningen — for støttemoment (θ = π) altså underkanten.
 * Merkelappen hentes derfor fra `compressionEdgeLabel(theta)` og skrives
 * aldri som «overkant» rett ut.
 */
function resultChapter(state, result) {
  if (!result) {
    return chapter(
      5,
      'Resultat',
      '<p class="muted">Ingen beregning er kjørt. Kapasitetstallene fylles inn når ' +
        'beregningen er utført.</p>',
      'atomic'
    );
  }
  if (!result.ok) {
    const e = describeError(result.error || {});
    return chapter(
      5,
      'Resultat',
      `<p class="warn"><b>${esc(e.severityLabel)}:</b> ${esc(e.message)}</p>` +
        (e.hasDetail ? `<p class="muted text-xs">${esc(e.detail)}</p>` : ''),
      'atomic'
    );
  }

  const blk = analysisBlock(result) || {};
  const bending = result.bending || null;
  const theta = thetaOf(state, result);
  const eta = headlineUtilisation(result);
  const status = utilisationStatus(eta);
  const mRd = momentCapacity(result);

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
    `<div class="result-status">${esc(status.label)}</div>` +
    `</div>`;

  const rows = [
    ['M_Rd [kNm]', fmtMomentKNm(mRd)],
    ['M_Ed [kNm]', fmtMomentKNm(blk.M_Ed)],
    [`${HEADLINE_UTILISATION_LABEL} [–]`, fmtRatio(eta, 3)],
    ['Utnyttelse [%]', fmtPercent(eta, 1)],
  ];
  if (bending) {
    rows.push(
      ['Trykksonehøyde x [mm]', fmtLength(bending.x, 1)],
      ['x/d [–]', fmtRatio(bending.x_over_d, 3)],
      [`ε_c ved ${compressionEdgeLabel(theta)} [‰]`, fmtStrainPermille(bending.eps_c_top)],
      ['ε_s,maks [‰]', fmtStrainPermille(bending.eps_s_max)],
      ['ε_a i tyngdepunktet [‰]', fmtStrainPermille(bending.eps_a)],
      ['κ_y [10⁻⁶/mm]', fmtCurvature(bending.chi_y)],
      ['Bruddform', esc(failureModeLabel(bending.failure_mode))]
    );
  }
  const mc = result.moment_curvature;
  if (mc) {
    rows.push(
      ['Punkter på M–κ-kurven', fmtNumber((mc.kappa || []).length, 0)],
      [
        'Flytepunkt (indeks)',
        mc.yield_index === null || mc.yield_index === undefined
          ? DASH
          : fmtNumber(mc.yield_index, 0),
      ],
      ['Kurven er avkortet', mc.truncated ? 'Ja' : 'Nei']
    );
  }
  const dom = result.nm_domain;
  if (dom) {
    const rad = radialUtilisation(
      dom,
      (toNum(dom.N_Ed) || 0) / 1e3,
      Math.abs(toNum(dom.M_Ed) || 0) / 1e6
    );
    rows.push(
      ['Punkter på omhyllingen', fmtNumber((dom.n || []).length, 0)],
      [
        `${RADIAL_UTILISATION_LABEL} [–]`,
        Number.isFinite(rad.lambda) ? fmtRatio(rad.lambda, 3) : DASH,
      ],
      ['η_radiell = 1/λ [–]', rad.eta ? fmtRatio(rad.eta, 3) : DASH]
    );
  }

  const xNote =
    bending && toNum(bending.x) === null
      ? `<p class="note">Trykksonehøyden er ikke oppgitt: nøytralaksen ligger mer enn ` +
        `10·h fra tyngdepunktet, altså praktisk talt i det uendelige. Det skjer ved nær ` +
        `rent trykk, og et endelig tall der ville vært meningsløst.</p>`
      : '';

  const radNote = dom
    ? `<p class="note">Hovedtallet er den <b>vertikale</b> utnyttelsen ` +
      `${esc(HEADLINE_UTILISATION_LABEL)}, som holder N_Ed fast. Den radielle λ over ` +
      `følger en <b>lastvei</b> der N og M vokser i takt, og er et sekundært tall — ` +
      `de to besvarer ulike spørsmål og skal ikke sammenlignes.</p>`
    : '';

  const checks = table(
    ['Kontroll', 'Status'],
    checkRows(result.checks || {}).map((c) => [esc(c.label), esc(c.text)])
  );

  const modeNote = bending && failureModeNote(bending.failure_mode)
    ? `<p class="note">${esc(failureModeNote(bending.failure_mode))}</p>`
    : '';

  return chapter(
    5,
    'Resultat',
    head +
      twoCol(
        `<div><h4>Kapasitet og tøyningsplan</h4>${kvTable(rows)}</div>`,
        `<div><h4>Kontroller</h4>${checks}${modeNote}</div>`
      ) +
      strainTable(bending, theta) +
      xNote +
      radNote
  );
}

/* ------------------------------------------------------------------ *
 * 6. Plott
 * ------------------------------------------------------------------ */

/**
 * Resultatet tegnet. Hvilken tegning avhenger av analysen — se
 * hodekommentaren om hvorfor bøyekapasitet får en figur og ikke et diagram.
 */
function plotChapter(state, result) {
  const analysis = result?.analysis || state?.analysis;
  if (!result || !result.ok) {
    return chapter(
      6,
      'Plott',
      '<p class="muted">Plottet tegnes når beregningen er utført.</p>',
      'atomic'
    );
  }

  if (analysis === 'moment_curvature' && result.moment_curvature) {
    const svg = momentCurvatureSvg(result.moment_curvature, {
      width: REPORT_FIGURE_WIDTH_MM,
      unit: 'mm',
      theme: 'print',
    });
    return chapter(
      6,
      'Plott — moment–krumning',
      `<figure class="atomic report-figure-wrap">${svg}<figcaption>M(κ) ved N_Ed, med
        M_Ed og flytepunktet inntegnet. κ og M er størrelser.</figcaption></figure>`
    );
  }

  if (analysis === 'nm_domain' && result.nm_domain) {
    const svg = nmDomainSvg(result.nm_domain, {
      width: REPORT_FIGURE_WIDTH_MM,
      unit: 'mm',
      theme: 'print',
    });
    return chapter(
      6,
      'Plott — M–N-diagram',
      `<figure class="atomic report-figure-wrap">${svg}<figcaption>Kapasitetsomhylling
        med lastpunktet og lastveien. +M er den analyserte retningen, −M den motsatte;
        N vender oppover med sitt eget fortegn, altså trykk nedover.</figcaption></figure>`
    );
  }

  // Bøyekapasitet: snittet med nøytralakse og trykksone. `x === null` betyr at
  // nøytralaksen er praktisk talt uendelig langt unna — da tegnes ingen linje,
  // og figuren sier det i stedet for å plassere en strek på slump.
  const x = toNum(result.bending?.x);
  const theta = thetaOf(state, result);
  const caption =
    x === null
      ? 'Tverrsnittet ved brudd. Nøytralaksen er ikke tegnet: den ligger utenfor ' +
        'ethvert meningsfullt område (nær rent trykk).'
      : `Tverrsnittet ved brudd, med nøytralakse og skravert trykksone. ` +
        `Trykk i ${compressionEdgeLabel(theta)}, x = ${fmtLength(x, 1)} mm.`;
  return chapter(
    6,
    'Plott — tøyningstilstand ved brudd',
    figure(state, x === null ? null : { x, theta }, caption)
  );
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
    return `<b>ekte <code>scipy</code></b> — disse tallene kommer fra en ` +
           `skrivebordskjøring, ikke fra nettleseren. Substitusjonen over gjelder ` +
           `nettleserkjøringen, og gir per definisjon samme tall.`;
  }
  return `<code>scipy: ${esc(scipy || 'stub')}</code> — numpy-ekvivalenten er i bruk.`;
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
    `<li><b>Beregningskjerne.</b> fib <code>structuralcodes</code> ` +
      `${esc(scVersion)}, uendret, kjørt i nettleseren` +
      `${meta.runtime ? ` på ${esc(meta.runtime)}` : ''}. Modulen regner ikke ` +
      `kapasiteten selv.</li>`,

    `<li><b>Integrator: ${esc(meta.integrator || 'marin')}.</b> Marin-integratoren ` +
      `integrerer spenningene analytisk over polygonene. <code>fiber</code> tilbys ikke: ` +
      `den krever <code>triangle</code>, som ikke finnes for WebAssembly, og den gir ` +
      `dessuten et målbart feil sistepunkt i moment–krumning.</li>`,

    `<li><b>Arbeidsdiagram.</b> Betong: ${esc(lawLabel(m.law_concrete))}. ` +
      `Armering: ${esc(lawLabel(m.law_steel))}. Tøyningsgrensene følger valgt ` +
      `betonglov — her ${esc(strainSymbol(m.eps_cu_name))} = ` +
      `${fmtStrainPermille(m.eps_cu)} ‰. <code>sargin</code> tilbys ikke i et ` +
      `ULS-verktøy: den bygger på f_cm, ikke f_cd.</li>`,

    isSlab
      ? `<li><b>Utsmurt armeringsstripe.</b> Plata regnes per meter. Hvert ` +
        `armeringslag sendes til motoren som en sammenhengende stripe med høyde Ø og ` +
        `bredde A_s/Ø i samme tyngdepunkt som de virkelige jernene. Verifisert innenfor ` +
        `<b>0,17 %</b> mot diskrete jern. Tegningen viser jernene i faktisk ` +
        `senteravstand — modellen og figuren beskriver samme armering.</li>`
      : `<li><b>Diskrete jern.</b> Bjelkens armering modelleres som punktjern med areal ` +
        `π·Ø²/4 i koordinatene figuren viser. (Plater regnes derimot med en utsmurt ` +
        `stripe, verifisert innenfor 0,17 %.)</li>`,

    `<li><b>subtract_bar_area = ${subtract ? 'på' : 'av'}.</b> ` +
      (subtract
        ? `Betongen under hvert jern er punsjert bort, slik at stålet ikke ` +
          `dobbelttelles med betongen det fortrenger.`
        : `Oppstrøms standardoppførsel: armeringsarealet legges til uten å punsjere ` +
          `hull i betongpolygonet. Et jern i trykksonen telles dermed sammen med ` +
          `betongen det fortrenger, og kapasiteten havner marginalt på usikker side. ` +
          `Er det tilfelle, står det som en egen advarsel under, med et tallfestet ` +
          `anslag.`) +
      `</li>`,

    `<li><b><code>scipy</code> er erstattet av en verifisert numpy-ekvivalent.</b> ` +
      `Pakken bruker <code>scipy.linalg.lu_factor</code>/<code>lu_solve</code> ` +
      `utelukkende som ett lineært løs, og det er her byttet mot ` +
      `<code>numpy.linalg.solve</code> — samme LU-faktorisering med delvis pivotering ` +
      `(LAPACK). Ekvivalensen er målt til <b>0,000e+00 relativt avvik</b> på ` +
      `bøyekapasitet, alle moment–krumningspunkter og hele M–N-diagrammet, og påstås ` +
      `av en egen test. De øvrige scipy-funksjonene pakken kaller hører til ` +
      `rissviddekontroll (SLS) og EC2:2023, som begge er utenfor denne modulens ` +
      `omfang; de er stubbet til å <b>kaste</b>, ikke til å tilnærme. ` +
      `Status i denne kjøringen: ${scipyStatusText(meta.scipy)}</li>`,

    `<li><b>Regelverk.</b> EC2 (NS-EN 1992-1-1:2004) 3.1.6 og 3.1.7 for betongens ` +
      `arbeidsdiagram, 3.2.7 for armeringens, 6.1 for bøyning med aksialkraft, og ` +
      `9.2.1.1 for A_s,min og A_s,max. Materialfaktorene er de oppgitte, ikke ` +
      `nasjonalt tillegg lest inn automatisk.</li>`,

    `<li><b>Omfang.</b> Bruddgrensetilstand for bøyning med aksialkraft. Skjær, riss, ` +
      `nedbøyning, torsjon, forankring, brann og eksponeringsklasse er <b>ikke</b> ` +
      `kontrollert.</li>`,
  ];

  const warnings = describeWarnings(result?.warnings);
  const warnHtml = warnings.length
    ? `<h4>Advarsler fra beregningen</h4>` +
      table(
        ['Alvorlighet', 'Melding', 'Kode'],
        warnings.map((w) => [
          esc(w.severityLabel),
          esc(w.message) + (w.hasDetail ? `<br><span class="muted text-xs">${esc(w.detail)}</span>` : ''),
          `<code>${esc(w.code)}</code>`,
        ])
      )
    : `<h4>Advarsler fra beregningen</h4><p class="muted">Ingen advarsler.</p>`;

  return chapter(
    7,
    'Forutsetninger og metode',
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
  const props = propsOf(st, res && res.ok ? res : null);
  const materials = materialsOf(st, res && res.ok ? res : null);

  return [
    headBlock(st),
    docBlock(st, res),
    sectionChapter(st, res, props, materials),
    rebarChapter(st, res, props),
    loadsChapter(st, res, props),
    resultChapter(st, res),
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
