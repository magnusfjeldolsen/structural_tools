"""
Tests for _solve_initial_catenary(f_target)

This method:
  - Finds H such that the catenary sag equals f_target under self-weight only
  - Stores the result in self.y_initial, self.H_initial, self.f_initial
  - Falls back to zeros when self_weight <= 0
"""
import numpy as np
import pytest
from conftest import CableAnalysis, L, A_EFF, E_MOD, SW


class TestInitialCatenary:

    def _make_cable(self, self_weight=SW):
        return CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                             self_weight=self_weight)

    # ------------------------------------------------------------------
    # No self-weight → zeros
    # ------------------------------------------------------------------

    def test_no_self_weight_sets_zeros(self):
        ca = self._make_cable(self_weight=0.0)
        ca._solve_initial_catenary(f_target=0.25)
        assert ca.H_initial == pytest.approx(0.0)
        assert ca.f_initial == pytest.approx(0.0)
        np.testing.assert_allclose(ca.y_initial, 0.0, atol=1e-12)

    # ------------------------------------------------------------------
    # Achieves target sag
    # ------------------------------------------------------------------

    def test_achieves_target_sag_025m(self):
        ca = self._make_cable()
        f_target = 0.25
        ca._solve_initial_catenary(f_target=f_target)
        assert ca.f_initial == pytest.approx(f_target, rel=1e-4)

    def test_achieves_target_sag_010m(self):
        ca = self._make_cable()
        f_target = 0.10
        ca._solve_initial_catenary(f_target=f_target)
        assert ca.f_initial == pytest.approx(f_target, rel=1e-4)

    def test_achieves_target_sag_050m(self):
        ca = self._make_cable()
        f_target = 0.50
        ca._solve_initial_catenary(f_target=f_target)
        assert ca.f_initial == pytest.approx(f_target, rel=1e-4)

    # ------------------------------------------------------------------
    # Stored state consistency
    # ------------------------------------------------------------------

    def test_y_initial_has_correct_length(self):
        ca = self._make_cable()
        ca._solve_initial_catenary(f_target=0.25)
        assert len(ca.y_initial) == ca.n_nodes

    def test_y_initial_boundary_conditions(self):
        """Initial shape must be zero at both supports."""
        ca = self._make_cable()
        ca._solve_initial_catenary(f_target=0.25)
        assert ca.y_initial[0] == pytest.approx(0.0, abs=1e-8)
        assert ca.y_initial[-1] == pytest.approx(0.0, abs=1e-8)

    def test_y_initial_max_equals_f_initial(self):
        """Max of y_initial array must match stored f_initial."""
        ca = self._make_cable()
        ca._solve_initial_catenary(f_target=0.25)
        assert float(np.max(ca.y_initial)) == pytest.approx(ca.f_initial, rel=1e-6)

    def test_H_initial_is_positive(self):
        ca = self._make_cable()
        ca._solve_initial_catenary(f_target=0.25)
        assert ca.H_initial > 0.0

    # ------------------------------------------------------------------
    # H_initial vs parabolic approximation
    # ------------------------------------------------------------------

    def test_H_initial_close_to_parabolic_estimate(self):
        """
        For small sag the initial H should be close to the parabolic estimate:
          H ≈ w * L² / (8 * f)
        Allow ±20% since catenary deviates from parabola.
        """
        ca = self._make_cable()
        f_target = 0.20
        ca._solve_initial_catenary(f_target=f_target)
        H_para = SW * L ** 2 / (8 * f_target)
        assert ca.H_initial == pytest.approx(H_para, rel=0.20)

    # ------------------------------------------------------------------
    # Larger target sag → smaller H_initial
    # ------------------------------------------------------------------

    def test_larger_sag_target_gives_smaller_H_initial(self):
        ca1 = self._make_cable()
        ca2 = self._make_cable()
        ca1._solve_initial_catenary(f_target=0.10)
        ca2._solve_initial_catenary(f_target=0.50)
        assert ca1.H_initial > ca2.H_initial

    # ------------------------------------------------------------------
    # Default sag (L/100) used by solve() when initial_sag=None
    # ------------------------------------------------------------------

    def test_default_sag_via_solve(self):
        """solve() with self_weight > 0 and initial_sag=None should use L/100."""
        ca = self._make_cable()
        ca.add_point_load(5.0, 50.0)
        results = ca.solve(initial_sag=None)
        expected_default = L / 100
        # f_initial should be close to L/100 (within solver tolerance)
        assert results['f_initial'] == pytest.approx(expected_default, rel=1e-3)

    def test_has_initial_sag_true_when_self_weight_given(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 50.0)
        results = ca.solve(initial_sag=0.25)
        assert results['has_initial_sag'] is True

    def test_has_initial_sag_false_when_no_self_weight(self):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD)
        ca.add_point_load(5.0, 50.0)
        results = ca.solve()
        assert results['has_initial_sag'] is False

    # ------------------------------------------------------------------
    # y_initial in results dict
    # ------------------------------------------------------------------

    def test_y_initial_in_results_when_self_weight(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 50.0)
        results = ca.solve(initial_sag=0.25)
        assert results['y_initial'] is not None
        assert len(results['y_initial']) == ca.n_nodes

    def test_y_initial_none_or_zeros_when_no_self_weight(self):
        ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD)
        ca.add_point_load(5.0, 50.0)
        results = ca.solve()
        # Either None or all-zeros list is acceptable
        if results['y_initial'] is not None:
            np.testing.assert_allclose(results['y_initial'], 0.0, atol=1e-10)
