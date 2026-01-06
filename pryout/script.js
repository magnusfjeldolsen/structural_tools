// ============================================================
// EC2-1-4 Pry-Out Resistance of Shear Stud Groups
// JavaScript implementation based on pryout4.py
// ============================================================

// Global State
const state = {
    studs: [],
    loadCases: [],
    activeLoadCaseId: null,
    results: {}, // results per load case ID
    envelope: null,
    ui: {
        activeTab: 'model',
        resultsView: 'active'
    },
    nextStudId: 1,
    nextLoadCaseId: 1,
    dialogMode: 'add', // 'add' or 'edit'
    editingLoadCaseId: null
};

// ============================================================
// Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Load example studs from pryout4.py
    const exampleStuds = [
        {x: 90, y: 420},
        {x: 90, y: 1710},
        {x: 420, y: 90},
        {x: 420, y: 2070},
        {x: 2580, y: 90},
        {x: 2580, y: 2070},
        {x: 2910, y: 420},
        {x: 2910, y: 1710}
    ];

    exampleStuds.forEach(s => {
        state.studs.push({id: state.nextStudId++, x: s.x, y: s.y});
    });

    // Add default load case
    state.loadCases.push({
        id: state.nextLoadCaseId++,
        name: 'LC1',
        Vx: -50,
        Vy: -50,
        Mz: 0,
        apply_at_centroid: true,
        Px: 0,
        Py: 0
    });

    state.activeLoadCaseId = 1;

    // Update UI
    updateStudTable();
    updateLoadCaseDropdown();
    loadActiveLoadCase();
    checkSpacingWarnings();
    refreshCanvas();
});

// ============================================================
// Stud Management
// ============================================================

function addStud() {
    const xInput = document.getElementById('new-stud-x');
    const yInput = document.getElementById('new-stud-y');

    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);

    if (isNaN(x) || isNaN(y)) {
        alert('Please enter valid coordinates for X and Y');
        return;
    }

    state.studs.push({
        id: state.nextStudId++,
        x: x,
        y: y
    });

    // Clear inputs
    xInput.value = '';
    yInput.value = '';

    updateStudTable();
    checkSpacingWarnings();
    refreshCanvas();
}

function removeStud(id) {
    if (state.studs.length === 1) {
        alert('Cannot remove the last stud');
        return;
    }

    if (confirm('Remove this stud?')) {
        state.studs = state.studs.filter(s => s.id !== id);
        updateStudTable();
        checkSpacingWarnings();
        refreshCanvas();
    }
}

function updateStudFromTable(id, field, value) {
    const stud = state.studs.find(s => s.id === id);
    if (!stud) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
        alert('Invalid coordinate value');
        updateStudTable(); // Reset to previous value
        return;
    }

    stud[field] = numValue;
    checkSpacingWarnings();
    refreshCanvas();
}

