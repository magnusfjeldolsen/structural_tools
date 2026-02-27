/**
 * Steel Column Flexural Buckling API
 * Eurocode 3-1-1 Section 6.3.1 | Fire design per EC3-1-2
 */

// ============================================================================
// MODULE CONFIGURATION (for workflow integration)
// ============================================================================

const MODULE_CONFIG = {
  module_id: "flexural_buckling",
  module_name: "Steel Column Flexural Buckling",
  version: "1.0.0",
  standard: "Eurocode 3-1-1 Section 6.3.1",
  description: "Flexural buckling capacity of compression members with optional fire design per EC3-1-2",

  inputs: {
    // Steel section
    profileType: {
      label: "Profile type",
      symbol: "Profile",
      type: "select",
      options: ["hea", "heb", "hem", "ipe", "hrhs", "hshs", "hchs", "crhs", "cshs", "cchs"],
      required: true,
      category: "section",
      description: "Steel section profile type"
    },
    profileName: {
      label: "Profile size",
      symbol: "Size",
      type: "select",
      required: true,
      category: "section",
      description: "Specific profile size (depends on profile type)"
    },

    // Buckling lengths
    Ly: {
      label: "Buckling length about y-axis",
      symbol: "L_y",
      type: "expression",
      unit: "m",
      required: true,
      min: 0.1,
      default: 3.5,
      category: "geometry",
      description: "Buckling length about major axis (accepts expressions)"
    },
    Lz: {
      label: "Buckling length about z-axis",
      symbol: "L_z",
      type: "expression",
      unit: "m",
      required: true,
      min: 0.1,
      default: 3.5,
      category: "geometry",
      description: "Buckling length about minor axis (accepts expressions)"
    },

    // Material
    steelGrade: {
      label: "Steel grade",
      symbol: "Grade",
      type: "select",
      options: ["S235", "S275", "S355", "S420", "S460"],
      required: true,
      default: "S355",
      category: "material",
      description: "Steel grade according to EC3"
    },
    fy: {
      label: "Yield strength",
      symbol: "f_y",
      type: "number",
      unit: "MPa",
      required: true,
      min: 200,
      max: 500,
      default: 355,
      category: "material",
      description: "Characteristic yield strength (auto-updates with grade and thickness)"
    },
    gamma_M1: {
      label: "Partial factor γM1",
      symbol: "γ_M1",
      type: "number",
      unit: "-",
      required: true,
      min: 0.9,
      max: 1.5,
      default: 1.05,
      category: "material",
      description: "Partial safety factor for member instability (1.05 typical for Norway, 1.0 elsewhere)"
    },

    // ULS loads
    NEd_ULS: {
      label: "Design axial force (ULS)",
      symbol: "N_Ed",
      type: "expression",
      unit: "kN",
      required: true,
      min: 0,
      default: 1000,
      category: "loads_uls",
      description: "Axial compression force for ULS - positive = compression (accepts expressions)"
    },

    // Fire loads
    fireEnabled: {
      label: "Enable fire design",
      symbol: "Fire",
      type: "boolean",
      required: false,
      default: false,
      category: "loads_fire",
      description: "Enable fire design calculations per EC3-1-2"
    },
    fireMode: {
      label: "Fire temperature mode",
      symbol: "Mode",
      type: "select",
      options: ["specify", "find-critical"],
      required: false,
      default: "specify",
      category: "loads_fire",
      description: "Specify temperature or find critical temperature"
    },
    NEd_fire: {
      label: "Fire design axial force",
      symbol: "N_Ed,fi",
      type: "expression",
      unit: "kN",
      required: false,
      min: 0,
      default: 600,
      category: "loads_fire",
      description: "Axial compression force for fire case - positive = compression (accepts expressions)"
    },
    temperature: {
      label: "Steel temperature",
      symbol: "θ",
      type: "number",
      unit: "°C",
      required: false,
      min: 20,
      max: 1000,
      default: 20,
      category: "loads_fire",
      description: "Steel temperature for fire case (max 1000°C)"
    }
  },

  outputs: {
    // ULS outputs
    lambda_bar_y: {
      label: "Non-dimensional slenderness (y-axis)",
      symbol: "λ̄_y",
      unit: "-",
      category: "uls_results"
    },
    lambda_bar_z: {
      label: "Non-dimensional slenderness (z-axis)",
      symbol: "λ̄_z",
      unit: "-",
      category: "uls_results"
    },
    chi_min: {
      label: "Reduction factor (minimum)",
      symbol: "χ_min",
      unit: "-",
      category: "uls_results"
    },
    Nb_Rd: {
      label: "Buckling resistance",
      symbol: "N_b,Rd",
      unit: "kN",
      category: "uls_results"
    },
    utilization_uls: {
      label: "ULS utilization",
      symbol: "η_ULS",
      unit: "%",
      category: "uls_results"
    },

    // Fire outputs
    critical_temp: {
      label: "Critical temperature",
      symbol: "θ_cr",
      unit: "°C",
      category: "fire_results"
    },
    utilization_fire: {
      label: "Fire utilization",
      symbol: "η_fi",
      unit: "%",
      category: "fire_results"
    }
  }
};

