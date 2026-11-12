/**
 * cad-overlay.js — cad2d-editoren i et overlegg over siden (#93).
 *
 * Klikk på tverrsnittsfiguren (eller «Edit geometry…») for bjelke eller fritt
 * tverrsnitt åpner editoren. OK gir polygonet med hull og tegningen
 * (`cad2d.document`) til `onApply`; ui.js sender dem gjennom samme dør som en
 * lastet fil (#83). Avbryt endrer ingenting.
 *
 * Editoren (og three.js) lastes først når overlegget åpnes, så siden starter
 * like raskt som før. Svikter lastingen (CDN nede, offline), får `onError` en
 * melding, og csc regner videre som før.
 *
 * Overlegget er modalt (review av #94):
 *  - fokus holdes i overlegget (Tab snur ved endene, samme mønster som
 *    rapporten i main.js — uten `tabindex`, som er forbudt i csc);
 *  - editorens taster virker uansett hvor i overlegget fokus står (unntatt i
 *    tekstfelt), og ingen tast slipper ut til siden bak;
 *  - Esc, Avbryt og klikk utenfor ber om bekreftelse i en egen linje når
 *    tegningen er endret («Discard changes?»), og lukker rett ellers;
 *  - et avvist OK (f.eks. to usammenhengende deler) sier hvorfor og setter
 *    fokus tilbake i editoren;
 *  - når overlegget lukkes, går fokus til knappen verten oppgir.
 */

