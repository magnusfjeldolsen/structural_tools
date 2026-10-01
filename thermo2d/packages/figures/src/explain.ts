/** Plain-language narrative of a run: inputs, assumptions, standards, key numbers, checks, warnings. */
import type { Project, RunResult } from '@thermo2d/core';
import { bcTypeName, type Lang } from './strings.js';
import { sampleSeries } from './csv.js';

export interface MetricRow {
  metricId?: string;
  name: string;
  kind?: string;
  value: number | null;
  unit?: string;
  time?: number;
  details?: string;
}

export interface RebarRow {
  rebarId?: string;
  name: string;
  x: number;
  y: number;
  diameter: number;
  temps: number[];
  ks?: (number | null)[];
}

export interface ExplainOptions {
  project: Project;
  result: RunResult;
  metrics?: MetricRow[];
  rebarRows?: RebarRow[];
  /** Times (s) for the rebar table columns. */
  rebarTimes?: number[];
  lang?: Lang;
  /** Reference temperature for the isotherm statement (fire design: 500 °C). */
  isotherm?: number;
}

const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '–');
const f1 = (v: number) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : '–');
const min = (s: number) => `${f1(s / 60)} min`;

export function explainResults(o: ExplainOptions): string {
  const lang = o.lang ?? o.project.settings.language ?? 'nb';
  return lang === 'en' ? explainEn(o) : explainNb(o);
}

function common(o: ExplainOptions) {
  const p = o.project;
  const r = o.result;
  const an = p.analyses.find((a) => a.id === r.analysisId) ?? p.analyses[0];
  const mats = new Map(p.materials.map((m) => [m.id, m]));
  const series = new Map(p.timeSeries.map((s) => [s.id, s]));
  const regions = p.regions.map((rg) => ({ name: rg.name, material: rg.materialId ? mats.get(rg.materialId) : undefined }));
  const bcs = p.boundaryConditions.map((bc) => {
    const sid = 'gasSeriesId' in bc ? bc.gasSeriesId : 'airSeriesId' in bc ? bc.airSeriesId : 'temperatureSeriesId' in bc ? bc.temperatureSeriesId : 'fluxSeriesId' in bc ? bc.fluxSeriesId : undefined;
    return { bc, series: sid ? series.get(sid) : undefined };
  });
  const tEnd = r.probeTimes.length ? r.probeTimes[r.probeTimes.length - 1] : 0;
  const probeEnd = r.probes.map((pr, k) => ({ name: p.probes.find((q) => q.id === pr.id)?.name ?? pr.id, value: r.probeValues[k]?.length ? sampleSeries(r.probeTimes, r.probeValues[k], tEnd) : NaN, found: pr.found }));
  let fieldMax = -Infinity, fieldMin = Infinity;
  const last = r.fields[r.fields.length - 1];
  if (last) for (let i = 0; i < last.length; i++) { fieldMax = Math.max(fieldMax, last[i]); fieldMin = Math.min(fieldMin, last[i]); }
  const cited = new Set<string>();
  for (const m of p.materials) if (m.source?.text) cited.add(m.source.text);
  for (const s of p.timeSeries) if (s.source?.citation?.text) cited.add(s.source.citation.text);
  return { p, r, an, regions, bcs, tEnd, probeEnd, fieldMax, fieldMin, cited: [...cited] };
}

