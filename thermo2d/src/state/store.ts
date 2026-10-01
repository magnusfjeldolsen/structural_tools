/**
 * Application state (zustand). The Project document is the single source of
 * truth; every model mutation goes through `dispatch(commands)`, which is the
 * same command layer the MCP server uses. Undo/redo is a history of documents.
 */
import { create } from 'zustand';
import {
  applyCommands,
  createEmptyProject,
  mesh as buildMesh,
  prepareRun,
  projectHash,
  runProject,
  validateProject,
  CORE_VERSION,
} from '@thermo2d/core';
import type { Command, CommandResult, EdgeRef, Issue, Mesh, Project, RunProgress, RunResult, Vec2 } from '@thermo2d/core';
import type { Lang } from '../i18n/index.js';
import { SolverClient, isCancelledError } from '../worker/client.js';
import { resultKey } from '../worker/protocol.js';
import { DEFAULT_SNAP, type SnapOptions } from '../editor/snapping.js';
import { clearAutosave, openProjectFile, readAutosave, saveProjectFile, writeAutosave, type FSFileHandle } from './persistence.js';

export type Tool = 'select' | 'pan' | 'rect' | 'circle' | 'polygon' | 'void' | 'split' | 'probe' | 'lineProbe' | 'edge';
export type Panel = 'model' | 'materials' | 'exposure' | 'series' | 'rebar' | 'probes' | 'analysis' | 'scenarios';
export type SelectableCollection = 'regions' | 'rebars' | 'rebarSets' | 'boundaryConditions' | 'probes' | 'lineProbes';

export interface Selection {
  collection: SelectableCollection;
  id: string;
}

export interface UiState {
  lang: Lang;
  mode: 'model' | 'results';
  tool: Tool;
  panel: Panel;
  selection: Selection[];
  /** Selected vertex (region id, ring, index) for the properties panel. */
  vertexSelection: { regionId: string; ring: number; index: number } | null;
  edgeSelection: EdgeRef[];
  /** Boundary condition being painted onto edges by clicking (null = off). */
  paintBcId: string | null;
  snap: SnapOptions;
  showMesh: boolean;
  meshPreviewOn: boolean;
  activeAnalysisId: string;
  activeScenarioId: string | null;
  /** Result keys chosen for comparison in results mode. */
  compareKeys: string[];
  hover: Selection | null;
  /** Transient dialog state. */
  dialog: null | { kind: 'library'; forRegionIds?: string[] } | { kind: 'importSeries' } | { kind: 'transform'; op: 'move' | 'rotate' | 'mirror' | 'scale' | 'copy' | 'offset' | 'boolean' | 'polar' } | { kind: 'importGeometry' } | { kind: 'restore' };
}

export interface RunningState {
  jobId: string;
  key: string;
  progress: RunProgress;
  /** 'mesh-check' runs are silent comparisons. */
  purpose: 'run' | 'mesh-check';
}

export interface AppState {
  project: Project;
  past: Project[];
  future: Project[];
  dirty: boolean;
  fileHandle: FSFileHandle | null;
  results: Record<string, RunResult>;
  resultsStale: boolean;
  running: RunningState | null;
  meshPreview: Mesh | null;
  meshPreviewError: string | null;
  messages: Issue[];
  ui: UiState;
  showStart: boolean;

  dispatch(commands: Command[]): CommandResult | null;
  undo(): void;
  redo(): void;
  loadProject(project: Project, opts?: { resetHistory?: boolean; handle?: FSFileHandle | null; dirty?: boolean }): void;
  newProject(name?: string): void;
  openProject(): Promise<void>;
  saveProject(as?: boolean): Promise<void>;
  run(analysisId?: string, scenarioId?: string | null): Promise<RunResult | null>;
  runAllScenarios(): Promise<void>;
  cancelRun(): void;
  refreshMeshPreview(): Promise<void>;
  checkMesh(): Promise<void>;
  setUi(patch: Partial<UiState>): void;
  setTool(tool: Tool): void;
  setLang(lang: Lang): void;
  setMode(mode: 'model' | 'results'): void;
  select(items: Selection[], additive?: boolean): void;
  clearSelection(): void;
  selectEdges(edges: EdgeRef[], additive?: boolean): void;
  pushMessage(issue: Issue): void;
  clearRuntimeMessages(): void;
  activeResult(): RunResult | null;
}

