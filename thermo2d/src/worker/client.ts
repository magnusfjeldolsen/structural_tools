/** Promise-based client for the solver worker. One worker, many jobs. */
import type { Mesh, Project, RunResult } from '@thermo2d/core';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

export interface RunCallbacks {
  onProgress?: (p: { t: number; fraction: number; step: number; message?: string }) => void;
  onSnapshot?: (s: { t: number; theta: Float32Array }) => void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  callbacks?: RunCallbacks;
}

let jobCounter = 0;

export class SolverClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();

  constructor(private readonly factory: () => Worker = defaultFactory) {}

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = this.factory();
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.handle(ev.data);
      this.worker.onerror = (ev) => {
        const err = new Error(ev.message || 'Worker error');
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }

  private handle(msg: WorkerResponse): void {
    const p = this.pending.get(msg.jobId);
    if (!p) return;
    switch (msg.type) {
      case 'progress':
        p.callbacks?.onProgress?.(msg);
        break;
      case 'snapshot':
        p.callbacks?.onSnapshot?.(msg);
        break;
      case 'mesh-result':
        this.pending.delete(msg.jobId);
        p.resolve(msg.mesh);
        break;
      case 'done':
        this.pending.delete(msg.jobId);
        p.resolve(msg.result);
        break;
      case 'cancelled':
        this.pending.delete(msg.jobId);
        p.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
        break;
      case 'error': {
        this.pending.delete(msg.jobId);
        p.reject(Object.assign(new Error(msg.message), { detail: msg.detail }));
        break;
      }
    }
  }

  private send(req: WorkerRequest): void {
    this.ensure().postMessage(req);
  }

  mesh(project: Project, analysisId: string, scenarioId: string | null): { jobId: string; promise: Promise<Mesh> } {
    const jobId = `m${++jobCounter}`;
    const promise = new Promise<Mesh>((resolve, reject) => {
      this.pending.set(jobId, { resolve: resolve as (v: unknown) => void, reject });
      this.send({ type: 'mesh', jobId, project, analysisId, scenarioId });
    });
    return { jobId, promise };
  }

  run(project: Project, analysisId: string, scenarioId: string | null, callbacks?: RunCallbacks): { jobId: string; promise: Promise<RunResult> } {
    const jobId = `r${++jobCounter}`;
    const promise = new Promise<RunResult>((resolve, reject) => {
      this.pending.set(jobId, { resolve: resolve as (v: unknown) => void, reject, callbacks });
      this.send({ type: 'run', jobId, project, analysisId, scenarioId, wantSnapshots: !!callbacks?.onSnapshot });
    });
    return { jobId, promise };
  }

  cancel(jobId: string): void {
    if (this.pending.has(jobId)) this.send({ type: 'cancel', jobId });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('terminated'));
    this.pending.clear();
  }
}

function defaultFactory(): Worker {
  return new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
}

export function isCancelledError(e: unknown): boolean {
  return !!(e && typeof e === 'object' && (e as { cancelled?: boolean }).cancelled);
}