// ============================================================================
// MATERIAL DATABASE
// ============================================================================

const STEEL_GRADES = {
  S235: {
    fy: { "<=16": 235, "16-40": 225, "40-63": 215, "63-80": 215, "80-100": 215, "100-150": 195, "150-200": 185, "200-250": 175, "250-400": 165 }
  },
  S275: {
    fy: { "<=16": 275, "16-40": 265, "40-63": 255, "63-80": 245, "80-100": 235, "100-150": 225, "150-200": 215, "200-250": 205, "250-400": 195 }
  },
  S355: {
    fy: { "<=16": 355, "16-40": 345, "40-63": 335, "63-80": 325, "80-100": 315, "100-150": 295, "150-200": 285, "200-250": 275, "250-400": 265 }
  },
  S420: {
    fy: { "<=16": 420, "16-40": 400, "40-63": 390, "63-80": 370, "80-100": 360, "100-150": 340, "150-200": 320, "200-250": 300, "250-400": 280 }
  },
  S460: {
    fy: { "<=16": 460, "16-40": 440, "40-63": 430, "63-80": 410, "80-100": 400, "100-150": 380, "150-200": 360, "200-250": 340, "250-400": 320 }
  }
};

// Fire reduction factors per EC3-1-2 Table 3.1
const FIRE_REDUCTION_FACTORS = {
  k_y_theta: [
    { temp: 20, factor: 1.000 },
    { temp: 100, factor: 1.000 },
    { temp: 200, factor: 1.000 },
    { temp: 300, factor: 1.000 },
    { temp: 400, factor: 1.000 },
    { temp: 500, factor: 0.780 },
    { temp: 600, factor: 0.470 },
    { temp: 700, factor: 0.230 },
    { temp: 800, factor: 0.110 },
    { temp: 900, factor: 0.060 },
    { temp: 1000, factor: 0.040 },
    { temp: 1100, factor: 0.020 },
    { temp: 1200, factor: 0.000 }
  ],
  k_E_theta: [
    { temp: 20, factor: 1.000 },
    { temp: 100, factor: 1.000 },
    { temp: 200, factor: 0.900 },
    { temp: 300, factor: 0.800 },
    { temp: 400, factor: 0.700 },
    { temp: 500, factor: 0.600 },
    { temp: 600, factor: 0.310 },
    { temp: 700, factor: 0.130 },
    { temp: 800, factor: 0.090 },
    { temp: 900, factor: 0.068 },
    { temp: 1000, factor: 0.045 },
    { temp: 1100, factor: 0.023 },
    { temp: 1200, factor: 0.000 }
  ]
};

// Imperfection factors per EC3-1-1 Table 6.1
const IMPERFECTION_FACTORS = {
  a0: 0.13,
  a: 0.21,
  b: 0.34,
  c: 0.49,
  d: 0.76
};

// ============================================================================
// STEEL SECTION DATABASE
// ============================================================================

let steelDatabase = {};
let profileOrder = {}; // Store original order from JSON files

/**
 * Load steel section database from JSON files
 */
async function loadSteelDatabase() {
  const profileTypes = ['hea', 'heb', 'hem', 'ipe', 'hrhs', 'hshs', 'hchs', 'crhs', 'cshs', 'cchs'];

  for (const type of profileTypes) {
    try {
      const response = await fetch(`../steel_cross_section_database/${type}.json`);
      const data = await response.json();

      // Transform profiles array into object with profile names as keys
      if (data.profiles && Array.isArray(data.profiles)) {
        const profilesObj = {};
        const orderArray = []; // Track original order

        data.profiles.forEach(profile => {
          const name = profile.profile;
          orderArray.push(name); // Store order

          // Transform property names to match our expected format
          profilesObj[name] = {
            // Original properties
            ...profile,

            // Add computed properties for buckling calculations
            // Area in cm² (convert from mm²)
            area: profile.A / 100,

            // Second moment of area in cm⁴ (convert from mm⁴)
            iy_moment: profile.Iy / 10000,
            iz_moment: profile.Iz / 10000,

            // Radius of gyration in cm (convert from mm)
            iy: profile.iy / 10,
            iz: profile.iz / 10,

            // Buckling curves
            buckling_curve_y: profile.alpha_yy || 'b',
            buckling_curve_z: profile.alpha_zz || 'c'
          };
        });

        steelDatabase[type] = profilesObj;
        profileOrder[type] = orderArray; // Store original order
      }
    } catch (error) {
      console.error(`Failed to load ${type}.json:`, error);
    }
  }

  console.log('Steel database loaded:', Object.keys(steelDatabase));
  return steelDatabase;
}

