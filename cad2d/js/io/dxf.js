/**
 * dxf.js — leser ASCII-DXF og gjør tegningen om til lukkede konturer (#85).
 *
 * Ingen DOM, ingen importer, ingen avhengigheter: fila skal kunne testes rett
 * i Node (`tests/dxf.test.mjs`). Den vet heller ingenting om store eller
 * arbeidsenhet — kallende kode skalerer og legger formene inn.
 *
 * Flyten er fire steg, hvert sitt eksport, slik at testene kan treffe dem
 * hver for seg:
 *
 *   parseDxf(text)          tekst → entiteter (LINE, LWPOLYLINE, POLYLINE,
 *                           CIRCLE, ARC). Alt annet TELLES i `skipped`, det
 *                           hoppes aldri stille over.
 *   entitiesToPaths(ents)   entiteter → punktlister, buer diskretisert
 *   stitchPaths(paths, tol) løse linjer/buer sys sammen til ringer, doble
 *                           stier fjernes
 *   dedupeRings(rings)      ringer tegnet to ganger slås sammen
 *   nestRings(rings)        ringer inni ringer blir hull; ringer inni hull
 *                           blir nye, selvstendige former
 *
 * `importDxf()` gjør alle fire.
 *
 * Diskretisering av buer er AREALLIK: hjørnene legges på en radius som er
 * justert slik at mangekantens areal er lik sirkelens (eller sirkelsektorens).
 * En vanlig innskrevet 32-kant mangler 0,64 % av sirkelarealet; i et hulldekke
 * med sju Ø140-kanaler blir det −0,33 % på nettoarealet. Bueendepunktene ligger
 * alltid nøyaktig på radien, slik at de møter linjene de skal sys sammen med.
 *
 * Koordinater: DXF-ens X mot høyre og Y opp, som workspacet. Ingen speiling.
 * Entiteter med ekstrusjonsretning (0, 0, −1) — speilet i AutoCAD — speiles
 * tilbake (x → −x, «arbitrary axis»-regelen). Andre ekstrusjonsretninger
 * ligger ikke i tegneplanet og meldes som ikke støttet.
 */

import { DEFAULT_SEGMENTS, areaEqualRadius, arcPoints, circleRing, bulgePoints } from '../geometry/curves.js';
import { STITCH_REL, stitchPaths, dedupeRings, nestRings, pathLength, bboxOf, samePath, PointGrid } from '../geometry/stitch.js';
import { text } from '../core/text.js';

/**
 * Feil med kode, så meldingen kan gis på brukerens språk (`text(lang).dxfError`).
 * `message` er den norske teksten, som før.
 */
function dxfError(code, args) {
  const err = new Error(text('no').dxfError(code, args));
  err.code = code;
  err.args = args;
  return err;
}

// Re-eksport: API-et til dxf.js er det samme som før flyttingen (#93).
export { DEFAULT_SEGMENTS, areaEqualRadius, arcPoints, circleRing, bulgePoints, STITCH_REL, stitchPaths, dedupeRings, nestRings };


/** DXF-ens $INSUNITS → arbeidsenhet. Bare de tre workspacet kan. */
export const INSUNITS_TO_UNIT = { 4: 'mm', 5: 'cm', 6: 'm' };


/* ------------------------------------------------------------------ *
 * 1. Tekst → entiteter
 * ------------------------------------------------------------------ */

/**
 * Deler fila i (gruppekode, verdi, linjenummer)-tripler. Stopper ved
 * `0 / EOF` — det som står etter (tomme linjer, Ctrl+Z), er ikke DXF.
 */
function pairs(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (!/^[+-]?\d+$/.test(raw)) {
      throw dxfError('groupCode', { line: i + 1, found: raw.slice(0, 20) });
    }
    const code = parseInt(raw, 10);
    const val = lines[i + 1].trim();
    out.push([code, val, i + 2]);
    if (code === 0 && val === 'EOF') break;
  }
  return out;
}

