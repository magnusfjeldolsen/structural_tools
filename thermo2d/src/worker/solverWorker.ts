/// <reference lib="webworker" />
/**
 * Solver Web Worker: meshes and runs analyses off the UI thread. The run loop
 * yields to the event loop every ~50 ms so 'cancel' messages get through.
 */
import { createRun, mesh as buildMesh, prepareRun, projectHash, CORE_VERSION } from '@thermo2d/core';
import type { Mesh, RunResult } from '@thermo2d/core';
import { transferables, type WorkerRequest, type WorkerResponse } from './protocol.js';

const cancelled = new Set<string>();

function post(msg: WorkerResponse): void {
  const buffers = msg.type === 'done' || msg.type === 'mesh-result' || msg.type === 'snapshot' ? transferables(msg) : [];
  (self as unknown as Worker).postMessage(msg, buffers);
}

function errorMessage(e: unknown): { message: string; detail?: unknown } {
  if (e instanceof Error) {
    const detail = (e as { detail?: unknown; code?: string }).detail ?? (e as { code?: string }).code;
    return { message: e.message, detail };
  }
  return { message: String(e) };
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function handleMesh(req: Extract<WorkerRequest, { type: 'mesh' }>): Promise<void> {
  try {
    const prepared = prepareRun(req.project, req.analysisId, req.scenarioId);
    const m: Mesh = buildMesh(prepared.meshInput);
    post({ type: 'mesh-result', jobId: req.jobId, mesh: m });
  } catch (e) {
    post({ type: 'error', jobId: req.jobId, ...errorMessage(e) });
  }
}

async function handleRun(req: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  const { jobId } = req;
  try {
    const prepared = prepareRun(req.project, req.analysisId, req.scenarioId);
    post({ type: 'progress', jobId, t: 0, fraction: 0, step: 0, message: 'mesh' });
    const m = buildMesh(prepared.meshInput);
    await yieldToEventLoop();
    if (cancelled.has(jobId)) return finishCancelled(jobId);
    const input = prepared.buildSolveInput(m);
    const run = createRun(input);
    let lastPost = performance.now();
    let lastSnapshotT = -Infinity;
    const snapshotEvery = Math.max(input.analysis.outputInterval, 1);
    while (true) {
      const more = run.step();
      const now = performance.now();
      if (now - lastPost > 100) {
        const p = run.progress;
        post({ type: 'progress', jobId, t: p.t, fraction: p.fraction, step: p.step, message: p.message });
        lastPost = now;
      }
      if (req.wantSnapshots && run.t - lastSnapshotT >= snapshotEvery) {
        lastSnapshotT = run.t;
        post({ type: 'snapshot', jobId, t: run.t, theta: Float32Array.from(run.theta) });
      }
      if (!more) break;
      if (now - lastPost > 50 || run.progress.step % 20 === 0) {
        await yieldToEventLoop();
        if (cancelled.has(jobId)) return finishCancelled(jobId);
      }
    }
    const result: RunResult = run.result();
    result.stamp = { projectHash: projectHash(req.project), coreVersion: CORE_VERSION, createdAt: new Date().toISOString() };
    post({ type: 'progress', jobId, t: run.t, fraction: 1, step: run.progress.step });
    post({ type: 'done', jobId, result });
  } catch (e) {
    post({ type: 'error', jobId, ...errorMessage(e) });
  } finally {
    cancelled.delete(jobId);
  }
}

function finishCancelled(jobId: string): void {
  cancelled.delete(jobId);
  post({ type: 'cancelled', jobId });
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === 'cancel') {
    cancelled.add(req.jobId);
    return;
  }
  if (req.type === 'mesh') void handleMesh(req);
  else if (req.type === 'run') void handleRun(req);
};
