# Database Metadata Enhancement Plan
## Plate Element Geometry for Effective Section Calculations

**Date**: 2026-02-27
**Status**: Planning
**Purpose**: Add detailed plate element geometry to enable accurate I_eff calculations using parallel axis theorem

---

## 1. Problem Statement

### Current Limitation
The existing implementation calculates I_eff using approximations:
- Web: Uses thin-walled formula I = (t/12) × h³
- Flanges: Uses area-proportional scaling
- **Missing**: Exact centroid locations and parallel axis theorem contributions

### What's Missing
For accurate I_eff calculation, we need:
```
I_total = Σ (I_local + A × d²)
```

Where:
- **I_local**: Local moment of inertia of plate about its own centroid
- **A**: Plate area
- **d**: Distance from plate centroid to section centroid
- **d²**: Parallel axis theorem contribution (often dominates!)

### Why This Matters

**Example**: Top flange of IPE220
```
Flange area = bf × tf = 11.0 × 0.92 = 10.12 cm²
Distance from section centroid: d = h/2 - tf/2 = 22.0/2 - 0.92/2 = 10.54 cm
Parallel axis contribution: A × d² = 10.12 × 10.54² = 1124 cm⁴
Local inertia about flange's own centroid: (bf × tf³)/12 = (11.0 × 0.92³)/12 = 0.07 cm⁴

Ratio: 1124 / 0.07 = 16,000:1 !!!
```

**The parallel axis term dominates!** Ignoring it leads to massive errors in I_eff.

---

## 2. Proposed Metadata Structure

### 2.1 New Fields for Each Profile

Add to each profile object:

```json
{
  "profile": "IPE220",
  "h": 220,
  "b": 110,
  "tw": 5.9,
  "tf": 9.2,
  "r": 12,
  "... existing fields ...",

  "plate_elements": [
    {
      "id": "top_flange",
      "type": "outstand",
      "orientation": "z-direction",
      "geometry": {
        "length": 110,
        "width": 9.2,
        "effective_length": 43.05,
        "centroid": {
          "y": 105.4,
          "z": -21.52
        }
      },
      "classification_params": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      }
    },
    {
      "id": "web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "length": 220,
        "width": 5.9,
        "effective_length": 177.6,
        "centroid": {
          "y": 0,
          "z": 0
        }
      },
      "classification_params": {
        "c_formula": "(h - 2*tf - 2*r)",
        "t_formula": "tw"
      }
    },
    {
      "id": "bottom_flange",
      "type": "outstand",
      "orientation": "z-direction",
      "geometry": {
        "length": 110,
        "width": 9.2,
        "effective_length": 43.05,
        "centroid": {
          "y": -105.4,
          "z": -21.52
        }
      },
      "classification_params": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      }
    }
  ]
}
```

### 2.2 Field Definitions

| Field | Type | Description | Example (IPE220 top flange) |
|-------|------|-------------|------------------------------|
| **id** | string | Unique identifier | "top_flange" |
| **type** | string | "internal", "outstand", "circular" | "outstand" |
| **orientation** | string | "y-direction" or "z-direction" | "z-direction" |
| **length** | number | Full gross length of plate (mm) | 110 |
| **width** | number | Thickness in classification direction (mm) | 9.2 |
| **effective_length** | number | Length used for classification c/t (mm) | 43.05 |
| **centroid.y** | number | Y-coordinate of plate centroid (mm) | 105.4 |
| **centroid.z** | number | Z-coordinate of plate centroid (mm) | -21.52 |

---

## 3. Coordinate System Convention

### 3.1 Global Section Coordinate System

```
      Y (vertical, major axis)
      ↑
      |
      |
      +--------→ Z (horizontal, minor axis)
     (0,0) = Section centroid
```

### 3.2 Orientation Definition

**"y-direction"**: Plate extends in Y direction, bends about Z axis
- Examples: Webs of I-sections, vertical walls of RHS
- Length = h (height)
- Width = t (thickness)
- Affects **I_z** when reduced

**"z-direction"**: Plate extends in Z direction, bends about Y axis
- Examples: Flanges of I-sections, horizontal walls of RHS
- Length = b (breadth)
- Width = t (thickness)
- Affects **I_y** when reduced

---

## 4. Geometry Calculations by Profile Type

### 4.1 I/H Sections (IPE, HEA, HEB, HEM)

