/**
 * Concrete Dowels Calculation Script
 * Based on Norwegian "Betongelementboken" standard
 * Implementation follows the calculation logic from provided PDF
 */

// Utility functions
function toFixedIfNeeded(num, digits = 2) {
    return parseFloat(num.toFixed(digits));
}

function evaluateExpression(expr) {
    try {
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') throw new Error('Invalid expression type');

        const sanitized = expr.replace(/[^0-9+\-*/().\s^]/g, '');
        const jsExpression = sanitized.replace(/\^/g, '**');
        const result = new Function('return ' + jsExpression)();

        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation result');
        }

        return result;
    } catch (error) {
        throw new Error(`Expression evaluation error: ${error.message}`);
    }
}

// Steel quality data from Table B19.4.2 in PDF
const steelQualityData = {
    'S235': { n: 10, fyk: 235 },
    'K4.8': { n: 11, fyk: 320 },
    'S355': { n: 12, fyk: 355 },
    'B500NC': { n: 14, fyk: 500 },
    'K8.8': { n: 16, fyk: 640 }
};

// Update steel parameters based on quality selection
function updateSteelProperties() {
    const quality = document.getElementById('steel_quality').value;
    const nInput = document.getElementById('n_factor');
    const fykInput = document.getElementById('fyk');

    if (quality === 'custom') {
        nInput.disabled = false;
        fykInput.disabled = false;
        nInput.style.backgroundColor = '#4b5563';
        fykInput.style.backgroundColor = '#4b5563';
    } else {
        nInput.disabled = true;
        fykInput.disabled = false; // fyk can still be manually adjusted
        nInput.style.backgroundColor = '#374151';

        // Set values from table
        if (steelQualityData[quality]) {
            nInput.value = steelQualityData[quality].n;
            fykInput.value = steelQualityData[quality].fyk;
        }
    }

    updateFyd();
}

// Update concrete properties based on grade selection
function updateConcreteProperties() {
    const grade = document.getElementById('concrete_grade').value;
    const fckInput = document.getElementById('fck');

    if (grade === 'custom') {
        fckInput.disabled = false;
        fckInput.style.backgroundColor = '#4b5563';
    } else {
        fckInput.disabled = true;
        fckInput.style.backgroundColor = '#374151';

        const gradeValues = {
            'B25': 25,
            'B30': 30,
            'B35': 35,
            'B40': 40,
            'B45': 45
        };
        fckInput.value = gradeValues[grade] || 35;
    }

    updateFcd();
}

// Update fcd calculation
function updateFcd() {
    const fck = parseFloat(document.getElementById('fck').value) || 35;
    const alphaCc = parseFloat(document.getElementById('alpha_cc').value) || 0.85;
    const gammaC = parseFloat(document.getElementById('gamma_c').value) || 1.5;

    const fcd = (alphaCc * fck) / gammaC;
    document.getElementById('fcd_display').textContent = toFixedIfNeeded(fcd);
}

// Update fyd calculation
function updateFyd() {
    const fyk = parseFloat(document.getElementById('fyk').value) || 500;
    const gammaS = parseFloat(document.getElementById('gamma_s').value) || 1.15;

    const fyd = fyk / gammaS;
    document.getElementById('fyd_display').textContent = toFixedIfNeeded(fyd);
}

// Update dowel area calculation
function updateDowelArea() {
    const diameter = parseFloat(document.getElementById('dowel_diameter').value) || 12;
    const nVParallel = parseFloat(document.getElementById('n_v_parallel').value) || 1;
    const nVOrtagonal = parseFloat(document.getElementById('n_v_ortagonal').value) || 5;

    const nVTot = nVParallel * nVOrtagonal;
    const As = (Math.PI * Math.pow(diameter, 2) / 4);

    document.getElementById('n_v_tot_display').textContent = nVTot;
    document.getElementById('dowel_area_display').textContent = toFixedIfNeeded(As);
}

// Main calculation function
function calculateAndShow() {
    try {
        // Get input values
        const inputs = getInputValues();

        // Perform calculations
        const results = performCalculations(inputs);

        // Display results
        displayResults(results);
        displayDetailedCalculations(results, inputs);
        drawGeometryPlot(inputs);

        // Generate detailed report
        generateDetailedReport(results, inputs);

    } catch (error) {
        console.error('Calculation error:', error);
        alert('Error in calculations: ' + error.message);
    }
}

