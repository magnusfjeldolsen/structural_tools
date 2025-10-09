// Global variables
let pyodide = null;
let frameData = {
    nodes: [],
    elements: [],
    loads: {
        nodal: [],          // Point loads at nodes
        distributed: [],    // Distributed loads on elements
        elementPoint: []    // Point loads on elements
    }
};
let nodeCounter = 1;
let elementCounter = 1;
let nodalLoadCounter = 1;
let distributedLoadCounter = 1;
let elementLoadCounter = 1;
let lastAnalysisResults = null; // Store last analysis results for diagram display
let lastAutoscaledDiagramType = null; // Track which diagram type was last autoscaled

// Load Cases and Combinations
let loadCases = [
    { name: 'Dead', type: 'Ordinary', durationClass: 'Permanent' },
    { name: 'Live', type: 'Ordinary', durationClass: 'Permanent' }
];
let activeLoadCase = 'Dead'; // Currently active load case for new loads

let loadCombinations = []; // User-defined load combinations

// Analysis Results Storage (client-side caching)
let analysisResults = {
    loadCases: {},      // Results for individual load cases
    combinations: {}    // Results for load combinations
};
let resultViewMode = 'loadCases'; // 'loadCases' or 'combinations'
let activeResultName = 'Dead'; // Currently displayed result

// Clipboard state for copy/paste properties
let propertiesClipboard = null; // Stores copied element properties
let pasteMode = false; // Whether paste UI is visible


// Steel section database
let steelSectionDatabase = {};
const SECTION_TYPES = {
    'Custom': null,
    'IPE': 'ipe.json',
    'HEA': 'hea.json',
    'HEB': 'heb.json',
    'HEM': 'hem.json',
    'CCHS': 'cchs.json',
    'CRHS': 'crhs.json',
    'CSHS': 'cshs.json',
    'HCHS': 'hchs.json',
    'HRHS': 'hrhs.json',
    'HSHS': 'hshs.json'
};

// Load steel section database
async function loadSteelSectionDatabase() {
    const basePath = '../steel_cross_section_database/';

    console.log('Loading steel section database from:', basePath);

    for (const [sectionType, filename] of Object.entries(SECTION_TYPES)) {
        if (filename === null) continue; // Skip Custom

        try {
            const url = basePath + filename;
            console.log(`Fetching ${sectionType} from ${url}...`);

            const response = await fetch(url);
            console.log(`Response for ${sectionType}:`, response.status, response.ok);

            if (response.ok) {
                const data = await response.json();
                steelSectionDatabase[sectionType] = data;
                console.log(`✓ Loaded ${sectionType} profiles:`, data.profiles.length);
            } else {
                console.error(`✗ Failed to load ${filename}: HTTP ${response.status}`);
            }
        } catch (error) {
            console.error(`✗ Error loading ${filename}:`, error);
        }
    }
    console.log('Steel section database loaded:', Object.keys(steelSectionDatabase));
    console.log('Total section types loaded:', Object.keys(steelSectionDatabase).length);

    // Make database accessible from console for debugging
    window.steelSectionDatabase = steelSectionDatabase;

    // Log sample data
    if (steelSectionDatabase.IPE) {
        console.log('IPE profiles loaded:', steelSectionDatabase.IPE.profiles.length);
        console.log('First IPE profile:', steelSectionDatabase.IPE.profiles[0]);
    }
}

// Initialize Pyodide and PyNite
async function initializePyodide() {
    try {
        console.log("Loading Pyodide...");
        pyodide = await loadPyodide();

        console.log("Installing numpy...");
        await pyodide.loadPackage("numpy");

        console.log("Loading micropip...");
        await pyodide.loadPackage("micropip");

        console.log("Installing dependencies...");
        await pyodide.runPythonAsync(`
            import micropip
            await micropip.install("prettytable")
            await micropip.install("scipy")
            await micropip.install("matplotlib")
        `);

        console.log("Patching environment for PyNite compatibility...");
        // Create comprehensive mock pip module with pkg_resources
        await pyodide.runPythonAsync(`
import sys
from types import ModuleType

# Create a mock Distribution class
class MockDistribution:
    def __init__(self, name, version='1.4.0'):
        self.project_name = name
        self.version = version
        self.key = name.lower()

# Create a mock working_set (list of installed packages)
class MockWorkingSet:
    def __init__(self):
        self.packages = [
            MockDistribution('PyNiteFEA', '1.4.0'),
            MockDistribution('numpy', '1.24.0'),
            MockDistribution('scipy', '1.11.0'),
            MockDistribution('matplotlib', '3.7.0'),
            MockDistribution('prettytable', '3.0.0'),
        ]

    def __iter__(self):
        return iter(self.packages)

    def by_key(self):
        return {p.key: p for p in self.packages}

# Create mock pkg_resources module with full API
pkg_resources = ModuleType('pkg_resources')
pkg_resources.get_distribution = lambda name: MockDistribution(name)
pkg_resources.working_set = MockWorkingSet()
pkg_resources.DistributionNotFound = Exception
pkg_resources.VersionConflict = Exception
pkg_resources.RequirementParseError = Exception
pkg_resources.parse_version = lambda v: v
pkg_resources.Requirement = type('Requirement', (), {'parse': lambda s: s})

# Create mock pip structure
pip = ModuleType('pip')
pip._vendor = ModuleType('pip._vendor')
pip._vendor.pkg_resources = pkg_resources

# Register all modules
sys.modules['pip'] = pip
sys.modules['pip._vendor'] = pip._vendor
sys.modules['pip._vendor.pkg_resources'] = pkg_resources
sys.modules['pkg_resources'] = pkg_resources  # Also make available as standalone

print("Pip mocking complete - working_set ready")
        `);

        console.log("Installing PyNite...");
        await pyodide.runPythonAsync(`
            import micropip
            await micropip.install("PyniteFEA")
        `);

        console.log("Loading Python modules...");

        // Load PyNite-based analysis module
        const pyniteAnalysisCode = `
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
`;

        pyodide.runPython(pyniteAnalysisCode);

        console.log("Testing PyNite analysis module...");
        pyodide.runPython(`
            # Test the PyNite analyzer
            test_data = {
                'nodes': [
                    {'name': 'N1', 'x': 0, 'y': 0, 'support': 'fixed'},
                    {'name': 'N2', 'x': 4, 'y': 0, 'support': 'free'}
                ],
                'elements': [
                    {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 200, 'I': 0.001, 'A': 0.01}
                ],
                'loads': [
                    {'name': 'L1', 'node': 'N2', 'fx': 0, 'fy': -15, 'mz': 0}
                ]
            }

            import json
            result = analyze_frame_json(json.dumps(test_data))
            result_data = json.loads(result)

            if result_data.get('success'):
                print("✓ PyNite analysis successful!")

                # Test the direct PyNite methods you discovered
                if 'diagrams' in result_data and 'E1' in result_data['diagrams']:
                    diagrams = result_data['diagrams']['E1']
                    print(f"✓ Moment at tip: {diagrams['moments'][-1]:.1f} Nm (should be ~0)")
                    print(f"✓ Moment at fixed: {diagrams['moments'][0]:.0f} Nm (should be ~-60000)")
                    print("✓ Diagram extraction working with PyNite methods!")
                else:
                    print("⚠ No diagram data found")
            else:
                print(f"✗ PyNite analysis failed: {result_data.get('message')}")
        `);

        console.log("PyNite environment ready!");
        document.getElementById('loading-status').classList.add('hidden');
        document.getElementById('main-interface').classList.remove('hidden');

        // Load example frame
        loadExample();

    } catch (error) {
        console.error("Error initializing Pyodide:", error);
        document.getElementById('loading-status').innerHTML =
            '<div class="text-red-400">Error loading PyNite environment. Please refresh the page.</div>';
    }
}

// Add node to the interface
function addNode() {
    const container = document.getElementById('nodes-container');
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'input-grid';
    nodeDiv.id = `node-${nodeCounter}`;

    nodeDiv.innerHTML = `
        <input type="text" value="N${nodeCounter}" readonly class="bg-gray-600 text-white p-2 rounded text-sm">
        <input type="number" step="0.1" value="0" placeholder="X" class="bg-gray-600 text-white p-2 rounded text-sm node-x">
        <input type="number" step="0.1" value="0" placeholder="Y" class="bg-gray-600 text-white p-2 rounded text-sm node-y">
        <select class="bg-gray-600 text-white p-2 rounded text-sm node-support">
            <option value="free">Free</option>
            <option value="pinned">Pinned</option>
            <option value="fixed">Fixed</option>
            <option value="roller-x">Roller X</option>
            <option value="roller-y">Roller Y</option>
        </select>
        <button onclick="removeNode('node-${nodeCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm">Remove</button>
    `;

    container.appendChild(nodeDiv);

    // Add event listeners to all inputs for real-time updates
    nodeDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    nodeCounter++;
    updateVisualization();
    updateNodesDatalist(); // Update element connectivity options
}

// Handle section type change
function onSectionTypeChange(elementId) {
    const elementDiv = document.getElementById(elementId);
    const sectionTypeSelect = elementDiv.querySelector('.section-type');
    const profileSelect = elementDiv.querySelector('.profile-select');
    const axisSelect = elementDiv.querySelector('.axis-select');
    const iInput = elementDiv.querySelector('.element-i-val');
    const aInput = elementDiv.querySelector('.element-a');

    const sectionType = sectionTypeSelect.value;
    console.log('Section type changed to:', sectionType);
    console.log('Steel database:', steelSectionDatabase);

    if (sectionType === 'Custom') {
        // Disable profile and axis selects
        profileSelect.disabled = true;
        profileSelect.className = 'bg-gray-500 text-white p-1 rounded text-xs profile-select';
        profileSelect.innerHTML = '<option value="">-</option>';

        axisSelect.disabled = true;
        axisSelect.className = 'bg-gray-500 text-white p-1 rounded text-xs axis-select';

        // Enable manual input
        iInput.disabled = false;
        iInput.className = 'bg-gray-600 text-white p-1 rounded text-xs element-i-val';
        aInput.disabled = false;
        aInput.className = 'bg-gray-600 text-white p-1 rounded text-xs element-a';
    } else {
        // Load profiles for this section type
        const profiles = steelSectionDatabase[sectionType]?.profiles || [];
        console.log(`Profiles for ${sectionType}:`, profiles.length);

        // Populate profile dropdown
        profileSelect.innerHTML = '<option value="">Select profile...</option>' +
            profiles.map(p => `<option value="${p.profile}">${p.profile}</option>`).join('');

        console.log('Profile dropdown HTML:', profileSelect.innerHTML.substring(0, 200));

        profileSelect.disabled = false;
        profileSelect.className = 'bg-gray-600 text-white p-1 rounded text-xs profile-select';
        profileSelect.onchange = () => onProfileChange(elementId);

        // Enable axis select
        axisSelect.disabled = false;
        axisSelect.className = 'bg-gray-600 text-white p-1 rounded text-xs axis-select';
        axisSelect.onchange = () => onProfileChange(elementId);

        // Disable manual input (will be auto-populated)
        iInput.disabled = true;
        iInput.className = 'bg-gray-500 text-gray-300 p-1 rounded text-xs element-i-val';
        aInput.disabled = true;
        aInput.className = 'bg-gray-500 text-gray-300 p-1 rounded text-xs element-a';
    }

    updateVisualization();
}

// Handle profile or axis change
function onProfileChange(elementId) {
    const elementDiv = document.getElementById(elementId);
    const sectionTypeSelect = elementDiv.querySelector('.section-type');
    const profileSelect = elementDiv.querySelector('.profile-select');
    const axisSelect = elementDiv.querySelector('.axis-select');
    const iInput = elementDiv.querySelector('.element-i-val');
    const aInput = elementDiv.querySelector('.element-a');

    const sectionType = sectionTypeSelect.value;
    const profileName = profileSelect.value;
    const axis = axisSelect.value;

    if (profileName && sectionType !== 'Custom') {
        const profiles = steelSectionDatabase[sectionType]?.profiles || [];
        const profile = profiles.find(p => p.profile === profileName);

        if (profile) {
            // Convert units from mm² and mm⁴ to m² and m⁴
            const A_m2 = profile.A * 1e-6;
            const I_m4 = axis === 'strong' ? profile.Iy * 1e-12 : profile.Iz * 1e-12;

            aInput.value = A_m2.toExponential(4);
            iInput.value = I_m4.toExponential(4);
        }
    }

    updateVisualization();
}

// Update nodes datalist for element connectivity autocomplete
function updateNodesDatalist() {
    const datalist = document.getElementById('nodes-datalist');
    if (!datalist) {
        console.warn('nodes-datalist element not found');
        return;
    }

    // Get all node names from the nodes container
    const nodeNames = [];
    document.querySelectorAll('#nodes-container > div').forEach(nodeDiv => {
        const nameInput = nodeDiv.querySelector('input[readonly]');
        if (nameInput && nameInput.value) {
            nodeNames.push(nameInput.value);
        }
    });

    // Update datalist options
    datalist.innerHTML = nodeNames.map(name => `<option value="${name}">${name}</option>`).join('');
    console.log('Updated nodes datalist with nodes:', nodeNames);
}

// Add element to the interface
function addElement() {
    const container = document.getElementById('elements-container');
    const elementDiv = document.createElement('div');
    elementDiv.className = 'element-grid';
    elementDiv.id = `element-${elementCounter}`;

    // Build section type dropdown options
    const sectionTypeOptions = Object.keys(SECTION_TYPES).map(type =>
        `<option value="${type}">${type}</option>`
    ).join('');

    elementDiv.innerHTML = `
        <input type="text" value="E${elementCounter}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <input type="text" placeholder="N1" list="nodes-datalist" class="bg-gray-600 text-white p-1 rounded text-xs element-i">
        <input type="text" placeholder="N2" list="nodes-datalist" class="bg-gray-600 text-white p-1 rounded text-xs element-j">
        <input type="number" step="0.1" value="200" placeholder="E" class="bg-gray-600 text-white p-1 rounded text-xs element-e">
        <select class="bg-gray-600 text-white p-1 rounded text-xs section-type" onchange="onSectionTypeChange('element-${elementCounter}')">
            ${sectionTypeOptions}
        </select>
        <select class="bg-gray-500 text-white p-1 rounded text-xs profile-select" disabled>
            <option value="">-</option>
        </select>
        <select class="bg-gray-500 text-white p-1 rounded text-xs axis-select" disabled>
            <option value="strong">Strong (y-y)</option>
            <option value="weak">Weak (z-z)</option>
        </select>
        <input type="number" step="0.0001" value="0.001" placeholder="I" class="bg-gray-600 text-white p-1 rounded text-xs element-i-val">
        <input type="number" step="0.001" value="0.01" placeholder="A" class="bg-gray-600 text-white p-1 rounded text-xs element-a">
        <button onclick="copyElementProperties('element-${elementCounter}')" class="copy-btn" title="Copy properties">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        </button>
        <button onclick="removeElement('element-${elementCounter}')" class="delete-btn" title="Delete element">×</button>
    `;

    container.appendChild(elementDiv);

    // Add event listeners to all inputs for real-time updates
    elementDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    elementCounter++;

    // If in paste mode, update UI to add checkbox to new element
    if (pasteMode && propertiesClipboard) {
        updatePasteUI();
    }

    updateVisualization();
}

