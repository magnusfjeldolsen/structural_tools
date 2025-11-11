# 2D Frame Analysis - JSON API Documentation

## Overview

The 2D Frame Analysis tool now supports a JSON-based "API-like" workflow that allows you to:
- Export complete projects as JSON files
- Edit projects in any text editor (VS Code, Notepad++, etc.)
- Import projects via file upload or drag & drop
- Share projects with colleagues
- Version control your structural models with Git

## JSON Structure

### Complete Project Format

```json
{
  "version": "1.0",
  "metadata": {
    "exportDate": "2025-10-28T12:00:00.000Z",
    "description": "2D Frame Analysis Project"
  },
  "nodes": [...],
  "elements": [...],
  "loads": {...},
  "loadCases": [...],
  "loadCombinations": [...]
}
```

### Nodes

Each node defines a point in the frame:

```json
{
  "name": "N1",
  "x": 0,
  "y": 0,
  "support": "fixed"
}
```

**Properties:**
- `name` (string, required): Unique node identifier (e.g., "N1", "N2")
- `x` (number, required): X coordinate in meters
- `y` (number, required): Y coordinate in meters
- `support` (string, optional): Support type
  - `"free"` - No support (default)
  - `"fixed"` - Fixed support (restrained in all DOFs)
  - `"pinned"` - Pinned support (restrained in X, Y, Z translation)
  - `"roller_x"` - Roller in X direction (free to move in X)
  - `"roller_y"` - Roller in Y direction (free to move in Y)

### Elements

Each element connects two nodes:

```json
{
  "name": "E1",
  "nodeI": "N1",
  "nodeJ": "N2",
  "E": 200,
  "sectionType": "IPE",
  "profile": "IPE200",
  "axis": "strong",
  "I": 0.00001943,
  "A": 0.00284
}
```

**Properties:**
- `name` (string, required): Unique element identifier
- `nodeI` (string, required): Start node name (must exist in nodes array)
- `nodeJ` (string, required): End node name (must exist in nodes array)
- `E` (number, required): Young's modulus in GPa (typically 200 for steel)
- `sectionType` (string, optional): Section type
  - `"Custom"` - Custom section (manual I and A)
  - `"IPE"`, `"HEA"`, `"HEB"`, `"HEM"` - European I-beams
  - `"CCHS"`, `"CRHS"`, `"CSHS"` - Hollow sections
- `profile` (string, optional): Profile name from database (e.g., "IPE200")
- `axis` (string, optional): Bending axis
  - `"strong"` - Strong axis (y-y)
  - `"weak"` - Weak axis (z-z)
- `I` (number, required): Second moment of area in m⁴
- `A` (number, required): Cross-sectional area in m²

### Loads

Loads are organized by type:

```json
{
  "nodal": [...],
  "distributed": [...],
  "elementPoint": [...]
}
```

#### Nodal Loads (Point loads at nodes)

```json
{
  "case": "Dead",
  "node": "N2",
  "Fx": 0,
  "Fy": -10,
  "Mz": 0
}
```

**Properties:**
- `case` (string, required): Load case name
- `node` (string, required): Node name where load is applied
- `Fx` (number, optional): Force in X direction (kN), default 0
- `Fy` (number, optional): Force in Y direction (kN), default 0
- `Mz` (number, optional): Moment about Z axis (kNm), default 0

#### Distributed Loads (On elements)

```json
{
  "case": "Live",
  "element": "E2",
  "direction": "Fy",
  "w1": -5,
  "w2": -5,
  "x1": 0,
  "x2": 6
}
```

**Properties:**
- `case` (string, required): Load case name
- `element` (string, required): Element name
- `direction` (string, required): Load direction
  - `"Fx"` - Global X direction
  - `"Fy"` - Global Y direction
  - `"FxL"` - Local X (along element)
  - `"FyL"` - Local Y (perpendicular to element)
