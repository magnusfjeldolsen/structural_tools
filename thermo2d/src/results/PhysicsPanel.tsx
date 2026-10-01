import { useMemo, useState } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import { compileSeries, dewPoint, evaluateMetrics } from '@thermo2d/core';
import { fieldRange } from './fieldUtils.js';
import { formatTime } from './format.js';
import type { TFn } from './i18n.js';

export interface PhysicsPanelProps {
  project: Project;
  result: RunResult;
  field: Float32Array;
  t: number;
  tr: TFn;
}

interface MetricRow {
  metricId: string;
  name: string;
  kind: string;
  value: number | null;
  unit: string;
  time?: number;
  details?: Record<string, unknown>;
}

/** Metrics (U, ψ, surface temperatures, f_Rsi, time to threshold) and a condensation check. */
export function PhysicsPanel({ project, result, field, t, tr }: PhysicsPanelProps) {
  const [thetaIn, setThetaIn] = useState(project.settings.ambientTemperature);
  const [rh, setRh] = useState(50);

  const metrics = useMemo<MetricRow[]>(() => {
    try {
      const ev: Record<string, { at(t: number): number; name: string }> = {};
      for (const s of project.timeSeries) ev[s.id] = compileSeries(s, project.settings.ambientTemperature);
      return evaluateMetrics(project, result, ev) as MetricRow[];
    } catch {
      return [];
    }
  }, [project, result]);

  const [fMin, fMax] = fieldRange(field);
  const minSurface = useMemo(() => {
    // Lowest temperature on any boundary node at the current time (a conservative "inner surface" proxy).
    let m = Infinity;
    for (const seg of result.mesh.boundary) {
      m = Math.min(m, field[seg.a], field[seg.b]);
    }
    return isFinite(m) ? m : null;
  }, [result.mesh.boundary, field]);

  const dew = useMemo(() => {
    try {
      return dewPoint(thetaIn, rh) as number;
    } catch {
      return magnusDewPoint(thetaIn, rh);
    }
  }, [thetaIn, rh]);
  const fRsiMetric = metrics.find((m) => m.kind === 'f-rsi' && m.value !== null);

  return (
    <>
      <b>{tr('metrics')}</b>
      {metrics.length === 0 ? (
        <p className="t2d-hint">{tr('noMetrics')}</p>
      ) : (
        <table className="t2d-table">
          <thead>
            <tr>
              <th>{tr('metric')}</th>
              <th>{tr('value')}</th>
              <th>{tr('time')}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.metricId}>
                <td>{m.name}</td>
                <td>{m.value === null || m.value === undefined ? (m.kind === 'time-to-threshold' ? tr('never') : '–') : `${fmt(m.value, m.kind)} ${m.unit}`}</td>
                <td>{m.time !== undefined ? formatTime(m.time) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="t2d-kv">
        <dt>{tr('fieldMin')}</dt>
        <dd>{fMin.toFixed(1)} °C</dd>
        <dt>{tr('fieldMax')}</dt>
        <dd>{fMax.toFixed(1)} °C</dd>
        <dt>{tr('minSurface')}</dt>
        <dd>{minSurface === null ? '–' : `${minSurface.toFixed(1)} °C`}</dd>
      </dl>
      <b>{tr('condensation')}</b>
      <div className="t2d-row">
        <label>
          {tr('indoorTemp')} <input type="number" value={thetaIn} step={0.5} onChange={(e) => setThetaIn(parseFloat(e.target.value) || 0)} />
        </label>
        <label>
          {tr('rh')} <input type="number" value={rh} min={1} max={100} step={1} onChange={(e) => setRh(Math.max(1, Math.min(100, parseFloat(e.target.value) || 50)))} />
        </label>
      </div>
      <dl className="t2d-kv">
        <dt>{tr('dewPoint')}</dt>
        <dd>{dew.toFixed(1)} °C</dd>
      </dl>
      {minSurface !== null && (
        <div className={`t2d-verdict ${minSurface < dew ? 'warn' : 'ok'}`}>
          {minSurface < dew ? tr('condensationRisk') : tr('condensationOk')}
          {fRsiMetric && (
            <div>
              f_Rsi = {(fRsiMetric.value as number).toFixed(2)} · {tr('mouldNote')}
            </div>
          )}
        </div>
      )}
      <span className="t2d-hint">
        {tr('at')} {formatTime(t)}
      </span>
    </>
  );
}

function fmt(v: number, kind: string): string {
  if (kind === 'time-to-threshold') return formatTime(v);
  if (kind === 'f-rsi') return v.toFixed(3);
  if (kind === 'u-value' || kind === 'psi-value') return v.toFixed(3);
  return v.toFixed(1);
}

/** Magnus formula fallback (August–Roche–Magnus), °C and %. */
function magnusDewPoint(theta: number, rh: number): number {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(Math.max(rh, 0.1) / 100) + (a * theta) / (b + theta);
  return (b * g) / (a - g);
}
