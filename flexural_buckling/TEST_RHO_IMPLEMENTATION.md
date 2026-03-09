# Test Plan: Class 4 ρ Reporting Implementation

## Test Overview
This document outlines the testing plan for the Class 4 plate reduction factor (ρ) reporting feature.

## Test Cases

### Test Case 1: IPE Section (Web Only Class 4)
**Objective**: Verify ρ reporting when only the web is Class 4

**Test Profile**: IPE 600 or similar large I-section
**Expected Behavior**:
- Web should show Class 4 with ρ potentially < 1.0
- Flanges should show Class 1/2/3 with ρ = 1.0 or "-"
- Overall section classified as Class 4
- Minimal area reduction (since only web is reduced)

**What to verify**:
1. ✅ Classification table shows λ_p, ρ, c_eff columns
2. ✅ Web element shows ρ value (may be < 1.0)
3. ✅ Flange elements show ρ = 1.0 or "-"
4. ✅ Color coding: green for ρ=1.0, yellow/orange for reduced
5. ✅ ρ explanation box is visible
6. ✅ Detailed calculations section shows ρ formulas for web
7. ✅ Report includes ρ table with all elements

### Test Case 2: Thin-Walled SHS (All 4 Plates Class 4)
**Objective**: Verify ρ reporting when all plate elements are Class 4

**Test Profile**: CSHS400X8 or similar thin-walled square section
**Expected Behavior**:
- All 4 sides (top, bottom, left, right) should show Class 4
- Each side may have different ρ values depending on slenderness
- Significant area reduction possible

**What to verify**:
1. ✅ All 4 plate elements appear in classification table
2. ✅ Each element shows individual ρ value
3. ✅ λ_p values calculated correctly for each plate
4. ✅ Detailed calculations show formulas for all 4 plates
5. ✅ Report table includes all 4 plate elements
6. ✅ Total area reduction reflects sum of all plate reductions

### Test Case 3: Non-Class 4 Section (Class 1/2/3)
**Objective**: Verify correct handling when section is NOT Class 4

**Test Profile**: HEB 300 or similar stocky section
**Expected Behavior**:
- Classification shows Class 1/2/3
- ρ columns show "-" for all elements
- ρ explanation box is hidden
- No ρ section in detailed calculations
- No ρ section in report

**What to verify**:
1. ✅ Classification table shows "-" in ρ columns
2. ✅ ρ explanation box is hidden
3. ✅ No ρ section in detailed calculations
4. ✅ No ρ section in report

### Test Case 4: Fire Design at Elevated Temperature
**Objective**: Verify ρ values change with temperature

**Test Profile**: IPE 400 at θ = 600°C
**Expected Behavior**:
- ULS classification may be Class 3
- Fire classification may be Class 4 (due to reduced f_y,θ)
- ρ values should differ between ULS and Fire

**What to verify**:
1. ✅ Fire classification table shows ρ values
2. ✅ Fire ρ explanation box appears
3. ✅ ρ values at elevated temp differ from ULS (if applicable)
4. ✅ Fire ρ section in report (if fire enabled and Class 4)

---

## Manual Testing Procedure

### Setup
1. Navigate to http://localhost:8001/index.html
2. Ensure database is loaded

### Test Case 1: IPE600 Test
```
Profile: IPE 600
Steel Grade: S355
Length Ly: 5.0 m
Length Lz: 5.0 m
N_Ed: 1000 kN
```

**Steps**:
1. Select IPE profile type
2. Select IPE600 from dropdown
3. Set steel grade to S355
4. Set lengths to 5.0m
5. Click "Calculate Capacity"
6. Expand "Show element classification details"
7. Verify ρ columns appear
8. Verify web shows ρ value
9. Verify flanges show ρ = 1.0 or "-"
10. Check ρ explanation box is visible
11. Scroll to "Detailed Calculations"
12. Verify ρ calculation section appears
13. Click "Generate Report"
14. Verify ρ table in report

