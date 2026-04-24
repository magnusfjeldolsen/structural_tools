# 2dfea TODO

Ranked pick-list — top of list = do next. Pick one, then ask for a detailed plan.

## Quick wins (do-in-an-hour)

1. **E1. Fix worker path warning** — Vite warns about `/public/workers/solverWorker.js`; caller should use `/workers/...`.
2. **E2. Update stale `test/worker-test.html` refs** — `serve.py`, `UNIT_CONVERSIONS.md`, `src/analysis/README.md` point at the old path.
3. **B1. Wire `getActiveResults()` to UI store** — known TODO at [useModelStore.ts:948](2dfea/src/store/useModelStore.ts#L948); currently ignores `selectedResultType`/`selectedResultName`.
4. **E4. Bump `baseline-browser-mapping`** — `npm i baseline-browser-mapping@latest -D`.

## Foundation (do before model grows)

5. **A4. Save / Load model to JSON** — no persistence today; also autosave to `localStorage` so reloads don't wipe work.
6. **D1. Undo / Redo** — cheaper to add now than after sections/materials/releases expand the model shape.

## Core modelling (biggest user-facing gains)

7. **A1. Steel section library** — port database + spec from [`2dframeanalysis/devspecs/steel_section_integration_spec.md`](2dframeanalysis/devspecs/steel_section_integration_spec.md); Section Type + Profile + Bending-axis dropdowns in Elements tab.
8. **A2. Materials library** — predefined steel/concrete/aluminium grades auto-filling E. Pairs naturally with A1.
9. **A3. Member end releases (hinges)** — per-element `{ nodeI: {Mz: bool}, nodeJ: {Mz: bool} }`; wire into PyNite.

## Polish & UX

10. **C4. Visual-feedback audit** — confirm blue/yellow/green cell styles are consistent across Nodes, Elements, and all three Loads tables.
11. **C1. Tab key across load tables** — arrows work within a table; Tab currently can't jump between Nodal / Distributed / Point.
12. **C2. Direction field in load tables** — currently read-only; decide: mark it non-interactive, or make it an editable dropdown.
13. **C3. Collapsible load sections** — optional space-saver ("Nodal Loads (3)" → collapse).
14. **D2. Multi-select + bulk edit** — select N nodes/elements, edit a shared field once.
15. **D3. Copy/paste whole rows** — today clipboard is one number; support node/element row copy.

## Deferrable

16. **B2. Reactions display** — confirm it's exposed in the UI; if not, add a table.
17. **B3. Design utilization bars** — per-element EC3 ratios. Wait until A1 + A2 land.
18. **E3. `npm audit`** — 2 moderate, 1 high; check if `npm audit fix` is safe before a release.
