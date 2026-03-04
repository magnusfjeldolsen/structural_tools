# PDF Manual Calculations vs. Current Implementation

**Date**: 2026-03-04
**Reference**: `smath/manual_effective_sections_calculations.pdf`

---

## 🔍 Key Differences Found

### 1. Lambda Calculation Formula ⚠️ CRITICAL

**PDF Manual (CORRECT - EN 1993-1-5)**:
```
λ_p = (c/t) / (28.4 × ε × sqrt(k_σ))

Where:
  k_σ = 4.0 (for internal elements, ψ = 1.0)
  ε = sqrt(235 / fy)
```

**Current Code (WRONG - mixes standards)**:
```javascript
lambda_p_bar = (c/t) / (42 × ε)  // EN 1993-1-1 limit

Where:
  limit_class3 = 42 × ε  // This is classification limit, not for rho!
```

**Impact**: Lambda values differ by ~35%, causing rho to be wrong by 30-35%.

---

### 2. Buckling Coefficient k_σ

**PDF Manual**:
- Uses k_σ = 4.0 for internal elements in pure compression (ψ = 1.0)
- From EN 1993-1-5 Table 4.1 (bottom row)

**Current Code**:
- Does NOT use k_σ at all
- Missing `getBucklingCoefficient()` function

**Fix**: Add function to calculate k_σ based on element type and ψ.

---

### 3. Example: IPE450 Web

| Parameter | PDF Manual | Current Code | Error |
|-----------|-----------|--------------|-------|
| c/t | 40.298 | 40.298 | ✅ 0% |
| ε | 0.7148 | 0.7148 | ✅ 0% |
| k_σ | 4.0 | (not used) | ❌ Missing |
| **λ_p** | **0.9926** | **1.3424** | ❌ **35%** |
| **ρ** | **0.9516** | **0.6229** | ❌ **35%** |
| **A_removed** | **172 mm²** | **1343 mm²** | ❌ **680%** |

---

### 4. Example: CSHS180X4

| Parameter | PDF Manual | Current Code | Error |
|-----------|-----------|--------------|-------|
| bp | 164 mm | 168 mm | ⚠️ 2.4% |
| c/t | 41.0 | 42.0 | ⚠️ 2.4% |
| λ_p | 1.0099 | 1.3991 | ❌ 39% |
| ρ | 0.9363 | 0.6024 | ❌ 36% |
| A_removed (total) | 167 mm² | 1069 mm² | ❌ 539% |

**Note**: Small error in `bp` calculation (2.4%) compounds with lambda error.

---

## ✅ What's Already Correct

### 1. Section Geometry
- Web height: `bp = h - 2×tf - 2×r` ✅
- Web thickness: `tp = tw` ✅ (PDF was initially wrong with tw/2)
- Hollow section flat width: `bp = b - 2×ro` ✅

### 2. Classification
- Uses EN 1993-1-1 Table 5.2 correctly ✅
- Determines section class properly ✅
- Identifies Class 4 elements correctly ✅

### 3. Rho Formula Structure
- Formula structure is correct: `rho = (lambda - 0.055(3+psi)) / lambda²` ✅
- Just uses wrong lambda value ❌

### 4. Robustness Features
- Rho capping to [0, 1.0] ✅
- Fallback for missing metadata ✅
- Safety limits on inertia reduction ✅

---

## 🔧 What Needs to Change

### Change 1: Add Buckling Coefficient Function

**Add new function** `getBucklingCoefficient(elementType, psi)`:
- Returns k_σ from EN 1993-1-5 Tables 4.1 and 4.2
- Handles internal, outstand, and circular elements
- Includes formulas for bending (ψ < 0) as placeholders

### Change 2: Update Lambda Calculation

**Replace**:
```javascript
const lambda_p_bar = slenderness / limit_class3;
```

**With**:
```javascript
const epsilon = Math.sqrt(235 / fy);
const k_sigma = getBucklingCoefficient(elementType, psi);
const lambda_p = slenderness / (28.4 * epsilon * Math.sqrt(k_sigma));
```

### Change 3: Pass `fy` Parameter

**Update function signature**:
```javascript
function calculateClass4EffectiveProperties(section, classification, profileType, fy)
```

**Why**: Need yield strength to calculate epsilon.

### Change 4: Update All Callers

Find and update all calls to `calculateClass4EffectiveProperties()` to include `fy`.

---

## 📊 Validation Data from PDF

### IPE450 S460 (Pure Compression)
```
Input:
  h = 450 mm, b = 190 mm, tw = 9.4 mm, tf = 14.6 mm, r = 21 mm
  fy = 460 MPa, ε = 0.7148

Web calculation:
  bp = 378.8 mm, tp = 9.4 mm
  c/t = 40.2979
  ψ = 1.0, k_σ = 4.0

Expected output:
  λ_p = 0.9926
  ρ = 0.9516
  b_eff = 360.4747 mm
  b_removed = 18.3253 mm
  A_removed = 172.2578 mm²
  A_gross = 9882 mm²
  A_eff = 9709.7422 mm²
```

### CSHS100X3 S460
```
Input:
  b = 100 mm, t = 3 mm, ro = 6 mm
  fy = 460 MPa

Expected output:
  bp = 88 mm
  λ_p = 0.7225
  ρ = 1.0 (fully effective - just barely Class 4)
  A_removed = 0 mm²
```

### CSHS180X4 S460
```
Input:
  b = 180 mm, t = 4 mm, ro = 8 mm
  fy = 460 MPa

Expected output:
  bp = 164 mm
  λ_p = 1.0099
  ρ = 0.9363
  A_removed (per side) = 41.8097 mm²
  A_removed (total) = 167.2387 mm²
  A_gross = 2775 mm²
  A_eff = 2607.7613 mm²
```

---

## 🎯 Implementation Plan

See: **`plans/FIX_CLASS4_LAMBDA_FORMULA_PLAN.md`**

This plan provides:
- Step-by-step implementation instructions
- Complete code snippets
- Robustness checks to maintain
- Testing criteria
- Expected results

**Estimated effort**: 2-3 hours

---

## ✅ Success Criteria

After implementation, run:
```bash
cd flexural_buckling/testing
node test_manual_calculations_verification.js
```

All 4 tests should **PASS** with < 1% error:
- [x] IPE450 S460
- [x] IPE240 S460
- [x] CSHS100X3 S460
- [x] CSHS180X4 S460

---

**Summary**: The fix is straightforward but critical. The code structure is good, just needs to use the correct lambda formula from EN 1993-1-5 instead of EN 1993-1-1.