function getInputValues() {
    return {
        // Load parameters
        VEd: parseFloat(document.getElementById('v_ed').value) || 27.5,
        fdybel: parseFloat(document.getElementById('f_dybel').value) || 1.4,

        // Dowel configuration
        dowelDiameter: parseFloat(document.getElementById('dowel_diameter').value) || 12,
        nVParallel: parseFloat(document.getElementById('n_v_parallel').value) || 1,
        ccParallel: parseFloat(document.getElementById('cc_parallel').value) || 200,
        nVOrtagonal: parseFloat(document.getElementById('n_v_ortagonal').value) || 5,
        ccOrtagonal: parseFloat(document.getElementById('cc_ortagonal').value) || 200,

        // Geometry
        eccentricity: parseFloat(document.getElementById('eccentricity').value) || 0,
        a1: parseFloat(document.getElementById('a1').value) || 1000,
        a2h: parseFloat(document.getElementById('a2_h').value) || 1000,
        a2v: parseFloat(document.getElementById('a2_v').value) || 1000,

        // Material properties
        fck: parseFloat(document.getElementById('fck').value) || 35,
        alphaCc: parseFloat(document.getElementById('alpha_cc').value) || 0.85,
        gammaC: parseFloat(document.getElementById('gamma_c').value) || 1.5,
        fyk: parseFloat(document.getElementById('fyk').value) || 500,
        gammaS: parseFloat(document.getElementById('gamma_s').value) || 1.15,
        nFactor: parseFloat(document.getElementById('n_factor').value) || 14
    };
}

function performCalculations(inputs) {
    const results = {};

    // Basic calculations
    results.nVTot = inputs.nVParallel * inputs.nVOrtagonal;
    results.As = Math.PI * Math.pow(inputs.dowelDiameter, 2) / 4;
    results.fcd = (inputs.alphaCc * inputs.fck) / inputs.gammaC;
    results.fyd = inputs.fyk / inputs.gammaS;
    results.sigmaCD = 3 * results.fcd; // From Betongelementboka B.19.4.2.3

    // Steel shear capacity for entire dowel group (convert units: As in mm², fyd in MPa, result in N, then to kN)
    results.VRdS = (results.nVTot * results.As * results.fyd / Math.sqrt(3)) / 1000;

    // Plastic moment capacity per rod (convert units: fyd in MPa, diameter in mm, result in Nmm, then to kNm)
    results.MRdS0 = (results.fyd * Math.pow(inputs.dowelDiameter, 3) / 6) / 1000000;

    // Failure analysis - when dowel yields in bending while concrete breaks in shear
    const x = 1.5 * inputs.dowelDiameter;
    const L = inputs.eccentricity + 0.75 * inputs.dowelDiameter;
    const V = inputs.VEd / results.nVTot;

    // Maximum moment (convert units: V in kN, distances in mm, result in kNmm, then to kNm)
    results.Mmax = (V * (inputs.eccentricity + x) - V * x / 2) / 1000;

    // Analytical solution for VRd.e (from quadratic equation)
    const fcd = results.fcd;
    const fyd = results.fyd;
    const e = inputs.eccentricity;
    const diameter = inputs.dowelDiameter;

    // Corrected VRd.e formula: 1.5*sqrt((fcd*e*ø)^2 + fcd*fyd*ø^4) - 1.5*fcd*e*ø
    // Convert units: fcd, fyd in MPa, diameter, e in mm, result in N, then to kN
    const term1_VRdE = Math.pow(fcd * e * diameter, 2);
    const term2_VRdE = fcd * fyd * Math.pow(diameter, 4);
    results.VRdE = (1.5 * Math.sqrt(term1_VRdE + term2_VRdE) - 1.5 * fcd * e * diameter) / 1000;

    // Verify against simplified formula (when e = 0) - convert units
    results.VRdE0 = (1.5 * Math.pow(diameter, 2) * Math.sqrt(fcd * fyd)) / 1000;

    // Set VRdC0 = VRdE
    results.VRdC0 = results.VRdE;

    // Distance factor calculations (ka, ks, k) - corrected formulas
    // ka = (min(n*ø, a1) - ø) / (n*ø - ø)
    const minNPhiA1 = Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1);
    results.ka = (minNPhiA1 - inputs.dowelDiameter) / (inputs.nFactor * inputs.dowelDiameter - inputs.dowelDiameter);

    // ks = (a2,v + (nV,ortagonal-1)*cc_ortagonal + a2,h) / (3*min(n*ø, a1))
    const numerator_ks = inputs.a2v + (inputs.nVOrtagonal - 1) * inputs.ccOrtagonal + inputs.a2h;
    const denominator_ks = 3 * minNPhiA1;
    results.ks = numerator_ks / denominator_ks;

    // k = min(nV,ortagonal, ka * ks)
    results.k = Math.min(inputs.nVOrtagonal, results.ka * results.ks);

    // Factor ψf.V calculation - corrected formula
    // ψf.V = min(nV,parallel, 1 + (nV,parallel - 1) * cc_parallel / (0.75 * min(n*ø, a1)))
    const psiFV_fraction = (inputs.nVParallel - 1) * inputs.ccParallel / (0.75 * minNPhiA1);
    results.psiFV = Math.min(inputs.nVParallel, 1 + psiFV_fraction);

    // Final shear capacity for dowel group
    results.VRd = inputs.fdybel * results.k * results.psiFV * results.VRdC0;

    // Utilization ratios
    results.vc = inputs.VEd / results.VRd;
    results.vs = inputs.VEd / results.VRdS;
    results.ms = results.Mmax / results.MRdS0;

    return results;
}

