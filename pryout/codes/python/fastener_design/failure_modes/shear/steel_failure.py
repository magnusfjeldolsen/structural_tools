"""
Steel failure in shear

Standard: EC2-4-2 Section 6.3.3
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener


def steel_failure_shear(
    fastener: Fastener,
    n_fasteners: int = 1,
    lever_arm: float = 0.0,
    k_factor: Optional[float] = None
) -> float:
    """
    Calculate characteristic steel failure resistance in shear

    Formula (without lever arm):
        VRk,s = k₁ × n × As × fuk

    Formula (with lever arm):
        VRk,s = k₂ × n × As × fuk × α_M

    where:
        k₁ = factor depending on fastener ductility
        k₂ = reduction factor for lever arm effect
        n = number of fasteners
        As = stressed cross-sectional area [mm²]
        fuk = characteristic tensile strength [N/mm²]
        α_M = bending factor for lever arm

    Args:
        fastener: Fastener object
        n_fasteners: Number of fasteners (default 1)
        lever_arm: Lever arm l [mm] (default 0 = no lever arm)
        k_factor: Optional k-factor override
                  If None, uses default based on fastener type

    Returns:
        VRk_s: Characteristic shear resistance [N]

    Standard: EC2-4-2 Section 6.3.3
    Formula: Section 6.3.3.1 (no lever), 6.3.3.2 (with lever)

    Notes:
        - k₁ typically = 0.6 for non-ductile fasteners
        - k₁ typically = 0.5 for ductile fasteners
        - Lever arm reduces capacity due to bending moments
        - For design: VRd,s = VRk,s / γMs (γMs typically 1.2)

    Example:
        >>> from fastener_design import Fastener
        >>> fastener = Fastener(16, 100, 500, area=157)
        >>> VRk_s = steel_failure_shear(fastener)
        >>> print(f"Shear capacity: {VRk_s/1000:.1f} kN")
        Shear capacity: 47.1 kN
    """
    # Determine k-factor
    if k_factor is None:
        # Default values based on fastener type and ductility
        # For headed fasteners, typically k = 0.6 (non-ductile)
        # This should come from European Technical Specification
        if fastener.fastener_type == 'headed':
            k = 0.6  # Typical for headed fasteners
        else:
            k = 0.5  # Conservative value
    else:
        k = k_factor

    # Check for lever arm effect
    if lever_arm > 0:
        # With lever arm - includes bending moment effect
        # α_M = reduction factor (needs proper implementation from standard)
        # Simplified: assume reduction based on lever arm
        # Full implementation would use interaction formula from 6.3.3.2

        # Simplified reduction (placeholder - needs exact formula from standard)
        alpha_M = 1.0 / (1.0 + lever_arm / (10.0 * fastener.d))
        alpha_M = max(0.5, min(1.0, alpha_M))  # Clamp between 0.5-1.0

        VRk_s = k * n_fasteners * fastener.As * fastener.fuk * alpha_M
    else:
        # Without lever arm
        VRk_s = k * n_fasteners * fastener.As * fastener.fuk

    return VRk_s


def get_shear_steel_capacity_info(
    fastener: Fastener,
    lever_arm: float = 0.0,
    k_factor: Optional[float] = None
) -> dict:
    """
    Get detailed information about steel shear capacity

    Args:
        fastener: Fastener object
        lever_arm: Lever arm [mm]
        k_factor: Optional k-factor override

    Returns:
        Dictionary with capacity details for UI display

    Useful for reporting and interface display
    """
    VRk_s = steel_failure_shear(fastener, lever_arm=lever_arm, k_factor=k_factor)

    # Determine actual k-factor used
    if k_factor is None:
        k = 0.6 if fastener.fastener_type == 'headed' else 0.5
    else:
        k = k_factor

    return {
        'VRk_s': VRk_s,
        'VRk_s_kN': VRk_s / 1000,
        'As': fastener.As,
        'fuk': fastener.fuk,
        'k_factor': k,
        'lever_arm': lever_arm,
        'has_lever_arm': lever_arm > 0,
        'failure_mode': 'Steel failure (shear)',
        'standard_ref': 'EC2-4-2 Section 6.3.3',
        'formula': 'VRk,s = k × As × fuk' + (' × α_M' if lever_arm > 0 else '')
    }
