// Global variables
let pyodide = null;
let frameData = {
    nodes: [],
    elements: [],
    loads: []
};
let nodeCounter = 1;
let elementCounter = 1;
let loadCounter = 1;
let lastAnalysisResults = null; // Store last analysis results for diagram display

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
        """Create PyNite model from input data"""
        self.model = FEModel3D()

        # Add nodes
        for node in nodes:
            self.model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)

        # Define a default material (Steel)
        E = 200e9  # 200 GPa in Pa
        G = 80e9   # 80 GPa in Pa
        nu = 0.3   # Poisson's ratio
        rho = 7850 # Density kg/m³
        self.model.add_material('Steel', E, G, nu, rho)

        # Add elements with material and section properties
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

        # Add supports
        for node in nodes:
            self._add_support(node['name'], node['support'])

        # Add loads
        for load in loads:
            if any([float(load['fx']) != 0, float(load['fy']) != 0, float(load['mz']) != 0]):
                self._add_load(load)

    def _add_support(self, node_name, support_type):
        """Add support constraints to a node"""
        if support_type == 'fixed':
            self.model.def_support(node_name, True, True, True, True, True, True)
        elif support_type == 'pinned':
            self.model.def_support(node_name, True, True, True, False, False, False)
        elif support_type == 'roller-x':
            self.model.def_support(node_name, False, True, True, False, False, False)
        elif support_type == 'roller-y':
            self.model.def_support(node_name, True, False, True, False, False, False)

    def _add_load(self, load):
        """Add loads to a node"""
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
        """Extract results from the analyzed model"""
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
        <input type="text" placeholder="N1" class="bg-gray-600 text-white p-1 rounded text-xs element-i">
        <input type="text" placeholder="N2" class="bg-gray-600 text-white p-1 rounded text-xs element-j">
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
        <button onclick="removeElement('element-${elementCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Remove</button>
    `;

    container.appendChild(elementDiv);

    // Add event listeners to all inputs for real-time updates
    elementDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    elementCounter++;
    updateVisualization();
}

// Add load to the interface
function addLoad() {
    const container = document.getElementById('loads-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'input-grid';
    loadDiv.id = `load-${loadCounter}`;

    loadDiv.innerHTML = `
        <input type="text" value="L${loadCounter}" readonly class="bg-gray-600 text-white p-2 rounded text-sm">
        <input type="text" placeholder="N1" class="bg-gray-600 text-white p-2 rounded text-sm load-node">
        <input type="number" step="0.1" value="0" placeholder="Fx (kN)" class="bg-gray-600 text-white p-2 rounded text-sm load-fx">
        <input type="number" step="0.1" value="-10" placeholder="Fy (kN)" class="bg-gray-600 text-white p-2 rounded text-sm load-fy">
        <input type="number" step="0.1" value="0" placeholder="Mz (kNm)" class="bg-gray-600 text-white p-2 rounded text-sm load-mz">
        <button onclick="removeLoad('load-${loadCounter}')" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm">Remove</button>
    `;

    container.appendChild(loadDiv);

    // Add event listeners to all inputs for real-time updates
    loadDiv.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateVisualization);
        input.addEventListener('change', updateVisualization);
    });

    loadCounter++;
    updateVisualization();
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

    // Remove all loads applied to this node
    const loadsToRemove = [];
    document.querySelectorAll('#loads-container > div').forEach(loadDiv => {
        const loadNode = loadDiv.querySelector('.load-node').value;
        if (loadNode === nodeName) {
            loadsToRemove.push(loadDiv.id);
        }
    });
    loadsToRemove.forEach(loadId => document.getElementById(loadId).remove());

    // Remove the node itself (support is automatically removed with the node)
    nodeDiv.remove();
    updateVisualization();
}

function removeElement(id) {
    document.getElementById(id).remove();
    updateVisualization();
}

function removeLoad(id) {
    document.getElementById(id).remove();
    updateVisualization();
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
    addLoad();
    document.querySelector('#load-1 .load-node').value = 'N2';
    document.querySelector('#load-1 .load-fx').value = '0';
    document.querySelector('#load-1 .load-fy').value = '-15';

    updateVisualization();
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
    addLoad();
    document.querySelector('#load-1 .load-node').value = 'N5';
    document.querySelector('#load-1 .load-fx').value = '0';
    document.querySelector('#load-1 .load-fy').value = '-25';

    addLoad();
    document.querySelector('#load-2 .load-node').value = 'N3';
    document.querySelector('#load-2 .load-fx').value = '10';
    document.querySelector('#load-2 .load-fy').value = '0';

    updateVisualization();
}

// Load simply supported beam with IPE profile example
function loadSteelBeamExample() {
    clearAll();

    // Add nodes
    addNode();
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-y').value = '0';
    document.querySelector('#node-1 .node-support').value = 'pinned';

    addNode();
    document.querySelector('#node-2 .node-x').value = '10';
    document.querySelector('#node-2 .node-y').value = '0';
    document.querySelector('#node-2 .node-support').value = 'roller';

    // Add element with IPE200 steel section
    addElement();
    const element = document.querySelector('#element-1');
    element.querySelector('.element-i').value = 'N1';
    element.querySelector('.element-j').value = 'N2';
    element.querySelector('.element-e').value = '210';  // Steel E-modulus

    // Select IPE section type
    element.querySelector('.section-type').value = 'IPE';
    onSectionTypeChange('element-1');

    // Wait a moment for the profile dropdown to populate, then select IPE200
    setTimeout(() => {
        element.querySelector('.profile-select').value = 'IPE200';
        element.querySelector('.axis-select').value = 'strong';
        onProfileChange('element-1');
    }, 100);

    // Add load at midspan
    addNode();
    document.querySelector('#node-3 .node-x').value = '5';
    document.querySelector('#node-3 .node-y').value = '0';
    document.querySelector('#node-3 .node-support').value = 'free';

    addElement();
    const element1 = document.querySelector('#element-2');
    element1.querySelector('.element-i').value = 'N1';
    element1.querySelector('.element-j').value = 'N3';
    element1.querySelector('.element-e').value = '210';
    element1.querySelector('.section-type').value = 'IPE';
    onSectionTypeChange('element-2');
    setTimeout(() => {
        element1.querySelector('.profile-select').value = 'IPE200';
        element1.querySelector('.axis-select').value = 'strong';
        onProfileChange('element-2');
    }, 100);

    addElement();
    const element2 = document.querySelector('#element-3');
    element2.querySelector('.element-i').value = 'N3';
    element2.querySelector('.element-j').value = 'N2';
    element2.querySelector('.element-e').value = '210';
    element2.querySelector('.section-type').value = 'IPE';
    onSectionTypeChange('element-3');
    setTimeout(() => {
        element2.querySelector('.profile-select').value = 'IPE200';
        element2.querySelector('.axis-select').value = 'strong';
        onProfileChange('element-3');
    }, 100);

    addLoad();
    document.querySelector('#load-1 .load-node').value = 'N3';
    document.querySelector('#load-1 .load-fx').value = '0';
    document.querySelector('#load-1 .load-fy').value = '-50';

    updateVisualization();
}

// Clear all inputs
function clearAll() {
    document.getElementById('nodes-container').innerHTML = '';
    document.getElementById('elements-container').innerHTML = '';
    document.getElementById('loads-container').innerHTML = '';
    document.getElementById('results-container').innerHTML = '<p>Run analysis to see results...</p>';
    document.getElementById('console-output').textContent = '';

    nodeCounter = 1;
    elementCounter = 1;
    loadCounter = 1;

    updateVisualization();
}

// Update visualization
function updateVisualization() {
    if (!pyodide) return;

    const svg = d3.select("#frame-svg");
    svg.selectAll("*").remove();

    // Get current data from inputs
    const nodes = getNodesFromInputs();
    const elements = getElementsFromInputs();
    const loads = getLoadsFromInputs();

    if (nodes.length === 0) return;

    // Set up scales
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

        // Add hover interaction for nodes
        if (lastAnalysisResults && lastAnalysisResults.nodes && lastAnalysisResults.nodes[node.name]) {
            const nodeData = lastAnalysisResults.nodes[node.name];

            g.on("mouseenter", function(event) {
                // Create tooltip
                const tooltip = svg.append("g")
                    .attr("class", "node-tooltip")
                    .attr("transform", `translate(${xScale(parseFloat(node.x)) + 15}, ${yScale(parseFloat(node.y)) - 10})`);

                // Tooltip background
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
                const boxHeight = tooltipText.length * lineHeight + padding * 2;

                tooltip.append("rect")
                    .attr("width", boxWidth)
                    .attr("height", boxHeight)
                    .attr("fill", "#1f2937")
                    .attr("stroke", "#60A5FA")
                    .attr("stroke-width", 2)
                    .attr("rx", 4);

                tooltipText.forEach((text, i) => {
                    tooltip.append("text")
                        .attr("x", padding)
                        .attr("y", padding + (i + 1) * lineHeight)
                        .attr("fill", "#E5E7EB")
                        .attr("font-size", "11px")
                        .text(text);
                });
            })
            .on("mouseleave", function() {
                svg.selectAll(".node-tooltip").remove();
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

    // Draw loads
    loads.forEach(load => {
        const node = nodes.find(n => n.name === load.node);
        if (node) {
            const x = xScale(parseFloat(node.x));
            const y = yScale(parseFloat(node.y));

            // Draw load arrows
            if (parseFloat(load.fx) !== 0) {
                drawLoadArrow(svg, x, y, parseFloat(load.fx), 'horizontal');
            }
            if (parseFloat(load.fy) !== 0) {
                drawLoadArrow(svg, x, y, parseFloat(load.fy), 'vertical');
            }
        }
    });
}

// Update visualization with diagram
function updateVisualizationWithDiagram() {
    updateVisualization();
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

function drawLoadArrow(svg, x, y, magnitude, direction) {
    const scale = Math.abs(magnitude) * 2;
    const color = magnitude > 0 ? "#34D399" : "#F87171";

    if (direction === 'vertical') {
        const startY = magnitude > 0 ? y + 20 : y - 20;
        const endY = y;

        svg.append("line")
            .attr("x1", x)
            .attr("y1", startY)
            .attr("x2", x)
            .attr("y2", endY)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead)");

        svg.append("text")
            .attr("x", x + 10)
            .attr("y", (startY + endY) / 2)
            .attr("fill", color)
            .attr("font-size", "10px")
            .text(`${magnitude} kN`);
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
    const loads = [];
    document.querySelectorAll('#loads-container > div').forEach(loadDiv => {
        const name = loadDiv.querySelector('input[readonly]').value;
        const node = loadDiv.querySelector('.load-node').value;
        const fx = loadDiv.querySelector('.load-fx').value;
        const fy = loadDiv.querySelector('.load-fy').value;
        const mz = loadDiv.querySelector('.load-mz').value;
        loads.push({ name, node, fx, fy, mz });
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
        const nodes = getNodesFromInputs();
        const elements = getElementsFromInputs();
        const loads = getLoadsFromInputs();

        if (nodes.length === 0 || elements.length === 0) {
            alert("Please add at least one node and one element.");
            return;
        }

        console.log("Running PyNite analysis...");
        document.getElementById('console-output').textContent = "Running analysis...\n";

        // Prepare input data
        const inputData = {
            nodes: nodes,
            elements: elements,
            loads: loads
        };

        // Run analysis with simplified analyzer
        const inputDataJson = JSON.stringify(inputData);
        console.log("Input data:", inputDataJson);

        const analysisResult = pyodide.runPython(`
