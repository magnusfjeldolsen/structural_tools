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

    const container = document.getElementById('step-calculations');
    container.innerHTML = '';

    // Helper function to create math expressions
    function createMathLine(expression, result = '', unit = '') {
        const resultText = result ? `${result} ${unit}`.trim() : '';
        return `
            <div class="math-line">
                <div class="math-expression">${expression}</div>
                ${resultText ? `<div class="math-result">${resultText}</div>` : ''}
            </div>
        `;
    }
    
    // Helper function to create simple value assignments with units
    function createValueLine(variable, value, unit = '') {
        return `
            <div class="math-line">
                <div class="math-expression">${formatVar(variable)} ${formatOp('=')} ${formatNum(value)} ${unit ? formatUnit(unit) : ''}</div>
            </div>
        `;
    }

    function formatVar(name) {
        return `<span class="math-variable">${name}</span>`;
    }

    function formatOp(op) {
        return `<span class="math-operator">${op}</span>`;
    }

    function formatNum(num) {
        return `<span class="math-number">${num}</span>`;
    }

    function formatUnit(unit) {
        return `<span class="math-unit">${unit}</span>`;
    }

    const steps = `
        <div class="calculation-step">
            <div class="step-title">1. Input Parameters</div>
            ${createValueLine('b₀', b_o, 'mm')}
            ${createValueLine('t₀', t_o, 'mm')}
            ${createValueLine('H', H, 'mm')}
            ${createValueLine('tₘ', t_w, 'mm')}
            ${createValueLine('bᵤ', b_u, 'mm')}
            ${createValueLine('tᵤ', t_u, 'mm')}
            ${createValueLine('fᵧₖ', f_yk, 'MPa')}
            ${createValueLine('γₘ₀', gamma_M0)}
        </div>

        <div class="calculation-step">
            <div class="step-title">2. Derived Dimensions</div>
            ${createMathLine(`${formatVar('hₘ')} ${formatOp('=')} ${formatVar('H')} ${formatOp('-')} ${formatVar('tₘ')} ${formatOp('=')} ${formatNum(H)} ${formatOp('-')} ${formatNum(t_w)}`, h_w.toFixed(1), 'mm')}
            ${createMathLine(`${formatVar('H_tot')} ${formatOp('=')} ${formatVar('H')} ${formatOp('+')} ${formatVar('tᵤ')} ${formatOp('=')} ${formatNum(H)} ${formatOp('+')} ${formatNum(t_u)}`, H_tot.toFixed(1), 'mm')}
            ${createMathLine(`${formatVar('cᵤ')} ${formatOp('=')} \\frac{${formatVar('bᵤ')} - 2${formatVar('tₘ')} - ${formatVar('b₀')}}{2} ${formatOp('=')} \\frac{${formatNum(b_u)} - 2 \\times ${formatNum(t_w)} - ${formatNum(b_o)}}{2}`, c_u.toFixed(1), 'mm')}
        </div>

        <div class="calculation-step">
            <div class="step-title">3. Cross-Sectional Areas</div>
            
            <div class="subsection">
                <div class="subsection-title">Upper Flange Area:</div>
                ${createMathLine(`${formatVar('A₀')} ${formatOp('=')} ${formatVar('b₀')} ${formatOp('×')} ${formatVar('t₀')} ${formatOp('=')} ${formatNum(b_o)} ${formatOp('×')} ${formatNum(t_o)}`, A_o.toFixed(0), 'mm²')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Web Area (both webs):</div>
                ${createMathLine(`${formatVar('Aₘ')} ${formatOp('=')} ${formatVar('hₘ')} ${formatOp('×')} ${formatVar('tₘ')} ${formatOp('×')} 2 ${formatOp('=')} ${formatNum(h_w.toFixed(1))} ${formatOp('×')} ${formatNum(t_w)} ${formatOp('×')} 2`, A_w.toFixed(0), 'mm²')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Lower Flange Area:</div>
                ${createMathLine(`${formatVar('Aᵤ')} ${formatOp('=')} ${formatVar('tᵤ')} ${formatOp('×')} ${formatVar('bᵤ')} ${formatOp('=')} ${formatNum(t_u)} ${formatOp('×')} ${formatNum(b_u)}`, A_u.toFixed(0), 'mm²')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Total Area:</div>
                ${createMathLine(`${formatVar('A_total')} ${formatOp('=')} ${formatVar('A₀')} ${formatOp('+')} ${formatVar('Aₘ')} ${formatOp('+')} ${formatVar('Aᵤ')} ${formatOp('=')} ${formatNum(A_o.toFixed(0))} ${formatOp('+')} ${formatNum(A_w.toFixed(0))} ${formatOp('+')} ${formatNum(A_u.toFixed(0))}`, A_total.toFixed(0), 'mm²')}
            </div>
        </div>

        <div class="calculation-step">
            <div class="step-title">4. Neutral Axis Position</div>
            <div class="subsection">
                <div class="subsection-title">Distance from bottom of lower flange:</div>
                ${createMathLine(`$$${formatVar('z_{NA}')} = \\frac{${formatVar('A_u')} \\times \\frac{${formatVar('t_u')}}{2} + ${formatVar('A_w')} \\times \\left(${formatVar('t_u')} + \\frac{${formatVar('h_w')}}{2}\\right) + ${formatVar('A_0')} \\times \\left(${formatVar('H_{tot}')} - \\frac{${formatVar('t_0')}}{2}\\right)}{${formatVar('A_{total}')}$$`)}
                ${createMathLine(`$$${formatVar('z_{NA}')} = \\frac{${formatNum(A_u.toFixed(0))} \\times ${formatNum((t_u/2).toFixed(1))} + ${formatNum(A_w.toFixed(0))} \\times ${formatNum((t_u + h_w/2).toFixed(1))} + ${formatNum(A_o.toFixed(0))} \\times ${formatNum((H_tot - t_o/2).toFixed(1))}}{${formatNum(A_total.toFixed(0))}}$$`, z_NA.toFixed(1), 'mm')}
            </div>
        </div>

        <div class="calculation-step">
            <div class="step-title">5. Second Moment of Area</div>
            
            <div class="subsection">
                <div class="subsection-title">Lower Flange Contribution:</div>
                ${createMathLine(`$$${formatVar('I_{y,u}')} = \\frac{${formatVar('b_u')} \\times ${formatVar('t_u')}^3}{12} + ${formatVar('A_u')} \\times \\left(${formatVar('z_{NA}')} - \\frac{${formatVar('t_u')}}{2}\\right)^2$$`)}
                ${createMathLine(`$$${formatVar('I_{y,u}')} = \\frac{${formatNum(b_u)} \\times ${formatNum(t_u)}^3}{12} + ${formatNum(A_u.toFixed(0))} \\times \\left(${formatNum(z_NA.toFixed(1))} - ${formatNum((t_u/2).toFixed(1))}\\right)^2$$`, (I_y_u/1e7).toFixed(2), '×10⁷ mm⁴')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Upper Flange Contribution:</div>
                ${createMathLine(`$$${formatVar('I_{y,o}')} = \\frac{${formatVar('b_0')} \\times ${formatVar('t_0')}^3}{12} + ${formatVar('A_0')} \\times \\left(${formatVar('H_{tot}')} - \\frac{${formatVar('t_0')}}{2} - ${formatVar('z_{NA}')}\\right)^2$$`)}
                ${createMathLine(`$$${formatVar('I_{y,o}')} = \\frac{${formatNum(b_o)} \\times ${formatNum(t_o)}^3}{12} + ${formatNum(A_o.toFixed(0))} \\times \\left(${formatNum(H_tot.toFixed(1))} - ${formatNum((t_o/2).toFixed(1))} - ${formatNum(z_NA.toFixed(1))}\\right)^2$$`, (I_y_o/1e7).toFixed(2), '×10⁷ mm⁴')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Web Contribution:</div>
                ${createMathLine(`$$${formatVar('I_{y,w}')} = 2 \\times \\left[\\frac{${formatVar('t_w')}^3 \\times ${formatVar('h_w')}}{12} + \\frac{${formatVar('A_w')}}{2} \\times \\left(${formatVar('z_{NA}')} - \\left(${formatVar('t_u')} + \\frac{${formatVar('h_w')}}{2}\\right)\\right)^2\\right]$$`)}
                ${createMathLine(`$$${formatVar('I_{y,w}')} = 2 \\times \\left[\\frac{${formatNum(t_w)}^3 \\times ${formatNum(h_w.toFixed(1))}}{12} + ${formatNum((A_w/2).toFixed(0))} \\times \\left(${formatNum(z_NA.toFixed(1))} - ${formatNum((t_u + h_w/2).toFixed(1))}\\right)^2\\right]$$`, (I_y_w/1e7).toFixed(2), '×10⁷ mm⁴')}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Total Second Moment of Area:</div>
                ${createMathLine(`${formatVar('I_y')} ${formatOp('=')} ${formatVar('I_{y,u}')} + ${formatVar('I_{y,o}')} + ${formatVar('I_{y,w}')}`, (I_y/1e8).toFixed(4), '×10⁸ mm⁴')}
            </div>
        </div>

        <div class="calculation-step">
            <div class="step-title">6. Section Modulus</div>
            ${createMathLine(`${formatVar('z_{max}')} ${formatOp('=')} \\max(${formatVar('z_{NA}')}, ${formatVar('H_{tot}')} - ${formatVar('z_{NA}')}) ${formatOp('=')} \\max(${formatNum(z_NA.toFixed(1))}, ${formatNum((H_tot - z_NA).toFixed(1))})`, z_max.toFixed(1), 'mm')}
            ${createMathLine(`$$${formatVar('W_{el}')} = \\frac{${formatVar('I_y')}}{${formatVar('z_{max}')} = \\frac{${formatNum((I_y/1e8).toFixed(4))} \\times 10^8}{${formatNum(z_max.toFixed(1))}}$$`, (W_el/1000).toFixed(1), '×10³ mm³')}
        </div>

        <div class="calculation-step">
            <div class="step-title">7. Material Properties</div>
            ${createMathLine(`$$${formatVar('f_{yd}')} = \\frac{${formatVar('f_{yk}')}}{${formatVar('\\gamma_{M0}')} = \\frac{${formatNum(f_yk)}}{${formatNum(gamma_M0)}}$$`, f_yd.toFixed(1), 'MPa')}
            ${createMathLine(`$$${formatVar('\\varepsilon')} = \\sqrt{\\frac{235}{${formatVar('f_{yk}')}} = \\sqrt{\\frac{235}{${formatNum(f_yk)}}}$$`, epsilon.toFixed(3))}
        </div>

        <div class="calculation-step">
            <div class="step-title">8. Moment Resistance</div>
            ${createMathLine(`$$${formatVar('M_{Rd}')} = ${formatVar('W_{el}')} \\times ${formatVar('f_{yd}')} = ${formatNum((W_el/1000).toFixed(1))} \\times 10^3 \\times ${formatNum(f_yd.toFixed(1))} \\times 10^{-6}$$`, M_Rd.toFixed(1), 'kNm')}
        </div>

        <div class="calculation-step">
            <div class="step-title">9. Cross-Section Classification</div>
            
            <div class="subsection">
                <div class="subsection-title">Classification Criteria:</div>
                ${createMathLine(`Internal compression element: $$\\frac{c}{t} \\leq 42\\varepsilon \\rightarrow \\text{Class 3, else Class 4}$$`)}
                ${createMathLine(`External compression element: $$\\frac{c}{t} \\leq 14\\varepsilon \\rightarrow \\text{Class 3, else Class 4}$$`)}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Upper Flange (Internal Compression):</div>
                ${createMathLine(`$$\\frac{c}{t} = \\frac{${formatVar('b_0')}}{${formatVar('t_0')}} = \\frac{${formatNum(b_o)}}{${formatNum(t_o)}} = ${formatNum((b_o/t_o).toFixed(1))}$$`)}
                ${createMathLine(`$$42\\varepsilon = 42 \\times ${formatNum(epsilon.toFixed(3))} = ${formatNum((42*epsilon).toFixed(1))}$$`)}
                ${createMathLine(`${formatNum((b_o/t_o).toFixed(1))} ${(b_o/t_o) <= (42*epsilon) ? '≤' : '>'} ${formatNum((42*epsilon).toFixed(1))} → ${classification.upper_flange_class}`)}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Lower Flange Inner (Internal Compression):</div>
                ${createMathLine(`$$\\frac{c}{t} = \\frac{${formatVar('b_u')}}{${formatVar('t_u')}} = \\frac{${formatNum(b_u)}}{${formatNum(t_u)}} = ${formatNum((b_u/t_u).toFixed(1))}$$`)}
                ${createMathLine(`${formatNum((b_u/t_u).toFixed(1))} ${(b_u/t_u) <= (42*epsilon) ? '≤' : '>'} ${formatNum((42*epsilon).toFixed(1))} → ${classification.lower_flange_inner_class}`)}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Lower Flange Outer (External Compression):</div>
                ${createMathLine(`$$\\frac{c}{t} = \\frac{${formatVar('c_u')}}{${formatVar('t_u')}} = \\frac{${formatNum(c_u.toFixed(1))}}{${formatNum(t_u)}} = ${formatNum((c_u/t_u).toFixed(1))}$$`)}
                ${createMathLine(`$$14\\varepsilon = 14 \\times ${formatNum(epsilon.toFixed(3))} = ${formatNum((14*epsilon).toFixed(1))}$$`)}
                ${createMathLine(`${formatNum((c_u/t_u).toFixed(1))} ${(c_u/t_u) <= (14*epsilon) ? '≤' : '>'} ${formatNum((14*epsilon).toFixed(1))} → ${classification.lower_flange_outer_class}`)}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Web Classification (Bending):</div>
                ${createMathLine(`$$\\psi = \\text{stress ratio calculation based on neutral axis position}$$`)}
                ${createMathLine(`$$\\frac{c}{t} = \\frac{${formatVar('h_w')}}{${formatVar('t_w')}} = \\frac{${formatNum(h_w.toFixed(1))}}{${formatNum(t_w)}} = ${formatNum((h_w/t_w).toFixed(1))}$$`)}
                ${createMathLine(`Based on bending analysis → ${classification.web_class}`)}
            </div>
            
            <div class="subsection">
                <div class="subsection-title">Overall Classification:</div>
                ${createMathLine(`Overall section class = \\max(\\text{flange classes, web class}) = ${classification.overall_class}`)}
            </div>
        </div>
    `;

    container.innerHTML = steps;
    
    // Trigger MathJax to render the new content
    if (window.MathJax) {
        MathJax.typesetPromise([container]).catch((err) => console.log('MathJax error: ', err));
    }
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