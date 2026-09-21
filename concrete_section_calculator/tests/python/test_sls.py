"""test_sls.py -- motorens SLS-kapittel (EC2 7.2/7.3.4) mot akseptkriteriene i
global-devspecs/concrete_section_calculator-sls.md §9 (AC1-AC14).

HVORFOR DENNE FILA BYGGER SINE EGNE PAYLOADER OG IKKE LESER FIXTURENE
Fixturene i tests/fixtures/*.json regenereres BARE av koordinatoren (spec §0.6) --
ingen implementeringsagent roerer dem. AC11/AC12/AC13 krever geometri (en `bars`-liste,
et `kind: 'strip'`-lag paa en 300 mm bred bjelke, to lag i strekk paa hver sin kant) som
IKKE finnes i noen committet fixtur. Referansebjelken og platefixturen sin GEOMETRI
(b, h, z, A_s) er likevel hentet fra de committede fixturene, saa AC1/AC3/AC4/AC6/AC6b
bruker eksakt de samme tallene som `payload-beam-300x600.json`/`payload-slab-1000x200.json`
allerede baerer -- de er bare paalastet SLS-kombinasjoner fixturene ikke har.

HVORFOR TALLENE ER SKREVET INN HER OG IKKE BARE SAMMENLIGNET MOT HVERANDRE
Spec §9 sine tall er reprodusert UAVHENGIG (en gang i denne sesjonen, i CPython, mot
`structuralcodes` 0.7.2, se sesjonens `sls_prototype.py`/`sls_prototype2.py` utenfor
repoet) FOeR motorkoden ble skrevet. De er derfor akseptkriterier, ikke en avskrift av
hva motoren allerede svarer.
"""

from __future__ import annotations

import copy
import math
import pathlib
import sys

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(MODULE_DIR / 'python'))

import engine  # noqa: E402
from structuralcodes.codes import ec2_2004  # noqa: E402

REL_TOL = 1e-6


def close(a, b, rel=REL_TOL):
    if a is None or b is None:
        return a is b or a == b
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-9)


@pytest.fixture(autouse=True)
def _fresh_section():
    engine.reset_cache()
    yield
    engine.reset_cache()


# ------------------------------------------------------------------ #
# Payload-byggere -- geometrien er referansebjelken/platefixturen (spec §9)
# ------------------------------------------------------------------ #

_CONCRETE = {'fck': 30.0, 'gamma_c': 1.5, 'alpha_cc': 1.0, 'law': 'parabolarectangle'}
_STEEL = {'fyk': 500.0, 'Es': 200000.0, 'ftk': 540.0, 'k': 1.08, 'epsuk': 0.075,
          'gamma_eps': 0.9, 'gamma_s': 1.15, 'law': 'elasticplastic'}


def bars_layer(layer_id, z, dia, ys):
    area = len(ys) * math.pi * dia * dia / 4.0
    return {
        'id': layer_id, 'kind': 'bars', 'area': area,
        'bars': [{'y': y, 'z': z, 'dia': dia} for y in ys],
    }


def strip_layer(layer_id, z, dia, area):
    return {
        'id': layer_id, 'kind': 'strip', 'area': area,
        'strip': {'width': area / dia, 'height': dia, 'z': z},
    }


def sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', b=300.0, h=600.0,
                 section_type='beam', phi_ef=0.0, exposure_class=None, w_max=None,
                 w_max_source=None, w_max_reason='no_exposure_class',
                 sigma_c_char_factor=0.6, sigma_c_qp_factor=0.45,
                 sigma_s_char_factor=0.8, sigma_c_char_required=None):
    return {
        'schema': 1,
        'analysis': 'bending',
        'section': {
            'type': section_type, 'b': b, 'h': h,
            'concrete': dict(_CONCRETE), 'steel': dict(_STEEL), 'rebar': rebar,
        },
        'loads': {
            'combinations': [
                {'id': 'S1', 'name': 'SLS row', 'type': combo_type,
                 'N_Ed': n_ed, 'M_Ed': m_ed},
            ],
            'active': 'S1',
        },
        'sls': {
            'phi_ef': phi_ef, 'exposure_class': exposure_class,
            'w_max': w_max, 'w_max_source': w_max_source, 'w_max_reason': w_max_reason,
            'sigma_c_char_factor': sigma_c_char_factor,
            'sigma_c_qp_factor': sigma_c_qp_factor,
            'sigma_s_char_factor': sigma_s_char_factor,
            'sigma_c_char_required': sigma_c_char_required,
        },
        'options': {
            'theta': 0.0, 'integrator': 'marin', 'subtract_bar_area': False,
            'complete_domain': True, 'mc_pre_yield': 10, 'mc_post_yield': 10,
            'mc_chi': None,
        },
    }


BEAM_REBAR = [bars_layer('L1', -250.0, 20.0, [-100.0, 0.0, 100.0])]
SLAB4_REBAR = [strip_layer('L1', -69.0, 12.0, 1000.8613763648898)]
SLAB5_REBAR = [strip_layer('L1', -59.0, 12.0, 565.486678)]
SLAB7_REBAR = [strip_layer('L1', -57.0, 16.0, 670.206433)]

# Konstantene i spec §9's innledning -- laast som en egen test under.
FCTM_C30 = 2.896468153817
ECM_C30 = 32836.568031331
ALPHA_E_C30 = 6.090770503457
ECEFF_PHI2_C30 = 10945.522677
NSEC_PHI2_C30 = 18.272312


def test_c30_material_constants_match_spec_intro():
    """Spec §9's egen tabell -- hvis DISSE fire driver, driver alle AC-ene."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, phi_ef=2.0)
    result = engine.run(payload)
    assert close(result['materials']['fctm'], FCTM_C30, rel=1e-9)
    assert close(result['materials']['Ecm'], ECM_C30, rel=1e-9)
    row = result['sls']['rows'][0]
    assert close(row['n_sec'], NSEC_PHI2_C30, rel=1e-6)


# ------------------------------------------------------------------ #
# AC1 -- referansebjelken, tilnaermet permanent, phi_ef = 0
# ------------------------------------------------------------------ #

def test_ac1_beam_quasi_permanent_no_creep():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0)
    result = engine.run(payload)
    assert 'sls' in result
    row = result['sls']['rows'][0]

    assert close(row['sigma_ct_uncracked'], 5.085064, rel=1e-6)
    assert row['cracked'] is True
    st = row['state']
    assert close(st['x'], 127.201637, rel=1e-6)
    assert close(st['z_na'], 172.798363, rel=1e-6)
    assert close(st['eps_a'], 4.271536e-04, rel=1e-5)
    assert close(st['chi_y'], -2.471977e-06, rel=1e-5)
    assert close(st['sigma_c'], -10.325115, rel=1e-6)
    assert close(st['sigma_s_max'], 209.029569, rel=1e-6)

    # sigma_c_initial SKAL staa, med sin egen etikett, selv om phi_ef = 0 gjoer den
    # identisk med state.sigma_c (spec §1.4).
    assert close(row['sigma_c_initial'], -10.325115, rel=1e-6)

    crack = row['crack']
    assert crack is not None
    assert row['crack_reason'] is None
    assert close(crack['d'], 550.0, rel=1e-9)
    assert crack['h_c_eff_governing'] == '2.5(h-d)'
    assert close(crack['h_c_eff'], 125.0, rel=1e-6)
    assert close(crack['h_c_eff_candidates']['(h-x)/3'], 157.599454, rel=1e-6)
    assert close(crack['A_c_eff'], 37500.0, rel=1e-6)
    assert close(crack['A_s_eff'], 942.477796, rel=1e-6)
    assert close(crack['rho_p_eff'], 0.025132741, rel=1e-6)
    assert close(crack['k_t'], 0.4, rel=1e-9)
    assert close(crack['eps_equation'], 7.793708e-04, rel=1e-5)
    assert close(crack['eps_floor'], 6.270887e-04, rel=1e-5)
    assert crack['eps_governing'] == 'equation'
    assert close(crack['eps_r'], 0.0, abs_tol := 1e-9) or crack['eps_r'] == 0.0
    assert close(crack['k2'], 0.5, rel=1e-9)
    assert close(crack['c'], 40.0, rel=1e-9)
    assert close(crack['phi_eq'], 20.0, rel=1e-9)
    assert close(crack['bar_spacing'], 100.0, rel=1e-9)
    assert close(crack['spacing_threshold'], 250.0, rel=1e-6)
    assert crack['sr_max_branch'] == 'close'
    assert close(crack['sr_max_close'], 271.281702, rel=1e-6)
    assert close(crack['sr_max_far'], 614.637872, rel=1e-6)
    assert close(crack['w_k'], 0.211429, rel=1e-5)

    # Raden baerer INGEN M_cr -- SLS kaller aldri _cracking_moment (spec §1.1/§12.10).
    assert 'M_cr' not in row


def test_ac1_no_exposure_class_gives_null_not_not_applicable():
    """Spec §11: uten klasse er w_max None med grunnen 'no_exposure_class', og
    crack.ok/crack_width_ok blir null -- IKKE 'ikke aktuelt'."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class=None, w_max=None,
                           w_max_source=None, w_max_reason='no_exposure_class')
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['crack']['w_max'] is None
    assert row['crack']['utilisation'] is None
    assert row['crack']['ok'] is None
    assert row['crack']['ok_reason'] == 'no_exposure_class'
    assert result['sls']['checks']['crack_width_ok'] is None
    assert 'crack_width_ok' not in result['sls']['not_applicable']


# ------------------------------------------------------------------ #
# AC2 -- samme rad, phi_ef = 2 -- laaser de TO fellene som skjuler seg selv
# ------------------------------------------------------------------ #

def test_ac2_creep_moves_x_but_not_alpha_e_and_qp_check_reads_initial_stress():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=2.0, exposure_class='XC3', w_max=0.30,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    result = engine.run(payload)
    row = result['sls']['rows'][0]

    assert close(row['Ec_used'], ECEFF_PHI2_C30, rel=1e-6)
    assert close(row['n_sec'], NSEC_PHI2_C30, rel=1e-6)
    st = row['state']
    assert close(st['x'], 200.355056, rel=1e-6)
    assert close(st['sigma_c'], -6.886016, rel=1e-6)
    assert close(st['sigma_s_max'], 219.577827, rel=1e-6)

    # h_c,eff bytter GREN naar x flytter seg -- (h-x)/3 blir da 133.21, men 2.5(h-d) = 125
    # er FORTSATT minst, saa gren-etiketten holder seg (spec AC2).
    assert close(row['crack']['h_c_eff_candidates']['(h-x)/3'], 133.214981, rel=1e-6)
    assert row['crack']['h_c_eff_governing'] == '2.5(h-d)'
    assert close(row['crack']['eps_sm_eps_cm'], 8.321121e-04, rel=1e-5)
    assert close(row['crack']['sr_max'], 271.281702, rel=1e-6)
    assert close(row['crack']['w_k'], 0.225737, rel=1e-5)

    # FELLE 1: alpha_e (lign. 7.9) er E_s/E_cm, UENDRET av kryp.
    assert close(row['crack']['alpha_e'], ALPHA_E_C30, rel=1e-6)
    assert close(result['sls']['alpha_e'], ALPHA_E_C30, rel=1e-6)

    # FELLE 2: sigma_c_initial er AC1s tall, og 7.2(3) proeves paa DEN, ikke paa den
    # kroepne -524 MPa-verdien. util = 0.764823, IKKE 0.510075.
    assert close(row['sigma_c_initial'], -10.325115, rel=1e-6)
    assert row['stress']['sigma_c_checked'] == 'initial'
    assert close(row['stress']['sigma_c'], -10.325115, rel=1e-6)
    assert close(row['stress']['sigma_c_util'], 0.764823, rel=1e-5)
    # Den kroepne utnyttelsen (0.510075) skal IKKE vaere det som ble proevd.
    assert not close(row['stress']['sigma_c_util'], 0.510075, rel=1e-3)
    assert row['stress']['sigma_c_ok'] is True  # 0.765 < 1.0


