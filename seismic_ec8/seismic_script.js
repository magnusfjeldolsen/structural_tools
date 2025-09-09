/**
 * EC8 Seismic Avoidance Criteria Calculator - Main Script
 * Based on Eurocode 8 (EN 1998-1) standards
 */

// Utility functions
function toFixedIfNeeded(num, digits = 2) {
    return parseFloat(num.toFixed(digits));
}

// Seismic class to gamma_I mapping (Table NA.4 from Norwegian National Annex)
const GAMMA_I_VALUES = {
    'I': 0.8,
    'II': 1.0,
    'IIIa': 1.2,
    'IIIb': 1.2,
    'IV': 1.4
};

// Soil factor values by ground type (typical EC8 values)
const SOIL_FACTORS = {
    'A': 1.0,
    'B': 1.2,
    'C': 1.15,
    'D': 1.35,
    'E': 1.4
};

// Ct values for different structure types
const CT_VALUES = {
    'steel': 0.085,
    'concrete': 0.075,
    'other': 0.05
};

// Response spectrum parameters from EC8 Table 3.2 and 3.3
const SPECTRUM_PARAMETERS = {
    '1': { // Type 1 spectrum (Ms > 5.5)
        'A': { S: 1.0, TB: 0.15, TC: 0.4, TD: 2.0 },
        'B': { S: 1.2, TB: 0.15, TC: 0.5, TD: 2.0 },
        'C': { S: 1.15, TB: 0.20, TC: 0.6, TD: 2.0 },
        'D': { S: 1.35, TB: 0.20, TC: 0.8, TD: 2.0 },
        'E': { S: 1.4, TB: 0.15, TC: 0.5, TD: 2.0 }
    },
    '2': { // Type 2 spectrum (Ms ≤ 5.5)
        'A': { S: 1.0, TB: 0.05, TC: 0.25, TD: 1.2 },
        'B': { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 },
        'C': { S: 1.5, TB: 0.10, TC: 0.25, TD: 1.2 },
        'D': { S: 1.8, TB: 0.10, TC: 0.30, TD: 1.2 },
        'E': { S: 1.6, TB: 0.05, TC: 0.25, TD: 1.2 }
    }
};

// Update gamma_I based on seismic class selection
function updateGammaI() {
    const seismicClass = document.getElementById('seismic_class')?.value;
    const gammaIInput = document.getElementById('gamma_I');
    
    if (seismicClass && gammaIInput && GAMMA_I_VALUES[seismicClass]) {
        gammaIInput.value = GAMMA_I_VALUES[seismicClass];
        console.log('Updated gamma_I for seismic class', seismicClass, ':', GAMMA_I_VALUES[seismicClass]);
        updateCalculatedValues();
    }
}

// Update spectrum parameters based on spectrum type and ground type
function updateSpectrumParameters() {
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const soilFactorInput = document.getElementById('S');
    const soilFactorDisplay = document.getElementById('S_display');
    
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    // Update both hidden input and display
    soilFactorInput.value = params.S;
    soilFactorDisplay.textContent = params.S;
    
    // Update table reference
    const tableRef = document.querySelector('#S_display').nextElementSibling;
    tableRef.textContent = `(from Table 3.${spectrumType === '1' ? '2' : '3'})`;
    
    updateCalculatedValues();
}

// Update Ct based on structure type
function updateCt() {
    const ctMethod = document.getElementById('ct_method').value;
    const ctInput = document.getElementById('ct');
    
    if (ctMethod !== 'custom') {
        ctInput.value = CT_VALUES[ctMethod];
        ctInput.disabled = true;
        ctInput.style.backgroundColor = '#374151';
    } else {
        ctInput.disabled = false;
        ctInput.style.backgroundColor = '#4b5563';
    }
    updateCalculatedValues();
}

