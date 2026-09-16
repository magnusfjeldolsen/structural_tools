# `triangle` in Pyodide for `structuralcodes` — feasibility report

Date: 2026-09-16. Everything marked **VERIFIED** was executed on this machine
(Node 24.14.0 + the real `pyodide` npm package + the real `structuralcodes`
0.7.2 wheel from PyPI). Test scripts live in
`…/scratchpad/pyotest/` (`test1.mjs`, `test2.mjs`, `test3.mjs`,
`triangle_shim.py`) and `…/scratchpad/pyotest2/` (same run on Pyodide 314.0.7).

---

## TL;DR

**`triangle` is NOT needed for any of the calculations we want.** It is needed
only so that `import structuralcodes` does not raise `ModuleNotFoundError`, and
for two features we do not need (the `fiber` integrator and
`SurfaceGeometry.random_points_within`). The default integrator is `marin`,
which is analytical/polygon-based and never touches `triangle`.

Two lines of Python make the whole package work:

```python
import micropip
micropip.add_mock_package('triangle', '20250106')
await micropip.install('structuralcodes')
```

**VERIFIED** on Pyodide **0.27.7** and **314.0.7**: `import structuralcodes`
succeeds, and `calculate_bending_strength`, `calculate_moment_curvature`,
`calculate_nm_interaction_domain`, `calculate_mm_interaction_domain` and
`calculate_nmm_interaction_domain` all run to completion with the `marin`
integrator — including on a non-convex T-section and on a hollow box section
with a hole.

And if we *also* want the `fiber` integrator, a ~120-line pure-Python
`triangle.triangulate` shim on `scipy.spatial.Delaunay` + `shapely` reproduces
the `marin` bending strength to **0.006 %–1.0 %** at `mesh_size=0.002`
(**VERIFIED**, numbers below).

---

## 1. Pyodide package inventory (VERIFIED against the authoritative docs)

Pyodide changed its version scheme: releases now track CPython, so "latest
stable" is the **314.0.x** line (CPython 3.14), not 0.2x. Version list from
`npm view pyodide versions`: `… 0.27.8, 0.28.0–0.28.3, 0.29.0–0.29.5,
314.0.0–314.0.7, 315.0.0-alpha.2`.

Authoritative sources:
- <https://pyodide.org/en/stable/usage/packages-in-pyodide.html> (currently 314.0.7)
- <https://pyodide.org/en/0.27.7/usage/packages-in-pyodide.html>

| package | Pyodide 314.0.7 (latest stable) | Pyodide 0.27.7 (what this repo uses today) |
|---|---|---|
| numpy | **2.4.6** | **2.0.2** |
| scipy | **1.18.0** | **1.14.1** |
| shapely | **2.1.2** | **2.0.6** |
| matplotlib | **3.10.8** | **3.8.4** |
| sympy | 1.14.0 | (present) |
| pandas | 3.0.2 | (present) |
| micropip | (bundled) | **0.9.0** |
| **triangle** | **NOT AVAILABLE** | **NOT AVAILABLE** |
| **mapbox_earcut / mapbox-earcut** | **NOT AVAILABLE** | — |
| **triangle-mesh** | **NOT AVAILABLE** | — |
| **meshpy** | **NOT AVAILABLE** | — |

`shapely` 2.x is available in both — `structuralcodes` requires `shapely>=2.0.2`,
satisfied by 2.0.6 (0.27.7) and 2.1.2 (314.0.7). **VERIFIED at runtime**:
`shapely.__version__ == '2.0.6'` under Pyodide 0.27.7.

