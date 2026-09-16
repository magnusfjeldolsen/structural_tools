# `structuralcodes` (fib Structural Codes) — code-level API reference for a Pyodide calculation engine

Research date: 2026-09-16
Installed & executed locally in a venv at
`C:\Users\MAGNUS~1\AppData\Local\Temp\claude\C--Python-structural-tools\220186ec-606b-432f-8f44-6d2ffebc6211\scratchpad\venv`
Python 3.11.9, Windows 11 x64.

Everything marked **[VERIFIED]** was actually executed and the pasted output is real.
Everything marked **[UNVERIFIED]** was read from source/docs but not run.

Site-packages root used for all file paths below:
`<venv>\Lib\site-packages\structuralcodes\`

---

## 0. TL;DR for the Pyodide implementer

1. **`structuralcodes` 0.7.2 is a pure-Python wheel** (`structuralcodes-0.7.2-py3-none-any.whl`) → installable in Pyodide via `micropip`.
2. Dependencies: `numpy`, `scipy`, `shapely`, **`triangle`**. `numpy`/`scipy`/`shapely` all exist in Pyodide. **`triangle` does NOT exist in Pyodide** (C extension wrapping Shewchuk's Triangle). **[VERIFIED via Pyodide docs]**
3. `import triangle` is **top-level** in `geometry/_geometry.py:10` → a bare `import structuralcodes` fails without it.
4. **You do NOT need real `triangle`.** Inject a stub module before importing, and use the **default `'marin'` integrator**. The entire ULS workflow (bending strength, moment–curvature, N-M / M-M / N-M-M domains, strain profile solver, gross & cracked-ish properties) runs to full numerical accuracy with a stubbed `triangle`. **[VERIFIED — see §3]**
5. `matplotlib` is **not** imported anywhere in the package and is **not** a dependency. Zero plotting load cost. **[VERIFIED]**
6. `GenericSection` is **deprecated** — renamed **`BeamSection`** in v0.7.0. `GenericSection(...)` still works but emits `DeprecationWarning`. Use `BeamSection`.
7. `ConcreteEC2_2004` takes **`fck` as a float**, NOT a string like `'C30/37'`. `ConcreteEC2_2004('C30/37')` raises `TypeError`. **[VERIFIED]**
8. Sign convention: **axial `n` positive = TENSION, negative = COMPRESSION**. `theta=0` puts the compression block at the top, so a normally-reinforced beam returns a **negative `m_y`**.
9. `NoConvergenceWarning` is **promoted to an exception** at import time (`warnings.filterwarnings(action='error', ...)` in `structuralcodes/__init__.py`). Your engine must either catch it or re-filter it, or a slightly-unconvergent section will hard-fail. **[VERIFIED]**

---

## 1. Install facts **[VERIFIED]**

```
$ python --version   -> Python 3.11.9
$ pip --version      -> pip 24.0 (upgraded to 26.2.1 in the venv)

