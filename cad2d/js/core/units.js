/**
 * units.js — arbeidsenhet for workspacet.
 *
 * Modellen lagres i én valgt lengdeenhet, og koordinatene er tall i den
 * enheten. Bytter man enhet, regnes alle koordinater om slik at geometrien
 * beholder sin fysiske størrelse — tegningen skal ikke endre seg av at man
 * går fra mm til m.
 */

export const UNITS = {
  mm: { label: 'mm', toMillimetres: 1, defaultGrid: 50, decimals: 2 },
  cm: { label: 'cm', toMillimetres: 10, defaultGrid: 5, decimals: 3 },
  m: { label: 'm', toMillimetres: 1000, defaultGrid: 0.05, decimals: 4 },
};

export const UNIT_KEYS = Object.keys(UNITS);

export function unitInfo(unit) {
  return UNITS[unit] || UNITS.mm;
}

/** Faktoren man må gange koordinater med for å gå fra `from` til `to`. */
export function conversionFactor(from, to) {
  return unitInfo(from).toMillimetres / unitInfo(to).toMillimetres;
}

export function lengthLabel(unit) {
  return unitInfo(unit).label;
}

export function areaLabel(unit) {
  return `${unitInfo(unit).label}²`;
}

export function inertiaLabel(unit) {
  return `${unitInfo(unit).label}⁴`;
}
