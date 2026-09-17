"""engine.py — ULS-motoren. Eneste stedet i modulen som snakker med `structuralcodes`.

HVORFOR DENNE FILA IKKE VET AT DEN KJØRER I EN NETTLESER
Det finnes ingen `import js` og ingen `import pyodide` her, ikke engang for framdrift.
`run(payload, progress=None)` tar en helt vanlig callable. Det er det som gjør at
`tests/python/test_engine.py` kan kjøre nøyaktig den samme koden under skrivebords-CPython
som nettleseren kjører, mot nøyaktig den samme payload-fila som `payload.js` produserer.
Uten det kravet ville «samme M_Rd i CPython som i nettleseren» vært en påstand ingen kunne
etterprøve, og alle senere avvik ville dukket opp som en brukerrapport i stedet for som en
rød test.

HVORFOR ALT GÅR GJENNOM ÉN JSON-KONTRAKT
`run()` tar en dict og gir en dict, og begge er ren JSON (planens §5). Motoren returnerer
aldri et `structuralcodes`-objekt, aldri en `numpy.float64` og aldri en `ndarray` — de tre
tingene `json.dumps` enten nekter å serialisere eller serialiserer til noe `JSON.parse`
kaster på. `_num()` og `_arr()` under er den ene porten alt tall passerer gjennom, og
`json.dumps(..., allow_nan=False)` til slutt er sikringen som gjør at en glipp blir en feil
her i stedet for en tom graf i UI-et.

FORTEGNSREGELEN — v4: vi overtar `structuralcodes` sitt eget fortegn
`structuralcodes` bruker `n > 0` = strekk og `theta = 0` = trykksone øverst. En vanlig
bjelke med underkantarmering får derfor NEGATIVT `m_y` for feltmoment. Fram til runde 4
ble det fortegnet snudd om til en størrelse i JSON-grensa, med det rå fortegnet gjemt i
`meta.moment_sign`. Det er det IKKE lenger (plan v4 §1): `bending.M_Rd`, hele
M–κ-kurven (`moment_curvature.moment`/`.kappa`), `nm_domain.m` og
`combinations[i].M_Ed`/`M_Rd` krysser JSON-grensa RÅ, i pakkens eget fortegn.
`meta.moment_sign` og `meta.domain_theta` er fjernet — ingen produksjonskode leste dem
lenger, og et fortegn som bare ligger i `meta` uten at noen leser det er en felle, ikke
en funksjon. UI-en har i stedet fått opplysningsplikt (planens §1.7): «sagging negative»
og en levende tolkningslinje under momentfeltet.

`utilisation` er det ene, bevisste unntaket: den er ALLTID en STØRRELSE,
`|M_Ed|/|M_Rd|`, fordi utnyttelse ikke har noe fortegn å vise fram — to snitt med samme
utnyttelse skal se like «fulle» ut uansett om det er felt- eller støttemoment.

Ett unntak til, og det er bevisst: `mc_chi` (inndata til moment–krumning) og
`moment_curvature.chi_plan` (rutenettet) er FORTSATT STØRRELSER. Pakka vil ha
krumningen i sitt eget roterte system, der den alltid er negativ uansett `theta` —
`theta` er allerede bakt inn i rotasjonen. `chi_input = [-abs(v)]` i `_moment_curvature`
under SKAL stå (plan §1.4); fjernes det, brekker JS-drevet moment–krumning for
støttemoment.

HVORFOR EN FORBEREDT SEKSJON LIGGER SOM MODULGLOBAL
Moment–krumning drives ett krumningspunkt om gangen fra JS (planens §3.7), for å få
determinat framdrift og ekte avbrytbarhet. Da må den forberedte `BeamSection`-en overleve
mellom kall — å bygge den på nytt per punkt ville kostet mer enn selve integrasjonen, og
`n_min`/`n_max` er lazy-cachet på kalkulatoren og ville blitt regnet 20 ganger.

ADVARSLER ER UNNTAK I structuralcodes
`structuralcodes/__init__.py` avslutter med `filterwarnings(action='error', ...)`, så
manglende konvergens kommer som et unntak og ikke som en advarsel. Vi nedgraderer den én
gang ved import og fanger hver analyse i `catch_warnings(record=True)`. Pakketeksten er
engelsk og hører hjemme i `detail`, aldri i et norsk UI.
"""

from __future__ import annotations

import json
import math
import platform
import sys
import time
import traceback
import warnings

import numpy as np
from shapely import Point, Polygon
from structuralcodes.codes import ec2_2004
from structuralcodes.core.errors import StructuralCodesWarning
from structuralcodes.geometry import CompoundGeometry, PointGeometry, SurfaceGeometry
from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.sections import BeamSection

import structuralcodes

ENGINE_VERSION = '1.0.0'
SCHEMA = 1

# Nedgraderingen må stå på modulnivå og kjøre ved import: `catch_warnings` alene hjelper
# ikke, siden filteret pakka satte er 'error' og et 'always' inne i blokka må legges over.
warnings.filterwarnings('always', category=StructuralCodesWarning)

# Tøyningsgrensene er LOVAVHENGIGE. Resultatet bærer både verdien og navnet, ellers trykker
# rapporten «eps_cu2» over et tall som i virkeligheten er eps_cu3.
_STRAIN_LIMITS = {
    'parabolarectangle': ('eps_c2', 'eps_cu2'),
    'bilinearcompression': ('eps_c3', 'eps_cu3'),
    'sargin': ('eps_c1', 'eps_cu1'),
    'popovics': ('eps_c1', 'eps_cu1'),
}

# Modulglobal forberedt seksjon, se hodekommentaren. Nøkkelen er geometrien + de valgene
# som faktisk endrer den; `theta` står bevisst UTENFOR, fordi BeamSection roterer selv.
_PREPARED = {'key': None, 'bundle': None}


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


def _arr(a):
    """`.tolist()` gjør ndarray til liste; `_num` gjør numpy.float64 til float."""
    return [_num(x) for x in np.asarray(a).tolist()]


def _abs_arr(a):
    """Størrelser, ikke fortegn — se FORTEGNSREGELEN i hodekommentaren."""
    return [None if x is None else abs(x) for x in _arr(a)]


def _int_arr(a):
    return [int(x) for x in np.asarray(a).tolist()]


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


def _drain(recorded, warnings_out):
    """Gjør fangede `StructuralCodesWarning` om til kontraktens advarselsobjekter.

    Teksten pakka gir er engelsk og full av interne klassenavn. Den går i `detail` for den
    som vil grave; `message` er norsk og handlingsbar.
    """
    for w in recorded:
        if not issubclass(w.category, StructuralCodesWarning):
            continue
        warnings_out.append(_warning(
            'no_convergence',
            'The calculation did not fully converge. The result must be judged with '
            'care — check that the reinforcement and cross-section are reasonable.',
            w.message,
        ))


class _Capture:
    """`with _Capture() as cap:` — fanger advarsler uten å la dem bli unntak."""

    def __enter__(self):
        self._ctx = warnings.catch_warnings(record=True)
        self.records = self._ctx.__enter__()
        warnings.simplefilter('always', StructuralCodesWarning)
        return self

    def __exit__(self, *exc):
        self._ctx.__exit__(*exc)
        return False


# ------------------------------------------------------------------ #
# Oppbygging av tverrsnittet
# ------------------------------------------------------------------ #

def _layer_z(layer):
    """Vertikal senterkoordinat for et lag, uansett om det er punktjern eller stripe."""
    if layer['kind'] == 'bars':
        return float(layer['bars'][0]['z'])
    return float(layer['strip']['z'])


def _strip_polygon(strip):
    w = float(strip['width'])
    hh = float(strip['height'])
    z = float(strip['z'])
    return Polygon([
        (-w / 2, z - hh / 2), (w / 2, z - hh / 2),
        (w / 2, z + hh / 2), (-w / 2, z + hh / 2),
    ])


def _build(payload):
    """Bygger materialer, geometri og seksjon. Ingen beregning skjer her."""
    sec = payload['section']
    c = sec['concrete']
    s = sec['steel']
    opts = payload.get('options', {})

    conc = ConcreteEC2_2004(
        fck=float(c['fck']),
        gamma_c=float(c['gamma_c']),
        alpha_cc=float(c['alpha_cc']),
        constitutive_law=c['law'],
    )
    steel = ReinforcementEC2_2004(
        fyk=float(s['fyk']),
        Es=float(s['Es']),
        ftk=float(s['ftk']),
        epsuk=float(s['epsuk']),
        gamma_s=float(s['gamma_s']),
        gamma_eps=float(s['gamma_eps']),
        constitutive_law=s['law'],
    )

    b = float(sec['b'])
    h = float(sec['h'])
    conc_poly = Polygon([
        (-b / 2, -h / 2), (b / 2, -h / 2), (b / 2, h / 2), (-b / 2, h / 2),
    ])

    subtract = bool(opts.get('subtract_bar_area', False))
    if subtract:
        # Begge integratorene legger stålarealet på som et EKSTRA ledd uten å punsjere
        # hull i betongpolygonet. Med `subtract_bar_area` punsjerer vi hullene selv — både
        # for punktjern og for den utsmurte stripa, ellers er innstillingen halv.
        for layer in sec['rebar']:
            if layer['kind'] == 'bars':
                for bar in layer['bars']:
                    hole = Point(float(bar['y']), float(bar['z'])).buffer(
                        float(bar['dia']) / 2.0, quad_segs=32
                    )
                    conc_poly = conc_poly.difference(hole)
            else:
                conc_poly = conc_poly.difference(_strip_polygon(layer['strip']))

    parts = [SurfaceGeometry(conc_poly, conc)]
    for layer in sec['rebar']:
        if layer['kind'] == 'bars':
            for bar in layer['bars']:
                parts.append(PointGeometry(
                    (float(bar['y']), float(bar['z'])),
                    float(bar['dia']),
                    steel,
                    group_label=layer['id'],
                ))
        else:
            parts.append(SurfaceGeometry(
                _strip_polygon(layer['strip']), steel, group_label=layer['id']
            ))

    # Integratornavnet valideres her og ikke i `BeamSection`: et ukjent navn faller STILLE
    # tilbake til marin i pakkens fabrikk, så en skrivefeil ville gitt et resultat som ser
    # riktig ut men svarer på et annet spørsmål.
    integrator = opts.get('integrator', 'marin')
    if integrator != 'marin':
        raise ValueError(
            f"integrator='{integrator}' is not supported; only 'marin' is available "
            'because the fiber integrator requires the triangle package.'
        )

    section = BeamSection(CompoundGeometry(parts), integrator='marin')
    return {'section': section, 'conc': conc, 'steel': steel, 'b': b, 'h': h}


def _prepare(payload, progress=None):
    """Henter den forberedte seksjonen fra modulglobalen, eller bygger den på nytt."""
    opts = payload.get('options', {})
    key = json.dumps(
        {
            'section': payload['section'],
            'subtract_bar_area': bool(opts.get('subtract_bar_area', False)),
            'integrator': opts.get('integrator', 'marin'),
        },
        sort_keys=True,
    )
    if _PREPARED['key'] == key and _PREPARED['bundle'] is not None:
        return _PREPARED['bundle']

    if progress is not None:
        progress('section', 0, 1)
    bundle = _build(payload)
    _PREPARED['key'] = key
    _PREPARED['bundle'] = bundle
    if progress is not None:
        progress('section', 1, 1)
    return bundle


def reset_cache():
    """Brukes av tester som vil garantere en frisk seksjon. Ikke nødvendig i drift."""
    _PREPARED['key'] = None
    _PREPARED['bundle'] = None


# ------------------------------------------------------------------ #
# Avledede tverrsnittsstørrelser
# ------------------------------------------------------------------ #

def _is_hogging(theta):
    """θ = π er støttemoment. Toleransen finnes fordi θ kommer fra flyttallsregning i JS."""
    return abs(abs(float(theta)) - math.pi) < 1e-6


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


