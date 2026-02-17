/**
 * store.js — Central reactive state for Cable Designer.
 *
 * Rules:
 *  - No DOM access
 *  - No calculation logic
 *  - Subscribers are notified after every mutation
 *
 * All user-facing values are stored in USER units (m, kN, kN/m, mm², MPa).
 * Conversion to internal units happens in app.js when building the analysis payload.
 */

let _state = {
  // ── Geometry ────────────────────────────────────────────────────────────────
  span: 10.0,          // [m]
  nSegments: 200,      // integer

  // ── Material ─────────────────────────────────────────────────────────────────
  aEff: 1130.0,        // [mm²]  (2 × ∅Ø27 strand example)
  eModulus: 200000.0,  // [MPa]

  // ── Loads ────────────────────────────────────────────────────────────────────
  // Each entry: { id, position, magnitude }  (position m, magnitude kN)
  pointLoads: [],

  // Each entry: { id, startPos, endPos, startMag, endMag }  (m, kN/m)
  lineLoads: [
    { id: 1, startPos: 0.0, endPos: 10.0, startMag: 20.0, endMag: 20.0 }
  ],

  // ── Solver ───────────────────────────────────────────────────────────────────
  method: 'rootfinding',   // 'rootfinding' | 'fixed_point'

  // ── UI state ─────────────────────────────────────────────────────────────────
  pyodideReady: false,
  isAnalyzing: false,
  error: null,

  // ── Results (null until analyzed; cleared on any input change) ───────────────
  results: null,

  // Internal id counter for loads
  _nextId: 2,
};

// ── Subscribers ───────────────────────────────────────────────────────────────
const _subscribers = new Set();

export function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

function _notify() {
  const snap = getState();
  _subscribers.forEach(fn => fn(snap));
}

// ── Read ──────────────────────────────────────────────────────────────────────
export function getState() {
  // Shallow clone with deep-cloned arrays so subscribers can't mutate state
  return {
    ..._state,
    pointLoads: _state.pointLoads.map(l => ({ ...l })),
    lineLoads:  _state.lineLoads.map(l => ({ ...l })),
    results:    _state.results,   // results object treated as immutable
  };
}

// ── Generic setter (clears results) ──────────────────────────────────────────
function _set(partial) {
  _state = { ..._state, ...partial, results: null, error: null };
  _notify();
}

// ── Geometry ──────────────────────────────────────────────────────────────────
export function setSpan(v)       { _set({ span: v }); }
export function setNSegments(v)  { _set({ nSegments: v }); }

// ── Material ──────────────────────────────────────────────────────────────────
export function setAEff(v)       { _set({ aEff: v }); }
export function setEModulus(v)   { _set({ eModulus: v }); }

// ── Solver ────────────────────────────────────────────────────────────────────
export function setMethod(v)     { _set({ method: v }); }

// ── Point loads ───────────────────────────────────────────────────────────────
export function addPointLoad() {
  const id = _state._nextId++;
  const defaultPos = _state.span / 2;
  _state = {
    ..._state,
    pointLoads: [..._state.pointLoads, { id, position: defaultPos, magnitude: 10.0 }],
    _nextId: _state._nextId,
    results: null,
    error: null,
  };
  _notify();
}

export function updatePointLoad(id, field, value) {
  _state = {
    ..._state,
    pointLoads: _state.pointLoads.map(l => l.id === id ? { ...l, [field]: value } : l),
    results: null,
    error: null,
  };
  _notify();
}

export function deletePointLoad(id) {
  _state = {
    ..._state,
    pointLoads: _state.pointLoads.filter(l => l.id !== id),
    results: null,
    error: null,
  };
  _notify();
}

// ── Line loads ────────────────────────────────────────────────────────────────
export function addLineLoad() {
  const id = _state._nextId++;
  _state = {
    ..._state,
    lineLoads: [..._state.lineLoads, { id, startPos: 0.0, endPos: _state.span, startMag: 10.0, endMag: 10.0 }],
    _nextId: _state._nextId,
    results: null,
    error: null,
  };
  _notify();
}

export function updateLineLoad(id, field, value) {
  _state = {
    ..._state,
    lineLoads: _state.lineLoads.map(l => l.id === id ? { ...l, [field]: value } : l),
    results: null,
    error: null,
  };
  _notify();
}

export function deleteLineLoad(id) {
  _state = {
    ..._state,
    lineLoads: _state.lineLoads.filter(l => l.id !== id),
    results: null,
    error: null,
  };
  _notify();
}

// ── UI state (do NOT clear results) ──────────────────────────────────────────
export function setPyodideReady(v) {
  _state = { ..._state, pyodideReady: v };
  _notify();
}

export function setAnalyzing(v) {
  _state = { ..._state, isAnalyzing: v };
  _notify();
}

export function setError(msg) {
  _state = { ..._state, error: msg, isAnalyzing: false };
  _notify();
}

export function setResults(results) {
  _state = { ..._state, results, isAnalyzing: false, error: null };
  _notify();
}
