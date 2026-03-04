# Am/V Exposure Configuration Revision Plan

## Issue Identified

The current exposure configurations are failing for non-4-sided cases. Need to revise to match Conlit calculator approach with:
1. Clear, simple dropdown options with illustrations
2. Correct formulas for each case
3. Better handling of left/right/top/bottom orientation

## Revised Exposure Configurations

### 1. **4 sides - All exposed**
**Illustration:**
```
    ┌─────┐  ← top (exposed)
    │  ▓  │  ← left & right (exposed)
    └─────┘  ← bottom (exposed)
```

**Formula:**
- All profiles: `Am = P` (full perimeter)

**k_sh:** Applied for I/H profiles (0.9), not for hollow (1.0)

---

### 2. **3 sides - Left side non-exposed**
**Illustration:**
```
    ┌─────┐  ← top (exposed)
    ║  ▓  │  ← left (NON-exposed), right (exposed)
    └─────┘  ← bottom (exposed)
```

**Formula:**
- **I/H profiles**: `Am = P - h_side`
  - Where: `h_side = h + b - 2×r - tw + π×r`
  - Remove the left side which includes flange tips and radii
- **RHS/SHS**: `Am = P - h`
  - Remove left side height
- **CHS**: Not applicable

**k_sh:** Applied for I/H profiles (0.9), not for hollow (1.0)

**Note:** This is the standard "3 sides" case used in Conlit where one vertical side is protected.

---

### 3. **3 sides - Top non-exposed**
**Illustration:**
```
    ═══════  ← top (NON-exposed)
    │  ▓  │  ← left & right (exposed)
    └─────┘  ← bottom (exposed)
```

**Formula:**
- **All profiles**: `Am = P - b`
  - Remove top flange/side width

**k_sh:** Applied for I/H profiles (0.9), not for hollow (1.0)

---

### 4. **2 sides - Side and top non-exposed**
**Illustration:**
```
    ═══════  ← top (NON-exposed)
    ║  ▓  │  ← left (NON-exposed), right (exposed)
    └─────┘  ← bottom (exposed)
```

**Formula:**
- **I/H profiles**: `Am = P - h_side - b`
  - Remove both left side and top flange
- **RHS/SHS**: `Am = P - h - b`
  - Remove left side and top side
- **CHS**: Not applicable

**k_sh:** Applied for I/H profiles (0.9), not for hollow (1.0)

**Note:** This is a combination of cases 2 and 3.

---

### 5. **1 side - Bottom exposed**
**Illustration:**
```
    ═══════  ← top (NON-exposed)
    ║  ▓  ║  ← left & right (NON-exposed)
    └─────┘  ← bottom (EXPOSED)
```

**Formula:**
- **All profiles**: `Am = b`
  - Only bottom flange/side width

**k_sh:** NOT applied (1.0) - single-sided heating has no shadowing

---

### 6. **1 side - Side exposed**
**Illustration:**
```
    ═══════  ← top (NON-exposed)
    ║  ▓  │  ← left (NON-exposed), right (EXPOSED)
    └───────  ← bottom (NON-exposed)
```

**Formula:**
- **I/H profiles**: `Am = h_side`
  - Side height including flange geometry
- **RHS/SHS**: `Am = h`
  - Simple side height
- **CHS**: Not applicable

**k_sh:** NOT applied (1.0) - single-sided heating has no shadowing

---

## Implementation Changes Required

### 1. Update Dropdown Options

**Old (7 options - confusing):**
```html
<option value="4-sides">4 sides (all exposed)</option>
<option value="3-sides-top">3 sides - top non-exposed</option>
<option value="3-sides-bottom">3 sides - bottom non-exposed</option>
<option value="2-sides">2 sides (webs only)</option>
<option value="1-side-left">1 side - left web</option>
<option value="1-side-right">1 side - right web</option>
<option value="1-side-bottom">1 side - bottom flange</option>
```