def _effective_depth(rebar, tension, h, theta):
    """`d` etter EC2 9.2.1.1: trykkanten til tyngdepunktet i STREKKARMERINGEN.

    HVORFOR IKKE BARE ALLE LAG ARÉALVEKTET
    Det var første utgave av denne funksjonen, og det var feil på usikker side. Trekker man
    trykkarmeringen med i vektingen, synker `d`, og `A_s,min = 0.26·f_ctm/f_yk·b_t·d` blir
    for lav — i akkurat de snittene noen har lagt inn trykkarmering, altså de snittene der
    man minst har lyst til å bomme. Referansefixturene har ett lag og ville aldri avslørt
    det; derfor står det en egen tolagstest i `test_engine.py`.

    HVORFOR DET IKKE FINNES NOEN RESERVEGREN LENGER
    Fram til nå falt funksjonen tilbake på den geometriske strekksiden, og til slutt på ALLE
    lag, «slik at funksjonen alltid gir et tall å rapportere». Garantien VAR feilen. Den
    eneste kalleren har alltid et tøyningsplan, så reservegrenene kunne per konstruksjon
    bare slå til når planet sier «ingen lag i strekk» — altså bare når de motsier grunnlaget
    de skulle støtte seg på. Målt på referansebjelken som støttemoment med N = −500 kN ga
    reserven `d = 50 mm` og ρ = 6,28 % for et snitt som ikke har ett eneste jern på
    strekksiden, og rapporten trykte begge uten forbehold. Nå blir `d_eff`, `As_min`, `rho`
    og `x_over_d` `None`, `As_tension` blir 0, og A_s,min-kontrollen blir UBESVART i stedet
    for bestått med 42× margin på et oppdiktet grunnlag.

    Returnerer `(d_eff, As_tension, d_eff_all)`.
    """
    d_all, _as_all = _weighted_depth(rebar, h, theta)
    # `_weighted_depth([])` gir (None, 0.0) — nettopp «ingen dybde, ingen armering».
    d_eff, as_tension = _weighted_depth(tension, h, theta)
    return d_eff, as_tension, d_all


def _cracking_moment(b, h, fctm, n_ed):
    """`M_cr = W·(f_ctm − N_Ed/A_c)`, `W = b·h²/6` — riss-momentet for det urissede,
    rektangulære bruttotverrsnittet. Motoren bygger et rektangel og ingenting annet, så
    `W` er eksakt og ikke et anslag.

    HVORFOR `f_ctm` OG IKKE `f_ctm,fl` — BESLUTTET, IKKE GLEMT
    EC2 3.1.8 gir en høyere bøyestrekkfasthet `f_ctm,fl` for tynne snitt (faktoren er 1,0
    først ved h ≥ 600 mm). Vi bruker likevel `f_ctm`: det er samme `f_ct,eff` som EC2
    9.2.1.1 selv bruker, og hele kalibreringsargumentet for denne kontrollen hviler på den.
    For 300×600 er de to fasthetene identiske uansett (EC2 3.1.8 gir faktor 1,0 ved
    h = 600). Valget betyr noe bare for tynne snitt, der `f_ctm` er den MILDESTE av de to —
    en «retting» til `f_ctm,fl` ville altså gjort kontrollen strengere enn A_s,min den skal
    speile, og krevd at kalibreringen regnes om. IKKE endre dette i god tro.

    NIVAAET: `M_cr` er en middelverdi-stoerrelse (f_ctm, ingen materialfaktor).
    `checks.brittle_ok` sammenlikner den derfor mot `|M_Rd| · γ_s`, altså kapasiteten
    loeftet til KARAKTERISTISK nivaa — samme nivaa som A_s,min utledes paa. Uten det ble
    kontrollen 1,15 ganger strengere enn kalibreringen den speiler, og underkjente plater
    som oppfyller EC2 eksakt (h = 200 ga forholdstall 0,903). Se `brittle_ok` i `_run_inner`.

    KALIBRERINGEN, MÅLT: referansebjelken armert nøyaktig til A_s,min = 248,5 mm² ved
    d = 550 gir M_Rd = 63,09 kNm mot M_cr = 52,14 kNm — forholdstall 1,21 (62,70 kNm og
    1,20 med α_cc = 0,85). A_s,min ER kalibrert mot dette kriteriet, og forholdstallet over
    1 er nettopp hvorfor `brittle_ok` ikke blir en ny falsk alarm: der `d` er ekte, er
    A_s,min den bindende av de to, og `brittle_ok` slår bare til der `d` IKKE er ekte.
    (Planen anslo 56,5 kNm og 1,08 for hånd; tallene her er kjørt gjennom motoren.)

    FORTEGNET: `N_Ed` har strekk positivt, så et aksialTRYKK (negativt) LØFTER riss-momentet
    — det er hva `− N_Ed/A_c` gjør. Målt på referansebjelken: 52,14 kNm ved N = 0 mot
    102,14 kNm ved N = −500 kN.

    Blir tallet negativt, risser snittet av aksialstrekket alene, uten noe moment. Da er
    «må bære mer enn det som får det til å risse» oppfylt av et hvilket som helst
    `|M_Rd| ≥ 0`, og kontrollen består. Den er IKKE ubesvart: tilstanden er regnet, svaret
    er bare trivielt.
    """
    return (b * h * h / 6.0) * (fctm - n_ed / (b * h))


# Hvor langt utenfor tverrsnittet en nøytralakse fortsatt er et tall verdt å vise.
# EC2-felt 1 (rent trykk) har legitimt nøytralakse utenfor snittet, så grensa kan ikke
# være h/2 — men den må finnes, se `_neutral_axis`.
_NA_REACH = 10.0


def _neutral_axis(eps_a, chi_y, h, theta):
    """(z_na, x). Finnes det ingen meningsfull nøytralakse, er begge None.

    To tilfeller havner her. Det rene er `chi_y = 0`: `-eps_a/chi_y` blir ±Infinity, som
    ikke er gyldig JSON og som `JSON.parse` kaster på (§5.4). Det stygge er `chi_y` lik
    1e-13 — numerisk null ved N nær `n_min`, men ikke null nok til å bli uendelig. Det gir
    en nøytralakse 35 km unna, et endelig tall som passerer alle sikringer og tegnes som
    om det betydde noe. Begge skal bli `null`, og UI-et tegner «–».
    """
    if not chi_y:
        return None, None
    z_na = -eps_a / chi_y
    if not math.isfinite(z_na) or abs(z_na) > _NA_REACH * h:
        return None, None
    x = (z_na + h / 2.0) if _is_hogging(theta) else (h / 2.0 - z_na)
    return z_na, x


def _layer_state(rebar, eps_a, chi_y, steel):
    """Tøyning og spenning per lag, regnet fra tøyningsplanet motoren alt har.

    Pakka kan i prinsippet gi det samme via `create_detailed_result()`, men den veien går
    gjennom `triangle` og finnes derfor ikke i nettleseren. Fem linjer her koster ingenting
    og virker begge steder.
    """
    fyd = steel.fyd()
    out = []
    for layer in rebar:
        z = _layer_z(layer)
        eps = eps_a + chi_y * z
        sigma = float(steel.constitutive_law.get_stress(np.array([eps]))[0])
        out.append({
            'id': layer['id'],
            'z': _num(z),
            'eps': _num(eps),
            'sigma': _num(sigma),
            'utilisation': _num(abs(sigma) / fyd) if fyd else None,
            'compression': bool(eps < 0),
        })
    return out


def _classify(tension, eps_s_max, eps_c_top, eps_yd, eps_ud, eps_cu, m_rd, m_cr):
    """Bruddform, i rekkefølgen §5.2 gir. Rekkefølgen ER klassifiseringen.

    `tension` er strekksettet fra `_tension_layers` — ikke `compression`-flaggene, se der
    for hvorfor de to ikke var samme utsagn. Vilkåret `eps_s_max < eps_yd` som sto på den
    første grenen er droppet fordi det er implisert: er strekksettet tomt, er ingen ε > 0,
    og da er `eps_s_max ≤ 0 < eps_yd` uansett.
    """
    if not tension:
        return 'compression_no_tension'
    if m_rd is not None and m_cr is not None and abs(m_rd) < m_cr:
        # FORAN `steel_rupture` og `over_reinforced`, med vilje. Når kapasiteten ligger
        # under riss-momentet, går snittet i stykker i det ØYEBLIKKET det risser — hele
        # armeringens tøyningshistorie etterpå er uten betydning, for den inntreffer aldri.
        # `over_reinforced` er ikke nødvendigvis galt som TØYNINGSTILSTAND her (betongen
        # knuses før jernet flyter), men det er galt som FORKLARING: det sier «du har for
        # mye armering» til en som har for lite på den siden det gjelder.
        return 'unreinforced_tension_zone'
    if eps_s_max >= eps_ud * (1 - 1e-3):
        return 'steel_rupture'
    if eps_c_top <= -eps_cu * (1 - 1e-3) and eps_s_max >= eps_yd:
        return 'concrete_crushing'
    return 'over_reinforced'


def _compression_zone_warning(payload, bundle, eps_a, chi_y, z_na):
    """Advarsel med et KVANTITATIVT anslag når et jernsenter ligger i trykksonen.

    «Marginalt på usikker side» er ikke handlingsbart. Feilen er dobbelttellingen av betong
    under jernet, og den kan anslås eksakt fra tøyningsplanet vi allerede har:
    kraften er Σ A_s·σ_c(ε_jern), momentbidraget om origo Σ A_s·σ_c(ε_jern)·z.
    """
    conc = bundle['conc']
    subtract = bool(payload.get('options', {}).get('subtract_bar_area', False))
    force = 0.0
    moment = 0.0
    hits = []
    for layer in payload['section']['rebar']:
        z = _layer_z(layer)
        eps = eps_a + chi_y * z
        if eps >= 0:
            continue
        area = float(layer['area'])
        sigma_c = float(conc.constitutive_law.get_stress(np.array([eps]))[0])
        force += area * sigma_c
        moment += area * sigma_c * z
        hits.append(layer['id'])
    if not hits:
        return None

    ids = ', '.join(hits)
    if subtract:
        return _warning(
            'bar_in_compression_zone',
            f'The reinforcement in {ids} lies in the compression zone at failure. The '
            'concrete under the bars has been subtracted, so the resistance is not '
            'overestimated.',
            f'layers in compression: {ids}; subtract_bar_area=True, no double count.',
            severity='info',
        )
    return _warning(
        'bar_in_compression_zone',
        f'The reinforcement in {ids} lies in the compression zone at failure, and the '
        f'concrete it displaces is counted twice. The resistance is estimated to be about '
        f'{abs(moment) / 1e6:.1f} kNm on the unsafe side. Enable "subtract bar area" to '
        'remove the double counting.',
        # `z_na` tas bare med NÅR den finnes. Ved rent trykk er krumningen numerisk null og
        # `_neutral_axis` gir med rette `None` — og «z_na = None» i en advarsel er nøyaktig
        # den typen sitat av et tall som aldri ble regnet som §1.7 forbyr. Anslaget over
        # står uansett: det kommer fra tøyningsplanet, ikke fra nøytralaksen.
        f'sum A_s*sigma_c = {force:.1f} N, sum A_s*sigma_c*z = {moment:.1f} Nmm'
        + (f', z_na = {z_na:.3f}' if z_na is not None else ''),
    )


