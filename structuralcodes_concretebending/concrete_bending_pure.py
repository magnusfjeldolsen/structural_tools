"""
Pure Python Concrete Bending Analysis
Simplified implementation without scipy/triangle dependencies
Works in Pyodide/browser environment

Based on Eurocode 2 (EC2 2004) principles
"""

import json
import numpy as np


class EC2Material:
    """EC2 2004 material properties"""

    @staticmethod
    def concrete_stress_strain(fck):
        """
        Returns concrete stress-strain parameters for EC2

        Args:
            fck: Characteristic compressive strength (MPa)

        Returns:
            dict with material properties
        """
        fcm = fck + 8  # Mean compressive strength
        Ecm = 22000 * (fcm / 10) ** 0.3  # Elastic modulus (MPa)

        # Design values
        fcd = 0.85 * fck / 1.5  # Design compressive strength
        ecu = 0.0035  # Ultimate concrete strain
        ec2 = 0.002  # Strain at peak stress

        return {
            'fck': fck,
            'fcm': fcm,
            'fcd': fcd,
            'Ecm': Ecm,
            'ecu': ecu,
            'ec2': ec2
        }

    @staticmethod
    def reinforcement_stress_strain(fyk, Es=200000, ftk=None, epsuk=0.075):
        """
        Returns reinforcement stress-strain parameters for EC2

        Args:
            fyk: Characteristic yield strength (MPa)
            Es: Elastic modulus (MPa)
            ftk: Characteristic tensile strength (MPa)
            epsuk: Ultimate strain

        Returns:
            dict with material properties
        """
        if ftk is None:
            ftk = 1.08 * fyk

        fyd = fyk / 1.15  # Design yield strength
        eyd = fyd / Es  # Yield strain

        return {
            'fyk': fyk,
            'ftk': ftk,
            'fyd': fyd,
            'Es': Es,
            'eyd': eyd,
            'epsuk': epsuk
        }


def concrete_stress_ec2(strain, fcd, ec2=0.002, ecu=0.0035):
    """
    Concrete stress from strain using EC2 parabola-rectangle diagram

    Args:
        strain: Concrete strain (negative in compression)
        fcd: Design compressive strength (MPa)
        ec2: Strain at peak stress
        ecu: Ultimate strain

    Returns:
        Stress (MPa, negative in compression)
    """
    strain = abs(strain)

    if strain <= ec2:
        # Parabolic part
        return -fcd * (1 - (1 - strain / ec2) ** 2)
    elif strain <= ecu:
        # Constant stress
        return -fcd
    else:
        # Failure
        return 0.0


def steel_stress_ec2(strain, fyd, Es, eyd, epsuk):
    """
    Reinforcement stress from strain (elastic-perfectly plastic)

    Args:
        strain: Steel strain
        fyd: Design yield strength (MPa)
        Es: Elastic modulus (MPa)
        eyd: Yield strain
        epsuk: Ultimate strain

    Returns:
        Stress (MPa, positive in tension)
    """
    if abs(strain) <= eyd:
        # Elastic
        return Es * strain
    elif abs(strain) <= epsuk:
        # Plastic
        return np.sign(strain) * fyd
    else:
        # Failure
        return 0.0


