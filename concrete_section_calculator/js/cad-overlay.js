/**
 * cad-overlay.js — cad2d-editoren i et overlegg over siden (#93).
 *
 * Klikk på tverrsnittsfiguren (eller «Edit geometry…») for et fritt tverrsnitt
 * åpner editoren. OK gir polygonet med hull til `onApply` — samme vei som en
 * lastet fil (#83) — og tegningen (`cad2d.document`), som lagres i tilstanden
 * så formene kan redigeres igjen. Avbryt endrer ingenting.
 *
 * Editoren (og three.js) lastes først når overlegget åpnes første gang, så
 * siden starter like raskt som før. Overlegget eier ingen tall: A og I som
 * vises her er editorens forhåndsvisning; beregningen bruker polygonet.
 *
 * Tastatur: editoren lytter med `keyboard: 'focus'` og stopper tastene sine,
 * så csc sine snarveier (Ctrl+Space, Ctrl+Enter, Alt-merker …) ikke utløses
 * inne i den. `isOpen()` lar csc sin egen lytter holde seg unna mens
 * overlegget er åpent (også når fokus står på OK/Avbryt).
 */

const EDITOR_URL = '../../cad2d/js/editor/editor.js';
const PROJECT_URL = '../../cad2d/js/io/project.js';
const DOCUMENT_URL = '../../cad2d/js/core/document.js';

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const sci = (v) => (Number.isFinite(v) ? v.toExponential(3).replace('e+', 'e') : '–');

/**
 * @param {{onApply: (section: {outer, holes}, cad: object) => void}} opts
 */
export function createCadOverlay({ onApply }) {
  let overlay = null;
  let host = null;
  let info = null;
  let editor = null;
  let opening = null;
  let lastFocus = null;

  /** `hidden` alene holder ikke: Tailwinds `flex` vinner over [hidden]. */
  function setShown(on) {
    overlay.hidden = !on;
    overlay.style.display = on ? '' : 'none';
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
      <div class="w-full h-full max-w-[1600px] flex flex-col rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-2xl">
        <div class="flex items-center gap-3 px-4 py-2 border-b border-slate-700">
          <span class="text-sm font-semibold text-slate-100">Edit geometry</span>
          <span class="text-[11px] text-slate-500">Draw shapes and holes, or import DXF. Same tools and keys as Geometry Workspace. Holes cut every solid they overlap.</span>
        </div>
        <div class="cad-host flex-1 min-h-0"></div>
        <div class="flex items-center gap-3 px-4 py-2 border-t border-slate-700">
          <span class="cad-info flex-1 text-[12px] text-slate-300 num" role="status" aria-live="polite"></span>
          <button type="button" data-cad-cancel class="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-xs">Cancel</button>
          <button type="button" data-cad-ok class="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 border border-sky-600 text-xs font-semibold">OK — use this section</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    host = overlay.querySelector('.cad-host');
    info = overlay.querySelector('.cad-info');
    overlay.querySelector('[data-cad-cancel]').addEventListener('click', () => close());
    overlay.querySelector('[data-cad-ok]').addEventListener('click', () => apply());
    // Esc på knappene (utenfor selve editoren) = Avbryt. Inne i editoren er Esc
    // editorens egen kaskade og når aldri hit (den stoppes der).
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      e.stopPropagation();
    });
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

  /**
   * Åpner editoren med tegningen (`cad`), eller — finnes ingen — med polygonet
   * som former (et snitt fra fil eller standardsnittet).
   *
   * @param {{cad?: object|null, polygon?: {outer, holes}|null}} src
   */
  async function open({ cad = null, polygon = null } = {}) {
    if (opening) return opening;
    opening = (async () => {
      if (!overlay) build();
      const [{ mountCadEditor }, { documentFromSection }, { CadDocument }] = await Promise.all([
        import(EDITOR_URL),
        import(PROJECT_URL),
        import(DOCUMENT_URL),
      ]);
      lastFocus = document.activeElement;
      setShown(true);
      let doc;
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
      editor = mountCadEditor(host, { document: doc, lang: 'en', keyboard: 'focus' });
      editor.on('change', () => showInfo());
      showInfo();
      editor.zoomToFit();
      editor.focus();
    })();
    try {
      await opening;
    } finally {
      opening = null;
    }
  }

  function close() {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    if (overlay) setShown(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function apply() {
    if (!editor) return;
    const r = editor.getSection();
    if (!r.ok) {
      showInfo();
      return;
    }
    const cad = editor.getDocument().toObject();
    close();
    onApply(r.section, cad);
  }

  return {
    open,
    close,
    apply,
    isOpen: () => !!overlay && !overlay.hidden,
    /** Editoren som er åpen (til testing i konsollet), ellers null. */
    editor: () => editor,
  };
}
