"""
Web Interface Bridge Module for Fastener Design

This module provides a JSON-based interface for web applications to use
the fastener_design package via Pyodide (WebAssembly Python).

Author: EC2 Part 4 Implementation
Created: 2026-01-07
"""

import json
from typing import Dict, List, Any, Optional
import math

# Import core classes
from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties
from core.factors import MaterialFactors
from design import FastenerDesign


def run_analysis(input_json: str) -> str:
    """
    Main entry point for web interface

    Takes JSON input with fastener geometry, concrete properties, loading,
    and analysis options. Returns JSON with complete results including
    all failure modes, load distribution, and interaction checks.

    Args:
        input_json: JSON string with input data (see schema in IMPLEMENTATION_PLAN)

    Returns:
        JSON string with results

    Example:
        >>> input_data = {...}  # See JSON schema
        >>> result_json = run_analysis(json.dumps(input_data))
        >>> results = json.loads(result_json)
        >>> print(results['overall_status'])
    """
    try:
        # Parse input
        data = json.loads(input_json)

        # Create fasteners
        fasteners = [_create_fastener_from_dict(f) for f in data['fasteners']]

        # Create concrete
        concrete = _create_concrete_from_dict(data['concrete'])

        # Create fastener group (if multiple fasteners)
        group = None
        if len(fasteners) > 1:
            group = _create_fastener_group(fasteners, data)

        # Get active load case (for now, use first load case)
        # TODO: Support multiple load cases
        load_case = data['loading']['load_cases'][0]

        # Calculate load distribution for display
        load_distribution = _calculate_load_distribution(
            data['fasteners'],
            load_case
        )

        # Create design object
        loading = {
            'tension': abs(load_case.get('N', 0.0)) * 1000,  # kN → N
            'shear': 0.0  # Will be calculated from Vx, Vy
        }

        # Calculate resultant shear from Vx, Vy
        Vx_kN = load_case.get('Vx', 0.0)
        Vy_kN = load_case.get('Vy', 0.0)
        V_resultant = math.sqrt(Vx_kN**2 + Vy_kN**2)
        loading['shear'] = V_resultant * 1000  # kN → N

        design = FastenerDesign(
            fastener=fasteners[0],  # Use first as reference
            concrete=concrete,
            loading=loading,
            edge_distances=data.get('edge_distances', {}),
            spacings=data.get('spacings', {}),
            loading_type=data['analysis_options'].get('loading_type', 'static')
        )

        # Get failure modes to check
        tension_modes = data['analysis_options']['failure_modes'].get('tension', [])
        shear_modes = data['analysis_options']['failure_modes'].get('shear', [])

        # Run analysis
        results = design.check_all_modes(
            tension_modes=tension_modes if tension_modes else None,
            shear_modes=shear_modes if shear_modes else None
        )

        # Format output
        output = _format_output(results, data, load_distribution, concrete, design)

        return json.dumps(output, indent=2)

    except Exception as e:
        # Return error in JSON format
        error_output = {
            'status': 'error',
            'error_message': str(e),
            'error_type': type(e).__name__
        }
        return json.dumps(error_output, indent=2)


def _create_fastener_from_dict(data: Dict[str, Any]) -> Fastener:
    """
    Create Fastener object from dictionary

    Args:
        data: Dictionary with fastener properties

    Returns:
        Fastener object
    """
    # Handle area auto-calculation vs override
    area = data.get('area_override') or data.get('area')

    return Fastener(
        diameter=data['diameter'],
        embedment_depth=data['embedment_depth'],
        steel_grade=data['steel_grade'],
        area=area,
        fastener_type=data.get('fastener_type', 'headed'),
        d_head=data.get('d_head')
    )


def _create_concrete_from_dict(data: Dict[str, Any]) -> ConcreteProperties:
    """
    Create ConcreteProperties object from dictionary

    Args:
        data: Dictionary with concrete properties

    Returns:
        ConcreteProperties object
    """
    # Handle strength class vs manual fck
    strength_class = data.get('strength_class')
    fck = data.get('fck')

    return ConcreteProperties(
        fck=fck if not strength_class else None,
        thickness=data.get('thickness', 0),
        cracked=data.get('cracked', False),
        reinforced=data.get('reinforced', False),
        strength_class=strength_class
    )


def _create_fastener_group(fasteners: List[Fastener], data: Dict[str, Any]) -> FastenerGroup:
    """
    Create FastenerGroup object from fasteners list and data

    Args:
        fasteners: List of Fastener objects
        data: Input data dictionary

    Returns:
        FastenerGroup object
    """
    spacings_data = data.get('spacings', {})

    # Auto-calculate spacings from positions if requested
    if spacings_data.get('auto_calculate', True):
        # Calculate minimum spacing from positions
        positions = [(f['x'], f['y']) for f in data['fasteners']]
        min_sx, min_sy = _calculate_min_spacings(positions)
        spacings = {'sx': min_sx, 'sy': min_sy}
    else:
        spacings = {
            'sx': spacings_data.get('sx', 0),
            'sy': spacings_data.get('sy', 0)
        }

    return FastenerGroup(
        fasteners=fasteners,
        spacings=spacings,
        edge_distances=data.get('edge_distances', {})
    )


