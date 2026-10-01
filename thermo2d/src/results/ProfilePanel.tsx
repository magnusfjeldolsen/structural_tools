import { useMemo } from 'react';
import type { Project, RunResult, Vec2 } from '@thermo2d/core';
import { lineProfile } from '@thermo2d/core';
import { ProfileChart, type ProfileSeries } from '../charts/ProfileChart.js';
import { makeLocator, seriesColor } from './fieldUtils.js';
import type { TFn } from './i18n.js';

export interface ProfilePanelProps {
  project: Project;
  result: RunResult;
  field: Float32Array;
  tr: TFn;
  lineMode: boolean;
  onLineMode: (v: boolean) => void;
  /** Extra results for overlay (scenario comparison). */
  others?: { label: string; result: RunResult; field: Float32Array }[];
}

/** Temperature along the project's line probes at the current time. */
export function ProfilePanel({ project, result, field, tr, lineMode, onLineMode, others = [] }: ProfilePanelProps) {
  const series = useMemo<ProfileSeries[]>(() => {
    const out: ProfileSeries[] = [];
    project.lineProbes.forEach((lp, i) => {
      const n = lp.samples ?? 50;
      const prof = profile(result, field, lp.from, lp.to, n);
      out.push({ id: lp.id, name: lp.name, s: prof.s, v: prof.v, color: seriesColor(i) });
      others.forEach((o, oi) => {
        const p2 = profile(o.result, o.field, lp.from, lp.to, n);
        out.push({ id: `${lp.id}:${oi}`, name: `${lp.name} – ${o.label}`, s: p2.s, v: p2.v, color: seriesColor(i), dashed: true });
      });
    });
    return out;
  }, [project.lineProbes, result, field, others]);

  return (
    <>
      <div className="t2d-row">
        <button className={lineMode ? 'active' : undefined} onClick={() => onLineMode(!lineMode)}>
          {tr('lineProbeMode')}
        </button>
        {lineMode && <span className="t2d-hint">{tr('lineProbeHint')}</span>}
      </div>
      {project.lineProbes.length === 0 ? <p className="t2d-hint">{tr('noLines')}</p> : <ProfileChart series={series} xLabel={`${tr('distance')} (mm)`} refLines={[{ value: 500, label: '500 °C' }]} />}
    </>
  );
}

function profile(result: RunResult, field: Float32Array, from: Vec2, to: Vec2, n: number): { s: number[]; v: number[] } {
  try {
    const p = lineProfile(result.mesh, field, from, to, n);
    if (p && p.s && p.values) return { s: p.s, v: p.values.map((x) => (x === null ? NaN : x)) };
  } catch {
    /* fall through to the local sampler */
  }
  const loc = makeLocator(result);
  const s: number[] = [];
  const v: number[] = [];
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = from[0] + (to[0] - from[0]) * f;
    const y = from[1] + (to[1] - from[1]) * f;
    s.push(L * f);
    v.push(loc.value(field, x, y) ?? NaN);
  }
  return { s, v };
}
