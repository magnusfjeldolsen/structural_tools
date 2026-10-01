import { useMemo, useState } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import { rebarTable, reducedSection } from '@thermo2d/core';
import { defaultReportTimes, formatTemp, formatTime } from './format.js';
import type { TFn } from './i18n.js';

export interface FirePanelProps {
  project: Project;
  result: RunResult;
  field: Float32Array;
  t: number;
  tr: TFn;
  show500: boolean;
  onShow500: (v: boolean) => void;
  times: number[];
}

interface RebarRow {
  rebarId: string;
  name: string;
  x: number;
  y: number;
  diameter: number;
  temps: number[];
  ks: (number | null)[];
}

/** 500 °C isotherm, reduced cross-section and the rebar k_s(θ) table. */
export function FirePanel({ project, result, field, t, tr, show500, onShow500, times }: FirePanelProps) {
  const [fyk, setFyk] = useState(500);
  const reduced = useMemo(() => {
    try {
      return reducedSection(result.mesh, field, 500) as { area: number; width: number; height: number };
    } catch {
      return null;
    }
  }, [result.mesh, field]);

  const reportTimes = times.length ? times : defaultReportTimes(result.times[result.times.length - 1] ?? 0);
  const rows = useMemo<RebarRow[]>(() => {
    try {
      return rebarTable(project, result, reportTimes) as RebarRow[];
    } catch {
      return [];
    }
  }, [project, result, reportTimes]);

  const full = useMemo(() => project.regions.reduce((a, r) => a + Math.abs(ringArea(r.polygon.outer)) - r.polygon.holes.reduce((h, ring) => h + Math.abs(ringArea(ring)), 0), 0), [project.regions]);

  return (
    <>
      <div className="t2d-row">
        <label>
          <input type="checkbox" checked={show500} onChange={(e) => onShow500(e.target.checked)} /> {tr('isotherm500')}
        </label>
      </div>
      <b>
        {tr('reducedSection')} · {tr('at')} {formatTime(t)}
      </b>
      {reduced ? (
        <dl className="t2d-kv">
          <dt>{tr('width')}</dt>
          <dd>{reduced.width.toFixed(0)} mm</dd>
          <dt>{tr('height')}</dt>
          <dd>{reduced.height.toFixed(0)} mm</dd>
          <dt>{tr('area')}</dt>
          <dd>
            {(reduced.area / 1e3).toFixed(1)} ·10³ mm² {full > 0 ? `(${((100 * reduced.area) / full).toFixed(0)} %)` : ''}
          </dd>
        </dl>
      ) : (
        <p className="t2d-hint">–</p>
      )}
      <b>{tr('rebarTable')}</b>
      {project.rebars.length === 0 ? (
        <p className="t2d-hint">{tr('noRebars')}</p>
      ) : (
        <>
          <div className="t2d-row">
            <label>
              {tr('fyk')} <input type="number" value={fyk} min={100} max={2000} step={10} onChange={(e) => setFyk(parseFloat(e.target.value) || 500)} />
            </label>
          </div>
          <table className="t2d-table">
            <thead>
              <tr>
                <th>{tr('bar')}</th>
                <th>{tr('diameter')}</th>
                {reportTimes.map((tt) => (
                  <th key={`t${tt}`}>
                    {tr('temp')} {Math.round(tt / 60)}′
                  </th>
                ))}
                {reportTimes.map((tt) => (
                  <th key={`k${tt}`}>
                    {tr('ks')} {Math.round(tt / 60)}′
                  </th>
                ))}
                <th>
                  {tr('fy')} {Math.round(reportTimes[reportTimes.length - 1] / 60)}′
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lastKs = r.ks[r.ks.length - 1];
                return (
                  <tr key={r.rebarId} className={r.temps.some((v) => v >= 500) ? 'hot' : undefined}>
                    <td>{r.name}</td>
                    <td>{r.diameter}</td>
                    {r.temps.map((v, i) => (
                      <td key={`t${i}`}>{formatTemp(v, 0)}</td>
                    ))}
                    {r.ks.map((k, i) => (
                      <td key={`k${i}`} title={k === null ? tr('noStrengthTable') : undefined}>
                        {k === null ? '–' : k.toFixed(2)}
                      </td>
                    ))}
                    <td>{lastKs === null || lastKs === undefined ? '–' : `${(lastKs * fyk).toFixed(0)} MPa`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
