# Implementation Plan: Am/V-max Fire Design Parameter

**Module:** flexural_buckling
**Feature:** Section Factor (Am/V) filtering for fire design
**Author:** Claude
**Date:** 2026-03-04
**Status:** Planning Complete - Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Database Analysis](#database-analysis)
3. [Am/V Calculation Logic](#amv-calculation-logic)
4. [Shadow Parameter (k_sh)](#shadow-parameter-ksh)
5. [Exposure Configurations](#exposure-configurations)
6. [UI Implementation](#ui-implementation)
7. [API Implementation](#api-implementation)
8. [Testing Requirements](#testing-requirements)
9. [Report Generation](#report-generation)
10. [Implementation Checklist](#implementation-checklist)

---

## 1. Overview

### Purpose
Add an optional Am/V-max (section factor) parameter to the fire design section that allows users to filter steel sections based on their heated perimeter to volume ratio. This prevents selecting sections that heat up too quickly and require excessive or impractical fire insulation.

### Key Features
- ✅ Calculate Am/V based on fire exposure configuration (4-sides, 3-sides, 2-sides, 1-side)
- ✅ Apply shadow parameter (k_sh) for I/H-profiles to account for shadowing effect
- ✅ Filter sections during "Find Lightest Section" search
- ✅ Display calculated Am/V in results
- ✅ Support all profile types (I-sections, RHS/SHS, CHS)

### Technical Terms
- **Am**: Exposed surface area per unit length (mm²/m → simplified to mm)
- **V**: Volume per unit length (mm³/m → simplified to mm²)
- **Am/V**: Section factor (m⁻¹) - ratio of heated perimeter to cross-sectional area
- **k_sh**: Shadow parameter - reduction factor accounting for heat shadowing in I/H-profiles

---

## 2. Database Analysis

### Findings

✅ **All steel section profiles contain required parameters:**

| Parameter | Description | Unit | Availability |
|-----------|-------------|------|--------------|
| `P` | Perimeter (outer) | mm | ✓ All profiles |
| `h` | Section height | mm | ✓ All profiles |
| `b` | Section width (flange width) | mm | ✓ All profiles |
| `A` | Cross-sectional area | mm² | ✓ All profiles |
| `tw` | Web thickness | mm | ✓ I/H sections |
| `tf` | Flange thickness | mm | ✓ I/H sections |
| `t` | Wall thickness | mm | ✓ Hollow sections |

### Database Structure Example

**I-Section (HEA100):**
```json
{
  "profile": "HEA100",
  "h": 96,      // Height in mm
  "b": 100,     // Flange width in mm
  "tw": 5,      // Web thickness in mm
  "tf": 8,      // Flange thickness in mm
  "P": 561,     // Perimeter in mm
  "A": 2124     // Area in mm²
}
```

**Hollow Section (HRHS 50x30 / 2.6):**
```json
{
  "profile": "HRHS 50x30 / 2.6",
  "h": 50,      // Height in mm
  "b": 30,      // Width in mm
  "t": 2.6,     // Wall thickness in mm
  "P": 0.153,   // Perimeter in mm (NOTE: This seems to be in meters - verify!)
  "A": 382      // Area in mm²
}
```

⚠️ **Note:** Need to verify perimeter units in hollow section database - value seems to be in meters, not mm.

---

## 3. Am/V Calculation Logic

### Base Formula

```
Am/V = (Exposed perimeter per unit length) / (Cross-sectional area)
     = Am / A

Where:
- Am = Exposed perimeter (mm) [simplified from mm²/m]
- A = Cross-sectional area (mm²)
- Result in m⁻¹ = (Am / A) × 1000
```

### With Shadow Parameter

For I/H-profiles exposed on multiple sides, heat shadowing reduces effective heating:

```
Am/V_effective = k_sh × Am/V

Where:
- k_sh = Shadow parameter (dimensionless)
- k_sh = 0.9 (standard for I/H profiles in fire design)
- k_sh = 1.0 (default, no shadowing correction)
```

### When to Apply k_sh

| Profile Family | Apply k_sh? | Default k_sh | Notes |
|----------------|-------------|--------------|-------|
| HEA, HEB, HEM, IPE | ✓ Yes | 0.9 | Standard fire design practice |
| HRHS, HSHS, CRHS, CSHS | ✗ No | 1.0 | Hollow sections have no shadowing |
| HCHS, CCHS | ✗ No | 1.0 | Circular sections have no shadowing |

**User Control:** Allow user to override k_sh from 0.0 to 1.0 (default based on profile type).

---

## 4. Shadow Parameter (k_sh)

### Background

The shadow parameter accounts for the **heat shadowing effect** in I and H-profiles:
- Inner surfaces of flanges and webs receive less radiation due to geometric shadowing
- Standard fire design codes use k_sh = 0.9 for I/H profiles
- Reduces effective Am/V by 10%, allowing slightly higher Am/V sections

### Implementation Requirements

1. **Default Values:**
   - I/H profiles (HEA, HEB, HEM, IPE): k_sh = 0.9
   - Hollow sections (all RHS, SHS, CHS): k_sh = 1.0 (no shadowing)

2. **User Override:**
   - Add input field for k_sh (range: 0.0 to 1.0, step: 0.05)
   - Default automatically based on profile type
   - Update when profile type changes
   - Allow manual override if user has specific requirements

3. **Calculation:**
   ```javascript
   Am/V_base = (Am / A) × 1000  // m⁻¹
   Am/V_effective = k_sh × Am/V_base
   ```

4. **Display:**
   - Show both Am/V_base and Am/V_effective in results
   - Clearly indicate when k_sh ≠ 1.0
   - Show formula: "Am/V_eff = k_sh × Am/V_base = 0.9 × 180.5 = 162.5 m⁻¹"

### UI Location

Place k_sh input **immediately after** the exposure configuration dropdown:

```
┌─────────────────────────────────────────────┐
│ Section Factor (Am/V) Filtering             │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────────┐  ┌──────────────────┐  │
│ │ Exposure Config │  │ Shadow Factor    │  │
│ │ 4 sides        ▼│  │ k_sh: 0.9       │  │
│ └─────────────────┘  └──────────────────┘  │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Maximum Am/V: 200 m⁻¹                  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 5. Exposure Configurations

### ⚠️ REVISED - Updated to match Conlit calculator approach

Based on Conlit fire insulation calculator requirements with simpler, clearer options:

| Config ID | Description | Illustration | Am Formula (I/H) | Am Formula (RHS/SHS) | k_sh Applied? |
|-----------|-------------|--------------|------------------|----------------------|---------------|
| `4-sides` | All exposed | `┌─┐`<br>`│▓│`<br>`└─┘` | `P` | `P` | ✓ (I/H: 0.9) |
| `3-sides-left-protected` | Left side protected | `┌─┐`<br>`║▓│`<br>`└─┘` | `P - h_side` | `P - h` | ✓ (I/H: 0.9) |
| `3-sides-top-protected` | Top protected | `═══`<br>`│▓│`<br>`└─┘` | `P - b` | `P - b` | ✓ (I/H: 0.9) |
| `2-sides-left-top-protected` | Left and top protected | `═══`<br>`║▓│`<br>`└─┘` | `P - h_side - b` | `P - h - b` | ✓ (I/H: 0.9) |
| `1-side-bottom` | Bottom only | `═══`<br>`║▓║`<br>`└─┘` | `b` | `b` | ✗ (1.0) |
| `1-side-side` | Side only | `═══`<br>`║▓│`<br>`═══` | `h_side` | `h` | ✗ (1.0) |

**Legend:**
- `─` or `═` = Protected (non-exposed) side
- `│` or `║` = Exposed side / Protected side
- `▓` = Section profile (shaded)

**Key Changes from Original:**
1. ❌ Removed: `3-sides-bottom` (rarely used, can be handled by rotating section)
2. ❌ Removed: `1-side-left`, `1-side-right` (combined into `1-side-side`)
3. ✅ Added: `3-sides-left-protected` (standard Conlit case)
4. ✅ Added: `2-sides-left-top-protected` (combination case)
5. ✅ Fixed: RHS/SHS formulas now use `b` for top, not `h`

**Important Note on I/H Beam Geometry:**

For I/H sections, the actual **side length** (vertical edge) follows the profile geometry including radii:

```
h_side = tf + (b/2 - r - tw/2) + (π × r / 2) + (h - 2×tf - 2×r) + (π × r / 2) + (b/2 - r - tw/2) + tf
```

Where:
- `tf` = flange thickness (mm)
- `b` = flange width (mm) [noted as `bf` in some standards]
- `r` = root radius (mm)
- `tw` = web thickness (mm)
- `h` = section height (mm)

**Simplified for implementation:**
```
h_side = h + b - 2×r - tw + π×r
```

**For RHS/SHS (Rectangular/Square Hollow Sections):**
- Side is simply `h` (the section height parameter)

### Notes on k_sh Application

- **Apply k_sh only when multiple sides are exposed** (≥2 sides)
- **Do NOT apply k_sh for 1-side exposure** (no shadowing with single-sided heating)
- Hollow sections always use k_sh = 1.0 (no internal shadowing geometry)

### Circular Sections (CHS)

For circular hollow sections (HCHS, CCHS):
- `4-sides`, `3-sides-*`: Use full perimeter `P`, k_sh = 1.0
- `2-sides`, `1-side-*`: **Not applicable** - show warning or disable option

---

## 6. UI Implementation

### 6.1 HTML Structure

Add to `index.html` inside the "Fire Design (Optional)" section, after the temperature mode toggle:

```html
<!-- Am/V Filtering Section -->
<div class="mt-3 border-t border-gray-700 pt-3">
  <div class="flex items-center justify-between mb-3">
    <div>
      <h3 class="text-sm font-semibold text-white">Section Factor (Am/V) Filtering</h3>
      <p class="text-xs text-gray-400 mt-1">
        Limit maximum Am/V to avoid sections requiring excessive fire insulation
      </p>
    </div>
    <label class="flex items-center cursor-pointer">
      <input type="checkbox" id="amv-filter-enabled" class="mr-1 w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500">
      <span class="text-gray-300 text-xs">Enable Am/V Filter</span>
    </label>
  </div>

  <!-- Am/V Filter Inputs (shown when enabled) -->
  <div id="amv-filter-inputs" class="hidden">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <!-- Exposure Configuration Dropdown -->
      <div>
        <label for="exposure-config" class="block text-xs font-medium text-gray-300 mb-1">
          Exposure Configuration
        </label>
        <select id="exposure-config"
                class="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500">
          <option value="4-sides">4 sides (all exposed)</option>
          <option value="3-sides-top">3 sides - top non-exposed</option>
          <option value="3-sides-bottom">3 sides - bottom non-exposed</option>
          <option value="2-sides">2 sides (webs only)</option>
          <option value="1-side-left">1 side - left web</option>
          <option value="1-side-right">1 side - right web</option>
          <option value="1-side-bottom">1 side - bottom flange</option>
        </select>
        <p class="text-xs text-gray-400 mt-1">Which sides exposed to fire</p>
      </div>

      <!-- Shadow Parameter (k_sh) -->
      <div>
        <label for="shadow-factor" class="block text-xs font-medium text-gray-300 mb-1">
          Shadow Factor (k<sub>sh</sub>)
          <span class="text-gray-500 cursor-help" title="Accounts for heat shadowing in I/H profiles. Standard: 0.9 for I/H, 1.0 for hollow sections">ⓘ</span>
        </label>
        <input type="number"
               id="shadow-factor"
               class="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-cyan-500"
               value="0.9"
               min="0.0"
               max="1.0"
               step="0.05"
               placeholder="0.9">
        <p class="text-xs text-gray-400 mt-1">
          <span id="shadow-factor-hint">Standard: 0.9 (I/H)</span>
        </p>
      </div>

      <!-- Max Am/V Input -->
      <div>
        <label for="max-amv" class="block text-xs font-medium text-gray-300 mb-1">
          Maximum Am/V (m⁻¹)
        </label>
        <input type="number"
               id="max-amv"
               class="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-cyan-500"
               value="200"
               min="50"
               max="500"
               step="10"
               placeholder="e.g. 200">
        <p class="text-xs text-gray-400 mt-1">
          Typical: 100-300 m⁻¹
        </p>
      </div>
    </div>

    <!-- Calculated Am/V Display (shown after calculation) -->
    <div id="calculated-amv-display" class="hidden mt-3 p-3 bg-gray-700 rounded">
      <h4 class="text-xs font-semibold text-gray-300 mb-2">Calculated Section Factor</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <p class="text-gray-400">Exposed Perimeter (Am)</p>
          <p class="text-lg font-mono text-white" id="calculated-am-value">-</p>
        </div>
        <div>
          <p class="text-gray-400">Base Am/V</p>
          <p class="text-lg font-mono text-white" id="calculated-amv-base">-</p>
        </div>
        <div>
          <p class="text-gray-400">Shadow Factor (k<sub>sh</sub>)</p>
          <p class="text-lg font-mono text-cyan-400" id="calculated-ksh-value">-</p>
        </div>
        <div>
          <p class="text-gray-400">Effective Am/V</p>
          <p class="text-xl font-mono font-bold text-cyan-400" id="calculated-amv-effective">-</p>
        </div>
      </div>
      <div class="mt-2 pt-2 border-t border-gray-600">
        <p class="text-xs" id="amv-status">-</p>
        <p class="text-xs text-gray-400 mt-1" id="amv-formula">-</p>
      </div>
    </div>
  </div>
</div>
```

### 6.2 JavaScript Event Listeners

Add to `flexural_buckling_ui.js`:

```javascript
// ============================================================================
// AM/V FILTERING - UI LOGIC
// ============================================================================

/**
 * Toggle Am/V filter visibility
 */
document.getElementById('amv-filter-enabled')?.addEventListener('change', function(e) {
  const inputs = document.getElementById('amv-filter-inputs');
  if (e.target.checked) {
    inputs.classList.remove('hidden');
  } else {
    inputs.classList.add('hidden');
    // Hide calculated display
    document.getElementById('calculated-amv-display')?.classList.add('hidden');
  }
});

/**
 * Update shadow factor (k_sh) when profile type changes
 */
document.getElementById('profile-type')?.addEventListener('change', function(e) {
  const profileType = e.target.value;
  const shadowFactorInput = document.getElementById('shadow-factor');
  const shadowFactorHint = document.getElementById('shadow-factor-hint');
  const exposureConfig = document.getElementById('exposure-config');

  if (!shadowFactorInput) return;

  // Set default k_sh based on profile type
  const isIorH = ['hea', 'heb', 'hem', 'ipe'].includes(profileType);
  const isHollow = ['hrhs', 'hshs', 'hchs', 'crhs', 'cshs', 'cchs'].includes(profileType);
  const isCircular = ['hchs', 'cchs'].includes(profileType);

  if (isIorH) {
    shadowFactorInput.value = '0.9';
    shadowFactorHint.textContent = 'Standard: 0.9 (I/H)';
  } else if (isHollow) {
    shadowFactorInput.value = '1.0';
    shadowFactorHint.textContent = 'Standard: 1.0 (Hollow)';
  }

  // Disable incompatible exposure configs for circular sections
  if (isCircular && exposureConfig) {
    const options = exposureConfig.options;
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const incompatible = ['2-sides', '1-side-left', '1-side-right', '1-side-bottom'].includes(option.value);
      option.disabled = incompatible;
      if (incompatible) {
        option.textContent = option.textContent.replace(' (N/A for circular)', '') + ' (N/A for circular)';
      }
    }
    // Reset to 4-sides if current selection is invalid
    if (['2-sides', '1-side-left', '1-side-right', '1-side-bottom'].includes(exposureConfig.value)) {
      exposureConfig.value = '4-sides';
    }
  } else if (exposureConfig) {
    // Re-enable all options for non-circular sections
    const options = exposureConfig.options;
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      option.disabled = false;
      option.textContent = option.textContent.replace(' (N/A for circular)', '');
    }
  }
});

/**
 * Update k_sh hint based on exposure configuration
 */
document.getElementById('exposure-config')?.addEventListener('change', function(e) {
  const exposureConfig = e.target.value;
  const shadowFactorHint = document.getElementById('shadow-factor-hint');
  const profileType = document.getElementById('profile-type')?.value;

  if (!shadowFactorHint) return;

  const isIorH = ['hea', 'heb', 'hem', 'ipe'].includes(profileType);
  const isSingleSide = ['1-side-left', '1-side-right', '1-side-bottom'].includes(exposureConfig);

  if (isIorH && !isSingleSide) {
    shadowFactorHint.textContent = 'Standard: 0.9 (I/H, multi-side)';
  } else if (isIorH && isSingleSide) {
    shadowFactorHint.textContent = 'Use 1.0 for single-side exposure';
  } else {
    shadowFactorHint.textContent = 'Standard: 1.0 (Hollow)';
  }
});

/**
 * Display Am/V calculation results
 */
function displayAmVResults(result) {
  if (!result.amvResult || result.amvResult.AmV === null) {
    document.getElementById('calculated-amv-display')?.classList.add('hidden');
    return;
  }

  const amvDisplay = document.getElementById('calculated-amv-display');
  const amValue = document.getElementById('calculated-am-value');
  const amvBase = document.getElementById('calculated-amv-base');
  const kshValue = document.getElementById('calculated-ksh-value');
  const amvEffective = document.getElementById('calculated-amv-effective');
  const amvStatus = document.getElementById('amv-status');
  const amvFormula = document.getElementById('amv-formula');

  if (!amvDisplay) return;

  const amvResult = result.amvResult;
  const maxAmV = parseFloat(document.getElementById('max-amv')?.value || 200);

  // Show display
  amvDisplay.classList.remove('hidden');

  // Fill values
  amValue.textContent = `${amvResult.Am.toFixed(1)} mm`;
  amvBase.textContent = `${amvResult.AmV_base.toFixed(1)} m⁻¹`;
  kshValue.textContent = amvResult.k_sh.toFixed(2);
  amvEffective.textContent = `${amvResult.AmV.toFixed(1)} m⁻¹`;

  // Status message
  if (amvResult.AmV <= maxAmV) {
    amvStatus.innerHTML = `<span class="text-green-400">✓ Within limit</span> (≤ ${maxAmV} m⁻¹)`;
    amvEffective.className = 'text-xl font-mono font-bold text-green-400';
  } else {
    amvStatus.innerHTML = `<span class="text-red-400">✗ Exceeds limit</span> (> ${maxAmV} m⁻¹)`;
    amvEffective.className = 'text-xl font-mono font-bold text-red-400';
  }

  // Formula display
  if (amvResult.k_sh !== 1.0) {
    amvFormula.textContent = `Am/V_eff = k_sh × Am/V_base = ${amvResult.k_sh.toFixed(2)} × ${amvResult.AmV_base.toFixed(1)} = ${amvResult.AmV.toFixed(1)} m⁻¹`;
  } else {
    amvFormula.textContent = `Am/V_eff = Am/V_base = ${amvResult.AmV_base.toFixed(1)} m⁻¹ (no shadowing correction)`;
  }
}
```

---

## 7. API Implementation

### 7.1 Module Configuration Updates

Add to `MODULE_CONFIG.inputs` in `flexural_buckling_api.js` (around line 150):

```javascript
// Am/V filtering parameters
amvFilterEnabled: {
  label: "Enable Am/V filter",
  symbol: "Am/V filter",
  type: "boolean",
  required: false,
  default: false,
  category: "loads_fire",
  description: "Filter sections by section factor (Am/V) to limit fire insulation requirements"
},
exposureConfig: {
  label: "Exposure configuration",
  symbol: "Exposure",
  type: "select",
  options: ["4-sides", "3-sides-top", "3-sides-bottom", "2-sides",
            "1-side-left", "1-side-right", "1-side-bottom"],
  required: false,
  default: "4-sides",
  category: "loads_fire",
  description: "Fire exposure configuration (which sides are exposed to fire)"
},
shadowFactor: {
  label: "Shadow factor",
  symbol: "k_sh",
  type: "number",
  unit: "-",
  required: false,
  min: 0.0,
  max: 1.0,
  default: 0.9,
  category: "loads_fire",
  description: "Shadow parameter for I/H profiles (0.9 standard, 1.0 for hollow sections)"
},
maxAmV: {
  label: "Maximum Am/V",
  symbol: "Am/V_max",
  type: "number",
  unit: "m⁻¹",
  required: false,
  min: 50,
  max: 500,
  default: 200,
  category: "loads_fire",
  description: "Maximum allowed section factor (Am/V ratio)"
}
```

### 7.2 Main Calculation Function

Add new function to `flexural_buckling_api.js`:

```javascript
/**
 * Calculate side height for I/H sections accounting for geometry
 * Side = tf + flat_flange + quarter_circle + web + quarter_circle + flat_flange + tf
 * Simplified: h_side = h + b - 2×r - tw + π×r
 *
 * @param {Object} section - Section properties
 * @returns {number} Side height in mm
 */
function calculateIHSideHeight(section) {
  const h = section.h;    // Section height (mm)
  const b = section.b;    // Flange width (mm)
  const tw = section.tw;  // Web thickness (mm)
  const r = section.r;    // Root radius (mm)

  // h_side = h + b - 2×r - tw + π×r
  const h_side = h + b - 2*r - tw + Math.PI*r;

  return h_side;
}

/**
 * Calculate section factor Am/V based on exposure configuration
 *
 * @param {Object} section - Section properties from database
 * @param {string} exposureConfig - Exposure configuration ID
 * @param {string} profileType - Profile type (hea, hrhs, etc.)
 * @param {number} shadowFactor - Shadow parameter k_sh (0.0 to 1.0)
 * @returns {Object} {AmV: number, AmV_base: number, Am: number, k_sh: number, status: string}
 */
function calculateSectionFactor(section, exposureConfig, profileType, shadowFactor = 1.0) {
  const A = section.A;  // Area in mm²
  const P = section.P;  // Perimeter in mm
  const h = section.h;  // Height in mm
  const b = section.b;  // Width in mm (flange width for I/H)

  // Validate inputs
  if (!A || A <= 0) {
    return {
      AmV: null,
      AmV_base: null,
      Am: null,
      k_sh: shadowFactor,
      error: 'Invalid section area',
      description: 'Error'
    };
  }

  let Am;  // Exposed perimeter in mm
  let description = '';

  // Profile type checks
  const isIorH = ['hea', 'heb', 'hem', 'ipe'].includes(profileType);
  const isCircular = ['hchs', 'cchs'].includes(profileType);
  const isHollow = ['hrhs', 'hshs', 'hchs', 'crhs', 'cshs', 'cchs'].includes(profileType);

  // Calculate side height for I/H sections (accounts for radii and geometry)
  let h_side = h;  // Default for RHS/SHS
  if (isIorH && section.tw && section.r) {
    h_side = calculateIHSideHeight(section);
  }

  // Calculate exposed perimeter based on configuration
  switch (exposureConfig) {
    case '4-sides':
      Am = P;
      description = 'All sides exposed';
      break;

    case '3-sides-top':
      if (isCircular) {
        Am = P;
        description = '3 sides (top non-exposed) - using full perimeter for circular section';
      } else if (isIorH) {
        // P - b (remove top flange width)
        Am = P - b;
        description = '3 sides (top flange non-exposed)';
      } else {
        // RHS/SHS: P - h (remove top side)
        Am = P - h;
        description = '3 sides (top non-exposed)';
      }
      break;

    case '3-sides-bottom':
      if (isCircular) {
        Am = P;
        description = '3 sides (bottom non-exposed) - using full perimeter for circular section';
      } else if (isIorH) {
        // P - b (remove bottom flange width)
        Am = P - b;
        description = '3 sides (bottom flange non-exposed)';
      } else {
        // RHS/SHS: P - h (remove bottom side)
        Am = P - h;
        description = '3 sides (bottom non-exposed)';
      }
      break;

    case '2-sides':
      if (isCircular) {
        return {
          AmV: null,
          AmV_base: null,
          Am: null,
          k_sh: shadowFactor,
          error: 'Configuration not applicable to circular sections',
          description: 'Not applicable'
        };
      }
      // I/H: 2 × h_side (includes radii and flange parts)
      // RHS/SHS: 2 × h (simple rectangle)
      Am = 2 * h_side;
      description = '2 sides (webs only)';
      break;

    case '1-side-left':
      if (isCircular) {
        return {
          AmV: null,
          AmV_base: null,
          Am: null,
          k_sh: shadowFactor,
          error: 'Configuration not applicable to circular sections',
          description: 'Not applicable'
        };
      }
      // I/H: h_side (includes radii)
      // RHS/SHS: h
      Am = h_side;
      description = '1 side (left web)';
      break;

    case '1-side-right':
      if (isCircular) {
        return {
          AmV: null,
          AmV_base: null,
          Am: null,
          k_sh: shadowFactor,
          error: 'Configuration not applicable to circular sections',
          description: 'Not applicable'
        };
      }
      // I/H: h_side (includes radii)
      // RHS/SHS: h
      Am = h_side;
      description = '1 side (right web)';
      break;

    case '1-side-bottom':
      if (isCircular) {
        return {
          AmV: null,
          AmV_base: null,
          Am: null,
          k_sh: shadowFactor,
          error: 'Configuration not applicable to circular sections',
          description: 'Not applicable'
        };
      }
      // Bottom flange width
      Am = b;
      description = '1 side (bottom flange)';
      break;

    default:
      Am = P;
      description = 'All sides exposed (default)';
  }

  // Calculate base Am/V in m⁻¹
  // Am is in mm, A is in mm²
  // Am/V = Am / A (dimensionless in mm/mm²)
  // Convert to m⁻¹: multiply by 1000 (mm → m conversion factor)
  const AmV_base = (Am / A) * 1000;  // Result in m⁻¹

  // Determine if shadow factor should be applied
  // Apply k_sh only for I/H profiles with multi-sided exposure
  let k_sh_effective = shadowFactor;
  const isSingleSide = ['1-side-left', '1-side-right', '1-side-bottom'].includes(exposureConfig);

  // Override k_sh for cases where shadowing doesn't apply
  if (isHollow || isSingleSide) {
    k_sh_effective = 1.0;
  }

  // Calculate effective Am/V with shadow factor
  const AmV_effective = k_sh_effective * AmV_base;

  return {
    AmV: AmV_effective,           // Effective Am/V with shadow factor (m⁻¹)
    AmV_base: AmV_base,           // Base Am/V without shadow factor (m⁻¹)
    Am: Am,                        // Exposed perimeter (mm)
    h_side: isIorH ? h_side : null,  // Side height for I/H (for reference)
    k_sh: k_sh_effective,         // Shadow factor actually applied
    description: description,
    exposureConfig: exposureConfig,
    profileType: profileType,
    shadowApplied: k_sh_effective !== 1.0,
    shadowNote: k_sh_effective !== shadowFactor
      ? `Shadow factor overridden to ${k_sh_effective} (${isHollow ? 'hollow section' : 'single-side exposure'})`
      : null
  };
}
```

### 7.3 Update Main Calculation Function

Modify `calculateBuckling()` to include Am/V check (around line 1480):

```javascript
function calculateBuckling(inputs) {
  try {
    // ... existing code ...

    // Get section properties
    const section = getSectionProperties(profileType, profileName);
    if (!section) {
      throw new Error('Section not found in database');
    }

    // NEW: Check Am/V if filtering is enabled
    let amvResult = null;
    if (inputs.amvFilterEnabled && fireEnabled) {
      const exposureConfig = inputs.exposureConfig || '4-sides';
      const shadowFactor = parseFloat(inputs.shadowFactor);
      const maxAmV = parseFloat(inputs.maxAmV) || 200;

      // Validate shadowFactor
      const validShadowFactor = !isNaN(shadowFactor) && shadowFactor >= 0 && shadowFactor <= 1.0
        ? shadowFactor
        : 0.9;  // Default to 0.9 if invalid

      amvResult = calculateSectionFactor(section, exposureConfig, profileType, validShadowFactor);

      // Check if calculation was successful
      if (amvResult.error) {
        return {
          success: false,
          error: `Am/V calculation error: ${amvResult.error}`,
          amvResult: amvResult
        };
      }

      // Check if section passes Am/V criterion (using effective Am/V)
      if (amvResult.AmV !== null && amvResult.AmV > maxAmV) {
        return {
          success: false,
          error: `Section exceeds maximum Am/V: ${amvResult.AmV.toFixed(1)} > ${maxAmV} m⁻¹`,
          amvResult: amvResult,
          amvExceeded: true
        };
      }
    }

    // ... rest of existing calculation code ...

    return {
      success: true,
      inputs: {
        // ... existing inputs ...
        amvFilterEnabled: inputs.amvFilterEnabled || false,
        exposureConfig: inputs.exposureConfig,
        shadowFactor: inputs.shadowFactor,
        maxAmV: inputs.maxAmV
      },
      ulsResults: {
        ...ulsResults,
        utilization: utilization_ULS
      },
      fireResults: fireResults,
      amvResult: amvResult  // Include Am/V calculation result
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 7.4 Update Find Lightest Section Function

Modify `findLightestSection()` to filter by Am/V (around line 1600):

```javascript
function findLightestSection(inputs, progressCallback) {
  try {
    // ... existing code ...

    let lastValidSection = null;
    let testedCount = 0;
    const totalCount = sortedProfiles.length;
    const skippedClass4 = [];
    const skippedAmV = [];  // NEW: Track Am/V rejections

    for (const profileName of sortedProfiles) {
      testedCount++;

      if (progressCallback) {
        progressCallback(testedCount, totalCount, profileName);
      }

      const testInputs = { ...inputs, profileName };
      const results = calculateBuckling(testInputs);

      // NEW: Handle Am/V rejection
      if (!results.success && results.amvExceeded) {
        skippedAmV.push({
          profileName: profileName,
          AmV_base: results.amvResult.AmV_base,
          AmV_effective: results.amvResult.AmV,
          k_sh: results.amvResult.k_sh,
          maxAmV: inputs.maxAmV,
          exposureConfig: results.amvResult.exposureConfig,
          reason: `Am/V too high: ${results.amvResult.AmV.toFixed(1)} > ${inputs.maxAmV} m⁻¹`
        });
        console.log(`  ⊗ Skipped ${profileName}: ${results.error}`);
        continue;
      }

      // Handle other failures (Class 4, etc.)
      if (!results.success) {
        if (results.classification && results.classification.is_class4) {
          const governingElement = results.classification.element_results.find(e => e.class === 4);
          skippedClass4.push({
            profileName: profileName,
            reason: 'Class 4 section (user chose to avoid)',
            governingElement: governingElement ? governingElement.id : 'unknown',
            classification: results.classification
          });
          console.log(`  ⊗ Skipped ${profileName}: Class 4 (${governingElement ? governingElement.id : 'unknown'}) - avoid mode`);
        } else {
          console.log(`  ⊗ Skipped ${profileName}: ${results.error}`);
        }
        continue;
      }

      // ... existing utilization check logic ...

      if (maxUtilization <= 1.0) {
        lastValidSection = {
          profileName: profileName,
          results: results,
          maxUtilization: maxUtilization,
          utilizationSource: utilizationSource
        };
        console.log(`  ✓ Valid (≤100%) - FOUND LIGHTEST CANDIDATE!`);
        break;
      } else {
        console.log(`  ✗ Too small (exceeds 100%) - continuing to next heavier section...`);
      }
    }

    // Check if we found a valid section
    if (!lastValidSection) {
      let errorMsg = 'No suitable section found in selected profile type.';

      // NEW: Enhanced error message including Am/V rejections
      if (skippedAmV.length > 0 && skippedClass4.length > 0) {
        errorMsg = `No suitable section found. ${skippedClass4.length} sections skipped (Class 4), ${skippedAmV.length} sections skipped (Am/V too high). Consider relaxing constraints.`;
      } else if (skippedAmV.length > 0) {
        errorMsg = `No suitable section found. ${skippedAmV.length} sections exceeded Am/V limit. Consider increasing maximum Am/V or changing exposure configuration.`;
      } else if (skippedClass4.length > 0 && skippedClass4.length === testedCount) {
        errorMsg = `All ${testedCount} sections are Class 4. Enable "Allow Class 4" to use effective properties.`;
      } else if (skippedClass4.length > 0) {
        errorMsg = `No suitable section found. ${skippedClass4.length} lighter sections were skipped (Class 4 - avoid mode).`;
      } else {
        errorMsg = 'No suitable section found. All sections exceed 100% utilization.';
      }

      return {
        success: false,
        error: errorMsg,
        testedCount: testedCount,
        totalCount: totalCount,
        skippedClass4: skippedClass4,
        skippedClass4Count: skippedClass4.length,
        skippedAmV: skippedAmV,
        skippedAmVCount: skippedAmV.length
      };
    }

    // Generate success message
    let message = '';
    const allValid = (testedCount - skippedClass4.length - skippedAmV.length) === 1 && lastValidSection;

    if (allValid) {
      message = 'Lightest section selected. ';
      if (skippedClass4.length > 0) message += `${skippedClass4.length} Class 4 sections skipped. `;
      if (skippedAmV.length > 0) message += `${skippedAmV.length} sections skipped (Am/V too high).`;
    } else {
      message = `Found optimal section after testing ${testedCount} profiles.`;
      if (skippedClass4.length > 0) message += ` (${skippedClass4.length} Class 4 skipped)`;
      if (skippedAmV.length > 0) message += ` (${skippedAmV.length} Am/V exceeded)`;
    }

    return {
      success: true,
      section: lastValidSection,
      testedCount: testedCount,
      totalCount: totalCount,
      skippedClass4: skippedClass4,
      skippedClass4Count: skippedClass4.length,
      skippedAmV: skippedAmV,
      skippedAmVCount: skippedAmV.length,
      allValid: allValid,
      message: message
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

---

## 8. Testing Requirements

### 8.1 Test Matrix

Create manual test cases for the following scenarios:

| Test ID | Profile Type | Profile Name | Exposure Config | k_sh | Expected Am (mm) | Expected Am/V_base (m⁻¹) | Expected Am/V_eff (m⁻¹) | Notes |
|---------|--------------|--------------|-----------------|------|------------------|--------------------------|------------------------|-------|
| **I-Section Tests (HEA)** |
| T1.1 | HEA | HEA200 | 4-sides | 0.9 | P = 902 | 167.6 | 150.8 | Reference case |
| T1.2 | HEA | HEA200 | 3-sides-top | 0.9 | P - b = 702 | 130.4 | 117.4 | Top non-exposed |
| T1.3 | HEA | HEA200 | 2-sides | 0.9 | 2×h_side = 808.0 | 150.1 | 135.1 | Webs only (h_side includes radii!) |
| T1.4 | HEA | HEA200 | 1-side-left | 1.0* | h_side = 404.0 | 75.0 | 75.0 | Single-side (k_sh→1.0) |
| T1.5 | HEA | HEA200 | 1-side-bottom | 1.0* | b = 200 | 37.1 | 37.1 | Single-side flange |
| T1.6 | HEA | HEA200 | 4-sides | 1.0 | P = 902 | 167.6 | 167.6 | User override k_sh=1.0 |
| **RHS Tests** |
| T2.1 | HRHS | HRHS 200x100 / 5 | 4-sides | 1.0 | P | Calculate | Calculate | Hollow section |
| T2.2 | HRHS | HRHS 200x100 / 5 | 3-sides-top | 1.0 | P - b | Calculate | Calculate | Top non-exposed |
| T2.3 | HRHS | HRHS 200x100 / 5 | 2-sides | 1.0 | 2×h | Calculate | Calculate | Webs only |
| T2.4 | HRHS | HRHS 200x100 / 5 | 4-sides | 0.9** | P | Calculate | Calculate | k_sh should be→1.0 |
| **Circular Tests (CHS)** |
| T3.1 | CCHS | CCHS 200 / 5 | 4-sides | 1.0 | P | Calculate | Calculate | Full perimeter |
| T3.2 | CCHS | CCHS 200 / 5 | 3-sides-top | 1.0 | P | Calculate | Calculate | Should use full P |
| T3.3 | CCHS | CCHS 200 / 5 | 2-sides | - | - | - | ERROR | Should return error |

**Notes:**
- `*` k_sh forced to 1.0 for single-sided exposure
- `**` k_sh forced to 1.0 for hollow sections (override user input)

### 8.2 Manual Calculation Examples

#### Example 1: HEA200, 4-sides, k_sh = 0.9

**Given data (from steel database):**
```
Profile: HEA200
h = 190 mm
b = 200 mm
tw = 6.5 mm
tf = 10 mm
r = 18 mm
P = 902 mm (perimeter)
A = 5383 mm² (area)
```

**Calculation:**
```
Exposure: 4-sides (all exposed)
Am = P = 902 mm

Am/V_base = (Am / A) × 1000
          = (902 mm / 5383 mm²) × 1000
          = 0.1676 × 1000
          = 167.6 m⁻¹

k_sh = 0.9 (I-section, multi-sided exposure)

Am/V_eff = k_sh × Am/V_base
         = 0.9 × 167.6
         = 150.8 m⁻¹
```

**Expected result:**
- Am = 902 mm ✓
- Am/V_base = 167.6 m⁻¹ ✓
- Am/V_eff = 150.8 m⁻¹ ✓

#### Example 2: HEA200, 3-sides-top, k_sh = 0.9

**Given:** Same HEA200

**Calculation:**
```
Exposure: 3-sides-top (top flange non-exposed)
Am = P - b = 902 - 200 = 702 mm

Am/V_base = (702 / 5383) × 1000
          = 130.4 m⁻¹

k_sh = 0.9

Am/V_eff = 0.9 × 130.4 = 117.4 m⁻¹
```

**Expected result:**
- Am = 702 mm ✓
- Am/V_base = 130.4 m⁻¹ ✓
- Am/V_eff = 117.4 m⁻¹ ✓

#### Example 3: HEA200, 2-sides (webs only), k_sh = 0.9

**Given:** Same HEA200

**Calculation:**
```
Exposure: 2-sides (webs only)

First, calculate side height (h_side) accounting for radii:
h_side = h + b - 2×r - tw + π×r
       = 190 + 200 - 2×18 - 6.5 + π×18
       = 190 + 200 - 36 - 6.5 + 56.55
       = 404.0 mm

Am = 2 × h_side = 2 × 404.0 = 808.0 mm

Am/V_base = (808.0 / 5383) × 1000
          = 150.1 m⁻¹

k_sh = 0.9 (I-section, multi-sided exposure)

Am/V_eff = 0.9 × 150.1 = 135.1 m⁻¹
```

**Expected result:**
- h_side = 404.0 mm ✓ (not just h = 190 mm!)
- Am = 808.0 mm ✓
- Am/V_base = 150.1 m⁻¹ ✓
- k_sh = 0.9 ✓
- Am/V_eff = 135.1 m⁻¹ ✓

**Important:** Notice that h_side (404 mm) is significantly larger than h (190 mm) due to the flange parts and radii!

#### Example 4: HEA200, 1-side-bottom, k_sh override

**Given:** Same HEA200

**Calculation:**
```
Exposure: 1-side-bottom (bottom flange only)
Am = b = 200 mm

Am/V_base = (200 / 5383) × 1000
          = 37.1 m⁻¹

k_sh = 1.0 (forced for single-sided, even if user set 0.9)

Am/V_eff = 1.0 × 37.1 = 37.1 m⁻¹
```

**Expected result:**
- Am = 200 mm ✓
- Am/V_base = 37.1 m⁻¹ ✓
- k_sh = 1.0 (overridden) ✓
- Am/V_eff = 37.1 m⁻¹ ✓
- Shadow note: "Shadow factor overridden to 1.0 (single-side exposure)"

#### Example 5: HRHS 200x100 / 5, 4-sides, k_sh input ignored

**Given data (need to verify from database):**
```
Profile: HRHS 200x100 / 5
h = 200 mm
b = 100 mm
t = 5 mm
P = ??? (need to check - might be in meters!)
A = ??? mm²
```

**Calculation:**
```
Exposure: 4-sides
Am = P (full perimeter)

User input k_sh = 0.9
Override to k_sh = 1.0 (hollow section)

Am/V_base = (Am / A) × 1000
Am/V_eff = 1.0 × Am/V_base  (k_sh forced to 1.0)
```

**Expected behavior:**
- k_sh = 1.0 (overridden) ✓
- Shadow note: "Shadow factor overridden to 1.0 (hollow section)" ✓

### 8.3 Test File Structure

Create `testing/test_amv_calculations.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Am/V Calculation Tests - Flexural Buckling</title>
  <link rel="stylesheet" href="../../../assets/css/common.css">
  <link rel="stylesheet" href="../../../assets/css/forms.css">
  <script src="../flexural_buckling_api.js"></script>
</head>
<body class="bg-gray-900 text-gray-100">
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Am/V Calculation Tests</h1>

    <!-- Manual Test Input -->
    <div class="bg-gray-800 p-4 rounded mb-4">
      <h2 class="text-lg font-semibold mb-3">Manual Test Case</h2>
      <div class="grid grid-cols-2 gap-3">
        <input id="test-profile-type" placeholder="Profile type (e.g., hea)" class="form-input">
        <input id="test-h" type="number" placeholder="h (mm)" class="form-input">
        <input id="test-b" type="number" placeholder="b (mm)" class="form-input">
        <input id="test-P" type="number" placeholder="P (mm)" class="form-input">
        <input id="test-A" type="number" placeholder="A (mm²)" class="form-input">
        <select id="test-exposure" class="form-input">
          <option value="4-sides">4 sides</option>
          <option value="3-sides-top">3 sides - top</option>
          <option value="2-sides">2 sides</option>
          <option value="1-side-bottom">1 side - bottom</option>
        </select>
        <input id="test-ksh" type="number" step="0.05" value="0.9" placeholder="k_sh" class="form-input">
        <button onclick="runManualTest()" class="bg-cyan-600 text-white px-4 py-2 rounded">Calculate</button>
      </div>

      <!-- Results Display -->
      <div id="manual-results" class="mt-4 hidden">
        <h3 class="font-semibold mb-2">Results:</h3>
        <pre id="results-output" class="bg-gray-900 p-3 rounded text-xs"></pre>
      </div>
    </div>

    <!-- Automated Tests -->
    <div class="bg-gray-800 p-4 rounded">
      <h2 class="text-lg font-semibold mb-3">Automated Test Suite</h2>
      <button onclick="runAllTests()" class="bg-green-600 text-white px-4 py-2 rounded mb-3">Run All Tests</button>
      <div id="test-results"></div>
    </div>
  </div>

  <script>
    // Test implementation
    function runManualTest() {
      // Get inputs
      const section = {
        h: parseFloat(document.getElementById('test-h').value),
        b: parseFloat(document.getElementById('test-b').value),
        P: parseFloat(document.getElementById('test-P').value),
        A: parseFloat(document.getElementById('test-A').value)
      };
      const profileType = document.getElementById('test-profile-type').value;
      const exposureConfig = document.getElementById('test-exposure').value;
      const ksh = parseFloat(document.getElementById('test-ksh').value);

      // Calculate
      const result = calculateSectionFactor(section, exposureConfig, profileType, ksh);

      // Display
      document.getElementById('manual-results').classList.remove('hidden');
      document.getElementById('results-output').textContent = JSON.stringify(result, null, 2);
    }

    function runAllTests() {
      // Implement automated test suite
      const testCases = [
        // Add test cases from test matrix
      ];

      // Run tests and display results
      // TODO: Implement
    }
  </script>
</body>
</html>
```

### 8.4 Verification Checklist

For each test case, verify:
- [ ] Am calculation matches expected value
- [ ] Am/V_base calculation is correct
- [ ] k_sh is applied correctly (or overridden when needed)
- [ ] Am/V_eff matches expected value
- [ ] Error messages for invalid configurations (circular + 2-sided)
- [ ] Shadow notes displayed when k_sh is overridden

---

## 9. Report Generation

### 9.1 Add Am/V Section to Report

Update `flexural_buckling_ui.js` report generation function:

```javascript
function generateDetailedReport(result) {
  let reportHTML = '';

  // ... existing report sections ...

  // NEW: Add Am/V section (only if fire design and Am/V enabled)
  if (result.inputs.fireEnabled && result.inputs.amvFilterEnabled && result.amvResult) {
    const amv = result.amvResult;

    reportHTML += `
      <div class="mb-4 page-break-avoid">
        <h3 class="text-base font-semibold text-blue-800 mb-2">Section Factor (Am/V)</h3>
        <p class="text-sm mb-2">
          The section factor (Am/V) represents the ratio of exposed perimeter to cross-sectional area.
          Higher Am/V values indicate sections that heat faster and require more fire insulation.
        </p>

        <table class="w-full text-sm mb-2 border-collapse">
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Exposure configuration:</strong></td>
            <td class="border border-gray-300 px-2 py-1">${amv.description}</td>
          </tr>
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Exposed perimeter (Am):</strong></td>
            <td class="border border-gray-300 px-2 py-1">${amv.Am.toFixed(1)} mm</td>
          </tr>
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Cross-sectional area (A):</strong></td>
            <td class="border border-gray-300 px-2 py-1">${result.inputs.section.A.toFixed(1)} mm²</td>
          </tr>
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Base section factor (Am/V):</strong></td>
            <td class="border border-gray-300 px-2 py-1">${amv.AmV_base.toFixed(1)} m⁻¹</td>
          </tr>
          ${amv.shadowApplied ? `
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Shadow factor (k<sub>sh</sub>):</strong></td>
            <td class="border border-gray-300 px-2 py-1">${amv.k_sh.toFixed(2)} (I/H profile correction)</td>
          </tr>
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Effective section factor:</strong></td>
            <td class="border border-gray-300 px-2 py-1"><strong>${amv.AmV.toFixed(1)} m⁻¹</strong></td>
          </tr>
          ` : `
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Effective section factor:</strong></td>
            <td class="border border-gray-300 px-2 py-1"><strong>${amv.AmV.toFixed(1)} m⁻¹</strong> (no shadowing correction)</td>
          </tr>
          `}
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Maximum allowed (Am/V)<sub>max</sub>:</strong></td>
            <td class="border border-gray-300 px-2 py-1">${result.inputs.maxAmV.toFixed(1)} m⁻¹</td>
          </tr>
          <tr>
            <td class="border border-gray-300 px-2 py-1 bg-gray-50"><strong>Status:</strong></td>
            <td class="border border-gray-300 px-2 py-1 ${amv.AmV <= result.inputs.maxAmV ? 'text-green-700' : 'text-red-700'}">
              ${amv.AmV <= result.inputs.maxAmV ? '✓ Within limit' : '✗ Exceeds limit'}
            </td>
          </tr>
        </table>

        ${amv.shadowApplied ? `
        <p class="text-xs text-gray-600 italic">
          Formula: Am/V<sub>eff</sub> = k<sub>sh</sub> × Am/V<sub>base</sub>
          = ${amv.k_sh.toFixed(2)} × ${amv.AmV_base.toFixed(1)}
          = ${amv.AmV.toFixed(1)} m⁻¹
        </p>
        ` : ''}

        ${amv.shadowNote ? `
        <p class="text-xs text-orange-600 mt-2">
          <strong>Note:</strong> ${amv.shadowNote}
        </p>
        ` : ''}
      </div>
    `;
  }

  // ... rest of report ...

  return reportHTML;
}
```

### 9.2 Print CSS Considerations

Ensure Am/V section is properly styled for printing:
- Use page-break-avoid class to keep section together
- Print border colors correctly
- Ensure formula subscripts render properly

---

## 10. Implementation Checklist

### Phase 1: Core Calculation (Priority 1)
- [ ] Add `calculateSectionFactor()` function to `flexural_buckling_api.js`
- [ ] Implement shadow parameter (k_sh) logic
- [ ] Add automatic k_sh override for hollow sections and single-sided exposure
- [ ] Add module configuration inputs (amvFilterEnabled, exposureConfig, shadowFactor, maxAmV)
- [ ] Update `calculateBuckling()` to check Am/V
- [ ] Add Am/V result to return object with all fields (AmV, AmV_base, Am, k_sh, shadowApplied)

### Phase 2: UI Implementation (Priority 1)
- [ ] Add Am/V filter toggle to `index.html`
- [ ] Add exposure configuration dropdown
- [ ] Add shadow factor (k_sh) input field with tooltip
- [ ] Add maximum Am/V input field
- [ ] Add calculated Am/V display section (base, effective, k_sh, status)
- [ ] Implement toggle event listener (show/hide Am/V inputs)
- [ ] Implement profile type change listener (auto-update k_sh)
- [ ] Implement exposure config change listener (update k_sh hint)
- [ ] Disable incompatible exposure configs for circular sections
- [ ] Update form submission to include Am/V parameters

### Phase 3: Find Lightest Section Integration (Priority 2)
- [ ] Update `findLightestSection()` to filter by Am/V (effective value)
- [ ] Track Am/V rejections separately from Class 4
- [ ] Update progress messages to include Am/V rejections
- [ ] Update error messages for Am/V-related failures
- [ ] Update success messages to include Am/V rejection count

### Phase 4: Testing (Priority 2)
- [ ] Verify perimeter units in hollow section database (might be in meters!)
- [ ] Create `testing/test_amv_calculations.html` test file
- [ ] Implement manual test interface
- [ ] Add HEA200 test cases (4-sides, 3-sides-top, 2-sides, 1-side-bottom)
- [ ] Add HRHS test cases (all exposure configs)
- [ ] Add CCHS test cases (verify error handling)
- [ ] Test k_sh override for single-sided exposure (I-section)
- [ ] Test k_sh override for hollow sections (user input ignored)
- [ ] Verify all calculations match manual calculations
- [ ] Test edge cases (invalid inputs, missing parameters)

### Phase 5: Report Generation (Priority 3)
- [ ] Add Am/V section to detailed calculation report
- [ ] Display base and effective Am/V values
- [ ] Show k_sh and shadow application status
- [ ] Include formula display when k_sh ≠ 1.0
- [ ] Add shadow override notes when applicable
- [ ] Ensure proper print CSS styling for Am/V section
- [ ] Test report printing with various configurations

### Phase 6: Documentation & Polish (Priority 3)
- [ ] Add tooltip/help icon for "Section Factor (Am/V)" explaining:
  - What Am/V represents
  - Why it matters for fire insulation
  - Typical values (100-300 m⁻¹)
  - How to choose exposure configuration
- [ ] Add tooltip for k_sh explaining shadowing effect
- [ ] Update module README/documentation
- [ ] Add comments to all new functions
- [ ] Verify all error messages are user-friendly
- [ ] Add visual diagram for exposure configurations (optional - future)

---

## 11. Future Enhancements

### 11.1 Visual Enhancements
1. **Exposure Configuration Diagram**
   - SVG diagram showing exposed sides based on selection
   - Highlight exposed surfaces in red, non-exposed in gray
   - Update dynamically when user changes exposure config

2. **Am/V Chart**
   - Plot Am/V vs section size for selected profile family
   - Show how Am/V changes across profile range
   - Indicate maximum Am/V threshold line

### 11.2 Advanced Features
1. **Insulation Thickness Calculator**
   - Input: Fire rating (R30, R60, R90, R120)
   - Input: Insulation material properties
   - Output: Required insulation thickness based on Am/V
   - Integration with fire insulation product databases

2. **Multi-Span Column Optimization**
   - Different exposure configs for different column heights
   - Bottom floors: 4-sided (parking), upper floors: 3-sided (concrete slab)
   - Optimize section selection based on multiple fire scenarios

3. **Fire Rating Prediction**
   - Given section and insulation thickness, predict fire rating
   - Show safety margin (e.g., "R65 achieved with R60 insulation")

4. **Batch Analysis**
   - Upload multiple column configurations
   - Run Am/V analysis for entire building
   - Generate summary report with insulation quantities

### 11.3 Integration Ideas
1. **Link to Conlit/Fire Insulation Calculators**
   - Export section data to Conlit format
   - Pre-fill fire calculator with section parameters

2. **Cost Optimization**
   - Include insulation cost data
   - Optimize for: steel cost + insulation cost
   - Show cost comparison for different exposure configs

---

## 12. Key Design Decisions - Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **k_sh default (I/H)** | 0.9 | Standard fire engineering practice for I/H profiles |
| **k_sh default (Hollow)** | 1.0 | No shadowing effect in hollow sections |
| **k_sh override** | Automatic | Force k_sh=1.0 for single-sided and hollow (user cannot override) |
| **Am/V filter placement** | Inside fire design section | Only relevant when fire design enabled |
| **Am/V units** | m⁻¹ | Standard fire engineering convention |
| **Circular section handling** | Disable incompatible configs | Prevent user errors, show warnings |
| **Default exposure** | 4-sides | Most conservative case |
| **Default max Am/V** | 200 m⁻¹ | Typical practical limit for standard insulation |
| **Integration with Find Lightest** | Check Am/V after Class 4 | Lighter sections often have higher Am/V |
| **Display in results** | Show both base and effective | Transparency on shadow factor impact |
| **Error handling** | Graceful degradation | Continue calculation even if Am/V fails |

---

## 13. Notes for Implementation

### Critical Items
1. **Verify perimeter units in database** - Some hollow sections may have P in meters instead of mm
2. **Test k_sh override logic thoroughly** - Ensure it cannot be bypassed by user
3. **Validate all exposure configs** - Circular sections must error on incompatible configs

### Performance Considerations
- Am/V calculation is lightweight (< 1ms per section)
- No impact on Find Lightest Section search performance
- Consider caching Am/V results if recalculating frequently

### User Experience
- Clear indication when k_sh is overridden (show "Shadow factor adjusted..." message)
- Show both base and effective Am/V for transparency
- Use color coding: green (within limit), red (exceeds limit)
- Provide helpful error messages for invalid configurations

---

## Appendix A: Reference Formulas

### A.1 Section Factor Calculation

**Base formula:**
```
Am/V = (Exposed perimeter per unit length) / (Cross-sectional area)
     = Am / A

Unit conversion:
Am (mm) / A (mm²) × 1000 → Am/V (m⁻¹)
```

**With shadow parameter:**
```
Am/V_effective = k_sh × Am/V_base

Where k_sh = 0.9 for I/H profiles (standard)
      k_sh = 1.0 for hollow sections or single-sided exposure
```

### A.2 Exposed Perimeter by Configuration

| Configuration | Am Formula | Description |
|---------------|------------|-------------|
| 4-sides | `Am = P` | Full perimeter |
| 3-sides-top | `Am = P - b` | Perimeter minus top flange width |
| 3-sides-bottom | `Am = P - b` | Perimeter minus bottom flange width |
| 2-sides | `Am = 2 × h` | Two web heights |
| 1-side-left | `Am = h` | Single web height |
| 1-side-right | `Am = h` | Single web height |
| 1-side-bottom | `Am = b` | Bottom flange width |

### A.3 Shadow Parameter Reference

**EN 1993-1-2 (Eurocode 3 Part 1-2):**
- Clause 4.2.5.1: Shadow effect for steel profiles
- k_sh = 0.9 for open sections (I, H)
- k_sh = 1.0 for hollow sections

**ECCS Technical Note 89 (Fire Design of Steel Structures):**
- Recommends k_sh = 0.9 for I/H sections
- Based on experimental data and thermal analysis

---

## Appendix B: Database Schema Notes

### Expected Parameters

All profiles should contain:
```javascript
{
  "profile": "HEA200",
  "h": 190,        // Height (mm)
  "b": 200,        // Width (mm)
  "P": 902,        // Perimeter (mm) ⚠️ Verify units for hollow sections!
  "A": 5383,       // Area (mm²)
  // ... other properties
}
```

**Warning:** Initial inspection suggests hollow section database may have perimeter in **meters** instead of mm. This needs verification and potential correction.

---

## Document Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-04 | Initial plan without shadow parameter | Claude |
| 2.0 | 2026-03-04 | Added shadow parameter (k_sh) implementation | Claude |

---

**End of Implementation Plan**
