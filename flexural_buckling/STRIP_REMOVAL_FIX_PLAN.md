# Critical Bug Fix: Strip Removal Logic Inversion

## Problem Statement

The current implementation of `calculateRemovedStrips()` has **inverted logic** for which parts are removed vs. kept. The code currently removes the wrong portions of plates.

**Key Insight from EN 1993-1-5 Tables 4.1 and 4.2:**
- **HATCHED areas = EFFECTIVE (kept)**
- **WHITE areas = REMOVED**

## Current Implementation Analysis

### 1. Internal Elements (Table 4.1) - **WRONG**

**Current code (lines 671-706):**
```javascript
if (plate.type === 'internal') {
    // Pattern A: Symmetric edge reduction
    // Remove two equal strips at edges ← WRONG!
    const half_removed = strip_width / 2;

    // Strip 1: At edge1 (positive direction) ← WRONG - removes edge
    // Strip 2: At edge2 (negative direction) ← WRONG - removes edge
}
```

**What it does:**
- Removes TWO strips at the EDGES (top and bottom)
- Keeps the CENTER portion

**What EN 1993-1-5 Table 4.1 says (ψ = 1):**
- **Keep** edge strips: b_e1 = 0.5 × b_eff and b_e2 = 0.5 × b_eff (HATCHED)
- **Remove** center portion: width = b̄ - b_eff (WHITE)

**Verdict:** ❌ **INVERTED - Must fix**

---

### 2. Outstand Elements (Table 4.2) - **CORRECT**

**Current code (lines 708-723):**
```javascript
else if (plate.type === 'outstand') {
    // Pattern C: Free edge removal
    // Remove single strip from free edge inward
    const free_edge = plate.geometry.edges.edge2;

    // Creates ONE strip at free edge
}
```

**What it does:**
- Removes ONE strip at the FREE EDGE

**What EN 1993-1-5 Table 4.2 says (ψ ≥ 0):**
- **Keep** b_eff at the SUPPORTED edge (junction) (HATCHED)
- **Remove** from FREE edge: width = c - b_eff (WHITE)

**Verdict:** ✅ **CORRECT - No change needed**

---

### 3. Circular Elements - **UNKNOWN (No diagram in PDF)**

**Current code (lines 725-736):**
```javascript
else if (plate.type === 'circular') {
    // Circular sections: uniform reduction
    // Treat as single "strip" at centroid
}
```

**Status:** Need to verify, but likely needs different approach for CHS.

---

## Detailed Correction for Internal Elements

### Table 4.1 Row 1 (ψ = 1) - Pure Compression

**Diagram interpretation:**
```
Gross section:     Effective section:
    σ₁               σ₁
    ║               ╔═══╗  ← b_e1 = 0.5 × b_eff (HATCHED - kept at edge 1)
    ║               ║░░░║  ← Removed center (WHITE)
    ║               ╚═══╝  ← b_e2 = 0.5 × b_eff (HATCHED - kept at edge 2)
    ║               σ₂
    σ₂
```

**Effective width distribution:**
- b_eff = ρ × b̄
- b_e1 = 0.5 × b_eff (at edge 1)
- b_e2 = 0.5 × b_eff (at edge 2)

**Removed portion:**
- **Single strip in CENTER**
- Width = b̄ - b_eff
- Position: Centered at plate centroid

### Example: IPE 220 Web

**Geometry:**
- Clear web height: c = 177.6 mm
- Centroid: y = 0, z = 0
- Edge 1 (top): y = +88.8 mm
- Edge 2 (bottom): y = -88.8 mm

**For S460 (ρ = 0.778):**
- c_eff = 138.2 mm
- Removed width = 39.4 mm

**CURRENT (wrong):**
```
Strip 1: y = 78.95 mm (near top edge) - width = 19.7 mm ❌
Strip 2: y = -78.95 mm (near bottom edge) - width = 19.7 mm ❌
```

**CORRECT:**
```
Single strip: y = 0 mm (center) - width = 39.4 mm ✅
  - Top boundary: y = +19.7 mm
  - Bottom boundary: y = -19.7 mm
```

---

## Fix Implementation

### Replace Internal Element Logic

