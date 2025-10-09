# Concrete Bending Analysis - UI Specification

## Overview
A browser-based concrete bending analysis tool using Pyodide and the `structuralcodes` library. The application performs moment-curvature analysis and bending capacity checks for rectangular concrete sections according to Eurocode 2 (EC2 2004).

**Key Features:**
- Interactive cross-section builder with live D3.js visualization
- Flexible reinforcement input: individual bars OR reinforcement lines/groups
- Real-time geometry updates (inspired by concrete_dowels visualization)
- Create, edit, and delete individual rebars and rebar groups
- Separate Python calculation module for independent testing
- All calculations run in browser via Pyodide

## Architecture

### File Structure
```
structuralcodes_concretebending/
├── concrete_bending.py          # Pure Python calculation module (testable)
├── script.js                     # Pyodide loader, UI interaction, D3.js plotting
├── index.html                    # UI layout
├── helperfunctions.py            # Geometry and reinforcement utilities (existing)
└── devspecs/
    └── spec.md                   # This specification
```

### Separation of Concerns
- **concrete_bending.py**: Contains all calculation logic, can be run and tested independently
- **script.js**: Handles Pyodide initialization, UI events, Python-JS bridge, D3.js visualization
- **index.html**: UI definition with input fields, reinforcement management, and result display
- **helperfunctions.py**: Utility functions for boundary extraction and reinforcement line generation (already exists)

## Geometry Assembly Understanding (structuralcodes API)

### How Geometry is Built
1. **Base Geometry**: Start with `RectangularGeometry(width, height, material=concrete)`
2. **Add Reinforcement**: Use `add_reinforcement()` or `add_reinforcement_line()`
   - Each addition returns a new `CompoundGeometry` object
   - Reinforcement stored as `point_geometries` (individual bar objects)
3. **Create Section**: Wrap geometry in `GenericSection(geometry)`
4. **Run Calculations**: Call section calculation methods

### Key Points
- Initial rectangle is a simple `RectangularGeometry`
- After adding ANY reinforcement → becomes `CompoundGeometry`
- `CompoundGeometry` contains:
  - `surface_geometries`: The concrete polygon(s)
  - `point_geometries`: The rebar points (each has area, material, position)
- Behind the scenes: Entire Python script re-runs on every UI change
- User perception: Smooth editing of individual bars/groups

## Python Module (concrete_bending.py)

### Core Functions

#### `create_rectangular_section(params: dict) -> tuple[GenericSection, dict]`
Creates a rectangular concrete section with reinforcement.

**Parameters (dict keys):**

**Materials:**
- `fck` (float): Characteristic concrete compressive strength in MPa
- `fyk` (float): Characteristic yield strength of reinforcement in MPa
- `ftk` (float): Characteristic tensile strength of reinforcement in MPa
- `Es` (float): Elastic modulus of reinforcement in MPa (default: 200000)
- `epsuk` (float): Characteristic strain at maximum load for reinforcement
- `design_code` (str): Design code identifier (default: 'ec2_2004')

**Section Geometry:**
- `width` (float): Section width in mm
- `height` (float): Section height in mm

**Reinforcement List:**
- `reinforcements` (list[dict]): List of reinforcement definitions
  - Each dict can be type "single_bar" OR "rebar_line"

**Single Bar Format:**
```python
{
    'type': 'single_bar',
    'id': 'bar_1',  # Unique identifier
    'x': 100,       # X coordinate from section origin (mm)
    'y': -150,      # Y coordinate from section origin (mm)
    'diameter': 12, # Bar diameter (mm)
}
```

**Rebar Line Format:**
```python
{
    'type': 'rebar_line',
    'id': 'bottom_layer',          # Unique identifier
    'boundary': 'bottom',           # Options: 'bottom', 'top', 'left', 'right'
    'diameter': 12,                 # Bar diameter (mm)
    'spacing': 100,                 # Bar spacing (mm)
    'boundary_cover': 50,           # Perpendicular offset from boundary (mm)
    'start_cover': 50,              # Cover from start edge (mm) - optional
    'end_cover': 50,                # Cover from end edge (mm) - optional
}
```

