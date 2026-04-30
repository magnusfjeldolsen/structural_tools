# 2dfea Member End Releases (Mz only, 2D)

## 1. TL;DR

Add **moment-about-local-z** end releases to 2dfea elements — the only release that meaningfully maps to 2D frame analysis. Releases are **per-end booleans** (`releaseStartMz`, `releaseEndMz`) on the existing `Element`, default false (rigid). Three places to set them: the Elements table (two new boolean columns, single + bulk edit), a canvas floating panel that appears on selection (Release start / Release end / Release both / Clear releases), and indirectly via undo/redo on either of those. Canvas reveals "i" / "j" letter labels at element endpoints on hover/select to disambiguate which end is which, and renders a hollow-circle indicator (standard structural drawing convention) at every released endpoint. PyNite wiring: a single conditional `def_releases(...)` call after `add_member(...)` sets `Rzi` / `Rzj`. Save/load schema bumps **v1.0.0 → v1.1.0** (additive optional fields, MINOR per SemVer policy); v1.0.0 files load with releases defaulting to false. No new entity types, no migration logic beyond identity, no PyNite version change.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4.4 + Immer + Konva + zundo + Pyodide-hosted PyNite 2.0.2. Triggers `.github/workflows/deploy-all-modules.yml` on push to `master`/`main` touching `2dfea/**`. No plain HTML modules touched.

- **Source of truth for the feature**: a verified locked-in spec the planner was given. The verbatim user ask, repeated here as the load-bearing context for §5:

  > only relevant relase shoul be moment about local z. we want it as constrained as possible to keep stable. this should be possible to do in the structure tab. both for single selected elements and multiple selected elements. local coordinate system reveals what are start and end nodes. this shuold also be possible to operate in the Elements table in a release start and release end.

- **Scope is 2D**. PyNite's `def_releases` takes 12 booleans (Dxi…Rzj for both ends); we only ever set `Rzi` and `Rzj` per the user's instruction "as constrained as possible to keep stable". All other DOFs stay rigid.

- **Locked-in design decisions** (do not re-evaluate; bake straight into §5):
  1. **Data shape — flat siblings** on `Element`: `releaseStartMz?: boolean; releaseEndMz?: boolean`. Default false / absent = rigid. Future 3D ships → MAJOR-bump migration to nested `releases` object (see §11 future-extension note).
  2. **Save/load schema bump v1.0.0 → v1.1.0** (additive optional fields, MINOR per save/load §5.3 SemVer policy). v1.0.0 files load with releases defaulting to false. Migration registry stays identity for v1.0.0 → v1.1.0.
  3. **Elements table**: two new boolean cells, columns "Release start" and "Release end". Reuse existing `EditableCell` / table-cell convention in `ElementTable.tsx`. Multi-select bulk-edit must work — same pattern the table already supports.
  4. **Canvas i/j disambiguation**: small letter labels "i" and "j" at element endpoints on **hover or select** only (always-on would clutter dense models). No arrow / colour-coding in v1; flag as polish follow-up.
  5. **Canvas release indicator**: hollow circle, standard structural drawing convention. Drawn slightly inside the element from the released endpoint, offset = `min(0.1 × elementLength_screen_px, 14 px)` from the node, `#000` stroke 1.5 px, `transparent` fill, radius 5 px, `listening: false`. Distinct from existing node markers (filled `#FF5722` orange) and snap markers (blue/green/amber rings, radius 7).
  6. **Canvas release toggle**: floating action panel near the canvas edge (or pinned to bottom toolbar), appears when ≥1 element is selected. Four buttons: **Release start / Release end / Release both / Clear releases**. Each sets the corresponding flag(s) on **every** selected element (does NOT toggle).
  7. **Bulk-set semantics on mixed selection**: "Release start" sets all to true (idempotent on already-released ones). "Clear releases" sets both flags to false on all selected. **No tri-state toggle** — explicit "set" / "clear" semantics avoid ambiguity.
  8. **PyNite wiring** in `pynite_analyzer.py` after the existing `add_member(...)`: only call `def_releases` when at least one of the two flags is true (PyNite default is no releases). Result extraction unchanged — PyNite handles the kinematics.
  9. **Both-ends-released is allowed** (truss-like). Not warned, not blocked. PyNite supports `Rzi + Rzj` together (the truss case); only `Rxi + Rxj` together or `Dxi + Dxj` together are unstable, and we never touch those.

