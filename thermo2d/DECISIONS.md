# thermo2d — decisions and deviations from the spec

Spec: "Generic 2D Thermal Analysis App with MCP Server" (Claude Docs, 2026-09-30).
This file records where the implementation deviates from it and why, plus the
non-obvious choices a later maintainer should know about. Each agent appends to
its own section; the lead keeps the top section.

## Lead

### D1. TypeScript core instead of Rust/WASM
The spec recommends a Rust core compiled to WebAssembly. thermo2d has a
**TypeScript core** (`packages/core`) used unchanged by the web app (Web Worker),
the MCP server and the CLI.

Why:
- One language across core, app, server and figure kit; nothing to keep in sync.
- The machine had Rust but no `wasm32` target and no `wasm-pack`; adding and
  pinning a WASM toolchain (and to GitHub Actions) was the largest one-shot risk
  with no benefit for correctness.
- "Identical results in WASM and native within 1e-6 K" holds by construction:
  it is literally the same JavaScript in the browser and in Node.
- The repo's GitHub Pages pipeline already builds Vite/TypeScript modules.

What is kept from the spec: the `mesh(input) → Mesh` and `createRun(input) → Run`
interfaces are the only entry points the shells use, and both take/return plain
typed arrays, so a Rust/WASM core can be dropped in behind them later.

Performance is measured, not assumed (see `packages/core/bench`). The solver
picks its linear solver per run: Jacobi-preconditioned CG for transient runs
with a diagonally dominant system (fire, small Δt) and a direct skyline
Cholesky with RCM ordering for steady state and long climate steps.

### D2. Mesher: size-field point placement + constrained Delaunay (cdt2d)
Spade is a Rust crate and does not apply. The mesher places graded points from
a size field (fine along exposed edges, rings around bars, geometric growth
inward, interior grid), triangulates with the constrained Delaunay
implementation `cdt2d` (MIT), removes exterior/hole triangles, assigns
triangles to the smallest containing region, and smooths interior nodes
(Laplacian, constrained nodes fixed). This is the fallback strategy the spec
itself describes in section 9. Unrefinable spots are reported as `MeshError`,
never looped on.

### D3. Polygon booleans and offsets: polygon-clipping (MIT)
Booleans use `polygon-clipping` (Martinez–Rueda, MIT). Offsets are built from
booleans (union of the polygon with edge rectangles and vertex discs, or the
subtraction of them for inward offsets), which is robust for the concrete-cover
and stirrup cases and needs no second library. Licence checked: MIT.

### D4. Regions may nest
A rebar circle is a region inside the concrete region, not a hole plus a
separate region. The mesher assigns each triangle to the smallest region whose
polygon contains its centroid. Partial overlap is an error; nesting is fine.

### D5. Names and files
Working name **thermo2d**. Project file `.thermo.json`; results file
`.thermo.results` (binary Float32 snapshots with a JSON index). Module URL:
`https://magnusfjeldolsen.github.io/structural_tools/thermo2d/`.

### D6. PNG rendering
PNG export in the MCP server uses `@resvg/resvg-wasm` (MPL-2.0, used as an
unmodified dependency). The web app exports PNG through the browser canvas.
PDF reports are produced as print-ready HTML (browser "Save as PDF"), not a PDF
library, to keep the bundle small and offline.

### D7. Time series are data
Fire curves are generated from their cited formulas into sampled points (dense
in the first minutes) and stored as data in the project together with the
generator name and parameters, so a project is reproducible without the
library.

## Geometry and mesh agent

- **G1. Robust predicates.** Orientation tests use `robust-predicates` (`orient2d`,
  Unlicense/ISC-style, already a transitive dependency of polygon-clipping), so
  self-intersection and point-in-polygon tests are exact. Added as an explicit
  dependency of `@thermo2d/core`.
- **G2. Offsets by sweeping.** `offsetPolygon` unions the polygon with edge
  rectangles and 32-gon vertex discs (disc radius enlarged by 1/cos(π/32) so
  the polygonal disc circumscribes the true circle). Inward offsets subtract
  the same sweep; they may split into several pieces or vanish (empty array).
  `coverPolygon` for rebar sets takes the largest piece.
