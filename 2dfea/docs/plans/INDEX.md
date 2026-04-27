# 2dfea Plans Index

Feature plans for the 2dfea module, produced by the `feature-planner` agent. Each plan is a self-contained, executable specification — a contract between intent and implementation. One plan per file, kebab-case slug. Plans that have shipped are left in place as historical reference, not deleted.

## Plans

- [Quick Wins Cleanup](quick-wins-cleanup.md) — bundled tidy-up of four TODO items: worker-path warning (E1), stale worker-test.html refs (E2), wire `getActiveResults()` to `activeResultView` (B1), and `baseline-browser-mapping` bump (E4).
- [Undo / Redo](undo-redo.md) — bounded history stack via `zundo`; `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; tracks model data only; invalidates analysis on undo/redo.
- [Save / Load JSON](save-load-json.md) — schema-versioned JSON file export/import; Zod validation; published JSON Schema; AI-friendly format with unit-suffixed fields and `_comments`. Ctrl+S export / Ctrl+O import.
