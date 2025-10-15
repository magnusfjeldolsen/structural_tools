# Detailed Report Implementation Plan

This document outlines the plan for implementing detailed calculation reports across all calculator modules.

## Report Structure Standard

All detailed reports follow this consistent structure:

1. **Calculation Description** (optional - user input)
2. **Title & Timestamp**
3. **INPUT PARAMETERS** (2-column grid layout)
4. **PLOT** (if applicable - visualization of the problem)
5. **RESULTS SUMMARY** (3-column grid for utilizations, large result box for main capacity)
6. **DETAILED CALCULATIONS** (page break - all intermediate steps)

## Modules Already Implemented ✓

### 1. concrete_anchorage_length ✓
- **Status**: Has detailed report
- **Structure**: Description → Inputs → Results → Detailed Calculations
- **Plot**: No plot currently
- **Action**: None needed (already complete)

### 2. concrete_slab_design ✓
- **Status**: Has detailed report
- **Structure**: Description → Inputs → Plot → Results → Detailed Calculations
- **Plot**: Yes (strain/stress diagram)
- **Action**: None needed (already complete)

### 3. concrete_dowels ✓
- **Status**: Has detailed report (just implemented)
- **Structure**: Description → Inputs → Plot → Results → Detailed Calculations
- **Plot**: Yes (dowel geometry visualization)
- **Action**: None needed (already complete)

---

## Modules Requiring Implementation

### 4. concrete_base_plate_compressive_design
- **Current State**: Has detailed calculations on-screen, NO detailed report
- **Input Categories**:
  - Plate Geometry (dimensions)
  - Material Properties (concrete, steel)
  - Loading (applied force)
- **Plot**: Could add base plate geometry visualization
- **Utilizations**:
  - Concrete bearing stress utilization
  - Plate bending utilization
- **Detailed Calculations**: Already visible on screen, needs to be formatted into report
- **Priority**: HIGH (structural capacity calculation)

### 5. concrete_beam_design
- **Current State**: Has detailed calculations on-screen, NO detailed report
- **Input Categories**:
  - Geometry (width, height, cover)
  - Material Properties (concrete, steel)
  - Reinforcement (area, position)
  - Loading (moment, shear)
- **Plot**: Could add beam cross-section with reinforcement
- **Utilizations**:
  - Moment capacity utilization
  - Shear capacity utilization
- **Detailed Calculations**: Already visible on screen
- **Priority**: HIGH (commonly used calculator)

### 6. concrete_minimum_reinforcement
- **Current State**: Has detailed calculations, NO detailed report
- **Input Categories**:
  - Element Type (plate/beam/column)
  - Geometry parameters
  - Material properties
  - Scenario-based inputs
- **Plot**: No plot needed
- **Utilizations**:
  - Minimum reinforcement compliance (%)
  - Spacing compliance
- **Detailed Calculations**: Already on screen
- **Priority**: MEDIUM

### 7. concrete_plate_CFRP
- **Current State**: Has calculations and charts, NO detailed report
- **Input Categories**:
  - Plate geometry
  - CFRP properties
  - Loading conditions
- **Plot**: Has Chart.js visualization (needs SVG capture for print)
- **Utilizations**:
  - Strengthening effectiveness
  - Capacity increase (%)
- **Detailed Calculations**: Visible on screen
- **Priority**: MEDIUM

### 8. DIN_rod_torque
- **Current State**: Simple calculator, NO detailed report
- **Input Categories**:
  - Rod selection (DIN type)
  - Torque or Force input
- **Plot**: No plot
- **Utilizations**: None (direct calculation)
- **Detailed Calculations**: Simple torque-force relationship
- **Priority**: LOW (simple calculation, may not need detailed report)

### 9. steel_beam_relative_deisgn
- **Current State**: Profile comparison tool, NO detailed report
- **Input Categories**:
  - Steel profile selection (IPE, HEA, HEB)
  - Loading requirements
- **Plot**: No plot currently
- **Utilizations**:
  - Multiple profile utilizations compared
- **Detailed Calculations**: Comparison calculations
- **Priority**: MEDIUM

### 10. THP (Two-Sided Hat Profile)
- **Current State**: Complex calculator, NO detailed report
- **Input Categories**:
  - Profile geometry
  - Material properties
  - Loading conditions
