import type { EdgeRef, Project } from '../model/types.js';
import { resolveMeshSettings } from '../model/defaults.js';
import { rebarPolygon, stirrupPolygon } from '../rebar/rebar.js';
import { fingerprintEdgeRef, resolveEdgeRef } from '../geometry/edges.js';
import { polygonArea } from '../geometry/ring.js';
import type { MeshInput, MeshRegionInput } from './types.js';

/**
 * Large sections get a coarser INTERIOR only: boundary and rebar sizes stay as the preset
 * says (that is where the gradients are), the interior size grows with sqrt(area / 0.15 m²),
 * clamped to 1–4×, so the element count stays in the 10–15 000 range. Setting
 * mesh.interiorSize explicitly switches this off.
 */
export function interiorScale(project: Pick<Project, 'regions'>): number {
  const area = project.regions.reduce((s, r) => s + Math.abs(polygonArea(r.polygon)), 0);
  return Math.min(4, Math.max(1, Math.sqrt(area / 150000)));
}

/**
 * Build the mesher input from a project: drawn regions, one circular region per
 * rebar, stirrups only when meshed, and the edges that carry a non-insulated
 * boundary condition as "exposed" (fine mesh).
 */
export function buildMeshInput(project: Project): MeshInput {
  const size = resolveMeshSettings(project.mesh);
  if (project.mesh.interiorSize == null) size.interiorSize *= interiorScale(project);
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
