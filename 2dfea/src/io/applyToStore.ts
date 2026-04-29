/**
 * applyToStore — single mutation path from a validated v1 file to the
 * runtime Zustand store.
 *
 * Contract:
 *   1. Always validate first; mutate only on success.
 *   2. Replace the tracked slice wholesale (no merging — old IDs may
 *      collide with new ones).
 *   3. Apply INVALIDATE_ANALYSIS_PATCH so cached results never lag the
 *      newly imported model.
 *   4. Call useModelStore.temporal.getState().clear() so undo cannot
 *      rewind into the pre-import model. This is the load-bearing line —
 *      removing it is a regression of the contract documented in
 *      docs/plans/undo-redo.md §9.
 *
 * See docs/plans/save-load-json.md §5.8.
 */
import type { ModelFileV1 } from './schema';
import { fileToStorePatch } from './canonicalize';
import { useModelStore } from '../store/useModelStore';
import { INVALIDATE_ANALYSIS_PATCH } from '../store/historyConfig';

export function applyToStore(file: ModelFileV1): void {
  const patch = fileToStorePatch(file);

  useModelStore.setState((state: any) => {
    // Tracked slice — replace wholesale.
    state.nodes = patch.nodes;
    state.elements = patch.elements;
    state.loads = patch.loads;
    state.loadCases = patch.loadCases;
    state.loadCombinations = patch.loadCombinations;
    state.nextNodeNumber = patch.nextNodeNumber;
    state.nextElementNumber = patch.nextElementNumber;
    state.nextNodalLoadNumber = patch.nextNodalLoadNumber;
    state.nextPointLoadNumber = patch.nextPointLoadNumber;
    state.nextDistributedLoadNumber = patch.nextDistributedLoadNumber;
    state.nextLineLoadNumber = patch.nextLineLoadNumber;

    // Persist-only fields (not in TRACKED_KEYS but in the file).
    state.activeLoadCase = patch.activeLoadCase;
    state.activeResultView = patch.activeResultView;

    // Comments (non-tracked, non-undoable).
    state.comments = patch.comments;

    // Selection — clear; old IDs may not match new ones.
    state.selectedNodes = [];
    state.selectedElements = [];
    state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };

    // Invalidate analysis cache (loaded model has no cached results).
    Object.assign(state, INVALIDATE_ANALYSIS_PATCH);
  });

  // Critical: clear undo/redo history so user can't undo back into the
  // pre-import model. Mirrors the contract noted in undo-redo.md §9.
  (useModelStore as any).temporal.getState().clear();
}
