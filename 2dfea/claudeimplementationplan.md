# Claude Implementation Plan: 2D FEA Interactive Editor with PyNite Worker

## Overview
This plan outlines the complete implementation of the **2dfea** React+TypeScript+Konva interactive frame editor with PyNite analysis backend.

### Current Status (Steps 1-7 Complete)
✅ **Backend Integration Complete:**
- Python PyNite modules extracted to standalone files
- Web Worker with Pyodide runtime
- TypeScript interface layer (solverInterface, dataTranslator, resultParser)
- Zustand store with analysis state
- Basic UI components (CanvasView, Toolbar, ResultsPanel)
- Visualization layer (displaced shape, moment/shear/axial diagrams)
- Load case & combination management
- Documentation

❌ **Missing Interactive Editor Features:**
- Draw nodes by clicking canvas
- Draw elements by clicking node-to-node
- Move nodes by dragging
- Add/edit/delete supports (boundary conditions)
- Add/edit/delete loads (nodal forces, distributed loads, point loads)
- Selection & multi-select tools
- Snapping system (grid, endpoints, midpoints, intersections, perpendicular, angles)
- Numeric coordinate input (absolute & relative)
- Pan & zoom with proper coordinate transforms
- Undo/Redo system
- Keyboard shortcuts

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  2dfea (React + TypeScript + Konva)                     │
│  ├─ Interactive Canvas (MISSING - Steps 8-17)           │
│  │  ├─ Draw tools (nodes, elements, loads, supports)    │
│  │  ├─ Select & move tools                              │
│  │  ├─ Snapping engine                                  │
│  │  ├─ Pan & zoom with transforms                       │
│  │  └─ Coordinate input                                 │
│  ├─ Zustand stores (COMPLETE)                           │
│  │  ├─ useModelStore (nodes, elements, loads)           │
│  │  └─ useUIStore (tools, view, snap modes)             │
│  └─ Analysis Backend (COMPLETE - Steps 1-7)             │
│     ├─ Web Worker (solverWorker.js)                     │
│     ├─ Pyodide + PyNite                                 │
│     └─ Results visualization                            │
└─────────────────────────────────────────────────────────┘
```

---

## Completed Steps (Summary)

### ✅ Step 1: Python Module Extraction (COMPLETE)
- Created `public/python/pynite_analyzer.py` (pure Python)
- Created `public/python/setup_pynite_env.py` (mocking setup)
- Created `public/workers/solverWorker.js` (lightweight loader)

### ✅ Step 2: TypeScript Interface (COMPLETE)
- `analysis/solverInterface.ts` - Worker communication
- `analysis/dataTranslator.ts` - Model → Worker format
- `analysis/resultParser.ts` - Worker → UI format
- `analysis/types.ts` - Type definitions

### ✅ Step 3: Store Integration (COMPLETE)
- Added analysis state to `useModelStore`
- Implemented `runAnalysis` action
- Worker initialized in `App.tsx`

### ✅ Step 4: Basic UI (COMPLETE)
- `components/CanvasView.tsx` - Main Konva stage
- `components/Toolbar.tsx` - Tool selection & Run Analysis button
- `components/ResultsPanel.tsx` - Text results display
- `App.tsx` - Layout with tabbed interface

### ✅ Step 5: Visualization Layer (COMPLETE)
- Displaced shape rendering with 11-point curved elements
- Moment/shear/axial diagram overlays
- Scale controls for displacement and diagrams
- `visualization/diagramUtils.ts` & `visualization/displacedShape.ts`

### ✅ Step 6: Load Cases & Combinations (COMPLETE)
- `components/LoadCasePanel.tsx` - Case/combo management UI
- Active load case filtering
- Combination editor with factors
- Analysis per case (on-demand, not cached)

### ✅ Step 7: Documentation (COMPLETE)
- README.md with quick start guide
- STEP*.md documentation files

---

## Missing Steps (Interactive Editor Features)

### ❌ Step 8: Interactive Canvas Foundation
**Goal:** Enable basic mouse interaction - click to add nodes, coordinate transforms for pan/zoom

**Tasks:**
1. **Update CanvasView.tsx:**
   - Add `onMouseDown`, `onMouseMove`, `onMouseUp` handlers to Stage
   - Implement screen→world coordinate conversion utilities
   - Add pan (middle mouse drag) and zoom (mouse wheel) controls
   - Update Stage `scaleX/scaleY` and `x/y` from UIStore view state

2. **Update useUIStore.ts:**
   - Add `view: { x, y, scale }` (already exists, verify correct)
   - Add actions: `setView`, `panView`, `zoomView`
   - Add `activeTool: 'select' | 'draw_node' | 'draw_element' | 'move' | 'add_support' | 'add_load'`

3. **Create coordinate transform utils:**
   - File: `src/geometry/transformUtils.ts`
   - Functions:
     - `screenToWorld(stage, pointer): {x, y}` - Maps screen coords to world coords
     - `worldToScreen(stage, worldPos): {x, y}` - Reverse transform

4. **Implement draw_node tool:**
   - When tool is active and user clicks canvas: add node at click position
   - Call `addNode(worldX, worldY)` in store
   - Visual feedback: cursor crosshair

**Acceptance Criteria:**
- ✅ Pan & zoom work correctly
- ✅ Clicking canvas in "draw node" mode adds node at correct world coordinates
- ✅ Nodes stay in place when panning/zooming

**Files to Create/Modify:**
- `src/geometry/transformUtils.ts` (NEW)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useUIStore.ts` (MODIFY)

