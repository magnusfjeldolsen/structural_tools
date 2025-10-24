# Excel/Clipboard Import Feature Plan

## Overview

Allow users to copy data from Excel/Python/CSV and paste directly into the browser to populate nodes, elements, and loads.

**User Workflow**:
1. Create structure in Excel/Python → Copy to clipboard
2. Click "Import from Clipboard" in browser
3. Data populates the tables
4. Run analysis as normal

---

## Data Format

### Nodes Table (Tab-separated)
```
Name    X       Y       Support
N1      0       0       fixed
N2      5       0       free
N3      10      0       pinned
N4      5       5       roller_y
```

**Excel Example**:
| Name | X  | Y  | Support  |
|------|----|----|----------|
| N1   | 0  | 0  | fixed    |
| N2   | 5  | 0  | free     |
| N3   | 10 | 0  | pinned   |

### Elements Table (Tab-separated)
```
Name    NodeI   NodeJ   E       I       A
M1      N1      N2      210     0.001   0.01
M2      N2      N3      210     0.001   0.01
```

**Excel Example**:
| Name | NodeI | NodeJ | E   | I     | A    |
|------|-------|-------|-----|-------|------|
| M1   | N1    | N2    | 210 | 0.001 | 0.01 |
| M2   | N2    | N3    | 210 | 0.001 | 0.01 |

### Loads Table (Tab-separated)
```
Name    Type            Node/Element    Case    FX/W1/Mag   FY/W2       MZ      X1      X2      Distance    Direction
L1      nodal           N2              Dead    0           -10000      0       -       -       -           -
D1      distributed     M1              Live    -1000       -1000       -       0       5       -           Fy
P1      elementPoint    M1              Dead    -5000       -           -       -       -       2.5         Fy
```

**Excel Example (Nodal Loads)**:
| Name | Type  | Node | Case | FX | FY     | MZ |
|------|-------|------|------|----|--------|-----|
| L1   | nodal | N2   | Dead | 0  | -10000 | 0  |

**Excel Example (Distributed Loads)**:
| Name | Type        | Element | Case | W1    | W2    | X1 | X2 | Direction |
|------|-------------|---------|------|-------|-------|----|----|-----------|
| D1   | distributed | M1      | Live | -1000 | -1000 | 0  | 5  | Fy        |

**Excel Example (Element Point Loads)**:
| Name | Type         | Element | Case | Magnitude | Distance | Direction |
|------|--------------|---------|------|-----------|----------|-----------|
| P1   | elementPoint | M1      | Dead | -5000     | 2.5      | Fy        |

---

## Implementation

### Step 1: Add Import Buttons to UI

Add buttons above each table section:

```html
<!-- Above Nodes Table -->
<div class="flex gap-2 mb-4">
  <button onclick="importNodesFromClipboard()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">
    📋 Import Nodes from Clipboard
  </button>
  <button onclick="exportNodesToClipboard()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
    📤 Export Nodes to Clipboard
  </button>
  <a href="#" onclick="downloadNodesTemplate(); return false;"
     class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">
    📥 Download Excel Template
  </a>
</div>

<!-- Above Elements Table -->
<div class="flex gap-2 mb-4">
  <button onclick="importElementsFromClipboard()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">
    📋 Import Elements from Clipboard
  </button>
  <button onclick="exportElementsToClipboard()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
    📤 Export Elements to Clipboard
  </button>
  <a href="#" onclick="downloadElementsTemplate(); return false;"
     class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">
    📥 Download Excel Template
  </a>
</div>

<!-- Above Loads Table -->
<div class="flex gap-2 mb-4">
  <button onclick="importLoadsFromClipboard()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">
    📋 Import Loads from Clipboard
  </button>
  <button onclick="exportLoadsToClipboard()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
    📤 Export Loads to Clipboard
  </button>
  <a href="#" onclick="downloadLoadsTemplate(); return false;"
     class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">
    📥 Download Excel Template
  </a>
</div>
```

### Step 2: Add JavaScript Import Functions