def _geometry_warnings(payload):
    """Jern utenfor tverrsnittet integreres glad og gir tøvete kapasitet uten noen feil."""
    out = []
    sec = payload['section']
    b = float(sec['b'])
    h = float(sec['h'])
    for layer in sec['rebar']:
        if layer['kind'] == 'bars':
            for bar in layer['bars']:
                r = float(bar['dia']) / 2.0
                if abs(float(bar['z'])) + r > h / 2.0 + 1e-9 or \
                        abs(float(bar['y'])) + r > b / 2.0 + 1e-9:
                    out.append(_warning(
                        'bar_outside_section',
                        f'A bar in layer {layer["id"]} lies outside the cross-section. '
                        'The calculated resistance is then not physical.',
                        f'bar y={bar["y"]}, z={bar["z"]}, dia={bar["dia"]} '
                        f'outside b={b}, h={h}',
                        severity='error',
                    ))
                    break
        else:
            st = layer['strip']
            if abs(float(st['z'])) + float(st['height']) / 2.0 > h / 2.0 + 1e-9:
                out.append(_warning(
                    'bar_outside_section',
                    f'The smeared reinforcement strip in layer {layer["id"]} lies outside '
                    'the cross-section. The calculated resistance is then not physical.',
                    f'strip z={st["z"]}, height={st["height"]} outside h={h}',
                    severity='error',
                ))
    return out


# ------------------------------------------------------------------ #
# Skjær — EC2 6.2 (v4-planens §3–4)
# ------------------------------------------------------------------ #

def _ned_for_shear(n_ed_tension_positive: float) -> float:
    """Seksjons-API-et har strekk positiv; EC2-skjærfunksjonene har trykk positiv.

    Én funksjon som ikke gjør noe annet, med egen test. Snus dette fortegnet ved en
    feiltakelse, blir et snitt i strekk (der skjærkapasiteten SKAL være lav) i stedet
    regnet som om det sto i trykk — målt på referansebjelken en elleve gangers
    overestimering av `V_Rd,c`, på usikker side (plan §4.1a).
    """
    return -n_ed_tension_positive


def _shear_geometry(rebar, h, theta_c):
    """`A_sl` og `d` for ÉN gitt retning, rent GEOMETRISK — ingen tøyningsplan.

    EC2 6.2.2 sin `A_sl` er den ANKREDE bøyestrekkarmeringen («anchored at least
    (lbd + d) beyond the considered cross-section»), et forankringsbegrep knyttet til
    bøyestrekksiden. Det er IKKE «alle lag med ε > 0 ved brudd» — den tøyningsplan-baserte
    ruten (`_effective_depth`) er ukonservativ i feil retning ved aksialstrekk, fordi den
    da teller overkantarmeringen inn i skjærkapasiteten for et feltmoment (plan §4.1b).
    Regelen her er derfor bevisst en annen enn `_effective_depth`, og det er ikke en feil.

    Returnerer `(A_sl, d)`. `d = None` når ingen armering ligger på strekksiden.
    """
    hogging = _is_hogging(theta_c)
    tension = [l for l in rebar if (_layer_z(l) > 0 if hogging else _layer_z(l) < 0)]
    if not tension:
        return 0.0, None
    d, a_sl = _weighted_depth(tension, h, theta_c)
    return a_sl, d


def _shear_asl_d(rebar, h, m_ed, theta_c, warnings_out, combo_id, combo_name):
    """`A_sl`/`d` for én kombinasjon, med `M_Ed = 0`-regelen fra plan §4.1b.

    `M_Ed = 0` gir ingen strekkside fra momentet — da tas siden med MINST `A_sl`, den
    strengeste av de to, og det legges en `shear_asl_ambiguous`-advarsel slik at valget
    er synlig og ikke stille. Dette er trivielt beregnbart nettopp fordi regelen er
    geometrisk (§4.1b) — en tøyningsplan-basert regel ville ikke engang hatt et svar her
    uten en løst bruddtilstand.
    """
    if m_ed == 0.0:
        a_sag, d_sag = _shear_geometry(rebar, h, 0.0)
        a_hog, d_hog = _shear_geometry(rebar, h, math.pi)
        if d_sag is None and d_hog is None:
            return 0.0, None
        if d_sag is None or (d_hog is not None and a_hog < a_sag):
            a_sl, d = a_hog, d_hog
        else:
            a_sl, d = a_sag, d_sag
        w = _warning(
            'shear_asl_ambiguous',
            'M_Ed = 0 gives no tension side from the moment. The side with the least '
            'flexural tension reinforcement is used for A_sl and d — the more '
            'conservative of the two.',
            f'A_sl(sagging)={a_sag}, A_sl(hogging)={a_hog}',
            severity='info',
        )
        w['combo'] = combo_id
        w['combo_name'] = combo_name
        warnings_out.append(w)
        return a_sl, d
    return _shear_geometry(rebar, h, theta_c)


def _shear_result(combo, rebar, h, shear_ctx, warnings_out):
    """Skjærkapasitet for ÉN kombinasjon (plan §4.2), eller `None` uten skjærdata.

    Regnes FØR aksialsjekken i `_solve_combo` og er uavhengig av bøyeløsningen —
    `A_sl`/`d` er geometriske (§4.1b), så skjær kan svares ut for ENHVER kombinasjon,
    også de utenfor `[n_min, n_max]` og de moment–krumning aldri løser. `V_Rd,c` legges
    ALDRI til `V_Rd,s` (EC2 6.2.3(2)) — `governing_mode` velger, det summeres ikke.
    """
    if shear_ctx is None:
        return None

    m_ed = combo['M_Ed']
    n_ed = combo['N_Ed']
    theta_c = combo['theta']
    v_ed = abs(float(combo.get('V_Ed', 0.0) or 0.0))

    a_sl, d = _shear_asl_d(rebar, h, m_ed, theta_c, warnings_out, combo['id'], combo['name'])
    bw = float(shear_ctx['bw'])

    if d is None or d <= 0 or bw <= 0:
        return {
            'evaluated': False, 'V_Ed': _num(v_ed),
            'V_Rd': None, 'V_Rd_c': None, 'V_Rd_s': None, 'V_Rd_max': None,
            'governing_mode': None, 'utilisation': None,
            'Asl': _num(a_sl), 'd': _num(d), 'bw': _num(bw), 'z': None,
            'asw_s': None, 'asw_s_min': None, 'asw_s_required': None,
            'sl_max': None, 'st_max': None,
        }

    cfg = shear_ctx['cfg']
    strut_deg = float(cfg.get('strut_angle_deg', 45.0))
    z_factor = float(cfg.get('z_factor', 0.9))
    z = z_factor * d
    stirrups = cfg.get('stirrups') or []

    fck = shear_ctx['fck']
    fcd = shear_ctx['fcd']
    ac = shear_ctx['ac']
    gamma_s = shear_ctx['gamma_s']
    ned_shear = _ned_for_shear(n_ed)

    # Regnes selv (plan §3.3) — ikke en `structuralcodes`-funksjon, og ikke i stand til å
    # feile (ren aritmetikk). Regnes derfor FØR `structuralcodes`-kallene under, slik at
    # disse tallene alltid er med i svaret selv om selve kapasitetsberegningen skulle
    # avvises (se `except` under). Flere bøylerader summeres til én total, slik `VRds`
    # kan mates med `s = 1` og `Asw = asw_s` — samme knep som gjør at flere rader med
    # ulikt senteravstand kan kombineres til én kapasitet.
    asw_s = 0.0
    fywk = None
    for st in stirrups:
        spacing = float(st['spacing'])
        if spacing <= 0:
            continue
        dia = float(st['dia'])
        legs = float(st.get('legs', 2))
        asw_s += legs * math.pi * dia ** 2 / 4.0 / spacing
        if fywk is None and st.get('fywk') is not None:
            fywk = float(st['fywk'])

    rho_w_min = (0.08 * math.sqrt(fck) / fywk) if fywk else None
    asw_s_min = (rho_w_min * bw) if rho_w_min is not None else None
    sl_max = 0.75 * d
    st_max = min(0.75 * d, 600.0)

    # `structuralcodes` sine skjærfunksjoner KAN kaste — `VRdmax`/`Asw_max` sin
    # `alpha_cw` avviser `sigma_cp = NEd/Ac > fcd` (EC2 6.2.3(3), trykkspenningen kan
    # ikke overstige betongens trykkfasthet). Det treffer nettopp en kombinasjon langt
    # utenfor `[n_min, n_max]` — akkurat den typen rad skjær SKAL kunne svare ut (§4.1b)
    # uten selv å ha et gyldig aksialtrykk for trykkstaven. Motoren skal ALDRI kaste
    # (hodekommentarens «kaster aldri»), så dette er `evaluated: False` med en advarsel,
    # ikke en unntak som velter hele kjøringen.
    try:
        v_rd_c = float(ec2_2004.VRdc(
            fck=fck, d=d, Asl=a_sl, bw=bw, NEd=ned_shear, Ac=ac, fcd=fcd,
        ))
        if stirrups and fywk:
            fywd = fywk / gamma_s
            v_rd_s = float(ec2_2004.VRds(
                Asw=asw_s, s=1.0, z=z, theta=strut_deg, fyk=fywk, alpha=90.0,
                gamma_s=gamma_s,
            ))
            v_rd_max = float(ec2_2004.VRdmax(
                bw=bw, z=z, fck=fck, theta=strut_deg, NEd=ned_shear, Ac=ac, fcd=fcd,
                alpha=90.0,
            ))
            asw_s_required = float(ec2_2004.Asw_s_required(
                Ved=v_ed, z=z, theta=strut_deg, fywd=fywd, alpha=90.0,
            ))
            v_rd = min(v_rd_s, v_rd_max)
            governing_mode = 'stirrups' if v_rd_s <= v_rd_max else 'strut_crushing'
        else:
            # Tom bøyleliste — EC2 6.2.1(4): kapasiteten ER `V_Rd,c`, ikke et
            # spesialtilfelle av bøylevegen. Standard for plate.
            v_rd_s = None
            v_rd_max = None
            asw_s_required = None
            v_rd = v_rd_c
            governing_mode = 'no_stirrups'
    except ValueError as exc:
        w = _warning(
            'shear_not_evaluated',
            'The shear capacity could not be computed for this load combination — the '
            'axial force is too far outside the range the cross-section can carry for '
            'the compression strut check to apply.',
            str(exc),
            severity='warning',
        )
        w['combo'] = combo['id']
        w['combo_name'] = combo['name']
        warnings_out.append(w)
        return {
            'evaluated': False, 'V_Ed': _num(v_ed),
            'V_Rd': None, 'V_Rd_c': None, 'V_Rd_s': None, 'V_Rd_max': None,
            'governing_mode': None, 'utilisation': None,
            'Asl': _num(a_sl), 'd': _num(d), 'bw': _num(bw), 'z': _num(z),
            'asw_s': _num(asw_s), 'asw_s_min': _num(asw_s_min), 'asw_s_required': None,
            'sl_max': _num(sl_max), 'st_max': _num(st_max),
        }

    if v_rd:
        utilisation = v_ed / v_rd
    else:
        utilisation = 0.0 if not v_ed else None

    return {
        'evaluated': True,
        'V_Ed': _num(v_ed),
        'V_Rd': _num(v_rd),
        'V_Rd_c': _num(v_rd_c),
        'V_Rd_s': _num(v_rd_s),
        'V_Rd_max': _num(v_rd_max),
        'governing_mode': governing_mode,
        'utilisation': _num(utilisation),
        'Asl': _num(a_sl),
        'd': _num(d),
        'bw': _num(bw),
        'z': _num(z),
        'asw_s': _num(asw_s),
        'asw_s_min': _num(asw_s_min),
        'asw_s_required': _num(asw_s_required),
        'sl_max': _num(sl_max),
        'st_max': _num(st_max),
    }