# ------------------------------------------------------------------ #
# AC3 -- referansebjelken, karakteristisk, M_Ed = -120e6 -- + de tre eksponeringssvarene
# ------------------------------------------------------------------ #

def test_ac3_characteristic_row_has_no_crack_and_no_sigma_c_initial():
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic')
    result = engine.run(payload)
    row = result['sls']['rows'][0]

    assert close(row['sigma_ct_uncracked'], 6.102077, rel=1e-6)
    st = row['state']
    assert close(st['x'], 127.201637, rel=1e-6)
    assert close(st['sigma_c'], -12.390138, rel=1e-6)
    assert close(st['sigma_s_max'], 250.835483, rel=1e-6)

    assert close(row['stress']['sigma_c_limit'], 18.0, rel=1e-9)
    assert close(row['stress']['sigma_c_util'], 0.688341, rel=1e-5)
    assert row['stress']['sigma_c_checked'] == 'state'
    assert close(row['stress']['sigma_s_limit'], 400.0, rel=1e-9)
    assert close(row['stress']['sigma_s_util'], 0.627089, rel=1e-5)

    assert row['sigma_c_initial'] is None
    assert row['sigma_c_initial_reason'] is None
    assert row['crack'] is None
    assert row['crack_reason'] == 'not_quasi_permanent'


@pytest.mark.parametrize('exposure_class,required,expect_key,expect_value', [
    ('XD1', True, 'checks', True),
    ('XC3', False, 'not_applicable', None),
    (None, None, 'checks', None),
])
def test_ac3_exposure_is_three_valued(exposure_class, required, expect_key, expect_value):
    """Spec §2.1: sigma_c_char_required har TRE utfall, ikke to."""
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class=exposure_class, sigma_c_char_required=required)
    result = engine.run(payload)
    checks = result['sls']['checks']
    not_applicable = result['sls']['not_applicable']
    if expect_key == 'checks':
        assert 'sigma_c_char_ok' in checks
        assert checks['sigma_c_char_ok'] is expect_value
        assert 'sigma_c_char_ok' not in not_applicable
    else:
        assert 'sigma_c_char_ok' not in checks
        assert 'sigma_c_char_ok' in not_applicable
    assert result['sls']['limits']['sigma_c_char_required'] is required


# ------------------------------------------------------------------ #
# AC4 -- platefixturen, laaser stripe-inversjonen og (h-x)/3-grenen
# ------------------------------------------------------------------ #

def test_ac4_slab_strip_and_h_minus_x_over_3_branch():
    payload = sls_payload(SLAB4_REBAR, 0.0, -30e6, combo_type='quasi_permanent',
                           b=1000.0, h=200.0, section_type='slab', phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]

    assert close(row['sigma_ct_uncracked'], 4.229476, rel=1e-6)
    st = row['state']
    assert close(st['x'], 39.703712, rel=1e-6)
    assert close(st['sigma_c'], -9.701727, rel=1e-6)
    assert close(st['sigma_s_max'], 192.431537, rel=1e-6)

    crack = row['crack']
    assert close(crack['d'], 169.0, rel=1e-6)
    assert crack['h_c_eff_governing'] == '(h-x)/3'
    assert close(crack['h_c_eff'], 53.432096, rel=1e-6)
    assert close(crack['A_c_eff'], 53432.096074, rel=1e-4)
    assert close(crack['rho_p_eff'], 0.018731464, rel=1e-6)
    assert close(crack['eps_equation'], 6.176119e-04, rel=1e-5)
    assert crack['eps_governing'] == 'equation'
    assert close(crack['c'], 25.0, rel=1e-9)
    assert close(crack['spacing_threshold'], 155.0, rel=1e-6)
    assert close(crack['bar_spacing'], 113.0, rel=1e-4)
    assert crack['sr_max_branch'] == 'close'
    assert close(crack['sr_max_close'], 193.907666, rel=1e-6)
    assert close(crack['sr_max_far'], 208.385175, rel=1e-6)
    assert close(crack['w_k'], 0.119760, rel=1e-5)


# ------------------------------------------------------------------ #
# AC5 -- gulvet i lign. 7.9 styrer, og naer > fjern (NB, ikke "konservativ")
# ------------------------------------------------------------------ #

