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
    # `and c.get('checked')` er EKSPLISITT (planens felle 15/§E5, felle 1 i STEG 2):
    # en ukontrollert rad har `shear: None` (§E4), som allerede filtreres bort av
    # `c.get('shear')` alene — men implisitt falsy-filtrering er ikke bevis, det
    # er tilfeldighet. Dobbelt sikring, ikke en omgåelse.
    candidates = [i for i, c in enumerate(combo_results)
                  if c.get('shear') and c['shear'].get('evaluated') and c.get('checked')]
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
            # STEG 2: ÉN KILDE til både `type` og `checked`. Ukjent/manglende
            # type (alle payloader fra før denne runden, eller en ugyldig
            # streng) faller til `'uls'` — den KONSERVATIVE retningen: raden
            # blir kontrollert, ikke stille sluppet forbi. `checked` regnes
            # HER og BARE her; ingen annen kodelinje skal utlede den av `type`
            # på nytt (planens felle 6/§E1).
            combo_type = c.get('type')
            combo_type = combo_type if combo_type in ('uls', 'characteristic', 'quasi_permanent') else 'uls'
            combos.append({
                'id': c['id'],
                'name': c.get('name', ''),
                'type': combo_type,
                'checked': combo_type == 'uls',
                'N_Ed': float(c['N_Ed']),
                'M_Ed': float(c['M_Ed']),
                'theta': float(theta) if theta is not None else default_theta,
                'V_Ed': float(c.get('V_Ed', 0.0) or 0.0),
            })
        active_id = loads.get('active') or (combos[0]['id'] if combos else None)
        return combos, active_id

    # Den GAMLE `loads`-formen (uten `combinations`): alle eksisterende
    # fixturer skal gi NØYAKTIG samme tall som før — raden er alltid `uls`,
    # alltid kontrollert.
    combo = {
        'id': 'C1',
        'name': '',
        'type': 'uls',
        'checked': True,
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
        'type': combo['type'], 'checked': combo['checked'],
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
        'V_Ed': _num(v_ed), 'shear': shear,
        'M_Rd': None, 'utilisation': None,
        'x': None, 'x_over_d': None, 'eps_a': None, 'chi_y': None,
        'eps_c_top': None, 'eps_s_max': None, 'failure_mode': None, 'layers': None,
        # STEG 2: `None`, IKKE `bool(within_limits)`. En ukontrollert (SLS) rad
        # har ikke fått aksialsjekken kjørt — `False` der ville vært en PÅSTAND
        # OM ET TALL SOM ALDRI BLE REGNET, og `report.js` trykker da «Outside
        # [N_min, N_max]» på en rad ingen aksialsjekk har rørt (planens felle 5).
        # Kalles med `False`/`True` fortsatt for en ULS-rad (utenfor grensene,
        # hhv. tatt med bare for skjærets skyld) — bare der ER sjekken kjørt.
        'within_limits': None if within_limits is None else bool(within_limits),
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
        'type': combo['type'], 'checked': combo['checked'],
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
        'V_Ed': _num(v_ed), 'shear': shear,
        'M_Rd': _num(m_rd_signed), 'utilisation': _num(_utilisation(m_ed, m_rd_signed)),
        # Se `_capacity_opposes_load`. Flagget staar paa raden og ikke bare i
        # `utilisation`, fordi `utilisation = None` alene ikke kan skilles fra «kunne
        # ikke regnes» -- og de to skal foere til hver sin dom.
        'capacity_opposes_load': _capacity_opposes_load(m_rd_signed, theta_c),
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
    # `and c['checked']` er EKSPLISITT (planens felle 15/§E5) — `within_limits: None`
    # (en ukontrollert SLS-rad) er allerede falsy og ville filtrert seg selv bort her,
    # men implisitt falsy-filtrering er nettopp den slags kobling denne kodebasen
    # skriver kommentarer mot, ikke koden selv.
    candidates = [i for i, c in enumerate(combo_results) if c['within_limits'] and c['checked']]
    if not candidates:
        return None
    best = candidates[0]
    for i in candidates[1:]:
        if (combo_results[i]['utilisation'] or 0.0) > (combo_results[best]['utilisation'] or 0.0):
            best = i
    return best


# ------------------------------------------------------------------ #
# SLS — EC2 7.2 (spenningsbegrensning) og 7.3.4 (rissvidde)
# global-devspecs/concrete_section_calculator-sls.md
#
# HELE KAPITTELET HVILER PAA ÉN STOeRRELSE MOTOREN IKKE HADDE: den lineaer-elastiske
# tilstanden i det (eventuelt) opprissede snittet under en bruksgrensekombinasjon.
# Modellen (spec §1.2/§1.3): betong lineaer med E_c i trykk og NULL i strekk, armering
# lineaer med E_s, transformert areal n·A_s UTEN aa punsjere betongen (samme konvensjon
# som ULS-standarden `subtract_bar_area: false`). Motoren bygger alltid et rektangel
# (`_build`), saa dette er eksakt og ikke et anslag.
#
# EN SPEILET SAGGING-RAMME GJoeR LOeSEREN GRENFRI (spec §1.2): s = +1 naar M_Ed <= 0,
# ellers -1. Etter rotsoekingen konverteres (eps_a, chi_y, z_na) tilbake til den
# ORIGINALE z-aksen (`_sls_cracked_eval` returnerer allerede originale (eps_a, chi_y);
# se funksjonens docstring for utledningen). Fra da av er ALT -- x, sigma_c, tension-
# settet, d, h_c,eff -- EN formel, delt mellom risset og urisset tilstand: eps(z) =
# eps_a + chi_y*z, akkurat som `_layer_state` allerede gjoer for ULS. Det er grunnen til
# at koden under IKKE holder to separate "byggere" for de to tilstandene.
# ------------------------------------------------------------------ #

# Rissvidde regnes bare paa tilnaermet permanent last (spec §1.5/§3.2 steg 10), som per
# definisjon ER langtidslasten. Derfor er k_t ALLTID 'long' -- ikke et brukerfelt.
_SLS_KT = 0.4

# SPEIL av `SLS_DEFAULTS` i `js/materials.js` -- IKKE en fjerde kilde.
#
# `payload.js` sender ALLTID alle fire (`enforceSlsParams` i store.js garanterer at de
# er endelige tall foer de naar hit), saa i produktet blir ingen av disse lest. De staar
# for den som kaller `engine.run()` DIREKTE -- testene her, og et framtidig skript -- slik
# at en payload uten `sls`-faktorer ikke kaster en TypeError paa `float(None)`.
#
# Endres et av tallene, er det `js/materials.js` som er kilden; dette speilet foelger
# etter. Testen `test_sls_defaults_mirror_the_js_source` leser begge filene og feiler
# hvis de gaar fra hverandre.
_SLS_FALLBACK = {
    'phi_ef': 2.0,
    'sigma_c_char_factor': 0.6,
    'sigma_c_qp_factor': 0.45,
    'sigma_s_char_factor': 0.8,
}


def _sls_theta_equiv(m_ed):
    """SLS-raden baerer ingen `theta` (kontrakten i spec §4 har ingen). Fortegnet paa
    `M_Ed` ER retningen (spec §1.2: «s = +1 naar M_Ed <= 0»), akkurat som strukturkodens
    egen konvensjon `theta = 0` for sagging. Ved aa gjenbruke `_is_hogging`/`_depth` med
    denne "som-om-theta"-verdien faar SLS gratis den SAMME definisjonen av trykkant, `d`
    og strekksett som ULS allerede har -- ingen ny regel skrevet paa nytt.
    """
    return math.pi if m_ed > 0.0 else 0.0


def _sls_uncracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed):
    """Spec §1.3 -- urisset elastisk tilstand, lukket form, i den ORIGINALE z-aksen.
    Ingen rotsoeking, ingen speiling: to lineaere likninger, en 2x2-determinant.

    Kalles med `Ec = E_cm` for rissbeslutningen (§1.1, ALLTID -- riss er irreversibelt og
    settes ved foerste paalastning, se hodekommentarens begrunnelse for hvorfor IKKE
    E_c,eff der) og med radens EGEN modul naar raden faktisk ER urisset (§1.4). To kall
    med to ulike `Ec` er to ULIKE stoerrelser, ikke to kilder til samme tall.

    Returnerer `(eps_a, chi_y)`, begge i den fysiske z-aksen -- `eps(z) = eps_a + chi_y*z`.
    """
    ea = Ec * b * h + sum(Es * a for a, _z in rebar_zs)
    es = sum(Es * a * z for a, z in rebar_zs)
    ei = Ec * b * h ** 3 / 12.0 + sum(Es * a * z * z for a, z in rebar_zs)
    det = ea * ei - es * es
    eps_a = (n_ed * ei - m_ed * es) / det
    chi_y = (m_ed * ea - n_ed * es) / det
    return eps_a, chi_y


