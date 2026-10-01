/**
 * MCP tools, resources and prompts. Every tool returns JSON text (plus image
 * content for figures); every failure returns isError with a teaching message:
 * what failed, on which field, why, and what to do instead.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Command, Override, Project, RunResult, Scenario } from '@thermo2d/core';
import { CommandError, MeshError } from '@thermo2d/core';
import { explainResults, isothermSegments } from '@thermo2d/figures';
import * as api from './coreApi.js';
import { ServerState, resultKey, type Job } from './state.js';
import { WorkspaceError } from './workspace.js';
import { buildReport, endTime, fieldAt, makeInteractive, makeSvg, metricsFor, probeName, rebarRowsFor, sample, sampleLine, type FigureKind } from './figures.js';
import { svgToPng } from './png.js';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean; structuredContent?: Record<string, unknown> };

function ok(data: unknown, extra: Content[] = []): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, jsonSafe, 2) }, ...extra] };
}

function jsonSafe(_k: string, v: unknown): unknown {
  if (v instanceof Float32Array || v instanceof Float64Array || v instanceof Uint32Array || v instanceof Int32Array) return Array.from(v as ArrayLike<number>);
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** Turn any thrown error into a teaching error payload. */
export function teach(e: unknown): ToolResult {
  const err = e as Error & { code?: string; detail?: Record<string, unknown> };
  const payload: Record<string, unknown> = { error: err?.message ?? String(e) };
  if (e instanceof CommandError) {
    payload.code = e.code;
    Object.assign(payload, e.detail);
    payload.hint = e.detail.suggestion ?? 'Check describe_capabilities for the exact field names, units and allowed values, then retry.';
  } else if (e instanceof MeshError) {
    payload.code = e.code;
    Object.assign(payload, e.detail);
    payload.hint = e.detail.hint ?? 'Fix the geometry named above (validate shows it) or choose a coarser mesh preset.';
  } else if (e instanceof WorkspaceError) {
    payload.code = e.code;
  } else if (err?.code) {
    payload.code = err.code;
    if (err.detail) Object.assign(payload, err.detail);
  }
  return { content: [{ type: 'text', text: JSON.stringify(payload, jsonSafe, 2) }], isError: true };
}

async function guard(fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    return teach(e);
  }
}

const lang = z.enum(['nb', 'en']).optional().describe('UI language for text output (default: project setting)');
const theme = z.enum(['light', 'dark', 'print']).optional();
const projectId = z.string().describe('Project id from create_project / open_project');
const vec2 = z.tuple([z.number(), z.number()]);
const edgeRef = z.object({ regionId: z.string(), ring: z.number().int().min(0).default(0), edgeIndex: z.number().int().min(0) });
const overrideSchema = z.object({
  collection: z.enum(['regions', 'materials', 'boundaryConditions', 'timeSeries', 'rebarSets', 'heatSources', 'analyses', 'settings', 'mesh']),
  id: z.string().optional(),
  patch: z.record(z.unknown()),
});