/**
 * Get list of profile names for a given type (in original JSON order)
 */
function getProfileNames(profileType) {
  if (!profileOrder[profileType]) {
    return [];
  }
  // Return profiles in original JSON file order
  return profileOrder[profileType];
}

/**
 * Get list of profile names sorted by section area (ascending)
 * Only called when searching for lightest section
 */
function getProfileNamesSortedByArea(profileType) {
  if (!steelDatabase[profileType]) {
    return [];
  }

  const profiles = steelDatabase[profileType];
  const profileNames = Object.keys(profiles);

  // Sort by area (ascending - lightest first)
  return profileNames.sort((a, b) => {
    const areaA = profiles[a].area;
    const areaB = profiles[b].area;
    return areaA - areaB;
  });
}

/**
 * Get section properties for a specific profile
 */
function getSectionProperties(profileType, profileName) {
  if (!steelDatabase[profileType] || !steelDatabase[profileType][profileName]) {
    return null;
  }
  return steelDatabase[profileType][profileName];
}

/**
 * Get yield strength based on steel grade and flange thickness
 */
function getYieldStrength(steelGrade, thickness_mm) {
  const grade = STEEL_GRADES[steelGrade];
  if (!grade) return null;

  const fyTable = grade.fy;

  if (thickness_mm <= 16) return fyTable["<=16"];
  if (thickness_mm <= 40) return fyTable["16-40"];
  if (thickness_mm <= 63) return fyTable["40-63"];
  if (thickness_mm <= 80) return fyTable["63-80"];
  if (thickness_mm <= 100) return fyTable["80-100"];
  if (thickness_mm <= 150) return fyTable["100-150"];
  if (thickness_mm <= 200) return fyTable["150-200"];
  if (thickness_mm <= 250) return fyTable["200-250"];
  return fyTable["250-400"];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Piecewise linear interpolation for fire reduction factors
 */
function getFireReductionFactor(temp, property) {
  const table = FIRE_REDUCTION_FACTORS[property];

  // Clamp temperature to valid range
  if (temp <= table[0].temp) return table[0].factor;
  if (temp >= table[table.length - 1].temp) return table[table.length - 1].factor;

  // Piecewise linear interpolation
  for (let i = 0; i < table.length - 1; i++) {
    if (temp >= table[i].temp && temp <= table[i + 1].temp) {
      const t1 = table[i].temp;
      const t2 = table[i + 1].temp;
      const f1 = table[i].factor;
      const f2 = table[i + 1].factor;

      // Linear interpolation: f = f1 + (f2 - f1) * (temp - t1) / (t2 - t1)
      const interpolatedFactor = f1 + (f2 - f1) * (temp - t1) / (t2 - t1);
      return interpolatedFactor;
    }
  }

  return 0;
}

/**
 * Evaluate mathematical expressions safely
 */
function evaluateExpression(expr) {
  try {
    // Remove whitespace
    expr = expr.toString().trim();

    // Only allow numbers, operators, parentheses, and decimal points
    if (!/^[\d\s+\-*/.()]+$/.test(expr)) {
      throw new Error('Invalid characters in expression');
    }

    // Evaluate using Function constructor (safer than eval)
    const result = new Function('return ' + expr)();

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Expression does not evaluate to a valid number');
    }

    return result;
  } catch (error) {
    throw new Error(`Invalid expression: ${expr}`);
  }
}

/**
 * Format number with fixed decimals, removing trailing zeros
 */
function toFixedIfNeeded(value, decimals = 3) {
  if (typeof value !== 'number' || !isFinite(value)) return '-';
  return parseFloat(value.toFixed(decimals)).toString();
}

// ============================================================================
// SECTION CLASSIFICATION (EC3-1-1 Table 5.2)
// ============================================================================

