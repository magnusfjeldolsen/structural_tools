/**
 * Coordinate transformation utilities for converting between screen and world coordinates
 * Handles pan and zoom transformations for the canvas
 */

import Konva from 'konva';

export interface Point {
  x: number;
  y: number;
}

export interface ViewTransform {
  centerX: number;  // World X coordinate (meters) at canvas center
  centerY: number;  // World Y coordinate (meters) at canvas center
  scale: number;    // Zoom scale: pixels per meter (default 50)
}

/**
 * Converts screen coordinates to world coordinates
 * Takes into account the current pan and zoom state of the stage
 *
 * @param stage - Konva Stage instance
 * @param screenPoint - Point in screen/pixel coordinates
 * @returns Point in world coordinates
 */
export function screenToWorld(stage: Konva.Stage, screenPoint: Point): Point {
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  return transform.point(screenPoint);
}

/**
 * Converts world coordinates to screen coordinates
 * Takes into account the current pan and zoom state of the stage
 *
 * @param stage - Konva Stage instance
 * @param worldPoint - Point in world coordinates
 * @returns Point in screen/pixel coordinates
 */
export function worldToScreen(stage: Konva.Stage, worldPoint: Point): Point {
  const transform = stage.getAbsoluteTransform();
  return transform.point(worldPoint);
}

/**
 * Gets the current pointer position in world coordinates
 * Convenience function that combines getPointerPosition with screenToWorld
 *
 * @param stage - Konva Stage instance
 * @returns Point in world coordinates, or null if pointer is not over stage
 */
export function getWorldPointerPosition(stage: Konva.Stage): Point | null {
  const pointerPos = stage.getPointerPosition();
  if (!pointerPos) return null;

  return screenToWorld(stage, pointerPos);
}

/**
 * Clamps a scale value to reasonable zoom limits
 *
 * @param scale - Desired scale value
 * @param minScale - Minimum allowed scale (default 0.1 = 10%)
 * @param maxScale - Maximum allowed scale (default 10 = 1000%)
 * @returns Clamped scale value
 */
export function clampScale(
  scale: number,
  minScale: number = 0.1,
  maxScale: number = 10
): number {
  return Math.max(minScale, Math.min(maxScale, scale));
}

/**
 * Calculates new view transform for zooming centered on a point
 * This ensures that the point under the cursor stays in place when zooming
 *
 * @param currentView - Current view transform
 * @param worldPoint - Point to zoom towards (in world coordinates)
 * @param scaleMultiplier - How much to zoom (e.g., 1.1 for 10% zoom in)
 * @returns New view transform
 */
export function zoomToPoint(
  currentView: ViewTransform,
  worldPoint: Point,
  scaleMultiplier: number,
  minScale: number = 10,
  maxScale: number = 500
): ViewTransform {
  const oldScale = currentView.scale;
  const newScale = clampScale(oldScale * scaleMultiplier, minScale, maxScale);

  // If scale didn't change (hit limit), don't update anything
  if (newScale === oldScale) {
    return currentView;
  }

  // The world point under the cursor should remain stationary
  // offset from center in world coordinates
  const offsetX = worldPoint.x - currentView.centerX;
  const offsetY = worldPoint.y - currentView.centerY;

  // After zoom, we need to adjust center so the world point stays at same screen position
  // Screen offset stays constant: offsetScreen = offset * scale
  // So: offsetX_new * newScale = offsetX_old * oldScale
  // Therefore: offsetX_new = offsetX_old * oldScale / newScale
  const scaleRatio = oldScale / newScale;
  const newOffsetX = offsetX * scaleRatio;
  const newOffsetY = offsetY * scaleRatio;

  return {
    centerX: worldPoint.x - newOffsetX,
    centerY: worldPoint.y - newOffsetY,
    scale: newScale,
  };
}

/**
 * Calculates distance between two points
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Euclidean distance
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
