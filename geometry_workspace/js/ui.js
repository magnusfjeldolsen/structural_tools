/**
 * ui.js — panelene rundt lerretet.
 *
 * Venstre panel er bygget rundt to ting: en rad med verktøysymboler der hvert
 * symbol åpner sin egen lille meny, og geometrilista der hvert element kan
 * åpnes og redigeres direkte.
 */

import {
  rectPoints,
  shellPoints,
  circlePoints,
  openRing,
  signedArea,
  boundsOfPoints,
  translatePoints,
  rotatePoints,
  mirrorPoints,
} from './geometry.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * Tallformatering
 * ------------------------------------------------------------------ */

/** Returnerer en formateringsfunksjon med fast antall desimaler. */
const nf = (dec) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function sup(n) {
  return String(n)
    .split('')
    .map((c) => SUP[c] || c)
    .join('');
}

export function fmtLen(v) {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a !== 0 && a < 0.01) return v.toExponential(2);
  return nf(2)(v);
}

export function fmtArea(v) {
  if (!Number.isFinite(v)) return '–';
  return Math.abs(v) >= 1e7 ? sci(v, 4) : nf(0)(v);
}

export function sci(v, digits = 4) {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  return `${nf(digits - 1)(mant)}·10${sup(exp)}`;
}

export function fmtInertia(v) {
  if (!Number.isFinite(v)) return '–';
  return Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 0.01) ? sci(v, 4) : nf(2)(v);
}

/* ------------------------------------------------------------------ *
 * Fokusbevaring ved re-rendering
 * ------------------------------------------------------------------ */