// Toggle between manual and simplified Sd method
function toggleSdMethod() {
    const method = document.getElementById('sd_method').value;
    const manualInput = document.getElementById('manual_sd_input');
    const simplifiedInputs = document.getElementById('simplified_inputs');
    
    if (method === 'manual') {
        manualInput.style.display = 'flex';
        simplifiedInputs.style.display = 'none';
    } else {
        manualInput.style.display = 'none';
        simplifiedInputs.style.display = 'block';
    }
    updateCalculatedValues();
}

// Update calculated values in real-time
function updateCalculatedValues() {
    const agr = parseFloat(document.getElementById('agr').value) || 0;
    const gammaI = parseFloat(document.getElementById('gamma_I').value) || 1.0;
    const S = parseFloat(document.getElementById('S').value) || 1.2;
    const h = parseFloat(document.getElementById('h').value) || 20;
    const ct = parseFloat(document.getElementById('ct').value) || 0.075;
    
    // Calculate ag
    const ag = agr * gammaI;
    document.getElementById('ag_display').textContent = toFixedIfNeeded(ag);
    
    // Calculate ag*S
    const agS = ag * S;
    document.getElementById('ags_display').textContent = toFixedIfNeeded(agS);
    
    // Calculate T1 for simplified method
    const T1 = ct * Math.pow(h, 0.75);
    document.getElementById('t1_display').textContent = toFixedIfNeeded(T1, 3);
    
    // Calculate Sd for simplified method
    if (document.getElementById('sd_method').value === 'simplified') {
        const Sd = calculateSd(T1, ag, S);
        document.getElementById('sd_display').textContent = toFixedIfNeeded(Sd);
    } else {
        const SdManual = parseFloat(document.getElementById('sd_manual').value) || 0;
        document.getElementById('sd_display').textContent = toFixedIfNeeded(SdManual);
    }
    
    // Update parameter summary
    updateParameterSummary();
    
    // Update spectrum plot in real-time
    const spectrumData = generateSpectrumData(ag, S);
    if (spectrumData.length > 0) {
        const Sd_T1 = calculateSd(T1, ag, S);
        createSpectrumPlot(spectrumData, T1, Sd_T1);
    }
}

// Update parameter summary display
function updateParameterSummary() {
    const spectrumType = document.getElementById('spectrum_type')?.value || '2';
    const groundType = document.getElementById('ground_type')?.value || 'B';
    const seismicClass = document.getElementById('seismic_class')?.value || 'II';
    const gammaI = parseFloat(document.getElementById('gamma_I')?.value) || 1.0;
    const agr = parseFloat(document.getElementById('agr')?.value) || 0.7;
    const q = parseFloat(document.getElementById('q')?.value) || 1.5;
    
    // Get spectrum parameters
    let params = { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 }; // defaults
    if (SPECTRUM_PARAMETERS && SPECTRUM_PARAMETERS[spectrumType] && SPECTRUM_PARAMETERS[spectrumType][groundType]) {
        params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    }
    
    const ag = agr * gammaI;
    const agS = ag * params.S;
    
    const parameterHTML = `
        <div class="space-y-2">
            <div class="font-semibold text-blue-300">Seismic Parameters</div>
            <div>Seismic Class: <span class="text-green-400">${seismicClass}</span></div>
            <div>γ<sub>I</sub>: <span class="text-green-400">${toFixedIfNeeded(gammaI, 1)}</span></div>
            <div>a<sub>gR</sub>: <span class="text-green-400">${toFixedIfNeeded(agr, 1)} m/s²</span></div>
            <div>a<sub>g</sub>: <span class="text-green-400">${toFixedIfNeeded(ag)} m/s²</span></div>
            <div>q: <span class="text-green-400">${toFixedIfNeeded(q, 1)}</span></div>
        </div>
        <div class="space-y-2">
            <div class="font-semibold text-yellow-300">Spectrum Parameters</div>
            <div>Type: <span class="text-green-400">${spectrumType === '1' ? 'Type 1 (Ms > 5.5)' : 'Type 2 (Ms ≤ 5.5)'}</span></div>
            <div>Ground Type: <span class="text-green-400">${groundType}</span></div>
            <div>S: <span class="text-green-400">${toFixedIfNeeded(params.S, 2)}</span></div>
            <div>a<sub>g</sub>·S: <span class="text-green-400">${toFixedIfNeeded(agS)} m/s²</span></div>
        </div>
        <div class="space-y-2">
            <div class="font-semibold text-red-300">Period Parameters</div>
            <div>T<sub>B</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TB, 2)} s</span></div>
            <div>T<sub>C</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TC, 2)} s</span></div>
            <div>T<sub>D</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TD, 1)} s</span></div>
        </div>
    `;
    
    const summaryElement = document.getElementById('parameter-details');
    if (summaryElement) {
        summaryElement.innerHTML = parameterHTML;
    }
}