def _sls_cracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed):
    """Spec §1.2 -- risset elastisk tilstand. Egen loeser, VERIFISERT (uavhengig, i denne
    oekten, mot en parallell UserDefined-seksjon) identisk til alle rapporterte siffer i
    spec §9, ogsaa med aksialkraft. Ingen Newton, ingen konvergens som kan feile: 120
    halveringer paa et glatt, monotont `R(z_na)` er determinat og koster mikrosekunder.

    FORTEGNSRAMMEN (spec §1.2): `s = +1` naar `M_Ed <= 0` (sagging), ellers `-1`.
    `z' = s*z`, `M' = s*M_Ed`, `N` uendret. Roten `z_na'` og krumningen `chi'` loeses i
    den speilede rammen; TILBAKE i den fysiske aksen er (algebraisk utledning, verifisert
    numerisk mot et hogging-tilfelle i denne oekten):
        eps_a  = -chi'*z_na'          (z' = 0 er samme fysiske punkt som z = 0)
        chi_y  = s*chi'                (eps(z) = eps_a + chi_y*z gjelder da UENDRET
                                         for BEGGE fortegn paa `s`, se `_sls_build_state`)
    Ingen kaller trenger aa vite at speilingen fant sted -- returverdien er allerede i
    den fysiske aksen, present for BEGGE grener sammen med den urissede loeseren.

    Returnerer `(eps_a, chi_y)`, eller `None` hvis `R` ikke skifter fortegn i
    `[-h/2, +h/2]` -- ingen likevekt med denne armeringen naar betongens strekk
    fjernes (spec §1.2: kalleren skiller da `fully_in_tension` fra
    `no_equilibrium_cracked` ved aa se paa den urissede tilstanden).
    """
    s = 1.0 if m_ed <= 0.0 else -1.0
    m_p = s * m_ed
    layers_p = [(a, s * z) for a, z in rebar_zs]

    def ab(z_na):
        x = min(max(h / 2.0 - z_na, 0.0), h)
        a_val = Ec * b * x * x / 2.0
        b_val = Ec * b * (x ** 3 / 3.0 + z_na * x * x / 2.0)
        for area, zp in layers_p:
            a_val += Es * area * (zp - z_na)
            b_val += Es * area * (zp - z_na) * zp
        return a_val, b_val

    def r_of(z_na):
        a_val, b_val = ab(z_na)
        return m_p * a_val - n_ed * b_val

    lo, hi = -h / 2.0, h / 2.0
    r_lo, r_hi = r_of(lo), r_of(hi)
    if r_lo == 0.0:
        z_na = lo
    elif r_hi == 0.0:
        z_na = hi
    elif (r_lo > 0) == (r_hi > 0):
        return None
    else:
        for _ in range(120):
            mid = (lo + hi) / 2.0
            r_mid = r_of(mid)
            if (r_mid > 0) == (r_lo > 0):
                lo, r_lo = mid, r_mid
            else:
                hi, r_hi = mid, r_mid
            if hi - lo < 1e-9:
                break
        z_na = (lo + hi) / 2.0

    a_val, b_val = ab(z_na)
    chi_p = n_ed / a_val if n_ed != 0.0 else m_p / b_val
    eps_a = -chi_p * z_na
    chi_y = s * chi_p
    return eps_a, chi_y


def _sls_tension_only_eval(Es, rebar_zs, n_ed, m_ed):
    """Toeyningsplanet naar HELE snittet er i strekk og risset.

    Da baerer betongen ingenting -- all kraft staar i jernene -- og likevekten blir to
    LINEAERE likninger i (eps_a, chi_y), uten den kubiske trykksonen `_sls_cracked_eval`
    maa lete seg fram til:

        N = E_s * [ eps_a * SUM(A_i)        + chi * SUM(A_i * z_i)   ]
        M = E_s * [ eps_a * SUM(A_i * z_i)  + chi * SUM(A_i * z_i^2) ]

    HVORFOR DEN MAA FINNES: sentrisk og eksentrisk strekk -- strekkstag, ringarmering i
    tanker, veggskiver -- er blant de VIKTIGSTE rissviddetilfellene i EC2. Standarden har
    dem eksplisitt: fig. 7.1(c) viser A_c,eff for et strekkstav, og k2 = 1,0 i
    lign. 7.13 finnes nettopp for ren strekk. Motoren svarte
    `fully_in_tension -> crack_width_ok: None` og lot dem ligge.

    Returnerer `None` naar systemet er singulaert: ETT armeringslag kan bare baere
    momentet `N * z_1`, og alt annet er en likevekt som ikke finnes. Det er en ekte
    mangel paa loesning, ikke en numerisk sviktende rot.
    """
    sa = sum(a for a, _z in rebar_zs)
    saz = sum(a * z for a, z in rebar_zs)
    sazz = sum(a * z * z for a, z in rebar_zs)
    det = sa * sazz - saz * saz
    if sa <= 0.0 or abs(det) < 1e-12 * max(1.0, sa * sazz):
        return None
    eps_a = (n_ed * sazz - m_ed * saz) / (Es * det)
    chi_y = (m_ed * sa - n_ed * saz) / (Es * det)
    return eps_a, chi_y


def _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, eps_a, chi_y, m_ed, cracked,
                     tension_only=False):
    """EN formel for BEGGE tilstander (risset/urisset) og BEGGE retninger (spec §1.2's
    poeng med aa rapportere tilbake i den fysiske aksen): gitt `(eps_a, chi_y)` er
    `eps(z) = eps_a + chi_y*z` for enhver `z`, akkurat som `_layer_state` (ULS) allerede
    bruker. Trykkant/strekkant velges av `_sls_theta_equiv(m_ed)` -- samme regel som gav
    `(eps_a, chi_y)` sitt fortegn i utgangspunktet, saa de to kan ikke komme i utakt.

    `x` er avstanden fra trykkanten til nullpunktet, KLEMT til `[0, h]` (spec §1.2) --
    for en risset tilstand ligger `z_na` per konstruksjon i `[-h/2, h/2]` og klemmingen
    er ren forsikring; for en urisset tilstand (hvor `z_na` fritt kan ligge utenfor
    snittet, f.eks. ved rent aksialtrykk) er den nødvendig for at `x` skal forbli et tall
    UI-et kan tegne. `sigma_c` er STOeRRELSEN paa trykkanten, med sitt eget fortegn
    (negativ = trykk, samme konvensjon som resten av modulen).
    """
    theta_equiv = _sls_theta_equiv(m_ed)
    hogging = _is_hogging(theta_equiv)
    comp_face_z = -h / 2.0 if hogging else h / 2.0
    tens_face_z = h / 2.0 if hogging else -h / 2.0

    if chi_y == 0.0 or not math.isfinite(chi_y):
        # Rent aksialt: ingen nullpunkt i tøyningsplanet. `x` blir en degenerert
        # rapportering (hele snittet har samme fortegn), ikke en feil -- se `_num` for
        # hvorfor "uendelig langt unna" ikke skal forveksles med et tall som betyr noe
        # (samme prinsipp som `_neutral_axis` for ULS, `engine.py`-hodet §5.4).
        z_na = None
        x = h if eps_a < 0.0 else 0.0
    elif tension_only:
        # Nullpunktet ligger UTENFOR snittet (begge kanter i strekk). `z_na` staar
        # likevel som det matematiske punktet det er; `x` er null.
        z_na = -eps_a / chi_y
        x = 0.0
    else:
        z_na = -eps_a / chi_y
        x = min(max(_depth(z_na, h, theta_equiv), 0.0), h)

    # TRYKKANTEN ER IKKE ALLTID DEN `theta` PEKER PAA.
    #
    # `comp_face_z` foelger fortegnet paa `M_Ed` alene, og det er riktig for et RISSET
    # snitt: der er den ene kanten per definisjon trykksonen. For et URISSET snitt med
    # DOMINERENDE AKSIALTRYKK baerer begge kantene, og den stoerste trykkspenningen kan
    # ligge paa den kanten momentet IKKE peker paa.
    #
    # MAALT, helt ordinaer 300x600 med 3O20 i underkant og et lite stoettemoment:
    #
    #   karakteristisk, N = -3200 kN, M = +5 kNm, grense 18,0 MPa
    #       rapportert  -16,23 MPa  (util 0,901, ok = TRUE)
    #       sann maks   -18,28 MPa  (util 1,016 -> skulle vaert FALSE)
    #
    #   tilnaermet permanent, N = -2400 kN, M = +5 kNm, grense 13,5 MPa
    #       rapportert  -12,23 MPa  (util 0,906, ok = TRUE)
    #       sann maks   -13,65 MPa  (util 1,011)
    #
    # Altsaa 11-13 % for lavt, paa usikker side, og dommen snur. Uavhengig
    # haandregning av det transformerte urissede snittet reproduserer begge fibrene.
    #
    # KLEMT MOT NULL: er BEGGE kantene i strekk (rent aksialstrekk), finnes det ingen
    # trykkspenning, og `0` er det aerlige svaret. Foer dette stod det en STREKKspenning
    # paa +1,851 MPa merket «compression face» og proevd mot trykkgrensa med `abs()` --
    # altsaa et tall med feil fortegn i en kontroll det ikke hoerte hjemme i.
    if tension_only:
        # Hele snittet er i strekk og risset: det FINNES ingen trykksone, og ingen
        # trykkspenning. `x = 0` er ikke en degenerasjon her, det er svaret.
        sigma_c = 0.0
    elif cracked:
        sigma_c = Ec * (eps_a + chi_y * comp_face_z)
    else:
        sigma_c = min(Ec * (eps_a + chi_y * (h / 2.0)),
                      Ec * (eps_a + chi_y * (-h / 2.0)),
                      0.0)

    # `eps_1`/`eps_2` roeres IKKE. De gaar inn i `eps_r = max(0, eps_2)/eps_1` og
    # videre til `k2` i rissviddekjeden (lign. 7.13), som bare kjoeres for et RISSET
    # snitt -- der er `comp_face_z` riktig, og en omdefinering her ville flyttet `k2`
    # for hver eneste rissvidde uten at noen ba om det.
    eps_2 = eps_a + chi_y * comp_face_z
    eps_1 = eps_a + chi_y * tens_face_z

    layers = []
    sigma_s_max = None
    for layer, (_area, z) in zip(rebar, rebar_zs):
        eps_i = eps_a + chi_y * z
        sigma_i = Es * eps_i
        layers.append({
            'id': layer['id'], 'z': _num(z), 'eps': _num(eps_i),
            'sigma': _num(sigma_i), 'tension': bool(eps_i > 0.0),
        })
        sigma_s_max = sigma_i if sigma_s_max is None else max(sigma_s_max, sigma_i)

    return {
        'x': x, 'z_na': z_na, 'eps_a': eps_a, 'chi_y': chi_y, 'sigma_c': sigma_c,
        'eps_1': eps_1, 'eps_2': eps_2, 'sigma_s_max': sigma_s_max, 'layers': layers,
        # Rissviddekjeden maa vite det: uten trykksone gjelder ikke `(h-x)/3`.
        'tension_only': bool(tension_only),
    }


