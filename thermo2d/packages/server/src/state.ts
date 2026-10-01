/**
 * In-memory server state: open projects, results and run jobs, on top of a
 * Workspace. Runs are time-sliced on the event loop (step chunks + setImmediate)
 * so the stdio server stays responsive and jobs can be cancelled.
 */
import path from 'node:path';
import type { LibraryItem, Project, RunProgress, RunResult, Run, Mesh } from '@thermo2d/core';
import { Workspace, WorkspaceError } from './workspace.js';
import * as api from './coreApi.js';

export interface ProjectEntry {
  project: Project;
  /** File base name without `.thermo.json` (also used for results naming). */
  name: string;
  path?: string;
  dirty: boolean;
}

export type JobStatus = 'queued' | 'meshing' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  projectId: string;
  analysisId: string;
  scenarioId: string | null;
  status: JobStatus;
  progress: RunProgress;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  result?: RunResult;
  mesh?: Mesh;
  run?: Run;
  cancelRequested: boolean;
  /** Probe positions for partial readouts while running. */
  probes: { id: string; position: [number, number] }[];
  promise: Promise<RunResult>;
}

export function resultKey(projectId: string, analysisId: string, scenarioId?: string | null): string {
  return `${projectId}|${analysisId}|${scenarioId ?? ''}`;
}

let jobCounter = 0;

export class ServerState {
  readonly projects = new Map<string, ProjectEntry>();
  readonly results = new Map<string, RunResult>();
  readonly jobs = new Map<string, Job>();
  library: LibraryItem[] = api.BUILTIN_LIBRARY;
  libraryHash = '';
  /** Names of user library files that failed to parse (reported by describe_capabilities). */
  libraryWarnings: string[] = [];

  constructor(readonly workspace: Workspace) {}

  /** Merge `<workspace>/library/*.json|*.csv` into the built-in library. */
  async loadUserLibrary(): Promise<void> {
    const files = await this.workspace.list('library', ['.json', '.csv']);
    const user: LibraryItem[][] = [];
    this.libraryWarnings = [];
    for (const f of files) {
      try {
        user.push(api.parseLibraryFile(await this.workspace.readText(f), path.basename(f)));
      } catch (e) {
        this.libraryWarnings.push(`${f}: ${(e as Error).message}`);
      }
    }
    try {
      this.library = user.length ? api.mergeLibraries(api.BUILTIN_LIBRARY, user) : api.BUILTIN_LIBRARY;
    } catch (e) {
      this.libraryWarnings.push(`merge failed: ${(e as Error).message}`);
      this.library = api.BUILTIN_LIBRARY;
    }
    try {
      api.setActiveLibrary(this.library);
    } catch {
      // older core without an active-library switch
    }
    this.libraryHash = fnv1a(JSON.stringify(this.library.map((i) => [i.id, i.hash ?? ''])));
  }

  getProject(projectId: string): ProjectEntry {
    const e = this.projects.get(projectId);
    if (e) return e;
    const known = [...this.projects.values()].map((p) => `${p.project.id} (${p.project.name})`);
    throw new WorkspaceError(
      `No open project with id "${projectId}". ${known.length ? `Open projects: ${known.join(', ')}.` : 'Use create_project or open_project first.'}`,
      'unknown-project',
    );
  }

  setProject(entry: ProjectEntry): void {
    this.projects.set(entry.project.id, entry);
  }

  /** Replace a project after a command batch; results of that project become stale (kept, flagged by hash). */
  updateProject(projectId: string, project: Project): ProjectEntry {
    const e = this.getProject(projectId);
    e.project = project;
    e.dirty = true;
    return e;
  }

  createProject(name: string, language?: 'nb' | 'en'): ProjectEntry {
    const project = api.createEmptyProject(name);
    if (language) project.settings.language = language;
    const entry: ProjectEntry = { project, name: safeName(name), dirty: true };
    this.setProject(entry);
    return entry;
  }

