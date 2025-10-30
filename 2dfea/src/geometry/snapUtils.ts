/**
 * Snapping utility functions for detecting nearby nodes and elements
 */

import type { Node, Element } from '../analysis/types';
import { distance, type Point } from './transformUtils';

/**
 * Find the nearest node to a point within tolerance
 * @param nodes - Array of nodes to search
 * @param worldPos - Position in world coordinates
 * @param tolerance - Maximum distance in world units (meters)
 * @returns Nearest node or null if none within tolerance
 */
export function findNearestNode(
  nodes: Node[],
  worldPos: Point,
  tolerance: number
): Node | null {
  let nearest: Node | null = null;
  let minDist = tolerance;

  for (const node of nodes) {
    const dist = distance(worldPos, { x: node.x, y: node.y });
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return nearest;
}

/**
 * Find the nearest element to a point within tolerance
 * @param nodes - Array of nodes (needed to get element positions)
 * @param elements - Array of elements to search
 * @param worldPos - Position in world coordinates
 * @param tolerance - Maximum distance in world units (meters)
 * @returns Nearest element or null if none within tolerance
 */
export function findNearestElement(
  nodes: Node[],
  elements: Element[],
  worldPos: Point,
  tolerance: number
): Element | null {
  let nearest: Element | null = null;
  let minDist = tolerance;

  for (const element of elements) {
    const nodeI = nodes.find((n) => n.name === element.nodeI);
    const nodeJ = nodes.find((n) => n.name === element.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const dist = distanceToLineSegment(
      worldPos,
      { x: nodeI.x, y: nodeI.y },
      { x: nodeJ.x, y: nodeJ.y }
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = element;
    }
  }

  return nearest;
}

/**
 * Calculate perpendicular distance from a point to a line segment
 * @param point - Point to measure from
 * @param lineStart - Start point of line segment
 * @param lineEnd - End point of line segment
 * @returns Perpendicular distance from point to line segment
 */
export function distanceToLineSegment(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  // If the line segment is actually a point
  if (lengthSquared === 0) {
    return distance(point, lineStart);
  }

  // Parameter t represents position along line (0 = start, 1 = end)
  // This projects the point onto the line
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared
    )
  );

  // Point on the line segment closest to the input point
  const projectionX = lineStart.x + t * dx;
  const projectionY = lineStart.y + t * dy;

  return distance(point, { x: projectionX, y: projectionY });
}
