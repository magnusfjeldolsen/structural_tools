/**
 * keymap.js — ETT tastaturkart for cad2d-editoren (#93).
 *
 * Tastene er de geometry_workspace alltid har hatt (flyttet fra
 * geometry_workspace/js/main.js), slik at alle editorer i alle moduler
 * oppfører seg likt:
 *
 *   V velg · M flytt · C kopi · R roter · B rektangel · S skall · P polygon
 *   O sirkel · N nullpunkt · G skjøt · X del med linje · L linje
 *   H hull-modus · F zoom alt · F8 orto · Alt+1…6 snap · Alt+9 alle snap
 *   Alt+0 orto · Del/Backspace slett · Ctrl+Z angre · Ctrl+Y/Ctrl+Shift+Z gjør om
 *   Ctrl+D dupliser · Ctrl+A marker alle former · Enter avslutt polygon/linje
 *   Esc: forlat feltet → avbryt kommandoen → tøm utvalget (én kaskade)
 *
 * Speiling har bevisst INGEN tast. Et verktøy editoren ikke har (f.eks. `G`
 * uten skjøteutvidelsen) ignoreres. Tallinntastingen får tasten FØR
 * hurtigtastene, så sifre, `-`, `.`, `,` og `d` aldri bytter verktøy mens et
 * verktøy venter på et punkt.
 *
 * Ingen DOM: `createKeyHandler` gir en funksjon `(KeyboardEvent) => boolean`
 * (true = tasten ble brukt). Hvem som lytter, og på hva, bestemmer editoren.
 */

import { SNAP_TYPES, SNAP_ALL, ORTHO } from './snapping.js';
import { text } from '../core/text.js';

/** Bokstav → verktøy. */
export const TOOL_KEYS = Object.freeze({
  v: 'select',
  m: 'move',
  c: 'copy',
  r: 'rotate',
  b: 'rect',
  s: 'shell',
  p: 'polygon',
  o: 'circle',
  n: 'reference',
  g: 'joint',
  x: 'splitline',
  l: 'line',
});

/** Er hendelsen fra et felt man skriver i? */
export function isTyping(target) {
  const tag = ((target && target.tagName) || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(target && target.isContentEditable);
}

/**
 * Alt+siffer: snap-typene, Alt+9 alle, Alt+0 orto. Alt uten Ctrl, så AltGr
 * (= Ctrl+Alt) på norsk tastatur ikke fanges opp.
 *
 * @returns {boolean} true hvis tasten ble brukt
 */
export function handleSnapShortcut(e, { toggleSnap, toggleAllSnaps, toggleOrtho }) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.code === ORTHO.code) {
    toggleOrtho();
    return true;
  }
  if (e.code === SNAP_ALL.code) {
    toggleAllSnaps();
    return true;
  }
  const t = SNAP_TYPES.find((s) => s.code === e.code);
  if (!t) return false;
  toggleSnap(t.key);
  return true;
}

/**
 * Lager tastaturhåndtereren.
 *
 * @param {object} ctx
 * @param {object} ctx.doc         CadDocument
 * @param {object} ctx.tools       ToolController
 * @param {object} ctx.viewport    Viewport (zoomToFit)
 * @param {object} [ctx.numeric]   NumericInput (beginIfTypingKey)
 * @param {object} [ctx.hooks]     verten kan overstyre:
 *   snapShortcut(e) → boolean, onEscape(e, typing) → boolean (true = stopp),
 *   locked() → boolean, toggleOrtho(), deleteSelected(), duplicateSelected(),
 *   status(msg)
 * @returns {(e: KeyboardEvent) => boolean}
 */
