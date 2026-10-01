/**
 * In-page agent API: `window.thermo2d`. Always on. Uses the same command layer
 * and store actions as the buttons, so an agent (Claude in Chrome or any other)
 * can build, run and read a model while the user watches it happen. Tools are
 * described in MCP shape so the same contract can be served by an MCP server
 * later without change.
 */
import {
  CORE_VERSION,
  CommandError,
  TEMPLATES,
  compileSeries,
  describeCommands,
  evaluateMetrics,
  fieldAtTime,
  getActiveLibrary,
  interpolateField,
  rebarTable,
  searchLibrary,
  timeToThreshold,
  validateProject,
  type Command,
  type Project,
  type RunResult,
} from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { resultKey } from '../worker/protocol.js';
import { agentActivity } from './activity.js';
import { AGENT_HELP_EN, AGENT_HELP_NB } from '../help/strings.js';

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentApi {
  name: 'thermo2d';
  version: string;
  describe(): { name: string; version: string; tools: AgentTool[]; help: string };
  help(lang?: 'nb' | 'en'): string;
  call(name: string, input?: unknown): Promise<unknown>;
  tools: Record<string, (input?: unknown) => Promise<unknown>>;
}

type Json = Record<string, unknown>;

const obj = (properties: Json, required: string[] = [], description?: string): Json => ({ type: 'object', properties, required, additionalProperties: false, ...(description ? { description } : {}) });
const str = (description: string): Json => ({ type: 'string', description });
const num = (description: string): Json => ({ type: 'number', description });

