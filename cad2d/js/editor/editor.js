/**
 * editor.js — den monterbare cad2d-editoren (#93).
 *
 *   const ed = mountCadEditor(container, options);
 *   ed.getDocument(); ed.setDocument(json); ed.on('change', fn);
 *   ed.getSection(); ed.destroy();
 *
 * Virker i hele vinduet og innebygd i et panel, en modal eller en iframe av
 * vilkårlig størrelse: lerretet følger containerens størrelse. Ingen globale
 * variabler og ingen faste element-id-er — alt editoren lager har klasser med
 * prefiks `cad2d-`, og to editorer på samme side er uavhengige.
 *
 * Siden må ha `importmap` for `three` (se cad2d/README.md) og laste
 * `cad2d/vendor/polygon-clipping.umd.js` som vanlig `<script>`.
 *
 * TO MÅTER Å BRUKE DEN PÅ
 *  - `chrome: true` (standard): editoren lager verktøylinje, lerret og
 *    statuslinje inne i `container`. Det er det csc og cad2d/index.html gjør.
 *  - `chrome: false`: `container` ER lerretet, og verten har sine egne
 *    paneler (geometry_workspace). Håndtaket gir da `viewport`, `tools` og
 *    `numeric` til vertens UI.
 *
 * TASTATUR (`keyboard`)
 *  - 'focus' (standard): lytteren sitter på editorens rot, som tar fokus når
 *    man trykker i lerretet. Alle tastetrykk inne i editoren stoppes der
 *    (`stopPropagation`), så vertens egne snarveier ikke utløses inne i den,
 *    og editoren reagerer ikke på taster utenfor seg.
 *  - 'page': lytteren sitter på `window` (GW, én editor i hele vinduet), men
 *    hopper over hendelser fra en ANNEN cad2d-editor.
 */

import { analyze, hasClipper } from '../geometry/polygon.js';
import { CadDocument } from '../core/document.js';
import { lengthLabel } from '../core/units.js';
import { Viewport } from '../view/viewport.js';
import { ToolController } from '../input/tools.js';
import { NumericInput } from '../input/numeric-input.js';
import { createKeyHandler } from '../input/keymap.js';
import { snapLabel } from '../input/snapping.js';
import { importDxfText, sectionOf } from '../io/project.js';
import { sectionProps } from '../io/section-export.js';
import { text } from '../core/text.js';

/** Verktøyene i verktøylinja, i rekkefølge. `|` er skillestrek. */
export const DEFAULT_TOOLBAR = [
  'select', 'line', 'rect', 'circle', 'polygon', 'void', '|',
  'move', 'copy', 'rotate', 'mirror', 'splitline', '|',
  'delete', 'undo', 'redo', 'fit', '|',
  'dxf', 'select-lines', 'make-shapes', 'make-holes',
];

const LABELS = {
  no: {
    select: ['Velg', 'V'], line: ['Linje', 'L'], rect: ['Rektangel', 'B'], circle: ['Sirkel', 'O'],
    polygon: ['Polygon', 'P'], shell: ['Skall', 'S'], void: ['Hull', 'H'], move: ['Flytt', 'M'],
    copy: ['Kopi', 'C'], rotate: ['Roter', 'R'], mirror: ['Speil', ''], splitline: ['Del', 'X'],
    reference: ['Nullpunkt', 'N'], delete: ['Slett', 'Del'], undo: ['Angre', 'Ctrl+Z'],
    redo: ['Gjør om', 'Ctrl+Y'], fit: ['Zoom alt', 'F'], dxf: ['DXF…', ''],
    'select-lines': ['Velg linjer', ''], 'make-shapes': ['Lag geometri', ''], 'make-holes': ['Lag hull', ''],
    dxfAuto: 'Former og hull', dxfLines: 'Bare linjer', voidBadge: 'HULL-MODUS',
    area: 'A',
  },
  en: {
    select: ['Select', 'V'], line: ['Line', 'L'], rect: ['Rectangle', 'B'], circle: ['Circle', 'O'],
    polygon: ['Polygon', 'P'], shell: ['Shell', 'S'], void: ['Hole', 'H'], move: ['Move', 'M'],
    copy: ['Copy', 'C'], rotate: ['Rotate', 'R'], mirror: ['Mirror', ''], splitline: ['Split', 'X'],
    reference: ['Origin', 'N'], delete: ['Delete', 'Del'], undo: ['Undo', 'Ctrl+Z'],
    redo: ['Redo', 'Ctrl+Y'], fit: ['Zoom all', 'F'], dxf: ['DXF…', ''],
    'select-lines': ['Select lines', ''], 'make-shapes': ['Make shapes', ''], 'make-holes': ['Make holes', ''],
    dxfAuto: 'Shapes and holes', dxfLines: 'Lines only', voidBadge: 'HOLE MODE',
    area: 'A',
  },
};

