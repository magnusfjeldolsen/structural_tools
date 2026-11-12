"""test_polygon_review.py -- funnene fra den uavhengige gjennomgangen av PR #87.

Hvert punkt har sin test, skrevet FØR rettingen. Tallene for opp-ned T er regnet av
reviewerens egen stripeintegrator (uavhengig av motoren og av `csc_polygon`), ikke av
koden de tester.
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


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


@pytest.fixture(autouse=True)
def _fresh_section():
    engine.reset_cache()
    yield
    engine.reset_cache()


def centre(outer, holes=()):
    ys = [p[0] for p in outer]
    zs = [p[1] for p in outer]
    cy = (min(ys) + max(ys)) / 2
    cz = (min(zs) + max(zs)) / 2
    sh = lambda r: [[p[0] - cy, p[1] - cz] for p in r]  # noqa: E731
    return sh(outer), [sh(h) for h in holes], cy, cz


def poly_payload(outer, holes, bars, combos, bw=None):
    p = load('payload-beam-300x600.json')
    s = p['section']
    s.pop('b')
    s.pop('h')
    s.update(shape='polygon', outer=outer, holes=holes)
    if bw is not None:
        s['bw'] = bw
    s['shear'] = {'strut_angle_deg': 45, 'z_factor': 0.9, 'stirrups': []}
    s['rebar'] = bars
    p['loads'] = {'combinations': combos, 'active': combos[0]['id']}
    return p


def bars_layer(lid, pts, dia):
    return {'id': lid, 'kind': 'bars', 'area': len(pts) * math.pi * dia ** 2 / 4,
            'bars': [{'y': y, 'z': z, 'dia': dia} for y, z in pts]}


def uls(i, n, m, theta, v=0.0):
    return {'id': f'C{i}', 'name': '', 'type': 'uls', 'N_Ed': n, 'M_Ed': m, 'theta': theta,
            'V_Ed': v}


# ------------------------------------------------------------------ #
# 1. b_w over omskrevet bredde avvises
# ------------------------------------------------------------------ #

@pytest.mark.parametrize('bw', [1200.001, 5000.0])
def test_bw_wider_than_the_bounding_box_is_rejected(bw):
    """Før: b_w = 1200 på hulldekket ga V_Rd,c 147,7 kN og shear_ok TRUE (riktig er
    220 → 45,9 kN, η 2,18); b_w = 5000 ga 592 kN. Ingen advarsel."""
    p = load('payload-custom-hd265.json')
    p['section']['bw'] = bw
    res = engine.run(p)
    assert res['ok'] is False
    assert res['error']['code'] == 'invalid_bw'
    assert '1200' in res['error']['message']


def test_bw_equal_to_the_bounding_box_is_accepted():
    p = load('payload-custom-hd265.json')
    p['section']['bw'] = 1200.0
    assert engine.run(p)['ok'] is True


@pytest.mark.parametrize('bw', ['abc', 'nan', -5, 0, float('inf')])
def test_unreadable_bw_is_a_message_not_a_stacktrace(bw):
    p = load('payload-custom-hd265.json')
    p['section']['bw'] = bw
    res = engine.run(p)
    assert res['ok'] is False
    assert res['error']['code'] == 'invalid_bw'
    assert 'Traceback' not in res['error']['detail']


# ------------------------------------------------------------------ #
# 2. M_z ved brudd rapporteres, med advarsel
# ------------------------------------------------------------------ #

L_OUTER = [[y - 300, z - 300] for y, z in
           [[0, 0], [300, 0], [300, 450], [600, 450], [600, 600], [0, 600]]]


def l_payload():
    return poly_payload(L_OUTER, [],
                        [bars_layer('B', [(-250 + y, -250) for y in (0, 100, 200)], 25)],
                        [uls(1, 0.0, -300e6, 0.0)], bw=300)


def test_unsymmetric_section_reports_m_z_and_warns_about_lateral_restraint():
    """Reviewer: L 600×600, 3Ø25, N = 0 gir M_Rd −343,4 kNm med M_z = +98,7 kNm i samme
    tøyningsplan. Fri bøyning (M_z = 0) gir −321,6: +6,8 % på usikker side."""
    res = engine.run(l_payload())
    row = res['bending']['combinations'][0]
    assert row['M_Rd'] == pytest.approx(-343.4e6, rel=2e-3)
    assert row['M_z'] == pytest.approx(98.7e6, rel=2e-3)
    w = [w for w in res['warnings'] if w['code'] == 'lateral_restraint_assumed']
    assert len(w) == 1
    assert '98.7' in w[0]['message'] and '343.4' in w[0]['message']


def test_symmetric_section_has_negligible_m_z_and_no_warning():
    p = load('payload-custom-hd265.json')
    res = engine.run(p)
    row = res['bending']['combinations'][0]
    assert abs(row['M_z']) < 1e-6 * abs(row['M_Rd'])
    assert not any(w['code'] == 'lateral_restraint_assumed' for w in res['warnings'])


def test_rectangle_rows_have_no_m_z_key():
    """Rektangelveien er urørt tegn for tegn (fixturene)."""
    res = engine.run(load('payload-beam-300x600.json'))
    assert 'M_z' not in res['bending']['combinations'][0]


# ------------------------------------------------------------------ #
# 4 og 7. Samme gyldighetssvar i JS og Python
# ------------------------------------------------------------------ #

@pytest.mark.parametrize('case', load('polygon-validity-cases.json')['cases'],
                         ids=lambda c: c['name'])
def test_shared_validity_cases(case):
    """`polygon.test.mjs` kjører SAMME fil gjennom `polygonIssues`."""
    sec = {'outer': case['outer'], 'holes': case['holes']}
    if case['valid']:
        validated_polygon(sec)
    else:
        with pytest.raises(PolygonError):
            validated_polygon(sec)


def test_repeated_corner_runs_and_equals_the_plain_rectangle():
    base = load('payload-beam-300x600.json')
    ref = engine.run(base)['bending']['M_Rd']
    p = copy.deepcopy(base)
    s = p['section']
    s.pop('b')
    s.pop('h')
    s.update(shape='polygon', holes=[],
             outer=[[-150, -300], [150, -300], [150, -300], [150, 300], [-150, 300]])
    engine.reset_cache()
    assert engine.run(p)['bending']['M_Rd'] == ref


# ------------------------------------------------------------------ #
# 10. JS og Python til 1e-9, og uavhengige tall for opp-ned T
# ------------------------------------------------------------------ #

def test_props_crosscheck_fixture_is_still_what_python_computes():
    """`polygon.test.mjs` sammenlikner `polygonProps` med de samme tallene til 1e-9."""
    for case in load('polygon-props-crosscheck.json')['cases']:
        p = polygon_props([tuple(x) for x in case['outer']],
                          [[tuple(x) for x in h] for h in case['holes']])
        for key in ('area', 'y_c', 'z_c', 'I_y'):
            assert p[key] == pytest.approx(case['expected'][key], rel=1e-12, abs=1e-9), \
                (case['name'], key)


T_RAW = [[-400, 600], [400, 600], [400, 450], [150, 450], [150, 0], [-150, 0],
         [-150, 450], [-400, 450]]


def inverted_t_payload(combos):
    it = [[p[0], 600 - p[1]] for p in T_RAW][::-1]
    o, _h, _cy, cz = centre(it)
    top = bars_layer('T', [(-90, 550 - cz), (0, 550 - cz), (90, 550 - cz)], 25)
    bot = bars_layer('B', [(y, 40 - cz) for y in (-330, -200, -60, 60, 200, 330)], 12)
    p = poly_payload(o, [], [top, bot], combos, bw=300)
    # Integratoren regner elastisk–ideelt plastisk stål; samme lov her.
    p['section']['steel']['law'] = 'elasticperfectlyplastic'
    return p


@pytest.mark.parametrize('n,m,theta,expected', [
    (0.0, -300e6, 0.0, -157.638e6),
    (0.0, 100e6, math.pi, 338.949e6),       # støttemoment på polygon
    (-1500e3, -300e6, 0.0, -568.272e6),     # aksialkraft: momentpunkt = tyngdepunkt
])
def test_inverted_t_against_an_independent_strip_integrator(n, m, theta, expected):
    res = engine.run(inverted_t_payload([uls(1, n, m, theta)]))
    assert res['ok'], res.get('error')
    assert res['bending']['combinations'][0]['M_Rd'] == pytest.approx(expected, rel=1e-5)
