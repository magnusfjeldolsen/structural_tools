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

const TAU = 2 * Math.PI;

/** DXF-ens $INSUNITS → arbeidsenhet. Bare de tre workspacet kan. */
export const INSUNITS_TO_UNIT = { 4: 'mm', 5: 'cm', 6: 'm' };

/** Hjørner per hel sirkel — samme som `circlePoints` i geometry.js. */
export const DEFAULT_SEGMENTS = 48;

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
      throw new Error(`Ugyldig DXF: forventet en gruppekode på linje ${i + 1}, fant «${raw.slice(0, 20)}».`);
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
    throw new Error('Binær DXF støttes ikke — lagre som ASCII-DXF.');
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
  if (!sawEntities) throw new Error('Ugyldig DXF: fant ingen ENTITIES-seksjon.');
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
    throw new Error(`Ugyldig tall «${s.slice(0, 20)}» på linje ${line ?? '?'} i DXF-fila.`);
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
      warnings.push(`${type} uten POLYLINE foran — ignorert.`);
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

/**
 * Radien hjørnene i en hel, regulær n-kant må ligge på for at n-kanten skal ha
 * samme areal som sirkelen med radius r:  n·R²·sin(2π/n)/2 = π·r².
 */
export function areaEqualRadius(r, n) {
  return r * Math.sqrt(TAU / (n * Math.sin(TAU / n)));
}

/** Antall korder en bue med vinkel `sweep` deles i (minst 2, så arealet kan justeres). */
function chordCount(sweep, segments) {
  return Math.max(2, Math.ceil((Math.abs(sweep) / TAU) * segments - 1e-9));
}

/**
 * Punktene langs en bue fra vinkel a0, med fortegnet vinkel `sweep`, UTEN
 * startpunktet og MED sluttpunktet. Endepunktene ligger på r; de m−1 punktene
 * mellom ligger på en radius ρ valgt slik at viftearealet om sentrum er lik
 * sektorarealet r²·θ/2:
 *
 *   (sin φ / 2)·(2·r·ρ + (m−2)·ρ²) = r²·θ/2,   φ = θ/m
 *
 * Siden arealet av en lukket ring kan summeres som vifter om et vilkårlig
 * punkt, gir det samme areal som den eksakte buen uansett hva resten av ringen
 * er (rett linje = sirkelsegment, andre buer, osv.).
 */
export function arcPoints(c, r, a0, sweep, segments = DEFAULT_SEGMENTS) {
  const m = chordCount(sweep, segments);
  const th = Math.abs(sweep);
  const phi = th / m;
  const s = Math.sin(phi);
  let rho;
  if (m === 2) rho = (r * th) / (2 * s);
  else {
    // (m−2)ρ² + 2rρ − r²θ/sinφ = 0, positiv rot
    const A = m - 2;
    const B = 2 * r;
    const C = (-r * r * th) / s;
    rho = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  }
  const out = [];
  const dir = sweep >= 0 ? 1 : -1;
  for (let k = 1; k <= m; k++) {
    const a = a0 + dir * phi * k;
    const rr = k === m ? r : rho;
    out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
  }
  return out;
}

/** Hel sirkel som areallik regulær n-kant. */
export function circleRing(c, r, segments = DEFAULT_SEGMENTS) {
  const n = Math.max(3, Math.round(segments));
  const R = areaEqualRadius(r, n);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (TAU * k) / n;
    pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
  }
  return pts;
}

/**
 * Bulge-segmentet fra p1 til p2: bulge = tan(θ/4), positiv = mot klokka.
 * Returnerer punktene uten p1, med p2.
 */
export function bulgePoints(p1, p2, bulge, segments = DEFAULT_SEGMENTS) {
  if (Math.abs(bulge) < 1e-12) return [[p2[0], p2[1]]];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return [[p2[0], p2[1]]];
  const theta = 4 * Math.atan(bulge); // fortegnet sveipevinkel
  const r = d / (2 * Math.abs(Math.sin(theta / 2)));
  // Sentrum ligger på venstre normal (for θ > 0) i avstand (d/2)/tan(θ/2)
  const off = d / 2 / Math.tan(theta / 2);
  const c = [(p1[0] + p2[0]) / 2 + (-dy / d) * off, (p1[1] + p2[1]) / 2 + (dx / d) * off];
  const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
  const pts = arcPoints(c, r, a0, theta, segments);
  pts[pts.length - 1] = [p2[0], p2[1]]; // nøyaktig endepunkt, ikke cos/sin-støy
  return pts;
}

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

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Sammensyingstoleransen er LOKAL: en brøkdel av den korteste av de to
 * stiene som skal møtes. En toleranse som er en brøkdel av hele tegningen,
 * blåses opp av en nordpil eller en tegningsramme langt unna, og syr da
 * sammen hull som er mindre enn toleransen (#86, B1).
 */
export const STITCH_REL = 1e-4;

function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

function bboxOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, diag: Math.hypot(maxX - minX, maxY - minY) };
}