  async openProject(nameOrPath: string): Promise<ProjectEntry> {
    const abs = this.workspace.projectPath(nameOrPath);
    const text = await this.workspace.readText(this.workspace.relative(abs));
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new WorkspaceError(`"${nameOrPath}" is not valid JSON: ${(e as Error).message}`, 'bad-json');
    }
    const project = api.parseProject(json);
    const entry: ProjectEntry = { project, name: path.basename(abs).replace(/\.thermo\.json$/i, ''), path: abs, dirty: false };
    this.setProject(entry);
    // Load cached results next to it if they exist.
    for (const an of project.analyses) {
      const rp = this.workspace.resultsPath(entry.name, an.id, null);
      if (this.workspace.exists(this.workspace.relative(rp))) {
        try {
          const r = api.decodeResults(await this.workspace.readBytes(this.workspace.relative(rp)));
          this.results.set(resultKey(project.id, an.id, null), r);
        } catch {
          // ignore unreadable cache
        }
      }
    }
    return entry;
  }

  async saveProject(projectId: string, name?: string): Promise<string> {
    const e = this.getProject(projectId);
    if (name) e.name = safeName(name);
    const abs = this.workspace.projectPath(e.name);
    e.project.meta.modified = new Date().toISOString();
    await this.workspace.writeText(this.workspace.relative(abs), api.serializeProject(e.project));
    e.path = abs;
    e.dirty = false;
    return abs;
  }

  async saveResult(entry: ProjectEntry, result: RunResult): Promise<string | null> {
    try {
      const rp = this.workspace.resultsPath(entry.name, result.analysisId, result.scenarioId);
      await this.workspace.writeBytes(this.workspace.relative(rp), api.encodeResults(result));
      return rp;
    } catch {
      return null;
    }
  }

  /** Result for (project, analysis, scenario); analysis defaults to the first one. */
  getResult(projectId: string, analysisId?: string | null, scenarioId?: string | null): { result: RunResult; analysisId: string; stale: boolean } {
    const e = this.getProject(projectId);
    const an = analysisId ?? e.project.analyses[0]?.id;
    if (!an) throw new WorkspaceError('The project has no analysis. Add one with analysis.add.', 'no-analysis');
    const r = this.results.get(resultKey(projectId, an, scenarioId));
    if (!r) {
      const have = [...this.results.keys()].filter((k) => k.startsWith(projectId + '|'));
      throw new WorkspaceError(
        `No results for analysis "${an}"${scenarioId ? ` and scenario "${scenarioId}"` : ''} of project "${e.project.name}". Run run_analysis first${have.length ? ` (results exist for: ${have.map((k) => k.split('|').slice(1).join('/')).join(', ')})` : ''}.`,
        'no-results',
      );
    }
    let stale = false;
    try {
      stale = !!r.stamp && r.stamp.projectHash !== api.projectHash(e.project);
    } catch {
      stale = false;
    }
    return { result: r, analysisId: an, stale };
  }

  resolveAnalysisId(project: Project, analysisId?: string | null): string {
    if (analysisId) {
      if (!project.analyses.some((a) => a.id === analysisId)) {
        throw new WorkspaceError(`Unknown analysis "${analysisId}". Available: ${project.analyses.map((a) => `${a.id} (${a.name})`).join(', ') || 'none'}.`, 'unknown-analysis');
      }
      return analysisId;
    }
    const first = project.analyses[0];
    if (!first) throw new WorkspaceError('The project has no analysis. Add one with the analysis.add command.', 'no-analysis');
    return first.id;
  }

  /** Start a run as a job. Time-sliced; `await job.promise` to wait. */
  startRun(projectId: string, analysisId?: string | null, scenarioId?: string | null): Job {
    const entry = this.getProject(projectId);
    const an = this.resolveAnalysisId(entry.project, analysisId);
    if (scenarioId && !entry.project.scenarios.some((s) => s.id === scenarioId)) {
      throw new WorkspaceError(`Unknown scenario "${scenarioId}". Available: ${entry.project.scenarios.map((s) => `${s.id} (${s.name})`).join(', ') || 'none'}.`, 'unknown-scenario');
    }
    const id = `job_${Date.now().toString(36)}_${(++jobCounter).toString(36)}`;
    const job: Job = {
      id,
      projectId,
      analysisId: an,
      scenarioId: scenarioId ?? null,
      status: 'queued',
      progress: { t: 0, fraction: 0, step: 0 },
      startedAt: Date.now(),
      cancelRequested: false,
      probes: [],
      promise: Promise.resolve(undefined as unknown as RunResult),
    };
    job.promise = this.executeJob(job, entry);
    job.promise.catch(() => undefined);
    this.jobs.set(id, job);
    return job;
  }

  private async executeJob(job: Job, entry: ProjectEntry): Promise<RunResult> {
    try {
      const project = entry.project;
      const hash = api.projectHash(project);
      job.status = 'meshing';
      await yieldLoop();
      const prep = api.prepareRun(project, job.analysisId, job.scenarioId);
      const mesh = api.mesh(prep.meshInput);
      job.mesh = mesh;
      if (job.cancelRequested) throw new JobCancelled();
      const input = prep.buildSolveInput(mesh);
      job.probes = input.probes.map((p) => ({ id: p.id, position: p.position }));
      const run = api.createRun(input);
      job.run = run;
      job.status = 'running';
      let last = Date.now();
      while (!run.done) {
        run.step();
        job.progress = run.progress;
        if (Date.now() - last > 40) {
          await yieldLoop();
          last = Date.now();
          if (job.cancelRequested) throw new JobCancelled();
        }
      }
      const result = run.result();
      result.stamp = { projectHash: hash, coreVersion: api.CORE_VERSION, createdAt: new Date().toISOString() };
      result.warnings = [...result.warnings, ...(this.libraryHash ? [] : [])];
      this.results.set(resultKey(job.projectId, job.analysisId, job.scenarioId), result);
      job.result = result;
      job.status = 'done';
      job.finishedAt = Date.now();
      job.progress = { ...job.progress, fraction: 1 };
      await this.saveResult(entry, result);
      return result;
    } catch (e) {
      job.finishedAt = Date.now();
      if (e instanceof JobCancelled) {
        job.status = 'cancelled';
        if (job.run) {
          try {
            job.result = job.run.result();
          } catch {
            // partial result unavailable
          }
        }
        throw new WorkspaceError('The run was cancelled.', 'cancelled');
      }
      job.status = 'failed';
      job.error = (e as Error).message;
      throw e;
    }
  }

  getJob(jobId: string): Job {
    const j = this.jobs.get(jobId);
    if (!j) throw new WorkspaceError(`Unknown job "${jobId}". Known jobs: ${[...this.jobs.keys()].slice(-5).join(', ') || 'none'}.`, 'unknown-job');
    return j;
  }

  /** Partial probe readout from the running field. */
  partialProbes(job: Job): { id: string; value: number | null }[] {
    if (!job.run || !job.mesh) return [];
    const theta = job.run.theta;
    return job.probes.map((p) => {
      try {
        return { id: p.id, value: api.interpolateField(job.mesh!, theta, p.position) };
      } catch {
        return { id: p.id, value: null };
      }
    });
  }
}

class JobCancelled extends Error {}

function yieldLoop(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

export function safeName(name: string): string {
  const s = name.trim().replace(/\.thermo\.json$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim();
  return s || 'project';
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
