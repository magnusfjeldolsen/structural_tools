/**
 * ui.js — All DOM read/write for Cable Designer.
 *
 * Rules:
 *  - No calculation logic
 *  - No worker communication
 *  - Reads state from store (via snapshot passed from app.js subscribe callback)
 *  - Emits events via callbacks registered by app.js
 */

import { fmt, fmtSci } from './units.js';

// ── Callback registry (set by app.js) ────────────────────────────────────────
const _cb = {};
export function registerCallbacks(callbacks) {
  Object.assign(_cb, callbacks);
}

// ── Full render (called on every state change) ────────────────────────────────
export function render(state) {
  _renderStatus(state);
  _renderGeometry(state);
  _renderMaterial(state);
  _renderPointLoadsTable(state);
  _renderLineLoadsTable(state);
  _renderSolverMethod(state);
  _renderAnalyzeButton(state);
  _renderResults(state);
}

// ── Status badge ──────────────────────────────────────────────────────────────
function _renderStatus(state) {
  const badge = document.getElementById('pyodide-status');
  if (!badge) return;
  if (state.pyodideReady) {
    badge.textContent = 'Engine ready';
    badge.className = 'px-2 py-0.5 rounded text-xs font-medium bg-emerald-900 text-emerald-300 border border-emerald-700';
  } else {
    badge.textContent = 'Loading engine…';
    badge.className = 'px-2 py-0.5 rounded text-xs font-medium bg-amber-900 text-amber-300 border border-amber-700 animate-pulse';
  }
}

// ── Geometry inputs ───────────────────────────────────────────────────────────
function _renderGeometry(state) {
  _setVal('input-span', state.span);
  _setVal('input-nsegments', state.nSegments);
  const label = document.getElementById('nsegments-label');
  if (label) label.textContent = state.nSegments;
}

// ── Material inputs ───────────────────────────────────────────────────────────
function _renderMaterial(state) {
  _setVal('input-aeff', state.aEff);
  _setVal('input-emodulus', state.eModulus);
}

// ── Solver method ─────────────────────────────────────────────────────────────
function _renderSolverMethod(state) {
  const sel = document.getElementById('input-method');
  if (sel && sel.value !== state.method) sel.value = state.method;
}

// ── Analyze button ────────────────────────────────────────────────────────────
function _renderAnalyzeButton(state) {
  const btn = document.getElementById('btn-analyze');
  if (!btn) return;
  const disabled = !state.pyodideReady || state.isAnalyzing;
  btn.disabled = disabled;

  if (state.isAnalyzing) {
    btn.innerHTML = `
      <svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Analyzing…`;
    btn.className = 'w-full py-3 rounded-lg font-semibold text-sm bg-sky-800 text-sky-300 cursor-not-allowed';
  } else if (!state.pyodideReady) {
    btn.textContent = 'Loading engine…';
    btn.className = 'w-full py-3 rounded-lg font-semibold text-sm bg-gray-700 text-gray-500 cursor-not-allowed';
  } else {
    btn.textContent = 'Analyze';
    btn.className = 'w-full py-3 rounded-lg font-semibold text-sm bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer';
  }
}

// ── Point loads table ─────────────────────────────────────────────────────────
function _renderPointLoadsTable(state) {
  const tbody = document.getElementById('point-loads-tbody');
  if (!tbody) return;

  if (state.pointLoads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="px-3 py-4 text-center text-gray-500 text-xs italic">
          No point loads — click Add to create one
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = state.pointLoads.map(l => `
    <tr class="border-t border-gray-800 hover:bg-gray-800/40 group" data-id="${l.id}">
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0" max="${state.span}"
          class="load-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="position" data-id="${l.id}" value="${l.position}"
          placeholder="m">
      </td>
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0.001"
          class="load-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="magnitude" data-id="${l.id}" value="${l.magnitude}"
          placeholder="kN">
      </td>
      <td class="px-2 py-1.5 text-center">
        <button class="btn-delete-point opacity-60 group-hover:opacity-100 text-red-400 hover:text-red-300
                       text-xs px-2 py-1 rounded hover:bg-red-900/40 transition-all"
          data-id="${l.id}">✕</button>
      </td>
    </tr>`).join('');

  // Bind events
  tbody.querySelectorAll('.load-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.id);
      const field = e.target.dataset.field;
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) _cb.onUpdatePointLoad?.(id, field, value);
    });
  });
  tbody.querySelectorAll('.btn-delete-point').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.dataset.id);
      _cb.onDeletePointLoad?.(id);
    });
  });
}