/** Under denne størrelsen (px) blir verktøylinja én rullbar rad. */
export const COMPACT = Object.freeze({ w: 720, h: 360 });
/** Under denne vises bare lerretet (tastene virker fortsatt). Minstestørrelse for bruk med mus. */
export const TINY = Object.freeze({ w: 260, h: 180 });

const TOOL_NAMES = new Set(['select', 'line', 'rect', 'circle', 'polygon', 'shell', 'move', 'copy', 'rotate', 'mirror', 'splitline', 'reference']);

const CSS = `
.cad2d-editor{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;max-height:100%;
  overflow:hidden;box-sizing:border-box;background:#0f172a;color:#e2e8f0;
  font:12px/1.3 ui-sans-serif,system-ui,sans-serif;outline:none;position:relative}
.cad2d-editor:focus-visible{box-shadow:inset 0 0 0 2px #0ea5e9}
.cad2d-toolbar{display:flex;flex-wrap:wrap;gap:3px;padding:5px;border-bottom:1px solid #1e293b;background:#111827;align-items:center;
  flex:0 0 auto;max-height:40%;overflow:auto}
.cad2d-compact .cad2d-toolbar{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;max-height:none;scrollbar-width:thin}
.cad2d-compact .cad2d-toolbar kbd{display:none}
.cad2d-tiny .cad2d-toolbar,.cad2d-tiny .cad2d-statusbar{display:none}
.cad2d-toolbar button,.cad2d-toolbar select{width:auto;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:4px;
  padding:3px 7px;font:inherit;cursor:pointer;white-space:nowrap}
.cad2d-toolbar button:hover{background:#334155}
.cad2d-toolbar button[aria-pressed="true"]{background:#0369a1;border-color:#0ea5e9}
.cad2d-toolbar button[data-cmd="void"][aria-pressed="true"]{background:#9f1239;border-color:#fb7185}
.cad2d-toolbar .cad2d-sep{width:1px;align-self:stretch;background:#334155;margin:0 3px}
.cad2d-toolbar kbd{font:10px ui-monospace,monospace;color:#94a3b8;margin-left:4px}
.cad2d-canvas{position:relative;flex:1 1 auto;min-height:40px;min-width:0;overflow:hidden}
.cad2d-badge{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#9f1239;color:#fff;padding:2px 8px;
  border-radius:4px;font-weight:600;letter-spacing:.05em;pointer-events:none}
.cad2d-statusbar{display:flex;gap:12px;padding:4px 8px;border-top:1px solid #1e293b;background:#111827;color:#94a3b8;min-height:22px;
  flex:0 0 auto;overflow:hidden;white-space:nowrap}
.cad2d-compact .cad2d-statusbar .cad2d-readout{display:none}
.cad2d-statusbar .cad2d-status{flex:1 1 auto;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cad2d-statusbar .cad2d-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.cad2d-hidden{display:none!important}
.cad2d-editor .cad2d-numeric{position:absolute;z-index:40;display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #0ea5e9;
  border-radius:6px;background:rgba(15,23,42,.95);color:#e2e8f0}
.cad2d-editor .cad2d-numeric.hidden{display:none}
.cad2d-editor .cad2d-numeric input{background:#020617;border:1px solid #334155;color:#e2e8f0;border-radius:4px;padding:2px 5px;font:12px ui-monospace,monospace}
.cad2d-editor .cad2d-numeric span{font-size:10px;color:#94a3b8;white-space:nowrap}
`;