function updateStudTable() {
    const tbody = document.getElementById('studs-tbody');
    tbody.innerHTML = '';

    state.studs.forEach((stud, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td><input type="number" class="table-input" value="${stud.x}" step="0.1"
                       onchange="updateStudFromTable(${stud.id}, 'x', this.value)"></td>
            <td><input type="number" class="table-input" value="${stud.y}" step="0.1"
                       onchange="updateStudFromTable(${stud.id}, 'y', this.value)"></td>
            <td class="text-center">
                <button onclick="removeStud(${stud.id})" class="text-red-600 hover:text-red-800 text-sm">
                    Delete
                </button>
            </td>
        `;
    });

    document.getElementById('stud-count').textContent = state.studs.length;
}

// ============================================================
// Load Case Management
// ============================================================

function updateLoadCaseDropdown() {
    const select = document.getElementById('active-load-case');
    select.innerHTML = '';

    state.loadCases.forEach(lc => {
        const option = document.createElement('option');
        option.value = lc.id;
        option.textContent = lc.name;
        if (lc.id === state.activeLoadCaseId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function switchLoadCase() {
    const select = document.getElementById('active-load-case');
    state.activeLoadCaseId = parseInt(select.value);
    loadActiveLoadCase();

    // Update results if already calculated
    if (state.ui.activeTab === 'results' && state.results[state.activeLoadCaseId]) {
        updateResultsView();
        refreshCanvas();
    }
}

function loadActiveLoadCase() {
    const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
    if (!lc) return;

    document.getElementById('Vx').value = lc.Vx;
    document.getElementById('Vy').value = lc.Vy;
    document.getElementById('Mz').value = lc.Mz;
    document.getElementById('Px').value = lc.Px || 0;
    document.getElementById('Py').value = lc.Py || 0;

    if (lc.apply_at_centroid) {
        document.querySelector('input[name="force-application"][value="centroid"]').checked = true;
    } else {
        document.querySelector('input[name="force-application"][value="point"]').checked = true;
    }

    toggleForceApplication();
}

function updateActiveLoadCase() {
    const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
    if (!lc) return;

    lc.Vx = parseFloat(document.getElementById('Vx').value) || 0;
    lc.Vy = parseFloat(document.getElementById('Vy').value) || 0;
    lc.Mz = parseFloat(document.getElementById('Mz').value) || 0;
    lc.Px = parseFloat(document.getElementById('Px').value) || 0;
    lc.Py = parseFloat(document.getElementById('Py').value) || 0;
    lc.apply_at_centroid = document.querySelector('input[name="force-application"]:checked').value === 'centroid';
}

function toggleForceApplication() {
    const pointCoords = document.getElementById('point-coords');
    const isPoint = document.querySelector('input[name="force-application"][value="point"]').checked;

    if (isPoint) {
        pointCoords.classList.remove('hidden');
    } else {
        pointCoords.classList.add('hidden');
    }

    updateActiveLoadCase();
}

function showAddLoadCaseDialog() {
    state.dialogMode = 'add';
    document.getElementById('dialog-title').textContent = 'Add Load Case';
    document.getElementById('dialog-lc-name').value = '';
    document.getElementById('dialog-Vx').value = 0;
    document.getElementById('dialog-Vy').value = 0;
    document.getElementById('dialog-Mz').value = 0;
    document.getElementById('load-case-dialog').classList.remove('hidden');
}

function editLoadCase() {
    const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
    if (!lc) return;

    state.dialogMode = 'edit';
    state.editingLoadCaseId = lc.id;
    document.getElementById('dialog-title').textContent = 'Edit Load Case';
    document.getElementById('dialog-lc-name').value = lc.name;
    document.getElementById('dialog-Vx').value = lc.Vx;
    document.getElementById('dialog-Vy').value = lc.Vy;
    document.getElementById('dialog-Mz').value = lc.Mz;
    document.getElementById('load-case-dialog').classList.remove('hidden');
}

function saveLoadCase() {
    const name = document.getElementById('dialog-lc-name').value.trim();
    const Vx = parseFloat(document.getElementById('dialog-Vx').value) || 0;
    const Vy = parseFloat(document.getElementById('dialog-Vy').value) || 0;
    const Mz = parseFloat(document.getElementById('dialog-Mz').value) || 0;

    if (!name) {
        alert('Please enter a load case name');
        return;
    }

    if (state.dialogMode === 'add') {
        const newLC = {
            id: state.nextLoadCaseId++,
            name: name,
            Vx: Vx,
            Vy: Vy,
            Mz: Mz,
            apply_at_centroid: true,
            Px: 0,
            Py: 0
        };
        state.loadCases.push(newLC);
        state.activeLoadCaseId = newLC.id;
    } else if (state.dialogMode === 'edit') {
        const lc = state.loadCases.find(l => l.id === state.editingLoadCaseId);
        if (lc) {
            lc.name = name;
            lc.Vx = Vx;
            lc.Vy = Vy;
            lc.Mz = Mz;
        }
    }

    updateLoadCaseDropdown();
    loadActiveLoadCase();
    closeLoadCaseDialog();
}

function deleteLoadCase() {
    if (state.loadCases.length === 1) {
        alert('Cannot delete the last load case');
        return;
    }

    if (confirm('Delete this load case?')) {
        state.loadCases = state.loadCases.filter(l => l.id !== state.activeLoadCaseId);
        delete state.results[state.activeLoadCaseId];
        state.activeLoadCaseId = state.loadCases[0].id;
        updateLoadCaseDropdown();
        loadActiveLoadCase();
        updateResultsView();
    }
}

function closeLoadCaseDialog() {
    document.getElementById('load-case-dialog').classList.add('hidden');
}

// ============================================================
// Spacing Warnings
// ============================================================

function toggleManualSpacing() {
    const manualCheckbox = document.getElementById('manual-spacing');
    const spacingInput = document.getElementById('spacing');

    if (manualCheckbox.checked) {
        // Manual mode: enable input, clear auto-calculated styling
        spacingInput.readOnly = false;
        spacingInput.style.backgroundColor = '';
        spacingInput.title = 'Manual spacing override';
    } else {
        // Auto mode: update from calculated spacing
        checkSpacingWarnings();
    }
}

function checkSpacingWarnings() {
    const d = parseFloat(document.getElementById('d').value) || 19;
    const hef = parseFloat(document.getElementById('hef').value) || 100;
    const edgeDist = parseFloat(document.getElementById('edge_dist').value) || 100;

    const manualCheckbox = document.getElementById('manual-spacing');
    const spacingInput = document.getElementById('spacing');
    const spacingInfo = document.getElementById('spacing-info');

    // Calculate actual minimum spacing from stud positions
    const spacingData = calculateMinimumSpacing(state.studs);
    const actualSpacing = spacingData.minSpacing;

    let spacing;

    // Check if manual override is active
    if (manualCheckbox.checked) {
        // Use manual value
        spacing = parseFloat(spacingInput.value) || 120;
        spacingInput.readOnly = false;
        spacingInput.style.backgroundColor = '';
        spacingInfo.classList.add('hidden');
    } else {
        // Auto-calculate from stud positions
        if (actualSpacing !== Infinity) {
            spacingInput.value = actualSpacing.toFixed(1);
            spacingInput.readOnly = true;
            spacingInput.style.backgroundColor = '#f0f9ff'; // light blue to indicate auto-calculated
            spacingInput.title = 'Auto-calculated from stud positions (minimum distance between studs)';
            spacingInfo.classList.remove('hidden');
            spacing = actualSpacing;
        } else {
            // No studs yet, allow manual input
            spacingInput.readOnly = false;
            spacingInput.style.backgroundColor = '';
            spacingInput.title = '';
            spacingInfo.classList.add('hidden');
            spacing = parseFloat(spacingInput.value) || 120;
        }
    }

    const sMin = Math.max(3 * d, 100);
    const cMin = Math.max(1.5 * hef, 2 * d);

    const warnings = [];
    if (spacing < sMin) {
        warnings.push(`Stud spacing (${spacing.toFixed(0)} mm) < recommended minimum (${sMin.toFixed(0)} mm)`);
    }
    if (edgeDist < cMin) {
        warnings.push(`Edge distance (${edgeDist} mm) < recommended minimum (${cMin.toFixed(0)} mm)`);
    }

    const warningDiv = document.getElementById('spacing-warning');
    const warningText = document.getElementById('spacing-warning-text');

    if (warnings.length > 0) {
        warningText.textContent = warnings.join('. ');
        warningDiv.classList.remove('hidden');
    } else {
        warningDiv.classList.add('hidden');
    }
}

// ============================================================
// Calculation Engine (Ported from Python)
// ============================================================

function calculateCentroid(studs) {
    if (studs.length === 0) return {x: 0, y: 0};

    const sumX = studs.reduce((sum, s) => sum + s.x, 0);
    const sumY = studs.reduce((sum, s) => sum + s.y, 0);

    return {
        x: sumX / studs.length,
        y: sumY / studs.length
    };
}

function calculatePolarMoment(studs, Xc, Yc) {
    return studs.reduce((sum, s) => {
        const dx = s.x - Xc;
        const dy = s.y - Yc;
        return sum + dx * dx + dy * dy;
    }, 0);
}

function applyActions(studs, Vx, Vy, Mz, applyAtCentroid, Px, Py) {
    if (studs.length === 0) {
        throw new Error('No studs defined');
    }

    // Calculate centroid
    const centroid = calculateCentroid(studs);
    const Xc = centroid.x;
    const Yc = centroid.y;

    // Determine point of application
    if (applyAtCentroid) {
        Px = Xc;
        Py = Yc;
    }

    // Convert Mz from kNm to kNmm (distances are in mm)
    const Mz_kNmm = Mz * 1000;

    // Torsion contribution due to offset
    const MOffset = Vx * (Py - Yc) - Vy * (Px - Xc);
    const MTotal = Mz_kNmm + MOffset;

    // Polar moment
    const J = calculatePolarMoment(studs, Xc, Yc);
    if (J <= 0) {
        throw new Error('Polar moment must be > 0');
    }

    // Calculate forces for each stud
    const results = [];
    const n = studs.length;

    for (const stud of studs) {
        // Direct shear
        let studVx = Vx / n;
        let studVy = Vy / n;

        // Torsional shear
        const xRel = stud.x - Xc;
        const yRel = stud.y - Yc;
        const Vtx = -MTotal * yRel / J;
        const Vty = MTotal * xRel / J;

        studVx += Vtx;
        studVy += Vty;

        // Resultant
        const Vres = Math.sqrt(studVx * studVx + studVy * studVy);

        results.push({
            id: stud.id,
            x: stud.x,
            y: stud.y,
            Vx: studVx,
            Vy: studVy,
            Vres: Vres
        });
    }

    return {
        results: results,
        centroid: {x: Xc, y: Yc},
        applicationPoint: {x: Px, y: Py},
        MTotal: MTotal
    };
}

function calculateMinimumSpacing(studs) {
    // Calculate minimum spacing for each stud to its nearest neighbor
    // Returns: { minSpacing: overall minimum, spacings: array of min spacing per stud }

    if (studs.length < 2) {
        return { minSpacing: Infinity, spacings: [] };
    }

    const spacings = studs.map((stud, i) => {
        let minDist = Infinity;

        // Calculate distance to all other studs
        studs.forEach((other, j) => {
            if (i !== j) {
                const dx = stud.x - other.x;
                const dy = stud.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist) {
                    minDist = dist;
                }
            }
        });

        return minDist;
    });

    // Overall minimum spacing is the smallest of all minimum distances
    const minSpacing = Math.min(...spacings);

    return { minSpacing, spacings };
}

function calculatePryoutResistance(fck, hef, d, edgeDist, spacing, n) {
    // Psi factors
    const psiEdge = Math.min(1.0, Math.pow(edgeDist / (1.5 * hef), 1.5));
    const psiSpacing = Math.min(1.0, Math.pow(spacing / (3 * hef), 1.5));
    const psiGroup = 1.0 / Math.sqrt(n);

    // Characteristic cone resistance (in kN)
    const NRkC0 = 7.2 * Math.sqrt(fck) * Math.pow(hef, 1.5) / 1000.0;

    // Design pry-out resistance
    const gammaMc = parseFloat(document.getElementById('gamma_Mc').value) || 1.5;
    const kCp = parseFloat(document.getElementById('k_cp').value) || 1.0;

    const psi = psiEdge * psiSpacing * psiGroup;
    const VRdCp = kCp * (NRkC0 * psi / gammaMc);

    return {
        VRdCp: VRdCp,
        psiEdge: psiEdge,
        psiSpacing: psiSpacing,
        psiGroup: psiGroup,
        NRkC0: NRkC0
    };
}

function runAnalysis() {
    if (state.studs.length === 0) {
        alert('Please add at least one stud');
        return;
    }

    // Get material properties
    const fck = parseFloat(document.getElementById('fck').value);
    const hef = parseFloat(document.getElementById('hef').value);
    const d = parseFloat(document.getElementById('d').value);
    const edgeDist = parseFloat(document.getElementById('edge_dist').value);

    // Get spacing: manual override or auto-calculated
    const manualCheckbox = document.getElementById('manual-spacing');
    let spacing;

    if (manualCheckbox.checked) {
        // Use manual override value
        spacing = parseFloat(document.getElementById('spacing').value) || 120;
        console.log(`Using manual spacing override: ${spacing.toFixed(1)} mm`);
    } else {
        // Calculate from stud positions
        const spacingData = calculateMinimumSpacing(state.studs);
        const actualSpacing = spacingData.minSpacing;
        spacing = actualSpacing !== Infinity ? actualSpacing : parseFloat(document.getElementById('spacing').value);

        if (actualSpacing !== Infinity) {
            console.log(`Auto-calculated minimum spacing: ${spacing.toFixed(1)} mm`);
        } else {
            console.log(`Using default spacing: ${spacing.toFixed(1)} mm (insufficient studs for auto-calc)`);
        }
    }

    // Get active load case
    updateActiveLoadCase();

    try {
        // Calculate for active load case
        const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
        const analysis = applyActions(
            state.studs,
            lc.Vx,
            lc.Vy,
            lc.Mz,
            lc.apply_at_centroid,
            lc.Px,
            lc.Py
        );

        const resistance = calculatePryoutResistance(fck, hef, d, edgeDist, spacing, state.studs.length);

        // Add resistance and utilization to results
        const results = analysis.results.map((r, index) => ({
            stud: index + 1,
            x_mm: r.x,
            y_mm: r.y,
            Vx_kN: r.Vx,
            Vy_kN: r.Vy,
            Vres_kN: r.Vres,
            V_Rd_cp_kN: resistance.VRdCp,
            utilization: r.Vres / resistance.VRdCp
        }));

        state.results[state.activeLoadCaseId] = {
            results: results,
            centroid: analysis.centroid,
            applicationPoint: analysis.applicationPoint,
            MTotal: analysis.MTotal,
            resistance: resistance
        };

        // Calculate all load cases and envelope
        calculateAllLoadCases(fck, hef, d, edgeDist, spacing);
        calculateEnvelope();

        // Update UI
        updateResultsView();
        refreshCanvas();

        // Auto-switch to Results view
        switchTab('results');

        console.log('Analysis complete for', lc.name);
    } catch (error) {
        alert('Calculation error: ' + error.message);
        console.error(error);
    }
}

function calculateAllLoadCases(fck, hef, d, edgeDist, spacingToUse) {
    const resistance = calculatePryoutResistance(fck, hef, d, edgeDist, spacingToUse, state.studs.length);

    for (const lc of state.loadCases) {
        try {
            const analysis = applyActions(
                state.studs,
                lc.Vx,
                lc.Vy,
                lc.Mz,
                lc.apply_at_centroid,
                lc.Px,
                lc.Py
            );

            const results = analysis.results.map((r, index) => ({
                stud: index + 1,
                x_mm: r.x,
                y_mm: r.y,
                Vx_kN: r.Vx,
                Vy_kN: r.Vy,
                Vres_kN: r.Vres,
                V_Rd_cp_kN: resistance.VRdCp,
                utilization: r.Vres / resistance.VRdCp
            }));

            state.results[lc.id] = {
                results: results,
                centroid: analysis.centroid,
                applicationPoint: analysis.applicationPoint,
                MTotal: analysis.MTotal,
                resistance: resistance
            };
        } catch (error) {
            console.error(`Error calculating load case ${lc.name}:`, error);
        }
    }
}

function calculateEnvelope() {
    if (Object.keys(state.results).length === 0) {
        state.envelope = null;
        return;
    }

    const envelope = [];

    // For each stud position
    for (let i = 0; i < state.studs.length; i++) {
        let maxVres = -Infinity;
        let maxUtil = -Infinity;
        let criticalLC = null;
        let maxVx = 0;
        let maxVy = 0;
        let VRdCp = 0;

        // Find max across all load cases
        for (const lcId in state.results) {
            const result = state.results[lcId].results[i];
            if (result.Vres_kN > maxVres) {
                maxVres = result.Vres_kN;
                maxUtil = result.utilization;
                maxVx = result.Vx_kN;
                maxVy = result.Vy_kN;
                VRdCp = result.V_Rd_cp_kN;
                criticalLC = state.loadCases.find(lc => lc.id === parseInt(lcId));
            }
        }

        envelope.push({
            stud: i + 1,
            x_mm: state.studs[i].x,
            y_mm: state.studs[i].y,
            Vx_kN: maxVx,
            Vy_kN: maxVy,
            Vres_kN: maxVres,
            V_Rd_cp_kN: VRdCp,
            utilization: maxUtil,
            criticalCase: criticalLC ? criticalLC.name : '-'
        });
    }

    state.envelope = envelope;
}

// ============================================================
// Results Display
// ============================================================

function updateResultsView() {
    const view = document.getElementById('results-view').value;
    state.ui.resultsView = view;

    const container = document.getElementById('results-container');

    if (view === 'active') {
        const results = state.results[state.activeLoadCaseId];
        if (!results) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No results for this load case. Click Calculate.</div>';
            document.getElementById('max-util').classList.add('hidden');
            return;
        }

        displayResultsTable(results.results, false);
    } else if (view === 'envelope') {
        if (!state.envelope) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No envelope results. Click Calculate.</div>';
            document.getElementById('max-util').classList.add('hidden');
            return;
        }

        displayResultsTable(state.envelope, true);
    }

    refreshCanvas();
}

function displayResultsTable(results, showCriticalCase) {
    const container = document.getElementById('results-container');

    let html = '<table class="w-full"><thead><tr>';
    html += '<th>Stud</th>';
    html += '<th>V<sub>x</sub> (kN)</th>';
    html += '<th>V<sub>y</sub> (kN)</th>';
    html += '<th>V<sub>res</sub> (kN)</th>';
    html += '<th>V<sub>Rd,cp</sub> (kN)</th>';
    html += '<th>η (%)</th>';
    if (showCriticalCase) {
        html += '<th>Critical Case</th>';
    }
    html += '</tr></thead><tbody>';

    let maxUtil = 0;
    let maxUtilStud = 0;
    let maxUtilLC = '';

    results.forEach(r => {
        const utilPct = r.utilization * 100;
        let utilClass = 'util-ok';
        if (utilPct > 100) utilClass = 'util-fail';
        else if (utilPct > 85) utilClass = 'util-warning';

        if (utilPct > maxUtil) {
            maxUtil = utilPct;
            maxUtilStud = r.stud;
            maxUtilLC = r.criticalCase || '';
        }

        html += '<tr>';
        html += `<td class="text-center">${r.stud}</td>`;
        html += `<td class="text-right">${r.Vx_kN.toFixed(1)}</td>`;
        html += `<td class="text-right">${r.Vy_kN.toFixed(1)}</td>`;
        html += `<td class="text-right font-semibold">${r.Vres_kN.toFixed(1)}</td>`;
        html += `<td class="text-right">${r.V_Rd_cp_kN.toFixed(1)}</td>`;
        html += `<td class="text-right ${utilClass}">${utilPct.toFixed(1)}%</td>`;
        if (showCriticalCase) {
            html += `<td class="text-center text-sm">${r.criticalCase}</td>`;
        }
        html += '</tr>';
    });

    html += '</tbody></table>';

    container.innerHTML = html;

    // Update max utilization display
    const maxUtilDiv = document.getElementById('max-util');
    const maxUtilText = document.getElementById('max-util-text');

    let maxUtilClass = 'text-green-700';
    if (maxUtil > 100) maxUtilClass = 'text-red-700';
    else if (maxUtil > 85) maxUtilClass = 'text-yellow-700';

    maxUtilText.innerHTML = `<span class="${maxUtilClass} font-bold">${maxUtil.toFixed(1)}%</span> at Stud ${maxUtilStud}`;
    if (showCriticalCase && maxUtilLC) {
        maxUtilText.innerHTML += ` (${maxUtilLC})`;
    }
    maxUtilDiv.classList.remove('hidden');
}

// ============================================================
// Canvas Visualization
// ============================================================

function refreshCanvas() {
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.studs.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Add studs to see geometry', canvas.width / 2, canvas.height / 2);
        document.getElementById('canvas-info').textContent = 'Add studs to see geometry';
        return;
    }

    const tab = state.ui.activeTab;

    if (tab === 'model') {
        drawModelView(ctx, canvas);
    } else if (tab === 'results') {
        drawResultsView(ctx, canvas);
    } else if (tab === 'envelope') {
        drawEnvelopeView(ctx, canvas);
    }
}

function drawModelView(ctx, canvas) {
    const edgeDist = parseFloat(document.getElementById('edge_dist').value) || 100;

    // Calculate bounds
    const xs = state.studs.map(s => s.x);
    const ys = state.studs.map(s => s.y);
    const minX = Math.min(...xs) - edgeDist;
    const maxX = Math.max(...xs) + edgeDist;
    const minY = Math.min(...ys) - edgeDist;
    const maxY = Math.max(...ys) + edgeDist;

    const modelWidth = maxX - minX;
    const modelHeight = maxY - minY;

    const padding = 60;
    const availWidth = canvas.width - 2 * padding;
    const availHeight = canvas.height - 2 * padding;

    const scale = Math.min(availWidth / modelWidth, availHeight / modelHeight);

    // Transform functions - Cartesian coordinates (Y increases upward)
    const toCanvasX = (x) => padding + (x - minX) * scale;
    const toCanvasY = (y) => canvas.height - padding - (y - minY) * scale;

    // Draw edge rectangle (dashed)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.rect(toCanvasX(minX), toCanvasY(minY), modelWidth * scale, modelHeight * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw centroid
    const centroid = calculateCentroid(state.studs);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(toCanvasX(centroid.x), toCanvasY(centroid.y), 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.fillText('C', toCanvasX(centroid.x) + 10, toCanvasY(centroid.y) - 10);

    // Draw studs
    state.studs.forEach((stud, index) => {
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(toCanvasX(stud.x), toCanvasY(stud.y), 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${index + 1}`, toCanvasX(stud.x) + 10, toCanvasY(stud.y) + 5);
    });

    // Draw axes
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding + 10, canvas.height - padding - 10);
    ctx.lineTo(padding + 50, canvas.height - padding - 10);
    ctx.stroke();

    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(padding + 10, canvas.height - padding - 10);
    ctx.lineTo(padding + 10, canvas.height - padding - 50);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.fillText('x', padding + 55, canvas.height - padding - 5);
    ctx.fillText('y', padding + 5, canvas.height - padding - 55);

    document.getElementById('canvas-info').textContent = `Model view - ${state.studs.length} studs, Centroid: (${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)}) mm`;
}