#### Top Flange (Outstand Element)
```javascript
{
  id: "top_flange",
  type: "outstand",
  orientation: "z-direction",
  geometry: {
    length: b,  // Full flange width
    width: tf,  // Flange thickness
    effective_length: b/2 - tw/2 - r,  // c for classification
    centroid: {
      y: h/2 - tf/2,  // Distance from section centroid to flange mid-thickness
      z: -(b/4 + tw/4 + r/2)  // Midpoint between flange tip and web start (negative side)
    }
  }
}
```

**Note**: The outstand flange has TWO symmetric tips (left and right of web). We model each side separately or use one representative element.

#### Web (Internal Element)
```javascript
{
  id: "web",
  type: "internal",
  orientation: "y-direction",
  geometry: {
    length: h,  // Full height
    width: tw,  // Web thickness
    effective_length: h - 2*tf - 2*r,  // c for classification
    centroid: {
      y: 0,  // At section centroid
      z: 0   // At section centroid
    }
  }
}
```

#### Bottom Flange (Outstand Element)
```javascript
{
  id: "bottom_flange",
  type: "outstand",
  orientation: "z-direction",
  geometry: {
    length: b,
    width: tf,
    effective_length: b/2 - tw/2 - r,
    centroid: {
      y: -(h/2 - tf/2),  // Negative Y
      z: -(b/4 + tw/4 + r/2)  // Same Z as top flange (symmetric)
    }
  }
}
```

### 4.2 RHS/SHS Sections (HRHS, HSHS, CRHS, CSHS)

For rectangular hollow sections with rounded corners:

#### Top Flange (Internal Element)
```javascript
{
  id: "top_flange",
  type: "internal",
  orientation: "z-direction",
  geometry: {
    length: b,  // Outer width
    width: t,   // Wall thickness
    effective_length: b - 3*t,  // c for classification (straight length between corners)
    centroid: {
      y: h/2 - t/2,  // Top wall mid-thickness
      z: 0           // Symmetric
    }
  }
}
```

#### Bottom Flange (Internal Element)
```javascript
{
  id: "bottom_flange",
  type: "internal",
  orientation: "z-direction",
  geometry: {
    length: b,
    width: t,
    effective_length: b - 3*t,
    centroid: {
      y: -(h/2 - t/2),  // Bottom wall
      z: 0
    }
  }
}
```

#### Left Web (Internal Element)
```javascript
{
  id: "left_web",
  type: "internal",
  orientation: "y-direction",
  geometry: {
    length: h,
    width: t,
    effective_length: h - 3*t,  // Straight length between top and bottom corners
    centroid: {
      y: 0,
      z: -(b/2 - t/2)  // Left side
    }
  }
}
```

#### Right Web (Internal Element)
```javascript
{
  id: "right_web",
  type: "internal",
  orientation: "y-direction",
  geometry: {
    length: h,
    width: t,
    effective_length: h - 3*t,
    centroid: {
      y: 0,
      z: b/2 - t/2  // Right side (positive Z)
    }
  }
}
```

**Note for SHS**: h = b (square), so all four walls have the same effective_length.

### 4.3 CHS Sections (HCHS, CCHS)

For circular hollow sections:

```javascript
{
  id: "circular_wall",
  type: "circular",
  orientation: "radial",  // Special case
  geometry: {
    diameter: D,  // Outer diameter
    width: t,     // Wall thickness
    effective_length: D,  // For classification (d/t ratio)
    centroid: {
      y: 0,  // At section centroid (circular symmetry)
      z: 0
    }
  }
}
```

**Note**: CHS has no plate centroid offset - all reductions are symmetric about the center.

---

## 5. Updated I_eff Calculation Algorithm

### 5.1 Parallel Axis Theorem Application

For each Class 4 plate element:

```javascript
// 1. Calculate effective width/length
const c_eff = rho * c_gross;

// 2. Area reduction
const A_reduction = (c_gross - c_eff) * t / 100;  // mm² → cm²

// 3. Local inertia reduction (about plate's own centroid)
let I_local_reduction = 0;
if (plate.orientation === 'y-direction') {
  // Plate extends in Y, affects I_z
  I_local_reduction = (t/10) * (Math.pow(c_gross/10, 3) - Math.pow(c_eff/10, 3)) / 12;
} else if (plate.orientation === 'z-direction') {
  // Plate extends in Z, affects I_y
  I_local_reduction = (t/10) * (Math.pow(c_gross/10, 3) - Math.pow(c_eff/10, 3)) / 12;
}

// 4. Parallel axis reduction
const d_y = plate.geometry.centroid.y / 10;  // mm → cm
const d_z = plate.geometry.centroid.z / 10;  // mm → cm

let I_parallel_y = 0;
let I_parallel_z = 0;

if (plate.orientation === 'y-direction') {
  // Plate at distance d_z from Z-axis, affects I_z
  I_parallel_z = A_reduction * d_z * d_z;
} else if (plate.orientation === 'z-direction') {
  // Plate at distance d_y from Y-axis, affects I_y
  I_parallel_y = A_reduction * d_y * d_y;
}

// 5. Total inertia reduction
I_eff_y -= (I_local_reduction + I_parallel_y);
I_eff_z -= (I_local_reduction + I_parallel_z);
```

