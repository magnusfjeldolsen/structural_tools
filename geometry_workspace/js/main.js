/**
 * main.js — kobler sammen store, viewport, verktøy og UI.
 */

import { analyze, hasClipper } from './geometry.js';
import * as shapes from './shapes.js';
import { store } from './store.js';
import { Viewport } from './viewport.js';
import { ToolController } from './tools.js';
import { UI, fmtLen } from './ui.js';
import { UnderlayManager, defaultPlacement } from './underlay.js';
import { NumericInput } from './numeric-input.js';
import { snapLabel } from './snapping.js';
import { lengthLabel } from './units.js';
import { buildFigureSvg } from './report-figure.js';
import { buildReportHtml, stageReportForPrint, clearPrintStage, audit } from './report.js';

const host = document.getElementById('canvas-host');

const viewport = new Viewport(host, {
  pointerdown: (e) => tools.pointerdown(e),
  pointermove: (e) => tools.pointermove(e),
  pointerup: (e) => tools.pointerup(e),
  dblclick: (e) => tools.dblclick(e),
});

const tools = new ToolController(store, viewport, {
  getThickness: () => ui.getThickness(),
  onStatus: (msg) => ui.status(msg),
  onToolChange: (tool) => {
    ui.onToolChanged(tool);
    scheduleRender();
  },
});

/* ------------------------------------------------------------------ *
 * Bildeunderlag
 * ------------------------------------------------------------------ */

const underlay = new UnderlayManager(
  ({ image, name, restored }) => {
    viewport.setUnderlayImage(image);
    if (restored) {
      // Plasseringen ligger allerede i modellen; bare bildet manglet
      scheduleRender();
      return;
    }
    store.setUnderlay({ ...defaultPlacement(image, viewport), name });
    ui.toast(`Bilde lagt inn: ${name}. Kalibrer målestokken med to punkt.`);
  },
  (msg) => ui.toast(msg, 3500)
);

const ui = new UI(store, viewport, tools, { underlayManager: underlay });

underlay.bind(host);
tools.onCalibrated = (payload) => ui.onCalibrationPicked(payload);

/* ------------------------------------------------------------------ *
 * Avlesning av markørposisjon
 * ------------------------------------------------------------------ */

/** Siste markørposisjon i lerretspiksler — tallfeltet dukker opp her. */
let lastCursorPx = null;

tools.onCursor = (p, type) => {
  const u = lengthLabel(store.state.unit);
  document.getElementById('cursor-readout').textContent = `x ${fmtLen(p[0])}   y ${fmtLen(p[1])}   ${u}`;
  const label = type === 'ortho' ? 'orto' : snapLabel(type);
  document.getElementById('snap-badge').textContent = label ? `snap: ${label.toLowerCase()}` : '';
  lastCursorPx = viewport.worldToScreen(p[0], p[1]);
};

/* ------------------------------------------------------------------ *
 * Tallinntasting (§2)
 * ------------------------------------------------------------------ */

/**
 * Feltet lever i lerretets overlegg, ikke i panelet. `main.js` sender
 * tastetrykk hit FØR hurtigtastene, slik at «bare begynn å skrive» virker
 * uten at noe verktøy vet om det.
 */
const numeric = new NumericInput({
  host: host.parentElement || host,
  getUnit: () => lengthLabel(store.state.unit),
  getExpect: () => tools.expectedInput(),
  getAnchor: () => lastCursorPx,
  // Alt+siffer (snap/orto) har forrang, også midt i en inntasting
  onSnapShortcut: (e) => ui.handleSnapShortcut(e),
  onStatus: (msg) => ui.status(msg),
  onCommit: (v) => {
    const res = tools.applyNumeric(v);
    if (res && res.msg) ui.status(res.msg);
    scheduleRender();
    return res;
  },
  onCancel: () => ui.status(tools.hint()),
});

/* ------------------------------------------------------------------ *
 * Beregning og oppdatering
 * ------------------------------------------------------------------ */

let pending = false;

function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    update();
  });
}

function update() {
  const st = store.state;
  let analysis = null;
  try {
    analysis = analyze(st.shapes, st.mode);
  } catch (err) {
    console.error('[main] analyse feilet:', err);
    ui.toast('Beregningen feilet på denne geometrien — sjekk at polygonene ikke er selvskjærende.');
  }
  viewport.setData({
    shapes: st.shapes,
    selection: st.selection,
    analysis,
    reference: st.reference,
    grid: st.grid,
    underlay: st.underlay,
    joints: st.joints,
  });
  try {
    ui.render(analysis);
  } catch (err) {
    // En feil i panelrenderingen skal ikke ta ned lerretet
    console.error('[main] rendering av panelene feilet:', err);
  }
}

store.subscribe(() => scheduleRender());

/* ------------------------------------------------------------------ *
 * Hurtigtaster
 * ------------------------------------------------------------------ */