// Add nodal load to the interface
function addNodalLoad() {
    const container = document.getElementById('nodal-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'nodal-load-grid';
    loadDiv.id = `nodal-load-${nodalLoadCounter}`;

    // Ensure nodes datalist is up-to-date
    updateNodesDatalist();

    loadDiv.innerHTML = `
        <input type="text" value="L${nodalLoadCounter}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <input type="text" placeholder="N1" list="nodes-datalist" class="bg-gray-600 text-white p-1 rounded text-xs load-node">
        <input type="number" step="0.1" value="0" placeholder="Fx" class="bg-gray-600 text-white p-1 rounded text-xs load-fx">
        <input type="number" step="0.1" value="-10" placeholder="Fy" class="bg-gray-600 text-white p-1 rounded text-xs load-fy">
        <input type="number" step="0.1" value="0" placeholder="Mz" class="bg-gray-600 text-white p-1 rounded text-xs load-mz">
        <button onclick="removeNodalLoad('nodal-load-${nodalLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    nodalLoadCounter++;
    updateVisualization();
}

// Add distributed load to the interface
function addDistributedLoad() {
    const container = document.getElementById('distributed-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'distributed-load-grid';
    loadDiv.id = `distributed-load-${distributedLoadCounter}`;

    // Get elements for dropdown
    const elements = getElementsFromInputs();
    const elementOptions = elements.map(e => `<option value="${e.name}">${e.name}</option>`).join('');

    loadDiv.innerHTML = `
        <input type="text" value="D${distributedLoadCounter}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <select class="bg-gray-600 text-white p-1 rounded text-xs dist-element" onchange="onDistributedLoadElementChange('distributed-load-${distributedLoadCounter}')">
            ${elementOptions}
        </select>
        <select class="bg-gray-600 text-white p-1 rounded text-xs dist-direction">
            <option value="FY">Global Y</option>
            <option value="FX">Global X</option>
            <option value="Fy">Local Y (perpendicular)</option>
            <option value="Fx">Local X (axial)</option>
        </select>
        <input type="number" step="0.1" value="-10" placeholder="w1" class="bg-gray-600 text-white p-1 rounded text-xs dist-w1" oninput="onDistributedLoadW1Change('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="-10" placeholder="w2" class="bg-gray-600 text-white p-1 rounded text-xs dist-w2" oninput="onDistributedLoadW2Change('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="0" placeholder="x1" class="bg-gray-600 text-white p-1 rounded text-xs dist-x1" oninput="validateDistributedLoadPosition('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="0" placeholder="x2" class="bg-gray-600 text-white p-1 rounded text-xs dist-x2" oninput="validateDistributedLoadPosition('distributed-load-${distributedLoadCounter}')">
        <button onclick="removeDistributedLoad('distributed-load-${distributedLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Initialize x2 with element length if element is selected
    if (elements.length > 0) {
        onDistributedLoadElementChange(`distributed-load-${distributedLoadCounter}`);
    }

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    distributedLoadCounter++;
    updateVisualization();
}

// Add element point load to the interface
function addElementPointLoad() {
    const container = document.getElementById('element-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'element-load-grid';
    loadDiv.id = `element-load-${elementLoadCounter}`;

    // Get elements for dropdown
    const elements = getElementsFromInputs();
    const elementOptions = elements.map(e => `<option value="${e.name}">${e.name}</option>`).join('');

    loadDiv.innerHTML = `
        <input type="text" value="P${elementLoadCounter}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <select class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-element">
            ${elementOptions}
        </select>
        <input type="number" step="0.1" value="0" placeholder="Dist" class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-distance" oninput="validateElementPointLoadPosition('element-load-${elementLoadCounter}')">
        <select class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-direction">
            <option value="FY">Vertical (Y)</option>
            <option value="FX">Horizontal (X)</option>
            <option value="MZ">Moment (Z)</option>
        </select>
        <input type="number" step="0.1" value="-10" placeholder="Mag" class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-magnitude">
        <button onclick="removeElementPointLoad('element-load-${elementLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    elementLoadCounter++;
    updateVisualization();
}

// Add nodal load from data (used when switching load cases)
function addNodalLoadFromData(load) {
    const container = document.getElementById('nodal-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'nodal-load-grid';
    loadDiv.id = `nodal-load-${nodalLoadCounter}`;

    loadDiv.innerHTML = `
        <input type="text" value="${load.name}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <input type="text" value="${load.node}" placeholder="" list="nodes-datalist" class="bg-gray-600 text-white p-1 rounded text-xs load-node">
        <input type="number" step="0.1" value="${load.fx}" placeholder="Fx" class="bg-gray-600 text-white p-1 rounded text-xs load-fx">
        <input type="number" step="0.1" value="${load.fy}" placeholder="Fy" class="bg-gray-600 text-white p-1 rounded text-xs load-fy">
        <input type="number" step="0.1" value="${load.mz}" placeholder="Mz" class="bg-gray-600 text-white p-1 rounded text-xs load-mz">
        <button onclick="removeNodalLoad('nodal-load-${nodalLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    nodalLoadCounter++;
}

// Add distributed load from data (used when switching load cases)
function addDistributedLoadFromData(load) {
    const container = document.getElementById('distributed-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'distributed-load-grid';
    loadDiv.id = `distributed-load-${distributedLoadCounter}`;

    // Get elements for dropdown
    const elements = getElementsFromInputs();
    const elementOptions = elements.map(e => `<option value="${e.name}" ${e.name === load.element ? 'selected' : ''}>${e.name}</option>`).join('');

    loadDiv.innerHTML = `
        <input type="text" value="${load.name}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <select class="bg-gray-600 text-white p-1 rounded text-xs dist-element" onchange="onDistributedLoadElementChange('distributed-load-${distributedLoadCounter}')">
            ${elementOptions}
        </select>
        <select class="bg-gray-600 text-white p-1 rounded text-xs dist-direction">
            <option value="FY" ${load.direction === 'FY' ? 'selected' : ''}>Global Y</option>
            <option value="FX" ${load.direction === 'FX' ? 'selected' : ''}>Global X</option>
            <option value="Fy" ${load.direction === 'Fy' ? 'selected' : ''}>Local Y (perpendicular)</option>
            <option value="Fx" ${load.direction === 'Fx' ? 'selected' : ''}>Local X (axial)</option>
        </select>
        <input type="number" step="0.1" value="${load.w1}" placeholder="w1" class="bg-gray-600 text-white p-1 rounded text-xs dist-w1" oninput="onDistributedLoadW1Change('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="${load.w2}" placeholder="w2" class="bg-gray-600 text-white p-1 rounded text-xs dist-w2" oninput="onDistributedLoadW2Change('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="${load.x1}" placeholder="x1" class="bg-gray-600 text-white p-1 rounded text-xs dist-x1" oninput="validateDistributedLoadPosition('distributed-load-${distributedLoadCounter}')">
        <input type="number" step="0.1" value="${load.x2}" placeholder="x2" class="bg-gray-600 text-white p-1 rounded text-xs dist-x2" oninput="validateDistributedLoadPosition('distributed-load-${distributedLoadCounter}')">
        <button onclick="removeDistributedLoad('distributed-load-${distributedLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    distributedLoadCounter++;
}

// Add element point load from data (used when switching load cases)
function addElementPointLoadFromData(load) {
    const container = document.getElementById('element-loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'element-load-grid';
    loadDiv.id = `element-load-${elementLoadCounter}`;

    // Get elements for dropdown
    const elements = getElementsFromInputs();
    const elementOptions = elements.map(e => `<option value="${e.name}" ${e.name === load.element ? 'selected' : ''}>${e.name}</option>`).join('');

    loadDiv.innerHTML = `
        <input type="text" value="${load.name}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
        <select class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-element">
            ${elementOptions}
        </select>
        <input type="number" step="0.1" value="${load.distance}" placeholder="Dist" class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-distance" oninput="validateElementPointLoadPosition('element-load-${elementLoadCounter}')">
        <select class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-direction">
            <option value="FY" ${load.direction === 'FY' ? 'selected' : ''}>Vertical (Y)</option>
            <option value="FX" ${load.direction === 'FX' ? 'selected' : ''}>Horizontal (X)</option>
            <option value="MZ" ${load.direction === 'MZ' ? 'selected' : ''}>Moment (Z)</option>
        </select>
        <input type="number" step="0.1" value="${load.magnitude}" placeholder="Mag" class="bg-gray-600 text-white p-1 rounded text-xs elem-pt-magnitude">
        <button onclick="removeElementPointLoad('element-load-${elementLoadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    elementLoadCounter++;
}

// Helper functions for distributed loads
function getElementLength(elementName) {
    const elements = getElementsFromInputs();
    const element = elements.find(e => e.name === elementName);
    if (!element) return null;

    const nodes = getNodesFromInputs();
    const nodeI = nodes.find(n => n.name === element.nodeI);
    const nodeJ = nodes.find(n => n.name === element.nodeJ);

    if (!nodeI || !nodeJ) return null;

    const dx = parseFloat(nodeJ.x) - parseFloat(nodeI.x);
    const dy = parseFloat(nodeJ.y) - parseFloat(nodeI.y);
    return Math.sqrt(dx * dx + dy * dy);
}

function onDistributedLoadElementChange(loadId) {
    const loadDiv = document.getElementById(loadId);
    if (!loadDiv) return;

    const elementSelect = loadDiv.querySelector('.dist-element');
    const x2Input = loadDiv.querySelector('.dist-x2');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);

    if (elementLength !== null) {
        // Auto-update x2 to element length
        x2Input.value = elementLength.toFixed(3);
    }
}

function onDistributedLoadW1Change(loadId) {
    const loadDiv = document.getElementById(loadId);
    if (!loadDiv) return;

    const w1Input = loadDiv.querySelector('.dist-w1');
    const w2Input = loadDiv.querySelector('.dist-w2');

    // Only auto-sync if w2 hasn't been manually edited
    if (!w2Input.dataset.manuallyEdited) {
        w2Input.value = w1Input.value;
    }
}

function onDistributedLoadW2Change(loadId) {
    const loadDiv = document.getElementById(loadId);
    if (!loadDiv) return;

    const w2Input = loadDiv.querySelector('.dist-w2');

    // Mark as manually edited
    w2Input.dataset.manuallyEdited = 'true';
}

function validateDistributedLoadPosition(loadId) {
    const loadDiv = document.getElementById(loadId);
    if (!loadDiv) return { isValid: true, errors: [] };

    const elementSelect = loadDiv.querySelector('.dist-element');
    const x1Input = loadDiv.querySelector('.dist-x1');
    const x2Input = loadDiv.querySelector('.dist-x2');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);
    const x1 = parseFloat(x1Input.value);
    const x2 = parseFloat(x2Input.value);

    let isValid = true;
    let errors = [];

    if (x1 < 0) {
        errors.push('x1 must be ≥ 0');
        isValid = false;
    }

    if (elementLength !== null && x2 > elementLength) {
        errors.push(`x2 must be ≤ ${elementLength.toFixed(3)} m (element length)`);
        isValid = false;
    }

    if (x1 >= x2) {
        errors.push('x1 must be < x2');
        isValid = false;
    }

    // Update UI to show validation state
    if (!isValid) {
        if (x1 < 0 || x1 >= x2) {
            x1Input.classList.add('border-red-500');
            x1Input.classList.add('border-2');
        } else {
            x1Input.classList.remove('border-red-500');
            x1Input.classList.remove('border-2');
        }

        if ((elementLength !== null && x2 > elementLength) || x1 >= x2) {
            x2Input.classList.add('border-red-500');
            x2Input.classList.add('border-2');
        } else {
            x2Input.classList.remove('border-red-500');
            x2Input.classList.remove('border-2');
        }
    } else {
        x1Input.classList.remove('border-red-500');
        x1Input.classList.remove('border-2');
        x2Input.classList.remove('border-red-500');
        x2Input.classList.remove('border-2');
    }

    return { isValid, errors };
}

function validateElementPointLoadPosition(loadId) {
    const loadDiv = document.getElementById(loadId);
    if (!loadDiv) return { isValid: true, errors: [] };

    const elementSelect = loadDiv.querySelector('.elem-pt-element');
    const distanceInput = loadDiv.querySelector('.elem-pt-distance');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);
    const distance = parseFloat(distanceInput.value);

    let isValid = true;
    let errors = [];

    if (distance <= 0) {
        errors.push('Distance must be > 0 (use nodal load for element start)');
        isValid = false;
    }

    if (elementLength !== null && distance >= elementLength) {
        errors.push(`Distance must be < ${elementLength.toFixed(3)} m (use nodal load for element end)`);
        isValid = false;
    }

    // Update UI to show validation state
    if (!isValid) {
        distanceInput.classList.add('border-red-500');
        distanceInput.classList.add('border-2');
    } else {
        distanceInput.classList.remove('border-red-500');
        distanceInput.classList.remove('border-2');
    }

    return { isValid, errors };
}

// Remove functions
function removeNode(id) {
    // Get the node name from the id
    const nodeDiv = document.getElementById(id);
    const nodeName = nodeDiv.querySelector('input[readonly]').value;

    // Remove all elements connected to this node
    const elementsToRemove = [];
    document.querySelectorAll('#elements-container > div').forEach(elementDiv => {
        const nodeI = elementDiv.querySelector('.element-i').value;
        const nodeJ = elementDiv.querySelector('.element-j').value;
        if (nodeI === nodeName || nodeJ === nodeName) {
            elementsToRemove.push(elementDiv.id);
        }
    });
    elementsToRemove.forEach(elemId => document.getElementById(elemId).remove());

    // Remove all nodal loads applied to this node
    const loadsToRemove = [];
    document.querySelectorAll('#nodal-loads-container > div').forEach(loadDiv => {
        const loadNode = loadDiv.querySelector('.load-node').value;
        if (loadNode === nodeName) {
            loadsToRemove.push(loadDiv.id);
        }
    });
    loadsToRemove.forEach(loadId => document.getElementById(loadId).remove());

    // Remove the node itself (support is automatically removed with the node)
    nodeDiv.remove();
    updateVisualization();
    updateNodesDatalist(); // Update element connectivity options
}

function removeElement(id) {
    document.getElementById(id).remove();
    updateVisualization();
}

function removeNodalLoad(id) {
    document.getElementById(id).remove();
    updateVisualization();
}

function removeDistributedLoad(id) {
    document.getElementById(id).remove();
    updateVisualization();
}

function removeElementPointLoad(id) {
    document.getElementById(id).remove();
    updateVisualization();
}

// Copy element properties to clipboard
function copyElementProperties(elementId) {
    const elementDiv = document.getElementById(elementId);

    propertiesClipboard = {
        E: elementDiv.querySelector('.element-e').value,
        sectionType: elementDiv.querySelector('.section-type').value,
        profileName: elementDiv.querySelector('.profile-select').value,
        bendingAxis: elementDiv.querySelector('.axis-select').value,
        I: elementDiv.querySelector('.element-i-val').value,
        A: elementDiv.querySelector('.element-a').value
    };

    // Enter paste mode
    pasteMode = true;
    updatePasteUI();

    console.log('Properties copied:', propertiesClipboard);
}

// Paste properties to selected elements
function pastePropertiesToSelected() {
    if (!propertiesClipboard) return;

    const checkboxes = document.querySelectorAll('.paste-checkbox:checked');

    checkboxes.forEach(checkbox => {
        const elementId = checkbox.dataset.elementId;
        const elementDiv = document.getElementById(elementId);

        // Set E
        elementDiv.querySelector('.element-e').value = propertiesClipboard.E;

        // Set Section Type
        elementDiv.querySelector('.section-type').value = propertiesClipboard.sectionType;

        // Trigger section type change to load profiles
        onSectionTypeChange(elementId);

        // Wait for profiles to load, then set profile and axis
        setTimeout(() => {
            if (propertiesClipboard.sectionType !== 'Custom') {
                elementDiv.querySelector('.profile-select').value = propertiesClipboard.profileName;
                elementDiv.querySelector('.axis-select').value = propertiesClipboard.bendingAxis;

                // Trigger profile change to update I and A
                onProfileChange(elementId);
            } else {
                // For Custom section, set I and A directly
                elementDiv.querySelector('.element-i-val').value = propertiesClipboard.I;
                elementDiv.querySelector('.element-a').value = propertiesClipboard.A;
            }

            // Uncheck this checkbox
            checkbox.checked = false;
        }, 10);
    });

    updateVisualization();
}

// Update paste mode UI
function updatePasteUI() {
    const elementsContainer = document.getElementById('elements-container');
    const addElementBtnParent = document.querySelector('button[onclick="addElement()"]').parentElement;

    // Remove existing paste button if any
    const existingPasteBtn = document.getElementById('paste-properties-btn');
    if (existingPasteBtn) existingPasteBtn.remove();

    if (pasteMode && propertiesClipboard) {
        // Show checkboxes
        document.querySelectorAll('.element-grid').forEach(elementDiv => {
            if (!elementDiv.querySelector('.paste-checkbox')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'paste-checkbox';
                checkbox.dataset.elementId = elementDiv.id;
                checkbox.style.width = '16px';
                checkbox.style.height = '16px';
                checkbox.style.cursor = 'pointer';
                elementDiv.insertBefore(checkbox, elementDiv.firstChild);
            }
        });

        // Update grid columns to include checkbox
        document.querySelector('.element-grid-header').style.gridTemplateColumns =
            '30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        document.querySelectorAll('.element-grid').forEach(el => {
            el.style.gridTemplateColumns = '30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        });

        // Add checkbox header
        const header = document.querySelector('.element-grid-header');
        if (!header.querySelector('.checkbox-header')) {
            const checkboxHeader = document.createElement('div');
            checkboxHeader.className = 'checkbox-header';
            checkboxHeader.innerHTML = '<input type="checkbox" id="select-all-elements" style="width:16px;height:16px;cursor:pointer;" title="Select all">';
            header.insertBefore(checkboxHeader, header.firstChild);

            // Select all functionality
            document.getElementById('select-all-elements').addEventListener('change', (e) => {
                document.querySelectorAll('.paste-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }

        // Show "Paste Properties" button
        const pasteBtn = document.createElement('button');
        pasteBtn.id = 'paste-properties-btn';
        pasteBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm ml-2';
        pasteBtn.textContent = 'Paste Properties';
        pasteBtn.onclick = pastePropertiesToSelected;
        document.querySelector('button[onclick="addElement()"]').after(pasteBtn);

        // Highlight all copy buttons - mark all as inactive first
        document.querySelectorAll('.copy-btn').forEach(btn => btn.classList.remove('active'));
        // Note: We could track which button was clicked to highlight it specifically

    } else {
        // Hide checkboxes
        document.querySelectorAll('.paste-checkbox').forEach(cb => cb.remove());
        document.querySelector('.checkbox-header')?.remove();

        // Reset grid columns (no checkbox)
        document.querySelector('.element-grid-header').style.gridTemplateColumns =
            '50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        document.querySelectorAll('.element-grid').forEach(el => {
            el.style.gridTemplateColumns = '50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        });

        // Remove active state from copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => btn.classList.remove('active'));
    }
}

// Clear clipboard (for future use - can be called when user wants to exit paste mode)
function clearPropertiesClipboard() {
    propertiesClipboard = null;
    pasteMode = false;
    updatePasteUI();
}

// Load example frame (cantilever - default example)
function loadExample() {
    loadCantileverExample();
}

// Load cantilever beam example
function loadCantileverExample() {
    clearAll();

    // Add nodes
    addNode();
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-y').value = '0';
    document.querySelector('#node-1 .node-support').value = 'fixed';

    addNode();
    document.querySelector('#node-2 .node-x').value = '4';
    document.querySelector('#node-2 .node-y').value = '0';
    document.querySelector('#node-2 .node-support').value = 'free';

    // Add element
    addElement();
    document.querySelector('#element-1 .element-i').value = 'N1';
    document.querySelector('#element-1 .element-j').value = 'N2';
    document.querySelector('#element-1 .element-e').value = '200';
    document.querySelector('#element-1 .element-i-val').value = '0.001';
    document.querySelector('#element-1 .element-a').value = '0.01';

    // Add load
    addNodalLoad();
    document.querySelector('#nodal-load-1 .load-node').value = 'N2';
    document.querySelector('#nodal-load-1 .load-fx').value = '0';
    document.querySelector('#nodal-load-1 .load-fy').value = '-15';

    updateVisualization();
    updateNodesDatalist(); // Update element connectivity options
}

// Load simply supported beam example - replicates simply_supported.py exactly
function loadSimplySupportedExample() {
    clearAll();

    // Replicate simply_supported.py:
    // - 2 nodes at (0,0) and (5,0)
    // - N1: Pinned (DX=True, DY=True, DZ=True, RX=False, RY=False, RZ=False)
    // - N2: Roller X (DX=False, DY=True, DZ=True, RX=False, RY=False, RZ=False)
    // - 1 element
    // - Distributed load -1 kN/m (Fy local perpendicular)
    // - Axial load 100 kN at N2

    addNode();
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-y').value = '0';
    document.querySelector('#node-1 .node-support').value = 'pinned';

    addNode();
    document.querySelector('#node-2 .node-x').value = '5';
    document.querySelector('#node-2 .node-y').value = '0';
    document.querySelector('#node-2 .node-support').value = 'roller-x'; // CAN slide in X direction

    // Single element
    addElement();
    document.querySelector('#element-1 .element-i').value = 'N1';
    document.querySelector('#element-1 .element-j').value = 'N2';
    document.querySelector('#element-1 .element-e').value = '210'; // 210 GPa
    document.querySelector('#element-1 .element-i-val').value = '0.001';
    document.querySelector('#element-1 .element-a').value = '0.01';

    // Add distributed load (-1 kN/m over full length, local perpendicular)
    addDistributedLoad();
    document.querySelector('#distributed-load-1 .dist-element').value = 'E1';
    document.querySelector('#distributed-load-1 .dist-direction').value = 'Fy'; // Local perpendicular
    document.querySelector('#distributed-load-1 .dist-w1').value = '-1';
    document.querySelector('#distributed-load-1 .dist-w2').value = '-1';
    document.querySelector('#distributed-load-1 .dist-x1').value = '0';
    document.querySelector('#distributed-load-1 .dist-x2').value = '5';

    // Add axial load at N2 (100 kN)
    addNodalLoad();
    document.querySelector('#nodal-load-1 .load-node').value = 'N2';
    document.querySelector('#nodal-load-1 .load-fx').value = '100';
    document.querySelector('#nodal-load-1 .load-fy').value = '0';
    document.querySelector('#nodal-load-1 .load-mz').value = '0';

    updateVisualization();
    updateNodesDatalist();
}

// Load two span beam example
function loadTwoSpanExample() {
    clearAll();

    // Add nodes
    addNode();
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-y').value = '0';
    document.querySelector('#node-1 .node-support').value = 'pinned';

    addNode();
    document.querySelector('#node-2 .node-x').value = '4';
    document.querySelector('#node-2 .node-y').value = '0';
    document.querySelector('#node-2 .node-support').value = 'pinned';

    addNode();
    document.querySelector('#node-3 .node-x').value = '8';
    document.querySelector('#node-3 .node-y').value = '0';
    document.querySelector('#node-3 .node-support').value = 'roller-x';

    // Add elements
    addElement();
    document.querySelector('#element-1 .element-i').value = 'N1';
    document.querySelector('#element-1 .element-j').value = 'N2';
    document.querySelector('#element-1 .element-e').value = '200';
    document.querySelector('#element-1 .element-i-val').value = '0.001';
    document.querySelector('#element-1 .element-a').value = '0.01';

    addElement();
    document.querySelector('#element-2 .element-i').value = 'N2';
    document.querySelector('#element-2 .element-j').value = 'N3';
    document.querySelector('#element-2 .element-e').value = '200';
    document.querySelector('#element-2 .element-i-val').value = '0.001';
    document.querySelector('#element-2 .element-a').value = '0.01';

    // Add distributed loads on both elements
    addDistributedLoad();
    document.querySelector('#distributed-load-1 .dist-element').value = 'E1';
    document.querySelector('#distributed-load-1 .dist-direction').value = 'FY';
    document.querySelector('#distributed-load-1 .dist-w1').value = '-10';
    document.querySelector('#distributed-load-1 .dist-w2').value = '-10';
    document.querySelector('#distributed-load-1 .dist-x1').value = '0';
    document.querySelector('#distributed-load-1 .dist-x2').value = '4';

    addDistributedLoad();
    document.querySelector('#distributed-load-2 .dist-element').value = 'E2';
    document.querySelector('#distributed-load-2 .dist-direction').value = 'FY';
    document.querySelector('#distributed-load-2 .dist-w1').value = '-10';
    document.querySelector('#distributed-load-2 .dist-w2').value = '-10';
    document.querySelector('#distributed-load-2 .dist-x1').value = '0';
    document.querySelector('#distributed-load-2 .dist-x2').value = '4';

    updateVisualization();
    updateNodesDatalist(); // Update element connectivity options
}

// Load portal frame example
function loadPortalExample() {
    clearAll();

    // Add nodes
    addNode();
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-y').value = '0';
    document.querySelector('#node-1 .node-support').value = 'fixed';

    addNode();
    document.querySelector('#node-2 .node-x').value = '6';
    document.querySelector('#node-2 .node-y').value = '0';
    document.querySelector('#node-2 .node-support').value = 'fixed';

    addNode();
    document.querySelector('#node-3 .node-x').value = '0';
    document.querySelector('#node-3 .node-y').value = '4';
    document.querySelector('#node-3 .node-support').value = 'free';

    addNode();
    document.querySelector('#node-4 .node-x').value = '6';
    document.querySelector('#node-4 .node-y').value = '4';
    document.querySelector('#node-4 .node-support').value = 'free';

    addNode();
    document.querySelector('#node-5 .node-x').value = '3';
    document.querySelector('#node-5 .node-y').value = '4';
    document.querySelector('#node-5 .node-support').value = 'free';

    // Add elements
    addElement();
    document.querySelector('#element-1 .element-i').value = 'N1';
    document.querySelector('#element-1 .element-j').value = 'N3';

    addElement();
    document.querySelector('#element-2 .element-i').value = 'N2';
    document.querySelector('#element-2 .element-j').value = 'N4';

    addElement();
    document.querySelector('#element-3 .element-i').value = 'N3';
    document.querySelector('#element-3 .element-j').value = 'N5';

    addElement();
    document.querySelector('#element-4 .element-i').value = 'N5';
    document.querySelector('#element-4 .element-j').value = 'N4';

    // Add loads
    addNodalLoad();
    document.querySelector('#nodal-load-1 .load-node').value = 'N5';
    document.querySelector('#nodal-load-1 .load-fx').value = '0';
    document.querySelector('#nodal-load-1 .load-fy').value = '-25';

    addNodalLoad();
    document.querySelector('#nodal-load-2 .load-node').value = 'N3';
    document.querySelector('#nodal-load-2 .load-fx').value = '10';
    document.querySelector('#nodal-load-2 .load-fy').value = '0';

    updateVisualization();
    updateNodesDatalist(); // Update element connectivity options
}

// Clear all inputs
function clearAll() {
    document.getElementById('nodes-container').innerHTML = '';
    document.getElementById('elements-container').innerHTML = '';
    document.getElementById('nodal-loads-container').innerHTML = '';
    document.getElementById('distributed-loads-container').innerHTML = '';
    document.getElementById('element-loads-container').innerHTML = '';
    document.getElementById('results-container').innerHTML = '<p>Run analysis to see results...</p>';
    document.getElementById('console-output').textContent = '';

    nodeCounter = 1;
    elementCounter = 1;
    nodalLoadCounter = 1;
    distributedLoadCounter = 1;
    elementLoadCounter = 1;

    updateVisualization();
}

// Update visualization
function updateVisualization() {
    if (!pyodide) return;

    const svg = d3.select("#frame-svg");
    svg.selectAll("*").remove();

    // Add arrow marker definitions
    const defs = svg.append("defs");

    // Red arrowhead for nodal loads
    defs.append("marker")
        .attr("id", "arrowhead-red")
        .attr("markerWidth", 10)
        .attr("markerHeight", 10)
        .attr("refX", 9)
        .attr("refY", 3)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0 0, 10 3, 0 6")
        .attr("fill", "#F87171");

    // Green arrowhead for distributed loads
    defs.append("marker")
        .attr("id", "arrowhead-green")
        .attr("markerWidth", 10)
        .attr("markerHeight", 10)
        .attr("refX", 9)
        .attr("refY", 3)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0 0, 10 3, 0 6")
        .attr("fill", "#10B981");

    // Orange arrowhead for element point loads
    defs.append("marker")
        .attr("id", "arrowhead-orange")
        .attr("markerWidth", 10)
        .attr("markerHeight", 10)
        .attr("refX", 9)
        .attr("refY", 3)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0 0, 10 3, 0 6")
        .attr("fill", "#F59E0B");

    // Get current data from inputs
    const nodes = getNodesFromInputs();
    const elements = getElementsFromInputs();
    const allLoads = getLoadsFromInputs();

    // Filter loads to show only active load case
    const loads = {
        nodal: allLoads.nodal.filter(load => load.case === activeLoadCase),
        distributed: allLoads.distributed.filter(load => load.case === activeLoadCase),
        elementPoint: allLoads.elementPoint.filter(load => load.case === activeLoadCase)
    };

    if (nodes.length === 0) return;

    // Set up scales with equal aspect ratio
    const margin = 50;
    const width = svg.node().clientWidth - 2 * margin;
    const height = 400 - 2 * margin;

    const xExtent = d3.extent(nodes, d => parseFloat(d.x));
    const yExtent = d3.extent(nodes, d => parseFloat(d.y));

    const xScale = d3.scaleLinear()
        .domain(xExtent[0] === xExtent[1] ? [xExtent[0] - 1, xExtent[0] + 1] : xExtent)
        .range([margin, width + margin]);

    const yScale = d3.scaleLinear()
        .domain(yExtent[0] === yExtent[1] ? [yExtent[0] - 1, yExtent[0] + 1] : yExtent)
        .range([height + margin, margin]);

    // Draw elements (beams)
    elements.forEach(element => {
        const nodeI = nodes.find(n => n.name === element.nodeI);
        const nodeJ = nodes.find(n => n.name === element.nodeJ);

        if (nodeI && nodeJ) {
            svg.append("line")
                .attr("x1", xScale(parseFloat(nodeI.x)))
                .attr("y1", yScale(parseFloat(nodeI.y)))
                .attr("x2", xScale(parseFloat(nodeJ.x)))
                .attr("y2", yScale(parseFloat(nodeJ.y)))
                .attr("stroke", "#60A5FA")
                .attr("stroke-width", 3);

            // Add element ID label at center
            const centerX = (xScale(parseFloat(nodeI.x)) + xScale(parseFloat(nodeJ.x))) / 2;
            const centerY = (yScale(parseFloat(nodeI.y)) + yScale(parseFloat(nodeJ.y))) / 2;

            svg.append("text")
                .attr("x", centerX)
                .attr("y", centerY - 5)
                .attr("text-anchor", "middle")
                .attr("fill", "#60A5FA")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .text(element.name);
        }
    });

    // Draw diagrams if analysis results are available
    const diagramType = document.getElementById('diagram-type')?.value;
    if (diagramType && diagramType !== 'none' && lastAnalysisResults && lastAnalysisResults.diagrams) {
        drawDiagramsOnElements(svg, elements, nodes, xScale, yScale, lastAnalysisResults, diagramType);
    }

    // Draw nodes
    nodes.forEach(node => {
        const g = svg.append("g")
            .attr("transform", `translate(${xScale(parseFloat(node.x))}, ${yScale(parseFloat(node.y))})`);

        // Node circle
        g.append("circle")
            .attr("r", 6)
            .attr("fill", getSupportColor(node.support))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .style("cursor", "pointer");

        // Add click interaction for nodes
        if (lastAnalysisResults && lastAnalysisResults.nodes && lastAnalysisResults.nodes[node.name]) {
            const nodeData = lastAnalysisResults.nodes[node.name];

            g.on("click", function(event) {
                event.stopPropagation();

                // Remove any existing tooltips and export menus
                svg.selectAll(".node-tooltip").remove();
                svg.selectAll(".diagram-tooltip").remove();
                svg.selectAll(".diagram-hover-point").remove();
                svg.selectAll(".export-toolbar").remove();

                // Create tooltip
                const nodeX = xScale(parseFloat(node.x));
                const nodeY = yScale(parseFloat(node.y));
                const tooltip = svg.append("g")
                    .attr("class", "node-tooltip");

                // Tooltip content
                const tooltipText = [
                    `Node: ${node.name}`,
                    `DX: ${(nodeData.DX * 1000).toFixed(2)} mm`,
                    `DY: ${(nodeData.DY * 1000).toFixed(2)} mm`,
                    `RZ: ${(nodeData.RZ * 1000).toFixed(3)} mrad`
                ];

                if (nodeData.reactions && (Math.abs(nodeData.reactions.FX) > 0.01 ||
                    Math.abs(nodeData.reactions.FY) > 0.01 ||
                    Math.abs(nodeData.reactions.MZ) > 0.01)) {
                    tooltipText.push(`RFX: ${(nodeData.reactions.FX / 1000).toFixed(2)} kN`);
                    tooltipText.push(`RFY: ${(nodeData.reactions.FY / 1000).toFixed(2)} kN`);
                    tooltipText.push(`RMZ: ${(nodeData.reactions.MZ / 1000).toFixed(2)} kNm`);
                }

                const lineHeight = 14;
                const padding = 8;
                const boxWidth = 150;
                const buttonHeight = 25;
                const boxHeight = tooltipText.length * lineHeight + padding * 2 + buttonHeight + 5;

                const svgWidth = svg.node().clientWidth;
                const svgHeight = 400;

                // Position and constrain to SVG bounds
                let tooltipX = nodeX + 15;
                let tooltipY = nodeY - 10;
                tooltipX = Math.max(0, Math.min(tooltipX, svgWidth - boxWidth));
                tooltipY = Math.max(0, Math.min(tooltipY, svgHeight - boxHeight));

                tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);

                // Add drag behavior to make tooltip movable
                const dragBehavior = d3.drag()
                    .on("drag", function(event) {
                        const transform = d3.select(this).attr("transform");
                        const translate = transform.match(/translate\(([^,]+),([^)]+)\)/);
                        let x = parseFloat(translate[1]);
                        let y = parseFloat(translate[2]);

                        x += event.dx;
                        y += event.dy;

                        // Constrain to SVG bounds
                        x = Math.max(0, Math.min(x, svgWidth - boxWidth));
                        y = Math.max(0, Math.min(y, svgHeight - boxHeight));

                        d3.select(this).attr("transform", `translate(${x}, ${y})`);
                    });

                tooltip.call(dragBehavior);

                tooltip.append("rect")
                    .attr("width", boxWidth)
                    .attr("height", boxHeight)
                    .attr("fill", "#1f2937")
                    .attr("stroke", "#60A5FA")
                    .attr("stroke-width", 2)
                    .attr("rx", 4)
                    .style("cursor", "move");

                tooltipText.forEach((text, i) => {
                    tooltip.append("text")
                        .attr("x", padding)
                        .attr("y", padding + (i + 1) * lineHeight)
                        .attr("fill", "#E5E7EB")
                        .attr("font-size", "11px")
                        .text(text);
                });

                // Prepare export data with PyNite nomenclature
                const exportData = {
                    source: "2D Frame Analysis",
                    combo: "Combo 1",
                    type: "node",
                    node_data: {
                        name: node.name,
                        DX: nodeData.DX || 0,
                        DY: nodeData.DY || 0,
                        DZ: nodeData.DZ || 0,
                        RX: nodeData.RX || 0,
                        RY: nodeData.RY || 0,
                        RZ: nodeData.RZ || 0,
                        RxnFX: nodeData.reactions ? nodeData.reactions.FX : 0,
                        RxnFY: nodeData.reactions ? nodeData.reactions.FY : 0,
                        RxnMZ: nodeData.reactions ? nodeData.reactions.MZ : 0
                    }
                };

                // Add export button
                const exportBtn = tooltip.append("g")
                    .attr("class", "export-button")
                    .style("cursor", "pointer")
                    .on("click", function(event) {
                        event.stopPropagation();
                        svg.selectAll(".node-tooltip").remove();
                        const svgWidth = svg.node().clientWidth;
                        showExportToolbar(svg, nodeX > svgWidth / 2 ? nodeX - 200 : nodeX + 180, nodeY, exportData);
                    });

                const btnY = boxHeight - buttonHeight - padding;
                exportBtn.append("rect")
                    .attr("x", padding)
                    .attr("y", btnY)
                    .attr("width", boxWidth - 2 * padding)
                    .attr("height", buttonHeight)
                    .attr("fill", "#3b82f6")
                    .attr("stroke", "#60a5fa")
                    .attr("stroke-width", 1)
                    .attr("rx", 3);

                exportBtn.append("text")
                    .attr("x", boxWidth / 2)
                    .attr("y", btnY + buttonHeight / 2 + 4)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#fff")
                    .attr("font-size", "11px")
                    .attr("font-weight", "bold")
                    .text("📤 Export Results");
            });
        }

        // Node label
        g.append("text")
            .attr("x", 10)
            .attr("y", 5)
            .attr("fill", "#E5E7EB")
            .attr("font-size", "12px")
            .text(node.name);

        // Support symbols
        drawSupportSymbol(g, node.support);
    });

    // Draw loads only when Loads tab is active
    if (isLoadsTabActive()) {
        // Draw nodal loads
        loads.nodal.forEach(load => {
            const node = nodes.find(n => n.name === load.node);
            if (node) {
                const x = xScale(parseFloat(node.x));
                const y = yScale(parseFloat(node.y));

                // Draw load arrows
                if (parseFloat(load.fx) !== 0) {
                    drawLoadArrow(svg, x, y, parseFloat(load.fx), 'horizontal', '#F87171', load.name);
                }
                if (parseFloat(load.fy) !== 0) {
                    drawLoadArrow(svg, x, y, parseFloat(load.fy), 'vertical', '#F87171', load.name);
                }
            }
        });

        // Draw distributed loads
        loads.distributed.forEach(load => {
            const element = elements.find(e => e.name === load.element);
            if (element) {
                const nodeI = nodes.find(n => n.name === element.nodeI);
                const nodeJ = nodes.find(n => n.name === element.nodeJ);
                if (nodeI && nodeJ) {
                    drawDistributedLoad(svg, nodeI, nodeJ, load, xScale, yScale);
                }
            }
        });

        // Draw element point loads
        loads.elementPoint.forEach(load => {
            const element = elements.find(e => e.name === load.element);
            if (element) {
                const nodeI = nodes.find(n => n.name === element.nodeI);
                const nodeJ = nodes.find(n => n.name === element.nodeJ);
                if (nodeI && nodeJ) {
                    drawElementPointLoad(svg, nodeI, nodeJ, load, xScale, yScale);
                }
            }
        });
    }

    // Add global click handler to close tooltips/export menus when clicking outside
    svg.on("click", function(event) {
        // Only close if clicking on the SVG itself, not on tooltips or nodes
        if (event.target === svg.node()) {
            svg.selectAll(".node-tooltip").remove();
            svg.selectAll(".diagram-tooltip").remove();
            svg.selectAll(".diagram-hover-point").remove();
            svg.selectAll(".export-toolbar").remove();
            svg.selectAll(".module-dropdown").remove();
        }
    });

}

// Update visualization with diagram
function updateVisualizationWithDiagram() {
    const diagramType = document.getElementById('diagram-type')?.value;

    // Auto-scale only once when a new diagram type is selected
    if (diagramType && diagramType !== 'none' &&
        lastAnalysisResults && lastAnalysisResults.diagrams &&
        diagramType !== lastAutoscaledDiagramType) {
        lastAutoscaledDiagramType = diagramType;
        autoscaleDiagram();
    } else {
        updateVisualization();
    }
}

// Helper functions for visualization
function getSupportColor(support) {
    switch(support) {
        case 'fixed': return '#EF4444';
        case 'pinned': return '#F59E0B';
        case 'roller-x': case 'roller-y': return '#10B981';
        default: return '#6B7280';
    }
}

function drawSupportSymbol(g, support) {
    switch(support) {
        case 'fixed':
            g.append("rect")
                .attr("x", -8)
                .attr("y", 6)
                .attr("width", 16)
                .attr("height", 4)
                .attr("fill", "#EF4444");
            break;
        case 'pinned':
            g.append("polygon")
                .attr("points", "-8,6 8,6 0,14")
                .attr("fill", "#F59E0B");
            break;
        case 'roller-y':
            g.append("circle")
                .attr("cx", -6)
                .attr("cy", 10)
                .attr("r", 3)
                .attr("fill", "#10B981");
            g.append("circle")
                .attr("cx", 6)
                .attr("cy", 10)
                .attr("r", 3)
                .attr("fill", "#10B981");
            break;
    }
}

function drawLoadArrow(svg, x, y, magnitude, direction, color = null, label = null) {
    const arrowLength = 40;
    const defaultColor = magnitude > 0 ? "#34D399" : "#F87171";
    const arrowColor = color || defaultColor;

    if (direction === 'vertical') {
        const startY = magnitude > 0 ? y + arrowLength : y - arrowLength;
        const endY = y;

        // Arrow line
        svg.append("line")
            .attr("x1", x)
            .attr("y1", startY)
            .attr("x2", x)
            .attr("y2", endY)
            .attr("stroke", arrowColor)
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead-red)");

        // Load label
        svg.append("text")
            .attr("x", x + 10)
            .attr("y", (startY + endY) / 2)
            .attr("fill", arrowColor)
            .attr("font-size", "10px")
            .text(`${magnitude} kN`);

    } else if (direction === 'horizontal') {
        const startX = magnitude > 0 ? x + arrowLength : x - arrowLength;
        const endX = x;

        // Arrow line
        svg.append("line")
            .attr("x1", startX)
            .attr("y1", y)
            .attr("x2", endX)
            .attr("y2", y)
            .attr("stroke", arrowColor)
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead-red)");

        // Load label
        svg.append("text")
            .attr("x", (startX + endX) / 2)
            .attr("y", y - 10)
            .attr("fill", arrowColor)
            .attr("font-size", "10px")
            .text(`${magnitude} kN`);
    }
}

// Draw distributed load on element
function drawDistributedLoad(svg, nodeI, nodeJ, load, xScale, yScale) {
    const x1 = xScale(parseFloat(nodeI.x));
    const y1 = yScale(parseFloat(nodeI.y));
    const x2 = xScale(parseFloat(nodeJ.x));
    const y2 = yScale(parseFloat(nodeJ.y));

    // Calculate element angle and length
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    // Load parameters
    const w1 = parseFloat(load.w1);
    const w2 = parseFloat(load.w2);
    const loadX1 = parseFloat(load.x1);
    const loadX2 = parseFloat(load.x2);
    const elementLength = Math.sqrt(
        Math.pow(parseFloat(nodeJ.x) - parseFloat(nodeI.x), 2) +
        Math.pow(parseFloat(nodeJ.y) - parseFloat(nodeI.y), 2)
    );

    // Calculate start and end positions along element (in screen coordinates)
    const startRatio = loadX1 / elementLength;
    const endRatio = loadX2 / elementLength;
    const startX = x1 + dx * startRatio;
    const startY = y1 + dy * startRatio;
    const endX = x1 + dx * endRatio;
    const endY = y1 + dy * endRatio;

    // Determine load direction (perpendicular to element for local loads)
    let perpAngle = angle + Math.PI / 2;
    const isGlobalY = load.direction === 'FY';
    const isGlobalX = load.direction === 'FX';

    if (isGlobalY) {
        perpAngle = -Math.PI / 2; // Global downward
    } else if (isGlobalX) {
        perpAngle = 0; // Global horizontal
    }

    // Scale the rectangle height based on w values
    // Use same length as point load arrows (40px) for maximum magnitude
    const maxArrowLength = 40;
    const maxW = Math.max(Math.abs(w1), Math.abs(w2));

    // Calculate scaled heights for w1 and w2 with proper sign
    const h1 = maxW !== 0 ? (w1 / maxW) * maxArrowLength : 0;
    const h2 = maxW !== 0 ? (w2 / maxW) * maxArrowLength : 0;

    // Calculate rectangle/trapezoid corners with proper scaling and direction
    const rectX1 = startX + Math.cos(perpAngle) * h1;
    const rectY1 = startY + Math.sin(perpAngle) * h1;
    const rectX2 = endX + Math.cos(perpAngle) * h2;
    const rectY2 = endY + Math.sin(perpAngle) * h2;

    // Draw load rectangle/trapezoid
    svg.append("polygon")
        .attr("points", `${startX},${startY} ${endX},${endY} ${rectX2},${rectY2} ${rectX1},${rectY1}`)
        .attr("fill", "#10B981")
        .attr("opacity", 0.3)
        .attr("stroke", "#10B981")
        .attr("stroke-width", 2);

    // Draw arrows at start, middle, and end with scaled lengths
    const numArrows = 3;
    for (let i = 0; i <= numArrows; i++) {
        const ratio = i / numArrows;
        const arrowX = startX + (endX - startX) * ratio;
        const arrowY = startY + (endY - startY) * ratio;
        const w = w1 + (w2 - w1) * ratio; // Interpolate load magnitude

        // Scale arrow length based on interpolated w value (preserve sign)
        const arrowLength = maxW !== 0 ? (w / maxW) * maxArrowLength : 0;

        // Arrow points from element towards the load magnitude direction
        const arrowStartX = arrowX;
        const arrowStartY = arrowY;
        const arrowEndX = arrowX + Math.cos(perpAngle) * arrowLength;
        const arrowEndY = arrowY + Math.sin(perpAngle) * arrowLength;

        // Only draw arrow if magnitude is non-zero
        if (Math.abs(w) > 0.001) {
            svg.append("line")
                .attr("x1", arrowStartX)
                .attr("y1", arrowStartY)
                .attr("x2", arrowEndX)
                .attr("y2", arrowEndY)
                .attr("stroke", "#10B981")
                .attr("stroke-width", 2)
                .attr("marker-end", "url(#arrowhead-green)");
        }
    }

    // Draw element baseline (reference line on the beam)
    svg.append("line")
        .attr("x1", startX)
        .attr("y1", startY)
        .attr("x2", endX)
        .attr("y2", endY)
        .attr("stroke", "#10B981")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");

    // Label - position it beyond the maximum extent
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const maxH = Math.max(h1, h2);
    const avgW = (w1 + w2) / 2;
    const labelOffsetX = Math.cos(perpAngle) * (avgW < 0 ? -(maxH + 15) : (maxH + 15));
    const labelOffsetY = Math.sin(perpAngle) * (avgW < 0 ? -(maxH + 15) : (maxH + 15));

    svg.append("text")
        .attr("x", midX + labelOffsetX)
        .attr("y", midY + labelOffsetY)
        .attr("fill", "#10B981")
        .attr("font-size", "10px")
        .attr("text-anchor", "middle")
        .text(`${load.name}: ${w1}→${w2} kN/m`);
}

// Draw element point load
function drawElementPointLoad(svg, nodeI, nodeJ, load, xScale, yScale) {
    const x1 = xScale(parseFloat(nodeI.x));
    const y1 = yScale(parseFloat(nodeI.y));
    const x2 = xScale(parseFloat(nodeJ.x));
    const y2 = yScale(parseFloat(nodeJ.y));

    // Calculate element properties
    const dx = x2 - x1;
    const dy = y2 - y1;
    const elementLength = Math.sqrt(
        Math.pow(parseFloat(nodeJ.x) - parseFloat(nodeI.x), 2) +
        Math.pow(parseFloat(nodeJ.y) - parseFloat(nodeI.y), 2)
    );

    // Load position along element
    const distance = parseFloat(load.distance);
    const ratio = distance / elementLength;
    const loadX = x1 + dx * ratio;
    const loadY = y1 + dy * ratio;

    // Draw marker at load position
    svg.append("circle")
        .attr("cx", loadX)
        .attr("cy", loadY)
        .attr("r", 4)
        .attr("fill", "#F59E0B")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

    // Draw load arrow based on direction
    const magnitude = parseFloat(load.magnitude);
    const direction = load.direction;
    const arrowLength = 40;

    if (direction === 'FY') {
        // Vertical load
        const startY = magnitude > 0 ? loadY + arrowLength : loadY - arrowLength;
        svg.append("line")
            .attr("x1", loadX)
            .attr("y1", startY)
            .attr("x2", loadX)
            .attr("y2", loadY)
            .attr("stroke", "#F59E0B")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead-orange)");

        svg.append("text")
            .attr("x", loadX + 10)
            .attr("y", (startY + loadY) / 2)
            .attr("fill", "#F59E0B")
            .attr("font-size", "10px")
            .text(`${load.name}: ${magnitude} kN`);

    } else if (direction === 'FX') {
        // Horizontal load
        const startX = magnitude > 0 ? loadX + arrowLength : loadX - arrowLength;
        svg.append("line")
            .attr("x1", startX)
            .attr("y1", loadY)
            .attr("x2", loadX)
            .attr("y2", loadY)
            .attr("stroke", "#F59E0B")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead-orange)");

        svg.append("text")
            .attr("x", (startX + loadX) / 2)
            .attr("y", loadY - 10)
            .attr("fill", "#F59E0B")
            .attr("font-size", "10px")
            .text(`${load.name}: ${magnitude} kN`);
    }
}

