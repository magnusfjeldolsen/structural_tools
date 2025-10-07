# Load Combination Correction Plan

## Problem Identified

**Current (WRONG) Approach:**
```
For combination: 1.2×Dead + 1.6×Live
1. Scale loads: Dead loads × 1.2, Live loads × 1.6
2. Combine all scaled loads into one model
3. Run FEM analysis on combined loads
```

**Why it's wrong:** This re-runs the entire FEM analysis which is unnecessary and potentially introduces numerical differences.

**Correct Approach (Linear Superposition):**
```
For combination: 1.2×Dead + 1.6×Live
1. Run FEM analysis for Dead load case → Get results_dead
2. Run FEM analysis for Live load case → Get results_live
3. Combine results: results_combo = 1.2 × results_dead + 1.6 × results_live
```

This is valid because **FEM is linear** (for small displacements).

---

## Implementation Plan

### Step 1: Analyze All Load Cases First

When user requests a combination analysis:
1. Check which load cases are needed (non-zero factors)
2. For each needed case:
   - Check if already analyzed (in cache)
   - If not, run `runAnalysisForLoadCase(caseName)`
3. Collect all case results

### Step 2: Create Result Combination Function (Python)

```python
def combine_results(case_results_dict, factors):
    """
    Combine results from multiple load cases using linear superposition

    Args:
        case_results_dict: {'Dead': results_dead, 'Live': results_live, ...}
        factors: {'Dead': 1.2, 'Live': 1.6, ...}

    Returns:
        Combined results dictionary
    """
    combined = {
        'nodes': {},
        'elements': {},
        'diagrams': {}
    }

    # Combine node displacements
    for case_name, factor in factors.items():
        if factor == 0:
            continue

        case_results = case_results_dict[case_name]

        for node_name, node_data in case_results['nodes'].items():
            if node_name not in combined['nodes']:
                combined['nodes'][node_name] = {
                    'DX': 0.0, 'DY': 0.0, 'DZ': 0.0,
                    'RX': 0.0, 'RY': 0.0, 'RZ': 0.0
                }

            combined['nodes'][node_name]['DX'] += node_data['DX'] * factor
            combined['nodes'][node_name]['DY'] += node_data['DY'] * factor
            combined['nodes'][node_name]['DZ'] += node_data['DZ'] * factor
            combined['nodes'][node_name]['RX'] += node_data['RX'] * factor
            combined['nodes'][node_name]['RY'] += node_data['RY'] * factor
            combined['nodes'][node_name]['RZ'] += node_data['RZ'] * factor

    # Combine element forces
    for case_name, factor in factors.items():
        if factor == 0:
            continue

        case_results = case_results_dict[case_name]

        for elem_name, elem_data in case_results['elements'].items():
            if elem_name not in combined['elements']:
                combined['elements'][elem_name] = {
                    'axial_force': 0.0,
                    'shear_force': 0.0,
                    'moment': 0.0,
                    'length': elem_data['length'],  # Geometry doesn't change
                    'i_node': elem_data['i_node'],
                    'j_node': elem_data['j_node']
                }

            combined['elements'][elem_name]['axial_force'] += elem_data['axial_force'] * factor
            combined['elements'][elem_name]['shear_force'] += elem_data['shear_force'] * factor
            combined['elements'][elem_name]['moment'] += elem_data['moment'] * factor

    # Combine diagrams (moment, shear, axial, displacement along elements)
    for case_name, factor in factors.items():
        if factor == 0:
            continue

        case_results = case_results_dict[case_name]

        if 'diagrams' not in case_results:
            continue

        for elem_name, diagram_data in case_results['diagrams'].items():
            if elem_name not in combined['diagrams']:
                # Initialize with zeros, copy x-coordinates
                combined['diagrams'][elem_name] = {
                    'x': diagram_data['x'][:],  # x coords are the same
                    'moments': [0.0] * len(diagram_data['moments']),
                    'shears': [0.0] * len(diagram_data['shears']),
                    'axials': [0.0] * len(diagram_data['axials']),
                    'displacements': [0.0] * len(diagram_data['displacements'])
                }

            # Add scaled values
            for i in range(len(diagram_data['moments'])):
                combined['diagrams'][elem_name]['moments'][i] += diagram_data['moments'][i] * factor
                combined['diagrams'][elem_name]['shears'][i] += diagram_data['shears'][i] * factor
                combined['diagrams'][elem_name]['axials'][i] += diagram_data['axials'][i] * factor
                combined['diagrams'][elem_name]['displacements'][i] += diagram_data['displacements'][i] * factor

    return combined
```

