# Plate Reduction Patterns - EN 1993-1-5 Implementation

**Date**: 2026-03-02
**Source**: EN 1993-1-5:2006 Section 4.4, Tables 4.1 & 4.2
**Purpose**: Define robust system for handling all plate reduction cases

---

## 1. Three Fundamental Reduction Patterns

Based on EN 1993-1-5, there are **THREE distinct ways** to remove ineffective material:

### Pattern A: **Symmetric Edge Reduction** (Internal, ψ = 1)
```
Original plate:          Effective plate:
┌──────────┐            ┌──────────┐
│▓▓░░░░░░▓▓│    →       │  ░░░░░░  │
└──────────┘            └──────────┘
  ^      ^                ^      ^
  │      │                │      │
removed removed          kept   kept
```
- **Use case**: Internal elements in pure compression
- **Formula**: b_eff = ρ·b, split as b_c1 = 0.5·b_eff, b_c2 = 0.5·b_eff
- **Removed strips**: TWO strips, one at each edge
- **Position**: Symmetric about plate centerline

### Pattern B: **Asymmetric Edge Reduction** (Internal, 1 > ψ > 0)
```
Original plate:          Effective plate:
┌──────────┐            ┌──────────┐
│▓▓▓░░░░░▓│    →       │   ░░░░░░ │
└──────────┘            └──────────┘
  ^     ^                 ^      ^
  │     │                 │      │
more  less              kept   kept
comp  comp
```
- **Use case**: Internal elements with stress gradient (both edges compressed)
- **Formula**: b_eff = ρ·b, split as b_c1 = 2/(5-ψ)·b_eff, b_c2 = b_eff - b_c1
- **Removed strips**: TWO strips, different widths
- **Position**: More removal at edge with lower compression

### Pattern C: **Single-Side Reduction from Free Edge** (Outstand, 1 ≥ ψ ≥ 0)
```
Original plate:          Effective plate:
    ┌────┐                   ┌────┐
    │░░░░│                   │░░░░│
    │░░░░│          →        │░░░░│
    │░░░░│                   │░░░░│
    │▓▓▓▓│                   │    │
    └────┘                   └────┘
     ^                        ^
     │                        │
  free edge               removed
```
- **Use case**: Outstand elements (flanges) with compression at tip
- **Formula**: b_eff = ρ·c
- **Removed strip**: ONE strip at free edge
- **Position**: Starting from free edge

### Pattern D: **Internal Strip Removal** (Outstand, ψ < 0)
```
Original plate:          Effective plate:
    ┌────┐                   ┌────┐
    │░░░░│                   │░░░░│ (tension zone)
    │▓▓▓▓│          →        │    │ (removed)
    │░░░░│                   │░░░░│ (kept)
    └────┘                   └────┘
     ^                        ^
     │                        │
  fixed edge             kept at support
```
- **Use case**: Outstand in bending (tension at tip, compression at root)
- **Formula**: b_c = c/(1-ψ), b_eff = ρ·b_c, split as b_c1, b_c
- **Removed strip**: ONE strip in middle (where σ > 0)
- **Position**: Between neutral axis (σ=0) and compression peak

### Pattern E: **Single-Side Reduction Near Support** (Internal, ψ < 0)
```
Original plate:          Effective plate:
┌──────────┐            ┌──────────┐
│░░░░░░░▓▓▓│    →       │░░░░░░░   │ (tension side kept)
└──────────┘            └──────────┘
         ^                        ^
         │                        │
    compression              removed strip
      at edge               near support
```
- **Use case**: Internal element in bending (one edge tension, one compression)
- **Formula**: b_c = b̄/(1-ψ), b_eff = ρ·b_c, split as b_c1 = 0.4·b_eff, b_c2 = 0.6·b_eff
- **Removed strip**: ONE strip at compressed edge
- **Position**: At edge under compression

---

## 2. Metadata Structure for Plates

Each plate element needs to track:

```json
{
  "id": "web",
  "type": "internal",
  "element_class": "compression_element",
  "orientation": "y-direction",

  "geometry": {
    "gross": {
      "length": 220,
      "thickness": 5.9,
      "centroid": { "y": 0, "z": 0 }
    },

    "edges": {
      "edge1": {
        "id": "top_edge",
        "position": { "y": 110, "z": 0 },
        "direction": "+y"
      },
      "edge2": {
        "id": "bottom_edge",
        "position": { "y": -110, "z": 0 },
        "direction": "-y"
      }
    }
  },

  "reduction_behavior": {
    "pattern_psi_1": "symmetric_edge",       // ψ = 1
    "pattern_psi_pos": "asymmetric_edge",    // 1 > ψ > 0
    "pattern_psi_neg": "single_compression_edge"  // ψ < 0
  }
}
```