`structuralcodes` 0.7.2 ships a **pure-Python `py3-none-any` wheel**
(`structuralcodes-0.7.2-py3-none-any.whl`, 208 422 bytes) built with
`flit_core`, so micropip can install it straight from PyPI. Its
`requires_dist` is exactly `numpy>=1.20.0, scipy>=1.6.0, shapely>=2.0.2,
triangle>=20230923` — `triangle` is the only unsatisfiable one.
(Source: <https://pypi.org/pypi/structuralcodes/json>)

### Download budget (VERIFIED, measured on the cached wheels)

| file | size |
|---|---|
| `pyodide.asm.wasm` | 9.64 MB |
| `scipy-1.14.1-…wasm32.whl` | 12.85 MB |
| `openblas-0.3.26.zip` (scipy dep) | 5.83 MB |
| `numpy-2.0.2-…wasm32.whl` | 2.92 MB |
| `python_stdlib.zip` | 2.25 MB |
| `pyodide.asm.js` | 1.20 MB |
| `shapely-2.0.6-…wasm32.whl` | 0.79 MB |
| `micropip` + `packaging` | 0.18 MB |
| `structuralcodes` wheel | 0.20 MB |
| **total cold load** | **≈ 36 MB** |

`scipy` is **not** optional: `structuralcodes/sections/_beam_section.py:11` does
`from scipy.linalg import lu_factor, lu_solve` at module level, so scipy +
openblas (~18.7 MB) are unavoidable. Worth knowing before we promise load times.
Boot + install measured at **~2.0 s** with everything warm in the local cache,
and **5.2 s** for the full test suite end-to-end.

---

## 2. `micropip` behaviour (VERIFIED + docs)

Docs: <https://micropip.pyodide.org/en/stable/project/api.html>

```
async micropip.install(requirements, keep_going=False, deps=True,
                       credentials=None, pre=False, index_urls=None, *,
                       constraints=None, reinstall=False, verbose=None)
```
- `deps=False` — "skips installing dependencies listed in package METADATA files".
- `requirements` may be a package name **or a wheel URL/relative path** ending in
  `.whl` (PEP 427 naming required). Remote URLs need CORS; same-origin paths on
  GitHub Pages work.
- `index_urls` can point at a private JSON index with a `{package_name}` placeholder.

### `micropip.add_mock_package` — exists, and is exactly the tool for this

```
micropip.add_mock_package(name, version, *, modules=None, persistent=False)
```
> "Add a mock version of a package to the package dictionary. This means that if
> it is a dependency, it is skipped on install."

- `name`, `version` — what the resolver will see.
- `modules` — dict mapping module name → module **source text** (or a callable).
  Default: one empty module named after the package.
- `persistent` — `True` writes the modules to the (virtual) filesystem so they
  survive across runs; `False` keeps them inside micropip in memory only.
- Companion: `micropip.remove_mock_package(name)`.

**VERIFIED (`test1.mjs`)** — with `add_mock_package('triangle', '20250106')`
called *before* install, plain `micropip.install('structuralcodes')` (i.e.
`deps=True`) resolved everything by itself:

```
Name            | Version | Source
--------------- | ------- | -------
packaging       | 24.2    | pyodide
micropip        | 0.9.0   | pyodide
structuralcodes | 0.7.2   | pypi
numpy           | 2.0.2   | pyodide
shapely         | 2.0.6   | pyodide
scipy           | 1.14.1  | pyodide
openblas        | 0.3.26  | pyodide
```
```
triangle module: <module 'triangle' (<micropip._mock_package._MockModuleFinder …>)>
structuralcodes 0.7.2
shapely 2.0.6
scipy 1.14.1
```

So we do **not** need the `deps=False` + manual-dependency dance. (It remains a
valid fallback: `pyodide.loadPackage(['numpy','scipy','shapely'])` then
`micropip.install(url_to_structuralcodes_whl, deps=False)`.)

**Gotcha (VERIFIED)**: calling `add_mock_package` from JavaScript as
`micropip.add_mock_package("triangle", "1.0", {modules: …})` crashes the
interpreter — `modules` is keyword-only, so a third positional argument is a
hard failure. Either use `.callKwargs(...)` or, much better, do the whole
registration inside `runPythonAsync` (what the snippets below do).

---

## 3. Compiling the real `triangle` to wasm

### What the build actually needs
`triangle`'s sdist is unusually friendly (VERIFIED by unpacking
`triangle-20200424.tar.gz`): a plain `setuptools` `Extension` over **two C
files** with no external libraries at all —

```python
ext_modules = [Extension('triangle.core',
                         ['c/triangle.c', 'triangle/core.c'],
                         include_dirs=['c'],
                         define_macros=[('VOID','void'),('REAL','double'),
                                        ('NO_TIMER',1),('TRILIBRARY',1),
                                        ('ANSI_DECLARATORS',1)])]
install_requires = ['numpy']
```
`triangle/core.c` is pre-Cythonised and only needs numpy headers. This is about
as easy as a C extension gets — no BLAS, no CMake, no autotools.

The modern supported route is **cibuildwheel with the Pyodide platform**, which
provisions `pyodide-build` + a matching emsdk for you:
`python -m cibuildwheel --platform pyodide`.
This matters because **PEP 783 (Emscripten Packaging) was accepted in April
2026** and PyPI's Warehouse now accepts `pyemscripten_<year>_<patch>_wasm32`
wheels (validator live 2026-04-21). Tags: `pyemscripten_2025_0` for Pyodide
0.29.x / CPython 3.13, `pyemscripten_2026_0` for Pyodide 314.x / CPython 3.14.
- <https://peps.python.org/pep-0783/>
- <https://discuss.python.org/t/pep-783-emscripten-packaging-is-accepted/107393>
- <https://pydantic.dev/articles/emscripten-wheels-pydantic> (worked example)
- <https://github.com/pyodide/auditwheel-emscripten>

