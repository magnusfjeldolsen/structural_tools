/**
 * Structured rectangle mesh for solver tests and the bench. Produces a real `Mesh`
 * (mm coordinates, CCW triangles, boundary segments with EdgeRefs on a CCW outer
 * ring starting at the bottom-left corner: edge 0 = bottom, 1 = right, 2 = top, 3 = left).
 */
import type { BoundarySegment, Mesh, MeshRegionInfo } from '../../src/mesh/types.js';

export interface GridMeshOptions {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  nx: number;
  ny: number;
  /** Region id per element centroid (default 'r'). */
  regionOf?: (x: number, y: number) => string;
  /** Material id per region id (default: same as region id). */
  materialOf?: (regionId: string) => string | null;
  /** 'diagonal' (one diagonal), 'alternate' (union-jack parity), 'cross' (4 triangles with a centre node, fully symmetric). */
  pattern?: 'diagonal' | 'alternate' | 'cross';
  /** Region id used for the boundary EdgeRefs (default: first region). */
  boundaryRegionId?: string;
}

export function gridMesh(o: GridMeshOptions): Mesh {
  const { x0, x1, y0, y1, nx, ny } = o;
  const pattern = o.pattern ?? 'alternate';
  const regionOf = o.regionOf ?? (() => 'r');
  const materialOf = o.materialOf ?? ((id: string) => id);
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  const nGrid = (nx + 1) * (ny + 1);
  const nCentre = pattern === 'cross' ? nx * ny : 0;
  const nodes = new Float64Array(2 * (nGrid + nCentre));
  const id = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      nodes[2 * id(i, j)] = x0 + i * dx;
      nodes[2 * id(i, j) + 1] = y0 + j * dy;
    }
  const tris: number[] = [];
  const regionIds: string[] = [];
  const regionIndex = new Map<string, number>();
  const elemRegion: number[] = [];
  const regionOfIndex = (x: number, y: number): number => {
    const r = regionOf(x, y);
    let k = regionIndex.get(r);
    if (k === undefined) {
      k = regionIds.length;
      regionIds.push(r);
      regionIndex.set(r, k);
    }
    return k;
  };
  const push = (a: number, b: number, c: number) => {
    tris.push(a, b, c);
    const cx = (nodes[2 * a] + nodes[2 * b] + nodes[2 * c]) / 3;
    const cy = (nodes[2 * a + 1] + nodes[2 * b + 1] + nodes[2 * c + 1]) / 3;
    elemRegion.push(regionOfIndex(cx, cy));
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      if (pattern === 'cross') {
        const m = nGrid + j * nx + i;
        nodes[2 * m] = x0 + (i + 0.5) * dx;
        nodes[2 * m + 1] = y0 + (j + 0.5) * dy;
        push(a, b, m);
        push(b, c, m);
        push(c, d, m);
        push(d, a, m);
      } else if (pattern === 'alternate' && (i + j) % 2 === 1) {
        push(a, b, d);
        push(b, c, d);
      } else {
        push(a, b, c);
        push(a, c, d);
      }
    }
  const brId = o.boundaryRegionId ?? regionIds[0];
  const boundary: BoundarySegment[] = [];
  const regionIdx = regionIndex.get(brId) ?? 0;
  const seg = (a: number, b: number, edgeIndex: number) =>
    boundary.push({ a, b, regionIndex: regionIdx, edgeRef: { regionId: brId, ring: 0, edgeIndex } });
  for (let i = 0; i < nx; i++) seg(id(i, 0), id(i + 1, 0), 0);
  for (let j = 0; j < ny; j++) seg(id(nx, j), id(nx, j + 1), 1);
  for (let i = nx; i > 0; i--) seg(id(i, ny), id(i - 1, ny), 2);
  for (let j = ny; j > 0; j--) seg(id(0, j), id(0, j - 1), 3);
  const triangles = Uint32Array.from(tris);
  const elementRegion = Int32Array.from(elemRegion);
  const regions: MeshRegionInfo[] = regionIds.map((rid, k) => {
    let count = 0, area = 0;
    for (let e = 0; e < elementRegion.length; e++) {
      if (elementRegion[e] !== k) continue;
      count++;
      const a = triangles[3 * e], b = triangles[3 * e + 1], c = triangles[3 * e + 2];
      area += 0.5 * Math.abs((nodes[2 * b] - nodes[2 * a]) * (nodes[2 * c + 1] - nodes[2 * a + 1]) - (nodes[2 * c] - nodes[2 * a]) * (nodes[2 * b + 1] - nodes[2 * a + 1]));
    }
    return { id: rid, materialId: materialOf(rid), kind: 'region', elementCount: count, area };
  });
  return {
    nodes,
    triangles,
    elementRegion,
    regions,
    boundary,
    stats: {
      nodeCount: nodes.length / 2,
      elementCount: triangles.length / 3,
      minAngleDeg: pattern === 'cross' ? 45 : Math.min(45, (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI),
      minEdge: Math.min(dx, dy),
      maxEdge: Math.hypot(dx, dy),
      poorElements: 0,
    },
    warnings: [],
  };
}
