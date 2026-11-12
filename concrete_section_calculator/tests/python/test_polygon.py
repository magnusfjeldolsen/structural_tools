"""test_polygon.py -- fritt tverrsnitt (sak #83) mot analytiske verdier.

Akseptkriteriene i saken, hver med sin test:
  1. A og I_y for referansesnittet (HD265-lignende, 7 sirkulaere hull) innenfor 0,5 % av
     den analytiske verdien for SIRKLER -- polygonet er en innskrevet 32-kant.
  2. M_Rd for et rektangel gitt som polygon = M_Rd for samme rektangel som b x h (1e-9).
  3. Ugyldig geometri gir feilmelding, ikke stacktrace.

Pluss det som ikke staar i saken men som avgjoer om tallene betyr noe: at marin integrerer
polygonet til de samme A/I_y som de lukkede formlene, at momentet regnes om
TYNGDEPUNKTET (der aksialkraften virker) og ikke om det omskrevne rektangelets senter, og
at det som antar rektangel svarer «ikke tilgjengelig» i stedet for aa regne stille.
"""

from __future__ import annotations

import copy
import json
import math
import pathlib
import sys

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = MODULE_DIR / 'tests' / 'fixtures'
sys.path.insert(0, str(MODULE_DIR / 'python'))

import engine  # noqa: E402
from csc_polygon import PolygonError, polygon_props, validated_polygon  # noqa: E402

from structuralcodes.geometry import SurfaceGeometry  # noqa: E402
from structuralcodes.materials.concrete import ConcreteEC2_2004  # noqa: E402
from structuralcodes.sections import BeamSection  # noqa: E402


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


@pytest.fixture(autouse=True)
def _fresh_section():
    engine.reset_cache()
    yield
    engine.reset_cache()


def centred(doc):
    """Samme normalisering som `js/polygon.js`: omskrevet rektangel sentrert i origo."""
    ys = [p[0] for p in doc['outer']]
    zs = [p[1] for p in doc['outer']]
    cy = (min(ys) + max(ys)) / 2.0
    cz = (min(zs) + max(zs)) / 2.0
    shift = lambda ring: [[p[0] - cy, p[1] - cz] for p in ring]  # noqa: E731
    return shift(doc['outer']), [shift(h) for h in doc.get('holes', [])]


def rect_polygon(b, h):
    return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]]


def as_polygon(payload, outer, holes=(), bw=None):
    """Bytter tverrsnittet i en payload til et polygon, ellers uendret."""
    p = copy.deepcopy(payload)
    sec = p['section']
    sec.pop('b', None)
    sec.pop('h', None)
    sec['shape'] = 'polygon'
    sec['outer'] = outer
    sec['holes'] = list(holes)
    if bw is not None:
        sec['bw'] = bw
    return p


# Referansesnittet: 1200 x 265, 7 hull Ø140 c/c 165 i midthoeyden.
HD_B, HD_H, HD_D, HD_N = 1200.0, 265.0, 140.0, 7
A_EXACT = HD_B * HD_H - HD_N * math.pi * HD_D ** 2 / 4.0
# Hullene ligger i tyngdepunktshoeyden (snittet er symmetrisk om midthoeyden), saa
# Steiner-leddet er null for hvert hull.
IY_EXACT = HD_B * HD_H ** 3 / 12.0 - HD_N * math.pi * HD_D ** 4 / 64.0


# ------------------------------------------------------------------ #
# 1. Tverrsnittsstoerrelser
# ------------------------------------------------------------------ #