/**
 * Leser entitetene i ENTITIES-seksjonen.
 *
 * @returns {{
 *   entities: Array<object>,
 *   skipped: Record<string, number>,   // entitetstype → antall hoppet over
 *   insunits: number|null,             // $INSUNITS fra HEADER, om den finnes
 *   warnings: string[],
 * }}
 */
export function parseDxf(text) {
  const src = String(text || '');
  if (src.startsWith('AutoCAD Binary DXF')) {
    throw dxfError('binary', {});
  }
  const p = pairs(src);
  const entities = [];
  const skipped = {};
  const warnings = [];
  let insunits = null;
  let sawEntities = false;

  const skip = (type) => {
    skipped[type] = (skipped[type] || 0) + 1;
  };

  let i = 0;
  while (i < p.length) {
    const [code, val] = p[i];
    if (code === 0 && val === 'SECTION' && p[i + 1] && p[i + 1][0] === 2) {
      const name = p[i + 1][1];
      i += 2;
      if (name === 'HEADER') {
        while (i < p.length && !(p[i][0] === 0 && p[i][1] === 'ENDSEC')) {
          if (p[i][0] === 9 && p[i][1] === '$INSUNITS' && p[i + 1] && p[i + 1][0] === 70) {
            insunits = parseInt(p[i + 1][1], 10);
          }
          i++;
        }
      } else if (name === 'ENTITIES') {
        sawEntities = true;
        i = readEntities(p, i, entities, skip, warnings);
      } else {
        // BLOCKS, TABLES, OBJECTS … — innholdet i blokker tas ikke med.
        // En INSERT i ENTITIES blir talt som hoppet over, så brukeren får vite.
        while (i < p.length && !(p[i][0] === 0 && p[i][1] === 'ENDSEC')) i++;
      }
      continue;
    }
    i++;
  }
  if (!sawEntities) throw dxfError('noEntities', {});
  return { entities, skipped, insunits: Number.isFinite(insunits) ? insunits : null, warnings };
}

