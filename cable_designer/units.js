/**
 * units.js — Single source of truth for all unit conversions.
 *
 * USER-FACING UNITS:
 *   Lengths     → m
 *   Forces      → kN
 *   Line loads  → kN/m
 *   Area        → mm²
 *   Stress/E    → MPa
 *   Angles      → °
 *
 * INTERNAL CALCULATION UNITS (what Python receives):
 *   Lengths     → m
 *   Forces      → kN
 *   Line loads  → kN/m
 *   Area        → m²   (converted from mm²)
 *   E-modulus   → kN/m²  (converted from MPa: 1 MPa = 1 kN/m²*1e3… wait:
 *                          1 MPa = 1 N/mm² = 1e3 kN/m²)
 *   Angles      → °  (display only; radians used internally in Python)
 */

export const UNITS = {
  length:   { label: 'm',    toInternal: v => v,       fromInternal: v => v       },
  force:    { label: 'kN',   toInternal: v => v,       fromInternal: v => v       },
  lineLoad: { label: 'kN/m', toInternal: v => v,       fromInternal: v => v       },
  area:     { label: 'mm²',  toInternal: v => v / 1e6, fromInternal: v => v * 1e6 },
  stress:   { label: 'MPa',  toInternal: v => v * 1e3, fromInternal: v => v / 1e3 },  // MPa → kN/m²
  angle:    { label: '°',    toInternal: v => v,       fromInternal: v => v       },
  strain:   { label: '—',    toInternal: v => v,       fromInternal: v => v       },
  ratio:    { label: '—',    toInternal: v => v,       fromInternal: v => v       },
};

/**
 * Convert a user-entered value to internal (Python) units.
 * @param {number} value
 * @param {keyof UNITS} unitKey
 * @returns {number}
 */
export function toInternal(value, unitKey) {
  return UNITS[unitKey].toInternal(value);
}

/**
 * Convert an internal value back to user-facing display units.
 * @param {number} value
 * @param {keyof UNITS} unitKey
 * @returns {number}
 */
export function fromInternal(value, unitKey) {
  return UNITS[unitKey].fromInternal(value);
}

/**
 * Format a number for display with unit label and fixed decimal places.
 * @param {number} value - value already in display units
 * @param {keyof UNITS} unitKey
 * @param {number} decimals
 * @returns {string}
 */
export function fmt(value, unitKey, decimals = 3) {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(decimals)} ${UNITS[unitKey].label}`;
}

/**
 * Format a number in scientific notation with unit label.
 */
export function fmtSci(value, unitKey, decimals = 3) {
  if (value == null || isNaN(value)) return '—';
  return `${value.toExponential(decimals)} ${UNITS[unitKey].label}`;
}

/**
 * Parse and validate a numeric input from a string.
 * Returns { value: number, error: string|null }
 */
export function parseInput(str, { min = -Infinity, max = Infinity } = {}) {
  const v = parseFloat(str);
  if (isNaN(v)) return { value: null, error: 'Must be a number' };
  if (v < min) return { value: null, error: `Must be ≥ ${min}` };
  if (v > max) return { value: null, error: `Must be ≤ ${max}` };
  return { value: v, error: null };
}
