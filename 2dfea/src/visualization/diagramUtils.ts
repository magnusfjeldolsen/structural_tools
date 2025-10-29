/**
 * Diagram Utilities
 * Helper functions for calculating and rendering force diagrams
 */

import type { DiagramData } from '../analysis/types';

export interface DiagramPoint {
  x: number;      // Position along element (0 to 1)
  value: number;  // Force value at this position
}

export interface DiagramPath {
  points: number[];  // Flat array for Konva: [x1, y1, x2, y2, ...]
  max: number;       // Maximum absolute value
  min: number;       // Minimum value
}

/**
 * Calculate the maximum absolute value across all diagrams
 * Used for consistent scaling
 */
export function getMaxDiagramValue(
  diagrams: Record<string, DiagramData>,
  diagramType: 'moment' | 'shear' | 'axial'
): number {
  let max = 0;

  for (const diagram of Object.values(diagrams)) {
    const values = diagramType === 'moment'
      ? diagram.moments
      : diagramType === 'shear'
      ? diagram.shears
      : diagram.axials;

    const localMax = Math.max(...values.map(Math.abs));
    if (localMax > max) max = localMax;
  }

  return max;
}

/**
 * Convert element diagram data to screen coordinates
 */
export function diagramToPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  values: number[],
  scale: number,
  flip: boolean = false
): DiagramPath {
  const points: number[] = [];

  // Element vector
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular vector (normalized)
  const perpX = -dy / length;
  const perpY = dx / length;

  // Calculate min/max for metadata
  let min = 0;
  let max = 0;

  // Generate points along element
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // Position along element (0 to 1)
    const value = values[i];

    // Update min/max
    if (value < min) min = value;
    if (value > max) max = value;

    // Base point on element
    const baseX = x1 + t * dx;
    const baseY = y1 + t * dy;

    // Offset perpendicular to element
    const offset = value * scale * (flip ? -1 : 1);
    const pointX = baseX + perpX * offset;
    const pointY = baseY + perpY * offset;

    points.push(pointX, pointY);
  }

  return { points, max, min };
}

/**
 * Create a filled polygon path for moment diagram
 */
export function diagramToFilledPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  values: number[],
  scale: number,
  flip: boolean = false
): number[] {
  const path = diagramToPath(x1, y1, x2, y2, values, scale, flip);

  // Close the path
  const closedPoints: number[] = [
    x1, y1,           // Start at element start
    ...path.points,    // Follow diagram
    x2, y2,           // End at element end
    x1, y1            // Close back to start
  ];

  return closedPoints;
}

/**
 * Auto-scale diagrams to fit nicely on screen
 */
export function calculateDiagramScale(
  maxValue: number,
  viewScale: number = 1,
  targetPixels: number = 50
): number {
  if (maxValue === 0) return 0;
  return (targetPixels * viewScale) / maxValue;
}