def _select_shear_governing(combo_results):
    """Samme regel som `_select_governing` (§4.3), men for skjær og UAVHENGIG av
    `within_limits` — skjær kan jo regnes utenfor `[n_min, n_max]` (§4.1b). En rad med
    stor `V_Ed` og lite `M_Ed` skal kunne styre skjær uten å være i nærheten av å styre
    bøying, derav et EGET merke (plan §4.3).
    """
    candidates = [i for i, c in enumerate(combo_results)
                  if c.get('shear') and c['shear'].get('evaluated')]
    if not candidates:
        return None
    best = candidates[0]
    for i in candidates[1:]:
        u_i = combo_results[i]['shear']['utilisation'] or 0.0
        u_best = combo_results[best]['shear']['utilisation'] or 0.0
        if u_i > u_best:
            best = i
    return combo_results[best]['id']


# ------------------------------------------------------------------ #
# Lastkombinasjoner — §4
# ------------------------------------------------------------------ #

def _normalise_loads(payload, opts):
    """Bygger kombinasjonslista fra BEGGE payload-former (§4.2).

    Den gamle formen `{"N_Ed": …, "M_Ed": …}` finnes i alle committede fixturer og i
    `tests/python/test_engine.py`, og skal fortsatt virke UENDRET — den blir én
    kombinasjon `C1` med `options.theta` som retning. Den nye formen har egen `theta` per
    kombinasjon; `options.theta` er bare standarden for en kombinasjon som ikke oppgir sin
    egen (§4.2).

    `V_Ed` er nytt i v4 (plan §1.2/§4.1c), en STØRRELSE — `VRds`/`VRdmax` er symmetriske i
    V, og fortegnet betyr ingenting. Mangler feltet (alle eksisterende fixturer), blir det
    `0.0`, og skjærblokka viser bare kapasitet uten utnyttelse.

    Returnerer `(combos, active_id)`.
    """
    loads = payload['loads']
    default_theta = float(opts.get('theta', 0.0))

    if 'combinations' in loads:
        combos = []
        for c in loads['combinations']:
            theta = c.get('theta')
            combos.append({
                'id': c['id'],
                'name': c.get('name', ''),
                'N_Ed': float(c['N_Ed']),
                'M_Ed': float(c['M_Ed']),
                'theta': float(theta) if theta is not None else default_theta,
                'V_Ed': float(c.get('V_Ed', 0.0) or 0.0),
            })
        active_id = loads.get('active') or (combos[0]['id'] if combos else None)
        return combos, active_id

    combo = {
        'id': 'C1',
        'name': '',
        'N_Ed': float(loads['N_Ed']),
        'M_Ed': float(loads['M_Ed']),
        'theta': default_theta,
        'V_Ed': float(loads.get('V_Ed', 0.0) or 0.0),
    }
    return [combo], 'C1'


def _unsolved_combo(combo, n_ed, m_ed, theta_c, v_ed, shear, within_limits):
    """En `combinations[i]`-rad UTEN bøyeløsning — skjæret står, bøyefeltene er `None`.

    Formen er den samme som `_solve_combo` ellers returnerer, slik at leserne (`results.js`,
    `report.js`) ikke trenger å vite hvorfor feltene er tomme. To grunner gir denne raden:
    kombinasjonen ligger utenfor `[n_min, n_max]` (§4.4, `within_limits: False`), eller
    M–κ tok med raden BARE for skjærets skyld (§10 C2, `within_limits: True`).
    """
    return {
        'id': combo['id'], 'name': combo['name'],
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
        'V_Ed': _num(v_ed), 'shear': shear,
        'M_Rd': None, 'utilisation': None,
        'x': None, 'x_over_d': None, 'eps_a': None, 'chi_y': None,
        'eps_c_top': None, 'eps_s_max': None, 'failure_mode': None, 'layers': None,
        'within_limits': bool(within_limits),
        # EKSPLISITT, ikke utledet. En leser kunne i prinsippet sluttet seg til det
        # samme av at `M_Rd is None` mens `within_limits` er True, men da ville
        # rapporten stått med en tom statuscelle den dagen noen la til enda en grunn
        # til at bøyningen ikke ble løst.
        'flexure_solved': False,
    }


def _solve_combo(combo, sc, rebar, steel, b, h, fctm, eps_yd, eps_ud, eps_cu,
                  n_min, n_max, shear_ctx, warnings_out, solve_flexure=True):
    """Løser bruddtilstanden for ÉN lastkombinasjon.

    Returnerer `(public, extra)`. `public` er NØYAKTIG formen `combinations[i]` skal ha i
    resultatet (§4.3) og går rett ut som JSON. `extra` er interne mellomregninger
    (`d_eff`, `as_tension`, `d_eff_all`, `z_na`, `m_cr`, `has_tension`) som bare
    GOVERNING-kombinasjonen trenger videre (til `section_props`/`checks`/`meta`, §4.3) — å
    regne dem for alle kombinasjonene ville vært bortkastet arbeid for rader ingen speiler.

    Utenfor `[n_min, n_max]` (§4.4): `within_limits: False`, alle bøye-utfallsfelt `None`,
    og en `axial_out_of_range`-advarsel MERKET med hvilken kombinasjon det gjelder — ellers
    forsvinner navnet bak `results.js` sin kodetabell når meldinga vises (§4.4). Advarselen
    stopper IKKE resten av kombinasjonene.

    Skjær (§4.1b) regnes FØR denne aksialsjekken og er ikke omfattet av den — `A_sl`/`d`
    er geometriske, ikke hentet fra bøyeløsningen, så skjær har et svar for ENHVER
    kombinasjon uansett hva aksialsjekken under sier.

    `solve_flexure=False` gir skjær og aksialsjekk, men hopper over selve bruddtilstanden
    (§10 C2). Det er M–κ sine ikke-aktive rader: de er med i lista utelukkende for at
    `shear_governing` og skjærkontrollene skal bli de samme som i de to andre analysene.
    """
    n_ed = combo['N_Ed']
    m_ed = combo['M_Ed']
    theta_c = combo['theta']
    v_ed = float(combo.get('V_Ed', 0.0) or 0.0)

    shear = _shear_result(combo, rebar, h, shear_ctx, warnings_out)
    # `M_cr` avhenger BARE av geometrien, `f_ctm` og `N_Ed` — aldri av bruddtilstanden.
    # Derfor har den et svar også for radene under, som ikke løser bøyningen, og skal
    # regnes her oppe én gang i stedet for to ganger lenger nede.
    m_cr = _cracking_moment(b, h, fctm, n_ed)
    # `has_tension: None` betyr «ikke regnet», ikke «ingen strekk» — de to gir ULIKE
    # kontrollsvar lenger nede, og må derfor være skillbare her.
    no_extra = {'d_eff': None, 'as_tension': None, 'd_eff_all': None, 'z_na': None,
                'm_cr': m_cr, 'has_tension': None}

    if n_ed < n_min or n_ed > n_max:
        warning = _warning(
            'axial_out_of_range',
            f'The axial force N_Ed = {n_ed / 1e3:.1f} kN is outside what the cross-section '
            f'can carry: the permitted range is {n_min / 1e3:.1f} kN to {n_max / 1e3:.1f} '
            'kN (compression negative). Increase the cross-section or the reinforcement, '
            'or reduce the load.',
            f'n={n_ed} outside [n_min={n_min}, n_max={n_max}]',
        )
        warning['combo'] = combo['id']
        warning['combo_name'] = combo['name']
        warnings_out.append(warning)
        public = _unsolved_combo(combo, n_ed, m_ed, theta_c, v_ed, shear, False)
        extra = dict(no_extra)
        return public, extra

    if not solve_flexure:
        # Raden er med BARE for skjæret (§10 C2). Bøyeløsningen under koster en full
        # bruddtilstand — og M–κ betaler den på nytt for HVERT κ-punkt, fordi
        # `solver-client.js` kjører én motorrunde per punkt. Med 20+ punkter ville
        # «skjær for alle kombinasjoner» blitt 20+ ganger dyrere enn den er verdt, mens
        # selve skjæret koster mikrosekunder og er allerede regnet over.
        return _unsolved_combo(combo, n_ed, m_ed, theta_c, v_ed, shear, True), dict(no_extra)

    with _Capture() as cap:
        bend = sc.calculate_bending_strength(theta=theta_c, n=n_ed)
    _drain(cap.records, warnings_out)

    # RÅ, i pakkens eget fortegn — se hodekommentarens FORTEGNSREGEL (plan v4 §1.4).
    m_rd_signed = float(bend.m_y)
    eps_a = float(bend.eps_a)
    chi_y = float(bend.chi_y)
    z_na, x = _neutral_axis(eps_a, chi_y, h, theta_c)
    layers = _layer_state(rebar, eps_a, chi_y, steel)
    eps_s_max = max((l['eps'] for l in layers if l['eps'] is not None), default=None)
    eps_edge = eps_a + chi_y * (-h / 2.0 if _is_hogging(theta_c) else h / 2.0)

    # Strekksettet kan først avgjøres NÅ, og regnes ÉN gang: EC2 9.2.1.1 sin `d` gjelder
    # strekkarmeringen, og hvilke lag som står i strekk ser man i tøyningsplanet ved brudd,
    # ikke i geometrien alene. Herfra tres det samme settet gjennom til bruddformen, `d_eff`,
    # `As_tension` og videre til duktilitet og A_s,min i `_run_inner`.
    # (Dette er IKKE skjærets `A_sl`/`d` — se `_shear_geometry` for hvorfor de to skal
    # være ulike funksjoner.)
    tension = _tension_layers(rebar, layers)
    failure_mode = _classify(
        tension, eps_s_max, eps_edge, eps_yd, eps_ud, eps_cu, m_rd_signed, m_cr,
    )
    d_eff, as_tension, d_eff_all = _effective_depth(rebar, tension, h, theta_c)

    public = {
        'id': combo['id'], 'name': combo['name'],
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
        'V_Ed': _num(v_ed), 'shear': shear,
        'M_Rd': _num(m_rd_signed), 'utilisation': _num(_utilisation(m_ed, m_rd_signed)),
        'x': _num(x), 'x_over_d': _num(x / d_eff) if (x is not None and d_eff) else None,
        'eps_a': _num(eps_a), 'chi_y': _num(chi_y),
        'eps_c_top': _num(eps_edge), 'eps_s_max': _num(eps_s_max),
        'failure_mode': failure_mode, 'layers': layers,
        'within_limits': True,
        'flexure_solved': True,
    }
    extra = {
        'd_eff': d_eff, 'as_tension': as_tension, 'd_eff_all': d_eff_all, 'z_na': z_na,
        'm_cr': m_cr, 'has_tension': bool(tension),
    }
    return public, extra


def _select_governing(combo_results):
    """§4.3 sin regel, håndhevet eksplisitt — IKKE overlatt til hva `max()` måtte finne på.

    1. Bare `within_limits: True` er kandidater.
    2. Størst `utilisation` blant dem.
    3. Uavgjort — OGSÅ når alle er 0, som i den committede fixturen, der `M_Ed = 0` gjør at
       samtlige kombinasjoner starter likt — vinner FØRSTE i rekkefølgen. `>` og ikke `>=`
       under er hele knepet: `best` byttes bare ut ved et STRENGT større tall, så en senere
       kombinasjon med samme utnyttelse aldri fortrenger en tidligere.
    4. Ingen kandidater ⇒ `None`.
    """
    candidates = [i for i, c in enumerate(combo_results) if c['within_limits']]
    if not candidates:
        return None
    best = candidates[0]
    for i in candidates[1:]:
        if (combo_results[i]['utilisation'] or 0.0) > (combo_results[best]['utilisation'] or 0.0):
            best = i
    return best


# ------------------------------------------------------------------ #
# run()
# ------------------------------------------------------------------ #

def _scipy_flavour():
    """`meta.scipy` skal si hva som faktisk regnet tallet, ikke hva vi hadde tenkt.

    Markøren settes av `wasm_stubs.install_stubs()`. Motoren importerer ikke den fila —
    den skal virke også når noen kjører den med ekte scipy på skrivebordet.
    """
    return 'stub' if getattr(sys.modules.get('scipy'), '__csc_stub__', False) else 'real'


