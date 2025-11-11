# Element Modelling UX Improvements Specification

## Overview
Improve the Elements Creation area with:
1. Reduced width to prevent overlap with Frame Visualization
2. Individual element deletion with small "×" buttons
3. Copy/paste properties feature for efficient element creation

## Current Issues
- Element grid is too wide (1020px total) and overlaps with Frame Visualization
- "Remove" button text is verbose
- No way to copy properties between elements efficiently

## Proposed Changes

### 1. Grid Layout Optimization

**Current grid columns:**
```
60px 60px 60px 80px 120px 140px 100px 100px 100px 80px
Total: 1020px + gaps
```

**New grid columns (with checkbox for paste mode):**
```
[Checkbox: 30px] Element: 50px | Node i: 50px | Node j: 50px | E: 70px | Section Type: 110px | Profile: 120px | Axis: 90px | I: 80px | A: 80px | [Copy: 24px] [Delete: 24px]
Total: ~728px (with checkbox) or ~698px (without checkbox)
```

**Changes:**
- Add checkbox column (30px) - only visible when properties are in clipboard
- Reduce Element name to 50px
- Reduce Node i/j to 50px each
- Reduce E to 70px
- Reduce Section Type to 110px
- Reduce Profile to 120px
- Reduce Bending Axis to 90px
- Reduce I and A to 80px each
- Replace "Remove" button (80px) with icon button (24px)
- Add "Copy" icon button (24px)

### 2. Delete Functionality

