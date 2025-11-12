"""
PyNite Frame Analyzer for 2dfea
Browser-compatible 2D frame analysis using PyNite

Can run standalone for testing:
    python pynite_analyzer.py
Or in Pyodide (browser) environment
"""

import json
import sys
from typing import Dict, List, Any, Optional

try:
    import numpy as np
    from Pynite import FEModel3D
    PYNITE_AVAILABLE = True
except ImportError:
    PYNITE_AVAILABLE = False
    print("Warning: PyNite not available. Install with: pip install PyNiteFEA")


class PyNiteWebAnalyzer:
    """2D Frame analyzer using PyNite - browser and desktop compatible"""

    def __init__(self):
        self.model = None
        self.results = {}

    def create_model(self, nodes: List[Dict], elements: List[Dict], loads: Any):
        """Create PyNite model from input data - creates fresh model every time"""
        if not PYNITE_AVAILABLE:
            raise RuntimeError("PyNite is not installed")

        # Create brand new model (not reusing old one)
        self.model = FEModel3D()
        import time
        print(f"\n{'='*60}")
        print(f"Creating FRESH FE model at {time.time()}")
        print(f"  Nodes: {len(nodes)}, Elements: {len(elements)}")
        print(f"{'='*60}")

        # Add nodes
        for node in nodes:
            self.model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)
            print(f"  Added node: {node['name']} at ({node['x']}, {node['y']})")

        # Add supports BEFORE elements (PyNite requirement!)
        print(f"\nAdding supports:")
        for node in nodes:
            self._add_support(node['name'], node['support'])

        # Add elements with unique material and section properties per element
        print(f"\nAdding {len(elements)} elements:")
        for element in elements:
            E_element = float(element['E']) * 1e9  # Convert GPa to Pa
            I = float(element['I'])
            A = float(element['A'])
            J = I  # Torsional constant approximation

            # Create unique material for each element (uses element-specific E)
            material_name = f"Material_{element['name']}"
            nu = 0.3   # Poisson's ratio (typical for steel)
            rho = 7850 # Density kg/m³ (typical for steel)
            G = E_element / (2 * (1 + nu))  # Calculate shear modulus from E
            self.model.add_material(material_name, E_element, G, nu, rho)
            print(f"    Material {material_name}: E={E_element/1e9:.1f} GPa, G={G/1e9:.1f} GPa")

            # Create unique section for each element
            section_name = f"Section_{element['name']}"
            self.model.add_section(section_name, A, I, I, J)

            # Add member with unique material and section
            self.model.add_member(
                element['name'],
                element['nodeI'],
                element['nodeJ'],
                material_name,
                section_name
            )
            print(f"  Added element: {element['name']} from {element['nodeI']} to {element['nodeJ']}")

        # Add loads - handle both old array format and new object format
        if isinstance(loads, dict):
            # New format with load types
            print(f"\nAdding loads:")
            print(f"  Nodal loads: {len(loads.get('nodal', []))}")
            print(f"  Distributed loads: {len(loads.get('distributed', []))}")
            print(f"  Element point loads: {len(loads.get('elementPoint', []))}")

            for load in loads.get('nodal', []):
                if any([float(load['fx']) != 0, float(load['fy']) != 0, float(load['mz']) != 0]):
                    case_name = load.get('case')
                    self._add_nodal_load(load, case=case_name)

            for load in loads.get('distributed', []):
                case_name = load.get('case')
                self._add_distributed_load(load, case=case_name)

            for load in loads.get('elementPoint', []):
                case_name = load.get('case')
                self._add_element_point_load(load, case=case_name)
        else:
            # Old format - backward compatibility
            print(f"\nAdding {len(loads)} loads (old format):")
            for load in loads:
                if any([float(load['fx']) != 0, float(load['fy']) != 0, float(load['mz']) != 0]):
                    self._add_nodal_load(load)

    def _add_support(self, node_name: str, support_type: str):
        """Add support constraints to a node"""
        print(f"Adding support: {node_name} = {support_type}")
        if support_type == 'fixed':
            dx = True # constrained for translation in x
            dy = True # constrained for translation in y
            dz = True # constrained for translation in z
            rx = True # constrained for rotation about x
            ry = True # constrained for rotation about y
            rz = True # constrained for rotation about z

            self.model.def_support(node_name, dx, dy, dz, rx, ry, rz)

        elif support_type == 'pinned':
            dx = True # constrained for translation in x
            dy = True # constrained for translation in y
            dz = True # constrained for translation in z
            rx = True # constrained for rotation about x
            ry = True # constrained for rotation about y
            rz = False # constrained for rotation about z
            self.model.def_support(node_name, dx, dy, dz, rx, ry, rz)

        elif support_type == 'roller-x':
            dx = False # constrained for translation in x
            dy = True # constrained for translation in y
            dz = True # constrained for translation in z
            rx = True # constrained for rotation about x
            ry = True # constrained for rotation about y
            rz = False # constrained for rotation about z

            self.model.def_support(node_name, False, True, True, True, False, False)

        elif support_type == 'roller-y':

            dx = True # constrained for translation in x
            dy = False # constrained for translation in y
            dz = True # constrained for translation in z
            rx = True # constrained for rotation about x
            ry = True # constrained for rotation about y
            rz = False # constrained for rotation about z

            self.model.def_support(node_name, True, False, True, True, False, False)

        elif support_type == 'free':
            # Free node - no constraints
            pass
        else:
            print(f"Warning: Unknown support type '{support_type}' for {node_name}")

    def _normalize_direction(self, direction: str) -> str:
        """
        Normalize load direction string for PyNite compatibility

        PyNite convention:
        - Local: 'Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz' (uppercase F/M + lowercase axis)
        - Global: 'FX', 'FY', 'FZ', 'MX', 'MY', 'MZ' (all uppercase)

        The axis letter (second character) determines coordinate system:
        - Lowercase axis letter (x, y, z) → Local coordinates
        - Uppercase axis letter (X, Y, Z) → Global coordinates
        """
        if not direction or len(direction) < 2:
            return direction

        # First character should be F or M (Force or Moment)
        first_char = direction[0].upper()
        # Second character (axis) determines if local or global
        axis_char = direction[1]

        if axis_char.isupper():
            # Global coordinates - all uppercase
            return first_char + axis_char.upper()
        else:
            # Local coordinates - F/M uppercase + axis lowercase
            return first_char + axis_char.lower()

    def _add_nodal_load(self, load: Dict, case: Optional[str] = None):
        """Add point loads to a node with optional case parameter"""
        node_name = load['node']
        fx = float(load['fx']) * 1000  # Convert kN to N
        fy = float(load['fy']) * 1000  # Convert kN to N
        mz = float(load['mz']) * 1000  # Convert kNm to Nm

        if fx != 0:
            self.model.add_node_load(node_name, 'FX', fx, case=case)
        if fy != 0:
            self.model.add_node_load(node_name, 'FY', fy, case=case)
        if mz != 0:
            self.model.add_node_load(node_name, 'MZ', mz, case=case)

    def _add_distributed_load(self, load: Dict, case: Optional[str] = None):
        """Add distributed load to a member with optional case parameter"""
        member_name = load['element']
        direction = self._normalize_direction(load['direction'])
        w1 = float(load['w1']) * 1000  # Convert kN/m to N/m
        w2 = float(load['w2']) * 1000  # Convert kN/m to N/m
        x1 = float(load.get('x1', 0))  # m
        x2 = float(load.get('x2', None))  # m (None means full element length)

        # Apply distributed load
        if x2 is not None:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1, x2, case=case)
        else:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1, case=case)

    def _add_element_point_load(self, load: Dict, case: Optional[str] = None):
        """Add point load to a member at specific distance with optional case parameter"""
        member_name = load['element']
        direction = self._normalize_direction(load['direction'])
        magnitude = float(load['magnitude']) * 1000  # Convert kN to N (or kNm to Nm)
        distance = float(load['distance'])  # m from element start

        self.model.add_member_pt_load(member_name, direction, magnitude, distance, case=case)

    def analyze(self) -> bool:
        """
        Run the structural analysis

        IMPORTANT: PyNite requires explicit load combinations!
        We create a default 'Combo 1' that includes all loads with factor 1.0
        """
        if self.model is None:
            raise ValueError("Model not created. Call create_model() first.")

        try:
            # Collect all unique load case names from the model
            load_cases = set()

            # Check node loads
            for node in self.model.nodes.values():
                for load_tuple in node.NodeLoads:
                    case_name = load_tuple[2]  # (direction, magnitude, case)
                    if case_name is not None:
                        load_cases.add(case_name)

            # Check member loads
            for member in self.model.members.values():
                for load_tuple in member.DistLoads:
                    case_name = load_tuple[5] if len(load_tuple) > 5 else None
                    if case_name is not None:
                        load_cases.add(case_name)
                for load_tuple in member.PtLoads:
                    case_name = load_tuple[3] if len(load_tuple) > 3 else None
                    if case_name is not None:
                        load_cases.add(case_name)

            # Create load combinations
            # If no named cases, create a default combo with all loads (case=None)
            if not load_cases:
                # All loads have case=None, create combo that uses them
                self.model.add_load_combo('Combo 1', factors={None: 1.0})
            else:
                # Create individual combos for each case
                for case_name in load_cases:
                    self.model.add_load_combo(case_name, factors={case_name: 1.0})

                # Also create a combined 'Combo 1' if needed
                if 'Combo 1' not in load_cases:
                    combo_factors = {case: 1.0 for case in load_cases}
                    self.model.add_load_combo('Combo 1', factors=combo_factors)

            print(f"Created load combinations: {list(load_cases) if load_cases else ['Combo 1 (default)']}")

            # Run analysis
            self.model.analyze()
            self._extract_results()
            return True
        except Exception as e:
            raise Exception(f"Analysis failed: {str(e)}")

    def _extract_results(self):
        """
        Extract results from the analyzed model

        UNIT CONVERSION POLICY (CENTRALIZED):
        =====================================
        PyNite internal: m, N, Nm
        Output to frontend: mm, kN, kNm

        Conversions applied here (and ONLY here):
        - Displacements: m → mm (×1000)
        - Rotations: rad → mrad (×1000)
        - Forces: N → kN (÷1000)
        - Moments: Nm → kNm (÷1000)

        Frontend receives engineering units directly - NO conversion needed!
        """
        print(f"\nExtracting results from analyzed model...")
        self.results = {
            'nodes': {},
            'elements': {},
            'diagrams': {},
            'status': 'success'
        }

        # Extract node displacements and reactions
        # Convert: m → mm, rad → mrad, N → kN, Nm → kNm
        for node_name, node in self.model.nodes.items():
            self.results['nodes'][node_name] = {
                # Displacements in mm (PyNite gives m)
                'DX': node.DX['Combo 1'] * 1000,
                'DY': node.DY['Combo 1'] * 1000,
                'DZ': node.DZ['Combo 1'] * 1000,
                # Rotations in rad
                'RX': node.RX['Combo 1'],
                'RY': node.RY['Combo 1'],
                'RZ': node.RZ['Combo 1'],
                # Reactions in kN and kNm (PyNite gives N and Nm)
                'reactions': {
                    'FX': getattr(node, 'RxnFX', {}).get('Combo 1', 0) / 1000,
                    'FY': getattr(node, 'RxnFY', {}).get('Combo 1', 0) / 1000,
                    'MZ': getattr(node, 'RxnMZ', {}).get('Combo 1', 0) / 1000
                }
            }

        # Extract member forces and generate diagrams using PyNite array methods
        for member_name, member in self.model.members.items():
            try:
                # Get member length
                L = member.L()

                # Use PyNite's array methods directly (much more efficient!)
                n_points = 11  # Ensures exact midpoint at index 5

                # Get diagram arrays directly from PyNite (2D arrays: [x_coords, values])
                moment_array = member.moment_array('Mz', n_points=n_points)
                shear_array = member.shear_array('Fy', n_points=n_points)
                axial_array = member.axial_array(n_points=n_points)
                deflection_dx_array = member.deflection_array('dx', n_points=n_points)  # Local axial deflection
                deflection_dy_array = member.deflection_array('dy', n_points=n_points)  # Local perpendicular deflection

                # Convert numpy arrays to Python lists (PyNite units: m, N, Nm)
                x_coords = moment_array[0].tolist()  # m (keep as is)
                moments_N_m = moment_array[1].tolist()  # Nm (need → kNm)
                shears_N = shear_array[1].tolist()  # N (need → kN)
                axials_N = axial_array[1].tolist()  # N (need → kN)
                deflections_dx_m = deflection_dx_array[1].tolist()  # m (need → mm)
                deflections_dy_m = deflection_dy_array[1].tolist()  # m (need → mm)

                # Convert to engineering units for frontend
                moments = [m / 1000 for m in moments_N_m]  # Nm → kNm
                shears = [s / 1000 for s in shears_N]  # N → kN
                axials = [a / 1000 for a in axials_N]  # N → kN
                deflections_dx = [d * 1000 for d in deflections_dx_m]  # m → mm
                deflections_dy = [d * 1000 for d in deflections_dy_m]  # m → mm

                # Store element results with max values (in engineering units)
                self.results['elements'][member_name] = {
                    'max_moment': float(max(abs(min(moments)), abs(max(moments)))),  # kNm
                    'max_shear': float(max(abs(min(shears)), abs(max(shears)))),  # kN
                    'max_axial': float(max(abs(min(axials)), abs(max(axials)))),  # kN
                    'max_deflection': float(max(abs(min(deflections_dy)), abs(max(deflections_dy)))),  # mm (perpendicular)
                    'axial_force': float(axials[0]),  # kN at start
                    'length': float(L),  # m
                    'i_node': member.i_node.name,
                    'j_node': member.j_node.name
                }

                # Store full diagram data (in engineering units)
                self.results['diagrams'][member_name] = {
                    'x_coordinates': x_coords,  # m
                    'moments': moments,  # kNm
                    'shears': shears,  # kN
                    'axials': axials,  # kN
                    'deflections_dx': deflections_dx,  # mm - local axial
                    'deflections_dy': deflections_dy,  # mm - local perpendicular
                    'length': float(L)  # m
                }
                print(f"  * Extracted diagram for {member_name}: {len(moments)} points")

            except Exception as e:
                # Log detailed error for debugging
                print(f"Error extracting results for {member_name}: {str(e)}")

                # Fallback with zeros
                self.results['elements'][member_name] = {
                    'max_moment': 0,
                    'max_shear': 0,
                    'max_axial': 0,
                    'max_deflection': 0,
                    'axial_force': 0,
                    'length': 0,
                    'i_node': '',
                    'j_node': '',
                    'error': str(e)
                }

    def get_results(self) -> Dict:
        """Return analysis results"""
        return self.results


