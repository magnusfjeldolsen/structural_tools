/**
 * CFRP Concrete Plate Reinforcement Calculator - Pure Calculation API
 * Carbon Fiber Reinforced Polymer strengthening analysis
 *
 * Complete traceability: Returns ALL intermediate calculation values
 */

// Concrete properties database (EC2 Table 3.1)
const CONCRETE_PROPERTIES = {
  12: { fck: 12, fcm: 20 },
  16: { fck: 16, fcm: 24 },
  20: { fck: 20, fcm: 28 },
  25: { fck: 25, fcm: 33 },
  30: { fck: 30, fcm: 38 },
  35: { fck: 35, fcm: 43 },
  40: { fck: 40, fcm: 48 },
  45: { fck: 45, fcm: 53 },
  50: { fck: 50, fcm: 58 },
  55: { fck: 55, fcm: 63 },
  60: { fck: 60, fcm: 68 },
  70: { fck: 70, fcm: 78 },
  80: { fck: 80, fcm: 88 },
  90: { fck: 90, fcm: 98 }
};

/**
 * Main calculation function
 * @param {Object} inputs - All input parameters
 * @returns {Object} - Complete calculation results with traceability
 */
function calculateCFRPPlate(inputs) {
  try {
    // Validate inputs
    const validation = validateInputs(inputs);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        message: 'Input validation failed'
      };
    }

    // Extract concrete properties
    const concrete = CONCRETE_PROPERTIES[inputs.concrete_grade];
    if (!concrete) {
      return {
        success: false,
        errors: [`Invalid concrete grade: ${inputs.concrete_grade}`],
        message: 'Concrete grade not found'
      };
    }

    const fck = concrete.fck;
    const fcm = concrete.fcm;

    // === MATERIAL PROPERTY CALCULATIONS ===

    // Tensile strength (EC2-1-1 §3.1.2)
    let fctm;
    if (fck <= 50) {
      fctm = 0.3 * Math.pow(fck, 2/3);
    } else {
      fctm = 2.12 * Math.ln(1 + fcm/10);
    }

    // Elastic modulus (EC2-1-1 §3.1.3)
    const Ecm = 22000 * Math.pow(fcm/10, 0.3);

    // Lambda factor for compression zone (EC2-1-1 §3.1.7)
    let lambda;
    if (fck <= 50) {
      lambda = 0.8;
    } else if (fck <= 90) {
      lambda = 0.8 - (fck - 50)/400;
    } else {
      lambda = 0.7;
    }

    // Flexural tensile strength with depth effect (EC2-1-1 §3.1.8)
    const depth_factor = Math.max(1.6 - inputs.h/1000, 1.0);
    const fctm_fl = depth_factor * fctm;
    const fctm_effective = inputs.apply_depth_effect ? fctm_fl : fctm;

    // Design values
    const fcd = inputs.alpha_cc * fck / inputs.gamma_c;
    const Ec_eff = Ecm / (1 + inputs.phi);
    const alpha_s = inputs.Es * 1000 / Ec_eff;

    // === STEEL REINFORCEMENT ===
    const n_asl = inputs.b / inputs.ccl;
    const fyd = inputs.fyk / inputs.gamma_s;
    const Asl = n_asl * Math.PI * Math.pow(inputs.phi_steel, 2) / 4;
    const d = inputs.h - inputs.c - inputs.phi_steel/2;

    // === CFRP PARAMETERS ===
    const Af = inputs.n_layers * inputs.n_per_layer * inputs.tf * inputs.bfrp;
    const epsilon_fd = inputs.epsilon_fk / inputs.gamma_frp;
    const Efd = inputs.Efk * 1000 / inputs.gamma_frp;

    // Strain limitation for intermediate crack formation
    const epsilon_fd_ic = 0.41 * Math.sqrt(fcd / (inputs.n_layers * inputs.tf * Efd));
    const epsilon_f_max = Math.min(epsilon_fd, epsilon_fd_ic);

    // === MOMENT CAPACITIES ===

    // M1: Additional moment after installation
    const M1 = inputs.MEd - inputs.M0;

    // Moment capacity before fiber (steel only)
    const xs = (Asl * fyd) / (lambda * fcd * inputs.b);
    const MRd_s = (Asl * fyd * (d - lambda * xs / 2)) / 1000000; // Nmm to kNm

    // Moment capacity after fiber
    const xsf = (Asl * fyd + Af * Efd * epsilon_f_max) / (lambda * fcd * inputs.b);
    const MRd_sf = (Asl * fyd * (d - lambda * xsf / 2) + epsilon_f_max * Efd * Af * (inputs.h - lambda * xsf / 2)) / 1000000; // Nmm to kNm

    // === SECTION STATE ANALYSIS (Stadium I/II) ===

    const epsilon_c2 = 0.0035; // Ultimate compressive strain for fck <= 50
    const rho = Asl / (inputs.b * d);

    // Stadium I calculations (transformed section)
    const A_c = inputs.b * inputs.h;
    const alpha_d_I = (A_c * 0.5 * inputs.h + alpha_s * Asl * d) / (A_c + alpha_s * Asl);
    const I_I = (inputs.b * Math.pow(inputs.h, 3)) / 12 + inputs.b * inputs.h * Math.pow(alpha_d_I - inputs.h/2, 2);
    const M_crack = (fctm_effective * I_I) / (0.5 * inputs.h) / 1000000; // Nmm to kNm

    // Determine section state
    const stadium = (inputs.M0 >= M_crack) ? 2 : 1;
    const sectionState = (stadium === 1) ? "Stadium I (Uncracked)" : "Stadium II (Cracked)";

    let I_section, alpha_d_or_factor, epsilon_cu0;

    if (stadium === 1) {
      // Stadium I - Uncracked
      I_section = I_I;
      alpha_d_or_factor = alpha_d_I;
      const y_bottom = inputs.h - alpha_d_I;
      const sigma_c_bottom = (inputs.M0 * 1000000 * y_bottom) / I_I;
      epsilon_cu0 = sigma_c_bottom / Ec_eff;
    } else {
      // Stadium II - Cracked
      const alpha_II = Math.sqrt(Math.pow(alpha_s * rho, 2) + 2 * alpha_s * rho) - alpha_s * rho;
      alpha_d_or_factor = alpha_II;
      I_section = 0.5 * Math.pow(alpha_II, 2) * (1 - alpha_II/3) * inputs.b * Math.pow(d, 3);
      const y_bottom = inputs.h - alpha_II * d;
      const sigma_c_bottom = (inputs.M0 * 1000000 * y_bottom) / I_section;
      epsilon_cu0 = sigma_c_bottom / Ec_eff;
    }

    // === REINFORCEMENT PARAMETERS ===
    const omega_bal = lambda / (1 + (epsilon_f_max + epsilon_cu0) / epsilon_c2);
    const omega = (Asl * fyd + Af * epsilon_f_max * Efd) / (inputs.b * inputs.h * fcd);

    const isUnderReinforced = omega <= omega_bal;
    const utilizationRatio = inputs.MEd / MRd_sf;
    const capacityIncrease = ((MRd_sf - MRd_s) / MRd_s * 100);
    const omegaUtilization = omega / omega_bal;

    // Determine governing failure mode
    let failureMode = "";
    if (isUnderReinforced) {
      failureMode = "Steel yielding followed by concrete crushing (ductile)";
    } else {
      failureMode = "Concrete crushing before steel yield (brittle)";
    }

    // === RETURN COMPLETE RESULTS ===
    return {
      success: true,

      // Echo back inputs for verification
      inputs: {
        moments: {
          M0: inputs.M0,
          MEd: inputs.MEd,
          M1: parseFloat(M1.toFixed(2))
        },
        geometry: {
          b: inputs.b,
          h: inputs.h,
          c: inputs.c,
          d: parseFloat(d.toFixed(2)),
          phi_steel: inputs.phi_steel,
          ccl: inputs.ccl
        },
        concrete: {
          concrete_grade: inputs.concrete_grade,
          fck: fck,
          gamma_c: inputs.gamma_c,
          alpha_cc: inputs.alpha_cc,
          phi: inputs.phi,
          apply_depth_effect: inputs.apply_depth_effect
        },
        steel: {
          fyk: inputs.fyk,
          gamma_s: inputs.gamma_s,
          Es: inputs.Es,
          n_per_layer: inputs.n_per_layer
        },
        cfrp: {
          n_layers: inputs.n_layers,
          n_per_layer_cfrp: inputs.n_per_layer,
          tf: inputs.tf,
          bfrp: inputs.bfrp,
          epsilon_fk: inputs.epsilon_fk,
          Efk: inputs.Efk,
          gamma_frp: inputs.gamma_frp
        }
      },

      // ALL intermediate calculations
      intermediate_calculations: {
        materials: {
          fck: parseFloat(fck.toFixed(1)),
          fcm: parseFloat(fcm.toFixed(1)),
          fctm: parseFloat(fctm.toFixed(3)),
          Ecm: parseFloat(Ecm.toFixed(0)),
          lambda: parseFloat(lambda.toFixed(3)),
          depth_factor: parseFloat(depth_factor.toFixed(3)),
          fctm_fl: parseFloat(fctm_fl.toFixed(3)),
          fctm_effective: parseFloat(fctm_effective.toFixed(3)),
          fcd: parseFloat(fcd.toFixed(2)),
          Ec_eff: parseFloat(Ec_eff.toFixed(0)),
          alpha_s: parseFloat(alpha_s.toFixed(2)),
          fyd: parseFloat(fyd.toFixed(1)),
          epsilon_c2: epsilon_c2
        },
        steel_reinforcement: {
          n_asl: parseFloat(n_asl.toFixed(1)),
          Asl: parseFloat(Asl.toFixed(0)),
          d: parseFloat(d.toFixed(1)),
          rho: parseFloat(rho.toFixed(4))
        },
        cfrp: {
          Af: parseFloat(Af.toFixed(1)),
          epsilon_fd: parseFloat(epsilon_fd.toFixed(6)),
          Efd: parseFloat(Efd.toFixed(0)),
          epsilon_fd_ic: parseFloat(epsilon_fd_ic.toFixed(6)),
          epsilon_f_max: parseFloat(epsilon_f_max.toFixed(6))
        },
        section_state: {
          A_c: parseFloat(A_c.toFixed(0)),
          alpha_d_I: parseFloat(alpha_d_I.toFixed(2)),
          I_I: parseFloat(I_I.toFixed(0)),
          M_crack: parseFloat(M_crack.toFixed(2)),
          stadium: stadium,
          sectionState: sectionState,
          I_section: parseFloat(I_section.toFixed(0)),
          alpha_d_or_factor: parseFloat(alpha_d_or_factor.toFixed(4)),
          epsilon_cu0: parseFloat(epsilon_cu0.toFixed(6))
        },
        neutral_axis: {
          xs_without_cfrp: parseFloat(xs.toFixed(2)),
          xsf_with_cfrp: parseFloat(xsf.toFixed(2)),
          neutral_axis_shift: parseFloat((xsf - xs).toFixed(2))
        },
        reinforcement_params: {
          omega_bal: parseFloat(omega_bal.toFixed(4)),
          omega: parseFloat(omega.toFixed(4)),
          omega_utilization: parseFloat(omegaUtilization.toFixed(3))
        }
      },

      // Final results
      results: {
        capacity_before_cfrp: {
          MRd: parseFloat(MRd_s.toFixed(2)),
          utilization_vs_MEd: parseFloat((inputs.MEd / MRd_s).toFixed(3))
        },
        capacity_after_cfrp: {
          MRd: parseFloat(MRd_sf.toFixed(2)),
          utilization_vs_MEd: parseFloat(utilizationRatio.toFixed(3))
        },
        strengthening_effectiveness: {
          capacity_increase_percent: parseFloat(capacityIncrease.toFixed(1)),
          capacity_increase_kNm: parseFloat((MRd_sf - MRd_s).toFixed(2)),
          is_under_reinforced: isUnderReinforced,
          failure_mode: failureMode
        },
        section_classification: isUnderReinforced ? "Under-reinforced (Ductile)" : "Over-reinforced (Brittle)"
      },

      // Status checks
      status: {
        moment_utilization_before: parseFloat((inputs.MEd / MRd_s).toFixed(3)),
        moment_utilization_after: parseFloat(utilizationRatio.toFixed(3)),
        omega_utilization: parseFloat(omegaUtilization.toFixed(3)),
        is_adequate: utilizationRatio <= 1.0 && isUnderReinforced,
        passes_all_checks: utilizationRatio <= 1.0 && isUnderReinforced
      },

      // Metadata
      _metadata: {
        calculation_timestamp: new Date().toISOString(),
        module_id: 'concrete_plate_CFRP',
        version: '1.0.0',
        standard: 'Eurocode 2',
        analysis_type: 'CFRP Strengthening'
      }
    };

  } catch (error) {
    return {
      success: false,
      errors: [error.message],
      message: 'Calculation error occurred',
      stack: error.stack
    };
  }
}

/**
 * Validate inputs
 */
function validateInputs(inputs) {
  const errors = [];

  // Required numeric inputs
  const requiredNumbers = [
    'M0', 'MEd', 'b', 'h', 'concrete_grade', 'gamma_c', 'alpha_cc',
    'phi', 'phi_steel', 'c', 'ccl', 'fyk', 'Es', 'gamma_s',
    'n_layers', 'n_per_layer', 'tf', 'bfrp', 'epsilon_fk', 'Efk', 'gamma_frp'
  ];

  requiredNumbers.forEach(key => {
    if (inputs[key] === undefined || inputs[key] === null || isNaN(inputs[key])) {
      errors.push(`Missing or invalid input: ${key}`);
    }
  });

  // Positive value checks
  if (inputs.b <= 0) errors.push('Width (b) must be positive');
  if (inputs.h <= 0) errors.push('Height (h) must be positive');
  if (inputs.MEd <= 0) errors.push('Design moment (MEd) must be positive');

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// Export for use in browser and Node.js
if (typeof window !== 'undefined') {
  window.CFRPPlateAPI = {
    calculateCFRPPlate,
    CONCRETE_PROPERTIES
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateCFRPPlate,
    CONCRETE_PROPERTIES
  };
}
