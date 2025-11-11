# Material Library Implementation Specification

## IMPLEMENTATION PROMPT

Implement a material library system for the 2D frame analysis tool that allows users to select standard steel materials or create custom materials. Follow this specification exactly.

---

## Overview

The material library allows users to:
1. Select from standard predefined steel materials (EN 1993-1-1)
2. Create and save custom materials with user-defined properties
3. Assign materials per element or globally

---

## Standard Steel Materials Database (EN 1993-1-1)

### Material Properties Structure

#### Common Properties (All Steel Grades)
- **Density (ρ)**: 7850 kg/m³
- **Unit Weight**: 78.5 kN/m³
- **Elastic Modulus (E)**: 210,000 MPa
- **Shear Modulus (G)**: 81,000 MPa
- **Poisson's Ratio (ν)**: 0.30
- **Thermal Expansion Coefficient (α)**: 12 × 10⁻⁶ /°K

#### Grade-Specific Strength Properties

**Active Properties (t ≤ 40 mm) - Currently Used in Analysis**

| Grade | Yield Strength f_y (MPa) | Ultimate Strength f_u (MPa) |
|-------|--------------------------|------------------------------|
| S235  | 235                      | 360                          |
| S275  | 275                      | 430                          |
| S355  | 355                      | 490                          |
| S420  | 420                      | 520                          |
| S460  | 460                      | 550                          |

**Reserved Properties (t > 40 mm) - For Future Thickness-Aware Implementation**

| Grade | Yield Strength f_y (MPa) | Ultimate Strength f_u (MPa) |
|-------|--------------------------|------------------------------|
| S235  | 215                      | 360                          |
| S275  | 255                      | 410                          |
| S355  | 335                      | 470                          |
| S420  | 390                      | 520                          |
| S460  | 430                      | 540                          |

---

## Partial Safety Factors (Separate from Materials)

**IMPORTANT**: Partial safety factors are NOT material properties. They are mutable analysis/design parameters stored separately.

Standard values per EN 1993-1-1:
- **γ_M0**: 1.05 (Resistance of cross-sections)
- **γ_M1**: 1.05 (Resistance of members to instability)
- **γ_M2**: 1.25 (Resistance of cross-sections in tension to fracture)

**Key Points**:
- Safety factors are element-specific and user-modifiable
- They are initialized with typical values from national annex
- **Phase 1**: Stored but NOT displayed or used in analysis
- **Phase 2**: Activated for EC3 design checks
- Stored separately from material definitions

---

## Data Structure Specification

### Material Object (Immutable Properties for Standard Materials)

```javascript
{
  id: string,                    // Unique identifier (e.g., "S235", "S355")
  name: string,                  // Display name (e.g., "Steel S235")
  type: "steel" | "custom",      // Material type
  isStandard: boolean,           // true for predefined materials

  properties: {
    // Active properties - displayed and used in analysis
    // IMMUTABLE for standard materials
    density: number,             // kg/m³
    elasticModulus: number,      // MPa (E) - Young's Modulus
    shearModulus: number,        // MPa (G)
    poissonsRatio: number,       // dimensionless (ν)
    thermalExpansion: number,    // per °K (α)
    yieldStrength: number,       // MPa (f_y) - characteristic yield limit
    ultimateStrength: number,    // MPa (f_u) - characteristic ultimate stress limit

    // Reserved properties - stored but not displayed/used
    // IMMUTABLE for standard materials
    yieldStrength_t40plus: number,    // MPa (f_y for t > 40mm)
    ultimateStrength_t40plus: number  // MPa (f_u for t > 40mm)
  },

  // Metadata
  standard: string,              // e.g., "EN 1993-1-1"
  createdBy: "system" | "user",
  dateCreated: timestamp,
  editable: boolean              // false for standard materials
}
```

### Partial Safety Factors (Stored Separately, Mutable)

```javascript
// Global defaults (user can modify)
const DEFAULT_SAFETY_FACTORS = {
  gamma_M0: 1.05,  // Mutable
  gamma_M1: 1.05,  // Mutable
  gamma_M2: 1.25   // Mutable
};

// Future Phase 2: Per-element safety factors
{
  elementId: string,
  materialId: string,
  // ... other element properties

  // Design parameters (optional, defaults to global if not specified)
  safetyFactors: {
    gamma_M0: number,  // User-modifiable
    gamma_M1: number,  // User-modifiable
    gamma_M2: number   // User-modifiable
  }
}
```