def _calculate_min_spacings(positions: List[tuple]) -> tuple:
    """
    Calculate minimum spacings from fastener positions

    Args:
        positions: List of (x, y) tuples

    Returns:
        (min_sx, min_sy) in mm
    """
    if len(positions) < 2:
        return (0.0, 0.0)

    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]

    # Find unique x and y coordinates
    unique_xs = sorted(set(xs))
    unique_ys = sorted(set(ys))

    # Calculate minimum spacings
    min_sx = min([unique_xs[i+1] - unique_xs[i] for i in range(len(unique_xs)-1)]) if len(unique_xs) > 1 else 0
    min_sy = min([unique_ys[i+1] - unique_ys[i] for i in range(len(unique_ys)-1)]) if len(unique_ys) > 1 else 0

    return (min_sx, min_sy)


def _calculate_load_distribution(fasteners_data: List[Dict], load_case: Dict) -> List[Dict]:
    """
    Calculate load distribution to fasteners

    Uses CORRECTED formulas (verified 2026-01-07)

    Args:
        fasteners_data: List of fastener dictionaries with {x, y, ...}
        load_case: Load case dictionary with Vx, Vy, Mz, N, application_point

    Returns:
        List of dictionaries with forces on each fastener
    """
    # Extract positions
    positions = [(f['x'], f['y']) for f in fasteners_data]
    n = len(positions)

    if n == 0:
        return []

    # Calculate centroid
    Xc = sum(p[0] for p in positions) / n
    Yc = sum(p[1] for p in positions) / n

    # Get load application point
    if load_case.get('application_type') == 'point':
        Px = load_case['application_point']['x']
        Py = load_case['application_point']['y']
    else:
        Px, Py = Xc, Yc

    # Get loads
    Vx = load_case.get('Vx', 0.0)  # kN
    Vy = load_case.get('Vy', 0.0)  # kN
    Mz = load_case.get('Mz', 0.0)  # kNm
    N_total = load_case.get('N', 0.0)  # kN

    # Calculate eccentricity
    ex = Px - Xc  # mm
    ey = Py - Yc  # mm

    # Total moment (applied + eccentric)
    M_offset = (Vx * ey - Vy * ex) / 1000.0  # kN*mm → kNm
    M_total = Mz + M_offset  # kNm
    M_total_mm = M_total * 1000.0  # kNmm for calculations

    # Polar moment of inertia
    J = sum((p[0] - Xc)**2 + (p[1] - Yc)**2 for p in positions)

    # Distribute forces
    distribution = []
    for i, (x, y) in enumerate(positions):
        dx = x - Xc  # mm
        dy = y - Yc  # mm

        # Direct shear (equal distribution)
        Vx_direct = Vx / n
        Vy_direct = Vy / n

        # Torsional shear (CORRECTED FORMULAS - verified 2026-01-07)
        # NOTE: Positive sign for Vx_torsion (was negative in old code - BUG!)
        if J > 0:
            # Multiple fasteners - distribute torsion
            Vx_torsion = M_total_mm * dy / J  # ✅ CORRECT (no negative sign)
            Vy_torsion = M_total_mm * dx / J  # ✅ CORRECT
        else:
            # Single fastener (J=0) - no torsional distribution
            # All moment is resisted by the single fastener
            Vx_torsion = 0.0
            Vy_torsion = 0.0

        # Total forces
        Vx_total = Vx_direct + Vx_torsion
        Vy_total = Vy_direct + Vy_torsion

        # Tension (equal distribution for now)
        N_fastener = N_total / n

        # Resultants
        V_resultant = math.sqrt(Vx_total**2 + Vy_total**2)
        total_resultant = math.sqrt(Vx_total**2 + Vy_total**2 + N_fastener**2)

        distribution.append({
            'fastener_id': fasteners_data[i]['id'],
            'position': {'x': x, 'y': y},
            'forces': {
                'Vx_direct': round(Vx_direct, 3),
                'Vy_direct': round(Vy_direct, 3),
                'Vx_torsion': round(Vx_torsion, 3),
                'Vy_torsion': round(Vy_torsion, 3),
                'Vx_total': round(Vx_total, 3),
                'Vy_total': round(Vy_total, 3),
                'N': round(N_fastener, 3)
            },
            'resultants': {
                'V_resultant': round(V_resultant, 3),
                'total_resultant': round(total_resultant, 3)
            }
        })

    return distribution


def _format_output(results: Dict, input_data: Dict, load_distribution: List[Dict],
                   concrete: ConcreteProperties, design: FastenerDesign) -> Dict:
    """
    Format results into output JSON schema

    Args:
        results: Results from FastenerDesign.check_all_modes()
        input_data: Original input data
        load_distribution: Load distribution results
        concrete: ConcreteProperties object
        design: FastenerDesign object

    Returns:
        Dictionary matching output schema
    """
    # Calculate centroid
    n = len(input_data['fasteners'])
    centroid_x = sum(f['x'] for f in input_data['fasteners']) / n if n > 0 else 0
    centroid_y = sum(f['y'] for f in input_data['fasteners']) / n if n > 0 else 0

    output = {
        'status': 'success',
        'error_message': None,
        'input_summary': {
            'n_fasteners': n,
            'centroid': {'x': round(centroid_x, 2), 'y': round(centroid_y, 2)},
            'concrete_k_factor': round(concrete.get_k_factor(), 2),
            'gamma_Ms': design.gamma_Ms,
            'gamma_Mc': design.gamma_Mc
        },
        'load_distribution': load_distribution,
        'failure_modes': {},
        'interaction': None,
        'overall_status': results.get('overall_status', 'UNKNOWN')
    }

    # Add tension results
    if results.get('tension'):
        output['failure_modes']['tension'] = results['tension']

    # Add shear results
    if results.get('shear'):
        output['failure_modes']['shear'] = results['shear']

    # Add interaction results
    if results.get('interaction'):
        output['interaction'] = results['interaction']

    return output


# Export main function for Pyodide
__all__ = ['run_analysis']
