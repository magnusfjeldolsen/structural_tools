/**
 * Concrete Bending Analysis Script
 * Uses Pyodide to run structuralcodes library in browser
 */

// ========================================
// GLOBAL STATE
// ========================================

const appState = {
    pyodideReady: false,
    pyodide: null,
    sectionParams: {
        materials: {
            fck: 45,
            fyk: 500,
            ftk: 550,
            Es: 200000,
            epsuk: 0.075,
            design_code: 'ec2_2004'
        },
        geometry: {
            width: 1000,
            height: 350
        },
        reinforcements: []  // Array of rebar definitions
    },
    results: null,
    visualizationData: null,
    barCounter: 0,
    lineCounter: 0
};

// ========================================
// INITIALIZATION
// ========================================

async function initializePyodide() {
    const statusEl = document.getElementById('loading-status');
    const progressEl = document.getElementById('loading-progress');

    try {
        // Load Pyodide (loadPyodide is a global function from the CDN script)
        statusEl.textContent = 'Loading Pyodide...';
        progressEl.style.width = '10%';
        appState.pyodide = await loadPyodide();

        // Load packages from Pyodide (these have pre-built WASM binaries)
        statusEl.textContent = 'Loading numpy...';
        progressEl.style.width = '20%';
        await appState.pyodide.loadPackage('numpy');

        statusEl.textContent = 'Loading shapely...';
        progressEl.style.width = '30%';
        await appState.pyodide.loadPackage('shapely');

        statusEl.textContent = 'Loading micropip...';
        progressEl.style.width = '40%';
        await appState.pyodide.loadPackage('micropip');

        // Try to install structuralcodes, ignoring the shapely version requirement
        // We'll use Pyodide's shapely 1.8.2 which should work for basic geometry operations
        statusEl.textContent = 'Installing structuralcodes... (this may take 1-2 minutes)';
        progressEl.style.width = '50%';

        try {
            await appState.pyodide.runPythonAsync(`
                import micropip
                # Install structuralcodes with keep_going to skip dependency conflicts
                await micropip.install("structuralcodes", keep_going=True)
            `);
            console.log('structuralcodes installed successfully');
        } catch (error) {
            console.warn('Error installing structuralcodes:', error);
            // Continue anyway - shapely 1.8.2 might work
        }

        progressEl.style.width = '70%';

        // Load Python modules from file system
        statusEl.textContent = 'Loading Python modules...';
        progressEl.style.width = '80%';

        // Read and execute helperfunctions.py
        const helperResponse = await fetch('helperfunctions.py');
        const helperCode = await helperResponse.text();
        await appState.pyodide.runPythonAsync(helperCode);

        // Read and execute concrete_bending.py
        const bendingResponse = await fetch('concrete_bending.py');
        const bendingCode = await bendingResponse.text();
        await appState.pyodide.runPythonAsync(bendingCode);

        statusEl.textContent = 'Ready!';
        progressEl.style.width = '100%';

        appState.pyodideReady = true;

        // Hide loading overlay
        setTimeout(() => {
            document.getElementById('loading-overlay').style.display = 'none';
        }, 500);

        console.log('Pyodide loaded successfully');

        // Initial visualization
        updateVisualization();

    } catch (error) {
        console.error('Failed to load Pyodide:', error);
        statusEl.textContent = 'Error loading Python engine: ' + error.message;
        statusEl.classList.add('text-red-400');
        alert('Failed to initialize Python engine. Please refresh the page.\n\nError: ' + error.message);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializePyodide();
});

// ========================================
// TAB MANAGEMENT
// ========================================

function switchTab(tabName) {
    // Update tab buttons
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName.replace('-', ' '))) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab content
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
}

// ========================================
// REINFORCEMENT MANAGEMENT
// ========================================

function generateBarId() {
    appState.barCounter++;
    return `bar_${appState.barCounter}`;
}

function generateLineId() {
    appState.lineCounter++;
    return `line_${appState.lineCounter}`;
}