# Public API functions (called from JavaScript worker)

def analyze_frame_json(input_json: str) -> str:
    """Analyze frame from JSON input - main entry point"""
    try:
        data = json.loads(input_json)

        analyzer = PyNiteWebAnalyzer()
        analyzer.create_model(
            data.get('nodes', []),
            data.get('elements', []),
            data.get('loads', [])
        )

        success = analyzer.analyze()
        results = analyzer.get_results()

        if success:
            results['success'] = True
            results['message'] = 'Analysis completed successfully'
        else:
            results['success'] = False
            results['message'] = 'Analysis failed'

        return json.dumps(results)

    except Exception as e:
        return json.dumps({
            'success': False,
            'message': f'Error: {str(e)}',
            'nodes': {},
            'elements': {},
            'diagrams': {}
        })


def analyze_frame_single_case(input_json: str, case_name: str) -> str:
    """Analyze frame for a single load case"""
    try:
        data = json.loads(input_json)

        # Filter loads by case
        all_loads = data.get('loads', {})
        case_loads = {
            'nodal': [l for l in all_loads.get('nodal', []) if l.get('case') == case_name],
            'distributed': [l for l in all_loads.get('distributed', []) if l.get('case') == case_name],
            'elementPoint': [l for l in all_loads.get('elementPoint', []) if l.get('case') == case_name]
        }

        # Create analyzer and run
        analyzer = PyNiteWebAnalyzer()
        analyzer.create_model(
            data.get('nodes', []),
            data.get('elements', []),
            case_loads
        )

        success = analyzer.analyze()
        results = analyzer.get_results()

        if success:
            results['success'] = True
            results['message'] = f'Analysis completed for load case: {case_name}'
            results['caseName'] = case_name
        else:
            results['success'] = False
            results['message'] = f'Analysis failed for load case: {case_name}'

        return json.dumps(results)

    except Exception as e:
        return json.dumps({
            'success': False,
            'message': f'Error analyzing case {case_name}: {str(e)}',
            'nodes': {},
            'elements': {},
            'diagrams': {}
        })


