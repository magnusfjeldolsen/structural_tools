/** Small uniform-grid spatial hashes for points and segments (mm). Deterministic. */
import type { Vec2 } from '../model/types.js';

export class PointGrid {
  private cells = new Map<string, number[]>();
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  constructor(private readonly cell: number) {}

  private key(ix: number, iy: number): string {
    return `${ix},${iy}`;
  }

  add(x: number, y: number): number {
    const i = this.xs.length;
    this.xs.push(x);
    this.ys.push(y);
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const arr = this.cells.get(k);
    if (arr) arr.push(i);
    else this.cells.set(k, [i]);
    return i;
  }

  /** Squared distance to the nearest stored point within radius r (Infinity if none). */
  nearestDist2(x: number, y: number, r: number): number {
    const c = this.cell;
    const ix0 = Math.floor((x - r) / c);
    const ix1 = Math.floor((x + r) / c);
    const iy0 = Math.floor((y - r) / c);
    const iy1 = Math.floor((y + r) / c);
    let best = Infinity;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const arr = this.cells.get(this.key(ix, iy));
        if (!arr) continue;
        for (const i of arr) {
          const dx = this.xs[i] - x;
          const dy = this.ys[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) best = d2;
        }
      }
    }
    return best;
  }

  /** Indices of stored points within radius r. */
  within(x: number, y: number, r: number): number[] {
    const c = this.cell;
    const out: number[] = [];
    const r2 = r * r;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iy = Math.floor((y - r) / c); iy <= Math.floor((y + r) / c); iy++) {
        const arr = this.cells.get(this.key(ix, iy));
        if (!arr) continue;
        for (const i of arr) {
          const dx = this.xs[i] - x;
          const dy = this.ys[i] - y;
          if (dx * dx + dy * dy <= r2) out.push(i);
        }
      }
    }
    return out;
  }
}

export interface Seg {
  a: Vec2;
  b: Vec2;
}

export class SegmentGrid {
  private cells = new Map<string, number[]>();
  readonly segs: Seg[] = [];
  constructor(private readonly cell: number) {}

  add(a: Vec2, b: Vec2): number {
    const i = this.segs.length;
    this.segs.push({ a, b });
    const c = this.cell;
    for (let ix = Math.floor(Math.min(a[0], b[0]) / c); ix <= Math.floor(Math.max(a[0], b[0]) / c); ix++) {
      for (let iy = Math.floor(Math.min(a[1], b[1]) / c); iy <= Math.floor(Math.max(a[1], b[1]) / c); iy++) {
        const k = `${ix},${iy}`;
        const arr = this.cells.get(k);
        if (arr) arr.push(i);
        else this.cells.set(k, [i]);
      }
    }
    return i;
  }

  /** Nearest distance from (x,y) to any segment within radius r (Infinity if none). */
  nearestDist(x: number, y: number, r: number): number {
    const c = this.cell;
    let best = Infinity;
    const seen = new Set<number>();
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iy = Math.floor((y - r) / c); iy <= Math.floor((y + r) / c); iy++) {
        const arr = this.cells.get(`${ix},${iy}`);
        if (!arr) continue;
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          const d = distPointSeg(x, y, this.segs[i]);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  /** Segment indices whose bbox (expanded by r) contains the point. */
  candidates(x: number, y: number, r: number): number[] {
    const c = this.cell;
    const out = new Set<number>();
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iy = Math.floor((y - r) / c); iy <= Math.floor((y + r) / c); iy++) {
        const arr = this.cells.get(`${ix},${iy}`);
        if (arr) for (const i of arr) out.add(i);
      }
    }
    return [...out];
  }
}

export function distPointSeg(x: number, y: number, s: Seg): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((x - s.a[0]) * dx + (y - s.a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = s.a[0] + t * dx - x;
  const qy = s.a[1] + t * dy - y;
  return Math.sqrt(qx * qx + qy * qy);
}