const TOOLS: AgentTool[] = [
  { name: 'get_project', description: 'The current project document (regions, materials, boundary conditions, rebars, probes, analyses, scenarios).', inputSchema: obj({}) },
  { name: 'describe_commands', description: 'Catalogue of every editing command accepted by apply_commands, with fields and units.', inputSchema: obj({}) },
  { name: 'list_templates', description: 'Parametric section templates with their parameters and defaults.', inputSchema: obj({}) },
  {
    name: 'create_from_template',
    description: 'Create a section from a template (rect-beam {b,h}, t-beam, circle-column {d}, layered-wall, …). Adds concrete + ISO 834 + three-sided fire defaults unless withDefaults is false.',
    inputSchema: obj({ templateId: str('Template id from list_templates'), params: { type: 'object', description: 'Template parameters in mm', additionalProperties: true }, withDefaults: { type: 'boolean', description: 'Default true: add concrete, ISO 834 and fire on bottom/left/right, unexposed top' } }, ['templateId']),
  },
  {
    name: 'apply_commands',
    description: 'Atomic batch of editing commands (see describe_commands). Returns changes, created ids and warnings; a failing command rejects the whole batch with field, reason and valid options.',
    inputSchema: obj({ commands: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Command objects, each with a "type"' }, dry_run: { type: 'boolean', description: 'Validate only; do not change the project' } }, ['commands']),
  },
  { name: 'validate', description: 'Problems with the model in plain words (errors block a run, warnings do not).', inputSchema: obj({}) },
  { name: 'search_library', description: 'Find materials and curves by text, category or tag.', inputSchema: obj({ text: str('Free text, e.g. "concrete", "mineral wool", "ISO 834"'), category: { type: 'string', enum: ['material', 'fire-curve', 'climate-series'] } }) },
  {
    name: 'run_analysis',
    description: 'Run the active (or given) analysis in the app and wait for it. Returns a result summary; the field and probes are then available through query_results.',
    inputSchema: obj({ analysisId: str('Analysis id (default: active)'), scenarioId: str('Scenario id (default: base model)') }),
  },
  { name: 'get_result_summary', description: 'Summary of the current result: times, probes with final values, mesh and solver stats, warnings.', inputSchema: obj({}) },
  {
    name: 'query_results',
    description: 'Exact numbers from the current result. kind=point {x,y,time?}, probe {probeId?,time?}, rebar-table {times?}, extremes {time?}, time-to-threshold {probeId,threshold}, metrics {}.',
    inputSchema: obj({
      kind: { type: 'string', enum: ['point', 'probe', 'rebar-table', 'extremes', 'time-to-threshold', 'metrics'] },
      x: num('mm'),
      y: num('mm'),
      time: num('s (default: end of run)'),
      times: { type: 'array', items: { type: 'number' }, description: 's' },
      probeId: str('Probe id (default: all)'),
      threshold: num('°C'),
    }, ['kind']),
  },
];

export function installAgentApi(): AgentApi {
  const api = createAgentApi();
  (window as unknown as { thermo2d: AgentApi }).thermo2d = api;
  console.info('[thermo2d] agent API ready — call window.thermo2d.describe()');
  return api;
}

export function createAgentApi(): AgentApi {
  const tools: Record<string, (input?: unknown) => Promise<unknown>> = {
    get_project: async () => plain(useStore.getState().project),
    describe_commands: async () => describeCommands(),
    list_templates: async () => TEMPLATES.map((t) => ({ id: t.id, name: t.name, nameNb: t.nameNb, params: t.params })),
    create_from_template: async (input) => {
      const { templateId, params = {}, withDefaults = true } = (input ?? {}) as { templateId: string; params?: Record<string, number | string | boolean>; withDefaults?: boolean };
      if (!templateId) throw new CommandError('missing-field', 'templateId is required.', { field: 'templateId', options: TEMPLATES.map((t) => t.id) });
      const st = useStore.getState();
      st.newProject();
      const first = dispatchOrThrow([{ type: 'template.create', templateId, params }]);
      const regionIds = first.createdIds[0] ?? [];
      if (withDefaults && regionIds.length) {
        const concrete = searchLibrary({ text: 'concrete', category: 'material' }, getActiveLibrary()).find((i) => i.material?.category === 'concrete');
        const cmds: Command[] = [];
        if (concrete) cmds.push({ type: 'material.addFromLibrary', libraryId: concrete.id, id: 'mat_concrete' }, { type: 'region.setMaterial', ids: regionIds, materialId: 'mat_concrete' });
        cmds.push({ type: 'exposure.apply', regionIds, faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'fire-unexposed' }] });
        dispatchOrThrow(cmds);
      }
      useStore.setState({ showStart: false });
      return { regionIds, project: summary(useStore.getState().project) };
    },
    apply_commands: async (input) => {
      const { commands, dry_run } = (input ?? {}) as { commands?: Command[]; dry_run?: boolean };
      if (!Array.isArray(commands) || commands.length === 0) throw new CommandError('missing-field', 'commands must be a non-empty array.', { field: 'commands' });
      if (dry_run) {
        const { applyCommands } = await import('@thermo2d/core');
        const res = applyCommands(useStore.getState().project, commands);
        return { dryRun: true, changes: res.changes, createdIds: res.createdIds, warnings: res.warnings, issues: validateProject(res.project) };
      }
      const res = dispatchOrThrow(commands);
      return { changes: res.changes, createdIds: res.createdIds, warnings: res.warnings, issues: validateProject(useStore.getState().project) };
    },
    validate: async () => validateProject(useStore.getState().project),
    search_library: async (input) => {
      const { text, category } = (input ?? {}) as { text?: string; category?: 'material' | 'fire-curve' | 'climate-series' };
      return searchLibrary({ text, category }, getActiveLibrary())
        .slice(0, 40)
        .map((i) => ({ id: i.id, name: i.name, nameNb: i.nameNb, category: i.category, materialCategory: i.material?.category, quality: i.quality, source: i.source.text, tags: i.tags }));
    },
    run_analysis: async (input) => {
      const { analysisId, scenarioId } = (input ?? {}) as { analysisId?: string; scenarioId?: string | null };
      const st = useStore.getState();
      const errors = st.messages.filter((m) => m.severity === 'error' && !m.code.startsWith('runtime:'));
      if (errors.length) throw new CommandError('invalid-model', `The model cannot run: ${errors[0].message}`, { suggestion: errors[0].suggestion ?? 'Call validate for the full list.' });
      const result = await st.run(analysisId, scenarioId === undefined ? undefined : scenarioId);
      if (!result) {
        const msg = useStore.getState().messages.find((m) => m.code.startsWith('runtime:'));
        throw new CommandError('run-failed', msg?.message ?? 'The run did not produce a result.', { suggestion: msg?.suggestion });
      }
      return resultSummary(result, useStore.getState().project);
    },
    get_result_summary: async () => resultSummary(currentResult(), useStore.getState().project),
    query_results: async (input) => queryResults(currentResult(), useStore.getState().project, (input ?? {}) as QueryInput),
  };

  const wrapped: Record<string, (input?: unknown) => Promise<unknown>> = {};
  for (const [name, fn] of Object.entries(tools)) {
    wrapped[name] = async (input?: unknown) => {
      agentActivity.getState().record(name);
      try {
        return await fn(input);
      } catch (e) {
        throw toAgentError(e);
      }
    };
  }

  const api: AgentApi = {
    name: 'thermo2d',
    version: CORE_VERSION,
    describe: () => ({ name: 'thermo2d', version: CORE_VERSION, tools: TOOLS, help: AGENT_HELP_EN }),
    help: (lang) => (lang === 'nb' ? AGENT_HELP_NB : AGENT_HELP_EN),
    call: (name, input) => {
      const fn = wrapped[name];
      if (!fn) return Promise.reject(toAgentError(new CommandError('unknown-tool', `No tool "${name}".`, { field: 'name', options: Object.keys(wrapped) })));
      return fn(input);
    },
    tools: wrapped,
  };
  return api;
}