def analyze_frame_combination(input_json: str, combo_json: str) -> str:
    """Analyze frame for a load combination with factors"""
    try:
        data = json.loads(input_json)
        combo = json.loads(combo_json)

        combo_name = combo.get('name', 'Combination')
        factors = combo.get('factors', {})

        # Get all loads
        all_loads = data.get('loads', {})

        # Apply factors to loads
        combined_loads = {
            'nodal': [],
            'distributed': [],
            'elementPoint': []
        }

        # Process each load case with its factor
        for case_name, factor in factors.items():
            if factor == 0:
                continue

            # Process nodal loads
            case_nodal = [l for l in all_loads.get('nodal', []) if l.get('case') == case_name]
            for load in case_nodal:
                combined_loads['nodal'].append({
                    'name': load.get('name', ''),
                    'node': load['node'],
                    'fx': float(load['fx']) * factor,
                    'fy': float(load['fy']) * factor,
                    'mz': float(load['mz']) * factor,
                    'case': combo_name
                })

            # Process distributed loads
            case_dist = [l for l in all_loads.get('distributed', []) if l.get('case') == case_name]
            for load in case_dist:
                combined_loads['distributed'].append({
                    'name': load.get('name', ''),
                    'element': load['element'],
                    'direction': load['direction'],
                    'w1': float(load['w1']) * factor,
                    'w2': float(load['w2']) * factor,
                    'x1': float(load.get('x1', 0)),
                    'x2': float(load.get('x2', 0)),
                    'case': combo_name
                })

            # Process element point loads
            case_elem = [l for l in all_loads.get('elementPoint', []) if l.get('case') == case_name]
            for load in case_elem:
                combined_loads['elementPoint'].append({
                    'name': load.get('name', ''),
                    'element': load['element'],
                    'distance': float(load['distance']),
                    'direction': load['direction'],
                    'magnitude': float(load['magnitude']) * factor,
                    'case': combo_name
                })

        # Create analyzer and run
        analyzer = PyNiteWebAnalyzer()
        analyzer.create_model(
            data.get('nodes', []),
            data.get('elements', []),
            combined_loads
        )

        success = analyzer.analyze()
        results = analyzer.get_results()

        if success:
            results['success'] = True
            results['message'] = f'Analysis completed for combination: {combo_name}'
            results['combinationName'] = combo_name
        else:
            results['success'] = False
            results['message'] = f'Analysis failed for combination: {combo_name}'

        return json.dumps(results)

    except Exception as e:
        return json.dumps({
            'success': False,
            'message': f'Error analyzing combination: {str(e)}',
            'nodes': {},
            'elements': {},
            'diagrams': {}
        })