def test_reference_section_area_and_inertia_within_half_a_percent_of_circles():
    outer, holes = centred(load('section-hd265-7holes.json'))
    props = polygon_props([tuple(p) for p in outer], [[tuple(p) for p in h] for h in holes])
    err_a = props['area'] / A_EXACT - 1.0
    err_i = props['I_y'] / IY_EXACT - 1.0
    # Maalt av orkestratoren: A −0,33 %, I_y −0,10 % med 32 hjoerner. Innskrevet mangekant
    # har MINDRE hull enn sirkelen, altsaa MER betong: feilen paa hullarealet er −0,64 %,
    # og den blir positiv paa nettoarealet.
    assert abs(err_a) < 0.005, err_a
    assert abs(err_i) < 0.005, err_i
    assert props['z_c'] == pytest.approx(0.0, abs=1e-9)


def test_engine_reports_the_polygon_area_and_inertia():
    outer, holes = centred(load('section-hd265-7holes.json'))
    payload = slab_payload(outer, holes)
    res = engine.run(payload)
    assert res['ok'], res.get('error')
    sp = res['section_props']
    assert abs(sp['Ag'] / A_EXACT - 1.0) < 0.005
    assert abs(sp['I_y'] / IY_EXACT - 1.0) < 0.005
    assert sp['shape'] == 'polygon'
    assert sp['b_bbox'] == pytest.approx(HD_B)
    assert sp['h_bbox'] == pytest.approx(HD_H)


def test_marin_integrates_the_polygon_to_the_closed_form_values():
    """Motoren stoler paa at marin regner polygonet med hull riktig. Det skal vaere maalt,
    ikke antatt: brutto A og I_y fra pakka mot de lukkede formlene i `csc_polygon`."""
    outer, holes = centred(load('section-hd265-7holes.json'))
    poly, props = validated_polygon({'outer': outer, 'holes': holes})
    conc = ConcreteEC2_2004(fck=30)
    sec = BeamSection(SurfaceGeometry(poly, conc), integrator='marin')
    gp = sec.gross_properties
    assert gp.area == pytest.approx(props['area'], rel=1e-9)
    assert gp.iyy_c == pytest.approx(props['I_y'], rel=1e-9)


# ------------------------------------------------------------------ #
# 2. Rektangel som polygon = rektangel som b x h
# ------------------------------------------------------------------ #

@pytest.mark.parametrize('name', [
    'payload-beam-300x600.json',
    'payload-beam-300x600-combos.json',
    'payload-slab-1000x200.json',
])
def test_rectangle_as_polygon_gives_the_same_bending_resistance(name):
    rect = load(name)
    rect['analysis'] = 'bending'
    b, h = rect['section']['b'], rect['section']['h']
    poly = as_polygon(rect, rect_polygon(b, h), bw=b)
    r1 = engine.run(rect)
    engine.reset_cache()
    r2 = engine.run(poly)
    assert r1['ok'] and r2['ok'], (r1.get('error'), r2.get('error'))
    assert r2['bending']['M_Rd'] == pytest.approx(r1['bending']['M_Rd'], rel=1e-9)
    for c1, c2 in zip(r1['bending']['combinations'], r2['bending']['combinations']):
        if c1['M_Rd'] is None:
            assert c2['M_Rd'] is None
            continue
        assert c2['M_Rd'] == pytest.approx(c1['M_Rd'], rel=1e-9)
        assert c2['x'] == pytest.approx(c1['x'], rel=1e-9)
        assert c2['eps_a'] == pytest.approx(c1['eps_a'], rel=1e-9, abs=1e-15)
    assert r2['section_props']['Ag'] == pytest.approx(r1['section_props']['Ag'], rel=1e-12)
    assert r2['section_props']['n_min'] == pytest.approx(r1['section_props']['n_min'], rel=1e-9)
    assert r2['section_props']['M_cr'] == pytest.approx(r1['section_props']['M_cr'], rel=1e-9)


