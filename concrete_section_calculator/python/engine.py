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

FORTEGNSREGELEN
`structuralcodes` bruker `n > 0` = strekk og `theta = 0` = trykksone øverst. En vanlig
bjelke med underkantarmering får derfor NEGATIVT `m_y` for feltmoment. Det fortegnet er
riktig i pakken og feil i et UI. Derfor krysser `bending.M_Rd` og hele M–κ-kurven
JSON-grensa som STØRRELSER, aksialkraften forblir fortegnsatt, og motorens rå fortegn
ligger i `meta.moment_sign`. Uten dette ville plottkoden sendt en stråle inn i
+M-halvplanet mot en omhylling som ligger helt i −M.

M–N-diagrammet er unntaket: der er `m` FORTEGNSATT, dreid slik at kapasiteten i den
signerte retningen er positiv. Begrunnelsen står i `_nm_domain_arrays` — kort sagt har
diagrammet to grener, og å brette dem sammen med `abs` gjør at strålemetoden plukker feil
gren. MEN: fortegnet her er IKKE `meta.moment_sign` (som er GOVERNING kombinasjonens rå
fortegn, og kan gjelde en annen retning). Omhyllingen signeres med tverrsnittets EGEN,
faste retning `options.theta` — ellers ville diagrammet speilvendt seg hver gang governing
byttet fra felt- til støttemoment. Den faktiske retningen står i `meta.domain_theta`.

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


def _signed_arr(a, sign):
    """Momenter dreid om til «positiv i den analyserte retningen».

    Brukes bare av M–N-diagrammet, og forskjellen fra `_abs_arr` er hele poenget: se
    `_nm_domain`.
    """
    return [None if x is None else x * sign for x in _arr(a)]


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


def _effective_depth(rebar, h, theta, eps_a=None, chi_y=None):
    """`d` etter EC2 9.2.1.1: trykkanten til tyngdepunktet i STREKKARMERINGEN.

    HVORFOR IKKE BARE ALLE LAG ARÉALVEKTET
    Det var første utgave av denne funksjonen, og det var feil på usikker side. Trekker man
    trykkarmeringen med i vektingen, synker `d`, og `A_s,min = 0.26·f_ctm/f_yk·b_t·d` blir
    for lav — i akkurat de snittene noen har lagt inn trykkarmering, altså de snittene der
    man minst har lyst til å bomme. Referansefixturene har ett lag og ville aldri avslørt
    det; derfor står det en egen tolagstest i `test_engine.py`.

    HVORDAN STREKKSIDEN AVGJØRES
    Fra tøyningsplanet ved brudd, `ε(z) = eps_a + chi_y·z > 0`, når det finnes. Det er den
    eneste definisjonen som er riktig også når aksialtrykket flytter nøytralaksen forbi et
    lag. Finnes det ikke noe tøyningsplan ennå — eller er hele snittet i trykk — faller vi
    tilbake på den geometriske strekksiden for den analyserte retningen, og til slutt på
    alle lag, slik at funksjonen alltid gir et tall å rapportere.

    Returnerer `(d_eff, As_tension, d_eff_all)`.
    """
    d_all, _as_all = _weighted_depth(rebar, h, theta)

    tension = []
    if chi_y is not None and eps_a is not None:
        tension = [l for l in rebar if eps_a + chi_y * _layer_z(l) > 0]
    if not tension:
        # Geometrisk strekkside: under senter ved feltmoment, over senter ved støtte.
        hogging = _is_hogging(theta)
        tension = [l for l in rebar
                   if (_layer_z(l) > 0 if hogging else _layer_z(l) < 0)]
    if not tension:
        tension = list(rebar)

    d_eff, as_tension = _weighted_depth(tension, h, theta)
    return d_eff, as_tension, d_all


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


