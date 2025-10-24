# Elements Table Implementation Plan
## Phase 2: Excel-like Copy/Paste for Elements

---

## Current Structure Analysis

### Current Features to Preserve:
1. **Node autocomplete** - Input fields with datalist for NodeI and NodeJ
2. **Section Type dropdown** - Custom, IPE, HEA, HEB, HEM, CCHS, CRHS, CSHS, etc.
3. **Profile dropdown** - Populated based on section type (disabled for Custom)
4. **Axis dropdown** - Strong (y-y) / Weak (z-z) (disabled for Custom)
5. **Auto-calculation** - I and A values auto-filled when profile selected (disabled for Custom)
6. **Manual input** - I and A editable when section type is Custom
7. **Copy element properties** - Blue copy button to copy I/A values between elements
8. **Element naming** - Auto-generated E1, E2, E3...
9. **E modulus** - Young's modulus in GPa (default 200)

### Current DOM Structure:
```html
<div class="element-grid">
  <input readonly> Element name (E1, E2...)
  <input list="nodes-datalist"> NodeI
  <input list="nodes-datalist"> NodeJ
  <input type="number"> E (GPa)
  <select onchange="onSectionTypeChange()"> Section type
  <select onchange="onProfileChange()"> Profile (auto-populated)
  <select onchange="onProfileChange()"> Axis
  <input type="number"> I (auto or manual)
  <input type="number"> A (auto or manual)
  <button> Copy properties
  <button> Delete
</div>
```

---

## Table Design

### HTML Structure:
```html
<table id="elements-table" class="editable-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Node i</th>
      <th>Node j</th>
      <th>E (GPa)</th>
      <th>Section</th>
      <th>Profile</th>
      <th>Axis</th>
      <th>I (m⁴)</th>
      <th>A (m²)</th>
      <th style="width: 40px;">Copy</th>
      <th style="width: 40px;">Del</th>
    </tr>
  </thead>
  <tbody id="elements-container">
    <!-- Rows rendered here -->
  </tbody>
</table>
```

### Row Rendering (Complex):
```javascript
function renderElementRow(index) {
  const element = frameData.elements[index];
  const row = document.createElement('tr');
  row.dataset.index = index;

  // Determine if section is custom
  const isCustom = element.sectionType === 'Custom';

  row.innerHTML = `
    <td><input type="text" value="${element.name}" onchange="updateElementProperty(${index}, 'name', this.value)"></td>

    <!-- NodeI with autocomplete -->
    <td><input type="text" list="nodes-datalist" value="${element.nodeI}"
               onchange="updateElementProperty(${index}, 'nodeI', this.value)"></td>

    <!-- NodeJ with autocomplete -->
    <td><input type="text" list="nodes-datalist" value="${element.nodeJ}"
               onchange="updateElementProperty(${index}, 'nodeJ', this.value)"></td>

    <!-- E modulus -->
    <td><input type="number" step="0.1" value="${element.E}"
               onchange="updateElementProperty(${index}, 'E', parseFloat(this.value))"></td>

    <!-- Section Type dropdown -->
    <td>
      <select onchange="onElementSectionTypeChange(${index}, this.value)">
        ${generateSectionTypeOptions(element.sectionType)}
      </select>
    </td>

    <!-- Profile dropdown (disabled if Custom) -->
    <td>
      <select ${isCustom ? 'disabled' : ''}
              onchange="onElementProfileChange(${index})">
        ${generateProfileOptions(element.sectionType, element.profile)}
      </select>
    </td>

    <!-- Axis dropdown (disabled if Custom) -->
    <td>
      <select ${isCustom ? 'disabled' : ''}
              onchange="onElementAxisChange(${index}, this.value)">
        <option value="strong" ${element.axis === 'strong' ? 'selected' : ''}>Strong (y-y)</option>
        <option value="weak" ${element.axis === 'weak' ? 'selected' : ''}>Weak (z-z)</option>
      </select>
    </td>

    <!-- I value (readonly if not Custom) -->
    <td>
      <input type="number" step="0.0001" value="${element.I}"
             ${!isCustom ? 'readonly' : ''}
             onchange="updateElementProperty(${index}, 'I', parseFloat(this.value))">
    </td>

    <!-- A value (readonly if not Custom) -->
    <td>
      <input type="number" step="0.0001" value="${element.A}"
             ${!isCustom ? 'readonly' : ''}
             onchange="updateElementProperty(${index}, 'A', parseFloat(this.value))">
    </td>

    <!-- Copy button -->
    <td><button onclick="copyElementProperties(${index})" class="copy-btn" title="Copy I & A">📋</button></td>

    <!-- Delete button -->
    <td><button onclick="deleteElement(${index})" class="delete-btn">🗑️</button></td>
  `;

  tbody.appendChild(row);
}
```

