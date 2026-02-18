/**
 * app.js — Orchestrator for Cable Designer.
 *
 * Responsibilities:
 *  - Initialise the Web Worker and Pyodide
 *  - Wire DOM events → store mutations
 *  - Subscribe to store → trigger UI render + chart updates
 *  - Build analysis payload (with unit conversions) and send to worker
 *  - Receive worker results and push to store
 *
 * No business logic, no DOM styling.
 */

import * as store from './store.js';
import * as ui from './ui.js';
import { renderAllCharts, destroyAllCharts } from './charts.js';
import { toInternal } from './units.js';

// ── Worker setup ──────────────────────────────────────────────────────────────
let _worker = null;
let _pendingResolve = null;
let _pendingReject = null;

function _initWorker() {
  _worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

  _worker.onmessage = ({ data }) => {
    switch (data.type) {
      case 'ready':
        store.setPyodideReady(true);
        break;

      case 'progress':
        // Update status badge text without touching store results
        {
          const badge = document.getElementById('pyodide-status');
          if (badge && !store.getState().pyodideReady) {
            badge.textContent = data.payload.message;
          }
        }
        break;

      case 'result':
        store.setResults(data.payload);
        break;

      case 'error':
        store.setError(data.payload.message);
        break;
    }
  };

  _worker.onerror = (e) => {
    store.setError(`Worker error: ${e.message}`);
  };

  _worker.postMessage({ type: 'init' });
}

// ── Analysis trigger ──────────────────────────────────────────────────────────
function _runAnalysis() {
  const s = store.getState();
  if (!s.pyodideReady || s.isAnalyzing) return;

  // Validate: at least one load
  if (s.pointLoads.length === 0 && s.lineLoads.length === 0) {
    store.setError('Add at least one load before analyzing.');
    return;
  }

  // Build payload — convert user units to internal units
  const payload = {
    span:       s.span,                                   // m → m
    n_segments: s.nSegments,
    a_eff:      toInternal(s.aEff, 'area'),               // mm² → m²
    e_modulus:  toInternal(s.eModulus, 'stress'),         // MPa → kN/m²
    method:     s.method,
    point_loads: s.pointLoads.map(pl => ({
      position:  pl.position,
      magnitude: pl.magnitude,
    })),
    line_loads: s.lineLoads.map(ll => ({
      start_pos: ll.startPos,
      end_pos:   ll.endPos,
      start_mag: ll.startMag,
      end_mag:   ll.endMag,
    })),
  };

  destroyAllCharts();
  store.setAnalyzing(true);

  const msgId = `analyze-${Date.now()}`;
  _worker.postMessage({ type: 'analyze', msgId, payload });
}

// ── DOM event bindings ────────────────────────────────────────────────────────
function _bindEvents() {
  // Geometry
  document.getElementById('input-span')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) store.setSpan(v);
  });

  const nSegInput = document.getElementById('input-nsegments');
  nSegInput?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    if (!isNaN(v) && v >= 10 && v <= 1000) store.setNSegments(v);
  });

  // Material
  document.getElementById('input-aeff')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) store.setAEff(v);
  });

  document.getElementById('input-emodulus')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) store.setEModulus(v);
  });

  // Solver method
  document.getElementById('input-method')?.addEventListener('change', e => {
    store.setMethod(e.target.value);
  });

  // Analyze button
  document.getElementById('btn-analyze')?.addEventListener('click', _runAnalysis);

  // Load CRUD — add buttons
  document.getElementById('btn-add-point-load')?.addEventListener('click', () => {
    store.addPointLoad();
  });

  document.getElementById('btn-add-line-load')?.addEventListener('click', () => {
    store.addLineLoad();
  });
}

// ── Subscribe to store → render UI + charts ───────────────────────────────────
function _onStateChange(state) {
  ui.render(state);

  if (state.results) {
    renderAllCharts(state.results, state);
  }
}

// ── Register UI callbacks (called back into store mutations) ──────────────────
ui.registerCallbacks({
  onUpdatePointLoad: (id, field, value) => store.updatePointLoad(id, field, value),
  onDeletePointLoad: (id) => store.deletePointLoad(id),
  onUpdateLineLoad:  (id, field, value) => store.updateLineLoad(id, field, value),
  onDeleteLineLoad:  (id) => store.deleteLineLoad(id),
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
export function init() {
  _bindEvents();
  store.subscribe(_onStateChange);

  // Initial render with default state
  _onStateChange(store.getState());

  // Start worker
  _initWorker();
}