- **G3. Size field.** h(p) = min(interiorSize, min over fine sources of
  h_source + (growth − 1)·d), with sources = exposed edges (boundarySize) and
  rebar/stirrup rings (rebarSize). Non-exposed (insulated) edges are sampled
  at the local field value, so a fine exposed edge grades smoothly into an
  insulated neighbour.
- **G4. Point placement.** Constraint edges are sampled by integrating 1/h
  along the edge (deterministic, canonical endpoint order, so two regions
  sharing an edge get identical points). Interior points come from a graded
  triangular lattice: levels at interiorSize, /2, /4 … down to the smallest
  size; a lattice point is accepted at the level matching h(p), when it is
  ≥ 0.5·h from any constraint and ≥ 0.6·min(h, level) from existing points.
  T-junctions (partial shared edges) are handled by splitting constraint
  sub-segments at any constraint point lying on them.
- **G5. Triangulation and classification.** `cdt2d` with
  `{delaunay: true, interior: true, exterior: true}`; every triangle is then
  assigned to the smallest-area region containing its centroid, or dropped.
  Four passes of Laplacian smoothing on free nodes, rejecting any move that
  inverts a triangle. Result triangles are CCW; nodes are renumbered to used
  ones only.
- **G6. Boundary bookkeeping.** A mesh edge used by exactly one kept triangle
  is a boundary segment; it is traced back to its constraint (region, ring,
  edgeIndex), preferring the source belonging to the triangle's own region.
  The segment runs a→b with the region on the left. Segments that cannot be
  traced (should not happen) are reported as a warning and treated as
  insulated by the solver.
- **G7. Measured on the 300×500 beam with 6 bars, three exposed faces:**
  coarse 2 039 elements (0.2 s), normal 6 269 elements, min angle 26° (0.7 s),
  fine 19 950 elements (4.6 s, 109 elements below the 27° target, min 22°).
  The interior lattice loop dominates; a coarser candidate stride for the
  finest levels is the obvious speed-up if needed.
- **G8. API adaptations requested by the command layer:** `pointInPolygon(polygon, point)`
  argument order; `filletVertex`/`chamferVertex` operate on a Ring (polygon
  versions are `filletPolygonVertex`/`chamferPolygonVertex`); `resolveEdgeRef`
  returns `{ ring: number, index, region, points }`; `parseGeometryWorkspace`
  returns `{name, polygon, materialHint?}[]`, `parsePolygonCsv` a Ring,
  `parseDxf` Ring[] (the `*Detailed` variants keep notes); `buildTemplate`
  throws `CommandError('not-found' | 'bad-value')`.
- **G9. Rebar sets.** Edge bars: the bar centre sits at cover + Ø/2 from the
  edge (cover to surface) or at cover (cover to centre); start/end offsets
  default to the same value measured along the edge; `count` distributes
  evenly, `spacing` starts at the start offset. Corner bars snap to the nearest
  vertex of the cover-offset polygon. Ring bars start at the bottom (−90°).
  Names "B1…" run by set order, then bottom-to-top / left-to-right; manual
  bars come last. Ids are `<setId>_b<setIndex>` unless an existing bar with
  the same (setId, setIndex) is reused.

## Solver agent

- **S1. Enthalpy-form lumped capacity.** The transient residual per node is
  Σ_g A_g·[H_g(θ) − H_g(θ_old)]/Δt over the node's material groups (a node on a
  material interface has one group per material). H is ∫ρcp dθ from 0 °C,
  built by `tableMaterial` as a cumulative trapezoid on a 1 °C grid, so the
  100–115 °C moisture peak is always integrated, never sampled. The Jacobian
  uses the secant (H(θ)−H(θ_old))/(θ−θ_old) when |Δθ| > 1e-3 K, else ρcp(θ).
  A 'consistent' capacity option is NOT implemented (spec asked for it as a
  comparison only); the field is accepted and ignored — recorded as a gap.
