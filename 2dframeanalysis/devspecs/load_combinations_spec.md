# Load Cases and Load Combinations - Implementation Specification

## Overview
Implement a comprehensive load case and load combination system for the 2D Frame Analysis tool, following PyNite's methodology and FEM-Design's UI patterns.

## Background: PyNite Implementation
PyNite handles load cases and combinations as follows:

```python
# Apply loads to specific load cases
model.add_member_dist_load(member_name='M1', direction='FY', x1=0, w1=-10, x2=1, w2=-10, case='Dead')
model.add_member_dist_load(member_name='M1', direction='FY', x1=0, w1=-20, x2=1, w2=-20, case='Live')

# Define load combinations with factors
model.add_load_combo(name='Strength Combo 1', factors={'Dead': 1.2, 'Live': 1.6})
model.add_load_combo(name='Serviceability', factors={'Dead': 1.0, 'Live': 1.0})
```

## Part 1: Load Cases

### 1.1 Load Case Definition
Each load case should have the following properties:
- **Name**: User-defined string (e.g., "Dead", "Live", "Snow", "Wind")
- **Type**: Dropdown selection (initially for future use):
  - `'Ordinary'` (default)
  - `'+Struc. dead load'` (includes element self-weight - to be implemented later)
- **Duration Class**: For future EC5 (wooden structures) compliance
  - `'Permanent'` (default)
  - `'Long-term'`
  - `'Medium-term'`
  - `'Short-term'`
  - `'Instantaneous'`

### 1.2 Load Case UI Requirements

**Location**: Add a new section in the left panel, between "Loads" section and before "Load Combinations" button

**Tab Structure** (Left Panel):
```
├─ Structure (existing)
│   ├─ Nodes
│   ├─ Elements
│   └─ ...
├─ Loads (existing)
│   ├─ Nodal Loads
│   ├─ Distributed Loads
│   └─ Element Point Loads
├─ Load Cases (NEW)
│   └─ (content below)
└─ [⚙ Load Combinations] (button)
```

**Layout**:
```
┌─ Load Cases ────────────────────────┐
│ [Currently Active: Dead        ▼]   │
│                                      │
│ Name          Type        Duration   │
│ Dead          +Struc...   Permanent  │
│ Live          Ordinary    Permanent  │
│ Snow          Ordinary    Permanent  │
│                                      │
│ [+ Add Load Case]  [Manage Cases]   │
└──────────────────────────────────────┘
```

**Features**:
- **Active Case Dropdown**: Large dropdown at top showing currently active load case
  - Arrow keys (↑/↓) navigate between cases
  - All new loads are assigned to the currently active case
  - Visual indicator showing which case is active

- **Load Cases Table**: Simple table showing all defined cases
  - Columns: Name, Type, Duration Class
  - Click row to make that case active

- **Add Load Case Button**: Opens dialog to create new case
  - Default cases: "Dead", "Live" should be pre-created

- **Manage Cases Button**: Opens full management dialog (edit/delete cases)

### 1.3 Load Assignment Behavior
- All loads (nodal, distributed, element point) are assigned to the **currently active load case**
- Visual indicator in load input sections showing: `"Loads will be added to: [Active Case Name]"`
- When switching active case, existing loads remain in their original case
- Each load stores a `case` property (string)

### 1.4 Visualization
- Diagram should show loads for **currently active case only**
- Add a checkbox: `☑ Show all load cases` to overlay all loads with different colors per case
- Legend showing which color represents which load case

## Part 2: Load Combinations

### 2.1 Load Combination Definition
Each load combination should have:
- **Name**: User-defined string (e.g., "610b ULS - Snow Dominating", "SLS Char.")
- **Combo Tag**: ⚠️ **REQUIRED** - Category dropdown for filtering different scenarios
  - `ULS` (Ultimate Limit State) - For capacity checks
  - `ALS` (Accidental Limit State) - For exceptional events
  - `Characteristic` - SLS serviceability checks
  - `Frequent` - SLS frequent load scenarios
  - `Quasi-Permanent` - SLS quasi-permanent loads (e.g., for stiffness calculations)
  - **Purpose**: Enables filtering combinations by analysis type (e.g., show only stiffness-related combos, or only ULS capacity combos)
