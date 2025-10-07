# PyNite Load Combination Implementation Plan

## Key Insight from User

**PyNite requires `combo_name` to extract results:**
```python
beam.members['M1'].shear_array('Fy', n_points=11, combo_name='Live')
beam.members['M1'].moment_array('Mz', n_points=11, combo_name='Dead')
beam.members['M1'].axial_array('Fx', n_points=11, combo_name='ULS Combo')
```

**This means:**
- We MUST use PyNite's `add_load_combo()` API
- Load cases should be treated as "combinations with factor 1.0"
- Load combinations are combinations of load cases
- Same code path extracts results for both

---

## Revised Architecture

### 1. Load Case as Combination

**In PyNite:**
```python
# For a load case "Dead"
model.add_member_dist_load(..., case='Dead')  # Add loads
model.add_load_combo(name='Dead', factors={'Dead': 1.0})  # Create combo with factor 1.0
```

**Result:** Load case "Dead" becomes accessible via `combo_name='Dead'`

### 2. Load Combination

**In PyNite:**
```python
# For combination "ULS" = 1.2×Dead + 1.6×Live
model.add_load_combo(
    name='ULS',
    factors={'Dead': 1.2, 'Live': 1.6}
)
```

**Result:** Combination "ULS" accessible via `combo_name='ULS'`

### 3. Unified Result Extraction

**Same code for both:**
```python
def extract_results_for_combo(model, combo_name):
    """Extract results for any combo (case or combination)"""
    results = {
        'nodes': {},
        'elements': {},
        'diagrams': {}
    }

    # Extract node displacements
    for node_name, node in model.nodes.items():
        results['nodes'][node_name] = {
            'DX': node.DX(combo_name),
            'DY': node.DY(combo_name),
            'DZ': node.DZ(combo_name),
            'RX': node.RX(combo_name),
            'RY': node.RY(combo_name),
            'RZ': node.RZ(combo_name)
        }

    # Extract element forces and diagrams
    for elem_name, member in model.members.items():
        # Point forces at nodes
        results['elements'][elem_name] = {
            'axial_force': member.axial_array('Fx', n_points=2, combo_name=combo_name)[0],
            'shear_force': member.shear_array('Fy', n_points=2, combo_name=combo_name)[0],
            'moment': member.moment_array('Mz', n_points=2, combo_name=combo_name)[0],
            'length': member.L(),
            'i_node': member.i_node.name,
            'j_node': member.j_node.name
        }

        # Diagrams along element
        n_points = 11
        x_coords = [i * member.L() / (n_points - 1) for i in range(n_points)]

        results['diagrams'][elem_name] = {
            'x': x_coords,
            'moments': member.moment_array('Mz', n_points=n_points, combo_name=combo_name),
            'shears': member.shear_array('Fy', n_points=n_points, combo_name=combo_name),
            'axials': member.axial_array('Fx', n_points=n_points, combo_name=combo_name),
            'displacements': member.deflection_array('dy', n_points=n_points, combo_name=combo_name)
        }

    return results
```

---

## Implementation Steps

### Step 1: Update Python Backend - Unified Analysis Function

