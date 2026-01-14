"""
Combined loading (N-V interaction) calculations

This module handles the interaction between tension and shear loads
according to EC2 Part 4.

Standard: EC2-4-2 Section 6.7
"""

from typing import Dict, Optional


def check_nv_interaction(
    NEd: float,
    NRd: float,
    VEd: float,
    VRd: float,
    alpha: float = 1.5,
    beta: float = 1.5
) -> Dict:
    """
    Check combined tension and shear loading interaction

    For fasteners subjected to both tension and shear, the interaction
    formula must be satisfied:

    (NEd/NRd)^α + (VEd/VRd)^β ≤ 1.0

    where:
        NEd = Design tension load [N]
        NRd = Design tension resistance [N]
        VEd = Design shear load [N]
        VRd = Design shear resistance [N]
        α, β = Exponents (typically 1.5 for fasteners)

    Args:
        NEd: Design tension load [N]
        NRd: Design tension resistance [N]
        VEd: Design shear load [N]
        VRd: Design shear resistance [N]
        alpha: Exponent for tension term (default 1.5)
        beta: Exponent for shear term (default 1.5)

    Returns:
        Dictionary with:
            - 'interaction_ratio': Calculated ratio (≤ 1.0 for OK)
            - 'tension_term': (NEd/NRd)^α
            - 'shear_term': (VEd/VRd)^β
            - 'status': 'OK' or 'FAIL'
            - 'utilization': Max of tension and shear utilizations
            - 'formula': String representation

    Standard: EC2-4-2 Section 6.7

    Notes:
        - If NEd = 0: Only shear check applies
        - If VEd = 0: Only tension check applies
        - Both loads present: Interaction formula applies
        - α = β = 1.5 is conservative for most fastener types
        - Some ETAs may specify different exponents

    Example:
        >>> result = check_nv_interaction(50000, 60000, 20000, 40000)
        >>> print(f"Interaction ratio: {result['interaction_ratio']:.3f}")
        >>> print(f"Status: {result['status']}")
    """
    # Avoid division by zero
    if NRd <= 0 or VRd <= 0:
        return {
            'interaction_ratio': float('inf'),
            'tension_term': float('inf') if NRd <= 0 else 0.0,
            'shear_term': float('inf') if VRd <= 0 else 0.0,
            'status': 'FAIL',
            'utilization': float('inf'),
            'formula': f'({NEd:.0f}/{NRd:.0f})^{alpha} + ({VEd:.0f}/{VRd:.0f})^{beta} ≤ 1.0',
            'error': 'Zero or negative resistance'
        }

    # Calculate individual utilizations
    tension_util = NEd / NRd if NRd > 0 else 0.0
    shear_util = VEd / VRd if VRd > 0 else 0.0

    # Calculate interaction terms
    tension_term = (NEd / NRd) ** alpha if NEd > 0 else 0.0
    shear_term = (VEd / VRd) ** beta if VEd > 0 else 0.0

    # Calculate interaction ratio
    interaction_ratio = tension_term + shear_term

    # Determine status
    status = 'OK' if interaction_ratio <= 1.0 else 'FAIL'

    # Maximum utilization (for reference)
    max_util = max(tension_util, shear_util)

    return {
        'interaction_ratio': interaction_ratio,
        'tension_term': tension_term,
        'shear_term': shear_term,
        'tension_utilization': tension_util,
        'shear_utilization': shear_util,
        'status': status,
        'utilization': max_util,
        'alpha': alpha,
        'beta': beta,
        'formula': f'({NEd:.0f}/{NRd:.0f})^{alpha} + ({VEd:.0f}/{VRd:.0f})^{beta} ≤ 1.0',
        'formula_result': f'{interaction_ratio:.3f} ≤ 1.0',
        'standard_ref': 'EC2-4-2 Section 6.7'
    }


