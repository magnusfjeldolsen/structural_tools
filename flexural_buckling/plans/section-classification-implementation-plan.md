# Implementation Plan: Section Classification and Class 4 Properties for Flexural Buckling Module

**Date Created**: 2026-02-27
**Status**: Planning Phase
**Scope**: Pure compression only (symmetric sections)
**Future Work**: Bending classification, combined loading

---

## Executive Summary

This plan outlines the implementation of **EN 1993-1-1 Section Classification** and **Class 4 effective properties calculation** for steel sections under **pure axial compression**. The system will enable users to:

1. Automatically classify sections as Class 1, 2, 3, or 4 based on EC3-1-1 Table 5.2
2. Calculate effective (reduced) properties for Class 4 sections per EC3-1-5
3. Choose whether to avoid Class 4 sections or include them with effective properties

---

## 1. Background & Theory

### 1.1 Section Classification Concept

Steel sections are classified into 4 classes based on **local buckling susceptibility**:

- **Class 1**: Plastic - can form plastic hinge with rotation capacity
- **Class 2**: Compact - can reach plastic moment but limited rotation
- **Class 3**: Semi-compact - can reach yield stress but buckles before plastification
- **Class 4**: Slender - **local buckling occurs before yield stress**

### 1.2 Key Parameter: Epsilon (ε)

The classification limits depend on **ε = √(235/fy)**:
- For S235: ε = 1.00
- For S355: ε = 0.81
- For S460: ε = 0.71

**Critical insight**: A section's class depends on **fy**. Higher yield strength → lower ε → stricter limits → more likely to be Class 4.

### 1.3 Classification Criteria (Pure Compression)

From EC3-1-1 Table 5.2:

#### **Internal Elements (webs, internal flanges)**
- Class 1: c/t ≤ 33ε
- Class 2: c/t ≤ 38ε
- Class 3: c/t ≤ 42ε
- Class 4: c/t > 42ε

#### **Outstand Elements (flanges of I/H sections)**
- Class 1: c/t ≤ 9ε
- Class 2: c/t ≤ 10ε
- Class 3: c/t ≤ 14ε
- Class 4: c/t > 14ε

#### **Tubular Sections (CHS/RHS)**
- CHS: d/t ≤ 50ε² (Class 1), ≤ 70ε² (Class 2), ≤ 90ε² (Class 3)
- RHS: c/t ≤ 33ε (Class 1), ≤ 38ε (Class 2), ≤ 42ε (Class 3)

### 1.4 Class 4 Effective Properties

When a section is Class 4, we must use **effective (reduced) properties**:
- Effective area: **A_eff < A_gross**
- Effective moments of inertia: **I_eff < I_gross**
- **Neutral axis may shift** (for bending, but not for pure compression in symmetric sections)

Calculation method: **EN 1993-1-5 Section 4.4** - effective width method.

---

## 2. Database Enhancement: Subplate Metadata

### 2.1 Plate Element Decomposition

Each cross-section must be decomposed into **plate elements** (subplates):

**Example: HEA Section**
```
┌─────────────┐  ← Top flange (outstand element × 2)
│             │
├─┐         ┌─┤
│ │         │ │  ← Web (internal element)
│ │         │ │
├─┘         └─┤
│             │
└─────────────┘  ← Bottom flange (outstand element × 2)
```

Subplates:
1. **Flange tip (left)** - outstand
2. **Flange tip (right)** - outstand
3. **Web** - internal
4. *Repeat for bottom flange if asymmetric*

**Example: RHS Section**
```
┌─────────────┐
│             │  ← Top flange (internal element)
│ │         │ │
│ │         │ │  ← Webs (internal elements × 2)
│ │         │ │
│             │  ← Bottom flange (internal element)
└─────────────┘
```

Subplates:
1. **Top flange** - internal
2. **Web (left)** - internal
3. **Web (right)** - internal
4. **Bottom flange** - internal

### 2.2 Metadata Structure

Add to each profile in database JSON:

```json
{
  "profile": "HEA 200",
  "h": 190,
  "b": 200,
  "tw": 6.5,
  "tf": 10,
  "r": 18,
  // ... existing properties ...

  "classification_data": {
    "subplates": [
      {
        "id": "flange_outstand_top",
        "type": "outstand",
        "stress_type": "compression",
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf",
        "position": "flange"
      },
      {
        "id": "web_internal",
        "type": "internal",
        "stress_type": "compression",
        "c_formula": "(h - 2*tf - 2*r)",
        "t_formula": "tw",
        "position": "web"
      }
    ],
    "symmetric": true,
    "compression_classification": {
      "governing_element": "auto"  // or specify "flange" / "web"
    }
  }
}
```

