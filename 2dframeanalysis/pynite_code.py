#%%
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
        print(f"\\n{'='*60}")
        print(f"Creating FRESH FE model at {time.time()}")
        print(f"  Nodes: {len(nodes)}, Elements: {len(elements)}")
        print(f"{'='*60}")

        # Add nodes
        for node in nodes:
            self.model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)
            print(f"  Added node: {node['name']} at ({node['x']}, {node['y']})")

        # Define a default material (Steel)
        E = 210e9  # 200 GPa in Pa
        G = 80e9   # 80 GPa in Pa
        nu = 0.3   # Poisson's ratio
        rho = 7850 # Density kg/m³
        self.model.add_material('Steel', E, G, nu, rho)

        # Add supports BEFORE elements (PyNite requirement!)
        print(f"\\nAdding supports:")
        for node in nodes:
            self._add_support(node['name'], node['support'])

        # Add elements with material and section properties
        print(f"\\nAdding {len(elements)} elements:")
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
            print(f"\\nAdding loads:")
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
            print(f"\\nAdding {len(loads)} loads (old format):")
            for load in loads:
                if any([float(load['fx']) != 0, float(load['fy']) != 0, float(load['mz']) != 0]):
                    self._add_nodal_load(load)

    def _add_support(self, node_name, support_type):
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

    def _add_nodal_load(self, load, case=None):
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

    def _add_distributed_load(self, load, case=None):
        """Add distributed load to a member with optional case parameter"""
        member_name = load['element']
        direction = load['direction']
        w1 = float(load['w1']) * 1000  # Convert kN/m to N/m
        w2 = float(load['w2']) * 1000  # Convert kN/m to N/m
        x1 = float(load.get('x1', 0))  # m
        x2 = float(load.get('x2', None))  # m (None means full element length)

        # Apply distributed load
        if x2 is not None:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1, x2, case=case)
        else:
            self.model.add_member_dist_load(member_name, direction, w1, w2, x1, case=case)

    def _add_element_point_load(self, load, case=None):
        """Add point load to a member at specific distance with optional case parameter"""
        member_name = load['element']
        direction = load['direction']
        magnitude = float(load['magnitude']) * 1000  # Convert kN to N (or kNm to Nm)
        distance = float(load['distance'])  # m from element start

        self.model.add_member_pt_load(member_name, direction, magnitude, distance, case=case)

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

    def _extract_results(self):
        """Extract results from the analyzed model - FRESH extraction every time"""
        print(f"\\nExtracting results from analyzed model...")
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
                print("Got L={L} for member {member_name}")

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

def analyze_frame_json(input_json):
    """Analyze frame from JSON input - web interface function"""
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