def test_ac5_floor_governs_eq_7_9_and_close_exceeds_far():
    payload = sls_payload(SLAB5_REBAR, 0.0, -22e6, combo_type='quasi_permanent',
                           b=1000.0, h=200.0, section_type='slab', phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    st = row['state']
    assert close(row['sigma_ct_uncracked'], 3.210281, rel=1e-6)
    assert close(st['x'], 29.829377, rel=1e-6)
    assert close(st['sigma_s_max'], 261.004679, rel=1e-6)

    crack = row['crack']
    assert crack['h_c_eff_governing'] == '(h-x)/3'
    assert close(crack['rho_p_eff'], 0.009969171, rel=1e-6)
    assert close(crack['eps_floor'], 7.830140e-04, rel=1e-5)
    assert crack['eps_governing'] == 'floor'
    assert close(crack['spacing_threshold'], 205.0, rel=1e-6)
    assert crack['sr_max_branch'] == 'close'
    assert close(crack['sr_max_close'], 323.630857, rel=1e-6)
    assert close(crack['sr_max_far'], 221.221810, rel=1e-6)
    # NB: naer > fjern her -- IKKE "konservativ", spec §3.3/§13.
    assert crack['sr_max_close'] > crack['sr_max_far']
    assert close(crack['w_k'], 0.253408, rel=1e-5)


# ------------------------------------------------------------------ #
# AC6 / AC6b -- urisset: crack er null, INGEN M_cr
# ------------------------------------------------------------------ #

def test_ac6_uncracked_slab_gives_null_crack_not_zero():
    payload = sls_payload(SLAB4_REBAR, 0.0, -15e6, combo_type='quasi_permanent',
                           b=1000.0, h=200.0, section_type='slab', phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]

    assert close(row['sigma_ct_uncracked'], 2.114738, rel=1e-6)
    assert row['cracked'] is False
    assert row['crack'] is None
    assert row['crack_reason'] == 'uncracked'
    st = row['state']
    assert close(st['eps_a'], -1.341775e-06, rel=1e-4)
    assert close(st['chi_y'], -6.574369e-07, rel=1e-4)
    assert close(st['sigma_c'], -2.202857, rel=1e-5)
    assert close(st['sigma_s_max'], 8.804275, rel=1e-5)
    assert 'M_cr' not in row


def test_ac6b_band_where_transformed_and_gross_convention_disagree():
    """Spec §1.1: |M| = 1.05*M_cr,brutto -- brutto ville gitt 'risset', vaar konvensjon
    (urisset TRANSFORMERT snitt, E_cm) sier 'urisset'. Rettet i runde 10."""
    payload = sls_payload(BEAM_REBAR, 0.0, -54743248.11, combo_type='quasi_permanent',
                           phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert close(row['sigma_ct_uncracked'], 2.783729, rel=1e-6)
    assert row['cracked'] is False
    assert row['crack'] is None
    assert row['crack_reason'] == 'uncracked'


# ------------------------------------------------------------------ #
# AC7 -- fjerngrenen OG gulvet samtidig
# ------------------------------------------------------------------ #

def test_ac7_far_branch_and_floor_together():
    payload = sls_payload(SLAB7_REBAR, 0.0, -25e6, combo_type='quasi_permanent',
                           b=1000.0, h=200.0, section_type='slab', phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    st = row['state']
    assert close(row['sigma_ct_uncracked'], 3.636351, rel=1e-6)
    assert close(st['x'], 31.951722, rel=1e-6)
    assert close(st['sigma_s_max'], 254.882720, rel=1e-6)

    crack = row['crack']
    assert crack['h_c_eff_governing'] == '(h-x)/3'
    assert close(crack['rho_p_eff'], 0.011964534, rel=1e-6)
    assert close(crack['eps_floor'], 7.646482e-04, rel=1e-5)
    assert crack['eps_governing'] == 'floor'
    assert close(crack['spacing_threshold'], 215.0, rel=1e-6)
    assert crack['sr_max_branch'] == 'far'
    assert close(crack['sr_max_close'], 346.338570, rel=1e-5)
    assert close(crack['sr_max_far'], 218.462761, rel=1e-6)
    assert close(crack['w_k'], 0.167047, rel=1e-5)


# ------------------------------------------------------------------ #
# AC8 -- ingen gyldig tilstand: to ULIKE grunner, en avsloerer den gamle feilkoden
# ------------------------------------------------------------------ #

def test_ac8a_compression_zone_exists_but_no_cracked_equilibrium():
    """Referansebjelken staar IKKE i rent strekk (sigma_c,OK = -0.72 MPa, en trykksone
    finnes) -- grunnen skal derfor vaere 'no_equilibrium_cracked', IKKE noe som paastaar
    rent strekk. Dette er raden som avsloerte at 'no_compression_zone' var feil."""
    payload = sls_payload(BEAM_REBAR, 800e3, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['cracked'] is True
    assert row['state'] is None
    assert row['state_reason'] == 'no_equilibrium_cracked'
    assert row['state_reason'] != 'fully_in_tension'
    assert row['stress'] is None
    assert row['sigma_c_initial'] is None
    assert row['crack'] is None
    assert row['crack_reason'] == 'no_equilibrium_cracked'


def test_ac8b_yielded_layer_is_guarded_not_silently_reported():
    """Stoettemoment uten toppjern: loeseren FINNER en matematisk rot med
    sigma_s = 2622 MPa -- vakten skal fange dette FOeR det naar JSON-grensa."""
    payload = sls_payload(BEAM_REBAR, 0.0, 100e6, combo_type='quasi_permanent',
                           phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['cracked'] is True
    assert row['state'] is None
    assert row['state_reason'] == 'stresses_outside_elastic_range'
    assert row['stress'] is None
    assert row['crack'] is None
    assert row['crack_reason'] == 'stresses_outside_elastic_range'


# ------------------------------------------------------------------ #
# AC9 -- regresjon: uten payload['sls'], eller uten en kvalifiserende rad, ingen 'sls'
# ------------------------------------------------------------------ #

def test_ac9_no_sls_key_without_sls_payload():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent')
    del payload['sls']
    result = engine.run(payload)
    assert 'sls' not in result
    # ULS-kontrollene skal vaere upaavirket -- ren regresjon.
    assert 'checks' in result and 'sls' not in result['checks']


def test_ac9_no_sls_key_without_a_qualifying_combo():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='uls')
    result = engine.run(payload)
    assert 'sls' not in result


def test_ac9_old_loads_shape_is_unaffected():
    """Den GAMLE `{"N_Ed":..., "M_Ed":...}`-formen har ingen `sls`-noekkel og ingen
    kombinasjonstype -- skal fortsatt kjoere helt uendret."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent')
    del payload['sls']
    payload['loads'] = {'N_Ed': 0.0, 'M_Ed': 0.0}
    result = engine.run(payload)
    assert result['ok'] is True
    assert 'sls' not in result


# ------------------------------------------------------------------ #
# AC10 -- treverdighet, fire underpunkter
# ------------------------------------------------------------------ #

def test_ac10_characteristic_only_with_class_xc3():
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class='XC3', sigma_c_char_required=False)
    result = engine.run(payload)
    sls = result['sls']
    assert set(sls['checks']) == {'sigma_s_char_ok'}
    assert 'sigma_c_char_ok' in sls['not_applicable']
    assert 'crack_width_ok' in sls['not_applicable']
    assert sls['all_ok'] in (True, False)


def test_ac10_characteristic_only_no_exposure_class():
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class=None, sigma_c_char_required=None)
    result = engine.run(payload)
    sls = result['sls']
    assert sls['checks']['sigma_c_char_ok'] is None
    assert 'sigma_c_char_ok' not in sls['not_applicable']
    assert sls['all_ok'] is None


def test_ac10_quasi_permanent_without_exposure_class():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class=None, w_max=None,
                           w_max_reason='no_exposure_class')
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['crack'] is not None
    assert close(row['crack']['w_k'], 0.211429, rel=1e-5)
    assert row['crack']['w_max'] is None
    assert row['crack']['utilisation'] is None
    assert row['crack']['ok'] is None
    assert row['crack']['ok_reason'] == 'no_exposure_class'
    assert result['sls']['checks']['crack_width_ok'] is None
    assert result['sls']['all_ok'] is None


def test_ac10_all_quasi_permanent_rows_uncracked_is_not_applicable_not_null():
    payload = sls_payload(SLAB4_REBAR, 0.0, -15e6, combo_type='quasi_permanent',
                           b=1000.0, h=200.0, section_type='slab', phi_ef=0.0,
                           exposure_class='XC3', w_max=0.30, w_max_source='class',
                           w_max_reason=None)
    result = engine.run(payload)
    sls = result['sls']
    assert sls['rows'][0]['cracked'] is False
    assert 'crack_width_ok' not in sls['checks']
    assert 'crack_width_ok' in sls['not_applicable']


# ------------------------------------------------------------------ #
# AC11 -- stripe-inversjonen, PAA EN BJELKE (den eneste testen som kan se feilen)
# ------------------------------------------------------------------ #

def test_ac11_strip_spacing_inversion_uses_1000_not_b():
    """spec §3.4/§12.11: layerArea for et 'spacing'-lag er ALLTID per meter
    (rebar.js:87, hardkodet 1000) -- inversjonen her MAA bruke samme konstant.
    En bjelke (b = 300) er den eneste geometrien som kan skille de to formlene:
    platefixturen gir 113.0 med BEGGE (fordi b = 1000 der ogsaa)."""
    area_200 = (1000.0 / 200.0) * math.pi * 12.0 ** 2 / 4.0
    layer = strip_layer('L1', -250.0, 12.0, area_200)
    s = engine._sls_layer_spacing(layer)
    assert close(s, 200.0, rel=1e-6)
    # Den GALE b-formelen (feilen spec §3.4 navngir) ville gitt 60.0 paa en 300 mm bjelke.
    wrong = 300.0 * math.pi * 12.0 ** 2 / (4.0 * area_200)
    assert close(wrong, 60.0, rel=1e-6)
    assert not close(s, wrong, rel=1e-3)


def test_ac11_branch_choice_differs_between_the_two_formulas():
    """Ø16 c/c 300 paa samme bjelke: riktig s = 300 (far, terskel 215) mot
    gal s = 90 (close) -- de to formlene velger HVER SIN gren."""
    area_300 = (1000.0 / 300.0) * math.pi * 16.0 ** 2 / 4.0
    layer = strip_layer('L1', -250.0, 16.0, area_300)
    s = engine._sls_layer_spacing(layer)
    assert close(s, 300.0, rel=1e-6)
    wrong = 300.0 * math.pi * 16.0 ** 2 / (4.0 * area_300)
    assert close(wrong, 90.0, rel=1e-6)
    threshold = 215.0
    assert s > threshold and wrong < threshold


def test_ac11_plate_fixture_geometry_cannot_see_the_bug():
    """Platefixturen (b = 1000) gir 113.0 med BEGGE formlene -- akkurat DERFOR ligger
    AC11 paa en bjelke og ikke paa plata (spec AC4/AC11)."""
    layer = SLAB4_REBAR[0]
    right = 1000.0 * math.pi * 12.0 ** 2 / (4.0 * layer['area'])
    wrong = 1000.0 * math.pi * 12.0 ** 2 / (4.0 * layer['area'])  # b == 1000 her ogsaa
    assert close(right, wrong, rel=1e-9)
    assert close(engine._sls_layer_spacing(layer), 113.0, rel=1e-3)


# ------------------------------------------------------------------ #
# AC12 -- ETT jern i laget: ingen senteravstand, ingen paafunnet gren
# ------------------------------------------------------------------ #

def test_ac12_single_bar_layer_has_no_spacing_but_state_is_fine():
    payload = sls_payload(
        [bars_layer('L1', -250.0, 20.0, [0.0])], 0.0, -60e6,
        combo_type='quasi_permanent', phi_ef=0.0,
    )
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert close(row['sigma_ct_uncracked'], 3.233262, rel=1e-6)
    st = row['state']
    assert st is not None
    assert close(st['x'], 77.626200, rel=1e-6)
    assert close(st['sigma_c'], -9.831440, rel=1e-6)
    assert close(st['sigma_s_max'], 364.390322, rel=1e-6)
    # Tilstanden er i orden -- BARE rissvidden er ubesvart.
    assert row['crack'] is None
    assert row['crack_reason'] == 'no_bar_spacing'


# ------------------------------------------------------------------ #
# AC13 -- hele snittet i strekk: fully_in_tension, IKKE no_equilibrium_cracked
# ------------------------------------------------------------------ #

TIE_REBAR = [
    bars_layer('L1', -250.0, 20.0, [-100.0, 0.0, 100.0]),
    bars_layer('L2', 250.0, 20.0, [-100.0, 0.0, 100.0]),
]


def test_ac13_fully_in_tension_beyond_yield_is_guarded_not_solved():
    """N = 1000 kN paa 6O20 (1885 mm2) gir sigma_s = 530 MPa, over f_yk = 500.

    OMSKREVET i runde 11. Foer svarte motoren `fully_in_tension` her -- den gav opp
    fordi trykksonen ikke fantes. Naa loeses strekktilfellet (se
    `_sls_tension_only_eval`), og da er det FLYTVAKTEN som slaar inn, slik den gjoer
    for ethvert annet snitt der den lineaere modellen ikke lenger gjelder. Den gamle
    grunnkoden svelget to helt ulike ting: «vi kan ikke regne denne formen» og
    «staalet har flytt».
    """
    payload = sls_payload(TIE_REBAR, 1000e3, 0.0, combo_type='quasi_permanent', phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['cracked'] is True
    assert row['state'] is None
    assert row['state_reason'] == 'stresses_outside_elastic_range'
    assert row['state_reason'] != 'no_equilibrium_cracked'


def test_a_section_entirely_in_tension_gets_a_crack_width():
    """Sentrisk strekk -- strekkstag, ringarmering i tanker, veggskiver -- er blant de
    VIKTIGSTE rissviddetilfellene i EC2. Standarden har dem eksplisitt: fig. 7.1(c)
    viser A_c,eff for et strekkstav, og k2 = 1,0 i lign. 7.13 finnes nettopp for ren
    strekk. Motoren svarte `fully_in_tension -> crack_width_ok: None` og lot dem ligge.

    Naar hele snittet er i strekk og risset baerer betongen ingenting, og likevekten
    blir to LINEAERE likninger i (eps_a, chi) -- uten trykksonen den kubiske loeseren
    maa lete seg fram til.
    """
    payload = sls_payload(TIE_REBAR, 800e3, 0.0, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    state, crack = row['state'], row['crack']

    assert state is not None, row['state_reason']
    assert state['x'] == 0.0, 'det finnes ingen trykksone'
    assert state['sigma_c'] == 0.0, 'og dermed ingen trykkspenning'
    # Likevekt: summen av staalkreftene ER aksialkraften.
    force = sum(l['sigma'] * a for l, (a, _z)
                in zip(state['layers'], [(float(l['area']), 0.0) for l in TIE_REBAR]))
    assert close(force, 800e3, rel=1e-9), f'likevekten holder ikke: {force}'

    assert crack is not None
    assert crack['w_k'] > 0.0
    assert close(crack['k2'], 1.0), 'EC2 lign. 7.13 gir k2 = 1,0 for ren strekk'
    # `(h-x)/3` er utledet for en bjelke med trykksone og gjelder ikke her.
    assert crack['h_c_eff_governing'] in ('h/2', '2.5(h-d)')
    assert '(h-x)/3' not in crack['h_c_eff_candidates']


def _assert_no_crash(result):
    """Payloadene her har BARE en bruksgrenserad, saa bruddgrensedelen melder
    `no_uls_combination` -- det er forventet og ikke et kast. Alt annet `ok: False` er
    en kjoerefeil, og da er hele svaret borte: ingen ULS, ingen figur, ingen advarsel."""
    if result.get('ok') is False:
        code = result['error']['code']
        assert code == 'no_uls_combination',             f"{code}: {result['error'].get('detail', '').strip().splitlines()[-1][:120]}"


ASYM_TIE_REBAR = [
    bars_layer('L1', -250.0, 25.0, [-100.0, -33.0, 33.0, 100.0]),
    bars_layer('L2', 250.0, 20.0, [-100.0, -33.0, 33.0, 100.0]),
]


def test_an_asymmetric_tie_does_not_take_the_whole_run_down():
    """REGRESJON paa strekkloeseren selv, og paa TESTENE for den.

    De to foerste strekktestene brukte et EKSAKT SYMMETRISK oppsett -- det ene
    tilfellet der feilen ikke kan vises, fordi `SUM(A*z) = 0` gjoer at `chi_y` foelger
    momentet alene. Med ULIKT jern i topp og bunn kommer krumningen fra armeringen, og
    `_sls_theta_equiv(m_ed)` pekte da ut FEIL kant:

        300x600, 4O25 UK + 4O20 OK, N = +900 kN, M = 0
        sann   eps(topp) 1,8530e-03   eps(bunn) 1,0801e-03
        antatt eps_1 = bunnen  ->  eps_r = 1,715  ->  `ec2_2004.k2()` KASTER
        ->  {ok: False}: ingen ULS, ingen figur, ingen advarsel

    47 av 140 proevde punkter krasjet. Paa master gav samme payload et pent
    `fully_in_tension`; grenen byttet det mot total kjoerefeil.

    Et strekkstag er sjelden eksakt symmetrisk, saa dette ER normaltilfellet.
    """
    payload = sls_payload(ASYM_TIE_REBAR, 900e3, 0.0, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    result = engine.run(payload)
    _assert_no_crash(result)

    row = result['sls']['rows'][0]
    state, crack = row['state'], row['crack']
    assert state is not None and state['tension_only'] is True
    # `eps_1` ER strekkanten: den STOERSTE toeyningen, uansett hva momentet sier.
    assert state['eps_1'] >= state['eps_2'] > 0.0
    assert crack is not None
    assert 0.0 <= crack['eps_r'] <= 1.0, 'eps_r utenfor [0,1] er det k2() kaster paa'
    assert 0.5 < crack['k2'] < 1.0


@pytest.mark.parametrize('dias', [(25.0, 20.0), (20.0, 25.0)])
@pytest.mark.parametrize('n_ed', [400e3, 900e3])
@pytest.mark.parametrize('m_ed', [-40e6, 0.0, 40e6])
def test_the_tension_solver_never_throws_across_asymmetry(dias, n_ed, m_ed):
    """Sveip: BEGGE retninger av usymmetri, med og uten moment. Et kast her er ikke en
    manglende funksjon, det er et tapt svar -- ogsaa for bruddgrensedelen, som ikke har
    noe med bruksgrensen aa gjoere."""
    rebar = [bars_layer('L1', -250.0, dias[0], [-100.0, -33.0, 33.0, 100.0]),
             bars_layer('L2', 250.0, dias[1], [-100.0, -33.0, 33.0, 100.0])]
    payload = sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', phi_ef=0.0,
                           exposure_class='XC3', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=False)
    _assert_no_crash(engine.run(payload))


def test_eccentric_tension_gives_k2_between_the_two_ends():
    """Eksentrisk strekk ligger mellom ren strekk (k2 = 1,0) og ren boeyning (k2 = 0,5)
    -- lign. 7.13 er nettopp den interpolasjonen."""
    payload = sls_payload(TIE_REBAR, 800e3, -10e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    crack = engine.run(payload)['sls']['rows'][0]['crack']
    assert crack is not None
    assert 0.5 < crack['k2'] < 1.0, crack['k2']


def test_a_single_layer_in_pure_tension_has_no_solution_and_says_so():
    """ETT armeringslag kan bare baere momentet `N * z_1`. Alt annet er en likevekt som
    ikke finnes, og da staar `fully_in_tension` igjen som den aerlige grunnen -- koden
    er ikke borte, den er bare ikke lenger svaret paa alt."""
    payload = sls_payload(BEAM_REBAR, 400e3, -60e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    row = engine.run(payload)['sls']['rows'][0]
    assert row['state'] is None
    assert row['state_reason'] in ('fully_in_tension', 'no_equilibrium_cracked')


def test_ordinary_bending_is_untouched_by_the_tension_solver():
    """Motstykket, og grensa for hele endringen: et vanlig feltmoment skal gi noeyaktig
    de samme tallene som foer -- trykksone, `(h-x)/3` blant kandidatene, k2 = 0,5."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    row = engine.run(payload)['sls']['rows'][0]
    assert row['state']['x'] > 0.0
    assert row['state']['sigma_c'] < 0.0
    assert row['state'].get('tension_only') is False
    crack = row['crack']
    assert '(h-x)/3' in crack['h_c_eff_candidates']
    assert close(crack['k2'], 0.5)
    assert close(crack['w_k'], 0.2114290340096794, rel=1e-9)


# ------------------------------------------------------------------ #
# AC14 -- en klasse uten anbefalt grense (XD3): crack er FYLT, bare 'ok' er null
# ------------------------------------------------------------------ #

def test_ac14_xd3_gives_filled_crack_with_null_ok():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XD3', w_max=None,
                           w_max_source=None, w_max_reason='no_crack_width_limit',
                           sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]

    assert row['crack'] is not None
    assert close(row['crack']['w_k'], 0.211429, rel=1e-5)
    assert row['crack']['w_max'] is None
    assert row['crack']['utilisation'] is None
    assert row['crack']['ok'] is None
    assert row['crack']['ok_reason'] == 'no_crack_width_limit'
    assert row['crack_reason'] is None  # crack er IKKE None
    assert result['sls']['checks']['crack_width_ok'] is None
    assert result['sls']['w_max'] is None
    assert result['sls']['w_max_reason'] == 'no_crack_width_limit'


def test_ac14_manual_override_wins_over_the_null_class_limit():
    """AC14 i specen paastaar `ok = false` for denne raden -- men med samme tall
    (`w_k = 0,211429`, `w_max = 0,25`) er `utilisation = 0,845716 < 1`, som per
    definisjonen `ok = (w_k <= w_max)` gir `True`. Specens egen tabell viser samme
    treverdige regel (§3.5/§4: `crack.ok` er BARE `false` naar `w_k > w_max`). Dette er
    en regnefeil i specen selv (0,845716 < 1 kan aldri gi `ok = false`), ikke noe motoren
    skal reprodusere -- se rapportens avviksfelt. Testen laaser derfor den RIKTIGE
    verdien, `ok = True`.
    """
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XD3', w_max=0.25,
                           w_max_source='manual', w_max_reason=None,
                           sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert close(row['crack']['w_max'], 0.25, rel=1e-9)
    assert close(row['crack']['utilisation'], 0.845716, rel=1e-4)
    assert row['crack']['ok'] is True


# ------------------------------------------------------------------ #
# Orakel-tester (spec §3.1): h_c,eff og eps_sm-eps_cm er VAARE, pakken er en oracle
# ------------------------------------------------------------------ #

@pytest.mark.parametrize('rebar,n_ed,m_ed,b,h,section_type', [
    (BEAM_REBAR, 0.0, -100e6, 300.0, 600.0, 'beam'),
    (SLAB4_REBAR, 0.0, -30e6, 1000.0, 200.0, 'slab'),
    (SLAB5_REBAR, 0.0, -22e6, 1000.0, 200.0, 'slab'),
    (SLAB7_REBAR, 0.0, -25e6, 1000.0, 200.0, 'slab'),
])
def test_hc_eff_and_eps_sm_eps_cm_match_the_package_oracle(
    rebar, n_ed, m_ed, b, h, section_type,
):
    """Vaar egen h_c,eff/eps_sm-eps_cm (§3.1) skal vaere BIT FOR BIT lik pakkens
    `ec2_2004.hc_eff`/`ec2_2004.eps_sm_eps_cm` for AC1/AC4/AC5/AC7 -- pakken er et
    TEST-ORAKEL her, ALDRI en andre produsent naar motoren kjoerer (den kalles ikke
    fra `engine.py`s produksjonskode, se `_sls_crack`)."""
    payload = sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', b=b, h=h,
                           section_type=section_type, phi_ef=0.0)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    crack = row['crack']
    assert crack is not None

    oracle_hc_eff = float(ec2_2004.hc_eff(h, crack['d'], crack['x']))
    assert close(crack['h_c_eff'], oracle_hc_eff, rel=1e-12)

    oracle_eps = float(ec2_2004.eps_sm_eps_cm(
        crack['sigma_s'], crack['alpha_e'], crack['rho_p_eff'], crack['k_t'],
        crack['f_ct_eff'], 200000.0,
    ))
    assert close(crack['eps_sm_eps_cm'], oracle_eps, rel=1e-12)


# ------------------------------------------------------------------ #
# De to rettede feilstrengene (spec §6.3, engine.py:1678/1688)
# ------------------------------------------------------------------ #

def test_no_uls_combination_message_no_longer_claims_sls_is_unimplemented():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent')
    result = engine.run(payload)
    assert result['ok'] is False
    assert result['error']['code'] == 'no_uls_combination'
    msg = result['error']['message']
    assert 'not implemented' not in msg
    assert 'serviceability' in msg.lower()
    # SLS-seksjonen finnes FORTSATT, selv om ULS feiler -- spec §6.2.
    assert 'sls' in result


def test_mc_active_not_uls_message_no_longer_claims_sls_is_unimplemented():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent')
    payload['analysis'] = 'moment_curvature'
    payload['loads']['combinations'].append(
        {'id': 'U1', 'name': 'ULS', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -50e6},
    )
    result = engine.run(payload)
    assert result['error']['code'] == 'mc_active_not_uls'
    msg = result['error']['message']
    assert 'not implemented' not in msg
    assert 'serviceability' in msg.lower()


# ------------------------------------------------------------------ #
# Advarselskoder (spec §4): sls_incomplete / sls_crack_width_exceeded /
# sls_stress_limit_exceeded -- ingen av dem siterer et tall som ikke ble regnet.
# ------------------------------------------------------------------ #

def test_sls_incomplete_warning_when_a_check_is_unanswered():
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class=None, sigma_c_char_required=None)
    result = engine.run(payload)
    codes = [w['code'] for w in result['warnings']]
    assert 'sls_incomplete' in codes
    w = next(w for w in result['warnings'] if w['code'] == 'sls_incomplete')
    assert w['severity'] == 'warning'
    assert '1 check' in w['message']


def test_k5_sigma_c_ok_is_unanswered_when_722_does_not_apply():
    """RETTET i runde 10 (K5). XC3: `_sls_checks` legger `sigma_c_char_ok` i
    `not_applicable` («klassen er ikke en EC2 7.2(2) krever grensen for»), men RADEN
    regnet likevel `sigma_c_ok: True` -- og utledningen i UI-et skrev «OK» for en
    kontroll linja rett over sa ikke gjaldt. To steder, to svar, samme spoersmaal.

    Naa: `sigma_c_ok` er `None` MED grunnen, mens spenningen og utnyttelsen staar
    igjen som de faktaene de er.
    """
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class='XC3', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=False)
    result = engine.run(payload)
    sls = result['sls']
    assert 'sigma_c_char_ok' in sls['not_applicable']
    assert 'sigma_c_char_ok' not in sls['checks']

    stress = sls['rows'][0]['stress']
    assert stress['sigma_c_ok'] is None, 'raden feller fortsatt en dom kontrollista ikke har'
    assert stress['sigma_c_ok_reason'] == 'sigma_c_char_not_required'
    assert stress['sigma_c'] < 0.0, 'spenningen er et faktum og skal staa'
    assert stress['sigma_c_util'] > 0.0, 'utnyttelsen er et faktum og skal staa'
    # Staalgrensen 7.2(5) er IKKE klasseavhengig og felles fortsatt.
    assert isinstance(stress['sigma_s_ok'], bool)


