# Implementation Checklist — Save / Load JSON for 2dfea

**Source plan:** [docs/plans/save-load-json.md](docs/plans/save-load-json.md)
**Forward-compat hardening reference:** commit `b7731ac` (master)
**Original plan commit:** `8fa6d52` (master)
**Branch:** `feature/2dfea-save-load-json`
**Date:** 2026-04-27
**Change class:** 2dfea-only (TypeScript / React / Vite + Vitest devDependency)
**Baseline status:** `npm run type-check` green, `npm run build` green (617.37 kB raw / 180.85 KB gzipped)

---

## Project-specific guardrails

- [x] CLAUDE.md & DEPLOYMENT.md read; constraints noted
- [ ] Keep `// @ts-nocheck` directives in `useModelStore.ts` and `useUIStore.ts` if present
- [ ] Reuse `TRACKED_KEYS` from `src/store/historyConfig.ts` (do not duplicate)
- [ ] Reuse `INVALIDATE_ANALYSIS_PATCH` from `src/store/historyConfig.ts` in `applyToStore`
- [ ] After import, call `useModelStore.temporal.getState().clear()`
- [ ] `loadExample` startup gate checks `localStorage.getItem('2dfea-model-storage')` for null/empty
- [ ] `metadata.appVersion = "unknown"` in v1.0.0 with grep-discoverable `// TODO(appVersion):` comment
- [ ] Confirm-before-overwrite via `window.confirm` (styled modal is a follow-up)
- [ ] Vitest: devDep only — zero production bundle impact
- [ ] Test files co-located as `<name>.test.ts` under `src/`
- [ ] `persist` middleware `partialize` extended to include `next*Number` ID counters and `comments`
- [ ] No hardcoded `/public/...` paths; Worker untouched
- [ ] No changes to `vite.config.ts` (production base path)
- [ ] No changes to `.github/workflows/`
- [ ] No changes to `2dfea/src/analysis/types.ts` (entity shapes stable)

---

## Phase 1 — Dependencies, primitives, and Vitest setup

(Plan §7 Phase 1; commits split per user spec into deps+utils and vitest setup)

### 1a — `feat(2dfea): add zod, zod-to-json-schema, canonicalStringify, schemaVersion`

- [x] `npm i zod zod-to-json-schema` — added to `dependencies`
- [x] `npm i -D tsx` — added to `devDependencies` (for `generate-schema` script)
- [x] Create `src/io/schemaVersion.ts` — `CURRENT_SCHEMA_VERSION = '1.0.0'` + `SchemaVersionError`
- [x] Create `src/io/canonicalStringify.ts` — sorted keys, trailing newline, JSDoc
- [x] `npm run type-check` green

### 1b — `chore(2dfea): add vitest test runner with sanity test`

- [x] `npm i -D vitest @vitest/ui jsdom` — added to `devDependencies`
- [x] Create `2dfea/vitest.config.ts` (jsdom, globals: false, `src/**/*.{test,spec}.{ts,tsx}`)
- [x] Add `test`, `test:watch`, `test:ui` scripts to `package.json`
- [x] Create `src/io/canonicalStringify.test.ts` (sanity test, 8 assertions)
- [x] `npm run type-check` green
- [x] `npm test` → 8 passing

---

## Phase 2 — Schema, migrations, semantic validator

(Plan §7 Phase 2; commit: `feat(2dfea): add v1 schema, migration plumbing, semantic validator`)

- [x] Create `src/io/schema.ts`
  - [x] `ModelFileV1Schema` mirrors §5.2; envelope strict, `metadata` `.passthrough()`
  - [x] `metadata.units` is `z.literal()`-pinned
  - [x] `model`, `model.loads`, `model.idCounters`, every entity object: `.passthrough()`
  - [x] `model.loads.catchall(z.array(z.unknown()))` for forward-compat thermal/etc
  - [x] `.finite()` on every numeric field
  - [x] Enum constraints for `support`, distributed `direction`, elementPoint `direction`
  - [x] Export `type ModelFileV1 = z.infer<typeof ModelFileV1Schema>`
  - [x] Helper `warnUnknownKeys()` emits one deduped `console.warn` per unknown key
- [x] Create `src/io/migrations.ts` — `MIGRATIONS` registry + `migrateToCurrent()` (identity v1)
- [x] Create `src/io/semanticValidator.ts` — orphan refs, dup IDs, missing cases, activeResultView
- [x] Create test file `src/io/schema.test.ts`
- [x] Create test file `src/io/migrations.test.ts`
- [x] Create test file `src/io/semanticValidator.test.ts`
- [ ] Create test file `src/io/forwardCompat.test.ts` (deferred to Phase 3; depends on `applyToStore` + `canonicalize`)
- [x] `npm run type-check` green
- [x] `npm test` green (Phase-2 tests passing — 31 assertions across 4 files including canonicalStringify)