/** Samler gruppene til én entitet, fram til neste kode 0. */
function collect(p, i) {
  const groups = [];
  let j = i + 1;
  while (j < p.length && p[j][0] !== 0) {
    groups.push(p[j]);
    j++;
  }
  return { groups, next: j };
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Et tall slik DXF skriver det. `1,5` eller `abc` er ikke et tall — de
 * avvises med linjenummer i stedet for å bli stille til 1 eller 0.
 */
function num(v, line) {
  const s = String(v).trim();
  if (!NUMBER.test(s)) {
    throw dxfError('badNumber', { value: s.slice(0, 20), line: line ?? '?' });
  }
  return parseFloat(s);
}

function first(groups, code, fallback = 0) {
  const g = groups.find((x) => x[0] === code);
  return g ? num(g[1], g[2]) : fallback;
}

/** Ekstrusjonsretningen: +1 (vanlig), −1 (speilet), eller null (ute av planet). */
function extrusionSign(groups) {
  const ex = first(groups, 210, 0);
  const ey = first(groups, 220, 0);
  const ez = first(groups, 230, 1);
  const tol = 1e-9;
  if (Math.abs(ex) > tol || Math.abs(ey) > tol) return null;
  if (ez > 0) return 1;
  if (ez < 0) return -1;
  return null;
}

function readEntities(p, i, entities, skip, warnings) {
  while (i < p.length) {
    const [code, type] = p[i];
    if (code !== 0) {
      i++;
      continue;
    }
    if (type === 'ENDSEC') return i + 1;
    const { groups, next } = collect(p, i);

    // Papirrom (67 = 1) er tegningsark, ikke modellen.
    if (first(groups, 67, 0) === 1) {
      skip(`${type} (papirrom)`);
      i = type === 'POLYLINE' ? skipPast(p, next, 'SEQEND') : next;
      continue;
    }

    if (type === 'POLYLINE') {
      i = readPolyline(p, groups, next, entities, skip);
      continue;
    }

    const sign = extrusionSign(groups);
    const supported = type === 'LINE' || type === 'LWPOLYLINE' || type === 'CIRCLE' || type === 'ARC';
    if (supported && sign === null) {
      skip(`${type} (ikke i tegneplanet)`);
      i = next;
      continue;
    }

    if (type === 'LINE') {
      // LINE er i verdenskoordinater — ekstrusjonen påvirker den ikke.
      entities.push({
        type,
        a: [first(groups, 10), first(groups, 20)],
        b: [first(groups, 11), first(groups, 21)],
      });
    } else if (type === 'CIRCLE') {
      entities.push({ type, c: [sign * first(groups, 10), first(groups, 20)], r: first(groups, 40), mirror: sign < 0 });
    } else if (type === 'ARC') {
      let a0 = first(groups, 50);
      let a1 = first(groups, 51);
      // Speilet bue: x → −x snur vinklene og omløpsretningen.
      if (sign < 0) [a0, a1] = [180 - a1, 180 - a0];
      entities.push({ type, c: [sign * first(groups, 10), first(groups, 20)], r: first(groups, 40), a0, a1 });
    } else if (type === 'LWPOLYLINE') {
      const flags = first(groups, 70, 0);
      const verts = [];
      for (const [c, v, line] of groups) {
        if (c === 10) verts.push({ p: [sign * num(v, line), 0], bulge: 0, hasY: false });
        else if (c === 20 && verts.length && !verts[verts.length - 1].hasY) {
          verts[verts.length - 1].p[1] = num(v, line);
          verts[verts.length - 1].hasY = true;
        } else if (c === 42 && verts.length) verts[verts.length - 1].bulge = sign * num(v, line);
      }
      entities.push({
        type,
        closed: (flags & 1) === 1,
        vertices: verts.map((x) => ({ p: x.p, bulge: x.bulge })),
      });
    } else if (type === 'SEQEND' || type === 'VERTEX') {
      warnings.push(text('no').dxfOrphan(type));
    } else if (type === 'EOF') {
      return i + 1;
    } else {
      skip(type);
    }
    i = next;
  }
  return i;
}

function skipPast(p, i, marker) {
  while (i < p.length && !(p[i][0] === 0 && (p[i][1] === marker || p[i][1] === 'ENDSEC'))) i++;
  if (i < p.length && p[i][1] === marker) {
    i++;
    while (i < p.length && p[i][0] !== 0) i++;
  }
  return i;
}

/** POLYLINE + VERTEX … + SEQEND. 3D-polylinjer og flatenett støttes ikke. */
function readPolyline(p, groups, i, entities, skip) {
  const flags = first(groups, 70, 0);
  const sign = extrusionSign(groups);
  const verts = [];
  while (i < p.length && p[i][0] === 0 && p[i][1] === 'VERTEX') {
    const { groups: vg, next } = collect(p, i);
    const vflags = first(vg, 70, 0);
    // 16 = kontrollpunkt for spline — ikke et punkt på kurven
    if (!(vflags & 16)) verts.push({ p: [first(vg, 10), first(vg, 20)], bulge: first(vg, 42, 0) });
    i = next;
  }
  if (i < p.length && p[i][0] === 0 && p[i][1] === 'SEQEND') i = collect(p, i).next;

  if (flags & (8 | 16 | 64)) {
    skip(flags & 8 ? 'POLYLINE (3D)' : 'POLYLINE (nett)');
  } else if (sign === null) {
    skip('POLYLINE (ikke i tegneplanet)');
  } else {
    entities.push({
      type: 'POLYLINE',
      closed: (flags & 1) === 1,
      vertices: verts.map((v) => ({ p: [sign * v.p[0], v.p[1]], bulge: sign * v.bulge })),
    });
  }
  return i;
}

/* ------------------------------------------------------------------ *
 * 2. Entiteter → punktlister (areallik diskretisering)
 * ------------------------------------------------------------------ */

function polyPath(vertices, closed, segments) {
  if (!vertices.length) return [];
  const pts = [[vertices[0].p[0], vertices[0].p[1]]];
  const n = vertices.length;
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const a = vertices[k];
    const b = vertices[(k + 1) % n];
    pts.push(...bulgePoints(a.p, b.p, a.bulge, segments));
  }
  if (closed) pts.pop(); // siste punkt er lik første
  return pts;
}