def test_k5_xd_class_still_gets_a_verdict():
    """Motstykket: for XD1 GJELDER 7.2(2), og da skal raden felle dommen som foer."""
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class='XD1', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=True)
    result = engine.run(payload)
    stress = result['sls']['rows'][0]['stress']
    assert stress['sigma_c_ok'] is True
    assert stress['sigma_c_ok_reason'] is None
    assert result['sls']['checks']['sigma_c_char_ok'] is True


def test_k5_quasi_permanent_723_applies_regardless_of_class():
    """EC2 7.2(3) er ikke klasseavhengig: en tilnaermet permanent rad skal faa sin dom
    ogsaa naar ingen eksponeringsklasse er valgt."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class=None,
                           sigma_c_char_required=None)
    result = engine.run(payload)
    stress = result['sls']['rows'][0]['stress']
    assert stress['sigma_c_ok'] is True
    assert stress['sigma_c_ok_reason'] is None


def test_quasi_permanent_row_reports_the_steel_stress_behind_the_crack_width():
    """Bestilt av brukeren: staalspenningen skal staa ogsaa for en tilnaermet permanent
    rad. Den har ingen GRENSE -- EC2 7.2(5) er en karakteristisk kontroll -- og ble
    derfor ikke rapportert i det hele tatt foer. Men den er selve inngangen til
    rissvidden, og en rad som viser w_k uten spenningen bak den kan ikke etterproeves.

    Kontrakten: `stress['sigma_s']` er `state['sigma_s_max']` for BEGGE radtyper, altsaa
    én definisjon. Grensa er `None`, dommen er `None`, og grunnen sier hvorfor.
    """
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=2.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    stress = row['stress']

    assert stress['sigma_s'] is not None, 'staalspenningen mangler fortsatt for QP'
    assert stress['sigma_s'] > 0.0
    # ÉN definisjon, ikke to: tallet ER radens egen `sigma_s_max`.
    assert stress['sigma_s'] == row['state']['sigma_s_max']
    assert stress['sigma_s_limit'] is None, 'EC2 7.2(5) er ikke en QP-kontroll'
    assert stress['sigma_s_util'] is None
    assert stress['sigma_s_ok'] is None
    assert stress['sigma_s_ok_reason'] == 'sigma_s_limit_characteristic_only'

    # Og spenningen lign. 7.9 FAKTISK bruker staar fortsatt for seg, med sitt eget
    # lag: den er det STYRENDE laget inne i A_c,eff, ikke stoerste over snittet.
    assert row['crack']['sigma_s'] > 0.0
    assert row['crack']['sigma_s_layer'] == 'L1'


def test_characteristic_row_still_gets_its_steel_stress_verdict():
    """Motstykket: 7.2(5) GJELDER for karakteristisk last, og dommen skal staa."""
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class='XC3', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=False)
    stress = engine.run(payload)['sls']['rows'][0]['stress']
    assert stress['sigma_s'] > 0.0
    assert stress['sigma_s_limit'] == 0.8 * 500.0
    assert isinstance(stress['sigma_s_ok'], bool)
    assert stress['sigma_s_ok_reason'] is None


def _uls_and_qp(w_max):
    """Et snitt som BESTAAR bruddgrensen, med én tilnaermet permanent rad ved siden av."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=2.0, exposure_class='XC3', w_max=w_max,
                           w_max_source='manual', w_max_reason=None,
                           sigma_c_char_required=False)
    payload['loads']['combinations'].insert(0, {
        'id': 'C1', 'name': 'ULS', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -100e6, 'V_Ed': 0.0})
    payload['loads']['active'] = 'C1'
    return payload


