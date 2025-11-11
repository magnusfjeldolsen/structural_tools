# I/O Structure Plan for Workflow-Ready Modules

## Overview
This specification defines a standardized input/output structure for all calculator modules to enable automatic workflow integration. Each module should expose its inputs and calculated values in a consistent, machine-readable format.

**Updated**: Based on successful implementation in `concrete_beam_design` module (2025-10-22)

---

## Core Principles

1. **Separation of Concerns**: Calculation logic must be separate from UI/display logic
2. **Self-Describing**: Modules declare their own inputs and outputs with metadata
3. **Automatic Discovery**: Workflow system can introspect available I/O without manual configuration
4. **Type Safety**: All values have explicit types and units
5. **Extensibility**: Adding new inputs/outputs doesn't break existing workflows
6. **Complete Traceability**: ALL intermediate calculation values must be exposed, not just final results
7. **Backward Compatibility**: Workflow features are additive; standalone operation preserved

---

## Module Structure Pattern

### File Organization
```
module_name/
  ├── index.html              # UI and form inputs
  ├── module_api.js           # Pure calculation API (separate file)
  └── (inline in index.html)  # MODULE_CONFIG + ModuleAPI (workflow layer)
```

**Recommendation**: Keep calculation API in separate file (`module_api.js`), but inline MODULE_CONFIG and ModuleAPI in `index.html` for simpler deployment.

---

## Three-Layer Architecture

### Layer 1: Calculation API (Pure Functions)

**File**: `module_api.js` or `module_name_api.js`

This layer contains ONLY pure calculation logic with NO DOM dependencies.

```javascript
/**
 * Pure calculation function - no DOM access, no side effects
 * @param {Object} inputs - Input parameters
 * @returns {Object} - Complete calculation results
 */
function calculateModuleName(inputs) {
  // Validate inputs
  const validationErrors = validateInputs(inputs);
  if (validationErrors.length > 0) {
    return {
      success: false,
      errors: validationErrors,
      message: 'Input validation failed'
    };
  }

  // Extract and evaluate inputs (handle expressions if needed)
  const param1 = evaluateExpression(inputs.geometry.param1);
  const param2 = parseFloat(inputs.material.param2);
  // ... all other inputs

  // Perform ALL calculations, storing EVERY intermediate value
  const intermediate1 = param1 * 2;
  const intermediate2 = intermediate1 + param2;
  const intermediate3 = Math.sqrt(intermediate2);
  // ... all calculations

  const finalResult = intermediate3 * factor;

  // Return structured results with COMPLETE traceability
  return {
    success: true,

    // Echo back evaluated inputs for verification
    inputs: {
      geometry: { param1, ... },
      material: { param2, ... }
    },

    // ALL intermediate calculations grouped by category
    intermediate_calculations: {
      geometry: {
        intermediate1: parseFloat(intermediate1.toFixed(3)),
        intermediate2: parseFloat(intermediate2.toFixed(3)),
        // Include components of calculations for reverse engineering
        param1_times_2: parseFloat((param1 * 2).toFixed(3))
      },
      material: {
        intermediate3: parseFloat(intermediate3.toFixed(3)),
        // Include all steps
        sqrt_of_intermediate2: parseFloat(Math.sqrt(intermediate2).toFixed(3))
      }
    },

    // Final results
    results: {
      primary_category: {
        finalResult: parseFloat(finalResult.toFixed(2)),
        // Also include governing conditions
        governing: intermediate1 < intermediate2 ? 'case_a' : 'case_b'
      }
    },

    // Status and checks
    status: {
      overall: "OK" | "FAILED" | "HIGH_UTILIZATION",
      messages: [],
      utilizations: {
        param1_util: 85.5,
        max: 85.5
      },
      checks: {
        check1_ok: true,
        check2_ok: false,
        all_ok: false
      }
    },

    // Metadata for traceability
    _metadata: {
      calculation_timestamp: new Date().toISOString(),
      module_id: 'module_name',
      module_name: 'Module Name Calculator',
      version: '1.0.0',
      standard: 'Eurocode X',
      calculation_method: 'Method description'
    }
  };
}

// Expression evaluator for formula inputs (if needed)
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

// Expose API
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateModuleName, evaluateExpression };
} else {
  window.ModuleNameAPI = { calculateModuleName, evaluateExpression };
}
```

