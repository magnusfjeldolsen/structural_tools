# I/O Structure Plan for Workflow-Ready Modules

## Overview
This specification defines a standardized input/output structure for all calculator modules to enable automatic workflow integration. Each module should expose its inputs and calculated values in a consistent, machine-readable format.

---

## Core Principles

1. **Separation of Concerns**: Calculation logic must be separate from UI/display logic
2. **Self-Describing**: Modules declare their own inputs and outputs with metadata
3. **Automatic Discovery**: Workflow system can introspect available I/O without manual configuration
4. **Type Safety**: All values have explicit types and units
5. **Extensibility**: Adding new inputs/outputs doesn't break existing workflows

---

## Module Structure Pattern

### File Organization
```
module_name/
  ├── index.html           # UI and form inputs
  ├── script.js            # Main calculation logic
  └── module_config.js     # I/O metadata (NEW)
```

### JavaScript Architecture

Each module should have three distinct layers:

#### 1. Configuration Layer (`module_config.js` or inline)
Declares all inputs and outputs with metadata.

```javascript
const MODULE_CONFIG = {
  module_id: "concrete_anchorage_length",
  module_name: "Concrete Anchorage Length Calculator",
  version: "1.0.0",
  standard: "EC2 Section 8.4",

  inputs: {
    // Basic parameters
    SEd: {
      label: "Design tensile force",
      symbol: "S_Ed",
      type: "number",
      unit: "kN",
      required: true,
      min: 0,
      default: 50,
      category: "loads"
    },
    phi_l: {
      label: "Bar diameter",
      symbol: "φ_l",
      type: "number",
      unit: "mm",
      required: true,
      min: 6,
      max: 40,
      default: 16,
      category: "geometry"
    },
    bond_condition: {
      label: "Bond condition",
      type: "select",
      options: ["good", "poor"],
      default: "good",
      category: "conditions"
    },
    // ... all other inputs
  },

  outputs: {
    // Primary results
    lbd: {
      label: "Design anchorage length",
      symbol: "l_bd",
      type: "number",
      unit: "mm",
      precision: 1,
      category: "primary"
    },
    // Intermediate calculations
    fbd: {
      label: "Design bond strength",
      symbol: "f_bd",
      type: "number",
      unit: "MPa",
      precision: 3,
      category: "intermediate"
    },
    lb_rqd: {
      label: "Basic required anchorage length",
      symbol: "l_b,rqd",
      type: "number",
      unit: "mm",
      precision: 2,
      category: "intermediate"
    },
    // ... all other outputs
  },

  // Optional: Define categories for grouping
  categories: {
    loads: { label: "Loading", order: 1 },
    geometry: { label: "Geometry", order: 2 },
    material: { label: "Material Properties", order: 3 },
    conditions: { label: "Conditions", order: 4 },
    primary: { label: "Primary Results", order: 1 },
    intermediate: { label: "Intermediate Calculations", order: 2 }
  }
};
```

#### 2. Calculation Layer
Pure calculation function that takes structured input and returns structured output.

```javascript
/**
 * Pure calculation function - no DOM access, no side effects
 * @param {Object} inputs - Input parameters matching MODULE_CONFIG.inputs
 * @returns {Object} - Calculated values matching MODULE_CONFIG.outputs
 */
function calculate(inputs) {
  // Validate inputs
  const validation = validateInputs(inputs);
  if (!validation.valid) {
    throw new Error(`Invalid inputs: ${validation.errors.join(', ')}`);
  }

  // Perform calculations
  const results = {};

  // Example calculations
  results.As_l = inputs.n_l * Math.PI * Math.pow(inputs.phi_l, 2) / 4;
  results.eta_1 = inputs.bond_condition === 'good' ? 1.0 : 0.7;
  results.eta_2 = inputs.phi_l <= 32 ? 1.0 : (132 - inputs.phi_l) / 100;

  // ... all calculations

  results.lbd = Math.max(alpha_total * lb_rqd, lb_min);

  // Include calculation steps for tracing (optional)
  results._steps = [];
  results._metadata = {
    timestamp: new Date().toISOString(),
    module_id: MODULE_CONFIG.module_id,
    version: MODULE_CONFIG.version
  };

  return results;
}
```

#### 3. UI/Display Layer
Handles DOM interaction and visualization.

