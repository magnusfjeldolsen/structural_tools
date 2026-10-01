/**
 * "Concrete temperature at bar centre" comparison. Owned by the results view:
 * a copy of the project with every bar taking its host region's material is run
 * in a dedicated solver worker, and the result is cached per project hash +
 * analysis + scenario. Nothing here touches the main store.
 */
import { create } from 'zustand';
import type { Project, RunResult } from '@thermo2d/core';
import { pointInPolygon, projectHash } from '@thermo2d/core';
import { SolverClient } from '../worker/client.js';

export interface CompareState {
  /** Cache key the current `result` belongs to. */
  key: string | null;
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  result: RunResult | null;
  /** The concrete-bar project the result was computed for (needed for rebarTable). */
  project: Project | null;
  error: string | null;
  jobId: string | null;
  start(project: Project, analysisId: string, scenarioId: string | null): void;
  cancel(): void;
}

let client: SolverClient | null = null;
function getClient(): SolverClient {
  if (!client) client = new SolverClient();
  return client;
}

export function compareKey(project: Project, analysisId: string, scenarioId: string | null): string {
  return `${projectHash(project)}|${analysisId}|${scenarioId ?? ''}`;
}

/** Every bar gets the material of the region its centre lies in (smallest containing region), else the first concrete material. */
export function concreteBarsProject(project: Project): Project {
  const fallback = project.materials.find((m) => m.category === 'concrete')?.id ?? null;
  const regionsByArea = project.regions
    .map((r) => ({ r, area: Math.abs(ringArea(r.polygon.outer)) }))
    .sort((a, b) => a.area - b.area)
    .map((x) => x.r);
  const rebars = project.rebars.map((b) => {
    const host = regionsByArea.find((r) => r.materialId && safeInside(r.polygon, b.centre));
    const materialId = host?.materialId ?? fallback ?? b.materialId;
    return materialId === b.materialId ? b : { ...b, materialId };
  });
  return { ...project, rebars };
}

/** True when every bar already uses a non-metal material (nothing to compare). */
export function barsAreConcrete(project: Project): boolean {
  if (project.rebars.length === 0) return true;
  const cats = new Map(project.materials.map((m) => [m.id, m.category]));
  return project.rebars.every((b) => cats.get(b.materialId) !== 'metal');
}

function safeInside(polygon: Project['regions'][number]['polygon'], p: [number, number]): boolean {
  try {
    return pointInPolygon(polygon, p);
  } catch {
    return false;
  }
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  key: null,
  status: 'idle',
  progress: 0,
  result: null,
  project: null,
  error: null,
  jobId: null,
  start(project, analysisId, scenarioId) {
    const key = compareKey(project, analysisId, scenarioId);
    const s = get();
    if (s.key === key && (s.status === 'done' || s.status === 'running')) return;
    if (s.jobId) getClient().cancel(s.jobId);
    const concrete = concreteBarsProject(project);
    const { jobId, promise } = getClient().run(concrete, analysisId, scenarioId, {
      onProgress: (p) => {
        if (get().jobId === jobId) set({ progress: p.fraction });
      },
    });
    set({ key, status: 'running', progress: 0, result: null, project: concrete, error: null, jobId });
    promise
      .then((result) => {
        if (get().jobId !== jobId) return;
        set({ status: 'done', progress: 1, result, jobId: null });
      })
      .catch((e: unknown) => {
        if (get().jobId !== jobId) return;
        const cancelled = (e as { cancelled?: boolean })?.cancelled;
        set({ status: cancelled ? 'idle' : 'error', error: cancelled ? null : String((e as Error)?.message ?? e), jobId: null });
      });
  },
  cancel() {
    const s = get();
    if (s.jobId) getClient().cancel(s.jobId);
    set({ status: 'idle', jobId: null, progress: 0 });
  },
}));
