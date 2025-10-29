🪜 Development Steps
1. Project Setup

Initialize with Vite + TypeScript + React.

Install dependencies: react-konva, zustand, shadcn/ui.

Create folder structure and add blank CanvasView.tsx.

2. Model Store

Create useModelStore.ts for nodes/elements and useUIStore.ts for tools/snap settings.

Implement basic CRUD and undo/redo middleware.

3. Canvas MVP

Implement canvas rendering of nodes (circles) and elements (lines).

Enable adding nodes by clicking, and elements between nodes.

4. Selection & Movement

Implement select and move tools.

Drag nodes to update connected elements dynamically.

5. View Controls

Implement zoom/pan (via transform matrix).

Ensure interactions remain consistent under transforms.

6. Snapping

Create geometryUtils.ts for math operations.

Add snapping logic in snapUtils.ts (endpoint, midpoint, grid).

Display snap indicators visually.

7. Advanced Snapping

Add intersection, perpendicular, and angular snap modes.

Add keyboard modifiers (Shift for angle lock, Ctrl for perpendicular).

8. Coordinate Input

Add numeric input for absolute and relative coordinates (@dx,dy).

Update node positions based on input.

9. Undo/Redo & Persistence

Complete undo/redo stack.

Add import/export (JSON) and localStorage autosave.

10. UI & Shortcuts

Add toolbar with tool/snap buttons.

Implement keyboard shortcuts (D, S, M, Ctrl+Z, etc.).

Add coordinate display in StatusBar.

⚙️ Step 11 — FEA Solver Integration (Pyodide + PyNiteFEA)

Goal:
Integrate existing Pyodide + PyNiteFEA logic as an asynchronous solver running in a Web Worker.

🔧 Architecture Additions
File	Purpose
analysis/solverWorker.js	Web Worker hosting Pyodide runtime
analysis/solverInterface.ts	Main-thread interface to send/receive messages
analysis/dataTranslator.ts	Convert JS model → PyNite Python script
analysis/resultParser.ts	Convert PyNite output → JS data
analysis/types.ts	Types for loads, supports, reactions
🔩 Worker Lifecycle

Main thread calls initSolver() → loads Pyodide in worker.

User triggers “Run Analysis”.

Frontend sends model JSON → solverInterface → worker.

Worker builds and executes Python script using PyNite.

Worker posts result JSON back to main thread.

Frontend parses and updates visualization state.

🧩 Example Worker (simplified)
importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide;

async function init() {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["micropip"]);
  await pyodide.runPythonAsync(`
    import micropip
    await micropip.install("PyNiteFEA")
  `);
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === "init") {
    await init();
    self.postMessage({ type: "ready" });
  }
  if (type === "analyze") {
    const { pythonScript } = payload;
    try {
      await pyodide.runPythonAsync(pythonScript);
      const results = pyodide.globals.get("results").toJs();
      self.postMessage({ type: "results", payload: results });
    } catch (err) {
      self.postMessage({ type: "error", payload: err.toString() });
    }
  }
};

🧮 Script Generation Example
export function buildPyNiteScript(model: ModelData): string {
  let code = `
from PyNite import FEModel3D
model = FEModel3D()
`;

  for (const n of model.nodes)
    code += `model.add_node("${n.id}", ${n.x}, ${n.y}, 0)\n`;

  for (const e of model.elements)
    code += `model.add_member("${e.id}", "${e.n1}", "${e.n2}", E=210e9, G=81e9, Iy=1e-4, Iz=1e-4, J=1e-4, A=1e-3)\n`;

  code += `
model.analyze()
results = {}
for node in model.Nodes.values():
    results[node.Name] = {"dx": node.DX, "dy": node.DY, "rz": node.RZ}
`;
  return code;
}

✅ Acceptance Criteria

Worker initializes Pyodide + PyNite only once.

“Run Analysis” triggers async solve and returns displacements.

Frontend updates visualization layer with results.

No blocking of UI during analysis.

💾 Suggested Commits (on master)
feat(analysis): integrate pyodide + pynite worker interface
feat(analysis): add translator + result parser
feat(ui): add Run Analysis action + results panel
test(analysis): add script generation + mock worker tests

🧰 Development Practices

Keep geometry utilities pure and stateless for unit testing.

Maintain separation between UI and model logic.

Implement undo/redo at the state layer (not directly in the UI).

Use feature branches off master for new functionality.

Centralize constants (SNAP_TOLERANCE, GRID_SPACING, etc.) in config/constants.ts.

🚀 Next Steps

Once Step 11 is complete:

Parse analysis results into Zustand store.

Add deformation visualization overlay.

Add member force/diagram visualization.

Optimize worker reuse and caching for large models.

🧠 AI Prompt

When prompting an AI to develop this project, use:

Prompt:
Implement the “Online 2D Frame Analysis Editor” as described in devspecs.md.
Use React + TypeScript + Zustand + Konva for the UI and model editor.
Integrate Pyodide + PyNiteFEA in a Web Worker for analysis.
Follow the step-by-step architecture and file structure outlined here.
Begin with Step 1 (project setup), ensure each milestone is functional and committed to master before continuing.
Prioritize clean modular code, type safety, and async non-blocking solver communication.

End of devspecs.md