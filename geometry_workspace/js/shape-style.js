/**
 * shape-style.js — hvordan en form ser ut: fylling og kontur.
 *
 * Ingen DOM. Lerretet (`viewport.js`), geometrilista (`ui.js`) og
 * rapportfiguren (`report-figure.js`) slår opp her, slik at de tre aldri kan
 * vise ulike ting for samme form.
 *
 * To uavhengige kanaler, så begge kan leses samtidig:
 *  - FYLLINGEN sier om delen er eksisterende eller ny (eller formens egen
 *    farge, når brukeren har slått av «farg etter tilstand»).
 *  - KONTUREN sier hvilken materialfamilie delen er av.
 */

import { materialByName } from './materials.js';

/** Fylling etter tilstand. Ny er varm, eksisterende dempet. */
export const STAGE_FILL = Object.freeze({
  existing: '#93c5fd',
  new: '#fb923c',
});

/**
 * Kontur per materialfamilie. `weight` ganges med den vanlige strekbredden;
 * `dash`/`gap` er i skjermpiksler (lerretet) — rapporten skalerer selv.
 */
export const CONTOUR = Object.freeze({
  Stål: Object.freeze({ kind: 'solid', weight: 1, dash: 0, gap: 0 }),
  Betong: Object.freeze({ kind: 'thick', weight: 2.2, dash: 0, gap: 0 }),
  Tre: Object.freeze({ kind: 'dashed', weight: 1, dash: 10, gap: 6 }),
  Annet: Object.freeze({ kind: 'dotted', weight: 1, dash: 2.5, gap: 4 }),
});

/**
 * Materialfamilien til en form. Et navn som ikke er et preset (fritt
 * inntastet E) er «Annet» — verktøyet gjetter ikke på hva det er.
 *
 * @param {{material?: {name?: string}}} shape
 * @returns {'Stål'|'Betong'|'Tre'|'Annet'}
 */
export function materialFamily(shape) {
  const preset = shape && shape.material ? materialByName(shape.material.name) : null;
  return preset && CONTOUR[preset.group] ? preset.group : 'Annet';
}

/**
 * Fyllfargen til en form.
 *
 * @param {{stage?: string, color?: string}} shape
 * @param {boolean} [byStage=true] false ⟹ formens egen farge
 * @returns {string} hex
 */
export function shapeFill(shape, byStage = true) {
  if (!byStage) return (shape && shape.color) || STAGE_FILL.existing;
  return shape && shape.stage === 'new' ? STAGE_FILL.new : STAGE_FILL.existing;
}

/**
 * Konturen til en form, etter materialfamilien.
 *
 * @param {{material?: {name?: string}}} shape
 * @returns {{kind: string, weight: number, dash: number, gap: number}}
 */
export function contourStyle(shape) {
  return CONTOUR[materialFamily(shape)];
}