// ── Line loads table ──────────────────────────────────────────────────────────
function _renderLineLoadsTable(state) {
  const tbody = document.getElementById('line-loads-tbody');
  if (!tbody) return;

  if (state.lineLoads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-3 py-4 text-center text-gray-500 text-xs italic">
          No line loads — click Add to create one
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = state.lineLoads.map(l => `
    <tr class="border-t border-gray-800 hover:bg-gray-800/40 group" data-id="${l.id}">
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0" max="${state.span}"
          class="ll-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="startPos" data-id="${l.id}" value="${l.startPos}" placeholder="m">
      </td>
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0" max="${state.span}"
          class="ll-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="endPos" data-id="${l.id}" value="${l.endPos}" placeholder="m">
      </td>
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0"
          class="ll-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="startMag" data-id="${l.id}" value="${l.startMag}" placeholder="kN/m">
      </td>
      <td class="px-2 py-1.5">
        <input type="number" step="any" min="0"
          class="ll-input w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900
                 focus:outline-none focus:border-sky-500"
          data-field="endMag" data-id="${l.id}" value="${l.endMag}" placeholder="kN/m">
      </td>
      <td class="px-2 py-1.5 text-center">
        <button class="btn-delete-line opacity-60 group-hover:opacity-100 text-red-400 hover:text-red-300
                       text-xs px-2 py-1 rounded hover:bg-red-900/40 transition-all"
          data-id="${l.id}">✕</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.ll-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.id);
      const field = e.target.dataset.field;
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) _cb.onUpdateLineLoad?.(id, field, value);
    });
  });
  tbody.querySelectorAll('.btn-delete-line').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.dataset.id);
      _cb.onDeleteLineLoad?.(id);
    });
  });
}

// ── Results section ───────────────────────────────────────────────────────────
export function showError(msg) {
  const el = document.getElementById('error-message');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function hideError() {
  document.getElementById('error-message')?.classList.add('hidden');
}

function _renderResults(state) {
  const section = document.getElementById('results-section');
  const placeholder = document.getElementById('results-placeholder');
  if (!section || !placeholder) return;

  if (state.error) {
    showError(state.error);
  } else {
    hideError();
  }

  if (!state.results) {
    section.classList.add('hidden');
    placeholder.classList.remove('hidden');
    return;
  }

  section.classList.remove('hidden');
  placeholder.classList.add('hidden');

  const r = state.results;

  // Summary cards
  _card('card-H',           fmt(r.H, 'force', 2));
  _card('card-Tmax',        fmt(r.T_max, 'force', 2));
  _card('card-f',           fmt(r.f, 'length', 4));
  _card('card-sag-ratio',   r.sag_ratio.toFixed(5));
  _card('card-Rleft',       fmt(r.R_left, 'force', 2));
  _card('card-Rright',      fmt(r.R_right, 'force', 2));
  _card('card-stress',      fmt(r.stress, 'stress', 2));
  _card('card-strain',      fmtSci(r.strain, 'strain', 3));

  // Convergence info
  const convEl = document.getElementById('convergence-info');
  if (convEl) {
    const ok = r.converged ? '✓ Converged' : '⚠ Not converged';
    convEl.innerHTML = `
      <span class="${r.converged ? 'text-emerald-400' : 'text-amber-400'} font-medium">${ok}</span>
      &nbsp;·&nbsp; Method: <span class="text-gray-300">${r.method}</span>
      &nbsp;·&nbsp; Iterations: <span class="text-gray-300">${r.iterations}</span>
      &nbsp;·&nbsp; Cable length: <span class="text-gray-300">${fmt(r.cable_length, 'length', 4)}</span>
      &nbsp;·&nbsp; Elongation: <span class="text-gray-300">${fmt(r.elongation, 'length', 6)}</span>
      &nbsp;·&nbsp; Angles: <span class="text-gray-300">${r.angle_left.toFixed(2)}° / ${r.angle_right.toFixed(2)}°</span>
    `;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setVal(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  // Avoid resetting while user is typing
  if (document.activeElement === el) return;
  if (el.value !== String(value)) el.value = value;
}

function _card(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