// Get data from inputs
function getNodesFromInputs() {
    const nodes = [];
    document.querySelectorAll('#nodes-container > div').forEach(nodeDiv => {
        const name = nodeDiv.querySelector('input[readonly]').value;
        const x = nodeDiv.querySelector('.node-x').value;
        const y = nodeDiv.querySelector('.node-y').value;
        const support = nodeDiv.querySelector('.node-support').value;
        nodes.push({ name, x, y, support });
    });
    return nodes;
}

function getElementsFromInputs() {
    const elements = [];
    document.querySelectorAll('#elements-container > div').forEach(elementDiv => {
        const name = elementDiv.querySelector('input[readonly]').value;
        const nodeI = elementDiv.querySelector('.element-i').value;
        const nodeJ = elementDiv.querySelector('.element-j').value;
        const E = elementDiv.querySelector('.element-e').value;
        const I = elementDiv.querySelector('.element-i-val').value;
        const A = elementDiv.querySelector('.element-a').value;

        // Get section information
        const sectionType = elementDiv.querySelector('.section-type')?.value || 'Custom';
        const profileName = elementDiv.querySelector('.profile-select')?.value || null;
        const bendingAxis = elementDiv.querySelector('.axis-select')?.value || null;

        elements.push({
            name,
            nodeI,
            nodeJ,
            E,
            I,
            A,
            sectionType,
            profileName,
            bendingAxis
        });
    });
    return elements;
}

