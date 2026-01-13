# Pry-Out Shear Stud Analyzer - Web UI Implementation Plan

## Project Overview

Convert the Python-based EC2-1-4 pry-out resistance calculator (`pryout4.py`) into a modern web application with interactive stud placement, force application, and results visualization.

**Priority**: Standalone module (no build process required)
**Target**: Plain HTML + JavaScript + Canvas/SVG visualization
**Standard**: Eurocode 2-1-4 (Pry-out resistance of shear stud groups)

---

## Core Functionality from pryout4.py

### Classes to Implement in JavaScript

1. **Stud** - Individual stud with position and force components
   - Properties: `x`, `y`, `Vx`, `Vy`, `Vres`

2. **StudGroup** - Collection of studs with elastic distribution
   - Calculate centroid
   - Calculate polar moment of inertia
   - Distribute forces (direct shear + torsional shear)
   - Methods: `centroid()`, `polarMoment()`, `applyActions()`

3. **PryOutEC2** - Eurocode 2-1-4 resistance calculations
   - Calculate psi factors (edge, spacing, group)
   - Calculate characteristic cone resistance
   - Calculate design pry-out resistance per stud
   - Properties: `fck`, `hef`, `d`, `edge_dist`, `spacing`, `gamma_Mc`, `k_cp`

4. **PryOutCalculator** - High-level interface
   - Combines StudGroup + PryOutEC2
   - Returns results array with utilization per stud

### Load Cases Feature

- Users can create multiple load cases (Dead, Live, Wind, etc.)
- Each load case has: `name`, `Vx`, `Vy`, `Mz`, `apply_at_centroid`, `Px`, `Py`
- Load combinations will be added in future phase
- Results displayed per load case or as envelope (max/min per stud)

---

## User Interface Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  TITLE: EC2-1-4 Pry-Out Shear Stud Analyzer            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  LEFT PANEL (40%)                                       │
│  ┌───────────────────────────────────────────────┐     │
│  │ MATERIAL PROPERTIES                           │     │
│  │ - Concrete strength (fck)                     │     │
│  │ - Effective embedment depth (hef)             │     │
│  │ - Stud diameter (d)                           │     │
│  │ - Edge distance                               │     │
│  │ - Stud spacing                                │     │
│  │ - Partial factor (γ_Mc)                       │     │
│  │ - k_cp factor                                 │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  ┌───────────────────────────────────────────────┐     │
│  │ STUDS                                         │     │
│  │ [+ Add Stud]                                  │     │
│  │                                               │     │
│  │ Table:                                        │     │
│  │ | # | X (mm) | Y (mm) | Actions |            │     │
│  │ |---|--------|--------|---------|            │     │
│  │ | 1 |  90    |  420   | [Del]   |            │     │
│  │ | 2 |  90    | 1710   | [Del]   |            │     │
│  │ ...                                           │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  ┌───────────────────────────────────────────────┐     │
│  │ LOAD CASES                                    │     │
│  │ Active: [Dead Load ▼] [+ Add] [Edit] [Del]   │     │
│  │                                               │     │
│  │ Force Application:                            │     │
│  │ ○ At centroid                                 │     │
│  │ ○ At point: Px [___] Py [___]                │     │
│  │                                               │     │
│  │ Vx (kN): [___]                                │     │
│  │ Vy (kN): [___]                                │     │
│  │ Mz (kNm): [___]                               │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  [Calculate]                                            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  RIGHT PANEL (60%)                                      │
│  ┌───────────────────────────────────────────────┐     │
│  │ [Model] [Results] [Envelope]                  │     │
│  │                                               │     │
│  │  CANVAS / SVG PLOT                            │     │
│  │                                               │     │
│  │  - Model view: Studs, centroid, edges        │     │
│  │  - Results view: Force vectors, utilization  │     │
│  │  - Envelope view: Max forces across cases    │     │
│  │                                               │     │
│  │                                               │     │
│  │                                               │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  ┌───────────────────────────────────────────────┐     │
│  │ RESULTS TABLE                                 │     │
│  │                                               │     │
│  │ Load Case: [Dead Load ▼] or [Envelope ▼]     │     │
│  │                                               │     │
│  │ | Stud | Vx    | Vy    | Vres  | V_Rd  | η%  |│     │
│  │ |------|-------|-------|-------|-------|-----|│     │
│  │ |  1   | -6.25 | -6.25 | 8.84  | 50.2  | 17.6|│     │
│  │ |  2   | -6.25 | -6.25 | 8.84  | 50.2  | 17.6|│     │
│  │ ...                                           │     │
│  │                                               │     │
│  │ Max utilization: 85.3% at Stud 4 (LC: Wind)  │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Tab Navigation

