# Editable Tables Implementation Plan
## Excel-like Copy/Paste for 2D Frame Analysis

### Overview
Replace current input grid system with HTML tables that support native copy/paste from Excel. This bypasses clipboard API security restrictions by using DOM events and contenteditable cells.

---

## 1. Design Approach

### Key Features
- ✅ **Native Excel Copy**: Select cells → Ctrl+C (works automatically)
- ✅ **Native Excel Paste**: Copy from Excel → Click cell → Ctrl+V (we intercept)
- ✅ **Direct Cell Editing**: Click to edit values inline
- ✅ **Add/Delete Rows**: Buttons to manage table rows
- ✅ **No Security Issues**: Uses DOM events, no clipboard API needed
- ✅ **Validation**: Check data as it's pasted/edited

### Technology
- **HTML `<table>` elements** with `contenteditable` cells or `<input>` elements
- **Paste event listener** to intercept Excel data
- **Tab-separated value (TSV) parsing** for multi-cell paste
- **Real-time sync** between table and `frameData` object

---

## 2. Table Structure

### Option A: contenteditable cells (simpler)
```html
<table id="nodes-table" class="editable-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>X (m)</th>
      <th>Y (m)</th>
      <th>Support</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr data-index="0">
      <td contenteditable="true">N1</td>
      <td contenteditable="true">0</td>
      <td contenteditable="true">0</td>
      <td contenteditable="true">fixed</td>
      <td><button onclick="deleteNode(0)">🗑️</button></td>
    </tr>
  </tbody>
</table>
```

### Option B: input elements (better validation)
```html
<table id="nodes-table" class="editable-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>X (m)</th>
      <th>Y (m)</th>
      <th>Support</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr data-index="0">
      <td><input type="text" value="N1" onchange="updateNode(0, 'name', this.value)"></td>
      <td><input type="number" value="0" onchange="updateNode(0, 'x', this.value)"></td>
      <td><input type="number" value="0" onchange="updateNode(0, 'y', this.value)"></td>
      <td>
        <select onchange="updateNode(0, 'support', this.value)">
          <option value="fixed">Fixed</option>
          <option value="pinned">Pinned</option>
          <option value="roller_x">Roller X</option>
          <option value="roller_y">Roller Y</option>
          <option value="free">Free</option>
        </select>
      </td>
      <td><button onclick="deleteNode(0)">🗑️</button></td>
    </tr>
  </tbody>
</table>
```

**Recommendation**: Use **Option B (input elements)** for better:
- Type validation (number inputs)
- Dropdown support types
- Easier value access
- Better mobile support

---

## 3. Paste Event Handling

### JavaScript Implementation
```javascript
// Listen for paste events on the table
document.getElementById('nodes-table').addEventListener('paste', (e) => {
  e.preventDefault();

  // Get clipboard data
  const pastedText = (e.clipboardData || window.clipboardData).getData('text');

  // Parse tab-separated values
  const rows = pastedText.trim().split('\n');
  const data = rows.map(row => row.split('\t'));

  // Get current cell position
  const activeCell = document.activeElement;
  const currentRow = activeCell.closest('tr');
  const currentRowIndex = parseInt(currentRow.dataset.index);
  const currentCellIndex = Array.from(currentRow.children).indexOf(activeCell.closest('td'));

  // Populate cells starting from current position
  data.forEach((rowData, rowOffset) => {
    const targetRowIndex = currentRowIndex + rowOffset;

    // Add new row if needed
    if (targetRowIndex >= frameData.nodes.length) {
      addNode();
    }

    // Update each cell in the row
    rowData.forEach((cellValue, colOffset) => {
      const targetCellIndex = currentCellIndex + colOffset;
      updateNodeCell(targetRowIndex, targetCellIndex, cellValue);
    });
  });

  // Update visualization
  updateVisualization();
});
```

### Key Functions Needed
```javascript
// Update a specific cell
function updateNodeCell(rowIndex, cellIndex, value) {
  const node = frameData.nodes[rowIndex];
  const columns = ['name', 'x', 'y', 'support'];
  const property = columns[cellIndex];

  if (property === 'x' || property === 'y') {
    node[property] = parseFloat(value);
  } else {
    node[property] = value;
  }

  // Update the input element to show new value
  const row = document.querySelector(`tr[data-index="${rowIndex}"]`);
  const cell = row.children[cellIndex];
  const input = cell.querySelector('input, select');
  if (input) input.value = value;
}

// Add a new row to the table
function addNode() {
  const newNode = {
    name: `N${nodeCounter++}`,
    x: 0,
    y: 0,
    support: 'free'
  };
  frameData.nodes.push(newNode);
  renderNodeRow(frameData.nodes.length - 1);
}

// Render a single row
function renderNodeRow(index) {
  const node = frameData.nodes[index];
  const tbody = document.querySelector('#nodes-table tbody');

  const row = document.createElement('tr');
  row.dataset.index = index;
  row.innerHTML = `
    <td><input type="text" value="${node.name}" onchange="updateNode(${index}, 'name', this.value)"></td>
    <td><input type="number" step="0.1" value="${node.x}" onchange="updateNode(${index}, 'x', this.value)"></td>
    <td><input type="number" step="0.1" value="${node.y}" onchange="updateNode(${index}, 'y', this.value)"></td>
    <td>
      <select onchange="updateNode(${index}, 'support', this.value)">
        <option value="fixed" ${node.support === 'fixed' ? 'selected' : ''}>Fixed</option>
        <option value="pinned" ${node.support === 'pinned' ? 'selected' : ''}>Pinned</option>
        <option value="roller_x" ${node.support === 'roller_x' ? 'selected' : ''}>Roller X</option>
        <option value="roller_y" ${node.support === 'roller_y' ? 'selected' : ''}>Roller Y</option>
        <option value="free" ${node.support === 'free' ? 'selected' : ''}>Free</option>
      </select>
    </td>
    <td><button onclick="deleteNode(${index})" class="delete-btn">🗑️</button></td>
  `;
  tbody.appendChild(row);
}
```