- **Factors**: Dictionary of `{load_case_name: factor_value}`
  - Example: `{'Dead': 1.2, 'Live': 1.6, 'Snow': 1.5}`

### 2.2 Load Combinations UI

**Trigger**: Button in left panel: `[⚙ Load Combinations]`

**Modal/Popup Window** (styled like existing export toolbar):
```
┌─ Load Combinations ──────────────────────────────────┐
│                                                       │
│  Combinations List:                  [+ Add Combo]   │
│  ┌───────────────────────────────────────────────┐   │
│  │ ☑ 610b ULS - Snow Dom.  [Edit] [Delete]      │   │
│  │   Tag: ULS                                    │   │
│  │   1.20 × Dead                                 │   │
│  │   1.05 × Live                                 │   │
│  │   1.50 × Snow                                 │   │
│  ├───────────────────────────────────────────────┤   │
│  │ ☐ SLS Char.             [Edit] [Delete]      │   │
│  │   Tag: Characteristic                         │   │
│  │   1.00 × Dead                                 │   │
│  │   1.00 × Live                                 │   │
│  │   1.00 × Snow                                 │   │
│  ├───────────────────────────────────────────────┤   │
│  │ ☐ SLS QP                [Edit] [Delete]      │   │
│  │   Tag: Quasi-Permanent                        │   │
│  │   1.00 × Dead                                 │   │
│  │   0.30 × Live                                 │   │
│  │   0.20 × Snow                                 │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  [Close]                   [Run Selected Analysis]   │
└───────────────────────────────────────────────────────┘
```

**Features**:
- **Checkbox per combination**: Select which combinations to run analysis for
- **Add Combo Button**: Opens dialog to create new combination
- **Edit Button**: Modify existing combination
- **Delete Button**: Remove combination
- **Run Selected Analysis**:
  1. First analyzes all individual load cases (if not already done)
  2. Then analyzes all checked combinations
  3. Stores all results in browser memory
  4. Updates UI to show results dropdown
- **Collapsible sections**: Click combination name to expand/collapse factor details

### 2.3 Add/Edit Combination Dialog
```
┌─ Create Load Combination ────────────────┐
│                                           │
│  Name: [610b ULS - Snow Dominating    ]  │
│                                           │
│  Combo Tag: [ULS                      ▼] │
│                                           │
│  Load Case Factors:                      │
│  ┌────────────────────────────────────┐  │
│  │ Dead    [1.20]  [✓]                │  │
│  │ Live    [1.05]  [✓]                │  │
│  │ Snow    [1.50]  [✓]                │  │
│  │ Wind    [0.00]  [☐]  (not included)│  │
│  └────────────────────────────────────┘  │
│                                           │
│  [Cancel]              [Save Combination]│
└───────────────────────────────────────────┘
```

**Features**:
- List all defined load cases
- Each case has:
  - Factor input field (number)
  - Checkbox to include/exclude from combination
- Only checked cases are included in the combination
- Factors can be negative (e.g., for uplift scenarios)

## Part 3: Analysis Integration

### 3.0 Critical: Client-Side Storage Architecture

⚠️ **IMPORTANT**: This application runs entirely **client-side in the browser** with no backend server.

**Storage Strategy**:
- All data stored in JavaScript variables (browser memory)
- Analysis runs using **Pyodide** (Python in WebAssembly) in the browser
- PyNite library runs client-side via Pyodide
- Results cached in memory for the session
- Optional: Use `localStorage` for persistence across browser sessions

**Key Implications**:
1. All load cases, combinations, and results stored in global JavaScript objects
2. Refreshing browser clears data (unless saved to localStorage)
3. No server-side API calls - everything is local
4. Fast switching between results (already in memory)

### 3.1 Modified Analysis Workflow

**Current State**: Single analysis run, stores results in `lastAnalysisResults`

**New State**:
- Analyze **each load case individually** first
- Then analyze **selected load combinations**
- Store all results in browser memory

