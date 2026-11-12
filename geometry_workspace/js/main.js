/**
 * main.js — monterer cad2d-editoren og legger geometry_workspace sitt domene
 * oppå: skjøtene (joint-extension.js), panelene (ui.js), bildeunderlaget og
 * rapporten.
 *
 * Lerretet, verktøyene, tallinntastingen og tastaturkartet er cad2d sine
 * (#93). `keyboard: 'page'`: GW er én editor i hele vinduet, og hurtigtastene
 * skal virke uansett hvor fokus står — som før.
 */

import { analyze, hasClipper } from '../../cad2d/js/geometry/polygon.js';
import * as shapes from '../../cad2d/js/geometry/params.js';
import { snapLabel } from '../../cad2d/js/input/snapping.js';
import { lengthLabel } from '../../cad2d/js/core/units.js';
import { mountCadEditor } from '../../cad2d/js/editor/editor.js';
import { store } from './store.js';
import { installJoints } from './joint-extension.js';
import { shapeFill, contourStyle } from './shape-style.js';
import { UI, fmtLen } from './ui.js';
import { UnderlayManager, defaultPlacement } from './underlay.js';
import { buildFigureSvg } from './report-figure.js';
import { buildReportHtml, stageReportForPrint, clearPrintStage, audit } from './report.js';

const host = document.getElementById('canvas-host');

/**
 * I «Forsterkning» er lerretet låst: et klikk velger en skjøt (eller tømmer
 * utvalget), og ingenting kan dras, tegnes eller redigeres. Panorering og
 * zoom ligger i viewport-en og virker som før.
 */
const locked = () => ui && ui.mode === 'reinforcement';

function pickJoint(e) {
  const hit = joints.hit(e.world, 8, true);
  if (!hit) {
    store.select([]);
    return;
  }
  if (e.shift) store.toggleSelect(hit.id);
  else store.select([hit.id]);
  joints.onPicked?.(hit.id);
}

function hoverJoint(e) {
  const hit = joints.hit(e.world, 8, true);
  const id = hit ? hit.id : null;
  viewport.setHoverOf('joint', id);
  joints.onHover?.(id);
}

let ui = null;
let joints = null;

const editor = mountCadEditor(host, {
  document: store,
  chrome: false,
  keyboard: 'page',
  numericHost: host.parentElement || host,
  // Fyll etter tilstand (ny/eksisterende), kontur etter materialfamilie
  style: {
    fill: (s, byStage) => shapeFill(s, byStage),
    contour: (s) => contourStyle(s),
    // Oransje med lav dekkevne blir brunt mot den mørke bakgrunnen; den nye
    // delen får derfor litt mer, så den faktisk leses som oransje.
    fillBoost: (s, byStage) => (byStage && s.stage === 'new' ? 0.14 : 0),
  },
  extensions: [
    (ed) => {
      joints = installJoints(ed);
    },
  ],
  interceptPointer: (type, e) => {
    if (!locked()) return false;
    if (type === 'pointerdown') pickJoint(e);
    else if (type === 'pointermove') hoverJoint(e);
    return true;
  },
  extraData: () => ({ joints: store.allJoints() }),
  onRender: (analysis) => {
    if (ui) ui.render(analysis);
  },
  onAnalysisError: () => ui && ui.toast('Beregningen feilet på denne geometrien — sjekk at polygonene ikke er selvskjærende.'),
  getThickness: () => (ui ? ui.getThickness() : 200),
  onStatus: (msg) => ui && ui.status(msg),
  onToolChange: (tool) => ui && ui.onToolChanged(tool),
  onVoidMode: (on) => ui && ui.onVoidMode(on),
  onCursor: (p, type) => {
    const u = lengthLabel(store.state.unit);
    document.getElementById('cursor-readout').textContent = `x ${fmtLen(p[0])}   y ${fmtLen(p[1])}   ${u}`;
    const label = type === 'ortho' ? 'orto' : snapLabel(type);
    document.getElementById('snap-badge').textContent = label ? `snap: ${label.toLowerCase()}` : '';
  },
  keyHooks: {
    // Snap-knappene i panelet skal følge med, så GW sitt panel eier dem
    snapShortcut: (e) => ui.handleSnapShortcut(e),
    toggleOrtho: () => ui.toggleOrtho(),
    deleteSelected: () => ui.deleteSelected(),
    duplicateSelected: () => ui.duplicateSelected(),
    status: (msg) => ui.status(msg),
    locked,
    onEscape: (e, typing) => {
      // Rapportoverlegget dekker hele skjermen. Er det åpent, er det ÅPENBART
      // det brukeren vil ut av — og da skal Esc ikke også tømme utvalget bak
      // det, som brukeren ikke kan se.
      const overlay = document.getElementById('report-overlay');
      if (overlay && !overlay.hidden) {
        closeReport();
        return true;
      }
      document.getElementById('help-overlay').classList.add('hidden');
      document.getElementById('import-menu').classList.add('hidden');
      document.getElementById('canvas-settings').classList.add('hidden');
      ui.closePopover();
      ui.reinforcement.closeFigure();
      return false;
    },
  },
});

const { viewport, tools, numeric } = editor;

/* ------------------------------------------------------------------ *
 * Bildeunderlag
 * ------------------------------------------------------------------ */

const underlay = new UnderlayManager(
  ({ image, name, restored }) => {
    viewport.setUnderlayImage(image);
    if (restored) {
      // Plasseringen ligger allerede i modellen; bare bildet manglet
      editor.scheduleRender();
      return;
    }
    store.setUnderlay({ ...defaultPlacement(image, viewport), name });
    ui.toast(`Bilde lagt inn: ${name}. Kalibrer målestokken med to punkt.`);
  },
  (msg) => ui.toast(msg, 3500)
);

ui = new UI(store, viewport, tools, { underlayManager: underlay, joints });

underlay.bind(host);
tools.onCalibrated = (payload) => ui.onCalibrationPicked(payload);

/* ------------------------------------------------------------------ *
 * Oppstart
 * ------------------------------------------------------------------ */

if (!hasClipper()) {
  ui.toast('Fant ikke polygon-clipping. Overlapp kan ikke fjernes — bruk «Sum»-modus.', 8000);
}

const restored = store.load();
tools.setTool('select');
editor.render();
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
  editor,
  viewport,
  tools,
  ui,
  numeric,
  joints,
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
        joints: store.allJoints(),
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
