# Hollow Section Plotter - Complete Implementation Plan

## Overview
Implement comprehensive plotting support for all hollow section types with Class 4 effective property visualization, including removed plate strips with accurate positioning based on section geometry and corner radius effects.

**Date**: 2026-03-03
**Status**: Planning Phase
**Related**: `section_plotter.js`, `flexural_buckling_api.js`

---

## 1. Section Types Analysis

### 1.1 Database Files
The steel cross-section database includes 6 hollow section types:

| File | Type | Description | Key Parameters |
|------|------|-------------|----------------|
| `cshs.json` | Cold Square Hollow | Square sections (cold-formed) | `b`, `t`, `ro`, `ri` |
| `hshs.json` | Hot Square Hollow | Square sections (hot-finished) | `b`, `t`, `ro`, `ri` |
| `crhs.json` | Cold Rectangular Hollow | Rectangular sections (cold-formed) | `h`, `b`, `t`, `ro`, `ri` |
| `hrhs.json` | Hot Rectangular Hollow | Rectangular sections (hot-finished) | `h`, `b`, `t`, `ro`, `ri` |
| `cchs.json` | Cold Circular Hollow | Circular sections (cold-formed) | `D`, `t` |
| `hchs.json` | Hot Circular Hollow | Circular sections (hot-finished) | `D`, `t` |

### 1.2 Geometric Parameters

#### RHS/SHS Sections (Rectangular/Square)
```javascript
{
  "profile": "CRHS 50x30 / 2.6",
  "h": 50,              // Height (mm) - overall dimension
  "b": 30,              // Width (mm) - overall dimension
  "t": 2.6,             // Uniform wall thickness (mm)
  "ro": 3.9,            // Outer corner radius (mm)
  "ri": 2.6,            // Inner corner radius (mm) = typically ro - t

  "plate_elements": [
    {
      "id": "top_flange",
      "type": "internal",
      "orientation": "z-direction",
      "geometry": {
        "gross_length": 30,    // b - total width
        "thickness": 2.6,
        "centroid": {
          "y": 23.7,           // +(h/2 - t/2) for top
          "z": 0
        },
        "edges": {
          "edge1": { "position": { "y": 23.7, "z": -11.1 } },
          "edge2": { "position": { "y": 23.7, "z": 11.1 } }
        }
      },
      "classification": {
        "c_formula": "(b - 3*t)"    // Accounts for corner radius
      }
    },
    {
      "id": "left_web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "gross_length": 50,    // h - total height
        "thickness": 2.6,
        "centroid": {
          "y": 0,
          "z": -13.7           // -(b/2 - t/2) for left
        },
        "edges": {
          "edge1": { "position": { "y": 21.1, "z": -13.7 } },
          "edge2": { "position": { "y": -21.1, "z": -13.7 } }
        }
      },
      "classification": {
        "c_formula": "(h - 3*t)"    // Accounts for corner radius
      }
    }
  ]
}
```

**Key Insights**:
- **Corner radius factor**: Classification uses `c = (dim - 3*t)` to account for rounded corners
- **Centroids for flanges**: `y = ±(h/2 - t/2)`, where sign indicates top (+) or bottom (-)
- **Centroids for webs**: `z = ±(b/2 - t/2)`, where sign indicates right (+) or left (-)
- **Edge positions**: Define the flat portion limits (excluding corner radius zones)
- **CSHS sections**: Have `centroid.y = null` for flanges, `centroid.z = null` for webs (fixed in flexural_buckling_api.js:668-736)

#### CHS Sections (Circular)
```javascript
{
  "profile": "CCHS 21.3 / 2",
  "D": 21.3,            // Outer diameter (mm)
  "t": 2,               // Wall thickness (mm)

  "plate_elements": [
    {
      "id": "circular_wall",
      "type": "circular",
      "orientation": "radial",
      "geometry": {
        "gross_length": 66.9159,   // π × D (circumference)
        "thickness": 2,
        "centroid": { "y": 0, "z": 0 }
      },
      "classification": {
        "c_formula": "D"
      },
      "reduction_patterns": {
        "compression_psi_1": "uniform_reduction"
      }
    }
  ]
}
```