export function projectSummary(state: ServerState, p: Project) {
  const mats = new Map(p.materials.map((m) => [m.id, m]));
  const bbox = (() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of p.regions) for (const [x, y] of r.polygon.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null;
  })();
  const area = (r: [number, number][]) => Math.abs(r.reduce((s, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2);
  let issues: unknown[] = [];
  try {
    issues = api.validateProject(p);
  } catch (e) {
    issues = [{ severity: 'info', code: 'validation-unavailable', message: (e as Error).message }];
  }
  const resultsFor = [...state.results.keys()].filter((k) => k.startsWith(p.id + '|')).map((k) => { const [, a, s] = k.split('|'); return { analysisId: a, scenarioId: s || null }; });
  return {
    id: p.id,
    name: p.name,
    units: p.units,
    settings: p.settings,
    boundingBox: bbox,
    regions: p.regions.map((r) => ({ id: r.id, name: r.name, materialId: r.materialId, material: r.materialId ? mats.get(r.materialId)?.name ?? null : null, vertices: r.polygon.outer.length, holes: r.polygon.holes.length, area: Math.round(area(r.polygon.outer) - r.polygon.holes.reduce((s, h) => s + area(h), 0)), source: r.source, template: r.template ?? null })),
    materials: p.materials.map((m) => ({ id: m.id, name: m.name, category: m.category, model: m.model.kind, quality: m.quality, source: m.source.text })),
    rebarSets: p.rebarSets.map((s) => ({ id: s.id, name: s.name, kind: s.kind, regionId: s.regionId, diameter: s.diameter, count: s.count, spacing: s.spacing, cover: s.cover })),
    rebars: p.rebars.map((b) => ({ id: b.id, name: b.name, centre: b.centre, diameter: b.diameter, setId: b.setId ?? null })),
    boundaryConditions: p.boundaryConditions.map((bc) => ({ id: bc.id, name: bc.name, type: bc.type, edges: bc.edgeRefs.length, edgeRefs: bc.edgeRefs.map((e) => ({ regionId: e.regionId, ring: e.ring, edgeIndex: e.edgeIndex })), params: Object.fromEntries(Object.entries(bc).filter(([k]) => !['id', 'name', 'type', 'edgeRefs', 'color'].includes(k))) })),
    timeSeries: p.timeSeries.map((s) => ({ id: s.id, name: s.name, unit: s.unit, points: s.points.length, tEnd: s.points.length ? s.points[s.points.length - 1][0] : 0, source: s.source })),
    heatSources: p.heatSources,
    probes: p.probes.map((q) => ({ id: q.id, name: q.name, position: q.position, kind: q.kind })),
    lineProbes: p.lineProbes,
    analyses: p.analyses.map((a) => ({ id: a.id, name: a.name, mode: a.mode, duration: a.duration, dt: a.dt, outputInterval: a.outputInterval, initialTemperature: a.initialTemperature })),
    scenarios: p.scenarios.map((s) => ({ id: s.id, name: s.name, overrides: s.overrides })),
    metrics: p.metrics,
    mesh: p.mesh,
    issues,
    resultsAvailable: resultsFor,
    projectHash: safe(() => api.projectHash(p), null),
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function resultSummary(project: Project, r: RunResult, stale: boolean) {
  const tEnd = endTime(r);
  const last = r.fields[r.fields.length - 1];
  let max = -Infinity, min = Infinity;
  if (last) for (let i = 0; i < last.length; i++) { max = Math.max(max, last[i]); min = Math.min(min, last[i]); }
  return {
    analysisId: r.analysisId,
    scenarioId: r.scenarioId,
    mode: r.mode,
    stale,
    duration: tEnd,
    snapshots: r.times.length,
    mesh: r.mesh.stats,
    probesAtEnd: r.probes.map((p, k) => ({ id: p.id, name: probeName(project, p.id), position: p.position, found: p.found, value: p.found && r.probeValues[k]?.length ? round(sample(r.probeTimes, r.probeValues[k], tEnd), 1) : null })),
    fieldAtEnd: last ? { min: round(min, 1), max: round(max, 1) } : null,
    energy: r.energy,
    stats: r.stats,
    warnings: [...r.warnings, ...r.mesh.warnings.map((w) => w.message)],
    stamp: r.stamp ?? null,
  };
}

const round = (v: number, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

function jobView(state: ServerState, job: Job) {
  return {
    jobId: job.id,
    status: job.status,
    projectId: job.projectId,
    analysisId: job.analysisId,
    scenarioId: job.scenarioId,
    progress: job.progress,
    elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt,
    error: job.error ?? null,
    partialProbes: job.status === 'running' ? state.partialProbes(job).map((p) => ({ id: p.id, value: p.value === null ? null : round(p.value, 1) })) : undefined,
  };
}

async function figureContent(svg: string, format: 'svg' | 'png', width?: number): Promise<Content[]> {
  if (format === 'png') {
    const png = await svgToPng(svg, width);
    return [{ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' }];
  }
  return [{ type: 'text', text: svg }];
}

async function runAndWait(state: ServerState, projectId: string, analysisId: string | undefined | null, scenarioId: string | null, timeoutSeconds: number): Promise<RunResult> {
  const job = state.startRun(projectId, analysisId, scenarioId);
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new WorkspaceError(`The run did not finish within ${timeoutSeconds} s; it keeps running as job ${job.id} (poll get_run_status).`, 'timeout')), timeoutSeconds * 1000).unref?.());
  return Promise.race([job.promise, timeout]);
}

export function registerTools(server: McpServer, state: ServerState): void {
  server.registerTool('describe_capabilities', {
    title: 'Describe capabilities',
    description: 'Schema version, units, library categories, boundary-condition types, curve generators with limits, templates, commands, metric kinds and mesh presets. Call this first.',
    inputSchema: {},
  }, async () => guard(() => {
    const curves = state.library.filter((i) => i.category !== 'material').map((i) => ({ id: i.id, name: i.name, category: i.category, generator: i.curve?.generator, params: i.curve?.params, limits: i.curve?.limits, source: i.source.text }));
    return ok({
      app: 'thermo2d',
      schemaVersion: 1,
      coreVersion: api.CORE_VERSION,
      units: { length: 'mm', temperature: '°C', time: 's', conductivity: 'W/mK', specificHeat: 'J/kgK', density: 'kg/m³', flux: 'W/m²', filmCoefficient: 'W/m²K', results: 'per metre depth (W/m, J/m)' },
      conventions: ['Rings are open (first point not repeated), outer counter-clockwise, holes clockwise.', 'Edge k of a ring runs from vertex k to k+1; an EdgeRef is {regionId, ring (0 = outer), edgeIndex}.', 'Regions may nest (rebar inside concrete); they must not partially overlap.', 'Edges without a boundary condition are insulated.', 'A project stores resolved copies of library items, so results stay reproducible.'],
      workspace: state.workspace.root,
      library: { items: state.library.length, categories: ['material', 'fire-curve', 'climate-series'], materialCategories: ['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane', 'custom'], hash: state.libraryHash, warnings: state.libraryWarnings },
      boundaryConditionTypes: {
        fixed: { fields: { temperatureSeriesId: 'TimeSeries id (°C)' } },
        convection: { fields: { airSeriesId: 'TimeSeries id (°C)', alpha: 'W/m²K (or surfaceResistance m²K/W)', surfaceResistance: 'm²K/W; EN ISO 6946: Rse 0.04, Rsi 0.13 horizontal / 0.10 upward / 0.17 downward' } },
        'convection-radiation': { fields: { gasSeriesId: 'TimeSeries id (°C)', radiationSeriesId: 'optional TimeSeries id, default = gas', alphaC: 'W/m²K (25 for standard fire, 4 on unexposed faces per EN 1991-1-2 §3.2)', phi: 'configuration factor (1.0)', epsM: 'surface emissivity (default: material, 0.7 concrete/steel)', epsF: 'fire emissivity (1.0)' } },
        flux: { fields: { fluxSeriesId: 'TimeSeries id (W/m²)' } },
        insulated: { fields: {} },
      },
      curveGenerators: curves,
      seriesGenerators: { constant: { value: 'value' }, step: { before: 'value', after: 'value', t0: 's' }, ramp: { from: 'value', to: 'value', t0: 's', t1: 's' }, sinusoid: { mean: 'value', amplitude: 'value', period: 's', phase: 's', duration: 's' }, repeat: { seriesId: 'id', times: 'n' } },
      templates: api.TEMPLATES.map((t) => ({ id: t.id, name: t.name, nameNb: t.nameNb, params: t.params })),
      commands: safe(() => api.describeCommands(), []),
      metricKinds: ['heat-flow', 'u-value', 'psi-value', 'min-surface-temperature', 'mean-surface-temperature', 'f-rsi', 'time-to-threshold', 'max-temperature', 'probe-temperature'],
      analysisModes: ['steady', 'transient', 'periodic'],
      meshPresets: ['coarse', 'normal', 'fine', 'custom'],
      figureKinds: ['time-series', 'field', 'profile', 'model', 'overlay', 'difference', 'sweep'],
      exposurePresets: { sides: ['bottom', 'top', 'left', 'right', 'all', 'exterior'], kinds: ['fire', 'fire-unexposed', 'ambient', 'insulated', 'indoor', 'outdoor'] },
      typicalWorkflow: ['create_project', 'create_from_template', 'apply_commands (materials, rebar sets, exposure, probes)', 'validate', 'run_analysis', 'query_results', 'make_figure', 'explain_results', 'save_project'],
    });
  }));

  server.registerTool('search_library', {
    title: 'Search library',
    description: 'Find materials and curves by text, category, tags, conductivity or density range. Returns values with citations and quality flags.',
    inputSchema: {
      text: z.string().optional(),
      category: z.enum(['material', 'fire-curve', 'climate-series']).optional(),
      materialCategory: z.string().optional().describe('concrete | insulation | wood | gypsum | metal | masonry | air | ground | membrane | custom'),
      tags: z.array(z.string()).optional(),
      lambdaRange: z.tuple([z.number(), z.number()]).optional().describe('W/mK at 20 °C'),
      densityRange: z.tuple([z.number(), z.number()]).optional().describe('kg/m³'),
      limit: z.number().int().min(1).max(200).default(40),
    },
  }, async (a) => guard(() => {
    const items = api.searchLibrary({ text: a.text, category: a.category, tags: a.tags, lambdaRange: a.lambdaRange, densityRange: a.densityRange, materialCategory: a.materialCategory }, state.library).slice(0, a.limit);
    return ok({ count: items.length, items: items.map((i) => ({ id: i.id, name: i.name, nameNb: i.nameNb, category: i.category, materialCategory: i.material?.category, model: i.material?.model.kind, at20: i.material ? safe(() => api.evaluateMaterial({ ...i.material!, id: i.id, origin: i.origin }, 20), null) : undefined, curve: i.curve ? { generator: i.curve.generator, params: i.curve.params } : undefined, quality: i.quality, source: i.source.text, tags: i.tags })) });
  }));

  server.registerTool('get_library_item', {
    title: 'Get library item',
    description: 'Full library item with citation; for materials, the properties evaluated at the given temperatures.',
    inputSchema: { id: z.string(), temperatures: z.array(z.number()).optional().describe('°C, default [20, 100, 200, 400, 600, 800, 1000]') },
  }, async (a) => guard(() => {
    const item = api.getLibraryItem(a.id, state.library);
    if (!item) throw new WorkspaceError(`No library item "${a.id}". Use search_library to find ids.`, 'not-found');
    const temps = a.temperatures ?? [20, 100, 200, 400, 600, 800, 1000];
    const evaluated = item.material ? temps.map((t) => ({ theta: t, ...safe(() => api.evaluateMaterial({ ...item.material!, id: item.id, origin: item.origin }, t), { lambda: NaN, cp: NaN, rho: NaN }) })) : undefined;
    const preview = item.curve ? safe(() => api.generateCurve(item.curve!.generator, item.curve!.params, 7200).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 20)) === 0), []) : undefined;
    return ok({ item, evaluated, curvePreview: preview });
  }));

  server.registerTool('create_project', {
    title: 'Create project',
    description: 'New empty project in memory (save_project writes it to the workspace). Returns the project id used by every other tool.',
    inputSchema: { name: z.string(), language: z.enum(['nb', 'en']).optional() },
  }, async (a) => guard(() => {
    const e = state.createProject(a.name, a.language);
    return ok({ projectId: e.project.id, name: e.project.name, file: state.workspace.relative(state.workspace.projectPath(e.name)), analyses: e.project.analyses.map((x) => ({ id: x.id, name: x.name })) });
  }));

  server.registerTool('open_project', {
    title: 'Open project',
    description: 'Open a .thermo.json from the workspace by name or relative path. Cached results next to it are loaded too.',
    inputSchema: { name: z.string() },
  }, async (a) => guard(async () => {
    const e = await state.openProject(a.name);
    return ok({ projectId: e.project.id, path: e.path, summary: projectSummary(state, e.project) });
  }));

  server.registerTool('save_project', {
    title: 'Save project',
    description: 'Write the project to <workspace>/<name>.thermo.json.',
    inputSchema: { projectId, name: z.string().optional() },
  }, async (a) => guard(async () => ok({ path: await state.saveProject(a.projectId, a.name) })));

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'Project files in the workspace and projects currently open in memory.',
    inputSchema: {},
  }, async () => guard(async () => ok({
    workspace: state.workspace.root,
    files: await state.workspace.list('', ['.thermo.json']),
    open: [...state.projects.values()].map((e) => ({ projectId: e.project.id, name: e.project.name, file: e.path ?? null, unsaved: e.dirty })),
  })));

  server.registerTool('create_from_template', {
    title: 'Create from template',
    description: 'Add a parametric section (rect-beam, t-beam, circle-column, layered-wall, …) to a project. See describe_capabilities → templates for params. Optionally assigns a material (project material id or library id).',
    inputSchema: { projectId, templateId: z.string(), params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}), materialId: z.string().optional().describe('Existing project material id'), libraryMaterialId: z.string().optional().describe('Library item id; the material is added to the project'), name: z.string().optional() },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    const cmds: Command[] = [];
    let materialId = a.materialId ?? null;
    if (a.libraryMaterialId) {
      const item = api.getLibraryItem(a.libraryMaterialId, state.library);
      if (!item?.material) throw new WorkspaceError(`No library material "${a.libraryMaterialId}". Use search_library with category "material".`, 'not-found');
      const m = api.materialFromLibrary(item);
      cmds.push({ type: 'material.add', material: m });
      materialId = m.id;
    }
    cmds.push({ type: 'template.create', templateId: a.templateId, params: a.params, materialId, name: a.name });
    const res = api.applyCommands(e.project, cmds);
    state.updateProject(a.projectId, res.project);
    return ok({ createdIds: res.createdIds, changes: res.changes, warnings: res.warnings, regions: res.project.regions.map((r) => ({ id: r.id, name: r.name, materialId: r.materialId })), edges: describeEdges(res.project) });
  }));

  server.registerTool('apply_commands', {
    title: 'Apply commands',
    description: 'Atomic batch of editing commands (regions, booleans, offsets, holes, materials, rebar sets, boundary conditions, exposure shortcut, time series, probes, scenarios, metrics, analyses). All or nothing. dry_run validates without changing the project. See describe_capabilities → commands.',
    inputSchema: { projectId, commands: z.array(z.record(z.unknown())).min(1), dry_run: z.boolean().default(false) },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    const res = api.applyCommands(e.project, a.commands as unknown as Command[]);
    if (!a.dry_run) state.updateProject(a.projectId, res.project);
    let issues: unknown[] = [];
    try { issues = api.validateProject(res.project); } catch { /* optional */ }
    return ok({ dryRun: a.dry_run, createdIds: res.createdIds, changes: res.changes, warnings: res.warnings, issues, counts: { regions: res.project.regions.length, rebars: res.project.rebars.length, boundaryConditions: res.project.boundaryConditions.length, probes: res.project.probes.length, timeSeries: res.project.timeSeries.length } });
  }));

  server.registerTool('get_model', {
    title: 'Get model',
    description: 'Structured summary of a project: regions, materials, rebars, boundary conditions with their edges, series, probes, analyses, scenarios, validation issues, results available.',
    inputSchema: { projectId, includeEdges: z.boolean().default(true).describe('List every exterior edge with midpoint and outward side, to pick edges for boundary conditions') },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    return ok({ ...projectSummary(state, e.project), edges: a.includeEdges ? describeEdges(e.project) : undefined });
  }));

  server.registerTool('get_model_image', {
    title: 'Get model image',
    description: 'Labelled preview of the model: regions with material names, rebar numbers, colour-coded boundary edges, probes, dimensions. PNG (image) or SVG (text). Also written to <workspace>/figures.',
    inputSchema: { projectId, format: z.enum(['png', 'svg']).default('png'), width: z.number().int().min(200).max(4000).optional(), showMesh: z.boolean().default(false), lang },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    let mesh: RunResult['mesh'] | undefined;
    if (a.showMesh) mesh = safe(() => api.mesh(api.buildMeshInput(e.project)), undefined);
    const svg = makeSvg({ kind: 'model', project: e.project, mesh, lang: a.lang, width: a.width ? a.width : undefined });
    const rel = state.workspace.uniqueName('figures', `${e.name}-model`, a.format);
    const content = await figureContent(svg, a.format, a.width);
    await (a.format === 'png' ? state.workspace.writeBytes(rel, Buffer.from((content[0] as { data: string }).data, 'base64')) : state.workspace.writeText(rel, svg));
    return { content: [{ type: 'text', text: JSON.stringify({ path: state.workspace.resolve(rel), format: a.format, meshElements: mesh?.stats.elementCount }) }, ...content] };
  }));

  server.registerTool('import_time_series', {
    title: 'Import time series',
    description: 'Parse CSV / pasted Excel columns / EPW weather text (or a file in the workspace) into a named time series of the project, and report what was understood (separator, decimal, time unit, range, step, gaps).',
    inputSchema: { projectId, name: z.string(), text: z.string().optional(), file: z.string().optional().describe('Path inside the workspace'), format: z.enum(['auto', 'csv', 'epw']).default('auto'), unit: z.enum(['°C', 'W/m²']).default('°C'), interpolation: z.enum(['linear', 'step']).default('linear'), afterEnd: z.enum(['hold', 'repeat', 'ambient']).default('hold'), timeUnit: z.enum(['s', 'min', 'h', 'd']).optional().describe('Force the time unit when the file has no header'), id: z.string().optional() },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    const text = a.text ?? (a.file ? await state.workspace.readText(a.file) : undefined);
    if (!text) throw new WorkspaceError('Give either text or file.', 'missing-input');
    const isEpw = a.format === 'epw' || (a.format === 'auto' && /^LOCATION,/i.test(text.trimStart()));
    const report = isEpw ? api.parseEpw(text) : api.parseTimeSeriesText(text, a.timeUnit ? { timeUnit: a.timeUnit } : {});
    const points = report.series ?? report.points;
    if (!points || !points.length) throw new WorkspaceError(`No data rows were recognised. ${report.warnings.join(' ')}`, 'import-empty');
    const res = api.applyCommands(e.project, [{ type: 'series.add', series: { id: a.id, name: a.name, points, interpolation: a.interpolation, afterEnd: a.afterEnd, unit: a.unit, source: { kind: isEpw ? 'epw' : 'csv', ref: a.file ?? 'pasted text' } } }]);
    state.updateProject(a.projectId, res.project);
    const { series: _s, points: _p, ...rest } = report;
    return ok({ seriesId: res.createdIds[0]?.[0] ?? a.id, points: points.length, first: points[0], last: points[points.length - 1], report: rest });
  }));

  server.registerTool('validate', {
    title: 'Validate',
    description: 'Geometry and input checks in plain words plus a mesh preview (element count, min angle) without running.',
    inputSchema: { projectId, mesh: z.boolean().default(true) },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    const issues = api.validateProject(e.project);
    let meshPreview: unknown = null;
    if (a.mesh) {
      try {
        const m = api.mesh(api.buildMeshInput(e.project));
        meshPreview = { ...m.stats, regions: m.regions.map((r) => ({ id: r.id, elements: r.elementCount, area: Math.round(r.area) })), boundarySegments: m.boundary.length, warnings: m.warnings };
      } catch (err) {
        meshPreview = { error: (err as Error).message, ...((err as MeshError).detail ?? {}) };
      }
    }
    const errors = issues.filter((i) => i.severity === 'error').length;
    return ok({ ok: errors === 0, errors, warnings: issues.filter((i) => i.severity === 'warning').length, issues, meshPreview });
  }));

  server.registerTool('run_analysis', {
    title: 'Run analysis',
    description: 'Start a steady, transient or periodic run. Returns a job id at once; poll get_run_status, or set wait=true to block until done (up to timeoutSeconds). Results are cached per (analysis, scenario) and written next to the project when saved.',
    inputSchema: { projectId, analysisId: z.string().optional(), scenarioId: z.string().optional(), wait: z.boolean().default(true), timeoutSeconds: z.number().min(1).max(3600).default(300) },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    if (a.wait) {
      const job = state.startRun(a.projectId, a.analysisId, a.scenarioId ?? null);
      const timeout = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), a.timeoutSeconds * 1000).unref?.());
      const outcome = await Promise.race([job.promise.then((r) => r).catch((err) => err as Error), timeout]);
      if (outcome === 'timeout') return ok({ ...jobView(state, job), note: 'Still running; poll get_run_status.' });
      if (outcome instanceof Error) throw outcome;
      return ok({ ...jobView(state, job), result: resultSummary(e.project, outcome, false) });
    }
    const job = state.startRun(a.projectId, a.analysisId, a.scenarioId ?? null);
    return ok(jobView(state, job));
  }));

  server.registerTool('get_run_status', {
    title: 'Get run status',
    description: 'Progress of a job, partial probe values while running, and the result summary when done.',
    inputSchema: { jobId: z.string() },
  }, async (a) => guard(() => {
    const job = state.getJob(a.jobId);
    const e = state.projects.get(job.projectId);
    return ok({ ...jobView(state, job), result: job.result && e ? resultSummary(e.project, job.result, false) : undefined });
  }));

  server.registerTool('cancel_run', {
    title: 'Cancel run',
    description: 'Stop a running job; the partial result (up to the last accepted step) is kept on the job.',
    inputSchema: { jobId: z.string() },
  }, async (a) => guard(() => {
    const job = state.getJob(a.jobId);
    job.cancelRequested = true;
    return ok({ jobId: job.id, status: job.status, cancelRequested: true });
  }));

  server.registerTool('query_results', {
    title: 'Query results',
    description: 'Exact numbers from a run: probes (histories at times), points (x,y at times), line (profile at a time), extremes, time_to_threshold, isotherm (reduced section), rebar_table (k_s), metrics (U, ψ, f_Rsi, heat flow … from the project metrics), heat_flow (edges at a time), all (summary).',
    inputSchema: {
      projectId,
      analysisId: z.string().optional(),
      scenarioId: z.string().optional(),
      query: z.enum(['all', 'probes', 'points', 'line', 'extremes', 'time_to_threshold', 'isotherm', 'rebar_table', 'metrics', 'heat_flow']).default('all'),
      times: z.array(z.number()).optional().describe('s; default: end of run (probes: also 30/60/90/120 min when inside the run)'),
      time: z.number().optional().describe('s; for line, extremes, isotherm, heat_flow'),
      points: z.array(vec2).optional(),
      probeIds: z.array(z.string()).optional(),
      line: z.object({ from: vec2, to: vec2, samples: z.number().int().min(2).max(2000).default(50) }).optional(),
      threshold: z.number().optional().describe('°C for time_to_threshold'),
      isotherm: z.number().default(500),
      edgeRefs: z.array(edgeRef).optional(),
      bcId: z.string().optional().describe('Use the edges of this boundary condition for heat_flow'),
    },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    const { result: r, stale } = state.getResult(a.projectId, a.analysisId, a.scenarioId ?? null);
    const p = e.project;
    const tEnd = endTime(r);
    const times = (a.times ?? defaultTimes(tEnd)).map((t) => Math.min(t, tEnd));
    const out: Record<string, unknown> = { analysisId: r.analysisId, scenarioId: r.scenarioId, stale, tEnd };
    const want = (k: string) => a.query === k || a.query === 'all';
    if (want('probes')) {
      out.probes = r.probes.filter((q) => !a.probeIds || a.probeIds.includes(q.id)).map((q) => { const k = r.probes.indexOf(q); return { id: q.id, name: probeName(p, q.id), position: q.position, found: q.found, values: Object.fromEntries(times.map((t) => [t, q.found ? round(sample(r.probeTimes, r.probeValues[k], t), 1) : null])), max: q.found ? round(Math.max(...Array.from(r.probeValues[k])), 1) : null }; });
    }
    if (a.query === 'points' || (a.query === 'all' && a.points)) {
      out.points = (a.points ?? []).map((pt) => ({ point: pt, values: Object.fromEntries(times.map((t) => { const { field } = fieldAt(r, t); const v = api.interpolateField(r.mesh, field, pt); return [t, v === null ? null : round(v, 1)]; })) }));
    }
    if (a.query === 'line' || (a.query === 'all' && a.line)) {
      const line = a.line ?? { from: [0, 0] as [number, number], to: [0, 1] as [number, number], samples: 50 };
      const { field, t } = fieldAt(r, a.time);
      const prof = sampleLine(r.mesh, field, line.from, line.to, line.samples);
      out.line = { time: t, from: line.from, to: line.to, samples: prof.points.map((pt, i) => ({ s: round(prof.s[i], 2), x: round(pt[0], 2), y: round(pt[1], 2), theta: round(prof.v[i], 1) })) };
    }
    if (want('extremes')) {
      const { field, t } = fieldAt(r, a.time);
      let max = -Infinity, min = Infinity, iMax = 0, iMin = 0;
      for (let i = 0; i < field.length; i++) { if (field[i] > max) { max = field[i]; iMax = i; } if (field[i] < min) { min = field[i]; iMin = i; } }
      out.extremes = { time: t, max: { theta: round(max, 1), x: r.mesh.nodes[2 * iMax], y: r.mesh.nodes[2 * iMax + 1] }, min: { theta: round(min, 1), x: r.mesh.nodes[2 * iMin], y: r.mesh.nodes[2 * iMin + 1] } };
    }
    if (a.query === 'time_to_threshold' || (a.query === 'all' && a.threshold !== undefined)) {
      const th = a.threshold ?? 500;
      out.timeToThreshold = { threshold: th, probes: r.probes.filter((q) => q.found && (!a.probeIds || a.probeIds.includes(q.id))).map((q) => { const k = r.probes.indexOf(q); return { id: q.id, name: probeName(p, q.id), time: safe(() => api.timeToThreshold(r.probeTimes, r.probeValues[k], th), crossing(r.probeTimes, r.probeValues[k], th)) }; }) };
    }
    if (want('isotherm')) {
      const { field, t } = fieldAt(r, a.time);
      const segs = isothermSegments(r.mesh, field, a.isotherm);
      const red = safe(() => api.reducedSection(r.mesh, field, a.isotherm), null);
      out.isotherm = { theta: a.isotherm, time: t, segments: segs.length, reducedSection: red ? { area: round(red.area, 0), width: round(red.width, 1), height: round(red.height, 1) } : coldBox(r, field, a.isotherm) };
    }
    if (want('rebar_table') && p.rebars.length) out.rebarTable = { times, rows: rebarRowsFor(p, r, times) };
    if (want('metrics') && p.metrics.length) out.metrics = metricsFor(p, r);
    if (a.query === 'heat_flow' || (a.query === 'all' && (a.edgeRefs || a.bcId))) {
      const refs = a.edgeRefs ?? p.boundaryConditions.find((b) => b.id === a.bcId)?.edgeRefs;
      if (!refs) throw new WorkspaceError('heat_flow needs edgeRefs or a bcId.', 'missing-edges');
      const t = a.time ?? tEnd;
      out.heatFlow = { time: t, edges: refs.length, value: round(api.heatFlowAcrossEdges(r, p.boundaryConditions, api.seriesEvaluators(p), refs, t), 3), unit: 'W/m (positive = into the section)' };
    }
    if (a.query === 'all') out.summary = resultSummary(p, r, stale);
    return ok(out);
  }));

  server.registerTool('make_figure', {
    title: 'Make figure',
    description: 'Time-series, temperature field with isotherms, line profile, model preview, scenario overlay, difference field, or sweep chart as SVG, PNG (image) or self-contained interactive HTML (draggable time cursor and probes). Written to <workspace>/figures and returned.',
    inputSchema: {
      projectId,
      kind: z.enum(['time-series', 'field', 'profile', 'model', 'overlay', 'difference', 'sweep', 'interactive']),
      format: z.enum(['svg', 'png', 'html']).default('png'),
      analysisId: z.string().optional(),
      scenarioId: z.string().optional(),
      compareWith: z.array(z.object({ analysisId: z.string().optional(), scenarioId: z.string().optional(), label: z.string().optional() })).optional().describe('Extra results for overlay / difference / interactive'),
      time: z.number().optional().describe('s'),
      probeIds: z.array(z.string()).optional(),
      isotherms: z.array(z.number()).optional(),
      bands: z.object({ min: z.number(), max: z.number(), step: z.number() }).optional(),
      showMesh: z.boolean().optional(),
      smooth: z.boolean().optional(),
      line: z.object({ from: vec2, to: vec2, samples: z.number().int().optional() }).optional(),
      sweep: z.object({ points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })), parameterLabel: z.string(), metricLabel: z.string() }).optional(),
      title: z.string().optional(),
      width: z.number().int().min(200).max(4000).optional(),
      height: z.number().int().min(200).max(4000).optional(),
      theme,
      lang,
      fileName: z.string().optional(),
    },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    const p = e.project;
    const needsResult = a.kind !== 'model' && a.kind !== 'sweep';
    const base = needsResult ? state.getResult(a.projectId, a.analysisId, a.scenarioId ?? null) : null;
    const results = base ? [{ label: a.scenarioId ? p.scenarios.find((s) => s.id === a.scenarioId)?.name ?? a.scenarioId : p.analyses.find((x) => x.id === base.analysisId)?.name ?? 'base', result: base.result }] : [];
    for (const c of a.compareWith ?? []) {
      const rr = state.getResult(a.projectId, c.analysisId ?? a.analysisId, c.scenarioId ?? null);
      results.push({ label: c.label ?? (c.scenarioId ? p.scenarios.find((s) => s.id === c.scenarioId)?.name ?? c.scenarioId : rr.analysisId), result: rr.result });
    }
    const ext = a.kind === 'interactive' || a.format === 'html' ? 'html' : a.format;
    const rel = state.workspace.uniqueName('figures', a.fileName ?? `${e.name}-${a.kind}`, ext);
    if (ext === 'html') {
      const html = makeInteractive(p, results, a.lang, a.isotherms, a.bands);
      const abs = await state.workspace.writeText(rel, html);
      return ok({ path: abs, format: 'html', bytes: html.length, note: 'Self-contained interactive HTML; open in a browser or email it.' });
    }
    const svg = makeSvg({ kind: a.kind as FigureKind, project: p, result: results[0]?.result, results, time: a.time, probeIds: a.probeIds, theme: a.theme, isotherms: a.isotherms, bands: a.bands, showMesh: a.showMesh, smooth: a.smooth, line: a.line, sweep: a.sweep, title: a.title, width: a.width, height: a.height, lang: a.lang, mesh: results[0]?.result.mesh });
    const content = await figureContent(svg, a.format as 'svg' | 'png', a.width);
    const abs = a.format === 'png' ? await state.workspace.writeBytes(rel, Buffer.from((content[0] as { data: string }).data, 'base64')) : await state.workspace.writeText(rel, svg);
    return { content: [{ type: 'text', text: JSON.stringify({ path: abs, format: a.format, kind: a.kind, stale: base?.stale ?? false }) }, ...content] };
  }));

  server.registerTool('explain_results', {
    title: 'Explain results',
    description: 'Plain-language narrative: inputs, assumptions, standards used, key results, checks and warnings.',
    inputSchema: { projectId, analysisId: z.string().optional(), scenarioId: z.string().optional(), lang, times: z.array(z.number()).optional() },
  }, async (a) => guard(() => {
    const e = state.getProject(a.projectId);
    const { result: r, stale } = state.getResult(a.projectId, a.analysisId, a.scenarioId ?? null);
    const tEnd = endTime(r);
    const times = a.times ?? defaultTimes(tEnd);
    const text = explainResults({ project: e.project, result: r, lang: a.lang, metrics: metricsFor(e.project, r), rebarRows: rebarRowsFor(e.project, r, times), rebarTimes: times });
    return { content: [{ type: 'text', text: (stale ? (a.lang === 'en' ? '(Note: the project changed after this run; results are stale.)\n\n' : '(Merk: prosjektet er endret etter denne kjøringen; resultatene er utdaterte.)\n\n') : '') + text }] };
  }));

  server.registerTool('compare_scenarios', {
    title: 'Compare scenarios',
    description: 'Create scenarios from overrides (or use existing scenario ids), run the base model and every scenario, and return a table of probe values and metrics plus an overlay figure.',
    inputSchema: {
      projectId,
      analysisId: z.string().optional(),
      scenarios: z.array(z.object({ name: z.string(), overrides: z.array(overrideSchema) })).optional(),
      scenarioIds: z.array(z.string()).optional(),
      probeIds: z.array(z.string()).optional(),
      times: z.array(z.number()).optional(),
      includeBase: z.boolean().default(true),
      timeoutSeconds: z.number().min(1).max(7200).default(900),
      format: z.enum(['png', 'svg']).default('png'),
      lang,
    },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    const ids: string[] = [...(a.scenarioIds ?? [])];
    if (a.scenarios?.length) {
      const res = api.applyCommands(e.project, a.scenarios.map((s) => ({ type: 'scenario.add', scenario: { name: s.name, overrides: s.overrides as Override[] } })));
      state.updateProject(a.projectId, res.project);
      res.createdIds.forEach((c) => c[0] && ids.push(c[0]));
    }
    if (!ids.length) throw new WorkspaceError('Give scenarios (name + overrides) or scenarioIds.', 'missing-scenarios');
    const p = state.getProject(a.projectId).project;
    const an = state.resolveAnalysisId(p, a.analysisId);
    const runs: { label: string; result: RunResult }[] = [];
    if (a.includeBase) runs.push({ label: p.analyses.find((x) => x.id === an)?.name ?? 'base', result: safe(() => state.getResult(a.projectId, an, null).result, null as RunResult | null) ?? (await runAndWait(state, a.projectId, an, null, a.timeoutSeconds)) });
    for (const sid of ids) {
      const sc = p.scenarios.find((s) => s.id === sid) as Scenario | undefined;
      runs.push({ label: sc?.name ?? sid, result: await runAndWait(state, a.projectId, an, sid, a.timeoutSeconds) });
    }
    const tEnd = endTime(runs[0].result);
    const times = a.times ?? defaultTimes(tEnd);
    const probeIds = a.probeIds ?? runs[0].result.probes.filter((q) => q.found).map((q) => q.id);
    const table = probeIds.map((pid) => ({ probe: probeName(p, pid), values: runs.map((r) => { const k = r.result.probes.findIndex((q) => q.id === pid); return { scenario: r.label, ...Object.fromEntries(times.map((t) => [t, k >= 0 ? round(sample(r.result.probeTimes, r.result.probeValues[k], t), 1) : null])) }; }) }));
    const metrics = p.metrics.length ? runs.map((r) => ({ scenario: r.label, metrics: metricsFor(p, r.result) })) : undefined;
    const svg = makeSvg({ kind: 'overlay', project: p, results: runs, probeIds, lang: a.lang, theme: 'light' });
    const rel = state.workspace.uniqueName('figures', `${e.name}-compare`, a.format);
    const content = await figureContent(svg, a.format);
    const abs = a.format === 'png' ? await state.workspace.writeBytes(rel, Buffer.from((content[0] as { data: string }).data, 'base64')) : await state.workspace.writeText(rel, svg);
    return { content: [{ type: 'text', text: JSON.stringify({ analysisId: an, scenarioIds: ids, times, table, metrics, figure: abs, differences: probeIds.map((pid) => ({ probe: probeName(p, pid), deltaAtEnd: runs.slice(1).map((r) => { const k0 = runs[0].result.probes.findIndex((q) => q.id === pid), k1 = r.result.probes.findIndex((q) => q.id === pid); return { scenario: r.label, delta: k0 >= 0 && k1 >= 0 ? round(sample(r.result.probeTimes, r.result.probeValues[k1], tEnd) - sample(runs[0].result.probeTimes, runs[0].result.probeValues[k0], tEnd), 1) : null }; }) })) }, jsonSafe, 2) }, ...content] };
  }));

  server.registerTool('run_sweep', {
    title: 'Run sweep',
    description: 'Vary one parameter (an Override with a list of values, e.g. rebarSets/<id>/cover = [25, 35, 45]) and report a chosen metric per value: a probe temperature at a time, time to a threshold, or a project metric. Returns a table and a sweep chart.',
    inputSchema: {
      projectId,
      analysisId: z.string().optional(),
      parameter: z.object({ collection: overrideSchema.shape.collection, id: z.string().optional(), field: z.string(), values: z.array(z.number()).min(2), label: z.string().optional() }),
      metric: z.object({ kind: z.enum(['probe-temperature', 'time-to-threshold', 'metric', 'max-temperature']).default('probe-temperature'), probeId: z.string().optional(), time: z.number().optional(), threshold: z.number().optional(), metricId: z.string().optional() }).default({ kind: 'probe-temperature' }),
      timeoutSeconds: z.number().min(1).max(7200).default(900),
      format: z.enum(['png', 'svg']).default('png'),
    },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    const an = state.resolveAnalysisId(e.project, a.analysisId);
    const cmds: Command[] = a.parameter.values.map((v) => ({ type: 'scenario.add', scenario: { name: `${a.parameter.label ?? a.parameter.field} = ${v}`, overrides: [{ collection: a.parameter.collection, id: a.parameter.id, patch: { [a.parameter.field]: v } }] } }));
    const res = api.applyCommands(e.project, cmds);
    state.updateProject(a.projectId, res.project);
    const p = state.getProject(a.projectId).project;
    const points: { x: number; y: number; label?: string }[] = [];
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < a.parameter.values.length; i++) {
      const sid = res.createdIds[i]?.[0];
      const r = await runAndWait(state, a.projectId, an, sid, a.timeoutSeconds);
      const tEnd = endTime(r);
      const probeIdx = a.metric.probeId ? r.probes.findIndex((q) => q.id === a.metric.probeId) : r.probes.findIndex((q) => q.found);
      let y: number | null = null;
      let label = '';
      if (a.metric.kind === 'probe-temperature' && probeIdx >= 0) { y = round(sample(r.probeTimes, r.probeValues[probeIdx], a.metric.time ?? tEnd), 1); label = `${probeName(p, r.probes[probeIdx].id)} @ ${Math.round((a.metric.time ?? tEnd) / 60)} min [°C]`; }
      else if (a.metric.kind === 'time-to-threshold' && probeIdx >= 0) { const t = safe(() => api.timeToThreshold(r.probeTimes, r.probeValues[probeIdx], a.metric.threshold ?? 500), crossing(r.probeTimes, r.probeValues[probeIdx], a.metric.threshold ?? 500)); y = t === null ? null : round(t / 60, 1); label = `time to ${a.metric.threshold ?? 500} °C [min]`; }
      else if (a.metric.kind === 'max-temperature') { const { field } = fieldAt(r, a.metric.time); let m = -Infinity; for (let k = 0; k < field.length; k++) m = Math.max(m, field[k]); y = round(m, 1); label = 'max θ [°C]'; }
      else if (a.metric.kind === 'metric') { const ms = metricsFor(p, r); const m = a.metric.metricId ? ms.find((x) => x.metricId === a.metric.metricId) : ms[0]; y = m?.value ?? null; label = m ? `${m.name}${m.unit ? ` [${m.unit}]` : ''}` : 'metric'; }
      rows.push({ value: a.parameter.values[i], scenarioId: sid, metric: y, label });
      if (y !== null) points.push({ x: a.parameter.values[i], y });
    }
    const metricLabel = String(rows[0]?.label ?? 'metric');
    const svg = makeSvg({ kind: 'sweep', project: p, sweep: { points, parameterLabel: a.parameter.label ?? `${a.parameter.collection}.${a.parameter.field}`, metricLabel }, title: `${p.name}: sweep` });
    const rel = state.workspace.uniqueName('figures', `${e.name}-sweep`, a.format);
    const content = await figureContent(svg, a.format);
    const abs = a.format === 'png' ? await state.workspace.writeBytes(rel, Buffer.from((content[0] as { data: string }).data, 'base64')) : await state.workspace.writeText(rel, svg);
    return { content: [{ type: 'text', text: JSON.stringify({ analysisId: an, parameter: a.parameter, rows, figure: abs }, jsonSafe, 2) }, ...content] };
  }));

  server.registerTool('make_report', {
    title: 'Make report',
    description: 'Customer-ready HTML report (A4 print CSS; use the browser "Save as PDF" for a PDF) with model, figures, tables, metrics, explanation and citations. Written to <workspace>/reports.',
    inputSchema: { projectId, analysisId: z.string().optional(), scenarioId: z.string().optional(), compareWith: z.array(z.string()).optional().describe('Scenario ids to include'), times: z.array(z.number()).optional(), lang, title: z.string().optional(), fileName: z.string().optional() },
  }, async (a) => guard(async () => {
    const e = state.getProject(a.projectId);
    const p = e.project;
    const base = state.getResult(a.projectId, a.analysisId, a.scenarioId ?? null);
    const results = [{ label: a.scenarioId ? p.scenarios.find((s) => s.id === a.scenarioId)?.name ?? a.scenarioId : p.analyses.find((x) => x.id === base.analysisId)?.name ?? 'base', result: base.result }];
    for (const sid of a.compareWith ?? []) results.push({ label: p.scenarios.find((s) => s.id === sid)?.name ?? sid, result: state.getResult(a.projectId, base.analysisId, sid).result });
    const bundle = buildReport(p, results, { lang: a.lang, times: a.times, title: a.title });
    const rel = state.workspace.uniqueName('reports', a.fileName ?? `${e.name}-report`, 'html');
    const abs = await state.workspace.writeText(rel, bundle.html);
    return ok({ path: abs, format: 'html', pdf: 'Open the HTML in Edge or Chrome and use Print → Save as PDF (A4 layout is built in).', metrics: bundle.metrics, rebarRows: bundle.rebarRows, stale: base.stale });
  }));

  server.registerTool('open_in_app', {
    title: 'Open in app',
    description: 'Save the project to the workspace and return the web-app URL with instructions to open the file there (File → Open). The live WebSocket bridge is not part of v1.',
    inputSchema: { projectId, name: z.string().optional() },
  }, async (a) => guard(async () => {
    const path = await state.saveProject(a.projectId, a.name);
    return ok({ path, appUrl: 'https://magnusfjeldolsen.github.io/structural_tools/thermo2d/', instructions: `Open the app, choose "Åpne / Open" and pick ${path}. Save it back to the same file and call open_project again to continue by prompt.`, liveBridge: false });
  }));
}

