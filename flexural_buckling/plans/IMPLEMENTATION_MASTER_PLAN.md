# Master Implementation Plan: Class 4 Effective Section Properties
## Complete Implementation Guide for Database + API Updates

**Date**: 2026-03-02
**Status**: READY FOR IMPLEMENTATION
**Scope**: Full effective section calculation with neutral axis shift
**Standards**: EN 1993-1-1 Section 5.5, EN 1993-1-5 Section 4.4

---

## Executive Summary

This plan provides complete, step-by-step instructions for implementing accurate Class 4 effective section property calculations, including:

1. **Database metadata enhancement** - Add plate element geometry to all profiles
2. **Plate reduction patterns** - Handle all 5 reduction cases per EN 1993-1-5
3. **Effective properties calculation** - A_eff, I_eff, W_eff with proper parallel axis theorem
4. **Neutral axis shift** - Calculate and apply centroid shift for unsymmetric reductions
5. **API integration** - Update calculation functions to use new metadata

**Result**: Accurate effective properties for buckling and bending verification.

---

## Part 1: Database Metadata Structure

### 1.1 Overview

Each profile gets a `plate_elements` array describing every plate component with:
- Geometric properties (dimensions, centroids, edges)
- Classification parameters (formulas for c, t)
- Reduction behavior (pattern per stress ratio ψ)

### 1.2 Coordinate System

```
      Y (vertical, major axis)
      ↑
      |
      +--------→ Z (horizontal, minor axis)
     (0,0) = GROSS section centroid

After Class 4 reductions → (0,0) may shift to (e_N,y, e_N,z)
```

**Orientation definitions**:
- **"y-direction"**: Plate extends along Y-axis, cross-section bends about Z-axis
  - Affects I_z when reduced
  - Examples: Webs of I-sections, vertical walls of RHS

- **"z-direction"**: Plate extends along Z-axis, cross-section bends about Y-axis
  - Affects I_y when reduced
  - Examples: Flanges of I-sections, horizontal walls of RHS

### 1.3 Plate Element Schema

```typescript
interface PlateElement {
  // Identification
  id: string;                    // "web", "top_flange", "left_web", etc.
  type: "internal" | "outstand" | "circular";
  orientation: "y-direction" | "z-direction" | "radial";

  // Gross geometry
  geometry: {
    gross_length: number;        // Full plate length (mm)
    thickness: number;           // Plate thickness (mm)

    // Centroid of GROSS plate element
    centroid: {
      y: number;                 // mm from section centroid
      z: number;                 // mm from section centroid
    };

    // Edge positions (for tracking where to remove material)
    edges: {
      edge1: {
        id: string;              // "top_edge", "free_edge", etc.
        position: { y: number; z: number };  // mm
        type: "free" | "supported" | "junction";
      };
      edge2?: {                  // Optional (outstand has only 1 edge)
        id: string;
        position: { y: number; z: number };
        type: "free" | "supported" | "junction";
      };
    };
  };

  // Classification parameters
  classification: {
    c_formula: string;           // "(h - 2*tf - 2*r)" for webs
    t_formula: string;           // "tw" for webs
  };

  // Reduction patterns (see PLATE_REDUCTION_PATTERNS.md)
  reduction_patterns: {
    compression_psi_1: "symmetric_edge";          // ψ = 1
    compression_psi_positive: "asymmetric_edge";  // 1 > ψ > 0
    bending_psi_negative: "compression_edge";     // ψ < 0 (internal)
    outstand_psi_positive: "free_edge";           // ψ ≥ 0 (outstand)
    outstand_psi_negative: "internal_strip";      // ψ < 0 (outstand)
  };
}
```

### 1.4 Complete Example: IPE220

