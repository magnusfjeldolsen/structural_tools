# Implementation Checklist — Snap to Element Projection (2dfea)

**Source plan:** [docs/plans/snap-to-element-projection.md](docs/plans/snap-to-element-projection.md)
**Plan commit:** `413bf37` (master)
**Branch:** `feature/2dfea-snap-to-element-projection`
**Date:** 2026-04-27
**Change class:** 2dfea-only (TypeScript / React / Konva + Vitest unit tests)
**Baseline status:** `npm run type-check` green, `npm test` green (8 files / 52 tests), `npm run build` green (627.72 kB raw / 184.25 KB gzipped index bundle)

---

## Project-specific guardrails

- [x] CLAUDE.md & DEPLOYMENT.md read; constraints noted
- [x] No new HTML files in this feature -> Google Analytics tag rule N/A
- [x] No worker / public/python changes -> relative-URL rule preserved
- [x] No vite.config.ts / tsconfig changes
- [x] `// @ts-nocheck` policy preserved on `useUIStore.ts` and `useModelStore.ts`
- [x] No PyNite version change; no analysis pipeline change
- [x] `snapTolerance` (10 px) MUST stay 10 — UX hover threshold, not precision threshold
- [x] Files explicitly NOT to stage: `.claude/agents/structural-feature-implementer.md`, `.claude/settings.local.json`, `2dfea/.claude/` (untracked agent config)

## Resolved design decisions (locked)

- [x] Tri-colour snap marker: blue `#3b82f6` (projection) / green `#22c55e` (connected) / amber `#f59e0b` (free-end)
- [x] Move command projects on BOTH base-point and endpoint clicks (lines 378 + 385)
- [x] Node classification: `(elementCount >= 2 || isSupported) ? 'connected' : 'free-end'`
- [x] `distanceToLineSegment` will be refactored to delegate to `projectOntoSegment` (single source of truth)
- [x] Shift-bypass uses window-level `keydown`/`keyup` listener writing to new `useUIStore.isShiftHeld` flag — Konva `mousemove` does not fire on key alone, so marker must respond to keyboard immediately

---

## Phase 1 — `projectOntoSegment` helper + unit tests

- [x] Add `projectOntoSegment(point, lineStart, lineEnd): Point` to `src/geometry/snapUtils.ts`
- [x] Refactor `distanceToLineSegment` to delegate to `projectOntoSegment` (DRY per plan §5.2 option (a))
- [x] Create `src/geometry/snapUtils.test.ts` covering the 9 cases in plan §8 ("Unit tests for projectOntoSegment")
  - [x] Interior projection
  - [x] Beyond start endpoint (clamp)
  - [x] Beyond end endpoint (clamp)
  - [x] Vertical segment
  - [x] Horizontal segment symmetry
  - [x] Diagonal segment perpendicular foot
  - [x] Zero-length segment (no division by zero)
  - [x] Tolerance test (load-bearing) — `L ∈ {0.1, 1, 10, 100, 1000}`, 50 random offsets each, perpendicular distance ≤ 1×10⁻¹³ m
  - [x] Determinism (same inputs → same output)
- [x] `npm run type-check` green
- [x] `npm test` green — 9 files / 65 tests (was 8/52, added 13 new)
- [x] Commit: `feat(2dfea): add projectOntoSegment helper with unit tests`

## Phase 2 — Extend `getSnappedPosition` signature

- [x] Extend `getSnappedPosition` signature with `hoveredElement: string | null = null`, `elements: Element[] = []`, `bypassElementProjection = false` (defaults preserve back-compat for any unmigrated callers)
- [x] Implement three-priority body: node-snap > element-projection > raw cursor
- [x] Add `classifyNode(nodeName, nodes, elements): 'connected' | 'free-end'` helper (sibling in snapUtils for Phase 4 consumption)
- [x] Add `NodeSnapState` type export
- [x] JSDoc on `getSnappedPosition` and `projectOntoSegment` (priority order, Shift contract, IEEE-754 vs PyNite tolerance margin)
- [x] Add `classifyNode` unit test (6 cases — exceeds the 5 in plan §7 Phase 4.2 by adding a missing-name fallback)
- [x] Add `getSnappedPosition` unit tests covering all three priority branches, Shift bypass, and back-compat 3-arg call
- [x] `npm run type-check` green
- [x] `npm test` green — 9 files / 79 tests
- [x] Commit: `feat(2dfea): extend getSnappedPosition with element-projection and shift-bypass`