/**
 * @returns {Array<{points: Array<[number,number]>, closed: boolean, type: string}>}
 */
export function entitiesToPaths(entities, { segments = DEFAULT_SEGMENTS } = {}) {
  const out = [];
  for (const e of entities || []) {
    if (e.type === 'LINE') {
      out.push({ type: e.type, closed: false, points: [e.a.slice(), e.b.slice()] });
    } else if (e.type === 'CIRCLE') {
      if (e.r > 0) out.push({ type: e.type, closed: true, points: circleRing(e.c, e.r, segments) });
    } else if (e.type === 'ARC') {
      if (!(e.r > 0)) continue;
      let sweep = (((e.a1 - e.a0) % 360) + 360) % 360;
      if (sweep < 1e-9) sweep = 360;
      const a0 = (e.a0 * Math.PI) / 180;
      const sw = (sweep * Math.PI) / 180;
      const start = [e.c[0] + e.r * Math.cos(a0), e.c[1] + e.r * Math.sin(a0)];
      out.push({ type: e.type, closed: false, points: [start, ...arcPoints(e.c, e.r, a0, sw, segments)] });
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const pts = polyPath(e.vertices, e.closed, segments);
      if (pts.length >= 2) out.push({ type: e.type, closed: e.closed, points: pts });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Sy sammen løse linjer og buer
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 6. Lokalt origo
 * ------------------------------------------------------------------ */

function entityPoints(e) {
  if (e.type === 'LINE') return [e.a, e.b];
  if (e.type === 'CIRCLE' || e.type === 'ARC') return [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]];
  return (e.vertices || []).map((v) => v.p);
}

/**
 * Ligger tegningen langt fra origo i forhold til sin egen størrelse (Revit
 * med delte koordinater: 6,6e9 mm), kansellerer arealintegralene — et
 * hulldekke fikk A = 317 952 i stedet for 318 000, og I ble meningsløs.
 * Da flyttes alt til et lokalt origo FØR buene diskretiseres (#86, B5).
 * Forskyvningen er et rundt tall i tegningens størrelsesorden, så den er
 * lett å lese og legge til igjen.
 *
 * @returns {[number, number]|null}
 */
export function localOrigin(entities) {
  const pts = (entities || []).flatMap(entityPoints);
  if (!pts.length) return null;
  const b = bboxOf(pts);
  const size = Math.max(b.diag, 1e-12);
  const far = Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY));
  if (far <= 1e3 * size) return null;
  const step = 10 ** Math.ceil(Math.log10(size));
  return [Math.floor(b.minX / step) * step, Math.floor(b.minY / step) * step];
}

function shiftEntity(e, [dx, dy]) {
  const sh = (p) => [p[0] - dx, p[1] - dy];
  if (e.type === 'LINE') return { ...e, a: sh(e.a), b: sh(e.b) };
  if (e.type === 'CIRCLE' || e.type === 'ARC') return { ...e, c: sh(e.c) };
  return { ...e, vertices: e.vertices.map((v) => ({ ...v, p: sh(v.p) })) };
}

/* ------------------------------------------------------------------ *
 * Alt i ett
 * ------------------------------------------------------------------ */

/**
 * @param {string} text  ASCII-DXF
 * @param {{scale?: number|((insunits: number|null) => number), segments?: number, tol?: number}} opts
 *   scale    — ganges på alle koordinater (DXF-enhet → arbeidsenhet). Kan være
 *              en funksjon av fila sin $INSUNITS.
 *   tol      — absolutt sammensyingstoleranse i DXF-enheter; uten den er
 *              toleransen lokal (STITCH_REL av den korteste stien)
 * @returns {{
 *   regions: Array<{outer, holes, depth}>, // i arbeidsenheten, lokalt origo
 *   skipped: Record<string, number>,
 *   openCount, branched, dropped, zeroLength: number,
 *   duplicates: {segments: number, rings: number},
 *   nearDuplicates: number,
 *   offset: [number, number]|null,       // i DXF-enheter; lokal + offset = fila
 *   insunits: number|null,
 *   entityCount: number,
 *   warnings: string[],
 * }}
 */
