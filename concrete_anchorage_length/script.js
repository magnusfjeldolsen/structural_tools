/**
 * Concrete Anchorage Length Calculator
 * Based on Eurocode 2 Section 8.4
 */

// Safe mathematical expression evaluator
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

// Get concrete tensile strength (simplified - should ideally use EC2 table)
function getFctk005(fck) {
  // EC2 Table 3.1 approximation
  if (fck <= 50) {
    return 0.7 * 0.3 * Math.pow(fck, 2/3);
  } else {
    return 0.7 * 2.12 * Math.log(1 + (fck + 8) / 10);
  }
}

function calculateAnchorageLength() {
  // Get input values
  const SEd = evaluateExpression(document.getElementById('SEd').value);
  const phi_l = parseFloat(document.getElementById('phi_l').value);
  const n_l = parseFloat(document.getElementById('n_l').value);
  const phi_t = parseFloat(document.getElementById('phi_t').value);
  const fck = parseFloat(document.getElementById('fck').value);
  const fyk = parseFloat(document.getElementById('fyk').value);
  const gamma_c = parseFloat(document.getElementById('gamma_c').value);
  const gamma_s = parseFloat(document.getElementById('gamma_s').value);
  const alpha_cc = parseFloat(document.getElementById('alpha_cc').value);
  const c = parseFloat(document.getElementById('c').value);
  const c1 = parseFloat(document.getElementById('c1').value);
  const cc_phi_l = parseFloat(document.getElementById('cc_phi_l').value);

  // Get configuration
  const bond_condition = document.getElementById('bond_condition').value;
  const tension_compression = document.getElementById('tension_compression').value;
  const bar_type = document.getElementById('bar_type').value;
  const bar_shape = document.getElementById('bar_shape').value;
  const element_type = document.getElementById('element_type').value;
  const K = parseFloat(document.getElementById('K').value);

  // Advanced parameters
  const sigma_sEd_input = document.getElementById('sigma_sEd').value.trim();
  const n_l_orthogonal = parseFloat(document.getElementById('n_l_orthogonal').value);
  const alpha_4 = parseFloat(document.getElementById('alpha_4').value);
  const p = parseFloat(document.getElementById('p').value);

  const steps = [];

  // === CALCULATIONS ===
  steps.push('=== BASIC PARAMETERS ===');

  // Calculate rebar area
  const As_l = n_l * Math.PI * Math.pow(phi_l, 2) / 4;
  steps.push(`As_l = n_l × π × φ_l² / 4 = ${n_l} × π × ${phi_l}² / 4 = ${As_l.toFixed(2)} mm²`);

  // Calculate stress
  let sigma_sd;
  if (sigma_sEd_input === '') {
    // Auto-calculate from SEd
    const sigma_sEd = (SEd * 1000) / As_l; // Convert kN to N
    const fyd = fyk / gamma_s;
    sigma_sd = sigma_sEd;
    steps.push(`σ_sEd = SEd × 1000 / As_l = ${SEd} × 1000 / ${As_l.toFixed(2)} = ${sigma_sEd.toFixed(2)} MPa`);
    steps.push(`f_yd = f_yk / γ_s = ${fyk} / ${gamma_s} = ${fyd.toFixed(2)} MPa`);
    steps.push(`σ_sd = σ_sEd = ${sigma_sd.toFixed(2)} MPa (using actual stress)`);
  } else {
    sigma_sd = evaluateExpression(sigma_sEd_input);
    steps.push(`σ_sd = ${sigma_sd.toFixed(2)} MPa (manually specified)`);
  }

  // Clear spacing
  const a = cc_phi_l - phi_l;
  steps.push(`a = c/c_φl - φ_l = ${cc_phi_l} - ${phi_l} = ${a.toFixed(2)} mm`);

  // Calculate cd based on bar type (VLOOKUP equivalent)
  let cd;
  let cd_formula;
  if (bar_type === 'straight') {
    // Straight bars: cd = min(a/2, c1, c)
    cd = Math.min(a / 2, c1, c);
    cd_formula = `min(a/2, c1, c) = min(${(a/2).toFixed(2)}, ${c1}, ${c})`;
  } else if (bar_type === 'hooks') {
    // Angle hooks or hooks: cd = min(a/2, c1)
    cd = Math.min(a / 2, c1);
    cd_formula = `min(a/2, c1) = min(${(a/2).toFixed(2)}, ${c1})`;
  } else if (bar_type === 'loops') {
    // Loops: cd = c
    cd = c;
    cd_formula = `c`;
  }
  steps.push(`cd = ${cd_formula} = ${cd.toFixed(2)} mm (${bar_type === 'straight' ? 'straight bars' : bar_type === 'hooks' ? 'angle hooks/hooks' : 'loops'})`);

  // === 8.4.2 BOND STRENGTH ===
  steps.push('\n=== 8.4.2 DESIGN BOND STRENGTH ===');

  // eta_1
  const eta_1 = bond_condition === 'good' ? 1.0 : 0.7;
  steps.push(`η_1 = ${eta_1} (${bond_condition} bond conditions)`);

  // eta_2
  const eta_2 = phi_l <= 32 ? 1.0 : (132 - phi_l) / 100;
  steps.push(`η_2 = ${eta_2.toFixed(3)} (φ ${phi_l <= 32 ? '≤' : '>'} 32 mm)`);

  // fctk,0.05
  const fctk_005 = getFctk005(fck);
  steps.push(`f_ctk,0.05 = ${fctk_005.toFixed(2)} MPa (from concrete grade)`);

  // fctd
  const fctd = alpha_cc * fctk_005 / gamma_c;
  steps.push(`f_ctd = α_cc × f_ctk,0.05 / γ_c = ${alpha_cc} × ${fctk_005.toFixed(2)} / ${gamma_c} = ${fctd.toFixed(3)} MPa`);

  // fbd
  const fbd = 2.25 * eta_1 * eta_2 * fctd;
  steps.push(`f_bd = 2.25 × η_1 × η_2 × f_ctd = 2.25 × ${eta_1} × ${eta_2.toFixed(3)} × ${fctd.toFixed(3)} = ${fbd.toFixed(3)} MPa`);

  // === 8.4.3 BASIC REQUIRED ANCHORAGE LENGTH ===
  steps.push('\n=== 8.4.3 BASIC REQUIRED ANCHORAGE LENGTH ===');

  const fyd = fyk / gamma_s;
  steps.push(`f_yd = f_yk / γ_s = ${fyk} / ${gamma_s} = ${fyd.toFixed(2)} MPa`);

  const lb_rqd = (phi_l / 4) * (sigma_sd / fbd);
  steps.push(`l_b,rqd = (φ_l / 4) × (σ_sd / f_bd) = (${phi_l} / 4) × (${sigma_sd.toFixed(2)} / ${fbd.toFixed(3)}) = ${lb_rqd.toFixed(2)} mm`);

  // === 8.4.4 DESIGN ANCHORAGE LENGTH ===
  steps.push('\n=== 8.4.4 DESIGN ANCHORAGE LENGTH ===');

  // K coefficient (from user input)
  const K_description = K === 0.1 ? 'bar inside bend' : K === 0.05 ? 'orthogonal reinforcement outside bars' : 'anchored bar outside orthogonal bars';
  steps.push(`K = ${K} (${K_description})`);

  // Alpha factors
  steps.push('\n--- Alpha Factors ---');

  // α1 - Bar shape (from bar_type)
  const alpha_1 = bar_type === 'straight' ? 1.0 : 0.7;
  steps.push(`α_1 = ${alpha_1} (${bar_type === 'straight' ? 'straight bars' : bar_type === 'hooks' ? 'angle hooks/hooks' : 'loops'})`);

  // α2 - Concrete cover
  const temp_alpha_2 = 1 - 0.15 * (cd - phi_l) / phi_l;
  const alpha_2 = Math.min(Math.max(temp_alpha_2, 0.7), 1.0);
  steps.push(`α_2 = max(0.7, min(1.0, 1 - 0.15 × (cd - φ_l) / φ_l))`);
  steps.push(`    = max(0.7, min(1.0, 1 - 0.15 × (${cd.toFixed(2)} - ${phi_l}) / ${phi_l}))`);
  steps.push(`    = max(0.7, min(1.0, ${temp_alpha_2.toFixed(4)}))`);
  steps.push(`    = ${alpha_2.toFixed(3)}`);

  // α3 - Transverse reinforcement (not welded)
  const sum_Ast = n_l_orthogonal * Math.PI * Math.pow(phi_t, 2) / 4;
  const sum_Ast_min = 0.25 * As_l;
  const lambda = (sum_Ast - sum_Ast_min) / As_l;
  const temp_alpha_3 = 1 - K * lambda;
  const alpha_3 = Math.min(Math.max(temp_alpha_3, 0.7), 1.0);
  steps.push(`ΣA_st = n_l,orth × π × φ_t² / 4 = ${n_l_orthogonal} × π × ${phi_t}² / 4 = ${sum_Ast.toFixed(2)} mm²`);
  steps.push(`ΣA_st,min = 0.25 × As_l = 0.25 × ${As_l.toFixed(2)} = ${sum_Ast_min.toFixed(2)} mm²`);
  steps.push(`λ = (ΣA_st - ΣA_st,min) / As_l = (${sum_Ast.toFixed(2)} - ${sum_Ast_min.toFixed(2)}) / ${As_l.toFixed(2)} = ${lambda.toFixed(4)}`);
  steps.push(`α_3 = max(0.7, min(1.0, 1 - K × λ)) = max(0.7, min(1.0, 1 - ${K} × ${lambda.toFixed(4)})) = ${alpha_3.toFixed(3)}`);

  // α4 - Welded reinforcement
  steps.push(`α_4 = ${alpha_4} (user input)`);

  // α5 - Transverse pressure
  const temp_alpha_5 = 1 - 0.04 * p;
  const alpha_5 = Math.min(Math.max(temp_alpha_5, 0.7), 1.0);
  steps.push(`α_5 = max(0.7, min(1.0, 1 - 0.04 × p)) = max(0.7, min(1.0, 1 - 0.04 × ${p})) = ${alpha_5.toFixed(3)}`);

  // Check constraint
  const alpha_product = alpha_2 * alpha_3 * alpha_5;
  const product_ok = alpha_product >= 0.7;
  steps.push(`\nConstraint: α_2 × α_3 × α_5 = ${alpha_2.toFixed(3)} × ${alpha_3.toFixed(3)} × ${alpha_5.toFixed(3)} = ${alpha_product.toFixed(3)}`);
  steps.push(`Constraint check: ${alpha_product.toFixed(3)} >= 0.7 ? ${product_ok ? 'OK' : 'NOT OK - Adjust factors!'}`);

  // Minimum anchorage length
  steps.push('\n--- Minimum Anchorage Length ---');
  let lb_min;
  if (tension_compression === 'tension') {
    const lb_min_calc = Math.max(0.3 * lb_rqd, 10 * phi_l, 100);
    lb_min = lb_min_calc;
    steps.push(`l_b,min = max(0.3 × l_b,rqd, 10 × φ_l, 100)`);
    steps.push(`        = max(0.3 × ${lb_rqd.toFixed(2)}, 10 × ${phi_l}, 100)`);
    steps.push(`        = ${lb_min.toFixed(2)} mm (tension)`);
  } else {
    const lb_min_calc = Math.max(0.6 * lb_rqd, 10 * phi_l, 100);
    lb_min = lb_min_calc;
    steps.push(`l_b,min = max(0.6 × l_b,rqd, 10 × φ_l, 100)`);
    steps.push(`        = max(0.6 × ${lb_rqd.toFixed(2)}, 10 × ${phi_l}, 100)`);
    steps.push(`        = ${lb_min.toFixed(2)} mm (compression)`);
  }

  // Final design anchorage length
  steps.push('\n--- Final Design Anchorage Length ---');
  const alpha_total = alpha_1 * alpha_2 * alpha_3 * alpha_4 * alpha_5;
  const lbd_calculated = alpha_total * lb_rqd;
  const lbd = Math.max(lbd_calculated, lb_min);
  steps.push(`α_total = α_1 × α_2 × α_3 × α_4 × α_5`);
  steps.push(`        = ${alpha_1} × ${alpha_2.toFixed(3)} × ${alpha_3.toFixed(3)} × ${alpha_4} × ${alpha_5.toFixed(3)}`);
  steps.push(`        = ${alpha_total.toFixed(4)}`);
  steps.push(`l_bd (calculated) = α_total × l_b,rqd = ${alpha_total.toFixed(4)} × ${lb_rqd.toFixed(2)} = ${lbd_calculated.toFixed(2)} mm`);
  steps.push(`l_bd = max(l_bd (calculated), l_b,min) = max(${lbd_calculated.toFixed(2)}, ${lb_min.toFixed(2)}) = ${lbd.toFixed(2)} mm`);

  return {
    lbd: lbd,
    lb_rqd: lb_rqd,
    lb_min: lb_min,
    fbd: fbd,
    fctd: fctd,
    fctk_005: fctk_005,
    eta_1: eta_1,
    eta_2: eta_2,
    alpha_1: alpha_1,
    alpha_2: alpha_2,
    alpha_3: alpha_3,
    alpha_4: alpha_4,
    alpha_5: alpha_5,
    alpha_total: alpha_total,
    alpha_product: alpha_product,
    product_ok: product_ok,
    cd: cd,
    a: a,
    As_l: As_l,
    sigma_sd: sigma_sd,
    fyd: fyd,
    K: K,
    steps: steps
  };
}

