# Class 4 Plate Reduction Factor (ρ) Reporting - Implementation Plan

## Problem Statement

When sections are classified as Class 4, users need to understand:
1. **Which plate elements are actually reduced** (ρ < 1.0)
2. **Why some Class 4 sections show minimal area reduction** (when most plates have ρ = 1.0)
3. **The calculation details for each plate element**

### Key Insight
A section can be **Class 4 overall** while having **some or all individual plates fully effective (ρ = 1.0)**:
- Classification uses EN 1993-1-1 Table 5.2 (conservative class limits)
- Effective width uses EN 1993-1-5 (more refined ρ calculation based on plate slenderness λ_p)
- A plate classified as Class 4 may still have ρ = 1.0 if λ_p ≤ λ_p_limit

**Example:**
- Web: c/t = 45 → Class 4 (exceeds Class 3 limit), λ_p = 0.75, ρ = 0.95 (5% reduction)
- Flanges: c/t = 12 → Class 4 (exceeds Class 3 limit), λ_p = 0.65, ρ = 1.0 (fully effective)
- **Result**: Section is Class 4, but flanges are fully effective

---

## Current State Analysis

### ρ Calculation (Already Implemented ✓)

**Location**: `flexural_buckling_api.js`, lines 939-1138
**Function**: `calculateClass4EffectiveProperties()`

**What's calculated per plate element:**
```javascript
plateReductions.push({
  element: element.id,        // "web", "top_flange", "bottom_flange"
  type: elementType,          // "internal", "outstand", "circular"
  c_gross: element.c,         // Gross plate width (mm)
  c_eff: c_eff,              // Effective width = ρ × c_gross (mm)
  rho: rho,                  // ⭐ Reduction factor (0 to 1.0)
  psi: psi,                  // Stress ratio (1.0 for compression)
  k_sigma: k_sigma,          // Buckling coefficient EN 1993-1-5
  lambda_p: lambda_p,        // Plate slenderness
  epsilon: epsilon,          // Material factor √(235/fy)
  strips_removed: strips.length
});
```

**Stored in**: `results.ulsResults.effective_properties.plate_reductions`
**Stored in (fire)**: `results.fireResults.effective_properties.plate_reductions`

### Current Display (Missing ✗)

**UI Display** (`flexural_buckling_ui.js`, lines 741-780):
- Shows effective area, moments of inertia, neutral axis shifts
- Shows overall area reduction percentage
- ❌ **Does NOT show per-plate ρ values**

**Report** (`flexural_buckling_ui.js`, lines 960-1000):
- Shows gross vs effective properties
- ❌ **Does NOT show per-plate breakdown**

**Classification Table** (`flexural_buckling_ui.js`, lines 710-729):
- Shows element ID, c/t, class limits
- ❌ **Does NOT show ρ values**

---

## Implementation Plan

### Phase 1: Add ρ Column to Classification Table (UI)

**Goal**: Show ρ values directly in the existing element classification table

**Location**: `flexural_buckling_ui.js`, function `displayElementClassification()`

**Current table columns:**
| Element | c (mm) | t (mm) | c/t | Class 3 Limit | Class |
|---------|--------|--------|-----|---------------|-------|

**New table columns:**
| Element | c (mm) | t (mm) | c/t | Class 3 Limit | Class | λ_p | ρ | c_eff (mm) |
|---------|--------|--------|-----|---------------|-------|-----|---|------------|

**Changes needed:**

1. **Modify table header** (around line 712):
```javascript
html += '<thead class="bg-gray-100">';
html += '<tr>';
html += '<th class="px-4 py-2 text-left">Element</th>';
html += '<th class="px-4 py-2 text-right">c (mm)</th>';
html += '<th class="px-4 py-2 text-right">t (mm)</th>';
html += '<th class="px-4 py-2 text-right">c/t</th>';
html += '<th class="px-4 py-2 text-right">Class 3 Limit</th>';
html += '<th class="px-4 py-2 text-center">Class</th>';
// NEW COLUMNS:
html += '<th class="px-4 py-2 text-right" title="Plate slenderness (EN 1993-1-5)">λ_p</th>';
html += '<th class="px-4 py-2 text-right" title="Reduction factor (EN 1993-1-5)">ρ</th>';
html += '<th class="px-4 py-2 text-right" title="Effective width after reduction">c_eff (mm)</th>';
html += '</tr>';
html += '</thead>';
```