**Formula strings** allow dynamic calculation based on actual section dimensions.

### 2.3 Profile Type Templates

Create templates for each profile family:

#### **I/H Sections (HEA, HEB, HEM, IPE)**
- 2 outstand flanges (top/bottom are symmetric)
- 1 internal web

#### **RHS/SHS (HRHS, HSHS, HCHS)**
- 4 internal elements (2 flanges + 2 webs)
- Corner radius affects effective width

#### **CHS (CCHS, HCHS)**
- 1 circular element (special formula: d/t)
- No c/t calculation needed

#### **Cold-formed vs Hot-formed**
- HRHS/CRHS: use hot-formed radii
- CSHS: use cold-formed radii (tighter limits)

---

## 3. Classification Engine Implementation

### 3.1 Core Classification Function

```javascript
/**
 * Classify cross-section per EC3-1-1 Table 5.2 (pure compression)
 * @param {Object} section - Section properties from database
 * @param {number} fy - Yield strength in MPa
 * @returns {Object} Classification result
 */
function classifySection(section, fy) {
  const epsilon = Math.sqrt(235 / fy);

  // Get subplates from section metadata
  const subplates = section.classification_data?.subplates || [];

  if (subplates.length === 0) {
    return {
      class: 3, // Default assumption
      governing_element: null,
      message: 'Classification data not available - assuming Class 3'
    };
  }

  let worstClass = 1;
  let governingElement = null;
  const elementResults = [];

  // Evaluate each subplate
  for (const plate of subplates) {
    const c = evaluateFormula(plate.c_formula, section);
    const t = evaluateFormula(plate.t_formula, section);
    const slenderness = c / t;

    // Determine class based on type and slenderness
    const plateClass = getPlateClass(plate.type, slenderness, epsilon, section);

    elementResults.push({
      id: plate.id,
      type: plate.type,
      c: c,
      t: t,
      slenderness: slenderness,
      class: plateClass,
      limit_class1: getLimit(plate.type, 1, epsilon),
      limit_class2: getLimit(plate.type, 2, epsilon),
      limit_class3: getLimit(plate.type, 3, epsilon)
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
 * Get classification limits based on element type
 */
function getLimit(elementType, targetClass, epsilon) {
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
function getPlateClass(elementType, slenderness, epsilon, section) {
  // Handle circular sections separately
  if (elementType === 'circular') {
    const d_over_t = slenderness; // Already d/t for circular
    if (d_over_t <= 50 * epsilon * epsilon) return 1;
    if (d_over_t <= 70 * epsilon * epsilon) return 2;
    if (d_over_t <= 90 * epsilon * epsilon) return 3;
    return 4;
  }

  // Internal and outstand elements
  const limit1 = getLimit(elementType, 1, epsilon);
  const limit2 = getLimit(elementType, 2, epsilon);
  const limit3 = getLimit(elementType, 3, epsilon);

  if (slenderness <= limit1) return 1;
  if (slenderness <= limit2) return 2;
  if (slenderness <= limit3) return 3;
  return 4;
}

/**
 * Evaluate formula string with section dimensions
 */
function evaluateFormula(formula, section) {
  // Replace section properties in formula
  let expression = formula;
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
```

### 3.2 Integration with Buckling Calculation

Update `calculateBucklingResistance()`:

```javascript
function calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, temperature_C, gamma_M1, allowClass4 = false) {
  // ... existing code ...

  // Classify section
  const classification = classifySection(section, fy_MPa);

  // Determine effective properties
  let effectiveSection = section;
  if (classification.is_class4) {
    if (!allowClass4) {
      return {
        success: false,
        error: 'Section is Class 4 (slender). Enable Class 4 sections or choose a different profile.',
        classification: classification
      };
    }

    // Calculate effective properties
    effectiveSection = calculateClass4EffectiveProperties(section, classification, fy_MPa);
  }

  // Use effective properties for buckling calculations
  const slenderness_y = calculateSlenderness(Ly_m, effectiveSection.iy, fy_theta, E_theta);
  const slenderness_z = calculateSlenderness(Lz_m, effectiveSection.iz, fy_theta, E_theta);

  // ... continue with buckling calculations using effectiveSection ...

  return {
    // ... existing results ...
    classification: classification,
    effective_properties: classification.is_class4 ? effectiveSection : null
  };
}
```