function drawResultsView(ctx, canvas) {
    const results = state.results[state.activeLoadCaseId];
    if (!results) {
        drawModelView(ctx, canvas);
        return;
    }

    drawModelView(ctx, canvas);

    // Overlay force vectors
    const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
    document.getElementById('canvas-info').textContent = `Results for ${lc.name} - Orange arrows show stud forces`;

    // Draw force arrows for each stud
    drawForceArrows(ctx, canvas, results);
}

function drawForceArrows(ctx, canvas, resultsData) {
    const edgeDist = parseFloat(document.getElementById('edge_dist').value) || 100;

    // Calculate bounds and scale (same as drawModelView)
    const xs = state.studs.map(s => s.x);
    const ys = state.studs.map(s => s.y);
    const minX = Math.min(...xs) - edgeDist;
    const maxX = Math.max(...xs) + edgeDist;
    const minY = Math.min(...ys) - edgeDist;
    const maxY = Math.max(...ys) + edgeDist;

    const modelWidth = maxX - minX;
    const modelHeight = maxY - minY;

    const padding = 60;
    const availWidth = canvas.width - 2 * padding;
    const availHeight = canvas.height - 2 * padding;

    const scale = Math.min(availWidth / modelWidth, availHeight / modelHeight);

    // Transform functions - Cartesian coordinates (Y increases upward)
    const toCanvasX = (x) => padding + (x - minX) * scale;
    const toCanvasY = (y) => canvas.height - padding - (y - minY) * scale;

    // Calculate plot region size (max of width and height in pixels)
    const plotRegionSize = Math.max(availWidth, availHeight);

    // Handle both result structures (results.results or envelope array)
    const resultArray = resultsData.results ? resultsData.results : resultsData;

    // Find max force for scaling arrows - largest force gets 1/20 of plot region
    const maxForce = Math.max(...resultArray.map(r => r.Vres_kN));
    const maxArrowLength = plotRegionSize / 20;

    // Draw arrows for each stud
    resultArray.forEach((r, index) => {
        // Get stud by index (stud number - 1)
        const stud = state.studs[index];
        if (!stud) return;

        const cx = toCanvasX(stud.x);
        const cy = toCanvasY(stud.y);

        // Calculate arrow length - proportional to force, max force gets maxArrowLength
        const forceRatio = r.Vres_kN / maxForce;
        const arrowLength = forceRatio * maxArrowLength;

        // Calculate angle from Vx and Vy (negate Vy for canvas Y-inversion)
        const angle = Math.atan2(-r.Vy_kN, r.Vx_kN);

        // Draw arrow
        drawArrow(ctx, cx, cy, angle, arrowLength, '#ff8c00', r.Vres_kN);
    });
}