```javascript
// ============================================
// CLIPBOARD IMPORT/EXPORT FUNCTIONS
// ============================================

/**
 * Import nodes from clipboard (tab-separated data from Excel)
 */
async function importNodesFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const rows = parseTabSeparatedData(text);

    if (rows.length === 0) {
      alert('No data found in clipboard');
      return;
    }

    // Check if first row is header
    const hasHeader = rows[0][0].toLowerCase() === 'name' ||
                      rows[0][0].toLowerCase() === 'node';
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Clear existing nodes
    frameData.nodes = [];

    // Parse nodes
    for (const row of dataRows) {
      if (row.length < 4) continue; // Skip incomplete rows

      const node = {
        name: row[0].trim(),
        x: parseFloat(row[1]),
        y: parseFloat(row[2]),
        support: row[3].trim().toLowerCase()
      };

      // Validate support type
      const validSupports = ['fixed', 'pinned', 'roller_x', 'roller_y', 'free'];
      if (!validSupports.includes(node.support)) {
        console.warn(`Invalid support type "${node.support}" for node ${node.name}, defaulting to "free"`);
        node.support = 'free';
      }

      frameData.nodes.push(node);
    }

    renderNodesTable();
    updateVisualization();

    alert(`Successfully imported ${frameData.nodes.length} nodes`);

  } catch (err) {
    console.error('Import error:', err);
    alert('Failed to import from clipboard. Make sure you copied tab-separated data (e.g., from Excel).');
  }
}

/**
 * Import elements from clipboard (with validation)
 */
async function importElementsFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const rows = parseTabSeparatedData(text);

    if (rows.length === 0) {
      alert('No data found in clipboard');
      return;
    }

    // Check if first row is header
    const hasHeader = rows[0][0].toLowerCase() === 'name' ||
                      rows[0][0].toLowerCase() === 'element';
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Get existing node names for validation
    const existingNodes = new Set(frameData.nodes.map(n => n.name));

    // Validation results
    const validElements = [];
    const errors = [];
    const warnings = [];

    // Parse elements
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1); // Excel row number

      if (row.length < 6) {
        warnings.push(`Row ${rowNum}: Skipped - incomplete data (need 6 columns)`);
        continue;
      }

      const element = {
        name: row[0].trim(),
        nodeI: row[1].trim(),
        nodeJ: row[2].trim(),
        E: parseFloat(row[3]),
        I: parseFloat(row[4]),
        A: parseFloat(row[5])
      };

      // Validate node references
      const nodeErrors = [];
      if (!existingNodes.has(element.nodeI)) {
        nodeErrors.push(`Start node "${element.nodeI}" does not exist`);
      }
      if (!existingNodes.has(element.nodeJ)) {
        nodeErrors.push(`End node "${element.nodeJ}" does not exist`);
      }

      // Validate numeric values
      if (isNaN(element.E) || element.E <= 0) {
        nodeErrors.push(`Invalid E value: ${row[3]}`);
      }
      if (isNaN(element.I) || element.I <= 0) {
        nodeErrors.push(`Invalid I value: ${row[4]}`);
      }
      if (isNaN(element.A) || element.A <= 0) {
        nodeErrors.push(`Invalid A value: ${row[5]}`);
      }

      if (nodeErrors.length > 0) {
        errors.push(`Row ${rowNum} (${element.name}): ${nodeErrors.join(', ')}`);
      } else {
        validElements.push(element);
      }
    }

    // Show detailed results
    if (errors.length > 0) {
      const errorMsg = `Found ${errors.length} error(s):\n\n` +
                       errors.slice(0, 10).join('\n') +
                       (errors.length > 10 ? `\n\n...and ${errors.length - 10} more errors` : '') +
                       `\n\nValid elements: ${validElements.length}` +
                       `\n\nDo you want to import the ${validElements.length} valid element(s) and skip the errors?`;

      if (!confirm(errorMsg)) {
        return;
      }
    }

    // Import valid elements
    frameData.elements = validElements;

    renderElementsTable();
    updateVisualization();

    // Show summary
    let summary = `Successfully imported ${validElements.length} element(s)`;
    if (errors.length > 0) {
      summary += `\n\nSkipped ${errors.length} element(s) with errors`;
    }
    if (warnings.length > 0) {
      summary += `\n\nWarnings: ${warnings.length}`;
    }
    alert(summary);

  } catch (err) {
    console.error('Import error:', err);
    alert('Failed to import from clipboard. Make sure you copied tab-separated data (e.g., from Excel).');
  }
}

/**
 * Import loads from clipboard (supports all three load types with validation)
 */
async function importLoadsFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const rows = parseTabSeparatedData(text);

    if (rows.length === 0) {
      alert('No data found in clipboard');
      return;
    }

    // Check if first row is header
    const hasHeader = rows[0][0].toLowerCase() === 'name';
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Get existing nodes and elements for validation
    const existingNodes = new Set(frameData.nodes.map(n => n.name));
    const existingElements = new Set(frameData.elements.map(e => e.name));

    // Validation results
    const validLoads = {
      nodal: [],
      distributed: [],
      elementPoint: []
    };
    const errors = [];
    const warnings = [];

    // Parse loads based on type column
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1); // Excel row number

      if (row.length < 4) {
        warnings.push(`Row ${rowNum}: Skipped - incomplete data`);
        continue;
      }

      const loadType = row[1].trim().toLowerCase();
      const loadName = row[0].trim();
      const loadErrors = [];

      if (loadType === 'nodal') {
        // Format: Name, Type, Node, Case, FX, FY, MZ
        const nodeName = row[2].trim();

        if (!existingNodes.has(nodeName)) {
          loadErrors.push(`Node "${nodeName}" does not exist`);
        }

        const load = {
          name: loadName,
          type: 'nodal',
          node: nodeName,
          case: row[3].trim(),
          fx: parseFloat(row[4] || 0),
          fy: parseFloat(row[5] || 0),
          mz: parseFloat(row[6] || 0)
        };

        if (isNaN(load.fx) || isNaN(load.fy) || isNaN(load.mz)) {
          loadErrors.push(`Invalid force values`);
        }

        if (loadErrors.length > 0) {
          errors.push(`Row ${rowNum} (${loadName}): ${loadErrors.join(', ')}`);
        } else {
          validLoads.nodal.push(load);
        }

      } else if (loadType === 'distributed') {
        // Format: Name, Type, Element, Case, W1, W2, X1, X2, Direction
        const elementName = row[2].trim();

        if (!existingElements.has(elementName)) {
          loadErrors.push(`Element "${elementName}" does not exist`);
        }

        const load = {
          name: loadName,
          type: 'distributed',
          element: elementName,
          case: row[3].trim(),
          w1: parseFloat(row[4]),
          w2: parseFloat(row[5]),
          x1: parseFloat(row[6]),
          x2: parseFloat(row[7]),
          direction: row[8].trim()
        };

        if (isNaN(load.w1) || isNaN(load.w2) || isNaN(load.x1) || isNaN(load.x2)) {
          loadErrors.push(`Invalid distributed load values`);
        }

        const validDirections = ['Fx', 'Fy', 'Fz'];
        if (!validDirections.includes(load.direction)) {
          loadErrors.push(`Invalid direction "${load.direction}" (must be Fx, Fy, or Fz)`);
        }

        if (loadErrors.length > 0) {
          errors.push(`Row ${rowNum} (${loadName}): ${loadErrors.join(', ')}`);
        } else {
          validLoads.distributed.push(load);
        }

      } else if (loadType === 'elementpoint') {
        // Format: Name, Type, Element, Case, Magnitude, Distance, Direction
        const elementName = row[2].trim();

        if (!existingElements.has(elementName)) {
          loadErrors.push(`Element "${elementName}" does not exist`);
        }

        const load = {
          name: loadName,
          type: 'elementPoint',
          element: elementName,
          case: row[3].trim(),
          magnitude: parseFloat(row[4]),
          distance: parseFloat(row[5]),
          direction: row[6].trim()
        };

        if (isNaN(load.magnitude) || isNaN(load.distance)) {
          loadErrors.push(`Invalid magnitude or distance values`);
        }

        const validDirections = ['Fx', 'Fy', 'Fz'];
        if (!validDirections.includes(load.direction)) {
          loadErrors.push(`Invalid direction "${load.direction}" (must be Fx, Fy, or Fz)`);
        }

        if (loadErrors.length > 0) {
          errors.push(`Row ${rowNum} (${loadName}): ${loadErrors.join(', ')}`);
        } else {
          validLoads.elementPoint.push(load);
        }

      } else {
        warnings.push(`Row ${rowNum}: Unknown load type "${loadType}" (must be nodal, distributed, or elementPoint)`);
      }
    }

    // Show detailed results
    if (errors.length > 0) {
      const totalValid = validLoads.nodal.length + validLoads.distributed.length + validLoads.elementPoint.length;
      const errorMsg = `Found ${errors.length} error(s):\n\n` +
                       errors.slice(0, 10).join('\n') +
                       (errors.length > 10 ? `\n\n...and ${errors.length - 10} more errors` : '') +
                       `\n\nValid loads: ${totalValid}` +
                       `\n\nDo you want to import the ${totalValid} valid load(s) and skip the errors?`;

      if (!confirm(errorMsg)) {
        return;
      }
    }

    // Import valid loads
    if (!frameData.loads) frameData.loads = {};
    frameData.loads.nodal = validLoads.nodal;
    frameData.loads.distributed = validLoads.distributed;
    frameData.loads.elementPoint = validLoads.elementPoint;

    renderLoadsTable();

    // Show summary
    const totalLoads = validLoads.nodal.length + validLoads.distributed.length + validLoads.elementPoint.length;
    let summary = `Successfully imported ${totalLoads} load(s)\n` +
                  `(${validLoads.nodal.length} nodal, ` +
                  `${validLoads.distributed.length} distributed, ` +
                  `${validLoads.elementPoint.length} element point)`;

    if (errors.length > 0) {
      summary += `\n\nSkipped ${errors.length} load(s) with errors`;
    }
    if (warnings.length > 0) {
      summary += `\n\nWarnings: ${warnings.length}`;
    }
    alert(summary);

  } catch (err) {
    console.error('Import error:', err);
    alert('Failed to import from clipboard. Make sure you copied tab-separated data (e.g., from Excel).');
  }
}

/**
 * Parse tab-separated data from clipboard
 */
function parseTabSeparatedData(text) {
  const lines = text.trim().split('\n');
  const rows = lines.map(line => {
    // Split by tab, handle both \t and multiple spaces
    return line.split('\t').map(cell => cell.trim());
  });
  return rows.filter(row => row.length > 0 && row[0] !== '');
}

/**
 * Export nodes to clipboard (for pasting into Excel)
 */
async function exportNodesToClipboard() {
  try {
    let text = 'Name\tX\tY\tSupport\n';

    for (const node of frameData.nodes) {
      text += `${node.name}\t${node.x}\t${node.y}\t${node.support}\n`;
    }

    await navigator.clipboard.writeText(text);
    alert('Nodes copied to clipboard! You can now paste into Excel.');

  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to copy to clipboard');
  }
}

/**
 * Export elements to clipboard
 */
async function exportElementsToClipboard() {
  try {
    let text = 'Name\tNodeI\tNodeJ\tE\tI\tA\n';

    for (const element of frameData.elements) {
      text += `${element.name}\t${element.nodeI}\t${element.nodeJ}\t${element.E}\t${element.I}\t${element.A}\n`;
    }

    await navigator.clipboard.writeText(text);
    alert('Elements copied to clipboard! You can now paste into Excel.');

  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to copy to clipboard');
  }
}

/**
 * Export loads to clipboard
 */
async function exportLoadsToClipboard() {
  try {
    let text = 'Name\tType\tNode/Element\tCase\tFX/W1/Mag\tFY/W2\tMZ\tX1\tX2\tDistance\tDirection\n';

    // Export nodal loads
    for (const load of (frameData.loads?.nodal || [])) {
      text += `${load.name}\tnodal\t${load.node}\t${load.case}\t${load.fx}\t${load.fy}\t${load.mz}\t\t\t\t\n`;
    }

    // Export distributed loads
    for (const load of (frameData.loads?.distributed || [])) {
      text += `${load.name}\tdistributed\t${load.element}\t${load.case}\t${load.w1}\t${load.w2}\t\t${load.x1}\t${load.x2}\t\t${load.direction}\n`;
    }

    // Export element point loads
    for (const load of (frameData.loads?.elementPoint || [])) {
      text += `${load.name}\telementPoint\t${load.element}\t${load.case}\t${load.magnitude}\t\t\t\t\t${load.distance}\t${load.direction}\n`;
    }

    await navigator.clipboard.writeText(text);
    alert('Loads copied to clipboard! You can now paste into Excel.');

  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to copy to clipboard');
  }
}

/**
 * Download Excel template files
 */
function downloadNodesTemplate() {
  const csv = 'Name,X,Y,Support\nN1,0,0,fixed\nN2,5,0,free\nN3,10,0,pinned\n';
  downloadCSV(csv, 'nodes_template.csv');
}

function downloadElementsTemplate() {
  const csv = 'Name,NodeI,NodeJ,E,I,A\nM1,N1,N2,210,0.001,0.01\nM2,N2,N3,210,0.001,0.01\n';
  downloadCSV(csv, 'elements_template.csv');
}

function downloadLoadsTemplate() {
  const csv = 'Name,Type,Node/Element,Case,FX/W1/Mag,FY/W2,MZ,X1,X2,Distance,Direction\n' +
              'L1,nodal,N2,Dead,0,-10000,0,,,,\n' +
              'D1,distributed,M1,Live,-1000,-1000,,0,5,,Fy\n' +
              'P1,elementPoint,M1,Dead,-5000,,,,,2.5,Fy\n';
  downloadCSV(csv, 'loads_template.csv');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

---

## Python Script for Users

Provide a helper script for generating clipboard-ready data:

```python
"""
Generate structure data for 2D Frame Analysis web app
Copy output to clipboard and paste into browser
"""
import pandas as pd

