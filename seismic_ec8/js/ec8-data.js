/**
 * ec8-data.js — tabellverdier fra NS-EN 1998-1 med kildehenvisning.
 *
 * Hver verdi som havner i en rapport bærer sin egen referanse her, slik at
 * rapporten aldri trenger å gjette hvor et tall kommer fra.
 */

export const STANDARD = 'NS-EN 1998-1:2004+A1:2013+NA:2021';

/**
 * Seismiske klasser og seismisk faktor γI, Tabell NA.4(901).
 * Klasse IV har ingen tabellverdi (fotnote a: særskilt vurdering), og
 * NA.3.2.1(5) — utelatelseskriteriene — gjelder bare klasse I–IIIa.
 */
export const SEISMIC_CLASSES = {
  I:    { gammaI: 0.70, label: 'I',    description: 'Småhus, rekkehus, mindre lagerhus, landbruksbygg', avoidanceAllowed: true },
  II:   { gammaI: 1.00, label: 'II',   description: 'Kontorer, forretningsbygg, hotell og boligbygg',  avoidanceAllowed: true },
  IIIa: { gammaI: 1.25, label: 'IIIa', description: 'Skoler, institusjonsbygg, store forsamlingslokaler', avoidanceAllowed: true },
  IIIb: { gammaI: 1.70, label: 'IIIb', description: 'Viktig infrastruktur: sykehus, brannstasjoner, redningssentraler', avoidanceAllowed: false },
  IV:   { gammaI: null, label: 'IV',   description: 'Byggverk der konsekvensene ved sammenbrudd er særlig store', avoidanceAllowed: false }
};
export const GAMMA_I_REF = 'Tabell NA.4(901)';
export const CLASS_REF = 'Tabell NA.4(902)';

/** Grunntyper, Tabell 3.1. S1/S2 krever særskilte undersøkelser og er ikke med. */
export const GROUND_TYPES = {
  A: 'Fjell eller fjell-lignende formasjon',
  B: 'Avsetninger av svært fast sand, grus eller svært stiv leire',
  C: 'Dype avsetninger av fast eller middels fast sand, grus eller stiv leire',
  D: 'Avsetninger av løs til middels fast kohesjonsløs jord eller bløt til fast kohesjonsjord',
  E: 'Overflatelag av alluvium over stivere materiale (vs > 800 m/s)'
};
export const GROUND_REF = 'Tabell 3.1';

/**
 * Spektralparametere S, TB, TC, TD.
 *
 * Dette er de ANBEFALTE verdiene i EN 1998-1 Tabell 3.2 (type 1) og 3.3 (type 2).
 * De er ikke kontrollert mot NA:2021 Tabell NA.3.3 — kilden oppgis derfor som
 * anbefalt verdi i rapporten, ikke som NA-verdi. Bytt tabell og `ref` samtidig.
 */
export const SPECTRUM_TABLES = {
  '1': {
    ref: 'EN 1998-1 Tabell 3.2 (anbefalte verdier)',
    description: 'Type 1 (Ms > 5,5)',
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
    description: 'Type 2 (Ms ≤ 5,5)',
    values: {
      A: { S: 1.00, TB: 0.05, TC: 0.25, TD: 1.2 },
      B: { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 },
      C: { S: 1.50, TB: 0.10, TC: 0.25, TD: 1.2 },
      D: { S: 1.80, TB: 0.10, TC: 0.30, TD: 1.2 },
      E: { S: 1.60, TB: 0.05, TC: 0.25, TD: 1.2 }
    }
  }
};

/** Nedre grense for dimensjonerende spekter, 3.2.2.5(4). */
export const BETA = 0.2;
export const BETA_REF = '3.2.2.5(4)';

/** Ct for forenklet periodeestimat T1 = Ct·h^(3/4), lign. (4.6). Gyldig for h ≤ 40 m. */
export const CT_VALUES = {
  steel:    { Ct: 0.085, label: 'Momentstive stålrammer' },
  concrete: { Ct: 0.075, label: 'Momentstive betongrammer og eksentrisk avstivede stålrammer' },
  other:    { Ct: 0.050, label: 'Alle andre konstruksjoner' }
};
export const T1_MAX_HEIGHT = 40;

/** Grenseverdiene i NA.3.2.1(5). */
export const LIMITS = {
  agS: 0.50,
  ag: 0.30,
  life: 2,
  Sd: 0.50,
  qMax: 1.5
};
export const AVOIDANCE_REF = 'NA.3.2.1(5)';
