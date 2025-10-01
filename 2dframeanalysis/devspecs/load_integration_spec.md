# Load Integration Specification

## Overview
This document describes how to enhance the load system in the 2D Frame Analysis tool to support distributed loads and point loads on elements, in addition to the existing nodal loads. Users should be able to select different load types and apply them appropriately.

## Current Implementation

### Existing Load System
- **Load type**: Point loads at nodes only
- **Input fields**: Node, Fx (kN), Fy (kN), Mz (kNm)
- **Grid layout**: Simple input grid with fixed columns

### Limitations
- Cannot apply distributed loads (uniform or varying) along elements
- Cannot apply point loads at arbitrary positions along elements (only at nodes)
- Requires manual conversion of distributed loads to equivalent nodal forces

## Proposed Load System

### Three Load Types

#### 1. Nodal Load (Point load at node) - EXISTING
Load applied at a specific node.

**PyNite Method**: `add_node_load(node_name, direction, P, case='Case 1')`

**Parameters:**
- `node_name` (str): Name of the node where load is applied
- `direction` (str): Global direction - `'FX'`, `'FY'`, `'FZ'` for forces; `'MX'`, `'MY'`, `'MZ'` for moments
- `P` (float): Magnitude of load
- `case` (str): Load case name (default: 'Case 1')

**UI Fields:**
- Node (dropdown of available nodes)
- Fx (kN) - horizontal force
- Fy (kN) - vertical force
- Mz (kNm) - moment about z-axis

#### 2. Member Distributed Load - NEW
Distributed load applied along element length. Can be uniform or linearly varying.

**PyNite Method**: `add_member_dist_load(member_name, direction, w1, w2, x1=None, x2=None, case='Case 1')`

**Parameters:**
- `member_name` (str): Name of element
- `direction` (str): Load direction
  - Local: `'Fx'`, `'Fy'`, `'Fz'` (lowercase = element local coordinates)
  - Global: `'FX'`, `'FY'`, `'FZ'` (uppercase = global coordinates)
- `w1` (float): Load magnitude at start (force/length units)
- `w2` (float): Load magnitude at end (force/length units)
- `x1` (float, optional): Start position along element (default: 0)
- `x2` (float, optional): End position along element (default: element length)
- `case` (str): Load case name



**UI Fields:**
- Element (dropdown)
- Direction (dropdown):
  - `'FY'` - Global Y (most common for gravity)
  - `'FX'` - Global X
  - `'Fy'` - Local perpendicular (perpendicular to element)
  - `'Fx'` - Local axial (along element)
- w1 (kN/m) - magnitude at start
- w2 (kN/m) - magnitude at end
- x1 (m) - start position along element (default: 0)
- x2 (m) - end position along element (default: element length)

**Behavior:**
- When w1 is changed, w2 automatically updates to match → creates uniform load by default
- User can manually change w2 to create linearly varying load
- If w2 is manually changed, w1 is NOT auto-updated
- x1 defaults to 0 (element start)
- x2 defaults to element length (auto-calculated when element is selected)
- When element is selected/changed, x2 automatically updates to element length
- x1 and x2 are fully exposed in the UI for partial distributed loads

**Validation:**
- x1 must be ≥ 0
- x2 must be ≤ element length
- x1 must be < x2 (strictly less than, not equal)
- Show error notification if load extends outside element bounds
- Highlight invalid fields with red border

#### 3. Member Point Load - NEW
Point load applied at any position along an element.

**PyNite Method**: `add_member_pt_load(member_name, direction, P, x, case='Case 1')`

**Parameters:**
- `member_name` (str): Name of element
- `direction` (str): Load direction
  - Local: `'Fx'`, `'Fy'`, `'Fz'`, `'Mx'`, `'My'`, `'Mz'`
  - Global: `'FX'`, `'FY'`, `'FZ'`, `'MX'`, `'MY'`, `'MZ'`
- `P` (float): Load magnitude
- `x` (float): Distance from element start along local x-axis
- `case` (str): Load case name

**UI Fields:**
- Element (dropdown)
- Distance (m) - distance from element start node
- Direction (dropdown): `'FX'`, `'FY'`, `'MZ'` (simplified for 2D)
- Magnitude (kN or kNm) - load value

**Validation:**
- Distance must be > 0 (not at element start)
- Distance must be < element length (not at element end, use nodal loads for end points)
- Show error notification if load position is outside element bounds
- Highlight invalid field with red border
- Check element length using PyNite member `.L()` method if available, or calculate from node coordinates

## User Interface Design

### UI Organization: Separate Sections

