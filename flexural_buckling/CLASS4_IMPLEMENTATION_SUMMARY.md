# Class 4 Section Classification Implementation Summary

## Overview
Implementation of EN 1993-1-1 Section Classification (Classes 1-4) for steel members in pure compression, including Class 4 effective properties calculation per EN 1993-1-5.

**Branch**: `class4-pure-compression`
**Date**: February 27, 2026
**Status**: ✅ Complete and tested

---

## Features Implemented

### 1. Section Classification Engine

**File**: `flexural_buckling_api.js` (lines 457-713)

- **`classifySection(section, fy, profileType)`**: Main classification function
  - Evaluates all plate elements (web, flange, walls)
  - Calculates epsilon: ε = √(235/fy)
  - Checks slenderness against EN 1993-1-1 Table 5.2 limits
  - Returns overall class (worst element governs)

- **Classification Limits** (pure compression):
  - **Internal elements**: Class 3 limit = 42ε
  - **Outstand elements**: Class 3 limit = 14ε
  - **Circular sections**: Class 3 limit = 90ε²

- **Supported Section Types**:
  - I/H sections (HEA, HEB, HEM, IPE)
  - Rectangular Hollow Sections (RHS, SHS)
  - Circular Hollow Sections (CHS)

### 2. Class 4 Effective Properties

**Function**: `calculateClass4EffectiveProperties(section, classification)`

Implements EN 1993-1-5 Section 4.4 (Effective Width Method):

```
For internal elements in uniform compression (ψ = 1.0):
  λ̄p = (c/t) / (28.4ε√kσ)
  ρ = (λ̄p - 0.055(3 + ψ)) / λ̄p²  (but ρ ≤ 1.0)
  c_eff = ρ × c

Area reduction:
  A_eff = A_gross - Σ(c - c_eff) × t
```

**Properties calculated**:
- Effective area (A_eff)
- Effective moments of inertia (I_eff,y, I_eff,z)
- Effective radii of gyration (i_eff,y, i_eff,z)
- Area reduction percentage

### 3. User Interface

**Toggle Control** ([index.html:407-426](flexural_buckling/index.html#L407-L426)):
- Toggle switch for Class 4 handling
- Default: **Checked** (allow Class 4 with effective properties)
- Unchecked: Reject Class 4 sections with error message

**Results Display** ([index.html:605-659](flexural_buckling/index.html#L605-L659)):
- Overall section class with color coding:
  - 🟢 Green: Class 1-2 (compact, plastic)
  - 🟡 Yellow: Class 3 (semi-compact, elastic)
  - 🟠 Orange: Class 4 (slender, local buckling)
- Epsilon value (ε)
- Governing plate element
- Effective area (for Class 4 only)
- Collapsible detailed element classification table
- Class 4 info banner showing area reduction

**JavaScript** ([flexural_buckling_ui.js:505-590](flexural_buckling/flexural_buckling_ui.js#L505-L590)):
- `displayClassificationResults()`: Populates UI with classification data
- `toggleClassificationDetails()`: Shows/hides element details table

---

## Classification Templates

Template JSON files define plate element formulas for each section family:

### I-Section Template
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
      "t_formula": "tf"
    },
    {
      "id": "web_internal",
      "type": "internal",
      "c_formula": "(h - 2*tf - 2*r)",
      "t_formula": "tw"
    }
  ]
}
```

### RHS Template
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
      "t_formula": "t"
    },
    {
      "id": "web_internal",
      "type": "internal",
      "c_formula": "(h - 3*t)",
      "t_formula": "t"
    }
  ]
}
```

### CHS Template
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
      "t_formula": "t"
    }
  ]
}
```

---

## Validation Tests

All tests pass ✅

### Test Script
**File**: `test_classification_simple.js`

Manual calculations verify formula implementation:

| Section | Steel Grade | Element | c/t | Class 3 Limit | Result | Status |
|---------|-------------|---------|-----|---------------|--------|--------|
| **IPE 220** | S460 | Web | 30.10 | 30.02 | Class 4 | ✅ |
| **IPE 550** | S235 | Web | 42.13 | 42.00 | Class 4 | ✅ |
| **HEA 800** | S235 | Web | 44.93 | 42.00 | Class 4 | ✅ |
| **HEA 500** | S460 | Web | 32.50 | 30.02 | Class 4 | ✅ |
| **CSHS 200x4** | S235 | All sides | 47.00 | 42.00 | Class 4 | ✅ |
| **CSHS 200x5** | S235 | All sides | 37.00 | 38.00 | Class 2 | ✅ |

Run tests:
```bash
node flexural_buckling/test_classification_simple.js
```

### UI Test Page
**File**: `test_ui.html`

Browser-based test verifying:
1. ✅ IPE220/S460 classified as Class 4
2. ✅ CSHS200x4/S235 classified as Class 4
3. ✅ Class 4 rejection when toggle is off

Open in browser:
```bash
start flexural_buckling/test_ui.html
```

---

## API Integration

### Input Parameter
```javascript
inputs.allowClass4 = document.getElementById('class4-toggle').checked;
```

### Calculation Flow
```javascript
// 1. Classify section
const classification = classifySection(section, fy, profileType);