### For Outstand Elements:
```json
{
  "id": "flange_tip",
  "type": "outstand",
  "element_class": "compression_element",
  "orientation": "z-direction",

  "geometry": {
    "gross": {
      "length": 110,
      "thickness": 9.2,
      "centroid": { "y": 105.4, "z": -21.525 }
    },

    "edges": {
      "fixed_edge": {
        "id": "web_junction",
        "position": { "y": 105.4, "z": 0 },
        "direction": "towards_web"
      },
      "free_edge": {
        "id": "flange_tip",
        "position": { "y": 105.4, "z": -55 },
        "direction": "outward"
      }
    }
  },

  "reduction_behavior": {
    "pattern_psi_pos": "free_edge_removal",      // 1 ≥ ψ ≥ 0
    "pattern_psi_neg": "internal_strip_removal"  // ψ < 0
  }
}
```

---

## 3. Reduction Factor ρ by Pattern

### For ALL Patterns:
```javascript
const lambda_p = slenderness / limit_class3;

// Determine k_sigma from stress ratio ψ
let k_sigma;
if (elementType === 'internal') {
  if (psi === 1) k_sigma = 4.0;
  else if (psi > 0) k_sigma = 8.2 / (1.05 + psi);
  else if (psi === 0) k_sigma = 7.81;
  else k_sigma = 7.81 - 6.29*psi + 9.78*psi*psi;
} else if (elementType === 'outstand') {
  if (psi >= 0) k_sigma = 0.43;
  else if (psi > -1) k_sigma = 0.578 / (psi + 0.34);
  else k_sigma = 1.7 - 5*psi + 17.1*psi*psi;
}

// Reduction factor
if (elementType === 'internal') {
  rho = (lambda_p - 0.055*(3 + psi)) / (lambda_p * lambda_p);
} else {
  rho = (lambda_p - 0.188) / (lambda_p * lambda_p);
}
rho = Math.min(Math.max(rho, 0), 1.0);
```

---

## 4. Removed Strip Geometry Calculation

### Pattern A: Symmetric Edge Reduction (ψ = 1)
```javascript
const b_eff = rho * b_gross;
const b_c1 = 0.5 * b_eff;  // Kept at edge 1
const b_c2 = 0.5 * b_eff;  // Kept at edge 2

// Removed strips
const removed_strip_1 = {
  width: (b_gross - b_eff) / 2,
  position: edge1.position,  // At edge 1
  centroid_offset: (b_gross - b_eff) / 4  // From edge towards center
};

const removed_strip_2 = {
  width: (b_gross - b_eff) / 2,
  position: edge2.position,  // At edge 2
  centroid_offset: -(b_gross - b_eff) / 4  // From edge towards center
};
```

### Pattern B: Asymmetric Edge Reduction (1 > ψ > 0)
```javascript
const b_eff = rho * b_gross;
const b_c1 = (2 / (5 - psi)) * b_eff;  // Kept at more compressed edge
const b_c2 = b_eff - b_c1;             // Kept at less compressed edge

const removed_1 = b_gross/2 - b_c1;
const removed_2 = b_gross/2 - b_c2;

// Removed strips (different sizes)
const removed_strip_1 = {
  width: removed_1,
  position: less_compressed_edge.position,
  centroid_offset: removed_1 / 2
};

const removed_strip_2 = {
  width: removed_2,
  position: more_compressed_edge.position,
  centroid_offset: removed_2 / 2
};
```

### Pattern C: Free Edge Removal (1 ≥ ψ ≥ 0)
```javascript
const c_eff = rho * c_gross;

// Single removed strip at free edge
const removed_strip = {
  width: c_gross - c_eff,
  position: free_edge.position,
  centroid_offset: (c_gross - c_eff) / 2  // From free edge inward
};
```

### Pattern D: Internal Strip Removal (ψ < 0, outstand)
```javascript
const b_c = c_gross / (1 - psi);  // Compression zone width
const b_eff = rho * b_c;

// Effective width distribution per Table 4.2
const b_c1 = b_eff;  // At compression edge (fixed edge)
const b_c2 = 0;      // None at tension edge (free edge)

// Removed strip is BETWEEN kept portions
const neutral_axis_position = /* calculate from ψ */;

const removed_strip = {
  width: b_c - b_eff,
  position: neutral_axis_position,
  centroid_offset: /* calculate based on stress distribution */
};
```

### Pattern E: Compression Edge Removal (ψ < 0, internal)
```javascript
const b_c = (b_gross/2) / (1 - psi);  // Compression zone width
const b_eff = rho * b_c;

const b_c1 = 0.4 * b_eff;  // Near compression edge
const b_c2 = 0.6 * b_eff;  // Farther from compression edge

// Single removed strip at compressed edge
const removed_strip = {
  width: b_c - b_eff,
  position: compression_edge.position,
  centroid_offset: (b_c - b_eff) / 2
};
```

---

## 5. Centroid Tracking for Removed Strips

**Critical for parallel axis theorem**: We need the centroid of the **removed strip**, not the original plate!

