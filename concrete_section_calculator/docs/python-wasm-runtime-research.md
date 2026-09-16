# Running `structuralcodes` in the browser — Python/WASM runtime survey & load-time plan

Research date: **2026-09-16**. Target: plain-HTML + ES-module module on GitHub Pages, no COOP/COEP, no SharedArrayBuffer, calculation in a Web Worker.

Everything marked **[VERIFIED]** was actually executed or measured on this machine (Node 24.14.0 / V8, Windows 11) or read off live HTTP headers today. **[UNVERIFIED]** = read from docs/search only. **[NOT BROWSER-TESTED]** = proven in Node's V8, not in a real browser tab.

Working test tree: `…\scratchpad\pyotest3\` (`bench.mjs`, `oneshot.mjs`, `bundle_test.mjs`, `sniff_test.mjs`, `nolock.mjs`, `httpwheel.mjs`, `make_bundle.py`, `make_bundle_trim.py`, `make_lock.py`).

---

## 1. Executive summary — RECOMMENDATION

1. **Pyodide is the answer.** It is the only 2026 browser Python runtime with working `numpy`/`scipy`/`shapely` wheels. Latest stable **314.0.7, released 2026-09-14** (Python 3.14.2, Emscripten 5.0.3). Everything else (MicroPython/`mpy`, CPython-WASI, emscripten-forge, py2wasm) is disqualified — see §2.
2. **But do NOT use Pyodide the default way.** Pyodide + `micropip.install("structuralcodes")` costs **24.3 MB over the wire and ~4.2 s of pure CPU**, because `scipy` alone is a **13.87 MB** wheel.
3. **`triangle` must be stubbed regardless.** No emscripten wheel exists on PyPI, none in emscripten-forge (either channel), and PyPI's latest `triangle` (20250106) has **no cp314 wheels at all**. `structuralcodes` only calls it for the non-default `'fibre'` integrator. **[VERIFIED]**
4. **`scipy` can also be stubbed — and this is the single biggest win.** `structuralcodes` 0.7.2 uses exactly **three** scipy functions: `linalg.lu_factor`, `linalg.lu_solve`, `interpolate.interp1d` (plus `interpolate.griddata`, which the ULS path never reaches). A ~15-line numpy shim gives **bit-identical results** across bending strength, moment–curvature, gross properties and the N–M interaction domain. **[VERIFIED — see §3.2]**
5. **Ship one pre-bundled `.tar.gz`, not wheels + micropip.** `numpy` + `shapely` + `structuralcodes` + the two stubs, unpacked straight into `site-packages` via `pyodide.unpackArchive()`: **3.35 MB**, one request, no lockfile fetch, no micropip, no dependency resolution. **[VERIFIED]**
6. **Result: 9.56 MB in 5 requests, 1.7 s CPU** — down from 24.30 MB / 4.19 s. That is **−61 % bytes and −59 % CPU**. **[VERIFIED]**
7. Expected wall-clock: **cold ≈ 2.5 s (100 Mbit) / 4.5 s (25 Mbit) / 9 s (10 Mbit)**; **warm ≈ 1.0–1.4 s** with a Service Worker. Nowhere near the 15 s pain threshold, so the honest-alternative fallback (§6) is not needed.
8. **Kick the worker off on `DOMContentLoaded`**, not on "Calculate". The user fills the form for 10–30 s; that hides the entire cold start. This is worth more than every byte optimisation combined.
9. **Self-host the Pyodide core in the repo.** GitHub Pages gzip beats jsdelivr brotli by only ~220 kB total (2 %), and same-origin makes Service-Worker precaching trivial. GH Pages `Cache-Control: max-age=600` is the only catch — the Service Worker removes it. **[VERIFIED]**
10. **Upgrade path stays intact:** `structuralcodes` itself is the real, unmodified `py3-none-any` wheel. Upgrading = drop in a new wheel and re-run one build script. Only two *dependencies* are substituted, and the substitution is a 15-line file you re-validate against real scipy in CI.

---

## 2. Runtime comparison

| Runtime | Latest version / date | How you load it from a static site | Our dep set works? | Wire size for our set | Cold start | Verdict |
|---|---|---|---|---|---|---|
| **Pyodide** | **314.0.7 — 2026-09-14** (Py 3.14.2, Emscripten 5.0.3, ABI `pyemscripten_2026_0`) | `import {loadPyodide} from "./pyodide/pyodide.mjs"` inside a **module** worker | **Yes** — numpy 2.4.6, scipy 1.18.0, shapely 2.1.2 all in the lockfile. `triangle` absent → stub | **9.56 MB** optimised / 24.30 MB naive | 1.7 s CPU + download | ✅ **RECOMMENDED** |
| MicroPython / PyScript `mpy` | PyScript 2026.3.1 | `<script type="mpy">` | **No.** Ships `ulab` (a numpy-*like* API), not numpy. No scipy, no shapely, no CPython C-API → `structuralcodes` cannot even import | ~303 kB base | ~ms | ❌ **Out of scope.** Would require a full JS/ulab rewrite — violates priority 1 outright |
| CPython WASI (`python.wasm` + `@bjorn3/browser_wasi_shim`, wasmer-js) | PEP 816 **accepted**, lands Python **3.15**; WASI is still a dev/CI target | WASI shim in the browser | **No.** No wheel ecosystem: no numpy/scipy/shapely WASI builds, no platform tags yet (Brett Cannon, 2026-03-02, lists "platform tags for wheels" as *upcoming*) | n/a | n/a | ❌ Not viable in 2026. Revisit ~2028 |
| **emscripten-forge / xeus-python / JupyterLite** | `emscripten-forge-4x` channel, **823 pkgs** (Py 3.14.3, numpy 2.5.3, scipy 1.18.0, shapely 2.1.2, geos 3.15.0) | `micromamba --platform=emscripten-wasm32` → `empack` filesystem image | **No advantage.** **`triangle` is ABSENT from both `emscripten-forge-dev` (340 pkgs) and `emscripten-forge-4x` (823 pkgs)** [VERIFIED by parsing both `repodata.json`]. Output is a conda/empack FS image for xeus-python, **not** Pyodide-loadable wheels | — | — | ❌ Does not solve the one problem it might have solved |
| py2wasm (Wasmer) | — | — | Compiles *your* Python AOT; does not port C extensions | — | — | ❌ Irrelevant for numpy/scipy |
| RustPython / Brython / component-model Python | — | — | No CPython C-API → no numpy | — | — | ❌ |

### 2.1 What actually changed in Pyodide recently

Version numbering jumped from `0.29.x` to **`314.x`** (tracks the Python version, per PEP 783).

- **314.0.0 (2026-06-09)** — Python 3.14.2, Emscripten 5.0.3. Platform tag `pyemscripten_2026_0`. **`pyodide.asm.js` → `pyodide.asm.mjs`: Pyodide is now a native ES module, so classic workers no longer work — you must use `new Worker(url, {type:"module"})`.** `ssl`/`sqlite3`/`lzma` re-vendored into the core ("initial download size increases, users no longer need to install these separately"). `compression.zstd` bundled. Stack-switching memory leak fixed.
- **314.0.1 (2026-06-26)** — faster `PyProxy` creation, faster int/string JS↔Py conversion, cached `JsProxy` type flags.
- **314.0.3 (2026-07-24)** — stdlib shrunk by excluding `zoneinfo/_zoneinfo.py`.
- **314.0.7 (2026-09-14)** — current stable.
- **PEP 783 accepted** → emscripten wheels can now be published to PyPI, and **in Pyodide 314+ `micropip.install` can pull them straight from PyPI**. Great news for the future of `triangle`; today nobody has published one.

**Answers to the specific things you asked about:**

- **`pyodide-lite`** — does not exist. No such distribution. **[VERIFIED: not in the download index or docs]**
- **zstd compression of packages** — not a thing. `compression.zstd` is a *Python stdlib module* now bundled; packages are still `.whl` (zip/deflate). Compressing them further is pointless (§4.1).
- **`pyodide-pack`** — exists (`github.com/pyodide/pyodide-pack`) but is effectively a research project: **48 stars, 87 commits, ZERO releases, last commit 2026-07-07, README still says "Pyodide 0.24.0+"**. Not usable against 314.x without work. **Our hand-rolled bundle (§3.3) achieves the same goal in 40 lines of Python and is fully verified.** **[VERIFIED via GitHub API]**
- **Stack-switching / JSPI** — Chrome 137+ (2025-05-27) and Firefox 153 (2026-07-21) ship it; Safari does not yet. Pyodide uses it for `loop.run_until_complete` (`enableRunUntilComplete`), i.e. **async correctness, not startup speed**. **No measurable startup benefit. Do not budget any saving for this.**
- **Partial / streaming loading** — the core wasm *is* fetched with `WebAssembly.instantiateStreaming` (§4.4), but there is no facility to load "part of" the runtime. `python_stdlib.zip` (2.5 MB) and `pyodide.asm.wasm` (3.44 MB) are mandatory and together are 62 % of our optimised payload. **That 5.94 MB is the hard floor for real CPython in a browser.**
- **One pre-bundled archive containing exactly our packages — YES.** `pyodide.unpackArchive()`. This is the recommendation. §3.3.

---

## 3. Recommended loading & installation strategy

### 3.0 Measured baselines (Node 24.14.0 / V8, packages on local disk — download time excluded)

| Configuration | Runtime boot | Packages | Import + calc | **Total CPU** | Wire size |
|---|---|---|---|---|---|
| A. Naive: `loadPackage(numpy,scipy,shapely,micropip)` + `micropip.install(structuralcodes)`, `triangle` mocked | 1012 ms | 1326 ms | 1581 ms | **4185 ms** | 24.30 MB |
| B. scipy stubbed, rest unchanged | 966 ms | 269 ms | 561 ms | **1960 ms** | 10.42 MB |
| C. Custom `pyodide-lock.json` + `packages:[…]`, no micropip | 1270 ms (runtime **+** all pkgs) | — | 488 ms | **1758 ms** | 10.21 MB |
| **D. RECOMMENDED — inline empty lockfile + single `.tar.gz` via `unpackArchive`** | 967 ms | 197 ms (unpack) | 541 ms | **1705 ms** | **9.56 MB** |

All four produce `m_y = -227.1826 kNm` for the reference section. **[VERIFIED]**

`scipy`'s cost is **1057 ms of wheel unpacking + 1119 ms of `dlopen` at import = 2176 ms**, every single load, warm or cold, *on top of* 13.87 MB of download. **[VERIFIED]**

### 3.1 Build step (runs on your machine / in CI, not in the browser)

```bash
# 1. the real, unmodified package
pip download structuralcodes==0.7.2 --no-deps -d wheels/
#    -> structuralcodes-0.7.2-py3-none-any.whl   (208,422 B, py3-none-any)