# Example: Generate nodes
nodes = pd.DataFrame([
    {'Name': 'N1', 'X': 0, 'Y': 0, 'Support': 'fixed'},
    {'Name': 'N2', 'X': 5, 'Y': 0, 'Support': 'free'},
    {'Name': 'N3', 'X': 10, 'Y': 0, 'Support': 'pinned'}
])

# Example: Generate elements
elements = pd.DataFrame([
    {'Name': 'M1', 'NodeI': 'N1', 'NodeJ': 'N2', 'E': 210, 'I': 0.001, 'A': 0.01},
    {'Name': 'M2', 'NodeI': 'N2', 'NodeJ': 'N3', 'E': 210, 'I': 0.001, 'A': 0.01}
])

# Example: Generate loads
loads = pd.DataFrame([
    {'Name': 'L1', 'Type': 'nodal', 'Node/Element': 'N2', 'Case': 'Dead',
     'FX/W1/Mag': 0, 'FY/W2': -10000, 'MZ': 0, 'X1': '', 'X2': '', 'Distance': '', 'Direction': ''},
    {'Name': 'D1', 'Type': 'distributed', 'Node/Element': 'M1', 'Case': 'Live',
     'FX/W1/Mag': -1000, 'FY/W2': -1000, 'MZ': '', 'X1': 0, 'X2': 5, 'Distance': '', 'Direction': 'Fy'}
])

