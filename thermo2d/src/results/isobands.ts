/**
 * Exact isoband fill for linear triangles.
 *
 * The temperature varies linearly inside each element, so the region where
 * lo ≤ θ < hi is a convex polygon that we get exactly by clipping the triangle
 * against the two half-planes θ ≥ lo and θ < hi (Sutherland–Hodgman in value
 * space). One Path2D per band, built once in MODEL coordinates (mm) and drawn
 * with a canvas transform, so panning and zooming never rebuild the geometry.
 */

export interface BandPolygon {
  band: number;
  /** Flat x0,y0,x1,y1,... in model coordinates. */
  poly: number[];
}

interface ClipVertex {
  x: number;
  y: number;
  v: number;
}

/** Keep the part of a convex polygon where `keepAbove ? v >= t : v <= t`. Exact for a linear field. */
function clipByValue(input: ClipVertex[], t: number, keepAbove: boolean): ClipVertex[] {
  const out: ClipVertex[] = [];
  const n = input.length;
  if (n === 0) return out;
  const inside = (p: ClipVertex) => (keepAbove ? p.v >= t : p.v <= t);
  for (let i = 0; i < n; i++) {
    const cur = input[i];
    const prev = input[(i + n - 1) % n];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur, t));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur, t));
    }
  }
  return out;
}

function intersect(a: ClipVertex, b: ClipVertex, t: number): ClipVertex {
  const dv = b.v - a.v;
  const f = dv === 0 ? 0 : (t - a.v) / dv;
  const g = f < 0 ? 0 : f > 1 ? 1 : f;
  return { x: a.x + (b.x - a.x) * g, y: a.y + (b.y - a.y) * g, v: t };
}

/**
 * Split one triangle into its band polygons. `edges` are the band boundaries
 * (n + 1 values, ascending); band 0 extends to −∞ and band n−1 to +∞ so every
 * point of the triangle lands in exactly one band. Degenerate (zero-area)
 * pieces are dropped; vertices exactly on a boundary belong to the band above.
 */
export function triangleBandPolygons(
  xa: number, ya: number, va: number,
  xb: number, yb: number, vb: number,
  xc: number, yc: number, vc: number,
  edges: number[],
): BandPolygon[] {
  const nBands = edges.length - 1;
  const out: BandPolygon[] = [];
  if (nBands < 1) return out;
  if (!Number.isFinite(va) || !Number.isFinite(vb) || !Number.isFinite(vc)) return out;
  const vmin = Math.min(va, vb, vc);
  const vmax = Math.max(va, vb, vc);
  const tri: ClipVertex[] = [
    { x: xa, y: ya, v: va },
    { x: xb, y: yb, v: vb },
    { x: xc, y: yc, v: vc },
  ];
  // Band index range that the triangle touches.
  let first = 0;
  while (first < nBands - 1 && edges[first + 1] <= vmin) first++;
  let last = nBands - 1;
  while (last > 0 && edges[last] > vmax) last--;
  if (first === last) {
    out.push({ band: first, poly: [xa, ya, xb, yb, xc, yc] });
    return out;
  }
  for (let b = first; b <= last; b++) {
    let poly = tri;
    if (b > 0) poly = clipByValue(poly, edges[b], true);
    if (b < nBands - 1 && poly.length) poly = clipByValue(poly, edges[b + 1], false);
    if (poly.length < 3) continue;
    const flat: number[] = [];
    for (const p of poly) flat.push(p.x, p.y);
    if (Math.abs(polyArea(flat)) < 1e-9) continue;
    out.push({ band: b, poly: flat });
  }
  return out;
}

export function polyArea(flat: number[]): number {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += flat[2 * i] * flat[2 * j + 1] - flat[2 * j] * flat[2 * i + 1];
  }
  return a / 2;
}

/** Band boundaries for the temperature scale: min, min+step, …, max (n + 1 values). */
export function temperatureEdges(min: number, max: number, step: number): number[] {
  const n = Math.max(1, Math.round((max - min) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(min + i * step);
  return out;
}

/** Band boundaries for a symmetric diverging scale with n bands over [−limit, limit]. */
export function divergingEdges(limit: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(-limit + (2 * limit * i) / n);
  return out;
}

/**
 * Build one Path2D per band for the whole mesh, in model coordinates.
 * `mode` 'isobands' clips every triangle exactly; 'element' fills whole
 * triangles by the band of their mean value (the old look, kept as an option).
 */
export function buildBandPaths(nodes: Float64Array, triangles: Uint32Array, field: ArrayLike<number>, edges: number[], mode: 'isobands' | 'element'): Path2D[] {
  const nBands = Math.max(1, edges.length - 1);
  const paths: Path2D[] = [];
  for (let i = 0; i < nBands; i++) paths.push(new Path2D());
  const m = triangles.length / 3;
  const bandOf = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    let b = 0;
    while (b < nBands - 1 && edges[b + 1] <= v) b++;
    return b;
  };
  for (let e = 0; e < m; e++) {
    const a = triangles[3 * e];
    const b = triangles[3 * e + 1];
    const c = triangles[3 * e + 2];
    const xa = nodes[2 * a], ya = nodes[2 * a + 1];
    const xb = nodes[2 * b], yb = nodes[2 * b + 1];
    const xc = nodes[2 * c], yc = nodes[2 * c + 1];
    if (mode === 'element') {
      const p = paths[bandOf((field[a] + field[b] + field[c]) / 3)];
      p.moveTo(xa, ya);
      p.lineTo(xb, yb);
      p.lineTo(xc, yc);
      p.closePath();
      continue;
    }
    for (const bp of triangleBandPolygons(xa, ya, field[a], xb, yb, field[b], xc, yc, field[c], edges)) {
      const p = paths[bp.band];
      const f = bp.poly;
      p.moveTo(f[0], f[1]);
      for (let i = 2; i < f.length; i += 2) p.lineTo(f[i], f[i + 1]);
      p.closePath();
    }
  }
  return paths;
}
