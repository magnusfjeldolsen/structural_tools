# Section Plotter Plan: Class 4 Effective Sections Visualization

## Overview
Visualize doubly-symmetric I-sections (IPE, HEA, HEB, HEM) showing:
- **Gross section** in light blue (#93C5FD or similar)
- **Removed strips** in red (#EF4444 or similar) with hatching
- Positioned according to EN 1993-1-5 Tables 4.1 and 4.2

## Target Profiles (Phase 1)
All doubly-symmetric I-sections:
- **IPE**: European I-beams (narrow flanges)
- **HEA**: European wide-flange H-beams (light)
- **HEB**: European wide-flange H-beams (medium)
- **HEM**: European wide-flange H-beams (heavy)

## Database Structure Analysis

### Section Parameters (IPE example)
From database JSON for each profile:
```javascript
{
  "profile": "IPE240",
  "h": 240,        // Total height (mm)
  "b": 120,        // Flange width (mm)
  "tw": 6.2,       // Web thickness (mm)
  "tf": 9.8,       // Flange thickness (mm)
  "r": 15,         // Fillet radius (mm)
  // ... other properties
}
```

### Plate Elements Geometry
Each section has detailed `plate_elements` array with:

#### 1. Web (Internal Element)
```javascript
{
  "id": "web",
  "type": "internal",
  "orientation": "y-direction",
  "geometry": {
    "gross_length": 240,           // h (total height)
    "thickness": 6.2,               // tw
    "centroid": { "y": 0, "z": 0 },
    "edges": {
      "edge1": {
        "id": "top_junction",
        "position": { "y": 105.4, "z": 0 },  // Top of web (h/2 - tf - r)
        "type": "junction"
      },
      "edge2": {
        "id": "bottom_junction",
        "position": { "y": -105.4, "z": 0 }, // Bottom of web
        "type": "junction"
      }
    }
  },
  "reduction_patterns": {
    "compression_psi_1": "symmetric_edge"    // For pure compression (ψ=1)
  }
}
```

#### 2. Flange Tips (Outstand Elements, 4 total)
```javascript
{
  "id": "top_flange_tip_left",
  "type": "outstand",
  "orientation": "z-direction",
  "geometry": {
    "gross_length": 40.05,                   // (b/2 - tw/2 - r)
    "thickness": 9.8,                        // tf
    "centroid": { "y": 105.4, "z": -34.975 },
    "edges": {
      "edge1": {
        "id": "web_junction",
        "position": { "y": 105.4, "z": -14.95 }, // Junction with web
        "type": "junction"
      },
      "edge2": {
        "id": "free_edge",
        "position": { "y": 105.4, "z": -55 },    // Flange tip (free edge)
        "type": "free"
      }
    }
  },
  "reduction_patterns": {
    "compression_psi_positive": "free_edge"  // Remove from free edge inward
  }
}
```

## Effective Width Calculation (from calculateRemovedStrips)

### Pure Compression (ψ = 1.0)

#### Internal Elements (Web)
Per EN 1993-1-5 Table 4.1, Row 1 (ψ = 1):
- **Pattern**: Symmetric edge reduction
- **Effective width**: b_eff = ρ × b̄
- **Strip distribution**: b_e1 = 0.5 × b_eff, b_e2 = 0.5 × b_eff
- **Removed strip width**: (b̄ - b_eff) / 2 at EACH edge

```javascript
// For web with Class 4:
const c_gross = element.c;              // e.g., 190.4 mm (h - 2*tf - 2*r)
const t = element.t;                    // e.g., 6.2 mm (tw)
const c_eff = ρ * c_gross;              // e.g., 0.767 × 190.4 = 146.09 mm
const strip_width = c_gross - c_eff;    // e.g., 44.31 mm total
const half_removed = strip_width / 2;   // e.g., 22.15 mm per edge

// Two strips removed:
// Strip 1: At top edge (y = +edge1.position.y)
// Strip 2: At bottom edge (y = -edge2.position.y)
```

**Visual representation** (EN 1993-1-5 Figure 4.1 and Table 4.1):
```
     ┌─────────────────┐
     │  removed (red)  │  ← Strip 1: half_removed height
     ├─────────────────┤
     │                 │
     │   effective     │  ← c_eff (light blue)
     │   (light blue)  │
     │                 │
     ├─────────────────┤
     │  removed (red)  │  ← Strip 2: half_removed height
     └─────────────────┘
```

#### Outstand Elements (Flange Tips)
Per EN 1993-1-5 Table 4.2, Row 1 (ψ ≥ 0):
- **Pattern**: Free edge removal
- **Effective width**: b_eff = ρ × c
- **Removed strip**: (c - b_eff) from free edge inward

```javascript
// For flange tip with Class 4:
const c_gross = element.c;           // e.g., 40.05 mm (b/2 - tw/2 - r)
const t = element.t;                 // e.g., 9.8 mm (tf)
const c_eff = ρ * c_gross;           // e.g., 0.85 × 40.05 = 34.04 mm
const strip_width = c_gross - c_eff; // e.g., 6.01 mm

// One strip removed:
// From free edge (z = edge2.position.z) inward by strip_width
```

**Visual representation** (EN 1993-1-5 Table 4.2):
```
  Junction              Free edge
     │                      │
     ├──────────┬───────────┤
     │ effective│  removed  │
     │ (blue)   │   (red)   │
     ├──────────┴───────────┤
        c_eff    strip_width
```

## Coordinate System

### Origin and Axes
- **Origin**: Section centroid (0, 0)
- **Y-axis**: Vertical (major axis), positive upward
- **Z-axis**: Horizontal (minor axis), positive to the right
- **Units**: millimeters (mm)

### Key Coordinates for IPE/HE Sections
```javascript
// From section parameters:
const h_half = h / 2;              // e.g., 120 mm for IPE240
const b_half = b / 2;              // e.g., 60 mm for IPE240
const tw_half = tw / 2;            // e.g., 3.1 mm for IPE240

// Web boundaries:
const web_top = h_half - tf - r;      // Top of web (junction with fillet)
const web_bottom = -(h_half - tf - r); // Bottom of web
const web_left = -tw_half;             // Left edge of web
const web_right = tw_half;             // Right edge of web

// Flange boundaries:
const flange_top_outer = h_half;                    // Top surface
const flange_top_inner = h_half - tf;               // Bottom surface of top flange
const flange_bottom_outer = -h_half;                // Bottom surface
const flange_bottom_inner = -(h_half - tf);         // Top surface of bottom flange
const flange_left = -b_half;                        // Left tip
const flange_right = b_half;                        // Right tip
```

## Plotting Function Structure

### Input Parameters
```javascript
/**
 * Plot I-section with Class 4 effective properties
 * @param {Object} section - Section properties from database
 * @param {Object} effectiveProperties - Result from calculateClass4EffectiveProperties()
 * @param {Object} classification - Classification results
 * @param {string} canvasId - Canvas element ID
 * @param {Object} options - Plot options
 */
function plotISection(section, effectiveProperties, classification, canvasId, options = {}) {
  // Default options
  const opts = {
    width: 600,                    // Canvas width (px)
    height: 400,                   // Canvas height (px)
    grossColor: '#93C5FD',         // Light blue for gross section
    removedColor: '#EF4444',       // Red for removed strips
    removedHatch: true,            // Add hatching to removed strips
    showDimensions: true,          // Show dimension lines
    showLabels: true,              // Show element labels
    showReductionPercentage: true, // Show % reduction on removed strips
    scale: 'auto',                 // Auto-scale to fit canvas
    ...options
  };

  // Main plotting logic
}
```

### Plotting Steps

#### Step 1: Setup Canvas and Scaling
```javascript
const canvas = document.getElementById(canvasId);
const ctx = canvas.getContext('2d');

// Calculate scale factor to fit section in canvas with padding
const padding = 40; // px
const availableWidth = opts.width - 2 * padding;
const availableHeight = opts.height - 2 * padding;

const scaleX = availableWidth / section.b;
const scaleY = availableHeight / section.h;
const scale = Math.min(scaleX, scaleY);

// Transform to section coordinates (origin at center)
ctx.translate(opts.width / 2, opts.height / 2);
ctx.scale(scale, -scale); // Negative Y for upward-positive
```

#### Step 2: Draw Gross Section (Light Blue)
```javascript
function drawGrossSection(ctx, section) {
  ctx.fillStyle = opts.grossColor;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1 / scale; // Keep line width constant in screen pixels

  // Draw top flange
  ctx.fillRect(
    -section.b / 2,              // x (left edge)
    section.h / 2 - section.tf,  // y (bottom of flange)
    section.b,                   // width
    section.tf                   // height
  );

  // Draw web
  ctx.fillRect(
    -section.tw / 2,                      // x (left edge)
    -(section.h / 2 - section.tf),        // y (bottom)
    section.tw,                           // width
    section.h - 2 * section.tf            // height
  );

  // Draw bottom flange
  ctx.fillRect(
    -section.b / 2,               // x
    -section.h / 2,               // y (bottom edge)
    section.b,                    // width
    section.tf                    // height
  );

  // Stroke outlines
  ctx.stroke();
}
```

#### Step 3: Draw Removed Strips (Red with Hatching)
```javascript
function drawRemovedStrips(ctx, effectiveProperties) {
  // Get removed strips from effective properties
  const removedStrips = effectiveProperties.removed_strips || [];

  ctx.fillStyle = opts.removedColor;
  ctx.globalAlpha = 0.6; // Semi-transparent

  for (const strip of removedStrips) {
    // Calculate strip rectangle position
    const rect = calculateStripRectangle(strip);

    // Fill strip
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Add hatching
    if (opts.removedHatch) {
      drawHatching(ctx, rect, 45, 5 / scale); // 45° hatching, 5px spacing
    }

    // Show reduction percentage label
    if (opts.showReductionPercentage) {
      const reductionPct = ((strip.area / effectiveProperties.gross_area) * 100).toFixed(1);
      drawLabel(ctx, `${reductionPct}%`, rect.x + rect.width/2, rect.y + rect.height/2);
    }
  }

  ctx.globalAlpha = 1.0;
}

function calculateStripRectangle(strip) {
  // Based on strip orientation and centroid position
  if (strip.orientation === 'y-direction') {
    // Vertical strip (web reduction)
    // Strip width in Y-direction, thickness in Z-direction
    return {
      x: strip.centroid.z - strip.thickness / 2,
      y: strip.centroid.y - strip.width / 2,
      width: strip.thickness,
      height: strip.width
    };
  } else if (strip.orientation === 'z-direction') {
    // Horizontal strip (flange tip reduction)
    // Strip width in Z-direction, thickness in Y-direction
    return {
      x: strip.centroid.z - strip.width / 2,
      y: strip.centroid.y - strip.thickness / 2,
      width: strip.width,
      height: strip.thickness
    };
  }
}
```

#### Step 4: Draw Hatching Pattern
```javascript
function drawHatching(ctx, rect, angle, spacing) {
  ctx.save();
  ctx.strokeStyle = opts.removedColor;
  ctx.lineWidth = 0.5 / scale;
  ctx.globalAlpha = 0.8;

  // Create clipping region
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  // Draw diagonal lines
  const angleRad = (angle * Math.PI) / 180;
  const dx = Math.cos(angleRad) * spacing;
  const dy = Math.sin(angleRad) * spacing;

  const diagonal = Math.sqrt(rect.width**2 + rect.height**2);
  const numLines = Math.ceil(diagonal / spacing) * 2;

  for (let i = -numLines; i < numLines; i++) {
    const x1 = rect.x + i * dx;
    const y1 = rect.y;
    const x2 = rect.x + i * dx;
    const y2 = rect.y + rect.height;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 + dx * (rect.height / dy), y2);
    ctx.stroke();
  }

  ctx.restore();
}
```

#### Step 5: Add Dimension Lines and Labels
```javascript
function drawDimensions(ctx, section, effectiveProperties) {
  ctx.strokeStyle = '#374151'; // Dark gray
  ctx.fillStyle = '#374151';
  ctx.lineWidth = 0.5 / scale;
  ctx.font = `${12/scale}px Arial`;

  // Height dimension (right side)
  drawDimensionLine(
    ctx,
    section.b/2 + 20/scale,   // x offset from section
    -section.h/2,              // y start
    section.b/2 + 20/scale,
    section.h/2,               // y end
    `h = ${section.h} mm`
  );

  // Width dimension (bottom)
  drawDimensionLine(
    ctx,
    -section.b/2,              // x start
    -section.h/2 - 20/scale,   // y offset from section
    section.b/2,               // x end
    -section.h/2 - 20/scale,
    `b = ${section.b} mm`
  );

  // Web effective height (if Class 4)
  if (effectiveProperties.is_effective) {
    const webReduction = effectiveProperties.plate_reductions.find(p => p.element === 'web');
    if (webReduction) {
      drawDimensionLine(
        ctx,
        -section.tw/2 - 10/scale,
        -webReduction.c_eff/2,
        -section.tw/2 - 10/scale,
        webReduction.c_eff/2,
        `c_eff = ${webReduction.c_eff.toFixed(1)} mm`,
        'left'
      );
    }
  }
}
```

#### Step 6: Add Legend
```javascript
function drawLegend(ctx, effectiveProperties) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to screen coordinates

  const legendX = 20;
  const legendY = 20;
  const itemHeight = 25;

  // Gross section
  ctx.fillStyle = opts.grossColor;
  ctx.fillRect(legendX, legendY, 30, 15);
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  ctx.fillText('Gross section', legendX + 40, legendY + 12);

  // Removed strips
  if (effectiveProperties.is_effective) {
    ctx.fillStyle = opts.removedColor;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(legendX, legendY + itemHeight, 30, 15);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000000';
    ctx.fillText(
      `Removed strips (${effectiveProperties.area_reduction_percent.toFixed(1)}% area reduction)`,
      legendX + 40,
      legendY + itemHeight + 12
    );
  }

  ctx.restore();
}
```

## Example Usage

```javascript
// After calculating buckling capacity with Class 4 section:
const section = steelDatabase['ipe']['IPE240'];
const classification = classifySection(section, 460, 'ipe');
const effectiveProps = calculateClass4EffectiveProperties(section, classification, 'ipe');

// Plot the section with removed strips
plotISection(section, effectiveProps, classification, 'section-plot-canvas', {
  grossColor: '#93C5FD',
  removedColor: '#EF4444',
  removedHatch: true,
  showDimensions: true,
  showReductionPercentage: true
});
```

## Output Example

For **IPE 240 / S460 / 650 kN** (Class 4 web):

```
┌────────────────────────────────────────────┐
│ Legend:                                     │
│ ▓ Gross section                            │
│ ▒ Removed strips (7.0% area reduction)     │
├────────────────────────────────────────────┤
│                                            │
│      ├──── b = 120 mm ────┤               │
│      ┌──────────────────────┐  ─          │
│      │████████████████████████│  │         │
│      │████████████████████████│  │         │
│      └┬───────┬─┬───────┬───┘  │         │
│ c_eff │▒▒▒▒▒▒▒│█│▒▒▒▒▒▒▒│      │         │
│ 146mm │▒3.5%▒▒│█│▒▒3.5%▒│      │ h=240mm │
│       │▒▒▒▒▒▒▒│█│▒▒▒▒▒▒▒│      │         │
│       │       │█│       │      │         │
│       │       │█│       │      │         │
│       │       │█│       │      │         │
│       │▒▒▒▒▒▒▒│█│▒▒▒▒▒▒▒│      │         │
│       │▒3.5%▒▒│█│▒▒3.5%▒│      │         │
│       │▒▒▒▒▒▒▒│█│▒▒▒▒▒▒▒│      │         │
│      ┌┴───────┴─┴───────┴───┐  │         │
│      │████████████████████████│  │         │
│      │████████████████████████│  │         │
│      └──────────────────────┘  ─          │
│                                            │
└────────────────────────────────────────────┘

Red hatched strips at top and bottom of web (symmetric)
Light blue for main section body
```

## Implementation Notes

1. **Coordinate precision**: Use floating-point calculations but round for display
2. **Fillet radii**: For initial version, use simplified rectangles (ignore fillets)
3. **Responsive sizing**: Auto-scale based on canvas size
4. **Mobile support**: Touch events for zoom/pan (future enhancement)
5. **Export**: Add PNG export button (future enhancement)

## Future Enhancements (Phase 2+)

1. **Asymmetric sections**: Single-axis symmetry (channels, angles)
2. **Hollow sections**: RHS, SHS, CHS with internal element reduction
3. **Bending stress distribution**: Show ψ < 1 cases with asymmetric reduction
4. **Animation**: Transition from gross to effective section
5. **Interactive**: Click elements to see reduction calculations
6. **3D view**: Isometric projection with depth