/**
 * Hurtigtaster for verktøy (§3). `M`, `C` og `R` er reservert til flytt, kopi
 * og rotasjon — de tre kommandoene man bruker oftest — og tegneverktøyene har
 * flyttet seg etter det: `B` boks (rektangel), `O` er rund (sirkel), `N`
 * nullpunkt. Speiling har bevisst INGEN tast, bare verktøyknappen.
 */
const TOOL_KEYS = {
  v: 'select',
  m: 'move',
  c: 'copy',
  r: 'rotate',
  b: 'rect',
  s: 'shell',
  p: 'polygon',
  o: 'circle',
  n: 'reference',
  g: 'joint',
  x: 'splitline',
};

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

  // Alt+siffer styrer snap. Dette skal virke også midt i et tallfelt, siden
  // man ofte vil endre snap uten å måtte klikke seg ut av det man skriver.
  // Alt uten Ctrl, så AltGr (= Ctrl+Alt) på norsk tastatur ikke fanges opp.
  if (ui.handleSnapShortcut(e)) {
    e.preventDefault();
    return;
  }

  // Escape er en KASKADE, og ett trykk skal alltid gi et rent utgangspunkt.
  // Rekkefølgen er: forlat feltet man skriver i, avbryt en kommando som er i
  // gang, og ellers tøm utvalget. Steg 1 og 2 skjer i samme trykk — står man i
  // et tallfelt mens en rotasjon pågår, skal ikke Esc måtte trykkes to ganger.
  if (e.key === 'Escape') {
    // Rapportoverlegget dekker hele skjermen. Er det åpent, er det ÅPENBART
    // det brukeren vil ut av — og da skal Esc ikke også tømme utvalget bak
    // det, som brukeren ikke kan se. Derfor `return` her, ikke gjennomfall.
    const overlay = document.getElementById('report-overlay');
    if (overlay && !overlay.hidden) {
      closeReport();
      return;
    }
    document.getElementById('help-overlay').classList.add('hidden');
    document.getElementById('import-menu').classList.add('hidden');
    document.getElementById('canvas-settings').classList.add('hidden');
    ui.closePopover();
    if (typing) e.target.blur();
    // Hva som var i gang må avgjøres FØR tools.keydown rydder det bort
    const busy = !!(tools.draft || tools.drag);
    tools.keydown(e);
    if (!busy && store.state.selection.length) {
      store.select([]);
      ui.status('Utvalget er tømt.');
    }
    return;
  }
  if (typing) return;

  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (k === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }
    if (k === 'd') {
      e.preventDefault();
      ui.duplicateSelected();
      return;
    }
    if (k === 'a') {
      e.preventDefault();
      store.select(store.state.shapes.map((s) => s.id));
      return;
    }
    return;
  }

  // Tallinntastingen får tasten FØR hurtigtastene (§2.4). Det er dette som
  // gjør at sifrene, `-`, `.`, `,` og `d` ikke lenger kan utløse verktøybytte
  // mens et verktøy venter på et punkt — feltet tar dem.
  if (numeric.beginIfTypingKey(e)) {
    e.preventDefault();
    return;
  }

  if (tools.keydown(e)) return;

  if (e.key === 'F8') {
    e.preventDefault();
    ui.toggleOrtho();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    ui.deleteSelected();
    return;
  }
  if (e.key.toLowerCase() === 'f') {
    viewport.zoomToFit(store.bounds());
    return;
  }
  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (tool) tools.setTool(tool);
});

/* ------------------------------------------------------------------ *
 * Oppstart
 * ------------------------------------------------------------------ */

if (!hasClipper()) {
  ui.toast('Fant ikke polygon-clipping. Overlapp kan ikke fjernes — bruk «Sum»-modus.', 8000);
}

const restored = store.load();
tools.setTool('select');
update();
viewport.zoomToFit(store.bounds());

// Hent fram bildeunderlaget fra forrige økt, hvis modellen viser til ett
if (store.state.underlay) {
  underlay.restore().then((img) => {
    if (!img) {
      store.clearUnderlay();
      ui.toast('Fant ikke igjen bildeunderlaget — legg det inn på nytt.');
    }
  });
}

if (!restored || !store.state.shapes.length) {
  ui.status('Tegn geometri, eller trykk «Eksempel» for vegg på bunnplate. Trykk «?» for hjelp.');
} else {
  ui.toast(`Hentet fram forrige modell (${store.state.shapes.length} former).`);
}

// Nyttig for feilsøking i konsollet. `emit` sender en syntetisk pekerhendelse
// i verdenskoordinater rett inn i verktøyet, slik at hele klikkflyten kan
// kjøres uten mus — det er slik verktøyene testes.
/* ------------------------------------------------------------------ *
 * Rapporten
 *
 * Bygges PÅ FORESPØRSEL — når overlegget åpnes, og ved `beforeprint`. Aldri i
 * `scheduleRender()`-løkka: den kjører på hver store-oppdatering, og rapporten
 * er altfor tung til det. Ingenting ved rapporten trenger å være ferskt før
 * noen faktisk ser på den.
 * ------------------------------------------------------------------ */

