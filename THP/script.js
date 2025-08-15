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