const HISTORY_LIMIT = 200;
const hasWorker = typeof Worker !== 'undefined';
let client: SolverClient | null = null;
function getClient(): SolverClient {
  if (!client) client = new SolverClient();
  return client;
}

function safeValidate(project: Project): Issue[] {
  try {
    return validateProject(project);
  } catch (e) {
    return [{ severity: 'warning', code: 'validate-failed', message: `Validation unavailable: ${(e as Error).message}` }];
  }
}

function runtimeIssue(severity: Issue['severity'], code: string, message: string, extra: Partial<Issue> = {}): Issue {
  return { severity, code: `runtime:${code}`, message, ...extra };
}

function initialUi(): UiState {
  const stored = (() => {
    try {
      return localStorage.getItem('thermo2d.lang') as Lang | null;
    } catch {
      return null;
    }
  })();
  return {
    lang: stored === 'en' ? 'en' : 'nb',
    mode: 'model',
    tool: 'select',
    panel: 'model',
    selection: [],
    vertexSelection: null,
    edgeSelection: [],
    paintBcId: null,
    snap: { ...DEFAULT_SNAP },
    showMesh: false,
    meshPreviewOn: false,
    activeAnalysisId: 'an_main',
    activeScenarioId: null,
    compareKeys: [],
    hover: null,
    dialog: null,
  };
}