---

## frameData Structure

### Element Object:
```javascript
{
  name: "E1",
  nodeI: "N1",
  nodeJ: "N2",
  E: 200,                    // GPa
  sectionType: "IPE",        // or "Custom"
  profile: "IPE200",         // or "" if Custom
  axis: "strong",            // "strong" or "weak"
  I: 0.0001944,             // m⁴
  A: 0.00284                 // m²
}
```

---

## Key Functions to Implement

### 1. Core CRUD Functions
```javascript
function addElement() {
  // Add new element to frameData.elements with defaults
  // Render the new row
}

function renderElementRow(index) {
  // Render single element row with all dropdowns and logic
}

function renderElementsTable() {
  // Re-render entire table
}

function updateElementProperty(index, property, value) {
  // Update frameData.elements[index][property]
  // Re-render if needed (for complex changes)
}

function deleteElement(index) {
  // Remove from frameData.elements
  // Re-render table
}
```

### 2. Section Type Logic
```javascript
function onElementSectionTypeChange(index, newSectionType) {
  const element = frameData.elements[index];
  element.sectionType = newSectionType;

  if (newSectionType === 'Custom') {
    // Clear profile/axis, enable I/A editing
    element.profile = '';
    element.axis = 'strong';
    // Keep existing I/A values
  } else {
    // Load profiles for this section type
    // Disable I/A editing
    element.profile = ''; // User must select
  }

  renderElementRow(index); // Re-render this row
}

function onElementProfileChange(index) {
  const element = frameData.elements[index];
  // Look up profile in steelSectionDatabase
  // Calculate I and A based on axis
  // Update frameData.elements[index]
  renderElementRow(index); // Re-render to show new I/A values
}

function onElementAxisChange(index, newAxis) {
  const element = frameData.elements[index];
  element.axis = newAxis;
  // Recalculate I and A if profile is selected
  onElementProfileChange(index);
}
```

### 3. Copy Properties
```javascript
let copiedProperties = null; // Global clipboard for I/A values

function copyElementProperties(index) {
  const element = frameData.elements[index];
  copiedProperties = {
    I: element.I,
    A: element.A
  };
  // Visual feedback (flash button green)
}

// User can paste by clicking copy button again,
// or we add a separate paste button
```

### 4. Paste from Excel
```javascript
function initElementsTablePaste() {
  document.getElementById('elements-table').addEventListener('paste', (e) => {
    e.preventDefault();

    // Parse TSV data
    const data = parseClipboardData(e);

    // For each row:
    // - Check if NodeI and NodeJ exist in frameData.nodes
    // - Parse E, I, A as numbers
    // - Validate section type (must be valid or Custom)
    // - Create element in frameData.elements

    // Validation: warn if nodes don't exist
    const errors = validateElements(data);
    if (errors.length > 0) {
      // Show warning, allow user to proceed or cancel
    }

    renderElementsTable();
  });
}
```

### 5. Update getElementsFromInputs()
```javascript
function getElementsFromInputs() {
  // Return frameData.elements directly (already synced)
  return frameData.elements.map(el => ({
    name: el.name,
    nodeI: el.nodeI,
    nodeJ: el.nodeJ,
    E: el.E,
    I: el.I,
    A: el.A
  }));
}
```

---

## Paste Data Handling

### Expected Excel Format:
```
Name    NodeI   NodeJ   E     Section   Profile   Axis      I         A
E1      N1      N2      200   IPE       IPE200    strong    0.000194  0.00284
E2      N2      N3      200   Custom              strong    0.001     0.01
```

### Paste Logic:
1. **Parse TSV** - tab-separated values
2. **Detect header** - skip if contains "name", "node", "section"
3. **Validate nodes** - NodeI and NodeJ must exist in frameData.nodes
4. **Validate section type** - Must be in SECTION_TYPES or "Custom"
5. **Handle profiles** - If section type is not Custom, optionally validate profile exists
6. **Auto-lookup** - If profile is provided, lookup I/A from database (override pasted I/A)
7. **Manual I/A** - If Custom section, use pasted I/A values
8. **Error reporting** - Show which rows have invalid nodes

---

