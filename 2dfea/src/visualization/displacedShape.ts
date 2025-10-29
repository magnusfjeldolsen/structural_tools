/**
 * Displaced Shape Utilities
 * Calculate displaced positions of nodes and elements
 *
 * Features:
 * - Scale displacements for visibility
 * - Calculate deformed element shapes
 * - Auto-scale based on maximum displacement
 */

import type { Node, NodeResult } from '../analysis/types';

export interface DisplacedNode {
  name: string;
  originalX: number;
  originalY: number;
  displacedX: number;
  displacedY: number;
  dx: number;  // Displacement in X (mm)
  dy: number;  // Displacement in Y (mm)
  rz: number;  // Rotation (rad)
}

/**
 * Calculate displaced positions for all nodes
 *
 * @param nodes - Original node positions
 * @param results - Analysis results with displacements
 * @param scale - Displacement scale factor (multiplier)
 * @returns Array of displaced node data
 */
export function calculateDisplacedNodes(
  nodes: Node[],
  results: Record<string, NodeResult>,
  scale: number
): DisplacedNode[] {
  return nodes.map((node) => {
    const result = results[node.name];
    if (!result) {
      return {
        name: node.name,
        originalX: node.x,
        originalY: node.y,
        displacedX: node.x,
        displacedY: node.y,
        dx: 0,
        dy: 0,
        rz: 0,
      };
    }

    // Convert displacements from mm to meters for world coordinates
    const dx_m = result.DY / 1000; // mm to m
    const dy_m = result.DY / 1000; // mm to m

    return {
      name: node.name,
      originalX: node.x,
      originalY: node.y,
      displacedX: node.x + dx_m * scale,
      displacedY: node.y + dy_m * scale,
      dx: result.DX,
      dy: result.DY,
      rz: result.RZ,
    };
  });
}

/**
 * Auto-calculate displacement scale factor
 * Scale so maximum displacement is visible but not too large
 *
 * @param results - Node results
 * @param elementLength - Typical element length (meters)
 * @param targetRatio - Target displacement as fraction of element length
 * @returns Scale multiplier
 */
export function calculateDisplacementScale(
  results: Record<string, NodeResult>,
  elementLength: number,
  targetRatio: number = 0.1  // 10% of element length
): number {
  // Find maximum displacement (in mm)
  let maxDisp = 0;
  for (const result of Object.values(results)) {
    const disp = Math.sqrt(result.DX ** 2 + result.DY ** 2);
    if (disp > maxDisp) maxDisp = disp;
  }

  if (maxDisp === 0) return 1;

  // Convert to meters
  const maxDisp_m = maxDisp / 1000;

  // Calculate scale so max displacement = targetRatio * elementLength
  const targetDisp_m = elementLength * targetRatio;
  return targetDisp_m / maxDisp_m;
}

/**
 * Get displaced position for a specific node
 */
export function getDisplacedPosition(
  node: Node,
  result: NodeResult,
  scale: number
): { x: number; y: number } {
  const dx_m = result.DX / 1000; // mm to m
  const dy_m = result.DY / 1000; // mm to m

  return {
    x: node.x + dx_m * scale,
    y: node.y + dy_m * scale,
  };
}

/**
 * Interpolate displaced shape along an element
 * For more accurate visualization, we can sample points along the element
 *
 * @param x1, y1 - Start node position (original)
 * @param x2, y2 - End node position (original)
 * @param dx1, dy1, rz1 - Start node displacements & rotation
 * @param dx2, dy2, rz2 - End node displacements & rotation
 * @param numPoints - Number of points to generate
 * @param scale - Displacement scale
 * @returns Array of points along displaced element
 */
export function interpolateDisplacedElement(
  x1: number, y1: number,
  x2: number, y2: number,
  dx1: number, dy1: number, rz1: number,
  dx2: number, dy2: number, rz2: number,
  numPoints: number = 10,
  scale: number = 1
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Element length
  const L = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  // Convert displacements to meters
  const dx1_m = dx1 / 1000 * scale;
  const dy1_m = dy1 / 1000 * scale;
  const dx2_m = dx2 / 1000 * scale;
  const dy2_m = dy2 / 1000 * scale;

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1); // 0 to 1

    // Hermite interpolation for smooth curve
    // Uses displacements and rotations at ends
    const h1 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h2 = -2 * t ** 3 + 3 * t ** 2;
    const h3 = t ** 3 - 2 * t ** 2 + t;
    const h4 = t ** 3 - t ** 2;

    // Original position along element
    const x0 = x1 + t * (x2 - x1);
    const y0 = y1 + t * (y2 - y1);

    // Interpolated displacement
    const dx = h1 * dx1_m + h2 * dx2_m + h3 * rz1 * L + h4 * rz2 * L;
    const dy = h1 * dy1_m + h2 * dy2_m + h3 * rz1 * L + h4 * rz2 * L;

    points.push({
      x: x0 + dx,
      y: y0 + dy,
    });
  }

  return points;
}

/**
 * Format displacement value for display
 */
export function formatDisplacement(value: number): string {
  return `${value.toFixed(3)} mm`;
}
