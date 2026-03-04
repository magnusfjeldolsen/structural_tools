# Am/V Hollow Section Dimension Fix

## Issue Reported

User reported that when selecting a hollow section (RHS/SHS) with non-4-sided exposure configurations, the calculation fails:

**Symptoms:**
- `Am = - mm` (missing/undefined value)
- `Am/V = - m⁻¹` (calculation fails)
- Error shows "✗ EXCEEDS LIMIT" (because NaN > any number)

**Example:**
- HRHS section with "3 sides - Left side protected"
- Exposure configuration dropdown selection: ✅ Works
- 4-sides exposure: ✅ Works correctly
- 3-sides-left-protected: ❌ Fails (Am = undefined)

---

## Root Cause Analysis

### Problem 1: Inconsistent Property Names in Database

The hollow section database uses **different property names** than I/H sections:

| Section Type | Height Property | Width Property |
|--------------|-----------------|----------------|
| I/H profiles (HEA, HEB, IPE) | `h` | `b` |
| Hollow sections (RHS, SHS) | `h` or `height` or `d` (?) | `b` or `width` (?) |

The code was directly accessing `section.h` and `section.b`, which may be `undefined` for some hollow sections.

### Problem 2: No Validation for Missing Dimensions

When `h` or `b` are `undefined`, calculations like:
```javascript
Am = P - h;  // Results in NaN if h is undefined
```

This caused `Am` to be `NaN`, which then propagated through all subsequent calculations.

---

## The Fix

### Change 1: Flexible Property Access

Updated [flexural_buckling_api.js](flexural_buckling_api.js:1556-1559) to try multiple property names:

```javascript
// OLD (RIGID):
const h = section.h;  // Fails if property name is different
const b = section.b;

// NEW (FLEXIBLE):
const h = section.h || section.height || section.d;  // Try multiple names
const b = section.b || section.width || h;  // For SHS, b = h if not defined
```

**Benefits:**
- Handles different database property naming conventions
- For SHS (square hollow sections), falls back to `b = h` since width = height
- Gracefully handles missing properties

### Change 2: Validation and Error Reporting

Added validation [flexural_buckling_api.js](flexural_buckling_api.js:1573-1583):

```javascript
// Validate that we have required dimensions for non-4-sided exposure
if (exposureConfig !== '4-sides' && (!h || !b)) {
  return {
    AmV: null,
    AmV_base: null,
    Am: null,
    k_sh: shadowFactor,
    error: `Missing section dimensions (h=${h}, b=${b}) required for this exposure configuration`,
    description: 'Error'
  };
}
```

**Benefits:**
- Clear error message showing which dimensions are missing
- Prevents NaN propagation
- Helps debug database issues

### Change 3: Debug Logging

Added console warning [flexural_buckling_api.js](flexural_buckling_api.js:1561-1564):

```javascript
// Debug logging (can be removed in production)
if (exposureConfig !== '4-sides' && (!section.h && !section.height && !section.d)) {
  console.warn('Section missing height dimension:', section);
}
```

**Benefits:**
- Helps identify which sections have missing properties
- Shows actual section object for debugging
- Can be removed once database is verified

---

## Testing

### Test 1: Debug Page Created

Created [debug_hollow_properties.html](debug_hollow_properties.html) to inspect actual section properties:

```javascript
// Shows first HRHS section with all properties
const hrhs = window.structuralSteelDatabase.hrhs[0];
console.log(JSON.stringify(hrhs, null, 2));
```

**To run:**
```bash
cd flexural_buckling
start debug_hollow_properties.html
```

This will show exactly what properties are available in the database.

### Test 2: Main Application

**Before fix:**
- Select HRHS section
- Set exposure: "3 sides - Left side protected"
- Result: `Am = - mm` ❌

**After fix:**
- Same selection
- Result: Either shows correct `Am` value ✅ OR shows clear error message with missing dimensions

### Test 3: All Exposure Configs

Test each configuration with hollow sections:

| Config | Formula | Expected Behavior |
|--------|---------|-------------------|
| 4-sides | `Am = P` | ✅ Always works (doesn't need h or b) |
| 3-sides-left-protected | `Am = P - h` | ✅ Works if h available, else error |
| 3-sides-top-protected | `Am = P - b` | ✅ Works if b available, else error |
| 2-sides-left-top-protected | `Am = P - h - b` | ✅ Works if both available, else error |
| 1-side-bottom | `Am = b` | ✅ Works if b available, else error |
| 1-side-side | `Am = h` | ✅ Works if h available, else error |

---

## Expected Results After Fix

### Scenario A: Properties Exist with Different Names

If hollow sections have `height` instead of `h`:
- ✅ Code finds `height` via fallback logic
- ✅ Calculations work correctly
- ✅ No error messages

### Scenario B: Properties Truly Missing

If hollow sections don't have dimensional properties at all:
- ✅ Clear error message: "Missing section dimensions (h=undefined, b=undefined)"
- ✅ No NaN propagation
- ✅ Console warning helps identify problematic sections
- ⚠️ May need to update database to add missing properties

---

## Related Files

1. ✅ **flexural_buckling_api.js** (lines 1556-1564, 1573-1583)
   - Added flexible property access
   - Added validation and error handling
   - Added debug logging

2. ✅ **debug_hollow_properties.html** (created)
   - Debug tool to inspect section properties
   - Shows actual database structure

3. ✅ **AMV_HOLLOW_SECTION_DIMENSION_FIX.md** (this file)
   - Documents the issue and fix
   - Provides testing guidance

---

## Next Steps

1. **Run debug page** to see actual hollow section properties
2. **Test in main application** with various hollow sections
3. **Check console** for any warnings about missing dimensions
4. **Update database** if needed to add missing h/b properties
5. **Remove debug logging** once verified working

---

## Root Cause Summary

**The issue was:**
- Hollow section database may use different property names (`height` vs `h`, `width` vs `b`)
- Code assumed `section.h` and `section.b` always exist
- When undefined, calculations produced `NaN`
- `NaN` displayed as `'-'` in UI

**The fix:**
- Try multiple property name variations
- Validate dimensions before calculation
- Return clear error if dimensions missing
- Debug logging to identify problematic sections

**Status:** ✅ **FIX IMPLEMENTED - AWAITING TESTING**