---

## 4. Class 4 Effective Properties Calculation

### 4.1 Effective Width Method (EN 1993-1-5)

For Class 4 sections, calculate **effective width** for each slender plate:

```javascript
/**
 * Calculate Class 4 effective properties per EN 1993-1-5
 * @param {Object} section - Gross section properties
 * @param {Object} classification - Classification results
 * @param {number} fy - Yield strength
 * @returns {Object} Effective section properties
 */
function calculateClass4EffectiveProperties(section, classification, fy) {
  const epsilon = classification.epsilon;

  let A_eff = section.area;  // Start with gross area
  let removed_area = 0;

  const plateReductions = [];

  // For pure compression, iterate through Class 4 elements
  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const c = element.c;
    const t = element.t;
    const lambda_p = element.slenderness;

    // Calculate effective width factor ρ per EN 1993-1-5 Eq. 4.2
    const lambda_p_bar = lambda_p / (element.type === 'internal' ? 42 * epsilon : 14 * epsilon);
    const rho = (lambda_p_bar - 0.055 * (3 + 1)) / (lambda_p_bar * lambda_p_bar);
    const rho_clamped = Math.min(Math.max(rho, 0), 1);

    // Effective width
    const c_eff = rho_clamped * c;
    const area_reduction = (c - c_eff) * t;

    removed_area += area_reduction;

    plateReductions.push({
      element: element.id,
      c_gross: c,
      c_eff: c_eff,
      rho: rho_clamped,
      area_reduction: area_reduction
    });
  }

  A_eff = section.area - removed_area;

  // For symmetric sections in pure compression, neutral axis doesn't shift
  // So we can approximate I_eff by scaling I_gross proportionally
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
    area_reduction_percent: (removed_area / section.area) * 100,
    plate_reductions: plateReductions
  };
}
```

**Note**: For **pure compression in symmetric sections**, the neutral axis doesn't shift, simplifying the calculation. For bending (future implementation), we'll need to account for neutral axis shift.

---

## 5. User Interface Updates

### 5.1 Class 4 Handling Options

Add control in the form (after material properties section):

```html
<div class="bg-gray-800 rounded-lg p-3">
  <h2 class="text-base font-semibold text-white mb-1.5">Section Classification</h2>
  <div class="flex items-center gap-4">
    <label class="flex items-center cursor-pointer">
      <input type="radio" name="class4-handling" value="avoid" checked
             class="mr-2 w-4 h-4 text-cyan-600">
      <span class="text-gray-300 text-sm">Avoid Class 4 sections (safer)</span>
    </label>
    <label class="flex items-center cursor-pointer">
      <input type="radio" name="class4-handling" value="allow"
             class="mr-2 w-4 h-4 text-cyan-600">
      <span class="text-gray-300 text-sm">Allow Class 4 with effective properties</span>
    </label>
  </div>
  <p class="text-xs text-gray-400 mt-1">
    Class 4 sections may experience local buckling. If allowed, effective (reduced) properties are used per EN 1993-1-5.
  </p>
</div>
```

### 5.2 Classification Results Display

Update results section to show classification:

