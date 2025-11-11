#%%
"""
Debug script extracted from pynite-interface.js
This replicates the exact Python code used in the web interface
"""

import json
import numpy as np
from Pynite import FEModel3D

class PyNiteWebAnalyzer:
    def __init__(self):
        self.model = None
        self.results = {}

    def create_model(self, nodes, elements, loads):
        """Create PyNite model from input data - creates fresh model every time"""
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

        # Define a default material (Steel)
        E = 200e9  # 200 GPa in Pa
        G = 80e9   # 80 GPa in Pa
        nu = 0.3   # Poisson's ratio
        rho = 7850 # Density kg/m³
        self.model.add_material('Steel', E, G, nu, rho)

        # Add supports to nodes
        print(f"\nAdding supports:")
        for node in nodes:
            self._add_support(node['name'], node['support'])

        # Add elements with material and section properties
        print(f"\nAdding {len(elements)} elements:")
        for element in elements:
            E_element = float(element['E']) * 1e9  # Convert GPa to Pa
            I = float(element['I'])
            A = float(element['A'])
            J = I  # Torsional constant approximation

            # Create unique section for each element
            section_name = f"Section_{element['name']}"
            self.model.add_section(section_name, A, I, I, J)

            # Add member with material and section
            self.model.add_member(
                element['name'],
                element['nodeI'],
                element['nodeJ'],
                'Steel',
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
                    self._add_nodal_load(load)

            for load in loads.get('distributed', []):
                self._add_distributed_load(load)

            for load in loads.get('elementPoint', []):
                self._add_element_point_load(load)
        else:
            # Old format - backward compatibility
            print(f"\nAdding {len(loads)} loads (old format):")
            for load in loads:
                if any([float(load['fx']) != 0, float(load['fy']) != 0, float(load['mz']) != 0]):
                    self._add_nodal_load(load)

    def _add_support(self, node_name, support_type):
        """Add support constraints to a node"""
        print(f"Adding support: {node_name} = {support_type}")
        if support_type == 'fixed':
            self.model.def_support(node_name, True, True, True, True, True, True)
        elif support_type == 'pinned':
            self.model.def_support(node_name, True, True, True, False, False, False)
        elif support_type == 'roller-x':
            self.model.def_support(node_name, False, True, True, False, False, False)
        elif support_type == 'roller-y':
            self.model.def_support(node_name, True, False, True, False, False, False)
        elif support_type == 'free':
            # Free node - no constraints
            pass
        else:
            print(f"Warning: Unknown support type '{support_type}' for {node_name}")

    def _add_nodal_load(self, load):
        """Add point loads to a node"""
        node_name = load['node']
        fx = float(load['fx']) * 1000  # Convert kN to N
        fy = float(load['fy']) * 1000  # Convert kN to N
        mz = float(load['mz']) * 1000  # Convert kNm to Nm

        if fx != 0:
            self.model.add_node_load(node_name, 'FX', fx)
        if fy != 0:
            self.model.add_node_load(node_name, 'FY', fy)
        if mz != 0:
            self.model.add_node_load(node_name, 'MZ', mz)

    def _add_distributed_load(self, load):
        """Add distributed load to a member"""
        member_name = load['element']
        direction = load['direction']
        w1 = float(load['w1']) * 1000  # Convert kN/m to N/m
        w2 = float(load['w2']) * 1000  # Convert kN/m to N/m
        x1 = float(load.get('x1', 0))  # m
        x2 = float(load.get('x2', None))  # m (None means full element length)

        # Apply distributed load
        if x2 is not None:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1, x2)
        else:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1)

    def _add_element_point_load(self, load):
        """Add point load to a member at specific distance"""
        member_name = load['element']
        direction = load['direction']
        magnitude = float(load['magnitude']) * 1000  # Convert kN to N (or kNm to Nm)
        distance = float(load['distance'])  # m from element start

        self.model.add_member_pt_load(member_name, direction, magnitude, distance)

    def print_model_assembly(self):
        """Print detailed model assembly information before analysis"""
        if self.model is None:
            print("ERROR: No model created!")
            return

        print(f"\n{'='*80}")
        print("MODEL ASSEMBLY INSPECTION (Before Analysis)")
        print(f"{'='*80}\n")

        # Print nodes with supports
        print("NODES:")
        print(f"{'Name':<10} {'X':>10} {'Y':>10} {'Z':>10} {'DX':>5} {'DY':>5} {'DZ':>5} {'RX':>5} {'RY':>5} {'RZ':>5}")
        print("-" * 80)
        for name, node in self.model.nodes.items():
            dx = 'T' if node.support_DX else 'F'
            dy = 'T' if node.support_DY else 'F'
            dz = 'T' if node.support_DZ else 'F'
            rx = 'T' if node.support_RX else 'F'
            ry = 'T' if node.support_RY else 'F'
            rz = 'T' if node.support_RZ else 'F'
            print(f"{name:<10} {node.X:>10.3f} {node.Y:>10.3f} {node.Z:>10.3f} {dx:>5} {dy:>5} {dz:>5} {rx:>5} {ry:>5} {rz:>5}")

        # Print elements
        print(f"\nELEMENTS:")
        print(f"{'Name':<10} {'Node I':<10} {'Node J':<10} {'Length':>10} {'Material':<15} {'Section':<15}")
        print("-" * 80)
        for name, member in self.model.members.items():
            length = member.L()
            print(f"{name:<10} {member.i_node.name:<10} {member.j_node.name:<10} {length:>10.3f} {member.material.name:<15} {member.section.name:<15}")

        # Print nodal loads
        print(f"\nNODAL LOADS:")
        has_loads = False
        for name, node in self.model.nodes.items():
            node_loads = []
            if hasattr(node, 'NodeLoads'):
                for load in node.NodeLoads:
                    node_loads.append(f"{load[0]}={load[1]:.1f}")
            if node_loads:
                has_loads = True
                print(f"  {name}: {', '.join(node_loads)}")
        if not has_loads:
            print("  (none)")

        # Print member distributed loads
        print(f"\nDISTRIBUTED LOADS:")
        has_loads = False
        for name, member in self.model.members.items():
            if hasattr(member, 'DistLoads') and member.DistLoads:
                has_loads = True
                for load in member.DistLoads:
                    print(f"  {name}: Direction={load[0]}, w1={load[1]:.1f}, w2={load[2]:.1f}, x1={load[3]:.1f}, x2={load[4]:.1f}")
        if not has_loads:
            print("  (none)")

        # Print member point loads
        print(f"\nELEMENT POINT LOADS:")
        has_loads = False
        for name, member in self.model.members.items():
            if hasattr(member, 'PtLoads') and member.PtLoads:
                has_loads = True
                for load in member.PtLoads:
                    print(f"  {name}: Direction={load[0]}, P={load[1]:.1f}, x={load[2]:.1f}")
        if not has_loads:
            print("  (none)")

        print(f"\n{'='*80}\n")

    def analyze(self):
        """Run the structural analysis"""
        if self.model is None:
            raise ValueError("Model not created. Call create_model() first.")

        try:
            self.model.analyze()
            self._extract_results()
            return True
        except Exception as e:
            raise Exception(f"Analysis failed: {str(e)}")

    def assemble_and_analyze(self):
        """Assemble model (print inspection) then analyze - combined method"""
        self.print_model_assembly()
        return self.analyze()

    def _extract_results(self):
        """Extract results from the analyzed model - FRESH extraction every time"""
        print(f"\nExtracting results from analyzed model...")
        self.results = {
            'nodes': {},
            'elements': {},
            'diagrams': {},
            'status': 'success'
        }

        # Extract node displacements
        for node_name, node in self.model.nodes.items():
            self.results['nodes'][node_name] = {
                'DX': node.DX['Combo 1'],
                'DY': node.DY['Combo 1'],
                'DZ': node.DZ['Combo 1'],
                'RX': node.RX['Combo 1'],
                'RY': node.RY['Combo 1'],
                'RZ': node.RZ['Combo 1'],
                'reactions': {
                    'FX': getattr(node, 'RxnFX', {}).get('Combo 1', 0),
                    'FY': getattr(node, 'RxnFY', {}).get('Combo 1', 0),
                    'MZ': getattr(node, 'RxnMZ', {}).get('Combo 1', 0)
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
                deflection_array = member.deflection_array('dy', n_points=n_points)  # Local perpendicular deflection

                # Convert numpy arrays to Python lists for JSON serialization
                x_coords = moment_array[0].tolist()  # All arrays share same x-coords
                moments = moment_array[1].tolist()
                shears = shear_array[1].tolist()
                axials = axial_array[1].tolist()
                deflections = deflection_array[1].tolist()

                # Store element results with max values
                self.results['elements'][member_name] = {
                    'max_moment': float(max(abs(min(moments)), abs(max(moments)))),
                    'max_shear': float(max(abs(min(shears)), abs(max(shears)))),
                    'max_axial': float(max(abs(min(axials)), abs(max(axials)))),
                    'max_deflection': float(max(abs(min(deflections)), abs(max(deflections)))),
                    'axial_force': float(axials[0]),  # Axial at start (typically constant)
                    'length': float(L),
                    'i_node': member.i_node.name,
                    'j_node': member.j_node.name
                }

                # Store full diagram data
                self.results['diagrams'][member_name] = {
                    'x_coordinates': x_coords,
                    'moments': moments,
                    'shears': shears,
                    'axials': axials,
                    'deflections': deflections,
                    'length': float(L)
                }
                print(f"  ✓ Extracted diagram for {member_name}: {len(moments)} points")

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

    def get_results(self):
        """Return analysis results"""
        return self.results

def analyze_frame_json(input_json, print_assembly=False):
    """Analyze frame from JSON input - web interface function

    Args:
        input_json: JSON string with frame data
        print_assembly: If True, print model assembly details before analysis
    """
    try:
        data = json.loads(input_json)

        analyzer = PyNiteWebAnalyzer()
        analyzer.create_model(
            data.get('nodes', []),
            data.get('elements', []),
            data.get('loads', [])
        )

        # Optionally print assembly before analysis
        if print_assembly:
            analyzer.print_model_assembly()

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


#%%
if __name__ == "__main__":
    print("="*80)
    print("TESTING PYNITE WEB ANALYZER")
    print("="*80)

    # Test 1: Simply supported beam (matching simply_supported.py)
    print("\n\n" + "="*80)
    print("TEST 1: Simply Supported Beam (Pinned + Roller X)")
    print("="*80)

    test_data_1 = {
        'nodes': [
            {'name': 'N1', 'x': 0, 'y': 0, 'support': 'pinned'},
            {'name': 'N2', 'x': 5, 'y': 0, 'support': 'roller-x'}
        ],
        'elements': [
            {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 210, 'I': 0.001, 'A': 0.01}
        ],
        'loads': {
            'nodal': [
                {'name': 'L1', 'node': 'N2', 'fx': 100, 'fy': 0, 'mz': 0}
            ],
            'distributed': [
                {'name': 'D1', 'element': 'E1', 'direction': 'Fy', 'w1': -1, 'w2': -1, 'x1': 0, 'x2': 5}
            ],
            'elementPoint': []
        }
    }

    result_1 = analyze_frame_json(json.dumps(test_data_1), print_assembly=True)
    result_data_1 = json.loads(result_1)

    if result_data_1.get('success'):
        print("\n✓ TEST 1 PASSED - Analysis successful!")
        print(f"N1 reactions: FX={result_data_1['nodes']['N1']['reactions']['FX']:.2f} N, FY={result_data_1['nodes']['N1']['reactions']['FY']:.2f} N")
        print(f"N2 reactions: FX={result_data_1['nodes']['N2']['reactions']['FX']:.2f} N, FY={result_data_1['nodes']['N2']['reactions']['FY']:.2f} N")
    else:
        print(f"\n✗ TEST 1 FAILED: {result_data_1.get('message')}")

    # # Test 2: Pinned + Pinned (the problematic case)
    # print("\n\n" + "="*80)
    # print("TEST 2: Pinned + Pinned (Potentially Singular)")
    # print("="*80)

    # test_data_2 = {
    #     'nodes': [
    #         {'name': 'N1', 'x': 0, 'y': 0, 'support': 'pinned'},
    #         {'name': 'N2', 'x': 4, 'y': 0, 'support': 'pinned'}
    #     ],
    #     'elements': [
    #         {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 200, 'I': 0.001, 'A': 0.01}
    #     ],
    #     'loads': {
    #         'nodal': [
    #             {'name': 'L1', 'node': 'N2', 'fx': 0, 'fy': -15, 'mz': 0}
    #         ],
    #         'distributed': [],
    #         'elementPoint': []
    #     }
    # }

    # result_2 = analyze_frame_json(json.dumps(test_data_2), print_assembly=True)
    # result_data_2 = json.loads(result_2)

    # if result_data_2.get('success'):
    #     print("\n✓ TEST 2 PASSED - Analysis successful!")
    #     print(f"N1 reactions: FX={result_data_2['nodes']['N1']['reactions']['FX']:.2f} N, FY={result_data_2['nodes']['N1']['reactions']['FY']:.2f} N")
    #     print(f"N2 reactions: FX={result_data_2['nodes']['N2']['reactions']['FX']:.2f} N, FY={result_data_2['nodes']['N2']['reactions']['FY']:.2f} N")
    #     print(f"N1 DX={result_data_2['nodes']['N1']['DX']:.6f} m, DY={result_data_2['nodes']['N1']['DY']:.6f} m")
    #     print(f"N2 DX={result_data_2['nodes']['N2']['DX']:.6f} m, DY={result_data_2['nodes']['N2']['DY']:.6f} m")
    # else:
    #     print(f"\n✗ TEST 2 FAILED: {result_data_2.get('message')}")

    # # Test 3: Cantilever (should always work)
    # print("\n\n" + "="*80)
    # print("TEST 3: Cantilever (Fixed + Free)")
    # print("="*80)

    # test_data_3 = {
    #     'nodes': [
    #         {'name': 'N1', 'x': 0, 'y': 0, 'support': 'fixed'},
    #         {'name': 'N2', 'x': 4, 'y': 0, 'support': 'free'}
    #     ],
    #     'elements': [
    #         {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 200, 'I': 0.001, 'A': 0.01}
    #     ],
    #     'loads': {
    #         'nodal': [
    #             {'name': 'L1', 'node': 'N2', 'fx': 0, 'fy': -15, 'mz': 0}
    #         ],
    #         'distributed': [],
    #         'elementPoint': []
    #     }
    # }

    # result_3 = analyze_frame_json(json.dumps(test_data_3), print_assembly=True)
    # result_data_3 = json.loads(result_3)

    # if result_data_3.get('success'):
    #     print("\n✓ TEST 3 PASSED - Analysis successful!")
    #     print(f"N1 reactions: FX={result_data_3['nodes']['N1']['reactions']['FX']:.2f} N, FY={result_data_3['nodes']['N1']['reactions']['FY']:.2f} N, MZ={result_data_3['nodes']['N1']['reactions']['MZ']:.2f} Nm")
    #     print(f"N2 displacement: DY={result_data_3['nodes']['N2']['DY']*1000:.3f} mm")
    # else:
    #     print(f"\n✗ TEST 3 FAILED: {result_data_3.get('message')}")

    # print("\n" + "="*80)
    # print("TESTING COMPLETE")
    # print("="*80)

# %%
# manually creating a model for testing - not using functions to comine the procedure

data = {
        'nodes': [
            {'name': 'N1', 'x': 0, 'y': 0, 'support': 'pinned'},
            {'name': 'N2', 'x': 5, 'y': 0, 'support': 'roller-x'}
        ],
        'elements': [
            {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 210, 'I': 0.001, 'A': 0.01}
        ],
        'loads': {
            'nodal': [
                {'name': 'L1', 'node': 'N2', 'fx': 100, 'fy': 0, 'mz': 0}
            ],
            'distributed': [
                {'name': 'D1', 'element': 'E1', 'direction': 'Fy', 'w1': -1, 'w2': -1, 'x1': 0, 'x2': 5}
            ],
            'elementPoint': []
        }
    }

beam = FEModel3D()
for node in data['nodes']:
    beam.add_node(node['name'], float(node['x']), float(node['y']), 0.0)
    print(f"  Added node: {node['name']} at ({node['x']}, {node['y']})")# %%



for e in data['elements']:
    element_material = beam.add_material('Steel', 210e9, 80e9, 0.3, 7850)
    
    beam.add_member(
        e['name'],
        e['nodeI'],
        e['nodeJ'],
        'Steel',
        'MySection'
    )
# %%
# use wrapper functions of the class to initialize model
beam2 = PyNiteWebAnalyzer()
beam2.create_model(
    data.get('nodes', []),
    data.get('elements', []),
    data.get('loads', [])
)