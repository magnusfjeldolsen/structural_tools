/**
 * ui.js — DOM-bindingen for arbeidsarket.
 *
 * HVORFOR ARBEIDSARKET OG IKKE TO-PANELS-OPPSETTET
 * UX-porten valgte mockup A (`docs/mockups/a-arbeidsark.html`): ett rullende
 * ark, materiale → geometri → armering → last → beregn → resultat, med
 * «Beregn» i en fast bunnlinje som er i rekkevidde fra hver seksjon. Den koster
 * null museklikk for det som gjentas mest — å legge inn armeringslag — og den
 * har samme dokumentform som A4-rapporten i §8, slik at skjerm og papir deler
 * mental modell.
 *
 * TRE TING ER HENTET FRA DEN FORKASTEDE MOCKUP B, FORDI A ER SVAKERE DER:
 * 1. **🔒 på `d_c`.** A regnet auto-`d_c` uten å vise at den var avledet.
 *    Hengelåsen holder `d_c = overdekning + bøyle + Ø/2` og gjør regelen synlig.
 * 2. **Inspeksjonsstripa i bunnlinja.** A-ens eneste alvorlige svakhet var at
 *    man måtte rulle ned for å se hva en endring gjorde. η, M_Rd, x, x/d og
 *    bruddform står nå ved siden av ΣA_s og d, alltid synlig.
 * 3. **Ø-brikkeraden i RADEDITOREN** — ikke i innleggingslinja. Korthånden
 *    forblir hovedveien; brikkene er utveien for den som ikke vil lære den.
 *
 * DET ENE SOM IKKE ER HENTET FRA B: fane-som-analysevalg. Et klikk på en fane
 * ville blitt et motorkall brukeren ikke ba om. Analysevalget er derfor en
 * uttrykkelig kontroll i lastseksjonen.
 *
 * KORTHÅNDEN ER EN SNARVEI, ALDRI EN FORUTSETNING
 * `3ø20 uk 50` er den raske veien inn. Men HVERT felt er også redigerbart i
 * radeditoren uten å kjenne grammatikken — antall, Ø, kant og `d_c` har hver
 * sin kontroll. En bruker som aldri leser plassholderen skal kunne gjøre alt.
 *
 * ARBEIDSDELING
 * Denne fila eier DOM-en og ingenting annet. Tall, regler og tekster kommer fra
 * `section.js`, `rebar.js`, `materials.js` og `results.js`; figurene fra
 * `section-draw.js` og `charts.js`. Blir noe her regnet på nytt, er det en feil
 * — da kan tegningen bli uenig med tallet uten at en test merker det.
 *
 * ETTER EN KJØRING GJELDER `result.section_props`, ALDRI JS-ESTIMATET.
 * `section.derived()` merker seg selv med `d_eff_source: 'geometric-estimate'`
 * nettopp for at de to ikke skal kunne forveksles (plan §5.2).
 */

import { BAR_DIAMETERS, CONCRETE_GRADES, CONCRETE_LAWS, STEEL_GRADES, STEEL_LAWS, derivedMaterials }
  from './materials.js';