- **S2. Newton and damping.** Newton per step with the analytically
  linearised radiation term. Converged when ‖R‖ ≤ tol.residual·‖R₀‖, or when
  the last update is below tol.deltaTheta and ‖R‖ ≤ 1e-2·‖R₀‖ (the spec's
  "and" would force an extra solve on linear problems). A residual increase
  halves the last update (up to 4 times). A linear predictor
  θ = θ_old + (Δt/Δt_prev)(θ_old − θ_prev) starts each step; it cut the
  Newton count on the fire bench from 2.4 to 1.8 per step.
- **S3. Linear solver choice.** Problems with constant materials and no
  radiation are detected (`MaterialEvaluator.isConstant`, an additive optional
  field on the contract) and use the skyline Cholesky (RCM) factorised once per
  Δt and reused; steady state uses it too. Nonlinear transients use Jacobi-PCG
  (warm start 0, tol 1e-10) and switch to the direct solver for the rest of the
  run if a solve needs > 300 iterations or CG fails. Recorded in
  `stats.linearSolver`.
- **S4. Dirichlet by elimination.** Fixed nodes get their series value before
  each Newton loop; their rows and columns are zeroed with a unit diagonal
  (column slots precomputed), keeping the matrix symmetric for CG. The reaction
  flux (the full residual at those nodes) goes into the energy balance.
- **S5. Energy balance** uses the residual identity: stored enthalpy change =
  Σ(boundary + reaction + source power)·Δt with the α-weighting of the scheme,
  so a converged run closes to ~1e-7 regardless of mesh.
- **S6. Measured (Node 24, this laptop):** bench A (300×500 beam, 6 bars,
  16 968 nodes, 90 min at 5 s) 18.9 s, 1.8 Newton/step, PCG; bench B (1000×300
  wall, 9 955 nodes, one year at 1 h) 14.2 s with the reused factorisation.
  Both under the 30 s targets. The 32 solver/post/validation tests run in ~1 s.
- **S7. Post-processing** keeps its own element locator (uniform bucket grid,
  cached per mesh in a WeakMap) so the solver does not depend on the mesh
  module. Heat flow across fixed-temperature edges uses λ∇θ·n of the adjacent
  element and needs the materials; flux-type edges use the condition itself.

## Library agent

- **L1. Enthalpy on a 1 °C grid.** `compileMaterial` tabulates ρcp and λ from
  −50 to 1300 °C and integrates H(θ) with the trapezoid rule; between grid points
  H is the exact integral of the linear ρcp. A step discontinuity that sits exactly
  on a grid point (concrete cp jump at 100 °C) is smeared over one degree; the
  energy error is half a degree of peak (< 1 % of ΔH across 90–130 °C). Constant
  materials short-circuit (`isConstant = true`) so the solver can factorise once.
- **L2. Concrete moisture peak** is interpolated linearly in u between the
  standard's three values (1470 / 2020 / 5600 J/kgK at 1.5 / 3 / 10 %) and the dry
  value at u = 0; constant 100–115 °C, then linear to 1000 J/kgK at 200 °C.
- **L3. Timber density floor.** EN 1995-1-2 Table B.1 reaches ρ = 0 at 1200 °C;
  the evaluator floors ρ at 1 % of ρ_dry so the capacity never vanishes.
- **L4. Quality flags.** `standard` = transcribed from the cited clause (EN 1992-1-2,
  EN 1993-1-2 incl. Annex C, EN 1995-1-2 Annex B, EN 1999-1-2, EN 1994-1-2, EN ISO
  6946, EN ISO 10456 Table 3, EN ISO 13370 Table 1, EN 1991-1-2 §3.2 / Annex A,
  ASTM E119). `typical` = indicative values without a product datasheet: all
  insulation items (declared λ varies by product), stone-wool high-temperature
  table, gypsum type F fire table, gypsum fibre / cement / calcium-silicate boards,
  AAC, screed, bricks, hard fibreboard, and the tunnel curves HCM / RWS / RABT-ZTV
  (transcribed from secondary sources — verify). Prestressing k_p tables (Table
  3.3) are flagged "verify" in their citation. The user replaces typical items with
  datasheet values via a user library (CSV or JSON) — no admin, no code.