// Calculate Sd(T) for a specific period (used for hover functionality)
function calculateSdAtPeriod(T, ag, S, spectrumType, groundType) {
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    // EC8 parameters from Table H.2.4
    const q = 1.0;   // Behavior factor (for elastic analysis)
    const TB = params.TB;
    const TC = params.TC;
    const TD = params.TD;
    
    let Sd;
    
    if (T >= 0 && T <= TB) {
        // Branch 1: 0 ≤ T ≤ TB (EC8 formula)
        Sd = ag * S * (2/3 + (T / TB) * (2.5/q - 2/3));
    } else if (T > TB && T <= TC) {
        // Branch 2: TB < T ≤ TC (EC8 formula)
        Sd = ag * S * (2.5 / q);
    } else if (T > TC && T <= TD) {
        // Branch 3: TC < T ≤ TD (EC8 formula with limit)
        Sd = Math.max(ag * S * 2.5 * (TC / T) / q, 0.2 * ag);
    } else {
        // Branch 4: T > TD (EC8 formula with limit)
        Sd = Math.max(ag * S * 2.5 * (TC * TD) / (T * T) / q, 0.2 * ag);
    }
    
    return Sd;
}

// Calculate Sd(T) according to EC8 response spectrum
function calculateSd(T, ag, S) {
    // Get spectrum parameters based on current selection
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const q = parseFloat(document.getElementById('q').value) || 1.5;
    
    return calculateSdAtPeriod(T, ag, S, spectrumType, groundType) / q;
}

// Generate response spectrum data for plotting
function generateSpectrumData(ag, S) {
    // Get spectrum parameters based on current selection
    const spectrumType = document.getElementById('spectrum_type')?.value || '2';
    const groundType = document.getElementById('ground_type')?.value || 'B';
    
    if (!SPECTRUM_PARAMETERS || !SPECTRUM_PARAMETERS[spectrumType] || !SPECTRUM_PARAMETERS[spectrumType][groundType]) {
        console.error('SPECTRUM_PARAMETERS not available for plotting:', { spectrumType, groundType });
        return [];
    }
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    const data = [];
    const q = parseFloat(document.getElementById('q')?.value) || 1.5;   // Behavior factor from user input
    const TB = params.TB;
    const TC = params.TC;
    const TD = params.TD;
    
    // Generate points for smooth curve using the same calculation function
    for (let T = 0.01; T <= 4.0; T += 0.01) {
        const Sd = calculateSdAtPeriod(T, ag, S, spectrumType, groundType);
        data.push({ T: T, Sd: Sd });
    }
    
    return data;
}