**Key Insights**:
- **No discrete plates**: Circular sections are treated as a single uniform element
- **Uniform reduction**: Class 4 reduction applies uniformly around the circumference
- **No removed strips**: Effective thickness is used instead of removing discrete strips

---

## 2. Current Implementation Status

### 2.1 What's Already Working ✅

#### `section_plotter.js`
- ✅ Section type detection (`_detectSectionType`)
- ✅ RHS/SHS gross section drawing (`_drawHollowSection`) with rounded corners
- ✅ Canvas coordinate system with proper scaling
- ✅ Legend system with Class 4 indication
- ✅ Section label with dimensions
- ✅ Removed strip rectangle conversion (`_stripToRect`)
- ✅ Hatching for removed strips (`_drawHatching`)

#### `flexural_buckling_api.js`
- ✅ Null centroid handling for CSHS sections (lines 668-736)
- ✅ Removed strip calculation for internal compression elements
- ✅ Strip data structure with:
  ```javascript
  {
    id: string,              // e.g., "top_flange_center_strip"
    orientation: string,     // "y-direction" or "z-direction"
    width: number,           // Strip length in orientation direction (mm)
    thickness: number,       // Perpendicular dimension (mm)
    centroid: { y, z },      // Position in section coords (mm)
    area: number            // cm²
  }
  ```

### 2.2 What's Missing ❌

1. **CHS visualization**: No circular section plotting
2. **Corner radius handling**: Removed strips don't account for corner geometry
3. **Strip positioning accuracy**: Strips may overlap rounded corners
4. **Visual refinement**: No distinction between cold/hot-formed sections

---

## 3. Implementation Plan

### Phase 1: Circular Hollow Section (CHS) Plotting 🎯

**Goal**: Add complete CHS visualization support

#### 3.1 Detect CHS Sections
**File**: `section_plotter.js:_detectSectionType`

**Current code**:
```javascript
function _detectSectionType(section) {
  if (section.tw && section.tf) return 'i-section';
  if (section.t) {
    if (!section.h || section.h === section.b) return 'shs';
    return 'rhs';
  }
  return 'i-section';
}
```

**Add**:
```javascript
function _detectSectionType(section) {
  // I/H sections have: h, b, tw, tf
  if (section.tw && section.tf) {
    return 'i-section';
  }
  // Circular sections have: D (diameter) and t
  if (section.D && section.t) {
    return 'chs';
  }
  // Hollow sections have: t (uniform thickness), and either h+b or just b
  if (section.t) {
    if (!section.h || section.h === section.b) {
      return 'shs';
    }
    return 'rhs';
  }
  return 'i-section';
}
```

#### 3.2 Draw CHS Gross Section
**File**: `section_plotter.js:plot` (add new case)

**Add new function**:
```javascript
/**
 * Draw circular hollow section as concentric circles
 * Context must be in section coordinate space.
 */
function _drawCHSSection(ctx, section, opts, scale) {
  const D = section.D;          // Outer diameter
  const t = section.t;          // Wall thickness
  const R = D / 2;              // Outer radius
  const Ri = R - t;             // Inner radius

  ctx.fillStyle = opts.grossColor;
  ctx.strokeStyle = opts.grossStroke;
  ctx.lineWidth = opts.strokeWidth / scale;

  // Draw outer circle
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * Math.PI);

  // Draw inner circle (hole) - reverse winding
  ctx.arc(0, 0, Ri, 0, 2 * Math.PI, true);
  ctx.closePath();

  ctx.fill('evenodd');  // Use even-odd fill rule for the hole
  ctx.stroke();

  // Also stroke inner circle for clarity
  ctx.beginPath();
  ctx.arc(0, 0, Ri, 0, 2 * Math.PI);
  ctx.stroke();
}
```

