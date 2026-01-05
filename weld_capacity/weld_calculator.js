// Steel grade data from weld.py
const steelWeldData = {
    "S235": {"f_y": 235, "f_u": 360, "beta_w": 0.8},
    "S275": {"f_y": 275, "f_u": 430, "beta_w": 0.85},
    "S355": {"f_y": 355, "f_u": 510, "beta_w": 0.9},
    "S420": {"f_y": 420, "f_u": 520, "beta_w": 1.0},
    "S460": {"f_y": 460, "f_u": 550, "beta_w": 1.0}
};

// Default safety factor (can be overridden by user input)
const default_gamma_M2 = 1.25;

// Global variables to store calculated values
let calculationData = {};
let currentMethod = 'directional'; // 'directional' or 'simplified'

// Math expression evaluator
function evaluateExpression(expr) {
    try {
        // Replace common mathematical expressions
        const cleanExpr = expr.replace(/\s/g, '');
        
        // Simple validation - only allow numbers, basic operators, parentheses
        if (!/^[0-9+\-*/.() ]+$/.test(cleanExpr)) {
            throw new Error('Invalid characters in expression');
        }
        
        // Use Function constructor for safer evaluation than eval
        const result = Function(`"use strict"; return (${cleanExpr})`)();
        
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Result is not a valid number');
        }
        
        return result;
    } catch (error) {
        throw new Error('Invalid mathematical expression');
    }
}

// Update steel properties when grade is selected
function updateSteelProperties() {
    const steelGrade = document.getElementById('steelGrade').value;
    const propertiesDiv = document.getElementById('steelProperties');
    
    if (!steelGrade) {
        propertiesDiv.classList.add('hidden');
        return;
    }
    
    const data = steelWeldData[steelGrade];
    const gammaM2 = parseFloat(document.getElementById('gammaM2').value) || default_gamma_M2;
    const sigma_cr = data.f_u / (data.beta_w * gammaM2);
    
    document.getElementById('propFy').value = data.f_y;
    document.getElementById('propFu').value = data.f_u;
    document.getElementById('propBetaW').value = data.beta_w;
    document.getElementById('propSigmaCr').value = sigma_cr.toFixed(2);
    
    propertiesDiv.classList.remove('hidden');
}

// Update sigma_cr when gamma_M2 changes
function updateGammaM2() {
    const steelGrade = document.getElementById('steelGrade').value;
    if (steelGrade) {
        updateSteelProperties();
    }
}

// Switch between directional and simplified methods
function switchMethod(method) {
    currentMethod = method;

    // Update tab styling
    const tabDirectional = document.getElementById('tab-directional');
    const tabSimplified = document.getElementById('tab-simplified');

    if (method === 'directional') {
        tabDirectional.className = 'px-6 py-2 text-sm font-medium rounded-md transition-colors bg-orange-600 text-white';
        tabSimplified.className = 'px-6 py-2 text-sm font-medium rounded-md transition-colors text-gray-300 hover:text-white';

        // Show/hide sections
        document.getElementById('methodology-directional').classList.remove('hidden');
        document.getElementById('methodology-simplified').classList.add('hidden');
        document.getElementById('forces-directional').classList.remove('hidden');
        document.getElementById('forces-simplified').classList.add('hidden');

        // Hide results
        document.getElementById('quickResults-directional').classList.add('hidden');
        document.getElementById('quickResults-simplified').classList.add('hidden');
        document.getElementById('detailedCalculations').classList.add('hidden');
        document.getElementById('report-section').classList.add('hidden');
    } else {
        tabDirectional.className = 'px-6 py-2 text-sm font-medium rounded-md transition-colors text-gray-300 hover:text-white';
        tabSimplified.className = 'px-6 py-2 text-sm font-medium rounded-md transition-colors bg-orange-600 text-white';

        // Show/hide sections
        document.getElementById('methodology-directional').classList.add('hidden');
        document.getElementById('methodology-simplified').classList.remove('hidden');
        document.getElementById('forces-directional').classList.add('hidden');
        document.getElementById('forces-simplified').classList.remove('hidden');

        // Hide results
        document.getElementById('quickResults-directional').classList.add('hidden');
        document.getElementById('quickResults-simplified').classList.add('hidden');
        document.getElementById('detailedCalculations').classList.add('hidden');
        document.getElementById('report-section').classList.add('hidden');
    }
}

// Add event listener for gamma_M2 input
document.addEventListener('DOMContentLoaded', function() {
    const gammaM2Input = document.getElementById('gammaM2');
    if (gammaM2Input) {
        gammaM2Input.addEventListener('input', updateGammaM2);
    }

    const mathInputs = document.querySelectorAll('.math-input');
    mathInputs.forEach(input => {
        input.addEventListener('input', updateMathInputs);
    });

    // ✅ Preselect S355 on load
    const steelSelect = document.getElementById('steelGrade');
    if (steelSelect) {
        steelSelect.value = "S355";       // set dropdown to S355
        updateSteelProperties();          // trigger the property update immediately
    }
});