```html
<div id="classification-results" class="bg-gray-800 rounded-lg p-4 mb-4">
  <h3 class="text-lg font-semibold text-white mb-2">Section Classification</h3>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="bg-gray-700 rounded p-3">
      <p class="text-xs text-gray-400 mb-1">Overall Class</p>
      <p class="text-2xl font-mono font-bold" id="section-class">-</p>
    </div>
    <div class="bg-gray-700 rounded p-3">
      <p class="text-xs text-gray-400 mb-1">ε = √(235/fy)</p>
      <p class="text-2xl font-mono text-white" id="epsilon-value">-</p>
    </div>
    <div class="bg-gray-700 rounded p-3">
      <p class="text-xs text-gray-400 mb-1">Governing Element</p>
      <p class="text-sm font-mono text-white" id="governing-element">-</p>
    </div>
    <div class="bg-gray-700 rounded p-3">
      <p class="text-xs text-gray-400 mb-1">Effective Area</p>
      <p class="text-sm font-mono text-white" id="effective-area">-</p>
    </div>
  </div>

  <!-- Detailed element classification (collapsible) -->
  <div class="mt-3">
    <button onclick="toggleClassificationDetails()"
            class="text-sm text-cyan-400 hover:text-cyan-300">
      ▼ Show element classification details
    </button>
    <div id="classification-details" class="hidden mt-2">
      <table class="w-full text-xs">
        <thead class="bg-gray-700">
          <tr>
            <th class="p-2 text-left">Element</th>
            <th class="p-2 text-right">c (mm)</th>
            <th class="p-2 text-right">t (mm)</th>
            <th class="p-2 text-right">c/t</th>
            <th class="p-2 text-right">Limit (Class 3)</th>
            <th class="p-2 text-center">Class</th>
          </tr>
        </thead>
        <tbody id="classification-table-body">
          <!-- Populated dynamically -->
        </tbody>
      </table>
    </div>
  </div>
</div>
```

### 5.3 "Find Lightest Section" Enhancement

Update the search to respect Class 4 preference:

```javascript
function findLightestSection(inputs, progressCallback) {
  const allowClass4 = document.querySelector('input[name="class4-handling"]:checked')?.value === 'allow';

  for (const profileName of sortedProfiles) {
    const testInputs = { ...inputs, profileName, allowClass4 };
    const results = calculateBuckling(testInputs);

    if (!results.success) {
      // If Class 4 is not allowed and section is Class 4, skip
      if (results.classification?.is_class4 && !allowClass4) {
        continue; // Try next section
      }
    }

    // ... rest of logic ...
  }
}
```

---

## 6. Database Updates

### 6.1 Profile Type Coverage

Create `classification_metadata.json` templates for each profile family:

**File**: `steel_cross_section_database/classification_templates/i_section_template.json`
```json
{
  "profile_family": "I_sections",
  "applies_to": ["hea", "heb", "hem", "ipe"],
  "subplates": [
    {
      "id": "flange_outstand",
      "type": "outstand",
      "c_formula": "(b/2 - tw/2 - r)",
      "t_formula": "tf",
      "description": "Flange tip in compression"
    },
    {
      "id": "web_internal",
      "type": "internal",
      "c_formula": "(h - 2*tf - 2*r)",
      "t_formula": "tw",
      "description": "Web in compression"
    }
  ]
}
```

**File**: `steel_cross_section_database/classification_templates/rhs_template.json`
```json
{
  "profile_family": "RHS_sections",
  "applies_to": ["hrhs", "hshs", "crhs", "cshs"],
  "subplates": [
    {
      "id": "flange_internal",
      "type": "internal",
      "c_formula": "(b - 3*t)",
      "t_formula": "t",
      "description": "Flange (internal element)"
    },
    {
      "id": "web_internal",
      "type": "internal",
      "c_formula": "(h - 3*t)",
      "t_formula": "t",
      "description": "Web (internal element)"
    }
  ]
}
```

**File**: `steel_cross_section_database/classification_templates/chs_template.json`
```json
{
  "profile_family": "CHS_sections",
  "applies_to": ["hchs", "cchs"],
  "subplates": [
    {
      "id": "circular_tube",
      "type": "circular",
      "c_formula": "D",
      "t_formula": "t",
      "description": "Circular tube d/t ratio"
    }
  ]
}
```

### 6.2 Script to Apply Templates

Create a Node.js script to inject classification metadata into existing JSON files:

**File**: `steel_cross_section_database/scripts/add_classification_metadata.js`
```javascript
const fs = require('fs');
const path = require('path');

const templates = {
  'i_section': require('../classification_templates/i_section_template.json'),
  'rhs': require('../classification_templates/rhs_template.json'),
  'chs': require('../classification_templates/chs_template.json')
};

const profileMapping = {
  'hea': 'i_section',
  'heb': 'i_section',
  'hem': 'i_section',
  'ipe': 'i_section',
  'hrhs': 'rhs',
  'hshs': 'rhs',
  'hchs': 'chs',
  'crhs': 'rhs',
  'cshs': 'rhs',
  'cchs': 'chs'
};

// Process each profile type
for (const [profileType, templateKey] of Object.entries(profileMapping)) {
  const filePath = path.join(__dirname, '..', `${profileType}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Add classification_template reference to metadata
  data.metadata.classification_template = templateKey;

  // Optionally add to each profile (or reference template globally)
  // For now, we'll reference template globally to avoid duplication

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Updated ${profileType}.json`);
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

Create test cases for classification engine:

**Test 1: HEA 200 with S355**
```javascript
const section = getSectionProperties('hea', 'HEA 200');
const classification = classifySection(section, 355);

