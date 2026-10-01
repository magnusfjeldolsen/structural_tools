/** Figure assembly shared by the MCP tools and the CLI: picks data out of a project/result and calls the figure kit. */
import type { Project, RunResult } from '@thermo2d/core';
import {
  differenceFigure,
  explainResults,
  fieldFigure,
  interactiveHtml,
  lineProfileFigure,
  modelFigure,
  overlayFigure,
  reportHtml,
  sweepFigure,
  timeSeriesFigure,
  type Bands,
  type Theme,
  type SeriesLine,
  type MetricRow,
  type RebarRow,
} from '@thermo2d/figures';
import * as api from './coreApi.js';

export type FigureKind = 'time-series' | 'field' | 'profile' | 'model' | 'overlay' | 'difference' | 'sweep';

export interface FigureRequest {
  kind: FigureKind;
  project: Project;
  result?: RunResult;
  /** For overlay/difference. */
  results?: { label: string; result: RunResult }[];
  time?: number;
  probeIds?: string[];
  theme?: Theme;
  isotherms?: number[];
  bands?: Bands;
  showMesh?: boolean;
  smooth?: boolean;
  line?: { from: [number, number]; to: [number, number]; samples?: number };
  sweep?: { points: { x: number; y: number; label?: string }[]; parameterLabel: string; metricLabel: string };
  title?: string;
  width?: number;
  height?: number;
  lang?: 'nb' | 'en';
  mesh?: RunResult['mesh'];
}

export function probeName(project: Project, id: string): string {
  return project.probes.find((p) => p.id === id)?.name ?? id;
}

export function endTime(result: RunResult): number {
  return result.probeTimes.length ? result.probeTimes[result.probeTimes.length - 1] : result.times[result.times.length - 1] ?? 0;
}

export function fireCurveLine(project: Project): SeriesLine | undefined {
  const bc = project.boundaryConditions.find((b) => b.type === 'convection-radiation');
  const sid = bc && 'gasSeriesId' in bc ? bc.gasSeriesId : undefined;
  const s = sid ? project.timeSeries.find((x) => x.id === sid) : undefined;
  return s ? { name: s.name, t: s.points.map((q) => q[0]), v: s.points.map((q) => q[1]) } : undefined;
}

export function probeLines(project: Project, result: RunResult, probeIds?: string[]): SeriesLine[] {
  return result.probes
    .map((p, k) => ({ p, k }))
    .filter(({ p }) => p.found && (!probeIds || probeIds.includes(p.id)))
    .map(({ p, k }) => ({ name: probeName(project, p.id), t: result.probeTimes, v: result.probeValues[k] }));
}

/** Sample the field along a line by shape-function interpolation (independent of post.lineProfile). */
export function sampleLine(mesh: RunResult['mesh'], field: ArrayLike<number>, from: [number, number], to: [number, number], samples = 50): { s: number[]; v: number[]; points: [number, number][] } {
  const s: number[] = [];
  const v: number[] = [];
  const points: [number, number][] = [];
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let i = 0; i <= samples; i++) {
    const f = i / samples;
    const p: [number, number] = [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
    const val = api.interpolateField(mesh, field, p);
    s.push(L * f);
    v.push(val === null ? NaN : val);
    points.push(p);
  }
  return { s, v, points };
}

export function fieldAt(result: RunResult, t?: number): { field: ArrayLike<number>; t: number } {
  const tt = t ?? endTime(result);
  try {
    return { field: api.fieldAtTime(result, tt), t: tt };
  } catch {
    // Fallback: nearest stored snapshot.
    let best = 0;
    for (let i = 0; i < result.times.length; i++) if (Math.abs(result.times[i] - tt) < Math.abs(result.times[best] - tt)) best = i;
    return { field: result.fields[best] ?? new Float32Array(result.mesh.stats.nodeCount), t: result.times[best] ?? tt };
  }
}