Three distinct sections under a "Loads" heading, each with its own input grid and "Add" button:

```
┌─────────────────────────────────────────────────────────┐
│ Loads                                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Nodal Loads (at nodes)                                  │
├─────────────────────────────────────────────────────────┤
│ Load | Node  | Fx (kN) | Fy (kN) | Mz (kNm) | [Action]│
├─────────────────────────────────────────────────────────┤
│ L1   | [N2▾] | 0       | -10     | 0        | [Remove]│
│ L2   | [N3▾] | 5       | 0       | 0        | [Remove]│
└─────────────────────────────────────────────────────────┘
[+ Add Nodal Load]

┌─────────────────────────────────────────────────────────────────────────────────┐
│ Distributed Loads (on elements)                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Load | Element | Direction | w1 (kN/m) | w2 (kN/m) | x1 (m) | x2 (m) | [Action]│
├─────────────────────────────────────────────────────────────────────────────────┤
│ D1   | [E1▾]  | [FY▾]     | -5.0      | -5.0      | 0      | 10.0   | [Remove]│
│ D2   | [E2▾]  | [Fy▾]     | -10.0     | -2.0      | 0      | 8.0    | [Remove]│
└─────────────────────────────────────────────────────────────────────────────────┘
[+ Add Distributed Load]

┌─────────────────────────────────────────────────────────────────┐
│ Element Point Loads (on elements)                               │
├─────────────────────────────────────────────────────────────────┤
│ Load | Element | Dist (m) | Direction | Magnitude | [Action]    │
├─────────────────────────────────────────────────────────────────┤
│ P1   | [E1▾]  | 5.0      | [FY▾]     | -20       | [Remove]    │
└─────────────────────────────────────────────────────────────────┘
[+ Add Element Point Load]
```

### Grid Styling
- Use similar styling to elements grid with smaller fonts (`text-xs`)
- Separate CSS classes for each load type grid:
  - `.nodal-load-grid`
  - `.distributed-load-grid`
  - `.element-load-grid`
- Collapsible sections (optional enhancement)

### Direction Dropdowns

**For Distributed Loads:**
```javascript
const distributedLoadDirections = {
    'FY': 'Global Y (↓ gravity)',
    'FX': 'Global X (→)',
    'Fy': 'Local ⊥ (perpendicular)',
    'Fx': 'Local ∥ (axial)'
};
```

**For Element Point Loads:**
```javascript
const elementPointLoadDirections = {
    'FY': 'Vertical (Y)',
    'FX': 'Horizontal (X)',
    'MZ': 'Moment (Z)'
};
```

## Implementation Details

### Data Structure

Update the load collection to support different load types:

```javascript
let frameData = {
    nodes: [],
    elements: [],
    loads: {
        nodal: [],          // Point loads at nodes
        distributed: [],    // Distributed loads on elements
        elementPoint: []    // Point loads on elements
    }
};
```

**Nodal Load Object:**
```javascript
{
    name: 'L1',
    type: 'nodal',
    node: 'N2',
    fx: 0,      // kN
    fy: -10,    // kN
    mz: 0       // kNm
}
```

**Distributed Load Object:**
```javascript
{
    name: 'D1',
    type: 'distributed',
    element: 'E1',
    direction: 'FY',    // 'FX', 'FY', 'Fx', 'Fy'
    w1: -5.0,           // kN/m at start
    w2: -5.0,           // kN/m at end
    x1: 0,              // m from element start (default: 0)
    x2: 10.0            // m from element start (default: element length)
}
```

**Element Point Load Object:**
```javascript
{
    name: 'P1',
    type: 'elementPoint',
    element: 'E1',
    distance: 5.0,      // m from element start
    direction: 'FY',    // 'FX', 'FY', 'MZ'
    magnitude: -20      // kN or kNm
}
```

### Input Functions

Create separate add functions for each load type:

```javascript
function addNodalLoad() { }
function addDistributedLoad() { }
function addElementPointLoad() { }
```

Each function creates the appropriate input row with correct fields and event listeners.

### Auto-sync for Distributed Loads

Implement w1→w2 synchronization and x2 auto-update:

```javascript
// Get element length from nodes
function getElementLength(elementName) {
    const elements = getElementsFromInputs();
    const element = elements.find(e => e.name === elementName);
    if (!element) return null;

    const nodes = getNodesFromInputs();
    const nodeI = nodes.find(n => n.name === element.nodeI);
    const nodeJ = nodes.find(n => n.name === element.nodeJ);

    if (!nodeI || !nodeJ) return null;

    const dx = parseFloat(nodeJ.x) - parseFloat(nodeI.x);
    const dy = parseFloat(nodeJ.y) - parseFloat(nodeI.y);
    return Math.sqrt(dx * dx + dy * dy);
}

// Handle element selection change for distributed loads
function onDistributedLoadElementChange(loadId) {
    const loadDiv = document.getElementById(loadId);
    const elementSelect = loadDiv.querySelector('.dist-element');
    const x2Input = loadDiv.querySelector('.dist-x2');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);

    if (elementLength !== null) {
        // Auto-update x2 to element length
        x2Input.value = elementLength.toFixed(3);
    }
}

// w1 → w2 auto-sync for uniform loads
function onDistributedLoadW1Change(loadId) {
    const loadDiv = document.getElementById(loadId);
    const w1Input = loadDiv.querySelector('.dist-w1');
    const w2Input = loadDiv.querySelector('.dist-w2');

    // Only auto-sync if w2 hasn't been manually edited
    if (!w2Input.dataset.manuallyEdited) {
        w2Input.value = w1Input.value;
    }
}

// Mark w2 as manually edited when user changes it
function onDistributedLoadW2Change(loadId) {
    const loadDiv = document.getElementById(loadId);
    const w2Input = loadDiv.querySelector('.dist-w2');

    // Mark as manually edited
    w2Input.dataset.manuallyEdited = 'true';
}

// Validate distributed load position
function validateDistributedLoadPosition(loadId) {
    const loadDiv = document.getElementById(loadId);
    const elementSelect = loadDiv.querySelector('.dist-element');
    const x1Input = loadDiv.querySelector('.dist-x1');
    const x2Input = loadDiv.querySelector('.dist-x2');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);
    const x1 = parseFloat(x1Input.value);
    const x2 = parseFloat(x2Input.value);

    let isValid = true;
    let errors = [];

    if (x1 < 0) {
        errors.push('x1 must be ≥ 0');
        isValid = false;
    }

    if (elementLength !== null && x2 > elementLength) {
        errors.push(`x2 must be ≤ ${elementLength.toFixed(3)} m (element length)`);
        isValid = false;
    }

    if (x1 >= x2) {
        errors.push('x1 must be < x2');
        isValid = false;
    }

    // Update UI to show validation state
    if (!isValid) {
        if (x1 < 0 || x1 >= x2) x1Input.classList.add('border-red-500');
        else x1Input.classList.remove('border-red-500');

        if ((elementLength !== null && x2 > elementLength) || x1 >= x2)
            x2Input.classList.add('border-red-500');
        else x2Input.classList.remove('border-red-500');
    } else {
        x1Input.classList.remove('border-red-500');
        x2Input.classList.remove('border-red-500');
    }

    return { isValid, errors };
}

// Validate element point load position
function validateElementPointLoadPosition(loadId) {
    const loadDiv = document.getElementById(loadId);
    const elementSelect = loadDiv.querySelector('.elem-pt-element');
    const distanceInput = loadDiv.querySelector('.elem-pt-distance');

    const elementName = elementSelect.value;
    const elementLength = getElementLength(elementName);
    const distance = parseFloat(distanceInput.value);

    let isValid = true;
    let errors = [];

    if (distance <= 0) {
        errors.push('Distance must be > 0 (use nodal load for element start)');
        isValid = false;
    }

    if (elementLength !== null && distance >= elementLength) {
        errors.push(`Distance must be < ${elementLength.toFixed(3)} m (use nodal load for element end)`);
        isValid = false;
    }

    // Update UI to show validation state
    if (!isValid) {
        distanceInput.classList.add('border-red-500');
    } else {
        distanceInput.classList.remove('border-red-500');
    }

    return { isValid, errors };
}
```

### Collection Functions

Update load collection to handle all types:

```javascript
function getLoadsFromInputs() {
    return {
        nodal: getNodalLoadsFromInputs(),
        distributed: getDistributedLoadsFromInputs(),
        elementPoint: getElementPointLoadsFromInputs()
    };
}

function getNodalLoadsFromInputs() {
    const loads = [];
    document.querySelectorAll('#nodal-loads-container > div').forEach(div => {
        // ... extract nodal load data
    });
    return loads;
}

function getDistributedLoadsFromInputs() {
    const loads = [];
    document.querySelectorAll('#distributed-loads-container > div').forEach(div => {
        // ... extract distributed load data
    });
    return loads;
}

function getElementPointLoadsFromInputs() {
    const loads = [];
    document.querySelectorAll('#element-loads-container > div').forEach(div => {
        // ... extract element point load data
    });
    return loads;
}
```

### PyNite Integration

Update the Python analysis code to apply all load types:

```python
# In analyze_frame function

# Apply nodal loads
for load in loads['nodal']:
    if load['fx'] != 0:
        model.add_node_load(load['node'], 'FX', load['fx'] * 1000)  # kN → N
    if load['fy'] != 0:
        model.add_node_load(load['node'], 'FY', load['fy'] * 1000)
    if load['mz'] != 0:
        model.add_node_load(load['node'], 'MZ', load['mz'] * 1000)

# Apply distributed loads
for load in loads['distributed']:
    w1_N = load['w1'] * 1000  # kN/m → N/m
    w2_N = load['w2'] * 1000
    model.add_member_dist_load(
        load['element'],
        load['direction'],
        w1_N,
        w2_N,
        x1=load.get('x1'),
        x2=load.get('x2')
    )

# Apply element point loads
for load in loads['elementPoint']:
    magnitude_N = load['magnitude'] * 1000  # kN → N (or kNm → Nm)
    model.add_member_pt_load(
        load['element'],
        load['direction'],
        magnitude_N,
        load['distance']
    )
```

## Unit Conversions

### From UI to PyNite
- Forces: kN → N (multiply by 1000)
- Moments: kNm → Nm (multiply by 1000)
- Distributed loads: kN/m → N/m (multiply by 1000)
- Distances: m → m (no conversion)

### Display Conventions
- Positive Fx = rightward
- Positive Fy = upward
- Negative Fy = downward (gravity)
- Positive Mz = counter-clockwise

## Load Visualization

### Visual Design

**Nodal Loads:**
- Red arrow for Fx
- Blue arrow for Fy
- Purple circular arrow for Mz
- Arrow length proportional to magnitude
- Label showing magnitude near arrow

**Distributed Loads:**
- Series of small green arrows along element
- Uniform load: equal-length arrows
- Varying load: arrow lengths vary linearly
- Annotation at element midpoint showing w1, w2 values

**Element Point Loads:**
- Single orange arrow at specified position
- Small circle marker at load position
- Label showing magnitude and distance

### Hover Tooltips

Add hover information for each load showing:
- Load name and type
- All parameters (node/element, direction, magnitudes)
- Converted values (N, N/m)

## HTML Structure Updates

Add three new containers in the HTML:

```html
<!-- Loads Section -->
<div class="bg-gray-700 rounded-lg p-4">
    <h3 class="text-lg font-semibold text-white mb-3">Loads</h3>

    <!-- Nodal Loads -->
    <div class="mb-6">
        <h4 class="text-md font-semibold text-gray-300 mb-2">Nodal Loads (at nodes)</h4>
        <div class="nodal-load-grid-header">
            <label class="text-gray-300 text-xs">Load</label>
            <label class="text-gray-300 text-xs">Node</label>
            <label class="text-gray-300 text-xs">Fx (kN)</label>
            <label class="text-gray-300 text-xs">Fy (kN)</label>
            <label class="text-gray-300 text-xs">Mz (kNm)</label>
            <div></div>
        </div>
        <div id="nodal-loads-container"></div>
        <button onclick="addNodalLoad()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm mt-2">
            Add Nodal Load
        </button>
    </div>

    <!-- Distributed Loads -->
    <div class="mb-6">
        <h4 class="text-md font-semibold text-gray-300 mb-2">Distributed Loads (on elements)</h4>
        <div class="distributed-load-grid-header">
            <label class="text-gray-300 text-xs">Load</label>
            <label class="text-gray-300 text-xs">Element</label>
            <label class="text-gray-300 text-xs">Direction</label>
            <label class="text-gray-300 text-xs">w1 (kN/m)</label>
            <label class="text-gray-300 text-xs">w2 (kN/m)</label>
            <label class="text-gray-300 text-xs">x1 (m)</label>
            <label class="text-gray-300 text-xs">x2 (m)</label>
            <div></div>
        </div>
        <div id="distributed-loads-container"></div>
        <button onclick="addDistributedLoad()" class="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm mt-2">
            Add Distributed Load
        </button>
    </div>

    <!-- Element Point Loads -->
    <div class="mb-6">
        <h4 class="text-md font-semibold text-gray-300 mb-2">Element Point Loads</h4>
        <div class="element-load-grid-header">
            <label class="text-gray-300 text-xs">Load</label>
            <label class="text-gray-300 text-xs">Element</label>
            <label class="text-gray-300 text-xs">Dist (m)</label>
            <label class="text-gray-300 text-xs">Direction</label>
            <label class="text-gray-300 text-xs">Magnitude</label>
            <div></div>
        </div>
        <div id="element-loads-container"></div>
        <button onclick="addElementPointLoad()" class="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm mt-2">
            Add Element Point Load
        </button>
    </div>
</div>
```