### Is it feasible TODAY on this Windows box? **No.** (VERIFIED, honestly)

| check | result |
|---|---|
| `docker --version` | `Docker version 29.7.2, build a7dcaa6` — CLI present… |
| `docker run …` | **FAILS**: "failed to connect to the docker API at `npipe:////./pipe/dockerDesktopLinuxEngine` … daemon not running" |
| `wsl --status` | Ubuntu-24.04, WSL2 default — present |
| WSL `python3 -m venv` | **FAILS** — `ensurepip` missing, needs `sudo apt install python3.12-venv` |
| WSL `python3 -m pip` | **FAILS** — `No module named pip` |
| WSL network | **FAILS** — `curl bootstrap.pypa.io` → "Could not resolve host" (no DNS in the WSL distro) |
| `emcc --version` | **not installed** |
| `pyodide_build` on Windows Python 3.11.9 | **not installed** (and pyodide-build does not support Windows) |

Three independent attempts (WSL venv, WSL `--user` pip, Docker) all failed for
environment reasons, not build reasons. Getting there needs: start Docker
Desktop *or* `sudo apt install python3-pip python3-venv` + fix WSL DNS, then
~1–2 GB of emsdk/xbuildenv downloads. Realistic estimate: **1–3 h of
setup + build**, most of it waiting. The build itself I rate **low risk** given
how plain the extension is.

### Has anyone already published a Pyodide/emscripten `triangle` wheel? **No.**

- PyPI `triangle` (latest **20250106**): no `emscripten`/`wasm32`/`pyodide`
  wheel, and no `py3-none-any` wheel — only cp37–cp311 win/mac/manylinux
  wheels plus the sdist. <https://pypi.org/pypi/triangle/json>
- `triangle` does **not** appear in the Pyodide built-in package list for any
  version checked (0.27.7, 314.0.7).
- No `pyodide-recipes` recipe or open request for `triangle` found.
- `meshpy` (the other Triangle binding) is also absent from Pyodide, also a C++
  extension, and would be *harder* (pybind11).
- License note: the Python `triangle` bindings are **LGPL-3.0**, and Shewchuk's
  Triangle itself is **free for non-commercial use only** — redistributing a
  wasm build from a commercial engineering tool has licensing implications worth
  checking before shipping option 3 or 5.

---

## 4. Pure-Python `triangle.triangulate` shim — BUILT AND VERIFIED

### Exact API surface `structuralcodes` uses

Grep over the whole package: `import triangle` appears **twice**, and the only
attribute ever touched is `triangulate`. Two call sites:

`structuralcodes/sections/section_integrators/_fiber_integrator.py:90`
```python
mesh = triangle.triangulate(tri, f'pq{30:.1f}Aa{max_area}o1')
...
for tr in mesh['triangles']:
    xc = (mesh['vertices'][tr[0]][0] + mesh['vertices'][tr[1]][0] + ...
```

`structuralcodes/geometry/_geometry.py:454` (inside `random_points_within`)
```python
triangles = triangle.triangulate(tri, 'p')
n_tr = len(triangles['triangles'])
Ax = triangles['vertices'][tr[0]][0]      # etc.
```

**Input dict** (built identically by both call sites,
`_fiber_integrator.py:21-62` and `_geometry.py:418-451`):
- `'vertices'` — `(N,2)` float array: exterior ring coords with the closing
  point dropped, then every interior ring's coords appended.
- `'segments'` — `(M,2)` int array: for each ring, `node_i = arange(n)` (offset
  by the running vertex count) paired with `np.roll(node_i, -1)`, i.e. a closed
  cycle per ring.
- `'holes'` — `(K,2)`, only present when the polygon has interiors; each entry is
  the **centroid of the interior ring** (`Polygon(interior).centroid`). Note this
  is a latent bug upstream for non-convex holes, where the centroid can fall
  outside the hole.

**Output dict** — only `'vertices'` `(V,2)` and `'triangles'` `(T,3)` are read,
and the triangle entries index into the returned `'vertices'`. Nothing else is
touched.

