/** CSV helpers with locale control (Norwegian Excel: ';' and decimal comma). */
import type { Mesh, Project, RunResult } from '@thermo2d/core';

export interface CsvLocale {
  separator: ',' | ';';
  decimal: '.' | ',';
}

export const CSV_NB: CsvLocale = { separator: ';', decimal: ',' };
export const CSV_EN: CsvLocale = { separator: ',', decimal: '.' };

export function csvLocale(project?: Project | null, override?: Partial<CsvLocale>): CsvLocale {
  const base = project?.settings.csv ?? CSV_NB;
  return { separator: override?.separator ?? base.separator, decimal: override?.decimal ?? base.decimal };
}

export function csvNumber(v: number | null | undefined, loc: CsvLocale, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const s = (Math.round(v * 10 ** digits) / 10 ** digits).toString();
  return loc.decimal === ',' ? s.replace('.', ',') : s;
}

function cell(v: unknown, loc: CsvLocale): string {
  if (typeof v === 'number') return csvNumber(v, loc);
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of mixed values to CSV text (CRLF line endings for Windows Excel). */
export function tableToCsv(header: unknown[], rows: unknown[][], loc: CsvLocale = CSV_NB): string {
  const lines = [header, ...rows].map((r) => r.map((v) => cell(v, loc)).join(loc.separator));
  return lines.join('\r\n') + '\r\n';
}

/** Probe histories: t [s], t [min], one column per probe. */
export function probesToCsv(result: RunResult, project?: Project | null, loc: CsvLocale = csvLocale(project)): string {
  const names = result.probes.map((p) => project?.probes.find((q) => q.id === p.id)?.name ?? p.id);
  const header = ['t [s]', 't [min]', ...names.map((nm) => `${nm} [°C]`)];
  const rows: unknown[][] = [];
  for (let i = 0; i < result.probeTimes.length; i++) {
    const t = result.probeTimes[i];
    rows.push([t, t / 60, ...result.probeValues.map((v) => v[i])]);
  }
  return tableToCsv(header, rows, loc);
}

/** Nodal field at one time: x [mm], y [mm], θ [°C]. */
export function fieldToCsv(mesh: Mesh, field: ArrayLike<number>, loc: CsvLocale = CSV_NB): string {
  const rows: unknown[][] = [];
  for (let i = 0; i < field.length; i++) rows.push([mesh.nodes[2 * i], mesh.nodes[2 * i + 1], field[i]]);
  return tableToCsv(['x [mm]', 'y [mm]', 'theta [°C]'], rows, loc);
}

/** Probes × selected times table (values interpolated in probe histories). */
export function probeTableRows(result: RunResult, times: number[], project?: Project | null): { header: string[]; rows: (string | number)[][] } {
  const header = ['Probe', 'x [mm]', 'y [mm]', ...times.map((t) => `${Math.round((t / 60) * 10) / 10} min`)];
  const rows = result.probes.map((p, k) => {
    const name = project?.probes.find((q) => q.id === p.id)?.name ?? p.id;
    return [name, p.position[0], p.position[1], ...times.map((t) => sampleSeries(result.probeTimes, result.probeValues[k], t))];
  });
  return { header, rows };
}

/** Linear interpolation in a (t, v) history; holds the ends. */
export function sampleSeries(t: ArrayLike<number>, v: ArrayLike<number>, at: number): number {
  const N = t.length;
  if (!N) return NaN;
  if (at <= t[0]) return v[0];
  if (at >= t[N - 1]) return v[N - 1];
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= at) lo = mid;
    else hi = mid;
  }
  const f = (at - t[lo]) / (t[hi] - t[lo] || 1);
  return v[lo] + (v[hi] - v[lo]) * f;
}
