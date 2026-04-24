# Implementation Checklist — 2dfea Quick Wins Cleanup

**Source plan:** [docs/plans/2dfea-quick-wins-cleanup.md](docs/plans/2dfea-quick-wins-cleanup.md)
**Change class:** 2dfea-only
**Branch:** `feature/2dfea-quick-wins-cleanup`
**Started:** 2026-04-24
**Baseline (master @ a2ab38f):** `npm run type-check` ✅ pass · app verified manually at http://localhost:3000 ✅

---

## Steps (ship order: smallest/safest first)

### E4 — Bump `baseline-browser-mapping` dev dependency

- [ ] Run `npm i baseline-browser-mapping@latest -D` from `2dfea/`
- [ ] Verify `2dfea/package.json` now lists `baseline-browser-mapping` under `devDependencies`
- [ ] Verify `2dfea/package-lock.json` is updated
- [ ] Run `cd 2dfea && npm run dev` — confirm the "data in this module is over two months old" warning is **gone**
- [ ] Commit: `chore(2dfea): pin baseline-browser-mapping@latest to silence stale-data warning`

### E2 — Update stale `test/worker-test.html` references (3 files)

- [ ] Update `2dfea/serve.py` lines 9 and 56 — replace `test/worker-test.html` with `docs/archive/worker-test/worker-test.html` (or remove if no longer recommended)
- [ ] Update `2dfea/UNIT_CONVERSIONS.md` line ~161 — same treatment
- [ ] Update `2dfea/src/analysis/README.md` line ~186 — same treatment
- [ ] Grep check: `grep -rn "test/worker-test.html" 2dfea/ docs/ .claude/` returns zero live-code hits (archived file's own contents may match — that's fine)
- [ ] Commit: `docs(2dfea): update stale worker-test.html references post-archive`

### E1 — Fix Vite `/public/workers/...` warning

- [ ] Locate the caller that uses `/public/workers/solverWorker.js` (plan points at `2dfea/src/analysis/solverInterface.ts:44`)
- [ ] Change Worker instantiation to use `` new Worker(`${import.meta.env.BASE_URL}workers/solverWorker.js`) `` per plan
- [ ] `cd 2dfea && npm run type-check` — must pass
- [ ] `cd 2dfea && npm run dev` — verify warning is **gone** from the log
- [ ] Manual: run a small analysis to confirm the worker still boots and returns results
- [ ] Commit: `fix(2dfea): use BASE_URL for worker path to silence Vite warning`

### B1 — Wire `getActiveResults()` to `activeResultView`

- [ ] Edit `2dfea/src/store/useModelStore.ts:945-950`: read `activeResultView.{type,name}` from `get()`, call `getResultsForCase(name)` or `getResultsForCombination(name)` accordingly, fall back to `analysisResults` when no selection or cache miss
- [ ] `cd 2dfea && npm run type-check` — must pass
- [ ] Manual: run Full Analysis, then change the Results dropdown selection — displaced shape and M/V/N diagrams must **visibly** re-render for the new selection
- [ ] Manual: verify fallback — a fresh model with analysisResults but no `activeResultView.name` still shows results (no regression)
- [ ] Commit: `fix(2dfea): wire getActiveResults() to activeResultView selection`

---

## Phase 6 — Pre-handoff verification (before push)

- [ ] `cd 2dfea && npm run type-check` — green
- [ ] `cd 2dfea && npm run build` — green
- [ ] `cd 2dfea && npm run dev` log is clean (no worker-path warning, no baseline-browser-mapping warning)
- [ ] No hardcoded `/public/...` paths remain in 2dfea source
- [ ] No stale `test/worker-test.html` refs remain (final grep)
- [ ] Zustand setters still typed
- [ ] Only intended files changed (review `git diff master`)

## Phase 7 — Manual user verification

- [ ] Push branch: `git push -u origin feature/2dfea-quick-wins-cleanup`
- [ ] Request user acceptance before PR — do **not** open PR without explicit "accept"

## Phase 8 — PR & merge (only on user accept)

- [ ] `gh pr create --base master --head feature/2dfea-quick-wins-cleanup`
- [ ] Rebase-merge: `gh pr merge <num> --rebase --delete-branch`
- [ ] Confirm auto-deploy triggers (`deploy-2dfea.yml`) and live URL loads: https://magnusfjeldolsen.github.io/structural_tools/2dfea/