```json
{
  "profile": "IPE220",
  "h": 220,
  "b": 110,
  "tw": 5.9,
  "tf": 9.2,
  "r": 12,
  "A": 33.37,
  "Iy": 2772,
  "Iz": 162.3,
  "iy": 9.11,
  "iz": 2.2,

  "plate_elements": [
    {
      "id": "web",
      "type": "internal",
      "orientation": "y-direction",

      "geometry": {
        "gross_length": 220,
        "thickness": 5.9,
        "centroid": {
          "y": 0,
          "z": 0
        },
        "edges": {
          "edge1": {
            "id": "top_junction",
            "position": { "y": 88.8, "z": 0 },
            "type": "junction"
          },
          "edge2": {
            "id": "bottom_junction",
            "position": { "y": -88.8, "z": 0 },
            "type": "junction"
          }
        }
      },

      "classification": {
        "c_formula": "(h - 2*tf - 2*r)",
        "t_formula": "tw"
      },

      "reduction_patterns": {
        "compression_psi_1": "symmetric_edge",
        "compression_psi_positive": "asymmetric_edge",
        "bending_psi_negative": "compression_edge"
      }
    },

    {
      "id": "top_flange_tip",
      "type": "outstand",
      "orientation": "z-direction",

      "geometry": {
        "gross_length": 43.05,
        "thickness": 9.2,
        "centroid": {
          "y": 105.4,
          "z": -21.525
        },
        "edges": {
          "edge1": {
            "id": "web_junction",
            "position": { "y": 105.4, "z": -2.95 },
            "type": "junction"
          },
          "edge2": {
            "id": "free_edge",
            "position": { "y": 105.4, "z": -55 },
            "type": "free"
          }
        }
      },

      "classification": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      },

      "reduction_patterns": {
        "compression_psi_positive": "free_edge",
        "bending_psi_negative": "internal_strip"
      }
    },

    {
      "id": "bottom_flange_tip",
      "type": "outstand",
      "orientation": "z-direction",

      "geometry": {
        "gross_length": 43.05,
        "thickness": 9.2,
        "centroid": {
          "y": -105.4,
          "z": -21.525
        },
        "edges": {
          "edge1": {
            "id": "web_junction",
            "position": { "y": -105.4, "z": -2.95 },
            "type": "junction"
          },
          "edge2": {
            "id": "free_edge",
            "position": { "y": -105.4, "z": -55 },
            "type": "free"
          }
        }
      },

      "classification": {
        "c_formula": "(b/2 - tw/2 - r)",
        "t_formula": "tf"
      },

      "reduction_patterns": {
        "compression_psi_positive": "free_edge",
        "bending_psi_negative": "internal_strip"
      }
    }
  ]
}
```

### 1.5 Database Generation Script

**File**: `scripts/generate_plate_metadata.js`

```javascript
/**
 * Generates plate_elements metadata for all profiles in database
 * Usage: node scripts/generate_plate_metadata.js
 */

const fs = require('fs');
const path = require('path');

// Profile type handlers
const profileHandlers = {
  ipe: generateIPEMetadata,
  hea: generateHEAMetadata,
  heb: generateHEBMetadata,
  hem: generateHEMMetadata,
  hrhs: generateRHSMetadata,
  hshs: generateSHSMetadata,
  crhs: generateRHSMetadata,
  cshs: generateSHSMetadata,
  hchs: generateCHSMetadata,
  cchs: generateCHSMetadata
};

function generateIPEMetadata(profile) {
  const { h, b, tw, tf, r } = profile;

  // Web effective length
  const web_c = h - 2*tf - 2*r;

  // Flange tip effective length
  const flange_c = b/2 - tw/2 - r;

  return [
    {
      id: "web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: tw,
        centroid: { y: 0, z: 0 },
        edges: {
          edge1: {
            id: "top_junction",
            position: { y: web_c/2, z: 0 },
            type: "junction"
          },
          edge2: {
            id: "bottom_junction",
            position: { y: -web_c/2, z: 0 },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(h - 2*tf - 2*r)",
        t_formula: "tw"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    {
      id: "top_flange_tip",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: h/2 - tf/2,
          z: -(tw/2 + r + flange_c/2)
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: h/2 - tf/2, z: -(tw/2 + r) },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: h/2 - tf/2, z: -(tw/2 + r + flange_c) },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    },

    // Bottom flange (mirror of top)
    {
      id: "bottom_flange_tip",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: -(h/2 - tf/2),
          z: -(tw/2 + r + flange_c/2)
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: -(h/2 - tf/2), z: -(tw/2 + r) },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: -(h/2 - tf/2), z: -(tw/2 + r + flange_c) },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    }
  ];
}

function generateRHSMetadata(profile) {
  const { h, b, t } = profile;

  // Effective lengths (straight part between corners)
  const h_eff = h - 3*t;
  const b_eff = b - 3*t;

  return [
    {
      id: "top_flange",
      type: "internal",
      orientation: "z-direction",
      geometry: {
        gross_length: b,
        thickness: t,
        centroid: { y: h/2 - t/2, z: 0 },
        edges: {
          edge1: { id: "left_corner", position: { y: h/2 - t/2, z: -b_eff/2 }, type: "junction" },
          edge2: { id: "right_corner", position: { y: h/2 - t/2, z: b_eff/2 }, type: "junction" }
        }
      },
      classification: {
        c_formula: "(b - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    {
      id: "bottom_flange",
      type: "internal",
      orientation: "z-direction",
      geometry: {
        gross_length: b,
        thickness: t,
        centroid: { y: -(h/2 - t/2), z: 0 },
        edges: {
          edge1: { id: "left_corner", position: { y: -(h/2 - t/2), z: -b_eff/2 }, type: "junction" },
          edge2: { id: "right_corner", position: { y: -(h/2 - t/2), z: b_eff/2 }, type: "junction" }
        }
      },
      classification: {
        c_formula: "(b - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    {
      id: "left_web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: t,
        centroid: { y: 0, z: -(b/2 - t/2) },
        edges: {
          edge1: { id: "top_corner", position: { y: h_eff/2, z: -(b/2 - t/2) }, type: "junction" },
          edge2: { id: "bottom_corner", position: { y: -h_eff/2, z: -(b/2 - t/2) }, type: "junction" }
        }
      },
      classification: {
        c_formula: "(h - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    {
      id: "right_web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: t,
        centroid: { y: 0, z: b/2 - t/2 },
        edges: {
          edge1: { id: "top_corner", position: { y: h_eff/2, z: b/2 - t/2 }, type: "junction" },
          edge2: { id: "bottom_corner", position: { y: -h_eff/2, z: b/2 - t/2 }, type: "junction" }
        }
      },
      classification: {
        c_formula: "(h - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    }
  ];
}

function generateCHSMetadata(profile) {
  const { D, t } = profile;

  return [
    {
      id: "circular_wall",
      type: "circular",
      orientation: "radial",
      geometry: {
        gross_length: Math.PI * D,  // Circumference
        thickness: t,
        centroid: { y: 0, z: 0 },
        edges: {}  // No discrete edges for circular
      },
      classification: {
        c_formula: "D",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "uniform_reduction"
      }
    }
  ];
}

// Main execution
function processDatabase() {
  const dbPath = path.join(__dirname, '..', 'steel_cross_section_database');

  for (const [profileType, handler] of Object.entries(profileHandlers)) {
    const filename = `${profileType}.json`;
    const filepath = path.join(dbPath, filename);

    if (!fs.existsSync(filepath)) continue;

    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    // Process each profile
    for (const profile of data.profiles) {
      if (!profile.plate_elements) {
        profile.plate_elements = handler(profile);
      }
    }

    // Write back
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`✓ Processed ${filename}: ${data.profiles.length} profiles`);
  }
}

processDatabase();
```