**Update main plot function** (around line 134):
```javascript
// Draw gross section based on type
if (sectionType === 'i-section') {
  _drawISection(ctx, sectionWithDefaults, opts, scale);
} else if (sectionType === 'chs') {
  _drawCHSSection(ctx, sectionWithDefaults, opts, scale);
} else {
  _drawHollowSection(ctx, sectionWithDefaults, opts, scale);
}
```

#### 3.3 CHS Effective Properties Visualization
**Challenge**: CHS Class 4 sections use **uniform thickness reduction**, not discrete removed strips.

**Approach**: For CHS, visualize by drawing a semi-transparent "effective wall" with reduced thickness.

**Add function**:
```javascript
/**
 * Draw CHS effective wall (Class 4) as inner/outer effective radius
 * For CHS, rho reduction means effective wall moves inward
 */
function _drawCHSEffectiveWall(ctx, section, effectiveProperties, opts, scale) {
  // Check if CHS has uniform reduction
  const plateReduction = effectiveProperties.plate_reductions?.find(
    pr => pr.element === 'circular_wall'
  );

  if (!plateReduction || plateReduction.rho >= 1.0) {
    return;  // No reduction
  }

  const D = section.D;
  const t = section.t;
  const rho = plateReduction.rho;

  // Effective thickness
  const t_eff = rho * t;
  const t_removed = t - t_eff;

  // Draw removed thickness band (on inner face typically)
  const R = D / 2;
  const Ri = R - t;
  const R_eff_inner = Ri + t_removed;  // Effective inner radius (wall gets thinner)

  ctx.save();
  ctx.fillStyle = opts.removedColor;
  ctx.globalAlpha = opts.removedAlpha;

  // Draw annular ring between Ri and R_eff_inner
  ctx.beginPath();
  ctx.arc(0, 0, R_eff_inner, 0, 2 * Math.PI);
  ctx.arc(0, 0, Ri, 0, 2 * Math.PI, true);
  ctx.closePath();
  ctx.fill('evenodd');

  ctx.restore();
}
```

**Update plot function** (after removed strips section ~line 141):
```javascript
// Draw removed strips (if Class 4)
if (effectiveProperties && effectiveProperties.is_effective) {
  if (sectionType === 'chs') {
    _drawCHSEffectiveWall(ctx, sectionWithDefaults, effectiveProperties, opts, scale);
  } else if (effectiveProperties.removed_strips) {
    _drawRemovedStrips(ctx, effectiveProperties.removed_strips, opts, scale);
  }
}
```

#### 3.4 Update Dimension Labels for CHS
**File**: `section_plotter.js:_drawSectionLabel` (around line 376)

**Update**:
```javascript
function _drawSectionLabel(ctx, section, opts, canvas) {
  const name = section.profile || opts.sectionName || '';
  if (!name) return;

  let dims;
  if (section.D) {
    // Circular section
    dims = `D=${section.D} mm, t=${section.t} mm`;
  } else if (section.tw && section.tf) {
    // I/H section
    dims = `h=${section.h} mm, b=${section.b} mm, tw=${section.tw} mm, tf=${section.tf} mm`;
  } else if (section.t) {
    // Hollow section (RHS/SHS)
    if (section.h && section.h !== section.b) {
      dims = `h=${section.h} mm, b=${section.b} mm, t=${section.t} mm`;
    } else {
      dims = `b=${section.b} mm, t=${section.t} mm`;
    }
  } else {
    dims = `b=${section.b} mm`;
  }

  // ... rest of function
}
```

#### 3.5 Update Scale Calculation for CHS
**File**: `section_plotter.js:plot` (around line 126)

**Update**:
```javascript
// Calculate scale: fit section within the available plot area
let sectionWidth, sectionHeight;

if (sectionType === 'chs') {
  sectionWidth = sectionWithDefaults.D;
  sectionHeight = sectionWithDefaults.D;
} else {
  sectionWidth = sectionWithDefaults.b;
  sectionHeight = sectionWithDefaults.h;
}

const scale = Math.min(availW / sectionWidth, availH / sectionHeight);
```

