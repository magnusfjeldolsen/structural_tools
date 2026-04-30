/**
 * Snapping utility functions for detecting nearby nodes and elements
 */

import type { Node, Element } from '../analysis/types';
import { distance, type Point } from './transformUtils';

/**
 * Get snapped position - returns node coordinates if hovering over a node, else cursor position
 * This is the centralized snapping behavior used by all tools
 * @param worldPos - Current cursor position in world coordinates
 * @param hoveredNode - Name of hovered node (if any)
 * @param nodes - Array of all nodes
 * @returns Snapped coordinates
 */
export function getSnappedPosition(
  worldPos: Point,
  hoveredNode: string | null,
  nodes: Node[]
): Point {
  if (hoveredNode) {
    const node = nodes.find(n => n.name === hoveredNode);
    if (node) {
      return { x: node.x, y: node.y };
    }
  }
  return worldPos;
}

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
 * Project a point onto a line segment, clamped to the segment's [0, 1] parametric range.
 *
 * Returns the closest point on the segment to the input point. If the segment is degenerate
 * (zero length), returns `lineStart`.
 *
 * Single source of truth for the projection math used by both `distanceToLineSegment`
 * (UI hover detection) and `getSnappedPosition` (click placement). The hover threshold
 * is loose (~0.2 m world at default zoom); precision comes from this projection, not
 * the threshold.
 *
 * IEEE-754 noise: ~4e-15 m absolute for L = 4 m (relative ~1e-15). Three orders of
 * magnitude tighter than PyNite's `PhysMember.descritize` tolerance of `1e-12 * (1 + L)`,
 * so projected nodes reliably trigger sub-member splitting on solve. Verified for L
 * between 0.1 m and 1000 m by the randomised tolerance test in `snapUtils.test.ts`.
 *
 * @see docs/plans/snap-to-element-projection.md §5.2, §5.7
 *
 * @param point - Point to project
 * @param lineStart - Start of line segment
 * @param lineEnd - End of line segment
 * @returns The closest point on the segment (clamped to endpoints).
 */
export function projectOntoSegment(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): Point {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  // Degenerate (zero-length) segment — return the start point
  if (lengthSquared === 0) {
    return { x: lineStart.x, y: lineStart.y };
  }

  // Parameter t along the segment: 0 at lineStart, 1 at lineEnd. Clamped to the segment.
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared
    )
  );

  return {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
}

/**
 * Calculate perpendicular distance from a point to a line segment.
 *
 * Thin wrapper over `projectOntoSegment` — the projection math lives in one place.
 *
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
  return distance(point, projectOntoSegment(point, lineStart, lineEnd));
}
