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

    // Calculation steps
    const stepsDiv = document.getElementById('calculation-steps');
    stepsDiv.innerHTML = results.steps.map(step => `<div class="text-gray-300">${step}</div>`).join('');

    // Scroll to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    alert(`Calculation error: ${error.message}`);
    console.error(error);
  }
}