"""
Pry-out failure in shear

Standard: EC2-4-2 Section 6.3.4
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties

# Import concrete cone calculation (pry-out is related to cone capacity)
from failure_modes.tension.concrete_cone import concrete_cone_failure


def pryout_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None
) -> float:
    """
    Calculate characteristic pry-out failure resistance in shear

    Pry-out failure occurs when a shear load causes a concrete cone to form
    on the opposite side of the member (prying action). The capacity is
    related to the concrete cone capacity in tension.

    Formula:
        VRk,cp = k × NRk,c

    where:
        k = factor relating shear to tension capacity (typically 1.0 or 2.0)
        NRk,c = concrete cone capacity in tension

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        group: Optional FastenerGroup
        edge_distance: Optional edge distance [mm]

    Returns:
        VRk_cp: Characteristic pry-out resistance [N]

    Standard: EC2-4-2 Section 6.3.4

    Notes:
        - Pry-out forms a cone on the back side of concrete
        - k factor typically = 1.0 for single fasteners
        - k factor typically = 2.0 for groups (more complex behavior)
        - Only relevant for thick concrete members (h > hef)
        - For design: VRd,cp = VRk,cp / γMc

    Example:
        >>> from fastener_design import Fastener, ConcreteProperties
        >>> fastener = Fastener(16, 100, 500)
        >>> concrete = ConcreteProperties(strength_class='C25/30', thickness=200)
        >>> VRk_cp = pryout_failure(fastener, concrete)
    """
    # Calculate concrete cone capacity (tension)
    NRk_c = concrete_cone_failure(
        fastener,
        concrete,
        group,
        edge_distance,
        eccentricity=0.0
    )

    # Determine k factor
    # Single fastener: k = 1.0
    # Group: k = 2.0 (more complex stress distribution)
    if group is None or group.n_fasteners == 1:
        k = 1.0
    else:
        k = 2.0

    # Calculate pry-out capacity
    VRk_cp = k * NRk_c

    return VRk_cp


def get_pryout_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None
) -> dict:
    """
    Get detailed information about pry-out capacity

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        group: Optional FastenerGroup
        edge_distance: Optional edge distance [mm]

    Returns:
        Dictionary with capacity details for UI display

    Useful for reporting and interface display
    """
    VRk_cp = pryout_failure(fastener, concrete, group, edge_distance)

    # Calculate NRk,c for reference
    NRk_c = concrete_cone_failure(
        fastener, concrete, group, edge_distance, eccentricity=0.0
    )

    # Determine k factor
    k = 1.0 if (group is None or group.n_fasteners == 1) else 2.0

    return {
        'VRk_cp': VRk_cp,
        'VRk_cp_kN': VRk_cp / 1000,
        'NRk_c': NRk_c,
        'NRk_c_kN': NRk_c / 1000,
        'k_factor': k,
        'is_group': group is not None and group.n_fasteners > 1,
        'failure_mode': 'Pry-out failure (shear)',
        'standard_ref': 'EC2-4-2 Section 6.3.4',
        'formula': f'VRk,cp = {k} × NRk,c',
        'note': 'Pry-out forms concrete cone on back side under shear loading'
    }
