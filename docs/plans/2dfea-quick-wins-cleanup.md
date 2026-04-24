# 2dfea Quick Wins Cleanup

## 1. TL;DR

A single tidy-up pass on the 2dfea React/TypeScript app, bundling the four smallest items at the top of `2dfea/TODO.md` into one coherent PR: silence Vite's `/public/workers/...` worker-path warning, purge three stale `test/worker-test.html` references, wire `useModelStore.getActiveResults()` to the already-existing `activeResultView` selection state, and bump the transitive `baseline-browser-mapping` dev dependency to silence its "data is over two months old" warning. All changes live entirely inside `2dfea/` — no plain HTML modules are touched and deployment behaviour is unchanged.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4 + Konva.
- **Change triggers deploy**: Yes. Any change in `2dfea/**` triggers `.github/workflows/deploy-2dfea.yml`. Expected deploy time 2–3 minutes.
- **Why now**: Cleanup ahead of larger feature work (steel section library A1, materials A2, undo/redo D1). Do the near-free fixes first while they are fresh and before unrelated work touches the same files.
- **Ordering rationale**: Smallest/safest first, so a breakage in a later step never blocks an earlier fix.
  - E4 (dep bump) → E2 (doc text) → E1 (one-line worker fix) → B1 (store wiring, the largest behavioural change).
- **Key assumptions**:
  - The prompt's reference to `useUIStore.selectedResultType` / `selectedResultName` is a misnomer for the fields that actually exist on `useModelStore`: `activeResultView.type` and `activeResultView.name`. Verified by `Grep`:
    - `2dfea/src/store/useModelStore.ts:67` declares `activeResultView: { type: 'case' | 'combination'; name: string | null }`.
    - `useUIStore.ts` does not contain either `selectedResultType`, `selectedResultName`, or `activeResultView`.
    - `CanvasView.tsx:183` already contains a working local copy of `getActiveResults()` that reads `activeResultView` from `useModelStore`.
  - Because the source-of-truth for result selection already lives inside `useModelStore` itself, there is **no cross-store circular-dependency risk** — the fix is a local `get().activeResultView` read.
  - `2dfea/docs/archive/worker-test/worker-test.html` (the archived copy) is not part of the dev flow and its internal `../public/workers/solverWorker.js` reference is out-of-scope for E1.
  - `baseline-browser-mapping` is currently only a **transitive** dep (2.8.20) pulled through `browserslist`. Adding it as a direct `-D` dep effectively pins it to the newest version until `browserslist` catches up.
- **Open questions**: None; all four items are well-scoped.

## 3. Goals (Definition of Done)

Every item below must be verifiable post-merge:

1. `cd 2dfea && npm run dev` logs **no** `Files in the public directory are served at the root path` warning about `solverWorker.js`.
2. `cd 2dfea && npm run dev` logs **no** `baseline-browser-mapping` / `browserslist` "data is over two months old" warning.
3. `cd 2dfea && npm run type-check` passes with zero errors after all four changes.
4. `cd 2dfea && npm run build` succeeds.
5. After running `Full Analysis`, selecting a different item in the "View Results" dropdown (case or combination) **visibly** re-renders the displaced shape and moment/shear/axial diagrams on the canvas. In other words, `useModelStore.getActiveResults()` returns results for `activeResultView` instead of always returning the most recent `analysisResults`.
6. When `activeResultView.name` is `null` or points at a case/combination not in `resultsCache`, `getActiveResults()` still returns `analysisResults` (fallback preserved — users who never touch the dropdown see no regression).
7. No file in the repo references `test/worker-test.html` (verified by `Grep`). The archived copy at `2dfea/docs/archive/worker-test/worker-test.html` may still exist; only references from live `serve.py`, `UNIT_CONVERSIONS.md`, and `src/analysis/README.md` must be updated or removed.
8. The solver worker still boots correctly in both dev (`npm run dev` → http://localhost:3000) and in the production build (`npm run build && npm run preview`) — Pyodide initialises, analysis runs, results render.
9. The GitHub Actions deploy workflow completes successfully on push to `master`; `https://magnusfjeldolsen.github.io/structural_tools/2dfea/` loads, solver worker 200s, a simple cantilever example can be analysed and visualised.

## 4. Non-Goals

- Do **not** rework `CanvasView.tsx`'s five local `getActiveResults()` call-sites. They already work. Swapping them over to the store's new implementation is out of scope for this PR (follow-up refactor).
- Do **not** add `selectedResultType` / `selectedResultName` fields to `useUIStore`. The equivalent state already exists on `useModelStore.activeResultView` — creating a second source of truth is worse than using the one we have.
- Do **not** delete or move `2dfea/docs/archive/worker-test/worker-test.html`. It is archived documentation; its internal `../public/workers/...` path is not live code.
- Do **not** touch `serve.py`'s CORS/COOP headers or port. Only the doctring and print statement change.
- Do **not** run `npm audit fix` (that is a separate item, E3, deferred).
- Do **not** migrate from classic worker to module worker. Out of scope.
- Do **not** modify `.github/workflows/deploy-2dfea.yml`.

## 5. Architecture & Design

### Where each fix lives

| Sub-task | File | Scope |
|----------|------|-------|
| E4 | `2dfea/package.json`, `2dfea/package-lock.json` | devDependency |
| E2 | `2dfea/serve.py`, `2dfea/UNIT_CONVERSIONS.md`, `2dfea/src/analysis/README.md` | text only |
| E1 | `2dfea/src/analysis/solverInterface.ts` (line 44) | one-line code change |
| B1 | `2dfea/src/store/useModelStore.ts` (lines 945–950) | ~15-line store method rewrite |

### E1 — the actual cause of the warning

Current line (`solverInterface.ts:44`):

```ts
this.worker = new Worker(new URL('/workers/solverWorker.js', import.meta.url));
```

Vite's worker plugin intercepts `new Worker(new URL(...))` expressions. When the URL argument is a **root-absolute path** starting with `/`, Vite resolves it against the project's `public/` directory (since that's what root-absolute means in Vite), and emits the internal reference `/public/workers/solverWorker.js?worker_file&type=classic` — hence the warning. The file in `public/` is served *without* the `/public/` prefix at runtime, so it still works, but Vite nags.

Two valid fixes. We pick **Fix A** because it preserves the existing file location (`public/workers/solverWorker.js`) and requires no config change:

- **Fix A (chosen)**: drop the `new URL(..., import.meta.url)` wrapper — for files in `public/`, a plain string path is the canonical Vite idiom. Assets in `public/` are served at root, so `'/workers/solverWorker.js'` is the correct runtime URL in both dev and in the `base: '/structural_tools/2dfea/'` production build (Vite does **not** rewrite URLs in strings passed to `new Worker()`; but `public/` assets are already emitted at the base path, so the browser will hit `https://magnusfjeldolsen.github.io/structural_tools/2dfea/workers/solverWorker.js` as expected). Production deployment has been working with this relative file layout for months — this change simply stops asking Vite's worker plugin to intercept it.
- **Fix B (rejected)**: move the worker into `src/`, import with `?worker&url` suffix. Cleaner long-term but bigger diff, churns the Python-fetch path inside the worker, risks breaking GitHub Pages. Not worth it for a quick win.

**Post-fix line**:

```ts
this.worker = new Worker('/workers/solverWorker.js');
```

Note: production base path. In production, Vite serves `public/` at `base`, so `/workers/solverWorker.js` is effectively `/structural_tools/2dfea/workers/solverWorker.js`. For the string-form `new Worker('/workers/...')`, the browser resolves the path against the page's origin — **not** against the Vite base. This has historically worked on GitHub Pages because the page URL already begins with `/structural_tools/2dfea/` and relative paths resolve correctly. To be fully safe across base paths, use `import.meta.env.BASE_URL`:

```ts
this.worker = new Worker(`${import.meta.env.BASE_URL}workers/solverWorker.js`);
```

`BASE_URL` is `'/'` in dev and `'/structural_tools/2dfea/'` in production, always ending with a trailing slash. This is the **final chosen form** — it is warning-free, works in both environments, and survives any future base-path change.

### B1 — `getActiveResults()` rewrite

`activeResultView` is already a field on `useModelStore` state (`useModelStore.ts:67`), updated by `setActiveResultView()` and bound to the Results dropdown in `ResultsSelector.tsx`. The rewrite simply mirrors the existing `CanvasView.tsx:183` local helper into the store method, so any future caller of the store's `getActiveResults()` gets the selection-aware behaviour without duplicating logic:

```ts
getActiveResults: () => {
  const state = get();
  const { type, name } = state.activeResultView;

  if (name) {
    const cached = type === 'case'
      ? state.resultsCache.caseResults[name]
      : state.resultsCache.combinationResults[name];
    if (cached) return cached;
    // Selection exists but no cached results — fall through to analysisResults
  }

  return state.analysisResults;
},
```

**No UI refactor** — `CanvasView.tsx`'s local helper is left alone. The store method becomes consistent with the local helper, and future call sites (Properties Panel, Reactions table, etc.) can use the store method without duplicating the fallback logic.

**Dependency direction**: `useModelStore.getActiveResults` reads only from `useModelStore` state. **Zero cross-store imports**. `useUIStore` is untouched.

### E4 — dependency bump

Transitive `baseline-browser-mapping` (2.8.20) is pulled in via `browserslist`. `npm i baseline-browser-mapping@latest -D` elevates it to a direct devDependency and updates to the newest version, which resets the internal "data freshness" timestamp. Because it is used only at dev-time by browserslist to produce the compatible-baseline set, there is **zero runtime impact**.

### E2 — textual updates

Three files reference the old `test/worker-test.html` path. `2dfea/test/` no longer exists. Decision per file, based on what a reader would expect the text to do:

| File | Change | Reason |
|------|--------|--------|
| `2dfea/serve.py` | Replace `Worker Test` URL section with a note that `npm run dev` is the canonical flow; keep `serve.py` itself as a static fallback for hand-testing public/ assets | `serve.py` is still useful for serving the raw public/ tree without Vite, but the specific test page is gone. Recommend users run `npm run dev` from docstring and print output. |
| `2dfea/UNIT_CONVERSIONS.md` | Replace the browser-integration test URL with the `npm run dev` instruction pointing to http://localhost:3000 | `npm run dev` is the modern flow; the worker-test page no longer exists. |
| `2dfea/src/analysis/README.md` | Replace the `http://localhost:8000/test/worker-test.html` integration-test snippet with `npm run dev` + http://localhost:3000 | Same rationale. Also update the ASCII architecture diagram at line 28 which says `Web Worker (public/workers/solverWorker.js)` — keep as-is (it is accurate, public/ is the source location). |

## 6. Files to Touch

| File Path | Action | Purpose |
|-----------|--------|---------|
| `c:\Python\structural_tools\2dfea\package.json` | Modify | Add `baseline-browser-mapping` to `devDependencies` (E4) |
| `c:\Python\structural_tools\2dfea\package-lock.json` | Modify (auto, via `npm i`) | Lockfile update for E4 |
| `c:\Python\structural_tools\2dfea\serve.py` | Modify | Update docstring (line ~9) and print statement (line ~56) to remove worker-test.html reference (E2) |
| `c:\Python\structural_tools\2dfea\UNIT_CONVERSIONS.md` | Modify | Replace worker-test.html reference at line ~161 with `npm run dev` (E2) |
| `c:\Python\structural_tools\2dfea\src\analysis\README.md` | Modify | Replace worker-test.html reference at line ~186 with `npm run dev` (E2) |
| `c:\Python\structural_tools\2dfea\src\analysis\solverInterface.ts` | Modify | Change line 44 worker instantiation to use `${import.meta.env.BASE_URL}workers/solverWorker.js` (E1) |
| `c:\Python\structural_tools\2dfea\src\store\useModelStore.ts` | Modify | Rewrite `getActiveResults` body at lines 945–950 to read `activeResultView` (B1) |
| `c:\Python\structural_tools\docs\plans\2dfea-quick-wins-cleanup.md` | Create | This plan file |
| `c:\Python\structural_tools\docs\plans\INDEX.md` | Create | Plan index with intro + one entry |

No changes to:
- Any plain HTML module.
- `.github/workflows/deploy-2dfea.yml`.
- `2dfea/vite.config.ts`.
- `2dfea/tsconfig.json`.
- `2dfea/public/workers/solverWorker.js` itself (the worker file is correct; only its caller is wrong).
- `2dfea/docs/archive/**`.
- `2dfea/src/store/useUIStore.ts`.
- Any other component (`CanvasView.tsx` keeps its local `getActiveResults`).

## 7. Step-by-Step Implementation Instructions

**Order: E4 → E2 → E1 → B1** (smallest/safest first).

### Step 1 — E4: Bump `baseline-browser-mapping`

1. From the repo root, run:
   ```bash
   cd 2dfea
   npm i baseline-browser-mapping@latest -D
   ```
2. Verify `2dfea/package.json` now has a `devDependencies."baseline-browser-mapping"` entry.
3. Verify `2dfea/package-lock.json` still contains a single resolved version under `node_modules/baseline-browser-mapping` (no duplicate tree).
4. Run `npm run dev`. Confirm **no** `Update the data` or `Browserslist: caniuse-lite is outdated` warning appears. If browserslist still warns (possible, it tracks `caniuse-lite` separately), ignore — E4 is specifically about `baseline-browser-mapping` per the TODO. Stop dev server (`Ctrl+C`).
5. Expected outcome: fresh `baseline-browser-mapping` devDependency; no stale-data warning for that package.

### Step 2 — E2a: Update `serve.py`

1. Open `c:\Python\structural_tools\2dfea\serve.py`.
2. In the module docstring (lines 1–10), replace:
   ```python
   """
   Simple HTTP server for testing 2dfea worker
   Serves from the 2dfea directory root

   Usage:
       python serve.py

   Then open: http://localhost:8000/test/worker-test.html
   """
   ```
   with:
   ```python
   """
   Simple HTTP server for serving the 2dfea public/ tree without Vite.

   Note: the canonical dev flow is `npm run dev` (Vite at http://localhost:3000).
   This script is a fallback for hand-testing static assets under public/
   (e.g. Python files, worker script) without the Vite middleware.

   Usage:
       python serve.py
   """
   ```
3. In the `if __name__ == '__main__':` block (lines 49–60), replace:
   ```python
       print(f"\nTest URLs:")
       print(f"  Worker Test: http://localhost:{PORT}/test/worker-test.html")
   ```
   with:
   ```python
       print(f"\nFor the full 2dfea dev experience, use `npm run dev` instead.")
   ```
4. Save. No behaviour change — only text.

### Step 3 — E2b: Update `UNIT_CONVERSIONS.md`

1. Open `c:\Python\structural_tools\2dfea\UNIT_CONVERSIONS.md`.
2. Locate the "Browser Integration Test" section (around line 160). Replace:
   ```
   ### Browser Integration Test:
   1. Open `http://localhost:8000/test/worker-test.html`
   2. Run analysis
   3. Check results show values in mm, kN, kNm
   4. Verify no `×1000` or `÷1000` in display code
   ```
   with:
   ```
   ### Browser Integration Test:
   1. Run `npm run dev` from the `2dfea/` directory.
   2. Open http://localhost:3000 and load the cantilever example.
   3. Run Analysis and confirm displayed values are in mm, kN, kNm.
   4. Verify no `×1000` or `÷1000` in display code.
   ```
3. Save.

### Step 4 — E2c: Update `src/analysis/README.md`

1. Open `c:\Python\structural_tools\2dfea\src\analysis\README.md`.
2. Locate the integration-test block (around line 180):
   ```
   Run the integration test:
   ```bash
   # Start dev server
   python serve.py

   # Open in browser
   http://localhost:8000/test/worker-test.html
   ```
   ```
3. Replace with:
   ```
   Run the integration test:
   ```bash
   # Start Vite dev server
   npm run dev

   # Open in browser
   http://localhost:3000
   ```
   ```
4. Save.
5. `Grep` final check from repo root:
   ```bash
   grep -rn "test/worker-test.html" 2dfea/ --exclude-dir=node_modules --exclude-dir=docs
   ```
   Expected: **zero matches** (matches in `2dfea/docs/archive/worker-test/worker-test.html` are acceptable; matches in `TODO.md` will disappear once this item is struck off there, out-of-scope for this PR).

### Step 5 — E1: Fix worker instantiation

1. Open `c:\Python\structural_tools\2dfea\src\analysis\solverInterface.ts`.
2. On **line 44**, replace:
   ```ts
           this.worker = new Worker(new URL('/workers/solverWorker.js', import.meta.url));
   ```
   with:
   ```ts
           // Use BASE_URL so this works in dev ("/") and in production ("/structural_tools/2dfea/").
           // Plain string avoids Vite's `new URL(..., import.meta.url)` worker-plugin interception
           // that emitted the "/public/workers/..." warning. The solverWorker.js file lives in
           // public/ and is served at the site's base path automatically by Vite.
           this.worker = new Worker(`${import.meta.env.BASE_URL}workers/solverWorker.js`);
   ```
3. Save.
4. From `2dfea/`, run:
   ```bash
   npm run type-check
   ```
   Expected: no errors. `import.meta.env.BASE_URL` is a standard Vite-typed property.
5. Run `npm run dev`. Expected:
   - **No** `Files in the public directory are served at the root path. Instead of /public/workers/solverWorker.js…` warning.
   - Solver initialises (console log `[SolverInterface] Worker initialized successfully`).
6. Load the cantilever example (button on toolbar) and click "Run Analysis". Confirm results appear.
7. Stop dev server.
8. Run `npm run build && npm run preview`. Confirm:
   - Build completes with no errors.
   - `preview` serves the app at http://localhost:4173/ (or Vite's default preview port).
   - Worker still loads and analyses run in the built version.

### Step 6 — B1: Wire `getActiveResults()` to `activeResultView`

1. Open `c:\Python\structural_tools\2dfea\src\store\useModelStore.ts`.
2. Navigate to lines 945–950 (the current `getActiveResults` block).
3. Replace the entire method body:
   ```ts
           getActiveResults: () => {
             // This will be called by UI components that manage selectedResultType and selectedResultName
             // For now, return the current analysisResults for backward compatibility
             // TODO: Integrate with UI store to get selectedResultType and selectedResultName
             return get().analysisResults;
           },
   ```
   with:
   ```ts
           getActiveResults: () => {
             const state = get();
             const { type, name } = state.activeResultView;

             // If the user has selected a specific case/combination in the Results dropdown,
             // look it up in resultsCache.
             if (name) {
               const cached =
                 type === 'case'
                   ? state.resultsCache.caseResults[name]
                   : state.resultsCache.combinationResults[name];
               if (cached) return cached;
               // Selection exists but cache miss — fall through to the most recent analysisResults
               // so users never see an empty diagram just because the cache hasn't been populated
               // (e.g. after a fresh model edit that invalidated resultsCache but not analysisResults).
             }

             // Default: return the most recent analysisResults. Preserves pre-existing behaviour for
             // users who never touch the Results dropdown.
             return state.analysisResults;
           },
   ```
4. Save.
5. From `2dfea/`, run `npm run type-check`. Expected: zero errors. `activeResultView`, `resultsCache.caseResults`, `resultsCache.combinationResults`, and `analysisResults` are all already declared on the `ModelState` interface (lines 67, 78, 76 of this same file).
6. Run `npm run dev`. Manual test (per Manual QA in §8):
   - Load cantilever example.
   - Add a second load case (e.g. "Live") and a nodal load on it.
   - Click "Run Full Analysis" (so both cases populate `resultsCache.caseResults`).
   - Enable "Show Moment Diagram" on the toolbar.
   - In the Results dropdown, toggle between "Dead" and "Live" — the moment diagram must visibly change.
7. Run `npm run build`. Expected: successful build.

### Step 7 — Commit

Commit as **one** git commit (per user preference — this is a bundled PR):

```bash
git add 2dfea/package.json 2dfea/package-lock.json 2dfea/serve.py 2dfea/UNIT_CONVERSIONS.md 2dfea/src/analysis/README.md 2dfea/src/analysis/solverInterface.ts 2dfea/src/store/useModelStore.ts docs/plans/2dfea-quick-wins-cleanup.md docs/plans/INDEX.md
```

Suggested commit message (HEREDOC):

```
2dfea quick-wins cleanup

- E4: bump baseline-browser-mapping to silence browserslist data-freshness warning
- E2: drop stale test/worker-test.html refs from serve.py, UNIT_CONVERSIONS.md, src/analysis/README.md
- E1: use import.meta.env.BASE_URL for solver worker path to silence Vite /public/ warning
- B1: wire useModelStore.getActiveResults() to activeResultView so the Results
      dropdown actually drives displayed diagrams
```

Push to `master`. Watch the workflow at https://github.com/magnusfjeldolsen/structural_tools/actions.

## 8. Test & Verification Plan

### Automated gates (must all pass)

| Gate | Command (from `2dfea/`) | Passes when |
|------|-------------------------|-------------|
| Type check | `npm run type-check` | Zero TS errors |
| Dev server boot | `npm run dev` | Server starts, no `public/workers/solverWorker.js` warning, no `baseline-browser-mapping` stale warning |
| Production build | `npm run build` | `dist/` produced, exit code 0 |
| Production preview | `npm run preview` | Preview loads app, worker initialises |
| CI deploy | GitHub Actions `Deploy 2D FEM to GitHub Pages` | Workflow green, gh-pages branch updated |

### Manual QA checklist (http://localhost:3000 after `npm run dev`)

1. Open browser DevTools console. Confirm no Vite warning about `/public/workers/...`.
2. Load cantilever example via toolbar button. Verify nodes N1, N2 and element E1 render.
3. Click "Run Analysis". Moment/shear/axial diagrams available in toolbar toggles. No console errors.
4. Add a new load case "Live" (Loads tab → add case). Add a nodal `Fy = -5 kN` at N2 for case "Live".
5. Click "Run Full Analysis". In ResultsSelector, verify both "[✓] Dead" and "[✓] Live" appear in the dropdown.
6. Enable "Show Moment Diagram".
7. **Key test for B1**: In the Results dropdown, switch between "Dead" and "Live". The moment diagram's magnitude **must visibly change** on the canvas (Live is half the load, so moment should be half).
8. Switch View Results type from "Load Cases" to "Combinations" — if no combinations defined, "-- Select combination --" appears; diagrams should then fall back to the most-recent `analysisResults` (no blank canvas).
9. Add a combination (e.g. "ULS = 1.35·Dead + 1.5·Live"), re-run Full Analysis, and confirm the combination can be selected and its results render.

### Edge cases to sanity-check

| Case | Expected |
|------|----------|
| User loads cantilever, runs single analysis (not full), never opens Results dropdown | `getActiveResults()` returns `analysisResults` (fallback). Diagrams render. |
| User selects a case/combo in dropdown that has no cached results (e.g. added after Full Analysis) | `getActiveResults()` falls through to `analysisResults`. ResultsSelector shows the `⚠️ No results available` warning banner (already implemented). Canvas still shows the most recent analysis. |
| User clears model (`clearModel`) | `analysisResults === null`, `resultsCache` cleared. `getActiveResults()` returns `null`. Canvas clears diagrams. |
| Worker fails to initialise (e.g. Pyodide 404 on GitHub Pages) | Unchanged behaviour — E1 only changes how the worker URL is built, not the failure path. Error surfaces via `SolverInterface.initialize()` reject. |
| Production base path | `import.meta.env.BASE_URL === '/structural_tools/2dfea/'` → worker URL is `/structural_tools/2dfea/workers/solverWorker.js`. Matches existing gh-pages layout. |

### `Grep` final-check commands (run before push)

```bash
# From repo root
grep -rn "test/worker-test.html" 2dfea/ --exclude-dir=node_modules --exclude-dir=docs
# expected: no output (only docs/archive/ retains the string, which is excluded)

grep -rn "new URL(" 2dfea/src/analysis/solverInterface.ts
# expected: no output (the old pattern is gone)

grep -n "baseline-browser-mapping" 2dfea/package.json
# expected: one line under "devDependencies"
```

### Deployment verification

1. Push commit. Wait ~2–3 minutes.
2. Open https://github.com/magnusfjeldolsen/structural_tools/actions and confirm the `Deploy 2D FEM to GitHub Pages` run is green.
3. Hard-refresh https://magnusfjeldolsen.github.io/structural_tools/2dfea/ (Ctrl+Shift+R) to bypass cache.
4. DevTools → Network tab: confirm `workers/solverWorker.js` returns **200** at `/structural_tools/2dfea/workers/solverWorker.js`.
5. Run the cantilever example in production. Confirm analysis succeeds and Results dropdown drives the diagrams as in step 7 of manual QA.

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `import.meta.env.BASE_URL` path resolves differently in production than `new URL(..., import.meta.url)` did, breaking the worker on GitHub Pages | Low | High (solver dead) | Verify in `npm run preview` locally before pushing. Rollback plan: `git revert` and re-push, gh-pages rebuilds in 2–3 min. |
| TypeScript unhappy with `import.meta.env.BASE_URL` | Very low | Low | Vite's own `vite/client` types cover this. `tsconfig.json` already includes Vite. `npm run type-check` catches it before push. |
| `baseline-browser-mapping@latest` introduces a transitive-version mismatch with `browserslist` | Very low | Low | dev-only dep, no runtime impact. If `npm install` warns about peer mismatch, pin to a version compatible with `browserslist@4.27.0` (which wants `^2.8.19`). |
| B1 changes return value for a caller we missed, silently breaking results rendering | Low | Medium | Only call site outside the store is `CanvasView.tsx:183`, which defines and uses its own local `getActiveResults` (not the store method). Grep (`getActiveResults` search) confirmed the store method has zero external consumers today. |
| User's existing bookmarked dev URL (http://localhost:8000/test/worker-test.html) 404s | Already true | Cosmetic | E2 explicitly directs readers to `npm run dev` + http://localhost:3000 in the three places they'd look. |
| GitHub Pages cache serves old assets for 1–2 min after deploy | Expected | Low | Hard refresh (Ctrl+Shift+R). Call out in rollout notes. |

## 10. Rollout & Deployment

- **Branch strategy**: Single commit direct to `master`. This is a tidy-up, not a feature; no review needed per user's solo-maintainer workflow. (If a PR is preferred, branch `cleanup/2dfea-quick-wins`, open PR, merge.)
- **Deployment trigger**: Push to `master` touching `2dfea/**` auto-runs `.github/workflows/deploy-2dfea.yml`. Expected 2–3 minutes to go live.
- **Plain-HTML-module impact**: None. Plain HTML modules are untouched.
- **Cache**: GitHub Pages may serve stale assets for 1–2 min post-deploy. Hard refresh to verify.
- **Rollback**: single-commit revert —
  ```bash
  git revert <commit-sha>
  git push origin master
  ```
  Deploy workflow re-runs and restores previous state in 2–3 min. No data migration risk (no user-facing data format changed).
- **Migration notes for users**: None. `getActiveResults` had only one external caller which is not using the store method. Everyone else sees exactly the old behaviour unless they choose a specific item in the Results dropdown.

## 11. Observability & DX

- **Inline comments**: Step 5 adds a three-line comment above the `new Worker(...)` call explaining *why* we use `BASE_URL` over the `new URL(..., import.meta.url)` pattern. Step 6 adds a comment explaining the fallback chain and why it exists.
- **No README updates beyond E2**: the three touched docs are the READMEs for this app.
- **No module registry changes**: no new public module/module landing-page entry.
- **No new error messages**: all changes are silent/transparent to end users.
- **Realistic usage example**: the cantilever example already in `useModelStore.loadExample()` is the regression test for B1. No new fixture needed.

## 12. Success Metrics

Post-merge the plan is successful when:

1. `npm run dev` log is clean — no worker-path warning, no browserslist-data-age warning.
2. `npm run type-check` green.
3. GitHub Actions deploy run green.
4. On https://magnusfjeldolsen.github.io/structural_tools/2dfea/, switching the Results dropdown between defined cases visibly changes on-canvas moment/shear/axial/displaced-shape diagrams.
5. Running Grep for `test/worker-test.html` in `2dfea/` (excluding `node_modules` and `docs`) returns nothing.
6. No regression reports of the solver failing to initialise (console log `[SolverInterface] Worker initialized successfully` continues to fire).
7. Strike-through of items E1, E2, B1, E4 in `2dfea/TODO.md` (manual edit by user, out of scope of this plan).