def test_overall_assessment_sees_the_serviceability_limit():
    """RETTET i runde 11. `checks['all_ok']` -- raden som HETER «Overall assessment»
    og som rapporten trykker som samlet vurdering -- saa bare paa bruddgrensen.

    MAALT foer rettelsen: en rissvidde paa 0,226 mm mot en grense paa 0,05, altsaa
    4,5 ganger over, gav `checks['all_ok'] = True`. Advarselen laa i lista, men en
    advarsel ved siden av en groenn hake blir ikke lest.

    Kommentaren over `checks['all_ok']` i motoren sa det allerede, om et annet
    tilfelle: «en Overall assessment: OK som overser ... er aktivt misvisende i et
    verktoey som dimensjonerer betong».
    """
    result = engine.run(_uls_and_qp(0.05))
    row = result['sls']['rows'][0]
    assert row['crack']['ok'] is False
    assert row['crack']['utilisation'] > 4.0, 'testen skal vaere grov, ikke marginal'

    # Bruddgrensen ALENE bestaar -- det er nettopp det som gjoer feilen farlig.
    uls_only = {k: v for k, v in result['checks'].items() if k != 'all_ok'}
    assert all(v is True for v in uls_only.values()), uls_only

    assert result['sls']['all_ok'] is False
    assert result['checks']['all_ok'] is False, \
        'samlet vurdering sier fortsatt OK med rissvidden 4,5x over grensa'
    assert 'sls_crack_width_exceeded' in [w['code'] for w in result['warnings']]


def test_overall_assessment_stays_true_when_serviceability_passes():
    """Motstykket: en romslig grense skal ikke faa den samlede vurderingen til aa
    falle. Uten denne ville rettelsen over kunne vaert «sett alltid False»."""
    result = engine.run(_uls_and_qp(0.4))
    assert result['sls']['rows'][0]['crack']['ok'] is True
    assert result['sls']['all_ok'] is True
    assert result['checks']['all_ok'] is True


def test_overall_assessment_is_unanswered_when_serviceability_is():
    """Treverdig hele veien: en ubesvart bruksgrensekontroll skal gi en ubesvart
    samlet vurdering, ikke en bestaatt. XD3 har ingen anbefalt rissviddegrense."""
    payload = _uls_and_qp(None)
    payload['sls'].update({'exposure_class': 'XD3', 'w_max': None, 'w_max_source': None,
                           'w_max_reason': 'no_crack_width_limit'})
    result = engine.run(payload)
    assert result['sls']['checks']['crack_width_ok'] is None
    assert result['sls']['all_ok'] is None
    assert result['checks']['all_ok'] is None, 'None skal slaa True, som ellers i kjeden'


def test_overall_assessment_is_untouched_without_serviceability_rows():
    """AC9: uten SLS-rader skal svaret vaere BIT FOR BIT som foer kapittelet fantes."""
    payload = _uls_and_qp(0.4)
    payload['loads']['combinations'] = [payload['loads']['combinations'][0]]
    result = engine.run(payload)
    assert 'sls' not in result
    assert result['checks']['all_ok'] is True


def _extreme_fibres(row):
    """Betongspenningen i BEGGE ytterfibrene, regnet av radens eget toeyningsplan."""
    st = row['state']
    ec = row['Ec_used']
    return (ec * (st['eps_a'] + st['chi_y'] * 300.0),
            ec * (st['eps_a'] + st['chi_y'] * -300.0))


