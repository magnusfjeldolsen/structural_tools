# Section Plotter Implementation Plan

## Executive Summary

Create a canvas-based visualization system for steel cross-sections that displays:
1. **Gross section** geometry (light blue fill)
2. **Removed Class 4 strips** (red fill with diagonal hatching) when applicable
3. **Auto-scaling** to fit any section size within canvas bounds
4. **Legend** showing gross section and removed strips with area reduction percentage
5. **Support for all profile types** in the steel cross-section database

This plan provides complete implementation details for another developer to implement independently.

---

## Table of Contents

1. [File Structure](#file-structure)
2. [Architecture Overview](#architecture-overview)
3. [Data Flow](#data-flow)
4. [Core Functions Specification](#core-functions-specification)
5. [Rendering Pipeline](#rendering-pipeline)
6. [Coordinate System](#coordinate-system)
7. [Canvas Setup and Scaling](#canvas-setup-and-scaling)
8. [Drawing Functions](#drawing-functions)
9. [Integration with Existing Code](#integration-with-existing-code)
10. [Testing Strategy](#testing-strategy)
11. [Example Usage](#example-usage)

---

## 1. File Structure

Create new file: `flexural_buckling/section_plotter.js`

```
flexural_buckling/
├── index.html                          (existing - add canvas element)
├── flexural_buckling_api.js            (existing - provides data)
├── flexural_buckling_ui.js             (existing - call plotter from here)
└── section_plotter.js                  (NEW - all plotting code)
```

---

## 2. Architecture Overview

### 2.1 Module Structure

```javascript
// section_plotter.js - Self-contained module

const SectionPlotter = {
  // Public API
  plot: function(canvasId, section, effectiveProperties, options) { },

  // Internal functions
  _setupCanvas: function(canvas, section, options) { },
  _calculateScale: function(canvas, section, padding) { },
  _drawGrossSection: function(ctx, section, profileType) { },
  _drawRemovedStrips: function(ctx, removedStrips, options) { },
  _drawLegend: function(ctx, effectiveProperties, options) { },
  _drawPlateElement: function(ctx, plate) { },
  _drawHatching: function(ctx, rect, angle, spacing) { }
};
```

### 2.2 Dependencies

**Required:**
- HTML5 Canvas API (built-in)
- Existing `flexural_buckling_api.js` for data structures

**No external libraries needed** - pure JavaScript and Canvas API.

---

## 3. Data Flow

```
User calculates section
        ↓
calculateClass4EffectiveProperties()
        ↓
    Returns:
    - section (with plate_elements)
    - effectiveProperties (with removed_strips, area_reduction_percent)
    - classification
        ↓
SectionPlotter.plot(canvasId, section, effectiveProperties, options)
        ↓
    Canvas displays:
    - Gross section (blue)
    - Removed strips (red hatched) if Class 4
    - Legend with reduction %
```

---

## 4. Core Functions Specification

### 4.1 Main Public API

```javascript
/**
 * Plot steel cross-section with optional Class 4 reductions
 *
 * @param {string} canvasId - Canvas element ID (e.g., 'section-canvas')
 * @param {Object} section - Section object from steelDatabase with plate_elements
 * @param {Object|null} effectiveProperties - Result from calculateClass4EffectiveProperties(),
 *                                            or null for gross section only
 * @param {Object} options - Configuration options (optional)
 * @param {string} options.profileType - Profile type ('ipe', 'hea', etc.) - REQUIRED
 * @param {number} options.canvasWidth - Canvas width in pixels (default: 600)
 * @param {number} options.canvasHeight - Canvas height in pixels (default: 400)
 * @param {number} options.padding - Padding around section in pixels (default: 60)
 * @param {string} options.grossColor - Gross section fill color (default: '#93C5FD')
 * @param {string} options.grossStroke - Gross section outline color (default: '#1E40AF')
 * @param {number} options.strokeWidth - Outline width in pixels (default: 2)
 * @param {string} options.removedColor - Removed strips fill color (default: '#EF4444')
 * @param {number} options.removedAlpha - Removed strips opacity 0-1 (default: 0.5)
 * @param {boolean} options.hatchRemoved - Add hatching to removed strips (default: true)
 * @param {number} options.hatchAngle - Hatching angle in degrees (default: 45)
 * @param {number} options.hatchSpacing - Hatching line spacing in mm (default: 5)
 * @param {boolean} options.showLegend - Show legend (default: true)
 * @param {string} options.legendPosition - 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' (default: 'top-right')
 * @param {string} options.backgroundColor - Canvas background color (default: '#FFFFFF')
 *
 * @returns {Object} Plot metadata { scale, bounds, drawnElements }
 *
 * @throws {Error} If canvas not found, section invalid, or profileType missing
 *
 * @example
 * const section = steelDatabase['ipe']['IPE240'];
 * const effectiveProps = calculateClass4EffectiveProperties(section, classification, 'ipe');
 *
 * SectionPlotter.plot('section-canvas', section, effectiveProps, {
 *   profileType: 'ipe',
 *   canvasWidth: 600,
 *   canvasHeight: 400,
 *   grossColor: '#93C5FD',
 *   removedColor: '#EF4444'
 * });
 */
SectionPlotter.plot = function(canvasId, section, effectiveProperties, options = {}) {
  // Implementation in Section 8
};
```

---

## 5. Rendering Pipeline

### 5.1 Execution Order

```
1. Validate inputs (canvas exists, section has plate_elements, profileType provided)
2. Setup canvas (size, background, get context)
3. Calculate scaling (auto-fit section within canvas with padding)
4. Apply coordinate transformation (origin to center, Y-axis upward, scale to pixels)
5. Draw gross section (iterate plate_elements, draw rectangles)
6. Draw removed strips (if effectiveProperties provided and is_effective = true)
7. Reset transformation (back to screen coordinates)
8. Draw legend (if showLegend = true)
9. Return metadata
```

### 5.2 Coordinate Transformations

```javascript
// Step 4: Apply transformation
ctx.save();
ctx.translate(canvasWidth / 2, canvasHeight / 2);  // Origin to center
ctx.scale(scale, -scale);                          // Scale and flip Y-axis (upward positive)

// ... draw in section coordinates (mm) ...

ctx.restore();  // Step 7: Reset to screen coordinates for legend
```

---

## 6. Coordinate System

### 6.1 Section Coordinates (Database)

**Origin:** Section centroid (0, 0)
**Units:** Millimeters (mm)
**Axes:**
- **Y-axis:** Vertical, **positive UPWARD** (major axis)
- **Z-axis:** Horizontal, **positive RIGHTWARD** (minor axis)

**Example for IPE240:**
```
Y
↑
│     ┌────────┐  ← Top flange at y = +h/2 = +120 mm
│     │        │
│     ├───┬────┤
│     │   │ tw │  ← Web centered at z = 0
├─────┼───O────┼──→ Z  ← Origin at centroid (0, 0)
│     │   │    │
│     ├───┴────┤
│     │        │
│     └────────┘  ← Bottom flange at y = -h/2 = -120 mm
│
     ← -b/2      → +b/2
    -60 mm      +60 mm
```

### 6.2 Canvas Coordinates (Screen)

**Origin:** Top-left corner (0, 0)
**Units:** Pixels (px)
**Axes:**
- **X-axis:** Horizontal, positive rightward
- **Y-axis:** Vertical, **positive DOWNWARD** (standard canvas)

**Transformation handles coordinate system conversion automatically.**

---

## 7. Canvas Setup and Scaling

### 7.1 Auto-Scaling Algorithm

```javascript
/**
 * Calculate scale factor to fit section in canvas with padding
 *
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} section - Section with h, b properties
 * @param {number} padding - Padding in pixels
 * @returns {number} Scale factor (pixels per millimeter)
 */
_calculateScale: function(canvas, section, padding) {
  const availableWidth = canvas.width - 2 * padding;
  const availableHeight = canvas.height - 2 * padding;

  // Section dimensions in mm
  const sectionWidth = section.b;   // Flange width
  const sectionHeight = section.h;  // Total height

  // Calculate scale factors for each dimension
  const scaleX = availableWidth / sectionWidth;
  const scaleY = availableHeight / sectionHeight;

  // Use smaller scale to ensure entire section fits
  const scale = Math.min(scaleX, scaleY);

  return scale;
}
```

**Example:**
- Canvas: 600px × 400px
- Padding: 60px
- Available: 480px × 280px
- Section: IPE240 (b=120mm, h=240mm)
- scaleX = 480 / 120 = 4.0 px/mm
- scaleY = 280 / 240 = 1.167 px/mm
- **scale = 1.167 px/mm** (limiting factor is height)

### 7.2 Canvas Setup

```javascript
/**
 * Setup canvas with proper size and clear background
 *
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} section - Section object
 * @param {Object} options - Options with canvasWidth, canvasHeight, backgroundColor
 */
_setupCanvas: function(canvas, section, options) {
  // Set canvas size
  canvas.width = options.canvasWidth;
  canvas.height = options.canvasHeight;

  // Get context
  const ctx = canvas.getContext('2d');

  // Clear and set background
  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return ctx;
}
```

---

## 8. Drawing Functions

### 8.1 Draw Gross Section

```javascript
/**
 * Draw gross section by iterating over plate_elements
 * Context must be transformed to section coordinates before calling
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (transformed)
 * @param {Object} section - Section with plate_elements array
 * @param {Object} options - Drawing options
 */
_drawGrossSection: function(ctx, section, options) {
  if (!section.plate_elements || section.plate_elements.length === 0) {
    throw new Error('Section missing plate_elements metadata');
  }

  // Set fill and stroke styles
  ctx.fillStyle = options.grossColor;
  ctx.strokeStyle = options.grossStroke;
  ctx.lineWidth = options.strokeWidth / ctx.getTransform().a;  // Convert px to mm

  // Draw each plate element
  for (const plate of section.plate_elements) {
    this._drawPlateElement(ctx, plate);
  }

  // Stroke outlines (single pass for all elements)
  ctx.stroke();
}
```

### 8.2 Draw Individual Plate Element

```javascript
/**
 * Draw a single plate element as a rectangle
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (transformed)
 * @param {Object} plate - Plate element from plate_elements array
 */
_drawPlateElement: function(ctx, plate) {
  const centroid = plate.geometry.centroid;      // {y: number, z: number}
  const thickness = plate.geometry.thickness;    // mm
  const gross_length = plate.geometry.gross_length; // mm

  let x, y, width, height;

  if (plate.orientation === 'y-direction') {
    // Plate extends in Y-direction (e.g., web)
    // Rectangle: width in Z-direction, height in Y-direction
    x = centroid.z - thickness / 2;
    y = centroid.y - gross_length / 2;
    width = thickness;
    height = gross_length;

  } else if (plate.orientation === 'z-direction') {
    // Plate extends in Z-direction (e.g., flange tips)
    // Rectangle: width in Z-direction, height in Y-direction
    x = centroid.z - gross_length / 2;
    y = centroid.y - thickness / 2;
    width = gross_length;
    height = thickness;

  } else if (plate.orientation === 'radial') {
    // Circular hollow section (CHS)
    // Draw as circle - special case
    this._drawCircularPlate(ctx, plate);
    return;
  }

  // Draw rectangle
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
}
```

### 8.3 Draw Removed Strips

```javascript
/**
 * Draw removed Class 4 strips with hatching
 * Context must be transformed to section coordinates before calling
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (transformed)
 * @param {Array} removedStrips - Array of strip objects from effectiveProperties
 * @param {Object} options - Drawing options
 */
_drawRemovedStrips: function(ctx, removedStrips, options) {
  if (!removedStrips || removedStrips.length === 0) {
    return;  // No strips to draw
  }

  ctx.save();

  // Set fill style with transparency
  ctx.fillStyle = options.removedColor;
  ctx.globalAlpha = options.removedAlpha;

  // Draw each removed strip
  for (const strip of removedStrips) {
    // Calculate rectangle from strip data
    const rect = this._calculateStripRectangle(strip);

    // Fill strip
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Add hatching
    if (options.hatchRemoved) {
      this._drawHatching(ctx, rect, options.hatchAngle, options.hatchSpacing);
    }
  }

  ctx.restore();
}
```

### 8.4 Calculate Strip Rectangle

```javascript
/**
 * Calculate rectangle coordinates for a removed strip
 *
 * @param {Object} strip - Strip object with centroid, width, thickness, orientation
 * @returns {Object} Rectangle {x, y, width, height} in mm
 */
_calculateStripRectangle: function(strip) {
  const centroid = strip.centroid;    // {y: number, z: number} in mm
  const width_mm = strip.width;       // mm (length of removed strip)
  const thickness = strip.thickness;  // mm

  let x, y, width, height;

  if (strip.orientation === 'y-direction') {
    // Vertical strip (e.g., web reduction)
    // Strip width is in Y-direction, thickness in Z-direction
    x = centroid.z - thickness / 2;
    y = centroid.y - width_mm / 2;
    width = thickness;
    height = width_mm;

  } else if (strip.orientation === 'z-direction') {
    // Horizontal strip (e.g., flange tip reduction)
    // Strip width is in Z-direction, thickness in Y-direction
    x = centroid.z - width_mm / 2;
    y = centroid.y - thickness / 2;
    width = width_mm;
    height = thickness;

  } else if (strip.orientation === 'radial') {
    // Circular section - treat as centered rectangle
    x = centroid.z - width_mm / 2;
    y = centroid.y - width_mm / 2;
    width = width_mm;
    height = thickness;
  }

  return { x, y, width, height };
}
```

### 8.5 Draw Hatching Pattern

```javascript
/**
 * Draw diagonal hatching pattern within a rectangle
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (transformed)
 * @param {Object} rect - Rectangle {x, y, width, height} in mm
 * @param {number} angle - Hatching angle in degrees (default: 45)
 * @param {number} spacing - Line spacing in mm (default: 5)
 */
_drawHatching: function(ctx, rect, angle, spacing) {
  ctx.save();

  // Set up clipping region to rectangle
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  // Hatching line style
  ctx.strokeStyle = ctx.fillStyle;  // Match fill color
  ctx.lineWidth = 0.5 / ctx.getTransform().a;  // Thin lines (0.5px in screen coords)
  ctx.globalAlpha = 0.8;

  // Calculate hatching line parameters
  const angleRad = (angle * Math.PI) / 180;
  const dx = Math.cos(angleRad) * spacing;
  const dy = Math.sin(angleRad) * spacing;

  // Determine how many lines needed to cover rectangle diagonal
  const diagonal = Math.sqrt(rect.width ** 2 + rect.height ** 2);
  const numLines = Math.ceil(diagonal / spacing) * 2;

  // Draw parallel diagonal lines
  ctx.beginPath();
  for (let i = -numLines; i <= numLines; i++) {
    const startX = rect.x + i * dx - rect.height * Math.sin(angleRad);
    const startY = rect.y;
    const endX = rect.x + i * dx + rect.height * Math.cos(angleRad);
    const endY = rect.y + rect.height;

    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
  }
  ctx.stroke();

  ctx.restore();
}
```

### 8.6 Draw Legend

```javascript
/**
 * Draw legend in screen coordinates (after ctx.restore())
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (NOT transformed)
 * @param {Object} effectiveProperties - Effective properties or null
 * @param {Object} options - Drawing options
 */
_drawLegend: function(ctx, effectiveProperties, options) {
  if (!options.showLegend) return;

  // Calculate legend position
  const legendWidth = 280;
  const legendItemHeight = 30;
  const legendPadding = 15;
  const boxSize = 20;

  let x, y;
  switch (options.legendPosition) {
    case 'top-left':
      x = legendPadding;
      y = legendPadding;
      break;
    case 'top-right':
      x = options.canvasWidth - legendWidth - legendPadding;
      y = legendPadding;
      break;
    case 'bottom-left':
      x = legendPadding;
      y = options.canvasHeight - (effectiveProperties?.is_effective ? 2 : 1) * legendItemHeight - 2 * legendPadding;
      break;
    case 'bottom-right':
      x = options.canvasWidth - legendWidth - legendPadding;
      y = options.canvasHeight - (effectiveProperties?.is_effective ? 2 : 1) * legendItemHeight - 2 * legendPadding;
      break;
    default:
      x = options.canvasWidth - legendWidth - legendPadding;
      y = legendPadding;
  }

  // Draw legend background (semi-transparent white)
  const legendHeight = (effectiveProperties?.is_effective ? 2 : 1) * legendItemHeight + legendPadding;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(x - 5, y - 5, legendWidth + 10, legendHeight + 10);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 5, y - 5, legendWidth + 10, legendHeight + 10);

  // Item 1: Gross section
  ctx.fillStyle = options.grossColor;
  ctx.fillRect(x, y, boxSize, boxSize);
  ctx.strokeStyle = options.grossStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, boxSize, boxSize);

  ctx.fillStyle = '#1F2937';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Gross section', x + boxSize + 10, y + boxSize / 2 + 5);

  // Item 2: Removed strips (if Class 4)
  if (effectiveProperties?.is_effective) {
    const y2 = y + legendItemHeight;

    // Draw box with hatching
    ctx.fillStyle = options.removedColor;
    ctx.globalAlpha = options.removedAlpha;
    ctx.fillRect(x, y2, boxSize, boxSize);
    ctx.globalAlpha = 1.0;

    // Add mini hatching
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y2, boxSize, boxSize);
    ctx.clip();
    ctx.strokeStyle = options.removedColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * 5, y2);
      ctx.lineTo(x + i * 5 + boxSize, y2 + boxSize);
    }
    ctx.stroke();
    ctx.restore();

    // Text with reduction percentage
    const reductionPct = effectiveProperties.area_reduction_percent.toFixed(1);
    ctx.fillStyle = '#1F2937';
    ctx.fillText(
      `Removed strips (${reductionPct}% area reduction)`,
      x + boxSize + 10,
      y2 + boxSize / 2 + 5
    );
  }
}
```

---

## 9. Integration with Existing Code

### 9.1 HTML Modifications (index.html)

Add canvas element in the results section:

```html
<!-- Add this after the calculation results, before detailed report -->
<div id="section-plot-container" class="hidden mt-6">
  <div class="bg-gray-800 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-white mb-4">Section Visualization</h2>
    <div class="flex justify-center">
      <canvas
        id="section-plot-canvas"
        class="border border-gray-600 rounded"
        style="max-width: 100%;"
      >
        Your browser does not support the canvas element.
      </canvas>
    </div>
  </div>
</div>
```

**Position:** After ULS/Fire results, before detailed report.

### 9.2 Script Loading (index.html)

Add script tag before closing `</body>`:

```html
<!-- Existing scripts -->
<script src="flexural_buckling_api.js"></script>
<script src="flexural_buckling_ui.js"></script>

<!-- NEW: Add section plotter -->
<script src="section_plotter.js"></script>
```

### 9.3 Call from UI Code (flexural_buckling_ui.js)

Add plotting call in the `displayResults()` function:

```javascript
function displayResults(results, inputs) {
  // ... existing result display code ...

  // Show section plot
  const plotContainer = document.getElementById('section-plot-container');
  if (plotContainer && results.success) {
    plotContainer.classList.remove('hidden');

    try {
      // Get section from database
      const section = steelDatabase[inputs.profileType][results.section.profileName];

      // Get effective properties (null if not Class 4)
      const effectiveProps = results.section.results.ulsResults.is_using_effective
        ? results.section.results.ulsResults.effective_properties
        : null;

      // Plot section
      SectionPlotter.plot('section-plot-canvas', section, effectiveProps, {
        profileType: inputs.profileType,
        canvasWidth: 600,
        canvasHeight: 400,
        showLegend: true,
        legendPosition: 'top-right'
      });

    } catch (error) {
      console.error('Section plotting failed:', error);
      plotContainer.classList.add('hidden');
    }
  }
}
```

### 9.4 Data Structure Requirements

The plotter expects `effectiveProperties` to have this structure (already exists in current code):

```javascript
{
  is_effective: true,                    // boolean - is this Class 4?
  area: 36.37,                           // cm² - effective area
  gross_area: 39.12,                     // cm² - gross area
  area_reduction_percent: 7.0,           // % - area reduction
  removed_strips_count: 2,               // number of strips

  // CRITICAL: Array of removed strip objects
  removed_strips: [                      // NOTE: Need to add this to return value
    {
      id: 'web_strip1',
      width: 22.15,                      // mm - strip dimension
      thickness: 6.2,                    // mm - plate thickness
      area: 1.37,                        // cm² - strip area
      orientation: 'y-direction',        // 'y-direction' | 'z-direction' | 'radial'
      centroid: { y: 105.4, z: 0 }       // mm - strip centroid position
    },
    // ... more strips
  ]
}
```

**IMPORTANT:** The current `calculateClass4EffectiveProperties()` creates `removedStrips` array internally but **does NOT include it in the return object**.

**Required modification to `flexural_buckling_api.js`:**

```javascript
// In calculateClass4EffectiveProperties(), add to return statement:
return {
  ...section,
  area: A_eff,
  // ... other properties ...
  removed_strips: removedStrips,  // ← ADD THIS LINE
  removed_strips_count: removedStrips.length
};
```

---

## 10. Testing Strategy

### 10.1 Unit Tests (Manual)

Create test file: `flexural_buckling/test_section_plotter.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Section Plotter Tests</title>
</head>
<body>
  <h1>Section Plotter Unit Tests</h1>

  <!-- Test 1: IPE240 Gross Section Only -->
  <div>
    <h2>Test 1: IPE240 - Gross Section</h2>
    <canvas id="test1" width="600" height="400"></canvas>
  </div>

  <!-- Test 2: IPE240 Class 4 with Removed Strips -->
  <div>
    <h2>Test 2: IPE240 S460 - Class 4 (7% reduction)</h2>
    <canvas id="test2" width="600" height="400"></canvas>
  </div>

  <!-- Test 3: HEA200 Gross Section -->
  <div>
    <h2>Test 3: HEA200 - Gross Section</h2>
    <canvas id="test3" width="600" height="400"></canvas>
  </div>

  <!-- Test 4: Small Section (IPE80) -->
  <div>
    <h2>Test 4: IPE80 - Auto-scaling Test</h2>
    <canvas id="test4" width="400" height="600"></canvas>
  </div>

  <!-- Test 5: Large Section (HEM1000) -->
  <div>
    <h2>Test 5: HEM1000 - Auto-scaling Test</h2>
    <canvas id="test5" width="600" height="400"></canvas>
  </div>

  <script src="../steel_cross_section_database/steel_database_loader.js"></script>
  <script src="flexural_buckling_api.js"></script>
  <script src="section_plotter.js"></script>
  <script>
    // Wait for database to load
    loadSteelDatabase().then(() => {

      // Test 1: IPE240 gross only
      const ipe240 = steelDatabase['ipe']['IPE240'];
      SectionPlotter.plot('test1', ipe240, null, { profileType: 'ipe' });

      // Test 2: IPE240 Class 4
      const classification = classifySection(ipe240, 460, 'ipe');
      const effectiveProps = calculateClass4EffectiveProperties(ipe240, classification, 'ipe');
      SectionPlotter.plot('test2', ipe240, effectiveProps, { profileType: 'ipe' });

      // Test 3: HEA200
      const hea200 = steelDatabase['hea']['HEA200'];
      SectionPlotter.plot('test3', hea200, null, { profileType: 'hea' });

      // Test 4: IPE80 (small)
      const ipe80 = steelDatabase['ipe']['IPE80'];
      SectionPlotter.plot('test4', ipe80, null, {
        profileType: 'ipe',
        canvasWidth: 400,
        canvasHeight: 600
      });

      // Test 5: HEM1000 (large)
      const hem1000 = steelDatabase['hem']['HEM1000'];
      SectionPlotter.plot('test5', hem1000, null, { profileType: 'hem' });

      console.log('All tests rendered');
    });
  </script>
</body>
</html>
```

### 10.2 Visual Verification Checklist

For each test case, verify:

- [ ] Section is centered in canvas
- [ ] Section has proper proportions (matches h/b ratio from database)
- [ ] Gross section is light blue (#93C5FD)
- [ ] Outline is visible and dark blue (#1E40AF)
- [ ] Removed strips (if any) are red (#EF4444) with 50% opacity
- [ ] Hatching is visible at 45° angle on removed strips
- [ ] Legend appears in correct position
- [ ] Legend shows "Gross section" with blue box
- [ ] Legend shows "Removed strips (X% area reduction)" if Class 4
- [ ] Auto-scaling works (small and large sections both fit)
- [ ] No distortion (circles should be circular, not elliptical)

### 10.3 Profile Type Coverage

Test at least one section from each profile family:

| Profile Type | Test Section | Expected Behavior |
|--------------|--------------|-------------------|
| IPE | IPE240 | Narrow flanges, tall web |
| HEA | HEA200 | Wide flanges, moderate web |
| HEB | HEB200 | Wide flanges, thick web |
| HEM | HEM200 | Very wide flanges, very thick web |
| HRHS | HRHS 100x100x5 | Rectangular hollow (4 plate elements) |
| CHS | CHS 139.7x5 | Circular hollow (special rendering) |

---

## 11. Example Usage

### 11.1 Basic Usage - Gross Section Only

```javascript
// Get section from database
const section = steelDatabase['ipe']['IPE300'];

// Plot gross section only (no Class 4 reductions)
SectionPlotter.plot('section-canvas', section, null, {
  profileType: 'ipe',
  canvasWidth: 600,
  canvasHeight: 400
});
```

### 11.2 Advanced Usage - Class 4 Section

```javascript
// Calculate buckling capacity with Class 4
const inputs = {
  profileType: 'ipe',
  profileName: 'IPE240',
  steelGrade: 'S460',
  fy: 460,
  Ly: 4000,
  Lz: 4000,
  NEd_ULS: 650,
  allowClass4: true
};

const section = steelDatabase['ipe']['IPE240'];
const classification = classifySection(section, 460, 'ipe');
const effectiveProps = calculateClass4EffectiveProperties(section, classification, 'ipe');

// Plot with Class 4 reductions
SectionPlotter.plot('section-canvas', section, effectiveProps, {
  profileType: 'ipe',
  canvasWidth: 800,
  canvasHeight: 500,
  grossColor: '#93C5FD',
  removedColor: '#EF4444',
  hatchRemoved: true,
  showLegend: true,
  legendPosition: 'top-right'
});
```

### 11.3 Custom Styling

```javascript
SectionPlotter.plot('section-canvas', section, effectiveProps, {
  profileType: 'ipe',
  canvasWidth: 600,
  canvasHeight: 400,

  // Custom colors
  grossColor: '#60A5FA',        // Lighter blue
  grossStroke: '#1E3A8A',       // Darker outline
  removedColor: '#DC2626',      // Darker red
  removedAlpha: 0.7,            // More opaque

  // Custom hatching
  hatchAngle: 135,              // Opposite diagonal
  hatchSpacing: 3,              // Tighter spacing

  // Legend
  legendPosition: 'bottom-left',
  backgroundColor: '#F9FAFB'    // Light gray background
});
```

---

## 12. Implementation Checklist

Use this checklist when implementing:

### Phase 1: Setup
- [ ] Create `section_plotter.js` file
- [ ] Add canvas element to `index.html`
- [ ] Add script tag to load plotter
- [ ] Create `SectionPlotter` object skeleton

### Phase 2: Core Functions
- [ ] Implement `_setupCanvas()`
- [ ] Implement `_calculateScale()`
- [ ] Implement `_drawPlateElement()`
- [ ] Implement `_drawGrossSection()`
- [ ] Test gross section rendering (all profile types)

### Phase 3: Class 4 Support
- [ ] Modify `calculateClass4EffectiveProperties()` to return `removed_strips` array
- [ ] Implement `_calculateStripRectangle()`
- [ ] Implement `_drawRemovedStrips()`
- [ ] Implement `_drawHatching()`
- [ ] Test Class 4 rendering (IPE240 S460)

### Phase 4: Legend and Polish
- [ ] Implement `_drawLegend()`
- [ ] Test legend positioning (all 4 positions)
- [ ] Add error handling
- [ ] Add input validation

### Phase 5: Integration
- [ ] Add plot call to `displayResults()` in UI
- [ ] Test full workflow (calculate → plot)
- [ ] Test responsive behavior (different canvas sizes)
- [ ] Create test HTML file

### Phase 6: Documentation
- [ ] Add JSDoc comments to all functions
- [ ] Create usage examples
- [ ] Document known limitations
- [ ] Update main README if needed

---

## 13. Known Limitations and Future Enhancements

### Current Limitations
1. **Simplified geometry**: Fillets (corner radii) are ignored; sections drawn as pure rectangles
2. **CHS rendering**: Circular hollow sections not fully implemented (future work)
3. **No dimensions**: Dimension lines not shown (can add in future)
4. **Static only**: No zoom/pan interaction (future enhancement)
5. **Pure compression only**: ψ ≠ 1 cases (bending) use different strip patterns (future work)

### Future Enhancements
1. **Dimension lines**: Show h, b, tw, tf with arrows and labels
2. **Interactive**: Click elements to highlight, zoom with mouse wheel
3. **Export**: PNG/SVG export button
4. **Animation**: Transition from gross to effective section
5. **Tooltips**: Hover over strips to see reduction calculations
6. **Comparison view**: Side-by-side gross vs effective
7. **Fillet rendering**: Use bezier curves for rounded corners
8. **3D view**: Isometric projection with depth

---

## 14. Troubleshooting Guide

### Problem: Canvas is blank

**Causes:**
- Canvas element not found → Check `canvasId` parameter
- Section missing `plate_elements` → Check database loaded correctly
- JavaScript error → Check browser console for errors

**Solution:**
```javascript
console.log('Canvas:', document.getElementById('section-canvas'));
console.log('Section:', section);
console.log('Plate elements:', section.plate_elements);
```

### Problem: Section is distorted or wrong proportions

**Cause:** Y-axis scaling not inverted

**Solution:** Ensure `ctx.scale(scale, -scale)` uses **negative Y scale**

### Problem: Removed strips not visible

**Causes:**
- `effectiveProperties` is null → Check Class 4 condition
- `is_effective` is false → Section is not Class 4
- `removed_strips` array missing → Check return value modification

**Solution:**
```javascript
console.log('Effective props:', effectiveProps);
console.log('Is effective:', effectiveProps?.is_effective);
console.log('Removed strips:', effectiveProps?.removed_strips);
```

### Problem: Hatching not visible

**Causes:**
- `hatchRemoved: false` in options
- Hatching color same as background
- Line width too small

**Solution:** Increase `ctx.lineWidth` or change `hatchSpacing`

### Problem: Legend overlaps section

**Cause:** Poor auto-positioning or large section

**Solution:** Use different `legendPosition` or increase canvas padding

---

## 15. Complete Implementation Template

```javascript
// section_plotter.js

/**
 * Section Plotter Module
 * Visualize steel cross-sections with Class 4 effective properties
 *
 * @author Claude Code
 * @version 1.0.0
 * @requires HTML5 Canvas API
 * @requires flexural_buckling_api.js (for data structures)
 */

const SectionPlotter = (function() {
  'use strict';

  // Default options
  const DEFAULT_OPTIONS = {
    canvasWidth: 600,
    canvasHeight: 400,
    padding: 60,
    grossColor: '#93C5FD',
    grossStroke: '#1E40AF',
    strokeWidth: 2,
    removedColor: '#EF4444',
    removedAlpha: 0.5,
    hatchRemoved: true,
    hatchAngle: 45,
    hatchSpacing: 5,
    showLegend: true,
    legendPosition: 'top-right',
    backgroundColor: '#FFFFFF'
  };

  /**
   * Main public API function
   * [Full JSDoc from Section 4.1]
   */
  function plot(canvasId, section, effectiveProperties, options = {}) {
    // Merge options with defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Validation
    _validate(canvasId, section, opts);

    // Get canvas and setup
    const canvas = document.getElementById(canvasId);
    const ctx = _setupCanvas(canvas, section, opts);

    // Calculate scale
    const scale = _calculateScale(canvas, section, opts.padding);

    // Save context state
    ctx.save();

    // Apply transformation to section coordinates
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, -scale);

    // Draw gross section
    _drawGrossSection(ctx, section, opts);

    // Draw removed strips if Class 4
    if (effectiveProperties?.is_effective) {
      _drawRemovedStrips(ctx, effectiveProperties.removed_strips, opts);
    }

    // Restore context (back to screen coordinates)
    ctx.restore();

    // Draw legend in screen coordinates
    _drawLegend(ctx, effectiveProperties, opts, canvas);

    // Return metadata
    return {
      scale: scale,
      bounds: { width: section.b, height: section.h },
      drawnElements: section.plate_elements.length,
      drawnStrips: effectiveProperties?.removed_strips?.length || 0
    };
  }

  /**
   * Validate inputs
   */
  function _validate(canvasId, section, opts) {
    if (!canvasId || !document.getElementById(canvasId)) {
      throw new Error(`Canvas element '${canvasId}' not found`);
    }

    if (!section || !section.plate_elements) {
      throw new Error('Section must have plate_elements array');
    }

    if (!opts.profileType) {
      throw new Error('profileType option is required');
    }

    if (!section.h || !section.b) {
      throw new Error('Section must have h and b properties');
    }
  }

  /**
   * Setup canvas
   * [Implementation from Section 7.2]
   */
  function _setupCanvas(canvas, section, opts) {
    canvas.width = opts.canvasWidth;
    canvas.height = opts.canvasHeight;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return ctx;
  }

  /**
   * Calculate auto-scale factor
   * [Implementation from Section 7.1]
   */
  function _calculateScale(canvas, section, padding) {
    const availableWidth = canvas.width - 2 * padding;
    const availableHeight = canvas.height - 2 * padding;

    const scaleX = availableWidth / section.b;
    const scaleY = availableHeight / section.h;

    return Math.min(scaleX, scaleY);
  }

  /**
   * Draw gross section
   * [Implementation from Section 8.1]
   */
  function _drawGrossSection(ctx, section, opts) {
    if (!section.plate_elements || section.plate_elements.length === 0) {
      throw new Error('Section missing plate_elements metadata');
    }

    ctx.fillStyle = opts.grossColor;
    ctx.strokeStyle = opts.grossStroke;
    ctx.lineWidth = opts.strokeWidth / ctx.getTransform().a;

    for (const plate of section.plate_elements) {
      _drawPlateElement(ctx, plate);
    }

    ctx.stroke();
  }

  /**
   * Draw single plate element
   * [Implementation from Section 8.2]
   */
  function _drawPlateElement(ctx, plate) {
    // [Full implementation from Section 8.2]
    // ... (code from Section 8.2)
  }

  /**
   * Draw removed strips
   * [Implementation from Section 8.3]
   */
  function _drawRemovedStrips(ctx, removedStrips, opts) {
    // [Full implementation from Section 8.3]
    // ... (code from Section 8.3)
  }

  /**
   * Calculate strip rectangle
   * [Implementation from Section 8.4]
   */
  function _calculateStripRectangle(strip) {
    // [Full implementation from Section 8.4]
    // ... (code from Section 8.4)
  }

  /**
   * Draw hatching pattern
   * [Implementation from Section 8.5]
   */
  function _drawHatching(ctx, rect, angle, spacing) {
    // [Full implementation from Section 8.5]
    // ... (code from Section 8.5)
  }

  /**
   * Draw legend
   * [Implementation from Section 8.6]
   */
  function _drawLegend(ctx, effectiveProperties, opts, canvas) {
    // [Full implementation from Section 8.6]
    // ... (code from Section 8.6)
  }

  // Public API
  return {
    plot: plot
  };
})();
```

---

## 16. Success Criteria

The implementation is complete when:

1. ✅ All profile types (IPE, HEA, HEB, HEM, RHS, CHS) render correctly
2. ✅ Gross section displays with correct proportions and colors
3. ✅ Class 4 removed strips display in red with hatching
4. ✅ Auto-scaling works for all section sizes (IPE80 to HEM1000)
5. ✅ Legend shows correct information and positioning
6. ✅ No console errors or warnings
7. ✅ Integration with main UI works seamlessly
8. ✅ Visual tests pass for all test cases
9. ✅ Code is well-documented with JSDoc comments
10. ✅ Test HTML file demonstrates all features

---

## End of Implementation Plan

**Next Steps:**
1. Review this plan thoroughly
2. Set up development environment
3. Follow implementation checklist (Section 12)
4. Test each phase before proceeding
5. Document any deviations from this plan

**Questions or Issues:**
- Refer to Troubleshooting Guide (Section 14)
- Check EN 1993-1-5 PDF for standards compliance
- Review existing `flexural_buckling_api.js` for data structures
- Consult steel database JSON files for plate_elements structure

Good luck with implementation! 🎉