def _sls_row_state(b, h, Ec, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
                    sig_top_u, sig_bot_u):
    """Spec §1.2 -- loeser tilstanden for ÉN evaluering (radens egen, ELLER den ekstra
    `E_cm`-evalueringen §1.4 bruker for `sigma_c_initial`) og haandhever gyldighetsvaktene.
    Returnerer `(state, None)` eller `(None, reason)`.

    `sig_top_u`/`sig_bot_u` er ALLTID den `E_cm`-baserte urissede tilstanden fra §1.1 --
    de brukes BARE til aa skille `fully_in_tension` fra `no_equilibrium_cracked` naar
    `_sls_cracked_eval` ikke finner noen rot (spec §1.2, RETTET i runde 10: den gamle
    grunnkoden `no_compression_zone` var faktuelt feil paa AC8a, som HAR en trykksone).
    """
    if not cracked:
        eps_a, chi_y = _sls_uncracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed)
    else:
        solved = _sls_cracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed)
        if solved is None:
            if sig_top_u > 0.0 and sig_bot_u > 0.0:
                # BEGGE KANTENE I STREKK. Trykksonen `_sls_cracked_eval` leter etter
                # finnes ikke, men snittet HAR en likevekt -- den staar bare helt i
                # jernene. Se `_sls_tension_only_eval`.
                pure = _sls_tension_only_eval(Es, rebar_zs, n_ed, m_ed)
                if pure is None:
                    return None, 'fully_in_tension'
                state = _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, pure[0], pure[1],
                                          m_ed, cracked, tension_only=True)
                abs_sigmas_t = [abs(l['sigma']) for l in state['layers'] if l['sigma'] is not None]
                if (max(abs_sigmas_t) if abs_sigmas_t else 0.0) > fyk:
                    return None, 'stresses_outside_elastic_range'
                return state, None
            return None, 'no_equilibrium_cracked'
        eps_a, chi_y = solved

    state = _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, eps_a, chi_y, m_ed, cracked)

    if cracked and (state['x'] <= 0.0 or state['x'] > h):
        # I PRAKSIS unaabart: bisection er klemt til `z_na` innenfor `[-h/2, h/2]`, som
        # per konstruksjon gir `x` innenfor `[0, h]`. Vakten staar likevel (spec §1.2,
        # §12.4) -- billig, og `ec2_2004.sr_max_far`/vaar egen `h_c,eff` kaster begge for
        # `x > h` naar rissviddekjeden senere kalles med den.
        return None, 'no_equilibrium_cracked'

    abs_sigmas = [abs(l['sigma']) for l in state['layers'] if l['sigma'] is not None]
    max_abs_sigma_s = max(abs_sigmas) if abs_sigmas else 0.0
    if max_abs_sigma_s > fyk or abs(state['sigma_c']) > fck:
        # Den lineaere modellen gjelder ikke for et snitt som har flytt (staal) eller
        # knust (betong) under bruksgrenselast. Maalt (spec §1.2, AC8b): en
        # stoettemomentrad uten toppjern gir et matematisk gyldig rotpunkt med
        # `sigma_s = 2622 MPa` og `sigma_c = -576 MPa` -- uten denne vakten et stille
        # feil tall, ikke en manglende funksjon.
        return None, 'stresses_outside_elastic_range'

    return state, None


def _sls_bar_groups(layer):
    """`(n_i, phi_i)`-par for ETT lag, til `phi_eq` (spec §3.4, lign. 7.12). For
    `kind: 'bars'` er hvert jern sin egen gruppe (`n = 1`, sin egen diameter -- tolerer
    ulike diametre i samme lag, i motsetning til resten av motoren som antar lik `z`).
    For `kind: 'strip'` er hele laget ÉN gruppe med `n = A_s/(pi*phi^2/4)`, IKKE
    nødvendigvis et helt tall -- formelen er arealvektet og tåler det (spec §3.4)."""
    if layer['kind'] == 'bars':
        return [(1.0, float(bar['dia'])) for bar in layer['bars']]
    phi = float(layer['strip']['height'])
    n = float(layer['area']) / (math.pi * phi * phi / 4.0)
    return [(n, phi)]


def _sls_layer_phi(layer):
    """Diameteren cover/terskel-formlene (lign. 7.11/7.3.4-3) skal bruke: bar-diameteren
    (ETT tall, samme antakelse om lik diameter i laget som `_layer_z` allerede gjør), eller
    stripens `height` -- som ER stripens EKVIVALENTE diameter (`equivalentStrip`,
    `rebar.js:198`, spec §3.4)."""
    if layer['kind'] == 'bars':
        return float(layer['bars'][0]['dia'])
    return float(layer['strip']['height'])


def _sls_layer_spacing(layer):
    """`s` for ETT lag, eller `None` naar laget ikke har noen senteravstand aa gi
    (spec §3.4): ett jern har ingen nabo (`barPositions` gir `[{y: 0, ...}]` for
    `n = 1`), og en stripe har alltid en avstand.

    STRIPA BRUKER 1000, IKKE `b` -- RETTET I RUNDE 10 (spec §3.4/§12.11, AC11). Et
    `spacing`-lag er ALLTID regnet per meter i `layerArea` (`rebar.js:87`, hardkodet
    1000), uansett tverrsnittstype -- inversjonen her MAA bruke den samme konstanten,
    ellers beskriver `s` og `A_s` to ulike armeringsbilder. Maalt (AC11): «Ø12 c/c 200»
    paa en 300 mm bred bjelke gir riktig `s = 200,0`; med `b` i formelen ville det blitt
    `60,0` -- og det tallet bytter GREN i `s_r,max` (§3.4).
    """
    if layer['kind'] == 'bars':
        ys = sorted(float(bar['y']) for bar in layer['bars'])
        if len(ys) < 2:
            return None
        return max(y2 - y1 for y1, y2 in zip(ys, ys[1:]))
    phi = float(layer['strip']['height'])
    area = float(layer['area'])
    return 1000.0 * math.pi * phi * phi / (4.0 * area)