**Option strings**
(<https://www.cs.cmu.edu/~quake/triangle.switch.html>):
- `p` — "Triangulates a Planar Straight Line Graph": honour `segments` as
  constrained edges and carve out `holes`.
- `q30.0` — "Quality mesh generation with no angles smaller than 20 degrees. An
  alternate minimum angle may be specified" → here 30°.
- `a<area>` — "Imposes a maximum triangle area constraint."
- `A` — "Assigns a regional attribute to each triangle that identifies what
  segment-bounded region it belongs to." Output-only; `structuralcodes` ignores it.
- `o1` — a **no-op**. Triangle only defines `-o2` (six-node subparametric
  elements); `o` followed by anything but `2` does nothing.
- (relevant but unused here) `S<n>` max Steiner points, `Y` no Steiner points on
  the boundary, `D` conforming Delaunay, `c` enclose convex hull, `z` zero-based
  numbering, `Q` quiet.

So the effective request is: *constrained Delaunay of this PSLG, 30° minimum
angle, max element area `A`.* Only `vertices` and `triangles` come back out.

### The shim (`…/scratchpad/pyotest/triangle_shim.py`, ~120 lines)

Algorithm, exactly as proposed in the brief:
1. Rebuild the shapely polygon from the PSLG by walking the segment adjacency
   into closed loops; the largest-area loop is the shell, the rest are holes.
   (More robust than trusting the `holes` seed points, which are centroids.)
2. Parse `a<max_area>` with `re.search(r'a([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)')`
   — the uppercase `A` switch is deliberately not matched.
3. Steiner points = original vertices + **boundary densification** at spacing
   `h = sqrt(2·max_area)` along every ring (this is what keeps the outline
   conforming) + a **row-staggered interior grid** at spacing `h`, filtered to
   `poly.buffer(-0.1·h)` via `shapely.prepared.prep`.
4. `scipy.spatial.Delaunay` over the deduplicated point set.
5. Discard every simplex whose **centroid** is outside the polygon
   (`prep(poly).contains`).
6. Return `{'vertices': P, 'triangles': kept, …}`.

`scipy` is already a hard dependency of `structuralcodes`, so the shim adds
**zero** extra download.

### Mesh accuracy (VERIFIED, Pyodide 0.27.7 and 314.0.7, identical output)

`sum of kept triangle areas` vs `shapely polygon area`, `Amax/target` =
largest element vs the requested `max_area`:

| section | `max_area` = 1 % of A | | `max_area` = 0.2 % of A | |
|---|---|---|---|---|
| | ntri / area err | Amax/target | ntri / area err | Amax/target |
| rect 250×500 | 110 / **+0.000 %** | 1.00 | 574 / **+0.000 %** | 0.91 |
| T (800 wide flange, 500 web) | 123 / **+0.000 %** | 0.89 | 599 / **−0.000 %** | 0.95 |
| L | 132 / **−0.147 %** | 0.93 | 568 / **+0.000 %** | 0.98 |
| I | 140 / **+0.000 %** | 0.93 | 638 / **+0.000 %** | 0.96 |
| hollow box (with hole) | 146 / **+0.000 %** | 0.98 | 654 / **+0.000 %** | 0.94 |

No element exceeds the requested max area. Area is conserved essentially
exactly, including for the section with a hole.

### Does the mesh give good fiber integration? (VERIFIED)

`calculate_bending_strength()` — `marin` (exact) vs `fiber` (shim mesh):

| section | mesh_size | marin My [kNm] | fiber My [kNm] | diff |
|---|---|---|---|---|
| rect | 0.01 | −194.825 | −194.737 | **−0.045 %** |
| rect | 0.002 | −194.825 | −194.760 | **−0.033 %** |
| T | 0.01 | −140.257 | −137.302 | −2.107 % |
| T | 0.002 | −140.257 | −140.096 | **−0.115 %** |
| I | 0.01 | −162.258 | −162.683 | +0.262 % |
| I | 0.002 | −162.258 | −162.249 | **−0.006 %** |
| hollow box | 0.01 | −143.270 | −132.885 | **−7.249 %** |
| hollow box | 0.002 | −143.270 | −141.785 | −1.037 % |

T-section, `mesh_size=0.005`:
```
fiber moment-curvature n=19  Mmin=-133.42 kNm (0.30 s)
marin moment-curvature n=20  Mmin=-134.96 kNm
fiber nm domain n=35  N=[-4451, 301] kN (0.01 s)
marin nm domain n=35  N=[-4451, 301] kN
```
`random_points_within` (the `'p'`-only path), 2000 points requested:
```
T-section   : points=1998  inside=1998 (100.00 %)
hollow box  : points=1996  inside=1996 (100.00 %)
```

**Assessment.** The shim is good enough for fiber integration *if* the mesh is
fine enough. Non-convex T/I/L shapes are fine — the centroid filter plus
boundary densification handles re-entrant corners correctly (worst case
−2.1 % at a deliberately coarse 1 % mesh, −0.115 % at 0.2 %).

Risks, stated plainly:
- **Coarse meshes on sections with holes are the weak spot** (−7.2 % on the
  hollow box at `mesh_size=0.01`). Cause: the triangles hugging the inner ring
  are the ones most affected by the lack of a true *constrained* Delaunay, and
  the box's flange is where the lever arm lives. Mitigation: clamp `mesh_size`
  to ≤ 0.002 whenever the geometry has interiors.
- **No angle guarantee.** The `q30.0` switch is silently ignored — the shim
  produces no *slivers that matter for area*, but it makes no minimum-angle
  promise. Irrelevant for fiber integration (only centroid + area are used);
  it would be unacceptable if the mesh were ever fed to an FE solver.
- **Not a true constrained Delaunay.** A concave neck thinner than `h` could in
  principle keep a triangle whose centroid is inside but whose edges cross the
  boundary. Densifying the boundary at spacing `h` makes this rare, and the
  measured area errors bound the damage; but a pathological input (a slit, a
  zero-width notch, coincident rings) is not covered.
- **`holes` seed points are centroids upstream**, so the shim deliberately
  ignores them and re-derives holes from ring topology. If a future
  `structuralcodes` version passes disjoint regions with region attributes, the
  shim's "largest ring is the shell" rule breaks.
- Anything relying on Triangle's other outputs (`edges`, `neighbors`,
  `triangle_attributes`, Voronoi) is unimplemented — currently nothing does.