---

### ❌ Step 9: Draw Elements Tool
**Goal:** Enable element creation by clicking node-to-node with rubberband preview and state-driven workflow

**Tasks:**
1. **Update CanvasView.tsx:**
   - Add hit-testing for nodes: detect when mouse is near a node (within `HIT_TOLERANCE`)
   - Visual feedback: highlight hovered node
   - When `activeTool === 'draw_element'`:
     - **State 1 - No selection:** Show tooltip "Select start node"
     - **Click on node 1:** Set as start node, enter State 2
     - **State 2 - Start selected:** Show tooltip "Select end node", show rubberband line from start to cursor
     - **Click on node 2:** Call `addElement(node1.id, node2.id)`, stay in draw_element mode, return to State 1
     - Move mouse: show temporary line from start node to cursor

2. **Create hit-testing utils:**
   - File: `src/geometry/hitTestUtils.ts`
   - Function: `findNodeAtPoint(nodes, worldX, worldY, tolerance): Node | null`
   - Distance check: `Math.sqrt((n.x - x)^2 + (n.y - y)^2) < tolerance`

3. **Update useUIStore:**
   - Add `tempElementStart: string | null` - ID of node where element drawing started
   - Add actions: `setTempElementStart`, `clearTempElement`

4. **Create StatusBar component (early implementation):**
   - File: `src/components/StatusBar.tsx`
   - Show context-sensitive tooltip at bottom of screen:
     - When `activeTool === 'draw_element' && !tempElementStart`: "Select start node"
     - When `activeTool === 'draw_element' && tempElementStart`: "Select end node (ESC to cancel selection)"
     - When other tools active: show tool name and instructions

5. **Escape key behavior:**
   - **First ESC press (when in State 2 - start node selected):**
     - Clear `tempElementStart` → return to State 1 (no selection)
     - Keep `activeTool === 'draw_element'` active
     - Show tooltip: "Select start node"
   - **Second ESC press (when in State 1 - no selection):**
     - Exit draw_element mode entirely
     - Set `activeTool = 'select'` (default tool)
     - Clear tooltip

6. **Visual feedback:**
   - Hovered nodes: larger radius or color change
   - Selected start node: distinct color (e.g., orange/yellow) while in State 2
   - Rubberband line: dashed, gray color from start node to cursor
   - Tooltip bar: fixed position at bottom, clear text

**Acceptance Criteria:**
- ✅ User activates "Draw Element" tool from toolbar
- ✅ Tooltip shows "Select start node"
- ✅ Clicking node 1 highlights it and changes tooltip to "Select end node"
- ✅ Rubberband line follows cursor from start node
- ✅ Clicking node 2 creates element and returns to "Select start node" state
- ✅ First ESC clears start node selection, second ESC exits tool mode
- ✅ User can create multiple elements in sequence without re-activating tool
- ✅ Hovering near node highlights it for selection

**User Workflow:**
```
1. Click "Draw Element" button in toolbar
2. [Tooltip: "Select start node"]
3. Click on node A → node A highlights
4. [Tooltip: "Select end node (ESC to cancel selection)"]
5. Click on node B → element A-B created
6. [Tooltip: "Select start node"] (still in draw mode)
7. Click on node C → node C highlights
8. [Tooltip: "Select end node (ESC to cancel selection)"]
9. Press ESC → node C deselected
10. [Tooltip: "Select start node"]
11. Press ESC → exits draw element mode, returns to select tool
```