function getLoadsFromInputs() {
    const loads = {
        nodal: [],
        distributed: [],
        elementPoint: []
    };

    // Collect nodal loads
    document.querySelectorAll('#nodal-loads-container > div').forEach(loadDiv => {
        const name = loadDiv.querySelector('input[readonly]').value;
        const node = loadDiv.querySelector('.load-node').value;
        const fx = loadDiv.querySelector('.load-fx').value;
        const fy = loadDiv.querySelector('.load-fy').value;
        const mz = loadDiv.querySelector('.load-mz').value;
        const caseInput = loadDiv.querySelector('.load-case');
        const loadCase = caseInput ? caseInput.value : activeLoadCase;
        loads.nodal.push({ name, type: 'nodal', node, fx, fy, mz, case: loadCase });
    });

    // Collect distributed loads
    document.querySelectorAll('#distributed-loads-container > div').forEach(loadDiv => {
        const name = loadDiv.querySelector('input[readonly]').value;
        const element = loadDiv.querySelector('.dist-element').value;
        const direction = loadDiv.querySelector('.dist-direction').value;
        const w1 = loadDiv.querySelector('.dist-w1').value;
        const w2 = loadDiv.querySelector('.dist-w2').value;
        const x1 = loadDiv.querySelector('.dist-x1').value;
        const x2 = loadDiv.querySelector('.dist-x2').value;
        const caseInput = loadDiv.querySelector('.load-case');
        const loadCase = caseInput ? caseInput.value : activeLoadCase;
        loads.distributed.push({ name, type: 'distributed', element, direction, w1, w2, x1, x2, case: loadCase });
    });

    // Collect element point loads
    document.querySelectorAll('#element-loads-container > div').forEach(loadDiv => {
        const name = loadDiv.querySelector('input[readonly]').value;
        const element = loadDiv.querySelector('.elem-pt-element').value;
        const distance = loadDiv.querySelector('.elem-pt-distance').value;
        const direction = loadDiv.querySelector('.elem-pt-direction').value;
        const magnitude = loadDiv.querySelector('.elem-pt-magnitude').value;
        const caseInput = loadDiv.querySelector('.load-case');
        const loadCase = caseInput ? caseInput.value : activeLoadCase;
        loads.elementPoint.push({ name, type: 'elementPoint', element, distance, direction, magnitude, case: loadCase });
    });

    return loads;
}