- **L5. Curve parameters.** Step/ramp accept both `tStep`/`tStart`/`tEnd` and
  the command layer's `t0`/`t1`. Fire-curve items default to 7200 s. Parametric
  fire enforces O 0.02–0.20, b 100–2200, q_t,d 50–1000 and throws
  `CommandError('bad-value')` naming the limit; unknown generators throw
  `CommandError('not-found')` with the option list.
- **L6. Active library.** `setActiveLibrary(items)` (default `BUILTIN_LIBRARY`)
  is what `getLibraryItem`/`searchLibrary` read when no list is passed; the server
  calls it after merging the workspace's user libraries. User ids that collide
  with built-ins are prefixed `user:`.
- **L7. Import.** Time unit is taken from the header (`[min]`, `[h]`, `dato`…),
  from ISO 8601 / dd.mm.yyyy timestamps, or from Excel serial magnitudes
  (20 000–80 000); otherwise seconds with a warning. Gaps (> 1.5× median step)
  are reported, never filled. EPW: dry-bulb temperature, column 7, 99.9 = missing.

## Figure kit, MCP and CLI agent

- **F1. Figures are strings, not DOM.** `@thermo2d/figures` builds SVG text and
  self-contained HTML with no DOM or canvas dependency, so the same code runs in
  the browser, the MCP server and the CLI. PNG is rasterised only in the server
  (`@resvg/resvg-wasm`, wasm copied to `dist/resvg.wasm` by `build.mjs`); the app
  uses the browser canvas.
- **F2. Local isotherms.** The figure kit has its own marching-triangles
  `isothermSegments` and line sampling (`sampleLine` via `interpolateField`) so it
  does not depend on the exact shape of `post.isotherm` / `post.lineProfile`.
- **F3. Interactive HTML embeds base64 Float32 snapshots**, thinned to at most 61
  evenly spaced snapshots per result (`maxSnapshots`), so a 20 000-node run stays
  around 5 MB and can be emailed. Probe curves at every solver step are embedded
  unthinned. Script is vanilla JS (< 60 KB).
- **F4. Core adapter.** `packages/server/src/coreApi.ts` binds every core
  function the server uses by name at runtime with the signature the server was
  written against. A missing export throws a plain message at call time instead
  of failing the whole server; a changed signature is fixed in that one file.
- **F5. Runs are time-sliced, not threaded.** `run_analysis` steps the solver's
  `Run` on the event loop, yielding every ~40 ms, so the stdio server answers
  `get_run_status` / `cancel_run` while running. `wait: true` (default) blocks up
  to `timeoutSeconds` and then hands back the job id. A worker thread can replace
  this behind the same job API if the UI ever shares the process.
- **F6. `open_in_app` saves the project and returns the app URL.** The WebSocket
  live bridge from spec §12 is out of v1 scope; hand-off is by file.
- **F7. Reports are print-ready HTML (A4 `@page`)**; PDF via the browser's
  Save-as-PDF. No PDF library, nothing to install.
- **F8. Metrics through the project.** U, ψ, f_Rsi and heat flow are answered by
  `evaluateMetrics` on `project.metrics`; the server does not call the individual
  post functions, so the metric definitions live in one place.
- **F9. Case 15 test** builds the spec case-5 beam only through MCP tools with a
  coarse mesh and Δt = 30 s (so the test finishes quickly), then re-runs the saved
  file with the CLI's `runProjectFile` and requires ≤ 1e-6 K. It self-skips until
  the core exports it needs exist.

## Web app agents

- **W1. React 18 + zustand, no UI library.** The editor is ~30 small files: a
  zustand store that holds the `Project` document, an undo/redo history of
  whole documents (200 steps; documents share structure so this is cheap), the
  results map keyed by analysis|scenario, and UI state. Every model change is
  `dispatch(commands)` → `applyCommands`; the editor never mutates the project.