### Step 3: Update JavaScript Function

```javascript
async function runAnalysisForCombination(comboName) {
    // Check cache first
    if (analysisResults.combinations[comboName]) {
        console.log(`✓ Using cached results for combination: ${comboName}`);
        return analysisResults.combinations[comboName];
    }

    console.log(`Analyzing combination: ${comboName}...`);
    const startTime = performance.now();

    try {
        // Find combination
        const combo = loadCombinations.find(c => c.name === comboName);
        if (!combo) {
            throw new Error(`Combination "${comboName}" not found`);
        }

        // Step 1: Analyze all needed load cases
        const caseResultsDict = {};
        for (const [caseName, factor] of Object.entries(combo.factors)) {
            if (factor === 0) continue;

            console.log(`  Analyzing ${caseName} (factor: ${factor})...`);
            const caseResults = await runAnalysisForLoadCase(caseName);
            caseResultsDict[caseName] = caseResults;
        }

        // Step 2: Combine results using linear superposition (Python)
        const caseResultsJson = JSON.stringify(caseResultsDict).replace(/'/g, "\\'");
        const factorsJson = JSON.stringify(combo.factors).replace(/'/g, "\\'");

        const combinedResult = await pyodide.runPythonAsync(`
import json
case_results = json.loads('${caseResultsJson}')
factors = json.loads('${factorsJson}')
combined = combine_results(case_results, factors)
json.dumps({
    'success': True,
    'message': 'Combination completed',
    'combinationName': '${comboName}',
    'nodes': combined['nodes'],
    'elements': combined['elements'],
    'diagrams': combined['diagrams']
})
        `);

        const results = JSON.parse(combinedResult);
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);

        // Cache results
        analysisResults.combinations[comboName] = results;
        console.log(`✓ Combination completed for "${comboName}" in ${duration}s`);
        return results;

    } catch (error) {
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(3);
        console.error(`✗ Combination failed for "${comboName}" in ${duration}s:`, error);
        throw error;
    }
}
```

### Step 4: Update Python Code

Add the `combine_results()` function to the Python code in `pynite-interface.js` (before `analyze_frame_combination`).

### Step 5: Remove Old `analyze_frame_combination` Function

The old function that re-runs FEM with scaled loads is not needed anymore.

---

## Benefits of Correct Approach

1. **More efficient**: Only runs FEM once per load case, not once per combination
2. **Correct results**: Uses proper linear superposition
3. **Consistent**: Results match analytical expectations
4. **Reusable**: Load case results can be used for multiple combinations
5. **Faster**: Combinations compute instantly (just arithmetic, no FEM)

---

## Implementation Steps

1. ✅ Understand current wrong approach
2. ⬜ Add `combine_results()` Python function
3. ⬜ Update `runAnalysisForCombination()` JavaScript function
4. ⬜ Test with simple example (verify results manually)
5. ⬜ Remove old `analyze_frame_combination()` function
6. ⬜ Update console messages to show "Combining results" instead of "Analyzing"

---

## Testing Plan

**Test Case:**
- 2-node beam, 1 element
- Dead load: -10 kN at tip
- Live load: -20 kN at tip
- Combination: 1.2×Dead + 1.6×Live = 1.2×(-10) + 1.6×(-20) = -44 kN

**Expected:**
- Dead case: Moment at fixed = -10 × L
- Live case: Moment at fixed = -20 × L
- Combination: Moment at fixed = -44 × L

**Verify:**
- Run Dead analysis → Check moment
- Run Live analysis → Check moment
- Run Combination → Check moment = 1.2×Dead_moment + 1.6×Live_moment

---

## Current Status

- ❌ Current implementation: Wrong (re-analyzing with scaled loads)
- ⬜ Corrected implementation: Not done yet
- ⬜ Testing: Not done yet