// Run analysis using PyNite
async function runAnalysis() {
    if (!pyodide) {
        alert("PyNite environment not ready yet. Please wait.");
        return;
    }

    try {
        const startTime = performance.now();

        // Sync current UI loads to frameData before analysis
        syncUIToFrameData();

        const nodes = getNodesFromInputs();
        const elements = getElementsFromInputs();

        if (nodes.length === 0 || elements.length === 0) {
            alert("Please add at least one node and one element.");
            return;
        }

        console.log("Running complete PyNite analysis for all load cases and combinations...");
        document.getElementById('console-output').textContent = "Running analysis...\n";

        // Run complete unified analysis
        await runCompleteAnalysis();

        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);

        console.log(`✓ Analysis workflow completed in ${duration} seconds`);

        const loads = getLoadsFromInputs();
        const totalLoads = (loads.nodal?.length || 0) + (loads.distributed?.length || 0) + (loads.elementPoint?.length || 0);
        document.getElementById('console-output').textContent = "Analysis completed successfully!\n";
        document.getElementById('console-output').textContent += `Analyzed ${nodes.length} nodes, ${elements.length} elements, ${totalLoads} loads\n`;
        document.getElementById('console-output').textContent += `Load cases: ${Object.keys(analysisResults.loadCases).length}, Combinations: ${Object.keys(analysisResults.combinations).length}\n`;
        document.getElementById('console-output').textContent += `Execution time: ${duration} seconds\n`;
        document.getElementById('console-output').textContent += `\nGo to Analysis tab to view results.\n`;

        // Clear old results container
        document.getElementById('results-container').innerHTML = '<p class="text-gray-400">Go to Analysis tab to view results...</p>';

        // Clear active result name to force user to select
        activeResultName = '';

        // Enable Analysis tab after first successful analysis
        if (!isAnalysisTabEnabled()) {
            enableAnalysisTab();
        }

        // Update dropdown to reset selection to "-- Select --"
        updateResultSelectionDropdown();

        // Always switch to Analysis tab after running analysis
        switchTab('analysis');

        // Clear any previous visualization results
        lastAnalysisResults = null;
        lastAutoscaledDiagramType = null;
        updateVisualization();

        // Clear analysis results container in Analysis tab
        const analysisResultsContainer = document.getElementById('analysis-results-container');
        if (analysisResultsContainer) {
            analysisResultsContainer.innerHTML = '<p>Select a load case or combination to see results...</p>';
        }

    } catch (error) {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);
        console.error(`✗ Analysis error in ${duration} seconds:`, error);
        document.getElementById('console-output').textContent += `Error: ${error}\n`;
        document.getElementById('results-container').innerHTML =
            `<p class="text-red-400">Analysis failed: ${error}</p>`;
    }
}

// Generate PyNite code
function generatePyNiteCode(nodes, elements, loads) {
    let code = `
from PyNite import FEModel3D

# Create a finite element model
frame = FEModel3D()

# Add nodes
`;

    nodes.forEach(node => {
        code += `frame.add_node('${node.name}', ${node.x}, ${node.y}, 0)\n`;
    });

    code += `\n# Add elements\n`;
    elements.forEach(element => {
        const E = parseFloat(element.E) * 1e9; // Convert GPa to Pa
        const I = parseFloat(element.I);
        const A = parseFloat(element.A);
        code += `frame.add_member('${element.name}', '${element.nodeI}', '${element.nodeJ}', ${E}, ${I}, ${I}, ${A})\n`;
    });

    code += `\n# Add supports\n`;
    nodes.forEach(node => {
        switch(node.support) {
            case 'fixed':
                code += `frame.def_support('${node.name}', True, True, True, True, True, True)\n`;
                break;
            case 'pinned':
                code += `frame.def_support('${node.name}', True, True, True, False, False, False)\n`;
                break;
            case 'roller-x':
                code += `frame.def_support('${node.name}', False, True, True, False, False, False)\n`;
                break;
            case 'roller-y':
                code += `frame.def_support('${node.name}', True, False, True, False, False, False)\n`;
                break;
        }
    });

    code += `\n# Add loads\n`;
    loads.forEach(load => {
        if (parseFloat(load.fx) !== 0 || parseFloat(load.fy) !== 0 || parseFloat(load.mz) !== 0) {
            const fx = parseFloat(load.fx) * 1000; // Convert kN to N
            const fy = parseFloat(load.fy) * 1000; // Convert kN to N
            const mz = parseFloat(load.mz) * 1000; // Convert kNm to Nm
            code += `frame.add_node_load('${load.node}', 'FX', ${fx})\n`;
            code += `frame.add_node_load('${load.node}', 'FY', ${fy})\n`;
            code += `frame.add_node_load('${load.node}', 'MZ', ${mz})\n`;
        }
    });

    code += `
# Analyze the model
frame.analyze()

# Get results
analysis_results = {}
analysis_results['nodes'] = {}
analysis_results['elements'] = {}

# Node displacements
for node_name in frame.Nodes:
    node = frame.Nodes[node_name]
    analysis_results['nodes'][node_name] = {
        'DX': node.DX['Combo 1'],
        'DY': node.DY['Combo 1'],
        'RZ': node.RZ['Combo 1']
    }

# Member forces
for member_name in frame.Members:
    member = frame.Members[member_name]
    analysis_results['elements'][member_name] = {
        'max_moment': max(abs(member.min_moment()), abs(member.max_moment())),
        'max_shear': max(abs(member.min_shear()), abs(member.max_shear())),
        'axial_force': member.axial()
    }

print("Analysis completed successfully!")
`;

    return code;
}

// Display results
function displayResults(results) {
    const container = document.getElementById('results-container');
    let html = '<div class="space-y-4">';

    // Node displacements
    html += '<div><h4 class="font-semibold text-yellow-400 mb-2">Node Displacements</h4>';
    html += '<div class="grid grid-cols-4 gap-2 text-xs">';
    html += '<div class="font-semibold">Node</div><div class="font-semibold">DX (mm)</div><div class="font-semibold">DY (mm)</div><div class="font-semibold">RZ (rad)</div>';

    for (const [nodeName, nodeData] of Object.entries(results.nodes)) {
        html += `<div>${nodeName}</div>`;
        html += `<div>${(nodeData.DX * 1000).toFixed(2)}</div>`;
        html += `<div>${(nodeData.DY * 1000).toFixed(2)}</div>`;
        html += `<div>${nodeData.RZ.toFixed(6)}</div>`;
    }
    html += '</div></div>';

    // Element forces
    html += '<div><h4 class="font-semibold text-green-400 mb-2">Element Forces</h4>';
    html += '<div class="grid grid-cols-4 gap-2 text-xs">';
    html += '<div class="font-semibold">Element</div><div class="font-semibold">Max M (kNm)</div><div class="font-semibold">Max V (kN)</div><div class="font-semibold">Axial (kN)</div>';

    for (const [elementName, elementData] of Object.entries(results.elements)) {
        html += `<div>${elementName}</div>`;
        html += `<div>${(elementData.max_moment / 1000).toFixed(2)}</div>`;
        html += `<div>${(elementData.max_shear / 1000).toFixed(2)}</div>`;
        html += `<div>${(elementData.axial_force / 1000).toFixed(2)}</div>`;
    }
    html += '</div></div>';

    html += '</div>';
    container.innerHTML = html;
}

// ========================================
// Load Cases Functions
// ========================================

/**
 * Update the active load case dropdown with current load cases
 */
function updateActiveLoadCaseDropdown() {
    const dropdown = document.getElementById('active-load-case');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    loadCases.forEach(loadCase => {
        const option = document.createElement('option');
        option.value = loadCase.name;
        option.textContent = loadCase.name;
        option.selected = (loadCase.name === activeLoadCase);
        dropdown.appendChild(option);
    });
}

/**
 * Set the active load case (all new loads will be assigned to this case)
 */
async function setActiveLoadCase(caseName) {
    // Save current UI state to frameData before switching
    syncUIToFrameData();

    activeLoadCase = caseName;
    console.log(`Active load case set to: ${caseName}`);
    updateActiveLoadCaseDropdown();

    // Rebuild UI to show loads for the new active case
    syncFrameDataToUI();

    updateVisualization(); // Refresh to show only active case loads (visualization only, no analysis)
}

/**
 * Sync UI load inputs to frameData.loads
 * Called before switching load cases to save current state
 */
function syncUIToFrameData() {
    const currentLoads = getLoadsFromInputs();

    // Remove existing loads for the current active case from frameData
    frameData.loads.nodal = frameData.loads.nodal.filter(load => load.case !== activeLoadCase);
    frameData.loads.distributed = frameData.loads.distributed.filter(load => load.case !== activeLoadCase);
    frameData.loads.elementPoint = frameData.loads.elementPoint.filter(load => load.case !== activeLoadCase);

    // Add the current UI loads to frameData
    frameData.loads.nodal.push(...currentLoads.nodal);
    frameData.loads.distributed.push(...currentLoads.distributed);
    frameData.loads.elementPoint.push(...currentLoads.elementPoint);
}

/**
 * Sync frameData.loads to UI inputs
 * Called after switching load cases to show loads for the new case
 */
function syncFrameDataToUI() {
    // Clear existing UI inputs
    document.getElementById('nodal-loads-container').innerHTML = '';
    document.getElementById('distributed-loads-container').innerHTML = '';
    document.getElementById('element-loads-container').innerHTML = '';

    // Reset counters
    nodalLoadCounter = 1;
    distributedLoadCounter = 1;
    elementLoadCounter = 1;

    // Get loads for active case
    const caseLoads = {
        nodal: frameData.loads.nodal.filter(load => load.case === activeLoadCase),
        distributed: frameData.loads.distributed.filter(load => load.case === activeLoadCase),
        elementPoint: frameData.loads.elementPoint.filter(load => load.case === activeLoadCase)
    };

    // Rebuild UI inputs for nodal loads
    caseLoads.nodal.forEach(load => {
        addNodalLoadFromData(load);
    });

    // Rebuild UI inputs for distributed loads
    caseLoads.distributed.forEach(load => {
        addDistributedLoadFromData(load);
    });

    // Rebuild UI inputs for element point loads
    caseLoads.elementPoint.forEach(load => {
        addElementPointLoadFromData(load);
    });
}

/**
 * Update the load cases list display
 */
function updateLoadCasesList() {
    const listContainer = document.getElementById('load-cases-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    loadCases.forEach((loadCase, index) => {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-4 gap-2 items-center bg-gray-600 p-2 rounded text-sm';

        row.innerHTML = `
            <div class="text-white font-medium">${loadCase.name}</div>
            <div class="text-gray-300">${loadCase.type}</div>
            <div class="text-gray-300">${loadCase.durationClass}</div>
            <div class="flex gap-1">
                <button onclick="editLoadCase(${index})" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs">
                    Edit
                </button>
                <button onclick="deleteLoadCase(${index})" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                    ${loadCases.length <= 1 ? 'disabled title="Cannot delete the last load case"' : ''}>
                    Delete
                </button>
            </div>
        `;

        listContainer.appendChild(row);
    });
}

/**
 * Show dialog to add a new load case
 */
function showAddLoadCaseDialog() {
    const name = prompt('Load Case Name:', 'Wind');
    if (!name || name.trim() === '') return;

    // Check for duplicate names
    if (loadCases.some(lc => lc.name === name.trim())) {
        alert('A load case with this name already exists. Please use a unique name.');
        return;
    }

    // For now, use default values. Later we can make a proper dialog
    const newLoadCase = {
        name: name.trim(),
        type: 'Ordinary',
        durationClass: 'Permanent'
    };

    loadCases.push(newLoadCase);
    console.log(`Added load case: ${newLoadCase.name}`);

    updateLoadCasesList();
    updateActiveLoadCaseDropdown();
}

/**
 * Edit an existing load case
 */
function editLoadCase(index) {
    const loadCase = loadCases[index];
    const newName = prompt('Load Case Name:', loadCase.name);

    if (!newName || newName.trim() === '') return;

    // Check for duplicate names (excluding current)
    if (loadCases.some((lc, i) => i !== index && lc.name === newName.trim())) {
        alert('A load case with this name already exists. Please use a unique name.');
        return;
    }

    const oldName = loadCase.name;
    loadCase.name = newName.trim();

    // Update activeLoadCase if it was the one being edited
    if (activeLoadCase === oldName) {
        activeLoadCase = loadCase.name;
    }

    // Update all loads that reference this case
    frameData.loads.nodal.forEach(load => {
        if (load.case === oldName) load.case = loadCase.name;
    });
    frameData.loads.distributed.forEach(load => {
        if (load.case === oldName) load.case = loadCase.name;
    });
    frameData.loads.elementPoint.forEach(load => {
        if (load.case === oldName) load.case = loadCase.name;
    });

    console.log(`Edited load case: ${oldName} → ${loadCase.name}`);

    updateLoadCasesList();
    updateActiveLoadCaseDropdown();
}

/**
 * Delete a load case
 */
function deleteLoadCase(index) {
    if (loadCases.length <= 1) {
        alert('Cannot delete the last load case. At least one load case must exist.');
        return;
    }

    const loadCase = loadCases[index];
    const caseName = loadCase.name;

    // Check if any loads are assigned to this case
    const hasLoads =
        frameData.loads.nodal.some(load => load.case === caseName) ||
        frameData.loads.distributed.some(load => load.case === caseName) ||
        frameData.loads.elementPoint.some(load => load.case === caseName);

    if (hasLoads) {
        const confirm = window.confirm(
            `Load case "${caseName}" has loads assigned to it. Deleting it will also delete all associated loads. Continue?`
        );
        if (!confirm) return;

        // Remove all loads associated with this case
        frameData.loads.nodal = frameData.loads.nodal.filter(load => load.case !== caseName);
        frameData.loads.distributed = frameData.loads.distributed.filter(load => load.case !== caseName);
        frameData.loads.elementPoint = frameData.loads.elementPoint.filter(load => load.case !== caseName);
    }

    loadCases.splice(index, 1);
    console.log(`Deleted load case: ${caseName}`);

    // If active case was deleted, switch to first available case
    if (activeLoadCase === caseName) {
        activeLoadCase = loadCases[0].name;
    }

    updateLoadCasesList();
    updateActiveLoadCaseDropdown();
    updateVisualization();
}

