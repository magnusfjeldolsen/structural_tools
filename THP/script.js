// Two-Sided Hat Profile Calculator
// Based on Eurocode 3 standards

function calculate() {
    // Get input values
    const b_o = parseFloat(document.getElementById('b_o').value);
    const t_o = parseFloat(document.getElementById('t_o').value);
    const H = parseFloat(document.getElementById('H').value);
    const t_w = parseFloat(document.getElementById('t_w').value);
    const b_u = parseFloat(document.getElementById('b_u').value);
    const t_u = parseFloat(document.getElementById('t_u').value);
    const f_yk = parseFloat(document.getElementById('f_yk').value);
    const gamma_M0 = parseFloat(document.getElementById('gamma_M0').value);

    // Validate inputs
    if (isNaN(b_o) || isNaN(t_o) || isNaN(H) || isNaN(t_w) || isNaN(b_u) || isNaN(t_u) || isNaN(f_yk) || isNaN(gamma_M0)) {
        alert('Please enter valid numeric values for all fields.');
        return;
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

    // Cross-section classification
    const classification = classifySection(b_o, t_o, b_u, t_u, c_u, h_w, t_w, z_NA, H_tot, epsilon);

    // Update results in HTML
    updateResults({
        H_tot: H_tot.toFixed(1),
        A_total: A_total.toFixed(0),
        z_NA: z_NA.toFixed(1),
        I_y: (I_y / 1e8).toFixed(4), // Convert to cm⁴
        W_el: (W_el / 1000).toFixed(1), // Convert to cm³
        f_yd: f_yd.toFixed(1),
        epsilon: epsilon.toFixed(3),
        M_Rd: M_Rd.toFixed(1),
        ...classification
    });

    // Generate step-by-step calculations
    generateStepCalculations({
        b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0,
        h_w, H_tot, c_u, A_o, A_w, A_u, A_total,
        z_NA, I_y_u, I_y_o, I_y_w, I_y, z_max, W_el,
        f_yd, epsilon, M_Rd, classification
    });

    // Draw diagram
    drawCrossSection(b_o, t_o, H, t_w, b_u, t_u, z_NA);
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
        b_o, t_o, H, t_w, b_u, t_u, f_yk, gamma_M0,
        h_w, H_tot, c_u, A_o, A_w, A_u, A_total,
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

// Initialize calculation on page load
document.addEventListener('DOMContentLoaded', function() {
    calculate();
});