# CRITICAL BUG: Wrong Lambda Formula for Effective Properties

**Date**: 2026-03-04
**Severity**: HIGH - Affects all Class 4 calculations
**Status**: Identified, fix pending

---

## Summary

Our current implementation uses **EN 1993-1-1** formula for both:
1. Classification (determining IF section is Class 4)
2. Effective properties (calculating reduction factor ρ)

**This is WRONG!** We should use:
1. **EN 1993-1-1** for classification ✓ (currently correct)
2. **EN 1993-1-5** for effective properties ✗ (currently incorrect)

---

## The Problem

### Current Code (WRONG)
```javascript
const limit_class3 = 42 * epsilon;  // EN 1993-1-1 Table 5.2
const lambda_p_bar = (c / t) / limit_class3;
const rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar ** 2);
```

### Correct Formula (EN 1993-1-5)
```javascript
const k_sigma = 4.0;  // From EN 1993-1-5 Table 4.1 (for ψ=1.0, internal)
const lambda_p = (c / t) / (28.4 * epsilon * Math.sqrt(k_sigma));
const rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p ** 2);
```

---

## Example: IPE450 Web

**Geometry:**
- h = 450 mm, tw = 9.4 mm, tf = 14.6 mm, r = 21 mm
- bp = h - 2×tf - 2×r = 378.8 mm
- c/t = 378.8 / 9.4 = 40.298
- ε = sqrt(235/460) = 0.7148

**Classification (EN 1993-1-1):** ✓ CORRECT
```
limit_class3 = 42 × ε = 30.02
c/t = 40.298 > 30.02
→ Class 4 ✓
```

**Effective Properties:**

| Method | Lambda | Rho | A_removed | Status |
|--------|--------|-----|-----------|--------|
| **PDF Manual (EN 1993-1-5)** | λ_p = 0.9926 | ρ = 0.9516 | 172.3 mm² | ✓ CORRECT |
| **Current Code (EN 1993-1-1)** | λ_p_bar = 1.3424 | ρ = 0.6229 | 1342.9 mm² | ✗ WRONG! |

**Error**: Current code removes **779% more area** than it should!

---

## Impact

### IPE450 S460
- **Correct**: A_eff = 9709.7 mm² (1.7% reduction)
- **Current**: A_eff = 8539.1 mm² (13.6% reduction)
- **Error**: **-12.0% area** → Significant under-capacity!

### CSHS180X4 S460
- **Correct**: A_removed = 167.2 mm² (ρ = 0.9363)
- **Current**: A_removed = 1068.9 mm² (ρ = 0.6024)
- **Error**: **539% over-removal** → Major under-capacity!

### CSHS100X3 S460
- **Correct**: ρ = 1.0 (no reduction despite Class 4)
- **Current**: ρ = 0.7742 (removes 2.47 cm²)
- **Error**: Should be fully effective!

---

## Root Cause

The code uses `limit_class3` from classification to calculate `lambda_p_bar` for reduction factor.

**This mixes two different standards:**
- EN 1993-1-1: For **classification** (determines section class)
- EN 1993-1-5: For **effective widths** (determines reduction factor)

---

## The Fix

### Step 1: Add k_sigma calculation
```javascript
function getBucklingCoefficient(elementType, psi) {
  // EN 1993-1-5 Table 4.1
  if (elementType === 'internal') {
    if (psi === 1.0) return 4.0;
    if (psi >= 0) return 8.2 / (1.05 + psi);
    return 7.81 - 6.29*psi + 9.78*psi**2;
  } else if (elementType === 'outstand') {
    return 0.43;  // For compression
  } else if (elementType === 'circular') {
    return 4.0;  // Approx for circular
  }
}
```

### Step 2: Calculate lambda_p using EN 1993-1-5
```javascript
const k_sigma = getBucklingCoefficient(elementType, psi);
const lambda_p = (element.c / element.t) / (28.4 * epsilon * Math.sqrt(k_sigma));
```

### Step 3: Calculate rho from lambda_p
```javascript
let rho;
if (elementType === 'internal') {
  rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p ** 2);
} else if (elementType === 'outstand') {
  rho = (lambda_p - 0.188) / (lambda_p ** 2);
} else if (elementType === 'circular') {
  rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p ** 2);
}
rho = Math.min(Math.max(rho, 0), 1.0);
```

---

## Testing

Once fixed, all manual calculation tests should pass:

| Test Case | Expected ρ | Expected A_removed |
|-----------|------------|-------------------|
| IPE450 S460 | 0.9516 | 172.3 mm² |
| IPE240 S460 | 1.0 (or Class 3) | 0 mm² |
| CSHS100X3 S460 | 1.0 | 0 mm² |
| CSHS180X4 S460 | 0.9363 | 167.2 mm² |

---

## References

- **EN 1993-1-1 Section 5.5 & Table 5.2**: Classification of cross-sections
- **EN 1993-1-5 Section 4.4 & Table 4.1**: Effective widths of plates due to local buckling
- **Manual calculations**: `flexural_buckling/smath/manual_effective_sections_calculations.pdf`

---

## Action Items

1. ✅ Identify the bug (DONE)
2. ⏳ Implement `getBucklingCoefficient()` function
3. ⏳ Update `calculateClass4EffectiveProperties()` to use EN 1993-1-5 lambda
4. ⏳ Rerun all tests - should pass within 1% tolerance
5. ⏳ Test on real sections from database
6. ⏳ Update documentation

---

## Priority

**CRITICAL** - This affects **all Class 4 sections** and causes significant errors in capacity calculations (10-50% under-estimation in some cases).

Should be fixed before any production use of the flexural buckling module.