**Files to Create/Modify:**
- `src/geometry/hitTestUtils.ts` (NEW)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/components/StatusBar.tsx` (NEW - early implementation)
- `src/store/useUIStore.ts` (MODIFY)
- `src/hooks/useKeyboardShortcuts.ts` (NEW or create early for ESC handling)

---

### ❌ Step 10: Select & Move Tools
**Goal:** Enable node selection and dragging with visual feedback

**Tasks:**
1. **Select Tool:**
   - Click on node: select it (clear previous selection)
   - Shift+click: toggle node in multi-select
   - Click on empty space: clear selection
   - Visual: selected nodes have different color/stroke

2. **Move Tool / Drag:**
   - When node(s) selected and `activeTool === 'move'` (or drag in select mode):
     - Mouse down on selected node: begin drag
     - Mouse move: update node position(s) with `moveNode(id, x, y)`
     - Mouse up: end drag
   - Connected elements update automatically (elements reference node IDs)

3. **Update useModelStore:**
   - Add `selectedNodes: string[]` - Array of selected node IDs
   - Add actions:
     - `selectNode(id, addToSelection)` - Single or multi-select
     - `clearSelection()`
     - `moveNode(id, x, y)` - Update node coordinates (already exists, verify)
     - `moveNodes(idPosMap)` - Batch move for multi-select drag

4. **Update useUIStore:**
   - Add `isDragging: boolean`
   - Add `dragStartPos: {x, y} | null`

**Acceptance Criteria:**
- ✅ Clicking node selects it visually
- ✅ Shift+click adds/removes from selection
- ✅ Dragging selected node(s) moves them smoothly
- ✅ Connected elements update during drag
- ✅ Multi-select drag moves all selected nodes

**Files to Create/Modify:**
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useModelStore.ts` (MODIFY)
- `src/store/useUIStore.ts` (MODIFY)

---

### ❌ Step 11: Add/Edit Supports (Boundary Conditions)
**Goal:** Enable support assignment to nodes with visual indicators

**Tasks:**
1. **Support Tool:**
   - When `activeTool === 'add_support'`:
     - Click on node: open support type selector (dropdown/modal)
     - Select type: `fixed | pinned | roller-x | roller-y | free`
     - Update node with `setNodeSupport(nodeId, supportType)`
   - Visual: render support symbols on canvas
     - Fixed: Triangle at node
     - Pinned: Circle at node
     - Roller-x: Horizontal rollers
     - Roller-y: Vertical rollers

2. **Update Node type:**
   - Add property: `support?: 'fixed' | 'pinned' | 'roller-x' | 'roller-y' | 'free'`

3. **Update useModelStore:**
   - Add action: `setNodeSupport(nodeId, supportType)`
   - Ensure supports included in analysis data translation

4. **Create support rendering component:**
   - File: `src/components/SupportRenderer.tsx`
   - Konva shapes for each support type

**Acceptance Criteria:**
- ✅ Clicking node in support mode opens type selector
- ✅ Supports render with correct symbols
- ✅ Supports persist and are sent to analysis
- ✅ Can change support type by clicking again

**Files to Create/Modify:**
- `src/components/SupportRenderer.tsx` (NEW)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useModelStore.ts` (MODIFY)
- `src/types/modelTypes.ts` (MODIFY)

---

### ❌ Step 12: Add/Edit Loads
**Goal:** Enable load assignment (nodal forces, distributed loads, point loads on elements)

**Tasks:**
1. **Nodal Load Tool:**
   - When `activeTool === 'add_load'`:
     - Click on node: open load input dialog
     - Input fields: `fx (kN)`, `fy (kN)`, `mz (kNm)`, `loadCase (dropdown)`
     - Submit: add to `useModelStore.loads.nodal[]`
   - Visual: arrows showing force direction and magnitude

2. **Distributed Load Tool:**
   - Click on element: open distributed load dialog
   - Input: `w (kN/m)`, `direction (global/local)`, `loadCase`
   - Visual: series of small arrows along element

3. **Element Point Load Tool:**
   - Click on element: open point load dialog
   - Input: `position (0-1 or distance)`, `fx, fy`, `loadCase`
   - Visual: arrow at position along element

4. **Update Load types:**
   - Add `case: string` to all load types (already exists, verify)
   - Filter loads by `activeLoadCase` in CanvasView rendering

5. **Update useModelStore:**
   - Actions:
     - `addNodalLoad(nodeId, fx, fy, mz, case)`
     - `addDistributedLoad(elementId, w, direction, case)`
     - `addElementPointLoad(elementId, position, fx, fy, case)`
     - `removeLoad(loadId)`
     - `editLoad(loadId, newValues)`

6. **Create load rendering:**
   - File: `src/components/LoadRenderer.tsx`
   - Arrow shapes for forces
   - Scale arrows by magnitude (with min/max visual size)

**Acceptance Criteria:**
- ✅ Can add nodal loads to nodes with input dialog
- ✅ Can add distributed loads to elements
- ✅ Can add point loads to elements
- ✅ Loads render as arrows
- ✅ Loads are filtered by active load case
- ✅ Loads are sent to analysis correctly

**Files to Create/Modify:**
- `src/components/LoadRenderer.tsx` (NEW)
- `src/components/LoadInputDialog.tsx` (NEW)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useModelStore.ts` (MODIFY)

---

### ❌ Step 13: Snapping System - Basic (Grid, Endpoints, Midpoints)
**Goal:** Implement snapping engine for precise drawing

