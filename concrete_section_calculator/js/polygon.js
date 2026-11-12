/**
 * polygon.js — fritt tverrsnitt: ett ytre polygon med hull (sak #83).
 *
 * UTVEKSLINGSFORMATET (delt med geometry_workspace, sak #85 — dette er kontrakten):
 *
 *   { "format": "structural-tools-section", "version": 1, "units": "mm",
 *     "outer": [[y, z], ...], "holes": [[[y, z], ...], ...] }
 *
 * y vannrett, z opp, ÅPNE ringer (første punkt gjentas ikke), vilkårlig origo. En lukket
 * ring godtas likevel — det siste punktet fjernes — fordi det er det vanligste utfallet
 * av en DXF-eksport, og en avvisning ville vært pedanteri uten gevinst.
 *
 * HVA DENNE FILA EIER
 * - lesingen av formatet (`parseSectionDocument`), som ALDRI kaster;
 * - normaliseringen (`normalizePolygon`): omskrevet rektangel sentrert i origo. Det er
 *   kontrakten med `engine.py` (se `csc_polygon.py`), og den gjør at hele modulens
 *   `h/2`-bokføring — `dc` fra kanten, `d`, `x`, tegningen — gjelder uendret;
 * - tverrsnittsstørrelsene (`polygonProps`), med SAMME lukkede formler som
 *   `csc_polygon.py`. `tests/fixtures/section-hd265-7holes.json` holder dem i takt;
 * - gyldighetskontrollen (`polygonIssues`), som speiler motorens. Motoren kontrollerer
 *   UANSETT selv: denne er for at skjemaet skal kunne si fra FØR «Beregn».
 * - korden (`chordIntervals`): hvor betongen er langs en vannrett linje. Det er den
 *   armeringslagene fordeles over, slik at et underkantlag i en T havner i steget.
 *
 * DOM-fri og ren.
 */

export const SECTION_FORMAT = 'structural-tools-section';
export const SECTION_FORMAT_VERSION = 1;

/** Øvre grense på antall hjørner, så en feilaktig fil ikke fryser siden. */
export const MAX_VERTICES = 20000;

/*
 * Samme tre tall som `csc_polygon.py` (DUP_TOL, MIN_DIM, MAX_COORD). Se der for hvorfor.
 * `polygon-validity-cases.json` kjøres gjennom begge sidene og holder dem enige.
 */
export const DUP_TOL = 1e-6;
export const MIN_DIM = 1.0;
export const MAX_COORD = 1e6;

/**
 * Fjerner PÅFØLGENDE duplikater (innen `DUP_TOL`) og et avsluttende punkt lik det
 * første. Muterer og returnerer ringen. Vanlig i DXF; motoren gjør det samme.
 */
function dedupeRing(ring) {
  for (let i = ring.length - 1; i > 0; i--) {
    if (Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]) <= DUP_TOL) ring.splice(i, 1);
  }
  if (ring.length > 1) {
    const a = ring[0]; const b = ring[ring.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= DUP_TOL) ring.pop();
  }
  return ring;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Én ring fra rå JSON. Returnerer `{ring}` eller `{error}`.
 * @param {*} raw
 * @param {string} label «outer boundary» / «hole 3»
 */
function readRing(raw, label) {
  if (!Array.isArray(raw)) return { error: `The ${label} is not a list of [y, z] points.` };
  const ring = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!Array.isArray(p) || p.length !== 2) {
      return { error: `Point ${i + 1} of the ${label} is not a [y, z] pair.` };
    }
    const y = typeof p[0] === 'string' && p[0].trim() !== '' ? Number(p[0]) : p[0];
    const z = typeof p[1] === 'string' && p[1].trim() !== '' ? Number(p[1]) : p[1];
    if (!isFiniteNumber(y) || !isFiniteNumber(z)) {
      return { error: `Point ${i + 1} of the ${label} is not a finite number pair.` };
    }
    if (Math.abs(y) > MAX_COORD || Math.abs(z) > MAX_COORD) {
      return { error: `Point ${i + 1} of the ${label} lies more than ${MAX_COORD} mm from the origin — check the units (millimetres).` };
    }
    ring.push([y, z]);
  }
  dedupeRing(ring);
  const distinct = new Set(ring.map((p) => `${p[0]},${p[1]}`)).size;
  if (distinct < 3) {
    return { error: `The ${label} needs at least three distinct points; it has ${distinct}.` };
  }
  return { ring };
}

/**
 * Leser et dokument i utvekslingsformatet. Tar en streng (limt inn / fil) eller et
 * allerede parset objekt. Kaster ALDRI.
 *
 * Normaliserer IKKE og validerer ikke geometrien — det er `normalizePolygon` og
 * `polygonIssues` sine jobber, og de kjøres også på et polygon som kommer fra en lagret
 * tilstand, ikke bare fra en fil.
 *
 * @param {string|object} input
 * @returns {{ok: true, polygon: {outer: number[][], holes: number[][][]}, name: string|null}
 *          | {ok: false, error: string}}
 */