def _error(code, message, detail=''):
    return {
        'ok': False,
        'schema': SCHEMA,
        'error': {'code': code, 'message': message, 'detail': str(detail)},
    }


def _utilisation(m_ed, m_rd):
    """Alltid den VERTIKALE utnyttelsen, M_Ed/M_Rd(N_Ed), i alle tre analysene.

    Radiell λ er et sekundært lastvei-tall og regnes i `charts.js`. Samme snitt og samme
    last skal aldri kunne vise to ulike η i to faner.
    """
    if not m_ed:
        return 0.0
    if not m_rd:
        return None
    return abs(m_ed) / abs(m_rd)


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


def run(payload: dict, progress=None) -> dict:
    """Kjører én analyse og gir resultatet i §5.2-form. Kaster aldri.

    `progress` er `progress(phase, done, total)` eller `None`. Worker-en sender inn en
    lambda som `postMessage`-er; skrivebordstesten sender `None` eller en liste-appender.

    Sjekken er `callable()` og ikke `is not None`, fordi JS sin `null` kommer inn som et
    `JsNull`-objekt — som verken ER `None` eller kan kalles. Målt under ekte Pyodide:
    `run_json(payload, null)` krasjet med «'JsNull' object is not callable» før dette.
    `null` er den naturlige måten en JS-konsument skriver «ingen framdrift» på, så
    motoren må tåle den.
    """
    if not callable(progress):
        progress = None
    t0 = time.perf_counter()
    try:
        result = _run_inner(payload, progress, t0)
    except Exception as exc:  # noqa: BLE001 — en motor som kaster låser UI-et
        return _error(
            type(exc).__name__,
            'The calculation could not be completed. Check the inputs and try again.',
            f'{exc}\n{traceback.format_exc()}',
        )

    # Siste sikring, §5.4. Slår den til, er det en feil i motoren og ikke i inndataen —
    # da skal den oppdages her og ikke som en tom graf hos brukeren.
    try:
        json.dumps(result, allow_nan=False)
    except (ValueError, TypeError) as exc:
        return _error(
            'non_serialisable_result',
            'The calculation produced a value that cannot be passed on. This is a bug '
            'in the module, not in your inputs.',
            exc,
        )
    return result