```javascript
function calculateRemovedStripCentroid(plate, removed_strip, pattern) {
  let strip_centroid = { y: 0, z: 0 };

  if (plate.orientation === 'y-direction') {
    // Plate extends in Y, strip centroid offset in Z direction
    if (pattern === 'symmetric_edge') {
      // Strip 1: plate.centroid.z + offset
      // Strip 2: plate.centroid.z - offset
      strip_centroid.z = plate.centroid.z + removed_strip.centroid_offset;
    } else if (pattern === 'free_edge_removal') {
      strip_centroid.z = plate.edges.free_edge.position.z + removed_strip.centroid_offset;
    }
    strip_centroid.y = plate.centroid.y;  // Same Y as plate

  } else if (plate.orientation === 'z-direction') {
    // Plate extends in Z, strip centroid offset in Y direction
    if (pattern === 'symmetric_edge') {
      strip_centroid.y = plate.centroid.y + removed_strip.centroid_offset;
    } else if (pattern === 'free_edge_removal') {
      strip_centroid.y = plate.edges.free_edge.position.y + removed_strip.centroid_offset;
    }
    strip_centroid.z = plate.centroid.z;  // Same Z as plate
  }

  return strip_centroid;
}
```

---

## 6. I_eff Calculation with Patterns

```javascript
function calculateIeff(section, classification, profileType) {
  let I_eff_y = section.iy_moment;
  let I_eff_z = section.iz_moment;

  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const plate = section.plate_elements.find(p => p.id === element.id);
    const pattern = determinePattern(element.psi, plate.type);
    const removed_strips = calculateRemovedStrips(plate, element, pattern);

    for (const strip of removed_strips) {
      // 1. Area of removed strip
      const A_removed = (strip.width * plate.thickness) / 100;  // mm² → cm²

      // 2. Local inertia of removed strip
      const I_local = calculateLocalInertia(strip, plate);

      // 3. Distance from removed strip centroid to section centroid
      const strip_centroid = calculateRemovedStripCentroid(plate, strip, pattern);
      const d_y = strip_centroid.y / 10;  // mm → cm
      const d_z = strip_centroid.z / 10;

      // 4. Parallel axis contribution
      let I_parallel_y = 0;
      let I_parallel_z = 0;

      if (plate.orientation === 'y-direction') {
        // Strip affects I_z
        I_parallel_z = A_removed * d_z * d_z;
        I_eff_z -= (I_local + I_parallel_z);
      } else if (plate.orientation === 'z-direction') {
        // Strip affects I_y
        I_parallel_y = A_removed * d_y * d_y;
        I_eff_y -= (I_local + I_parallel_y);
      }
    }
  }

  return { I_eff_y, I_eff_z };
}
```

---

## 7. Implementation Priority

### Phase 1: Pure Compression Only (ψ = 1)
**Patterns needed**: A (symmetric), C (free edge)
- Internal elements: Pattern A
- Outstand elements: Pattern C
- **Current scope**: This is what we implement NOW

### Phase 2: Bending (ψ ≠ 1)
**Patterns needed**: All (A, B, C, D, E)
- Must handle stress gradients
- Must calculate neutral axis location
- Must track ψ for each element
- **Future work**: After pure compression is complete

---

## 8. Database Schema Update

### Minimal for Phase 1 (Pure Compression):
```json
{
  "plate_elements": [
    {
      "id": "web",
      "type": "internal",
      "orientation": "y-direction",
      "geometry": {
        "length": 220,
        "thickness": 5.9,
        "centroid": { "y": 0, "z": 0 },
        "edge1_position": { "y": 110, "z": 0 },
        "edge2_position": { "y": -110, "z": 0 }
      },
      "reduction_pattern_compression": "symmetric_edge"
    },
    {
      "id": "flange_tip",
      "type": "outstand",
      "orientation": "z-direction",
      "geometry": {
        "length": 55,
        "thickness": 9.2,
        "centroid": { "y": 105.4, "z": -27.5 },
        "fixed_edge_position": { "y": 105.4, "z": 0 },
        "free_edge_position": { "y": 105.4, "z": -55 }
      },
      "reduction_pattern_compression": "free_edge_removal"
    }
  ]
}
```

### Full for Phase 2 (Bending):
Add stress ratio handling:
```json
{
  "reduction_patterns": {
    "psi_1": "symmetric_edge",
    "psi_positive": "asymmetric_edge",
    "psi_negative": "compression_edge_removal"
  }
}
```

---

## 9. Key Insights

1. **Pattern determines strip location**: Can't just know plate centroid - need edge positions
2. **ψ determines pattern**: Same element uses different patterns for different loading
3. **Centroid shifts**: Removed strip centroid ≠ plate centroid (especially for asymmetric)
4. **Multiple strips**: Internal elements may have TWO removed strips (one at each edge)
5. **Clean separation**: Pure compression (ψ=1) is simplest - start there!

---

## 10. Validation Strategy

For each pattern, test:
1. **Removed strip width** matches EC3-1-5 formulas
2. **Removed strip centroid** correctly calculated
3. **I_local** matches thin-walled theory
4. **I_parallel** uses correct distance d
5. **Total ΔI** gives reasonable I_eff values

**Test sections**:
- IPE220/S460: Pattern A (web, ψ=1)
- HEA800/S235: Pattern A (web, ψ=1)
- Hypothetical flange: Pattern C (outstand, ψ≥0)

---

**Status**: Ready for metadata schema design
**Next**: Update DATABASE_METADATA_ENHANCEMENT_PLAN.md with this structure