**New (6 options - clear):**
```html
<option value="4-sides">4 sides - All exposed</option>
<option value="3-sides-left-protected">3 sides - Left side protected</option>
<option value="3-sides-top-protected">3 sides - Top protected</option>
<option value="2-sides-left-top-protected">2 sides - Left and top protected</option>
<option value="1-side-bottom">1 side - Bottom only</option>
<option value="1-side-side">1 side - Side only</option>
```

### 2. Update calculateSectionFactor() Function

**File:** `flexural_buckling_api.js`

**Changes:**

```javascript
switch (exposureConfig) {
  case '4-sides':
    Am = P;
    description = '4 sides - All exposed';
    break;

  case '3-sides-left-protected':
    if (isCircular) {
      return { error: 'Not applicable to circular sections', ... };
    }
    if (isIorH) {
      // Remove left side (h_side)
      Am = P - h_side;
      description = '3 sides - Left side protected';
    } else {
      // RHS/SHS: Remove left side (h)
      Am = P - h;
      description = '3 sides - Left side protected';
    }
    break;

  case '3-sides-top-protected':
    if (isCircular) {
      return { error: 'Not applicable to circular sections', ... };
    }
    // All profiles: Remove top (b)
    Am = P - b;
    description = '3 sides - Top protected';
    break;

  case '2-sides-left-top-protected':
    if (isCircular) {
      return { error: 'Not applicable to circular sections', ... };
    }
    if (isIorH) {
      // Remove left side and top
      Am = P - h_side - b;
      description = '2 sides - Left and top protected';
    } else {
      // RHS/SHS: Remove left and top
      Am = P - h - b;
      description = '2 sides - Left and top protected';
    }
    break;

  case '1-side-bottom':
    if (isCircular) {
      return { error: 'Not applicable to circular sections', ... };
    }
    // Only bottom flange/side
    Am = b;
    description = '1 side - Bottom only';
    break;

  case '1-side-side':
    if (isCircular) {
      return { error: 'Not applicable to circular sections', ... };
    }
    if (isIorH) {
      // One side with flange geometry
      Am = h_side;
      description = '1 side - Side only';
    } else {
      // RHS/SHS: Simple side height
      Am = h;
      description = '1 side - Side only';
    }
    break;

  default:
    Am = P;
    description = '4 sides - All exposed (default)';
}
```

### 3. Update Shadow Factor Logic

```javascript
// Determine if shadow factor should be applied
let k_sh_effective = shadowFactor;

// Override conditions:
// 1. Hollow sections: always k_sh = 1.0 (no shadowing geometry)
// 2. Single-sided exposure: k_sh = 1.0 (no shadowing with one side)
const isSingleSide = ['1-side-bottom', '1-side-side'].includes(exposureConfig);

if (isHollow || isSingleSide) {
  k_sh_effective = 1.0;
}
```

### 4. Update HTML Dropdown

**File:** `index.html`

```html
<select id="exposure-config"
        class="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500">
  <option value="4-sides">4 sides - All exposed</option>
  <option value="3-sides-left-protected">3 sides - Left side protected</option>
  <option value="3-sides-top-protected">3 sides - Top protected</option>
  <option value="2-sides-left-top-protected">2 sides - Left and top protected</option>
  <option value="1-side-bottom">1 side - Bottom only</option>
  <option value="1-side-side">1 side - Side only</option>
</select>
<p class="text-xs text-gray-400 mt-1">Select which sides are exposed to fire</p>
```

### 5. Add Visual Illustrations (Optional Enhancement)

Create simple ASCII art or SVG illustrations that appear when hovering over each option:

```html
<div class="exposure-illustration hidden" id="ill-4-sides">
  <pre class="text-xs">
    ┌─────┐ ← exposed
    │  ▓  │ ← exposed
    └─────┘ ← exposed
  </pre>
</div>
```

## Formula Verification

