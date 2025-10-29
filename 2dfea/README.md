# 2dfea - Interactive 2D Frame Analysis Editor

Modern web-based 2D frame analysis tool with interactive canvas editing and PyNite FEA solver.

## Status: Step 1 Complete ✓

**Completed:**
- ✅ Extracted Python analysis modules from 2dframeanalysis
- ✅ Created standalone `pynite_analyzer.py` (testable with regular Python)
- ✅ Created `setup_pynite_env.py` for Pyodide package mocking
- ✅ Created lightweight `solverWorker.js` Web Worker
- ✅ Tested Python modules locally
- ✅ Created `worker-test.html` integration test

**Next Steps:**
- TypeScript interface layer (solverInterface.ts, dataTranslator.ts, resultParser.ts)
- React + Konva canvas UI
- Zustand state management
- Full integration

## Architecture

```
2dfea/
├── public/
│   ├── python/                    ← Standalone Python modules
│   │   ├── pynite_analyzer.py    ← Main PyNite analysis logic
│   │   └── setup_pynite_env.py   ← Package mocking for Pyodide
│   └── workers/
│       └── solverWorker.js        ← Web Worker (loads Python modules)
├── test/
│   └── worker-test.html           ← Integration test for worker
└── README.md
```

## Key Innovation: Standalone Python Files

Instead of embedding Python code as strings in JavaScript (like 2dframeanalysis), we use **pure Python files** that are:
- Editable with Python IDEs (full syntax highlighting, linting)
- Testable locally with `python pynite_analyzer.py`
- Debuggable with pdb/print statements
- Version-controlled cleanly (git diffs show Python changes)

The worker simply fetches and runs these files in Pyodide.

## Testing

### Test Python Modules Locally

```bash
# Test package mocking setup
cd public/python
python setup_pynite_env.py

# Test analyzer (requires PyNite installed)
python pynite_analyzer.py
```

Expected output:
```
PyNite Analyzer - Standalone Test
============================================================
...
Success: True
Message: Analysis completed successfully
Node Displacements:
  N1: DY = 0.00 mm
  N2: DY = 0.00 mm
Element Forces:
  E1: Max Moment = 0.00 kNm
* Test completed successfully!
```

### Test Web Worker Integration

1. Start a local web server in the 2dfea directory:
   ```bash
   python -m http.server 8000
   ```

2. Open `http://localhost:8000/test/worker-test.html`

3. Click through the test sequence:
   - "1. Initialize Worker" - Loads Pyodide, installs PyNite
   - "2. Ping Worker" - Health check
   - "3. Run Analysis" - Analyzes cantilever beam

Expected: All tests should show green "✓" status with detailed results.

## Development Workflow

The standalone Python files enable a much faster development cycle:

```bash
# 1. Edit Python file with full IDE support
code public/python/pynite_analyzer.py

# 2. Test locally without browser/worker overhead
python public/python/pynite_analyzer.py

# 3. Debug with Python debugger
python -m pdb public/python/pynite_analyzer.py

# 4. Only then test in worker context
# (open test/worker-test.html in browser)
```

## Implementation Plan

See [claudeimplementationplan.md](claudeimplementationplan.md) for the complete 7-step implementation plan.

**Step 1 (COMPLETE):** Python modules + worker infrastructure
**Step 2 (NEXT):** TypeScript interface layer
**Step 3:** Zustand store integration
**Step 4:** Basic React UI
**Step 5:** Visualization layer
**Step 6:** Load cases & combinations
**Step 7:** Testing & polish

## Python Module API

### pynite_analyzer.py

**Public Functions:**

```python
def analyze_frame_json(input_json: str) -> str:
    """Analyze frame from JSON input - main entry point"""

def analyze_frame_single_case(input_json: str, case_name: str) -> str:
    """Analyze frame for a single load case"""

def analyze_frame_combination(input_json: str, combo_json: str) -> str:
    """Analyze frame with load combination and factors"""
```

**Input Format:**

```javascript
{
  nodes: [
    { name: 'N1', x: 0, y: 0, support: 'fixed' | 'pinned' | 'roller-x' | 'roller-y' | 'free' }
  ],
  elements: [
    { name: 'E1', nodeI: 'N1', nodeJ: 'N2', E: 210, I: 1e-4, A: 1e-3 }  // E in GPa
  ],
  loads: {
    nodal: [{ node: 'N2', fx: 0, fy: -10, mz: 0, case: 'Dead' }],  // kN, kNm
    distributed: [{ element: 'E1', direction: 'Fy', w1: -5, w2: -5, x1: 0, x2: 4, case: 'Live' }],  // kN/m
    elementPoint: [{ element: 'E1', distance: 2, direction: 'Fy', magnitude: -15, case: 'Snow' }]  // kN at m
  }
}
```

**Output Format:**

```javascript
{
  success: true,
  message: "Analysis completed successfully",
  nodes: {
    'N1': {
      DX: 0, DY: 0, DZ: 0, RX: 0, RY: 0, RZ: 0,  // Displacements
      reactions: { FX: 0, FY: 10000, MZ: -40000 }  // Reactions in N, Nm
    }
  },
  elements: {
    'E1': {
      max_moment: 40000,      // N·m
      max_shear: 10000,       // N
      max_axial: 0,           // N
      max_deflection: 0.005,  // m
      length: 4.0,
      i_node: 'N1',
      j_node: 'N2'
    }
  },
  diagrams: {
    'E1': {
      x_coordinates: [0, 0.4, 0.8, ... 4.0],
      moments: [-40000, -36000, ..., 0],
      shears: [10000, 10000, ..., 10000],
      axials: [0, 0, ..., 0],
      deflections: [0, -0.001, ..., -0.005],
      length: 4.0
    }
  }
}
```

## Worker Message Protocol

### Main → Worker

```javascript
// Initialize worker
{ type: 'init', msgId: 'uuid' }

// Run analysis
{
  type: 'analyze',
  payload: {
    modelData: { nodes, elements, loads },
    analysisType: 'simple' | 'loadCase' | 'combination',
    targetName: 'Dead' | { name: 'ULS', factors: { Dead: 1.35, Live: 1.5 } }
  },
  msgId: 'uuid'
}

// Health check
{ type: 'ping', msgId: 'uuid' }
```

### Worker → Main

```javascript
// Ready after initialization
{ type: 'ready', msgId: 'uuid' }

// Analysis results
{ type: 'results', payload: { success, nodes, elements, diagrams }, msgId: 'uuid' }

// Error
{ type: 'error', payload: { message, stack, phase }, msgId: 'uuid' }

// Health check response
{ type: 'pong', payload: { initialized: true }, msgId: 'uuid' }
```

## Dependencies

### Python (for local testing)
- PyNiteFEA >= 1.0.0
- numpy
- scipy

### Browser (loaded by worker)
- Pyodide 0.24.1
- PyNiteFEA (via micropip)
- numpy, scipy, matplotlib, prettytable (via micropip)

### Future (Step 2+)
- React + TypeScript
- react-konva
- zustand
- Vite

## Credits

Based on the proven PyNite+Pyodide implementation from [2dframeanalysis](../2dframeanalysis/).

Major architectural improvement: Extracting Python code into standalone modules for better development experience.