export function createKeyHandler(ctx) {
  const { doc, tools, viewport } = ctx;
  const hooks = ctx.hooks || {};
  const T = text(ctx.lang);
  const status = hooks.status || (() => {});
  const locked = hooks.locked || (() => false);

  const toggleOrtho = hooks.toggleOrtho || (() => {
    const on = !doc.state.ortho;
    doc.setOrtho(on);
    status(T.ortho(on, ORTHO.hint));
  });
  const snapShortcut = hooks.snapShortcut || ((e) => handleSnapShortcut(e, {
    toggleOrtho,
    toggleSnap: (key) => doc.setSnaps({ [key]: !doc.state.snaps[key] }),
    toggleAllSnaps: () => {
      const anyOn = SNAP_TYPES.some((t) => doc.state.snaps[t.key]);
      const patch = {};
      for (const t of SNAP_TYPES) patch[t.key] = !anyOn;
      doc.setSnaps(patch);
    },
  }));
  const deleteSelected = hooks.deleteSelected || (() => {
    const sel = doc.state.selection;
    if (!sel.length) return status(T.nothingSelected);
    doc.removeEntities(sel);
    status(T.deleted(sel.length));
  });
  const duplicateSelected = hooks.duplicateSelected || (() => {
    const sel = doc.state.selection;
    if (!sel.length) return status(T.nothingSelected);
    const step = doc.state.grid.step || 0;
    doc.duplicateEntities(doc.withFollowing(sel), step * 2, 0);
  });

  function onKeyDown(e) {
    const typing = isTyping(e.target);

    // Alt+siffer styrer snap. Dette skal virke også midt i et tallfelt, siden
    // man ofte vil endre snap uten å måtte klikke seg ut av det man skriver.
    if (snapShortcut(e)) {
      e.preventDefault();
      return true;
    }

    // Escape er en KASKADE, og ett trykk skal alltid gi et rent utgangspunkt:
    // forlat feltet man skriver i, avbryt en kommando som er i gang, og ellers
    // tøm utvalget. Steg 1 og 2 skjer i samme trykk.
    if (e.key === 'Escape') {
      if (hooks.onEscape && hooks.onEscape(e, typing)) return true;
      if (typing && e.target.blur) e.target.blur();
      // Hva som var i gang må avgjøres FØR tools.keydown rydder det bort
      const busy = !!(tools.draft || tools.drag);
      tools.keydown(e);
      if (!busy && doc.state.selection.length) {
        doc.select([]);
        status(T.selectionCleared);
      }
      return true;
    }
    if (typing) return false;

    // Låst lerret: bare zoom og angre/gjør om virker.
    if (locked()) {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) doc.redo();
        else doc.undo();
        return true;
      }
      if (!e.ctrlKey && !e.metaKey && k === 'f') {
        viewport.zoomToFit(doc.bounds());
        return true;
      }
      return false;
    }

    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
        return true;
      }
      if (k === 'y') {
        e.preventDefault();
        doc.redo();
        return true;
      }
      if (k === 'd') {
        e.preventDefault();
        duplicateSelected();
        return true;
      }
      if (k === 'a') {
        e.preventDefault();
        doc.select(doc.state.shapes.map((s) => s.id));
        return true;
      }
      return false;
    }

    // Tallinntastingen får tasten FØR hurtigtastene.
    if (ctx.numeric && ctx.numeric.beginIfTypingKey(e)) {
      e.preventDefault();
      return true;
    }

    if (tools.keydown(e)) return true;

    if (e.key === 'F8') {
      e.preventDefault();
      toggleOrtho();
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
      return true;
    }
    if (e.key.toLowerCase() === 'f') {
      viewport.zoomToFit(doc.bounds());
      return true;
    }
    // H slår hull-modus av og på — en bryter, ikke et verktøy
    if (e.key.toLowerCase() === 'h' && !e.altKey) {
      tools.setVoidMode(!tools.voidMode);
      return true;
    }
    const tool = TOOL_KEYS[e.key.toLowerCase()];
    if (tool && tools.hasTool(tool)) {
      tools.setTool(tool);
      return true;
    }
    return false;
  }
  /** Bare Alt+siffer-delen, til tallfeltet (snap skal virke midt i en inntasting). */
  onKeyDown.snapShortcut = snapShortcut;
  return onKeyDown;
}
