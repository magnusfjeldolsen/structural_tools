/**
 * linework.js — linjearbeid (#86): løse linjer og polylinjer som ikke er
 * geometri, men noe man lager geometri AV. Kommer fra DXF-import («Bare
 * linjer») eller fra linjeverktøyet.
 *
 * En linje er `{ id, points: [[x,y], ...], closed: boolean }`. Den teller ikke
 * i noe areal. «Lag geometri» / «Lag hull» syr de markerte linjene sammen til
 * lukkede konturer og gjør HVER kontur til én form — uten nøsting, også om den
 * ligger inni en annen. Brukeren sletter selv det som ble dobbelt.
 *
 * Ren geometri, ingen DOM, ingen store.
 */

import { stitchPaths } from './stitch.js';

/** Segmentene i en linje, som [a, b]-par. */
export function segmentsOf(line) {
  const pts = line.points || [];
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
  if (line.closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

/** Korteste avstand fra et punkt til linja. */
export function distanceToLine(pt, line) {
  let best = Infinity;
  for (const [a, b] of segmentsOf(line)) {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(pt[0] - (a[0] + vx * t), pt[1] - (a[1] + vy * t));
    if (d < best) best = d;
  }
  if (!Number.isFinite(best) && line.points && line.points.length) {
    best = Math.hypot(pt[0] - line.points[0][0], pt[1] - line.points[0][1]);
  }
  return best;
}

/** Nærmeste linje innenfor `tol`, eller null. Linjer bakerst i lista vinner ikke over de foran. */
export function pickLine(pt, lines, tol) {
  let best = null;
  let bestD = tol;
  for (const l of lines || []) {
    const d = distanceToLine(pt, l);
    if (d <= bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

const inBox = ([x, y], b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0);
}

/**
 * Vindu: linja ligger HELT inne i boksen (alle punkt).
 * Crossing: linja berører boksen (et punkt inne, eller et segment krysser en kant).
 */
export function lineInBox(line, box, crossing = false) {
  const pts = line.points || [];
  if (!crossing) return pts.length > 0 && pts.every((p) => inBox(p, box));
  if (pts.some((p) => inBox(p, box))) return true;
  const c = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]];
  const edges = [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]];
  return segmentsOf(line).some(([a, b]) => edges.some(([e, f]) => segmentsCross(a, b, e, f)));
}

/** Boksen mellom to hjørner, og om den er dratt høyre→venstre (crossing). */
export function boxFromDrag(start, end) {
  return {
    minX: Math.min(start[0], end[0]),
    maxX: Math.max(start[0], end[0]),
    minY: Math.min(start[1], end[1]),
    maxY: Math.max(start[1], end[1]),
    crossing: end[0] < start[0],
  };
}

/**
 * Lukkede konturer av linjene. Hver kontur blir én ring (mot klokka); ingen
 * nøsting. `unusedIds` er linjene som ikke inngikk i noen lukket kontur.
 *
 * @param {Array<{id, points, closed}>} lines
 * @returns {{rings: Array<Array<[number,number]>>, unusedIds: string[], duplicates: number}}
 */
export function contoursFromLines(lines) {
  const list = lines || [];
  const st = stitchPaths(list.map((l) => ({ points: l.points, closed: !!l.closed })));
  const rings = st.rings.map((r) => {
    let s = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s < 0 ? r.slice().reverse() : r;
  });
  return { rings, unusedIds: st.unused.map((i) => list[i].id), duplicates: st.duplicates };
}
