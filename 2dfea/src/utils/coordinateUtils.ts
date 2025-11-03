/**
 * Coordinate System Utilities
 *
 * Handles conversion between local and global coordinate systems for member loads.
 * Direction string case encodes the system:
 * - Lowercase (Fx, Fy, Fz, Mx, My, Mz) = local member coordinate system
 * - Uppercase (FX, FY, FZ, MX, MY, MZ) = global coordinate system
 */

import type { Node, Element } from '../analysis/types';

/**
 * Check if a direction string represents a local coordinate system load
 * @param direction Direction string (e.g., 'Fx', 'FX', 'fy', 'FY')
 * @returns true if local (lowercase first letter), false if global (uppercase)
 */
export function isLocalDirection(direction: string): boolean {
  if (direction.length === 0) return false;
  return direction[0] === direction[0].toLowerCase();
}

/**
 * Get the base direction (without case consideration)
 * @param direction Direction string (e.g., 'Fx' or 'FX')
 * @returns Base direction in lowercase (e.g., 'fx')
 */
export function getBaseDirection(direction: string): string {
  return direction.toLowerCase();
}

/**
 * Convert a local member direction to global coordinate direction
 * @param direction Local direction (e.g., 'Fx', 'Fy', 'Mx', 'My')
 * @param element Element object with nodeI and nodeJ references
 * @param nodes Array of all nodes to find nodeI and nodeJ
 * @returns Global direction (e.g., 'FX', 'FY', 'MX', 'MY') and angle for magnitude rotation
 */
export function convertLocalDirectionToGlobal(
  direction: string,
  element: Element,
  nodes: Node[]
): { globalDirection: string; angle: number } {
  // Get element nodes
  const nodeI = nodes.find(n => n.name === element.nodeI);
  const nodeJ = nodes.find(n => n.name === element.nodeJ);

  if (!nodeI || !nodeJ) {
    console.warn(`[coordinateUtils] Could not find nodes for element ${element.name}`);
    return { globalDirection: direction.toUpperCase(), angle: 0 };
  }

  // Calculate element angle in global coordinates
  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  const angle = Math.atan2(dy, dx);

  // Get base direction (e.g., 'fx' from 'Fx')
  const baseDir = getBaseDirection(direction);

  // For 2D analysis, only handle Fx, Fy (and moments if applicable)
  // Fz is not typically used in 2D frame analysis
  let globalDirection: string;

  if (baseDir === 'fx') {
    // Local x-axis is along element; rotate to get global direction
    const globalAngle = angle;
    const cos = Math.cos(globalAngle);
    const sin = Math.sin(globalAngle);

    // Determine which global direction this load points toward
    // fx along element means: if mostly horizontal, it's FX; if mostly vertical, it's FY
    if (Math.abs(cos) > Math.abs(sin)) {
      globalDirection = cos > 0 ? 'FX' : 'FX'; // Both directions collapse to FX (magnitude handles sign)
    } else {
      globalDirection = sin > 0 ? 'FY' : 'FY'; // Both directions collapse to FY
    }
  } else if (baseDir === 'fy') {
    // Local y-axis is perpendicular to element
    const perpAngle = angle + Math.PI / 2; // 90 degrees counterclockwise
    const cos = Math.cos(perpAngle);
    const sin = Math.sin(perpAngle);

    if (Math.abs(cos) > Math.abs(sin)) {
      globalDirection = cos > 0 ? 'FX' : 'FX';
    } else {
      globalDirection = sin > 0 ? 'FY' : 'FY';
    }
  } else if (baseDir === 'fz') {
    globalDirection = 'FZ';
  } else if (baseDir === 'mx') {
    globalDirection = 'MX';
  } else if (baseDir === 'my') {
    globalDirection = 'MY';
  } else if (baseDir === 'mz') {
    globalDirection = 'MZ';
  } else {
    // Fallback: just uppercase
    globalDirection = direction.toUpperCase();
  }

  return { globalDirection, angle };
}

/**
 * Convert local magnitude to global with proper rotation
 * For 2D frame analysis:
 * - Load magnitude along local x: scales by cos(element_angle)
 * - Load magnitude along local y: scales by sin(element_angle)
 */