// ========================================
// Load Combinations Functions
// ========================================

/**
 * Show the load combinations modal
 */
function showLoadCombinationsDialog() {
    const modal = document.getElementById('load-combinations-modal');
    modal.classList.remove('hidden');
    updateCombinationsList();
}

/**
 * Close the load combinations modal
 */
function closeLoadCombinationsDialog() {
    const modal = document.getElementById('load-combinations-modal');
    modal.classList.add('hidden');
}

/**
 * Update the combinations list display
 */
function updateCombinationsList() {
    const listContainer = document.getElementById('combinations-list');
    const noMessage = document.getElementById('no-combinations-message');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (loadCombinations.length === 0) {
        noMessage.classList.remove('hidden');
        return;
    }

    noMessage.classList.add('hidden');

    loadCombinations.forEach((combo, index) => {
        const comboDiv = document.createElement('div');
        comboDiv.className = 'bg-gray-700 rounded-lg p-4 border border-gray-600';

        // Build factors display
        let factorsHTML = '';
        for (const [caseName, factor] of Object.entries(combo.factors)) {
            if (factor !== 0) {
                factorsHTML += `<div class="text-sm text-gray-300 ml-4">• ${factor.toFixed(2)} × ${caseName}</div>`;
            }
        }

        comboDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <h5 class="text-white font-medium">${combo.name}</h5>
                    <span class="inline-block px-2 py-1 text-xs rounded mt-1 ${getComboTagStyle(combo.comboTag)}">${combo.comboTag}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="editCombination(${index})" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                        Edit
                    </button>
                    <button onclick="deleteCombination(${index})" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">
                        Delete
                    </button>
                </div>
            </div>
            <div class="mt-3">
                ${factorsHTML}
            </div>
        `;

        listContainer.appendChild(comboDiv);
    });
}

/**
 * Get styling for combo tag badge
 */
function getComboTagStyle(tag) {
    const styles = {
        'ULS': 'bg-red-600 text-white',
        'ALS': 'bg-orange-600 text-white',
        'Characteristic': 'bg-blue-600 text-white',
        'Frequent': 'bg-green-600 text-white',
        'Quasi-Permanent': 'bg-purple-600 text-white'
    };
    return styles[tag] || 'bg-gray-600 text-white';
}

/**
 * Show dialog to add a new combination
 */
function showAddCombinationDialog() {
    if (loadCases.length === 0) {
        alert('Please add at least one load case first.');
        return;
    }

    // Reset form for adding
    document.getElementById('combination-form-title').textContent = 'Add Combination';
    document.getElementById('combo-name').value = '';
    document.getElementById('combo-tag').value = 'ULS';
    document.getElementById('combo-edit-index').value = '';

    // Populate factor inputs
    const factorsList = document.getElementById('combo-factors-list');
    factorsList.innerHTML = '';

    loadCases.forEach(loadCase => {
        const factorDiv = document.createElement('div');
        factorDiv.className = 'flex items-center gap-2';
        factorDiv.innerHTML = `
            <label class="text-gray-300 text-sm w-24">${loadCase.name}:</label>
            <input type="number" step="0.01" value="1.0"
                data-load-case="${loadCase.name}"
                class="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none combo-factor-input">
        `;
        factorsList.appendChild(factorDiv);
    });

    // Show modal
    document.getElementById('combination-form-modal').classList.remove('hidden');
}

/**
 * Edit an existing combination
 */
function editCombination(index) {
    const combo = loadCombinations[index];

    // Set form for editing
    document.getElementById('combination-form-title').textContent = 'Edit Combination';
    document.getElementById('combo-name').value = combo.name;
    document.getElementById('combo-tag').value = combo.comboTag;
    document.getElementById('combo-edit-index').value = index;

    // Populate factor inputs with current values
    const factorsList = document.getElementById('combo-factors-list');
    factorsList.innerHTML = '';

    loadCases.forEach(loadCase => {
        const currentFactor = combo.factors[loadCase.name] || 0;
        const factorDiv = document.createElement('div');
        factorDiv.className = 'flex items-center gap-2';
        factorDiv.innerHTML = `
            <label class="text-gray-300 text-sm w-24">${loadCase.name}:</label>
            <input type="number" step="0.01" value="${currentFactor}"
                data-load-case="${loadCase.name}"
                class="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none combo-factor-input">
        `;
        factorsList.appendChild(factorDiv);
    });

    // Show modal
    document.getElementById('combination-form-modal').classList.remove('hidden');
}

/**
 * Close the combination form dialog
 */
function closeCombinationFormDialog() {
    document.getElementById('combination-form-modal').classList.add('hidden');
}

/**
 * Save combination from form
 */
function saveCombination(event) {
    event.preventDefault();

    const name = document.getElementById('combo-name').value.trim();
    const comboTag = document.getElementById('combo-tag').value;
    const editIndex = document.getElementById('combo-edit-index').value;

    // Check for duplicate names (excluding current if editing)
    const isDuplicate = loadCombinations.some((combo, i) => {
        if (editIndex !== '' && i === parseInt(editIndex)) return false; // Skip current combo if editing
        return combo.name === name;
    });

    if (isDuplicate) {
        alert('A combination with this name already exists. Please use a unique name.');
        return;
    }

    // Collect factors from inputs
    const factors = {};
    document.querySelectorAll('.combo-factor-input').forEach(input => {
        const loadCaseName = input.getAttribute('data-load-case');
        factors[loadCaseName] = parseFloat(input.value) || 0;
    });

    const combination = {
        name: name,
        comboTag: comboTag,
        factors: factors
    };

    if (editIndex === '') {
        // Adding new combination
        loadCombinations.push(combination);
        console.log(`Added combination: ${combination.name}`);
    } else {
        // Editing existing combination
        loadCombinations[parseInt(editIndex)] = combination;
        console.log(`Updated combination: ${combination.name}`);
    }

    closeCombinationFormDialog();
    updateCombinationsList();
}

/**
 * Delete a combination
 */
function deleteCombination(index) {
    const combo = loadCombinations[index];

    const confirm = window.confirm(`Delete combination "${combo.name}"?`);
    if (!confirm) return;

    loadCombinations.splice(index, 1);
    console.log(`Deleted combination: ${combo.name}`);

    updateCombinationsList();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting initialization...');

    // Update status to show database loading
    const statusText = document.querySelector('#loading-status span');
    if (statusText) statusText.textContent = 'Loading steel section database...';

    await loadSteelSectionDatabase();

    console.log('Database loaded, starting Pyodide...');
    if (statusText) statusText.textContent = 'Initializing Analysis Environment...';

    await initializePyodide();

    // Initialize load cases UI
    updateLoadCasesList();
    updateActiveLoadCaseDropdown();

    // Initialize Analysis tab event listeners
    document.querySelectorAll('input[name="result-view-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            setResultViewMode(e.target.value);
        });
    });

    document.getElementById('result-selection-dropdown')?.addEventListener('change', (e) => {
        onResultSelectionChange(e.target.value);
    });

    // Initialize dropdown with load cases (default mode)
    updateResultSelectionDropdown();
});

// Add event listeners for real-time updates
document.addEventListener('input', function(e) {
    if (e.target.closest('#nodes-container, #elements-container, #loads-container')) {
        setTimeout(updateVisualization, 100);
    }
});

// Also update visualization when nodes, elements or loads change via dropdowns/selects
document.addEventListener('change', function(e) {
    if (e.target.closest('#nodes-container, #elements-container, #loads-container')) {
        setTimeout(updateVisualization, 100);
    }
});

// Force diagram plotting functions
function displayForceDiagrams(diagramsData) {
    const container = document.getElementById('diagrams-container');
    container.innerHTML = '';

    if (!diagramsData || Object.keys(diagramsData).length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No diagram data available</p>';
        return;
    }

    // Create diagrams for each element
    for (const [elementName, elementData] of Object.entries(diagramsData)) {
        if (elementData.x_coordinates && elementData.x_coordinates.length > 0) {
            createElementDiagrams(container, elementName, elementData);
        }
    }
}

function createElementDiagrams(container, elementName, data) {
    // Create container for this element's diagrams
    const elementDiv = document.createElement('div');
    elementDiv.className = 'bg-gray-600 rounded-lg p-4 space-y-3';

    const title = document.createElement('h4');
    title.className = 'text-white font-medium mb-3';
    title.textContent = `Element ${elementName} Force Diagrams`;
    elementDiv.appendChild(title);

    // Create three diagrams: Moment, Shear, Axial
    const diagramTypes = [
        { name: 'Moment', data: data.moments, color: '#ef4444', unit: 'Nm' },
        { name: 'Shear', data: data.shears, color: '#22c55e', unit: 'N' },
        { name: 'Axial', data: data.axials, color: '#3b82f6', unit: 'N' }
    ];

    diagramTypes.forEach(diagram => {
        if (diagram.data && diagram.data.length > 0) {
            const diagramContainer = createSingleDiagram(
                elementName,
                diagram.name,
                data.x_coordinates,
                diagram.data,
                diagram.color,
                diagram.unit
            );
            elementDiv.appendChild(diagramContainer);
        }
    });

    container.appendChild(elementDiv);
}

function createSingleDiagram(elementName, diagramType, xCoords, yValues, color, unit) {
    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'bg-gray-700 rounded p-3';

    // Diagram title
    const title = document.createElement('div');
    title.className = 'text-gray-300 text-sm font-medium mb-2';
    title.textContent = `${diagramType} Diagram`;
    diagramDiv.appendChild(title);

    // SVG container
    const svgWidth = 400;
    const svgHeight = 120;
    const margin = { top: 10, right: 30, bottom: 30, left: 60 };
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svg = d3.select(diagramDiv)
        .append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight)
        .style('background', '#374151')
        .style('border-radius', '4px');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
        .domain([0, Math.max(...xCoords)])
        .range([0, width]);

    const yExtent = d3.extent(yValues);
    const yScale = d3.scaleLinear()
        .domain(yExtent)
        .nice()
        .range([height, 0]);

    // Zero line
    if (yExtent[0] < 0 && yExtent[1] > 0) {
        g.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', yScale(0))
            .attr('y2', yScale(0))
            .attr('stroke', '#9ca3af')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');
    }

    // Create line generator
    const line = d3.line()
        .x((d, i) => xScale(xCoords[i]))
        .y(d => yScale(d))
        .curve(d3.curveMonotoneX);

    // Add the line
    g.append('path')
        .datum(yValues)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line);

    // Add area fill
    const area = d3.area()
        .x((d, i) => xScale(xCoords[i]))
        .y0(yScale(0))
        .y1(d => yScale(d))
        .curve(d3.curveMonotoneX);

    g.append('path')
        .datum(yValues)
        .attr('fill', color)
        .attr('fill-opacity', 0.2)
        .attr('d', area);

    // Add points
    g.selectAll('.dot')
        .data(yValues)
        .enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', (d, i) => xScale(xCoords[i]))
        .attr('cy', d => yScale(d))
        .attr('r', 2)
        .attr('fill', color);

    // X Axis
    g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(5))
        .selectAll('text')
        .style('fill', '#d1d5db')
        .style('font-size', '10px');

    // Y Axis
    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5))
        .selectAll('text')
        .style('fill', '#d1d5db')
        .style('font-size', '10px');

    // Axis lines
    g.selectAll('.domain, .tick line')
        .style('stroke', '#9ca3af');

    // Y axis label
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left + 15)
        .attr('x', 0 - (height / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('fill', '#d1d5db')
        .style('font-size', '10px')
        .text(`${diagramType} (${unit})`);

    // X axis label
    g.append('text')
        .attr('transform', `translate(${width/2}, ${height + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .style('fill', '#d1d5db')
        .style('font-size', '10px')
        .text('Distance (m)');

    // Max/min value labels
    const maxValue = Math.max(...yValues);
    const minValue = Math.min(...yValues);
    const maxIndex = yValues.indexOf(maxValue);
    const minIndex = yValues.indexOf(minValue);

    if (maxValue !== 0) {
        g.append('text')
            .attr('x', xScale(xCoords[maxIndex]))
            .attr('y', yScale(maxValue) - 5)
            .attr('text-anchor', 'middle')
            .style('fill', '#fbbf24')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`${(maxValue/1000).toFixed(1)}k`);
    }

    if (minValue !== 0 && minValue !== maxValue) {
        g.append('text')
            .attr('x', xScale(xCoords[minIndex]))
            .attr('y', yScale(minValue) + 15)
            .attr('text-anchor', 'middle')
            .style('fill', '#fbbf24')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .text(`${(minValue/1000).toFixed(1)}k`);
    }

    return diagramDiv;
}

// Draw diagrams directly on elements in the main visualization
function drawDiagramsOnElements(svg, elements, nodes, xScale, yScale, results, diagramType) {
    const scale = parseFloat(document.getElementById('diagram-scale')?.value || 1.0);

    elements.forEach(element => {
        const nodeI = nodes.find(n => n.name === element.nodeI);
        const nodeJ = nodes.find(n => n.name === element.nodeJ);

        if (!nodeI || !nodeJ) return;

        // Get diagram data for this element
        const diagramData = results.diagrams[element.name];
        if (!diagramData) return;

        // Select the appropriate data array
        let dataArray, color, label;
        if (diagramType === 'moment') {
            dataArray = diagramData.moments;
            color = '#ef4444';
            label = 'Moment';
        } else if (diagramType === 'shear') {
            dataArray = diagramData.shears;
            color = '#22c55e';
            label = 'Shear';
        } else if (diagramType === 'axial') {
            dataArray = diagramData.axials;
            color = '#3b82f6';
            label = 'Axial';
        } else if (diagramType === 'displacement') {
            // Use deflections array from diagram data (11 points)
            dataArray = diagramData.deflections;
            color = '#fbbf24';
            label = 'Deflection';
        }

        if (!dataArray || dataArray.length === 0) return;

        // Calculate element geometry in physical coordinates (meters)
        const nodeIX = parseFloat(nodeI.x);
        const nodeIY = parseFloat(nodeI.y);
        const nodeJX = parseFloat(nodeJ.x);
        const nodeJY = parseFloat(nodeJ.y);

        const physicalDx = nodeJX - nodeIX;
        const physicalDy = nodeJY - nodeIY;
        const physicalLength = Math.sqrt(physicalDx * physicalDx + physicalDy * physicalDy);
        const angle = Math.atan2(physicalDy, physicalDx);

        // Perpendicular direction (rotate by 90 degrees)
        const perpAngle = angle + Math.PI / 2;
        const perpX = Math.cos(perpAngle);
        const perpY = Math.sin(perpAngle);

        // Create path data for diagram
        const xCoords = diagramData.x_coordinates;
        const pathData = [];

        for (let i = 0; i < dataArray.length; i++) {
            const localX = xCoords[i];
            const value = dataArray[i];

            // Position along element in physical coordinates
            const t = localX / diagramData.length;
            const physicalX = nodeIX + physicalDx * t;
            const physicalY = nodeIY + physicalDy * t;

            // Calculate offset in physical units (meters)
            // Use consistent scale factor across all elements
            let physicalOffset = value * scale;

            // Sign convention:
            // - Moments: positive moments should appear on the OPPOSITE side of perpendicular
            //   (this is the standard convention - positive moment creates compression on top)
            // - Displacement: natural direction (negative = deflects in negative perpendicular direction)
            if (diagramType === 'moment') {
                physicalOffset = physicalOffset; // Invert for standard moment diagram convention
            }

            // Apply offset in physical coordinates
            const offsetPhysicalX = physicalX + perpX * physicalOffset;
            const offsetPhysicalY = physicalY + perpY * physicalOffset;

            // Transform to pixel coordinates
            const offsetX = xScale(offsetPhysicalX);
            const offsetY = yScale(offsetPhysicalY);

            pathData.push({ x: offsetX, y: offsetY });
        }

        // Draw the diagram path
        const line = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveMonotoneX);

        // Draw baseline (element line) in pixel coordinates
        const x1 = xScale(nodeIX);
        const y1 = yScale(nodeIY);
        const x2 = xScale(nodeJX);
        const y2 = yScale(nodeJY);

        svg.append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)
            .attr("stroke", "#9ca3af")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "2,2")
            .attr("opacity", 0.5);

        // Draw diagram curve
        svg.append("path")
            .datum(pathData)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("d", line);

        // Draw filled area between baseline and curve
        const areaData = [
            { x: x1, y: y1 },
            ...pathData,
            { x: x2, y: y2 }
        ];

        svg.append("path")
            .datum(areaData)
            .attr("fill", color)
            .attr("fill-opacity", 0.2)
            .attr("stroke", "none")
            .attr("d", d3.line()
                .x(d => d.x)
                .y(d => d.y));

        // Add visible hover points along the diagram
        pathData.forEach((point, i) => {
            // Add a small visible dot to show interactive location
            svg.append("circle")
                .attr("cx", point.x)
                .attr("cy", point.y)
                .attr("r", 2.5)
                .attr("fill", color)
                .attr("fill-opacity", 0.6)
                .attr("stroke", "white")
                .attr("stroke-width", 0.5)
                .attr("pointer-events", "none");

            // Add larger invisible hover area
            const circle = svg.append("circle")
                .attr("cx", point.x)
                .attr("cy", point.y)
                .attr("r", 15)
                .attr("fill", "transparent")
                .attr("stroke", "none")
                .style("cursor", "pointer");

            // Add click interaction to show tooltip
            circle.on("click", function(event) {
                event.stopPropagation();

                // Remove any existing tooltips and export menus
                svg.selectAll(".diagram-tooltip").remove();
                svg.selectAll(".diagram-hover-point").remove();
                svg.selectAll(".export-toolbar").remove();
                svg.selectAll(".node-tooltip").remove();

                // Highlight the point
                svg.append("circle")
                    .attr("class", "diagram-hover-point")
                    .attr("cx", point.x)
                    .attr("cy", point.y)
                    .attr("r", 4)
                    .attr("fill", color)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2);

                // Create tooltip with ALL diagram values
                const tooltip = svg.append("g")
                    .attr("class", "diagram-tooltip");

                const tooltipText = [
                    `Element: ${element.name}`,
                    `Position: ${xCoords[i].toFixed(3)} m`,
                    `---`
                ];

                // Add all available diagram values
                if (diagramData.moments && diagramData.moments[i] !== undefined) {
                    tooltipText.push(`Moment: ${(diagramData.moments[i] / 1000).toFixed(2)} kNm`);
                }
                if (diagramData.shears && diagramData.shears[i] !== undefined) {
                    tooltipText.push(`Shear: ${(diagramData.shears[i] / 1000).toFixed(2)} kN`);
                }
                if (diagramData.axials && diagramData.axials[i] !== undefined) {
                    tooltipText.push(`Axial: ${(diagramData.axials[i] / 1000).toFixed(2)} kN`);
                }
                if (diagramData.deflections && diagramData.deflections[i] !== undefined) {
                    tooltipText.push(`Deflection: ${(diagramData.deflections[i] * 1000).toFixed(2)} mm`);
                }

                // Add node displacements if at element endpoints
                const nodeIData = results.nodes[element.nodeI];
                const nodeJData = results.nodes[element.nodeJ];
                if (i === 0 && nodeIData) {
                    tooltipText.push(`---`);
                    tooltipText.push(`Node ${element.nodeI}:`);
                    tooltipText.push(`  DX: ${(nodeIData.DX * 1000).toFixed(2)} mm`);
                    tooltipText.push(`  DY: ${(nodeIData.DY * 1000).toFixed(2)} mm`);
                    tooltipText.push(`  RZ: ${(nodeIData.RZ * 1000).toFixed(3)} mrad`);
                } else if (i === pathData.length - 1 && nodeJData) {
                    tooltipText.push(`---`);
                    tooltipText.push(`Node ${element.nodeJ}:`);
                    tooltipText.push(`  DX: ${(nodeJData.DX * 1000).toFixed(2)} mm`);
                    tooltipText.push(`  DY: ${(nodeJData.DY * 1000).toFixed(2)} mm`);
                    tooltipText.push(`  RZ: ${(nodeJData.RZ * 1000).toFixed(3)} mrad`);
                }

                const lineHeight = 14;
                const padding = 8;
                const boxWidth = 160;
                const buttonHeight = 25;
                const boxHeight = tooltipText.length * lineHeight + padding * 2 + buttonHeight + 5;

                // Position tooltip to avoid going off screen
                let tooltipX = point.x + 10;
                let tooltipY = point.y - boxHeight / 2;

                // Adjust if tooltip would go off the right edge
                const svgWidth = svg.node().clientWidth;
                if (tooltipX + boxWidth > svgWidth) {
                    tooltipX = point.x - boxWidth - 10;
                }

                // Adjust if tooltip would go off the top or bottom edge
                const svgHeight = 400; // From the SVG height
                if (tooltipY < 0) {
                    tooltipY = 10;
                } else if (tooltipY + boxHeight > svgHeight) {
                    tooltipY = svgHeight - boxHeight - 10;
                }

                // Constrain to stay within SVG bounds
                tooltipX = Math.max(0, Math.min(tooltipX, svgWidth - boxWidth));
                tooltipY = Math.max(0, Math.min(tooltipY, svgHeight - boxHeight));

                tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);

                // Add drag behavior to make tooltip movable
                const dragBehavior = d3.drag()
                    .on("drag", function(event) {
                        const transform = d3.select(this).attr("transform");
                        const translate = transform.match(/translate\(([^,]+),([^)]+)\)/);
                        let x = parseFloat(translate[1]);
                        let y = parseFloat(translate[2]);

                        x += event.dx;
                        y += event.dy;

                        // Constrain to SVG bounds
                        x = Math.max(0, Math.min(x, svgWidth - boxWidth));
                        y = Math.max(0, Math.min(y, svgHeight - boxHeight));

                        d3.select(this).attr("transform", `translate(${x}, ${y})`);
                    });

                tooltip.call(dragBehavior);

                const bgRect = tooltip.append("rect")
                    .attr("width", boxWidth)
                    .attr("height", boxHeight)
                    .attr("fill", "#1f2937")
                    .attr("stroke", color)
                    .attr("stroke-width", 2)
                    .attr("rx", 4)
                    .style("cursor", "move");

                tooltipText.forEach((text, idx) => {
                    const isHeader = text === '---';
                    const isIndented = text.startsWith('  ');
                    const xOffset = isIndented ? padding + 10 : padding;

                    tooltip.append("text")
                        .attr("x", xOffset)
                        .attr("y", padding + (idx + 1) * lineHeight)
                        .attr("fill", isHeader ? "#9ca3af" : "#E5E7EB")
                        .attr("font-size", "11px")
                        .attr("font-weight", (idx === 0 || text.includes('Node')) ? "bold" : "normal")
                        .text(isHeader ? "─────────────" : text);
                });

                // Prepare export data for this point
                const exportData = {
                    source: "2D Frame Analysis",
                    combo: "Combo 1",
                    type: "element_point",
                    element_data: {
                        element: element.name,
                        position: xCoords[i],
                        Mz: diagramData.moments ? diagramData.moments[i] : 0,
                        Fy: diagramData.shears ? diagramData.shears[i] : 0,
                        Fx: diagramData.axials ? diagramData.axials[i] : 0,
                        dy: diagramData.deflections ? diagramData.deflections[i] : 0
                    }
                };

                // Add export button at bottom of tooltip
                const exportBtn = tooltip.append("g")
                    .attr("class", "export-button")
                    .style("cursor", "pointer")
                    .on("click", function(event) {
                        event.stopPropagation();
                        svg.selectAll(".diagram-tooltip").remove();
                        svg.selectAll(".diagram-hover-point").remove();
                        // Position export menu away from the tooltip
                        showExportToolbar(svg, tooltipX > svgWidth / 2 ? point.x - 200 : point.x + 180, point.y, exportData);
                    });

                const btnY = boxHeight - buttonHeight - padding;
                exportBtn.append("rect")
                    .attr("x", padding)
                    .attr("y", btnY)
                    .attr("width", boxWidth - 2 * padding)
                    .attr("height", buttonHeight)
                    .attr("fill", "#3b82f6")
                    .attr("stroke", "#60a5fa")
                    .attr("stroke-width", 1)
                    .attr("rx", 3);

                exportBtn.append("text")
                    .attr("x", boxWidth / 2)
                    .attr("y", btnY + buttonHeight / 2 + 4)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#fff")
                    .attr("font-size", "11px")
                    .attr("font-weight", "bold")
                    .text("📤 Export Results");
            });
        });

        // Add max/min value labels with proper units
        const maxValue = Math.max(...dataArray.map(Math.abs));
        if (maxValue > 0) {
            const maxIndex = dataArray.findIndex(v => Math.abs(v) === maxValue);
            const maxPoint = pathData[maxIndex];

            // Format value with appropriate units based on diagram type
            let labelText = '';
            const value = dataArray[maxIndex];

            if (diagramType === 'moment') {
                // Moment: kNm
                labelText = `${(value / 1000).toFixed(1)} kNm`;
            } else if (diagramType === 'shear') {
                // Shear: kN
                labelText = `${(value / 1000).toFixed(1)} kN`;
            } else if (diagramType === 'axial') {
                // Axial: kN
                labelText = `${(value / 1000).toFixed(1)} kN`;
            } else if (diagramType === 'displacement') {
                // Displacement: mm (convert from m to mm)
                labelText = `${(value * 1000).toFixed(2)} mm`;
            } else {
                // Fallback
                labelText = `${(value / 1000).toFixed(1)}k`;
            }

            svg.append("text")
                .attr("x", maxPoint.x)
                .attr("y", maxPoint.y - 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#fbbf24")
                .attr("font-size", "10px")
                .attr("font-weight", "bold")
                .text(labelText);
        }
    });
}