# 2. the two native wheels, straight from the pinned Pyodide distribution
V=314.0.7
BASE=https://cdn.jsdelivr.net/pyodide/v$V/full
curl -o wheels/numpy.whl   $BASE/numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl
curl -o wheels/shapely.whl $BASE/shapely-2.1.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl

# 3. the Pyodide core (4 files only)
for f in pyodide.mjs pyodide.asm.mjs pyodide.asm.wasm python_stdlib.zip; do
  curl -o public/pyodide/$f $BASE/$f
done

# 4. build the single bundle
python tools/make_bundle.py        # -> public/sc-bundle.tar.gz   (3,346,915 B)
```

`tools/make_bundle.py` (verified working — this is `make_bundle.py` + `make_bundle_trim.py` merged):

```python
"""Unpack the three wheels into one tree, add the two stub modules,
strip build-only artefacts, emit a single gzipped tar."""
import gzip, os, pathlib, shutil, tarfile, textwrap, zipfile

OUT = pathlib.Path('build/site-packages')
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)

for w in ['wheels/numpy.whl', 'wheels/shapely.whl',
          'wheels/structuralcodes-0.7.2-py3-none-any.whl']:
    with zipfile.ZipFile(w) as z:
        z.extractall(OUT)

# --- stub 1: `triangle`. No emscripten wheel exists anywhere (verified).
#     structuralcodes only calls it for integrator='fibre'; the default
#     'marin' integrator never touches it.
(OUT / 'triangle.py').write_text(textwrap.dedent('''
    __version__ = "20250106"
    def triangulate(tri, opts=""):
        raise NotImplementedError(
            "triangle is not available in WebAssembly; "
            "use the default integrator='marin'")
'''))

