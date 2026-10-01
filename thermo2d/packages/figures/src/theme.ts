/** Themes and colour scales shared by every figure. */

export type Theme = 'light' | 'dark' | 'print';

export interface ThemeColors {
  bg: string;
  fg: string;
  muted: string;
  grid: string;
  axis: string;
  accent: string;
  outline: string;
  font: string;
}

export const THEMES: Record<Theme, ThemeColors> = {
  light: { bg: '#ffffff', fg: '#1b1f24', muted: '#6b7280', grid: '#e5e7eb', axis: '#374151', accent: '#2563eb', outline: '#111827', font: 'Segoe UI, Arial, Helvetica, sans-serif' },
  dark: { bg: '#0f172a', fg: '#e5e7eb', muted: '#94a3b8', grid: '#1f2937', axis: '#cbd5e1', accent: '#60a5fa', outline: '#f1f5f9', font: 'Segoe UI, Arial, Helvetica, sans-serif' },
  print: { bg: '#ffffff', fg: '#000000', muted: '#444444', grid: '#dddddd', axis: '#000000', accent: '#000000', outline: '#000000', font: 'Arial, Helvetica, sans-serif' },
};

/** Categorical colours for probe/series lines (colour-blind friendly, distinct in light and dark). */
export const SERIES_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#9333ea', '#ea580c', '#0d9488', '#4f46e5', '#b91c1c', '#059669', '#c026d3', '#78716c',
];

/** Colours used for boundary-condition types in model figures. */
export const BC_COLORS: Record<string, string> = {
  fixed: '#7c3aed',
  convection: '#0891b2',
  'convection-radiation': '#dc2626',
  flux: '#d97706',
  insulated: '#9ca3af',
};

/** Region fill colours by material category (light, so labels stay readable). */
export const CATEGORY_FILL: Record<string, string> = {
  concrete: '#d6d3d1',
  insulation: '#fef3c7',
  wood: '#fde68a',
  gypsum: '#f3e8ff',
  metal: '#cbd5e1',
  masonry: '#fecaca',
  air: '#e0f2fe',
  ground: '#d9f99d',
  membrane: '#e5e7eb',
  custom: '#e5e7eb',
  none: '#f3f4f6',
};

/**
 * Sequential temperature palette: blue (cold) → cyan → green → yellow → orange → red → magenta → white (hot).
 * Fixed stops in normalised [0, 1]; the caller maps its band range onto it.
 */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [30, 60, 200]],
  [0.12, [40, 130, 240]],
  [0.25, [40, 200, 220]],
  [0.37, [60, 200, 90]],
  [0.5, [220, 220, 40]],
  [0.62, [250, 160, 30]],
  [0.75, [230, 60, 30]],
  [0.87, [200, 30, 120]],
  [1.0, [255, 255, 255]],
];

export function sequentialColor(u: number): string {
  const x = Math.max(0, Math.min(1, u));
  for (let i = 1; i < STOPS.length; i++) {
    const [u1, c1] = STOPS[i];
    if (x <= u1) {
      const [u0, c0] = STOPS[i - 1];
      const f = u1 === u0 ? 0 : (x - u0) / (u1 - u0);
      return rgb(c0.map((a, k) => a + (c1[k] - a) * f) as [number, number, number]);
    }
  }
  return rgb(STOPS[STOPS.length - 1][1]);
}

/** Diverging palette for difference fields: blue (negative) → white (0) → red (positive). */
export function divergingColor(u: number): string {
  const x = Math.max(-1, Math.min(1, u));
  const blue: [number, number, number] = [33, 102, 172];
  const white: [number, number, number] = [247, 247, 247];
  const red: [number, number, number] = [178, 24, 43];
  const from = x < 0 ? blue : red;
  const f = Math.abs(x);
  return rgb(white.map((a, k) => a + (from[k] - a) * f) as [number, number, number]);
}

function rgb(c: [number, number, number]): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export interface Bands {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_BANDS: Bands = { min: 0, max: 1100, step: 100 };

/** Colour of the band a value falls in (band k spans [min + k·step, min + (k+1)·step)). */
export function bandColor(value: number, bands: Bands): string {
  const n = Math.max(1, Math.round((bands.max - bands.min) / bands.step));
  const k = Math.max(0, Math.min(n - 1, Math.floor((value - bands.min) / bands.step)));
  return sequentialColor(n === 1 ? 0.5 : k / (n - 1));
}

export function bandEdges(bands: Bands): number[] {
  const n = Math.max(1, Math.round((bands.max - bands.min) / bands.step));
  const out: number[] = [];
  for (let k = 0; k <= n; k++) out.push(bands.min + k * bands.step);
  return out;
}
