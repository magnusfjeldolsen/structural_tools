/**
 * store.js — tilstand og CRUD for geometri-workspacet.
 *
 * Enkel observerbar state med undo/redo og lagring i localStorage.
 * Ingen DOM-avhengigheter utover localStorage.
 */

import { boundsOfShapes, translatePoints } from './geometry.js';
import { conversionFactor, unitInfo } from './units.js';
import { SNAP_KEYS } from './snapping.js';

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

/**
 * Standardmateriale for en form. E er i N/mm², uavhengig av arbeidsenheten,
 * fordi mekanikken alltid regnes i N og mm.
 *
 * MERK: dette er en innebygd standard slik at datamodellen står støtt alene.
 * Presetlista og materialvelgeren hører hjemme i `js/materials.js` — agent C
 * kobler dette feltet mot den modulen.
 */
export const DEFAULT_MATERIAL = { name: 'S355', E: 210000 };

/** Standard lastdata. V og N i kN, M i kNm, L i arbeidsenheten. */
export function defaultLoads() {
  return { V: 0, N: 0, M: 0, L: 1000 };
}

/**
 * Oppgraderer én form til gjeldende datamodell. `stage` skiller eksisterende
 * tverrsnitt fra den nye delen som limes eller skrus på, og `material.E`
 * brukes av forsterkningsberegningen. `factor` er fortsatt bare en vektfaktor
 * for tyngdepunktsberegningen — de to er uavhengige.
 */
function migrateShape(s) {
  const mat = s && s.material;
  return {
    ...s,
    stage: s && s.stage === 'new' ? 'new' : 'existing',
    material: {
      name: mat && mat.name ? String(mat.name) : DEFAULT_MATERIAL.name,
      E: mat && Number.isFinite(mat.E) ? mat.E : DEFAULT_MATERIAL.E,
    },
  };
}

/**
 * Oppgraderer lagret tilstand fra eldre versjoner. Tidligere lå snap som et
 * enkelt av/på-flagg på rutenettet; nå er det én bryter per snap-type.
 * Fra versjon 2 har hver form `stage` og `material`, og modellen har
 * `interfaces` og `loads`.
 */
function migrate(data) {
  const out = { ...data };
  if (out.grid && out.grid.snap !== undefined) {
    const on = !!out.grid.snap;
    out.snaps = {
      endpoint: on,
      midpoint: on,
      edge: on,
      intersection: on,
      center: false,
      grid: on,
      ...(out.snaps || {}),
    };
    out.grid = { step: out.grid.step, visible: out.grid.visible };
  }
  if (!out.snaps) {
    out.snaps = { endpoint: true, midpoint: true, edge: true, intersection: true, center: false, grid: true };
  }
  // Fyll ut manglende nøkler hvis nye snap-typer er kommet til
  for (const key of SNAP_KEYS) if (out.snaps[key] === undefined) out.snaps[key] = key !== 'center';
  if (out.ortho === undefined) out.ortho = false;
  if (out.underlay === undefined) out.underlay = null;
  if (Array.isArray(out.shapes)) out.shapes = out.shapes.map(migrateShape);
  if (!Array.isArray(out.interfaces)) out.interfaces = [];
  out.loads = { ...defaultLoads(), ...(out.loads || {}) };
  return out;
}

