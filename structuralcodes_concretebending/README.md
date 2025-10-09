# Concrete Bending Analysis Tool

Browser-based concrete bending analysis using [structuralcodes](https://github.com/structuralcodes/structuralcodes) and Pyodide.

## Features

- **Interactive UI**: Build rectangular concrete sections with flexible reinforcement input
- **Two reinforcement modes**:
  - Single bars: Place individual rebars at exact coordinates
  - Rebar lines: Define reinforcement layers along section boundaries with automatic spacing
- **Live visualization**: D3.js cross-section plot updates in real-time
- **Complete analysis**: Moment-curvature response and ultimate bending capacity
- **Eurocode 2**: Calculations according to EC2 2004
- **Browser-based**: All calculations run in your browser via Pyodide (Python in WebAssembly)

## Usage

### Quick Start

1. Open `index.html` in a modern web browser
2. Wait for Pyodide to load (~20-30 seconds first time, cached afterwards)
3. Adjust material properties and section dimensions
4. Add reinforcement using either:
   - **Single Bar tab**: Specify x, y coordinates and diameter
   - **Rebar Line tab**: Select boundary (bottom/top/left/right), spacing, and covers
5. Click **Calculate** to run analysis

### Material Properties

- **f<sub>ck</sub>**: Characteristic concrete compressive strength (12-90 MPa)
- **f<sub>yk</sub>**: Characteristic yield strength of reinforcement (400-600 MPa)
- **f<sub>tk</sub>**: Characteristic tensile strength of reinforcement (450-700 MPa)
- **ε<sub>suk</sub>**: Characteristic strain at maximum load (0.025-0.1)

### Section Geometry

- **Width**: Section width in mm (100-5000 mm)
- **Height**: Section height in mm (100-3000 mm)

### Reinforcement Input

#### Single Bar Mode
- **X Position**: Horizontal distance from section centroid (mm)
- **Y Position**: Vertical distance from section centroid (mm, negative = bottom)
- **Diameter**: Bar diameter (8, 10, 12, 16, 20, 25, 32, 40 mm)

#### Rebar Line Mode
- **Boundary**: Edge to place reinforcement (bottom, top, left, right)
- **Diameter**: Bar diameter (8, 10, 12, 16, 20, 25, 32, 40 mm)
- **Spacing**: Center-to-center spacing between bars (50-500 mm)
- **Boundary Cover**: Perpendicular distance from edge (15-100 mm)
- **Start/End Cover**: Optional offsets from corners (defaults to boundary cover)

**Cover Settings Guide:**
- **Boundary cover**: Distance perpendicular to the boundary edge
- **Start cover**: Offset from the starting corner along the boundary
- **End cover**: Offset from the ending corner along the boundary
- Leave start/end blank to use the same value as boundary cover

### Results

The tool provides:
- **M<sub>Rd,y</sub>**: Moment capacity about y-axis (kNm)
- **M<sub>Rd,z</sub>**: Moment capacity about z-axis (kNm)
- **Section properties**: Area, reinforcement ratio, number of bars
- **Moment-curvature plot**: Interactive plot showing full response
- **Cross-section visualization**: Real-time plot of section geometry with rebars

## Testing Python Module

The calculation module can be tested independently:

```bash
cd structuralcodes_concretebending
python concrete_bending.py
```

This runs two test cases:
1. Five individual bars placed manually
2. Reinforcement line along bottom edge (matches example from structuralcodes docs)

## Files

- `index.html`: UI layout and structure
- `script.js`: Pyodide initialization, UI logic, D3.js visualization
- `concrete_bending.py`: Pure Python calculation module (testable standalone)
- `helperfunctions.py`: Utility functions for geometry and reinforcement
- `devspecs/spec.md`: Complete technical specification

## Architecture

### Separation of Concerns

1. **Python layer** (`concrete_bending.py`):
   - Material creation using structuralcodes
   - Section geometry assembly (RectangularGeometry → CompoundGeometry)
   - Reinforcement placement (single bars and lines)
   - Analysis calculations (moment-curvature, bending capacity)
   - Can be run and tested independently

2. **JavaScript layer** (`script.js`):
   - Pyodide initialization and package loading
   - UI event handling
   - State management for reinforcement list
   - D3.js visualization
   - Python-JavaScript bridge

3. **UI layer** (`index.html`):
   - Form inputs for all parameters
   - Tabbed reinforcement input
   - Editable reinforcement list with delete buttons
   - Results display panels
   - Cross-section and M-κ plots

### How Geometry is Built

Understanding the structuralcodes API flow:

1. Create base `RectangularGeometry(width, height, material=concrete)`
2. Add reinforcement using:
   - `add_reinforcement(geometry, coords, diameter, material)` for single bars
   - `add_reinforcement_line(geometry, start, end, diameter, spacing, material)` for lines
3. Each addition returns a new `CompoundGeometry` containing:
   - `surface_geometries`: The concrete polygons
   - `point_geometries`: Individual rebar points
4. Wrap in `GenericSection(geometry)`
5. Run calculations on section

Behind the scenes, the entire Python script re-runs on every UI change, but the user experiences smooth editing of individual bars/groups.

## Dependencies

### Browser-side
- **Pyodide**: Python runtime in WebAssembly
- **D3.js v7**: Cross-section visualization
- **Plotly.js**: Moment-curvature plots
- **Tailwind CSS**: Styling

### Python packages (auto-installed via Pyodide)
- **structuralcodes**: Core analysis engine
- **numpy**: Numerical computing
- **shapely**: Geometric operations

## Coordinate System

- **Origin**: Section centroid
- **X-axis**: Horizontal (positive = right)
- **Y-axis**: Vertical (positive = up)
- **Bottom edge**: y = -height/2
- **Top edge**: y = +height/2

For a 1000×350 mm section:
- Bottom at y = -175 mm
- Top at y = +175 mm
- Left at x = -500 mm
- Right at x = +500 mm

## Examples

### Example 1: Bottom reinforcement layer

Add a reinforcement line using the Rebar Line tab:
- Boundary: `bottom`
- Diameter: `12 mm`
- Spacing: `100 mm`
- Boundary Cover: `50 mm`
- Start/End Cover: (leave blank)

This creates a layer of φ12 bars at 100mm spacing, 50mm from the bottom edge and 50mm from each side.

### Example 2: Top and bottom reinforcement

Add two rebar lines:

**Bottom layer:**
- Boundary: `bottom`
- Diameter: `20 mm`
- Spacing: `150 mm`
- Boundary Cover: `40 mm`

**Top layer:**
- Boundary: `top`
- Diameter: `12 mm`
- Spacing: `200 mm`
- Boundary Cover: `40 mm`

### Example 3: Mixed reinforcement

Combine individual bars and lines:

**Corner bars** (using Single Bar tab):
- Bar 1: x=-450, y=-150, φ20
- Bar 2: x=450, y=-150, φ20
- Bar 3: x=-450, y=150, φ16
- Bar 4: x=450, y=150, φ16

**Bottom layer** (using Rebar Line tab):
- Boundary: `bottom`
- Diameter: `12 mm`
- Spacing: `100 mm`
- Boundary Cover: `40 mm`
- Start Cover: `100 mm` (to avoid corner bars)
- End Cover: `100 mm`

## Browser Compatibility

Requires a modern browser with WebAssembly support:
- Chrome/Edge 89+
- Firefox 78+
- Safari 14.1+

## Performance

- **Initial load**: 20-30 seconds (first time, packages downloaded and cached)
- **Subsequent loads**: 5-10 seconds (cached packages)
- **Visualization update**: <0.1 seconds
- **Analysis calculation**: 0.5-2 seconds (depends on section complexity)

## Future Enhancements

See `devspecs/spec.md` for planned features:
- M-N interaction diagrams
- Non-rectangular sections (T-beams, L-beams)
- Multiple design codes (ACI 318, AS3600, etc.)
- Visual bar placement (click to add)
- Shear capacity checks
- Export to PDF report

## Credits

Built with:
- [structuralcodes](https://github.com/structuralcodes/structuralcodes) by structuralcodes team
- [Pyodide](https://pyodide.org/) by Mozilla
- [D3.js](https://d3js.org/) by Mike Bostock
- [Plotly](https://plotly.com/javascript/)

## License

See main repository for license information.