def _run_inner(payload, progress, t0):
    if int(payload.get('schema', SCHEMA)) != SCHEMA:
        return _error(
            'schema_mismatch',
            f'The payload uses schema version {payload.get("schema")}, the engine '
            f'expects {SCHEMA}.',
            'schema mismatch',
        )

    analysis = payload['analysis']
    if analysis not in ('bending', 'moment_curvature', 'nm_domain'):
        return _error(
            'unknown_analysis',
            f'Unknown analysis type "{analysis}".',
            f'analysis={analysis}',
        )

    opts = payload.get('options', {})
    combos, active_id = _normalise_loads(payload, opts)

    bundle = _prepare(payload, progress)
    section = bundle['section']
    conc = bundle['conc']
    steel = bundle['steel']
    b = bundle['b']
    h = bundle['h']
    sc = section.section_calculator

    rebar = payload['section']['rebar']
    as_total = sum(float(l['area']) for l in rebar)
    fctm = float(conc.fctm)
    fyk = float(payload['section']['steel']['fyk'])
    as_max = 0.04 * b * h

    warnings_out = list(_geometry_warnings(payload))
    geometry_ok = not any(w['code'] == 'bar_outside_section' for w in warnings_out)

    # Aksialsjekken skjer PER KOMBINASJON inne i `_solve_combo` (§4.4), ikke lenger som ett
    # globalt forhåndssjekk som velter hele kjøringen. `check_axial_load` ville ellers
    # kastet en rå engelsk ValueError fra innsiden av hver eneste kapasitetsberegning.
    n_min = float(sc.n_min)
    n_max = float(sc.n_max)

    # `shear_ctx` er `None` uten `section.shear` i payloaden — alle eksisterende fixturer
    # (før v4) mangler feltet, og skal fortsatt kjøre uendret uten en skjærblokk (§10 D1).
    shear_cfg = payload['section'].get('shear')
    shear_ctx = None
    if shear_cfg:
        shear_ctx = {
            'bw': b, 'fck': float(conc.fck), 'fcd': float(conc.fcd()),
            'ac': b * h, 'gamma_s': float(steel.gamma_s), 'cfg': shear_cfg,
        }

    law_c = payload['section']['concrete']['law']
    eps_c_name, eps_cu_name = _STRAIN_LIMITS.get(law_c, ('eps_c2', 'eps_cu2'))
    eps_c = float(getattr(conc, eps_c_name))
    eps_cu = float(getattr(conc, eps_cu_name))
    eps_yd = float(steel.epsyd)
    eps_ud = float(steel.epsud())

    # Kombinasjonsløkka går over ALLE radene i alle tre analysene (§10 C2). Skjær er rent
    # geometrisk — `_shear_result` leser bare `bw`, `A_sl`/`d`, kombinasjonens fortegn på
    # `M_Ed`, `N_Ed`, `V_Ed` og materialene, ALDRI et tøyningsplan — så det har et svar for
    # enhver rad uten at bruddtilstanden er løst. Løste M–κ som før bare den aktive raden,
    # kunne `shear_governing` per definisjon aldri peke på noen annen enn den aktive, og
    # skjærtallene ble dermed avhengige av HVILKEN analyse brukeren tilfeldigvis kjørte.
    # Det er nettopp det skjær ikke skal være.
    #
    # BØYNINGEN løses derimot fortsatt bare for den aktive raden i M–κ (`solve_flexure`):
    # `solver-client.js` kjører én motorrunde per κ-punkt, så alt løkka gjør her betales
    # 20+ ganger per kurve. Skjær tåler det (mikrosekunder), en bruddtilstand gjør det ikke.
    #
    # Framdrift: løkka er den ENESTE skriveren av 'solve'-fasen — men bare for bøying og
    # M–N. M–κ har sin egen, indre skriver i `_moment_curvature` (§4.5), og to skrivere til
    # samme fase ville vært en felle, ikke en funksjon; derfor tier løkka for M–κ.
    is_mc = analysis == 'moment_curvature'
    emit_solve_progress = progress is not None and not is_mc
    # Den aktive radens indeks må stå FØR løkka: det er den ene raden M–κ løser bøyning for.
    # Reserven `0` er samme regel som `_normalise_loads` bruker når `active` ikke finnes.
    active_index = next((i for i, c in enumerate(combos) if c['id'] == active_id), 0)
    combo_results = []
    combo_extras = []
    n_combos = len(combos)
    for i, combo in enumerate(combos):
        if emit_solve_progress:
            progress('solve', i, n_combos)
        public, extra = _solve_combo(
            combo, sc, rebar, steel, b, h, fctm, eps_yd, eps_ud, eps_cu, n_min, n_max,
            shear_ctx, warnings_out,
            solve_flexure=(not is_mc or i == active_index),
        )
        combo_results.append(public)
        combo_extras.append(extra)
    if emit_solve_progress:
        progress('solve', n_combos, n_combos)

    if is_mc:
        # KURVEN regnes for DEN AKTIVE kombinasjonen alene (§4.3): `chi_plan` er bare
        # meningsfullt for én kombinasjon om gangen (§3.7), og alt M–κ-blokka ellers speiler
        # (θ, N_Ed, M_Rd, `section_props`) hører til nettopp den raden. Derfor er den aktive
        # raden også `ref` her, og ikke den med størst utnyttelse — ellers ville
        # overskriftens retning og kurven beskrevet to forskjellige kombinasjoner.
        # `fallback_index` MÅ av samme grunn være den aktive raden og ikke rad 0: de andre
        # radene har ingen bøyeløsning (`solve_flexure=False`), så `_moment_curvature` og
        # `_compression_zone_warning` ville fått `M_Rd = None` i hendene.
        fallback_index = active_index
        governing_index = (
            active_index if combo_results[active_index]['within_limits'] else None
        )
    else:
        fallback_index = 0
        governing_index = _select_governing(combo_results)

    # Skjær har sitt EGET, uavhengige governing-valg (§4.3) — en rad med stor `V_Ed` og
    # lite `M_Ed` kan styre skjær uten å være i nærheten av å styre bøying. Etter at løkka
    # ble felles er dette valget det samme i alle tre analysene, som det skal være.
    shear_governing_id = _select_shear_governing(combo_results)

    # §4.3 regel 4: ingen kandidater ⇒ `governing: null`, og toppnivåfeltene speiler i
    # stedet reserveraden, slik at figurer og tabeller har noe å vise. Reserven er den
    # FØRSTE kombinasjonen for bøying og M–N, men den AKTIVE for M–κ — der er det den
    # aktive raden blokka handler om, også når den ligger utenfor [n_min, n_max].
    has_candidate = governing_index is not None
    ref_index = governing_index if has_candidate else fallback_index
    ref = combo_results[ref_index]
    ref_extra = combo_extras[ref_index]
    governing_id = ref['id'] if has_candidate else None

    d_eff = ref_extra['d_eff']
    as_tension = ref_extra['as_tension']
    d_eff_all = ref_extra['d_eff_all']
    m_cr = ref_extra['m_cr']
    has_tension = ref_extra['has_tension']

    # A_s,min etter EC2 9.2.1.1 regnes HER og ikke via `ec2_2004.As_min` — den funksjonen
    # har signaturen As_min(A_ct, sigma_s, fct_eff, k, kc) og er rissviddeminimumet etter
    # 7.3.2, et helt annet krav. Bøyeminimumet finnes ikke i pakka. Den bruker GOVERNING
    # sin `d_eff` (§4.3) — de andre kombinasjonenes tøyningsplan er ikke det UI og rapport
    # viser fram.
    as_min = max(0.26 * fctm / fyk * b * d_eff, 0.0013 * b * d_eff) if d_eff else None

    if ref['within_limits']:
        cz = _compression_zone_warning(
            payload, bundle, ref['eps_a'], ref['chi_y'], ref_extra['z_na'],
        )
        if cz is not None:
            warnings_out.append(cz)

    # ---------------------------------------------------------------- #
    # Kontrollene — TREVERDIGE (plan runde 6 §1.1)
    # ---------------------------------------------------------------- #
    # `True` = kravet gjelder og er oppfylt. `False` = kravet gjelder og er ikke oppfylt.
    # `None` = motoren kan ikke hevde noen av delene, enten fordi klausulen ikke gjelder
    # denne tilstanden eller fordi tilstanden aldri ble regnet. Grunnen til `None` ligger
    # ALLTID i `warnings` (`assessment_incomplete`), aldri i kontrollverdien.
    #
    # Det gamle `bool(as_min is None or …)` og `bool(eps_s_max is not None and …)` sto ved
    # siden av hverandre med to MOTSATTE konvensjoner for det samme ukjente: den ene lot
    # ukjent bli bestått, den andre lot ukjent bli et påstått brudd. Begge var feil. Målt
    # på referansebjelken som støttemoment med N = −500 kN ga de til sammen «A_s,min OK med
    # 42× margin» og «over-reinforced» for et snitt uten ett eneste jern på strekksiden.
    #
    # `null_reasons` samles opp mens kontrollene avgjøres, slik at grunnen skrives ned DER
    # den er kjent og ikke rekonstrueres etterpå av den som formulerer advarselen.
    eps_s_max = ref['eps_s_max']
    null_reasons = {}

    # DUKTILITET spør om STREKKarmeringen flyter ved brudd. Finnes det ingen strekkarmering,
    # finnes ikke spørsmålet — og `eps_s_max` er da ikke en strekktøyning i det hele tatt,
    # bare den minst negative trykktøyningen. Er strekksettet derimot ikke tomt, ER
    # `eps_s_max` lik maks over strekksettet (maksimum over alle lag oppnås nødvendigvis i
    # et lag med ε > 0), så feltet beholder sin betydning uendret og leses her direkte.
    if has_tension is None:
        ductility_ok = None
        null_reasons['ductility_ok'] = (
            'no failure state was computed for the governing load combination'
        )
    elif not has_tension:
        ductility_ok = None
        null_reasons['ductility_ok'] = (
            'no reinforcement layer is in tension at failure, so there is no tensile '
            'strain to compare with ε_yd'
        )
    else:
        ductility_ok = bool(eps_s_max >= eps_yd)

    # A_s,min sammenliknes mot `As_tension`, ikke mot `As_total`: kravet gjelder armeringen
    # på strekksiden, og `rho` rett nedenfor har brukt samme teller i flere runder allerede
    # med den samme begrunnelsen — teller og nevner må gjelde den samme armeringen.
    # `as_min` er `None` nøyaktig når `d_eff` er det, altså når strekksettet er tomt eller
    # bruddtilstanden aldri ble regnet. Da er surrogatet A_s,min ∝ d ikke definert.
    if as_min is None:
        as_min_ok = None
        null_reasons['as_min_ok'] = (
            'the effective depth d is undefined — no reinforcement is in tension at '
            'failure, so A_s,min = 0.26·f_ctm/f_yk·b_t·d cannot be formed'
        )
    else:
        as_min_ok = bool(as_tension >= as_min)

    as_max_ok = bool(as_total <= as_max)
    # `axial_ok` er sant BARE hvis samtlige løste kombinasjoner ligger innenfor (§4.4).
    axial_ok = all(c['within_limits'] for c in combo_results)

    # BØYEKONTROLLEN, som manglet helt: `_utilisation` regnet tallet og ingen leste det.
    # Målt på referansebjelken med M_Ed = −500 kNm mot M_Rd = −215,0 kNm ga motoren
    # η = 2,33 og «Overall assessment: OK» uten en eneste advarsel.
    #
    # DEFINISJONSMENGDEN er radene som er BÅDE innenfor `[n_min, n_max]` og faktisk løst.
    # Ikke bare governing: i M–κ løses bare den aktive raden, og de uløste må falle UT av
    # mengden i stedet for å telles som bestått. Er mengden tom, er kontrollen ubesvart.
    #
    # TERSKELEN er nøyaktig `η ≤ 1,0`, uten toleranse. Det er ikke en smaksak:
    # `results.js` har `UTILISATION_THRESHOLDS.over = 1.0` og bruker strengt `x > 1.0` til
    # den røde pilla. En slakk på 1e-6 her ville gitt η = 1,0000005 med rød pille «Capacity
    # exceeded» ved siden av en grønn kontrollrad «OK» — nøyaktig den selvmotsigelsen
    # tabellen finnes for å hindre.
    bending_rows = [c for c in combo_results
                    if c['within_limits'] and c['flexure_solved']]
    over_utilised = [c for c in bending_rows
                      if c['utilisation'] is not None and c['utilisation'] > 1.0]
    if over_utilised:
        bending_ok = False
    elif not bending_rows:
        bending_ok = None
        null_reasons['bending_ok'] = (
            'no load combination has both an axial force within [N_min, N_max] and a '
            'computed failure state'
        )
    elif any(c['utilisation'] is None for c in bending_rows):
        bending_ok = None
        null_reasons['bending_ok'] = (
            'the bending resistance is zero for at least one combination, so the '
            'utilisation M_Ed/M_Rd is not a number'
        )
    else:
        bending_ok = True

    # SPRØBRUDD: `|M_Rd| ≥ M_cr`. Dette er det fysiske kriteriet EC2 9.2.1.1 er et forenklet
    # surrogat FOR, og 9.2.1.1(1) sier selv at et snitt under A_s,min «should be considered
    # as unreinforced». Kontrollen trengs ved siden av A_s,min fordi surrogatet degenererer
    # nettopp der `d` gjør det: i støttemomentet med bare underkantarmering er A_s,min
    # 22,6 mm² mot 942 mm² armering — bestått med 42× margin — mens M_Rd = 6,4 kNm ligger
    # under M_cr = 52,1 kNm. Snittet går i stykker i det øyeblikket det risser.
    #
    # Den leser GOVERNING sin `M_Rd` og `M_cr`, samme rad som `d_eff`, `As_min` og `rho`,
    # og samme `M_cr` som `section_props` viser — ett tall, én kilde, én rad. Kontrollen
    # dekker dermed ikke en ikke-styrende kombinasjon med en annen `N_Ed`.
    if ref['M_Rd'] is None:
        brittle_ok = None
        null_reasons['brittle_ok'] = (
            'no bending resistance was computed for the governing load combination'
        )
    else:
        # MATERIALNIVAAET MAA VAERE DET SAMME PAA BEGGE SIDER.
        #
        # EC2 9.2.1.1 utleder A_s,min med KARAKTERISTISK flytespenning:
        #   A_s,min = 0,26 * f_ctm / f_yk * b_t * d
        # mens `M_Rd` er en DIMENSJONERENDE kapasitet og baerer gamma_s = 1,15.
        # Sammenliknes de to raatt, blir kontrollen systematisk 1,15 ganger strengere
        # enn den A_s,min-kalibreringen den skal speile — og da underkjenner den snitt
        # som oppfyller EC2 eksakt.
        #
        # MAALT, plate 1000 x h armert NOEYAKTIG til A_s,min (altsaa as_min_ok = True):
        #   h = 200  d/h = 0,795   M_Rd/M_cr = 0,903   <-- ville feilet
        #   h = 300  d/h = 0,863               1,065
        #   h = 600  d/h = 0,925               1,223
        # Forholdet skalerer som (d/h)^2, fordi M_Rd ~ A_s,min*f_yd*z ~ d^2 mens
        # M_cr ~ h^2. Bjelker ligger paa d/h ~ 0,87-0,92 og gikk klar; plater ligger paa
        # 0,73-0,80 og gjorde det ikke. Feilen ville altsaa rammet nettopp plater, og
        # bare dem — den vanskeligste sorten aa oppdage.
        #
        # 0,903 * 1,15 = 1,038. Faktoren som manglet ER gamma_s, ikke en justering.
        # Vi loefter derfor kapasiteten til karakteristisk nivaa i sammenlikningen.
        # Brukerens tilfelle bestaar fortsatt ikke: 6,4 / 52,1 = 0,123, og 0,141 med
        # gamma_s — et snitt uten strekkarmering blir ikke reddet av et materialnivaa.
        gamma_s = float(steel.gamma_s) or 1.15
        brittle_ok = bool(abs(ref['M_Rd']) * gamma_s >= m_cr)

    # ADVARSLER: en advarsel legges BARE når den tilhørende kontrollen er `False`, aldri på
    # `None`. `if not ok` ville slått til på begge — og gjorde det: `ductility_limit` trykte
    # ordrett «eps_s_max=None < eps_yd=0.00217» ut i rapporten, en påstand om et bruddplan
    # som aldri ble regnet. Ingen advarsel skal sitere et tall som ikke finnes; testen
    # `test_no_warning_quotes_a_value_that_was_never_computed` håndhever det.
    if as_min_ok is False:
        warnings_out.append(_warning(
            'as_min_not_met',
            f'The tension reinforcement area {as_tension:.0f} mm² is less than the '
            f'minimum reinforcement {as_min:.0f} mm² per EC2 9.2.1.1.',
            f'As_tension={as_tension} < As_min={as_min}',
            severity='error',
        ))
    if as_max_ok is False:
        warnings_out.append(_warning(
            'as_max_exceeded',
            f'The reinforcement area {as_total:.0f} mm² exceeds the maximum reinforcement '
            f'{as_max:.0f} mm² (0.04·A_c) per EC2 9.2.1.1.',
            f'As={as_total} > As_max={as_max}',
            severity='error',
        ))
    if ductility_ok is False:
        warnings_out.append(_warning(
            'ductility_limit',
            'The reinforcement does not yield at failure — the cross-section is '
            'over-reinforced and will fail without warning. Increase the cross-section or '
            'reduce the reinforcement.',
            f'eps_s_max={eps_s_max} < eps_yd={eps_yd}',
        ))
    if bending_ok is False:
        # ÉN advarsel som navngir den verste raden, ikke én per rad. `axial_out_of_range`
        # legger én per kombinasjon fordi hver av dem har sin egen grunn til å ligge
        # utenfor; her er grunnen den samme for alle, og en liste med ti like meldinger
        # ville skjult de andre advarslene i stedet for å opplyse. Antallet står i `detail`.
        worst = max(over_utilised, key=lambda c: c['utilisation'])
        warning = _warning(
            'bending_capacity_exceeded',
            f'The design moment exceeds the bending resistance: M_Ed = '
            f'{worst["M_Ed"] / 1e6:.1f} kNm against M_Rd = {worst["M_Rd"] / 1e6:.1f} kNm, '
            f'utilisation {worst["utilisation"]:.3f}. Increase the cross-section or the '
            'reinforcement, or reduce the load.',
            f'M_Ed={worst["M_Ed"]}, M_Rd={worst["M_Rd"]}, '
            f'utilisation={worst["utilisation"]} > 1.0 '
            f'({len(over_utilised)} of {len(bending_rows)} combinations)',
            severity='error',
        )
        # Samme merking som `axial_out_of_range` (§4.4): uten `combo` kaster `results.js`
        # sin kodetabell motorens egen `message`, og hvilken rad det gjelder forsvinner.
        warning['combo'] = worst['id']
        warning['combo_name'] = worst['name']
        warnings_out.append(warning)
    if brittle_ok is False:
        warnings_out.append(_warning(
            'brittle_failure_risk',
            f'The bending resistance {abs(ref["M_Rd"]) / 1e6:.1f} kNm is below the '
            f'cracking moment {m_cr / 1e6:.1f} kNm. The cross-section fails the moment it '
            'cracks, without warning — EC2 9.2.1.1(1) treats such a section as '
            'unreinforced. Add reinforcement on the tension side.',
            f'|M_Rd|={abs(ref["M_Rd"])} < M_cr={m_cr}',
            severity='error',
        ))

    # Skjærkontrollene (§4.3) er UAVHENGIGE av `within_limits`/`governing_index` — de leser
    # `combo_results[i]['shear']` direkte, som finnes for enhver kombinasjon (§4.1b).
    # `asw_s`/`asw_s_min` avhenger bare av `bw`/`fywk`/bøylene, ikke av lasten, og er derfor
    # samme tall for alle evaluerte kombinasjoner — det holder å lese det første.
    evaluated_shear = [c['shear'] for c in combo_results
                        if c.get('shear') and c['shear'].get('evaluated')]
    stirrups_cfg = (shear_ctx['cfg'].get('stirrups') or []) if shear_ctx else []
    shear_ok = (
        all(s['V_Rd'] is None or s['V_Ed'] <= s['V_Rd'] for s in evaluated_shear)
        if evaluated_shear else True
    )
    if stirrups_cfg and evaluated_shear:
        asw_s_min_ref = evaluated_shear[0]['asw_s_min']
        asw_min_ok = bool(asw_s_min_ref is None or evaluated_shear[0]['asw_s'] >= asw_s_min_ref)
        min_sl_max = min(
            (s['sl_max'] for s in evaluated_shear if s['sl_max'] is not None), default=None,
        )
        stirrup_spacing_ok = bool(
            min_sl_max is None
            or all(float(st['spacing']) <= min_sl_max for st in stirrups_cfg)
        )
    else:
        # EC2 6.2.1(4)/9.3.2: unntatt uten skjærarmering (plan §4.4) — plata er nettopp
        # dette tilfellet, og skal ikke feile bare fordi den ikke har bøyler.
        asw_min_ok = True
        stirrup_spacing_ok = True

    checks = {
        'as_min_ok': as_min_ok,
        'as_max_ok': as_max_ok,
        'ductility_ok': ductility_ok,
        'brittle_ok': brittle_ok,
        'axial_ok': axial_ok,
        'geometry_ok': bool(geometry_ok),
        'bending_ok': bending_ok,
        'shear_ok': bool(shear_ok),
        'asw_min_ok': bool(asw_min_ok),
        'stirrup_spacing_ok': bool(stirrup_spacing_ok),
    }
    # ALLE kontrollene, ikke bare de fire bøyningen alltid hadde. En «Overall assessment:
    # OK» som overser en aksialkraft utenfor [n_min, n_max] eller en strøket skjærkontroll
    # er aktivt misvisende i et verktøy som dimensjonerer betong — rapporten viser nettopp
    # denne raden som samlet vurdering. `_three_valued_and` leser `checks` slik den står,
    # så en kontroll som legges til over blir med i totalen uten at noen må huske det.
    checks['all_ok'] = _three_valued_and(checks)

    # «–» i «Overall assessment» betyr presist «motoren kan ikke gå god for dette snittet».
    # Den påstanden må kunne forklares, ellers står streken like uforklart som en grønn
    # hake ville gjort. Advarselen er derfor ikke pynt: den er den eneste bæreren av
    # grunnen til at kontrollen er ubesvart (§1.1).
    if null_reasons:
        ordered = [k for k in checks if k in null_reasons]
        warnings_out.append(_warning(
            'assessment_incomplete',
            'The overall assessment is incomplete: '
            + str(len(ordered))
            + (' check could not be evaluated.' if len(ordered) == 1
               else ' checks could not be evaluated.'),
            # GRUNNENE HOERER HJEMME I `detail`, IKKE I `message`.
            # `describeWarning` i `js/results.js` KASTER motorens `message` for enhver
            # kode den kjenner, og viser bare `detail`. Laa grunnene i `message`, fikk
            # brukeren noekkelnavnene «as_min_ok, ductility_ok» og aldri hvorfor — mens
            # planens §1.1 krever at grunnen til «–» ALLTID naar fram. Maalt: grunnene
            # overlevde ikke til skjermen foer dette ble flyttet.
            ' '.join(f'{key}: {null_reasons[key]}.' for key in ordered),
            severity='warning',
        ))

    theta_ref = ref['theta']

    common = {
        'ok': has_candidate,
        'schema': SCHEMA,
        'analysis': analysis,
        'meta': {
            'structuralcodes_version': structuralcodes.__version__,
            'engine_version': ENGINE_VERSION,
            'runtime': _runtime_name(),
            'integrator': 'marin',
            'scipy': _scipy_flavour(),
            'theta': _num(theta_ref),
            'direction': 'hogging' if _is_hogging(theta_ref) else 'sagging',
            'subtract_bar_area': bool(opts.get('subtract_bar_area', False)),
            'wall_time_ms': None,  # settes helt til slutt
        },
        'materials': {
            'fck': _num(conc.fck),
            'fcd': _num(conc.fcd()),
            'fctm': _num(fctm),
            'alpha_cc': _num(payload['section']['concrete']['alpha_cc']),
            'gamma_c': _num(payload['section']['concrete']['gamma_c']),
            'Ecm': _num(conc.Ecm),
            'law_concrete': law_c,
            'eps_c': _num(eps_c),
            'eps_cu': _num(eps_cu),
            'eps_c_name': eps_c_name,
            'eps_cu_name': eps_cu_name,
            'fyk': _num(steel.fyk),
            'ftk': _num(steel.ftk),
            'Es': _num(steel.Es),
            'k': _num(payload['section']['steel'].get('k')),
            'gamma_s': _num(payload['section']['steel']['gamma_s']),
            'gamma_eps': _num(payload['section']['steel']['gamma_eps']),
            'law_steel': payload['section']['steel']['law'],
            'fyd': _num(steel.fyd()),
            'ftd': _num(steel.ftd()),
            'eps_yd': _num(eps_yd),
            'eps_uk': _num(steel.epsuk),
            'eps_ud': _num(eps_ud),
        },
        'section_props': {
            'Ag': _num(b * h),
            'As_total': _num(as_total),
            # ρ er EC2 sin ρ_l: STREKKARMERINGEN over `b_t·d`, med samme `d` som under.
            # Teller og nevner må gjelde den samme armeringen. `As_total/(b·d_eff)` ville
            # vært total armering delt på strekkarmeringens dybde — en størrelse som ikke
            # betyr noe for et dobbeltarmert snitt, men som en leser tar for ρ_l.
            # `d_eff_all` og `As_tension` ligger ved siden av slik at rapporten kan vise
            # hva som er med i hvilket tall — valget skal være synlig, ikke gjemt bort.
            'rho': _num(as_tension / (b * d_eff)) if d_eff else None,
            'b_t': _num(b),
            'd_eff': _num(d_eff),
            'd_eff_all': _num(d_eff_all),
            'As_tension': _num(as_tension),
            'As_min': _num(as_min),
            'As_max': _num(as_max),
            # Riss-momentet for GOVERNING sin `N_Ed` — samme rad og samme tall som
            # `checks.brittle_ok` leser. Står her og ikke per kombinasjon nettopp for at
            # det ikke skal finnes to M_cr å velge mellom for den som tegner eller trykker.
            #
            # `None` når referanseraden ligger UTENFOR [n_min, n_max]. `M_cr` regnes før
            # aksialsjekken (den avhenger ikke av bruddtilstanden), så uten denne vakten
            # trykte rapporten et riss-moment for en lasttilstand motoren selv hadde
            # forkastet: målt 2052 kNm ved N = −20 000 kN, som svarer til 111 MPa
            # aksialspenning i en C30 — 3,7 ganger f_ck. Samme doktrine som `d_eff`, `ρ`
            # og `A_s,min` allerede følger her: et tall uten grunnlag skal ikke stå.
            'M_cr': _num(m_cr) if ref.get('within_limits') else None,
            'n_min': _num(n_min),
            'n_max': _num(n_max),
        },
        'checks': checks,
        'warnings': warnings_out,
    }

    if not has_candidate:
        # Full konvolutt, ikke bare `{ok, schema, error}` (§4.4): figurer, tabeller og
        # rapport skal fortsatt ha noe å tegne selv når ingen kombinasjon var innenfor.
        common['error'] = {
            'code': 'axial_out_of_range',
            'message': (
                'No load combination has an axial force within the range this '
                f'cross-section can carry: [{n_min / 1e3:.1f} kN, {n_max / 1e3:.1f} kN] '
                '(compression negative).'
            ),
            'detail': f'n_min={n_min}, n_max={n_max}',
        }

    # Bruddtilstanden ved GOVERNING sin N_Ed, med de nøkkelnavnene UI og rapport leser
    # GENERISK. Den hører hjemme i mer enn én analyseblokk: `calculate_bending_strength`
    # kjøres uansett hvilken analyse som er valgt, og tøyningsplanet den gir er det samme
    # uansett hva vi tegner ved siden av. Å la det bli liggende ubrukt i M–N-analysen —
    # der brukeren oftest VIL inspisere nøytralakse og bruddform, fordi det er søyler med
    # aksialkraft — ville vært å kaste bort et svar vi allerede har regnet.
    if analysis == 'bending':
        common['bending'] = {
            'N_Ed': ref['N_Ed'], 'M_Ed': ref['M_Ed'], 'M_Rd': ref['M_Rd'],
            'eps_a': ref['eps_a'], 'chi_y': ref['chi_y'],
            'x': ref['x'], 'x_over_d': ref['x_over_d'],
            'eps_c_top': ref['eps_c_top'], 'eps_s_max': ref['eps_s_max'],
            'failure_mode': ref['failure_mode'], 'layers': ref['layers'],
            'utilisation': ref['utilisation'],
            'combinations': combo_results,
            'governing': governing_id,
            'shear_governing': shear_governing_id,
        }
    elif analysis == 'moment_curvature':
        if ref['within_limits']:
            mc = _moment_curvature(
                sc, ref['theta'], ref['N_Ed'], ref['M_Ed'], ref['M_Rd'], ref['chi_y'],
                opts, warnings_out, progress,
            )
        else:
            # Ingen tøyningsplan å drive en kurve fra — se `_solve_combo` sin
            # `axial_out_of_range`-advarsel over. Kurven blir tom, ikke gjettet på.
            mc = {
                'N_Ed': ref['N_Ed'], 'kappa': [], 'moment': [], 'chi_plan': None,
                'yield_index': None, 'M_Rd': None, 'M_Ed': ref['M_Ed'],
                'utilisation': None, 'truncated': False,
            }
        mc['combinations'] = combo_results
        # §4.3 krever `governing` i HVER analyseblokk, også når det bare er én kombinasjon
        # å velge blant — ellers står M–κ igjen som eneste blokk uten den nøkkelen.
        mc['governing'] = governing_id
        mc['shear_governing'] = shear_governing_id
        common['moment_curvature'] = mc
        common['meta']['mc_active_combo'] = ref['id']
    else:
        # Omhyllingen regnes med TVERRSNITTETS EGEN retning (`options.theta`), IKKE med
        # governing sin — governing kan hoppe fra felt- til støttemoment bare fordi
        # brukeren endrer ett tall i kombinasjonstabellen, og omhyllingen skal stå stille
        # mens man redigerer (§4.1). Med RÅ `m` (§1.4/§1.5) trengs det ikke lenger noe eget
        # sonde-kall for å finne et fortegn å dreie med — `dom.m_y` er allerede riktig i
        # pakkens egen konvensjon, og punktmengden er dessuten identisk for θ = 0 og θ = π
        # (bare traverseringsrekkefølgen snur, verifisert i planens §1.5) — så selve valget
        # av `domain_theta` er nå bare en bekvemmelighet, ikke en nødvendighet.
        domain_theta = float(opts.get('theta', 0.0))

        arrays = _nm_domain_arrays(sc, domain_theta, opts, warnings_out)
        common['nm_domain'] = dict(
            arrays,
            eps_a=ref['eps_a'], chi_y=ref['chi_y'],
            x=ref['x'], x_over_d=ref['x_over_d'],
            eps_c_top=ref['eps_c_top'], eps_s_max=ref['eps_s_max'],
            failure_mode=ref['failure_mode'], layers=ref['layers'],
            N_Ed=ref['N_Ed'], M_Ed=ref['M_Ed'],
            M_Rd_at_N=ref['M_Rd'], M_Rd=ref['M_Rd'],
            utilisation=ref['utilisation'],
            N_min=_num(n_min), N_max=_num(n_max),
            combinations=combo_results, governing=governing_id,
            shear_governing=shear_governing_id,
            # `domain_theta` sier hvilken theta omhyllingen ble regnet med. `meta` er en
            # søsken av `nm_domain`, ikke en forelder — `charts.js` får bare
            # `result.nm_domain` alene, så blokka må være selvforsynt (§1.5 fjernet den
            # tilsvarende `meta.domain_theta`, som ingen produksjonskode leste).
            domain_theta=_num(domain_theta),
        )

    common['meta']['wall_time_ms'] = _num(round((time.perf_counter() - t0) * 1000, 1))
    return common