## Phase 3 — Update 5 CanvasView call sites

- [x] Verify call sites with Grep — confirmed lines 378, 385, 543, 554, 579 (unchanged from plan)
- [x] Line 378 — Move base-point click: pass `hoveredElement, elements, isShiftPressed`
- [x] Line 385 — Move endpoint click: pass `hoveredElement, elements, isShiftPressed`
- [x] Line 543 — `draw-node` tool: pass `hoveredElement, elements, isShiftPressed`
- [x] Line 554 — `draw-element` first click (start node): pass `hoveredElement, elements, isShiftPressed`
- [x] Line 579 — `draw-element` second click (end node): pass `hoveredElement, elements, isShiftPressed`
- [x] `npm run type-check` green
- [x] `npm test` green — 79 tests still pass
- [x] Smoke-test deferred to Phase 6 manual QA (Group A/B/C/D) — geometry path is fully covered by getSnappedPosition unit tests in Phase 2
- [x] Commit: `feat(2dfea): wire element-projection snap into draw and move tools`

## Phase 4 — Visual snap marker (tri-state)

- [x] Add `isShiftHeld: boolean` and `setIsShiftHeld` to `useUIStore.ts` (next to existing snap fields, with explanatory comment)
- [x] Add window-level `keydown`/`keyup` listener in CanvasView `useEffect` updating `isShiftHeld` (with `blur` defensive reset, and cleanup on unmount)
- [x] Reuse `mouseWorldPos` (already tracked at line 47) for projection-foot rendering
- [x] Implement `renderSnapMarker()` — single `<Circle>` with stroke colour by state:
  - [x] State (a) blue `#3b82f6` — `hoveredElement && !hoveredNode && !isShiftHeld` — at projection foot
  - [x] State (b) green `#22c55e` — `hoveredNode && classifyNode === 'connected' && !isShiftHeld` — at node coords
  - [x] State (c) amber `#f59e0b` — `hoveredNode && classifyNode === 'free-end' && !isShiftHeld` — at node coords
  - [x] Marker geometry: hollow circle, radius 7, strokeWidth 1.5, listening false (no fill set -> transparent default)
  - [x] Suppress marker when `isShiftHeld` OR `!snapEnabled` OR no snap target