- **Plot**: Could add cross-section visualization
- **Utilizations**:
  - Cross-section classification
  - Various capacity utilizations
- **Detailed Calculations**: EC3 classification checks
- **Priority**: HIGH (complex structural calculation)

### 11. transversal_forces_stiffened_web
- **Current State**: Has detailed calculations, NO detailed report
- **Input Categories**:
  - Web geometry
  - Stiffener properties
  - Loading
- **Plot**: Could add web visualization
- **Utilizations**:
  - Capacity utilization
  - Slenderness check
- **Detailed Calculations**: Already on screen
- **Priority**: MEDIUM

### 12. transversal_forces_unstiffened_web
- **Current State**: Has detailed calculations, NO detailed report
- **Input Categories**:
  - Web geometry
  - Material properties
  - Loading
- **Plot**: Could add web visualization
- **Utilizations**:
  - Capacity utilization (EC3-1-5)
- **Detailed Calculations**: Already on screen
- **Priority**: MEDIUM

### 13. weld_capacity
- **Current State**: Has comprehensive calculations, NO detailed report
- **Input Categories**:
  - Weld geometry (length, throat)
  - Material properties
  - Loading (N, V, M combinations)
- **Plot**: Could add weld stress distribution
- **Utilizations**:
  - Von Mises stress utilization
  - Individual stress component utilizations
- **Detailed Calculations**: Already on screen
- **Priority**: HIGH (commonly used, complex calculations)

---

## Implementation Priority Order

### Phase 1 - High Priority (Core Structural Calculators)
1. **concrete_beam_design** - Common use, multiple utilizations
2. **weld_capacity** - Common use, von Mises stress analysis
3. **THP** - Complex EC3 calculations
4. **concrete_base_plate_compressive_design** - Foundation design

### Phase 2 - Medium Priority
5. **concrete_minimum_reinforcement** - Compliance checks
6. **concrete_plate_CFRP** - Strengthening analysis
7. **steel_beam_relative_deisgn** - Profile comparison
8. **transversal_forces_stiffened_web** - Web design
9. **transversal_forces_unstiffened_web** - Web design

### Phase 3 - Low Priority (Simple Calculators)
10. **DIN_rod_torque** - Simple calculation (may use simplified print instead)

---

## Technical Requirements

### For Each Module Implementation:

1. **Add Description Field**
   - Textarea input for calculation description
   - Optional field
   - Appears at top of report

2. **Create `generateDetailedReport()` Function**
   - Gather all inputs
   - Capture plot/visualization (if exists)
   - Format all calculations
   - Generate HTML report structure

3. **Add Report Container to HTML**
   ```html
   <div class="bg-gray-700 rounded-lg p-6 mt-6">
     <div class="flex justify-between items-center mb-3">
       <h3 class="text-lg font-semibold text-white cursor-pointer" onclick="toggleReport()">
         ▼ Detailed Calculation Report
       </h3>
       <button type="button" onclick="printReport()" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg transition print:hidden">
         🖨️ Print Report
       </button>
     </div>
     <div id="detailed-report" class="hidden mt-4">
       <!-- Report content will be generated here -->
     </div>
   </div>
   ```

4. **Add Report Print CSS Link**
   ```html
   <link rel="stylesheet" href="../assets/css/report-print.css">
   ```

5. **Implement Helper Functions**
   - `toggleReport()` - Show/hide report
   - `printReport()` - Trigger browser print dialog
   - `toFixedIfNeeded(value, decimals)` - Format numbers

6. **Call Report Generation**
   - Call `generateDetailedReport()` after calculations complete
   - Populate `#detailed-report` container

---

## Color Scheme (Consistent Across All Reports)

- **Blue** (#1d4ed8) - INPUT PARAMETERS heading
- **Yellow** (#a16207) - PLOT heading
- **Green** (#15803d) - RESULTS SUMMARY heading
- **Purple** (#6b21a8) - DETAILED CALCULATIONS heading
- **Gray-800** (#1f2937) - All body text for print
- **White** - Background for print

---

## Grid Layouts

- **Input Parameters**: 2-column grid (`grid-cols-2`)
- **Utilizations**: 3-column grid (`grid-cols-3`)
- **Detailed Calculations**: Single column, boxes with subsections