```javascript
/**
 * Gather inputs from DOM
 * @returns {Object} - Input object matching MODULE_CONFIG.inputs
 */
function gatherInputs() {
  const inputs = {};

  for (const [key, config] of Object.entries(MODULE_CONFIG.inputs)) {
    const element = document.getElementById(key);

    if (!element) {
      if (config.required) {
        console.warn(`Required input '${key}' not found in DOM`);
      }
      inputs[key] = config.default;
      continue;
    }

    // Get value based on type
    switch (config.type) {
      case 'number':
        inputs[key] = parseFloat(element.value);
        break;
      case 'select':
        inputs[key] = element.value;
        break;
      case 'checkbox':
        inputs[key] = element.checked;
        break;
      default:
        inputs[key] = element.value;
    }
  }

  return inputs;
}

/**
 * Display results in UI
 */
function displayResults(results) {
  // Generate HTML for results display
  // Update DOM elements
  // Generate detailed report
  // etc.
}

/**
 * Main entry point called from UI
 */
function calculateAndShow() {
  try {
    const inputs = gatherInputs();
    const results = calculate(inputs);
    displayResults(results);

    // Store results for workflow access
    window.lastCalculationResults = results;
    window.lastCalculationInputs = inputs;

  } catch (error) {
    alert('Calculation failed: ' + error.message);
  }
}
```

---

## Workflow Integration API

### Module Interface
Each module exposes a standardized API:

```javascript
// Get module metadata
window.ModuleAPI = {
  getConfig: () => MODULE_CONFIG,

  getInputs: () => gatherInputs(),

  setInputs: (inputs) => {
    for (const [key, value] of Object.entries(inputs)) {
      const element = document.getElementById(key);
      if (element) element.value = value;
    }
  },

  calculate: (inputs) => calculate(inputs),

  getLastResults: () => window.lastCalculationResults || null,

  getLastInputs: () => window.lastCalculationInputs || null,

  // Get specific output value
  getOutput: (key) => {
    const results = window.lastCalculationResults;
    return results ? results[key] : null;
  },

  // Check if module has calculated results available
  hasResults: () => window.lastCalculationResults !== null
};
```

---

## Workflow System Integration

### Module Registry
The workflow system maintains a registry of available modules:

```javascript
// workflow_engine.js
class WorkflowEngine {
  constructor() {
    this.modules = new Map();
    this.connections = [];
  }

  registerModule(moduleId, moduleAPI) {
    const config = moduleAPI.getConfig();
    this.modules.set(moduleId, {
      id: moduleId,
      api: moduleAPI,
      config: config,
      inputs: config.inputs,
      outputs: config.outputs
    });
  }

  connect(sourceModuleId, sourceOutput, targetModuleId, targetInput) {
    // Validate connection
    const source = this.modules.get(sourceModuleId);
    const target = this.modules.get(targetModuleId);

    if (!source.config.outputs[sourceOutput]) {
      throw new Error(`Output '${sourceOutput}' not found in ${sourceModuleId}`);
    }

    if (!target.config.inputs[targetInput]) {
      throw new Error(`Input '${targetInput}' not found in ${targetModuleId}`);
    }

    // Check unit compatibility
    const outputUnit = source.config.outputs[sourceOutput].unit;
    const inputUnit = target.config.inputs[targetInput].unit;

    if (outputUnit !== inputUnit) {
      console.warn(`Unit mismatch: ${outputUnit} -> ${inputUnit}`);
      // Could add automatic unit conversion here
    }

    this.connections.push({
      from: { module: sourceModuleId, output: sourceOutput },
      to: { module: targetModuleId, input: targetInput }
    });
  }

  executeWorkflow(startModuleId) {
    // Topological sort and execute in order
    // Automatically propagate values through connections
  }
}
```

### Example Workflow Usage

```javascript
// Create workflow
const workflow = new WorkflowEngine();

// Register modules (could be automatic discovery)
workflow.registerModule('anchorage', window.ModuleAPI_Anchorage);
workflow.registerModule('base_plate', window.ModuleAPI_BasePlate);

// Connect modules
workflow.connect('anchorage', 'lbd', 'base_plate', 'embedment_depth');
workflow.connect('anchorage', 'fyd', 'base_plate', 'fyd');

// Execute workflow
workflow.executeWorkflow('anchorage');
```

---

## Input Validation

### Validation Function Pattern
```javascript
function validateInputs(inputs) {
  const errors = [];

  for (const [key, config] of Object.entries(MODULE_CONFIG.inputs)) {
    const value = inputs[key];

    // Required check
    if (config.required && (value === undefined || value === null || value === '')) {
      errors.push(`${config.label} is required`);
      continue;
    }

    // Type check
    if (config.type === 'number') {
      if (isNaN(value)) {
        errors.push(`${config.label} must be a number`);
        continue;
      }

      // Range check
      if (config.min !== undefined && value < config.min) {
        errors.push(`${config.label} must be >= ${config.min} ${config.unit}`);
      }
      if (config.max !== undefined && value > config.max) {
        errors.push(`${config.label} must be <= ${config.max} ${config.unit}`);
      }
    }

    // Enum check
    if (config.type === 'select' && config.options) {
      if (!config.options.includes(value)) {
        errors.push(`${config.label} must be one of: ${config.options.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}