**Returns:**
- `GenericSection` object
- `dict` with geometry metadata (coordinates, total bars, etc.)

#### `calculate_moment_curvature(section: GenericSection) -> dict`
Calculates moment-curvature response.

**Returns (dict):**
- `curvature`: Array of curvature values (1/mm)
- `moment`: Array of moment values (Nmm)
- `success`: Boolean indicating calculation success
- `message`: Status or error message

#### `calculate_bending_capacity(section: GenericSection) -> dict`
Calculates ultimate bending moment capacity.

**Returns (dict):**
- `M_Rdy` (float): Moment capacity about y-axis in kNm
- `M_Rdz` (float): Moment capacity about z-axis in kNm
- `neutral_axis_depth` (float): Neutral axis depth in mm (if available)
- `success`: Boolean indicating calculation success
- `message`: Status or error message

#### `get_section_visualization_data(section: GenericSection) -> dict`
Extracts geometry data for D3.js visualization.

**Returns (dict):**
```python
{
    'concrete_outline': [[x1,y1], [x2,y2], ...],  # Polygon points
    'rebars': [
        {'x': 100, 'y': -150, 'diameter': 12, 'id': 'bar_1'},
        {'x': 200, 'y': -150, 'diameter': 12, 'id': 'bar_2'},
        ...
    ],
    'extents': {'xmin': -500, 'xmax': 500, 'ymin': -175, 'ymax': 175}
}
```

#### `run_analysis(params: dict) -> dict`
Main entry point that creates section and runs both analyses.

**Returns (dict):**
- `moment_curvature`: Dict from calculate_moment_curvature()
- `capacity`: Dict from calculate_bending_capacity()
- `section_properties`: Dict with geometric properties
  - `total_rebar_area`: Total reinforcement area in mm²
  - `reinforcement_ratio`: Reinforcement ratio (%)
  - `section_area`: Gross concrete area in mm²
  - `num_rebars`: Total number of reinforcement bars
- `visualization`: Dict from get_section_visualization_data()

## User Interface (index.html)

### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│  [Back to Tools]                                        │
│  Concrete Bending Analysis                              │
├─────────────────────────────────────────────────────────┤
│  Left Panel (Inputs)   │   Right Panel (Visualization)  │
│  ├─ Material Props     │   ├─ Cross-Section Plot       │
│  ├─ Section Geometry   │   │  (D3.js - live update)    │
│  ├─ Reinforcement Mgr  │   └─ Legend                   │
│  │  ├─ Add Single Bar  │                               │
│  │  ├─ Add Rebar Line  │                               │
│  │  └─ Rebar List      │                               │
│  │     [Edit] [Delete] │                               │
│  └─ Calculate Button   │                               │
├─────────────────────────────────────────────────────────┤
│  Results Panel (Full Width)                            │
│  ├─ Capacity Summary (M_Rd cards)                      │
│  ├─ Section Properties                                  │
│  ├─ Moment-Curvature Plot (Plotly/D3)                  │
│  └─ Detailed Calculations                               │
└─────────────────────────────────────────────────────────┘
```

### Input Panel (Left Side)

#### Material Properties Section
- **Design Code**: Dropdown, default 'ec2_2004'
- **Concrete Strength (fck)**: Number input, default 45 MPa, range 12-90 MPa
- **Reinforcement Yield Strength (fyk)**: Number input, default 500 MPa, range 400-600 MPa
- **Reinforcement Tensile Strength (ftk)**: Number input, default 550 MPa, range 450-700 MPa
- **Reinforcement Elastic Modulus (Es)**: Number input, default 200000 MPa (can be disabled/grayed out)
- **Reinforcement Ultimate Strain (εsuk)**: Number input, default 0.075, range 0.025-0.1

#### Section Geometry Section
- **Width**: Number input, default 1000 mm, range 100-5000 mm
- **Height**: Number input, default 350 mm, range 100-3000 mm

#### Reinforcement Manager Section

**Add Reinforcement Tabs:**
- Tab 1: "Single Bar"
- Tab 2: "Rebar Line"

**Tab 1: Single Bar Input**
- **Bar ID**: Auto-generated (bar_1, bar_2, ...)
- **X Position**: Number input, mm from section center
- **Y Position**: Number input, mm from section center
- **Diameter**: Dropdown [8, 10, 12, 16, 20, 25, 32, 40] mm
- **[Add Bar]** button

**Tab 2: Rebar Line Input**
- **Line ID**: Auto-generated or user-editable (bottom_layer, top_layer, ...)
- **Boundary**: Dropdown ['bottom', 'top', 'left', 'right']
- **Diameter**: Dropdown [8, 10, 12, 16, 20, 25, 32, 40] mm
- **Spacing**: Number input, default 100 mm, range 50-500 mm
- **Boundary Cover**: Number input, default 50 mm, range 15-100 mm
- **Start Cover**: Number input (optional, defaults to boundary_cover)
- **End Cover**: Number input (optional, defaults to boundary_cover)
- **[Add Rebar Line]** button

**Cover Setting Helper Text:**
- "Boundary cover: perpendicular distance from edge"
- "Start/End cover: offset along the boundary from corners"
- "Leave start/end blank to use boundary cover value"

**Reinforcement List Table:**
| Type | ID | Details | Actions |
|------|----|---------| --------|
| Single | bar_1 | φ12 @ (100, -150) | [Edit] [Delete] |
| Line | bottom_layer | φ12 @ 100mm, 8 bars | [Edit] [Delete] |

- Clicking [Edit] opens modal/inline form with current values
- Clicking [Delete] removes reinforcement (with confirmation)
- Live count: "Total bars: 15 | Total As: 1696 mm²"

#### Action Buttons
- **Calculate**: Primary button (blue), triggers analysis
- **Update Visualization**: Secondary button, updates cross-section plot only
- **Reset All**: Tertiary button, resets to defaults (with confirmation)

### Visualization Panel (Right Side)

#### Cross-Section Plot (D3.js)
Inspired by concrete_dowels implementation:

**Features:**
- SVG-based responsive plot
- Concrete section: Gray rectangle with border
- Rebars: Red/orange circles (radius scaled by diameter)
- Coordinate axes with tick marks
- Dimension annotations (width, height)
- Grid overlay (optional toggle)
- Zoom/pan capability (optional)
- Legend: Concrete, Reinforcement, scale reference

**Visual Style:**
- Concrete: `fill: #e5e7eb`, `stroke: #374151`
- Rebars: `fill: #ef4444`, `stroke: #991b1b`
- Axes: `stroke: #6b7280`, dashed
- Dimensions: `fill: #374151`, font-size: 10-12px
- Background: `fill: white` or `#f9fafb`

**Update Triggers:**
- On section dimension change
- On reinforcement add/edit/delete
- On "Update Visualization" button click
- Automatic before running analysis

### Output Panel (Full Width)