---

### Phase 2: Corner Radius Visualization for RHS/SHS 🎯

**Goal**: Accurately show rounded corners and ensure removed strips don't overlap corner zones

#### 2.1 Current Corner Drawing
The current `_drawHollowSection` already draws rounded corners correctly for the **gross section** using `arcTo()`.

#### 2.2 Problem: Removed Strip Positioning
**Issue**: Removed strips are currently drawn as simple rectangles that may extend into corner radius zones.

**Example**: For `CRHS 50x30 / 2.6`:
- Flange classification: `c = b - 3*t = 30 - 3(2.6) = 22.2 mm`
- Flange gross length: `30 mm`
- Corner radius: `ro = 3.9 mm`
- Flat portion edges: `z = ±11.1 mm` (from database)

If the flange is Class 4 and the center strip is removed, it should only extend from `z = -11.1` to `z = +11.1 mm`, **not** into the corner radius zones.

#### 2.3 Solution: Clip Strips to Edge Positions
**File**: `section_plotter.js:_stripToRect`

**Current code** (line 314):
```javascript
function _stripToRect(strip) {
  const c = strip.centroid;
  const w = strip.width;
  const t = strip.thickness;

  if (strip.orientation === 'y-direction') {
    return { x: c.z - t / 2, y: c.y - w / 2, width: t, height: w };
  } else if (strip.orientation === 'z-direction') {
    return { x: c.z - w / 2, y: c.y - t / 2, width: w, height: t };
  }
  return null;
}
```

**Updated code**:
```javascript
function _stripToRect(strip) {
  const c = strip.centroid;
  const w = strip.width;       // dimension in orientation direction (mm)
  const t = strip.thickness;   // perpendicular dimension (mm)

  // Get edge limits if available (to avoid overlap with corner radii)
  const edges = strip.edges;

  if (strip.orientation === 'y-direction') {
    // Web strip: extends vertically (Y), thickness in Z
    let height = w;
    let yStart = c.y - w / 2;

    if (edges && edges.edge1 && edges.edge2) {
      // Use actual edge positions for accurate strip length
      const y1 = edges.edge1.position?.y ?? (c.y - w / 2);
      const y2 = edges.edge2.position?.y ?? (c.y + w / 2);
      yStart = Math.min(y1, y2);
      height = Math.abs(y2 - y1);
    }

    return { x: c.z - t / 2, y: yStart, width: t, height: height };

  } else if (strip.orientation === 'z-direction') {
    // Flange strip: extends horizontally (Z), thickness in Y
    let width = w;
    let zStart = c.z - w / 2;

    if (edges && edges.edge1 && edges.edge2) {
      // Use actual edge positions for accurate strip width
      const z1 = edges.edge1.position?.z ?? (c.z - w / 2);
      const z2 = edges.edge2.position?.z ?? (c.z + w / 2);
      zStart = Math.min(z1, z2);
      width = Math.abs(z2 - z1);
    }

    return { x: zStart, y: c.y - t / 2, width: width, height: t };
  }

  return null;
}
```

**Required**: Update `calculateRemovedStrips()` to include edge information in strip objects.

#### 2.4 Pass Edge Info in Removed Strips
**File**: `flexural_buckling_api.js:calculateRemovedStrips` (around line 730)

**Current strip creation**:
```javascript
strips.push({
  id: `${plate.id}_center_strip`,
  orientation: plate.orientation,
  width: strip_width,
  thickness: t,
  centroid: { y: centroid_y, z: centroid_z },
  area: A_removed_cm2
});
```

**Updated**:
```javascript
strips.push({
  id: `${plate.id}_center_strip`,
  orientation: plate.orientation,
  width: strip_width,
  thickness: t,
  centroid: { y: centroid_y, z: centroid_z },
  area: A_removed_cm2,
  edges: plate.geometry.edges  // Pass through edge positions
});
```