Three tabs for visualization switching:
1. **Model** - Geometry only (studs, edges, centroid, axes)
2. **Results** - Current load case with force vectors
3. **Envelope** - Max/min forces across all load cases

---

## Technical Implementation

### File Structure

```
pryout/
├── index.html           # Main HTML with UI structure
├── script.js            # Main logic (StudGroup, PryOutEC2, UI handlers)
├── visualization.js     # Canvas/SVG drawing functions
└── IMPLEMENTATION_PLAN.md  # This file
```

### Key Technologies

- **HTML5 Canvas** or **SVG** for visualization (recommend Canvas for performance)
- **Vanilla JavaScript** (no frameworks - keep it simple)
- **CSS Grid/Flexbox** for responsive layout
- **TailwindCSS** (via CDN) for consistent styling with other modules

### Data Structures

```javascript
// Global state
const state = {
  // Material properties
  material: {
    fck: 30,          // MPa
    hef: 100,         // mm
    d: 19,            // mm
    edge_dist: 100,   // mm
    spacing: 120,     // mm
    gamma_Mc: 1.5,    // -
    k_cp: 1.0         // -
  },

  // Studs array
  studs: [
    { id: 1, x: 90, y: 420 },
    { id: 2, x: 90, y: 1710 },
    // ... more studs
  ],

  // Load cases array
  loadCases: [
    {
      id: 1,
      name: 'Dead Load',
      Vx: -50,
      Vy: -50,
      Mz: 0,
      apply_at_centroid: true,
      Px: 0,
      Py: 0
    },
    // ... more load cases
  ],

  // Active load case ID
  activeLoadCaseId: 1,

  // Results per load case
  results: {
    1: [  // load case ID
      {
        stud: 1,
        x_mm: 90,
        y_mm: 420,
        Vx_kN: -6.25,
        Vy_kN: -6.25,
        Vres_kN: 8.84,
        V_Rd_cp_kN: 50.2,
        utilization: 0.176
      },
      // ... more stud results
    ]
  },

  // Envelope results (max/min across all cases)
  envelope: {
    max: [/* stud results with max forces */],
    min: [/* stud results with min forces */],
    criticalCase: [/* which case governs for each stud */]
  },

  // UI state
  ui: {
    activeTab: 'model',  // 'model' | 'results' | 'envelope'
    viewResultsFor: 'active'  // 'active' | 'envelope'
  }
};
```

### Core Functions to Implement

#### Stud Management
```javascript
function addStud(x, y)
function removeStud(id)
function updateStud(id, x, y)
function getStuds()
function clearStuds()
```

#### Load Case Management
```javascript
function addLoadCase(name, Vx, Vy, Mz, applyAtCentroid, Px, Py)
function removeLoadCase(id)
function updateLoadCase(id, props)
function setActiveLoadCase(id)
function getActiveLoadCase()
```

#### Calculations
```javascript
function calculateCentroid(studs)
function calculatePolarMoment(studs, Xc, Yc)
function applyActions(studs, Vx, Vy, Mz, applyAtCentroid, Px, Py, Xc, Yc)
function calculatePryoutResistance(fck, hef, d, edge_dist, spacing, n)
function runAnalysis()  // Main calculation for active load case
function runAllLoadCases()  // Calculate all load cases
function calculateEnvelope()  // Find max/min forces
```