function displayResults(results) {
    // Summary results
    document.getElementById('result_v_rd').textContent = toFixedIfNeeded(results.VRd, 1) + ' kN';
    document.getElementById('result_utilization_concrete').textContent = toFixedIfNeeded(results.vc * 100, 1) + '%';
    document.getElementById('result_utilization_steel').textContent = toFixedIfNeeded(results.vs * 100, 1) + '%';
    document.getElementById('result_utilization_bending').textContent = toFixedIfNeeded(results.ms * 100, 1) + '%';

    // Color code utilization based on values
    const concreteUtilElement = document.getElementById('result_utilization_concrete');
    const steelUtilElement = document.getElementById('result_utilization_steel');
    const bendingUtilElement = document.getElementById('result_utilization_bending');

    [concreteUtilElement, steelUtilElement, bendingUtilElement].forEach((element, index) => {
        const utilization = [results.vc, results.vs, results.ms][index];
        element.className = utilization > 1.0 ? 'text-red-400 font-bold' :
                          utilization > 0.8 ? 'text-yellow-400 font-semibold' :
                          'text-green-400';
    });
}

function displayDetailedCalculations(results, inputs) {
    const detailsDiv = document.getElementById('detailed-calculations');

    const html = `
        <div class="space-y-6">
            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Basic Parameters</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>Total number of dowels: n<sub>V,tot</sub> = ${inputs.nVParallel} × ${inputs.nVOrtagonal} = ${results.nVTot}</div>
                    <div>Dowel area: A<sub>s</sub> = π × φ² / 4 = π × ${inputs.dowelDiameter}² / 4 = ${toFixedIfNeeded(results.As)} mm²</div>
                    <div>Design concrete strength: f<sub>cd</sub> = ${inputs.alphaCc} × ${inputs.fck} / ${inputs.gammaC} = ${toFixedIfNeeded(results.fcd)} MPa</div>
                    <div>Design steel strength: f<sub>yd</sub> = ${inputs.fyk} / ${inputs.gammaS} = ${toFixedIfNeeded(results.fyd)} MPa</div>
                    <div>Concrete stress limit: σ<sub>cd</sub> = 3 × f<sub>cd</sub> = ${toFixedIfNeeded(results.sigmaCD)} MPa</div>
                </div>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Steel Capacity</h4>
                <div class="text-sm space-y-2">
                    <div>Steel shear capacity (entire group): V<sub>Rd,s</sub> = n<sub>V,tot</sub> × A<sub>s</sub> × f<sub>yd</sub> / √3</div>
                    <div>V<sub>Rd,s</sub> = ${results.nVTot} × ${toFixedIfNeeded(results.As)} × ${toFixedIfNeeded(results.fyd)} / √3 = ${toFixedIfNeeded(results.VRdS)} kN</div>
                    <div>Plastic moment capacity per rod: M<sub>Rd,s,0</sub> = f<sub>yd</sub> × φ³ / 6 = ${toFixedIfNeeded(results.MRdS0, 4)} kNm</div>
                </div>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Concrete Shear Capacity</h4>
                <div class="text-sm space-y-2">
                    <div>Load per dowel: V = V<sub>Ed</sub> / n<sub>V,tot</sub> = ${inputs.VEd} / ${results.nVTot} = ${toFixedIfNeeded(inputs.VEd / results.nVTot)} kN</div>
                    <div>Maximum moment: M<sub>max</sub> = V × (e + x) - V × x / 2 = ${toFixedIfNeeded(results.Mmax, 4)} kNm</div>
                    <div>Analytical solution: V<sub>Rd,e</sub> = ${toFixedIfNeeded(results.VRdE)} kN</div>
                    <div>Verification (e=0): V<sub>Rd,e0</sub> = 1.5 × φ² × √(f<sub>cd</sub> × f<sub>yd</sub>) = ${toFixedIfNeeded(results.VRdE0)} kN ✓</div>
                </div>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Distance Factors</h4>
                <div class="text-sm space-y-2">
                    <div>min(n×φ, a<sub>1</sub>) = min(${inputs.nFactor}×${inputs.dowelDiameter}, ${inputs.a1}) = ${Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)} mm</div>
                    <div>Edge distance factor: k<sub>a</sub> = (min(n×φ, a<sub>1</sub>) - φ) / (n×φ - φ) = (${Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)} - ${inputs.dowelDiameter}) / (${inputs.nFactor * inputs.dowelDiameter} - ${inputs.dowelDiameter}) = ${toFixedIfNeeded(results.ka)}</div>
                    <div>Spacing factor: k<sub>s</sub> = (a<sub>2,v</sub> + (n<sub>V,ort</sub>-1)×cc<sub>ort</sub> + a<sub>2,h</sub>) / (3×min(n×φ, a<sub>1</sub>)) = (${inputs.a2v} + (${inputs.nVOrtagonal}-1)×${inputs.ccOrtagonal} + ${inputs.a2h}) / (3×${Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)}) = ${inputs.a2v + (inputs.nVOrtagonal - 1) * inputs.ccOrtagonal + inputs.a2h} / ${3 * Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)} = ${toFixedIfNeeded(results.ks)}</div>
                    <div>Group factor: k = min(n<sub>V,ort</sub>, k<sub>a</sub> × k<sub>s</sub>) = min(${inputs.nVOrtagonal}, ${toFixedIfNeeded(results.ka)} × ${toFixedIfNeeded(results.ks)}) = min(${inputs.nVOrtagonal}, ${toFixedIfNeeded(results.ka * results.ks)}) = ${toFixedIfNeeded(results.k)}</div>
                    <div>Parallel factor: ψ<sub>f,V</sub> = min(n<sub>V,par</sub>, 1 + (n<sub>V,par</sub>-1)×cc<sub>par</sub>/(0.75×min(n×φ, a<sub>1</sub>))) = min(${inputs.nVParallel}, 1 + (${inputs.nVParallel}-1)×${inputs.ccParallel}/(0.75×${Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)})) = min(${inputs.nVParallel}, 1 + ${(inputs.nVParallel - 1) * inputs.ccParallel}/${toFixedIfNeeded(0.75 * Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1))}) = min(${inputs.nVParallel}, 1 + ${toFixedIfNeeded((inputs.nVParallel - 1) * inputs.ccParallel / (0.75 * Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)))}) = min(${inputs.nVParallel}, ${toFixedIfNeeded(1 + (inputs.nVParallel - 1) * inputs.ccParallel / (0.75 * Math.min(inputs.nFactor * inputs.dowelDiameter, inputs.a1)))}) = ${toFixedIfNeeded(results.psiFV)}</div>
                </div>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Final Capacity</h4>
                <div class="text-sm space-y-2">
                    <div>Shear capacity for dowel group: V<sub>Rd</sub> = f<sub>dybel</sub> × k × ψ<sub>f,V</sub> × V<sub>Rd,c,0</sub></div>
                    <div>V<sub>Rd</sub> = ${inputs.fdybel} × ${toFixedIfNeeded(results.k)} × ${toFixedIfNeeded(results.psiFV)} × ${toFixedIfNeeded(results.VRdC0)} = ${toFixedIfNeeded(results.VRd)} kN</div>
                </div>
            </div>

            <div class="bg-gray-700 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-blue-400 mb-3">Utilization Check</h4>
                <div class="text-sm space-y-2">
                    <div>Concrete shear: v<sub>c</sub> = V<sub>Ed</sub> / V<sub>Rd</sub> = ${inputs.VEd} / ${toFixedIfNeeded(results.VRd)} = ${toFixedIfNeeded(results.vc, 3)} = ${toFixedIfNeeded(results.vc * 100, 1)}%</div>
                    <div>Steel shear: v<sub>s</sub> = V<sub>Ed</sub> / V<sub>Rd,s</sub> = ${inputs.VEd} / ${toFixedIfNeeded(results.VRdS)} = ${toFixedIfNeeded(results.vs, 3)} = ${toFixedIfNeeded(results.vs * 100, 1)}%</div>
                    <div>Steel bending: m<sub>s</sub> = M<sub>max</sub> / M<sub>Rd,s,0</sub> = ${toFixedIfNeeded(results.Mmax, 4)} / ${toFixedIfNeeded(results.MRdS0, 4)} = ${toFixedIfNeeded(results.ms, 3)} = ${toFixedIfNeeded(results.ms * 100, 1)}%</div>
                </div>
            </div>
        </div>
    `;

    detailsDiv.innerHTML = html;
}

