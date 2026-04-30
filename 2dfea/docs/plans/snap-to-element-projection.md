# 2dfea Snap to Element Projection

## 1. TL;DR

Fix the snap-to-element gap in 2dfea: today the on-canvas hover ring on an element is **purely visual** — clicking lands the new node at the raw cursor pixel, NOT on the line, leaving the node up to ~10 cm off the element's axis. PyNite's `PhysMember.descritize()` (which auto-splits a physical member at intermediate nodes detected on its axis) only fires inside a `1e-12 * (1 + L)` perpendicular tolerance, so off-axis "snapped" nodes never trigger sub-member splitting and the resulting analysis loses the T-joint connection. The fix is the standard CAD "Nearest" snap pattern: keep the loose ~10 px **UI hover tolerance**, but on click **mathematically project the cursor onto the hovered element** and use the projected point as the placement coordinates. Existing math in `distanceToLineSegment` already computes the projection — extract it, plumb `hoveredElement` + `elements` into `getSnappedPosition`, update the five call sites in `CanvasView.tsx`, render a small visual marker at the projection foot, and add a `Shift`-to-bypass escape hatch. Pure logic; bundle delta < 1 KB; no PyNite, schema, or store changes.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4.4 + Immer + Konva. Triggers `.github/workflows/deploy-all-modules.yml` on push to `master`/`main` touching `2dfea/**`. No plain HTML modules touched.
- **Source of truth for the feature**: a verified investigation summary the planner was given. The verbatim problem statement, repeated here as the load-bearing context for §5:

  > When a user is drawing a node and their cursor is hovering an existing element (line), the new node lands at the **cursor pixel**, NOT on the line. The "snap" is only a visual hover indicator — geometry isn't actually projected. As a consequence, PyNite's `PhysMember.descritize()` (which auto-splits physical members at intermediate nodes detected on the member axis) never fires, because the node sits up to ~10 cm off-axis instead of within PyNite's `1e-12 * (1 + L)` tolerance.

- **Verified code locations** (re-read by the planner before drafting; line numbers exact at the time of writing):
  - `2dfea/src/geometry/snapUtils.ts:16-28` — `getSnappedPosition()` only snaps to `hoveredNode`. When `hoveredNode` is null, raw `worldPos` is returned. **`hoveredElement` is never consulted.** This is the exact location of the bug.
  - `2dfea/src/geometry/snapUtils.ts:100-129` — `distanceToLineSegment()` already computes the parametric projection (`t` clamped to `[0, 1]`, then `projectionX/Y`). The projection math is the math the fix needs; the only question is how to expose it (refactor vs sibling helper — see §5).
  - `2dfea/src/components/CanvasView.tsx:980-984` (Structure tab) and `2dfea/src/components/CanvasView.tsx:938-942` (Loads tab during load creation) — hover detection IS aware of elements via `findNearestElement` + `setHoveredElement`. So `hoveredElement` is correctly populated during mouse-move; the plan only needs to USE it on click.
  - **Five call sites of `getSnappedPosition` that need updating**, all in `CanvasView.tsx`:
    | Line | Context | Today |
    |------|---------|-------|
    | 378 | Move command — base point click | `getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes)` |
    | 385 | Move command — endpoint click (executes the move) | same |
    | 543 | `draw-node` tool — places a free node at click | same |
    | 554 | `draw-element` first click (start node) | same |
    | 579 | `draw-element` second click (end node) | same |
  - `2dfea/src/store/useUIStore.ts:300` — `snapTolerance: 10` (pixels). This is the **UI hover-detection** threshold. **It must NOT be tightened** as part of this fix — that would defeat the snap UX. Element projection is independent of the threshold (see §5 tolerance arithmetic).
  - `2dfea/src/components/CanvasView.tsx:373` — `const isShiftPressed = e.evt.shiftKey` is already read inside the click handler; the Shift-escape wiring (§5) is therefore mechanical.
  - `2dfea/src/components/CanvasView.tsx:128-129` — `hoveredNode` and `hoveredElement` are both already pulled from `useUIStore`. The selectors needed by the new visual marker are already in scope.
- **Vitest is in scope today**: `2dfea/vitest.config.ts` exists and `package.json` exposes `npm test` (= `vitest run`) and `npm run test:watch`. Existing tests under `2dfea/src/io/*.test.ts` (six files) prove the runner is wired. Adding `2dfea/src/geometry/snapUtils.test.ts` is therefore a one-file change with zero infrastructure cost.
- **PyNite version**: PyNite 2.0.2 is the version `2dfea/python/setup_pynite_env.py` installs. `PhysMember.descritize()` already does the right thing once geometry is exact — **no PyNite-side change is required or planned**.
- **Tolerance arithmetic** (re-derived in §5; summarised here so the gap is crisp):
  - UI hover tolerance: `snapTolerance / view.scale` = `10 / 50` = **0.2 m world** at the default 50 px/m view scale; at a typical zoomed-in ~100 px/m view that's ~0.1 m. Either way, ~10⁻¹ m of perpendicular slop.
  - PyNite descritize tolerance: `1e-12 * (1 + L)` perpendicular distance. For L = 4 m, ~5×10⁻¹² m (5 picometers).
  - **Gap: ~10–11 orders of magnitude.** Threshold-tightening alone cannot bridge this without making snap unusable.
  - IEEE-754 noise from a single projection step (`t = (...)/lengthSquared`; `projX = startX + t*dx`): ~1e-15 relative, ~4e-15 m absolute for L = 4 m. **Three orders of magnitude tighter than PyNite's tolerance** — safe.
