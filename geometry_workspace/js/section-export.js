/**
 * section-export.js — «Eksporter tverrsnitt» (#85).
 *
 * Gjør formene i workspacet om til ETT ytre polygon med hull, på formatet
 * concrete_section_calculator leser (#83):
 *
 *   { "format": "structural-tools-section", "version": 1, "units": "mm",
 *     "outer": [[y, z], ...], "holes": [[[y, z], ...], ...] }
 *
 * Formatet er kontrakten mellom modulene — endres det, må csc-siden endres
 * samtidig.
 *
 *  - Åpne ringer (siste punkt ≠ første). Ytre ring mot klokka, hull med klokka.
 *  - Alltid mm, uansett arbeidsenhet.
 *  - Akser: workspacet har x mot høyre og y OPP. Formatet har y vannrett og
 *    z opp. Altså y = x og z = y — nye navn, ingen speiling.
 *
 * Geometrien er rent geometrisk: union av de faste formene minus hullene.
 * Vektfaktorer og dobbelttelling av overlapp ('sum'-modus) finnes ikke i
 * formatet; når de ville gitt et annet areal enn det eksporterte, sies det.
 *
 * Ingen DOM.
 */

import {
  pointsToMulti,
  unionMulti,
  differenceMulti,
  multiProps,
  polygonProps,
  openRing,
  signedArea,
  derive,
  EPS,
} from './geometry.js';
import { unitInfo } from './units.js';

export const SECTION_FORMAT = 'structural-tools-section';
export const SECTION_VERSION = 1;

/** Runder bort flyttallsstøy fra Clipper og enhetsomregning (1 nm i mm). */
const round = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

function orient(ring, wantPositive) {
  const r = openRing(ring);
  const positive = signedArea(r) > 0;
  return positive === wantPositive ? r : r.slice().reverse();
}

/**
 * @param {Array} shapes   store.state.shapes
 * @param {{unit?: string, selection?: string[]}} opts
 *   selection — er noen faste former markert, eksporteres bare de. Hullene
 *   tas alltid alle med (de som ikke treffer, gjør ingenting), så det holder
 *   å markere selve profilen.
 * @returns {{ok: true, section: object, warnings: string[]} | {ok: false, error: string}}
 */
export function exportSection(shapes, { unit = 'mm', selection = [] } = {}) {
  const usable = (shapes || []).filter((s) => s && s.include !== false && s.points && s.points.length >= 3);
  const allSolids = usable.filter((s) => s.role !== 'void');
  const voids = usable.filter((s) => s.role === 'void');
  const sel = new Set(selection || []);
  const picked = allSolids.filter((s) => sel.has(s.id));
  const solids = picked.length ? picked : allSolids;

  if (!solids.length) return { ok: false, error: 'Ingen faste former å eksportere.' };

  const warnings = [];
  const solidMulti = unionMulti(solids.map((s) => pointsToMulti(s.points)));
  const ownSum = solids.reduce((a, s) => a + Math.abs(signedArea(s.points)), 0);
  const unionArea = Math.abs(multiProps(solidMulti).A);
  if (ownSum - unionArea > Math.max(unionArea, 1) * 1e-9) {
    warnings.push('Formene overlapper. I eksporten telles overlappet én gang.');
  }
  if (solids.some((s) => Number.isFinite(s.factor) && Math.abs(s.factor - 1) > EPS)) {
    warnings.push('Vektfaktorer ≠ 1 finnes ikke i formatet og er ikke tatt med.');
  }

  const voidMulti = unionMulti(voids.map((s) => pointsToMulti(s.points)));
  const net = voidMulti.length ? differenceMulti(solidMulti, voidMulti) : solidMulti;
  const pieces = net.filter((poly) => Math.abs(polygonProps(poly).A) > EPS);

  if (!pieces.length) return { ok: false, error: 'Ingen geometri igjen når hullene er trukket fra.' };
  if (pieces.length > 1) {
    return {
      ok: false,
      error:
        `Tverrsnittet består av ${pieces.length} usammenhengende deler. Formatet tar ett sammenhengende ` +
        'tverrsnitt — marker delene som hører sammen, eller la dem berøre hverandre.',
    };
  }

  const k = unitInfo(unit).toMillimetres;
  const toYZ = (ring) => ring.map(([x, y]) => [round(x * k), round(y * k)]);
  const [outer, ...holes] = pieces[0];
  const section = {
    format: SECTION_FORMAT,
    version: SECTION_VERSION,
    units: 'mm',
    outer: toYZ(orient(outer, true)),
    holes: holes.map((h) => toYZ(orient(h, false))),
  };
  return { ok: true, section, warnings };
}

/**
 * A, tyngdepunkt og annet arealmoment for et eksportert tverrsnitt, i formatets
 * egne akser og enhet. I_y er om den vannrette tyngdepunktsaksen (∫(z − z_c)² dA),
 * I_z om den loddrette. Til meldingen etter eksport og til testene.
 */
export function sectionProps(section) {
  const d = derive(polygonProps([section.outer, ...(section.holes || [])]));
  // derive() regner i (x, y); her er (x, y) = (y, z)
  return { A: d.A, yc: d.cx, zc: d.cy, Iy: d.Ix, Iz: d.Iy, Iyz: d.Ixy };
}

export function sectionToJSON(section) {
  return JSON.stringify(section, null, 2);
}
