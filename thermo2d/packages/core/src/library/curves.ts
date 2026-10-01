/**
 * Fire and climate curve generators. Curves are DATA: a generator name plus
 * parameters produce sampled [t s, value] points that are stored in the project
 * with the citation, so a project is reproducible without the library.
 */
import type { Citation, LibraryItem, TimeSeries } from '../model/types.js';
import { CommandError } from '../commands/types.js';
import { interpTable } from './models.js';

export type Params = Record<string, number | string>;
export type Points = [number, number][];

/** Read a numeric parameter; `aliases` are alternative keys (e.g. t0 for tStep). */
function num(p: Params, key: string, fallback?: number, aliases: string[] = []): number {
  let v = p[key];
  for (const a of aliases) if (v === undefined || v === '') v = p[a];
  if (v === undefined || v === '') {
    if (fallback === undefined) throw new CommandError('bad-value', `Missing parameter '${key}'`, { field: key });
    return fallback;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new CommandError('bad-value', `Parameter '${key}' must be a number, got '${v}'`, { field: key, value: v });
  return n;
}

/** Sampling grid: 1 s for the first 5 min, 10 s to 30 min, then 60 s (or `step` if given). */
export function sampleTimes(duration: number, step?: number): number[] {
  const out: number[] = [];
  if (step && step > 0) {
    for (let t = 0; t <= duration + 1e-9; t += step) out.push(+t.toFixed(6));
    if (out[out.length - 1] < duration) out.push(duration);
    return out;
  }
  let t = 0;
  while (t <= duration + 1e-9) {
    out.push(t);
    t += t < 300 ? 1 : t < 1800 ? 10 : 60;
  }
  if (out[out.length - 1] < duration) out.push(duration);
  return out;
}

function sampled(duration: number, f: (tSec: number) => number, step?: number): Points {
  return sampleTimes(duration, step).map((t) => [t, f(t)]);
}

// ---------------------------------------------------------------------------
// Nominal fire curves, EN 1991-1-2:2002 §3.2 (t in minutes inside the formulas)
// ---------------------------------------------------------------------------

export const iso834 = (tMin: number, ambient = 20): number => ambient + 345 * Math.log10(8 * tMin + 1);
export const externalFire = (tMin: number, ambient = 20): number =>
  ambient + 660 * (1 - 0.687 * Math.exp(-0.32 * tMin) - 0.313 * Math.exp(-3.8 * tMin));
export const hydrocarbon = (tMin: number, ambient = 20): number =>
  ambient + 1080 * (1 - 0.325 * Math.exp(-0.167 * tMin) - 0.675 * Math.exp(-2.5 * tMin));
/** Hydrocarbon modified (HCM, French tunnel curve): peak 1300 °C. */
export const hcm = (tMin: number, ambient = 20): number =>
  ambient + 1280 * (1 - 0.325 * Math.exp(-0.167 * tMin) - 0.675 * Math.exp(-2.5 * tMin));

/** Tabulated tunnel and test curves (t min, °C). */
export const RWS_POINTS: Points = [
  [0, 20],
  [3, 890],
  [5, 1140],
  [10, 1200],
  [30, 1300],
  [60, 1350],
  [90, 1300],
  [120, 1200],
  [180, 1200],
];
export const RABT_ZTV_ROAD_POINTS: Points = [
  [0, 15],
  [5, 1200],
  [30, 1200],
  [140, 15],
];
export const RABT_ZTV_RAIL_POINTS: Points = [
  [0, 15],
  [5, 1200],
  [60, 1200],
  [170, 15],
];
export const ASTM_E119_POINTS: Points = [
  [0, 20],
  [5, 538],
  [10, 704],
  [30, 843],
  [60, 927],
  [120, 1010],
  [240, 1093],
  [480, 1260],
];

// ---------------------------------------------------------------------------
// Parametric fire, EN 1991-1-2 Annex A
// ---------------------------------------------------------------------------

export interface ParametricFireParams {
  /** Opening factor O = A_v √h_eq / A_t, m^0.5 (0.02–0.20). */
  O: number;
  /** Thermal absorptivity b = √(ρcλ) of the enclosure, J/m²s^0.5K (100–2200). */
  b: number;
  /** Design fire load density related to the total surface A_t, MJ/m² (50–1000). */
  qtd: number;
  /** Fire growth rate: slow (t_lim 25 min), medium (20 min), fast (15 min). */
  growth: 'slow' | 'medium' | 'fast';
  ambient?: number;
}

export const PARAMETRIC_LIMITS: Record<string, [number, number]> = {
  O: [0.02, 0.2],
  b: [100, 2200],
  qtd: [50, 1000],
  floorArea: [0, 500],
  height: [0, 4],
};

/** Gas temperature θg(t) for the parametric fire; t in seconds. Enforces the Annex A validity limits. */
export function parametricFire(p: ParametricFireParams): (tSec: number) => number {
  const { O, b, qtd } = p;
  const ambient = p.ambient ?? 20;
  const check = (key: string, v: number) => {
    const [lo, hi] = PARAMETRIC_LIMITS[key];
    if (v < lo || v > hi) {
      throw new CommandError(
        'bad-value',
        `Parametric fire: ${key} = ${v} is outside the validity range ${lo}–${hi} of EN 1991-1-2 Annex A. Change the input or use a nominal curve.`,
        { field: key, value: v, options: [lo, hi] },
      );
    }
  };
  check('O', O);
  check('b', b);
  check('qtd', qtd);
  const tlim = p.growth === 'slow' ? 25 / 60 : p.growth === 'fast' ? 15 / 60 : 20 / 60; // h
  const gamma = Math.pow(O / b, 2) / Math.pow(0.04 / 1160, 2);
  let tmax = Math.max((0.2e-3 * qtd) / O, tlim); // h
  const heating = (tStar: number) =>
    ambient + 1305 * (1 - 0.324 * Math.exp(-0.2 * tStar) - 0.204 * Math.exp(-1.7 * tStar) - 0.472 * Math.exp(-19 * tStar));
  // fuel-controlled fire: t* = t·Γ_lim in the heating phase (A.8, A.9)
  let gammaHeat = gamma;
  const fuelControlled = tmax <= tlim + 1e-12;
  if (fuelControlled) {
    tmax = tlim;
    const Olim = (0.1e-3 * qtd) / tlim;
    let gammaLim = Math.pow(Olim / b, 2) / Math.pow(0.04 / 1160, 2);
    if (O > 0.04 && qtd < 75 && b < 1160) {
      const k = 1 + ((O - 0.04) / 0.04) * ((qtd - 75) / 75) * ((1160 - b) / 1160);
      gammaLim *= k;
    }
    gammaHeat = gammaLim;
  }
  const tStarMax = fuelControlled ? tlim * gammaHeat : tmax * gamma; // (A.7)/(A.8) in h
  const thetaMax = heating(tStarMax);
  // cooling phase (A.11), with t*max = (0.2e-3 qtd/O)·Γ and x per A.12
  const tStarMaxCool = ((0.2e-3 * qtd) / O) * gamma;
  const x = tmax > tlim ? 1 : (tlim * gamma) / tStarMaxCool;
  return (tSec: number) => {
    const th = tSec / 3600;
    if (th <= tmax) return heating(th * gammaHeat);
    const tStar = th * gamma;
    let theta: number;
    if (tStarMaxCool <= 0.5) theta = thetaMax - 625 * (tStar - tStarMaxCool * x);
    else if (tStarMaxCool < 2) theta = thetaMax - 250 * (3 - tStarMaxCool) * (tStar - tStarMaxCool * x);
    else theta = thetaMax - 250 * (tStar - tStarMaxCool * x);
    return Math.max(ambient, theta);
  };
}

// ---------------------------------------------------------------------------
// Generic generators
// ---------------------------------------------------------------------------

export const GENERATORS = [
  'iso834',
  'external',
  'hydrocarbon',
  'hcm',
  'parametric',
  'rws',
  'rabt-ztv-road',
  'rabt-ztv-rail',
  'astm-e119',
  'cooling',
  'constant',
  'step',
  'ramp',
  'sinusoid',
  'repeat',
  'tabulated',
] as const;
export type GeneratorName = (typeof GENERATORS)[number];

function tabulatedMinutes(points: Points, tSec: number): number {
  return interpTable(points, tSec / 60);
}

/**
 * Generate sampled points. `duration` in s (default: params.duration or 7200 for fire, 86400 for climate).
 * Params by generator:
 *  iso834|external|hydrocarbon|hcm: ambient
 *  parametric: O, b, qtd, growth, ambient
 *  rws|rabt-ztv-road|rabt-ztv-rail|astm-e119: —
 *  cooling: base (generator name), tCool (s, start of cooling), coolDuration (s), ambient, plus the base's params
 *  constant: value; step: before, after, tStep; ramp: from, to, tStart, tEnd
 *  sinusoid: mean, amplitude, period (s), phase (s, time of maximum), offset
 *  repeat: points (JSON string) or base generator, times; tabulated: points (JSON "[[t,v],...]" in s)
 */
export function generateCurve(generator: string, params: Params = {}, duration?: number): Points {
  const ambient = num(params, 'ambient', 20);
  const step = params.step !== undefined ? num(params, 'step') : undefined;
  const D = duration ?? num(params, 'duration', isClimate(generator) ? 86400 : 7200);
  switch (generator as GeneratorName) {
    case 'iso834':
      return sampled(D, (t) => iso834(t / 60, ambient), step);
    case 'external':
      return sampled(D, (t) => externalFire(t / 60, ambient), step);
    case 'hydrocarbon':
      return sampled(D, (t) => hydrocarbon(t / 60, ambient), step);
    case 'hcm':
      return sampled(D, (t) => hcm(t / 60, ambient), step);
    case 'parametric': {
      const f = parametricFire({
        O: num(params, 'O'),
        b: num(params, 'b'),
        qtd: num(params, 'qtd'),
        growth: (String(params.growth ?? 'medium') as 'slow' | 'medium' | 'fast'),
        ambient,
      });
      return sampled(D, f, step);
    }
    case 'rws':
      return sampled(D, (t) => tabulatedMinutes(RWS_POINTS, t), step);
    case 'rabt-ztv-road':
      return sampled(D, (t) => tabulatedMinutes(RABT_ZTV_ROAD_POINTS, t), step);
    case 'rabt-ztv-rail':
      return sampled(D, (t) => tabulatedMinutes(RABT_ZTV_RAIL_POINTS, t), step);
    case 'astm-e119':
      return sampled(D, (t) => tabulatedMinutes(ASTM_E119_POINTS, t), step);
    case 'cooling': {
      const base = String(params.base ?? 'iso834');
      if (base === 'cooling') throw new CommandError('bad-value', "cooling: 'base' cannot be 'cooling'", { field: 'base' });
      const tCool = num(params, 'tCool');
      const coolDuration = num(params, 'coolDuration', 3600);
      const basePts = generateCurve(base, { ...params, duration: Math.max(tCool, 1) }, Math.max(tCool, 1));
      const thetaCool = interpTable(basePts, tCool);
      return sampled(
        D,
        (t) => {
          if (t <= tCool) return interpTable(basePts, t);
          const f = Math.min(1, (t - tCool) / coolDuration);
          return thetaCool + (ambient - thetaCool) * f;
        },
        step,
      );
    }
    case 'constant': {
      const v = num(params, 'value');
      return [
        [0, v],
        [D, v],
      ];
    }
    case 'step': {
      const before = num(params, 'before');
      const after = num(params, 'after');
      const tStep = num(params, 'tStep', undefined, ['t0']);
      return [
        [0, before],
        [tStep, after],
        [D, after],
      ];
    }
    case 'ramp': {
      const from = num(params, 'from');
      const to = num(params, 'to');
      const tStart = num(params, 'tStart', 0, ['t0']);
      const tEnd = num(params, 'tEnd', D, ['t1']);
      const pts: Points = [];
      if (tStart > 0) pts.push([0, from]);
      pts.push([tStart, from], [tEnd, to]);
      if (tEnd < D) pts.push([D, to]);
      return dedupe(pts);
    }
    case 'sinusoid': {
      const mean = num(params, 'mean');
      const amp = num(params, 'amplitude');
      const period = num(params, 'period', 86400);
      const phase = num(params, 'phase', 0); // s, time of the maximum
      const offset = num(params, 'offset', 0);
      const s = step ?? Math.max(1, period / 48);
      return sampled(D, (t) => mean + offset + amp * Math.cos((2 * Math.PI * (t - phase)) / period), s);
    }
    case 'repeat': {
      const times = Math.max(1, Math.round(num(params, 'times', 1)));
      const basePts: Points = params.points !== undefined ? parsePoints(params.points) : generateCurve(String(params.base), params, undefined);
      return repeatSeries(basePts, times);
    }
    case 'tabulated':
      return dedupe(parsePoints(params.points));
    default:
      throw new CommandError('not-found', `Unknown curve generator '${generator}'. Options: ${GENERATORS.join(', ')}`, {
        field: 'generator',
        value: generator,
        options: [...GENERATORS],
      });
  }
}

function isClimate(g: string): boolean {
  return g === 'constant' || g === 'step' || g === 'ramp' || g === 'sinusoid' || g === 'repeat';
}

function parsePoints(v: number | string | undefined): Points {
  const bad = (msg: string) => new CommandError('bad-value', msg, { field: 'points', value: v });
  if (typeof v !== 'string') throw bad("Parameter 'points' must be a JSON string of [t, value] pairs");
  let arr: unknown;
  try {
    arr = JSON.parse(v);
  } catch {
    throw bad("Parameter 'points' is not valid JSON");
  }
  if (!Array.isArray(arr)) throw bad("'points' must be an array");
  return arr.map((p) => {
    if (!Array.isArray(p) || p.length < 2) throw bad("'points' entries must be [t, value]");
    return [Number(p[0]), Number(p[1])] as [number, number];
  });
}

/** Sort by t and drop duplicate times (keep the last value). */
export function dedupe(points: Points): Points {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const out: Points = [];
  for (const p of sorted) {
    if (out.length && Math.abs(out[out.length - 1][0] - p[0]) < 1e-9) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Repeat a series n times end to end (the period is the last t of the base). */
export function repeatSeries(base: Points, times: number): Points {
  const pts = dedupe(base);
  if (pts.length < 2) return pts;
  const period = pts[pts.length - 1][0];
  const out: Points = [];
  for (let k = 0; k < times; k++) {
    for (let i = 0; i < pts.length; i++) {
      if (k > 0 && i === 0) continue; // the repeat starts where the previous ended
      out.push([pts[i][0] + k * period, pts[i][1]]);
    }
  }
  return out;
}

export function scaleSeries(points: Points, factor: number, offset = 0): Points {
  return points.map(([t, v]) => [t, v * factor + offset]);
}

/** Point-wise sum of two series on the union of their time grids (linear interpolation). */
export function sumSeries(a: Points, b: Points): Points {
  const ts = dedupe([...a, ...b]).map((p) => p[0]);
  return ts.map((t) => [t, interpTable(a, t) + interpTable(b, t)]);
}

// ---------------------------------------------------------------------------
// Curve library items
// ---------------------------------------------------------------------------

const EN1991: Citation = { text: 'EN 1991-1-2:2002 §3.2.1 (3.4), standard temperature-time curve (ISO 834)' };

function curveItem(
  id: string,
  name: string,
  nameNb: string,
  category: 'fire-curve' | 'climate-series',
  generator: GeneratorName,
  params: Params,
  source: Citation,
  description: string,
  tags: string[],
  quality: LibraryItem['quality'] = 'standard',
  limits?: Record<string, [number, number]>,
): LibraryItem {
  return {
    id,
    category,
    name,
    nameNb,
    tags,
    origin: 'builtin',
    source,
    quality,
    curve: { generator, params, unit: '°C', limits, description },
  };
}

export const CURVE_LIBRARY: LibraryItem[] = [
  curveItem('iso834', 'ISO 834 standard fire', 'ISO 834 standardbrann', 'fire-curve', 'iso834', { ambient: 20, duration: 7200 }, EN1991,
    'θg = 20 + 345·log10(8t + 1), t in minutes', ['fire', 'brann', 'standard', 'iso', 'cellulosic']),
  curveItem('external-fire', 'External fire curve', 'Utvendig brannkurve', 'fire-curve', 'external', { ambient: 20, duration: 7200 },
    { text: 'EN 1991-1-2:2002 §3.2.2 (3.5), external fire curve' },
    'θg = 20 + 660(1 − 0.687e^(−0.32t) − 0.313e^(−3.8t)), t in minutes', ['fire', 'brann', 'external', 'utvendig']),
  curveItem('hydrocarbon', 'Hydrocarbon fire curve', 'Hydrokarbonkurve', 'fire-curve', 'hydrocarbon', { ambient: 20, duration: 7200 },
    { text: 'EN 1991-1-2:2002 §3.2.3 (3.6), hydrocarbon curve' },
    'θg = 20 + 1080(1 − 0.325e^(−0.167t) − 0.675e^(−2.5t)), t in minutes', ['fire', 'brann', 'hydrocarbon', 'petroleum']),
  curveItem('hcm', 'HCM (modified hydrocarbon) tunnel curve', 'HCM-kurve (modifisert hydrokarbon)', 'fire-curve', 'hcm', { ambient: 20, duration: 7200 },
    { text: 'French Ministry of Transport circular 2000-63 (HCM), peak 1300 °C — transcribed formula, verify' },
    'θg = 20 + 1280(1 − 0.325e^(−0.167t) − 0.675e^(−2.5t)), t in minutes', ['fire', 'tunnel', 'hcm'], 'typical'),
  curveItem('parametric-fire', 'Parametric (natural) fire', 'Parametrisk brann', 'fire-curve', 'parametric',
    { O: 0.06, b: 1500, qtd: 300, growth: 'medium', ambient: 20, duration: 7200 },
    { text: 'EN 1991-1-2:2002 Annex A, parametric temperature-time curves' },
    'Heating and cooling phase from opening factor O, thermal absorptivity b and fire load density q_t,d; validity limits enforced',
    ['fire', 'brann', 'parametric', 'parametrisk', 'natural'], 'standard', PARAMETRIC_LIMITS),
  curveItem('rws', 'RWS tunnel curve', 'RWS tunnelkurve', 'fire-curve', 'rws', { duration: 7200 },
    { text: 'Rijkswaterstaat (NL) RWS curve, tabulated; peak 1350 °C at 60 min — transcribed, verify' },
    'Tabulated points 0–180 min', ['fire', 'tunnel', 'rws'], 'typical'),
  curveItem('rabt-ztv-road', 'RABT-ZTV road tunnel curve (car)', 'RABT-ZTV veitunnel (bil)', 'fire-curve', 'rabt-ztv-road', { duration: 7200 },
    { text: 'RABT-ZTV (Germany), road: 5 min rise to 1200 °C, 25 min plateau, 110 min cooling — transcribed, verify' },
    'Tabulated points', ['fire', 'tunnel', 'rabt'], 'typical'),
  curveItem('rabt-ztv-rail', 'RABT-ZTV rail tunnel curve (train)', 'RABT-ZTV jernbanetunnel (tog)', 'fire-curve', 'rabt-ztv-rail', { duration: 7200 },
    { text: 'RABT-ZTV (Germany), rail: 5 min rise to 1200 °C, 55 min plateau, 110 min cooling — transcribed, verify' },
    'Tabulated points', ['fire', 'tunnel', 'rabt', 'rail'], 'typical'),
  curveItem('astm-e119', 'ASTM E119 standard fire', 'ASTM E119 standardbrann', 'fire-curve', 'astm-e119', { duration: 7200 },
    { text: 'ASTM E119, standard time-temperature curve, tabulated (538 °C at 5 min, 927 °C at 1 h, 1010 °C at 2 h, 1093 °C at 4 h, 1260 °C at 8 h)' },
    'Tabulated points 0–480 min', ['fire', 'astm', 'us']),
  curveItem('iso834-cooling', 'ISO 834 with cooling phase', 'ISO 834 med avkjøling', 'fire-curve', 'cooling',
    { base: 'iso834', tCool: 3600, coolDuration: 3600, ambient: 20, duration: 10800 }, EN1991,
    'Any base curve up to t_cool, then linear decrease to ambient over coolDuration', ['fire', 'brann', 'cooling', 'avkjøling', 'residual']),
  curveItem('constant', 'Constant temperature', 'Konstant temperatur', 'climate-series', 'constant', { value: 20, duration: 86400 },
    { text: 'Generator' }, 'A constant value', ['climate', 'klima', 'constant', 'konstant', 'indoor']),
  curveItem('step', 'Step change', 'Sprang', 'climate-series', 'step', { before: 20, after: 0, tStep: 3600, duration: 86400 },
    { text: 'Generator' }, 'Value `before` until tStep, then `after`', ['climate', 'step', 'sprang']),
  curveItem('ramp', 'Linear ramp', 'Lineær rampe', 'climate-series', 'ramp', { from: 20, to: -20, tStart: 0, tEnd: 86400, duration: 86400 },
    { text: 'Generator' }, 'Linear change from `from` to `to` between tStart and tEnd', ['climate', 'ramp', 'rampe']),
  curveItem('sinusoid-daily', 'Daily sinusoidal swing', 'Døgnsvingning (sinus)', 'climate-series', 'sinusoid',
    { mean: 0, amplitude: 5, period: 86400, phase: 54000, duration: 7 * 86400 }, { text: 'Generator' },
    'mean + amplitude·cos(2π(t − phase)/period); phase = time of the maximum (15:00 default)', ['climate', 'klima', 'daily', 'døgn', 'outdoor']),
  curveItem('sinusoid-annual', 'Annual sinusoidal swing', 'Årssvingning (sinus)', 'climate-series', 'sinusoid',
    { mean: 6, amplitude: 11, period: 365 * 86400, phase: 200 * 86400, duration: 365 * 86400, step: 3600 }, { text: 'Generator' },
    'Annual outdoor temperature approximation; mean 6 °C and amplitude 11 K are typical for southern Norway (adjust)', ['climate', 'klima', 'annual', 'år', 'outdoor'], 'typical'),
];

/** Build a TimeSeries from a curve library item (params override the item's defaults). */
export function seriesFromLibrary(item: LibraryItem, params: Params = {}, duration?: number, id?: string): TimeSeries {
  if (!item.curve) throw new Error(`Library item '${item.id}' is not a curve`);
  const merged: Params = { ...item.curve.params, ...params };
  const D = duration ?? (merged.duration !== undefined ? Number(merged.duration) : undefined);
  const points = generateCurve(item.curve.generator, merged, D);
  return {
    id: id ?? `ts_${item.id}`,
    name: item.nameNb ?? item.name,
    points,
    interpolation: 'linear',
    afterEnd: 'hold',
    unit: item.curve.unit,
    source: { kind: 'preset', ref: item.id, citation: item.source, params: { ...merged, duration: points[points.length - 1][0] } },
  };
}
