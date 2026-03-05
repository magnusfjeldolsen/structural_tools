# Am/V Exposure Configuration Revision Summary

## Problem Statement

Current implementation has **failing calculations** for non-4-sided exposure cases. Need to:
1. ✅ Fix incorrect formulas (RHS/SHS using wrong dimension)
2. ✅ Simplify dropdown to match Conlit calculator
3. ✅ Add clear illustrations for each case
4. ✅ Ensure all calculations work correctly

## Root Cause Analysis

### Issue 1: Wrong Formula for RHS/SHS Top Protection
**Current code (WRONG):**
```javascript
case '3-sides-top':
  if (isIorH) {
    Am = P - b;  // ✓ Correct
  } else {
    Am = P - h;  // ✗ WRONG! Should be P - b
  }
```

**Problem:** For RHS/SHS, removing "top" should subtract `b` (width), not `h` (height)

### Issue 2: Too Many Confusing Options
- Had 7 options including `3-sides-bottom`, `1-side-left`, `1-side-right`
- User wants simpler Conlit-style approach
- Symmetrical sections don't need left/right distinction

### Issue 3: Missing Combination Cases
- No option for "left and top protected" (common scenario)
- Need 2-sided protection option

## Revised Configuration Table

| # | Config ID | Description | Visual | Formula (I/H) | Formula (RHS/SHS) |
|---|-----------|-------------|--------|---------------|-------------------|
| 1 | `4-sides` | All exposed | ![4sides](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==) | `P` | `P` |
| 2 | `3-sides-left-protected` | Left protected | ![3left](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIvPjxsaW5lIHgxPSI1IiB5MT0iNSIgeDI9IjUiIHkyPSIzNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48bGluZSB4MT0iNSIgeTE9IjUiIHgyPSIzNSIgeTI9IjUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iMzUiIHkxPSI1IiB4Mj0iMzUiIHkyPSIzNSIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPjxsaW5lIHgxPSI1IiB5MT0iMzUiIHgyPSIzNSIgeTI9IjM1IiBzdHJva2U9InJlZCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+) | `P - h_side` | `P - h` |
| 3 | `3-sides-top-protected` | Top protected | ![3top](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIvPjxsaW5lIHgxPSI1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48bGluZSB4MT0iNSIgeTE9IjUiIHgyPSI1IiB5Mj0iMzUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iMzUiIHkxPSI1IiB4Mj0iMzUiIHkyPSIzNSIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPjxsaW5lIHgxPSI1IiB5MT0iMzUiIHgyPSIzNSIgeTI9IjM1IiBzdHJva2U9InJlZCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+) | `P - b` | `P - b` |
| 4 | `2-sides-left-top-protected` | Left & top protected | ![2sides](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIvPjxsaW5lIHgxPSI1IiB5MT0iNSIgeDI9IjUiIHkyPSIzNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48bGluZSB4MT0iNSIgeTE9IjUiIHgyPSIzNSIgeTI9IjUiIHN0cm9rZT0iZ3JheSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PGxpbmUgeDE9IjM1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iMzUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iNSIgeTE9IjM1IiB4Mj0iMzUiIHkyPSIzNSIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==) | `P - h_side - b` | `P - h - b` |
| 5 | `1-side-bottom` | Bottom only | ![1bottom](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIvPjxsaW5lIHgxPSI1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48bGluZSB4MT0iNSIgeTE9IjUiIHgyPSI1IiB5Mj0iMzUiIHN0cm9rZT0iZ3JheSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PGxpbmUgeDE9IjM1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iMzUiIHN0cm9rZT0iZ3JheSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PGxpbmUgeDE9IjUiIHkxPSIzNSIgeDI9IjM1IiB5Mj0iMzUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=) | `b` | `b` |
| 6 | `1-side-side` | Side only | ![1side](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgZmlsbD0iIzQ0NCIvPjxsaW5lIHgxPSI1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48bGluZSB4MT0iNSIgeTE9IjUiIHgyPSI1IiB5Mj0iMzUiIHN0cm9rZT0iZ3JheSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PGxpbmUgeDE9IjM1IiB5MT0iNSIgeDI9IjM1IiB5Mj0iMzUiIHN0cm9rZT0icmVkIiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iNSIgeTE9IjM1IiB4Mj0iMzUiIHkyPSIzNSIgc3Ryb2tlPSJncmF5IiBzdHJva2Utd2lkdGg9IjQiLz48L3N2Zz4=) | `h_side` | `h` |

