/**
 * Selection Utilities
 *
 * Functions for selecting nodes and elements using rectangular selection.
 * Supports both window (fully inside) and crossing (touching) modes.
 */

import type { Node, Element } from '../analysis/types';

export interface Rectangle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Check if a node is inside a rectangle
 */
export function isNodeInRect(
  node: Node,
  rect: Rectangle
): boolean {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  return node.x >= minX &&
         node.x <= maxX &&
         node.y >= minY &&
         node.y <= maxY;
}

/**
 * Check if an element is in a rectangle based on selection mode
 *
 * @param nodeI - Element start node
 * @param nodeJ - Element end node
 * @param rect - Selection rectangle
 * @param mode - 'window' (fully inside) or 'crossing' (touching)
 */
export function isElementInRect(
  nodeI: Node,
  nodeJ: Node,
  rect: Rectangle,
  mode: 'window' | 'crossing'
): boolean {
  if (mode === 'window') {
    // Both endpoints must be inside
    return isNodeInRect(nodeI, rect) && isNodeInRect(nodeJ, rect);
  } else {
    // Crossing: element intersects or is inside rectangle
    return lineIntersectsRect(nodeI, nodeJ, rect) ||
           isNodeInRect(nodeI, rect) ||
           isNodeInRect(nodeJ, rect);
  }
}

/**
 * Check if a line segment intersects with a rectangle
 */
function lineIntersectsRect(
  nodeI: Node,
  nodeJ: Node,
  rect: Rectangle
): boolean {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  // Rectangle edges
  const edges = [
    { x1: minX, y1: minY, x2: maxX, y2: minY }, // Top
    { x1: maxX, y1: minY, x2: maxX, y2: maxY }, // Right
    { x1: maxX, y1: maxY, x2: minX, y2: maxY }, // Bottom
    { x1: minX, y1: maxY, x2: minX, y2: minY }, // Left
  ];

  for (const edge of edges) {
    if (lineSegmentsIntersect(
      nodeI.x, nodeI.y, nodeJ.x, nodeJ.y,
      edge.x1, edge.y1, edge.x2, edge.y2
    )) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two line segments intersect
 * Using parametric line equations
 */
function lineSegmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  const dax = ax2 - ax1;
  const day = ay2 - ay1;
  const dbx = bx2 - bx1;
  const dby = by2 - by1;

  const denominator = dax * dby - day * dbx;

  // Parallel lines
  if (Math.abs(denominator) < 1e-10) {
    return false;
  }

  const s = ((ax1 - bx1) * dby - (ay1 - by1) * dbx) / denominator;
  const t = ((ax1 - bx1) * day - (ay1 - by1) * dax) / denominator;

  // Check if intersection point is within both segments
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

/**
 * Find all nodes within a rectangle
 */
export function findNodesInRect(
  nodes: Node[],
  rect: Rectangle
): string[] {
  return nodes
    .filter(node => isNodeInRect(node, rect))
    .map(node => node.name);
}

/**
 * Find all elements within a rectangle
 */
export function findElementsInRect(
  nodes: Node[],
  elements: Element[],
  rect: Rectangle,
  mode: 'window' | 'crossing'
): string[] {
  return elements
    .filter(element => {
      const nodeI = nodes.find(n => n.name === element.nodeI);
      const nodeJ = nodes.find(n => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return false;
      return isElementInRect(nodeI, nodeJ, rect, mode);
    })
    .map(element => element.name);
}