# Standalone testing capability
if __name__ == '__main__':
    if not PYNITE_AVAILABLE:
        print("PyNite not installed. Install: pip install PyNiteFEA")
        sys.exit(1)

    print("="*60)
    print("CANTILEVER BEAM TEST")
    print("="*60)

    # Create analyzer directly (not via JSON)
    analyzer = PyNiteWebAnalyzer()

    # Define structure
    nodes = [
        {'name': 'N1', 'x': 0, 'y': 0, 'support': 'fixed'},
        {'name': 'N2', 'x': 4, 'y': 0, 'support': 'free'}
    ]
    elements = [
        {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 210, 'I': 1e-4, 'A': 1e-3}
    ]
    loads = {
        'nodal': [{'node': 'N2', 'fx': 0, 'fy': -10, 'mz': 0}],  # NO case
        'distributed': [],
        'elementPoint': []
    }

    # Build model
    analyzer.create_model(nodes, elements, loads)

    # Inspect model before analysis
    print(f"\n{'='*60}")
    print("MODEL INSPECTION (before analysis):")
    print(f"{'='*60}")
    print(f"Nodes in model: {list(analyzer.model.nodes.keys())}")
    print(f"Members in model: {list(analyzer.model.members.keys())}")

    # Check loads on node
    print("\nNode N2 loads:")
    sample_node = analyzer.model.nodes['N2']
    print(f"  NodeLoads type: {type(sample_node.NodeLoads)}")
    print(f"  NodeLoads content: {sample_node.NodeLoads}")

    # Check available attributes
    print("\nModel attributes:")
    print(f"  Has LoadCombos? {hasattr(analyzer.model, 'LoadCombos')}")
    print(f"  Has LoadCases? {hasattr(analyzer.model, 'LoadCases')}")

    # Analyze
    print(f"\n{'='*60}")
    print("RUNNING ANALYSIS...")
    print(f"{'='*60}")
    analyzer.analyze()

    # Inspect what keys PyNite actually created
    print(f"\n{'='*60}")
    print("POST-ANALYSIS INSPECTION:")
    print(f"{'='*60}")
    sample_node_post = analyzer.model.nodes['N2']
    print(f"N2.DY keys: {list(sample_node_post.DY.keys())}")
    print(f"N2.DY values: {sample_node_post.DY}")

    # Check results
    print(f"\n{'='*60}")
    print("RESULTS (engineering units):")
    print(f"{'='*60}")

    for node_name in ['N1', 'N2']:
        data = analyzer.results['nodes'][node_name]
        print(f"\n{node_name}:")
        print(f"  DY = {data['DY']:.3f} mm")
        print(f"  RZ = {data['RZ']:.6f} rad")
        if abs(data['reactions']['FY']) > 0.01:
            print(f"  Reaction FY = {data['reactions']['FY']:.2f} kN")
        if abs(data['reactions']['MZ']) > 0.01:
            print(f"  Reaction MZ = {data['reactions']['MZ']:.2f} kNm")

    elem_data = analyzer.results['elements']['E1']
    print(f"\nE1:")
    print(f"  Max Moment = {elem_data['max_moment']:.2f} kNm")
    print(f"  Max Shear = {elem_data['max_shear']:.2f} kN")
    print(f"  Max Deflection = {elem_data['max_deflection']:.2f} mm")
