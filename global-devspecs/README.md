# Global Development Specifications

This folder contains planning documents and specifications for implementing features across multiple calculator modules.

## 📋 Contents

### Master Planning Documents

1. **[detailed-report-implementation-plan.md](./detailed-report-implementation-plan.md)**
   - Complete overview of all modules
   - Implementation priority order (Phase 1, 2, 3)
   - Technical requirements for each module
   - Standardized color scheme and layouts
   - Current status tracking

2. **[simple-print-implementation-plan.md](./simple-print-implementation-plan.md)**
   - Guidelines for modules using simple print (print-as-is from browser)
   - When to use detailed report vs simple print
   - Testing requirements
   - CSS requirements for clean browser printing

### Individual Module Specifications

#### Phase 1 - High Priority ✓ (All specs created)
- **[concrete_beam_design-report-spec.md](./concrete_beam_design-report-spec.md)** - Beam ULS design with moment/shear capacity
- **[weld_capacity-report-spec.md](./weld_capacity-report-spec.md)** - Weld capacity with von Mises stress analysis
- **[THP-report-spec.md](./THP-report-spec.md)** - Two-sided hat profile with EC3 classification
- **[concrete_base_plate_compressive_design-report-spec.md](./concrete_base_plate_compressive_design-report-spec.md)** - Base plate compressive design

#### Phase 2 - Medium Priority ✓ (All specs created)
- **[concrete_minimum_reinforcement-report-spec.md](./concrete_minimum_reinforcement-report-spec.md)** - Minimum reinforcement checks (plates/beams/columns)
- **[concrete_plate_CFRP-report-spec.md](./concrete_plate_CFRP-report-spec.md)** - CFRP strengthening analysis
- **[steel_beam_relative_design-report-spec.md](./steel_beam_relative_design-report-spec.md)** - Steel profile comparison (IPE/HEA/HEB)
- **[transversal_forces_stiffened_web-report-spec.md](./transversal_forces_stiffened_web-report-spec.md)** - Stiffened web design (EC3-1-5)
- **[transversal_forces_unstiffened_web-report-spec.md](./transversal_forces_unstiffened_web-report-spec.md)** - Unstiffened web design (EC3-1-5)

---

## 🎯 Standard Report Structure

All detailed reports follow this consistent structure:

1. **Calculation Description** (optional user input)
2. **Title & Timestamp**
3. **INPUT PARAMETERS** (blue heading, 2-column grid)
4. **PLOT** (yellow heading, if applicable)
5. **RESULTS SUMMARY** (green heading, utilizations in 3-column grid)
6. **DETAILED CALCULATIONS** (purple heading, page break, all intermediate steps)

---

## 🎨 Color Scheme

Consistent across all reports:

| Section | Color | Hex Code |
|---------|-------|----------|
| INPUT PARAMETERS | Blue | #1d4ed8 |
| PLOT | Yellow | #a16207 |
| RESULTS SUMMARY | Green | #15803d |
| DETAILED CALCULATIONS | Purple | #6b21a8 |
| Body Text (Print) | Gray-800 | #1f2937 |
| Background (Print) | White | #ffffff |

### Utilization Color Coding
- **Green** (≤85%): `text-green-900` (#14532d)
- **Yellow** (85-100%): `text-yellow-900` (#713f12)
- **Red** (>100%): `text-red-900` (#7f1d1d)

---

## 📐 Layout Standards

### Grid Layouts
- **Input Parameters**: 2-column grid (`grid-cols-2`)
- **Utilizations**: 3-column grid (`grid-cols-3`)
- **Detailed Calculations**: Single column with subsection boxes

### Print Settings
- **Page Size**: A4
- **Margins**: 25mm (top, right, bottom), 31.7mm (left) + 15mm padding
- **Font Size**: 11pt body, 10pt small text
- **Line Height**: 1.5

---

## ✅ Implementation Checklist

For each module implementing a detailed report:

### HTML Changes
- [ ] Add calculation description textarea
- [ ] Add report container div with toggle/print buttons
- [ ] Add `report-print.css` link

### JavaScript Changes
- [ ] Implement `generateDetailedReport()` function
- [ ] Implement `toggleReport()` function
- [ ] Implement `printReport()` function
- [ ] Capture plot/visualization (if applicable)
- [ ] Call report generation after calculations

### Testing
- [ ] Verify report structure matches spec
- [ ] Test print output (white background, black text)
- [ ] Verify no frames/borders in print
- [ ] Test multi-page printing
- [ ] Check all utilization color coding
- [ ] Verify page breaks work correctly

---

## 📊 Implementation Status

### ✅ Completed (3 modules)
1. concrete_anchorage_length
2. concrete_slab_design
3. concrete_dowels

### 🔄 In Progress (0 modules)
None currently

### 📋 Planned - Phase 1 (4 modules)
1. concrete_beam_design
2. weld_capacity
3. THP
4. concrete_base_plate_compressive_design

### 📋 Planned - Phase 2 (5 modules)
5. concrete_minimum_reinforcement
6. concrete_plate_CFRP
7. steel_beam_relative_design
8. transversal_forces_stiffened_web
9. transversal_forces_unstiffened_web

### 📋 Simple Print Only (1 module)
10. DIN_rod_torque

---

## 🔧 Technical Resources

### CSS Files
- **`assets/css/report-print.css`** - Detailed report print styling (hides everything except #detailed-report)
- **`assets/css/print.css`** - Simple print styling (prints full page as-is)
- **`assets/css/common.css`** - Common styling across all modules
- **`assets/css/forms.css`** - Form input styling
- **`assets/css/components.css`** - Reusable components

### JavaScript Utilities
```javascript
// Number formatting
function toFixedIfNeeded(value, decimals) {
  return Number(value.toFixed(decimals));
}

// Utilization color coding
function getUtilizationColor(utilization) {
  if (utilization <= 85) return 'text-green-900';
  if (utilization <= 100) return 'text-yellow-900';
  return 'text-red-900';
}

// Print trigger
function printReport() {
  window.print();
}
```

---

## 📝 Creating New Module Specs

When creating a spec for a new module:

1. Copy the template from `concrete_beam_design-report-spec.md` or `weld_capacity-report-spec.md`
2. Update module overview (name, purpose, priority)
3. Define all input parameters (organize into logical groups)
4. Specify plot/visualization requirements
5. List all utilization checks
6. Detail all calculation steps
7. Create testing checklist

---

## 🚀 Quick Start for Developers

1. Read `detailed-report-implementation-plan.md` for overview
2. Find your module's priority phase
3. Read the module-specific spec (e.g., `concrete_beam_design-report-spec.md`)
4. Follow the implementation checklist
5. Test thoroughly using the testing checklist
6. Update implementation status in this README

---

## 📞 Questions or Issues?

If you encounter issues or need clarification:
1. Check the master planning documents first
2. Review an existing implementation (e.g., `concrete_dowels`)
3. Verify your CSS links are correct
4. Test print preview frequently during development