// Classification templates for different profile families
const CLASSIFICATION_TEMPLATES = {
  i_section: {
    applies_to: ['hea', 'heb', 'hem', 'ipe'],
    subplates: [
      { id: 'flange_outstand', type: 'outstand', c_formula: '(b/2 - tw/2 - r)', t_formula: 'tf' },
      { id: 'web_internal', type: 'internal', c_formula: '(h - 2*tf - 2*r)', t_formula: 'tw' }
    ]
  },
  rhs: {
    applies_to: ['hrhs', 'hshs', 'crhs', 'cshs'],
    subplates: [
      { id: 'flange_internal', type: 'internal', c_formula: '(b - 3*t)', t_formula: 't' },
      { id: 'web_internal', type: 'internal', c_formula: '(h - 3*t)', t_formula: 't' }
    ]
  },
  chs: {
    applies_to: ['hchs', 'cchs'],
    subplates: [
      { id: 'circular_tube', type: 'circular', c_formula: 'D', t_formula: 't' }
    ]
  }
};

/**
 * Get classification template for a profile type
 */
function getClassificationTemplate(profileType) {
  for (const template of Object.values(CLASSIFICATION_TEMPLATES)) {
    if (template.applies_to.includes(profileType)) {
      return template;
    }
  }
  return null;
}

/**
 * Evaluate formula string with section dimensions
 */
function evaluateFormula(formula, section) {
  let expression = formula;

  // Replace section properties in formula
  for (const [key, value] of Object.entries(section)) {
    if (typeof value === 'number') {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expression = expression.replace(regex, value.toString());
    }
  }

  // Evaluate mathematical expression
  try {
    return Function('"use strict"; return (' + expression + ')')();
  } catch (error) {
    console.error('Formula evaluation error:', formula, error);
    return NaN;
  }
}

/**
 * Get classification limits based on element type per EC3-1-1 Table 5.2
 */
function getClassificationLimit(elementType, targetClass, epsilon) {
  const limits = {
    'outstand': {
      1: 9 * epsilon,
      2: 10 * epsilon,
      3: 14 * epsilon
    },
    'internal': {
      1: 33 * epsilon,
      2: 38 * epsilon,
      3: 42 * epsilon
    },
    'circular': {
      1: 50 * epsilon * epsilon,
      2: 70 * epsilon * epsilon,
      3: 90 * epsilon * epsilon
    }
  };

  return limits[elementType]?.[targetClass] || Infinity;
}

/**
 * Determine plate class based on slenderness
 */
function getPlateClass(elementType, slenderness, epsilon) {
  // Handle circular sections separately (use d/t ratio)
  if (elementType === 'circular') {
    const d_over_t = slenderness;
    if (d_over_t <= 50 * epsilon * epsilon) return 1;
    if (d_over_t <= 70 * epsilon * epsilon) return 2;
    if (d_over_t <= 90 * epsilon * epsilon) return 3;
    return 4;
  }

  // Internal and outstand elements (use c/t ratio)
  const limit1 = getClassificationLimit(elementType, 1, epsilon);
  const limit2 = getClassificationLimit(elementType, 2, epsilon);
  const limit3 = getClassificationLimit(elementType, 3, epsilon);

  if (slenderness <= limit1) return 1;
  if (slenderness <= limit2) return 2;
  if (slenderness <= limit3) return 3;
  return 4;
}

/**
 * Classify cross-section per EC3-1-1 Table 5.2 (pure compression)
 * @param {Object} section - Section properties from database
 * @param {number} fy - Yield strength in MPa
 * @param {string} profileType - Profile type (hea, hrhs, etc.)
 * @returns {Object} Classification result
 */
function classifySection(section, fy, profileType) {
  const epsilon = Math.sqrt(235 / fy);

  // Get classification template for this profile type
  const template = getClassificationTemplate(profileType);

  if (!template) {
    return {
      class: 3,
      epsilon: epsilon,
      governing_element: null,
      element_results: [],
      is_class4: false,
      message: 'Classification template not available - assuming Class 3'
    };
  }

  const subplates = template.subplates;
  let worstClass = 1;
  let governingElement = null;
  const elementResults = [];

  // Evaluate each subplate
  for (const plate of subplates) {
    const c = evaluateFormula(plate.c_formula, section);
    const t = evaluateFormula(plate.t_formula, section);

    // Check for invalid dimensions
    if (!isFinite(c) || !isFinite(t) || c <= 0 || t <= 0) {
      console.warn(`Invalid dimensions for ${plate.id}: c=${c}, t=${t}`);
      continue;
    }

    const slenderness = c / t;
    const plateClass = getPlateClass(plate.type, slenderness, epsilon);

    elementResults.push({
      id: plate.id,
      type: plate.type,
      c: c,
      t: t,
      slenderness: slenderness,
      class: plateClass,
      limit_class1: getClassificationLimit(plate.type, 1, epsilon),
      limit_class2: getClassificationLimit(plate.type, 2, epsilon),
      limit_class3: getClassificationLimit(plate.type, 3, epsilon)
    });

    // Track worst (highest) class
    if (plateClass > worstClass) {
      worstClass = plateClass;
      governingElement = plate.id;
    }
  }

  return {
    class: worstClass,
    epsilon: epsilon,
    governing_element: governingElement,
    element_results: elementResults,
    is_class4: worstClass === 4
  };
}

