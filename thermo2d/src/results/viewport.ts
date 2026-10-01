/**
 * Pure viewport math for the contour canvas: model (mm, y up) ↔ screen (CSS px, y down).
 * Kept free of DOM so it can be tested.
 */

export interface Viewport {
  /** Screen pixels per mm. */
  scale: number;
  /** Screen position of model origin (CSS px). */
  ox: number;
  oy: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOfNodes(nodes: ArrayLike<number>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nodes.length; i += 2) {
    const x = nodes[i];
    const y = nodes[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Viewport that fits `b` into a width×height box with a margin fraction. */
export function fitViewport(b: Bounds, width: number, height: number, margin = 0.08): Viewport {
  const w = Math.max(b.maxX - b.minX, 1e-9);
  const h = Math.max(b.maxY - b.minY, 1e-9);
  const scale = Math.min((width * (1 - 2 * margin)) / w, (height * (1 - 2 * margin)) / h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { scale, ox: width / 2 - cx * scale, oy: height / 2 + cy * scale };
}

export function toScreen(v: Viewport, x: number, y: number): [number, number] {
  return [v.ox + x * v.scale, v.oy - y * v.scale];
}

export function toModel(v: Viewport, sx: number, sy: number): [number, number] {
  return [(sx - v.ox) / v.scale, (v.oy - sy) / v.scale];
}

/** Zoom by `factor` keeping the screen point (sx, sy) fixed. */
export function zoomAt(v: Viewport, sx: number, sy: number, factor: number, min = 1e-4, max = 1e4): Viewport {
  const scale = Math.max(min, Math.min(max, v.scale * factor));
  const f = scale / v.scale;
  return { scale, ox: sx - (sx - v.ox) * f, oy: sy - (sy - v.oy) * f };
}

export function pan(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, ox: v.ox + dx, oy: v.oy + dy };
}

/** Index of the marker within `radius` screen px of (sx, sy), nearest first; -1 when none. */
export function hitMarker(v: Viewport, markers: { x: number; y: number }[], sx: number, sy: number, radius = 8): number {
  let best = -1;
  let bd = radius * radius;
  for (let i = 0; i < markers.length; i++) {
    const [mx, my] = toScreen(v, markers[i].x, markers[i].y);
    const d = (mx - sx) ** 2 + (my - sy) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Point in triangle (model coords) with a small tolerance; returns barycentric weights or null. */
export function barycentric(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, tol = 1e-9): [number, number, number] | null {
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(det) < 1e-18) return null;
  const l1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / det;
  const l2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / det;
  const l3 = 1 - l1 - l2;
  if (l1 < -tol || l2 < -tol || l3 < -tol) return null;
  return [l1, l2, l3];
}

/** Grid spacing (mm) that gives roughly 60–120 px between grid lines. */
export function niceGridSpacing(scale: number): number {
  const target = 80 / scale;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const r = target / mag;
  return (r < 2 ? 1 : r < 5 ? 2 : 5) * mag;
}