#### Capacity Results Summary (Card Layout)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ M_Rdy       │ M_Rdz       │ NA Depth    │ Calc Time   │
│ 125.4 kNm   │ 1250 kNm    │ 75 mm       │ 0.15 s      │
└─────────────┴─────────────┴─────────────┴─────────────┘
```
Color-coded based on warning thresholds (if design moment provided)

#### Section Properties Display
- **Gross Section Area**: XX,XXX mm² (X.XX m²)
- **Total Reinforcement Area**: XXX mm²
- **Reinforcement Ratio**: X.XX%
- **Number of Rebars**: XX bars

#### Moment-Curvature Plot
- Interactive plot using Plotly.js or D3.js
- X-axis: Curvature κ (1/m or 1/mm)
- Y-axis: Moment M (kNm)
- Highlight ultimate capacity point with marker
- Hoverable tooltips for data points

#### Detailed Calculations (Expandable)
- Click to expand/collapse
- Step-by-step calculation breakdown
- Material properties used
- Section analysis details
- Formatted with MathJax for equations (optional)

#### Status Messages
- Success/error messages at top
- Warnings (e.g., "Low reinforcement ratio - check minimum requirements")
- Info messages (e.g., "Section loaded from previous session")

## JavaScript Module (script.js)

### Global State Management
```javascript
// Application state
const appState = {
    pyodideReady: false,
    pyodide: null,
    sectionParams: {
        materials: {...},
        geometry: {...},
        reinforcements: []  // Array of rebar definitions
    },
    results: null,
    visualizationData: null
};
```

### Initialization
```javascript
async function loadPyodide() {
    // Show loading indicator
    // Load Pyodide from CDN
    // Install packages: structuralcodes, shapely, numpy
    // Load Python modules from file system
    await pyodide.runPythonAsync(`
        import concrete_bending
        import helperfunctions
    `);
    // Set pyodideReady flag
    // Hide loading indicator
}
```

### Reinforcement Management Functions
```javascript
// Add single bar to state
function addSingleBar(x, y, diameter) {
    const id = generateBarId();
    appState.sectionParams.reinforcements.push({
        type: 'single_bar',
        id: id,
        x: x,
        y: y,
        diameter: diameter
    });
    updateRebarList();
    updateVisualization();
}

// Add rebar line to state
function addRebarLine(params) {
    const id = params.id || generateLineId();
    appState.sectionParams.reinforcements.push({
        type: 'rebar_line',
        id: id,
        boundary: params.boundary,
        diameter: params.diameter,
        spacing: params.spacing,
        boundary_cover: params.boundary_cover,
        start_cover: params.start_cover || params.boundary_cover,
        end_cover: params.end_cover || params.boundary_cover
    });
    updateRebarList();
    updateVisualization();
}

// Edit reinforcement (by ID)
function editReinforcement(id, newParams) {
    const index = appState.sectionParams.reinforcements.findIndex(r => r.id === id);
    appState.sectionParams.reinforcements[index] = {...newParams};
    updateRebarList();
    updateVisualization();
}

// Delete reinforcement (by ID)
function deleteReinforcement(id) {
    appState.sectionParams.reinforcements =
        appState.sectionParams.reinforcements.filter(r => r.id !== id);
    updateRebarList();
    updateVisualization();
}