```

---

## Migration Checklist

To convert an existing module to this structure:

- [ ] Create `MODULE_CONFIG` object with all inputs and outputs
- [ ] Extract calculation logic into pure `calculate(inputs)` function
- [ ] Create `gatherInputs()` function to collect from DOM
- [ ] Create `displayResults(results)` function for UI updates
- [ ] Implement `validateInputs(inputs)` function
- [ ] Add `window.ModuleAPI` export
- [ ] Store results in `window.lastCalculationResults`
- [ ] Update `calculateAndShow()` to use new structure
- [ ] Test standalone operation (should work exactly as before)
- [ ] Test workflow integration with another module
- [ ] Update documentation

---

## Example: Complete Module Conversion

### Before (Embedded Structure)
```javascript
function calculateAndShow() {
  // Get inputs directly from DOM
  const phi_l = parseFloat(document.getElementById('phi_l').value);
  const SEd = parseFloat(document.getElementById('SEd').value);

  // Calculate inline
  const As = Math.PI * phi_l * phi_l / 4;
  const sigma = SEd / As;

  // Display inline
  document.getElementById('result').innerHTML = `σ = ${sigma.toFixed(2)} MPa`;
}
```

### After (Workflow-Ready Structure)
```javascript
const MODULE_CONFIG = {
  module_id: "example_module",
  inputs: {
    phi_l: { label: "Bar diameter", type: "number", unit: "mm", required: true },
    SEd: { label: "Design force", type: "number", unit: "kN", required: true }
  },
  outputs: {
    As: { label: "Bar area", type: "number", unit: "mm²", precision: 2 },
    sigma: { label: "Stress", type: "number", unit: "MPa", precision: 2 }
  }
};

function calculate(inputs) {
  const results = {};
  results.As = Math.PI * inputs.phi_l * inputs.phi_l / 4;
  results.sigma = (inputs.SEd * 1000) / results.As;
  return results;
}

function gatherInputs() {
  return {
    phi_l: parseFloat(document.getElementById('phi_l').value),
    SEd: parseFloat(document.getElementById('SEd').value)
  };
}

function displayResults(results) {
  document.getElementById('result').innerHTML =
    `σ = ${results.sigma.toFixed(2)} MPa`;
}

function calculateAndShow() {
  const inputs = gatherInputs();
  const results = calculate(inputs);
  displayResults(results);
  window.lastCalculationResults = results;
}

window.ModuleAPI = {
  getConfig: () => MODULE_CONFIG,
  getInputs: () => gatherInputs(),
  setInputs: (inputs) => { /* ... */ },
  calculate: (inputs) => calculate(inputs),
  getLastResults: () => window.lastCalculationResults
};
```

---

## Benefits

1. **Automatic UI Generation**: Could generate input forms from MODULE_CONFIG
2. **Type Safety**: Validation catches errors before calculation
3. **Documentation**: Config serves as machine-readable documentation
4. **Testing**: Pure calculate() function is easy to unit test
5. **Workflow Integration**: Modules can be connected without code changes
6. **Version Control**: Track I/O changes through config versioning
7. **API Generation**: Could auto-generate REST API from config
8. **Serialization**: Easy to save/load workflow configurations

---

## Future Extensions

### Unit Conversion
```javascript
const UNIT_CONVERSIONS = {
  length: {
    mm: 1,
    cm: 10,
    m: 1000
  },
  force: {
    N: 1,
    kN: 1000,
    MN: 1000000
  }
};

function convertUnit(value, fromUnit, toUnit, dimension) {
  const factor = UNIT_CONVERSIONS[dimension][toUnit] /
                 UNIT_CONVERSIONS[dimension][fromUnit];
  return value * factor;
}
```

### Formula Tracing
```javascript
results._formulas = {
  As: "π × φ_l² / 4",
  sigma: "S_Ed / A_s"
};
```


---

## Notes

- Keep backward compatibility - modules should work standalone without workflow
- Use progressive enhancement - workflow features are optional
- Consider async calculations for heavy computations
- Store intermediate steps for debugging/reporting
- Implement circular dependency detection in workflow engine
- Consider adding `onCalculationComplete` events for reactive workflows