// Show export toolbar for clicked results
function showExportToolbar(svg, x, y, exportData) {
    // Remove any existing toolbars
    svg.selectAll(".export-toolbar").remove();

    const toolbar = svg.append("g")
        .attr("class", "export-toolbar");

    const toolbarWidth = 180;
    const toolbarHeight = 80;
    const buttonHeight = 30;
    const padding = 10;

    // Position toolbar to avoid going off screen
    let toolbarX = x + 20;
    let toolbarY = y - toolbarHeight / 2;

    const svgWidth = svg.node().clientWidth;
    const svgHeight = 400;

    if (toolbarX + toolbarWidth > svgWidth) {
        toolbarX = x - toolbarWidth - 20;
    }
    if (toolbarY < 0) {
        toolbarY = 10;
    } else if (toolbarY + toolbarHeight > svgHeight) {
        toolbarY = svgHeight - toolbarHeight - 10;
    }

    toolbar.attr("transform", `translate(${toolbarX}, ${toolbarY})`);

    // Background
    toolbar.append("rect")
        .attr("width", toolbarWidth)
        .attr("height", toolbarHeight)
        .attr("fill", "#1f2937")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2)
        .attr("rx", 6);

    // Close button
    const closeBtn = toolbar.append("g")
        .attr("class", "close-button")
        .style("cursor", "pointer")
        .on("click", function(event) {
            event.stopPropagation();
            svg.selectAll(".export-toolbar").remove();
        });

    closeBtn.append("circle")
        .attr("cx", toolbarWidth - 15)
        .attr("cy", 15)
        .attr("r", 8)
        .attr("fill", "#ef4444")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

    closeBtn.append("text")
        .attr("x", toolbarWidth - 15)
        .attr("y", 19)
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("×");

    // Export to JSON button
    const jsonBtn = toolbar.append("g")
        .attr("class", "json-export-button")
        .style("cursor", "pointer")
        .on("click", function(event) {
            event.stopPropagation();
            exportToJSON(exportData);
        });

    jsonBtn.append("rect")
        .attr("x", padding)
        .attr("y", padding + 10)
        .attr("width", toolbarWidth - 2 * padding)
        .attr("height", buttonHeight)
        .attr("fill", "#3b82f6")
        .attr("stroke", "#60a5fa")
        .attr("stroke-width", 1)
        .attr("rx", 4);

    jsonBtn.append("text")
        .attr("x", toolbarWidth / 2)
        .attr("y", padding + 30)
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Export to JSON");

    // Export to Module button with arrow
    const moduleBtn = toolbar.append("g")
        .attr("class", "module-export-button")
        .style("cursor", "pointer");

    moduleBtn.append("rect")
        .attr("x", padding)
        .attr("y", padding + 15 + buttonHeight)
        .attr("width", toolbarWidth - 2 * padding)
        .attr("height", buttonHeight)
        .attr("fill", "#6b7280")
        .attr("stroke", "#9ca3af")
        .attr("stroke-width", 1)
        .attr("rx", 4);

    moduleBtn.append("text")
        .attr("x", padding + 10)
        .attr("y", padding + 35 + buttonHeight)
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("Export to Module");

    moduleBtn.append("text")
        .attr("x", toolbarWidth - padding - 10)
        .attr("y", padding + 35 + buttonHeight)
        .attr("text-anchor", "end")
        .attr("fill", "#fff")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .text("▶");

    // Add hover interaction for module dropdown
    moduleBtn.on("mouseenter", function() {
        showModuleDropdown(toolbar, toolbarWidth, toolbarHeight, exportData);
    });

    // Close toolbar on SVG click
    svg.on("click.toolbar", function() {
        svg.selectAll(".export-toolbar").remove();
        svg.selectAll(".module-dropdown").remove();
    });
}

// Show module selection dropdown
function showModuleDropdown(toolbar, parentWidth, parentHeight, exportData) {
    // Remove existing dropdown
    toolbar.selectAll(".module-dropdown").remove();

    const dropdown = toolbar.append("g")
        .attr("class", "module-dropdown");

    const dropdownWidth = 180;
    const dropdownHeight = 100;
    const itemHeight = 30;
    const padding = 5;

    dropdown.attr("transform", `translate(${parentWidth + 5}, ${parentHeight - dropdownHeight})`);

    // Background
    dropdown.append("rect")
        .attr("width", dropdownWidth)
        .attr("height", dropdownHeight)
        .attr("fill", "#374151")
        .attr("stroke", "#9ca3af")
        .attr("stroke-width", 1)
        .attr("rx", 4);

    // Module options (disabled for now)
    const modules = [
        "Concrete Slab Design",
        "Concrete Beam Design",
        "Steel Profile Calculator"
    ];

    modules.forEach((moduleName, i) => {
        const moduleItem = dropdown.append("g")
            .attr("class", "module-item")
            .style("cursor", "not-allowed")
            .attr("opacity", 0.5);

        moduleItem.append("rect")
            .attr("x", padding)
            .attr("y", padding + i * itemHeight)
            .attr("width", dropdownWidth - 2 * padding)
            .attr("height", itemHeight - 2)
            .attr("fill", "#4b5563")
            .attr("rx", 3);

        moduleItem.append("text")
            .attr("x", padding + 10)
            .attr("y", padding + i * itemHeight + 20)
            .attr("fill", "#9ca3af")
            .attr("font-size", "11px")
            .text(`☐ ${moduleName}`);
    });

    // Remove dropdown on mouse leave from both toolbar and dropdown
    dropdown.on("mouseleave", function() {
        dropdown.remove();
    });
}