**Key Requirements**:
- ✅ Return EVERY intermediate value, not just final results
- ✅ Include all calculation components for reverse engineering
- ✅ Group related values (geometry, material, etc.)
- ✅ Add metadata with timestamp, version, standard
- ✅ Support expression evaluation for formula inputs
- ✅ NO DOM access - must be testable in Node.js

---

### Layer 2: Module Configuration (Metadata)

**Location**: Inline in `index.html` within `<script>` tags

Declares complete metadata for ALL inputs and outputs.

```javascript
const MODULE_CONFIG = {
  module_id: "module_name",
  module_name: "Module Name Calculator",
  version: "1.0.0",
  standard: "Eurocode X Section Y.Z",
  description: "Brief description of what this module calculates",

  inputs: {
    // For each input field, define complete metadata
    param1: {
      label: "Parameter 1 description",          // Human-readable label
      symbol: "p₁",                              // Mathematical symbol
      type: "expression" | "number" | "select" | "text" | "checkbox",
      unit: "mm" | "kN" | "MPa" | "-" | "",    // Physical unit
      required: true | false,                    // Validation
      min: 0,                                    // Min value (optional)
      max: 1000,                                 // Max value (optional)
      default: 250,                              // Default value
      category: "geometry" | "material" | "loads" | "meta",
      description: "Detailed description including accepted formats"
    },

    // Example: Expression type (accepts formulas)
    beam_width: {
      label: "Beam width",
      symbol: "b",
      type: "expression",
      unit: "mm",
      required: true,
      min: 100,
      default: 250,
      category: "geometry",
      description: "Width of beam (accepts expressions like 200+50)"
    },

    // Example: Optional load (can be empty)
    applied_moment: {
      label: "Applied moment",
      symbol: "M_Ed",
      type: "expression",
      unit: "kNm",
      required: false,  // Optional - can be empty
      min: 0,
      default: 0,       // Treated as 0 if empty
      category: "loads",
      description: "Applied bending moment (leave empty for 0)"
    },

    // Example: Select dropdown
    material_grade: {
      label: "Material grade",
      symbol: "",
      type: "select",
      unit: "",
      required: true,
      options: ["C30/37", "C35/45", "C40/50"],
      default: "C35/45",
      category: "material",
      description: "Concrete grade per EC2"
    }
  },

  outputs: {
    // For each output, define metadata AND path to value in API response

    // PRIMARY RESULTS
    primary_result: {
      label: "Primary result description",
      symbol: "R_d",
      type: "number",
      unit: "kN",
      precision: 2,
      category: "primary",
      path: "results.primary_category.primary_result"  // Path in API response
    },

    utilization_percent: {
      label: "Utilization ratio",
      symbol: "η",
      type: "number",
      unit: "%",
      precision: 1,
      category: "primary",
      path: "status.utilizations.primary"
    },

    // INTERMEDIATE CALCULATIONS
    effective_depth: {
      label: "Effective depth",
      symbol: "d",
      type: "number",
      unit: "mm",
      precision: 2,
      category: "intermediate",
      path: "intermediate_calculations.geometry.d"
    },

    design_strength: {
      label: "Design material strength",
      symbol: "f_d",
      type: "number",
      unit: "MPa",
      precision: 3,
      category: "intermediate",
      path: "intermediate_calculations.material.fd"
    },

    // STATUS/CHECKS
    overall_status: {
      label: "Overall check status",
      symbol: "",
      type: "string",
      unit: "",
      precision: 0,
      category: "status",
      path: "status.overall"
    },

    all_checks_passed: {
      label: "All checks OK",
      symbol: "",
      type: "boolean",
      unit: "",
      precision: 0,
      category: "status",
      path: "status.checks.all_ok"
    }
  },

  categories: {
    // Input categories
    geometry: { label: "Geometry", order: 1 },
    material: { label: "Material Properties", order: 2 },
    loads: { label: "Applied Loads", order: 3 },
    meta: { label: "Documentation", order: 4 },

    // Output categories
    primary: { label: "Primary Results", order: 1 },
    intermediate: { label: "Intermediate Calculations", order: 2 },
    status: { label: "Status & Checks", order: 3 }
  }
};
```