```python
def analyze_frame_with_combos(input_json):
    """
    Analyze frame with all load cases and combinations

    Args:
        input_json: {
            'nodes': [...],
            'elements': [...],
            'loads': {'nodal': [...], 'distributed': [...], 'elementPoint': [...]},
            'loadCases': [{'name': 'Dead', ...}, {'name': 'Live', ...}],
            'loadCombinations': [{'name': 'ULS', 'factors': {'Dead': 1.2, 'Live': 1.6}}, ...]
        }

    Returns:
        {
            'success': True,
            'loadCaseResults': {
                'Dead': {nodes: {...}, elements: {...}, diagrams: {...}},
                'Live': {...}
            },
            'combinationResults': {
                'ULS': {nodes: {...}, elements: {...}, diagrams: {...}},
                ...
            }
        }
    """
    try:
        data = json.loads(input_json)

        # Create model
        model = FEModel3D()

        # Add nodes
        for node in data['nodes']:
            model.add_node(node['name'], node['x'], node['y'], 0)
            # Add support
            if node['support'] == 'fixed':
                model.def_support(node['name'], True, True, True, True, True, True)
            elif node['support'] == 'pinned':
                model.def_support(node['name'], True, True, True, True, True, False)
            # ... other support types

        # Add elements
        for elem in data['elements']:
            model.add_member(
                elem['name'],
                elem['nodeI'],
                elem['nodeJ'],
                elem['E'] * 1e9,  # Convert GPa to Pa
                elem['E'] * 1e9 / (2 * (1 + 0.3)),  # G
                elem['I'],
                elem['A'],
                elem['I'],
                elem['I']
            )

        # Add loads with case parameter
        loads = data['loads']

        for load in loads['nodal']:
            model.add_node_load(
                load['node'],
                'FX',
                float(load['fx']) * 1000,  # Convert kN to N
                case=load['case']
            )
            model.add_node_load(
                load['node'],
                'FY',
                float(load['fy']) * 1000,
                case=load['case']
            )
            model.add_node_load(
                load['node'],
                'MZ',
                float(load['mz']) * 1000,
                case=load['case']
            )

        for load in loads['distributed']:
            model.add_member_dist_load(
                load['element'],
                load['direction'],
                float(load['w1']) * 1000,
                float(load['w2']) * 1000,
                float(load['x1']),
                float(load['x2']),
                case=load['case']
            )

        for load in loads['elementPoint']:
            model.add_member_pt_load(
                load['element'],
                load['direction'],
                float(load['magnitude']) * 1000,
                float(load['distance']),
                case=load['case']
            )

        # Add load cases as combinations with factor 1.0
        for load_case in data['loadCases']:
            case_name = load_case['name']
            model.add_load_combo(
                name=case_name,
                factors={case_name: 1.0}
            )

        # Add user-defined load combinations
        for combo in data['loadCombinations']:
            model.add_load_combo(
                name=combo['name'],
                factors=combo['factors']
            )

        # Analyze
        model.analyze()

        # Extract results for all load cases
        load_case_results = {}
        for load_case in data['loadCases']:
            case_name = load_case['name']
            load_case_results[case_name] = extract_results_for_combo(model, case_name)

        # Extract results for all combinations
        combination_results = {}
        for combo in data['loadCombinations']:
            combo_name = combo['name']
            combination_results[combo_name] = extract_results_for_combo(model, combo_name)

        return json.dumps({
            'success': True,
            'message': 'Analysis completed',
            'loadCaseResults': load_case_results,
            'combinationResults': combination_results
        })

    except Exception as e:
        return json.dumps({
            'success': False,
            'message': f'Error: {str(e)}',
            'loadCaseResults': {},
            'combinationResults': {}
        })
```

### Step 2: Update JavaScript - Single Analysis Call

```javascript
/**
 * Run analysis for all load cases and combinations in one call
 */
async function runCompleteAnalysis() {
    if (!pyodide) {
        alert("PyNite environment not ready yet. Please wait.");
        return;
    }

    console.log("Running complete analysis...");
    const startTime = performance.now();

    try {
        const nodes = getNodesFromInputs();
        const elements = getElementsFromInputs();

        if (nodes.length === 0 || elements.length === 0) {
            alert("Please add at least one node and one element.");
            return;
        }

        // Sync loads to frameData
        syncUIToFrameData();

        // Prepare input data
        const inputData = {
            nodes: nodes,
            elements: elements,
            loads: frameData.loads,
            loadCases: loadCases,
            loadCombinations: loadCombinations
        };

        const inputDataJson = JSON.stringify(inputData).replace(/'/g, "\\'");

        console.log(`Analyzing ${loadCases.length} load cases and ${loadCombinations.length} combinations...`);

        const analysisResult = await pyodide.runPythonAsync(`
import json
result = analyze_frame_with_combos('${inputDataJson}')
result
        `);

        const results = JSON.parse(analysisResult);
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);

        if (results.success) {
            // Cache all load case results
            for (const [caseName, caseResults] of Object.entries(results.loadCaseResults)) {
                analysisResults.loadCases[caseName] = {
                    success: true,
                    ...caseResults
                };
                console.log(`  ✓ Load case "${caseName}" analyzed`);
            }

            // Cache all combination results
            for (const [comboName, comboResults] of Object.entries(results.combinationResults)) {
                analysisResults.combinations[comboName] = {
                    success: true,
                    ...comboResults
                };
                console.log(`  ✓ Combination "${comboName}" analyzed`);
            }

            console.log(`✓ Complete analysis finished in ${duration}s`);

            // Enable Analysis tab
            if (!isAnalysisTabEnabled()) {
                enableAnalysisTab();
                // Set initial view to first load case
                resultViewMode = 'loadCases';
                activeResultName = loadCases[0].name;
                updateResultSelectionDropdown();
                switchTab('analysis');
            }

            // Display first result
            await displayAnalysisResults(
                activeResultName,
                analysisResults.loadCases[activeResultName]
            );

            alert(`Analysis complete! ${loadCases.length} cases and ${loadCombinations.length} combinations analyzed in ${duration}s`);

        } else {
            throw new Error(results.message);
        }

    } catch (error) {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);
        console.error(`✗ Analysis failed in ${duration}s:`, error);
        alert(`Analysis failed: ${error.message}`);
    }
}
```

### Step 3: Simplify Individual Analysis Functions