**Tasks:**
1. **Create geometry utilities:**
   - File: `src/geometry/geometryUtils.ts`
   - Functions:
     - `distance(p1, p2): number`
     - `midpoint(p1, p2): Point`
     - `projectPointOnLine(point, lineStart, lineEnd): Point`
     - `nearestPointOnLine(point, lineStart, lineEnd): Point`

2. **Create snap utilities:**
   - File: `src/geometry/snapUtils.ts`
   - Function: `findSnapPoint(cursor, nodes, elements, snapModes, tolerance): SnapResult | null`
   - SnapResult: `{ point: {x, y}, type: 'endpoint' | 'midpoint' | 'grid' | 'intersection' }`
   - Check in priority order:
     1. **Endpoint snap**: Snap to existing node positions
     2. **Midpoint snap**: Snap to element midpoints
     3. **Grid snap**: Snap to grid intersections (configurable spacing)

3. **Update useUIStore:**
   - Add snap toggles:
     - `snapToGrid: boolean`
     - `snapToEndpoints: boolean`
     - `snapToMidpoints: boolean`
     - `gridSpacing: number` (default 1.0m)
   - Add `SNAP_TOLERANCE` constant (e.g., 0.2m in world coords)

4. **Integrate snapping:**
   - In CanvasView mouse handlers, call `findSnapPoint()` before adding nodes
   - Visual feedback: small crosshair marker at snap point
   - Use snapped coordinates instead of raw cursor position

**Acceptance Criteria:**
- ✅ Grid snap works when enabled
- ✅ Endpoint snap highlights existing nodes
- ✅ Midpoint snap finds element centers
- ✅ Visual marker shows snap location
- ✅ Can toggle snap modes from toolbar