```javascript
// Store results for both load cases and combinations
let analysisResults = {
  loadCases: {
    'Dead': { nodes: {...}, elements: {...}, diagrams: {...} },
    'Live': { nodes: {...}, elements: {...}, diagrams: {...} },
    'Snow': { nodes: {...}, elements: {...}, diagrams: {...} }
  },
  combinations: {
    '610b ULS - Snow Dom.': { nodes: {...}, elements: {...}, diagrams: {...} },
    'SLS Char.': { nodes: {...}, elements: {...}, diagrams: {...} },
    'SLS QP': { nodes: {...}, elements: {...}, diagrams: {...} }
  }
};

// Track which view is active
let resultViewMode = 'loadCases'; // or 'combinations'
let activeResultName = 'Dead'; // Currently displayed load case or combination name
```

### 3.2 Analysis Results Display - NEW "Analysis" TAB

**Location**: Create a new tab in the top navigation: **Structure | Loads | Analysis**

**Tab Purpose**: View and analyze results from load cases and combinations

**Current Top Tabs**:
```
┌─────────────┬───────────┬─────────┐
│ Structure   │  Loads    │ (none)  │
└─────────────┴───────────┴─────────┘
```

**NEW Top Tabs**:
```
┌─────────────┬───────────┬───────────┐
│ Structure   │  Loads    │ Analysis  │  ← NEW TAB
└─────────────┴───────────┴───────────┘
```

**Analysis Tab Layout**:
```
┌─ Analysis Tab ──────────────────────────────────┐
│                                                  │
│  View Results: ⦿ Load Cases   ○ Load Combos    │
│                                                  │
│  Results for: [Dead ▼]                          │
│               (or [610b ULS - Snow Dom. ▼])     │
│                                                  │
│  [Run Analysis for Selected Combinations]       │
│                                                  │
│  ─────────────────────────────────────────      │
│                                                  │
│  Diagram Type: [Moment ▼]                       │
│  Scale: [1.0] [Auto-scale]                      │
│                                                  │
│  ┌─ Frame Visualization ─────────────────┐      │
│  │                                        │      │
│  │     (Diagram shown here)               │      │
│  │                                        │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  Results Summary:                               │
│  • Max Moment: 45.2 kNm at E1, x=2.5m          │
│  • Max Shear: 25.0 kN at E2, x=0.0m            │
│  • Max Deflection: -8.5 mm at E1, x=2.0m       │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Features**:
- **Separate Tab**: Analysis results live in their own dedicated space
- **Radio buttons** to switch between viewing Load Cases or Load Combinations
- **Load Cases mode**: Dropdown shows individual cases (Dead, Live, Snow, etc.)
  - Shows results for a single load case
  - Useful for understanding individual load effects
- **Load Combinations mode**: Dropdown shows combinations (610b ULS, SLS Char., etc.)
  - Shows combined results with factors applied
  - Used for code compliance checks
- **Run Analysis Button**: Analyzes selected combinations (if not already done)
- **Results Summary**: Show max/min values across entire structure
- Switching view mode or selection updates all displays instantly
- Results are **cached in browser memory** - no re-analysis when switching view

**Behavior**:
- Tab is **disabled/grayed** until first analysis is run
- After first analysis, tab becomes active
- User can freely switch between Structure/Loads/Analysis tabs
- Analysis tab remembers last viewed results

### 3.3 PyNite Backend Integration

Modify `analyze_frame_json()` function to:

```python
def analyze_frame_json(json_str):
    # ... setup model ...

    # Apply loads with case parameter
    for load in loads['distributed']:
        model.add_member_dist_load(
            member_name=load['element'],
            direction=load['direction'],
            w1=load['w1'] * 1000,  # Convert to N
            w2=load['w2'] * 1000,
            x1=load['x1'],
            x2=load['x2'],
            case=load.get('case', 'Dead')  # Get load case from load data
        )

    # Add load combinations
    if 'combinations' in input_data:
        for combo in input_data['combinations']:
            model.add_load_combo(
                name=combo['name'],
                factors=combo['factors'],
                combo_tags=combo['comboTag']  # REQUIRED: For filtering scenarios (ULS, stiffness, etc.)
            )

    # Analyze for each combination
    model.analyze()

    # Extract results for each combination
    results = {}
    for combo_name in model.load_combos.keys():
        results[combo_name] = extract_results_for_combo(model, combo_name)

    return json.dumps(results)