// 2. Check if Class 4 is allowed
if (classification.is_class4 && !allowClass4) {
  return {
    success: false,
    error: 'Section is Class 4 (slender). Toggle "Allow Class 4" or choose a different section.',
    classification: classification
  };
}

// 3. Calculate effective properties if Class 4
let effectiveSection = section;
if (classification.is_class4) {
  const effProps = calculateClass4EffectiveProperties(section, classification);
  effectiveSection = {
    ...section,
    area: effProps.area,
    iy: effProps.iy_eff,
    iz: effProps.iz_eff
  };
  classification.effective_properties = effProps;
}

// 4. Use effective section for buckling calculation
// ... calculate Nb,Rd with effectiveSection ...
```

---

## Code References

### Key Functions

| Function | File | Lines | Description |
|----------|------|-------|-------------|
| `classifySection()` | flexural_buckling_api.js | 619-669 | Main classification engine |
| `calculateClass4EffectiveProperties()` | flexural_buckling_api.js | 671-713 | Effective properties per EN 1993-1-5 |
| `calculateBucklingResistance()` | flexural_buckling_api.js | 774-934 | Integrated with classification |
| `displayClassificationResults()` | flexural_buckling_ui.js | 505-573 | UI display function |

### Constants and Templates

| Item | File | Lines | Description |
|------|------|-------|-------------|
| `CLASSIFICATION_TEMPLATES` | flexural_buckling_api.js | 457-527 | Template definitions |
| `getClassificationTemplate()` | flexural_buckling_api.js | 529-547 | Template lookup |
| `evaluateFormula()` | flexural_buckling_api.js | 549-569 | Formula evaluator |

---

## Testing Checklist

- [x] Classification formulas match EN 1993-1-1 Table 5.2
- [x] All 6 validation cases pass
- [x] Effective properties calculation per EN 1993-1-5
- [x] UI toggle controls Class 4 acceptance
- [x] Classification results display correctly
- [x] Class 4 sections rejected when toggle off
- [x] Effective area shown for Class 4 sections
- [x] Element details table populates correctly
- [x] Color coding works (green/yellow/orange)
- [x] Integration with buckling calculation
- [x] Integration with fire design mode
- [x] Find Lightest Section respects Class 4 setting

---

## Future Enhancements

### Phase 2: Bending Classification (Not Yet Implemented)
- Classification for members in bending (EN 1993-1-1 Table 5.2, other parts)
- Effective section moduli (W_eff,y, W_eff,z)
- Neutral axis shift for unsymmetric sections
- Stress distribution factors (ψ ≠ 1.0)

### Phase 3: Combined Loading (Not Yet Implemented)
- Classification for axial + bending (interaction)
- Stress ratio ψ calculation
- Effective properties for combined loading

---

## References

- **EN 1993-1-1**: Eurocode 3 Part 1-1, Section 5.5 (Classification of cross-sections)
- **EN 1993-1-1**: Table 5.2 (Maximum width-to-thickness ratios)
- **EN 1993-1-5**: Section 4.4 (Effective widths due to plate buckling)
- **EN 1993-1-5**: Eq. 4.2 (Reduction factor ρ)

---

## Commits

1. **`99e38d2`** - Add Class 4 section classification and effective properties
   - Classification templates
   - Classification engine
   - Effective properties calculation
   - API integration

2. **`0b7a4da`** - Update Class 4 UI to use toggle button and add validation tests
   - Toggle switch UI
   - Validation test script
   - IPE and HEA test cases

3. **`3ff31c0`** - Complete Class 4 UI integration
   - Results display function
   - Classification table
   - CSHS test cases
   - UI wiring complete

4. **`62495ee`** - Fix: Hide classification results initially and add UI test page
   - Initial hidden state for results
   - Browser-based test page

---

## How to Use

### For Users:
1. Open the flexural buckling app
2. Select a steel section (profile type and size)
3. Enter buckling lengths, loads, and material properties
4. **Toggle "Class 4 Sections"**:
   - ✅ **Checked (Allow)**: Uses effective properties if Class 4
   - ❌ **Unchecked (Avoid)**: Rejects Class 4 sections with error
5. Click "Calculate Buckling Resistance"
6. View classification results above ULS results
7. Click "Show element classification details" for detailed breakdown

### For Developers:
```javascript
// Classification is automatic in calculateBuckling()
const results = calculateBuckling({
  profileType: 'ipe',
  profileName: 'IPE220',
  Ly: '3.5',
  Lz: '3.5',
  fy: '460',
  allowClass4: true,  // <-- Key parameter
  // ... other inputs
});

// Access classification in results
const classification = results.ulsResults.classification;
console.log(`Section is Class ${classification.class}`);
if (classification.is_class4) {
  console.log(`Effective area: ${classification.effective_properties.area} cm²`);
}
```

---

**Implementation Complete**: All objectives achieved. The module now provides comprehensive section classification with user control over Class 4 handling, following Eurocode 3 requirements for members in pure compression.
