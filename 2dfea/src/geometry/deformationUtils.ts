/**
 * Deformation Utilities
 *
 * Functions for calculating globally deformed element shapes.
 * Uses deformed element axis (after nodal translations) to correctly
 * orient local deflections in global coordinate system.
 */

import type { Node, AnalysisResults } from '../analysis/types';

export interface DeformedPoint {
  x: number;  // meters (world coordinates)
  y: number;  // meters (world coordinates)
}

/**
 * Calculate the deformed shape of an element in global coordinates.
 *
 * Approach:
 * 1. Get deformed nodal positions (original + DX/DY)
 * 2. Define deformed element axis from deformed nodes
 * 3. Define local coordinate system on deformed element
 * 4. Transform local deflections (dx, dy) to global coordinates
 * 5. Add transformed deflections to base positions
 *
 * @param nodeI - Start node (original position)
 * @param nodeJ - End node (original position)
 * @param analysisResults - Analysis results containing nodal displacements
 * @param deflections_dx - Local axial deflections (mm)
 * @param deflections_dy - Local perpendicular deflections (mm)
 * @param displacementScale - Scale factor for visualization
 * @returns Array of deformed points in global coordinates
 */
export function calculateDeformedElementShape(
  nodeI: Node,
  nodeJ: Node,
  analysisResults: AnalysisResults,
  deflections_dx: number[],
  deflections_dy: number[],
  displacementScale: number
): DeformedPoint[] {
  // Get nodal displacement results
  const resultI = analysisResults.nodes[nodeI.name];
  const resultJ = analysisResults.nodes[nodeJ.name];

  if (!resultI || !resultJ) {
    return [];
  }

  // Step 1: Check ORIGINAL element orientation (before deformation)
  // Calculate angle of element from I to J
  const dx_orig = nodeJ.x - nodeI.x;
  const dy_orig = nodeJ.y - nodeI.y;
  const angleRad = Math.atan2(dy_orig, dx_orig);
  const angleDeg = angleRad * (180 / Math.PI);

  // Flip signs if element points in "backwards" direction
  // >= 90° (pointing upward-left) or <= -90° (pointing downward-left)
  const shouldFlipSigns = angleDeg >= 90 || angleDeg <= -90;

  // Step 2: Calculate deformed node positions (mm to m conversion)
  const defI = {
    x: nodeI.x + resultI.DX / 1000,  // mm to m
    y: nodeI.y + resultI.DY / 1000,  // mm to m
  };

  const defJ = {
    x: nodeJ.x + resultJ.DX / 1000,  // mm to m
    y: nodeJ.y + resultJ.DY / 1000,  // mm to m
  };

  // Step 3: Calculate deformed element axis
  const dx_def = defJ.x - defI.x;
  const dy_def = defJ.y - defI.y;
  const length_def = Math.sqrt(dx_def * dx_def + dy_def * dy_def);

  // Handle degenerate case (element collapsed to a point)
  if (length_def < 1e-10) {
    return [defI, defJ];
  }

  // Step 4: Local coordinate system unit vectors (on deformed element)
  // Local x-axis: along deformed element (I→J direction)
  const ux_local = dx_def / length_def;
  const uy_local = dy_def / length_def;

  // Local y-axis: perpendicular to deformed element (90° CCW from local x)
  const vx_local = -uy_local;
  const vy_local = ux_local;

  // Step 5: Build deformed shape points
  const points: DeformedPoint[] = [];
  const n = deflections_dx.length;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);  // Parameter along element (0 to 1)

    // Base position: interpolate along deformed axis
    const baseX = defI.x + t * dx_def;
    const baseY = defI.y + t * dy_def;

    // Local deflections (mm to m, apply scale)
    const local_dx = (deflections_dx[i] / 1000) * displacementScale;  // Along element

    // Flip dy sign for elements pointing backwards (angle >= 90° or <= -90°)
    const local_dy = (deflections_dy[i] / 1000) * displacementScale * (shouldFlipSigns ? -1 : 1);

    // Step 6: Transform local deflections to global coordinates
    // [Global_X]   [ux_local  vx_local] [local_dx]
    // [Global_Y] = [uy_local  vy_local] [local_dy]
    const global_dx = local_dx * ux_local + local_dy * vx_local;
    const global_dy = local_dx * uy_local + local_dy * vy_local;

    // Final deformed position = base + transformed deflections
    const displX = baseX + global_dx;
    const displY = baseY + global_dy;

    points.push({ x: displX, y: displY });
  }

  return points;
}

/**
 * Calculate the original (undeformed) element shape with intermediate points.
 * Used for comparison with deformed shape.
 *
 * @param nodeI - Start node
 * @param nodeJ - End node
 * @param numPoints - Number of points to generate (default 11)
 * @returns Array of points along original element
 */
export function calculateOriginalElementShape(
  nodeI: Node,
  nodeJ: Node,
  numPoints: number = 11
): DeformedPoint[] {
  const points: DeformedPoint[] = [];
  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    points.push({
      x: nodeI.x + t * dx,
      y: nodeI.y + t * dy,
    });
  }

  return points;
}