function renderReport() {
  const host = document.querySelector('#report-overlay .report-content');
  if (!host) return;
  const st = store.state;
  host.innerHTML = buildReportHtml(st, analyze(st.shapes, st.mode));
}

function openReport() {
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  const box = document.getElementById('rep-detailed');
  if (box) box.checked = !!(store.state.report && store.state.report.detailed);
  renderReport();
  overlay.hidden = false;

  // Måler om noe kommer til å splittes over et sideskift, og sier det med én
  // gang i stedet for å la brukeren oppdage det i PDF-en. `oversize` er den
  // eneste sjekken som er sann uavhengig av utskriftsmotoren; `straddle` er
  // bare en indikasjon og nevnes derfor ikke her.
  const out = document.getElementById('rep-audit');
  if (out) {
    const a = audit();
    if (a.error) out.textContent = '';
    else if (a.oversize.length) {
      out.textContent = `${a.oversize.length} blokk(er) er høyere enn én side og vil bli delt.`;
      out.className = 'text-amber-300';
    } else {
      out.textContent = `Side 1: ${a.page1Mm.toFixed(0)} av 259 mm.`;
      out.className = a.page1Ok ? 'text-slate-400' : 'text-amber-300';
    }
  }
}

function closeReport() {
  const overlay = document.getElementById('report-overlay');
  if (overlay) overlay.hidden = true;
  clearPrintStage();
}

document.getElementById('btn-report').addEventListener('click', openReport);
document.getElementById('rep-close').addEventListener('click', closeReport);
document.getElementById('rep-print').addEventListener('click', () => window.print());
// Den detaljerte beregningsdelen. Valget lagres i modellen, så det følger med
// i eksport-JSON og står ved neste økt — man skrur ikke av og på hver gang.
document.getElementById('rep-detailed').addEventListener('change', (e) => {
  store.setReportDetailed(e.target.checked);
  openReport();   // bygger på nytt og måler side 1 igjen
});

document.getElementById('rep-guides').addEventListener('change', (e) => {
  const c = document.querySelector('#report-overlay .report-content');
  if (!c) return;
  if (e.target.checked) c.setAttribute('data-page-guides', '');
  else c.removeAttribute('data-page-guides');
});

// Ctrl+P skal gi NØYAKTIG samme dokument som «Skriv ut»-knappen. Er overlegget
// lukket, bygges rapporten først og rives ned igjen etterpå — ellers ville
// Ctrl+P skrevet ut appen, som er det ingen vil.
let printedWhileClosed = false;
window.addEventListener('beforeprint', () => {
  const overlay = document.getElementById('report-overlay');
  const wasClosed = !overlay || overlay.hidden;
  if (wasClosed) {
    renderReport();
    printedWhileClosed = true;
  }
  stageReportForPrint();
});
window.addEventListener('afterprint', () => {
  clearPrintStage();
  printedWhileClosed = false;
});

window.__gw = {
  store,
  viewport,
  tools,
  ui,
  numeric,
  analyze,
  shapes,
  emit(type, world, opts = {}) {
    const px = viewport.worldToScreen(world[0], world[1]);
    const e = { type, world, px, button: 0, shift: false, ctrl: false, alt: false, ...opts };
    if (type === 'pointerdown') tools.pointerdown(e);
    else if (type === 'pointermove') tools.pointermove(e);
    else if (type === 'pointerup') tools.pointerup(e);
    else if (type === 'dblclick') tools.dblclick(e);
    return e;
  },
  /**
   * Rapportens deler, til øyekontroll i konsollet (bølge B).
   * `__gw.report.figure()` gir måltegningen som SVG-streng; lim den inn i en
   * tom fil, eller `open(URL.createObjectURL(new Blob([s], {type:'image/svg+xml'})))`.
   */
  report: {
    open: openReport,
    close: closeReport,
    render: renderReport,
    audit,
    html: () => buildReportHtml(store.state, analyze(store.state.shapes, store.state.mode)),
    figure() {
      const st = store.state;
      return buildFigureSvg({
        unit: st.unit,
        mode: st.mode,
        shapes: st.shapes,
        joints: st.joints,
        reference: st.reference,
        analysis: analyze(st.shapes, st.mode),
        res: ui.reinforcement ? ui.reinforcement.result : null,
      });
    },
  },
  /** Siste utregning i «Forsterkning»-fanen, til kontrollregning i konsollet. */
  rf() {
    return ui.reinforcement ? ui.reinforcement.result : null;
  },
  /** Klikk = flytt markøren dit først, som en ekte peker gjør. */
  click(world, opts = {}) {
    this.emit('pointermove', world, opts);
    this.emit('pointerdown', world, opts);
    this.emit('pointerup', world, opts);
  },
};
