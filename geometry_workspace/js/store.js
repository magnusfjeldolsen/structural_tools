/**
 * store.js — tilstand og CRUD for geometri-workspacet.
 *
 * Enkel observerbar state med undo/redo og lagring i localStorage.
 * Ingen DOM-avhengigheter utover localStorage.
 */

import { boundsOfShapes, translatePoints } from './geometry.js';

const STORAGE_KEY = 'geometry_workspace_v1';
const MAX_HISTORY = 60;

export const PALETTE = [
  '#38bdf8', // sky
  '#f472b6', // pink
  '#a3e635', // lime
  '#fbbf24', // amber
  '#c084fc', // purple
  '#34d399', // emerald
  '#fb7185', // rose
  '#60a5fa', // blue
];

let uid = 1;
function nextId() {
  return `s${uid++}`;
}

function defaultState() {
  return {
    shapes: [],
    selection: [],
    reference: [0, 0],
    mode: 'priority', // 'priority' | 'sum'
    unit: 'mm',
    grid: { step: 50, snap: true, visible: true },
    title: '',
  };
}

export class Store {
  constructor() {
    this.state = defaultState();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this._pending = null;
  }

  /* ---------------- abonnement ---------------- */

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason = 'change') {
    this.listeners.forEach((fn) => fn(this.state, reason));
  }

  /* ---------------- historikk ---------------- */

  snapshot() {
    return JSON.stringify({
      shapes: this.state.shapes,
      reference: this.state.reference,
      mode: this.state.mode,
      unit: this.state.unit,
      grid: this.state.grid,
      title: this.state.title,
    });
  }

  /**
   * Kjører en mutasjon og legger forrige tilstand på undo-stacken.
   * `transient` brukes under drag: da hopper vi over historikken helt til
   * dragen committes med commit().
   */
  mutate(fn, { transient = false, reason = 'change' } = {}) {
    if (!transient) {
      this.undoStack.push(this._pending ?? this.snapshot());
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack.length = 0;
      this._pending = null;
    } else if (this._pending === null) {
      this._pending = this.snapshot();
    }
    fn(this.state);
    this.persist();
    this.emit(reason);
  }

  /** Avslutter en transient sekvens (f.eks. et drag) som ett undo-steg. */
  commit(reason = 'commit') {
    if (this._pending === null) return;
    this.undoStack.push(this._pending);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack.length = 0;
    this._pending = null;
    this.persist();
    this.emit(reason);
  }

  restore(json) {
    const data = JSON.parse(json);
    Object.assign(this.state, data);
    this.state.selection = this.state.selection.filter((id) =>
      this.state.shapes.some((s) => s.id === id)
    );
    this.syncUid();
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.persist();
    this.emit('undo');
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.persist();
    this.emit('redo');
    return true;
  }

  syncUid() {
    let max = 0;
    for (const s of this.state.shapes) {
      const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    uid = max + 1;
  }

  /* ---------------- CRUD ---------------- */

  addShape(points, opts = {}) {
    const shape = {
      id: nextId(),
      name: opts.name || 'Form',
      points: points.map((p) => [p[0], p[1]]),
      role: opts.role || 'solid',
      factor: Number.isFinite(opts.factor) ? opts.factor : 1,
      include: true,
      color: opts.color || PALETTE[this.state.shapes.length % PALETTE.length],
      meta: opts.meta || null,
    };
    this.mutate((st) => {
      st.shapes.unshift(shape); // nyeste øverst = høyest prioritet
      st.selection = [shape.id];
    }, { reason: 'add' });
    return shape;
  }

  getShape(id) {
    return this.state.shapes.find((s) => s.id === id) || null;
  }

  updateShape(id, patch, opts = {}) {
    this.mutate((st) => {
      const s = st.shapes.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }, opts);
  }

  setPoints(id, points, opts = {}) {
    this.updateShape(id, { points: points.map((p) => [p[0], p[1]]) }, opts);
  }

  removeShapes(ids) {
    const set = new Set(ids);
    this.mutate((st) => {
      st.shapes = st.shapes.filter((s) => !set.has(s.id));
      st.selection = st.selection.filter((id) => !set.has(id));
    }, { reason: 'remove' });
  }

  duplicateShapes(ids, dx = 0, dy = 0) {
    const set = new Set(ids);
    const copies = [];
    this.mutate((st) => {
      const src = st.shapes.filter((s) => set.has(s.id));
      for (const s of src) {
        const copy = {
          ...s,
          id: nextId(),
          name: `${s.name} (kopi)`,
          points: translatePoints(s.points, dx, dy),
        };
        copies.push(copy);
        st.shapes.unshift(copy);
      }
      st.selection = copies.map((c) => c.id);
    }, { reason: 'duplicate' });
    return copies;
  }

  /** Flytter en form opp (-1) eller ned (+1) i prioritetslista. */
  reorder(id, delta) {
    this.mutate((st) => {
      const i = st.shapes.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= st.shapes.length) return;
      const [s] = st.shapes.splice(i, 1);
      st.shapes.splice(j, 0, s);
    }, { reason: 'reorder' });
  }

  /* ---------------- utvalg ---------------- */

  select(ids, additive = false) {
    const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
    this.state.selection = additive
      ? Array.from(new Set([...this.state.selection, ...list]))
      : list;
    this.emit('selection');
  }

  toggleSelect(id) {
    const sel = new Set(this.state.selection);
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    this.state.selection = Array.from(sel);
    this.emit('selection');
  }

  selectedShapes() {
    const set = new Set(this.state.selection);
    return this.state.shapes.filter((s) => set.has(s.id));
  }

  /* ---------------- innstillinger ---------------- */

  setReference(pt, opts = {}) {
    this.mutate((st) => {
      st.reference = [pt[0], pt[1]];
    }, { reason: 'reference', ...opts });
  }

  setMode(mode) {
    this.mutate((st) => {
      st.mode = mode;
    }, { reason: 'mode' });
  }

  setGrid(patch) {
    this.mutate((st) => {
      Object.assign(st.grid, patch);
    }, { reason: 'grid' });
  }

  setUnit(unit) {
    this.mutate((st) => {
      st.unit = unit;
    }, { reason: 'unit' });
  }

  setTitle(title) {
    this.mutate((st) => {
      st.title = title;
    }, { reason: 'title', transient: true });
  }

  clear() {
    this.mutate((st) => {
      st.shapes = [];
      st.selection = [];
    }, { reason: 'clear' });
  }

  bounds() {
    return boundsOfShapes(this.state.shapes);
  }

  /* ---------------- persistens ---------------- */

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, this.snapshot());
    } catch (err) {
      /* privat modus / full kvote — ikke kritisk */
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      this.restore(raw);
      this.emit('load');
      return true;
    } catch (err) {
      console.warn('[store] kunne ikke laste lagret modell:', err);
      return false;
    }
  }

  toJSON() {
    return JSON.stringify(
      {
        format: 'structural_tools.geometry_workspace',
        version: 1,
        title: this.state.title,
        unit: this.state.unit,
        mode: this.state.mode,
        reference: this.state.reference,
        grid: this.state.grid,
        shapes: this.state.shapes,
      },
      null,
      2
    );
  }

  fromJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.shapes)) throw new Error('Ugyldig fil: mangler "shapes"');
    this.mutate((st) => {
      st.shapes = data.shapes.map((s, i) => ({
        id: s.id || `s${i + 1}`,
        name: s.name || `Form ${i + 1}`,
        points: (s.points || []).map((p) => [Number(p[0]), Number(p[1])]),
        role: s.role === 'void' ? 'void' : 'solid',
        factor: Number.isFinite(s.factor) ? s.factor : 1,
        include: s.include !== false,
        color: s.color || PALETTE[i % PALETTE.length],
        meta: s.meta || null,
      }));
      st.selection = [];
      st.reference = data.reference || [0, 0];
      st.mode = data.mode === 'sum' ? 'sum' : 'priority';
      st.unit = data.unit || 'mm';
      st.title = data.title || '';
      if (data.grid) Object.assign(st.grid, data.grid);
    }, { reason: 'import' });
    this.syncUid();
  }
}

export const store = new Store();