### Complete Standard Materials Database (Copy This Directly)

```javascript
const STANDARD_MATERIALS = {
  S235: {
    id: "S235",
    name: "Steel S235",
    type: "steel",
    isStandard: true,
    properties: {
      density: 7850,
      elasticModulus: 210000,
      shearModulus: 81000,
      poissonsRatio: 0.30,
      thermalExpansion: 12e-6,
      yieldStrength: 235,
      ultimateStrength: 360,
      yieldStrength_t40plus: 215,
      ultimateStrength_t40plus: 360
    },
    standard: "EN 1993-1-1",
    createdBy: "system",
    editable: false
  },
  S275: {
    id: "S275",
    name: "Steel S275",
    type: "steel",
    isStandard: true,
    properties: {
      density: 7850,
      elasticModulus: 210000,
      shearModulus: 81000,
      poissonsRatio: 0.30,
      thermalExpansion: 12e-6,
      yieldStrength: 275,
      ultimateStrength: 430,
      yieldStrength_t40plus: 255,
      ultimateStrength_t40plus: 410
    },
    standard: "EN 1993-1-1",
    createdBy: "system",
    editable: false
  },
  S355: {
    id: "S355",
    name: "Steel S355",
    type: "steel",
    isStandard: true,
    properties: {
      density: 7850,
      elasticModulus: 210000,
      shearModulus: 81000,
      poissonsRatio: 0.30,
      thermalExpansion: 12e-6,
      yieldStrength: 355,
      ultimateStrength: 490,
      yieldStrength_t40plus: 335,
      ultimateStrength_t40plus: 470
    },
    standard: "EN 1993-1-1",
    createdBy: "system",
    editable: false
  },
  S420: {
    id: "S420",
    name: "Steel S420",
    type: "steel",
    isStandard: true,
    properties: {
      density: 7850,
      elasticModulus: 210000,
      shearModulus: 81000,
      poissonsRatio: 0.30,
      thermalExpansion: 12e-6,
      yieldStrength: 420,
      ultimateStrength: 520,
      yieldStrength_t40plus: 390,
      ultimateStrength_t40plus: 520
    },
    standard: "EN 1993-1-1",
    createdBy: "system",
    editable: false
  },
  S460: {
    id: "S460",
    name: "Steel S460",
    type: "steel",
    isStandard: true,
    properties: {
      density: 7850,
      elasticModulus: 210000,
      shearModulus: 81000,
      poissonsRatio: 0.30,
      thermalExpansion: 12e-6,
      yieldStrength: 460,
      ultimateStrength: 550,
      yieldStrength_t40plus: 430,
      ultimateStrength_t40plus: 540
    },
    standard: "EN 1993-1-1",
    createdBy: "system",
    editable: false
  }
};

// Partial safety factors stored separately (not in material objects)
const DEFAULT_SAFETY_FACTORS = {
  gamma_M0: 1.05,
  gamma_M1: 1.05,
  gamma_M2: 1.25
};
```

---

## Implementation Requirements

### 1. Material Selection UI

**Location**: Integrate into existing element properties panel or create dedicated material selector

**Requirements**:
- Dropdown/selector showing standard materials: S235, S275, S355, S420, S460
- **Default selection**: S355
- Button/option to create custom material
- Display **only active properties** for selected material:
  - Density (ρ): [value] kg/m³
  - Young's Modulus (E): [value] MPa
  - Shear Modulus (G): [value] MPa
  - Poisson's Ratio (ν): [value]
  - Thermal Expansion (α): [value] /°K
  - Yield Strength (f_y): [value] MPa
  - Ultimate Strength (f_u): [value] MPa

**Do NOT display**:
- Thickness-dependent properties (t>40mm values)
- Partial safety factors (stored separately, not shown in Phase 1)

---

### 2. Custom Material Creation

**UI Flow**:

1. User clicks "Add Custom Material" button
2. Modal/form opens with input fields

**Required Input Fields** (with labels):
```
Material Name: [text input]

Active Properties:
- Density (ρ) [kg/m³]: [number input]
- Young's Modulus (E) [MPa]: [number input]
- Shear Modulus (G) [MPa]: [number input]
- Poisson's Ratio (ν): [number input]
- Thermal Expansion (α) [/°K]: [number input]
- Characteristic Yield Limit (f_y) [MPa]: [number input]
- Characteristic Ultimate Stress Limit (f_u) [MPa]: [number input]
```

**Optional Features**:
- "Base on existing material" dropdown to copy values from standard material
- Collapsible "Advanced Properties" section for:
  - Yield Strength for t > 40mm (defaults to same as f_y)
  - Ultimate Strength for t > 40mm (defaults to same as f_u)

**Actions**:
- "Save" button: validates and saves to custom materials
- "Cancel" button: closes modal without saving

**Note**: Partial safety factors are NOT part of custom material creation. They are managed separately.

---

### 3. Material Library Management

**UI Component**: Material library browser/manager

**Features**:
- List view showing all materials (standard + custom)
- Filter toggle: "Standard" / "Custom" / "All"
- For each material, display: Name, Type, Key properties preview
- Actions per material:
  - **Standard materials**: View only (cannot edit or delete)
  - **Custom materials**: Edit, Delete buttons

**Important**: Material properties are immutable for standard materials. Safety factors are managed separately and are not part of material editing.

---

### 4. Integration with Analysis

**Material Assignment**:
- Each element stores a material reference (material ID)
- Option for global material assignment (apply to all elements)
- Option for per-element material assignment

**Analysis Usage (Phase 1)**:
- Retrieve material properties when running analysis
- **Currently use only**: density, E, G, ν, f_y, f_u (t ≤ 40mm values)
- **Ignore for now**: t>40mm properties, partial safety factors

**Storage Structure**:
- **Material properties**: Stored in material objects (immutable for standard materials)
- **Partial safety factors**: Stored separately (mutable, not used in Phase 1)
- **Custom materials**: Saved to localStorage without safety factors
- **Safety factors**: Separate localStorage key or global analysis settings

---

## User Workflows

### Workflow 1: Using Standard Material

1. User selects an element (or multiple elements, or "all elements")
2. User opens material selector
3. User selects material from dropdown (e.g., S355)
4. System displays active properties for verification
5. User confirms selection
6. Material assigned to element(s)

### Workflow 2: Creating Custom Material

1. User clicks "Add Custom Material"
2. User enters material name
3. **Option A**: User selects "Base on existing material" → copies values from standard material
4. **Option B**: User enters all property values manually
5. User optionally expands "Advanced Properties" to set:
   - Characteristic Yield Limit (f_y) for t > 40mm
   - Characteristic Ultimate Stress Limit (f_u) for t > 40mm
6. System validates inputs (see validation rules below)
7. User clicks "Save"
8. Material added to custom materials list
9. Material available in selector for future use

### Workflow 3: Editing Custom Material

1. User opens material library
2. User selects custom material
3. User clicks "Edit"
4. Modal opens with current values pre-filled
5. User modifies values
6. System validates
7. User saves changes
8. All elements using this material automatically use updated properties

### Workflow 4: Modifying Partial Safety Factors (Future Phase 2)

1. User opens analysis settings or design parameters panel
2. User sees "Safety Factors" section (separate from materials)
3. User modifies γ_M0, γ_M1, γ_M2 values
4. Changes apply globally or can be overridden per-element
5. Values stored separately from material definitions

---

## Validation Rules

### Active Properties (Required)
- Material name: non-empty string, unique
- Elastic modulus (E) > 0
- Shear modulus (G) > 0
- Poisson's ratio: 0 < ν < 0.5
- Density (ρ) > 0
- Thermal expansion (α) > 0
- Yield strength (f_y) > 0
- Ultimate strength (f_u) > f_y

### Reserved Properties (Optional, For Future Use)
- If specified: f_y (t>40) > 0 and f_u (t>40) > f_y (t>40)