# Copy to clipboard (requires pyperclip: pip install pyperclip)
import pyperclip

print("Choose what to copy:")
print("1. Nodes")
print("2. Elements")
print("3. Loads")

choice = input("Enter choice (1-3): ")

if choice == '1':
    pyperclip.copy(nodes.to_csv(sep='\t', index=False))
    print("\n✓ Nodes copied to clipboard!")
    print("Now go to browser and click 'Import Nodes from Clipboard'")
    print(nodes)
elif choice == '2':
    pyperclip.copy(elements.to_csv(sep='\t', index=False))
    print("\n✓ Elements copied to clipboard!")
    print("Now go to browser and click 'Import Elements from Clipboard'")
    print(elements)
elif choice == '3':
    pyperclip.copy(loads.to_csv(sep='\t', index=False))
    print("\n✓ Loads copied to clipboard!")
    print("Now go to browser and click 'Import Loads from Clipboard'")
    print(loads)
```

---

## Implementation Checklist

- [ ] Add import/export buttons to HTML (above each table)
- [ ] Add JavaScript import functions (nodes, elements, loads)
- [ ] Add JavaScript export functions (nodes, elements, loads)
- [ ] Add CSV template download functions
- [ ] Test with Excel copy/paste
- [ ] Test with Python pandas script
- [ ] Add user guide section to help text
- [ ] Test error handling for malformed data

---

## User Guide (Add to Help Section)

### How to Import Data from Excel/Python

**Option 1: From Excel**
1. Prepare your data in Excel with columns matching the template
2. Select and copy the data (including headers)
3. Click "Import from Clipboard" button
4. Data will populate automatically

**Option 2: From Python**
1. Generate a pandas DataFrame with your structure
2. Copy to clipboard: `df.to_csv(sep='\t', index=False)`
3. Use pyperclip: `pyperclip.copy(df.to_csv(sep='\t', index=False))`
4. Click "Import from Clipboard" in browser

**Option 3: Download Templates**
1. Click "Download Excel Template"
2. Fill in your data in Excel
3. Copy and paste into browser

### Data Format Requirements

**Nodes**: Name, X, Y, Support
- Support types: fixed, pinned, roller_x, roller_y, free

**Elements**: Name, NodeI, NodeJ, E (GPa), I (m⁴), A (m²)

**Loads**:
- Nodal: Name, nodal, Node, Case, FX, FY, MZ
- Distributed: Name, distributed, Element, Case, W1, W2, X1, X2, Direction
- Element Point: Name, elementPoint, Element, Case, Magnitude, Distance, Direction

---

## Validation & Error Messages

### Example Error Messages

**Elements with Missing Nodes:**
```
Found 2 error(s):