function addSingleBar() {
    const x = parseFloat(document.getElementById('bar-x').value) || 0;
    const y = parseFloat(document.getElementById('bar-y').value) || 0;
    const diameter = parseFloat(document.getElementById('bar-diameter').value) || 12;

    const id = generateBarId();

    appState.sectionParams.reinforcements.push({
        type: 'single_bar',
        id: id,
        x: x,
        y: y,
        diameter: diameter
    });

    updateRebarList();
    updateVisualization();
}

function addRebarLine() {
    const boundary = document.getElementById('line-boundary').value;
    const diameter = parseFloat(document.getElementById('line-diameter').value) || 12;
    const spacing = parseFloat(document.getElementById('line-spacing').value) || 100;
    const boundaryCover = parseFloat(document.getElementById('line-boundary-cover').value) || 50;
    const startCover = parseFloat(document.getElementById('line-start-cover').value) || null;
    const endCover = parseFloat(document.getElementById('line-end-cover').value) || null;

    const id = generateLineId();

    appState.sectionParams.reinforcements.push({
        type: 'rebar_line',
        id: id,
        boundary: boundary,
        diameter: diameter,
        spacing: spacing,
        boundary_cover: boundaryCover,
        start_cover: startCover,
        end_cover: endCover
    });

    updateRebarList();
    updateVisualization();
}

function deleteReinforcement(id) {
    if (!confirm('Delete this reinforcement?')) return;

    appState.sectionParams.reinforcements =
        appState.sectionParams.reinforcements.filter(r => r.id !== id);

    updateRebarList();
    updateVisualization();
}

