# Phase 4: Analysis Tab Implementation Plan

## Overview
Implement the Analysis tab with radio button selection between Load Cases and Load Combinations, results caching, and dynamic UI updates.

---

## ✅ Already Completed
- Phase 1: Load Cases core functionality (data structure, UI, isolation per case)
- Phase 2: Load Cases UI (table, add/edit/delete, visualization filtering)
- Phase 3: Load Combinations UI (modal, form-based add/edit, CRUD operations)

---

## 🎯 Phase 4: Analysis Tab & Results - Detailed Plan

### **Step 1: Create Analysis Tab Structure** (HTML + Basic UI)

**Tasks:**
1. Add third tab button "Analysis" to top navigation
2. Create tab content container `#content-analysis` (hidden by default)
3. Add CSS class for disabled tab state
4. Create Analysis tab layout:
   ```
   ┌─ Analysis Tab ─────────────────────────┐
   │ View Results:                           │
   │   ⦿ Load Cases   ○ Load Combinations    │
   │                                         │
   │ Show results for: [Dead ▼]             │
   │                                         │
   │ [Run Analysis]                          │
   │                                         │
   │ ─── Diagram Display ───                │
   │ Diagram Type: [Moment ▼]               │
   │ Scale: [1.0] [Auto-scale]              │
   │                                         │
   │ [Frame Visualization Here]             │
   │                                         │
   │ ─── Results Summary ───                │
   │ [Results tables/data here]             │
   └─────────────────────────────────────────┘
   ```

**HTML Elements to Add:**
- Radio buttons: `name="result-view-mode"` (load-cases / load-combinations)
- Dropdown: `#result-selection-dropdown`
- Button: `#run-analysis-btn`
- Move from Structure tab:
  - Diagram type dropdown
  - Scale input + autoscale button
  - Frame SVG visualization (or duplicate it)
  - Results container

**Files:** `index.html`

---

### **Step 2: Tab Management & State**

**Tasks:**
1. Implement tab switching logic
2. Keep Analysis tab disabled initially
3. Add `analysisTabEnabled` global variable
4. Enable tab after first successful analysis
5. Auto-switch to Analysis tab after first run

**JavaScript Functions:**
- `switchTab(tabName)` - enhanced to handle disabled state
- `enableAnalysisTab()` - remove disabled class, allow clicks
- `isAnalysisTabEnabled()` - check if tab can be clicked

**Files:** `pynite-interface.js`

---

### **Step 3: Results View Mode Management**

**Tasks:**
1. Add radio button event listeners
2. Implement `setResultViewMode(mode)` function
3. Update dropdown options when mode changes
4. Store current mode in `resultViewMode` variable

**Flow:**
```
User clicks "Load Cases" radio
  → setResultViewMode('loadCases')
  → updateResultSelectionDropdown()
  → Populate with: Dead, Live, Snow, etc.

User clicks "Load Combinations" radio
  → setResultViewMode('combinations')
  → updateResultSelectionDropdown()
  → Populate with: ULS Combo, SLS Char, etc.
```

**JavaScript Functions:**
- `setResultViewMode(mode)` - 'loadCases' or 'combinations'
- `updateResultSelectionDropdown()` - populate based on mode
- `onResultSelectionChange(name)` - when dropdown changes

**Files:** `pynite-interface.js`

---

### **Step 4: PyNite Backend Modifications**

**Current State:**
- `analyze_frame_json()` analyzes all loads at once
- No concept of load cases in Python code

**Required Changes:**

#### 4.1: Modify Python to Accept Load Case
```python
def analyze_frame_single_case(json_str, case_name):
    """Analyze frame for a single load case"""
    data = json.loads(json_str)

    # Filter loads by case
    case_loads = {
        'nodal': [l for l in data['loads']['nodal'] if l['case'] == case_name],
        'distributed': [l for l in data['loads']['distributed'] if l['case'] == case_name],
        'elementPoint': [l for l in data['loads']['elementPoint'] if l['case'] == case_name]
    }

    # Run analysis with filtered loads
    # ... (existing analysis code)

    return json.dumps(results)
```

