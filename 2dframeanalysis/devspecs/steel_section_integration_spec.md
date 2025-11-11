# Steel Section Integration Specification

## Overview
This document describes how the steel cross-section database integration should work within the 2D Frame Analysis tool. Users should be able to select standard steel profiles from JSON files or define custom sections.

## Database Structure

### Location
`../steel_cross_section_database/`

### Available Profile Types (JSON files)
- `ipe.json` - European I-beams (IPE profiles)
- `hea.json` - European wide flange H-beams (HEA profiles)
- `heb.json` - European wide flange H-beams (HEB profiles)
- `hem.json` - European wide flange H-beams (HEM profiles)
- `cchs.json` - Cold-formed Circular Hollow Sections
- `crhs.json` - Cold-formed Rectangular Hollow Sections
- `cshs.json` - Cold-formed Square Hollow Sections
- `hchs.json` - Hot-finished Circular Hollow Sections
- `hrhs.json` - Hot-finished Rectangular Hollow Sections
- `hshs.json` - Hot-finished Square Hollow Sections

### JSON Structure
Each JSON file has:
- `metadata`: Information about profile type, description, and units
  - Units: length in mm, area in mm², moment of inertia in mm⁴
- `profiles`: Array of profile objects, each containing:
  - `profile`: Profile name (e.g., "IPE100", "HEA120")
  - `A`: Cross-sectional area (mm²)
  - `Iy`: Strong axis moment of inertia (mm⁴)
  - `Iz`: Weak axis moment of inertia (mm⁴)
  - Other geometric properties (h, b, tw, tf, etc.)

## User Interface Design

### Element Input Grid Enhancement

The current element input grid should be modified from:
```
Element | Node i | Node j | E (GPa) | I (m⁴) | A (m²)
```

To:
```
Element | Node i | Node j | E (GPa) | Section Type | Profile | Bending Axis | I (m⁴) | A (m²)
```

### Section Type Dropdown (Primary Selection)
A dropdown menu with the following options:
- `Custom` (default)
- `IPE`
- `HEA`
- `HEB`
- `HEM`
- `CCHS` (Circular CHS - Cold-formed)
- `CRHS` (Rectangular RHS - Cold-formed)
- `CSHS` (Square SHS - Cold-formed)
- `HCHS` (Circular CHS - Hot-finished)
- `HRHS` (Rectangular RHS - Hot-finished)
- `HSHS` (Square SHS - Hot-finished)

### Profile Dropdown (Secondary Selection)
- **When "Custom" is selected**: This dropdown is disabled/hidden
- **When a standard section type is selected**:
  - Dropdown is enabled
  - Populated with profile names from the corresponding JSON file
  - Options format: Display the `profile` field (e.g., "IPE100", "HEA120")
  - Sorted in the order they appear in the JSON

### Bending Axis Selection
A dropdown with two options:
- `Strong axis (y-y)` - Uses Iy value
- `Weak axis (z-z)` - Uses Iz value

**Behavior:**
- **When "Custom" section type**: This dropdown is disabled/hidden
- **When standard section type**: This dropdown is enabled

### Input Field Behavior

#### Area (A) Input Field
- **When "Custom"**: Editable text input, user enters value in m²
- **When standard profile selected**:
  - Auto-populated from JSON (converted from mm² to m²)
  - Read-only (grayed out) but value is visible
  - Updates automatically when profile selection changes

#### Moment of Inertia (I) Input Field
- **When "Custom"**: Editable text input, user enters value in m⁴
- **When standard profile selected**:
  - Auto-populated based on selected bending axis:
    - Strong axis (y-y): Uses `Iy` from JSON
    - Weak axis (z-z): Uses `Iz` from JSON
  - Converted from mm⁴ to m⁴
  - Read-only (grayed out) but value is visible
  - Updates automatically when profile or axis selection changes

## Unit Conversions

### From Database to FEA Model
- **Area**: mm² → m² (divide by 1,000,000 or multiply by 1e-6)
- **Moment of Inertia**: mm⁴ → m⁴ (divide by 1e12)
- **E-modulus**: Remains in GPa (user input, not from database)

### Conversion Formulas
```javascript
A_m2 = A_mm2 * 1e-6
I_m4 = I_mm4 * 1e-12
```

## Implementation Details

### Data Loading
1. Load JSON files on page initialization using fetch API
2. Store profile data in JavaScript objects indexed by profile type
3. Handle loading errors gracefully (show message if files can't be loaded)

### Profile Selection Logic
```
1. User selects Section Type dropdown
   ↓
2. If "Custom":
   - Hide/disable Profile dropdown
   - Hide/disable Bending Axis dropdown
   - Enable A and I input fields for manual entry

3. If standard type (e.g., "IPE"):
   - Load corresponding JSON file
   - Populate Profile dropdown with profile names
   - Show/enable Bending Axis dropdown
   - Disable A and I input fields

4. User selects Profile from dropdown
   ↓
5. User selects Bending Axis
   ↓
6. Auto-populate A (from profile.A)
   ↓
7. Auto-populate I (from profile.Iy or profile.Iz based on axis)
```

### Visual Styling
- **Read-only fields**: Gray background (#4B5563) with lighter text to indicate non-editable
- **Editable fields**: Normal dark background (#374151) with white text
- **Disabled dropdowns**: Hidden or visually disabled state
- **Enabled dropdowns**: Standard dropdown styling matching the rest of the interface

## Data Structure for Elements

Each element object should store:
```javascript
{
    name: "M1",
    nodeI: "N1",
    nodeJ: "N2",
    E: 210,  // GPa
    sectionType: "IPE" | "HEA" | ... | "Custom",
    profileName: "IPE200",  // null if Custom
    bendingAxis: "strong" | "weak",  // null if Custom
    I: 0.0000194,  // m⁴ (auto-populated or manual)
    A: 0.00282  // m² (auto-populated or manual)
}
```

## Example Calculations

### Example: IPE200
From JSON: `"A": 2848` mm², `"Iy": 19430000` mm⁴, `"Iz": 1423000` mm⁴

**Strong axis bending:**
- A = 2848 × 1e-6 = 0.002848 m²
- I = 19430000 × 1e-12 = 0.00001943 m⁴

**Weak axis bending:**
- A = 2848 × 1e-6 = 0.002848 m²
- I = 1423000 × 1e-12 = 0.000001423 m⁴

## Error Handling

1. **JSON file not found**: Show warning message, fallback to Custom mode
2. **Invalid profile selection**: Keep previous valid values
3. **Missing Iy or Iz in profile data**: Show error message, require Custom input

## Backward Compatibility

Existing custom elements should continue to work. When loading saved models or examples:
- If `sectionType` is not present, default to "Custom"
- If only `I` and `A` are present, treat as Custom section

## Future Enhancements (Not in Initial Implementation)

- Visual preview of selected cross-section
- Display additional properties (h, b, tw, tf) for reference
- Section capacity checks based on selected profile
- Export section property table
- Allow custom section library (user-uploaded JSON)
