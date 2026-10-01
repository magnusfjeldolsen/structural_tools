/**
 * Time-series import from pasted text, CSV files and EPW weather files.
 * Norwegian Excel (semicolon separator, decimal comma), tab-separated paste,
 * header rows, ISO 8601 timestamps and Excel serial dates are handled. Gaps are
 * reported, never filled.
 */
import type { Points } from './curves.js';

export type TimeUnit = 's' | 'min' | 'h' | 'd' | 'iso8601' | 'excel';

export interface ImportOptions {
  /** Force the time unit; otherwise detected from the header / magnitudes. */
  timeUnit?: TimeUnit;
  /** Column indices (0-based) for time and value; otherwise detected. */
  timeColumn?: number;
  valueColumn?: number;
  separator?: string;
  decimal?: '.' | ',';
  /** Value unit hint for the report. */
  valueUnit?: '°C' | 'W/m²';
}

export interface ImportReport {
  ok: boolean;
  points: Points;
  rows: number;
  skippedRows: number;
  separator: string;
  decimal: '.' | ',';
  timeUnit: TimeUnit;
  timeColumn: number;
  valueColumn: number;
  columns: string[];
  valueUnit: '°C' | 'W/m²' | 'unknown';
  range: { tStart: number; tEnd: number; vMin: number; vMax: number } | null;
  /** Median time step in s. */
  step: number | null;
  /** Intervals [t0, t1] (s) where the step is more than 1.5× the median. */
  gaps: [number, number][];
  warnings: string[];
  errors: string[];
}