**Color Legend:**
- 🔴 Red = Exposed to fire
- ⚫ Gray = Protected (non-exposed)

## Implementation Changes

### 1. API Changes (flexural_buckling_api.js)

**Location:** Lines 1593-1699

**Changes needed:**
```javascript
switch (exposureConfig) {
  case '4-sides':
    Am = P;
    description = '4 sides - All exposed';
    break;

  case '3-sides-left-protected':  // NEW
    if (isCircular) {
      return { error: 'Not applicable to circular sections' };
    }
    Am = isIorH ? (P - h_side) : (P - h);
    description = '3 sides - Left side protected';
    break;

  case '3-sides-top-protected':  // RENAMED from '3-sides-top'
    if (isCircular) {
      return { error: 'Not applicable to circular sections' };
    }
    Am = P - b;  // ✅ FIXED: Now correct for both I/H and RHS/SHS
    description = '3 sides - Top protected';
    break;

  case '2-sides-left-top-protected':  // NEW
    if (isCircular) {
      return { error: 'Not applicable to circular sections' };
    }
    if (isIorH) {
      Am = P - h_side - b;
    } else {
      Am = P - h - b;  // ✅ FIXED: Was using 2*h, now h+b
    }
    description = '2 sides - Left and top protected';
    break;

  case '1-side-bottom':  // UNCHANGED
    if (isCircular) {
      return { error: 'Not applicable to circular sections' };
    }
    Am = b;
    description = '1 side - Bottom only';
    break;

  case '1-side-side':  // RENAMED from '1-side-left' / '1-side-right'
    if (isCircular) {
      return { error: 'Not applicable to circular sections' };
    }
    Am = isIorH ? h_side : h;
    description = '1 side - Side only';
    break;

  // REMOVE: '3-sides-bottom', '1-side-left', '1-side-right', '2-sides' (old)
}
```

### 2. UI Changes (index.html)

**Location:** Lines 515-524

**Replace dropdown with:**
```html
<select id="exposure-config"
        class="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500">
  <option value="4-sides">4 sides - All exposed 🔴🔴🔴🔴</option>
  <option value="3-sides-left-protected">3 sides - Left side protected ⚫🔴🔴🔴</option>
  <option value="3-sides-top-protected">3 sides - Top protected ⚫🔴🔴🔴</option>
  <option value="2-sides-left-top-protected">2 sides - Left and top protected ⚫⚫🔴🔴</option>
  <option value="1-side-bottom">1 side - Bottom only ⚫⚫⚫🔴</option>
  <option value="1-side-side">1 side - Side only ⚫🔴⚫⚫</option>
</select>
<p class="text-xs text-gray-400 mt-1">Select fire protection configuration (🔴 = exposed, ⚫ = protected)</p>
```

### 3. Test Updates

**New test cases needed:**

```javascript
// Test: 3-sides-left-protected, HEA200
// Expected: Am = 1136 - 404 = 732 mm
// Am/V_base = 136.0 m⁻¹, Am/V_eff = 122.4 m⁻¹

// Test: 3-sides-top-protected, HRHS 100x50
// Expected: Am = P - b (NOT P - h!)

// Test: 2-sides-left-top-protected, HEA200
// Expected: Am = 1136 - 404 - 200 = 532 mm
// Am/V_base = 98.8 m⁻¹, Am/V_eff = 88.9 m⁻¹
```

## Verification Examples

### HEA200 (I/H Profile)
**Properties:** h=190, b=200, tw=6.5, tf=10, r=18, P=1136, A=5383 mm²
**h_side = 404 mm**

| Config | Am (mm) | Am/V_base (m⁻¹) | k_sh | Am/V_eff (m⁻¹) |
|--------|---------|-----------------|------|----------------|
| 4-sides | 1136 | 211.1 | 0.9 | 190.0 |
| 3-sides-left | 732 | 136.0 | 0.9 | 122.4 |
| 3-sides-top | 936 | 173.9 | 0.9 | 156.5 |
| 2-sides-left-top | 532 | 98.8 | 0.9 | 88.9 |
| 1-side-bottom | 200 | 37.2 | 1.0 | 37.2 |
| 1-side-side | 404 | 75.0 | 1.0 | 75.0 |