@pytest.mark.parametrize('n_ed, combo_type, limit', [
    (-3200e3, 'characteristic', 18.0),
    (-2400e3, 'quasi_permanent', 13.5),
])
def test_uncracked_sigma_c_is_read_at_the_face_that_is_actually_worst(n_ed, combo_type, limit):
    """RETTET i runde 11. `comp_face_z` foelger fortegnet paa `M_Ed` alene. Det er
    riktig for et RISSET snitt, der den ene kanten per definisjon ER trykksonen -- men
    for et URISSET snitt med dominerende aksialtrykk baerer begge kantene, og den
    stoerste trykkspenningen kan ligge paa den kanten momentet IKKE peker paa.

    MAALT foer rettelsen, helt ordinaer 300x600 med 3O20 i underkant og et lite
    stoettemoment: rapportert -16,23 MPa mot en sann maks paa -18,28 (grense 18,0).
    Altsaa 11-13 % for lavt, paa usikker side, OG dommen snudde fra bestaatt til
    ikke bestaatt.
    """
    payload = sls_payload(BEAM_REBAR, n_ed, 5e6, combo_type=combo_type, phi_ef=0.0,
                           exposure_class='XC3', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['cracked'] is False, 'forutsetningen: aksialtrykket holder snittet urisset'

    top, bot = _extreme_fibres(row)
    worst = min(top, bot)
    assert abs(top - bot) > 1.0, 'testen skal ha en REELL forskjell mellom kantene'
    assert close(row['state']['sigma_c'], worst), \
        f'sigma_c = {row["state"]["sigma_c"]} er ikke den stoerste trykkspenningen ({worst})'

    stress = row['stress']
    assert stress['sigma_c_util'] > 1.0
    assert stress['sigma_c_ok'] is False, 'dommen skal snu naar den sanne spenningen brukes'


def test_uncracked_section_entirely_in_tension_reports_no_compression():
    """Rent aksialstrekk: BEGGE kantene er i strekk, og da finnes det ingen
    trykkspenning. Foer rettelsen stod det +1,851 MPa merket «compression face» og
    ble proevd mot TRYKKgrensa med `abs()` -- et tall med feil fortegn i en kontroll
    det ikke hoerte hjemme i."""
    payload = sls_payload(BEAM_REBAR, 300e3, 0.0, combo_type='characteristic',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    top, bot = _extreme_fibres(row)
    assert top > 0 and bot > 0, 'forutsetningen: hele snittet i strekk'
    assert row['state']['sigma_c'] == 0.0
    assert row['stress']['sigma_c_ok'] is True, 'ingen trykkspenning kan ikke sprenge en trykkgrense'


def test_cracked_sigma_c_still_reads_the_face_theta_points_at():
    """Motstykket, og grensa for rettelsen: for et RISSET snitt skal formelen staa
    noeyaktig som foer. Der ER den ene kanten trykksonen, og `eps_1`/`eps_2` -- som gaar
    videre til `k2` i lign. 7.13 -- bygger paa den samme definisjonen."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                           w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['cracked'] is True
    top, _bot = _extreme_fibres(row)
    # Feltmoment: trykkanten er OK, og det er den `sigma_c` skal vise.
    assert close(row['state']['sigma_c'], top)
    assert row['state']['sigma_c'] < 0.0


SLAB_1000_REBAR = [bars_layer('L1', -459.0, 16.0, [-100.0, 0.0, 100.0])]


def _char_and_qp(m_char, m_qp):
    """300x1000 med 3O16 i underkant: én karakteristisk og én tilnaermet permanent rad."""
    payload = sls_payload(SLAB_1000_REBAR, 0.0, m_qp, combo_type='quasi_permanent',
                           b=300.0, h=1000.0, phi_ef=2.0, exposure_class='XC4',
                           w_max=0.3, w_max_source='class', w_max_reason=None,
                           sigma_c_char_required=False)
    payload['loads']['combinations'].insert(0, {
        'id': 'C0', 'name': 'Char', 'type': 'characteristic', 'N_Ed': 0.0, 'M_Ed': m_char})
    return payload


def test_cracking_is_decided_by_the_envelope_not_by_each_row():
    """RETTET i runde 11. Rissbeslutningen ble tatt PER RAD. Motorens egen
    hodekommentar sier «riss er irreversibelt» -- som begrunnelse for at E_cm brukes i
    beslutningen -- men regelen ble ikke brukt paa TILSTANDEN.

    MAALT foer rettelsen, 300x1000 med 3O16 UK:
        karakteristisk M = -200 kNm  ->  sigma_ct = 3,84 > f_ctm = 2,90  -> RISSER
        tilnaermet perm M = -144 kNm  ->  sigma_ct = 2,76 < f_ctm        -> «urisset»
    Motoren svarte «no quasi-permanent load combination cracks the section» og
    `sls.all_ok = True`, altsaa BESTAATT uten aa ha regnet rissvidden i det hele tatt.

    Riss forsvinner ikke naar lasten gaar ned.
    """
    result = engine.run(_char_and_qp(-200e6, -144e6))
    sls = result['sls']
    rows = {r['id']: r for r in sls['rows']}

    # Forutsetningene: de to radene ligger paa hver sin side av rissgrensa.
    assert rows['C0']['sigma_ct_uncracked'] > sls['f_ct_eff']
    assert rows['S1']['sigma_ct_uncracked'] < sls['f_ct_eff']

    assert sls['cracked'] is True, 'snittet risser av den karakteristiske raden'
    assert rows['S1']['cracked'] is True, 'og da er det risset ogsaa for den permanente'

    # Kontrollen er FAKTISK utfoert, ikke lagt i not_applicable.
    assert 'crack_width_ok' in sls['checks']
    assert 'crack_width_ok' not in sls['not_applicable']
    assert rows['S1']['crack'] is not None
    assert rows['S1']['crack']['w_k'] > 0.0


def test_an_uncracked_section_is_still_uncracked():
    """Motstykket. Uten denne ville «sett alltid cracked» vaert en bestaatt rettelse --
    og da ville hver eneste urissede plate faatt en oppdiktet rissvidde."""
    result = engine.run(_char_and_qp(-80e6, -60e6))
    sls = result['sls']
    rows = {r['id']: r for r in sls['rows']}
    assert rows['C0']['sigma_ct_uncracked'] < sls['f_ct_eff']
    assert sls['cracked'] is False
    assert all(r['cracked'] is False for r in sls['rows'])
    assert sls['not_applicable']['crack_width_ok'] == \
        'no quasi-permanent load combination cracks the section'


def test_the_envelope_also_moves_the_concrete_stress_at_first_loading():
    """Samme feil traff `sigma_c_qp_ok`: den urissede tilstanden gir en LAVERE
    betongspenning enn den rissede, saa en rad som feilaktig ble regnet urisset fikk et
    for lavt tall -- maalt 2,142 mot 2,754 MPa paa referansebjelken, altsaa 29 % lavt."""
    cracked = engine.run(_char_and_qp(-200e6, -144e6))['sls']['rows'][1]
    uncracked = engine.run(_char_and_qp(-80e6, -144e6))['sls']['rows'][1]
    assert cracked['cracked'] is True and uncracked['cracked'] is False
    assert abs(cracked['state']['sigma_c']) > abs(uncracked['state']['sigma_c']), \
        'den rissede tilstanden skal gi stoerre betongtrykk for samme last'


def test_sls_defaults_mirror_the_js_source():
    """`_SLS_FALLBACK` er et SPEIL av `SLS_DEFAULTS` i js/materials.js, ikke en fjerde
    kilde (runde 10 K3). Denne testen LESER begge og feiler hvis de gaar fra hverandre
    -- en kommentar som sier «hold disse i takt» holder ingenting i takt.
    """
    src = (MODULE_DIR / 'js' / 'materials.js').read_text(encoding='utf-8')
    block = src.split('export const SLS_DEFAULTS = Object.freeze({', 1)[1].split('});', 1)[0]
    js = {}
    for line in block.splitlines():
        line = line.strip().rstrip(',')
        # Kommentarene i blokka inneholder ogsaa kolon; de er ikke felter.
        if not line or line.startswith('//') or ':' not in line:
            continue
        key, value = line.split(':', 1)
        key, value = key.strip(), value.strip()
        if not value or not value[0].isdigit():
            continue
        js[key] = float(value)
    assert js == engine._SLS_FALLBACK


def test_sls_incomplete_detail_names_the_check_and_the_class_when_no_class_is_chosen():
    """Uten klasse ER grunnen eksponeringsklassen -- men den skal staa som radens
    faktiske kode, ikke som en setning valgt paa noekkelnavnet."""
    payload = sls_payload(BEAM_REBAR, 0.0, -120e6, combo_type='characteristic',
                           exposure_class=None, sigma_c_char_required=None)
    result = engine.run(payload)
    w = next(w for w in result['warnings'] if w['code'] == 'sls_incomplete')
    assert 'sigma_c_char_ok' in w['message'], 'meldingen navngir ikke hvilken kontroll'
    assert w['detail'] == 'sigma_c_char_ok: no_exposure_class'


def test_sls_incomplete_detail_reads_the_row_not_the_key_name():
    """REGRESJON (runde 10 M2). Den forrige utgaven slo opp en fast setning paa
    NOEKKELNAVNET: `sigma_c_char_ok` fikk alltid «ingen eksponeringsklasse er valgt»,
    ogsaa naar klassen stod der og raden i stedet var ulovlig, og `sigma_s_char_ok`
    fikk ingen forklaring i det hele tatt fordi den manglet i tabellen.

    Her ER klassen valgt (XD1, som 7.2(2) gjelder for), og det er RADEN som ikke lot
    seg loese -- stoettemoment uten toppjern, samme tilstand som AC8b. Begge de to
    karakteristiske noeklene skal da baere radens egen kode.
    """
    payload = sls_payload(BEAM_REBAR, 0.0, 100e6, combo_type='characteristic',
                           exposure_class='XD1', w_max=0.3, w_max_source='class',
                           w_max_reason=None, sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['state'] is None
    assert row['state_reason'] == 'stresses_outside_elastic_range'
    assert result['sls']['checks']['sigma_c_char_ok'] is None
    assert result['sls']['checks']['sigma_s_char_ok'] is None

    w = next(w for w in result['warnings'] if w['code'] == 'sls_incomplete')
    assert 'no_exposure_class' not in w['detail'], 'grunnen er fortsatt valgt paa noekkelnavnet'
    assert w['detail'] == ('sigma_c_char_ok: S1 (stresses_outside_elastic_range); '
                           'sigma_s_char_ok: S1 (stresses_outside_elastic_range)')


def test_sls_incomplete_detail_for_an_unanswered_crack_width_names_the_limit_reason():
    """XD3 har ingen anbefalt grense: raden HAR en regnet `w_k`, men `ok` er ubesvart.
    Grunnen ligger da paa `crack['ok_reason']`, ikke paa tilstanden -- og det er den
    som skal staa."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XD3', w_max=None,
                           w_max_source=None, w_max_reason='no_crack_width_limit',
                           sigma_c_char_required=True)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['crack']['w_k'] > 0.0
    assert row['crack']['ok'] is None
    w = next(w for w in result['warnings'] if w['code'] == 'sls_incomplete')
    assert w['detail'] == 'crack_width_ok: S1 (no_crack_width_limit)'


def test_sls_crack_width_exceeded_warning_cites_a_computed_number():
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                           phi_ef=0.0, exposure_class='XC3', w_max=0.05,
                           w_max_source='manual', w_max_reason=None)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['crack']['ok'] is False
    w = next(w for w in result['warnings'] if w['code'] == 'sls_crack_width_exceeded')
    assert f'{row["crack"]["w_k"]:.3f}' in w['message']
    assert f'{row["crack"]["w_max"]:.3f}' in w['message']


def test_sls_stress_limit_exceeded_warning():
    # N liten, M stor -- staalet flyter ikke (vakten slaar ikke inn), men strekket blir
    # stort nok til aa overskride 0.8*f_yk under karakteristisk last.
    payload = sls_payload(BEAM_REBAR, 0.0, -200e6, combo_type='characteristic',
                           exposure_class=None, sigma_c_char_required=None)
    result = engine.run(payload)
    row = result['sls']['rows'][0]
    assert row['state'] is not None, 'vakten skal ikke ha slaatt inn for denne lasten'
    assert row['stress']['sigma_s_ok'] is False
    codes = [w['code'] for w in result['warnings']]
    assert 'sls_stress_limit_exceeded' in codes


# ------------------------------------------------------------------ #
# Motoren kaster aldri -- ogsaa naar SLS-blokka faar en degenerert rad
# ------------------------------------------------------------------ #

def test_pure_axial_row_gives_null_z_na_and_a_drawable_x():
    """chi_y = 0 (rent aksialt, intet moment). RETTET i runde 10 (K4): kontrakten sa
    `'z_na': float`, men et snitt med samme toeyning overalt HAR ingen nullakse.
    `None` er det aerlige svaret, og `0` eller en klemt kant ville vaert et tall som
    loey. `x` skal derimot vaere et TALL -- figuren og rapporten tegner den, og for
    rent trykk er `x = h` den riktige degenerasjonen, ikke en manglende verdi.
    """
    # SYMMETRISK armering, med vilje: med jern bare i underkant gir selv en ren
    # aksialkraft en liten krumning (maalt chi_y = -2,0e-8), og den degenererte
    # grenen naas aldri. Det er symmetrien som gjoer chi_y EKSAKT null.
    symmetric = [bars_layer('L1', -250.0, 20.0, [-100.0, 0.0, 100.0]),
                 bars_layer('L2', 250.0, 20.0, [-100.0, 0.0, 100.0])]
    payload = sls_payload(symmetric, -500e3, 0.0, combo_type='quasi_permanent',
                           phi_ef=0.0)
    result = engine.run(payload)
    # Payloaden har BARE en SLS-rad, saa bruddgrensedelen melder `no_uls_combination`
    # -- bruksgrensekapittelet skal likevel staa der ferdig regnet (AC10).
    assert result['error']['code'] == 'no_uls_combination'
    row = result['sls']['rows'][0]
    assert row['cracked'] is False, 'rent trykk risser ikke'
    assert row['state'] is not None
    assert row['state']['chi_y'] == 0.0
    assert row['state']['z_na'] is None, 'ingen nullakse naar toeyningen er konstant'
    assert row['state']['x'] == 600.0, 'hele snittet i trykk -> x = h, ikke None'
    assert row['state']['sigma_c'] < 0.0


# ------------------------------------------------------------------ #
# Den effektive strekksonen regnes PER KANT (EC2 7.3.2(3), fig. 7.1(c))
# ------------------------------------------------------------------ #
#
# ADVARSEL TIL NESTE LESER: de to eldste strekktestene over
# (`test_a_section_entirely_in_tension_gets_a_crack_width` og
# `test_ac13_...`) bruker et EKSAKT SYMMETRISK oppsett. Det er det ene
# tilfellet der en kantvis feil IKKE kan vises, fordi de to kantene da gir
# samme tall uansett hvilken av dem som blir maalt. Testene under er derfor
# usymmetriske med vilje -- i diameter, i armeringsmengde og i moment.


