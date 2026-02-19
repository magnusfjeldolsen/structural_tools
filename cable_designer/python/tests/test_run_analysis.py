"""
Tests for run_analysis(params_json) — the public JSON entry point.

Verifies:
  - All new optional parameters are accepted (self_weight, initial_sag,
    support_h_max, support_k_h)
  - All new result fields are present (f_initial, H_initial, y_initial,
    delta_h, H_utilization, constrained_by_H_max, has_initial_sag)
  - Backward compatibility: omitting new params gives same behaviour as v1
  - Numeric correctness cross-checked against direct CableAnalysis calls
"""
import json
import pytest
import numpy as np
from conftest import CableAnalysis, run_analysis, L, A_EFF, E_MOD, SW


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _params(**overrides):
    """Build a minimal valid params dict; override as needed."""
    base = {
        'span': L,
        'n_segments': 200,
        'a_eff': A_EFF,            # already in m²
        'e_modulus': E_MOD,        # already in kN/m²
        'point_loads': [{'position': 5.0, 'magnitude': 100.0}],
        'line_loads': [],
        'method': 'rootfinding',
    }
    base.update(overrides)
    return base


def _run(**overrides):
    return json.loads(run_analysis(json.dumps(_params(**overrides))))


# ---------------------------------------------------------------------------
# Required result keys (backward-compatible subset)
# ---------------------------------------------------------------------------

REQUIRED_KEYS = [
    'converged', 'method', 'f', 'f_position', 'H', 'T_max',
    'strain', 'stress', 'cable_length', 'elongation', 'sag_ratio',
    'x', 'y', 'T', 'alpha', 'V', 'H_array', 'nodal_loads', 'q_dist',
    'stress_dist', 'R_left', 'R_right', 'total_load',
]

NEW_KEYS = [
    'has_initial_sag', 'f_initial', 'H_initial', 'y_initial',
    'delta_h', 'H_utilization', 'constrained_by_H_max', 'H_max',
    'self_weight_load',
]