function drawArrow(ctx, x, y, angle, length, color, forceValue) {
    ctx.save();

    // Draw arrow line
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    const endX = x + length * Math.cos(angle);
    const endY = y + length * Math.sin(angle);

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    const headLength = 10;
    const headAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
        endX - headLength * Math.cos(angle - headAngle),
        endY - headLength * Math.sin(angle - headAngle)
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
        endX - headLength * Math.cos(angle + headAngle),
        endY - headLength * Math.sin(angle + headAngle)
    );
    ctx.stroke();

    // Label with force value
    if (length > 15) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(`${forceValue.toFixed(1)} kN`, endX + 5, endY - 5);
    }

    ctx.restore();
}

function drawEnvelopeView(ctx, canvas) {
    if (!state.envelope) {
        drawModelView(ctx, canvas);
        return;
    }

    drawModelView(ctx, canvas);

    // Overlay envelope force vectors
    document.getElementById('canvas-info').textContent = 'Envelope view - Red arrows show maximum forces';

    // Draw envelope force vectors
    drawForceArrows(ctx, canvas, state.envelope);
}

// ============================================================
// Tab Navigation
// ============================================================

function switchTab(tab) {
    state.ui.activeTab = tab;

    // Update dropdown selector
    const viewSelector = document.getElementById('view-selector');
    if (viewSelector) {
        viewSelector.value = tab;
    }

    refreshCanvas();
}

// ============================================================
// Keyboard Shortcuts
// ============================================================

document.addEventListener('keydown', (e) => {
    // Ctrl+Space to run analysis
    if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        runAnalysis();
    }
});

// ============================================================
// Input Change Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const materialInputs = ['fck', 'hef', 'd', 'edge_dist', 'spacing', 'gamma_Mc', 'k_cp'];
    materialInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', () => {
                checkSpacingWarnings();
                if (id === 'edge_dist') {
                    refreshCanvas();
                }
            });
        }
    });
});