function ensureCss(doc) {
  if (doc.querySelector('style[data-cad2d]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-cad2d', '');
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const fmtNum = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const fmtLen = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1));

/**
 * Monterer en editor.
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {CadDocument} [options.document] dokumentet (standard: et nytt)
 * @param {boolean} [options.chrome=true] verktøylinje og statuslinje
 * @param {string[]} [options.toolbar] knappene, se `DEFAULT_TOOLBAR`
 * @param {'focus'|'page'} [options.keyboard='focus']
 * @param {'no'|'en'} [options.lang='no'] språk i verktøylinja
 * @param {object} [options.style] fyll/kontur per form, se Viewport
 * @param {string} [options.background]
 * @param {Array<(editor) => void>} [options.extensions] kalles med håndtaket
 * @param {object} [options.keyHooks] overstyringer for tastaturkartet
 * @param {(type, e) => boolean} [options.interceptPointer] true = hendelsen er tatt
 * @param {() => object} [options.extraData] egne nøkler til visningen (tegnelag)
 * @param {(analysis) => void} [options.onRender] etter hver opptegning
 * @param {(msg: string) => void} [options.onStatus]
 * @param {(tool: string) => void} [options.onToolChange]
 * @param {(on: boolean) => void} [options.onVoidMode]
 * @param {(p, snapType) => void} [options.onCursor]
 * @param {() => number} [options.getThickness] skallets tykkelse
 * @param {HTMLElement} [options.numericHost] hvor tallfeltet legges
 */