assert(classification.epsilon === 0.81);
assert(classification.class === 1 || classification.class === 2); // Expected: likely Class 1 or 2
```

**Test 2: Slender RHS with S460**
```javascript
const section = getSectionProperties('hrhs', 'HRHS 200x100 / 4');
const classification = classifySection(section, 460);

// With fy=460, epsilon=0.71, limits are tighter
// This section may become Class 4
assert(classification.is_class4 === true || classification.class === 3);
```

**Test 3: CHS Classification**
```javascript
const section = getSectionProperties('cchs', 'CCHS 88.9 / 2.6');
const classification = classifySection(section, 355);

const d_over_t = section.D / section.t; // 88.9 / 2.6 = 34.2
const limit_class3 = 90 * (0.81 ** 2); // = 59.0
assert(d_over_t < limit_class3);
assert(classification.class <= 3);
```

### 7.2 Integration Tests

**Test 4: Class 4 Effective Properties**
```javascript
const section = getSectionProperties('hrhs', 'HRHS 300x200 / 5'); // Assume this is Class 4 with S460
const classification = classifySection(section, 460);
assert(classification.is_class4 === true);

const effective = calculateClass4EffectiveProperties(section, classification, 460);
assert(effective.area < section.area); // Reduced area
assert(effective.is_effective === true);
assert(effective.area_reduction_percent > 0);
```

**Test 5: Buckling Calculation with Class 4**
```javascript
const inputs = {
  profileType: 'hrhs',
  profileName: 'HRHS 300x200 / 5',
  Ly: 3.5,
  Lz: 3.5,
  fy: 460,
  gamma_M1: 1.05,
  NEd_ULS: 1000,
  allowClass4: true
};

