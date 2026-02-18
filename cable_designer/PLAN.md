# Cable Designer - Web App Implementation Plan

## Overview

A single-page HTML/JS web application using Pyodide (WebAssembly) to run the Python cable analysis engine directly in the browser. No server required. Deployable to GitHub Pages.

---

## Architecture

### File Structure

```
cable_designer/
├── index.html              # Main UI shell (layout, Tailwind CDN, GA tag)
├── app.js                  # App entrypoint - wires UI to modules
├── store.js                # Central state management (plain JS reactive store)
├── ui.js                   # DOM manipulation, input gathering, result rendering
├── charts.js               # All Chart.js / canvas plot logic (hover, tooltips)
├── units.js                # SINGLE SOURCE OF TRUTH for all unit conversions
├── worker.js               # Web Worker: loads Pyodide, runs Python
├── python/
│   └── cable_analyzer.py   # Stripped-down cable analysis class (from script.py)
└── PLAN.md                 # This file
```

### Separation of Concerns

| File | Responsibility |
|------|---------------|
| `index.html` | Layout structure, Tailwind classes, section markup |
| `app.js` | Event wiring, orchestration, no business logic |
| `store.js` | Single reactive state object, no DOM access |
| `ui.js` | DOM read/write only, no calculations |
| `charts.js` | Canvas plots, hover interactions, tooltips |
| `units.js` | All unit multipliers and labels, no DOM/calc logic |
| `worker.js` | Pyodide init, Python execution, message handling |
| `cable_analyzer.py` | Pure Python math - no matplotlib, no print statements |

---

## Module Architecture Detail

### 1. `units.js` - Unit Conversion (Centralized)

```javascript
// User-facing units and their SI conversion factors
export const UNITS = {
  force:    { label: 'kN',    toSI: 1e3    },   // kN → N  (unused, we use kN throughout)
  length:   { label: 'm',     toSI: 1.0    },   // m  → m
  area:     { label: 'mm²',   toSI: 1e-6   },   // mm² → m²
  stress:   { label: 'MPa',   toSI: 1e3    },   // MPa → kN/m²
  lineLoad: { label: 'kN/m',  toSI: 1.0    },
  angle:    { label: '°',     toSI: 1.0    },
};

// Convert user input to internal (kN, m, m², kN/m²)
export function toInternal(value, unitKey) { ... }

// Format number for display with unit label
export function display(value, unitKey, decimals) { ... }
```

**Internal units used throughout calculations:**
- Length: m
- Force: kN
- Distributed load: kN/m
- Area: m² (from mm² input)
- Stress: MPa (for display) / kN/m² (for calculation)
- E-modulus: kN/m² (from MPa input)

### 2. `store.js` - State Management

```javascript
const state = {
  // Geometry
  span: 10.0,           // m
  nSegments: 200,       // int

  // Material
  aEff: 1200.0,         // mm² (user units)
  eModulus: 200000.0,   // MPa (user units)

  // Loads - each load has an id for CRUD
  pointLoads: [
    // { id, position, magnitude }  (position in m, magnitude in kN)
  ],
  lineLoads: [
    // { id, startPos, endPos, startMag, endMag }  (m, kN/m)
  ],

  // Solver
  method: 'rootfinding',  // or 'fixed_point'

  // Results (null until analyzed)
  results: null,

  // UI state
  isLoading: false,
  error: null,
  pyodideReady: false,
};
```

**No hanging state**: Every time the user changes a parameter, results are cleared and the problem is fully rebuilt in Python from scratch before next analysis.

### 3. `worker.js` - Pyodide Web Worker

```javascript
// Initialization sequence
1. importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.js')
2. loadPyodide({ indexURL: ... })
3. pyodide.loadPackage(['numpy', 'scipy'])
4. fetch(new URL('./python/cable_analyzer.py', import.meta.url))
5. pyodide.runPython(pythonSource)
6. postMessage({ type: 'ready' })

// Analysis request
onmessage = async ({ data }) => {
  if (data.type === 'analyze') {
    // data.payload = { span, nSegments, aEff, eModulus, pointLoads, lineLoads, method }
    // Pass to Python, get JSON back
    const result = pyodide.runPython(`
      import json
      result = run_analysis(${JSON.stringify(data.payload)})
      json.dumps(result)
    `);
    postMessage({ type: 'result', msgId: data.msgId, payload: JSON.parse(result) });
  }
};
```

### 4. `cable_analyzer.py` - Pure Calculation Engine

Extracted from `script.py` with all matplotlib/print statements removed. Exposes:

```python
def run_analysis(params: dict) -> dict:
    """
    params keys:
      span, n_segments, a_eff_m2, e_kn_m2,
      point_loads, line_loads, method

    returns full results dict ready for JSON serialization:
      scalar results + arrays as lists
    """
    analysis = CableAnalysis(...)
    for load in params['point_loads']:
        analysis.add_point_load(load['position'], load['magnitude'])
    for load in params['line_loads']:
        analysis.add_line_load(...)
    results = analysis.solve(method=params['method'])
    # Convert numpy arrays to lists for JSON
    return serialize_results(results)
```

### 5. `charts.js` - Interactive Plots

Four plots using **Chart.js** (lightweight, no build step, CDN):

| Plot | X-axis | Y-axis | Hover shows |
|------|--------|--------|-------------|
| Load diagram | Position [m] | Load intensity [kN or kN/m] | Position, load intensity |
| Cable shape | Position [m] | Deflection [m] | Position, sag, tension |
| Force distribution | Position [m] | Force [kN] | Position, T/H/V values |
| Stress distribution | Position [m] | Stress [MPa] | Position, stress value |

