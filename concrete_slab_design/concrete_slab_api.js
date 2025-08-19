/**
 * Concrete Slab ULS Design Calculator - API Module
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
function validateConcreteSlabInputs(inputs) {
  const errors = [];
  
  // Required fields validation
  const required = {
    'geometry.MEd': 'Applied moment',
    'geometry.t': 'Slab thickness',
    'geometry.c': 'Cover',
    'material.fcd': 'Design concrete strength',
    'material.fyd': 'Design steel strength',
    'reinforcement.phi_l': 'Bar diameter',
    'reinforcement.cc_l': 'Bar spacing'
  };
  
  for (const [path, description] of Object.entries(required)) {
    const value = getNestedValue(inputs, path);
    if (value === undefined || value === null || value === '') {
      errors.push(`${description} (${path}) is required`);
    }
  }
  
  // Engineering limits validation
  if (inputs.geometry) {
    const {t, c} = inputs.geometry;
    if (t && t < 100) errors.push('Slab thickness should be at least 100mm');
    if (c && c < 15) errors.push('Cover should be at least 15mm');
    if (t && c && t <= c) errors.push('Slab thickness must be greater than cover');
  }
  
  if (inputs.material) {
    const {fcd, fyd} = inputs.material;
    if (fcd && (fcd < 5 || fcd > 50)) errors.push('fcd should be between 5-50 MPa');
    if (fyd && (fyd < 300 || fyd > 600)) errors.push('fyd should be between 300-600 MPa');
  }
  
  if (inputs.reinforcement) {
    const {phi_l, cc_l} = inputs.reinforcement;
    if (phi_l && (phi_l < 6 || phi_l > 32)) errors.push('Bar diameter should be between 6-32mm');
    if (cc_l && (cc_l < 50 || cc_l > 500)) errors.push('Bar spacing should be between 50-500mm');
  }
  
  return errors;
}

// Helper function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Main calculation function
function calculateConcreteSlab(inputs) {
  try {
    // Validate inputs
    const validationErrors = validateConcreteSlabInputs(inputs);
    if (validationErrors.length > 0) {
      return {
        success: false,
        errors: validationErrors,
        message: 'Input validation failed'
      };
    }
    
    // Extract and evaluate inputs
    const MEd = evaluateExpression(inputs.geometry.MEd);
    const t = parseFloat(inputs.geometry.t);
    const c = parseFloat(inputs.geometry.c);
    const fcd = parseFloat(inputs.material.fcd);
    const fyd = parseFloat(inputs.material.fyd);
    const phi_l = parseFloat(inputs.reinforcement.phi_l);
    const cc_l = parseFloat(inputs.reinforcement.cc_l);
    
    // Step 1: Calculate effective depth
    const d = t - c - phi_l / 2;
    
    // Step 2: Calculate reinforcement area per meter
    const As = (Math.PI * Math.pow(phi_l, 2) / 4) * 1000 / cc_l;
    
    // Step 3: Calculate concrete moment capacity (Nm)
    const MRd_c_Nm = 0.275 * 1000 * d * d * fcd;
    
    // Step 4: Calculate lever arm
    const z1 = 0.95 * d;
    const z2 = d * (1 - 0.17 * MEd * 1000 / MRd_c_Nm); // convert MEd to Nm for consistent units
    const z = Math.min(z1, z2);
    
    // Step 5: Calculate steel moment capacity (Nm)
    const MRd_s_Nm = As * fyd * z;
    
    // Step 6: Final moment capacity (minimum of concrete and steel)
    const MRd_Nm = Math.min(MRd_c_Nm, MRd_s_Nm);
    
    // Convert moments to kNm for final results
    const MRd_c = MRd_c_Nm / 1000000;
    const MRd_s = MRd_s_Nm / 1000000;
    const MRd = MRd_Nm / 1000000;
    
    // Calculate utilization
    const utilization = MEd / MRd * 100;
    
    // Determine status
    let status = "OK";
    const messages = [];
    
    if (utilization > 100) {
      status = "FAILED";
      messages.push("Moment capacity exceeded - increase slab thickness or reinforcement");
    } else if (utilization > 85) {
      status = "HIGH_UTILIZATION";
      messages.push("High utilization - consider increasing capacity");
    }
    
    // Check which capacity governs
    const governing_capacity = MRd_c < MRd_s ? "concrete" : "steel";
    if (governing_capacity === "concrete") {
      messages.push("Concrete capacity governs - consider increasing concrete strength or thickness");
    } else {
      messages.push("Steel capacity governs - consider increasing reinforcement");
    }
    
    // Return structured results
    return {
      success: true,
      inputs: {
        geometry: {MEd, t, c},
        material: {fcd, fyd},
        reinforcement: {phi_l, cc_l}
      },
      intermediate_calculations: {
        geometry: {
          d: parseFloat(d.toFixed(2))
        },
        reinforcement: {
          As: parseFloat(As.toFixed(2))
        },
        lever_arm: {
          z1: parseFloat(z1.toFixed(2)),
          z2: parseFloat(z2.toFixed(2)),
          z: parseFloat(z.toFixed(2))
        }
      },
      results: {
        moment_capacity: {
          MRd_c: parseFloat(MRd_c.toFixed(2)),
          MRd_s: parseFloat(MRd_s.toFixed(2)),
          MRd: parseFloat(MRd.toFixed(2)),
          governing: governing_capacity
        }
      },
      status: {
        overall: status,
        messages: messages,
        utilization: parseFloat(utilization.toFixed(1))
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

// Batch calculation function
function calculateConcreteSlabBatch(inputsArray) {
  if (!Array.isArray(inputsArray)) {
    return {
      success: false,
      error: 'Input must be an array',
      message: 'Batch calculation requires array input'
    };
  }
  
  const results = inputsArray.map((inputs, index) => {
    const result = calculateConcreteSlab(inputs);
    return {
      index: index,
      ...result
    };
  });
  
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  
  return {
    success: true,
    summary: {
      total: results.length,
      successful: successful,
      failed: failed
    },
    results: results
  };
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
    const results = calculateConcreteSlab(params);
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
      const calcResult = calculateConcreteSlab(paramsArray[i]);
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
  console.log('Testing Concrete Slab Calculator API...');
  
  // Test single calculation
  const testParams = {
    geometry: { MEd: "20", t: 200, c: 35 },
    material: { fcd: 19.8, fyd: 435 },
    reinforcement: { phi_l: 12, cc_l: 200 }
  };
  
  console.log('Single calculation test:');
  const singleResult = handleApiRequest(testParams);
  console.log(singleResult);
  
  // Test batch calculation
  const batchParams = [
    testParams,
    { ...testParams, geometry: { ...testParams.geometry, t: 250 } },
    { ...testParams, reinforcement: { ...testParams.reinforcement, phi_l: 16 } }
  ];
  
  console.log('Batch calculation test:');
  const batchResult = handleApiRequest(batchParams);
  console.log(batchResult);
  
  // Test error handling
  console.log('Error handling test:');
  const errorResult = handleApiRequest({ geometry: { MEd: 'invalid' } });
  console.log(errorResult);
  
  console.log('Concrete Slab API tests completed. Check results above.');
  return { singleResult, batchResult, errorResult };
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateConcreteSlab,
    calculateConcreteSlabBatch,
    evaluateExpression,
    validateConcreteSlabInputs,
    handleApiRequest,
    processSingle,
    processBatch,
    testAPI
  };
} else {
  // Browser environment
  window.ConcreteSlabAPI = {
    calculateConcreteSlab,
    calculateConcreteSlabBatch,
    evaluateExpression,
    validateConcreteSlabInputs,
    handleApiRequest,
    processSingle,
    processBatch,
    testAPI
  };
  
  // Expose main API function globally
  window.concreteSlabCalculate = handleApiRequest;
  
  // Set up API handling on page load
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Concrete Slab Calculator API ready. Use window.concreteSlabCalculate(data) for programmatic access.');
    });
  }
}