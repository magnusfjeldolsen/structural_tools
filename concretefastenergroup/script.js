/**
 * EC2 Part 4 Fastener Design Calculator
 * Main JavaScript Application
 *
 * Author: Magnus Fjeld Olsen
 * Date: 2026-01-07
 */

// ============================================================================
// GLOBAL STATE
// ============================================================================

const state = {
    pyodide: null,
    pyodideReady: false,
    fasteners: [],
    loadCases: [
        { name: 'LC1', description: 'Dead Load', Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0, N: 0,
          application_type: 'centroid', application_point: { x: 0, y: 0 } }
    ],
    activeLoadCase: 'LC1',
    fastenerIdCounter: 1,
    loadCaseIdCounter: 2,
    lastResults: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing EC2 Part 4 Calculator...');

    // Initialize UI
    initializeTabs();
    initializeEventListeners();
    // Add default 4-fastener grid (100x100mm)
    addFastenerAt(0, 0);
    addFastenerAt(100, 0);
    addFastenerAt(100, 100);
    addFastenerAt(0, 100);
    updateFastenerTable();
    updatePlot();
    updateLoadCaseTable();

    // Add keyboard shortcut for running analysis (Ctrl+Space)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            runAnalysis();
        }
    });

    // Initialize Pyodide
    await initializePyodide();

    console.log('Initialization complete');
});

// ============================================================================
// PYODIDE INITIALIZATION
// ============================================================================

async function initializePyodide() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'flex';

    try {
        console.log('Loading Pyodide...');
        state.pyodide = await loadPyodide();

        console.log('Loading Python packages...');
        await state.pyodide.loadPackage(['micropip', 'numpy']);

        console.log('Installing fastener_design package...');
        // Note: In production, this would load from the actual package
        // For now, we'll use pyodide.runPythonAsync to define the module

        // Mount the file system with our Python code
        const cacheBust = Date.now();
        await mountPythonCode(cacheBust);

        state.pyodideReady = true;
        console.log('Pyodide ready!');

        overlay.style.display = 'none';
    } catch (error) {
        console.error('Failed to initialize Pyodide:', error);
        alert('Failed to load Python environment. Please refresh the page.');
        overlay.style.display = 'none';
    }
}

