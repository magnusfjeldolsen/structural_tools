/**
 * ec8-core.js — beregningskjernen. Ingen DOM: inn går et input-objekt, ut går
 * et resultatobjekt som skjerm, plott og begge rapportene leser fra.
 */
import {
  SEISMIC_CLASSES, SPECTRUM_TABLES, BETA, CT_VALUES, T1_MAX_HEIGHT, LIMITS
} from './ec8-data.js';

// Tallene sammenlignes med grenseverdier som 0,50; 0,25 · 2,0 skal ikke falle
// på feil side på grunn av flyttall.
const EPS = 1e-9;
const atMost = (value, limit) => value <= limit + EPS;

export function spectrumParams(spectrumType, groundType) {
  const table = SPECTRUM_TABLES[spectrumType];
  if (!table || !table.values[groundType]) {
    throw new Error(`Ukjent spekter/grunntype: ${spectrumType}/${groundType}`);
  }
  return { ...table.values[groundType], ref: table.ref };
}

/**
 * Dimensjonerende spekter for elastisk analyse, lign. (3.13)–(3.16).
 * sp = { ag, S, TB, TC, TD, q, beta }. Returnerer { Sd, eq }.
 */
export function designSd(T, sp) {
  const { ag, S, TB, TC, TD, q } = sp;
  const beta = sp.beta ?? BETA;
  if (T <= TB) {
    return { Sd: ag * S * (2 / 3 + (T / TB) * (2.5 / q - 2 / 3)), eq: '3.13' };
  }
  if (T <= TC) {
    return { Sd: ag * S * 2.5 / q, eq: '3.14' };
  }
  const floor = beta * ag;
  if (T <= TD) {
    const v = ag * S * 2.5 / q * (TC / T);
    return { Sd: Math.max(v, floor), eq: '3.15', floored: v < floor };
  }
  const v = ag * S * 2.5 / q * (TC * TD / (T * T));
  return { Sd: Math.max(v, floor), eq: '3.16', floored: v < floor };
}

/** Punkter for plotting. Knekkpunktene TB, TC, TD tas med eksakt. */
export function spectrumCurve(sp, Tmax = 4, step = 0.01) {
  const Ts = new Set([0, sp.TB, sp.TC, sp.TD, Tmax]);
  for (let i = 0; i * step <= Tmax + EPS; i++) Ts.add(+(i * step).toFixed(6));
  return [...Ts]
    .filter(T => T <= Tmax + EPS)
    .sort((a, b) => a - b)
    .map(T => ({ T, Sd: designSd(T, sp).Sd }));
}

export function simplifiedT1(Ct, h) {
  return Ct * Math.pow(h, 0.75);
}

const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Hele beregningen.
 *
 * inputs = {
 *   seismicClass, gammaI (null = tabellverdi), agR, spectrumType, groundType,
 *   q, life,
 *   sdMethod: 'none' | 'simplified' | 'modalT1' | 'modalSd',
 *   ctMethod, Ct, h, T1Modal, SdModal,
 *   noStiffnessReduction, soilStiffnessBounds   // avkrysninger for modalanalyse
 * }
 */
export function compute(inputs) {
  const cls = SEISMIC_CLASSES[inputs.seismicClass];
  if (!cls) throw new Error(`Ukjent seismisk klasse: ${inputs.seismicClass}`);

  const tableGammaI = cls.gammaI;
  const gammaI = finite(inputs.gammaI) ? inputs.gammaI : tableGammaI;
  const gammaIFromTable = finite(tableGammaI) && finite(gammaI) && Math.abs(gammaI - tableGammaI) < EPS;

  const params = spectrumParams(inputs.spectrumType, inputs.groundType);
  const errors = [];
  if (!finite(inputs.agR) || inputs.agR < 0) errors.push('agR mangler eller er negativ.');
  if (!finite(gammaI) || gammaI <= 0) {
    errors.push(inputs.seismicClass === 'IV'
      ? 'Klasse IV har ingen tabellverdi for γI — oppgi γI fra særskilt vurdering.'
      : 'γI mangler.');
  }
  if (!finite(inputs.q) || inputs.q < 1) errors.push('q må være ≥ 1,0.');

  const ag = errors.length ? NaN : inputs.agR * gammaI;
  const sp = { ag, S: params.S, TB: params.TB, TC: params.TC, TD: params.TD, q: inputs.q, beta: BETA };

  const spectrum = {
    ...sp,
    ref: params.ref,
    agS: ag * params.S,
    Sd0: ag * params.S * 2 / 3,
    plateau: ag * params.S * 2.5 / inputs.q,
    floor: BETA * ag
  };

  const sd = errors.length ? { method: inputs.sdMethod, valid: false, notes: [] } : evaluateSd(inputs, sp);
  const criteria = errors.length ? [] : evaluateCriteria(inputs, cls, spectrum, sd);

  let conclusion;
  if (errors.length) conclusion = 'invalid';
  else if (!cls.avoidanceAllowed) conclusion = 'required';
  else conclusion = criteria.some(c => c.status === 'met') ? 'avoided' : 'required';

  return {
    inputs, errors,
    seismicClass: inputs.seismicClass, classInfo: cls,
    gammaI, tableGammaI, gammaIFromTable,
    ag, spectrum, sd, criteria, conclusion
  };
}