def _sls_crack(rebar, state, b, h, m_ed, alpha_e_val, f_ct_eff, Es):
    """Spec §3.2 -- rissviddekjeden (EC2 7.3.4), i rekkefoelgen kapittelet gir. Kalles
    BARE naar raden er `quasi_permanent` OG risset (§1.5) -- kalleren har allerede
    filtrert det. Returnerer `(crack_dict, None)` eller `(None, reason)`.

    `h_c,eff` og `eps_sm - eps_cm` er VAAR EGEN kode (spec §3.1, RETTET i runde 10):
    pakkens `ec2_2004.hc_eff`/`ec2_2004.eps_sm_eps_cm` gir bare det ENDELIGE tallet, ikke
    kandidatene/leddene §4 krever aa rapportere, og aa regne begge veier ville gitt to
    produsenter for samme stoerrelse uten kryssjekk. Pakken er i stedet et TEST-ORAKEL
    (`test_engine.py`), aldri en andre produsent naar motoren kjoerer.
    """
    theta_equiv = _sls_theta_equiv(m_ed)
    hogging = _is_hogging(theta_equiv)
    tension_face_z = h / 2.0 if hogging else -h / 2.0
    x = state['x']

    tension = _tension_layers(rebar, state['layers'])
    if not tension:
        return None, 'no_tension_reinforcement'

    d, _as_tension = _weighted_depth(tension, h, theta_equiv)

    # EC2 7.3.2(3) gir TRE kandidater, og `(h-x)/3` er den ene av dem som forutsetter
    # at det FINNES en trykksone -- den er utledet for en bjelke med boeyning. For et
    # snitt helt i strekk er `x = 0`, og `(h-0)/3 = h/3` er da ikke en fysisk
    # begrunnet hoeyde, bare det formelen tilfeldigvis gir. Standarden sier for et
    # strekkstag `min(2.5(h-d), h/2)` -- fig. 7.1(c) -- og det er de to som staar igjen.
    candidates = {
        '2.5(h-d)': 2.5 * (h - d),
        'h/2': h / 2.0,
    }
    if not state.get('tension_only'):
        candidates['(h-x)/3'] = (h - x) / 3.0
    governing = min(candidates, key=candidates.get)
    h_c_eff = candidates[governing]
    a_c_eff = b * h_c_eff

    # SONEMEDLEMSKAP ER GEOMETRISK, over ALLE lag -- ikke bare de allerede filtrert til
    # strekk. Grunnen: `no_tensile_stress_in_effective_area` (spec §3.5) skal kunne
    # svare paa et lag som geometrisk ligger i sonen men numerisk IKKE er i strekk (en
    # defensiv vakt, akkurat som `x > h`-sjekken over -- vanskelig aa naa i praksis,
    # billig aa ha). Filteret til `A_s,eff` selv (under) er likevel STREKKLAG, slik
    # spec §3.2 steg 4 sier ordrett.
    zone_layers = [layer for layer in rebar
                   if abs(_layer_z(layer) - tension_face_z) <= h_c_eff + 1e-9]
    tension_ids = {layer['id'] for layer in tension}
    zone_tension_layers = [layer for layer in zone_layers if layer['id'] in tension_ids]
    if not zone_tension_layers:
        return None, 'no_bonded_bars_in_effective_area'

    sigma_by_id = {l['id']: l['sigma'] for l in state['layers']}
    sigma_s = max(sigma_by_id[layer['id']] for layer in zone_tension_layers)
    if sigma_s is None or sigma_s <= 0.0:
        # Defensivt (se kommentaren over `zone_layers`): `zone_tension_layers` er per
        # konstruksjon alt filtrert til `eps > 0`, saa `sigma_s = Es*eps > 0` foelger --
        # denne grenen boer ALDRI naas, men staar for at et fremtidig avvik blir en
        # navngitt grunnkode og ikke et stille `None`/`nan`.
        return None, 'no_tensile_stress_in_effective_area'

    a_s_eff = sum(float(layer['area']) for layer in zone_tension_layers)
    rho_p_eff = float(ec2_2004.rho_p_eff(a_s_eff, 0.0, 0.0, a_c_eff))

    # eps_sm - eps_cm (lign. 7.9) -- VAAR EGEN formel (spec §3.1), IDENTISK matematikk
    # til `ec2_2004.eps_sm_eps_cm` (verifisert bit for bit i en egen orakel-test), men skrevet
    # her fordi vi trenger begge leddene og grenvalget hver for seg (spec §3.3/§4).
    tension_stiffening = _SLS_KT * f_ct_eff / rho_p_eff * (1.0 + alpha_e_val * rho_p_eff)
    eps_equation = (sigma_s - tension_stiffening) / Es
    eps_floor = 0.6 * sigma_s / Es
    eps_sm_eps_cm = max(eps_equation, eps_floor)
    eps_governing = 'equation' if eps_equation >= eps_floor else 'floor'

    eps_1 = state['eps_1']
    eps_2 = state['eps_2']
    eps_r = max(0.0, eps_2) / eps_1
    k1 = float(ec2_2004.k1('bond'))
    k2 = float(ec2_2004.k2(eps_r))
    k3 = float(ec2_2004.k3())
    k4 = float(ec2_2004.k4())

    outer = min(zone_tension_layers, key=lambda l: h / 2.0 - abs(_layer_z(l)))
    phi_outer = _sls_layer_phi(outer)
    c = (h / 2.0 - abs(_layer_z(outer))) - phi_outer / 2.0

    groups = [g for layer in zone_tension_layers for g in _sls_bar_groups(layer)]
    phi_eq = (sum(n * p * p for n, p in groups) / sum(n * p for n, p in groups))

    spacings = [v for v in (_sls_layer_spacing(l) for l in zone_tension_layers)
                if v is not None]
    if not spacings:
        return None, 'no_bar_spacing'
    s = max(spacings)

    threshold = float(ec2_2004.w_spacing(c, phi_eq))
    branch = 'close' if s <= threshold else 'far'
    sr_max_close = float(ec2_2004.sr_max_close(c, phi_eq, rho_p_eff, k1, k2, k3, k4))
    sr_max_far = float(ec2_2004.sr_max_far(h, x))
    sr_max = sr_max_close if branch == 'close' else sr_max_far
    w_k = float(ec2_2004.wk(sr_max, eps_sm_eps_cm))

    crack = {
        'd': _num(d), 'x': _num(x),
        'h_c_eff': _num(h_c_eff),
        'h_c_eff_candidates': {k: _num(v) for k, v in candidates.items()},
        'h_c_eff_governing': governing,
        'A_c_eff': _num(a_c_eff), 'A_s_eff': _num(a_s_eff),
        'layers_in_zone': [layer['id'] for layer in zone_tension_layers],
        'rho_p_eff': _num(rho_p_eff), 'alpha_e': _num(alpha_e_val),
        'k_t': _num(_SLS_KT), 'f_ct_eff': _num(f_ct_eff),
        'sigma_s': _num(sigma_s), 'sigma_s_layer': outer['id'],
        'eps_sm_eps_cm': _num(eps_sm_eps_cm), 'eps_equation': _num(eps_equation),
        'eps_floor': _num(eps_floor), 'eps_governing': eps_governing,
        'eps_1': _num(eps_1), 'eps_2': _num(eps_2), 'eps_r': _num(eps_r),
        'k1': _num(k1), 'k2': _num(k2), 'k3': _num(k3), 'k4': _num(k4),
        'c': _num(c), 'phi_eq': _num(phi_eq),
        'bar_spacing': _num(s), 'spacing_threshold': _num(threshold),
        'sr_max_close': _num(sr_max_close), 'sr_max_far': _num(sr_max_far),
        'sr_max': _num(sr_max), 'sr_max_branch': branch,
        'w_k': _num(w_k),
        # `w_max`/`utilisation`/`ok`/`ok_reason` fylles av kalleren (§1.5, §3.5): de
        # avhenger av `sls['w_max']`, en stoerrelse paa TVERRS av rader, ikke av
        # rissviddekjeden alene.
        'w_max': None, 'utilisation': None, 'ok': None, 'ok_reason': None,
    }
    return crack, None


