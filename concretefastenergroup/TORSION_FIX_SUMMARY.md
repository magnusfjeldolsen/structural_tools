# Torsion Force Calculation Fix - Summary

**Branch:** `fixtorsion`
**Date:** 2026-01-15
**Status:** ✅ All tests passing

---

## Problem Description

The torsion force calculations in the concrete fastener group module had two main issues:

1. **Incorrect force calculation formula** - The implementation wasn't following the technical specification
2. **Incorrect arrow visualization** - The green resisting force arrows weren't displaying correctly due to Y-axis handling

---

## Technical Notes Reference

All fixes are based on [technical-notes/torsion.md](technical-notes/torsion.md), which specifies:

### Correct Formula (for +Mz, counter-clockwise):
```
F_i = (Mz × r_i) / Σ(r_j²)
Fx_i = -F_i × (y_i / r_i)
Fy_i = +F_i × (x_i / r_i)
```

Where:
- `r_i = sqrt(x_i² + y_i²)` - distance from centroid
- `Σ(r_j²)` - sum of squared distances for all fasteners
- These are **resisting forces** (oppose applied moment)

### Verification Requirements:
1. **Perpendicularity**: `Fx_i × x_i + Fy_i × y_i = 0`
2. **Force equilibrium**: `Σ(Fx_i) = 0` and `Σ(Fy_i) = 0`
3. **Moment recovery**: `Σ(x_i × Fy_i - y_i × Fx_i) = Mz`

---

## Changes Made

### 1. Python Calculation Fix

**File:** `concretefastenergroup/codes/python/fastener_design/calculations/planar_bending.py`

#### Before (WRONG):
```python
# Lines 387-396 (old)
Mz_Nmm = Mz_total * 1e6
Vx_torsion = -Mz_Nmm * dy / sum_r_squared / 1000.0
Vy_torsion = -Mz_Nmm * dx / sum_r_squared / 1000.0
```

**Issues:**
- Missing force magnitude calculation `F_i = (Mz * r_i) / Σr²`
- Wrong formula structure
- Incorrect sign handling for "resisting forces"

#### After (CORRECT):
```python
# Lines 391-411 (new)
Mz_Nmm = Mz_total * 1e6  # kNm → Nmm

# Distance from centroid
r_i = (dx**2 + dy**2)**0.5  # mm

if r_i > 0:
    # Torsional force magnitude at this fastener
    F_i_N = (Mz_Nmm * r_i) / sum_r_squared  # N

    # Force components (for +Mz, CCW)
    Vx_torsion = -F_i_N * (dy / r_i) / 1000.0  # kN
    Vy_torsion = +F_i_N * (dx / r_i) / 1000.0  # kN
else:
    Vx_torsion = 0.0
    Vy_torsion = 0.0
```

**Changes:**
1. Calculate `r_i` for each fastener
2. Calculate force magnitude `F_i = (Mz * r_i) / Σr²`
3. Resolve into components using correct signs
4. Handle edge case where fastener is at centroid

### 2. Verification Function Added

**File:** `concretefastenergroup/codes/python/fastener_design/calculations/planar_bending.py`

Added new function `verify_torsion_forces()` (lines 203-291) that implements all three verification checks from technical notes section 10.

### 3. Visualization Fix

**File:** `concretefastenergroup/script.js`

#### Before (WRONG):
```javascript
// Lines 1513-1514 (old)
const dx = (-Vx_direct + Vx_torsion) * arrowScale;
const dy = (-Vy_direct + Vy_torsion) * arrowScale;
```

**Issue:** Missing Y-axis inversion for canvas coordinates (canvas Y increases downward)

#### After (CORRECT):
```javascript
// Lines 1513-1516 (new)
const totalVx = -Vx_direct + Vx_torsion;  // World coordinates
const totalVy = -Vy_direct + Vy_torsion;  // World coordinates
const dx = totalVx * arrowScale;          // Canvas X (same as world X)
const dy = -totalVy * arrowScale;         // Canvas Y (inverted from world Y)
```

**Changes:**
1. Separate world coordinate calculation from canvas coordinate conversion
2. Add explicit Y-axis negation for canvas rendering
3. Clearer comments explaining coordinate system transformation

### 4. Test Script Created

**File:** `concretefastenergroup/test_torsion_verification.py`

Comprehensive test using the example from technical notes:
- Square pattern at (±50, ±50) mm
- Applied Mz = 10 kNm (CCW)
- Expected forces: ±25 kN in X and Y components
- Validates all three verification checks

**Test Results:** ✅ ALL TESTS PASSED
```
================================================================================
ALL TESTS PASSED - Implementation matches technical notes!
================================================================================

1. Perpendicularity Check: PASSED
2. Force Equilibrium Check: PASSED
   Sum(Fx) = 0.000000 kN
   Sum(Fy) = 0.000000 kN
3. Moment Recovery Check: PASSED
   Applied Mz:    10.000 kNm
   Recovered Mz:  10.000 kNm
```

---

## Verification

### Run Tests:
```bash
cd concretefastenergroup
python test_torsion_verification.py
```

### Visual Test:
1. Open `index.html` in browser
2. Create a square fastener pattern (±50, ±50 mm)
3. Apply Mz = 10 kNm
4. Verify:
   - ✅ Green arrows are perpendicular to radius from centroid
   - ✅ Green arrows rotate counter-clockwise around centroid
   - ✅ Force magnitudes shown in table match ±25 kN

---

## Expected Results

For square pattern at (±50, ±50) mm with Mz = +10 kNm (CCW):

| x (mm) | y (mm) | Fx (kN) | Fy (kN) | Arrow Direction |
|--------|--------|---------|---------|-----------------|
|  50    |  50    | -25.0   | +25.0   | NW (↖)         |
| -50    |  50    | -25.0   | -25.0   | SW (↙)         |
| -50    | -50    | +25.0   | -25.0   | SE (↘)         |
|  50    | -50    | +25.0   | +25.0   | NE (↗)         |

**Visual check:** All arrows should form a counter-clockwise rotation pattern.

---

## Files Modified

1. ✅ `concretefastenergroup/codes/python/fastener_design/calculations/planar_bending.py`
   - Fixed torsion force calculation (lines 377-411)
   - Added verification function (lines 203-291)

2. ✅ `concretefastenergroup/script.js`
   - Fixed arrow visualization Y-axis handling (lines 1510-1519)

3. ✅ `concretefastenergroup/test_torsion_verification.py` (NEW)
   - Comprehensive test suite

4. ✅ `concretefastenergroup/technical-notes/torsion.md` (ALREADY ADDED)
   - Reference specification document

---

## Next Steps

1. ✅ Test in browser - verify visual appearance
2. ⬜ Merge `fixtorsion` branch to `master`
3. ⬜ Deploy to GitHub Pages

---

## References

- Technical specification: [technical-notes/torsion.md](technical-notes/torsion.md)
- Test script: [test_torsion_verification.py](test_torsion_verification.py)
- Python implementation: [planar_bending.py:377-411](codes/python/fastener_design/calculations/planar_bending.py#L377-L411)
- Visualization: [script.js:1510-1519](script.js#L1510-L1519)
