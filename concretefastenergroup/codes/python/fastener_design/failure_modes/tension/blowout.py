"""
Blow-out failure in tension

Standard: EC2-4-2 Section 6.2.7
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties


def blowout_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float,
    group: FastenerGroup = None
) -> float:
    """
    Calculate characteristic blow-out failure resistance

    Blow-out occurs when fasteners are close to an edge with deep embedment,
    causing concrete to spall on the side face at the level of the head
    (not at the top surface).

    Typically occurs when:
        - Small edge distance (c < 0.5 × hef)
        - Deep embedment (hef > h)

    Formula (simplified):
        NRk,cb = k_cb × c^1.5 × √fck × (1 + s/c) for edge fastener

    where:
        k_cb = empirical factor
        c = edge distance parallel to edge [mm]
        s = spacing along edge [mm]
        fck = concrete strength [N/mm²]

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Edge distance c [mm]
        group: Optional FastenerGroup

    Returns:
        NRk_cb: Characteristic blow-out resistance [N]

    Standard: EC2-4-2 Section 6.2.7
    Formulas: Lines 658-779 in FASTENER_DESIGN_SPEC.md

    Notes:
        - Only relevant when c < 0.5 × hef AND hef large
        - If conditions not met, blow-out does not govern
        - For design: NRd,cb = NRk,cb / γMc

    Example:
        >>> fastener = Fastener(16, 120, 500)
        >>> concrete = ConcreteProperties(strength_class='C25/30', thickness=150)
        >>> NRk_cb = blowout_failure(fastener, concrete, edge_distance=50)
    """
    # Check if blow-out is relevant
    # Blow-out typically only when c < 0.5 × hef
    if edge_distance >= 0.5 * fastener.hef:
        # Blow-out not critical - return high value
        return 1e9

    # Empirical factor (from European Technical Specification)
    k_cb = 8.0  # Typical value

    # Spacing effect
    if group and group.n_fasteners > 1:
        spacing = group.get_max_spacing()
        spacing_factor = 1.0 + spacing / edge_distance
    else:
        spacing_factor = 1.0

    # Calculate blow-out capacity
    # Simplified formula based on edge distance and concrete strength
    NRk_cb0 = k_cb * (edge_distance ** 1.5) * (concrete.fck ** 0.5)

    # Apply spacing effect
    NRk_cb = NRk_cb0 * spacing_factor

    # Geometric effects (simplified)
    # If member is thin relative to embedment, reduction applies
    if concrete.h < fastener.hef:
        thickness_reduction = concrete.h / fastener.hef
        NRk_cb *= thickness_reduction

    return NRk_cb


def check_blowout_relevance(
    fastener: Fastener,
    edge_distance: float
) -> dict:
    """
    Check if blow-out failure mode is relevant

    Blow-out is typically only relevant when:
        1. Edge distance c < 0.5 × hef  (close to edge)
        2. Deep embedment relative to edge distance

    Args:
        fastener: Fastener object
        edge_distance: Edge distance c [mm]

    Returns:
        Dictionary with:
            - 'relevant': Boolean - is blow-out relevant?
            - 'c_threshold': Threshold edge distance (0.5 × hef)
            - 'reason': Explanation
    """
    c_threshold = 0.5 * fastener.hef

    is_relevant = edge_distance < c_threshold

    if is_relevant:
        reason = f"Edge distance ({edge_distance}mm) < threshold ({c_threshold}mm). Blow-out must be checked."
    else:
        reason = f"Edge distance ({edge_distance}mm) ≥ threshold ({c_threshold}mm). Blow-out not critical."

    return {
        'relevant': is_relevant,
        'c_threshold': c_threshold,
        'c_actual': edge_distance,
        'hef': fastener.hef,
        'reason': reason
    }


def get_blowout_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float,
    group: FastenerGroup = None
) -> dict:
    """
    Get detailed information about blow-out capacity

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Edge distance [mm]
        group: Optional FastenerGroup

    Returns:
        Dictionary with capacity details and relevance check
    """
    NRk_cb = blowout_failure(fastener, concrete, edge_distance, group)

    relevance = check_blowout_relevance(fastener, edge_distance)

    return {
        'NRk_cb': NRk_cb,
        'NRk_cb_kN': NRk_cb / 1000,
        'is_relevant': relevance['relevant'],
        'edge_distance': edge_distance,
        'c_threshold': relevance['c_threshold'],
        'hef': fastener.hef,
        'h': concrete.h,
        'relevance_check': relevance,
        'failure_mode': 'Blow-out failure (tension)',
        'standard_ref': 'EC2-4-2 Section 6.2.7',
        'formula': 'NRk,cb = k_cb × c^1.5 × √fck × (1 + s/c)',
        'note': relevance['reason']
    }