```

## Part 4: Data Structure

### 4.1 Load Case Data Structure
```javascript
let loadCases = [
    {
        name: 'Dead',
        type: '+Struc. dead load',
        durationClass: 'Permanent'
    },
    {
        name: 'Live',
        type: 'Ordinary',
        durationClass: 'Permanent'
    }
];
let activeLoadCase = 'Dead';
```

### 4.2 Load Data Structure (Updated)
```javascript
// Each load now includes a 'case' property
{
    node: 'N1',
    fx: -10,
    fy: -20,
    mz: 0,
    case: 'Dead'  // NEW: load case assignment
}
```

### 4.3 Load Combination Data Structure
```javascript
let loadCombinations = [
    {
        name: '610b ULS - Snow Dominating',
        comboTag: 'ULS',
        factors: {
            'Dead': 1.20,
            'Live': 1.05,
            'Snow': 1.50
        },
        enabled: true  // For checkbox selection
    },
    {
        name: 'SLS Char.',
        comboTag: 'Characteristic',
        factors: {
            'Dead': 1.00,
            'Live': 1.00,
            'Snow': 1.00
        },
        enabled: false
    }
];
```

## Part 5: Implementation Steps

### Phase 1: Load Cases (Core Functionality)
1. Add load cases data structure and storage
2. Add "Load Cases" section in left panel (below Loads, above Load Combinations button)
3. Create "Currently Active" dropdown with keyboard navigation
4. Update load input functions to include `case` property
5. Modify `getLoadsFromInputs()` to include case data
6. Test: Create loads in different cases, verify JSON output

### Phase 2: Load Cases (UI & Visualization)
7. Add load cases table UI
8. Implement "Add Load Case" dialog
9. Add visual indicator showing active case in Structure/Loads tabs
10. Update Structure tab visualization to filter by active case
11. Add "Show all cases" checkbox with color-coded legend (Structure tab)

### Phase 3: Load Combinations (UI)
12. Create "Load Combinations" button in left panel (below Load Cases)
13. Implement combinations modal/popup
14. Implement combinations list view
15. Create Add/Edit combination dialog
16. Add checkbox selection for multiple combinations
17. Implement Delete combination functionality

### Phase 4: Analysis Tab & Results

#### Step 1: Create Analysis Tab Structure (HTML)
18. Add "Analysis" tab to top navigation (Structure | Loads | **Analysis**)
19. Add tab content container with disabled state initially
20. Add radio buttons for view mode: "Load Cases" vs "Load Combinations"
21. Add dropdown for result selection (populated based on radio button)
22. Move diagram controls from Structure tab to Analysis tab
23. Move results display sections to Analysis tab

#### Step 2: PyNite Backend Integration
24. Modify PyNite `analyze_frame_json()` to accept load case parameter
25. Add function to analyze a single load case
26. Add function to analyze a load combination (with factors)
27. Update Python code to return results keyed by case/combo name

#### Step 3: Analysis Workflow & Caching
28. Create `runAnalysisForLoadCase(caseName)` function
29. Create `runAnalysisForCombination(comboName)` function
30. Implement results caching in `analysisResults` object:
    - `analysisResults.loadCases[caseName] = {...results}`
    - `analysisResults.combinations[comboName] = {...results}`
31. Add logic: check cache before running analysis (avoid duplicate work)
32. Update UI to show "analyzing..." state during analysis

#### Step 4: Results Viewing UI
33. Implement radio button handler to switch view mode (`resultViewMode`)
34. Implement dropdown population based on view mode:
    - Load Cases mode → populate with `loadCases.map(lc => lc.name)`
    - Combinations mode → populate with `loadCombinations.map(c => c.name)`
35. Implement dropdown change handler to:
    - Set `activeResultName`
    - Check if results exist in cache
    - If not cached, run analysis
    - Display cached/new results
36. Update visualization to use `analysisResults[resultViewMode][activeResultName]`
37. Update diagram display to use selected result
38. Update tooltips/exports to use selected result

#### Step 5: Analysis Tab Activation & Polish
39. Keep Analysis tab disabled until first analysis completes
40. Enable tab after successful analysis
41. Switch to Analysis tab automatically after first analysis
42. Add "Run All Load Cases" button
43. Add "Run All Combinations" button (or checkboxes in combinations modal)
44. Show which results are cached (visual indicator)
45. Add clear cache button (optional)

### Phase 5: Polish & Testing
31. Add preset combinations templates (EC/ASCE standards)
32. Implement combination validation (warn if case not included)
33. Add export/import of combinations (JSON)
34. Optional: Implement localStorage for session persistence
35. Comprehensive testing with multiple cases and combinations
36. Documentation and example structures

## Part 6: Styling Guidelines

**Follow existing app style**:
- Dark theme: `#1f2937` backgrounds, `#E5E7EB` text
- Blue accents: `#3b82f6` for primary actions
- Grid layouts with `space-y-3` spacing
- Rounded corners: `rounded-lg`, `rx="4"`
- Consistent padding: `p-4`, `padding: 8`