```javascript
/**
 * Get results for a load case (from cache or run full analysis)
 */
async function getLoadCaseResults(caseName) {
    // Check cache
    if (analysisResults.loadCases[caseName]) {
        console.log(`✓ Using cached results for: ${caseName}`);
        return analysisResults.loadCases[caseName];
    }

    // Not in cache - need to run full analysis
    console.log(`Results not cached for "${caseName}". Running complete analysis...`);
    await runCompleteAnalysis();

    return analysisResults.loadCases[caseName];
}

/**
 * Get results for a combination (from cache or run full analysis)
 */
async function getCombinationResults(comboName) {
    // Check cache
    if (analysisResults.combinations[comboName]) {
        console.log(`✓ Using cached results for: ${comboName}`);
        return analysisResults.combinations[comboName];
    }

    // Not in cache - need to run full analysis
    console.log(`Results not cached for "${comboName}". Running complete analysis...`);
    await runCompleteAnalysis();

    return analysisResults.combinations[comboName];
}

/**
 * Updated result selection handler
 */
async function onResultSelectionChange(resultName) {
    if (!resultName) return;

    activeResultName = resultName;
    console.log(`Selected result: ${resultName} (${resultViewMode})`);

    try {
        let results;

        if (resultViewMode === 'loadCases') {
            results = await getLoadCaseResults(resultName);
        } else if (resultViewMode === 'combinations') {
            results = await getCombinationResults(resultName);
        }

        if (results) {
            await displayAnalysisResults(resultName, results);
        }

    } catch (error) {
        alert(`Failed to load results: ${error.message}`);
    }
}
```

### Step 4: Update UI to Distinguish Cases vs Combinations

**In Analysis tab results display:**
```javascript
async function displayAnalysisResults(resultName, results) {
    lastAnalysisResults = results;

    // Update visualization
    updateVisualization();
    const diagramType = document.getElementById('diagram-type')?.value;
    if (diagramType && diagramType !== 'none') {
        updateVisualizationWithDiagram();
    }

    // Show badge indicating if it's a case or combination
    const badge = resultViewMode === 'loadCases'
        ? '<span class="inline-block px-2 py-1 text-xs rounded bg-blue-600 text-white">Load Case</span>'
        : '<span class="inline-block px-2 py-1 text-xs rounded bg-purple-600 text-white">Combination</span>';

    const resultsContainer = document.getElementById('analysis-results-container');
    if (resultsContainer && results.nodes && results.elements) {
        let html = `<div class="mb-3"><h5 class="text-white font-medium inline">${resultName}</h5> ${badge}</div>`;
        html += '<div class="space-y-4">';

        // ... rest of results display
    }
}
```

---

## Benefits of This Approach

1. ✅ **PyNite Native**: Uses PyNite's built-in combination system
2. ✅ **Single Analysis**: All cases and combos analyzed in one call
3. ✅ **Correct Results**: PyNite handles the superposition internally
4. ✅ **Unified Code**: Same extraction logic for cases and combinations
5. ✅ **Fast Switching**: All results cached after one analysis
6. ✅ **User-Friendly**: Visual distinction between cases and combinations

---

## Migration Path

### Phase 1: Add New Functions
- ✅ Create `analyze_frame_with_combos()` in Python
- ✅ Create `extract_results_for_combo()` in Python
- ✅ Create `runCompleteAnalysis()` in JavaScript

### Phase 2: Update Existing Functions
- ⬜ Replace `runAnalysisForLoadCase()` with `getLoadCaseResults()`
- ⬜ Replace `runAnalysisForCombination()` with `getCombinationResults()`
- ⬜ Update `onResultSelectionChange()`

### Phase 3: Remove Old Functions
- ⬜ Remove `analyze_frame_single_case()`
- ⬜ Remove old `analyze_frame_combination()`
- ⬜ Clean up unused code

### Phase 4: Test
- ⬜ Test with 2 load cases
- ⬜ Test with 1 combination (verify superposition)
- ⬜ Test cache functionality
- ⬜ Test UI switching between cases/combos

---

## Testing Example

**Setup:**
- Simple beam: 2 nodes, 1 element, L=4m
- Dead: -10 kN at tip
- Live: -20 kN at tip
- Combo ULS: 1.2×Dead + 1.6×Live

**Expected Results:**
- Dead tip deflection: δ₁
- Live tip deflection: δ₂
- ULS tip deflection: 1.2×δ₁ + 1.6×δ₂

**Verify in Console:**
```
✓ Load case "Dead" analyzed
✓ Load case "Live" analyzed
✓ Combination "ULS" analyzed
✓ Complete analysis finished in 0.XXXs
```

---

## User Experience

**From User Perspective:**
1. User clicks "Run Analysis" → All cases and combos analyzed once
2. User switches to Analysis tab
3. User selects radio: "Load Cases" → Dropdown shows Dead, Live, etc.
4. User selects "Dead" → Results appear instantly (cached)
5. User changes radio to "Load Combinations" → Dropdown shows ULS, etc.
6. User selects "ULS" → Results appear instantly (cached)
7. Badge shows whether viewing a "Load Case" or "Combination"

**No re-analysis needed when switching!**
