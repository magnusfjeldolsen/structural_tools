"""BINDER DE COMMITTEDE RESULTATFIXTURENE TIL MOTOREN.

`docs/fixture-generator.py` bygger `result-*.json` ved å kjøre `engine.run()`, og
har en `--check`-modus som sier om filene på disk fortsatt er tegn for tegn like
motorens svar. Den modusen ble bare aldri kjørt av noe: den lå der som en kommando
et menneske måtte huske på.

Det er nøyaktig den feilen modulen har blitt bitt av i hver eneste runde — TO
KILDER TIL DET SAMME TALLET. Rundt 150 tester på JS-sida leser disse fixturene som
om de var motorens svar. Endrer motoren et tall uten at noen kjører generatoren,
fortsetter alle de testene å være grønne mot et tall som ikke finnes lenger, og
fixturene har stille blitt en andre sannhet.

Testen her er derfor ikke en test av generatoren. Den er låsen som gjør fixturene
til ÉN kilde: de er motorens svar, eller så er suiten rød.

Koster ~2 s. Filnavnet med bindestreker kan ikke importeres med `import`, derav
`importlib`.
"""

import importlib.util
import pathlib
import sys

import pytest

MODULE = pathlib.Path(__file__).resolve().parents[2]
GENERATOR = MODULE / 'docs' / 'fixture-generator.py'


def _load_generator():
    spec = importlib.util.spec_from_file_location('csc_fixture_generator', GENERATOR)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope='module')
def generated():
    """Motorens svar for alle payload × analyse, serialisert som på disk."""
    return _load_generator().generate()


def test_the_generator_covers_every_committed_result_fixture(generated):
    """En resultatfixtur generatoren IKKE kjenner til, er en fixtur ingen fornyer.

    Denne står først fordi den er den eneste som kan fange at noen legger til en
    ny `result-*.json` for hånd: `--check` sammenlikner bare de filene generatoren
    selv bygger, så en håndskrevet fil ville vært usynlig for den.
    """
    on_disk = {p.name for p in (MODULE / 'tests' / 'fixtures').glob('result-*.json')}
    missing = sorted(on_disk - set(generated))
    assert not missing, (
        'disse resultatfixturene bygges ikke av docs/fixture-generator.py og er '
        f'dermed ikke bundet til motoren: {missing}'
    )


def test_every_result_fixture_is_still_character_for_character_the_engines_answer(generated):
    """`--check`, kjørt av suiten i stedet for av et menneske som husker.

    Slår denne til, er det som regel IKKE en feil i motoren: det er fixturene som
    henger etter. Kjør `python docs/fixture-generator.py --diff` for å se hvilke
    tall som faktisk flyttet seg, og `--write` når du har lest diffen og mener
    bevegelsen er riktig.
    """
    fixtures = MODULE / 'tests' / 'fixtures'
    stale = []
    for filename, (text, _measured) in sorted(generated.items()):
        path = fixtures / filename
        if not path.exists():
            stale.append(f'{filename}: finnes ikke på disk')
            continue
        # Universelle linjeskift, ikke rå bytes — Windows sjekker ut med CRLF.
        if path.read_text(encoding='utf-8') != text:
            stale.append(f'{filename}: {_first_difference(path.read_text(encoding="utf-8"), text)}')
    assert not stale, (
        'fixturene er ikke lenger motorens svar:\n  ' + '\n  '.join(stale)
        + '\n\nkjør `python docs/fixture-generator.py --diff` og deretter `--write`.'
    )


def _first_difference(on_disk, generated_text):
    a = on_disk.splitlines()
    b = generated_text.splitlines()
    for i, (x, y) in enumerate(zip(a, b), start=1):
        if x != y:
            return f'linje {i}: disk {x.strip()!r} != motor {y.strip()!r}'
    return f'ulik lengde ({len(a)} linjer på disk, {len(b)} fra motoren)'