def test_rectangle_as_polygon_with_axial_force_and_hogging():
    rect = load('payload-beam-300x600.json')
    rect['loads'] = {'combinations': [
        {'id': 'C1', 'name': 'a', 'type': 'uls', 'N_Ed': -500e3, 'M_Ed': -100e6, 'theta': 0.0},
        {'id': 'C2', 'name': 'b', 'type': 'uls', 'N_Ed': -200e3, 'M_Ed': 50e6,
         'theta': math.pi},
    ], 'active': 'C1'}
    poly = as_polygon(rect, rect_polygon(300.0, 600.0), bw=300.0)
    r1 = engine.run(rect)
    engine.reset_cache()
    r2 = engine.run(poly)
    for c1, c2 in zip(r1['bending']['combinations'], r2['bending']['combinations']):
        assert c2['M_Rd'] == pytest.approx(c1['M_Rd'], rel=1e-9)


def test_rectangle_as_polygon_gives_the_same_nm_domain():
    rect = load('payload-beam-300x600.json')
    rect['analysis'] = 'nm_domain'
    poly = as_polygon(rect, rect_polygon(300.0, 600.0), bw=300.0)
    r1 = engine.run(rect)
    engine.reset_cache()
    r2 = engine.run(poly)
    assert len(r1['nm_domain']['n']) == len(r2['nm_domain']['n'])
    for a, b in zip(r1['nm_domain']['m'], r2['nm_domain']['m']):
        assert b == pytest.approx(a, rel=1e-9, abs=1e-3)


# ------------------------------------------------------------------ #
# Momentet regnes om tyngdepunktet
# ------------------------------------------------------------------ #

T_OUTER = [[-300.0, 150.0], [300.0, 150.0], [300.0, 50.0], [100.0, 50.0], [100.0, -350.0],
           [-100.0, -350.0], [-100.0, 50.0], [-300.0, 50.0]]
# Omskrevet rektangel: y [-300, 300], z [-350, 150] -> ikke sentrert. Flytt z med +100.
T_OUTER = [[y, z + 100.0] for y, z in T_OUTER]


def t_payload(n_ed, m_ed, theta=0.0):
    p = load('payload-beam-300x600.json')
    p = as_polygon(p, T_OUTER, bw=200.0)
    # 3Ø20 i steget, 50 mm over underkant (z = -250 + 50 = -200).
    p['section']['rebar'] = [{
        'id': 'L1', 'kind': 'bars', 'area': 3 * math.pi * 100.0,
        'bars': [{'y': y, 'z': -200.0, 'dia': 20.0} for y in (-50.0, 0.0, 50.0)],
    }]
    p['loads'] = {'combinations': [
        {'id': 'C1', 'name': 'x', 'type': 'uls', 'N_Ed': n_ed, 'M_Ed': m_ed, 'theta': theta},
    ], 'active': 'C1'}
    return p


def test_t_section_moment_is_about_the_centroid_where_the_axial_force_acts():
    """Integrer tøyningsplanet motoren rapporterer, i payloadens system, og regn momentet
    om tyngdepunktet for haand: det skal vaere M_Rd, og normalkraften skal vaere N_Ed.

    Feiler den, er enten `eps_a`-forflytningen eller momentpunktet galt -- og begge gir et
    tall som ser rimelig ut for et symmetrisk snitt og er feil for en T.
    """
    n_ed = -800e3
    res = engine.run(t_payload(n_ed, -100e6))
    assert res['ok'], res.get('error')
    row = res['bending']['combinations'][0]
    zc = res['section_props']['z_c']
    assert zc > 0  # flensen er oppe

    # Samme geometri, UFLYTTET (payloadens system), integrert direkte.
    bundle = engine._build(t_payload(n_ed, -100e6))
    from structuralcodes.geometry import CompoundGeometry
    geo = bundle['section'].geometry.translate(dx=bundle['geom']['y_c'],
                                               dy=bundle['geom']['z_c'])
    sec = BeamSection(geo, integrator='marin')
    forces = sec.section_calculator.integrate_strain_profile(
        [row['eps_a'], row['chi_y'], 0.0])
    n_int, my_origin = forces.n, forces.m_y
    assert n_int == pytest.approx(n_ed, rel=1e-4)
    # Om tyngdepunktet: M_c = M_origo − N·z_c (pakkas fortegn: My = ∫σ·z dA).
    assert my_origin - n_int * zc == pytest.approx(row['M_Rd'], rel=1e-4)
    # ...og IKKE om origo, ellers er testen tannloes.
    assert abs(my_origin - row['M_Rd']) > 1e-3 * abs(row['M_Rd'])
    _ = CompoundGeometry