---

## Part 2: Effective Section Properties Calculation

### 2.1 Algorithm Overview

```
1. Classify section → identify Class 4 elements
2. For each Class 4 element:
   a. Determine reduction pattern based on ψ
   b. Calculate effective width b_eff or c_eff
   c. Calculate removed strip(s) geometry
   d. Calculate removed strip centroid(s)
3. Calculate effective area: A_eff = A_gross - Σ A_removed
4. Calculate neutral axis shift: e_N = Σ(A_removed × d) / A_eff
5. Calculate effective moments: I_eff = I_gross - Σ ΔI - A_eff × e_N²
6. Calculate effective section moduli: W_eff = I_eff / distance_to_fiber
```

### 2.2 Neutral Axis Shift Calculation

**Per EN 1993-1-5 Section 4.3(3) and Figure 4.1**:

When plate elements are removed unsymmetrically, the centroid shifts:

```javascript
/**
 * Calculate neutral axis shift due to Class 4 reductions
 * Returns shift (e_N,y, e_N,z) from gross centroid to effective centroid
 */
function calculateNeutralAxisShift(section, removedStrips) {
  let sum_A_removed_y = 0;  // Σ(A_removed × y_centroid)
  let sum_A_removed_z = 0;  // Σ(A_removed × z_centroid)
  let total_A_removed = 0;

  for (const strip of removedStrips) {
    const A = strip.area;  // cm²
    const y = strip.centroid.y / 10;  // mm → cm
    const z = strip.centroid.z / 10;  // mm → cm

    sum_A_removed_y += A * y;
    sum_A_removed_z += A * z;
    total_A_removed += A;
  }

  const A_eff = section.A_gross - total_A_removed;

  // Shift = (Σ A_removed × centroid) / A_eff
  // Note: Formula accounts for REMOVED area, not kept area
  const e_N_y = sum_A_removed_y / A_eff;
  const e_N_z = sum_A_removed_z / A_eff;

  return { e_N_y, e_N_z };
}
```

**Key insight**: The formula uses removed areas, not kept areas:
```
e_N = (Σ A_removed × d_removed) / A_eff

NOT:
e_N = (Σ A_kept × d_kept) / A_eff  ❌ WRONG!
```

### 2.3 Effective Moment of Inertia with Neutral Axis Shift

**Two-step process**:

```javascript
/**
 * Step 1: Remove ineffective strips (parallel axis theorem for strips)
 * Step 2: Apply shift correction (parallel axis theorem for entire section)
 */
function calculateEffectiveMomentOfInertia(section, removedStrips, e_N) {
  let I_eff_y = section.Iy_gross;
  let I_eff_z = section.Iz_gross;

  // STEP 1: Subtract removed strips
  for (const strip of removedStrips) {
    const A_removed = strip.area;  // cm²
    const t = strip.thickness / 10;  // mm → cm
    const width = strip.width / 10;  // mm → cm

    // Local inertia of removed strip
    let I_local = 0;
    if (strip.orientation === 'y-direction') {
      // Strip extends in Y, local inertia about its own centroid
      I_local = (t * Math.pow(width, 3)) / 12;
    } else if (strip.orientation === 'z-direction') {
      // Strip extends in Z
      I_local = (t * Math.pow(width, 3)) / 12;
    }

    // Distance from strip centroid to GROSS section centroid
    const d_y = strip.centroid.y / 10;  // mm → cm
    const d_z = strip.centroid.z / 10;

    // Parallel axis contribution for strip
    const I_parallel_y = A_removed * d_y * d_y;
    const I_parallel_z = A_removed * d_z * d_z;

    // Subtract from appropriate axis
    if (strip.orientation === 'y-direction') {
      // Affects I_z
      I_eff_z -= (I_local + I_parallel_z);
    } else if (strip.orientation === 'z-direction') {
      // Affects I_y
      I_eff_y -= (I_local + I_parallel_y);
    }
  }

  // STEP 2: Apply neutral axis shift correction
  // When centroid shifts, we need to transform to new axes
  // I_new = I_old - A_eff × e_N²
  const A_eff = section.A_gross - removedStrips.reduce((sum, s) => sum + s.area, 0);

  I_eff_y -= A_eff * e_N.e_N_z * e_N.e_N_z;  // Note: e_N_z affects I_y!
  I_eff_z -= A_eff * e_N.e_N_y * e_N.e_N_y;  // Note: e_N_y affects I_z!

  return { I_eff_y, I_eff_z };
}
```

**Important**: The neutral axis shift correction uses **opposite axes**:
- Shift in Z (e_N,z) affects I_y
- Shift in Y (e_N,y) affects I_z

### 2.4 Effective Section Modulus

```javascript
/**
 * Calculate effective section moduli for bending
 * Must account for neutral axis shift
 */
function calculateEffectiveSectionModulus(I_eff, e_N, section) {
  // Distances from NEW centroid to extreme fibers
  const distance_top = (section.h/2 / 10) - e_N.e_N_y;     // cm
  const distance_bottom = (section.h/2 / 10) + e_N.e_N_y;  // cm
  const distance_left = (section.b/2 / 10) + e_N.e_N_z;    // cm
  const distance_right = (section.b/2 / 10) - e_N.e_N_z;   // cm

  // Section moduli (limiting fiber governs)
  const W_eff_y_top = I_eff.I_eff_y / distance_top;
  const W_eff_y_bottom = I_eff.I_eff_y / distance_bottom;
  const W_eff_z_left = I_eff.I_eff_z / distance_left;
  const W_eff_z_right = I_eff.I_eff_z / distance_right;

  // Take minimum (governing)
  const W_eff_y = Math.min(W_eff_y_top, W_eff_y_bottom);
  const W_eff_z = Math.min(W_eff_z_left, W_eff_z_right);

  return {
    W_eff_y,
    W_eff_z,
    W_eff_y_top,
    W_eff_y_bottom,
    W_eff_z_left,
    W_eff_z_right
  };
}
```

### 2.5 Complete Calculation Function

**File**: `flexural_buckling_api.js`