**Files to Create/Modify:**
- `src/geometry/geometryUtils.ts` (NEW)
- `src/geometry/snapUtils.ts` (NEW)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useUIStore.ts` (MODIFY)
- `src/components/Toolbar.tsx` (MODIFY - add snap toggles)

---

### ❌ Step 14: Snapping System - Advanced (Intersection, Perpendicular, Angles)
**Goal:** Add advanced snapping for complex geometry

**Tasks:**
1. **Extend geometryUtils.ts:**
   - `lineIntersection(line1Start, line1End, line2Start, line2End): Point | null`
   - `perpendicularFoot(point, lineStart, lineEnd): Point`
   - `angleBetweenPoints(p1, p2): number` (in radians)
   - `snapAngleToIncrement(angle, increment): number` (e.g., round to 15°)

2. **Extend snapUtils.ts:**
   - Add intersection snap: find crossing points of all element pairs
   - Add perpendicular snap: find foot of perpendicular from cursor to elements
   - Add angle snap: when drawing element, constrain angle to increments (hold Shift)

3. **Update useUIStore:**
   - Add snap modes:
     - `snapToIntersections: boolean`
     - `snapToPerpendicular: boolean`
     - `angleSnapEnabled: boolean`
     - `angleSnapIncrement: number` (default 15°)

4. **Keyboard modifiers:**
   - Shift: lock angle to snap increment
   - Ctrl: force perpendicular snap
   - Visual hint: show angle value or perpendicular symbol

**Acceptance Criteria:**
- ✅ Intersection snap finds line crossings
- ✅ Perpendicular snap finds nearest foot on elements
- ✅ Angle snap constrains new elements to 15° increments (or configured)
- ✅ Keyboard modifiers work as expected

**Files to Create/Modify:**
- `src/geometry/geometryUtils.ts` (MODIFY)
- `src/geometry/snapUtils.ts` (MODIFY)
- `src/components/CanvasView.tsx` (MODIFY)
- `src/store/useUIStore.ts` (MODIFY)

---

### ❌ Step 15: Numeric Coordinate Input (Absolute & Relative)
**Goal:** Allow precise coordinate entry via keyboard

**Tasks:**
1. **Create CoordinateInput component:**
   - File: `src/components/CoordinateInput.tsx`
   - Text input field that accepts:
     - **Absolute**: `x,y` (e.g., "10.5,20.3") → move selected node(s) to (10.5, 20.3)
     - **Relative**: `@dx,dy` (e.g., "@5,0") → move selected node(s) by (+5, 0)
     - **Polar (optional)**: `r<angle` (e.g., "10<45") → move by length 10 at 45°

2. **Input parsing:**
   - Validate format with regex
   - Show validation error for invalid input
   - On Enter: apply transformation to selected nodes
   - On Escape: cancel input

3. **Show current coordinates:**
   - Display selected node coordinates when selection changes
   - For multi-select: show centroid or first node

4. **Integrate in UI:**
   - Add to Toolbar or StatusBar
   - Focus input with keyboard shortcut (e.g., "C" key)

**Acceptance Criteria:**
- ✅ Typing "100,50" moves selected node to (100, 50)
- ✅ Typing "@10,0" moves selected node(s) by +10 in X
- ✅ Invalid input shows error, doesn't crash
- ✅ Works under pan/zoom (uses world coordinates)

**Files to Create/Modify:**
- `src/components/CoordinateInput.tsx` (NEW)
- `src/components/Toolbar.tsx` or `StatusBar.tsx` (MODIFY)
- `src/utils/coordinateParser.ts` (NEW - parsing logic)

---

### ❌ Step 16: Undo/Redo System
**Goal:** Implement robust undo/redo for all model changes

**Tasks:**
1. **Choose strategy:**
   - **Snapshot-based**: Store full model state after each action
   - **Action-based**: Store inverse actions (e.g., `addNode` → `removeNode`)
   - Recommendation: Snapshot-based (simpler, more robust)

2. **Create undo middleware:**
   - File: `src/store/undoRedoMiddleware.ts`
   - Intercept Zustand state changes
   - Maintain history stack:
     - `past: State[]` - Previous states
     - `future: State[]` - States after undo
   - Limit history size (e.g., 50 actions)

3. **Add to useModelStore:**
   - Actions:
     - `undo()` - Restore previous state, push current to future
     - `redo()` - Restore next state, push current to past
   - Exclude from history: UI state changes, analysis results

4. **Keyboard shortcuts:**
   - Ctrl+Z: undo
   - Ctrl+Shift+Z or Ctrl+Y: redo

5. **UI indicators:**
   - Show undo/redo buttons in toolbar (disabled when no history)
   - Optional: show history list in debug panel

**Acceptance Criteria:**
- ✅ Adding/moving/deleting nodes can be undone/redone
- ✅ Adding/deleting elements can be undone/redone
- ✅ Load and support changes can be undone/redone
- ✅ Keyboard shortcuts work
- ✅ Undo/redo doesn't break analysis or visualization

**Files to Create/Modify:**
- `src/store/undoRedoMiddleware.ts` (NEW)
- `src/store/useModelStore.ts` (MODIFY - integrate middleware)
- `src/components/Toolbar.tsx` (MODIFY - add buttons)
- `src/hooks/useKeyboardShortcuts.ts` (NEW or MODIFY)

---

### ❌ Step 17: Keyboard Shortcuts & Accessibility
**Goal:** Add keyboard navigation and shortcuts for power users

**Tasks:**
1. **Create keyboard handler:**
   - File: `src/hooks/useKeyboardShortcuts.ts`
   - Listen to global keyboard events
   - Map keys to actions:
     - **D**: Switch to draw node tool
     - **E**: Switch to draw element tool
     - **S**: Switch to select tool
     - **M**: Switch to move tool
     - **L**: Switch to add load tool
     - **R**: Switch to add support tool
     - **Delete/Backspace**: Delete selected nodes/elements
     - **Escape**: Cancel current action, clear selection
     - **Ctrl+Z**: Undo
     - **Ctrl+Shift+Z**: Redo
     - **Ctrl+A**: Select all
     - **G**: Toggle grid snap
     - **Shift** (hold): Enable angle snap
     - **Ctrl** (hold): Enable perpendicular snap

2. **Add tooltips:**
   - Toolbar buttons show keyboard shortcuts in hover tooltip
   - e.g., "Select Tool (S)"

3. **Accessibility:**
   - Add ARIA labels to buttons and inputs
   - Ensure keyboard focus is visible
   - Make nodes focusable (for keyboard navigation)

4. **Prevent conflicts:**
   - Don't trigger shortcuts when typing in input fields
   - Check `event.target.tagName !== 'INPUT'`

**Acceptance Criteria:**
- ✅ All keyboard shortcuts work as documented
- ✅ Tooltips show shortcuts
- ✅ Focus is visible and logical
- ✅ Shortcuts don't interfere with text input

**Files to Create/Modify:**
- `src/hooks/useKeyboardShortcuts.ts` (NEW)
- `src/App.tsx` (MODIFY - use hook)
- `src/components/Toolbar.tsx` (MODIFY - add tooltips)

---

### ❌ Step 18: Delete Nodes/Elements/Loads/Supports
**Goal:** Enable deletion of model entities

**Tasks:**
1. **Delete selected nodes:**
   - Delete key or toolbar button: call `deleteNodes(selectedIds)`
   - **Cascade delete**: Remove connected elements automatically
   - Warn user if deleting nodes with loads/supports

2. **Delete selected elements:**
   - Select element (click on line): highlight
   - Delete key: call `deleteElements(selectedIds)`
   - Remove associated distributed/point loads

3. **Delete loads:**
   - Click on load arrow: select load
   - Delete key or context menu: remove load

4. **Delete supports:**
   - Click on support symbol: select support
   - Delete key: set node support to 'free'

5. **Update useModelStore:**
   - Add actions:
     - `deleteNodes(ids)` - Remove nodes and connected elements
     - `deleteElements(ids)` - Remove elements and loads
     - `deleteLoad(id)` - Remove load
     - `deleteSupport(nodeId)` - Set support to free
   - Add `selectedElements: string[]` for element selection

6. **Selection modes:**
   - Extend selection to include elements (currently only nodes)
   - Clicking on element selects it (highlight)

**Acceptance Criteria:**
- ✅ Deleting node removes connected elements
- ✅ Deleting element removes element-specific loads
- ✅ Can delete loads and supports individually
- ✅ Deletion can be undone

**Files to Create/Modify:**
- `src/store/useModelStore.ts` (MODIFY)
- `src/components/CanvasView.tsx` (MODIFY - element selection)

---

### ❌ Step 19: Edit Properties (Material, Section, Load Values)
**Goal:** Enable editing of existing entities

**Tasks:**
1. **Node properties:**
   - Double-click node: open edit dialog
   - Edit: x, y, support type

2. **Element properties:**
   - Double-click element: open edit dialog
   - Edit: E (GPa), I (m^4), A (m^2), section name

3. **Load properties:**
   - Double-click load arrow: open edit dialog
   - Edit: fx, fy, mz (or w for distributed), load case

4. **Create property dialogs:**
   - File: `src/components/PropertyDialog.tsx`
   - Generic dialog component with form inputs
   - Validate inputs (numbers, positive values, etc.)

5. **Update useModelStore:**
   - Add actions:
     - `updateNode(id, updates)`
     - `updateElement(id, updates)`
     - `updateLoad(id, updates)`

**Acceptance Criteria:**
- ✅ Double-clicking entities opens edit dialog
- ✅ Changes are validated and applied
- ✅ Invalid input shows error
- ✅ Edits can be undone

**Files to Create/Modify:**
- `src/components/PropertyDialog.tsx` (NEW)
- `src/components/CanvasView.tsx` (MODIFY - double-click handlers)
- `src/store/useModelStore.ts` (MODIFY)

---

### ❌ Step 20: Model Import/Export (JSON Persistence)
**Goal:** Save and load models as JSON files

**Tasks:**
1. **Export function:**
   - Serialize entire model state to JSON:
     - Nodes, elements, loads, supports, load cases, combinations
   - Trigger browser download with `a.download` or FileSaver.js
   - Filename: `frame_model_YYYY-MM-DD.json`

2. **Import function:**
   - File input to select JSON file
   - Parse and validate structure
   - Replace current model with loaded data
   - Show error if invalid format

3. **Auto-save to localStorage:**
   - On every model change (debounced), save to `localStorage.getItem('2dfea_autosave')`
   - On app load, check for autosave and ask user to restore

4. **Add to Toolbar:**
   - File menu or buttons:
     - New (clear model)
     - Open (import JSON)
     - Save (export JSON)

5. **Update useModelStore:**
   - Add actions:
     - `exportModel(): string` - Serialize to JSON
     - `importModel(json: string)` - Load from JSON
     - `clearModel()` - Reset to empty model

**Acceptance Criteria:**
- ✅ Exported JSON contains all model data
- ✅ Imported JSON restores model correctly
- ✅ Auto-save restores on page reload
- ✅ Invalid JSON shows error, doesn't crash

**Files to Create/Modify:**
- `src/utils/modelIO.ts` (NEW - import/export logic)
- `src/components/Toolbar.tsx` (MODIFY - add file menu)
- `src/store/useModelStore.ts` (MODIFY)

---

### ❌ Step 21: Performance Optimization
**Goal:** Ensure app remains responsive for large models

**Tasks:**
1. **Rendering optimization:**
   - Use Konva's `listening={false}` on non-interactive shapes (diagrams)
   - Batch redraws with `layer.batchDraw()`
   - Implement layer caching for static elements

2. **Hit-testing optimization:**
   - Replace naive O(n) loops with spatial indexing (quadtree) for large models
   - Only check nearby nodes/elements for hit-testing

3. **Debounce expensive operations:**
   - Auto-save to localStorage: debounce by 1s
   - Snap calculation: throttle on mousemove with requestAnimationFrame

4. **Lazy rendering:**
   - Only render elements in viewport (when zoomed in on large model)

5. **Memory management:**
   - Limit undo history size (50-100 states)
   - Clear unused Konva nodes

**Acceptance Criteria:**
- ✅ App remains >30 FPS with 500+ nodes/elements
- ✅ No memory leaks after extended use
- ✅ Hit-testing is instant even with 1000 elements

**Files to Create/Modify:**
- `src/components/CanvasView.tsx` (MODIFY - optimizations)
- `src/geometry/spatialIndex.ts` (NEW - quadtree, optional)

---

### ❌ Step 22: Testing & Polish
**Goal:** Comprehensive testing and final UX improvements

**Tasks:**
1. **Unit tests:**
   - Geometry utils (snapUtils, geometryUtils, transformUtils)
   - Data translator & result parser
   - Store actions (add/move/delete)

2. **Integration tests:**
   - Full workflow: draw → snap → analyze → visualize
   - Load example frames from old 2dframeanalysis
   - Verify analysis results match known values

3. **E2E tests (Playwright/Cypress):**
   - Draw simple frame
   - Add supports and loads
   - Run analysis
   - Export/import JSON

4. **UX polish:**
   - Loading spinners during analysis
   - Error messages for invalid operations
   - Confirmation dialogs for destructive actions (delete all, clear model)
   - StatusBar showing: cursor coordinates, selected count, tool name

5. **Documentation:**
   - User guide with screenshots
   - Developer guide for code structure
   - Keyboard shortcut reference

**Acceptance Criteria:**
- ✅ All unit tests pass
- ✅ Integration tests cover main workflows
- ✅ E2E tests pass in CI
- ✅ UX feels polished and professional

**Files to Create/Modify:**
- `test/**/*.test.ts` (NEW - all tests)
- `src/components/StatusBar.tsx` (NEW)
- `docs/user-guide.md` (NEW)

---

## Revised Implementation Order

### Phase 1: Core Editing (Steps 8-10) - ~3-4 days
**Priority: HIGH** - Without this, the app is view-only

1. **Step 8:** Interactive canvas foundation (pan/zoom, coordinate transforms, draw nodes)
2. **Step 9:** Draw elements tool (node-to-node with rubberband)
3. **Step 10:** Select & move tools (drag nodes, multi-select)

**Deliverable:** Can draw, move, and edit basic frame geometry

---

### Phase 2: Structural Features (Steps 11-12) - ~2-3 days
**Priority: HIGH** - Essential for analysis

1. **Step 11:** Add/edit supports (boundary conditions with visual symbols)
2. **Step 12:** Add/edit loads (nodal, distributed, point loads with arrows)

**Deliverable:** Can create complete structural model ready for analysis

---

### Phase 3: Precision Tools (Steps 13-15) - ~3-4 days
**Priority: MEDIUM** - Improves accuracy and efficiency

1. **Step 13:** Basic snapping (grid, endpoints, midpoints)
2. **Step 14:** Advanced snapping (intersections, perpendicular, angles)
3. **Step 15:** Numeric coordinate input (absolute & relative)

**Deliverable:** Professional-grade precision drawing capabilities

---

### Phase 4: Workflow Enhancements (Steps 16-20) - ~4-5 days
**Priority: MEDIUM** - Quality of life features

1. **Step 16:** Undo/redo system
2. **Step 17:** Keyboard shortcuts & accessibility
3. **Step 18:** Delete nodes/elements/loads/supports
4. **Step 19:** Edit properties (double-click dialogs)
5. **Step 20:** Import/export JSON (persistence)

**Deliverable:** Fully-featured editor with professional workflow

---

### Phase 5: Optimization & Testing (Steps 21-22) - ~3-4 days
**Priority: LOW (initially)** - Can defer until large models needed

1. **Step 21:** Performance optimization (spatial indexing, lazy rendering)
2. **Step 22:** Testing & polish (unit/integration/E2E tests, UX refinements)

**Deliverable:** Production-ready application

---

## Total Estimated Time

- **Existing (Steps 1-7):** ✅ COMPLETE (~10-14 days already invested)
- **Missing (Steps 8-22):** ❌ TODO (~15-20 days)
- **Total:** ~25-34 days for full implementation

---

## Immediate Next Steps

### Recommended Start: Step 8 (Interactive Canvas Foundation)

**Why start here:**
- Currently, users **cannot add nodes or elements** - this is the most critical missing feature
- Foundation for all subsequent editing features
- Relatively isolated (doesn't depend on Steps 9-22)

**Action plan:**
1. Create `src/geometry/transformUtils.ts` with screen↔world conversion
2. Update `src/store/useUIStore.ts` with `activeTool` state
3. Update `src/components/CanvasView.tsx` with mouse handlers
4. Implement pan & zoom controls
5. Implement "draw node" tool (click to add)
6. Test: verify nodes can be added and stay in correct world positions under zoom/pan

**Acceptance test:**
```
1. Open app
2. Click "Draw Node" tool in toolbar
3. Click on canvas → node appears at cursor
4. Zoom in/out → node stays in same world position
5. Pan canvas → node moves with view correctly
6. Click on canvas again → new node appears
7. Success!
```

---

## File Structure (Complete)

```
2dfea/
├── public/
│   ├── python/                              ✅ COMPLETE
│   │   ├── pynite_analyzer.py
│   │   └── setup_pynite_env.py
│   └── workers/
│       └── solverWorker.js                  ✅ COMPLETE
├── src/
│   ├── analysis/                            ✅ COMPLETE
│   │   ├── solverInterface.ts
│   │   ├── dataTranslator.ts
│   │   ├── resultParser.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── CanvasView.tsx                   ⚠️  NEEDS MAJOR UPDATE (Steps 8-12)
│   │   ├── Toolbar.tsx                      ⚠️  NEEDS UPDATE (Steps 8-20)
│   │   ├── ResultsPanel.tsx                 ✅ COMPLETE
│   │   ├── LoadCasePanel.tsx                ✅ COMPLETE
│   │   ├── SupportRenderer.tsx              ❌ TODO (Step 11)
│   │   ├── LoadRenderer.tsx                 ❌ TODO (Step 12)
│   │   ├── LoadInputDialog.tsx              ❌ TODO (Step 12)
│   │   ├── CoordinateInput.tsx              ❌ TODO (Step 15)
│   │   ├── PropertyDialog.tsx               ❌ TODO (Step 19)
│   │   └── StatusBar.tsx                    ❌ TODO (Step 22)
│   ├── geometry/                            ❌ ALL TODO
│   │   ├── transformUtils.ts                ❌ Step 8
│   │   ├── hitTestUtils.ts                  ❌ Step 9
│   │   ├── geometryUtils.ts                 ❌ Step 13
│   │   ├── snapUtils.ts                     ❌ Step 13
│   │   └── spatialIndex.ts                  ❌ Step 21 (optional)
│   ├── store/
│   │   ├── useModelStore.ts                 ⚠️  NEEDS UPDATE (Steps 8-20)
│   │   ├── useUIStore.ts                    ⚠️  NEEDS UPDATE (Steps 8-17)
│   │   └── undoRedoMiddleware.ts            ❌ TODO (Step 16)
│   ├── visualization/                       ✅ COMPLETE
│   │   ├── diagramUtils.ts
│   │   └── displacedShape.ts
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts          ❌ TODO (Step 17)
│   ├── utils/
│   │   ├── coordinateParser.ts              ❌ TODO (Step 15)
│   │   └── modelIO.ts                       ❌ TODO (Step 20)
│   ├── types/
│   │   └── modelTypes.ts                    ⚠️  NEEDS UPDATE (add Support, etc.)
│   └── App.tsx                              ✅ COMPLETE (minor updates needed)
├── test/                                    ❌ TODO (Step 22)
│   ├── python/
│   │   └── test_analyzer.py
│   ├── unit/
│   │   ├── geometry.test.ts
│   │   └── store.test.ts
│   └── e2e/
│       └── workflow.spec.ts
└── README.md                                ✅ COMPLETE
```

---

## Success Criteria (Updated)

### Functional Requirements
- ✅ **Analysis Backend:** PyNite worker analyzes frames → **COMPLETE**
- ✅ **Results Visualization:** Diagrams and displaced shape → **COMPLETE**
- ✅ **Load Cases:** Manage cases and combinations → **COMPLETE**
- ❌ **Interactive Drawing:** Add/move nodes and elements → **MISSING**
- ❌ **Supports & Loads:** Assign boundary conditions and forces → **MISSING**
- ❌ **Snapping:** Precision drawing with snap modes → **MISSING**
- ❌ **Persistence:** Save/load models → **MISSING**
- ❌ **Undo/Redo:** History management → **MISSING**

### Non-Functional Requirements
- ❌ **Usability:** Keyboard shortcuts, tooltips, intuitive UI → **PARTIAL**
- ❌ **Performance:** Smooth for 500+ elements → **NOT TESTED**
- ✅ **Type Safety:** Full TypeScript coverage → **COMPLETE**
- ❌ **Testing:** Unit/integration/E2E tests → **MISSING**

---

## Risk Mitigation (Updated)

### Risk 1: Large scope of missing features
- **Mitigation:** Implement in phases (Steps 8-10 first for MVP editing)
- **Success metric:** After Phase 1, users can draw basic frames

### Risk 2: Complex interaction state management
- **Mitigation:** Use Zustand stores + clear separation (UIStore vs ModelStore)
- **Testing:** Test each tool mode independently

### Risk 3: Performance with large models
- **Mitigation:** Defer optimization (Step 21) until needed
- **Fallback:** Add "simple mode" without snapping/visual effects

### Risk 4: Snapping complexity
- **Mitigation:** Implement basic snapping first (Step 13), add advanced later (Step 14)
- **Testing:** Unit test geometry functions extensively

---

## Conclusion

**Current State:** Backend analysis is fully functional, but the app is **view-only** - users cannot create or modify models interactively.

**Critical Path:** Steps 8-12 (Core Editing + Structural Features) are essential to make the app usable.

**Recommendation:**
1. Start with **Step 8** immediately (interactive canvas foundation)
2. Complete Phase 1 (Steps 8-10) as MVP
3. Add Phase 2 (Steps 11-12) for complete structural modeling
4. Defer Phases 3-5 to future iterations

**Next Action:** Begin Step 8 implementation with transformUtils.ts and CanvasView.tsx updates.