---

## 5. Standalone Triangle-wasm called from Python via JS interop

A prebuilt build exists: **`triangle-wasm`** on npm.
- <https://www.npmjs.com/package/triangle-wasm>
- <https://github.com/brunoimbrizi/triangle-wasm>
- Emscripten build of Shewchuk's Triangle, MIT-licensed wrapper.
- **Only version 1.0.0, published 2020-12-06**, 166 837 bytes unpacked, 5 files
  including `triangle.out.wasm`. Snyk classifies it as inactive/discontinued
  (~119 downloads/week).

API (from the README): `Triangle.init(path)` → Promise; then
`makeIO(data)` / `triangulate(switches, input, output, vorout=null)` /
`freeIO(io, all)`. Switches accept either the original string (`'pq'`) or an
object (`{quality: true, area: true, pslg: true}`). Data is flat typed arrays
(`pointlist = [x,y,x,y,…]`, `trianglelist`, `segmentlist`, …).

```javascript
const Triangle = require('triangle-wasm');
Triangle.init().then(() => {
  const input  = Triangle.makeIO({ pointlist: [-1,-1, 1,-1, 1,1, -1,1] });
  const output = Triangle.makeIO();
  Triangle.triangulate({ quality: true }, input, output);
  Triangle.freeIO(input, true); Triangle.freeIO(output);
});
```

**Feasibility: workable but fiddly.** It is a *separate* wasm instance from
Pyodide's, so you would write a Python `triangle` module that reaches out via
`import js` / `pyodide.ffi`, marshals numpy arrays into the other module's heap
and copies results back. Concerns:
- Manual `makeIO`/`freeIO` memory management across the Python↔JS boundary; a
  leak or a double-free here is a hard crash of the worker, not an exception.
- `init()` is async, but `triangle.triangulate()` is called from *synchronous*
  Python deep inside `structuralcodes`. You must pre-initialise during worker
  boot and keep the handle; if the shim's `triangulate` ever needs to await, you
  are stuck (Pyodide's `run_sync`/`syncify` requires JSPI, which is not
  something to bet a shipping tool on).
- 5-year-old unmaintained package, pinned to a 2020 Emscripten; no security or
  bugfix pipeline.
- Same Triangle non-commercial licensing question as option 3.
- Only upside over option 4: a genuine constrained Delaunay with real angle
  quality. We do not need that.

---

## 6. CRITICAL QUESTION: is `triangle` needed at all? — **No** (VERIFIED)

### Is the import lazy? **No — it is module-level, twice.**

`structuralcodes/geometry/_geometry.py:1-12`
```python
"""Geometry classes for beam sections."""
from __future__ import annotations
import typing as t
import warnings
from math import atan2

import numpy as np
import triangle                      # <-- line 10, top-level
from numpy.typing import ArrayLike
```