**Key Requirements**:
- ✅ Define metadata for EVERY input field in the UI
- ✅ Define metadata for ALL outputs (primary + intermediate)
- ✅ Include `path` property for outputs to navigate nested API response
- ✅ Support "expression" type for formula inputs
- ✅ Support optional inputs with `required: false`
- ✅ Organize with categories

---

### Layer 3: Workflow Integration API

**Location**: Inline in `index.html` within `<script>` tags

Provides standardized interface for workflow system.

```javascript
/**
 * Gather inputs from DOM based on MODULE_CONFIG
 */
function gatherInputs() {
  const inputs = {};

  // Helper for optional fields that default to 0
  function evaluateOrZero(value) {
    const trimmed = value.trim();
    if (trimmed === '') return '0';
    return trimmed;
  }

  // Build structured input object matching API format
  inputs.geometry = {
    param1: document.getElementById('param1')?.value.trim() ||
            MODULE_CONFIG.inputs.param1.default.toString(),
    // ... all geometry inputs
  };

  inputs.loads = {
    // Handle optional loads
    applied_moment: evaluateOrZero(document.getElementById('applied_moment')?.value || '0'),
    // ... all load inputs
  };

  inputs.material = {
    param2: parseFloat(document.getElementById('param2')?.value ||
                      MODULE_CONFIG.inputs.param2.default),
    // ... all material inputs
  };

  // Optional description field
  inputs.calc_description = document.getElementById('calc_description')?.value || '';

  return inputs;
}

/**
 * Set inputs programmatically (for workflow integration)
 */
function setInputs(inputs) {
  if (inputs.geometry) {
    if (inputs.geometry.param1 !== undefined)
      document.getElementById('param1').value = inputs.geometry.param1;
    // ... set all geometry inputs
  }

  if (inputs.loads) {
    if (inputs.loads.applied_moment !== undefined)
      document.getElementById('applied_moment').value = inputs.loads.applied_moment;
    // ... set all load inputs
  }

  if (inputs.material) {
    if (inputs.material.param2 !== undefined)
      document.getElementById('param2').value = inputs.material.param2;
    // ... set all material inputs
  }

  if (inputs.calc_description !== undefined) {
    document.getElementById('calc_description').value = inputs.calc_description;
  }
}

/**
 * Get output value by path from nested results object
 */
function getOutputByPath(path, results) {
  if (!results) return undefined;
  return path.split('.').reduce((obj, key) => obj?.[key], results);
}

/**
 * Module API - Standardized interface for workflow integration
 */
window.ModuleAPI = {
  /**
   * Get module configuration metadata
   */
  getConfig: () => MODULE_CONFIG,

  /**
   * Get current input values from DOM
   */
  getInputs: () => gatherInputs(),

  /**
   * Set input values programmatically
   */
  setInputs: (inputs) => setInputs(inputs),

  /**
   * Perform calculation with given inputs
   */
  calculate: (inputs) => {
    return window.ModuleNameAPI.calculateModuleName(inputs);
  },

  /**
   * Get last calculation results
   */
  getLastResults: () => window.lastCalculationResults || null,

  /**
   * Get last calculation inputs
   */
  getLastInputs: () => window.lastCalculationInputs || null,

  /**
   * Get specific output value by key
   * Uses path from MODULE_CONFIG.outputs to navigate result structure
   */
  getOutput: (key) => {
    const results = window.lastCalculationResults;
    if (!results) return undefined;

    const outputConfig = MODULE_CONFIG.outputs[key];
    if (!outputConfig || !outputConfig.path) return undefined;

    return getOutputByPath(outputConfig.path, results);
  },

  /**
   * Check if calculation results are available
   */
  hasResults: () => window.lastCalculationResults !== null &&
                    window.lastCalculationResults !== undefined,

  /**
   * Get all outputs as flat object with keys from MODULE_CONFIG
   */
  getAllOutputs: () => {
    const results = window.lastCalculationResults;
    if (!results) return null;

    const outputs = {};
    for (const [key, config] of Object.entries(MODULE_CONFIG.outputs)) {
      if (config.path) {
        outputs[key] = getOutputByPath(config.path, results);
      }
    }
    return outputs;
  }
};

// Log API availability on page load
console.log('Module Name - Workflow API ready');
console.log('Access via: window.ModuleAPI');
console.log('Configuration:', MODULE_CONFIG);
```