2. **Pass effective properties to the function**:
```javascript
// Current signature:
function displayElementClassification(classification, inputs) { ... }

// New signature:
function displayElementClassification(classification, inputs, effectiveProps) { ... }
```

3. **Match elements to ρ data** (inside loop over `classification.element_results`):
```javascript
for (const elem of classification.element_results) {
  // Find corresponding plate reduction data
  let plateData = null;
  if (effectiveProps && effectiveProps.plate_reductions) {
    plateData = effectiveProps.plate_reductions.find(pr => pr.element === elem.id);
  }

  // Build row
  html += '<tr>';
  html += `<td>${elem.id}</td>`;
  html += `<td>${elem.c.toFixed(1)}</td>`;
  html += `<td>${elem.t.toFixed(1)}</td>`;
  html += `<td>${elem.slenderness.toFixed(1)}</td>`;
  html += `<td>${elem.class3_limit.toFixed(1)}</td>`;
  html += `<td class="${getClassColor(elem.class)}">${elem.class}</td>`;

  // NEW: Show λ_p, ρ, c_eff
  if (plateData) {
    html += `<td>${plateData.lambda_p.toFixed(2)}</td>`;

    // Color code ρ: green if 1.0, yellow if 0.9-0.99, orange if < 0.9
    const rhoClass = plateData.rho === 1.0 ? 'text-green-600'
                   : plateData.rho >= 0.9 ? 'text-yellow-600'
                   : 'text-orange-600';
    html += `<td class="${rhoClass} font-semibold">${plateData.rho.toFixed(3)}</td>`;

    html += `<td>${plateData.c_eff.toFixed(1)}</td>`;
  } else {
    // Non-Class 4 elements: no reduction data
    html += '<td>-</td><td>1.000</td><td>-</td>';
  }

  html += '</tr>';
}
```

4. **Update caller in `displayResults()`** (around line 450):
```javascript
// OLD:
displayElementClassification(results.ulsResults.classification, inputs);

// NEW:
const effProps = results.ulsResults.is_using_effective
  ? results.ulsResults.effective_properties
  : null;
displayElementClassification(results.ulsResults.classification, inputs, effProps);
```

---

### Phase 2: Add Detailed ρ Explanation Section (UI)

**Goal**: Add a new collapsible section explaining ρ calculation methodology

**Location**: After element classification table, before effective properties section

**New HTML structure:**
```html
<div id="rho-explanation-container" class="hidden">
  <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
    <h4 class="font-semibold mb-2">
      📐 Plate Reduction Factor (ρ) - EN 1993-1-5
    </h4>
    <p class="text-sm mb-3">
      Class 4 sections use EN 1993-1-5 to calculate <strong>effective widths</strong>
      for slender plate elements. Each plate gets a reduction factor ρ (0 to 1.0):
    </p>
    <ul class="text-sm list-disc ml-5 space-y-1">
      <li><strong>ρ = 1.0</strong>: Plate is fully effective (no reduction needed)</li>
      <li><strong>ρ < 1.0</strong>: Plate is reduced, c_eff = ρ × c_gross</li>
    </ul>

    <div class="mt-3 text-sm">
      <strong>Why can ρ = 1.0 for Class 4 elements?</strong>
      <p class="mt-1">
        EN 1993-1-1 Table 5.2 (classification) is conservative. EN 1993-1-5 uses
        refined plate slenderness λ_p with buckling coefficient k_σ. If λ_p is below
        the limit, the plate is fully effective even if classified as Class 4.
      </p>
    </div>

    <div class="mt-3 text-xs text-gray-600">
      <strong>Formulas:</strong><br>
      Internal elements: ρ = (λ_p - 0.055ψ) / λ_p² ≤ 1.0, limit = 0.5 + √(0.085 - 0.055ψ)<br>
      Outstand elements: ρ = (λ_p - 0.188) / λ_p² ≤ 1.0, limit = 0.748<br>
      λ_p = (c/t) / (28.4ε√k_σ), where ε = √(235/f_y)
    </div>
  </div>
</div>
```