def test_t_section_cracking_moment_uses_the_tension_side_section_modulus():
    res = engine.run(t_payload(0.0, -50e6))
    sp = res['section_props']
    fctm = res['materials']['fctm']
    props = polygon_props([tuple(p) for p in T_OUTER], [])
    w_bottom = props['I_y'] / (props['z_c'] - props['z_min'])
    assert sp['M_cr'] == pytest.approx(w_bottom * fctm, rel=1e-12)


# ------------------------------------------------------------------ #
# 3. Ugyldig geometri: feilmelding, ikke stacktrace
# ------------------------------------------------------------------ #

def _square_hole(cy, cz, a):
    return [[cy - a, cz - a], [cy + a, cz - a], [cy + a, cz + a], [cy - a, cz + a]]


@pytest.mark.parametrize('outer,holes,fragment', [
    (rect_polygon(400, 400), [_square_hole(0, 0, 50), _square_hole(60, 0, 50)], 'overlap'),
    (rect_polygon(400, 400), [_square_hole(180, 0, 50)], 'strictly inside'),
    (rect_polygon(400, 400), [_square_hole(150, 0, 50)], 'strictly inside'),
    ([[-200, -200], [200, 200], [200, -200], [-200, 200]], [], 'crosses itself'),
    ([[-200, -200], [200, -200]], [], 'at least three'),
    ([[-200, -200], [200, -200], ['a', 3]], [], 'not a number'),
    ([[-200, -200], [200, -200], [200, 200], [-200, float('nan')]], [], 'not finite'),
    ([[0, 0], [400, 0], [400, 400], [0, 400]], [], 'not centred'),
    (rect_polygon(400, 400), [_square_hole(0, 0, 50), _square_hole(100, 0, 50)], 'touch'),
])
def test_invalid_geometry_gives_a_message_not_a_stacktrace(outer, holes, fragment):
    p = as_polygon(load('payload-beam-300x600.json'), outer, holes, bw=200)
    res = engine.run(p)
    assert res['ok'] is False
    assert res['error']['code'] == 'invalid_geometry'
    assert fragment in res['error']['message']
    for field in ('message', 'detail'):
        assert 'Traceback' not in res['error'][field]


def test_overlapping_holes_never_reach_marin():
    """Det orkestratoren maalte: overlappende hull gir GEOSException i marin. Kontrollen
    skal stoppe dem foer pakka i det hele tatt ser geometrien."""
    with pytest.raises(PolygonError):
        validated_polygon({'outer': rect_polygon(400, 400),
                           'holes': [_square_hole(0, 0, 50), _square_hole(60, 0, 50)]})


def test_closed_rings_are_accepted():
    ring = rect_polygon(400, 400)
    _poly, props = validated_polygon({'outer': ring + [ring[0]], 'holes': []})
    assert props['area'] == pytest.approx(160000.0)


# ------------------------------------------------------------------ #
# Det som antar rektangel: «ikke tilgjengelig», ikke stille feil
# ------------------------------------------------------------------ #