class TestResultKeysPresent:

    def test_all_required_keys_present_basic(self):
        r = _run()
        for key in REQUIRED_KEYS:
            assert key in r, f"Missing key: {key}"

    def test_all_new_keys_present(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        for key in NEW_KEYS:
            assert key in r, f"Missing new key: {key}"

    def test_new_keys_present_even_without_self_weight(self):
        """New keys must always be returned, not just when self_weight > 0."""
        r = _run()
        for key in NEW_KEYS:
            assert key in r, f"Missing key when no self_weight: {key}"


# ---------------------------------------------------------------------------
# Backward compatibility: omitting new params ≈ v1 behaviour
# ---------------------------------------------------------------------------

class TestBackwardCompatibility:

    def test_no_new_params_converges(self):
        r = _run()
        assert r['converged'] is True

    def test_no_new_params_has_initial_sag_false(self):
        r = _run()
        assert r['has_initial_sag'] is False

    def test_no_new_params_H_utilization_zero(self):
        r = _run()
        assert r['H_utilization'] == pytest.approx(0.0)

    def test_no_new_params_delta_h_zero(self):
        r = _run()
        assert r['delta_h'] == pytest.approx(0.0)

    def test_no_new_params_constrained_false(self):
        r = _run()
        assert r['constrained_by_H_max'] is False

    def test_no_new_params_H_max_none(self):
        r = _run()
        assert r['H_max'] is None

    def test_self_weight_zero_same_as_omitted(self):
        """Explicitly passing self_weight=0 should give same result as omitting it."""
        r_omit = _run()
        r_zero = _run(self_weight=0.0)
        assert r_omit['H'] == pytest.approx(r_zero['H'], rel=1e-6)
        assert r_omit['f'] == pytest.approx(r_zero['f'], rel=1e-6)


# ---------------------------------------------------------------------------
# Self-weight parameter
# ---------------------------------------------------------------------------

class TestSelfWeightParam:

    def test_self_weight_activates_initial_sag_flag(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        assert r['has_initial_sag'] is True

    def test_f_initial_close_to_target(self):
        target = 0.25
        r = _run(self_weight=SW, initial_sag=target)
        assert r['f_initial'] == pytest.approx(target, rel=1e-3)

    def test_H_initial_positive(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        assert r['H_initial'] > 0.0

    def test_y_initial_length_matches_x(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        assert len(r['y_initial']) == len(r['x'])

    def test_y_initial_boundary_zero(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        assert r['y_initial'][0] == pytest.approx(0.0, abs=1e-6)
        assert r['y_initial'][-1] == pytest.approx(0.0, abs=1e-6)

    def test_self_weight_load_in_results(self):
        r = _run(self_weight=SW)
        expected = SW * L
        assert r['self_weight_load'] == pytest.approx(expected, rel=1e-6)

    def test_default_initial_sag_is_L_over_100(self):
        """When initial_sag omitted and self_weight > 0, default = L/100."""
        r = _run(self_weight=SW)
        assert r['f_initial'] == pytest.approx(L / 100, rel=1e-3)

    def test_self_weight_increases_total_sag_vs_no_weight(self):
        r_no_sw = _run()
        r_sw = _run(self_weight=SW, initial_sag=0.25)
        assert r_sw['f'] > r_no_sw['f']


# ---------------------------------------------------------------------------
# support_h_max parameter
# ---------------------------------------------------------------------------

class TestSupportHMax:

    def test_H_does_not_exceed_H_max(self):
        h_max = 500.0
        r = _run(self_weight=SW, initial_sag=0.15, support_h_max=h_max)
        assert r['H'] <= h_max + 1e-6

    def test_H_utilization_correct(self):
        h_max = 500.0
        r = _run(self_weight=SW, initial_sag=0.15, support_h_max=h_max)
        assert r['H_utilization'] == pytest.approx(r['H'] / h_max, rel=1e-8)

    def test_constrained_true_when_very_low_H_max(self):
        r = _run(self_weight=SW, initial_sag=0.15, support_h_max=50.0)
        assert r['constrained_by_H_max'] is True

    def test_constrained_false_when_H_max_not_binding(self):
        r = _run(self_weight=SW, initial_sag=0.15, support_h_max=1e8)
        assert r['constrained_by_H_max'] is False

    def test_H_max_in_results(self):
        h_max = 500.0
        r = _run(self_weight=SW, support_h_max=h_max)
        assert r['H_max'] == pytest.approx(h_max)


# ---------------------------------------------------------------------------
# support_k_h parameter
# ---------------------------------------------------------------------------

class TestSupportKH:

    def test_delta_h_zero_without_k_h(self):
        r = _run(self_weight=SW)
        assert r['delta_h'] == pytest.approx(0.0)

    def test_delta_h_equals_H_times_L_over_K_h(self):
        k_h = 50000.0
        r = _run(self_weight=SW, support_k_h=k_h)
        expected = r['H'] * L / k_h
        assert r['delta_h'] == pytest.approx(expected, rel=1e-6)

    def test_delta_h_positive_when_k_h_set(self):
        r = _run(self_weight=SW, support_k_h=50000.0)
        assert r['delta_h'] > 0.0

    def test_larger_k_h_gives_smaller_delta_h(self):
        r_soft = _run(self_weight=SW, support_k_h=10000.0)
        r_stiff = _run(self_weight=SW, support_k_h=100000.0)
        assert r_soft['delta_h'] > r_stiff['delta_h']


# ---------------------------------------------------------------------------
# Both h_max and k_h together
# ---------------------------------------------------------------------------

class TestHMaxAndKH:

    def test_combined_H_below_H_max(self):
        r = _run(self_weight=SW, support_h_max=500.0, support_k_h=50000.0)
        assert r['H'] <= 500.0 + 1e-6

    def test_combined_delta_h_uses_actual_H(self):
        k_h = 50000.0
        r = _run(self_weight=SW, support_h_max=500.0, support_k_h=k_h)
        assert r['delta_h'] == pytest.approx(r['H'] * L / k_h, rel=1e-6)


# ---------------------------------------------------------------------------
# Fixed point method also works with new params
# ---------------------------------------------------------------------------

class TestFixedPointMethod:

    def test_fixed_point_with_self_weight(self):
        r = _run(self_weight=SW, initial_sag=0.25, method='fixed_point')
        assert r['converged'] is True
        assert r['has_initial_sag'] is True
        assert r['f_initial'] == pytest.approx(0.25, rel=1e-3)

    def test_fixed_point_with_h_max(self):
        r = _run(self_weight=SW, support_h_max=500.0, method='fixed_point')
        assert r['H'] <= 500.0 + 1e-6

    def test_fixed_point_returns_history(self):
        r = _run(self_weight=SW, method='fixed_point')
        assert r['history'] is not None
        assert 'iteration' in r['history']


# ---------------------------------------------------------------------------
# Array shapes
# ---------------------------------------------------------------------------

class TestArrayShapes:

    def test_x_and_y_same_length(self):
        r = _run(self_weight=SW)
        assert len(r['x']) == len(r['y'])

    def test_y_initial_same_length_as_x(self):
        r = _run(self_weight=SW, initial_sag=0.25)
        assert len(r['y_initial']) == len(r['x'])

    def test_T_same_length_as_x(self):
        r = _run()
        assert len(r['T']) == len(r['x'])

    def test_stress_dist_same_length_as_x(self):
        r = _run()
        assert len(r['stress_dist']) == len(r['x'])


# ---------------------------------------------------------------------------
# Cross-check: run_analysis vs direct CableAnalysis
# ---------------------------------------------------------------------------

class TestCrossCheck:

    def test_H_matches_direct_call(self):
        """run_analysis must give same H as calling CableAnalysis directly."""
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                           self_weight=SW, support_h_max=500.0)
        ca.add_point_load(5.0, 100.0)
        direct = ca.solve(initial_sag=0.15)

        r = _run(self_weight=SW, initial_sag=0.15, support_h_max=500.0)
        assert r['H'] == pytest.approx(direct['H'], rel=1e-5)

    def test_f_matches_direct_call(self):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                           self_weight=SW)
        ca.add_point_load(5.0, 100.0)
        direct = ca.solve(initial_sag=0.25)

        r = _run(self_weight=SW, initial_sag=0.25)
        assert r['f'] == pytest.approx(direct['f'], rel=1e-5)

    def test_delta_h_matches_direct_call(self):
        k_h = 50000.0
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                           self_weight=SW, support_k_h=k_h)
        ca.add_point_load(5.0, 100.0)
        direct = ca.solve(initial_sag=0.25)

        r = _run(self_weight=SW, initial_sag=0.25, support_k_h=k_h)
        assert r['delta_h'] == pytest.approx(direct['delta_h'], rel=1e-5)
