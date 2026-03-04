# Test Results Analysis - Manual Calculations Verification

**Date**: 2026-03-04
**Reference**: `flexural_buckling/smath/manual_effective_sections_calculations.pdf`

---

## Executive Summary

All 4 test cases **FAILED** due to discrepancies between manual calculations and current implementation.

**Root cause identified**: The thickness parameter `t` used in slenderness calculations appears to be different between the manual and the implementation.

---

## Test Case 1: IPE450 - Pure Compression

### Issue: Wrong web thickness for classification

**Manual calculation (from PDF)**:
```
tp = tw × 0.5 = 9.4 × 0.5 = 4.7 mm
bp / tp = 378.8 / 4.7 = 80.5957
λ_p_bar = 1.9852
ρ = 0.4898
```

**Current implementation**:
```
tp = tw = 9.4 mm ❌
bp / tp = 378.8 / 9.4 = 40.30
λ_p_bar = 1.3424 ❌ (32% error)
ρ = 0.6229 ❌ (27% error)
```

### Analysis

The manual calculation uses **half the web thickness** (`tp = 0.5 × tw`) for the slenderness ratio.

**Why?** This is likely related to the **stress distribution** in the web. In EN 1993-1-5, for webs in compression, the effective thickness used for classification might be different from the actual thickness.

**Need to investigate**:
- Is this a Eurocode requirement?
- Is this specific to webs vs. flanges?
- Check EN 1993-1-1 Table 5.2 (sheet 1 of 3, note 2)

### Impact

- **A_removed**: Manual = 1816.8 mm², Current = 1342.9 mm² (26% error)
- **A_eff**: Manual = 8065.2 mm², Current = 8539.1 mm² (5.9% error)

---

## Test Case 2: IPE240 - Pure Compression

### Expected: Class 4 but ρ = 1.0 (no reduction)

**Current result**: ρ = 0.7673, A_removed = 2.75 cm² ❌

### Analysis

The manual calculation expects this section to be **Class 4** but with **ρ = 1.0**, meaning it's just barely over the Class 3 limit but the reduction factor formula yields 1.0 (fully effective).

This happens when:
```
λ_p_bar ≤ 0.5 + sqrt(0.085 - 0.055×ψ) = 0.6732 (for ψ=1.0)
```

In this range, the ρ formula gives ρ ≥ 1.0, which is then capped at 1.0.

**Current implementation** calculates a different λ_p_bar due to the thickness issue, so it doesn't recognize this case.

---

## Test Case 3: CSHS100X3 - S460

### Expected: Class 4 but ρ = 1.0 (no reduction)

**Manual**:
```
bp = b - 2×ro = 100 - 2×6 = 88 mm
bp / tp = 88 / 3 = 29.33
λ_p_bar = 0.7225
ρ = 1.0 (because λ_p_bar < 0.6732)
```

**Current**:
```
bp = 88 mm ✓
bp / tp = 91 / 3 = 30.33 ❌
λ_p_bar = 1.0105 ❌
ρ = 0.7742 ❌
```

### Analysis

The current implementation calculates a **different `bp`** for hollow sections.

**Possible issue**: The `c_formula` in the plate_elements metadata might be incorrect for hollow sections.

For hollow sections, the flat width should be:
```
bp = b - 2×ro - 2×t  (???)
OR
bp = b - 2×ro  (current)
```

**Need to check**: EN 1993-1-1 Table 5.2 (sheet 3 of 3) for hollow sections.

---

## Test Case 4: CSHS180X4 - S460

### Expected: ρ = 0.9363

**Manual**:
```
bp = 180 - 2×8 = 164 mm
bp / tp = 164 / 4 = 41.0
λ_p_bar = 1.0099
ρ = 0.9363
A_removed = 167.2 mm² (total for 4 sides)
```

**Current**:
```
bp = 168 mm (???)
bp / tp = 168 / 4 = 42.0
λ_p_bar = 1.3991 ❌ (39% error)
ρ = 0.6024 ❌ (36% error)
A_removed = 1068.9 mm² ❌ (539% error!!!)
```

### Analysis

**Critical error**: The current implementation removes **6.4× more area** than it should!

This is a **major bug** that will significantly underestimate the capacity of hollow sections.

---

## Root Cause Summary

### Issue 1: Web thickness for I-sections
- Manual uses `tp = 0.5 × tw` for webs
- Current uses `tp = tw`

### Issue 2: Flat width for hollow sections
- Manual: `bp = b - 2×ro`
- Current: `bp = b - 2×ro - ???` (appears to add extra)

### Issue 3: Classification limits
- Need to verify the formulas in `classifyPlateElement()`
- The `limit_class3` calculation might be incorrect

---

## Recommended Actions

1. **Investigate Eurocode 1993-1-1 Table 5.2**:
   - Check note 2 for internal compression elements
   - Verify if `t = 0.5 × tw` is correct for webs
   - Check hollow section definitions

2. **Fix plate_elements metadata** in database:
   - Verify `c_formula` for IPE/HE webs
   - Verify `c_formula` for hollow sections
   - Ensure corner radius is handled correctly

3. **Add debug logging** to classification:
   - Print `c`, `t`, `c/t`, `limit_class3`, `λ_p_bar`, `ρ`
   - Compare with manual calculations step-by-step

4. **Create regression tests**:
   - Use these 4 manual calculations as reference
   - Target: All tests should pass within 1% tolerance

---

## Next Steps

**PRIORITY 1**: Investigate the `tp = 0.5 × tw` discrepancy
**PRIORITY 2**: Fix hollow section `bp` calculation
**PRIORITY 3**: Re-run tests and verify all pass
**PRIORITY 4**: Add these as permanent regression tests

---

## Files to Investigate

1. `steel_cross_section_database/ipe.json` - Check `plate_elements.web.classification.t_formula`
2. `steel_cross_section_database/cshs.json` - Check `plate_elements.*.classification.c_formula`
3. `flexural_buckling_api.js:classifyPlateElement()` - Verify logic
4. EN 1993-1-1 Table 5.2 - Eurocode reference

---

## Reference Values for Regression Testing

| Section | fy (MPa) | Element | λ_p_bar | ρ | A_removed (mm²) |
|---------|----------|---------|---------|---|-----------------|
| IPE450  | 460      | web     | 1.9852  | 0.4898 | 1816.80 |
| IPE240  | 460      | web     | ~1.0    | 1.0000 | 0.00    |
| CSHS100X3 | 460    | all     | 0.7225  | 1.0000 | 0.00    |
| CSHS180X4 | 460    | all     | 1.0099  | 0.9363 | 167.24  |

These are **verified manual calculations** from SMath Studio and should be treated as the **ground truth**.