function evaluateSd(inputs, sp) {
  const method = inputs.sdMethod;
  const notes = [];
  const out = { method, valid: false, notes, T1: null, Sd: null, eq: null };

  if (method === 'none') return out;

  if (method === 'simplified') {
    const Ct = finite(inputs.Ct) ? inputs.Ct : CT_VALUES[inputs.ctMethod]?.Ct;
    if (!finite(Ct) || !finite(inputs.h) || inputs.h <= 0) {
      notes.push('Ct og h må oppgis.');
      return out;
    }
    out.Ct = Ct;
    out.h = inputs.h;
    out.T1 = simplifiedT1(Ct, inputs.h);
    if (inputs.h > T1_MAX_HEIGHT + EPS) {
      notes.push(`Lign. (4.6) gjelder for h ≤ ${T1_MAX_HEIGHT} m — bruk periode fra modalanalyse.`);
    }
  } else if (method === 'modalT1') {
    if (!finite(inputs.T1Modal) || inputs.T1Modal <= 0) {
      notes.push('T₁ fra modalanalysen må oppgis.');
      return out;
    }
    out.T1 = inputs.T1Modal;
  } else if (method === 'modalSd') {
    if (!finite(inputs.SdModal) || inputs.SdModal < 0) {
      notes.push('Sd,maks fra modalanalysen må oppgis.');
      return out;
    }
    out.Sd = inputs.SdModal;
  } else {
    throw new Error(`Ukjent Sd-metode: ${method}`);
  }

  if (out.T1 !== null) {
    const r = designSd(out.T1, sp);
    out.Sd = r.Sd;
    out.eq = r.eq;
  }

  // Betingelsene for Sd-kriteriet i NA.3.2.1(5).
  const modal = method === 'modalT1' || method === 'modalSd';
  out.conditions = [
    { key: 'q', text: `Konstruksjonsfaktor q ≤ ${LIMITS.qMax.toFixed(1).replace('.', ',')}`, ok: atMost(sp.q, LIMITS.qMax) },
    ...(modal ? [
      { key: 'stiffness', text: 'Ingen reduksjon av stivhetsegenskapene etter 4.3.1(7)', ok: !!inputs.noStiffnessReduction },
      { key: 'soil', text: 'Konservativ antakelse av stivhet i grunn (halvert og doblet stivhet vurdert)', ok: !!inputs.soilStiffnessBounds }
    ] : [])
  ];
  const heightOk = method !== 'simplified' || atMost(inputs.h, T1_MAX_HEIGHT);
  out.valid = heightOk && out.conditions.every(c => c.ok);
  return out;
}

function evaluateCriteria(inputs, cls, spectrum, sd) {
  const fmt = v => v.toFixed(2).replace('.', ',');
  const groundAE = ['A', 'B', 'C', 'D', 'E'].includes(inputs.groundType);
  const list = [
    {
      id: 1,
      text: 'Seismisk klasse I',
      value: `Klasse ${inputs.seismicClass}`,
      limit: 'Klasse I',
      status: inputs.seismicClass === 'I' ? 'met' : 'not_met'
    },
    {
      id: 2,
      text: 'Grunntype A–E og a<sub>g</sub>·S ≤ 0,50 m/s²',
      value: `${fmt(spectrum.agS)} m/s²`,
      limit: `≤ ${fmt(LIMITS.agS)} m/s²`,
      status: groundAE && atMost(spectrum.agS, LIMITS.agS) ? 'met' : 'not_met'
    },
    {
      id: 3,
      text: 'Grunntype A–E og a<sub>g</sub> ≤ 0,30 m/s²',
      value: `${fmt(spectrum.ag)} m/s²`,
      limit: `≤ ${fmt(LIMITS.ag)} m/s²`,
      status: groundAE && atMost(spectrum.ag, LIMITS.ag) ? 'met' : 'not_met'
    },
    {
      id: 4,
      text: 'Grunntype A–E og dimensjonerende brukstid ≤ 2 år',
      value: finite(inputs.life) ? `${inputs.life} år` : '–',
      limit: `≤ ${LIMITS.life} år`,
      status: groundAE && finite(inputs.life) && atMost(inputs.life, LIMITS.life) ? 'met' : 'not_met'
    },
    sdCriterion(sd, fmt)
  ];

  if (!cls.avoidanceAllowed) {
    for (const c of list) {
      c.status = 'not_applicable';
    }
  }
  return list;
}

function sdCriterion(sd, fmt) {
  const c = {
    id: 5,
    text: 'S<sub>d</sub> ≤ 0,50 m/s² (med betingelsene i NA.3.2.1(5), se over)',
    value: finite(sd.Sd) ? `${fmt(sd.Sd)} m/s²` : '–',
    limit: `≤ ${fmt(LIMITS.Sd)} m/s²`
  };
  if (sd.method === 'none' || !finite(sd.Sd)) c.status = 'not_evaluated';
  else if (!sd.valid) c.status = 'not_evaluated';
  else c.status = atMost(sd.Sd, LIMITS.Sd) ? 'met' : 'not_met';
  return c;
}
