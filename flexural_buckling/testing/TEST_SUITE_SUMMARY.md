# Test Suite Summary: Manual Calculations Verification

**Date**: 2026-03-04
**Purpose**: Validate Class 4 effective property calculations against manual SMath calculations
**Status**: ❌ **FAILED** - Critical bug identified

---

## Test Results

### Test Case 1: IPE450 S460 - Pure Compression
**Status**: ❌ FAILED

| Parameter | Manual (PDF) | Current Code | Error | Status |
|-----------|--------------|--------------|-------|--------|
| ε | 0.7148 | 0.7148 | 0.0% | ✅ |
| bp | 378.8 mm | 378.8 mm | 0.0% | ✅ |
| tp | 9.4 mm | 9.4 mm | 0.0% | ✅ |
| bp/tp | 40.298 | 40.298 | 0.0% | ✅ |
| λ_p | 0.9926 | 0.9926 | 0.0% | ✅ |
| **ρ** | **0.9516** | **0.6229** | **34.5%** | ❌ |
| b_eff | 360.5 mm | 235.9 mm | 34.5% | ❌ |
| A_removed | 172.3 mm² | 1342.9 mm² | 679.6% | ❌ |
| A_eff | 9709.7 mm² | 8539.1 mm² | -12.1% | ❌ |

**Impact**: Web removes **680% more material** than it should!

---

### Test Case 2: IPE240 S460 - Pure Compression
**Status**: ❌ FAILED

**Expected**: Class 4 but ρ ≈ 1.0 (no reduction, or possibly Class 3)
**Actual**: ρ = 0.7673, removes 2.75 cm²

---

### Test Case 3: CSHS100X3 S460
**Status**: ❌ FAILED

**Expected**: ρ = 1.0 (Class 4 but fully effective)
**Actual**: ρ = 0.7742, removes 2.47 cm²

The section is **just barely** Class 4:
- λ_p = 0.7225
- Limit for ρ = 1.0: λ_p ≤ 0.5 + sqrt(0.085 - 0.055×ψ) = 0.6732
- Since λ_p > 0.6732 but < 1.0, it should have ρ close to 1.0

---

### Test Case 4: CSHS180X4 S460
**Status**: ❌ FAILED

| Parameter | Manual (PDF) | Current Code | Error | Status |
|-----------|--------------|--------------|-------|--------|
| bp | 164 mm | 168 mm | 2.4% | ⚠️ |
| λ_p | 1.0099 | 1.3991 | 38.5% | ❌ |
| ρ | 0.9363 | 0.6024 | 35.7% | ❌ |
| A_removed (per side) | 41.8 mm² | 267.2 mm² | 539% | ❌ |
| A_removed (total) | 167.2 mm² | 1068.9 mm² | 539% | ❌ |
| A_eff | 2607.8 mm² | 1706.1 mm² | -34.6% | ❌ |

**Impact**: Section capacity **under-estimated by 35%**!

---

## Root Cause Analysis

### The Bug

The code uses **two different lambda definitions** inconsistently:

1. **Classification** (line ~873 in flexural_buckling_api.js):
   ```javascript
   const lambda_p_bar = slenderness / limit_class3;  // EN 1993-1-1
   // where limit_class3 = 42 × ε for internal, ψ=1.0
   ```

2. **Reduction factor** (line ~878):
   ```javascript
   rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar ** 2);  // EN 1993-1-5 formula
   ```

**The problem**: The rho formula is from EN 1993-1-5, which expects:
```javascript
lambda_p = (c/t) / (28.4 × ε × sqrt(k_σ))  // EN 1993-1-5
// where k_σ = 4.0 for internal, ψ=1.0
```

### Why This Matters

For IPE450 web (c/t = 40.298, ε = 0.7148):

**EN 1993-1-1 lambda:**
```
lambda_p_bar = 40.298 / (42 × 0.7148) = 1.3424
```

**EN 1993-1-5 lambda:**
```
lambda_p = 40.298 / (28.4 × 0.7148 × sqrt(4)) = 0.9926
```