---

## 4. Implementation Steps

### Phase 1: Nodes Table
1. ✅ Create HTML `<table>` structure in index.html
2. ✅ Add CSS styling for tables
3. ✅ Create `renderNodesTable()` function
4. ✅ Add paste event listener
5. ✅ Implement `updateNode()` function
6. ✅ Test copy/paste from Excel

### Phase 2: Elements Table
1. ✅ Create elements table (same approach)
2. ✅ Handle NodeI/NodeJ autocomplete (datalist)
3. ✅ Handle section/profile dropdowns
4. ✅ Paste validation (check nodes exist)

### Phase 3: Loads Tables
1. ✅ Create nodal loads table
2. ✅ Create distributed loads table
3. ✅ Create element point loads table
4. ✅ Add load case column
5. ✅ Validate node/element references on paste

### Phase 4: Advanced Features
- ✅ Multi-row paste (extend table automatically)
- ✅ Header row detection (skip if pasting from Excel with headers)
- ✅ Validation messages (e.g., "Element M1 references N3 which doesn't exist")
- ✅ Undo/redo support (optional)
- ✅ CSV export button (download as CSV file)

---

## 5. CSS Styling

```css
/* Editable table styles */
.editable-table {
  width: 100%;
  border-collapse: collapse;
  background: #1f2937;
  border-radius: 8px;
  overflow: hidden;
}

.editable-table th {
  background: #374151;
  color: #f3f4f6;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  font-size: 0.875rem;
  border-bottom: 2px solid #4b5563;
}

.editable-table td {
  padding: 4px;
  border-bottom: 1px solid #374151;
}

.editable-table input,
.editable-table select {
  width: 100%;
  background: #111827;
  color: #f3f4f6;
  border: 1px solid #374151;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 0.875rem;
}

.editable-table input:focus,
.editable-table select:focus {
  outline: none;
  border-color: #3b82f6;
  background: #1f2937;
}

.editable-table tr:hover {
  background: #1f2937;
}

.editable-table button.delete-btn {
  background: #dc2626;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.editable-table button.delete-btn:hover {
  background: #b91c1c;
}
```

---

## 6. Validation Strategy

### On Paste
```javascript
function validatePastedElements(elements) {
  const existingNodes = new Set(frameData.nodes.map(n => n.name));
  const errors = [];

  elements.forEach((element, index) => {
    if (!existingNodes.has(element.nodeI)) {
      errors.push(`Row ${index + 1}: Start node "${element.nodeI}" does not exist`);
    }
    if (!existingNodes.has(element.nodeJ)) {
      errors.push(`Row ${index + 1}: End node "${element.nodeJ}" does not exist`);
    }
  });

  if (errors.length > 0) {
    const proceed = confirm(
      `⚠️ Found ${errors.length} validation error(s):\n\n` +
      errors.slice(0, 5).join('\n') +
      (errors.length > 5 ? `\n...and ${errors.length - 5} more` : '') +
      `\n\nProceed anyway?`
    );
    return proceed;
  }

  return true;
}
```

---

## 7. Files to Modify

### index.html
- Replace nodes input grid with `<table id="nodes-table">`
- Replace elements input grid with `<table id="elements-table">`
- Replace loads grids with tables
- Add CSS for editable tables

### pynite-interface.js
- Remove old `addNodeRow()` function
- Create `renderNodesTable()` function
- Create `renderElementsTable()` function
- Create `renderLoadsTable()` function
- Add paste event listeners
- Add `updateNode()`, `updateElement()`, `updateLoad()` functions
- Add validation functions

---

## 8. Benefits Over Clipboard API

| Feature | Clipboard API | Editable Tables |
|---------|--------------|-----------------|
| Copy to Excel | ❌ Security blocked | ✅ Native select + Ctrl+C |
| Paste from Excel | ❌ Security blocked | ✅ Ctrl+V intercept |
| Works offline | ❌ Requires HTTPS | ✅ Works anywhere |
| Mobile support | ❌ Limited | ✅ Good |
| User experience | ❌ Buttons + modals | ✅ Direct editing |
| Browser support | ❌ Modern only | ✅ All browsers |

---

## 9. Example Workflow

### User Workflow
1. **Export from browser**: Select table cells → Ctrl+C → Paste into Excel
2. **Modify in Excel**: Edit values, add rows, formulas, etc.
3. **Import to browser**: Copy cells from Excel → Click table in browser → Ctrl+V
4. **Automatic update**: Table updates, visualization refreshes, data validated

### Developer Workflow
1. User pastes data
2. `paste` event fires
3. Parse tab-separated text
4. Validate data (nodes exist, etc.)
5. Update `frameData` object
6. Re-render table (if needed)
7. Update visualization

---

## 10. Next Steps

1. **Implement nodes table first** (simplest, fewest columns)
2. **Test copy/paste workflow** thoroughly
3. **Add elements table** (more complex with validation)
4. **Add loads tables** (three separate tables)
5. **Polish UI/UX** (styling, error messages)
6. **User documentation** (add instructions above tables)

---

## Success Criteria

- ✅ User can select table cells and copy to Excel (Ctrl+C)
- ✅ User can paste from Excel into table (Ctrl+V)
- ✅ Multi-row paste works (extends table automatically)
- ✅ Data validation shows helpful error messages
- ✅ Real-time sync with frameData and visualization
- ✅ Works in all browsers without security issues
- ✅ Better UX than current input grids
