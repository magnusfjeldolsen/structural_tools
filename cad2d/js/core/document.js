/**
 * document.js — dokumentmodellen i cad2d: entiteter, CRUD, utvalg, angre/gjør
 * om, endringshendelser og JSON.
 *
 * Ingen DOM. `localStorage` brukes bare når dokumentet er laget med en
 * `storageKey`, og bare gjennom `persist()`/`load()`.
 *
 * Trukket ut av geometry_workspace/js/store.js (#93). Historikken er den samme
 * som der: hele dokumentet som JSON-øyeblikksbilde per angresteg. Det er
 * enkelt, robust og raskt nok for tverrsnitt med noen hundre former.
 *
 * ENTITETER
 * Hver entitet har en stabil `id` med prefiks per type og løpenummer per
 * dokument (`s1`, `l3`, …). To dokumenter på samme side deler aldri teller.
 * Typene er registrert i `this.kinds`; `shape` og `line` er innebygd, og en
 * modul legger til sine egne med `registerKind` (geometry_workspace: `joint`).
 *
 * UTVIDELSESPUNKT FOR DOMENET (overstyres i en underklasse)
 *  - `_snapshotKeys()`   tilstandsfeltene som er med i angrehistorikken og lagres
 *  - `_migrate(data)`    oppgraderer lagret tilstand
 *  - `_decorateShape()`  felt domenet legger på en ny form
 *  - `_scaleExtra()`     domenets lengder når enheten byttes
 *  - `_clearExtra()`     det «Tøm all geometri» også skal tømme
 *  - `withFollowing(ids)` entiteter som følger med når `ids` flyttes
 *  - `followedNoun(n)`   ordet for det som følger med, til statuslinja
 */

import {
  boundsOfShapes,
  translatePoints,
  multiProps,
  pointsToMulti,
  splitPointsByLine,
  openRing,
  EPS as GEOM_EPS,
} from '../geometry/polygon.js';
import { contoursFromLines } from '../geometry/linework.js';
import { conversionFactor, unitInfo } from './units.js';

export const DOCUMENT_FORMAT = 'cad2d.document';
export const DOCUMENT_VERSION = 1;
export const MAX_HISTORY = 60;

/** Fargene nye former får etter tur. */
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

/**
 * Snap-typene som er på i et nytt dokument. Nøklene MÅ være de samme som
 * `SNAP_KEYS` i input/snapping.js — det låses av en test, siden kjernen ikke
 * importerer fra input-laget.
 */
export const DEFAULT_SNAPS = Object.freeze({
  endpoint: true,
  midpoint: true,
  edge: true,
  intersection: true,
  center: false,
  grid: true,
});

/** Linjearbeid fra fil: bare gyldige punkt, og `closed` som boolsk. */
export function migrateLines(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((l) => l && Array.isArray(l.points) && l.points.length >= 2)
    .map((l, i) => ({
      id: l.id || `l${i + 1}`,
      points: l.points.map((p) => [Number(p[0]), Number(p[1])]),
      closed: !!l.closed,
    }));
}

/**
 * Oppgraderer kjernens del av en lagret tilstand: snap-bryterne (fra det
 * gamle ene flagget på rutenettet), orto, underlag og linjearbeid. Domenets
 * egne felt tar underklassen seg av (`_migrate`).
 */
export function migrateCore(data) {
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
  if (!out.snaps) out.snaps = { ...DEFAULT_SNAPS };
  // Fyll ut manglende nøkler hvis nye snap-typer er kommet til
  for (const key of Object.keys(DEFAULT_SNAPS)) if (out.snaps[key] === undefined) out.snaps[key] = key !== 'center';
  if (out.ortho === undefined) out.ortho = false;
  if (out.underlay === undefined) out.underlay = null;
  out.lines = migrateLines(out.lines);
  out.linesVisible = out.linesVisible !== false;
  return out;
}