def analyze_frame_single_case(input_json, case_name):
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

        # Convert to old format for analyzer
        loads_list = []
        for load in case_loads['nodal']:
            loads_list.append(load)
        for load in case_loads['distributed']:
            loads_list.append(load)
        for load in case_loads['elementPoint']:
            loads_list.append(load)

        # Create analyzer and run
        analyzer = PyNiteWebAnalyzer()
        analyzer.create_model(
            data.get('nodes', []),
            data.get('elements', []),
            loads_list
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

def analyze_frame_combination(input_json, combo_json):
    """Analyze frame for a load combination with factors"""
    try:
        data = json.loads(input_json)
        combo = json.loads(combo_json)

        combo_name = combo.get('name', 'Combination')
        factors = combo.get('factors', {})

        # Get all loads
        all_loads = data.get('loads', {})

        # Apply factors to loads
        combined_loads = []

        # Process nodal loads
        for case_name, factor in factors.items():
            if factor == 0:
                continue

            case_nodal = [l for l in all_loads.get('nodal', []) if l.get('case') == case_name]
            for load in case_nodal:
                combined_loads.append({
                    'name': load['name'],
                    'type': load['type'],
                    'node': load['node'],
                    'fx': float(load['fx']) * factor,
                    'fy': float(load['fy']) * factor,
                    'mz': float(load['mz']) * factor,
                    'case': combo_name
                })

            # Process distributed loads
            case_dist = [l for l in all_loads.get('distributed', []) if l.get('case') == case_name]
            for load in case_dist:
                combined_loads.append({
                    'name': load['name'],
                    'type': load['type'],
                    'element': load['element'],
                    'direction': load['direction'],
                    'w1': float(load['w1']) * factor,
                    'w2': float(load['w2']) * factor,
                    'x1': float(load['x1']),
                    'x2': float(load['x2']),
                    'case': combo_name
                })

            # Process element point loads
            case_elem = [l for l in all_loads.get('elementPoint', []) if l.get('case') == case_name]
            for load in case_elem:
                combined_loads.append({
                    'name': load['name'],
                    'type': load['type'],
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

# Global storage for the analyzed model
current_model = None
current_load_cases = []
current_combinations = []

def extract_results_for_combo(model, combo_name):
    """Extract results for any combo (load case or combination) using combo_name"""
    results = {
        'nodes': {},
        'elements': {},
        'diagrams': {}
    }

    # Extract node displacements and reactions for this combo
    for node_name, node in model.nodes.items():
        results['nodes'][node_name] = {
            'DX': node.DX.get(combo_name, 0),
            'DY': node.DY.get(combo_name, 0),
            'DZ': node.DZ.get(combo_name, 0),
            'RX': node.RX.get(combo_name, 0),
            'RY': node.RY.get(combo_name, 0),
            'RZ': node.RZ.get(combo_name, 0),
            'reactions': {
                'FX': getattr(node, 'RxnFX', {}).get(combo_name, 0),
                'FY': getattr(node, 'RxnFY', {}).get(combo_name, 0),
                'MZ': getattr(node, 'RxnMZ', {}).get(combo_name, 0)
            }
        }

    # Extract member forces and diagrams using combo_name
    for elem_name, member in model.members.items():
        try:
            L = member.L()
            n_points = 11

            # Use PyNite's combo_name parameter to extract results
            # axial_array doesn't take direction, others do
            moment_array = member.moment_array('Mz', n_points=n_points, combo_name=combo_name)
            shear_array = member.shear_array('Fy', n_points=n_points, combo_name=combo_name)
            axial_array = member.axial_array(n_points=n_points, combo_name=combo_name)
            deflection_array = member.deflection_array('dy', n_points=n_points, combo_name=combo_name)

            # Convert to lists for JSON
            x_coords = moment_array[0].tolist()
            moments = moment_array[1].tolist()
            shears = shear_array[1].tolist()
            axials = axial_array[1].tolist()
            deflections = deflection_array[1].tolist()

            # Store element results
            results['elements'][elem_name] = {
                'max_moment': float(max(abs(min(moments)), abs(max(moments)))),
                'max_shear': float(max(abs(min(shears)), abs(max(shears)))),
                'max_axial': float(max(abs(min(axials)), abs(max(axials)))),
                'max_deflection': float(max(abs(min(deflections)), abs(max(deflections)))),
                'axial_force': float(axials[0]),
                'length': float(L),
                'i_node': member.i_node.name,
                'j_node': member.j_node.name
            }

            # Store diagram data
            results['diagrams'][elem_name] = {
                'x_coordinates': x_coords,
                'moments': moments,
                'shears': shears,
                'axials': axials,
                'deflections': deflections,
                'length': float(L)
            }

        except Exception as e:
            print(f"Error extracting results for {elem_name} combo {combo_name}: {str(e)}")
            results['elements'][elem_name] = {
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

    return results

def analyze_and_store_model(input_json):
    """
    Build and analyze model, store it globally for later queries.
    Returns success/failure without extracting results.
    """
    global current_model, current_load_cases, current_combinations

    try:
        data = json.loads(input_json)

        # Create model
        model = FEModel3D()

        # Add nodes
        for node in data.get('nodes', []):
            model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)

        # Add material
        E = 210e9
        G = 80e9
        nu = 0.3
        rho = 7850
        model.add_material('Steel', E, G, nu, rho)

        # Add supports
        for node in data.get('nodes', []):
            support_type = node['support']
            if support_type == 'fixed':
                model.def_support(node['name'], True, True, True, True, True, True)
            elif support_type == 'pinned':
                model.def_support(node['name'], True, True, True, True, True, False)
            elif support_type == 'roller-x':
                model.def_support(node['name'], False, True, True, True, False, False)
            elif support_type == 'roller-y':
                model.def_support(node['name'], True, False, True, True, False, False)

        # Add elements
        for element in data.get('elements', []):
            E_element = float(element['E']) * 1e9
            I = float(element['I'])
            A = float(element['A'])
            J = I

            section_name = f"Section_{element['name']}"
            model.add_section(section_name, A, I, I, J)

            model.add_member(
                element['name'],
                element['nodeI'],
                element['nodeJ'],
                'Steel',
                section_name
            )

        # Add loads with case parameter
        loads = data.get('loads', {})

        for load in loads.get('nodal', []):
            case_name = load.get('case')
            fx = float(load['fx']) * 1000
            fy = float(load['fy']) * 1000
            mz = float(load['mz']) * 1000

            if fx != 0:
                model.add_node_load(load['node'], 'FX', fx, case=case_name)
            if fy != 0:
                model.add_node_load(load['node'], 'FY', fy, case=case_name)
            if mz != 0:
                model.add_node_load(load['node'], 'MZ', mz, case=case_name)

        for load in loads.get('distributed', []):
            case_name = load.get('case')
            w1 = float(load['w1']) * 1000
            w2 = float(load['w2']) * 1000
            x1 = float(load.get('x1', 0))
            x2 = load.get('x2')

            if x2 is not None:
                model.add_member_dist_load(load['element'], load['direction'], w1, w2, x1, float(x2), case=case_name)
            else:
                model.add_member_dist_load(load['element'], load['direction'], w1, w2, x1, case=case_name)

        for load in loads.get('elementPoint', []):
            case_name = load.get('case')
            magnitude = float(load['magnitude']) * 1000
            distance = float(load['distance'])

            model.add_member_pt_load(load['element'], load['direction'], magnitude, distance, case=case_name)

        # Store load case and combination info
        current_load_cases = [lc['name'] for lc in data.get('loadCases', [])]
        current_combinations = [combo['name'] for combo in data.get('loadCombinations', [])]

        # Add load cases as combinations with factor 1.0
        for load_case in data.get('loadCases', []):
            case_name = load_case['name']
            model.add_load_combo(name=case_name, factors={case_name: 1.0})

        # Add user-defined combinations
        for combo in data.get('loadCombinations', []):
            combo_name = combo['name']
            factors = combo['factors']
            model.add_load_combo(name=combo_name, factors=factors)

        # Run analysis once
        print(f"\\nAnalyzing model with {len(data.get('loadCases', []))} load cases and {len(data.get('loadCombinations', []))} combinations...")
        model.analyze()
        print("✓ Analysis complete. Model stored in memory.")

        # Store model globally
        current_model = model

        return json.dumps({
            'success': True,
            'message': 'Model analyzed and stored successfully',
            'loadCases': current_load_cases,
            'combinations': current_combinations
        })

    except Exception as e:
        import traceback
        return json.dumps({
            'success': False,
            'message': f'Error analyzing model: {str(e)}',
            'traceback': traceback.format_exc()
        })

def extract_for_combo(combo_name):
    """
    Extract results for a specific combo from the stored model.
    This is called from JavaScript after analyze_and_store_model().
    """
    global current_model

    if current_model is None:
        return json.dumps({
            'success': False,
            'message': 'No model in memory. Run analysis first.',
            'nodes': {},
            'elements': {},
            'diagrams': {}
        })

    try:
        print(f"  Extracting results for: {combo_name}")
        results = extract_results_for_combo(current_model, combo_name)
        print(f"    ✓ Extracted {len(results.get('diagrams', {}))} diagrams")

        return json.dumps({
            'success': True,
            'nodes': results['nodes'],
            'elements': results['elements'],
            'diagrams': results['diagrams']
        })

    except Exception as e:
        import traceback
        return json.dumps({
            'success': False,
            'message': f'Error extracting results for {combo_name}: {str(e)}',
            'traceback': traceback.format_exc(),
            'nodes': {},
            'elements': {},
            'diagrams': {}
        })

def clear_model():
    """
    Clear the stored model from memory.
    Useful for freeing memory when starting fresh analysis.
    """
    global current_model, current_load_cases, current_combinations
    current_model = None
    current_load_cases = []
    current_combinations = []
    print("✓ Model cleared from memory")
    return json.dumps({'success': True})

def analyze_frame_with_combos(input_json):
    """
    Unified analysis function that:
    1. Adds all loads with case parameter
    2. Creates load cases as combos with factor 1.0
    3. Creates user-defined combinations with proper factors
    4. Runs single analysis
    5. Extracts results for all cases and combos using combo_name
    """
    try:
        data = json.loads(input_json)

        # Create model
        model = FEModel3D()

        # Add nodes
        for node in data.get('nodes', []):
            model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)

        # Add material
        E = 210e9
        G = 80e9
        nu = 0.3
        rho = 7850
        model.add_material('Steel', E, G, nu, rho)

        # Add supports
        for node in data.get('nodes', []):
            support_type = node['support']
            if support_type == 'fixed':
                model.def_support(node['name'], True, True, True, True, True, True)
            elif support_type == 'pinned':
                model.def_support(node['name'], True, True, True, True, True, False)
            elif support_type == 'roller-x':
                model.def_support(node['name'], False, True, True, True, False, False)
            elif support_type == 'roller-y':
                model.def_support(node['name'], True, False, True, True, False, False)

        # Add elements
        for element in data.get('elements', []):
            E_element = float(element['E']) * 1e9
            I = float(element['I'])
            A = float(element['A'])
            J = I

            section_name = f"Section_{element['name']}"
            model.add_section(section_name, A, I, I, J)

            model.add_member(
                element['name'],
                element['nodeI'],
                element['nodeJ'],
                'Steel',
                section_name
            )

        # Add loads with case parameter
        loads = data.get('loads', {})

        for load in loads.get('nodal', []):
            case_name = load.get('case')
            fx = float(load['fx']) * 1000
            fy = float(load['fy']) * 1000
            mz = float(load['mz']) * 1000

            if fx != 0:
                model.add_node_load(load['node'], 'FX', fx, case=case_name)
            if fy != 0:
                model.add_node_load(load['node'], 'FY', fy, case=case_name)
            if mz != 0:
                model.add_node_load(load['node'], 'MZ', mz, case=case_name)

        for load in loads.get('distributed', []):
            case_name = load.get('case')
            w1 = float(load['w1']) * 1000
            w2 = float(load['w2']) * 1000
            x1 = float(load.get('x1', 0))
            x2 = load.get('x2')

            if x2 is not None:
                model.add_member_dist_load(load['element'], load['direction'], w1, w2, x1, float(x2), case=case_name)
            else:
                model.add_member_dist_load(load['element'], load['direction'], w1, w2, x1, case=case_name)

        for load in loads.get('elementPoint', []):
            case_name = load.get('case')
            magnitude = float(load['magnitude']) * 1000
            distance = float(load['distance'])

            model.add_member_pt_load(load['element'], load['direction'], magnitude, distance, case=case_name)

        # Add load cases as combinations with factor 1.0
        for load_case in data.get('loadCases', []):
            case_name = load_case['name']
            model.add_load_combo(name=case_name, factors={case_name: 1.0})

        # Add user-defined combinations
        for combo in data.get('loadCombinations', []):
            combo_name = combo['name']
            factors = combo['factors']
            model.add_load_combo(name=combo_name, factors=factors)

        # Run analysis once
        print(f"\\nAnalyzing model with {len(data.get('loadCases', []))} load cases and {len(data.get('loadCombinations', []))} combinations...")
        model.analyze()

        # Extract results for all load cases
        load_case_results = {}
        for load_case in data.get('loadCases', []):
            case_name = load_case['name']
            print(f"  Extracting results for load case: {case_name}")
            try:
                results = extract_results_for_combo(model, case_name)
                load_case_results[case_name] = results
                print(f"    ✓ Extracted {len(results.get('diagrams', {}))} diagrams")
            except Exception as e:
                print(f"    ✗ Error extracting {case_name}: {str(e)}")
                import traceback
                traceback.print_exc()
                raise

        # Extract results for all combinations
        combination_results = {}
        for combo in data.get('loadCombinations', []):
            combo_name = combo['name']
            print(f"  Extracting results for combination: {combo_name}")
            combination_results[combo_name] = extract_results_for_combo(model, combo_name)

        return json.dumps({
            'success': True,
            'message': 'Analysis completed for all cases and combinations',
            'loadCaseResults': load_case_results,
            'combinationResults': combination_results
        })

    except Exception as e:
        import traceback
        return json.dumps({
            'success': False,
            'message': f'Error in unified analysis: {str(e)}',
            'traceback': traceback.format_exc(),
            'loadCaseResults': {},
            'combinationResults': {}
        })

# Create global analyzer instance
web_analyzer = None

def initialize_web_analyzer():
    global web_analyzer
    web_analyzer = PyNiteWebAnalyzer()
    return "PyNite web analyzer initialized"

#%%
if __name__=="__main__":
    # Test cantilever example matching JavaScript loadCantileverExample()
    # 2 nodes: N1 at (0,0) fixed, N2 at (4,0) free
    # 1 element: E1 connecting N1-N2 (E=200 GPa, I=0.001 m4, A=0.01 m2)
    # 1 nodal load: -15 kN at N2 in Y direction

    test_data = {
        'nodes': [
            {'name': 'N1', 'x': 0, 'y': 0, 'support': 'fixed'},
            {'name': 'N2', 'x': 4, 'y': 0, 'support': 'free'}
        ],
        'elements': [
            {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 200, 'I': 0.001, 'A': 0.01}
        ],
        'loads': {
            'nodal': [
                {'node': 'N2', 'fx': 0, 'fy': -15, 'mz': 0, 'case': 'Dead'}
            ],
            'distributed': [],
            'elementPoint': []
        },
        'loadCases': [
            {'name': 'Dead', 'type': 'Ordinary', 'durationClass': 'Permanent'}
        ],
        'loadCombinations': []
    }

    import json
    print("=" * 60)
    print("TESTING CANTILEVER EXAMPLE")
    print("=" * 60)

    result = analyze_frame_with_combos(json.dumps(test_data))
    result_data = json.loads(result)

    if result_data.get('success'):
        print("\n✓ PyNite analysis successful!")

        print("\nAvailable load cases:", list(result_data.get('loadCaseResults', {}).keys()))

        # Check load case results
        if 'Dead' in result_data.get('loadCaseResults', {}):
            dead_results = result_data['loadCaseResults']['Dead']

            print("\nStructure of dead_results:", dead_results.keys())

            # Check node results (displacements and reactions)
            if 'nodes' in dead_results:
                print("\nNode results for 'Dead' load case:")
                for node_name, node_data in dead_results['nodes'].items():
                    print(f"  {node_name}:")
                    print(f"    Displacements: DX={node_data['DX']:.6f} m, DY={node_data['DY']:.6f} m, RZ={node_data['RZ']:.6f} rad")
                    if 'reactions' in node_data:
                        rxn = node_data['reactions']
                        print(f"    Reactions: FX={rxn['FX']:.1f} N, FY={rxn['FY']:.1f} N, MZ={rxn['MZ']:.1f} Nm")

            # Check diagrams
            if 'diagrams' in dead_results and 'E1' in dead_results['diagrams']:
                diagrams = dead_results['diagrams']['E1']
                print(f"\nElement E1 diagrams:")
                print(f"  Moment at fixed end: {diagrams['moments'][0]:.0f} Nm (expected: -60000 Nm)")
                print(f"  Moment at free end: {diagrams['moments'][-1]:.1f} Nm (expected: ~0 Nm)")
                print(f"  Shear at fixed end: {diagrams['shears'][0]:.0f} N (expected: -15000 N)")
                print(f"  Max deflection: {max(diagrams['deflections']):.6f} m")
            else:
                print("\n✗ No diagrams found in results!")
                print(f"  'diagrams' in dead_results: {'diagrams' in dead_results}")
                if 'diagrams' in dead_results:
                    print(f"  Available elements: {list(dead_results['diagrams'].keys())}")

        print("\n" + "=" * 60)
        print("TEST COMPLETED SUCCESSFULLY")
        print("=" * 60)
    else:
        print("\n✗ Analysis failed!")
        print(f"Error: {result_data.get('message')}")
        if 'traceback' in result_data:
            print(f"\nTraceback:\n{result_data['traceback']}")
# %%