```javascript
/**
 * Calculate Class 4 effective properties with neutral axis shift
 * @param {Object} section - Gross section with plate_elements
 * @param {Object} classification - Classification results
 * @param {string} profileType - Profile type
 * @param {number} psi - Stress ratio (1.0 for pure compression)
 * @returns {Object} Effective section properties
 */
function calculateClass4EffectiveProperties(section, classification, profileType, psi = 1.0) {

  const removedStrips = [];

  // STEP 1: Calculate removed strips for each Class 4 element
  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const plate = section.plate_elements.find(p => p.id === element.id);
    if (!plate) {
      console.warn(`Plate element ${element.id} not found in section metadata`);
      continue;
    }

    // Determine reduction pattern based on psi
    const pattern = determineReductionPattern(plate, psi);

    // Calculate effective width
    const rho = calculateReductionFactor(element, psi);
    const strips = calculateRemovedStrips(plate, element, rho, pattern, psi);

    removedStrips.push(...strips);
  }

  // STEP 2: Calculate effective area
  const A_gross = section.A;  // cm²
  const total_A_removed = removedStrips.reduce((sum, s) => sum + s.area, 0);
  const A_eff = A_gross - total_A_removed;

  // STEP 3: Calculate neutral axis shift
  const e_N = calculateNeutralAxisShift(section, removedStrips);

  // STEP 4: Calculate effective moments of inertia
  const I_eff = calculateEffectiveMomentOfInertia(section, removedStrips, e_N);

  // STEP 5: Calculate radii of gyration
  const i_eff_y = Math.sqrt(I_eff.I_eff_y / A_eff);
  const i_eff_z = Math.sqrt(I_eff.I_eff_z / A_eff);

  // STEP 6: Calculate section moduli
  const W_eff = calculateEffectiveSectionModulus(I_eff, e_N, section);

  return {
    // Effective properties
    A_eff,
    I_eff_y: I_eff.I_eff_y,
    I_eff_z: I_eff.I_eff_z,
    i_eff_y,
    i_eff_z,
    W_eff_y: W_eff.W_eff_y,
    W_eff_z: W_eff.W_eff_z,

    // Neutral axis shift
    e_N_y: e_N.e_N_y,
    e_N_z: e_N.e_N_z,

    // Tracking
    gross_A: A_gross,
    gross_Iy: section.Iy,
    gross_Iz: section.Iz,
    area_reduction_percent: (total_A_removed / A_gross) * 100,
    Iy_reduction_percent: ((section.Iy - I_eff.I_eff_y) / section.Iy) * 100,
    Iz_reduction_percent: ((section.Iz - I_eff.I_eff_z) / section.Iz) * 100,

    // Debug info
    removed_strips: removedStrips,
    neutral_axis_shifted: (Math.abs(e_N.e_N_y) > 0.01 || Math.abs(e_N.e_N_z) > 0.01)
  };
}
```

### 2.6 Removed Strip Calculation by Pattern

```javascript
/**
 * Calculate removed strip geometry based on reduction pattern
 */
function calculateRemovedStrips(plate, element, rho, pattern, psi) {
  const strips = [];

  const c_gross = element.c;  // mm
  const t = element.t;        // mm
  const c_eff = rho * c_gross;

  if (pattern === 'symmetric_edge') {
    // Pattern A: Two equal strips at edges
    const strip_width = (c_gross - c_eff) / 2;
    const b_c1 = c_eff / 2;  // Kept width at each edge

    // Strip 1 (e.g., top edge)
    const strip1_centroid = calculateStripCentroid(
      plate,
      plate.geometry.edges.edge1.position,
      strip_width,
      'inward'
    );

    strips.push({
      id: `${plate.id}_strip1`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,  // mm² → cm²
      centroid: strip1_centroid,
      orientation: plate.orientation
    });

    // Strip 2 (e.g., bottom edge)
    const strip2_centroid = calculateStripCentroid(
      plate,
      plate.geometry.edges.edge2.position,
      strip_width,
      'inward'
    );

    strips.push({
      id: `${plate.id}_strip2`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      centroid: strip2_centroid,
      orientation: plate.orientation
    });

  } else if (pattern === 'asymmetric_edge') {
    // Pattern B: Two unequal strips
    const b_c1 = (2 / (5 - psi)) * c_eff;
    const b_c2 = c_eff - b_c1;

    const strip1_width = c_gross/2 - b_c1;
    const strip2_width = c_gross/2 - b_c2;

    // Strip 1 (less compressed edge - larger removal)
    strips.push({
      id: `${plate.id}_strip1`,
      width: strip1_width,
      thickness: t,
      area: (strip1_width * t) / 100,
      centroid: calculateStripCentroid(plate, plate.geometry.edges.edge1.position, strip1_width, 'inward'),
      orientation: plate.orientation
    });

    // Strip 2 (more compressed edge - smaller removal)
    strips.push({
      id: `${plate.id}_strip2`,
      width: strip2_width,
      thickness: t,
      area: (strip2_width * t) / 100,
      centroid: calculateStripCentroid(plate, plate.geometry.edges.edge2.position, strip2_width, 'inward'),
      orientation: plate.orientation
    });

  } else if (pattern === 'free_edge') {
    // Pattern C: Single strip at free edge
    const strip_width = c_gross - c_eff;
    const free_edge = Object.values(plate.geometry.edges).find(e => e.type === 'free');

    strips.push({
      id: `${plate.id}_strip_free`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      centroid: calculateStripCentroid(plate, free_edge.position, strip_width, 'inward'),
      orientation: plate.orientation
    });

  } else if (pattern === 'internal_strip') {
    // Pattern D: Strip between neutral axis and compression peak
    const b_c = c_gross / (1 - psi);
    const b_eff = rho * b_c;
    const strip_width = b_c - b_eff;

    // Calculate position based on stress distribution
    // (requires neutral axis location calculation)
    const neutral_axis_pos = calculateNeutralAxisPosition(plate, psi);

    strips.push({
      id: `${plate.id}_strip_internal`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      centroid: neutral_axis_pos,  // Simplified - needs proper calculation
      orientation: plate.orientation
    });

  } else if (pattern === 'compression_edge') {
    // Pattern E: Single strip at compressed edge
    const b_c = (c_gross/2) / (1 - psi);
    const b_eff = rho * b_c;
    const strip_width = b_c - b_eff;

    // Identify compressed edge (depends on loading)
    const compressed_edge = identifyCompressedEdge(plate, psi);

    strips.push({
      id: `${plate.id}_strip_compression`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      centroid: calculateStripCentroid(plate, compressed_edge.position, strip_width, 'inward'),
      orientation: plate.orientation
    });
  }

  return strips;
}
```