export function makeSvg(req: FigureRequest): string {
  const { project, theme, lang } = req;
  const minLabel = (t: number) => `t = ${Math.round((t / 60) * 10) / 10} min`;
  switch (req.kind) {
    case 'model':
      return modelFigure({ project, mesh: req.mesh, title: req.title ?? project.name, theme, width: req.width, height: req.height, lang });
    case 'time-series': {
      const r = need(req.result);
      return timeSeriesFigure({ series: probeLines(project, r, req.probeIds), curveOverlay: fireCurveLine(project), title: req.title ?? `${project.name}: ${lang === 'en' ? 'temperature versus time' : 'temperatur mot tid'}`, theme, cursorTime: req.time, width: req.width, height: req.height, references: (req.isotherms ?? []).map((v) => ({ value: v, label: `${v} °C` })) });
    }
    case 'field': {
      const r = need(req.result);
      const { field, t } = fieldAt(r, req.time);
      const probes = r.probes.filter((p) => p.found).map((p) => ({ name: probeName(project, p.id), x: p.position[0], y: p.position[1], value: api.interpolateField(r.mesh, field, p.position) ?? undefined }));
      return fieldFigure({ mesh: r.mesh, field, bands: req.bands, isotherms: req.isotherms ?? [500], showMesh: req.showMesh, smooth: req.smooth, probes, title: req.title ?? project.name, subtitle: minLabel(t), theme, width: req.width, height: req.height });
    }
    case 'profile': {
      const r = need(req.result);
      const line = req.line ?? defaultLine(project);
      const { field, t } = fieldAt(r, req.time);
      const prof = sampleLine(r.mesh, field, line.from, line.to, line.samples ?? 50);
      return lineProfileFigure({ profiles: [{ name: minLabel(t), s: prof.s, v: prof.v }], title: req.title ?? `${project.name}: ${lang === 'en' ? 'profile' : 'profil'} (${line.from.join(',')}) → (${line.to.join(',')})`, theme, references: (req.isotherms ?? [500]).map((v) => ({ value: v, label: `${v} °C` })), width: req.width, height: req.height });
    }
    case 'overlay': {
      const rs = req.results ?? (req.result ? [{ label: project.name, result: req.result }] : []);
      if (!rs.length) throw new Error('overlay needs at least one result.');
      const first = rs[0].result;
      const ids = req.probeIds ?? first.probes.filter((p) => p.found).map((p) => p.id);
      const series: SeriesLine[] = [];
      ids.forEach((id, pi) => {
        rs.forEach((r, ri) => {
          const k = r.result.probes.findIndex((p) => p.id === id);
          if (k < 0) return;
          series.push({ name: `${probeName(project, id)} – ${r.label}`, t: r.result.probeTimes, v: r.result.probeValues[k], dashed: ri > 0, color: undefined, width: ri === 0 ? 2 : 1.4 });
          void pi;
        });
      });
      return overlayFigure({ results: rs, probeIds: ids, title: req.title ?? `${project.name}: ${lang === 'en' ? 'scenario comparison' : 'sammenligning av scenarier'}`, theme, curveOverlay: fireCurveLine(project), cursorTime: req.time, width: req.width, height: req.height });
    }
    case 'difference': {
      const rs = req.results ?? [];
      if (rs.length < 2) throw new Error('difference needs two results (A and B).');
      const a = fieldAt(rs[0].result, req.time), b = fieldAt(rs[1].result, req.time);
      return differenceFigure({ a: { mesh: rs[0].result.mesh, field: a.field }, b: { mesh: rs[1].result.mesh, field: b.field }, title: req.title ?? `${rs[1].label} − ${rs[0].label} (${minLabel(a.t)})`, theme, width: req.width, height: req.height });
    }
    case 'sweep': {
      if (!req.sweep) throw new Error('sweep needs points, parameterLabel and metricLabel.');
      return sweepFigure({ ...req.sweep, title: req.title, theme, width: req.width, height: req.height });
    }
    default:
      throw new Error(`Unknown figure kind "${(req as FigureRequest).kind}". Use one of: time-series, field, profile, model, overlay, difference, sweep.`);
  }
}

function need(r: RunResult | undefined): RunResult {
  if (!r) throw new Error('This figure needs a result. Run run_analysis first.');
  return r;
}

/** Default profile line: vertical from the bottom face centre to the top. */
export function defaultLine(project: Project): { from: [number, number]; to: [number, number]; samples: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of project.regions) for (const [x, y] of r.polygon.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (!Number.isFinite(minX)) return { from: [0, 0], to: [0, 100], samples: 50 };
  const cx = (minX + maxX) / 2;
  return { from: [cx, minY], to: [cx, maxY], samples: 50 };
}