---

## Phase 3 — Canonicalize / applyToStore / comments slice

(Plan §7 Phase 3; commit: `feat(2dfea): add canonicalize and applyToStore with temporal.clear`)

- [ ] Create `src/io/canonicalize.ts` — `modelStateToFile()`, unit-suffix mapping; `appVersion: "unknown"` with `// TODO(appVersion):` comment
- [ ] Create `src/io/applyToStore.ts` — uses `INVALIDATE_ANALYSIS_PATCH`; calls `temporal.getState().clear()`
- [ ] Modify `src/store/useModelStore.ts`:
  - [ ] Add `comments` to `ModelState` interface
  - [ ] Add `comments` to `initialState` (all empty)
  - [ ] Extend `persist` `partialize` to include `next*Number` counters + `comments`
  - [ ] Add `onRehydrateStorage` to backfill missing counters (Phase 3.5)
- [ ] Create test file `src/io/canonicalize.test.ts`
- [ ] Create test file `src/io/roundtrip.test.ts` (load-bearing — round-trip byte-identity)
- [ ] `npm run type-check` green
- [ ] `npm test` green

---

## Phase 4 — Export path & Toolbar Export button

(Plan §7 Phase 4; commit: `feat(2dfea): add Export JSON toolbar button and shortcut handler`)

- [ ] Create `src/io/exportImport.ts` — `exportCurrentModelToFile()`, `downloadJsonFile()`
- [ ] Create `src/io/index.ts` — barrel re-export
- [ ] Modify `src/components/Toolbar.tsx`:
  - [ ] Add "File" mini-group adjacent to Edit (Undo/Redo)
  - [ ] Export button with disabled state when model is empty
  - [ ] Visible on every tab
  - [ ] Tooltip: `Export model to JSON file (Ctrl+S)`
- [ ] `npm run type-check` green
- [ ] `npm run dev` smoke: cantilever loaded → click Export → file downloads → spot-check JSON shape

---

## Phase 5 — Import path, Toolbar Import button, Toast UX

(Plan §7 Phase 5; commit: `feat(2dfea): add Import JSON with confirm-before-overwrite and toast UX`)

- [ ] Add `promptUserForImport()` and `handleImportText()` to `src/io/exportImport.ts`
  - [ ] Gate 1: analysis-running confirm (`window.confirm`)
  - [ ] Gate 2: confirm-before-overwrite (`window.confirm`) when nodes/elements/loads non-empty
  - [ ] Validate: parse → version-check → migrate → Zod → semantic → apply
- [ ] Create `src/store/useToastStore.ts` — toast slice (queue / kind / message / auto-dismiss)
- [ ] Create `src/components/Toast.tsx` — top-right placement, 3-second auto-dismiss
- [ ] Mount `<Toast />` in `App.tsx`
- [ ] Modify `src/components/Toolbar.tsx` — add Import button, always enabled
- [ ] `npm run type-check` green
- [ ] `npm run dev` smoke: round-trip + corrupt-file + bad-version + orphan-ref scenarios

---

## Phase 6 — Keyboard shortcuts (Ctrl+S / Ctrl+O)

(Plan §7 Phase 6; commit: `feat(2dfea): add Ctrl+S/Ctrl+O shortcuts for export/import`)

- [ ] Modify `src/hooks/useKeyboardShortcuts.ts`:
  - [ ] Ctrl+S / Cmd+S → export, with `commandInput` + `isEditingInput` guards + `e.preventDefault()`
  - [ ] Ctrl+O / Cmd+O → import, same guard signature
  - [ ] Add to dependency array
- [ ] `npm run type-check` green
- [ ] `npm run dev` smoke: Ctrl+S downloads, Ctrl+O opens picker, guards work

---

## Phase 7 — `loadExample` startup gate

(Plan §7 Phase 7; commit: `feat(2dfea): gate loadExample to fire only when localStorage is empty`)

- [ ] Modify `src/App.tsx` — add startup `useEffect`:
  - [ ] Read `localStorage.getItem('2dfea-model-storage')` for null/empty
  - [ ] Only fire `loadExample()` if no persisted model AND store looks fresh
- [ ] `npm run type-check` green
- [ ] `npm run dev` smoke: clear localStorage → reload → cantilever; edit → reload → edits persist

---

## Phase 8 — Published JSON Schema (build-time)

(Plan §7 Phase 8; commit: `build(2dfea): publish JSON Schema document via prebuild script`)

- [ ] Create `src/io/generateJsonSchema.ts`
- [ ] Add scripts: `"generate-schema": "tsx src/io/generateJsonSchema.ts"`, `"prebuild": "npm run generate-schema"`
- [ ] Run `npm run generate-schema`
- [ ] Verify `public/schemas/2dfea-model-v1.json` written
- [ ] `npm run build` succeeds (prebuild fires)
- [ ] Confirm `dist/schemas/2dfea-model-v1.json` is included