**Modal/Popup styling**:
- Semi-transparent backdrop
- Centered modal with max-width
- Close button (×) in top-right
- Action buttons at bottom-right

## Part 7: Example Usage Scenario

### Workflow from Start to Results Viewing

1. **Structure Tab**: User builds frame (nodes, elements)
2. **Loads Tab**: User clicks to "Load Cases" section in left panel
3. User creates load cases: "Dead", "Live", "Snow" (or uses defaults)
4. User switches active case to "Dead" (dropdown in left panel)
5. User adds distributed load -10 kN/m (auto-assigned to Dead case)
6. User switches active case to "Live"
7. User adds distributed load -20 kN/m (auto-assigned to Live case)
8. User clicks **"Load Combinations"** button in left panel
9. Modal opens - User creates "ULS Combo": Dead×1.2 + Live×1.6, Tag: ULS
10. User creates "SLS Char": Dead×1.0 + Live×1.0, Tag: Characteristic
11. User selects checkboxes for both combinations
12. User clicks **"Run Selected Analysis"** in modal
13. Analysis runs (analyzes Dead, Live, ULS Combo, SLS Char)
14. **Analysis tab becomes enabled** and automatically opens
15. In Analysis tab: User sees results for "ULS Combo" (default to first combination)
16. User switches radio button to **"Load Cases"**
17. Dropdown changes to show "Dead", "Live", "Snow"
18. User selects "Dead" - sees results for Dead case only
19. User switches back to **"Load Combinations"**
20. User selects "SLS Char" from dropdown
21. User views moment diagram, then switches to shear diagram
22. User clicks on result point, exports to JSON
23. User switches between Structure/Loads/Analysis tabs as needed

## Part 8: Future Enhancements (Out of Scope for Now)

- Auto-generate combinations from code standards (EC, ASCE, etc.)
- Element self-weight calculation for '+Struc. dead load' type
- Load case groups/categories
- Envelopes (max/min of multiple combinations)
- Load case duration class effects (EC5 compliance)
- Combination string parser (e.g., "1.2D + 1.6L")

## Success Criteria

✅ User can create and manage multiple load cases
✅ User can assign loads to specific cases via active case selection
✅ User can create load combinations with custom factors
✅ Analysis runs for selected combinations
✅ Results can be viewed per combination
✅ All data persists during session (can be cleared manually)
✅ UI follows existing app styling and patterns
✅ PyNite integration properly handles cases and combinations
✅ Export functionality includes combination information

---

**Priority**: High
**Estimated Complexity**: Large (5-8 hours implementation)
**Dependencies**: Requires PyNite backend modification
**Testing Required**: Multiple load cases, various combinations, result switching