// Create D3.js plot for response spectrum
function createSpectrumPlot(spectrumData, T1, Sd_T1) {
    // Clear previous plot
    d3.select("#spectrum-plot").selectAll("*").remove();
    
    // Set dimensions and margins
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = Math.min(800, window.innerWidth - 100) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select("#spectrum-plot")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);
    
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Set scales
    const xScale = d3.scaleLinear()
        .domain([0, 4])
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(spectrumData, d => d.Sd) * 1.1])
        .range([height, 0]);
    
    // Create line generator
    const line = d3.line()
        .x(d => xScale(d.T))
        .y(d => yScale(d.Sd))
        .curve(d3.curveMonotoneX);
    
    // Add axes
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .append("text")
        .attr("x", width / 2)
        .attr("y", 35)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .text("Period T (s)");
    
    g.append("g")
        .call(d3.axisLeft(yScale))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -40)
        .attr("x", -height / 2)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .text("Sd(T) (m/s²)");
    
    // Add grid lines
    g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-height)
            .tickFormat("")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3);
    
    g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat("")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3);
    
    // Add response spectrum curve
    g.append("path")
        .datum(spectrumData)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2)
        .attr("d", line);
    
    // Add point for T1, Sd(T1)
    g.append("circle")
        .attr("cx", xScale(T1))
        .attr("cy", yScale(Sd_T1))
        .attr("r", 6)
        .attr("fill", "#ef4444")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);
    
    // Add labels for the point
    g.append("text")
        .attr("x", xScale(T1) + 10)
        .attr("y", yScale(Sd_T1) - 10)
        .attr("fill", "#ef4444")
        .style("font-weight", "bold")
        .text(`T₁=${toFixedIfNeeded(T1, 3)}s`);
    
    g.append("text")
        .attr("x", xScale(T1) + 10)
        .attr("y", yScale(Sd_T1) + 5)
        .attr("fill", "#ef4444")
        .style("font-weight", "bold")
        .text(`Sd=${toFixedIfNeeded(Sd_T1)}m/s²`);
    
    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background", "rgba(0, 0, 0, 0.8)")
        .style("color", "white")
        .style("padding", "8px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("z-index", "1000");
    
    // Add invisible overlay for mouse tracking
    const overlay = g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .on("mouseover", function() {
            tooltip.style("opacity", 1);
            crosshair.style("opacity", 1);
        })
        .on("mouseout", function() {
            tooltip.style("opacity", 0);
            crosshair.style("opacity", 0);
        })
        .on("mousemove", function(event) {
            const [mouseX, mouseY] = d3.pointer(event);
            const T = xScale.invert(mouseX);
            
            // Calculate Sd(T) for this period
            const spectrumType = document.getElementById('spectrum_type').value;
            const groundType = document.getElementById('ground_type').value;
            const ag = parseFloat(document.getElementById('ag_display').textContent);
            const S = parseFloat(document.getElementById('S').value);
            const SdAtT = calculateSdAtPeriod(T, ag, S, spectrumType, groundType);
            
            // Update crosshair position
            crosshair.select(".crosshair-x")
                .attr("y1", yScale(SdAtT))
                .attr("y2", height);
            crosshair.select(".crosshair-y")
                .attr("x1", 0)
                .attr("x2", mouseX);
            crosshair.select(".crosshair-circle")
                .attr("cx", mouseX)
                .attr("cy", yScale(SdAtT));
            
            // Update tooltip
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px")
                .html(`<strong>T = ${T.toFixed(3)} s</strong><br/>Sd(T) = ${SdAtT.toFixed(3)} m/s²`);
        });
    
    // Add crosshair group
    const crosshair = g.append("g")
        .attr("class", "crosshair")
        .style("opacity", 0);
    
    crosshair.append("line")
        .attr("class", "crosshair-x")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    
    crosshair.append("line")
        .attr("class", "crosshair-y")
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    
    crosshair.append("circle")
        .attr("class", "crosshair-circle")
        .attr("r", 4)
        .attr("fill", "#ff6b6b")
        .attr("stroke", "white")
        .attr("stroke-width", 2);
    
    // Add title
    g.append("text")
        .attr("x", width / 2)
        .attr("y", -5)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .style("font-weight", "bold")
        .text("EC8 Elastic Response Spectrum - Hover for Sd(T) values");
}