**Hover behavior:**
- `pointRadius: 0` on data points (no clutter)
- `interaction: { mode: 'index', intersect: false }` - full-width hover zone
- Custom tooltip showing all relevant values at that x-position
- Crosshair plugin for vertical guide line

### 6. `ui.js` - Input Section Layout

Inputs organized into collapsible sections:

#### Section 1: Geometry
- Span length (m)
- Number of segments (int, slider 50–500)

#### Section 2: Material
- Effective tension area (mm²)
- Modulus of elasticity (MPa)

#### Section 3: Loads
- **Point Loads table**: Add / Edit / Delete rows
  Columns: Position [m], Magnitude [kN], Delete
- **Line Loads table**: Add / Edit / Delete rows
  Columns: Start [m], End [m], Start Load [kN/m], End Load [kN/m], Delete

#### Section 4: Solver Settings (collapsible, advanced)
- Method dropdown: Root finding (recommended) / Fixed point iteration

#### Analyze Button (always visible, sticky footer)

#### Results Section
- Summary cards: H, T_max, f, sag_ratio, R_left, R_right, stress, strain
- Four interactive plots (full-width, stacked)
- Console output (convergence info)

---

## UI Design (Tailwind CSS)

### Color Scheme
- Background: `gray-950` (very dark)
- Card surfaces: `gray-900`
- Section headers: `gray-800` with `sky-500` accent border
- Inputs: `gray-800` border, `gray-700` on focus
- Analyze button: `sky-600` → `sky-500` hover
- Result cards: `gray-900` with colored top border per category
- Plots: dark background `#1a1a2e`, grid `rgba(255,255,255,0.1)`

### Layout
```
┌─────────────────────────────────────┐
│  HEADER: Cable Designer             │
│  subtitle + pyodide status badge    │
├──────────────┬──────────────────────┤
│  LEFT PANEL  │  RIGHT PANEL         │
│  (inputs)    │  (results + plots)   │
│  w-96 fixed  │  flex-1              │
│              │                      │
│  [Geometry]  │  [Result cards]      │
│  [Material]  │  [Load diagram]      │
│  [Loads]     │  [Cable shape]       │
│  [Advanced]  │  [Force diagram]     │
│              │  [Stress diagram]    │
│  [ANALYZE]   │                      │
└──────────────┴──────────────────────┘
```

On mobile: single column, inputs above results.

### Result Summary Cards (2×4 grid)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Horiz. Force │ │  Max Tension │ │   Max Sag    │ │  Sag Ratio   │
│   H = ...kN  │ │ T_max=...kN  │ │  f = ... m   │ │  f/L = ...   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  R left [kN] │ │ R right [kN] │ │  Stress[MPa] │ │ Strain [-]   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Data Flow

```
User edits input
      │
      ▼
store.js: update state, clear results
      │
      ▼
ui.js: reflect state in DOM (no stale values)
      │
User clicks Analyze
      │
      ▼
app.js: gather inputs → unit conversion (units.js) → build payload
      │
      ▼
worker.js: receive payload → run Python → serialize results
      │
      ▼
app.js: receive results → update store
      │
      ▼
ui.js: render result cards
charts.js: render all 4 plots
```

**Fresh build every time**: Python `CableAnalysis` object is recreated from scratch on every analysis call. No stale state.

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create `index.html` with Tailwind layout + GA tag
- [ ] Create `units.js` with all conversions
- [ ] Create `store.js` with state schema

### Phase 2: Python Engine
- [ ] Extract `cable_analyzer.py` from `script.py`
  - Remove all matplotlib imports/usage
  - Remove all print statements
  - Add `run_analysis(params)` entry point
  - Add `serialize_results()` for JSON-safe output
- [ ] Create `worker.js` with Pyodide setup

### Phase 3: Input UI
- [ ] Implement input sections in `ui.js`
- [ ] Implement CRUD for load tables
- [ ] Wire inputs to store

### Phase 4: Analysis & Results
- [ ] Implement `app.js` orchestration
- [ ] Result summary cards
- [ ] Worker message handling

### Phase 5: Charts
- [ ] Implement `charts.js` with Chart.js
- [ ] Load diagram
- [ ] Cable shape plot
- [ ] Force distribution plot
- [ ] Stress distribution plot
- [ ] Hover/crosshair behavior

### Phase 6: Polish
- [ ] Loading states and spinners
- [ ] Error messages
- [ ] Input validation
- [ ] Mobile responsiveness
- [ ] Test deployment

---

## External Dependencies (CDN, no build step)

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Chart.js for plots -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<!-- Chart.js crosshair plugin -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-crosshair@2.0.0/dist/chartjs-plugin-crosshair.min.js"></script>

<!-- Pyodide (loaded in Web Worker only) -->
<!-- importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.js') -->
```

---

## Key Design Decisions

1. **Pyodide in Web Worker**: Keeps UI responsive during analysis (scipy brentq is fast but numpy array ops can block)
2. **Fresh Python object every run**: Eliminates stale load state bugs. Small performance cost, huge correctness benefit.
3. **Chart.js over Plotly**: Lighter, faster, no build step, good hover API
4. **Plain HTML + ES modules**: No build toolchain. Direct GitHub Pages deployment.
5. **Centralized units.js**: Single place to change unit labels or conversion factors. All other modules import from it.
6. **Store as truth**: UI always reflects store, not the other way around. Prevents desync.
