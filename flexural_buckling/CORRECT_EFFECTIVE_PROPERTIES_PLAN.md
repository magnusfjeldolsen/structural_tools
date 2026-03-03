# Plan: Verify and Correct Class 4 Effective Properties Calculation

## Executive Summary

This document provides a complete verification and correction plan for the Class 4 effective properties calculation in the flexural buckling module. Two critical bugs have been identified and fixed:

1. **Strip removal logic inversion** (FIXED)
2. **Moment of inertia calculation errors** (FIXED)

This plan ensures another agent can verify the implementation is correct per EN 1993-1-5.

---

## Table of Contents

1. [Background: EN 1993-1-5 Requirements](#background)
2. [Bug 1: Strip Removal Logic Inversion](#bug-1-strip-removal-logic-inversion)
3. [Bug 2: Moment of Inertia Calculation](#bug-2-moment-of-inertia-calculation)
4. [Verification Test Cases](#verification-test-cases)
5. [Implementation Checklist](#implementation-checklist)
6. [Expected Results](#expected-results)

---

## Background

### EN 1993-1-5 Effective Width Method

For Class 4 sections (slender elements), local buckling reduces the effective cross-sectional properties.

**Key principle from Tables 4.1 and 4.2:**
- **HATCHED areas = EFFECTIVE (kept in the section)**
- **WHITE areas = REMOVED (ineffective due to local buckling)**

### Coordinate System

**Section coordinates:**
- Origin: Section centroid (0, 0)
- Y-axis: Vertical (major axis), positive UPWARD
- Z-axis: Horizontal (minor axis), positive RIGHTWARD
- Units: millimeters (mm)

**Example IPE 220:**
```
Y ↑
  │     ┌─────────┐  Top flange
  │     │         │  y = +110 mm
  │     └─┬─────┬─┘
  │       │     │
  │       │ WEB │    z = 0, tw = 5.9 mm
  │       │     │
  │     ┌─┴─────┴─┐
  │     │         │  y = -110 mm
  │     └─────────┘  Bottom flange
  └─────────────────→ Z
       -55    0    +55 mm
```

---

## Bug 1: Strip Removal Logic Inversion

### Problem Statement

**CRITICAL:** The original implementation had inverted logic for which portions of internal elements are removed vs. kept.

### EN 1993-1-5 Table 4.1 (Internal Elements, ψ = 1)

**Stress distribution:** Pure compression (uniform compression both edges)

**Effective width distribution:**
```
b_eff = ρ × b̄
b_e1 = 0.5 × b_eff  (at edge 1 - HATCHED in table = KEPT)
b_e2 = 0.5 × b_eff  (at edge 2 - HATCHED in table = KEPT)
```

**Removed portion:**
```
Width_removed = b̄ - b_eff  (WHITE in table = REMOVED)
Position: CENTER of element
```

### Visual Diagram

```
Table 4.1 interpretation for web:

Gross section:          Effective section:
    σ₁                      σ₁
    ║                   ╔═══════╗  ← b_e1 (HATCHED - kept)
    ║                   ║       ║
    ║                   ║░░░░░░░║  ← Removed center (WHITE)
    ║                   ║       ║
    ║                   ╚═══════╝  ← b_e2 (HATCHED - kept)
    σ₂                      σ₂
```

### Original Implementation (WRONG)

**File:** `flexural_buckling_api.js` lines 671-706 (before fix)

```javascript
if (plate.type === 'internal') {
    // Pattern A: Symmetric edge reduction ← WRONG COMMENT
    // Remove two equal strips at edges ← WRONG
    const half_removed = strip_width / 2;

    // Strip 1: At edge1 (positive direction) ← WRONG - removes edge
    // Strip 2: At edge2 (negative direction) ← WRONG - removes edge
}
```

**What it did:**
- Created 2 strips at EDGES (top and bottom)
- Kept CENTER portion
- **OPPOSITE of what EN 1993-1-5 requires**

**Example: IPE 220 web (WRONG):**
```
Strip 1: y = +78.95 mm (near top edge), width = 19.7 mm ❌
Strip 2: y = -78.95 mm (near bottom edge), width = 19.7 mm ❌
```

### Corrected Implementation (FIXED)

**File:** `flexural_buckling_api.js` lines 671-694 (after fix)

```javascript
if (plate.type === 'internal') {
    // EN 1993-1-5 Table 4.1, Row 1 (ψ = 1: Pure compression)
    // Effective width b_eff = ρ × b̄ is distributed at EDGES (HATCHED in table):
    //   - b_e1 = 0.5 × b_eff (kept at edge 1)
    //   - b_e2 = 0.5 × b_eff (kept at edge 2)
    // CENTER portion is REMOVED (WHITE in table): width = b̄ - b_eff

    const centroid = plate.geometry.centroid;

    // Create single removed strip at center
    const centerStrip = {
      id: `${plate.id}_center_removed`,
      width: strip_width,           // Total removed width
      thickness: t,                 // Plate thickness
      area: (strip_width * t) / 100, // mm² → cm²
      orientation: plate.orientation,
      centroid: {
        y: centroid.y,  // Center of plate in Y
        z: centroid.z   // Center of plate in Z
      }
    };

    strips.push(centerStrip);
}
```

**What it does:**
- Creates 1 strip at CENTER
- Keeps EDGE portions
- **CORRECT per EN 1993-1-5 Table 4.1**

**Example: IPE 220 web (CORRECT):**
```
Strip: y = 0 mm (center), width = 39.4 mm ✅
  - Top boundary: y = +19.7 mm
  - Bottom boundary: y = -19.7 mm
```

### Calculation Example: IPE 220 Web

**Geometry:**
- Clear web height: c = h - 2×tf - 2×r = 220 - 2×9.2 - 2×12 = 177.6 mm
- Web thickness: tw = 5.9 mm
- Centroid: (y=0, z=0)
- Edge 1 (top): y = +88.8 mm
- Edge 2 (bottom): y = -88.8 mm

**For S460 (fy = 460 MPa):**
- ε = √(235/460) = 0.715
- λ = c/tw = 177.6/5.9 = 30.1
- Class 3 limit = 42ε = 30.0
- Class: 30.1 > 30.0 → **Class 4** ✅

**Effective width (EN 1993-1-5 Eq. 4.2):**
- λ̄p = 30.1 / 30.0 = 1.003
- ρ = (λ̄p - 0.055(3 + ψ)) / λ̄p² = (1.003 - 0.220) / 1.006 = 0.778
- c_eff = ρ × c = 0.778 × 177.6 = 138.2 mm

**Removed strip (CORRECT):**
- Width: c - c_eff = 177.6 - 138.2 = 39.4 mm
- Position: Centered at y = 0
- Y-range: -19.7 to +19.7 mm
- Z-range: -2.95 to +2.95 mm (web thickness tw/2)
- Area: 39.4 × 5.9 / 100 = 2.32 cm²

### Outstand Elements (Already Correct)

**EN 1993-1-5 Table 4.2 (Outstand Elements, ψ ≥ 0):**

```
b_eff = ρ × c (HATCHED - kept at SUPPORTED EDGE)
Width_removed = c - b_eff (WHITE - removed from FREE EDGE)
```

**Current implementation (lines 696-716) is CORRECT:**
- Removes from FREE EDGE (edge2)
- Keeps portion at SUPPORTED EDGE (edge1)
- No changes needed ✅

---

## Bug 2: Moment of Inertia Calculation

### Problem Statement

The original calculation of local inertia used a single formula that didn't properly account for strip orientation when calculating moments of inertia about different axes.

### Structural Mechanics Fundamentals

For a rectangle with dimensions:
- **b** = base (width in one direction)
- **h** = height (dimension in other direction)

**Moments of inertia about centroid:**
```
I_y (about Y-axis, horizontal) = (h × b³) / 12
I_z (about Z-axis, vertical)   = (b × h³) / 12
```

**Key insight:** The dimension is **cubed** in the direction **perpendicular** to the axis of rotation.

### Correct Formula for Effective Moments of Inertia

**General formula:**
```
I_eff = I_gross - Σ(I_local + I_parallel_axis) - A_eff × e_N²
```

**For each removed strip:**
```
I_y,eff = I_y,gross - A_strip × z_c² - I_local_y
I_z,eff = I_z,gross - A_strip × y_c² - I_local_z
```

Where:
- `A_strip` = area of removed strip (cm²)
- `y_c, z_c` = coordinates of strip centroid relative to gross section centroid (cm)
- `I_local_y` = local inertia of strip about its own Y-axis (cm⁴)
- `I_local_z` = local inertia of strip about its own Z-axis (cm⁴)

### For Web Center Strip (orientation = 'y-direction')

**Strip dimensions:**
- `ly_strip` = dimension in Y-direction (width of removed strip)
- `lz_strip` = dimension in Z-direction (web thickness tw)

**Example: IPE 220 web center strip:**
- ly_strip = 39.4 mm = 3.94 cm
- lz_strip = 5.9 mm = 0.59 cm
- Centroid: (y_c, z_c) = (0, 0)

**Local inertias:**
```
I_local_y = (ly_strip × lz_strip³) / 12
I_local_y = (3.94 × 0.59³) / 12 = 0.068 cm⁴

I_local_z = (lz_strip × ly_strip³) / 12
I_local_z = (0.59 × 3.94³) / 12 = 3.01 cm⁴
```

**Parallel axis contributions (for center strip at y=0, z=0):**
```
I_parallel_y = A_strip × z_c² = 2.32 × 0² = 0 cm⁴
I_parallel_z = A_strip × y_c² = 2.32 × 0² = 0 cm⁴
```

**Effective moments:**
```
I_y,eff = I_y,gross - 0.068 cm⁴
I_z,eff = I_z,gross - 3.01 cm⁴
```

### Original Implementation (WRONG)

**File:** `flexural_buckling_api.js` lines 860-887 (before fix)

```javascript
// Local inertia of removed strip about its own centroid
const I_local = (t_cm * Math.pow(width_cm, 3)) / 12;  // ← WRONG: Single formula

// Parallel axis contributions
const I_parallel_y = A_removed * d_y * d_y;
const I_parallel_z = A_removed * d_z * d_z;

// Subtract from appropriate axis based on orientation
if (strip.orientation === 'y-direction') {
    // Strip extends in Y → affects I_z
    I_eff_z -= (I_local + I_parallel_z);  // ← Only subtracts from Iz
} else if (strip.orientation === 'z-direction') {
    // Strip extends in Z → affects I_y
    I_eff_y -= (I_local + I_parallel_y);  // ← Only subtracts from Iy
}
```

**Problems:**
1. Single `I_local` formula doesn't distinguish between I_y and I_z
2. Orientation-based branching only subtracts from ONE axis
3. Parallel axis formula uses wrong distances (d_y for I_y should be d_z!)
4. Doesn't calculate both inertia components for each strip

**Example calculation (WRONG):**
```
t_cm = 0.59 cm, width_cm = 3.94 cm
I_local = (0.59 × 3.94³) / 12 = 3.01 cm⁴

For y-direction strip:
  I_eff_z -= 3.01 cm⁴  ← Uses wrong value (should be I_local_z)
  I_eff_y -= 0 cm⁴     ← Doesn't subtract anything! Should subtract I_local_y = 0.068
```

### Corrected Implementation (FIXED)

**File:** `flexural_buckling_api.js` lines 860-903 (after fix)

```javascript
// Subtract removed strips
for (const strip of removedStrips) {
    const A_removed = strip.area;  // cm²
    const t_cm = strip.thickness / 10;  // mm → cm
    const width_cm = strip.width / 10;  // mm → cm

    // Distance from strip centroid to GROSS section centroid
    const d_y = strip.centroid.y / 10;  // mm → cm
    const d_z = strip.centroid.z / 10;  // mm → cm

    // Local inertia of removed strip about its own centroid
    // For rectangle: I_y = (h × b³)/12, I_z = (b × h³)/12
    let I_local_y, I_local_z;

    if (strip.orientation === 'y-direction') {
      // Strip extends in Y-direction (e.g., web center strip)
      // ly_strip = width_cm (height in Y), lz_strip = t_cm (width in Z)
      const ly_strip = width_cm;
      const lz_strip = t_cm;
      I_local_y = (ly_strip * Math.pow(lz_strip, 3)) / 12;  // About Y-axis
      I_local_z = (lz_strip * Math.pow(ly_strip, 3)) / 12;  // About Z-axis

    } else if (strip.orientation === 'z-direction') {
      // Strip extends in Z-direction (e.g., flange tip)
      // lz_strip = width_cm (width in Z), ly_strip = t_cm (height in Y)
      const lz_strip = width_cm;
      const ly_strip = t_cm;
      I_local_y = (ly_strip * Math.pow(lz_strip, 3)) / 12;  // About Y-axis
      I_local_z = (lz_strip * Math.pow(ly_strip, 3)) / 12;  // About Z-axis

    } else if (strip.orientation === 'radial') {
      // Circular: approximate as rectangular strip
      const avg_dim = (width_cm + t_cm) / 2;
      I_local_y = (avg_dim * Math.pow(avg_dim, 3)) / 12;
      I_local_z = I_local_y;
    }

    // Parallel axis theorem contributions
    // CRITICAL: d_z is used for I_y, d_y is used for I_z!
    const I_parallel_y = A_removed * d_z * d_z;  // Note: d_z for I_y!
    const I_parallel_z = A_removed * d_y * d_y;  // Note: d_y for I_z!

    // Subtract local inertia and parallel axis contribution
    // BOTH axes are reduced for EVERY strip
    I_eff_y -= (I_local_y + I_parallel_y);
    I_eff_z -= (I_local_z + I_parallel_z);
}
```

**Key changes:**
1. ✅ Calculates **BOTH** `I_local_y` and `I_local_z` separately
2. ✅ Properly assigns dimensions based on strip orientation
3. ✅ Uses correct parallel axis formula: `d_z² for I_y`, `d_y² for I_z`
4. ✅ Subtracts from **BOTH** axes for every strip (no branching)

**Example calculation (CORRECT):**
```
For IPE 220 web center strip:
  ly_strip = 3.94 cm, lz_strip = 0.59 cm

  I_local_y = (3.94 × 0.59³) / 12 = 0.068 cm⁴  ✅
  I_local_z = (0.59 × 3.94³) / 12 = 3.01 cm⁴   ✅

  d_y = 0, d_z = 0 (center strip)
  I_parallel_y = 2.32 × 0² = 0 cm⁴
  I_parallel_z = 2.32 × 0² = 0 cm⁴

  I_eff_y = I_gross_y - (0.068 + 0) = I_gross_y - 0.068 cm⁴  ✅
  I_eff_z = I_gross_z - (3.01 + 0) = I_gross_z - 3.01 cm⁴    ✅
```

### Why Parallel Axis Uses "Opposite" Distance

**Parallel axis theorem:**
```
I_axis = I_local + A × d²
```

Where `d` is the distance **perpendicular to the axis**.

**For Y-axis (horizontal):**
- Distance perpendicular to Y-axis = distance in **Z-direction** = `d_z`
- Therefore: `I_y = I_local_y + A × d_z²`

**For Z-axis (vertical):**
- Distance perpendicular to Z-axis = distance in **Y-direction** = `d_y`
- Therefore: `I_z = I_local_z + A × d_y²`

This is why the code uses:
```javascript
const I_parallel_y = A_removed * d_z * d_z;  // d_z for I_y
const I_parallel_z = A_removed * d_y * d_y;  // d_y for I_z
```

---

## Verification Test Cases

### Test Case 1: IPE 220 / S460 / Pure Compression

**Input:**
- Profile: IPE 220
- Steel grade: S460 (fy = 460 MPa)
- Load: Pure compression (ψ = 1.0)
- NEd: 650 kN
- Ly = Lz = 4000 mm

**Expected classification:**
- Web slenderness: λ = 30.1
- Class 3 limit: 30.0
- Classification: **Class 4** (web_internal governing)

**Expected effective properties:**

**Area:**
```
A_gross = 33.37 cm²
A_removed = 2.32 cm²
A_eff = 33.37 - 2.32 = 31.05 cm²
Area reduction = 7.0%
```

**Removed strips:**
```
Number of strips: 1 (not 2!)
Strip ID: "web_center_removed"
Strip width: 39.4 mm
Strip centroid: (y=0, z=0)
Strip area: 2.32 cm²
```

**Moments of inertia (approximate - verify exact values):**
```
I_y,gross = 277.2 cm⁴
I_y,removed = 0.068 cm⁴ (local) + 0 (parallel axis at center)
I_y,eff ≈ 277.1 cm⁴

I_z,gross = 20.49 cm⁴
I_z,removed = 3.01 cm⁴ (local) + 0 (parallel axis at center)
I_z,eff ≈ 17.48 cm⁴
I_z reduction ≈ 14.7%
```

**Console output to verify:**
```
[Class 4 Calc] Starting for IPE220
[Class 4 Calc] Checking element web: class=4
[Class 4 Calc] Found Class 4 element: web
[Class 4 Calc] Element web: λ_p_bar=1.003, ρ=0.778, c=177.60mm, c_eff=138.17mm
[Removed Strips] Plate web: c_gross=177.60mm, c_eff=138.17mm, strip_width=39.43mm, ρ=0.778
[Removed Strips] Created center strip: A=2.33 cm², width=39.43mm, centroid=(0.0, 0.0)
[Class 4 Calc] Calculated 1 removed strips for web
[Class 4 Calc] Total removed strips: 1
[Class 4 Calc] A_gross = 33.37 cm²
[Class 4 Calc] Shift calculation: total_A_removed=2.33 cm², e_N_y=0.0000 cm, e_N_z=0.0000 cm
[Class 4 Calc] A_eff = 31.05 cm² (reduction: 2.33 cm², 7.0%)
```

### Test Case 2: IPE 240 / S460 / Pure Compression

**Input:**
- Profile: IPE 240
- Steel grade: S460
- Load: Pure compression
- NEd: 650 kN
- Ly = Lz = 4000 mm

**Expected:**
- Classification: Class 4 (web)
- Number of removed strips: 1
- Strip centroid: (y=0, z=0)
- Area reduction: ~7%

### Test Case 3: HEA 200 / S355 / Pure Compression

**Input:**
- Profile: HEA 200
- Steel grade: S355
- Load: Pure compression

**Expected:**
- Classification: May be Class 3 or less (wider flanges, thicker web)
- If Class 4: 1 center strip removed
- Verify proper handling

---

## Implementation Checklist

### Phase 1: Verify Bug Fixes

- [ ] **Check removed strips for internal elements**
  - [ ] Open browser console
  - [ ] Test IPE 220 / S460 / 650 kN
  - [ ] Verify `Total removed strips: 1` (not 2)
  - [ ] Verify `centroid=(0.0, 0.0)` (not ±78.95)
  - [ ] Verify `width=39.4mm` (not ~19.7mm)

- [ ] **Check moment of inertia calculation**
  - [ ] Add debug logging to show I_local_y and I_local_z
  - [ ] Verify I_local_y = 0.068 cm⁴ for IPE220 web
  - [ ] Verify I_local_z = 3.01 cm⁴ for IPE220 web
  - [ ] Verify both I_y and I_z are reduced

- [ ] **Visual verification with section plotter**
  - [ ] Red strip should be in CENTER of web
  - [ ] Blue effective portions at TOP and BOTTOM
  - [ ] NOT red strips at edges

### Phase 2: Test Edge Cases

- [ ] **Different profile types**
  - [ ] IPE (narrow flanges)
  - [ ] HEA (wide flanges, light)
  - [ ] HEB (wide flanges, medium)
  - [ ] HEM (wide flanges, heavy)

- [ ] **Different steel grades**
  - [ ] S235 (ε = 1.0)
  - [ ] S355 (ε = 0.81)
  - [ ] S460 (ε = 0.71)

- [ ] **Different load levels**
  - [ ] Low load (Class 1-3)
  - [ ] Moderate load (just barely Class 4)
  - [ ] High load (heavily Class 4)

### Phase 3: Mathematical Verification

- [ ] **Hand calculate one case**
  - [ ] Choose IPE 220 / S460
  - [ ] Calculate ρ manually
  - [ ] Calculate c_eff manually
  - [ ] Calculate removed strip area manually
  - [ ] Calculate I_local_y and I_local_z manually
  - [ ] Compare with code output

- [ ] **Check area balance**
  - [ ] A_gross = A_eff + A_removed
  - [ ] Verify within 0.1% tolerance

- [ ] **Check neutral axis shift**
  - [ ] For symmetric sections: e_N_y = 0, e_N_z = 0
  - [ ] Verify shift is applied correctly in Step 4

### Phase 4: Documentation

- [ ] **Update code comments**
  - [ ] Reference EN 1993-1-5 Table 4.1 and 4.2
  - [ ] Explain HATCHED vs WHITE areas
  - [ ] Document parallel axis formula

- [ ] **Create test file**
  - [ ] `test_effective_properties.js`
  - [ ] Test all profile types
  - [ ] Output comparison table

---

## Expected Results

### Correct Console Output for IPE 220 / S460

```
[Class 4 Calc] Starting for IPE220
[Class 4 Calc] Classification: Object { class: 4, ... }
[Class 4 Calc] Element results: Array(2) [ {flange}, {web} ]
[Class 4 Calc] Checking element top_flange_tip_left: class=1
[Class 4 Calc] Checking element web: class=4
[Class 4 Calc] Found Class 4 element: web
[Class 4 Calc] Element web: λ_p_bar=1.003, ρ=0.778, c=177.60mm, c_eff=138.17mm

[Removed Strips] Plate web: c_gross=177.60mm, c_eff=138.17mm, strip_width=39.43mm, ρ=0.778
[Removed Strips] Created center strip: A=2.33 cm², width=39.43mm, centroid=(0.0, 0.0)

[Class 4 Calc] Calculated 1 removed strips for web
[Class 4 Calc] Total removed strips: 1
[Class 4 Calc] A_gross = 33.37 cm²
[Class 4 Calc] Shift calculation: total_A_removed=2.33 cm², e_N_y=0.0000 cm, e_N_z=0.0000 cm
[Class 4 Calc] A_eff = 31.05 cm² (reduction: 2.33 cm², 7.0%)
```

### Correct Section Plotter Visual

```
    ┌─────────────────┐
    │   Top Flange    │ ← Blue (effective)
    └─┬─────────────┬─┘
      │▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← Blue (effective edge b_e1)
      ├─────────────┤
      │░░░░░CENTER░░│ ← Red hatched (removed strip)
      ├─────────────┤
      │▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← Blue (effective edge b_e2)
    ┌─┴─────────────┴─┐
    │  Bottom Flange  │ ← Blue (effective)
    └─────────────────┘
```

### Key Success Criteria

✅ **Strip count:** 1 removed strip for web (not 2)
✅ **Strip position:** Center at y=0 (not edges at y=±78.95)
✅ **Strip width:** 39.4 mm (not 19.7 mm)
✅ **Area reduction:** 7.0% (unchanged from before, just positioned correctly)
✅ **I_local_y:** 0.068 cm⁴ (small - thin in Z-direction)
✅ **I_local_z:** 3.01 cm⁴ (large - wide in Y-direction)
✅ **Both I_y and I_z reduced:** Not just one axis
✅ **Visual:** Red strip in center, blue edges in plotter

---

## Files Modified

1. **flexural_buckling_api.js**
   - Lines 671-694: Fixed internal element strip removal
   - Lines 696-716: Updated comments for outstand elements
   - Lines 860-903: Fixed moment of inertia calculation

2. **STRIP_REMOVAL_FIX_PLAN.md** (created)
   - Complete documentation of strip removal bug

3. **CORRECT_EFFECTIVE_PROPERTIES_PLAN.md** (this file)
   - Complete verification and testing plan

---

## References

### EN 1993-1-5:2006 Sections

- **Section 4.4:** Plate elements without longitudinal stiffeners
- **Equation 4.2:** Reduction factor for internal elements
- **Equation 4.3:** Reduction factor for outstand elements
- **Table 4.1:** Internal compression elements (effective width distribution)
- **Table 4.2:** Outstand compression elements (effective width distribution)
- **Figure 4.1:** Class 4 cross-sections - axial force (neutral axis shift)

### Key Equations

**Reduction factor (internal, ψ=1):**
```
ρ = (λ̄p - 0.055(3 + ψ)) / λ̄p²  ≤ 1.0
```

**Reduction factor (outstand):**
```
ρ = (λ̄p - 0.188) / λ̄p²  ≤ 1.0  for λ̄p > 0.748
```

**Effective width (internal, ψ=1):**
```
b_eff = ρ × b̄
b_e1 = 0.5 × b_eff  (at edge 1)
b_e2 = 0.5 × b_eff  (at edge 2)
```

**Local moment of inertia:**
```
I_y = (ly × lz³) / 12
I_z = (lz × ly³) / 12
```

**Parallel axis theorem:**
```
I_y = I_local_y + A × d_z²
I_z = I_local_z + A × d_y²
```

---

## Common Pitfalls to Avoid

### ❌ Pitfall 1: Misinterpreting Table Diagrams
**Wrong:** Thinking hatched areas are removed
**Right:** HATCHED = kept (effective), WHITE = removed

### ❌ Pitfall 2: Using Single I_local
**Wrong:** `I_local = (t × w³) / 12` used for both axes
**Right:** Calculate I_local_y and I_local_z separately

### ❌ Pitfall 3: Wrong Parallel Axis Distance
**Wrong:** Using d_y for I_y
**Right:** Using d_z for I_y (perpendicular distance!)

### ❌ Pitfall 4: Orientation-Based Branching
**Wrong:** Only subtracting from Iz for y-direction strips
**Right:** Subtract from BOTH Iy and Iz for every strip

### ❌ Pitfall 5: Forgetting Neutral Axis Shift
**Wrong:** Stopping after strip removal
**Right:** Apply Step 4 correction: I_eff_y -= A_eff × e_N_z²

---

## End of Plan

**Status:** Both bugs have been fixed in commits:
- Strip removal: `9d221b5`
- Inertia calculation: `dc39f14`

**Next steps:**
1. Refresh local server
2. Test with IPE 220 / S460 / 650 kN
3. Verify console output matches expected
4. Verify section plotter shows center strip
5. Run additional test cases
6. Document any remaining issues

---

**Author:** Claude Code
**Date:** 2026-03-03
**Version:** 1.0