def _runtime_name():
    """Rapporten skal kunne si hvor tallet ble regnet uten at motoren importerer `js`."""
    if sys.platform == 'emscripten':
        return f'pyodide (python {platform.python_version()})'
    return f'cpython {platform.python_version()}'


# Hvor mye det siste M–κ-punktet får avvike fra M_Rd før vi sier fra. Noen få promille er
# konvergenstoleranse; mer enn det er et annet likevektspunkt.
_MC_ENDPOINT_TOL = 3e-3


def _moment_curvature(sc, theta, n_ed, m_ed, m_rd, bend_chi_y, opts,
                      warnings_out, progress):
    """M–κ. Enten hele kurven i ett kall, eller ETT punkt når JS driver den.

    JS-drevet modus finnes fordi moment–krumning er den eneste analysen som tar mer enn et
    blunk (~32 integrasjoner per punkt): da får framdriftslinja ekte telling, og «Avbryt»
    er å la være å sende neste bit i stedet for å rive ned en 10 MB runtime.

    `chi_plan` er alltid med i svaret, også når vi regner alt selv. Det er den eneste
    måten JS kan vite HVILKE krumninger som skal kjøres — grensene regnes inne i pakka av
    `_prepare_chi_array`, og JS har ingen mulighet til å gjette dem.

    BRUDDPUNKTET REGNES SOM BØYEKAPASITET, IKKE SOM ET FASTKRUMNINGS-LØS
    Pakkas løkke fører forrige punkts tøyningsnivå videre som startgjett. Deler man løkka
    opp — som JS må for å få determinat framdrift — mister man det, og ved bruddkrumningen
    er det nettopp der det betyr mest: målt på standardtilstanden (C30/37, α_cc 0,85,
    3Ø20) ga siste punkt **126,2 kNm drevet mot 201,0 kNm samlet**, 37 % for lavt, og
    ingenting feilet. Ved bruddkrumningen finnes det mer enn ett likevektsplan, og et
    dårlig startgjett lander på feil ett.

    Løsningen er ikke å føre startgjettet videre, men å slutte å gjette: bruddpunktet på
    M–κ-kurven ER bøyekapasiteten, og `calculate_bending_strength` regner den eksakt med
    fastpunkt-metoden. Vi bytter derfor inn det tallet i BEGGE modi. At det gjelder begge
    er poenget — ellers ville en drevet kurve og et samlet kall endt på ulike verdier, og
    da er «driv kurven punkt for punkt» ikke lenger den samme beregningen.

    Uansett legges `mc_endpoint_mismatch` når pakkas eget siste punkt avviker fra `M_Rd`
    med mer enn noen få promille. At en 37 %-feil kunne vises helt uten varsel er den
    delen av dette som er verst; sjekken står igjen selv om innbyttet skulle svikte.
    """
    pre = int(opts.get('mc_pre_yield', 10) or 10)
    post = int(opts.get('mc_post_yield', 10) or 10)
    mc_chi = opts.get('mc_chi', None)

    chi_plan = _chi_plan(sc, theta, n_ed, pre, post, warnings_out)

    if mc_chi is None:
        chi_input = None
        expected = pre + post
    else:
        # `mc_chi` er FORTSATT en STØRRELSE (plan v4 §1.4), selv om resten av M–κ-kurven nå
        # er rå. Pakka vil ha krumningen i sitt eget roterte system, der den alltid er
        # negativ uansett `theta` — `theta` er allerede innbakt i rotasjonen. Fjernes denne
        # `abs`-en, brekker JS-drevet moment–krumning for støttemoment: krevde vi
        # fortegnsatt inndata, måtte hver konsument vite nøyaktig hvilket fortegn pakka
        # venter, og en glipp der ga et moment på 0,4 kNm i stedet for 114 kNm uten at noe
        # feilet. Fortegnsatt inndata godtas fortsatt, men absoluttverdien er sannheten.
        raw = mc_chi if isinstance(mc_chi, (list, tuple)) else [mc_chi]
        chi_input = [-abs(float(v)) for v in raw]
        expected = len(chi_input)

    if progress is not None:
        progress('solve', 0, expected)

    with _Capture() as cap:
        res = sc.calculate_moment_curvature(
            theta=theta,
            n=n_ed,
            num_pre_yield=pre,
            num_post_yield=post,
            chi=chi_input,
        )
    _drain(cap.records, warnings_out)

    # `calculate_moment_curvature` AVKORTER arrayene ved manglende konvergens og bryter.
    # Derfor er `len(res.chi_y)` fasiten, aldri pre+post.
    got = len(res.chi_y)
    truncated = bool(got < expected)
    if truncated:
        warnings_out.append(_warning(
            'mc_truncated',
            f'The moment–curvature curve stopped after {got} of {expected} points '
            'because the calculation no longer converged. The curve is valid as far as '
            'it goes.',
            f'len(chi_y)={got}, expected={expected}',
        ))

    yield_index = pre - 1 if (mc_chi is None and got >= pre) else None

    # RÅ, i pakkens eget fortegn (plan v4 §1.4) — `chi_plan` under er det ENE unntaket som
    # fortsatt er en størrelse, se `_chi_plan`.
    kappa = _arr(res.chi_y)
    moment = _arr(res.m_y)

    # Hvilke av punktene vi nettopp regnet ER bruddkrumningen?
    ultimate = chi_plan[-1] if chi_plan else None
    targets = []
    if ultimate:
        if chi_input is None:
            # Samlet kall: bruddpunktet er det siste, med mindre kurven ble avkortet.
            if not truncated and got:
                targets = [got - 1]
        else:
            targets = [i for i, c in enumerate(chi_input)
                       if i < got and math.isclose(abs(c), ultimate, rel_tol=1e-9)]

    for i in targets:
        package_m = moment[i]
        if package_m is not None and m_rd and \
                abs(package_m - m_rd) / abs(m_rd) > _MC_ENDPOINT_TOL:
            # `info`, ikke `warning`: α_cc 0,85 er norsk NA og UI-ets standard, så denne
            # utløses ved omtrent hver eneste M–κ-kjøring. En advarsel som alltid står der
            # slutter å bety noe og lærer brukeren å overse de som teller. Og innholdet
            # forsvarer den ikke — sluttpunktet som RAPPORTERES er eksakt. Meldinga sier
            # derfor hva som skjedde, og ingenting spekulativt om resten av kurven:
            # nabopunktene er målt til å ligge der de skal.
            warnings_out.append(_warning(
                'mc_endpoint_mismatch',
                f'At the ultimate curvature, the fixed-curvature solution gave '
                f'{package_m / 1e6:.1f} kNm, while the bending resistance is '
                f'{m_rd / 1e6:.1f} kNm — the equilibrium search at failure found a '
                'different strain plane. The curve is terminated at the bending '
                'resistance, which is the exact value.',
                f'fixed-curvature m_y = {package_m}, calculate_bending_strength M_Rd = '
                f'{m_rd}, rel = {(package_m - m_rd) / m_rd:.6e}',
                severity='info',
            ))
        kappa[i] = _num(bend_chi_y) if bend_chi_y else kappa[i]
        moment[i] = _num(m_rd)

    if progress is not None:
        progress('solve', got, expected)

    return {
        'N_Ed': _num(n_ed),
        'kappa': kappa,
        'moment': moment,
        'chi_plan': chi_plan,
        'yield_index': yield_index,
        'M_Rd': _num(m_rd),
        'M_Ed': _num(m_ed),
        'utilisation': _num(_utilisation(m_ed, m_rd)),
        'truncated': truncated,
    }