/**
 * Calculate Class 4 effective properties per EN 1993-1-5
 * @param {Object} section - Gross section properties
 * @param {Object} classification - Classification results
 * @returns {Object} Effective section properties
 */
function calculateClass4EffectiveProperties(section, classification) {

  let A_eff = section.area;  // Start with gross area (cm²)
  let removed_area = 0;

  const plateReductions = [];

  // Iterate through Class 4 elements and calculate effective widths
  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const c = element.c;  // mm
    const t = element.t;  // mm
    const slenderness = element.slenderness;

    // Calculate plate slenderness parameter λp
    const limit_class3 = element.limit_class3;
    const lambda_p_bar = slenderness / limit_class3;

    // Calculate reduction factor ρ per EN 1993-1-5 Eq. 4.2
    // For internal compression elements: ρ = (λp - 0.055(3+ψ)) / λp² but ρ ≤ 1.0
    // For pure compression: ψ = 1.0 (uniform compression)
    const psi = 1.0;
    let rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar * lambda_p_bar);
    rho = Math.min(Math.max(rho, 0), 1.0);  // Clamp between 0 and 1

    // Effective width
    const c_eff = rho * c;
    const area_reduction = ((c - c_eff) * t) / 100;  // Convert mm² to cm²

    removed_area += area_reduction;

    plateReductions.push({
      element: element.id,
      c_gross: c,
      c_eff: c_eff,
      rho: rho,
      lambda_p_bar: lambda_p_bar,
      area_reduction: area_reduction
    });
  }

  A_eff = section.area - removed_area;

  // For symmetric sections in pure compression, neutral axis doesn't shift
  // Approximate I_eff by scaling I_gross proportionally to area reduction
  const area_ratio = A_eff / section.area;
  const I_eff_y = section.iy_moment * area_ratio;
  const I_eff_z = section.iz_moment * area_ratio;

  // Recalculate radii of gyration
  const i_eff_y = Math.sqrt(I_eff_y / A_eff);
  const i_eff_z = Math.sqrt(I_eff_z / A_eff);

  return {
    ...section,
    area: A_eff,
    iy_moment: I_eff_y,
    iz_moment: I_eff_z,
    iy: i_eff_y,
    iz: i_eff_z,
    is_effective: true,
    gross_area: section.area,
    area_reduction: removed_area,
    area_reduction_percent: (removed_area / section.area) * 100,
    plate_reductions: plateReductions
  };
}

// ============================================================================
// BUCKLING CALCULATIONS (EC3-1-1 Section 6.3.1)
// ============================================================================

/**
 * Calculate non-dimensional slenderness
 * λ̄ = (L/i) / λ₁ where λ₁ = π√(E/fy)
 */
function calculateSlenderness(L_m, i_cm, fy_MPa, E_MPa = 210000) {
  const L_cm = L_m * 100; // Convert m to cm
  const lambda = L_cm / i_cm; // Actual slenderness
  const lambda_1 = Math.PI * Math.sqrt(E_MPa / fy_MPa); // Euler slenderness
  const lambda_bar = lambda / lambda_1; // Non-dimensional slenderness

  return {
    lambda: lambda,
    lambda_1: lambda_1,
    lambda_bar: lambda_bar
  };
}

/**
 * Calculate reduction factor χ per EC3-1-1 Eq. 6.49
 */
function calculateReductionFactor(lambda_bar, bucklingCurve) {
  const alpha = IMPERFECTION_FACTORS[bucklingCurve];

  if (!alpha) {
    throw new Error(`Invalid buckling curve: ${bucklingCurve}`);
  }

  // φ = 0.5[1 + α(λ̄ - 0.2) + λ̄²]
  const phi = 0.5 * (1 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);

  // χ = 1 / (φ + √(φ² - λ̄²)) but χ ≤ 1.0
  let chi = 1 / (phi + Math.sqrt(phi * phi - lambda_bar * lambda_bar));

  // Limit χ to 1.0
  chi = Math.min(chi, 1.0);

  return {
    alpha: alpha,
    phi: phi,
    chi: chi
  };
}