// Update math input displays
function updateMathInputs() {
    const mathInputs = document.querySelectorAll('.math-input');
    
    mathInputs.forEach(input => {
        const resultDiv = document.getElementById(input.id + 'Result');
        if (input.value) {
            try {
                const result = evaluateExpression(input.value);
                const unitText = input.nextElementSibling.textContent;
                resultDiv.textContent = `= ${result.toLocaleString()} ${unitText}`;
                resultDiv.style.color = 'var(--accent-green)';
            } catch (error) {
                resultDiv.textContent = `Error: ${error.message}`;
                resultDiv.style.color = 'var(--accent-red)';
            }
        } else {
            resultDiv.textContent = '';
        }
    });
}

// Get evaluated input values with unit conversion
function getInputValue(inputId) {
    const input = document.getElementById(inputId);
    if (!input.value) return 0;
    
    try {
        const result = evaluateExpression(input.value);
        
        // Apply unit conversions
        if (inputId === 'normalForce' || inputId === 'shearForce') {
            return result * 1000; // kN to N
        } else if (inputId === 'moment') {
            return result * 1000000; // kNm to Nmm
        }
        
        return result;
    } catch (error) {
        throw new Error(`Invalid value for ${inputId}: ${error.message}`);
    }
}

// Calculate weld capacity - dispatcher
function calculateWeldCapacity() {
    if (currentMethod === 'directional') {
        calculateDirectionalMethod();
    } else {
        calculateSimplifiedMethod();
    }
}

