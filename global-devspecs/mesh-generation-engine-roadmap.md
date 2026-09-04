# Shell Mesh Generation Engine — Research & Roadmap

Status: **research complete, no implementation started.** This document is the output of a literature/licensing research pass and defines the plan for building an original, in-house 2D/shell mesh generation engine — Delaunay/CDT triangulation, quad-dominant meshing, and non-manifold conformal meshing for intersecting shell parts (e.g. a wall landing on a slab) — for eventual use in a closed-source commercial SaaS product, compiled to WebAssembly.

Nothing here may use or derive from GPL/AGPL-licensed code (Triangle, GMSH, CGAL, TetGen are explicitly out). Everything is either (a) implemented from scratch based on published, decades-old academic algorithm descriptions (algorithms/methods are not copyrightable — only a specific code expression is), or (b) a genuinely permissively-licensed (MIT/Apache-2.0/BSD/ISC/Boost) dependency, confirmed by checking the actual license file, not by reputation.

---

## 1. Executive summary / recommendation

- **Language: Rust**, targeting `wasm32-unknown-unknown` via `wasm-bindgen`/`wasm-pack`. Comparable-or-better WASM performance vs. C++, a leaner and better-maintained WASM toolchain, and a permissively-licensed crate ecosystem that already covers nearly every primitive needed (robust predicates, CDT, polygon boolean ops, linear algebra) with zero GPL exposure anywhere in the stack. C++/Emscripten remains the fallback if a specific need for an existing C/C++ codebase arises later.
- **Mesh data structure: index-based half-edge (DCEL) into flat arenas** (`Vec<Vertex>`, `Vec<HalfEdge>`, `Vec<Face>` with integer handles), not pointer/`Rc<RefCell<>>` graphs. This sidesteps Rust's borrow-checker friction with cyclic mesh structures, and is simultaneously the best design for cache locality and for WASM's flat linear-memory model — the three constraints converge on the same answer.
- **Core algorithm stack** (all from public papers, no GPL code):
  1. Robust orientation/incircle predicates (Shewchuk 1997) — correctness foundation for everything else.
  2. Incremental Delaunay triangulation (Sloan 1987 style: insert + jump-and-walk point location + Lawson-flip stack), with BRIO (Amenta/Choi/Rote 2003) insertion ordering for cache-friendly performance at scale.
  3. Constrained Delaunay triangulation (Sloan 1993 / Chew 1987) to lock in user-drawn boundaries, holes, fillets, internal edges as fixed constraint segments.
  4. Ruppert (1995) / Chew's-second Delaunay refinement for quality-guaranteed triangles (bounded minimum angle, size/curvature-graded via a background sizing field).
  5. Quad-dominant conversion via **Blossom-Quad** (Remacle et al. 2012: dual-graph minimum-cost perfect matching on the triangulation, via Edmonds' Blossom algorithm) as the primary tri→quad method, with unmatched triangles naturally remaining as triangles — this is the direct, principled origin of the "combination of rectangles and triangles" requirement. Transfinite interpolation (structured mapped meshing) as a fast-path for simple 4-sided sub-regions.
  6. Non-manifold topology (simplified radial-edge / partial-entity model) + imprint-and-merge (White & Saigal 2002/2004) to get exactly-coincident shared nodes where shell surfaces intersect (e.g. wall-on-slab). For planar structural panels this collapses to plane-plane intersection + polygon clipping, not general NURBS-surface intersection — a major implementation simplification for v1.
- **License posture**: build everything above from papers, optionally leaning on a short list of confirmed-permissive Rust crates (`robust`, `spade` as an architectural reference, `i_overlay`/`clipper2`, `nalgebra`/`faer`) — see §6 for the full audit.
- **BLAS/LAPACK**: not relevant to the *mesher* (which is combinatorial/geometric, not dense-linear-algebra-heavy) — defer that question entirely to a future FEM *solver* module, and prefer pure-Rust `faer`/`nalgebra` over a WASM-compiled OpenBLAS if/when it's needed (WASM-compiled OpenBLAS is confirmed feasible but ~10x slower than native and loses SIMD/threading in that environment).

---

## 2. Problem scope

The engine must, from a set of user-authored planar shell panels (slabs, walls — each an outline polygon with possible holes/openings, fillets, and internal features), produce:

1. A high-quality, FEM-appropriate **quad-dominant mesh with triangle fill** on each panel, respecting the panel's exact boundary geometry (no unwanted geometric simplification), user-specified or curvature/proximity-driven element sizing, and graded size transitions.
2. **Exactly coincident nodes** along the intersection line(s) where two or more panels meet in 3D (wall standing on a slab, wall-to-wall corners, T-junctions where a wall spans only part of a slab edge) — a true conforming mesh, not a tied/MPC approximation.
3. Determinism and robustness against the numerical edge cases that are endemic to CAD-adjacent geometry: near-collinear points, near-cocircular points, near-coincident/misaligned edges from independently drawn panels, small input angles at fillet/notch corners.

Non-goals for v1 (explicitly deferred): curved/NURBS shell surfaces (only planar panels for now — this is what makes intersection handling tractable), fully general 3D solid/volume meshing, GPU-parallel construction, anisotropic/metric-tensor sizing fields (plain scalar sizing is enough for v1).

---

## 3. Phased implementation roadmap

Each phase should ship as an independently testable Rust crate/module with its own unit tests (including deliberately adversarial/degenerate geometry) before the next phase builds on it.

### Phase 0 — Robust geometric predicates
- Implement `orient2d` and `incircle` using Shewchuk's adaptive-precision expansion arithmetic (Two-Sum/Two-Product, `fast-expansion-sum`, adaptive fallback to higher precision only when the fast path's error bound doesn't guarantee the sign).
- Cross-validate against the `robust` crate (MIT/Apache-2.0) and/or Shewchuk's original `predicates.c` (public domain) during development — either as a direct dependency or as a correctness oracle in tests.
- Deliverable: a standalone, well-tested `predicates` crate. This is the correctness foundation every later phase depends on; bugs here cause silent topological corruption downstream, so invest disproportionately in its test suite (degenerate/collinear/cocircular cases, large-coordinate-range cases).

### Phase 1 — Unconstrained Delaunay triangulation
- Half-edge/DCEL mesh structure with index-based handles.
- Incremental insertion (Bowyer-Watson cavity retriangulation, or Sloan-style insert+flip-stack — recommend the latter as more implementation-friendly and closer to what production libraries do) with jump-and-walk point location.
- BRIO insertion ordering for large point sets.
- Deliverable: given an arbitrary point set, produce a correct Delaunay triangulation. Test against known analytic cases and against `delaunator`/`spade` output for cross-validation (dev-dependency only, not shipped).

### Phase 2 — Constrained Delaunay triangulation (CDT)
- Segment insertion via the flip-based approach (Sloan 1993): repeatedly flip edges crossing a to-be-inserted constraint segment until it appears explicitly, then locally re-legalize (Delaunay everywhere except across constraint edges).
- PSLG input: outer boundary loop + hole loops + internal constraint edges (fillet boundaries, internal walls-of-openings, etc.).
- Hole/region classification via flood-fill from seed points across non-constraint edges (the standard technique — no new geometry needed, pure graph traversal).
- Deliverable: given a user-drawn outline with holes and internal edges, produce a CDT that exactly respects every input edge.

### Phase 3 — Quality mesh refinement
- Encroachment test (point inside a constraint segment's diametral circle) and poor-triangle test (minimum angle / circumradius-to-shortest-edge ratio) against a **background sizing field** (see Phase 5).
- Ruppert-style refinement loop: split encroached segments, insert circumcenters of poor triangles (deferring to segment-splitting when a circumcenter would newly encroach), targeting ~20–30° minimum angle.
- Explicit handling for small input angles at fillet/notch corners (a known non-termination risk for naive Ruppert implementations) — cap Steiner point insertion near such corners and accept a locally-relaxed angle bound there rather than looping.
- Deliverable: a quality-guaranteed all-triangle mesh, size-graded per Phase 5's field, feeding Phase 4.

### Phase 4 — Quad-dominant conversion
- Build the triangulation's dual graph (one node per triangle, edge between adjacent triangles) with a cost function per dual edge scoring how close-to-square the merged quad would be.
- Run minimum-cost perfect matching (Edmonds' Blossom algorithm — a classical, license-free graph algorithm; a permissively-licensed generic matching implementation can be used or reimplemented) to pick which triangle pairs merge into quads.
- Unmatched triangles remain triangles — this is the mechanism satisfying the "mix of rectangles and triangles" requirement, concentrated naturally near boundaries, holes, and irregular geometry.
- Local topological cleanup pass (edge swaps / triangle-pair re-merges) to reduce irregular (non-4-valent) interior nodes and improve shape quality; final smoothing pass (Laplacian or angle-based).
- Fast-path: detect sub-regions that can be parameterized as a simple 4-sided panel and mesh them via transfinite interpolation (structured, perfectly quad, zero irregular nodes) instead of running the general algorithm — worth doing for the common case of plain rectangular wall/slab panels between openings.
- Deliverable: quad-dominant mesh with triangle fill, on a single flat panel with holes/fillets.

### Phase 5 — Sizing / grading field
- Background scalar sizing field `h(x)` built from: user-specified size hints, curvature-based sizing on curved boundary segments (arcs/fillets — sample proportional to local radius), proximity-based sizing (narrow gaps between boundaries get finer elements), merged by local minimum.
- Gradation-limiting pass (Alauzet-style edge relaxation) to bound the size ratio between neighboring field samples so the final mesh transitions smoothly rather than jumping abruptly.
- Deliverable: a reusable sizing-field module consumed by Phase 3 (refinement target) and Phase 4 (quad sizing).
- v2/deferred: anisotropic/metric-tensor sizing for direction-dependent grading (e.g. along a beam line) — not needed for v1.

### Phase 6 — Non-manifold topology & conformal intersection meshing
- Topology model: a simplified radial-edge / partial-entity representation restricted to the "surface complex" case (no manifold-closure requirement) — vertices, edges each storing an *ordered list* of the faces using it (not just 2), faces each bounded by a loop of edges.
- Pairwise panel intersection: since panels are planar, this is plane-plane intersection (closed-form line) clipped against both panels' polygon boundaries — not general surface-surface intersection. Handle the T-junction case explicitly (a short wall's edge lying along part of a longer slab edge: split the longer edge at the shorter edge's endpoint projections).
- Imprint: split each panel's boundary/loop structure along the intersection segments it participates in, creating new shared topological edges.
- Merge: the shared edge is meshed exactly once (1D node placement along it, respecting Phase 5's sizing field), and both adjacent panels' Phase 2–4 meshing is given that discretization as a **fixed, non-negotiable boundary constraint** — guaranteeing exact node coincidence with no post-hoc snapping.
- Tolerance handling for near-but-not-exactly-aligned geometry (misaligned CAD-style input) via a merge tolerance, per White/Mysore/Saigal 2004.
- Fallback (flagged, not primary): non-conforming interfaces tied via multi-point constraints, only when true imprint/merge genuinely cannot resolve a case (degrades solution continuity — avoid as the default path).
- Deliverable: given N intersecting planar panels, produce N conforming meshes sharing exact nodes along every intersection line, feeding directly into an FEA assembly step.

### Phase 7 — WASM packaging & performance hardening
- `wasm-pack` build targeting `wasm32-unknown-unknown`; size tuning (`opt-level = "z"`, LTO, `panic = "abort"`, `wasm-opt -Oz`).
- Benchmark against representative structural models (multi-panel buildings with dozens of openings) for both time and peak memory.
- Evaluate WASM SIMD128 (via `std::arch::wasm32` intrinsics or the `pulp` abstraction, which also backs `faer`) for the hot inner loops (predicate evaluation, flip stack processing) once correctness is solid — don't optimize before Phase 0–6 are correct.
- If WASM threading is ever wanted: note explicitly that it requires `SharedArrayBuffer` + COOP/COEP response headers on the hosting page — a deployment/infra decision, not just a code one; flag with whoever owns hosting before committing to it.

### Phase 8 (future, separate module) — FEM solver integration
- Not part of this mesher, but the natural next consumer: mesh → stiffness assembly → linear solve. This is where BLAS/LAPACK-class performance actually matters (dense/sparse factorization), unlike meshing itself. Revisit `faer`/`nalgebra` vs. a WASM-compiled OpenBLAS decision at that point, informed by real solver workloads.

---

## 4. Recommended Rust crate stack

All confirmed permissively licensed (checked against actual crates.io/repo license metadata, not reputation):

| Crate | Role | License | Notes |
|---|---|---|---|
| `robust` (georust) | Robust orientation/incircle predicates | MIT OR Apache-2.0 | Use directly, and/or as a correctness oracle for an in-house Shewchuk-expansion implementation |
| `spade` | Architectural reference (2D Delaunay + CDT + refinement) | MIT OR Apache-2.0 | The closest existing prior art to this whole roadmap — read its source/docs closely before Phases 1–3; may be usable directly for early prototyping even if the shipped engine is eventually fully in-house |
| `i_overlay` | 2D polygon boolean ops (union/intersection/difference), self-intersection tolerant | MIT OR Apache-2.0 | Directly applicable to Phase 6's planar panel clipping/imprinting |
| `clipper2` (Rust bindings) | Alternative/fallback polygon clipping + offsetting + CDT | Boost-1.0 | Fallback if `i_overlay` proves insufficient |
| `parry2d`/`parry3d` | Spatial queries, BVH, intersection primitives | Apache-2.0 | Useful for broad-phase panel-pair intersection candidate detection in Phase 6 |
| `nalgebra` | General linear algebra (small local solves: circumcenters, transforms) | Apache-2.0 | Confirmed wasm32 support out of the box |
| `faer` | High-performance pure-Rust linear algebra (BLAS-competitive, no external BLAS/Fortran dependency) | MIT | Relevant to Phase 8 (FEM solver), not the mesher itself; SIMD backend (`pulp`) supports wasm32/simd128 on stable Rust |
| `geo`/`geo-types` | General 2D geometry primitives, if convenient for I/O or auxiliary computations | MIT OR Apache-2.0 | Optional; depends on `robust` internally |

Do not link, embed, or derive code from: Triangle (Shewchuk — restrictive non-commercial-by-default license, needs a direct paid arrangement with the author), CGAL (GPL for the relevant `Triangulation_2` package tier; commercial license available from GeometryFactory for a fee), GMSH (GPL v2+), TetGen (AGPLv3 — strictest, network-copyleft), DistMesh (GPL — algorithm/paper is fine to reimplement, the MATLAB code is not), Netgen/NGSolve and MMG (LGPL — technically not GPL, but LGPL's relink obligation is a poor fit for a statically-linked WASM binary; treat as reference-only), Open CASCADE/OCCT (LGPL, same static-link/WASM caveat, plus explicitly murky legal territory for statically-linked WASM specifically).

`earcut`/`earcutr` (ISC/MIT) is permissively licensed but is **not** a Delaunay/quality mesher (ear-clipping only, no angle-quality guarantee) — don't use it for FEM mesh generation, only worth knowing about for unrelated fast-rendering-triangulation needs.

---

## 5. Key reference papers (all safe to implement from — algorithms are not copyrightable)

**Delaunay triangulation**
- Bowyer, A. "Computing Dirichlet Tessellations." *Comput. J.* 24(2), 1981.
- Watson, D.F. "Computing the n-Dimensional Delaunay Tessellation with Application to Voronoi Polytopes." *Comput. J.* 24(2), 1981.
- Guibas, L. & Stolfi, J. "Primitives for the Manipulation of General Subdivisions and the Computation of Voronoi Diagrams." *ACM TOG* 4(2), 1985. (quad-edge data structure)
- Sloan, S.W. "A Fast Algorithm for Constructing Delaunay Triangulations in the Plane." *Advances in Engineering Software* 9(1), 1987.
- Amenta, N., Choi, S., Rote, G. "Incremental Constructions con BRIO." *SCG* 2003.

**Constrained Delaunay triangulation**
- Chew, L.P. "Constrained Delaunay Triangulations." *SCG* 1987, journal version *Algorithmica* 1989.
- Sloan, S.W. "A Fast Algorithm for Generating Constrained Delaunay Triangulations." *Computers & Structures* 47(3), 1993.

**Quality mesh refinement**
- Ruppert, J. "A Delaunay Refinement Algorithm for Quality 2-Dimensional Mesh Generation." *Journal of Algorithms* 18(3), 1995.
- Shewchuk, J.R. "Delaunay Refinement Algorithms for Triangular Mesh Generation" (survey covering both Ruppert's and Chew's second algorithm side by side) — read this before implementing Phase 3.

**Robust predicates**
- Shewchuk, J.R. "Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates." *Discrete & Computational Geometry* 18(3), 1997.

**Quad and quad-dominant meshing**
- Blacker, T.D. & Stephenson, M.B. "Paving: A New Approach to Automated Quadrilateral Mesh Generation." *IJNME* 32(4), 1991.
- Owen, S.J., Staten, M.L., Canann, S.A., Saigal, S. "Q-Morph: An Indirect Approach to Advancing Front Quad Meshing." *IJNME* 44(9), 1999.
- Remacle, J.-F., Lambrechts, J., Seny, B., Marchandise, E., Johnen, A., Geuzaine, C. "Blossom-Quad: A Non-Uniform Quadrilateral Mesh Generator Using a Minimum-Cost Perfect-Matching Algorithm." *IJNME* 89(9), 2012. (**primary Phase 4 reference**)
- Lo, S.H. "A New Mesh Generation Scheme for Arbitrary Planar Domains." *IJNME* 21(8), 1985. (advancing front paradigm)

**Sizing/grading**
- Alauzet, F. "Size Gradation Control of Anisotropic Meshes."
- Persson, P.-O. & Strang, G. "A Simple Mesh Generator in MATLAB." *SIAM Review* 46(2), 2004. (algorithm/paper only — the MATLAB code is GPL, do not use it)

**Non-manifold topology & conformal intersection meshing**
- Weiler, K. "The Radial Edge Structure: A Topological Representation for Non-Manifold Geometric Modeling." In *Geometric Modeling for CAD Applications*, North-Holland, 1988.
- Lee, S.H. & Lee, K. "Partial Entity Structure: A Compact Boundary Representation for Non-Manifold Geometric Modeling." *ASME J. Computing and Information Science in Engineering*, 2001.
- White, D.R. & Saigal, S. "Improved Imprint and Merge for Conformal Meshing." *Proc. 11th International Meshing Roundtable*, 2002.
- White, D.R., Mysore, R., Saigal, S. "An imprint and merge algorithm incorporating geometric tolerances for conformal meshing of misaligned assemblies." *IJNME*, 2004.
- Owen, S.J. "A Survey of Unstructured Mesh Generation Technology." *Proc. 7th IMR*, 1998. (bottom-up vertex→curve→surface meshing paradigm underlying Phase 6)

---

## 6. License audit (verified, not assumed)

| Project | Confirmed license | Verdict |
|---|---|---|
| Triangle (Shewchuk) | Custom: free for research/private use; **"distribution as part of a commercial system is permissible ONLY BY DIRECT ARRANGEMENT WITH THE AUTHOR"** | **Avoid.** Not GPL, but arguably worse for a commercial product — do not embed. Note: Triangle's bundled `predicates.c` is *separately* public domain (see below) — only the mesh-generation code proper carries the restriction. |
| CGAL | Dual GPL v3+/LGPL v3+ (the relevant `Triangulation_2` package tier is GPL) or paid commercial license from GeometryFactory | **Avoid** without a paid license. |
| GMSH | GPL v2+ | **Avoid.** |
| TetGen | Dual AGPL v3 / paid commercial (WIAS) | **Avoid** (out of scope anyway — 3D). |
| Netgen/NGSolve, MMG | LGPL v2.1+ | **Avoid embedding** — LGPL's relink obligation doesn't fit a statically-linked WASM binary; reference/study only. |
| Open CASCADE (OCCT) | LGPL-2.1 with exception | **Avoid** — same static-link/WASM gray-zone problem, explicitly discussed as unresolved in the OCCT community itself. |
| DistMesh | GPL v2+ | **Avoid the code**; the algorithm/paper is free to reimplement. |
| Shewchuk's `predicates.c` | **Public domain** (explicit header dedication by the author) | Safe — most permissive artifact found in this whole audit; usable directly or as a correctness oracle. |
| `robust` (Rust, georust) | MIT OR Apache-2.0 | Safe. |
| `spade` (Rust) | MIT OR Apache-2.0 | Safe — best architectural reference available. |
| `delaunator`/`delaunator-rs` | ISC | Safe (unconstrained Delaunay only, no CDT/refinement). |
| `poly2tri` (BSD fork, e.g. jhasse/poly2tri) | BSD-3-Clause | Safe as a CDT reference. |
| `i_overlay` | MIT OR Apache-2.0 | Safe. |
| `clipper2` (Rust bindings) | Boost-1.0 | Safe. |
| `earcut`/`earcutr`/`earcut-rs` | ISC / MIT OR Apache-2.0 | Safe license-wise, but **not Delaunay** — wrong tool for FEM meshing, don't use for this purpose. |
| Reference BLAS/LAPACK (Netlib) | BSD 3-Clause | Safe, but slow — not the recommended path anyway (see §1). |
| OpenBLAS | BSD 3-Clause | Safe, but WASM build loses SIMD/threading and runs ~10x slower than native — prefer `faer`/`nalgebra` for a WASM target. |
| Intel MKL | Proprietary (Intel Simplified Software License) | N/A — also has no WASM build at all, moot. |
| Eigen (C++, if the C++ path is ever revisited) | MPL-2.0 (permissive-ish weak copyleft; explicitly permits closed-source use) | Safe with care — disable the small subset of optional LGPL-dependent features (`EIGEN_MPL2_ONLY`). |

---

## 7. Open risks / things to watch

- **Ruppert refinement non-termination at small input angles.** Real structural geometry (sharp notches, tight fillets) can trigger this in naive implementations — Phase 3 needs an explicit corner special-case from day one, not as a later patch.
- **Numerical robustness is the single highest-risk area.** Nearly every hard bug in Delaunay/CDT engines traces back to predicate or tolerance handling (near-collinear/cocircular points, near-coincident panel edges from independently authored geometry). Invest disproportionately in Phase 0's test suite and in Phase 6's merge-tolerance handling.
- **LGPL static-linking ambiguity for WASM** is a recurring theme (OCCT, Netgen, MMG) — worth a short explicit legal check-in if the team ever considers *any* LGPL dependency for the shipped binary, even indirectly.
- **WASM threading requires COOP/COEP headers** on the hosting page — a hosting/infra decision to align on before Phase 7 commits to a threaded design, not purely a code choice.
- **Scope creep toward curved/NURBS shells.** v1 deliberately assumes planar panels to keep Phase 6's intersection handling tractable (closed-form plane-plane intersection vs. general surface-surface intersection). If curved shells become a requirement, Phase 6 needs a follow-up research pass on robust NURBS-NURBS intersection — flag this explicitly rather than letting it creep in silently.

---

## 8. Suggested next step

This document is research/planning only — no code has been written. The natural next step is a scoping decision: pick Phase 0 + Phase 1 (robust predicates + unconstrained Delaunay) as the first implementable slice, stand up the crate skeleton (with `wasm-pack` wired from day one so WASM output is validated early, not bolted on at the end), and build its test suite against known-hard degenerate cases before moving to Phase 2.