# --- stub 2: `scipy`. 13.87 MB and 2.2 s of CPU for THREE functions.
#     Verified to give bit-identical results on the whole ULS path.
sp = OUT / 'scipy'; sp.mkdir(exist_ok=True)
(sp / '__init__.py').write_text(
    '__version__ = "1.18.0"\nfrom . import linalg, interpolate\n')
(sp / 'linalg.py').write_text(textwrap.dedent('''
    import numpy as np
    # structuralcodes uses these strictly as a pair:
    #   lu, piv = lu_factor(A);  x = lu_solve((lu, piv), b)
    # (sections/_beam_section.py:1841,1851 and _shell_section.py)
    def lu_factor(a, **kw):
        return (np.array(a, dtype=float), None)
    def lu_solve(lu_piv, b, **kw):
        return np.linalg.solve(lu_piv[0], b)
'''))
(sp / 'interpolate.py').write_text(textwrap.dedent('''
    import numpy as np
    def interp1d(x, y, **kw):
        x = np.asarray(x, dtype=float); y = np.asarray(y, dtype=float)
        return lambda xn: np.interp(xn, x, y)
    def griddata(points, values, xi, method="linear", **kw):
        # Only reached by EC2-2023 material tables and EC2-2004 §7.3
        # crack control. Loud failure beats a silent wrong number.
        raise NotImplementedError(
            "scipy.interpolate.griddata is not available in the browser build")
'''))

# --- strip things a runtime install never reads  (3.83 MB -> 3.35 MB)
DROP_DIRS = {'tests', '__pycache__', 'f2py', 'testing', 'distutils', 'include', 'doc'}
DROP_EXT  = {'.pyi', '.h', '.pxd', '.c', '.a', '.pyx', '.hpp'}
for root, dirs, files in os.walk(OUT, topdown=True):
    for d in list(dirs):
        if d in DROP_DIRS:
            shutil.rmtree(os.path.join(root, d)); dirs.remove(d)
    for f in files:
        if os.path.splitext(f)[1] in DROP_EXT:
            os.remove(os.path.join(root, f))

with tarfile.open('build/sc-bundle.tar', 'w') as t:
    t.add(OUT, arcname='.')
pathlib.Path('public/sc-bundle.tar.gz').write_bytes(
    gzip.compress(pathlib.Path('build/sc-bundle.tar').read_bytes(), 9))
print('bundle:', os.path.getsize('public/sc-bundle.tar.gz'), 'bytes')
```

### 3.2 The scipy-stub validation (this is the load-bearing claim)

`structuralcodes` 0.7.2's *entire* scipy surface **[VERIFIED by grep + runtime `sys.modules` inspection]**:

| Call site | Usage |
|---|---|
| `sections/_beam_section.py:11,1841,1851` | `from scipy.linalg import lu_factor, lu_solve` — `lu, piv = lu_factor(K); delta = lu_solve((lu,piv), r)` |
| `sections/_shell_section.py:9` | same pair |
| `codes/ec2_2004/_section_7_3_crack_control.py:9,144,499,507` | `interp1d`, `griddata` |
| `codes/ec2_2023/_section5_materials.py:7,181,322,501` | `interp1d`, `griddata` |

With real scipy, `import structuralcodes` drags in **355 scipy submodules** spanning `special`, `spatial` (qhull), `sparse`, `sparse.linalg`, `optimize`, `fft`, `constants`, `_external`. With the stub: **3 modules**.

Numerical comparison, real scipy vs stub, identical script:

| Quantity | Real scipy | Stub | Rel. diff |
|---|---|---|---|
| `m_y` @ n=0 | −227182555.99731332 | −227182555.99731332 | **0.000e+00** |
| `m_y` @ n=−500 kN | −485476015.1622042 | −485476015.1622042 | **0.000e+00** |
| moment–curvature points | 20 | 20 | identical |
| last `m_y` on M–κ curve | −227182556.69289204 | −227182556.69289204 | **0.000e+00** |
| `gross_properties.ea` | 4468920331.147285 | 4468920331.147285 | **0.000e+00** |
| N–M domain points | 35 | 35 | identical |

**Bit-identical.** Reason: `lu_factor`/`lu_solve` are used purely as a linear solve, and `np.linalg.solve` (LAPACK `gesv`, same LU with partial pivoting) reproduces it exactly here. **[VERIFIED]**

**Why not just trim the scipy wheel instead?** I measured it: the subpackages actually touched are `_lib, linalg, interpolate, sparse, spatial, special, optimize, fft, constants, _external` — a trimmed wheel is still **10.5 MB of 13.87 MB**. Only 3.4 MB saved, for a brittle artefact that breaks on every scipy bump. **Rejected.** **[VERIFIED]**

**Guard rails you must add:**
- A CI test that runs your calculation module twice — once against the stub, once against real scipy — and asserts the outputs match. If a future `structuralcodes` starts using more scipy, CI fails loudly instead of the browser silently diverging.
- `griddata` raises rather than approximating. If you later need EC2-2023 material tables or EC2-2004 §7.3 crack control, you must either implement barycentric interpolation on a Delaunay triangulation or load real scipy for that one path.

### 3.3 Runtime code — the Web Worker (Pyodide 314 needs a **module** worker)

`index.html` — start the worker immediately, do not wait for "Calculate":

```html
<link rel="modulepreload" href="./pyodide/pyodide.mjs">
<link rel="preload" href="./pyodide/pyodide.asm.wasm" as="fetch" type="application/wasm" crossorigin>
<link rel="preload" href="./pyodide/python_stdlib.zip"  as="fetch" crossorigin>
<link rel="preload" href="./sc-bundle.tar.gz"           as="fetch" crossorigin>
<script type="module">
  // MUST be {type:"module"} — Pyodide 314 is an ES module, classic workers are dead.
  const worker = new Worker('./calc-worker.mjs', { type: 'module' });
  const ready = new Promise(res => {
    worker.addEventListener('message', function onReady(e) {
      if (e.data.kind === 'ready') { worker.removeEventListener('message', onReady); res(); }
      if (e.data.kind === 'progress') setProgress(e.data.pct, e.data.text);
    });
  });
  // fires now, while the user is still typing into the form
  worker.postMessage({ kind: 'boot' });
