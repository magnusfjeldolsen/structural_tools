import { useMemo, useState } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import { downloadBlob, formatTemp, safeFileName, toCsv, toTsv } from './format.js';
import { probeValueAt } from './fieldUtils.js';
import type { TFn } from './i18n.js';

export interface ResultTableProps {
  project: Project;
  result: RunResult;
  times: number[];
  onTimesChange: (times: number[]) => void;
  tr: TFn;
}

/** Probes × selected times, copy as TSV (Excel paste) or download CSV in the project locale. */
export function ResultTable({ project, result, times, onTimesChange, tr }: ResultTableProps) {
  const [typed, setTyped] = useState(times.map((t) => (t / 60).toString()).join(', '));
  const [copied, setCopied] = useState(false);
  const names = useMemo(() => new Map(project.probes.map((p) => [p.id, p.name])), [project.probes]);
  const steady = result.mode === 'steady';
  const cols = steady ? [0] : times;

  const rows = useMemo(
    () =>
      result.probes.map((p) => ({
        id: p.id,
        name: names.get(p.id) ?? p.id,
        x: p.position[0],
        y: p.position[1],
        values: cols.map((tt) => (p.found ? probeValueAt(result, p.id, tt) : null)),
      })),
    [result, names, cols],
  );

  const header = [tr('probe'), `${tr('x')} (mm)`, `${tr('y')} (mm)`, ...cols.map((tt) => (steady ? '°C' : `${Math.round(tt / 6) / 10} min`))];
  const data = rows.map((r) => [r.name, r.x, r.y, ...r.values]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toTsv([header, ...data], project.settings.csv, 1));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const csv = () => downloadBlob(`${safeFileName(project.name)}_tabell.csv`, toCsv([header, ...data], project.settings.csv, 1), 'text/csv;charset=utf-8');

  const applyTimes = () => {
    const parsed = typed
      .split(/[,;\s]+/)
      .map((s) => parseFloat(s.replace(',', '.')))
      .filter((v) => isFinite(v) && v >= 0)
      .map((m) => m * 60);
    if (parsed.length) onTimesChange([...new Set(parsed)].sort((a, b) => a - b));
  };

  if (result.probes.length === 0) return <p className="t2d-hint">{tr('noProbes')}</p>;

  return (
    <>
      {!steady && (
        <div className="t2d-row">
          <label>
            {tr('times')}
            <input type="text" style={{ width: 160 }} value={typed} onChange={(e) => setTyped(e.target.value)} onBlur={applyTimes} onKeyDown={(e) => e.key === 'Enter' && applyTimes()} />
          </label>
        </div>
      )}
      <div className="t2d-row">
        <button onClick={copy}>{copied ? tr('copied') : tr('copy')}</button>
        <button onClick={csv}>{tr('csv')}</button>
      </div>
      <table className="t2d-table">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.x.toFixed(1)}</td>
              <td>{r.y.toFixed(1)}</td>
              {r.values.map((v, i) => (
                <td key={i}>{formatTemp(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