#### Visualization
```javascript
function drawModel(canvas, studs, edge_dist)
function drawResults(canvas, studs, results, loadCase)
function drawEnvelope(canvas, studs, envelope)
function drawStud(ctx, x, y, label)
function drawForceVector(ctx, x, y, Vx, Vy, scale, color)
function drawCentroid(ctx, x, y)
function drawEdges(ctx, studs, edge_dist)
function drawAxes(ctx)
```

#### UI Updates
```javascript
function updateStudTable()
function updateLoadCaseDropdown()
function updateResultsTable(results, loadCase)
function updateEnvelopeTable(envelope)
function switchTab(tab)  // 'model' | 'results' | 'envelope'
function refreshCanvas()
```

---

## Implementation Phases

### Phase 1: Core Structure ✓
**Goal**: Basic HTML layout and styling

- [ ] Create `index.html` with layout structure
- [ ] Include TailwindCSS via CDN
- [ ] Include Google Analytics tag
- [ ] Create responsive grid layout (40/60 split)
- [ ] Add input fields for material properties
- [ ] Add stud table structure
- [ ] Add load case section
- [ ] Add canvas element for visualization
- [ ] Add results table structure

### Phase 2: Stud Management ✓
**Goal**: Add/remove/edit studs

- [ ] Implement stud state management
- [ ] Add stud form (X, Y inputs)
- [ ] Implement `addStud()` function
- [ ] Implement `removeStud()` function
- [ ] Implement `updateStudTable()` function
- [ ] Add event listeners for stud table
- [ ] Add validation (positive coordinates, unique positions)
- [ ] Pre-populate with example studs from pryout4.py

### Phase 3: Material Properties ✓
**Goal**: Material input handling

- [ ] Implement material state management
- [ ] Add input validation (positive values, ranges)
- [ ] Add tooltips/help text for each parameter
- [ ] Display warnings for spacing/edge distance per EC2
- [ ] Update state on input change

### Phase 4: Load Cases ✓
**Goal**: Multiple load case management

- [ ] Implement load case state management
- [ ] Add load case dropdown
- [ ] Implement `addLoadCase()` function
- [ ] Implement `removeLoadCase()` function
- [ ] Implement `updateLoadCase()` function
- [ ] Implement `setActiveLoadCase()` function
- [ ] Add load case form modal/dialog
- [ ] Add radio buttons for force application (centroid vs point)
- [ ] Show/hide point coordinates based on radio selection
- [ ] Pre-populate with "Dead Load" default case

### Phase 5: Calculation Engine ✓
**Goal**: Port Python calculation logic to JavaScript

- [ ] Implement `calculateCentroid()` from StudGroup
- [ ] Implement `calculatePolarMoment()` from StudGroup
- [ ] Implement `applyActions()` for force distribution
- [ ] Implement `calculatePryoutResistance()` from PryOutEC2
- [ ] Implement psi factor calculations (edge, spacing, group)
- [ ] Implement `runAnalysis()` for single load case
- [ ] Implement `runAllLoadCases()` for all cases
- [ ] Implement `calculateEnvelope()` for max/min
- [ ] Add error handling and validation
- [ ] Test against pryout4.py example (8 studs, -50/-50/0)

### Phase 6: Visualization - Model View ✓
**Goal**: Draw stud geometry

- [ ] Set up canvas context and coordinate system
- [ ] Implement auto-scaling to fit studs in viewport
- [ ] Implement `drawStud()` with label
- [ ] Implement `drawCentroid()` with marker
- [ ] Implement `drawEdges()` with dashed lines
- [ ] Implement `drawAxes()` with X/Y arrows
- [ ] Implement `drawModel()` main function
- [ ] Add pan/zoom controls (optional, nice-to-have)
- [ ] Add grid lines for reference

### Phase 7: Visualization - Results View ✓
**Goal**: Draw force vectors and utilization

- [ ] Implement `drawForceVector()` with arrow
- [ ] Implement auto-scaling for force arrows
- [ ] Draw applied force at application point
- [ ] Draw torsion moment circle
- [ ] Draw individual stud force vectors (orange)
- [ ] Add force magnitude labels
- [ ] Color code studs by utilization (green/yellow/red)
- [ ] Implement `drawResults()` main function
- [ ] Add legend for colors/symbols

