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
 * Geometrien er rent geometrisk: union av de faste formene minus ALLE hull,
 * uansett rekkefølge i formlista — samme regel som analyze().
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
} from '../geometry/polygon.js';
import { unitInfo } from '../core/units.js';
import { text } from '../core/text.js';

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
export function exportSection(shapes, { unit = 'mm', selection = [], lang = 'no', selectable = true } = {}) {
  const T = text(lang);
  const usable = (shapes || []).filter((s) => s && s.include !== false && s.points && s.points.length >= 3);
  const allSolids = usable.filter((s) => s.role !== 'void');
  const sel = new Set(selection || []);
  const picked = allSolids.filter((s) => sel.has(s.id));
  const solidSet = new Set(picked.length ? picked : allSolids);

  if (!solidSet.size) return { ok: false, error: T.secNoSolids };

  const warnings = [];
  const k = unitInfo(unit).toMillimetres;

  // Langt fra origo kansellerer arealintegralene (Revit: 6,6e9 mm). Da flyttes
  // alt til et lokalt origo FØR klippingen, og mottakeren får lokale tall —
  // formatet har vilkårlig origo (#86, B5).
  const chosen = usable.filter((s) => s.role === 'void' || solidSet.has(s));
  const offset = localOffset(chosen.filter((s) => s.role !== 'void').flatMap((s) => s.points));
  const shift = offset ? (pts) => pts.map(([x, y]) => [x - offset[0], y - offset[1]]) : (pts) => pts;
  const list = chosen.map((s) => ({ ...s, points: shift(s.points) }));
  if (offset) {
    warnings.push(
      T.secMoved(fmt(-offset[0] * k), fmt(-offset[1] * k))
    );
  }

  const solids = list.filter((s) => s.role !== 'void');
  const solidMulti = unionMulti(solids.map((s) => pointsToMulti(s.points)));
  const ownSum = solids.reduce((a, s) => a + Math.abs(signedArea(s.points)), 0);
  const unionArea = Math.abs(multiProps(solidMulti).A);
  if (ownSum - unionArea > Math.max(unionArea, 1) * 1e-9) {
    warnings.push(T.secOverlap);
  }
  if (solids.some((s) => Number.isFinite(s.factor) && Math.abs(s.factor - 1) > EPS)) {
    warnings.push(T.secFactors);
  }

  // Samme regel som «Areal, fysisk»: hvert hull skjærer alt fast areal det
  // overlapper, uansett rekkefølge i lista (#86).
  const voids = list.filter((s) => s.role === 'void');
  const voidMulti = unionMulti(voids.map((s) => pointsToMulti(s.points)));
  const net = voidMulti.length ? differenceMulti(solidMulti, voidMulti) : solidMulti;
  const pieces = net.filter((poly) => Math.abs(polygonProps(poly).A) > EPS);

  // Øy i hull støttes ikke: en fast form helt inne i et hull blir borte. Det
  // skal sies, ikke skje stille.
  if (voidMulti.length) {
    const lost = solids.filter((s) => {
      const own = pointsToMulti(s.points);
      const left = Math.abs(multiProps(differenceMulti(own, voidMulti)).A);
      return left <= Math.abs(multiProps(own).A) * 1e-9;
    });
    if (lost.length) {
      warnings.push(
        T.secIslands(lost.length)
      );
    }
  }

  if (!pieces.length) return { ok: false, error: T.secEmpty };
  if (pieces.length > 1) {
    return {
      ok: false,
      error:
        selectable ? T.secPieces(pieces.length) : T.secPiecesNoSelection(pieces.length),
    };
  }

  const toYZ = (ring) => ring.map(([x, y]) => [round(x * k), round(y * k)]);
  const [outer, ...holes] = pieces[0];
  const section = {
    format: SECTION_FORMAT,
    version: SECTION_VERSION,
    units: 'mm',
    outer: dedupeConsecutive(toYZ(orient(outer, true))),
    holes: holes.map((h) => dedupeConsecutive(toYZ(orient(h, false)))),
  };
  const invalid = validateSection(section, lang);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, section, warnings };
}

const fmt = (v) => String(Math.round(v * 1e6) / 1e6);

/** Forskyvningen til lokalt origo, eller null når geometrien ligger nær nok. */
function localOffset(points) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const size = Math.max(Math.hypot(maxX - minX, maxY - minY), 1e-12);
  const far = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
  if (far <= 1e3 * size) return null;
  const step = 10 ** Math.ceil(Math.log10(size));
  return [Math.floor(minX / step) * step, Math.floor(minY / step) * step];
}

function dedupeConsecutive(ring) {
  const out = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

/**
 * Det mottakeren får skal være et gyldig polygon (#86, F1): minst tre punkt per
 * ring, ingen ring som berører seg selv (samme punkt to ganger), og ingen hull
 * uten areal. Klipping av nesten-sammenfallende kanter kan gi begge deler.
 * Returnerer en melding, eller null når alt er i orden.
 */
export function validateSection(section, lang = 'no') {
  const T = text(lang);
  const Aout = Math.abs(signedArea(section.outer));
  const rings = [[T.secOuterName, section.outer], ...section.holes.map((h, i) => [T.secHoleName(i + 1), h])];
  for (const [name, ring] of rings) {
    if (ring.length < 3) return T.secFewPoints(name);
    const seen = new Set();
    for (const p of ring) {
      const key = `${p[0]},${p[1]}`;
      if (seen.has(key)) {
        return T.secTouches(name, p[0], p[1]);
      }
      seen.add(key);
    }
  }
  for (const [name, ring] of rings.slice(1)) {
    if (Math.abs(signedArea(ring)) <= Aout * 1e-9) {
      return T.secZeroHole(name);
    }
  }
  return null;
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
