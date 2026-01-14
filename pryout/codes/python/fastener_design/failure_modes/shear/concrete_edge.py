"""
Concrete edge failure in shear

Standard: EC2-4-2 Section 6.3.5
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties
from calculations.psi_factors import (
    calculate_psi_h_V,
    calculate_psi_ec_V,
    calculate_psi_alpha_V,
    get_all_psi_factors_shear
)
from calculations.geometry import calculate_area_ratio_edge


def concrete_edge_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float,
    group: FastenerGroup = None,
    eccentricity: float = 0.0,
    load_angle: float = 0.0
) -> float:
    """
    Calculate characteristic resistance for concrete edge failure in shear

    Formula:
        VRk,c = VRk,c⁰ × (Ac,V / Ac,V⁰) × ψs,V × ψh,V × ψec,V × ψα,V × ψre,V

    where:
        VRk,c⁰ = k × d_nom^α × √fck,cube × c1^1.5  [N]
        c1 = edge distance parallel to load direction [mm]
        Ac,V / Ac,V⁰ = projected area ratio
        ψh,V = member thickness factor
        ψec,V = eccentricity factor
        ψα,V = load direction factor

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Edge distance c1 parallel to load [mm]
        group: Optional FastenerGroup
        eccentricity: Load eccentricity [mm]
        load_angle: Angle between load and perpendicular to edge [degrees]
                   0° = load towards edge (most critical)
                   90° = load parallel to edge

    Returns:
        VRk_c: Characteristic resistance for edge failure [N]

    Standard: EC2-4-2 Section 6.3.5
    Formulas: Section 6.3.5.2.1 (base resistance)

    Notes:
        - Most critical when load is perpendicular to edge (α = 0°)
        - k factor typically 1.7 to 2.4 (from ETS)
        - For design: VRd,c = VRk,c / γMc (γMc typically 1.5)
        - Edge distance c1 is parallel to load direction

    Example:
        >>> from fastener_design import Fastener, ConcreteProperties
        >>> fastener = Fastener(16, 100, 500)
        >>> concrete = ConcreteProperties('C25/30', 200, cracked=True)
        >>> VRk_c = concrete_edge_failure(fastener, concrete, edge_distance=150)
        >>> print(f"Edge capacity: {VRk_c/1000:.1f} kN")
    """
    # Step 1: Calculate base resistance VRk,c⁰
    # Simplified formula (full formula from EC2-4-2 Section 6.3.5.2.1)
    # VRk,c⁰ ≈ k × d^α × √fck,cube × c1^1.5

    # Conservative k-factor (actual value from ETS)
    k = 2.0  # Typical for headed fasteners
    d_nom_alpha = fastener.d ** 0.2  # Diameter effect (simplified exponent)

    VRk_c0 = k * d_nom_alpha * (concrete.fck_cube ** 0.5) * (edge_distance ** 1.5)

    # Step 2: Calculate projected area ratio
    area_ratio = calculate_area_ratio_edge(fastener, edge_distance, group)

    # Step 3: Calculate ψ factors
    psi_h_V = calculate_psi_h_V(concrete, fastener, edge_distance)
    psi_ec_V = calculate_psi_ec_V(eccentricity, edge_distance)
    psi_alpha_V = calculate_psi_alpha_V(load_angle)

    # ψs,V (spacing effect) - simplified as 1.0 for single fastener
    psi_s_V = 1.0 if group is None else 0.7  # Simplified reduction for groups

    # ψre,V (reinforcement effect) - assume no supplementary reinforcement
    psi_re_V = 1.0

    # Step 4: Calculate final resistance
    VRk_c = VRk_c0 * area_ratio * psi_s_V * psi_h_V * psi_ec_V * psi_alpha_V * psi_re_V

    return VRk_c


def get_concrete_edge_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float,
    group: FastenerGroup = None,
    eccentricity: float = 0.0,
    load_angle: float = 0.0
) -> dict:
    """
    Get detailed information about concrete edge capacity

    Returns all intermediate values for UI display and reporting.

    Args:
        Same as concrete_edge_failure()

    Returns:
        Dictionary with:
            - 'VRk_c': Final characteristic resistance [N]
            - 'VRk_c_kN': Resistance in kN
            - 'VRk_c0': Base resistance [N]
            - 'edge_distance': c1 value [mm]
            - 'area_ratio': Ac,V / Ac,V⁰
            - 'psi_factors': Dictionary of all ψ factors
            - 'load_angle': Load angle [degrees]
            - 'failure_mode': Description
            - 'standard_ref': Standard reference

    Useful for reporting and UI display
    """
    # Calculate capacity
    VRk_c = concrete_edge_failure(
        fastener, concrete, edge_distance, group, eccentricity, load_angle
    )

    # Calculate intermediate values
    k = 2.0
    d_nom_alpha = fastener.d ** 0.2
    VRk_c0 = k * d_nom_alpha * (concrete.fck_cube ** 0.5) * (edge_distance ** 1.5)

    # Area ratio
    area_ratio = calculate_area_ratio_edge(fastener, edge_distance, group)

    # Get psi factors
    psi_factors = get_all_psi_factors_shear(
        fastener, concrete, edge_distance, eccentricity, load_angle
    )
    psi_factors['psi_s_V'] = 1.0 if group is None else 0.7
    psi_factors['psi_re_V'] = 1.0

    return {
        'VRk_c': VRk_c,
        'VRk_c_kN': VRk_c / 1000,
        'VRk_c0': VRk_c0,
        'VRk_c0_kN': VRk_c0 / 1000,
        'k_factor': k,
        'edge_distance': edge_distance,
        'fck_cube': concrete.fck_cube,
        'area_ratio': area_ratio,
        'psi_factors': psi_factors,
        'psi_product': (
            psi_factors['psi_h_V'] *
            psi_factors['psi_ec_V'] *
            psi_factors['psi_alpha_V'] *
            psi_factors['psi_s_V'] *
            psi_factors['psi_re_V']
        ),
        'load_angle': load_angle,
        'eccentricity': eccentricity,
        'failure_mode': 'Concrete edge failure (shear)',
        'standard_ref': 'EC2-4-2 Section 6.3.5',
        'formula': 'VRk,c = VRk,c⁰ × (Ac,V/Ac,V⁰) × ψh,V × ψec,V × ψα,V'
    }
