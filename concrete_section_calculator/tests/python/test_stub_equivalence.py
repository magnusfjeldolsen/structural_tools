"""test_stub_equivalence.py — den viktigste testen i modulen.

HVA SOM STÅR PÅ SPILL
Nettleseren kjører ALDRI ekte scipy. `python/wasm_stubs.py` erstatter den med fire linjer
numpy, fordi ekte scipy koster 13,9 MB over nettet og 2 176 ms CPU per last for tre
funksjoner. Den byttehandelen er bare forsvarlig så lenge tallene er identiske — og «så
lenge» er ikke noe man tar for gitt om en pakke man ikke eier.

Derfor gjør denne fila to ting:

1. Kjører referansetilfellet i TO underprosesser, én med ekte scipy og én med
   `install_stubs()`, og krever bit-identiske tall. Underprosesser fordi `scipy` bare kan
   importeres én gang per prosess: en test som byttet dem ut i samme prosess ville testet
   importrekkefølge, ikke ekvivalens.

2. Gransker den INSTALLERTE `structuralcodes` for scipy-importer og feiler hvis settet
   avviker fra de fire kjente stedene. Det er vakthunden: begynner en framtidig utgave å
   bruke mer av scipy, oppdages det høylytt her i stedet for stille i nettleseren, der en
   `AttributeError` på en stub enten krasjer beregningen eller — verre — treffer en
   kodevei ingen tester.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2]
PYTHON_DIR = MODULE_DIR / 'python'
FIXTURES = MODULE_DIR / 'tests' / 'fixtures'

# De fire stedene `structuralcodes` 0.7.2 rører scipy, som verifisert mot installert pakke.
# Nøkkel er sti relativt til pakkerota; verdi er importlinja slik den står.
EXPECTED_SCIPY_IMPORTS = {
    'codes/ec2_2004/_section_7_3_crack_control.py': 'import scipy.interpolate',
    'codes/ec2_2023/_section5_materials.py': 'import scipy.interpolate',
    'sections/_beam_section.py': 'from scipy.linalg import lu_factor, lu_solve',
    'sections/_shell_section.py': 'from scipy.linalg import lu_factor, lu_solve',
}

# `triangle` importeres på toppnivå to steder, begge nådd fra pakkens __init__. Dukker det
# opp et tredje, må stubben kanskje kunne mer enn å kaste.
EXPECTED_TRIANGLE_IMPORTS = {
    'geometry/_geometry.py': 'import triangle',
    'sections/section_integrators/_fiber_integrator.py': 'import triangle',
}


# ------------------------------------------------------------------ #
# 1. Numerisk ekvivalens, ekte scipy mot stub
# ------------------------------------------------------------------ #

DRIVER = r'''
import json, sys
sys.path.insert(0, {python_dir!r})

USE_STUBS = {use_stubs!r}
if USE_STUBS:
    import wasm_stubs
    wasm_stubs.install_stubs()

import engine

payload = json.loads(open({payload!r}, encoding='utf-8').read())
out = {{}}

# Bøyekapasitet ved n = 0 og n = -500 kN: to helt ulike tøyningsfelt, og det er
# `calculate_strain_profile`-veien med lu_factor/lu_solve som er den vi erstatter.
for n in (0.0, -500000.0):
    p = json.loads(json.dumps(payload))
    p['loads']['N_Ed'] = n
    r = engine.run(p)
    assert r['ok'], r
    out['bending_%d' % n] = [
        r['bending']['M_Rd'], r['bending']['eps_a'], r['bending']['chi_y'],
        r['bending']['x'], r['bending']['eps_s_max'],
    ]

p = json.loads(json.dumps(payload))
p['analysis'] = 'moment_curvature'
r = engine.run(p)
out['mc_kappa'] = r['moment_curvature']['kappa']
out['mc_moment'] = r['moment_curvature']['moment']
out['mc_plan'] = r['moment_curvature']['chi_plan']

p = json.loads(json.dumps(payload))
p['analysis'] = 'nm_domain'
r = engine.run(p)
out['dom_n'] = r['nm_domain']['n']
out['dom_m'] = r['nm_domain']['m']
out['dom_field'] = r['nm_domain']['field_num']

out['n_min'] = r['section_props']['n_min']
out['n_max'] = r['section_props']['n_max']
out['ea'] = float(engine._PREPARED['bundle']['section'].gross_properties.ea)
out['scipy'] = r['meta']['scipy']
out['scipy_modules'] = sorted(m for m in sys.modules if m == 'scipy' or m.startswith('scipy.'))

sys.stdout.write(json.dumps(out))
'''


def _run_driver(use_stubs):
    payload = FIXTURES / 'payload-beam-300x600.json'
    source = DRIVER.format(
        python_dir=str(PYTHON_DIR),
        use_stubs=use_stubs,
        payload=str(payload),
    )
    proc = subprocess.run(
        [sys.executable, '-c', source],
        capture_output=True,
        text=True,
        encoding='utf-8',
        timeout=600,
    )
    assert proc.returncode == 0, f'driver failed (use_stubs={use_stubs}):\n{proc.stderr}'
    return json.loads(proc.stdout)


@pytest.fixture(scope='module')
def runs():
    return {'real': _run_driver(False), 'stub': _run_driver(True)}


def test_the_two_runs_really_are_different_environments(runs):
    """Uten denne ville testen kunne bestå ved å sammenligne to like oppsett."""
    assert runs['real']['scipy'] == 'real'
    assert runs['stub']['scipy'] == 'stub'
    # Ekte scipy drar inn hundrevis av undermoduler; stubben nøyaktig tre.
    assert runs['stub']['scipy_modules'] == ['scipy', 'scipy.interpolate', 'scipy.linalg']
    assert len(runs['real']['scipy_modules']) > 50, runs['real']['scipy_modules']


@pytest.mark.parametrize('key', [
    'bending_0', 'bending_-500000',
    'mc_kappa', 'mc_moment', 'mc_plan',
    'dom_n', 'dom_m', 'dom_field',
    'n_min', 'n_max', 'ea',
])
def test_stub_is_bit_identical_to_real_scipy(runs, key):
    """`repr`-nøyaktig likhet, ikke «nær nok».

    `lu_factor`/`lu_solve` brukes utelukkende som ett lineært løs, og `np.linalg.solve`
    er LAPACK `gesv` — samme LU med delvis pivotering. Reproduksjonen er eksakt, så
    enhver toleranse her ville bare skjult den dagen den slutter å være det.
    """
    real = runs['real'][key]
    stub = runs['stub'][key]
    assert json.dumps(stub) == json.dumps(real), f'{key}: {stub!r} != {real!r}'


def test_reference_moment_still_holds_in_both(runs):
    """Regresjonsgrunnlaget fra §3.6, oppgitt der med to desimaler."""
    import math

    for flavour in ('real', 'stub'):
        # Fortegnet snudde i endringsrunde 4: vi bruker structuralcodes sin egen
        # konvensjon, der feltmoment er NEGATIVT. Absoluttverdien er uendret, og
        # det er den som er regresjonsgrunnlaget — denne testen handler om at
        # scipy-stubben gir samme tall som ekte scipy, ikke om fortegn.
        assert math.isclose(
            abs(runs[flavour]['bending_0'][0]), 215006759.19, rel_tol=1e-6
        ), flavour


# ------------------------------------------------------------------ #
# 2. Vakthunden: har structuralcodes begynt å bruke mer scipy?
# ------------------------------------------------------------------ #

def _import_sites(package_dir, module_name):
    """Alle toppnivå-importer av `module_name`, som {relativ sti: importlinje}."""
    sites = {}
    for path in sorted(package_dir.rglob('*.py')):
        rel = path.relative_to(package_dir).as_posix()
        for line in path.read_text(encoding='utf-8').splitlines():
            stripped = line.strip()
            if stripped.startswith(f'import {module_name}') or \
                    stripped.startswith(f'from {module_name}'):
                sites[rel] = stripped
                break
    return sites


@pytest.fixture(scope='module')
def package_dir():
    import structuralcodes
    return pathlib.Path(structuralcodes.__file__).parent


def test_scipy_import_sites_are_unchanged(package_dir):
    """Endres dette settet, må stubben revurderes FØR modulen deployes."""
    found = _import_sites(package_dir, 'scipy')
    assert found == EXPECTED_SCIPY_IMPORTS, (
        'scipy-bruken i structuralcodes har endret seg. '
        f'Nytt: {sorted(set(found) - set(EXPECTED_SCIPY_IMPORTS))}. '
        f'Borte: {sorted(set(EXPECTED_SCIPY_IMPORTS) - set(found))}. '
        'Gå gjennom python/wasm_stubs.py før modulen slippes videre.'
    )


def test_triangle_import_sites_are_unchanged(package_dir):
    found = _import_sites(package_dir, 'triangle')
    assert found == EXPECTED_TRIANGLE_IMPORTS, (
        'triangle-bruken i structuralcodes har endret seg — sjekk at marin-veien '
        'fremdeles klarer seg med en stub som bare kaster.'
    )


def test_only_lu_and_interpolate_are_actually_called(package_dir):
    """Stubben implementerer fire navn. Brukes et femte, må vi vite det.

    Grepen er tekstlig og dermed grov, men den er også umulig å omgå ved uhell: enhver
    ny `scipy.<noe>`-referanse i pakka dukker opp her.
    """
    allowed = {'scipy.interpolate', 'scipy.linalg', 'scipy.interpolate.interp1d',
               'scipy.interpolate.griddata'}
    seen = set()
    for path in sorted(package_dir.rglob('*.py')):
        for line in path.read_text(encoding='utf-8').splitlines():
            stripped = line.strip()
            if 'scipy' not in stripped:
                continue
            for token in ('scipy.interpolate.interp1d', 'scipy.interpolate.griddata',
                          'scipy.interpolate', 'scipy.linalg'):
                if token in stripped:
                    seen.add(token)
                    break
            else:
                pytest.fail(f'ukjent scipy-bruk i {path.name}: {stripped}')
    assert seen <= allowed


def test_stub_griddata_raises_instead_of_approximating():
    """Høylytt svikt slår et stille galt tall — dette er et bevisst valg, ikke en mangel."""
    sys.path.insert(0, str(PYTHON_DIR))
    import wasm_stubs

    interpolate = wasm_stubs._make_scipy_interpolate()
    with pytest.raises(NotImplementedError):
        interpolate.griddata([(0, 0), (1, 0), (0, 1)], [1, 2, 3], (0.5, 0.5))
    # `interp1d` er lineær interpolasjon og er trygg å beholde.
    assert abs(float(interpolate.interp1d((300, 800), (1, 0.65))(550)) - 0.825) < 1e-12

    triangle = wasm_stubs._make_triangle()
    with pytest.raises(NotImplementedError):
        triangle.triangulate({'vertices': []}, 'p')


def test_install_stubs_is_importable_and_idempotent_on_desktop():
    """Samme fil kjører i nettleseren og her — det er hele poenget med testen over."""
    sys.path.insert(0, str(PYTHON_DIR))
    import wasm_stubs

    assert 'micropip' not in wasm_stubs.__dict__
    source = (PYTHON_DIR / 'wasm_stubs.py').read_text(encoding='utf-8')
    assert 'add_mock_package' not in source.replace('# ', '').split('"""')[-1]
    # Kalles i en UNDERPROSESS, ellers ville den revet scipy vekk under resten av testene.
    proc = subprocess.run(
        [sys.executable, '-c',
         f'import sys; sys.path.insert(0, {str(PYTHON_DIR)!r});'
         'import wasm_stubs;'
         'a = wasm_stubs.install_stubs(); b = wasm_stubs.install_stubs();'
         'assert a == b and wasm_stubs.stubs_installed();'
         'import structuralcodes; print(structuralcodes.__version__)'],
        capture_output=True, text=True, encoding='utf-8', timeout=300,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == '0.7.2'