// Main seismic calculation function
function calculateSeismic() {
    try {
        // Get input values
        const place = document.getElementById('place').value.trim();
        const seismicClass = document.getElementById('seismic_class').value;
        const spectrumType = document.getElementById('spectrum_type').value;
        const structureLife = parseFloat(document.getElementById('structure_life').value);
        const gammaI = parseFloat(document.getElementById('gamma_I').value);
        const groundType = document.getElementById('ground_type').value;
        const agr = parseFloat(document.getElementById('agr').value);
        const S = parseFloat(document.getElementById('S').value);
        const sdMethod = document.getElementById('sd_method').value;
        
        // Calculate basic seismic parameters
        const ag = agr * gammaI;
        const agS = ag * S;
        
        // Calculate Sd
        let Sd, T1;
        if (sdMethod === 'manual') {
            Sd = parseFloat(document.getElementById('sd_manual').value) || 0;
            T1 = 1.0; // Default for plotting
        } else {
            const h = parseFloat(document.getElementById('h').value);
            const ct = parseFloat(document.getElementById('ct').value);
            T1 = ct * Math.pow(h, 0.75);
            Sd = calculateSd(T1, ag, S);
        }
        
        // Check seismic design requirements
        const requirements = checkSeismicRequirements(seismicClass, groundType, agS, ag, structureLife, Sd);
        
        // Generate spectrum data for plotting
        const spectrumData = generateSpectrumData(ag, S);
        
        // Display results
        displaySeismicResults({
            place, seismicClass, spectrumType, structureLife, gammaI, groundType, agr, S, ag, agS,
            sdMethod, T1, Sd, requirements, spectrumData
        });
        
    } catch (error) {
        alert('Calculation failed: ' + error.message);
    }
}

// Check if seismic design is required according to EC8
function checkSeismicRequirements(seismicClass, groundType, agS, ag, structureLife, Sd) {
    const checks = [];
    let designRequired = true;
    let passedCriteria = [];
    let failedCriteria = [];
    
    // Check 1: Seismic class I
    const check1 = {
        condition: "Seismic class = I",
        criterion: "Class I structures"
    };
    if (seismicClass === 'I') {
        check1.result = "❌ No seismic design required";
        check1.passes = true;
        designRequired = false;
        passedCriteria.push("Seismic class I");
    } else {
        check1.result = `✓ Class ${seismicClass} (design may be required)`;
        check1.passes = false;
        failedCriteria.push("Seismic class ≠ I");
    }
    checks.push(check1);
    
    // Check 2: agS ≤ 0.5 m/s² for ground types A-E
    const check2 = {
        condition: "Ground type A-E and agS ≤ 0.5 m/s²",
        criterion: "Low soil-amplified acceleration"
    };
    if (['A', 'B', 'C', 'D', 'E'].includes(groundType) && agS <= 0.5) {
        check2.result = `❌ agS = ${toFixedIfNeeded(agS)} ≤ 0.5 m/s²`;
        check2.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("agS ≤ 0.5 m/s²");
        }
    } else {
        check2.result = `✓ agS = ${toFixedIfNeeded(agS)} > 0.5 m/s² (design may be required)`;
        check2.passes = false;
        failedCriteria.push("agS > 0.5 m/s²");
    }
    checks.push(check2);
    
    // Check 3: ag ≤ 0.3 m/s² for ground types A-E
    const check3 = {
        condition: "Ground type A-E and ag ≤ 0.3 m/s²",
        criterion: "Low ground acceleration"
    };
    if (['A', 'B', 'C', 'D', 'E'].includes(groundType) && ag <= 0.3) {
        check3.result = `❌ ag = ${toFixedIfNeeded(ag)} ≤ 0.3 m/s²`;
        check3.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("ag ≤ 0.3 m/s²");
        }
    } else {
        check3.result = `✓ ag = ${toFixedIfNeeded(ag)} > 0.3 m/s² (design may be required)`;
        check3.passes = false;
        failedCriteria.push("ag > 0.3 m/s²");
    }
    checks.push(check3);
    
    // Check 4: Structure life ≤ 2 years
    const check4 = {
        condition: "Structure life ≤ 2 years",
        criterion: "Temporary structure"
    };
    if (structureLife <= 2) {
        check4.result = `❌ Life = ${structureLife} years ≤ 2`;
        check4.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("Structure life ≤ 2 years");
        }
    } else {
        check4.result = `✓ Life = ${structureLife} years > 2 (design may be required)`;
        check4.passes = false;
        failedCriteria.push("Structure life > 2 years");
    }
    checks.push(check4);
    
    // Check 5: Sd ≤ 0.5 m/s² (only if Sd > 0 and not empty)
    const check5 = {
        condition: "Sd ≤ 0.5 m/s²",
        criterion: "Low spectral acceleration"
    };
    if (Sd === 0 || isNaN(Sd) || Sd === null || Sd === undefined) {
        check5.result = `⚠️ Sd = ${Sd || 0} (not evaluated)`;
        check5.passes = null; // Neither passes nor fails
        check5.ignored = true;
    } else if (Sd <= 0.5) {
        check5.result = `❌ Sd = ${toFixedIfNeeded(Sd)} ≤ 0.5 m/s²`;
        check5.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("Sd ≤ 0.5 m/s²");
        }
    } else {
        check5.result = `✓ Sd = ${toFixedIfNeeded(Sd)} > 0.5 m/s² (design may be required)`;
        check5.passes = false;
        failedCriteria.push("Sd > 0.5 m/s²");
    }
    checks.push(check5);
    
    return {
        designRequired,
        passedCriteria,
        failedCriteria,
        checks
    };
}