function defaultTimes(tEnd: number): number[] {
  const marks = [1800, 3600, 5400, 7200].filter((t) => t < tEnd - 1);
  return [...marks, tEnd];
}

function crossing(t: ArrayLike<number>, v: ArrayLike<number>, th: number): number | null {
  for (let i = 1; i < t.length; i++) if ((v[i - 1] < th && v[i] >= th) || (v[i - 1] > th && v[i] <= th)) { const f = (th - v[i - 1]) / (v[i] - v[i - 1] || 1); return t[i - 1] + (t[i] - t[i - 1]) * f; }
  return null;
}

function coldBox(r: RunResult, field: ArrayLike<number>, th: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (let i = 0; i < field.length; i++) if (field[i] < th) { n++; const x = r.mesh.nodes[2 * i], y = r.mesh.nodes[2 * i + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return n ? { width: round(maxX - minX, 1), height: round(maxY - minY, 1), coldNodes: n, note: 'bounding box of nodes below the isotherm' } : { width: 0, height: 0, coldNodes: 0 };
}

/** Exterior edges of every region with midpoint, length and outward side, so a client can pick edges. */
export function describeEdges(p: Project) {
  const out: { regionId: string; ring: number; edgeIndex: number; from: [number, number]; to: [number, number]; midpoint: [number, number]; length: number; side: string; bcId: string | null }[] = [];
  const bcOf = new Map<string, string>();
  for (const bc of p.boundaryConditions) for (const e of bc.edgeRefs) bcOf.set(`${e.regionId}/${e.ring}/${e.edgeIndex}`, bc.id);
  for (const r of p.regions) {
    const rings = [r.polygon.outer, ...r.polygon.holes];
    rings.forEach((ring, ri) => {
      const ccw = ringArea(ring) > 0;
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        // outward normal for a CCW outer ring is (dy, -dx); holes are CW so the same formula points into the hole (outward from material).
        const nx = ccw === (ri === 0) ? dy : -dy, ny = ccw === (ri === 0) ? -dx : dx;
        const side = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : ny > 0 ? 'top' : 'bottom';
        out.push({ regionId: r.id, ring: ri, edgeIndex: i, from: a, to: b, midpoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], length: Math.round(Math.hypot(dx, dy) * 10) / 10, side, bcId: bcOf.get(`${r.id}/${ri}/${i}`) ?? null });
      });
    });
  }
  return out;
}

