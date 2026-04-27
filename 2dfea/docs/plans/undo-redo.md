# 2dfea Undo / Redo

## 1. TL;DR

Add a bounded history stack to the 2dfea React/TypeScript app so users can undo and redo model edits with `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`, plus Undo/Redo toolbar buttons. Implementation uses the [`zundo`](https://github.com/charkour/zundo) temporal middleware wrapped around a narrow **model-data slice** of `useModelStore` (nodes, elements, loads, loadCases, loadCombinations, ID counters). UI/view state, selection, solver, and analysis results are deliberately excluded. Undo/redo invalidates analysis results (clears `analysisResults`, `analysisError`, and `resultsCache`) because the snapshot a cached result was computed against may no longer be the live model.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4.4 + Immer + Konva. Triggers `.github/workflows/deploy-all-modules.yml` on push; no plain HTML modules touched.
- **Source of truth for the feature**: `2dfea/TODO.md` → **D1. Undo / Redo**. Key constraints from that entry, honoured below:
  - "Scope: model edits only, NOT view state (pan, zoom, tab selection) or transient state (which cell is selected)."
  - "Granularity: one undo per keystroke is bad; one undo per 'save' is better."
  - "Analysis results: invalidate on undo or keep? Invalidating is safer — the undone state may no longer match the cached results."
  - "Zustand supports history middleware (`zundo`) — worth evaluating vs hand-rolled."
- **Current store surface**, verified by reading `2dfea/src/store/useModelStore.ts`:
  - Uses `create(devtools(persist(immer(...))))` composition.
  - All model mutations go through explicit actions (no `set` calls from outside the store). 43 call sites across 6 components, all using named actions — verified via `Grep`. This is the ideal shape for any undo/redo approach.
  - `updateElement` already has a precedent for invalidating `analysisResults` + `resultsCache` when structural properties (E/I/A) change — we will follow the exact same invalidation pattern.
  - `clearModel` resets all model data. It should **not** be undoable in its current form (see §5), but the plan makes it undoable — users expect "Oh no I hit Clear Model, let me undo that" to work, and zundo's coarse-grained snapshot makes this basically free.
- **Current mutation hot spots for coalescing**, verified:
  - `moveNodes(selectedNodes, dx, dy)` in `CanvasView.tsx:388` fires **once per click** (the move command's "endpoint click"), not continuously — no coalescing work needed for the common Move flow today.
  - Inline cell edits via `EditableCell` and `DropdownCell` (see `src/components/shared/`) commit on blur/Enter, not per keystroke, so each cell edit becomes one undo step — matches the TODO's "one undo per save" goal.
  - **Potential hazard**: if future work adds true Konva drag (e.g. directly dragging a node with `onDragMove`), naive snapshotting would push a history entry per animation frame. We address this with `handleSet` throttling and guidance in §5.
- **Dependency choice**: `zundo` v2 (currently ~2.1.0, compatible with Zustand 4). It is a ~1 KB middleware that lives *inside* the Zustand composition, exposes a parallel `temporalStore` with `undo()`, `redo()`, `clear()`, plus `pastStates` / `futureStates` arrays. It supports `partialize` (which state to track), `equality` (skip no-op snapshots), and `handleSet` (throttle/coalesce). That matches every requirement in D1.
- **Open questions**:
  1. Should `loadExample` clear history (treating "load example" as a fresh-start, not an undoable step)? **Resolved (user clarification, review round 2): yes — `loadExample` calls `temporal.clear()` and is NOT a single undoable step.** Rationale: in the future `loadExample` will only fire when there is no persisted browser-memory state to restore from the previous session (browser-memory persistence is a follow-up feature, OUT OF SCOPE for this plan). Treat `loadExample` as a non-undoable initialization. The implementation must remain compatible with future browser-memory persistence — i.e. nothing in this feature should hard-code "loadExample is always called on startup". Note: this means goal #4's "`clearModel` and `loadExample` are undoable as a single step each" is amended below — `clearModel` remains undoable, but `loadExample` does NOT.
  2. Should Save/Load (A4, not yet shipped) clear history on load? **Default: yes**. The loaded file is a new starting point; keeping history from the previous session would let undo take the user into a state that doesn't match the loaded file. Flag in risk register.

## 3. Goals (Definition of Done)

Each goal is observable and must be verifiable post-merge.

1. `Ctrl+Z` (Windows/Linux) and `Cmd+Z` (macOS) undo the last model mutation; diagrams, tables, and canvas reflect the reverted state immediately.
2. `Ctrl+Y` and `Ctrl+Shift+Z` (and `Cmd+Shift+Z` on macOS) redo.
3. The **Undo** and **Redo** toolbar buttons are visible on the Structure, Loads, and Analysis tabs, disabled when there is nothing to undo/redo, and show a tooltip with the shortcut.
4. Undo/redo covers all model-data mutations:
   - Nodes: add, update (including x/y/support), delete, clearNodes, move, renumber.
   - Elements: add, update (including E/I/A), delete, clearElements, renumber.
   - Loads (nodal, distributed, elementPoint): add, update, delete, clearLoads, deleteSelectedLoads, pasteLoadProperties.
   - Load cases & combinations: add, update, delete.
   - ID counters (`nextNodeNumber`, `nextElementNumber`, `nextNodalLoadNumber`, `nextPointLoadNumber`, `nextDistributedLoadNumber`, `nextLineLoadNumber`) are part of the tracked slice so that redoing an add does not reuse an ID.
   - `clearModel` is undoable as a single step.
   - `loadExample` is **NOT** undoable — it calls `temporal.clear()` after loading the example so history starts fresh. (Amended in review round 2 — see §2 open question 1.)
5. Undo/redo does **not** change or trigger a re-push for:
   - UI state: `activeTab`, `activeTool`, `view`, camera/zoom/pan, `drawingElement`, `hoveredNode`, `selectionRect`, `commandInput`, load dialog state, scale settings, all `show*` flags.
   - Selection: `selectedNodes`, `selectedElements`, `selectedLoads`, `activeLoadCase`, `activeResultView`.
   - Solver/results: `solver`, `isInitializingSolver`, `isAnalyzing`, `analysisResults`, `analysisError`, `resultsCache`.
   - Focus/scroll position / which property cell is being edited.
6. After an undo or redo, cached analysis results are invalidated: `analysisResults = null`, `analysisError = null`, `resultsCache` reset to initial shape. This keeps the diagrams consistent with the live model. **The solver instance itself is kept** (re-initialising Pyodide takes 30–60 s on first load).
7. History depth is bounded: max **50** past states and **50** future states retained. Older entries are dropped silently.
8. Two successive snapshots that produce identical tracked-state are **not** pushed as two entries (`equality` guard). Verified: dragging a node to its original position produces zero history entries.
9. Rapid-fire identical shape mutations (e.g. programmatic batch) are coalesced with a 100 ms `handleSet` throttle so that a single user-intent action results in one history entry even if `set` fires several times.
10. Zustand's `persist` middleware continues to persist the same fields it persists today (nodes, elements, loads, loadCases, loadCombinations, activeLoadCase, activeResultView). History (`pastStates`/`futureStates`) is **not** persisted — a page reload starts with an empty history.
11. `cd 2dfea && npm run type-check` passes with zero errors.
12. `cd 2dfea && npm run build` succeeds. The GitHub Actions deploy workflow completes successfully on push to `master`.
13. Manual QA (§8) passes: add node → undo → node gone, redo → node back; edit node x → undo → x reverts; delete element → undo → element back (and its loads re-appear); run full analysis, then undo a model edit → analysis results cleared.
14. No console errors or React warnings in dev or preview.

## 4. Non-Goals

Explicitly out of scope for this plan:

- Not an "undo for UI state". Pan/zoom/tab selection are intentionally not undoable (matches the TODO entry).
- Not selective/entity-level undo (no "undo just the last edit to node N3"). One user action = one step in a linear stack.
- Not branching/tree-style history (no redo-after-new-edit branches).
- Not Save/Load (A4) — though this plan's invalidation hook will apply naturally when A4 lands.
- Not per-action custom coalescing beyond the 100 ms `handleSet` throttle. True Konva drag coalescing is listed as a risk/follow-up, not required work (CanvasView.tsx uses discrete click-driven Move today).
- Not persisting history across sessions. Reload starts fresh.
- Not changing the solver/Pyodide flow.
- Not touching any plain HTML module, GA tag, vite.config.ts, or workflow yaml.

## 5. Architecture & Design

### Approach comparison

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| **(a) `zundo` middleware** | Drop-in temporal middleware around the `immer` slice. Snapshot-based. | ~30 lines of changes. Exposes `partialize`, `equality`, `handleSet`, `limit`. Already idiomatic to Zustand 4. Built-in hooks. Covers 100 % of the current action surface automatically. | Snapshot (whole slice) per entry, not a command delta. For a 1000-element frame a snapshot is still only tens of KB. | **Chosen.** |
| (b) Hand-rolled snapshot stack | Same semantics as zundo but built in-tree — a `history` slice with `past: ModelSlice[]`, `future: ModelSlice[]`, middleware-style wrapper. | Zero new dependency, full control. | Re-implements `zundo` (partialize/equality/handleSet/limit) and will be a worse version of it. ~200 LOC we must maintain. No hook API. | Rejected — zundo is already a mature version of this. |
| (c) Command pattern | Each action knows its own `do`/`undo`. Store records commands instead of snapshots. | Memory-optimal for very large models; commands can carry semantic info (e.g. "undo renumber"). Enables granular / selective undo later. | Requires rewriting every single mutation action with an inverse; huge surface area (20+ actions). High bug risk (inverses for cascading deletes are subtle — `deleteNode` also deletes connected elements and their loads; `deleteElement` also cascades to distributed/element-point loads). Adds coupling between every action and history. Overkill for current model sizes. | Rejected — too much churn, too little payoff at current scale. |

### Why zundo beats a hand-roll for this codebase

- The model state is **small** (nodes/elements are plain JSON, no cycles, no class instances). A full snapshot is trivially structurally cloneable by immer's copy-on-write.
- All mutations already funnel through the store's named actions — no free-form `set` from components — so every mutation automatically becomes a zundo step.
- `immer` makes snapshots cheap (structural sharing): unchanged arrays/objects are literally the same reference across snapshots; a 50-state deep history for a 50-node / 100-element model is ~hundreds of KB at most.
- `zundo` plays correctly with `devtools`, `persist`, and `immer` — the middleware compose order is documented and matches the patterns already in the store.

### Memory model sanity check (worst-case ballpark)

For context: a frame with **1000 nodes + 2000 elements + 500 loads + 100 load cases** is a heavy model. Rough size:

- Node ≈ 60 B, Element ≈ 90 B, Load ≈ 80 B.
- Raw tracked slice ≈ `1000·60 + 2000·90 + 500·80 + 100·50` ≈ **280 KB**.
- With immer's structural sharing, 50 history entries of such a model where each entry differs by one node edit are **not** 50·280 KB = 14 MB. Immer's copy-on-write means unchanged subtrees share memory — a one-node change duplicates only the path to that node. Practical memory footprint of the stack at that scale stays in the low single-digit MB even under sustained editing.
- History cap of 50 is a **safety cap**, not a target — most users will never hit it. If it is ever hit, a dropped entry is silently the oldest one, which matches user expectation.

### What is tracked ("model slice")

The tracked slice is declared via zundo's `partialize`. These are exactly the fields persisted by the existing `persist` middleware, **plus** the ID counters (because redoing an add should not reuse an ID):

```ts
const TRACKED: (keyof ModelState)[] = [
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
];
```

Everything not in this list is **untracked**. Specifically untracked (matches goal #5):

- `selectedNodes`, `selectedElements`, `selectedLoads`.
- `activeLoadCase`, `activeResultView`.
- `solver`, `isInitializingSolver`, `isAnalyzing`, `analysisResults`, `analysisError`, `resultsCache`.

This means an undo never changes the current selection or the active load case — the user's visual focus stays put, which is the usual IDE convention (VS Code, Figma, etc.).

### Equality guard

Two consecutive states with identical tracked data must not create two history entries. Use a fast equality function:

```ts
const trackedEqual = (a: Partial<ModelState>, b: Partial<ModelState>): boolean => {
  // Reference equality on each tracked field is enough with immer — unchanged arrays share refs.
  for (const k of TRACKED) {
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
};
```

This is O(TRACKED.length), independent of model size. It works because immer gives each mutation new references only for the subtrees that changed; reads from the store that don't mutate keep references intact.

### `handleSet` throttle

Use `handleSet` with a 100 ms trailing-edge throttle to coalesce bursts (e.g. loops that call multiple actions synchronously). `handleSet` sees every committed state post-`set`; it decides when to push a temporal entry.

```ts
handleSet: (handleSet) => throttle<typeof handleSet>(handleSet, 100, { leading: true, trailing: true }),
```

(Implementation note: zundo does not bring lodash. Hand-roll a ~20-LOC `throttle` in `src/utils/throttle.ts` to avoid an extra dep.)

### Invalidation hook (undo/redo clears results)

Subscribe to `temporalStore` and, after any `undo()` or `redo()`, wipe analysis results. Two viable wiring points:

- **Option X**: Wrap `temporalStore.getState().undo` / `.redo` inside the shortcut hook so the wrapper always performs the invalidation after the temporal state change.
- **Option Y**: Subscribe to `temporalStore` with `subscribe((state, prev) => …)` and invalidate when `pastStates`/`futureStates` lengths change due to an undo/redo action.

**Choose Option X** (the wrapper). Reason: it keeps the invalidation in exactly one call site (the keyboard shortcut + the two toolbar button handlers) and avoids spurious invalidations from stack cleanup like `clear()` on model load.

Invalidation body (mirrors the existing pattern inside `updateElement`):

```ts
useModelStore.setState((state: ModelState) => {
  state.analysisResults = null;
  state.analysisError = null;
  state.resultsCache = {
    caseResults: {},
    combinationResults: {},
    lastUpdated: 0,
    analysisStatus: {
      totalCases: 0,
      totalCombinations: 0,
      successfulCases: 0,
      successfulCombinations: 0,
      failedCases: [],
      failedCombinations: [],
    },
  };
});
```

The solver instance is untouched.

### Ignoring specific actions ("don't snapshot this")

A handful of actions should **not** create history entries even though they mutate tracked state:

- **`loadExample`** (round-2 amendment): treat as a non-undoable initialization. After the action mutates the model, call `useModelStore.temporal.getState().clear()` so the example becomes the new fresh-start. Rationale: in the future `loadExample` will only fire when there is no persisted browser-memory state to restore. Browser-memory persistence is OUT OF SCOPE for this feature; implementation must remain compatible with it (i.e. nothing should hard-code "loadExample fires on every startup"). Implementation: simplest path is to add a `temporal.clear()` call at the end of the `loadExample` action body in `useModelStore.ts`. Because zundo's `temporal` middleware is composed inside `persist`, `useModelStore.temporal.getState().clear()` is available from inside the action via the store's static reference (or alternatively the action can be left pure and the call made by callers — but in-action keeps the contract atomic).

If a future action needs to bypass history (e.g. a silent normalisation pass), zundo exposes `temporalStore.getState().pause()` / `resume()`. Left as a future hook; not used in v1.

### API surface added

```ts
// New in store/index.ts:
export { useTemporalModelStore } from './useModelStore';

// In useModelStore.ts:
import { temporal, TemporalState } from 'zundo';
export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      temporal(
        immer((set, get) => ({ /* ...existing... */ })),
        {
          partialize: (state: ModelState) => pick(state, TRACKED),
          equality: trackedEqual,
          handleSet: (setFn) => throttle(setFn, 100, { leading: true, trailing: true }),
          limit: 50,
        },
      ),
      { /* ...existing persist config... */ },
    ),
    { name: 'ModelStore' },
  ),
);

// Expose the temporal store as a React hook for components.
export const useTemporalModelStore = <T>(
  selector: (state: TemporalState<Pick<ModelState, typeof TRACKED[number]>>) => T,
) => useStore(useModelStore.temporal, selector);
```

### Keyboard + UI wiring

- Shortcuts go in **`useKeyboardShortcuts.ts`** (existing hook). Add:
  - `Ctrl+Z` / `Meta+Z` (without Shift) → `undo()` + invalidate.
  - `Ctrl+Shift+Z` / `Meta+Shift+Z` → `redo()` + invalidate.
  - `Ctrl+Y` / `Meta+Y` → `redo()` + invalidate.
  - Guard: do **not** fire when `commandInput?.visible` is true (user is typing in the CAD command input), and do **not** fire when the active element is an `<input>` / `<textarea>` / contenteditable (so cell edits keep their native undo). Implementation: check `document.activeElement?.tagName`.
- Toolbar UI lives in **`Toolbar.tsx`** — add an "Edit" mini-group to the left of the existing tool group. Two small buttons labelled **↶ Undo** and **↷ Redo**, each with a `title` tooltip showing the keyboard shortcut, disabled when `pastStates.length === 0` / `futureStates.length === 0` respectively.
- Buttons show on **all three tabs** (Structure, Loads, Analysis) because undo/redo is a global concept — not tab-specific.

### Solver/results interaction — summary

- Undo and redo **always** clear `analysisResults`, `analysisError`, and `resultsCache`. The solver instance is preserved.
- Users must click **Run Full Analysis** after undo/redo to regenerate diagrams. This matches the existing behaviour when the user edits element E/I/A (see `updateElement` in `useModelStore.ts:280`).
- The "no cached results" banner in `ResultsSelector.tsx` will surface naturally until the user re-runs analysis.

### Why not track results in history?

- Results are derived, not user-authored. Recomputing is the contract.
- Even a small model's result cache (per-case nodal displacements, per-element moment/shear/axial arrays sampled at dozens of stations) is often **larger** than the entire model. Snapshotting the cache would 10–100× memory usage with no user value.

## 6. Files to Touch

| File Path | Action | Purpose |
|-----------|--------|---------|
| `c:\Python\structural_tools\2dfea\package.json` | Modify | Add `zundo` to `dependencies` |
| `c:\Python\structural_tools\2dfea\package-lock.json` | Modify (auto, via `npm i`) | Lockfile update |
| `c:\Python\structural_tools\2dfea\src\utils\throttle.ts` | Create | ~20 LOC leading+trailing throttle helper; avoids adding lodash |
| `c:\Python\structural_tools\2dfea\src\store\historyConfig.ts` | Create | Declares `TRACKED` tuple, `trackedEqual`, and a `invalidateAnalysisCache(state)` helper — keeps the undo wiring de-cluttered inside `useModelStore.ts` |
| `c:\Python\structural_tools\2dfea\src\store\useModelStore.ts` | Modify | Compose `temporal(...)` inside `devtools(persist(...))`. Export `useTemporalModelStore` hook. No action bodies change. |
| `c:\Python\structural_tools\2dfea\src\store\index.ts` | Modify | Re-export `useTemporalModelStore` |
| `c:\Python\structural_tools\2dfea\src\hooks\useKeyboardShortcuts.ts` | Modify | Add `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` / `Cmd+Z` / `Cmd+Shift+Z` / `Cmd+Y` handlers with input-focus guard; invalidate analysis cache on each trigger |
| `c:\Python\structural_tools\2dfea\src\components\Toolbar.tsx` | Modify | Add Undo/Redo buttons on all tabs' top row, bound to `useTemporalModelStore` |
| `c:\Python\structural_tools\2dfea\src\components\CommandInput.tsx` | Read-only reference | No change; confirms our input-focus guard handles the command modal (CommandInput is an `<input>`). |
| `c:\Python\structural_tools\2dfea\docs\plans\undo-redo.md` | Create | This plan |
| `c:\Python\structural_tools\2dfea\docs\plans\INDEX.md` | Modify | Append one-line entry for the new plan |
| `c:\Python\structural_tools\2dfea\TODO.md` | (Out of scope) | User strikes through D1 after merge |

No changes needed in:

- `.github/workflows/deploy-all-modules.yml` — deployment flow unchanged.
- `vite.config.ts`, `tsconfig.json` — no new compiler options, no worker changes.
- Plain HTML modules — untouched.
- Any Canvas/Loads component — mutations already funnel through existing actions, which zundo picks up automatically.

## 7. Step-by-Step Implementation Phases

Each phase is independently compilable and type-checks. Run `cd 2dfea && npm run type-check` after each phase.

### Phase 1 — Dependency and utilities (no behavioural change)

1.1 `cd 2dfea && npm i zundo` (zundo v2+).
1.2 Create `2dfea/src/utils/throttle.ts`:
   - Export `function throttle<F extends (...a:any[])=>any>(fn: F, wait: number, opts: {leading?: boolean; trailing?: boolean}): F`.
   - Trailing-edge + leading-edge (~20 LOC).
   - Add a JSDoc comment explaining why we avoid lodash (keep bundle lean; single use site).
1.3 `npm run type-check` — green.

**Verification**: `node_modules/zundo/` exists; `src/utils/throttle.ts` compiles; no behavioural change to the app.

### Phase 2 — History configuration module

2.1 Create `2dfea/src/store/historyConfig.ts`:

```ts
import type { ModelState } from './useModelStore';
// (If this import creates a cycle, inline the type here or move ModelState to a shared types file.)

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
] as const satisfies ReadonlyArray<keyof ModelState>;

export type TrackedKey = typeof TRACKED_KEYS[number];
export type TrackedSlice = Pick<ModelState, TrackedKey>;

export function partializeTracked(state: ModelState): TrackedSlice {
  const out = {} as TrackedSlice;
  for (const k of TRACKED_KEYS) (out as any)[k] = (state as any)[k];
  return out;
}

// Fast structural-ref equality — works because immer re-uses references for untouched subtrees.
export function trackedEqual(a: TrackedSlice, b: TrackedSlice): boolean {
  for (const k of TRACKED_KEYS) {
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

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
      failedCases: [],
      failedCombinations: [],
    },
  },
};
```

2.2 `npm run type-check` — green. (This module does not yet have any consumer.)

**Note on circular import risk**: if importing `ModelState` from `useModelStore.ts` into `historyConfig.ts` creates a cycle (ESBuild tolerates type-only cycles, but runtime cycles can break), **lift `ModelState` interface into a new file `2dfea/src/store/types.ts`** and import from both. Decide which path is cleaner after a trial compile.

### Phase 3 — Compose `temporal` into `useModelStore`

3.1 Open `2dfea/src/store/useModelStore.ts`.
3.2 Add imports:

```ts
import { temporal } from 'zundo';
import { useStore } from 'zustand';
import { partializeTracked, trackedEqual, TrackedSlice } from './historyConfig';
import { throttle } from '../utils/throttle';
```

3.3 Change the store composition from:

```ts
export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      immer((set, get) => ({ ... })),
      { name: '2dfea-model-storage', partialize: ... },
    ),
    { name: 'ModelStore' },
  ),
);
```

to:

```ts
export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      temporal(
        immer((set, get) => ({ ... })),
        {
          partialize: partializeTracked,
          equality: trackedEqual,
          handleSet: (setFn) => throttle(setFn, 100, { leading: true, trailing: true }),
          limit: 50,
        },
      ),
      { name: '2dfea-model-storage', partialize: ... },
    ),
    { name: 'ModelStore' },
  ),
);
```

3.4 Export a convenience hook at the bottom of the file:

```ts
export const useTemporalModelStore = <T>(
  selector: (s: import('zundo').TemporalState<TrackedSlice>) => T,
) => useStore((useModelStore as any).temporal, selector);
```

3.5 Re-export from `2dfea/src/store/index.ts`:

```ts
export { useModelStore, useTemporalModelStore } from './useModelStore';
```

3.6 Run `npm run type-check`. If `@ts-nocheck` at the top of `useModelStore.ts` hides errors, temporarily remove it, verify the new API types cleanly, then restore `@ts-nocheck` (the file's existing policy). If errors surface in the `temporal` typing, cast with `as const` on the TRACKED tuple or add a narrow `as any` at the composition boundary — zundo's types are sound but sometimes trip Zustand's nested middleware typings.
3.7 Smoke-test: `npm run dev`, add a node, inspect `useModelStore.temporal.getState().pastStates` via the browser console — should grow by 1.

**Verification**: history is being recorded, but no UI or shortcut exposes it yet. Existing behaviour (add/delete/edit everything) works identically.

### Phase 4 — Toolbar Undo/Redo buttons

4.1 Open `2dfea/src/components/Toolbar.tsx`.
4.2 At the top of the component, add:

```ts
import { useModelStore, useTemporalModelStore, useUIStore } from '../store';
import { INVALIDATE_ANALYSIS_PATCH } from '../store/historyConfig';

const pastStates = useTemporalModelStore((t) => t.pastStates);
const futureStates = useTemporalModelStore((t) => t.futureStates);
const undo = useTemporalModelStore((t) => t.undo);
const redo = useTemporalModelStore((t) => t.redo);

const canUndo = pastStates.length > 0;
const canRedo = futureStates.length > 0;

const doUndo = () => {
  if (!canUndo) return;
  undo();
  useModelStore.setState((state: ModelState) => Object.assign(state, INVALIDATE_ANALYSIS_PATCH));
};
const doRedo = () => {
  if (!canRedo) return;
  redo();
  useModelStore.setState((state: ModelState) => Object.assign(state, INVALIDATE_ANALYSIS_PATCH));
};
```

4.3 In the top row of the toolbar JSX, **before** the tab-specific tools (so the buttons are visible on every tab), add:

```tsx
<div style={{ display: 'flex', gap: '4px', marginRight: '8px', paddingRight: '8px', borderRight: '1px solid #ccc' }}>
  <button
    style={editButtonStyle(canUndo)}
    onClick={doUndo}
    disabled={!canUndo}
    title="Undo (Ctrl+Z)"
  >
    ↶ Undo
  </button>
  <button
    style={editButtonStyle(canRedo)}
    onClick={doRedo}
    disabled={!canRedo}
    title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
  >
    ↷ Redo
  </button>
</div>
```

4.4 Add an `editButtonStyle(enabled: boolean)` helper near the existing `toolButtonStyle` / `actionButtonStyle` factories, colour-matched to the existing `actionButtonStyle` (grey when disabled).
4.5 `npm run type-check` — green. `npm run dev` — buttons render; clicking them undoes/redoes.

### Phase 5 — Keyboard shortcuts

5.1 Open `2dfea/src/hooks/useKeyboardShortcuts.ts`.
5.2 Add imports and subscriptions mirroring the toolbar:

```ts
import { useTemporalModelStore } from '../store';
import { INVALIDATE_ANALYSIS_PATCH } from '../store/historyConfig';

const undo = useTemporalModelStore((t) => t.undo);
const redo = useTemporalModelStore((t) => t.redo);
const pastLen = useTemporalModelStore((t) => t.pastStates.length);
const futureLen = useTemporalModelStore((t) => t.futureStates.length);
```

5.3 Inside `handleKeyDown`, add **after** the Ctrl+Space branch and **before** the closing of the function:

```ts
const isEditingInput = (() => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
})();

// Undo
if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
  if (commandInput?.visible || isEditingInput) return;  // let native input handle it
  e.preventDefault();
  if (pastLen > 0) {
    undo();
    useModelStore.setState((s: ModelState) => Object.assign(s, INVALIDATE_ANALYSIS_PATCH));
  }
  return;
}

// Redo (Ctrl+Shift+Z or Ctrl+Y)
const isRedo =
  ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
  ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'y' || e.key === 'Y'));
if (isRedo) {
  if (commandInput?.visible || isEditingInput) return;
  e.preventDefault();
  if (futureLen > 0) {
    redo();
    useModelStore.setState((s: ModelState) => Object.assign(s, INVALIDATE_ANALYSIS_PATCH));
  }
  return;
}
```

5.4 Add the new dependencies to the `useEffect` dependency array: `undo`, `redo`, `pastLen`, `futureLen`.
5.5 `npm run type-check` — green. `npm run dev` — shortcuts work.

### Phase 6 — Documentation & cleanup

6.1 Add a short JSDoc comment block at the top of `useModelStore.ts` above the `temporal()` wrap, explaining the tracked slice and the invalidation policy.
6.2 Add a `title` attribute on the two new buttons (done in phase 4).
6.3 Update `2dfea/docs/plans/INDEX.md`:
   ```md
   - [Undo / Redo](undo-redo.md) — bounded history stack via `zundo`; `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; tracks model data only; invalidates analysis on undo/redo.
   ```

### Phase 7 — Ship

7.1 Run the full verification matrix in §8.
7.2 Commit:
   ```bash
   git add 2dfea/package.json 2dfea/package-lock.json \
           2dfea/src/utils/throttle.ts \
           2dfea/src/store/historyConfig.ts \
           2dfea/src/store/useModelStore.ts \
           2dfea/src/store/index.ts \
           2dfea/src/hooks/useKeyboardShortcuts.ts \
           2dfea/src/components/Toolbar.tsx \
           2dfea/docs/plans/undo-redo.md \
           2dfea/docs/plans/INDEX.md
   ```
   Commit message (HEREDOC):
   ```
   feat(2dfea): add undo/redo via zundo temporal middleware

   - Add zundo dependency; compose temporal() inside devtools(persist(immer(...)))
   - Track only model-authored data (nodes, elements, loads, cases, combos, ID counters)
   - Exclude UI, selection, solver, results from history
   - 50-entry cap, 100ms handleSet throttle, reference-equality guard
   - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Cmd+(Shift+)Z / Cmd+Y keyboard shortcuts
   - Undo/Redo toolbar buttons on all tabs (disabled when stack is empty)
   - Undo/redo invalidates analysisResults / analysisError / resultsCache (matches
     the existing pattern in updateElement when E/I/A changes)

   Refs TODO.md D1.
   ```
7.3 Push to `master`. Monitor Actions run. Verify the live URL per §8.

## 8. Test & Verification Plan

### Automated gates

| Gate | Command (from `2dfea/`) | Passes when |
|------|-------------------------|-------------|
| Type check | `npm run type-check` | Zero TS errors |
| Production build | `npm run build` | Exit 0, `dist/` produced |
| Preview | `npm run preview` | Worker loads, analysis runs in built output |
| CI deploy | GitHub Actions `Deploy 2D FEM to GitHub Pages` | Workflow green |

### Manual QA checklist (http://localhost:5173 via `npm run dev`)

Run through each scenario with DevTools open. No console errors or warnings expected.

**Group A — Basic undo/redo semantics**
1. Load Example (cantilever). Press `Ctrl+Z`. Expect: **no-op** — `loadExample` is not undoable (it calls `temporal.clear()`). Undo button is disabled (no past states). This is the amended behaviour from review round 2; see §2 open question 1.
2. Click "Draw Node", click canvas at (2, 3). Press `Ctrl+Z`. Expect: N1 (or N3) disappears. Press `Ctrl+Shift+Z`. Expect: node reappears with the same name/coords.
3. Add two nodes, connect with element, add a nodal load on the second node. `Ctrl+Z` three times. Expect: load gone → element gone → second node gone, in that order. `Ctrl+Y` three times restores.
4. Edit node N1's X from 0 to 5 via the Nodes tab `EditableCell`. `Ctrl+Z`. Expect: X reverts to 0 in the cell and on the canvas.

**Group B — Cascading deletes**
5. Cantilever loaded. Delete N2. Expect: element E1 and the nodal load on N2 are also gone. `Ctrl+Z`. Expect: **N2, E1, and the nodal load all come back together** (one undo restores the full cascade, because the delete was a single action).

**Group C — Selection, UI state, and view do NOT undo**
6. Select N1 + N2. Run Full Analysis. Enable Moment diagram. Pan/zoom the canvas. `Ctrl+Z`. Expect: selection, view transform, moment-diagram toggle, active tab — **all unchanged**. The *most recent model mutation* is undone (if any), otherwise nothing happens.
7. Open the Load dialog. `Ctrl+Z` while dialog is open and a field is focused. Expect: the native input's undo fires (characters erased), **not** a model undo.

**Group D — Analysis invalidation**
8. Cantilever loaded. Run Full Analysis. Enable Moment + Shear diagrams. Confirm diagrams render. Edit N2's X to 10 (via cell). Diagrams clear (existing E/I/A-invalidation path is not the trigger here — but the user is expected to re-run). Press `Ctrl+Z`. Expect: N2's X reverts, **and** `resultsCache`/`analysisResults` cleared (diagrams still empty; that's fine). Press "Run Full Analysis" again — diagrams come back.
9. Stronger invalidation test: cantilever + run full analysis (diagrams on). Then add a node (creates one undoable step). Press `Ctrl+Z`. Expect: the added node disappears, **and** diagrams disappear (analysis results cleared because we always invalidate on undo/redo). Note: testing this scenario via "load example then undo" no longer works because `loadExample` clears history (round-2 amendment).

**Group E — History bounds & equality**
10. Add 51 nodes one after another. `Ctrl+Z` 55 times. Expect: at most 50 undos succeed; after that, undos are no-ops (button disabled). Redo 50 times to fully restore.
11. Edit N1's x from 0 to 5, then from 5 back to 0. `Ctrl+Z` twice. Expect: x=5 → x=0 sequence replays in reverse (two entries recorded — the equality guard only suppresses *identical consecutive* snapshots, not a round-trip). Consider this the baseline behaviour; document it in the tooltip if needed.
12. Open a fresh page, no edits. Press `Ctrl+Z`. Expect: no-op, no errors. Undo button disabled.

**Group F — Persistence**
13. Edit a few nodes. Reload the page (F5). Expect: nodes persist (existing `persist` behaviour). Press `Ctrl+Z`. Expect: no-op — history does not persist across reloads. Undo/Redo buttons both disabled.

**Group G — Keyboard guards**
14. Focus a cell editor in the Nodes tab. Type a number. Press `Ctrl+Z`. Expect: native undo inside the input (last character removed), **not** a model undo.
15. Open the CAD command input (e.g. start Move command, then type coordinates). While command input is visible, press `Ctrl+Z`. Expect: command input is unaffected; no model undo fires.

**Group H — Cross-browser sanity**
16. Repeat tests 1–4 in Chrome, Firefox, Edge. Same-machine macOS sanity check for `Cmd+Z` / `Cmd+Shift+Z` / `Cmd+Y` if available.

### Edge cases to sanity-check

| Case | Expected |
|------|----------|
| `clearModel()` then `Ctrl+Z` | Entire previous model restored in one step. |
| `renumberNodes()` then `Ctrl+Z` | Node names revert to the pre-renumber set, and loads/elements regain their old references. |
| `pasteLoadProperties` then `Ctrl+Z` | Target load properties revert; the copied-from load is unaffected (paste does not mutate the source). |
| Undo through a `runFullAnalysis`-completed state | Analysis results stay cleared after undo (invalidation is unconditional). Re-run analysis to see diagrams. |
| `loadExample()` called when there's an existing model | History is cleared (`temporal.clear()` after load); the example is the new starting point. Amended round 2 — `loadExample` is NOT undoable. |
| Solver is `null` (init failed) | Undo/redo still work on pure model state; they never touch `solver`. |
| Very large model (simulate 500 elements) | Undo latency should still be <50 ms in release build; history memory stays under 10 MB. |
| History cap reached | Oldest entry dropped silently; no errors. |

### Deployment verification (post-push)

1. Wait for Actions: https://github.com/magnusfjeldolsen/structural_tools/actions.
2. Hard-refresh (`Ctrl+Shift+R`) https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
3. Load Example → edit → `Ctrl+Z` → revert. Works in production.
4. Network tab: no new 4xx/5xx. Bundle size change due to zundo should be ~1 KB minified (inspect `dist/assets/index-*.js` report).

## 9. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| zundo + devtools + persist + immer composition order causes a subtle middleware typing/runtime issue | Medium | Medium | Compose exactly in the order shown in §7 (devtools outermost, persist next, temporal inner, immer innermost). zundo's docs explicitly show this ordering. Verify with `type-check` and a smoke test (push a state, inspect `temporal.getState().pastStates`) before wiring UI. |
| Circular import between `useModelStore.ts` and `historyConfig.ts` via `ModelState` type | Medium | Low | If circular at runtime, extract `ModelState` into `src/store/types.ts` and import from both. The `@ts-nocheck` banner on `useModelStore.ts` may mask a type-level cycle; remove it temporarily during phase 3 to confirm. |
| User hits `Ctrl+Z` while typing in an input and loses their typing | High (if unguarded) | Medium | Guard with `isEditingInput` check (phase 5.3). Also guards contenteditable. |
| Undo produces a model state where `activeLoadCase` or `activeResultView` points at a deleted case/combo | Low | Low | Selection is untracked, so `activeLoadCase = 'Live'` persists even if Live was deleted-then-undone. Deleting a case already updates `activeLoadCase` — an undo that brings Live back leaves the current selection (possibly 'Dead') valid. If Live was the active case, it was reset to 'Dead' on delete; undo brings Live back as a case but leaves 'Dead' selected. Acceptable: user can re-select Live manually. Document in commit message. |
| History exposes internal ID counters; undoing an add that incremented `nextNodeNumber` to 3 leaves the counter at 2 | Expected | Low (correctness win) | This is **correct** behaviour — redo of the add should produce the same N2 name, so the counter must be part of the tracked slice. The plan explicitly includes all `next*Number` counters in `TRACKED_KEYS`. |
| Large model (~1000 elements) snapshot cost becomes user-visible | Low at current scale | Medium | Immer structural sharing keeps per-snapshot cost proportional to the diff, not the whole slice. If ever a concern, tighten `limit` to 20 or switch to command pattern. Not required for v1. |
| Future Konva `onDragMove` direct-drag work creates one history entry per animation frame | Medium (if added later) | High (bloat + jank) | Document the pattern: future drag code should call `temporal.pause()` during drag and `temporal.resume()` + a single explicit push on mouseup. Out of scope for v1 because `moveNodes` is currently only called once per click. |
| zundo version skew with Zustand 4 minor bumps | Low | Low | Pin zundo to the exact installed minor; re-check on Zustand upgrades. |
| Save/Load (A4) lands and a loaded model leaves stale history entries from the pre-load session | Deferred | Medium | When A4 is implemented, its load handler must call `useModelStore.temporal.getState().clear()` after setting the new state. Add a one-line note to the A4 plan when it is drafted. |
| Analysis invalidation pattern diverges from the existing `updateElement` invalidation (subtle different reset of `resultsCache`) | Low | Low | Use a single shared constant (`INVALIDATE_ANALYSIS_PATCH`) in `historyConfig.ts` and consider refactoring `updateElement` to use it in a follow-up PR. Not in scope for v1. |
| Deployment cache serves old bundle for 1–2 min | Expected | Low | Hard refresh (`Ctrl+Shift+R`) during verification. |

## 10. Rollout & Deployment

- **Branch strategy**: feature branch `feature/2dfea-undo-redo`, push, open PR, merge via squash (matches the quick-wins PR pattern). If solo-maintainer workflow is preferred, commit directly to `master`.
- **Deployment trigger**: any push touching `2dfea/**` auto-runs `.github/workflows/deploy-all-modules.yml`. Expected 2–3 minutes to go live.
- **Plain-HTML-module impact**: none.
- **Rollback**: single-commit revert:
  ```bash
  git revert <commit-sha>
  git push origin master
  ```
  Redeploy in ~3 min. No data-format migration risk — history is not persisted, and the tracked slice equals the already-persisted slice plus ID counters (also already in `initialState`), so rolling back leaves existing `localStorage` entries fully usable.
- **Migration notes for users**: none. Feature is purely additive.

## 11. Observability & DX

- **Inline comments** in `useModelStore.ts` above the `temporal()` wrapping block explain the tracked-slice policy and the invalidation contract.
- **JSDoc** on `useTemporalModelStore` spells out the hook signature and the action names exposed by zundo (`undo`, `redo`, `clear`, `pause`, `resume`, `setOnSave`).
- **Button tooltips** on the toolbar advertise the shortcuts (`title="Undo (Ctrl+Z)"` etc.).
- **Console diagnostics** in dev: log `[ModelStore] Undo` / `[ModelStore] Redo` with `pastStates.length` / `futureStates.length` at the wrapper call sites (phase 4 + 5). Match the existing logging style (`console.log('[ModelStore] ...')`).
- **No README/new docs file** required — the TODO item is crossed off and this plan is the reference going forward.

## 12. Success Metrics

Post-merge the feature is successful when:

1. `Ctrl+Z` and `Ctrl+Shift+Z` / `Ctrl+Y` produce the expected undo/redo in Chrome, Firefox, and Edge, on https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
2. Toolbar Undo/Redo buttons render on all three tabs, correctly disabled at stack boundaries.
3. No console errors in dev or prod.
4. `npm run type-check` and `npm run build` green on `master`.
5. GitHub Actions deploy run green.
6. Manual QA groups A–G all pass.
7. No regression reports of inadvertent selection / view-transform loss.
8. Bundle size increase under 2 KB minified (zundo is tiny).
9. D1 struck through in `2dfea/TODO.md`.
