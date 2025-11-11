/**
 * Concrete Beam ULS Design Calculator - API Module
 * Pure calculation functions for API integration
 * No DOM dependencies - can be used in Node.js or browser
 */

// Safe mathematical expression evaluator
function evaluateExpression(expr) {
  try {
    // Handle string or number input
    if (typeof expr === 'number') return expr;
    if (typeof expr !== 'string') throw new Error('Invalid expression type');
    
    // Remove any characters that aren't numbers, operators, parentheses, or decimals
    const sanitized = expr.replace(/[^0-9+\-*/().\s^]/g, '');
    
    // Replace ^ with ** for JavaScript exponentiation
    const jsExpression = sanitized.replace(/\^/g, '**');
    
    // Use Function constructor for safer evaluation than eval()
    const result = new Function('return ' + jsExpression)();
    
    // Check if result is a valid number
    if (isNaN(result) || !isFinite(result)) {
      throw new Error('Invalid calculation result');
    }
    
    return result;
  } catch (error) {
    throw new Error(`Expression evaluation error: ${error.message}`);
  }
}

// Input validation function
function validateConcreteBeamInputs(inputs) {
  const errors = [];
  
  // Required fields validation
  const required = {
    'geometry.b': 'Beam width',
    'geometry.h': 'Beam height', 
    'geometry.c': 'Cover',
    'loads.MEd': 'Applied moment',
    'loads.VEd': 'Applied shear',
    'longitudinal_reinforcement.phi_l': 'Longitudinal bar diameter',
    'longitudinal_reinforcement.n_l': 'Number of longitudinal bars',
    'shear_reinforcement.phi_b': 'Stirrup diameter',
    'shear_reinforcement.cc_b': 'Stirrup spacing',
    'shear_reinforcement.n_snitt': 'Number of stirrup legs',
    'material.fck': 'Concrete characteristic strength',
    'material.fyk': 'Steel characteristic strength',
    'material.alpha_cc': 'Alpha cc factor',
    'material.gamma_c': 'Concrete safety factor',
    'material.gamma_s': 'Steel safety factor'
  };
  
  for (const [path, description] of Object.entries(required)) {
    const value = getNestedValue(inputs, path);
    if (value === undefined || value === null || value === '') {
      errors.push(`${description} (${path}) is required`);
    }
  }
  
  // Engineering limits validation
  if (inputs.geometry) {
    const {b, h, c} = inputs.geometry;
    if (b && b < 100) errors.push('Beam width should be at least 100mm');
    if (h && h < 200) errors.push('Beam height should be at least 200mm');
    if (c && c < 15) errors.push('Cover should be at least 15mm');
    if (h && c && h <= c) errors.push('Beam height must be greater than cover');
  }
  
  if (inputs.material) {
    const {fck, fyk, alpha_cc, gamma_c, gamma_s} = inputs.material;
    if (fck && (fck < 12 || fck > 90)) errors.push('fck should be between 12-90 MPa');
    if (fyk && (fyk < 400 || fyk > 600)) errors.push('fyk should be between 400-600 MPa');
    if (alpha_cc && (alpha_cc < 0.5 || alpha_cc > 1.0)) errors.push('alpha_cc should be between 0.5-1.0');
    if (gamma_c && (gamma_c < 1.0 || gamma_c > 2.0)) errors.push('gamma_c should be between 1.0-2.0');
    if (gamma_s && (gamma_s < 1.0 || gamma_s > 1.5)) errors.push('gamma_s should be between 1.0-1.5');
  }
  
  return errors;
}