// Update rebar list table in UI
function updateRebarList() {
    // Render table with all reinforcements
    // Add edit/delete buttons with event listeners
}
```

### D3.js Visualization Functions
```javascript
// Draw cross-section (inspired by concrete_dowels)
function drawCrossSectionPlot() {
    // Clear previous SVG
    d3.select('#section-plot').selectAll('*').remove();

    // Set up SVG with responsive dimensions
    const svg = d3.select('#section-plot')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`);

    // Get visualization data from Python
    const vizData = await getVisualizationData();

    // Draw concrete outline polygon
    // Draw coordinate axes
    // Draw dimension lines
    // Draw rebars as circles
    // Add legend
}

async function getVisualizationData() {
    // Call Python to generate geometry and extract coordinates
    const params = appState.sectionParams;
    const result = await pyodide.runPythonAsync(`
        import json
        from concrete_bending import get_section_visualization_data, create_rectangular_section

        params = ${JSON.stringify(params)}
        section, metadata = create_rectangular_section(params)
        viz_data = get_section_visualization_data(section)
        json.dumps(viz_data)
    `);
    return JSON.parse(result);
}
```

### Analysis Functions
```javascript
async function runAnalysis() {
    if (!appState.pyodideReady) {
        alert('Python engine not ready. Please wait...');
        return;
    }

    // Show loading spinner
    const startTime = performance.now();

    try {
        // Gather all parameters
        const params = {
            ...appState.sectionParams.materials,
            ...appState.sectionParams.geometry,
            reinforcements: appState.sectionParams.reinforcements
        };

        // Call Python
        const resultJson = await pyodide.runPythonAsync(`
            import json
            from concrete_bending import run_analysis

            params = ${JSON.stringify(params)}
            results = run_analysis(params)
            json.dumps(results)
        `);

        const results = JSON.parse(resultJson);
        const endTime = performance.now();
        results.calc_time = (endTime - startTime) / 1000; // seconds

        // Store results
        appState.results = results;

        // Update UI
        displayResults(results);
        plotMomentCurvature(results.moment_curvature);

    } catch (error) {
        console.error('Analysis error:', error);
        displayError(error.message);
    } finally {
        // Hide loading spinner
    }
}

function displayResults(results) {
    // Update capacity cards
    document.getElementById('result_m_rdy').textContent =
        results.capacity.M_Rdy.toFixed(1) + ' kNm';
    document.getElementById('result_m_rdz').textContent =
        results.capacity.M_Rdz.toFixed(1) + ' kNm';

    // Update section properties
    // Update status messages
    // Update detailed calculations
}

function plotMomentCurvature(data) {
    // Use Plotly.js or D3.js to create interactive plot
    // X: curvature array, Y: moment array
}
```

### Event Handlers
```javascript
// Form input changes
document.getElementById('width').addEventListener('change', () => {
    appState.sectionParams.geometry.width = parseFloat(...);
    updateVisualization();
});

// Add bar button
document.getElementById('btn-add-single-bar').addEventListener('click', () => {
    const x = parseFloat(document.getElementById('bar-x').value);
    const y = parseFloat(document.getElementById('bar-y').value);
    const diameter = parseFloat(document.getElementById('bar-diameter').value);
    addSingleBar(x, y, diameter);
});

// Add rebar line button
document.getElementById('btn-add-rebar-line').addEventListener('click', () => {
    const params = {
        boundary: document.getElementById('line-boundary').value,
        diameter: parseFloat(document.getElementById('line-diameter').value),
        spacing: parseFloat(document.getElementById('line-spacing').value),
        boundary_cover: parseFloat(document.getElementById('line-boundary-cover').value),
        start_cover: parseFloat(document.getElementById('line-start-cover').value) || undefined,
        end_cover: parseFloat(document.getElementById('line-end-cover').value) || undefined
    };
    addRebarLine(params);
});

// Calculate button
document.getElementById('btn-calculate').addEventListener('click', () => {
    runAnalysis();
});
```

## Calculation Flow

### User adds reinforcement:
1. User fills single bar or rebar line form
2. Clicks "Add" button
3. JavaScript adds to `appState.sectionParams.reinforcements[]`
4. JavaScript updates rebar list table UI
5. JavaScript calls `updateVisualization()`
6. Python creates geometry and extracts visualization data
7. D3.js redraws cross-section with new rebars

### User runs analysis:
1. User clicks "Calculate" button
2. JavaScript collects all params (materials, geometry, reinforcements)
3. JavaScript calls Python `run_analysis(params)` via Pyodide
4. Python creates concrete and reinforcement materials
5. Python creates `RectangularGeometry`
6. Python iterates over reinforcements list:
   - If type='single_bar': call `add_reinforcement(geometry, point, diameter, material)`
   - If type='rebar_line':
     - Get boundary using helperfunctions (get_bottom_boundary_of_rectangle, etc.)
     - Calculate line endpoints with cover using `generate_reinforcement_line_coords_with_cover()`
     - Call `add_reinforcement_line(geometry, start, end, diameter, spacing, material)`
   - Geometry becomes `CompoundGeometry` after first reinforcement
7. Python creates `GenericSection(geometry)`
8. Python calculates moment-curvature response
9. Python calculates bending capacity
10. Python extracts visualization data
11. Python returns all results as JSON
12. JavaScript updates results panel
13. JavaScript plots moment-curvature curve
14. JavaScript updates cross-section visualization

## Testing Strategy

### Python Module Testing
The `concrete_bending.py` module can be tested independently:

```python
# test_concrete_bending.py
from concrete_bending import run_analysis

# Test with single bars
params = {
    'fck': 45,
    'fyk': 500,
    'ftk': 550,
    'Es': 200000,
    'epsuk': 0.075,
    'width': 1000,
    'height': 350,
    'design_code': 'ec2_2004',
    'reinforcements': [
        {'type': 'single_bar', 'id': 'bar_1', 'x': -400, 'y': -150, 'diameter': 16},
        {'type': 'single_bar', 'id': 'bar_2', 'x': -200, 'y': -150, 'diameter': 16},
        {'type': 'single_bar', 'id': 'bar_3', 'x': 0, 'y': -150, 'diameter': 16},
        {'type': 'single_bar', 'id': 'bar_4', 'x': 200, 'y': -150, 'diameter': 16},
        {'type': 'single_bar', 'id': 'bar_5', 'x': 400, 'y': -150, 'diameter': 16},
    ]
}

results = run_analysis(params)
assert results['capacity']['success'] == True
assert results['capacity']['M_Rdy'] > 0
print(f"Test 1 passed: M_Rdy = {results['capacity']['M_Rdy']:.2f} kNm")

# Test with rebar line (matches concrete_bending_example.py)
params2 = {
    'fck': 45,
    'fyk': 500,
    'ftk': 550,
    'Es': 200000,
    'epsuk': 0.075,
    'width': 1000,
    'height': 350,
    'design_code': 'ec2_2004',
    'reinforcements': [
        {
            'type': 'rebar_line',
            'id': 'bottom_layer',
            'boundary': 'bottom',
            'diameter': 12,
            'spacing': 100,
            'boundary_cover': 50,
            'start_cover': 50,
            'end_cover': 50
        }
    ]
}

results2 = run_analysis(params2)
assert results2['capacity']['success'] == True
print(f"Test 2 passed: M_Rdy = {results2['capacity']['M_Rdy']:.2f} kNm")
```

### UI Testing
- Test add/edit/delete for both single bars and rebar lines
- Test visualization updates
- Test form validation
- Test error handling (invalid inputs, calculation failures)

## Future Enhancements (Beyond Initial Scope)

### Phase 2: Extended Functionality
- M-N interaction diagrams
- Biaxial bending
- Non-rectangular sections (T-beams, L-beams, custom polygons)
- Multiple reinforcement layers (top/bottom/sides)
- Compression reinforcement
- Shear capacity checks
- Stirrup/transverse reinforcement

### Phase 3: UI Enhancements
- Visual bar placement: Click on section to add bars
- Drag-and-drop bar repositioning
- Symmetric rebar patterns (mirror option)
- Multiple design code support (ACI 318, AS3600, etc.)
- Save/load configurations (JSON export/import)
- Batch analysis with parameter sweeps
- Report generation (PDF with plots and calculations)
- Unit system toggle (SI/Imperial)
- Dark mode toggle

### Phase 4: Advanced Features
- Crack width calculations
- Deflection checks (short-term, long-term)
- Time-dependent effects (creep, shrinkage)
- Fire resistance checks
- Seismic detailing checks
- Connection to structural analysis results

## Dependencies (Pyodide)

```python
# Required packages (installed via micropip)
- structuralcodes
- shapely
- numpy
```

```javascript
// Frontend libraries (loaded from CDN)
- D3.js v7 (for cross-section visualization)
- Plotly.js (for moment-curvature plots) OR D3.js
- Tailwind CSS (styling framework)
- MathJax (optional, for equation rendering)
```

## Error Handling

### Python Side
- Validate input parameters:
  - Check ranges (fck > 0, spacing > 0, etc.)
  - Check types (all numbers are float/int)
  - Check reinforcement list structure
- Validate reinforcement positions (not outside section)
- Catch structuralcodes exceptions (convergence failures, etc.)
- Return structured error messages with context

### JavaScript Side
- Form validation before submission:
  - Required fields filled
  - Numeric fields are valid numbers
  - At least one reinforcement defined
- Display user-friendly error messages in UI
- Handle Pyodide loading failures gracefully
- Timeout for long calculations (>30 seconds warning)
- Prevent multiple simultaneous calculations

## Performance Considerations

- Initial Pyodide load: ~5-10 seconds (one-time)
- Package installation: ~10-20 seconds (cached after first load)
- Geometry creation: <0.1 seconds
- Visualization update: <0.1 seconds
- Moment-curvature calculation: ~0.5-2 seconds (depends on convergence)
- Bending capacity calculation: <0.1 seconds
- Use Web Workers for calculations to avoid UI blocking (future enhancement)
- Cache visualization data to avoid redundant Python calls

## UI/UX Best Practices

### User Experience
- Auto-save state to localStorage (persist across sessions)
- Undo/redo capability for reinforcement changes (future)
- Keyboard shortcuts for common actions
- Responsive design (mobile-friendly)
- Tooltips for technical terms
- Progress indicators for long operations

### Visual Feedback
- Real-time validation indicators (green checkmark, red X)
- Highlight edited items in list
- Confirm dialogs for destructive actions (delete, reset)
- Success/error toast notifications
- Loading spinners during calculations

## Notes

- All dimensions in mm (millimeters)
- All stresses in MPa (megapascals)
- Moments displayed in kNm (kilonewton-meters)
- Coordinate system: Section centroid at origin
  - X-axis: horizontal (positive right)
  - Y-axis: vertical (positive up)
  - Bottom of section: y = -height/2
  - Top of section: y = +height/2
- Rectangular section only for initial implementation
- Support for both tension (bottom) and compression (top) reinforcement

## Appendix: Helper Functions Reference

### From helperfunctions.py

```python
# Boundary extraction
get_bottom_boundary_of_rectangle(geometry) -> np.ndarray  # shape (2,2)
get_top_boundary_of_rectangle(geometry) -> np.ndarray
get_left_boundary_of_rectangle(geometry) -> np.ndarray
get_right_boundary_of_rectangle(geometry) -> np.ndarray

# Reinforcement line generation
generate_reinforcement_line_coords_with_cover(
    boundary_coords,      # np.ndarray (2,2): [[x1,y1], [x2,y2]]
    boundary_cover,       # float: perpendicular offset
    start_cover=None,     # float: offset from start (optional)
    end_cover=None        # float: offset from end (optional)
) -> np.ndarray  # Returns (2,2) array of line endpoints with cover applied

# Rebar area calculation
get_rebar_area(geometry_or_section) -> float  # Total reinforcement area in mm²
```

### Usage Example in concrete_bending.py

```python
from helperfunctions import (
    get_bottom_boundary_of_rectangle,
    generate_reinforcement_line_coords_with_cover
)

# Get bottom edge coordinates
boundary = get_bottom_boundary_of_rectangle(geometry)
# Returns: np.array([[-500, -175], [500, -175]]) for 1000x350 section

# Calculate line endpoints with cover
line_coords = generate_reinforcement_line_coords_with_cover(
    boundary,
    boundary_cover=50,
    start_cover=50,   # Optional, for second layer, etc.
    end_cover=50      # Optional
)
# Returns: np.array([[-450, -125], [450, -125]])

# Add reinforcement line
geometry = add_reinforcement_line(
    geometry,
    line_coords[0],  # start point
    line_coords[1],  # end point
    diameter=12,
    s=100,           # spacing
    material=reinforcement
)
```