#### 4.2: Add Load Combination Analysis
```python
def analyze_frame_combination(json_str, combo_data):
    """Analyze frame for a load combination with factors"""
    # combo_data = {'name': '...', 'factors': {'Dead': 1.2, 'Live': 1.6}}

    data = json.loads(json_str)
    model = FEModel3D()

    # ... setup nodes, elements, supports ...

    # Apply loads with factors
    for case_name, factor in combo_data['factors'].items():
        if factor == 0:
            continue

        case_loads = filter_loads_by_case(data['loads'], case_name)

        for load in case_loads['distributed']:
            model.add_member_dist_load(
                member_name=load['element'],
                direction=load['direction'],
                w1=load['w1'] * 1000 * factor,  # Apply factor!
                w2=load['w2'] * 1000 * factor,
                x1=load['x1'],
                x2=load['x2']
            )
        # ... (same for nodal and element point loads)

    model.analyze()
    return extract_results(model)
```

**Files:** Python code embedded in `pynite-interface.js` (lines ~110-250)

---

### **Step 5: Analysis Execution Functions**

**JavaScript Functions to Create:**

#### 5.1: Analyze Single Load Case
```javascript
async function runAnalysisForLoadCase(caseName) {
    // Check if already cached
    if (analysisResults.loadCases[caseName]) {
        console.log(`Results for "${caseName}" already cached`);
        return analysisResults.loadCases[caseName];
    }

    console.log(`Analyzing load case: ${caseName}`);

    // Prepare data
    const inputData = {
        nodes: getNodesFromInputs(),
        elements: getElementsFromInputs(),
        loads: frameData.loads  // All loads with case property
    };

    // Run Python analysis
    const result = await pyodide.runPython(`
        analyze_frame_single_case('${JSON.stringify(inputData)}', '${caseName}')
    `);

    const results = JSON.parse(result);

    // Cache results
    analysisResults.loadCases[caseName] = results;

    return results;
}
```

#### 5.2: Analyze Load Combination
```javascript
async function runAnalysisForCombination(comboName) {
    // Check if already cached
    if (analysisResults.combinations[comboName]) {
        console.log(`Results for "${comboName}" already cached`);
        return analysisResults.combinations[comboName];
    }

    // Find combination
    const combo = loadCombinations.find(c => c.name === comboName);
    if (!combo) {
        throw new Error(`Combination "${comboName}" not found`);
    }

    console.log(`Analyzing combination: ${comboName}`);

    // Prepare data
    const inputData = {
        nodes: getNodesFromInputs(),
        elements: getElementsFromInputs(),
        loads: frameData.loads
    };

    // Run Python analysis with combination factors
    const result = await pyodide.runPython(`
        analyze_frame_combination(
            '${JSON.stringify(inputData)}',
            '${JSON.stringify(combo)}'
        )
    `);

    const results = JSON.parse(result);

    // Cache results
    analysisResults.combinations[comboName] = results;

    return results;
}
```

#### 5.3: Display Results
```javascript
async function displayAnalysisResults(resultName) {
    let results;

    if (resultViewMode === 'loadCases') {
        results = await runAnalysisForLoadCase(resultName);
    } else {
        results = await runAnalysisForCombination(resultName);
    }

    // Update visualization
    lastAnalysisResults = results;
    updateVisualization();

    // Update results tables
    displayResultsTables(results);

    console.log(`✓ Displayed results for: ${resultName}`);
}
```

**Files:** `pynite-interface.js`

---

### **Step 6: UI Event Handlers**

**Tasks:**
1. Wire up radio buttons to `setResultViewMode()`
2. Wire up dropdown to `displayAnalysisResults()`
3. Wire up "Run Analysis" button
4. Update diagram type/scale controls to use cached results

**Event Handlers:**
```javascript
// Radio button change
document.querySelectorAll('input[name="result-view-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        setResultViewMode(e.target.value);
    });
});

// Dropdown change
document.getElementById('result-selection-dropdown').addEventListener('change', (e) => {
    const resultName = e.target.value;
    activeResultName = resultName;
    displayAnalysisResults(resultName);
});

// Run Analysis button
document.getElementById('run-analysis-btn').addEventListener('click', async () => {
    await displayAnalysisResults(activeResultName);
});
```

**Files:** `pynite-interface.js`

---

### **Step 7: Migrate Current "Run Analysis" Button**

**Current Behavior:**
- "Run Analysis" in Structure tab analyzes all loads for active load case
- Results stored in `lastAnalysisResults`
- Displays results in Structure tab