function ringArea(r: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

export function registerResources(server: McpServer, state: ServerState): void {
  server.registerResource('projects', new ResourceTemplate('thermo2d://projects/{name}', {
    list: async () => ({ resources: (await state.workspace.list('', ['.thermo.json'])).map((f) => ({ uri: `thermo2d://projects/${encodeURIComponent(f.replace(/\.thermo\.json$/i, ''))}`, name: f, mimeType: 'application/json' })) }),
  }), { title: 'Project files', description: 'Projects (.thermo.json) in the workspace' }, async (uri, vars) => {
    const name = decodeURIComponent(String(vars.name));
    const text = await state.workspace.readText(state.workspace.relative(state.workspace.projectPath(name)));
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
  });
  server.registerResource('library', new ResourceTemplate('thermo2d://library/{id}', {
    list: async () => ({ resources: state.library.map((i) => ({ uri: `thermo2d://library/${encodeURIComponent(i.id)}`, name: `${i.name} (${i.category})`, mimeType: 'application/json' })) }),
  }), { title: 'Library items', description: 'Built-in and user materials, fire curves and climate series' }, async (uri, vars) => {
    const item = api.getLibraryItem(decodeURIComponent(String(vars.id)), state.library);
    if (!item) throw new WorkspaceError(`No library item "${String(vars.id)}".`, 'not-found');
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(item, null, 2) }] };
  });
  for (const [kind, sub, mime] of [['figures', 'figures', 'image/svg+xml'], ['reports', 'reports', 'text/html']] as const) {
    server.registerResource(kind, new ResourceTemplate(`thermo2d://${kind}/{file}`, {
      list: async () => ({ resources: (await state.workspace.list(sub, ['.svg', '.png', '.html'])).map((f) => ({ uri: `thermo2d://${kind}/${encodeURIComponent(f.split('/').pop()!)}`, name: f.split('/').pop()!, mimeType: f.endsWith('.png') ? 'image/png' : f.endsWith('.html') ? 'text/html' : mime })) }),
    }), { title: kind, description: `Generated ${kind} in the workspace` }, async (uri, vars) => {
      const file = `${sub}/${decodeURIComponent(String(vars.file))}`;
      if (file.endsWith('.png')) return { contents: [{ uri: uri.href, mimeType: 'image/png', blob: Buffer.from(await state.workspace.readBytes(file)).toString('base64') }] };
      return { contents: [{ uri: uri.href, mimeType: file.endsWith('.html') ? 'text/html' : 'image/svg+xml', text: await state.workspace.readText(file) }] };
    });
  }
}