const results = calculateBuckling(inputs);
assert(results.success === true);
assert(results.classification.is_class4 === true);
assert(results.effective_properties !== null);
assert(results.ulsResults.Nb_Rd_kN < calculateBuckling({...inputs, fy: 235}).ulsResults.Nb_Rd_kN);
// Lower fy gives higher buckling capacity (less slender)
```

### 7.3 Validation Cases

**Manual calculation benchmarks**:

1. **HEA 200 / S355 / L=3.5m**
   - Flange: c/t = (200/2 - 6.5/2 - 18) / 10 = 6.93
   - Limit Class 3 (outstand): 14 × 0.81 = 11.34 → **Class 1** ✓
   - Web: c/t = (190 - 2×10 - 2×18) / 6.5 = 20.6
   - Limit Class 3 (internal): 42 × 0.81 = 34.0 → **Class 1** ✓
   - **Overall: Class 1**

2. **HRHS 200x100 / 4 / S460**
   - Flange: c/t = (100 - 3×4) / 4 = 22
   - Limit Class 3: 42 × 0.71 = 29.8 → **Class 3** ✓
   - Web: c/t = (200 - 3×4) / 4 = 47
   - Limit Class 3: 42 × 0.71 = 29.8 → **Class 4** ✗
   - **Overall: Class 4** (web governs)

3. **CCHS 88.9 / 2.6 / S355**
   - d/t = 88.9 / 2.6 = 34.2
   - Limit Class 3: 90 × (0.81)² = 59.0 → **Class 1** ✓

### 7.4 User Acceptance Testing

Create test checklist:
- [ ] Classification displayed correctly for HEA/HEB/HEM/IPE
- [ ] Classification displayed correctly for RHS/SHS
- [ ] Classification displayed correctly for CHS
- [ ] Class 4 warning shown when section is slender
- [ ] Effective properties calculated and displayed
- [ ] "Avoid Class 4" option prevents Class 4 sections
- [ ] "Allow Class 4" option enables effective properties
- [ ] "Find Lightest Section" respects Class 4 preference
- [ ] Detailed report includes classification section
- [ ] Print formatting preserves classification table

---

## 8. Implementation Phases

### **Phase 1: Classification Engine (Week 1)**
1. Create classification template JSON files
2. Implement `classifySection()` function
3. Implement formula evaluation
4. Add unit tests for classification
5. Validate against manual calculations

### **Phase 2: Database Updates (Week 1-2)**
1. Create classification metadata for each profile family
2. Run script to inject metadata into JSON files
3. Verify all profiles have classification data
4. Test with sample sections

### **Phase 3: Class 4 Effective Properties (Week 2)**
1. Implement `calculateClass4EffectiveProperties()`
2. Add integration tests
3. Validate against EC3-1-5 examples
4. Document assumptions (pure compression, symmetric sections)

### **Phase 4: UI Integration (Week 2-3)**
1. Add Class 4 handling radio buttons
2. Add classification results display section
3. Update `calculateBuckling()` to use classification
4. Add detailed element classification table
5. Update "Find Lightest Section" logic

### **Phase 5: Testing & Validation (Week 3)**
1. Run all unit and integration tests
2. Perform manual validation cases
3. User acceptance testing
4. Fix bugs and edge cases
5. Documentation updates

### **Phase 6: Future Enhancements (Later)**
1. Add bending moment classification (Table 5.2 sheets 1-2)
2. Implement neutral axis shift for Class 4 in bending
3. Add combined compression + bending classification
4. Optimize effective properties calculation with FEA
5. Add visualization of effective vs gross section

---

## 9. Key Decisions & Assumptions

### 9.1 Decisions
1. **Pure compression only** for initial implementation (simpler, no NA shift)
2. **Symmetric sections only** (NA shift not needed for compression)
3. **Class 4 toggle** gives user control over safety vs optimization
4. **Template-based metadata** avoids duplicating formulas in every profile
5. **Effective area approximation** using area ratio for moments of inertia (conservative)

### 9.2 Assumptions
1. Corner radii (`r`) are accounted for in `c` calculation
2. For RHS, effective width factor `ρ` uses internal element formula
3. For CHS, classification uses `d/t` ratio directly
4. Effective properties assume no residual stresses beyond material model
5. Fire design uses effective properties at ambient temperature classification

### 9.3 Limitations (to document)
1. Bending classification not yet implemented → always check compression limits
2. Neutral axis shift not calculated → Class 4 bending will need future update
3. Combined loading (N + M) classification not implemented
4. Shear buckling (web panels) not included
5. Longitudinal stiffeners not considered

---

## 10. Success Criteria

Implementation is complete when:

✅ All profile types have classification metadata
✅ Classification engine correctly classifies test cases
✅ Class 4 effective properties match EC3-1-5 examples
✅ UI displays classification results clearly
✅ User can choose to avoid or allow Class 4 sections
✅ "Find Lightest Section" respects Class 4 preference
✅ All unit and integration tests pass
✅ Manual validation cases verified
✅ Documentation updated with examples
✅ No regressions in existing functionality

---

## 11. Documentation Requirements

Create the following documentation:

1. **User Guide**: How to interpret section classification
2. **Technical Reference**: EC3-1-1 Table 5.2 implementation notes
3. **API Documentation**: Classification functions and return values
4. **Testing Report**: Validation cases and results
5. **Limitations Document**: What's not covered (bending, combined loading)

---

## 12. Future Work (Post-Implementation)

1. **Bending classification** (EC3-1-1 Table 5.2 sheets 1-2)
2. **Combined N+M classification** (more complex stress distribution)
3. **Neutral axis shift calculation** for Class 4 in bending
4. **Web shear buckling** (EN 1993-1-5 Section 5)
5. **Interactive visualization** showing effective vs gross section
6. **Critical fy finder** - find the maximum fy before section becomes Class 4
7. **Class optimization** - suggest modifications to improve class

---

## 13. Reference Documents

- **EN 1993-1-1**: Eurocode 3: Design of steel structures - Part 1-1: General rules and rules for buildings
  - Table 5.2 (Sheets 1-3): Maximum width-to-thickness ratios for compression parts
  - Section 6.2.2.5: Design using effective cross-section properties

- **EN 1993-1-5**: Eurocode 3: Design of steel structures - Part 1-5: Plated structural elements
  - Section 4.4: Effective cross-section properties for Class 4 sections
  - Table 4.1: Stress distribution in plate elements
  - Table 4.2: Effective widths of internal compression elements

---

**This plan provides a comprehensive roadmap for implementing section classification and Class 4 properties. The phased approach ensures incremental progress with testable milestones.**