</script>
```

`calc-worker.mjs`:

```js
import { loadPyodide } from './pyodide/pyodide.mjs';

const say = (pct, text) => self.postMessage({ kind: 'progress', pct, text });

let pyodide;
async function boot() {
  say(5, 'Laster Python-kjerne…');

  pyodide = await loadPyodide({
    indexURL: new URL('./pyodide/', import.meta.url).href,
    // Skip the pyodide-lock.json request entirely: we install nothing by name.
    // Saves one round trip + 24.7 kB. VERIFIED.
    lockFileContents: JSON.stringify({
      info: { arch: 'wasm32', platform: 'emscripten_5_0_3',
              python: '3.14.2', abi_version: '2026_0' },
      packages: {},
    }),
  });
  say(70, 'Pakker ut biblioteker…');

  const buf = await fetch(new URL('./sc-bundle.tar.gz', import.meta.url))
                      .then(r => r.arrayBuffer());
  const bytes = new Uint8Array(buf);

  // Sniff the gzip magic: if the host applied `Content-Encoding: gzip`
  // the browser already decompressed it and we have a plain tar.
  // Both branches VERIFIED to work.
  const isGz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const site = pyodide.runPython('import site; site.getsitepackages()[0]');
  pyodide.unpackArchive(bytes, isGz ? 'gztar' : 'tar', { extractDir: site });
  say(85, 'Initialiserer…');

  // Import once at boot so the first "Calculate" is instant.
  await pyodide.runPythonAsync(`
import warnings
# structuralcodes/__init__.py promotes NoConvergenceWarning to an exception;
# downgrade it so a marginally unconverged section returns a result you can inspect.
from structuralcodes.core.base import NoConvergenceWarning
warnings.filterwarnings('default', category=NoConvergenceWarning)

from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement_line
from structuralcodes.sections import BeamSection
from shapely import Polygon
  `);
  say(100, 'Klar');
  self.postMessage({ kind: 'ready' });
}

self.onmessage = async (e) => {
  if (e.data.kind === 'boot') { await boot(); return; }
  if (e.data.kind === 'calc') {
    const res = await pyodide.runPythonAsync(e.data.python);
    self.postMessage({ kind: 'result', id: e.data.id, res });
  }
};
```

> `NoConvergenceWarning`'s import path is from the earlier API research; re-check it against 0.7.2 if the import throws. **[UNVERIFIED here]**

### 3.4 Alternative (Option C): custom `pyodide-lock.json`

If you prefer wheels-on-disk over a tarball, this also works and is only 0.65 MB worse. It is the documented mechanism and survives `structuralcodes` upgrades with one `pip download`.

**Generating the lockfile.** `micropip.freeze()` is *documented* as the way to produce one, but **it crashed for me** — `micropip/package_manager.py:328 in freeze` → `importlib.metadata.from_name` → `PackageNotFoundError`, because a mock package has no discoverable dist metadata. **[VERIFIED failure]** So derive it from the stock lockfile instead (`make_lock.py`, verified):

```python
import json, hashlib, pathlib
STOCK = json.load(open('pyodide-lock.json'))       # from the pinned Pyodide release
OUT = {'info': STOCK['info'], 'packages': {}}

seen = set()
def add(n):
    if n in seen: return
    seen.add(n)
    e = dict(STOCK['packages'][n]); OUT['packages'][n] = e
    for d in e['depends']: add(d)
for n in ('numpy', 'shapely'): add(n)              # transitive deps included

