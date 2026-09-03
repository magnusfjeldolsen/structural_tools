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
  centroidOfPoints,
  centroidOfShapes,
} from './geometry.js';
import {
  describeShape,
  rectPointsFromParams,
  rectAnchorPoint,
  circlePointsFromParams,
  RECT_ANCHORS,
  isRectAnchor,
} from './shapes.js';
import { SNAP_TYPES, SNAP_ALL, ORTHO } from './snapping.js';
import { UNIT_KEYS, lengthLabel, areaLabel, inertiaLabel } from './units.js';
import { MATERIALS, materialByName, materialE } from './materials.js';
import { ReinforcementPanel } from './reinforcement-ui.js';

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
  move: 'Flytt utvalg',
  copy: 'Kopier utvalg',
  rotate: 'Roter utvalg',
  mirror: 'Speil utvalg',
  interface: 'Grensesnitt mellom eksisterende og ny del',
};

/** Overskriften på parameterseksjonen, etter hva formen viser seg å være. */
const PARAM_TITLES = {
  rect: 'Rektangel — b, h og rotasjon',
  circle: 'Sirkel — senter og radius',
  shell: 'Skall — senterlinje og tykkelse',
};

/** Sentrene en rotasjon eller speiling kan gjøres om. */
const CENTER_OPTIONS = [
  { key: 'reference', label: 'nullpunktet' },
  { key: 'centroid', label: 'utvalgets tyngdepunkt' },
  { key: 'pick', label: 'et klikket punkt' },
];

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
    this.underlayManager = opts.underlayManager || null;
    this.analysis = null;
    /** Aktiv fane i høyre panel: 'section' (tyngdepunkt) eller 'reinforcement'. */
    this.tab = 'section';
    /** Forsterkningsfanen bor i sin egen modul; ui.js er stor nok fra før. */
    this.reinforcement = new ReinforcementPanel(store, {
      toast: (m) => this.toast(m),
      onCopy: () => this._copyResult(),
    });
    /** Pågående to-punkts kalibrering av bildeunderlaget. */
    this.calibration = null;

    /** Åpne elementer i geometrilista. */
    this.expanded = new Set();
    /** Åpne underseksjoner, nøkler som `${id}:coords`. */
    this.sections = new Set();
    /** Formene som viser koordinatene relativt til sitt eget tyngdepunkt. */
    this.relCoords = new Set();
    /** Valgt ankerpunkt per form i det parametriske panelet. */
    this.anchors = new Map();
    this._lastSelectionKey = '';

    /** Sist innlagte tall per verktøy, så menyene husker hva du skrev. */
    this.form = {
      rect: { x: 0, y: 0, b: 1000, h: 300, anchor: 'corner' },
      shell: { x1: 0, y1: 0, x2: 0, y2: 3000, t: 250 },
      circle: { x: 0, y: 0, r: 200 },
      polygon: { text: '' },
      reference: { x: 0, y: 0 },
      move: { dx: 0, dy: 0 },
      copy: { dx: 0, dy: 0, n: 1 },
      rotate: { angle: 90, center: 'pick' },
      mirror: { keep: true },
      // Transformasjonspanelet i venstre panel, som virker på hele utvalget
      placement: { dx: 0, dy: 0, angle: 90, center: 'reference', keep: false },
    };

    this._bind();
    this._syncToolOptions();
  }

  /**
   * Speiler menyvalgene over i verktøyene, slik at antall kopier, «behold
   * original» og valgt rotasjonssenter gjelder også når kommandoen kjøres
   * ved å klikke i lerretet.
   */
  _syncToolOptions() {
    this.tools.options.copies = Math.max(1, Math.round(this.form.copy.n) || 1);
    this.tools.options.keepOriginal = !!this.form.mirror.keep;
    this.tools.options.rotateCenter = this.form.rotate.center;
  }

  /** Tykkelsen tegneverktøyet for skall skal bruke. */
  getThickness() {
    return this.form.shell.t;
  }

  /* ---------------- snap-brytere ---------------- */

  toggleSnap(key) {
    const t = SNAP_TYPES.find((s) => s.key === key);
    if (!t) return;
    const on = !this.store.state.snaps[key];
    this.store.setSnaps({ [key]: on });
    this.status(`${t.label}: ${on ? 'på' : 'av'} (${t.hint})`);
  }

  /** Alle av hvis noen er på, ellers alle på igjen. */
  toggleAllSnaps() {
    const snaps = this.store.state.snaps;
    const anyOn = SNAP_TYPES.some((t) => snaps[t.key]);
    if (anyOn) {
      this._snapMemory = { ...snaps };
      this.store.setSnaps(Object.fromEntries(SNAP_TYPES.map((t) => [t.key, false])));
      this.status(`Snap av (${SNAP_ALL.hint})`);
    } else {
      const restore = this._snapMemory || { endpoint: true, midpoint: true, edge: true, intersection: true, grid: true };
      this.store.setSnaps(restore);
      this.status(`Snap på (${SNAP_ALL.hint})`);
    }
  }

  toggleOrtho() {
    const on = !this.store.state.ortho;
    this.store.setOrtho(on);
    this.status(`Orto: ${on ? 'på' : 'av'} (${ORTHO.hint})`);
  }

  /** Tar imot Alt+siffer. Returnerer true hvis tasten ble brukt. */
  handleSnapShortcut(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return false;
    if (e.code === ORTHO.code) {
      this.toggleOrtho();
      return true;
    }
    if (e.code === SNAP_ALL.code) {
      this.toggleAllSnaps();
      return true;
    }
    const t = SNAP_TYPES.find((s) => s.code === e.code);
    if (!t) return false;
    this.toggleSnap(t.key);
    return true;
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
    $('chk-grid').addEventListener('change', (e) => st.setGrid({ visible: e.target.checked }));

    $('unit-select').addEventListener('change', (e) => {
      const to = e.target.value;
      if (!UNIT_KEYS.includes(to)) return;
      st.setUnit(to);
      this.toast(`Enhet satt til ${lengthLabel(to)} — koordinatene er regnet om, geometrien er uendret.`);
    });

    $('snap-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-ortho')) this.toggleOrtho();
      else if (btn.hasAttribute('data-snap-all')) this.toggleAllSnaps();
      else if (btn.dataset.snap) this.toggleSnap(btn.dataset.snap);
    });

    $('btn-image-pick').addEventListener('click', () => $('image-input').click());
    $('image-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file && this.underlayManager) this.underlayManager.accept(file, file.name);
      e.target.value = '';
    });
    $('chk-net').addEventListener('change', (e) => this.viewport.setOverlays({ showNet: e.target.checked }));
    $('chk-overlap').addEventListener('change', (e) => this.viewport.setOverlays({ showOverlap: e.target.checked }));
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

    $('result-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) this.setTab(btn.dataset.tab);
    });

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
    if (tool === 'move') {
      return `
        ${this._selectionNote()}
        <div class="grid grid-cols-2 gap-1.5">
          ${field('dx', 'Δx', f.move.dx)}${field('dy', 'Δy', f.move.dy)}
        </div>
        <button data-add class="w-full mt-2 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded">Flytt utvalg</button>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Eller klikk basispunkt og deretter sluttpunkt i lerretet. Begge snappes, og orto virker.
        </p>`;
    }
    if (tool === 'copy') {
      return `
        ${this._selectionNote()}
        <div class="grid grid-cols-3 gap-1.5">
          ${field('dx', 'Δx', f.copy.dx)}${field('dy', 'Δy', f.copy.dy)}${field('n', 'Antall', f.copy.n, 'min="1" step="1"')}
        </div>
        <button data-add class="w-full mt-2 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded">Kopier utvalg</button>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Antall over én gir en rekke med jevn avstand langs vektoren. Klikker du i lerretet, blir
          verktøyet stående med samme basispunkt, så du kan sette flere kopier etter hverandre.
        </p>`;
    }
    if (tool === 'rotate') {
      return `
        ${this._selectionNote()}
        <div class="flex items-end gap-1.5">
          <div class="flex-1">${field('angle', 'Vinkel [°]', f.rotate.angle, 'step="1"')}</div>
          <button data-add class="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 rounded whitespace-nowrap">Roter utvalg</button>
        </div>
        <div class="mt-2">
          <label class="field-label" for="f-center">Senteret er</label>
          <select id="f-center" data-form="center">
            ${CENTER_OPTIONS.map(
              (o) => `<option value="${o.key}" ${f.rotate.center === o.key ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Positiv vinkel er mot klokka. I lerretet klikker du senter, så et referansepunkt for
          startvinkelen, og til slutt der det skal ende — hold Shift for å låse til 15°.
        </p>`;
    }
    if (tool === 'mirror') {
      return `
        ${this._selectionNote()}
        <label class="flex items-center gap-1.5 text-[11px] text-slate-300">
          <input data-form="keep" type="checkbox" class="w-3.5 h-3.5 accent-sky-500" ${f.mirror.keep ? 'checked' : ''} />
          Behold originalen
        </label>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">
          Klikk to punkt i lerretet — de definerer speilaksen. Aksen kan ligge hvor som helst og
          ha hvilken som helst retning. Faste akser gjennom nullpunktet ligger i «Plassering».
        </p>`;
    }
    if (tool === 'interface') {
      const n = this.store.state.interfaces.length;
      const newCount = this.store.state.shapes.filter((s) => s.stage === 'new').length;
      return `
        <p class="text-[11px] ${newCount ? 'text-slate-400' : 'text-amber-300'} mb-2 leading-snug">
          ${
            newCount
              ? `${newCount} form${newCount === 1 ? ' er' : 'er er'} merket «ny».`
              : 'Ingen former er merket «ny» ennå — sett stadium i geometrilista først, så blir gjettet riktig.'
          }
        </p>
        <p class="text-[11px] text-slate-500 leading-snug">
          Klikk to punkt i skjøten mellom eksisterende og ny del. Verktøyet gjetter hvilken side som
          er den nye — pilene i lerretet peker den veien — og linjas lengde blir heftbredden
          <em>b</em>. Tall, forbindere og resultater ligger i fanen «Forsterkning» til høyre.
        </p>
        <p class="text-[11px] text-slate-500 mt-2 leading-snug">${
          n ? `${n} grensesnitt er lagt inn.` : 'Ingen grensesnitt ennå.'
        }</p>`;
    }
    return null;
  }

  /** Bytter fane i høyre panel. */
  setTab(tab) {
    this.tab = tab === 'reinforcement' ? 'reinforcement' : 'section';
    this._renderTabs();
  }

  _renderTabs() {
    const active = this.tab;
    document.querySelectorAll('#result-tabs [data-tab]').forEach((btn) => {
      btn.dataset.active = String(btn.dataset.tab === active);
    });
    $('tab-section').classList.toggle('hidden', active !== 'section');
    $('tab-reinforcement').classList.toggle('hidden', active !== 'reinforcement');
  }

  /** Liten linje som sier hva transformasjonen kommer til å virke på. */
  _selectionNote() {
    const n = this.store.state.selection.length;
    return `<p id="sel-note" class="text-[11px] ${n ? 'text-slate-400' : 'text-amber-300'} mb-2 leading-snug">${
      n ? `Virker på ${n} markert${n === 1 ? ' form' : 'e former'}.` : 'Ingen form er markert ennå.'
    }</p>`;
  }

  _bindPopover(tool) {
    const el = $('tool-popover');
    el.querySelector('[data-close]').addEventListener('click', () => {
      this.closePopover();
      this.tools.setTool('select');
    });

    const target = tool === 'polygon' ? this.form.polygon : this.form[tool];
    el.querySelectorAll('[data-form]').forEach((input) => {
      const evt = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evt, (e) => {
        const key = e.target.dataset.form;
        if (e.target.type === 'checkbox') target[key] = e.target.checked;
        else if (e.target.type === 'number') target[key] = Number(e.target.value) || 0;
        else target[key] = e.target.value;
        this._syncToolOptions();
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
        else if (tool === 'move') this._runMove(this.form.move.dx, this.form.move.dy);
        else if (tool === 'copy') this._runCopy(this.form.copy.dx, this.form.copy.dy, this.form.copy.n);
        else if (tool === 'rotate') this._runRotate(this.form.rotate.angle, this.form.rotate.center);
      });
    }
  }

  /* ---------------- transformasjoner fra tall ---------------- */

  /** Rotasjons-/speilsenteret som svarer til valget i menyen. */
  _centerFor(key) {
    if (key === 'reference') return this.store.state.reference.slice();
    if (key === 'centroid') return centroidOfShapes(this.store.selectedShapes());
    return null;
  }

  _runMove(dx, dy) {
    const res = this.tools.moveSelection(dx, dy);
    this.toast(res.msg);
  }

  _runCopy(dx, dy, n) {
    const ids = this.store.state.selection;
    if (!ids.length) return this.toast('Ingen form er markert.');
    if (!dx && !dy) return this.toast('Δx og Δy er begge null — kopien ville havnet oppå originalen.');
    const count = Math.max(1, Math.round(n) || 1);
    const offsets = [];
    for (let i = 1; i <= count; i++) offsets.push([dx * i, dy * i]);
    this.store.copyShapes(ids, offsets, { reason: 'copy' });
    this.toast(`${count === 1 ? 'Kopi' : `${count} kopier`} lagt inn.`);
  }

  _runRotate(angle, centerKey) {
    if (centerKey === 'pick') {
      this.tools.setTool('rotate');
      return this.toast('Klikk rotasjonssenteret i lerretet.');
    }
    const c = this._centerFor(centerKey);
    if (!c) return this.toast('Fant ikke noe senter å rotere om.');
    const res = this.tools.rotateSelection(angle, c);
    this.toast(res.msg);
  }

  /** Speiler utvalget om en vannrett eller loddrett akse gjennom senteret. */
  _runMirror(axis, centerKey, keep) {
    const c = this._centerFor(centerKey);
    if (!c) return this.toast('Fant ikke noe senter å speile om.');
    const b = axis === 'horizontal' ? [c[0] + 1, c[1]] : [c[0], c[1] + 1];
    const res = this.tools.mirrorSelection(c, b, { keepOriginal: keep });
    this.toast(res.msg);
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

  /* ---------------- plassering ---------------- */

  /**
   * Transformasjonspanelet som virker på hele utvalget under ett, pluss de to
   * sentreringsknappene. Det per form finnes fortsatt inne i geometrilista.
   */
  _renderPlacement() {
    const host = $('placement-panel');
    const f = this.form.placement;
    const n = this.store.state.selection.length;
    const unit = lengthLabel(this.store.state.unit);

    const btn = (attr, label, cls = 'bg-slate-700 hover:bg-slate-600') =>
      `<button ${attr} class="flex-1 px-2 py-1.5 text-[11px] ${cls} rounded border border-slate-600">${label}</button>`;

    host.innerHTML = `
      <div class="space-y-2">
        <div class="flex gap-1.5">
          ${btn('data-pl="center-selection"', 'Sentrer utvalg i origo')}
          ${btn('data-pl="center-all"', 'Sentrer alt i origo')}
        </div>
        <p class="text-[11px] text-slate-500 leading-snug">
          Sentreringen flytter nullpunktet med samme vektor, slik at avvikene i resultatpanelet
          ikke endrer seg av flyttingen.
        </p>

        <div class="border-t border-slate-700 pt-2 space-y-2">
          <div class="text-[11px] ${n ? 'text-slate-400' : 'text-amber-300'}">
            ${n ? `Transformer ${n} markert${n === 1 ? ' form' : 'e former'} under ett` : 'Marker former for å transformere dem'}
          </div>

          <div class="flex items-end gap-1.5">
            <div class="flex-1">
              <label class="field-label" for="pl-dx">Δx [${unit}]</label>
              <input id="pl-dx" data-pl-form="dx" data-focus-key="pl-dx" type="number" value="${f.dx}" />
            </div>
            <div class="flex-1">
              <label class="field-label" for="pl-dy">Δy [${unit}]</label>
              <input id="pl-dy" data-pl-form="dy" data-focus-key="pl-dy" type="number" value="${f.dy}" />
            </div>
            <button data-pl="move" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Flytt</button>
          </div>

          <div>
            <label class="field-label" for="pl-center">Senter for rotasjon og speiling</label>
            <select id="pl-center" data-pl-form="center" data-focus-key="pl-center">
              ${CENTER_OPTIONS.filter((o) => o.key !== 'pick')
                .map((o) => `<option value="${o.key}" ${f.center === o.key ? 'selected' : ''}>${o.label}</option>`)
                .join('')}
            </select>
          </div>

          <div class="flex items-end gap-1.5">
            <div class="flex-1">
              <label class="field-label" for="pl-angle">Vinkel [°]</label>
              <input id="pl-angle" data-pl-form="angle" data-focus-key="pl-angle" type="number" step="1" value="${f.angle}" />
            </div>
            <button data-pl="rotate" class="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 rounded">Roter</button>
          </div>

          <div class="flex gap-1.5">
            ${btn('data-pl="mirror-h"', 'Speil om vannrett akse')}
            ${btn('data-pl="mirror-v"', 'Speil om loddrett akse')}
          </div>

          <label class="flex items-center gap-1.5 text-[11px] text-slate-300">
            <input data-pl-form="keep" type="checkbox" class="w-3.5 h-3.5 accent-sky-500" ${f.keep ? 'checked' : ''} />
            Behold originalen ved speiling
          </label>
        </div>
      </div>`;

    host.querySelectorAll('[data-pl-form]').forEach((input) => {
      const key = input.dataset.plForm;
      const evt = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evt, (e) => {
        if (e.target.type === 'checkbox') f[key] = e.target.checked;
        else if (e.target.type === 'number') f[key] = Number(e.target.value) || 0;
        else f[key] = e.target.value;
      });
    });

    host.querySelectorAll('[data-pl]').forEach((el) => {
      el.addEventListener('click', () => {
        switch (el.dataset.pl) {
          case 'center-selection':
            this._centerSelection();
            break;
          case 'center-all':
            this._centerAll();
            break;
          case 'move':
            this._runMove(f.dx, f.dy);
            break;
          case 'rotate':
            this._runRotate(f.angle, f.center);
            break;
          case 'mirror-h':
            this._runMirror('horizontal', f.center, f.keep);
            break;
          case 'mirror-v':
            this._runMirror('vertical', f.center, f.keep);
            break;
        }
      });
    });
  }

  /**
   * Flytter de markerte formene slik at deres arealvektede tyngdepunkt havner
   * i (0, 0). Vektfaktorer og overlapphåndtering holdes utenfor her — dette
   * er ren plassering av geometri, ikke en beregning.
   */
  _centerSelection() {
    const sel = this.store.state.selection;
    if (!sel.length) return this.toast('Ingen form er markert.');
    const c = centroidOfShapes(this.store.selectedShapes());
    if (!c) return this.toast('Fant ikke noe tyngdepunkt i utvalget.');
    this.store.moveShapes(sel, -c[0], -c[1], { withReference: true, reason: 'center' });
    this.toast(`Utvalget sentrert: flyttet Δx = ${fmtLen(-c[0])}, Δy = ${fmtLen(-c[1])}.`);
  }

  /**
   * Flytter hele modellen slik at det sammensatte tyngdepunktet havner i
   * (0, 0) — samme punkt som resultatpanelet viser, altså med vektfaktorer og
   * valgt overlappmodus.
   */
  _centerAll() {
    if (!this.analysis || !this.analysis.result.valid) return this.toast('Ingen geometri å sentrere.');
    const { cx, cy } = this.analysis.result;
    const ids = this.store.state.shapes.map((s) => s.id);
    if (!ids.length) return this.toast('Ingen geometri å sentrere.');
    this.store.moveShapes(ids, -cx, -cy, { withReference: true, reason: 'center' });
    this.toast(`Modellen sentrert: flyttet Δx = ${fmtLen(-cx)}, Δy = ${fmtLen(-cy)}.`);
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
      s.mode = 'sum';
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
    // Er forsterkningsfanen aktiv, er det de tallene brukeren ser på — og da
    // er det de som skal på utklippstavla.
    if (this.tab === 'reinforcement') {
      const text = this.reinforcement.clipboardText();
      if (!text) return this.toast('Ingen forsterkningstall å kopiere.');
      return navigator.clipboard
        .writeText(text)
        .then(() => this.toast('Forsterkningsresultatet er kopiert til utklippstavla.'))
        .catch(() => this.toast('Kunne ikke kopiere.'));
    }
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
        // Er formen parametrisk, er det de tallene man vil ha fram først
        if (describeShape(this.store.getShape(sel[0]))) this.sections.add(`${sel[0]}:params`);
      }
    }

    preserveFocus(() => {
      this._renderControls();
      this._renderSnapChips();
      this._renderUnderlay();
      this._renderPlacement();
      this._renderList();
      this._renderResults(analysis);
      this._renderTabs();
      // Forsterkningsfanen tegnes selv om den er skjult, slik at tallene er
      // klare i det man bytter fane — og slik at fokusbevaringen over dekker
      // også dens tallfelt.
      this.reinforcement.render(analysis);
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
    setIfIdle($('unit-select'), s.unit);
    $('chk-grid').checked = s.grid.visible;
    setIfIdle($('mode-select'), s.mode);
    setIfIdle($('ref-x'), s.reference[0]);
    setIfIdle($('ref-y'), s.reference[1]);
    setIfIdle($('model-title'), s.title || '');
    $('mode-help').textContent =
      s.mode === 'sum'
        ? 'Hver form bidrar med hele sitt areal, også der formene overlapper. Overlappsonen telles altså to ganger, og trekker tyngdepunktet mot seg.'
        : 'Overlappet telles bare én gang, slik en sammenhengende, støpt geometri fysisk er.';

    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.dataset.active = String(btn.dataset.tool === this.tools.tool);
    });

    const n = s.shapes.length;
    $('shape-count').textContent = n ? `(${n})` : '';

    // Verktøymenyen for flytt/kopi/roter/speil sier hvor mange former den
    // virker på; den må holdes à jour når utvalget endrer seg.
    const note = $('sel-note');
    if (note) note.outerHTML = this._selectionNote();
  }

  /** Den lille snap-kontrollen nede til høyre i lerretet. */
  _renderSnapChips() {
    const st = this.store.state;
    const chip = (on, color, short, title, attr) =>
      `<button ${attr} title="${title}"
        class="px-1 py-0.5 text-[10px] leading-none rounded border transition whitespace-nowrap ${
          on
            ? 'bg-slate-700 border-slate-500 text-white'
            : 'bg-slate-900/60 border-slate-700 text-slate-500 hover:text-slate-300'
        }">
        <span class="inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle" style="background:${on ? color : '#475569'}"></span>${short}
      </button>`;

    const anyOn = SNAP_TYPES.some((t) => st.snaps[t.key]);

    $('snap-bar').innerHTML =
      chip(
        anyOn,
        '#e2e8f0',
        'Snap',
        `Slå alle snap av eller på — ${SNAP_ALL.hint}`,
        'data-snap-all'
      ) +
      '<span class="w-px h-4 bg-slate-600 mx-0.5"></span>' +
      SNAP_TYPES.map((t) =>
        chip(!!st.snaps[t.key], t.color, t.short, `${t.label} — ${t.hint}`, `data-snap="${t.key}"`)
      ).join('') +
      '<span class="w-px h-4 bg-slate-600 mx-0.5"></span>' +
      chip(
        !!st.ortho,
        ORTHO.color,
        ORTHO.short,
        `Lås til vannrett/loddrett — ${ORTHO.hint} eller F8. Hold Shift for å snu midlertidig.`,
        'data-ortho'
      );
  }

  _renderUnderlay() {
    const host = $('underlay-panel');
    const u = this.store.state.underlay;
    const unit = lengthLabel(this.store.state.unit);

    if (!u) {
      host.innerHTML = `<p class="text-[11px] text-slate-500 leading-snug">
        Slipp en bildefil på lerretet, lim inn et skjermutklipp med <kbd class="px-1 bg-slate-700 rounded">Ctrl+V</kbd>,
        eller velg fil. Deretter kalibrerer du målestokken med to punkt du vet avstanden mellom.
      </p>`;
      return;
    }

    const cal = this.calibration;
    host.innerHTML = `
      <div class="bg-slate-750 rounded border border-slate-700 p-2.5 space-y-2">
        <div class="flex items-center gap-2">
          <span class="flex-1 text-xs text-slate-300 truncate">${escapeHtml(u.name || 'bilde')}</span>
          <button data-u="remove" class="text-slate-500 hover:text-red-400 text-sm leading-none" title="Fjern bildet">×</button>
        </div>

        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
          <label class="flex items-center gap-1.5"><input data-u="visible" type="checkbox" class="w-3.5 h-3.5 accent-sky-500" ${u.visible ? 'checked' : ''} /> Vis</label>
          <label class="flex items-center gap-1.5"><input data-u="locked" type="checkbox" class="w-3.5 h-3.5 accent-amber-500" ${u.locked ? 'checked' : ''} /> Lås</label>
        </div>

        <div>
          <label class="field-label" for="u-opacity">Gjennomsiktighet</label>
          <input id="u-opacity" data-u="opacity" data-focus-key="u-opacity" type="range" min="0.05" max="1" step="0.05"
                 value="${u.opacity}" class="w-full accent-sky-500" />
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <div><label class="field-label" for="u-x">x [${unit}]</label>
            <input id="u-x" data-u="x" data-focus-key="u-x" type="number" value="${tidy(u.x)}" /></div>
          <div><label class="field-label" for="u-y">y [${unit}]</label>
            <input id="u-y" data-u="y" data-focus-key="u-y" type="number" value="${tidy(u.y)}" /></div>
          <div><label class="field-label" for="u-width">Bredde [${unit}]</label>
            <input id="u-width" data-u="width" data-focus-key="u-width" type="number" value="${tidy(u.width)}" /></div>
          <div><label class="field-label" for="u-rot">Rotasjon [°]</label>
            <input id="u-rot" data-u="rotation" data-focus-key="u-rot" type="number"
                   value="${tidy(((u.rotation || 0) * 180) / Math.PI)}" /></div>
        </div>

        ${
          cal
            ? `<div class="pt-2 border-t border-slate-600 space-y-1.5">
                 <div class="text-[11px] text-slate-400 num">Målt avstand: ${fmtLen(cal.measured)} ${unit}</div>
                 <div class="flex items-end gap-1.5">
                   <div class="flex-1">
                     <label class="field-label" for="cal-len">Virkelig lengde [${unit}]</label>
                     <input id="cal-len" data-focus-key="cal-len" type="number" value="${cal.trueLength ?? ''}" />
                   </div>
                   <button data-u="apply-cal" class="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded whitespace-nowrap">Skaler</button>
                 </div>
               </div>`
            : `<button data-u="calibrate" class="w-full px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded">
                 Kalibrer målestokk (to punkt)
               </button>`
        }
      </div>`;

    host.querySelectorAll('[data-u]').forEach((el) => {
      const key = el.dataset.u;
      if (key === 'remove') {
        el.addEventListener('click', () => {
          this.store.clearUnderlay();
          this.calibration = null;
          if (this.underlayManager) this.underlayManager.clear();
          this.viewport.setUnderlayImage(null);
        });
      } else if (key === 'calibrate') {
        el.addEventListener('click', () => this.tools.setTool('calibrate'));
      } else if (key === 'apply-cal') {
        el.addEventListener('click', () => this._applyCalibration());
      } else if (key === 'visible' || key === 'locked') {
        el.addEventListener('change', (e) => this.store.setUnderlay({ [key]: e.target.checked }));
      } else if (key === 'opacity') {
        el.addEventListener('input', (e) =>
          this.store.setUnderlay({ opacity: Number(e.target.value) }, { transient: true })
        );
        el.addEventListener('change', () => this.store.commit('underlay'));
      } else if (key === 'rotation') {
        el.addEventListener('change', (e) =>
          this.store.setUnderlay({ rotation: ((Number(e.target.value) || 0) * Math.PI) / 180 })
        );
      } else if (key === 'width') {
        el.addEventListener('change', (e) => {
          const w = Math.abs(Number(e.target.value)) || 1;
          const cur = this.store.state.underlay;
          const aspect = cur.width / Math.max(cur.height, 1e-9);
          this.store.setUnderlay({ width: w, height: w / aspect });
        });
      } else {
        el.addEventListener('change', (e) => this.store.setUnderlay({ [key]: Number(e.target.value) || 0 }));
      }
    });
  }

  /** Skalerer bildet slik at den målte avstanden blir den oppgitte lengden. */
  _applyCalibration() {
    const cal = this.calibration;
    const trueLength = Number($('cal-len').value);
    if (!cal || !Number.isFinite(trueLength) || trueLength <= 0) {
      return this.toast('Skriv inn den virkelige lengden.');
    }
    const f = trueLength / cal.measured;
    const u = this.store.state.underlay;
    if (!u) return;
    // Skalerer om det første klikkpunktet, så det blir liggende i ro
    this.store.setUnderlay({
      width: u.width * f,
      height: u.height * f,
      x: cal.a[0] + (u.x - cal.a[0]) * f,
      y: cal.a[1] + (u.y - cal.a[1]) * f,
    });
    this.calibration = null;
    // Zoom til bildet, ikke bare til geometrien — det er gjerne tomt ennå
    const nu = this.store.state.underlay;
    this.viewport.zoomToFit({
      minX: nu.x - nu.width / 2,
      maxX: nu.x + nu.width / 2,
      minY: nu.y - nu.height / 2,
      maxY: nu.y + nu.height / 2,
    });
    this.toast(`Målestokk satt: bildet skalert ${f.toFixed(4)}×.`);
  }

  /** Kalles fra verktøyet når to kalibreringspunkt er klikket. */
  onCalibrationPicked({ a, b, measured }) {
    this.calibration = { a, b, measured };
    this.tools.setTool('select');
    this._renderUnderlay();
    const input = $('cal-len');
    if (input) input.focus();
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
          ${sh.stage === 'new' ? '<span class="text-[10px] px-1 rounded bg-emerald-900 text-emerald-300 shrink-0" title="Ny del — tegnes med stiplet kontur">ny</span>' : ''}
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
        case 'relcoords':
          if (this.relCoords.has(id)) this.relCoords.delete(id);
          else this.relCoords.add(id);
          this._renderList();
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

  /**
   * Ankerpunktet den parametriske redigeringen skalerer om. Valget er en
   * ren visningspreferanse, så det ligger i UI-et — men det skrives også til
   * `meta` når geometrien endres, slik at det overlever en runde på disk.
   */
  _anchorOf(sh) {
    const fromUi = this.anchors.get(sh.id);
    if (isRectAnchor(fromUi)) return fromUi;
    const fromMeta = sh.meta && sh.meta.anchor;
    return isRectAnchor(fromMeta) ? fromMeta : 'center';
  }

  /**
   * Parameterfeltene for en form som lar seg beskrive parametrisk. Tallene
   * utledes alltid fra punktene, aldri fra `meta` — har brukeren dratt i et
   * hjørne, viser panelet den nye virkeligheten, eller forsvinner helt hvis
   * formen ikke lenger er et rektangel.
   */
  _paramsHtml(sh, desc) {
    const unit = lengthLabel(this.store.state.unit);
    const f = (key, label, value, attrs = '') => `
      <div>
        <label class="field-label" for="pr-${key}-${sh.id}">${label}</label>
        <input id="pr-${key}-${sh.id}" data-par="${key}" data-kind="${desc.kind}" data-id="${sh.id}"
               data-focus-key="pr-${key}-${sh.id}" type="number" ${attrs} value="${round(value)}" />
      </div>`;

    if (desc.kind === 'rect') {
      const anchor = this._anchorOf(sh);
      const a = rectAnchorPoint(desc, anchor);
      return `
        <div class="space-y-2 pt-1">
          <div class="grid grid-cols-2 gap-2">
            ${f('b', `Bredde b [${unit}]`, desc.b)}
            ${f('h', `Høyde h [${unit}]`, desc.h)}
          </div>
          <div>
            <label class="field-label" for="pr-anchor-${sh.id}">Ankerpunkt — b og h vokser fra dette</label>
            <select id="pr-anchor-${sh.id}" data-anchor data-id="${sh.id}" data-focus-key="pr-anchor-${sh.id}">
              ${RECT_ANCHORS.map(
                (o) => `<option value="${o.key}" ${anchor === o.key ? 'selected' : ''}>x, y = ${o.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="grid grid-cols-3 gap-2">
            ${f('x', `x [${unit}]`, a[0])}
            ${f('y', `y [${unit}]`, a[1])}
            ${f('angle', 'Rotasjon [°]', desc.angle, 'step="1"')}
          </div>
          <p class="text-[11px] text-slate-500 leading-snug">
            Rotasjonen måles mot klokka fra x-aksen, og b er siden langs den retningen.
            Endrer du b eller h, står ankerpunktet stille.
          </p>
        </div>`;
    }

    if (desc.kind === 'circle') {
      return `
        <div class="space-y-2 pt-1">
          <div class="grid grid-cols-3 gap-2">
            ${f('x', `x [${unit}]`, desc.c[0])}
            ${f('y', `y [${unit}]`, desc.c[1])}
            ${f('r', `Radius r [${unit}]`, desc.r)}
          </div>
          <p class="text-[11px] text-slate-500 leading-snug">
            Tilnærmet med en ${desc.segments}-kant, så arealet er marginalt mindre enn πr².
          </p>
        </div>`;
    }

    if (desc.kind === 'shell') {
      return `
        <div class="space-y-2 pt-1">
          <div class="grid grid-cols-2 gap-2">
            ${f('x1', `x₁ [${unit}]`, desc.p1[0])}
            ${f('y1', `y₁ [${unit}]`, desc.p1[1])}
            ${f('x2', `x₂ [${unit}]`, desc.p2[0])}
            ${f('y2', `y₂ [${unit}]`, desc.p2[1])}
          </div>
          <div class="grid grid-cols-2 gap-2">
            ${f('t', `Tykkelse t [${unit}]`, desc.t)}
            <div class="self-end text-[11px] text-slate-400 num pb-1.5">lengde ${fmtLen(desc.length)} ${unit}</div>
          </div>
          <p class="text-[11px] text-slate-500 leading-snug">
            Senterlinje og tykkelse — rektangelet er tykkelsen sentrert om linja, slik skallet
            faktisk er modellert.
          </p>
        </div>`;
    }
    return '';
  }

  /**
   * Stadium og materiale — de to feltene forsterkningsberegningen lever av.
   *
   * `stage` skiller det eksisterende tverrsnittet fra den nye delen (som får
   * stiplet kontur i lerretet), og `material.E` er E-modulen mekanikken bruker.
   * Vektfaktoren over i panelet er noe helt annet, og det står det uttrykkelig
   * i hjelpeteksten her — det er en forveksling som ville gitt gale tall.
   */
  _stageHtml(sh) {
    const mat = sh.material || {};
    const E = materialE(mat);
    const preset = materialByName(mat.name);
    // Er E endret bort fra presetet, skal det stå — ellers ville nedtrekket
    // gitt inntrykk av at det er presetets verdi som gjelder.
    const custom = preset ? Math.abs(preset.E - E) > 1e-9 : true;
    const groups = [];
    for (const m of MATERIALS) {
      if (!groups.length || groups[groups.length - 1].name !== m.group) {
        groups.push({ name: m.group, items: [] });
      }
      groups[groups.length - 1].items.push(m);
    }

    return `
      <div class="border-t border-slate-600 pt-2 space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="field-label" for="ed-stage-${sh.id}">Stadium</label>
            <select id="ed-stage-${sh.id}" data-ed="stage" data-id="${sh.id}" data-focus-key="ed-stage-${sh.id}">
              <option value="existing" ${sh.stage !== 'new' ? 'selected' : ''}>Eksisterende</option>
              <option value="new" ${sh.stage === 'new' ? 'selected' : ''}>Ny — forsterkning</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="ed-E-${sh.id}">E [N/mm²]</label>
            <input id="ed-E-${sh.id}" data-ed="E" data-id="${sh.id}" data-focus-key="ed-E-${sh.id}"
                   type="number" step="500" min="0" value="${round(E)}" />
          </div>
        </div>
        <div>
          <label class="field-label" for="ed-mat-${sh.id}">Materiale</label>
          <select id="ed-mat-${sh.id}" data-ed="material" data-id="${sh.id}" data-focus-key="ed-mat-${sh.id}">
            ${groups
              .map(
                (g) => `<optgroup label="${g.name}">${g.items
                  .map(
                    (m) =>
                      `<option value="${escapeHtml(m.name)}" ${mat.name === m.name ? 'selected' : ''}>${escapeHtml(m.label)} — ${m.E} N/mm²</option>`
                  )
                  .join('')}</optgroup>`
              )
              .join('')}
          </select>
          <p class="text-[10px] text-slate-500 mt-1 leading-snug">
            ${custom ? '<span class="text-amber-300">E er satt manuelt</span> og overstyrer presetet. ' : ''}E brukes
            bare i fanen «Forsterkning». Vektfaktoren over gjelder bare tyngdepunktet — de to er uavhengige.
          </p>
        </div>
      </div>`;
  }

  /** Egenskapspanelet som vises inne i et åpnet listeelement. */
  _editorHtml(sh, part) {
    const ring = openRing(sh.points);
    const b = boundsOfPoints(ring);
    const grossArea = Math.abs(signedArea(ring));
    const showCoords = this.sections.has(`${sh.id}:coords`);
    const showTransform = this.sections.has(`${sh.id}:transform`);
    const showParams = this.sections.has(`${sh.id}:params`);
    const desc = describeShape(sh);
    // Koordinatene kan leses absolutt eller i forhold til formens eget
    // tyngdepunkt — det siste er nyttig når man vil se formen for seg selv.
    const rel = this.relCoords.has(sh.id);
    const c = rel ? centroidOfPoints(ring) : [0, 0];

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

        ${this._stageHtml(sh)}

        <div class="text-[11px] text-slate-400 num space-y-0.5">
          <div>Areal brutto ${fmtArea(grossArea)}${
            part && Math.abs(part.area - grossArea) > 1e-6
              ? ` · effektivt <span class="text-cyan-300">${fmtArea(part.area)}</span>`
              : ''
          }</div>
          <div>x ∈ [${fmtLen(b.minX)}, ${fmtLen(b.maxX)}] · y ∈ [${fmtLen(b.minY)}, ${fmtLen(b.maxY)}]</div>
        </div>

        ${
          desc
            ? `<div class="border-t border-slate-600 pt-1">
                 ${sectionHead('params', PARAM_TITLES[desc.kind])}
                 ${showParams ? this._paramsHtml(sh, desc) : ''}
               </div>`
            : ''
        }

        <div class="border-t border-slate-600 pt-1">
          ${sectionHead('coords', `Koordinater (${ring.length})`)}
          ${
            showCoords
              ? `<div class="pt-1">
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-[10px] text-slate-500 leading-snug">${
                      rel
                        ? `relativt til tyngdepunktet (${fmtLen(c[0])}, ${fmtLen(c[1])})`
                        : 'absolutte koordinater'
                    }</span>
                    <button data-act="relcoords" data-id="${sh.id}"
                            class="px-1.5 py-0.5 text-[10px] rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 shrink-0">
                      ${rel ? 'Vis absolutt' : 'Vis relativt'}
                    </button>
                  </div>
                  <div class="max-h-52 overflow-y-auto panel-scroll space-y-1">
                    ${ring
                      .map(
                        ([x, y], i) => `
                      <div class="flex items-center gap-1">
                        <span class="text-[10px] text-slate-500 w-4 shrink-0 num">${i + 1}</span>
                        <input data-pt="${i}" data-axis="0" data-id="${sh.id}" data-rel="${rel ? 1 : 0}" data-focus-key="pt-${sh.id}-${i}-0" type="number" value="${round(x - c[0])}" />
                        <input data-pt="${i}" data-axis="1" data-id="${sh.id}" data-rel="${rel ? 1 : 0}" data-focus-key="pt-${sh.id}-${i}-1" type="number" value="${round(y - c[1])}" />
                        <button data-del-pt="${i}" data-id="${sh.id}" class="px-1 text-slate-500 hover:text-red-400 shrink-0" title="Slett punkt">×</button>
                      </div>`
                      )
                      .join('')}
                  </div>
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
      } else if (key === 'stage') {
        input.addEventListener('change', (e) =>
          this.store.updateShape(id, { stage: e.target.value === 'new' ? 'new' : 'existing' })
        );
      } else if (key === 'material') {
        input.addEventListener('change', (e) => {
          const preset = materialByName(e.target.value);
          if (!preset) return;
          // Presetet setter BÅDE navn og E, slik at nedtrekket alltid stemmer
          // med tallet ved siden av.
          this.store.updateShape(id, { material: { name: preset.name, E: preset.E } });
        });
      } else if (key === 'E') {
        input.addEventListener('change', (e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v) || v <= 0) return this.toast('E må være et positivt tall i N/mm².');
          const cur = this.store.getShape(id);
          const name = (cur && cur.material && cur.material.name) || '';
          this.store.updateShape(id, { material: { name, E: v } });
        });
      }
    });

    host.querySelectorAll('[data-pt]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const i = Number(e.target.dataset.pt);
        const axis = Number(e.target.dataset.axis);
        const pts = openRing(this.store.getShape(id).points).map((p) => [p[0], p[1]]);
        // I relativ modus er tallet målt fra tyngdepunktet slik formen står nå
        const base = e.target.dataset.rel === '1' ? centroidOfPoints(pts)[axis] : 0;
        pts[i][axis] = base + (Number(e.target.value) || 0);
        setPts(id, pts);
      });
    });

    // Ankervalget endrer ikke geometrien, bare hvilket punkt x og y viser til
    host.querySelectorAll('[data-anchor]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        this.anchors.set(e.target.dataset.id, e.target.value);
        this._renderList();
      });
    });

    host.querySelectorAll('[data-par]').forEach((input) => {
      input.addEventListener('change', (e) => this._applyParams(e.target.dataset.id, e.target.dataset.kind));
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

  /**
   * Bygger formen på nytt fra parameterfeltene. `meta` skrives med, slik at
   * verktøyet husker hva formen er ment som — men den er bare en huskelapp:
   * neste gang panelet åpnes, leses tallene av punktene på nytt.
   */
  _applyParams(id, kind) {
    const sh = this.store.getShape(id);
    if (!sh) return;
    const val = (key) => {
      const el = $(`pr-${key}-${id}`);
      return el ? Number(el.value) || 0 : 0;
    };

    if (kind === 'rect') {
      const anchor = this._anchorOf(sh);
      const b = Math.abs(val('b'));
      const h = Math.abs(val('h'));
      if (b < 1e-9 || h < 1e-9) return this.toast('Bredde og høyde må være større enn null.');
      const angle = val('angle');
      const x = val('x');
      const y = val('y');
      const pts = rectPointsFromParams({ b, h, angle, anchor, x, y });
      if (!pts) return;
      this.store.updateShape(
        id,
        { points: pts, meta: { kind: 'rect', b, h, angle, anchor, origin: [x, y] } },
        { reason: 'params' }
      );
      return;
    }

    if (kind === 'circle') {
      const r = Math.abs(val('r'));
      if (r < 1e-9) return this.toast('Radien må være større enn null.');
      const x = val('x');
      const y = val('y');
      const segments = describeShape(sh)?.segments || 48;
      const pts = circlePointsFromParams({ x, y, r, segments });
      if (!pts) return;
      this.store.updateShape(id, { points: pts, meta: { kind: 'circle', c: [x, y], r } }, { reason: 'params' });
      return;
    }

    if (kind === 'shell') {
      const t = Math.abs(val('t'));
      if (t < 1e-9) return this.toast('Tykkelsen må være større enn null.');
      const p1 = [val('x1'), val('y1')];
      const p2 = [val('x2'), val('y2')];
      const pts = shellPoints(p1, p2, t);
      if (!pts) return this.toast('Senterlinja har null lengde.');
      this.store.updateShape(id, { points: pts, meta: { kind: 'shell', p1, p2, t } }, { reason: 'params' });
    }
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
    const unit = this.store.state.unit;
    const uL = lengthLabel(unit);
    const uA = areaLabel(unit);

    main.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        ${bigValue(`x̄ [${uL}]`, fmtLen(r.cx))}
        ${bigValue(`ȳ [${uL}]`, fmtLen(r.cy))}
      </div>
      <div class="pt-2 border-t border-slate-700">
        <div class="text-[11px] text-slate-400 mb-1">Fra referansepunkt (${fmtLen(ref[0])}, ${fmtLen(ref[1])})</div>
        <div class="grid grid-cols-2 gap-2">
          ${bigValue(`Δx [${uL}]`, fmtLen(dx), 'text-amber-300')}
          ${bigValue(`Δy [${uL}]`, fmtLen(dy), 'text-amber-300')}
        </div>
      </div>
      <div class="pt-2 border-t border-slate-700 space-y-1 text-xs num">
        ${
          analysis.mode === 'sum'
            ? row(`Areal, skallmodell [${uA}]`, fmtArea(analysis.grossArea)) +
              row(`Areal, fysisk [${uA}]`, fmtArea(analysis.netArea), 'text-slate-400')
            : row(`Areal, fysisk [${uA}]`, fmtArea(analysis.netArea)) +
              row(`Areal, skallmodell [${uA}]`, fmtArea(analysis.grossArea), 'text-slate-400')
        }
        ${
          Math.abs(overlap) > 1e-6
            ? row(
                analysis.mode === 'sum' ? 'Herav overlapp, telt to ganger' : 'Overlapp trukket fra',
                fmtArea(overlap),
                analysis.mode === 'sum' ? 'text-amber-300' : 'text-cyan-300'
              )
            : ''
        }
        ${analysis.weighted ? row('Vektet areal ΣnᵢAᵢ', fmtArea(r.A), 'text-amber-300') : ''}
      </div>`;

    const deg = (r.theta * 180) / Math.PI;
    const uI = inertiaLabel(unit);
    inertia.innerHTML = `
      <div class="space-y-1 num">
        ${row(`Ix = ∫y²dA [${uI}]`, fmtInertia(r.Ix))}
        ${row(`Iy = ∫x²dA [${uI}]`, fmtInertia(r.Iy))}
        ${row(`Ixy [${uI}]`, fmtInertia(r.Ixy))}
        ${row(`I₁ maks [${uI}]`, fmtInertia(r.I1))}
        ${row(`I₂ min [${uI}]`, fmtInertia(r.I2))}
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

/**
 * Avrunding for felt man bare leser av og av og til retter på. Bildets
 * plassering trenger ikke ni desimaler for å være nyttig.
 */
function tidy(v) {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  const dec = a >= 100 ? 1 : a >= 1 ? 3 : 6;
  return Number(v.toFixed(dec));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