/**
 * Calculate buckling resistance Nb,Rd
 * Nb,Rd = χ × A × fy / γM1
 * @param {Object} section - Section properties
 * @param {number} Ly_m - Buckling length y-axis (m)
 * @param {number} Lz_m - Buckling length z-axis (m)
 * @param {number} fy_MPa - Yield strength (MPa)
 * @param {number} temperature_C - Steel temperature (°C)
 * @param {number} gamma_M1 - Partial factor
 * @param {string} profileType - Profile type (for classification)
 * @param {boolean} allowClass4 - Allow Class 4 sections with effective properties
 */
function calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, temperature_C, gamma_M1, profileType, allowClass4 = false) {
  const E_MPa = 210000;

  // ========== SECTION CLASSIFICATION ==========
  // Classify section per EC3-1-1 Table 5.2
  const classification = classifySection(section, fy_MPa, profileType);

  // Determine which section to use (gross or effective)
  let workingSection = section;
  let effectiveProperties = null;

  if (classification.is_class4) {
    if (!allowClass4) {
      // Class 4 not allowed - return error
      return {
        success: false,
        error: 'Section is Class 4 (slender). Enable "Allow Class 4" or choose a different profile.',
        classification: classification
      };
    }

    // Calculate effective properties for Class 4 section
    effectiveProperties = calculateClass4EffectiveProperties(section, classification);
    workingSection = effectiveProperties;
  }

  // ========== FIRE MATERIAL REDUCTION ==========
  // Get material reduction factors for temperature
  let k_y_theta = 1.0;
  let k_E_theta = 1.0;

  if (temperature_C > 20) {
    k_y_theta = getFireReductionFactor(temperature_C, 'k_y_theta');
    k_E_theta = getFireReductionFactor(temperature_C, 'k_E_theta');
  }

  // Reduced material properties at temperature
  const fy_theta = fy_MPa * k_y_theta;
  const E_theta = E_MPa * k_E_theta;

  // ========== BUCKLING CALCULATIONS ==========
  // Calculate slenderness about both axes (using working section properties)
  const slenderness_y = calculateSlenderness(Ly_m, workingSection.iy, fy_theta, E_theta);
  const slenderness_z = calculateSlenderness(Lz_m, workingSection.iz, fy_theta, E_theta);

  // Get buckling curves for the section
  const curve_y = section.buckling_curve_y || 'b';
  const curve_z = section.buckling_curve_z || 'c';

  // Calculate reduction factors
  const reduction_y = calculateReductionFactor(slenderness_y.lambda_bar, curve_y);
  const reduction_z = calculateReductionFactor(slenderness_z.lambda_bar, curve_z);

  // Governing axis is the one with lower χ (more critical)
  const chi_min = Math.min(reduction_y.chi, reduction_z.chi);
  const governing_axis = reduction_y.chi < reduction_z.chi ? 'y' : 'z';

  // Buckling resistance: Nb,Rd = χ × A × fy / γM1
  // A is in cm², fy in MPa → result in kN
  const A_cm2 = workingSection.area;
  const Nb_Rd_kN = (chi_min * A_cm2 * fy_theta / gamma_M1) / 10; // Divide by 10: (cm² × MPa) / 10 = kN

  return {
    success: true,

    // Material properties
    fy_theta: fy_theta,
    E_theta: E_theta,
    k_y_theta: k_y_theta,
    k_E_theta: k_E_theta,

    // Slenderness
    slenderness_y: slenderness_y,
    slenderness_z: slenderness_z,

    // Buckling curves and imperfection factors
    curve_y: curve_y,
    curve_z: curve_z,
    alpha_y: reduction_y.alpha,
    alpha_z: reduction_z.alpha,

    // Reduction factors
    phi_y: reduction_y.phi,
    phi_z: reduction_z.phi,
    chi_y: reduction_y.chi,
    chi_z: reduction_z.chi,
    chi_min: chi_min,
    governing_axis: governing_axis,

    // Resistance
    Nb_Rd_kN: Nb_Rd_kN,

    // Classification results
    classification: classification,
    effective_properties: effectiveProperties,

    // Legacy support (deprecated - use classification.is_class4)
    isClass4: classification.is_class4,
    epsilon: classification.epsilon
  };
}

// ============================================================================
// CRITICAL TEMPERATURE CALCULATION (BRENT'S METHOD)
// ============================================================================

/**
 * Brent's root-finding algorithm
 * Robust combination of bisection, secant method, and inverse quadratic interpolation
 */
