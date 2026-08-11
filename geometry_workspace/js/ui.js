/**
 * ui.js — panelene rundt lerretet: geometriliste, redigering og resultater.
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
 * UI
 * ------------------------------------------------------------------ */

export class UI {
  constructor(store, viewport, tools, opts = {}) {
    this.store = store;
    this.viewport = viewport;
    this.tools = tools;
    this.onAnalyze = opts.onAnalyze;
    this.analysis = null;
    this._bind();
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

    // Verktøyknapper
    $('tool-buttons').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (btn) this.tools.setTool(btn.dataset.tool);
    });

    // Rutenett og visning
    $('grid-step').addEventListener('change', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      st.setGrid({ step: v });
    });
    $('chk-snap').addEventListener('change', (e) => st.setGrid({ snap: e.target.checked }));
    $('chk-grid').addEventListener('change', (e) => st.setGrid({ visible: e.target.checked }));
    $('chk-net').addEventListener('change', (e) => this.viewport.setOverlays({ showNet: e.target.checked }));
    $('chk-principal').addEventListener('change', (e) =>
      this.viewport.setOverlays({ showPrincipal: e.target.checked })
    );

    // Numerisk innlegging
    $('btn-add-rect').addEventListener('click', () => this._addRect());
    $('btn-add-shell').addEventListener('click', () => this._addShell());
    $('btn-add-circle').addEventListener('click', () => this._addCircle());

    // Listeoperasjoner
    $('btn-delete').addEventListener('click', () => this.deleteSelected());
    $('btn-duplicate').addEventListener('click', () => this.duplicateSelected());
    $('btn-clear').addEventListener('click', () => {
      if (!st.state.shapes.length) return;
      if (confirm('Fjerne all geometri?')) st.clear();
    });

    // Modus og referansepunkt
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

    // Zoom
    $('btn-fit').addEventListener('click', () => this.viewport.zoomToFit(st.bounds()));
    $('btn-zoom-in').addEventListener('click', () => this.viewport.zoomBy(1 / 1.3));
    $('btn-zoom-out').addEventListener('click', () => this.viewport.zoomBy(1.3));

    // Tittel
    $('model-title').addEventListener('input', (e) => st.setTitle(e.target.value));

    // Kopier
    $('btn-copy').addEventListener('click', () => this._copyResult());

    // Import/eksport
    $('btn-export').addEventListener('click', () => this._export());
    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => this._import(e));
    $('btn-example').addEventListener('click', () => this.loadExample());

    // Hjelp
    $('btn-help').addEventListener('click', () => $('help-overlay').classList.remove('hidden'));
    $('btn-help-close').addEventListener('click', () => $('help-overlay').classList.add('hidden'));
    $('help-overlay').addEventListener('click', (e) => {
      if (e.target === $('help-overlay')) $('help-overlay').classList.add('hidden');
    });
  }

  /* ---------------- legg til ---------------- */

  _num(id) {
    return Number($(id).value) || 0;
  }

  _addRect() {
    const x = this._num('r-x');
    const y = this._num('r-y');
    const b = this._num('r-b');
    const h = this._num('r-h');
    if (Math.abs(b) < 1e-9 || Math.abs(h) < 1e-9) return this.toast('Bredde og høyde må være ulik null.');
    const anchor = $('r-anchor').value;
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
    const p1 = [this._num('s-x1'), this._num('s-y1')];
    const p2 = [this._num('s-x2'), this._num('s-y2')];
    const t = Math.abs(this._num('s-t'));
    if (t < 1e-9) return this.toast('Tykkelsen må være større enn null.');
    const pts = shellPoints(p1, p2, t);
    if (!pts) return this.toast('Senterlinja har null lengde.');
    this.store.addShape(pts, { name: 'Skall', meta: { kind: 'shell', p1, p2, t } });
  }

  _addCircle() {
    const r = Math.abs(this._num('c-r'));
    if (r < 1e-9) return this.toast('Radien må være større enn null.');
    const c = [this._num('c-x'), this._num('c-y')];
    this.store.addShape(circlePoints(c[0], c[1], r), { name: 'Sirkel', meta: { kind: 'circle', c, r } });
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
    preserveFocus(() => {
      this._renderControls();
      this._renderList();
      this._renderEditor();
      this._renderResults(analysis);
    });
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

    const n = this.store.state.shapes.length;
    $('shape-count').textContent = n ? `(${n})` : '';
  }

  _renderList() {
    const host = $('shape-list');
    const s = this.store.state;
    if (!s.shapes.length) {
      host.innerHTML =
        '<p class="text-xs text-slate-500 italic py-2">Ingen geometri ennå. Tegn i lerretet, legg inn tall til venstre, eller trykk «Eksempel».</p>';
      return;
    }
    const sel = new Set(s.selection);
    const areaById = new Map((this.analysis?.parts || []).map((p) => [p.id, p.area]));

    host.innerHTML = s.shapes
      .map((sh, i) => {
        const active = sel.has(sh.id);
        const area = areaById.get(sh.id);
        return `
      <div class="rounded border ${active ? 'border-sky-500 bg-slate-700' : 'border-slate-700 bg-slate-750'} px-2 py-1.5"
           data-row="${sh.id}">
        <div class="flex items-center gap-1.5">
          <input type="checkbox" data-act="include" data-id="${sh.id}" ${sh.include !== false ? 'checked' : ''}
                 class="w-3.5 h-3.5 accent-sky-500 shrink-0" title="Ta med i beregningen" />
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${sh.color}"></span>
          <button data-act="select" data-id="${sh.id}"
                  class="flex-1 text-left text-xs truncate ${active ? 'text-white' : 'text-slate-300'} hover:text-white">
            ${escapeHtml(sh.name)}
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
          area != null
            ? `<div class="text-[10px] text-slate-500 pl-6 num">effektivt areal ${fmtArea(area)}</div>`
            : ''
        }
      </div>`;
      })
      .join('');

    host.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      switch (btn.dataset.act) {
        case 'select':
          this.store.select([id], e.shiftKey);
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
          this.store.removeShapes([id]);
          break;
      }
    };
  }

  _renderEditor() {
    const host = $('editor');
    const selected = this.store.selectedShapes();
    if (selected.length !== 1) {
      host.classList.add('hidden');
      host.innerHTML = selected.length > 1
        ? `<p class="text-xs text-slate-500">${selected.length} former markert.</p>`
        : '';
      if (selected.length > 1) host.classList.remove('hidden');
      return;
    }

    const sh = selected[0];
    host.classList.remove('hidden');
    const ring = openRing(sh.points);
    const b = boundsOfPoints(ring);
    const area = Math.abs(signedArea(ring));

    host.innerHTML = `
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Valgt form</h2>
      <div class="space-y-2 bg-slate-750 rounded border border-slate-700 p-3">

        <div>
          <label class="field-label" for="ed-name">Navn</label>
          <input id="ed-name" data-focus-key="ed-name" type="text" value="${escapeAttr(sh.name)}" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="field-label" for="ed-role">Rolle</label>
            <select id="ed-role" data-focus-key="ed-role">
              <option value="solid" ${sh.role !== 'void' ? 'selected' : ''}>Fast areal</option>
              <option value="void" ${sh.role === 'void' ? 'selected' : ''}>Hull / utsparing</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="ed-factor">Vektfaktor</label>
            <input id="ed-factor" data-focus-key="ed-factor" type="number" step="0.01" value="${sh.factor}" />
          </div>
        </div>
        <p class="text-[11px] text-slate-500 leading-snug">
          Vektfaktor = E-forhold ved transformert tverrsnitt. La stå på 1 når alt har samme materiale.
        </p>

        <div class="text-[11px] text-slate-400 num pt-1 border-t border-slate-700 space-y-0.5">
          <div>Areal (brutto): ${fmtArea(area)}</div>
          <div>Utstrekning: x ∈ [${fmtLen(b.minX)}, ${fmtLen(b.maxX)}], y ∈ [${fmtLen(b.minY)}, ${fmtLen(b.maxY)}]</div>
        </div>

        <details class="pt-1 border-t border-slate-700">
          <summary class="text-xs text-slate-300 py-1"><span class="chev inline-block">›</span> Koordinater (${ring.length})</summary>
          <div class="max-h-56 overflow-y-auto panel-scroll mt-1 space-y-1">
            ${ring
              .map(
                ([x, y], i) => `
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-slate-500 w-5 shrink-0 num">${i + 1}</span>
                <input data-pt="${i}" data-axis="0" data-focus-key="pt-${i}-0" type="number" value="${round(x)}" />
                <input data-pt="${i}" data-axis="1" data-focus-key="pt-${i}-1" type="number" value="${round(y)}" />
                <button data-del-pt="${i}" class="px-1 text-slate-500 hover:text-red-400 shrink-0" title="Slett punkt">×</button>
              </div>`
              )
              .join('')}
          </div>
        </details>

        <details class="pt-1 border-t border-slate-700">
          <summary class="text-xs text-slate-300 py-1"><span class="chev inline-block">›</span> Transformer</summary>
          <div class="space-y-2 mt-1">
            <div class="flex items-end gap-1.5">
              <div class="flex-1"><label class="field-label" for="tr-dx">Δx</label><input id="tr-dx" data-focus-key="tr-dx" type="number" value="0" /></div>
              <div class="flex-1"><label class="field-label" for="tr-dy">Δy</label><input id="tr-dy" data-focus-key="tr-dy" type="number" value="0" /></div>
              <button id="btn-translate" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Flytt</button>
            </div>
            <div class="flex items-end gap-1.5">
              <div class="flex-1"><label class="field-label" for="tr-ang">Rotasjon [°]</label><input id="tr-ang" data-focus-key="tr-ang" type="number" value="0" /></div>
              <button id="btn-rotate" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Roter om referansepunkt</button>
            </div>
            <div class="flex gap-1.5">
              <button id="btn-mirror-x" class="flex-1 px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Speil om y₀</button>
              <button id="btn-mirror-y" class="flex-1 px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Speil om x₀</button>
            </div>
          </div>
        </details>
      </div>`;

    // Binding
    const commitPoints = (pts, transient) =>
      this.store.setPoints(sh.id, pts, { transient, reason: 'edit' });

    $('ed-name').addEventListener('input', (e) =>
      this.store.updateShape(sh.id, { name: e.target.value }, { transient: true })
    );
    $('ed-name').addEventListener('change', () => this.store.commit('rename'));
    $('ed-role').addEventListener('change', (e) => this.store.updateShape(sh.id, { role: e.target.value }));
    $('ed-factor').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      this.store.updateShape(sh.id, { factor: Number.isFinite(v) ? v : 1 });
    });

    host.querySelectorAll('[data-pt]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const i = Number(e.target.dataset.pt);
        const axis = Number(e.target.dataset.axis);
        const pts = openRing(this.store.getShape(sh.id).points).map((p) => [p[0], p[1]]);
        pts[i][axis] = Number(e.target.value) || 0;
        commitPoints(pts, false);
      });
    });

    host.querySelectorAll('[data-del-pt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.dataset.delPt);
        const pts = openRing(this.store.getShape(sh.id).points);
        if (pts.length <= 3) return this.toast('Et polygon må ha minst tre hjørner.');
        pts.splice(i, 1);
        commitPoints(pts, false);
      });
    });

    $('btn-translate').addEventListener('click', () => {
      const dx = Number($('tr-dx').value) || 0;
      const dy = Number($('tr-dy').value) || 0;
      if (!dx && !dy) return;
      commitPoints(translatePoints(this.store.getShape(sh.id).points, dx, dy), false);
    });
    $('btn-rotate').addEventListener('click', () => {
      const ang = ((Number($('tr-ang').value) || 0) * Math.PI) / 180;
      if (!ang) return;
      commitPoints(rotatePoints(this.store.getShape(sh.id).points, ang, this.store.state.reference), false);
    });
    $('btn-mirror-x').addEventListener('click', () =>
      commitPoints(mirrorPoints(this.store.getShape(sh.id).points, 'x', this.store.state.reference[1]), false)
    );
    $('btn-mirror-y').addEventListener('click', () =>
      commitPoints(mirrorPoints(this.store.getShape(sh.id).points, 'y', this.store.state.reference[0]), false)
    );
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

function escapeAttr(s) {
  return escapeHtml(s);
}
