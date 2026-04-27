# Implementation Checklist — 2dfea Undo / Redo

- **Plan**: [`undo-redo.md`](undo-redo.md) (round-2 amended)
- **Branch**: `feature/2dfea-undo-redo`
- **Change class**: 2dfea-only (TypeScript / React / Zustand)
- **Started**: 2026-04-27
- **Baseline**: `npm run type-check` green; `npm run build` green (1.39s, 612.73 kB)

## Round-2 amendments locked in
- [x] Plan workflow filename corrected to `deploy-all-modules.yml`
- [x] `loadExample` documented as non-undoable (calls `temporal.clear()`)
- [x] `@ts-nocheck` will be preserved on `src/store/useModelStore.ts` and `src/store/useUIStore.ts`

## Phase 1 — Dependency and utilities
- [x] 1.1 `npm i zundo` (v2+) inside `2dfea/` — installed `^2.3.0`
- [x] 1.2 Create `2dfea/src/utils/throttle.ts` — leading + trailing throttle helper (no lodash)
- [x] 1.3 `npm run type-check` green
- [x] Commit: `feat(2dfea): add zundo dep and throttle utility for undo/redo` (bc32f51)

## Phase 2 — History configuration module
- [x] 2.1 Create `2dfea/src/store/historyConfig.ts` exporting `TRACKED_KEYS`, `partializeTracked`, `trackedEqual`, `INVALIDATE_ANALYSIS_PATCH`
- [x] 2.2 `npm run type-check` green
- [x] Confirm no circular import on `ModelState` type — used a local `TrackedSlice` interface (no ModelState import) to keep this file off the @ts-nocheck'd surface
- [x] Commit: `feat(2dfea): add history config module for tracked-slice partializer` (3c07979)

## Phase 3 — Compose `temporal` into `useModelStore`
- [x] 3.1 Add imports (`zundo`, `useStore`, helpers)
- [x] 3.2 Wrap immer slice in `temporal(...)` between `persist` and `immer`
- [x] 3.3 Configure `partialize`, `equality`, `handleSet` (100ms throttle), `limit: 50`
- [x] 3.4 Export `useTemporalModelStore` hook from the store file
- [x] 3.5 Re-export from `src/store/index.ts`
- [x] 3.6 In `loadExample` action body, call `useModelStore.temporal.getState().clear()` AFTER state mutation (round-2 amendment)
- [x] 3.7 LEAVE `@ts-nocheck` in place on `useModelStore.ts` and `useUIStore.ts`
- [x] 3.8 `npm run type-check` green
- [ ] 3.9 Smoke-test: `npm run dev`, add a node, inspect `useModelStore.temporal.getState().pastStates` in console — covered by Phase 7 end-to-end smoke (running the manual QA matrix)
- [x] Commit: `feat(2dfea): compose zundo temporal middleware into model store`

## Phase 4 — Toolbar Undo/Redo buttons
- [x] 4.1 Open `src/components/Toolbar.tsx`
- [x] 4.2 Subscribe to `pastStates.length`, `futureStates.length`, `undo`, `redo` via `useTemporalModelStore` (length-only selectors avoid spurious re-renders)
- [x] 4.3 Add `doUndo` / `doRedo` wrappers that call `INVALIDATE_ANALYSIS_PATCH` after temporal action
- [x] 4.4 Render Undo/Redo buttons in top row (visible on all tabs — placed before the tool group)
- [x] 4.5 Tooltip with shortcut text (`title="Undo (Ctrl+Z)"`, `title="Redo (Ctrl+Shift+Z / Ctrl+Y)"`)
- [x] 4.6 Disabled state when stack empty
- [x] 4.7 Add `editButtonStyle(enabled: boolean)` helper
- [x] 4.8 `npm run type-check` green
- [x] Commit: `feat(2dfea): add Undo/Redo toolbar buttons`

## Phase 5 — Keyboard shortcuts
- [x] 5.1 Open `src/hooks/useKeyboardShortcuts.ts`
- [x] 5.2 Subscribe to temporal store (undo, redo, pastLen, futureLen)
- [x] 5.3 Add Ctrl+Z / Cmd+Z handler (with `isEditingInput` + `commandInput.visible` guards)
- [x] 5.4 Add Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y / Cmd+Y redo handler (same guards)
- [x] 5.5 Wrappers invalidate analysis cache on each fire
- [x] 5.6 Update useEffect deps (undo/redo/pastLen/futureLen)
- [x] 5.7 `npm run type-check` green
- [x] Commit: `feat(2dfea): add Ctrl+Z/Y keyboard shortcuts for undo/redo`

## Phase 6 — Documentation & cleanup
- [x] 6.1 JSDoc on `useTemporalModelStore` (added in Phase 3 commit 9a642b5)
- [x] 6.2 Inline comment block above `temporal()` wrap explaining tracked-slice + invalidation policy (added in Phase 3 commit 9a642b5)
- [x] 6.3 INDEX.md entry already present (from existing untracked WIP — left untouched per instructions)
- [x] Phase 6 work was folded into Phase 3 commit; no separate docs commit required (per the round-2 plan, JSDoc/comments live alongside the code they document)

## Phase 7 — Verification
- [x] `npm run type-check` green (final) — zero errors
- [x] `npm run build` green (final) — bundle 617.37 kB (was 612.73 kB; +4.6 kB ≈ zundo + wiring)
- [x] `npm run dev` started cleanly at http://localhost:3000/ — Vite v5.4.21 ready in 236 ms, no startup errors
- [ ] (User) Manual QA against §8 Groups A–G via dev server — tracked below for reporting back
  - [ ] Group A — Basic undo/redo semantics
  - [ ] Group B — Cascading deletes
  - [ ] Group C — Selection / UI / view do NOT undo
  - [ ] Group D — Analysis invalidation on undo/redo
  - [ ] Group E — History bounds & equality
  - [ ] Group F — Persistence (history not persisted across reload)
  - [ ] Group G — Keyboard guards (input focus + command input)
- [x] Branch pushed to origin (see Phase 7 commit)
- [x] HAND OFF to user for manual QA — PR opens only on explicit "accept"

## Phase 8 — Post-accept
- [ ] `gh pr create` (rebase-merge, NOT squash)
- [ ] After merge: delete local + remote feature branch
- [ ] Verify GitHub Actions deploy green
- [ ] Verify https://magnusfjeldolsen.github.io/structural_tools/2dfea/ live and undo/redo works

## Hard constraints (from prompt)
- [ ] No `--no-verify` / no signing bypass
- [ ] No commit amends (new commits only)
- [ ] No direct push to master
- [ ] `@ts-nocheck` preserved on existing store files
- [ ] Transient/derived state (selection, hover, drag previews, solver, results) excluded from history
- [ ] Drag operations coalesce to ONE entry (handled by 100ms `handleSet` throttle)
- [ ] Keyboard shortcuts respect typing focus