$ pip download structuralcodes --no-deps
Downloading structuralcodes-0.7.2-py3-none-any.whl.metadata (2.8 kB)
Downloading structuralcodes-0.7.2-py3-none-any.whl (208 kB)
Saved .\wheels\structuralcodes-0.7.2-py3-none-any.whl
```

**Wheel filename: `structuralcodes-0.7.2-py3-none-any.whl` → `py3-none-any` → pure Python, no compiled extensions, 208 kB.**

```
$ pip install structuralcodes
Successfully installed numpy-2.4.6 scipy-1.17.1 shapely-2.1.2 structuralcodes-0.7.2 triangle-20250106
```

`structuralcodes.__version__` -> `'0.7.2'`

### `structuralcodes-0.7.2.dist-info/METADATA` — full requirement block **[VERIFIED]**

```
Metadata-Version: 2.4
Name: structuralcodes
Version: 0.7.2
Summary: A Python package that contains models from structural design codes.
Author-email: fib - International Federation for Structural Concrete <info@fib-international.org>
Requires-Python: >=3.10
Description-Content-Type: text/markdown
Classifier: Programming Language :: Python :: 3
Classifier: Programming Language :: Python :: 3.10
Classifier: Programming Language :: Python :: 3.11
Classifier: Programming Language :: Python :: 3.12
Classifier: Programming Language :: Python :: 3.13
Classifier: Operating System :: OS Independent
License-File: LICENSE
Requires-Dist: numpy>=1.20.0
Requires-Dist: scipy>=1.6.0
Requires-Dist: shapely>=2.0.2
Requires-Dist: triangle>=20230923
Project-URL: source, https://github.com/fib-international/structuralcodes
```

**There are NO extras** (no `Provides-Extra` lines). `triangle` is a hard, non-optional requirement in the metadata even though only one integrator needs it.

Resolved versions in the local venv: `numpy 2.4.6`, `scipy 1.17.1`, `shapely 2.1.2`, `triangle 20250106`.

### Pyodide availability **[VERIFIED against https://pyodide.org/en/stable/usage/packages-in-pyodide.html]**

| package | in Pyodide? | version listed |
|---|---|---|
| `numpy` | yes | 2.4.6 |
| `scipy` | yes | 1.18.0 |
| `shapely` | yes | 2.1.2 |
| `matplotlib` | yes (but not needed) | 3.10.8 |
| **`triangle`** | **NO — absent from the built-in package list** | — |

`micropip.install('structuralcodes')` will therefore try to resolve `triangle` and fail. Two options:

* **Recommended:** pre-register a stub so the dependency resolves, or install with `deps=False` and install `numpy/scipy/shapely` yourself, then inject the stub (see §3).
* Alternatively `micropip.install('structuralcodes', deps=False)` + `pyodide.loadPackage(['numpy','scipy','shapely'])`.

---

## 2. Exact `triangle` / `shapely` / `numpy` / `scipy` / `matplotlib` usage map **[VERIFIED by grep over installed site-packages]**

### 2.1 `triangle` — only **2** import sites, **2** call sites

| file | line | code | import kind |
|---|---|---|---|
| `geometry/_geometry.py` | **10** | `import triangle` | **TOP-LEVEL** (module import, runs on `import structuralcodes`) |
| `geometry/_geometry.py` | **454** | `triangles = triangle.triangulate(tri, 'p')` | inside nested scope of `SurfaceGeometry.random_points_within()` |
| `sections/section_integrators/_fiber_integrator.py` | **8** | `import triangle` | **TOP-LEVEL** |
| `sections/section_integrators/_fiber_integrator.py` | **90** | `mesh = triangle.triangulate(tri, f'pq{30:.1f}Aa{max_area}o1')` | inside `FiberIntegrator.triangulate(self, geo, mesh_size)` |

**Exact option strings passed to `triangle.triangulate`:**
* `'p'` — planar straight line graph only (in `random_points_within`)
* `f'pq{30:.1f}Aa{max_area}o1'` → e.g. `'pq30.0Aa1800.0o1'` where `max_area = g.area * mesh_size` (in `FiberIntegrator.triangulate`)
  * `p` = PSLG, `q30.0` = quality mesh, min angle 30°, `A` = regional attributes, `a<max_area>` = max triangle area, `o1` = first-order (linear) elements.

**Input dict keys built for `triangulate`:** `tri['vertices']` (N×2), `tri['segments']` (M×2 int), and `tri['holes']` (K×2, only when the polygon has interior rings).
**Output dict keys consumed:** `mesh['triangles']` (T×3 vertex indices), `mesh['vertices']` (V×2 coords).

**Code paths that reach `triangle.triangulate`:**
1. `BeamSection(..., integrator='fiber')` → any calculation → `FiberIntegrator.prepare_input` → `.triangulate()`.
2. `SurfaceGeometry.random_points_within(num_points, seed)`.
3. Anything that builds a `SectionDetailedResultState`, i.e. `result.create_detailed_result(...)` / `result.detailed_result` / `get_point_strain` / `get_point_stress` on any result object (it samples random points inside each surface geometry).
4. `structuralcodes.sections.calculate_elastic_cracked_properties(...)` when the section's integrator is a `FiberIntegrator` (it reads `mesh_size` off it); with a marin section it uses the marin path. **[UNVERIFIED — not executed]**

**Nothing else.** The `'marin'` integrator never calls it.

### 2.2 `matplotlib` **[VERIFIED]**

```
$ grep -rn "matplotlib" site-packages/structuralcodes --include=*.py
(no output)
```

**`matplotlib` is never imported, anywhere, at any level.** Not a dependency. No load-time cost. Plotting is entirely the caller's job. (`SurfaceGeometry._repr_svg_` / `CompoundGeometry._repr_svg_` delegate to shapely's SVG repr — cheap, no matplotlib.)

### 2.3 `scipy` — 4 files, all top-level imports, only 2 on our path

| file | line | code | on the ULS path? |
|---|---|---|---|
| `sections/_beam_section.py` | 11 | `from scipy.linalg import lu_factor, lu_solve` | **YES — top-level, always imported** (only *used* by `calculate_strain_profile(..., initial=True)`) |
| `sections/_shell_section.py` | 9 | `from scipy.linalg import lu_factor, lu_solve` | top-level, imported via `sections/__init__` |
| `codes/ec2_2004/_section_7_3_crack_control.py` | 9 | `import scipy.interpolate` | top-level, imported via `codes/__init__` (used at lines 144, 499, 507) |
| `codes/ec2_2023/_section5_materials.py` | 7 | `import scipy.interpolate` | top-level, imported via `codes/__init__` (used at 181, 322, 501) |

⇒ `scipy.linalg` + `scipy.interpolate` are **unconditionally imported** by `import structuralcodes`. You cannot avoid loading scipy.

### 2.4 `shapely` — top-level everywhere, unavoidable and central

All imports are module-top-level. Key ones on the ULS path:

| file | line | import |
|---|---|---|
| `geometry/_geometry.py` | 12–21 | `from shapely import affinity`; `from shapely.geometry import LinearRing, LineString, MultiLineString, MultiPolygon, Point, Polygon`; `from shapely.ops import split` |
| `geometry/_rectangular.py` | 12 | `from shapely import Polygon` |
| `geometry/_circular.py` | 12 | `from shapely import Point` |
| `geometry/_reinforcement.py` | 7 | `from shapely import Point` |
| `core/_section_results.py` | 11 | `from shapely import Point` |
| `sections/_beam_section.py` | 12–13 | `from shapely import MultiPolygon`; `from shapely.ops import unary_union` |
| `sections/section_integrators/_marin_integrator.py` | 10–11 | `from shapely import MultiLineString, MultiPolygon, Polygon`; `from shapely.geometry.polygon import orient` |
| `sections/section_integrators/_fiber_integrator.py` | 10 | `from shapely import Polygon` |
| `geometry/profiles/*.py` (16 files) | ~3–16 | `from shapely import (...)`, `shapely.affinity`, `shapely.ops` |

`MarinIntegrator` calls shapely per integration (rotate / orient / `split` for the compression-zone clipping) — this is the **dominant per-call cost** and is where the marin integrator is slower than fiber (see §7).

### 2.5 `numpy`

Top-level in essentially every module. Unavoidable and desired.

---

## 3. THE PYODIDE RECIPE (marin path, no real `triangle`) **[VERIFIED]**

Inject the stub **before** the first `import structuralcodes`:

```python
import sys, types

_stub = types.ModuleType('triangle')
def _triangulate_unavailable(*args, **kwargs):
    raise RuntimeError(
        "triangle.triangulate is unavailable in this environment. "
        "Use integrator='marin' and avoid random_points_within() / "
        "create_detailed_result()."
    )
_stub.triangulate = _triangulate_unavailable
sys.modules['triangle'] = _stub

import structuralcodes   # now succeeds
```

Verified output of `run5_stub.py`:

```
import structuralcodes with STUB triangle: OK, version 0.7.2
gross area 180000.0
MARIN M_Rd = -215006759.18601915
MARIN moment curvature: last m_y = -215006756.04576343 len 20
MARIN nm domain shape (35, 3)
MARIN mm domain shape (9, 3)
MARIN strain profile [0.0003808520076915282, -2.7651744076289235e-06, 2.500066194307998e-22]
>>> MARIN PATH FULLY WORKS WITHOUT A REAL `triangle` <<<

FIBER path: RuntimeError triangle.triangulate called - not available in this environment
random_points_within: RuntimeError triangle.triangulate called - not available in this environment
create_detailed_result: RuntimeError triangle.triangulate called - not available in this environment
```

The marin numbers are **bit-identical** to the run with the real `triangle` installed (`-215006759.18601915` vs `-215006759.2`). So stubbing costs nothing on the marin path.

**Things that break with the stub (all avoidable):**
* `integrator='fiber'`
* `SurfaceGeometry.random_points_within()`
* `<result>.create_detailed_result()`, `<result>.detailed_result`, `<result>.get_point_strain(...)`, `<result>.get_point_stress(...)` — i.e. the whole "per-fibre strain/stress table" feature. If you need stress diagrams in the browser, compute them yourself from the returned strain plane (`eps(y,z) = eps_a + chi_y*z - ...`, see §5.6) plus `material.constitutive_law.get_stress(eps)`.

### Warning filters you must neutralise

`structuralcodes/__init__.py` ends with:

```python
warnings.filterwarnings(action='error', category=StructuralCodesWarning)
warnings.filterwarnings(action='always', category=InformationWarning)
```

`structuralcodes/core/errors.py`:
```python
class StructuralCodesWarning(Warning): ...
class NoConvergenceWarning(StructuralCodesWarning): ...
class InformationWarning(StructuralCodesWarning): ...
```

**[VERIFIED]** With defaults, a non-converged calculation raises:
```
sc.calculate_moment_curvature(theta=0, n=0, max_iter=1, tol=1e-12)
  RAISED: NoConvergenceWarning  | BeamSectionCalculator::calculate_moment_curvature
          | No convergence during computation of ultimate curvature. ...
```
So in your engine either wrap calls in
```python
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always', NoConvergenceWarning)
    res = sc.calculate_moment_curvature(...)
```
and report `w` as a soft warning to the UI, or `warnings.filterwarnings('always', category=NoConvergenceWarning)` after import.

---

## 4. Materials API

### 4.1 `ConcreteEC2_2004` — `materials/concrete/_concreteEC2_2004.py:31`

Full signature **[VERIFIED from source]**:

```python
ConcreteEC2_2004(
    fck: float,                          # POSITIONAL, MPa, a NUMBER (not 'C30/37')
    name: Optional[str] = None,          # default f'C{round(fck):d}'  -> 'C30'
    density: float = 2400,               # kg/m3
    gamma_c: Optional[float] = None,     # -> property returns  self._gamma_c or 1.5
    alpha_cc: Optional[float] = None,    # -> property returns  self._alpha_cc or 1.0
    alpha_ct: Optional[float] = None,    # -> property returns  self._alpha_ct or 1.0
    constitutive_law: Union[
        Literal['elastic','parabolarectangle','bilinearcompression',
                'sargin','popovics'],
        ConstitutiveLaw] = 'parabolarectangle',
    initial_strain: Optional[float] = None,
    initial_stress: Optional[float] = None,
    strain_compatibility: Optional[bool] = None,
    # code-derived properties, all optional overrides:
    fcm=None, fctm=None, fctk_5=None, fctk_95=None, Ecm=None,
    eps_c1=None, eps_cu1=None, k_sargin=None,
    eps_c2=None, eps_cu2=None, n_parabolic_rectangular=None,
    eps_c3=None, eps_cu3=None,
    **kwargs,                            # silently discarded (`del kwargs`)
)
```

Import from: `from structuralcodes.materials.concrete import ConcreteEC2_2004`
(also exported: `Concrete`, `ConcreteEC2_2023`, `ConcreteMC2010`, `create_concrete`)

**GOTCHA [VERIFIED]:** passing a string fails —
```
ConcreteEC2_2004('C30/37')  ->  TypeError: type str doesn't define __round__ method
```

**GOTCHA:** `gamma_c` / `alpha_cc` / `alpha_ct` are **read-only properties** implemented as `return self._x or <default>`. Consequences:
* You must pass them in the constructor; there are no setters.
* **`alpha_cc=0.0` is impossible** (falsy → falls back to 1.0). Same for `gamma_c=0`.
* **`alpha_cc` DEFAULTS TO 1.0**, not 0.85. If your national annex wants 0.85 you must pass it explicitly. `set_national_annex()` exists but the property bodies contain `# Here we should implement the interaction with the globally set national annex. For now, we simply return the default value.` → **national annexes are NOT wired up in 0.7.2.**

#### Verified property values for `ConcreteEC2_2004(fck=30, gamma_c=1.5, alpha_cc=1.0)` **[VERIFIED]**

```
name           C30
fck            30
gamma_c        1.5
alpha_cc       1.0
fcd()          20.0                        <- a METHOD, not a property
fcm            38
fctm           2.896468153816889
Ecm            32836.56803133079
eps_c2,eps_cu2 0.002 0.0035
eps_c3,eps_cu3 0.00175 0.0035
eps_c1,eps_cu1 0.0021618768697354803 0.0035
n_par_rect     2.0
density        2400
```
Also available (methods, not properties): `fcd()`, `fctd()`. Properties: `fck`, `fcm`, `fctm`, `fctk_5`, `fctk_95`, `Ecm`, `gamma_c`, `alpha_cc`, `alpha_ct`, `eps_c1`, `eps_cu1`, `k_sargin`, `eps_c2`, `eps_cu2`, `n_parabolic_rectangular`, `eps_c3`, `eps_cu3`, `density`, `name`, `constitutive_law`.

#### Constitutive laws registry — `materials/constitutive_laws/__init__.py` **[VERIFIED]**

```python
get_constitutive_laws_list()
# ['elastic', 'elastic2d', 'elasticplastic', 'elasticperfectlyplastic',
#  'bilinearcompression', 'parabolarectangle', 'popovics', 'sargin',
#  'initialstrain']
```

Mapping (`CONSTITUTIVE_LAWS` dict):
| key | class |
|---|---|
| `'elastic'` | `Elastic` |
| `'elastic2d'` | `Elastic2D` |
| `'elasticplastic'` | `ElasticPlastic` |
| `'elasticperfectlyplastic'` | `ElasticPlastic` (with `Eh=0`) |
| `'bilinearcompression'` | `BilinearCompression` |
| `'parabolarectangle'` | `ParabolaRectangle` |
| `'popovics'` | `Popovics` |
| `'sargin'` | `Sargin` |
| `'initialstrain'` | `InitialStrain` |

Also exported but not in the factory: `UserDefined`, `Parallel`, `ConcreteSmearedCracking`, `NoTension`, `ConstantPoissonReduction`, `GeneralVecchioCollins`, plus helpers `calculate_principal_strains`, `establish_strain_transformation_matrix`, and `create_constitutive_law(name, material)`.

The factory works via dunder methods on the material (`__parabolarectangle__()`, `__sargin__()`, …) that return the kwargs. A law not implemented for a material raises
`ValueError: Constitutive law <name> not available for material <Class>`.

#### Actual law objects produced for `fck=30, gamma_c=1.5, alpha_cc=1.0` **[VERIFIED]**

```
parabolarectangle   -> ParabolaRectangle    {_fc: -20.0,  _eps_0: -0.002,     _eps_u: -0.0035, _n: 2.0}          ult=(-0.0035, 100)
bilinearcompression -> BilinearCompression  {_fc: -20.0,  _eps_c: -0.00175,   _eps_cu: -0.0035, _E: 11428.571429} ult=(-0.0035, 100)
sargin              -> Sargin               {_fc: -38,    _eps_c1: -0.002162, _eps_cu1: -0.0035, _k: 1.961528}    ult=(-0.0035, 100)
popovics            -> Popovics             {_fc: -20.0,  _eps_c: -0.002162,  _eps_cu: -0.0035, _n: 1.392244}     ult=(-0.0035, 100)
elastic             -> Elastic              {_E: 32836.568031, _eps_u: None}                                      ult=(-100, 100)
```

Notes:
* **Compression is negative** inside the laws (`_fc = -20.0`).
* `sargin` is built on **`fcm` (=-38, MEAN strength)**, not `fcd`. If you want a design Sargin law you must build the law object yourself.
* `get_ultimate_strain()` returns a **tuple `(eps_min, eps_max)`** — e.g. `(-0.0035, 100)`: `100` = "no tensile limit" sentinel, and the concrete simply has zero tensile stress.
* `constitutive_law.get_stress(-0.002)` → `-20.0`; `get_stress(+0.001)` → `0` (no tension). **[VERIFIED]**
* `constitutive_law.name` → e.g. `'ParabolaRectangleLaw_0'`; `constitutive_law.__materials__` → `('concrete',)`.

**Overriding the law with your own object:**
```python
from structuralcodes.materials.constitutive_laws import ParabolaRectangle
law = ParabolaRectangle(fc=-20.0, eps_0=-0.002, eps_u=-0.0035, n=2.0)
C30 = ConcreteEC2_2004(fck=30, constitutive_law=law)
```
The constructor checks `'concrete' in law.__materials__` else `ValueError('The provided constitutive law is not valid for concrete.')`. **[UNVERIFIED for the exact `ParabolaRectangle` kwarg names — inferred from the private attrs `_fc/_eps_0/_eps_u/_n`; the factory-produced kwargs come from `Concrete.__parabolarectangle__()`.]**

**IMPORTANT:** the gross section properties (`ea`, `e_iyy`, …) are computed from the **constitutive law tangent at zero strain**, not from `Ecm`. Verified: with the parabola-rectangle law the tangent at 0 is `2*fc/eps_0 = 20000 MPa`, and `ea = 20000*180000 + 200000*942.478 = 3.7885e9` — exactly the reported value. So switching the law changes the "elastic" section properties.

### 4.2 `ReinforcementEC2_2004` — `materials/reinforcement/_reinforcementEC2_2004.py:15`

```python
ReinforcementEC2_2004(
    fyk: float,                      # MPa, REQUIRED
    Es: float,                       # MPa, REQUIRED
    ftk: float,                      # MPa, REQUIRED  (no default!)
    epsuk: float,                    # -,   REQUIRED  (no default!)
    gamma_s: Optional[float] = None, # -> property: self._gamma_s or 1.15
    gamma_eps: Optional[float] = None,# -> property: self._gamma_eps or 0.9
    name: Optional[str] = None,      # default f'Reinforcement{round(fyk):d}'
    density: float = 7850.0,         # kg/m3
    constitutive_law: Union[
        Literal['elastic','elasticperfectlyplastic','elasticplastic'],
        ConstitutiveLaw] = 'elasticplastic',      # <- DEFAULT HAS HARDENING
    initial_strain: Optional[float] = None,
    initial_stress: Optional[float] = None,
    strain_compatibility: Optional[bool] = None,
)
```
Import: `from structuralcodes.materials.reinforcement import ReinforcementEC2_2004`
(also: `Reinforcement`, `ReinforcementEC2_2023`, `ReinforcementMC2010`, `create_reinforcement`)

**There is no `density=` keyword problem, but note `ftk` and `epsuk` are positional-required — you cannot omit them.**

**GOTCHA: the default constitutive law is `'elasticplastic'` — WITH strain hardening.** For a classic "horizontal top branch" EC2 design law you must pass `constitutive_law='elasticperfectlyplastic'`.

Derived quantities (`fyd()`, `ftd()`, `epsud()` are **methods**; `gamma_s`, `gamma_eps`, `epsyd`, `epsyk`, `fyk`, `ftk`, `epsuk`, `Es`, `density`, `constitutive_law` are **properties**):

```
fyd()  = ec2_2004.fyd(fyk, gamma_s)          = fyk / gamma_s
ftd()  = ec2_2004.fyd(ftk, gamma_s)          = ftk / gamma_s
epsud()= ec2_2004.epsud(epsuk, gamma_eps)    = epsuk * gamma_eps
epsyd  = fyd() / Es      (property)
epsyk  = fyk  / Es       (property)
```

**[VERIFIED]** for `ReinforcementEC2_2004(fyk=500, Es=200000, ftk=540, epsuk=0.075, gamma_s=1.15)`:
```
name   Reinforcement500
fyk    500            fyd 434.7826086956522
ftk    540            ftd 469.5652173913044
epsuk  0.075          epsud 0.0675          gamma_eps 0.9
epsyd  0.002173913043478261                 epsyk 0.0025
gamma_s 1.15  Es 200000  density 7850.0
law   ElasticPlastic {_E: 200000, _fy: 434.7826086956522,
                      _Eh: 532.4459234608987, _eps_su: 0.0675,
                      _eps_sy: 0.002173913043478261}
get_ultimate_strain() -> (-0.0675, 0.0675)
```
Law variants **[VERIFIED]**:
```
'elasticperfectlyplastic' -> ElasticPlastic  {_E:200000, _fy:434.78, _Eh:0.0,      _eps_su:0.0675}
'elasticplastic'          -> ElasticPlastic  {_E:200000, _fy:434.78, _Eh:532.4459, _eps_su:0.0675}
'elastic'                 -> Elastic         {_E:200000, _eps_u:None}   ult=(-100,100)
```
Hardening modulus is computed as `Eh = (ftd() - fyd()) / (epsud() - epsyd)`.

Ductility-class helper **[VERIFIED]**:
```python
from structuralcodes.codes import ec2_2004
ec2_2004.reinforcement_duct_props(fyk=500, ductility_class='A')  # {'epsuk': 0.025, 'ftk': 525.0}
ec2_2004.reinforcement_duct_props(fyk=500, ductility_class='B')  # {'epsuk': 0.05,  'ftk': 540.0}
ec2_2004.reinforcement_duct_props(fyk=500, ductility_class='C')  # {'epsuk': 0.075, 'ftk': 575.0}
```
Handy: `B500 = ReinforcementEC2_2004(fyk=500, Es=200000, **ec2_2004.reinforcement_duct_props(500,'B'))`.

### 4.3 Design-code globals

`structuralcodes/codes/__init__.py`:
```python
get_design_codes()            # ['mc2010', 'mc2020', 'ec2_2004', 'ec2_2023']   [VERIFIED]
set_design_code('ec2_2004')   # sets module-global _CODE
set_national_annex('no')      # sets module-global _NATIONAL_ANNEX -> currently UNUSED by materials
```
`ec2_2004.__title__ = 'EUROCODE 2 1992-1-1:2004'`, `__year__ = 2004`, `__materials__ = ('concrete','reinforcement')` **[VERIFIED]**.

`create_concrete(...)` / `create_reinforcement(...)` need the global code set (or `design_code='ec2_2004'`) or raise `ValueError('The design code is not set, ...')`. **Simpler to instantiate `ConcreteEC2_2004` / `ReinforcementEC2_2004` directly** and skip the globals entirely — important for a browser engine where global mutable state across calls is a liability.

`ec2_2004` exposes 84 public code-formula functions **[VERIFIED list]**:
```
As_min, As_min_2, As_min_p, Asw_max, Asw_s_required, Ecm, Ecm_time,
VEdmax_unreinf, VRdc, VRdc_prin_stress, VRdmax, VRds, alpha_1, alpha_2,
alpha_3, alpha_cement, alpha_ds1, alpha_ds2, alpha_e, beta_E, beta_H,
beta_RH, beta_as, beta_c, beta_cc, beta_ct, beta_ds, beta_fcm, beta_t0,
eps_c1, eps_c2, eps_c3, eps_ca, eps_ca_inf, eps_cd, eps_cd_0, eps_cs,
eps_cu1, eps_cu2, eps_cu3, eps_sm_eps_cm, eps_sm_eps_cm_restraint_end,
epsud, fcd, fcm, fcm_time, fctd, fctk_5, fctk_95, fctm, fctm_time, fyd,
h_0, hc_eff, k, k1, k2, k3, k4, k_h, k_sargin, kc_flanges_area,
kc_rect_area, kc_tension, kt, n_parabolic_rectangular, phi, phi_0,
phi_RH, phi_eq, reinforcement_duct_props, rho_p_eff, s_time_development,
sr_max_close, sr_max_far, sr_max_theta, shear, t, t0_adj, t_T, w_max,
w_spacing, wk, xi1
```
`ec2_2004.fcd(30, alpha_cc=1.0, gamma_c=1.5) -> 20.0`, `ec2_2004.fyd(500, 1.15) -> 434.7826086956522`. **[VERIFIED]**

---

## 5. Geometry API — `structuralcodes.geometry`

`geometry/__init__.py` exports **[VERIFIED]**:
```
Geometry, PointGeometry, SurfaceGeometry, CompoundGeometry,
CircularGeometry, RectangularGeometry,
ShellGeometry, ShellReinforcement,
add_reinforcement, add_reinforcement_line, add_reinforcement_circle,
create_line_point_angle, profiles
```

### Axis convention

From `BeamSection`'s own docstring: *"The section is a 2D geometry where **Y axis is horizontal** while **Z axis is vertical**. The moments and curvatures around Y and Z axes are assumed positive according to RHR."*
Shapely coordinates are therefore `(y, z)`: **x-coordinate of the shapely geometry is the section's Y (horizontal), y-coordinate is the section's Z (vertical/depth).**

### 5.1 `SurfaceGeometry` — `geometry/_geometry.py:330`

```python
SurfaceGeometry(
    poly: shapely.Polygon,          # REQUIRED, must be a Polygon (TypeError otherwise)
    material: Material,             # REQUIRED, must be a structuralcodes Material
    concrete: bool = False,         # auto-set True if isinstance(material, Concrete)
    name: Optional[str] = None,
    group_label: Optional[str] = None,
)
```
Properties: `area`, `centroid -> (y, z)`, `density`, `material`, `concrete`, `polygon`.
Methods: `random_points_within(num_points=100, seed=None)` **[needs `triangle`]**, `calculate_extents() -> (y_min, y_max, z_min, z_max)`, `split(...)`, `split_two_lines(...)`, `translate(dx=0, dy=0)`, `rotate(...)`, `mirror(axis: LineString)`, `from_geometry(...)`, `_repr_svg_()`.
Operators: `geo + other -> CompoundGeometry`, `geo - other -> SurfaceGeometry`.

Holes are supported (shapely interior rings). The marin integrator requires interior rings to be CW: `ValueError('A inner hole should have cw coordinates')` if not — but `shapely.difference()` produces correct orientation in practice **[VERIFIED — `slab.difference(strip)` worked]**.

`RectangularGeometry(width, height, material, concrete=False, origin=None, name=None, group_label=None)` — convenience wrapper; the rectangle is **centred on `origin`** (default `(0,0)`), so corners are `(±width/2, ±height/2)`. Raises `ValueError` if `width <= 0` or `height <= 0`. `CircularGeometry` likewise exists. **[UNVERIFIED for `CircularGeometry`'s exact signature]**

### 5.2 `PointGeometry` (a rebar) — `geometry/_geometry.py:69`

```python
PointGeometry(
    point: Union[shapely.Point, ArrayLike],   # (y, z) pair or shapely Point
    diameter: float,                          # REQUIRED — the area is DERIVED from it
    material: Material,
    name: Optional[str] = None,
    group_label: Optional[str] = None,
)
```
Internals (line 114–115):
```python
self._diameter = diameter
self._area = np.pi * diameter**2 / 4.0
```
⇒ **A bar's area is ALWAYS `pi*d^2/4`. There is no `area=` argument and no area setter.**
To model an arbitrary `As` at one point, use the **equivalent diameter** `d_eq = sqrt(4*As/pi)`.
Properties: `diameter`, `area`, `material`, `density`, `x` (= section Y), `y` (= section Z), `point`.

### 5.3 Does the concrete area under a bar get subtracted? — **NO** **[VERIFIED]**

`MarinIntegrator._create_integration_data_point_geometries` (`_marin_integrator.py:168`) and `FiberIntegrator.triangulate` (`_fiber_integrator.py:137`) both take `area = pg.area` (the **full** `pi d²/4`) and append it as an extra integration term. The concrete `SurfaceGeometry` polygon is left untouched — **the steel area is double-counted with the concrete it displaces.**

Empirical check (300×600 C30/37 + 3Ø20):
```
gross concrete (overlap kept): M_y = -215,006,759.2      gross_properties.area = 180000.0
net concrete (holes punched) : M_y = -215,006,759.2      gross_properties.area = 179057.9
```
The moment is identical here only because the bars sit in the **tension** zone where the parabola-rectangle law gives zero concrete stress. **For bars in the compression zone the double-count is real and non-conservative.** If you care, subtract the bar circles from the concrete polygon yourself:
```python
net = conc_poly
for (y, z) in bar_coords:
    net = net.difference(shapely.Point(y, z).buffer(d/2, quad_segs=32))
```

`gross_properties.area` counts **surface geometries only** (concrete gross), and `gross_properties.area_reinforcement` counts **PointGeometry areas only**.

### 5.4 `CompoundGeometry` — `geometry/_geometry.py:804`

```python
CompoundGeometry(
    geometries: Union[List[Union[SurfaceGeometry, PointGeometry, CompoundGeometry]],
                      shapely.MultiPolygon],
    materials: Optional[Union[List[Material], Material]] = None,  # only with MultiPolygon
)
```
Attributes: `.geometries` (list of `SurfaceGeometry`), `.point_geometries` (list of `PointGeometry`) — **they are split into two separate lists**.
Properties: `area` (**sum of SURFACE areas only**, bars excluded), `geom` (lazy `MultiPolygon` for SVG; bars buffered into circles), `reinforced_concrete` (bool).
Methods: `get_point_geometries(group_label=None) -> (ndarray (n,2), List[Material])`, `calculate_extents()`, `translate`, `rotate`, `mirror`, `from_geometry`, `name_filter`, `group_filter`, `__add__`, `__sub__`.

### 5.5 `add_reinforcement*` — `geometry/_reinforcement.py`

```python
add_reinforcement(
    geo: Union[SurfaceGeometry, CompoundGeometry],
    coords: Tuple[float, float],          # (y, z)
    diameter: float,
    material: Material,
    group_label: Optional[str] = None,
) -> CompoundGeometry                     # == geo + PointGeometry(...)

add_reinforcement_line(
    geo, coords_i: Tuple[float,float], coords_j: Tuple[float,float],
    diameter: float, material: Material,
    n: int = 0,           # number of bars along the line
    s: float = 0.0,       # spacing
    first: bool = True,   # place the bar at coords_i
    last: bool = True,    # place the bar at coords_j
    group_label: Optional[str] = None,
) -> CompoundGeometry
# At least one of n / s must be > 0 else ValueError('At least n or s should be provided').
# n only  -> s = distance/(n-1), bars span coords_i..coords_j inclusive.
# s only  -> n = floor(distance/s)+1, centred on the segment.
# n and s -> checks it fits (ValueError otherwise), then centres the group.

add_reinforcement_circle(
    geo, center: Tuple[float,float], radius: float, diameter: float,
    material: Material, n: int = 0, s: float = 0.0,
    first: bool = True, last: bool = True,
    start_angle: float = 0.0, stop_angle: float = 2*np.pi,
    group_label: Optional[str] = None,
) -> CompoundGeometry
```

**[VERIFIED]**
```python
sg  = SurfaceGeometry(Polygon([(-150,-300),(150,-300),(150,300),(-150,300)]), C30)
geo = add_reinforcement_line(sg, (-100,-250), (100,-250), 20, B500, n=3, group_label='bottom')

SurfaceGeometry.area   180000.0   concrete flag True
centroid (-0.0, -0.0)  extents (-150.0, 150.0, -300.0, 300.0)
type after add_reinforcement_line: CompoundGeometry
n surface geoms 1   n point geoms 3
CompoundGeometry.area (surface areas only) = 180000.0
bar coords
 [[-100. -250.]
  [   0. -250.]
  [ 100. -250.]]
bar areas [314.1592653589793, 314.1592653589793, 314.1592653589793]  sum As = 942.4777960769379
```

### 5.6 Strain plane definition

The strain vector is always `[eps_a, chi_y, chi_z]` where `eps_a` is the **axial strain at the GLOBAL origin (0,0)**, not at the centroid. From `core/_section_results.py:186`:

```python
def _strain_from_kinematics(eps_a, chi_y, chi_z, y, z):
    return eps_a + chi_y * z - chi_z * y     # [VERIFIED source; sign of chi_z term is MINUS]
```
(The marin/fiber reinforcement path uses the 2D special case `strain[0] + strain[1]*z`.)

N, My, Mz are likewise **referred to (0,0)**, not to the centroid. **[VERIFIED]** — the same 300×600 beam placed with its corner at the origin gives the same `m_y = -215,006,758.7` but `eps_a = 0.02089336` instead of `0.00869668`, and re-integrating the reported strain plane reproduces `(N, My, Mz) = (0.0017, -215006758.7, -0.25)`.

---

## 6. `BeamSection` / `BeamSectionCalculator` — `sections/_beam_section.py`

```python
from structuralcodes.sections import BeamSection   # preferred
from structuralcodes.sections import GenericSection  # DEPRECATED alias
```
`sections/__init__.py` exports: `GenericSection`, `BeamSection`, `BeamSectionCalculator`, `SectionIntegrator`, `FiberIntegrator`, `MarinIntegrator`, `integrator_factory`, `marin_integration`, `calculate_elastic_cracked_properties`, `ShellFiberIntegrator`, `ShellSection`, `ShellSectionCalculator`.

### 6.1 Constructor — `_beam_section.py:49`

```python
BeamSection(
    geometry: Union[SurfaceGeometry, CompoundGeometry],
    name: Optional[str] = None,                       # base_name 'BeamSection'
    integrator: Literal['marin', 'fiber'] = 'marin',  # <- DEFAULT IS 'marin'
    **kwargs,                                         # forwarded to BeamSectionCalculator
)
```
A bare `SurfaceGeometry` is auto-wrapped: `geometry = CompoundGeometry([geometry])`.
Attributes: `.geometry` (always a `CompoundGeometry`), `.section_calculator` (`BeamSectionCalculator`), `.gross_properties` (lazy property → `SectionProperties`), `.name`.

`BeamSectionCalculator(sec, integrator='marin', **kwargs)` — `_beam_section.py:103`:
* `kwargs['mesh_size']` — default **0.01**, only used by the fiber integrator; it is a *dimensionless fraction of the surface area* used as the max triangle area (`max_area = g.area * mesh_size`). Must be in `(0, 1]` else `ValueError('mesh_size is a number from 0 to 1')`.
* `.integration_data` — cached triangulation / rebar arrays, built on first integration and reused.
* `._n_max`, `._n_min` — lazy.

### 6.2 Integrators

`sections/section_integrators/_factory.py`:
```python
integrator_registry = {'marin': MarinIntegrator, 'fiber': FiberIntegrator}
```
* **`'marin'` is the DEFAULT** and **does NOT require `triangle`** (closed-form Marin integration over polygon vertices, using shapely `split`/`orient` to clip the compression zone). **[VERIFIED]**
* **`'fiber'` REQUIRES `triangle`** (`_fiber_integrator.py:8,90`). **[VERIFIED — fails with a stub]**
* **GOTCHA [VERIFIED]:** an unknown integrator name falls back to `MarinIntegrator` **silently** (`self.registry.get(method.lower(), MarinIntegrator)`); the source even has a `# Here we should throw a warning` TODO. `BeamSection(geo, integrator='nonsense')` → `MarinIntegrator`. Validate names yourself.
* `IntegratorFactory` **caches instances by name** in `self.instances` — the integrator object is shared process-wide. It is stateless w.r.t. sections (all per-section state lives on the calculator's `integration_data`), but be aware of it.

Both implement:
```python
integrate_strain_response_on_geometry(
    geo: CompoundGeometry,
    strain: ArrayLike,                                  # [eps_a, chi_y, chi_z]
    integrate: Literal['stress','modulus'] = 'stress',
    **kwargs,        # integration_data=..., mesh_size=...
) -> Tuple[...]
# integrate='stress'  -> (N, My, Mz, integration_data)
# integrate='modulus' -> (ndarray(3,3), integration_data)
```

### 6.3 Sign conventions (**important**)

* `n` (and `N`): **positive = TENSION, negative = COMPRESSION.** Docstring: *"Axial load applied to the section (+: tension, -: compression)"*.
* `theta` = inclination of the neutral axis w.r.t. the section Y axis, in **radians**. `theta = 0` ⇒ compression block at the **top** (`calculate_elastic_cracked_properties` docstring: *"theta=0 implies upper compression block"*).
* Consequently, for a beam with bottom reinforcement, **`calculate_bending_strength(theta=0)` returns a NEGATIVE `m_y`** (the sagging capacity). Use `abs()` for reporting, and use `theta=np.pi` for the opposite (hogging) direction.
* Moments/curvatures follow the right-hand rule about Y and Z.
* Units: **whatever you feed in**. Use mm and MPa (N/mm²) ⇒ areas mm², forces **N**, moments **N·mm**, curvature **1/mm**, `E*I` in N·mm². `SectionProperties.mass` came out as `0.4394` for 180000 mm² @ 2400 kg/m³ + 942 mm² @ 7850 kg/m³ ⇒ `mass = density[kg/m³] * 1e-9 * area[mm²]` = **kg/mm** (i.e. ×1000 for kg/m). **[VERIFIED numerically]**

### 6.4 `calculate_limit_axial_load` / `n_min` / `n_max` — `_beam_section.py:792`

```python
calculate_limit_axial_load(self) -> Tuple[float, float]   # (n_min, n_max)
n_min: float   # property, lazy — capacity in COMPRESSION (negative)
n_max: float   # property, lazy — capacity in TENSION (positive)
check_axial_load(self, n: float)   # raises ValueError if n outside [n_min, n_max]
```
**[VERIFIED]** for the 300×600 + 3Ø20 beam:
```
n_min (compression) = -4010438.409731036   N
n_max (tension)     =   442554.7912013448  N
```
Sanity: `n_max = As * ftd = 942.4778 * 469.5652 = 442,553` ✓ (i.e. it uses the **hardened** ultimate steel stress).
Every `calculate_bending_strength` / `calculate_moment_curvature` call runs `check_axial_load(n)` first:
```
sc.calculate_bending_strength(theta=0, n=-1e9)
-> ValueError: Axial load -1000000000.0 cannot be taken by section.
   n_min = -4010438.409731036 / n_max = 442554.7912013448
```
Cost: **2 integrations, ~1 ms**. **[VERIFIED]**

### 6.5 `integrate_strain_profile` — `_beam_section.py:881`

```python
integrate_strain_profile(
    self,
    strain: ArrayLike,                                  # [eps_a, chi_y, chi_z]
    integrate: Literal['stress','modulus'] = 'stress',
) -> Union[IntegrateStrainForceResult, IntegrateStrainStiffnessResult]
```
Raises `Exception('integrate argument not valid. Valid options: stress and modulus')` for anything else.

**[VERIFIED]** marin, `strain=[0.0, -1e-6, 0.0]` on the 300×600+3Ø20 beam:
```
IntegrateStrainForceResult(eps_a=0.0, chi_y=-1e-06, chi_z=0.0,
    n=-209376.1101961531, m_y=-62743472.450961724, m_z=6.2868754085228235e-09,
    section=<BeamSection>, _detailed_result=None)
.asarray() = [-2.093761e+05 -6.274347e+07  6.286875e-09]
.astuple() = (-209376.1101961531, -62743472.450961724, 6.2868754085228235e-09)

integrate='modulus' -> .asarray() =
 [[ 1.853496e+09  1.958761e+11 -2.970995e-05]
  [ 1.958761e+11  5.970597e+13 -4.407998e-03]
  [-2.970995e-05 -4.407998e-03  1.374414e+13]]
```

### 6.6 `calculate_bending_strength` — `_beam_section.py:956`

```python
calculate_bending_strength(
    self, theta=0, n=0, max_iter: int = 100, tol: float = 1e-2
) -> UltimateBendingMomentResults
```
`tol` is on the axial-force residual (`deltaN`), i.e. in **N**. Uses a fixed-pivot bisection on the ultimate strain plane.

### 6.7 `calculate_moment_curvature` — `_beam_section.py:1107`

```python
calculate_moment_curvature(
    self,
    theta: float = 0.0,
    n: float = 0.0,
    chi_first: float = 1e-8,        # first curvature value (1/mm)
    num_pre_yield: int = 10,        # points up to yield; yield lands on index num_pre_yield-1
    num_post_yield: int = 10,       # points after yield
    chi: Optional[ArrayLike] = None,# explicit curvature array; overrides the 3 params above
    max_iter: int = 100,
    tol: float = 1e-2,
) -> MomentCurvatureResults
```
Behaviour notes:
* Result arrays have length `num_pre_yield + num_post_yield` (20 by default). **[VERIFIED: len 20]**
* Curvatures are **negative** for `theta=0` (sagging).
* On `NoConvergenceWarning` at step *i* it **truncates all arrays to length i and breaks**, then re-raises the warning (→ exception under the default filters). Always check `len(res.chi_y)`.
* `res.num_points` and `res.seed` stay `None` unless you call `create_detailed_result`.

### 6.8 `calculate_nm_interaction_domain` — `_beam_section.py:1303`

```python
calculate_nm_interaction_domain(
    self,
    theta: float = 0,
    num_1: int = 1, num_2: int = 2, num_3: int = 15,
    num_4: int = 10, num_5: int = 3, num_6: int = 4,
    num: Optional[int] = None,         # total; redistributed over the 6 fields
    type_1: Literal['linear','geometric','quadratic'] = 'linear',
    type_2: ... = 'linear',
    type_3: ... = 'geometric',
    type_4: ... = 'linear',
    type_5: ... = 'linear',
    type_6: ... = 'linear',
    complete_domain: bool = False,     # False = negative-moment half only; True = both halves
) -> NMInteractionDomainResult
```
Defaults sum to `1+2+15+10+3+4 = 35` strain profiles → `forces.shape == (35, 3)`. With `complete_domain=True` → `(69, 3)`. **[VERIFIED]**
`num_1..num_6` are the classic EC2 **failure fields 1–6**; `result.field_num` tags each point.
This method does **NOT** iterate — it constructs the ultimate strain profiles directly and integrates each once. **1 integration per point.** **[VERIFIED: 35 points → 35 integrations]**

### 6.9 `calculate_nmm_interaction_domain` — `_beam_section.py:1598`

```python
calculate_nmm_interaction_domain(
    self, num_theta: int = 33,
    num_1=1, num_2=2, num_3=15, num_4=10, num_5=3, num_6=4,
    num: Optional[int] = None,
    type_1='linear', type_2='linear', type_3='geometric',
    type_4='linear', type_5='linear', type_6='linear',
) -> NMMInteractionDomainResult
```
**[VERIFIED]** `num_theta=33` → `forces.shape == (1155, 3)` = 33 × 35, `field_num` unique values `[1 2 3 4 5 6]`. Also non-iterative: **1155 integrations**.

### 6.10 `calculate_mm_interaction_domain` — `_beam_section.py:1717`

```python
calculate_mm_interaction_domain(
    self, n: float = 0, num_theta: int = 33,
    max_iter: int = 100, tol: float = 1e-2,
) -> MMInteractionDomainResult
```
Internally loops `theta = np.linspace(0, 2*pi, num_theta)` and calls `calculate_bending_strength` for each → **expensive** (~33 iterations × ~32 integrations each). `forces.shape == (num_theta, 3)`, `result.theta.shape == (num_theta,)`.

### 6.11 `calculate_strain_profile` — `_beam_section.py:1776`

```python
calculate_strain_profile(
    self, n, my, mz,
    initial: bool = False,      # True -> modified Newton with LU-factored initial tangent
    max_iter: int = 15,
    tol: float = 1e-7,          # on ||delta_strain||
) -> StrainProfileResult
```
Full Newton–Raphson using `integrate_strain_profile(..., 'modulus')` for the tangent each iteration. `result.to_list()` gives `[eps_a, chi_y, chi_z]` ready to feed back into `integrate_strain_profile`. Emits `NoConvergenceWarning` if `num_iter >= max_iter`.

### 6.12 Other public surface

* `BeamSectionCalculator.get_balanced_failure_strain(geom, yielding=False, ...)` — returns `(y_n, y_p, strain)`. **[UNVERIFIED signature detail]**
* `find_equilibrium_fixed_pivot(geom, n, max_iter=100, tol=1e-2)`, `find_equilibrium_fixed_curvature(geom, n, curv, eps_0, max_iter=100, tol=1e-2)` — lower-level, return a 3-list strain plane.
* `calculate_elastic_cracked_properties(section: BeamSection, theta: float = 0, return_cracked_section: bool = False) -> SectionProperties | (SectionProperties, CompoundGeometry)` in `sections/_rc_utils.py:28`. Replaces materials with linear-elastic/`UserDefined` laws and neglects surface tension. **May take the fiber path if the section's integrator is a `FiberIntegrator`.** **[UNVERIFIED — not executed]**

---

## 7. Result objects — `structuralcodes/core/_section_results.py` (all `@dataclass(slots=True)`)

### `SectionProperties` (line 17) — 29 fields **[VERIFIED field list + real values]**
```
area, area_reinforcement, ea, mass, perimeter,
sy, sz, e_sy, e_sz, cy, cz,
iyy, izz, iyz, iyy_c, izz_c, iyz_c, i11, i22, theta,
e_iyy, e_izz, e_iyz, e_iyy_c, e_izz_c, e_iyz_c, e_i11, e_i22, e_theta
```
Methods: `__format__(spec)`, `__str__()`, `isclose(other, rtol=1e-5, atol=1e-8)`.

Real output for the 300×600 C30/37 + 3Ø20 beam (marin) **[VERIFIED]**:
```
area                = 180000.0
area_reinforcement  = 942.4777960769379
ea                  = 3788495559.215388
mass                = 0.4393984506992041          (kg/mm -> 439.4 kg/m)
perimeter           = 1800.0
sy                  = -235619.4490192345
sz                  = -1.0913936421275139e-11
e_sy                = -47123889803.8469
e_sz                = -2.86102294921875e-06
cy                  = -7.551870932669851e-16
cz                  = -12.438681547143332
iyy                 = 5458904862.254808
izz                 = 1356283185.3071797
iyz                 = -0.0
iyy_c               = 5481038836.340406
izz_c               = 1356283185.3071797
iyz_c               = -0.0
i11                 = 5481038836.340406
i22                 = 1356283185.3071797
theta               = 0.0
e_iyy               = 119780972450961.7
e_izz               = 28256637061435.914
e_iyz               = -0.0
e_iyy_c             = 119194813392428.98
e_izz_c             = 28256637061435.914
e_iyz_c             = -0.0
e_i11               = 119194813392428.98
e_i22               = 28256637061435.914
e_theta             = 0.0
```
Note `area = 180000` is the **gross concrete only** and `ea` uses the **law tangent at zero strain (20000 MPa)**, not `Ecm`.
**GOTCHA [VERIFIED]:** `area_reinforcement` counts **only `PointGeometry`**. A smeared-reinforcement `SurfaceGeometry` gives `area_reinforcement = 0` and its area is lumped into `area`.

### `UltimateBendingMomentResults` (line 693) — returned by `calculate_bending_strength`
```python
theta: float = 0     # radians, as requested
n: float = 0         # the INTEGRATED axial force (≈ your input n, residual-level)
m_y: float = 0       # N*mm
m_z: float = 0       # N*mm
chi_y: float = 0     # 1/mm
chi_z: float = 0     # 1/mm
eps_a: float = 0     # strain at global (0,0)
section: Optional[Section] = None
_detailed_result: SectionDetailedResultState = None
# methods: create_detailed_result(num_points=1000)  [needs triangle]
#          detailed_result (property), get_point_strain(...), get_point_stress(...)
```

### `MomentCurvatureResults` (line 275) — returned by `calculate_moment_curvature`
```python
theta: float = 0
n: float = 0                # the constant axial load
chi_y: ArrayLike = None     # shape (num_pre_yield+num_post_yield,) or truncated
chi_z: ArrayLike = None
eps_a: ArrayLike = None
m_y:   ArrayLike = None
m_z:   ArrayLike = None
section: Optional[Section] = None
_detailed_result: SectionDetailedResultState = None
seed: int = None
current_step: int = None
num_points: int = None
# methods: create_detailed_result(num_points=1000), detailed_result (property),
#          next_step(), previous_step(), set_step(step),
#          get_point_strain(...), get_point_stress(...)
```
All arrays are plain `numpy.ndarray` of the same length; iterate index-wise.

### `StrainProfileResult` (line 824) — returned by `calculate_strain_profile`
```python
eps_a: float = 0.0;  chi_y: float = 0.0;  chi_z: float = 0.0
n_ext: float = 0.0;  m_y_ext: float = 0.0;  m_z_ext: float = 0.0   # targets
n: float = 0.0;      m_y: float = 0.0;      m_z: float = 0.0       # achieved
tolerance: float = 0.0
max_iter: int = 0
used_initial_tangent: bool = False
iterations: int = 0
converged: bool = False
residual: NDArray[float64]                    # shape (3,)
residual_history: list[NDArray[float64]]
strain_history:   list[NDArray[float64]]
section: Optional[Section] = None
_detailed_result: SectionDetailedResultState = None
# properties: residual_norm_history, delta_strain_history, delta_strain_norm_history,
#             response_history, strain_plane -> NDArray(3,), residual_norm -> float,
#             detailed_result
# methods:    to_list() -> [eps_a, chi_y, chi_z], create_detailed_result(num_points=1000),
#             get_point_strain(...), get_point_stress(...)
```

### `IntegrateStrainForceResult` (line 1032)
```python
eps_a, chi_y, chi_z: float = 0.0     # echoed input
n, m_y, m_z: float = 0.0             # integrated
section: Optional[Section] = None
_detailed_result = None
# .asarray(dtype=np.float64) -> NDArray shape (3,)  == [n, m_y, m_z]
# .astuple() -> (n, m_y, m_z)
# .detailed_result / .create_detailed_result / .get_point_strain / .get_point_stress
```

### `IntegrateStrainStiffnessResult` (line 1013)
```python
eps_a, chi_y, chi_z: float = 0.0
tangent: NDArray[float64]            # shape (3,3), default zeros
# .asarray(dtype=np.float64) -> the (3,3) tangent
```
**GOTCHA:** the `eps_a/chi_y/chi_z` fields are **NOT populated** by `BeamSectionCalculator.integrate_strain_profile` — it constructs `IntegrateStrainStiffnessResult(tangent=result[0])` only, so they stay `0.0`. **[VERIFIED from source, line ~1010 of `_beam_section.py`]**

### `InteractionDomainResult` base (line 1172) and subclasses
```python
strains: NDArray[float64] = None     # shape (n, 3) -> [eps_a, chi_y, chi_z]
forces:  NDArray[float64] = None     # shape (n, 3) -> [N, My, Mz]
# properties (raise ValueError if the array is None):
#   n     -> forces[:, 0]
#   m_y   -> forces[:, 1]
#   m_z   -> forces[:, 2]
#   eps_a -> strains[:, 0]
#   chi_y -> strains[:, 1]
#   chi_z -> strains[:, 2]
```
| subclass | extra fields |
|---|---|
| `NMInteractionDomainResult` (1260) | `theta: float = 0`, `num_points: int = 0`, `field_num: NDArray` shape `(n,)` values 1–6 |
| `NMMInteractionDomainResult` (1232) | `num_theta: int = 0`, `num_points: int = 0`, `field_num: NDArray` shape `(n,)` |
| `MMInteractionDomainResult` (1280) | `num_theta: float = 0`, `theta: NDArray` shape `(n,)` (the angle per point) |

### `SectionDetailedResultState` (line 443) — **[needs `triangle`]**
```python
SectionDetailedResultState(section, eps_a, chi_y, chi_z, n, m_y, m_z,
                           num_points=1000, seed=None)
# read-only properties: section, seed, n, m_y, m_z, eps_a, chi_y, chi_z, strain,
#                       surface_data, point_data
# surface_data columns: group_label, name, material, y, z, strain, stress
# point_data   columns: group_label, name, material, diameter, area, y, z, strain, stress
```
`surface_data` is built by sampling `num_points` random points inside each `SurfaceGeometry` via `random_points_within` → **`triangle.triangulate(tri, 'p')`**.

---

## 8. WORKED EXAMPLE 1 — 300×600 C30/37 beam, 3Ø20 bottom, cover 40 **[VERIFIED — regression baseline]**

### Input script
```python
from shapely import Polygon
from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement_line
from structuralcodes.sections import BeamSection

C30  = ConcreteEC2_2004(fck=30, gamma_c=1.5, alpha_cc=1.0)
B500 = ReinforcementEC2_2004(fyk=500, Es=200000, ftk=540, epsuk=0.075, gamma_s=1.15)

# section centred on the origin: y in [-150,150], z in [-300,300]
poly = Polygon([(-150,-300), (150,-300), (150,300), (-150,300)])
sg   = SurfaceGeometry(poly, C30)

# cover 40 mm to the bar SURFACE -> bar centre at z = -300 + 40 + 10 = -250
#                                  outer bars at y = +-(150 - 40 - 10) = +-100
geo = add_reinforcement_line(sg, (-100,-250), (100,-250), 20, B500,
                             n=3, group_label='bottom')

sec = BeamSection(geo, name='B300x600', integrator='marin')   # or 'fiber'
sc  = sec.section_calculator
```
`As = 3 * pi*20²/4 = 942.4777960769379 mm²`, `d = 550 mm`, `fcd = 20.0 MPa`, `fyd = 434.783 MPa`, `ftd = 469.565 MPa`, `epsud = 0.0675`.
Hand check (rigid-plastic, no hardening): `Fs = 409,772 N`, `x = 85.4 mm`, `z = 515.8 mm`, `M ≈ 211.4 kNm` — consistent with the 215 kNm below, which includes steel strain hardening.

### 8.1 `calculate_bending_strength` **[VERIFIED]**

```
--- integrator = 'marin' ---
n_min (compression) = -4010438.409731036   n_max (tension) = 442554.7912013448
theta=0.0000  m_y=    -215006759.2  m_z=     -0.0000  n=  0.0017  eps_a=0.00869668  chi_y=-4.065559e-05  chi_z=0.000e+00   [0.014s]
theta=3.1416  m_y=       6387625.2  m_z=      0.0000  n= -0.0020  eps_a=0.02351024  chi_y= 9.003413e-05  chi_z=-1.103e-20  [0.014s]
n=-500kN:     m_y=    -305396903.0  eps_a=0.00209168  chi_y=-1.863892e-05

--- integrator = 'fiber' (mesh_size=0.01 default) ---
n_min (compression) = -4010438.4097310356  n_max (tension) = 442554.7912013448
theta=0.0000  m_y=    -214319594.6  m_z=-738794.2463  n=  0.0030  eps_a=0.00866741  chi_y=-4.055805e-05  [0.002s]
theta=3.1416  m_y=       5517780.4  m_z=-2069699.8111 n=  0.0082  eps_a=0.02331221  chi_y= 8.937404e-05  [0.002s]
n=-500kN:     m_y=    -305103198.6  eps_a=0.00209623  chi_y=-1.865411e-05
```

**REGRESSION BASELINE**

| quantity | marin | fiber (mesh_size=0.01) | Δ |
|---|---|---|---|
| **M_Rd, theta=0, n=0** | **-215,006,759.19 N·mm** (= **-215.007 kNm**) | **-214,319,594.6 N·mm** (= **-214.320 kNm**) | 0.32 % |
| M_Rd, theta=pi, n=0 | +6,387,625.2 N·mm | +5,517,780.4 N·mm | (unreinforced top; near-zero, noisy) |
| M_Rd, theta=0, n=-500 kN | -305,396,903.0 N·mm | -305,103,198.6 N·mm | 0.10 % |
| n_min | -4,010,438.4097 N | -4,010,438.4097 N | 0 (no surface integration involved) |
| n_max | +442,554.7912 N | +442,554.7912 N | 0 |
| eps_a @ M_Rd | 0.00869668 | 0.00866741 | |
| chi_y @ M_Rd | -4.065559e-05 /mm | -4.055805e-05 /mm | |

Notes:
* The fiber integrator introduces a **spurious `m_z` of ~-0.74 kN·m** on a perfectly symmetric section (mesh asymmetry). Marin gives `m_z ≈ -4e-8`. **For symmetric sections prefer marin**; it is also exact for polygons.
* `n` in the result is the **integrated** axial force (equilibrium residual ~0.002 N), not your input.

### 8.2 `calculate_moment_curvature(theta=0, n=0)` — defaults (10 pre + 10 post) **[VERIFIED]**

**marin** (wall clock 0.248 s, `len(chi_y) = 20`):
```
chi_y = [-1.000000e-08 -6.426948e-07 -1.275390e-06 -1.908084e-06 -2.540779e-06
         -3.173474e-06 -3.806169e-06 -4.438864e-06 -5.071558e-06 -5.704253e-06
         -9.199387e-06 -1.269452e-05 -1.618966e-05 -1.968479e-05 -2.317992e-05
         -2.667506e-05 -3.017019e-05 -3.366533e-05 -3.716046e-05 -4.065559e-05]

m_y   = [-3.685055e+05 -2.358885e+07 -4.661538e+07 -6.943637e+07 -9.203884e+07
         -1.144084e+08 -1.365288e+08 -1.583820e+08 -1.799476e+08 -2.012022e+08
         -2.057838e+08 -2.083582e+08 -2.100597e+08 -2.112638e+08 -2.121487e+08
         -2.128574e+08 -2.134663e+08 -2.140147e+08 -2.145239e+08 -2.150068e+08]

eps_a = [1.428656e-06 9.110922e-05 1.793384e-04 2.660313e-04 3.510940e-04
         4.344226e-04 5.159010e-04 5.953993e-04 6.727709e-04 7.478498e-04
         1.497010e-03 2.279970e-03 3.078754e-03 3.883471e-03 4.688117e-03
         5.491784e-03 6.294473e-03 7.096184e-03 7.896919e-03 8.696678e-03]

m_z   = ~1e-11 .. ~1e-8  (numerical zero)
chi_z = all zeros
res.theta = 0   res.n = 0   res.num_points = None   res.seed = None
```
Yield point = index `num_pre_yield - 1 = 9`: `chi_y = -5.704253e-06`, `m_y = -2.012022e+08` (≈ -201.2 kNm).
Ultimate (last) point matches `calculate_bending_strength` exactly: `-2.150068e+08` vs `-215,006,759`.

**fiber** (wall clock 0.051 s, `len(chi_y) = 20`):
```
chi_y = [-1.000000e-08 -6.427025e-07 -1.275405e-06 -1.908108e-06 -2.540810e-06
         -3.173513e-06 -3.806215e-06 -4.438918e-06 -5.071620e-06 -5.704323e-06
         -9.189695e-06 -1.267507e-05 -1.616044e-05 -1.964581e-05 -2.313119e-05
         -2.661656e-05 -3.010193e-05 -3.358730e-05 -3.707268e-05 -4.055805e-05]

m_y   = [-3.671533e+05 -2.350503e+07 -4.645467e+07 -6.920472e+07 -9.174278e+07
         -1.140548e+08 -1.361256e+08 -1.579372e+08 -1.794692e+08 -2.006983e+08
         -2.053526e+08 -2.077770e+08 -2.095711e+08 -2.107199e+08 -2.115608e+08
         -2.122254e+08 -2.128205e+08 -2.133590e+08 -2.138471e+08 -1.946716e+08]
```
⚠️ **The fiber integrator's LAST moment-curvature point is bogus** (`-1.9467e+08` instead of ~`-2.14e+08`, and `eps_a` drops from 7.88e-3 to 6.73e-3). The fixed-curvature equilibrium search is losing accuracy right at the ultimate mesh state. **Another reason to prefer marin.**

### 8.3 Other verified results (marin)

```
NM interaction domain, theta=0, defaults:
  forces.shape=(35,3)  strains.shape=(35,3)  field_num.shape=(35,)  theta=0  num_points=35
  field_num = [1 2 2 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 4 4 4 4 4 4 4 4 4 4 5 5 5 6 6 6 6]
  n  (first/last) =  442554.791201 ... -3976991.118431
  m_y at n=0 region: ~-2.23e+08 ; peak |m_y| = 3.642509e+08 at n = -1,238,119.8 N
  n[0..4]  = [442554.791201, 442554.791201, 390868.193728, 310864.650356, 272109.461465]
  m_y[0..4]= [-1.106387e+08, -1.106387e+08, -1.258806e+08, -1.486605e+08, -1.556690e+08]

MM interaction domain, n=0, num_theta=9:
  theta = [0, 0.785398, 1.570796, 2.356194, 3.141593, 3.926991, 4.712389, 5.497787, 6.283185]
  m_y   = [-2.150068e+08 -1.976449e+08 -8.924244e+07  1.206063e+06  6.387625e+06
            1.206063e+06 -8.924244e+07 -1.976449e+08 -2.150068e+08]
  m_z   = [-7.077747e-08 -3.293347e+07 -5.412019e+07 -3.649068e+07  4.004908e-07
            3.649068e+07  5.412019e+07  3.293347e+07 -3.860510e-08]

NMM interaction domain, num_theta=33:
  forces.shape=(1155,3)  field_num unique = [1 2 3 4 5 6]

calculate_strain_profile(n=0, my=-100e6, mz=0):
  eps_a = 0.0003808520076915282
  chi_y = -2.7651744076289235e-06
  chi_z = 2.500066194307998e-22
  converged = True   iterations = 5   residual_norm = 0.12633052199499437
  to_list() = [0.0003808520076915282, -2.7651744076289235e-06, 2.500066194307998e-22]
```
(fiber counterpart: `eps_a=0.0003817346269905913, chi_y=-2.7741916216128847e-06, chi_z=-1.5001839483403979e-09, iters=5`)

---

## 9. WORKED EXAMPLE 2 — slab per metre, SMEARED reinforcement **[VERIFIED]**

**Question answered: YES — you CAN add a `SurfaceGeometry` whose material is a `Reinforcement`.** `SurfaceGeometry.__init__` only checks `isinstance(material, Material)`; `Reinforcement` IS a `Material`. The `concrete` flag stays `False` and the integrators simply integrate that surface with the steel constitutive law. `PointGeometry` is **not** required.

```python
As      = 1000.0          # mm2 per metre
dia     = 12.0
strip_h = dia            # 12 mm
strip_w = As / strip_h   # 83.3333 mm
cover   = 25.0
z_bar   = -100 + cover + dia/2      # = -69.0  (layer centroid)

slab  = Polygon([(-500,-100),(500,-100),(500,100),(-500,100)])
conc  = SurfaceGeometry(slab, C30)
strip = Polygon([(-strip_w/2, z_bar-strip_h/2), (strip_w/2, z_bar-strip_h/2),
                 (strip_w/2, z_bar+strip_h/2), (-strip_w/2, z_bar+strip_h/2)])
steel_sg   = SurfaceGeometry(strip, B500)          # <- ACCEPTED
geo_smear  = CompoundGeometry([conc, steel_sg])
sec        = BeamSection(geo_smear, integrator='marin')
```

Real output:
```
SurfaceGeometry with Reinforcement material: ACCEPTED
  steel_sg.area = 1000.0   concrete flag = False
  material = ReinforcementEC2_2004   law = ElasticPlastic
  CompoundGeometry OK: n surf = 2   n pts = 0
  [marin] gross area=201000.0  area_reinforcement=0
  [marin] SMEARED  M_Rd = -69,864,525.0 Nmm = -69.865 kNm   eps_a=0.009284  chi_y=-1.278393e-04
  [fiber] gross area=201000.0  area_reinforcement=0
  [fiber] SMEARED  M_Rd = -67,884,878.4 Nmm = -67.885 kNm   eps_a=0.009240  chi_y=-1.274001e-04

--- same slab with the concrete strip SUBTRACTED (overlap removed) ---
  conc_net.area = 199000.0
  NET  M_Rd = -69,864,525.0 Nmm = -69.865 kNm      <- IDENTICAL to the gross case

--- same slab with DISCRETE bars (9 x phi12, As = 1017.876 mm2) ---
  [marin] DISCRETE M_Rd = -70,991,500.9 Nmm = -70.992 kNm  (scaled to As=1000: -69.745 kNm)
  [fiber] DISCRETE M_Rd = -69,031,258.1 Nmm = -69.031 kNm  (scaled to As=1000: -67.819 kNm)
```

**Conclusions for smeared reinforcement:**
1. **`SurfaceGeometry(strip_polygon, reinforcement_material)` works** and is the way to model a smeared layer. Build the compound with `CompoundGeometry([conc_sg, steel_sg])` (or `conc_sg + steel_sg`).
2. **Smeared vs discrete agree to 0.17 %** (`-69.865` vs `-69.745` kNm scaled) — the smeared model is a valid substitute for the ULS moment. **Marin baseline for this slab: `M_Rd = -69,864,525.0 N·mm = -69.865 kNm`.**
3. **Subtracting the concrete under the strip makes no difference here** (identical to the last digit) because the layer is in tension where the concrete law gives zero stress. It WILL matter for a compression layer.
4. **`gross_properties.area_reinforcement` reports 0** for a smeared layer and `area` includes the 1000 mm² of "steel" (201000 vs 200000). Track `As` yourself.
5. Keep the strip **thin and centred on the bar centroid** so the lever arm is right; using `strip_h = bar diameter` is the natural choice and is what was verified. The strip width then falls out as `As / strip_h`. The strip's own bending stiffness about its own centroid is negligible.
6. For **two-way / top+bottom** layers, just add more steel `SurfaceGeometry` objects to the compound.
7. Alternative, also valid and arguably cleaner: one `PointGeometry` per metre-strip with the **equivalent diameter** `d_eq = sqrt(4*As/pi)` (= 35.68 mm for As = 1000). That keeps `area_reinforcement` correct. **[UNVERIFIED for this slab, but `PointGeometry` area is exactly `pi d²/4` — VERIFIED — so it is exact by construction.]**

---

## 10. Performance & progress feedback **[VERIFIED on native CPython 3.11, Windows, Ryzen-class desktop]**

`integrations` = number of calls to `integrator.integrate_strain_response_on_geometry` (instrumented by monkey-patching both integrator classes). This is the natural unit for a progress bar.

300×600 + 3Ø20, cold = fresh `BeamSection` (integration data not yet cached), warm = second call on the same calculator:

| integrator | operation | cold wall | integrations | warm wall | integrations |
|---|---|---|---|---|---|
| marin | `n_min`/`n_max` | 1.0 ms | **2** | 0.5 ms | 2 |
| marin | `calculate_bending_strength` | 14.2 ms | **33** | 12.9 ms | 31 |
| marin | `moment_curvature(10+10)` → 20 pts | 230.8 ms | **635** | 233.2 ms | 633 |
| marin | `moment_curvature(50+50)` → 100 pts | 1072.2 ms | **2968** | 1080.8 ms | 2966 |
| marin | `nm_interaction(theta=0)` → (35,3) | 14.8 ms | **35** | 13.7 ms | 35 |
| marin | `nm_interaction(complete_domain=True)` → (69,3) | 27.6 ms | **69** | 29.6 ms | 69 |
| marin | `mm_interaction(num_theta=33)` → (33,3) | 453.2 ms | **1074** | 466.9 ms | 1072 |
| marin | `nmm_interaction(num_theta=33)` → (1155,3) | 475.8 ms | **1155** | 482.6 ms | 1155 |
| marin | `calculate_strain_profile` | 4.4 ms | **12** | 3.8 ms | 12 |
| fiber | `n_min`/`n_max` | 1.1 ms | 2 | 0.2 ms | 2 |
| fiber | `calculate_bending_strength` | 3.3 ms | 33 | 2.7 ms | 31 |
| fiber | `moment_curvature(10+10)` | 49.0 ms | 646 | 49.2 ms | 644 |
| fiber | `moment_curvature(50+50)` | 217.8 ms | 2981 | 219.8 ms | 2979 |
| fiber | `nm_interaction(theta=0)` | 3.7 ms | 35 | 2.8 ms | 35 |
| fiber | `mm_interaction(33)` | 86.8 ms | 1077 | 83.2 ms | 1075 |
| fiber | `nmm_interaction(33)` | 90.5 ms | 1155 | 95.3 ms | 1155 |
| fiber | `calculate_strain_profile` | 1.7 ms | 12 | 0.8 ms | 12 |

**Surprising but real: the FIBER integrator is ~4–5× FASTER than MARIN** for this section. Marin pays shapely `split`/`orient`/`rotate` polygon work on *every* call; fiber does one triangulation then a vectorized numpy pass over ~200 fibres. (Fiber's mesh is cached in `calculator.integration_data`.) **Marin is still the right choice for Pyodide** because it needs no `triangle`, and because it is exact (no spurious `m_z`, no bogus last moment-curvature point).

Scaling (marin):
```
mc  10+ 10 ->   20 pts     235.5 ms      (~11.8 ms/point, ~32 integrations/point)
mc  25+ 25 ->   50 pts     549.2 ms      (~11.0 ms/point)
mc  50+ 50 ->  100 pts    1077.7 ms      (~10.8 ms/point)
mc 100+100 ->  200 pts    2440.7 ms      (~12.2 ms/point)

mm num_theta=  9 -> (9, 3)      152.2 ms  (~16.9 ms/theta)
mm num_theta= 17 -> (17,3)      264.2 ms
mm num_theta= 33 -> (33,3)      504.2 ms  (~15.3 ms/theta)
mm num_theta= 65 -> (65,3)     1095.0 ms
nmm num_theta=33 -> (1155,3)    630.4 ms  (field_num unique [1 2 3 4 5 6])
```

### Progress-feedback model for the browser

* `calculate_bending_strength` ≈ **31–33 integrations**, ~14 ms native → practically instant; no progress bar needed.
* `calculate_moment_curvature` ≈ **`(num_pre_yield + num_post_yield) × ~32` integrations** (635 for 20 points), plus ~30 for the internal `_prepare_chi_array` yield/ultimate search. **Linear in the point count, ~11 ms/point native.**
* `calculate_nm_interaction_domain` = **exactly 1 integration per point** (`num_1+...+num_6`, ×2 with `complete_domain=True`). Very cheap and perfectly predictable — great for a determinate progress bar.
* `calculate_nmm_interaction_domain` = **exactly `num_theta × sum(num_i)` integrations** (33×35 = 1155). Also predictable.
* `calculate_mm_interaction_domain` = **`num_theta × ~32` integrations** (it calls `calculate_bending_strength` per theta) — ~15 ms/theta native.
* `calculate_strain_profile` = **`2 × (iterations+1)` integrations** (one 'stress' + one 'modulus' each Newton step) — 12 for a 5-iteration solve.

**Pyodide expectation [UNVERIFIED]:** Marin is Python-loop + shapely-call heavy, so expect roughly **2–5×** the native times in Pyodide (numpy/shapely kernels are WASM-native, the glue is not). Budget:
* bending strength: **~30–70 ms** → fine synchronously.
* NM domain (35 pts): **~30–75 ms** → fine synchronously.
* moment–curvature 20 pts: **~0.5–1.2 s** → run in a Web Worker with a progress callback.
* MM domain 33 theta: **~1–2.5 s** → Worker + progress.
* NMM domain 33×35: **~1–2.5 s** → Worker + progress.

**How to emit progress:** there is no callback hook in the API. The cleanest instrumentation is to monkey-patch the integrator, exactly as done for the measurements above:
```python
from structuralcodes.sections.section_integrators import MarinIntegrator
_orig = MarinIntegrator.integrate_strain_response_on_geometry
def _counting(self, *a, **k):
    _progress_tick()            # post a message to the JS side every N ticks
    return _orig(self, *a, **k)
MarinIntegrator.integrate_strain_response_on_geometry = _counting
```
For `calculate_moment_curvature` / `calculate_mm_interaction_domain` an alternative with exact step semantics is to drive the loop yourself: pass an explicit `chi=` array and call the method one curvature at a time, or loop `theta` and call `calculate_bending_strength` per angle. Both give clean, chunked, cancellable progress.

---

## 11. Gotcha checklist for the implementing agent

1. Stub `sys.modules['triangle']` **before** `import structuralcodes`, and use `integrator='marin'`.
2. Use `BeamSection`, not `GenericSection` (deprecation warning).
3. `ConcreteEC2_2004(fck=<float>)` — never a strength-class string.
4. `alpha_cc` defaults to **1.0**; pass `alpha_cc=0.85` explicitly if your annex wants it. `alpha_cc=0` is impossible.
5. `gamma_c` / `alpha_cc` / `gamma_s` / `gamma_eps` are constructor-only (read-only properties, `x or default`).
6. `set_national_annex()` is a no-op in 0.7.2 for material partial factors.
7. Reinforcement default law is **`'elasticplastic'` (with hardening)**. Use `'elasticperfectlyplastic'` for the horizontal-branch EC2 law.
8. `ftk` and `epsuk` are **required** for `ReinforcementEC2_2004`.
9. `n > 0` is tension. `theta=0` puts compression at the top ⇒ sagging `M_y` is **negative**.
10. Units are unit-agnostic; use mm/MPa/N/N·mm and remember `mass` comes out in **kg/mm**.
11. `eps_a`, `N`, `My`, `Mz` are referred to the **global (0,0)**, not the centroid. Either centre your geometry on the origin, or convert.
12. Concrete area under bars is **NOT** subtracted. Subtract it yourself if bars sit in compression.
13. `gross_properties.ea` / `e_iyy` use the **constitutive-law tangent at zero strain**, not `Ecm`.
14. `gross_properties.area_reinforcement` ignores smeared-reinforcement `SurfaceGeometry`.
15. `NoConvergenceWarning` is an **error** by default — catch it or re-filter.
16. `calculate_moment_curvature` **truncates its arrays** on non-convergence — always use `len(res.chi_y)`.
17. Unknown integrator names fall back to marin **silently**.
18. `check_axial_load` raises `ValueError` *before* any work — pre-validate `n` against `sc.n_min` / `sc.n_max` to give a good UI message.
19. `IntegrateStrainStiffnessResult.eps_a/chi_y/chi_z` are never populated (always 0.0).
20. Don't touch `result.detailed_result` / `create_detailed_result` / `get_point_strain` / `get_point_stress` — they need `triangle`. Recompute strains yourself: `eps(y,z) = eps_a + chi_y*z - chi_z*y`, then `material.constitutive_law.get_stress(eps)`.

---

## 12. Minimal, browser-safe engine skeleton **[assembled from VERIFIED pieces]**

```python
import sys, types, warnings
import numpy as np

# --- 1. triangle stub, BEFORE importing structuralcodes -----------------
_stub = types.ModuleType('triangle')
_stub.triangulate = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("triangle unavailable: use integrator='marin'"))
sys.modules.setdefault('triangle', _stub)

import structuralcodes                                       # 0.7.2
from structuralcodes.core.errors import NoConvergenceWarning
from shapely import Polygon
from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.geometry import SurfaceGeometry, CompoundGeometry, \
     add_reinforcement, add_reinforcement_line
from structuralcodes.sections import BeamSection

# --- 2. demote NoConvergenceWarning from error to warning --------------
warnings.filterwarnings('always', category=NoConvergenceWarning)

# --- 3. build ----------------------------------------------------------
def rc_beam(b, h, fck, gamma_c, alpha_cc, bars, fyk, Es, ftk, epsuk, gamma_s,
            hardening=True):
    """bars: list of (y, z, diameter). Section centred on (0,0)."""
    conc = ConcreteEC2_2004(fck=fck, gamma_c=gamma_c, alpha_cc=alpha_cc,
                            constitutive_law='parabolarectangle')
    steel = ReinforcementEC2_2004(
        fyk=fyk, Es=Es, ftk=ftk, epsuk=epsuk, gamma_s=gamma_s,
        constitutive_law='elasticplastic' if hardening
                         else 'elasticperfectlyplastic')
    geo = SurfaceGeometry(
        Polygon([(-b/2,-h/2), (b/2,-h/2), (b/2,h/2), (-b/2,h/2)]), conc)
    for (y, z, d) in bars:
        geo = add_reinforcement(geo, (y, z), d, steel)
    return BeamSection(geo, integrator='marin'), conc, steel

sec, conc, steel = rc_beam(
    300, 600, 30, 1.5, 1.0,
    bars=[(-100,-250,20), (0,-250,20), (100,-250,20)],
    fyk=500, Es=200000, ftk=540, epsuk=0.075, gamma_s=1.15)

sc = sec.section_calculator

# --- 4. ULS -----------------------------------------------------------
n_min, n_max = sc.n_min, sc.n_max          # -4010438.41 , 442554.79
r = sc.calculate_bending_strength(theta=0.0, n=0.0)
M_Rd = abs(r.m_y)                          # 215006759.19 N*mm = 215.007 kNm

# --- 5. moment-curvature with progress --------------------------------
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always', NoConvergenceWarning)
    mc = sc.calculate_moment_curvature(theta=0.0, n=0.0,
                                       num_pre_yield=10, num_post_yield=10)
chi = np.asarray(mc.chi_y); my = np.asarray(mc.m_y)   # both length 20
converged = (len(chi) == 20) and not w

# --- 6. N-M domain (cheap, 1 integration per point) -------------------
nm = sc.calculate_nm_interaction_domain(theta=0.0, complete_domain=True)
N, MY, FIELD = nm.n, nm.m_y, nm.field_num   # shapes (69,), (69,), (69,)
```

---

## 13. Files written during this research (scratchpad)

```
<scratchpad>/venv/                      # the virtualenv with structuralcodes 0.7.2
<scratchpad>/wheels/structuralcodes-0.7.2-py3-none-any.whl
<scratchpad>/run1.py                    # materials / constitutive laws
<scratchpad>/run2.py                    # geometry + gross properties
<scratchpad>/run3.py                    # worked beam example, both integrators
<scratchpad>/run4.py                    # instrumentation + slab / smeared reinforcement
<scratchpad>/run5_stub.py               # triangle-stub proof
<scratchpad>/run6.py                    # edge cases (warnings, subtraction, origin, deprecation)
<scratchpad>/run7.py                    # timing scaling
<scratchpad>/structuralcodes-api-research.md    # this file
```
