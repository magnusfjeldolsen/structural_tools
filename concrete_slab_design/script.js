/**
 * Concrete Slab Design Calculator - Main Script
 * Based on Eurocode 2 (EC2) standards
 */

// Utility functions
function toFixedIfNeeded(num, digits = 2) {
    return parseFloat(num.toFixed(digits));
}

function evaluateExpression(expr) {
    try {
        if (typeof expr === 'number') return expr;
        if (typeof expr !== 'string') throw new Error('Invalid expression type');
        
        // Remove any characters that aren't numbers, operators, parentheses, or decimals
        const sanitized = expr.replace(/[^0-9+\-*/().\s^]/g, '');
        
        // Replace ^ with ** for JavaScript exponentiation
        const jsExpression = sanitized.replace(/\^/g, '**');
        
        // Use Function constructor for safer evaluation than eval()
        const result = new Function('return ' + jsExpression)();
        
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation result');
        }
        
        return result;
    } catch (error) {
        throw new Error(`Expression evaluation error: ${error.message}`);
    }
}

// Update concrete properties based on grade selection
function updateConcreteProperties() {
    const grade = document.getElementById('concrete_grade').value;
    const fckInput = document.getElementById('fck');
    
    // Enable/disable fck input based on selection
    if (grade === 'custom') {
        fckInput.disabled = false;
        fckInput.style.backgroundColor = '#4b5563';
    } else {
        fckInput.disabled = true;
        fckInput.style.backgroundColor = '#374151';
        
        // Set fck based on grade
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
    
    const fcd = fck * alphaCc / gammaC;
    document.getElementById('fcd_display').textContent = toFixedIfNeeded(fcd);
}

// Update fyd calculation
function updateFyd() {
    const fyk = parseFloat(document.getElementById('fyk').value) || 500;
    const gammaS = parseFloat(document.getElementById('gamma_s').value) || 1.15;
    
    const fyd = fyk / gammaS;
    document.getElementById('fyd_display').textContent = toFixedIfNeeded(fyd);
}

// Update rebar area calculation
function updateRebarArea() {
    const phi_l = parseFloat(document.getElementById('phi_l').value) || 12;
    const cc_l = parseFloat(document.getElementById('cc_l').value) || 200;
    
    // Calculate rebar area per meter: π × φ² / 4 × (1000 / cc)
    const rebarArea = Math.PI * Math.pow(phi_l, 2) / 4 * (1000 / cc_l);
    document.getElementById('rebar_area_display').textContent = toFixedIfNeeded(rebarArea);
}

// Shear capacity calculation function (following PDF methodology)
function calculateShearCapacity(NEd, h, b, d, Asl, fck, gammaC, k1_input) {
    // Axial stress calculation (σc = NEd / Ac, where Ac = b × h)
    const Ac = b * h; // mm²
    const sigma_c = NEd * 1000 / Ac; // Convert NEd from kN to N, result in MPa
    
    // σcp calculation (min of σc and 0.2×fcd)
    const fcd = fck * 0.85 / gammaC; // Design concrete strength
    const sigma_cp = Math.min(sigma_c, 0.2 * fcd);
    
    // k1 factor (user input - aggregate dependent, typically 0.15 or 0.18)
    const k1 = k1_input;
    
    // Reinforcement parameters
    const rho_l_actual = Asl / (b * d); // Actual longitudinal reinforcement ratio
    const rho_l = Math.min(rho_l_actual, 0.02); // Limited to max 0.02 as per EC2
    
    // k factor (size effect)
    const k = Math.min(1 + Math.sqrt(200 / d), 2); // d in mm
    
    // CRd,c calculation (CRd,c = k1 / γc)
    const CRd_c = k1 / gammaC;
    
    // VRd,c,0 calculation (first formula from PDF)
    const VRd_c_0_part1 = CRd_c * k * Math.pow(100 * rho_l * fck, 1/3); // MPa
    const VRd_c_0_part2 = k1 * sigma_cp; // MPa
    const VRd_c_0_stress = VRd_c_0_part1 + VRd_c_0_part2; // Total stress in MPa
    const VRd_c_0 = VRd_c_0_stress * b * d / 1000; // Convert to kN
    
    // v_min calculation (minimum shear resistance)
    const v_min = 0.035 * Math.pow(k, 1.5) * Math.pow(fck, 0.5); // MPa
    const V_min = v_min * b * d / 1000; // Convert to kN (this is V_min, not VRd_c_min)
    
    // Final VRd,c (maximum of VRd,c,0 and V_min)
    const VRd_c = Math.max(VRd_c_0, V_min);
    
    return {
        Ac: toFixedIfNeeded(Ac),
        sigma_c: toFixedIfNeeded(sigma_c, 4),
        sigma_cp: toFixedIfNeeded(sigma_cp, 4),
        k1: toFixedIfNeeded(k1, 2),
        rho_l_actual: toFixedIfNeeded(rho_l_actual, 6), // Actual ratio dimensionless
        rho_l: toFixedIfNeeded(rho_l, 6), // Limited ratio dimensionless for calculation
        k: toFixedIfNeeded(k, 2),
        CRd_c: toFixedIfNeeded(CRd_c, 3),
        VRd_c_0_stress: toFixedIfNeeded(VRd_c_0_stress, 4),
        VRd_c_0: toFixedIfNeeded(VRd_c_0, 2),
        v_min: toFixedIfNeeded(v_min, 4),
        V_min: toFixedIfNeeded(V_min, 2),
        VRd_c: toFixedIfNeeded(VRd_c, 2)
    };
}

// Main calculation function based on PDF methodology
function calculateConcreteSlab() {
    try {
        // Get input values
        const MEd = evaluateExpression(document.getElementById('MEd').value.trim());
        const NEd = parseFloat(document.getElementById('NEd').value) || 0; // axial force for shear design
        const h = parseFloat(document.getElementById('t').value); // slab thickness (h in PDF)
        const c = parseFloat(document.getElementById('c').value);
        const cc = parseFloat(document.getElementById('cc_l').value); // bar spacing
        const phi_l = parseFloat(document.getElementById('phi_l').value); // bar diameter
        
        // Material properties
        const fck = parseFloat(document.getElementById('fck').value);
        const alphaCc = parseFloat(document.getElementById('alpha_cc').value);
        const gammaC = parseFloat(document.getElementById('gamma_c').value);
        const k1 = parseFloat(document.getElementById('k1').value);
        const fyk = parseFloat(document.getElementById('fyk').value);
        const gammaS = parseFloat(document.getElementById('gamma_s').value);
        
        // Calculate design strengths
        const fcd = fck * alphaCc / gammaC;
        const fyd = fyk / gammaS;
        
        // Geometry calculations (following PDF)
        const d = h - c - phi_l / 2; // effective depth
        const b = 1000; // width per meter (mm)
        
        // Reinforcement area per meter (following PDF formula)
        const Asl = Math.PI * Math.pow(phi_l, 2) / 4 * (1000 / cc);
        
        // ULS Capacities (following PDF methodology)
        
        // Concrete moment capacity (PDF: MRd,c = 0.275 * b * d² * fcd)
        const MRd_c_Nm = 0.275 * b * Math.pow(d, 2) * fcd;
        const MRd_c = MRd_c_Nm / 1000000; // Convert to kNm
        
        // Lever arm calculation (following PDF)
        const z_095d = 0.95 * d;
        const z_bal = d * (1 - 0.17 * MEd * 1000000 / MRd_c_Nm); // z_bal from PDF formula
        const z = Math.min(z_095d, z_bal);
        
        // Steel moment capacity (PDF: MRd,s = Asl * fyd * z)
        const MRd_s_Nm = Asl * fyd * z;
        const MRd_s = MRd_s_Nm / 1000000; // Convert to kNm
        
        // Final moment capacity
        const MRd = Math.min(MRd_c, MRd_s);
        
        // === SHEAR CAPACITY CALCULATIONS (following PDF methodology) ===
        const shearCalc = calculateShearCapacity(NEd, h, b, d, Asl, fck, gammaC, k1);
        
        // Utilization
        const utilization = (MEd / MRd) * 100;
        
        // Status determination
        let status = "OK";
        let statusClass = "text-green-400";
        const messages = [];
        
        if (utilization > 100) {
            status = "FAILED";
            statusClass = "text-red-400";
            messages.push("Moment capacity exceeded");
        } else if (utilization > 85) {
            status = "HIGH_UTILIZATION";
            statusClass = "text-yellow-400";
            messages.push("High utilization");
        }
        
        // Governing capacity
        const governing = MRd_c < MRd_s ? "concrete" : "steel";
        if (governing === "concrete") {
            messages.push("Concrete capacity governs");
        } else {
            messages.push("Steel capacity governs");
        }
        
        return {
            success: true,
            inputs: {
                MEd, NEd, h, c, cc, phi_l, fck, alphaCc, gammaC, k1, fyk, gammaS, fcd, fyd
            },
            calculations: {
                b, d, Asl, z_095d, z_bal, z, MRd_c, MRd_s, MRd,
                shear: shearCalc
            },
            results: {
                utilization: toFixedIfNeeded(utilization, 1),
                status,
                statusClass,
                messages: messages.join(', '),
                governing
            }
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Display results in the UI
function displayResults(result) {
    if (!result.success) {
        alert('Calculation failed: ' + result.error);
        return;
    }
    
    const calc = result.calculations;
    const inputs = result.inputs;
    const res = result.results;
    const shear = calc.shear;
    
    const resultsHTML = `
    <div class="mb-6">
        <h2 class="text-2xl font-bold text-blue-400 mb-4">ULS Calculation Results</h2>
    </div>
    
    <!-- Summary of Results (moved to top) -->
    <div class="mt-8 p-6 bg-gray-800 rounded-lg border-l-4 border-blue-500 mb-6">
        <h3 class="text-xl font-bold text-white mb-4">Summary of Results</h3>
        <div class="grid md:grid-cols-2 gap-6 text-sm">
            <div>
                <h4 class="font-semibold text-blue-400 mb-2">Moment Capacity</h4>
                <p><span class="text-gray-300">M<sub>Rd,c</sub> =</span> <span class="font-mono text-white">${toFixedIfNeeded(calc.MRd_c)} kNm</span></p>
                <p><span class="text-gray-300">M<sub>Rd,s</sub> =</span> <span class="font-mono text-white">${toFixedIfNeeded(calc.MRd_s)} kNm</span></p>
                <p><span class="text-gray-300">M<sub>Rd</sub> =</span> <span class="font-mono text-white">${toFixedIfNeeded(calc.MRd)} kNm</span></p>
                <p class="text-sm mt-1 text-gray-400">${res.governing} capacity governs</p>
            </div>
            <div>
                <h4 class="font-semibold text-green-400 mb-2">Utilization</h4>
                <p><span class="text-gray-300">M<sub>Ed</sub> =</span> <span class="font-mono text-white">${toFixedIfNeeded(inputs.MEd)} kNm</span></p>
                <p class="mt-2"><span class="text-gray-300">Utilization:</span> <span class="font-mono ${res.statusClass}">${res.utilization}%</span></p>
                <p class="text-sm mt-1 ${res.statusClass}">
                    ${res.status} - ${res.messages}
                </p>
            </div>
        </div>
        <div class="grid md:grid-cols-1 gap-6 text-sm mt-6 pt-4 border-t border-gray-600">
            <div>
                <h4 class="font-semibold text-red-400 mb-2">Shear Capacity</h4>
                <p><span class="text-gray-300">V<sub>Rd,c</sub> =</span> <span class="font-mono text-white">${shear.VRd_c} kN</span></p>
                <p><span class="text-gray-300">N<sub>Ed</sub> =</span> <span class="font-mono text-white">${toFixedIfNeeded(inputs.NEd)} kN</span> <span class="text-xs text-gray-400">(${inputs.NEd >= 0 ? 'compression' : 'tension'})</span></p>
            </div>
        </div>
    </div>
    
    <!-- Geometry Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-blue-300">Geometry</h3>
        </div>
        <div class="calc-content">
            <div class="calc-row">
                <span class="calc-label">M<sub>Ed</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.MEd)} kNm</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">h</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.h)} mm</span>
                <span class="calc-label ml-6">c</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.c)} mm</span>
                <span class="calc-label ml-6">b</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${calc.b} mm</span>
            </div>
            <div class="calc-separator"></div>
            <div class="calc-row">
                <span class="calc-label">d</span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">h - c - φ<sub>l</sub>/2 = ${toFixedIfNeeded(inputs.h)} - ${toFixedIfNeeded(inputs.c)} - ${toFixedIfNeeded(inputs.phi_l)}/2</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.d)} mm</span>
            </div>
        </div>
    </div>

    <!-- Reference Diagram -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-gray-300">Reference Diagram</h3>
        </div>
        <div class="calc-content">
            <div class="flex justify-start">
                <div class="bg-white p-4 rounded-lg">
                    <img src="calculations.png" alt="Calculation symbols and figure" class="w-full h-auto rounded max-w-md" />
                </div>
            </div>
        </div>
    </div>

    <!-- Concrete Material Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-yellow-300">Concrete Material</h3>
        </div>
        <div class="calc-content">
            <div class="calc-row">
                <span class="calc-label">f<sub>ck</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.fck)} MPa</span>
                <span class="calc-label ml-6">α<sub>cc</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.alphaCc)}</span>
                <span class="calc-label ml-6">γ<sub>c</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.gammaC)}</span>
            </div>
            <div class="calc-separator"></div>
            <div class="calc-row">
                <span class="calc-label">f<sub>cd</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">f<sub>ck</sub> × α<sub>cc</sub> / γ<sub>c</sub> = ${toFixedIfNeeded(inputs.fck)} × ${toFixedIfNeeded(inputs.alphaCc)} / ${toFixedIfNeeded(inputs.gammaC)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.fcd)} MPa</span>
            </div>
        </div>
    </div>

    <!-- Steel Material Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-red-300">Steel Material</h3>
        </div>
        <div class="calc-content">
            <div class="calc-row">
                <span class="calc-label">f<sub>yk</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.fyk)} MPa</span>
                <span class="calc-label ml-6">γ<sub>s</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.gammaS)}</span>
            </div>
            <div class="calc-separator"></div>
            <div class="calc-row">
                <span class="calc-label">f<sub>yd</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">f<sub>yk</sub> / γ<sub>s</sub> = ${toFixedIfNeeded(inputs.fyk)} / ${toFixedIfNeeded(inputs.gammaS)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.fyd)} MPa</span>
            </div>
        </div>
    </div>

    <!-- Reinforcement Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-green-300">Reinforcement</h3>
        </div>
        <div class="calc-content">
            <div class="calc-row">
                <span class="calc-label">φ<sub>l</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.phi_l)} mm</span>
                <span class="calc-label ml-6">cc</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(inputs.cc)} mm</span>
            </div>
            <div class="calc-separator"></div>
            <div class="calc-row">
                <span class="calc-label">A<sub>sl</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">π × φ<sub>l</sub>² / 4 × (1000 / cc) = π × ${toFixedIfNeeded(inputs.phi_l)}² / 4 × (1000 / ${toFixedIfNeeded(inputs.cc)})</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.Asl)} mm²</span>
            </div>
        </div>
    </div>

    <!-- ULS Capacities Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-red-300">ULS - Capacities</h3>
        </div>
        <div class="calc-content">
            <h4 class="text-md font-medium text-blue-200 mb-3 border-b border-gray-600 pb-1">Concrete Moment Capacity</h4>
            <div class="calc-row">
                <span class="calc-label">M<sub>Rd,c</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">0.275 × b × d² × f<sub>cd</sub> = 0.275 × ${calc.b} × ${toFixedIfNeeded(calc.d)}² × ${toFixedIfNeeded(inputs.fcd)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.MRd_c)} kNm</span>
            </div>
            
            <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Lever Arm</h4>
            <div class="calc-row">
                <span class="calc-label">z<sub>bal</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">d × (1 - 0.17 × M<sub>Ed</sub> / M<sub>Rd,c</sub>) = ${toFixedIfNeeded(calc.d)} × (1 - 0.17 × ${toFixedIfNeeded(inputs.MEd)} / ${toFixedIfNeeded(calc.MRd_c)})</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.z_bal)} mm</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">z</span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">min(0.95d, z<sub>bal</sub>) = min(${toFixedIfNeeded(calc.z_095d)}, ${toFixedIfNeeded(calc.z_bal)})</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.z)} mm</span>
            </div>
            
            <h4 class="text-md font-medium text-green-200 mb-3 mt-6 border-b border-gray-600 pb-1">Steel Moment Capacity</h4>
            <div class="calc-row">
                <span class="calc-label">M<sub>Rd,s</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">A<sub>sl</sub> × f<sub>yd</sub> × z = ${toFixedIfNeeded(calc.Asl)} × ${toFixedIfNeeded(inputs.fyd)} × ${toFixedIfNeeded(calc.z)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(calc.MRd_s)} kNm</span>
            </div>
            
            <div class="calc-separator mt-6"></div>
            <div class="calc-row">
                <span class="calc-label text-xl font-bold">M<sub>Rd</sub></span>
                <span class="calc-equals text-xl">=</span>
                <span class="calc-expression">min(M<sub>Rd,c</sub>, M<sub>Rd,s</sub>) = min(${toFixedIfNeeded(calc.MRd_c)}, ${toFixedIfNeeded(calc.MRd_s)})</span>
                <span class="calc-equals text-xl">=</span>
                <span class="calc-value text-xl font-bold text-green-400">${toFixedIfNeeded(calc.MRd)} kNm</span>
            </div>
        </div>
    </div>
    
    <!-- Shear Capacity Calculations Box -->
    <div class="calc-box mb-6">
        <div class="calc-header">
            <h3 class="text-lg font-semibold text-red-300">ULS - Shear Capacity</h3>
        </div>
        <div class="calc-content">
            <h4 class="text-md font-medium text-blue-200 mb-3 border-b border-gray-600 pb-1">Axial Stress</h4>
            <div class="calc-row">
                <span class="calc-label">A<sub>c</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">b × h = ${calc.b} × ${toFixedIfNeeded(inputs.h)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.Ac} mm²</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">σ<sub>c</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">N<sub>Ed</sub> / A<sub>c</sub> = ${toFixedIfNeeded(inputs.NEd)} / ${shear.Ac}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.sigma_c} MPa</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">σ<sub>cp</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">min(σ<sub>c</sub>, 0.2f<sub>cd</sub>) = min(${shear.sigma_c}, ${toFixedIfNeeded(0.2 * inputs.fcd, 4)})</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.sigma_cp} MPa</span>
            </div>
            
            <h4 class="text-md font-medium text-purple-200 mb-3 mt-6 border-b border-gray-600 pb-1">Shear Parameters</h4>
            <div class="calc-row">
                <span class="calc-label">k<sub>1</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">aggregate factor (input)</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.k1}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">ρ<sub>l,actual</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">A<sub>sl</sub> / (b × d) = ${toFixedIfNeeded(calc.Asl)} / (${calc.b} × ${toFixedIfNeeded(calc.d)})</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.rho_l_actual}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">ρ<sub>l</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">min(ρ<sub>l,actual</sub>, 0.02) = min(${shear.rho_l_actual}, 0.02)</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.rho_l}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">k</span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">min(1 + √(200/d), 2) = min(1 + √(200/${toFixedIfNeeded(calc.d)}), 2)</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.k}</span>
            </div>
            
            <h4 class="text-md font-medium text-green-200 mb-3 mt-6 border-b border-gray-600 pb-1">Shear Resistance</h4>
            <div class="calc-row">
                <span class="calc-label">C<sub>Rd,c</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">k<sub>1</sub> / γ<sub>c</sub> = ${toFixedIfNeeded(inputs.k1)} / ${toFixedIfNeeded(inputs.gammaC)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.CRd_c}</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">V<sub>Rd,c,0</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">[C<sub>Rd,c</sub> × k × (100ρ<sub>l</sub>f<sub>ck</sub>)<sup>1/3</sup> + k<sub>1</sub>σ<sub>cp</sub>] × b × d</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.VRd_c_0} kN</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">v<sub>min</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">0.035 × k<sup>1.5</sup> × f<sub>ck</sub><sup>0.5</sup></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.v_min} MPa</span>
            </div>
            <div class="calc-row">
                <span class="calc-label">V<sub>min</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-expression">v<sub>min</sub> × b × d = ${shear.v_min} × ${calc.b} × ${toFixedIfNeeded(calc.d)}</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${shear.V_min} kN</span>
            </div>
            
            <div class="calc-separator mt-6"></div>
            <div class="calc-row">
                <span class="calc-label text-xl font-bold">V<sub>Rd,c</sub></span>
                <span class="calc-equals text-xl">=</span>
                <span class="calc-expression">max(V<sub>Rd,c,0</sub>, V<sub>min</sub>) = max(${shear.VRd_c_0}, ${shear.V_min})</span>
                <span class="calc-equals text-xl">=</span>
                <span class="calc-value text-xl font-bold text-green-400">${shear.VRd_c} kN</span>
            </div>
        </div>
    </div>
    `;
    
    const container = document.getElementById('calc-steps');
    container.innerHTML = resultsHTML;
    document.getElementById('results').style.display = 'block';
    document.getElementById('print-btn').style.display = 'block';

    // Scroll to results
    document.getElementById('results').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Main calculate function called by button
function calculateAndShow() {
    const result = calculateConcreteSlab();
    displayResults(result);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    updateConcreteProperties();
    updateFyd();
    updateRebarArea();
    
    // Add event listeners for real-time updates
    document.getElementById('fck').addEventListener('input', updateFcd);
    document.getElementById('alpha_cc').addEventListener('input', updateFcd);
    document.getElementById('gamma_c').addEventListener('input', updateFcd);
    document.getElementById('fyk').addEventListener('input', updateFyd);
    document.getElementById('gamma_s').addEventListener('input', updateFyd);
    document.getElementById('phi_l').addEventListener('input', updateRebarArea);
    document.getElementById('cc_l').addEventListener('input', updateRebarArea);
});

// Utility functions for clipboard functionality
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