import { bindNumericInput } from './numeric-input.js';
import { layerArea, layerBarCount, layerDepth, suggestedDc, totalArea } from './rebar.js';
import { derived, sectionHeight, sectionWidth, thetaFor, validate } from './section.js';
import { drawSection } from './section-draw.js';
import { momentCurvatureSvg, nmDomainSvg, radialUtilisation } from './charts.js';
import { isCancellable, phaseLabel, TOTAL_DOWNLOAD_BYTES } from './solver-client.js';
import {
  DASH, analysisBlock, analysisLabel, checkRows, compressionEdgeLabel, describeWarnings,
  designMoment, directionLabel, failureModeLabel, failureModeNote, fmtArea, fmtCurvature,
  fmtLength, fmtMomentKNm, fmtNumber, fmtPercent, fmtRatio, fmtStrainPermille, fmtStress,
  headlineUtilisation, lawLabel, messageForCode, momentCapacity, sectionTypeLabel, toNum,
  utilisationStatus, HEADLINE_UTILISATION_LABEL, RADIAL_UTILISATION_LABEL,
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

/** MB med norsk desimalkomma, til statuslinja. */
function mb(bytes) {
  return fmtNumber((Number(bytes) || 0) / 1e6, 1);
}

/** Beskrivelsene av de tre analysene. Kostnaden står i teksten med vilje. */
const ANALYSES = [
  ['bending', 'Ett kall, ~50 ms. Gir M_Rd, nøytralakse, tøyninger per lag og bruddform.'],
  ['moment_curvature', 'M(κ) i 20 punkter med M_Ed inntegnet. Drives punkt for punkt fra ' +
    'nettleseren, så framdriften er determinat og «Avbryt» virker.'],
  ['nm_domain', 'Full kapasitetsomhylling (69 punkter, ~100 ms) med lastpunktet inntegnet.'],
];

/* ================================================================== *
 * Korthånd
 * ================================================================== */

/**
 * Tolker korthåndslinja.
 *
 *   `3ø20 uk 50`      3 stk Ø20, underkant, d_c = 50
 *   `2x25 ok`         2 stk Ø25, overkant, d_c avledet
 *   `ø12 c113 uk 31`  Ø12 c/c 113, underkant, d_c = 31
 *   `ø10/150`         Ø10 c/c 150, underkant, d_c avledet
 *
 * `dcGiven` sier om brukeren SKREV `d_c`. Gjorde hen ikke det, skal laget bli
 * liggende låst til `overdekning + bøyle + Ø/2` og følge med når overdekningen
 * endres — ellers ville et utelatt tall blitt frosset ved verdien det tilfeldigvis
 * hadde da laget ble lagt inn.
 *
 * @returns {{mode:string, dia:number, count?:number, spacing?:number,
 *            edge:string, dc:number, dcGiven:boolean}|null} `null` ved uleselig linje
 */
export function parseShorthand(raw, state = {}) {
  let t = ` ${String(raw ?? '').toLowerCase().replace(/,/g, '.').trim()} `;
  if (!t.trim()) return null;

  let edge = 'bottom';
  if (/\b(ok|overkant|topp)\b/.test(t)) {
    edge = 'top';
    t = t.replace(/\b(ok|overkant|topp)\b/g, ' ');
  } else {
    t = t.replace(/\b(uk|underkant|bunn)\b/g, ' ');
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
  const e = layer.edge === 'top' ? 'ok' : 'uk';
  return layer.mode === 'spacing'
    ? `ø${layer.dia} c${fmtNumber(layer.spacing, 0)} ${e} ${fmtNumber(layer.dc, 0)}`
    : `${layer.count}ø${layer.dia} ${e} ${fmtNumber(layer.dc, 0)}`;
}

/* ================================================================== *
 * UI-et
 * ================================================================== */

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

  /**
   * Hvilke lag som har LÅST `d_c`. Ligger her og ikke i tilstanden med vilje:
   * det er en redigeringsaffordanse, ikke en egenskap ved tverrsnittet, og
   * plan §4.2 har ikke feltet. Tilstanden skal kunne sendes rett inn i
   * `payload.js` uten å måtte vaskes først.
   */
  const dcLocked = new Map();
  /** Hvilket lag som står åpent i radeditoren. `null` = ingen. */
  let editing = null;
  /**
   * Er BARE `M_Ed` endret etter siste kjøring?
   *
   * Se `invalidate()` under for hvorfor dette er den ENESTE endringen som får
   * lov til å la resultatet stå.
   */
  let loadsStale = false;
  /** Kjører en beregning nå? */
  let busy = false;
  /** Siste linjer i korthåndsfeltet, for ↑. */
  const shHistory = [];

  function isLocked(id) {
    return dcLocked.get(id) !== false;
  }

  /* ---------------------------------------------------------------- *
   * Avledet `d_c`
   * ---------------------------------------------------------------- */

  /**
   * Setter `d_c` på nytt for alle LÅSTE lag.
   *
   * `store.resyncCover()` brukes bevisst IKKE: den overskriver `d_c` på hvert
   * eneste lag, også dem brukeren har låst opp og skrevet inn selv. Da ville
   * en endring i overdekningen stille slettet et tall brukeren nettopp valgte.
   */
  function resyncLockedDc() {
    const state = store.getState();
    for (const layer of state.layers) {
      if (!isLocked(layer.id)) continue;
      const dc = suggestedDc(state, layer.dia);
      if (dc !== layer.dc) store.updateLayer(layer.id, { dc });
    }
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
   * KASTER resultatet. Kalles av ALT unntatt `M_Ed`.
   *
   * HVORFOR IKKE BARE MERKE DET SOM FORELDET
   * Et resultat som ligger igjen ved siden av en tilstand det ikke gjelder for,
   * er en felle: rapporten (`report.js`) bygges av `state` OG `state.result`
   * sammen, og ville da trykt tøyningsmerkelapper for feltmoment ved siden av
   * kapasitetstall regnet for støttemoment — uten at noe feiler. En grå
   * «foreldet»-etikett hjelper ikke, for papiret arver ikke etiketten.
   *
   * `M_Ed` er det eneste unntaket, og bare fordi kapasiteten er UAVHENGIG av
   * den: `M_Rd(N_Ed)` står uendret, og η = M_Ed/M_Rd kan regnes på nytt uten å
   * spørre motoren. `N_Ed` er IKKE et unntak — hele poenget med M–N-diagrammet
   * er at kapasiteten avhenger av normalkraften.
   */
  function invalidate() {
    if (store.getState().result) store.setResult(null);
    loadsStale = false;
  }

  /** Bare `M_Ed` er endret: kapasiteten står, η regnes på nytt. */
  function markLoadChange() {
    if (store.getState().result) loadsStale = true;
  }

  function setupFields() {
    bindField('#i-b', (s) => s.geometry.b, (v) => {
      if (store.getState().sectionType !== 'slab') store.patch('geometry', { b: v });
    }, { min: 1 });
    bindField('#i-h', (s) => s.geometry.h, (v) => store.patch('geometry', { h: v }), { min: 1 });
    bindField('#i-cover', (s) => s.cover, (v) => { store.setState({ cover: v }); resyncLockedDc(); }, { min: 0 });
    bindField('#i-stirrup', (s) => s.stirrup_dia, (v) => { store.setState({ stirrup_dia: v }); resyncLockedDc(); }, { min: 0 });
    bindField('#i-cover-side', (s) => s.cover_side, (v) => store.setState({ cover_side: v }), { min: 0 });

    bindField('#i-gamma-c', (s) => s.concrete.gamma_c, (v) => store.patch('concrete', { gamma_c: v }), { min: 0.0001 });
    bindField('#i-alpha-cc', (s) => s.concrete.alpha_cc, (v) => store.patch('concrete', { alpha_cc: v }), { min: 0.0001 });
    bindField('#i-gamma-s', (s) => s.steel.gamma_s, (v) => store.patch('steel', { gamma_s: v }), { min: 0.0001 });
    bindField('#i-k', (s) => s.steel.k, (v) => store.patch('steel', { k: v }), { min: 1 });
    bindField('#i-epsuk', (s) => s.steel.epsuk, (v) => store.patch('steel', { epsuk: v }), { min: 0.0001 });
    bindField('#i-gamma-eps', (s) => s.steel.gamma_eps, (v) => store.patch('steel', { gamma_eps: v }), { min: 0.0001 });

    // `N_Ed` kaster resultatet: `M_Rd` er `M_Rd(N_Ed)`, så et nytt N er et nytt
    // tverrsnittssvar. `M_Ed` gjør det ikke — se `markLoadChange()`.
    bindField('#i-n-ed', (s) => s.loads.N_Ed, (v) => store.patch('loads', { N_Ed: v }));
    bindField('#i-m-ed', (s) => s.loads.M_Ed, (v) => store.patch('loads', { M_Ed: Math.abs(v) }),
      { min: 0 }, markLoadChange);

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
    put('#i-gamma-c', s.concrete.gamma_c);
    put('#i-alpha-cc', s.concrete.alpha_cc);
    put('#i-gamma-s', s.steel.gamma_s);
    put('#i-k', s.steel.k);
    put('#i-epsuk', s.steel.epsuk, 5);
    put('#i-gamma-eps', s.steel.gamma_eps);
    put('#i-n-ed', s.loads.N_Ed, 2);
    put('#i-m-ed', s.loads.M_Ed, 2);

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
    if (stir) stir.style.display = isSlab ? 'none' : '';
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

  function renderChips(sel, items, current, onPick) {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = items
      .map((i) => `<button type="button" class="chip" data-v="${esc(i.value)}" ` +
                  `data-on="${String(i.value === current)}" title="${esc(i.title || '')}">${esc(i.label)}</button>`)
      .join('');
    for (const btn of Array.from(el.children)) btn.onclick = () => onPick(btn.dataset.v);
  }

  /* ---------------------------------------------------------------- *
   * Armering
   * ---------------------------------------------------------------- */

  function renderLayers() {
    const host = $('#layers');
    if (!host) return;
    const s = store.getState();
    const theta = thetaFor(s.direction);
    const isSlab = s.sectionType === 'slab';
    const perMeter = isSlab ? '/m' : '';

    if (!s.layers.length) {
      host.innerHTML =
        `<div class="px-4 py-6 text-center text-sm text-slate-500">Ingen armeringslag ennå. ` +
        `Skriv <span class="font-mono text-sky-300">${isSlab ? 'ø12 c113 uk 31' : '3ø20 uk 50'}</span> ` +
        `i linja over, eller trykk «+ Nytt lag» og fyll ut feltene.</div>`;
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
                  title="Snu til ${layer.edge === 'bottom' ? 'overkant' : 'underkant'}">${layer.edge === 'bottom' ? 'UK' : 'OK'}</button>
          <span class="text-slate-400 num">d<sub>c</sub> ${fmtNumber(layer.dc, 1)}${isLocked(layer.id) ? ' <span title="Avledet av overdekning + bøyle + Ø/2">🔒</span>' : ''}</span>
          <span class="text-slate-500 num hidden md:inline ml-3">A<sub>s</sub> ${fmtArea(area)} mm²${perMeter} · d ${fmtLength(d, 0)} mm · ${n} jern</span>
          <span class="lact ml-auto flex gap-1">
            <button type="button" class="px-2 py-1 rounded hover:bg-slate-700 text-slate-300" data-open="${esc(layer.id)}"
                    title="Rediger alle felt">${open ? '▾' : '✎'}</button>
            <button type="button" class="px-2 py-1 rounded hover:bg-slate-700 text-slate-400" data-dup="${esc(layer.id)}" title="Dupliser">⧉</button>
            <button type="button" class="px-2 py-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300" data-del="${esc(layer.id)}" title="Slett">✕</button>
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
    const auto = suggestedDc(state, layer.dia);
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
            ? `<label><span class="field-label">Senteravstand c/c [mm]</span><input type="text" data-f="spacing" data-l="${esc(layer.id)}" value="${fmtNumber(layer.spacing, 1)}"></label>`
            : `<label><span class="field-label">Antall jern</span><input type="text" data-f="count" data-l="${esc(layer.id)}" value="${fmtNumber(layer.count, 0)}"></label>`}
          <div>
            <span class="field-label">Kant d<sub>c</sub> måles fra</span>
            <div class="seg w-full" data-edgeseg="${esc(layer.id)}">
              <button type="button" data-v="bottom" data-on="${String(layer.edge !== 'top')}" class="flex-1">Underkant</button>
              <button type="button" data-v="top" data-on="${String(layer.edge === 'top')}" class="flex-1">Overkant</button>
            </div>
          </div>
        </div>
        <div class="max-w-md">
          <span class="field-label">d<sub>c</sub> — kant til jernSENTER [mm]</span>
          <div class="flex items-center gap-2">
            <button type="button" class="chip shrink-0" data-lock="${esc(layer.id)}"
                    title="${locked ? 'Lås opp for å skrive d_c selv' : 'Lås til overdekning + bøyle + Ø/2'}">${locked ? '🔒 avledet' : '🔓 egen verdi'}</button>
            <input type="text" data-f="dc" data-l="${esc(layer.id)}" value="${fmtNumber(layer.dc, 2)}"
                   ${locked ? 'readonly class="opacity-60"' : ''} aria-label="d_c">
          </div>
          <p class="text-[11px] text-slate-500 mt-1 num">
            ${locked
              ? `Holdes lik overdekning + bøyle + Ø/2 = ${fmtNumber(state.cover, 1)} + ${fmtNumber(state.stirrup_dia, 1)} + ${fmtNumber(Number(layer.dia) / 2, 2)} = <b>${fmtNumber(auto, 2)} mm</b>, også når du endrer overdekningen.`
              : `Skrevet inn manuelt. Den avledede verdien ville vært ${fmtNumber(auto, 2)} mm.`}
          </p>
        </div>
      </div>
      <div class="text-[11px] text-slate-500 num md:text-right md:w-44 space-y-1">
        <div>Korthånd: <span class="font-mono text-slate-400">${esc(shorthandOf(layer))}</span></div>
        <div>A<sub>s</sub> ${fmtArea(layerArea(layer))} mm²${state.sectionType === 'slab' ? '/m' : ''}</div>
        <div>${layerBarCount(layer)} jern tegnes</div>
        <button type="button" class="chip mt-1" data-close="1">Lukk</button>
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
        const copy = store.duplicateLayer(el.dataset.dup);
        if (copy) dcLocked.set(copy.id, isLocked(el.dataset.dup));
        invalidate(); render();
      };
    });
    host.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => {
        store.removeLayer(el.dataset.del);
        dcLocked.delete(el.dataset.del);
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
        dcLocked.set(id, !isLocked(id));
        resyncLockedDc();
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

  /** Én feltendring i et lag, med avledet `d_c` holdt i hevd. */
  function setLayerValue(id, field, value) {
    const patch = { [field]: value };
    // Endres Ø, endres den avledede `d_c` — men bare hvis laget er låst.
    if (field === 'dia' && isLocked(id)) {
      patch.dc = suggestedDc(store.getState(), value);
    }
    if (field === 'dc') dcLocked.set(id, false);
    store.updateLayer(id, patch);
    invalidate();
    render();
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
    const { dcGiven, ...values } = parsed;
    const layer = store.addLayer(values);
    // Utelot brukeren `d_c`, blir laget liggende LÅST og følger overdekningen.
    dcLocked.set(layer.id, !dcGiven);
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
          `${p.edge === 'bottom' ? 'UK' : 'OK'} · d<sub>c</sub> ${fmtNumber(p.dc, 1)}${p.dcGiven ? '' : ' (avledet 🔒)'} · ` +
          `A<sub>s</sub> ${fmtArea(layerArea(p))} mm²`
        : '<span class="text-rose-400">Forstår ikke linja. Bruk eksemplene, eller «+ Nytt lag» og fyll ut feltene.</span>';
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
        dcLocked.set(layer.id, true);
        // Nytt tomt lag åpnes i editoren: da ser en ny bruker med én gang at
        // alt kan skrives inn i felter, uten å kjenne korthånden.
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
    const copy = store.duplicateLayer(last.id);
    if (copy) dcLocked.set(copy.id, isLocked(last.id));
    invalidate();
    render();
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

    const short = st.state === 'ready' ? 'Motor klar'
      : st.state === 'failed' ? 'Motor feilet'
      : st.state === 'idle' ? 'Motor ikke startet'
      : st.state === 'solving' ? `${phaseLabel(st.phase)} …`
      : `${phaseLabel(st.phase)} · ≈ ${mb(st.bytes)} / ${mb(TOTAL_DOWNLOAD_BYTES)} MB`;

    if (pill) {
      pill.innerHTML = `<span class="w-2 h-2 rounded-full ${dot}"></span><span class="text-slate-300 num">${esc(short)}</span>`;
    }
    if (barEng) {
      barEng.innerHTML = st.state === 'ready'
        ? `<span class="text-emerald-400">● klar</span> · ${esc(st.ready?.runtime || '')}`
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
          ${st.error?.detail ? `<details class="mt-1"><summary class="text-[11px] text-slate-500">Teknisk detalj</summary>
             <pre class="text-[10px] text-slate-500 whitespace-pre-wrap mt-1">${esc(st.error.detail)}</pre></details>` : ''}
          <p class="text-[11px] text-slate-500 mt-1">Skjemaet virker fortsatt, og tverrsnittstegningen er ren JS. Bare tallene mangler.</p>
        </div>
        <button type="button" id="engine-retry" class="shrink-0 px-3 py-1.5 text-xs rounded bg-rose-800 hover:bg-rose-700 border border-rose-600">Prøv igjen</button>
      </div>`;
      const retry = $('#engine-retry');
      if (retry) retry.onclick = () => onRetryWarmup();
      return;
    }

    const pct = st.state === 'ready' ? 100 : Math.max(0, Math.min(100, Math.round(st.pct)));
    const bar = st.state === 'ready' ? 'bg-emerald-500' : st.state === 'solving' ? 'bg-sky-500' : 'bg-amber-500';
    const counter = st.done !== null && st.total
      ? ` · punkt ${fmtNumber(st.done, 0)} av ${fmtNumber(st.total, 0)}`
      : '';
    card.innerHTML = `
      <div class="flex items-baseline gap-2 text-[12px]">
        <span class="text-slate-300">${esc(st.state === 'ready' ? `Motor klar · structuralcodes ${st.ready?.structuralcodes_version || ''}` : short + counter)}</span>
        <span class="ml-auto num text-slate-500">${pct} %</span>
      </div>
      <div class="h-1.5 mt-2 rounded-full bg-slate-700 overflow-hidden">
        <div class="h-full ${bar} transition-[width] duration-150" style="width:${pct}%"></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-2 leading-snug">${
        st.state === 'ready'
          ? 'Kjøremotoren ble lastet mens du fylte ut skjemaet. Neste beregning starter med en gang.'
          : st.state === 'idle'
          ? 'Kjøremotoren er ikke lastet ned ennå — nettleseren er satt til å spare data. Den lastes når du trykker «Beregn».'
          : 'Kjøremotoren lastes i bakgrunnen mens du fyller ut. Du kan trykke «Beregn» nå — den kjører så snart motoren er klar.'
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
      return `<div class="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
        isError ? 'border-rose-600/50 bg-rose-950/30 text-rose-200' : 'border-amber-600/50 bg-amber-950/30 text-amber-200'
      }"><span>${isError ? '✕' : '⚠'}</span><span>${esc(i.message)}</span></div>`;
    }).join('');
  }

  /* ---------------------------------------------------------------- *
   * Resultat
   * ---------------------------------------------------------------- */

  /**
   * η slik det gjelder NÅ.
   *
   * Normalt er det motorens eget tall (plan §5.2 — alltid den vertikale
   * `M_Ed / M_Rd(N_Ed)`). Har brukeren bare endret `M_Ed` etter kjøringen,
   * regnes det på nytt av den LAGREDE `M_Rd`: kapasiteten er uavhengig av
   * `M_Ed`, så det er samme definisjon, ikke en ny.
   *
   * Alle andre endringer kaster resultatet (`invalidate()`), så denne grenen
   * kan aldri brukes på et tverrsnitt som ikke er det som ble regnet.
   */
  function liveUtilisation(result, state) {
    if (!loadsStale) return headlineUtilisation(result);
    const mRd = momentCapacity(result);
    if (!mRd) return null;
    return Math.abs(Number(state.loads.M_Ed) || 0) * 1e6 / mRd;
  }

  function renderResult() {
    const body = $('#res-body');
    const summary = $('#res-summary');
    if (!body) return;
    const s = store.getState();
    const result = s.result;

    if (!result) {
      if (summary) summary.textContent = '';
      body.innerHTML = `<div class="rounded-lg border border-dashed border-slate-700 px-5 py-10 text-center">
        <p class="text-slate-400 text-sm">Ingen beregning kjørt ennå.</p>
        <p class="text-slate-600 text-xs mt-1">Trykk <kbd>Ctrl</kbd> <kbd>⏎</kbd> — eller «Beregn» i bunnlinja.</p></div>`;
      return;
    }

    if (result.ok !== true) {
      // `{ok: false}` er et SVAR, ikke en krasj (plan §3.3). Det skal vises som
      // et resultat med tallene motoren faktisk klarte å oppgi.
      const code = result.error?.code || 'engine_error';
      if (summary) summary.textContent = 'Ingen kapasitet funnet';
      body.innerHTML = `<div class="rounded-xl border border-rose-600/50 bg-rose-950/20 p-4 space-y-2">
        <div class="text-rose-200 font-medium">${esc(messageForCode(code, ''))}</div>
        ${result.error?.detail ? `<details><summary class="text-[11px] text-slate-400">Teknisk detalj</summary>
           <pre class="text-[10px] text-slate-500 whitespace-pre-wrap mt-1">${esc(result.error.detail)}</pre></details>` : ''}
        <p class="text-[12px] text-slate-400">Dette er motorens svar på inndataene, ikke en feil i programmet.</p>
      </div>`;
      return;
    }

    const block = analysisBlock(result) || {};
    const eta = liveUtilisation(result, s);
    const status = utilisationStatus(eta);
    const mRd = momentCapacity(result);
    const props = result.section_props || {};
    const mats = result.materials || {};
    const bending = result.bending || block;
    const perMeter = s.sectionType === 'slab' ? '/m' : '';

    if (summary) {
      summary.innerHTML = `M<sub>Rd</sub> ${fmtMomentKNm(mRd)} kNm${perMeter} · η ${fmtRatio(eta, 2)}`;
    }

    const chart = renderChart(result, s);
    const warnings = describeWarnings(result.warnings);

    body.innerHTML = `
      ${loadsStale ? `<div class="mb-3 rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-200">
        M<sub>Ed</sub> er endret til <b class="num">${fmtNumber(s.loads.M_Ed, 1)} kNm${perMeter}</b> etter beregningen.
        Kapasiteten M<sub>Rd</sub> er uendret — den avhenger av N<sub>Ed</sub>, ikke av M<sub>Ed</sub> — og
        η over er regnet på nytt av den. Figurene og M<sub>Ed</sub>-linjene under viser fortsatt den
        <b>forrige</b> lastvirkningen. <kbd>Ctrl</kbd> <kbd>⏎</kbd> for å regne på nytt.</div>` : ''}
      <div class="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div class="space-y-4">
          <div class="rounded-xl border p-4 ${esc(status.classes)}">
            <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <div class="text-[11px] uppercase tracking-wide opacity-80">Utnyttelse η</div>
                <div class="text-4xl font-bold num">${fmtRatio(eta, 2)}</div>
                <div class="text-[11px] opacity-70 num">${esc(HEADLINE_UTILISATION_LABEL)}</div>
              </div>
              <div class="text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">M<sub>Rd</sub></div>
                <div class="text-2xl font-semibold num">${fmtMomentKNm(mRd)} <span class="text-sm text-slate-400">kNm${perMeter}</span></div>
                <div class="text-[11px] text-slate-400 num">M<sub>Ed</sub> = ${fmtMomentKNm(designMoment(result))} kNm${perMeter}</div>
              </div>
              <div class="text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">Bruddform</div>
                <div class="text-lg font-medium text-sky-300">${esc(failureModeLabel(bending.failure_mode))}</div>
                <div class="text-[11px] text-slate-400 num">x/d = ${fmtRatio(bending.x_over_d)}</div>
              </div>
              <div class="ml-auto text-right text-slate-100">
                <div class="text-[11px] text-slate-400 uppercase tracking-wide">Status</div>
                <div class="text-lg">${esc(status.label)}</div>
              </div>
            </div>
            <p class="text-[11px] mt-2 opacity-70">${esc(failureModeNote(bending.failure_mode))}</p>
          </div>

          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-1">Tverrsnitt med nøytralakse og trykksone</div>
            <div class="svg-fit" id="draw-result"></div>
            <p class="text-[11px] text-slate-500 mt-1 num">
              ε(z) = ε<sub>a</sub> + χ<sub>y</sub>·z · trykk i ${esc(compressionEdgeLabel(result.meta?.theta))} · trykk negativ
            </p>
          </div>

          ${chart}

          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-2">Tøyning og spenning per armeringslag</div>
            ${layerTable(bending, mats)}
          </div>

          ${warnings.length ? `<div class="space-y-2">${warnings.map((w) => `
            <div class="rounded-lg border px-3 py-2 text-[12px] ${w.severity === 'error'
              ? 'border-rose-600/50 bg-rose-950/30 text-rose-200'
              : 'border-amber-600/50 bg-amber-950/30 text-amber-200'}">
              <b>${esc(w.severityLabel)}:</b> ${esc(w.message)}
              ${w.hasDetail ? `<details class="mt-1"><summary class="text-[11px] opacity-70">Teknisk detalj</summary>
                <pre class="text-[10px] whitespace-pre-wrap mt-1 opacity-80">${esc(w.detail)}</pre></details>` : ''}
            </div>`).join('')}</div>` : ''}
        </div>

        <div class="space-y-3 text-[12px]">
          ${panel('Bruddtilstand', [
            ['Nøytralakse x', fmtLength(bending.x), 'mm'],
            ['x / d', fmtRatio(bending.x_over_d), ''],
            ['ε<sub>c</sub> ved trykkant', fmtStrainPermille(bending.eps_c_top), '‰'],
            ['ε<sub>s,maks</sub>', fmtStrainPermille(bending.eps_s_max), '‰'],
            ['ε<sub>a</sub> (i origo)', fmtStrainPermille(bending.eps_a, 3), '‰'],
            ['χ<sub>y</sub>', fmtCurvature(bending.chi_y), '10⁻⁶/mm'],
          ])}
          ${panel('Tverrsnitt (fra motoren)', [
            ['A<sub>g</sub>', fmtArea(props.Ag), 'mm²'],
            ['ΣA<sub>s</sub>', fmtArea(props.As_total, 1), `mm²${perMeter}`],
            ['A<sub>s</sub> i strekk', fmtArea(props.As_tension, 1), `mm²${perMeter}`],
            ['d (EC2, strekkarmering)', fmtLength(props.d_eff), 'mm'],
            ['d (vektet over alle lag)', fmtLength(props.d_eff_all), 'mm'],
            ['ρ = A<sub>s</sub>/(b<sub>t</sub>·d)', fmtPercent(props.rho, 3), '%'],
            ['A<sub>s,min</sub>', fmtArea(props.As_min, 1), 'mm²'],
            ['A<sub>s,max</sub>', fmtArea(props.As_max), 'mm²'],
            ['N<sub>min</sub> … N<sub>max</sub>', `${fmtNumber(toNum(props.n_min) / 1e3, 0)} … ${fmtNumber(toNum(props.n_max) / 1e3, 0)}`, 'kN'],
          ])}
          <div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div class="text-xs text-slate-400 mb-1.5">Kontroller</div>
            ${checkRows(result.checks).map((r) => `<div class="flex items-start gap-2 py-1">
              <span class="${r.ok === true ? 'text-emerald-400' : r.ok === false ? 'text-rose-400' : 'text-slate-500'} mt-px">${r.ok === true ? '✓' : r.ok === false ? '✕' : '–'}</span>
              <span class="text-slate-200">${esc(r.label)}</span>
              <span class="text-slate-500 ml-auto num">${esc(r.text)}</span></div>`).join('')}
          </div>
          <details class="rounded-lg border border-slate-700 bg-slate-900/50">
            <summary class="px-3 py-2 text-xs text-slate-400 hover:text-slate-200">Materialverdier ▸</summary>
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
              ['Betonglov', esc(lawLabel(mats.law_concrete)), ''],
              ['Ståll lov', esc(lawLabel(mats.law_steel)), ''],
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
        overlay: x === null ? null : { x, theta: toNum(result.meta?.theta) ?? thetaFor(s.direction) },
      });
    }
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

  function layerTable(bending, mats) {
    const layers = Array.isArray(bending.layers) ? bending.layers : [];
    if (!layers.length) return `<p class="text-[12px] text-slate-500">${DASH}</p>`;
    const fyd = toNum(mats.fyd);
    return `<table class="w-full text-[12px] num">
      <thead><tr class="text-slate-400 text-left border-b border-slate-700">
        <th class="py-1 font-medium">Lag</th><th class="font-medium">z</th><th class="font-medium">ε</th>
        <th class="font-medium">σ<sub>s</sub></th><th class="font-medium">σ/f<sub>yd</sub></th>
        <th class="font-medium">Tilstand</th></tr></thead>
      <tbody>${layers.map((l) => {
        const sigma = toNum(l.sigma);
        const ratio = sigma !== null && fyd ? sigma / fyd : null;
        return `<tr class="border-b border-slate-800">
          <td class="py-1 text-amber-300">${esc(l.id)}</td>
          <td>${fmtLength(l.z, 0)} mm</td>
          <td>${fmtStrainPermille(l.eps)} ‰</td>
          <td>${fmtStress(l.sigma)} MPa</td>
          <td>${fmtRatio(ratio)}</td>
          <td class="${l.compression ? 'text-sky-300' : 'text-amber-200'}">${l.compression ? 'trykk' : 'strekk'}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function renderChart(result, s) {
    const perMeter = s.sectionType === 'slab' ? '/m' : '';
    if (result.analysis === 'moment_curvature') {
      const mc = result.moment_curvature || {};
      return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <div class="text-xs text-slate-400 mb-1">Moment–krumning ved N<sub>Ed</sub> = ${fmtNumber(toNum(mc.N_Ed) / 1e3, 1)} kN</div>
        <div class="svg-fit">${momentCurvatureSvg(mc, { width: 620, unit: 'px', theme: 'dark' })}</div>
        <p class="text-[11px] text-slate-500 mt-1 num">
          ${fmtNumber((mc.kappa || []).length, 0)} punkter${mc.truncated ? ' — kurven er AVKORTET' : ''}.
          ${mc.yield_index === null || mc.yield_index === undefined ? 'Flytepunktet er ikke identifisert.' : `Flytning ved punkt ${fmtNumber(mc.yield_index + 1, 0)}.`}
          Siste punkt skal være lik M<sub>Rd</sub> = ${fmtMomentKNm(mc.M_Rd)} kNm${perMeter}.
        </p></div>`;
    }
    if (result.analysis === 'nm_domain') {
      const dom = result.nm_domain || {};
      const rad = radialUtilisation(dom, toNum(dom.N_Ed) / 1e3, toNum(dom.M_Ed) / 1e6);
      return `<div class="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <div class="text-xs text-slate-400 mb-1">M–N-omhylling med lastpunkt</div>
        <div class="svg-fit">${nmDomainSvg(dom, { width: 620, unit: 'px', theme: 'dark' })}</div>
        <p class="text-[11px] text-slate-500 mt-1 num">
          η er den VERTIKALE utnyttelsen M<sub>Ed</sub>/M<sub>Rd</sub>(N<sub>Ed</sub>) — samme tall i alle tre analysene.
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
      geo.innerHTML = `${esc(sectionTypeLabel(s.sectionType))} ${fmtNumber(sectionWidth(s), 0)}×${fmtNumber(s.geometry.h, 0)} · ` +
        `C${fmtNumber(s.concrete.fck, 0)} · ${s.direction === 'sagging' ? 'felt' : 'støtte'}`;
    }

    const arm = $('#bar-arm');
    if (arm) {
      const As = result ? toNum(result.section_props?.As_total) : totalArea(s.layers);
      const d = result ? toNum(result.section_props?.d_eff) : est.d_eff;
      arm.innerHTML = `ΣA<sub>s</sub> ${fmtArea(As)} mm²${perMeter} · d ${fmtLength(d, 0)} mm` +
        (result ? '' : ' <span class="text-slate-600">(estimat)</span>');
    }

    const strip = $('#bar-inspect');
    if (strip) {
      if (!result) {
        // Uten et gyldig resultat står stripa TOM, ikke med gamle tall. Alt
        // som kunne gjort tallene ugyldige har alt kastet dem (`invalidate()`).
        strip.innerHTML = `<div class="leading-tight"><div class="text-[9px] uppercase text-slate-500">η</div>` +
          `<div class="text-xl font-bold num text-slate-700">${DASH}</div></div>`;
      } else {
        const eta = liveUtilisation(result, s);
        const status = utilisationStatus(eta);
        const bending = result.bending || analysisBlock(result) || {};
        const cell = (label, value) =>
          `<div class="leading-tight"><div class="text-[9px] uppercase text-slate-500">${label}</div>` +
          `<div class="num text-slate-200">${value}</div></div>`;
        // Fargen og merkelappen kommer fra `results.js` sin `utilisationStatus`
        // — samme kilde som rapporten bruker (plan §7: tersklene står ETT sted).
        strip.innerHTML =
          `<div class="leading-tight px-2 py-0.5 rounded border ${esc(status.classes)}" title="${esc(status.label)}">
             <div class="text-[9px] uppercase opacity-70">η${loadsStale ? ' (ny M_Ed)' : ''}</div>
             <div class="text-xl font-bold num">${fmtRatio(eta, 2)}</div></div>` +
          cell('M_Rd', `${fmtMomentKNm(momentCapacity(result))} kNm${perMeter}`) +
          cell('x', `${fmtLength(bending.x)} mm`) +
          cell('x/d', fmtRatio(bending.x_over_d)) +
          cell('Bruddform', esc(failureModeLabel(bending.failure_mode)));
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
      el.title = cancellable
        ? 'Avbryt moment–krumningen. De punktene som alt er regnet beholdes.'
        : 'Denne analysen tar under et tiendedels sekund og kan ikke avbrytes.';
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
      // Lagene er konvertert mellom `bars` og `spacing`; låsene følger id-ene
      // og er fortsatt gyldige. Resultatet gjelder derimot et annet tverrsnitt.
      invalidate();
      editing = null;
      render();
    });
    renderSegment('#dir-seg', s.direction, (v) => {
      store.setState({ direction: v });
      invalidate();
      render();
    });

    renderChips('#fck-chips', CONCRETE_GRADES.map((g) => ({ value: String(g.fck), label: g.label })),
      String(s.concrete.fck), (v) => { store.patch('concrete', { fck: Number(v) }); invalidate(); render(); });
    renderChips('#fyk-chips', STEEL_GRADES.map((g) => ({ value: String(g.fyk) + '|' + g.k + '|' + g.epsuk, label: g.label })),
      `${s.steel.fyk}|${s.steel.k}|${s.steel.epsuk}`, (v) => {
        const [fyk, k, epsuk] = v.split('|').map(Number);
        store.patch('steel', { fyk, k, epsuk });
        invalidate(); render();
      });
    renderChips('#ana-chips', ANALYSES.map(([value]) => ({ value, label: analysisLabel(value) })),
      s.analysis, (v) => { store.setState({ analysis: v }); invalidate(); render(); });
    const anaDesc = $('#ana-desc');
    if (anaDesc) anaDesc.textContent = (ANALYSES.find((a) => a[0] === s.analysis) || ['', ''])[1];

    const mats = derivedMaterials(s);
    const matSum = $('#mat-summary');
    if (matSum) {
      const grade = CONCRETE_GRADES.find((g) => g.fck === Number(s.concrete.fck));
      matSum.innerHTML = `${esc(grade ? grade.label : `f<sub>ck</sub> ${fmtNumber(s.concrete.fck, 0)}`)} · ` +
        `B${fmtNumber(s.steel.fyk, 0)} · ${esc(lawLabel(s.concrete.law))}`;
    }
    const facSum = $('#fac-summary');
    if (facSum) {
      facSum.innerHTML = `Faktorer og arbeidsdiagram — γ<sub>c</sub> ${fmtNumber(s.concrete.gamma_c, 2)} · ` +
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

    const est = derived(s);
    const perMeter = s.sectionType === 'slab' ? '/m' : '';
    const armSum = $('#arm-summary');
    if (armSum) {
      armSum.innerHTML = `${s.layers.length} lag · ΣA<sub>s</sub> ${fmtArea(est.As_total)} mm²${perMeter}`;
    }
    const armTot = $('#arm-total');
    if (armTot) {
      armTot.innerHTML = `ΣA<sub>s</sub> ${fmtArea(est.As_total)} mm²${perMeter} · ` +
        `d ≈ ${fmtLength(est.d_eff, 0)} mm · ρ ≈ ${fmtPercent(est.rho, 3)} % ` +
        `<span class="text-slate-600">(estimat til motoren har kjørt)</span>`;
    }
    const armWarn = $('#arm-warn');
    if (armWarn) {
      armWarn.innerHTML = est.As_total < est.As_min
        ? `⚠ under A<sub>s,min</sub> ≈ ${fmtArea(est.As_min)} mm²`
        : '';
    }

    const shInput = $('#sh-input');
    if (shInput) shInput.placeholder = s.sectionType === 'slab' ? 'ø12 c113 uk 31' : '3ø20 uk 50';
    const shHint = $('#sh-hint');
    if (shHint) {
      shHint.innerHTML = s.sectionType === 'slab'
        ? `<span class="font-mono text-slate-400">ø12 c113 uk 31</span> · <span class="font-mono text-slate-400">ø10/150 ok</span> · ` +
          `d<sub>c</sub> utelatt = overdekning + Ø/2 = ${fmtNumber(suggestedDc(s, 12), 1)} mm 🔒`
        : `<span class="font-mono text-slate-400">3ø20 uk 50</span> · <span class="font-mono text-slate-400">2x25 ok</span> · ` +
          `d<sub>c</sub> utelatt = overdekning + bøyle + Ø/2 = ${fmtNumber(suggestedDc(s, 20), 1)} mm 🔒`;
    }

    const loadSum = $('#load-summary');
    if (loadSum) {
      loadSum.innerHTML = `N<sub>Ed</sub> ${fmtNumber(s.loads.N_Ed, 1)} kN · M<sub>Ed</sub> ${fmtNumber(s.loads.M_Ed, 1)} kNm${perMeter} · ` +
        `${esc(directionLabel(s.direction))}`;
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
      else if (k === 'f') { store.setState({ direction: 'sagging' }); invalidate(); render(); }
      else if (k === 's') { store.setState({ direction: 'hogging' }); invalidate(); render(); }
      else if ('123'.includes(k)) { store.setState({ analysis: ANALYSES[Number(k) - 1][0] }); invalidate(); render(); }
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
    const ids = ['s-mat', 's-geo', 's-arm', 's-last', 's-calc', 's-res'];
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
      setupButtons();
      setupKeyboard();
      setupNav();
      // Alle lag starter med avledet `d_c`. `store.defaultState()` setter den
      // allerede til `cover + stirrup + Ø/2`, så låsen er sann fra start.
      for (const l of store.getState().layers) dcLocked.set(l.id, true);
      render();
    },
    render,
    renderEngine,
    /** Beregningen er i gang / ferdig — styrer «Beregn» og «Avbryt». */
    setBusy(value) {
      busy = Boolean(value);
      renderButtons();
    },
    /** Kalles av `main.js` når et FERSKT resultat er lagt i tilstanden. */
    clearStale() {
      loadsStale = false;
    },
    isStale() {
      return loadsStale;
    },
  };
}