- `w1` (number, required): Load intensity at start (kN/m)
- `w2` (number, required): Load intensity at end (kN/m)
- `x1` (number, required): Start position along element (m)
- `x2` (number, required): End position along element (m)

#### Element Point Loads

```json
{
  "case": "Dead",
  "element": "E1",
  "distance": 2.5,
  "direction": "Fy",
  "magnitude": -20
}
```

**Properties:**
- `case` (string, required): Load case name
- `element` (string, required): Element name
- `distance` (number, required): Distance from start node (m)
- `direction` (string, required): Load direction (same as distributed loads)
- `magnitude` (number, required): Load magnitude (kN or kNm)

### Load Cases

```json
{
  "name": "Dead",
  "type": "Ordinary",
  "durationClass": "Permanent"
}
```

**Properties:**
- `name` (string, required): Unique load case name
- `type` (string, optional): Load type (e.g., "Ordinary")
- `durationClass` (string, optional): Duration class (e.g., "Permanent")

### Load Combinations

```json
{
  "name": "ULS-1",
  "comboTag": "ULS",
  "factors": {
    "Dead": 1.35,
    "Live": 1.5
  }
}
```

**Properties:**
- `name` (string, required): Unique combination name
- `comboTag` (string, required): Combination type
  - `"ULS"` - Ultimate Limit State
  - `"ALS"` - Accidental Limit State
  - `"Characteristic"` - Serviceability (Characteristic)
  - `"Frequent"` - Serviceability (Frequent)
  - `"Quasi-Permanent"` - Serviceability (Quasi-Permanent)
- `factors` (object, required): Load case factors (key: load case name, value: factor)

## Usage Examples

### Export a Project

1. Build your frame in the browser interface
2. Click **"📥 Download JSON"** button
3. File is saved as `frame_project_YYYY-MM-DD.json`

### Import a Project

**Method 1: File Upload**
1. Click **"📤 Upload JSON"** button
2. Select your `.json` file
3. Project loads automatically

**Method 2: Drag & Drop**
1. Drag your `.json` file from file explorer
2. Drop it anywhere on the page
3. Project loads automatically (visual feedback when hovering)

### Edit a Project

1. Export your project as JSON
2. Open in any text editor (VS Code recommended)
3. Modify nodes, elements, or loads
4. Save the file
5. Import back into the tool

### Version Control

```bash
# Initialize Git repo
git init my-frame-projects
cd my-frame-projects

# Add your JSON files
git add portal_frame.json cantilever.json

# Commit
git commit -m "Initial frame designs"

# Share with team
git push origin main
```

## Validation

The import function validates:
- ✅ Required fields are present
- ✅ Node coordinates are valid numbers
- ✅ Elements reference existing nodes
- ✅ Load case names match defined cases
- ⚠️ Warnings for missing optional fields (uses defaults)

## Error Messages

Common errors and solutions:

**"Invalid JSON: missing or invalid 'nodes' array"**
- Ensure your JSON has a `nodes` array at the root level

**"Element E1 references non-existent node: N5"**
- Check that all `nodeI` and `nodeJ` values exist in the nodes array

**"Invalid node at index 2: missing name, x, or y"**
- Ensure each node has `name`, `x`, and `y` properties

## Example Files

See `example_portal_frame.json` for a complete working example.

## Tips

1. **Use consistent naming**: Stick to N1, N2... for nodes and E1, E2... for elements
2. **Units matter**: All lengths in meters, forces in kN, moments in kNm
3. **Validate before sharing**: Import your JSON in the tool before sharing to catch errors
4. **Comment with metadata**: Use the `description` field to document your project
5. **Backup frequently**: Export JSON files regularly during design iterations

## API Compatibility

- **Version**: 1.0
- **Backward compatible**: Future versions will maintain compatibility
- **Breaking changes**: Will increment major version number

## Support

For issues or questions:
- Check console for detailed error messages
- Validate JSON syntax at https://jsonlint.com/
- Review example files in the repository
