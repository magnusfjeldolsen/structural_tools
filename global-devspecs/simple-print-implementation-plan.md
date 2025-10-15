# Simple Print Implementation Plan

This document outlines the plan for modules that DON'T need a detailed report, but should still print cleanly as they appear in the browser.

---

## Modules Using Simple Print (Print As-Is from Browser)

These modules have simpler calculations or different purposes that don't require a structured detailed report. Instead, they should print exactly as they appear in the browser with clean formatting.

### 1. DIN_rod_torque
- **Reason**: Simple torque-force conversion calculator
- **Print Approach**: Print the current on-screen layout as-is
- **What to Print**:
  - Rod selection and properties
  - Input values (torque OR force)
  - Calculated output
  - Simple formula display
- **Print Styling**: Use existing `print.css` to ensure clean output

---

## Simple Print CSS Requirements

For modules without detailed reports, we need to ensure the existing `print.css` works correctly:

### Current `assets/css/print.css` Handles:

1. **Page Setup**
   - A4 page size
   - Standard margins
   - Remove browser headers/footers

2. **Hide Interactive Elements**
   ```css
   button, input[type="submit"], .no-print {
     display: none !important;
   }
   ```

3. **Force Light Theme**
   ```css
   body {
     background: white !important;
     color: black !important;
   }
   ```

4. **Text Colors**
   - Override dark mode colors
   - Ensure black text on white background
   - Keep semantic colors (green for OK, red for warnings)

5. **Layout**
   - Full width usage
   - Remove unnecessary padding
   - Proper page breaks

---

## Implementation Checklist for Simple Print Modules

For each module using simple print:

### ✓ Already Included in HTML
- `<link rel="stylesheet" href="../assets/css/print.css">`

### ✓ Test Print Output
1. Open module in browser
2. Press Ctrl+P (or Cmd+P)
3. Verify:
   - Clean white background
   - Black text (readable)
   - No UI elements (buttons, inputs should be hidden or styled appropriately)
   - Content fits on page
   - Colors preserved where needed (status indicators)

### ✓ Optional: Add Print Button
If useful, add a print button to the module:
```html
<button onclick="window.print()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg print:hidden">
  🖨️ Print
</button>
```

### ✓ Module-Specific Print Adjustments

If needed, create a module-specific print CSS file (e.g., `DIN_rod_torque/print.css`):

```css
@media print {
  /* Module-specific print adjustments */

  /* Example: Hide specific sections */
  .no-print-section {
    display: none !important;
  }

  /* Example: Adjust specific layouts */
  .results-grid {
    grid-template-columns: 1fr 1fr !important;
  }
}
```

---

## Testing Requirements

For each module with simple print:

1. **Visual Check**
   - Print preview shows clean layout
   - No cut-off content
   - Readable font sizes

2. **Color Check**
   - Text is black or appropriately colored
   - Background is white
   - No dark mode artifacts

3. **Content Check**
   - All relevant information is visible
   - Buttons and form inputs are hidden or styled appropriately
   - Footer/header info is appropriate

4. **Multi-Page Check**
   - If content spans multiple pages, check page breaks
   - No awkward splits in important sections

---

## Difference: Detailed Report vs Simple Print

### Detailed Report Approach
- **Use Case**: Complex calculators with multiple steps, utilizations, and detailed derivations
- **Structure**: Standardized format (Description → Inputs → Plot → Results → Detailed Calculations)
- **Print Trigger**: Dedicated "Print Report" button that prints ONLY the report section
- **CSS**: Uses `report-print.css` to hide everything except `#detailed-report`
- **Examples**: concrete_dowels, concrete_slab_design, concrete_anchorage_length

### Simple Print Approach
- **Use Case**: Simple calculators, lookup tools, or modules with straightforward outputs
- **Structure**: Prints the entire page as shown in browser
- **Print Trigger**: Browser print (Ctrl+P) or optional "Print" button that calls `window.print()`
- **CSS**: Uses `print.css` to style the full page for printing
- **Examples**: DIN_rod_torque

---

## When to Use Which Approach?

### Use Detailed Report When:
- Calculator has multiple calculation steps
- Multiple utilization checks (≥2)
- Complex formulas needing explanation
- Professional report required for documentation
- Results need to be formally presented to clients/authorities

### Use Simple Print When:
- Single-purpose calculator (one input → one output)
- Lookup or reference tool
- Simple conversion calculator
- Interactive comparison tool (where the interaction is the main feature)
- Quick reference that doesn't need formal documentation

---

## Current Assessment

### Modules Using Simple Print:
1. **DIN_rod_torque** ✓
   - Simple torque-force conversion
   - One input type, one output
   - Formula is straightforward

### Modules Needing Detailed Report:
All others listed in `detailed-report-implementation-plan.md`