/** Enkel rutenett-hash for punkt, så søket etter naboender ikke blir O(n²). */
class PointGrid {
  constructor(cell) {
    this.cell = cell > 0 && Number.isFinite(cell) ? cell : 1;
    this.map = new Map();
  }
  key(i, j) {
    return `${i},${j}`;
  }
  add(p, item) {
    const k = this.key(Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell));
    let list = this.map.get(k);
    if (!list) this.map.set(k, (list = []));
    list.push(item);
  }
  near(p) {
    const i0 = Math.floor(p[0] / this.cell);
    const j0 = Math.floor(p[1] / this.cell);
    const out = [];
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const list = this.map.get(this.key(i, j));
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

function signedRingArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/**
 * Rydder en ring: punkt som ligger oppå forrige og et lukkende duplikat
 * fjernes, med en toleranse som er en brøkdel av ringens EGEN størrelse.
 * Returnerer null når det ikke er en kontur igjen (under tre punkt eller
 * uten areal) — kallende kode teller det.
 */
function cleanRing(points) {
  if (points.length < 3) return null;
  const { diag } = bboxOf(points);
  if (!(diag > 0)) return null;
  const t = diag * 1e-9;
  const out = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > t) out.push([p[0], p[1]]);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= t) out.pop();
  if (out.length < 3) return null;
  if (Math.abs(signedRingArea(out)) <= diag * diag * 1e-12) return null;
  return out;
}

function samePath(a, b, t) {
  if (a.length !== b.length) return false;
  let fwd = true;
  for (let i = 0; i < a.length && fwd; i++) fwd = dist(a[i], b[i]) <= t;
  if (fwd) return true;
  const n = a.length - 1;
  for (let i = 0; i < a.length; i++) if (dist(a[i], b[n - i]) > t) return false;
  return true;
}

/**
 * Syr åpne stier sammen ende mot ende til lukkede ringer. Lukkede stier er
 * ringer fra før. Før sømmen fjernes stier som ligger dobbelt (samme punkt,
 * samme eller motsatt retning) — vanlig i ekte CAD, og ellers blir den ene
 * kopien en løs ende som hindrer ringen i å lukke seg (#86, B3).
 *
 * @param {number} [tol] absolutt toleranse; uten den er den lokal (STITCH_REL)
 * @returns {{rings, open, branched, duplicates, dropped, zeroLength}}
 */
export function stitchPaths(paths, tol) {
  const fixed = Number.isFinite(tol) && tol > 0 ? tol : null;
  const rings = [];
  const open = [];
  let branched = 0;
  let duplicates = 0;
  let dropped = 0;
  let zeroLength = 0;

  const pushRing = (pts) => {
    const r = cleanRing(pts);
    if (r) rings.push(r);
    else dropped++;
  };

  const loose = [];
  for (const path of paths || []) {
    const pts = path.points.map((p) => [p[0], p[1]]);
    const len = pathLength(pts);
    if (!(len > 0)) {
      zeroLength++;
      continue;
    }
    const t = fixed ?? STITCH_REL * len;
    if (path.closed || (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= t)) pushRing(pts);
    else loose.push({ pts, len });
  }
  const tolOf = (a, b) => fixed ?? STITCH_REL * Math.min(loose[a].len, loose[b].len);
  const cell = fixed ?? STITCH_REL * loose.reduce((m, l) => Math.max(m, l.len), 0);

  // Dobbelt tegnede stier
  const kept = [];
  const byStart = new PointGrid(cell);
  for (let k = 0; k < loose.length; k++) {
    const a = loose[k].pts;
    const cands = [...byStart.near(a[0]), ...byStart.near(a[a.length - 1])];
    if (cands.some((j) => samePath(a, loose[j].pts, tolOf(j, k)))) {
      duplicates++;
      continue;
    }
    kept.push(k);
    byStart.add(a[0], k);
  }

  // Endepunktene, for søket etter neste sti i kjeden
  const ends = new PointGrid(cell);
  for (const k of kept) {
    const a = loose[k].pts;
    ends.add(a[0], { k, atEnd: false });
    ends.add(a[a.length - 1], { k, atEnd: true });
  }
  const used = new Set();
  for (const s of kept) {
    if (used.has(s)) continue;
    used.add(s);
    const first = s;
    let last = s;
    let chain = loose[s].pts.slice();
    const isClosed = () => chain.length > 2 && dist(chain[0], chain[chain.length - 1]) <= tolOf(first, last);
    let closed = isClosed();
    for (let pass = 0; pass < 2 && !closed; pass++) {
      let grew = true;
      while (grew && !closed) {
        grew = false;
        const end = chain[chain.length - 1];
        const hits = [];
        const seen = new Set();
        for (const { k, atEnd } of ends.near(end)) {
          if (used.has(k) || seen.has(k)) continue;
          const c = loose[k].pts;
          const p = atEnd ? c[c.length - 1] : c[0];
          if (dist(p, end) <= tolOf(last, k)) {
            hits.push([k, atEnd]);
            seen.add(k);
          }
        }
        if (hits.length > 1) branched++;
        if (hits.length) {
          const [k, rev] = hits[0];
          used.add(k);
          const seg = rev ? loose[k].pts.slice().reverse() : loose[k].pts;
          chain = chain.concat(seg.slice(1));
          last = k;
          grew = true;
          closed = isClosed();
        }
      }
      if (!closed) chain.reverse();
    }
    if (closed) pushRing(chain);
    else open.push(chain);
  }
  return { rings, open, branched, duplicates, dropped, zeroLength };
}

