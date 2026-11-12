"""test_prestress.py -- forspent armering og beregningssteg (sak #84).

FASITEN er `docs/prestress-hand-calc.py`: en uavhengig haandregning (Navier paa
transformert tverrsnitt, EC2 5.46 skrevet ut, stripeintegrasjon for det rissede snittet)
som ble skrevet FOER motorkoden og ikke importerer den. Tallene derfra staar her som
konstanter, i to sett:

  HAND_CIRCLE  -- ekte sirkulaere kanaler. Akseptkriteriet i saken: motoren innen 1 % ved
                  t0 for sigma_c o.k./u.k. og sigma_p.
  HAND_GON     -- den innskrevne 32-kanten motoren faktisk faar (fixturen). Samme modell,
                  samme geometri: motoren skal treffe til avrunding (1e-6). Avviket mot
                  sirkelen er dermed GEOMETRIEN (A +0,33 %), ikke modellen.

Antagelsene (f_ck(t0) = 30, RH 50 %, sement R, t0 = 1 d, 50 aar, klasse 2, ...) staar i
hodet paa haandregningen.
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
import csc_prestress as cp  # noqa: E402
from csc_polygon import validated_polygon  # noqa: E402

from structuralcodes.geometry import CompoundGeometry, PointGeometry, SurfaceGeometry  # noqa: E402
from structuralcodes.materials.concrete import ConcreteEC2_2004  # noqa: E402
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004  # noqa: E402
from structuralcodes.sections import BeamSection  # noqa: E402


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


@pytest.fixture(autouse=True)
def _fresh_section():
    engine.reset_cache()
    yield
    engine.reset_cache()


# ------------------------------------------------------------------ #
# Haandregningens tall (docs/prestress-hand-calc.py, kjoert 2026-11-12)
# ------------------------------------------------------------------ #

HAND_CIRCLE = {
    'M_g': -65701053.7443344,
    't0': {'sig_top': -3.10318303, 'sig_bot': -6.32484766, 'sigma_p': 1065.68869,
           'chi': 3.70234338e-07, 'M_dec': -151652065.0, 'M_cr': -188632463.0},
    'tinf': {'sig_top': -3.46288046, 'sig_bot': -4.20972281, 'sigma_p': 867.265583,
             'chi': 2.88263248e-07, 'M_dec': -122694272.0, 'M_cr': -174078828.0},
    'd_sigma_csr': 198.423108,
}

HAND_GON = {
    'M_g': -65917009.77423401,
    'phi': 2.70959049, 'h0': 94.443134,
    't0': {'sig_top': -3.10556064, 'sig_bot': -6.29294777, 'sigma_p': 1065.84356,
           'chi': 3.66295161e-07, 'M_dec': -151511468.0, 'M_cr': -188525141.0},
    'losses': {'eps_cs': 0.000636803405, 'd_sigma_pr': 23.6662884, 'sigma_c_qp': 5.75169335,
               'denominator': 1.14510159, 'd_sigma_csr': 198.120525,
               'term_shrinkage': 108.441613, 'term_relaxation': 16.533931,
               'term_creep': 73.1449813},
    'tinf': {'sig_top': -3.46637665, 'sig_bot': -4.18512357, 'sigma_p': 867.723036,
             'chi': 2.773005e-07, 'M_dec': -122628558.0, 'M_cr': -174059698.0},
    'eps_p_star': 0.00456184395,
    'loaded_150': {'sig_top': -9.86406347, 'sig_bot': 2.01992135, 'sigma_p': 889.569708,
                   'chi': -1.03342991e-06},
    'cracked_200': {'sig_top': -22.1847785, 'sig_bot': 0.0, 'sigma_p': 1106.04717,
                    'chi': -7.6230287e-06},
}

# Fra haandregningen: rektangulaer trykksone, f_pd uten fasthetsoekning. Stoerrelsesorden.
M_RD_BLOCK = -267347281.66351607

KEYS = {'sig_top': 'sigma_c_top', 'sig_bot': 'sigma_c_bottom', 'chi': 'chi',
        'M_dec': 'M_dec', 'M_cr': 'M_cr'}


# ------------------------------------------------------------------ #
# Referansepayloaden
# ------------------------------------------------------------------ #

def centred(doc):
    ys = [p[0] for p in doc['outer']]
    zs = [p[1] for p in doc['outer']]
    cy = (min(ys) + max(ys)) / 2.0
    cz = (min(zs) + max(zs)) / 2.0
    shift = lambda ring: [[p[0] - cy, p[1] - cz] for p in ring]  # noqa: E731
    return shift(doc['outer']), [shift(h) for h in doc.get('holes', [])]


TENDON_Y = [-540.0 + 120.0 * i for i in range(10)]


def tendon_layer(sigma_p0=1100.0, **extra):
    ps = {'area_per_tendon': 93.0, 'sigma_p0': sigma_p0, 'Ep': 195000.0,
          'fp01k': 1640.0, 'fpk': 1860.0, 'epsuk': 0.035, 'gamma_s': 1.15,
          'gamma_eps': 0.9, 'law': 'elasticplastic'}
    ps.update(extra)
    if ps.get('sigma_p0') is None:
        ps.pop('sigma_p0')
    return {'id': 'P1', 'kind': 'bars', 'area': 930.0,
            'bars': [{'y': y, 'z': -87.5, 'dia': 12.5} for y in TENDON_Y],
            'prestress': ps}


def hd265_payload(combos=None, prestress_cfg=True, layers=None):
    p = load('payload-custom-hd265.json')
    outer, holes = centred(load('section-hd265-7holes.json'))
    p['section']['outer'] = outer
    p['section']['holes'] = holes
    p['section']['concrete']['fck'] = 45
    p['section']['rebar'] = layers if layers is not None else [tendon_layer()]
    p['loads']['combinations'] = combos or [
        {'id': 'C1', 'name': 'ULS', 'type': 'uls', 'N_Ed': 0, 'M_Ed': -100e6,
         'V_Ed': 0, 'theta': 0},
    ]
    p['loads']['active'] = p['loads']['combinations'][0]['id']
    if prestress_cfg:
        p['prestress'] = {
            'fck_t0': 30.0, 'M_transfer': HAND_GON['M_g'], 'M_permanent': HAND_GON['M_g'],
            'sigma_p_inf': None, 'phi': HAND_GON['phi'], 'RH': 50.0, 'cement': 'R',
            't0': 1.0, 't_life': 50 * 365.0, 'h0': HAND_GON['h0'], 'relaxation_class': 2,
            'rho_1000': None,
        }
    return p


def rel(a, b):
    return abs(a - b) / abs(b)


def run_ok(payload):
    res = engine.run(payload)
    assert res.get('error') is None or res['ok'], res.get('error')
    assert 'prestress' in res, res.get('error')
    return res


# ------------------------------------------------------------------ #
# 1. Akseptkriteriet: t0 innen 1 % av haandregningen (sirkler)
# ------------------------------------------------------------------ #

def test_transfer_stage_within_one_percent_of_the_hand_calculation():
    res = run_ok(hd265_payload())
    t0 = res['prestress']['stages'][0]
    assert t0['stage'] == 'transfer'
    for key in ('sig_top', 'sig_bot'):
        assert rel(t0[KEYS[key]], HAND_CIRCLE['t0'][key]) < 0.01, key
    assert rel(t0['tendons'][0]['sigma_p'], HAND_CIRCLE['t0']['sigma_p']) < 0.01
    assert t0['uncracked'] is True


def test_curvature_at_transfer_deviates_by_the_polygon_not_the_model():
    """chi ved t0 er DIFFERANSEN av to nesten like momenter (forspenning mot egenvekt),
    og arver derfor det relative avviket i I og A forsterket: 32-kanten gir -1,06 % mot
    sirkelen. Mot 32-kanten er avviket null -- avviket er geometrien, ikke modellen."""
    res = run_ok(hd265_payload())
    chi = res['prestress']['stages'][0]['chi']
    assert 0.01 < rel(chi, HAND_CIRCLE['t0']['chi']) < 0.011
    assert rel(chi, HAND_GON['t0']['chi']) < 1e-6


@pytest.mark.parametrize('stage_index,ref', [(0, 't0'), (1, 'tinf')])
def test_stages_hit_the_32gon_hand_calculation_to_round_off(stage_index, ref):
    res = run_ok(hd265_payload())
    st = res['prestress']['stages'][stage_index]
    for key, ek in KEYS.items():
        assert rel(st[ek], HAND_GON[ref][key]) < 1e-6, (ref, key, st[ek])
    assert rel(st['tendons'][0]['sigma_p'], HAND_GON[ref]['sigma_p']) < 1e-6


def test_long_term_within_one_percent_of_circles():
    res = run_ok(hd265_payload())
    lt = res['prestress']['stages'][1]
    for key in ('sig_top', 'sig_bot', 'M_dec', 'M_cr'):
        assert rel(lt[KEYS[key]], HAND_CIRCLE['tinf'][key]) < 0.01, key
    assert rel(lt['tendons'][0]['sigma_p'], HAND_CIRCLE['tinf']['sigma_p']) < 0.01


def test_each_loss_term_is_reported_and_matches_the_hand_calculation():
    """EC2 5.46 ledd for ledd: svinn fra `structuralcodes.codes.ec2_2004`, relaksasjon
    etter 3.29 klasse 2, kryp med modulens kryptall. Haandregningen skriver ut de samme
    formlene uavhengig (ikke pakka) -- at svinnet treffer, er altsaa en kontroll av pakka."""
    res = run_ok(hd265_payload())
    loss = res['prestress']['losses'][0]
    assert loss['source'] == 'ec2_5_46'
    for key, val in HAND_GON['losses'].items():
        assert rel(loss[key], val) < 1e-6, key
    total = loss['term_shrinkage'] + loss['term_relaxation'] + loss['term_creep']
    assert total == pytest.approx(loss['d_sigma_csr'], rel=1e-12)
    assert loss['sigma_p_inf'] == pytest.approx(loss['sigma_pi'] - loss['d_sigma_csr'])
    assert loss['d_sigma_el'] == pytest.approx(1100.0 - HAND_GON['t0']['sigma_p'], rel=1e-6)
    assert rel(res['prestress']['tendons'][0]['eps_p_star'], HAND_GON['eps_p_star']) < 1e-6


def test_override_of_the_stress_after_losses_skips_the_loss_calculation():
    p = hd265_payload()
    p['prestress']['sigma_p_inf'] = 900.0
    p['prestress']['phi'] = None      # trengs ikke naar tapet er gitt
    res = run_ok(p)
    loss = res['prestress']['losses'][0]
    assert loss['source'] == 'override'
    assert loss['d_sigma_total'] == pytest.approx(200.0)
    assert res['prestress']['stages'][1]['tendons'][0]['sigma_p'] == pytest.approx(900.0)


# ------------------------------------------------------------------ #
# 2. Belastet: per bruksgrensekombinasjon, urisset og risset
# ------------------------------------------------------------------ #

def _sls_combos():
    return [
        {'id': 'U', 'name': 'ULS', 'type': 'uls', 'N_Ed': 0, 'M_Ed': -200e6, 'V_Ed': 0,
         'theta': 0},
        {'id': 'K1', 'name': 'char 150', 'type': 'characteristic', 'N_Ed': 0,
         'M_Ed': -150e6, 'V_Ed': 0, 'theta': 0},
        {'id': 'K2', 'name': 'char 200', 'type': 'characteristic', 'N_Ed': 0,
         'M_Ed': -200e6, 'V_Ed': 0, 'theta': 0},
    ]


def test_loaded_stage_per_serviceability_combination_uncracked_and_cracked():
    res = run_ok(hd265_payload(combos=_sls_combos()))
    loaded = [s for s in res['prestress']['stages'] if s['stage'] == 'loaded']
    assert [s['combo'] for s in loaded] == ['K1', 'K2']   # ULS-raden er ikke et steg
    k1, k2 = loaded
    assert k1['uncracked'] is True
    for key in ('sig_top', 'sig_bot', 'chi'):
        assert rel(k1[KEYS[key]], HAND_GON['loaded_150'][key]) < 1e-6, key
    assert rel(k1['tendons'][0]['sigma_p'], HAND_GON['loaded_150']['sigma_p']) < 1e-6
    assert k1['dM'] == pytest.approx(-150e6 - HAND_GON['M_g'])
    # 200 kNm er over rissmomentet (174 kNm): risset snitt, null strekk i betong, mot
    # haandregningens UAVHENGIGE stripeintegrasjon (ikke polygonklipping).
    assert k2['uncracked'] is False
    assert k2['sigma_c_bottom'] == 0.0
    for key in ('sig_top', 'chi'):
        assert rel(k2[KEYS[key]], HAND_GON['cracked_200'][key]) < 1e-5, key
    assert rel(k2['tendons'][0]['sigma_p'], HAND_GON['cracked_200']['sigma_p']) < 1e-5


def test_loaded_at_the_permanent_moment_reproduces_the_long_term_state():
    combos = [{'id': 'Q', 'name': 'qp', 'type': 'quasi_permanent', 'N_Ed': 0,
               'M_Ed': HAND_GON['M_g'], 'V_Ed': 0, 'theta': 0}]
    p = hd265_payload(combos=[
        {'id': 'U', 'name': 'ULS', 'type': 'uls', 'N_Ed': 0, 'M_Ed': -100e6, 'V_Ed': 0,
         'theta': 0}] + combos)
    res = run_ok(p)
    lt, q = res['prestress']['stages'][1], res['prestress']['stages'][2]
    for key in ('sigma_c_top', 'sigma_c_bottom', 'chi'):
        assert q[key] == pytest.approx(lt[key], rel=1e-9)
    assert q['tendons'][0]['sigma_p'] == pytest.approx(lt['tendons'][0]['sigma_p'], rel=1e-9)


def test_cracked_kernel_on_a_rectangle_matches_the_closed_form():
    """Rektangel b x h med ett lag slakkarmering, ren boeyning: x fra x^2 b/2 = n A_s (d-x),
    sigma_c = M x / I_cr, sigma_s = n M (d - x)/I_cr. Klassisk, uavhengig av polygonet."""
    from shapely import Polygon
    b, h, a_s, d, ec, es = 300.0, 600.0, 1500.0, 550.0, 33000.0, 200000.0
    n = es / ec
    x = (-n * a_s + math.sqrt((n * a_s) ** 2 + 2 * b * n * a_s * d)) / b
    i_cr = b * x ** 3 / 3 + n * a_s * (d - x) ** 2
    m = -150e6
    poly = Polygon([(-b / 2, -h / 2), (b / 2, -h / 2), (b / 2, h / 2), (-b / 2, h / 2)])
    steel = [{'z': h / 2 - d, 'area': a_s, 'E': es, 'eps0': 0.0}]
    sol = cp.solve_plane(poly, ec, steel, 0.0, m, 0.0, cracked=True)
    top = ec * (sol['eps_a'] + sol['chi'] * h / 2)
    sig_s = es * (sol['eps_a'] + sol['chi'] * (h / 2 - d))
    assert top == pytest.approx(m * x / i_cr, rel=1e-9)
    assert sig_s == pytest.approx(-n * m * (d - x) / i_cr, rel=1e-9)


# ------------------------------------------------------------------ #
# 3. Bruddgrensen med forspenningen inne
# ------------------------------------------------------------------ #

def _m_rd_without_prestress():
    """Samme snitt og tau, men UTEN initialtoeyning -- bygget direkte i pakka."""
    outer, holes = centred(load('section-hd265-7holes.json'))
    poly, props = validated_polygon({'outer': outer, 'holes': holes})
    conc = ConcreteEC2_2004(fck=45, gamma_c=1.5, alpha_cc=1.0,
                            constitutive_law='parabolarectangle')
    tendon = ReinforcementEC2_2004(fyk=1640, Es=195000, ftk=1860, epsuk=0.035, gamma_s=1.15,
                                   gamma_eps=0.9, constitutive_law='elasticplastic')
    parts = [SurfaceGeometry(poly, conc)]
    for y in TENDON_Y:
        parts.append(PointGeometry((y, -87.5), cp.equivalent_diameter(93.0), tendon))
    geo = CompoundGeometry(parts).translate(dx=-props['y_c'], dy=-props['z_c'])
    sec = BeamSection(geo, integrator='marin')
    return float(sec.section_calculator.calculate_bending_strength(theta=0, n=0).m_y)


def test_uls_bending_resistance_includes_the_prestress():
    res = run_ok(hd265_payload())
    m_rd = res['bending']['M_Rd']
    m_rd_0 = _m_rd_without_prestress()
    # Stoerrelsesorden mot haandregningens rektangulaere trykksone (f_pd uten
    # fasthetsoekning): den skraa grenen gir litt mer, aldri mindre.
    assert m_rd < M_RD_BLOCK
    assert rel(m_rd, M_RD_BLOCK) < 0.05
    # Med forspenning MER kapasitet enn uten: uten initialtoeyning naar tauet ikke f_pd
    # for betongen knuses (eps_p ~ 0,013 < eps_pd + plastisk del ville krevd mer).
    assert m_rd < m_rd_0 < 0
    assert res['prestress']['uls_prestrain'] == 'long_term'
    layer = res['bending']['layers'][0]
    assert layer['prestressed'] is True
    assert layer['eps_0'] == pytest.approx(HAND_GON['eps_p_star'], rel=1e-6)
    assert layer['eps_total'] == pytest.approx(layer['eps'] + layer['eps_0'])
    # Spenningen er fra TAUETS lov (f_pd = 1426), ikke slakkarmeringens (f_yd = 435).
    assert layer['sigma'] > 1400


def test_marin_integrates_passive_and_prestressed_steel_in_the_same_section():
    """0.7.2-rettelsen for flere armeringsmaterialer, naa med initialtoeyning paa det ene.

    Planene er valgt slik at HELE betongen staar i strekk (bidrar 0 i designloven), saa N og
    M fra marin er stalet alene -- og det kan regnes for haand: slakk E_s eps, tau
    E_p (eps + eps_p*), begge under flytegrensen."""
    top = {'id': 'S1', 'kind': 'bars', 'area': 10 * math.pi * 25.0,
           'bars': [{'y': y, 'z': 102.5, 'dia': 10.0} for y in TENDON_Y]}
    p = hd265_payload(layers=[tendon_layer(), top])
    bundle = engine._build(p)
    sc = bundle['section'].section_calculator
    z_c = bundle['geom']['z_c']
    eps_star = bundle['prestress'].eps_p_star['P1']
    a_p = 10 * 93.0
    a_s = 10 * math.pi * 25.0
    for eps_a, chi in ((1.0e-3, 0.0), (1.2e-3, 2.0e-6), (1.2e-3, -2.0e-6)):
        # pakkas plan er om tyngdepunktet; lagenes z er i payloadens system
        res = sc.integrate_strain_profile([eps_a, chi, 0.0])
        n_pack, m_pack = float(res.n), float(res.m_y)
        e_p = eps_a + chi * (-87.5 - z_c)
        e_s = eps_a + chi * (102.5 - z_c)
        assert min(e_p, e_s, eps_a - abs(chi) * 132.5) > 0     # all betong i strekk
        s_p = 195000.0 * (e_p + eps_star)
        s_s = 200000.0 * e_s
        assert s_p < 1640 / 1.15 and s_s < 500 / 1.15
        n_hand = a_p * s_p + a_s * s_s
        m_hand = a_p * s_p * (-87.5 - z_c) + a_s * s_s * (102.5 - z_c)
        assert n_pack == pytest.approx(n_hand, rel=1e-9)
        assert m_pack == pytest.approx(m_hand, rel=1e-9)


def test_bundle_has_one_material_per_prestressed_layer_and_the_passive_steel_untouched():
    top = {'id': 'S1', 'kind': 'bars', 'area': 10 * math.pi * 25.0,
           'bars': [{'y': y, 'z': 102.5, 'dia': 10.0} for y in TENDON_Y]}
    bundle = engine._build(hd265_payload(layers=[tendon_layer(), top]))
    assert set(bundle['layer_materials']) == {'P1'}
    assert bundle['steel'].initial_strain is None
    # Slakkarmeringen i overkant tar litt av trykket ved t_inf, saa eps_p* er ikke helt
    # det samme som uten den -- men naer (0,01 %).
    assert bundle['layer_materials']['P1'].initial_strain == pytest.approx(
        HAND_GON['eps_p_star'], rel=1e-3)
    engine.reset_cache()
    only = engine._build(hd265_payload())
    assert only['layer_materials']['P1'].initial_strain == pytest.approx(
        HAND_GON['eps_p_star'], rel=1e-6)


# ------------------------------------------------------------------ #
# 4. Fortegn og ugyldige inndata feiler hoeylytt
# ------------------------------------------------------------------ #

@pytest.mark.parametrize('extra', [
    {'sigma_p0': -1100.0},
    {'sigma_p0': None, 'eps_p0': -1100.0 / 195000.0},
])
def test_wrong_sign_of_the_prestress_fails_loudly(extra):
    p = hd265_payload(layers=[tendon_layer(**extra)])
    res = engine.run(p)
    assert res['ok'] is False
    assert res['error']['code'] == 'invalid_prestress'
    assert 'TENSILE' in res['error']['message']
    assert 'Traceback' not in res['error']['detail']


@pytest.mark.parametrize('extra,needle', [
    ({'area_per_tendon': None}, 'area per tendon'),
    ({'sigma_p0': 1700.0}, 'f_p0,1k'),
    ({'eps_p0': 0.005}, 'not both'),
])
def test_invalid_tendon_input_gives_a_message_not_a_stacktrace(extra, needle):
    res = engine.run(hd265_payload(layers=[tendon_layer(**extra)]))
    assert res['ok'] is False
    assert res['error']['code'] == 'invalid_prestress'
    assert needle in res['error']['message']


def test_a_negative_prestrain_on_the_package_material_would_reverse_the_camber():
    """Hvorfor fortegnet ER kontrollen: med -eps_p0 i pakka krummer snittet NED ved t0
    (chi < 0) i stedet for opp. Uten avvisningen over ville det vaert et stille tall."""
    outer, holes = centred(load('section-hd265-7holes.json'))
    poly, props = validated_polygon({'outer': outer, 'holes': holes})
    for sign, expect in ((1, 1), (-1, -1)):
        steel = [{'z': -87.5, 'area': 930.0, 'E': 195000.0, 'eps0': sign * 1100 / 195000}]
        sol = cp.solve_plane(poly, 32836.6, steel, 0.0, 0.0, props['z_c'])
        assert math.copysign(1, sol['chi']) == expect


def test_stress_above_the_recommended_limit_is_a_warning_not_an_error():
    res = run_ok(hd265_payload(layers=[tendon_layer(sigma_p0=1450.0)]))
    assert any(w['code'] == 'prestress_above_limit' for w in res['warnings'])


def test_without_stage_data_the_uls_uses_sigma_p0_and_says_so():
    res = run_ok(hd265_payload(prestress_cfg=False))
    assert res['prestress']['uls_prestrain'] == 'sigma_p0'
    assert res['prestress']['stages'] is None
    assert any(w['code'] == 'prestress_stages_missing' for w in res['warnings'])
    assert res['bending']['layers'][0]['eps_0'] == pytest.approx(1100 / 195000)


# ------------------------------------------------------------------ #
# 4b. Payloaden `payload.js` faktisk bygger (JS -> Python, samme fil)
# ------------------------------------------------------------------ #

def test_the_payload_js_builds_for_the_prestressed_hollow_core_hits_the_hand_calculation():
    """`prestress.test.mjs` paastaar at `buildPayload` av referansetilstanden gir NOEYAKTIG
    denne fila. Her kjoeres den gjennom motoren og sammenliknes med haandregningen: hele
    kjeden skjema -> payload -> motor treffer tallene som ble skrevet foer motorkoden."""
    p = load('payload-custom-hd265-prestressed.json')
    res = run_ok(p)
    assert res['ok'], res.get('error')
    stages = res['prestress']['stages']
    assert [s['stage'] for s in stages] == ['transfer', 'long_term', 'loaded', 'loaded']
    for st, ref in ((stages[0], 't0'), (stages[1], 'tinf')):
        for key, ek in KEYS.items():
            assert rel(st[ek], HAND_GON[ref][key]) < 1e-6, (ref, key)
        assert rel(st['tendons'][0]['sigma_p'], HAND_GON[ref]['sigma_p']) < 1e-6
    k150, k200 = stages[2], stages[3]
    assert k150['uncracked'] is True and k200['uncracked'] is False
    assert rel(k150['sigma_c_bottom'], HAND_GON['loaded_150']['sig_bot']) < 1e-6
    assert rel(k200['tendons'][0]['sigma_p'], HAND_GON['cracked_200']['sigma_p']) < 1e-5
    assert res['checks']['sls_ok'] is None
    assert any(w['code'] == 'sls_not_available_prestress' for w in res['warnings'])


# ------------------------------------------------------------------ #
# 5. Bakoverkompatibelt og ingen stille SLS for forspent rektangel
# ------------------------------------------------------------------ #

def test_no_prestress_key_without_a_prestressed_layer():
    for name in ('payload-beam-300x600.json', 'payload-custom-hd265.json'):
        res = engine.run(load(name))
        assert 'prestress' not in res
        engine.reset_cache()


def test_prestress_on_a_rectangle_makes_sls_unanswered_not_wrong():
    p = load('payload-beam-300x600-combos.json')
    p['section']['rebar'] = [dict(tendon_layer(), bars=[
        {'y': y, 'z': -250.0, 'dia': 12.5} for y in (-100.0, -50.0, 0.0, 50.0, 100.0)],
        area=5 * 93.0)]
    p['section']['rebar'][0]['prestress']['area_per_tendon'] = 93.0
    p['prestress'] = {'fck_t0': 25.0, 'M_transfer': 0.0, 'M_permanent': 0.0,
                      'sigma_p_inf': 900.0}
    p['loads']['combinations'].append({'id': 'K', 'name': 'char', 'type': 'characteristic',
                                       'N_Ed': 0, 'M_Ed': -50e6, 'V_Ed': 0, 'theta': 0})
    res = engine.run(p)
    assert 'sls' not in res
    assert res['checks']['sls_ok'] is None
    assert any(w['code'] == 'sls_not_available_prestress' for w in res['warnings'])
    assert any(s['stage'] == 'loaded' for s in res['prestress']['stages'])
    assert json.dumps(res, allow_nan=False)


# ------------------------------------------------------------------ #
# 6. Review av PR #89: hvert funn har sin test (tall fra reviewerens
#    uavhengige haandregning og fra kjoeringer FOER rettingen, 2026-11-12)
# ------------------------------------------------------------------ #

def tendons_at(lid, n, z, sigma_p0=1100.0, ap=93.0):
    ys = [-558.75 + i * (1117.5 / (n - 1)) for i in range(n)] if n > 1 else [0.0]
    layer = tendon_layer(sigma_p0=sigma_p0)
    layer.update({'id': lid, 'area': n * ap, 'bars': [{'y': y, 'z': z, 'dia': 12.5} for y in ys]})
    layer['prestress']['area_per_tendon'] = ap
    return layer


def slack_at(lid, n, z, dia):
    ys = [-500.0 + i * (1000.0 / (n - 1)) for i in range(n)]
    return {'id': lid, 'kind': 'bars', 'area': n * math.pi * dia ** 2 / 4,
            'bars': [{'y': y, 'z': z, 'dia': dia} for y in ys]}


def row(cid, m, n=0.0, kind='uls'):
    return {'id': cid, 'name': cid, 'type': kind, 'N_Ed': n, 'M_Ed': m, 'V_Ed': 0,
            'theta': math.pi if m > 0 else 0.0}


def fixture_with(layers, combos):
    p = load('payload-custom-hd265-prestressed.json')
    p['section']['rebar'] = layers
    p['loads']['combinations'] = combos
    p['loads']['active'] = combos[0]['id']
    return p


def run_engine(p):
    engine.reset_cache()
    return engine.run(p)


def test_B1_brittle_check_uses_the_prestressed_cracking_moment():
    """FOER: 2 tau a 93 mm2, sigma_p0 = 1300: M_Rd = -64,7 (tauet ryker), M_cr = 49,6 uten
    forspenning, `brittle_ok: True`. M_cr MED forspenning ved t_inf er 82,0 (stegtabellen)."""
    res = run_engine(fixture_with([tendons_at('T', 2, -87.5, 1300.0)],
                                  [row('U', -60e6), row('C', -70e6, kind='characteristic')]))
    lt = res['prestress']['stages'][1]
    assert lt['M_cr'] == pytest.approx(-81.974569e6, rel=1e-6)
    assert res['section_props']['M_cr'] == pytest.approx(-lt['M_cr'], rel=1e-12)
    assert res['section_props']['M_cr_basis'] == 'prestressed_long_term'
    assert res['bending']['M_Rd'] == pytest.approx(-64.672378e6, rel=1e-6)
    assert res['checks']['brittle_ok'] is False
    assert any(w['code'] == 'brittle_failure_risk' for w in res['warnings'])


def test_B1_cracking_moment_follows_the_axial_force_of_the_governing_row():
    # N = -500 kN loefter M_cr fra 174,06 til 204,42; samme tall i stegtabellens belastede
    # rad med samme N og i `section_props`, som brittle_ok leser.
    res = run_engine(fixture_with([tendon_layer()], [row('U', -100e6, -500e3),
                                                    row('C', -150e6, -500e3, 'characteristic')]))
    loaded = res['prestress']['stages'][2]
    assert loaded['M_cr'] == pytest.approx(-204.42e6, rel=1e-4)
    assert res['section_props']['M_cr'] == pytest.approx(-loaded['M_cr'], rel=1e-9)


def test_B2_passive_with_tendons_makes_long_term_and_loaded_not_available():
    """FOER: 6 Oe12 paa z = -100 + spennlaget ga sigma_c,u.k. -4,04, M_dec -122,5,
    M_cr -175,7; en aldersjustert modell gir -2,74 / ca. -103 / ca. -155 (usikker side)."""
    res = run_engine(fixture_with([tendon_layer(), slack_at('S', 6, -100.0, 12.0)],
                                  [row('U', -100e6), row('C', -150e6, kind='characteristic')]))
    st = {s['stage'] + (s.get('combo') or ''): s for s in res['prestress']['stages']}
    assert st['transfer']['available'] is True
    for key in ('long_term', 'loadedC'):
        assert st[key]['available'] is False
        assert st[key]['reason'] == 'passive_with_tendons'
        assert 'sigma_c_bottom' not in st[key] and 'M_dec' not in st[key]
    assert res['prestress']['long_term_available'] is False
    assert res['bending']['M_Rd'] == pytest.approx(-331.977600e6, rel=1e-6)   # ULS staar
    assert res['checks']['brittle_ok'] is None
    assert res['section_props']['M_cr'] is None
    assert any(w['code'] == 'prestress_long_term_not_available' for w in res['warnings'])


def test_B3_F6_age_and_strength_at_transfer_are_required_not_defaulted():
    for key in ('t0', 'fck_t0'):
        p = load('payload-custom-hd265-prestressed.json')
        p['prestress'][key] = None
        res = run_engine(p)
        assert res['ok'] is False and res['error']['code'] == 'invalid_prestress', key
        assert 'required' in res['error']['message']


def test_F1_tendon_that_does_not_reach_fpd_is_not_ductile():
    """FOER: N = -1600 ... -1700 kN, M_Ed = -100 ga `ductility_ok: True` med
    sigma_p = 1395 ... 1340 < f_pd = 1426 (slakkarmeringens eps_yd paa tverrsnittstoeyningen)."""
    for n in (-1600e3, -1700e3):
        res = run_engine(fixture_with([tendon_layer()], [row('U', -100e6, n)]))
        layer = res['bending']['layers'][0]
        assert layer['sigma'] < 1640 / 1.15
        assert res['checks']['ductility_ok'] is False
        assert res['bending']['failure_mode'] == 'over_reinforced'
    ok = run_engine(fixture_with([tendon_layer()], [row('U', -100e6)]))
    assert ok['checks']['ductility_ok'] is True


def test_F2_hogging_cracking_moment_is_for_the_top_fibre_and_stress_beyond_fck_is_flagged():
    res = run_engine(fixture_with([tendon_layer()], [row('U', 60e6),
                                                    row('C', 40e6, kind='characteristic')]))
    assert res['bending']['M_Rd'] == pytest.approx(30.949483e6, rel=1e-6)   # review F10
    loaded = res['prestress']['stages'][2]
    assert loaded['fibre'] == 'top' and loaded['direction'] == 'hogging'
    assert loaded['M_cr'] > 0                       # et overkant-tall, ikke underkantens -174
    assert res['section_props']['M_cr'] == pytest.approx(loaded['M_cr'], rel=1e-9)
    assert loaded['sigma_c_bottom'] < -45 and loaded['within_linear'] is False
    assert any(w['code'] == 'prestress_stress_beyond_linear' for w in res['warnings'])


def test_F2_tendons_on_the_wrong_face_give_a_message_that_says_why():
    """FOER: bare overkantstau + egenvekt krasjet med «no stiffness»."""
    res = run_engine(fixture_with([tendons_at('T', 4, 87.5)], [row('U', 50e6)]))
    assert res['ok'] is False and res['error']['code'] == 'invalid_prestress'
    assert 'cannot carry this stage elastically' in res['error']['message']
    assert 'no stiffness' not in res['error']['message']


def test_F3_cracking_at_transfer_one_sigma_pi_and_no_long_term():
    """FOER: 14 tau, sigma_p0 = 1300, M_t = 0: tapene brukte sigma_pi = 1213,98 (urisset
    plan), stegtabellen 1212,73 (risset), og t_inf ble regnet som urisset."""
    p = fixture_with([tendons_at('T', 14, -87.5, 1300.0)],
                     [row('U', -150e6), row('C', -150e6, kind='characteristic')])
    p['prestress']['M_transfer'] = 0.0
    p['prestress']['M_permanent'] = 0.0
    res = run_engine(p)
    t0 = res['prestress']['stages'][0]
    loss = res['prestress']['losses'][0]
    assert t0['uncracked'] is False
    assert loss['sigma_pi'] == pytest.approx(t0['tendons'][0]['sigma_p'], rel=1e-12)
    assert loss['sigma_pi'] == pytest.approx(1212.73, abs=0.01)
    assert loss['transfer_cracked'] is True
    assert res['prestress']['stages'][1]['available'] is False
    assert res['prestress']['stages'][1]['reason'] == 'cracked_at_transfer'
    assert any(w['code'] == 'prestress_cracked_at_transfer' for w in res['warnings'])


def test_F8_shear_note_when_a_prestressed_section_has_a_shear_force():
    p = load('payload-custom-hd265-prestressed.json')
    p['loads']['combinations'][0]['V_Ed'] = 100e3
    res = run_engine(p)
    assert any(w['code'] == 'prestress_shear_not_included' for w in res['warnings'])


@pytest.mark.parametrize('layers,combos,expected', [
    ([('T', 10, -87.5)], [row('U1', -100e6, -500e3)], -317.506589e6),
    ([('T', 10, -87.5)], [row('U2', -100e6, 300e3)], -256.017798e6),
    ([('B', 10, -87.5), ('T', 2, 100.0)], [row('U', -100e6)], -277.180425e6),
    ([('B', 10, -87.5), ('T', 2, 100.0)], [row('H', 50e6)], 86.780612e6),
])
def test_F10_reviewer_bending_resistances(layers, combos, expected):
    res = run_engine(fixture_with([tendons_at(*l) for l in layers], combos))
    assert res['bending']['M_Rd'] == pytest.approx(expected, rel=1e-6)


def test_F10_reviewer_rectangle_1000x200():
    """Reviewerens uavhengige haandregning: plate 1000 x 200, C45, A_p = 1000 mm2 paa
    z = -60, M_g = -20 kNm, h0 = 200, phi(t_inf, 1 d) = 2,43304 (tillegg B, RH 50, R)."""
    p = load('payload-slab-1000x200-combos.json')
    pre = load('payload-custom-hd265-prestressed.json')
    p['section']['concrete']['fck'] = 45
    ps = dict(pre['section']['rebar'][0]['prestress'], area_per_tendon=100.0)
    p['section']['rebar'] = [{'id': 'T', 'kind': 'bars', 'area': 1000.0, 'prestress': ps,
                              'bars': [{'y': -450 + i * 100, 'z': -60.0, 'dia': 12.5}
                                       for i in range(10)]}]
    p['loads'] = {'combinations': [row('U', -150e6), row('C', -60e6, kind='characteristic')],
                  'active': 'U'}
    p['sls'] = pre['sls']
    p['prestress'] = dict(pre['prestress'], M_transfer=-20e6, M_permanent=-20e6, h0=200.0,
                          phi=2.433040638339857)
    p['analysis'] = 'bending'
    res = run_engine(p)
    t0, lt = res['prestress']['stages'][0], res['prestress']['stages'][1]
    assert t0['sigma_c_top'] == pytest.approx(1.1843, abs=5e-5)
    assert t0['sigma_c_bottom'] == pytest.approx(-11.6452, abs=5e-5)
    assert t0['tendons'][0]['sigma_p'] == pytest.approx(1046.08, abs=5e-3)
    assert res['prestress']['losses'][0]['d_sigma_csr'] == pytest.approx(209.24, abs=5e-3)
    assert lt['M_dec'] == pytest.approx(-80.70e6, abs=5e3)
    assert lt['M_cr'] == pytest.approx(-107.13e6, abs=5e3)
    assert res['bending']['M_Rd'] == pytest.approx(-196.01e6, abs=5e3)