## Challenges & Solutions

### Challenge 1: Complex Dropdowns
**Problem**: Profile dropdown depends on section type, I/A depend on profile and axis
**Solution**:
- Store section type, profile, axis in frameData
- Re-render row when section type changes
- Use helper functions to generate dropdown HTML

### Challenge 2: Readonly vs Editable I/A
**Problem**: I/A should be readonly for steel sections, editable for Custom
**Solution**:
- Use `readonly` attribute conditionally in HTML
- Check `isCustom` when rendering

### Challenge 3: Paste Handling
**Problem**: Pasted data might not include section/profile/axis
**Solution**:
- Allow minimal paste (just Name, NodeI, NodeJ, E, I, A)
- Default section type to "Custom" if not provided
- Show warning if section type is non-Custom but I/A don't match database

### Challenge 4: Copy Properties Button
**Problem**: Current implementation uses a global clipboard
**Solution**:
- Keep global `copiedProperties` variable
- Copy button stores I/A
- Paste by clicking into I/A field and pasting? Or add paste button?
- **Decision**: Keep copy button, clicking it again on another element pastes

---

## Implementation Steps

### Step 1: Update HTML
- ✅ Replace element grid with `<table id="elements-table">`
- ✅ Keep datalist for node autocomplete
- ✅ Add tip about copy/paste

### Step 2: Update frameData Structure
- ✅ Ensure `frameData.elements` has all needed properties
- ✅ Add default values for new elements

### Step 3: Rewrite Element Functions
- ✅ `addElement()` - create in frameData, render row
- ✅ `renderElementRow()` - complex HTML with dropdowns
- ✅ `renderElementsTable()` - render all rows
- ✅ `updateElementProperty()` - update and re-render if needed
- ✅ `deleteElement()` - remove and re-render
- ✅ `onElementSectionTypeChange()` - handle section type logic
- ✅ `onElementProfileChange()` - lookup database, update I/A
- ✅ `onElementAxisChange()` - recalculate I/A

### Step 4: Paste Event Handler
- ✅ `initElementsTablePaste()` - parse TSV, validate, populate
- ✅ Validation: check nodes exist
- ✅ Error messages for invalid data

### Step 5: Update Existing Functions
- ✅ `getElementsFromInputs()` - return frameData.elements
- ✅ Remove old `removeElement()` if exists
- ✅ Update `clearAll()` to clear frameData.elements

### Step 6: Copy Properties
- ✅ Update `copyElementProperties()` to work with table
- ✅ Optional: add paste button or use modifier key

### Step 7: Testing
- ✅ Add elements manually
- ✅ Change section type (Custom ↔ Steel sections)
- ✅ Select profile and axis
- ✅ Copy properties between elements
- ✅ Paste from Excel (with and without header)
- ✅ Validate node references

---

## Edge Cases

1. **Paste with invalid nodes** - Show error, allow partial import of valid elements
2. **Paste with unknown section type** - Default to Custom, show warning
3. **Paste profile without section type** - Ignore profile, use Custom
4. **Copy/paste I/A between Custom and non-Custom** - Should work
5. **Delete node that elements reference** - Should delete those elements too (existing behavior)

---

## Success Criteria

- ✅ Table displays all elements with proper dropdowns
- ✅ Section type Custom/Non-Custom logic works
- ✅ Profile selection auto-fills I/A values
- ✅ Axis change recalculates I/A
- ✅ Manual I/A editing works for Custom sections
- ✅ Copy properties button works
- ✅ Node autocomplete works (datalist)
- ✅ Paste from Excel populates table
- ✅ Validation shows helpful errors
- ✅ Analysis uses frameData.elements correctly
- ✅ No security issues (DOM events only)

---

## Questions for User

1. **Copy/Paste Properties**: Keep current behavior (copy button stores I/A globally)?
2. **Paste Profile Matching**: If user pastes section type and I/A, should we:
   - Ignore I/A and lookup from database?
   - Use pasted I/A as-is?
   - Warn if mismatch?
3. **Minimal Paste**: Should we support pasting just Name, NodeI, NodeJ, E, I, A (without section/profile)?
4. **Element Deletion**: Should deleting a node also delete connected elements automatically?

---

## Estimated Complexity

**Medium-High Complexity**
- More complex than nodes (11 columns vs 5)
- Interdependent dropdowns (section → profile → I/A)
- Database lookups required
- Copy/paste properties feature
- Validation against nodes

**Implementation Time**: ~2-3x longer than nodes table