/* ------------------------------------------------------------------ *
 * 4. Sammenfallende ringer
 * ------------------------------------------------------------------ */

/** Areal, tyngdepunkt og annet arealmoment om tyngdepunktet for én ring. */
function ringStats(r) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
  // Om ringens første punkt, så store koordinater ikke kansellerer
  const [ox, oy] = r[0];
  for (let i = 0; i < r.length; i++) {
    const x1 = r[i][0] - ox, y1 = r[i][1] - oy;
    const x2 = r[(i + 1) % r.length][0] - ox, y2 = r[(i + 1) % r.length][1] - oy;
    const c = x1 * y2 - x2 * y1;
    A += c;
    Sy += (x1 + x2) * c;
    Sx += (y1 + y2) * c;
    Iyy += (x1 * x1 + x1 * x2 + x2 * x2) * c;
    Ixx += (y1 * y1 + y1 * y2 + y2 * y2) * c;
  }
  A /= 2; Sx /= 6; Sy /= 6; Ixx /= 12; Iyy /= 12;
  const cx = Sy / A, cy = Sx / A;
  const s = Math.sign(A);
  return {
    A: Math.abs(A),
    cx: cx + ox,
    cy: cy + oy,
    Ixx: s * (Ixx - A * cy * cy),
    Iyy: s * (Iyy - A * cx * cx),
    diag: bboxOf(r).diag,
  };
}

/**
 * Slår sammen ringer som er tegnet to ganger (#86, B3). To ringer er LIKE når
 * areal (1e-6), tyngdepunkt (1e-6 av størrelsen) og arealmomentene (1e-3)
 * stemmer — det fanger både eksakte kopier og samme sirkel tegnet som CIRCLE
 * og som bulge-polylinje, men ikke et speilvendt L i samme boks.
 * NESTEN like (1e-4 på areal og tyngdepunkt) er nesten sikkert en tegnefeil:
 * den minste utelates og det meldes, i stedet for at den blir et
 * hårtynt hull i den andre.
 *
 * @returns {{rings, same: number, near: number}}
 */
export function dedupeRings(rings) {
  const items = (rings || []).map((ring) => ({ ring, ...ringStats(ring), gone: false }));
  const order = items.map((_, i) => i).sort((a, b) => items[a].cx - items[b].cx);
  let same = 0;
  let near = 0;
  const close = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));
  for (let oi = 0; oi < order.length; oi++) {
    const a = items[order[oi]];
    if (a.gone) continue;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const b = items[order[oj]];
      if (b.cx - a.cx > 1e-4 * a.diag) break;
      if (b.gone) continue;
      const dc = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const inertia = close(a.Ixx, b.Ixx, 1e-3) && close(a.Iyy, b.Iyy, 1e-3);
      if (close(a.A, b.A, 1e-6) && dc <= 1e-6 * a.diag && inertia) {
        b.gone = true;
        same++;
      } else if (close(a.A, b.A, 1e-4) && dc <= 1e-4 * a.diag && inertia) {
        (a.A >= b.A ? b : a).gone = true;
        near++;
        if (a.gone) break;
      }
    }
  }
  return { rings: items.filter((x) => !x.gone).map((x) => x.ring), same, near };
}

/* ------------------------------------------------------------------ *
 * 5. Hull: ringer inni ringer
 * ------------------------------------------------------------------ */

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Ligger ring a inni ring b? Flertallet av a sine hjørner avgjør. */
function ringInside(a, b) {
  let ins = 0;
  for (const p of a) if (pointInRing(p, b)) ins++;
  return ins * 2 > a.length;
}

const boxInside = (a, b) => a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY;

