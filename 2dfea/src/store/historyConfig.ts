/**
 * History configuration for the zundo `temporal` middleware wrapping useModelStore.
 *
 * Declares:
 *  - TRACKED_KEYS: the model-data fields that participate in undo/redo. Everything
 *    else (UI state, selection, solver, results) is intentionally excluded.
 *  - partializeTracked / trackedEqual: zundo `partialize` + `equality` impls.
 *  - INVALIDATE_ANALYSIS_PATCH: the patch object applied to useModelStore after
 *    every undo() / redo() so cached analysis results never lag the live model.
 *
 * Why a separate file: keeps the store composition in useModelStore.ts uncluttered
 * and avoids a circular-import risk (we deliberately don't import ModelState from
 * useModelStore here — useModelStore.ts has @ts-nocheck which would mask issues).
 *
 * Round-2 amendment: loadExample is NOT undoable. The action body in
 * useModelStore.ts calls useModelStore.temporal.getState().clear() after the
 * mutation. See plan section 5 ("Ignoring specific actions").
 */

import type { Node, Element, Loads, LoadCase, LoadCombinationDefinition } from '../analysis/types';

/**
 * Fields participating in undo/redo. Mirrors the persist `partialize` set,
 * plus the ID counters (so redoing an add does not reuse an ID).
 */
export const TRACKED_KEYS = [
  'nodes',
  'elements',
  'loads',
  'loadCases',
  'loadCombinations',
  'nextNodeNumber',
  'nextElementNumber',
  'nextNodalLoadNumber',
  'nextPointLoadNumber',
  'nextDistributedLoadNumber',
  'nextLineLoadNumber',
] as const;

export type TrackedKey = typeof TRACKED_KEYS[number];

/**
 * Shape of the tracked slice. Kept as an explicit interface (rather than
 * Pick<ModelState, ...>) to avoid coupling to useModelStore.ts's @ts-nocheck'd
 * surface and to keep type-checking honest in this file.
 */
export interface TrackedSlice {
  nodes: Node[];
  elements: Element[];
  loads: Loads;
  loadCases: LoadCase[];
  loadCombinations: LoadCombinationDefinition[];
  nextNodeNumber: number;
  nextElementNumber: number;
  nextNodalLoadNumber: number;
  nextPointLoadNumber: number;
  nextDistributedLoadNumber: number;
  nextLineLoadNumber: number;
}

/**
 * zundo `partialize` — extracts the tracked slice from the full ModelState.
 * Permissive `any` parameter keeps this decoupled from the @ts-nocheck'd
 * useModelStore.ts type surface.
 */
export function partializeTracked(state: any): TrackedSlice {
  const out = {} as Record<string, unknown>;
  for (const k of TRACKED_KEYS) {
    out[k] = state[k];
  }
  return out as unknown as TrackedSlice;
}

/**
 * zundo `equality` — fast structural-reference equality on each tracked field.
 * Works because immer reuses references for unchanged subtrees. O(TRACKED_KEYS.length),
 * independent of model size. Suppresses no-op snapshots (e.g. dragging a node back
 * to its original position).
 */
export function trackedEqual(a: TrackedSlice, b: TrackedSlice): boolean {
  for (const k of TRACKED_KEYS) {
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

/**
 * Patch applied to useModelStore after every undo() / redo() to keep cached
 * analysis results consistent with the live model. Mirrors the existing
 * pattern used inside `updateElement` when E/I/A change. The solver instance
 * itself is preserved (re-initialising Pyodide is expensive).
 */
export const INVALIDATE_ANALYSIS_PATCH = {
  analysisResults: null,
  analysisError: null,
  resultsCache: {
    caseResults: {},
    combinationResults: {},
    lastUpdated: 0,
    analysisStatus: {
      totalCases: 0,
      totalCombinations: 0,
      successfulCases: 0,
      successfulCombinations: 0,
      failedCases: [] as string[],
      failedCombinations: [] as string[],
    },
  },
} as const;