**Implementation:**
- Replace text "Remove" button with small icon button showing "×"
- Button size: 24px × 24px
- Red background (#dc2626) with hover (#b91c1c)
- White "×" symbol (font-size: 16px, line-height: 1)
- Positioned at the end of each element row

**HTML structure:**
```html
<button onclick="removeElement('element-1')"
        class="delete-btn"
        title="Delete element">×</button>
```

**CSS:**
```css
.delete-btn {
    width: 24px;
    height: 24px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.delete-btn:hover {
    background: #b91c1c;
}
```

### 3. Copy/Paste Properties Feature

**Properties to copy:**
- E (Young's Modulus)
- Section Type (Custom, IPE, HEA, etc.)
- Profile Name (if not Custom)
- Bending Axis (strong/weak)
- I (Second Moment of Area) - only if Custom
- A (Cross-sectional Area) - only if Custom

**State Management:**

```javascript
// Global state
let propertiesClipboard = null; // Stores copied properties
let pasteMode = false; // Whether paste UI is visible

// Structure of clipboard data
propertiesClipboard = {
    E: "200",
    sectionType: "IPE",
    profileName: "IPE 300",
    bendingAxis: "strong",
    I: null, // null if using database profile
    A: null  // null if using database profile
};
```

**Copy Button:**
- Icon: 📋 or two overlapping squares symbol
- Size: 24px × 24px
- Blue/gray background (#3b82f6) with hover (#2563eb)
- Positioned before delete button

**HTML structure:**
```html
<button onclick="copyElementProperties('element-1')"
        class="copy-btn"
        title="Copy properties">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
</button>
```

**CSS:**
```css
.copy-btn {
    width: 24px;
    height: 24px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.copy-btn:hover {
    background: #2563eb;
}

.copy-btn.active {
    background: #10b981; /* Green when properties are copied */
}
```

**Paste Mode UI:**

When properties are copied (clipboard not null):
1. Checkbox column appears on the left of all element rows
2. "Paste Properties" button appears next to "Add Element" button
3. Copy button that was clicked shows green background to indicate active clipboard

**Checkbox column:**
```html
<input type="checkbox"
       class="paste-checkbox"
       data-element-id="element-1"
       style="width: 16px; height: 16px; cursor: pointer;">
```

**Paste Properties button:**
```html
<button onclick="pastePropertiesToSelected()"
        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm ml-2">
    Paste Properties
</button>
```

### 4. Implementation Flow

**Step 1: User clicks Copy button on Element 1**
- Extract properties from Element 1
- Store in `propertiesClipboard`
- Set `pasteMode = true`
- Show checkboxes on all element rows
- Show "Paste Properties" button
- Highlight the Copy button that was clicked (green background)

**Step 2: User selects checkboxes on Elements 2, 3, 4**
- Checkboxes are checked
- No immediate action

**Step 3: User clicks "Paste Properties"**
- Iterate through checked elements
- Apply `propertiesClipboard` values to each:
  - Set E value
  - Set Section Type dropdown
  - Trigger `onSectionTypeChange()` to load profiles
  - Set Profile dropdown (if not Custom)
  - Set Bending Axis dropdown
  - Set I and A (if Custom section)
- Uncheck all checkboxes
- Keep paste mode active (don't clear clipboard)
- Update visualization

**Step 4: User clicks Copy on different element OR clicks "×" to clear clipboard**
- Option A: New copy → replace clipboard and repeat
- Option B: Clear → set `propertiesClipboard = null`, `pasteMode = false`, hide checkboxes and paste button

### 5. JavaScript Functions

```javascript
// Copy properties from an element
function copyElementProperties(elementId) {
    const elementDiv = document.getElementById(elementId);

    propertiesClipboard = {
        E: elementDiv.querySelector('.element-e').value,
        sectionType: elementDiv.querySelector('.section-type').value,
        profileName: elementDiv.querySelector('.profile-select').value,
        bendingAxis: elementDiv.querySelector('.axis-select').value,
        I: elementDiv.querySelector('.element-i-val').value,
        A: elementDiv.querySelector('.element-a').value
    };

    // Enter paste mode
    pasteMode = true;
    updatePasteUI();

    console.log('Properties copied:', propertiesClipboard);
}

// Paste properties to selected elements
function pastePropertiesToSelected() {
    if (!propertiesClipboard) return;

    const checkboxes = document.querySelectorAll('.paste-checkbox:checked');

    checkboxes.forEach(checkbox => {
        const elementId = checkbox.dataset.elementId;
        const elementDiv = document.getElementById(elementId);

        // Set E
        elementDiv.querySelector('.element-e').value = propertiesClipboard.E;

        // Set Section Type
        elementDiv.querySelector('.section-type').value = propertiesClipboard.sectionType;

        // Trigger section type change to load profiles
        onSectionTypeChange(elementId);

        // Wait for profiles to load, then set profile and axis
        setTimeout(() => {
            if (propertiesClipboard.sectionType !== 'Custom') {
                elementDiv.querySelector('.profile-select').value = propertiesClipboard.profileName;
                elementDiv.querySelector('.axis-select').value = propertiesClipboard.bendingAxis;

                // Trigger profile change to update I and A
                onProfileChange(elementId);
            } else {
                // For Custom section, set I and A directly
                elementDiv.querySelector('.element-i-val').value = propertiesClipboard.I;
                elementDiv.querySelector('.element-a').value = propertiesClipboard.A;
            }

            // Uncheck this checkbox
            checkbox.checked = false;
        }, 10);
    });

    updateVisualization();
}

// Update paste mode UI
function updatePasteUI() {
    const elementsContainer = document.getElementById('elements-container');
    const addElementBtn = document.querySelector('button[onclick="addElement()"]').parentElement;

    // Remove existing paste button if any
    const existingPasteBtn = document.getElementById('paste-properties-btn');
    if (existingPasteBtn) existingPasteBtn.remove();

    if (pasteMode && propertiesClipboard) {
        // Show checkboxes
        document.querySelectorAll('.element-grid').forEach(elementDiv => {
            if (!elementDiv.querySelector('.paste-checkbox')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'paste-checkbox';
                checkbox.dataset.elementId = elementDiv.id;
                checkbox.style.width = '16px';
                checkbox.style.height = '16px';
                checkbox.style.cursor = 'pointer';
                elementDiv.insertBefore(checkbox, elementDiv.firstChild);
            }
        });

        // Update grid columns to include checkbox
        document.querySelector('.element-grid-header').style.gridTemplateColumns =
            '30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        document.querySelectorAll('.element-grid').forEach(el => {
            el.style.gridTemplateColumns = '30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        });

        // Add checkbox header
        const header = document.querySelector('.element-grid-header');
        if (!header.querySelector('.checkbox-header')) {
            const checkboxHeader = document.createElement('div');
            checkboxHeader.className = 'checkbox-header';
            checkboxHeader.innerHTML = '<input type="checkbox" id="select-all-elements" style="width:16px;height:16px;cursor:pointer;" title="Select all">';
            header.insertBefore(checkboxHeader, header.firstChild);

            // Select all functionality
            document.getElementById('select-all-elements').addEventListener('change', (e) => {
                document.querySelectorAll('.paste-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }

        // Show "Paste Properties" button
        const pasteBtn = document.createElement('button');
        pasteBtn.id = 'paste-properties-btn';
        pasteBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm ml-2';
        pasteBtn.textContent = 'Paste Properties';
        pasteBtn.onclick = pastePropertiesToSelected;
        addElementBtn.querySelector('button[onclick="addElement()"]').after(pasteBtn);

        // Highlight all copy buttons (show which one is active)
        document.querySelectorAll('.copy-btn').forEach(btn => btn.classList.remove('active'));

    } else {
        // Hide checkboxes
        document.querySelectorAll('.paste-checkbox').forEach(cb => cb.remove());
        document.querySelector('.checkbox-header')?.remove();

        // Reset grid columns (no checkbox)
        document.querySelector('.element-grid-header').style.gridTemplateColumns =
            '50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        document.querySelectorAll('.element-grid').forEach(el => {
            el.style.gridTemplateColumns = '50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px';
        });
    }
}

// Clear clipboard (called when user wants to exit paste mode)
function clearPropertiesClipboard() {
    propertiesClipboard = null;
    pasteMode = false;
    updatePasteUI();
}
```

### 6. Updated Grid Layout

**Header (without paste mode):**
```html
<div class="element-grid-header">
    <label class="text-gray-300 text-xs">Element</label>
    <label class="text-gray-300 text-xs">Node i</label>
    <label class="text-gray-300 text-xs">Node j</label>
    <label class="text-gray-300 text-xs">E (GPa)</label>
    <label class="text-gray-300 text-xs">Section</label>
    <label class="text-gray-300 text-xs">Profile</label>
    <label class="text-gray-300 text-xs">Axis</label>
    <label class="text-gray-300 text-xs">I (m⁴)</label>
    <label class="text-gray-300 text-xs">A (m²)</label>
    <div></div> <!-- Copy button column -->
    <div></div> <!-- Delete button column -->
</div>
```

**Header (with paste mode):**
```html
<div class="element-grid-header">
    <div class="checkbox-header">
        <input type="checkbox" id="select-all-elements">
    </div>
    <label class="text-gray-300 text-xs">Element</label>
    <!-- ... rest same ... -->
</div>
```

**Element row (updated addElement() function):**
```javascript
elementDiv.innerHTML = `
    <input type="text" value="E${elementCounter}" readonly class="bg-gray-600 text-white p-1 rounded text-xs">
    <input type="text" placeholder="N1" class="bg-gray-600 text-white p-1 rounded text-xs element-i">
    <input type="text" placeholder="N2" class="bg-gray-600 text-white p-1 rounded text-xs element-j">
    <input type="number" step="0.1" value="200" placeholder="E" class="bg-gray-600 text-white p-1 rounded text-xs element-e">
    <select class="bg-gray-600 text-white p-1 rounded text-xs section-type" onchange="onSectionTypeChange('element-${elementCounter}')">
        ${sectionTypeOptions}
    </select>
    <select class="bg-gray-500 text-white p-1 rounded text-xs profile-select" disabled>
        <option value="">-</option>
    </select>
    <select class="bg-gray-500 text-white p-1 rounded text-xs axis-select" disabled>
        <option value="strong">Strong (y-y)</option>
        <option value="weak">Weak (z-z)</option>
    </select>
    <input type="number" step="0.0001" value="0.001" placeholder="I" class="bg-gray-600 text-white p-1 rounded text-xs element-i-val">
    <input type="number" step="0.001" value="0.01" placeholder="A" class="bg-gray-600 text-white p-1 rounded text-xs element-a">
    <button onclick="copyElementProperties('element-${elementCounter}')" class="copy-btn" title="Copy properties">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
    </button>
    <button onclick="removeElement('element-${elementCounter}')" class="delete-btn" title="Delete element">×</button>
`;
```

### 7. CSS Updates

```css
.element-grid {
    display: grid;
    grid-template-columns: 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px;
    gap: 8px;
    align-items: center;
}

.element-grid-header {
    display: grid;
    grid-template-columns: 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px;
    gap: 8px;
    align-items: center;
}

/* When paste mode is active */
.element-grid.paste-mode {
    grid-template-columns: 30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px;
}

.element-grid-header.paste-mode {
    grid-template-columns: 30px 50px 50px 50px 70px 110px 120px 90px 80px 80px 24px 24px;
}

.copy-btn {
    width: 24px;
    height: 24px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.2s;
}

.copy-btn:hover {
    background: #2563eb;
}

.copy-btn.active {
    background: #10b981;
}

.delete-btn {
    width: 24px;
    height: 24px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.2s;
}

.delete-btn:hover {
    background: #b91c1c;
}
```

## Implementation Summary

### File Changes Required

1. **index.html**
   - Update `.element-grid` CSS (line ~71)
   - Update `.element-grid-header` CSS (line ~78)
   - Add `.copy-btn` CSS
   - Add `.delete-btn` CSS
   - Update element grid header labels (line ~148-158)

2. **pynite-interface.js**
   - Add global variables: `propertiesClipboard`, `pasteMode`
   - Update `addElement()` function (line ~547)
   - Add `copyElementProperties()` function
   - Add `pastePropertiesToSelected()` function
   - Add `updatePasteUI()` function
   - Add `clearPropertiesClipboard()` function
   - Update `removeElement()` to handle paste mode if needed

### User Experience Flow

1. **Normal mode**: User sees compact element rows with copy (blue) and delete (red) icon buttons
2. **Copy clicked**: Checkboxes appear, "Paste Properties" button appears, copy button turns green
3. **Select elements**: User checks boxes next to elements they want to apply properties to
4. **Paste clicked**: Properties applied to selected elements, checkboxes cleared but paste mode remains active
5. **Copy another**: Clipboard updates, process repeats
6. **Exit paste mode**: User can copy from different element or close paste mode

### Benefits

- **Reduced width**: ~300px saved (1020px → ~728px max)
- **Better UX**: Visual icon buttons instead of text
- **Efficiency**: Copy properties once, paste to multiple elements
- **Flexibility**: Can keep paste mode active for multiple paste operations
- **Visual feedback**: Green copy button shows active clipboard, checkboxes show selection

## Testing Checklist

- [ ] Element grid fits within container without overflow
- [ ] Copy button copies all relevant properties
- [ ] Paste mode shows checkboxes and paste button
- [ ] Paste applies properties correctly to Custom sections
- [ ] Paste applies properties correctly to database profiles
- [ ] Select all checkbox works
- [ ] Delete button removes elements correctly
- [ ] Paste mode persists across multiple paste operations
- [ ] Grid layout switches correctly between paste/normal mode
- [ ] Copy button highlights when clipboard has data
