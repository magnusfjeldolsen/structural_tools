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
 *   stitchPaths(paths, tol) løse linjer/buer sys sammen til ringer
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

/** Deler fila i (gruppekode, verdi)-par. */
function pairs(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) {
      throw new Error(`Ugyldig DXF: forventet en gruppekode på linje ${i + 1}.`);
    }
    out.push([code, lines[i + 1].trim()]);
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

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

function first(groups, code, fallback = 0) {
  const g = groups.find((x) => x[0] === code);
  return g ? num(g[1]) : fallback;
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
      for (const [c, v] of groups) {
        if (c === 10) verts.push({ p: [sign * num(v), 0], bulge: 0, hasY: false });
        else if (c === 20 && verts.length && !verts[verts.length - 1].hasY) {
          verts[verts.length - 1].p[1] = num(v);
          verts[verts.length - 1].hasY = true;
        } else if (c === 42 && verts.length) verts[verts.length - 1].bulge = sign * num(v);
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

/** Fjerner punkt som ligger oppå forrige (innenfor tol), og et lukkende duplikat. */
function dedupe(points, tol) {
  const out = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > tol) out.push([p[0], p[1]]);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= tol) out.pop();
  return out;
}

function ringArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Diagonalen i utstrekningen til alle punktene — skala for standardtoleransen. */
export function extentOf(paths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of paths) {
    for (const [x, y] of path.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0;
}

/**
 * Syr åpne stier sammen ende mot ende (innenfor `tol`) til lukkede ringer.
 * Lukkede stier er ringer fra før. Grådig: fra en sti forlenges enden med den
 * første ledige stien som starter eller slutter der, til kjeden lukker seg
 * eller stopper. Møtes flere stier i samme punkt (forgrening), meldes det.
 *
 * @returns {{rings: Array<Array<[number,number]>>, open: Array<Array<[number,number]>>, branched: number}}
 */
export function stitchPaths(paths, tol) {
  const rings = [];
  const open = [];
  let branched = 0;
  const loose = [];
  for (const path of paths || []) {
    const pts = path.points.map((p) => [p[0], p[1]]);
    if (path.closed || (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= tol)) {
      const r = dedupe(pts, tol);
      if (r.length >= 3) rings.push(r);
    } else if (pts.length >= 2) {
      loose.push(pts);
    }
  }

  const used = new Array(loose.length).fill(false);
  for (let s = 0; s < loose.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    let chain = loose[s].slice();
    let closed = dist(chain[0], chain[chain.length - 1]) <= tol && chain.length > 2;
    // Forleng i enden; når det stopper, snu og forleng den andre enden.
    for (let pass = 0; pass < 2 && !closed; pass++) {
      let grew = true;
      while (grew && !closed) {
        grew = false;
        const end = chain[chain.length - 1];
        const hits = [];
        for (let k = 0; k < loose.length; k++) {
          if (used[k]) continue;
          const c = loose[k];
          if (dist(c[0], end) <= tol) hits.push([k, false]);
          else if (dist(c[c.length - 1], end) <= tol) hits.push([k, true]);
        }
        if (hits.length > 1) branched++;
        if (hits.length) {
          const [k, rev] = hits[0];
          used[k] = true;
          const seg = rev ? loose[k].slice().reverse() : loose[k];
          chain = chain.concat(seg.slice(1));
          grew = true;
          closed = dist(chain[0], chain[chain.length - 1]) <= tol && chain.length > 2;
        }
      }
      if (!closed) chain.reverse();
    }
    if (closed) {
      const r = dedupe(chain, tol);
      if (r.length >= 3) rings.push(r);
      else open.push(chain);
    } else {
      open.push(chain);
    }
  }
  // Ringer uten areal (en linje fram og tilbake) er ikke konturer.
  const scale = tol > 0 ? tol : 1e-9;
  return {
    rings: rings.filter((r) => Math.abs(ringArea(r)) > scale * scale),
    open,
    branched,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Hull: ringer inni ringer
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

/**
 * Ordner ringene etter hvor dypt de ligger. Dybde 0, 2, 4 … er materiale,
 * 1, 3 … er hull i ringen rett utenfor. Et massivt stykke inni et hull blir
 * en egen region.
 *
 * Alle ringene returneres mot klokka (positivt areal); det er formenes
 * `role`, ikke omløpsretningen, som sier hva som er hull i workspacet.
 *
 * @returns {Array<{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>}>}
 */
export function nestRings(rings) {
  const items = (rings || [])
    .map((r) => {
      const A = ringArea(r);
      return { ring: A < 0 ? r.slice().reverse() : r.slice(), area: Math.abs(A) };
    })
    .sort((a, b) => b.area - a.area);
  for (let i = 0; i < items.length; i++) {
    items[i].parent = -1;
    // Minste ring som inneholder denne = den nærmeste forelderen. Lista er
    // sortert synkende, så den siste treffen før i er den minste.
    for (let j = 0; j < i; j++) {
      if (items[j].area > items[i].area && ringInside(items[i].ring, items[j].ring)) items[i].parent = j;
    }
  }
  const depth = (i) => (items[i].parent < 0 ? 0 : 1 + depth(items[i].parent));
  const regions = [];
  const regionOf = new Map();
  items.forEach((it, i) => {
    if (depth(i) % 2 === 0) {
      regionOf.set(i, regions.length);
      regions.push({ outer: it.ring, holes: [] });
    }
  });
  items.forEach((it, i) => {
    if (depth(i) % 2 === 1) regions[regionOf.get(it.parent)].holes.push(it.ring);
  });
  return regions;
}

/* ------------------------------------------------------------------ *
 * Alt i ett
 * ------------------------------------------------------------------ */

/**
 * @param {string} text  ASCII-DXF
 * @param {{scale?: number, segments?: number, tol?: number}} opts
 *   scale    — ganges på alle koordinater (DXF-enhet → arbeidsenhet)
 *   tol      — sammensyingstoleranse i DXF-enheter; standard 1e-5 av diagonalen
 * @returns {{
 *   regions: Array<{outer, holes}>,  // i arbeidsenheten
 *   skipped: Record<string, number>,
 *   openCount: number,               // kjeder som ikke lot seg lukke
 *   branched: number,
 *   insunits: number|null,
 *   entityCount: number,
 *   warnings: string[],
 * }}
 */
export function importDxf(text, { scale = 1, segments = DEFAULT_SEGMENTS, tol } = {}) {
  const parsed = parseDxf(text);
  const paths = entitiesToPaths(parsed.entities, { segments });
  const t = Number.isFinite(tol) && tol > 0 ? tol : Math.max(extentOf(paths) * 1e-5, 1e-9);
  const stitched = stitchPaths(paths, t);
  const regions = nestRings(stitched.rings).map((r) => ({
    outer: r.outer.map(([x, y]) => [x * scale, y * scale]),
    holes: r.holes.map((h) => h.map(([x, y]) => [x * scale, y * scale])),
  }));
  return {
    regions,
    skipped: parsed.skipped,
    openCount: stitched.open.length,
    branched: stitched.branched,
    insunits: parsed.insunits,
    entityCount: parsed.entities.length,
    warnings: parsed.warnings,
  };
}

/** Én linje til brukeren om hva som ble importert og hva som ikke ble det. */
export function describeImport(res) {
  const nShapes = res.regions.length;
  const nHoles = res.regions.reduce((a, r) => a + r.holes.length, 0);
  const parts = [`DXF: ${nShapes} ${nShapes === 1 ? 'form' : 'former'}, ${nHoles} hull.`];
  const skipped = Object.entries(res.skipped || {});
  if (skipped.length) {
    const total = skipped.reduce((a, [, n]) => a + n, 0);
    parts.push(`Hoppet over ${total} ikke støttede: ${skipped.map(([t, n]) => `${n} ${t}`).join(', ')}.`);
  }
  if (res.openCount) {
    parts.push(`${res.openCount} åpen${res.openCount === 1 ? '' : 'e'} kontur${res.openCount === 1 ? '' : 'er'} lot seg ikke lukke og er ikke importert.`);
  }
  if (res.branched) parts.push(`${res.branched} forgreining${res.branched === 1 ? '' : 'er'} i linjene — kontroller konturene.`);
  return parts.join(' ');
}