export function makeInteractive(project: Project, results: { label: string; result: RunResult }[], lang?: 'nb' | 'en', isotherms?: number[], bands?: Bands): string {
  return interactiveHtml({ project, results, lang, isotherms, bands });
}

export interface ReportBundle {
  html: string;
  metrics: MetricRow[];
  rebarRows: RebarRow[];
  explanation: string;
}

export function metricsFor(project: Project, result: RunResult): MetricRow[] {
  if (!project.metrics.length) return [];
  try {
    return api.evaluateMetrics(project, result, api.seriesEvaluators(project)).map((m) => ({ metricId: m.metricId, name: m.name, kind: m.kind, value: m.value, unit: m.unit, time: m.time, details: m.details }));
  } catch (e) {
    return [{ name: 'metrics', value: null, details: `not available: ${(e as Error).message}` }];
  }
}

export function rebarRowsFor(project: Project, result: RunResult, times: number[]): RebarRow[] {
  if (!project.rebars.length) return [];
  try {
    return api.rebarTable(project, result, times).map((r) => ({ rebarId: r.rebarId, name: r.name, x: r.x, y: r.y, diameter: r.diameter, temps: r.temps, ks: r.ks }));
  } catch {
    // Fallback: rebar probes from histories.
    return project.rebars.map((b) => {
      const k = result.probes.findIndex((p) => project.probes.find((q) => q.id === p.id)?.linkedRebarId === b.id);
      const temps = times.map((t) => (k >= 0 ? sample(result.probeTimes, result.probeValues[k], t) : NaN));
      return { rebarId: b.id, name: b.name, x: b.centre[0], y: b.centre[1], diameter: b.diameter, temps, ks: temps.map(() => null) };
    });
  }
}

export function sample(t: ArrayLike<number>, v: ArrayLike<number>, at: number): number {
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

export function buildReport(project: Project, results: { label: string; result: RunResult }[], opts: { lang?: 'nb' | 'en'; times?: number[]; theme?: Theme; title?: string }): ReportBundle {
  const first = results[0].result;
  const tEnd = endTime(first);
  const times = opts.times ?? [tEnd / 3, (2 * tEnd) / 3, tEnd].map((t) => Math.round(t));
  const lang = opts.lang ?? project.settings.language;
  const metrics = metricsFor(project, first);
  const rebarRows = rebarRowsFor(project, first, times);
  const explanation = explainResults({ project, result: first, metrics, rebarRows, rebarTimes: times, lang });
  const figures = [
    { svg: makeSvg({ kind: 'model', project, mesh: first.mesh, lang, theme: 'print', title: lang === 'en' ? 'Model' : 'Modell' }), caption: lang === 'en' ? 'Model with materials, boundary conditions, reinforcement and probes.' : 'Modell med materialer, randbetingelser, armering og målepunkter.' },
    ...(first.probes.length ? [{ svg: makeSvg({ kind: 'time-series', project, result: first, lang, theme: 'print' as Theme }), caption: lang === 'en' ? 'Temperature versus time at the probes, with the boundary curve dashed.' : 'Temperatur mot tid i målepunktene, med randkurven stiplet.' }] : []),
    ...(first.fields.length ? [{ svg: makeSvg({ kind: 'field', project, result: first, lang, theme: 'print' as Theme, time: tEnd }), caption: lang === 'en' ? `Temperature field at ${Math.round(tEnd / 60)} min with the 500 °C isotherm.` : `Temperaturfelt ved ${Math.round(tEnd / 60)} min med 500 °C-isotermen.` }] : []),
    ...(results.length > 1 ? [{ svg: makeSvg({ kind: 'overlay', project, results, lang, theme: 'print' as Theme }), caption: lang === 'en' ? 'Scenario comparison.' : 'Sammenligning av scenarier.' }] : []),
  ];
  const html = reportHtml({ project, results, figures, explanation, metrics, rebarRows, rebarTimes: times, tableTimes: times, lang, title: opts.title });
  return { html, metrics, rebarRows, explanation };
}
