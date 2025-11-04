/**
 * Label Positioning Utilities
 * Geometric calculations for positioning labels on diagrams
 */

/**
 * Calculate the midpoint of an element
 */
export function calculateElementMidpoint(
  posI: [number, number],
  posJ: [number, number]
): [number, number] {
  return [
    (posI[0] + posJ[0]) / 2,
    (posI[1] + posJ[1]) / 2,
  ];
}

/**
 * Get the angle of an element in radians
 * Angle is measured from horizontal (0 = horizontal, π/2 = vertical up)
 */
export function getElementAngle(
  posI: [number, number],
  posJ: [number, number]
): number {
  const dx = posJ[0] - posI[0];
  const dy = posJ[1] - posI[1];
  return Math.atan2(dy, dx);
}

/**
 * Calculate a position along an element at a given fraction
 * @param posI - Start position (world coordinates)
 * @param posJ - End position (world coordinates)
 * @param fraction - Position along element (0 = at I, 1 = at J)
 * @returns Position in world coordinates
 */
export function getPointAlongElement(
  posI: [number, number],
  posJ: [number, number],
  fraction: number
): [number, number] {
  return [
    posI[0] + (posJ[0] - posI[0]) * fraction,
    posI[1] + (posJ[1] - posI[1]) * fraction,
  ];
}

/**
 * Calculate perpendicular offset from an element
 * Used to position labels away from the diagram
 *
 * @param angle - Element angle in radians
 * @param offsetDistance - Distance to offset (positive = up/right, negative = down/left)
 * @returns [dx, dy] offset vector
 */
export function calculatePerpendicularOffset(
  angle: number,
  offsetDistance: number
): [number, number] {
  // Perpendicular to element is angle + 90 degrees
  const perpAngle = angle + Math.PI / 2;
  return [
    offsetDistance * Math.cos(perpAngle),
    offsetDistance * Math.sin(perpAngle),
  ];
}

/**
 * Calculate label position in world coordinates
 * @param basePos - Position on the element (world coordinates)
 * @param angle - Element angle
 * @param offsetDistance - How far perpendicular to the element
 * @param isAboveDiagram - Whether to offset on the positive side of perpendicular
 * @returns Label position in world coordinates
 */
export function calculateLabelWorldPos(
  basePos: [number, number],
  angle: number,
  offsetDistance: number,
  isAboveDiagram: boolean
): [number, number] {
  const offset = calculatePerpendicularOffset(
    angle,
    isAboveDiagram ? offsetDistance : -offsetDistance
  );
  return [basePos[0] + offset[0], basePos[1] + offset[1]];
}

/**
 * Align text based on element angle
 * Returns appropriate Konva text alignment for readability
 */
export function getTextAlignment(angle: number): {
  align: 'left' | 'center' | 'right';
  rotation: number;
} {
  // Normalize angle to 0-2π
  let normalizedAngle = angle % (Math.PI * 2);
  if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

  // Return alignment based on angle
  // Element roughly horizontal
  if (normalizedAngle < Math.PI / 4 || normalizedAngle > (7 * Math.PI) / 4) {
    return { align: 'center', rotation: 0 };
  }
  // Element diagonal (up-right)
  if (normalizedAngle < (3 * Math.PI) / 4) {
    return { align: 'center', rotation: 0 };
  }
  // Element roughly vertical
  if (normalizedAngle < (5 * Math.PI) / 4) {
    return { align: 'center', rotation: 0 };
  }
  // Element diagonal (down-right)
  return { align: 'center', rotation: 0 };
}

/**
 * Determine which side of the diagram to place labels
 * For diagrams that can be on both sides of the element
 * @param angle - Element angle in radians
 * @param isMaxValue - Whether this is a max or min value
 * @returns true if label should be on the "above" side
 */
export function shouldLabelBeAbove(angle: number, isMaxValue: boolean): boolean {
  // Normalize angle to 0-2π
  let normalizedAngle = angle % (Math.PI * 2);
  if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

  // For roughly horizontal elements, positive values go up
  if (normalizedAngle < Math.PI / 4 || normalizedAngle > (7 * Math.PI) / 4) {
    return isMaxValue;
  }

  // For roughly vertical elements, positive values go right
  if (normalizedAngle > (Math.PI / 4) && normalizedAngle < (3 * Math.PI) / 4) {
    return isMaxValue;
  }

  if (normalizedAngle > (3 * Math.PI) / 4 && normalizedAngle < (5 * Math.PI) / 4) {
    return !isMaxValue;
  }

  if (normalizedAngle > (5 * Math.PI) / 4 && normalizedAngle < (7 * Math.PI) / 4) {
    return !isMaxValue;
  }

  return isMaxValue;
}
