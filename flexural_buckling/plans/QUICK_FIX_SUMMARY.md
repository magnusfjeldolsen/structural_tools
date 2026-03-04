# Quick Fix Summary - Class 4 Lambda Formula

**File to modify**: `flexural_buckling_api.js`
**Lines to change**: ~720-884 (main changes)
**Estimated time**: 2-3 hours

---

## 🎯 The Problem (One Sentence)

Code uses EN 1993-1-1 lambda for classification but then incorrectly applies it to EN 1993-1-5 rho formula, causing 10-35% capacity under-estimation.

---

## 🔧 The Fix (Three Steps)

### 1. Add Helper Function (~line 720)
```javascript
function getBucklingCoefficient(elementType, psi) {
  if (elementType === 'internal') {
    if (psi === 1.0) return 4.0;  // Pure compression
    else if (psi > 0) return 8.2 / (1.05 + psi);
    else return 7.81 - 6.29*psi + 9.78*psi*psi;  // Bending
  } else if (elementType === 'outstand') {
    if (psi >= 0) return 0.43;
    else return 0.57 - 0.21*psi + 0.07*psi*psi;
  } else if (elementType === 'circular') {
    return 4.0;  // Approximate
  }
  return 4.0;  // Fallback
}
```

### 2. Replace Lines 870-884
```javascript
// OLD (WRONG)
const lambda_p_bar = slenderness / limit_class3;
let rho;
if (elementType === 'internal') {
  rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar * lambda_p_bar);
}
rho = Math.min(Math.max(rho, 0), 1.0);

// NEW (CORRECT)
const epsilon = Math.sqrt(235 / fy);
const k_sigma = getBucklingCoefficient(elementType, psi);
const lambda_p = slenderness / (28.4 * epsilon * Math.sqrt(k_sigma));

let rho;
if (elementType === 'internal') {
  rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p * lambda_p);
} else if (elementType === 'outstand') {
  rho = (lambda_p - 0.188) / (lambda_p * lambda_p);
} else if (elementType === 'circular') {
  rho = (lambda_p - 0.055 * (3 + psi)) / (lambda_p * lambda_p);
}
rho = Math.min(Math.max(rho, 0), 1.0);  // KEEP capping!
```

### 3. Update Function Signature (line 838)
```javascript
// OLD
function calculateClass4EffectiveProperties(section, classification, profileType)

// NEW
function calculateClass4EffectiveProperties(section, classification, profileType, fy)
```

And update all callers to pass `fy`.

---

## ✅ Verify Fix

```bash
cd flexural_buckling/testing
node test_manual_calculations_verification.js
```

Expected: **All 4 tests PASS** ✓

---

## 📋 Full Details

See: **`FIX_CLASS4_LAMBDA_FORMULA_PLAN.md`** for:
- Complete implementation steps
- Edge case handling
- Code review checklist
- Robustness requirements

See: **`PDF_VS_CODE_COMPARISON.md`** for:
- Detailed comparison of manual vs. code
- Validation data
- Examples with expected results

---

**Ready to implement!** 🚀