function preserveFocus(render) {
  const el = document.activeElement;
  const key = el && el.dataset ? el.dataset.focusKey : null;
  const start = el && el.selectionStart;
  const end = el && el.selectionEnd;
  render();
  if (!key) return;
  const next = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (next) {
    next.focus();
    if (start != null && next.setSelectionRange) {
      try {
        next.setSelectionRange(start, end);
      } catch (err) {
        /* type="number" tillater ikke alltid seleksjon */
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Verktøymenyer
 * ------------------------------------------------------------------ */

const TOOL_TITLES = {
  select: 'Velg og rediger',
  rect: 'Rektangel',
  shell: 'Skallelement fra senterlinje',
  polygon: 'Polygon',
  circle: 'Sirkel',
  reference: 'Nullpunkt',
};

const field = (key, label, value, step = '') =>
  `<div>
     <label class="field-label" for="f-${key}">${label}</label>
     <input id="f-${key}" data-form="${key}" data-focus-key="f-${key}" type="number" ${step} value="${value}" />
   </div>`;

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */

export class UI {
  constructor(store, viewport, tools, opts = {}) {
    this.store = store;
    this.viewport = viewport;
    this.tools = tools;
    this.analysis = null;

    /** Åpne elementer i geometrilista. */
    this.expanded = new Set();
    /** Åpne underseksjoner, nøkler som `${id}:coords`. */
    this.sections = new Set();
    this._lastSelectionKey = '';

    /** Sist innlagte tall per verktøy, så menyene husker hva du skrev. */
    this.form = {
      rect: { x: 0, y: 0, b: 1000, h: 300, anchor: 'corner' },
      shell: { x1: 0, y1: 0, x2: 0, y2: 3000, t: 250 },
      circle: { x: 0, y: 0, r: 200 },
      polygon: { text: '' },
      reference: { x: 0, y: 0 },
    };

    this._bind();
  }

  /** Tykkelsen tegneverktøyet for skall skal bruke. */
  getThickness() {
    return this.form.shell.t;
  }

  toast(msg, ms = 2200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  status(msg) {
    $('status').textContent = msg;
  }

  /* ---------------- binding ---------------- */

  _bind() {
    const st = this.store;

    $('tool-buttons').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (!btn) return;
      const tool = btn.dataset.tool;
      // Klikk på det aktive verktøyet slår menyen av og på
      if (tool === this.tools.tool && this._popoverTool === tool) this.closePopover();
      else this.tools.setTool(tool);
    });

    // Lukk menyen ved klikk utenfor
    document.addEventListener('pointerdown', (e) => {
      if (!this._popoverTool) return;
      if (e.target.closest('#tool-popover') || e.target.closest('#tool-buttons')) return;
      this.closePopover();
    });

    $('grid-step').addEventListener('change', (e) => st.setGrid({ step: Math.max(0, Number(e.target.value) || 0) }));
    $('chk-snap').addEventListener('change', (e) => st.setGrid({ snap: e.target.checked }));
    $('chk-grid').addEventListener('change', (e) => st.setGrid({ visible: e.target.checked }));
    $('chk-net').addEventListener('change', (e) => this.viewport.setOverlays({ showNet: e.target.checked }));
    $('chk-principal').addEventListener('change', (e) =>
      this.viewport.setOverlays({ showPrincipal: e.target.checked })
    );

    $('btn-delete').addEventListener('click', () => this.deleteSelected());
    $('btn-duplicate').addEventListener('click', () => this.duplicateSelected());
    $('btn-clear').addEventListener('click', () => {
      if (!st.state.shapes.length) return;
      if (confirm('Fjerne all geometri?')) st.clear();
    });

    $('mode-select').addEventListener('change', (e) => st.setMode(e.target.value));
    $('ref-x').addEventListener('change', (e) =>
      st.setReference([Number(e.target.value) || 0, st.state.reference[1]])
    );
    $('ref-y').addEventListener('change', (e) =>
      st.setReference([st.state.reference[0], Number(e.target.value) || 0])
    );
    $('btn-ref-centroid').addEventListener('click', () => {
      if (!this.analysis || !this.analysis.result.valid) return this.toast('Ingen geometri å måle fra.');
      st.setReference([this.analysis.result.cx, this.analysis.result.cy]);
    });

    $('btn-fit').addEventListener('click', () => this.viewport.zoomToFit(st.bounds()));
    $('btn-zoom-in').addEventListener('click', () => this.viewport.zoomBy(1 / 1.3));
    $('btn-zoom-out').addEventListener('click', () => this.viewport.zoomBy(1.3));

    $('model-title').addEventListener('input', (e) => st.setTitle(e.target.value));
    $('btn-copy').addEventListener('click', () => this._copyResult());

    $('btn-export').addEventListener('click', () => this._export());
    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => this._import(e));
    $('btn-example').addEventListener('click', () => this.loadExample());

    $('btn-help').addEventListener('click', () => $('help-overlay').classList.remove('hidden'));
    $('btn-help-close').addEventListener('click', () => $('help-overlay').classList.add('hidden'));
    $('help-overlay').addEventListener('click', (e) => {
      if (e.target === $('help-overlay')) $('help-overlay').classList.add('hidden');
    });
  }

  /* ---------------- verktøymeny ---------------- */

  /** Kalles når verktøyet byttes, også via hurtigtast. */
  onToolChanged(tool) {
    if (tool === 'select') this.closePopover();
    else this.openPopover(tool);
  }

  closePopover() {
    this._popoverTool = null;
    const el = $('tool-popover');
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  openPopover(tool) {
    const el = $('tool-popover');
    const body = this._popoverBody(tool);
    if (!body) return this.closePopover();
    this._popoverTool = tool;
    el.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold text-sky-400">${TOOL_TITLES[tool]}</h3>
        <button data-close class="text-slate-500 hover:text-white leading-none text-lg">×</button>
      </div>
      ${body}`;
    el.classList.remove('hidden');
    this._bindPopover(tool);
  }

  _popoverBody(tool) {
    const f = this.form;
    if (tool === 'rect') {
      return `
        <div class="grid grid-cols-4 gap-1.5">
          ${field('x', 'x', f.rect.x)}${field('y', 'y', f.rect.y)}
          ${field('b', 'b', f.rect.b)}${field('h', 'h', f.rect.h)}
        </div>
        <div class="flex items-center gap-2 mt-2">
          <select data-form="anchor" class="flex-1">
            <option value="corner" ${f.rect.anchor === 'corner' ? 'selected' : ''}>x,y = nedre venstre hjørne</option>
            <option value="center" ${f.rect.anchor === 'center' ? 'selected' : ''}>x,y = senter</option>
            <option value="bottom-center" ${f.rect.anchor === 'bottom-center' ? 'selected' : ''}>x,y = midt på underkant</option>
          </select>
          <button data-add class="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded whitespace-nowrap">Legg til</button>
        </div>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">Eller klikk to motstående hjørner i lerretet.</p>`;
    }
    if (tool === 'shell') {
      return `
        <div class="grid grid-cols-4 gap-1.5">
          ${field('x1', 'x₁', f.shell.x1)}${field('y1', 'y₁', f.shell.y1)}
          ${field('x2', 'x₂', f.shell.x2)}${field('y2', 'y₂', f.shell.y2)}
        </div>
        <div class="flex items-end gap-2 mt-2">
          <div class="flex-1">${field('t', 'Tykkelse t', f.shell.t)}</div>
          <button data-add class="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded whitespace-nowrap">Legg til</button>
        </div>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Lager rektangelet skallet faktisk representerer: tykkelse t sentrert om senterlinja.
          Tykkelsen brukes også når du klikker senterlinja i lerretet.
        </p>`;
    }
    if (tool === 'circle') {
      return `
        <div class="grid grid-cols-3 gap-1.5">
          ${field('x', 'x', f.circle.x)}${field('y', 'y', f.circle.y)}${field('r', 'r', f.circle.r)}
        </div>
        <button data-add class="w-full mt-2 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded">Legg til</button>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Eller klikk sentrum og et punkt på omkretsen. Tilnærmes med en 48-kant.
        </p>`;
    }
    if (tool === 'polygon') {
      return `
        <p class="text-[11px] text-slate-400 leading-snug mb-2">
          Klikk hjørner i lerretet. Enter, dobbeltklikk eller klikk på første punkt avslutter.
        </p>
        <label class="field-label" for="f-poly">Eller lim inn koordinater, ett punkt per linje</label>
        <textarea id="f-poly" data-form="text" data-focus-key="f-poly" rows="5"
                  placeholder="0 0&#10;1000 0&#10;1000 400"
                  class="w-full text-xs font-mono">${escapeHtml(f.polygon.text)}</textarea>
        <button data-add class="w-full mt-2 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded">Legg til polygon</button>`;
    }
    if (tool === 'reference') {
      const ref = this.store.state.reference;
      return `
        <div class="grid grid-cols-2 gap-1.5">
          ${field('x', 'x₀', ref[0])}${field('y', 'y₀', ref[1])}
        </div>
        <button data-add class="w-full mt-2 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded">Sett nullpunkt</button>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Eller klikk i lerretet. Alle avvik i resultatpanelet måles fra dette punktet.
        </p>`;
    }
    return null;
  }

  _bindPopover(tool) {
    const el = $('tool-popover');
    el.querySelector('[data-close]').addEventListener('click', () => {
      this.closePopover();
      this.tools.setTool('select');
    });

    const target = tool === 'polygon' ? this.form.polygon : this.form[tool];
    el.querySelectorAll('[data-form]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const key = e.target.dataset.form;
        target[key] = e.target.type === 'number' ? Number(e.target.value) || 0 : e.target.value;
      });
    });

    const add = el.querySelector('[data-add]');
    if (add) {
      add.addEventListener('click', () => {
        if (tool === 'rect') this._addRect();
        else if (tool === 'shell') this._addShell();
        else if (tool === 'circle') this._addCircle();
        else if (tool === 'polygon') this._addPastedPolygon();
        else if (tool === 'reference') this.store.setReference([this.form.reference.x, this.form.reference.y]);
      });
    }
  }

  /* ---------------- legg til ---------------- */

  _addRect() {
    const { x, y, b, h, anchor } = this.form.rect;
    if (Math.abs(b) < 1e-9 || Math.abs(h) < 1e-9) return this.toast('Bredde og høyde må være ulik null.');
    let x0 = x;
    let y0 = y;
    if (anchor === 'center') {
      x0 = x - b / 2;
      y0 = y - h / 2;
    } else if (anchor === 'bottom-center') {
      x0 = x - b / 2;
    }
    this.store.addShape(rectPoints(x0, y0, b, h), { name: 'Rektangel' });
  }

  _addShell() {
    const { x1, y1, x2, y2, t } = this.form.shell;
    const thickness = Math.abs(t);
    if (thickness < 1e-9) return this.toast('Tykkelsen må være større enn null.');
    const pts = shellPoints([x1, y1], [x2, y2], thickness);
    if (!pts) return this.toast('Senterlinja har null lengde.');
    this.store.addShape(pts, { name: `Skall t=${thickness}`, meta: { kind: 'shell', p1: [x1, y1], p2: [x2, y2], t: thickness } });
  }

  _addCircle() {
    const { x, y, r } = this.form.circle;
    const radius = Math.abs(r);
    if (radius < 1e-9) return this.toast('Radien må være større enn null.');
    this.store.addShape(circlePoints(x, y, radius), { name: 'Sirkel', meta: { kind: 'circle', c: [x, y], r: radius } });
  }

  _addPastedPolygon() {
    const pts = [];
    for (const line of this.form.polygon.text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/[\s,;]+/).map(Number);
      if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return this.toast(`Klarte ikke å tolke linja: «${t}»`);
      }
      pts.push([parts[0], parts[1]]);
    }
    if (pts.length < 3) return this.toast('Et polygon trenger minst tre punkt.');
    this.store.addShape(pts, { name: 'Polygon' });
    this.viewport.zoomToFit(this.store.bounds());
  }

  /* ---------------- kommandoer ---------------- */

  deleteSelected() {
    const sel = this.store.state.selection;
    if (!sel.length) return this.toast('Ingen form er markert.');
    this.store.removeShapes(sel);
  }

  duplicateSelected() {
    const sel = this.store.state.selection;
    if (!sel.length) return this.toast('Ingen form er markert.');
    const step = this.store.state.grid.step || 0;
    this.store.duplicateShapes(sel, step * 2, 0);
  }

  loadExample() {
    if (this.store.state.shapes.length && !confirm('Erstatte gjeldende geometri med eksempelet?')) return;
    const plate = shellPoints([-2000, 0], [2000, 0], 400);
    const wall = shellPoints([0, 0], [0, 3000], 250);
    this.store.mutate((s) => {
      s.shapes = [];
      s.selection = [];
      s.reference = [0, 0];
      s.title = 'Vegg på bunnplate — skall i senterflate';
    }, { reason: 'example' });
    this.store.addShape(plate, { name: 'Bunnplate t=400', meta: { kind: 'shell', p1: [-2000, 0], p2: [2000, 0], t: 400 } });
    this.store.addShape(wall, { name: 'Vegg t=250', meta: { kind: 'shell', p1: [0, 0], p2: [0, 3000], t: 250 } });
    this.store.select([]);
    this.expanded.clear();
    this.viewport.zoomToFit(this.store.bounds());
    this.toast('Eksempel lastet: vegg og bunnplate med overlapp i hjørnet.');
  }

  _copyResult() {
    if (!this.analysis || !this.analysis.result.valid) return this.toast('Ingen geometri å kopiere.');
    const r = this.analysis.result;
    const ref = this.store.state.reference;
    const text = [
      `Tyngdepunkt (globalt): x = ${fmtLen(r.cx)}, y = ${fmtLen(r.cy)}`,
      `Referansepunkt:        x0 = ${fmtLen(ref[0])}, y0 = ${fmtLen(ref[1])}`,
      `Avvik fra referanse:   dx = ${fmtLen(r.cx - ref[0])}, dy = ${fmtLen(r.cy - ref[1])}`,
      `Areal:                 A = ${fmtArea(r.A)}`,
      `Ix = ${fmtInertia(r.Ix)}   Iy = ${fmtInertia(r.Iy)}   Ixy = ${fmtInertia(r.Ixy)}`,
    ].join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => this.toast('Kopiert til utklippstavla.'))
      .catch(() => this.toast('Kunne ikke kopiere.'));
  }

  _export() {
    const blob = new Blob([this.store.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    const name = (this.store.state.title || 'geometri').replace(/[^\w\-æøåÆØÅ ]+/g, '').trim() || 'geometri';
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  _import(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.store.fromJSON(String(reader.result));
        this.expanded.clear();
        this.viewport.zoomToFit(this.store.bounds());
        this.toast(`Importerte ${this.store.state.shapes.length} former.`);
      } catch (err) {
        this.toast(`Import feilet: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ---------------- rendering ---------------- */

  render(analysis) {
    this.analysis = analysis;

    // Marker noe i lerretet → åpne egenskapene for det i lista
    const sel = this.store.state.selection;
    const key = sel.join(',');
    if (key !== this._lastSelectionKey) {
      this._lastSelectionKey = key;
      if (sel.length === 1) {
        this.expanded = new Set([sel[0]]);
        this._scrollTo = sel[0];
      }
    }

    preserveFocus(() => {
      this._renderControls();
      this._renderList();
      this._renderResults(analysis);
    });

    if (this._scrollTo) {
      const row = document.querySelector(`[data-row="${CSS.escape(this._scrollTo)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
      this._scrollTo = null;
    }
  }

  _renderControls() {
    const s = this.store.state;
    const setIfIdle = (el, value) => {
      if (document.activeElement !== el) el.value = value;
    };
    setIfIdle($('grid-step'), s.grid.step);
    $('chk-snap').checked = s.grid.snap;
    $('chk-grid').checked = s.grid.visible;
    setIfIdle($('mode-select'), s.mode);
    setIfIdle($('ref-x'), s.reference[0]);
    setIfIdle($('ref-y'), s.reference[1]);
    setIfIdle($('model-title'), s.title || '');
    $('mode-help').textContent =
      s.mode === 'priority'
        ? 'Overlappende areal tilhører formen som ligger øverst i lista, og telles bare én gang. Riktig for skall modellert i senterflaten.'
        : 'Hver form summeres for seg, som i et klassisk sammensatt tverrsnitt. Overlapp telles dobbelt.';

    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.dataset.active = String(btn.dataset.tool === this.tools.tool);
    });

    const n = s.shapes.length;
    $('shape-count').textContent = n ? `(${n})` : '';
  }

  _renderList() {
    const host = $('shape-list');
    const s = this.store.state;
    if (!s.shapes.length) {
      host.innerHTML =
        '<p class="text-xs text-slate-500 italic py-2">Ingen geometri ennå. Velg et verktøysymbol over, eller trykk «Eksempel».</p>';
      return;
    }
    const sel = new Set(s.selection);
    const partById = new Map((this.analysis?.parts || []).map((p) => [p.id, p]));

    host.innerHTML = s.shapes
      .map((sh, i) => {
        const active = sel.has(sh.id);
        const open = this.expanded.has(sh.id);
        const part = partById.get(sh.id);
        return `
      <div class="rounded border ${active ? 'border-sky-500' : 'border-slate-700'} ${open ? 'bg-slate-700' : 'bg-slate-750'}"
           data-row="${sh.id}">
        <div class="flex items-center gap-1.5 px-2 py-1.5">
          <input type="checkbox" data-act="include" data-id="${sh.id}" ${sh.include !== false ? 'checked' : ''}
                 class="w-3.5 h-3.5 accent-sky-500 shrink-0" title="Ta med i beregningen" />
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${sh.color}"></span>
          <button data-act="toggle" data-id="${sh.id}"
                  class="flex-1 flex items-center gap-1.5 text-left text-xs truncate ${active ? 'text-white' : 'text-slate-300'} hover:text-white">
            <span class="chev shrink-0 text-slate-500 ${open ? 'rotate-90' : ''}" style="display:inline-block">›</span>
            <span class="truncate">${escapeHtml(sh.name)}</span>
          </button>
          ${sh.role === 'void' ? '<span class="text-[10px] px-1 rounded bg-rose-900 text-rose-300 shrink-0">hull</span>' : ''}
          ${Math.abs(sh.factor - 1) > 1e-9 ? `<span class="text-[10px] px-1 rounded bg-amber-900 text-amber-300 shrink-0">×${sh.factor}</span>` : ''}
          <button data-act="up" data-id="${sh.id}" ${i === 0 ? 'disabled' : ''}
                  class="px-1 text-slate-400 hover:text-white disabled:opacity-25 shrink-0" title="Høyere prioritet">▲</button>
          <button data-act="down" data-id="${sh.id}" ${i === s.shapes.length - 1 ? 'disabled' : ''}
                  class="px-1 text-slate-400 hover:text-white disabled:opacity-25 shrink-0" title="Lavere prioritet">▼</button>
          <button data-act="delete" data-id="${sh.id}"
                  class="px-1 text-slate-400 hover:text-red-400 shrink-0" title="Slett">×</button>
        </div>
        ${
          !open && part
            ? `<div class="text-[10px] text-slate-500 px-2 pb-1 pl-8 num">effektivt areal ${fmtArea(part.area)}</div>`
            : ''
        }
        ${open ? this._editorHtml(sh, part) : ''}
      </div>`;
      })
      .join('');

    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      switch (btn.dataset.act) {
        case 'toggle':
          if (this.expanded.has(id)) {
            this.expanded.delete(id);
          } else {
            this.expanded.add(id);
          }
          this.store.select(e.shiftKey ? [...this.store.state.selection, id] : [id]);
          this._lastSelectionKey = this.store.state.selection.join(',');
          this._renderList();
          break;
        case 'include':
          this.store.updateShape(id, { include: btn.checked });
          break;
        case 'up':
          this.store.reorder(id, -1);
          break;
        case 'down':
          this.store.reorder(id, 1);
          break;
        case 'delete':
          this.expanded.delete(id);
          this.store.removeShapes([id]);
          break;
        case 'section': {
          const key = `${id}:${btn.dataset.section}`;
          if (this.sections.has(key)) this.sections.delete(key);
          else this.sections.add(key);
          this._renderList();
          break;
        }
      }
    };

    this._bindEditors();
  }

  /** Egenskapspanelet som vises inne i et åpnet listeelement. */
  _editorHtml(sh, part) {
    const ring = openRing(sh.points);
    const b = boundsOfPoints(ring);
    const grossArea = Math.abs(signedArea(ring));
    const showCoords = this.sections.has(`${sh.id}:coords`);
    const showTransform = this.sections.has(`${sh.id}:transform`);

    const sectionHead = (key, label) => `
      <button data-act="section" data-section="${key}" data-id="${sh.id}"
              class="w-full flex items-center gap-1.5 text-xs text-slate-300 hover:text-white py-1">
        <span class="chev text-slate-500 ${this.sections.has(`${sh.id}:${key}`) ? 'rotate-90' : ''}" style="display:inline-block">›</span>
        ${label}
      </button>`;

    return `
      <div class="px-2 pb-2 pt-1 space-y-2 border-t border-slate-600">

        <div>
          <label class="field-label" for="ed-name-${sh.id}">Navn</label>
          <input id="ed-name-${sh.id}" data-ed="name" data-id="${sh.id}" data-focus-key="ed-name-${sh.id}"
                 type="text" value="${escapeHtml(sh.name)}" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="field-label" for="ed-role-${sh.id}">Rolle</label>
            <select id="ed-role-${sh.id}" data-ed="role" data-id="${sh.id}" data-focus-key="ed-role-${sh.id}">
              <option value="solid" ${sh.role !== 'void' ? 'selected' : ''}>Fast areal</option>
              <option value="void" ${sh.role === 'void' ? 'selected' : ''}>Hull / utsparing</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="ed-factor-${sh.id}">Vektfaktor</label>
            <input id="ed-factor-${sh.id}" data-ed="factor" data-id="${sh.id}" data-focus-key="ed-factor-${sh.id}"
                   type="number" step="0.01" value="${sh.factor}" />
          </div>
        </div>

        <div class="text-[11px] text-slate-400 num space-y-0.5">
          <div>Areal brutto ${fmtArea(grossArea)}${
            part && Math.abs(part.area - grossArea) > 1e-6
              ? ` · effektivt <span class="text-cyan-300">${fmtArea(part.area)}</span>`
              : ''
          }</div>
          <div>x ∈ [${fmtLen(b.minX)}, ${fmtLen(b.maxX)}] · y ∈ [${fmtLen(b.minY)}, ${fmtLen(b.maxY)}]</div>
        </div>

        <div class="border-t border-slate-600 pt-1">
          ${sectionHead('coords', `Koordinater (${ring.length})`)}
          ${
            showCoords
              ? `<div class="max-h-52 overflow-y-auto panel-scroll space-y-1 pt-1">
                  ${ring
                    .map(
                      ([x, y], i) => `
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] text-slate-500 w-4 shrink-0 num">${i + 1}</span>
                      <input data-pt="${i}" data-axis="0" data-id="${sh.id}" data-focus-key="pt-${sh.id}-${i}-0" type="number" value="${round(x)}" />
                      <input data-pt="${i}" data-axis="1" data-id="${sh.id}" data-focus-key="pt-${sh.id}-${i}-1" type="number" value="${round(y)}" />
                      <button data-del-pt="${i}" data-id="${sh.id}" class="px-1 text-slate-500 hover:text-red-400 shrink-0" title="Slett punkt">×</button>
                    </div>`
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>

        <div class="border-t border-slate-600 pt-1">
          ${sectionHead('transform', 'Transformer')}
          ${
            showTransform
              ? `<div class="space-y-2 pt-1">
                  <div class="flex items-end gap-1.5">
                    <div class="flex-1"><label class="field-label" for="tr-dx-${sh.id}">Δx</label>
                      <input id="tr-dx-${sh.id}" data-focus-key="tr-dx-${sh.id}" type="number" value="0" /></div>
                    <div class="flex-1"><label class="field-label" for="tr-dy-${sh.id}">Δy</label>
                      <input id="tr-dy-${sh.id}" data-focus-key="tr-dy-${sh.id}" type="number" value="0" /></div>
                    <button data-tr="move" data-id="${sh.id}" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Flytt</button>
                  </div>
                  <div class="flex items-end gap-1.5">
                    <div class="flex-1"><label class="field-label" for="tr-ang-${sh.id}">Rotasjon [°] om nullpunkt</label>
                      <input id="tr-ang-${sh.id}" data-focus-key="tr-ang-${sh.id}" type="number" value="0" /></div>
                    <button data-tr="rotate" data-id="${sh.id}" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Roter</button>
                  </div>
                  <div class="flex gap-1.5">
                    <button data-tr="mirror-x" data-id="${sh.id}" class="flex-1 px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Speil om y₀</button>
                    <button data-tr="mirror-y" data-id="${sh.id}" class="flex-1 px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Speil om x₀</button>
                  </div>
                </div>`
              : ''
          }
        </div>
      </div>`;
  }

  _bindEditors() {
    const host = $('shape-list');
    const setPts = (id, pts) => this.store.setPoints(id, pts, { reason: 'edit' });

    host.querySelectorAll('[data-ed]').forEach((input) => {
      const id = input.dataset.id;
      const key = input.dataset.ed;
      if (key === 'name') {
        input.addEventListener('input', (e) => this.store.updateShape(id, { name: e.target.value }, { transient: true }));
        input.addEventListener('change', () => this.store.commit('rename'));
      } else if (key === 'role') {
        input.addEventListener('change', (e) => this.store.updateShape(id, { role: e.target.value }));
      } else if (key === 'factor') {
        input.addEventListener('change', (e) => {
          const v = Number(e.target.value);
          this.store.updateShape(id, { factor: Number.isFinite(v) ? v : 1 });
        });
      }
    });

    host.querySelectorAll('[data-pt]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const i = Number(e.target.dataset.pt);
        const axis = Number(e.target.dataset.axis);
        const pts = openRing(this.store.getShape(id).points).map((p) => [p[0], p[1]]);
        pts[i][axis] = Number(e.target.value) || 0;
        setPts(id, pts);
      });
    });

    host.querySelectorAll('[data-del-pt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const i = Number(e.currentTarget.dataset.delPt);
        const pts = openRing(this.store.getShape(id).points);
        if (pts.length <= 3) return this.toast('Et polygon må ha minst tre hjørner.');
        pts.splice(i, 1);
        setPts(id, pts);
      });
    });

    host.querySelectorAll('[data-tr]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const kind = e.currentTarget.dataset.tr;
        const pts = this.store.getShape(id).points;
        const ref = this.store.state.reference;
        if (kind === 'move') {
          const dx = Number($(`tr-dx-${id}`).value) || 0;
          const dy = Number($(`tr-dy-${id}`).value) || 0;
          if (!dx && !dy) return;
          setPts(id, translatePoints(pts, dx, dy));
        } else if (kind === 'rotate') {
          const ang = ((Number($(`tr-ang-${id}`).value) || 0) * Math.PI) / 180;
          if (!ang) return;
          setPts(id, rotatePoints(pts, ang, ref));
        } else if (kind === 'mirror-x') {
          setPts(id, mirrorPoints(pts, 'x', ref[1]));
        } else if (kind === 'mirror-y') {
          setPts(id, mirrorPoints(pts, 'y', ref[0]));
        }
      });
    });
  }

  _renderResults(analysis) {
    const main = $('result-main');
    const inertia = $('result-inertia');
    const parts = $('result-parts');
    const ref = this.store.state.reference;

    if (!analysis || !analysis.result.valid) {
      main.innerHTML = '<p class="text-xs text-slate-500 italic">Legg inn geometri for å se tyngdepunktet.</p>';
      inertia.innerHTML = '';
      parts.innerHTML = '';
      return;
    }

    const r = analysis.result;
    const dx = r.cx - ref[0];
    const dy = r.cy - ref[1];
    const overlap = analysis.grossArea - analysis.netArea;

    main.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        ${bigValue('x̄', fmtLen(r.cx))}
        ${bigValue('ȳ', fmtLen(r.cy))}
      </div>
      <div class="pt-2 border-t border-slate-700">
        <div class="text-[11px] text-slate-400 mb-1">Fra referansepunkt (${fmtLen(ref[0])}, ${fmtLen(ref[1])})</div>
        <div class="grid grid-cols-2 gap-2">
          ${bigValue('Δx', fmtLen(dx), 'text-amber-300')}
          ${bigValue('Δy', fmtLen(dy), 'text-amber-300')}
        </div>
      </div>
      <div class="pt-2 border-t border-slate-700 space-y-1 text-xs num">
        ${row(
          analysis.mode === 'priority' ? 'Areal (netto geometri)' : 'Areal (sum av deler)',
          fmtArea(analysis.mode === 'priority' ? analysis.netArea : analysis.grossArea)
        )}
        ${
          analysis.mode === 'priority'
            ? row('Areal (sum av deler)', fmtArea(analysis.grossArea), 'text-slate-400')
            : row('Areal (netto geometri)', fmtArea(analysis.netArea), 'text-slate-400')
        }
        ${
          Math.abs(overlap) > 1e-6
            ? row(
                analysis.mode === 'priority' ? 'Overlapp fjernet' : 'Overlapp telt dobbelt',
                fmtArea(overlap),
                analysis.mode === 'priority' ? 'text-cyan-300' : 'text-amber-300'
              )
            : ''
        }
        ${analysis.weighted ? row('Vektet areal ΣnᵢAᵢ', fmtArea(r.A), 'text-amber-300') : ''}
      </div>`;

    const deg = (r.theta * 180) / Math.PI;
    inertia.innerHTML = `
      <div class="space-y-1 num">
        ${row('Ix = ∫y²dA', fmtInertia(r.Ix))}
        ${row('Iy = ∫x²dA', fmtInertia(r.Iy))}
        ${row('Ixy', fmtInertia(r.Ixy))}
        ${row('I₁ (maks)', fmtInertia(r.I1))}
        ${row('I₂ (min)', fmtInertia(r.I2))}
        ${row('Hovedaksevinkel', `${nf(2)(deg)}°`)}
      </div>
      ${
        Math.abs(r.Ixy) > 1e-6 * Math.max(Math.abs(r.Ix), Math.abs(r.Iy))
          ? '<p class="text-[11px] text-amber-300/80 mt-2 leading-snug">Ixy ≠ 0: hovedaksene er rotert i forhold til x og y, så bøyning om x eller y alene gir skjev bøyning.</p>'
          : ''
      }`;

    parts.innerHTML = analysis.parts.length
      ? `<div class="space-y-1 num">
          ${analysis.parts
            .map((p) => {
              const share = r.A !== 0 ? (p.props.A / r.A) * 100 : 0;
              const label = `${escapeHtml(p.shape.name)}${p.isVoid ? ' (hull)' : ''}`;
              return `<div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-sm shrink-0" style="background:${p.shape.color}"></span>
                  <span class="flex-1 truncate text-slate-300">${label}</span>
                  <span class="text-slate-400">${fmtArea(p.props.A)}</span>
                  <span class="text-slate-500 w-12 text-right">${nf(1)(share)} %</span>
                </div>`;
            })
            .join('')}
        </div>`
      : '';
  }
}

/* ------------------------------------------------------------------ *
 * Små hjelpere
 * ------------------------------------------------------------------ */

function bigValue(label, value, cls = 'text-white') {
  return `<div>
    <div class="text-[11px] text-slate-400">${label}</div>
    <div class="text-lg font-semibold num ${cls}">${value}</div>
  </div>`;
}

function row(label, value, cls = 'text-slate-200') {
  return `<div class="flex justify-between gap-2">
    <span class="text-slate-400">${label}</span>
    <span class="${cls}">${value}</span>
  </div>`;
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
