// Two-Sided Hat Profile Calculator
// Based on Eurocode 3 standards

// Pure calculation function that accepts parameters and returns results
function calculateFromParams(params) {
    const { b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0, rho_steel } = params;

    // Validate inputs
    const requiredParams = { b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0, rho_steel };
    for (const [key, value] of Object.entries(requiredParams)) {
        if (isNaN(value) || value === undefined || value === null) {
            throw new Error(`Invalid or missing parameter: ${key}`);
        }
    }

    // Calculate derived dimensions
    const h_w = H - t_w;
    const H_tot = H + t_u;
    
    // Calculate overhang for lower flange
    const c_u = (b_u - 2 * t_w - b_o) / 2;

    // Calculate areas
    const A_o = b_o * t_o;
    const A_w = h_w * t_w * 2; // Two webs
    const A_u = t_u * b_u;
    const A_total = A_o + A_w + A_u;

    // Calculate neutral axis position (from bottom of lower flange)
    const z_NA = (A_u * (t_u / 2) + A_w * (t_u + h_w / 2) + A_o * (H_tot - t_o / 2)) / A_total;

    // Calculate second moment of area components
    const I_y_u = (b_u * Math.pow(t_u, 3)) / 12 + A_u * Math.pow(z_NA - t_u / 2, 2);
    const I_y_o = (b_o * Math.pow(t_o, 3)) / 12 + A_o * Math.pow(H_tot - t_o / 2 - z_NA, 2);
    const I_y_w = 2 * ((Math.pow(t_w, 3) * h_w) / 12 + A_w/2 * Math.pow(z_NA - (t_u + h_w / 2), 2));
    const I_y = I_y_u + I_y_o + I_y_w;

    // Calculate maximum distance to extreme fiber
    const z_max = Math.max(z_NA, H_tot - z_NA);

    // Calculate section modulus
    const W_el = I_y / z_max;

    // Material properties
    const f_yd = f_yk / gamma_M0;
    const epsilon = Math.sqrt(235 / f_yk);
    
    // Moment resistance
    const M_Rd = W_el * f_yd / 1000000; // Convert to kNm

    // Unit weight calculation: A_total (mm²) * rho_steel (kg/m³) * 1e-6 (m²/mm² conversion)
    const unit_weight = A_total * rho_steel * 1e-6; // kg/m

    // Cross-section classification
    const classification = classifySection(b_o, t_o, b_u, t_u, c_u, h_w, t_w, z_NA, H_tot, epsilon);

    // Return comprehensive results object
    return {
        inputs: { b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0, rho_steel },
        derived: { h_w, H_tot, c_u },
        areas: { A_o, A_w, A_u, A_total },
        geometry: {
            z_NA,
            I_y_u, I_y_o, I_y_w, I_y,
            z_max, W_el
        },
        material: { f_yd, epsilon },
        results: {
            H_tot: H_tot.toFixed(1),
            A_total: A_total.toFixed(0),
            unit_weight: unit_weight.toFixed(2),
            z_NA: z_NA.toFixed(1),
            I_y: (I_y / 1e8).toFixed(4),
            W_el: (W_el / 1000).toFixed(1),
            f_yd: f_yd.toFixed(1),
            epsilon: epsilon.toFixed(3),
            M_Rd: M_Rd.toFixed(1),
            unit_weight_value: unit_weight,
            M_Rd_value: M_Rd
        },
        classification,
        raw_values: {
            H_tot, A_total, unit_weight, z_NA, I_y, W_el, f_yd, epsilon, M_Rd
        }
    };
}