def _classify(eps_s_max, eps_c_top, layers, eps_yd, eps_ud, eps_cu):
    """Bruddform, i rekkefølgen §5.2 gir. Rekkefølgen ER klassifiseringen."""
    if eps_s_max < eps_yd and all(l['compression'] for l in layers):
        return 'compression_no_tension'
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
        f'sum A_s*sigma_c = {force:.1f} N, sum A_s*sigma_c*z = {moment:.1f} Nmm, '
        f'z_na = {z_na}',
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
# Lastkombinasjoner — §4
# ------------------------------------------------------------------ #

def _normalise_loads(payload, opts):
    """Bygger kombinasjonslista fra BEGGE payload-former (§4.2).

    Den gamle formen `{"N_Ed": …, "M_Ed": …}` finnes i alle committede fixturer og i
    `tests/python/test_engine.py`, og skal fortsatt virke UENDRET — den blir én
    kombinasjon `C1` med `options.theta` som retning. Den nye formen har egen `theta` per
    kombinasjon; `options.theta` er bare standarden for en kombinasjon som ikke oppgir sin
    egen (§4.2).

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
            })
        active_id = loads.get('active') or (combos[0]['id'] if combos else None)
        return combos, active_id

    combo = {
        'id': 'C1',
        'name': '',
        'N_Ed': float(loads['N_Ed']),
        'M_Ed': float(loads['M_Ed']),
        'theta': default_theta,
    }
    return [combo], 'C1'


def _solve_combo(combo, sc, rebar, steel, h, eps_yd, eps_ud, eps_cu, n_min, n_max,
                  warnings_out):
    """Løser bruddtilstanden for ÉN lastkombinasjon.

    Returnerer `(public, extra)`. `public` er NØYAKTIG formen `combinations[i]` skal ha i
    resultatet (§4.3) og går rett ut som JSON. `extra` er interne mellomregninger
    (`moment_sign`, `d_eff`, `as_tension`, `d_eff_all`, `z_na`) som bare GOVERNING-
    kombinasjonen trenger videre (til `section_props`/`checks`/`meta`, §4.3) — å regne dem
    for alle kombinasjonene ville vært bortkastet arbeid for rader ingen speiler.

    Utenfor `[n_min, n_max]` (§4.4): `within_limits: False`, alle utfallsfelt `None`, og en
    `axial_out_of_range`-advarsel MERKET med hvilken kombinasjon det gjelder — ellers
    forsvinner navnet bak `results.js` sin kodetabell når meldinga vises (§4.4). Advarselen
    stopper IKKE resten av kombinasjonene.
    """
    n_ed = combo['N_Ed']
    m_ed = combo['M_Ed']
    theta_c = combo['theta']

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
        public = {
            'id': combo['id'], 'name': combo['name'],
            'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
            'M_Rd': None, 'utilisation': None,
            'x': None, 'x_over_d': None, 'eps_a': None, 'chi_y': None,
            'eps_c_top': None, 'eps_s_max': None, 'failure_mode': None, 'layers': None,
            'within_limits': False,
        }
        extra = {
            'moment_sign': None, 'd_eff': None, 'as_tension': None, 'd_eff_all': None,
            'z_na': None,
        }
        return public, extra

    with _Capture() as cap:
        bend = sc.calculate_bending_strength(theta=theta_c, n=n_ed)
    _drain(cap.records, warnings_out)

    m_rd_signed = float(bend.m_y)
    m_rd = abs(m_rd_signed)
    moment_sign = -1 if m_rd_signed < 0 else 1
    eps_a = float(bend.eps_a)
    chi_y = float(bend.chi_y)
    z_na, x = _neutral_axis(eps_a, chi_y, h, theta_c)
    layers = _layer_state(rebar, eps_a, chi_y, steel)
    eps_s_max = max((l['eps'] for l in layers if l['eps'] is not None), default=None)
    eps_edge = eps_a + chi_y * (-h / 2.0 if _is_hogging(theta_c) else h / 2.0)
    failure_mode = _classify(eps_s_max, eps_edge, layers, eps_yd, eps_ud, eps_cu)

    # d_eff kan først avgjøres NÅ: EC2 9.2.1.1 sin `d` gjelder strekkarmeringen, og hvilke
    # lag som står i strekk ser man i tøyningsplanet ved brudd, ikke i geometrien alene.
    d_eff, as_tension, d_eff_all = _effective_depth(rebar, h, theta_c, eps_a, chi_y)

    public = {
        'id': combo['id'], 'name': combo['name'],
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed), 'theta': _num(theta_c),
        'M_Rd': _num(m_rd), 'utilisation': _num(_utilisation(m_ed, m_rd)),
        'x': _num(x), 'x_over_d': _num(x / d_eff) if (x is not None and d_eff) else None,
        'eps_a': _num(eps_a), 'chi_y': _num(chi_y),
        'eps_c_top': _num(eps_edge), 'eps_s_max': _num(eps_s_max),
        'failure_mode': failure_mode, 'layers': layers,
        'within_limits': True,
    }
    extra = {
        'moment_sign': moment_sign, 'd_eff': d_eff, 'as_tension': as_tension,
        'd_eff_all': d_eff_all, 'z_na': z_na,
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

    law_c = payload['section']['concrete']['law']
    eps_c_name, eps_cu_name = _STRAIN_LIMITS.get(law_c, ('eps_c2', 'eps_cu2'))
    eps_c = float(getattr(conc, eps_c_name))
    eps_cu = float(getattr(conc, eps_cu_name))
    eps_yd = float(steel.epsyd)
    eps_ud = float(steel.epsud())

    if analysis == 'moment_curvature':
        # M–κ regner bare på DEN AKTIVE kombinasjonen (§4.3) — å løse alle de andre ville
        # vært bortkastet arbeid ingen leser noensinne får se, og `chi_plan` er uansett
        # bare meningsfullt for én kombinasjon om gangen (§3.7).
        active_combo = next((c for c in combos if c['id'] == active_id), combos[0])
        public, extra = _solve_combo(
            active_combo, sc, rebar, steel, h, eps_yd, eps_ud, eps_cu, n_min, n_max,
            warnings_out,
        )
        combo_results = [public]
        combo_extras = [extra]
        governing_index = 0 if public['within_limits'] else None
    else:
        # Bøying og M–N-diagrammet løser HVER kombinasjon (§10 B2 punkt 2). Løkka er den
        # ENESTE skriveren av 'solve'-framdrift her (§4.5) — M–κ har sin egen, indre, og to
        # skrivere til samme fase ville vært en felle, ikke en funksjon.
        combo_results = []
        combo_extras = []
        n_combos = len(combos)
        for i, combo in enumerate(combos):
            if progress is not None:
                progress('solve', i, n_combos)
            public, extra = _solve_combo(
                combo, sc, rebar, steel, h, eps_yd, eps_ud, eps_cu, n_min, n_max,
                warnings_out,
            )
            combo_results.append(public)
            combo_extras.append(extra)
        if progress is not None:
            progress('solve', n_combos, n_combos)
        governing_index = _select_governing(combo_results)

    # §4.3 regel 4: ingen kandidater ⇒ `governing: null`, og toppnivåfeltene speiler i
    # stedet den FØRSTE kombinasjonen, slik at figurer og tabeller har noe å vise.
    has_candidate = governing_index is not None
    ref_index = governing_index if has_candidate else 0
    ref = combo_results[ref_index]
    ref_extra = combo_extras[ref_index]
    governing_id = ref['id'] if has_candidate else None

    d_eff = ref_extra['d_eff']
    as_tension = ref_extra['as_tension']
    d_eff_all = ref_extra['d_eff_all']

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

    eps_s_max = ref['eps_s_max']
    ductility_ok = bool(eps_s_max is not None and eps_s_max >= eps_yd)
    as_min_ok = bool(as_min is None or as_total >= as_min)
    as_max_ok = bool(as_total <= as_max)
    # `axial_ok` er sant BARE hvis samtlige løste kombinasjoner ligger innenfor (§4.4).
    axial_ok = all(c['within_limits'] for c in combo_results)
    if not as_min_ok:
        warnings_out.append(_warning(
            'as_min_not_met',
            f'The reinforcement area {as_total:.0f} mm² is less than the minimum '
            f'reinforcement {as_min:.0f} mm² per EC2 9.2.1.1.',
            f'As={as_total} < As_min={as_min}',
            severity='error',
        ))
    if not as_max_ok:
        warnings_out.append(_warning(
            'as_max_exceeded',
            f'The reinforcement area {as_total:.0f} mm² exceeds the maximum reinforcement '
            f'{as_max:.0f} mm² (0.04·A_c) per EC2 9.2.1.1.',
            f'As={as_total} > As_max={as_max}',
            severity='error',
        ))
    if not ductility_ok:
        warnings_out.append(_warning(
            'ductility_limit',
            'The reinforcement does not yield at failure — the cross-section is '
            'over-reinforced and will fail without warning. Increase the cross-section or '
            'reduce the reinforcement.',
            f'eps_s_max={eps_s_max} < eps_yd={eps_yd}',
        ))

    checks = {
        'as_min_ok': as_min_ok,
        'as_max_ok': as_max_ok,
        'ductility_ok': ductility_ok,
        'axial_ok': axial_ok,
        'geometry_ok': bool(geometry_ok),
        'all_ok': bool(as_min_ok and as_max_ok and ductility_ok and geometry_ok),
    }

    moment_sign = ref_extra['moment_sign']
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
            'moment_sign': moment_sign,
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
        common['moment_curvature'] = mc
        common['meta']['mc_active_combo'] = ref['id']
    else:
        # Omhyllingens EGET fortegn kommer fra TVERRSNITTETS retning (`options.theta`),
        # IKKE fra governing. Governing kan hoppe fra felt- til støttemoment bare fordi
        # brukeren endrer ett tall i kombinasjonstabellen, og et fortegn hengt på governing
        # ville da speilvendt hele M–N-diagrammet i samme øyeblikk — aksen skal stå stille
        # mens man redigerer kombinasjoner (§4.1). `domain_theta` er derfor uavhengig av
        # hvilken rad som vinner, og prøves ved N ≈ 0 (klemt inn i [n_min, n_max] i det
        # usannsynlige tilfellet at 0 ikke er et gyldig lastpunkt) fordi fortegnet er en
        # egenskap ved geometrien og roteringen, ikke ved aksialkraften.
        domain_theta = float(opts.get('theta', 0.0))
        domain_probe_n = min(max(0.0, n_min), n_max)
        with _Capture() as cap:
            domain_bend = sc.calculate_bending_strength(theta=domain_theta, n=domain_probe_n)
        _drain(cap.records, warnings_out)
        domain_sign = -1 if float(domain_bend.m_y) < 0 else 1

        arrays = _nm_domain_arrays(sc, domain_theta, domain_sign, opts, warnings_out)
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
            # Duplisert med vilje: `meta` beskriver KJØRINGEN, men `charts.js` får bare
            # `result.nm_domain` alene — `meta` er en søsken, ikke nestet inni. Uten
            # `domain_theta` HER kan ikke plottkoden vite hvilken retning omhyllingen ble
            # signert med, og da havner en støttemomentkombinasjon feilaktig på samme side
            # (+M) som en feltmomentkombinasjon i stedet for på sin egen, negative gren.
            domain_theta=_num(domain_theta),
        )
        # `meta.moment_sign` er GOVERNING sitt rå fortegn (§4.3) og signerer verken `m` her
        # eller noe annet i denne blokka lenger. `meta.domain_theta` er samme tall som
        # `nm_domain.domain_theta` over — retningen omhyllingen FAKTISK ble signert med,
        # slik at plottkode og rapport kan merke aksen presist i stedet for å anta at den
        # er lik `meta.theta`/governing sin retning.
        common['meta']['domain_theta'] = _num(domain_theta)

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
        # `mc_chi` er en STØRRELSE, som alt annet i den analyserte retningen. Pakka vil ha
        # krumningen i sitt eget roterte system, der den alltid er negativ uansett `theta`
        # — `theta` er allerede innbakt i rotasjonen. Krevde vi fortegnsatt inndata, måtte
        # hver konsument gange med `meta.moment_sign` for å få riktig kurve, og glemte man
        # det, fikk man et moment på 0,4 kNm i stedet for 114 kNm uten at noe feilet.
        # Fortegnsatt inndata godtas, men absoluttverdien er sannheten.
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

    kappa = _abs_arr(res.chi_y)
    moment = _abs_arr(res.m_y)

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
        kappa[i] = _num(abs(bend_chi_y)) if bend_chi_y else kappa[i]
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


def _nm_domain_arrays(sc, theta, moment_sign, opts, warnings_out):
    """Full kapasitetsomhylling — bare selve arrayene. `complete_domain` er alltid True.

    Uten begge halvplan finnes det ingen omhylling å treffe for et støttemoment, og 69
    punkter koster én integrasjon hver — omtrent samme pris som én bøyeberegning.

    Regnes ÉN gang per kjøring, med TVERRSNITTETS EGEN retning `options.theta` (§4.1) — ikke
    med governing sin, og ikke én gang per kombinasjon. Omhyllingen er en egenskap ved
    tverrsnittet og aksen den bøyes om, og skal derfor stå stille selv om governing hopper
    fra felt- til støttemoment fordi brukeren redigerer en rad i kombinasjonstabellen; et
    fortegn hengt på governing ville speilvendt hele diagrammet i det øyeblikket. Se kallet
    i `_run_inner`, som også setter `meta.domain_theta` til den `theta`-en som faktisk ble
    brukt her. `complete_domain=True` gir uansett begge grener i samme kall; å regne
    omhyllingen på nytt for hver kombinasjon ville vært 55 ms bortkastet per ekstra rad uten
    at et eneste tall endret seg. Lastpunktene selv (`combinations[i].N_Ed/M_Ed`) tegnes
    oppå denne ene omhyllingen i `charts.js` (§7).

    HVORFOR `m` HER ER FORTEGNSATT OG IKKE EN STØRRELSE, SLIK M–κ ER
    `complete_domain=True` gir BEGGE grener: kapasiteten i den analyserte retningen og
    kapasiteten motsatt vei. Bretter man dem inn i samme halvplan med `abs`, havner
    støttegrenen — som for et enkeltarmert snitt er bitteliten — nærmest origo, og
    `radialUtilisation` sitt «minste positive λ» plukker den systematisk for en
    feltmomentlast. Utnyttelsen ville da blitt grovt overdrevet uten at noe feilet.
    Derfor dreies momentene med `moment_sign`-PARAMETEREN over — IKKE med `meta.moment_sign`,
    som er governing sitt rå fortegn og kan gjelde en annen retning enn omhyllingen ble
    signert med (se `_run_inner`). Kapasitet i den signerte retningen blir positiv, motsatt
    retning negativ, og de to grenene ligger i hvert sitt halvplan der de hører hjemme. M–κ
    har bare én gren, så der er folding ufarlig.
    """
    complete = bool(opts.get('complete_domain', True))
    with _Capture() as cap:
        dom = sc.calculate_nm_interaction_domain(theta=theta, complete_domain=complete)
    _drain(cap.records, warnings_out)

    return {
        'n': _arr(dom.n),                                  # FORTEGNSATT: trykk negativ
        'm': _signed_arr(dom.m_y, moment_sign),            # FORTEGNSATT: analysert retn. positiv
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