## CSS Grid Definitions

```css
.nodal-load-grid-header, .nodal-load-grid {
    display: grid;
    grid-template-columns: 60px 100px 80px 80px 80px 80px;
    gap: 8px;
    align-items: center;
}

.distributed-load-grid-header, .distributed-load-grid {
    display: grid;
    grid-template-columns: 60px 100px 140px 90px 90px 70px 70px 80px;
    gap: 8px;
    align-items: center;
}

.element-load-grid-header, .element-load-grid {
    display: grid;
    grid-template-columns: 60px 100px 80px 120px 100px 80px;
    gap: 8px;
    align-items: center;
}
```

## Example Updates

### Update Existing Examples
Modify `loadCantileverExample()` and `loadPortalExample()` to use new structure:

```javascript
// Old
addLoad();
document.querySelector('#load-1 .load-node').value = 'N2';
// ...

// New
addNodalLoad();
document.querySelector('#nodal-load-1 .load-node').value = 'N2';
// ...
```

### Create New Examples

**Simply Supported Beam with UDL:**
```javascript
function loadUDLBeamExample() {
    clearAll();

    // Add nodes
    addNode(); // N1 at x=0
    addNode(); // N2 at x=10

    // Set node positions and supports
    document.querySelector('#node-1 .node-x').value = '0';
    document.querySelector('#node-1 .node-support').value = 'pinned';
    document.querySelector('#node-2 .node-x').value = '10';
    document.querySelector('#node-2 .node-support').value = 'roller';

    // Add element
    addElement();
    document.querySelector('#element-1 .element-i').value = 'N1';
    document.querySelector('#element-1 .element-j').value = 'N2';

    // Add distributed load
    addDistributedLoad();
    document.querySelector('#distributed-load-1 .dist-element').value = 'E1';
    document.querySelector('#distributed-load-1 .dist-direction').value = 'FY';
    document.querySelector('#distributed-load-1 .dist-w1').value = '-10';
    // w2 will auto-sync to -10
}
```

## Validation

### Rules

**Nodal Loads:**
- Node must exist
- At least one of fx, fy, or mz must be non-zero

**Distributed Loads:**
- Element must exist
- w1 and w2 cannot both be zero
- x1 must be ≥ 0
- x2 must be ≤ element length
- x1 must be < x2 (strictly less than, cannot be equal)
- Show error notification if load extends outside element bounds

**Element Point Loads:**
- Element must exist
- Distance must be > 0 (not at element start - use nodal load instead)
- Distance must be < element length (not at element end - use nodal load instead)
- Magnitude cannot be zero
- Show error notification if load position is outside element bounds

### Error Display
- Show validation errors below input fields or in tooltip
- Highlight invalid fields with red border (`border-red-500`)
- Display error count in console output
- Prevent analysis from running if validation errors exist
- Show summary of validation errors before analysis

## Backward Compatibility

Existing models with old load structure:
```javascript
loads: [
    { name: 'L1', node: 'N1', fx: 0, fy: -10, mz: 0 }
]
```

Should auto-convert to new structure:
```javascript
loads: {
    nodal: [
        { name: 'L1', type: 'nodal', node: 'N1', fx: 0, fy: -10, mz: 0 }
    ],
    distributed: [],
    elementPoint: []
}
```

Add migration function:
```javascript
function migrateLoadsToNewStructure(loads) {
    if (Array.isArray(loads)) {
        return {
            nodal: loads.map(l => ({ ...l, type: 'nodal' })),
            distributed: [],
            elementPoint: []
        };
    }
    return loads;
}
```

## Testing Checklist

- [ ] Nodal loads apply correctly (existing functionality)
- [ ] Distributed uniform load applies correctly
- [ ] Distributed varying load applies correctly
- [ ] w1→w2 auto-sync works for uniform loads
- [ ] Manual w2 edit breaks auto-sync
- [ ] Element point load applies at correct position
- [ ] All directions work (FX, FY, Fx, Fy, MZ)
- [ ] Loads visualize correctly
- [ ] Hover tooltips show load information
- [ ] Results match hand calculations
- [ ] Example functions work
- [ ] Validation catches errors
- [ ] Units convert correctly

## Future Enhancements (Out of Scope)

- Load cases (Dead, Live, Wind, etc.)
- Load combinations (1.2D + 1.6L)
- Temperature loads
- Support settlement
- Partial distributed loads (x1, x2 exposed in UI)
- Load patterns and templates