- [x] Insert `renderSnapMarker()` into Layer between `renderNodes()` and `renderElementAxes()` so the ring sits on top of node fills
- [x] Existing yellow node-hover ring (cyan #00FFFF) kept — the new tri-colour marker layers on top, giving a richer visual without removing established hover signal. Plan §5.5 leaves this as implementer's call; layered approach felt safer than removing the existing indicator.
- [x] `npm run type-check` green
- [x] `npm test` green — 79 tests
- [x] Smoke-test deferred to Phase 6 (Group E)
- [x] Commit: `feat(2dfea): add tri-colour snap marker (projection / connected / free-end)`

## Phase 5 — Polish + docs

- [x] JSDoc cross-references finalised (`@see docs/plans/snap-to-element-projection.md`) on `projectOntoSegment` and `getSnappedPosition` — included inline with Phase 1/2 commits
- [x] One-paragraph code comment near snap-marker block in CanvasView pointing readers at the plan and the Shift-bypass — included inline with Phase 4 commit
- [x] One-line in-code Shift hint — JSDoc on `getSnappedPosition` documents the contract, plus the comment on `renderSnapMarker` advertises "hold Shift to bypass"
- [x] No plan amendments needed — implementation followed the plan exactly. (One implementer's-call documented in Phase 4 checklist: layered the new tri-colour ring on top of the existing yellow node-hover ring rather than replacing it. Plan §5.5 explicitly leaves this choice to the implementer.)
- [x] `npm run type-check && npm test && npm run build` all green
- [x] Bundle size delta: **+0.41 KB gzipped** (184.66 KB vs 184.25 KB pre-feature) — under the 1 KB budget (goal #10)
- [x] No separate Phase-5 commit — JSDoc + code comments are already in the Phase 1/2/4 commits; an empty polish commit would violate the "every commit must be substantive" rule. Final checklist tick will be the closing commit.

## Phase 6 — Pre-handoff verification (manual QA Groups A–E)

**Automated gates (final, post Phase 4):**
- [x] `npm run type-check` — green (0 errors)
- [x] `npm test` — green (9 files / 79 tests; +27 new vs baseline)
- [x] `npm run build` — green (629.17 kB raw / 184.66 KB gzipped; delta +0.41 KB)
- [x] No console / TS / test warnings introduced

**Manual QA — handoff to user via Phase 7 Gate 1 (deferred for user run):**


- [ ] **Group A — Draw on element**
  - [ ] A1: Draw node mid-span on beam → lands exactly on the line; Full Analysis → moment diagram continuous across new node *(load-bearing end-to-end check)*
  - [ ] A2: Draw node near fixed end → lands on the line, not at cursor pixel
  - [ ] A3: Cursor past N2 → marker clamps to N2 or hides if too far
- [ ] **Group B — Draw element ending on element**
  - [ ] B4: `draw-element` second click on existing beam → endpoint lands on the beam (T-joint)
  - [ ] B5: Run Full Analysis on T-joint → both elements respond; PyNite reports sub-member split on parent beam
- [ ] **Group C — Shift escape**
  - [ ] C6: Shift + click on beam → node lands at cursor pixel (off-axis)
  - [ ] C7: Off-line node from C6 → PyNite reports `sub_members.length === 1` (no split — bypass genuine)
- [ ] **Group D — Move onto element**
  - [ ] D8: Move free node onto beam → moved node lands on line
  - [ ] D9: Move with Shift on endpoint click → lands at cursor pixel
- [ ] **Group E — Visual marker**
  - [ ] E10: Cursor on beam → blue marker at perpendicular foot
  - [ ] E10: Cursor on N1 (fixed support) → green marker
  - [ ] E10: Cursor on N2 (free, 1 element) → amber marker
  - [ ] E10: Free node N3 (no elements) → amber marker
  - [ ] E10: N3 with 2 elements connected → green marker
  - [ ] E11: Marker tracks perpendicular foot as cursor moves along beam
  - [ ] E13: Hold Shift while hovering beam → marker disappears
  - [ ] E14: Loads tab + Add point load + hover beam → marker still renders for visual consistency
- [ ] No console errors / React warnings in dev
- [ ] Final `npm run type-check`, `npm test`, `npm run build` — all green
- [ ] Push branch to origin

## Phase 7 — Gate 1 handoff

- [ ] Return summary to user with branch name, commits, dev URL, plan §8 Groups A–E to test
- [ ] STOP — wait for explicit `accept` before opening PR

## Phase 8 — PR & merge (Gate 2)

- [ ] After Gate 1 accept: `gh pr create --base master --head feature/2dfea-snap-to-element-projection ...`
- [ ] Return PR URL — STOP — wait for explicit `merge` confirmation
- [ ] After Gate 2 confirmation: `gh pr merge <num> --rebase --delete-branch`
- [ ] Confirm merge succeeded; switch back to master and pull
- [ ] Report deploy window (~1–2 min) and live URL: https://magnusfjeldolsen.github.io/structural_tools/2dfea/

---

## Bundle / size budget

- Pre-feature index bundle: 627.72 kB raw / 184.25 KB gzipped
- Goal #10: delta < 1 KB minified+gzipped
- Post-feature: TBD (record after Phase 5 build)

## Excluded files (working tree, never staged)

- `.claude/agents/structural-feature-implementer.md` (uncommitted agent definition edit)
- `.claude/settings.local.json` (local settings)
- `2dfea/.claude/` (local agent config — untracked)