**Key Requirements**:
- ✅ `gatherInputs()` collects from DOM with fallback to defaults
- ✅ `setInputs()` enables programmatic input from workflows
- ✅ `getOutputByPath()` navigates nested API response using dot notation
- ✅ `window.ModuleAPI` exposes standardized interface
- ✅ `getAllOutputs()` bonus method returns flat object of all outputs
- ✅ Console logging for debugging

---

### Layer 4: UI Integration

Update existing `calculateAndShow()` to store results:

```javascript
function calculateAndShow() {
  // Helper function for optional fields
  function evaluateOrZero(value) {
    const trimmed = value.trim();
    if (trimmed === '') return '0';
    return trimmed;
  }

  // Collect inputs (can use gatherInputs() or inline)
  const inputs = {
    geometry: {
      param1: document.getElementById('param1').value.trim(),
      // ... all inputs
    },
    loads: {
      applied_moment: evaluateOrZero(document.getElementById('applied_moment').value),
      // ... all loads
    },
    material: {
      param2: parseFloat(document.getElementById('param2').value),
      // ... all material
    }
  };

  // Call API
  const result = window.ModuleNameAPI.calculateModuleName(inputs);

  // IMPORTANT: Store for workflow access
  window.lastCalculationResults = result;
  window.lastCalculationInputs = inputs;

  // Validate result
  if (!result.success) {
    alert('Calculation failed: ' + (result.errors ? result.errors.join('\n') : result.message));
    return;
  }

  // Display results in UI (existing code continues as normal)
  // ... display code ...
}
```

---

## Complete Traceability Requirement

**CRITICAL**: The API must return EVERY intermediate calculation value, not just final results.

### Why This Matters
1. **Reverse Engineering**: Users can verify calculations by working backwards
2. **Debugging**: Easy to identify where values diverge from expected
3. **Workflow Integration**: Downstream modules may need intermediate values
4. **Validation**: Can compare against hand calculations at any step
5. **Transparency**: Complete audit trail of calculation process

### Example: Complete vs Incomplete

❌ **INCOMPLETE** (only final results):
```javascript
return {
  success: true,
  results: {
    MRd: 125.5  // How was this calculated?
  }
};
```

✅ **COMPLETE** (all intermediate values):
```javascript
return {
  success: true,
  inputs: {
    geometry: { b: 250, h: 500, c: 25 },
    material: { fck: 35, fyk: 500, gamma_c: 1.5, gamma_s: 1.15 }
  },
  intermediate_calculations: {
    material: {
      fcd: 19.833,
      alpha_cc_times_fck: 29.75,  // Components of fcd calculation
      fyd: 434.783,
      fyk_over_gamma_s: 434.783   // Components of fyd calculation
    },
    geometry: {
      d: 465,
      h_minus_c: 475,    // Component of d calculation
      phi_l_over_2: 10,  // Component of d calculation
      Asl: 628.32,
      single_bar_area: 314.16,    // Component of Asl calculation
      z: 441.75,
      z_95d: 441.75,     // Alternative z calculation
      z_bal: 456.23      // Alternative z calculation
    },
    moment: {
      MRd_c: 135.2,
      MRd_c_numerator: 135200000,  // Numerator before unit conversion
      b_times_d_squared: 54112500,  // Intermediate product
      MRd_s: 125.5,
      MRd_s_numerator: 125500000,
      Asl_times_fyd: 273111.66
    }
  },
  results: {
    moment_capacity: {
      MRd_c: 135.2,
      MRd_s: 125.5,
      MRd: 125.5,  // min(MRd_c, MRd_s)
      governing: 'steel'  // Which governs
    }
  },
  _metadata: {
    calculation_timestamp: "2025-10-22T14:30:00.000Z",
    module_id: "concrete_beam_design",
    version: "1.1.0"
  }
};
```

