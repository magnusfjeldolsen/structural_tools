# Implementation Checklist — 2dfea Quick Wins Cleanup

**Source plan:** [docs/plans/2dfea-quick-wins-cleanup.md](docs/plans/2dfea-quick-wins-cleanup.md)
**Change class:** 2dfea-only
**Branch:** `feature/2dfea-quick-wins-cleanup`
**Started:** 2026-04-24
**Baseline (master @ a2ab38f):** `npm run type-check` ✅ pass · app verified manually at http://localhost:3000 ✅
**Status:** ✅ Complete — awaiting Phase 7 manual verification

---

## Steps (ship order: smallest/safest first)

### E4 — Bump `baseline-browser-mapping` dev dependency  · `d643fc8`

- [x] Run `npm i baseline-browser-mapping@latest -D` from `2dfea/`
- [x] Verify `2dfea/package.json` lists `baseline-browser-mapping` under `devDependencies` (^2.10.21)
- [x] Verify `2dfea/package-lock.json` updated
- [x] `npm run dev` log no longer contains "data is over two months old"
- [x] Commit: `chore(2dfea): pin baseline-browser-mapping@latest to silence stale-data warning`

### E2 — Update stale `test/worker-test.html` references  · `013833b`

- [x] `2dfea/serve.py` — updated docstring + startup print to `docs/archive/worker-test/worker-test.html`; added note pointing to `npm run dev` as primary flow
- [x] `2dfea/UNIT_CONVERSIONS.md` line 161 — offers both legacy path and Vite dev flow
- [x] `2dfea/src/analysis/README.md` line 186 — promotes `npm run dev` to primary, keeps serve.py as fallback
- [x] Grep check: no live-code hits for `test/worker-test.html` (remaining matches are in TODO/CHECKLIST/plan docs and the archive file itself — all acceptable)
- [x] Commit: `docs(2dfea): update stale worker-test.html references post-archive`

### E1 — Fix Vite `/public/workers/...` warning  · `c18b9a5`

- [x] Locate caller: `2dfea/src/analysis/solverInterface.ts:44`
- [x] Change Worker instantiation from `` new Worker(new URL('/workers/solverWorker.js', import.meta.url)) `` to `` new Worker(`${import.meta.env.BASE_URL}workers/solverWorker.js`) ``
- [x] **Scope expansion**: created `2dfea/src/vite-env.d.ts` with `/// <reference types="vite/client" />` (required for `import.meta.env` types; standard Vite scaffolding that was missing)
- [x] `npm run type-check` — passes
- [x] `npm run dev` — verified **all three** `/public/...` warnings (worker + 2 Python file fetches) are gone after the Worker constructor fix alone
- [x] Flagged **latent production bug** in commit message: the previous `new URL('/workers/...', import.meta.url)` form would strip the production base path `/structural_tools/2dfea/` and request at domain root — would 404 in prod
- [x] Commit: `fix(2dfea): use BASE_URL for worker path to silence Vite warnings`

### B1 — Wire `getActiveResults()` to `activeResultView`  · `7abc393`

- [x] Edit `2dfea/src/store/useModelStore.ts:945-959` — read `activeResultView.{type,name}` from `get()`, delegate to `getResultsForCase` / `getResultsForCombination`, fall back to `analysisResults` on no-selection or cache-miss
- [x] **Plan correction confirmed**: selection state was on `useModelStore.activeResultView`, not `useUIStore` as originally assumed. Fix is a local `get()` read — zero cross-store circular-dependency risk
- [x] `npm run type-check` — passes
- [x] Noted that no code currently consumes the store's `getActiveResults()` (CanvasView has its own local copy); this change aligns the exported interface with its declared contract
- [x] Commit: `fix(2dfea): wire getActiveResults() to activeResultView selection`

---

## Phase 6 — Pre-handoff verification  ✅

- [x] `cd 2dfea && npm run type-check` — green
- [x] `cd 2dfea && npm run build` — green (1.45s, one pre-existing >500kB chunk warning unrelated to our changes)
- [x] `cd 2dfea && npm run dev` log is completely clean (no worker-path warning, no baseline-browser-mapping warning)
- [x] No hardcoded `/public/...` paths in 2dfea source (verified by Grep)
- [x] No stale `test/worker-test.html` refs in live code (verified by Grep)
- [x] Zustand setters still typed (no store-action signatures touched)
- [x] `git diff master` review — only intended files changed

## Phase 7 — Manual user verification  ⏳ PENDING

Hand-off testing steps for the user:

1. Pull the feature branch, run `cd 2dfea && npm run dev`
2. Confirm dev server log is clean (no `public/...` or `baseline-browser-mapping` warnings)
3. Load http://localhost:3000 (or whichever port is free), confirm canvas loads and PyNite worker initialises (browser console "Worker initialized successfully")
4. Run the example cantilever analysis — verify results render correctly
5. Create multiple load cases, run Full Analysis, switch the "View Results" dropdown between cases — confirm the displaced shape / moment-shear-axial diagrams update (this exercises CanvasView's local `getActiveResults`; the store's version is dead code today but the fix ensures future callers behave correctly)
6. If all OK, reply **accept** — I will open the PR. Reply **reject** or describe issues to iterate.

## Phase 8 — PR & merge  ⏳ BLOCKED on Phase 7

- [ ] Push branch: `git push -u origin feature/2dfea-quick-wins-cleanup`
- [ ] `gh pr create --base master --head feature/2dfea-quick-wins-cleanup`
- [ ] Rebase-merge: `gh pr merge <num> --rebase --delete-branch`
- [ ] Confirm auto-deploy triggers (`deploy-2dfea.yml`) and live URL loads: https://magnusfjeldolsen.github.io/structural_tools/2dfea/
