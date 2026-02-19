"""
Tests for _total_shape(H, P) and _additional_deflection(H, P)

Physics:
  total_shape = initial_catenary + additional_deflection_from_loads
  additional_deflection = double integration of load / H, with boundary correction
"""
import numpy as np
import pytest
from conftest import CableAnalysis, L, A_EFF, E_MOD, SW


class TestSuperposition:

    def _make_cable(self, self_weight=0.0):
        return CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                             self_weight=self_weight)

    # ------------------------------------------------------------------
    # Boundary conditions: total shape must be zero at both supports
    # ------------------------------------------------------------------

    def test_total_shape_zero_at_left_support_no_initial(self):
        ca = self._make_cable()
        P = ca._nodal_loads()
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y = ca._total_shape(H=500.0, P=P)
        assert y[0] == pytest.approx(0.0, abs=1e-8)

    def test_total_shape_zero_at_right_support_no_initial(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y = ca._total_shape(H=500.0, P=P)
        assert y[-1] == pytest.approx(0.0, abs=1e-8)

    def test_total_shape_zero_at_left_support_with_initial(self):
        """With initial catenary, total shape boundary at x=0 still zero."""
        ca = self._make_cable(self_weight=SW)
        ca._solve_initial_catenary(f_target=0.25)
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y = ca._total_shape(H=500.0, P=P)
        assert y[0] == pytest.approx(0.0, abs=1e-6)

    def test_total_shape_zero_at_right_support_with_initial(self):
        ca = self._make_cable(self_weight=SW)
        ca._solve_initial_catenary(f_target=0.25)
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y = ca._total_shape(H=500.0, P=P)
        assert y[-1] == pytest.approx(0.0, abs=1e-6)

    # ------------------------------------------------------------------
    # Superposition: total = initial + additional
    # ------------------------------------------------------------------

    def test_total_equals_initial_plus_additional(self):
        """y_total must exactly equal y_initial + y_additional."""
        ca = self._make_cable(self_weight=SW)
        ca._solve_initial_catenary(f_target=0.25)
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        H = 400.0
        y_total = ca._total_shape(H=H, P=P)
        y_add = ca._additional_deflection(H=H, P=P)
        np.testing.assert_allclose(y_total, ca.y_initial + y_add, atol=1e-12)

    def test_total_shape_without_initial_equals_additional(self):
        """Without self-weight, total shape is purely additional deflection."""
        ca = self._make_cable()
        ca.y_initial = np.zeros(ca.n_nodes)
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        H = 400.0
        y_total = ca._total_shape(H=H, P=P)
        y_add = ca._additional_deflection(H=H, P=P)
        np.testing.assert_allclose(y_total, y_add, atol=1e-12)

    # ------------------------------------------------------------------
    # Adding initial catenary always increases or maintains sag
    # ------------------------------------------------------------------

    def test_initial_catenary_increases_total_sag(self):
        """
        A cable with initial sag (self-weight) should have greater total sag
        than the same cable without initial shape, given the same H and P.
        """
        ca_no_sw = self._make_cable()
        ca_no_sw.y_initial = np.zeros(ca_no_sw.n_nodes)

        ca_sw = self._make_cable(self_weight=SW)
        ca_sw._solve_initial_catenary(f_target=0.20)

        for ca in (ca_no_sw, ca_sw):
            ca.add_point_load(5.0, 100.0)

        H = 500.0
        P_no_sw = ca_no_sw._nodal_loads()
        P_sw = ca_sw._nodal_loads()

        f_no_sw = float(np.max(ca_no_sw._total_shape(H, P_no_sw)))
        f_sw = float(np.max(ca_sw._total_shape(H, P_sw)))

        assert f_sw > f_no_sw

    # ------------------------------------------------------------------
    # Additional deflection is positive for downward loads
    # ------------------------------------------------------------------

    def test_additional_deflection_positive_for_downward_load(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y_add = ca._additional_deflection(H=300.0, P=P)
        assert float(np.max(y_add)) > 0.0

    def test_additional_deflection_boundary_conditions(self):
        """Additional deflection from double-integration must satisfy y(0)=y(L)=0."""
        ca = self._make_cable()
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        y_add = ca._additional_deflection(H=300.0, P=P)
        assert y_add[0] == pytest.approx(0.0, abs=1e-8)
        assert y_add[-1] == pytest.approx(0.0, abs=1e-8)

    # ------------------------------------------------------------------
    # Larger H → smaller additional deflection
    # ------------------------------------------------------------------

    def test_larger_H_reduces_additional_deflection(self):
        ca = self._make_cable()
        ca.add_point_load(5.0, 100.0)
        P = ca._nodal_loads()
        f1 = float(np.max(ca._additional_deflection(H=200.0, P=P)))
        f2 = float(np.max(ca._additional_deflection(H=800.0, P=P)))
        assert f1 > f2

    # ------------------------------------------------------------------
    # Symmetric load → symmetric total shape
    # ------------------------------------------------------------------

    def test_symmetric_load_gives_symmetric_shape(self):
        ca = self._make_cable()
        ca.add_point_load(L / 2, 100.0)  # midspan point load
        P = ca._nodal_loads()
        y = ca._total_shape(H=400.0, P=P)
        np.testing.assert_allclose(y, y[::-1], atol=1e-8)