export function mountCadEditor(container, options = {}) {
  if (!container) throw new Error('mountCadEditor: container mangler');
  const opts = { chrome: true, keyboard: 'focus', lang: 'no', ...options };
  const L = LABELS[opts.lang] || LABELS.no;
  const T = text(opts.lang);
  const ownerDoc = container.ownerDocument || document;
  ensureCss(ownerDoc);

  const doc = opts.document || new CadDocument();
  const listeners = { status: new Set(), tool: new Set() };
  const cleanups = [];

  /* ---------------- DOM ---------------- */

  let root;
  let canvasHost;
  let statusEl = null;
  let readoutEl = null;
  let areaEl = null;
  let badgeEl = null;
  let toolbarEl = null;
  if (opts.chrome) {
    root = ownerDoc.createElement('div');
    root.className = 'cad2d-editor';
    root.tabIndex = 0;
    root.innerHTML = `
      <div class="cad2d-toolbar" role="toolbar"></div>
      <div class="cad2d-canvas"><div class="cad2d-badge cad2d-hidden"></div></div>
      <div class="cad2d-statusbar"><span class="cad2d-status" role="status" aria-live="polite"></span>
        <span class="cad2d-num cad2d-area"></span><span class="cad2d-num cad2d-readout"></span></div>`;
    container.appendChild(root);
    toolbarEl = root.querySelector('.cad2d-toolbar');
    canvasHost = root.querySelector('.cad2d-canvas');
    statusEl = root.querySelector('.cad2d-status');
    readoutEl = root.querySelector('.cad2d-readout');
    areaEl = root.querySelector('.cad2d-area');
    badgeEl = root.querySelector('.cad2d-badge');
    badgeEl.textContent = L.voidBadge;
    // Størrelsestrinn: full (≥ COMPACT), kompakt (én rullbar verktøyrad, kort
    // statuslinje) og bare lerret (< TINY). Lerretet beholder alltid plass, og
    // editoren flyter aldri ut av containeren (review av #94, punkt 6).
    // Måles på CONTAINEREN (roten fyller den), og med en gang ved montering —
    // ikke bare når ResizeObserver rekker å melde fra.
    const applySize = () => {
      const r = container.getBoundingClientRect();
      if (!r.width && !r.height) return; // skjult (modal som ikke er vist ennå)
      root.classList.toggle('cad2d-compact', r.width < COMPACT.w || r.height < COMPACT.h);
      root.classList.toggle('cad2d-tiny', r.width < TINY.w || r.height < TINY.h);
    };
    const sizeObserver = new ResizeObserver(applySize);
    sizeObserver.observe(container);
    applySize();
    cleanups.push(() => sizeObserver.disconnect());
  } else {
    root = container;
    canvasHost = container;
  }
  root.setAttribute('data-cad2d-editor', '');

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || '';
    opts.onStatus?.(msg);
    listeners.status.forEach((fn) => fn(msg));
  };

  /* ---------------- visning og verktøy ---------------- */

  const intercept = opts.interceptPointer || (() => false);
  const viewport = new Viewport(
    canvasHost,
    {
      pointerdown: (e) => {
        if (opts.keyboard === 'focus' && ownerDoc.activeElement !== root && !root.contains(ownerDoc.activeElement)) {
          root.focus({ preventScroll: true });
        }
        if (!intercept('pointerdown', e)) tools.pointerdown(e);
      },
      pointermove: (e) => (intercept('pointermove', e) ? null : tools.pointermove(e)),
      pointerup: (e) => (intercept('pointerup', e) ? null : tools.pointerup(e)),
      dblclick: (e) => (intercept('dblclick', e) ? null : tools.dblclick(e)),
    },
    { style: opts.style, background: opts.background }
  );

  const tools = new ToolController(doc, viewport, {
    lang: opts.lang,
    getThickness: opts.getThickness || (() => 200),
    onStatus: setStatus,
    onToolChange: (tool) => {
      syncToolbar();
      opts.onToolChange?.(tool);
      listeners.tool.forEach((fn) => fn(tool));
      scheduleRender();
    },
    onVoidMode: (on) => {
      if (badgeEl) badgeEl.classList.toggle('cad2d-hidden', !on);
      syncToolbar();
      opts.onVoidMode?.(on);
    },
  });

  let lastCursorPx = null;
  tools.onCursor = (p, type) => {
    lastCursorPx = viewport.worldToScreen(p[0], p[1]);
    if (readoutEl) {
      const label = type === 'ortho' ? 'orto' : snapLabel(type);
      readoutEl.textContent = `x ${fmtLen(p[0])}  y ${fmtLen(p[1])} ${lengthLabel(doc.state.unit)}${label ? `  · ${label.toLowerCase()}` : ''}`;
    }
    opts.onCursor?.(p, type);
  };

  const numeric = new NumericInput({
    lang: opts.lang,
    host: opts.numericHost || (opts.chrome ? canvasHost : container.parentElement || container),
    getUnit: () => lengthLabel(doc.state.unit),
    getExpect: () => tools.expectedInput(),
    getAnchor: () => lastCursorPx,
    // Alt+siffer (snap/orto) har forrang, også midt i en inntasting
    onSnapShortcut: (e) => keyHandler.snapShortcut(e),
    onStatus: setStatus,
    onCommit: (v) => {
      const res = tools.applyNumeric(v);
      if (res && res.msg) setStatus(res.msg);
      scheduleRender();
      return res;
    },
    onCancel: () => setStatus(tools.hint()),
  });

  /* ---------------- opptegning ---------------- */

  let pending = false;
  let lastAnalysis = null;
  function scheduleRender() {
    if (pending || destroyed) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!destroyed) render();
    });
  }

  function render() {
    const st = doc.state;
    let analysis = null;
    try {
      analysis = analyze(st.shapes, st.mode);
    } catch (err) {
      console.error('[cad2d] analysen feilet:', err);
      opts.onAnalysisError?.(err);
    }
    lastAnalysis = analysis;
    viewport.setData({
      shapes: st.shapes,
      selection: st.selection,
      analysis,
      reference: st.reference,
      grid: st.grid,
      underlay: st.underlay,
      lines: st.lines,
      linesVisible: st.linesVisible,
      ...(opts.extraData ? opts.extraData() : {}),
    });
    if (areaEl) {
      const A = analysis && analysis.result && analysis.result.valid ? analysis.result.A : null;
      areaEl.textContent = A != null ? `${L.area} = ${fmtNum(A, 0)} ${lengthLabel(st.unit)}²` : '';
    }
    syncToolbar();
    try {
      opts.onRender?.(analysis);
    } catch (err) {
      // En feil i vertens panel skal ikke ta ned lerretet
      console.error('[cad2d] onRender feilet:', err);
    }
  }

  cleanups.push(doc.subscribe(() => scheduleRender()));

  /* ---------------- verktøylinje ---------------- */

  const fileInput = ownerDoc.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.dxf,application/dxf,image/vnd.dxf,text/plain';
  fileInput.className = 'cad2d-hidden';
  let dxfMode = 'auto';

  function selectedLineIds() {
    const lineIds = new Set(doc.state.lines.map((l) => l.id));
    return doc.state.selection.filter((id) => lineIds.has(id));
  }

  function makeFromLines(role) {
    const ids = selectedLineIds();
    if (!ids.length) return setStatus(T.selectLinesFirst);
    const r = doc.makeShapesFromLines(ids, role);
    const rest = r.unusedIds.length ? T.unusedLines(r.unusedIds.length) : '';
    if (!r.made) return setStatus(T.noClosedContours(rest));
    return setStatus(T.madeFromLines(r.made, role, ids.length, rest));
  }

  /** Les en DXF-fil (tekst) inn i dokumentet. Brukes av knappen og av verten. */
  function importDxf(text, { mode = dxfMode, unitChoice = 'auto' } = {}) {
    const r = importDxfText(doc, text, { mode, unitChoice, lang: opts.lang });
    if (r.added) viewport.zoomToFit(doc.bounds());
    setStatus(r.msg);
    return r;
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    file.text().then((text) => importDxf(text)).catch(() => setStatus(T.fileReadFailed));
  });

  const commands = {
    void: () => tools.setVoidMode(!tools.voidMode),
    delete: () => {
      const sel = doc.state.selection;
      if (!sel.length) return setStatus(T.nothingSelected);
      doc.removeEntities(sel);
      setStatus(T.deleted(sel.length));
    },
    undo: () => doc.undo(),
    redo: () => doc.redo(),
    fit: () => viewport.zoomToFit(doc.bounds()),
    dxf: () => fileInput.click(),
    'select-lines': () => {
      if (doc.state.linesVisible === false) doc.setLinesVisible(true);
      doc.select(doc.state.lines.map((l) => l.id));
      setStatus(T.linesSelected(doc.state.lines.length));
    },
    'make-shapes': () => makeFromLines('solid'),
    'make-holes': () => makeFromLines('void'),
  };

  function buildToolbar() {
    if (!toolbarEl) return;
    const items = opts.toolbar || DEFAULT_TOOLBAR;
    const html = [];
    for (const item of items) {
      if (item === '|') {
        html.push('<span class="cad2d-sep" aria-hidden="true"></span>');
        continue;
      }
      const [label, key] = L[item] || [item, ''];
      const attr = TOOL_NAMES.has(item) || tools.hasTool(item) ? `data-tool="${item}"` : `data-cmd="${item}"`;
      html.push(`<button type="button" ${attr} title="${label}${key ? ` (${key})` : ''}">${label}${key && key.length === 1 ? `<kbd>${key}</kbd>` : ''}</button>`);
      if (item === 'dxf') {
        html.push(`<select data-cmd-select="dxf-mode" title="DXF"><option value="auto">${L.dxfAuto}</option><option value="lines">${L.dxfLines}</option></select>`);
      }
    }
    toolbarEl.innerHTML = html.join('');
    toolbarEl.appendChild(fileInput);
    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.tool) tools.setTool(btn.dataset.tool);
      else if (commands[btn.dataset.cmd]) commands[btn.dataset.cmd]();
      // Fokus tilbake til editoren, så tastene virker etter et klikk
      if (opts.keyboard === 'focus') root.focus({ preventScroll: true });
    });
    const modeSel = toolbarEl.querySelector('[data-cmd-select="dxf-mode"]');
    if (modeSel) modeSel.addEventListener('change', () => { dxfMode = modeSel.value; });
  }

  function syncToolbar() {
    if (!toolbarEl) return;
    toolbarEl.querySelectorAll('button[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tools.tool)));
    const v = toolbarEl.querySelector('button[data-cmd="void"]');
    if (v) v.setAttribute('aria-pressed', String(!!tools.voidMode));
    const u = toolbarEl.querySelector('button[data-cmd="undo"]');
    if (u) u.disabled = !doc.canUndo;
    const r = toolbarEl.querySelector('button[data-cmd="redo"]');
    if (r) r.disabled = !doc.canRedo;
  }

  /* ---------------- tastatur ---------------- */

  const keyHooks = { status: setStatus, ...(opts.keyHooks || {}) };
  const keyHandler = createKeyHandler({ doc, tools, viewport, numeric, hooks: keyHooks, lang: opts.lang });

  if (opts.keyboard === 'page') {
    const onKey = (e) => {
      // En ANNEN editor på samme side eier sine egne taster
      const other = e.target && e.target.closest && e.target.closest('[data-cad2d-editor]');
      if (other && other !== root) return;
      keyHandler(e);
    };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));
  } else {
    const onKey = (e) => {
      keyHandler(e);
      // Vertens snarveier skal ikke utløses inne i editoren. Tab slipper
      // gjennom, så en modal vert kan holde fokus innenfor seg (fokusfelle).
      if (e.key !== 'Tab') e.stopPropagation();
    };
    root.addEventListener('keydown', onKey);
    cleanups.push(() => root.removeEventListener('keydown', onKey));
  }

  /* ---------------- håndtaket ---------------- */

  let destroyed = false;
  let cleanSnapshot = doc.snapshot();

  const editor = {
    document: doc,
    store: doc,
    viewport,
    tools,
    numeric,
    root,
    getDocument: () => doc,
    /**
     * Erstatter innholdet med et dokument (JSON-tekst, objekt eller et annet
     * `CadDocument`). Historikken tømmes, og visningen zoomer til alt.
     */
    setDocument(src) {
      const data = src instanceof CadDocument ? src.toObject() : src;
      tools.cancel();
      doc.fromJSON(data);
      doc.undoStack.length = 0;
      doc.redoStack.length = 0;
      viewport.zoomToFit(doc.bounds());
      scheduleRender();
      return doc;
    },
    /** `on('change'|<grunn>|'status'|'tool', fn)` → avmelding. */
    on(event, fn) {
      if (listeners[event]) {
        listeners[event].add(fn);
        return () => listeners[event].delete(fn);
      }
      // Dokumentet kan leve videre etter editoren (sendt inn utenfra), så
      // lytteren fjernes av destroy() (review av #94, punkt 10).
      const off = doc.on(event, fn);
      cleanups.push(off);
      return off;
    },
    /**
     * Tverrsnittet på `structural-tools-section` v1 (mm), som `{ok, section,
     * error, warnings, props}`. `props` er A, I_y, … av seksjonen.
     */
    getSection(opts2 = {}) {
      // Uten utvalg å peke på: meldingen ber om å slette eller koble sammen deler
      const r = sectionOf(doc, { lang: opts.lang, selectable: false, ...opts2 });
      if (r.ok) r.props = sectionProps(r.section);
      return r;
    },
    analysis: () => lastAnalysis,
    /**
     * Gir en tastetrykk-hendelse til editorens tastaturkart, for verter der fokus
     * kan stå utenfor editorens rot men tastene likevel hører til editoren (csc:
     * knappene i overlegget). Returnerer true hvis tasten ble brukt.
     */
    handleKey: (e) => keyHandler(e),
    /** Er dokumentet endret siden `markClean()` (eller siden monteringen)? */
    isDirty: () => doc.snapshot() !== cleanSnapshot,
    markClean: () => {
      cleanSnapshot = doc.snapshot();
    },
    importDxf,
    setStatus,
    zoomToFit: () => viewport.zoomToFit(doc.bounds()),
    setTool: (name) => tools.setTool(name),
    focus: () => root.focus({ preventScroll: true }),
    render,
    scheduleRender,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tools.cancel();
      cleanups.forEach((fn) => fn());
      viewport.dispose();
      numeric.el?.remove();
      fileInput.remove();
      if (opts.chrome) root.remove();
      else root.removeAttribute('data-cad2d-editor');
    },
  };

  buildToolbar();
  for (const ext of opts.extensions || []) ext(editor);
  tools.setTool('select');
  render();
  viewport.zoomToFit(doc.bounds());
  cleanSnapshot = doc.snapshot();
  if (!hasClipper()) setStatus(T.noClipper);
  return editor;
}