---

## Input Type: "expression"

For inputs that accept mathematical formulas:

### UI Implementation
```html
<input type="text" id="beam_width" value="250"
       placeholder="Example: 200+50"
       onblur="updateCalculatedValue('beam_width')"
       class="...">
<div id="beam_width_calc" class="hidden text-cyan-400 text-xs"></div>
```

### Live Calculation Display
```javascript
function updateCalculatedValue(fieldId) {
  const input = document.getElementById(fieldId);
  const calcDisplay = document.getElementById(fieldId + '_calc');
  const value = input.value.trim();

  // Check if value contains operators (is an expression)
  if (value && /[+\-*/^()]/.test(value)) {
    try {
      const result = window.ModuleNameAPI.evaluateExpression(value);
      calcDisplay.textContent = `= ${result.toFixed(2)}`;
      calcDisplay.classList.remove('hidden');
    } catch (error) {
      calcDisplay.textContent = 'Invalid expression';
      calcDisplay.classList.remove('hidden');
      // Optionally show error state
    }
  } else {
    // Hide if simple number or empty
    calcDisplay.classList.add('hidden');
  }
}
```

### Benefits
- Users see evaluated result immediately (e.g., `200+50` → `= 250.00`)
- Supports formulas like `20*5^2/8` for calculated loads
- Error feedback for invalid expressions

---

## Usage Examples

### Standalone Module Usage
```javascript
// User clicks Calculate button
calculateAndShow();

// Check console
console.log(window.ModuleAPI.getConfig());
console.log(window.ModuleAPI.getLastResults());
```

### Workflow Integration
```javascript
// Module A calculates beam capacity
moduleA.ModuleAPI.setInputs({
  geometry: { b: 300, h: 600 },
  loads: { MEd: 50, VEd: 200 }
});

const inputsA = moduleA.ModuleAPI.getInputs();
const resultA = moduleA.ModuleAPI.calculate(inputsA);

// Pass results to Module B (foundation design)
const beamDepth = moduleA.ModuleAPI.getOutput('effective_depth');
const beamMoment = moduleA.ModuleAPI.getOutput('primary_result');

moduleB.ModuleAPI.setInputs({
  loads: {
    beam_reaction: beamMoment,
    beam_depth: beamDepth
  }
});

moduleB.ModuleAPI.calculate(moduleB.ModuleAPI.getInputs());
```

### Get All Outputs
```javascript
// After calculation
const allOutputs = window.ModuleAPI.getAllOutputs();
console.log(allOutputs);
// {
//   primary_result: 125.5,
//   effective_depth: 465,
//   design_strength: 19.833,
//   utilization_percent: 85.2,
//   overall_status: "OK",
//   all_checks_passed: true,
//   ...
// }
```

---

## Migration Checklist

To convert an existing module to this structure:

### Phase 1: Calculation API
- [ ] Create separate API file (`module_api.js`)
- [ ] Extract calculation logic into pure `calculateModuleName(inputs)` function
- [ ] Add `evaluateExpression()` if supporting formula inputs
- [ ] Return EVERY intermediate value in structured format
- [ ] Add metadata (`_metadata` object)
- [ ] Add validation function
- [ ] Test API standalone (Node.js or console)

### Phase 2: Module Configuration
- [ ] Create `MODULE_CONFIG` object with all input metadata
- [ ] Add metadata for ALL outputs (primary + intermediate)
- [ ] Include `path` property for each output
- [ ] Define categories for grouping
- [ ] Support "expression" type for formula inputs
- [ ] Support optional inputs with `required: false`

### Phase 3: Workflow Integration
- [ ] Implement `gatherInputs()` function
- [ ] Implement `setInputs()` function
- [ ] Implement `getOutputByPath()` helper
- [ ] Create `window.ModuleAPI` interface with 8+ methods
- [ ] Add console logging for debugging

