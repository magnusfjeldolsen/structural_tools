import { useMemo } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import { compileSeries, evaluateMetrics } from '@thermo2d/core';
import { LineChart, type LineSeries } from '../charts/LineChart.js';
import { seriesColor } from './fieldUtils.js';
import { formatTime } from './format.js';
import type { TFn } from './i18n.js';

export interface ComparePanelProps {
  project: Project;
  results: { label: string; result: RunResult }[];
  t: number;
  onSelectTime: (t: number) => void;
  tr: TFn;
  selectedProbes: Set<string>;
  showDiff: boolean;
  onShowDiff: (v: boolean) => void;
  /** Index of the variant (B) to compare with the first entry (A). */
  variant: number;
  onVariant: (i: number) => void;
}

const DASHES = [undefined, '6 4', '2 3', '8 3 2 3'];

/** Overlaid probe curves, difference field toggle and a side-by-side metrics table. */
export function ComparePanel({ project, results, t, onSelectTime, tr, selectedProbes, showDiff, onShowDiff, variant, onVariant }: ComparePanelProps) {
  const names = useMemo(() => new Map(project.probes.map((p) => [p.id, p.name])), [project.probes]);

  const series = useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = [];
    results.forEach((r, ri) => {
      r.result.probes.forEach((p, pi) => {
        if (!p.found || !selectedProbes.has(p.id)) return;
        out.push({ id: `${ri}:${p.id}`, name: `${names.get(p.id) ?? p.id} – ${r.label}`, t: r.result.probeTimes, v: r.result.probeValues[pi], color: seriesColor(pi), dashed: ri > 0 });
      });
    });
    return out;
  }, [results, selectedProbes, names]);

  const metricTable = useMemo(() => {
    const ev: Record<string, { at(t: number): number; name: string }> = {};
    try {
      for (const s of project.timeSeries) ev[s.id] = compileSeries(s, project.settings.ambientTemperature);
    } catch {
      /* ignore */
    }
    const perResult = results.map((r) => {
      try {
        return evaluateMetrics(project, r.result, ev) as { metricId: string; name: string; value: number | null; unit: string }[];
      } catch {
        return [];
      }
    });
    const ids = new Map<string, { name: string; unit: string }>();
    for (const list of perResult) for (const m of list) ids.set(m.metricId, { name: m.name, unit: m.unit });
    return [...ids.entries()].map(([id, meta]) => ({ id, ...meta, values: perResult.map((list) => list.find((m) => m.metricId === id)?.value ?? null) }));
  }, [project, results]);

  if (results.length < 2) return <p className="t2d-hint">{tr('compareNeedTwo')}</p>;

  const steady = results[0].result.mode === 'steady';
  const dashHint = results.map((r, i) => (
    <span key={i}>
      <span className="t2d-swatch" style={{ background: '#555', height: 2, borderTop: DASHES[i % DASHES.length] ? '2px dashed #555' : undefined }} /> {r.label}
      {i === 0 ? ` (${tr('base')})` : i === variant ? ` (${tr('variant')})` : ''}
    </span>
  ));

  return (
    <>
      <div className="t2d-row">
        <label>
          {tr('variant')}
          <select value={variant} onChange={(e) => onVariant(parseInt(e.target.value, 10))}>
            {results.slice(1).map((r, i) => (
              <option key={i + 1} value={i + 1}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={showDiff} onChange={(e) => onShowDiff(e.target.checked)} /> {tr('showDifference')}
        </label>
      </div>
      <div className="t2d-row">{dashHint}</div>
      <LineChart series={series} cursorTime={steady ? undefined : t} onSelectTime={steady ? undefined : onSelectTime} height={260} />
      {metricTable.length > 0 && (
        <table className="t2d-table">
          <thead>
            <tr>
              <th>{tr('metric')}</th>
              {results.map((r, i) => (
                <th key={i}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricTable.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name} {m.unit ? `(${m.unit})` : ''}
                </td>
                {m.values.map((v, i) => (
                  <td key={i}>{v === null ? '–' : m.unit === 's' ? formatTime(v) : v.toFixed(3)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