function explainNb(o: ExplainOptions): string {
  const { p, r, an, regions, bcs, tEnd, probeEnd, fieldMax, fieldMin, cited } = common(o);
  const L: string[] = [];
  L.push(`## ${p.name}`);
  L.push('');
  L.push('**Inndata.** ' + (regions.length ? `Tverrsnittet består av ${regions.length} område${regions.length > 1 ? 'r' : ''}: ` + regions.map((g) => `${g.name} (${g.material ? g.material.name : 'uten materiale'})`).join(', ') + '.' : 'Ingen områder.') + (p.rebars.length ? ` ${p.rebars.length} armeringsstenger (Ø ${[...new Set(p.rebars.map((b) => b.diameter))].join('/')} mm).` : ''));
  if (bcs.length) L.push('**Randbetingelser.** ' + bcs.map(({ bc, series }) => `${bc.name}: ${bcTypeName(bc.type, 'nb')}${series ? ` med serien «${series.name}»` : ''} på ${bc.edgeRefs.length} kant${bc.edgeRefs.length === 1 ? '' : 'er'}${bc.type === 'convection-radiation' ? ` (αc = ${bc.alphaC} W/m²K, ε = ${bc.epsM ?? 'materialets'}·${bc.epsF}, Φ = ${bc.phi})` : bc.type === 'convection' ? ` (α = ${bc.alpha ?? (bc.surfaceResistance ? `1/${bc.surfaceResistance}` : '?')} W/m²K)` : ''}`).join('; ') + '. Kanter uten randbetingelse er isolert.');
  if (an) L.push(`**Analyse.** ${an.mode === 'steady' ? 'Stasjonær beregning' : an.mode === 'periodic' ? `Periodisk beregning med periode ${min(an.duration)}` : `Transient beregning over ${min(an.duration)}`}${an.mode !== 'steady' ? `, tidssteg ${an.dt} s (${an.timeIntegration === 'crank-nicolson' ? 'Crank–Nicolson' : 'bakover-Euler'})` : ''}, starttemperatur ${an.initialTemperature} °C. Elementnett: ${r.mesh.stats.nodeCount} noder, ${r.mesh.stats.elementCount} lineære trekantelementer, minste vinkel ${f1(r.mesh.stats.minAngleDeg)}°.`);
  L.push('**Forutsetninger.** Todimensjonal varmeledning i planet, ingen fukttransport, materialegenskaper som funksjon av temperatur etter de siterte kildene, klumpet varmekapasitet med entalpi-integrasjon over fukttoppen, stråling lineærisert i hvert Newton-steg.');
  if (cited.length) L.push('**Standarder og kilder.** ' + cited.join('; ') + '.');
  const key: string[] = [];
  if (r.fields.length) key.push(`Ved ${min(tEnd)} er høyeste temperatur i tverrsnittet ${f0(fieldMax)} °C og laveste ${f0(fieldMin)} °C.`);
  if (probeEnd.length) key.push('Målepunkter ved slutt: ' + probeEnd.map((q) => `${q.name} ${q.found ? f0(q.value) + ' °C' : '(utenfor tverrsnittet)'}`).join(', ') + '.');
  if (o.rebarRows?.length && o.rebarTimes?.length) {
    const li = o.rebarTimes.length - 1;
    const hottest = [...o.rebarRows].sort((a, b) => (b.temps[li] ?? 0) - (a.temps[li] ?? 0))[0];
    key.push(`Varmeste stang ved ${min(o.rebarTimes[li])} er ${hottest.name} med ${f0(hottest.temps[li])} °C${hottest.ks?.[li] != null ? `, som gir k_s = ${(Math.round(hottest.ks[li]! * 100) / 100).toString()}` : ''}.`);
  }
  for (const m of o.metrics ?? []) if (m.value !== null && Number.isFinite(m.value)) key.push(`${m.name}: ${Math.round(m.value * 1000) / 1000}${m.unit ? ' ' + m.unit : ''}${m.details ? ` (${m.details})` : ''}.`);
  if (key.length) L.push('**Nøkkelresultater.** ' + key.join(' '));
  const checks: string[] = [];
  checks.push(`Energibalanse: ${f1(r.energy.relativeImbalance * 100)} % ubalanse${r.energy.relativeImbalance < 0.01 ? ' (under 1 %, i orden)' : ' (over 1 %, vurder finere nett eller kortere tidssteg)'}.`);
  checks.push(`${r.stats.steps} tidssteg, ${r.stats.newtonIterations} Newton-iterasjoner, løser ${r.stats.linearSolver}, ${f1(r.stats.wallTimeMs / 1000)} s regnetid${r.stats.rejectedSteps ? `, ${r.stats.rejectedSteps} forkastede steg` : ''}.`);
  L.push('**Kontroller.** ' + checks.join(' '));
  if (r.warnings.length || r.mesh.warnings.length) L.push('**Advarsler.** ' + [...r.warnings, ...r.mesh.warnings.map((w) => w.message)].join(' '));
  return L.join('\n');
}