This allows the plotter to use actual edge positions when available.

---

### Phase 3: Visual Refinement 🎨

#### 3.1 Add Corner Radius to Section Labels
**Goal**: Show `ro` and `ri` in dimension labels for better understanding

**File**: `section_plotter.js:_drawSectionLabel`

**Update**:
```javascript
} else if (section.t) {
  // Hollow section (RHS/SHS)
  const ro = section.ro || section.r || 0;
  if (section.h && section.h !== section.b) {
    dims = `h=${section.h} mm, b=${section.b} mm, t=${section.t} mm` +
           (ro > 0 ? `, ro=${ro.toFixed(1)} mm` : '');
  } else {
    dims = `b=${section.b} mm, t=${section.t} mm` +
           (ro > 0 ? `, ro=${ro.toFixed(1)} mm` : '');
  }
}
```

#### 3.2 Optional: Hot vs Cold Formed Visual Distinction
**Goal**: Subtle visual cue for manufacturing process

**Approach**: Use slightly different stroke styles
- Cold-formed (CRHS, CSHS, CCHS): Current sharp outline
- Hot-finished (HRHS, HSHS, HCHS): Slightly softer stroke

**Implementation** (optional, low priority):
```javascript
// In _drawHollowSection or _drawCHSSection
const profileType = section.profile?.substring(0, 4).toUpperCase() || '';
const isHotFormed = profileType.startsWith('H');

ctx.strokeStyle = isHotFormed ?
  adjustColor(opts.grossStroke, -10) :  // Slightly lighter for hot-formed
  opts.grossStroke;
```

---

## 4. Testing Plan

### 4.1 Test Sections

#### RHS/SHS Tests
| Profile | Type | Classification | Test Focus |
|---------|------|----------------|------------|
| CSHS100X10 | Cold Square | Class 1-2 | Null centroid handling, no strips |
| CSHS100X3 | Cold Square | Class 4 | Removed strips, corner radius |
| CRHS 50x30 / 2.6 | Cold Rect | Class 4 | Edge position accuracy |
| HRHS 100x50 / 3 | Hot Rect | Class 3-4 | Hot-formed corners |

#### CHS Tests
| Profile | Type | Classification | Test Focus |
|---------|------|----------------|------------|
| CCHS 21.3 / 2 | Cold Circle | Class 1 | No reduction |
| CCHS 139.7 / 3.2 | Cold Circle | Class 4 (likely) | Uniform reduction visualization |

### 4.2 Test Procedure
1. **Visual inspection**: Plot each section and verify:
   - ✅ Correct gross outline with rounded corners
   - ✅ Removed strips don't overlap corners
   - ✅ Strip positions match database centroids
   - ✅ Legend accuracy (area reduction %)

2. **Console verification**: Check debug output:
   ```
   [Removed Strips] Plate top_flange: c_gross=22.20mm, c_eff=..., strip_width=...
   [SectionPlotter] Plotted CRHS 50x30 / 2.6 type= rhs scale= ...
   ```

3. **Cross-reference**: Compare plot against:
   - EN 1993-1-5 Table 4.1 (reduction patterns)
   - Database edge positions
   - Calculated strip widths

---

## 5. Implementation Order

### Step-by-Step Execution

1. **Phase 1.1**: Add CHS detection (5 min)
   - Update `_detectSectionType`
   - Test: Load a CCHS section, verify console shows correct type

2. **Phase 1.2**: Draw CHS gross section (15 min)
   - Add `_drawCHSSection` function
   - Update `plot()` to call it for CHS
   - Test: Plot CCHS 21.3 / 2, verify circles render correctly

3. **Phase 1.3**: CHS effective wall (20 min)
   - Add `_drawCHSEffectiveWall` function
   - Update effective properties rendering branch
   - Test: Plot Class 4 CHS, verify reduced wall appears