### Partial Safety Factors (Separate Validation, Phase 2)
- γ_M0, γ_M1, γ_M2 ≥ 1.0
- These are NOT validated during material creation (stored separately)

**Validation Feedback**:
- Display inline error messages for invalid inputs
- Disable "Save" button until all validations pass
- Show clear error descriptions (e.g., "Ultimate strength must be greater than yield strength")

---

## Technical Implementation Notes

### Data Storage

**Standard Materials**:
- Define as constant object in code (see STANDARD_MATERIALS above)
- Read-only, cannot be modified by user
- Do NOT include partial safety factors

**Custom Materials**:
- Store in localStorage with key: `customMaterials`
- Format: Array of material objects (following same structure as standard materials)
- Do NOT include partial safety factors in material objects
- Include dateCreated timestamp for each custom material

**Partial Safety Factors** (Separate Storage):
- Store in localStorage with key: `safetyFactors` or as part of global analysis settings
- Format: `{gamma_M0: 1.05, gamma_M1: 1.05, gamma_M2: 1.25}`
- Default values as shown above
- User can modify these independently of materials (Phase 2)
- In future, can be stored per-element if element-specific design parameters are needed

**Element-Material Mapping**:
- Add `materialId` property to each element object
- Default value: "S355"
- When loading analysis, resolve materialId to material object
- Elements do NOT store safety factors in Phase 1 (reserved for Phase 2)

### UI Integration

Integrate material selector into existing UI structure:
- Add material dropdown to element properties panel
- Create dedicated "Materials" tab/section for library management
- Ensure material selection is persistent across sessions
- Safety factors UI is separate (not implemented in Phase 1)

### Analysis Integration

When running PyNite analysis:
- Retrieve material for each element via materialId
- Pass active properties to PyNite:
  - E (elastic modulus)
  - G (shear modulus)
  - ν (Poisson's ratio)
  - ρ (density) for self-weight calculations
- Ignore partial safety factors in Phase 1 (not used)

---

## Implementation Phases

### Phase 1 (IMPLEMENT NOW)
- Create STANDARD_MATERIALS constant with all 5 steel grades (without safety factors)
- Build material selection UI with dropdown
- Implement custom material creation form with validation
- Store custom materials in localStorage (without safety factors)
- Create DEFAULT_SAFETY_FACTORS constant (stored separately, not used yet)
- Integrate material properties into analysis (use active properties only)
- Default material: S355
- **Key**: Material properties are immutable for standard materials
- **Key**: Safety factors stored separately, not displayed or used yet

### Phase 2 (Future - EC3 Design)
- Activate partial safety factors in UI as separate analysis parameters
- Allow users to modify γ_M0, γ_M1, γ_M2 globally
- Optionally allow per-element safety factor overrides
- Implement design resistance calculations using safety factors
- Display utilization ratios
- **Key**: Safety factors remain separate from material definitions and are mutable

### Phase 3 (Future - Thickness-Aware)
- Activate thickness-dependent properties (t>40mm values)
- Auto-select appropriate strength values based on element thickness
- Display which thickness range is active in UI

---

## Future Enhancements
- Additional material types (concrete, timber, aluminum)
- Material comparison tool
- Temperature-dependent properties
- Material certificates/documentation links
- National Annex variations for partial safety factors
- Import/export custom material libraries

---

## Success Criteria

Implementation is complete when:
1. ✓ User can select from 5 standard steel materials (S235, S275, S355, S420, S460)
2. ✓ Default material is S355
3. ✓ User can create custom materials with all required properties
4. ✓ Custom materials are saved and persist across sessions
5. ✓ Material properties are correctly passed to PyNite analysis
6. ✓ Material selector displays only active properties (not reserved properties)
7. ✓ All validation rules are enforced
8. ✓ User can edit and delete custom materials
9. ✓ Standard materials cannot be edited or deleted (immutable)
10. ✓ Material assignment works per-element or globally
11. ✓ Partial safety factors are stored separately from material definitions
12. ✓ Partial safety factors are initialized but not displayed/used in Phase 1
13. ✓ Standard materials do NOT contain safety factors in their data structure
14. ✓ Custom materials do NOT contain safety factors in their data structure
