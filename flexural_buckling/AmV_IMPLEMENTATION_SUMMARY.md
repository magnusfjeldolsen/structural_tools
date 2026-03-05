# Am/V Section Factor Implementation Summary

## Overview
Successfully implemented Am/V (section factor) filtering for fire design in the flexural buckling module. This feature allows users to filter steel sections based on their exposed surface area to volume ratio, which directly affects fire insulation requirements.

## Implementation Date
2026-03-04

## Features Implemented

### 1. API Functions (flexural_buckling_api.js)

#### calculateIHSideHeight(section)
- **Purpose**: Calculate the side height for I/H beam sections accounting for geometry
- **Formula**: `h_side = h + b - 2×r - tw + π×r`
- **Parameters**:
  - `section`: Steel section object with h, b, tw, r properties
- **Returns**: Side height in mm

#### calculateSectionFactor(section, exposureConfig, profileType, shadowFactor)
- **Purpose**: Calculate Am/V ratio based on exposure configuration
- **Parameters**:
  - `section`: Steel section object
  - `exposureConfig`: One of 7 exposure configurations
  - `profileType`: Section type (hea, heb, hrhs, etc.)
  - `shadowFactor`: k_sh value (0.0-1.0, typically 0.9 for I/H)
- **Returns**: Object containing:
  - `AmV`: Effective Am/V in m⁻¹
  - `AmV_base`: Base Am/V before shadow factor
  - `Am`: Exposed perimeter in mm
  - `h_side`: Calculated side height (for I/H sections)
  - `k_sh`: Effective shadow factor (may be overridden)
  - `description`: Human-readable exposure description
  - `shadowApplied`: Boolean indicating if shadow factor was applied
  - `shadowNote`: Note if k_sh was automatically overridden

### 2. Exposure Configurations

| Config | Description | I/H Beam Am | RHS/SHS Am | Circular |
|--------|-------------|-------------|------------|----------|
| 4-sides | All sides exposed | P | P | P |
| 3-sides-top | Top flange not exposed | P - b | P - h | N/A |
| 3-sides-bottom | Bottom flange not exposed | P - b | P - h | N/A |
| 2-sides | Only webs exposed | 2 × h_side | 2 × h | N/A |
| 1-side-left | Left web only | h_side | h | N/A |
| 1-side-right | Right web only | h_side | h | N/A |
| 1-side-bottom | Bottom flange only | b | b | N/A |

### 3. Shadow Factor (k_sh) Logic

**Automatic Overrides to k_sh = 1.0:**
- All hollow sections (HRHS, HSHS, HCHS, CRHS, CSHS, CCHS)
- All single-sided exposure configurations (1-side-*)

**Standard Values:**
- I/H profiles: 0.9 (per EC3-1-2)
- Hollow sections: 1.0 (no shadow effect)
- User adjustable: 0.0 to 1.0

**Formula:**
```
Am/V_eff = k_sh × Am/V_base
```

### 4. UI Components (index.html)

**Added Section (appears when fire design is enabled):**
- Checkbox: Enable Am/V filter
- Dropdown: Exposure configuration (7 options)
- Input: Shadow factor k_sh (0.0-1.0, default 0.9)
- Input: Maximum Am/V (50-500 m⁻¹, default 200)

**Visual Design:**
- Indented subsection with cyan left border
- Collapsible inputs (hidden until checkbox enabled)
- Contextual hints below each input

### 5. Integration Points

#### calculateBuckling() Function
- Checks Am/V when `amvFilterEnabled` and `fireEnabled` are both true
- Returns error if section exceeds maximum Am/V
- Includes amvResult in success response

#### findLightestSection() Function
- Filters sections by Am/V during search
- Tracks skipped sections separately (Class 4 vs Am/V)
- Enhanced error messages indicating rejection reason
- Returns Am/V information with optimal section

#### Save/Load State
- collectFormState(): Saves Am/V filter settings
- applyFormState(): Restores Am/V filter settings
- Compatible with JSON file export/import

#### Results Display
- Detailed report shows Am/V parameters in INPUT PARAMETERS section
- Displays:
  - Filter enabled status
  - Exposure configuration
  - Shadow factor (with "auto" indicator if overridden)
  - Calculated Am/V vs maximum allowed

### 6. Test Files

#### test_amv_api.html
- 8 comprehensive API tests
- Validates geometry calculations
- Tests all examples from implementation plan
- Verifies shadow factor overrides
- Visual pass/fail indicators

#### test_amv_ui.html
- 3 integration tests
- Test 1: Calculate with Am/V filter
- Test 2: Find lightest section with Am/V constraint
- Test 3: Shadow factor override verification

## Testing Results

### Expected Test Outputs

**HEA200, 4-sides, k_sh=0.9:**
- h_side = 404.0 mm
- Am/V_base = 167.5 m⁻¹
- Am/V_eff = 150.8 m⁻¹

**HEA200, 3-sides-top, k_sh=0.9:**
- Am = 857 mm
- Am/V_base = 158.7 m⁻¹
- Am/V_eff = 142.8 m⁻¹