def spacing_strip(layer_id, z, dia, spacing):
    """Et `spacing`-lag slik `rebar.js:87` bygger det: ALLTID per meter (1000/s),
    uansett tverrsnittstype (spec §3.4)."""
    return strip_layer(layer_id, z, dia, (1000.0 / spacing) * math.pi * dia * dia / 4.0)


# Vegg 1000x300, Ø20 c/c 250 i BEGGE sider, jernsenter 50 mm fra hver overflate.
WALL_REBAR = [spacing_strip('BOT', -100.0, 20.0, 250.0),
              spacing_strip('TOP', 100.0, 20.0, 250.0)]


def test_a_wall_reinforced_at_both_faces_is_measured_at_both_faces():
    """Vegg 1000x300, Ø20 c/c 250 i begge sider, N = +950 kN (rent strekk).

    Foer ble det bygd ÉN sone fra den kanten toeyningen pekte paa, med
    `h_c,eff = h/2 = 150,0` -- hele halve veggen som effektiv betong, men bare
    jernene ved den ene overflaten inni den. Det gav `rho_p,eff = 0,008378` og
    `w_k = 1,1024`; den andre overflaten ble aldri regnet.

    Kantvis er sonen `2,5*d_kant = 125,0` mot HVER overflate, med det jernlaget som
    faktisk ligger der: `rho_p,eff = 0,010053`, `s_r,max = 812,41` og
    `w_k = 1,0386` -- maalt paa begge overflatene, ikke paa én.
    """
    payload = sls_payload(WALL_REBAR, 950e3, 0.0, combo_type='quasi_permanent',
                          b=1000.0, h=300.0, section_type='wall', phi_ef=0.0,
                          exposure_class='XC3', w_max=0.3, w_max_source='class',
                          w_max_reason=None, sigma_c_char_required=False)
    crack = engine.run(payload)['sls']['rows'][0]['crack']
    assert crack is not None

    assert len(crack['edges']) == 2, 'begge overflatene skal staa i svaret'
    assert [e['face'] for e in crack['edges']] == ['bottom', 'top']
    for edge in crack['edges']:
        assert close(edge['d_edge'], 50.0)
        assert edge['h_c_eff_governing'] == '2.5(h-d)'
        assert close(edge['h_c_eff'], 125.0)
        assert close(edge['A_s_eff'], 1256.6370614359173)
        assert close(edge['rho_p_eff'], 0.010053096491487345)
        assert close(edge['c'], 40.0)
        assert close(edge['sr_max'], 812.4085081405548)
        assert close(edge['w_k'], 1.0386216045928696)
        assert edge['layers_at_face'] == [edge['layers_in_zone'][0]]

    # Den gamle ENE sonen paa h/2 er ikke lenger svaret noe sted.
    assert crack['h_c_eff'] != 150.0
    assert close(crack['w_k'], 1.0386216045928696)
    assert crack['governing_edge'] in ('bottom', 'top')
    assert close(crack['w_k'], max(e['w_k'] for e in crack['edges']))


def test_the_face_the_old_rule_never_looked_at_can_be_the_governing_one():
    """Verstetilfellet i sveipet (§ docstringen til `_sls_crack`): b 600, h 200,
    jernsenter 70 mm fra hver overflate, LIK armeringsmengde men Ø20 i UK mot Ø16 i
    OK, sigma_s ~ 340 MPa, lite moment.

    De to overflatene havner i HVER SIN gren av `s_r,max`: UK har grovere jern og
    stoerre senteravstand (523,6 > terskel 350) og faller i `far`, OK i `close`.
    Foer ble bare UK maalt -- 0,2823 mm. OK, som ingen saa paa, gir 0,8186 mm.
    Det gamle svaret var 0,345x det riktige.

    Usymmetrien her er i DIAMETER, ikke i mengde: samme `A_s` paa begge sider.
    Et snitt som ser symmetrisk ut i en armeringsliste er det altsaa ikke
    noedvendigvis i 7.3.4.
    """
    b, h, cov = 600.0, 200.0, 70.0
    a_face = 0.010 * b * h / 2.0
    rebar = [strip_layer('BOT', -(h / 2 - cov), 20.0, a_face),
             strip_layer('TOP', (h / 2 - cov), 16.0, a_face)]
    n_ed = 340.0 * 2.0 * a_face
    payload = sls_payload(rebar, n_ed, -0.03 * n_ed * h / 1000.0,
                          combo_type='quasi_permanent', b=b, h=h,
                          section_type='wall', phi_ef=0.0, exposure_class='XC3',
                          w_max=0.3, w_max_source='class', w_max_reason=None,
                          sigma_c_char_required=False)
    crack = engine.run(payload)['sls']['rows'][0]['crack']
    assert crack is not None

    bot, top = crack['edges']
    assert (bot['face'], top['face']) == ('bottom', 'top')
    assert bot['sr_max_branch'] == 'far' and top['sr_max_branch'] == 'close'
    assert close(bot['w_k'], 0.28229836014787657)
    assert close(top['w_k'], 0.8186273295349383)
    assert crack['governing_edge'] == 'top'
    assert close(crack['w_k'], 0.8186273295349383)
    assert close(crack['sr_max'], 754.4375749500332)
    assert bot['w_k'] / top['w_k'] < 0.35, 'den umaalte kanten var 2,9 ganger verre'


def test_both_edges_of_a_tie_carry_their_own_zone_not_a_shared_one():
    """Usymmetrisk strekkstag: 4Ø25 i UK mot 4Ø16 i OK, med moment.

    Poenget er at de to kantene har HVER SIN `A_s,eff`, `sigma_s`, `c` og `phi_eq` --
    ingen av dem regnes av et snittvektet tyngdepunkt over begge lagene.
    """
    ys = [-100.0, -33.0, 33.0, 100.0]
    rebar = [bars_layer('L1', -250.0, 25.0, ys), bars_layer('L2', 250.0, 16.0, ys)]
    payload = sls_payload(rebar, 700e3, -30e6, combo_type='quasi_permanent',
                          phi_ef=0.0, exposure_class='XC3', w_max=0.3,
                          w_max_source='class', w_max_reason=None,
                          sigma_c_char_required=False)
    row = engine.run(payload)['sls']['rows'][0]
    crack = row['crack']
    assert crack is not None, row['crack_reason']
    bot, top = crack['edges']

    assert bot['layers_in_zone'] == ['L1'] and top['layers_in_zone'] == ['L2']
    assert bot['layers_at_face'] == ['L1'] and top['layers_at_face'] == ['L2']
    assert close(bot['A_s_eff'], 4 * math.pi * 25.0 ** 2 / 4.0)
    assert close(top['A_s_eff'], 4 * math.pi * 16.0 ** 2 / 4.0)
    assert close(bot['phi_eq'], 25.0) and close(top['phi_eq'], 16.0)
    assert close(bot['c'], 50.0 - 12.5) and close(top['c'], 50.0 - 8.0)
    # To ULIKE staalspenninger. Her er det den LETTE kanten (4Ø16 i OK) som er
    # hardest paastrengt, ikke den tunge -- maalt 360,59 mot 208,81 MPa. Nettopp
    # derfor holder det ikke aa maale bare den ene overflaten.
    assert top['sigma_s'] > bot['sigma_s'] > 0.0
    assert crack['governing_edge'] == 'top'
    assert crack['w_k'] == max(bot['w_k'], top['w_k'])
    # `eps_1`/`eps_2` er snittets, ikke kantens: de skal vaere like i begge.
    assert bot['eps_1'] == top['eps_1'] and bot['eps_2'] == top['eps_2']
    assert bot['k2'] == top['k2']


# ------------------------------------------------------------------ #
# Ren boeyning skal vaere UROERT -- 27 snitt, bit for bit
# ------------------------------------------------------------------ #

def _bending_cases():
    """Snitt med strekkarmering ved BARE ÉN kant. For dem er kantvis regel per
    definisjon den samme sonen som foer, og testen under laaser at det stemmer.

    Lastnivaaene er valgt saa ALLE 27 faktisk risser og holder seg elastiske -- en
    parametrisering der halvparten faller ut som `uncracked` er ikke en
    bit-identitetssjekk paa 27 snitt, den er det paa de som ble igjen. Utvalget
    treffer begge `h_c,eff`-grenene (19 x `2,5(h-d)`, 8 x `(h-x)/3`) og begge
    `s_r,max`-grenene (24 `close`, 3 `far`) -- maalt, ikke antatt.
    """
    out = []
    for h, dia, ys, m in [(600.0, 20.0, [-100.0, 0.0, 100.0], -88.1e6),
                          (600.0, 25.0, [-90.0, 0.0, 90.0], -137.7e6),
                          (800.0, 32.0, [-100.0, 0.0, 100.0], -307.6e6)]:
        for b in (250.0, 300.0, 450.0):
            out.append(('bjelke %gx%g O%g' % (b, h, dia),
                        [bars_layer('L1', -(h / 2 - 50.0), dia, ys)],
                        0.0, m, b, h, 'beam'))
    out.append(('bjelke 250x400 O16', [bars_layer('L1', -150.0, 16.0, [-80.0, 80.0])],
                0.0, -23.9e6, 250.0, 400.0, 'beam'))
    out.append(('bjelke 300x400 O16', [bars_layer('L1', -150.0, 16.0, [-80.0, 80.0])],
                0.0, -35.9e6, 300.0, 400.0, 'beam'))
    thin = [-100.0, -33.0, 33.0, 100.0]
    out.append(('bjelke 250x500 O12', [bars_layer('L1', -200.0, 12.0, thin)],
                0.0, -34.6e6, 250.0, 500.0, 'beam'))
    out.append(('bjelke 300x500 O12', [bars_layer('L1', -200.0, 12.0, thin)],
                0.0, -51.9e6, 300.0, 500.0, 'beam'))
    for h, dia, s_cc, m in [(200.0, 12.0, 150.0, -30e6), (200.0, 12.0, 200.0, -22e6),
                            (200.0, 16.0, 200.0, -25e6), (250.0, 16.0, 150.0, -45e6),
                            (300.0, 20.0, 200.0, -80e6), (180.0, 10.0, 125.0, -18e6)]:
        out.append(('plate %g O%g c%g' % (h, dia, s_cc),
                    [spacing_strip('L1', -(h / 2 - 25.0 - dia / 2), dia, s_cc)],
                    0.0, m, 1000.0, h, 'slab'))
    for m in (100e6, 140e6, 180e6):
        out.append(('stoettemoment M%g' % (m / 1e6),
                    [bars_layer('L1', 250.0, 20.0, [-100.0, 0.0, 100.0]),
                     bars_layer('L2', -250.0, 16.0, [-100.0, 100.0])],
                    0.0, m, 300.0, 600.0, 'beam'))
    for m in (-100e6, -160e6):
        out.append(('trykkarmering M%g' % (m / 1e6),
                    [bars_layer('L1', -250.0, 20.0, [-100.0, 0.0, 100.0]),
                     bars_layer('L2', 250.0, 16.0, [-100.0, 100.0])],
                    0.0, m, 300.0, 600.0, 'beam'))
    for n, m in ((-500e3, -200e6), (-200e3, -150e6), (200e3, -120e6)):
        out.append(('bjelke N%g M%g' % (n / 1e3, m / 1e6),
                    [bars_layer('L1', -250.0, 20.0, [-100.0, 0.0, 100.0])],
                    n, m, 300.0, 600.0, 'beam'))
    return out


