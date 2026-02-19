"""
Tests for support constraint features:
  - _horizontal_displacement(H): δ_h = H*L/K_h
  - _solve_with_H_limit(P, H_max): H ≤ H_max enforcement
  - H_utilization and constrained_by_H_max in results
"""
import numpy as np
import pytest
from conftest import CableAnalysis, L, A_EFF, E_MOD, SW


class TestHorizontalDisplacement:

    def _make_cable(self, k_h=None, h_max=None):
        return CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                             self_weight=SW,
                             support_k_h=k_h, support_h_max=h_max)

    def test_zero_when_no_k_h(self):
        """Without K_h, horizontal displacement must be zero."""
        ca = self._make_cable()
        assert ca._horizontal_displacement(H=500.0) == pytest.approx(0.0)

    def test_zero_when_k_h_is_none(self):
        ca = self._make_cable(k_h=None)
        assert ca._horizontal_displacement(H=300.0) == pytest.approx(0.0)

    def test_formula_delta_h_equals_H_times_L_over_K_h(self):
        """δ_h = H * L / K_h"""
        K_h = 50000.0  # kN/m
        H = 350.0      # kN
        ca = self._make_cable(k_h=K_h)
        expected = H * L / K_h
        assert ca._horizontal_displacement(H=H) == pytest.approx(expected, rel=1e-10)

    def test_displacement_scales_linearly_with_H(self):
        K_h = 20000.0
        ca = self._make_cable(k_h=K_h)
        d1 = ca._horizontal_displacement(H=100.0)
        d2 = ca._horizontal_displacement(H=200.0)
        assert d2 == pytest.approx(2 * d1, rel=1e-10)

    def test_larger_K_h_gives_smaller_displacement(self):
        ca_soft = self._make_cable(k_h=10000.0)
        ca_stiff = self._make_cable(k_h=100000.0)
        d_soft = ca_soft._horizontal_displacement(H=300.0)
        d_stiff = ca_stiff._horizontal_displacement(H=300.0)
        assert d_soft > d_stiff

    def test_delta_h_in_results_when_k_h_active(self):
        """delta_h result field must equal H*L/K_h."""
        K_h = 50000.0
        ca = self._make_cable(k_h=K_h)
        ca.add_point_load(5.0, 100.0)
        results = ca.solve(initial_sag=0.15)
        H = results['H']
        expected = H * L / K_h
        assert results['delta_h'] == pytest.approx(expected, rel=1e-6)

    def test_delta_h_zero_in_results_without_k_h(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 100.0)
        results = ca.solve(initial_sag=0.15)
        assert results['delta_h'] == pytest.approx(0.0)


class TestHMaxConstraint:

    def _solve_with_hmax(self, h_max, k_h=None):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                           self_weight=SW, support_h_max=h_max, support_k_h=k_h)
        ca.add_point_load(5.0, 100.0)
        return ca.solve(initial_sag=0.15)

    # ------------------------------------------------------------------
    # H never exceeds H_max
    # ------------------------------------------------------------------

    def test_H_does_not_exceed_H_max_moderate(self):
        results = self._solve_with_hmax(h_max=500.0)
        assert results['H'] <= 500.0 + 1e-6

    def test_H_does_not_exceed_H_max_tight(self):
        """Very low H_max = 100 kN should be respected within solver tolerance (0.2%)."""
        results = self._solve_with_hmax(h_max=100.0)
        assert results['H'] <= 100.0 * 1.002  # allow small solver overshoot

    # ------------------------------------------------------------------
    # H_utilization
    # ------------------------------------------------------------------

    def test_H_utilization_is_H_over_H_max(self):
        h_max = 500.0
        results = self._solve_with_hmax(h_max=h_max)
        expected = results['H'] / h_max
        assert results['H_utilization'] == pytest.approx(expected, rel=1e-8)

    def test_H_utilization_between_0_and_1(self):
        results = self._solve_with_hmax(h_max=500.0)
        assert 0.0 <= results['H_utilization'] <= 1.0 + 1e-6

    def test_H_utilization_zero_without_H_max(self):
        """Without H_max the utilization should be 0."""
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD, self_weight=SW)
        ca.add_point_load(5.0, 100.0)
        results = ca.solve(initial_sag=0.25)
        assert results['H_utilization'] == pytest.approx(0.0)

    # ------------------------------------------------------------------
    # constrained_by_H_max flag
    # ------------------------------------------------------------------

    def test_constrained_flag_true_when_H_max_binding(self):
        """Very low H_max should force cable to be constrained."""
        results = self._solve_with_hmax(h_max=50.0)
        assert results['constrained_by_H_max'] is True

    def test_constrained_flag_false_when_H_max_not_binding(self):
        """Very large H_max should not constrain the solution."""
        results = self._solve_with_hmax(h_max=1e7)
        assert results['constrained_by_H_max'] is False

    # ------------------------------------------------------------------
    # Constrained solution has larger sag than unconstrained
    # ------------------------------------------------------------------

    def test_constrained_has_larger_sag_than_unconstrained(self):
        """Limiting H forces more sag."""
        ca_free = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD, self_weight=SW)
        ca_free.add_point_load(5.0, 100.0)
        r_free = ca_free.solve(initial_sag=0.15)

        r_constrained = self._solve_with_hmax(h_max=100.0)
        assert r_constrained['f'] > r_free['f']

    # ------------------------------------------------------------------
    # H_max stored in results
    # ------------------------------------------------------------------

    def test_H_max_in_results(self):
        h_max = 500.0
        results = self._solve_with_hmax(h_max=h_max)
        assert results['H_max'] == pytest.approx(h_max)

    def test_H_max_none_in_results_when_unconstrained(self):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD, self_weight=SW)
        ca.add_point_load(5.0, 100.0)
        results = ca.solve(initial_sag=0.25)
        assert results['H_max'] is None

    # ------------------------------------------------------------------
    # H_max with K_h — displacement still computed correctly
    # ------------------------------------------------------------------

    def test_hmax_and_k_h_together(self):
        K_h = 50000.0
        h_max = 500.0
        results = self._solve_with_hmax(h_max=h_max, k_h=K_h)
        H = results['H']
        assert H <= h_max + 1e-6
        expected_delta = H * L / K_h
        assert results['delta_h'] == pytest.approx(expected_delta, rel=1e-6)


class TestSolveWithHLimit:
    """Direct tests of _solve_with_H_limit(P, H_max)."""

    def _setup(self, h_max, k_h=None):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                           self_weight=SW, support_h_max=h_max, support_k_h=k_h)
        ca.add_point_load(5.0, 100.0)
        # Solve initial catenary first (required before H-limit solve)
        ca._solve_initial_catenary(f_target=0.15)
        P = ca._nodal_loads()
        return ca, P

    def test_returns_H_at_or_below_H_max(self):
        h_max = 400.0
        ca, P = self._setup(h_max)
        H_sol, constrained = ca._solve_with_H_limit(P, h_max)
        assert H_sol <= h_max + 1e-6

    def test_returns_bool_constrained(self):
        ca, P = self._setup(h_max=300.0)
        H_sol, constrained = ca._solve_with_H_limit(P, 300.0)
        assert isinstance(constrained, bool)

    def test_low_H_max_forces_H_to_H_max(self):
        """Very low H_max → solver should return H_max (binding constraint)."""
        h_max = 30.0  # very tight
        ca, P = self._setup(h_max)
        H_sol, _ = ca._solve_with_H_limit(P, h_max)
        # Either exactly H_max or close to it
        assert H_sol == pytest.approx(h_max, rel=0.02)