### Phase 4: UI Integration
- [ ] Update `calculateAndShow()` to store results in `window.lastCalculationResults`
- [ ] Store inputs in `window.lastCalculationInputs`
- [ ] Add live calculation display for expression inputs (optional)
- [ ] Test standalone operation (verify no regression)

### Phase 5: Testing & Documentation
- [ ] Test all ModuleAPI methods in console
- [ ] Verify `getOutput()` returns correct values
- [ ] Test `setInputs()` and `getInputs()` round-trip
- [ ] Verify backward compatibility
- [ ] Test workflow integration with another module
- [ ] Update module documentation

---

## Reference Implementation

**See**: `concrete_beam_design` module for complete reference implementation

Files to review:
- `concrete_beam_design/concrete_beam_api.js` - Pure calculation API with complete traceability
- `concrete_beam_design/index.html` (lines 996-1560) - MODULE_CONFIG + ModuleAPI

Key features demonstrated:
- ✅ 16 inputs with complete metadata
- ✅ 17 outputs with path navigation
- ✅ 50+ intermediate values returned by API
- ✅ Expression type support (b, h, c, MEd, VEd)
- ✅ Optional inputs (MEd, VEd default to 0)
- ✅ Live calculation display for expressions
- ✅ Complete metadata and traceability
- ✅ 9 ModuleAPI methods including bonus `getAllOutputs()`
- ✅ 100% backward compatible

---

## Benefits

1. **Complete Traceability**: Every calculation can be reverse engineered
2. **Self-Documenting**: MODULE_CONFIG serves as machine-readable documentation
3. **Type Safety**: Validation catches errors before calculation
4. **Workflow Integration**: Modules connect without code changes
5. **Testing**: Pure calculate() function is easy to unit test
6. **Version Control**: Track I/O changes through config versioning
7. **Automatic Discovery**: Workflows can introspect available I/O
8. **Backward Compatible**: Standalone operation preserved
9. **Extensibility**: Easy to add inputs/outputs without breaking workflows
10. **Formula Support**: Expression inputs enable calculated values

---

## Future Extensions

### Automatic UI Generation
```javascript
// Generate input form from MODULE_CONFIG
function generateInputForm(config) {
  let html = '';
  for (const [key, inputConfig] of Object.entries(config.inputs)) {
    html += `
      <label>${inputConfig.label} (${inputConfig.unit})</label>
      <input type="${inputConfig.type === 'expression' ? 'text' : inputConfig.type}"
             id="${key}"
             value="${inputConfig.default}"
             ${inputConfig.required ? 'required' : ''}>
    `;
  }
  return html;
}
```

### Unit Conversion
```javascript
const UNIT_CONVERSIONS = {
  length: { mm: 1, cm: 10, m: 1000 },
  force: { N: 1, kN: 1000, MN: 1000000 },
  stress: { Pa: 1, kPa: 1000, MPa: 1000000 }
};

function convertUnit(value, fromUnit, toUnit, dimension) {
  const factor = UNIT_CONVERSIONS[dimension][toUnit] /
                 UNIT_CONVERSIONS[dimension][fromUnit];
  return value * factor;
}
```

### Formula Tracing
```javascript
_metadata: {
  formulas: {
    fcd: "α_cc × f_ck / γ_c",
    MRd: "min(M_Rd,c, M_Rd,s)",
    d: "h - c - φ_l/2"
  }
}
```

---

## Notes

- **Backward Compatibility**: Modules MUST work standalone without workflow system
- **Progressive Enhancement**: Workflow features are optional additive layer
- **Expression Inputs**: Use `type: "expression"` and provide live calculation feedback
- **Complete Traceability**: Return ALL intermediate values, not just final results
- **Path Navigation**: Use dot notation in `path` property to navigate nested results
- **Console Logging**: Add helpful logs for debugging workflow integration
- **Testing**: Test both standalone and workflow modes thoroughly
- **Documentation**: MODULE_CONFIG serves as living documentation

---

**Last Updated**: 2025-10-22
**Reference Implementation**: `concrete_beam_design` module
**Status**: ✅ Production-ready pattern
