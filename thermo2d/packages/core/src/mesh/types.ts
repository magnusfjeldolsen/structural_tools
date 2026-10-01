/**
 * Mesher contract. `mesh(input)` is the single entry point; the implementation
 * behind it (size-field point placement + constrained Delaunay + smoothing today,
 * anything else tomorrow) can be replaced without touching the rest of the app.
 */
import type { EdgeRef, Polygon, Vec2 } from '../model/types.js';

export type MeshRegionKind = 'region' | 'rebar' | 'stirrup';

export interface MeshRegionInput {
  id: string;
  polygon: Polygon;
  materialId: string | null;
  kind: MeshRegionKind;
}

/** Resolved size field, mm. All fields required (defaults applied by resolveMeshSettings). */
export interface SizeField {
  boundarySize: number;
  interiorSize: number;
  growth: number;
  rebarSize: number;
  rebarSegments: number;
  minAngle: number;
  maxElements: number;
}

export interface MeshInput {
  regions: MeshRegionInput[];
  /** Edges that carry a non-insulated boundary condition; these get the fine boundary size. */
  exposedEdges: EdgeRef[];
  size: SizeField;
}

/** An exterior mesh edge (belongs to exactly one triangle) with its source edge. */
export interface BoundarySegment {
  /** Node indices; the segment runs a→b with the region on the LEFT (CCW outer ring). */
  a: number;
  b: number;
  /** Index into Mesh.regions. */
  regionIndex: number;
  edgeRef: EdgeRef;
}

export interface MeshRegionInfo {
  id: string;
  materialId: string | null;
  kind: MeshRegionKind;
  elementCount: number;
  area: number;
}

export interface MeshStats {
  nodeCount: number;
  elementCount: number;
  minAngleDeg: number;
  minEdge: number;
  maxEdge: number;
  /** Elements below the target min angle. */
  poorElements: number;
}

export interface MeshWarning {
  code: string;
  message: string;
  regionId?: string;
  point?: Vec2;
}

export interface Mesh {
  /** Node coordinates in mm, interleaved x0,y0,x1,y1,... */
  nodes: Float64Array;
  /** Triangle node indices, 3 per element, counter-clockwise. */
  triangles: Uint32Array;
  /** Region index per element (into `regions`). */
  elementRegion: Int32Array;
  regions: MeshRegionInfo[];
  boundary: BoundarySegment[];
  stats: MeshStats;
  warnings: MeshWarning[];
}

export type MeshErrorCode =
  | 'self-intersection'
  | 'zero-area'
  | 'tiny-edge'
  | 'overlap'
  | 'hole-outside'
  | 'unrefinable'
  | 'too-many-elements'
  | 'empty'
  | 'internal';

export class MeshError extends Error {
  constructor(
    public readonly code: MeshErrorCode,
    message: string,
    public readonly detail: { regionId?: string; ring?: number; edgeIndex?: number; point?: Vec2; hint?: string } = {},
  ) {
    super(message);
    this.name = 'MeshError';
  }
}

/** Stable key for an edge reference, used to map boundary segments to boundary conditions. */
export function edgeKey(ref: EdgeRef): string {
  return `${ref.regionId}/${ref.ring}/${ref.edgeIndex}`;
}