`structuralcodes/sections/section_integrators/_fiber_integrator.py:1-9`
```python
"""The fiber section integrator."""
from __future__ import annotations
import typing as t

import numpy as np
import triangle                      # <-- line 8, top-level
```

And both are pulled in by the package root, `structuralcodes/__init__.py:5`:
```python
from . import codes, core, geometry, materials, sections
```
with `sections/__init__.py` re-exporting `FiberIntegrator` unconditionally. So
`import structuralcodes` hard-fails without an importable `triangle`. **That —
and only that — is why we need to do anything at all.**

### Is `marin` the default? **Yes.**

`sections/section_integrators/_factory.py`
```python
integrator_registry = {'marin': MarinIntegrator, 'fiber': FiberIntegrator}
...
self.instances.setdefault(method.lower(),
                          self.registry.get(method.lower(), MarinIntegrator))
```
(note the `MarinIntegrator` fallback for unknown names)

`sections/_beam_section.py:53` and `:106`
```python
integrator: t.Literal['marin', 'fiber'] = 'marin',
```
`:113-114`
```
integrator (str): The SectionIntegrator to be used for computations
    (default = 'marin').
```
**VERIFIED at runtime**: `type(BeamSection(geo).section_calculator.integrator).__name__`
→ `MarinIntegrator`.

`_marin_integrator.py` imports only `numpy`, `shapely`,
`structuralcodes.core._marin_integration` and `structuralcodes.geometry` — **no
`triangle`**. Likewise `_shell_integrator.py` (numpy only), despite the changelog
mentioning "shell fiber integrator triangulation logic".

### Do moment-curvature and the N-M domain force `fiber`? **No.**

Both are integrator-agnostic; they only ever call
`self.integrator.integrate_strain_response_on_geometry(...)`
(`_beam_section.py:1199` inside `calculate_moment_curvature`, `:1418` inside
`calculate_nm_interaction_domain`, `:1697` for `nmm`, `:1812` for `mm`).

**VERIFIED end-to-end with a stub `triangle` that has no `triangulate` at all**
(`test2.mjs`, Pyodide 0.27.7, RC rect 250×500, C45, B500, 4×ø25):
```
integrator: MarinIntegrator
bending strength My = -178.72 kNm  (0.05 s)
moment-curvature: n_points=20                      (0.57 s)
nm domain: n=35  N=[-4535, 939] kN  My=[-385.8, 0.0] kNm   (0.03 s)
mm domain: n=33                                    (1.05 s)
nmm domain ok                                      (0.28 s)
T-section marin My = -136.22 kNm   (non-convex, 8 vertices)
T-section nm domain n=35
Hollow-box marin My = -133.56 kNm  (polygon WITH a hole)
FIBER failed as expected: AttributeError module 'triangle' has no attribute 'triangulate'
```

### What we lose with a bare stub
Exactly three things, all avoidable:
1. `BeamSection(..., integrator='fiber')` — raises `AttributeError`.
2. `SurfaceGeometry.random_points_within()` (`_geometry.py:404`) — the only
   other `triangle` call.
3. Its one consumer, `core/_section_results.py:539`, which samples random points
   to build a strain/stress scatter table for DataFrames/plots. Not needed for
   any strength or curvature result.

Option 4's shim restores all three.

### Separate gotcha worth flagging (VERIFIED, not triangle-related)

`structuralcodes/__init__.py` ends with
```python
warnings.filterwarnings(action='error', category=StructuralCodesWarning)
```
so **non-convergence is raised as an exception**, not warned. This bit our
T-section fiber moment-curvature run:
```
structuralcodes.core.errors.NoConvergenceWarning:
  No convergence during computation of step 19. …
```
In the worker, either catch `StructuralCodesWarning` subclasses explicitly or
downgrade them:
```python
import warnings
from structuralcodes.core.errors import StructuralCodesWarning
warnings.filterwarnings('always', category=StructuralCodesWarning)
```
and surface the message in the UI. Silently ignoring it would hide a genuine
"section could not be equilibrated" result.

---

## VERIFIED vs UNVERIFIED — explicit ledger