def check_combined_loading(
    tension_results: Dict,
    shear_results: Dict,
    NEd: float,
    VEd: float,
    alpha: float = 1.5,
    beta: float = 1.5
) -> Dict:
    """
    Check combined loading using governing failure modes

    This function extracts the governing (minimum) capacities from
    tension and shear results and performs the interaction check.

    Args:
        tension_results: Results from check_tension_modes()
        shear_results: Results from check_shear_modes()
        NEd: Design tension load [N]
        VEd: Design shear load [N]
        alpha: Exponent for tension term (default 1.5)
        beta: Exponent for shear term (default 1.5)

    Returns:
        Dictionary with interaction check results

    Standard: EC2-4-2 Section 6.7

    Example:
        >>> design = FastenerDesign(...)
        >>> tension_res = design.check_tension_modes()
        >>> shear_res = design.check_shear_modes()
        >>> interaction = check_combined_loading(
        ...     tension_res, shear_res, 50000, 20000
        ... )
    """
    # Extract governing capacities
    NRd = tension_results.get('min_capacity', 0)
    VRd = shear_results.get('min_capacity', 0)

    # Get governing modes
    governing_tension = tension_results.get('governing', 'unknown')
    governing_shear = shear_results.get('governing', 'unknown')

    # Perform interaction check
    interaction = check_nv_interaction(NEd, NRd, VEd, VRd, alpha, beta)

    # Add governing mode info
    interaction['governing_tension_mode'] = governing_tension
    interaction['governing_shear_mode'] = governing_shear
    interaction['NRd'] = NRd
    interaction['VRd'] = VRd
    interaction['NEd'] = NEd
    interaction['VEd'] = VEd
    interaction['NRd_kN'] = NRd / 1000
    interaction['VRd_kN'] = VRd / 1000
    interaction['NEd_kN'] = NEd / 1000
    interaction['VEd_kN'] = VEd / 1000

    return interaction


def get_interaction_summary(interaction_result: Dict) -> str:
    """
    Generate text summary of interaction check results

    Args:
        interaction_result: Result from check_nv_interaction or check_combined_loading

    Returns:
        Formatted text summary
    """
    lines = []
    lines.append("COMBINED LOADING (N-V INTERACTION)")
    lines.append("-" * 60)

    # Loads
    NEd_kN = interaction_result.get('NEd_kN', interaction_result.get('NEd', 0) / 1000)
    VEd_kN = interaction_result.get('VEd_kN', interaction_result.get('VEd', 0) / 1000)
    lines.append(f"Design loads:")
    lines.append(f"  NEd = {NEd_kN:.1f} kN")
    lines.append(f"  VEd = {VEd_kN:.1f} kN")

    # Capacities
    NRd_kN = interaction_result.get('NRd_kN', interaction_result.get('NRd', 0) / 1000)
    VRd_kN = interaction_result.get('VRd_kN', interaction_result.get('VRd', 0) / 1000)
    lines.append(f"\nDesign resistances:")
    lines.append(f"  NRd = {NRd_kN:.1f} kN (governing: {interaction_result.get('governing_tension_mode', 'N/A')})")
    lines.append(f"  VRd = {VRd_kN:.1f} kN (governing: {interaction_result.get('governing_shear_mode', 'N/A')})")

    # Individual utilizations
    lines.append(f"\nIndividual utilizations:")
    lines.append(f"  Tension: {interaction_result['tension_utilization']:.3f}")
    lines.append(f"  Shear:   {interaction_result['shear_utilization']:.3f}")

    # Interaction check
    lines.append(f"\nInteraction check (α={interaction_result['alpha']}, β={interaction_result['beta']}):")
    lines.append(f"  Formula: {interaction_result['formula']}")
    lines.append(f"  Result:  {interaction_result['formula_result']}")
    lines.append(f"  Ratio:   {interaction_result['interaction_ratio']:.3f}")
    lines.append(f"  Status:  {interaction_result['status']}")

    lines.append("-" * 60)
    lines.append(f"Standard: {interaction_result.get('standard_ref', 'EC2-4-2 Section 6.7')}")

    return '\n'.join(lines)