def _sls_row(combo, rebar, b, h, Ecm, Ec_eff, Es, fck, fyk, alpha_e_val, f_ct_eff,
             w_max, w_max_source, w_max_reason,
             sigma_c_char_factor, sigma_c_qp_factor, sigma_s_char_factor,
             sigma_c_char_required, section_cracked):
    """Bygger ÉN `SlsRow` (spec §4). `rebar` er payloadens egen liste, i egen rekkefoelge
    -- state['layers'] faar SAMME rekkefoelge (bygd i `_sls_build_state` med `zip`), slik
    at `_tension_layers(rebar, state['layers'])` er lovlig lenger nede (§3.2)."""
    n_ed = combo['N_Ed']
    m_ed = combo['M_Ed']
    combo_type = combo['type']
    rebar_zs = [(float(l['area']), _layer_z(l)) for l in rebar]

    # §1.1 -- radens EGEN urissede strekkspenning, ALLTID med E_cm. Den staar i svaret
    # fordi den er et faktum om raden og viser HVILKEN rad som sprengte rissgrensa.
    eps_a_u, chi_u = _sls_uncracked_eval(b, h, Ecm, Es, rebar_zs, n_ed, m_ed)
    sig_top_u = Ecm * (eps_a_u + chi_u * (h / 2.0))
    sig_bot_u = Ecm * (eps_a_u + chi_u * (-h / 2.0))
    sigma_ct_uncracked = max(sig_top_u, sig_bot_u)

    # MEN TILSTANDEN FOELGER KONVOLUTTEN, IKKE RADEN.
    #
    # Hodekommentaren sier allerede «riss er irreversibelt» -- som begrunnelse for at
    # E_cm brukes i rissBESLUTNINGEN. Den ble ikke brukt paa TILSTANDEN, og da kunne en
    # rad som ikke selv sprenger rissgrensa bli regnet som urisset, enda snittet hadde
    # sprukket av en annen rad. Riss forsvinner ikke naar lasten gaar ned.
    #
    # MAALT, 300x1000 med 3O16 i underkant, XC4, w_max = 0,30:
    #   karakteristisk M = -200 kNm  ->  sigma_ct = 3,843 > f_ctm = 2,896  -> RISSER
    #   tilnaermet perm M = -144 kNm  ->  sigma_ct = 2,767 < f_ctm        -> «urisset»
    # Motoren svarte «no quasi-permanent load combination cracks the section» og
    # `sls.all_ok = True`. Regnet som risset -- slik snittet FAKTISK er:
    #   x = 230,0, sigma_s = 273,4, s_r,max = 311,9, w_k = 0,3030 mm mot 0,30
    #   -> utilisation 1,010 -> crack_width_ok = FALSE.
    # Samme feil traff `sigma_c_qp_ok`: 2,142 urisset mot 2,754 risset, 29 % lavt.
    cracked = section_cracked

    Ec_used = Ecm if combo_type == 'characteristic' else Ec_eff
    n_sec = Es / Ec_used

    state, state_reason = _sls_row_state(
        b, h, Ec_used, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
        sig_top_u, sig_bot_u,
    )

    # §1.4 -- betongtrykkspenningen VED PAAFOERING, kun for quasi_permanent-rader. For
    # `phi_ef = 0` er evalueringen IDENTISK med `state` (samme `Ec`), men skal likevel
    # staa med sin egen etikett (spec §1.4, AC1: "identisk, fordi phi_ef = 0 -- men den
    # SKAL staa"). For en characteristic-rad finnes ingen slik dobbelthet: `Ec ER Ecm`.
    sigma_c_initial = None
    sigma_c_initial_reason = None
    if combo_type == 'quasi_permanent':
        if Ec_used == Ecm:
            sigma_c_initial = None if state is None else state['sigma_c']
            sigma_c_initial_reason = state_reason
        else:
            state_i, reason_i = _sls_row_state(
                b, h, Ecm, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
                sig_top_u, sig_bot_u,
            )
            sigma_c_initial = None if state_i is None else state_i['sigma_c']
            sigma_c_initial_reason = reason_i

    crack = None
    crack_reason = None
    if state is None:
        # Grunnen ARVES fra tilstanden (spec §3.5): "de tre kodene ... er samtidig
        # state_reason-koder ... naar tilstanden mangler, arver crack_reason grunnen fra
        # den, slik at det ikke finnes to maater aa si det samme paa".
        crack_reason = state_reason
    elif combo_type != 'quasi_permanent':
        crack_reason = 'not_quasi_permanent'
    elif not cracked:
        crack_reason = 'uncracked'
    else:
        crack, crack_reason = _sls_crack(rebar, state, b, h, m_ed, alpha_e_val, f_ct_eff, Es)
        if crack is not None:
            if w_max is None:
                crack['ok_reason'] = w_max_reason
            else:
                crack['w_max'] = _num(w_max)
                crack['utilisation'] = _num(crack['w_k'] / w_max)
                crack['ok'] = bool(crack['w_k'] <= w_max)

    stress = None
    if state is not None:
        if combo_type == 'characteristic':
            sigma_c_checked = 'state'
            sigma_c_val = state['sigma_c']
            sigma_c_limit = sigma_c_char_factor * fck
            sigma_s_val = state['sigma_s_max']
            sigma_s_limit = sigma_s_char_factor * fyk
            sigma_s_ok = bool(abs(sigma_s_val) <= sigma_s_limit)
            sigma_s_util = abs(sigma_s_val) / sigma_s_limit if sigma_s_limit else None
            sigma_s_ok_reason = None
        else:
            sigma_c_checked = 'initial'
            sigma_c_val = sigma_c_initial
            sigma_c_limit = sigma_c_qp_factor * fck
            # STAALSPENNINGEN STAAR OGSAA FOR EN QUASI-PERMANENT RAD. Den hadde
            # ingen GRENSE foer -- EC2 7.2(5) gjelder karakteristisk last -- og ble
            # derfor ikke rapportert i det hele tatt. Men den er selve inngangen til
            # rissvidden (lign. 7.9), og en rad som viser w_k uten spenningen bak den
            # er et resultat man ikke kan etterproeve.
            #
            # SAMME DEFINISJON som for en karakteristisk rad: `state['sigma_s_max']`,
            # stoerste strekkspenning over ALLE lag. Ikke `crack['sigma_s']` -- den er
            # spenningen i det STYRENDE laget inne i A_c,eff, en annen stoerrelse med
            # sitt eget navn og sin egen rad i utledningen. To tall under samme
            # merkelapp er nettopp den feilformen modulen har blitt bitt av hver runde.
            sigma_s_val = state['sigma_s_max']
            sigma_s_limit = None
            sigma_s_ok = None
            sigma_s_util = None
            sigma_s_ok_reason = 'sigma_s_limit_characteristic_only'

        # RETTET i runde 10 (K5). `sigma_c_ok` ble tidligere regnet for ENHVER
        # karakteristisk rad, ogsaa naar `_sls_checks` samtidig la `sigma_c_char_ok`
        # i `not_applicable`. Utledningen i UI-et skrev da «OK» for en kontroll linja
        # rett over sa ikke gjaldt -- to steder som svarte hver sitt paa samme
        # spoersmaal, fordi svaret ble utledet to steder. Naa spoer raden OM
        # kontrollen gjelder foer den feller en dom.
        #
        # EC2 7.2(2) (karakteristisk last) gjelder BARE XD/XF/XS; 7.2(3) (tilnaermet
        # permanent) er ikke klasseavhengig og gjelder alltid.
        sigma_c_applies = sigma_c_char_required if combo_type == 'characteristic' else True
        sigma_c_ok_reason = None
        if sigma_c_val is None:
            sigma_c_ok = None
            sigma_c_util = None
            sigma_c_ok_reason = (state_reason if combo_type == 'characteristic'
                                 else sigma_c_initial_reason)
        else:
            # Utnyttelsen regnes UANSETT: `sigma_c/limit` er et faktum om raden, og
            # skal staa i utledningen ogsaa naar den ikke skal felle en dom.
            sigma_c_util = abs(sigma_c_val) / sigma_c_limit if sigma_c_limit else None
            if sigma_c_applies is True:
                sigma_c_ok = bool(abs(sigma_c_val) <= sigma_c_limit)
            elif sigma_c_applies is False:
                sigma_c_ok = None
                sigma_c_ok_reason = 'sigma_c_char_not_required'
            else:
                sigma_c_ok = None
                sigma_c_ok_reason = 'no_exposure_class'

        stress = {
            'sigma_c': _num(sigma_c_val), 'sigma_c_limit': _num(sigma_c_limit),
            'sigma_c_util': _num(sigma_c_util), 'sigma_c_ok': sigma_c_ok,
            'sigma_c_ok_reason': sigma_c_ok_reason,
            'sigma_c_checked': sigma_c_checked,
            'sigma_s': _num(sigma_s_val), 'sigma_s_limit': _num(sigma_s_limit),
            'sigma_s_util': _num(sigma_s_util), 'sigma_s_ok': sigma_s_ok,
            'sigma_s_ok_reason': sigma_s_ok_reason,
        }

    return {
        'id': combo['id'], 'name': combo['name'], 'type': combo_type,
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed),
        'sigma_ct_uncracked': _num(sigma_ct_uncracked),
        'cracked': bool(cracked),
        'Ec_used': _num(Ec_used), 'n_sec': _num(n_sec),
        'state': None if state is None else {
            'x': _num(state['x']), 'z_na': _num(state['z_na']),
            'eps_a': _num(state['eps_a']), 'chi_y': _num(state['chi_y']),
            'sigma_c': _num(state['sigma_c']),
            'eps_1': _num(state['eps_1']), 'eps_2': _num(state['eps_2']),
            'sigma_s_max': _num(state['sigma_s_max']),
            # Hele snittet i strekk: ingen trykksone, `x = 0` og `sigma_c = 0` er
            # SVARET og ikke en degenerasjon. Feltet staar i svaret slik at rapporten
            # og skjermen kan si hvorfor, i stedet for aa la leseren lure paa det.
            'tension_only': bool(state.get('tension_only')),
            'layers': state['layers'],
        },
        'state_reason': state_reason,
        'sigma_c_initial': _num(sigma_c_initial),
        'sigma_c_initial_reason': sigma_c_initial_reason,
        'stress': stress,
        'crack': crack,
        'crack_reason': crack_reason,
    }


def _sls_checks(rows, sigma_c_char_required):
    """Spec §4 -- hvilke `sls.checks`-noekler som GJELDER, resten i `not_applicable`.
    Bruker `_three_valued_and` per noekkel over radene den gjelder for -- en rad uten
    `stress`/`crack` (tilstanden mangler) telles som `None` og ikke som utelatt: en
    rad motoren ikke kunne regne skal aldri kunne gjemme seg bak et tomt utvalg.
    """
    checks = {}
    not_applicable = {}
    char_rows = [r for r in rows if r['type'] == 'characteristic']
    qp_rows = [r for r in rows if r['type'] == 'quasi_permanent']

    if not char_rows:
        not_applicable['sigma_c_char_ok'] = 'no characteristic load combination is present'
        not_applicable['sigma_s_char_ok'] = 'no characteristic load combination is present'
    else:
        required = sigma_c_char_required
        if required is False:
            not_applicable['sigma_c_char_ok'] = (
                'the selected exposure class is not one EC2 7.2(2) requires this stress '
                'limit for (only XD, XF and XS are)'
            )
        elif required is None:
            checks['sigma_c_char_ok'] = None
        else:
            vals = [(r['stress']['sigma_c_ok'] if r['stress'] else None) for r in char_rows]
            checks['sigma_c_char_ok'] = _three_valued_and(dict(enumerate(vals)))

        vals_s = [(r['stress']['sigma_s_ok'] if r['stress'] else None) for r in char_rows]
        checks['sigma_s_char_ok'] = _three_valued_and(dict(enumerate(vals_s)))

    if not qp_rows:
        not_applicable['sigma_c_qp_ok'] = 'no quasi-permanent load combination is present'
        not_applicable['crack_width_ok'] = 'no quasi-permanent load combination is present'
    else:
        vals_qp = [(r['stress']['sigma_c_ok'] if r['stress'] else None) for r in qp_rows]
        checks['sigma_c_qp_ok'] = _three_valued_and(dict(enumerate(vals_qp)))

        cracked_qp = [r for r in qp_rows if r['cracked']]
        if not cracked_qp:
            not_applicable['crack_width_ok'] = 'no quasi-permanent load combination cracks the section'
        else:
            vals_w = [(r['crack']['ok'] if r['crack'] else None) for r in cracked_qp]
            checks['crack_width_ok'] = _three_valued_and(dict(enumerate(vals_w)))

    return checks, not_applicable


