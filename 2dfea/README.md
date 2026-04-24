# 2D Frame Analysis Editor

Web-based structural analysis for 2D frames, running PyNite entirely in the browser via Pyodide.

Live: https://magnusfjeldolsen.github.io/structural_tools/2dfea/

## Quick Start

```bash
npm install
npm run dev
```

Opens on http://localhost:3000 (or 5173 depending on Vite version).

## Features

**Modelling**
- Interactive canvas — add/edit nodes, elements, supports, loads (Konva)
- Nodes and Elements tabs with keyboard-driven cell editing (F2, arrows, Enter, Ctrl+C/V)
- Loads tab with cell editing, copy/paste, and load-case filtering

**Analysis**
- PyNite 2.0 FEA in a Web Worker (non-blocking, via Pyodide)
- Multiple load cases and combinations
- Full-analysis mode: runs every case + combination, caches results, queryable from the Results selector

**Visualization**
- Displaced shape with automatic scaling (1/10 of max element length) plus manual multiplier
- Moment, shear, and axial diagrams
- Zoom-independent load and displacement rendering

## Units

- **Input:** m, kN, kNm, GPa
- **Display:** mm (displacement), kN, kNm, mrad
- See [UNIT_CONVERSIONS.md](UNIT_CONVERSIONS.md) for the full frontend → worker → Python flow

## Tech Stack

- React + TypeScript + Vite
- Zustand (model + UI stores) · Konva (canvas)
- Pyodide + PyNite 2.0 (FEA)
- Web Worker for non-blocking analysis

## Project Structure

```
2dfea/
├── public/
│   ├── python/           # PyNite analysis modules (fetched by Worker)
│   └── workers/          # solverWorker.js
├── src/
│   ├── analysis/         # Types, data collector, result parser, solver interface
│   ├── store/            # Zustand stores (model + UI)
│   ├── geometry/         # Coordinate transforms, snapping, deformation, selection
│   ├── visualization/    # Displaced shape + diagram utilities
│   ├── utils/            # Scaling, labels, coordinate parsing, renumbering
│   ├── hooks/            # Keyboard shortcut hook
│   ├── components/
│   │   ├── shared/       # EditableCell, DropdownCell (reused across tables)
│   │   ├── tables/       # NodeTable, ElementTable
│   │   ├── LoadForms/    # Create/edit dialogs per load type
│   │   ├── LoadTables/   # Nodal/Distributed/Point load tables
│   │   └── ...           # CanvasView, Toolbar, Results, tab containers
│   └── App.tsx
├── docs/archive/         # Historical phase plans and scratch code
├── DEPLOYMENT.md         # Deployment architecture and workflows
├── UNIT_CONVERSIONS.md   # Unit-conversion policy (frontend/worker/Python)
└── TODO.md               # What's next
```

## Documentation

- [TODO.md](TODO.md) — roadmap
- [DEPLOYMENT.md](DEPLOYMENT.md) — GitHub Pages deployment, local dev workflows
- [UNIT_CONVERSIONS.md](UNIT_CONVERSIONS.md) — unit handling reference
- [docs/archive/](docs/archive/) — completed-phase plans and experimental code kept for reference

## Developed By

Magnus Fjeld Olsen

Built with: PyNite, Pyodide, React, Konva, Zustand