// D3.js Geometry Visualization
function drawGeometryPlot(inputs) {
    // Clear previous plot
    d3.select('#geometry-plot').selectAll('*').remove();

    // Get container width and set up responsive dimensions
    const container = document.getElementById('geometry-plot');
    const containerWidth = container.clientWidth;
    const margin = { top: 60, right: 80, bottom: 80, left: 80 };
    const width = containerWidth - margin.left - margin.right - 40; // Account for padding
    const height = Math.max(400, width * 0.6) - margin.top - margin.bottom; // Responsive height

    // Create SVG that fills container width
    const svg = d3.select('#geometry-plot')
        .append('svg')
        .attr('width', '100%')
        .attr('height', height + margin.top + margin.bottom)
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate geometry dimensions
    const totalWidth = inputs.a2v + (inputs.nVOrtagonal - 1) * inputs.ccOrtagonal + inputs.a2h;
    const totalHeight = inputs.a1 + (inputs.nVParallel - 1) * inputs.ccParallel + inputs.a1; // a1 on both sides

    // Scale to fit the plot area
    const scale = Math.min(width / totalWidth, height / totalHeight) * 0.8;

    // Center the plot
    const offsetX = (width - totalWidth * scale) / 2;
    const offsetY = (height - totalHeight * scale) / 2;

    // Draw concrete rectangle
    g.append('rect')
        .attr('x', offsetX)
        .attr('y', offsetY)
        .attr('width', totalWidth * scale)
        .attr('height', totalHeight * scale)
        .attr('fill', '#e5e7eb')
        .attr('stroke', '#374151')
        .attr('stroke-width', 2)
        .attr('opacity', 0.7);

    // Draw dowels
    const dowelRadius = Math.max(3, inputs.dowelDiameter * scale / 20);

    for (let i = 0; i < inputs.nVParallel; i++) {
        for (let j = 0; j < inputs.nVOrtagonal; j++) {
            const dowelX = offsetX + (inputs.a2v + j * inputs.ccOrtagonal) * scale;
            const dowelY = offsetY + (inputs.a1 + i * inputs.ccParallel) * scale;

            g.append('circle')
                .attr('cx', dowelX)
                .attr('cy', dowelY)
                .attr('r', dowelRadius)
                .attr('fill', '#ef4444')
                .attr('stroke', '#991b1b')
                .attr('stroke-width', 1);
        }
    }

    // Draw VEd arrow (vertical, pointing down)
    const arrowX = offsetX + (totalWidth * scale) / 2;
    const arrowY = offsetY - 30;

    // Arrow line
    g.append('line')
        .attr('x1', arrowX)
        .attr('y1', arrowY)
        .attr('x2', arrowX)
        .attr('y2', offsetY - 5)
        .attr('stroke', '#1d4ed8')
        .attr('stroke-width', 3)
        .attr('marker-end', 'url(#arrowhead)');

    // Arrow head marker
    svg.append('defs')
        .append('marker')
        .attr('id', 'arrowhead')
        .attr('markerWidth', 10)
        .attr('markerHeight', 7)
        .attr('refX', 9)
        .attr('refY', 3.5)
        .attr('orient', 'auto')
        .append('polygon')
        .attr('points', '0 0, 10 3.5, 0 7')
        .attr('fill', '#1d4ed8');

    // VEd label
    g.append('text')
        .attr('x', arrowX + 15)
        .attr('y', arrowY + 5)
        .attr('text-anchor', 'start')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', '#1d4ed8')
        .text(`V_Ed = ${inputs.VEd} kN`);

    // Dimension lines and labels
    const dimOffset = 20;

    // a2.v dimension (left)
    if (inputs.a2v > 0) {
        const dimY = offsetY + totalHeight * scale + dimOffset;
        g.append('line')
            .attr('x1', offsetX)
            .attr('y1', dimY)
            .attr('x2', offsetX + inputs.a2v * scale)
            .attr('y2', dimY)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1);

        g.append('text')
            .attr('x', offsetX + (inputs.a2v * scale) / 2)
            .attr('y', dimY + 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#374151')
            .text(`a2,v = ${inputs.a2v}`);
    }

    // a2.h dimension (right)
    if (inputs.a2h > 0) {
        const dimY = offsetY + totalHeight * scale + dimOffset;
        const startX = offsetX + (inputs.a2v + (inputs.nVOrtagonal - 1) * inputs.ccOrtagonal) * scale;
        g.append('line')
            .attr('x1', startX)
            .attr('y1', dimY)
            .attr('x2', startX + inputs.a2h * scale)
            .attr('y2', dimY)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1);

        g.append('text')
            .attr('x', startX + (inputs.a2h * scale) / 2)
            .attr('y', dimY + 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#374151')
            .text(`a2,h = ${inputs.a2h}`);
    }

    // a1 dimension (top)
    if (inputs.a1 > 0) {
        const dimX = offsetX - dimOffset;
        g.append('line')
            .attr('x1', dimX)
            .attr('y1', offsetY)
            .attr('x2', dimX)
            .attr('y2', offsetY + inputs.a1 * scale)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1);

        g.append('text')
            .attr('x', dimX - 5)
            .attr('y', offsetY + (inputs.a1 * scale) / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#374151')
            .attr('transform', `rotate(-90, ${dimX - 5}, ${offsetY + (inputs.a1 * scale) / 2})`)
            .text(`a1 = ${inputs.a1}`);
    }

    // cc_ortagonal spacing (if multiple columns) - moved below concrete shape
    if (inputs.nVOrtagonal > 1) {
        const dimY = offsetY + totalHeight * scale + dimOffset + 25; // Below other dimensions
        const startX = offsetX + inputs.a2v * scale;
        g.append('line')
            .attr('x1', startX)
            .attr('y1', dimY)
            .attr('x2', startX + inputs.ccOrtagonal * scale)
            .attr('y2', dimY)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 1);

        g.append('text')
            .attr('x', startX + (inputs.ccOrtagonal * scale) / 2)
            .attr('y', dimY + 15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#ef4444')
            .text(`cc_ort = ${inputs.ccOrtagonal}`);
    }

    // cc_parallel spacing (if multiple rows)
    if (inputs.nVParallel > 1) {
        const dimX = offsetX + totalWidth * scale + dimOffset;
        const startY = offsetY + inputs.a1 * scale;
        g.append('line')
            .attr('x1', dimX)
            .attr('y1', startY)
            .attr('x2', dimX)
            .attr('y2', startY + inputs.ccParallel * scale)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 1);

        g.append('text')
            .attr('x', dimX + 5)
            .attr('y', startY + (inputs.ccParallel * scale) / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#ef4444')
            .attr('transform', `rotate(-90, ${dimX + 5}, ${startY + (inputs.ccParallel * scale) / 2})`)
            .text(`cc_par = ${inputs.ccParallel}`);
    }

    // Legend - moved to upper right corner (responsive positioning)
    const legend = g.append('g')
        .attr('transform', `translate(${Math.max(width - 140, 10)}, 10)`);

    // Legend background
    legend.append('rect')
        .attr('x', -5)
        .attr('y', -5)
        .attr('width', 135)
        .attr('height', 50)
        .attr('fill', 'white')
        .attr('stroke', '#d1d5db')
        .attr('stroke-width', 1)
        .attr('rx', 3)
        .attr('opacity', 0.9);

    legend.append('circle')
        .attr('cx', 10)
        .attr('cy', 10)
        .attr('r', 5)
        .attr('fill', '#ef4444');

    legend.append('text')
        .attr('x', 20)
        .attr('y', 15)
        .attr('font-size', '11px')
        .attr('fill', '#374151')
        .text(`Dowels (φ${inputs.dowelDiameter}mm)`);

    legend.append('rect')
        .attr('x', 5)
        .attr('y', 25)
        .attr('width', 10)
        .attr('height', 10)
        .attr('fill', '#e5e7eb')
        .attr('stroke', '#374151');

    legend.append('text')
        .attr('x', 20)
        .attr('y', 35)
        .attr('font-size', '11px')
        .attr('fill', '#374151')
        .text('Concrete');
}

