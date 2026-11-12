/**
 * stitch.js — sy løse linjer og buer sammen til ringer, fjerne doble ringer, og
 * nøste ringer i ringer til former med hull.
 *
 * Flyttet fra geometry_workspace/js/dxf.js (#93). Ren matematikk, ingen DOM,
 * ingen importer.
 */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Sammensyingstoleransen er LOKAL: en brøkdel av den korteste av de to
 * stiene som skal møtes. En toleranse som er en brøkdel av hele tegningen,
 * blåses opp av en nordpil eller en tegningsramme langt unna, og syr da
 * sammen hull som er mindre enn toleransen (#86, B1).
 */
export const STITCH_REL = 1e-4;

export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

export function bboxOf(pts) {
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
export class PointGrid {
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

export function samePath(a, b, t) {
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
 * @returns {{rings, open, branched, duplicates, dropped, zeroLength, unused: number[]}}
 *   `unused` er indeksene (i `paths`) til stiene som IKKE havnet i en lukket
 *   ring — åpne kjeder, ringer uten areal og linjer uten lengde. «Lag
 *   geometri» lar dem stå markert.
 */
export function stitchPaths(paths, tol) {
  const fixed = Number.isFinite(tol) && tol > 0 ? tol : null;
  const rings = [];
  const open = [];
  let branched = 0;
  let duplicates = 0;
  let dropped = 0;
  let zeroLength = 0;
  const unused = [];

  const pushRing = (pts, srcs) => {
    const r = cleanRing(pts);
    if (r) rings.push(r);
    else {
      dropped++;
      unused.push(...srcs);
    }
  };

  const loose = [];
  (paths || []).forEach((path, src) => {
    const pts = path.points.map((p) => [p[0], p[1]]);
    const len = pathLength(pts);
    if (!(len > 0)) {
      zeroLength++;
      unused.push(src);
      return;
    }
    const t = fixed ?? STITCH_REL * len;
    if (path.closed || (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= t)) pushRing(pts, [src]);
    else loose.push({ pts, len, src });
  });
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
    const members = [loose[s].src];
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
          members.push(loose[k].src);
          const seg = rev ? loose[k].pts.slice().reverse() : loose[k].pts;
          chain = chain.concat(seg.slice(1));
          last = k;
          grew = true;
          closed = isClosed();
        }
      }
      if (!closed) chain.reverse();
    }
    if (closed) pushRing(chain, members);
    else {
      open.push(chain);
      unused.push(...members);
    }
  }
  return { rings, open, branched, duplicates, dropped, zeroLength, unused: unused.sort((a, b) => a - b) };
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
export function dedupeRings(rings, { near: allowNear = true } = {}) {
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
      } else if (allowNear && close(a.A, b.A, 1e-4) && dc <= 1e-4 * a.diag && inertia) {
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