export function importDxf(text, { scale = 1, segments = DEFAULT_SEGMENTS, tol } = {}) {
  const parsed = parseDxf(text);
  const offset = localOrigin(parsed.entities);
  const ents = offset ? parsed.entities.map((e) => shiftEntity(e, offset)) : parsed.entities;
  const paths = entitiesToPaths(ents, { segments });
  const st = stitchPaths(paths, tol);
  const dd = dedupeRings(st.rings);
  const k = typeof scale === 'function' ? scale(parsed.insunits) : scale;
  const sc = (r) => r.map(([x, y]) => [x * k, y * k]);
  const regions = nestRings(dd.rings).map((r) => ({ outer: sc(r.outer), holes: r.holes.map(sc), depth: r.depth }));
  return {
    regions,
    skipped: parsed.skipped,
    openCount: st.open.length,
    branched: st.branched,
    dropped: st.dropped,
    zeroLength: st.zeroLength,
    duplicates: { segments: st.duplicates, rings: dd.same },
    nearDuplicates: dd.near,
    offset,
    insunits: parsed.insunits,
    entityCount: parsed.entities.length,
    warnings: parsed.warnings,
  };
}

/**
 * «Bare linjer» (#86): DXF-en som rå linjearbeid i stedet for ferdige former.
 * Hver LINE, polylinje, bue og sirkel blir én sti (buer og sirkler areallikt
 * diskretisert, som ellers), etter samme flytting til lokalt origo og samme
 * fjerning av doble stier og doble lukkede konturer som i `importDxf`. Ingen
 * søm og ingen nøsting — det gjør brukeren med «Lag geometri» / «Lag hull».
 *
 * @returns {{paths: Array<{points, closed}>, skipped, duplicates: {segments, rings},
 *   zeroLength, offset, insunits, entityCount, warnings}}
 */
export function importDxfLines(text, { scale = 1, segments = DEFAULT_SEGMENTS } = {}) {
  const parsed = parseDxf(text);
  const offset = localOrigin(parsed.entities);
  const ents = offset ? parsed.entities.map((e) => shiftEntity(e, offset)) : parsed.entities;
  const all = entitiesToPaths(ents, { segments });
  const k = typeof scale === 'function' ? scale(parsed.insunits) : scale;

  let zeroLength = 0;
  const open = [];
  const closed = [];
  for (const p of all) {
    if (!(pathLength(p.points) > 0)) {
      zeroLength++;
      continue;
    }
    (p.closed ? closed : open).push(p);
  }
  // Doble åpne stier: samme punkt, samme eller motsatt retning
  const maxLen = open.reduce((m, p) => Math.max(m, pathLength(p.points)), 0);
  const grid = new PointGrid(STITCH_REL * maxLen);
  const keptOpen = [];
  let dupSegments = 0;
  for (const p of open) {
    const a = p.points;
    const t = STITCH_REL * pathLength(a);
    const cands = [...grid.near(a[0]), ...grid.near(a[a.length - 1])];
    if (cands.some((q) => samePath(a, q.points, Math.min(t, STITCH_REL * pathLength(q.points))))) {
      dupSegments++;
      continue;
    }
    keptOpen.push(p);
    grid.add(a[0], p);
  }
  // Doble lukkede konturer (bare de som er LIKE; nesten like får stå)
  const ringIdx = new Map(closed.map((p, i) => [p.points, i]));
  const dd = dedupeRings(closed.map((p) => p.points), { near: false });
  const keptClosed = dd.rings.map((r) => closed[ringIdx.get(r)]);

  const sc = (pts) => pts.map(([x, y]) => [x * k, y * k]);
  return {
    paths: [...keptOpen, ...keptClosed].map((p) => ({ points: sc(p.points), closed: !!p.closed })),
    skipped: parsed.skipped,
    duplicates: { segments: dupSegments, rings: dd.same },
    zeroLength,
    offset,
    insunits: parsed.insunits,
    entityCount: parsed.entities.length,
    warnings: parsed.warnings,
  };
}