// Toggle detailed report visibility
function toggleReport() {
    const report = document.getElementById('detailed-report');
    report.classList.toggle('hidden');
}

// Print report function
function printReport() {
    window.print();
}

// Generate detailed calculation report - Built from scratch according to report_spec.md
function generateDetailedReport(results, inputs) {
    try {
        const reportDiv = document.getElementById('detailed-report');
        if (!reportDiv) {
            console.error('Report div not found');
            return;
        }

        // Get user description
        const description = document.getElementById('calc_title').value.trim();

        // Get the SVG plot
        const plotSvg = document.getElementById('geometry-plot').querySelector('svg');
        let plotHTML = '';
        if (plotSvg) {
            plotHTML = plotSvg.outerHTML;
        }

        // Utilization color function
        const getUtilColor = (util) => {
            if (util > 1.0) return 'text-red-900';
            if (util > 0.85) return 'text-yellow-900';
            return 'text-green-900';
        };

        const vcColor = getUtilColor(results.vc);
        const vsColor = getUtilColor(results.vs);
        const msColor = getUtilColor(results.ms);

        // Build report HTML according to spec
        const reportHTML = `
            <div class="report-content bg-white text-gray-900 p-8 rounded-lg">

                ${description ? `
                    <div class="mb-6 pb-4 border-b-2 border-gray-300">
                        <h2 class="text-2xl font-bold text-gray-800 mb-2">Calculation Description</h2>
                        <p class="text-gray-800 whitespace-pre-wrap">${description}</p>
                    </div>
                ` : ''}

                <div class="mb-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">Concrete Dowels Calculation</h2>
                    <p class="text-sm text-gray-600">According to Norwegian "Betongelementboken"</p>
                    <p class="text-sm text-gray-600">Calculation Date: ${new Date().toLocaleString()}</p>
                </div>

                <!-- INPUT PARAMETERS -->
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-blue-700 mb-3 border-b-2 border-blue-300 pb-1">INPUT PARAMETERS</h3>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-2">Load Parameters</h4>
                            <p class="text-gray-800">V<sub>Ed</sub> = ${toFixedIfNeeded(inputs.VEd, 1)} kN</p>
                            <p class="text-gray-800">f<sub>dowel</sub> = ${inputs.fdybel}</p>
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-2">Material Properties</h4>
                            <p class="text-gray-800">f<sub>ck</sub> = ${inputs.fck} MPa</p>
                            <p class="text-gray-800">f<sub>yk</sub> = ${inputs.fyk} MPa</p>
                            <p class="text-gray-800">α<sub>cc</sub> = ${inputs.alphaCc}</p>
                            <p class="text-gray-800">γ<sub>c</sub> = ${inputs.gammaC}</p>
                            <p class="text-gray-800">γ<sub>s</sub> = ${inputs.gammaS}</p>
                            <p class="text-gray-800">n-factor = ${inputs.nFactor}</p>
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-2">Dowel Configuration</h4>
                            <p class="text-gray-800">Diameter = ${inputs.dowelDiameter} mm</p>
                            <p class="text-gray-800">n<sub>V,parallel</sub> = ${inputs.nVParallel}</p>
                            <p class="text-gray-800">c/c<sub>parallel</sub> = ${inputs.ccParallel} mm</p>
                            <p class="text-gray-800">n<sub>V,ortagonal</sub> = ${inputs.nVOrtagonal}</p>
                            <p class="text-gray-800">c/c<sub>ortagonal</sub> = ${inputs.ccOrtagonal} mm</p>
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-2">Edge Distances</h4>
                            <p class="text-gray-800">Eccentricity = ${inputs.eccentricity} mm</p>
                            <p class="text-gray-800">a<sub>1</sub> = ${inputs.a1} mm</p>
                            <p class="text-gray-800">a<sub>2,h</sub> = ${inputs.a2h} mm</p>
                            <p class="text-gray-800">a<sub>2,v</sub> = ${inputs.a2v} mm</p>
                        </div>
                    </div>
                </div>

                <!-- PLOT -->
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-yellow-700 mb-3 border-b-2 border-yellow-300 pb-1">PLOT</h3>
                    <div class="w-full bg-white">
                        ${plotHTML}
                    </div>
                </div>

                <!-- RESULTS SUMMARY -->
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-green-700 mb-3 border-b-2 border-green-300 pb-1">RESULTS SUMMARY</h3>

                    <div class="bg-blue-50 p-4 mb-4">
                        <div class="text-3xl font-bold text-blue-900">V<sub>Rd</sub> = ${toFixedIfNeeded(results.VRd, 1)} kN</div>
                        <div class="text-sm text-blue-700 mt-1">Shear Capacity of Dowel Group</div>
                    </div>

                    <div class="grid grid-cols-3 gap-4 text-sm">
                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Concrete Utilization</h4>
                            <p class="text-2xl font-bold ${vcColor}">${toFixedIfNeeded(results.vc * 100, 1)}%</p>
                            <p class="text-xs text-gray-600">v<sub>c</sub> = V<sub>Ed</sub> / V<sub>Rd</sub></p>
                        </div>
                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Steel Utilization</h4>
                            <p class="text-2xl font-bold ${vsColor}">${toFixedIfNeeded(results.vs * 100, 1)}%</p>
                            <p class="text-xs text-gray-600">v<sub>s</sub> = V<sub>Ed</sub> / V<sub>Rd,s</sub></p>
                        </div>
                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Bending Utilization</h4>
                            <p class="text-2xl font-bold ${msColor}">${toFixedIfNeeded(results.ms * 100, 1)}%</p>
                            <p class="text-xs text-gray-600">m<sub>s</sub> = M<sub>max</sub> / M<sub>Rd,s0</sub></p>
                        </div>
                    </div>
                </div>

                <!-- DETAILED CALCULATIONS -->
                <div class="page-break-before">
                    <h3 class="text-xl font-bold text-purple-700 mb-4 border-b-2 border-purple-300 pb-1">DETAILED CALCULATIONS</h3>

                    <div class="space-y-4 text-sm">
                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Basic Calculations</h4>
                            <p class="text-gray-800">n<sub>V,tot</sub> = n<sub>V,parallel</sub> × n<sub>V,ortagonal</sub> = ${inputs.nVParallel} × ${inputs.nVOrtagonal} = ${results.nVTot}</p>
                            <p class="text-gray-800">A<sub>s</sub> = π × ø² / 4 = π × ${inputs.dowelDiameter}² / 4 = ${toFixedIfNeeded(results.As, 1)} mm²</p>
                            <p class="text-gray-800">f<sub>cd</sub> = α<sub>cc</sub> × f<sub>ck</sub> / γ<sub>c</sub> = ${inputs.alphaCc} × ${inputs.fck} / ${inputs.gammaC} = ${toFixedIfNeeded(results.fcd, 2)} MPa</p>
                            <p class="text-gray-800">f<sub>yd</sub> = f<sub>yk</sub> / γ<sub>s</sub> = ${inputs.fyk} / ${inputs.gammaS} = ${toFixedIfNeeded(results.fyd, 2)} MPa</p>
                            <p class="text-gray-800">σ<sub>cd</sub> = 3 × f<sub>cd</sub> = 3 × ${toFixedIfNeeded(results.fcd, 2)} = ${toFixedIfNeeded(results.sigmaCD, 2)} MPa</p>
                        </div>

                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Steel Shear Capacity</h4>
                            <p class="text-gray-800">V<sub>Rd,s</sub> = (n<sub>V,tot</sub> × A<sub>s</sub> × f<sub>yd</sub>) / √3 = ${toFixedIfNeeded(results.VRdS, 1)} kN</p>
                        </div>

                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Plastic Moment Capacity</h4>
                            <p class="text-gray-800">M<sub>Rd,s0</sub> = f<sub>yd</sub> × ø³ / 6 = ${toFixedIfNeeded(results.fyd, 2)} × ${inputs.dowelDiameter}³ / 6 = ${toFixedIfNeeded(results.MRdS0, 3)} kNm</p>
                        </div>

                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Concrete Shear Capacity (Single Dowel)</h4>
                            <p class="text-gray-800">V<sub>Rd,e</sub> = 1.5 × √((f<sub>cd</sub> × e × ø)² + f<sub>cd</sub> × f<sub>yd</sub> × ø⁴) - 1.5 × f<sub>cd</sub> × e × ø</p>
                            <p class="text-gray-800">V<sub>Rd,e</sub> = ${toFixedIfNeeded(results.VRdE, 2)} kN</p>
                            <p class="text-gray-800">V<sub>Rd,c0</sub> = V<sub>Rd,e</sub> = ${toFixedIfNeeded(results.VRdC0, 2)} kN</p>
                        </div>

                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Distance Factors</h4>
                            <p class="text-gray-800">k<sub>a</sub> = (min(n×ø, a<sub>1</sub>) - ø) / (n×ø - ø) = ${toFixedIfNeeded(results.ka, 3)}</p>
                            <p class="text-gray-800">k<sub>s</sub> = (a<sub>2,v</sub> + (n<sub>V,ort</sub>-1)×cc<sub>ort</sub> + a<sub>2,h</sub>) / (3×min(n×ø, a<sub>1</sub>)) = ${toFixedIfNeeded(results.ks, 3)}</p>
                            <p class="text-gray-800">k = min(n<sub>V,ortagonal</sub>, k<sub>a</sub> × k<sub>s</sub>) = ${toFixedIfNeeded(results.k, 3)}</p>
                            <p class="text-gray-800">ψ<sub>f,V</sub> = ${toFixedIfNeeded(results.psiFV, 3)}</p>
                        </div>

                        <div class="bg-blue-50 p-3 rounded border border-blue-300">
                            <h4 class="font-semibold text-blue-900 mb-2">Final Shear Capacity</h4>
                            <p class="font-bold text-gray-800">V<sub>Rd</sub> = f<sub>dowel</sub> × k × ψ<sub>f,V</sub> × V<sub>Rd,c0</sub></p>
                            <p class="font-bold text-gray-800">V<sub>Rd</sub> = ${inputs.fdybel} × ${toFixedIfNeeded(results.k, 3)} × ${toFixedIfNeeded(results.psiFV, 3)} × ${toFixedIfNeeded(results.VRdC0, 2)} = ${toFixedIfNeeded(results.VRd, 1)} kN</p>
                        </div>

                        <div class="bg-gray-50 p-3 rounded">
                            <h4 class="font-semibold text-gray-800 mb-2">Utilization Checks</h4>
                            <p class="text-gray-800">Concrete: v<sub>c</sub> = V<sub>Ed</sub> / V<sub>Rd</sub> = ${toFixedIfNeeded(inputs.VEd, 1)} / ${toFixedIfNeeded(results.VRd, 1)} = ${toFixedIfNeeded(results.vc * 100, 1)}%</p>
                            <p class="text-gray-800">Steel: v<sub>s</sub> = V<sub>Ed</sub> / V<sub>Rd,s</sub> = ${toFixedIfNeeded(inputs.VEd, 1)} / ${toFixedIfNeeded(results.VRdS, 1)} = ${toFixedIfNeeded(results.vs * 100, 1)}%</p>
                            <p class="text-gray-800">Bending: m<sub>s</sub> = M<sub>max</sub> / M<sub>Rd,s0</sub> = ${toFixedIfNeeded(results.Mmax, 3)} / ${toFixedIfNeeded(results.MRdS0, 3)} = ${toFixedIfNeeded(results.ms * 100, 1)}%</p>
                        </div>
                    </div>
                </div>

            </div>
        `;

        reportDiv.innerHTML = reportHTML;
        console.log('Report generated successfully');
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report: ' + error.message);
    }
}

// Initialize calculations on page load
document.addEventListener('DOMContentLoaded', function() {
    updateSteelProperties();
    updateConcreteProperties();
    updateDowelArea();
    calculateAndShow();
});