async function mountPythonCode(cacheBust) {
    // Mount Python package directly from source (development mode)
    // This ensures code changes are reflected immediately on page reload
    try {
        console.log('Mounting fastener_design package from source...');

        // Pass cacheBust to Python
        state.pyodide.globals.set('js_cache_bust', cacheBust);

        await state.pyodide.runPythonAsync(`
import sys
from js import fetch

# Mount the package directory to Pyodide's virtual filesystem
import os
base_url = './codes/python/fastener_design'

async def fetch_file(url):
    """Fetch a file from the HTTP server"""
    response = await fetch(url)
    if response.status == 200:
        return await response.text()
    return None

# Fetch and mount all Python files recursively
files_to_fetch = [
    '__init__.py',
    'web_interface.py',
    'design.py',
    'core/__init__.py',
    'core/fastener.py',
    'core/fastener_group.py',
    'core/concrete.py',
    'core/factors.py',
    'failure_modes/__init__.py',
    'failure_modes/tension/__init__.py',
    'failure_modes/tension/steel_failure.py',
    'failure_modes/tension/concrete_cone.py',
    'failure_modes/tension/pullout.py',
    'failure_modes/tension/splitting.py',
    'failure_modes/tension/blowout.py',
    'failure_modes/shear/__init__.py',
    'failure_modes/shear/steel_failure.py',
    'failure_modes/shear/concrete_edge.py',
    'failure_modes/shear/pryout.py',
    'calculations/__init__.py',
    'calculations/interaction.py',
    'calculations/geometry.py',
    'calculations/psi_factors.py',
    'calculations/planar_bending.py',
]

# Create directory structure in /home/pyodide
os.makedirs('/home/pyodide/fastener_design/core', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/failure_modes/tension', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/failure_modes/shear', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/calculations', exist_ok=True)

# Fetch and write files (with cache busting)
cache_bust = str(int(js_cache_bust))
for file_path in files_to_fetch:
    url = f"{base_url}/{file_path}?v={cache_bust}"
    content = await fetch_file(url)
    if content:
        full_path = f"/home/pyodide/fastener_design/{file_path}"
        with open(full_path, 'w') as f:
            f.write(content)
        print(f"Mounted: {file_path}")
    else:
        print(f"Warning: Could not fetch {file_path}")

# Add the directory to Python path
sys.path.insert(0, '/home/pyodide')

# Import the package
from fastener_design.web_interface import run_analysis

print("✓ Fastener design package mounted from source (development mode)")
        `);

        console.log('✓ Python package mounted successfully');
    } catch (error) {
        console.error('Error mounting Python package:', error);
        throw error;
    }
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initializeEventListeners() {
    // Fasteners tab
    document.getElementById('add-fastener').addEventListener('click', addFastener);
    document.getElementById('delete-selected').addEventListener('click', deleteSelectedFasteners);
    document.getElementById('delete-all').addEventListener('click', deleteAllFasteners);
    document.getElementById('select-all').addEventListener('change', toggleSelectAll);

    // Concrete tab
    document.getElementById('concrete-input-method').addEventListener('change', updateConcreteInputMethod);
    document.getElementById('strength-class').addEventListener('change', updateKFactor);
    document.getElementById('cracked').addEventListener('change', updateKFactor);
    document.getElementById('reinforced').addEventListener('change', updateKFactor);

    // Geometry tab
    document.getElementById('auto-spacings').addEventListener('change', toggleAutoSpacings);

    // Loading tab
    document.getElementById('add-load-case').addEventListener('click', addLoadCase);
    document.getElementById('active-load-case').addEventListener('change', changeActiveLoadCase);
    document.getElementById('application-type').addEventListener('change', updateApplicationTypeUI);
    document.getElementById('app-x').addEventListener('input', updatePlot);
    document.getElementById('app-y').addEventListener('input', updatePlot);

    // Analysis tab
    document.getElementById('loading-type').addEventListener('change', updateMaterialFactors);
    document.getElementById('override-factors').addEventListener('change', toggleMaterialFactorOverride);
    document.getElementById('run-analysis').addEventListener('click', runAnalysis);

    // Plot controls
    document.getElementById('force-scale').addEventListener('input', updatePlot);
    document.getElementById('show-applied-forces').addEventListener('change', updatePlot);
    document.getElementById('show-distributed-forces').addEventListener('change', updatePlot);
    document.getElementById('reset-view').addEventListener('click', resetView);
}

// ============================================================================
// FASTENER MANAGEMENT
// ============================================================================

function addDefaultFastener() {
    state.fasteners.push({
        id: state.fastenerIdCounter++,
        x: 0,
        y: 0,
        diameter: 16,
        embedment_depth: 100,
        steel_grade: 500,
        area: null,  // Auto-calculated
        area_override: null,
        d_head: 28.8
    });
    updateFastenerTable();
    updatePlot();
}

function addFastenerAt(x, y) {
    state.fasteners.push({
        id: state.fastenerIdCounter++,
        x: x,
        y: y,
        diameter: 16,
        embedment_depth: 100,
        steel_grade: 500,
        area: null,  // Auto-calculated
        area_override: null,
        d_head: 28.8
    });
}

function addFastener() {
    state.fasteners.push({
        id: state.fastenerIdCounter++,
        x: 0,
        y: 0,
        diameter: 16,
        embedment_depth: 100,
        steel_grade: 500,
        area: null,
        area_override: null,
        d_head: 28.8
    });
    updateFastenerTable();
    updatePlot();
}

function deleteSelectedFasteners() {
    const checkboxes = document.querySelectorAll('#fastener-tbody input[type="checkbox"]:checked');
    const idsToDelete = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    state.fasteners = state.fasteners.filter(f => !idsToDelete.includes(f.id));

    updateFastenerTable();
    updatePlot();
}

function deleteAllFasteners() {
    if (confirm('Delete all fasteners?')) {
        state.fasteners = [];
        updateFastenerTable();
        updatePlot();
    }
}

function toggleSelectAll(e) {
    const checkboxes = document.querySelectorAll('#fastener-tbody input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
}

function updateFastenerTable() {
    const tbody = document.getElementById('fastener-tbody');
    tbody.innerHTML = '';

    state.fasteners.forEach((f) => {
        const row = tbody.insertRow();

        // Checkbox
        const cellCheck = row.insertCell();
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.id = f.id;
        cellCheck.appendChild(checkbox);

        // ID
        row.insertCell().textContent = f.id;

        // Position
        addEditableCell(row, f, 'x', 'number', () => updatePlot());
        addEditableCell(row, f, 'y', 'number', () => updatePlot());

        // Diameter - auto-update area when cell loses focus
        const cellDiameter = row.insertCell();
        const inputDiameter = document.createElement('input');
        inputDiameter.type = 'number';
        inputDiameter.value = f.diameter;

        // Update value on every keystroke (maintains state)
        inputDiameter.addEventListener('input', (e) => {
            f.diameter = parseFloat(e.target.value);
        });

        // Recalculate area and update plot only when cell loses focus
        inputDiameter.addEventListener('blur', () => {
            if (!f.area_override) {
                // Update area display after user finishes entering diameter
                updateFastenerTable();
            }
            updatePlot();
        });

        cellDiameter.appendChild(inputDiameter);

        // Embedment
        addEditableCell(row, f, 'embedment_depth', 'number');

        // Steel grade
        addEditableCell(row, f, 'steel_grade', 'number');

        // Area (with auto-calc indicator)
        const cellArea = row.insertCell();
        const inputArea = document.createElement('input');
        inputArea.type = 'number';
        const autoCalcArea = calculateFastenerArea(f.diameter);
        inputArea.value = f.area_override || autoCalcArea;
        inputArea.placeholder = `Auto: ${autoCalcArea}`;
        inputArea.style.fontStyle = f.area_override ? 'normal' : 'italic';
        inputArea.style.color = f.area_override ? '#212121' : '#757575';
        inputArea.addEventListener('input', (e) => {
            const val = e.target.value;
            f.area_override = val ? parseFloat(val) : null;
            inputArea.style.fontStyle = f.area_override ? 'normal' : 'italic';
            inputArea.style.color = f.area_override ? '#212121' : '#757575';
        });
        inputArea.addEventListener('blur', () => {
            // If cleared, show auto-calc value
            if (!inputArea.value) {
                inputArea.value = autoCalcArea;
            }
        });
        cellArea.appendChild(inputArea);

        // Head diameter
        addEditableCell(row, f, 'd_head', 'number');
    });
}

function addEditableCell(row, obj, prop, type, onChange) {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = type;
    input.value = obj[prop];
    input.addEventListener('input', (e) => {
        obj[prop] = type === 'number' ? parseFloat(e.target.value) : e.target.value;
        if (onChange) onChange();
    });
    cell.appendChild(input);
}

function calculateFastenerArea(diameter) {
    // Gross cross-sectional area: A = π × d² / 4
    const grossArea = Math.PI * (diameter / 2) ** 2;
    return Math.round(grossArea);
}

// ============================================================================
// CONCRETE PROPERTIES
// ============================================================================

function updateConcreteInputMethod() {
    const method = document.getElementById('concrete-input-method').value;
    const strengthClassDiv = document.getElementById('concrete-strength-class');
    const manualFckDiv = document.getElementById('concrete-manual-fck');

    if (method === 'strength_class') {
        strengthClassDiv.style.display = 'block';
        manualFckDiv.style.display = 'none';
    } else {
        strengthClassDiv.style.display = 'none';
        manualFckDiv.style.display = 'block';
    }

    updateKFactor();
}

function updateKFactor() {
    const cracked = document.getElementById('cracked').checked;
    const reinforced = document.getElementById('reinforced').checked;

    let k;
    if (cracked) {
        k = 10.5;
    } else {
        k = reinforced ? 12.5 : 17.5;
    }

    document.getElementById('k-factor-display').textContent = k.toFixed(1);
}

// ============================================================================
// GEOMETRY
// ============================================================================

function toggleAutoSpacings() {
    const auto = document.getElementById('auto-spacings').checked;
    const manualDiv = document.getElementById('manual-spacings');
    manualDiv.style.display = auto ? 'none' : 'block';
}

// ============================================================================
// LOAD CASES
// ============================================================================

function addLoadCase() {
    const name = `LC${state.loadCaseIdCounter++}`;
    state.loadCases.push({
        name,
        description: 'New Load Case',
        Vx: 0,
        Vy: 0,
        Mx: 0,
        My: 0,
        Mz: 0,
        N: 0,
        application_type: 'centroid',
        application_point: { x: 0, y: 0 }
    });

    updateLoadCaseTable();
    updateActiveLoadCaseDropdown();
}

function updateLoadCaseTable() {
    const tbody = document.getElementById('load-case-tbody');
    tbody.innerHTML = '';

    state.loadCases.forEach((lc, idx) => {
        const row = tbody.insertRow();

        // Name (editable)
        const cellName = row.insertCell();
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.value = lc.description;
        inputName.addEventListener('input', (e) => {
            lc.description = e.target.value;
            updateActiveLoadCaseDropdown();
        });
        cellName.appendChild(inputName);

        // Vx
        addLoadEditableCell(row, lc, 'Vx');

        // Vy
        addLoadEditableCell(row, lc, 'Vy');

        // Mx
        addLoadEditableCell(row, lc, 'Mx');

        // My
        addLoadEditableCell(row, lc, 'My');

        // Mz
        addLoadEditableCell(row, lc, 'Mz');

        // N
        addLoadEditableCell(row, lc, 'N');

        // Actions
        const cellActions = row.insertCell();
        const btnDelete = document.createElement('button');
        btnDelete.textContent = 'Delete';
        btnDelete.className = 'btn-danger';
        btnDelete.style.padding = '0.25rem 0.5rem';
        btnDelete.style.fontSize = '0.8rem';
        btnDelete.addEventListener('click', () => deleteLoadCase(idx));
        cellActions.appendChild(btnDelete);
    });
}

function addLoadEditableCell(row, obj, prop) {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = obj[prop];
    input.step = '0.1';
    input.addEventListener('input', (e) => {
        obj[prop] = parseFloat(e.target.value) || 0;
        if (obj.name === state.activeLoadCase) {
            updatePlot();
        }
    });
    cell.appendChild(input);
}

function deleteLoadCase(idx) {
    if (state.loadCases.length === 1) {
        alert('Cannot delete the last load case');
        return;
    }

    const deletedName = state.loadCases[idx].name;
    state.loadCases.splice(idx, 1);

    // Update active if deleted
    if (state.activeLoadCase === deletedName) {
        state.activeLoadCase = state.loadCases[0].name;
    }

    updateLoadCaseTable();
    updateActiveLoadCaseDropdown();
    updatePlot();
}

function updateActiveLoadCaseDropdown() {
    const select = document.getElementById('active-load-case');
    select.innerHTML = '';

    state.loadCases.forEach(lc => {
        const option = document.createElement('option');
        option.value = lc.name;
        option.textContent = `${lc.name}: ${lc.description}`;
        select.appendChild(option);
    });

    select.value = state.activeLoadCase;
}

function changeActiveLoadCase() {
    state.activeLoadCase = document.getElementById('active-load-case').value;
    updatePlot();
}

function updateApplicationTypeUI() {
    const type = document.getElementById('application-type').value;
    const pointInputs = document.getElementById('application-point-inputs');
    pointInputs.style.display = type === 'point' ? 'block' : 'none';
}

// ============================================================================
// ANALYSIS OPTIONS
// ============================================================================

function updateMaterialFactors() {
    const overrideChecked = document.getElementById('override-factors').checked;

    if (!overrideChecked) {
        const loadingType = document.getElementById('loading-type').value;

        let gammaMs, gammaMc;
        switch (loadingType) {
            case 'static':
                gammaMs = 1.25;
                gammaMc = 1.5;
                break;
            case 'fatigue':
                gammaMs = 1.0;
                gammaMc = 1.5;
                break;
            case 'seismic':
                gammaMs = 1.0;
                gammaMc = 1.2;
                break;
        }

        document.getElementById('gamma-ms-input').value = gammaMs.toFixed(2);
        document.getElementById('gamma-mc-input').value = gammaMc.toFixed(2);
    }
}

function toggleMaterialFactorOverride() {
    const overrideChecked = document.getElementById('override-factors').checked;
    const gammaMsInput = document.getElementById('gamma-ms-input');
    const gammaMcInput = document.getElementById('gamma-mc-input');

    gammaMsInput.disabled = !overrideChecked;
    gammaMcInput.disabled = !overrideChecked;

    if (!overrideChecked) {
        // Reset to default values when unchecking
        updateMaterialFactors();
    }
}

// ============================================================================
// ANALYSIS EXECUTION
// ============================================================================

async function runAnalysis() {
    if (!state.pyodideReady) {
        alert('Python environment not ready. Please wait...');
        return;
    }

    if (state.fasteners.length === 0) {
        alert('Please add at least one fastener');
        return;
    }

    // Switch to Analysis tab
    switchTab('analysis');

    // Build input JSON
    const inputData = buildInputJSON();

    console.log('Running analysis with input:', inputData);

    try {
        // Show loading
        document.getElementById('results-container').innerHTML =
            '<p style="text-align: center; color: #757575;">Analyzing...</p>';

        // Call Python
        const inputJson = JSON.stringify(inputData);
        const resultJson = await state.pyodide.runPythonAsync(`
import json
result = run_analysis('''${inputJson}''')
result
        `);

        const results = JSON.parse(resultJson);
        console.log('Analysis results:', results);

        state.lastResults = results;

        // Display results
        displayResults(results);

    } catch (error) {
        console.error('Analysis error:', error);
        document.getElementById('results-container').innerHTML =
            `<div class="result-status fail">Error: ${error.message}</div>`;
    }
}

function buildInputJSON() {
    // Get concrete properties
    const concreteMethod = document.getElementById('concrete-input-method').value;
    const concrete = {
        thickness: parseFloat(document.getElementById('thickness').value),
        cracked: document.getElementById('cracked').checked,
        reinforced: document.getElementById('reinforced').checked
    };

    if (concreteMethod === 'strength_class') {
        concrete.strength_class = document.getElementById('strength-class').value;
        concrete.fck = null;
    } else {
        concrete.strength_class = null;
        concrete.fck = parseFloat(document.getElementById('fck').value);
    }

    // Get edge distances
    const edge_distances = {
        c1: parseFloat(document.getElementById('c1').value) || 0,
        c2: parseFloat(document.getElementById('c2').value) || 0
    };
    const c3 = document.getElementById('c3').value;
    const c4 = document.getElementById('c4').value;
    if (c3) edge_distances.c3 = parseFloat(c3);
    if (c4) edge_distances.c4 = parseFloat(c4);

    // Get spacings
    const autoSpacings = document.getElementById('auto-spacings').checked;
    const spacings = {
        auto_calculate: autoSpacings
    };
    if (!autoSpacings) {
        spacings.sx = parseFloat(document.getElementById('sx').value) || 0;
        spacings.sy = parseFloat(document.getElementById('sy').value) || 0;
    }

    // Get failure modes
    const tensionModes = Array.from(document.querySelectorAll('.tension-mode:checked'))
        .map(cb => cb.value);
    const shearModes = Array.from(document.querySelectorAll('.shear-mode:checked'))
        .map(cb => cb.value);

    // Get interaction exponents
    const alphaN = parseFloat(document.getElementById('alpha-n').value);
    const betaV = parseFloat(document.getElementById('beta-v').value);

    // Get fastener type
    const fastenerType = document.getElementById('fastener-type').value;

    // Get global application point
    const applicationType = document.getElementById('application-type').value;
    const applicationPoint = applicationType === 'point' ? {
        x: parseFloat(document.getElementById('app-x').value) || 0,
        y: parseFloat(document.getElementById('app-y').value) || 0
    } : null;

    // Apply global application to all load cases
    const loadCasesWithApplication = state.loadCases.map(lc => ({
        ...lc,
        application_type: applicationType,
        application_point: applicationPoint
    }));

    // Build fasteners array with type
    const fasteners = state.fasteners.map(f => ({
        ...f,
        fastener_type: fastenerType
    }));

    // Get material factors (from inputs, whether overridden or not)
    const gammaMaterials = {
        gamma_Ms: parseFloat(document.getElementById('gamma-ms-input').value),
        gamma_Mc: parseFloat(document.getElementById('gamma-mc-input').value)
    };

    return {
        fasteners,
        concrete,
        loading: {
            load_cases: loadCasesWithApplication
        },
        edge_distances,
        spacings,
        analysis_options: {
            loading_type: document.getElementById('loading-type').value,
            failure_modes: {
                tension: tensionModes,
                shear: shearModes
            },
            interaction_exponents: {
                alpha_N: alphaN,
                beta_V: betaV
            },
            material_factors: gammaMaterials
        }
    };
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

function displayResults(results) {
    const container = document.getElementById('results-container');
    const selector = document.getElementById('results-load-case-selector');
    const dropdown = document.getElementById('results-load-case-dropdown');
    const plotSelector = document.getElementById('plot-load-case-selector');
    const plotDropdown = document.getElementById('plot-load-case-dropdown');

    if (results.status === 'error') {
        container.innerHTML = `
            <div class="result-status fail">
                ERROR: ${results.error_message}
            </div>
        `;
        selector.style.display = 'none';
        plotSelector.style.display = 'none';
        return;
    }

    // Store results globally for dropdown switching
    state.lastResults = results;
    state.selectedResultCase = 'max'; // Track which result case is displayed

    // Populate both dropdowns with load cases
    const optionsHTML = '<option value="max">Max of All Load Cases</option>' +
        (results.load_cases || []).map((lc, idx) =>
            `<option value="${idx}">${lc.load_case_name}</option>`
        ).join('');

    dropdown.innerHTML = optionsHTML;
    plotDropdown.innerHTML = optionsHTML;

    // Show selectors if multiple load cases
    if (results.load_cases && results.load_cases.length > 1) {
        selector.style.display = 'block';
        plotSelector.style.display = 'block';
    } else {
        selector.style.display = 'none';
        plotSelector.style.display = 'block'; // Still show for single case
    }

    // Set up dropdown change handlers
    dropdown.onchange = () => {
        displaySelectedLoadCase(results, dropdown.value);
        // Sync plot dropdown
        plotDropdown.value = dropdown.value;
    };

    plotDropdown.onchange = () => {
        displaySelectedLoadCase(results, plotDropdown.value);
        // Sync results dropdown
        dropdown.value = plotDropdown.value;
    };

    // Display default (max of all)
    displaySelectedLoadCase(results, 'max');
}

function displaySelectedLoadCase(results, selectedCase) {
    const container = document.getElementById('results-container');

    // Store which case is being viewed
    state.selectedResultCase = selectedCase;

    // Get the data to display (either max or specific load case)
    let displayData;
    let headerText = '';

    if (selectedCase === 'max') {
        // Show max utilizations across all load cases
        displayData = {
            failure_modes: results.max_utilizations,
            interaction: results.max_utilizations.interaction,
            overall_status: results.max_utilizations.overall_status
        };
        headerText = 'Maximum Utilizations Across All Load Cases';

        // Update plot with force distribution from first load case
        // (so arrows are visible even in max view)
        if (results.load_cases && results.load_cases.length > 0 && results.load_cases[0].load_distribution) {
            state.lastResults.load_distribution = results.load_cases[0].load_distribution;
            state.lastResults.activeLoadCaseForPlot = results.load_cases[0]; // Store load case for applied forces
            updatePlot();
        }
    } else {
        // Show specific load case
        const caseIdx = parseInt(selectedCase);
        const loadCase = results.load_cases[caseIdx];
        displayData = {
            failure_modes: loadCase.failure_modes,
            interaction: loadCase.interaction,
            overall_status: loadCase.overall_status,
            load_distribution: loadCase.load_distribution
        };
        headerText = `Load Case: ${loadCase.load_case_name}`;

        // Update plot with this load case's forces
        if (loadCase.load_distribution) {
            state.lastResults.load_distribution = loadCase.load_distribution;
            state.lastResults.activeLoadCaseForPlot = loadCase; // Store load case for applied forces
            updatePlot();
        }
    }

    // Use Python nomenclature directly
    const status = displayData.overall_status; // 'OK' or 'FAIL'
    const statusClass = status === 'OK' ? 'pass' : 'fail';

    let html = `
        <div class="result-status ${statusClass}">
            ${headerText}<br>
            Overall Status: ${status}
        </div>
    `;

    // Input summary
    html += `
        <div class="result-section">
            <h4>Input Summary</h4>
            <table class="result-table">
                <tr><td>Number of Fasteners:</td><td>${results.input_summary.n_fasteners}</td></tr>
                <tr><td>Centroid:</td><td>(${results.input_summary.centroid.x}, ${results.input_summary.centroid.y}) mm</td></tr>
                <tr><td>k-factor:</td><td>${results.input_summary.concrete_k_factor}</td></tr>
                <tr><td>γ<sub>Ms</sub>:</td><td>${results.input_summary.gamma_Ms}</td></tr>
                <tr><td>γ<sub>Mc</sub>:</td><td>${results.input_summary.gamma_Mc}</td></tr>
            </table>
        </div>
    `;

    // Per-fastener force distribution (only for specific load cases, not max view)
    if (selectedCase !== 'max' && displayData.load_distribution) {
        html += `
            <div class="result-section">
                <h4>Force Distribution per Fastener</h4>
                <table class="result-table" style="font-size: 0.9em;">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>V<sub>x</sub> (kN)</th>
                            <th>V<sub>y</sub> (kN)</th>
                            <th>V<sub>total</sub> (kN)</th>
                            <th>N (kN)</th>
                        </tr>
                    </thead>
                    <tbody>`;

        displayData.load_distribution.forEach(fastener => {
            const Vx = fastener.forces.Vx_total;
            const Vy = fastener.forces.Vy_total;
            const Vtotal = fastener.resultants.V_resultant;
            const N = fastener.forces.N;

            html += `
                        <tr>
                            <td><strong>${fastener.fastener_id}</strong></td>
                            <td>${Vx.toFixed(2)}</td>
                            <td>${Vy.toFixed(2)}</td>
                            <td><strong>${Vtotal.toFixed(2)}</strong></td>
                            <td><strong>${N.toFixed(2)}</strong></td>
                        </tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // Tension failure modes
    if (displayData.failure_modes.tension) {
        const isMaxView = selectedCase === 'max';

        html += `<div class="result-section">
            <h4>Tension Failure Modes</h4>
            <table class="utilization-table">
                <thead>
                    <tr>
                        <th>Mode</th>
                        <th>N<sub>Rd</sub> (kN)</th>
                        <th>Utilization</th>
                        <th>Status</th>
                        ${isMaxView ? '<th>Governing Case</th>' : ''}
                    </tr>
                </thead>
                <tbody>`;

        for (const [mode, data] of Object.entries(displayData.failure_modes.tension)) {
            // Skip metadata keys
            if (['governing', 'min_capacity', 'min_capacity_kN', 'status', 'overall_status'].includes(mode)) {
                continue;
            }

            // Check if data has required fields
            if (!data || typeof data.utilization === 'undefined') {
                continue;
            }

            const capacityKey = isMaxView ? 'NRd_kN' : 'NRd_kN';
            if (typeof data[capacityKey] === 'undefined') {
                continue;
            }

            // Determine status from utilization (Python nomenclature)
            const modeStatusText = data.status || (data.utilization <= 1.0 ? 'OK' : 'FAIL');
            const modeStatus = modeStatusText === 'OK' ? 'pass-text' : 'fail-text';

            // Utilization bar color
            const utilPercent = data.utilization * 100;
            let barClass = 'util-bar-ok';
            if (utilPercent > 100) barClass = 'util-bar-fail';
            else if (utilPercent > 85) barClass = 'util-bar-warning';

            html += `
                <tr>
                    <td><strong>${mode.toUpperCase()}</strong></td>
                    <td>${data[capacityKey].toFixed(2)}</td>
                    <td>
                        <div class="util-bar-container">
                            <div class="util-bar ${barClass}" style="width: ${Math.min(utilPercent, 100)}%"></div>
                            <span class="util-text">${data.utilization.toFixed(3)} (${utilPercent.toFixed(0)}%)</span>
                        </div>
                    </td>
                    <td><span class="${modeStatus}">${modeStatusText}</span></td>
                    ${isMaxView ? `<td>${data.governing_case || 'N/A'}</td>` : ''}
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>`;

        // Show governing mode (for individual load case view)
        if (!isMaxView && displayData.failure_modes.tension.governing) {
            html += `<p style="margin-top: 0.5rem;"><strong>Governing:</strong> ${results.failure_modes.tension.governing.toUpperCase()} - ${results.failure_modes.tension.status}</p>`;
        }

        html += `</div>`;
    }

    // Shear failure modes
    if (displayData.failure_modes.shear) {
        const isMaxView = selectedCase === 'max';

        html += `<div class="result-section">
            <h4>Shear Failure Modes</h4>
            <table class="utilization-table">
                <thead>
                    <tr>
                        <th>Mode</th>
                        <th>V<sub>Rd</sub> (kN)</th>
                        <th>Utilization</th>
                        <th>Status</th>
                        ${isMaxView ? '<th>Governing Case</th>' : ''}
                    </tr>
                </thead>
                <tbody>`;

        for (const [mode, data] of Object.entries(displayData.failure_modes.shear)) {
            // Skip metadata keys
            if (['governing', 'min_capacity', 'min_capacity_kN', 'status', 'overall_status'].includes(mode)) {
                continue;
            }

            // Check if data has required fields
            if (!data || typeof data.utilization === 'undefined') {
                continue;
            }

            const capacityKey = isMaxView ? 'VRd_kN' : 'VRd_kN';
            if (typeof data[capacityKey] === 'undefined') {
                continue;
            }

            // Determine status from utilization (Python nomenclature)
            const modeStatusText = data.status || (data.utilization <= 1.0 ? 'OK' : 'FAIL');
            const modeStatus = modeStatusText === 'OK' ? 'pass-text' : 'fail-text';

            // Utilization bar color
            const utilPercent = data.utilization * 100;
            let barClass = 'util-bar-ok';
            if (utilPercent > 100) barClass = 'util-bar-fail';
            else if (utilPercent > 85) barClass = 'util-bar-warning';

            html += `
                <tr>
                    <td><strong>${mode.toUpperCase()}</strong></td>
                    <td>${data[capacityKey].toFixed(2)}</td>
                    <td>
                        <div class="util-bar-container">
                            <div class="util-bar ${barClass}" style="width: ${Math.min(utilPercent, 100)}%"></div>
                            <span class="util-text">${data.utilization.toFixed(3)} (${utilPercent.toFixed(0)}%)</span>
                        </div>
                    </td>
                    <td><span class="${modeStatus}">${modeStatusText}</span></td>
                    ${isMaxView ? `<td>${data.governing_case || 'N/A'}</td>` : ''}
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>`;

        // Show governing mode (for individual load case view)
        if (!isMaxView && displayData.failure_modes.shear.governing) {
            html += `<p style="margin-top: 0.5rem;"><strong>Governing:</strong> ${displayData.failure_modes.shear.governing.toUpperCase()} - ${displayData.failure_modes.shear.status}</p>`;
        }

        html += `</div>`;
    }

    // Interaction
    if (displayData.interaction) {
        const int = displayData.interaction;
        const intStatus = int.status === 'OK' ? 'pass-text' : 'fail-text';
        const isMaxView = selectedCase === 'max';

        html += `
            <div class="result-section">
                <h4>N-V Interaction Check</h4>
                <table class="result-table">
                    <tr><td>Governing Tension:</td><td>${int.governing_tension_mode || 'N/A'}</td></tr>
                    <tr><td>N<sub>Rd</sub>:</td><td>${int.NRd_kN?.toFixed(2) || 'N/A'} kN</td></tr>
                    <tr><td>Governing Shear:</td><td>${int.governing_shear_mode || 'N/A'}</td></tr>
                    <tr><td>V<sub>Rd</sub>:</td><td>${int.VRd_kN?.toFixed(2) || 'N/A'} kN</td></tr>
                    <tr><td>Interaction Ratio:</td><td>${int.interaction_ratio?.toFixed(3) || 'N/A'}</td></tr>
                    <tr><td>Status:</td><td><span class="${intStatus}">${int.status}</span></td></tr>
                    ${isMaxView ? `<tr><td>Governing Case:</td><td>${int.governing_case || 'N/A'}</td></tr>` : ''}
                </table>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============================================================================
// VISUALIZATION
// ============================================================================

function updatePlot() {
    const canvas = document.getElementById('plot-canvas');
    const ctx = canvas.getContext('2d');

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.fasteners.length === 0) {
        ctx.fillStyle = '#757575';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No fasteners to display', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Calculate bounds
    const xs = state.fasteners.map(f => f.x);
    const ys = state.fasteners.map(f => f.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rangeX = maxX - minX || 200;
    const rangeY = maxY - minY || 200;

    // Smart edge distance plotting
    const c1 = parseFloat(document.getElementById('c1').value) || 0;
    const c2 = parseFloat(document.getElementById('c2').value) || 0;

    // Calculate minimum edge distance based on largest fastener diameter
    const maxDiameter = Math.max(...state.fasteners.map(f => f.diameter));
    const minEdgeDistance = Math.max(40, 1.2 * maxDiameter); // EC2 minimum

    // Only include edges if they're within 5x minimum
    const includeC1 = c1 > 0 && c1 <= 5 * minEdgeDistance;
    const includeC2 = c2 > 0 && c2 <= 5 * minEdgeDistance;

    // Extend bounds to include relevant edges
    let plotMinX = minX;
    let plotMaxX = maxX;
    let plotMinY = minY;
    let plotMaxY = maxY;

    if (includeC1) {
        plotMinX = Math.min(plotMinX, minX - c1);
    }
    if (includeC2) {
        plotMinY = Math.min(plotMinY, minY - c2);
    }

    const plotRangeX = plotMaxX - plotMinX + 0.2 * (plotMaxX - plotMinX);
    const plotRangeY = plotMaxY - plotMinY + 0.2 * (plotMaxY - plotMinY);

    const margin = 80;
    const plotWidth = canvas.width - 2 * margin;
    const plotHeight = canvas.height - 2 * margin;

    const scale = Math.min(plotWidth / plotRangeX, plotHeight / plotRangeY);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const plotCenterX = (plotMinX + plotMaxX) / 2;
    const plotCenterY = (plotMinY + plotMaxY) / 2;

    // Transform functions
    const toCanvasX = (x) => centerX + (x - plotCenterX) * scale;
    const toCanvasY = (y) => centerY - (y - plotCenterY) * scale;

    // Draw axes
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.stroke();

    // Draw edge lines (if within limits)
    if (includeC1 || includeC2) {
        ctx.strokeStyle = '#FF5722';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        if (includeC1) {
            const edgeX = minX - c1;
            ctx.beginPath();
            ctx.moveTo(toCanvasX(edgeX), toCanvasY(plotMinY));
            ctx.lineTo(toCanvasX(edgeX), toCanvasY(plotMaxY));
            ctx.stroke();

            // Label
            ctx.fillStyle = '#FF5722';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`c1=${c1}`, toCanvasX(edgeX), toCanvasY(plotMaxY) + 15);
        }

        if (includeC2) {
            const edgeY = minY - c2;
            ctx.beginPath();
            ctx.moveTo(toCanvasX(plotMinX), toCanvasY(edgeY));
            ctx.lineTo(toCanvasX(plotMaxX), toCanvasY(edgeY));
            ctx.stroke();

            // Label
            ctx.fillStyle = '#FF5722';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`c2=${c2}`, toCanvasX(plotMaxX) + 25, toCanvasY(edgeY));
        }

        ctx.setLineDash([]);
    }

    // Draw fasteners
    state.fasteners.forEach(f => {
        const cx = toCanvasX(f.x);
        const cy = toCanvasY(f.y);

        // Circle
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
        ctx.fill();

        // ID label
        ctx.fillStyle = '#212121';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.id.toString(), cx, cy - 15);
    });

    // Draw centroid
    const Xc = xs.reduce((a, b) => a + b, 0) / xs.length;
    const Yc = ys.reduce((a, b) => a + b, 0) / ys.length;

    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.arc(toCanvasX(Xc), toCanvasY(Yc), 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#FF9800';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('C', toCanvasX(Xc), toCanvasY(Yc) - 10);

    // Check force display toggles
    const showAppliedForces = document.getElementById('show-applied-forces').checked;
    const showDistributedForces = document.getElementById('show-distributed-forces').checked;

    // Draw applied forces if toggle is on
    if (showAppliedForces) {
        const appType = document.getElementById('application-type').value;
        const appX = appType === 'point' ? (parseFloat(document.getElementById('app-x').value) || 0) : Xc;
        const appY = appType === 'point' ? (parseFloat(document.getElementById('app-y').value) || 0) : Yc;

        // Draw load application point marker if different from centroid
        if (appType === 'point' && (appX !== Xc || appY !== Yc)) {
            ctx.fillStyle = '#FF5722';
            ctx.beginPath();
            ctx.arc(toCanvasX(appX), toCanvasY(appY), 6, 0, 2 * Math.PI);
            ctx.fill();

            ctx.fillStyle = '#FF5722';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Load', toCanvasX(appX), toCanvasY(appY) - 12);
        }

        // Draw applied force arrows (Vx, Vy, N)
        // Use load case from results if available, otherwise use active input load case
        let loadCaseToDisplay;
        if (state.lastResults && state.lastResults.activeLoadCaseForPlot) {
            // Use load case from results view
            loadCaseToDisplay = state.lastResults.activeLoadCaseForPlot;
        } else {
            // Use active input load case
            const activeLoadCaseId = document.getElementById('active-load-case').value;
            loadCaseToDisplay = state.loadCases.find(lc => lc.id === activeLoadCaseId);
        }

        if (loadCaseToDisplay) {
            const Vx = loadCaseToDisplay.Vx || 0; // kN
            const Vy = loadCaseToDisplay.Vy || 0; // kN
            const N = loadCaseToDisplay.N || 0;   // kN

            const forceScaleInput = parseFloat(document.getElementById('force-scale').value);

            // Find max applied force for scaling
            const maxAppliedForce = Math.max(Math.abs(Vx), Math.abs(Vy), Math.abs(N));

            if (maxAppliedForce > 0) {
                // Calculate arrow length scale: max force should be 1/20 of plot size
                const plotSize = Math.min(canvas.width, canvas.height);
                const maxArrowLength = (plotSize / 20) * forceScaleInput / 0.05;
                const arrowScale = maxArrowLength / maxAppliedForce;

                const appCanvasX = toCanvasX(appX);
                const appCanvasY = toCanvasY(appY);

                // Draw Vx arrow (horizontal shear)
                if (Math.abs(Vx) > 0.01) {
                    const dx = Vx * arrowScale;
                    drawArrow(ctx, appCanvasX, appCanvasY, appCanvasX + dx, appCanvasY, '#FF5722');
                }

                // Draw Vy arrow (vertical shear)
                if (Math.abs(Vy) > 0.01) {
                    const dy = -Vy * arrowScale; // Negative because canvas Y is inverted
                    drawArrow(ctx, appCanvasX, appCanvasY, appCanvasX, appCanvasY + dy, '#FF5722');
                }

                // Draw N arrow (tension, pointing away from concrete)
                if (Math.abs(N) > 0.01) {
                    const dn = -N * arrowScale; // Negative because tension points up (away from concrete)
                    drawArrow(ctx, appCanvasX, appCanvasY, appCanvasX, appCanvasY + dn, '#FF5722');
                }

                // Draw Mz as a circular rotation arrow
                const Mz = loadCaseToDisplay.Mz || 0; // kNm
                if (Math.abs(Mz) > 0.01) {
                    const radius = 30; // pixels
                    const startAngle = Mz > 0 ? 0.2 : -0.2; // CCW for positive Mz
                    const endAngle = Mz > 0 ? 2 * Math.PI - 0.2 : -(2 * Math.PI - 0.2);

                    ctx.strokeStyle = '#FF5722';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(appCanvasX, appCanvasY, radius, startAngle, endAngle, Mz < 0);
                    ctx.stroke();

                    // Draw arrowhead at end of arc
                    const arrowAngle = endAngle;
                    const arrowX = appCanvasX + radius * Math.cos(arrowAngle);
                    const arrowY = appCanvasY + radius * Math.sin(arrowAngle);

                    // Tangent direction (perpendicular to radius)
                    const tangentAngle = arrowAngle + (Mz > 0 ? Math.PI / 2 : -Math.PI / 2);

                    ctx.fillStyle = '#FF5722';
                    ctx.beginPath();
                    ctx.moveTo(arrowX, arrowY);
                    ctx.lineTo(
                        arrowX - 8 * Math.cos(tangentAngle - Math.PI / 6),
                        arrowY - 8 * Math.sin(tangentAngle - Math.PI / 6)
                    );
                    ctx.lineTo(
                        arrowX - 8 * Math.cos(tangentAngle + Math.PI / 6),
                        arrowY - 8 * Math.sin(tangentAngle + Math.PI / 6)
                    );
                    ctx.closePath();
                    ctx.fill();

                    // Draw Mz label
                    ctx.fillStyle = '#FF5722';
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Mz=${Mz.toFixed(1)}`, appCanvasX, appCanvasY - radius - 10);
                }

                // Draw Mx as curved double-arrow (bending about x-axis)
                const Mx = loadCaseToDisplay.Mx || 0; // kNm
                if (Math.abs(Mx) > 0.01) {
                    // Show at right edge of canvas
                    const edgeX = canvas.width - 60;
                    const centerY = canvas.height / 2;
                    const arcHeight = 40;

                    ctx.strokeStyle = '#9C27B0'; // Purple for Mx
                    ctx.lineWidth = 2;

                    if (Mx > 0) {
                        // Positive Mx: tension on +y (top) side
                        // Draw arc curving upward
                        ctx.beginPath();
                        ctx.moveTo(edgeX, centerY - arcHeight/2);
                        ctx.quadraticCurveTo(edgeX + 20, centerY, edgeX, centerY + arcHeight/2);
                        ctx.stroke();

                        // Arrowheads
                        drawArrowhead(ctx, edgeX, centerY - arcHeight/2, 0, -1, '#9C27B0');
                        drawArrowhead(ctx, edgeX, centerY + arcHeight/2, 0, 1, '#9C27B0');
                    } else {
                        // Negative Mx: compression on +y (top) side
                        ctx.beginPath();
                        ctx.moveTo(edgeX, centerY - arcHeight/2);
                        ctx.quadraticCurveTo(edgeX - 20, centerY, edgeX, centerY + arcHeight/2);
                        ctx.stroke();

                        // Arrowheads
                        drawArrowhead(ctx, edgeX, centerY - arcHeight/2, 0, 1, '#9C27B0');
                        drawArrowhead(ctx, edgeX, centerY + arcHeight/2, 0, -1, '#9C27B0');
                    }

                    // Label
                    ctx.fillStyle = '#9C27B0';
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(`Mx=${Mx.toFixed(1)}`, edgeX + 5, centerY);
                }

                // Draw My as curved double-arrow (bending about y-axis)
                const My = loadCaseToDisplay.My || 0; // kNm
                if (Math.abs(My) > 0.01) {
                    // Show at bottom edge of canvas
                    const centerX = canvas.width / 2;
                    const edgeY = canvas.height - 60;
                    const arcWidth = 40;

                    ctx.strokeStyle = '#FF9800'; // Orange for My
                    ctx.lineWidth = 2;

                    if (My > 0) {
                        // Positive My: tension on +x (right) side
                        // Draw arc curving rightward
                        ctx.beginPath();
                        ctx.moveTo(centerX - arcWidth/2, edgeY);
                        ctx.quadraticCurveTo(centerX, edgeY + 20, centerX + arcWidth/2, edgeY);
                        ctx.stroke();

                        // Arrowheads
                        drawArrowhead(ctx, centerX - arcWidth/2, edgeY, -1, 0, '#FF9800');
                        drawArrowhead(ctx, centerX + arcWidth/2, edgeY, 1, 0, '#FF9800');
                    } else {
                        // Negative My: compression on +x (right) side
                        ctx.beginPath();
                        ctx.moveTo(centerX - arcWidth/2, edgeY);
                        ctx.quadraticCurveTo(centerX, edgeY - 20, centerX + arcWidth/2, edgeY);
                        ctx.stroke();

                        // Arrowheads
                        drawArrowhead(ctx, centerX - arcWidth/2, edgeY, 1, 0, '#FF9800');
                        drawArrowhead(ctx, centerX + arcWidth/2, edgeY, -1, 0, '#FF9800');
                    }

                    // Label
                    ctx.fillStyle = '#FF9800';
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`My=${My.toFixed(1)}`, centerX, edgeY + 15);
                }
            }
        }
    }

    // Draw distributed forces if results available and toggle is on
    if (showDistributedForces && state.lastResults && state.lastResults.load_distribution) {
        const forceScaleInput = parseFloat(document.getElementById('force-scale').value);

        // Find maximum force magnitude for scaling
        let maxForce = 0;
        state.lastResults.load_distribution.forEach(dist => {
            const Vx = dist.forces.Vx_total;
            const Vy = dist.forces.Vy_total;
            const forceMag = Math.sqrt(Vx * Vx + Vy * Vy);
            maxForce = Math.max(maxForce, forceMag);
        });

        // Calculate arrow length scale: max force should be 1/20 of plot size
        const plotSize = Math.min(canvas.width, canvas.height);
        const maxArrowLength = (plotSize / 20) * forceScaleInput / 0.05; // Normalize to default scale
        const arrowScale = maxForce > 0 ? maxArrowLength / maxForce : 1;

        state.lastResults.load_distribution.forEach(dist => {
            const fastener = state.fasteners.find(f => f.id === dist.fastener_id);
            if (!fastener) return;

            const cx = toCanvasX(fastener.x);
            const cy = toCanvasY(fastener.y);

            // Get total forces (Python returns in applied direction, following right-hand rule)
            const Vx = dist.forces.Vx_total; // kN
            const Vy = dist.forces.Vy_total; // kN

            // Calculate arrow endpoint in canvas pixels
            // Python returns forces in applied direction, so negate to show reactions
            // Canvas Y is inverted by toCanvasY (positive dy → up in world coords)
            const dx = -Vx * arrowScale;  // Negate to show resisting forces
            const dy = Vy * arrowScale;   // Keep sign (canvas Y inversion handles it)

            // Draw arrow
            drawArrow(ctx, cx, cy, cx + dx, cy + dy, '#4CAF50');
        });
    }

    // Update fastener forces display
    updateFastenerForcesDisplay();
}

function updateFastenerForcesDisplay() {
    const container = document.getElementById('fastener-forces-container');
    const displayDiv = document.getElementById('fastener-forces-display');

    // Only show if we have load distribution results
    if (!state.lastResults || !state.lastResults.load_distribution) {
        displayDiv.style.display = 'none';
        return;
    }

    const loadDist = state.lastResults.load_distribution;
    if (!loadDist || loadDist.length === 0) {
        displayDiv.style.display = 'none';
        return;
    }

    displayDiv.style.display = 'block';

    // Build table
    let html = `
        <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Vx (kN)</th>
                    <th>Vy (kN)</th>
                    <th>V_tot (kN)</th>
                    <th>N (kN)</th>
                </tr>
            </thead>
            <tbody>
    `;

    loadDist.forEach(fastener => {
        const forces = fastener.forces;
        const res = fastener.resultants;

        html += `
            <tr>
                <td>${fastener.fastener_id}</td>
                <td>${forces.Vx_total}</td>
                <td>${forces.Vy_total}</td>
                <td>${res.V_resultant}</td>
                <td>${forces.N}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
    const headlen = 10;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    // Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function drawArrowhead(ctx, x, y, dirX, dirY, color) {
    const headlen = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - headlen * dirX + 4 * dirY, y - headlen * dirY - 4 * dirX);
    ctx.lineTo(x - headlen * dirX - 4 * dirY, y - headlen * dirY + 4 * dirX);
    ctx.closePath();
    ctx.fill();
}

function resetView() {
    document.getElementById('force-scale').value = 0.05;
    updatePlot();
}

// ============================================================================
// INITIALIZATION HELPERS
// ============================================================================

// Call these on load
updateKFactor();
updateMaterialFactors();
updateApplicationTypeUI();