**New Behavior:**
- "Run Analysis" becomes "Run Analysis for [Active Case]"
- Clicking it:
  1. Runs analysis for active load case
  2. Caches in `analysisResults.loadCases[activeLoadCase]`
  3. Enables Analysis tab
  4. Switches to Analysis tab
  5. Displays results there

**Tasks:**
1. Update existing `runAnalysis()` button handler
2. Add `enableAnalysisTab()` call on success
3. Add `switchTab('analysis')` call on success
4. Set `resultViewMode = 'loadCases'` and `activeResultName = activeLoadCase`

**Files:** `pynite-interface.js`, `index.html`

---

### **Step 8: Batch Analysis Options**

**Optional Features:**
1. "Run All Load Cases" button
   - Loops through all load cases
   - Runs analysis for each
   - Caches all results

2. "Run Selected Combinations" in Load Combinations modal
   - Add checkboxes to each combination
   - Button runs analysis for checked items
   - Shows progress indicator

**Implementation Later:** Phase 5 polish

---

## 📋 Implementation Checklist

### Step 1: HTML Structure ☐
- [ ] Add Analysis tab button to navigation
- [ ] Create `#content-analysis` container
- [ ] Add radio buttons (Load Cases / Combinations)
- [ ] Add result selection dropdown
- [ ] Add Run Analysis button
- [ ] Move/duplicate diagram controls
- [ ] Move/duplicate results display area
- [ ] Add disabled tab styling

### Step 2: Tab Management ☐
- [ ] Implement `enableAnalysisTab()`
- [ ] Update `switchTab()` to handle disabled state
- [ ] Initialize tab as disabled on load

### Step 3: View Mode Logic ☐
- [ ] Implement `setResultViewMode(mode)`
- [ ] Implement `updateResultSelectionDropdown()`
- [ ] Wire up radio button events
- [ ] Wire up dropdown change event

### Step 4: PyNite Backend ☐
- [ ] Create `analyze_frame_single_case()` Python function
- [ ] Create `analyze_frame_combination()` Python function
- [ ] Add to Pyodide initialization

### Step 5: Analysis Functions ☐
- [ ] Implement `runAnalysisForLoadCase()`
- [ ] Implement `runAnalysisForCombination()`
- [ ] Implement `displayAnalysisResults()`
- [ ] Add caching logic with cache checks

### Step 6: Integration ☐
- [ ] Update existing Run Analysis button
- [ ] Test analysis → enable tab → switch to tab flow
- [ ] Test switching between load cases
- [ ] Test switching between combinations
- [ ] Test cache effectiveness (no re-run when switching)

### Step 7: Testing ☐
- [ ] Test with multiple load cases
- [ ] Test with multiple combinations
- [ ] Test switching view modes
- [ ] Test results display
- [ ] Test with no combinations defined
- [ ] Test cache persistence during session

---

## 🎬 Next Steps

**Start with:** Step 1 - Create Analysis Tab Structure (HTML)

**Then:** Step 2 - Tab Management

**Order:** Follow steps 1→7 sequentially for best results

---

## 🔍 Key Design Decisions

1. **Caching Strategy:** Results stored in `analysisResults` object, keyed by case/combo name
2. **No Automatic Re-analysis:** Switching cases/combos shows cached results (fast)
3. **User-Triggered Analysis:** User explicitly runs analysis via button
4. **Tab Activation:** Analysis tab only enabled after first successful analysis
5. **View Mode:** Radio buttons determine whether dropdown shows cases or combos
6. **Shared Visualization:** Same SVG/diagram area used for all result types

---

## 📊 Data Flow Diagram

```
User Action → View Mode Selection
              ↓
         Radio Button (Load Cases / Combinations)
              ↓
         updateResultSelectionDropdown()
              ↓
         Populate Dropdown
              ↓
User Selects → Case/Combo Name
              ↓
         displayAnalysisResults(name)
              ↓
    Check Cache: analysisResults[mode][name]
         ↓                    ↓
    EXISTS               NOT EXISTS
         ↓                    ↓
    Return Cache        Run Analysis
                             ↓
                        Cache Results
                             ↓
                    ← Return Results ←
                             ↓
                    Update Visualization
```