// Display seismic results
function displaySeismicResults(data) {
    // Update summary
    const requirementResult = document.getElementById('requirement-result');
    const summaryDetails = document.getElementById('summary-details');
    
    if (data.requirements.designRequired) {
        requirementResult.innerHTML = '<span class="text-red-400 text-2xl">⚠️ SEISMIC DESIGN REQUIRED</span>';
        requirementResult.className = 'text-lg font-bold mb-4 p-4 bg-red-900/30 border border-red-500 rounded';
    } else {
        requirementResult.innerHTML = '<span class="text-green-400 text-2xl">✅ NO SEISMIC DESIGN REQUIRED</span>';
        requirementResult.className = 'text-lg font-bold mb-4 p-4 bg-green-900/30 border border-green-500 rounded';
    }
    
    // Add criteria summary
    let criteriaSummary = '';
    if (data.requirements.passedCriteria.length > 0) {
        criteriaSummary += `<p class="text-sm mt-2 text-green-300">✅ <strong>Avoidance criteria met:</strong> ${data.requirements.passedCriteria.join(', ')}</p>`;
    }
    if (data.requirements.failedCriteria.length > 0) {
        criteriaSummary += `<p class="text-sm mt-1 text-red-300">❗ <strong>Criteria requiring design:</strong> ${data.requirements.failedCriteria.join(', ')}</p>`;
    }
    requirementResult.innerHTML += criteriaSummary;
    
    // Summary details
    const spectrumType = document.getElementById('spectrum_type').value;
    summaryDetails.innerHTML = `
        <div>
            <h4 class="font-semibold text-blue-400 mb-2">Location & Parameters</h4>
            <p><span class="text-gray-300">Place:</span> <span class="font-mono text-white">${data.place}</span></p>
            <p><span class="text-gray-300">Seismic Class:</span> <span class="font-mono text-white">${data.seismicClass}</span></p>
            <p><span class="text-gray-300">Spectrum Type:</span> <span class="font-mono text-white">Type ${spectrumType}${spectrumType === '2' ? ' (Norway)' : ''}</span></p>
            <p><span class="text-gray-300">Ground Type:</span> <span class="font-mono text-white">${data.groundType}</span></p>
            <p><span class="text-gray-300">Structure Life:</span> <span class="font-mono text-white">${data.structureLife} years</span></p>
        </div>
        <div>
            <h4 class="font-semibold text-yellow-400 mb-2">Calculated Values</h4>
            <p><span class="text-gray-300">ag:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.ag)} m/s²</span></p>
            <p><span class="text-gray-300">ag·S:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.agS)} m/s²</span></p>
            ${data.sdMethod === 'simplified' ? 
                `<p><span class="text-gray-300">T₁:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.T1, 3)} s</span></p>` : 
                ''}
            <p><span class="text-gray-300">Sd:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.Sd)} m/s²</span></p>
        </div>
    `;
    
    // Create spectrum plot (always show the design spectrum)
    createSpectrumPlot(data.spectrumData, data.T1, data.Sd);
    
    // Add note about manual vs calculated Sd
    const spectrumNote = document.querySelector('#spectrum-plot-container .spectrum-note');
    if (spectrumNote) spectrumNote.remove();
    
    if (data.sdMethod === 'manual') {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'spectrum-note mt-2 text-sm text-yellow-400';
        noteDiv.innerHTML = '📝 <strong>Note:</strong> Design spectrum shown with manual Sd input marked. Hover over spectrum for Sd(T) at any period.';
        document.getElementById('spectrum-plot-container').appendChild(noteDiv);
    } else {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'spectrum-note mt-2 text-sm text-gray-400';
        noteDiv.innerHTML = '🎯 <strong>Calculated:</strong> T₁ and Sd(T₁) calculated from simplified method. Hover for Sd(T) at any period.';
        document.getElementById('spectrum-plot-container').appendChild(noteDiv);
    }
    
    // Detailed calculations
    const calcSteps = document.getElementById('calc-steps');
    calcSteps.innerHTML = createDetailedCalculations(data);
    
    // Show results
    document.getElementById('results').style.display = 'block';
    document.getElementById('print-btn').style.display = 'block';
    
    // Scroll to results
    document.getElementById('results').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Create detailed calculations HTML