class RectangularSection:
    """Rectangular concrete section with reinforcement"""

    def __init__(self, width, height, concrete_props, steel_props):
        """
        Initialize section

        Args:
            width: Section width (mm)
            height: Section height (mm)
            concrete_props: Dict from EC2Material.concrete_stress_strain()
            steel_props: Dict from EC2Material.reinforcement_stress_strain()
        """
        self.width = width
        self.height = height
        self.concrete = concrete_props
        self.steel = steel_props
        self.rebars = []  # List of (y_position, area) tuples

    def add_rebar(self, y_position, diameter):
        """
        Add a single rebar

        Args:
            y_position: Distance from section centroid (mm, negative = bottom)
            diameter: Bar diameter (mm)
        """
        area = np.pi * (diameter / 2) ** 2
        self.rebars.append((y_position, area))

    def add_rebar_layer(self, y_position, diameter, n_bars):
        """
        Add a layer of rebars

        Args:
            y_position: Distance from section centroid (mm)
            diameter: Bar diameter (mm)
            n_bars: Number of bars
        """
        area_total = n_bars * np.pi * (diameter / 2) ** 2
        self.rebars.append((y_position, area_total))

    def calculate_forces(self, curvature, neutral_axis):
        """
        Calculate internal forces for given curvature and neutral axis position

        Args:
            curvature: Section curvature (1/mm)
            neutral_axis: Neutral axis position from centroid (mm, positive = top)

        Returns:
            tuple: (axial_force, moment, max_concrete_strain, max_steel_strain)
        """
        # Concrete contribution
        # Divide section into fibers
        n_fibers = 50
        y_top = self.height / 2
        y_bottom = -self.height / 2

        # Only consider compressed zone
        if neutral_axis > y_bottom:
            y_compressed_bottom = max(y_bottom, neutral_axis - self.height)

            y_fibers = np.linspace(neutral_axis, y_compressed_bottom, n_fibers)
            dy = abs(y_fibers[1] - y_fibers[0]) if len(y_fibers) > 1 else 0

            Fc = 0
            Mc = 0
            max_concrete_strain = 0

            for y in y_fibers:
                # Strain at this fiber
                strain = curvature * (neutral_axis - y)
                max_concrete_strain = max(max_concrete_strain, abs(strain))

                # Stress
                stress = concrete_stress_ec2(
                    strain,
                    self.concrete['fcd'],
                    self.concrete['ec2'],
                    self.concrete['ecu']
                )

                # Force contribution
                dA = self.width * dy
                dF = stress * dA
                Fc += dF
                Mc += dF * y
        else:
            Fc = 0
            Mc = 0
            max_concrete_strain = 0

        # Steel contribution
        Fs = 0
        Ms = 0
        max_steel_strain = 0

        for y_bar, area in self.rebars:
            strain = curvature * (neutral_axis - y_bar)
            max_steel_strain = max(max_steel_strain, abs(strain))

            stress = steel_stress_ec2(
                strain,
                self.steel['fyd'],
                self.steel['Es'],
                self.steel['eyd'],
                self.steel['epsuk']
            )

            force = stress * area
            Fs += force
            Ms += force * y_bar

        N = Fc + Fs  # Axial force (negative = compression)
        M = Mc + Ms  # Moment about centroid

        return N, M, max_concrete_strain, max_steel_strain

    def find_neutral_axis(self, curvature, target_N=0, tol=0.1):
        """
        Find neutral axis position for given curvature and axial force

        Args:
            curvature: Section curvature (1/mm)
            target_N: Target axial force (N, 0 for pure bending)
            tol: Tolerance for axial force (N)

        Returns:
            float: Neutral axis position (mm from centroid)
        """
        # Bisection method
        y_top = self.height / 2
        y_bottom = -self.height / 2

        na_min = y_bottom - self.height  # Very bottom
        na_max = y_top + self.height     # Very top

        max_iter = 50
        for _ in range(max_iter):
            na = (na_min + na_max) / 2
            N, M, ec, es = self.calculate_forces(curvature, na)

            if abs(N - target_N) < tol:
                return na

            if N < target_N:
                # Need more compression, move NA up
                na_max = na
            else:
                # Need less compression, move NA down
                na_min = na

        return na

    def calculate_moment_curvature(self, max_curvature=0.0001, n_points=50):
        """
        Calculate moment-curvature response

        Args:
            max_curvature: Maximum curvature to analyze (1/mm)
            n_points: Number of points

        Returns:
            dict with 'curvature', 'moment', 'success'
        """
        curvatures = np.linspace(0, max_curvature, n_points)
        moments = []

        for curv in curvatures:
            if curv == 0:
                moments.append(0)
                continue

            try:
                na = self.find_neutral_axis(curv)
                N, M, ec, es = self.calculate_forces(curv, na)

                # Check if failure
                if ec > self.concrete['ecu'] or es > self.steel['epsuk']:
                    break

                moments.append(M)
            except:
                break

        # Trim arrays
        curvatures = curvatures[:len(moments)]

        return {
            'success': True,
            'curvature': curvatures.tolist(),
            'moment': moments,
            'message': 'Calculation successful'
        }

    def calculate_ultimate_capacity(self):
        """
        Calculate ultimate bending moment capacity

        Returns:
            dict with 'M_Rdy', 'M_Rdz', 'success'
        """
        # Start with elastic curvature estimate
        # Find maximum moment from moment-curvature
        mc_result = self.calculate_moment_curvature(max_curvature=0.0002, n_points=100)

        if mc_result['success'] and len(mc_result['moment']) > 0:
            M_Rd = max(mc_result['moment'])

            return {
                'success': True,
                'M_Rdy': M_Rd,  # Moment about y-axis (Nmm)
                'M_Rdz': 0.0,   # Not applicable for uniaxial bending
                'neutral_axis_depth': None,
                'message': 'Calculation successful'
            }
        else:
            return {
                'success': False,
                'M_Rdy': 0,
                'M_Rdz': 0,
                'neutral_axis_depth': None,
                'message': 'Failed to calculate capacity'
            }