/** Kjernens tilstand i et nytt dokument. */
export function defaultCoreState() {
  return {
    shapes: [],
    selection: [],
    reference: [0, 0],
    // Standard er skallmodellens tverrsnitt, der overlapp telles dobbelt
    mode: 'sum', // 'sum' | 'priority'
    unit: 'mm',
    grid: { step: 50, visible: true },
    snaps: { ...DEFAULT_SNAPS },
    ortho: false,
    underlay: null,
    title: '',
    // Linjearbeid: løse linjer å lage geometri av. Teller ikke i areal.
    lines: [],
    linesVisible: true,
  };
}

/** Felt i historikken og i lagringen, i den rekkefølgen de skrives. */
const CORE_SNAPSHOT_KEYS = ['shapes', 'reference', 'mode', 'unit', 'grid', 'snaps', 'ortho', 'underlay', 'title', 'lines', 'linesVisible'];

const identityPoints = (o) => o.points;

/**
 * Standard for en entitetstype. `order` bestemmer rekkefølgen typene gås
 * gjennom i (oppslag, kopi), `insert` hvor nye legges ('front' = øverst, som
 * former: nyeste har høyest prioritet).
 */
function kindDef(name, def) {
  return {
    name,
    collection: def.collection,
    prefix: def.prefix,
    order: Number.isFinite(def.order) ? def.order : 10,
    insert: def.insert === 'front' ? 'front' : 'back',
    copyName: !!def.copyName,
    toPoints: def.toPoints || identityPoints,
    fromPoints: def.fromPoints || ((o, pts) => { o.points = pts; }),
    /** Vindusutvalg: ligger entiteten inne i rammen? Standard: alle punktene. */
    inBox: def.inBox || null,
  };
}

export class CadDocument {
  /**
   * @param {object} [opts]
   * @param {string|null} [opts.storageKey] lagres i localStorage under denne
   * @param {object} [opts.state] starttilstand (flettes over standarden)
   */
  constructor(opts = {}) {
    this.storageKey = opts.storageKey || null;
    this.state = { ...this._defaultState(), ...(opts.state || {}) };
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this._pending = null;
    this._batchDepth = 0;
    this._batchBefore = null;
    this._uid = {};
    this.kinds = new Map();
    this.registerKind('shape', { collection: 'shapes', prefix: 's', order: 0, insert: 'front', copyName: true });
    this.registerKind('line', { collection: 'lines', prefix: 'l', order: 20, insert: 'back' });
  }

  /** Overstyres av en underklasse som har flere tilstandsfelt. */
  _defaultState() {
    return defaultCoreState();
  }

  /* ---------------- entitetstyper ---------------- */

  /**
   * Registrerer en entitetstype. Samlingen opprettes i tilstanden om den
   * mangler.
   *
   * @param {string} name f.eks. 'joint'
   * @param {{collection: string, prefix: string, order?: number, insert?: 'front'|'back',
   *          copyName?: boolean, toPoints?: (o) => Array, fromPoints?: (o, pts) => void,
   *          inBox?: (o, box) => boolean}} def
   */
  registerKind(name, def) {
    if (!def || !def.collection || !def.prefix) throw new Error(`registerKind(${name}): collection og prefix må oppgis`);
    this.kinds.set(name, kindDef(name, def));
    if (!Array.isArray(this.state[def.collection])) this.state[def.collection] = [];
    if (!this._uid[def.prefix]) this._uid[def.prefix] = 1;
    return this;
  }

  /** Typene i fast rekkefølge (se `order`). */
  _kindList() {
    return [...this.kinds.values()].sort((a, b) => a.order - b.order);
  }

  kindDef(name) {
    return this.kinds.get(name) || null;
  }

  /** Ny id for et prefiks. Løpenummeret er per dokument. */
  nextId(prefix) {
    const n = this._uid[prefix] || 1;
    this._uid[prefix] = n + 1;
    return `${prefix}${n}`;
  }