whl = pathlib.Path('dist/structuralcodes-0.7.2-py3-none-any.whl')
OUT['packages']['structuralcodes'] = {
    'name': 'structuralcodes', 'version': '0.7.2',
    'file_name': whl.name,                          # resolved against the lockfile's dir
    'install_dir': 'site', 'package_type': 'package',
    'sha256': hashlib.sha256(whl.read_bytes()).hexdigest(),
    'imports': ['structuralcodes'],
    'depends': ['numpy', 'shapely'],                # scipy + triangle deliberately dropped
    'unvendored_tests': False, 'tool': {},
}
json.dump(OUT, open('dist/pyodide-lock.json', 'w'), indent=1)
```

Lockfile entry schema (from the real 314.0.7 file): `depends[]`, `file_name`, `imports[]`, `install_dir`, `name`, `package_type`, `sha256`, `tool{}`, `unvendored_tests`, `version`. `info` = `{abi_version:"2026_0", arch:"wasm32", platform:"emscripten_5_0_3", python:"3.14.2"}`. **[VERIFIED]**

Then one call loads runtime **and** all packages:

```js
const pyodide = await loadPyodide({
  indexURL:    './pyodide/',
  lockFileURL: './dist/pyodide-lock.json',  // packageBaseUrl defaults to this dir
  packages:    ['structuralcodes'],         // pulls numpy+shapely via `depends`
});
pyodide.runPython(STUBS);                   // triangle + scipy, injected into sys.modules
```

**Measured: 1270 ms for runtime + all three packages, 1758 ms total, no micropip installed at all.** **[VERIFIED]**

Note: in **Node**, `lockFileURL` is read as a *filesystem path*, not a URL (`ENOENT … \http:\localhost:8765\pyodide-lock.json`). In the browser it is a real URL. **[VERIFIED]**

### 3.5 `loadPyodide` options that matter (all from the 314 JS API docs)

| Option | Default | Why you care |
|---|---|---|
| `indexURL` | dir of `pyodide.mjs` | where `pyodide.asm.wasm` / `python_stdlib.zip` come from |
| `lockFileURL` | `${indexURL}/pyodide-lock.json` | point at your own lockfile |
| `lockFileContents` | — | **inline the lockfile → skip the request entirely** |
| `packages` | `[]` | "A list of packages to load as Pyodide is initializing" — one-shot load |
| `packageBaseUrl` | dir of lockfile | base for relative `file_name` |
| `stdLibURL` | `${indexURL}/python_stdlib.zip` | |
| `fullStdLib` | — | **Deprecated, no effect** |
| `enableRunUntilComplete` | `true` | uses JSPI/stack switching |
| `createPyodideModule` | — | "Used to work around service workers forbid dynamic `import()`" — needed if you put Pyodide *inside* a Service Worker |

`pyodide.loadPackage(names, {checkIntegrity, messageCallback, errorCallback})` — `messageCallback` gives you progress strings like `"Loading numpy, shapely, structuralcodes"`. Pass `checkIntegrity:false` when your lockfile has no `sha256` for a URL-loaded wheel. **[VERIFIED]**

### 3.6 `micropip` specifics you asked about

- **Is `micropip` still recommended?** Yes for general use, but the docs themselves say use `pyodide.loadPackage()` instead "when you are optimizing for size, do not want to install the `micropip` package, and do not need to install packages from PyPI with dependency resolution". **That is exactly us.** Dropping micropip saves `micropip` (111,109 B) + `packaging` (93,970 B) = **205 kB** plus the PyPI JSON round trips.
- **`micropip` 0.11.1**, uploaded **2026-04-02**; 0.11.2.dev in progress (docs build 2026-08-03).
- **`micropip.add_mock_package` — EXISTS. Exact signature [VERIFIED]:**
  ```python
  micropip.add_mock_package(name, version, *, modules=None, persistent=False)
  ```
  `modules` is a `dict[str, str]` of module-name → source code. Companions: `remove_mock_package(name)`, `list_mock_packages()`.
  Works (I used it for `triangle` and `scipy`), **but** it breaks `micropip.freeze()` and needs micropip loaded. The plain `sys.modules` injection in §3.3 is smaller, faster and dependency-free — prefer it.
- **`micropip.install` full signature [VERIFIED]:**
  ```python
  await micropip.install(requirements, keep_going=False, deps=True,
                         credentials=None, pre=False, index_urls=None,
                         *, constraints=None, reinstall=False, verbose=None)
  ```
- **Vendored wheel from a relative URL on the same origin:**
  ```python
  import micropip
  # relative to the document/worker base URL; deps=False because scipy+triangle are stubbed
  await micropip.install("./wheels/structuralcodes-0.7.2-py3-none-any.whl", deps=False)
  ```
  or, without micropip at all:
  ```js
  await pyodide.loadPackage("./wheels/structuralcodes-0.7.2-py3-none-any.whl",
                            { checkIntegrity: false });
  ```
  The filename **must** be a valid wheel name (I hit `InvalidWheelFilename` when I named it `sc.whl`). **[VERIFIED]**
- **Serving `.whl` as `application/octet-stream` — FINE, verified end to end.** I served the three wheels from a local HTTP server that reported `Content-Type: application/octet-stream`, loaded them with `pyodide.loadPackage([url, url, url])`, and got `m_y = -227.1826 kNm`. Pyodide reads the body as bytes and does not inspect `Content-Type`. (jsdelivr confusingly labels `.whl` as `application/wasm` and that works too.) GitHub Pages will serve `.whl` as `application/octet-stream`. **[VERIFIED]**

---

## 4. Load-time engineering, prioritised

### 4.0 Exact sizes — measured today, not estimated

**Pyodide core, jsdelivr `v314.0.7/full/`** (`Content-Length` with `Accept-Encoding: br`; all served `Cache-Control: public, max-age=31536000`, `Content-Encoding: br`):

| File | on the wire (jsdelivr, br) | raw / unpacked | self-hosted gzip -9 |
|---|---|---|---|
| `pyodide.mjs` | 7,299 | — | — |
| `pyodide.asm.mjs` | 262,041 | 1,250,344 | 260,720 |
| `pyodide.asm.wasm` | **3,438,516** | **9,598,218** | **3,542,413** |
| `python_stdlib.zip` | 2,505,313 | 2,545,637 | 2,501,808 |
| `pyodide-lock.json` | 24,708 | 119,077 | — |
| **core subtotal** | **6,213,169 (6.21 MB)** | | |

**Packages** (the wheel *is* a zip, so brotli on top buys ~1 %):

| Wheel | wire (br) | raw |
|---|---|---|
| `numpy-2.4.6` | 2,929,885 | 2,960,568 |
| **`scipy-1.18.0`** | **13,870,724** | **14,029,750** |
| `shapely-2.1.2` | 851,986 | 851,981 |
| `micropip-0.11.1` (pure py) | 111,109 | — |
| `packaging-26.1` (pure py) | 93,970 | — |
| `structuralcodes-0.7.2` (pure py, PyPI) | 208,422 | 208,422 |

**Our bundle:** `sc-bundle.tar` 16.07 MB → `.tar.gz` **3,828,840 B**; trimmed `.tar` 13.28 MB → **`.tar.gz` 3,346,915 B**. **[VERIFIED]**

**Totals:**

| Configuration | Requests | Wire |
|---|---|---|
| Naive Pyodide + micropip + scipy | 11+ (incl. PyPI JSON) | **24,303,973 B = 24.30 MB** |
| Option C: custom lockfile, no scipy | 8 | 10.21 MB |
| **Option D: RECOMMENDED** | **5** | **9,560,084 B = 9.56 MB** |

### 4.1 Is scipy avoidable / splittable? Does Pyodide ship a slimmer scipy?

- **No slimmer scipy exists.** Pyodide 314.0.7 ships exactly one `scipy` (1.18.0, bumped from 1.17.1 in 314.0.2). `libopenblas.so` (2.15 MB) is vendored inside the wheel — there is no separate `openblas` package.
- Composition (compressed, inside the wheel): `special` 2.79, `libopenblas` 2.15, `stats` 1.81, `optimize` 1.48, `spatial` 1.10, `sparse` 1.00, `linalg` 0.86, `io` 0.52, `interpolate` 0.41, `signal` 0.39 MB.
- **Splittable? Barely** — trimming to the actually-imported set still leaves ~10.5 MB (§3.2). **Avoidable? Completely** — via the stub. That is the answer.

### 4.2 CDN brotli vs self-hosting on GitHub Pages — verified, and it barely matters

| | jsdelivr | GitHub Pages |
|---|---|---|
| `.wasm` | `Content-Encoding: br` | **`Content-Encoding: gzip`** — verified on `sql.js.org` (GH Pages + custom domain): `application/wasm`, 658,410 B → **325,266 B**. GH Pages *does* gzip wasm; it does **not** do brotli |
| `.js` / `.mjs` | br | gzip — verified on your own site: `…/2dfea/assets/index-CFI0Sdmn.js`, `Content-Encoding: gzip` |
| unknown ext (`.py`, `.whl`, `.tar`) | — | `application/octet-stream` **and gzipped** — verified on `…/2dfea/python/setup_pynite_env.py` |
| `.zip` / `.whl` / `.tar.gz` | already deflate — no gain either way | no gain |
| **`Cache-Control`** | **`public, max-age=31536000`** (1 year) | **`max-age=600`** (10 min!) + weak `ETag` |

**The brotli-vs-gzip difference for our payload is ~220 kB (2 %)** — `pyodide.asm.wasm` 3,542,413 gzip vs 3,438,516 br, plus a hair on `.asm.mjs`. Not worth a CDN dependency.

**The real GitHub Pages problem is `max-age=600`.** After 10 minutes the browser re-validates all 5 URLs. With `ETag` present it gets `304`s, so no bytes move and (per V8) the wasm code cache survives, but you pay ~5 round trips of latency. **Fix: Service Worker, cache-first on version-stamped URLs.** Then warm start touches the network zero times.

> Caveat: the MDN `.wasm` examples (41 and 83 bytes) came back with **no** `Content-Encoding` — GH Pages/Fastly skips compression below a size threshold. Irrelevant for multi-MB files. Whether Fastly compresses a **13 MB** `.tar` on the fly is **[UNVERIFIED]** — which is exactly why §3.3 sniffs the gzip magic bytes and handles both cases. Ship `.tar.gz` and you never depend on it.

### 4.3 Warm-start strategy

1. **Boot on page load, not on "Calculate."** Post `{kind:'boot'}` from the inline module script. The user spends 10–30 s on the form; you get the whole cold start for free. **Highest-value change in this document.**
2. **Service Worker + Cache API precache.** Cache-first for the 5 version-stamped URLs; bump the cache name when you bump the Pyodide version.

```js
// sw.js
const V = 'py-314.0.7-sc-0.7.2';                 // bump to invalidate
const ASSETS = [
  './pyodide/pyodide.mjs', './pyodide/pyodide.asm.mjs',
  './pyodide/pyodide.asm.wasm', './pyodide/python_stdlib.zip',
  './sc-bundle.tar.gz',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (!/pyodide\/|sc-bundle/.test(u.pathname)) return;
  e.respondWith(caches.open(V).then(async c =>
    (await c.match(e.request)) || fetch(e.request).then(r => (c.put(e.request, r.clone()), r))));
});
```

Note the Pyodide doc warning: service workers forbid dynamic `import()`, so if you ever run Pyodide *inside* the SW you need `createPyodideModule`. Here the SW is only a cache — no issue.

3. **`<link rel="modulepreload">` for `pyodide.mjs`** and `rel="preload" as="fetch"` for the wasm / stdlib / bundle. This overlaps the three big fetches with worker startup instead of serialising them. Worth roughly one RTT plus the serialisation gap; modest but free.
4. **jsdelivr's 1-year `Cache-Control`** is genuinely better than GH Pages' 600 s *if you skip the Service Worker*. With the SW, self-hosting wins on every other axis.

### 4.4 WebAssembly compilation caching — this is important and half-good for us

From V8's own documentation:

- Caching is implemented **only** for `compileStreaming` / `instantiateStreaming`: *"For now, WebAssembly caching is only implemented for the streaming API calls, `compileStreaming` and `instantiateStreaming`."* ArrayBuffer-based `compile`/`instantiate` get **nothing**.
- Cache key is the URL: *"Cached compiled code is associated with the URL of the `.wasm` resource."*
- Size floor: *"the cutoff is for `.wasm` resources of 128 kB or more."*
- Invalidated when the server answers `200` instead of `304`, and on every V8 update (*"expected to happen at least every 6 weeks"*).
- *"WebAssembly code caching is enabled for workers and service workers."*

**What Pyodide 314.0.7 actually does — I grepped `pyodide.asm.mjs`:**

```js
var response = fetch(binaryFile, {credentials:"same-origin"});
var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
```

✅ The **9.6 MB main module is `instantiateStreaming`** → far above 128 kB → **Chrome code-caches it.** Keep the URL version-stamped and stable and warm starts skip TurboFan entirely.

❌ But the `.so` files inside `numpy` / `shapely` wheels go through `loadWebAssemblyModule(binary, …)` → `new WebAssembly.Module(binary)` from an ArrayBuffer → **never code-cached.** Their compile cost is paid on **every single load, warm or cold.**

**Consequence:** warm start has a hard floor of roughly the dylib-compile + Python-import time — about **0.5–0.7 s measured** for numpy + shapely + structuralcodes. And it is a second, independent reason the scipy stub matters: real scipy's `dlopen` storm cost **1119 ms on every load**, forever, uncacheable. **[VERIFIED by grep + measurement]**

Firefox has historically lagged on wasm code caching; Safari's behaviour is **[UNVERIFIED]**. Whether cross-origin (jsdelivr) responses are code-cached is **[UNVERIFIED]** — another small point for self-hosting.

### 4.5 Does JSPI / stack switching help startup?

**No.** Chrome 137+ (2025-05-27) and Firefox 153 (2026-07-21) ship JSPI; Safari has dropped its objection but has not shipped (it is an Interop 2026 item). Pyodide uses it for `loop.run_until_complete` correctness. 314.0.0 fixed a stack-memory leak in it. **Budget zero startup saving.**

### 4.6 Prioritised optimisation list

| # | Optimisation | Saving | Status |
|---|---|---|---|
| **P0** | **Stub `scipy`** (15 lines, numpy-backed) | **−13.87 MB wire, −2176 ms CPU *per load*** | **[VERIFIED bit-identical]** |
| **P0** | **Boot the worker on page load, parallel to form entry** | hides ~100 % of perceived cold start | architectural |
| **P1** | **Single `.tar.gz` + `unpackArchive`**, drop micropip + packaging + lockfile fetch | −205 kB, −6 requests, −~250 ms | **[VERIFIED]** |
| **P1** | **Service Worker cache-first precache** | warm start → 0 network requests; defeats GH Pages `max-age=600` | **[NOT BROWSER-TESTED]** |
| P2 | Stub `triangle` | mandatory — no wheel exists anywhere | **[VERIFIED]** |
| P2 | Trim bundle (`.pyi`, `.h`, `.pxd`, `.c`, `.a`, `f2py`, `testing`, `include`, `doc`) | 3.83 → **3.35 MB** (−482 kB) | **[VERIFIED, result unchanged]** |
| P2 | `lockFileContents` inline instead of `lockFileURL` | −1 request, −24.7 kB | **[VERIFIED]** |
| P3 | `modulepreload` + `preload` hints | ~1 RTT + de-serialisation | standard |
| P3 | Version-stamped, stable URLs (for the wasm code cache) | warm-start TurboFan skip on the 9.6 MB module | **[VERIFIED mechanism]** |
| P4 | jsdelivr instead of self-host | −220 kB (2 %) but +1 origin, worse SW story | **[VERIFIED]** — **not recommended** |
| — | `pyodide-pack` | unreleased, README targets 0.24 | **rejected** |
| — | Trimmed scipy wheel | only −3.4 MB of 13.87, brittle | **rejected** |
| — | JSPI | zero | **no effect** |

### 4.7 Realistic numbers to promise

Measured CPU (Node 24 / V8, no network): **1705 ms** for boot + unpack + import + first ULS calculation. Browsers differ by maybe ±30 % and overlap download with streaming compile. **[NOT BROWSER-TESTED]**

**Recommended configuration — 9.56 MB, 5 requests:**

| Link | Download | + CPU | **Cold (first visit)** | **Warm (repeat, with SW)** |
|---|---|---|---|---|
| 100 Mbit/s | ~0.8 s | 1.7 s | **~2.5 s** | **~1.0–1.4 s** |
| 25 Mbit/s | ~3.1 s | 1.7 s | **~4.5 s** | **~1.0–1.4 s** |
| 10 Mbit/s (4G) | ~7.6 s | 1.7 s | **~9 s** | **~1.0–1.4 s** |

**Naive configuration — 24.30 MB with real scipy:**

| Link | **Cold** | **Warm** |
|---|---|---|
| 100 Mbit/s | ~6 s | ~3.5 s |
| 25 Mbit/s | ~12 s | ~3.5 s |
| 10 Mbit/s | **~24 s** | ~3.5 s |

Warm start cannot go below ~1 s because numpy/shapely `.so` compilation is never code-cached (§4.4).

**What to say in the UI:** a determinate progress bar driven by the `progress` messages in §3.3 (5 % → 70 % → 85 % → 100 %). Because boot starts on page load, by the time the user presses Calculate the bar is almost always already at 100 % and the calculation itself is **~50 ms**. **[VERIFIED: 54 ms for `calculate_bending_strength`]**

---

## 5. Things to watch

- **Pyodide 314 killed classic workers.** `new Worker(url, {type:"module"})` is mandatory. Your existing `2dfea/public/workers/solverWorker.js` is presumably a classic worker on an older Pyodide — do not assume you can copy its pattern.
- **Pin the version.** `abi_version: "2026_0"`, `platform: "emscripten_5_0_3"`, `python: "3.14.2"`. Wheels from `v314.0.7/full/` only work with that runtime. Never point at `/dev/full/`.
- **`triangle` has no cp314 wheels at all** (latest release 20250106, cp37–cp313). Even a native build would need porting. The stub is not a shortcut — it is the only option.
- **`structuralcodes` 0.7.2 was published 2026-09-15** (yesterday). Fast-moving upstream: pin the version and keep the stub-vs-real-scipy CI test.
- `GenericSection` is deprecated in favour of `BeamSection`; `ConcreteEC2_2004` takes `fck` as a **float**, not `'C30/37'`; axial `n` is **positive in tension**, so a normally-reinforced beam returns **negative `m_y`** (hence −227.18 kNm above). From the earlier API research.

---

## 6. The honest alternative (not needed, but for the record)

Cold start lands at ~2.5–4.5 s on any reasonable connection, so the Python route does not need rescuing. If it ever did — say you later need real scipy for EC2-2023 material tables and the payload goes back to 24 MB — the fallback that preserves the "just upgrade `structuralcodes` later" wish is a **two-engine split, not a rewrite**: keep the Pyodide worker as the single authoritative, validated engine that produces every number that appears in a report or gets stamped on a drawing, and add a small JS approximation used *only* for interactive feedback while the user drags a bar or scrubs a slider — a rectangular-stress-block moment capacity is a few dozen lines and runs in microseconds. The JS path never writes a result the user can export; every committed value is recomputed in Python and the UI marks the two states differently (e.g. a "preliminary" badge until the worker confirms). Combined with lazy-loading — boot the worker on first interaction with the calculation panel rather than on page load — this keeps the page instantly responsive while the real engine warms up behind it, and when `structuralcodes` gains a feature you delete approximations rather than port them. The rule that makes this safe: **the JS engine may only ever be optimistic-display; Python owns truth.**

---

## 7. Sources

**Pyodide**
- Changelog (latest stable **314.0.7, 2026-09-14**; full 2025–26 release dates) — https://pyodide.org/en/stable/project/changelog.html
- Pyodide 314.0 release blog, **2026-06-09** (Py 3.14.2, Emscripten 5.0.3, `pyemscripten_2026_0`, ES-module workers, re-vendored stdlib) — https://blog.pyodide.org/posts/314-release/
- Downloading and deploying (full dist "200+ megabytes", `pyodide-core`, minimum file set, jsdelivr index URLs) — https://pyodide.org/en/stable/usage/downloading-and-deploying.html
- Loading packages (`loadPackage` vs `micropip`; "when you are optimizing for size…") — https://pyodide.org/en/stable/usage/loading-packages.html
- JavaScript API (`lockFileURL`, `lockFileContents`, `packages`, `packageBaseUrl`, `fullStdLib` deprecated, `createPyodideModule`, `unpackArchive`) — https://pyodide.org/en/stable/usage/api/js-api.html
- Web worker usage (`{type:"module"}`) — https://pyodide.org/en/stable/usage/webworker.html
- Service worker usage — https://pyodide.org/en/stable/usage/service-worker.html
- Roadmap (**stale** — still quotes "6.4 MB download, 4 to 5 seconds"; 3–5× slower than native) — https://pyodide.org/en/stable/project/roadmap.html
- `pyodide-pack` (48 stars, 87 commits, **no releases**, last commit **2026-07-07**, README targets 0.24.0+) — https://github.com/pyodide/pyodide-pack
- `pyodide-lock` tooling — https://github.com/pyodide/pyodide-lock
- Live lockfile `v314.0.7/full/pyodide-lock.json` — 357 packages; `scipy` depends only on `numpy`; no `triangle`, no `openblas` — https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json

**micropip**
- API reference (`add_mock_package(name, version, *, modules=None, persistent=False)`, `install(...)`, `freeze`) — https://micropip.pyodide.org/en/stable/project/api.html
- Basic usage — https://micropip.pyodide.org/en/stable/project/usage.html
- PyPI: **0.11.1, uploaded 2026-04-02** — https://pypi.org/pypi/micropip/json

**PEP 783 / packaging**
- "PEP 783 – Emscripten Packaging is accepted" — https://discuss.python.org/t/pep-783-emscripten-packaging-is-accepted/107393
- PEP 783 text — https://peps.python.org/pep-0783/
- Building Emscripten wheels for Pyodide and PyPI (pydantic) — https://pydantic.dev/articles/emscripten-wheels-pydantic

**CPython WASI**
- Brett Cannon, "State of WASI support for CPython: March 2026", **2026-03-02** — PEP 816 accepted for 3.15; wheel platform tags still upcoming; no package ecosystem — https://snarky.ca/state-of-wasi-support-for-cpython-march-2026/
- "PEP 816: How Python is getting serious about Wasm", InfoWorld — https://www.infoworld.com/article/4150052/how-python-is-getting-serious-about-wasm.html

**MicroPython / PyScript**
- PyScript workers docs (Pyodide "circa 11Mb and slow to start up"; MicroPython "base 303Kb", ulab not numpy) — https://docs.pyscript.net/2026.2.1/user-guide/workers/
- PyScript 2026.3.1 release — https://newreleases.io/project/github/pyscript/pyscript/release/2026.3.1
- PyScript MicroPython runtimes (`micropython-ulab.wasm`) — https://pyscript.net/tech-preview/micropython/about.html

**emscripten-forge**
- Homepage — https://emscripten-forge.org/
- Installing packages (`micromamba --platform=emscripten-wasm32 -c https://repo.prefix.dev/emscripten-forge-4x`) — https://emscripten-forge.org/usage/installing_packages/
- Channel listing (`emscripten-forge-4x`, "packages built with Emscripten v4", 852 packages) — https://prefix.dev/channels/emscripten-forge-4x
- Repodata parsed today: `emscripten-forge-dev/emscripten-wasm32` (340 pkgs; py 3.13.1, numpy 2.4.4, scipy 1.17.1, shapely 2.1.2, geos 3.14.1, xeus-python 0.17.8) and `emscripten-forge-4x/emscripten-wasm32` (823 pkgs; py 3.14.3, numpy 2.5.3, scipy 1.18.0, shapely 2.1.2, geos 3.15.0, xeus-python 0.19.0) — **`triangle`, `cgal`, `meshpy`, `gmsh` absent from both** — https://repo.prefix.dev/emscripten-forge-4x/emscripten-wasm32/repodata.json

