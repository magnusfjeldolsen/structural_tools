/**
 * ec8-data.js — henvisninger til NS-EN 1998-1 og regler, men ingen tabellverdier.
 *
 * Standarden er kjøpt og lisensiert; tallene i den (agR, γI, S/TB/TC/TD, β og
 * grenseverdiene i NA.3.2.1(5)) skal ikke publiseres sammen med verktøyet.
 * Brukeren taster dem inn fra sitt eget eksemplar, og her står bare hvor de
 * står i standarden, slik at rapporten kan vise kilden.
 */

export const STANDARD = 'NS-EN 1998-1:2004+A1:2013+NA:2021';

/**
 * Seismiske klasser. NA.3.2.1(5) — utelatelseskriteriene — gjelder bare
 * klasse I–IIIa; for IIIb og IV skal påvisning alltid utføres.
 */
export const SEISMIC_CLASSES = {
  I:    { label: 'I',    avoidanceAllowed: true },
  II:   { label: 'II',   avoidanceAllowed: true },
  IIIa: { label: 'IIIa', avoidanceAllowed: true },
  IIIb: { label: 'IIIb', avoidanceAllowed: false },
  IV:   { label: 'IV',   avoidanceAllowed: false }
};

/** Grunntyper som omfattes av kriterium 2–4 (S1/S2 krever særskilte undersøkelser). */
export const GROUND_TYPES = ['A', 'B', 'C', 'D', 'E'];

/** Hvor brukeren finner hver verdi. Vises i rapportens referansekolonne. */
export const REFS = {
  agR: 'Tabell NA.3.2',
  gammaI: 'Tabell NA.4(901)',
  seismicClass: 'Tabell NA.4(902)',
  groundType: 'Tabell 3.1',
  spectrumType: '3.2.2.2',
  spectrum: '3.2.2.2 med NA',
  q: '3.2.2.5(3)',
  beta: '3.2.2.5(4)',
  Ct: '4.3.3.2.2(3)',
  avoidance: 'NA.3.2.1(5)'
};

/** Lign. (4.6) gjelder for bygninger med høyde opp til 40 m, 4.3.3.2.2(3). */
export const T1_MAX_HEIGHT = 40;

/** Grenseverdiene i NA.3.2.1(5); tastes inn av brukeren. */
export const LIMIT_FIELDS = [
  { key: 'agS',  label: 'a<sub>g</sub>·S', unit: 'm/s²' },
  { key: 'ag',   label: 'a<sub>g</sub>',   unit: 'm/s²' },
  { key: 'life', label: 'Dimensjonerende brukstid', unit: 'år' },
  { key: 'Sd',   label: 'S<sub>d</sub>',   unit: 'm/s²' },
  { key: 'qMax', label: 'q for S<sub>d</sub>-kriteriet', unit: '' }
];