/**
 * Ordner ringene etter hvor dypt de ligger. Dybde 0, 2, 4 … er materiale,
 * 1, 3 … er hull i ringen rett utenfor. Et massivt stykke inni et hull blir
 * en egen region med `depth` 2. Siden hull skjærer alt fast areal de overlapper,
 * blir en slik øy skåret bort i workspacet; `describeImport` melder det.
 *
 * En ring kan bare ligge inni en annen hvis boksen gjør det; den sjekken er
 * billig og gjør at punkt-i-ring bare kjøres for reelle kandidater (#86, B4).
 *
 * Alle ringene returneres mot klokka (positivt areal); det er formenes
 * `role`, ikke omløpsretningen, som sier hva som er hull i workspacet.
 *
 * @returns {Array<{outer, holes, depth}>}
 */
export function nestRings(rings) {
  const items = (rings || [])
    .map((r) => {
      const A = signedRingArea(r);
      return { ring: A < 0 ? r.slice().reverse() : r.slice(), area: Math.abs(A), box: bboxOf(r) };
    })
    .sort((a, b) => b.area - a.area);
  for (let i = 0; i < items.length; i++) {
    items[i].parent = -1;
    // Lista er sortert synkende; den første som inneholder, baklengs fra i,
    // er den minste, altså den nærmeste forelderen.
    for (let j = i - 1; j >= 0; j--) {
      if (items[j].area <= items[i].area || !boxInside(items[i].box, items[j].box)) continue;
      if (ringInside(items[i].ring, items[j].ring)) {
        items[i].parent = j;
        break;
      }
    }
  }
  // Foreldre kommer før barn i lista, så dybden kan regnes i én runde.
  for (const it of items) it.depth = it.parent < 0 ? 0 : items[it.parent].depth + 1;
  const regions = [];
  const regionOf = new Map();
  items.forEach((it, i) => {
    if (it.depth % 2 === 0) {
      regionOf.set(i, regions.length);
      regions.push({ outer: it.ring, holes: [], depth: it.depth });
    }
  });
  items.forEach((it) => {
    if (it.depth % 2 === 1) regions[regionOf.get(it.parent)].holes.push(it.ring);
  });
  return regions;
}

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

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtNum = (v) => String(Math.round(v * 1e6) / 1e6);

/** Én linje til brukeren om hva som ble importert og hva som ikke ble det. */
export function describeImport(res) {
  const nShapes = res.regions.length;
  const nHoles = res.regions.reduce((a, r) => a + r.holes.length, 0);
  const parts = [`DXF: ${plural(nShapes, 'form', 'former')}, ${nHoles} hull.`];
  const skipped = Object.entries(res.skipped || {});
  if (skipped.length) {
    const total = skipped.reduce((a, [, n]) => a + n, 0);
    parts.push(`Hoppet over ${total} ikke støttede: ${skipped.map(([t, n]) => `${n} ${t}`).join(', ')}.`);
  }
  if (res.openCount) parts.push(`${plural(res.openCount, 'åpen kontur', 'åpne konturer')} lot seg ikke lukke og er ikke importert.`);
  if (res.branched) parts.push(`${plural(res.branched, 'forgreining', 'forgreininger')} i linjene — kontroller konturene.`);
  if (res.dropped) parts.push(`${plural(res.dropped, 'kontur uten areal', 'konturer uten areal')} er utelatt.`);
  if (res.zeroLength) parts.push(`${plural(res.zeroLength, 'linje uten lengde', 'linjer uten lengde')} er ignorert.`);
  const dup = res.duplicates || {};
  if (dup.segments) parts.push(`${plural(dup.segments, 'dobbel linje eller bue', 'doble linjer eller buer')} slått sammen.`);
  if (dup.rings) parts.push(`${plural(dup.rings, 'kontur tegnet to ganger', 'konturer tegnet to ganger')} slått sammen.`);
  if (res.nearDuplicates) {
    parts.push(
      `${plural(res.nearDuplicates, 'par nesten sammenfallende konturer', 'par nesten sammenfallende konturer')}: ` +
        'den minste er utelatt — kontroller tegningen.'
    );
  }
  const islands = res.regions.filter((g) => (g.depth || 0) >= 2).length;
  if (islands) {
    parts.push(
      `${plural(islands, 'form ligger', 'former ligger')} inne i et hull og blir skåret bort av det — ` +
        'øy i hull støttes ikke; koble den til resten av tverrsnittet.'
    );
  }
  if (res.offset) {
    parts.push(
      `Flyttet tegningen med (${fmtNum(-res.offset[0])}; ${fmtNum(-res.offset[1])}) i fila sine enheter til lokalt origo — ` +
        'den lå så langt fra (0, 0) at arealmomentene ellers blir unøyaktige.'
    );
  }
  for (const w of res.warnings || []) parts.push(w);
  return parts.join(' ');
}