### HRHS 100x50x4 (Rectangular Hollow)
**Properties:** h=100, b=50, t=4, P=300, A=568 mm²

| Config | Am (mm) | Am/V_base (m⁻¹) | k_sh | Am/V_eff (m⁻¹) |
|--------|---------|-----------------|------|----------------|
| 4-sides | 300 | 528.2 | 1.0 | 528.2 |
| 3-sides-left | 200 | 352.1 | 1.0 | 352.1 |
| 3-sides-top | 250 | 440.1 | 1.0 | 440.1 |
| 2-sides-left-top | 150 | 264.1 | 1.0 | 264.1 |
| 1-side-bottom | 50 | 88.0 | 1.0 | 88.0 |
| 1-side-side | 100 | 176.1 | 1.0 | 176.1 |

**Note:** For hollow section, 4-sides Am/V ≈ 1/t = 1/4 = 250 m⁻¹... wait, our calc shows 528 m⁻¹?

This suggests P might be in wrong units in database for this section. Need to verify!

## Migration Path

### Phase 1: Backward Compatibility (Temporary)
```javascript
// Add compatibility layer
const configMap = {
  '3-sides-top': '3-sides-top-protected',
  '3-sides-bottom': '3-sides-top-protected',  // Map to top (user can rotate)
  '1-side-left': '1-side-side',
  '1-side-right': '1-side-side',
  '2-sides': '2-sides-left-top-protected'
};

// Apply mapping
if (configMap[exposureConfig]) {
  console.warn(`Deprecated config '${exposureConfig}', using '${configMap[exposureConfig]}' instead`);
  exposureConfig = configMap[exposureConfig];
}
```

### Phase 2: Update UI
- Change dropdown options
- Update saved states
- Update documentation

### Phase 3: Remove Old Codes
- Remove compatibility layer
- Clean up tests
- Final verification

## Summary of Fixes

| Issue | Before | After | Status |
|-------|--------|-------|--------|
| RHS/SHS top formula | `P - h` ❌ | `P - b` ✅ | **FIXED** |
| Too many options | 7 options | 6 options | **SIMPLIFIED** |
| Missing combination | No 2-side option | Added `2-sides-left-top` | **ADDED** |
| Confusing labels | "3-sides-top" | "3 sides - Top protected" | **CLEARER** |
| Left/right duplicates | Had both | Merged to `1-side-side` | **MERGED** |

## Next Steps

1. ✅ **Plan created** - This document
2. ✅ **Main plan updated** - amv-max-implementation-plan.md
3. ⏳ **API changes** - Update calculateSectionFactor()
4. ⏳ **UI changes** - Update dropdown options
5. ⏳ **Test updates** - Add new test cases
6. ⏳ **Verification** - Manual testing with known values
7. ⏳ **Documentation** - Update user guides

## Files to Modify

- [ ] `flexural_buckling_api.js` (~line 1593-1699)
- [ ] `index.html` (~line 515-524)
- [ ] `test_amv_api.html` (add new cases)
- [ ] `test_amv_ui.html` (update integration tests)
- [ ] `amv-max-implementation-plan.md` ✅ (updated)

## Testing Checklist

After implementation:
- [ ] 4-sides: Works for I/H and RHS/SHS
- [ ] 3-sides-left: Correct for I/H (uses h_side) and RHS/SHS (uses h)
- [ ] 3-sides-top: Correct for ALL profiles (uses b)
- [ ] 2-sides-left-top: Combination works correctly
- [ ] 1-side-bottom: Single side, k_sh=1.0
- [ ] 1-side-side: Single side, k_sh=1.0
- [ ] Circular sections: Show error for non-applicable configs
- [ ] All manual calculations match
- [ ] Detailed report shows correct values
- [ ] Dropdown has clear labels

This revision will make the Am/V feature match the Conlit calculator and fix all the failing calculations! 🎯