def slab_payload(outer, holes, bw=None, combos=None, sls=None):
    p = load('payload-slab-1000x200.json')
    p = as_polygon(p, outer, holes, bw=bw)
    # 10 Ø12 i underflensen, 35 mm fra underkant: under hullene (hullbunn z = −70).
    z = -HD_H / 2 + 35.0
    p['section']['rebar'] = [{
        'id': 'L1', 'kind': 'bars', 'area': 10 * math.pi * 36.0,
        'bars': [{'y': -540.0 + i * 120.0, 'z': z, 'dia': 12.0} for i in range(10)],
    }]
    # Skjaerblokka er alltid med fra `payload.js`; plate-fixturen er eldre enn skjaer.
    p['section']['shear'] = {'strut_angle_deg': 45, 'z_factor': 0.9, 'stirrups': []}
    if combos is not None:
        p['loads'] = {'combinations': combos, 'active': combos[0]['id']}
    if sls is not None:
        p['sls'] = sls
    return p


def test_bar_in_a_hole_is_a_geometry_error():
    outer, holes = centred(load('section-hd265-7holes.json'))
    p = slab_payload(outer, holes)
    p['section']['rebar'][0]['bars'][0]['z'] = 0.0   # midt i et hull
    p['section']['rebar'][0]['bars'][0]['y'] = 0.0
    res = engine.run(p)
    assert res['checks']['geometry_ok'] is False
    assert any(w['code'] == 'bar_outside_section' for w in res['warnings'])


def test_bars_in_the_bottom_flange_are_inside():
    outer, holes = centred(load('section-hd265-7holes.json'))
    res = engine.run(slab_payload(outer, holes))
    assert res['checks']['geometry_ok'] is True


def test_as_min_is_unanswered_with_a_reason():
    outer, holes = centred(load('section-hd265-7holes.json'))
    res = engine.run(slab_payload(outer, holes, combos=[
        {'id': 'C1', 'name': 'u', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6, 'theta': 0.0}]))
    assert res['checks']['as_min_ok'] is None
    assert res['section_props']['As_min'] is None
    assert res['section_props']['b_t'] is None
    assert res['section_props']['rho'] is None
    detail = next(w for w in res['warnings'] if w['code'] == 'assessment_incomplete')['detail']
    assert 'custom cross-section' in detail and 'b_t' in detail


def test_shear_without_bw_is_unanswered_never_computed_with_the_bounding_box():
    outer, holes = centred(load('section-hd265-7holes.json'))
    combos = [{'id': 'C1', 'name': 'u', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6,
               'theta': 0.0, 'V_Ed': 100e3}]
    res = engine.run(slab_payload(outer, holes, combos=combos))
    sh = res['bending']['combinations'][0]['shear']
    assert sh['evaluated'] is False and sh['reason'] == 'bw_missing'
    assert sh['bw'] is None and sh['V_Rd'] is None
    assert res['checks']['shear_ok'] is None
    detail = next(w for w in res['warnings'] if w['code'] == 'assessment_incomplete')['detail']
    assert 'b_w' in detail


def test_shear_with_explicit_bw_uses_bw_and_the_polygon_area():
    """V_Rd,c med b_w = summen av stegene og A_c = polygonets areal -- regnet mot
    `ec2_2004.VRdc` direkte med de samme tallene."""
    from structuralcodes.codes import ec2_2004
    outer, holes = centred(load('section-hd265-7holes.json'))
    bw = 1200.0 - 7 * 140.0
    combos = [{'id': 'C1', 'name': 'u', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6,
               'theta': 0.0, 'V_Ed': 100e3}]
    p = slab_payload(outer, holes, bw=bw, combos=combos)
    p['section']['shear'] = {'strut_angle_deg': 45, 'z_factor': 0.9, 'stirrups': []}
    res = engine.run(p)
    sh = res['bending']['combinations'][0]['shear']
    assert sh['evaluated'] is True and sh['bw'] == bw
    expected = ec2_2004.VRdc(fck=p['section']['concrete']['fck'], d=sh['d'], Asl=sh['Asl'],
                             bw=bw, NEd=0.0, Ac=res['section_props']['Ag'],
                             fcd=res['materials']['fcd'])
    assert sh['V_Rd_c'] == pytest.approx(expected, rel=1e-12)
    # Uten boeyler: ubesvart minimumskrav (bjelke eller plate kan ikke leses av polygonet).
    assert res['checks']['asw_min_ok'] is None


