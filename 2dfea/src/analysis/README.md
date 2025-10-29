# Analysis Module

Type-safe TypeScript interface to the PyNite solver running in a Web Worker.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React Components                               │
│  ├─ Canvas (Konva)                             │
│  ├─ Toolbar                                     │
│  └─ Results Panel                               │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Uses clean API
                   ▼
┌─────────────────────────────────────────────────┐
│  Analysis Module (this directory)              │
│  ├─ types.ts           Type definitions        │
│  ├─ solverInterface.ts Worker wrapper          │
│  ├─ dataTranslator.ts  UI → Worker            │
│  └─ resultParser.ts    Worker → UI             │
└──────────────────┬──────────────────────────────┘
                   │
                   │ postMessage()
                   ▼
┌─────────────────────────────────────────────────┐
│  Web Worker (public/workers/solverWorker.js)   │
│  └─ Loads Python modules via fetch()           │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Pyodide
                   ▼
┌─────────────────────────────────────────────────┐
│  Python Backend (public/python/)                │
│  ├─ pynite_analyzer.py                         │
│  └─ setup_pynite_env.py                        │
└─────────────────────────────────────────────────┘
```

## Usage

### Basic Example

```typescript
import { SolverInterface, translateModelToWorker } from './analysis';

// 1. Create solver instance
const solver = new SolverInterface();

// 2. Initialize (once on app startup)
await solver.initialize();  // Takes ~30-60s first time

// 3. Prepare model data
const modelData = translateModelToWorker(
  nodes,      // Node[]
  elements,   // Element[]
  loads       // Loads
);

// 4. Run analysis
const results = await solver.runAnalysis(modelData);

// 5. Use results (already in engineering units!)
console.log(`Max moment: ${results.elements.E1.max_moment} kNm`);
console.log(`Deflection: ${results.nodes.N2.DY} mm`);
```

### With Load Cases

```typescript
// Analyze specific load case
const results = await solver.runAnalysis(
  modelData,
  'loadCase',
  'Dead'  // Case name
);

// Analyze combination
const results = await solver.runAnalysis(
  modelData,
  'combination',
  {
    name: 'ULS',
    factors: { Dead: 1.35, Live: 1.5 }
  }
);
```

### With Validation

```typescript
import { validateModel, translateModelToWorker } from './analysis';

const modelData = translateModelToWorker(nodes, elements, loads);

// Check for errors before analysis
const errors = validateModel(modelData);
if (errors.length > 0) {
  console.error('Model validation failed:', errors);
  return;
}

// Safe to analyze
const results = await solver.runAnalysis(modelData);
```

### Result Parsing Utilities

```typescript
import {
  parseAnalysisResults,
  createResultSummary,
  getMaxDisplacement,
  formatValue,
} from './analysis';

const results = await solver.runAnalysis(modelData);

// Get summary
const summary = createResultSummary(results);
console.log(`Max displacement: ${formatValue(summary.maxDisplacement.value, 'displacement')}`);
console.log(`  at node: ${summary.maxDisplacement.node}`);

// Get specific metrics
const maxMoment = getMaxMoment(results);
console.log(`Max moment in ${maxMoment.element}: ${maxMoment.value} kNm`);
```

## Unit Policy

**All values from the backend are in engineering units - NO conversion needed in UI!**

| Quantity | Unit | Example Display |
|----------|------|----------------|
| Displacements | mm | `${result.DY} mm` |
| Rotations | rad | `${result.RZ} rad` |
| Forces | kN | `${result.reactions.FY} kN` |
| Moments | kNm | `${result.max_moment} kNm` |

See [../UNIT_CONVERSIONS.md](../../UNIT_CONVERSIONS.md) for complete policy.

## Files

### types.ts
Complete TypeScript type definitions for:
- Model geometry (nodes, elements)
- Loads (nodal, distributed, point)
- Analysis results
- Worker communication

### solverInterface.ts
`SolverInterface` class - main API for using the solver:
- `initialize()` - Load Pyodide + PyNite
- `runAnalysis()` - Execute analysis
- `terminate()` - Clean up worker

### dataTranslator.ts
Functions to convert UI models to worker format:
- `translateModelToWorker()` - Main conversion
- `validateModel()` - Check for errors
- `filterLoadsByCase()` - Filter loads
- `getLoadCaseNames()` - Extract case names

### resultParser.ts
Functions to process analysis results:
- `parseAnalysisResults()` - Validate and parse
- `getMax*()` - Extract maximum values
- `createResultSummary()` - Summary object
- `formatValue()` - Format for display

### index.ts
Re-exports everything for clean imports:
```typescript
import { SolverInterface, translateModelToWorker, getMaxMoment } from './analysis';
```

## Testing

Run the integration test:
```bash
# Start dev server
python serve.py

# Open in browser
http://localhost:8000/test/worker-test.html
```

## Next Steps

After this module is complete:
1. **Step 3:** Integrate with Zustand store
2. **Step 4:** Create React UI components
3. **Step 5:** Add visualization layer (Konva)
4. **Step 6:** Load cases and combinations UI
