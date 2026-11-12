"""CI-proeve for #87 (flettes aldri): hvilken del av endringen flytter N-M-tallene?

Kopierer modulen til /tmp/<variant>, lapper engine.py, og kjoerer fixturgeneratoren
--check i en ny prosess for hver variant.
"""
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path('concrete_section_calculator')
MASTER_ENGINE = subprocess.run(['git', 'show', 'origin/master:concrete_section_calculator/python/engine.py'],
                               capture_output=True, text=True, check=True).stdout
BRANCH_ENGINE = (SRC / 'python' / 'engine.py').read_text(encoding='utf-8')
IMPORT = 'from csc_polygon import PolygonError, is_polygon, validated_polygon  # noqa: E402\n'


def variant(name, engine_text, extra=None):
    dst = Path('/tmp') / name / 'concrete_section_calculator'
    if dst.parent.exists():
        shutil.rmtree(dst.parent)
    shutil.copytree(SRC, dst)
    (dst / 'python' / 'engine.py').write_text(engine_text, encoding='utf-8')
    if extra:
        extra(dst)
    r = subprocess.run([sys.executable, str(dst / 'docs' / 'fixture-generator.py'), '--check'],
                       capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip().splitlines()
    print(f'== {name}: exit {r.returncode}')
    for line in out[:6]:
        print('   ', line[:200])


print(subprocess.run('lscpu | grep -E "Model name|Flags" | cut -c1-400', shell=True,
                     capture_output=True, text=True).stdout)
subprocess.run([sys.executable, '-c', 'import numpy; numpy.show_runtime()'])
# F: HELE master-modulen, uendret, i samme jobb.
subprocess.run('rm -rf /tmp/F_master_pure && mkdir -p /tmp/F_master_pure && '
               'git archive origin/master concrete_section_calculator | tar -x -C /tmp/F_master_pure',
               shell=True, check=True)
r = subprocess.run([sys.executable, '/tmp/F_master_pure/concrete_section_calculator/docs/fixture-generator.py',
                    '--check'], capture_output=True, text=True)
print('== F_master_pure: exit', r.returncode)
print('   ', (r.stdout + r.stderr).strip()[:600])

variant('A_branch', BRANCH_ENGINE)
variant('C_master_engine', MASTER_ENGINE)
variant('E_master_engine_plus_import',
        MASTER_ENGINE.replace('from csc_common import (', IMPORT + '\nfrom csc_common import (', 1))
lazy = BRANCH_ENGINE.replace(IMPORT, (
    'class PolygonError(ValueError):\n    pass\n\n\ndef is_polygon(sec):\n    return False\n\n\n'
    'def validated_polygon(sec):\n    raise PolygonError("x")\n\n\n'))
variant('B_branch_without_csc_polygon_import', lazy)
build_master = BRANCH_ENGINE.replace(
    "    compound = CompoundGeometry(parts)\n    if geom is not None:\n"
    "        compound = compound.translate(dx=-geom['y_c'], dy=-geom['z_c'])\n"
    "    section = BeamSection(compound, integrator='marin')\n",
    "    section = BeamSection(CompoundGeometry(parts), integrator='marin')\n"
    "    if geom is not None:\n"
    "        section = BeamSection(CompoundGeometry(parts).translate(dx=-geom['y_c'], dy=-geom['z_c']), integrator='marin')\n")
assert build_master != BRANCH_ENGINE
variant('D_branch_with_inline_compound', build_master)