import json
result = analyze_frame_json('${inputDataJson.replace(/'/g, "\\'")}')
result
        `);

        console.log("Analysis result:", analysisResult);

        // Parse and display results
        const results = JSON.parse(analysisResult);

        if (results.success) {
            // Store results for diagram display
            lastAnalysisResults = results;

            // Format results for display
            let html = '<div class="space-y-4">';

            // Node displacements
            html += '<div><h4 class="font-semibold text-yellow-400 mb-3">Node Displacements</h4>';
            html += '<table class="w-full text-sm"><thead><tr class="border-b border-gray-600">';
            html += '<th class="text-left py-2">Node</th><th class="text-right py-2">DX (mm)</th><th class="text-right py-2">DY (mm)</th><th class="text-right py-2">RZ (mrad)</th></tr></thead><tbody>';

            for (const [nodeName, nodeData] of Object.entries(results.nodes)) {
                const dx = (nodeData.DX * 1000).toFixed(2);
                const dy = (nodeData.DY * 1000).toFixed(2);
                const rz = (nodeData.RZ * 1000).toFixed(3);
                html += `<tr class="border-b border-gray-700"><td class="py-2">${nodeName}</td><td class="text-right py-2">${dx}</td><td class="text-right py-2">${dy}</td><td class="text-right py-2">${rz}</td></tr>`;
            }
            html += '</tbody></table></div>';

            // Element forces
            html += '<div><h4 class="font-semibold text-green-400 mb-3">Element Forces</h4>';
            html += '<table class="w-full text-sm"><thead><tr class="border-b border-gray-600">';
            html += '<th class="text-left py-2">Element</th><th class="text-right py-2">Axial (kN)</th><th class="text-right py-2">Length (m)</th></tr></thead><tbody>';

            for (const [elemName, elemData] of Object.entries(results.elements)) {
                const axial = (elemData.axial_force / 1000).toFixed(2);
                const length = elemData.length.toFixed(2);
                html += `<tr class="border-b border-gray-700"><td class="py-2">${elemName}</td><td class="text-right py-2">${axial}</td><td class="text-right py-2">${length}</td></tr>`;
            }
            html += '</tbody></table></div>';
            html += '</div>';

            document.getElementById('results-container').innerHTML = html;
            document.getElementById('console-output').textContent += "Analysis completed successfully!\n";
            document.getElementById('console-output').textContent += `Analyzed ${nodes.length} nodes, ${elements.length} elements, ${loads.length} loads\n`;

            // Display force diagrams if available
            if (results.diagrams) {
                displayForceDiagrams(results.diagrams);
            }

            // Update visualization with diagrams
            updateVisualization();

        } else {
            document.getElementById('results-container').innerHTML = `<div class="text-red-400">Analysis failed: ${results.message}</div>`;
            document.getElementById('console-output').textContent += "Analysis failed: " + results.message + "\n";
        }

    } catch (error) {
        console.error("Analysis error:", error);
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

        // Debug: verify n_points
        console.log(`${diagramType} diagram for ${element.name}: ${dataArray.length} points`);

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
            // scale is designed so that max value produces offset = maxLength/10
            let physicalOffset = value * scale;

            // For moments: positive values above the element (opposite perpendicular direction)
            // For displacement: deflections plot in their natural direction (no inversion needed)
            // For shear/axial: use standard perpendicular direction
            if (diagramType === 'moment') {
                physicalOffset = -physicalOffset; // Invert for moment diagram convention
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

        // Add invisible hover points along the diagram
        pathData.forEach((point, i) => {
            const circle = svg.append("circle")
                .attr("cx", point.x)
                .attr("cy", point.y)
                .attr("r", 8)
                .attr("fill", "transparent")
                .attr("stroke", "none")
                .style("cursor", "pointer");

            // Add hover interaction
            circle.on("mouseenter", function(event) {
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
                const boxHeight = tooltipText.length * lineHeight + padding * 2;

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

                tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);

                tooltip.append("rect")
                    .attr("width", boxWidth)
                    .attr("height", boxHeight)
                    .attr("fill", "#1f2937")
                    .attr("stroke", color)
                    .attr("stroke-width", 2)
                    .attr("rx", 4);

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
            })
            .on("mouseleave", function() {
                svg.selectAll(".diagram-tooltip").remove();
                svg.selectAll(".diagram-hover-point").remove();
            });
        });

        // Add max/min value labels
        const maxValue = Math.max(...dataArray.map(Math.abs));
        if (maxValue > 0) {
            const maxIndex = dataArray.findIndex(v => Math.abs(v) === maxValue);
            const maxPoint = pathData[maxIndex];

            svg.append("text")
                .attr("x", maxPoint.x)
                .attr("y", maxPoint.y - 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#fbbf24")
                .attr("font-size", "10px")
                .attr("font-weight", "bold")
                .text(`${(dataArray[maxIndex] / 1000).toFixed(1)}k`);
        }
    });
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