**VERIFIED (executed here)**
- Pyodide package inventory for 314.0.7 and 0.27.7, incl. `triangle` absent, `shapely` 2.x present.
- `structuralcodes` 0.7.2 is a pure-Python `py3-none-any` wheel with those four deps.
- `micropip.add_mock_package('triangle', '20250106')` + `micropip.install('structuralcodes')` with default `deps=True` fully resolves and installs; `import structuralcodes` then succeeds.
- `marin` is the default integrator and never imports/uses `triangle`.
- `import triangle` is top-level in `_geometry.py:10` and `_fiber_integrator.py:8`, both reachable from `structuralcodes/__init__.py`.
- bending strength, moment-curvature, N-M, M-M and N-M-M domains all run with a *bare stub* `triangle`, on rect / non-convex T / hollow-box sections.
- The pure-Python shim's mesh quality and marin-vs-fiber agreement numbers above.
- `random_points_within` returns 100 % interior points via the shim, for T and hollow box.
- Identical results on Pyodide 0.27.7 and 314.0.7.
- Local toolchain: Docker daemon down, WSL has no pip and no DNS, no emcc, no pyodide-build.
- `triangle` PyPI has no emscripten/wasm/pure-python wheel; sdist is 2 C files + setuptools.
- `triangle-wasm` npm: single version 1.0.0, 2020-12-06, MIT wrapper, 167 KB.
- Wheel/runtime sizes in the download-budget table.
- Passing `modules=` positionally to `add_mock_package` from JS kills the interpreter.
- `StructuralCodesWarning` is escalated to an exception by the package itself.

**UNVERIFIED (reasoned, not executed)**
- That it behaves identically in a *browser* Web Worker rather than Node. Everything used is standard Pyodide; the only browser-specific risk is CORS on `pypi.org/pypi/…/json` + `files.pythonhosted.org` (both do send CORS headers, which is what micropip is built on). Mitigated by vendoring the wheel — see the recommended snippet.
- The estimated 1–3 h to stand up a working Pyodide cross-build environment, and that `cibuildwheel --platform pyodide` succeeds on `triangle` first try.
- That the shim holds up on geometries far outside the five shapes tested (slits, coincident rings, circular sections approximated with very many vertices, extremely thin webs).
- Whether Shewchuk's Triangle non-commercial clause permits shipping a wasm build in this tool. **Get this checked before pursuing options 3 or 5.**
- `mapbox_earcut` / `triangle-mesh` / `meshpy` were confirmed absent from Pyodide's built-in list, but I did not check whether any of them ships a pure-Python or emscripten wheel on PyPI (they are all C/C++, so it is unlikely).

---

## RANKED RECOMMENDATION

### 1. Mock `triangle`, use the `marin` integrator — **SHIP THIS TODAY**
**Risk: very low. Effort: ~15 minutes.**
Two lines. Fully verified on two Pyodide generations. Zero extra bytes
downloaded. Gives us exactly the calculations asked for (moment-curvature, N-M
and N-M-M interaction domains, bending strength) with the *analytically exact*
integrator, on convex and non-convex sections and sections with holes. Upgrading
`structuralcodes` later is `micropip.install('structuralcodes==X')` — the mock is
independent of the package version. Only cost: `integrator='fiber'` and the
stress-scatter helper raise `AttributeError`.

### 2. Mock `triangle` **with the pure-Python shim as its module body**
**Risk: low–medium. Effort: ~half a day (the shim already exists and is tested).**
Strict superset of option 1 — same two lines plus `modules={'triangle': …}`.
Restores the `fiber` integrator (within 0.006–1.0 % of marin at
`mesh_size≤0.002`) and `random_points_within` (needed if we ever want stress
scatter plots). Medium rather than low because the shim is *our* code with no
angle guarantee and a measured −7.2 % error on hole-bearing sections at coarse
mesh; it needs a `mesh_size ≤ 0.002` clamp and a test comparing fiber against
marin on every section type the tool exposes. **My pick if we need the fiber
integrator at all — and it is the right thing to land right after option 1,
since option 1 is literally a subset of it.**

### 3. Cross-compile the real `triangle` to a `pyemscripten_*_wasm32` wheel
**Risk: medium. Effort: 1–3 h setup + build, then CI maintenance.**
The technically "correct" answer and now a first-class, PEP-783-blessed path,
and `triangle`'s extension is trivially simple. But: **not possible on this
machine today** (Docker daemon down, WSL has neither pip nor DNS, no emcc); the
wheel is pinned to one Pyodide ABI so every Pyodide bump needs a rebuild; we
would have to host it ourselves on GitHub Pages next to the module; and the
Triangle licence question is unresolved. Worth doing later *if* option 2's mesh
quality ever proves insufficient. Would be strictly better than option 2 if it
existed — it does not.

### 4. Standalone `triangle-wasm` (npm) via JS interop
**Risk: high. Effort: 1–2 days.**
Sync-from-async boundary problem, manual cross-heap memory management where
mistakes crash the worker outright, a 5-year-old unmaintained dependency, same
licence question — all to obtain mesh quality we have already shown we do not
need. Not recommended.

