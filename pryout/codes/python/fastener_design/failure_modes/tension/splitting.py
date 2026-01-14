"""
Splitting failure in tension

Standard: EC2-4-2 Section 6.2.6
"""

from typing import Optional
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.fastener import Fastener
from core.concrete import ConcreteProperties
from core.fastener_group import FastenerGroup


def check_splitting_risk(
    fastener: Fastener,
    concrete: ConcreteProperties,
    edge_distance: float = None,
    spacing: float = None
) -> dict:
    """
    Check if splitting failure risk exists

    Splitting can occur during installation (torque-induced) or under loading.

    Minimum requirements to prevent splitting:
        - c_min,sp = 1.5 × d (minimum edge distance)
        - s_min,sp = 2.0 × d (minimum spacing)
        - h_min ≥ 2 × hef (minimum member thickness)

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        edge_distance: Minimum edge distance c [mm]
        spacing: Minimum spacing s [mm]

    Returns:
        Dictionary with:
            - 'risk': Risk level ('low', 'medium', 'high')
            - 'requirements_met': Boolean
            - 'checks': Dict of individual checks

    Standard: EC2-4-2 Section 6.2.6.1 (Installation)
    """
    checks = {}

    # Minimum edge distance check
    c_min_sp = 1.5 * fastener.d
    if edge_distance is not None:
        checks['edge_distance'] = {
            'value': edge_distance,
            'minimum': c_min_sp,
            'ok': edge_distance >= c_min_sp
        }
    else:
        checks['edge_distance'] = {'ok': True, 'note': 'Not provided'}

    # Minimum spacing check
    s_min_sp = 2.0 * fastener.d
    if spacing is not None:
        checks['spacing'] = {
            'value': spacing,
            'minimum': s_min_sp,
            'ok': spacing >= s_min_sp
        }
    else:
        checks['spacing'] = {'ok': True, 'note': 'Not provided'}

    # Minimum thickness check
    h_min = 2.0 * fastener.hef
    checks['thickness'] = {
        'value': concrete.h,
        'minimum': h_min,
        'ok': concrete.h >= h_min
    }

    # Determine overall risk
    all_ok = all(check.get('ok', False) for check in checks.values())

    if all_ok:
        risk = 'low'
    elif any(not check.get('ok', True) for check in checks.values()):
        risk = 'high'
    else:
        risk = 'medium'

    return {
        'risk': risk,
        'requirements_met': all_ok,
        'checks': checks,
        'recommendation': 'Use supplementary reinforcement' if risk == 'high' else 'OK'
    }


def splitting_failure(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None,
    has_reinforcement: bool = False
) -> float:
    """
    Calculate characteristic splitting failure resistance

    If minimum spacing/edge requirements are met OR supplementary
    reinforcement is provided, splitting is prevented and capacity
    is very high (governed by other modes).

    If requirements not met: reduced capacity formula applies.

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        group: Optional FastenerGroup
        edge_distance: Minimum edge distance [mm]
        has_reinforcement: True if supplementary reinforcement present

    Returns:
        NRk_sp: Characteristic splitting resistance [N]

    Standard: EC2-4-2 Section 6.2.6

    Notes:
        - If supplementary reinforcement: splitting prevented
        - If minimum requirements met: splitting prevented
        - Otherwise: capacity significantly reduced
        - For design: NRd,sp = NRk,sp / γMc
    """
    # Check splitting risk
    spacing = group.get_max_spacing() if group else None
    risk_check = check_splitting_risk(fastener, concrete, edge_distance, spacing)

    # If supplementary reinforcement, splitting is prevented
    if has_reinforcement or concrete.reinforced:
        # Very high capacity (splitting prevented)
        return 1e9  # Effectively infinite - other modes govern

    # If minimum requirements met, splitting unlikely
    if risk_check['requirements_met']:
        # High capacity - splitting unlikely
        return 1e9

    # Otherwise, calculate reduced capacity
    # Simplified formula (actual depends on specific geometry)
    # Conservative estimate: fraction of concrete cone capacity
    from failure_modes.tension.concrete_cone import concrete_cone_failure

    NRk_c = concrete_cone_failure(
        fastener, concrete, group, edge_distance, eccentricity=0.0
    )

    # Reduction factor for splitting (conservative)
    reduction = 0.5

    NRk_sp = reduction * NRk_c

    return NRk_sp


def get_splitting_capacity_info(
    fastener: Fastener,
    concrete: ConcreteProperties,
    group: FastenerGroup = None,
    edge_distance: float = None,
    has_reinforcement: bool = False
) -> dict:
    """
    Get detailed information about splitting capacity

    Args:
        fastener: Fastener object
        concrete: Concrete properties
        group: Optional FastenerGroup
        edge_distance: Edge distance [mm]
        has_reinforcement: Supplementary reinforcement present

    Returns:
        Dictionary with capacity details and risk assessment
    """
    NRk_sp = splitting_failure(
        fastener, concrete, group, edge_distance, has_reinforcement
    )

    spacing = group.get_max_spacing() if group else None
    risk_check = check_splitting_risk(fastener, concrete, edge_distance, spacing)

    is_prevented = has_reinforcement or concrete.reinforced or risk_check['requirements_met']

    return {
        'NRk_sp': NRk_sp,
        'NRk_sp_kN': NRk_sp / 1000,
        'splitting_prevented': is_prevented,
        'risk_level': risk_check['risk'],
        'has_reinforcement': has_reinforcement or concrete.reinforced,
        'risk_assessment': risk_check,
        'failure_mode': 'Splitting failure (tension)',
        'standard_ref': 'EC2-4-2 Section 6.2.6',
        'formula': 'NRk,sp = high (prevented)' if is_prevented else 'NRk,sp = 0.5 × NRk,c',
        'note': 'Prevented by reinforcement/geometry' if is_prevented else 'Check requirements'
    }
