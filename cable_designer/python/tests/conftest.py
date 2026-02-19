"""
Shared pytest fixtures for cable analyzer tests.

All internal units (as received by proposed_new_cable_analyzer.py):
  L          : m
  A_eff_m2   : m²   (e.g. 1200 mm² = 1200e-6 m²)
  E_kn_m2    : kN/m² (e.g. 200 000 MPa = 200 000 × 1000 = 2e8 kN/m²)
  self_weight: kN/m
  support_h_max: kN
  support_k_h  : kN/m
"""
import sys
import os
import pytest
import numpy as np

# Make proposed_new_cable_analyzer importable from the tests directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proposed_new_cable_analyzer import CableAnalysis, run_analysis


# ---------------------------------------------------------------------------
# Common parameter constants
# ---------------------------------------------------------------------------
L = 10.0           # m
A_EFF = 1200e-6    # m²  (1200 mm²)
E_MOD = 2e8        # kN/m²  (200 000 MPa)
SW = 0.5           # kN/m  self-weight


@pytest.fixture
def base_cable():
    """Bare cable — no self-weight, no support constraints."""
    ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD)
    ca.add_point_load(5.0, 100.0)
    return ca


@pytest.fixture
def sw_cable():
    """Cable with self-weight, unconstrained supports."""
    ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD, self_weight=SW)
    ca.add_point_load(5.0, 100.0)
    return ca


@pytest.fixture
def hmax_cable():
    """Cable with H_max = 500 kN, rigid supports."""
    ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                       self_weight=SW, support_h_max=500.0)
    ca.add_point_load(5.0, 100.0)
    return ca


@pytest.fixture
def flexible_cable():
    """Cable with H_max and K_h (flexible supports)."""
    ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                       self_weight=SW, support_h_max=500.0, support_k_h=50000.0)
    ca.add_point_load(5.0, 100.0)
    return ca


@pytest.fixture
def soft_anchor_cable():
    """Very low H_max — forces large sag."""
    ca = CableAnalysis(L=L, A_eff_m2=A_EFF, E_kn_m2=E_MOD,
                       self_weight=SW, support_h_max=100.0)
    ca.add_point_load(5.0, 100.0)
    return ca
