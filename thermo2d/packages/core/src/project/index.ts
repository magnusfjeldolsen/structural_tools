/**
 * Project-level orchestration: turn a Project (+ scenario) into mesh and solver
 * inputs, run it, and stamp the result. Used by the worker, the CLI and the MCP
 * server so all three do exactly the same thing.
 */
import type { Project } from '../model/types.js';
import { CORE_VERSION } from '../model/defaults.js';
import type { Mesh, MeshInput } from '../mesh/types.js';
import type { MaterialEvaluator, RunOptions, RunResult, SeriesEvaluator, SolveHeatSource, SolveInput, SolveProbe } from '../solver/types.js';
import { buildMeshInput, mesh as buildMesh } from '../mesh/index.js';
import { compileSeries, runToEnd } from '../solver/index.js';
import { compileMaterial } from '../library/index.js';
import { resolveScenario, validateProject } from '../commands/index.js';
import { CommandError } from '../commands/types.js';
import { projectHash } from '../io/index.js';

export interface PreparedRun {
  /** The project with the scenario applied. */
  resolved: Project;
  analysisId: string;
  scenarioId: string | null;
  meshInput: MeshInput;
  buildSolveInput(mesh: Mesh): SolveInput;
}

export function prepareRun(project: Project, analysisId?: string, scenarioId?: string | null): PreparedRun {
  const resolved = resolveScenario(project, scenarioId ?? null);
  const analysis = analysisId ? resolved.analyses.find((a) => a.id === analysisId) : resolved.analyses[0];
  if (!analysis) {
    throw new CommandError('not-found', `Analysis "${analysisId}" does not exist.`, { field: 'analysisId', options: resolved.analyses.map((a) => `${a.id} (${a.name})`) });
  }
  const errors = validateProject(resolved).filter((i) => i.severity === 'error');
  if (errors.length) {
    throw new CommandError('invalid-model', `The model cannot run: ${errors[0].message}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`, { suggestion: errors[0].suggestion ?? 'Call validate for the full list.' });
  }
  const meshInput = buildMeshInput(resolved);
  const ambient = resolved.settings.ambientTemperature;

  const buildSolveInput = (mesh: Mesh): SolveInput => {
    const materials: Record<string, MaterialEvaluator> = {};
    for (const r of mesh.regions) {
      if (!r.materialId) throw new CommandError('no-material', `Region "${r.id}" has no material.`);
      if (materials[r.id]) continue;
      const m = resolved.materials.find((x) => x.id === r.materialId);
      if (!m) throw new CommandError('missing-material', `Region "${r.id}" uses material "${r.materialId}", which is not in the project.`);
      materials[r.id] = compileMaterial(m);
    }
    const series: Record<string, SeriesEvaluator> = {};
    for (const s of resolved.timeSeries) series[s.id] = compileSeries(s, ambient);
    const heatSources: SolveHeatSource[] = resolved.heatSources.map((h) => ({ regionId: h.regionId, q: h.seriesId ? series[h.seriesId] : (h.q ?? 0) }));
    const probes: SolveProbe[] = resolved.probes.filter((p) => p.enabled !== false).map((p) => ({ id: p.id, position: p.position }));
    return { mesh, materials, boundaryConditions: resolved.boundaryConditions, series, heatSources, analysis, probes, ambientTemperature: ambient };
  };

  return { resolved, analysisId: analysis.id, scenarioId: scenarioId ?? null, meshInput, buildSolveInput };
}

export interface RunProjectOptions extends RunOptions {
  analysisId?: string;
  scenarioId?: string | null;
  /** Reuse an existing mesh (e.g. from a preview) instead of meshing again. */
  mesh?: Mesh;
}

/** Mesh + solve synchronously. The worker uses prepareRun/createRun instead so it can stream progress. */
export function runProject(project: Project, opts: RunProjectOptions = {}): RunResult {
  const prepared = prepareRun(project, opts.analysisId, opts.scenarioId);
  const mesh = opts.mesh ?? buildMesh(prepared.meshInput);
  const input = prepared.buildSolveInput(mesh);
  const result = runToEnd(input, { onProgress: opts.onProgress, onSnapshot: opts.onSnapshot, shouldCancel: opts.shouldCancel });
  return stampResult(result, project, prepared);
}

export function stampResult(result: RunResult, project: Project, prepared: Pick<PreparedRun, 'analysisId' | 'scenarioId'>): RunResult {
  return {
    ...result,
    analysisId: prepared.analysisId,
    scenarioId: prepared.scenarioId,
    stamp: { projectHash: projectHash(project), coreVersion: CORE_VERSION, createdAt: new Date().toISOString() },
  };
}

/** Run the base model and every listed scenario (or all scenarios). */
export function runScenarios(project: Project, opts: { analysisId?: string; scenarioIds?: string[]; includeBase?: boolean } & RunOptions = {}): { label: string; scenarioId: string | null; result: RunResult }[] {
  const ids = opts.scenarioIds ?? project.scenarios.map((s) => s.id);
  const out: { label: string; scenarioId: string | null; result: RunResult }[] = [];
  if (opts.includeBase !== false) out.push({ label: project.name, scenarioId: null, result: runProject(project, { ...opts, scenarioId: null }) });
  for (const id of ids) {
    const s = project.scenarios.find((x) => x.id === id);
    out.push({ label: s?.name ?? id, scenarioId: id, result: runProject(project, { ...opts, scenarioId: id }) });
  }
  return out;
}