### 5.2 Correct Formula Summary

```
For a removed plate strip:

ΔI = ΔI_local + ΔI_parallel

Where:
  ΔI_local = (t/12) × (c³_gross - c³_eff)
  ΔI_parallel = ΔA × d²
  ΔA = (c_gross - c_eff) × t
  d = distance from plate centroid to section centroid
```

---

## 6. Implementation Phases

### Phase 1: Template Updates (No database changes yet)
**Goal**: Update classification templates to include geometry metadata structure

**Files**:
- `classification_templates/i_section_template.json`
- `classification_templates/rhs_template.json`
- `classification_templates/chs_template.json`

**Add**:
```json
{
  "subplates": [
    {
      "id": "top_flange",
      "type": "outstand",
      "orientation": "z-direction",
      "c_formula": "(b/2 - tw/2 - r)",
      "t_formula": "tf",
      "length_formula": "b",
      "centroid_y_formula": "(h/2 - tf/2)",
      "centroid_z_formula": "-(b/4 + tw/4 + r/2)"
    }
  ]
}
```

### Phase 2: Script to Generate Metadata
**Goal**: Create automated script to add plate_elements to all profiles

**Script**: `generate_plate_metadata.js`

```javascript
// Read each profile database (ipe.json, hea.json, etc.)
// For each profile:
//   1. Identify profile type (I, RHS, CHS)
//   2. Apply template formulas
//   3. Calculate centroid positions
//   4. Add plate_elements array
//   5. Write back to database
```

### Phase 3: Update API to Use New Metadata
**Goal**: Modify `calculateClass4EffectiveProperties()` to use plate centroids

**Changes in `flexural_buckling_api.js`**:
1. Read `plate_elements` array from section
2. For each Class 4 element, calculate:
   - Local I reduction
   - Parallel axis I reduction
3. Apply to correct axis based on `orientation`

### Phase 4: Validation
**Goal**: Verify calculations against manual calculations and commercial software

**Test cases**:
- IPE220 / S460 (Class 4 web)
- HEA800 / S235 (Class 4 web)
- CSHS200X4 / S235 (Class 4 all walls)

### Phase 5: Future - Neutral Axis Shift for Bending
**Goal**: Handle neutral axis shift for Class 4 sections in bending

**When needed**:
- Bending classification (ψ ≠ 1.0)
- Unsymmetric Class 4 reductions
- Calculate effective section modulus W_eff

**Requires**:
- Recalculate centroid location after area reductions
- Apply shift: e_N = (Σ A_i × y_i) / Σ A_i
- Recalculate I about new neutral axis

---

## 7. Database File Structure

### 7.1 Example: IPE220 (Complete)

```json
{
  "profile": "IPE220",
  "h": 220,
  "b": 110,
  "tw": 5.9,
  "tf": 9.2,
  "r": 12,
  "m": 26.2,
  "A": 33.37,
  "Iy": 2772,
  "Iz": 162.3,
  "iy": 9.11,
  "iz": 2.2,
  "Wel_y": 252,
  "Wel_z": 29.5,
  "Wpl_y": 285.4,
  "Wpl_z": 46.5,
  "IT": 6.98,
  "WT": 75.6,

  "plate_elements": [
    {
      "id": "top_flange",
      "type": "outstand",
      "orientation": "z-direction",
      "geometry": {
        "length": 110,
        "width": 9.2,
        "effective_length": 43.05,
        "centroid": {
          "y": 105.4,
          "z": -21.525
        }
      },
      "classification_params": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      }
    },
    {
      "id": "web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "length": 220,
        "width": 5.9,
        "effective_length": 177.6,
        "centroid": {
          "y": 0,
          "z": 0
        }
      },
      "classification_params": {
        "c_formula": "(h - 2*tf - 2*r)",
        "t_formula": "tw"
      }
    },
    {
      "id": "bottom_flange",
      "type": "outstand",
      "orientation": "z-direction",
      "geometry": {
        "length": 110,
        "width": 9.2,
        "effective_length": 43.05,
        "centroid": {
          "y": -105.4,
          "z": -21.525
        }
      },
      "classification_params": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      }
    }
  ]
}
```