// Helper function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Main calculation function
function calculateConcreteBeam(inputs) {
  try {
    // Validate inputs
    const validationErrors = validateConcreteBeamInputs(inputs);
    if (validationErrors.length > 0) {
      return {
        success: false,
        errors: validationErrors,
        message: 'Input validation failed'
      };
    }
    
    // Extract and evaluate inputs
    const b = evaluateExpression(inputs.geometry.b);
    const h = evaluateExpression(inputs.geometry.h);
    const c = evaluateExpression(inputs.geometry.c);

    // Evaluate load expressions
    const MEd = evaluateExpression(inputs.loads.MEd);
    const VEd = evaluateExpression(inputs.loads.VEd);
    
    const phi_l = parseFloat(inputs.longitudinal_reinforcement.phi_l);
    const n_l = parseFloat(inputs.longitudinal_reinforcement.n_l);
    const phi_b = parseFloat(inputs.shear_reinforcement.phi_b);
    const cc_b = parseFloat(inputs.shear_reinforcement.cc_b);
    const n_snitt = parseFloat(inputs.shear_reinforcement.n_snitt);
    const fck = parseFloat(inputs.material.fck);
    const fyk = parseFloat(inputs.material.fyk);
    const alpha_cc = parseFloat(inputs.material.alpha_cc);
    const gamma_c = parseFloat(inputs.material.gamma_c);
    const gamma_s = parseFloat(inputs.material.gamma_s);
    
    // Derived material properties
    const fcd = alpha_cc * fck / gamma_c;
    const fyd = fyk / gamma_s;
    
    // Geometric properties
    const d = h - c - phi_l/2;
    const Asl = n_l * Math.PI * Math.pow(phi_l, 2) / 4;
    
    // Moment capacity calculations
    const MRd_c = 0.275 * b * Math.pow(d, 2) * fcd / 1000000; // Convert to kNm
    
    const z_95d = 0.95 * d;
    const z_bal = d * (1 - 0.17 * (MEd * 1000000) / (0.275 * b * Math.pow(d, 2) * fcd));
    const z = Math.min(z_95d, z_bal);
    
    const MRd_s = Asl * fyd * z / 1000000; // Convert to kNm
    
    // Shear reinforcement properties
    const Asw = n_snitt * Math.PI * Math.pow(phi_b, 2) / 4;
    const z_skjaer = 0.9 * d;
    
    // Initial cot(θ) = 1.0
    const cot_theta_initial = 1.0;
    const theta_initial = Math.atan(1 / cot_theta_initial) * 180 / Math.PI;
    
    // Shear capacity with initial angle
    const VRd_s_initial = (Asw / cc_b) * z_skjaer * fyd * cot_theta_initial / 1000;
    
    // Reduced angle calculation following PDF logic
    const cot_theta_red = VEd / ((Asw / cc_b) * z_skjaer * fyd / 1000);
    const theta_red_rad = Math.atan(1 / cot_theta_red);
    const theta_red = theta_red_rad * 180 / Math.PI;
    
    // Check cot(θ) limits and determine final values
    let theta_final, cot_theta_final, angle_status;
    if (cot_theta_red >= 1.0 && cot_theta_red <= 2.5) {
      // Use reduced angle if within acceptable range
      theta_final = theta_red;
      cot_theta_final = cot_theta_red;
      angle_status = "OK";
    } else if (cot_theta_red > 2.5) {
      // Cap at maximum cot(θ) = 2.5, will show over-utilization
      theta_final = Math.atan(1 / 2.5) * 180 / Math.PI;
      cot_theta_final = 2.5;
      angle_status = "Limited to max cot θ = 2.5";
    } else {
      // Use minimum cot(θ) = 1.0
      theta_final = Math.atan(1 / 1.0) * 180 / Math.PI;
      cot_theta_final = 1.0;
      angle_status = "Limited to min cot θ = 1.0";
    }
    
    // Final shear capacity
    const VRd_s_final = (Asw / cc_b) * z_skjaer * fyd * cot_theta_final / 1000;
    
    // Additional tensile force due to shear
    const DeltaF_td = 0.5 * VEd * cot_theta_final;
    const F_tM = MEd * 1000 / z; // Convert MEd to kN for consistent units
    const F_Ed = F_tM + DeltaF_td;
    const F_Rd = Asl * fyd / 1000; // Convert to kN
    
    // Calculate utilizations
    const moment_utilization = MEd / Math.min(MRd_c, MRd_s) * 100;
    const shear_utilization = VEd / VRd_s_final * 100;
    const tensile_utilization = F_Ed / F_Rd * 100;
    
    // Determine overall status
    let overall_status = "OK";
    const messages = [];
    
    if (moment_utilization > 100) {
      overall_status = "FAILED";
      messages.push("Moment capacity exceeded - increase cross-section or reinforcement");
    }
    if (shear_utilization > 100) {
      overall_status = "FAILED";
      messages.push("Shear capacity exceeded - increase stirrups or cross-section");
    }
    if (tensile_utilization > 100) {
      overall_status = "FAILED";
      messages.push("Tensile force exceeds capacity - increase reinforcement");
    }
    
    if (overall_status === "OK") {
      if (Math.max(moment_utilization, shear_utilization, tensile_utilization) > 85) {
        overall_status = "HIGH_UTILIZATION";
        messages.push("High utilization - consider increasing capacity");
      }
    }
    
    // Return structured results - ALL intermediate values for complete traceability
    return {
      success: true,
      inputs: {
        geometry: {b, h, c},
        loads: {MEd, VEd},
        longitudinal_reinforcement: {phi_l, n_l},
        shear_reinforcement: {phi_b, cc_b, n_snitt},
        material: {fck, fyk, alpha_cc, gamma_c, gamma_s}
      },
      intermediate_calculations: {
        // Material design strengths
        material: {
          fcd: parseFloat(fcd.toFixed(3)),
          fyd: parseFloat(fyd.toFixed(3)),
          // Intermediate values for fcd calculation
          alpha_cc_times_fck: parseFloat((alpha_cc * fck).toFixed(3)),
          // Intermediate values for fyd calculation
          fyk_over_gamma_s: parseFloat((fyk / gamma_s).toFixed(3))
        },

        // Geometric properties
        geometry: {
          // Effective depth calculation
          d: parseFloat(d.toFixed(2)),
          h_minus_c: parseFloat((h - c).toFixed(2)),
          phi_l_over_2: parseFloat((phi_l / 2).toFixed(2)),

          // Longitudinal reinforcement area
          Asl: parseFloat(Asl.toFixed(2)),
          single_bar_area: parseFloat((Math.PI * Math.pow(phi_l, 2) / 4).toFixed(2)),

          // Lever arm calculations
          z: parseFloat(z.toFixed(2)),
          z_95d: parseFloat(z_95d.toFixed(2)),
          z_bal: parseFloat(z_bal.toFixed(2)),
          z_bal_numerator: parseFloat((MEd * 1000000).toFixed(2)),
          z_bal_denominator: parseFloat((0.275 * b * Math.pow(d, 2) * fcd).toFixed(2)),
          z_bal_ratio: parseFloat((MEd * 1000000 / (0.275 * b * Math.pow(d, 2) * fcd)).toFixed(4))
        },

        // Moment capacity intermediate values
        moment: {
          // Concrete moment capacity
          MRd_c: parseFloat(MRd_c.toFixed(2)),
          MRd_c_numerator: parseFloat((0.275 * b * Math.pow(d, 2) * fcd).toFixed(2)),
          concrete_factor: 0.275,
          b_times_d_squared: parseFloat((b * Math.pow(d, 2)).toFixed(2)),

          // Steel moment capacity
          MRd_s: parseFloat(MRd_s.toFixed(2)),
          MRd_s_numerator: parseFloat((Asl * fyd * z).toFixed(2)),
          Asl_times_fyd: parseFloat((Asl * fyd).toFixed(2))
        },

        // Shear reinforcement properties
        shear: {
          // Stirrup area
          Asw: parseFloat(Asw.toFixed(2)),
          single_stirrup_leg_area: parseFloat((Math.PI * Math.pow(phi_b, 2) / 4).toFixed(2)),

          // Shear lever arm
          z_v: parseFloat(z_skjaer.toFixed(2)),
          z_v_factor: 0.9,

          // Stirrup spacing ratio
          Asw_over_s: parseFloat((Asw / cc_b).toFixed(4)),

          // Initial angle
          cot_theta_initial: parseFloat(cot_theta_initial.toFixed(3)),
          theta_initial: parseFloat(theta_initial.toFixed(2)),
          theta_initial_rad: parseFloat((theta_initial * Math.PI / 180).toFixed(4)),

          // Initial shear capacity
          VRd_s_initial: parseFloat(VRd_s_initial.toFixed(2)),
          VRd_s_initial_numerator: parseFloat(((Asw / cc_b) * z_skjaer * fyd * cot_theta_initial).toFixed(2)),

          // Reduced angle calculation
          cot_theta_red: parseFloat(cot_theta_red.toFixed(3)),
          cot_theta_red_numerator: parseFloat(VEd.toFixed(2)),
          cot_theta_red_denominator: parseFloat(((Asw / cc_b) * z_skjaer * fyd / 1000).toFixed(4)),
          theta_red: parseFloat(theta_red.toFixed(2)),
          theta_red_rad: parseFloat(theta_red_rad.toFixed(4)),

          // Final angle (after limits check)
          cot_theta_final: parseFloat(cot_theta_final.toFixed(3)),
          theta_final: parseFloat(theta_final.toFixed(2)),
          theta_final_rad: parseFloat((theta_final * Math.PI / 180).toFixed(4)),
          angle_status: angle_status,
          cot_theta_min: 1.0,
          cot_theta_max: 2.5,

          // Final shear capacity
          VRd_s_final: parseFloat(VRd_s_final.toFixed(2)),
          VRd_s_final_numerator: parseFloat(((Asw / cc_b) * z_skjaer * fyd * cot_theta_final).toFixed(2))
        },

        // Tensile force calculations
        tensile_force: {
          DeltaF_td: parseFloat(DeltaF_td.toFixed(2)),
          DeltaF_td_factor: 0.5,
          VEd_times_cot_theta: parseFloat((VEd * cot_theta_final).toFixed(2)),

          F_tM: parseFloat(F_tM.toFixed(2)),
          MEd_times_1000: parseFloat((MEd * 1000).toFixed(2)),

          F_Ed: parseFloat(F_Ed.toFixed(2)),

          F_Rd: parseFloat(F_Rd.toFixed(2)),
          Asl_times_fyd_over_1000: parseFloat((Asl * fyd / 1000).toFixed(2))
        }
      },

      results: {
        moment_capacity: {
          MRd_c: parseFloat(MRd_c.toFixed(2)),
          MRd_s: parseFloat(MRd_s.toFixed(2)),
          MRd: parseFloat(Math.min(MRd_c, MRd_s).toFixed(2)),
          governing: MRd_c < MRd_s ? 'concrete' : 'steel'
        },
        shear_capacity: {
          VRd_s_initial: parseFloat(VRd_s_initial.toFixed(2)),
          VRd_s: parseFloat(VRd_s_final.toFixed(2)),
          VRd: parseFloat(VRd_s_final.toFixed(2))
        },
        tensile_force: {
          DeltaF_td: parseFloat(DeltaF_td.toFixed(2)),
          F_tM: parseFloat(F_tM.toFixed(2)),
          F_Ed: parseFloat(F_Ed.toFixed(2)),
          F_Rd: parseFloat(F_Rd.toFixed(2))
        }
      },

      status: {
        overall: overall_status,
        messages: messages,
        utilizations: {
          moment: parseFloat(moment_utilization.toFixed(1)),
          shear: parseFloat(shear_utilization.toFixed(1)),
          tensile: parseFloat(tensile_utilization.toFixed(1)),
          max: parseFloat(Math.max(moment_utilization, shear_utilization, tensile_utilization).toFixed(1))
        },
        checks: {
          moment_ok: moment_utilization <= 100,
          shear_ok: shear_utilization <= 100,
          tensile_ok: tensile_utilization <= 100,
          all_ok: moment_utilization <= 100 && shear_utilization <= 100 && tensile_utilization <= 100
        }
      },

      // Metadata for traceability
      _metadata: {
        calculation_timestamp: new Date().toISOString(),
        module_id: 'concrete_beam_design',
        module_name: 'Concrete Beam ULS Design Calculator',
        version: '1.1.0',
        standard: 'Eurocode 2',
        calculation_method: 'ULS - Ultimate Limit State'
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Calculation failed'
    };
  }
}

// API Handler for external requests
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
    const results = calculateConcreteBeam(params);
    return {
      success: results.success,
      input: params,
      results: results,
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
      const calcResult = calculateConcreteBeam(paramsArray[i]);
      results.push({
        index: i,
        success: calcResult.success,
        input: paramsArray[i],
        results: calcResult
      });
      if (calcResult.success) {
        successCount++;
      } else {
        errorCount++;
      }
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

// Test API functionality
function testAPI() {
  console.log('Testing Concrete Beam Calculator API...');
  
  // Test single calculation
  const testParams = {
    geometry: { b: 250, h: 500, c: 25 },
    loads: { MEd: "39", VEd: "260" },
    longitudinal_reinforcement: { phi_l: 20, n_l: 2 },
    shear_reinforcement: { phi_b: 12, cc_b: 185, n_snitt: 2 },
    material: { fck: 35, fyk: 500, alpha_cc: 0.85, gamma_c: 1.5, gamma_s: 1.25 }
  };
  
  console.log('Single calculation test:');
  const singleResult = handleApiRequest(testParams);
  console.log(singleResult);
  
  // Test batch calculation
  const batchParams = [
    testParams,
    { ...testParams, geometry: { ...testParams.geometry, b: 300 } },
    { ...testParams, geometry: { ...testParams.geometry, h: 600 } }
  ];
  
  console.log('Batch calculation test:');
  const batchResult = handleApiRequest(batchParams);
  console.log(batchResult);
  
  // Test error handling
  console.log('Error handling test:');
  const errorResult = handleApiRequest({ geometry: { b: 'invalid' } });
  console.log(errorResult);
  
  console.log('Concrete Beam API tests completed. Check results above.');
  return { singleResult, batchResult, errorResult };
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateConcreteBeam,
    evaluateExpression,
    validateConcreteBeamInputs,
    handleApiRequest,
    processSingle,
    processBatch,
    testAPI
  };
} else {
  // Browser environment
  window.ConcreteBeamAPI = {
    calculateConcreteBeam,
    evaluateExpression,
    validateConcreteBeamInputs,
    handleApiRequest,
    processSingle,
    processBatch,
    testAPI
  };
  
  // Expose main API function globally
  window.concreteBeamCalculate = handleApiRequest;
  
  // Set up API handling on page load
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Concrete Beam Calculator API ready. Use window.concreteBeamCalculate(data) for programmatic access.');
    });
  }
}