---

## Phase 9 — Bundle-size verification

(Plan §7 Phase 9; no commit unless dynamic-import refactor needed)

- [ ] `npm run build` after all changes; record bundle size delta
- [ ] If > 15 KB gzipped over baseline (180.85 KB): switch import path to dynamic import
- [ ] Confirm Vitest is devDep only (no runtime contribution)

---

## Phase 10 — Documentation, fixture, INDEX update

(Plan §7 Phase 10; commit: `docs(2dfea): add file-format.md and v1 cantilever fixture`)

- [ ] Create `docs/file-format.md` — schema overview, unit policy, versioning, AI-prompt notes
- [ ] Create `docs/examples/cantilever-v1.json` — canonical fixture
- [ ] (INDEX.md already lists save-load-json — verify entry exists)

---

## Phase 11 — Pre-handoff verification & final commit

- [ ] `npm run type-check` green (final)
- [ ] `npm run build` green (final)
- [ ] `npm test` green (final, all suites)
- [ ] Manual smoke matrix executed (§8 Groups A–G results recorded below)
- [ ] Update `IMPLEMENTATION_CHECKLIST.md` ticking all items
- [ ] Final commit: `chore(2dfea): finalize save/load implementation checklist`
- [ ] Push branch: `git push -u origin feature/2dfea-save-load-json`

---

## §8 Manual Smoke Matrix — to be filled during Phase 11

### Group A — Basic export
- [ ] A1: Cantilever → Export JSON → file downloads with timestamped name; pretty-printed; sorted keys; trailing newline; `schemaVersion: "1.0.0"`; `metadata.units`; `x_m`/`y_m`/`E_GPa`/`I_m4`/`A_m2`
- [ ] A2: Empty model → Export button disabled
- [ ] A3: Larger model → all entities round-trip with unit-suffixed names

### Group B — Basic import
- [ ] B4: Export → Clear Model → Import → cantilever restored; toast "Model imported successfully."; Undo disabled
- [ ] B5: Edit `metadata.name`/`description` in file → reimport → loads OK
- [ ] B6: Edit `_comments.nodes.N1` in file → reimport → comment in store; re-export preserves it

### Group C — Round-trip determinism
- [ ] C7: export → import → export → diff only differs on `metadata.exportedAt`
- [ ] C8: edit `metadata.name` → reimport → re-export → name persists

### Group D — Validation failures
- [ ] D9: malformed JSON → toast "Could not parse file: …"; store unchanged
- [ ] D10: `schemaVersion: "9.9.9"` → toast "Unsupported schema version 9.9.9"; store unchanged
- [ ] D11: orphan `nodeI: "N99"` → toast "Element E1 references missing node 'N99'"; store unchanged
- [ ] D12: numeric field set to string → Zod-style toast; console full errors; store unchanged
- [ ] D13: `metadata.units.length: "mm"` → invalid-literal toast; store unchanged

### Group E — Keyboard shortcuts
- [ ] E14: empty model + Ctrl+S → no native Save Page As (preventDefault); export disabled
- [ ] E15: Ctrl+O → picker; cancel → no-op
- [ ] E16: Ctrl+S while focused in cell editor → no export
- [ ] E17: Ctrl+S while CAD command input visible → no export

### Group F — Persistence interaction
- [ ] F18: cantilever → reload → cantilever persists
- [ ] F19: cantilever → reload → Ctrl+Z is no-op
- [ ] F20: ID-counter regression — add 50 nodes, delete N1–N49, reload, add new node → **N51** (not N1)
- [ ] F21: backwards-compat — manually set `localStorage` to old shape (no counters) → reload → app does not crash; counters re-derived

### Group G — `loadExample` startup gate
- [ ] G22: clear localStorage → reload → cantilever auto-loads
- [ ] G23: edit cantilever → reload → edits persist (cantilever does NOT reload)
- [ ] G24: click Toolbar "Load Example" → cantilever overwrites edits (manual override)

---

## Pre-handoff verification (Gate 1)

- [ ] No new console errors / warnings in dev
- [ ] All `npm` gates green
- [ ] `next*Number` counter regression (F20) resolved
- [ ] `loadExample` gating works (G22–G24)
- [ ] Branch pushed to origin
- [ ] Awaiting user `accept` to proceed to Phase 8 PR open

## Gate 2 — PR merge

- [ ] PR opened via `gh pr create --base master --head feature/2dfea-save-load-json`
- [ ] Awaiting user `merge` / `ship it` confirmation
- [ ] Final: `gh pr merge <num> --rebase --delete-branch`