- **W2. Worker protocol.** `src/worker/protocol.ts` types the messages
  (mesh / run / progress / snapshot / done / error / cancel); the worker calls
  `prepareRun` + `mesh` + `createRun` from the core and posts progress every
  ~100 ms. Typed-array buffers are transferred, not copied. The 300×500 beam
  with the normal preset runs in ~3–4 s in Chrome.
- **W3. Persistence.** Debounced autosave of the project JSON to localStorage
  with a restore prompt on start; Save/Open through the File System Access API
  with download/upload fallback; results are exported as `.thermo.results`.
- **W4. Start dialog** offers blank canvas or a template with live parameter
  preview, and (opt-out) adds the default concrete, ISO 834 and three-sided fire
  exposure so a beam is runnable in two clicks.
- **W5. Probes added after a run** are sampled from the stored snapshots in the
  results view (`withProjectProbes`), so pinning a click or typing a row never
  requires a rerun (spec §11).
- **W6. i18n**: one typed dictionary `{ nb, en }` for the editor and a separate
  one for the results view; `nb` is the default.
- Not done in v1: arc segments are discretised on creation (no true arcs); the
  "Check mesh" half-size rerun exists as a button but reports only the probe
  change, not a full convergence table; the sweep UI is not wired (the chart
  exists); no DXF export.

## Verification agent

The verification agent was cut off by the session limit; the lead wrote
`packages/core/test/verification/spec14.test.ts` instead. Results on Windows 11
(Node 24):