function defaultState() {
  return {
    shapes: [],
    selection: [],
    reference: [0, 0],
    // Standard er skallmodellens tverrsnitt, der overlapp telles dobbelt
    mode: 'sum', // 'sum' | 'priority'
    unit: 'mm',
    grid: { step: 50, visible: true },
    snaps: { endpoint: true, midpoint: true, edge: true, intersection: true, center: false, grid: true },
    ortho: false,
    underlay: null,
    title: '',
    // Grensesnitt mellom eksisterende og ny del. Fylles av agent C.
    interfaces: [],
    loads: defaultLoads(),
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
      snaps: this.state.snaps,
      ortho: this.state.ortho,
      underlay: this.state.underlay,
      title: this.state.title,
      interfaces: this.state.interfaces,
      loads: this.state.loads,
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

  /**
   * Forkaster en transient sekvens og setter tilstanden tilbake til slik den
   * var da sekvensen startet. Brukes av Esc i flytte-, kopi- og
   * roteringsverktøyet, slik at et avbrutt verktøy ikke legger igjen spor —
   * verken i geometrien eller i historikken.
   */
  rollback(reason = 'cancel') {
    if (this._pending === null) return false;
    const json = this._pending;
    this._pending = null;
    this.restore(json);
    this.persist();
    this.emit(reason);
    return true;
  }

  /** Er en transient sekvens i gang? */
  get isTransient() {
    return this._pending !== null;
  }

  restore(json) {
    const data = JSON.parse(json);
    Object.assign(this.state, migrate(data));
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
      // Nytt tegnet materiale hører som standard til det eksisterende
      // tverrsnittet; brukeren merker selv av hva som er ny del.
      stage: opts.stage === 'new' ? 'new' : 'existing',
      material: opts.material
        ? { name: opts.material.name, E: opts.material.E }
        : { ...DEFAULT_MATERIAL },
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

  /**
   * Setter punkter på flere former under ett. Flytte-, roterings- og
   * speilverktøyet bruker denne med `transient: true` under forhåndsvisningen,
   * og avslutter med commit(), slik at hele kommandoen blir ett undo-steg.
   */
  setManyPoints(entries, opts = {}) {
    this.mutate((st) => {
      for (const { id, points } of entries) {
        const s = st.shapes.find((x) => x.id === id);
        if (s) s.points = points.map((p) => [p[0], p[1]]);
      }
    }, opts);
  }

  /**
   * Flytter formene, og eventuelt nullpunktet med samme vektor. Sentrering
   * bruker `withReference`, slik at referansemålene i resultatpanelet ikke
   * endrer seg utilsiktet av at geometrien blir flyttet.
   */
  moveShapes(ids, dx, dy, { withReference = false, reason = 'move' } = {}) {
    const set = new Set(ids);
    this.mutate((st) => {
      for (const s of st.shapes) {
        if (set.has(s.id)) s.points = translatePoints(s.points, dx, dy);
      }
      if (withReference) st.reference = [st.reference[0] + dx, st.reference[1] + dy];
    }, { reason });
  }

  /**
   * Legger igjen kopier av formene. `variants` er én oppføring per kopi, og
   * kan være enten en forskyvning `[dx, dy]` eller en funksjon
   * `(points, shape) => points` for kopier som også speiles eller roteres.
   * Hele rekka blir ett undo-steg, slik at en rekke-kopi angres under ett.
   */
  copyShapes(ids, variants, { select = true, reason = 'copy' } = {}) {
    const set = new Set(ids);
    const copies = [];
    this.mutate((st) => {
      const src = st.shapes.filter((s) => set.has(s.id));
      for (const v of variants) {
        const apply = typeof v === 'function' ? v : (pts) => translatePoints(pts, v[0], v[1]);
        for (const s of src) {
          const copy = {
            ...s,
            id: nextId(),
            name: `${s.name} (kopi)`,
            points: apply(s.points, s).map((p) => [p[0], p[1]]),
            // Egen materialobjekt, ellers ville kopien dele det med originalen
            material: { ...s.material },
          };
          copies.push(copy);
          st.shapes.unshift(copy);
        }
      }
      if (select && copies.length) st.selection = copies.map((c) => c.id);
    }, { reason });
    return copies;
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
          // Egen materialobjekt, ellers ville kopien dele det med originalen
          material: { ...s.material },
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

  setSnaps(patch) {
    this.mutate((st) => {
      Object.assign(st.snaps, patch);
    }, { reason: 'snaps', transient: true });
    this.commit('snaps');
  }

  setOrtho(on) {
    this.mutate((st) => {
      st.ortho = !!on;
    }, { reason: 'ortho', transient: true });
    this.commit('ortho');
  }

  /**
   * Bytter arbeidsenhet. Alle koordinater regnes om slik at geometrien
   * beholder sin fysiske størrelse — det er tallene som endrer seg, ikke
   * tegningen.
   */
  setUnit(unit, { convert = true } = {}) {
    const from = this.state.unit;
    if (unit === from) return;
    const k = convert ? conversionFactor(from, unit) : 1;
    this.mutate((st) => {
      st.unit = unit;
      if (k !== 1) {
        st.shapes = st.shapes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x * k, y * k]) }));
        st.reference = [st.reference[0] * k, st.reference[1] * k];
        st.grid.step = st.grid.step * k;
        // Grensesnittlinjene er geometri, og L er en lengde i arbeidsenheten
        st.interfaces = st.interfaces.map((f) => ({
          ...f,
          a: [f.a[0] * k, f.a[1] * k],
          b: [f.b[0] * k, f.b[1] * k],
        }));
        if (Number.isFinite(st.loads.L)) st.loads.L = st.loads.L * k;
        if (st.underlay) {
          st.underlay = {
            ...st.underlay,
            x: st.underlay.x * k,
            y: st.underlay.y * k,
            width: st.underlay.width * k,
            height: st.underlay.height * k,
          };
        }
      } else {
        st.grid.step = unitInfo(unit).defaultGrid;
      }
    }, { reason: 'unit' });
  }

  /* ---------------- bildeunderlag ---------------- */

  setUnderlay(patch, opts = {}) {
    this.mutate((st) => {
      st.underlay = patch ? { ...(st.underlay || {}), ...patch } : null;
    }, { reason: 'underlay', ...opts });
  }

  clearUnderlay() {
    this.mutate((st) => {
      st.underlay = null;
    }, { reason: 'underlay' });
  }

  setTitle(title) {
    this.mutate((st) => {
      st.title = title;
    }, { reason: 'title', transient: true });
  }

  /** Globale lastdata for forsterkningsberegningen. */
  setLoads(patch) {
    this.mutate((st) => {
      Object.assign(st.loads, patch);
    }, { reason: 'loads', transient: true });
    this.commit('loads');
  }

  clear() {
    this.mutate((st) => {
      st.shapes = [];
      st.selection = [];
      st.interfaces = [];
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
        version: 2,
        title: this.state.title,
        unit: this.state.unit,
        mode: this.state.mode,
        reference: this.state.reference,
        grid: this.state.grid,
        snaps: this.state.snaps,
        ortho: this.state.ortho,
        underlay: this.state.underlay,
        shapes: this.state.shapes,
        interfaces: this.state.interfaces,
        loads: this.state.loads,
      },
      null,
      2
    );
  }

  fromJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.shapes)) throw new Error('Ugyldig fil: mangler "shapes"');
    this.mutate((st) => {
      st.shapes = data.shapes.map((s, i) =>
        // migrateShape fyller inn stage og material for filer fra versjon 1
        migrateShape({
          id: s.id || `s${i + 1}`,
          name: s.name || `Form ${i + 1}`,
          points: (s.points || []).map((p) => [Number(p[0]), Number(p[1])]),
          role: s.role === 'void' ? 'void' : 'solid',
          factor: Number.isFinite(s.factor) ? s.factor : 1,
          include: s.include !== false,
          color: s.color || PALETTE[i % PALETTE.length],
          meta: s.meta || null,
          stage: s.stage,
          material: s.material,
        })
      );
      st.selection = [];
      st.reference = data.reference || [0, 0];
      st.mode = data.mode === 'priority' ? 'priority' : 'sum';
      st.unit = data.unit || 'mm';
      st.title = data.title || '';
      const m = migrate(data);
      if (m.grid) Object.assign(st.grid, m.grid);
      if (m.snaps) Object.assign(st.snaps, m.snaps);
      st.ortho = !!m.ortho;
      st.underlay = m.underlay || null;
      st.interfaces = m.interfaces;
      st.loads = m.loads;
    }, { reason: 'import' });
    this.syncUid();
  }
}

export const store = new Store();
