"""
Psi (ψ) modification factors for EC2 Part 4 fastener design

These factors account for various geometric and loading effects on capacity.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties


def calculate_psi_s_N(
    concrete: ConcreteProperties,
    fastener: Fastener,
    edge_distance: float = None
) -> float:
    """
    Calculate ψs,N - shell spalling factor for concrete cone failure

    This factor accounts for the effect of shallow concrete cover
    relative to embedment depth.

    Formula:
        ψs,N = 0.7 + 0.3 × c / ccr,N ≤ 1.0

    where:
        c = minimum edge distance [mm]
        ccr,N = 1.5 × hef (characteristic edge distance)

    Args:
        concrete: Concrete properties
        fastener: Fastener with embedment depth
        edge_distance: Minimum edge distance c [mm]
                      If None, assumes no edge effect (ψs,N = 1.0)

    Returns:
        ψs,N: Shell spalling factor (0.7 ≤ ψs,N ≤ 1.0)

    Standard: EC2-4-2 Section 6.2.5.4

    Notes:
        - Applies when c < ccr,N
        - Minimum value is 0.7
        - If c ≥ ccr,N, then ψs,N = 1.0 (no reduction)
    """
    if edge_distance is None:
        return 1.0

    ccr_N = fastener.get_characteristic_edge_distance()  # 1.5 × hef

    if edge_distance >= ccr_N:
        # No shell spalling effect
        return 1.0

    # Calculate factor
    psi_s_N = 0.7 + 0.3 * (edge_distance / ccr_N)

    # Ensure within valid range
    psi_s_N = max(0.7, min(1.0, psi_s_N))

    return psi_s_N


def calculate_psi_re_N(
    edge_distance: float,
    fastener: Fastener
) -> float:
    """
    Calculate ψre,N - edge effect factor for concrete cone failure

    This factor accounts for disturbance of stress distribution
    due to proximity to edges.

    Formula:
        ψre,N = 0.5 + c1 / ccr,N ≤ 1.0

    where:
        c1 = edge distance in direction towards edge [mm]
        ccr,N = 1.5 × hef

    Args:
        edge_distance: Edge distance c1 [mm]
        fastener: Fastener with embedment depth

    Returns:
        ψre,N: Edge effect factor (0.5 ≤ ψre,N ≤ 1.0)

    Standard: EC2-4-2 Section 6.2.5.3

    Notes:
        - Only applies when c1 < ccr,N
        - If c1 ≥ ccr,N, then ψre,N = 1.0 (no edge effect)
        - Minimum value is 0.5
    """
    ccr_N = fastener.get_characteristic_edge_distance()  # 1.5 × hef

    if edge_distance >= ccr_N:
        return 1.0

    psi_re_N = 0.5 + (edge_distance / ccr_N)

    # Ensure within range
    psi_re_N = max(0.5, min(1.0, psi_re_N))

    return psi_re_N


def calculate_psi_ec_N(
    eccentricity: float,
    group: FastenerGroup = None,
    fastener: Fastener = None
) -> float:
    """
    Calculate ψec,N - eccentricity factor for tension loading

    Accounts for eccentric loading on fastener groups.

    Formula:
        ψec,N = 1 / (1 + 2 × eN / scr,N) ≤ 1.0

    where:
        eN = load eccentricity [mm]
        scr,N = characteristic spacing = 3 × hef

    Args:
        eccentricity: Load eccentricity eN [mm]
        group: Optional FastenerGroup
        fastener: Optional Fastener (if no group)

    Returns:
        ψec,N: Eccentricity factor (≤ 1.0)

    Standard: EC2-4-2 Section 6.2.5.5

    Notes:
        - Only relevant for groups with eccentric loading
        - If eN = 0 (concentric), then ψec,N = 1.0
    """
    if eccentricity == 0:
        return 1.0

    # Get characteristic spacing
    if group is not None:
        scr_N = group.reference_fastener.get_characteristic_spacing()
    elif fastener is not None:
        scr_N = fastener.get_characteristic_spacing()
    else:
        raise ValueError("Must provide either group or fastener")

    psi_ec_N = 1.0 / (1.0 + 2.0 * eccentricity / scr_N)

    return min(1.0, psi_ec_N)


def calculate_psi_M_N(
    concrete: ConcreteProperties,
    fastener: Fastener
) -> float:
    """
    Calculate ψM,N - member thickness factor for tension

    Accounts for thin concrete members where cone cannot fully develop.

    Formula:
        ψM,N = h / (2 × hef) ≤ 1.0  (for h < 2 × hef)
        ψM,N = 1.0                   (for h ≥ 2 × hef)

    where:
        h = member thickness [mm]
        hef = effective embedment depth [mm]

    Args:
        concrete: ConcreteProperties with thickness h
        fastener: Fastener with embedment hef

    Returns:
        ψM,N: Member thickness factor (≤ 1.0)

    Standard: EC2-4-2 Section 6.2.5.7

    Notes:
        - Only applies for thin members (h < 2 × hef)
        - For thick members, full cone develops (ψM,N = 1.0)
    """
    if concrete.h >= 2.0 * fastener.hef:
        return 1.0

    psi_M_N = concrete.h / (2.0 * fastener.hef)

    return min(1.0, psi_M_N)


# Shear-specific psi factors

def calculate_psi_h_V(
    concrete: ConcreteProperties,
    fastener: Fastener,
    edge_distance: float
) -> float:
    """
    Calculate ψh,V - member thickness factor for shear (edge failure)

    Accounts for concrete member thickness effect on edge failure.

    Formula:
        ψh,V = (1.5 × c1 / h)^0.5 ≤ 1.0  (for h < 1.5 × c1)
        ψh,V = 1.0                        (for h ≥ 1.5 × c1)

    where:
        c1 = edge distance parallel to load [mm]
        h = member thickness [mm]

    Args:
        concrete: ConcreteProperties with thickness h
        fastener: Fastener object
        edge_distance: Edge distance c1 [mm]

    Returns:
        ψh,V: Thickness factor for shear (≤ 1.0)

    Standard: EC2-4-2 Section 6.3.5.2.4

    Notes:
        - Applies to concrete edge failure in shear
        - For thick members, no reduction (ψh,V = 1.0)
    """
    if concrete.h >= 1.5 * edge_distance:
        return 1.0

    psi_h_V = ((1.5 * edge_distance) / concrete.h) ** 0.5

    return min(1.0, psi_h_V)


def calculate_psi_ec_V(
    eccentricity: float,
    edge_distance: float
) -> float:
    """
    Calculate ψec,V - eccentricity factor for shear loading

    Accounts for load eccentricity in shear.

    Formula:
        ψec,V = 1 / (1 + 2 × eV / (3 × c1)) ≤ 1.0

    where:
        eV = load eccentricity in direction perpendicular to edge [mm]
        c1 = edge distance parallel to load [mm]

    Args:
        eccentricity: Load eccentricity eV [mm]
        edge_distance: Edge distance c1 [mm]

    Returns:
        ψec,V: Eccentricity factor for shear (≤ 1.0)

    Standard: EC2-4-2 Section 6.3.5.2.5

    Notes:
        - Only relevant when load is eccentric
        - If eV = 0, then ψec,V = 1.0
    """
    if eccentricity == 0:
        return 1.0

    psi_ec_V = 1.0 / (1.0 + 2.0 * eccentricity / (3.0 * edge_distance))

    return min(1.0, psi_ec_V)


def calculate_psi_alpha_V(load_angle: float) -> float:
    """
    Calculate ψα,V - load direction factor for shear

    Accounts for angle between load direction and edge.

    Formula:
        ψα,V = 1 / (cos(α) + 0.4×sin(α))  for 0° ≤ α ≤ 90°
        ψα,V = 1.0                         for α = 0° (towards edge)

    where:
        α = angle between shear load and perpendicular to edge [degrees]

    Args:
        load_angle: Angle α [degrees]
                   0° = load towards edge (most critical)
                   90° = load parallel to edge (less critical)

    Returns:
        ψα,V: Load direction factor

    Standard: EC2-4-2 Section 6.3.5.2.6

    Notes:
        - α = 0° is most critical (load towards edge)
        - α = 90° is least critical (load parallel to edge)
        - Factor increases capacity for non-perpendicular loads
    """
    import math

    if load_angle == 0:
        return 1.0

    # Convert to radians
    alpha_rad = math.radians(load_angle)

    # Calculate factor
    denominator = math.cos(alpha_rad) + 0.4 * math.sin(alpha_rad)

    if denominator > 0:
        psi_alpha_V = 1.0 / denominator
    else:
        psi_alpha_V = 1.0

    return psi_alpha_V


def get_all_psi_factors_tension(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float = None,
    eccentricity: float = 0.0,
    group: FastenerGroup = None
) -> dict:
    """
    Calculate all ψ factors for tension loading

    Useful for UI display and reporting.

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Edge distance [mm]
        eccentricity: Load eccentricity [mm]
        group: Optional fastener group

    Returns:
        Dictionary with all ψ factors:
            - 'psi_s_N': Shell spalling factor
            - 'psi_re_N': Edge effect factor
            - 'psi_ec_N': Eccentricity factor
            - 'psi_M_N': Member thickness factor
    """
    factors = {
        'psi_s_N': calculate_psi_s_N(concrete, fastener, edge_distance),
        'psi_re_N': calculate_psi_re_N(edge_distance, fastener) if edge_distance else 1.0,
        'psi_ec_N': calculate_psi_ec_N(eccentricity, group, fastener),
        'psi_M_N': calculate_psi_M_N(concrete, fastener)
    }

    return factors


def get_all_psi_factors_shear(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float,
    eccentricity: float = 0.0,
    load_angle: float = 0.0
) -> dict:
    """
    Calculate all ψ factors for shear loading

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Edge distance c1 [mm]
        eccentricity: Load eccentricity [mm]
        load_angle: Load angle relative to edge [degrees]

    Returns:
        Dictionary with all ψ factors for shear
    """
    factors = {
        'psi_h_V': calculate_psi_h_V(concrete, fastener, edge_distance),
        'psi_ec_V': calculate_psi_ec_V(eccentricity, edge_distance),
        'psi_alpha_V': calculate_psi_alpha_V(load_angle)
    }

    return factors