### Example: HEA200

**Section Properties:**
- h = 190 mm
- b = 200 mm
- tw = 6.5 mm
- tf = 10 mm
- r = 18 mm
- P = 1136 mm
- A = 5383 mm²

**Calculate h_side:**
```
h_side = h + b - 2×r - tw + π×r
       = 190 + 200 - 2×18 - 6.5 + π×18
       = 190 + 200 - 36 - 6.5 + 56.5
       = 404.0 mm
```

### Test Cases:

**1. 4-sides:**
- Am = 1136 mm
- Am/V_base = (1136 / 5383) × 1000 = 211.1 m⁻¹
- k_sh = 0.9
- Am/V_eff = 0.9 × 211.1 = 190.0 m⁻¹ ✓

**2. 3-sides-left-protected:**
- Am = 1136 - 404 = 732 mm
- Am/V_base = (732 / 5383) × 1000 = 136.0 m⁻¹
- k_sh = 0.9
- Am/V_eff = 0.9 × 136.0 = 122.4 m⁻¹ ✓

**3. 3-sides-top-protected:**
- Am = 1136 - 200 = 936 mm
- Am/V_base = (936 / 5383) × 1000 = 173.9 m⁻¹
- k_sh = 0.9
- Am/V_eff = 0.9 × 173.9 = 156.5 m⁻¹ ✓

**4. 2-sides-left-top-protected:**
- Am = 1136 - 404 - 200 = 532 mm
- Am/V_base = (532 / 5383) × 1000 = 98.8 m⁻¹
- k_sh = 0.9
- Am/V_eff = 0.9 × 98.8 = 88.9 m⁻¹ ✓

**5. 1-side-bottom:**
- Am = 200 mm
- Am/V_base = (200 / 5383) × 1000 = 37.2 m⁻¹
- k_sh = 1.0 (override)
- Am/V_eff = 1.0 × 37.2 = 37.2 m⁻¹ ✓

**6. 1-side-side:**
- Am = 404 mm
- Am/V_base = (404 / 5383) × 1000 = 75.0 m⁻¹
- k_sh = 1.0 (override)
- Am/V_eff = 1.0 × 75.0 = 75.0 m⁻¹ ✓

## Migration Strategy

### Phase 1: Update API (Backward Compatible)
1. Add new exposure config cases to switch statement
2. Keep old cases working temporarily
3. Add deprecation warnings to console

### Phase 2: Update UI
1. Update dropdown with new options
2. Add tooltip/illustration support
3. Update help text

### Phase 3: Update Tests
1. Update test suite with new cases
2. Add verification tests for each config
3. Update documentation

### Phase 4: Remove Old Cases
1. Remove deprecated exposure configs
2. Clean up old tests
3. Update all documentation

## Files to Modify

1. ✅ **This plan document** - `amv-max-implementation-plan.md`
2. **API** - `flexural_buckling_api.js` (~line 1593-1699)
3. **UI** - `index.html` (~line 515-524)
4. **Tests** - `test_amv_api.html`
5. **Documentation** - Update summary docs

## Expected Results

After implementation:
- Clear, simple dropdown matching Conlit approach
- Correct Am calculations for all cases
- Proper k_sh application logic
- Better user understanding with illustrations
- Comprehensive test coverage

## Notes

- The "left" orientation is arbitrary - represents "one side protected" concept
- For symmetrical sections (SHS), left/right doesn't matter
- For I/H sections, the h_side formula accounts for complex geometry
- Single-sided exposure never uses shadow factor (no shadowing effect)

## Validation Checklist

- [ ] All 6 exposure configs implemented
- [ ] Formulas match Conlit approach
- [ ] k_sh logic correct for each case
- [ ] Dropdown updated with clear labels
- [ ] Illustrations added (optional)
- [ ] Tests pass for all configs
- [ ] Documentation updated
- [ ] Manual verification with known values
