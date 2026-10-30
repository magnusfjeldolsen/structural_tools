/**
 * spectrum-svg.js — tegner dimensjonerende spekter som en SVG-streng.
 *
 * Samme funksjon brukes på skjermen (mørkt tema, med hover) og i rapporten
 * (lyst tema, fast størrelse). Ingen D3: rapporten må kunne tegnes uten at
 * noe er montert i DOM-en, og et lyst plott skal ikke arve skjermfargene.
 */
import { spectrumCurve } from './ec8-core.js';

const THEMES = {
  screen: { text: '#e5e7eb', muted: '#9ca3af', grid: '#374151', axis: '#9ca3af', curve: '#60a5fa', marker: '#fbbf24', point: '#f87171', limit: '#34d399' },
  print:  { text: '#111827', muted: '#4b5563', grid: '#e5e7eb', axis: '#374151', curve: '#1d4ed8', marker: '#6b7280', point: '#b91c1c', limit: '#047857' }
};

const num = (v, d = 2) => v.toFixed(d).replace('.', ',');

function niceStep(range, targetTicks) {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/**
 * spectrum: resultat.spectrum fra compute(). opts = {
 *   width, height, theme: 'screen' | 'print', point: { T, Sd } | null,
 *   limit: tall (horisontal grenselinje) | null, fontSize
 * }
 */
export function spectrumSvg(spectrum, opts = {}) {
  const { width = 640, height = 300, theme = 'screen', point = null, limit = null, fontSize = 11 } = opts;
  const c = THEMES[theme];
  const m = { top: 14, right: 16, bottom: 34, left: 46 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const Tmax = Math.max(4, point && point.T ? Math.ceil(point.T + 0.5) : 0);
  const curve = spectrumCurve(spectrum, Tmax);
  const yTop = Math.max(...curve.map(p => p.Sd), point?.Sd ?? 0, limit ?? 0) * 1.12 || 1;

  const x = T => m.left + (T / Tmax) * w;
  const y = S => m.top + h - (S / yTop) * h;

  const parts = [];
  const xStep = niceStep(Tmax, 8);
  const yStep = niceStep(yTop, 5);
  const yDec = yStep < 0.1 ? 2 : yStep < 1 ? 1 : 0;

  for (let t = 0; t <= Tmax + 1e-9; t += xStep) {
    parts.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${m.top}" y2="${m.top + h}" stroke="${c.grid}" stroke-width="0.5"/>`);
    parts.push(`<text x="${x(t)}" y="${m.top + h + fontSize + 3}" fill="${c.muted}" font-size="${fontSize}" text-anchor="middle">${num(t, xStep < 1 ? 1 : 0)}</text>`);
  }
  for (let s = 0; s <= yTop + 1e-9; s += yStep) {
    parts.push(`<line x1="${m.left}" x2="${m.left + w}" y1="${y(s)}" y2="${y(s)}" stroke="${c.grid}" stroke-width="0.5"/>`);
    parts.push(`<text x="${m.left - 5}" y="${y(s) + fontSize / 3}" fill="${c.muted}" font-size="${fontSize}" text-anchor="end">${num(s, yDec)}</text>`);
  }
  parts.push(`<line x1="${m.left}" x2="${m.left + w}" y1="${m.top + h}" y2="${m.top + h}" stroke="${c.axis}"/>`);
  parts.push(`<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${m.top + h}" stroke="${c.axis}"/>`);
  parts.push(`<text x="${m.left + w / 2}" y="${height - 4}" fill="${c.text}" font-size="${fontSize}" text-anchor="middle">Periode T [s]</text>`);
  parts.push(`<text transform="translate(${fontSize},${m.top + h / 2}) rotate(-90)" fill="${c.text}" font-size="${fontSize}" text-anchor="middle">S<tspan baseline-shift="sub" font-size="${fontSize * 0.75}">d</tspan>(T) [m/s²]</text>`);

  // Etikettene trappes nedover: TB og TC ligger ofte bare 0,2 s fra hverandre.
  for (const [k, [key, T]] of [['B', spectrum.TB], ['C', spectrum.TC], ['D', spectrum.TD]].entries()) {
    if (T > Tmax) continue;
    const ly = m.top + fontSize * (1 + k * 0.9);
    parts.push(`<line x1="${x(T)}" x2="${x(T)}" y1="${m.top}" y2="${m.top + h}" stroke="${c.marker}" stroke-dasharray="3 3" stroke-width="0.8"/>`);
    parts.push(`<text x="${x(T) + 3}" y="${ly}" fill="${c.marker}" font-size="${fontSize * 0.9}">T<tspan baseline-shift="sub" font-size="${fontSize * 0.7}">${key}</tspan></text>`);
  }

  if (limit !== null) {
    parts.push(`<line x1="${m.left}" x2="${m.left + w}" y1="${y(limit)}" y2="${y(limit)}" stroke="${c.limit}" stroke-dasharray="6 3" stroke-width="1"/>`);
    parts.push(`<text x="${m.left + w - 3}" y="${y(limit) - 4}" fill="${c.limit}" font-size="${fontSize * 0.9}" text-anchor="end">Grense ${num(limit)} m/s²</text>`);
  }

  const d = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.T).toFixed(2)},${y(p.Sd).toFixed(2)}`).join('');
  parts.push(`<path d="${d}" fill="none" stroke="${c.curve}" stroke-width="2"/>`);

  if (point && Number.isFinite(point.Sd)) {
    if (Number.isFinite(point.T)) {
      parts.push(`<line x1="${x(point.T)}" x2="${x(point.T)}" y1="${y(point.Sd)}" y2="${m.top + h}" stroke="${c.point}" stroke-dasharray="2 2"/>`);
      parts.push(`<circle cx="${x(point.T)}" cy="${y(point.Sd)}" r="4" fill="${c.point}"/>`);
      const right = x(point.T) < m.left + w * 0.7;
      parts.push(`<text x="${x(point.T) + (right ? 7 : -7)}" y="${y(point.Sd) - 7}" fill="${c.point}" font-size="${fontSize}" text-anchor="${right ? 'start' : 'end'}">T₁ = ${num(point.T)} s, S<tspan baseline-shift="sub" font-size="${fontSize * 0.75}">d</tspan> = ${num(point.Sd)} m/s²</text>`);
    } else {
      // Sd fra modalanalyse uten periode: vis som horisontal linje.
      parts.push(`<line x1="${m.left}" x2="${m.left + w}" y1="${y(point.Sd)}" y2="${y(point.Sd)}" stroke="${c.point}" stroke-dasharray="2 2"/>`);
      parts.push(`<text x="${m.left + 4}" y="${y(point.Sd) - 4}" fill="${c.point}" font-size="${fontSize}">S<tspan baseline-shift="sub" font-size="${fontSize * 0.75}">d,maks</tspan> = ${num(point.Sd)} m/s² (modalanalyse)</text>`);
    }
  }

  // data-* lar skjermversjonen regne om musposisjon til periode uten å kjenne layouten.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" font-family="inherit"`
    + ` data-x0="${m.left}" data-x1="${m.left + w}" data-y0="${m.top}" data-y1="${m.top + h}" data-tmax="${Tmax}" data-ytop="${yTop}">`
    + parts.join('') + '<g class="hover"></g></svg>';
}