4. **Phase 1.4**: Update labels and scale (10 min)
   - Update `_drawSectionLabel` for D parameter
   - Update scale calculation for circular sections
   - Test: Verify dimension label shows "D=... mm, t=... mm"

5. **Phase 2.1**: Edge position clipping (25 min)
   - Update `calculateRemovedStrips` to include edges
   - Update `_stripToRect` to use edge positions
   - Test: Plot CRHS 50x30 / 2.6 Class 4, verify strips stop at edges

6. **Phase 3**: Visual refinements (15 min, optional)
   - Add corner radius to labels
   - Test: Verify labels show `ro=...` when present

**Total estimated time**: ~90 minutes for core features, +15 min for polish

---

## 6. Expected Results

### Before Implementation
- ❌ CHS sections fail to plot (no D parameter handling)
- ❌ RHS/SHS strips may extend into corner radius zones
- ❌ No visual feedback for CHS Class 4 reduction

### After Implementation
- ✅ All 6 hollow section types plot correctly:
  - CSHS, HSHS, CRHS, HRHS → Rectangular tubes with rounded corners
  - CCHS, HCHS → Concentric circles
- ✅ Class 4 removed strips:
  - RHS/SHS: Accurate rectangles clipped to flat portions
  - CHS: Uniform wall thickness reduction (annular ring)
- ✅ Corner radius visualization:
  - Smooth rounded corners on gross section
  - Strips respect corner geometry
- ✅ Complete dimension labels showing all relevant parameters

---

## 7. Files to Modify

| File | Changes | Lines Affected |
|------|---------|----------------|
| `section_plotter.js` | Add CHS functions, update detection, labels, scale | ~100 new lines |
| `flexural_buckling_api.js` | Pass edge info in removed strips | ~5 lines (around 730) |

---

## 8. Future Enhancements (Post-Implementation)

### 8.1 Interactive Features
- Click on removed strip to highlight corresponding plate element
- Tooltip showing strip dimensions on hover
- Toggle between gross and effective section views

### 8.2 Additional Visualizations
- Show neutral axis shift (effective vs gross centroid)
- Color-code by plate classification (Class 1 green, Class 4 red)
- Animate reduction process (fade in removed strips)

### 8.3 Export Features
- Export as SVG for vector graphics
- Export plot data as JSON
- Save plot to PNG

---

## 9. Known Limitations

### 9.1 Current Constraints
- **CHS Class 4 API**: The current `calculateClass4EffectiveProperties` may not return `removed_strips` for CHS (uses uniform reduction instead). The plotter handles this by checking `plate_reductions`.

- **Edge position availability**: Some older database entries might not have `edges` defined. The code falls back to centroid ± width/2.

- **Corner transition zones**: The exact transition between flat plate and corner radius is approximated by database edge positions. True geometry would require Bézier curve analysis.

### 9.2 Workarounds
- If `edges` is missing, use symmetric strip around centroid (current behavior)
- For CHS without plate_reductions, show warning and display gross section only

---

## 10. Success Criteria

Implementation is complete when:

1. ✅ All 6 hollow section types render correctly (CSHS, HSHS, CRHS, HRHS, CCHS, HCHS)
2. ✅ CHS Class 4 sections show effective wall reduction
3. ✅ RHS/SHS removed strips respect corner radius geometry
4. ✅ Dimension labels include all relevant parameters
5. ✅ No console errors for any test section
6. ✅ Visual accuracy matches EN 1993-1-5 reduction patterns
7. ✅ Test suite passes for all hollow section types

---

## References

- **EN 1993-1-1 Table 5.2**: Classification limits for hollow sections
- **EN 1993-1-5 Table 4.1**: Effective width distribution patterns
- **Database**: `steel_cross_section_database/*.json`
- **Related Docs**:
  - `NULL_CENTROID_FIX.md`
  - `SECTION_PLOTTER_HOLLOW_SECTIONS_FIX.md`
  - `EFFECTIVE_PROPERTIES_FIX_SUMMARY.md`