### 5. Wait for / request an upstream Pyodide `triangle` recipe
**Risk: n/a. Effort: ~0 to file, unbounded to land.**
No recipe or request exists in `pyodide-recipes`. Worth opening an issue as a
background action, but not a plan.

---

## Code for the recommended option

### Option 1 — minimum viable (drop into the worker)

```javascript
// worker.js — Pyodide + structuralcodes, no triangle needed
let pyodide = null;

async function boot() {
  const { loadPyodide } = await import(
    'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs'
  );
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
  });

  // numpy/scipy/shapely come from the Pyodide distribution (~19 MB incl. openblas)
  await pyodide.loadPackage(['micropip', 'numpy', 'scipy', 'shapely']);

  // Register a mock `triangle` so micropip's resolver is satisfied and
  // `import triangle` inside structuralcodes succeeds. structuralcodes only
  // uses triangle in the `fiber` integrator and random_points_within, neither
  // of which we call.
  await pyodide.runPythonAsync(`
import micropip
micropip.add_mock_package('triangle', '20250106')
await micropip.install('structuralcodes==0.7.2')

import warnings
from structuralcodes.core.errors import StructuralCodesWarning
# structuralcodes escalates its own warnings to exceptions; downgrade so a
# non-convergence is reportable instead of fatal.
warnings.filterwarnings('always', category=StructuralCodesWarning)
`);
}
```

> **Production hardening (recommended):** vendor
> `structuralcodes-0.7.2-py3-none-any.whl` next to the module on GitHub Pages
> and install it same-origin, so the tool does not depend on PyPI being
> reachable at runtime:
> ```python
> await micropip.install('./structuralcodes-0.7.2-py3-none-any.whl', deps=False)
> ```
> (`deps=False` is safe because `numpy`/`scipy`/`shapely` were already
> `loadPackage`d and `triangle` is mocked.)

And the calculation itself, all on the default `marin` integrator:

```python
from shapely import Polygon
from structuralcodes import set_design_code
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement
from structuralcodes.materials.concrete import create_concrete
from structuralcodes.materials.reinforcement import create_reinforcement
from structuralcodes.sections import BeamSection

set_design_code('ec2_2004')
concrete = create_concrete(fck=45)
rebar = create_reinforcement(fyk=500, Es=200_000, ftk=550, epsuk=0.07)

b, h, c, dia = 250.0, 500.0, 50.0, 25.0
poly = Polygon([(-b/2, -h/2), (b/2, -h/2), (b/2, h/2), (-b/2, h/2)])
geo = SurfaceGeometry(poly=poly, material=concrete)
for sx in (-1, 1):
    for sy in (-1, 1):
        geo = add_reinforcement(
            geo,
            (sx*(b/2 - c - dia/2), sy*(h/2 - c - dia/2)),
            dia, rebar,
        )

sec = BeamSection(geo)                 # integrator='marin' by default
calc = sec.section_calculator

bend = calc.calculate_bending_strength()          # .m_y in N·mm
mc   = calc.calculate_moment_curvature()          # .chi_y, .m_y arrays
nm   = calc.calculate_nm_interaction_domain()     # .n, .m_y arrays
mm   = calc.calculate_mm_interaction_domain()
nmm  = calc.calculate_nmm_interaction_domain(num_theta=33)
```

### Option 2 — same, plus the shim so `fiber` works

```javascript
// SHIM_SRC = the full text of triangle_shim.py, inlined at build time or
// fetched with `await (await fetch(new URL('./triangle_shim.py',
// import.meta.url))).text()`  — relative-URL resolution, per DEPLOYMENT.md.
pyodide.globals.set('SHIM_SRC', SHIM_SRC);
await pyodide.runPythonAsync(`
import micropip
micropip.add_mock_package('triangle', '20250106',
                          modules={'triangle': SHIM_SRC})
await micropip.install('structuralcodes==0.7.2')
`);
```
```python
# fiber integration now works; clamp mesh_size for sections with holes
mesh_size = 0.002 if len(poly.interiors) else 0.005
fsec = BeamSection(geo, integrator='fiber', mesh_size=mesh_size)
```

The shim itself is at
`…/scratchpad/pyotest/triangle_shim.py` — copy it into the module folder
as-is. Its public surface is a single `triangulate(tri, opts='')`; it needs only
`numpy`, `scipy.spatial.Delaunay` and `shapely`, all of which are already
loaded.