- **Resolved design decisions** (locked in by the user during plan review, 2026-04-30):
  1. **Visual snap-marker — three colour states** distinguishing what the click will resolve to: (a) a *new* point on an element (projection), (b) an *existing connected* node (≥2 elements OR has a support), (c) an *existing free-end* node (≤1 element AND no support). All three render with the same shape and size; only the stroke colour differs. Implementer picks final hues during Phase 4 — recommendations in §5.5.
  2. **Move-command projection scope — project BOTH base point and endpoint.** Symmetric with the rest of the plan; matches CAD osnap convention (AutoCAD-style); user retains control via Shift-bypass on either click.
  3. **`distanceToLineSegment` refactor vs sibling helper**. The plan recommends extracting a sibling helper `projectOntoSegment(point, lineStart, lineEnd): Point` and **also** refactoring `distanceToLineSegment` to call it (DRY, single source of truth for the projection math). See §5.2 for the side-by-side.

## 3. Goals (Definition of Done)

Each goal is observable and must be verifiable post-merge.

1. Drawing a node on or near an existing element places the node at the **exact mathematical projection** onto the line. Verifiable via the inspector / a unit test asserting perpendicular distance ≤ 1×10⁻¹³ m for any L between 0.1 m and 1000 m.
2. Drawing the second endpoint of an element while hovering an existing element places the new endpoint **on** that element. (Critical: this is how T-joints are drawn naturally.)
3. After dropping a node mid-span on a beam and running Full Analysis, PyNite reports the new node as part of the beam's physical-member sub-members (verifiable via `solver.model.members[<name>].sub_members.length > 1`). The diagrams across the T-joint should be **continuous** (no discontinuity at the projected node) — this is the visible end-to-end success criterion.
4. Holding `Shift` during click bypasses element-projection (raw cursor coords used). Documented in tooltip / on-screen hint.
5. The `snapTolerance` UI value remains **10 px** (unchanged) — UX hover detection unchanged.
6. A visual snap marker is shown whenever the cursor would resolve to a snap target. It renders in **three distinct colour states** so the user can see at a glance what the click will do: (a) new point on an element (projection), (b) existing connected node (junction or supported), (c) existing free-end node. Hidden when Shift is held (bypass active) and when no snap target is in range.
7. The Move command projects on **both** base-point click AND endpoint click, with Shift-bypass available on each. Snap markers render on both hover stages.
8. Existing snap-to-node behaviour is unaffected — node-snap continues to take priority when both a node and an element are nearby (matches existing logic at `CanvasView.tsx:980-984`).
9. `cd 2dfea && npm run type-check` and `cd 2dfea && npm test` pass with **zero** failures, including new tests for `projectOntoSegment`.
10. `cd 2dfea && npm run build` is green and the bundle delta is **< 1 KB minified+gzipped** (essentially zero — pure logic, no new deps). Verified via the `npm run build` size report.
11. Manual QA matrix in §8 — groups A through E — all pass.
12. No console errors or React warnings in dev or preview.

## 4. Non-Goals

Explicitly out of scope for this plan:

- **No PyNite-side change.** PyNite 2.0.2 already does the right thing once geometry is exact.
- **No `snapTolerance` tuning.** It is a UI value; element projection is independent of it.
- **No data-model change.** An `Element` stays a single entity with two endpoint nodes. A new mid-span node simply sits on the element; PyNite handles the split on solve via `descritize()`. No new entity types, no schema bump.
- **No new snap targets.** Midpoint, perpendicular foot from another point, intersection of two elements, parallel snap, extension, tangent — all are follow-up features. v1 is **element-projection only**.
- **No automatic re-projection of existing off-line nodes.** No "auto-heal nodes that are 0.1 mm off a beam" sweep. Only the click-time placement is changed; existing models with off-line nodes (saved via the JSON import/export feature) keep those coordinates.
- **No change to load placement on elements.** `addElementPointLoad` and `addDistributedLoad` use **parametric distance along the element** (line 425, 449, 462 of `CanvasView.tsx`), not world coordinates, so they're already exact. The element-snap visual marker IS allowed to render in load-creation mode (see goal #6) but the load mutation path is untouched.
- **No undo/redo coupling.** The fix is purely placement-time geometry. Each placed node still produces exactly one history entry via the existing `zundo` plumbing; the Shift escape is not a separate action type.
- **No change to `vite.config.ts`, `tsconfig.json`, the deploy workflow, the GA tag, or any plain HTML module.**

## 5. Architecture & Design

### 5.1 Where the fix lives

Two files do the actual work:

```
2dfea/src/geometry/snapUtils.ts      ← extract projectOntoSegment + extend getSnappedPosition signature
2dfea/src/components/CanvasView.tsx  ← update 5 call sites + render snap marker
```

One new file holds the unit tests:

```
2dfea/src/geometry/snapUtils.test.ts ← new
```

The plumbing is otherwise untouched. The store, the worker, the solver, the schema, and the deploy workflow are all unchanged.

### 5.2 The extracted helper — `projectOntoSegment`

Add a sibling helper to `snapUtils.ts` and **refactor `distanceToLineSegment` to call it** (DRY). Single source of truth for the parametric projection math.

Recommended signature:

```ts
/**
 * Project a point onto a line segment, clamped to the segment's [0, 1] parametric range.
 * Returns the closest point on the segment to the input point.
 * If the segment is degenerate (zero length), returns lineStart.
 *
 * IEEE-754 noise: ~4e-15 m absolute for L = 4 m (relative ~1e-15). Three orders of magnitude
 * tighter than PyNite's PhysMember.descritize tolerance of 1e-12 * (1 + L). Safe for any L.
 */
export function projectOntoSegment(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): Point {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return { x: lineStart.x, y: lineStart.y };

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared
    )
  );

  return {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
}
```

`distanceToLineSegment` then becomes:

```ts
export function distanceToLineSegment(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  return distance(point, projectOntoSegment(point, lineStart, lineEnd));
}
```