| Case | Result |
|---|---|
| 1, 2, 3, 8, 9, 12, 13 | pass (solver agent's `test/validation`, tolerances per spec) |
| 4 | pass (`test/library`, ≤ 0.5 %) |
| 5 | pass: mid-width depth profile at 90 min within the Annex A read-offs (25 mm 560, 50 mm 350, 75 mm 230, 100 mm 150 °C ± max(5 %, 15 K, read-off band)); 500 °C isotherm at ~34 mm; corner bars 552 °C, middle bars 381 °C; symmetric ≤ 0.1 K; energy imbalance 3e-7. Read-offs are from memory of EN 1992-1-2 Figure A.2 and marked approximate. |
| 6 | todo — needs section 17 data from the user |
| 7 | pass: normal/Δt 5 s vs fine/Δt 2.5 s changes rebar temperatures < 2 K |
| 10 | pass (`test/geometry`) |
| 11 | case 1 (analytical half-square) passes within 0.1 K; case 2 todo (reference numbers to transcribe) |
| 14 | todo — needs a furnace test or reference calculation |
| 15 | pass: the case 5 model built only through MCP tools equals the CLI run within 1e-6 K (`packages/server/test/case15.test.ts`) |

Library spot-check (12 values from EN 1992-1-2, EN 1993-1-2, EN 1995-1-2,
EN 1991-1-2) passes. Reproducibility: two runs are bit-identical, also after a
serialize → parse round trip. Error messages contain no FEM jargon and list the
valid ids.

### Results view (web app results agent)

- **R1. Canvas, not SVG, for the field.** The temperature field is drawn on a
  Canvas 2D with one `Path2D` per colour band, so scrubbing the time slider on
  a 100k-triangle mesh stays interactive. "Smooth" shading subdivides only the
  triangles whose vertices span several bands (depth 2, depth 1 above 60k
  elements); it approximates a per-vertex gradient without a WebGL dependency.
- **R2. Fixed FEM-Design-like scale by default.** 0–1100 °C in 100 °C bands,
  editable (min/max/step, sanitised); the palette stops are copied from the
  figure kit so on-screen and exported figures match. Difference fields use a
  symmetric blue–white–red scale with ±max|Δ| limits.
- **R3. Small local helpers instead of core for trivial things.** `fieldAt`
  (snapshot interpolation) and a bucket-grid element locator live in
  `src/results/fieldUtils.ts` so hover readouts and temporary/dragged probes
  work without a round-trip and never depend on an export being present.
  Isotherms, reduced section, rebar table, metrics, dew point and line profiles
  come from `@thermo2d/core` post (wrapped in try/catch, degrade to "–").
- **R4. Temporary probe → Pin.** A click drops a temporary marker with the
  value at the current time; "Pin" calls `onAddProbe`, so the model only
  changes when the user asks. Dragging a pinned probe emits `onUpdateProbe` on
  drop; rebar probes are not draggable (they follow the bar).
- **R5. Own strings.** `src/results/i18n.ts` (nb/en, completeness-tested) so
  the results view can be mounted anywhere without the editor's dictionary.
- **R6. Exports fail soft.** PNG comes from the canvas; SVG/CSV/interactive
  HTML go through `@thermo2d/figures` behind try/catch with a CSV fallback, so
  a missing figure-kit export shows a message rather than breaking the view.
- **R7. Inner-surface proxy.** The condensation check uses the lowest boundary
  node temperature at the current time as the inner-surface temperature until
  the user defines a `min-surface-temperature` metric on the inside edges.

## Follow-up round (2026-10-01)

Decisions taken with the user in a structured interview after the one-shot
(see also CONTEXT.md for the vocabulary): bars meshed as steel by default with a
one-click concrete-reading comparison; unexposed face 4 W/m²K default, 9 W/m²K
preset, custom allowed; cover to the longitudinal bar surface plus an explicit
«Ø tverrarmering» distance; «randbetingelse» kept as the user term with paint
mode and edge splitting; exact isobands as the default rendering (linear inside
elements); interior mesh size scaled by section area; custom materials saved to
the project, a personal browser library and the Git company library; agents use
`window.thermo2d` (MCP-shaped `describe()`), the MCP server is kept as
experimental, the WebSocket bridge is dropped; FEM-Design data stays local;
building physics beyond the dew-point check becomes a separate module later.
Two fixes from browser testing: edge references survive vertex moves
(`resolveEdgeRef` keeps a valid index when the fingerprint changed) and the
material range warning has 2 K slack so 20 °C ambient does not trigger it.

### Results view (agent B)
- **R8. Exact isobands.** The field is drawn by clipping every triangle against
  the band boundaries in value space (Sutherland–Hodgman on the linear field),
  one `Path2D` per band, built once per (field, scale) in model coordinates and
  drawn through the canvas transform. This is exact for linear elements and
  replaces the subdivision approximation («Glatt»). «Per element» remains as an
  option. The difference field uses the same routine with a symmetric scale.
- **R9. Concrete comparison for bars.** «Vis betongtemperatur ved stangsenter»
  runs a copy of the project where each bar takes its host region's material,
  in a second solver worker owned by the results view, and shows concrete θ and
  Δ beside the steel values. Cached per project hash + analysis + scenario and
  marked stale when the project changes. The table states the thermal model per
  bar from its material category (metal → «Stål (meshet)», concrete → «Betong (avlest)»).
- **R10.** The `ResultsViewProps` contract is unchanged.

- **C1. Help as a drawer, not a wiki site.** Help lives in the app (`src/help`): seven short pages in nb/en (getting started, climate, boundary conditions, reinforcement, probes, glossary, agents), rendered from a tiny block markup in `strings.ts` so content stays reviewable as text. The glossary is a copy of CONTEXT.md and must be kept in sync by hand.
- **C2. Tour by detection, not by data attributes.** The 8-step tour finds its targets by button/tab text (nb and en) and advances when the model shows the step was done (region exists → has material → fire BC → rebars → probes → result → clicked probe). It auto-starts once after the first template-based project and remembers completion in localStorage. `[data-tour="run"]` is honoured if present.
- **C3. Agent API shaped like MCP, always on.** `window.thermo2d` (`src/agent/api.ts`) exposes tools as `{ name, description, inputSchema }` and `call(name, input)`; errors are JSON with field/options/suggestion. It goes through `useStore.dispatch`/`run`, so undo, autosave and validation apply exactly as for the user. A badge shows each call for 4 s. `public/agent.md` documents it with a worked example; the help drawer links to it. No WebSocket bridge.