Row 2 (M1): Start node "N3" does not exist
Row 3 (M2): End node "N5" does not exist

Valid elements: 1

Do you want to import the 1 valid element(s) and skip the errors?
```

**Loads Referencing Non-existent Nodes:**
```
Found 3 error(s):

Row 2 (Load1): Node "N10" does not exist
Row 5 (Load2): Node "N99" does not exist
Row 7 (Load3): Invalid force values

Valid loads: 4

Do you want to import the 4 valid load(s) and skip the errors?
```

**Loads Referencing Non-existent Elements:**
```
Found 1 error(s):

Row 3 (DistLoad1): Element "M999" does not exist

Valid loads: 5

Do you want to import the 5 valid load(s) and skip the errors?
```

**Mixed Validation Errors:**
```
Found 5 error(s):

Row 2 (M1): Start node "N3" does not exist
Row 4 (M3): Invalid E value: abc
Row 6 (Load1): Node "N99" does not exist
Row 8 (Load2): Invalid direction "XYZ" (must be Fx, Fy, or Fz)
Row 10 (DistLoad): Element "M777" does not exist

Valid elements: 2
Valid loads: 3

Do you want to import valid data and skip the errors?
```

### Validation Rules

**Nodes:**
- ✅ Valid support types: `fixed`, `pinned`, `roller_x`, `roller_y`, `free`
- ✅ Numeric X and Y coordinates
- ⚠️ Invalid support types default to `free` with warning

**Elements:**
- ✅ Both start node (NodeI) and end node (NodeJ) must exist
- ✅ E, I, A must be positive numbers
- ❌ Missing nodes cause error
- ❌ Invalid numeric values cause error

**Loads (Nodal):**
- ✅ Referenced node must exist
- ✅ FX, FY, MZ must be numeric
- ❌ Missing node causes error

**Loads (Distributed):**
- ✅ Referenced element must exist
- ✅ W1, W2, X1, X2 must be numeric
- ✅ Direction must be `Fx`, `Fy`, or `Fz`
- ❌ Missing element causes error
- ❌ Invalid direction causes error

**Loads (Element Point):**
- ✅ Referenced element must exist
- ✅ Magnitude and Distance must be numeric
- ✅ Direction must be `Fx`, `Fy`, or `Fz`
- ❌ Missing element causes error
- ❌ Invalid direction causes error

---

## Benefits

✅ **No server needed** - works entirely in browser
✅ **Excel integration** - copy/paste from spreadsheets
✅ **Python integration** - generate with scripts, paste into browser
✅ **Bidirectional** - import AND export
✅ **Templates included** - download CSV examples
✅ **Simple implementation** - ~200 lines of JavaScript

This approach is much simpler than an API and perfectly suits the use case!