BENDING_CASES = _bending_cases()


def test_the_bending_sweep_is_wide_enough_to_be_a_check():
    """En bit-identitetssjekk paa fem snitt beviser ingenting. Kravet var MINST 20."""
    assert len(BENDING_CASES) >= 20, len(BENDING_CASES)


@pytest.mark.parametrize('name,rebar,n_ed,m_ed,b,h,section_type', BENDING_CASES,
                          ids=[c[0] for c in BENDING_CASES])
def test_pure_bending_gets_exactly_the_same_zone_as_before(
    name, rebar, n_ed, m_ed, b, h, section_type,
):
    """REN BOEYNING ER UROERT. Med strekkarmering ved bare én kant er kantens lagsett
    HELE strekksettet, og `d_kant = h - d`.

    `d` regnes her paa nytt av payloaden med DEN GAMLE formelen -- arealvektet dybde
    fra trykkanten over alle lag med eps > 0, akkurat slik `_weighted_depth` gjoer det
    -- og sammenlignes med `==`, ikke med toleranse. Det er hele bit-identitetskravet
    i én paastand: er `d` bit-lik, er `2,5(h-d)` det, og dermed `h_c,eff`, `A_c,eff`,
    `rho_p,eff` og `w_k`.

    `h_c,eff` kryssjekkes i tillegg mot pakkens `ec2_2004.hc_eff` (spec §3.1: pakken
    er TEST-orakel, aldri en andre produsent i motoren).
    """
    payload = sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', b=b, h=h,
                          section_type=section_type, phi_ef=0.0)
    row = engine.run(payload)['sls']['rows'][0]
    crack = row['crack']
    assert crack is not None, row['crack_reason'] or row['state_reason']

    # ÉN kant: et boeyd snitt har én overflate i strekk, og trykkanten er ikke en av dem.
    assert len(crack['edges']) == 1
    assert crack['edges'][0]['w_k'] == crack['w_k']
    assert crack['governing_edge'] == crack['edges'][0]['face']

    hogging = m_ed > 0.0
    total = 0.0
    weighted = 0.0
    for layer, st in zip(rebar, row['state']['layers']):
        if st['eps'] is None or st['eps'] <= 0.0:
            continue
        z = layer['bars'][0]['z'] if layer['kind'] == 'bars' else layer['strip']['z']
        a = float(layer['area'])
        total += a
        weighted += a * ((z + h / 2.0) if hogging else (h / 2.0 - z))
    d_old = weighted / total
    assert crack['d'] == d_old, (crack['d'], d_old)
    assert crack['d_edge'] == h - d_old
    assert crack['h_c_eff_candidates']['2.5(h-d)'] == 2.5 * (h - d_old)

    assert crack['h_c_eff'] == float(ec2_2004.hc_eff(h, crack['d'], crack['x']))


def test_the_reference_beam_still_gives_the_number_it_always_gave():
    """Grensa for hele endringen, i ett tall."""
    payload = sls_payload(BEAM_REBAR, 0.0, -100e6, combo_type='quasi_permanent',
                          phi_ef=0.0)
    crack = engine.run(payload)['sls']['rows'][0]['crack']
    assert crack['h_c_eff'] == 125.0
    assert crack['h_c_eff_governing'] == '2.5(h-d)'
    assert crack['d'] == 550.0
    assert crack['d_edge'] == 50.0
    assert crack['w_k'] == 0.2114290340096794


# ------------------------------------------------------------------ #
# Diskontinuiteten paa halv hoeyde
# ------------------------------------------------------------------ #

def test_a_layer_moved_through_mid_height_gives_a_smooth_curve():
    """Den gamle sonen var ETT intervall fra én overflate. Et lag som krysset halv
    hoeyde falt inn i eller ut av det, og svaret hoppet paa et snitt som ellers var
    identisk. MAALT paa geometrien under: `A_s,eff` gikk 1 472,6 -> 2 415,1 mm2 og
    `w_k` 0,8555 -> 0,6042 over 2 mm -- faktor 1,4158.

    Kantvis hoerer laget til den kanten det er naermest, og de to kantene bytter rolle
    kontinuerlig naar det krysser. MAALT etter: 0,6533 -> 0,6527 -> 0,6533, altsaa en
    glatt bunn, og stoerste sprang mellom nabopunkter over hele +/-10 mm er 1,00111.
    """
    h = 400.0
    w_ks = []
    for z in [-10.0 + 2.0 * k for k in range(11)]:
        rebar = [bars_layer('BOT', -(h / 2 - 50.0), 25.0, [-80.0, 0.0, 80.0]),
                 bars_layer('MID', z, 20.0, [-80.0, 0.0, 80.0]),
                 bars_layer('TOP', (h / 2 - 50.0), 25.0, [-80.0, 0.0, 80.0])]
        payload = sls_payload(rebar, 1400e3, 0.0, combo_type='quasi_permanent',
                              b=400.0, h=h, section_type='wall', phi_ef=0.0,
                              exposure_class='XC3', w_max=0.3, w_max_source='class',
                              w_max_reason=None, sigma_c_char_required=False)
        row = engine.run(payload)['sls']['rows'][0]
        assert row['crack'] is not None, (z, row['crack_reason'], row['state_reason'])
        w_ks.append(row['crack']['w_k'])

    jumps = [max(a / b, b / a) for a, b in zip(w_ks, w_ks[1:])]
    assert max(jumps) < 1.01, (max(jumps), w_ks)
    # og bunnen ligger DER laget er paa halv hoeyde, ikke et vilkaarlig sted
    assert w_ks[5] == min(w_ks)


# ------------------------------------------------------------------ #
# Vakter: sonen kan ikke bli dypere enn snittet, og strekkloeseren skal ikke kaste
# ------------------------------------------------------------------ #

def _two_face_sweep():
    for b, h in ((300.0, 300.0), (600.0, 200.0), (1000.0, 400.0)):
        for cov in (35.0, 50.0):
            for asym in (1.0, 2.0, 4.0):
                a_tot = 0.016 * b * h
                for dias in ((20.0, 16.0), (16.0, 20.0)):
                    rebar = [strip_layer('BOT', -(h / 2 - cov), dias[0],
                                         a_tot * asym / (1.0 + asym)),
                             strip_layer('TOP', (h / 2 - cov), dias[1],
                                         a_tot / (1.0 + asym))]
                    for sig in (180.0, 260.0):
                        n_ed = sig * a_tot
                        for mfac in (0.0, -0.03, 0.03):
                            yield (b, h, cov, asym, dias, sig, mfac, rebar, n_ed,
                                   mfac * n_ed * h / 1000.0)


def test_the_effective_zone_can_no_longer_be_deeper_than_the_section():
    """`2,5(h-d) > h` var symptomet paa at `d` ble regnet over ALLE strekklagene: en
    effektiv strekksone dypere enn hele snittet. Kantvis er `2,5*d_kant` bundet til
    kantens egne jern, og `h/2` staar dessuten som anti-overlappstak.

    MAALT over hovedsveipet (3 888 snitt, 1 536 med rissvidde): 0 kanter med
    `2,5(h-d) > h` og 0 med `h_c,eff > h/2`. Denne testen kjoerer den samme paastanden
    paa et lite, raskt utsnitt.
    """
    n_seen = 0
    for b, h, cov, asym, dias, sig, mfac, rebar, n_ed, m_ed in _two_face_sweep():
        payload = sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', b=b,
                              h=h, section_type='wall', phi_ef=0.0,
                              exposure_class='XC3', w_max=0.3, w_max_source='class',
                              w_max_reason=None, sigma_c_char_required=False)
        crack = engine.run(payload)['sls']['rows'][0]['crack']
        if crack is None:
            continue
        for edge in crack['edges']:
            n_seen += 1
            assert edge['h_c_eff_candidates']['2.5(h-d)'] <= h, (b, h, cov, asym, edge)
            assert edge['h_c_eff'] <= h / 2.0 + 1e-9
            assert 0.0 <= edge['eps_r'] <= 1.0
    assert n_seen >= 40, n_seen


def test_no_two_face_section_takes_the_whole_run_down():
    """Sveip over usymmetri x aksialkraft x moment paa snitt med armering ved BEGGE
    kanter. Et kast her er ikke en manglende funksjon, det er et tapt svar -- ogsaa
    for bruddgrensedelen, som ikke har noe med bruksgrensen aa gjoere.

    MAALT i hovedsveipet: 0 krasj av 3 888, og `eps_r` innenfor [0,1] i alle.
    """
    n = 0
    for b, h, cov, asym, dias, sig, mfac, rebar, n_ed, m_ed in _two_face_sweep():
        payload = sls_payload(rebar, n_ed, m_ed, combo_type='quasi_permanent', b=b,
                              h=h, section_type='wall', phi_ef=0.0,
                              exposure_class='XC3', w_max=0.3, w_max_source='class',
                              w_max_reason=None, sigma_c_char_required=False)
        _assert_no_crash(engine.run(payload))
        n += 1
    assert n >= 100, n


def test_an_edge_that_cannot_be_evaluated_makes_the_whole_answer_unanswered():
    """300x300 i rent strekk, 2Ø20 i UK og ETT Ø32 i OK. Det ene jernet har ingen
    nabo og dermed ingen senteravstand (spec §3.4), saa OK-overflaten kan ikke regnes.

    Foer stod det et ferdig tall der -- 0,4069 mm -- fordi bare den ene overflaten
    ble maalt. Naa er `crack` `null` med grunnen `no_bar_spacing`: «stoerste rissvidde
    over overflatene» er ikke noe vi kan svare paa naar vi bare kjenner den ene. Det
    er samme regel som allerede gjelder for et boeyd snitt (AC12), bare naadd fra en
    overflate til.
    """
    rebar = [bars_layer('L1', -100.0, 20.0, [-80.0, 0.0]),
             bars_layer('L2', 100.0, 32.0, [0.0])]
    payload = sls_payload(rebar, 300e3, 0.0, combo_type='quasi_permanent',
                          b=300.0, h=300.0, section_type='wall', phi_ef=0.0,
                          exposure_class='XC3', w_max=0.3, w_max_source='class',
                          w_max_reason=None, sigma_c_char_required=False)
    row = engine.run(payload)['sls']['rows'][0]
    assert row['state'] is not None, row['state_reason']
    assert row['crack'] is None
    assert row['crack_reason'] == 'no_bar_spacing'