// Export results to JSON file
function exportToJSON(exportData) {
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Generate filename based on data type
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = exportData.type === 'node'
        ? `node_${exportData.node_data.name}_${timestamp}.json`
        : `element_${exportData.element_data.element}_pos${exportData.element_data.position.toFixed(2)}m_${timestamp}.json`;

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// Autoscale diagram to 1/10 of longest element
function autoscaleDiagram() {
    if (!lastAnalysisResults || !lastAnalysisResults.diagrams) {
        alert("Please run analysis first.");
        return;
    }

    const diagramType = document.getElementById('diagram-type')?.value;
    if (!diagramType || diagramType === 'none') {
        alert("Please select a diagram type first.");
        return;
    }

    // Find longest element from stored results (not recalculating!)
    let maxLength = 0;
    for (const [elementName, diagramData] of Object.entries(lastAnalysisResults.diagrams)) {
        maxLength = Math.max(maxLength, diagramData.length);
    }

    if (maxLength === 0) {
        alert("No valid element lengths found.");
        return;
    }

    // Find maximum diagram amplitude (in display units for proper scaling)
    let maxAmplitude = 0;
    let displayUnit = '';

    for (const [elementName, diagramData] of Object.entries(lastAnalysisResults.diagrams)) {
        let dataArray;
        let unitConversion = 1;

        if (diagramType === 'moment') {
            dataArray = diagramData.moments;
            unitConversion = 1/1000; // Convert Nm to kNm for scaling
            displayUnit = 'kNm';
        } else if (diagramType === 'shear') {
            dataArray = diagramData.shears;
            unitConversion = 1/1000; // Convert N to kN for scaling
            displayUnit = 'kN';
        } else if (diagramType === 'axial') {
            dataArray = diagramData.axials;
            unitConversion = 1/1000; // Convert N to kN for scaling
            displayUnit = 'kN';
        } else if (diagramType === 'displacement') {
            dataArray = diagramData.deflections;
            unitConversion = 1000; // Convert m to mm for scaling
            displayUnit = 'mm';
        }

        if (dataArray && dataArray.length > 0) {
            // Find max in display units
            const localMax = Math.max(...dataArray.map(v => Math.abs(v * unitConversion)));
            maxAmplitude = Math.max(maxAmplitude, localMax);
        }
    }

    if (maxAmplitude === 0) {
        alert("No diagram data to scale.");
        return;
    }

    // Calculate scale: we want max amplitude to be 1/10 of longest element in physical units (meters)
    // Formula: physicalOffset = value * scale
    // We want: maxLength / 10 = maxValue * scale
    // Therefore: scale = (maxLength / 10) / maxValue

    // maxAmplitude is in display units (kNm, kN, or mm)
    // We need to convert back to raw units for the scale calculation
    let rawMaxAmplitude;
    if (diagramType === 'moment' || diagramType === 'shear' || diagramType === 'axial') {
        rawMaxAmplitude = maxAmplitude * 1000; // Convert kNm/kN back to Nm/N
    } else if (diagramType === 'displacement') {
        rawMaxAmplitude = maxAmplitude / 1000; // Convert mm back to m
    }

    const targetAmplitude = maxLength / 10; // Target amplitude in meters
    const scaleValue = targetAmplitude / rawMaxAmplitude;

    document.getElementById('diagram-scale').value = scaleValue.toFixed(6);
    updateVisualization();

    console.log(`Autoscale: max length=${maxLength.toFixed(2)}m, max amplitude=${maxAmplitude.toFixed(2)} ${displayUnit}, scale=${scaleValue.toExponential(3)}`);
}

// Tab switching function
function switchTab(tabName) {
    // Check if Analysis tab is disabled
    if (tabName === 'analysis' && !isAnalysisTabEnabled()) {
        console.log('Analysis tab is disabled. Run analysis first.');
        return;
    }

    // Hide all tab contents
    document.getElementById('content-structure').classList.add('hidden');
    document.getElementById('content-loads').classList.add('hidden');
    document.getElementById('content-analysis').classList.add('hidden');

    // Remove active styling from all tabs
    document.getElementById('tab-structure').className = 'px-6 py-3 text-gray-400 font-medium hover:text-white';
    document.getElementById('tab-loads').className = 'px-6 py-3 text-gray-400 font-medium hover:text-white';
    if (isAnalysisTabEnabled()) {
        document.getElementById('tab-analysis').className = 'px-6 py-3 text-gray-400 font-medium hover:text-white';
    }

    // Show selected tab content and apply active styling
    if (tabName === 'structure') {
        document.getElementById('content-structure').classList.remove('hidden');
        document.getElementById('tab-structure').className = 'px-6 py-3 text-white font-medium border-b-2 border-blue-500 bg-gray-600';
    } else if (tabName === 'loads') {
        document.getElementById('content-loads').classList.remove('hidden');
        document.getElementById('tab-loads').className = 'px-6 py-3 text-white font-medium border-b-2 border-blue-500 bg-gray-600';
    } else if (tabName === 'analysis') {
        document.getElementById('content-analysis').classList.remove('hidden');
        document.getElementById('tab-analysis').className = 'px-6 py-3 text-white font-medium border-b-2 border-blue-500 bg-gray-600';
    }

    // Update visualization to show/hide loads based on active tab
    updateVisualization();
}

/**
 * Check if Analysis tab is enabled
 */
function isAnalysisTabEnabled() {
    const tabBtn = document.getElementById('tab-analysis');
    return !tabBtn.hasAttribute('disabled');
}

/**
 * Enable the Analysis tab after first successful analysis
 */
function enableAnalysisTab() {
    const tabBtn = document.getElementById('tab-analysis');
    tabBtn.removeAttribute('disabled');
    tabBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    tabBtn.classList.add('hover:text-white');
    console.log('✓ Analysis tab enabled');
}

// Helper function to check if Loads tab is active
function isLoadsTabActive() {
    return !document.getElementById('content-loads').classList.contains('hidden');
}

// ========================================
// Analysis Tab Functions
// ========================================

/**
 * Set the result view mode (load cases or combinations)
 */
function setResultViewMode(mode) {
    resultViewMode = mode;
    console.log(`Result view mode: ${mode}`);
    updateResultSelectionDropdown();
}

/**
 * Update the result selection dropdown based on view mode
 */
function updateResultSelectionDropdown() {
    const dropdown = document.getElementById('result-selection-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">-- Select --</option>';

    if (resultViewMode === 'loadCases') {
        // Populate with load cases
        loadCases.forEach(loadCase => {
            const option = document.createElement('option');
            option.value = loadCase.name;
            option.textContent = loadCase.name;
            if (loadCase.name === activeResultName) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
    } else if (resultViewMode === 'combinations') {
        // Populate with load combinations
        if (loadCombinations.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '-- No combinations defined --';
            option.disabled = true;
            dropdown.appendChild(option);
        } else {
            loadCombinations.forEach(combo => {
                const option = document.createElement('option');
                option.value = combo.name;
                option.textContent = combo.name;
                if (combo.name === activeResultName) {
                    option.selected = true;
                }
                dropdown.appendChild(option);
            });
        }
    }
}

/**
 * Run complete unified analysis for all load cases and combinations
 * Uses PyNite's native combo system
 */
async function runCompleteAnalysis() {
    console.log('Running unified analysis for all load cases and combinations...');
    const startTime = performance.now();

    try {
        // Prepare input data with load cases and combinations
        const inputData = {
            nodes: getNodesFromInputs(),
            elements: getElementsFromInputs(),
            loads: frameData.loads,
            loadCases: loadCases,
            loadCombinations: loadCombinations
        };

        // Step 1: Analyze and store model in Python memory
        const inputDataJson = JSON.stringify(inputData).replace(/'/g, "\\'");
        const analysisResult = await pyodide.runPythonAsync(`
import json
result = analyze_and_store_model('${inputDataJson}')
result
        `);

        const analysisData = JSON.parse(analysisResult);

        if (!analysisData.success) {
            throw new Error(analysisData.message + (analysisData.traceback ? '\n' + analysisData.traceback : ''));
        }

        console.log(`✓ Model analyzed and stored in Python memory`);
        console.log(`  - Load cases: ${analysisData.loadCases.join(', ')}`);
        console.log(`  - Combinations: ${analysisData.combinations.join(', ')}`);

        // Step 2: Extract results for all load cases
        analysisResults.loadCases = {};
        for (const caseName of loadCases.map(lc => lc.name)) {
            console.log(`  Extracting results for load case: ${caseName}`);
            const extractResult = await pyodide.runPythonAsync(`
import json
result = extract_for_combo('${caseName}')
result
            `);

            const caseData = JSON.parse(extractResult);
            if (caseData.success) {
                analysisResults.loadCases[caseName] = {
                    nodes: caseData.nodes,
                    elements: caseData.elements,
                    diagrams: caseData.diagrams
                };
                console.log(`    ✓ ${Object.keys(caseData.diagrams).length} diagrams extracted`);
            } else {
                console.error(`    ✗ Failed: ${caseData.message}`);
            }
        }

        // Step 3: Extract results for all combinations
        analysisResults.combinations = {};
        for (const combo of loadCombinations) {
            console.log(`  Extracting results for combination: ${combo.name}`);
            const extractResult = await pyodide.runPythonAsync(`
import json
result = extract_for_combo('${combo.name}')
result
            `);

            const comboData = JSON.parse(extractResult);
            if (comboData.success) {
                analysisResults.combinations[combo.name] = {
                    nodes: comboData.nodes,
                    elements: comboData.elements,
                    diagrams: comboData.diagrams
                };
                console.log(`    ✓ ${Object.keys(comboData.diagrams).length} diagrams extracted`);
            } else {
                console.error(`    ✗ Failed: ${comboData.message}`);
            }
        }

        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);

        console.log(`✓ Analysis completed in ${duration}s`);
        console.log(`  - ${Object.keys(analysisResults.loadCases).length} load cases cached`);
        console.log(`  - ${Object.keys(analysisResults.combinations).length} combinations cached`);

        return true;

    } catch (error) {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);
        console.error(`✗ Analysis failed in ${duration}s:`, error);
        throw error;
    }
}

/**
 * Get results for a specific load case (from cache, run analysis if needed)
 */
async function runAnalysisForLoadCase(caseName) {
    // Check if already cached
    if (analysisResults.loadCases[caseName]) {
        console.log(`✓ Using cached results for load case: ${caseName}`);
        return analysisResults.loadCases[caseName];
    }

    // Run complete analysis to populate cache
    console.log(`Load case "${caseName}" not in cache. Running complete analysis...`);
    await runCompleteAnalysis();

    // Return from cache
    if (analysisResults.loadCases[caseName]) {
        return analysisResults.loadCases[caseName];
    } else {
        throw new Error(`Failed to get results for load case: ${caseName}`);
    }
}

/**
 * Get results for a specific combination (from cache, run analysis if needed)
 */
async function runAnalysisForCombination(comboName) {
    console.log(`>>> runAnalysisForCombination('${comboName}')`);
    console.log(`    Cached combinations:`, Object.keys(analysisResults.combinations));

    // Check if already cached
    if (analysisResults.combinations[comboName]) {
        console.log(`✓ Using cached results for combination: ${comboName}`);
        const results = analysisResults.combinations[comboName];
        console.log(`    Returning results with ${Object.keys(results.diagrams || {}).length} diagrams`);
        return results;
    }

    // Run complete analysis to populate cache
    console.log(`Combination "${comboName}" not in cache. Running complete analysis...`);
    await runCompleteAnalysis();

    console.log(`    After analysis, cached combinations:`, Object.keys(analysisResults.combinations));

    // Return from cache
    if (analysisResults.combinations[comboName]) {
        const results = analysisResults.combinations[comboName];
        console.log(`✓ Retrieved results for combination: ${comboName}`);
        console.log(`    Returning results with ${Object.keys(results.diagrams || {}).length} diagrams`);
        return results;
    } else {
        throw new Error(`Failed to get results for combination: ${comboName}`);
    }
}

/**
 * Get direct access to the PyNite model for advanced queries
 * WARNING: You must call .destroy() on the returned PyProxy when done!
 *
 * Example usage:
 *   const model = getStoredModel();
 *   const member = model.members.get('E1');
 *   const length = member.L();
 *   model.destroy();  // MUST DO THIS!
 */
function getStoredModel() {
    if (typeof pyodide === 'undefined') {
        console.error('Pyodide not initialized');
        return null;
    }

    const model = pyodide.globals.get('current_model');
    if (!model) {
        console.warn('No model in memory. Run analysis first.');
        return null;
    }

    console.log('⚠️  Retrieved PyProxy to model. Remember to call .destroy() when done!');
    return model;
}

/**
 * Clear the stored model from Python memory
 */
async function clearStoredModel() {
    await pyodide.runPythonAsync(`
clear_model()
    `);
    console.log('✓ Stored model cleared from Python memory');
}

/**
 * Display analysis results in the Analysis tab
 */
function displayAnalysisResults(resultName, results) {
    // Update last analysis results for visualization
    lastAnalysisResults = results;

    console.log(`Displaying results for: ${resultName}`);
    console.log('  Nodes:', Object.keys(results.nodes || {}).length);
    console.log('  Elements:', Object.keys(results.elements || {}).length);
    console.log('  Diagrams:', Object.keys(results.diagrams || {}).length);

    // Log some sample data to verify correct results are being shown
    if (results.diagrams) {
        for (const [elemName, diagData] of Object.entries(results.diagrams)) {
            console.log(`  ${elemName} moment range: [${Math.min(...diagData.moments).toFixed(2)}, ${Math.max(...diagData.moments).toFixed(2)}]`);
        }
    }

    // Update the main frame visualization with the new results
    updateVisualization();

    // If diagram type is selected, update with diagrams
    const diagramType = document.getElementById('diagram-type')?.value;
    if (diagramType && diagramType !== 'none') {
        updateVisualizationWithDiagram();
    }

    // Format and display results summary in Analysis tab
    const resultsContainer = document.getElementById('analysis-results-container');
    if (resultsContainer && results.nodes && results.elements) {
        let html = '<div class="space-y-4">';

        // Node displacements
        html += '<div><h5 class="font-semibold text-yellow-400 mb-2">Node Displacements</h5>';
        html += '<table class="w-full text-xs"><thead><tr class="border-b border-gray-600">';
        html += '<th class="text-left py-1">Node</th><th class="text-right py-1">DX (mm)</th><th class="text-right py-1">DY (mm)</th><th class="text-right py-1">RZ (mrad)</th></tr></thead><tbody>';

        for (const [nodeName, nodeData] of Object.entries(results.nodes)) {
            const dx = (nodeData.DX * 1000).toFixed(2);
            const dy = (nodeData.DY * 1000).toFixed(2);
            const rz = (nodeData.RZ * 1000).toFixed(3);
            html += `<tr class="border-b border-gray-700"><td class="py-1">${nodeName}</td><td class="text-right py-1">${dx}</td><td class="text-right py-1">${dy}</td><td class="text-right py-1">${rz}</td></tr>`;
        }
        html += '</tbody></table></div>';

        // Element forces
        html += '<div><h5 class="font-semibold text-green-400 mb-2">Element Forces</h5>';
        html += '<table class="w-full text-xs"><thead><tr class="border-b border-gray-600">';
        html += '<th class="text-left py-1">Element</th><th class="text-right py-1">Axial (kN)</th><th class="text-right py-1">Length (m)</th></tr></thead><tbody>';

        for (const [elemName, elemData] of Object.entries(results.elements)) {
            const axial = (elemData.axial_force / 1000).toFixed(2);
            const length = elemData.length.toFixed(2);
            html += `<tr class="border-b border-gray-700"><td class="py-1">${elemName}</td><td class="text-right py-1">${axial}</td><td class="text-right py-1">${length}</td></tr>`;
        }
        html += '</tbody></table></div>';

        html += '</div>';
        resultsContainer.innerHTML = html;
    } else {
        resultsContainer.innerHTML = `<p class="text-green-400">✓ Results loaded for: ${resultName}</p>`;
    }
}

/**
 * Display result from cache without re-running analysis
 */
function displayResultFromCache(resultName, resultType) {
    console.log(`>>> displayResultFromCache('${resultName}', '${resultType}')`);

    let results;

    if (resultType === 'loadCases') {
        results = analysisResults.loadCases[resultName];
    } else if (resultType === 'combinations') {
        results = analysisResults.combinations[resultName];
    }

    if (!results) {
        console.error(`No cached results found for ${resultType}: ${resultName}`);
        console.error(`Available ${resultType}:`, Object.keys(resultType === 'loadCases' ? analysisResults.loadCases : analysisResults.combinations));
        alert(`No results available for "${resultName}". Please run analysis first.`);
        return false;
    }

    console.log(`✓ Found cached results for ${resultName}`);
    console.log(`  Nodes: ${Object.keys(results.nodes || {}).length}`);
    console.log(`  Elements: ${Object.keys(results.elements || {}).length}`);
    console.log(`  Diagrams: ${Object.keys(results.diagrams || {}).length}`);

    // Update active result name
    activeResultName = resultName;

    // Display the results
    displayAnalysisResults(resultName, results);

    return true;
}

/**
 * Handle result selection change (dropdown)
 * This should ONLY display cached results, never re-run analysis
 */
async function onResultSelectionChange(resultName) {
    if (!resultName) return;

    console.log(`=== Result Selection Changed ===`);
    console.log(`  Selected: ${resultName}`);
    console.log(`  Mode: ${resultViewMode}`);

    // Simply display from cache
    displayResultFromCache(resultName, resultViewMode);
}

/**
 * Run analysis from Analysis tab button
 * Re-runs complete analysis and displays selected result
 */
async function runAnalysisFromAnalysisTab() {
    const resultName = document.getElementById('result-selection-dropdown').value;

    if (!resultName) {
        alert('Please select a load case or combination first.');
        return;
    }

    console.log(`=== Run Analysis Button Clicked (Analysis Tab) ===`);
    console.log(`  Result name: ${resultName}`);
    console.log(`  View mode: ${resultViewMode}`);

    try {
        // Re-run complete analysis to get fresh results
        console.log(`  Running complete analysis...`);
        await runCompleteAnalysis();

        // Display the selected result from freshly cached data
        console.log(`  Displaying selected result: ${resultName}`);
        displayResultFromCache(resultName, resultViewMode);

    } catch (error) {
        console.error(`  Analysis failed:`, error);
        alert(`Analysis failed: ${error.message}`);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Ctrl+Space to run analysis
    if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault(); // Prevent default browser behavior
        runAnalysis();
    }
});