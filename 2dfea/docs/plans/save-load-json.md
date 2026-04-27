# 2dfea Save / Load model to JSON

## 1. TL;DR

Add explicit JSON file export and import to the 2dfea app, plus a schema-versioned, AI-friendly model serialization format that doubles as the canonical shape for both the existing `localStorage` autosave (`'2dfea-model-storage'`) and the file artifact. One serializer, two sinks. Format is a deterministic, pretty-printed JSON document with explicit unit annotations, an extensible `metadata` block, optional per-entity `comments`, and a top-level `schemaVersion: "1.0.0"` field. Migration plumbing is in place for future schema bumps; a published JSON Schema document grounds future AI-prompt-based generation. Import calls `useModelStore.temporal.getState().clear()` so undo cannot rewind into the pre-import model. `loadExample` becomes a true fallback — gated to fire only when no `'2dfea-model-storage'` entry exists. Validation is performed by **Zod** (chosen over hand-rolled and Ajv — see §5). Keyboard shortcuts: **Ctrl+S** export, **Ctrl+O** import, with the same input-focus + command-input guards as undo/redo.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4.4 + Immer + zundo + Konva. Triggers `.github/workflows/deploy-all-modules.yml` on push to `master`/`main` touching `2dfea/**`. No plain HTML modules touched.
- **Source of truth for the feature**: `2dfea/TODO.md` → **A4. Save / Load model to JSON + localStorage autosave**. Key constraints from that entry, honoured below:
  - "Schema versioning — a saved file today should still load in 6 months when the model shape grows."
  - "Analysis results: exclude from the save blob (recompute on load) or include (faster reload)? Probably exclude."
  - "`activeResultView`, `isAnalyzing`, worker state etc. must NOT be persisted — only model-authored data. The `TRACKED_KEYS` list in [src/store/historyConfig.ts](src/store/historyConfig.ts) is a good baseline for 'what to save'."
  - "On import: call `useModelStore.temporal.getState().clear()` after replacing state so undo can't take the user back to the pre-load model."
  - "`loadExample` should remain the fallback when no `'2dfea-model-storage'` entry exists; gate accordingly."
- **Current relevant store surface** (`2dfea/src/store/useModelStore.ts`):
  - Composition: `devtools(persist(temporal(immer(...))))` (verified lines 240–1087).
  - `persist` middleware is already wired with `name: '2dfea-model-storage'` (line 1072) and `partialize` covering `nodes / elements / loads / loadCases / loadCombinations / activeLoadCase / activeResultView` (lines 1073–1082).
  - **The persist `partialize` does NOT include the `next*Number` ID counters** (lines 1073–1082). This is a latent bug that A4 must fix to keep round-tripping correct: counters are part of `TRACKED_KEYS` (line 26 of `historyConfig.ts`) and must also be in the persisted slice and in the file export. Without this, reload after creating N99 then deleting it would re-issue N1 → N99 collisions.
  - `loadExample` (line 1017) currently runs unconditionally (called by `Toolbar.tsx:285`). After it mutates state it calls `useModelStore.temporal.getState().clear()` (line 1060) — so calling it from a startup gate is safe and idempotent.
  - `activeResultView` is a UI-ish but persisted field today (`type: 'case' | 'combination'`, `name: string | null`). Decision (see §5): treat it as **part of the saved file** — it is small, lossless, and re-creates the user's last view on import. It is a "soft UI" field that is not part of `TRACKED_KEYS` (undo/redo doesn't touch it) but is part of the persisted/exported model.