export function convertLocalMagnitudeToGlobal(
  magnitude: number,
  direction: string,
  element: Element,
  nodes: Node[]
): number {
  const nodeI = nodes.find(n => n.name === element.nodeI);
  const nodeJ = nodes.find(n => n.name === element.nodeJ);

  if (!nodeI || !nodeJ) {
    return magnitude;
  }

  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const baseDir = getBaseDirection(direction);

  if (baseDir === 'fx') {
    // Project magnitude along element (local x)
    // component = magnitude * cos(angle)
    return magnitude * (dx / length);
  } else if (baseDir === 'fy') {
    // Project magnitude along perpendicular (local y)
    // component = magnitude * sin(angle + 90°) = magnitude * cos(angle)
    return magnitude * (dy / length);
  }

  // For other directions (moments, etc.), return as-is
  return magnitude;
}

/**
 * Get element orientation angle for visualization
 * @param element Element object
 * @param nodes Array of all nodes
 * @returns Angle in radians, atan2(dy, dx)
 */
export function getElementAngle(element: Element, nodes: Node[]): number {
  const nodeI = nodes.find(n => n.name === element.nodeI);
  const nodeJ = nodes.find(n => n.name === element.nodeJ);

  if (!nodeI || !nodeJ) {
    return 0;
  }

  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  return Math.atan2(dy, dx);
}

/**
 * Get element local coordinate axes in global space
 * @param element Element object
 * @param nodes Array of all nodes
 * @returns Object with local axes expressed in global coordinates
 */
export function getElementLocalAxes(
  element: Element,
  nodes: Node[]
): { localX: [number, number]; localY: [number, number] } {
  const nodeI = nodes.find(n => n.name === element.nodeI);
  const nodeJ = nodes.find(n => n.name === element.nodeJ);

  if (!nodeI || !nodeJ) {
    return { localX: [1, 0], localY: [0, 1] };
  }

  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Local x-axis: along element
  const localX: [number, number] = [dx / length, dy / length];

  // Local y-axis: perpendicular (90° counterclockwise)
  const localY: [number, number] = [-dy / length, dx / length];

  return { localX, localY };
}

/**
 * Convert global direction and magnitude to local coordinates
 * For loads applied in global system, we need to express them in element-local coordinates
 * @param direction Global direction (FX, FY)
 * @param magnitude Global magnitude value
 * @param element Element object
 * @param nodes Array of all nodes
 * @returns Local direction and magnitude for the element
 */
export function convertGlobalLoadToLocal(
  direction: string,
  magnitude: number,
  element: Element,
  nodes: Node[]
): { localDirection: string; localMagnitude: number } {
  const nodeI = nodes.find(n => n.name === element.nodeI);
  const nodeJ = nodes.find(n => n.name === element.nodeJ);

  if (!nodeI || !nodeJ) {
    console.warn(`[coordinateUtils] Could not find nodes for element ${element.name}`);
    return { localDirection: direction.toLowerCase(), localMagnitude: magnitude };
  }

  const baseDir = direction.toLowerCase();

  if (baseDir === 'mz') {
    // Moment: same in local and global
    return { localDirection: 'Mz', localMagnitude: magnitude };
  }

  // Get element local axes in global coordinates
  const { localX, localY } = getElementLocalAxes(element, nodes);

  // For global directions, determine which local direction the force aligns with
  if (baseDir === 'fx') {
    // Global FX (horizontal = [1, 0] in global coords)
    // Project onto local axes
    const projX = 1 * localX[0] + 0 * localX[1];  // FX · localX
    const projY = 1 * localY[0] + 0 * localY[1];  // FX · localY

    const absProjX = Math.abs(projX);
    const absProjY = Math.abs(projY);

    if (absProjX > absProjY) {
      // Aligns more with local X (Fx)
      return {
        localDirection: 'Fx',
        localMagnitude: magnitude * projX,
      };
    } else {
      // Aligns more with local Y (Fy)
      return {
        localDirection: 'Fy',
        localMagnitude: magnitude * projY,
      };
    }
  } else if (baseDir === 'fy') {
    // Global FY (vertical = [0, 1] in global coords)
    const projX = 0 * localX[0] + 1 * localX[1];  // FY · localX
    const projY = 0 * localY[0] + 1 * localY[1];  // FY · localY

    const absProjX = Math.abs(projX);
    const absProjY = Math.abs(projY);

    if (absProjX > absProjY) {
      // Aligns more with local X (Fx)
      return {
        localDirection: 'Fx',
        localMagnitude: magnitude * projX,
      };
    } else {
      // Aligns more with local Y (Fy)
      return {
        localDirection: 'Fy',
        localMagnitude: magnitude * projY,
      };
    }
  }

  // Fallback
  return { localDirection: direction.toLowerCase(), localMagnitude: magnitude };
}
