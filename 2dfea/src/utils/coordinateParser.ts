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
 * Supported formats:
 * - Absolute: "X,Y" or "X Y" (e.g., "10,20" or "10 20")
 * - Relative: "dX,Y" or "dX Y" or "DX,Y" or "DX Y" (e.g., "d5,0" or "d5 0")
 *
 * @param input - Input string
 * @returns Parsed coordinate with delta flag, or null if invalid
 */
export function parseCoordinateInput(input: string): ParsedCoordinate | null {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return null;
  }

  // Check for delta prefix (d or D)
  const isDelta = trimmed.toLowerCase().startsWith('d');
  const coordString = isDelta ? trimmed.substring(1).trim() : trimmed;

  // Split by comma or space (but normalize multiple spaces first)
  const normalized = coordString.replace(/\s+/g, ' ');
  let parts: string[];

  if (normalized.includes(',')) {
    // Comma-separated: split by comma and remove spaces
    parts = normalized.split(',').map(p => p.trim());
  } else {
    // Space-separated
    parts = normalized.split(' ');
  }

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
    return 'Invalid format. Use: X,Y or X Y (absolute) or dX,Y or dX Y (relative)';
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
