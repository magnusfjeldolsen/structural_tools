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
        { name: 'LC1', description: 'Dead Load', Vx: 0, Vy: 0, Mz: 0, N: 0,
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
    addDefaultFastener();
    updateLoadCaseTable();

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
        await state.pyodide.loadPackage('micropip');

        console.log('Installing fastener_design package...');
        // Note: In production, this would load from the actual package
        // For now, we'll use pyodide.runPythonAsync to define the module

        // Mount the file system with our Python code
        await mountPythonCode();

        state.pyodideReady = true;
        console.log('Pyodide ready!');

        overlay.style.display = 'none';
    } catch (error) {
        console.error('Failed to initialize Pyodide:', error);
        alert('Failed to load Python environment. Please refresh the page.');
        overlay.style.display = 'none';
    }
}

async function mountPythonCode() {
    // Mount Python package directly from source (development mode)
    // This ensures code changes are reflected immediately on page reload
    try {
        console.log('Mounting fastener_design package from source...');

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
]

# Create directory structure in /home/pyodide
os.makedirs('/home/pyodide/fastener_design/core', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/failure_modes/tension', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/failure_modes/shear', exist_ok=True)
os.makedirs('/home/pyodide/fastener_design/calculations', exist_ok=True)

# Fetch and write files
for file_path in files_to_fetch:
    url = f"{base_url}/{file_path}"
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

        // Diameter - auto-update area when changed
        addEditableCell(row, f, 'diameter', 'number', () => {
            if (!f.area_override) {
                // Update area display in real-time
                updateFastenerTable();
            }
            updatePlot();
        });

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
    // Approximation for threaded area: 0.75 * gross area
    const grossArea = Math.PI * (diameter / 2) ** 2;
    return Math.round(grossArea * 0.75);
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

    if (results.status === 'error') {
        container.innerHTML = `
            <div class="result-status fail">
                ERROR: ${results.error_message}
            </div>
        `;
        return;
    }

    // Use Python nomenclature directly
    const status = results.overall_status; // 'OK' or 'FAIL'
    const statusClass = status === 'OK' ? 'pass' : 'fail';

    let html = `
        <div class="result-status ${statusClass}">
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

    // Tension failure modes
    if (results.failure_modes.tension) {
        html += `<div class="result-section">
            <h4>Tension Failure Modes</h4>
            <table class="utilization-table">
                <thead>
                    <tr>
                        <th>Mode</th>
                        <th>N<sub>Rd</sub> (kN)</th>
                        <th>Utilization</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const [mode, data] of Object.entries(results.failure_modes.tension)) {
            // Skip metadata keys
            if (['governing', 'min_capacity', 'min_capacity_kN', 'status'].includes(mode)) {
                continue;
            }

            // Check if data has required fields
            if (!data || typeof data.NRd_kN === 'undefined' || typeof data.utilization === 'undefined') {
                continue;
            }

            // Determine status from utilization (Python nomenclature)
            const modeStatusText = data.utilization <= 1.0 ? 'OK' : 'FAIL';
            const modeStatus = modeStatusText === 'OK' ? 'pass-text' : 'fail-text';

            // Utilization bar color
            const utilPercent = data.utilization * 100;
            let barClass = 'util-bar-ok';
            if (utilPercent > 100) barClass = 'util-bar-fail';
            else if (utilPercent > 85) barClass = 'util-bar-warning';

            html += `
                <tr>
                    <td><strong>${mode.toUpperCase()}</strong></td>
                    <td>${data.NRd_kN.toFixed(2)}</td>
                    <td>
                        <div class="util-bar-container">
                            <div class="util-bar ${barClass}" style="width: ${Math.min(utilPercent, 100)}%"></div>
                            <span class="util-text">${data.utilization.toFixed(3)} (${utilPercent.toFixed(0)}%)</span>
                        </div>
                    </td>
                    <td><span class="${modeStatus}">${modeStatusText}</span></td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>`;

        // Show governing mode
        if (results.failure_modes.tension.governing) {
            html += `<p style="margin-top: 0.5rem;"><strong>Governing:</strong> ${results.failure_modes.tension.governing.toUpperCase()} - ${results.failure_modes.tension.status}</p>`;
        }

        html += `</div>`;
    }

    // Shear failure modes
    if (results.failure_modes.shear) {
        html += `<div class="result-section">
            <h4>Shear Failure Modes</h4>
            <table class="utilization-table">
                <thead>
                    <tr>
                        <th>Mode</th>
                        <th>V<sub>Rd</sub> (kN)</th>
                        <th>Utilization</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const [mode, data] of Object.entries(results.failure_modes.shear)) {
            // Skip metadata keys
            if (['governing', 'min_capacity', 'min_capacity_kN', 'status'].includes(mode)) {
                continue;
            }

            // Check if data has required fields
            if (!data || typeof data.VRd_kN === 'undefined' || typeof data.utilization === 'undefined') {
                continue;
            }

            // Determine status from utilization (Python nomenclature)
            const modeStatusText = data.utilization <= 1.0 ? 'OK' : 'FAIL';
            const modeStatus = modeStatusText === 'OK' ? 'pass-text' : 'fail-text';

            // Utilization bar color
            const utilPercent = data.utilization * 100;
            let barClass = 'util-bar-ok';
            if (utilPercent > 100) barClass = 'util-bar-fail';
            else if (utilPercent > 85) barClass = 'util-bar-warning';

            html += `
                <tr>
                    <td><strong>${mode.toUpperCase()}</strong></td>
                    <td>${data.VRd_kN.toFixed(2)}</td>
                    <td>
                        <div class="util-bar-container">
                            <div class="util-bar ${barClass}" style="width: ${Math.min(utilPercent, 100)}%"></div>
                            <span class="util-text">${data.utilization.toFixed(3)} (${utilPercent.toFixed(0)}%)</span>
                        </div>
                    </td>
                    <td><span class="${modeStatus}">${modeStatusText}</span></td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>`;

        // Show governing mode
        if (results.failure_modes.shear.governing) {
            html += `<p style="margin-top: 0.5rem;"><strong>Governing:</strong> ${results.failure_modes.shear.governing.toUpperCase()} - ${results.failure_modes.shear.status}</p>`;
        }

        html += `</div>`;
    }

    // Interaction
    if (results.interaction) {
        const int = results.interaction;
        const intStatus = int.status === 'OK' ? 'pass-text' : 'fail-text';

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

    // Draw load application point if different from centroid
    const appType = document.getElementById('application-type').value;
    if (appType === 'point') {
        const appX = parseFloat(document.getElementById('app-x').value) || 0;
        const appY = parseFloat(document.getElementById('app-y').value) || 0;

        if (appX !== Xc || appY !== Yc) {
            ctx.fillStyle = '#FF5722';
            ctx.beginPath();
            ctx.arc(toCanvasX(appX), toCanvasY(appY), 6, 0, 2 * Math.PI);
            ctx.fill();

            ctx.fillStyle = '#FF5722';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Load', toCanvasX(appX), toCanvasY(appY) - 12);
        }
    }

    // Draw forces if results available
    if (state.lastResults && state.lastResults.load_distribution) {
        const forceScale = parseFloat(document.getElementById('force-scale').value);

        state.lastResults.load_distribution.forEach(dist => {
            const fastener = state.fasteners.find(f => f.id === dist.fastener_id);
            if (!fastener) return;

            const cx = toCanvasX(fastener.x);
            const cy = toCanvasY(fastener.y);

            const Vx = dist.forces.Vx_total;
            const Vy = dist.forces.Vy_total;

            // Draw arrow
            drawArrow(ctx, cx, cy, cx + Vx * forceScale * scale, cy - Vy * forceScale * scale, '#4CAF50');
        });
    }
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
