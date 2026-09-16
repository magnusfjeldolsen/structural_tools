"""wasm_stubs.py — erstatter `triangle` og `scipy` med noe som får plass i nettleseren.

HVORFOR DETTE IKKE ER EN SNARVEI
`structuralcodes` importerer `triangle` på toppnivå i `geometry/_geometry.py` og i
`sections/section_integrators/_fiber_integrator.py`. Begge nås fra pakkens `__init__`, så
et bart `import structuralcodes` feiler uten modulen. `triangle` er en C-utvidelse rundt
Shewchuks Triangle, det finnes ingen emscripten-hjul noe sted, og PyPIs nyeste utgave
(20250106) har ikke engang cp314-hjul. Stubben er ikke en forenkling — den er eneste
mulighet. Marin-integratoren, som er den vi bruker, rører aldri `triangle`.

`scipy` er en annen historie: den FINNES i Pyodide, men koster 13,9 MB over nettet og
2 176 ms CPU per last (utpakking + `dlopen`), kald som varm, fordi `.so`-filer aldri havner
i nettleserens wasm-kodecache. Og `structuralcodes` 0.7.2 bruker nøyaktig tre funksjoner av
den: `lu_factor`/`lu_solve` (alltid som par, ett lineært løs) og `interp1d`/`griddata` (kun
i SLS-rissvidde og i EC2-2023 sine materialtabeller — begge utenfor modulens omfang).
`np.linalg.solve` er LAPACK `gesv`, samme LU med delvis pivotering, og reproduserer
`lu_factor`/`lu_solve` bit-identisk på hele ULS-veien.

HVORFOR `griddata` KASTER I STEDET FOR Å TILNÆRME
Et høylytt unntak slår et stille galt tall. Havner vi noen gang der, skal det være
umulig å overse, ikke en verdi som ser plausibel ut i en rapport.

HVORFOR IKKE `micropip.add_mock_package`
Den krever at `micropip` lastes (111 kB + `packaging` 94 kB) for noe vi ikke trenger
avhengighetsoppløsning til, og den ødelegger `micropip.freeze()`. Ren `sys.modules`-
injeksjon er mindre, raskere og virker likt på skrivebordet og i nettleseren — og at det er
NØYAKTIG SAMME FIL begge steder er hele poenget: `tests/python/test_stub_equivalence.py`
tester det som faktisk kjører i nettleseren, ikke en kopi av det.
"""

from __future__ import annotations

import sys
import types

# Markøren motoren leser for å sette `meta.scipy` i resultatet. Rapporten skal kunne
# opplyse at scipy er erstattet — brukeren skal aldri måtte gjette hva som regnet tallet.
STUB_MARKER = '__csc_stub__'

# Versjonsstrengene speiler det Pyodide/PyPI ville gitt, slik at kode som leser
# `scipy.__version__` for logging ikke må særbehandles.
TRIANGLE_VERSION = '20250106'
SCIPY_VERSION = '1.18.0'


def _make_triangle() -> types.ModuleType:
    """`triangle` som en modul som importerer, men aldri lyver om å kunne triangulere."""
    mod = types.ModuleType('triangle')
    mod.__version__ = TRIANGLE_VERSION
    setattr(mod, STUB_MARKER, True)

    def triangulate(*_args, **_kwargs):
        raise NotImplementedError(
            'triangle.triangulate is not available in this build. '
            "Use integrator='marin' and avoid SurfaceGeometry.random_points_within() "
            'and result.create_detailed_result().'
        )

    mod.triangulate = triangulate
    return mod


def _make_scipy_linalg() -> types.ModuleType:
    """`lu_factor`/`lu_solve` brukes utelukkende som ett lineært løs.

    `structuralcodes` gjør `lu, piv = lu_factor(K)` og rett etterpå
    `delta = lu_solve((lu, piv), r)` (sections/_beam_section.py:1841,1851 og
    _shell_section.py). Faktoriseringen gjenbrukes aldri, så vi kan bære matrisen
    uendret gjennom paret og la `np.linalg.solve` gjøre jobben.
    """
    import numpy as np

    mod = types.ModuleType('scipy.linalg')
    mod.__version__ = SCIPY_VERSION
    setattr(mod, STUB_MARKER, True)

    def lu_factor(a, **_kwargs):
        return (np.array(a, dtype=float), None)

    def lu_solve(lu_and_piv, b, **_kwargs):
        return np.linalg.solve(lu_and_piv[0], b)

    mod.lu_factor = lu_factor
    mod.lu_solve = lu_solve
    return mod


def _make_scipy_interpolate() -> types.ModuleType:
    """Bare SLS-veier havner her, og de er utenfor omfang — derfor kaster `griddata`."""
    import numpy as np

    mod = types.ModuleType('scipy.interpolate')
    mod.__version__ = SCIPY_VERSION
    setattr(mod, STUB_MARKER, True)

    def interp1d(x, y, **_kwargs):
        # Lineær interpolasjon er nøyaktig det de to kallstedene ber om
        # (ec2_2004 §7.3 og ec2_2023 §5), så denne er trygg å beholde.
        xs = np.asarray(x, dtype=float)
        ys = np.asarray(y, dtype=float)
        return lambda xn: np.interp(xn, xs, ys)

    def griddata(*_args, **_kwargs):
        raise NotImplementedError(
            'scipy.interpolate.griddata is not available in this build. '
            'It is only reached by SLS crack control (EC2 2004 §7.3) and the '
            'EC2 2023 material tables, both outside the scope of this module.'
        )

    mod.interp1d = interp1d
    mod.griddata = griddata
    return mod


def install_stubs() -> dict:
    """Legger `triangle` og `scipy` i `sys.modules`. Må kalles FØR `import structuralcodes`.

    Idempotent, og med vilje overstyrende: kalles den i en prosess som allerede har ekte
    scipy, skal stubben vinne. Det er det som gjør at ekvivalenstesten kan kjøre begge
    variantene i hver sin underprosess med samme fil.

    Returnerer navnene som ble injisert, slik at et kall kan logges uten å gjette.
    """
    triangle_mod = _make_triangle()
    linalg = _make_scipy_linalg()
    interpolate = _make_scipy_interpolate()

    scipy_mod = types.ModuleType('scipy')
    scipy_mod.__version__ = SCIPY_VERSION
    # `scipy` må se ut som en pakke, ellers feiler `import scipy.interpolate` med
    # ModuleNotFoundError selv om undermodulen ligger i sys.modules.
    scipy_mod.__path__ = []
    setattr(scipy_mod, STUB_MARKER, True)
    scipy_mod.linalg = linalg
    scipy_mod.interpolate = interpolate

    sys.modules['triangle'] = triangle_mod
    sys.modules['scipy'] = scipy_mod
    sys.modules['scipy.linalg'] = linalg
    sys.modules['scipy.interpolate'] = interpolate

    return {
        'triangle': TRIANGLE_VERSION,
        'scipy': SCIPY_VERSION,
        'modules': ['triangle', 'scipy', 'scipy.linalg', 'scipy.interpolate'],
    }


def stubs_installed() -> bool:
    """True når scipy i denne prosessen er vår erstatning, ikke den ekte pakka."""
    return getattr(sys.modules.get('scipy'), STUB_MARKER, False) is True