def _sls_incomplete_causes(key, rows, sigma_c_char_required):
    """Radene som GJORDE `key` ubesvart, hver med SIN EGEN grunnkode.

    HVORFOR DENNE FINNES
    Den forrige utgaven slo opp en fast engelsk setning paa NOEKKELNAVNET. Da fikk
    `sigma_c_char_ok` alltid forklaringen «ingen eksponeringsklasse er valgt», ogsaa naar
    klassen stod der og raden i stedet ikke lot seg loese -- og `sigma_s_char_ok` fikk
    ingen forklaring i det hele tatt, fordi den manglet i tabellen. En grunn valgt paa
    navnet til det som feilet er en gjetning, ikke en maaling.

    Her leses grunnen av raden som faktisk manglet svaret, med den koden motoren allerede
    satte paa den (`state_reason`, `sigma_c_initial_reason`, `crack_reason`,
    `crack['ok_reason']`). Ingen engelsk tekst bor her -- den bor i `results.js`
    (`SLS_REASON_TEXT`), og koden er noekkelen inn i den.

    Returnerer en liste av `(row_id | None, code)`. `row_id = None` naar aarsaken gjelder
    hele snittet og ikke én rad (bare eksponeringsklassen gjoer det).
    """
    char_rows = [r for r in rows if r['type'] == 'characteristic']
    qp_rows = [r for r in rows if r['type'] == 'quasi_permanent']
    out = []
    if key == 'sigma_c_char_ok':
        # Klassen gaar FOERST: er 7.2(2) ukjent, er noekkelen ubesvart uansett hva
        # radene fikk til, og `_sls_checks` naadde aldri radene.
        if sigma_c_char_required is None:
            return [(None, 'no_exposure_class')]
        for r in char_rows:
            if r['stress'] is None:
                out.append((r['id'], r['state_reason']))
            elif r['stress']['sigma_c_ok'] is None:
                out.append((r['id'], r['stress']['sigma_c_ok_reason']))
    elif key == 'sigma_s_char_ok':
        for r in char_rows:
            if r['stress'] is None or r['stress']['sigma_s_ok'] is None:
                out.append((r['id'], r['state_reason']))
    elif key == 'sigma_c_qp_ok':
        for r in qp_rows:
            if r['stress'] is None:
                out.append((r['id'], r['state_reason']))
            elif r['stress']['sigma_c_ok'] is None:
                # Her, og BARE her, er grunnen en annen enn radens egen tilstand:
                # `sigma_c` for en quasi_permanent-rad er den EKSTRA E_cm-evalueringen
                # (§1.4), som kan mangle selv om radens egen tilstand finnes.
                # `sigma_c_ok_reason` baerer allerede nettopp det skillet.
                out.append((r['id'], r['stress']['sigma_c_ok_reason']))
    elif key == 'crack_width_ok':
        for r in qp_rows:
            if not r['cracked']:
                continue
            if r['crack'] is None:
                out.append((r['id'], r['crack_reason']))
            elif r['crack'].get('ok') is None:
                out.append((r['id'], r['crack'].get('ok_reason')))
    return out


def _sls_warnings(checks, rows, sigma_c_char_required):
    """De tre nye advarselskodene (spec §4), severity `warning` alltid -- SLS er
    bruksgrense, ikke brudd. Ingen av dem siterer et tall som ikke ble regnet, og ingen
    av dem gjetter en grunn: `sls_incomplete` henter hver grunn fra raden som manglet
    svaret (`_sls_incomplete_causes`)."""
    out = []
    incomplete = [k for k, v in checks.items() if v is None]
    if incomplete:
        parts = []
        for k in incomplete:
            causes = _sls_incomplete_causes(k, rows, sigma_c_char_required)
            if not causes:
                # I praksis unaabart -- `_sls_checks` setter bare `None` naar en rad gav
                # `None`. Staar likevel: en tom forklaring skal si at den er tom, ikke
                # se ut som en forklaring.
                parts.append(f'{k}: no reason was recorded')
            else:
                parts.append(f'{k}: ' + ', '.join(
                    str(code) if rid is None else f'{rid} ({code})' for rid, code in causes))
        out.append(_warning(
            'sls_incomplete',
            f'The serviceability assessment is incomplete: {len(incomplete)} '
            + ('check' if len(incomplete) == 1 else 'checks')
            + ' could not be evaluated (' + ', '.join(incomplete) + ').',
            '; '.join(parts),
        ))

    exceeded = {k for k, v in checks.items() if v is False}
    if 'crack_width_ok' in exceeded:
        failing = [r for r in rows if r.get('crack') and r['crack']['ok'] is False]
        worst = max(failing, key=lambda r: r['crack']['utilisation'] or 0.0, default=None)
        if worst is not None:
            out.append(_warning(
                'sls_crack_width_exceeded',
                f'The crack width w_k = {worst["crack"]["w_k"]:.3f} mm exceeds w_max = '
                f'{worst["crack"]["w_max"]:.3f} mm for load combination "{worst["id"]}" '
                '(EC2 7.3.4).',
                f'row={worst["id"]}, w_k={worst["crack"]["w_k"]}, '
                f'w_max={worst["crack"]["w_max"]}',
            ))
    stress_keys = sorted({'sigma_c_char_ok', 'sigma_s_char_ok', 'sigma_c_qp_ok'} & exceeded)
    if stress_keys:
        out.append(_warning(
            'sls_stress_limit_exceeded',
            'A stress limit under EC2 7.2 is exceeded for at least one serviceability '
            'load combination: ' + ', '.join(stress_keys) + '.',
            ', '.join(stress_keys),
        ))
    return out


def _compute_sls(payload, sls_cfg, combos, bundle, warnings_out):
    """Spec §4 -- bygger `result.sls`. Kalles bare naar payloaden har et `sls`-objekt OG
    minst én kombinasjon er `characteristic`/`quasi_permanent` (haandheves av kalleren,
    `_run_inner`) -- ellers skal `result` vaere BIT FOR BIT som uten dette kapittelet
    (spec §4/AC9).

    Motoren SLAAR ALDRI OPP en eksponeringsklasse -- `payload['sls']` baerer tallene
    (`w_max`, de tre faktorene, `sigma_c_char_required`) allerede utledet av JS
    (spec §4, "payload.js gjoer ALT, engine.py gjoer INGENTING" -- samme arbeidsdeling
    som geometrien).
    """
    conc = bundle['conc']
    steel = bundle['steel']
    b = bundle['b']
    h = bundle['h']
    rebar = payload['section']['rebar']

    ecm = float(conc.Ecm)
    es = float(steel.Es)
    fck = float(conc.fck)
    fyk = float(steel.fyk)
    f_ct_eff = float(conc.fctm)

    phi_ef_raw = sls_cfg.get('phi_ef')
    phi_ef = float(phi_ef_raw) if phi_ef_raw is not None else _SLS_FALLBACK['phi_ef']
    ec_eff = ecm / (1.0 + phi_ef)
    # lign. 7.9 -- ALLTID E_cm, ALDRI E_c,eff (spec §1.4). Feller man dette, blir `w_k`
    # LAVERE enn uten kryp i det hele tatt (de to feilene opphever hverandre), og feilen
    # er usynlig med mindre `alpha_e` har sitt eget navn -- se AC2.
    alpha_e_val = es / ecm

    exposure_class = sls_cfg.get('exposure_class')
    w_max = sls_cfg.get('w_max')
    w_max = float(w_max) if w_max is not None else None
    w_max_source = sls_cfg.get('w_max_source')
    w_max_reason = sls_cfg.get('w_max_reason')
    sigma_c_char_factor = float(
        sls_cfg.get('sigma_c_char_factor', _SLS_FALLBACK['sigma_c_char_factor']))
    sigma_c_qp_factor = float(
        sls_cfg.get('sigma_c_qp_factor', _SLS_FALLBACK['sigma_c_qp_factor']))
    sigma_s_char_factor = float(
        sls_cfg.get('sigma_s_char_factor', _SLS_FALLBACK['sigma_s_char_factor']))
    sigma_c_char_required = sls_cfg.get('sigma_c_char_required')

    sls_combos = [c for c in combos
                  if c['type'] in ('characteristic', 'quasi_permanent')]

    # KONVOLUTTEN FOERST. Snittet er risset dersom NOEN bruksgrenserad sprenger
    # f_ct,eff -- og da er det risset for alle radene, fordi riss ikke gaar tilbake naar
    # lasten gaar ned. Se `_sls_row` for maalingen som gjorde dette noedvendig.
    #
    # E_cm i hele beslutningen: den urissede tilstanden er kortidsstivheten uansett
    # hvilken kombinasjon raden er, og en kryprelatert forskjell her ville gjort
    # rissgrensa avhengig av lastvarigheten.
    section_cracked = False
    for combo in sls_combos:
        rebar_zs_env = [(float(l['area']), _layer_z(l)) for l in rebar]
        eps_a_e, chi_e = _sls_uncracked_eval(
            b, h, ecm, es, rebar_zs_env, combo['N_Ed'], combo['M_Ed'])
        sig_top_e = ecm * (eps_a_e + chi_e * (h / 2.0))
        sig_bot_e = ecm * (eps_a_e + chi_e * (-h / 2.0))
        if max(sig_top_e, sig_bot_e) > f_ct_eff:
            section_cracked = True
            break

    rows = []
    for combo in sls_combos:
        row = _sls_row(
            combo, rebar, b, h, ecm, ec_eff, es, fck, fyk, alpha_e_val, f_ct_eff,
            w_max, w_max_source, w_max_reason,
            sigma_c_char_factor, sigma_c_qp_factor, sigma_s_char_factor,
            sigma_c_char_required, section_cracked,
        )
        rows.append(row)

    # `sigma_c_char_required` gaar som PARAMETER, ikke som et felt paa hver rad: den
    # gjelder hele snittet (én eksponeringsklasse), og staar allerede ett sted i
    # svaret -- `sls['limits']['sigma_c_char_required']`. Et felt per rad hadde vaert
    # den samme opplysningen skrevet N + 1 ganger, og dermed N + 1 steder aa endre.
    checks, not_applicable = _sls_checks(rows, sigma_c_char_required)
    sls_all_ok = _three_valued_and(checks)
    warnings_out.extend(_sls_warnings(checks, rows, sigma_c_char_required))

    return {
        'phi_ef': _num(phi_ef), 'Ecm': _num(ecm), 'Ec_eff': _num(ec_eff),
        'alpha_e': _num(alpha_e_val), 'f_ct_eff': _num(f_ct_eff),
        'exposure_class': exposure_class,
        # Konvoluttbeslutningen, paa toppnivaa: den gjelder snittet og ikke raden, og
        # da skal den staa der de andre snittstoerrelsene staar.
        'cracked': bool(section_cracked),
        'w_max': _num(w_max), 'w_max_source': w_max_source, 'w_max_reason': w_max_reason,
        'limits': {
            'sigma_c_char_factor': _num(sigma_c_char_factor),
            'sigma_c_char': _num(sigma_c_char_factor * fck) if sigma_c_char_required is True else None,
            'sigma_c_qp_factor': _num(sigma_c_qp_factor),
            'sigma_c_qp': _num(sigma_c_qp_factor * fck),
            'sigma_s_char_factor': _num(sigma_s_char_factor),
            'sigma_s_char': _num(sigma_s_char_factor * fyk),
            'sigma_c_char_required': sigma_c_char_required,
        },
        'rows': rows,
        'checks': checks,
        'not_applicable': not_applicable,
        'all_ok': sls_all_ok,
    }


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


