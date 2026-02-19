"""
Tests for _calculate_catenary_shape(H, w)

Physics: For a uniform horizontal load w [kN/m] and horizontal tension H:
  catenary parameter a = H / w
  y(x) = a * (cosh((x - L/2) / a) - 1) - y_offset
  max sag f = y(L/2)
  Boundary conditions: y(0) = y(L) = 0
"""
import numpy as np
import pytest
from conftest import CableAnalysis, L, A_EFF, E_MOD, SW


class TestCatenaryShape:

    def _make_cable(self, **kwargs):
        return CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD, **kwargs)

    # ------------------------------------------------------------------
    # Zero-weight edge cases
    # ------------------------------------------------------------------

    def test_zero_weight_returns_zero_array(self):
        """w=0 should return an all-zero shape with f=0."""
        ca = self._make_cable()
        y, f = ca._calculate_catenary_shape(H=500.0, w=0.0)
        assert f == pytest.approx(0.0)
        np.testing.assert_allclose(y, 0.0, atol=1e-12)

    def test_zero_H_returns_zero_array(self):
        """H=0 with w>0 should return zeros (degenerate case guarded)."""
        ca = self._make_cable(self_weight=SW)
        y, f = ca._calculate_catenary_shape(H=0.0, w=SW)
        assert f == pytest.approx(0.0)
        np.testing.assert_allclose(y, 0.0, atol=1e-12)

    # ------------------------------------------------------------------
    # Boundary conditions
    # ------------------------------------------------------------------

    def test_boundary_conditions_zero_at_supports(self):
        """y must be exactly 0 at both supports (x=0 and x=L)."""
        ca = self._make_cable(self_weight=SW)
        y, f = ca._calculate_catenary_shape(H=200.0, w=SW)
        assert y[0] == pytest.approx(0.0, abs=1e-10)
        assert y[-1] == pytest.approx(0.0, abs=1e-10)

    # ------------------------------------------------------------------
    # Symmetry
    # ------------------------------------------------------------------

    def test_catenary_is_symmetric_for_uniform_load(self):
        """Uniform self-weight → shape must be symmetric about midspan."""
        ca = self._make_cable(self_weight=SW)
        y, f = ca._calculate_catenary_shape(H=150.0, w=SW)
        np.testing.assert_allclose(y, y[::-1], atol=1e-10)

    def test_max_sag_at_midspan(self):
        """Max sag should occur at or very near x = L/2."""
        ca = self._make_cable(self_weight=SW)
        y, f = ca._calculate_catenary_shape(H=150.0, w=SW)
        idx_max = int(np.argmax(y))
        x_max = ca.x[idx_max]
        assert x_max == pytest.approx(L / 2, abs=ca.dx * 2)

    # ------------------------------------------------------------------
    # Monotone relationship: larger H → smaller sag
    # ------------------------------------------------------------------

    def test_larger_H_gives_smaller_sag(self):
        """Increasing horizontal tension must reduce sag."""
        ca = self._make_cable(self_weight=SW)
        _, f1 = ca._calculate_catenary_shape(H=100.0, w=SW)
        _, f2 = ca._calculate_catenary_shape(H=500.0, w=SW)
        assert f1 > f2

    # ------------------------------------------------------------------
    # Parabolic approximation (small sag limit)
    # ------------------------------------------------------------------

    def test_catenary_approaches_parabola_for_large_H(self):
        """
        For very large H (small a = H/w, small sag), catenary ≈ parabola.
        Parabolic sag: f_para = w*L² / (8*H)
        The relative error should be < 1% for H/w >> L.
        """
        ca = self._make_cable(self_weight=SW)
        H = 10000.0  # very large → small sag
        _, f_cat = ca._calculate_catenary_shape(H=H, w=SW)
        f_para = SW * L ** 2 / (8 * H)
        relative_error = abs(f_cat - f_para) / f_para
        assert relative_error < 0.01  # within 1%

    # ------------------------------------------------------------------
    # Sag scales as expected with w
    # ------------------------------------------------------------------

    def test_sag_scales_with_weight(self):
        """Doubling self-weight at same H should approximately double sag."""
        ca = self._make_cable(self_weight=SW)
        H = 300.0
        _, f1 = ca._calculate_catenary_shape(H=H, w=SW)
        _, f2 = ca._calculate_catenary_shape(H=H, w=SW * 2)
        # Not exact because catenary is nonlinear, but ratio should be close to 2
        assert 1.8 < (f2 / f1) < 2.2

    # ------------------------------------------------------------------
    # Return types
    # ------------------------------------------------------------------

    def test_returns_numpy_array_and_float(self):
        ca = self._make_cable(self_weight=SW)
        y, f = ca._calculate_catenary_shape(H=200.0, w=SW)
        assert isinstance(y, np.ndarray)
        assert isinstance(f, float)
        assert len(y) == ca.n_nodes