### Test Case 2: CSHS400X8 Test
```
Profile: CSHS 400X8
Steel Grade: S235
Length Ly: 4.0 m
Length Lz: 4.0 m
N_Ed: 500 kN
```

**Steps**:
1. Select CSHS profile type
2. Select CSHS400X8 from dropdown
3. Set steel grade to S235
4. Set lengths to 4.0m
5. Click "Calculate Capacity"
6. Expand classification details
7. Verify all 4 sides appear in table
8. Verify each side shows ρ value
9. Check color coding
10. Verify detailed calculations show all 4 plates
11. Generate report and verify all 4 plates in ρ table

### Test Case 3: HEB300 Test (Non-Class 4)
```
Profile: HEB 300
Steel Grade: S355
Length Ly: 3.0 m
Length Lz: 3.0 m
N_Ed: 2000 kN
```

**Steps**:
1. Select HEB profile type
2. Select HEB300
3. Set parameters
4. Calculate
5. Verify classification is Class 1/2/3
6. Verify ρ columns show "-"
7. Verify ρ explanation box is hidden
8. Verify no ρ section in calculations
9. Verify no ρ section in report

### Test Case 4: IPE400 Fire Design
```
Profile: IPE 400
Steel Grade: S355
Fire Enabled: Yes
Fire Mode: Specify Temperature
Temperature: 600°C
N_Ed,fi: 800 kN
```

**Steps**:
1. Select IPE400
2. Enable fire design
3. Set temperature to 600°C
4. Calculate
5. Expand fire classification details
6. Verify fire ρ values (if Class 4 at elevated temp)
7. Compare ULS vs Fire ρ values
8. Check fire ρ explanation box

---

## Expected Results Summary

### Visual Indicators

**Classification Table**:
- λ_p column shows plate slenderness (e.g., 0.6724)
- ρ column shows reduction factor:
  - Green text: ρ = 1.000
  - Yellow text: ρ = 0.900-0.999
  - Orange text: ρ < 0.900
- c_eff column shows effective width in mm

**Explanation Box** (cyan background):
- Appears only for Class 4 sections
- Shows formulas from EN 1993-1-5
- Explains why ρ can be 1.0 for Class 4 elements

**Detailed Calculations**:
- New cyan section "CLASS 4 PLATE REDUCTION FACTORS (ρ)"
- Step-by-step calculation per element
- Shows k_σ, λ_p, λ_p_limit, formula used, final ρ

**Report**:
- New section before RESULTS SUMMARY
- Table with all plate elements
- Color-coded cells (green/yellow/orange backgrounds)
- EN 1993-1-5 formulas reference
- Legend explaining color coding

---

## Known Behaviors

1. **ρ = 1.000 for Class 4**: This is CORRECT behavior when λ_p ≤ λ_p_limit
2. **Flanges fully effective**: Common for I/H sections where web is slender but flanges are stocky
3. **All plates Class 4**: Common for thin-walled hollow sections
4. **Fire increases slenderness**: Higher temp → lower f_y → higher ε → higher λ_p → lower ρ

---

## Success Criteria

✅ All 4 test cases pass
✅ ρ values match hand calculations
✅ Color coding is correct
✅ Formulas are clearly displayed
✅ Report is comprehensive and printable
✅ No JavaScript errors in console
✅ UI is responsive and clear

---

## Next Steps After Testing

1. If tests pass → Merge to master
2. If issues found → Fix and retest
3. After merge → Deploy to gh-pages
4. Document in user guide

---

## Testing Status

- [ ] Test Case 1: IPE600 (web only Class 4)
- [ ] Test Case 2: CSHS400X8 (all 4 plates)
- [ ] Test Case 3: HEB300 (non-Class 4)
- [ ] Test Case 4: IPE400 fire design
- [ ] Console errors check
- [ ] Report PDF export test
- [ ] Mobile responsiveness check

---

## Notes

- Server running on: http://localhost:8001/index.html
- Branch: rho-class4
- Commit: 81de749