- **Codebase references** (trust these — line numbers not required; the implementer reads the file in-place):
  - `2dfea/src/analysis/types.ts` — `Element` interface lives here.
  - `2dfea/src/store/useModelStore.ts` — `addElement`, `updateElement` actions; default releases to `false` on creation.
  - `2dfea/src/store/historyConfig.ts` — `TRACKED_KEYS` already includes `elements`; release toggles get undo/redo for free.
  - `2dfea/src/components/tables/ElementTable.tsx` — Elements table; add the two new columns here.
  - `2dfea/src/components/CanvasView.tsx` — render i/j labels on hover/select; render the hollow-circle release indicator; render the floating release panel when `selectedElements.length > 0`.
  - `2dfea/public/python/pynite_analyzer.py` — add the `def_releases(...)` call after `add_member(...)`.
  - `2dfea/src/io/schema.ts` — extend the element Zod sub-schema with the two optional boolean fields.
  - `2dfea/src/io/schemaVersion.ts` — bump `CURRENT_SCHEMA_VERSION` to `'1.1.0'`.
  - `2dfea/src/io/migrations.ts` — register identity migration for `1.0.0` → `1.1.0`.
  - `2dfea/src/io/canonicalize.ts` — emit the new fields when present (omit when both false to keep files clean per save/load §5.2 rule "optional fields are omitted when absent").
  - `2dfea/docs/examples/cantilever-v1.json` — update the published example to include a v1.1.0 sibling or a comment noting the bump (planner's pick: keep current cantilever as v1.0.0 example to prove backwards compat, add a sibling `cantilever-v1-1.json` showing one released end).
  - `2dfea/src/io/forwardCompat.test.ts` — add a v1.1.0 → v1.0.0-reader compat test (release fields ignored gracefully by old code).
  - `2dfea/src/io/__fixtures__/cantileverV1.ts` — extend with optional release fields for round-trip tests.

- **PyNite reference** (pasted verbatim, cite https://pynite.readthedocs.io/en/latest/member.html):

  ```python
  my_model.def_releases('M1', Dxi=False, Dyi=False, Dzi=False, Rxi=False, Ryi=True, Rzi=True,
                              Dxj=False, Dyj=False, Dzj=False, Rxj=False, Ryj=True, Rzj=True)
  ```

  Signature: `def_releases(member, Dxi, Dyi, Dzi, Rxi, Ryi, Rzi, Dxj, Dyj, Dzj, Rxj, Ryj, Rzj)`. Per the docs, releasing `Rxi`+`Rxj` together → instability; releasing `Dxi`+`Dxj` together → instability; shears need caution. **None of these apply to us** (we only touch `Rzi`/`Rzj`). Releasing `Rzi`+`Rzj` together is the truss case and is fully supported.

- **Vitest is in scope today** (`2dfea/vitest.config.ts` + `npm test`). Adding a small data-shape test next to the existing IO tests is a one-file change.

## 3. Goals (Definition of Done)

Each goal is observable and must be verifiable post-merge.

1. `Element` extended with `releaseStartMz?: boolean` and `releaseEndMz?: boolean`; defaults to false / rigid on new elements.
2. Elements table shows two new boolean columns ("Release start", "Release end"); works for single-row edit and multi-select bulk edit.
3. Canvas hover/select reveals "i" and "j" letter labels at element endpoints (verifiable by hovering an element in dev).
4. Canvas floating panel appears when ≥1 element is selected, with **Release start / Release end / Release both / Clear releases** buttons. Bulk-applied to all selected elements per §5 semantics.
5. Hollow-circle indicator renders at every released endpoint, offset from the node per §5 geometry.
6. PyNite analysis honours releases via `def_releases(...)`. End moment at a released end is **< 1×10⁻⁶ kNm** in the result diagrams (essentially zero — verified by cantilever + tip load worked example in §8).
7. Save/load JSON schema bumped to `"1.1.0"`. Releases round-trip losslessly. v1.0.0 files load (releases default false). `forwardCompat.test.ts` covers v1.0.0-reader-on-v1.1.0-file (extra fields ignored).
8. Undo/redo covers release toggles. Single-row edit = one undo step. Bulk edit (e.g. "Release start" on 5 selected elements) = one undo step.
9. `cd 2dfea && npm run type-check`, `cd 2dfea && npm test`, `cd 2dfea && npm run build` all green.
10. `pr-checks.yml` green on the feature PR.
11. Manual QA Groups A–F (defined in §8) all pass.
12. No console errors or React warnings in dev or preview.

## 4. Non-Goals

Explicitly out of scope:

- **No 3D releases** (Rx, Ry, Dx, Dy, Dz, etc.). 2D only ships `Mz`. Future MAJOR-bump migration when 3D ships — see §11.
- **No partial fixity** / rotational springs. Boolean only.
- **No automatic stability validation**; rely on PyNite's solver errors and the existing analysis-error toast for the both-ends-released-with-incompatible-loads edge.
- **No keyboard shortcut** for the release toggle in v1; floating panel only. Add as polish follow-up.
- **No data-model change beyond the two new optional booleans** on `Element`. No new entity types, no `Release` records, no per-DOF granularity surfaced in UI.
- **No tri-state toggle** in the bulk panel. Explicit "set" / "clear" semantics.
- **No always-on i/j labels**. Hover/select only.
- **No arrow or colour-coding** for i/j direction in v1.
- **No change to `vite.config.ts`, `tsconfig.json`, the deploy workflow, the GA tag, or any plain HTML module.**

## 5. Architecture & Design

### 5.1 Where the feature lives

Eight files do the work, plus tests and the example fixture:

```
2dfea/src/analysis/types.ts                     ← extend Element interface
2dfea/src/store/useModelStore.ts                ← default releases to false on creation; toggle actions if needed
2dfea/src/components/tables/ElementTable.tsx    ← two new boolean columns + bulk-edit
2dfea/src/components/CanvasView.tsx             ← i/j labels, hollow-circle indicators, floating release panel
2dfea/public/python/pynite_analyzer.py          ← conditional def_releases() after add_member()
2dfea/src/io/schema.ts                          ← Zod element sub-schema extension
2dfea/src/io/schemaVersion.ts                   ← bump CURRENT_SCHEMA_VERSION = '1.1.0'
2dfea/src/io/migrations.ts                      ← identity migration v1.0.0 → v1.1.0
2dfea/src/io/canonicalize.ts                    ← emit new fields when present, omit when false
```

Tests + fixture:

```
2dfea/src/io/forwardCompat.test.ts              ← extend with v1.1.0 ↔ v1.0.0 case
2dfea/src/io/__fixtures__/cantileverV1.ts       ← extend with optional release fields for round-trip tests
2dfea/src/analysis/releaseTuple.test.ts         ← (new) unit test for Element → PyNite arg-tuple helper
2dfea/docs/examples/cantilever-v1-1.json        ← (new) published example with one released end
```

### 5.2 Data shape

In `2dfea/src/analysis/types.ts`:

```ts
export interface Element {
  // ...existing fields: name, nodeI, nodeJ, E_GPa, I_m4, A_m2, ...
  releaseStartMz?: boolean;  // default false / absent = rigid at i-node
  releaseEndMz?: boolean;    // default false / absent = rigid at j-node
}
```

Flat siblings, optional, default-absent. Reasoning: 2D only ships `Mz`. Flat is leaner than a nested `releases: { startMz: boolean }` object today; a future 3D version will MAJOR-bump and migrate to a nested shape. Documented in §11.

### 5.3 Default-on-create

In `useModelStore.ts`'s `addElement` action: do **not** set the new fields explicitly when creating a new element. Absent = false per the schema. This keeps newly-created models clean (canonicalize will omit absent fields on save).

If the implementer prefers to set explicit `false` defaults inside `addElement` for clarity, that is acceptable; canonicalize.ts must still strip both-false-or-absent on save (§5.7).

### 5.4 Elements table — two new columns

In `2dfea/src/components/tables/ElementTable.tsx`:

| Column header | Bound field | Cell type |
|---------------|-------------|-----------|
| "Release start" | `element.releaseStartMz` | Boolean cell (checkbox / toggle); reuse `EditableCell` if it supports `boolean` mode, else introduce a small `BooleanCell` |
| "Release end" | `element.releaseEndMz` | Same |

Bulk edit: when ≥2 rows are selected and the user clicks the boolean cell in the header / via the existing bulk-edit affordance, apply the new value to all selected elements via a single `updateElements(elements: Element[])` action OR a series of `updateElement(name, patch)` calls wrapped in one `zundo` history step (the existing bulk-edit pattern dictates which — match it).

Mixed-selection display: when the selected elements have mixed values for a given release flag, the cell renders an **indeterminate** state (visually distinct from true and false; e.g. dashed checkbox or em-dash). Clicking still applies "set true" via the existing pattern; the inverse is exposed via the canvas panel's "Clear releases" button (§5.6) and via a dedicated "Set false" action in the bulk-edit affordance if the table already exposes one.

### 5.5 Canvas i/j labels

In `2dfea/src/components/CanvasView.tsx`:

- **Trigger: ELEMENT hover or selection only — NOT node hover.** Specifically: `hoveredElement === element.name || selectedElements.includes(element.name)`. Reading `hoveredNode` MUST NOT trigger the labels. Reason: a single node can serve as the i-node of one element and the j-node of another (junctions are common — every connected node has dual or multi-roles). Showing "i" or "j" on node hover would be ambiguous and meaningless. Labels are a per-element disambiguation, rendered only while that specific element is the hover/select target.
- Render: two Konva `<Text>` shapes — "i" at the i-node screen coords, "j" at the j-node screen coords. Both labels render together and only for that one element; if a node is the i-end of element A and the j-end of element B, hovering A shows "i" at that node (and "j" at A's other endpoint), hovering B shows "j" at that same node (and "i" at B's other endpoint). Hovering the *node itself* shows neither.
- Offset: small constant offset (recommended: 8 px perpendicular to the element axis, on the side opposite where the canvas centre lies — implementer's pick; keep it readable).
- Style: `fontSize: 11`, `fill: '#666'` (mid-grey, doesn't compete with the orange node markers), `listening: false`.
- Suppression: hide when the element is hidden. Default behaviour: "show whenever the element-hover/select trigger fires".

Always-on labels would clutter dense models — explicit non-goal in §4.

### 5.6 Canvas floating release panel

In `2dfea/src/components/CanvasView.tsx`:

Render a small floating panel (positioned near the canvas edge, e.g. bottom-right or pinned to the existing bottom toolbar group) when `selectedElements.length > 0`. Four buttons:

| Button | Action |
|--------|--------|
| **Release start** | For each `name` in `selectedElements`: `updateElement(name, { releaseStartMz: true })`. Wrap in one history step. |
| **Release end** | Same with `releaseEndMz: true`. |
| **Release both** | Same with `{ releaseStartMz: true, releaseEndMz: true }`. |
| **Clear releases** | Same with `{ releaseStartMz: false, releaseEndMz: false }`. |

Semantics: explicit **set** / **clear** — never toggle. Idempotent on already-released elements. Mixed-selection: "Release start" sets all selected to true regardless of prior state.

Panel styling: match the existing canvas-overlay panel style (e.g. tooltip / measurement panel — implementer reads the file). Hidden when no element is selected.

No keyboard shortcut in v1 (§4); add as polish follow-up.

### 5.7 Canvas hollow-circle release indicator

In `2dfea/src/components/CanvasView.tsx`, for each element where `releaseStartMz === true`, render a Konva `<Circle>` at the i-node end of the element axis, offset slightly **inside** the element (away from the node). Same for `releaseEndMz === true` at the j-node end.

| Property | Value | Rationale |
|----------|-------|-----------|
| Shape | `<Circle>` | Standard structural drawing convention for a moment release |
| Radius | 5 px | Smaller than snap markers (7 px); compact next to the orange node marker |
| Stroke | `#000` | High contrast against canvas; classic engineering-drawing colour |
| Stroke width | 1.5 px | Visible without being heavy |
| Fill | `transparent` | Hollow — convention dictates an open circle |
| Listening | `false` | Must not steal hover/click events |
| Offset from node | `min(0.1 × elementLengthScreenPx, 14 px)` along the element axis, towards the centre | Keeps the indicator inside the element on short members; caps the offset on long members so it stays visually local to the released end |

Geometry: compute the unit vector along the element from i to j (`(dx, dy) / L`). For a `releaseStartMz` indicator, the centre is at `(nodeI_screen.x + offset * unit.x, nodeI_screen.y + offset * unit.y)`. For `releaseEndMz`, the centre is at `(nodeJ_screen.x - offset * unit.x, nodeJ_screen.y - offset * unit.y)`.

Distinct from existing markers:

| Marker | Shape | Colour | Radius |
|--------|-------|--------|--------|
| Node | Filled circle | `#FF5722` (orange) | typical 4 px |
| Snap (projection / connected / free-end) | Hollow | blue / green / amber | 7 px |
| **Release (this plan)** | Hollow | `#000` | 5 px |

No collision: the release marker sits **on the element axis**, offset from the node; the node marker sits **on the node**.

### 5.8 PyNite wiring

In `2dfea/public/python/pynite_analyzer.py`, after the existing `self.model.add_member(...)` call:

```python
release_start = bool(element.get('releaseStartMz'))
release_end = bool(element.get('releaseEndMz'))
if release_start or release_end:
    self.model.def_releases(
        element['name'],
        False, False, False, False, False, release_start,  # i-node DOFs: Dxi, Dyi, Dzi, Rxi, Ryi, Rzi
        False, False, False, False, False, release_end,    # j-node DOFs: Dxj, Dyj, Dzj, Rxj, Ryj, Rzj
    )
```

Only call when at least one flag is true (PyNite default is no releases — calling `def_releases` with all-false is a no-op but introduces unnecessary state-mutation overhead). Result extraction (`moment_array`, `shear_array`) is unchanged — PyNite handles the kinematics, which means the moment at a released end is enforced ≈ 0 (within solver tolerance).

Per the PyNite docs: releasing `Rzi + Rzj` together is the truss case and is fully supported. The unstable combinations (`Rxi + Rxj`, `Dxi + Dxj`) are 3D-only DOFs we never touch. **No stability check required on the JS side.**

#### Pure-data helper (testable)

Add a small helper next to `pynite_analyzer.py`'s logic on the JS side (or as a Python-only helper if the existing pattern routes via dict serialisation). Example JS shape, used by the test in §8:

```ts
// 2dfea/src/analysis/releaseTuple.ts
export function elementReleaseTuple(el: Element): [boolean, boolean] {
  return [Boolean(el.releaseStartMz), Boolean(el.releaseEndMz)];
}
```

The existing JS-to-Python serialisation path (where `Element` is converted to the dict the worker passes into Pyodide) must include `releaseStartMz` / `releaseEndMz` when present. Implementer reads `analyzer.ts` (or whichever file does the JS-side dict-build) to confirm the field passes through.

### 5.9 Schema, canonicalize, migrations

#### `2dfea/src/io/schemaVersion.ts`

```ts
export const CURRENT_SCHEMA_VERSION = '1.1.0';
```

#### `2dfea/src/io/schema.ts` — element sub-schema

```ts
const elementSchema = z.object({
  // ...existing fields
  releaseStartMz: z.boolean().optional(),
  releaseEndMz: z.boolean().optional(),
});
```

Optional. v1.0.0 files lack these fields → Zod parse succeeds; the runtime treats absence as false.

#### `2dfea/src/io/migrations.ts`

Register an identity migration for `'1.0.0' → '1.1.0'`:

```ts
migrations.register('1.0.0', '1.1.0', (model) => model);
```

No transformation needed — the new fields are additive and absence is the rigid default.

#### `2dfea/src/io/canonicalize.ts`

When emitting an element, **omit** `releaseStartMz` and `releaseEndMz` when both are false-or-absent (per save/load §5.2 rule "optional fields are omitted when absent"). When one or both are true, emit explicitly:

```ts
if (el.releaseStartMz) out.releaseStartMz = true;
if (el.releaseEndMz) out.releaseEndMz = true;
```

This keeps default-rigid models byte-identical to their v1.0.0 form except for the `schemaVersion` bump (which is the documented MINOR-bump expectation).

#### Published JSON Schema document

Recommended: keep a single rolling `2dfea-model-v1.json` document for now and address per-MINOR publishing in a follow-up if downstream AI consumers demand it. (The prebuild step regenerates this document.) If the implementer prefers to publish a sibling `2dfea-model-v1-1-0.json` immediately, that is acceptable — the canonicalize / migration code does not depend on the published-schema filename.

### 5.10 Future 3D extension path (informational, not implemented in this plan)

When a future 3D release lands, the data shape will MAJOR-bump to:

```ts
interface Element {
  releases?: {
    start?: { Dx?: boolean; Dy?: boolean; Dz?: boolean; Rx?: boolean; Ry?: boolean; Rz?: boolean };
    end?: { /* same */ };
  };
}
```

Migration path: `2.0.0` migration reads the flat `releaseStartMz` / `releaseEndMz` fields and writes them into `releases.start.Rz` / `releases.end.Rz`. The flat fields are then dropped from the schema. v1.x files load via the migration registry; new v2 files use the nested shape exclusively.

Recorded here so a future contributor doesn't reinvent the path. **Not implemented now.**

### 5.11 What is NOT changing (deliberate)

- The PyNite version (still 2.0.2).
- The worker path resolution.
- The Pyodide setup script.
- Any plain HTML module.
- The deploy workflow.
- The GA tag.
- `vite.config.ts`, `tsconfig.json`, `package.json`.
- Existing snap / move / draw logic.
- `Node` type or any other entity beyond `Element`.

If the implementer finds themselves editing any of those, scope has crept and the change should be reviewed.

## 6. Files to Touch

| File Path | Action | Purpose |
|-----------|--------|---------|
| `c:\Python\structural_tools\2dfea\src\analysis\types.ts` | Modify | Add `releaseStartMz?: boolean` and `releaseEndMz?: boolean` to `Element`. |
| `c:\Python\structural_tools\2dfea\src\store\useModelStore.ts` | Modify | Defaults on `addElement` (absent = false); ensure `updateElement` (and bulk variant if exists) accepts the new fields in the patch. |
| `c:\Python\structural_tools\2dfea\src\components\tables\ElementTable.tsx` | Modify | Two new boolean columns ("Release start", "Release end"); single + bulk edit; indeterminate display on mixed selection. |
| `c:\Python\structural_tools\2dfea\src\components\CanvasView.tsx` | Modify | Render i/j letter labels on hover/select; render hollow-circle release indicator at released endpoints; render floating release panel (Release start / Release end / Release both / Clear releases) when `selectedElements.length > 0`. |
| `c:\Python\structural_tools\2dfea\public\python\pynite_analyzer.py` | Modify | After existing `self.model.add_member(...)`, conditionally call `self.model.def_releases(...)` setting only `Rzi` / `Rzj` per `releaseStartMz` / `releaseEndMz`. |
| `c:\Python\structural_tools\2dfea\src\analysis\releaseTuple.ts` | Create | Tiny helper `elementReleaseTuple(el): [boolean, boolean]` for testability. |
| `c:\Python\structural_tools\2dfea\src\analysis\releaseTuple.test.ts` | Create | Vitest covering all 4 cases (none / start / end / both). |
| `c:\Python\structural_tools\2dfea\src\io\schemaVersion.ts` | Modify | Bump `CURRENT_SCHEMA_VERSION` to `'1.1.0'`. |
| `c:\Python\structural_tools\2dfea\src\io\schema.ts` | Modify | Add optional `releaseStartMz` / `releaseEndMz` to the element Zod sub-schema. |
| `c:\Python\structural_tools\2dfea\src\io\migrations.ts` | Modify | Register identity migration `'1.0.0' → '1.1.0'`. |
| `c:\Python\structural_tools\2dfea\src\io\canonicalize.ts` | Modify | Emit `releaseStartMz` / `releaseEndMz` only when truthy (omit when absent or false). |
| `c:\Python\structural_tools\2dfea\src\io\forwardCompat.test.ts` | Modify | Add a v1.1.0-file-readable-by-v1.0.0-reader case (unknown fields silently ignored). |
| `c:\Python\structural_tools\2dfea\src\io\__fixtures__\cantileverV1.ts` | Modify | Extend with optional release-field cases for round-trip tests. |
| `c:\Python\structural_tools\2dfea\docs\examples\cantilever-v1-1.json` | Create | Published example showing a cantilever with `releaseEndMz: true` (sibling to existing `cantilever-v1.json`). |
| `c:\Python\structural_tools\2dfea\docs\plans\member-end-releases-mz.md` | Create | This plan. |
| `c:\Python\structural_tools\2dfea\docs\plans\INDEX.md` | Modify | Append one-line entry pointing at the new plan. |

No changes needed in:

- `2dfea/python/setup_pynite_env.py` — PyNite version unchanged.
- `2dfea/public/workers/solverWorker.js` — solver flow unchanged; the analyzer-side dict already includes whatever is on the JS `Element` object.
- `2dfea/vite.config.ts`, `2dfea/package.json` — no new deps; no new build step.
- `2dfea/public/schemas/2dfea-model-v1.json` — leave to the prebuild regeneration step; do not hand-edit.
- `.github/workflows/deploy-all-modules.yml` — deployment flow unchanged.
- Any plain HTML module — untouched.
- The Google Analytics tag — no new HTML files.

## 7. Step-by-Step Implementation Phases

Each phase is independently compilable and type-checks. Run `cd 2dfea && npm run type-check` after each phase. Run `cd 2dfea && npm test` after Phase 1, Phase 5, and Phase 6.

### Phase 1 — Data shape + helper + unit test

1.1 Open `src/analysis/types.ts`. Add `releaseStartMz?: boolean` and `releaseEndMz?: boolean` to `Element`.

1.2 Create `src/analysis/releaseTuple.ts` with `elementReleaseTuple(el): [boolean, boolean]`.

1.3 Create `src/analysis/releaseTuple.test.ts` covering all 4 cases (none → `[false, false]`, start-only → `[true, false]`, end-only → `[false, true]`, both → `[true, true]`).

1.4 `npm run type-check` → green. `npm test` → new test passes; existing tests unaffected.

**Verification**: data shape is in place; nothing in the UI uses it yet.

### Phase 2 — Store wiring

2.1 In `useModelStore.ts`: confirm `addElement` does not set the release fields (absent = false). Confirm `updateElement` accepts the new fields in the patch (TypeScript will catch this once the types are extended).

2.2 If a bulk-update action exists (e.g. `updateElements(names: string[], patch: Partial<Element>)`), confirm it propagates the new fields. If it doesn't exist, **don't add one** — the canvas-panel buttons can call `updateElement` per-element inside one `zundo` history step (zundo's `partialize` + the existing single-step grouping pattern handles this; reuse the existing convention).

2.3 `npm run type-check` → green.

**Verification**: a programmatic update via the Zustand devtools (set `releaseStartMz: true` on an element) shows up in store state and undoes/redoes correctly.

### Phase 3 — Elements table

3.1 In `ElementTable.tsx`, add two new columns ("Release start", "Release end") wired to `releaseStartMz` / `releaseEndMz`.

3.2 Boolean cell: reuse `EditableCell` if it has a `boolean` mode; otherwise introduce a small `BooleanCell` component next to the existing cells.

3.3 Bulk-edit: hook into the existing multi-row-edit affordance (the table already supports this — match the pattern). Apply the new value to all selected rows in one history step.

3.4 Indeterminate display: when a column has mixed values across selected rows, render the cell visually indeterminate (dashed / em-dash). Single click → "set true" (matches existing pattern, if any; otherwise pick "set true" as the default action and document).

3.5 `npm run type-check` → green. Smoke-test in dev (`npm run dev`): toggle release on a single row; bulk-toggle on multiple selected rows; verify undo/redo.

**Verification**: goal #2 satisfied; goal #8 (undo/redo) satisfied for the table path.

### Phase 4 — Canvas i/j labels + hollow-circle indicators + floating panel

4.1 In `CanvasView.tsx`, locate the per-element render block.

4.2 Add the i/j label rendering: when an element is hovered or selected, render two Konva `<Text>` shapes at the i-node and j-node screen coords with the styling from §5.5.

4.3 Add the hollow-circle release indicator rendering per §5.7 geometry. One `<Circle>` per released endpoint.

4.4 Add the floating release panel: visible when `selectedElements.length > 0`. Four buttons (Release start / Release end / Release both / Clear releases) wired per §5.6 semantics. Style to match existing canvas-overlay panels.

4.5 `npm run type-check` → green. Smoke-test in dev: select an element, panel appears; click "Release end", indicator appears at the j-end; "Clear releases" removes it; undo restores the previous state. Hover an element, "i" and "j" labels appear at the endpoints.

**Verification**: goals #3, #4, #5 satisfied; goal #8 (undo/redo) satisfied for the canvas path.

### Phase 5 — PyNite wiring

5.1 In `pynite_analyzer.py`, after the existing `self.model.add_member(...)` call, add the conditional `def_releases` block per §5.8.

5.2 Confirm the JS-to-Python serialisation path passes the new fields through. If `Element` is dict-converted via a serializer, the new fields are picked up automatically by virtue of being on the JS object; if there is an explicit field whitelist, add them.

5.3 Smoke-test in dev: load Example, set `releaseEndMz: true` on the cantilever's only beam, run Full Analysis. Expect: end moment at the j-node ≈ 0 (the released end). Compare against the rigid result for sanity.

5.4 `npm test` → green (the `releaseTuple` test from Phase 1 still passes; nothing else is affected by the Python change).

**Verification**: goal #6 satisfied. End moment at a released end < 1×10⁻⁶ kNm.

### Phase 6 — Schema bump, migration, canonicalize, fixtures

6.1 In `schemaVersion.ts`, bump to `'1.1.0'`.

6.2 In `schema.ts`, add the optional fields to the element Zod sub-schema.

6.3 In `migrations.ts`, register the identity migration `'1.0.0' → '1.1.0'`.

6.4 In `canonicalize.ts`, emit the new fields only when truthy.

6.5 Extend `__fixtures__/cantileverV1.ts` with cases that include / omit the release fields, for round-trip tests.

6.6 In `forwardCompat.test.ts`, add a case proving v1.1.0 files (with `releaseEndMz: true`) are silently readable by a v1.0.0 reader (Zod parse succeeds; unknown fields ignored).

6.7 Create `docs/examples/cantilever-v1-1.json` showing a cantilever with `releaseEndMz: true`. Mark it `"schemaVersion": "1.1.0"`.

6.8 `npm run type-check && npm test && npm run build` → all green.

**Verification**: goal #7 satisfied (round-trip + forward compat); fixture proves both directions.

### Phase 7 — Polish + docs

7.1 Add JSDoc on `elementReleaseTuple` and on the `def_releases` block in `pynite_analyzer.py` citing the PyNite member docs URL.

7.2 Add a one-line comment in `CanvasView.tsx` near the release-indicator block: `// See docs/plans/member-end-releases-mz.md for geometry rationale`.

7.3 Add a brief `README.md` line under "Element editing": "Set per-end moment-z releases via the Elements table or the canvas selection panel. Released ends are marked by a hollow circle next to the node."

7.4 Run the full §8 verification matrix.

### Phase 8 — Ship

8.1 Commit:

```bash
git add 2dfea/src/analysis/types.ts \
        2dfea/src/analysis/releaseTuple.ts \
        2dfea/src/analysis/releaseTuple.test.ts \
        2dfea/src/store/useModelStore.ts \
        2dfea/src/components/tables/ElementTable.tsx \
        2dfea/src/components/CanvasView.tsx \
        2dfea/public/python/pynite_analyzer.py \
        2dfea/src/io/schemaVersion.ts \
        2dfea/src/io/schema.ts \
        2dfea/src/io/migrations.ts \
        2dfea/src/io/canonicalize.ts \
        2dfea/src/io/forwardCompat.test.ts \
        2dfea/src/io/__fixtures__/cantileverV1.ts \
        2dfea/docs/examples/cantilever-v1-1.json \
        2dfea/docs/plans/member-end-releases-mz.md \
        2dfea/docs/plans/INDEX.md
```

Suggested commit message (HEREDOC):

```
feat(2dfea): per-end moment-z releases for elements (Mz only, 2D)

- Extend Element with releaseStartMz / releaseEndMz (optional booleans)
- Elements table: two new boolean columns; single + bulk edit
- Canvas: hover/select reveals "i"/"j" labels at element endpoints
- Canvas: hollow-circle release indicator at every released endpoint
- Canvas: floating panel (Release start / end / both / Clear) on selection
- PyNite wiring: conditional def_releases() after add_member()
- Save/load schema bump 1.0.0 -> 1.1.0 (additive optional fields)
- Identity migration v1.0.0 -> v1.1.0; v1.0.0 files load with rigid defaults
- Forward-compat test: v1.0.0 reader silently ignores release fields
- Undo/redo covers single + bulk release edits via existing zundo plumbing
```

8.2 Push to `feature/2dfea-member-end-releases-mz`. Open PR. Run Gate 1 (type-check + tests + build) and Gate 2 (manual QA matrix). Rebase-merge into `master`.

## 8. Test & Verification Plan

### Automated gates

| Gate | Command (from `2dfea/`) | Passes when |
|------|-------------------------|-------------|
| Type check | `npm run type-check` | Zero TS errors |
| Unit tests | `npm test` | All Vitest suites green, including new `releaseTuple.test.ts` and the extended `forwardCompat.test.ts` |
| Production build | `npm run build` | Exit 0; `dist/` produced |
| Preview | `npm run preview` | Worker loads; analysis runs; releases honoured in built output |
| CI | `pr-checks.yml` | Workflow green on the feature PR |
| CI deploy | GitHub Actions `Deploy 2D FEM to GitHub Pages` | Workflow green on merge |

### Vitest cases

- `releaseTuple.test.ts`: 4 cases (none / start-only / end-only / both) for `elementReleaseTuple`.
- Extend an existing IO round-trip test (e.g. `canonicalize.test.ts` if it exists, otherwise inline in `__fixtures__/cantileverV1.ts`'s consumer test): a model with `releaseEndMz: true` round-trips losslessly through canonicalize → JSON → parse → identity migration.
- Migration test: a v1.0.0 file with no release fields loads under v1.1.0 with `releaseStartMz === undefined` and `releaseEndMz === undefined` (or both `false` if the implementer chose explicit defaults — match whichever the store does).
- `forwardCompat.test.ts`: a v1.1.0 file with `releaseEndMz: true` parses successfully under a v1.0.0 reader (extra fields silently ignored — existing pattern).

### Manual QA matrix

Run through each scenario in `npm run dev`. No console errors or warnings expected.

**Group A — Elements table single + bulk toggle**
1. Load Example. In the Elements table, toggle "Release end" on the single beam → indicator (hollow circle) appears at the j-end on the canvas. Undo → cleared. Redo → re-applied.
2. Build a 3-element portal frame (or use a saved fixture). Multi-select all 3 beams in the table; bulk-set "Release start" via the table's bulk-edit affordance → indicator appears at the i-end of all 3. One undo step → all 3 cleared.

**Group B — Cantilever, release end → tip moment ≈ 0**
3. Load Example (cantilever, 4 m, fixed-free, tip load 10 kN). Run Full Analysis with no releases → record the end moment at j-node (should be 40 kNm at the fixed end, 0 kNm at the tip). Now set `releaseEndMz: true` on the beam. Run again. Expect: end moment at the j-node < 1×10⁻⁶ kNm (essentially zero). End moment at the i-node is still ≈ 40 kNm.

**Group C — Portal frame multi-select beam release**
4. Build a portal frame (2 columns + 1 horizontal beam). Multi-select the horizontal beam only; via the canvas floating panel, click "Release both" → both ends of the beam are now released. Run Full Analysis. Expect: the beam is moment-free along its length (effectively a simply-supported member); the columns carry the moment via fixity at the base. Frame remains stable.

**Group D — Propped cantilever**
5. Build a propped cantilever (fixed at i, roller at j; spans 6 m; UDL 5 kN/m). Run with no releases → end moment at the fixed end ≈ -3wL²/8 = -22.5 kNm (sign per the convention; magnitude is the test). Now set `releaseEndMz: true` on the j-end. Run again. Expect: end moment at j ≈ 0; end moment at i ≈ -wL²/2 = -90 kNm (now a pure cantilever — verify against standard table for a cantilever with UDL: M_fix = -wL²/2).

**Group E — Save/load round-trip**
6. Build any model with at least one released end. Save (Ctrl+S). Inspect the JSON: `"schemaVersion": "1.1.0"`; the released elements have `releaseEndMz: true` (or `releaseStartMz: true`); rigid elements **omit** both fields. Reload (Ctrl+O) the same file. Expect: model state matches; canvas shows the hollow-circle indicators at the same ends.
7. Manually edit the saved file to set `"schemaVersion": "1.0.0"` and remove the release fields. Reload. Expect: file loads via the identity migration; all elements are rigid (no indicators).
8. Manually create a v1.0.0 file with extra `releaseEndMz: true` fields (simulating a forward-compat scenario). Reload. Expect: parse succeeds; release fields are honoured (Zod schema accepts them as optional).

**Group F — Undo/redo single + bulk**
9. Toggle "Release start" on one element via the canvas panel. Undo (Ctrl+Z). Redo (Ctrl+Shift+Z). Expect: single-step coverage in both directions.
10. Bulk-set "Release end" on 5 selected elements via the canvas panel. Undo (Ctrl+Z). Expect: **one** undo step reverts all 5 (not 5 separate steps).

### Edge cases to sanity-check

| Case | Expected |
|------|----------|
| Both ends released on a beam with axial load only | Stable; beam carries axial as truss member. PyNite handles. |
| Both ends released on a beam with transverse UDL **and the surrounding system provides translational support** (e.g. pin + roller, or junction nodes that constrain Dx/Dy) | **Stable — simply-supported beam.** Moment is zero at the released ends, parabolic along the span, peak at midspan. PyNite reports correct results. No error. (Releases free *moment transfer through the end*; translational DOFs and supports remain in effect — the kinematic system is unchanged from a classic simply-supported beam.) |
| Both ends released on an isolated beam with insufficient supports (e.g. one free end, no junction connections, no constraints on Dx/Dy) | **Unstable** — mechanism. This is a property of the system being under-constrained, not of the releases themselves. PyNite raises a solver error; existing analysis-error toast surfaces it. (Documented behaviour; not blocked at the JS layer — same as any other under-constrained model.) |
| Element with releaseStartMz but i-node has no other elements (free end) | Stable if the i-node has appropriate boundary conditions; otherwise unstable (mechanism). PyNite catches. |
| v1.0.0 file imported into v1.1.0-aware app | Identity migration; releases default false; no warnings. |
| v1.1.0 file (with releases) imported into a v1.0.0-pinned reader | Zod parse succeeds; release fields silently ignored. |
| Bulk-edit on mixed-state selection ("Release start": some are true, some false) | All set to true. Idempotent on already-true; one undo step. |
| "Clear releases" on a selection where none are released | No-op (state-equal); zundo skips the no-op or records a benign no-op step (existing behaviour — match it). |
| Indicator positioning on a very short element (L_screen < 28 px) | Offset capped at `0.1 × L_screen`; indicator stays inside the element. |
| Indicator positioning on a very long element (L_screen > 140 px) | Offset capped at 14 px; indicator stays visually local to the released end. |
| Element drawn over an existing canvas-floating-panel area | Existing panel positioning logic handles overlap; release panel uses the same convention. |

### Deployment verification (post-push)

1. Wait for Actions: https://github.com/magnusfjeldolsen/structural_tools/actions.
2. Hard-refresh (`Ctrl+Shift+R`) https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
3. Repeat manual QA group B test 3 (cantilever release-end → tip moment ≈ 0) in production.
4. Network tab: no new 4xx/5xx.

## 9. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hollow-circle indicator overlaps the orange node marker on short elements | Medium | Low | Offset rule `min(0.1 × L_screen, 14 px)` (§5.7) keeps the indicator clear of the node on any zoom level. |
| Bulk-set ambiguity on mixed selection | Medium | Low | Explicit "set true" / "Clear releases" semantics — no toggle. Indeterminate visual on table columns. Documented in §5.4 and §5.6. |
| Schema bump breaks loading of old `localStorage` snapshots | Low | Low | Identity migration; old files default-rigid on import. Verified by group E test 7. |
| PyNite physical-member descritization mishandles end-only releases on the end-most sub-member | Very low | Medium | Already verified during snap-to-element-projection planning: PyNite's `descritize()` preserves `def_releases` correctly on the sub-member at the released end. No new risk introduced. |
| Both-ends-released on a member whose surrounding structure under-constrains it → solver error | Low | Low | This is a system-level mechanism, not a release-specific issue (a fully-rigid member in the same configuration would also be unstable). PyNite raises; existing analysis-error toast surfaces it. Both-ends-released by itself is the simply-supported beam case and is fully stable when the rest of the model provides translational supports. Not a regression — listed in non-goals (§4: "no automatic stability validation"). |
| Future 3D extension forces a breaking change | Expected | Low | §5.10 documents the MAJOR-bump migration path. Recorded so a future contributor doesn't reinvent it. |
| Indicator clutter on dense models with many releases | Low | Low | Marker is small (5 px), thin (1.5 px), and only renders when actually released. Dense-model UX is acceptable. If reports come in, hide-on-zoom-out is a polish follow-up. |
| User toggles "Release both" on a load-bearing column → mechanism | Low | Medium | PyNite raises solver error; existing analysis-error toast catches it; user can undo (Ctrl+Z). Documented in §4 (no auto-stability check). |
| Bulk-edit on 100+ selected elements creates 100 history steps instead of 1 | Low | Medium | Match the existing zundo grouping pattern in the table's bulk-edit affordance — must wrap in one history step. Verified by group F test 10. |
| Canonicalize emits `releaseStartMz: false` instead of omitting | Low | Low | Explicit `if (el.releaseStartMz)` check in canonicalize.ts (§5.9). Verified by group E test 6 (the byte-level inspection). |
| Deployment cache serves old bundle for 1–2 min | Expected | Low | Hard refresh during verification. |

## 10. Rollout & Deployment

- **Branch strategy**: feature branch `feature/2dfea-member-end-releases-mz`. Push, open PR, run the agent's Gate 1 (type-check + tests + build via `pr-checks.yml`) and Gate 2 (manual QA matrix in §8) per the structural-feature-implementer agent definition. Two-gate approval: Gate 1 = automated `pr-checks.yml` green; Gate 2 = explicit `merge` after manual QA accept. Rebase-merge into `master`. Branch protection rule on `master` enforces Gate 1.
- **Deployment trigger**: any push touching `2dfea/**` auto-runs `.github/workflows/deploy-all-modules.yml` (which now also runs `npm test`). Expected 2–3 minutes to go live at https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
- **Plain-HTML-module impact**: none.
- **Rollback**: single-commit revert:
  ```bash
  git revert <commit-sha>
  git push origin master
  ```
  Redeploy in ~3 min. **Caveat**: any model saved during the v1.1.0 window with explicit `releaseEndMz: true` will, after rollback, fail Zod validation under v1.0.0 unless the schema's `passthrough` / `strip` mode accepts unknown fields. Verify `forwardCompat.test.ts` covers this case before merge — if the v1.0.0 schema is `strict`, releases must be filtered on load post-rollback (one-time data fix). The existing `forwardCompat.test.ts` pattern should already protect this; goal #7 makes it a contract.
- **Migration notes for users**: none. v1.0.0 files load unchanged. v1.1.0 files with releases are forward-readable by v1.0.0 readers (extra fields silently ignored).

## 11. Observability & DX

- **Inline comments / JSDoc**:
  - `elementReleaseTuple` JSDoc cites the PyNite docs URL and the 2D-only convention.
  - `pynite_analyzer.py`'s `def_releases` block has a comment noting "2D: only Rzi/Rzj are touched; all other DOFs remain rigid. See https://pynite.readthedocs.io/en/latest/member.html for the full signature."
  - `CanvasView.tsx` indicator block has a comment: `// Hollow circle = standard structural drawing convention for moment release. See docs/plans/member-end-releases-mz.md §5.7.`
- **README quick-reference line** under "Element editing": described in Phase 7.
- **Future-3D pointer**: a one-line comment in `types.ts` next to the new fields: `// 2D: only Mz releases. Future 3D will MAJOR-bump to a nested releases object — see docs/plans/member-end-releases-mz.md §5.10.`
- **Console diagnostics (dev only)**: optional — log `[Releases] Element E1: start=true end=false` in dev mode when an element with releases is processed by the analyzer. Off by default in prod (Vite tree-shakes the `if (import.meta.env.DEV)` block).
- **Tooltip on indicator**: optional — a one-line tooltip on the hollow circle: "Mz released at this end". Implementer's pick.
- **Future 3D extension note** (§5.10): recorded in the plan and as a comment in `types.ts` so a future contributor knows the planned migration path.

## 12. Success Metrics

Post-merge the feature is successful when:

1. The Elements table shows two boolean columns and supports single + bulk edit at https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
2. The canvas floating panel appears on selection and applies releases to all selected elements with one undo step.
3. The canvas reveals "i" / "j" labels on hover/select.
4. Hollow-circle indicators render at every released endpoint and are visually distinct from node markers and snap markers.
5. PyNite analysis of a cantilever with `releaseEndMz: true` produces a tip moment < 1×10⁻⁶ kNm; rigid result has the expected non-zero moment.
6. Save/load JSON files have `"schemaVersion": "1.1.0"`; releases round-trip; rigid elements omit the new fields.
7. v1.0.0 files load with rigid defaults; v1.1.0 files with releases are forward-readable by v1.0.0 readers.
8. `cd 2dfea && npm test`, `npm run type-check`, `npm run build` are green on `master`.
9. `pr-checks.yml` is green on the feature PR.
10. GitHub Actions deploy run is green on the merge commit.
11. Manual QA groups A–F all pass.
12. No console errors in dev or prod; no React warnings; no PyNite warnings beyond pre-existing baseline.