function calculateAndShow() {
  try {
    const results = calculateAnchorageLength();

    // Show results section
    document.getElementById('results').classList.remove('hidden');

    // Display main result
    document.getElementById('lbd-result').textContent = `${results.lbd.toFixed(1)} mm`;

    // Bond strength results
    const bondResults = document.getElementById('bond-results');
    bondResults.innerHTML = `
      <div class="flex justify-between"><span>η<sub>1</sub>:</span><span>${results.eta_1.toFixed(2)}</span></div>
      <div class="flex justify-between"><span>η<sub>2</sub>:</span><span>${results.eta_2.toFixed(3)}</span></div>
      <div class="flex justify-between"><span>f<sub>ctk,0.05</sub>:</span><span>${results.fctk_005.toFixed(2)} MPa</span></div>
      <div class="flex justify-between"><span>f<sub>ctd</sub>:</span><span>${results.fctd.toFixed(3)} MPa</span></div>
      <div class="flex justify-between font-bold text-blue-300"><span>f<sub>bd</sub>:</span><span>${results.fbd.toFixed(3)} MPa</span></div>
    `;

    // Basic length results
    const basicResults = document.getElementById('basic-results');
    basicResults.innerHTML = `
      <div class="flex justify-between"><span>f<sub>yd</sub>:</span><span>${results.fyd.toFixed(2)} MPa</span></div>
      <div class="flex justify-between"><span>σ<sub>sd</sub>:</span><span>${results.sigma_sd.toFixed(2)} MPa</span></div>
      <div class="flex justify-between"><span>A<sub>s,l</sub>:</span><span>${results.As_l.toFixed(2)} mm²</span></div>
      <div class="flex justify-between font-bold text-green-300"><span>l<sub>b,rqd</sub>:</span><span>${results.lb_rqd.toFixed(2)} mm</span></div>
    `;

    // Alpha factors results
    const alphaResults = document.getElementById('alpha-results');
    alphaResults.innerHTML = `
      <div class="flex justify-between"><span>α<sub>1</sub> (bar shape):</span><span>${results.alpha_1.toFixed(3)}</span></div>
      <div class="flex justify-between"><span>α<sub>2</sub> (cover):</span><span>${results.alpha_2.toFixed(3)}</span></div>
      <div class="flex justify-between"><span>α<sub>3</sub> (transverse):</span><span>${results.alpha_3.toFixed(3)}</span></div>
      <div class="flex justify-between"><span>α<sub>4</sub> (welded):</span><span>${results.alpha_4.toFixed(3)}</span></div>
      <div class="flex justify-between"><span>α<sub>5</sub> (pressure):</span><span>${results.alpha_5.toFixed(3)}</span></div>
      <div class="flex justify-between font-bold text-purple-300"><span>α<sub>total</sub>:</span><span>${results.alpha_total.toFixed(4)}</span></div>
      <div class="flex justify-between ${results.product_ok ? 'text-green-400' : 'text-red-400'}">
        <span>α<sub>2</sub>×α<sub>3</sub>×α<sub>5</sub>:</span>
        <span>${results.alpha_product.toFixed(3)} ${results.product_ok ? '✓' : '✗ <0.7'}</span>
      </div>
    `;

    // Final results
    const finalResults = document.getElementById('final-results');
    finalResults.innerHTML = `
      <div class="flex justify-between"><span>c<sub>d</sub>:</span><span>${results.cd.toFixed(2)} mm</span></div>
      <div class="flex justify-between"><span>a (clear spacing):</span><span>${results.a.toFixed(2)} mm</span></div>
      <div class="flex justify-between"><span>K:</span><span>${results.K}</span></div>
      <div class="flex justify-between"><span>l<sub>b,min</sub>:</span><span>${results.lb_min.toFixed(2)} mm</span></div>
      <div class="flex justify-between font-bold text-yellow-300 text-lg"><span>l<sub>bd</sub>:</span><span>${results.lbd.toFixed(1)} mm</span></div>
    `;

    // Generate detailed report
    generateDetailedReport(results);

    // Scroll to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    alert(`Calculation error: ${error.message}`);
    console.error(error);
  }
}