function brentRootFinder(f, a, b, tol = 1e-6, maxIter = 100) {
  let fa = f(a);
  let fb = f(b);

  if (fa * fb > 0) {
    throw new Error("Root not bracketed");
  }

  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let mflag = true;
  let d = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.abs(b - a) < tol) {
      return b;
    }

    let s;
    if (fa !== fc && fb !== fc) {
      // Inverse quadratic interpolation
      s = (a * fb * fc) / ((fa - fb) * (fa - fc)) +
          (b * fa * fc) / ((fb - fa) * (fb - fc)) +
          (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // Secant method
      s = b - fb * (b - a) / (fb - fa);
    }

    // Check if bisection is needed
    const cond1 = s < (3 * a + b) / 4 || s > b;
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < tol;
    const cond5 = !mflag && Math.abs(c - d) < tol;

    if (cond1 || cond2 || cond3 || cond4 || cond5) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f(s);
    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  return b;
}

/**
 * Find critical temperature where utilization = 1.0
 */
function findCriticalTemperature(NEd_fire_kN, section, Ly_m, Lz_m, fy_MPa, gamma_M1, profileType, allowClass4) {
  const tolerance = 0.001; // 0.1% convergence criterion

  // Objective function: utilization - 1.0
  function objective(temp) {
    const result = calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, temp, gamma_M1, profileType, allowClass4);
    if (!result.success) {
      // If calculation fails (e.g., Class 4 not allowed), return large positive value
      return 999;
    }
    const utilization = NEd_fire_kN / result.Nb_Rd_kN;
    return utilization - 1.0;
  }

  const tempMin = 20;
  const tempMax = 1000; // Limit to 1000°C to prevent unrealistic results

  const objMin = objective(tempMin);
  const objMax = objective(tempMax);

  // Check if root exists in range
  if (objMin * objMax > 0) {
    if (objMin < 0) {
      // Section always has excess capacity (even at 1000°C)
      return { criticalTemp: null, message: 'Section has excess capacity at all temperatures up to 1000°C' };
    } else {
      // Section fails even at ambient temperature
      return { criticalTemp: 20, message: 'Section fails at ambient temperature' };
    }
  }

  // Find critical temperature using Brent's method
  const criticalTemp = brentRootFinder(objective, tempMin, tempMax, tolerance);

  // Limit to 1000°C maximum
  const limitedTemp = Math.min(criticalTemp, 1000);

  return {
    criticalTemp: limitedTemp,
    message: limitedTemp >= 1000 ? 'Critical temperature exceeds 1000°C (calculation limit)' : null
  };
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Main function to perform all buckling calculations
 */
