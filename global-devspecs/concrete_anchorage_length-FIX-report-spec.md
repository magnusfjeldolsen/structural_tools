# Concrete Anchorage Length - Report Fix Specification

## Problem

The detailed report for concrete_anchorage_length **exists but prints as empty PDF**.

### Root Cause Analysis

1. **Report exists in HTML** - The `generateDetailedReport()` function creates report HTML
2. **Structure doesn't match print CSS** - The report uses old structure that `report-print.css` doesn't recognize
3. **Missing key wrapper classes** - Report content isn't wrapped in the correct divs expected by print CSS

**Current structure (BROKEN):**
```html
<div class="report-content bg-white text-gray-900 p-8 rounded-lg">
  <!-- Content here -->
</div>
```

**Required structure (WORKING - as in concrete_dowels):**
```html
<div class="report-content bg-white text-gray-900 p-8 rounded-lg">
  [Description]
  [Title]
  <div class="mb-6">
    <h3 class="text-xl font-bold text-blue-700 ...">INPUT PARAMETERS</h3>
    <div class="grid grid-cols-2 gap-4 text-sm">...</div>
  </div>
  <!-- PLOT section (N/A for this calculator) -->
  <div class="mb-6">
    <h3 class="text-xl font-bold text-green-700 ...">RESULTS SUMMARY</h3>
    ...
  </div>
  <div class="page-break-before">
    <h3 class="text-xl font-bold text-purple-700 ...">DETAILED CALCULATIONS</h3>
    ...
  </div>
</div>
```

---

## Implementation Plan

### Step 1: Review Current Implementation ✓

**File**: `concrete_anchorage_length/script.js` (lines 311-493)

Current report has:
- ✓ Description section
- ✓ Title & timestamp
- ✓ INPUT PARAMETERS (but uses tables instead of consistent format)
- ✗ No PLOT section (not needed for this calculator)
- ✓ CALCULATION RESULTS section (but should be "RESULTS SUMMARY")
- ✓ DETAILED CALCULATION STEPS (with page-break-before)