**Current code to REPLACE:**
```javascript
if (plate.type === 'internal') {
    // Pattern A: Symmetric edge reduction
    // Remove two equal strips at edges
    const half_removed = strip_width / 2;

    // Strip 1: At edge1 (positive direction)
    const edge1_pos = plate.geometry.edges.edge1.position;
    const strip1 = {
      id: `${plate.id}_strip1`,
      width: half_removed,
      thickness: t,
      area: (half_removed * t) / 100,
      orientation: plate.orientation,
      centroid: {
        y: plate.orientation === 'y-direction' ? edge1_pos.y - half_removed/2 : plate.geometry.centroid.y,
        z: plate.orientation === 'z-direction' ? edge1_pos.z - Math.sign(edge1_pos.z) * half_removed/2 : plate.geometry.centroid.z
      }
    };
    strips.push(strip1);

    // Strip 2: At edge2 (negative direction)
    const edge2_pos = plate.geometry.edges.edge2.position;
    const strip2 = {
      id: `${plate.id}_strip2`,
      width: half_removed,
      thickness: t,
      area: (half_removed * t) / 100,
      orientation: plate.orientation,
      centroid: {
        y: plate.orientation === 'y-direction' ? edge2_pos.y + half_removed/2 : plate.geometry.centroid.y,
        z: plate.orientation === 'z-direction' ? edge2_pos.z + Math.sign(edge2_pos.z) * half_removed/2 : plate.geometry.centroid.z
      }
    };
    strips.push(strip2);
}
```

**NEW CORRECT CODE:**
```javascript
if (plate.type === 'internal') {
    // EN 1993-1-5 Table 4.1 (ψ = 1): Symmetric edge strips are KEPT
    // CENTER portion is REMOVED
    // b_e1 = b_e2 = 0.5 × b_eff (kept at edges)
    // Removed center width = b̄ - b_eff

    const centroid = plate.geometry.centroid;

    // Single removed strip at CENTER
    const strip = {
      id: `${plate.id}_center_removed`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,  // mm² → cm²
      orientation: plate.orientation,
      centroid: {
        y: centroid.y,  // At plate centroid
        z: centroid.z   // At plate centroid
      }
    };
    strips.push(strip);

    console.log(`[Removed Strips] Created center strip: A=${strip.area.toFixed(2)} cm², width=${strip_width.toFixed(2)}mm at centroid (y=${centroid.y}, z=${centroid.z})`);
}
```

---

## Verification Tests

### Test 1: IPE 220 / S460 / Pure Compression

**Input:**
- Profile: IPE 220
- Steel: S460
- Load: Pure compression (ψ = 1)

**Expected removed strip:**
- Width: 39.4 mm
- Y-range: -19.7 to +19.7 mm
- Z-range: -2.95 to +2.95 mm (web thickness)
- Centroid: y = 0, z = 0

**Test method:**
```javascript
const section = steelDatabase['ipe']['IPE220'];
const classification = classifySection(section, 460, 'ipe');
const effectiveProps = calculateClass4EffectiveProperties(section, classification, 'ipe');

// Check removed_strips array
console.log('Number of strips:', effectiveProps.removed_strips.length);
// Expected: 1 (not 2!)

const strip = effectiveProps.removed_strips[0];
console.log('Strip centroid Y:', strip.centroid.y);
// Expected: 0 (not 78.95 or -78.95!)

console.log('Strip width:', strip.width);
// Expected: ~39.4 mm (not ~19.7 mm!)
```

### Test 2: Visual Plotter Check

After fix, the section plotter should show:
- **Red strip in CENTER of web** (not at edges)
- **Blue effective portions at TOP and BOTTOM edges**

---

## Other Element Types to Verify

### Table 4.1 Row 2 (1 > ψ > 0) - Stress Gradient

**Diagram shows:**
- Larger effective strip at compressed edge (b_e1)
- Smaller effective strip at less compressed edge (b_e2)
- Removed center portion (white)

**Formula:**
```
b_e1 = 2/(5-ψ) × b_eff
b_e2 = b_eff - b_e1
```

**Current code:** Does NOT handle this case (ψ = 1 hardcoded)

**Action:** Note for future implementation

---

### Table 4.1 Row 3 (ψ ≤ 0) - Bending

**Diagram shows:**
- Effective strip at compression edge (b_e1 = 0.4 × b_eff)
- Remaining effective at tension edge (b_e2 = 0.6 × b_eff)
- Removed center portion (white)

**Current code:** Does NOT handle this case

**Action:** Note for future implementation

---

### Table 4.2 Rows 3-4 (Outstand with ψ ≤ 0) - Bending

**Diagram shows:**
- Effective strip at supported edge
- Removed at free edge OR internal removed strip

**Current code:** Only handles ψ ≥ 0 (compression)

**Action:** Note for future implementation

---

## Impact on Other Functions

### `calculateNeutralAxisShift()` - No Change Needed