function updateRebarList() {
    const tbody = document.getElementById('rebar-list-body');
    const reinforcements = appState.sectionParams.reinforcements;

    if (reinforcements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-3 text-center text-gray-500 italic text-xs">No reinforcement added</td></tr>';
        document.getElementById('rebar-summary').textContent = 'Total bars: 0 | Total As: 0 mm²';
        return;
    }

    let totalBars = 0;
    let totalArea = 0;

    tbody.innerHTML = '';

    reinforcements.forEach(r => {
        const row = document.createElement('tr');
        row.className = 'border-t border-gray-700 hover:bg-gray-700';

        let details = '';
        let barCount = 1;

        if (r.type === 'single_bar') {
            details = `φ${r.diameter} @ (${r.x}, ${r.y})`;
            barCount = 1;
            totalArea += Math.PI * Math.pow(r.diameter / 2, 2);
        } else if (r.type === 'rebar_line') {
            // Estimate number of bars (will be calculated properly in Python)
            const width = appState.sectionParams.geometry.width;
            const height = appState.sectionParams.geometry.height;
            const effectiveLength = (r.boundary === 'bottom' || r.boundary === 'top')
                ? width - 2 * (r.start_cover || r.boundary_cover)
                : height - 2 * (r.start_cover || r.boundary_cover);
            barCount = Math.floor(effectiveLength / r.spacing) + 1;
            details = `${r.boundary}: φ${r.diameter} @ ${r.spacing}mm (~${barCount} bars)`;
            totalArea += barCount * Math.PI * Math.pow(r.diameter / 2, 2);
        }

        totalBars += barCount;

        row.innerHTML = `
            <td class="px-2 py-2 text-xs text-gray-300">${r.type === 'single_bar' ? 'Single' : 'Line'}</td>
            <td class="px-2 py-2 text-xs text-gray-300 font-mono">${r.id}</td>
            <td class="px-2 py-2 text-xs text-gray-300">${details}</td>
            <td class="px-2 py-2 text-center">
                <button onclick="deleteReinforcement('${r.id}')"
                        class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition">
                    Delete
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });

    document.getElementById('rebar-summary').textContent =
        `Total bars: ${totalBars} | Total As: ${totalArea.toFixed(0)} mm²`;
}

// ========================================
// VISUALIZATION (D3.js)
// ========================================

async function updateVisualization() {
    if (!appState.pyodideReady) {
        console.log('Pyodide not ready yet');
        return;
    }

    // Update geometry from inputs
    appState.sectionParams.geometry.width = parseFloat(document.getElementById('width').value);
    appState.sectionParams.geometry.height = parseFloat(document.getElementById('height').value);

    try {
        const vizData = await getVisualizationData();
        drawCrossSectionPlot(vizData);
    } catch (error) {
        console.error('Visualization error:', error);
        // Draw basic outline even if Python fails
        drawBasicOutline();
    }
}

async function getVisualizationData() {
    const params = {
        ...appState.sectionParams.materials,
        ...appState.sectionParams.geometry,
        reinforcements: appState.sectionParams.reinforcements
    };

    const result = await appState.pyodide.runPythonAsync(`
import json
from concrete_bending import get_section_visualization_data, create_rectangular_section

params = json.loads('''${JSON.stringify(params)}''')

try:
    section, metadata = create_rectangular_section(params)
    viz_data = get_section_visualization_data(section)
    json.dumps(viz_data)
except Exception as e:
    # Return basic data if section creation fails
    json.dumps({
        'concrete_outline': [
            [-${params.width/2}, -${params.height/2}],
            [${params.width/2}, -${params.height/2}],
            [${params.width/2}, ${params.height/2}],
            [-${params.width/2}, ${params.height/2}]
        ],
        'rebars': [],
        'extents': {
            'xmin': -${params.width/2},
            'xmax': ${params.width/2},
            'ymin': -${params.height/2},
            'ymax': ${params.height/2}
        }
    })
    `);

    return JSON.parse(result);
}

function drawBasicOutline() {
    const width = appState.sectionParams.geometry.width;
    const height = appState.sectionParams.geometry.height;

    const vizData = {
        concrete_outline: [
            [-width/2, -height/2],
            [width/2, -height/2],
            [width/2, height/2],
            [-width/2, height/2]
        ],
        rebars: [],
        extents: {
            xmin: -width/2,
            xmax: width/2,
            ymin: -height/2,
            ymax: height/2
        }
    };

    drawCrossSectionPlot(vizData);
}

function drawCrossSectionPlot(vizData) {
    // Clear previous plot
    d3.select('#section-plot').selectAll('*').remove();

    // Get container dimensions
    const container = document.getElementById('section-plot');
    const containerWidth = container.clientWidth;
    const margin = { top: 40, right: 60, bottom: 60, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const height = Math.max(400, width * 0.7) - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select('#section-plot')
        .append('svg')
        .attr('width', '100%')
        .attr('height', height + margin.top + margin.bottom)
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate scale
    const extents = vizData.extents;
    const dataWidth = extents.xmax - extents.xmin;
    const dataHeight = extents.ymax - extents.ymin;
    const scale = Math.min(width / dataWidth, height / dataHeight) * 0.8;

    // Center the plot
    const offsetX = width / 2;
    const offsetY = height / 2;

    // Scale functions
    const xScale = (x) => offsetX + x * scale;
    const yScale = (y) => offsetY - y * scale; // Flip Y axis

    // Draw coordinate axes
    g.append('line')
        .attr('x1', 0).attr('y1', offsetY)
        .attr('x2', width).attr('y2', offsetY)
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.5);

    g.append('line')
        .attr('x1', offsetX).attr('y1', 0)
        .attr('x2', offsetX).attr('y2', height)
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.5);

    // Draw concrete outline
    const points = vizData.concrete_outline.map(p => [xScale(p[0]), yScale(p[1])]);
    const pathData = 'M' + points.map(p => p.join(',')).join('L') + 'Z';

    g.append('path')
        .attr('d', pathData)
        .attr('fill', '#e5e7eb')
        .attr('stroke', '#374151')
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);

    // Draw rebars
    vizData.rebars.forEach(rebar => {
        const cx = xScale(rebar.x);
        const cy = yScale(rebar.y);
        const radius = Math.max(3, rebar.diameter * scale / 15);

        g.append('circle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', radius)
            .attr('fill', '#ef4444')
            .attr('stroke', '#991b1b')
            .attr('stroke-width', 1);
    });

    // Add dimension annotations
    const dimY = height + 20;
    g.append('line')
        .attr('x1', xScale(extents.xmin))
        .attr('y1', dimY)
        .attr('x2', xScale(extents.xmax))
        .attr('y2', dimY)
        .attr('stroke', '#374151')
        .attr('stroke-width', 1);

    g.append('text')
        .attr('x', offsetX)
        .attr('y', dimY + 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#374151')
        .text(`Width: ${appState.sectionParams.geometry.width} mm`);

    const dimX = -20;
    g.append('line')
        .attr('x1', dimX)
        .attr('y1', yScale(extents.ymax))
        .attr('x2', dimX)
        .attr('y2', yScale(extents.ymin))
        .attr('stroke', '#374151')
        .attr('stroke-width', 1);

    g.append('text')
        .attr('x', dimX - 10)
        .attr('y', offsetY)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#374151')
        .attr('transform', `rotate(-90, ${dimX - 10}, ${offsetY})`)
        .text(`Height: ${appState.sectionParams.geometry.height} mm`);

    // Legend
    const legend = g.append('g')
        .attr('transform', `translate(${width - 120}, 10)`);

    legend.append('rect')
        .attr('x', -5).attr('y', -5)
        .attr('width', 125).attr('height', 50)
        .attr('fill', 'white')
        .attr('stroke', '#d1d5db')
        .attr('opacity', 0.9)
        .attr('rx', 3);

    legend.append('circle')
        .attr('cx', 8).attr('cy', 10)
        .attr('r', 5)
        .attr('fill', '#ef4444')
        .attr('stroke', '#991b1b');

    legend.append('text')
        .attr('x', 18).attr('y', 14)
        .attr('font-size', '11px')
        .attr('fill', '#374151')
        .text('Reinforcement');

    legend.append('rect')
        .attr('x', 3).attr('y', 25)
        .attr('width', 10).attr('height', 10)
        .attr('fill', '#e5e7eb')
        .attr('stroke', '#374151');

    legend.append('text')
        .attr('x', 18).attr('y', 34)
        .attr('font-size', '11px')
        .attr('fill', '#374151')
        .text('Concrete');
}

// ========================================
// ANALYSIS FUNCTIONS
// ========================================

async function runAnalysis() {
    if (!appState.pyodideReady) {
        alert('Python engine not ready. Please wait for initialization to complete.');
        return;
    }

    if (appState.sectionParams.reinforcements.length === 0) {
        alert('Please add at least one reinforcement before running analysis.');
        return;
    }

    // Update materials from inputs
    appState.sectionParams.materials.fck = parseFloat(document.getElementById('fck').value);
    appState.sectionParams.materials.fyk = parseFloat(document.getElementById('fyk').value);
    appState.sectionParams.materials.ftk = parseFloat(document.getElementById('ftk').value);
    appState.sectionParams.materials.Es = parseFloat(document.getElementById('Es').value);
    appState.sectionParams.materials.epsuk = parseFloat(document.getElementById('epsuk').value);
    appState.sectionParams.materials.design_code = document.getElementById('design_code').value;

    // Show loading indicator
    const resultsPanel = document.getElementById('results-panel');
    resultsPanel.classList.remove('hidden');
    document.getElementById('result-m-rdy').textContent = 'Calculating...';
    document.getElementById('result-m-rdz').textContent = 'Calculating...';

    const startTime = performance.now();

    try {
        const params = {
            ...appState.sectionParams.materials,
            ...appState.sectionParams.geometry,
            reinforcements: appState.sectionParams.reinforcements
        };

        console.log('Running analysis with params:', params);

        const resultJson = await appState.pyodide.runPythonAsync(`
import json
from concrete_bending import run_analysis

params = json.loads('''${JSON.stringify(params)}''')
results = run_analysis(params)
json.dumps(results)
        `);

        const results = JSON.parse(resultJson);
        const endTime = performance.now();
        results.calc_time = (endTime - startTime) / 1000;

        console.log('Analysis results:', results);

        appState.results = results;

        displayResults(results);
        plotMomentCurvature(results.moment_curvature);

    } catch (error) {
        console.error('Analysis error:', error);
        alert('Analysis failed: ' + error.message);
        document.getElementById('result-m-rdy').textContent = 'Error';
        document.getElementById('result-m-rdz').textContent = 'Error';
    }
}

function displayResults(results) {
    // Capacity results
    if (results.capacity.success) {
        document.getElementById('result-m-rdy').textContent =
            (results.capacity.M_Rdy / 1e6).toFixed(2) + ' kNm';
        document.getElementById('result-m-rdz').textContent =
            (results.capacity.M_Rdz / 1e6).toFixed(2) + ' kNm';
    } else {
        document.getElementById('result-m-rdy').textContent = 'Failed';
        document.getElementById('result-m-rdz').textContent = 'Failed';
    }

    // NA depth
    if (results.capacity.neutral_axis_depth) {
        document.getElementById('result-na-depth').textContent =
            results.capacity.neutral_axis_depth.toFixed(1) + ' mm';
    } else {
        document.getElementById('result-na-depth').textContent = '--';
    }

    // Calc time
    document.getElementById('result-calc-time').textContent =
        results.calc_time.toFixed(2) + ' s';

    // Section properties
    const props = results.section_properties;
    document.getElementById('result-section-area').textContent =
        props.section_area.toFixed(0) + ' mm²';
    document.getElementById('result-rebar-area').textContent =
        props.total_rebar_area.toFixed(0) + ' mm²';
    document.getElementById('result-rebar-ratio').textContent =
        props.reinforcement_ratio.toFixed(2) + ' %';
    document.getElementById('result-num-rebars').textContent =
        props.num_rebars;
}

function plotMomentCurvature(data) {
    if (!data.success) {
        document.getElementById('moment-curvature-plot').innerHTML =
            '<div class="text-center text-red-500 py-8">Moment-curvature calculation failed</div>';
        return;
    }

    // Convert units: moment to kNm, curvature to 1/m
    const curvature = data.curvature.map(k => k * 1000); // 1/mm to 1/m
    const moment = data.moment.map(m => m / 1e6); // Nmm to kNm

    const trace = {
        x: curvature,
        y: moment,
        mode: 'lines',
        line: { color: '#3b82f6', width: 2 },
        name: 'M-κ'
    };

    // Mark ultimate capacity
    const ultimateIdx = moment.indexOf(Math.max(...moment));
    const ultimatePoint = {
        x: [curvature[ultimateIdx]],
        y: [moment[ultimateIdx]],
        mode: 'markers',
        marker: { color: '#ef4444', size: 10 },
        name: 'Ultimate'
    };

    const layout = {
        title: 'Moment-Curvature Response',
        xaxis: { title: 'Curvature κ (1/m)' },
        yaxis: { title: 'Moment M (kNm)' },
        hovermode: 'closest',
        margin: { t: 40, r: 20, b: 40, l: 60 }
    };

    Plotly.newPlot('moment-curvature-plot', [trace, ultimatePoint], layout, {responsive: true});
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function resetAll() {
    if (!confirm('Reset all inputs and clear reinforcement?')) return;

    // Reset form inputs
    document.getElementById('fck').value = 45;
    document.getElementById('fyk').value = 500;
    document.getElementById('ftk').value = 550;
    document.getElementById('epsuk').value = 0.075;
    document.getElementById('width').value = 1000;
    document.getElementById('height').value = 350;

    // Clear reinforcement
    appState.sectionParams.reinforcements = [];
    appState.barCounter = 0;
    appState.lineCounter = 0;

    // Update UI
    updateRebarList();
    updateVisualization();

    // Hide results
    document.getElementById('results-panel').classList.add('hidden');
}