function generateDetailedReport(results) {
  const reportDiv = document.getElementById('detailed-report');

  // Get user description
  const description = document.getElementById('calc_description').value.trim();

  // Get all input values
  const inputs = {
    SEd: document.getElementById('SEd').value,
    phi_l: document.getElementById('phi_l').value,
    n_l: document.getElementById('n_l').value,
    phi_t: document.getElementById('phi_t').value,
    n_l_orthogonal: document.getElementById('n_l_orthogonal').value,
    fck: document.getElementById('fck').value,
    gamma_c: document.getElementById('gamma_c').value,
    alpha_cc: document.getElementById('alpha_cc').value,
    fyk: document.getElementById('fyk').value,
    gamma_s: document.getElementById('gamma_s').value,
    sigma_sEd: document.getElementById('sigma_sEd').value || 'Auto-calculated',
    c: document.getElementById('c').value,
    c1: document.getElementById('c1').value,
    cc_phi_l: document.getElementById('cc_phi_l').value,
    bond_condition: document.getElementById('bond_condition').value,
    tension_compression: document.getElementById('tension_compression').value,
    bar_type: document.getElementById('bar_type').value,
    bar_shape: document.getElementById('bar_shape').value,
    element_type: document.getElementById('element_type').value,
    K: document.getElementById('K').value,
    alpha_4: document.getElementById('alpha_4').value,
    p: document.getElementById('p').value
  };

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8 rounded-lg">
      ${description ? `
        <div class="mb-6 pb-4 border-b-2 border-gray-300">
          <h2 class="text-2xl font-bold text-gray-800 mb-2">Calculation Description</h2>
          <p class="text-gray-700 whitespace-pre-wrap">${description}</p>
        </div>
      ` : ''}

      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Concrete Anchorage Length Calculation</h2>
        <p class="text-sm text-gray-600">According to Eurocode 2 Section 8.4</p>
        <p class="text-sm text-gray-600">Calculation Date: ${new Date().toLocaleString()}</p>
      </div>

      <!-- INPUT PARAMETERS -->
      <div class="mb-6 page-break-before">
        <h3 class="text-xl font-bold text-blue-700 mb-3 border-b-2 border-blue-300 pb-1">INPUT PARAMETERS</h3>

        <div class="grid grid-cols-2 gap-6">
          <!-- Basic Parameters -->
          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Basic Parameters</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">S<sub>Ed</sub></td><td class="py-1">${inputs.SEd} kN</td><td class="py-1 text-gray-600">Design tension force</td></tr>
              <tr><td class="py-1 font-medium">φ<sub>l</sub></td><td class="py-1">${inputs.phi_l} mm</td><td class="py-1 text-gray-600">Rebar diameter</td></tr>
              <tr><td class="py-1 font-medium">n<sub>l</sub></td><td class="py-1">${inputs.n_l}</td><td class="py-1 text-gray-600">Number of rebars</td></tr>
              <tr><td class="py-1 font-medium">φ<sub>t</sub></td><td class="py-1">${inputs.phi_t} mm</td><td class="py-1 text-gray-600">Transverse rebar dia.</td></tr>
              <tr><td class="py-1 font-medium">n<sub>l,orth</sub></td><td class="py-1">${inputs.n_l_orthogonal}</td><td class="py-1 text-gray-600">Orthogonal bars</td></tr>
            </table>
          </div>

          <!-- Material Properties -->
          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Material Properties</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">f<sub>ck</sub></td><td class="py-1">${inputs.fck} MPa</td><td class="py-1 text-gray-600">Concrete strength</td></tr>
              <tr><td class="py-1 font-medium">γ<sub>c</sub></td><td class="py-1">${inputs.gamma_c}</td><td class="py-1 text-gray-600">Concrete safety factor</td></tr>
              <tr><td class="py-1 font-medium">α<sub>cc</sub></td><td class="py-1">${inputs.alpha_cc}</td><td class="py-1 text-gray-600">Concrete coefficient</td></tr>
              <tr><td class="py-1 font-medium">f<sub>yk</sub></td><td class="py-1">${inputs.fyk} MPa</td><td class="py-1 text-gray-600">Steel strength</td></tr>
              <tr><td class="py-1 font-medium">γ<sub>s</sub></td><td class="py-1">${inputs.gamma_s}</td><td class="py-1 text-gray-600">Steel safety factor</td></tr>
              <tr><td class="py-1 font-medium">σ<sub>sEd</sub></td><td class="py-1">${inputs.sigma_sEd}</td><td class="py-1 text-gray-600">Design stress</td></tr>
            </table>
          </div>

          <!-- Cover & Spacing -->
          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Cover & Spacing</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">c</td><td class="py-1">${inputs.c} mm</td><td class="py-1 text-gray-600">Cover (top/bottom)</td></tr>
              <tr><td class="py-1 font-medium">c<sub>1</sub></td><td class="py-1">${inputs.c1} mm</td><td class="py-1 text-gray-600">Cover (sides)</td></tr>
              <tr><td class="py-1 font-medium">c/c φ<sub>l</sub></td><td class="py-1">${inputs.cc_phi_l} mm</td><td class="py-1 text-gray-600">Rebar spacing</td></tr>
            </table>
          </div>

          <!-- Configuration -->
          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Configuration</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">Bond condition</td><td class="py-1 capitalize" colspan="2">${inputs.bond_condition}</td></tr>
              <tr><td class="py-1 font-medium">Loading type</td><td class="py-1 capitalize" colspan="2">${inputs.tension_compression}</td></tr>
              <tr><td class="py-1 font-medium">Bar type</td><td class="py-1" colspan="2">${inputs.bar_type}</td></tr>
              <tr><td class="py-1 font-medium">Bar shape</td><td class="py-1 capitalize" colspan="2">${inputs.bar_shape}</td></tr>
              <tr><td class="py-1 font-medium">Element type</td><td class="py-1 capitalize" colspan="2">${inputs.element_type}</td></tr>
              <tr><td class="py-1 font-medium">K</td><td class="py-1" colspan="2">${inputs.K}</td></tr>
              <tr><td class="py-1 font-medium">α<sub>4</sub></td><td class="py-1" colspan="2">${inputs.alpha_4}</td></tr>
              <tr><td class="py-1 font-medium">p</td><td class="py-1" colspan="2">${inputs.p} MPa</td></tr>
            </table>
          </div>
        </div>
      </div>

      <!-- CALCULATION RESULTS -->
      <div class="mb-6 page-break-before">
        <h3 class="text-xl font-bold text-green-700 mb-3 border-b-2 border-green-300 pb-1">CALCULATION RESULTS</h3>

        <div class="bg-blue-50 border-l-4 border-blue-600 p-4 mb-4">
          <div class="text-3xl font-bold text-blue-900">l<sub>bd</sub> = ${results.lbd.toFixed(1)} mm</div>
          <div class="text-sm text-blue-700 mt-1">Design Anchorage Length</div>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Bond Strength (EC2 8.4.2)</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">η<sub>1</sub></td><td class="py-1">${results.eta_1.toFixed(2)}</td><td class="py-1 text-gray-600">Bond condition factor</td></tr>
              <tr><td class="py-1 font-medium">η<sub>2</sub></td><td class="py-1">${results.eta_2.toFixed(3)}</td><td class="py-1 text-gray-600">Bar diameter factor</td></tr>
              <tr><td class="py-1 font-medium">f<sub>ctk,0.05</sub></td><td class="py-1">${results.fctk_005.toFixed(2)} MPa</td><td class="py-1 text-gray-600">Concrete tensile str.</td></tr>
              <tr><td class="py-1 font-medium">f<sub>ctd</sub></td><td class="py-1">${results.fctd.toFixed(3)} MPa</td><td class="py-1 text-gray-600">Design tensile str.</td></tr>
              <tr class="font-bold bg-blue-100"><td class="py-1">f<sub>bd</sub></td><td class="py-1">${results.fbd.toFixed(3)} MPa</td><td class="py-1 text-gray-600">Design bond strength</td></tr>
            </table>
          </div>

          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Basic Length (EC2 8.4.3)</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">f<sub>yd</sub></td><td class="py-1">${results.fyd.toFixed(2)} MPa</td><td class="py-1 text-gray-600">Design yield strength</td></tr>
              <tr><td class="py-1 font-medium">σ<sub>sd</sub></td><td class="py-1">${results.sigma_sd.toFixed(2)} MPa</td><td class="py-1 text-gray-600">Design stress</td></tr>
              <tr><td class="py-1 font-medium">A<sub>s,l</sub></td><td class="py-1">${results.As_l.toFixed(2)} mm²</td><td class="py-1 text-gray-600">Total rebar area</td></tr>
              <tr class="font-bold bg-green-100"><td class="py-1">l<sub>b,rqd</sub></td><td class="py-1">${results.lb_rqd.toFixed(2)} mm</td><td class="py-1 text-gray-600">Basic anchorage length</td></tr>
            </table>
          </div>

          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Alpha Factors</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">α<sub>1</sub></td><td class="py-1">${results.alpha_1.toFixed(3)}</td><td class="py-1 text-gray-600">Bar shape</td></tr>
              <tr><td class="py-1 font-medium">α<sub>2</sub></td><td class="py-1">${results.alpha_2.toFixed(3)}</td><td class="py-1 text-gray-600">Concrete cover</td></tr>
              <tr><td class="py-1 font-medium">α<sub>3</sub></td><td class="py-1">${results.alpha_3.toFixed(3)}</td><td class="py-1 text-gray-600">Transverse reinf.</td></tr>
              <tr><td class="py-1 font-medium">α<sub>4</sub></td><td class="py-1">${results.alpha_4.toFixed(3)}</td><td class="py-1 text-gray-600">Welded reinf.</td></tr>
              <tr><td class="py-1 font-medium">α<sub>5</sub></td><td class="py-1">${results.alpha_5.toFixed(3)}</td><td class="py-1 text-gray-600">Transverse pressure</td></tr>
              <tr class="font-bold bg-purple-100"><td class="py-1">α<sub>total</sub></td><td class="py-1">${results.alpha_total.toFixed(4)}</td><td class="py-1 text-gray-600">Product of all α</td></tr>
            </table>
          </div>

          <div>
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Final Calculation</h4>
            <table class="w-full text-sm">
              <tr><td class="py-1 font-medium">c<sub>d</sub></td><td class="py-1">${results.cd.toFixed(2)} mm</td><td class="py-1 text-gray-600">Minimum cover</td></tr>
              <tr><td class="py-1 font-medium">a</td><td class="py-1">${results.a.toFixed(2)} mm</td><td class="py-1 text-gray-600">Clear spacing</td></tr>
              <tr><td class="py-1 font-medium">K</td><td class="py-1">${results.K}</td><td class="py-1 text-gray-600">Transverse coeff.</td></tr>
              <tr><td class="py-1 font-medium">l<sub>b,min</sub></td><td class="py-1">${results.lb_min.toFixed(2)} mm</td><td class="py-1 text-gray-600">Minimum length</td></tr>
              <tr class="font-bold bg-yellow-100 text-lg"><td class="py-1">l<sub>bd</sub></td><td class="py-1">${results.lbd.toFixed(1)} mm</td><td class="py-1 text-gray-600">Design anch. length</td></tr>
            </table>
          </div>
        </div>

        <div class="mt-4 ${results.product_ok ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'} border-l-4 p-3">
          <div class="font-semibold ${results.product_ok ? 'text-green-800' : 'text-red-800'}">
            Constraint Check: α<sub>2</sub> × α<sub>3</sub> × α<sub>5</sub> = ${results.alpha_product.toFixed(3)}
            ${results.product_ok ? '✓ ≥ 0.7' : '✗ < 0.7 (Adjust factors!)'}
          </div>
        </div>
      </div>

      <!-- DETAILED CALCULATION STEPS -->
      <div class="mb-6 page-break-before">
        <h3 class="text-xl font-bold text-purple-700 mb-3 border-b-2 border-purple-300 pb-1">DETAILED CALCULATION STEPS</h3>
        <div class="space-y-2 text-sm font-mono bg-gray-50 p-4 rounded" style="font-family: 'Courier New', monospace;">
          ${results.steps.map(step => `<div class="text-gray-800">${step}</div>`).join('')}
        </div>
      </div>

      <div class="text-xs text-gray-500 mt-6 pt-4 border-t border-gray-300 text-center">
        Generated by Concrete Anchorage Length Calculator | Eurocode 2 Section 8.4
      </div>
    </div>
  `;

  reportDiv.innerHTML = reportHTML;
}