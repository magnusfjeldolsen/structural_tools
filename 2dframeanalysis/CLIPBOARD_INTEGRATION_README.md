# Clipboard Import/Export Integration Guide

## Overview

This module adds Excel/clipboard integration to the 2D Frame Analysis tool with **minimal impact** on existing code.

**Features:**
- ✅ Import/export nodes, elements, and loads
- ✅ Full validation with detailed error messages
- ✅ Bidirectional: Browser ↔ Excel
- ✅ Self-contained module (easy to add/remove)
- ✅ Zero changes to existing functions

---

## Files

```
2dframeanalysis/
├── clipboard-import-export.js       # NEW: Self-contained module (~600 lines)
├── clipboard-ui-snippet.html        # NEW: HTML snippets to add
├── CLIPBOARD_INTEGRATION_README.md  # NEW: This file
├── index.html                        # MODIFIED: 3 small additions
└── (other files unchanged)
```

---

## Installation

### Step 1: Include the JavaScript Module

Add this line in the `<head>` section of `index.html`:

```html
<head>
  ...
  <!-- Clipboard Import/Export Module -->
  <script src="clipboard-import-export.js"></script>
  ...
</head>
```

**Location**: After other script includes, before closing `</head>`

---

### Step 2: Initialize the Module

Add this initialization code in your main `<script>` section (after `frameData` is defined):

```javascript
// Initialize Clipboard Import/Export Module
document.addEventListener('DOMContentLoaded', function() {
  ClipboardIO.init(frameData, {
    renderNodesTable: renderNodesTable,
    renderElementsTable: renderElementsTable,
    renderLoadsTable: renderLoadsTable,
    updateVisualization: updateVisualization
  });
});
```

**Location**: Inside your main `<script>` tag, after `frameData` declaration

**Required Functions** (must exist in your code):
- `renderNodesTable()` - Re-renders the nodes table
- `renderElementsTable()` - Re-renders the elements table
- `renderLoadsTable()` - Re-renders the loads table
- `updateVisualization()` - Updates the 2D visualization

---

### Step 3: Add UI Buttons

Copy the button groups from `clipboard-ui-snippet.html` and paste them:

**Above Nodes Table:**
```html
<div class="flex gap-2 mb-4 flex-wrap">
  <button onclick="ClipboardIO.importNodes()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition">
    📋 Import Nodes from Clipboard
  </button>
  <button onclick="ClipboardIO.exportNodes()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition">
    📤 Export Nodes to Clipboard
  </button>
  <button onclick="ClipboardIO.downloadNodesTemplate()"
          class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition">
    📥 Download Template
  </button>
</div>
```

**Above Elements Table:**
```html
<div class="flex gap-2 mb-4 flex-wrap">
  <button onclick="ClipboardIO.importElements()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition">
    📋 Import Elements from Clipboard
  </button>
  <button onclick="ClipboardIO.exportElements()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition">
    📤 Export Elements to Clipboard
  </button>
  <button onclick="ClipboardIO.downloadElementsTemplate()"
          class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition">
    📥 Download Template
  </button>
</div>
```

**Above Loads Table:**
```html
<div class="flex gap-2 mb-4 flex-wrap">
  <button onclick="ClipboardIO.importLoads()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition">
    📋 Import Loads from Clipboard
  </button>
  <button onclick="ClipboardIO.exportLoads()"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition">
    📤 Export Loads to Clipboard
  </button>
  <button onclick="ClipboardIO.downloadLoadsTemplate()"
          class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition">
    📥 Download Template
  </button>
</div>
```

---

## Summary of Changes to index.html

**Total changes**: 3 additions

1. **In `<head>`**: Add one `<script>` tag (1 line)
2. **In main `<script>`**: Add initialization code (7 lines)
3. **In HTML body**: Add button groups above each table (3 groups × ~12 lines = ~36 lines)

**Total**: ~44 lines added to `index.html` (no deletions, no modifications to existing code)

---

## How to Remove This Feature

If you ever want to remove this feature:

1. **Delete** `clipboard-import-export.js`
2. **Remove** the `<script src="clipboard-import-export.js">` line from `<head>`
3. **Remove** the `ClipboardIO.init(...)` call
4. **Remove** the three button groups

That's it! Your original code remains unchanged.

---

## Usage Examples

### Import from Excel

**Nodes:**
1. Create data in Excel:
   | Name | X  | Y  | Support |
   |------|----|-----|---------|
   | N1   | 0  | 0   | fixed   |
   | N2   | 10 | 0   | free    |

2. Select and copy (Ctrl+C)
3. Click "📋 Import Nodes from Clipboard"
4. Nodes populate automatically!

**Elements:**
1. Create data in Excel:
   | Name | NodeI | NodeJ | E   | I     | A    |
   |------|-------|-------|-----|-------|------|
   | M1   | N1    | N2    | 210 | 0.001 | 0.01 |

2. Copy and import

