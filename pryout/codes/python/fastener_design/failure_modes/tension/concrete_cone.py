"""
Concrete cone failure in tension

Standard: EC2-4-2 Section 6.2.5
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties
from calculations.psi_factors import (
    calculate_psi_s_N,
    calculate_psi_re_N,
    calculate_psi_ec_N,
    calculate_psi_M_N,
    get_all_psi_factors_tension
)
from calculations.geometry import calculate_area_ratio_cone


def concrete_cone_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None,
    eccentricity: float = 0.0
) -> float:
    """
    Calculate characteristic resistance for concrete cone failure in tension

    Formula:
        NRk,c = NRk,c⁰ × (Ac,N / Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N

    where:
        NRk,c⁰ = k × fck,cube^0.5 × hef^1.5  [N]
        k = kcr (cracked) or kucr (non-cracked)
        Ac,N / Ac,N⁰ = projected area ratio (spacing/edge effect)
        ψs,N = shell spalling factor
        ψre,N = edge effect factor
        ψec,N = eccentricity factor
        ψM,N = member thickness factor

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        group: Optional FastenerGroup for multiple fasteners
        edge_distance: Minimum edge distance [mm] (for edge effects)
        eccentricity: Load eccentricity [mm] (for group loading)

    Returns:
        NRk_c: Characteristic resistance for concrete cone failure [N]

    Standard: EC2-4-2 Section 6.2.5
    Formulas: (4), (5) cracked, (6) non-cracked

    Notes:
        - kcr = 8.5 for headed fasteners in cracked concrete (typical)
        - kucr = 11.9 for headed fasteners in non-cracked concrete (typical)
        - Actual values from European Technical Specification
        - For design: NRd,c = NRk,c / γMc (γMc typically 1.5)

    Example:
        >>> from fastener_design import Fastener, ConcreteProperties
        >>> fastener = Fastener(16, 100, 500)
        >>> concrete = ConcreteProperties('C25/30', 200, cracked=True)
        >>> NRk_c = concrete_cone_failure(fastener, concrete)
        >>> print(f"Cone capacity: {NRk_c/1000:.1f} kN")
    """
    # Step 1: Calculate base resistance NRk,c⁰
    k = concrete.get_k_factor()  # kcr or kucr depending on cracked state
    NRk_c0 = k * (concrete.fck_cube ** 0.5) * (fastener.hef ** 1.5)

    # Step 2: Calculate projected area ratio
    if group is not None:
        edge_dict = {
            'c1': group.c1 if group.c1 > 0 else None,
            'c2': group.c2 if group.c2 > 0 else None
        }
        area_ratio = calculate_area_ratio_cone(fastener, group, edge_dict)
    else:
        edge_dict = {'c1': edge_distance} if edge_distance else None
        area_ratio = calculate_area_ratio_cone(fastener, None, edge_dict)

    # Step 3: Calculate ψ factors
    psi_s_N = calculate_psi_s_N(concrete, fastener, edge_distance)
    psi_re_N = calculate_psi_re_N(edge_distance, fastener) if edge_distance else 1.0
    psi_ec_N = calculate_psi_ec_N(eccentricity, group, fastener)
    psi_M_N = calculate_psi_M_N(concrete, fastener)

    # Step 4: Calculate final resistance
    NRk_c = NRk_c0 * area_ratio * psi_s_N * psi_re_N * psi_ec_N * psi_M_N

    return NRk_c


def get_concrete_cone_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None,
    eccentricity: float = 0.0
) -> dict:
    """
    Get detailed information about concrete cone capacity

    Returns all intermediate values for UI display and reporting.

    Args:
        Same as concrete_cone_failure()

    Returns:
        Dictionary with:
            - 'NRk_c': Final characteristic resistance [N]
            - 'NRk_c_kN': Resistance in kN
            - 'NRk_c0': Base resistance [N]
            - 'k_factor': k value (kcr or kucr)
            - 'cracked': Concrete cracked state
            - 'area_ratio': Ac,N / Ac,N⁰
            - 'psi_factors': Dictionary of all ψ factors
            - 'failure_mode': Description
            - 'standard_ref': Standard reference

    Useful for detailed reporting and user interface display
    """
    # Calculate capacity
    NRk_c = concrete_cone_failure(fastener, concrete, group, edge_distance, eccentricity)

    # Calculate intermediate values
    k = concrete.get_k_factor()
    NRk_c0 = k * (concrete.fck_cube ** 0.5) * (fastener.hef ** 1.5)

    # Area ratio
    if group is not None:
        edge_dict = {'c1': group.c1 if group.c1 > 0 else None, 'c2': group.c2 if group.c2 > 0 else None}
        area_ratio = calculate_area_ratio_cone(fastener, group, edge_dict)
    else:
        edge_dict = {'c1': edge_distance} if edge_distance else None
        area_ratio = calculate_area_ratio_cone(fastener, None, edge_dict)

    # Get all psi factors
    psi_factors = get_all_psi_factors_tension(
        fastener, concrete, edge_distance, eccentricity, group
    )

    return {
        'NRk_c': NRk_c,
        'NRk_c_kN': NRk_c / 1000,
        'NRk_c0': NRk_c0,
        'NRk_c0_kN': NRk_c0 / 1000,
        'k_factor': k,
        'cracked': concrete.is_cracked(),
        'fck_cube': concrete.fck_cube,
        'hef': fastener.hef,
        'area_ratio': area_ratio,
        'psi_factors': psi_factors,
        'psi_product': (
            psi_factors['psi_s_N'] *
            psi_factors['psi_re_N'] *
            psi_factors['psi_ec_N'] *
            psi_factors['psi_M_N']
        ),
        'failure_mode': 'Concrete cone failure (tension)',
        'standard_ref': 'EC2-4-2 Section 6.2.5',
        'formula': 'NRk,c = NRk,c⁰ × (Ac,N/Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N'
    }
