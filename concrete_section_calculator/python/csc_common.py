"""csc_common.py -- de smaa svarene HELE motoren stiller.

DENNE FILA ER IKKE EN SEKKEPOST. Aatte funksjoner staar her, og kriteriet for aa
staa her er ett: de kalles fra BAADE bruddgrensen og bruksgrensen. Ingen av dem
kjenner en lastkombinasjon, en analyse eller et svarformat -- de svarer paa
«hvilket tall er dette», «hvor ligger dette laget», «hva betyr disse tre
verdiene sammen».

Den som vil legge noe her maa kunne peke paa to kallere i to ulike moduler.
Uten det kriteriet blir en felles-modul stedet alt havner som ikke passet noe
annet sted, og da er den verre enn ingen modul.

INGEN AV DEM KASTER, og ingen av dem regner betong. `_warning` bygger en dict,
`_num` renser et flyttall, `_three_valued_and` er Kleene-OG. De er billige og
rene, og det er nettopp derfor de kan deles uten aa dra noe med seg.

Delt ut av `engine.py` i runde 12, uendret linje for linje -- bevist av
`tests/python/test_fixtures.py`, som sammenligner motorens svar tegn for tegn
med de committede fixturene.
"""

from __future__ import annotations

import math

# ------------------------------------------------------------------ #
# Tallhygiene — §5.4
# ------------------------------------------------------------------ #

def _num(v):
    """Eneste porten et tall slipper ut gjennom.

    `Infinity` og `NaN` er ikke gyldig JSON, og `JSON.parse` kaster på dem. `None` er det
    UI-et tegner som «–». At nøytralaksedybden blir uendelig ved rent trykk er et helt
    normalt svar, ikke en feil — det skal bare ikke rives med seg hele resultatet.
    """
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None

# ------------------------------------------------------------------ #
# Advarsler
# ------------------------------------------------------------------ #

def _warning(code, message, detail='', severity='warning'):
    return {
        'code': code,
        'severity': severity,
        'message': message,
        'detail': str(detail),
    }

def _three_valued_and(checks):
    """`all_ok` som treverdig OG: `False` slår `None`, `None` slår `True`.

    ALDRI «null teller som bestått». Rekkefølgen er hele poenget — et brudd skal ikke kunne
    gjemme seg bak en ubesvart kontroll, og en ubesvart kontroll skal ikke kunne gjemme seg
    bak alt det andre som gikk bra. En «–» i «Overall assessment» er den sanne påstanden
    «motoren kan ikke gå god for dette snittet», og den er alltid bedre enn en grønn hake
    motoren ikke har dekning for.

    Leser `checks` som den står, uten en liste over hvilke nøkler som teller — en ny
    kontroll blir dermed med i totalen uten at noen må huske å oppdatere to steder.
    `all_ok` selv legges inn ETTER dette kallet og kan derfor ikke telle seg selv.
    """
    values = list(checks.values())
    if any(v is False for v in values):
        return False
    if any(v is None for v in values):
        return None
    return True

# ------------------------------------------------------------------ #
# Oppbygging av tverrsnittet
# ------------------------------------------------------------------ #

def _layer_z(layer):
    """Vertikal senterkoordinat for et lag, uansett om det er punktjern eller stripe."""
    if layer['kind'] == 'bars':
        return float(layer['bars'][0]['z'])
    return float(layer['strip']['z'])

def _depth(z, h, theta):
    """Avstand fra trykkanten ned til `z`. Trykkanten er OK ved feltmoment, UK ved støtte."""
    return (z + h / 2.0) if _is_hogging(theta) else (h / 2.0 - z)

def _weighted_depth(layers, h, theta):
    """Arealvektet tyngdepunktsdybde for en gitt samling lag. `(d, A_s)`."""
    total = 0.0
    weighted = 0.0
    for layer in layers:
        a = float(layer['area'])
        total += a
        weighted += a * _depth(_layer_z(layer), h, theta)
    if total <= 0:
        return None, 0.0
    return weighted / total, total

# ------------------------------------------------------------------ #
# Avledede tverrsnittsstørrelser
# ------------------------------------------------------------------ #

def _is_hogging(theta):
    """θ = π er støttemoment. Toleransen finnes fordi θ kommer fra flyttallsregning i JS."""
    return abs(abs(float(theta)) - math.pi) < 1e-6

def _tension_layers(rebar, layers):
    """STREKKSETTET: lagene med ε > 0 ved brudd. Ett begrep, én definisjon, ett sted.

    Regelen `ε > 0` sto tidligere skrevet TO ganger i to representasjoner: `_effective_depth`
    regnet `eps_a + chi_y·z > 0` på nytt over rå `rebar`-dicter, mens `_classify` leste
    `compression`-flagget i lagtilstandene. To skrivere av samme begrep kan drive fra
    hverandre, og de gjorde det allerede ved ε nøyaktig 0: `all(l['compression'])` var
    USANT (ε er ikke < 0), mens strekksiden var TOM — samme snitt, to motsatte svar på
    «står noe i strekk?». Settet regnes derfor nå én gang, av tøyningene `_layer_state`
    allerede har, og tres gjennom til `d_eff`, `As_tension`, bruddformen, duktiliteten og
    A_s,min.

    `layers` kommer fra `_layer_state(rebar, …)` og har per konstruksjon samme rekkefølge
    som `rebar` — derfor `zip` og ikke et oppslag på `id`.
    """
    return [layer for layer, state in zip(rebar, layers)
            if state['eps'] is not None and state['eps'] > 0]
