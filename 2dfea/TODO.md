# 2dfea TODO

Ranked pick-list — top of list = do next. Pick one, hand off to `feature-planner`.

## Recently shipped

- **A4. Save / Load model to JSON** ([PR #18](https://github.com/magnusfjeldolsen/structural_tools/pull/18), merged 2026-04-29) — schema-versioned JSON file export/import via Zod + a published JSON Schema document at `/2dfea/schemas/2dfea-model-v1.json`. AI-friendly format with unit-suffixed field names (`x_m`, `E_GPa`, `I_m4`), open-keyed `model`/`loads`/`idCounters` via `.passthrough()` so future MINOR bumps (sections, materials, releases, new load types) don't reject v1 readers. `Ctrl+S` export / `Ctrl+O` import with focus guards. Confirm-before-overwrite gates non-empty imports. Single canonical serializer drives both file artifact and `persist` middleware (also fixed a latent ID-counter `partialize` bug). Vitest suite (52 tests) added as devDep — single co-located `*.test.ts` convention. Follow-up TODOs tracked in plan §11 (`metadata.appVersion` wiring, comment editor UX, styled-modal replacement). Plan: [docs/plans/save-load-json.md](docs/plans/save-load-json.md).
- **D1. Undo / Redo** ([PR #17](https://github.com/magnusfjeldolsen/structural_tools/pull/17), merged 2026-04-27) — bounded 50-entry history via `zundo` temporal middleware composed inside `devtools(persist(temporal(immer(...))))`. Tracks model-authored data only (nodes, elements, loads, cases, combos, ID counters); excludes UI/selection/solver/results. `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` shortcuts (with input-focus + command-input guards) plus toolbar buttons on every tab. Undo/redo invalidates `analysisResults` + `resultsCache`. `loadExample` calls `temporal.clear()` (non-undoable initialization). Plan: [docs/plans/undo-redo.md](docs/plans/undo-redo.md).
- **2dfea quick wins cleanup** ([PR #16](https://github.com/magnusfjeldolsen/structural_tools/pull/16), merged 2026-04-24) — four small fixes: silenced Vite `/public/...` warnings (worker + 2 Python fetches), bumped `baseline-browser-mapping`, updated 3 stale `worker-test.html` doc refs, wired `getActiveResults()` to `activeResultView`. Fixed a latent prod bug where the Worker URL would strip the base path. Plan: [docs/plans/quick-wins-cleanup.md](docs/plans/quick-wins-cleanup.md).

---

## Core modelling — next up

Do **A1 → A2 → A3** in order. A1 and A2 pair tightly (adding a "Section" field naturally raises "which material?"), and A3 layers cleanly on top. The save/load schema is **already forward-compat-ready** for all three — `model.elements` accepts `sectionRef`/`materialRef`/`releases` as optional MINOR-bump siblings (see save-load-json plan §5.3 "A1/A2 forward-compat policy").

### A1. Steel section library

Port the section database + spec from the sibling module:
- **Database:** [`steel_cross_section_database/`](../steel_cross_section_database/) — JSON files for IPE, HEA, HEB, HEM, CHS, RHS, SHS (cold + hot-finished)
- **Spec:** [`2dframeanalysis/devspecs/steel_section_integration_spec.md`](../2dframeanalysis/devspecs/steel_section_integration_spec.md) — Section Type + Profile + Bending-axis dropdowns, strong/weak axis toggle, UI flow already fully specified

**UI surface:** [src/components/tables/ElementTable.tsx](src/components/tables/ElementTable.tsx). Extend element data model in [src/analysis/types.ts](src/analysis/types.ts).

**Stretch (A1.1):** Searchable section dropdown — typing `150/10`, `150x10`, or `150x150x10` filters SHS list.

### A2. Materials library

Predefined materials (steel S235/S275/S355, concrete C25/30/…, aluminium) that auto-fill E. See [`2dframeanalysis/devspecs/material_library_spec.md`](../2dframeanalysis/devspecs/material_library_spec.md).

Pairs with A1 — both add dropdowns to the Elements tab. One UI rework instead of two.

### A3. Member end releases (hinges)

Per-element `{ nodeI: {Mz: boolean}, nodeJ: {Mz: boolean} }` — pin/fix moment at each end. Fundamental 2D frame feature, missing today. Wire into PyNite's release mechanism.

---

## Polish & UX

- **C4. Visual-feedback audit** — confirm blue (selected) / yellow (editing) / green (paste-compatible) cell styles are consistent across Nodes, Elements, and the three Loads tables.
- **C1. Tab key across load tables** — arrows navigate within a table; Tab currently can't jump between Nodal / Distributed / Point.
- **C2. Direction field in load tables** — currently read-only; decide: mark non-interactive, or make editable dropdown.
- **C3. Collapsible load sections** — optional space-saver ("Nodal Loads (3)" → collapse).
- **D2. Multi-select + bulk edit** — select N nodes/elements, edit a shared field once.
- **D3. Copy/paste whole rows** — today clipboard is one number; support node/element row copy.

## Deferrable

- **B2. Reactions display** — confirm it's exposed in the UI; if not, add a table.
- **B3. Design utilization bars** — per-element EC3 ratios. Blocked on A1 + A2.
- **E3. `npm audit`** — 2 moderate, 1 high; check if `npm audit fix` is safe before a release.

---

## Notes for the planner

- All items live in `2dfea/` (React/TypeScript/Vite/Zustand). None touch the 20+ plain HTML modules.
- Current state verified clean: `npm run type-check` + `npm run build` pass on master; dev log has zero warnings.
- Plans go in [`docs/plans/<feature-slug>.md`](../docs/plans/) with an entry appended to [`docs/plans/INDEX.md`](../docs/plans/INDEX.md). First plan in that folder is the quick-wins cleanup — use it as a format reference.
- Architecture snapshot in [2dfea/README.md](README.md); deployment model in [2dfea/DEPLOYMENT.md](DEPLOYMENT.md); unit handling in [2dfea/UNIT_CONVERSIONS.md](UNIT_CONVERSIONS.md).