def _capacity_opposes_load(m_rd, theta):
    """Peker kapasiteten MOTSATT VEI av den retningen lasten virker i?

    `calculate_bending_strength(theta, n)` kan for et USYMMETRISK armert snitt med
    aksialkraft gi et moment med motsatt fortegn av det `theta` ber om. Snittet har da
    INGEN kapasitet i lastens retning -- tallet som kommer tilbake er kapasiteten den
    andre veien, og den er irrelevant for lasten som staar paa.

    MAALT foer denne vakten, referansebjelken 300x600 med 3O20 i UNDERKANT og
    aksialstrekk N = +300 kN, stoettemoment (theta = pi):

        M_Ed = +70 kNm  ->  M_Rd = -70,51 kNm,  eta = 0,993,  bending_ok TRUE,
                            all_ok TRUE,  ADVARSLER: INGEN

    En groenn rapport for et snitt uten kapasitet i lastens retning. Uavhengig bevis:
    M-N-omhyllingen har ikke ETT eneste positivt moment ved N = +300 kN, saa straalen fra
    origo mot (+300, +70) krysser den aldri. Terskelen er ~30 kN aksialstrekk; SYMMETRISKE
    snitt rammes aldri, usymmetriske rammes ved strekk og naer `n_min`. Trykkgrenen fanges
    i praksis av `brittle_ok`; strekkgrenen gav ingenting.

    SAMMENLIKNINGEN GAAR MOT `theta`, IKKE MOT FORTEGNET PAA `M_Ed`.

    Det var det foerste forsoeket, og det gav FALSKE POSITIVER paa den gamle
    payload-formen, der `M_Ed` er en STOERRELSE og retningen staar i `theta`:
    `test_engine.py:746` og fixturene bruker den formen, og `M_Ed: +150e6` med
    `theta: 0.0` betyr der feltmoment. `theta` er derimot det
    `calculate_bending_strength` FAKTISK ble kalt med, i begge former, og dermed den
    eneste entydige kilden til hvilken vei lasten virker.

    Feltmoment (theta = 0) skal gi NEGATIV kapasitet, stoettemoment (theta = pi) positiv
    -- `structuralcodes` sin egen konvensjon. Null er ikke en retning; en kapasitet paa
    null haandteres av kalleren.
    """
    if not m_rd:
        return False
    return (m_rd > 0) != _is_hogging(theta)


