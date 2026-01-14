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
from fastener_design.core.fastener import Fastener
from fastener_design.core.fastener_group import FastenerGroup
from fastener_design.core.concrete import ConcreteProperties
from fastener_design.core.factors import MaterialFactors
from fastener_design.design import FastenerDesign

# Import calculation modules
from fastener_design.calculations import planar_bending


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

        # Get failure modes to check
        tension_modes = data['analysis_options']['failure_modes'].get('tension', [])
        shear_modes = data['analysis_options']['failure_modes'].get('shear', [])

        # Analyze ALL load cases
        load_cases = data['loading']['load_cases']
        load_case_results = []

        for lc in load_cases:
            # Calculate load distribution for this load case
            load_distribution = _calculate_load_distribution(
                data['fasteners'],
                lc
            )

            # Create loading dict
            loading = {
                'tension': abs(lc.get('N', 0.0)) * 1000,  # kN → N
                'shear': 0.0  # Will be calculated from Vx, Vy
            }

            # Calculate resultant shear from Vx, Vy
            Vx_kN = lc.get('Vx', 0.0)
            Vy_kN = lc.get('Vy', 0.0)
            V_resultant = math.sqrt(Vx_kN**2 + Vy_kN**2)
            loading['shear'] = V_resultant * 1000  # kN → N

            # Create design object
            design = FastenerDesign(
                fastener=fasteners[0],  # Use first as reference
                concrete=concrete,
                loading=loading,
                edge_distances=data.get('edge_distances', {}),
                spacings=data.get('spacings', {}),
                loading_type=data['analysis_options'].get('loading_type', 'static')
            )

            # Run analysis for this load case
            results = design.check_all_modes(
                tension_modes=tension_modes if tension_modes else None,
                shear_modes=shear_modes if shear_modes else None
            )

            # Store results for this load case
            load_case_results.append({
                'load_case_id': lc.get('id', lc.get('name', f'LC{len(load_case_results)+1}')),
                'load_case_name': lc.get('name', f'LC{len(load_case_results)+1}'),
                'load_distribution': load_distribution,
                'failure_modes': {
                    'tension': results.get('tension'),
                    'shear': results.get('shear')
                },
                'interaction': results.get('interaction'),
                'overall_status': results.get('overall_status', 'UNKNOWN'),
                # Include original load case data for plotting
                'Vx': lc.get('Vx', 0.0),
                'Vy': lc.get('Vy', 0.0),
                'Mx': lc.get('Mx', 0.0),
                'My': lc.get('My', 0.0),
                'Mz': lc.get('Mz', 0.0),
                'N': lc.get('N', 0.0)
            })

        # Calculate maximum utilizations across all load cases
        max_utilizations = _calculate_max_utilizations(load_case_results, tension_modes, shear_modes)

        # Format output
        output = _format_output_multi_case(
            load_case_results,
            max_utilizations,
            data,
            concrete,
            design
        )

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
    Calculate load distribution to fasteners including planar bending

    Updated 2026-01-12: Now includes Mx and My (planar bending moments)

    Args:
        fasteners_data: List of fastener dictionaries with {x, y, d, ...}
        load_case: Load case dictionary with Vx, Vy, Mx, My, Mz, N, application_point

    Returns:
        List of dictionaries with forces on each fastener
    """
    # Extract positions and calculate areas
    positions = [(f['x'], f['y']) for f in fasteners_data]
    n = len(positions)

    if n == 0:
        return []

    # Calculate fastener areas (gross cross-sectional area)
    import math as m
    areas = [m.pi * (f.get('diameter', f.get('d', 16))/2)**2 for f in fasteners_data]

    # Get loads
    Vx = load_case.get('Vx', 0.0)  # kN
    Vy = load_case.get('Vy', 0.0)  # kN
    Mx = load_case.get('Mx', 0.0)  # kNm
    My = load_case.get('My', 0.0)  # kNm
    Mz = load_case.get('Mz', 0.0)  # kNm
    N = load_case.get('N', 0.0)    # kN

    # Get load application point
    if load_case.get('application_type') == 'point':
        load_point = (
            load_case['application_point']['x'],
            load_case['application_point']['y']
        )
        application_type = 'point'
    else:
        load_point = None
        application_type = 'centroid'

    # Use planar_bending module for complete load distribution
    distribution_data = planar_bending.distribute_loads_with_bending(
        positions=positions,
        areas=areas,
        N=N,
        Vx=Vx,
        Vy=Vy,
        Mx=Mx,
        My=My,
        Mz=Mz,
        load_point=load_point,
        application_type=application_type
    )

    # Format for output (match expected structure)
    distribution = []
    for i, data in enumerate(distribution_data):
        V_resultant = data['V_total']
        N_total = data['N']
        total_resultant = math.sqrt(V_resultant**2 + N_total**2)

        distribution.append({
            'fastener_id': fasteners_data[i]['id'],
            'position': {'x': data['x'], 'y': data['y']},
            'forces': {
                'Vx_direct': round(data['Vx_direct'], 3),
                'Vy_direct': round(data['Vy_direct'], 3),
                'Vx_torsion': round(data['Vx_torsion'], 3),
                'Vy_torsion': round(data['Vy_torsion'], 3),
                'Vx_total': round(data['Vx'], 3),
                'Vy_total': round(data['Vy'], 3),
                'N': round(data['N'], 3),
                'N_direct': round(data['N_direct'], 3),
                'N_Mx': round(data['N_Mx'], 3),
                'N_My': round(data['N_My'], 3)
            },
            'resultants': {
                'V_resultant': round(V_resultant, 3),
                'total_resultant': round(total_resultant, 3)
            }
        })

    return distribution


def _calculate_max_utilizations(load_case_results: List[Dict],
                                tension_modes: List[str],
                                shear_modes: List[str]) -> Dict:
    """
    Calculate maximum utilizations across all load cases

    Args:
        load_case_results: List of results for each load case
        tension_modes: List of tension modes checked
        shear_modes: List of shear modes checked

    Returns:
        Dictionary with max utilizations for each mode
    """
    max_utils = {
        'tension': {},
        'shear': {},
        'interaction': None,
        'overall_status': 'OK'
    }

    # Track max utilization for each tension mode
    for mode in tension_modes:
        max_util = 0.0
        max_NRd_kN = None
        max_case = None

        for lc_result in load_case_results:
            tension_data = lc_result['failure_modes'].get('tension', {})
            if tension_data and mode in tension_data:
                util = tension_data[mode].get('utilization', 0.0)
                if util > max_util:
                    max_util = util
                    max_NRd_kN = tension_data[mode].get('NRd_kN')
                    max_case = lc_result['load_case_name']

        if max_NRd_kN is not None:
            max_utils['tension'][mode] = {
                'utilization': max_util,
                'NRd_kN': max_NRd_kN,
                'governing_case': max_case,
                'status': 'OK' if max_util <= 1.0 else 'FAIL'
            }

    # Track max utilization for each shear mode
    for mode in shear_modes:
        max_util = 0.0
        max_VRd_kN = None
        max_case = None

        for lc_result in load_case_results:
            shear_data = lc_result['failure_modes'].get('shear', {})
            if shear_data and mode in shear_data:
                util = shear_data[mode].get('utilization', 0.0)
                if util > max_util:
                    max_util = util
                    max_VRd_kN = shear_data[mode].get('VRd_kN')
                    max_case = lc_result['load_case_name']

        if max_VRd_kN is not None:
            max_utils['shear'][mode] = {
                'utilization': max_util,
                'VRd_kN': max_VRd_kN,
                'governing_case': max_case,
                'status': 'OK' if max_util <= 1.0 else 'FAIL'
            }

    # Track max interaction
    max_interaction = 0.0
    max_interaction_case = None
    max_interaction_data = None

    for lc_result in load_case_results:
        interaction = lc_result.get('interaction')
        if interaction:
            ratio = interaction.get('interaction_ratio', 0.0)
            if ratio > max_interaction:
                max_interaction = ratio
                max_interaction_case = lc_result['load_case_name']
                max_interaction_data = interaction

    if max_interaction_data:
        max_utils['interaction'] = {
            **max_interaction_data,
            'governing_case': max_interaction_case
        }

    # Overall status
    all_ok = True
    for lc_result in load_case_results:
        if lc_result['overall_status'] == 'FAIL':
            all_ok = False
            break

    max_utils['overall_status'] = 'OK' if all_ok else 'FAIL'

    return max_utils


def _format_output_multi_case(load_case_results: List[Dict],
                               max_utilizations: Dict,
                               input_data: Dict,
                               concrete: ConcreteProperties,
                               design: FastenerDesign) -> Dict:
    """
    Format multi-load case results into output JSON schema

    Args:
        load_case_results: List of results for each load case
        max_utilizations: Max utilizations across all cases
        input_data: Original input data
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
        'load_cases': load_case_results,
        'max_utilizations': max_utilizations,
        'overall_status': max_utilizations['overall_status']
    }

    return output


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