**Loads:**
1. Create data in Excel:
   | Name | Type  | Node/Element | Case | FX | FY     | MZ |
   |------|-------|--------------|------|----|--------|-----|
   | L1   | nodal | N2           | Dead | 0  | -10000 | 0  |

2. Copy and import

### Export to Excel

1. Click "📤 Export to Clipboard"
2. Open Excel
3. Paste (Ctrl+V)
4. Modify values
5. Copy and re-import!

### Generate in Python

```python
import pandas as pd
import pyperclip

# Create nodes
nodes = pd.DataFrame([
    {'Name': 'N1', 'X': 0, 'Y': 0, 'Support': 'fixed'},
    {'Name': 'N2', 'X': 10, 'Y': 0, 'Support': 'free'}
])

# Copy to clipboard
pyperclip.copy(nodes.to_csv(sep='\t', index=False))

# Now click "Import Nodes from Clipboard" in browser!
```

---

## Validation

The module validates all data before import:

**Elements:**
- ✅ Checks if NodeI exists → Error: `Start node "N3" does not exist`
- ✅ Checks if NodeJ exists → Error: `End node "N5" does not exist`
- ✅ Validates E, I, A are positive numbers

**Loads:**
- ✅ Nodal: checks if node exists
- ✅ Distributed: checks if element exists
- ✅ Element Point: checks if element exists
- ✅ Validates directions (Fx, Fy, Fz)

**Error Handling:**
- Shows specific row numbers (matching Excel)
- Lists exactly what's wrong
- Option to import valid data and skip errors

---

## API Reference

### Initialization

```javascript
ClipboardIO.init(frameDataReference, callbacks)
```

**Parameters:**
- `frameDataReference` (Object) - Reference to global `frameData`
- `callbacks` (Object) - Callback functions:
  - `renderNodesTable()` - Function to re-render nodes table
  - `renderElementsTable()` - Function to re-render elements table
  - `renderLoadsTable()` - Function to re-render loads table
  - `updateVisualization()` - Function to update visualization

### Import Functions

```javascript
ClipboardIO.importNodes()     // Import nodes from clipboard
ClipboardIO.importElements()  // Import elements from clipboard (validates node refs)
ClipboardIO.importLoads()     // Import loads from clipboard (validates node/element refs)
```

### Export Functions

```javascript
ClipboardIO.exportNodes()     // Export nodes to clipboard
ClipboardIO.exportElements()  // Export elements to clipboard
ClipboardIO.exportLoads()     // Export loads to clipboard
```

### Template Downloads

```javascript
ClipboardIO.downloadNodesTemplate()     // Download nodes_template.csv
ClipboardIO.downloadElementsTemplate()  // Download elements_template.csv
ClipboardIO.downloadLoadsTemplate()     // Download loads_template.csv
```

---

## Architecture

```
┌─────────────────────────────────────┐
│  index.html (minimal changes)       │
│  - Include clipboard-import-export.js│
│  - Initialize module                │
│  - Add button groups                │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  clipboard-import-export.js         │
│  (self-contained module)            │
│                                     │
│  - Import/export functions          │
│  - Validation logic                 │
│  - Error handling                   │
│  - Template generation              │
└────────────┬────────────────────────┘
             │
             ▼ (callbacks)
┌─────────────────────────────────────┐
│  Existing frameData & functions     │
│  - renderNodesTable()               │
│  - renderElementsTable()            │
│  - renderLoadsTable()               │
│  - updateVisualization()            │
└─────────────────────────────────────┘
```

**Key Points:**
- ✅ Module is **completely isolated**
- ✅ Only interacts through callbacks
- ✅ Doesn't modify existing code
- ✅ Can be removed without side effects

---

## Dependencies

**Required:**
- Modern browser with Clipboard API support (Chrome, Firefox, Edge, Safari)
- Global `frameData` object
- Callback functions for rendering

**No external libraries needed** (pure vanilla JavaScript)

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome  | ✅ Yes  |
| Firefox | ✅ Yes  |
| Edge    | ✅ Yes  |
| Safari  | ✅ Yes  |
| IE 11   | ❌ No   |

**Note**: Requires browser support for `navigator.clipboard` API (all modern browsers)

---

## Troubleshooting

**"Failed to import from clipboard"**
- Make sure you copied tab-separated data (from Excel/CSV)
- Try copying the header row along with data

**Validation errors**
- Check that referenced nodes/elements exist before importing loads/elements
- Import nodes first, then elements, then loads

**"renderNodesTable is not defined"**
- Make sure you initialized the module with correct callback function names
- Check that callback functions exist in your code

---

## Future Enhancements (Optional)

Possible additions without changing the architecture:

- [ ] Import/export load combinations
- [ ] Import from JSON files (drag & drop)
- [ ] Batch import multiple structures
- [ ] Undo/redo for imports
- [ ] Import history

---

## License

Same license as parent project.

---

## Support

For issues or questions, check:
1. This README
2. `clipboard-ui-snippet.html` for HTML examples
3. Comments in `clipboard-import-export.js` for API details
