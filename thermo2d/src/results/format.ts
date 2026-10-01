/** Number/time formatting and CSV helpers for the results panels (pure, tested). */

export interface CsvLocale {
  separator: ',' | ';';
  decimal: '.' | ',';
}

export function formatTemp(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !isFinite(v)) return '–';
  return v.toFixed(decimals);
}

/** Seconds → "90 min", "1.5 h", "45 s", "12 d". */
export function formatTime(t: number): string {
  if (!isFinite(t)) return '–';
  if (t < 600) return `${trim(t, 1)} s`;
  if (t < 36000) return `${trim(t / 60, 1)} min`;
  if (t < 3 * 86400) return `${trim(t / 3600, 2)} h`;
  return `${trim(t / 86400, 2)} d`;
}

function trim(v: number, d: number): string {
  return v.toFixed(d).replace(/\.?0+$/, '');
}

/** Parse "90", "90 min", "1.5h", "3600 s", "2 d" → seconds; a bare number is minutes when `bareUnit` says so. */
export function parseTime(text: string, bareUnit: 's' | 'min' = 'min'): number | null {
  const m = text.trim().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(s|sek|min|m|h|t|d)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] ?? bareUnit).toLowerCase();
  const k = u === 's' || u === 'sek' ? 1 : u === 'h' || u === 't' ? 3600 : u === 'd' ? 86400 : 60;
  return v * k;
}

/** Format a number for a CSV cell honouring the decimal mark. */
export function csvNumber(v: number | null | undefined, locale: CsvLocale, decimals = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return '';
  const s = v.toFixed(decimals);
  return locale.decimal === ',' ? s.replace('.', ',') : s;
}

function csvCell(s: string, locale: CsvLocale): string {
  return /["\n\r]/.test(s) || s.includes(locale.separator) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of strings/numbers → CSV text with CRLF line endings (Excel on Windows). */
export function toCsv(rows: (string | number | null)[][], locale: CsvLocale, decimals = 2): string {
  return rows
    .map((r) => r.map((c) => (typeof c === 'number' ? csvNumber(c, locale, decimals) : csvCell(c ?? '', locale))).join(locale.separator))
    .join('\r\n');
}

/** Tab-separated text for the clipboard (Excel paste); decimal mark from the locale. */
export function toTsv(rows: (string | number | null)[][], locale: CsvLocale, decimals = 2): string {
  return rows.map((r) => r.map((c) => (typeof c === 'number' ? csvNumber(c, locale, decimals) : (c ?? ''))).join('\t')).join('\r\n');
}

/** Default report times for a run: 30/60/90/120 min clipped to the duration, always including the end. */
export function defaultReportTimes(duration: number): number[] {
  const candidates = [1800, 3600, 5400, 7200];
  const out = candidates.filter((t) => t < duration - 1e-6);
  if (duration > 0 && !out.includes(duration)) out.push(duration);
  if (out.length === 1 && duration > 0) {
    const n = 4;
    for (let i = 1; i < n; i++) out.unshift((duration * (n - i)) / n);
    out.sort((a, b) => a - b);
  }
  return out;
}

/** Index of the snapshot time closest to t. */
export function nearestIndex(times: ArrayLike<number>, t: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - t);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Trigger a browser download (no-op outside a DOM). */
export function downloadBlob(name: string, data: Blob | string, mime = 'text/plain;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = data instanceof Blob ? data : new Blob(['﻿', data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function safeFileName(s: string): string {
  return s.replace(/[^\w\-. æøåÆØÅ]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'thermo2d';
}