export const useStore = create<AppState>()((set, get) => {
  const initial = createEmptyProject('Nytt prosjekt');
  return {
    project: initial,
    past: [],
    future: [],
    dirty: false,
    fileHandle: null,
    results: {},
    resultsStale: false,
    running: null,
    meshPreview: null,
    meshPreviewError: null,
    messages: [],
    ui: { ...initialUi(), activeAnalysisId: initial.analyses[0]?.id ?? 'an_main' },
    showStart: true,

    dispatch(commands) {
      const s = get();
      let res: CommandResult;
      try {
        res = applyCommands(s.project, commands);
      } catch (e) {
        const err = e as Error & { code?: string; detail?: { suggestion?: string; field?: string } };
        set({
          messages: [
            ...s.messages.filter((m) => m.code !== 'runtime:command'),
            runtimeIssue('error', 'command', err.message, { suggestion: err.detail?.suggestion }),
          ],
        });
        return null;
      }
      const past = [...s.past, s.project].slice(-HISTORY_LIMIT);
      const project = { ...res.project, meta: { ...res.project.meta, modified: new Date().toISOString() } };
      const geometryChanged = res.changes.some((c) => c.collection === 'regions' || c.collection === 'rebars' || c.collection === 'rebarSets' || c.collection === 'mesh' || c.collection === 'boundaryConditions');
      // prune selection of deleted entities
      const exists = (sel: Selection) => (project[sel.collection] as { id: string }[]).some((x) => x.id === sel.id);
      const selection = s.ui.selection.filter(exists);
      const edgeSelection = s.ui.edgeSelection.filter((e) => project.regions.some((r) => r.id === e.regionId));
      const paintBcId = s.ui.paintBcId && project.boundaryConditions.some((b) => b.id === s.ui.paintBcId) ? s.ui.paintBcId : null;
      set({
        project,
        past,
        future: [],
        dirty: true,
        resultsStale: Object.keys(s.results).length > 0 ? true : s.resultsStale,
        messages: [...safeValidate(project), ...res.warnings, ...s.messages.filter((m) => m.code.startsWith('runtime:') && m.code !== 'runtime:command')],
        ui: { ...s.ui, selection, edgeSelection, paintBcId, vertexSelection: selection.length ? s.ui.vertexSelection : null },
        meshPreview: geometryChanged ? null : s.meshPreview,
      });
      if (geometryChanged && s.ui.meshPreviewOn) scheduleMeshPreview();
      return res;
    },

    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future].slice(0, HISTORY_LIMIT), dirty: true, resultsStale: Object.keys(s.results).length > 0, messages: safeValidate(prev), meshPreview: null });
      if (s.ui.meshPreviewOn) scheduleMeshPreview();
    },

    redo() {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({ project: next, past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: s.future.slice(1), dirty: true, resultsStale: Object.keys(s.results).length > 0, messages: safeValidate(next), meshPreview: null });
      if (s.ui.meshPreviewOn) scheduleMeshPreview();
    },

    loadProject(project, opts = {}) {
      const s = get();
      set({
        project,
        past: opts.resetHistory === false ? s.past : [],
        future: [],
        dirty: opts.dirty ?? false,
        fileHandle: opts.handle === undefined ? s.fileHandle : opts.handle,
        results: {},
        resultsStale: false,
        meshPreview: null,
        meshPreviewError: null,
        messages: safeValidate(project),
        showStart: false,
        ui: {
          ...s.ui,
          selection: [],
          edgeSelection: [],
          vertexSelection: null,
          mode: 'model',
          activeAnalysisId: project.analyses[0]?.id ?? s.ui.activeAnalysisId,
          activeScenarioId: null,
          compareKeys: [],
          dialog: null,
        },
      });
    },

    newProject(name) {
      const p = createEmptyProject(name ?? (get().ui.lang === 'nb' ? 'Nytt prosjekt' : 'New project'));
      get().loadProject(p, { handle: null });
      clearAutosave();
    },

    async openProject() {
      try {
        const r = await openProjectFile();
        if (r) get().loadProject(r.project, { handle: r.handle });
      } catch (e) {
        get().pushMessage(runtimeIssue('error', 'open', (e as Error).message));
      }
    },

    async saveProject(as = false) {
      const s = get();
      try {
        const handle = await saveProjectFile(s.project, s.fileHandle, as);
        set({ fileHandle: handle, dirty: false });
      } catch (e) {
        get().pushMessage(runtimeIssue('error', 'save', (e as Error).message));
      }
    },

    async run(analysisId, scenarioId) {
      const s = get();
      if (s.running) return null;
      const aid = analysisId ?? s.ui.activeAnalysisId;
      const sid = scenarioId === undefined ? s.ui.activeScenarioId : scenarioId;
      const key = resultKey(aid, sid);
      const errors = s.messages.filter((m) => m.severity === 'error' && !m.code.startsWith('runtime:'));
      if (errors.length) {
        get().pushMessage(runtimeIssue('error', 'run-blocked', 'blocked'));
        return null;
      }
      get().clearRuntimeMessages();
      const project = s.project;
      try {
        let result: RunResult;
        if (hasWorker) {
          const job = getClient().run(project, aid, sid, {
            onProgress: (p) => {
              const r = get().running;
              if (r && r.jobId === job.jobId) set({ running: { ...r, progress: { ...r.progress, ...p } } });
            },
          });
          set({ running: { jobId: job.jobId, key, progress: { t: 0, fraction: 0, step: 0 }, purpose: 'run' } });
          result = await job.promise;
        } else {
          set({ running: { jobId: 'sync', key, progress: { t: 0, fraction: 0, step: 0 }, purpose: 'run' } });
          result = runProject(project, { analysisId: aid, scenarioId: sid });
          result.stamp ??= { projectHash: projectHash(project), coreVersion: CORE_VERSION, createdAt: new Date().toISOString() };
        }
        const st = get();
        set({
          results: { ...st.results, [key]: result },
          resultsStale: st.project !== project,
          running: null,
          ui: { ...st.ui, mode: 'results', activeAnalysisId: aid, activeScenarioId: sid },
          messages: [...st.messages, ...result.warnings.map((w) => runtimeIssue('warning', 'solver', w))],
        });
        return result;
      } catch (e) {
        set({ running: null });
        if (!isCancelledError(e)) get().pushMessage(runtimeIssue('error', 'run', (e as Error).message, { suggestion: (e as { detail?: { hint?: string } }).detail?.hint }));
        return null;
      }
    },

    async runAllScenarios() {
      const s = get();
      const aid = s.ui.activeAnalysisId;
      await get().run(aid, null);
      for (const sc of s.project.scenarios) await get().run(aid, sc.id);
      const keys = [resultKey(aid, null), ...s.project.scenarios.map((sc) => resultKey(aid, sc.id))];
      set({ ui: { ...get().ui, compareKeys: keys, activeScenarioId: null } });
    },

    cancelRun() {
      const r = get().running;
      if (r && hasWorker) getClient().cancel(r.jobId);
    },

    async refreshMeshPreview() {
      const s = get();
      if (!s.project.regions.length) {
        set({ meshPreview: null, meshPreviewError: null });
        return;
      }
      try {
        let m: Mesh;
        if (hasWorker) m = await getClient().mesh(s.project, s.ui.activeAnalysisId, s.ui.activeScenarioId).promise;
        else m = buildMesh(prepareRun(s.project, s.ui.activeAnalysisId, s.ui.activeScenarioId).meshInput);
        if (get().project === s.project) set({ meshPreview: m, meshPreviewError: null });
      } catch (e) {
        set({ meshPreview: null, meshPreviewError: (e as Error).message });
      }
    },

    async checkMesh() {
      const s = get();
      const base = s.activeResult();
      if (!base || s.running) {
        get().pushMessage(runtimeIssue('info', 'mesh-check', 'needs-result'));
        return;
      }
      const sizes = { ...s.project.mesh };
      const fine: Project['mesh'] = {
        preset: 'custom',
        boundarySize: (sizes.boundarySize ?? presetSize(sizes.preset, 'boundarySize')) / 2,
        interiorSize: (sizes.interiorSize ?? presetSize(sizes.preset, 'interiorSize')) / 2,
        rebarSize: (sizes.rebarSize ?? presetSize(sizes.preset, 'rebarSize')) / 2,
        growth: sizes.growth,
        rebarSegments: sizes.rebarSegments,
        minAngle: sizes.minAngle,
        maxElements: (sizes.maxElements ?? 150000) * 4,
      };
      const project: Project = { ...s.project, mesh: fine };
      const aid = s.ui.activeAnalysisId;
      const sid = s.ui.activeScenarioId;
      try {
        let result: RunResult;
        if (hasWorker) {
          const job = getClient().run(project, aid, sid, {
            onProgress: (p) => {
              const r = get().running;
              if (r && r.jobId === job.jobId) set({ running: { ...r, progress: { ...r.progress, ...p } } });
            },
          });
          set({ running: { jobId: job.jobId, key: 'mesh-check', progress: { t: 0, fraction: 0, step: 0 }, purpose: 'mesh-check' } });
          result = await job.promise;
        } else {
          result = runProject(project, { analysisId: aid, scenarioId: sid });
        }
        let delta = 0;
        base.probes.forEach((p, i) => {
          const j = result.probes.findIndex((q) => q.id === p.id);
          if (j < 0 || !p.found || !result.probes[j].found) return;
          const a = base.probeValues[i];
          const b = result.probeValues[j];
          if (!a?.length || !b?.length) return;
          delta = Math.max(delta, Math.abs(a[a.length - 1] - b[b.length - 1]));
        });
        set({ running: null });
        get().pushMessage(runtimeIssue('info', 'mesh-check-result', delta.toFixed(1), { suggestion: delta <= 2 ? 'good' : 'bad' }));
      } catch (e) {
        set({ running: null });
        if (!isCancelledError(e)) get().pushMessage(runtimeIssue('error', 'run', (e as Error).message));
      }
    },

    setUi(patch) {
      set({ ui: { ...get().ui, ...patch } });
    },
    setTool(tool) {
      set({ ui: { ...get().ui, tool } });
    },
    setLang(lang) {
      try {
        localStorage.setItem('thermo2d.lang', lang);
      } catch {
        /* ignore */
      }
      set({ ui: { ...get().ui, lang } });
    },
    setMode(mode) {
      set({ ui: { ...get().ui, mode } });
    },
    select(items, additive = false) {
      const ui = get().ui;
      let selection: Selection[];
      if (additive) {
        selection = [...ui.selection];
        for (const it of items) {
          const idx = selection.findIndex((s) => s.collection === it.collection && s.id === it.id);
          if (idx >= 0) selection.splice(idx, 1);
          else selection.push(it);
        }
      } else selection = items;
      set({ ui: { ...ui, selection, vertexSelection: null } });
    },
    clearSelection() {
      set({ ui: { ...get().ui, selection: [], vertexSelection: null, edgeSelection: [] } });
    },
    selectEdges(edges, additive = false) {
      const ui = get().ui;
      const same = (a: EdgeRef, b: EdgeRef) => a.regionId === b.regionId && a.ring === b.ring && a.edgeIndex === b.edgeIndex;
      let edgeSelection: EdgeRef[];
      if (additive) {
        edgeSelection = [...ui.edgeSelection];
        for (const e of edges) {
          const i = edgeSelection.findIndex((x) => same(x, e));
          if (i >= 0) edgeSelection.splice(i, 1);
          else edgeSelection.push(e);
        }
      } else edgeSelection = edges;
      set({ ui: { ...ui, edgeSelection } });
    },
    pushMessage(issue) {
      set({ messages: [...get().messages.filter((m) => m.code !== issue.code), issue] });
    },
    clearRuntimeMessages() {
      set({ messages: get().messages.filter((m) => !m.code.startsWith('runtime:')) });
    },
    activeResult() {
      const s = get();
      return s.results[resultKey(s.ui.activeAnalysisId, s.ui.activeScenarioId)] ?? null;
    },
  };
});