#### Refactor vs sibling-only — side-by-side

| Option | Code shape | Pros | Cons | Verdict |
|--------|-----------|------|------|---------|
| (a) **Sibling helper + refactor `distanceToLineSegment` to delegate** | `projectOntoSegment` is the canonical math; `distanceToLineSegment` is a thin wrapper. | Single source of truth; one place to fix any bug; tests on `projectOntoSegment` automatically cover the projection used by `distanceToLineSegment`. | Touches an existing function — mild risk if a caller relied on a numerical quirk (none does; verified by `Grep` of `findNearestElement` as the only caller inside `snapUtils.ts`, and `findNearestElement` is itself only called from CanvasView hover code). | **Chosen.** |
| (b) Sibling helper only; leave `distanceToLineSegment` duplicated | `projectOntoSegment` lives next to `distanceToLineSegment`; both compute the same `t/projection`. | Zero risk to existing function. | Two copies of the projection math; if the formula ever changes (e.g. weighted distance), both must be updated — drift hazard. | Rejected. |

### 5.3 Extended `getSnappedPosition` signature

Extend the existing function (don't introduce a parallel one). New signature:

```ts
/**
 * Returns the snapped click coordinates given the current cursor position and hover state.
 *
 * Priority order:
 *   1. If a node is hovered → return that node's exact coords (existing behaviour).
 *   2. Else if an element is hovered AND `bypassElementProjection` is false →
 *      project the cursor onto the element's axis (clamped to the segment's [0, 1] range)
 *      and return the projection foot.
 *   3. Else → return the raw cursor coords (existing fallback).
 *
 * Holding Shift at click time is the documented escape hatch: callers pass the keydown
 * shiftKey value as `bypassElementProjection`.
 */
export function getSnappedPosition(
  worldPos: Point,
  hoveredNode: string | null,
  nodes: Node[],
  hoveredElement: string | null = null,
  elements: Element[] = [],
  bypassElementProjection = false
): Point {
  // 1. Node snap — exact node coords win
  if (hoveredNode) {
    const node = nodes.find((n) => n.name === hoveredNode);
    if (node) return { x: node.x, y: node.y };
  }

  // 2. Element-projection snap — only when no node is hovered and not bypassed
  if (hoveredElement && !bypassElementProjection) {
    const element = elements.find((e) => e.name === hoveredElement);
    if (element) {
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (nodeI && nodeJ) {
        return projectOntoSegment(
          worldPos,
          { x: nodeI.x, y: nodeI.y },
          { x: nodeJ.x, y: nodeJ.y }
        );
      }
    }
  }

  // 3. Raw cursor — fallback
  return worldPos;
}
```

The new parameters default to backwards-compatible values, so any caller that doesn't update gracefully degrades to the old behaviour. (No callers will be left in this state — all five are migrated in Phase 3.)

### 5.4 Tie-breaking when multiple elements overlap

When the cursor is at a point where two elements meet but **no node is exactly there**, `findNearestElement` (`snapUtils.ts:64-91`) already returns the element with the smallest perpendicular distance. The projection then uses that one. This is the existing behaviour and is preserved unchanged. Document the tie-break rule in the JSDoc on `getSnappedPosition` so a future reader doesn't wonder.

### 5.5 Visual snap marker — three colour states

Render a single Konva `<Circle>` whose **stroke colour** depends on the snap target. Same shape, same size — only the colour varies. This gives the user at-a-glance feedback about what their click will do, before they commit to it.

**The three states**:

| State | Trigger condition | Meaning to user | Recommended stroke (final pick = implementer) |
|-------|-------------------|-----------------|----------------------------------------------|
| **(a) Element projection** | `hoveredElement && !hoveredNode` | Click creates a *new* node on the line at the perpendicular foot. PyNite will auto-split the physical member at this point. | `#3b82f6` (Tailwind blue-500) — "creation" cue |
| **(b) Connected node** | `hoveredNode` AND that node has ≥2 elements attached OR a support (`free` is the only non-supported state in `Node.support`) | Click reuses an existing junction; nothing new is created. | `#22c55e` (Tailwind green-500) — "established / safe" cue |
| **(c) Free-end node** | `hoveredNode` AND that node has ≤1 element attached AND `support === 'free'` | Click reuses a free-end node — possibly a dangling node the user forgot about. Worth visually flagging. | `#f59e0b` (Tailwind amber-500) — "caution / dangling" cue |

The `hoveredNode` case (b/c) replaces or augments the existing yellow hover ring (`#facc15`-ish). Implementer's call whether to **replace** the existing yellow ring or **render alongside** it; the cleaner UX is to replace — one indicator per snap, colour-coded.

**Determining the connected/free-end state**:

```ts
function classifyNode(nodeName: string, nodes: Node[], elements: Element[]): 'connected' | 'free-end' {
  const node = nodes.find(n => n.name === nodeName);
  if (!node) return 'free-end';
  const elementCount = elements.filter(e => e.nodeI === nodeName || e.nodeJ === nodeName).length;
  const isSupported = node.support !== 'free';
  return (elementCount >= 2 || isSupported) ? 'connected' : 'free-end';
}
```

This is O(n_elements) per hover update — negligible for any realistic model. Compute once per mousemove inside the existing snap-detection block.

**Marker geometry (same for all three states)**:

| Property | Value | Rationale |
|----------|-------|-----------|
| Shape | Hollow circle | Doesn't obscure the underlying node/line |
| Radius | 7 px | Slightly larger than typical node-hover indicators |
| Stroke width | 1.5 px | Visible without being heavy |
| Fill | `transparent` | Hollow keeps geometry legible |
| Listening | `false` | Must not steal hover events |

Position:
- State (a): the projection of the cursor onto the hovered element (via `projectOntoSegment`).
- States (b)/(c): the exact node coordinates.

**Suppression rules**:

- **Shift held** → marker hidden in all three states (bypass active; user gets raw cursor).
- **No snap target** → no marker.
- **`!snapEnabled`** → no marker (existing global snap toggle).

Shift detection: window-level `keydown`/`keyup` listener writing to a `useUIStore.isShiftHeld` flag, since Konva `mousemove` only fires when the cursor moves and we want the marker to disappear immediately on `Shift` press without cursor motion.

### 5.6 Shift-escape — bypass plumbing

The click handler at `CanvasView.tsx:373` already reads `const isShiftPressed = e.evt.shiftKey`. Threading it into `getSnappedPosition` is one extra argument:

```ts
const snappedPos = getSnappedPosition(
  { x: worldX, y: worldY },
  hoveredNode,
  nodes,
  hoveredElement,
  elements,
  isShiftPressed   // bypassElementProjection
);
```

All five call sites get the same final argument. The Move-command call sites (lines 378 + 385) re-use the same `isShiftPressed` variable defined at line 373 — no extra read needed.

**Tooltip / on-screen hint** for the Shift escape: add a single tooltip on the snap marker (`title` attribute on the wrapping `<Group>` if Konva supports it, or a hovering `<Text>` rendered next to the marker on prolonged hover). Minimum bar: a one-line note in the existing canvas help text and the `README.md` quick-reference. Final UX choice deferred; goal #4 only requires "documented".

### 5.7 Why this passes PyNite's tolerance

| Quantity | Value (typical L = 4 m) | Order of magnitude |
|----------|------------------------|--------------------|
| UI hover tolerance (world) | ~0.1–0.2 m | 10⁻¹ |
| PyNite `descritize` tolerance | `1e-12 * (1 + 4)` = 5×10⁻¹² m | 10⁻¹² |
| **Gap before fix** | ~10⁰⁻¹¹ orders | 10⁻¹⁰ |
| IEEE-754 noise on `t * dx + lineStart.x` for L = 4 m | ~4×10⁻¹⁵ m | 10⁻¹⁵ |
| **Margin after fix** | ~10³ tighter than PyNite tolerance | 10⁻³ |

For L = 1000 m: PyNite tolerance is ~10⁻⁹ m; projection noise is ~10⁻¹² m — still ~10³ tighter. Verified by the §8 randomised-tolerance unit test.

### 5.8 What is NOT changing (deliberate)

- The store shape (`useUIStore`, `useModelStore`).
- The worker, the solver, the Pyodide setup.
- The schema or persistence format.
- The `findNearestElement` function (already returns the right element).
- The `findNearestNode` function (node priority is unchanged).
- The deploy workflow.

If the implementer finds themselves editing any of those files, that is a strong signal that scope has crept and the change should be reviewed.

## 6. Files to Touch

| File Path | Action | Purpose |
|-----------|--------|---------|
| `c:\Python\structural_tools\2dfea\src\geometry\snapUtils.ts` | Modify | Add `projectOntoSegment`. Refactor `distanceToLineSegment` to delegate. Extend `getSnappedPosition` signature with `hoveredElement`, `elements`, `bypassElementProjection` (defaults preserved). |
| `c:\Python\structural_tools\2dfea\src\geometry\snapUtils.test.ts` | Create | Vitest tests for `projectOntoSegment` (interior, beyond-endpoint clamp, vertical/horizontal symmetry, zero-length, randomised tolerance ≤ 1e-13 m). |
| `c:\Python\structural_tools\2dfea\src\components\CanvasView.tsx` | Modify | Update **five** call sites of `getSnappedPosition` (lines 378, 385, 543, 554, 579) to pass `hoveredElement`, `elements`, `isShiftPressed`. Render the new snap marker in the canvas overlay group. Optional: add a window-level `keydown`/`keyup` listener to track Shift state for marker suppression. |
| `c:\Python\structural_tools\2dfea\docs\plans\snap-to-element-projection.md` | Create | This plan. |
| `c:\Python\structural_tools\2dfea\docs\plans\INDEX.md` | Modify | Append one-line entry pointing at the new plan. |

No changes needed in:

- `2dfea/src/store/useUIStore.ts` — `snapTolerance` stays 10 px; no new fields.
- `2dfea/src/store/useModelStore.ts` — model shape unchanged.
- `2dfea/python/*` — no PyNite changes.
- `2dfea/public/workers/*` — solver flow unchanged.
- `2dfea/vite.config.ts`, `2dfea/package.json` — no new deps; no new build step.
- `.github/workflows/deploy-all-modules.yml` — deployment flow unchanged.
- Any plain HTML module — untouched.
- The Google Analytics tag — no new HTML files.

## 7. Step-by-Step Implementation Phases

Each phase is independently compilable and type-checks. Run `cd 2dfea && npm run type-check` after each phase. Run `cd 2dfea && npm test` after Phase 1 and again after Phase 5.

### Phase 1 — Add `projectOntoSegment` helper + unit tests (no consumer yet)

1.1 Open `2dfea/src/geometry/snapUtils.ts`. Add `projectOntoSegment` between `findNearestElement` and `distanceToLineSegment` (group: nearest-X helpers, then math primitives).

1.2 Refactor `distanceToLineSegment` to call `projectOntoSegment`:

```ts
export function distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
  return distance(point, projectOntoSegment(point, lineStart, lineEnd));
}
```

1.3 Create `2dfea/src/geometry/snapUtils.test.ts`. Add the test cases listed in §8 ("Unit tests for `projectOntoSegment`"). Use the existing Vitest setup (`vitest.config.ts` is already wired; example imports under `2dfea/src/io/*.test.ts`).

1.4 Run `cd 2dfea && npm run type-check` — green.
1.5 Run `cd 2dfea && npm test` — all new tests pass; existing tests unaffected.

**Verification**: `projectOntoSegment` exists and is tested; `distanceToLineSegment` still returns the same numbers as before for all callers (covered by the refactored function + existing CanvasView hover behaviour, which is exercised in Phase 3 manual smoke).

### Phase 2 — Extend `getSnappedPosition` signature

2.1 Update the `getSnappedPosition` signature in `snapUtils.ts` per §5.3, with defaults preserved (`hoveredElement = null`, `elements = []`, `bypassElementProjection = false`).

2.2 Implement the three-priority body per §5.3.

2.3 Add a JSDoc block above the function explaining the priority order, the Shift-bypass contract, and the IEEE-754 vs PyNite tolerance margin (link to §5.7 of this plan in a `@see` comment).

2.4 Run `cd 2dfea && npm run type-check` — green. (The five call sites in `CanvasView.tsx` are still passing the old 3-arg call; the new params take their defaults; no behavioural change yet.)

**Verification**: a node-snap-only scenario in dev (`npm run dev`, hover a node, click) still works exactly as before. Element hover hasn't been wired to the click yet, so element clicks still land at the cursor pixel — that's expected at this phase boundary.

### Phase 3 — Update the five `CanvasView.tsx` call sites

3.1 Open `2dfea/src/components/CanvasView.tsx`. The five call sites are at lines 378, 385, 543, 554, 579 (verified by `Grep` at the time of writing).

3.2 At each call site, append the three new arguments. Example for line 543 (`draw-node` tool):

```ts
const snappedPos = getSnappedPosition(
  { x: worldX, y: worldY },
  hoveredNode,
  nodes,
  hoveredElement,
  elements,
  isShiftPressed
);
```

3.3 The Move-command sites (378, 385) re-use `isShiftPressed` already defined at line 373. The two `draw-element` sites (554, 579) re-use the same variable; the `draw-node` site (543) likewise.

3.4 Run `cd 2dfea && npm run type-check` — green.

3.5 Smoke-test in dev: load Example, hover an element, click. The new node lands on the line. Hover an element with Shift held; click. The new node lands at the cursor pixel (bypass works). Hover a node; click. Existing node-snap works (node priority preserved).

**Verification**: goals #1, #2, #4, #7, #8 are now satisfied geometrically; goal #6 (visual marker) is the next phase.

### Phase 4 — Visual snap marker (tri-state)

4.1 In `CanvasView.tsx`, locate the existing render block where node-hover indicators are drawn (search for `hoveredNode === node.name` and the surrounding Konva `<Circle>`).

4.2 Implement the `classifyNode` helper from §5.5 (in `snapUtils.ts` next to the other geometry helpers, since the snap-marker rendering needs it):

```ts
export type NodeSnapState = 'connected' | 'free-end';

export function classifyNode(
  nodeName: string,
  nodes: Node[],
  elements: Element[]
): NodeSnapState {
  const node = nodes.find(n => n.name === nodeName);
  if (!node) return 'free-end';
  const elementCount = elements.filter(
    e => e.nodeI === nodeName || e.nodeJ === nodeName
  ).length;
  const isSupported = node.support !== 'free';
  return (elementCount >= 2 || isSupported) ? 'connected' : 'free-end';
}
```

Add a unit test for `classifyNode` covering: free node + no elements → `free-end`; free node + 1 element → `free-end`; free node + 2 elements → `connected`; supported node + 0 elements → `connected`; supported node + 1 element → `connected`.

4.3 Just below the existing node-hover indicator block, add a sibling block that renders a `<Circle>` whose colour depends on the snap state. Suppress when Shift is held.

```tsx
{!isShiftHeld && (() => {
  // State (a): element projection — new point on a line
  if (hoveredElement && !hoveredNode) {
    const element = elements.find((e) => e.name === hoveredElement);
    if (!element) return null;
    const nodeI = nodes.find((n) => n.name === element.nodeI);
    const nodeJ = nodes.find((n) => n.name === element.nodeJ);
    if (!nodeI || !nodeJ || !cursorWorldPos) return null;
    const proj = projectOntoSegment(
      cursorWorldPos,
      { x: nodeI.x, y: nodeI.y },
      { x: nodeJ.x, y: nodeJ.y }
    );
    const [px, py] = toScreen(proj.x, proj.y);
    return (
      <Circle x={px} y={py} radius={7} stroke="#3b82f6" strokeWidth={1.5} listening={false} />
    );
  }
  // States (b)/(c): snap target is an existing node
  if (hoveredNode) {
    const node = nodes.find((n) => n.name === hoveredNode);
    if (!node) return null;
    const state = classifyNode(hoveredNode, nodes, elements);
    const stroke = state === 'connected' ? '#22c55e' : '#f59e0b';
    const [px, py] = toScreen(node.x, node.y);
    return (
      <Circle x={px} y={py} radius={7} stroke={stroke} strokeWidth={1.5} listening={false} />
    );
  }
  return null;
})()}
```

(`cursorWorldPos` may need to be tracked; if it's not already in scope, capture it in the existing `mousemove` handler — same place that calls `findNearestElement`. Alternative: read the latest pointer position from the Konva stage on render.)

4.4 Decide whether to **replace** the existing yellow node-hover ring with the new tri-colour scheme, or render alongside. Recommended: replace — one indicator per snap, less visual noise. If replacing, locate the existing yellow ring and remove/conditionally disable it when the new tri-colour marker is active.

4.5 Add a window-level `keydown`/`keyup` listener (mounted in a `useEffect`) that updates `isShiftHeld` state. Cleanup on unmount.

4.6 Run `cd 2dfea && npm run type-check && npm test` — green (new `classifyNode` test passes). Smoke-test in dev:
- Hover the beam mid-span → **blue** marker at the perpendicular foot.
- Hover `N1` (fixed support → connected via the support rule) → **green** marker on the node.
- Hover `N2` (free support, 1 element attached → free-end) → **amber** marker.
- Add a free node `N3` not connected to anything, hover it → **amber** marker.
- Connect `N3` with a second element so it has ≥ 2 elements (true junction), re-hover → **green** marker.
- Hold Shift → all markers disappear. Release → reappear.

**Verification**: goal #6 satisfied.

### Phase 5 — Polish + docs

5.1 Add JSDoc on `projectOntoSegment` and `getSnappedPosition` per §5.2 / §5.3.

5.2 Add a single one-paragraph note to `2dfea/src/components/CanvasView.tsx` near the snap-marker block explaining the Shift-bypass and pointing readers at this plan.

5.3 Add a one-line tooltip on the snap marker (or the existing canvas help text) advertising "Hold Shift to bypass element snap".

5.4 (Optional) Add a brief `README.md` line under "Drawing nodes / elements": "Cursor on an existing line snaps to the line. Hold Shift to bypass."

5.5 Run `cd 2dfea && npm run type-check && cd 2dfea && npm test && cd 2dfea && npm run build` — all green.

5.6 If anything material changed during implementation (e.g. tie-breaking turned out to need different logic, the Move-command base-point projection was deferred), amend this plan in the same commit so the docs/code state stays in sync.

### Phase 6 — Ship

6.1 Run the full §8 verification matrix.

6.2 Commit:
```bash
git add 2dfea/src/geometry/snapUtils.ts \
        2dfea/src/geometry/snapUtils.test.ts \
        2dfea/src/components/CanvasView.tsx \
        2dfea/docs/plans/snap-to-element-projection.md \
        2dfea/docs/plans/INDEX.md
```

Suggested commit message (HEREDOC):
```
feat(2dfea): project cursor onto hovered element on click (snap-to-line)

- Extract projectOntoSegment helper; refactor distanceToLineSegment to delegate
- Extend getSnappedPosition with hoveredElement/elements/bypassElementProjection
- Update 5 call sites in CanvasView.tsx (draw-node, draw-element x2, move x2)
- Render blue snap marker at projection foot when hovering an element
- Hold Shift at click to bypass element projection (escape hatch)
- Add Vitest unit tests covering interior projection, endpoint clamping,
  zero-length segments, and randomised-tolerance assertion proving the
  projection is ≤ 1e-13 m perpendicular for any L between 0.1 m and 1000 m
  (3 orders of magnitude tighter than PyNite's PhysMember.descritize tolerance)

Fixes the gap where mid-span nodes drawn on a beam landed up to ~10 cm
off-axis, preventing PyNite from auto-splitting the physical member into
sub-members at the new node and yielding discontinuous diagrams at T-joints.
```

6.3 Push to a feature branch (see §10), open PR, merge per the gate process, monitor the deploy.

## 8. Test & Verification Plan

### Automated gates

| Gate | Command (from `2dfea/`) | Passes when |
|------|-------------------------|-------------|
| Type check | `npm run type-check` | Zero TS errors |
| Unit tests | `npm test` | All Vitest suites green, including new `snapUtils.test.ts` |
| Production build | `npm run build` | Exit 0; `dist/` produced; bundle delta < 1 KB |
| Preview | `npm run preview` | Worker loads; analysis runs in built output |
| CI deploy | GitHub Actions `Deploy 2D FEM to GitHub Pages` | Workflow green |

### Unit tests for `projectOntoSegment` (`src/geometry/snapUtils.test.ts`)

| Case | Setup | Expected |
|------|-------|----------|
| **Interior projection** | `point = (2, 1)`, segment `(0,0)→(4,0)` | Returns `(2, 0)` exactly. |
| **Beyond start endpoint** | `point = (-3, 5)`, segment `(0,0)→(4,0)` | Returns `(0, 0)` (clamped). |
| **Beyond end endpoint** | `point = (10, -2)`, segment `(0,0)→(4,0)` | Returns `(4, 0)` (clamped). |
| **Vertical segment** | `point = (1, 2)`, segment `(0,0)→(0,4)` | Returns `(0, 2)`. |
| **Horizontal segment symmetry** | Same as interior, mirrored. | Symmetrical result. |
| **Diagonal segment** | `point = (4, 0)`, segment `(0,0)→(4,4)` | Returns `(2, 2)` (perpendicular foot at midpoint). |
| **Zero-length segment** | `point = (5, 7)`, segment `(2,3)→(2,3)` | Returns `(2, 3)`; no division by zero. |
| **Tolerance test (load-bearing)** | For `L ∈ {0.1, 1, 10, 100, 1000}` m, generate 50 random cursor offsets within ±10 m of the midpoint. For each, project, then compute the perpendicular distance from the projection back to the segment. | Distance ≤ 1×10⁻¹³ m for **all** samples. (Ensures PyNite's `1e-12 * (1 + L)` tolerance is comfortably satisfied for any reasonable L.) |
| **Determinism** | Same inputs called twice. | Returns identical numbers (no nondeterminism in JS Math). |

The "tolerance test" is the load-bearing assertion that proves the geometric correctness goal (#1). All other cases are sanity checks.

### Integration check (semi-manual)

Drop a node mid-span via the actual store actions in dev (`npm run dev`):

1. Load Example (cantilever, 4 m, fixed-free).
2. Activate `draw-node` tool. Hover the beam mid-span; click.
3. Open DevTools → Application / Local Storage → inspect the new node's `x`, `y`. Compute the perpendicular distance to the beam axis: should be ≤ 1×10⁻¹³ m.
4. Run Full Analysis. In the worker logs (or via the model inspector hook), verify that `solver.model.members['E1'].sub_members.length === 2`.
5. Inspect the moment diagram across the new node — it should be **continuous** (no jump). This is the visible end-to-end criterion (goal #3).

If a worker-test harness exists or is convenient to add, this can be automated; if not, the manual variant is sufficient for v1.

### Manual QA matrix

Run through each scenario in `npm run dev`, with DevTools open. No console errors or warnings expected.

**Group A — Draw on element**
1. Load Example. Activate `draw-node`. Hover the beam at ~mid-span; observe the blue snap marker at the perpendicular foot. Click. Expect: new node lands **exactly** on the beam (perpendicular distance ≤ 1×10⁻¹³ m, verifiable by reading node coords). Run Full Analysis. Expect: moment diagram is continuous across the new node.

2. Hover the beam near the fixed end. Click. Expect: node lands on the line, near the fixed support, not at the cursor pixel.

3. Hover the beam beyond the right tip (cursor past `N2`). Expect: snap marker is at `N2` (clamped), or hovers off if cursor is too far away from any element.

**Group B — Draw element ending on element**
4. Load Example. Activate `draw-element`. Click on a free point in the canvas (creates `N3` at cursor — no element hovered). Then drag towards the existing beam, hover the beam, click. Expect: `N4` lands **on** the beam (T-joint formed); a new element `E2` connects `N3` to `N4` with `N4` exactly on the beam axis.

5. Run Full Analysis. Expect: both elements respond correctly; the beam now has two sub-members (verified via worker log or `solver.model.members['E1'].sub_members.length`); diagrams reflect the T-joint connection.

**Group C — Shift escape**
6. Load Example. Activate `draw-node`. Hold Shift, hover the beam (snap marker should disappear), click. Expect: node lands **at the cursor pixel**, not on the line. Verify via node coords (perpendicular distance > 0).

7. Run Full Analysis with the off-line node from #6. Expect: PyNite reports `sub_members.length === 1` for the beam (no split because the node is off-axis). This proves the bypass is genuine.

**Group D — Move onto element**
8. Load Example. Add a free node `N3` at some off-line location. Select `N3`, type `M`, click `N3` as base point, hover the beam, click. Expect: `N3` is moved to land on the beam (perpendicular distance ≤ 1×10⁻¹³ m).

9. Repeat #8 with Shift held during the endpoint click. Expect: `N3` lands at the cursor pixel.

**Group E — Visual marker**
10. Load Example. Activate `draw-node` (or just hover with no tool). Move cursor onto the beam. Expect: **blue** hollow snap marker (state a — projection) at the perpendicular foot. Move cursor over `N1` (fixed support → connected) — marker turns **green** (state b). Move cursor over `N2` (free support, only 1 element attached → free-end) — marker turns **amber** (state c). Add a free node `N3` somewhere isolated (no elements, no support), hover it — also **amber**. Connect `N3` with a second element so it now has ≥ 2 elements, re-hover → marker turns **green** (junction).

11. Move cursor along the beam. Expect: marker tracks the perpendicular foot.

12. Move cursor over `N1`. Expect: snap marker disappears (node hover wins; existing yellow ring shows).

13. Hold Shift while hovering the beam. Expect: snap marker disappears.

14. Switch to Loads tab. Activate "Add point load" creation. Hover the beam. Expect: snap marker shows. (Note: load placement uses parametric distance, so the click coords aren't projected — but the marker still renders in this context for visual consistency.)

**Cross-browser sanity**
15. Repeat tests 1, 6, 8 in Chrome, Firefox, Edge. Same-machine macOS check for Shift behaviour if available (`shiftKey` is the same across platforms — no `metaKey` involvement).

### Edge cases to sanity-check

| Case | Expected |
|------|----------|
| Cursor exactly at an element endpoint (no node there because the endpoint nodes exist) | Node hover wins; snap marker hidden; click goes to the existing node coords. |
| Cursor near where two non-collinear elements meet | `findNearestElement` returns the closer one (perpendicular distance); projection lands on **that** element's axis. |
| Cursor over an element with one degenerate (zero-length) endpoint pair | Should not happen in practice; handled defensively by `projectOntoSegment` returning `lineStart`. |
| Element list is empty | `getSnappedPosition` falls through to raw cursor (no `find` match). |
| `hoveredElement` references an element that was just deleted | `find` returns undefined; falls through to raw cursor; no exception. |
| Very large L (1000 m) | Projection noise ~10⁻¹² m; PyNite tolerance ~10⁻⁹ m; gap ~10³. Verified by the tolerance unit test. |
| Imported model (via the JSON import feature) with off-line legacy nodes | Untouched. This fix only changes new click placements, not existing data. |
| Snap setting `snapToElements = false` | `hoveredElement` is never set on mousemove (existing behaviour at line 980/938); projection branch does nothing; falls through to raw cursor. |

### Deployment verification (post-push)

1. Wait for Actions: https://github.com/magnusfjeldolsen/structural_tools/actions.
2. Hard-refresh (`Ctrl+Shift+R`) https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
3. Repeat manual QA group A test 1 in production. Works.
4. Network tab: no new 4xx/5xx. Bundle size delta < 1 KB (inspect `dist/assets/index-*.js` size in the build report).

## 9. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| User wants to place a node *near* a line but not on it (e.g. an off-line column foot, an unconnected node intentionally close to a beam) | Medium | Medium | **Shift escape** is the dedicated affordance. Documented in tooltip + canvas help text + commit message. Goal #4 is the contract. |
| Visual snap marker clashes with the existing yellow node-hover ring | Medium | Low | Three distinct colour states (blue / green / amber) replace the single yellow ring when a snap is active; implementer picks final hues. See §5.5. |
| User can't tell at a glance whether they're snapping to a free-end vs a connected node | Medium | Low | Tri-colour scheme makes this explicit (amber = free-end / dangling; green = connected / established). Dangling-node confusion was a known UX gap before this change. |
| Multiple overlapping elements at the cursor (no node there) cause projection ambiguity | Low | Low | `findNearestElement` already deterministically returns the closest by perpendicular distance — projection uses that one. Documented in §5.4. |
| IEEE-754 noise at extreme L (1000 m) trips PyNite's tolerance | Very low | Medium | Projection noise scales with `t * dx` ≈ 10⁻¹² m absolute at L = 1000 m; PyNite tolerance ≈ 10⁻⁹ m at L = 1000 m → ~10³ margin. Verified by the randomised tolerance unit test in §8. |
| Existing models with off-line legacy nodes (saved via JSON import/export) confuse users post-fix | Low | Low | This fix only changes **new** click placements. Old nodes stay where they are. No migration logic, no auto-heal pass — explicitly listed in Non-Goals. |
| Load placement on elements is unaffected (uses parametric distance), but the snap marker rendering in load-creation mode could be confused for "this is where the load lands" | Low | Low | Load-placement code already uses parametric distance — geometrically exact regardless of click pixel. Marker is purely informational; UX-test in QA group E test 14. If confusion is reported, hide the marker in load-creation mode in a follow-up. |
| Konva `<Circle>` rendering cost on every mousemove (one extra shape, listening: false) | Low | Low | Konva handles thousands of shapes per frame easily; one extra shape is invisible in profiling. |
| Window-level Shift `keydown`/`keyup` listener leaks on unmount | Medium (if mishandled) | Low | Cleanup in `useEffect` return. Standard React pattern. |
| Refactoring `distanceToLineSegment` breaks a caller that relied on a numerical quirk | Very low | Low | Only caller in production is `findNearestElement` (verified by `Grep`); refactor is mathematically identical; `npm test` will catch any regression. |
| User holds Shift while in the middle of a Move command base-point click → unexpected behaviour | Low | Low | Shift bypass applies symmetrically to base-point and endpoint. Document in §5.6 / tooltip. |
| Bundle size growth | Low | Low | Pure logic, no new deps; estimate < 1 KB minified+gzipped; confirmed via `npm run build` size report (goal #10). |
| Deployment cache serves old bundle for 1–2 min | Expected | Low | Hard refresh (`Ctrl+Shift+R`) during verification. |

## 10. Rollout & Deployment

- **Branch strategy**: feature branch `feature/2dfea-snap-to-element-projection`. Push, open PR, run the agent's Gate 1 (type-check + tests + build) and Gate 2 (manual QA matrix in §8) per the structural-feature-implementer agent definition. Rebase-merge into `master`.
- **Deployment trigger**: any push touching `2dfea/**` auto-runs `.github/workflows/deploy-all-modules.yml`. Expected 2–3 minutes to go live at https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
- **Plain-HTML-module impact**: none.
- **Rollback**: single-commit revert:
  ```bash
  git revert <commit-sha>
  git push origin master
  ```
  Redeploy in ~3 min. No data-format migration risk — no schema, store, or persistence change. Rolling back leaves all `localStorage` entries fully usable (the fix is purely placement-time).
- **Migration notes for users**: none. Feature is purely additive. Existing models with off-line nodes are unaffected.

## 11. Observability & DX

- **Inline comments**: JSDoc on `projectOntoSegment` cites the IEEE-754 / PyNite tolerance margin (§5.7) so a future contributor understands why this precision matters and doesn't accidentally reduce it.
- **JSDoc on `getSnappedPosition`** spells out the three-priority order, the tie-break rule (§5.4), and the Shift-bypass contract.
- **Code comment in `CanvasView.tsx`** near the snap-marker block points at this plan (`// See docs/plans/snap-to-element-projection.md`) so the next contributor browsing CanvasView understands the rendering contract.
- **README quick-reference line** under the drawing-tools section: "Cursor on an existing line snaps to the line. Hold Shift to bypass."
- **Console diagnostics (dev only)**: at each call site that uses element projection, optionally log `[Snap] Projected onto E1: (2.500, 1.732)` when `import.meta.env.DEV`. Match the existing logging style in CanvasView. Off by default in prod (Vite tree-shakes the `if (import.meta.env.DEV)` block in production builds).
- **Marker tooltip** advertises the Shift escape (final UX pick deferred — see §5.5 / §5.6).
- **Future-contributor pointer**: a one-line comment in `setup_pynite_env.py` (or adjacent docs) noting "PyNite's `PhysMember.descritize()` requires nodes to be within `1e-12 * (1 + L)` perpendicular distance of the member axis to be picked up as sub-member breakpoints; the canvas's element-snap projection is the mechanism that ensures this." Optional — keeps domain knowledge discoverable.

## 12. Success Metrics

Post-merge the feature is successful when:

1. Drawing a node on a beam in https://magnusfjeldolsen.github.io/structural_tools/2dfea/ places the node **exactly on the line** (verifiable via the node table or the inspector).
2. Drawing the second endpoint of an element while hovering an existing beam yields a working T-joint after Full Analysis (continuous diagrams across the new node).
3. The Shift-escape bypass works as documented; off-line nodes can still be placed.
4. The blue snap marker renders consistently and disappears appropriately (node hover, Shift held).
5. `cd 2dfea && npm test` is green on `master`, including the new `snapUtils.test.ts` suite.
6. `cd 2dfea && npm run type-check` and `cd 2dfea && npm run build` are green on `master`.
7. GitHub Actions deploy run is green on the merge commit.
8. Manual QA groups A through E all pass.
9. Bundle size delta < 1 KB minified+gzipped.
10. No regression reports of broken node-snap or move-command behaviour.
11. No console errors in dev or prod.
