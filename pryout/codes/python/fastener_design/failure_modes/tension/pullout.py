"""
Pull-out failure in tension

Standard: EC2-4-2 Section 6.2.4
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.concrete import ConcreteProperties


def pullout_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    n_fasteners: int = 1
) -> float:
    """
    Calculate characteristic pull-out failure resistance

    Pull-out occurs when the fastener pulls out of the concrete without
    developing the full concrete resistance. This depends on the head
    bearing area and concrete strength.

    Formula (simplified for headed fasteners):
        NRk,p = k_p × Ah × fck

    where:
        k_p = empirical factor (typically from ETS)
        Ah = bearing area of head [mm²]
        fck = characteristic concrete cylinder strength [N/mm²]

    Args:
        fastener: Fastener object (must have d_head for headed type)
        concrete: Concrete properties
        n_fasteners: Number of fasteners (default 1)

    Returns:
        NRk_p: Characteristic pull-out resistance [N]

    Standard: EC2-4-2 Section 6.2.4
    Reference: European Technical Specification for specific values

    Notes:
        - Pull-out capacity depends on head geometry
        - For headed fasteners: Ah ≈ π/4 × (dh² - d²)
        - k_p typically 8-12 (from ETS)
        - For design: NRd,p = NRk,p / γMc

    Example:
        >>> from fastener_design import Fastener, ConcreteProperties
        >>> fastener = Fastener(16, 100, 500, d_head=30)
        >>> concrete = ConcreteProperties(strength_class='C25/30', thickness=200)
        >>> NRk_p = pullout_failure(fastener, concrete)
    """
    # Check if fastener has head diameter
    if fastener.d_head is None:
        # Estimate head diameter if not provided
        # Typical ratio: dh ≈ 1.8 × d for headed fasteners
        d_head = 1.8 * fastener.d
    else:
        d_head = fastener.d_head

    # Calculate head bearing area
    import math
    Ah = (math.pi / 4.0) * (d_head ** 2 - fastener.d ** 2)

    # Empirical factor k_p (from European Technical Specification)
    # Typical value 8-12, using conservative 8.0
    k_p = 8.0

    # Calculate characteristic pull-out resistance
    NRk_p = k_p * Ah * concrete.fck

    # Multiple fasteners
    NRk_p_total = n_fasteners * NRk_p

    return NRk_p_total


def get_pullout_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties
) -> dict:
    """
    Get detailed information about pull-out capacity

    Args:
        fastener: Fastener object
        concrete: Concrete properties

    Returns:
        Dictionary with:
            - 'NRk_p': Characteristic resistance [N]
            - 'NRk_p_kN': Resistance in kN
            - 'Ah': Head bearing area [mm²]
            - 'd_head': Head diameter [mm]
            - 'k_p': k factor used
            - 'fck': Concrete strength [MPa]
            - 'failure_mode': Description
            - 'standard_ref': Standard reference

    Useful for UI display and reporting
    """
    NRk_p = pullout_failure(fastener, concrete)

    # Calculate intermediate values
    d_head = fastener.d_head if fastener.d_head else 1.8 * fastener.d
    import math
    Ah = (math.pi / 4.0) * (d_head ** 2 - fastener.d ** 2)
    k_p = 8.0

    return {
        'NRk_p': NRk_p,
        'NRk_p_kN': NRk_p / 1000,
        'Ah': Ah,
        'Ah_cm2': Ah / 100,
        'd_head': d_head,
        'k_p': k_p,
        'fck': concrete.fck,
        'failure_mode': 'Pull-out failure (tension)',
        'standard_ref': 'EC2-4-2 Section 6.2.4',
        'formula': 'NRk,p = k_p × Ah × fck'
    }