### 2.7 Strip Centroid Calculation

```javascript
/**
 * Calculate centroid of removed strip
 * @param {Object} plate - Plate element metadata
 * @param {Object} edge_position - Starting edge position {y, z}
 * @param {number} strip_width - Width of removed strip (mm)
 * @param {string} direction - 'inward' or 'outward'
 * @returns {Object} Strip centroid {y, z} in mm
 */
function calculateStripCentroid(plate, edge_position, strip_width, direction) {
  const centroid = { y: 0, z: 0 };

  // Strip centroid is at strip_width/2 from edge
  const offset = strip_width / 2;

  if (plate.orientation === 'y-direction') {
    // Plate extends in Y, strip offset in Z direction
    centroid.y = plate.geometry.centroid.y;  // Same Y as plate

    if (direction === 'inward') {
      // Moving towards centerline
      if (edge_position.z < 0) {
        centroid.z = edge_position.z + offset;  // Move right (positive)
      } else {
        centroid.z = edge_position.z - offset;  // Move left (negative)
      }
    } else {
      // Moving outward
      if (edge_position.z < 0) {
        centroid.z = edge_position.z - offset;  // Move left (more negative)
      } else {
        centroid.z = edge_position.z + offset;  // Move right (more positive)
      }
    }

  } else if (plate.orientation === 'z-direction') {
    // Plate extends in Z, strip offset in Y direction
    centroid.z = plate.geometry.centroid.z;  // Same Z as plate

    if (direction === 'inward') {
      // Moving towards centerline
      if (edge_position.y < 0) {
        centroid.y = edge_position.y + offset;  // Move up (positive)
      } else {
        centroid.y = edge_position.y - offset;  // Move down (negative)
      }
    } else {
      // Moving outward
      if (edge_position.y < 0) {
        centroid.y = edge_position.y - offset;  // Move down (more negative)
      } else {
        centroid.y = edge_position.y + offset;  // Move up (more positive)
      }
    }
  }

  return centroid;
}
```

---

## Part 3: Implementation Phases

### Phase 1: Database Metadata Generation (Week 1)
**Deliverables**:
- [ ] Script `generate_plate_metadata.js` completed
- [ ] All profile types handled (IPE, HEA, HEB, HEM, RHS, SHS, CHS)
- [ ] Metadata validated for 3-5 profiles per type
- [ ] Database files updated with plate_elements

**Testing**:
- Manually verify IPE220, HEA800, CSHS200X4 metadata
- Check edge positions are correct
- Verify centroid calculations

### Phase 2: Pure Compression (ψ=1) Implementation (Week 1-2)
**Deliverables**:
- [ ] `calculateClass4EffectiveProperties()` updated for ψ=1 only
- [ ] Patterns A (symmetric_edge) and C (free_edge) implemented
- [ ] Neutral axis shift calculation (for symmetric cases, should be ~0)
- [ ] I_eff calculation with proper parallel axis theorem

**Testing**:
- IPE220/S460: Web Class 4, check A_eff, I_eff, e_N ≈ 0
- HEA800/S235: Web Class 4, verify values
- CSHS200X4/S235: All walls Class 4, verify symmetric reduction

### Phase 3: Bending (ψ≠1) Implementation (Week 2-3)
**Deliverables**:
- [ ] All 5 reduction patterns implemented
- [ ] Stress ratio ψ calculation for bending
- [ ] Neutral axis shift for unsymmetric reductions
- [ ] W_eff calculation with shifted centroid

**Testing**:
- Create test cases with known ψ values
- Verify against manual calculations
- Compare with commercial software (SCIA, Robot)

### Phase 4: Integration & Validation (Week 3)
**Deliverables**:
- [ ] Update `calculateBucklingResistance()` to use new effective properties
- [ ] Update UI to display e_N, W_eff
- [ ] Comprehensive test suite
- [ ] Documentation updated

**Testing**:
- End-to-end tests for 10+ profiles
- Validation against Eurocode examples
- User acceptance testing