// ---------------------------------------------------------------------------

function dispatchOrThrow(commands: Command[]) {
  const st = useStore.getState();
  const before = st.messages;
  const res = st.dispatch(commands);
  if (!res) {
    const msg = useStore.getState().messages.find((m) => m.code === 'runtime:command');
    useStore.setState({ messages: before });
    throw new CommandError('command-failed', msg?.message ?? 'The command failed.', { suggestion: msg?.suggestion });
  }
  return res;
}

function currentResult(): RunResult {
  const st = useStore.getState();
  const r = st.results[resultKey(st.ui.activeAnalysisId, st.ui.activeScenarioId)] ?? Object.values(st.results)[0];
  if (!r) throw new CommandError('no-result', 'There is no result yet.', { suggestion: 'Call run_analysis first.' });
  return r;
}

export interface AgentError {
  error: true;
  code: string;
  message: string;
  field?: string;
  options?: unknown[];
  suggestion?: string;
}

export function toAgentError(e: unknown): AgentError {
  if (e instanceof CommandError) return { error: true, code: e.code, message: e.message, field: e.detail.field, options: e.detail.options, suggestion: e.detail.suggestion };
  const err = e as Error & { code?: string };
  return { error: true, code: err.code ?? 'error', message: err.message ?? String(e) };
}

function summary(p: Project) {
  return {
    id: p.id,
    name: p.name,
    regions: p.regions.map((r) => ({ id: r.id, name: r.name, materialId: r.materialId, vertices: r.polygon.outer.length, holes: r.polygon.holes.length })),
    materials: p.materials.map((m) => ({ id: m.id, name: m.name, category: m.category })),
    boundaryConditions: p.boundaryConditions.map((b) => ({ id: b.id, name: b.name, type: b.type, edges: b.edgeRefs.length })),
    rebars: p.rebars.length,
    probes: p.probes.map((q) => ({ id: q.id, name: q.name, position: q.position })),
    analyses: p.analyses.map((a) => ({ id: a.id, name: a.name, mode: a.mode, duration: a.duration, dt: a.dt })),
    scenarios: p.scenarios.map((s) => ({ id: s.id, name: s.name })),
  };
}

export function resultSummary(r: RunResult, p: Project) {
  const probes = r.probes.map((q, i) => {
    const v = r.probeValues[i];
    const name = p.probes.find((x) => x.id === q.id)?.name ?? q.id;
    return { id: q.id, name, position: q.position, found: q.found, final: v?.length ? round(v[v.length - 1]) : null };
  });
  return {
    analysisId: r.analysisId,
    scenarioId: r.scenarioId,
    mode: r.mode,
    times: r.times,
    probes,
    mesh: { nodes: r.mesh.stats.nodeCount, elements: r.mesh.stats.elementCount, minAngleDeg: round(r.mesh.stats.minAngleDeg) },
    stats: r.stats,
    energyImbalance: r.energy.relativeImbalance,
    warnings: r.warnings,
    stamp: r.stamp,
  };
}