This function correctly processes whatever strips are provided:
```javascript
for (const strip of removedStrips) {
    const A = strip.area;
    const y = strip.centroid.y / 10;  // mm → cm
    const z = strip.centroid.z / 10;

    sum_A_y += A * y;
    sum_A_z += A * z;
    total_A_removed += A;
}
```

**Verdict:** ✅ No change needed - works with any strip configuration

---

### Effective Moment of Inertia Calculation - No Change Needed

Lines 842-870 in `calculateClass4EffectiveProperties()`:
```javascript
for (const strip of removedStrips) {
    // Subtract local inertia and parallel axis contribution
}
```

**Verdict:** ✅ No change needed - correctly subtracts any removed strips

---

## Summary of Required Changes

### MUST FIX:
1. ✅ **Internal elements (ψ = 1):** Change from "remove edges" to "remove center"

### CORRECT AS-IS:
2. ✅ **Outstand elements (ψ ≥ 0):** Already correct - remove from free edge
3. ✅ **Neutral axis shift calculation:** No change needed
4. ✅ **Moment of inertia reduction:** No change needed

### FUTURE WORK:
5. ⏸️ **Internal elements (ψ ≠ 1):** Not implemented yet - only pure compression supported
6. ⏸️ **Outstand elements (ψ < 0):** Not implemented yet - only compression supported
7. ⏸️ **Circular elements:** Need proper implementation per EN 1993-1-5

---

## Implementation Steps

1. **Update `calculateRemovedStrips()` function** (lines 671-706)
   - Replace internal element logic with center removal
   - Keep outstand element logic unchanged
   - Add comments referencing EN 1993-1-5 Table 4.1

2. **Test with IPE 220 / S460**
   - Verify 1 strip (not 2)
   - Verify centroid at y=0 (not y=±78.95)
   - Verify width ~39.4mm (not ~19.7mm)

3. **Test visual plotter**
   - Red strip should be in CENTER of web
   - Blue effective portions at edges

4. **Update debug logging**
   - Log center strip instead of edge strips
   - Clarify that center is removed

5. **Commit and deploy**
   - Push fix to master
   - Deploy to GitHub Pages
   - Verify on live site

---

## Code Template for Fix

```javascript
// In calculateRemovedStrips() function at line 671:

if (plate.type === 'internal') {
    // EN 1993-1-5 Table 4.1, Row 1 (ψ = 1: Pure compression)
    // Effective width b_eff = ρ × b̄ is distributed at EDGES:
    //   - b_e1 = 0.5 × b_eff (kept at edge 1)
    //   - b_e2 = 0.5 × b_eff (kept at edge 2)
    // CENTER portion is REMOVED: width = b̄ - b_eff

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
    console.log(`[Removed Strips] Created center strip: A=${centerStrip.area.toFixed(2)} cm², width=${strip_width.toFixed(2)}mm, centroid=(${centroid.y.toFixed(1)}, ${centroid.z.toFixed(1)})`);

  } else if (plate.type === 'outstand') {
    // EN 1993-1-5 Table 4.2, Row 1 (ψ ≥ 0: Compression/uniform)
    // Effective width b_eff = ρ × c is kept at SUPPORTED EDGE
    // FREE EDGE is REMOVED: width = c - b_eff
    // (This code is already CORRECT - no changes)

    const free_edge = plate.geometry.edges.edge2;

    const freeEdgeStrip = {
      id: `${plate.id}_free_edge_removed`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      orientation: plate.orientation,
      centroid: {
        y: plate.orientation === 'y-direction' ? free_edge.position.y - strip_width/2 : plate.geometry.centroid.y,
        z: plate.orientation === 'z-direction' ? free_edge.position.z - Math.sign(free_edge.position.z) * strip_width/2 : plate.geometry.centroid.z
      }
    };

    strips.push(freeEdgeStrip);
    console.log(`[Removed Strips] Created free edge strip: A=${freeEdgeStrip.area.toFixed(2)} cm², width=${strip_width.toFixed(2)}mm`);
}
```

---

## Expected Results After Fix

### IPE 220 / S460 / 650 kN

**Before fix:**
- 2 removed strips at edges (WRONG)
- Strip 1: y = +78.95 mm, width = 19.7 mm
- Strip 2: y = -78.95 mm, width = 19.7 mm
- Visual: Red strips at TOP and BOTTOM edges

**After fix:**
- 1 removed strip at center (CORRECT)
- Strip: y = 0 mm, width = 39.4 mm
- Visual: Red strip in CENTER of web

**Area reduction:** Still 7.0% (unchanged - math is same, just positioning different)

---

## End of Fix Plan
