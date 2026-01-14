"""
Geometry calculations for projected areas and spacing effects
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup


def calculate_area_ratio_cone(
    fastener: Fastener,
    group: FastenerGroup = None,
    edge_distances: dict = None
) -> float:
    """
    Calculate projected area ratio Ac,N / Ac,N⁰ for concrete cone failure

    Ac,N⁰ = scr,N² = (3×hef)² = 9×hef²  (reference area, single fastener)
    Ac,N = actual projected area considering spacing and edges

    Args:
        fastener: Fastener object
        group: Optional FastenerGroup
        edge_distances: Optional dict with edge distances {'c1': ..., 'c2': ...}

    Returns:
        area_ratio: Ac,N / Ac,N⁰

    Standard: EC2-4-2 Section 6.2.5.2, Figures 3 and 4
    """
    if group is not None:
        # Use group's method
        Ac_N, Ac_N0 = group.calculate_projected_area_cone()
        return Ac_N / Ac_N0

    # Single fastener
    scr_N = fastener.get_characteristic_spacing()  # 3 × hef
    ccr_N = fastener.get_characteristic_edge_distance()  # 1.5 × hef

    Ac_N0 = scr_N ** 2  # 9 × hef²

    # Check for edge effects
    if edge_distances is not None:
        c1 = edge_distances.get('c1', float('inf'))
        c2 = edge_distances.get('c2', float('inf'))

        # Simplified calculation for single fastener with edges
        # Full area if no edge effects
        if c1 >= ccr_N and c2 >= ccr_N:
            Ac_N = Ac_N0
        else:
            # Reduced area due to edges
            # Simplified: actual implementation needs figures from standard
            width = min(2 * ccr_N, ccr_N + c2)
            length = min(2 * ccr_N, ccr_N + c1)
            Ac_N = width * length
    else:
        # No edge effects
        Ac_N = Ac_N0

    return Ac_N / Ac_N0


def calculate_area_ratio_edge(
    fastener: Fastener,
    edge_distance: float,
    group: FastenerGroup = None
) -> float:
    """
    Calculate projected area ratio Ac,V / Ac,V⁰ for concrete edge failure

    Ac,V⁰ = 4.5 × c1²  (reference area for single fastener)
    Ac,V = actual projected area considering fastener spacing

    Args:
        fastener: Fastener object
        edge_distance: Edge distance c1 parallel to load [mm]
        group: Optional FastenerGroup for multiple fasteners

    Returns:
        area_ratio: Ac,V / Ac,V⁰

    Standard: EC2-4-2 Section 6.3.5.2.2
    """
    # Reference area for single fastener
    Ac_V0 = 4.5 * edge_distance ** 2

    if group is None or group.n_fasteners == 1:
        # Single fastener
        Ac_V = Ac_V0
    else:
        # Multiple fasteners
        # Simplified calculation (full implementation would use standard figures)
        # Assume linear array parallel to edge
        if group.n_cols > 1:
            # Fasteners along edge
            total_width = 1.5 * edge_distance + (group.n_cols - 1) * group.s_x
            Ac_V = total_width * 3.0 * edge_distance
        else:
            # Single column
            Ac_V = Ac_V0

    return Ac_V / Ac_V0