function detectSeparator(lines: string[]): string {
  const cands = [';', '\t', ',', ' '];
  let best = ';';
  let bestScore = -1;
  for (const c of cands) {
    const counts = lines.slice(0, 20).map((l) => (c === ' ' ? l.trim().split(/\s+/).length - 1 : l.split(c).length - 1));
    const nonzero = counts.filter((x) => x > 0).length;
    const consistent = nonzero > 0 && counts.filter((x) => x === counts.find((y) => y > 0)).length;
    const score = nonzero * 10 + (consistent || 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function splitLine(line: string, sep: string): string[] {
  if (sep === ' ') return line.trim().split(/\s+/);
  return line.split(sep).map((s) => s.trim().replace(/^"|"$/g, ''));
}

function parseNumber(s: string, decimal: '.' | ','): number {
  let t = s.trim();
  if (t === '') return NaN;
  if (decimal === ',') t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  t = t.replace(/\s/g, '');
  return Number(t);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NB_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function parseTimestamp(s: string): number | null {
  const t = s.trim();
  if (ISO_RE.test(t)) {
    const ms = Date.parse(t.includes('T') || t.includes(' ') ? t.replace(' ', 'T') : t);
    return Number.isFinite(ms) ? ms : null;
  }
  const m = NB_DATE_RE.exec(t);
  if (m) {
    const ms = Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function unitFromHeader(h: string): TimeUnit | null {
  const s = h.toLowerCase();
  if (/\[\s*s\s*\]|\(s\)|sek|second/.test(s)) return 's';
  if (/min/.test(s)) return 'min';
  if (/\[\s*h\s*\]|\(h\)|hour|time(r)?\b/.test(s) && !/time\s*\[?s/.test(s)) return 'h';
  if (/day|dag|\[d\]/.test(s)) return 'd';
  if (/date|dato|timestamp/.test(s)) return 'iso8601';
  return null;
}

function toSeconds(v: number, unit: TimeUnit): number {
  switch (unit) {
    case 's':
      return v;
    case 'min':
      return v * 60;
    case 'h':
      return v * 3600;
    case 'd':
      return v * 86400;
    case 'excel':
      return v * 86400;
    case 'iso8601':
      return v / 1000;
  }
}

/** Parse pasted text / CSV into [t s, value] points with a report of what was understood. */
export function parseTimeSeriesText(text: string, opts: ImportOptions = {}): ImportReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^﻿/, ''))
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const empty = (msg: string): ImportReport => ({
    ok: false,
    points: [],
    rows: 0,
    skippedRows: 0,
    separator: opts.separator ?? ';',
    decimal: opts.decimal ?? '.',
    timeUnit: opts.timeUnit ?? 's',
    timeColumn: 0,
    valueColumn: 1,
    columns: [],
    valueUnit: opts.valueUnit ?? 'unknown',
    range: null,
    step: null,
    gaps: [],
    warnings,
    errors: [...errors, msg],
  });
  if (lines.length === 0) return empty('No data lines found');

  const sep = opts.separator ?? detectSeparator(lines);
  const rowsRaw = lines.map((l) => splitLine(l, sep));
  // header: first row with a non-numeric, non-timestamp cell
  const isNumericLike = (s: string) => /^[-+]?[\d\s.,]+(e[-+]?\d+)?$/i.test(s.trim()) && /\d/.test(s);
  const first = rowsRaw[0];
  const hasHeader = first.some((c) => !isNumericLike(c) && parseTimestamp(c) === null);
  const columns = hasHeader ? first : first.map((_, i) => `col${i + 1}`);
  const body = hasHeader ? rowsRaw.slice(1) : rowsRaw;
  if (body.length === 0) return empty('Only a header row was found');

  // decimal detection: comma decimal if numbers contain a single comma and no dot, and the separator is not a comma
  let decimal: '.' | ',' = opts.decimal ?? '.';
  if (!opts.decimal) {
    const sample = body.slice(0, 50).flat();
    const commaNums = sample.filter((c) => /^[-+]?\d+,\d+$/.test(c.trim())).length;
    const dotNums = sample.filter((c) => /^[-+]?\d+\.\d+$/.test(c.trim())).length;
    decimal = sep !== ',' && commaNums > dotNums ? ',' : '.';
  }

  const timeColumn = opts.timeColumn ?? 0;
  const valueColumn = opts.valueColumn ?? (body[0].length > 1 ? 1 : 0);
  if (body[0].length < 2 && timeColumn === valueColumn) {
    warnings.push('Only one column found; row index used as time in the chosen unit');
  }

  // time unit detection
  let timeUnit: TimeUnit | null = opts.timeUnit ?? null;
  const tCell0 = body[0][timeColumn] ?? '';
  const numericT = body.map((r) => parseNumber(r[timeColumn] ?? '', decimal));
  if (!timeUnit) {
    if (parseTimestamp(tCell0) !== null) timeUnit = 'iso8601';
    else if (hasHeader) {
      const fromHeader = unitFromHeader(columns[timeColumn] ?? '');
      // a "date" header with numeric cells is an Excel serial date column
      timeUnit = fromHeader === 'iso8601' ? null : fromHeader;
    }
  }
  if (!timeUnit) {
    const finite = numericT.filter(Number.isFinite);
    const minT = finite.length ? Math.min(...finite) : 0;
    const maxT = finite.length ? Math.max(...finite) : 0;
    if (finite.length && minT > 20000 && maxT < 80000) {
      timeUnit = 'excel';
      warnings.push('Time column looks like Excel serial dates; interpreted as days since 1899-12-30 (seconds from the first row)');
    } else {
      timeUnit = 's';
      warnings.push('Time unit assumed to be seconds; set it explicitly if wrong');
    }
  }

  const points: Points = [];
  let skipped = 0;
  let t0ms: number | null = null;
  let excel0: number | null = null;
  body.forEach((r, i) => {
    const tCell = r[timeColumn] ?? '';
    const vCell = r[valueColumn] ?? '';
    let t: number;
    if (timeUnit === 'iso8601') {
      const ms = parseTimestamp(tCell);
      if (ms === null) {
        skipped++;
        return;
      }
      if (t0ms === null) t0ms = ms;
      t = (ms - t0ms) / 1000;
    } else if (body[0].length < 2) {
      t = toSeconds(i, timeUnit!);
    } else {
      const n = parseNumber(tCell, decimal);
      if (!Number.isFinite(n)) {
        skipped++;
        return;
      }
      if (timeUnit === 'excel') {
        if (excel0 === null) excel0 = n;
        t = (n - excel0) * 86400;
      } else t = toSeconds(n, timeUnit!);
    }
    const v = parseNumber(vCell, decimal);
    if (!Number.isFinite(v)) {
      skipped++;
      return;
    }
    points.push([t, v]);
  });
  if (skipped > 0) warnings.push(`${skipped} row(s) skipped because time or value could not be read`);
  if (points.length < 2) {
    return { ...empty('Fewer than two valid rows'), separator: sep, decimal, timeUnit: timeUnit!, columns, rows: body.length, skippedRows: skipped };
  }
  points.sort((a, b) => a[0] - b[0]);
  // duplicates
  const deduped: Points = [];
  let dup = 0;
  for (const p of points) {
    if (deduped.length && Math.abs(deduped[deduped.length - 1][0] - p[0]) < 1e-9) {
      dup++;
      deduped[deduped.length - 1] = p;
    } else deduped.push(p);
  }
  if (dup) warnings.push(`${dup} duplicate time(s) collapsed (last value kept)`);

  const steps = deduped.slice(1).map((p, i) => p[0] - deduped[i][0]).sort((a, b) => a - b);
  const median = steps.length ? steps[Math.floor(steps.length / 2)] : null;
  const gaps: [number, number][] = [];
  if (median && median > 0) {
    for (let i = 1; i < deduped.length; i++) {
      if (deduped[i][0] - deduped[i - 1][0] > 1.5 * median) gaps.push([deduped[i - 1][0], deduped[i][0]]);
    }
  }
  if (gaps.length) warnings.push(`${gaps.length} gap(s) in the time axis; values are interpolated across them by the solver unless you fix the data`);

  const vs = deduped.map((p) => p[1]);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  let valueUnit: ImportReport['valueUnit'] = opts.valueUnit ?? 'unknown';
  if (valueUnit === 'unknown') {
    const h = (columns[valueColumn] ?? '').toLowerCase();
    if (/w\/m|flux|irrad|sol/.test(h)) valueUnit = 'W/m²';
    else if (/°c|temp|grad/.test(h) || (vMin > -60 && vMax < 1400)) valueUnit = '°C';
  }
  return {
    ok: true,
    points: deduped,
    rows: body.length,
    skippedRows: skipped,
    separator: sep,
    decimal,
    timeUnit: timeUnit!,
    timeColumn,
    valueColumn,
    columns,
    valueUnit,
    range: { tStart: deduped[0][0], tEnd: deduped[deduped.length - 1][0], vMin, vMax },
    step: median,
    gaps,
    warnings,
    errors,
  };
}

/** Resample by linear interpolation onto a regular grid of step dt (s). */
export function resample(points: Points, dt: number): Points {
  if (points.length === 0 || dt <= 0) return [...points];
  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const out: Points = [];
  let j = 0;
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    while (j < points.length - 2 && points[j + 1][0] < t) j++;
    const [ta, va] = points[j];
    const [tb, vb] = points[Math.min(j + 1, points.length - 1)];
    const v = tb === ta ? va : va + ((vb - va) * (t - ta)) / (tb - ta);
    out.push([+t.toFixed(9), v]);
  }
  return out;
}

/**
 * EPW weather file: 8 header lines, then hourly rows with dry-bulb temperature in column 7 (0-based 6).
 * Returns the hourly series in seconds from the first row.
 */
export function parseEpw(text: string, column = 6): ImportReport {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const warnings: string[] = [];
  const errors: string[] = [];
  const header = lines[0] ?? '';
  const location = header.startsWith('LOCATION') ? header.split(',').slice(1, 4).join(', ') : '';
  const body = lines.slice(8).filter((l) => l.trim() !== '');
  const points: Points = [];
  let skipped = 0;
  body.forEach((l, i) => {
    const cells = l.split(',');
    const v = Number(cells[column]);
    if (!Number.isFinite(v) || v === 99.9 || v === 9999) {
      skipped++;
      return;
    }
    points.push([i * 3600, v]);
  });
  if (location) warnings.push(`EPW location: ${location}`);
  if (skipped) warnings.push(`${skipped} hour(s) missing (99.9 / non-numeric) and left out`);
  if (points.length < 2) errors.push('No usable rows in the EPW file');
  const gaps: [number, number][] = [];
  for (let i = 1; i < points.length; i++) if (points[i][0] - points[i - 1][0] > 3600 * 1.5) gaps.push([points[i - 1][0], points[i][0]]);
  const vs = points.map((p) => p[1]);
  return {
    ok: errors.length === 0,
    points,
    rows: body.length,
    skippedRows: skipped,
    separator: ',',
    decimal: '.',
    timeUnit: 'h',
    timeColumn: -1,
    valueColumn: column,
    columns: ['year', 'month', 'day', 'hour', 'minute', 'flags', 'dry-bulb °C'],
    valueUnit: column === 6 ? '°C' : 'unknown',
    range: points.length ? { tStart: points[0][0], tEnd: points[points.length - 1][0], vMin: Math.min(...vs), vMax: Math.max(...vs) } : null,
    step: 3600,
    gaps,
    warnings,
    errors,
  };
}
