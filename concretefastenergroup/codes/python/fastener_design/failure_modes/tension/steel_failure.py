"""
Steel failure in tension

Standard: EC2-4-2 Section 6.2.3
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener


def steel_failure_tension(
    fastener: Fastener,
    n_fasteners: int = 1
) -> float:
    """
    Calculate characteristic steel failure resistance in tension

    Formula:
        NRk,s = n × As × fuk

    where:
        n = number of fasteners
        As = stressed cross-sectional area of fastener [mm²]
        fuk = characteristic tensile strength of steel [N/mm²]

    Args:
        fastener: Fastener object with As and fuk properties
        n_fasteners: Number of fasteners in the group (default 1)

    Returns:
        NRk_s: Characteristic resistance for steel failure [N]

    Standard: EC2-4-2 Section 6.2.3
    Reference: European Technical Specification for specific fastener

    Notes:
        - The characteristic resistance is given in the European Technical
          Specification (ETS) for the specific fastener type
        - The strength calculation is based on fuk (not fy)
        - For design resistance: NRd,s = NRk,s / γMs
        - Typical γMs = 1.2 for static loading

    Example:
        >>> from fastener_design import Fastener
        >>> fastener = Fastener(
        ...     diameter=16,
        ...     embedment_depth=100,
        ...     steel_grade=500,  # fuk = 500 MPa
        ...     area=157  # As = 157 mm² (threaded area)
        ... )
        >>> NRk_s = steel_failure_tension(fastener)
        >>> print(f"Steel capacity: {NRk_s/1000:.1f} kN")
        Steel capacity: 78.5 kN
    """
    # Calculate characteristic resistance
    NRk_s = n_fasteners * fastener.As * fastener.fuk

    return NRk_s


def get_steel_capacity_info(fastener: Fastener) -> dict:
    """
    Get detailed information about steel failure capacity

    Args:
        fastener: Fastener object

    Returns:
        Dictionary with:
            - 'NRk_s': Characteristic resistance [N]
            - 'As': Cross-sectional area [mm²]
            - 'fuk': Tensile strength [MPa]
            - 'failure_mode': 'Steel tension'
            - 'standard_ref': Standard reference

    Useful for UI display and reporting
    """
    NRk_s = steel_failure_tension(fastener)

    return {
        'NRk_s': NRk_s,
        'NRk_s_kN': NRk_s / 1000,
        'As': fastener.As,
        'fuk': fastener.fuk,
        'failure_mode': 'Steel failure (tension)',
        'standard_ref': 'EC2-4-2 Section 6.2.3',
        'formula': 'NRk,s = As × fuk'
    }