- **Tracked-slice baseline**: `TRACKED_KEYS` in `2dfea/src/store/historyConfig.ts:26-38` is the canonical model-authored slice. A4's serializer is built around exactly this set, plus `activeLoadCase` and `activeResultView` (already in persist), plus a `metadata` envelope. Every field in `TRACKED_KEYS` round-trips losslessly.
- **Type definitions**: `2dfea/src/analysis/types.ts` defines `Node`, `Element`, `NodalLoad`, `DistributedLoad`, `ElementPointLoad`, `LoadCase`, `LoadCombinationDefinition` — these are the entities that become arrays in the saved file. Units are documented inline (m, kN, kNm, GPa).
- **Keyboard hook surface**: `2dfea/src/hooks/useKeyboardShortcuts.ts:23,54,134,139` already establishes the `commandInput.visible` guard, the `isEditingInput` guard (input/textarea/contenteditable), and the Ctrl+Z/Y dispatch pattern. A4 plugs into the **same** hook with the **same** guard signature.
- **Toolbar surface**: `2dfea/src/components/Toolbar.tsx:285-291` already hosts the `Load Example` and `Clear Model` buttons in the same actionButton area. A4's Import/Export buttons sit in a parallel "File" mini-group adjacent to the Edit (Undo/Redo) group introduced by D1.
- **Browser API capabilities**: assume modern evergreen browsers (Chrome/Edge/Firefox). The File System Access API (`window.showSaveFilePicker`, `showOpenFilePicker`) ships in Chromium-based browsers but **not** Firefox. A4 uses the universally supported anchor-download + `<input type="file">` pattern (see §5 risk register).
- **Open questions**:
  1. **Should `comments` fields on entities round-trip?** Yes — they are first-class data in the file. They are NOT pushed onto every Node/Element/Load type at runtime (would bloat existing UI). Instead the schema parser **strips and re-attaches** comments via a parallel `_comments?: { nodes?: Record<string,string>; ... }` map (see §5). This keeps `types.ts` stable while making files annotatable. Confirmed: see §5 sub-section "Comment handling".
  2. **Should `activeResultView` be saved?** Yes — it is already persisted to `localStorage` today and is small. Saving it preserves the user's view-result preference across export/import. The selectors that consume it gracefully fall back when the named case/combination is absent.
  3. **Should `analysisResults` / `resultsCache` be saved?** No — derived data, recomputed on load, can be 10–100× larger than the model. Matches the policy already documented in `undo-redo.md` §5 ("Why not track results in history?"). A future "include cached results" toggle could be added as a non-default opt-in; out of scope for v1.
  4. **What does the "App version" in metadata read from?** **v1.0.0 ships with `appVersion: "unknown"` as the hard-coded default.** Wiring it through `vite.config.ts` (reading `package.json`'s `version` field and exposing via `import.meta.env.VITE_APP_VERSION`) is **deferred to a follow-up TODO**. The `appVersion` field exists in the schema today specifically so this follow-up does not require a schema bump — it is forward-compatible. See §11 "Follow-up TODOs" for the explicit reminder; this is intentional debt, not an oversight.
  5. **Should import overwrite the current model without confirmation?** **No.** v1 ships a confirm-before-overwrite dialog whenever the import target would replace a non-empty model. See goal #14 and Phase 5.
  6. **Test runner**: **Vitest is in scope for v1.** Adding it now (rather than deferring) is justified by the round-trip-determinism contract — silent regressions in serialization are exactly the kind of bug a manual checklist won't catch. Vitest = single config, single command (`npm test`), single test directory under `2dfea/`. Future features add to the same suite; there is no mechanism by which it produces "multiple sets" of tests. devDependency only — zero production bundle impact. See Phase 1 (steps 1.5–1.8) and §8.

## 3. Goals (Definition of Done)

Each goal is observable and must be verifiable post-merge.

1. A toolbar button **📤 Export JSON** (visible on every tab) downloads the current model as a pretty-printed `.json` file named `2dfea-model-<ISO-timestamp>.json` (e.g. `2dfea-model-2026-04-27T1535.json` — colons replaced with empty string for filename safety).
2. A toolbar button **📥 Import JSON** (visible on every tab) opens a native file picker; selecting a `.json` file replaces the model with the loaded data and `useModelStore.temporal.getState().clear()` is called immediately after the model state is replaced.
3. **Ctrl+S** triggers Export; **Ctrl+O** triggers Import. `Cmd+S` / `Cmd+O` work on macOS. Both shortcuts use the same focus guard as undo/redo (no fire when an input/textarea/contenteditable is focused, no fire when `commandInput.visible`). The browser's native Save Page / Open File is preempted via `e.preventDefault()` on the matched key combo.
4. The exported file's top-level shape contains exactly:
   ```
   {
     "schemaVersion": "1.0.0",
     "metadata": { ... },
     "model": { ... },              // all of TRACKED_KEYS plus activeLoadCase + activeResultView
     "_comments": { ... } | undefined
   }
   ```
   See §5 for the full schema. Pretty-printed with 2-space indentation. Trailing newline at EOF.
5. **Lossless round-trip** for the tracked slice: import → export → import yields a byte-identical second export (when `metadata.exportedAt` and other timestamp fields are masked/canonicalised; see §5). Verified by an automated round-trip test in §8.
6. **Schema validation on import** rejects:
   - Files that aren't valid JSON (toast: "Could not parse file: <message>").
   - Files whose `schemaVersion` is unknown to the running app (toast: "Unsupported schema version <vN>. This file was created by a newer version of 2dfea — please update.").
   - Files whose structure fails Zod validation (toast: "Invalid model file: <first ZodError path + message>"). Up to three additional errors are logged to the DevTools console for power users.
   - Files that pass syntactic validation but fail **semantic validation** (e.g. an element references a node ID that doesn't exist; a distributed load references a missing element). Toast: "Model is structurally invalid: <human-readable issue>". The store is **not** mutated.
7. **Migration plumbing is in place but no migrations are registered for v1.0.0** (identity migration only). Adding a v2 migration in the future requires adding one entry to a `migrations` map and bumping `CURRENT_SCHEMA_VERSION` — no other code changes.
8. The `persist` middleware's `partialize` is updated to include the `next*Number` ID counters (parity with `TRACKED_KEYS`) so reloads no longer reset counters silently. Existing `localStorage` entries written by prior versions still load (counters fall back to `1` and are then bumped via `getNextNodeNumber` / `getNextElementNumber` against the loaded nodes/elements; this is verified in §8 group F).
9. **`loadExample` is gated**: on app boot, `loadExample()` runs **only when** `localStorage.getItem('2dfea-model-storage')` is null/empty. If a persisted model exists, `persist`'s rehydration takes over and `loadExample` is **not** called. The gating logic lives in `App.tsx` (or wherever `loadExample` is currently kicked off) — verify and wire there.
10. A **canonical JSON Schema document** is published at `2dfea/public/schemas/2dfea-model-v1.json`. It is loaded via `import.meta.env.BASE_URL` in dev tools / docs, downloadable from `https://magnusfjeldolsen.github.io/structural_tools/2dfea/schemas/2dfea-model-v1.json`. Generated from the Zod schema using `zod-to-json-schema` so there is exactly one source of truth.
11. **Per-entity comments** can be attached and round-trip: the file's optional `_comments` block maps entity-IDs to free-form strings. Importing a file with comments populates a runtime `comments: Record<string, string>` map on the model (NOT on the entities themselves — kept in a parallel store slice to avoid widening every type in `types.ts`). Exporting re-emits the comments. UI for editing comments is **out of scope for v1** (see Non-Goals); the round-trip is the deliverable.
12. **Import-during-analysis is safe**: if the user clicks Import while `isAnalyzing` is true, the import is queued — a confirm dialog warns "Analysis is running. Import anyway? Results will be discarded." On confirm, `clearAnalysis()` runs first, the import proceeds, and the worker's in-flight result (if any) is dropped via the existing `resultsCache` invalidation pattern.
13. **Confirm-before-overwrite on import**: if the import target would replace a non-empty current model (any of `nodes`, `elements`, `loads` non-empty), a confirm dialog warns "Importing will replace your current model (N nodes, M elements, K loads). Continue?". On cancel, the import is aborted without mutating state. On confirm, the normal import flow proceeds. This dialog is **separate** from goal #12's analysis-running dialog — both fire if both conditions are true (analysis dialog first, then overwrite dialog).
14. **Vitest test suite**: `cd 2dfea && npm test` runs the round-trip + validation suite (see §8) with **zero failures**. Suite covers: round-trip byte determinism, schema-version mismatch, malformed JSON, semantic-validation failures (orphan IDs), comment round-trip, ID-counter round-trip, migration plumbing identity. Vitest is added as a `devDependency` only — no production bundle impact.
15. `cd 2dfea && npm run type-check` passes with zero errors.
16. `cd 2dfea && npm run build` succeeds. The GitHub Actions deploy workflow completes successfully on push to `master`.
17. Manual QA matrix (§8) groups A through G all pass.
18. Bundle-size delta from Zod ≤ 15 KB minified+gzipped (verified via `npm run build` size report). Vitest contributes **zero** runtime bundle impact (devDependency only).
19. No console errors or React warnings in dev or preview.

## 4. Non-Goals

Explicitly out of scope for this plan:

- Not an AI prompt builder. A4 ships the file format and round-trip plumbing; the actual AI integration (prompt templates that accept the JSON Schema as context, model-generation/modification UI, etc.) is a follow-up and lives in a future plan.
- Not cloud sync, multi-user, or shareable URLs. Local file only.
- Not binary or compressed formats (Protobuf, msgpack, gzip-wrapped JSON). Plain JSON.
- Not history persistence — undo/redo `pastStates`/`futureStates` are intentionally **not** in the saved file (matches `undo-redo.md` goal #10). Importing always calls `temporal.clear()`.
- Not `analysisResults` / `resultsCache` in the saved file (recompute on load).
- Not a UI for editing per-entity `comments` — schema supports them, the in-app comment editor is a follow-up. v1 only round-trips comments authored externally (e.g. by an AI or by hand-editing a JSON file).
- Not migration **logic** — the migration **plumbing** is in place, but v1 only has the identity migration. Real migrations are written when v2 ships.
- Not an automatic "open last file on app start" feature — autosave already covers that via `localStorage`.
- Not changing the solver/Pyodide flow.
- Not touching any plain HTML module, GA tag, `vite.config.ts`, or workflow yaml.

## 5. Architecture & Design

### 5.1 The serializer is the canonical model

There is **one** canonical model serializer used by both the file export/import path and (after refactor) the `persist` middleware. Two sinks, identical schema. This is the most important architectural decision in this plan because it prevents drift between what's in `localStorage` and what's in a `.json` file.

```
┌──────────────────────┐
│ ModelState (Zustand) │
└────────┬─────────────┘
         │ canonicalize()
         ▼
┌──────────────────────┐         export      ┌──────────────────────┐
│  ModelFileV1 (JSON)  │ ─────────────────▶  │  download .json      │
└────────┬─────────────┘                     └──────────────────────┘
         │                                  
         │ persist.partialize                
         ▼                                  
┌──────────────────────┐                    
│ localStorage entry   │                    
└──────────────────────┘                    
```

Going the other way: `ModelFileV1 → validate (Zod) → migrate (if needed) → applyToStore() → temporal.clear()`.

The `applyToStore` function is invoked from both the file import path and from `persist`'s `onRehydrateStorage` (after the existing rehydration). This gives a single guaranteed-correct mutation path.

### 5.2 Schema design — the v1 shape

The schema is laid out for **AI consumption first, human readability second, machine compactness last**. Field names are explicit; units are annotated next to numeric fields; the structure mirrors the conceptual model (nodes → elements → loads → cases → combinations) rather than the runtime store layout.

**Top-level**:

```jsonc
{
  "schemaVersion": "1.0.0",
  "metadata": {
    "appVersion": "unknown",               // v1.0.0 default — Vite-time package.json wiring is a follow-up (see §11 "Follow-up TODOs")
    "exportedAt": "2026-04-27T15:35:00Z",  // ISO 8601 UTC
    "name": "Cantilever sample",           // Optional, free text
    "description": "Single 4 m fixed-free beam under tip load",  // Optional
    "author": null,                        // Optional, free text — null in v1 (no user accounts)
    "units": {                             // Pinned for clarity; v1 is not unit-configurable
      "length": "m",
      "force": "kN",
      "moment": "kNm",
      "stress": "GPa",
      "areaMomentOfInertia": "m4",
      "area": "m2"
    }
  },
  "model": {
    "nodes": [
      {
        "name": "N1",
        "x_m": 0,
        "y_m": 0,
        "support": "fixed"
      },
      {
        "name": "N2",
        "x_m": 4,
        "y_m": 0,
        "support": "free"
      }
    ],
    "elements": [
      {
        "name": "E1",
        "nodeI": "N1",
        "nodeJ": "N2",
        "E_GPa": 210,
        "I_m4": 1e-4,
        "A_m2": 1e-3
      }
    ],
    "loads": {
      "nodal": [
        {
          "id": "NL1",
          "node": "N2",
          "fx_kN": 0,
          "fy_kN": -10,
          "mz_kNm": 0,
          "case": "Dead"
        }
      ],
      "distributed": [],
      "elementPoint": []
    },
    "loadCases": [
      { "name": "Dead", "description": "Dead loads" },
      { "name": "Live", "description": "Live loads" }
    ],
    "loadCombinations": [],
    "activeLoadCase": "Dead",
    "activeResultView": {
      "type": "case",
      "name": "Dead"
    },
    "idCounters": {
      "nextNodeNumber": 3,
      "nextElementNumber": 2,
      "nextNodalLoadNumber": 2,
      "nextPointLoadNumber": 1,
      "nextDistributedLoadNumber": 1,
      "nextLineLoadNumber": 1
    }
  },
  "_comments": {
    "nodes": {
      "N1": "Fixed support at left end — restrains all DOFs"
    },
    "elements": {
      "E1": "Generated by AI: assumes IPE 200 in steel S275"
    },
    "loads": {
      "NL1": "Tip load; sign convention: y-down is negative"
    }
  }
}
```

**Schema design rules**:

1. **Unit-suffixed field names** for any numeric field that has a physical unit. `x_m`, `y_m`, `fx_kN`, `mz_kNm`, `E_GPa`, `I_m4`, `A_m2`, `w1_kN_per_m`, `x1_m`. Self-documenting; an AI generating the file from a prompt sees the unit in the field name and is far less likely to emit `fx: 10000` (Newtons) when `kN` is expected.
2. **`metadata.units` block is informational + a forcing function**: validators check it equals the v1-pinned values. Future versions could allow user-selected units; v1 locks them at `{ length: "m", force: "kN", moment: "kNm", stress: "GPa", areaMomentOfInertia: "m4", area: "m2" }` to match the existing engine convention (`UNIT_CONVERSIONS.md`).
3. **Stable insertion order in arrays**, sorted keys in objects. Determinism is required for round-trip byte-equality. Implementation: `JSON.stringify` with a custom replacer that sorts object keys alphabetically (`canonicalStringify`, see §5.5). Arrays preserve insertion order — the user's node ordering is meaningful.
4. **No null-vs-undefined ambiguity**: optional fields are **omitted** when absent (canonical), not emitted as `null`. Exception: `metadata.author` is explicitly `null` in v1 (placeholder for a future field). Decision documented to keep schemas predictable.
5. **`idCounters` block is part of `model`**, not metadata. Reason: counters are model-authored data (they affect future entity naming) and round-trip identity. Mirrors the `TRACKED_KEYS` ID-counter inclusion that `historyConfig.ts:32-37` already enforces for undo/redo.
6. **`_comments` is sibling to `model`**, not nested inside entities. Reason: keeps `types.ts` Node/Element/Load shapes stable; comments are an annotation layer. The leading underscore signals "not part of the analysis model".
7. **Direction enums are case-sensitive** matching `types.ts` ('Fx'|'Fy'|'FX'|'FY' for distributed loads, etc.). This is a likely AI-generation footgun — the JSON Schema enum constraint and the Zod schema both enforce it; the validation error message says "expected one of: Fx, Fy, FX, FY (case-sensitive: lowercase = local, uppercase = global)".

### 5.3 Versioning policy (SemVer)

The `schemaVersion` field uses **SemVer string** (`"1.0.0"`, not `1`). Justification:

| Format | Pros | Cons | Verdict |
|--------|------|------|---------|
| Integer (`1`) | Compact, simple comparison | No room for backwards-compatible additions; every change is a "version bump" | Rejected |
| **SemVer string (`"1.0.0"`)** | Conveys breaking-vs-compatible intent; widely understood; supports hotfix path | Slightly heavier comparison logic | **Chosen** |
| Date string (`"2026-04-27"`) | Always-monotonic | No semantic info about breakage | Rejected |

**Bump rules**:
- **MAJOR** (1.x.x → 2.0.0): a schema change that **cannot** be parsed by old code and **requires migration** (e.g. renaming `fy_kN` to `force_y_kN`, removing a field, restructuring `loads.nodal` into a different shape).
- **MINOR** (1.0.x → 1.1.0): an **additive, optional** schema change that old code can ignore (e.g. adding `Element.section?: string`, adding `metadata.tags?: string[]`).
- **PATCH** (1.0.0 → 1.0.1): a documentation-only or non-breaking enum **expansion** (e.g. adding a new `support` type that old code wouldn't see in old files).

**Forward compatibility**:
- Old code reading a newer **MINOR** file: unknown fields are ignored (Zod's default `.passthrough()` for the `metadata` object only; the strict `model` schema will surface unknowns as a console warning but not reject).
- Old code reading a newer **MAJOR** file: rejected with the schema-version error toast (goal #6).

`CURRENT_SCHEMA_VERSION` lives in `src/io/schemaVersion.ts` as a single exported const. Bumping it is a one-file edit (plus migration registration for MAJOR bumps).

### 5.4 Validation library — Zod (chosen)

| Option | Bundle | DX | Schema export | Verdict |
|--------|--------|-----|---------------|---------|
| Hand-rolled validator (~100 LOC) | 0 KB | Type narrowing requires custom guards; verbose | Manual JSON Schema authoring (drift risk) | Rejected |
| **Zod** | ~13 KB min+gz | Excellent — types inferred from schema, ergonomic chained API | `zod-to-json-schema` (~3 KB) generates JSON Schema from Zod schema (single source of truth) | **Chosen** |
| Ajv + JSON Schema | ~30 KB min+gz | Schema-first; runtime validation good; but TS types must be hand-written | JSON Schema is the source of truth | Rejected — heavier and DX inferior to Zod for our scale |

**Why Zod beats hand-rolled here**:
- A4's "AI-friendly" goal requires publishing a JSON Schema document. Zod + `zod-to-json-schema` gives that for ~3 KB extra and zero hand-maintenance. A hand-rolled validator would force us to author and sync a separate JSON Schema by hand — the exact drift-risk this plan is trying to avoid.
- TS types for `ModelFileV1` are inferred from the Zod schema (`type ModelFileV1 = z.infer<typeof ModelFileV1Schema>`). One source of truth across runtime validation, compile-time types, and the published JSON Schema.
- Bundle hit (~13 KB gzipped) is acceptable for a feature this central. Verified against goal #16 (≤ 15 KB).

**Why Zod beats Ajv here**:
- Ajv's strength (compile-time-precompiled validators) doesn't matter at our scale (validating a single file on click).
- Zod's TS-first ergonomics are the better fit for the rest of the 2dfea codebase (everything else uses TS-native patterns, not JSON Schema).

### 5.5 Determinism — `canonicalStringify`

Round-trip byte equality (goal #5) requires deterministic JSON.stringify. Options:

- **Hand-rolled `canonicalStringify(obj, indent=2)`** (~30 LOC): recursive `JSON.stringify` replacer that sorts object keys, preserves array order, normalises numbers. **Chosen**.
- `safe-stable-stringify` library (~2 KB): extra dep for ~30 LOC of code we can write inline. Rejected — adds a dependency for trivial functionality.
- `json-stable-stringify`: same as above, slightly larger. Rejected.

Sketch (illustrative, not final code):

```ts
export function canonicalStringify(value: unknown, indent = 2): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  }, indent) + '\n';
}
```

Numeric serialization concerns:
- JS numbers serialize via `toString()`. `1e-4` round-trips as `1e-4` if the source was `1e-4`, but `0.0001` round-trips as `0.0001`. **Decision**: emit numbers as `JSON.stringify` does by default (no custom number formatting); this is deterministic for any given value. Round-trip is parse-then-stringify; we never source-edit numbers.
- `NaN`/`Infinity` are not legal JSON. Validation rejects them with a clear error (Zod's `.finite()` modifier on every numeric field).

### 5.6 Migration plumbing

```ts
// src/io/migrations.ts

import type { ModelFileV1 } from './schema';

export type AnyVersionedModel =
  | { schemaVersion: '1.0.0'; metadata: any; model: any; _comments?: any };

export type MigrationFn = (input: AnyVersionedModel) => AnyVersionedModel;

/**
 * Map from `fromVersion` to a function that returns the next version's shape.
 * v1.0.0 has only an identity migration; future v2.0.0 would register a real one.
 */
export const MIGRATIONS: Record<string, MigrationFn> = {
  '1.0.0': (input) => input,  // identity — no migration needed yet
};

export function migrateToCurrent(input: AnyVersionedModel): ModelFileV1 {
  let current = input;
  while (current.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const fn = MIGRATIONS[current.schemaVersion];
    if (!fn) {
      throw new SchemaVersionError(
        `Unsupported schema version "${current.schemaVersion}".`,
      );
    }
    current = fn(current);
  }
  return current as ModelFileV1;
}
```

Future v2 example (illustrative):
```ts
MIGRATIONS['1.0.0'] = (input) => ({
  ...input,
  schemaVersion: '2.0.0',
  model: {
    ...input.model,
    elements: input.model.elements.map((e: any) => ({
      ...e,
      // v2 introduced section + material refs; provide defaults for v1 files
      sectionRef: null,
      materialRef: null,
    })),
  },
});
```

### 5.7 Comment handling

`_comments` is shaped as:
```ts
{
  nodes?: Record<string /* node name */, string /* free text */>;
  elements?: Record<string /* element name */, string>;
  loads?: Record<string /* load id like "NL1", "DL1", "PL1" */, string>;
  loadCases?: Record<string /* case name */, string>;
  loadCombinations?: Record<string /* combo name */, string>;
}
```

**Storage at runtime**: a new top-level field on `ModelState`:
```ts
comments: {
  nodes: Record<string, string>;
  elements: Record<string, string>;
  loads: Record<string, string>;
  loadCases: Record<string, string>;
  loadCombinations: Record<string, string>;
};
```

Initialised to all-empty objects. **Not** included in `TRACKED_KEYS` (undo/redo doesn't need to undo comment edits — they're metadata). **Is** included in the persist `partialize` and the file export. Adding/editing comments in the UI is out of scope (Non-Goal); the runtime field exists so import doesn't drop them.

This sidesteps the alternative of widening every entity type in `types.ts` with an optional `comment?: string` field, which would:
- Touch dozens of files (every component that maps over nodes/elements/loads).
- Risk widening the analysis-engine wire format.
- Be harder to reason about for future MAJOR migrations.

The "parallel comments map" pattern is the lower-blast-radius choice.

### 5.8 The `applyToStore` mutation path

```ts
// src/io/applyToStore.ts

import { useModelStore } from '../store/useModelStore';
import { INVALIDATE_ANALYSIS_PATCH } from '../store/historyConfig';
import type { ModelFileV1 } from './schema';

export function applyToStore(file: ModelFileV1): void {
  const { model, _comments } = file;

  useModelStore.setState((state: any) => {
    // Tracked slice — replace wholesale
    state.nodes = model.nodes;
    state.elements = model.elements;
    state.loads = model.loads;
    state.loadCases = model.loadCases;
    state.loadCombinations = model.loadCombinations;
    state.nextNodeNumber = model.idCounters.nextNodeNumber;
    state.nextElementNumber = model.idCounters.nextElementNumber;
    state.nextNodalLoadNumber = model.idCounters.nextNodalLoadNumber;
    state.nextPointLoadNumber = model.idCounters.nextPointLoadNumber;
    state.nextDistributedLoadNumber = model.idCounters.nextDistributedLoadNumber;
    state.nextLineLoadNumber = model.idCounters.nextLineLoadNumber;

    // Persist-only fields
    state.activeLoadCase = model.activeLoadCase;
    state.activeResultView = model.activeResultView;

    // Comments (non-tracked, non-undoable)
    state.comments = {
      nodes: _comments?.nodes ?? {},
      elements: _comments?.elements ?? {},
      loads: _comments?.loads ?? {},
      loadCases: _comments?.loadCases ?? {},
      loadCombinations: _comments?.loadCombinations ?? {},
    };

    // Selection — clear, since old IDs may not match new ones
    state.selectedNodes = [];
    state.selectedElements = [];
    state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };

    // Invalidate analysis cache (loaded model has no cached results)
    Object.assign(state, INVALIDATE_ANALYSIS_PATCH);
  });

  // Critical: clear undo/redo history so user can't undo back into pre-import model.
  // Mirrors the contract noted in undo-redo.md §9 risk register.
  (useModelStore as any).temporal.getState().clear();
}
```

Single mutation path; idempotent; survives validation failure (validation runs first, mutation runs only on success).

### 5.9 Semantic validation (post-Zod)

Zod validates **shape**. After Zod passes, run a small **semantic** validator that checks cross-entity references:

```ts
// src/io/semanticValidator.ts
export function semanticValidate(model: ModelFileV1['model']): string[] {
  const errors: string[] = [];
  const nodeNames = new Set(model.nodes.map((n) => n.name));
  const elementNames = new Set(model.elements.map((e) => e.name));
  const caseNames = new Set(model.loadCases.map((c) => c.name));

  // Elements reference real nodes
  for (const e of model.elements) {
    if (!nodeNames.has(e.nodeI)) errors.push(`Element ${e.name} references missing node "${e.nodeI}"`);
    if (!nodeNames.has(e.nodeJ)) errors.push(`Element ${e.name} references missing node "${e.nodeJ}"`);
  }

  // Nodal loads reference real nodes
  for (const l of model.loads.nodal) {
    if (!nodeNames.has(l.node)) errors.push(`Nodal load ${l.id} references missing node "${l.node}"`);
    if (l.case && !caseNames.has(l.case)) errors.push(`Nodal load ${l.id} references missing case "${l.case}"`);
  }
  for (const l of model.loads.distributed) {
    if (!elementNames.has(l.element)) errors.push(`Distributed load ${l.id} references missing element "${l.element}"`);
    if (l.case && !caseNames.has(l.case)) errors.push(`Distributed load ${l.id} references missing case "${l.case}"`);
  }
  for (const l of model.loads.elementPoint) {
    if (!elementNames.has(l.element)) errors.push(`Element point load ${l.id} references missing element "${l.element}"`);
    if (l.case && !caseNames.has(l.case)) errors.push(`Element point load ${l.id} references missing case "${l.case}"`);
  }

  // Combinations reference real cases
  for (const c of model.loadCombinations) {
    for (const factorCase of Object.keys(c.factors)) {
      if (!caseNames.has(factorCase)) errors.push(`Combination ${c.name} factors missing case "${factorCase}"`);
    }
  }

  // activeLoadCase / activeResultView point at extant entities (or null)
  if (model.activeLoadCase && !caseNames.has(model.activeLoadCase)) {
    errors.push(`activeLoadCase "${model.activeLoadCase}" not in loadCases`);
  }
  if (model.activeResultView.name) {
    const set = model.activeResultView.type === 'case' ? caseNames : new Set(model.loadCombinations.map((c) => c.name));
    if (!set.has(model.activeResultView.name)) {
      errors.push(`activeResultView ${model.activeResultView.type}/"${model.activeResultView.name}" not in model`);
    }
  }

  // Unique IDs within each load type
  const dupCheck = (arr: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const x of arr) {
      if (seen.has(x.id)) errors.push(`Duplicate ${label} id "${x.id}"`);
      seen.add(x.id);
    }
  };
  dupCheck(model.loads.nodal, 'nodal load');
  dupCheck(model.loads.distributed, 'distributed load');
  dupCheck(model.loads.elementPoint, 'element point load');

  return errors;
}
```

If `errors.length > 0`, import is aborted and the toast displays `errors[0]` with `errors.length` referenced ("…and 3 more errors — see console"). Full list logged to `console.warn`.

### 5.10 The `loadExample` startup gate

Currently `loadExample` is wired to a button, not to startup. **Verify** the actual startup path before implementing — the goal is to ensure that on a fresh visit (no `localStorage`), the example loads, but on a return visit the persisted model wins.

The `persist` middleware automatically rehydrates from `localStorage` on store creation. The hooked-in question is: who calls `loadExample` if there's no localStorage entry?

**Implementation strategy**:
1. Inspect `2dfea/src/App.tsx` (and any module-load `useEffect` it kicks off) to find any current call to `loadExample`. The TODO note "loadExample is currently wired to a button" suggests no startup auto-load — verify by Grep.
2. If startup auto-load is **not** wired today: add an effect in `App.tsx` that runs once on mount, checks `localStorage.getItem('2dfea-model-storage')`, and if null/empty (or corresponds to the empty `initialState`) calls `loadExample()`. Otherwise no-op.
3. If startup auto-load **is** wired today: replace the unconditional call with the gated check.

This also future-proofs A4 — once the user has imported a real model, refreshing the page restores the imported model (via `persist`), not the example.

### 5.11 UI placement and shortcuts

**Toolbar** (`Toolbar.tsx`):
- Add a new "File" mini-group **immediately after** the Edit (Undo/Redo) group introduced by D1, separated by a vertical divider matching the existing pattern (`borderRight: '1px solid #ccc'`).
- Two buttons:
  - **📤 Export JSON** — disabled when model is empty (`nodes.length === 0 && elements.length === 0`); otherwise enabled. Tooltip: `Export model to JSON file (Ctrl+S)`.
  - **📥 Import JSON** — always enabled. Tooltip: `Import model from JSON file (Ctrl+O)`.
- Both buttons render on **all three tabs** (Structure, Loads, Analysis) — same rationale as Undo/Redo.
- Use the same `actionButtonStyle` factory the existing `Load Example` and `Clear Model` buttons use (`Toolbar.tsx:285-291`). Match the visual weight; do not add icons that aren't already in the codebase if they require an SVG asset (the emoji glyphs above are fine).

**Keyboard** (`useKeyboardShortcuts.ts`):
- Add **after** the existing Ctrl+Z/Y handlers, **before** the closing brace of `handleKeyDown`:

```ts
// Export — Ctrl+S / Cmd+S
if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
  if (commandInput?.visible || isEditingInput) return;
  e.preventDefault();  // Prevent browser "Save Page As..."
  void exportCurrentModelToFile();  // imported from io/exportImport.ts
  return;
}

// Import — Ctrl+O / Cmd+O
if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
  if (commandInput?.visible || isEditingInput) return;
  e.preventDefault();  // Prevent browser "Open File..."
  void promptUserForImport();  // imported from io/exportImport.ts
  return;
}
```

The two helper functions are defined in `src/io/exportImport.ts` and are pure DOM helpers — no React state needed (they read from the store directly via `useModelStore.getState()`).

### 5.12 Browser File API strategy

**Export** — anchor download:
```ts
function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so browsers that fire download asynchronously can still pick up the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

**Import** — hidden `<input type="file">`:
```ts
function promptUserForImport(): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(); return; }
      const text = await file.text();
      await handleImportText(text);  // validates, migrates, applies
      resolve();
    };
    input.click();
  });
}
```

Both work in every modern browser without permission prompts. The File System Access API (`showSaveFilePicker` / `showOpenFilePicker`) is **not** used in v1 because it's not supported in Firefox. Re-evaluate when Firefox ships it.

### 5.13 Toast / banner UX for errors

Re-use the existing error-display surface if one exists, otherwise add a lightweight toast component. **First check**: Grep for any current toast/banner pattern in `2dfea/src/components/`. If nothing exists, add `src/components/Toast.tsx` with a 3-second auto-dismiss, single-message queue, top-right placement. Triggered via a `useUIStore.toast` slice (or new `useToastStore`).

**Error format**:
- Headline: short, user-readable (e.g. "Could not import file").
- Body: first error message from validation (`zodError.issues[0].message` with `path`, or first semantic error string).
- Detail: "Open DevTools console for full details." Console logs the full Zod error object plus all semantic errors.

### 5.14 Files to keep stable

These intentionally do NOT change:
- `2dfea/src/analysis/types.ts` — entity shapes are not widened. Comments live in a separate map.
- `2dfea/public/workers/solverWorker.js` — worker is unchanged; it never touches the file format.
- `2dfea/src/store/historyConfig.ts` — TRACKED_KEYS is the same. The new `comments` field is non-tracked.
- `vite.config.ts`, `tsconfig.json`, `.github/workflows/deploy-all-modules.yml`.

### 5.15 AI-prompt suitability

This section addresses the user's emphasis on "AI-friendly". The schema design choices in §5.2 are not aesthetic — they are mechanical requirements for an AI that consumes or produces this format inside a prompt context.

**The grounded-generation flow** (out-of-scope for v1 implementation, but the schema must support it):

```
┌─────────────────────────────────────────────────────────────────────┐
│ User prompt: "Generate a 3-storey moment frame, 6 m bays, S275."   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                ┌─────────────────▼─────────────────┐
                │ Frontend builds AI request:       │
                │  - System: 2dfea-model-v1.json    │
                │    (JSON Schema, attached)        │
                │  - User: prompt + (optional)      │
                │    current model.json             │
                │  - Output: ModelFileV1 JSON       │
                └─────────────────┬─────────────────┘
                                  │
                ┌─────────────────▼─────────────────┐
                │ Anthropic / OpenAI structured     │
                │ output mode (JSON Schema = ours)  │
                └─────────────────┬─────────────────┘
                                  │
                ┌─────────────────▼─────────────────┐
                │ Returned JSON → Zod validate →    │
                │ semanticValidate → applyToStore   │
                └───────────────────────────────────┘
```

For this flow to work without expensive prompt engineering or post-hoc fixups, the schema must:

1. **Be self-documenting from field names alone**. `fy_kN` is unambiguous; `fy` is not. ✓ Achieved by unit suffixes (§5.2 rule 1).
2. **Be structurally valid in one shot**. AI models hallucinate fields; Zod's `.strict()` mode at the model boundary prevents extra fields from sneaking through. ✓
3. **Be referentially correct in one shot**. AI models invent IDs; semantic validation catches `nodeI: "N99"` referencing a non-existent node. ✓ (§5.9)
4. **Support partial / iterative editing**. A user prompt of "delete the column at grid line C" should produce a JSON delta or a full replacement. v1 only supports full replacement; deltas are a future feature. ✓ (current design is full-replacement-friendly).
5. **Carry author intent**. The `_comments` block lets the AI annotate **why** it generated each entity. A human reviewing the file later can read the rationale. ✓

**The published JSON Schema document** (goal #10) is the contract. An AI prompt using structured output (Anthropic's tool-use schema or OpenAI's JSON-schema response format) attaches `2dfea-model-v1.json` and the model is constrained to emit conforming output. This is the single most valuable piece of A4 for the future AI feature: **without** the schema document, every AI integration must re-invent the format from prose; **with** it, the schema is a hard constraint enforced by the LLM provider's structured-output mode.

Hypothetical prompt template (illustrative, not for implementation):

```
You are a structural engineering modeling assistant for 2dfea, a 2D frame
analysis tool. Generate or modify a model conforming to schemaVersion "1.0.0".

UNIT POLICY (immutable in v1):
  length: m, force: kN, moment: kNm, stress: GPa.

HARD RULES:
  - Field names that include unit suffixes are required (e.g. fy_kN, x_m).
  - Element nodeI/nodeJ MUST reference an existing node by name.
  - Loads MAY reference a load case by name; if so the case MUST exist.
  - Annotate non-trivial choices in `_comments` with brief engineering rationale.
  - Output exactly one JSON document conforming to the attached JSON Schema.

CURRENT MODEL (may be empty):
  <attached: model.json>

USER REQUEST:
  <user prompt>

Respond with the new model.json.
```

The schema's stability across MAJOR/MINOR/PATCH bumps (§5.3) means the prompt template is forward-compatible: when v2 ships, the AI integration swaps the attached schema, and the migration plumbing handles old AI outputs gracefully.

## 6. Files to Touch

| File Path | Action | Purpose |
|-----------|--------|---------|
| `c:\Python\structural_tools\2dfea\package.json` | Modify | Add `zod` and `zod-to-json-schema` to `dependencies` |
| `c:\Python\structural_tools\2dfea\package-lock.json` | Modify (auto, via `npm i`) | Lockfile update |
| `c:\Python\structural_tools\2dfea\src\io\schemaVersion.ts` | Create | Export `CURRENT_SCHEMA_VERSION = '1.0.0'` and `SchemaVersionError` class |
| `c:\Python\structural_tools\2dfea\src\io\schema.ts` | Create | Zod schema for `ModelFileV1`. Inferred TS type. ~150 LOC |
| `c:\Python\structural_tools\2dfea\src\io\migrations.ts` | Create | `MIGRATIONS` registry + `migrateToCurrent()`. v1 has identity migration only |
| `c:\Python\structural_tools\2dfea\src\io\semanticValidator.ts` | Create | Cross-entity reference checks (orphan element nodeI, missing case, duplicate IDs) |
| `c:\Python\structural_tools\2dfea\src\io\canonicalStringify.ts` | Create | ~30-LOC deterministic JSON.stringify with sorted keys + trailing newline |
| `c:\Python\structural_tools\2dfea\src\io\canonicalize.ts` | Create | `modelStateToFile(state) → ModelFileV1` and `fileToStorePatch(file) → patch`. Pure functions, no store imports |
| `c:\Python\structural_tools\2dfea\src\io\applyToStore.ts` | Create | Reads `useModelStore.setState`, applies a `ModelFileV1` to the store, calls `temporal.clear()` |
| `c:\Python\structural_tools\2dfea\src\io\exportImport.ts` | Create | High-level `exportCurrentModelToFile()` and `promptUserForImport()` — DOM glue + toasts |
| `c:\Python\structural_tools\2dfea\src\io\generateJsonSchema.ts` | Create | One-time build-time helper that uses `zod-to-json-schema` to emit the published JSON Schema. Called from a `package.json` script |
| `c:\Python\structural_tools\2dfea\src\io\index.ts` | Create | Barrel re-export |
| `c:\Python\structural_tools\2dfea\public\schemas\2dfea-model-v1.json` | Create | Published JSON Schema document — generated, committed |
| `c:\Python\structural_tools\2dfea\src\store\useModelStore.ts` | Modify | (a) add `comments` to `ModelState` + `initialState`; (b) extend persist `partialize` to include `next*Number` counters and `comments`; (c) no other mutations |
| `c:\Python\structural_tools\2dfea\src\components\Toolbar.tsx` | Modify | Add Export/Import button group adjacent to Undo/Redo group |
| `c:\Python\structural_tools\2dfea\src\hooks\useKeyboardShortcuts.ts` | Modify | Add Ctrl+S / Ctrl+O handlers with the existing `commandInput` + `isEditingInput` guards |
| `c:\Python\structural_tools\2dfea\src\App.tsx` | Modify (verify first) | Gate `loadExample` on startup: only call when `localStorage['2dfea-model-storage']` is null/empty |
| `c:\Python\structural_tools\2dfea\src\components\Toast.tsx` | Create (if absent) | Lightweight toast for import success/failure messages. Conditional — Grep first |
| `c:\Python\structural_tools\2dfea\src\store\useToastStore.ts` | Create (if absent) | Toast state slice. Conditional — Grep first |
| `c:\Python\structural_tools\2dfea\package.json` | Modify | Add `"generate-schema": "tsx src/io/generateJsonSchema.ts"` script |
| `c:\Python\structural_tools\2dfea\docs\plans\save-load-json.md` | Create | This plan |
| `c:\Python\structural_tools\2dfea\docs\plans\INDEX.md` | Modify | Append one-line entry |
| `c:\Python\structural_tools\2dfea\TODO.md` | (Out of scope) | User strikes through A4 after merge |

No changes needed in:
- `.github/workflows/deploy-all-modules.yml` — deployment flow unchanged.
- `vite.config.ts`, `tsconfig.json` — no new compiler options, no worker changes.
- Plain HTML modules — untouched.
- `2dfea/src/analysis/types.ts` — entity shapes are not widened (comments live in parallel map).
- `2dfea/public/workers/solverWorker.js` — worker doesn't touch the file format.
- `2dfea/src/store/historyConfig.ts` — `TRACKED_KEYS` unchanged; `comments` is intentionally non-tracked.

## 7. Step-by-Step Implementation Phases

Each phase is independently compilable and type-checks. Run `cd 2dfea && npm run type-check` after each phase. Do **not** start implementation until the user has reviewed and approved this plan.

### Phase 1 — Dependencies, primitives, and test runner setup (no behavioural change)

1.1 `cd 2dfea && npm i zod zod-to-json-schema`. Verify `package.json` shows both under `dependencies`.
1.2 Create `src/io/schemaVersion.ts`:
```ts
export const CURRENT_SCHEMA_VERSION = '1.0.0' as const;
export type CurrentSchemaVersion = typeof CURRENT_SCHEMA_VERSION;

export class SchemaVersionError extends Error {
  constructor(message: string, public readonly receivedVersion: string) {
    super(message);
    this.name = 'SchemaVersionError';
  }
}
```
1.3 Create `src/io/canonicalStringify.ts` per §5.5 sketch. Add JSDoc explaining why we don't use a library.
1.4 `npm run type-check` → green.

**Vitest test runner setup** (single suite for the entire 2dfea module — there are no existing tests, this is the first one):

1.5 `cd 2dfea && npm i -D vitest @vitest/ui jsdom`. Verify `package.json` shows all three under `devDependencies` (Vitest is **never** a runtime dep — zero production bundle impact).
1.6 Create `2dfea/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',                // Needed for the few DOM-touching tests (URL.createObjectURL, etc.)
    globals: false,                      // Explicit imports of `describe`/`it`/`expect` — clearer for AI tooling and humans
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'public'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```
1.7 Add scripts to `2dfea/package.json`:
```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    // ... existing scripts unchanged
  }
}
```
1.8 Sanity check: create `src/io/canonicalStringify.test.ts` with one trivial assertion (`expect(canonicalStringify({b: 1, a: 2})).toBe('{"a":2,"b":1}')`). Run `npm test` → 1 passing. **This single file establishes the test suite location convention** — all future tests for save/load (and for any future feature) live next to the source file as `<name>.test.ts`. There is one config, one command, one suite. Co-locating test files prevents the "where do tests go?" question from ever recurring.

1.9 `npm run type-check` → green. `npm test` → 1 passing.

**Verification**: new files compile; `npm test` runs the trivial sanity test green; nothing else changed in the running app. Production build is byte-identical.

**Note on the "single suite" guarantee**: Vitest auto-discovers `src/**/*.{test,spec}.{ts,tsx}` per the `include` config above. Adding new test files anywhere under `src/` extends the **same** suite. There is no mechanism by which separate suites form unless an additional `vitest.config.ts` is introduced — which this plan does not do and future plans should not do without explicit reason.

### Phase 2 — Schema, migrations, semantic validator

2.1 Create `src/io/schema.ts`:
   - Define `ModelFileV1Schema` as a Zod schema mirroring §5.2 exactly.
   - Use `.strict()` on the `model` object to reject unknown fields.
   - Use `.passthrough()` on `metadata` so future minor versions can add fields without breaking old code.
   - Use `.finite()` on every numeric field (rejects `NaN`/`Infinity`).
   - Pin `metadata.units` to a `z.literal()` object matching v1's unit policy.
   - Constrain enums for `support`, distributed `direction`, elementPoint `direction` from `types.ts`.
   - Export `type ModelFileV1 = z.infer<typeof ModelFileV1Schema>`.
2.2 Create `src/io/migrations.ts` per §5.6.
2.3 Create `src/io/semanticValidator.ts` per §5.9.
2.4 `npm run type-check` → green. Compare the inferred `ModelFileV1` type against `types.ts` shapes manually to confirm parity (specifically: every numeric field has its unit-suffixed name, every enum is constrained).

**Verification**: types compile; no consumer yet.

### Phase 3 — Canonicalize / apply

3.1 Create `src/io/canonicalize.ts`:
   - `modelStateToFile(state: ModelState, opts?: { name?: string; description?: string }): ModelFileV1`. Pure function. Reads `state.nodes` etc. and emits the V1 shape with all unit suffixes mapped (`x` → `x_m`, `fx` → `fx_kN`, etc.). Writes `metadata.exportedAt = new Date().toISOString()`.
   - `appVersion` is hard-coded to **`"unknown"`** for v1.0.0. **Do NOT wire `import.meta.env.VITE_APP_VERSION` in this PR.** Wiring it through `vite.config.ts` (reading `package.json.version`) is intentional debt — see §11 "Follow-up TODOs" for the explicit reminder. The schema tolerates any string here, so the follow-up does not require a schema bump. Add an inline `// TODO(appVersion):` comment at the assignment site so the follow-up is grep-discoverable.
3.2 Create `src/io/applyToStore.ts` per §5.8.
3.3 Add `comments` field to `ModelState` interface and `initialState` in `useModelStore.ts`:
```ts
// In ModelState interface:
comments: {
  nodes: Record<string, string>;
  elements: Record<string, string>;
  loads: Record<string, string>;
  loadCases: Record<string, string>;
  loadCombinations: Record<string, string>;
};

// In initialState:
comments: {
  nodes: {},
  elements: {},
  loads: {},
  loadCases: {},
  loadCombinations: {},
},
```
3.4 Extend the **persist `partialize`** in `useModelStore.ts` (lines 1073–1082) to include `next*Number` counters and `comments`:
```ts
partialize: (state) => ({
  nodes: state.nodes,
  elements: state.elements,
  loads: state.loads,
  loadCases: state.loadCases,
  loadCombinations: state.loadCombinations,
  activeLoadCase: state.activeLoadCase,
  activeResultView: state.activeResultView,
  // New in A4:
  nextNodeNumber: state.nextNodeNumber,
  nextElementNumber: state.nextElementNumber,
  nextNodalLoadNumber: state.nextNodalLoadNumber,
  nextPointLoadNumber: state.nextPointLoadNumber,
  nextDistributedLoadNumber: state.nextDistributedLoadNumber,
  nextLineLoadNumber: state.nextLineLoadNumber,
  comments: state.comments,
}),
```
3.5 Backwards-compat handling for users who already have `'2dfea-model-storage'` in `localStorage`: missing `comments` → defaulted to empty objects (Zustand persist's merge does this naturally if you supply `merge` callback; otherwise rehydrate fills with `initialState` defaults). Missing `next*Number` counters → re-derived from existing nodes/elements via `getNextNodeNumber` / `getNextElementNumber` on rehydration. Add a one-time `onRehydrateStorage` callback that backfills.
3.6 `npm run type-check` → green.

**Verification**: existing app still boots; reloading after editing the model still preserves it; `localStorage` JSON now includes `idCounters`-equivalent fields; `comments` defaults to empty.

### Phase 4 — Export path

4.1 Create `src/io/exportImport.ts` with:
```ts
export async function exportCurrentModelToFile(): Promise<void> {
  const state = useModelStore.getState();
  const file = modelStateToFile(state);
  const json = canonicalStringify(file, 2);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15); // 20260427T1535
  const filename = `2dfea-model-${ts}.json`;
  downloadJsonFile(filename, json);
  showToast({ kind: 'info', message: `Exported ${filename}` });
}
```
4.2 Implement `downloadJsonFile` per §5.12.
4.3 Add Export button to `Toolbar.tsx` per §5.11.
4.4 Wire the click handler. Disabled state: `model.nodes.length === 0 && model.elements.length === 0`.
4.5 `npm run dev` → click Export → file downloads → open in editor → human-readable, sorted-key JSON, ends with newline.

**Verification**: round-trip not yet wired, but a manually-edited file should at least look correct on disk.

### Phase 5 — Import path

5.1 Add `promptUserForImport()` to `exportImport.ts`. Two distinct confirm gates fire in this order — analysis-running first, then non-empty-overwrite — and both must pass before the file picker opens:
```ts
export async function promptUserForImport(): Promise<void> {
  const state = useModelStore.getState();

  // Gate 1: analysis-running (goal #12)
  if (state.isAnalyzing) {
    const ok = window.confirm(
      'Analysis is running. Import anyway? Results will be discarded.',
    );
    if (!ok) return;
  }

  // Gate 2: confirm-before-overwrite (goal #13)
  const isNonEmpty =
    state.nodes.length > 0 || state.elements.length > 0 || state.loads.length > 0;
  if (isNonEmpty) {
    const ok = window.confirm(
      `Importing will replace your current model ` +
      `(${state.nodes.length} nodes, ${state.elements.length} elements, ${state.loads.length} loads). ` +
      `Continue?`,
    );
    if (!ok) return;
  }

  const text = await pickFile();  // hidden input helper, see §5.12
  if (!text) return;
  await handleImportText(text);
}

async function handleImportText(text: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    showToast({ kind: 'error', message: `Could not parse file: ${(err as Error).message}` });
    return;
  }

  // Pre-version check: enforce string `schemaVersion`
  const version = (parsed as any)?.schemaVersion;
  if (typeof version !== 'string') {
    showToast({ kind: 'error', message: 'File is missing schemaVersion or it is not a string.' });
    return;
  }

  let migrated;
  try {
    migrated = migrateToCurrent(parsed as AnyVersionedModel);
  } catch (err) {
    if (err instanceof SchemaVersionError) {
      showToast({
        kind: 'error',
        message: `Unsupported schema version "${err.receivedVersion}". This file was created by a newer version of 2dfea — please update.`,
      });
    } else {
      showToast({ kind: 'error', message: `Migration failed: ${(err as Error).message}` });
    }
    return;
  }

  const result = ModelFileV1Schema.safeParse(migrated);
  if (!result.success) {
    const first = result.error.issues[0];
    showToast({
      kind: 'error',
      message: `Invalid model file: ${first.path.join('.')} — ${first.message}`,
    });
    console.warn('[Import] Zod validation errors:', result.error.issues);
    return;
  }

  const semantic = semanticValidate(result.data.model);
  if (semantic.length > 0) {
    showToast({
      kind: 'error',
      message: `Model is structurally invalid: ${semantic[0]}${semantic.length > 1 ? ` (and ${semantic.length - 1} more)` : ''}`,
    });
    console.warn('[Import] Semantic validation errors:', semantic);
    return;
  }

  applyToStore(result.data);
  showToast({ kind: 'info', message: 'Model imported successfully.' });
}
```
5.2 Add Import button to `Toolbar.tsx`. Always enabled. Wire to `promptUserForImport`.
5.3 If no toast component exists, create `src/components/Toast.tsx` and `src/store/useToastStore.ts` per §5.13.
5.4 `npm run type-check` → green. `npm run dev`:
   - Export current model → import the same file → diff the two exports (should be byte-identical except for `metadata.exportedAt`).
   - Import a corrupt file (e.g. missing closing brace) → toast appears.
   - Import a file with a bumped `schemaVersion: "9.9.9"` → toast says "Unsupported schema version 9.9.9...".
   - Import a file with element `nodeI: "N99"` (non-existent) → toast says "Element E1 references missing node N99".

### Phase 6 — Keyboard shortcuts

6.1 Open `src/hooks/useKeyboardShortcuts.ts`. Note the pattern at lines 134–157 (the existing Z/Y handlers).
6.2 Add Ctrl+S / Ctrl+O handlers per §5.11 **after** the Z/Y block.
6.3 `npm run dev` → Ctrl+S downloads file, Ctrl+O opens picker. Verify guard: focus a cell editor in Nodes tab, press Ctrl+S → no download, the input retains focus (browser may show "Save Page" — confirm `e.preventDefault()` is applied; if it isn't, fix the guard order).
6.4 Cross-platform: confirm Cmd+S / Cmd+O on macOS (use BrowserStack or local Mac if available; otherwise document as a manual-QA item for the user).

### Phase 7 — Startup gate for `loadExample`

7.1 Grep for current callers of `loadExample`. Verified existing callers from earlier inspection: `Toolbar.tsx:285` (button). Check `App.tsx` for any startup-effect call.
7.2 Add to `App.tsx` (or wherever the initial-model effect lives):
```ts
useEffect(() => {
  // One-shot startup gate: load example only if no persisted model exists.
  // Persist's onRehydrateStorage runs synchronously before this effect, so by here
  // the store either reflects the persisted model or the initialState.
  const persisted = localStorage.getItem('2dfea-model-storage');
  const isEmpty = !persisted || persisted === 'null' || persisted === '';
  const state = useModelStore.getState();
  const looksLikeFreshStart = state.nodes.length === 0 && state.elements.length === 0;
  if (isEmpty && looksLikeFreshStart) {
    state.loadExample();
  }
}, []);
```
7.3 Verify: clear `localStorage` → reload → cantilever appears. Edit model → reload → edited model persists, cantilever does not overwrite. Click Toolbar "Load Example" → cantilever loads (overwrites edits) — manual user action remains untouched.

### Phase 8 — Published JSON Schema

8.1 Create `src/io/generateJsonSchema.ts`:
```ts
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ModelFileV1Schema } from './schema';
import { CURRENT_SCHEMA_VERSION } from './schemaVersion';

const out = zodToJsonSchema(ModelFileV1Schema, {
  name: `2dfea-model-v${CURRENT_SCHEMA_VERSION}`,
  $refStrategy: 'none',
});

const path = resolve(__dirname, '../../public/schemas/2dfea-model-v1.json');
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Wrote ${path}`);
```
8.2 Add `package.json` script:
```json
"generate-schema": "tsx src/io/generateJsonSchema.ts",
"prebuild": "npm run generate-schema"
```
The `prebuild` hook ensures the published schema is regenerated before every production build, eliminating drift.
8.3 Run `npm run generate-schema`. Verify `public/schemas/2dfea-model-v1.json` exists and matches the Zod schema (manual spot-check: every unit-suffixed field appears, enums are constrained).
8.4 Add `tsx` to `devDependencies` if not already present (`npm i -D tsx`).
8.5 `npm run build` → confirm `prebuild` runs and the schema is included in `dist/schemas/`.

### Phase 9 — Bundle-size verification

9.1 Run `cd 2dfea && npm run build`. Inspect `dist/assets/index-*.js` size before and after this PR. Expected delta ≤ 15 KB minified+gzipped (Zod ~13 KB + zod-to-json-schema is build-time-only, not runtime).
9.2 If exceeded: switch to dynamic-import the import path (`const { handleImportText } = await import('./io/exportImport')`) so the validator code is loaded lazily on first import click. Keep export path eager (Ctrl+S responsiveness matters).

### Phase 10 — Documentation & cleanup

10.1 Add a `2dfea/docs/file-format.md` (~1 page) summarising the v1 schema, link to the published JSON Schema, and link to this plan. Mention the AI-prompt suitability briefly.
10.2 Update `2dfea/docs/plans/INDEX.md`:
```md
- [Save / Load JSON](save-load-json.md) — schema-versioned JSON file export/import; Zod validation; published JSON Schema; AI-friendly format with unit-suffixed fields and `_comments`. Ctrl+S export / Ctrl+O import.
```
10.3 Add JSDoc on `exportCurrentModelToFile` and `promptUserForImport` explaining the validation chain (parse → version-check → migrate → Zod → semantic → apply).

### Phase 11 — Ship

11.1 Run the full verification matrix in §8.
11.2 Commit on `feature/2dfea-save-load-json` branch:
```bash
git checkout -b feature/2dfea-save-load-json
git add 2dfea/package.json 2dfea/package-lock.json \
        2dfea/vitest.config.ts \
        2dfea/src/io/ \
        2dfea/public/schemas/ \
        2dfea/src/store/useModelStore.ts \
        2dfea/src/components/Toolbar.tsx \
        2dfea/src/components/Toast.tsx \
        2dfea/src/store/useToastStore.ts \
        2dfea/src/hooks/useKeyboardShortcuts.ts \
        2dfea/src/App.tsx \
        2dfea/docs/examples/cantilever-v1.json \
        2dfea/docs/file-format.md \
        2dfea/docs/plans/save-load-json.md \
        2dfea/docs/plans/INDEX.md
```
Suggested commit message (HEREDOC):
```
feat(2dfea): save/load model to JSON with schema-versioned import/export

- Add schema v1.0.0 with unit-suffixed fields, idCounters, _comments block
- Single canonical serializer used by both file export and persist middleware
- Zod validation + semantic validation + migration plumbing (identity v1)
- Published JSON Schema at public/schemas/2dfea-model-v1.json (build-time gen)
- Toolbar Export/Import buttons, Ctrl+S/Ctrl+O shortcuts (focus-guarded)
- Import calls temporal.clear() so undo cannot rewind into pre-import model
- Persist partialize now includes ID counters and comments (round-trip parity)
- loadExample is gated to startup-only when localStorage is empty
- AI-friendly format: unit-suffixed field names, published JSON Schema for
  structured-output prompting, _comments block for AI-authored rationale
- Confirm-before-overwrite dialog gates non-empty imports; analysis-running
  dialog still fires first when applicable
- Vitest test runner added (devDep only); single co-located *.test.ts suite
  covering canonicalStringify, schema, migrations, semantic validator,
  round-trip, and canonicalize
- metadata.appVersion ships as "unknown" in v1.0.0; package.json wiring is
  a tracked follow-up TODO (see plan §11)

Refs TODO.md A4.
```
11.3 Push branch, open PR, review, rebase-merge to `master` (matches the PR pattern from D1). Watch the workflow at https://github.com/magnusfjeldolsen/structural_tools/actions. Verify the live URL per §8.

## 8. Test & Verification Plan

### Automated gates

| Gate | Command (from `2dfea/`) | Passes when |
|------|-------------------------|-------------|
| Type check | `npm run type-check` | Zero TS errors |
| Schema generation | `npm run generate-schema` | `public/schemas/2dfea-model-v1.json` written |
| Production build | `npm run build` | Exit 0, `dist/` produced, `dist/schemas/2dfea-model-v1.json` present |
| Preview | `npm run preview` | Worker loads, analysis runs, export/import work |
| CI deploy | GitHub Actions `deploy-all-modules.yml` | Workflow green |

### Automated tests (Vitest — single 2dfea-wide suite)

Vitest is configured in Phase 1 (steps 1.5–1.8). All test files for this feature live next to their source file as `<name>.test.ts`. Run with `cd 2dfea && npm test`.

Required test files for v1 (each is a separate `.test.ts` co-located with the module under test — but they all run as **one** `vitest run` invocation):

1. **`src/io/canonicalStringify.test.ts`** — sorted-keys property, nested objects, arrays preserve insertion order, `null`/`undefined` handling, finite-number stringification.
2. **`src/io/schema.test.ts`** — valid v1 fixture parses; tamper cases each fail with the expected `ZodError` issue path:
   - Missing `schemaVersion` → `["schemaVersion"]: required`.
   - Wrong `metadata.units` literal → `["metadata", "units", "length"]: Invalid literal value`.
   - Element with `nodeI: 123` (number, not string) → `["model", "elements", 0, "nodeI"]: Expected string`.
   - `NaN` in `x_m` → `.finite()` rejection.
   - Unknown top-level field with `.strict()` → rejection.
3. **`src/io/migrations.test.ts`** — identity migration on a v1.0.0 fixture returns input unchanged; `SchemaVersionError` thrown on `"9.9.9"`; thrown error carries `receivedVersion`.
4. **`src/io/semanticValidator.test.ts`** — orphan element `nodeI`/`nodeJ` detected; orphan distributed-load `elementId` detected; load-combination referencing missing case detected; valid cantilever passes with empty issues.
5. **`src/io/roundtrip.test.ts`** — the load-bearing test:
   - Build a cantilever fixture (~5 nodes, 4 elements, 3 load types, 2 cases, 1 combination, comments on 2 entities).
   - `canonicalStringify(modelStateToFile(fixture))` → A.
   - `applyToStore(JSON.parse(A))` then re-export → B.
   - Assert `A === B` after masking `metadata.exportedAt`.
   - Repeat with `next*Number` counters set to non-default values (e.g. `nextNodeNumber: 99`) — assert counters round-trip.
   - Repeat with `_comments` populated — assert comments round-trip.
6. **`src/io/canonicalize.test.ts`** — unit-suffix mapping is exhaustive (every numeric field in `types.ts` has a suffixed counterpart in the file shape); `metadata.exportedAt` is a valid ISO 8601 string; `appVersion` defaults to `"unknown"` until follow-up TODO completes (see §11).

**Coverage gate (informational, not enforcing)**: aim for ≥ 90% line coverage of `src/io/**`. Don't fail CI on coverage in v1 — let the round-trip test be the contract; coverage is a sanity check.

**Why test files live next to source**: AI tooling and humans both find tests faster when they're co-located. There is no `__tests__/` directory; there is no `tests/` directory at the 2dfea root. One convention, applied everywhere. Future features must follow this.

### Manual QA checklist (http://localhost:5173 via `npm run dev`)

Run through each scenario with DevTools open. No console errors or warnings expected.

**Group A — Basic export**
1. Load Example (cantilever). Click 📤 Export JSON. Verify file downloads with name `2dfea-model-<timestamp>.json`. Open in text editor: pretty-printed, sorted keys, trailing newline, contains `schemaVersion: "1.0.0"`, `metadata.units` block, `model.nodes` array with `x_m` / `y_m`, `model.elements` with `E_GPa` / `I_m4` / `A_m2`.
2. Empty model (Clear Model). Verify Export button is disabled. Tooltip still readable.
3. Add 5 nodes, 4 elements, several loads, a combination. Export. File contains all entities with correct unit-suffixed names; `_comments` block is omitted (empty object would also be acceptable — choose one and document).

**Group B — Basic import**
4. Export a file from group A (#1). Click Clear Model. Click 📥 Import JSON, select the file. Verify: cantilever restored exactly (nodes, element, load all match). Toast: "Model imported successfully." Undo button is disabled (history was cleared).
5. Manually edit the exported file: change `metadata.name`, `metadata.description` to non-empty strings. Re-import. Verify model loads (metadata is informational; no UI surfaces it yet — that's fine).
6. Manually edit `_comments.nodes.N1 = "Fixed support — generated by AI"`. Re-import. Open Redux DevTools / Zustand devtools, verify `comments.nodes.N1` is set in store. Re-export — comment is preserved in the new file.

**Group C — Round-trip determinism**
7. Export → import → export. Diff the two exports (e.g. `git diff --no-index file1.json file2.json`). The only difference allowed is `metadata.exportedAt` (timestamp). All other content is byte-identical. If anything else differs, **fail** — investigate `canonicalStringify`.
8. Edit `metadata.name` in the first export. Re-import → re-export. Confirm the edited name persists.

**Group D — Validation failures**
9. Manually edit an exported file: delete the closing `}`. Import. Toast: "Could not parse file: ...". Store unchanged.
10. Edit: set `schemaVersion: "9.9.9"`. Import. Toast: "Unsupported schema version 9.9.9...". Store unchanged.
11. Edit: rename an element's `nodeI` to a non-existent node, e.g. `"N99"`. Import. Toast: "Element E1 references missing node 'N99'". Store unchanged.
12. Edit: set a numeric field to `"not a number"`. Import. Toast contains a Zod-style path + message. Store unchanged. Console shows full error list.
13. Edit: change `metadata.units.length` to `"mm"`. Import. Toast says `metadata.units.length` is an invalid value. Store unchanged.

**Group E — Keyboard shortcuts**
14. Press Ctrl+S in an empty model. Browser does **not** show "Save Page As..." (preventDefault works); export is disabled, so a soft toast/no-op is acceptable. Open a non-empty model, press Ctrl+S → file downloads.
15. Press Ctrl+O. File picker opens. Cancel — no error, no toast.
16. Focus a cell editor in the Nodes tab. Press Ctrl+S. Browser may or may not handle the keystroke (acceptable either way) — but **no model export must occur**. Verify by checking the dev console for the absence of `[Export] ...` logs.
17. Open the CAD command input. Press Ctrl+S → no export, command input retains focus.

**Group F — Persistence interaction**
18. Cantilever loaded → reload (F5) → cantilever persists (existing behaviour preserved). 
19. Cantilever loaded → reload → press Ctrl+Z → no-op (history fresh from reload).
20. **ID-counter regression**: Add 50 nodes (N1…N50). Delete N1…N49 leaving only N50. Reload. Add a new node. Verify it is named **N51** (counter persisted), not N1 (counter reset to defaults). This is the latent bug that goal #8 fixes.
21. **Backwards-compat**: Manually edit `localStorage['2dfea-model-storage']` to the **old** shape (no `nextNodeNumber` field). Reload. App should not crash; counters should be re-derived from existing nodes/elements.

**Group G — `loadExample` startup gate**
22. Clear `localStorage` (DevTools → Application → Storage → Clear site data). Reload. Cantilever loads automatically.
23. Edit cantilever (e.g. delete N2). Reload. Edited model persists; cantilever does **not** reload.
24. Click "Load Example" toolbar button — cantilever overwrites the edited model (manual override still works).

**Group H — Import safety**
25. Run a slow analysis (load a large model, click Run Full Analysis). While `isAnalyzing` is true, click Import. Confirm dialog appears. Cancel → no import; analysis continues.
26. Same scenario, OK → import proceeds, `analysisResults` cleared, in-flight worker result is discarded (existing `INVALIDATE_ANALYSIS_PATCH` path).

**Group I — Cross-browser**
27. Repeat groups A–C in Chrome, Firefox, Edge.
28. macOS: Cmd+S exports, Cmd+O imports.

### Edge cases to sanity-check

| Case | Expected |
|------|----------|
| Empty `loads.nodal`, `loads.distributed`, `loads.elementPoint` arrays | Round-trip correctly (arrays preserved as `[]`). |
| Empty `loadCombinations` | Round-trip; on import, `activeResultView.type = 'combination'` with `name: null` is valid; ResultsSelector renders "-- Select combination --". |
| `metadata.author = null` explicit | Round-trips as `null` (valid by schema). Other optional fields are omitted when absent. |
| Very large numeric values (e.g. `1e15`) | `JSON.stringify` round-trips losslessly within Number precision. Zod `.finite()` allows finite values up to `Number.MAX_VALUE`. |
| `Number.MIN_VALUE` (5e-324) | Round-trips exactly via JSON.stringify. |
| Negative coordinates | Allowed; round-trip exactly. |
| Element with E=0 or I=0 | Schema allows 0 (no `.positive()` constraint enforced — engineering would consider this invalid, but it's not the schema's job to enforce). Document in `file-format.md` that engineering bounds are validated downstream by the analysis engine. |
| File with trailing/leading whitespace | `JSON.parse` tolerates leading/trailing whitespace. Round-trip will normalise it. |
| File without trailing newline | Imports fine. Exports always have trailing newline (canonicalStringify contract). |
| Unicode in `metadata.name` (e.g. "Cantilévér") | Round-trips exactly (JSON is UTF-8 by default). |
| 1000-element model export | Pretty-printed file is large (~1 MB) but exports in <100 ms. Re-import in <300 ms (Zod parse cost). |
| User imports a file when offline | Works — entire flow is client-side. |
| User loses unsaved changes by importing | **Mitigated in v1**: confirm-before-overwrite dialog gates non-empty imports (goal #13, Phase 5.1). On confirm, toast displays "Model imported successfully." `localStorage` autosave from the prior model is also still recoverable until the next persist write. |

### Deployment verification (post-push)

1. Wait for Actions: https://github.com/magnusfjeldolsen/structural_tools/actions.
2. Hard-refresh (`Ctrl+Shift+R`) https://magnusfjeldolsen.github.io/structural_tools/2dfea/.
3. Load Example → Ctrl+S → file downloads.
4. Clear Model → Ctrl+O → select downloaded file → cantilever restored.
5. Verify schema document is published: open `https://magnusfjeldolsen.github.io/structural_tools/2dfea/schemas/2dfea-model-v1.json` → JSON Schema renders.
6. Network tab: no new 4xx/5xx. Bundle size delta verifiable in `dist/assets/index-*.js`.

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Schema lock-in: shipping v1 means every future breaking change requires a migration entry | Certain | Medium (intentional) | This is the cost of versioned schemas. Mitigation: §5.3 SemVer policy is explicit; minor/patch growth is non-breaking; the migration registry is one-file additive for major bumps. Keep v1 lean — every field shipped is one field future-you must migrate. |
| Zod bundle size pushes beyond budget | Low (~13 KB gzipped) | Low | If exceeded, lazy-import the import path (Phase 9.2). Export path stays eager. |
| `JSON.stringify` non-determinism for floating-point edge cases (e.g. `0.1 + 0.2`) | Very Low | Low | We never compute and serialize; we only serialize values from the store, which were entered as user input or derived deterministically. Round-trip parse-then-stringify is bit-stable for IEEE-754 values. |
| File System Access API path NOT chosen, anchor-download path leaves stale blob URLs | Low | Low | `setTimeout(URL.revokeObjectURL, 1000)` covers all known browsers; revoke is best-effort cleanup, not correctness-critical. |
| User imports a file when the current model has unsaved work (overwrite without warning) | N/A in v1 | N/A | **Resolved in v1** (goal #13, Phase 5.1): `window.confirm` dialog fires whenever the import target would replace a non-empty model. Cancelling the dialog aborts the import without state mutation. Toast on success: "Model imported successfully." `localStorage` autosave continues to provide a secondary safety net up to the next persist write. |
| User imports while worker mid-analysis | Medium | Low (handled) | §3 goal #12: confirm dialog gates the import. |
| `'2dfea-model-storage'` localStorage entry exists but is malformed JSON (e.g. dev hand-edit) | Low | Medium | Zustand's `persist` already handles this — it falls back to `initialState`. The `loadExample` startup gate's `looksLikeFreshStart` check then triggers `loadExample`, restoring sanity. |
| `next*Number` counters added to persist `partialize` break existing users' localStorage | Low | Low | The persist middleware merges loaded state with `initialState`, so missing fields default. Add `onRehydrateStorage` to backfill counters from existing nodes/elements where missing (Phase 3.5). |
| Schema validation toast surface adds visual noise on common typos | Medium | Low | Toast is dismissible, ephemeral (3 s). Console logs are the power-user path. |
| Comments stored in parallel map drift from entity IDs (e.g. user deletes node N1 but `comments.nodes.N1` lingers) | High over time | Low | Add a quiet sweep in `applyToStore` and on every `deleteNode/deleteElement/deleteLoad` action: drop comments referencing deleted entities. Out of scope for v1 (no UI for adding comments yet); revisit when comment UX lands. |
| Published JSON Schema falls out of sync with Zod schema | Medium | Medium | `prebuild` script regenerates the JSON Schema before every build (Phase 8.2). CI catches drift if a manual edit goes uncommitted (the regen would dirty `git status` and the workflow would notice). |
| AI integration consumer expects schema fields we end up renaming in v1.0.1 (PATCH) | Low | High (downstream) | §5.3 PATCH rules explicitly forbid renames — only doc-only or enum-expansion changes. Renames are MAJOR. |
| Browser security: `download` attribute ignored for cross-origin URLs | N/A | None | Blob URLs are same-origin. |
| Large model (~10 MB JSON) browser memory spike on import | Low (would need ~50k entities) | Low | Acceptable; the model would already be unusable in canvas before the file got that big. |
| `tsx` devDep for schema generation isn't a stable choice | Low | Low | `tsx` is widely used; alternatives are `ts-node` or pre-compiling the schema script to JS. If `tsx` causes friction, switch to a `.cjs` output. |
| Deployment cache serves old bundle for 1–2 min | Expected | Low | Hard refresh during verification. |

## 10. Rollout & Deployment

- **Branch strategy**: feature branch `feature/2dfea-save-load-json`, push, open PR, **rebase-merge** to `master` (matches the D1 / undo-redo merge pattern, single-line history).
- **Deployment trigger**: any push touching `2dfea/**` auto-runs `.github/workflows/deploy-all-modules.yml`. Expected 2–3 minutes to go live.
- **Plain-HTML-module impact**: none.
- **Rollback**: single-commit revert
  ```bash
  git revert <merge-sha>
  git push origin master
  ```
  Redeploy in ~3 min. **Data-format consideration**: users who exported a `.json` file under v1 and rely on continued import support: the rollback removes the import path, but their files remain valid v1 — re-deploy fixes it. No persistent data is corrupted (the persist `partialize` change is forward-compat — older code reading the new shape ignores extra fields; newer code reading older shape backfills via `onRehydrateStorage`).
- **Migration notes for users**: none (additive feature). Users with existing `localStorage` get counter-backfill silently on first reload after the deploy.

## 11. Observability & DX

- **Inline comments**:
  - `src/io/schema.ts` — top-of-file JSDoc block summarising v1 design rules, link to this plan, link to `file-format.md`.
  - `src/io/canonicalStringify.ts` — explain why we don't use a library (single use, simple recursion, no edge-case handling beyond sorted-keys).
  - `src/io/applyToStore.ts` — comment block explaining the contract: "Always validate first; mutate only on success; clear temporal history; clear analysis cache."
- **JSDoc** on the public API:
  - `exportCurrentModelToFile()` — describes the file naming convention, the unit policy, the schema version.
  - `promptUserForImport()` — describes the validation chain (parse → version → migrate → Zod → semantic → apply).
  - `migrateToCurrent()` — describes the migration registry semantics and how to add a v2 entry.
- **Console diagnostics** (dev only):
  - `[Export] Model exported as <filename> (size: X KB, schemaVersion: 1.0.0)`.
  - `[Import] Validation succeeded; applying X nodes, Y elements, Z loads.`
  - `[Import] Validation failed (Zod): <issues>`.
  - `[Import] Validation failed (semantic): <errors>`.
  - `[Import] Migrated from v<X> to v<CURRENT>`.
- **Error UX**: toast headline + first error in body + "see console for details". Power users open DevTools; casual users see a clear actionable message.
- **`docs/file-format.md`**: 1-page reference. Sections: overview, schema diagram (link to JSON Schema), unit policy, versioning policy, AI-friendly notes, links to plan and to migration policy.
- **README link**: add a single line to `2dfea/README.md` (if it has a "Features" section) noting the file format and linking to `docs/file-format.md`. If README structure doesn't support it cleanly, skip — this plan and `file-format.md` are sufficient.
- **Realistic usage example**: the cantilever example exported as a v1 file is the canonical fixture. Check it in at `2dfea/docs/examples/cantilever-v1.json` (manually generated, used in the round-trip harness). Documents the format by example.

### Follow-up TODOs (intentional debt — must be addressed before AI integration ships)

These items are deliberately out of scope for v1 of save/load JSON, but each is load-bearing for the future AI-prompt feature. Each is tracked here as a flagged follow-up so it cannot quietly slip:

1. **`metadata.appVersion` wiring** — v1.0.0 ships with the literal string `"unknown"` hard-coded in `src/io/canonicalize.ts`. Before AI integration:
   - Surface `package.json.version` through `vite.config.ts` as `import.meta.env.VITE_APP_VERSION`.
   - Update `canonicalize.ts` to read it; remove the `// TODO(appVersion):` comment.
   - This requires **no schema bump** (the field already exists and accepts any string).
   - Why now-vs-later: the AI integration uses `appVersion` to detect file/runtime skew; today it is informational only.
2. **Comment editor UX** — schema supports `_comments` round-trip, but there is no in-app editor for them today. The file format is annotation-ready; the UI is not. Track in TODO.md when picked up.
3. **Confirm-before-overwrite as a styled modal** — v1 ships with `window.confirm` (native browser dialog) for the overwrite gate. This is functional but visually inconsistent with the rest of the app. Replace with the project's toast/modal component when one exists.
4. **Coverage threshold in CI** — Vitest is wired but no minimum coverage is enforced. When the test suite stabilizes, add a coverage gate to the workflow (e.g. fail under 85% line coverage of `src/io/**`).
5. **Migration test for v2** — when v2 lands, the migration from v1 → v2 must be tested with a fixture that exercises every renamed/restructured field. Today the migration registry only contains the identity entry, so there is nothing to test beyond the plumbing.

Each entry should be moved to the top-level `2dfea/TODO.md` if it is picked up before this plan is archived.

## 12. Success Metrics

Post-merge the feature is successful when:

1. Toolbar Export/Import buttons render on all three tabs and respect the disabled state for empty models.
2. Ctrl+S exports and Ctrl+O imports work in Chrome, Firefox, and Edge — and on macOS for Cmd+S / Cmd+O.
3. A round-trip (export → clear → import) restores the model byte-identically (modulo `metadata.exportedAt`).
4. Importing a corrupt file shows a clear toast and leaves the store unchanged.
5. Importing a file with an unsupported `schemaVersion` shows the unsupported-version toast and leaves the store unchanged.
6. Importing a file with semantically invalid references (orphan element nodeI, missing case) shows a structural-invalidity toast and leaves the store unchanged.
7. `npm run type-check`, `npm run build`, and the CI deploy run all green on `master`.
8. The published JSON Schema is reachable at https://magnusfjeldolsen.github.io/structural_tools/2dfea/schemas/2dfea-model-v1.json.
9. Bundle-size delta ≤ 15 KB minified+gzipped.
10. No console errors in dev or prod.
11. Manual QA groups A–I all pass.
12. The `next*Number` ID-counter regression (Group F #20) is resolved — 51st node is named N51 after reload.
13. `loadExample` is correctly gated — fresh visit loads cantilever, return visit loads persisted model.
14. A4 struck through in `2dfea/TODO.md` (manual edit by user, out of scope of this plan).