// Calculate weld capacity - Directional Method
function calculateDirectionalMethod() {
    try {
        // Get input values
        const steelGrade = document.getElementById('steelGrade').value;
        const gammaM2 = parseFloat(document.getElementById('gammaM2').value) || default_gamma_M2;
        const a = parseFloat(document.getElementById('throatThickness').value) || 0;
        const l_weld = parseFloat(document.getElementById('weldLength').value) || 0;
        const N = getInputValue('normalForce');
        const V = getInputValue('shearForce');
        const M = getInputValue('moment');
        
        // Store input values for display (before conversion)
        const N_display = evaluateExpression(document.getElementById('normalForce').value || '0');
        const V_display = evaluateExpression(document.getElementById('shearForce').value || '0');
        const M_display = evaluateExpression(document.getElementById('moment').value || '0');
        
        // Validation
        if (!steelGrade) {
            throw new Error('Please select a steel grade');
        }
        if (a <= 0) {
            throw new Error('Throat thickness must be greater than 0');
        }
        if (l_weld <= 0) {
            throw new Error('Weld length must be greater than 0');
        }
        
        // Get steel properties
        const steelData = steelWeldData[steelGrade];
        const sigma_cr = steelData.f_u / (steelData.beta_w * gammaM2);
        
        // Calculate weld geometry properties
        const A = a * l_weld; // Effective area
        const I_weld = (a * Math.pow(l_weld, 3)) / 12; // Moment of inertia
        
        // Calculate stress components from Normal force (N)
        const sigma_orthogonal_N = N / (Math.sqrt(2) * A);
        const tau_orthogonal_N = N / (Math.sqrt(2) * A);
        const tau_parallel_N = 0;
        
        // Calculate stress components from Shear force (V)  
        const sigma_orthogonal_V = 0;
        const tau_orthogonal_V = 0;
        const tau_parallel_V = V / A;
        
        // Calculate stress components from Moment (M)
        const sigma_orthogonal_M = M / (Math.sqrt(2) * I_weld) * (l_weld / 2);
        const tau_orthogonal_M = M / (Math.sqrt(2) * I_weld) * (l_weld / 2);
        const tau_parallel_M = 0;
        
        // Combined stress components
        const sigma_orthogonal = sigma_orthogonal_N + sigma_orthogonal_V + sigma_orthogonal_M;
        const tau_orthogonal = tau_orthogonal_N + tau_orthogonal_V + tau_orthogonal_M;
        const tau_parallel = tau_parallel_N + tau_parallel_V + tau_parallel_M;
        
        // von Mises stress
        const sigma_von_mises = Math.sqrt(
            Math.pow(sigma_orthogonal, 2) + 
            3 * Math.pow(tau_orthogonal, 2) + 
            3 * Math.pow(tau_parallel, 2)
        );
        
        // Utilization ratio
        const eta = sigma_von_mises / sigma_cr;
        
        // Store calculation data for detailed display
        calculationData = {
            inputs: { steelGrade, gammaM2, a, l_weld, N, V, M, N_display, V_display, M_display },
            steelData: steelData,
            sigma_cr: sigma_cr,
            geometry: { A, I_weld },
            stresses: {
                N: { sigma_orthogonal_N, tau_orthogonal_N, tau_parallel_N },
                V: { sigma_orthogonal_V, tau_orthogonal_V, tau_parallel_V },
                M: { sigma_orthogonal_M, tau_orthogonal_M, tau_parallel_M },
                combined: { sigma_orthogonal, tau_orthogonal, tau_parallel }
            },
            sigma_von_mises: sigma_von_mises,
            eta: eta
        };
        
        // Display quick results
        displayQuickResults();

        // Display detailed calculations
        displayDetailedCalculations();

        // Generate detailed report
        generateDirectionalReport();

        // Show results sections
        document.getElementById('quickResults-directional').classList.remove('hidden');
        document.getElementById('detailedCalculations').classList.remove('hidden');
        document.getElementById('report-section').classList.remove('hidden');
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Calculate weld capacity - Simplified Method (EC3-1-8 4.5.3.3)
function calculateSimplifiedMethod() {
    try {
        // Get input values
        const steelGrade = document.getElementById('steelGrade').value;
        const gammaM2 = parseFloat(document.getElementById('gammaM2').value) || default_gamma_M2;
        const a = parseFloat(document.getElementById('throatThickness').value) || 0;
        const l_weld = parseFloat(document.getElementById('weldLength').value) || 0;

        // F_Ed can be zero or a calculated value
        const appliedForceInput = document.getElementById('appliedForce').value.trim();
        let F_Ed = 0;
        let F_Ed_display = 0;

        if (appliedForceInput) {
            F_Ed = getInputValue('appliedForce');
            F_Ed_display = evaluateExpression(appliedForceInput);
        }

        // Validation
        if (!steelGrade) {
            throw new Error('Please select a steel grade');
        }
        if (a <= 0) {
            throw new Error('Throat thickness must be greater than 0');
        }
        if (l_weld <= 0) {
            throw new Error('Weld length must be greater than 0');
        }
        if (F_Ed < 0) {
            throw new Error('Applied force cannot be negative');
        }

        // Get steel properties
        const steelData = steelWeldData[steelGrade];

        // Calculate design weld shear strength
        // f_vw,d = f_u / (β_w × γ_M2 × √3)
        const f_vw_d = steelData.f_u / (steelData.beta_w * gammaM2 * Math.sqrt(3));

        // Calculate design weld resistance
        // F_w,Rd = a × l_s × f_vw,d (result in N, convert to kN)
        const F_w_Rd_N = a * l_weld * f_vw_d; // in N
        const F_w_Rd = F_w_Rd_N / 1000; // convert to kN

        // Calculate utilization ratio (both in kN)
        const eta = F_Ed / F_w_Rd;

        // Store calculation data for display
        calculationData = {
            inputs: { steelGrade, gammaM2, a, l_weld, F_Ed, F_Ed_display },
            steelData: steelData,
            f_vw_d: f_vw_d,
            F_w_Rd: F_w_Rd,
            F_w_Rd_N: F_w_Rd_N,
            eta: eta
        };

        // Display quick results for simplified method
        displayQuickResultsSimplified();

        // Generate detailed report
        generateSimplifiedReport();

        // Show results sections
        document.getElementById('quickResults-simplified').classList.remove('hidden');
        document.getElementById('report-section').classList.remove('hidden');

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Display quick results for simplified method
function displayQuickResultsSimplified() {
    const data = calculationData;

    document.getElementById('fvwd').textContent = data.f_vw_d.toFixed(2);
    document.getElementById('FwRd').textContent = data.F_w_Rd.toFixed(2);
    document.getElementById('utilizationRatio-simplified').textContent = data.eta.toFixed(3);

    // Color code utilization ratio
    const utilizationElement = document.getElementById('utilizationRatio-simplified');
    if (data.eta > 1.0) {
        utilizationElement.style.color = 'var(--accent-red)';
    } else if (data.eta > 0.8) {
        utilizationElement.style.color = 'orange';
    } else {
        utilizationElement.style.color = 'var(--accent-green)';
    }
}

// Display quick results
function displayQuickResults() {
    const data = calculationData;
    
    document.getElementById('appliedStress').textContent = data.sigma_von_mises.toFixed(2);
    document.getElementById('weldCapacity').textContent = data.sigma_cr.toFixed(2);
    document.getElementById('utilizationRatio').textContent = data.eta.toFixed(3);
    
    // Color code utilization ratio
    const utilizationElement = document.getElementById('utilizationRatio');
    if (data.eta > 1.0) {
        utilizationElement.style.color = 'var(--accent-red)';
    } else if (data.eta > 0.8) {
        utilizationElement.style.color = 'orange';
    } else {
        utilizationElement.style.color = 'var(--accent-green)';
    }
}

// Display detailed calculations
function displayDetailedCalculations() {
    const data = calculationData;
    
    // Material properties
    document.getElementById('materialCalcs').innerHTML = `
        <div class="calc-row">
            <span class="calc-label">Steel grade</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.steelGrade}</span>
        </div>
        <div class="calc-row">
            <span class="calc-label">f<sub>u</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.steelData.f_u}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row">
            <span class="calc-label">β<sub>w</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.steelData.beta_w}</span>
        </div>
        <div class="calc-row">
            <span class="calc-label">γ<sub>M2</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.gammaM2}</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>cr</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">f<sub>u</sub> / (β<sub>w</sub> × γ<sub>M2</sub>) = ${data.steelData.f_u} / (${data.steelData.beta_w} × ${data.inputs.gammaM2}) = ${data.sigma_cr.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
    `;
    
    // Weld geometry
    document.getElementById('geometryCalcs').innerHTML = `
        <div class="calc-row">
            <span class="calc-label">a</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.a}</span>
            <span class="text-gray-400">mm</span>
        </div>
        <div class="calc-row">
            <span class="calc-label">l<sub>weld</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.l_weld}</span>
            <span class="text-gray-400">mm</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">A</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">a × l<sub>weld</sub> = ${data.inputs.a} × ${data.inputs.l_weld} = ${data.geometry.A.toFixed(0)}</span>
            <span class="text-gray-400">mm²</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">I<sub>s</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">a × l<sub>weld</sub>³ / 12 = ${data.inputs.a} × ${data.inputs.l_weld}³ / 12 = ${data.geometry.I_weld.toFixed(0)}</span>
            <span class="text-gray-400">mm⁴</span>
        </div>
    `;
    
    // Normal force stresses
    document.getElementById('normalStressCalcs').innerHTML = `
        <div class="calc-row">
            <span class="calc-label">N</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.N_display.toLocaleString()} kN = ${data.inputs.N.toLocaleString()}</span>
            <span class="text-gray-400">N</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>⊥,N</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">N / (√2 × A) = ${data.inputs.N.toLocaleString()} / (√2 × ${data.geometry.A}) = ${data.stresses.N.sigma_orthogonal_N.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>⊥,N</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">N / (√2 × A) = ${data.inputs.N.toLocaleString()} / (√2 × ${data.geometry.A}) = ${data.stresses.N.tau_orthogonal_N.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>∥,N</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">0</span>
            <span class="text-gray-400">MPa</span>
        </div>
    `;
    
    // Shear force stresses
    document.getElementById('shearStressCalcs').innerHTML = `
        <div class="calc-row">
            <span class="calc-label">V</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.V_display.toLocaleString()} kN = ${data.inputs.V.toLocaleString()}</span>
            <span class="text-gray-400">N</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>⊥,V</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">0</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>⊥,V</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">0</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>∥,V</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">V / A = ${data.inputs.V.toLocaleString()} / ${data.geometry.A} = ${data.stresses.V.tau_parallel_V.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
    `;
    
    // Moment stresses
    document.getElementById('momentStressCalcs').innerHTML = `
        <div class="calc-row">
            <span class="calc-label">M</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${data.inputs.M_display.toLocaleString()} kNm = ${data.inputs.M.toLocaleString()}</span>
            <span class="text-gray-400">Nmm</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>⊥,M</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">M / (√2 × I<sub>s</sub>) × l<sub>weld</sub>/2 = ${data.inputs.M.toLocaleString()} / (√2 × ${data.geometry.I_weld.toFixed(0)}) × ${data.inputs.l_weld}/2 = ${data.stresses.M.sigma_orthogonal_M.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>⊥,M</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">M / (√2 × I<sub>s</sub>) × l<sub>weld</sub>/2 = ${data.inputs.M.toLocaleString()} / (√2 × ${data.geometry.I_weld.toFixed(0)}) × ${data.inputs.l_weld}/2 = ${data.stresses.M.tau_orthogonal_M.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>∥,M</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">0</span>
            <span class="text-gray-400">MPa</span>
        </div>
    `;
    
    // Combined stresses
    document.getElementById('combinedStressCalcs').innerHTML = `
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>⊥</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">σ<sub>⊥,N</sub> + σ<sub>⊥,V</sub> + σ<sub>⊥,M</sub> = ${data.stresses.N.sigma_orthogonal_N.toFixed(2)} + ${data.stresses.V.sigma_orthogonal_V.toFixed(2)} + ${data.stresses.M.sigma_orthogonal_M.toFixed(2)} = ${data.stresses.combined.sigma_orthogonal.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>⊥</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">τ<sub>⊥,N</sub> + τ<sub>⊥,V</sub> + τ<sub>⊥,M</sub> = ${data.stresses.N.tau_orthogonal_N.toFixed(2)} + ${data.stresses.V.tau_orthogonal_V.toFixed(2)} + ${data.stresses.M.tau_orthogonal_M.toFixed(2)} = ${data.stresses.combined.tau_orthogonal.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row highlight">
            <span class="calc-label">τ<sub>∥</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">τ<sub>∥,N</sub> + τ<sub>∥,V</sub> + τ<sub>∥,M</sub> = ${data.stresses.N.tau_parallel_N.toFixed(2)} + ${data.stresses.V.tau_parallel_V.toFixed(2)} + ${data.stresses.M.tau_parallel_M.toFixed(2)} = ${data.stresses.combined.tau_parallel.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
    `;
    
    // von Mises stress and utilization
    document.getElementById('vonMisesCalcs').innerHTML = `
        <div class="calc-row highlight">
            <span class="calc-label">σ<sub>j</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">√(σ<sub>⊥</sub>² + 3×τ<sub>⊥</sub>² + 3×τ<sub>∥</sub>²) = √(${data.stresses.combined.sigma_orthogonal.toFixed(2)}² + 3×${data.stresses.combined.tau_orthogonal.toFixed(2)}² + 3×${data.stresses.combined.tau_parallel.toFixed(2)}²) = ${data.sigma_von_mises.toFixed(2)}</span>
            <span class="text-gray-400">MPa</span>
        </div>
        <div class="calc-row ${data.eta > 1.0 ? 'warning' : 'highlight'}">
            <span class="calc-label">η</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">σ<sub>j</sub> / σ<sub>cr</sub> = ${data.sigma_von_mises.toFixed(2)} / ${data.sigma_cr.toFixed(2)} = ${data.eta.toFixed(3)}</span>
            <span class="text-gray-400">${data.eta > 1.0 ? '⚠️ EXCEEDS CAPACITY' : '✓ OK'}</span>
        </div>
    `;
}

// Generate detailed report for simplified method (matching concrete beam design style)
function generateSimplifiedReport() {
    const data = calculationData;
    const timestamp = new Date().toLocaleString();

    let reportHTML = `
        <div class="report-content bg-white text-gray-900 p-8 rounded-lg">

          <!-- Title -->
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Weld Capacity Calculation Report</h1>
            <p class="text-gray-600">Simplified Method (EC3-1-8 Section 4.5.3.3)</p>
            <p class="text-sm text-gray-500 mt-2">Calculation Date: ${timestamp}</p>
          </div>

          <!-- INPUT PARAMETERS (Blue heading) -->
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #1d4ed8;">INPUT PARAMETERS</h2>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <h3 class="font-semibold text-gray-800 mb-3">Material Properties</h3>
                <div class="space-y-2 text-sm">
                  <div><span class="text-gray-600">Steel Grade =</span> <span class="font-semibold">${data.inputs.steelGrade}</span></div>
                  <div><span class="text-gray-600">Ultimate Strength f<sub>u</sub> =</span> <span class="font-semibold">${data.steelData.f_u} MPa</span></div>
                  <div><span class="text-gray-600">Correlation Factor β<sub>w</sub> =</span> <span class="font-semibold">${data.steelData.beta_w}</span></div>
                  <div><span class="text-gray-600">Safety Factor γ<sub>M2</sub> =</span> <span class="font-semibold">${data.inputs.gammaM2}</span></div>
                  <div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Design Weld Shear Strength f<sub>vw,d</sub> =</span> <span class="font-semibold">${data.f_vw_d.toFixed(2)} MPa</span></div>
                </div>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800 mb-3">Weld Geometry & Loading</h3>
                <div class="space-y-2 text-sm">
                  <div><span class="text-gray-600">Throat Thickness a =</span> <span class="font-semibold">${data.inputs.a} mm</span></div>
                  <div><span class="text-gray-600">Weld Length l<sub>s</sub> =</span> <span class="font-semibold">${data.inputs.l_weld} mm</span></div>
                  <div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Applied Force F<sub>Ed</sub> =</span> <span class="font-semibold">${data.inputs.F_Ed_display.toLocaleString()} kN</span></div>
                  <div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Design Resistance F<sub>w,Rd</sub> =</span> <span class="font-semibold">${data.F_w_Rd.toFixed(2)} kN</span></div>
                </div>
              </div>
            </div>
          </div>

          <!-- RESULTS SUMMARY (Green heading) -->
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #15803d;">RESULTS SUMMARY</h2>

            <div class="bg-blue-100 border-2 border-blue-400 rounded-lg p-6 mb-6 text-center">
              <div class="text-4xl font-bold text-blue-900 mb-2">${data.F_w_Rd.toFixed(2)} kN</div>
              <div class="text-lg text-blue-800">Design Weld Resistance (F<sub>w,Rd</sub>)</div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">
                <div class="text-sm text-gray-600 mb-2">Utilization Ratio</div>
                <div class="text-2xl font-bold ${data.eta > 1.0 ? 'text-red-600' : data.eta > 0.8 ? 'text-orange-500' : 'text-green-600'}">${(data.eta * 100).toFixed(1)}%</div>
                <div class="text-xs text-gray-500 mt-1">F<sub>Ed</sub> / F<sub>w,Rd</sub></div>
              </div>
              <div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">
                <div class="text-sm text-gray-600 mb-2">Status</div>
                <div class="text-2xl font-bold ${data.eta > 1.0 ? 'text-red-600' : 'text-green-600'}">${data.eta > 1.0 ? '⚠️ FAILS' : '✓ PASSES'}</div>
                <div class="text-xs text-gray-500 mt-1">Capacity Check</div>
              </div>
            </div>
          </div>

          <!-- DETAILED CALCULATIONS (Purple heading) -->
          <div class="page-break-before">
            <h2 class="text-2xl font-bold mb-6 pb-2 border-b-2" style="color: #6b21a8;">DETAILED CALCULATIONS</h2>

            <!-- Design Weld Shear Strength -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Design Weld Shear Strength</h3>
              <div class="space-y-3 text-sm">
                <div>
                  <div class="font-medium text-gray-700 mb-1">According to EC3-1-8 Section 4.5.3.3:</div>
                  <div>f<sub>vw,d</sub> = f<sub>u</sub> / (β<sub>w</sub> × γ<sub>M2</sub> × √3)</div>
                  <div>f<sub>vw,d</sub> = ${data.steelData.f_u} / (${data.steelData.beta_w} × ${data.inputs.gammaM2} × √3)</div>
                  <div>f<sub>vw,d</sub> = ${data.steelData.f_u} / ${(data.steelData.beta_w * data.inputs.gammaM2 * Math.sqrt(3)).toFixed(4)}</div>
                  <div>f<sub>vw,d</sub> = <span class="font-semibold">${data.f_vw_d.toFixed(2)} MPa</span></div>
                </div>
              </div>
            </div>

            <!-- Design Weld Resistance -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Design Weld Resistance</h3>
              <div class="space-y-3 text-sm">
                <div>
                  <div class="font-medium text-gray-700 mb-1">Resistance Calculation:</div>
                  <div>F<sub>w,Rd</sub> = a × l<sub>s</sub> × f<sub>vw,d</sub></div>
                  <div>F<sub>w,Rd</sub> = ${data.inputs.a} × ${data.inputs.l_weld} × ${data.f_vw_d.toFixed(2)}</div>
                  <div>F<sub>w,Rd</sub> = <span class="font-semibold">${data.F_w_Rd.toFixed(2)} kN</span></div>
                </div>
              </div>
            </div>

            <!-- Capacity Verification -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Capacity Verification</h3>
              <div class="space-y-2 text-sm">
                <div>Applied force F<sub>Ed</sub> = ${data.inputs.F_Ed.toFixed(2)} kN</div>
                <div>Design resistance F<sub>w,Rd</sub> = ${data.F_w_Rd.toFixed(2)} kN</div>
                <div>Utilization η = F<sub>Ed</sub> / F<sub>w,Rd</sub> = ${data.inputs.F_Ed.toFixed(2)} / ${data.F_w_Rd.toFixed(2)} = <span class="font-semibold ${data.eta > 1.0 ? 'text-red-600' : data.eta > 0.8 ? 'text-orange-500' : 'text-green-600'}">${(data.eta * 100).toFixed(1)}%</span></div>
                <div class="mt-3 p-3 rounded ${data.eta > 1.0 ? 'bg-red-100 border border-red-400' : 'bg-green-100 border border-green-400'}">
                  <span class="font-semibold ${data.eta > 1.0 ? 'text-red-800' : 'text-green-800'}">${data.eta > 1.0 ? '⚠️ CAPACITY EXCEEDED - WELD FAILS' : '✓ CAPACITY OK - WELD PASSES'}</span>
                </div>
              </div>
            </div>

            ${data.eta > 1.0 ? `
            <!-- Recommendations (if failed) -->
            <div class="bg-red-50 border-2 border-red-400 rounded-lg p-6">
              <h3 class="text-lg font-semibold text-red-900 mb-4">⚠️ Recommendations</h3>
              <div class="space-y-2 text-sm text-red-800">
                <p class="font-medium">The weld does not have sufficient capacity. Consider:</p>
                <ul class="list-disc list-inside space-y-1 ml-4">
                  <li>Increase throat thickness (a)</li>
                  <li>Increase weld length (l<sub>s</sub>)</li>
                  <li>Use higher grade steel</li>
                  <li>Reduce applied force</li>
                </ul>
              </div>
            </div>
            ` : ''}
          </div>

        </div>
    `;

    document.getElementById('detailed-report').innerHTML = reportHTML;
}

// Generate detailed report for directional method (matching concrete beam design style)
function generateDirectionalReport() {
    const data = calculationData;
    const timestamp = new Date().toLocaleString();

    let reportHTML = `
        <div class="report-content bg-white text-gray-900 p-8 rounded-lg">

          <!-- Title -->
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Weld Capacity Calculation Report</h1>
            <p class="text-gray-600">Directional Method (von Mises Stress Analysis)</p>
            <p class="text-sm text-gray-500 mt-2">Calculation Date: ${timestamp}</p>
          </div>

          <!-- INPUT PARAMETERS (Blue heading) -->
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #1d4ed8;">INPUT PARAMETERS</h2>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <h3 class="font-semibold text-gray-800 mb-3">Material Properties</h3>
                <div class="space-y-2 text-sm">
                  <div><span class="text-gray-600">Steel Grade =</span> <span class="font-semibold">${data.inputs.steelGrade}</span></div>
                  <div><span class="text-gray-600">Yield Strength f<sub>y</sub> =</span> <span class="font-semibold">${data.steelData.f_y} MPa</span></div>
                  <div><span class="text-gray-600">Ultimate Strength f<sub>u</sub> =</span> <span class="font-semibold">${data.steelData.f_u} MPa</span></div>
                  <div><span class="text-gray-600">Correlation Factor β<sub>w</sub> =</span> <span class="font-semibold">${data.steelData.beta_w}</span></div>
                  <div><span class="text-gray-600">Safety Factor γ<sub>M2</sub> =</span> <span class="font-semibold">${data.inputs.gammaM2}</span></div>
                  <div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Design Capacity σ<sub>cr</sub> =</span> <span class="font-semibold">${data.sigma_cr.toFixed(2)} MPa</span></div>
                </div>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800 mb-3">Weld Geometry & Loading</h3>
                <div class="space-y-2 text-sm">
                  <div><span class="text-gray-600">Throat Thickness a =</span> <span class="font-semibold">${data.inputs.a} mm</span></div>
                  <div><span class="text-gray-600">Weld Length l<sub>weld</sub> =</span> <span class="font-semibold">${data.inputs.l_weld} mm</span></div>
                  <div><span class="text-gray-600">Effective Area A =</span> <span class="font-semibold">${data.geometry.A.toFixed(0)} mm²</span></div>
                  <div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Normal Force N =</span> <span class="font-semibold">${data.inputs.N_display.toLocaleString()} kN</span></div>
                  <div><span class="text-gray-600">Shear Force V =</span> <span class="font-semibold">${data.inputs.V_display.toLocaleString()} kN</span></div>
                  <div><span class="text-gray-600">Moment M =</span> <span class="font-semibold">${data.inputs.M_display.toLocaleString()} kNm</span></div>
                </div>
              </div>
            </div>
          </div>

          <!-- RESULTS SUMMARY (Green heading) -->
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #15803d;">RESULTS SUMMARY</h2>

            <div class="bg-blue-100 border-2 border-blue-400 rounded-lg p-6 mb-6 text-center">
              <div class="text-4xl font-bold text-blue-900 mb-2">${data.sigma_cr.toFixed(2)} MPa</div>
              <div class="text-lg text-blue-800">Weld Design Capacity (σ<sub>cr</sub>)</div>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">
                <div class="text-sm text-gray-600 mb-2">Applied Stress</div>
                <div class="text-2xl font-bold text-gray-900">${data.sigma_von_mises.toFixed(2)} MPa</div>
                <div class="text-xs text-gray-500 mt-1">von Mises σ<sub>j</sub></div>
              </div>
              <div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">
                <div class="text-sm text-gray-600 mb-2">Utilization Ratio</div>
                <div class="text-2xl font-bold ${data.eta > 1.0 ? 'text-red-600' : data.eta > 0.8 ? 'text-orange-500' : 'text-green-600'}">${(data.eta * 100).toFixed(1)}%</div>
                <div class="text-xs text-gray-500 mt-1">σ<sub>j</sub> / σ<sub>cr</sub></div>
              </div>
              <div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">
                <div class="text-sm text-gray-600 mb-2">Status</div>
                <div class="text-2xl font-bold ${data.eta > 1.0 ? 'text-red-600' : 'text-green-600'}">${data.eta > 1.0 ? '⚠️ FAILS' : '✓ PASSES'}</div>
                <div class="text-xs text-gray-500 mt-1">Capacity Check</div>
              </div>
            </div>
          </div>

          <!-- DETAILED CALCULATIONS (Purple heading) -->
          <div class="page-break-before">
            <h2 class="text-2xl font-bold mb-6 pb-2 border-b-2" style="color: #6b21a8;">DETAILED CALCULATIONS</h2>

            <!-- Design Capacity -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Design Capacity</h3>
              <div class="space-y-2 text-sm">
                <div>σ<sub>cr</sub> = f<sub>u</sub> / (β<sub>w</sub> × γ<sub>M2</sub>)</div>
                <div>σ<sub>cr</sub> = ${data.steelData.f_u} / (${data.steelData.beta_w} × ${data.inputs.gammaM2})</div>
                <div>σ<sub>cr</sub> = <span class="font-semibold">${data.sigma_cr.toFixed(2)} MPa</span></div>
              </div>
            </div>

            <!-- Weld Geometry -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Weld Geometry</h3>
              <div class="space-y-2 text-sm">
                <div>Effective Area: A = a × l<sub>weld</sub> = ${data.inputs.a} × ${data.inputs.l_weld} = <span class="font-semibold">${data.geometry.A.toFixed(0)} mm²</span></div>
                <div>Moment of Inertia: I<sub>s</sub> = a × l<sub>weld</sub>³ / 12 = ${data.inputs.a} × ${data.inputs.l_weld}³ / 12 = <span class="font-semibold">${data.geometry.I_weld.toFixed(0)} mm⁴</span></div>
              </div>
            </div>

            <!-- Stress Components from Normal Force -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Stress from Normal Force (N = ${data.inputs.N_display.toLocaleString()} kN)</h3>
              <div class="space-y-2 text-sm">
                <div>σ<sub>⊥,N</sub> = N / (√2 × A) = ${data.inputs.N.toLocaleString()} / (√2 × ${data.geometry.A}) = <span class="font-semibold">${data.stresses.N.sigma_orthogonal_N.toFixed(2)} MPa</span></div>
                <div>τ<sub>⊥,N</sub> = N / (√2 × A) = ${data.inputs.N.toLocaleString()} / (√2 × ${data.geometry.A}) = <span class="font-semibold">${data.stresses.N.tau_orthogonal_N.toFixed(2)} MPa</span></div>
                <div>τ<sub>∥,N</sub> = <span class="font-semibold">0 MPa</span></div>
              </div>
            </div>

            <!-- Stress Components from Shear Force -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Stress from Shear Force (V = ${data.inputs.V_display.toLocaleString()} kN)</h3>
              <div class="space-y-2 text-sm">
                <div>σ<sub>⊥,V</sub> = <span class="font-semibold">0 MPa</span></div>
                <div>τ<sub>⊥,V</sub> = <span class="font-semibold">0 MPa</span></div>
                <div>τ<sub>∥,V</sub> = V / A = ${data.inputs.V.toLocaleString()} / ${data.geometry.A} = <span class="font-semibold">${data.stresses.V.tau_parallel_V.toFixed(2)} MPa</span></div>
              </div>
            </div>

            <!-- Stress Components from Moment -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Stress from Moment (M = ${data.inputs.M_display.toLocaleString()} kNm)</h3>
              <div class="space-y-2 text-sm">
                <div>σ<sub>⊥,M</sub> = M / (√2 × I<sub>s</sub>) × l<sub>weld</sub>/2 = ${data.inputs.M.toLocaleString()} / (√2 × ${data.geometry.I_weld.toFixed(0)}) × ${data.inputs.l_weld}/2 = <span class="font-semibold">${data.stresses.M.sigma_orthogonal_M.toFixed(2)} MPa</span></div>
                <div>τ<sub>⊥,M</sub> = M / (√2 × I<sub>s</sub>) × l<sub>weld</sub>/2 = ${data.inputs.M.toLocaleString()} / (√2 × ${data.geometry.I_weld.toFixed(0)}) × ${data.inputs.l_weld}/2 = <span class="font-semibold">${data.stresses.M.tau_orthogonal_M.toFixed(2)} MPa</span></div>
                <div>τ<sub>∥,M</sub> = <span class="font-semibold">0 MPa</span></div>
              </div>
            </div>

            <!-- Combined Stresses -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">Combined Stresses</h3>
              <div class="space-y-2 text-sm">
                <div>σ<sub>⊥</sub> = σ<sub>⊥,N</sub> + σ<sub>⊥,V</sub> + σ<sub>⊥,M</sub> = ${data.stresses.N.sigma_orthogonal_N.toFixed(2)} + ${data.stresses.V.sigma_orthogonal_V.toFixed(2)} + ${data.stresses.M.sigma_orthogonal_M.toFixed(2)} = <span class="font-semibold">${data.stresses.combined.sigma_orthogonal.toFixed(2)} MPa</span></div>
                <div>τ<sub>⊥</sub> = τ<sub>⊥,N</sub> + τ<sub>⊥,V</sub> + τ<sub>⊥,M</sub> = ${data.stresses.N.tau_orthogonal_N.toFixed(2)} + ${data.stresses.V.tau_orthogonal_V.toFixed(2)} + ${data.stresses.M.tau_orthogonal_M.toFixed(2)} = <span class="font-semibold">${data.stresses.combined.tau_orthogonal.toFixed(2)} MPa</span></div>
                <div>τ<sub>∥</sub> = τ<sub>∥,N</sub> + τ<sub>∥,V</sub> + τ<sub>∥,M</sub> = ${data.stresses.N.tau_parallel_N.toFixed(2)} + ${data.stresses.V.tau_parallel_V.toFixed(2)} + ${data.stresses.M.tau_parallel_M.toFixed(2)} = <span class="font-semibold">${data.stresses.combined.tau_parallel.toFixed(2)} MPa</span></div>
              </div>
            </div>

            <!-- von Mises Stress and Capacity Verification -->
            <div class="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-300 pb-2">von Mises Stress & Capacity Verification</h3>
              <div class="space-y-3 text-sm">
                <div>
                  <div class="font-medium text-gray-700 mb-1">von Mises Stress:</div>
                  <div>σ<sub>j</sub> = √(σ<sub>⊥</sub>² + 3×τ<sub>⊥</sub>² + 3×τ<sub>∥</sub>²)</div>
                  <div>σ<sub>j</sub> = √(${data.stresses.combined.sigma_orthogonal.toFixed(2)}² + 3×${data.stresses.combined.tau_orthogonal.toFixed(2)}² + 3×${data.stresses.combined.tau_parallel.toFixed(2)}²)</div>
                  <div>σ<sub>j</sub> = <span class="font-semibold">${data.sigma_von_mises.toFixed(2)} MPa</span></div>
                </div>
                <div class="pt-2 border-t border-gray-300">
                  <div class="font-medium text-gray-700 mb-1">Utilization:</div>
                  <div>η = σ<sub>j</sub> / σ<sub>cr</sub> = ${data.sigma_von_mises.toFixed(2)} / ${data.sigma_cr.toFixed(2)} = <span class="font-semibold ${data.eta > 1.0 ? 'text-red-600' : data.eta > 0.8 ? 'text-orange-500' : 'text-green-600'}">${(data.eta * 100).toFixed(1)}%</span></div>
                </div>
                <div class="mt-3 p-3 rounded ${data.eta > 1.0 ? 'bg-red-100 border border-red-400' : 'bg-green-100 border border-green-400'}">
                  <span class="font-semibold ${data.eta > 1.0 ? 'text-red-800' : 'text-green-800'}">${data.eta > 1.0 ? '⚠️ CAPACITY EXCEEDED - WELD FAILS' : '✓ CAPACITY OK - WELD PASSES'}</span>
                </div>
              </div>
            </div>

            ${data.eta > 1.0 ? `
            <!-- Recommendations (if failed) -->
            <div class="bg-red-50 border-2 border-red-400 rounded-lg p-6">
              <h3 class="text-lg font-semibold text-red-900 mb-4">⚠️ Recommendations</h3>
              <div class="space-y-2 text-sm text-red-800">
                <p class="font-medium">The weld does not have sufficient capacity. Consider:</p>
                <ul class="list-disc list-inside space-y-1 ml-4">
                  <li>Increase throat thickness (a)</li>
                  <li>Increase weld length</li>
                  <li>Use higher grade steel</li>
                  <li>Reduce applied forces/moments</li>
                </ul>
              </div>
            </div>
            ` : ''}
          </div>

        </div>
    `;

    document.getElementById('detailed-report').innerHTML = reportHTML;
}

// Toggle report visibility
function toggleReport() {
    const report = document.getElementById('detailed-report');
    const header = event.currentTarget;
    report.classList.toggle('hidden');
    header.textContent = report.classList.contains('hidden') ? '▼ Detailed Calculation Report' : '▲ Detailed Calculation Report';
}

// Print report
function printReport() {
    window.print();
}