### Phase 8: Results Table ✓
**Goal**: Display numerical results

- [ ] Implement `updateResultsTable()` function
- [ ] Format numbers (1 decimal for forces, 1 decimal for %)
- [ ] Color code utilization cells (green ≤85%, yellow ≤100%, red >100%)
- [ ] Show load case name in table header
- [ ] Add sorting capability (by stud #, utilization, etc.)
- [ ] Highlight max utilization row

### Phase 9: Envelope Results ✓
**Goal**: Show max/min across all load cases

- [ ] Implement envelope calculation logic
- [ ] Track which load case is critical for each stud
- [ ] Implement `updateEnvelopeTable()` function
- [ ] Show "Critical Case" column in table
- [ ] Implement `drawEnvelope()` visualization
- [ ] Show max force vectors on canvas
- [ ] Add tab to switch between active case and envelope

### Phase 10: Tab Navigation ✓
**Goal**: Switch between model/results/envelope views

- [ ] Add tab buttons above canvas
- [ ] Implement `switchTab()` function
- [ ] Update canvas on tab change
- [ ] Update results table based on selected view
- [ ] Style active tab
- [ ] Persist tab selection in state

### Phase 11: Interactive Mouse Controls ✓
**Goal**: Click to add/move studs, intuitive interaction

- [ ] Implement canvas coordinate transformation (canvas px ↔ model mm)
- [ ] Add click event listener to canvas
- [ ] Implement "Add Stud" mode (click to place stud)
- [ ] Implement stud selection (click on stud to select)
- [ ] Implement drag-and-drop for moving studs
- [ ] Implement right-click or Delete key to remove stud
- [ ] Visual feedback: hover state, selected state
- [ ] Sync canvas changes to table immediately
- [ ] Sync table edits to canvas immediately
- [ ] Add snap-to-grid option (e.g., 10mm grid)
- [ ] Add coordinate display on mouse hover
- [ ] Add mode toggle: "Add Studs" / "Select/Move" / "View Only"

### Phase 12: Polish & UX ✓
**Goal**: Smooth user experience

- [ ] Add loading states during calculation
- [ ] Add confirmation dialogs for delete operations
- [ ] Add keyboard shortcuts (Enter to calculate, Esc to deselect, etc.)
- [ ] Add tooltips for all inputs
- [ ] Add help/documentation section (collapsible)
- [ ] Add export results to CSV/PDF (future)
- [ ] Add example button to load default configuration
- [ ] Responsive design for mobile/tablet
- [ ] Add print-friendly view

### Phase 13: Testing & Validation ✓
**Goal**: Ensure correctness

- [ ] Test against pryout4.py example results
- [ ] Test edge cases (single stud, collinear studs)
- [ ] Test validation (negative values, zero spacing)
- [ ] Test multiple load cases
- [ ] Test envelope calculation
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile testing
- [ ] Performance testing (100+ studs, 20+ load cases)

### Phase 14: Documentation ✓
**Goal**: User guide and help

- [ ] Add inline help text for all inputs
- [ ] Add EC2-1-4 formula reference in UI
- [ ] Add example use cases
- [ ] Add validation rules documentation
- [ ] Add keyboard shortcuts reference
- [ ] Write README.md for pryout module

---

## Future Enhancements (Post-MVP)

### Load Combinations
- [ ] Define load combinations (e.g., 1.35*Dead + 1.5*Live)
- [ ] Calculate results for combinations
- [ ] Include combinations in envelope

### Advanced Visualization
- [ ] 3D view option
- [ ] Animation of force distribution

### Analysis Features
- [ ] Optimization: Find optimal stud layout
- [ ] Sensitivity analysis for parameters
- [ ] Code check against different standards (ACI, etc.)

### Report Generation
- [ ] Generate detailed PDF report per plan_IO-structure_for_modules.md
- [ ] Include plots, tables, and calculations
- [ ] Professional formatting with EC2-1-4 references

### Workflow Integration
- [ ] Implement MODULE_CONFIG per plan_IO-structure_for_modules.md
- [ ] Implement ModuleAPI interface
- [ ] Enable chaining with other modules

---

## Interactive Mouse Controls - Technical Details

### Coordinate Transformation System

The canvas uses pixel coordinates (0,0 at top-left), but the model uses engineering coordinates in millimeters. We need bidirectional transformation:

```javascript
class CoordinateTransform {
  constructor(canvas, modelBounds) {
    this.canvas = canvas;
    this.modelBounds = modelBounds; // {minX, maxX, minY, maxY} in mm
    this.padding = 60; // pixels
    this.calculateTransform();
  }

  calculateTransform() {
    const canvasWidth = this.canvas.width - 2 * this.padding;
    const canvasHeight = this.canvas.height - 2 * this.padding;

    const modelWidth = this.modelBounds.maxX - this.modelBounds.minX;
    const modelHeight = this.modelBounds.maxY - this.modelBounds.minY;

    // Scale factor (px/mm) - use same for both axes to preserve aspect ratio
    this.scale = Math.min(canvasWidth / modelWidth, canvasHeight / modelHeight);

    // Origin offset to center the model
    this.offsetX = this.padding + (canvasWidth - modelWidth * this.scale) / 2;
    this.offsetY = this.padding + (canvasHeight - modelHeight * this.scale) / 2;
  }

  // Model mm → Canvas px
  modelToCanvas(x, y) {
    return {
      x: this.offsetX + (x - this.modelBounds.minX) * this.scale,
      y: this.offsetY + (y - this.modelBounds.minY) * this.scale
    };
  }

  // Canvas px → Model mm
  canvasToModel(canvasX, canvasY) {
    return {
      x: (canvasX - this.offsetX) / this.scale + this.modelBounds.minX,
      y: (canvasY - this.offsetY) / this.scale + this.modelBounds.minY
    };
  }

  // Update bounds when studs change
  updateBounds(studs, edgeDist) {
    if (studs.length === 0) {
      this.modelBounds = {minX: -edgeDist, maxX: edgeDist, minY: -edgeDist, maxY: edgeDist};
    } else {
      const xs = studs.map(s => s.x);
      const ys = studs.map(s => s.y);
      this.modelBounds = {
        minX: Math.min(...xs) - edgeDist,
        maxX: Math.max(...xs) + edgeDist,
        minY: Math.min(...ys) - edgeDist,
        maxY: Math.max(...ys) + edgeDist
      };
    }
    this.calculateTransform();
  }
}
```

### Mouse Interaction State

```javascript
const mouseState = {
  mode: 'select',  // 'add' | 'select' | 'view'
  hoveredStud: null,
  selectedStud: null,
  isDragging: false,
  dragStartPos: null,
  currentPos: null,
  snapToGrid: true,
  gridSize: 10  // mm
};
```

### Event Handlers Implementation

```javascript
// 1. Mouse Move - Track position and highlight studs
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  const modelPos = transform.canvasToModel(canvasX, canvasY);
  mouseState.currentPos = modelPos;

  // Update cursor display
  updateCursorPosition(modelPos.x, modelPos.y);

  // Handle dragging
  if (mouseState.isDragging && mouseState.selectedStud) {
    let newX = modelPos.x;
    let newY = modelPos.y;

    // Snap to grid if enabled
    if (mouseState.snapToGrid) {
      newX = Math.round(newX / mouseState.gridSize) * mouseState.gridSize;
      newY = Math.round(newY / mouseState.gridSize) * mouseState.gridSize;
    }

    // Update stud position
    updateStudPosition(mouseState.selectedStud.id, newX, newY);
    refreshCanvas();
    updateStudTable();
    return;
  }

  // Find hovered stud (hit detection)
  const hitRadius = 8; // pixels
  mouseState.hoveredStud = findStudAtPosition(canvasX, canvasY, hitRadius);

  // Update cursor style
  if (mouseState.mode === 'add') {
    canvas.style.cursor = 'crosshair';
  } else if (mouseState.hoveredStud) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'default';
  }

  refreshCanvas();
});

// 2. Mouse Down - Start dragging or selection
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Only left click

  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  const clickedStud = findStudAtPosition(canvasX, canvasY, 8);

  if (mouseState.mode === 'select' && clickedStud) {
    // Start dragging existing stud
    mouseState.selectedStud = clickedStud;
    mouseState.isDragging = true;
    mouseState.dragStartPos = {x: clickedStud.x, y: clickedStud.y};
  } else if (mouseState.mode === 'select' && !clickedStud) {
    // Deselect
    mouseState.selectedStud = null;
    refreshCanvas();
  }
});

// 3. Mouse Up - Finish dragging or add stud
canvas.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;

  if (mouseState.isDragging) {
    // Finish dragging
    mouseState.isDragging = false;
    mouseState.dragStartPos = null;
  } else if (mouseState.mode === 'add') {
    // Add new stud at click position
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const modelPos = transform.canvasToModel(canvasX, canvasY);

    let newX = modelPos.x;
    let newY = modelPos.y;

    // Snap to grid if enabled
    if (mouseState.snapToGrid) {
      newX = Math.round(newX / mouseState.gridSize) * mouseState.gridSize;
      newY = Math.round(newY / mouseState.gridSize) * mouseState.gridSize;
    }

    // Add stud
    addStud(newX, newY);
    updateStudTable();
    refreshCanvas();
  }
});

// 4. Right Click - Delete stud
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();

  if (mouseState.mode !== 'view') {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const clickedStud = findStudAtPosition(canvasX, canvasY, 8);

    if (clickedStud) {
      if (confirm(`Delete Stud ${clickedStud.id}?`)) {
        removeStud(clickedStud.id);
        updateStudTable();
        refreshCanvas();
      }
    }
  }
});

// 5. Mouse Leave - Clear hover state
canvas.addEventListener('mouseleave', () => {
  mouseState.hoveredStud = null;
  mouseState.currentPos = null;
  refreshCanvas();
});

// 6. Keyboard - Delete selected stud, toggle snap, escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && mouseState.selectedStud) {
    if (confirm(`Delete Stud ${mouseState.selectedStud.id}?`)) {
      removeStud(mouseState.selectedStud.id);
      mouseState.selectedStud = null;
      updateStudTable();
      refreshCanvas();
    }
  } else if (e.key === 'Escape') {
    mouseState.selectedStud = null;
    mouseState.isDragging = false;
    refreshCanvas();
  } else if (e.key === 'g' || e.key === 'G') {
    mouseState.snapToGrid = !mouseState.snapToGrid;
    showToast(`Snap to grid: ${mouseState.snapToGrid ? 'ON' : 'OFF'}`);
  }
});
```

### Hit Detection

```javascript
function findStudAtPosition(canvasX, canvasY, radiusPx) {
  for (const stud of state.studs) {
    const canvasPos = transform.modelToCanvas(stud.x, stud.y);
    const dx = canvasPos.x - canvasX;
    const dy = canvasPos.y - canvasY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radiusPx) {
      return stud;
    }
  }
  return null;
}
```

### Visual Feedback in Drawing

```javascript
function drawStud(ctx, x, y, label, isHovered, isSelected) {
  const canvasPos = transform.modelToCanvas(x, y);

  ctx.save();

  // Draw selection ring
  if (isSelected) {
    ctx.strokeStyle = '#3b82f6'; // blue
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, 12, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Draw hover highlight
  if (isHovered) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // light blue
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw stud circle
  ctx.fillStyle = isSelected ? '#3b82f6' : '#2563eb';
  ctx.beginPath();
  ctx.arc(canvasPos.x, canvasPos.y, 6, 0, 2 * Math.PI);
  ctx.fill();

  // Draw label
  ctx.fillStyle = '#000';
  ctx.font = '12px sans-serif';
  ctx.fillText(label, canvasPos.x + 10, canvasPos.y + 5);

  ctx.restore();
}
```

### Syncing Between Table and Canvas

```javascript
// Table input change → Update canvas
function onTableInputChange(studId, field, value) {
  const stud = state.studs.find(s => s.id === studId);
  if (!stud) return;

  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue < 0) {
    alert('Invalid coordinate value');
    return;
  }

  stud[field] = numValue;

  // Update transform bounds and redraw
  transform.updateBounds(state.studs, state.material.edge_dist);
  refreshCanvas();
}

// Canvas drag → Update table
function updateStudPosition(studId, newX, newY) {
  const stud = state.studs.find(s => s.id === studId);
  if (!stud) return;

  stud.x = Math.max(0, newX); // Prevent negative coordinates
  stud.y = Math.max(0, newY);

  // Update table cell values
  const xInput = document.getElementById(`stud-${studId}-x`);
  const yInput = document.getElementById(`stud-${studId}-y`);

  if (xInput) xInput.value = stud.x.toFixed(1);
  if (yInput) yInput.value = stud.y.toFixed(1);
}
```

### Mode Toggle UI

```html
<!-- Add above canvas -->
<div class="flex gap-2 mb-2">
  <button id="mode-add" class="mode-btn" onclick="setMode('add')">
    ➕ Add Studs
  </button>
  <button id="mode-select" class="mode-btn active" onclick="setMode('select')">
    🔵 Select/Move
  </button>
  <button id="mode-view" class="mode-btn" onclick="setMode('view')">
    👁️ View Only
  </button>

  <div class="ml-auto flex items-center gap-2">
    <label>
      <input type="checkbox" id="snap-grid" checked onchange="toggleSnapGrid()">
      Snap to Grid (10mm)
    </label>
    <div id="cursor-pos" class="text-sm text-gray-600">
      X: -, Y: -
    </div>
  </div>
</div>
```

```javascript
function setMode(mode) {
  mouseState.mode = mode;

  // Update button styles
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`mode-${mode}`).classList.add('active');

  // Clear selection when switching modes
  mouseState.selectedStud = null;
  mouseState.hoveredStud = null;
  refreshCanvas();
}

function updateCursorPosition(x, y) {
  const display = document.getElementById('cursor-pos');
  if (display) {
    display.textContent = `X: ${x.toFixed(1)} mm, Y: ${y.toFixed(1)} mm`;
  }
}

function toggleSnapGrid() {
  mouseState.snapToGrid = document.getElementById('snap-grid').checked;
}
```

### Grid Drawing (Optional Enhancement)

```javascript
function drawGrid(ctx, gridSize) {
  if (!mouseState.snapToGrid) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
  ctx.lineWidth = 0.5;

  const {minX, maxX, minY, maxY} = transform.modelBounds;

  // Vertical lines
  for (let x = Math.ceil(minX / gridSize) * gridSize; x <= maxX; x += gridSize) {
    const canvasPos = transform.modelToCanvas(x, minY);
    const canvasEnd = transform.modelToCanvas(x, maxY);
    ctx.beginPath();
    ctx.moveTo(canvasPos.x, canvasPos.y);
    ctx.lineTo(canvasEnd.x, canvasEnd.y);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = Math.ceil(minY / gridSize) * gridSize; y <= maxY; y += gridSize) {
    const canvasPos = transform.modelToCanvas(minX, y);
    const canvasEnd = transform.modelToCanvas(maxX, y);
    ctx.beginPath();
    ctx.moveTo(canvasPos.x, canvasPos.y);
    ctx.lineTo(canvasEnd.x, canvasEnd.y);
    ctx.stroke();
  }

  ctx.restore();
}
```

---

## Design Decisions

### Why Canvas over SVG?
- Better performance for large stud groups (100+ studs)
- Easier to implement force vector arrows with scaling
- Simpler pan/zoom implementation
- Direct pixel-based hit detection for mouse interactions
- Smoother drag-and-drop experience
- Can always export to SVG later if needed

### Why Vanilla JavaScript?
- No build step required (matches project architecture)
- Faster initial load time
- Easier to maintain and debug
- Consistent with other plain HTML modules

### Why TailwindCSS?
- Consistent styling across all modules
- Rapid development with utility classes
- Responsive design out of the box
- Already used in other modules

### Why Store Results per Load Case?
- Allows instant switching between cases without recalculation
- Enables efficient envelope calculation
- Supports future load combination feature
- Better UX (no delays when switching views)

---

## Validation & Testing Strategy

### Unit Tests (Manual)
Test each function independently:
- `calculateCentroid()` with known stud positions
- `calculatePolarMoment()` with symmetric layouts
- `applyActions()` with simple force cases
- `calculatePryoutResistance()` with EC2 examples

### Integration Tests
Test full workflow:
1. Add studs → Calculate → Check results match pryout4.py
2. Add multiple load cases → Check results stored correctly
3. Calculate envelope → Check max/min are correct
4. Switch tabs → Check visualization updates

### Validation Against pryout4.py
Use the example from pryout4.py (lines 189-212):
- 8 studs at specified coordinates
- fck=30, hef=100, d=19, edge_dist=100, spacing=120
- Vx=-50, Vy=-50, Mz=0
- Verify results match Python output

---

## Performance Considerations

### Expected Performance
- **Studs**: Up to 100 studs without noticeable lag
- **Load Cases**: Up to 20 load cases
- **Calculation Time**: <100ms for typical cases
- **Rendering Time**: <50ms for canvas redraw

### Optimization Strategies
- Debounce input changes to avoid excessive calculations
- Cache centroid and polar moment calculations
- Use requestAnimationFrame for smooth canvas updates
- Lazy load results (calculate on demand, not on every input change)

---

## Accessibility Considerations

- [ ] Proper ARIA labels for interactive elements
- [ ] Keyboard navigation for all functions
- [ ] Screen reader support for results table
- [ ] High contrast mode support
- [ ] Focus indicators for inputs and buttons

---

## Browser Compatibility

**Target Browsers**:
- Chrome 90+ ✓
- Firefox 88+ ✓
- Safari 14+ ✓
- Edge 90+ ✓

**Required Features**:
- Canvas 2D context
- ES6 JavaScript (const, let, arrow functions, template literals)
- CSS Grid and Flexbox

---

## Deployment

1. **Local Testing**: Open index.html directly in browser
2. **Commit to master**: Add pryout/index.html, script.js, visualization.js
3. **Auto-deploy**: GitHub Actions deploys to gh-pages
4. **Live URL**: https://magnusfjeldolsen.github.io/structural_tools/pryout/

No build step required - plain HTML module.

---

## Success Criteria

✅ MVP Complete When:
1. User can add/remove studs via table
2. User can create multiple load cases
3. User can switch between load cases
4. Calculations match pryout4.py results
5. Model view shows geometry correctly
6. Results view shows force vectors
7. Results table displays utilization
8. Envelope shows max/min across cases
9. All validations working (spacing, edge distance)
10. Responsive design works on desktop/tablet

---

## Timeline Estimate

**Phases 1-5** (Structure + Logic): 4-6 hours
**Phases 6-8** (Visualization + Tables): 3-4 hours
**Phases 9-10** (Envelope + Tabs): 2-3 hours
**Phases 11-13** (Polish + Testing + Docs): 2-3 hours

**Total**: 11-16 hours

---

## References

- **Source Code**: pryout4.py (lines 1-216)
- **Standard**: Eurocode 2-1-4 (Pry-out resistance)
- **Module Pattern**: plan_IO-structure_for_modules.md
- **Deployment**: DEPLOYMENT.md
- **Example Modules**: concrete_beam_design, weld_capacity

---

## Notes

- Keep UI simple and intuitive
- Prioritize clarity over features
- Test thoroughly against Python implementation
- Document all formulas and assumptions
- Follow EC2-1-4 closely for resistance calculations
- Load combinations are Phase 2 - keep API flexible for future extension

---

**Status**: ✅ Plan Ready for Review
**Next Step**: Review plan → Proceed to Phase 1 implementation
**Last Updated**: 2026-01-05
