# 2D Frame Analysis Editor

Web-based structural analysis for 2D frames using PyNite + Pyodide.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Features

- ✅ Interactive canvas (nodes, elements, supports, loads)
- ✅ PyNite FEA in browser (via Pyodide Web Worker)  
- ✅ Displaced shape + force diagrams (moment, shear, axial)
- ✅ Load cases & combinations
- ✅ Real-time results display

## Usage

1. **Load Example** → cantilever beam loads
2. **Run Analysis** → wait ~1s
3. **Toggle visualizations** → see displaced shape & diagrams
4. **Load Cases tab** → manage cases/combinations

## Units

**Input:** m, kN, kNm  
**Output:** mm (displacement), kN, kNm, rad

## Tech Stack

- React + TypeScript + Vite
- Zustand (state) + Konva (canvas)
- Pyodide + PyNite (FEA)
- Web Worker (non-blocking)

## Documentation

See implementation docs:
- `STEP1_COMPLETE.md` through `STEP6_COMPLETE.md`
- `claudeimplementationplan.md`

## Project Structure

```
2dfea/
├── public/python/          # PyNite analysis modules
├── public/workers/         # Web Worker
├── src/analysis/           # TypeScript interfaces
├── src/store/              # Zustand state
├── src/visualization/      # Diagram utilities
├── src/components/         # React UI
└── src/App.tsx             # Main app
```

## Developed By

Magnus Fjeld Olsen

**Built with:** PyNite, Pyodide, React, Konva, Zustand