**Issues:**
1. Uses HTML `<table>` elements instead of plain `<p>` tags with grid layout
2. Text color uses `text-gray-700` instead of `text-gray-800`
3. Section heading "CALCULATION RESULTS" should be "RESULTS SUMMARY"
4. Results summary doesn't have large result box for main value (lbd)
5. No utilization checks (this calculator doesn't have utilizations, but should show key verification)
6. Tables won't print cleanly - need to convert to paragraph text

### Step 2: Restructure Report to Match Standard

#### Changes Required:

**A. INPUT PARAMETERS Section**

Replace tables with paragraph format:

**Current:**
```html
<table class="w-full text-sm">
  <tr><td class="py-1 font-medium">S<sub>Ed</sub></td><td class="py-1">${inputs.SEd} kN</td>...
```

**New:**
```html
<div class="grid grid-cols-2 gap-4 text-sm">
  <div>
    <h4 class="font-semibold text-gray-800 mb-2">Basic Parameters</h4>
    <p class="text-gray-800">S<sub>Ed</sub> = ${inputs.SEd} kN</p>
    <p class="text-gray-800">φ<sub>l</sub> = ${inputs.phi_l} mm</p>
    <p class="text-gray-800">n<sub>l</sub> = ${inputs.n_l}</p>
    <p class="text-gray-800">φ<sub>t</sub> = ${inputs.phi_t} mm</p>
    <p class="text-gray-800">n<sub>l,orth</sub> = ${inputs.n_l_orthogonal}</p>
  </div>
  <div>
    <h4 class="font-semibold text-gray-800 mb-2">Material Properties</h4>
    <p class="text-gray-800">f<sub>ck</sub> = ${inputs.fck} MPa</p>
    <p class="text-gray-800">γ<sub>c</sub> = ${inputs.gamma_c}</p>
    ...
  </div>
</div>
```

**B. RESULTS SUMMARY Section**

Add large result box + key results in grid:

```html
<div class="mb-6">
  <h3 class="text-xl font-bold text-green-700 mb-3 border-b-2 border-green-300 pb-1">RESULTS SUMMARY</h3>

  <!-- Large result box -->
  <div class="bg-blue-50 p-4 mb-4">
    <div class="text-3xl font-bold text-blue-900">l<sub>bd</sub> = ${results.lbd.toFixed(1)} mm</div>
    <div class="text-sm text-blue-700 mt-1">Design Anchorage Length (EC2 8.4)</div>
  </div>

  <!-- Key results in grid (3 columns) -->
  <div class="grid grid-cols-3 gap-4 text-sm">
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-1">Bond Strength</h4>
      <p class="text-gray-800">f<sub>bd</sub> = ${results.fbd.toFixed(3)} MPa</p>
    </div>
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-1">Basic Length</h4>
      <p class="text-gray-800">l<sub>b,rqd</sub> = ${results.lb_rqd.toFixed(2)} mm</p>
    </div>
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-1">Alpha Total</h4>
      <p class="text-gray-800">α<sub>total</sub> = ${results.alpha_total.toFixed(4)}</p>
    </div>
  </div>

  <!-- Constraint check -->
  <div class="mt-3 p-3 ${results.product_ok ? 'bg-green-50' : 'bg-red-50'}">
    <p class="text-gray-800 font-semibold">
      α<sub>2</sub>×α<sub>3</sub>×α<sub>5</sub> = ${results.alpha_product.toFixed(3)}
      ${results.product_ok ? '✓ ≥ 0.7 (OK)' : '✗ < 0.7 (NOT OK)'}
    </p>
  </div>
</div>
```

**C. DETAILED CALCULATIONS Section**

Split into subsections with bg-gray-50 boxes:

```html
<div class="page-break-before">
  <h3 class="text-xl font-bold text-purple-700 mb-4 border-b-2 border-purple-300 pb-1">DETAILED CALCULATIONS</h3>

  <div class="space-y-4 text-sm">
    <!-- Bond Strength -->
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-2">8.4.2 Bond Strength</h4>
      <p class="text-gray-800">η<sub>1</sub> = ${results.eta_1.toFixed(2)} (bond condition factor)</p>
      <p class="text-gray-800">η<sub>2</sub> = ${results.eta_2.toFixed(3)} (bar diameter factor)</p>
      <p class="text-gray-800">f<sub>ctk,0.05</sub> = ${results.fctk_005.toFixed(2)} MPa</p>
      <p class="text-gray-800">f<sub>ctd</sub> = ${results.fctd.toFixed(3)} MPa</p>
      <p class="text-gray-800 font-semibold">f<sub>bd</sub> = ${results.fbd.toFixed(3)} MPa</p>
    </div>

    <!-- Basic Anchorage Length -->
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-2">8.4.3 Basic Anchorage Length</h4>
      <p class="text-gray-800">σ<sub>sd</sub> = ${results.sigma_sd.toFixed(2)} MPa</p>
      <p class="text-gray-800">φ<sub>l</sub> = ${inputs.phi_l} mm</p>
      <p class="text-gray-800">f<sub>bd</sub> = ${results.fbd.toFixed(3)} MPa</p>
      <p class="text-gray-800 font-semibold">l<sub>b,rqd</sub> = (φ/4) × (σ<sub>sd</sub>/f<sub>bd</sub>) = ${results.lb_rqd.toFixed(2)} mm</p>
    </div>

    <!-- Alpha Factors -->
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-2">8.4.4 Design Anchorage Length - Alpha Factors</h4>
      <p class="text-gray-800">α<sub>1</sub> = ${results.alpha_1.toFixed(3)} (bar shape factor)</p>
      <p class="text-gray-800">α<sub>2</sub> = ${results.alpha_2.toFixed(3)} (cover factor)</p>
      <p class="text-gray-800">α<sub>3</sub> = ${results.alpha_3.toFixed(3)} (transverse reinforcement factor)</p>
      <p class="text-gray-800">α<sub>4</sub> = ${results.alpha_4.toFixed(3)} (welded reinforcement factor)</p>
      <p class="text-gray-800">α<sub>5</sub> = ${results.alpha_5.toFixed(3)} (transverse pressure factor)</p>
      <p class="text-gray-800 font-semibold">α<sub>total</sub> = α<sub>1</sub>×α<sub>2</sub>×α<sub>3</sub>×α<sub>4</sub>×α<sub>5</sub> = ${results.alpha_total.toFixed(4)}</p>
    </div>

    <!-- Final Design Length -->
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-2">Final Design Anchorage Length</h4>
      <p class="text-gray-800">l<sub>bd</sub> (calculated) = α<sub>total</sub> × l<sub>b,rqd</sub></p>
      <p class="text-gray-800">l<sub>bd</sub> (calculated) = ${results.alpha_total.toFixed(4)} × ${results.lb_rqd.toFixed(2)} = ${(results.alpha_total * results.lb_rqd).toFixed(2)} mm</p>
      <p class="text-gray-800">l<sub>b,min</sub> = ${results.lb_min.toFixed(2)} mm</p>
      <p class="text-gray-800 font-semibold text-lg">l<sub>bd</sub> = max(l<sub>bd,calc</sub>, l<sub>b,min</sub>) = ${results.lbd.toFixed(1)} mm</p>
    </div>

    <!-- Calculation Steps (optional - can keep or remove) -->
    <div class="bg-gray-50 p-3 rounded">
      <h4 class="font-semibold text-gray-800 mb-2">Detailed Step-by-Step Calculations</h4>
      <div class="font-mono text-xs space-y-1">
        ${results.steps.map(step => `<p class="text-gray-800">${step}</p>`).join('')}
      </div>
    </div>
  </div>
</div>
```

**D. Fix Text Colors**

Replace ALL instances of:
- `text-gray-700` → `text-gray-800`
- `text-gray-600` → `text-gray-800` (for descriptions)
- Ensure all `<p>` tags have `text-gray-800` class

**E. Remove Rounded Corners and Padding from Main Container**

The outer `.report-content` should not have:
- ~~`rounded-lg`~~ → remove
- ~~`p-8`~~ → remove (print CSS will handle padding)

---

### Step 3: Test Print Output

After implementing changes:

1. Open concrete_anchorage_length in browser
2. Enter values and calculate
3. Expand "Detailed Calculation Report"
4. Click "Print Report" or Ctrl+P
5. Verify:
   - ✓ Only report content appears (no UI elements)
   - ✓ White background, black text
   - ✓ No borders/frames/boxes visible
   - ✓ Content flows across full page width
   - ✓ Page break before DETAILED CALCULATIONS
   - ✓ All text is readable (no white-on-white)

---

## Implementation Checklist

- [ ] Read current `script.js` file (lines 311-493)
- [ ] Replace table-based INPUT PARAMETERS with paragraph grid
- [ ] Rename "CALCULATION RESULTS" to "RESULTS SUMMARY"
- [ ] Add large result box for lbd at top of RESULTS SUMMARY
- [ ] Convert results tables to 3-column grid with bg-gray-50 boxes
- [ ] Restructure DETAILED CALCULATIONS into subsections
- [ ] Replace all `text-gray-700` with `text-gray-800`
- [ ] Remove `rounded-lg` and `p-8` from outer `.report-content`
- [ ] Test print output
- [ ] Verify PDF is not empty
- [ ] Verify no white text on white background
- [ ] Verify page breaks work
- [ ] Verify no frames/borders print

---

## Expected Result

After implementation:
- ✅ Print works correctly (PDF not empty)
- ✅ Report structure matches concrete_dowels standard
- ✅ All text is black (`text-gray-800`)
- ✅ White background for print
- ✅ No tables in report (only paragraph text)
- ✅ Subsections use `bg-gray-50` boxes but NO BORDERS print
- ✅ Page break before DETAILED CALCULATIONS
- ✅ Results summary has large result box + 3-column grid

---

## Files to Modify

1. **`concrete_anchorage_length/script.js`** - Lines 311-493 (generateDetailedReport function)

---

## Code Template

Complete revised `generateDetailedReport()` function available upon request for implementation.

---

## Notes

- This calculator doesn't have a plot/visualization - skip PLOT section
- This calculator doesn't have utilizations (%) - use verification checks instead
- Keep the detailed step-by-step calculations at bottom (formatted in mono font)
- The constraint check (α₂×α₃×α₅ ≥ 0.7) is important - highlight it
- All EC2 section references (8.4.2, 8.4.3, 8.4.4) should be preserved

---

## Success Criteria

✅ User can:
1. Calculate anchorage length
2. Expand detailed report
3. Click "Print Report"
4. Get a readable PDF with:
   - White background
   - Black text throughout
   - Professional layout
   - Proper page breaks
   - All calculation details visible