function explainEn(o: ExplainOptions): string {
  const { p, r, an, regions, bcs, tEnd, probeEnd, fieldMax, fieldMin, cited } = common(o);
  const L: string[] = [];
  L.push(`## ${p.name}`);
  L.push('');
  L.push('**Inputs.** ' + (regions.length ? `The section has ${regions.length} region${regions.length > 1 ? 's' : ''}: ` + regions.map((g) => `${g.name} (${g.material ? g.material.name : 'no material'})`).join(', ') + '.' : 'No regions.') + (p.rebars.length ? ` ${p.rebars.length} rebars (Ø ${[...new Set(p.rebars.map((b) => b.diameter))].join('/')} mm).` : ''));
  if (bcs.length) L.push('**Boundary conditions.** ' + bcs.map(({ bc, series }) => `${bc.name}: ${bcTypeName(bc.type, 'en')}${series ? ` with series "${series.name}"` : ''} on ${bc.edgeRefs.length} edge${bc.edgeRefs.length === 1 ? '' : 's'}${bc.type === 'convection-radiation' ? ` (αc = ${bc.alphaC} W/m²K, ε = ${bc.epsM ?? 'material'}·${bc.epsF}, Φ = ${bc.phi})` : bc.type === 'convection' ? ` (α = ${bc.alpha ?? (bc.surfaceResistance ? `1/${bc.surfaceResistance}` : '?')} W/m²K)` : ''}`).join('; ') + '. Edges without a condition are insulated.');
  if (an) L.push(`**Analysis.** ${an.mode === 'steady' ? 'Steady-state run' : an.mode === 'periodic' ? `Periodic run with period ${min(an.duration)}` : `Transient run over ${min(an.duration)}`}${an.mode !== 'steady' ? `, time step ${an.dt} s (${an.timeIntegration === 'crank-nicolson' ? 'Crank–Nicolson' : 'backward Euler'})` : ''}, initial temperature ${an.initialTemperature} °C. Mesh: ${r.mesh.stats.nodeCount} nodes, ${r.mesh.stats.elementCount} linear triangles, minimum angle ${f1(r.mesh.stats.minAngleDeg)}°.`);
  L.push('**Assumptions.** Two-dimensional conduction in the plane, no moisture transport, temperature-dependent properties from the cited sources, lumped capacity with enthalpy integration across the moisture peak, radiation linearised in every Newton step.');
  if (cited.length) L.push('**Standards and sources.** ' + cited.join('; ') + '.');
  const key: string[] = [];
  if (r.fields.length) key.push(`At ${min(tEnd)} the highest temperature in the section is ${f0(fieldMax)} °C and the lowest ${f0(fieldMin)} °C.`);
  if (probeEnd.length) key.push('Probes at the end: ' + probeEnd.map((q) => `${q.name} ${q.found ? f0(q.value) + ' °C' : '(outside the section)'}`).join(', ') + '.');
  if (o.rebarRows?.length && o.rebarTimes?.length) {
    const li = o.rebarTimes.length - 1;
    const hottest = [...o.rebarRows].sort((a, b) => (b.temps[li] ?? 0) - (a.temps[li] ?? 0))[0];
    key.push(`The hottest bar at ${min(o.rebarTimes[li])} is ${hottest.name} at ${f0(hottest.temps[li])} °C${hottest.ks?.[li] != null ? `, giving k_s = ${(Math.round(hottest.ks[li]! * 100) / 100).toString()}` : ''}.`);
  }
  for (const m of o.metrics ?? []) if (m.value !== null && Number.isFinite(m.value)) key.push(`${m.name}: ${Math.round(m.value * 1000) / 1000}${m.unit ? ' ' + m.unit : ''}${m.details ? ` (${m.details})` : ''}.`);
  if (key.length) L.push('**Key results.** ' + key.join(' '));
  const checks: string[] = [];
  checks.push(`Energy balance: ${f1(r.energy.relativeImbalance * 100)} % imbalance${r.energy.relativeImbalance < 0.01 ? ' (below 1 %, fine)' : ' (above 1 %, consider a finer mesh or a shorter time step)'}.`);
  checks.push(`${r.stats.steps} time steps, ${r.stats.newtonIterations} Newton iterations, solver ${r.stats.linearSolver}, ${f1(r.stats.wallTimeMs / 1000)} s wall time${r.stats.rejectedSteps ? `, ${r.stats.rejectedSteps} rejected steps` : ''}.`);
  L.push('**Checks.** ' + checks.join(' '));
  if (r.warnings.length || r.mesh.warnings.length) L.push('**Warnings.** ' + [...r.warnings, ...r.mesh.warnings.map((w) => w.message)].join(' '));
  return L.join('\n');
}