**Display logic** (add to `displayElementClassification()`):
```javascript
// Show explanation box only if Class 4
const rhoExplanation = document.getElementById('rho-explanation-container');
if (classification.is_class4) {
  rhoExplanation.classList.remove('hidden');
} else {
  rhoExplanation.classList.add('hidden');
}
```

---

### Phase 3: Add ρ Details to Detailed Report

**Goal**: Include plate reduction breakdown in the detailed calculation report

**Location**: `flexural_buckling_ui.js`, function `generateDetailedReport()`

**Insert after Class 4 effective properties section** (after line 1000):

```javascript
// If Class 4, add plate reduction details
if (results.ulsResults.is_using_effective && results.ulsResults.effective_properties.plate_reductions) {
  const plateReductions = results.ulsResults.effective_properties.plate_reductions;

  html += '<div class="mb-8">';
  html += '<h3 class="font-semibold text-gray-800 mb-3">Plate Reduction Factors (ρ) - EN 1993-1-5</h3>';

  // Summary explanation
  html += '<p class="text-sm text-gray-600 mb-4">';
  html += 'Each Class 4 plate element is evaluated for effective width using EN 1993-1-5. ';
  html += 'The reduction factor ρ determines how much of the gross width is effective in resisting compression.';
  html += '</p>';

  // Table of plate reductions
  html += '<table class="w-full border-collapse border border-gray-300 text-sm">';
  html += '<thead class="bg-gray-100">';
  html += '<tr>';
  html += '<th class="border border-gray-300 px-3 py-2">Element</th>';
  html += '<th class="border border-gray-300 px-3 py-2">Type</th>';
  html += '<th class="border border-gray-300 px-3 py-2">c/t</th>';
  html += '<th class="border border-gray-300 px-3 py-2">k_σ</th>';
  html += '<th class="border border-gray-300 px-3 py-2">λ_p</th>';
  html += '<th class="border border-gray-300 px-3 py-2 font-bold">ρ</th>';
  html += '<th class="border border-gray-300 px-3 py-2">c_gross (mm)</th>';
  html += '<th class="border border-gray-300 px-3 py-2">c_eff (mm)</th>';
  html += '<th class="border border-gray-300 px-3 py-2">Reduction</th>';
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';

  for (const plate of plateReductions) {
    const reduction_pct = ((1 - plate.rho) * 100).toFixed(1);
    const rhoColor = plate.rho === 1.0 ? 'color: green; font-weight: bold;'
                   : plate.rho >= 0.9 ? 'color: orange;'
                   : 'color: red; font-weight: bold;';

    html += '<tr>';
    html += `<td class="border border-gray-300 px-3 py-2">${plate.element}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${plate.type}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${(plate.c_gross / (plate.c_gross / plate.c_eff * plate.rho)).toFixed(1)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${plate.k_sigma.toFixed(2)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${plate.lambda_p.toFixed(3)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2" style="${rhoColor}">${plate.rho.toFixed(3)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${plate.c_gross.toFixed(1)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${plate.c_eff.toFixed(1)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2">${reduction_pct}%</td>`;
    html += '</tr>';
  }

  html += '</tbody>';
  html += '</table>';

  // Add interpretation notes
  html += '<div class="mt-3 text-xs text-gray-600">';
  html += '<strong>Interpretation:</strong><br>';
  html += '• ρ = 1.000 (green): Plate is fully effective, no reduction needed<br>';
  html += '• ρ = 0.900-0.999 (orange): Minor reduction (< 10%)<br>';
  html += '• ρ < 0.900 (red): Significant reduction (≥ 10%)';
  html += '</div>';

  html += '</div>';
}
```

---

### Phase 4: Fire Design Temperature ρ Reporting

**Goal**: Show ρ values for fire design (elevated temperature) if Class 4

**Key difference**: Fire design uses reduced f_y (effective yield strength at elevated temp)
- Lower f_y → Higher ε = √(235/f_y) → Higher λ_p → Potentially lower ρ
- User needs to see if plates become more slender at elevated temperature

**Implementation**: Similar to Phase 1-3, but:
1. Check `results.fireResults.is_using_effective`
2. Access `results.fireResults.effective_properties.plate_reductions`
3. Add separate fire design ρ table in report
4. Highlight if fire ρ differs from ULS ρ

**Location**: Add after fire design results section in report

```javascript
// Fire design plate reductions (if Class 4 at elevated temperature)
if (results.fireResults && results.fireResults.is_using_effective
    && results.fireResults.effective_properties.plate_reductions) {

  const fireReductions = results.fireResults.effective_properties.plate_reductions;

  html += '<div class="mb-8">';
  html += '<h3 class="font-semibold text-gray-800 mb-3">Fire Design: Plate Reduction Factors (ρ) at Elevated Temperature</h3>';

  html += '<p class="text-sm text-gray-600 mb-4">';
  html += `At steel temperature θ = ${inputs.steelTemp.toFixed(0)}°C, the reduced yield strength `;
  html += `affects plate slenderness. This may result in different ρ values compared to ULS.`;
  html += '</p>';

  // Similar table as Phase 3, but for fire reductions
  // ... (same table structure)

  html += '</div>';
}
```

---

## Summary of Changes

### Files to Modify

| File | Function/Section | Changes | Lines (approx) |
|------|------------------|---------|----------------|
| `flexural_buckling_ui.js` | `displayElementClassification()` | Add ρ, λ_p, c_eff columns | 710-729 |
| `flexural_buckling_ui.js` | `displayResults()` | Pass effective properties to classification display | ~450 |
| `index.html` | Classification table section | Update table headers and layout | 690-730 |
| `index.html` | After classification table | Add ρ explanation section (new div) | ~735 (new) |
| `flexural_buckling_ui.js` | `generateDetailedReport()` | Add plate reduction table for ULS | ~1000 (insert) |
| `flexural_buckling_ui.js` | `generateDetailedReport()` | Add plate reduction table for fire | ~1050 (insert) |

### New HTML Elements

1. **Classification table**: 3 new columns (λ_p, ρ, c_eff)
2. **Explanation box**: Collapsible info section about ρ methodology
3. **Report table (ULS)**: Detailed breakdown of all plate ρ values
4. **Report table (Fire)**: Same for fire design if applicable

---

## Testing Plan

### Test Case 1: All Plates Fully Effective (ρ = 1.0)
- Profile: HEA200, f_y = 355 MPa, L = 3000 mm
- Expected: Class 4 classification, but all ρ = 1.0
- Verify: Table shows green ρ = 1.000 for all elements

### Test Case 2: Mixed Reductions
- Profile: HEA600 (very slender web), f_y = 235 MPa, L = 8000 mm
- Expected: Web ρ < 1.0, flanges ρ = 1.0
- Verify: Different ρ values shown, color-coded correctly

### Test Case 3: Fire Design Increases Slenderness
- Profile: HEA300, f_y = 355 MPa, θ = 600°C
- Expected: ULS ρ = 1.0, Fire ρ < 1.0 (due to reduced f_y,θ)
- Verify: Fire report shows lower ρ than ULS report

### Test Case 4: Non-Class 4 Section
- Profile: HEA100, f_y = 355 MPa, L = 2000 mm
- Expected: Class 1/2/3, no effective properties
- Verify: ρ columns show "-" or "N/A", explanation box hidden

---

## Implementation Order

1. ✅ **Phase 1**: Add ρ column to classification table (highest value, visible immediately)
2. ✅ **Phase 2**: Add explanation section (helps users understand ρ)
3. ✅ **Phase 3**: Add ULS ρ details to report (comprehensive documentation)
4. ✅ **Phase 4**: Add fire design ρ reporting (complete feature)

---

## Expected User Benefit

**Before implementation:**
- User sees "Class 4" and expects significant area reduction
- Sees only 2% area reduction → confused why so little
- No visibility into which plates are actually reduced

**After implementation:**
- User sees ρ = 1.0 for flanges, ρ = 0.95 for web
- Understands that only web is slightly reduced
- Report documents exact calculation per plate
- Can verify EN 1993-1-5 methodology is correctly applied

---

## References

- **EN 1993-1-1**: Section classification (Table 5.2)
- **EN 1993-1-5**: Plate buckling, effective widths, ρ calculation (Section 4.4)
- Current implementation: `flexural_buckling_api.js`, lines 939-1138
