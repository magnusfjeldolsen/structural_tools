"""
Concrete Bending Analysis Module
Pure Python module for rectangular concrete section analysis
Can be run and tested independently of the web UI
"""

import numpy as np
from shapely import Polygon

import structuralcodes
from structuralcodes.geometry._rectangular import RectangularGeometry
from structuralcodes import set_design_code
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement, add_reinforcement_line
from structuralcodes.materials.concrete import create_concrete
from structuralcodes.materials.reinforcement import create_reinforcement
from structuralcodes.sections import GenericSection

from helperfunctions import (
    get_bottom_boundary_of_rectangle,
    get_top_boundary_of_rectangle,
    get_left_boundary_of_rectangle,
    get_right_boundary_of_rectangle,
    generate_reinforcement_line_coords_with_cover,
    get_rebar_area
)


def create_rectangular_section(params):
    """
    Creates a rectangular concrete section with reinforcement.

    Parameters:
        params (dict): Dictionary containing:
            - fck (float): Concrete strength in MPa
            - fyk (float): Steel yield strength in MPa
            - ftk (float): Steel tensile strength in MPa
            - Es (float): Steel elastic modulus in MPa
            - epsuk (float): Steel ultimate strain
            - design_code (str): Design code identifier
            - width (float): Section width in mm
            - height (float): Section height in mm
            - reinforcements (list): List of reinforcement definitions

    Returns:
        tuple: (GenericSection, metadata_dict)
    """

    # Set design code
    design_code = params.get('design_code', 'ec2_2004')
    set_design_code(design_code)

    # Create materials
    concrete = create_concrete(fck=params['fck'])
    reinforcement = create_reinforcement(
        fyk=params['fyk'],
        Es=params.get('Es', 200000),
        ftk=params['ftk'],
        epsuk=params['epsuk']
    )

    # Create base geometry
    width = params['width']
    height = params['height']
    geometry = RectangularGeometry(width=width, height=height, material=concrete)

    # Track metadata
    metadata = {
        'total_bars': 0,
        'rebar_coordinates': []
    }

    # Add reinforcements
    reinforcements = params.get('reinforcements', [])

    for rebar in reinforcements:
        if rebar['type'] == 'single_bar':
            # Add single bar at specified coordinates
            coords = (rebar['x'], rebar['y'])
            diameter = rebar['diameter']

            geometry = add_reinforcement(
                geometry,
                coords=coords,
                diameter=diameter,
                material=reinforcement
            )

            metadata['total_bars'] += 1
            metadata['rebar_coordinates'].append({
                'x': float(rebar['x']),
                'y': float(rebar['y']),
                'diameter': float(diameter),
                'id': rebar['id']
            })

        elif rebar['type'] == 'rebar_line':
            # Get boundary based on selection
            boundary_type = rebar['boundary']

            if boundary_type == 'bottom':
                boundary = get_bottom_boundary_of_rectangle(geometry)
            elif boundary_type == 'top':
                boundary = get_top_boundary_of_rectangle(geometry)
            elif boundary_type == 'left':
                boundary = get_left_boundary_of_rectangle(geometry)
            elif boundary_type == 'right':
                boundary = get_right_boundary_of_rectangle(geometry)
            else:
                raise ValueError(f"Unknown boundary type: {boundary_type}")

            # Calculate line endpoints with cover
            line_coords = generate_reinforcement_line_coords_with_cover(
                boundary,
                boundary_cover=rebar['boundary_cover'],
                start_cover=rebar.get('start_cover', None),
                end_cover=rebar.get('end_cover', None)
            )

            # Add reinforcement line
            geometry = add_reinforcement_line(
                geometry,
                line_coords[0],
                line_coords[1],
                diameter=rebar['diameter'],
                s=rebar['spacing'],
                material=reinforcement
            )

            # Estimate number of bars (actual count will be in geometry.point_geometries)
            line_length = np.linalg.norm(line_coords[1] - line_coords[0])
            num_bars = int(line_length / rebar['spacing']) + 1
            metadata['total_bars'] += num_bars

    # Create section
    section = GenericSection(geometry)

    # Get actual bar count from geometry
    if hasattr(geometry, 'point_geometries'):
        metadata['total_bars'] = len(geometry.point_geometries)

    return section, metadata


def calculate_moment_curvature(section):
    """
    Calculate moment-curvature response.

    Parameters:
        section (GenericSection): The section to analyze

    Returns:
        dict: Results containing curvature and moment arrays
    """
    try:
        result = section.section_calculator.calculate_moment_curvature()

        # Extract data
        curvature = result.curvature.tolist() if hasattr(result.curvature, 'tolist') else list(result.curvature)
        moment = result.moment.tolist() if hasattr(result.moment, 'tolist') else list(result.moment)

        return {
            'success': True,
            'curvature': curvature,  # 1/mm
            'moment': moment,        # Nmm
            'message': 'Calculation successful'
        }
    except Exception as e:
        return {
            'success': False,
            'curvature': [],
            'moment': [],
            'message': str(e)
        }


def calculate_bending_capacity(section):
    """
    Calculate ultimate bending moment capacity.

    Parameters:
        section (GenericSection): The section to analyze

    Returns:
        dict: Results containing moment capacities
    """
    try:
        capacity = section.section_calculator.calculate_bending_strength()

        return {
            'success': True,
            'M_Rdy': float(capacity.m_y),  # Nmm
            'M_Rdz': float(capacity.m_z),  # Nmm
            'neutral_axis_depth': None,  # Not directly available from capacity object
            'message': 'Calculation successful'
        }
    except Exception as e:
        return {
            'success': False,
            'M_Rdy': 0,
            'M_Rdz': 0,
            'neutral_axis_depth': None,
            'message': str(e)
        }