  /** Setter tellerne forbi høyeste id i hver samling (etter last/angre). */
  syncUid() {
    for (const k of this.kinds.values()) {
      let max = 0;
      for (const o of this.state[k.collection] || []) {
        const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
      this._uid[k.prefix] = max + 1;
    }
  }

  /* ---------------- abonnement ---------------- */

  /** `fn(state, reason)` for hver endring. Gir en avmeldingsfunksjon. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * `on('change', fn)` for alt, eller `on(reason, fn)` for én grunn
   * ('add', 'remove', 'undo', 'redo', 'selection', …). Gir avmelding.
   */
  on(event, fn) {
    const wrapped = (state, reason) => {
      if (event === 'change' || event === '*' || event === reason) fn(state, reason);
    };
    return this.subscribe(wrapped);
  }

  emit(reason = 'change') {
    if (this._batchDepth > 0) return; // én hendelse når batchen er ferdig
    this.listeners.forEach((fn) => fn(this.state, reason));
  }

  /* ---------------- historikk ---------------- */

  _snapshotKeys() {
    return CORE_SNAPSHOT_KEYS;
  }

  /** `_snapshotKeys()` pluss samlingene til registrerte typer som mangler der. */
  _allSnapshotKeys() {
    const keys = [...this._snapshotKeys()];
    for (const k of this.kinds.values()) if (!keys.includes(k.collection)) keys.push(k.collection);
    return keys;
  }

  snapshot() {
    const out = {};
    for (const k of this._allSnapshotKeys()) out[k] = this.state[k];
    return JSON.stringify(out);
  }

  /**
   * Kjører en mutasjon og legger forrige tilstand på angrestakken.
   * `transient` brukes under drag: da hopper vi over historikken helt til
   * dragen avsluttes med `commit()`.
   */
  mutate(fn, { transient = false, reason = 'change' } = {}) {
    if (this._batchDepth > 0) {
      // Inne i en batch: endringen blir en del av batchens ene angresteg
      fn(this.state);
      return;
    }
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

  /**
   * Alt `fn` gjør mot dokumentet blir ETT angresteg og én hendelse. Kaster
   * `fn`, settes dokumentet tilbake og feilen kastes videre.
   */
  batch(fn, { reason = 'batch' } = {}) {
    if (this._batchDepth > 0) return fn(this);
    const before = this._pending ?? this.snapshot();
    this._batchDepth = 1;
    let result;
    try {
      result = fn(this);
    } catch (err) {
      this._batchDepth = 0;
      this.restore(before);
      this._pending = null;
      throw err;
    }
    this._batchDepth = 0;
    this._pending = null;
    if (this.snapshot() !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.persist();
    this.emit(reason);
    return result;
  }

  /** Avslutter en transient sekvens (f.eks. et drag) som ett angresteg. */
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
   * var da sekvensen startet (Esc i flytt/kopi/roter).
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

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Oppgraderer lagret tilstand. Underklassen legger på sine egne felt. */
  _migrate(data) {
    const out = migrateCore(data);
    if (Array.isArray(out.shapes)) out.shapes = out.shapes.map((s) => ({ ...s }));
    return out;
  }

  restore(json) {
    const data = JSON.parse(json);
    Object.assign(this.state, this._migrate(data));
    // Utvalget kan holde entiteter av alle typer, så filtreringen må se etter
    // id-en i alle samlingene — ellers ville en angring stille tømt utvalget.
    this.state.selection = this.state.selection.filter((id) => this.entityById(id));
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

  /* ---------------- CRUD (generelt) ---------------- */

  /**
   * Ny entitet av `kind`. Former får navn, farge og rolle som `addShape`;
   * andre typer tas som de er (id-en settes her).
   *
   * @returns {object} den nye entiteten
   */
  add(kind, data = {}, { select = true, reason = 'add' } = {}) {
    if (kind === 'shape') {
      const s = this.addShape(data.points || [], data);
      if (!select) this.select([]);
      return s;
    }
    if (kind === 'line') return this.addLines([data], { select, reason })[0] || null;
    const k = this.kinds.get(kind);
    if (!k) throw new Error(`Ukjent entitetstype: ${kind}`);
    const obj = { ...structuredClone(data), id: this.nextId(k.prefix) };
    this.mutate((st) => {
      if (k.insert === 'front') st[k.collection].unshift(obj);
      else st[k.collection].push(obj);
      if (select) st.selection = [obj.id];
    }, { reason });
    return obj;
  }

  /** Entiteten med `id`, uansett type, eller `null`. */
  get(id) {
    const e = this.entityById(id);
    return e ? e.obj : null;
  }

  /** Alle entiteter av `kind`, eller alle typer som `{kind, obj}`. */
  list(kind) {
    if (kind) {
      const k = this.kinds.get(kind);
      return k ? (this.state[k.collection] || []).slice() : [];
    }
    const out = [];
    for (const k of this._kindList()) for (const obj of this.state[k.collection] || []) out.push({ kind: k.name, obj });
    return out;
  }

  /** Fletter `patch` inn i entiteten. Id-en kan ikke endres. */
  update(id, patch, opts = {}) {
    const { id: _ignored, ...rest } = patch || {};
    this.mutate((st) => {
      for (const k of this.kinds.values()) {
        const o = (st[k.collection] || []).find((x) => x.id === id);
        if (o) {
          Object.assign(o, rest);
          return;
        }
      }
    }, { reason: 'update', ...opts });
  }

  /** Sletter én id eller en liste. */
  remove(idOrIds) {
    this.removeEntities(Array.isArray(idOrIds) ? idOrIds : [idOrIds]);
  }

  /* ---------------- former ---------------- */

  /** Domenets felt på en ny form. Overstyres. */
  _decorateShape(shape /* , opts */) {
    return shape;
  }

  _newShape(points, opts, paletteIndex) {
    return this._decorateShape(
      {
        id: this.nextId('s'),
        name: opts.name || 'Form',
        points: points.map((p) => [p[0], p[1]]),
        role: opts.role === 'void' ? 'void' : opts.role || 'solid',
        factor: Number.isFinite(opts.factor) ? opts.factor : 1,
        include: true,
        color: opts.color || PALETTE[paletteIndex % PALETTE.length],
        meta: opts.meta || null,
      },
      opts
    );
  }

  addShape(points, opts = {}) {
    const shape = this._newShape(points, opts, this.state.shapes.length);
    this.mutate((st) => {
      st.shapes.unshift(shape); // nyeste øverst = høyest prioritet
      st.selection = [shape.id];
    }, { reason: 'add' });
    return shape;
  }

  /**
   * Legger inn flere former som ETT angresteg (DXF-import). Lista gis i den
   * rekkefølgen formene skal stå, øverst først — hull må ligge foran formen de
   * skjærer i, ellers virker de ikke i 'priority'-modus.
   */
  addShapes(list, opts = {}) {
    const base = this.state.shapes.length;
    const added = (list || [])
      .filter((o) => o && o.points && o.points.length >= 3)
      .map((o, i) => {
        const s = this._newShape(o.points, { ...o, role: o.role === 'void' ? 'void' : 'solid', factor: 1 }, base + i);
        return s;
      });
    if (!added.length) return [];
    this.mutate((st) => {
      st.shapes.unshift(...added);
      st.selection = Array.isArray(opts.selectIds) ? opts.selectIds.slice() : added.map((s) => s.id);
    }, { reason: opts.reason || 'add' });
    return added;
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

  /* ---------------- entiteter av alle typer ---------------- */

  /**
   * Slår opp en id i alle samlingene. Prefiksene gjør id-ene unike på tvers,
   * så utvalget kan være én flat liste.
   *
   * @returns {{kind: string, obj: object}|null}
   */
  entityById(id) {
    for (const k of this._kindList()) {
      const obj = (this.state[k.collection] || []).find((x) => x.id === id);
      if (obj) return { kind: k.name, obj };
    }
    return null;
  }

  /** Hele utvalget, i utvalgsrekkefølge, som `{kind, obj}`. */
  selectedEntities() {
    return this.state.selection.map((id) => this.entityById(id)).filter(Boolean);
  }

  /** Punktene en entitet består av (en kopi). */
  entityPoints(id) {
    const e = this.entityById(id);
    if (!e) return null;
    const k = this.kinds.get(e.kind);
    return k.toPoints(e.obj).map((p) => [p[0], p[1]]);
  }

  /**
   * Skriver punktene tilbake til entitetene. Brukes med `transient: true`
   * under forhåndsvisning, og avsluttes med `commit()` — ett angresteg.
   */
  setManyEntityPoints(entries, opts = {}) {
    this.mutate((st) => {
      for (const { id, points } of entries) {
        for (const k of this._kindList()) {
          const o = (st[k.collection] || []).find((x) => x.id === id);
          if (!o) continue;
          if (k.name === 'shape' || k.name === 'line') o.points = points.map((p) => [p[0], p[1]]);
          else if (points.length >= 2) k.fromPoints(o, points.map((p) => [p[0], p[1]]));
          break;
        }
      }
    }, opts);
  }

  /**
   * Entitetene som skal følge med når `ids` flyttes, kopieres eller
   * dupliseres, i tillegg til `ids` selv. Domenet overstyrer (GW: skjøtene).
   */
  withFollowing(ids) {
    return [...ids];
  }

  /** «1 skjøt» o.l. til statuslinja når noe følger med. Overstyres. */
  followedNoun(/* n */) {
    return null; // null = språkets eget ord (core/text.js)
  }

  /**
   * Flytter entitetene i `ids`, og eventuelt nullpunktet med samme vektor
   * (`withReference`, slik at referansemålene ikke endrer seg).
   */
  moveEntities(ids, dx, dy, { withReference = false, reason = 'move' } = {}) {
    const set = new Set(ids);
    this.mutate((st) => {
      for (const k of this._kindList()) {
        for (const o of st[k.collection] || []) {
          if (!set.has(o.id)) continue;
          if (k.name === 'shape' || k.name === 'line') o.points = translatePoints(o.points, dx, dy);
          else k.fromPoints(o, translatePoints(k.toPoints(o), dx, dy));
        }
      }
      if (withReference) st.reference = [st.reference[0] + dx, st.reference[1] + dy];
    }, { reason });
  }

  /**
   * Kopierer entitetene i `ids`. `variants` er én oppføring per kopi: en
   * forskyvning `[dx, dy]` eller en funksjon `(points, obj) => points` for
   * kopier som speiles eller roteres. Hele rekka blir ett angresteg.
   */
  copyEntities(ids, variants, { select = true, reason = 'copy' } = {}) {
    const set = new Set(ids);
    const copies = [];
    this.mutate((st) => {
      const kinds = this._kindList();
      const sources = kinds.map((k) => [k, (st[k.collection] || []).filter((o) => set.has(o.id))]);
      for (const v of variants) {
        const apply = typeof v === 'function' ? v : (pts) => translatePoints(pts, v[0], v[1]);
        for (const [k, list] of sources) {
          for (const o of list) {
            const pts = apply(k.toPoints(o), o);
            if (!pts || (k.name !== 'shape' && k.name !== 'line' && pts.length < 2)) continue;
            const copy = structuredClone(o);
            copy.id = this.nextId(k.prefix);
            if (k.copyName && typeof o.name === 'string') copy.name = `${o.name} (kopi)`;
            k.fromPoints(copy, pts.map((p) => [p[0], p[1]]));
            copies.push(copy);
            if (k.insert === 'front') st[k.collection].unshift(copy);
            else st[k.collection].push(copy);
          }
        }
      }
      if (select && copies.length) st.selection = copies.map((c) => c.id);
    }, { reason });
    return copies;
  }

  /** Sletter entitetene i `ids`, av alle typer. `Del` går hit. */
  removeEntities(ids) {
    const set = new Set(ids);
    this.mutate((st) => {
      for (const k of this.kinds.values()) st[k.collection] = (st[k.collection] || []).filter((o) => !set.has(o.id));
      st.selection = st.selection.filter((id) => !set.has(id));
    }, { reason: 'remove' });
  }

  /** Dupliserer utvalget forskjøvet (Ctrl+D). */
  duplicateEntities(ids, dx = 0, dy = 0) {
    return this.copyEntities(ids, [[dx, dy]], { select: true, reason: 'duplicate' });
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

  /* ---------------- linjearbeid ---------------- */

  /**
   * Legger inn linjer (fra DXF «Bare linjer» eller linjeverktøyet) som ETT
   * angresteg.
   *
   * @param {Array<{points, closed?}>} list
   */
  addLines(list, { reason = 'add-lines', select = true } = {}) {
    const added = (list || [])
      .filter((l) => l && l.points && l.points.length >= 2)
      .map((l) => ({ id: this.nextId('l'), points: l.points.map((p) => [p[0], p[1]]), closed: !!l.closed }));
    if (!added.length) return [];
    this.mutate((st) => {
      st.lines.push(...added);
      if (select) st.selection = added.map((l) => l.id);
    }, { reason });
    return added;
  }

  /**
   * «Lag geometri» / «Lag hull»: hver lukkede kontur som kan sys av linjene i
   * `ids` blir én form med `role` — uten nøsting. Linjene beholdes. De som
   * ikke inngikk i en lukket kontur, blir stående markert. Ett angresteg.
   *
   * @returns {{made: number, unusedIds: string[], shapeIds: string[]}}
   */
  makeShapesFromLines(ids, role = 'solid') {
    const set = new Set(ids);
    const lines = this.state.lines.filter((l) => set.has(l.id));
    const { rings, unusedIds } = contoursFromLines(lines);
    if (!rings.length) return { made: 0, unusedIds, shapeIds: [] };
    const isVoid = role === 'void';
    const base = isVoid ? 'Hull fra linjer' : 'Fra linjer';
    const n0 = this.state.shapes.filter((x) => x.name.startsWith(`${base} `) && /\d+$/.test(x.name)).length;
    const shapes = rings.map((ring, i) => ({
      points: ring,
      role: isVoid ? 'void' : 'solid',
      name: `${base} ${n0 + i + 1}`,
    }));
    const added = this.addShapes(shapes, { reason: isVoid ? 'make-holes' : 'make-shapes', selectIds: unusedIds });
    return { made: added.length, unusedIds, shapeIds: added.map((x) => x.id) };
  }

  setLinesVisible(on) {
    this.mutate((st) => {
      st.linesVisible = !!on;
      if (!on) {
        const lineIds = new Set(st.lines.map((l) => l.id));
        st.selection = st.selection.filter((id) => !lineIds.has(id));
      }
    }, { reason: 'lines-visible', transient: true });
    this.commit('lines-visible');
  }

  /* ---------------- del med linje ---------------- */

  /**
   * «Del med linje»: deler hver MARKERTE form som linja a→b krysser, i to (eller
   * flere, for en konkav form). Former linja ikke krysser står urørt. De nye
   * formene arver alt fra originalen. Ett angresteg.
   *
   * @returns {{splitCount: number, newIds: Array<string>}}
   */
  splitByLine(a, b) {
    const ids = new Set(this.state.selection);
    const newIds = [];
    let splitCount = 0;
    this.mutate((st) => {
      const next = [];
      for (const s of st.shapes) {
        if (!ids.has(s.id) || !s.points || s.points.length < 3) {
          next.push(s);
          continue;
        }
        const ownArea = Math.abs(multiProps(pointsToMulti(s.points)).A);
        const areaTol = Math.max(ownArea * 1e-9, GEOM_EPS);
        const { posMulti, negMulti } = splitPointsByLine(s.points, a, b);
        const posArea = Math.abs(multiProps(posMulti).A);
        const negArea = Math.abs(multiProps(negMulti).A);
        if (posArea < areaTol || negArea < areaTol) {
          next.push(s);
          continue;
        }
        let n = 1;
        for (const poly of [...posMulti, ...negMulti]) {
          const ring = openRing(poly && poly[0] ? poly[0] : []);
          if (ring.length < 3) continue; // degenerert bit — ignorer
          const copy = {
            ...s,
            id: this.nextId('s'),
            name: `${s.name} (del ${n})`,
            points: ring.map((p) => [p[0], p[1]]),
          };
          if (s.material && typeof s.material === 'object') copy.material = { ...s.material };
          next.push(copy);
          newIds.push(copy.id);
          n++;
        }
        splitCount++;
      }
      st.shapes = next;
      if (newIds.length) st.selection = newIds.slice();
    }, { reason: 'split' });
    return { splitCount, newIds };
  }

  /* ---------------- utvalg ---------------- */

  select(ids, additive = false) {
    const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
    this.state.selection = additive ? Array.from(new Set([...this.state.selection, ...list])) : list;
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

  /** Domenets lengder når enheten byttes med faktor `k`. Overstyres. */
  _scaleExtra(/* st, k */) {}

  /**
   * Bytter arbeidsenhet. Alle koordinater regnes om slik at geometrien
   * beholder sin fysiske størrelse — det er tallene som endrer seg.
   */
  setUnit(unit, { convert = true } = {}) {
    const from = this.state.unit;
    if (unit === from) return;
    const k = convert ? conversionFactor(from, unit) : 1;
    this.mutate((st) => {
      st.unit = unit;
      if (k !== 1) {
        st.shapes = st.shapes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x * k, y * k]) }));
        st.lines = st.lines.map((l) => ({ ...l, points: l.points.map(([x, y]) => [x * k, y * k]) }));
        st.reference = [st.reference[0] * k, st.reference[1] * k];
        st.grid.step = st.grid.step * k;
        this._scaleExtra(st, k);
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

  /** Det «Tøm all geometri» også skal tømme. Overstyres. */
  _clearExtra(/* st */) {}

  clear() {
    this.mutate((st) => {
      st.shapes = [];
      st.selection = [];
      this._clearExtra(st);
      st.lines = [];
    }, { reason: 'clear' });
  }

  bounds() {
    // Linjearbeidet er med, så «zoom alt» etter en ren linjeimport ikke er tom
    return boundsOfShapes([...this.state.shapes, ...(this.state.linesVisible === false ? [] : this.state.lines || [])]);
  }

  /* ---------------- persistens ---------------- */

  persist() {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(this.storageKey, this.snapshot());
    } catch (err) {
      /* privat modus / full kvote — ikke kritisk */
    }
  }

  load() {
    if (!this.storageKey) return false;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      this.restore(raw);
      this.emit('load');
      return true;
    } catch (err) {
      console.warn('[cad2d] kunne ikke laste lagret dokument:', err);
      return false;
    }
  }

  /* ---------------- JSON ---------------- */

  /** Dokumentet som et rent objekt (`format: 'cad2d.document'`). */
  toObject() {
    const out = { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION };
    for (const k of this._allSnapshotKeys()) out[k] = structuredClone(this.state[k]);
    return out;
  }

  toJSON() {
    return JSON.stringify(this.toObject(), null, 2);
  }

  /**
   * Leser et dokument (tekst eller objekt) som ETT angresteg. Godtar
   * `cad2d.document` og alt annet som har `shapes` (f.eks. en
   * geometry_workspace-prosjektfil — formene og linjene leses, resten
   * ignoreres av kjernen).
   */
  fromJSON(textOrObject) {
    const data = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
    if (!data || !Array.isArray(data.shapes)) throw new Error('Ugyldig fil: mangler "shapes"');
    if (data.format === DOCUMENT_FORMAT && Number(data.version) > DOCUMENT_VERSION) {
      console.warn(`[cad2d] dokumentet har versjon ${data.version}, nyere enn ${DOCUMENT_VERSION}; leser det som kan leses.`);
    }
    const m = this._migrate(data);
    this.mutate((st) => {
      for (const k of this._allSnapshotKeys()) if (m[k] !== undefined) st[k] = m[k];
      st.shapes = (data.shapes || []).map((s, i) => ({
        ...s,
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
    }, { reason: 'import' });
    this.syncUid();
  }
}

/** Nytt dokument fra JSON (tekst eller objekt). */
export function documentFromJSON(textOrObject, opts = {}) {
  const doc = new CadDocument(opts);
  doc.fromJSON(textOrObject);
  doc.undoStack.length = 0;
  return doc;
}
