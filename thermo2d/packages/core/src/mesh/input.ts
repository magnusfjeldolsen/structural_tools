import type { EdgeRef, Project } from '../model/types.js';
import { resolveMeshSettings } from '../model/defaults.js';
import { rebarPolygon, stirrupPolygon } from '../rebar/rebar.js';
import { fingerprintEdgeRef, resolveEdgeRef } from '../geometry/edges.js';
import type { MeshInput, MeshRegionInput } from './types.js';

/**
 * Build the mesher input from a project: drawn regions, one circular region per
 * rebar, stirrups only when meshed, and the edges that carry a non-insulated
 * boundary condition as "exposed" (fine mesh).
 */
export function buildMeshInput(project: Project): MeshInput {
  const size = resolveMeshSettings(project.mesh);
  const regions: MeshRegionInput[] = project.regions
    .filter((r) => r.visible !== false)
    .map((r) => ({ id: r.id, polygon: r.polygon, materialId: r.materialId, kind: 'region' as const }));
  for (const bar of project.rebars) {
    regions.push({ id: bar.id, polygon: rebarPolygon(bar, size.rebarSegments), materialId: bar.materialId, kind: 'rebar' });
  }
  if (project.settings.meshStirrups) {
    for (const set of project.rebarSets) {
      if (set.kind !== 'stirrup' || !set.meshed) continue;
      const poly = stirrupPolygon(set, project);
      if (poly) regions.push({ id: set.id, polygon: poly, materialId: set.materialId, kind: 'stirrup' });
    }
  }
  const exposedEdges: EdgeRef[] = [];
  for (const bc of project.boundaryConditions) {
    if (bc.type === 'insulated') continue;
    for (const ref of bc.edgeRefs) {
      const res = resolveEdgeRef(project, ref);
      if (res) exposedEdges.push(fingerprintEdgeRef(res.region, { regionId: res.region.id, ring: res.ring, edgeIndex: res.index }));
    }
  }
  return { regions, exposedEdges, size };
}
