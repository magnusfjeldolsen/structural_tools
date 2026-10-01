import { useMemo } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import { LineChart, type LineSeries } from '../charts/LineChart.js';
import { boundaryCurve, rebarProbeIds, sampleSeries, seriesColor } from './fieldUtils.js';
import type { TFn } from './i18n.js';

export interface ProbeChartPanelProps {
  project: Project;
  result: RunResult;
  t: number;
  onSelectTime: (t: number) => void;
  tr: TFn;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  /** Extra live series (temporary or dragged probe). */
  extra?: { name: string; t: number[]; v: number[] } | null;
  refLines?: { value: number; label?: string }[];
}

/** θ(t) for the selected probes with the boundary curve overlaid; hover reads values, click/drag sets the time. */
export function ProbeChartPanel({ project, result, t, onSelectTime, tr, selected, onSelectedChange, extra, refLines }: ProbeChartPanelProps) {
  const probeNames = useMemo(() => new Map(project.probes.map((p) => [p.id, p.name])), [project.probes]);
  const rebarIds = useMemo(() => rebarProbeIds(project), [project]);
  const curve = useMemo(() => boundaryCurve(project), [project]);
  const tEnd = result.probeTimes.length ? result.probeTimes[result.probeTimes.length - 1] : 0;

  const series = useMemo<LineSeries[]>(() => {
    const out: LineSeries[] = [];
    result.probes.forEach((p, i) => {
      if (!p.found || !selected.has(p.id)) return;
      out.push({ id: p.id, name: probeNames.get(p.id) ?? p.id, t: result.probeTimes, v: result.probeValues[i], color: seriesColor(i) });
    });
    if (extra) out.push({ id: '__extra', name: extra.name, t: extra.t, v: extra.v, color: '#111', dashed: true });
    if (curve && result.mode !== 'steady') {
      const s = sampleSeries(curve, tEnd);
      out.push({ id: '__curve', name: `${tr('boundaryCurve')}: ${curve.name}`, t: s.t, v: s.v, color: '#9ca3af', muted: true });
    }
    return out;
  }, [result, selected, probeNames, extra, curve, tEnd, tr]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSelectedChange(s);
  };

  if (result.probes.length === 0 && !extra) return <p className="t2d-hint">{tr('noProbes')}</p>;

  return (
    <>
      <div className="t2d-row">
        <button onClick={() => onSelectedChange(new Set(result.probes.map((p) => p.id)))}>{tr('all')}</button>
        <button onClick={() => onSelectedChange(new Set(result.probes.filter((p) => rebarIds.has(p.id)).map((p) => p.id)))}>{tr('rebars')}</button>
        <button onClick={() => onSelectedChange(new Set())}>{tr('none')}</button>
      </div>
      <div className="t2d-list">
        {result.probes.map((p, i) => (
          <label key={p.id} title={p.found ? `${p.position[0]}, ${p.position[1]}` : tr('outside')}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={!p.found} />
            <span className="t2d-swatch" style={{ background: seriesColor(i) }} />
            {probeNames.get(p.id) ?? p.id}
            {!p.found && <span className="t2d-hint"> ({tr('outside')})</span>}
          </label>
        ))}
      </div>
      <LineChart series={series} cursorTime={result.mode === 'steady' ? undefined : t} onSelectTime={result.mode === 'steady' ? undefined : onSelectTime} refLines={refLines} height={280} />
    </>
  );
}