export function parseSectionDocument(input) {
  let doc = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `The text is not valid JSON (${e.message}).` };
    }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'The file does not contain a JSON object.' };
  }
  if (doc.format !== SECTION_FORMAT) {
    return {
      ok: false,
      error: `This is not a cross-section file: "format" must be "${SECTION_FORMAT}".`,
    };
  }
  if (Number(doc.version) !== SECTION_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported version ${JSON.stringify(doc.version)}; this calculator reads version ${SECTION_FORMAT_VERSION}.`,
    };
  }
  // Enheten er en del av kontrakten. En fil i meter ville gitt et snitt tusen ganger for
  // lite — og motoren ville regnet på det uten å klage.
  if (doc.units !== undefined && doc.units !== 'mm') {
    return { ok: false, error: `Unsupported units ${JSON.stringify(doc.units)}; only "mm" is supported.` };
  }
  const outer = readRing(doc.outer, 'outer boundary');
  if (outer.error) return { ok: false, error: outer.error };
  const rawHoles = doc.holes === undefined || doc.holes === null ? [] : doc.holes;
  if (!Array.isArray(rawHoles)) return { ok: false, error: '"holes" must be a list of rings.' };
  const holes = [];
  for (let i = 0; i < rawHoles.length; i++) {
    const h = readRing(rawHoles[i], `hole ${i + 1}`);
    if (h.error) return { ok: false, error: h.error };
    holes.push(h.ring);
  }
  const count = outer.ring.length + holes.reduce((n, h) => n + h.length, 0);
  if (count > MAX_VERTICES) {
    return { ok: false, error: `The section has ${count} corners; the limit is ${MAX_VERTICES}.` };
  }
  return {
    ok: true,
    polygon: { outer: outer.ring, holes },
    name: typeof doc.name === 'string' ? doc.name : null,
  };
}

/** Polygonet tilbake til utvekslingsformatet (for «Export»). */
export function toSectionDocument(polygon, name) {
  const doc = {
    format: SECTION_FORMAT,
    version: SECTION_FORMAT_VERSION,
    units: 'mm',
  };
  if (name) doc.name = name;
  doc.outer = polygon.outer.map((p) => [p[0], p[1]]);
  doc.holes = (polygon.holes || []).map((h) => h.map((p) => [p[0], p[1]]));
  return doc;
}

/** Omskrevet rektangel for det ytre polygonet. */
export function polygonBounds(polygon) {
  let yMin = Infinity; let yMax = -Infinity; let zMin = Infinity; let zMax = -Infinity;
  for (const [y, z] of polygon.outer) {
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  return { yMin, yMax, zMin, zMax, b: yMax - yMin, h: zMax - zMin };
}

/**
 * Flytter polygonet slik at det omskrevne rektangelet er sentrert i origo. Se
 * filhodet: det er kontrakten med motoren.
 *
 * Idempotent: et polygon som allerede er sentrert, kommer ut med NØYAKTIG de samme
 * tallene (forskyvningen er da eksakt 0, og `x − 0 === x`). Det er det som gjør at en
 * lagret og lastet tilstand runder tilbake uendret.
 */
export function normalizePolygon(polygon) {
  const { yMin, yMax, zMin, zMax } = polygonBounds(polygon);
  const cy = (yMin + yMax) / 2;
  const cz = (zMin + zMax) / 2;
  const shift = (ring) => ring.map(([y, z]) => [y - cy, z - cz]);
  return { outer: shift(polygon.outer), holes: (polygon.holes || []).map(shift) };
}

/** Signert areal og arealmomenter for én ring. Samme formler som `csc_polygon.ring_props`. */
function ringProps(ring) {
  let a = 0; let sz = 0; let sy = 0; let izz = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [y0, z0] = ring[i];
    const [y1, z1] = ring[(i + 1) % n];
    const c = y0 * z1 - y1 * z0;
    a += c;
    sz += (z0 + z1) * c;
    sy += (y0 + y1) * c;
    izz += (z0 * z0 + z0 * z1 + z1 * z1) * c;
  }
  const s = a >= 0 ? 1 : -1;
  return { a: (s * a) / 2, sz: (s * sz) / 6, sy: (s * sy) / 6, izz: (s * izz) / 12 };
}

export function ringPerimeter(ring) {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y0, z0] = ring[i];
    const [y1, z1] = ring[(i + 1) % ring.length];
    p += Math.hypot(y1 - y0, z1 - z0);
  }
  return p;
}

/**
 * Betongens brutto størrelser: A, tyngdepunkt (y_c, z_c), I_y om den vannrette
 * tyngdepunktsaksen, omskrevet rektangel og omkretser. Samme tall som motorens
 * `section_props` for polygonet.
 */
export function polygonProps(polygon) {
  const o = ringProps(polygon.outer);
  let { a, sz, sy, izz } = o;
  for (const hole of polygon.holes || []) {
    const h = ringProps(hole);
    a -= h.a;
    sz -= h.sz;
    sy -= h.sy;
    izz -= h.izz;
  }
  const z_c = sz / a;
  const y_c = sy / a;
  const bounds = polygonBounds(polygon);
  return {
    area: a,
    y_c,
    z_c,
    I_y: izz - a * z_c * z_c,
    ...bounds,
    perimeter_outer: ringPerimeter(polygon.outer),
    perimeter_holes: (polygon.holes || []).reduce((s, h) => s + ringPerimeter(h), 0),
  };
}

// ------------------------------------------------------------------ //
// Gyldighet
// ------------------------------------------------------------------ //

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, p) {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

/** Skjærer eller berører segmentene p1–p2 og p3–p4 hverandre (inkludert endepunkter)? */
function segmentsTouch(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/** Krysser ringen seg selv? Nabokanter deler et hjørne og teller ikke. */
function ringSelfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]; const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsTouch(a1, a2, ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

function ringsTouch(r1, r2) {
  for (let i = 0; i < r1.length; i++) {
    const a1 = r1[i]; const a2 = r1[(i + 1) % r1.length];
    for (let j = 0; j < r2.length; j++) {
      if (segmentsTouch(a1, a2, r2[j], r2[(j + 1) % r2.length])) return true;
    }
  }
  return false;
}

/** Punkt strengt inne i ringen (partallsregelen; randpunkter er udefinert — se kallerne). */
export function pointInRing(ring, y, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, zi] = ring[i];
    const [yj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && y < ((yj - yi) * (z - zi)) / (zj - zi) + yi) inside = !inside;
  }
  return inside;
}

/**
 * Det som er galt med polygonet, som en liste. Tom liste = gyldig. Samme kontroller og
 * samme rekkefølge som `csc_polygon.validated_polygon`, slik at skjemaet og motoren ikke
 * gir to ulike svar på det samme snittet.
 *
 * @returns {Array<{code: string, message: string}>}
 */
export function polygonIssues(polygon) {
  if (!polygon || !Array.isArray(polygon.outer) || polygon.outer.length < 3) {
    return [{ code: 'polygon_missing', message: 'No cross-section polygon is loaded.' }];
  }
  // CACHE PÅ RINGENES IDENTITET (review av #83): kontrollen er O(n²), og `validate()`
  // kjøres ved hver opptegning — 20 000 hjørner kostet 0,9 s per tastetrykk. Tilstanden
  // erstatter ringene i stedet for å mutere dem (`store.js`), så samme array-objekt
  // betyr samme polygon.
  const holesKey = polygon.holes || EMPTY;
  const hit = ISSUE_CACHE.get(polygon.outer);
  if (hit && hit.holes === holesKey) return hit.issues.map((x) => ({ ...x }));
  const issues = computePolygonIssues(polygon);
  ISSUE_CACHE.set(polygon.outer, { holes: holesKey, issues });
  return issues.map((x) => ({ ...x }));
}

const EMPTY = [];
const ISSUE_CACHE = new WeakMap();

/** Minste avstand mellom to ringer (kant til kant), O(n·m). */
function ringDistance(r1, r2) {
  let best = Infinity;
  for (const [a, b] of [[r1, r2], [r2, r1]]) {
    for (const p of a) {
      for (let j = 0; j < b.length; j++) {
        const d = distToSegment(p[0], p[1], b[j], b[(j + 1) % b.length]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function computePolygonIssues(polygon) {
  const out = [];
  // Påfølgende duplikater fjernes på KOPIER, som i motoren — en tilstand lagret før
  // dette kom inn skal ikke gi «ugyldig» her og et tall der.
  const copy = (ring) => dedupeRing(ring.map((p) => [Number(p[0]), Number(p[1])]));
  const outer = copy(polygon.outer);
  const holes = (polygon.holes || []).map(copy);
  const all = [outer, ...holes].flat();
  if (all.some(([y, z]) => !Number.isFinite(y) || !Number.isFinite(z)
    || Math.abs(y) > MAX_COORD || Math.abs(z) > MAX_COORD)) {
    return [{
      code: 'polygon_too_large',
      message: `A point lies more than ${MAX_COORD} mm from the origin, or is not a number — check the units.`,
    }];
  }
  // Størrelsen FØR selvkryssingen: et 1e-6 mm flatt polygon gir kanter så nær
  // kollineære at kryssingstesten blir flyttallsstøy, og «for lite» er det sanne svaret.
  const ob = polygonBounds({ outer });
  if (outer.length >= 3 && (ob.b < MIN_DIM || ob.h < MIN_DIM)) {
    return [{ code: 'polygon_too_small', message: `The cross-section is less than ${MIN_DIM} mm wide or high.` }];
  }
  if (outer.length < 3 || ringSelfIntersects(outer) || ringProps(outer).a <= 0) {
    out.push({
      code: 'polygon_outer_invalid',
      message: 'The outer boundary crosses itself or has no area.',
    });
    return out;
  }
  holes.forEach((hole, i) => {
    if (hole.length < 3 || ringSelfIntersects(hole) || ringProps(hole).a <= 0) {
      out.push({ code: 'polygon_hole_invalid', message: `Hole ${i + 1} crosses itself or has no area.` });
      return;
    }
    const inside = hole.every(([y, z]) => pointInRing(outer, y, z));
    if (!inside || ringsTouch(hole, outer)) {
      out.push({
        code: 'polygon_hole_outside',
        message: `Hole ${i + 1} is not strictly inside the outer boundary.`,
      });
      return;
    }
    const hb = polygonBounds({ outer: hole });
    if (hb.b < MIN_DIM || hb.h < MIN_DIM) {
      out.push({ code: 'polygon_too_small', message: `Hole ${i + 1} is less than ${MIN_DIM} mm wide or high.` });
      return;
    }
    const wall = ringDistance(hole, outer);
    if (wall < MIN_DIM) {
      out.push({
        code: 'polygon_wall_too_thin',
        message: `The wall between hole ${i + 1} and the outer edge is ${wall.toPrecision(3)} mm — thinner than ${MIN_DIM} mm.`,
      });
    }
  });
  if (out.length) return out;
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const overlap = ringsTouch(holes[i], holes[j])
        || pointInRing(holes[i], holes[j][0][0], holes[j][0][1])
        || pointInRing(holes[j], holes[i][0][0], holes[i][0][1]);
      if (overlap) {
        out.push({
          code: 'polygon_holes_overlap',
          message: `Holes ${i + 1} and ${j + 1} overlap or touch.`,
        });
        continue;
      }
      const wall = ringDistance(holes[i], holes[j]);
      if (wall < MIN_DIM) {
        out.push({
          code: 'polygon_wall_too_thin',
          message: `The wall between holes ${i + 1} and ${j + 1} is ${wall.toPrecision(3)} mm — thinner than ${MIN_DIM} mm.`,
        });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ //
// Kord og innsideprøve — armeringen
// ------------------------------------------------------------------ //

/**
 * Intervallene langs den vannrette linja `z` som ligger i BETONG (innenfor det ytre
 * polygonet og utenfor alle hull), sortert på y. Partallsregelen over alle ringene gir
 * nettopp dette, fordi hullene ligger inni det ytre.
 *
 * Halvåpen regel på hjørnene (`zi > z` mot `zj > z`), så en linje gjennom et hjørne
 * teller kanten én gang og ikke to.
 *
 * @returns {Array<[number, number]>}
 */
export function chordIntervals(polygon, z) {
  const ys = [];
  for (const ring of [polygon.outer, ...(polygon.holes || [])]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, zi] = ring[i];
      const [yj, zj] = ring[j];
      if ((zi > z) !== (zj > z)) ys.push(yi + ((z - zi) * (yj - yi)) / (zj - zi));
    }
  }
  ys.sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k + 1 < ys.length; k += 2) {
    if (ys[k + 1] > ys[k]) out.push([ys[k], ys[k + 1]]);
  }
  return out;
}

function distToSegment(y, z, a, b) {
  const dy = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dy * dy + dz * dz;
  let t = len2 > 0 ? ((y - a[0]) * dy + (z - a[1]) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(y - (a[0] + t * dy), z - (a[1] + t * dz));
}

/**
 * Ligger hele sirkelen (et jern) i betongen? Senteret må være innenfor det ytre og
 * utenfor alle hull, og avstanden til hver kant minst radien. Samme spørsmål som
 * motorens `bar_outside_section` for polygonet, med samme lille slingringsmonn.
 */
export function circleInConcrete(polygon, y, z, r) {
  const tol = 1e-6;
  if (!pointInRing(polygon.outer, y, z)) return false;
  for (const hole of polygon.holes || []) if (pointInRing(hole, y, z)) return false;
  for (const ring of [polygon.outer, ...(polygon.holes || [])]) {
    for (let i = 0; i < ring.length; i++) {
      if (distToSegment(y, z, ring[i], ring[(i + 1) % ring.length]) < r - tol) return false;
    }
  }
  return true;
}

/** Rektangelet `b × h` som polygon, sentrert. Standardsnittet for en fersk «Custom». */
export function rectanglePolygon(b, h) {
  return { outer: [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]], holes: [] };
}
