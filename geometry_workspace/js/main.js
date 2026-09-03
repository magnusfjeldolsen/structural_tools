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
import { snapLabel } from './snapping.js';
import { lengthLabel } from './units.js';

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

tools.onCursor = (p, type) => {
  const u = lengthLabel(store.state.unit);
  document.getElementById('cursor-readout').textContent = `x ${fmtLen(p[0])}   y ${fmtLen(p[1])}   ${u}`;
  const label = type === 'ortho' ? 'orto' : snapLabel(type);
  document.getElementById('snap-badge').textContent = label ? `snap: ${label.toLowerCase()}` : '';
};

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

const TOOL_KEYS = {
  v: 'select',
  r: 'rect',
  s: 'shell',
  p: 'polygon',
  c: 'circle',
  o: 'reference',
  m: 'move',
  k: 'copy',
  t: 'rotate',
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
    document.getElementById('help-overlay').classList.add('hidden');
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
window.__gw = {
  store,
  viewport,
  tools,
  ui,
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
