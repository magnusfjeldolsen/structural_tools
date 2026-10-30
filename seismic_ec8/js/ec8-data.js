/**
 * ec8-data.js — henvisninger til NS-EN 1998-1, regler og de anbefalte verdiene
 * fra EN 1998-1.
 *
 * Bare de anbefalte verdiene i EN 1998-1 (offentlig utgave) ligger her. Verdiene
 * i det norske nasjonale tillegget (agR, γI og grenseverdiene i NA.3.2.1(5)) er
 * lisensiert og skal ikke publiseres. Brukeren taster dem inn fra sitt eget
 * eksemplar, og her står bare hvor de står i standarden.
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

/**
 * Anbefalte spektralparametere, EN 1998-1 Tabell 3.2 (type 1) og 3.3 (type 2).
 * NA kan fastsette andre verdier; brukeren kan derfor overstyre dem.
 */
export const EN_SPECTRUM = {
  '1': {
    ref: 'EN 1998-1 Tabell 3.2 (anbefalte verdier)',
    values: {
      A: { S: 1.00, TB: 0.15, TC: 0.4, TD: 2.0 },
      B: { S: 1.20, TB: 0.15, TC: 0.5, TD: 2.0 },
      C: { S: 1.15, TB: 0.20, TC: 0.6, TD: 2.0 },
      D: { S: 1.35, TB: 0.20, TC: 0.8, TD: 2.0 },
      E: { S: 1.40, TB: 0.15, TC: 0.5, TD: 2.0 }
    }
  },
  '2': {
    ref: 'EN 1998-1 Tabell 3.3 (anbefalte verdier)',
    values: {
      A: { S: 1.00, TB: 0.05, TC: 0.25, TD: 1.2 },
      B: { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 },
      C: { S: 1.50, TB: 0.10, TC: 0.25, TD: 1.2 },
      D: { S: 1.80, TB: 0.10, TC: 0.30, TD: 1.2 },
      E: { S: 1.60, TB: 0.05, TC: 0.25, TD: 1.2 }
    }
  }
};

/** Anbefalt nedre grensefaktor, EN 1998-1 3.2.2.5(4). */
export const EN_BETA = 0.2;

/** Ct i lign. (4.6), EN 1998-1 4.3.3.2.2(3). */
export const EN_CT = {
  steel:    { Ct: 0.085, label: 'momentstive stålrammer' },
  concrete: { Ct: 0.075, label: 'momentstive betongrammer og eksentrisk avstivede stålrammer' },
  other:    { Ct: 0.050, label: 'alle andre konstruksjoner' }
};

/** Lign. (4.6) gjelder for bygninger med høyde opp til 40 m, 4.3.3.2.2(3). */
export const T1_MAX_HEIGHT = 40;