**HEA200, 2-sides, k_sh=0.9:**
- Am = 808 mm (2 × 404)
- Am/V_base = 149.7 m⁻¹
- Am/V_eff = 134.7 m⁻¹

**HEA200, 1-side-bottom, k_sh=0.9 → 1.0:**
- Am = 200 mm (bottom flange width)
- Am/V_base = 37.0 m⁻¹
- Am/V_eff = 37.0 m⁻¹ (k_sh overridden to 1.0)

## Files Modified

1. `flexural_buckling_api.js`
   - Added calculateIHSideHeight() function (lines ~1477-1500)
   - Added calculateSectionFactor() function (lines ~1502-1680)
   - Updated MODULE_CONFIG (lines 154-198)
   - Updated calculateBuckling() (lines ~1761-1793)
   - Updated findLightestSection() (lines ~1912-2030)

2. `flexural_buckling_ui.js`
   - Added event listener setup (line 47)
   - Updated updateFireInputsVisibility() (lines 207-219)
   - Added updateAmVFilterInputsVisibility() (lines 232-241)
   - Updated input collection in handleFormSubmit() (lines 265-268)
   - Updated input collection in handleFindLightestSection() (lines 311-314)
   - Updated input collection after search (lines 389-392)
   - Updated collectFormState() (lines 1329-1333)
   - Updated applyFormState() (lines 1401-1408)
   - Updated generateDetailedReport() (lines 983-989)

3. `index.html`
   - Added Am/V filter section (lines 494-558)

## Files Created

1. `test_amv_api.html` - API validation test suite
2. `test_amv_ui.html` - UI integration test page
3. `AmV_IMPLEMENTATION_SUMMARY.md` - This document
4. `plans/amv-max-implementation-plan.md` - Detailed implementation plan

## Usage Examples

### Example 1: Calculate single section with Am/V check
```javascript
const inputs = {
    profileType: 'hea',
    profileName: 'hea200',
    Ly: '4000',
    Lz: '4000',
    steelGrade: 'S355',
    fy: '355',
    gamma_M1: '1.0',
    NEd_ULS: '1000',
    allowClass4: true,
    fireEnabled: true,
    fireMode: 'specify',
    NEd_fire: '600',
    temperature: '500',
    amvFilterEnabled: true,
    exposureConfig: '4-sides',
    shadowFactor: '0.9',
    maxAmV: '200'
};

const results = calculateBuckling(inputs);
// results.amvResult contains Am/V calculation details
```

### Example 2: Find lightest section with Am/V constraint
```javascript
const inputs = {
    profileType: 'hea',
    Ly: '4000',
    Lz: '4000',
    NEd_ULS: '800',
    fireEnabled: true,
    NEd_fire: '500',
    temperature: '500',
    amvFilterEnabled: true,
    exposureConfig: '4-sides',
    shadowFactor: '0.9',
    maxAmV: '150'  // Strict limit
};

const searchResult = findLightestSection(inputs);
// Will only consider sections with Am/V ≤ 150 m⁻¹
```

## Error Handling

**Am/V Exceeded:**
```
{
    success: false,
    error: "Section exceeds maximum Am/V: 167.5 > 150 m⁻¹",
    amvResult: { ... },
    amvExceeded: true
}
```

**No Suitable Section (with Am/V rejections):**
```
{
    success: false,
    error: "No suitable section found. 12 sections exceeded Am/V limit. Consider increasing maximum Am/V or changing exposure configuration."
}
```

## References

- EN 1993-1-2 (Eurocode 3: Fire design of steel structures)
- EN 1993-1-5 (Eurocode 3: Effective cross-sections)
- Conlit fire insulation calculator (inspiration for exposure configurations)
- Implementation plan: `plans/amv-max-implementation-plan.md`

## Future Enhancements

Potential additions (not currently implemented):
1. Box factor (kb) for protected sections
2. Automatic insulation thickness calculation
3. Fire resistance rating estimation
4. Multiple fire load cases
5. Export Am/V data to CSV for batch analysis

## Notes

- Am/V calculation is only active when both fire design AND Am/V filter are enabled
- Shadow factor is automatically overridden for hollow sections and single-sided exposure
- Circular sections (HCHS, CCHS) return errors for incompatible exposure configs (2-sides, 1-side-*)
- All Am/V values are returned in m⁻¹ (meters inverse) per EC3-1-2 convention
- Perimeter (P) and area (A) from database are in mm and mm² respectively
- Conversion factor 1000 applied in formula: `(Am / A) * 1000` to get m⁻¹

## Verification

To verify the implementation:
1. Open `http://localhost:8000/test_amv_api.html`
2. Check that all 8 tests pass
3. Open `http://localhost:8000/test_amv_ui.html`
4. Run all 3 integration tests
5. Open `http://localhost:8000/index.html`
6. Enable fire design, then enable Am/V filter
7. Perform a calculation and check detailed report

All tests should pass with expected values matching the implementation plan.
