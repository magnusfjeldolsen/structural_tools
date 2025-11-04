/**
 * Diagram Label Utilities
 * Helper functions to extract max/min values and indices from diagram data
 */

export interface ExtremeValues {
  minIndex: number;
  minValue: number;
  maxIndex: number;
  maxValue: number;
}

export interface DisplacementExtremes {
  minIndex: number;
  maxIndex: number;
  minMagnitude: number;
  maxMagnitude: number;
}

/**
 * Find min and max values in an array along with their indices
 */
export function findExtremeIndices(values: number[]): ExtremeValues {
  if (values.length === 0) {
    return { minIndex: 0, minValue: 0, maxIndex: 0, maxValue: 0 };
  }

  let minIndex = 0;
  let maxIndex = 0;
  let minValue = values[0];
  let maxValue = values[0];

  for (let i = 0; i < values.length; i++) {
    if (values[i] < minValue) {
      minValue = values[i];
      minIndex = i;
    }
    if (values[i] > maxValue) {
      maxValue = values[i];
      maxIndex = i;
    }
  }

  return { minIndex, minValue, maxIndex, maxValue };
}

/**
 * Find displacement extremes (magnitude-based)
 * Combines axial and perpendicular deflections into magnitude
 */
export function findDisplacementExtremes(
  deflections_dx: number[],
  deflections_dy: number[]
): DisplacementExtremes {
  if (deflections_dx.length === 0 || deflections_dy.length === 0) {
    return { minIndex: 0, maxIndex: 0, minMagnitude: 0, maxMagnitude: 0 };
  }

  const magnitudes = deflections_dx.map((dx, i) => {
    const dy = deflections_dy[i] || 0;
    return Math.sqrt(dx * dx + dy * dy);
  });

  let minIndex = 0;
  let maxIndex = 0;
  let minMagnitude = magnitudes[0];
  let maxMagnitude = magnitudes[0];

  for (let i = 0; i < magnitudes.length; i++) {
    if (magnitudes[i] < minMagnitude) {
      minMagnitude = magnitudes[i];
      minIndex = i;
    }
    if (magnitudes[i] > maxMagnitude) {
      maxMagnitude = magnitudes[i];
      maxIndex = i;
    }
  }

  return { minIndex, maxIndex, minMagnitude, maxMagnitude };
}

/**
 * Safely get a value from an array at a given index
 */
export function getValueAtIndex(values: number[], index: number): number {
  if (index < 0 || index >= values.length) {
    return 0;
  }
  return values[index];
}

/**
 * Interpolate a position along an element based on index in array
 * Maps array index to local position along element (0 to 1)
 *
 * @param elementLength - Total length of element in world coordinates
 * @param index - Index in the diagram array
 * @param totalPoints - Total number of points in the array
 * @returns Local position along element (0 to 1)
 */
export function getLocalPositionFromIndex(
  index: number,
  totalPoints: number
): number {
  if (totalPoints <= 1) return 0;
  return index / (totalPoints - 1);
}

/**
 * Convert local position (0-1) to actual value at that position
 * @param value - The diagram value (moment, shear, axial, etc.)
 * @returns The value to display
 */
export function formatDiagramValue(value: number, unit: string = ''): string {
  // Format to 2 decimal places
  const formatted = value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}