**WebAssembly caching / JSPI**
- V8, "Code caching for WebAssembly developers" (streaming-only, URL key, 128 kB cutoff, 304-vs-200 invalidation, enabled in workers/service workers) — https://v8.dev/blog/wasm-code-caching
- V8, "Introducing the WebAssembly JavaScript Promise Integration API" — https://v8.dev/blog/jspi
- Chrome JSPI origin trial / ship — https://developer.chrome.com/blog/webassembly-jspi-origin-trial
- Interop 2026 JSPI item — https://github.com/web-platform-tests/interop/issues/1093
- "The State of WebAssembly – 2025 and 2026" (Chrome 137 2025-05-27; Firefox 153 2026-07-21; Safari pending) — https://platform.uno/blog/the-state-of-webassembly-2025-2026/
- WebKit, "Announcing Interop 2026" — https://webkit.org/blog/17818/announcing-interop-2026/

**PyPI metadata (fetched today)**
- `structuralcodes` **0.7.2, uploaded 2026-09-15**, `py3-none-any`, 208,422 B, requires `numpy>=1.20.0, scipy>=1.6.0, shapely>=2.0.2, triangle>=20230923`, `python>=3.10` — https://pypi.org/pypi/structuralcodes/json
- `triangle` **20250106, uploaded 2025-01-07** — cp37–cp313 only, macOS/manylinux/Windows only, **no cp314, no emscripten** — https://pypi.org/pypi/triangle/json

**HTTP headers measured today (2026-09-16)**
- jsdelivr `v314.0.7/full/*`: `Content-Encoding: br`, `Cache-Control: public, max-age=31536000`
- GitHub Pages `magnusfjeldolsen.github.io/structural_tools/…`: `Content-Encoding: gzip` on `.js` and on `.py` (`application/octet-stream`); `Cache-Control: max-age=600`; weak `ETag`
- GitHub Pages `.wasm` gzip proof — `https://sql.js.org/dist/sql-wasm.wasm` (sql.js GH Pages, custom domain): `Content-Type: application/wasm`, `Content-Encoding: gzip`, 658,410 → 325,266 B
- MDN `.wasm` examples (41 / 83 B) return **no** `Content-Encoding` → sub-threshold files are not compressed