function presetSize(preset: Project['mesh']['preset'], key: 'boundarySize' | 'interiorSize' | 'rebarSize'): number {
  const table = {
    coarse: { boundarySize: 6, interiorSize: 25, rebarSize: 4 },
    normal: { boundarySize: 3, interiorSize: 12, rebarSize: 2.5 },
    fine: { boundarySize: 1.5, interiorSize: 6, rebarSize: 1.5 },
  } as const;
  return table[preset === 'custom' ? 'normal' : preset][key];
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleMeshPreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    void useStore.getState().refreshMeshPreview();
  }, 400);
}

// Autosave (debounced) whenever the project changes.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project || s.showStart) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => writeAutosave(s.project), 800);
});

/** Called once at startup: offer to restore an autosave. */
export function hasAutosave(): boolean {
  return readAutosave() !== null;
}

// Convenience selectors ------------------------------------------------------

export const selectProject = (s: AppState): Project => s.project;
export const selectUi = (s: AppState): UiState => s.ui;
export const selectLang = (s: AppState): Lang => s.ui.lang;

export function isSelected(ui: UiState, collection: SelectableCollection, id: string): boolean {
  return ui.selection.some((s) => s.collection === collection && s.id === id);
}

export function selectedIds(ui: UiState, collection: SelectableCollection): string[] {
  return ui.selection.filter((s) => s.collection === collection).map((s) => s.id);
}

export function probePositionsOf(result: RunResult): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  for (const p of result.probes) out[p.id] = p.position;
  return out;
}
