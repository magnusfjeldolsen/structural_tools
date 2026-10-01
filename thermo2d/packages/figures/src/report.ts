/** Print-ready HTML report (A4). The browser's "Save as PDF" produces the PDF. */
import type { Project, RunResult } from '@thermo2d/core';
import { esc } from './svg.js';
import { bcTypeName, strings, type Lang } from './strings.js';
import type { MetricRow, RebarRow } from './explain.js';
import { probeTableRows } from './csv.js';
import { area } from './model.js';

export interface ReportFigure {
  svg: string;
  caption: string;
}

export interface ReportOptions {
  project: Project;
  results: { label: string; result: RunResult }[];
  figures: ReportFigure[];
  explanation?: string;
  metrics?: MetricRow[];
  rebarRows?: RebarRow[];
  rebarTimes?: number[];
  /** Times (s) for the probe table columns. */
  tableTimes?: number[];
  warnings?: string[];
  lang?: Lang;
  title?: string;
  author?: string;
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString() : '–');

function md(s: string): string {
  // Minimal markdown: ## headings, **bold**, paragraphs.
  return s
    .split(/\n{2,}|\n(?=##)/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => {
      if (para.startsWith('## ')) return `<h2>${esc(para.slice(3))}</h2>`;
      const html = esc(para).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('\n');
}

export function reportHtml(o: ReportOptions): string {
  const p = o.project;
  const lang = o.lang ?? p.settings.language ?? 'nb';
  const S = strings(lang);
  const title = o.title ?? `${S.report}: ${p.name}`;
  const mats = new Map(p.materials.map((m) => [m.id, m]));
  const series = new Map(p.timeSeries.map((s) => [s.id, s]));
  const first = o.results[0]?.result;
  const an = first ? p.analyses.find((a) => a.id === first.analysisId) : p.analyses[0];
  const tableTimes = o.tableTimes ?? (first && first.probeTimes.length ? [first.probeTimes[first.probeTimes.length - 1]] : []);
  const parts: string[] = [];

  parts.push(`<header><h1>${esc(title)}</h1><div class="meta">${esc(S.project)}: ${esc(p.name)} · ${esc(S.generated)}: ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))}${o.author ? ' · ' + esc(o.author) : ''}${first?.stamp ? ` · hash ${esc(first.stamp.projectHash.slice(0, 12))} · core ${esc(first.stamp.coreVersion)}` : ''}</div></header>`);

  // Geometry and materials
  parts.push(`<section><h2>${S.geometry} ${lang === 'nb' ? 'og' : 'and'} ${S.materials.toLowerCase()}</h2><table><thead><tr><th>${S.region}</th><th>${S.material}</th><th>${S.area} [mm²]</th><th>${S.source}</th><th>${S.quality}</th></tr></thead><tbody>` +
    p.regions.map((r) => { const m = r.materialId ? mats.get(r.materialId) : undefined; return `<tr><td>${esc(r.name)}</td><td>${esc(m?.name ?? S.none)}</td><td class="num">${f(area(r.polygon.outer) - r.polygon.holes.reduce((s, h) => s + area(h), 0), 0)}</td><td>${esc(m?.source.text ?? '')}</td><td>${esc(m?.quality ?? '')}</td></tr>`; }).join('') +
    `</tbody></table>${p.rebars.length ? `<p>${lang === 'nb' ? 'Armering' : 'Reinforcement'}: ${p.rebars.length} ${lang === 'nb' ? 'stenger' : 'bars'}, Ø ${[...new Set(p.rebars.map((b) => b.diameter))].join('/')} mm; ${lang === 'nb' ? 'overdekning målt til' : 'cover measured to'} ${p.settings.coverReference === 'surface' ? (lang === 'nb' ? 'stangoverflate' : 'bar surface') : (lang === 'nb' ? 'stangsenter' : 'bar centre')}.</p>` : ''}</section>`);

  // Boundary conditions
  parts.push(`<section><h2>${S.boundaryConditions}</h2><table><thead><tr><th>${S.name}</th><th>${S.type}</th><th>${S.series}</th><th>${S.parameters}</th><th>${S.edges}</th></tr></thead><tbody>` +
    p.boundaryConditions.map((bc) => {
      const sid = 'gasSeriesId' in bc ? bc.gasSeriesId : 'airSeriesId' in bc ? bc.airSeriesId : 'temperatureSeriesId' in bc ? bc.temperatureSeriesId : 'fluxSeriesId' in bc ? bc.fluxSeriesId : undefined;
      const s = sid ? series.get(sid) : undefined;
      const params = bc.type === 'convection-radiation' ? `αc=${bc.alphaC} W/m²K, Φ=${bc.phi}, εm=${bc.epsM ?? 'mat.'}, εf=${bc.epsF}` : bc.type === 'convection' ? (bc.alpha !== undefined ? `α=${bc.alpha} W/m²K` : `Rs=${bc.surfaceResistance} m²K/W`) : '';
      return `<tr><td>${esc(bc.name)}</td><td>${esc(bcTypeName(bc.type, lang))}</td><td>${esc(s ? `${s.name}${s.source.citation ? ` (${s.source.citation.text})` : ''}` : '')}</td><td>${esc(params)}</td><td class="num">${bc.edgeRefs.length}</td></tr>`;
    }).join('') + `</tbody></table></section>`);

  // Analysis and mesh
  if (an && first) {
    parts.push(`<section><h2>${S.analysis} ${lang === 'nb' ? 'og' : 'and'} ${S.mesh.toLowerCase()}</h2><table class="kv"><tbody>` +
      `<tr><th>${S.mode}</th><td>${esc(S[an.mode])}</td></tr>` +
      (an.mode !== 'steady' ? `<tr><th>${S.duration}</th><td>${f(an.duration / 60)} min</td></tr><tr><th>${S.timeStep}</th><td>${an.dt} s (${an.timeIntegration})</td></tr><tr><th>${S.outputInterval}</th><td>${an.outputInterval} s</td></tr>` : '') +
      `<tr><th>${S.initialTemperature}</th><td>${an.initialTemperature} °C</td></tr>` +
      `<tr><th>${S.nodes} / ${S.elements}</th><td>${first.mesh.stats.nodeCount} / ${first.mesh.stats.elementCount}</td></tr><tr><th>${S.minAngle}</th><td>${f(first.mesh.stats.minAngleDeg)}°</td></tr>` +
      `<tr><th>${S.energyBalance}</th><td>${f(first.energy.relativeImbalance * 100, 2)} % ${S.imbalance}</td></tr><tr><th>${S.solver}</th><td>${esc(first.stats.linearSolver)}, ${first.stats.steps} ${S.steps}, ${first.stats.newtonIterations} ${S.newton}, ${f(first.stats.wallTimeMs / 1000)} s ${S.wallTime}</td></tr>` +
      `</tbody></table></section>`);
  }

  // Figures
  o.figures.forEach((fig, i) => {
    parts.push(`<figure>${fig.svg}<figcaption>${S.caption} ${i + 1}: ${esc(fig.caption)}</figcaption></figure>`);
  });

  // Probe table
  if (first && first.probes.length && tableTimes.length) {
    const { header, rows } = probeTableRows(first, tableTimes, p);
    parts.push(`<section><h2>${S.results}: ${S.probe.toLowerCase()} × ${S.time.toLowerCase()}</h2><table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, k) => `<td class="${k ? 'num' : ''}">${typeof v === 'number' ? f(v, k < 3 ? 0 : 0) : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`);
  }

  // Rebar table
  if (o.rebarRows?.length) {
    const times = o.rebarTimes ?? [];
    parts.push(`<section><h2>${S.rebarTable}</h2><table><thead><tr><th>${S.bar}</th><th>${S.diameter} [mm]</th><th>x [mm]</th><th>y [mm]</th>${times.map((t) => `<th>θ @ ${f(t / 60, 0)} min [°C]</th><th>${S.reducedStrength}</th>`).join('')}</tr></thead><tbody>` +
      o.rebarRows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${f(r.diameter, 0)}</td><td class="num">${f(r.x, 0)}</td><td class="num">${f(r.y, 0)}</td>${times.map((_, k) => `<td class="num">${f(r.temps[k] ?? NaN, 0)}</td><td class="num">${r.ks?.[k] != null ? f(r.ks[k]!, 2) : '–'}</td>`).join('')}</tr>`).join('') + `</tbody></table></section>`);
  }

  // Metrics
  if (o.metrics?.length) {
    parts.push(`<section><h2>${S.metrics}</h2><table><thead><tr><th>${S.name}</th><th>${S.value}</th><th>${S.unit}</th><th>${S.time}</th><th></th></tr></thead><tbody>` +
      o.metrics.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${m.value === null ? '–' : f(m.value, 3)}</td><td>${esc(m.unit ?? '')}</td><td class="num">${m.time !== undefined ? f(m.time / 60) + ' min' : ''}</td><td>${esc(m.details ?? '')}</td></tr>`).join('') + `</tbody></table></section>`);
  }

  if (o.explanation) parts.push(`<section><h2>${S.explanationTitle}</h2>${md(o.explanation)}</section>`);

  const warnings = [...(o.warnings ?? []), ...(first?.warnings ?? []), ...(first?.mesh.warnings.map((w) => w.message) ?? [])];
  if (warnings.length) parts.push(`<section><h2>${S.warnings}</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`);

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
html { color-scheme: light; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0 auto; max-width: 180mm; padding: 12mm 0; line-height: 1.35; }
h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
.meta { color: #555; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 4px 0 8px; } th, td { border: 1px solid #bbb; padding: 3px 6px; text-align: left; vertical-align: top; } th { background: #f0f0f0; } td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.kv th { width: 34%; }
figure { margin: 10px 0; page-break-inside: avoid; } figure svg { max-width: 100%; height: auto; } figcaption { font-size: 9pt; color: #444; margin-top: 2px; }
section { page-break-inside: avoid; }
@media print { body { padding: 0; } }
</style></head><body>
${parts.join('\n')}
</body></html>`;
}
