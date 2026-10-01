/**
 * Polygon booleans on top of `polygon-clipping` (Martinez–Rueda, MIT).
 * Our rings are open; polygon-clipping accepts open or closed rings and returns
 * closed rings, outer CCW / holes CW. We normalise on the way out anyway.
 */
import polygonClipping from 'polygon-clipping';
import type { Polygon, Ring, Vec2 } from '../model/types.js';
import { normalizePolygon, ringArea } from './ring.js';

type PcRing = [number, number][];
type PcPolygon = PcRing[];
type PcMulti = PcPolygon[];

export type BooleanOpKind = 'union' | 'subtract' | 'intersect' | 'xor';

function toPc(p: Polygon): PcPolygon {
  const close = (r: Ring): PcRing => (r.length ? [...r.map((q) => [q[0], q[1]] as [number, number]), [r[0][0], r[0][1]]] : []);
  return [close(p.outer), ...p.holes.map(close)];
}

function fromPc(m: PcMulti): Polygon[] {
  const out: Polygon[] = [];
  for (const poly of m) {
    if (!poly.length || poly[0].length < 3) continue;
    const rings = poly.map((r) => {
      const ring: Ring = r.map((q) => [q[0], q[1]] as Vec2);
      if (ring.length > 1) {
        const a = ring[0];
        const b = ring[ring.length - 1];
        if (a[0] === b[0] && a[1] === b[1]) ring.pop();
      }
      return ring;
    });
    const p = normalizePolygon({ outer: rings[0], holes: rings.slice(1).filter((h) => h.length >= 3) });
    if (p.outer.length >= 3 && Math.abs(ringArea(p.outer)) > 1e-9) out.push(p);
  }
  return out;
}

/** Boolean operation between two sets of polygons. Result polygons are normalised (outer CCW, holes CW). */
export function booleanOp(op: BooleanOpKind, subject: Polygon[], clip: Polygon[]): Polygon[] {
  const s: PcMulti = subject.map(toPc);
  const c: PcMulti = clip.map(toPc);
  if (s.length === 0) return op === 'union' || op === 'xor' ? fromPc(polygonClipping.union(c.length ? c : [[]])) : [];
  let r: PcMulti;
  switch (op) {
    case 'union':
      r = c.length ? polygonClipping.union(s, c) : polygonClipping.union(s);
      break;
    case 'subtract':
      r = c.length ? polygonClipping.difference(s, c) : polygonClipping.union(s);
      break;
    case 'intersect':
      r = c.length ? polygonClipping.intersection(s, c) : [];
      break;
    case 'xor':
      r = c.length ? polygonClipping.xor(s, c) : polygonClipping.union(s);
      break;
  }
  return fromPc(r);
}

/** Union of a list of polygons (self-union cleans a single polygon too). */
export function unionAll(polys: Polygon[]): Polygon[] {
  if (polys.length === 0) return [];
  return fromPc(polygonClipping.union(polys.map(toPc)));
}