---

## Part 4: Validation & Quality Assurance

### 4.1 Manual Verification Cases

**Case 1: IPE220 / S460 (Pure Compression)**
```
Expected results:
- Web Class 4: c/t = 30.10 > 30.02
- A_eff ≈ 32.24 cm² (4.5% reduction)
- e_N,y ≈ 0 (symmetric reduction)
- e_N,z ≈ 0 (no flange reduction)
- I_eff,y ≈ 2772 - 0.34 = 2771.66 cm⁴ (0.01% reduction)
```

**Case 2: Hypothetical Bending Case**
```
Create test section with known ψ = -0.5
Expected:
- Neutral axis shifts towards tension side
- e_N ≠ 0
- W_eff,top ≠ W_eff,bottom
```

### 4.2 Comparison with Commercial Software

Run same cases in:
- SCIA Engineer
- Robot Structural Analysis
- Tekla Tedds

Compare: A_eff, I_eff, e_N, W_eff (accept ±2% tolerance)

### 4.3 Unit Tests

```javascript
describe('Class 4 Effective Properties', () => {

  test('Symmetric reduction gives zero neutral axis shift', () => {
    const result = calculateClass4EffectiveProperties(IPE220, classification, 'ipe', 1.0);
    expect(Math.abs(result.e_N_y)).toBeLessThan(0.01);
    expect(Math.abs(result.e_N_z)).toBeLessThan(0.01);
  });

  test('Removed strip centroid calculated correctly', () => {
    const strip = calculateStripCentroid(plate, edge, 10, 'inward');
    expect(strip.y).toBeCloseTo(expected_y, 1);
  });

  test('Parallel axis theorem applied correctly', () => {
    const I_eff = calculateEffectiveMomentOfInertia(section, strips, e_N);
    expect(I_eff.I_eff_y).toBeCloseTo(expected_I_eff_y, 2);
  });

});
```

---

## Part 5: API Interface

### 5.1 Updated Function Signature

```javascript
/**
 * Calculate Class 4 effective properties
 *
 * @param {Object} section - Section with plate_elements metadata
 * @param {Object} classification - Classification results
 * @param {string} profileType - 'ipe', 'hea', etc.
 * @param {number} psi - Stress ratio (1.0 for pure compression, -1.0 for pure bending)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.include_neutral_axis_shift - Default true
 * @param {string} options.governing_stress - 'compression' or 'bending'
 *
 * @returns {Object} Effective section properties
 * {
 *   A_eff: number,           // cm²
 *   I_eff_y: number,         // cm⁴
 *   I_eff_z: number,         // cm⁴
 *   i_eff_y: number,         // cm
 *   i_eff_z: number,         // cm
 *   W_eff_y: number,         // cm³
 *   W_eff_z: number,         // cm³
 *   e_N_y: number,           // cm (neutral axis shift)
 *   e_N_z: number,           // cm
 *   neutral_axis_shifted: boolean,
 *   removed_strips: Array,   // Debug info
 *   ...
 * }
 */
function calculateClass4EffectiveProperties(
  section,
  classification,
  profileType,
  psi = 1.0,
  options = {}
) {
  // Implementation here
}
```

### 5.2 Integration with Buckling Calculation

```javascript
function calculateBucklingResistance(section, Ly_m, Lz_m, fy_MPa, temperature_C, gamma_M1, profileType, allowClass4 = false) {

  // ... existing code ...

  // Classify section
  const classification = classifySection(section, fy_MPa, profileType);

  if (classification.is_class4) {
    if (!allowClass4) {
      return { success: false, error: 'Section is Class 4', classification };
    }

    // Calculate effective properties (pure compression: psi = 1.0)
    const effectiveProps = calculateClass4EffectiveProperties(
      section,
      classification,
      profileType,
      1.0,  // Pure compression
      { include_neutral_axis_shift: true }
    );

    // Use effective section for buckling
    workingSection = {
      ...section,
      A: effectiveProps.A_eff,
      Iy: effectiveProps.I_eff_y,
      Iz: effectiveProps.I_eff_z,
      iy: effectiveProps.i_eff_y,
      iz: effectiveProps.i_eff_z,
      effective_properties: effectiveProps
    };
  }

  // Continue with buckling calculation using workingSection
  // ...
}
```

---

## Part 6: Error Handling & Edge Cases

### 6.1 Error Conditions