function calculateBuckling(inputs) {
  try {
    // Parse inputs
    const profileType = inputs.profileType;
    const profileName = inputs.profileName;
    const Ly_m = evaluateExpression(inputs.Ly);
    const Lz_m = evaluateExpression(inputs.Lz);
    const steelGrade = inputs.steelGrade;
    const fy_MPa = parseFloat(inputs.fy);
    const gamma_M1 = parseFloat(inputs.gamma_M1);
    const NEd_ULS_kN = evaluateExpression(inputs.NEd_ULS);

    const fireEnabled = inputs.fireEnabled || false;
    const fireMode = inputs.fireMode || 'specify';
    const NEd_fire_kN = fireEnabled ? evaluateExpression(inputs.NEd_fire) : null;
    const temperature_C = fireEnabled ? parseFloat(inputs.temperature) : 20;

    // Class 4 handling
    const allowClass4 = inputs.allowClass4 !== undefined ? inputs.allowClass4 : false;

    // Get section properties
    const section = getSectionProperties(profileType, profileName);
    if (!section) {
      throw new Error('Section not found in database');
    }

    // Calculate ULS buckling resistance at ambient temperature
    const ulsResults = calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, 20, gamma_M1, profileType, allowClass4);

    // Check if ULS calculation failed (e.g., Class 4 not allowed)
    if (!ulsResults.success) {
      return {
        success: false,
        error: ulsResults.error,
        classification: ulsResults.classification
      };
    }

    const utilization_ULS = NEd_ULS_kN / ulsResults.Nb_Rd_kN;

    // Calculate fire case if enabled
    let fireResults = null;
    let criticalTempResult = null;

    if (fireEnabled && NEd_fire_kN) {
      if (fireMode === 'find-critical') {
        // Find critical temperature mode
        criticalTempResult = findCriticalTemperature(NEd_fire_kN, section, Ly_m, Lz_m, fy_MPa, gamma_M1, profileType, allowClass4);

        // Calculate properties at critical temperature (if valid)
        const tempToUse = criticalTempResult.criticalTemp || 20;
        fireResults = calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, tempToUse, gamma_M1, profileType, allowClass4);
        if (!fireResults.success) {
          return {
            success: false,
            error: fireResults.error,
            classification: fireResults.classification
          };
        }
        fireResults.utilization = NEd_fire_kN / fireResults.Nb_Rd_kN;
        fireResults.criticalTemp = criticalTempResult.criticalTemp;
        fireResults.criticalTempMessage = criticalTempResult.message;

      } else {
        // Specify temperature mode
        fireResults = calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, temperature_C, gamma_M1, profileType, allowClass4);
        if (!fireResults.success) {
          return {
            success: false,
            error: fireResults.error,
            classification: fireResults.classification
          };
        }
        const utilization_fire = NEd_fire_kN / fireResults.Nb_Rd_kN;

        fireResults.utilization = utilization_fire;
        fireResults.criticalTemp = null;
        fireResults.criticalTempMessage = null;
      }
    }

    return {
      success: true,
      inputs: {
        profileType: profileType,
        profileName: profileName,
        section: section,
        Ly_m: Ly_m,
        Lz_m: Lz_m,
        steelGrade: steelGrade,
        fy_MPa: fy_MPa,
        gamma_M1: gamma_M1,
        NEd_ULS_kN: NEd_ULS_kN,
        fireEnabled: fireEnabled,
        NEd_fire_kN: NEd_fire_kN,
        temperature_C: temperature_C
      },
      ulsResults: {
        ...ulsResults,
        utilization: utilization_ULS
      },
      fireResults: fireResults
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// FIND LIGHTEST SECTION
// ============================================================================

/**
 * Find the lightest section that meets utilization requirements
 * Searches through all profiles in the selected type, sorted by area
 */
function findLightestSection(inputs, progressCallback) {
  try {
    const profileType = inputs.profileType;

    if (!profileType) {
      throw new Error('Profile type must be selected');
    }

    // Get profiles sorted by area (lightest first)
    const sortedProfiles = getProfileNamesSortedByArea(profileType);

    if (sortedProfiles.length === 0) {
      throw new Error('No profiles found for selected type');
    }

    let lastValidSection = null;
    let testedCount = 0;
    const totalCount = sortedProfiles.length;

    // Iterate through sorted profiles
    for (const profileName of sortedProfiles) {
      testedCount++;

      // Report progress if callback provided
      if (progressCallback) {
        progressCallback(testedCount, totalCount, profileName);
      }

      // Create test inputs with current profile
      const testInputs = { ...inputs, profileName };

      // Calculate buckling for this section
      const results = calculateBuckling(testInputs);

      if (!results.success) {
        continue; // Skip invalid sections
      }

      // Determine maximum utilization based on design mode
      let maxUtilization = results.ulsResults.utilization;
      let utilizationSource = 'ULS';

      // If fire design is enabled and in "specify temperature" mode
      // take the maximum of ULS and fire utilization
      if (inputs.fireEnabled && results.fireResults && inputs.fireMode === 'specify') {
        const ulsUtil = results.ulsResults.utilization;
        const fireUtil = results.fireResults.utilization;
        maxUtilization = Math.max(ulsUtil, fireUtil);
        utilizationSource = `max(ULS: ${(ulsUtil * 100).toFixed(1)}%, Fire: ${(fireUtil * 100).toFixed(1)}%)`;
      }
      // If fire design is enabled but in "find-critical" mode
      // only use ULS utilization (theta_cr is a follower value)
      else if (inputs.fireEnabled && inputs.fireMode === 'find-critical') {
        utilizationSource = 'ULS (fire find-θ_cr mode)';
      }

      // Debug logging
      console.log(`Testing ${profileName}: ${utilizationSource} = ${(maxUtilization * 100).toFixed(1)}%`);

      // Check if this section is valid (utilization ≤ 100%)
      if (maxUtilization <= 1.0) {
        // Found the lightest section that works!
        lastValidSection = {
          profileName: profileName,
          results: results,
          maxUtilization: maxUtilization
        };
        console.log(`  ✓ Valid (≤100%) - FOUND LIGHTEST CANDIDATE!`);
        // Stop searching - this is the lightest (smallest area) that passes
        break;
      } else {
        // This section is too small (exceeds 100%)
        console.log(`  ✗ Too small (exceeds 100%) - continuing to next heavier section...`);
        // Continue testing heavier sections
      }
    }

    // Check if we found a valid section
    if (!lastValidSection) {
      return {
        success: false,
        error: 'No suitable section found in selected profile type. All sections exceed 100% utilization.',
        testedCount: testedCount,
        totalCount: totalCount
      };
    }

    // Check if all sections were valid (even the lightest works)
    const allValid = testedCount === totalCount && lastValidSection;

    return {
      success: true,
      section: lastValidSection,
      testedCount: testedCount,
      totalCount: totalCount,
      allValid: allValid,
      message: allValid
        ? 'All sections in this profile type are suitable. Lightest section selected.'
        : `Found optimal section after testing ${testedCount} of ${totalCount} profiles.`
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