const EDITOR_URL = '../../cad2d/js/editor/editor.js';
const PROJECT_URL = '../../cad2d/js/io/project.js';
const DOCUMENT_URL = '../../cad2d/js/core/document.js';

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const sci = (v) => (Number.isFinite(v) ? v.toExponential(3).replace('e+', 'e') : '–');
const isTypingTarget = (el) => {
  const tag = ((el && el.tagName) || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(el && el.isContentEditable);
};

/**
 * @param {{onApply: (section, cad, {dirty: boolean}) => void, onError?: (msg: string) => void,
 *          loader?: () => Promise<Array>}} opts
 *   `loader` er for testing (simulert CDN-svikt); standard er dynamisk import.
 */
export function createCadOverlay({ onApply, onError = () => {}, loader = null }) {
  let overlay = null;
  let host = null;
  let info = null;
  let confirmBar = null;
  let editor = null;
  let opening = null;
  let returnFocus = null;

  /** `hidden` alene holder ikke: Tailwinds `flex` vinner over [hidden]. */
  function setShown(on) {
    overlay.hidden = !on;
    overlay.style.display = on ? '' : 'none';
  }

  function focusables() {
    return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
      .filter((el) => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0);
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'cad-overlay fixed inset-0 z-[60] bg-slate-950/80 flex items-center justify-center p-3';
    overlay.setAttribute('data-cad-overlay', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Geometry editor');
    setShown(false);
    overlay.innerHTML = `
      <div class="cad-panel w-full h-full max-w-[1600px] flex flex-col rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-2xl">
        <div class="flex items-center gap-3 px-4 py-2 border-b border-slate-700">
          <span class="text-sm font-semibold text-slate-100">Edit geometry</span>
          <span class="text-[11px] text-slate-500">Draw shapes and holes, or import DXF. Same tools and keys as Geometry Workspace. Holes cut every solid they overlap.</span>
        </div>
        <div class="cad-host flex-1 min-h-0"></div>
        <div class="cad-confirm flex items-center gap-3 px-4 py-2 border-t border-amber-700 bg-amber-950/40" role="alertdialog" aria-label="Discard changes?">
          <span class="flex-1 text-[12px] text-amber-200">Discard changes? The drawing has been changed and will be lost.</span>
          <button type="button" data-cad-keep class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-xs">Keep editing</button>
          <button type="button" data-cad-discard class="px-3 py-1.5 rounded bg-rose-800 hover:bg-rose-700 border border-rose-600 text-xs font-semibold">Discard changes</button>
        </div>
        <div class="flex items-center gap-3 px-4 py-2 border-t border-slate-700">
          <span class="cad-info flex-1 text-[12px] text-slate-300 num" role="status" aria-live="polite"></span>
          <button type="button" data-cad-cancel class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-xs">Cancel</button>
          <button type="button" data-cad-ok class="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 border border-sky-600 text-xs font-semibold">OK — use this section</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    host = overlay.querySelector('.cad-host');
    info = overlay.querySelector('.cad-info');
    confirmBar = overlay.querySelector('.cad-confirm');
    showConfirm(false);
    overlay.querySelector('[data-cad-cancel]').addEventListener('click', () => requestClose());
    overlay.querySelector('[data-cad-ok]').addEventListener('click', () => apply());
    overlay.querySelector('[data-cad-keep]').addEventListener('click', () => {
      showConfirm(false);
      editor?.focus();
    });
    overlay.querySelector('[data-cad-discard]').addEventListener('click', () => close());
    // Klikk utenfor panelet (på den mørke bakgrunnen) = Avbryt
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) requestClose();
    });
    overlay.addEventListener('keydown', onKeyDown);
    // Klikk på noe i overlegget som ikke kan ha fokus (infolinja, bakgrunnen i
    // panelet) gir fokus til <body>. Da hentes fokus tilbake til editoren.
    overlay.addEventListener('pointerup', (e) => {
      if (!editor || e.target.closest('button, input, select, textarea, a, [data-cad2d-editor]')) return;
      editor.focus();
    });
    // Og skulle et tastetrykk likevel komme fra utenfor overlegget mens det er
    // åpent (fokus på <body>), fanges det her før siden bak ser det.
    document.addEventListener('keydown', (e) => {
      if (!overlay || overlay.hidden || overlay.contains(e.target)) return;
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        editor?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (editor && !isTypingTarget(e.target)) editor.handleKey(e);
    }, true);
  }

  function onKeyDown(e) {
    // Ingenting slipper ut til siden bak mens overlegget er åpent
    e.stopPropagation();
    if (overlay.hidden) return;
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement !== edge && items.includes(document.activeElement)) return;
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      return;
    }
    // Tastene fra selve editoren er alt behandlet der (og stoppet)
    if (editor && editor.root.contains(e.target)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (confirmBar && !confirmBar.hidden) {
        showConfirm(false);
        editor?.focus();
      } else {
        requestClose();
      }
      return;
    }
    if (isTypingTarget(e.target)) return;
    // Enter/Space på en knapp er knappens
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.tagName === 'BUTTON') return;
    if (editor) editor.handleKey(e);
  }

  function showConfirm(on) {
    if (!confirmBar) return;
    confirmBar.hidden = !on;
    confirmBar.style.display = on ? '' : 'none';
    if (on) confirmBar.querySelector('[data-cad-keep]').focus();
  }

  function showInfo() {
    if (!editor || !info) return;
    const r = editor.getSection();
    if (!r.ok) {
      info.textContent = r.error || '';
      info.className = 'cad-info flex-1 text-[12px] text-amber-300 num';
      return;
    }
    const p = r.props;
    info.className = 'cad-info flex-1 text-[12px] text-slate-300 num';
    info.textContent = `A = ${fmt(p.A)} mm² · I_y = ${sci(p.Iy)} mm⁴ · ${r.section.holes.length} hole${r.section.holes.length === 1 ? '' : 's'}`
      + (r.warnings && r.warnings.length ? ` · ${r.warnings.join(' ')}` : '');
  }

  async function loadModules() {
    if (loader) return loader();
    return Promise.all([import(EDITOR_URL), import(PROJECT_URL), import(DOCUMENT_URL)]);
  }

  /**
   * Åpner editoren med tegningen (`cad`), eller — finnes ingen — med polygonet
   * som former (et snitt fra fil, standardsnittet eller bjelkens rektangel).
   *
   * @param {{cad?: object|null, polygon?: {outer, holes}|null, returnFocus?: HTMLElement}} src
   * @returns {Promise<boolean>} false hvis editoren ikke kunne lastes
   */
  async function open({ cad = null, polygon = null, returnFocus: back = null } = {}) {
    if (opening) return opening;
    opening = (async () => {
      let mods;
      try {
        mods = await loadModules();
      } catch (err) {
        console.warn('[csc] geometrieditoren kunne ikke lastes:', err);
        onError('The geometry editor could not be loaded (no connection to the 3D library?). Load a section file or paste JSON instead; the calculation works as before.');
        return false;
      }
      const [{ mountCadEditor }, { documentFromSection }, { CadDocument }] = mods;
      if (!overlay) build();
      returnFocus = back || document.activeElement;
      showConfirm(false);
      setShown(true);
      let doc = null;
      if (cad) {
        doc = new CadDocument();
        try {
          doc.fromJSON(cad);
          doc.undoStack.length = 0;
        } catch (err) {
          console.warn('[csc] lagret tegning kunne ikke leses; bruker polygonet:', err);
          doc = null;
        }
      }
      if (!doc) doc = documentFromSection(polygon ? { ...polygon, units: 'mm' } : null);
      try {
        editor = mountCadEditor(host, { document: doc, lang: 'en', keyboard: 'focus' });
      } catch (err) {
        console.warn('[csc] geometrieditoren kunne ikke startes:', err);
        setShown(false);
        onError('The geometry editor could not be started. Load a section file or paste JSON instead; the calculation works as before.');
        return false;
      }
      editor.on('change', () => showInfo());
      showInfo();
      editor.zoomToFit();
      editor.focus();
      return true;
    })();
    try {
      return await opening;
    } finally {
      opening = null;
    }
  }

  /** Avbryt, Esc og klikk utenfor: bekreft først hvis tegningen er endret. */
  function requestClose() {
    if (editor && editor.isDirty()) {
      showConfirm(true);
      return;
    }
    close();
  }

  function close() {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    if (overlay) {
      showConfirm(false);
      setShown(false);
    }
    const target = returnFocus && returnFocus.isConnected && returnFocus !== document.body ? returnFocus : null;
    returnFocus = null;
    if (target && target.focus) target.focus({ preventScroll: true });
  }

  function apply() {
    if (!editor) return;
    const r = editor.getSection();
    if (!r.ok) {
      // Avvist: si hvorfor, og la brukeren rette det i editoren med en gang
      showInfo();
      editor.focus();
      return;
    }
    const dirty = editor.isDirty();
    const cad = editor.getDocument().toObject();
    close();
    onApply(r.section, cad, { dirty });
  }

  return {
    open,
    close,
    apply,
    requestClose,
    isOpen: () => !!overlay && !overlay.hidden,
    /** Editoren som er åpen (til testing i konsollet), ellers null. */
    editor: () => editor,
  };
}