def _chi_plan(sc, theta, n_ed, pre, post, warnings_out):
    """Krumningsrutenettet pakka ville brukt, som STØRRELSER.

    Bygges via pakkas eget `_prepare_chi_array` slik at et JS-drevet punktløp treffer
    nøyaktig de samme krumningene som et samlet løp ville gjort. Skulle den private
    metoden forsvinne i en oppgradering, faller vi tilbake til `None`: da mister JS bare
    muligheten til å drive punktvis, mens alt annet virker.

    HVORFOR INTEGRASJONSDATAENE MÅ ROTERES MED
    `calculate_moment_curvature` roterer den cachede `integration_data` med `-theta` FØR
    den kaller `_prepare_chi_array`, og tilbake etterpå. Gjør man ikke det samme her,
    leser `find_equilibrium_fixed_pivot` armeringsdata i feil koordinatsystem og finner
    en annen flyt- og bruddkrumning. For θ = 0 er rotasjonen identiteten, så feilen er
    usynlig; for θ = π ga den en plan på 10 punkter mot 20 i det samlede kallet, med
    verdier som ikke sammenfalt — altså en helt annen kurve, uten at noe feilet.
    """
    prepare = getattr(sc, '_prepare_chi_array', None)
    rotate_data = getattr(sc, '_rotate_integration_data', None)
    if prepare is None:
        return None
    rotated_data = False
    try:
        with _Capture() as cap:
            rotated = sc.section.geometry.rotate(-theta)
            if sc.integration_data is not None and rotate_data is not None:
                rotate_data(-theta)
                rotated_data = True
            chi = prepare(rotated, n_ed, pre, post, 1e-8, 100, 1e-2)
        _drain(cap.records, warnings_out)
        return _abs_arr(chi)
    except Exception:  # noqa: BLE001 — planen er en bekvemmelighet, ikke et resultat
        return None
    finally:
        # Cachen er delt med alle senere kall på den forberedte seksjonen (§3.7). Lot vi
        # den ligge rotert, ville neste beregning på samme snitt regnet på feil geometri.
        if rotated_data:
            rotate_data(theta)


def _nm_domain_arrays(sc, theta, opts, warnings_out):
    """Full kapasitetsomhylling — bare selve arrayene. `complete_domain` er alltid True.

    Uten begge halvplan finnes det ingen omhylling å treffe for et støttemoment, og 69
    punkter koster én integrasjon hver — omtrent samme pris som én bøyeberegning.

    Regnes ÉN gang per kjøring, med TVERRSNITTETS EGEN retning `options.theta` (§4.1) — ikke
    med governing sin, og ikke én gang per kombinasjon. Omhyllingen er en egenskap ved
    tverrsnittet og aksen den bøyes om, og skal derfor stå stille selv om governing hopper
    fra felt- til støttemoment fordi brukeren redigerer en rad i kombinasjonstabellen. Se
    kallet i `_run_inner`. `complete_domain=True` gir uansett begge grener i samme kall; å
    regne omhyllingen på nytt for hver kombinasjon ville vært 55 ms bortkastet per ekstra
    rad uten at et eneste tall endret seg. Lastpunktene selv (`combinations[i].N_Ed/M_Ed`)
    tegnes oppå denne ene omhyllingen i `charts.js` (§7).

    HVORFOR `m` HER ER RÅ, OG IKKE LENGER DREID MED ET EGET FORTEGN
    `complete_domain=True` gir BEGGE grener: kapasiteten i θ-retningen og kapasiteten
    motsatt vei. Fram til v4 ble den ene grenen dreid med et eget fortegn
    (`meta.moment_sign`, GOVERNING sitt fortegn) for at strålemetoden i `radialUtilisation`
    ikke skulle plukke feil, bitteliten gren. Nå som motoren overtar `structuralcodes` sitt
    eget fortegn overalt (plan v4 §1), er `dom.m_y` allerede riktig signert i pakkens egen
    konvensjon UTEN å måtte dreies — de to grenene ligger fortsatt i hvert sitt halvplan,
    bare uten et ekstra fortegnssteg her. M–κ har bare én gren og forblir upåvirket.
    """
    complete = bool(opts.get('complete_domain', True))
    with _Capture() as cap:
        dom = sc.calculate_nm_interaction_domain(theta=theta, complete_domain=complete)
    _drain(cap.records, warnings_out)

    return {
        'n': _arr(dom.n),      # FORTEGNSATT: trykk negativ (seksjons-API-ets N_Ed-konvensjon)
        'm': _arr(dom.m_y),    # RÅ: pakkens eget fortegn, se hodekommentaren
        'field_num': _int_arr(dom.field_num),
    }


def run_json(payload_json: str, progress=None) -> str:
    """JSON inn, JSON ut — porten worker-en bruker.

    Å gå via strenger i stedet for Pyodides proxy-konvertering er ikke pynt: det er den
    eneste måten å garantere at det JS får er nøyaktig det `json.dumps(allow_nan=False)`
    slapp gjennom. En proxy-konvertering ville sluppet `NaN` og `Infinity` rett videre til
    et `JSON.parse` som kaster.
    """
    return json.dumps(run(json.loads(payload_json), progress), allow_nan=False)