def create_section_from_params(params):
    """
    Create section from parameter dictionary

    Args:
        params: Dict with material, geometry, and reinforcement data

    Returns:
        RectangularSection object
    """
    # Materials
    concrete = EC2Material.concrete_stress_strain(params['fck'])
    steel = EC2Material.reinforcement_stress_strain(
        params['fyk'],
        params.get('Es', 200000),
        params.get('ftk'),
        params.get('epsuk', 0.075)
    )

    # Section
    section = RectangularSection(
        params['width'],
        params['height'],
        concrete,
        steel
    )

    # Add reinforcement
    reinforcements = params.get('reinforcements', [])

    for rebar in reinforcements:
        if rebar['type'] == 'single_bar':
            section.add_rebar(rebar['y'], rebar['diameter'])

        elif rebar['type'] == 'rebar_line':
            # Calculate number of bars and position
            width = params['width']
            height = params['height']

            boundary = rebar['boundary']
            spacing = rebar['spacing']
            boundary_cover = rebar['boundary_cover']
            start_cover = rebar.get('start_cover') or boundary_cover
            end_cover = rebar.get('end_cover') or boundary_cover

            if boundary == 'bottom':
                y_pos = -height/2 + boundary_cover
                effective_length = width - start_cover - end_cover
            elif boundary == 'top':
                y_pos = height/2 - boundary_cover
                effective_length = width - start_cover - end_cover
            elif boundary == 'left':
                # For vertical boundaries, distribute along height
                effective_length = height - start_cover - end_cover
                y_pos = 0  # Will add individual bars
            elif boundary == 'right':
                effective_length = height - start_cover - end_cover
                y_pos = 0

            n_bars = int(effective_length / spacing) + 1

            if boundary in ['bottom', 'top']:
                # Horizontal layer - add as single layer
                section.add_rebar_layer(y_pos, rebar['diameter'], n_bars)
            else:
                # Vertical - add individual bars (simplified for now)
                section.add_rebar_layer(0, rebar['diameter'], n_bars)

    return section


def run_analysis(params):
    """
    Main analysis entry point

    Args:
        params: Dict with all parameters

    Returns:
        dict with results
    """
    section = create_section_from_params(params)

    # Section properties
    section_area = params['width'] * params['height']
    total_rebar_area = sum(area for _, area in section.rebars)
    reinforcement_ratio = (total_rebar_area / section_area) * 100

    # Calculations
    moment_curvature = section.calculate_moment_curvature()
    capacity = section.calculate_ultimate_capacity()

    # Visualization data
    visualization = {
        'concrete_outline': [
            [-params['width']/2, -params['height']/2],
            [params['width']/2, -params['height']/2],
            [params['width']/2, params['height']/2],
            [-params['width']/2, params['height']/2]
        ],
        'rebars': [
            {'x': 0, 'y': y, 'diameter': 12, 'id': f'rebar_{i}'}
            for i, (y, area) in enumerate(section.rebars)
        ],
        'extents': {
            'xmin': -params['width']/2,
            'xmax': params['width']/2,
            'ymin': -params['height']/2,
            'ymax': params['height']/2
        }
    }

    return {
        'moment_curvature': moment_curvature,
        'capacity': capacity,
        'section_properties': {
            'section_area': section_area,
            'total_rebar_area': total_rebar_area,
            'reinforcement_ratio': reinforcement_ratio,
            'num_rebars': len(section.rebars)
        },
        'visualization': visualization
    }


# Test standalone
if __name__ == "__main__":
    print("Testing pure Python concrete bending...")

    params = {
        'fck': 45,
        'fyk': 500,
        'ftk': 550,
        'Es': 200000,
        'epsuk': 0.075,
        'width': 1000,
        'height': 350,
        'reinforcements': [
            {'type': 'rebar_line', 'boundary': 'bottom', 'diameter': 12,
             'spacing': 100, 'boundary_cover': 50}
        ]
    }

    results = run_analysis(params)
    print(f"Success: {results['capacity']['success']}")
    print(f"M_Rd: {results['capacity']['M_Rdy']/1e6:.2f} kNm")
    print(f"Reinforcement ratio: {results['section_properties']['reinforcement_ratio']:.3f}%")