function createDetailedCalculations(data) {
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    return `
        <!-- Response Spectrum Parameters -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-purple-300">Response Spectrum Parameters</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">Spectrum Type</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">Type ${spectrumType} ${spectrumType === '2' ? '(Recommended for Norway)' : ''}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">Ground Type</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${groundType}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">T<sub>B</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TB, 3)} s</span>
                    <span class="calc-label ml-6">T<sub>C</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TC, 3)} s</span>
                    <span class="calc-label ml-6">T<sub>D</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TD, 1)} s</span>
                </div>
            </div>
        </div>
        
        <!-- Basic Calculations -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-blue-300">Basic Seismic Parameters</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">S (Soil Factor)</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">From Table 3.${spectrumType === '1' ? '2' : '3'} for ground type ${groundType}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.S)}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">a<sub>g</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">a<sub>gR</sub> × γ<sub>I</sub> = ${toFixedIfNeeded(data.agr)} × ${toFixedIfNeeded(data.gammaI)}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.ag)} m/s²</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">a<sub>g</sub>·S</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">${toFixedIfNeeded(data.ag)} × ${toFixedIfNeeded(data.S)}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.agS)} m/s²</span>
                </div>
            </div>
        </div>
        
        ${data.sdMethod === 'simplified' ? `
        <!-- Period Calculation -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-yellow-300">First Mode Period (Simplified Method)</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">T<sub>1</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">C<sub>t</sub> × h<sup>3/4</sup> = ${toFixedIfNeeded(parseFloat(document.getElementById('ct').value), 3)} × ${data.structureLife !== undefined ? parseFloat(document.getElementById('h').value) : 20}<sup>3/4</sup></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.T1, 3)} s</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">S<sub>d</sub>(T<sub>1</sub>)</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">From response spectrum</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.Sd)} m/s²</span>
                </div>
            </div>
        </div>` : ''}
        
        <!-- Avoidance Criteria Check -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-red-300">Seismic Design Avoidance Criteria</h3>
            </div>
            <div class="calc-content">
                <div class="text-sm text-gray-300 mb-4">
                    Seismic design is NOT required if ANY of the following conditions are met:
                </div>
                ${data.requirements.checks.map((check, index) => `
                    <div class="calc-row ${check.ignored ? 'bg-yellow-900/20' : check.passes ? 'bg-green-900/20' : 'bg-red-900/20'} rounded p-2 mb-2">
                        <span class="calc-label text-sm">${index + 1}. ${check.condition}</span>
                        <span class="calc-value text-sm">${check.result}</span>
                    </div>
                `).join('')}
                
                <div class="calc-separator mt-4"></div>
                <div class="calc-row">
                    <span class="calc-label text-xl font-bold">Result</span>
                    <span class="calc-value text-xl font-bold ${data.requirements.designRequired ? 'text-red-400' : 'text-green-400'}">
                        ${data.requirements.designRequired ? 'SEISMIC DESIGN REQUIRED' : 'NO SEISMIC DESIGN REQUIRED'}
                    </span>
                </div>
            </div>
        </div>
    `;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing seismic calculator...');
    console.log('SPECTRUM_PARAMETERS available:', !!SPECTRUM_PARAMETERS);
    
    // Initialize all parameter updates
    updateGammaI();
    updateSpectrumParameters();
    updateCt();
    toggleSdMethod();
    
    // Add event listeners for real-time updates
    ['agr', 'gamma_I', 'h', 'ct', 'sd_manual', 'q'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            console.log('Adding input listener for:', id);
            element.addEventListener('input', updateCalculatedValues);
        }
    });
    
    // Add event listeners for dropdown changes with debugging
    const dropdownUpdates = [
        { id: 'seismic_class', handler: updateGammaI, description: 'seismic class -> gamma_I' },
        { id: 'spectrum_type', handler: updateSpectrumParameters, description: 'spectrum type -> S, TB, TC, TD' },
        { id: 'ground_type', handler: updateSpectrumParameters, description: 'ground type -> S, TB, TC, TD' },
        { id: 'ct_method', handler: updateCt, description: 'ct method -> Ct' },
        { id: 'sd_method', handler: toggleSdMethod, description: 'sd method -> show/hide inputs' }
    ];
    
    // Add listeners for numeric inputs that affect calculations
    const numericInputUpdates = [
        { id: 'q', handler: updateCalculatedValues, description: 'behavior factor -> recalculate Sd' },
        { id: 'agr', handler: updateCalculatedValues, description: 'agR -> ag and calculations' },
        { id: 'gamma_I', handler: updateCalculatedValues, description: 'gamma_I -> ag calculation' },
        { id: 'h', handler: updateCalculatedValues, description: 'height -> T1 calculation' },
        { id: 'ct', handler: updateCalculatedValues, description: 'Ct -> T1 calculation' }
    ];
    
    dropdownUpdates.forEach(({ id, handler, description }) => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`Adding change listener for ${id}: ${description}`);
            element.addEventListener('change', function(event) {
                console.log(`${id} changed to:`, event.target.value);
                handler();
            });
        } else {
            console.warn(`Element not found: ${id}`);
        }
    });
    
    // Add event listeners for numeric inputs
    numericInputUpdates.forEach(({ id, handler, description }) => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`Adding input listener for ${id}: ${description}`);
            element.addEventListener('input', function(event) {
                console.log(`${id} changed to:`, event.target.value);
                handler();
            });
        } else {
            console.warn(`Numeric input element not found: ${id}`);
        }
    });
    
    // Initial calculation
    updateCalculatedValues();
    
    console.log('Seismic calculator initialized successfully');
});