### 7.2 Example: CSHS200X4 (Complete)

```json
{
  "profile": "CSHS200X4",
  "b": 200,
  "t": 4,
  "ro": 12,
  "ri": 8,
  "m": 23.5,
  "A": 29.93,
  "Iy": 4343,
  "Iz": 4343,
  "iy": 12.05,
  "iz": 12.05,

  "plate_elements": [
    {
      "id": "top_flange",
      "type": "internal",
      "orientation": "z-direction",
      "geometry": {
        "length": 200,
        "width": 4,
        "effective_length": 188,
        "centroid": {
          "y": 98,
          "z": 0
        }
      },
      "classification_params": {
        "c_formula": "(b - 3*t)",
        "t_formula": "t"
      }
    },
    {
      "id": "bottom_flange",
      "type": "internal",
      "orientation": "z-direction",
      "geometry": {
        "length": 200,
        "width": 4,
        "effective_length": 188,
        "centroid": {
          "y": -98,
          "z": 0
        }
      },
      "classification_params": {
        "c_formula": "(b - 3*t)",
        "t_formula": "t"
      }
    },
    {
      "id": "left_web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "length": 200,
        "width": 4,
        "effective_length": 188,
        "centroid": {
          "y": 0,
          "z": -98
        }
      },
      "classification_params": {
        "c_formula": "(b - 3*t)",
        "t_formula": "t"
      }
    },
    {
      "id": "right_web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "length": 200,
        "width": 4,
        "effective_length": 188,
        "centroid": {
          "y": 0,
          "z": 98
        }
      },
      "classification_params": {
        "c_formula": "(b - 3*t)",
        "t_formula": "t"
      }
    }
  ]
}
```

---

## 8. Validation Strategy

### 8.1 Manual Verification

For IPE220 web (Class 4 with S460):
```
Given:
  c_gross = 177.6 mm
  c_eff = 158.5 mm (ρ = 0.8924)
  tw = 5.9 mm
  Plate centroid: y = 0, z = 0 (at section centroid)

Calculate:
  ΔA = (177.6 - 158.5) × 5.9 / 100 = 1.13 cm²

  ΔI_local = (5.9/10) / 12 × [(17.76³ - 15.85³)]
           = 0.0492 × 1604 = 78.9 cm⁴

  ΔI_parallel = ΔA × d² = 1.13 × 0² = 0 cm⁴  (web at centroid)

  ΔI_y_total = 78.9 + 0 = 78.9 cm⁴

  I_eff,y = 2772 - 78.9 = 2693 cm⁴

  i_eff,y = √(2693 / 32.24) = 9.14 cm
```

### 8.2 Comparison with Commercial Software

Run same cases in:
- SCIA Engineer
- Robot Structural Analysis
- Tekla Tedds

Compare:
- A_eff
- I_eff,y and I_eff,z
- i_eff,y and i_eff,z
- Nb,Rd

---

## 9. Benefits of This Approach

✅ **Accurate I_eff**: Includes parallel axis theorem
✅ **Future-proof**: Ready for bending (neutral axis shift)
✅ **Transparent**: Users can see exactly what's reduced
✅ **Flexible**: Easy to add new profile types
✅ **Verifiable**: Can validate against manual calculations

---

## 10. Open Questions

1. **Flange tip modeling for I-sections**:
   - Model as single element with symmetric tips?
   - Or split into left_flange_tip and right_flange_tip?

2. **Fillet radius treatment**:
   - Currently excluded from effective length (c = h - 2×tf - 2×r)
   - Should we add back some of the radius? (EC3 is unclear)

3. **Cold-formed vs hot-rolled**:
   - Different corner radii treatment?
   - Different effective length formulas?

---

## 11. Next Steps

1. **Review and approve this plan**
2. **Create metadata generation script** (Phase 2)
3. **Test on 2-3 profiles manually** (validation)
4. **Generate metadata for all profiles** (~1000+ profiles)
5. **Update API to use new metadata** (Phase 3)
6. **Run validation tests** (Phase 4)
7. **Commit and push to branch**

---

**Estimated Effort**: 4-6 hours
**Risk**: Low (no breaking changes to existing API if done incrementally)
**Impact**: High (foundation for accurate Class 4 and future bending classification)