export function registerPrompts(server: McpServer): void {
  const user = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });
  server.registerPrompt('fire-check-rc-section', { title: 'Fire check of an RC section', description: 'Build a beam/column, reinforce it, expose it to a standard fire and report rebar temperatures and k_s.', argsSchema: { width: z.string().describe('mm'), height: z.string().describe('mm'), bars: z.string().describe('e.g. "4 Ø20 bottom, cover 35"'), fire: z.string().describe('ISO 834 | hydrocarbon | external | parametric'), minutes: z.string(), exposure: z.string().describe('e.g. "three sides" or "all sides"') } }, (a) =>
    user(`Use thermo2d. Call describe_capabilities first. Create a project, then create_from_template rect-beam with b=${a.width}, h=${a.height} and a normal-weight siliceous concrete from the library (moisture 1.5 %, lower conductivity limit). Add reinforcement: ${a.bars} (reinforcing steel from the library, hot-rolled class for k_s). Apply exposure "${a.fire}" for ${a.minutes} minutes on ${a.exposure} (αc = 25, εm = 0.7, εf = 1) and ambient (αc = 4, 20 °C) on the unexposed faces. Add probes at every bar (probe.addForRebars), validate, run_analysis, then query_results rebar_table at 30/60/90 min and the 500 °C isotherm, make_figure time-series and field, and explain_results. Finish with save_project.`));
  server.registerPrompt('wall-thermal-bridge-check', { title: 'Wall temperature and thermal bridge check', description: 'Layered wall or junction: U-value, ψ-value, inner surface temperature and f_Rsi.', argsSchema: { layers: z.string().describe('e.g. "13 gypsum | 198 mineral wool | 100 concrete"'), indoor: z.string().describe('°C'), outdoor: z.string().describe('°C') } }, (a) =>
    user(`Use thermo2d. Create a project and a layered-wall template with layers ${a.layers} (library materials, EN ISO 10456). Assign indoor convection with Rsi = 0.13 at ${a.indoor} °C on the inside face and outdoor with Rse = 0.04 at ${a.outdoor} °C on the outside face (exposure.apply with kinds indoor/outdoor); other edges insulated. Set the analysis mode to steady. Add metrics u-value, min-surface-temperature and f-rsi on the inside edges (and psi-value if this is a junction with the 1D U-values and lengths). Validate, run, query_results metrics, make_figure field, explain_results.`));
  server.registerPrompt('compare-insulation', { title: 'Compare insulation options', description: 'Same section with two insulation choices; overlay the inner surface temperature and metrics.', argsSchema: { projectName: z.string(), optionA: z.string().describe('e.g. "150 mm EPS"'), optionB: z.string().describe('e.g. "250 mm mineral wool"') } }, (a) =>
    user(`Use thermo2d. Open or build the project "${a.projectName}". Make the base model use ${a.optionA}. Use compare_scenarios with a scenario for ${a.optionB} (override the insulation region's material and/or its template thickness parameter) and report the inner surface temperature, U-value and f_Rsi side by side with the overlay figure, then explain the difference for a customer in plain words.`));
  server.registerPrompt('import-and-run-climate', { title: 'Import a climate series and run', description: 'Import outdoor temperatures (CSV/EPW) and run a transient or periodic climate analysis.', argsSchema: { file: z.string().describe('Path inside the workspace'), section: z.string().describe('Which section/template'), duration: z.string().describe('e.g. "one week" or "one year"') } }, (a) =>
    user(`Use thermo2d. Build ${a.section}. import_time_series from "${a.file}" as the outdoor air temperature (check the import report: units, step, gaps). Apply outdoor convection with that series and indoor 20 °C with Rsi 0.13. Set the analysis to transient over ${a.duration} with a time step equal to the series resolution (periodic mode if the series is one cycle). Add probes on the inner surface, run, and show the inner surface temperature over time, its minimum, and the condensation risk (f_Rsi).`));
}

export { resultKey };