```javascript
// Check 1: Plate elements exist
if (!section.plate_elements || section.plate_elements.length === 0) {
  throw new Error(`Section ${section.profile} missing plate_elements metadata. Run generate_plate_metadata.js`);
}

// Check 2: Class 4 element has matching plate
for (const elem of classification.element_results.filter(e => e.class === 4)) {
  const plate = section.plate_elements.find(p => p.id === elem.id);
  if (!plate) {
    console.warn(`Class 4 element ${elem.id} not found in plate_elements. Using fallback calculation.`);
    // Use simplified calculation without metadata
  }
}

// Check 3: Effective area not negative
if (A_eff <= 0) {
  throw new Error(`Effective area is negative or zero! A_eff = ${A_eff}. Section too slender.`);
}

// Check 4: Effective inertia not negative
if (I_eff_y <= 0 || I_eff_z <= 0) {
  console.error(`Effective inertia is negative! I_eff_y = ${I_eff_y}, I_eff_z = ${I_eff_z}`);
  // Use minimum inertia (30% of gross)
  I_eff_y = Math.max(I_eff_y, 0.3 * section.Iy);
  I_eff_z = Math.max(I_eff_z, 0.3 * section.Iz);
}

// Check 5: Neutral axis shift reasonable
if (Math.abs(e_N_y) > section.h / 4 || Math.abs(e_N_z) > section.b / 4) {
  console.warn(`Large neutral axis shift detected: e_N = (${e_N_y}, ${e_N_z}) cm. Verify calculation.`);
}
```

### 6.2 Fallback for Missing Metadata

```javascript
/**
 * Simplified effective properties calculation without metadata
 * Uses current approximation methods as fallback
 */
function calculateClass4EffectivePropertiesSimplified(section, classification, profileType) {
  // Current implementation (area scaling, etc.)
  // Use when plate_elements metadata is unavailable
}
```

---

## Part 7: Documentation & Handoff

### 7.1 Files to Create/Update

| File | Action | Description |
|------|--------|-------------|
| `scripts/generate_plate_metadata.js` | CREATE | Database generation script |
| `flexural_buckling_api.js` | UPDATE | Add effective properties functions |
| `steel_cross_section_database/*.json` | UPDATE | Add plate_elements to all profiles |
| `flexural_buckling_ui.js` | UPDATE | Display e_N, W_eff in UI |
| `tests/test_effective_properties.js` | CREATE | Unit tests |
| `IMPLEMENTATION_MASTER_PLAN.md` | THIS FILE | Implementation guide |
| `PLATE_REDUCTION_PATTERNS.md` | EXISTS | Pattern reference |
| `DATABASE_METADATA_ENHANCEMENT_PLAN.md` | UPDATE | Link to master plan |

### 7.2 Key References

**Eurocode Standards**:
- EN 1993-1-1 Section 5.5: Section classification
- EN 1993-1-1 Table 5.2: Classification limits
- EN 1993-1-5 Section 4.3: Effective cross section
- EN 1993-1-5 Section 4.4: Plate elements without stiffeners
- EN 1993-1-5 Figure 4.1: Neutral axis shift illustration
- EN 1993-1-5 Tables 4.1 & 4.2: Effective widths

**Project Files**:
- `flexural_buckling/litterature/plate_reduction_ec3_1-5.pdf`
- `flexural_buckling/plans/PLATE_REDUCTION_PATTERNS.md`
- `flexural_buckling/plans/IMPLEMENTATION_ADDENDUM.md`

### 7.3 Success Criteria

- [ ] All ~1000 profiles have plate_elements metadata
- [ ] Pure compression (ψ=1) works correctly for all section types
- [ ] Neutral axis shift calculation validated
- [ ] I_eff within 2% of commercial software
- [ ] W_eff calculations correct for bending
- [ ] No negative A_eff or I_eff values
- [ ] All validation tests pass
- [ ] Documentation complete

---

## Appendix A: Quick Start for Implementation Agent

### Step 1: Generate Database Metadata
```bash
node scripts/generate_plate_metadata.js
# Verify: Check ipe.json has plate_elements array
```

### Step 2: Implement Core Functions
1. `calculateNeutralAxisShift()` - Formula given in section 2.2
2. `calculateEffectiveMomentOfInertia()` - Formula given in section 2.3
3. `calculateRemovedStrips()` - Patterns in section 2.6
4. `calculateStripCentroid()` - Algorithm in section 2.7

### Step 3: Test Pure Compression
```javascript
const result = calculateClass4EffectiveProperties(IPE220, classification, 'ipe', 1.0);
console.log(result.A_eff);     // Should be ~32.24 cm²
console.log(result.e_N_y);     // Should be ~0 (symmetric)
console.log(result.I_eff_y);   // Should be ~2771.66 cm⁴
```

### Step 4: Validate
Run test suite, compare with manual calculations, verify against Eurocode examples.

---

**IMPLEMENTATION READY**: All formulas, algorithms, and structures defined.
**NEXT**: Assign to implementation agent or begin Phase 1.
