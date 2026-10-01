import type { Polygon, Ring } from '../model/types.js';
import type { PrimitiveShape } from '../commands/types.js';
import { normalizePolygon } from './ring.js';

/** Default segment count for a circle of radius r (mm): ≈ one segment per 3 mm of arc, 16..128. */
export function circleSegments(r: number): number {
  return Math.min(128, Math.max(16, Math.ceil((2 * Math.PI * r) / 3)));
}

export function circleRing(cx: number, cy: number, r: number, segments?: number, rotationDeg = 0): Ring {
  const n = segments ?? circleSegments(r);
  const ring: Ring = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const t = rot + (2 * Math.PI * i) / n;
    ring.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return ring;
}

export function rectRing(x: number, y: number, w: number, h: number): Ring {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Discretise a primitive shape into a normalised polygon (outer CCW). */
export function primitiveToPolygon(shape: PrimitiveShape): Polygon {
  switch (shape.kind) {
    case 'rect':
      return normalizePolygon({ outer: rectRing(shape.x, shape.y, shape.width, shape.height), holes: [] });
    case 'circle':
      return { outer: circleRing(shape.cx, shape.cy, shape.r, shape.segments), holes: [] };
    case 'ellipse': {
      const n = shape.segments ?? circleSegments(Math.max(shape.rx, shape.ry));
      const ring: Ring = [];
      for (let i = 0; i < n; i++) {
        const t = (2 * Math.PI * i) / n;
        ring.push([shape.cx + shape.rx * Math.cos(t), shape.cy + shape.ry * Math.sin(t)]);
      }
      return { outer: ring, holes: [] };
    }
    case 'regularPolygon':
      return { outer: circleRing(shape.cx, shape.cy, shape.r, Math.max(3, Math.round(shape.n)), shape.rotationDeg ?? 0), holes: [] };
    case 'polygon':
      return normalizePolygon({ outer: shape.points, holes: [] });
    case 'polygonWithHoles':
      return normalizePolygon(shape.polygon);
  }
}