def _utilisation(m_ed, m_rd):
    """Alltid den VERTIKALE utnyttelsen, M_Ed/M_Rd(N_Ed), i alle tre analysene.

    Radiell λ er et sekundært lastvei-tall og regnes i `charts.js`. Samme snitt og samme
    last skal aldri kunne vise to ulike η i to faner.

    Utnyttelsen staar UROERT naar kapasiteten peker motsatt vei: `abs/abs` er fortsatt
    det formelen gir, og raden baerer `capacity_opposes_load` ved siden av. Det er
    FLAGGET som feller dommen, ikke et manglende tall -- en `None` her ville ikke
    kunnet skilles fra «kunne ikke regnes», og de to skal foere til hver sin dom.
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



def _active_row_detail(row):
    """`detail` for `mc_active_not_uls`: hvilken rad som er aktiv, og hvilken type den har."""
    return 'active={0} type={1}'.format(row.get('id'), row.get('type'))


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
    # `section.type` ble sendt fra `payload.js` og lest av INGEN -- null treff i hele
    # motoren foer runde 11. EC2 6.2.1(4) sitt unntak fra minimums-skjaerarmering
    # gjelder plater og deler av mindre betydning, IKKE bjelker (9.2.2(5)), og det
    # skillet kan ikke tas uten aa vite hvilken av delene snittet er.
    section_type = str(payload['section'].get('type') or 'beam')
    as_total = sum(float(l['area']) for l in rebar)
    fctm = float(conc.fctm)
    fyk = float(payload['section']['steel']['fyk'])
    as_max = 0.04 * b * h

    warnings_out = list(_geometry_warnings(payload))
    geometry_ok = not any(w['code'] == 'bar_outside_section' for w in warnings_out)

    # SLS (spec §4): `result.sls` finnes BARE naar payloaden har et `sls`-objekt OG minst
    # én kombinasjon er `characteristic`/`quasi_permanent`. Uten det skal `result` vaere
    # BIT FOR BIT som uten dette kapittelet (AC9) -- derfor `sls_result = None` og en
    # betinget noekkel paa `common` (under), ikke `common['sls'] = None` alltid.
    sls_cfg = payload.get('sls')
    sls_result = None
    if sls_cfg is not None and any(
        c['type'] in ('characteristic', 'quasi_permanent') for c in combos
    ):
        sls_result = _compute_sls(payload, sls_cfg, combos, bundle, warnings_out)

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
        if not combo['checked']:
            # En `characteristic`/`quasi_permanent`-rad skal ALDRI
            # bruddgrense-kontrolleres. Den ER regnet, men i `_compute_sls`, mot
            # EC2 7.2/7.3.4 og med lineaer-elastiske lover -- her har den ingen
            # kapasitet aa sammenlikne seg med.
            # `shear=None` er kjernen: uten den kunne raden blitt `shear_governing`
            # (report.js, fet skrift) og alene satt `shear_ok: false` for en
            # tilstand ingen bruddgrensekontroll faktisk har rørt (planens felle 1).
            combo_results.append(_unsolved_combo(
                combo, combo['N_Ed'], combo['M_Ed'], combo['theta'],
                float(combo.get('V_Ed', 0.0) or 0.0), None, None,
            ))
            combo_extras.append({'d_eff': None, 'as_tension': None, 'd_eff_all': None,
                                  'z_na': None, 'm_cr': None, 'has_tension': None})
            continue
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
        #
        # STEG 2: dette lener seg på at `active_index` peker på en KONTROLLERT (uls) rad.
        # Det garanteres av `enforceActiveCombo` i store.js (js-siden) — finnes en
        # uls-rad, kan `activeCombo` aldri stå på en SLS-rad. Motoren her stoler på den
        # garantien i stedet for å gjenoppfinne den: er den brutt (et API-kall utenom
        # store.js), er det en feil i kalleren, ikke noe engine.py skal late som ikke skjedde.
        fallback_index = active_index
        governing_index = (
            active_index if combo_results[active_index]['within_limits'] else None
        )
    else:
        # STEG 2 (§E5, sikkerhetskritisk): FØRSTE KONTROLLERTE rad, ikke rad 0. Er rad 0
        # en SLS-rad, blir `d_eff = None` der ⇒ `as_min = None` ⇒ `as_min_ok = None` —
        # riktignok `None` og ikke en stille `True` (den feilen er lukket av runde 6), men
        # `ref` ville likevel pekt på feil rad og gjort `brittle_ok`/`ductility_ok`
        # ubesvart uten grunn, selv når en fullt gyldig uls-rad finnes lenger ned i lista.
        fallback_index = next((i for i, c in enumerate(combo_results) if c['checked']), 0)
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
    # `axial_ok` er sant BARE hvis samtlige KONTROLLERTE kombinasjoner ligger innenfor
    # (§4.4). Filteret `c['checked']` er IKKE valgfritt (planens felle 6/§E5): uten det
    # slipper `within_limits: None` (en SLS-rad) gjennom `all()` som `False` — Python
    # regner `all([None])` som usant — og motoren ville påstått at aksialkraften er
    # utenfor området på grunn av en rad ingen aksialsjekk faktisk har rørt.
    axial_ok = all(c['within_limits'] for c in combo_results if c['checked'])

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
    # `and c['checked']` (§E5, planens felle 6-typen): en SLS-rad har `flexure_solved:
    # False` allerede (§E4 hopper over bruddløsningen), så filteret ville i praksis
    # virket uten det — men implisitt kobling er den sviktformen denne kodebasen
    # skriver kommentarer mot, ikke koden selv.
    bending_rows = [c for c in combo_results
                    if c['within_limits'] and c['flexure_solved'] and c['checked']]
    over_utilised = [c for c in bending_rows
                      if c['utilisation'] is not None and c['utilisation'] > 1.0]
    # Kapasiteten peker motsatt vei av lasten -- snittet baerer ikke i det hele tatt i
    # den retningen. Det er et BRUDD, ikke en ubesvart kontroll, og skal derfor gi
    # `False` og ikke `None`: «kan ikke gaa god for» ville vaert for mildt for et snitt
    # der kapasiteten i lastens retning er null.
    opposed = [c for c in bending_rows if c.get('capacity_opposes_load')]
    if opposed:
        bending_ok = False
        worst = opposed[0]
        warnings_out.append(_warning(
            'capacity_opposite_direction',
            f'Load combination "{worst["id"]}" acts in one direction while the computed '
            f'resistance acts in the other: M_Ed = {worst["M_Ed"] / 1e6:.1f} kNm against '
            f'M_Rd = {worst["M_Rd"] / 1e6:.1f} kNm. The section has no bending resistance '
            'in the direction of this load — add reinforcement on the tension face.',
            ', '.join(f'{c["id"]}: M_Ed={c["M_Ed"]}, M_Rd={c["M_Rd"]}, N_Ed={c["N_Ed"]}'
                      for c in opposed),
            severity='error',
        ))
    elif over_utilised:
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
    # `over_utilised` og IKKE `bending_ok is False`. De to var det samme helt til
    # `capacity_opposes_load` kom til: den setter ogsaa `bending_ok = False`, men har
    # sin EGEN advarsel (`capacity_opposite_direction`) og ingen utnyttelse aa rangere
    # etter -- `max()` over en tom liste kastet. Betingelsen skal spoerre om det den
    # faktisk handler om.
    if over_utilised:
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
    # `c['checked'] and` er EKSPLISITT (§E5): en ukontrollert rad har `shear: None`
    # (§E4), som allerede ville filtrert seg bort — men filteret her skal si det med
    # ord, ikke stole på at en annen kodelinje tilfeldigvis satte feltet til noe falsy.
    evaluated_shear = [c['shear'] for c in combo_results
                        if c['checked'] and c.get('shear') and c['shear'].get('evaluated')]
    stirrups_cfg = (shear_ctx['cfg'].get('stirrups') or []) if shear_ctx else []
    # RADER SOM HAR EN SKJAERKRAFT MEN IKKE BLE REGNET (runde 11).
    #
    # `_shear_row` returnerer `evaluated: False` naar `d` mangler -- f.eks. et
    # stoettemoment paa en bjelke uten toppjern, der det ikke finnes noen strekkside aa
    # maale `d` fra. Det er riktig aa la vaere aa regne. Men `shear_ok` falt da tilbake
    # paa `True`, og MAALT gav referansebjelken med `V_Ed = 900 kN`:
    #
    #     shear: evaluated=False, V_Rd=None, d=None
    #     checks.shear_ok = TRUE,  advarsler: ingen skjaeradvarsel i det hele tatt
    #
    # Det er samme feilform runde 6 lukket for `as_min_ok` og `ductility_ok`: en
    # kontroll som svarer BESTAATT uten aa ha regnet noe. `None` er det aerlige svaret,
    # og `null_reasons` baerer grunnen videre til `assessment_incomplete`.
    unevaluated_with_load = [
        c for c in combo_results
        if c['checked'] and c.get('shear') and not c['shear'].get('evaluated')
        and (c['shear'].get('V_Ed') or 0.0) > 0.0
    ]
    if evaluated_shear:
        shear_ok = all(s['V_Rd'] is None or s['V_Ed'] <= s['V_Rd'] for s in evaluated_shear)
        if unevaluated_with_load and shear_ok:
            # Noen rader gikk bra, andre ble ikke regnet: da kan vi ikke gaa god for
            # snittet, men vi skal heller ikke paastaa brudd. `False` fra en regnet rad
            # blir staaende -- et maalt brudd er sterkere enn en manglende maaling.
            shear_ok = None
    elif unevaluated_with_load:
        shear_ok = None
    else:
        # Ingen rad hadde skjaerkraft i det hele tatt. Da er det ingenting aa kontrollere,
        # og `True` er riktig -- ikke «ubesvart».
        shear_ok = True

    if shear_ok is None:
        ids = ', '.join(c['id'] for c in unevaluated_with_load)
        null_reasons['shear_ok'] = (
            f'the shear resistance could not be evaluated for load combination(s) {ids}: '
            'there is no reinforcement on the tension side to measure the effective '
            'depth d from'
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
    elif not stirrups_cfg and section_type == 'beam' and any(
            (c['shear'].get('V_Ed') or 0.0) > 0.0
            for c in combo_results if c['checked'] and c.get('shear')):
        # EN BJELKE UTEN BOEYLER, MED SKJAERKRAFT (runde 11).
        #
        # EC2 6.2.1(4) unntar deler der skjaerarmering ikke er noedvendig for
        # baereevnen -- plater, dekker, og deler av mindre betydning. Unntaket gjelder
        # IKKE bjelker: 9.2.2(5) krever rho_w >= rho_w,min uansett.
        #
        # MAALT foer dette: 300x600 bjelke, tom boeyleliste, V_Ed = 60 kN gav
        # `asw_min_ok = True`. `asw_s_min` er regnet og ligger i svaret (0,2629 mm2/mm),
        # men ble aldri brukt. `payload.section.type` ble sendt fra `payload.js` og lest
        # av INGEN -- null treff paa `section['type']` i hele motoren.
        asw_min_ok = False
        stirrup_spacing_ok = True
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
        # IKKE `bool(...)`. `shear_ok` er TREVERDIG siden runde 11: `None` naar en rad
        # med skjaerkraft ikke lot seg regne. `bool(None)` er `False`, altsaa «brudd»,
        # og det er en sterkere paastand enn motoren har dekning for.
        'shear_ok': shear_ok,
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
    if sls_result is not None:
        common['sls'] = sls_result
        # «OVERALL ASSESSMENT» SKAL SE BRUKSGRENSEN OGSAA.
        #
        # Kommentaren over `checks['all_ok']` sier det allerede, om et annet
        # tilfelle: «en Overall assessment: OK som overser ... er aktivt
        # misvisende i et verktoey som dimensjonerer betong». SLS var nettopp
        # det tilfellet én gang til.
        #
        # MAALT foer denne linja: en rissvidde paa 0,226 mm mot en grense paa
        # 0,05 -- altsaa 4,5 ganger over -- gav `checks['all_ok'] = True`, og
        # overskriften sto groenn med «STATUS OK». Advarselen `
        # sls_crack_width_exceeded` laa riktignok i lista, men en advarsel ved
        # siden av en groenn hake blir ikke lest.
        #
        # `sls['all_ok']` er allerede treverdig (`_three_valued_and` over
        # `sls['checks']`), saa den kan mates rett inn i den samme OG-en:
        # `False` slaar `None` slaar `True`. `sls['all_ok']` staar uroert ved
        # siden av, for den som vil vite hvilken av de to som feilet.
        checks['all_ok'] = _three_valued_and({
            'uls': checks['all_ok'],
            'sls': sls_result['all_ok'],
        })

    if not has_candidate:
        # Full konvolutt, ikke bare `{ok, schema, error}` (§4.4): figurer, tabeller og
        # rapport skal fortsatt ha noe å tegne selv når ingen kombinasjon var innenfor.
        #
        # STEG 2 (§E6): TO ULIKE SITUASJONER, TO ULIKE MELDINGER. Ingen `uls`-rad i det
        # hele tatt er IKKE det samme som «alle uls-radene ligger utenfor aksialgrensene»
        # — den hardkodede `axial_out_of_range`-teksten skal bare brukes i det andre
        # tilfellet. Nevner IKKE aksialkraftområdet i det første, siden ingen aksialsjekk
        # faktisk ble kjørt mot noen rad.
        # TRE SITUASJONER, IKKE TO. Den tredje: moment-krumning der den AKTIVE raden
        # ikke er en uls-rad, mens det FINNES uls-rader lenger ned. Da er
        # `governing_index` None fordi den aktive radens `within_limits` er None — ikke
        # fordi noen aksialkraft ligger utenfor. Motoren trykte da
        # «No load combination has an axial force within the range ...» med et konkret
        # kN-intervall, samtidig som `checks.axial_ok` sto `true` i SAMME svar. To kilder
        # til samme faktum, som motsier hverandre, og den ene lyver med et tall.
        #
        # Kommentaren over `fallback_index` sa at motoren «stoler paa» at
        # `enforceActiveCombo` i store.js holder den aktive raden paa en uls-rad. Den
        # garantien holder gjennom UI-et, men en payload kan bygges utenom storen — og da
        # skal motoren si hva som faktisk er galt, ikke finne paa et aksialkraftproblem.
        if is_mc and any(c['checked'] for c in combo_results)                 and not combo_results[active_index]['checked']:
            common['error'] = {
                'code': 'mc_active_not_uls',
                'message': (
                    # RETTET (spec §6.3): denne raden var ALDRI en paastand om at SLS
                    # var uimplementert -- den paastanden ble usann i det motoren fikk
                    # en SLS-seksjon (§4). Meldingen sier na bare hva som ER sant: den
                    # AKTIVE raden har ingen bruddtilstand aa spore, mens en eventuell
                    # SLS-rad ELLERS i lista fortsatt er evaluert, i sin egen seksjon.
                    'Moment-curvature is computed for the active load combination, and '
                    'that row is not of type ULS, so there is no failure state to '
                    'trace for it. Any serviceability rows are still evaluated in the '
                    'serviceability section of the result. Make a ULS combination the '
                    'active one.'
                ),
                'detail': _active_row_detail(combo_results[active_index]),
            }
        elif not any(c['checked'] for c in combo_results):
            common['error'] = {
                'code': 'no_uls_combination',
                'message': (
                    # RETTET (spec §6.3), samme grunn som over.
                    'No load combination is of type ULS, so there is no resistance '
                    'check. Any serviceability rows are still evaluated in the '
                    'serviceability section of the result.'
                ),
                'detail': 'combinations contain no row with type == "uls"',
            }
        else:
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
