/**
 * Snapping utility functions for detecting nearby nodes and elements
 */

import type { Node, Element } from '../analysis/types';
import { distance, type Point } from './transformUtils';

/**
 * Get the snapped click coordinates given the current cursor position and hover state.
 *
 * Centralised snapping behaviour used by every click-driven tool (draw-node,
 * draw-element, move command). Priority order:
 *
 *   1. **Node snap.** If a node is hovered, return that node's exact coordinates.
 *      Existing junctions / supports always win — preserves the historical
 *      snap-to-node UX that users rely on.
 *   2. **Element-projection snap.** Else, if an element is hovered AND
 *      `bypassElementProjection` is `false`, project the cursor onto the
 *      element's axis (clamped to the segment's [0, 1] parametric range) and
 *      return the projection foot. This places new mid-span nodes exactly on
 *      the element's axis, well within PyNite's `PhysMember.descritize`
 *      tolerance of `1e-12 * (1 + L)`, so the physical member auto-splits at
 *      the new node on solve.
 *   3. **Raw cursor.** Else, return the unmodified `worldPos`. Also the
 *      fallback when `bypassElementProjection` is `true` (Shift held), or
 *      when the hovered element / its endpoint nodes can no longer be found.
 *
 * Tie-breaking when multiple elements overlap: `findNearestElement` (the
 * function that populates `hoveredElement`) deterministically returns the
 * element with the smallest perpendicular distance, so the projection
 * naturally lands on whichever element the user appears to be targeting.
 *
 * Shift-bypass contract: callers pass the click-event `shiftKey` value as
 * `bypassElementProjection`. Holding Shift suppresses the projection so the
 * user can place a node intentionally off-axis.
 *
 * @see docs/plans/snap-to-element-projection.md §5.3, §5.4, §5.6
 *
 * @param worldPos - Current cursor position in world coordinates (m)
 * @param hoveredNode - Name of hovered node (if any)
 * @param nodes - Array of all nodes
 * @param hoveredElement - Name of hovered element (if any). Default `null` for
 *   back-compat with callers that have not yet been migrated.
 * @param elements - Array of all elements. Default `[]`.
 * @param bypassElementProjection - When `true`, skip element-projection and
 *   fall through to raw cursor coordinates. Default `false`.
 * @returns Snapped coordinates
 */
export function getSnappedPosition(
  worldPos: Point,
  hoveredNode: string | null,
  nodes: Node[],
  hoveredElement: string | null = null,
  elements: Element[] = [],
  bypassElementProjection = false
): Point {
  // 1. Node snap — exact node coordinates always win
  if (hoveredNode) {
    const node = nodes.find((n) => n.name === hoveredNode);
    if (node) {
      return { x: node.x, y: node.y };
    }
  }

  // 2. Element-projection snap — only when no node is hovered and not bypassed
  if (hoveredElement && !bypassElementProjection) {
    const element = elements.find((e) => e.name === hoveredElement);
    if (element) {
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (nodeI && nodeJ) {
        return projectOntoSegment(
          worldPos,
          { x: nodeI.x, y: nodeI.y },
          { x: nodeJ.x, y: nodeJ.y }
        );
      }
    }
  }

  // 3. Raw cursor — fallback
  return worldPos;
}

/**
 * Snap-state classification for an existing node, used by the canvas snap-marker
 * to colour-code the click target:
 *
 *   - `'connected'` — node has >=2 attached elements OR a non-`free` support.
 *     Marker renders green: clicking reuses an established junction.
 *   - `'free-end'` — node has <=1 attached element AND `support === 'free'`.
 *     Marker renders amber: clicking reuses a possibly-dangling node, which is
 *     worth flagging visually.
 *
 * O(n_elements) per call — negligible for any realistic model. Intended to be
 * called once per mousemove from the snap-marker render block.
 *
 * @see docs/plans/snap-to-element-projection.md §5.5
 */
export type NodeSnapState = 'connected' | 'free-end';

export function classifyNode(
  nodeName: string,
  nodes: Node[],
  elements: Element[]
): NodeSnapState {
  const node = nodes.find((n) => n.name === nodeName);
  if (!node) return 'free-end';
  const elementCount = elements.filter(
    (e) => e.nodeI === nodeName || e.nodeJ === nodeName
  ).length;
  const isSupported = node.support !== 'free';
  return elementCount >= 2 || isSupported ? 'connected' : 'free-end';
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
