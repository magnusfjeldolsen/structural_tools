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

// Calculate weld capacity
function calculateWeldCapacity() {
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
        
        // Show results sections
        document.getElementById('quickResults').classList.remove('hidden');
        document.getElementById('detailedCalculations').classList.remove('hidden');
        
    } catch (error) {
        alert('Error: ' + error.message);
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