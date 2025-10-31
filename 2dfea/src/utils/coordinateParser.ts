/**
 * Coordinate Parser Utility
 *
 * Parse coordinate input strings in various formats:
 * - Absolute: "X,Y" (e.g., "10.5,20.3")
 * - Relative/Delta: "dX,Y" or "DX,Y" (e.g., "d5,0" or "D-3,10")
 */

export interface Point {
  x: number;
  y: number;
}

export interface ParsedCoordinate {
  point: Point;
  isDelta: boolean;
}

/**
 * Parse coordinate input string
 *
 * @param input - Input string (e.g., "10,20" or "d5,0")
 * @returns Parsed coordinate with delta flag, or null if invalid
 */
export function parseCoordinateInput(input: string): ParsedCoordinate | null {
  // Remove all whitespace
  const clean = input.trim().replace(/\s+/g, '');

  if (clean.length === 0) {
    return null;
  }

  // Check for delta prefix
  const isDelta = clean.toLowerCase().startsWith('d');
  const coordString = isDelta ? clean.substring(1) : clean;

  // Split by comma
  const parts = coordString.split(',');

  if (parts.length !== 2) {
    return null;
  }

  // Parse numbers
  const x = parseFloat(parts[0]);
  const y = parseFloat(parts[1]);

  if (isNaN(x) || isNaN(y)) {
    return null;
  }

  return {
    point: { x, y },
    isDelta,
  };
}

/**
 * Validate coordinate input format
 *
 * @param input - Input string
 * @returns Error message if invalid, null if valid
 */
export function validateCoordinateInput(input: string): string | null {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return 'Coordinate input cannot be empty';
  }

  const result = parseCoordinateInput(input);

  if (result === null) {
    return 'Invalid format. Use: X,Y or dX,Y';
  }

  return null;
}

/**
 * Format coordinate for display
 *
 * @param point - Point to format
 * @param decimals - Number of decimal places (default 3)
 * @returns Formatted string "X,Y"
 */
export function formatCoordinate(point: Point, decimals: number = 3): string {
  return `${point.x.toFixed(decimals)},${point.y.toFixed(decimals)}`;
}
