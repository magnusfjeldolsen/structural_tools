/**
 * ec8-core.js — beregningskjernen. Ingen DOM: inn går et input-objekt, ut går
 * et resultatobjekt som skjerm, plott og begge rapportene leser fra.
 *
 * Alle tallverdier fra standarden kommer inn via inputs (se ec8-data.js).
 */
import { SEISMIC_CLASSES, GROUND_TYPES, T1_MAX_HEIGHT } from './ec8-data.js';

// Tallene sammenlignes med grenseverdier; 0,25 · 2,0 skal ikke falle på feil
// side av grensen på grunn av flyttall.
const EPS = 1e-9;
const atMost = (value, limit) => value <= limit + EPS;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');

/**
 * Dimensjonerende spekter for elastisk analyse, lign. (3.13)–(3.16).
 * sp = { ag, S, TB, TC, TD, q, beta }. Returnerer { Sd, eq, floored }.
 */
export function designSd(T, sp) {
  const { ag, S, TB, TC, TD, q, beta } = sp;
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

/**
 * Hele beregningen.
 *
 * inputs = {
 *   seismicClass, gammaI, agR, spectrumType, groundType,
 *   S, TB, TC, TD, q, beta, life,
 *   limits: { agS, ag, life, Sd, qMax },          // NA.3.2.1(5), null = ikke oppgitt
 *   sdMethod: 'none' | 'simplified' | 'modalT1' | 'modalSd',
 *   Ct, h, T1Modal, SdModal,
 *   noStiffnessReduction, soilStiffnessBounds     // avkrysninger for modalanalyse
 * }
 */
export function compute(inputs) {
  const cls = SEISMIC_CLASSES[inputs.seismicClass];
  if (!cls) throw new Error(`Ukjent seismisk klasse: ${inputs.seismicClass}`);
  const limits = inputs.limits || {};

  const errors = [];
  const missing = [];
  const need = (key, label, ok = v => v > 0) => {
    if (!finite(inputs[key])) missing.push(label);
    else if (!ok(inputs[key])) errors.push(`${label} har ugyldig verdi.`);
  };
  need('agR', 'agR', v => v >= 0);
  need('gammaI', 'γI');
  need('S', 'S');
  need('TB', 'TB');
  need('TC', 'TC');
  need('TD', 'TD');
  need('q', 'q', v => v >= 1);
  need('beta', 'β', v => v >= 0);
  if (missing.length) errors.unshift(`Oppgi ${missing.join(', ')}.`);
  if (!errors.length && !(inputs.TB < inputs.TC && inputs.TC < inputs.TD)) {
    errors.push('Periodene må oppfylle TB < TC < TD.');
  }

  const sp = {
    ag: errors.length ? NaN : inputs.agR * inputs.gammaI,
    S: inputs.S, TB: inputs.TB, TC: inputs.TC, TD: inputs.TD, q: inputs.q, beta: inputs.beta
  };
  const spectrum = {
    ...sp,
    agS: sp.ag * sp.S,
    Sd0: sp.ag * sp.S * 2 / 3,
    plateau: sp.ag * sp.S * 2.5 / sp.q,
    floor: sp.beta * sp.ag
  };

  const sd = errors.length ? { method: inputs.sdMethod, valid: false, notes: [] } : evaluateSd(inputs, sp, limits);
  const criteria = errors.length ? [] : evaluateCriteria(inputs, cls, spectrum, sd, limits);

  let conclusion;
  if (errors.length) conclusion = 'invalid';
  else if (!cls.avoidanceAllowed) conclusion = 'required';
  else conclusion = criteria.some(c => c.status === 'met') ? 'avoided' : 'required';

  return {
    inputs, errors, missing,
    seismicClass: inputs.seismicClass, classInfo: cls,
    gammaI: inputs.gammaI, ag: sp.ag, spectrum, sd, criteria, conclusion
  };
}

function evaluateSd(inputs, sp, limits) {
  const method = inputs.sdMethod;
  const notes = [];
  const out = { method, valid: false, notes, T1: null, Sd: null, eq: null };

  if (method === 'none') return out;

  if (method === 'simplified') {
    if (!finite(inputs.Ct) || inputs.Ct <= 0 || !finite(inputs.h) || inputs.h <= 0) {
      notes.push('Ct og h må oppgis.');
      return out;
    }
    out.Ct = inputs.Ct;
    out.h = inputs.h;
    out.T1 = simplifiedT1(inputs.Ct, inputs.h);
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
  const qMax = limits.qMax;
  out.conditions = [
    finite(qMax)
      ? { key: 'q', text: `Konstruksjonsfaktor q ≤ ${fmt(qMax, 1)}`, ok: atMost(sp.q, qMax) }
      : { key: 'q', text: 'Konstruksjonsfaktor q ≤ grenseverdi (ikke oppgitt)', ok: false },
    ...(modal ? [
      { key: 'stiffness', text: 'Ingen reduksjon av stivhetsegenskapene etter 4.3.1(7)', ok: !!inputs.noStiffnessReduction },
      { key: 'soil', text: 'Konservativ antakelse av stivhet i grunn (halvert og doblet stivhet vurdert)', ok: !!inputs.soilStiffnessBounds }
    ] : [])
  ];
  const heightOk = method !== 'simplified' || atMost(inputs.h, T1_MAX_HEIGHT);
  out.valid = heightOk && out.conditions.every(c => c.ok);
  return out;
}

/** Ett kriterium på formen «verdi ≤ grense», der grensen kan mangle. */
function limitCriterion(id, text, value, limit, unit, precondition = true) {
  const u = unit ? ` ${unit}` : '';
  const c = {
    id, text,
    value: finite(value) ? `${fmt(value)}${u}` : '–',
    limit: finite(limit) ? `≤ ${fmt(limit)}${u}` : 'ikke oppgitt'
  };
  if (!finite(limit) || !finite(value)) c.status = 'not_evaluated';
  else c.status = precondition && atMost(value, limit) ? 'met' : 'not_met';
  return c;
}

function evaluateCriteria(inputs, cls, spectrum, sd, limits) {
  const groundAE = GROUND_TYPES.includes(inputs.groundType);
  const list = [
    {
      id: 1,
      text: 'Seismisk klasse I',
      value: `Klasse ${inputs.seismicClass}`,
      limit: 'Klasse I',
      status: inputs.seismicClass === 'I' ? 'met' : 'not_met'
    },
    limitCriterion(2, 'Grunntype A–E og a<sub>g</sub>·S ≤ grenseverdi', spectrum.agS, limits.agS, 'm/s²', groundAE),
    limitCriterion(3, 'Grunntype A–E og a<sub>g</sub> ≤ grenseverdi', spectrum.ag, limits.ag, 'm/s²', groundAE),
    {
      ...limitCriterion(4, 'Grunntype A–E og dimensjonerende brukstid ≤ grenseverdi', inputs.life, limits.life, '', groundAE),
      value: finite(inputs.life) ? `${inputs.life} år` : '–',
      limit: finite(limits.life) ? `≤ ${limits.life} år` : 'ikke oppgitt'
    },
    sdCriterion(sd, limits.Sd)
  ];

  if (!cls.avoidanceAllowed) {
    for (const c of list) c.status = 'not_applicable';
  }
  return list;
}

function sdCriterion(sd, limit) {
  const c = limitCriterion(5, 'S<sub>d</sub> ≤ grenseverdi (med betingelsene i NA.3.2.1(5), se over)', sd.Sd, limit, 'm/s²');
  if (sd.method === 'none' || !sd.valid) c.status = 'not_evaluated';
  return c;
}