def get_section_visualization_data(section):
    """
    Extract geometry data for visualization.

    Parameters:
        section (GenericSection): The section to visualize

    Returns:
        dict: Visualization data with concrete outline and rebar positions
    """
    geometry = section.geometry

    # Get concrete outline
    if hasattr(geometry, 'surface_geometries'):
        # CompoundGeometry - extract from first surface
        surface = geometry.surface_geometries[0]
        coords = list(surface.geometry.exterior.coords)
    else:
        # Simple RectangularGeometry
        xmin, xmax, ymin, ymax = geometry.calculate_extents()
        coords = [
            [xmin, ymin],
            [xmax, ymin],
            [xmax, ymax],
            [xmin, ymax],
            [xmin, ymin]  # Close the polygon
        ]

    # Get rebar positions
    rebars = []
    if hasattr(geometry, 'point_geometries'):
        for i, point_geom in enumerate(geometry.point_geometries):
            # PointGeometry has x, y attributes directly
            x = point_geom.x
            y = point_geom.y
            # Get diameter directly from PointGeometry
            diameter = point_geom.diameter

            rebars.append({
                'x': float(x),
                'y': float(y),
                'diameter': float(diameter),
                'id': f'rebar_{i}'
            })

    # Calculate extents
    xmin, xmax, ymin, ymax = geometry.calculate_extents()

    return {
        'concrete_outline': coords,
        'rebars': rebars,
        'extents': {
            'xmin': float(xmin),
            'xmax': float(xmax),
            'ymin': float(ymin),
            'ymax': float(ymax)
        }
    }


def run_analysis(params):
    """
    Main entry point for analysis.
    Creates section and runs all calculations.

    Parameters:
        params (dict): Complete parameter dictionary

    Returns:
        dict: Complete results including capacity, moment-curvature, and properties
    """

    # Create section
    section, metadata = create_rectangular_section(params)

    # Calculate properties
    section_area = params['width'] * params['height']
    total_rebar_area = get_rebar_area(section)
    reinforcement_ratio = (total_rebar_area / section_area) * 100

    section_properties = {
        'section_area': float(section_area),
        'total_rebar_area': float(total_rebar_area),
        'reinforcement_ratio': float(reinforcement_ratio),
        'num_rebars': metadata['total_bars']
    }

    # Run calculations
    moment_curvature = calculate_moment_curvature(section)
    capacity = calculate_bending_capacity(section)
    visualization = get_section_visualization_data(section)

    return {
        'moment_curvature': moment_curvature,
        'capacity': capacity,
        'section_properties': section_properties,
        'visualization': visualization
    }


# ========================================
# TESTING / STANDALONE EXECUTION
# ========================================

if __name__ == "__main__":
    print("Testing concrete_bending module...")

    # Test 1: Single bars
    print("\n=== Test 1: Single Bars ===")
    params1 = {
        'fck': 45,
        'fyk': 500,
        'ftk': 550,
        'Es': 200000,
        'epsuk': 0.075,
        'width': 1000,
        'height': 350,
        'design_code': 'ec2_2004',
        'reinforcements': [
            {'type': 'single_bar', 'id': 'bar_1', 'x': -400, 'y': -150, 'diameter': 16},
            {'type': 'single_bar', 'id': 'bar_2', 'x': -200, 'y': -150, 'diameter': 16},
            {'type': 'single_bar', 'id': 'bar_3', 'x': 0, 'y': -150, 'diameter': 16},
            {'type': 'single_bar', 'id': 'bar_4', 'x': 200, 'y': -150, 'diameter': 16},
            {'type': 'single_bar', 'id': 'bar_5', 'x': 400, 'y': -150, 'diameter': 16},
        ]
    }

    results1 = run_analysis(params1)
    print(f"Success: {results1['capacity']['success']}")
    print(f"M_Rdy: {results1['capacity']['M_Rdy']/1e6:.2f} kNm")
    print(f"Total bars: {results1['section_properties']['num_rebars']}")
    print(f"Reinforcement ratio: {results1['section_properties']['reinforcement_ratio']:.3f}%")

    # Test 2: Rebar line (matches concrete_bending_example.py)
    print("\n=== Test 2: Rebar Line ===")
    params2 = {
        'fck': 45,
        'fyk': 500,
        'ftk': 550,
        'Es': 200000,
        'epsuk': 0.075,
        'width': 1000,
        'height': 350,
        'design_code': 'ec2_2004',
        'reinforcements': [
            {
                'type': 'rebar_line',
                'id': 'bottom_layer',
                'boundary': 'bottom',
                'diameter': 12,
                'spacing': 100,
                'boundary_cover': 50,
                'start_cover': 50,
                'end_cover': 50
            }
        ]
    }

    results2 = run_analysis(params2)
    print(f"Success: {results2['capacity']['success']}")
    print(f"M_Rdy: {results2['capacity']['M_Rdy']/1e6:.2f} kNm")
    print(f"Total bars: {results2['section_properties']['num_rebars']}")
    print(f"Reinforcement ratio: {results2['section_properties']['reinforcement_ratio']:.3f}%")

    print("\n=== All tests completed ===")