// UI-based calculation function that uses the pure calculation function
function calculate() {
    try {
        // Get input values from DOM
        const params = {
            b_o: parseFloat(document.getElementById('b_o').value),
            t_o: parseFloat(document.getElementById('t_o').value),
            H: parseFloat(document.getElementById('H').value),
            t_w: parseFloat(document.getElementById('t_w').value),
            b_u: parseFloat(document.getElementById('b_u').value),
            t_u: parseFloat(document.getElementById('t_u').value),
            f_yk: parseFloat(document.getElementById('f_yk').value),
            gamma_M0: parseFloat(document.getElementById('gamma_M0').value),
            rho_steel: parseFloat(document.getElementById('rho_steel').value)
        };

        // Calculate using the pure function
        const calcResults = calculateFromParams(params);

        // Update UI with results
        updateResults(calcResults.results);

        // Generate step-by-step calculations
        generateStepCalculations({
            ...calcResults.inputs,
            ...calcResults.derived,
            ...calcResults.areas,
            ...calcResults.geometry,
            ...calcResults.material,
            ...calcResults.raw_values,
            classification: calcResults.classification
        });

        // Draw diagram
        drawCrossSection(params.b_o, params.t_o, params.H, params.t_w, params.b_u, params.t_u, calcResults.raw_values.z_NA);

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function classifySection(b_o, t_o, b_u, t_u, c_u, h_w, t_w, z_NA, H_tot, epsilon) {
    // Internal compression element classification function
    function internalCompressionElement(c, t, epsilon) {
        if (c / t <= 42 * epsilon) {
            return 3;
        } else {
            return 4;
        }
    }

    // External compression element classification function
    function externalCompressionElement(c, t, epsilon) {
        if (c / t <= 14 * epsilon) {
            return 3;
        } else {
            return 4;
        }
    }

    // Internal bending element classification function
    function internalBendingElement(c, t, psi, epsilon) {
        if (psi > -1) {
            if (c / t <= 42 * epsilon / (0.67 + 0.33 * psi)) {
                return 3;
            } else {
                return 4;
            }
        } else {
            if (psi <= -1 && c / t <= 62 * epsilon * (1 - psi) * Math.sqrt(-psi)) {
                return 3;
            } else {
                return 4;
            }
        }
    }

    // Classify flanges
    const upper_flange_class = internalCompressionElement(b_o, t_o, epsilon);
    const lower_flange_inner_class = internalCompressionElement(b_u, t_u, epsilon);
    const lower_flange_outer_class = externalCompressionElement(c_u, t_u, epsilon);

    // Calculate stress distribution for web classification
    const psi_trykk_OK = -(z_NA - t_u) / (H_tot - z_NA - t_o);
    const psi_trykk_UK = (H_tot - z_NA - t_o) / (z_NA - t_u);

    // Web classification based on bending
    let web_class;
    if (psi_trykk_OK > -1) {
        const limit = 42 * epsilon / (0.67 + 0.33 * psi_trykk_OK);
        web_class = (h_w / t_w <= limit) ? 3 : 4;
    } else {
        const limit = 62 * epsilon * (1 - psi_trykk_UK) * Math.sqrt(-psi_trykk_UK);
        web_class = (h_w / t_w <= limit) ? 3 : 4;
    }

    // Overall classification is the worst (highest) class
    const overall_class = Math.max(upper_flange_class, lower_flange_inner_class, lower_flange_outer_class, web_class);

    return {
        upper_flange_class: `Class ${upper_flange_class}`,
        lower_flange_inner_class: `Class ${lower_flange_inner_class}`,
        lower_flange_outer_class: `Class ${lower_flange_outer_class}`,
        web_class: `Class ${web_class}`,
        overall_class: `Class ${overall_class}`
    };
}

function updateResults(results) {
    // Update geometric results
    document.getElementById('H_tot').textContent = results.H_tot + ' mm';
    document.getElementById('A_total').textContent = results.A_total + ' mm²';
    document.getElementById('unit_weight').textContent = results.unit_weight + ' kg/m';
    document.getElementById('z_NA').textContent = results.z_NA + ' mm';
    document.getElementById('I_y').textContent = results.I_y + ' × 10⁸ mm⁴';
    document.getElementById('W_el').textContent = results.W_el + ' × 10³ mm³';

    // Update material results
    document.getElementById('f_yd').textContent = results.f_yd + ' MPa';
    document.getElementById('epsilon').textContent = results.epsilon;
    document.getElementById('M_Rd').textContent = results.M_Rd + ' kNm';

    // Update classification results
    document.getElementById('upper_flange_class').textContent = results.upper_flange_class;
    document.getElementById('lower_flange_inner_class').textContent = results.lower_flange_inner_class;
    document.getElementById('lower_flange_outer_class').textContent = results.lower_flange_outer_class;
    document.getElementById('web_class').textContent = results.web_class;
    document.getElementById('overall_class').textContent = results.overall_class;
}

function generateStepCalculations(params) {
    const {
        b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0, rho_steel,
        h_w, H_tot, c_u, A_o, A_w, A_u, A_total, unit_weight,
        z_NA, I_y_u, I_y_o, I_y_w, I_y, z_max, W_el,
        f_yd, epsilon, M_Rd, classification
    } = params;

    function toFixedIfNeeded(num, digits=2) {
        return num.toFixed(digits);
    }

    const stepsLatex = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-purple-400 mb-4">Two-Sided Hat Profile Calculation Results</h2>
    </div>
    
    <!-- Input Parameters Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-blue-300">Input Parameters</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">b<sub>0</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(b_o)} mm</span>
          <span class="calc-label ml-6">t<sub>0</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(t_o)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">H</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(H)} mm</span>
          <span class="calc-label ml-6">t<sub>w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(t_w)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">b<sub>u</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(b_u)} mm</span>
          <span class="calc-label ml-6">t<sub>u</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(t_u)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">f<sub>yk</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(f_yk)} MPa</span>
          <span class="calc-label ml-6">γ<sub>M0</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(gamma_M0)}</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">ρ<sub>steel</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(rho_steel)} kg/m³</span>
        </div>
      </div>
    </div>

    <!-- Derived Dimensions Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-yellow-300">Derived Dimensions</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">h<sub>w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">H - t<sub>w</sub> = ${toFixedIfNeeded(H)} - ${toFixedIfNeeded(t_w)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(h_w)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">H<sub>tot</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">H + t<sub>u</sub> = ${toFixedIfNeeded(H)} + ${toFixedIfNeeded(t_u)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(H_tot)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">c<sub>u</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">(b<sub>u</sub> - 2×t<sub>w</sub> - b<sub>0</sub>)/2 = (${toFixedIfNeeded(b_u)} - 2×${toFixedIfNeeded(t_w)} - ${toFixedIfNeeded(b_o)})/2</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(c_u)} mm</span>
        </div>
      </div>
    </div>

    <!-- Cross-Sectional Areas Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-green-300">Cross-Sectional Areas</h3>
      </div>
      <div class="calc-content">
        <h4 class="text-md font-medium text-green-200 mb-3 border-b border-gray-600 pb-1">Upper Flange Area</h4>
        <div class="calc-row">
          <span class="calc-label">A<sub>0</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">b<sub>0</sub> × t<sub>0</sub> = ${toFixedIfNeeded(b_o)} × ${toFixedIfNeeded(t_o)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(A_o)} mm²</span>
        </div>
        
        <h4 class="text-md font-medium text-green-200 mb-3 mt-6 border-b border-gray-600 pb-1">Web Area (Both Webs)</h4>
        <div class="calc-row">
          <span class="calc-label">A<sub>w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">h<sub>w</sub> × t<sub>w</sub> × 2 = ${toFixedIfNeeded(h_w)} × ${toFixedIfNeeded(t_w)} × 2</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(A_w)} mm²</span>
        </div>
        
        <h4 class="text-md font-medium text-green-200 mb-3 mt-6 border-b border-gray-600 pb-1">Lower Flange Area</h4>
        <div class="calc-row">
          <span class="calc-label">A<sub>u</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">t<sub>u</sub> × b<sub>u</sub> = ${toFixedIfNeeded(t_u)} × ${toFixedIfNeeded(b_u)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(A_u)} mm²</span>
        </div>
        
        <div class="calc-separator mt-4"></div>
        <div class="calc-row">
          <span class="calc-label">A<sub>total</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">A<sub>0</sub> + A<sub>w</sub> + A<sub>u</sub> = ${toFixedIfNeeded(A_o)} + ${toFixedIfNeeded(A_w)} + ${toFixedIfNeeded(A_u)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(A_total)} mm²</span>
        </div>
      </div>
    </div>

    <!-- Unit Weight Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-teal-300">Unit Weight</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">Unit Weight</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">A<sub>total</sub> × ρ<sub>steel</sub> × 10⁻⁶ = ${toFixedIfNeeded(A_total)} × ${toFixedIfNeeded(rho_steel)} × 10⁻⁶</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(unit_weight, 2)} kg/m</span>
        </div>
        <div class="calc-note text-sm text-gray-400">Conversion factor 10⁻⁶ accounts for mm² to m² conversion</div>
      </div>
    </div>

    <!-- Neutral Axis Position Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-orange-300">Neutral Axis Position</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">z<sub>NA</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">(A<sub>u</sub>×t<sub>u</sub>/2 + A<sub>w</sub>×(t<sub>u</sub>+h<sub>w</sub>/2) + A<sub>0</sub>×(H<sub>tot</sub>-t<sub>0</sub>/2))/A<sub>total</sub></span>
        </div>
        <div class="calc-row">
          <span class="calc-equals">=</span>
          <span class="calc-expression">(${toFixedIfNeeded(A_u)}×${toFixedIfNeeded(t_u/2)} + ${toFixedIfNeeded(A_w)}×${toFixedIfNeeded(t_u + h_w/2)} + ${toFixedIfNeeded(A_o)}×${toFixedIfNeeded(H_tot - t_o/2)})/${toFixedIfNeeded(A_total)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(z_NA)} mm</span>
        </div>
        <div class="calc-note text-sm text-gray-400">Distance from bottom of lower flange</div>
      </div>
    </div>

    <!-- Second Moment of Area Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-cyan-300">Second Moment of Area</h3>
      </div>
      <div class="calc-content">
        <h4 class="text-md font-medium text-cyan-200 mb-3 border-b border-gray-600 pb-1">Lower Flange Contribution</h4>
        <div class="calc-row">
          <span class="calc-label">I<sub>y,u</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">(b<sub>u</sub>×t<sub>u</sub>³)/12 + A<sub>u</sub>×(z<sub>NA</sub>-t<sub>u</sub>/2)²</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(I_y_u/1e6, 1)} ×10⁶ mm⁴</span>
        </div>
        
        <h4 class="text-md font-medium text-cyan-200 mb-3 mt-6 border-b border-gray-600 pb-1">Upper Flange Contribution</h4>
        <div class="calc-row">
          <span class="calc-label">I<sub>y,0</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">(b<sub>0</sub>×t<sub>0</sub>³)/12 + A<sub>0</sub>×(H<sub>tot</sub>-t<sub>0</sub>/2-z<sub>NA</sub>)²</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(I_y_o/1e6, 1)} ×10⁶ mm⁴</span>
        </div>
        
        <h4 class="text-md font-medium text-cyan-200 mb-3 mt-6 border-b border-gray-600 pb-1">Web Contribution</h4>
        <div class="calc-row">
          <span class="calc-label">I<sub>y,w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">2×[(t<sub>w</sub>³×h<sub>w</sub>)/12 + (A<sub>w</sub>/2)×(z<sub>NA</sub>-(t<sub>u</sub>+h<sub>w</sub>/2))²]</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(I_y_w/1e6, 1)} ×10⁶ mm⁴</span>
        </div>
        
        <div class="calc-separator mt-4"></div>
        <div class="calc-row">
          <span class="calc-label">I<sub>y</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">I<sub>y,u</sub> + I<sub>y,0</sub> + I<sub>y,w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(I_y/1e8, 4)} ×10⁸ mm⁴</span>
        </div>
      </div>
    </div>

    <!-- Section Properties Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-indigo-300">Section Properties</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">z<sub>max</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">max(z<sub>NA</sub>, H<sub>tot</sub>-z<sub>NA</sub>) = max(${toFixedIfNeeded(z_NA)}, ${toFixedIfNeeded(H_tot-z_NA)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(z_max)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">W<sub>el</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">I<sub>y</sub>/z<sub>max</sub> = ${toFixedIfNeeded(I_y/1e8, 4)}×10⁸/${toFixedIfNeeded(z_max)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(W_el/1000, 1)} ×10³ mm³</span>
        </div>
      </div>
    </div>

    <!-- Material Properties Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-pink-300">Material Properties</h3>
      </div>
      <div class="calc-content">
        <div class="calc-row">
          <span class="calc-label">f<sub>yd</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">f<sub>yk</sub>/γ<sub>M0</sub> = ${toFixedIfNeeded(f_yk)}/${toFixedIfNeeded(gamma_M0)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(f_yd)} MPa</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">ε</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">√(235/f<sub>yk</sub>) = √(235/${toFixedIfNeeded(f_yk)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(epsilon, 3)}</span>
        </div>
        <div class="calc-separator"></div>
        <div class="calc-row">
          <span class="calc-label">M<sub>Rd</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">W<sub>el</sub> × f<sub>yd</sub> = ${toFixedIfNeeded(W_el/1000, 1)}×10³ × ${toFixedIfNeeded(f_yd)} × 10⁻⁶</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(M_Rd)} kNm</span>
        </div>
      </div>
    </div>

    <!-- Cross-Section Classification Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-purple-300">Cross-Section Classification (Eurocode 3)</h3>
      </div>
      <div class="calc-content">
        <h4 class="text-md font-medium text-purple-200 mb-3 border-b border-gray-600 pb-1">Classification Limits</h4>
        <div class="calc-row">
          <span class="calc-note text-sm">Internal compression elements: c/t ≤ 42ε → Class 3, else Class 4</span>
        </div>
        <div class="calc-row">
          <span class="calc-note text-sm">External compression elements: c/t ≤ 14ε → Class 3, else Class 4</span>
        </div>
        
        <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Upper Flange (Internal Compression)</h4>
        <div class="calc-row">
          <span class="calc-label">c/t</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">b<sub>0</sub>/t<sub>0</sub> = ${toFixedIfNeeded(b_o)}/${toFixedIfNeeded(t_o)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(b_o/t_o, 1)}</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">42ε</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(42*epsilon, 1)}</span>
          <span class="calc-note ml-4 text-sm">Result: ${classification.upper_flange_class}</span>
        </div>
        
        <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Lower Flange Inner (Internal Compression)</h4>
        <div class="calc-row">
          <span class="calc-label">c/t</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">b<sub>u</sub>/t<sub>u</sub> = ${toFixedIfNeeded(b_u)}/${toFixedIfNeeded(t_u)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(b_u/t_u, 1)}</span>
          <span class="calc-note ml-4 text-sm">Result: ${classification.lower_flange_inner_class}</span>
        </div>
        
        <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Lower Flange Outer (External Compression)</h4>
        <div class="calc-row">
          <span class="calc-label">c/t</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">c<sub>u</sub>/t<sub>u</sub> = ${toFixedIfNeeded(c_u)}/${toFixedIfNeeded(t_u)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(c_u/t_u, 1)}</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">14ε</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(14*epsilon, 1)}</span>
          <span class="calc-note ml-4 text-sm">Result: ${classification.lower_flange_outer_class}</span>
        </div>
        
        <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Web Classification</h4>
        <div class="calc-row">
          <span class="calc-label">c/t</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">h<sub>w</sub>/t<sub>w</sub> = ${toFixedIfNeeded(h_w)}/${toFixedIfNeeded(t_w)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(h_w/t_w, 1)}</span>
          <span class="calc-note ml-4 text-sm">Result: ${classification.web_class}</span>
        </div>
        
        <div class="calc-separator mt-4"></div>
        <div class="calc-row">
          <span class="calc-label">Overall Classification</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">max(all element classes)</span>
          <span class="calc-equals">=</span>
          <span class="calc-value font-bold text-purple-300">${classification.overall_class}</span>
        </div>
      </div>
    </div>
    `;

    const container = document.getElementById('step-calculations');
    container.innerHTML = stepsLatex;
}

function drawCrossSection(b_o, t_o, H, t_w, b_u, t_u, z_NA) {
    const svg = document.getElementById('diagram');
    svg.innerHTML = ''; // Clear previous drawing

    const svgWidth = svg.clientWidth;
    const svgHeight = svg.clientHeight;
    const H_tot = H + t_u;

    // Calculate scale to fit the section in the SVG
    const maxDim = Math.max(b_u, H_tot);
    const scale = Math.min(svgWidth * 0.6, svgHeight * 0.8) / maxDim;

    // Calculate drawing dimensions
    const drawWidth_u = b_u * scale;
    const drawWidth_o = b_o * scale;
    const drawHeight = H_tot * scale;
    const drawThickness_u = t_u * scale;
    const drawThickness_o = t_o * scale;
    const drawThickness_w = t_w * scale;

    // Center the drawing
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const startX = centerX - drawWidth_u / 2;
    const startY = centerY - drawHeight / 2;

    // Create SVG namespace
    const svgNS = "http://www.w3.org/2000/svg";

    // Helper function to create SVG elements
    function createElement(tag, attributes) {
        const element = document.createElementNS(svgNS, tag);
        for (let attr in attributes) {
            element.setAttribute(attr, attributes[attr]);
        }
        return element;
    }

    // Draw lower flange
    const lowerFlange = createElement('rect', {
        x: startX,
        y: startY + drawHeight - drawThickness_u,
        width: drawWidth_u,
        height: drawThickness_u,
        fill: '#3498db',
        stroke: '#2980b9',
        'stroke-width': '2'
    });
    svg.appendChild(lowerFlange);

    // Draw webs
    const webOffset = (drawWidth_u - drawWidth_o) / 2;
    
    const leftWeb = createElement('rect', {
        x: startX + webOffset,
        y: startY + drawThickness_o,
        width: drawThickness_w,
        height: drawHeight - drawThickness_o - drawThickness_u,
        fill: '#e74c3c',
        stroke: '#c0392b',
        'stroke-width': '2'
    });
    svg.appendChild(leftWeb);

    const rightWeb = createElement('rect', {
        x: startX + drawWidth_u - webOffset - drawThickness_w,
        y: startY + drawThickness_o,
        width: drawThickness_w,
        height: drawHeight - drawThickness_o - drawThickness_u,
        fill: '#e74c3c',
        stroke: '#c0392b',
        'stroke-width': '2'
    });
    svg.appendChild(rightWeb);

    // Draw upper flange
    const upperFlange = createElement('rect', {
        x: startX + webOffset,
        y: startY,
        width: drawWidth_o,
        height: drawThickness_o,
        fill: '#27ae60',
        stroke: '#229954',
        'stroke-width': '2'
    });
    svg.appendChild(upperFlange);

    // Draw neutral axis
    const naY = startY + drawHeight - (z_NA * scale);
    const neutralAxis = createElement('line', {
        x1: startX - 20,
        y1: naY,
        x2: startX + drawWidth_u + 20,
        y2: naY,
        stroke: '#f39c12',
        'stroke-width': '3',
        'stroke-dasharray': '10,5'
    });
    svg.appendChild(neutralAxis);

    // Add neutral axis label
    const naLabel = createElement('text', {
        x: startX + drawWidth_u + 25,
        y: naY + 5,
        fill: '#f39c12',
        'font-size': '14',
        'font-weight': 'bold'
    });
    naLabel.textContent = 'N.A.';
    svg.appendChild(naLabel);

    // Add dimension labels
    const labels = [
        { text: `b₀ = ${b_o}mm`, x: startX + webOffset + drawWidth_o/2, y: startY - 10, anchor: 'middle' },
        { text: `bᵤ = ${b_u}mm`, x: centerX, y: startY + drawHeight + 20, anchor: 'middle' },
        { text: `H = ${H}mm`, x: startX - 30, y: centerY, anchor: 'middle' },
        { text: `t₀ = ${t_o}mm`, x: startX + webOffset - 20, y: startY + drawThickness_o/2 + 5, anchor: 'end' },
        { text: `tᵤ = ${t_u}mm`, x: startX - 20, y: startY + drawHeight - drawThickness_u/2 + 5, anchor: 'end' },
        { text: `tₘ = ${t_w}mm`, x: startX + webOffset + drawThickness_w + 5, y: centerY, anchor: 'start' }
    ];

    labels.forEach(label => {
        const textElement = createElement('text', {
            x: label.x,
            y: label.y,
            fill: '#2c3e50',
            'font-size': '12',
            'text-anchor': label.anchor || 'start',
            'font-weight': '600'
        });
        textElement.textContent = label.text;
        svg.appendChild(textElement);
    });

    // Add legend
    const legendY = startY + drawHeight + 60;
    const legend = [
        { color: '#27ae60', text: 'Upper Flange' },
        { color: '#e74c3c', text: 'Web' },
        { color: '#3498db', text: 'Lower Flange' }
    ];

    legend.forEach((item, index) => {
        const rect = createElement('rect', {
            x: startX + index * 120,
            y: legendY,
            width: 15,
            height: 15,
            fill: item.color
        });
        svg.appendChild(rect);

        const text = createElement('text', {
            x: startX + index * 120 + 20,
            y: legendY + 12,
            fill: '#2c3e50',
            'font-size': '12'
        });
        text.textContent = item.text;
        svg.appendChild(text);
    });
}

// Generate detailed step-by-step calculations for API response
function generateDetailedCalculations(calcResults) {
    const { inputs, derived, areas, geometry, material, raw_values, classification } = calcResults;
    
    return {
        "input_parameters": {
            "description": "Input parameters for THP calculation",
            "values": {
                "b_o": { "value": inputs.b_o, "unit": "mm", "description": "Upper flange width" },
                "t_o": { "value": inputs.t_o, "unit": "mm", "description": "Upper flange thickness" },
                "H": { "value": inputs.H, "unit": "mm", "description": "Web height" },
                "t_w": { "value": inputs.t_w, "unit": "mm", "description": "Web thickness" },
                "b_u": { "value": inputs.b_u, "unit": "mm", "description": "Lower flange width" },
                "t_u": { "value": inputs.t_u, "unit": "mm", "description": "Lower flange thickness" },
                "f_yk": { "value": inputs.f_yk, "unit": "MPa", "description": "Steel yield strength" },
                "gamma_M0": { "value": inputs.gamma_M0, "unit": "-", "description": "Safety factor" },
                "rho_steel": { "value": inputs.rho_steel, "unit": "kg/m³", "description": "Steel density" }
            }
        },
        "derived_dimensions": {
            "description": "Calculated derived dimensions",
            "calculations": {
                "h_w": {
                    "formula": "h_w = H - t_w",
                    "substitution": `${inputs.H} - ${inputs.t_w}`,
                    "value": derived.h_w,
                    "unit": "mm",
                    "description": "Clear web height"
                },
                "H_tot": {
                    "formula": "H_tot = H + t_u",
                    "substitution": `${inputs.H} + ${inputs.t_u}`,
                    "value": derived.H_tot,
                    "unit": "mm",
                    "description": "Total profile height"
                },
                "c_u": {
                    "formula": "c_u = (b_u - 2×t_w - b_o) / 2",
                    "substitution": `(${inputs.b_u} - 2×${inputs.t_w} - ${inputs.b_o}) / 2`,
                    "value": derived.c_u,
                    "unit": "mm",
                    "description": "Lower flange overhang"
                }
            }
        },
        "cross_sectional_areas": {
            "description": "Cross-sectional area components",
            "calculations": {
                "A_o": {
                    "formula": "A_o = b_o × t_o",
                    "substitution": `${inputs.b_o} × ${inputs.t_o}`,
                    "value": areas.A_o,
                    "unit": "mm²",
                    "description": "Upper flange area"
                },
                "A_w": {
                    "formula": "A_w = h_w × t_w × 2",
                    "substitution": `${derived.h_w} × ${inputs.t_w} × 2`,
                    "value": areas.A_w,
                    "unit": "mm²",
                    "description": "Total web area (both webs)"
                },
                "A_u": {
                    "formula": "A_u = b_u × t_u",
                    "substitution": `${inputs.b_u} × ${inputs.t_u}`,
                    "value": areas.A_u,
                    "unit": "mm²",
                    "description": "Lower flange area"
                },
                "A_total": {
                    "formula": "A_total = A_o + A_w + A_u",
                    "substitution": `${areas.A_o} + ${areas.A_w} + ${areas.A_u}`,
                    "value": areas.A_total,
                    "unit": "mm²",
                    "description": "Total cross-sectional area"
                }
            }
        },
        "neutral_axis": {
            "description": "Neutral axis position calculation",
            "calculations": {
                "z_NA": {
                    "formula": "z_NA = (A_u×y_u + A_w×y_w + A_o×y_o) / A_total",
                    "explanation": "First moment of area divided by total area",
                    "component_centroids": {
                        "y_u": { "value": inputs.t_u / 2, "description": "Lower flange centroid from bottom" },
                        "y_w": { "value": inputs.t_u + derived.h_w / 2, "description": "Web centroid from bottom" },
                        "y_o": { "value": derived.H_tot - inputs.t_o / 2, "description": "Upper flange centroid from bottom" }
                    },
                    "value": geometry.z_NA,
                    "unit": "mm",
                    "description": "Neutral axis distance from bottom"
                }
            }
        },
        "second_moment_of_area": {
            "description": "Second moment of area calculation",
            "calculations": {
                "I_y_u": {
                    "formula": "I_y_u = (b_u×t_u³)/12 + A_u×d_u²",
                    "parallel_axis_distance": Math.abs(geometry.z_NA - inputs.t_u / 2),
                    "value": geometry.I_y_u,
                    "unit": "mm⁴",
                    "description": "Lower flange contribution"
                },
                "I_y_w": {
                    "formula": "I_y_w = 2×[(t_w×h_w³)/12 + (A_w/2)×d_w²]",
                    "parallel_axis_distance": Math.abs(geometry.z_NA - (inputs.t_u + derived.h_w / 2)),
                    "value": geometry.I_y_w,
                    "unit": "mm⁴",
                    "description": "Web contribution (both webs)"
                },
                "I_y_o": {
                    "formula": "I_y_o = (b_o×t_o³)/12 + A_o×d_o²",
                    "parallel_axis_distance": Math.abs(derived.H_tot - inputs.t_o / 2 - geometry.z_NA),
                    "value": geometry.I_y_o,
                    "unit": "mm⁴",
                    "description": "Upper flange contribution"
                },
                "I_y_total": {
                    "formula": "I_y = I_y_u + I_y_w + I_y_o",
                    "substitution": `${geometry.I_y_u.toFixed(0)} + ${geometry.I_y_w.toFixed(0)} + ${geometry.I_y_o.toFixed(0)}`,
                    "value": geometry.I_y,
                    "unit": "mm⁴",
                    "description": "Total second moment of area"
                }
            }
        },
        "section_properties": {
            "description": "Section modulus and material properties",
            "calculations": {
                "z_max": {
                    "formula": "z_max = max(z_NA, H_tot - z_NA)",
                    "value": geometry.z_max,
                    "unit": "mm",
                    "description": "Maximum distance to extreme fiber"
                },
                "W_el": {
                    "formula": "W_el = I_y / z_max",
                    "substitution": `${geometry.I_y.toFixed(0)} / ${geometry.z_max.toFixed(1)}`,
                    "value": geometry.W_el,
                    "unit": "mm³",
                    "description": "Elastic section modulus"
                },
                "f_yd": {
                    "formula": "f_yd = f_yk / γ_M0",
                    "substitution": `${inputs.f_yk} / ${inputs.gamma_M0}`,
                    "value": material.f_yd,
                    "unit": "MPa",
                    "description": "Design yield strength"
                },
                "epsilon": {
                    "formula": "ε = √(235/f_yk)",
                    "substitution": `√(235/${inputs.f_yk})`,
                    "value": material.epsilon,
                    "unit": "-",
                    "description": "Buckling parameter"
                }
            }
        },
        "capacities": {
            "description": "Design capacities",
            "calculations": {
                "M_Rd": {
                    "formula": "M_Rd = W_el × f_yd / 10⁶",
                    "substitution": `${geometry.W_el.toFixed(0)} × ${material.f_yd.toFixed(1)} / 10⁶`,
                    "value": raw_values.M_Rd,
                    "unit": "kNm",
                    "description": "Design moment resistance"
                },
                "unit_weight": {
                    "formula": "Unit Weight = A_total × ρ_steel × 10⁻⁶",
                    "substitution": `${areas.A_total} × ${inputs.rho_steel} × 10⁻⁶`,
                    "value": raw_values.unit_weight,
                    "unit": "kg/m",
                    "description": "Unit weight per meter"
                }
            }
        },
        "classification": {
            "description": "Cross-section element classification per Eurocode 3",
            "elements": {
                "upper_flange": {
                    "type": "Internal compression",
                    "c_over_t": inputs.b_o / inputs.t_o,
                    "limit": 42 * material.epsilon,
                    "class": classification.upper_flange_class,
                    "check": (inputs.b_o / inputs.t_o) <= (42 * material.epsilon) ? "PASS" : "FAIL"
                },
                "lower_flange_inner": {
                    "type": "Internal compression",
                    "c_over_t": inputs.b_u / inputs.t_u,
                    "limit": 42 * material.epsilon,
                    "class": classification.lower_flange_inner_class,
                    "check": (inputs.b_u / inputs.t_u) <= (42 * material.epsilon) ? "PASS" : "FAIL"
                },
                "lower_flange_outer": {
                    "type": "External compression", 
                    "c_over_t": derived.c_u / inputs.t_u,
                    "limit": 14 * material.epsilon,
                    "class": classification.lower_flange_outer_class,
                    "check": (derived.c_u / inputs.t_u) <= (14 * material.epsilon) ? "PASS" : "FAIL"
                },
                "web": {
                    "type": "Internal bending",
                    "c_over_t": derived.h_w / inputs.t_w,
                    "limit": "Depends on stress distribution",
                    "class": classification.web_class,
                    "check": "Based on bending stress distribution"
                },
                "overall": {
                    "class": classification.overall_class,
                    "description": "Governing element class determines overall section class"
                }
            }
        }
    };
}

// API Handler for external POST requests
function handleApiRequest(data) {
    try {
        // Handle single calculation or batch
        if (Array.isArray(data)) {
            return processBatch(data);
        } else {
            return processSingle(data);
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Process single calculation
function processSingle(params) {
    try {
        const results = calculateFromParams(params);
        
        // Generate detailed calculations for API response
        const detailedCalculations = generateDetailedCalculations(results);
        
        return {
            success: true,
            input: params,
            detailed_calculations: detailedCalculations,
            results: {
                // Final results for easy access
                unit_weight: parseFloat(results.results.unit_weight),
                unit_weight_unit: "kg/m",
                M_Rd: parseFloat(results.results.M_Rd),
                M_Rd_unit: "kNm",
                H_tot: parseFloat(results.results.H_tot),
                H_tot_unit: "mm",
                A_total: parseFloat(results.results.A_total),
                A_total_unit: "mm²",
                z_NA: parseFloat(results.results.z_NA),
                z_NA_unit: "mm",
                I_y: parseFloat(results.results.I_y),
                I_y_unit: "×10⁸ mm⁴",
                W_el: parseFloat(results.results.W_el),
                W_el_unit: "×10³ mm³",
                f_yd: parseFloat(results.results.f_yd),
                f_yd_unit: "MPa",
                epsilon: parseFloat(results.results.epsilon),
                epsilon_unit: "-",
                overall_classification: results.classification.overall_class,
                upper_flange_class: results.classification.upper_flange_class,
                lower_flange_inner_class: results.classification.lower_flange_inner_class,
                lower_flange_outer_class: results.classification.lower_flange_outer_class,
                web_class: results.classification.web_class
            },
            // Include raw calculation results for backward compatibility
            calculation_details: results,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            input: params,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Process batch of calculations
function processBatch(paramsArray) {
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < paramsArray.length; i++) {
        try {
            const calcResult = calculateFromParams(paramsArray[i]);
            results.push({
                index: i,
                success: true,
                input: paramsArray[i],
                results: calcResult
            });
            successCount++;
        } catch (error) {
            results.push({
                index: i,
                success: false,
                input: paramsArray[i],
                error: error.message
            });
            errorCount++;
        }
    }

    return {
        success: errorCount === 0,
        batch_size: paramsArray.length,
        successful: successCount,
        failed: errorCount,
        results: results,
        timestamp: new Date().toISOString()
    };
}

// Set up API endpoint handling
function setupApiHandling() {
    // Listen for POST requests to this page
    if (typeof window !== 'undefined' && window.location) {
        // Expose API function globally for external access
        window.thpCalculate = handleApiRequest;
        
        // Handle direct POST requests (for fetch/XMLHttpRequest)
        const originalFetch = window.fetch;
        
        // Note: This is a conceptual approach. In practice, the calling script
        // would need to use the exposed thpCalculate function directly.
        console.log('THP Calculator API ready. Use window.thpCalculate(data) for programmatic access.');
    }
}

// Utility function to copy text to clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent || element.innerText;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            // Show temporary feedback
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.backgroundColor = '#10b981';
            
            setTimeout(function() {
                button.textContent = originalText;
                button.style.backgroundColor = '';
            }, 2000);
        }).catch(function(err) {
            console.error('Failed to copy text: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-999px";
    textArea.style.left = "-999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        const msg = successful ? 'successful' : 'unsuccessful';
        console.log('Fallback: Copying text command was ' + msg);
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

// Test API functionality
function testAPI() {
    console.log('Testing THP Calculator API...');
    
    // Test single calculation
    const testParams = {
        b_o: 188, t_o: 25, H: 200,
        t_w: 6, b_u: 450, t_u: 15,
        f_yk: 355, gamma_M0: 1.05, rho_steel: 7850
    };
    
    console.log('Single calculation test:');
    const singleResult = handleApiRequest(testParams);
    console.log(singleResult);
    
    // Test batch calculation
    const batchParams = [
        testParams,
        { ...testParams, b_u: 400 },
        { ...testParams, b_u: 500 }
    ];
    
    console.log('Batch calculation test:');
    const batchResult = handleApiRequest(batchParams);
    console.log(batchResult);
    
    // Test error handling
    console.log('Error handling test:');
    const errorResult = handleApiRequest({ b_o: 'invalid' });
    console.log(errorResult);
    
    console.log('API tests completed. Check results above.');
    return { singleResult, batchResult, errorResult };
}

// Initialize calculation on page load
document.addEventListener('DOMContentLoaded', function() {
    calculate();
    setupApiHandling();
    
    // Run API tests in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Development environment detected. Running API tests...');
        setTimeout(() => testAPI(), 1000);
    }
});