/** Meldingen etter «Bare linjer». */
export function describeLineImport(res, lang = 'no') {
  const T = text(lang);
  const parts = [T.dxfLinesHeader(res.paths.length)];
  pushSkipped(parts, res, T);
  if (res.zeroLength) parts.push(T.dxfZeroLength(res.zeroLength));
  const dup = res.duplicates || {};
  if (dup.segments) parts.push(T.dxfDupSegments(dup.segments));
  if (dup.rings) parts.push(T.dxfDupRings(dup.rings));
  if (res.offset) parts.push(T.dxfOffsetLines(fmtNum(-res.offset[0]), fmtNum(-res.offset[1])));
  pushWarnings(parts, res, T, lang);
  parts.push(T.dxfMakeHint);
  return parts.join(' ');
}

/** «Hoppet over N ikke støttede: …», med etikettene på språket. */
function pushSkipped(parts, res, T) {
  const skipped = Object.entries(res.skipped || {});
  if (!skipped.length) return;
  const total = skipped.reduce((a, [, n]) => a + n, 0);
  parts.push(T.dxfSkipped(total, skipped.map(([t, n]) => `${n} ${T.dxfSkipLabel(t)}`).join(', ')));
}

/** Advarslene fra parseren er norske strenger; på andre språk oversettes de kjente. */
function pushWarnings(parts, res, T, lang) {
  for (const w of res.warnings || []) parts.push(lang === 'no' ? w : T.dxfWarning(w));
}

/** $INSUNITS-forvalg: 'auto' bruker fila sin enhet når den er mm/cm/m. */
export function resolveDxfUnit(choice, insunits) {
  if (choice === 'mm' || choice === 'cm' || choice === 'm') return { unit: choice, fromFile: false };
  const u = INSUNITS_TO_UNIT[insunits];
  return u ? { unit: u, fromFile: true } : { unit: 'mm', fromFile: false };
}

/**
 * Formene importen skal bli, øverst først: i hver region hullene foran
 * ytterkonturen. Rekkefølgen betyr ikke noe for hullene — et hull skjærer alt
 * fast areal det overlapper (#86). En region inni et hull («øy i hull») blir
 * derfor skåret bort; `describeImport` sier fra om det.
 *
 * @returns {Array<{points, role: 'solid'|'void', name: string}>}
 */
export function shapeList(res, { start = 1, base = 'DXF' } = {}) {
  const named = (res.regions || []).map((g, i) => ({ g, name: `${base} ${start + i}` }));
  const list = [];
  for (const { g, name } of named) {
    g.holes.forEach((h, j) => list.push({ points: h, role: 'void', name: `${name} hull ${j + 1}` }));
    list.push({ points: g.outer, role: 'solid', name });
  }
  return list;
}

const fmtNum = (v) => String(Math.round(v * 1e6) / 1e6);

/** Én linje til brukeren om hva som ble importert og hva som ikke ble det. */
export function describeImport(res, lang = 'no') {
  const T = text(lang);
  const nShapes = res.regions.length;
  const nHoles = res.regions.reduce((a, r) => a + r.holes.length, 0);
  const parts = [T.dxfShapesHeader(nShapes, nHoles)];
  pushSkipped(parts, res, T);
  if (res.openCount) parts.push(T.dxfOpen(res.openCount));
  if (res.branched) parts.push(T.dxfBranched(res.branched));
  if (res.dropped) parts.push(T.dxfDropped(res.dropped));
  if (res.zeroLength) parts.push(T.dxfZeroLength(res.zeroLength));
  const dup = res.duplicates || {};
  if (dup.segments) parts.push(T.dxfDupSegments(dup.segments));
  if (dup.rings) parts.push(T.dxfDupRings(dup.rings));
  if (res.nearDuplicates) parts.push(T.dxfNear(res.nearDuplicates));
  const islands = res.regions.filter((g) => (g.depth || 0) >= 2).length;
  if (islands) parts.push(T.dxfIslands(islands));
  if (res.offset) parts.push(T.dxfOffset(fmtNum(-res.offset[0]), fmtNum(-res.offset[1])));
  pushWarnings(parts, res, T, lang);
  return parts.join(' ');
}