**Using wrong lambda in rho formula:**
```
rho_wrong = (1.3424 - 0.22) / 1.3424² = 0.6229  ❌
rho_correct = (0.9926 - 0.22) / 0.9926² = 0.9516  ✅
```

Result: **34.5% error in reduction factor!**

---

## Impact on Capacity

| Section | Correct A_eff | Current A_eff | Capacity Loss |
|---------|---------------|---------------|---------------|
| IPE450 S460 | 9709.7 mm² | 8539.1 mm² | **-12.1%** |
| CSHS180X4 S460 | 2607.8 mm² | 1706.1 mm² | **-34.6%** |
| CSHS100X3 S460 | 1139 mm² (full) | 891.4 mm² | **-21.7%** |

**This bug causes significant under-estimation of column capacity for Class 4 sections.**

---

## The Fix

### Current Code (WRONG)
```javascript
// In calculateClass4EffectiveProperties()
const limit_class3 = element.limit_class3;  // From EN 1993-1-1
const lambda_p_bar = slenderness / limit_class3;
const rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar ** 2);
```

### Corrected Code
```javascript
// Step 1: Get buckling coefficient from EN 1993-1-5 Table 4.1
const k_sigma = getBucklingCoefficient(elementType, psi);

// Step 2: Calculate lambda_p using EN 1993-1-5 formula
const epsilon = Math.sqrt(235 / fy);
const lambda_p = slenderness / (28.4 * epsilon * Math.sqrt(k_sigma));

// Step 3: Calculate rho using EN 1993-1-5 formula
let rho;
if (elementType === 'internal') {
  rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p ** 2);
} else if (elementType === 'outstand') {
  rho = (lambda_p - 0.188) / (lambda_p ** 2);
}
rho = Math.min(Math.max(rho, 0), 1.0);
```

### Helper Function Needed
```javascript
function getBucklingCoefficient(elementType, psi) {
  // EN 1993-1-5 Table 4.1
  if (elementType === 'internal') {
    if (psi === 1.0) {
      return 4.0;
    } else if (psi >= 0) {
      return 8.2 / (1.05 + psi);
    } else {
      return 7.81 - 6.29*psi + 9.78*psi*psi;
    }
  } else if (elementType === 'outstand') {
    if (psi >= 0) {
      return 0.43;
    } else {
      return 0.57 - 0.21*psi + 0.07*psi*psi;
    }
  } else if (elementType === 'circular') {
    // Approximate as internal element
    return 4.0;
  }
  return 4.0;  // Default fallback
}
```

---

## Verification After Fix

Once the fix is implemented, re-run:
```bash
node flexural_buckling/testing/test_manual_calculations_verification.js
```

**Expected result**: All 4 test cases should **PASS** with <1% error tolerance.

---

## Files Affected

1. **flexural_buckling_api.js** - Main calculation file
   - Line ~870-885: `calculateClass4EffectiveProperties()` function
   - Need to add `getBucklingCoefficient()` helper function

2. **Test files** - Should pass after fix
   - `testing/test_manual_calculations_verification.js`
   - `testing/test_rho_formula_verification.js`
   - `testing/test_lambda_formula_investigation.js`

---

## References

- **EN 1993-1-1 Table 5.2**: Classification limits (for determining IF section is Class 4)
- **EN 1993-1-5 Section 4.4**: Effective width formula (for calculating HOW MUCH reduction)
- **EN 1993-1-5 Table 4.1**: Buckling coefficients k_σ for different stress distributions
- **Manual calculations**: `flexural_buckling/smath/manual_effective_sections_calculations.pdf`

---

## Action Plan

- [x] Create test suite with manual calculations
- [x] Identify the bug (lambda formula mismatch)
- [ ] Implement `getBucklingCoefficient()` function
- [ ] Update `calculateClass4EffectiveProperties()` to use EN 1993-1-5
- [ ] Re-run tests → should all pass
- [ ] Test on full database of sections
- [ ] Update documentation with correct references

---

## Priority: CRITICAL ⚠️

This bug affects **all Class 4 sections** and causes **10-35% under-estimation** of capacity.

**DO NOT use the flexural buckling module in production until this is fixed.**