export interface QueryInput {
  kind: 'point' | 'probe' | 'rebar-table' | 'extremes' | 'time-to-threshold' | 'metrics';
  x?: number;
  y?: number;
  time?: number;
  times?: number[];
  probeId?: string;
  threshold?: number;
}

export function queryResults(r: RunResult, p: Project, q: QueryInput): unknown {
  const tEnd = r.times[r.times.length - 1] ?? 0;
  const t = q.time ?? tEnd;
  switch (q.kind) {
    case 'point': {
      if (typeof q.x !== 'number' || typeof q.y !== 'number') throw new CommandError('missing-field', 'point needs x and y in mm.', { field: 'x' });
      const v = interpolateField(r.mesh, fieldAtTime(r, t), [q.x, q.y]);
      if (v == null) throw new CommandError('outside', `(${q.x}, ${q.y}) is outside the section.`);
      return { x: q.x, y: q.y, time: t, temperature: round(v) };
    }
    case 'probe': {
      const rows = r.probes
        .map((pr, i) => ({ pr, i }))
        .filter(({ pr }) => !q.probeId || pr.id === q.probeId)
        .map(({ pr, i }) => ({ id: pr.id, name: p.probes.find((x) => x.id === pr.id)?.name ?? pr.id, position: pr.position, temperature: round(sample(r.probeTimes, r.probeValues[i], t)) }));
      if (q.probeId && rows.length === 0) throw new CommandError('not-found', `No probe "${q.probeId}".`, { field: 'probeId', options: r.probes.map((x) => x.id) });
      return { time: t, probes: rows };
    }
    case 'rebar-table': {
      const times = q.times ?? [tEnd];
      return { times, rows: rebarTable(p, r, times).map((row) => ({ ...row, temps: row.temps.map(round), ks: row.ks.map((k) => (k == null ? null : Math.round(k * 1000) / 1000)) })) };
    }
    case 'extremes': {
      const f = fieldAtTime(r, t);
      let min = Infinity;
      let max = -Infinity;
      let imin = 0;
      let imax = 0;
      for (let i = 0; i < f.length; i++) {
        if (f[i] < min) {
          min = f[i];
          imin = i;
        }
        if (f[i] > max) {
          max = f[i];
          imax = i;
        }
      }
      return { time: t, min: { temperature: round(min), x: r.mesh.nodes[2 * imin], y: r.mesh.nodes[2 * imin + 1] }, max: { temperature: round(max), x: r.mesh.nodes[2 * imax], y: r.mesh.nodes[2 * imax + 1] } };
    }
    case 'time-to-threshold': {
      if (typeof q.threshold !== 'number') throw new CommandError('missing-field', 'time-to-threshold needs threshold in °C.', { field: 'threshold' });
      const rows = r.probes
        .map((pr, i) => ({ pr, i }))
        .filter(({ pr }) => !q.probeId || pr.id === q.probeId)
        .map(({ pr, i }) => ({ id: pr.id, name: p.probes.find((x) => x.id === pr.id)?.name ?? pr.id, seconds: timeToThreshold(r.probeTimes, r.probeValues[i], q.threshold!) }));
      return { threshold: q.threshold, probes: rows };
    }
    case 'metrics': {
      const series: Record<string, ReturnType<typeof compileSeries>> = {};
      for (const s of p.timeSeries) series[s.id] = compileSeries(s, p.settings.ambientTemperature);
      return evaluateMetrics(p, r, series);
    }
    default:
      throw new CommandError('bad-value', `Unknown kind "${String((q as { kind: unknown }).kind)}".`, { field: 'kind', options: ['point', 'probe', 'rebar-table', 'extremes', 'time-to-threshold', 'metrics'] });
  }
}

function sample(ts: ArrayLike<number>, vs: ArrayLike<number> | undefined, t: number): number {
  if (!vs || vs.length === 0) return NaN;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[ts.length - 1]) return vs[vs.length - 1];
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = ts[hi] === ts[lo] ? 0 : (t - ts[lo]) / (ts[hi] - ts[lo]);
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

function round(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : v;
}

/** JSON-safe deep copy (typed arrays → arrays). */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x))) as T;
}
