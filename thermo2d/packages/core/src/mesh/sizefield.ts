/**
 * Size field h(p) in mm: the minimum over all fine "sources" (exposed edges,
 * rebar rings) of h_source + (growth − 1)·distance, capped by interiorSize.
 * Element size therefore grows geometrically by `growth` per element away from
 * the fine features, as spec §9 asks.
 */
import type { Vec2 } from '../model/types.js';
import type { SizeField } from './types.js';
import { SegmentGrid } from './spatial.js';

export interface SizeSource {
  a: Vec2;
  b: Vec2;
  h: number;
}

export class SizeFieldEvaluator {
  private readonly grid: SegmentGrid;
  private readonly hs: number[] = [];
  private readonly reach: number;
  readonly minSize: number;

  constructor(
    readonly size: SizeField,
    sources: SizeSource[],
  ) {
    const g = Math.max(1.05, size.growth);
    this.minSize = Math.min(size.boundarySize, size.rebarSize, size.interiorSize);
    // beyond this distance every source has grown past interiorSize
    this.reach = (size.interiorSize - this.minSize) / (g - 1) + 1;
    this.grid = new SegmentGrid(Math.max(size.interiorSize, 1));
    for (const s of sources) {
      this.grid.add(s.a, s.b);
      this.hs.push(s.h);
    }
  }

  h(x: number, y: number): number {
    const g = Math.max(1.05, this.size.growth);
    let best = this.size.interiorSize;
    const cand = this.grid.candidates(x, y, this.reach);
    for (const i of cand) {
      const seg = this.grid.segs[i];
      const dx = seg.b[0] - seg.a[0];
      const dy = seg.b[1] - seg.a[1];
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - seg.a[0]) * dx + (y - seg.a[1]) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = seg.a[0] + t * dx - x;
      const qy = seg.a[1] + t * dy - y;
      const d = Math.sqrt(qx * qx + qy * qy);
      const v = this.hs[i] + (g - 1) * d;
      if (v < best) best = v;
    }
    return best;
  }
}