def test_sls_is_not_available_for_a_custom_section():
    outer, holes = centred(load('section-hd265-7holes.json'))
    combos = [
        {'id': 'C1', 'name': 'u', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6, 'theta': 0.0},
        {'id': 'C2', 'name': 'qp', 'type': 'quasi_permanent', 'N_Ed': 0.0, 'M_Ed': -30e6,
         'theta': 0.0},
    ]
    sls = {'phi_ef': 2.0, 'exposure_class': 'XC3', 'w_max': 0.3, 'w_max_source': 'class',
           'w_max_reason': None, 'assume_cracked': False, 'sigma_c_char_factor': 0.6,
           'sigma_c_qp_factor': 0.45, 'sigma_s_char_factor': 0.8,
           'sigma_c_char_required': False}
    res = engine.run(slab_payload(outer, holes, combos=combos, sls=sls))
    assert 'sls' not in res
    assert res['checks']['sls_ok'] is None
    assert res['checks']['all_ok'] is None
    assert any(w['code'] == 'sls_not_available_custom_section' for w in res['warnings'])


def test_no_sls_rows_means_no_sls_check_at_all():
    outer, holes = centred(load('section-hd265-7holes.json'))
    res = engine.run(slab_payload(outer, holes))
    assert 'sls_ok' not in res['checks']


def test_hollow_core_bending_resistance_matches_a_hand_calculation():
    """Plastisk haandregning: armeringen flyter, trykksonen ligger i overflensen (over
    hullene), rektangulaer spenningsblokk 0,8x med η = 1 for f_ck ≤ 50.

    Sammenlikningen er grov (5 %) fordi motoren bruker parabel-rektangel og EC2-tøyninger,
    men den viser at hullene IKKE har gjort snittet svakere i trykksonen der de ikke er --
    og at et snitt som regnes som massivt ikke er det som skjer her.
    """
    outer, holes = centred(load('section-hd265-7holes.json'))
    res = engine.run(slab_payload(outer, holes, combos=[
        {'id': 'C1', 'name': 'u', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6, 'theta': 0.0}]))
    mat = res['materials']
    as_ = 10 * math.pi * 36.0
    fyd = mat['fyd']
    fcd = mat['fcd']
    d = HD_H - 35.0
    x = as_ * fyd / (0.8 * fcd * HD_B)
    assert 0.8 * x < (HD_H - HD_D) / 2  # blokka ligger i overflensen
    m_hand = as_ * fyd * (d - 0.4 * x)
    assert abs(res['bending']['M_Rd']) == pytest.approx(m_hand, rel=0.05)


# ------------------------------------------------------------------ #
# Payloaden `payload.js` faktisk bygger (JS -> Python, samme fil)
# ------------------------------------------------------------------ #

def test_the_payload_js_builds_for_the_hollow_core_runs_in_the_engine():
    """`custom-section.test.mjs` paastaar at `buildPayload` gir NOEYAKTIG denne fila.
    Her kjoeres den samme fila -- koblingen som gjoer «samme tall i JS og Python» til noe
    som kan etterproeves, ikke bare to sider som hver tror de er enige."""
    payload = load('payload-custom-hd265.json')
    assert payload['section']['shape'] == 'polygon'
    assert 'b' not in payload['section'] and 'h' not in payload['section']
    res = engine.run(payload)
    assert res['ok'], res.get('error')
    assert res['checks']['geometry_ok'] is True
    assert abs(res['section_props']['Ag'] / A_EXACT - 1.0) < 0.005
    row = res['bending']['combinations'][0]
    assert row['shear']['evaluated'] is True
    assert row['shear']['bw'] == 220.0
    assert row['M_Rd'] < 0 and row['utilisation'] < 1.0
