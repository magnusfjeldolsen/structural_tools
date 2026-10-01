/** Message protocol between the app and the solver Web Worker. */
import type { Mesh, Project, RunResult } from '@thermo2d/core';

export type WorkerRequest =
  | { type: 'mesh'; jobId: string; project: Project; analysisId: string; scenarioId: string | null }
  | { type: 'run'; jobId: string; project: Project; analysisId: string; scenarioId: string | null; wantSnapshots?: boolean }
  | { type: 'cancel'; jobId: string };

export type WorkerResponse =
  | { type: 'mesh-result'; jobId: string; mesh: Mesh }
  | { type: 'progress'; jobId: string; t: number; fraction: number; step: number; message?: string }
  | { type: 'snapshot'; jobId: string; t: number; theta: Float32Array }
  | { type: 'done'; jobId: string; result: RunResult }
  | { type: 'cancelled'; jobId: string }
  | { type: 'error'; jobId: string; message: string; detail?: unknown };

export function resultKey(analysisId: string, scenarioId: string | null | undefined): string {
  return `${analysisId}|${scenarioId ?? ''}`;
}

/** Buffers to transfer (not copy) when posting a mesh or result across the worker boundary. */
export function transferables(obj: unknown, out: ArrayBuffer[] = [], seen = new Set<unknown>()): ArrayBuffer[] {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  if (ArrayBuffer.isView(obj)) {
    const buf = (obj as ArrayBufferView).buffer as ArrayBuffer;
    if (!out.includes(buf)) out.push(buf);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) transferables(v, out, seen);
  } else {
    for (const v of Object.values(obj as Record<string, unknown>)) transferables(v, out, seen);
  }
  return out;
}
