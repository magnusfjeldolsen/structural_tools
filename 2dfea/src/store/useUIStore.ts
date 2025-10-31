/**
 * UI Store - Manages UI state (tools, view, snapping, visualization)
 *
 * Separate from model store to avoid re-renders when UI state changes
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// TYPES
// ============================================================================

export type Tool =
  | 'select'
  | 'draw-node'
  | 'draw-element'
  | 'move'
  | 'delete'
  | 'add-load'
  | 'add-support';

export type SnapMode =
  | 'grid'
  | 'endpoint'
  | 'midpoint'
  | 'intersection'
  | 'perpendicular'
  | 'nearest';

export interface ViewTransform {
  centerX: number;  // World X coordinate (meters) at canvas center
  centerY: number;  // World Y coordinate (meters) at canvas center
  scale: number;    // Zoom scale: pixels per meter (default 50)
}

export interface SnapSettings {
  enabled: boolean;
  modes: SnapMode[];
  gridSize: number;  // m
  tolerance: number; // pixels
}

export type AppTab = 'structure' | 'loads' | 'analysis';

export interface UIState {
  // Tab state
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  // Tool state
  activeTool: Tool;
  setTool: (tool: Tool) => void;

  // View state
  view: ViewTransform;
  setView: (transform: Partial<ViewTransform>) => void;
  panView: (dx: number, dy: number) => void;
  zoomView: (scaleMultiplier: number, centerX?: number, centerY?: number) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;

  // Drawing state (for multi-step operations)
  drawingElement: {
    startNode: string | null;  // Node name if snapped to existing node
    startPos: { x: number; y: number } | null;  // World coordinates
  } | null;
  setDrawingElement: (data: { startNode: string; startPos: { x: number; y: number } }) => void;
  clearDrawingElement: () => void;

  // Snap state
  snap: SnapSettings;
  toggleSnap: () => void;
  setSnapMode: (mode: SnapMode, enabled: boolean) => void;
  setSnapGridSize: (size: number) => void;

  // Selection rectangle state
  selectionRect: { x1: number; y1: number; x2: number; y2: number } | null;
  setSelectionRect: (rect: { x1: number; y1: number; x2: number; y2: number } | null) => void;

  // Move command state
  moveCommand: {
    stage: 'idle' | 'awaiting-basepoint-click' | 'awaiting-basepoint-input' | 'awaiting-endpoint-click' | 'awaiting-endpoint-input';
    basePoint: { x: number; y: number } | null;
  } | null;
  startMoveCommand: () => void;
  setMoveBasePoint: (point: { x: number; y: number }) => void;
  setMoveStage: (stage: 'idle' | 'awaiting-basepoint-click' | 'awaiting-basepoint-input' | 'awaiting-endpoint-click' | 'awaiting-endpoint-input') => void;
  clearMoveCommand: () => void;

  // Command input field
  commandInput: {
    visible: boolean;
    prompt: string;
    value: string;
    error: string | null;
  } | null;
  setCommandInput: (input: { visible: boolean; prompt: string; value: string; error: string | null } | null) => void;
  updateCommandInputValue: (value: string) => void;

  // Snapping
  snapEnabled: boolean;
  snapToNodes: boolean;
  snapToElements: boolean;
  snapTolerance: number;  // pixels
  toggleSnapEnabled: () => void;
  toggleSnapToNodes: () => void;
  toggleSnapToElements: () => void;
  setSnapTolerance: (tolerance: number) => void;

  // Hover state (for snapping feedback)
  hoveredNode: string | null;
  hoveredElement: string | null;
  setHoveredNode: (name: string | null) => void;
  setHoveredElement: (name: string | null) => void;

  // UI visibility
  showGrid: boolean;
  showLoads: boolean;
  showSupports: boolean;
  showDimensions: boolean;
  showResults: boolean;
  showDisplacedShape: boolean;
  showMomentDiagram: boolean;
  showShearDiagram: boolean;
  showAxialDiagram: boolean;
  toggleGrid: () => void;
  toggleLoads: () => void;
  toggleSupports: () => void;
  toggleDimensions: () => void;
  toggleResults: () => void;
  toggleDisplacedShape: () => void;
  toggleMomentDiagram: () => void;
  toggleShearDiagram: () => void;
  toggleAxialDiagram: () => void;

  // Visualization scales
  displacementScale: number;  // Multiplier for displaced shape
  diagramScale: number;        // Multiplier for force diagrams
  setDisplacementScale: (scale: number) => void;
  setDiagramScale: (scale: number) => void;

  // Coordinate input
  coordinateInput: string;
  setCoordinateInput: (value: string) => void;

  // Panels
  showPropertiesPanel: boolean;
  showResultsPanel: boolean;
  togglePropertiesPanel: () => void;
  toggleResultsPanel: () => void;

  // Cursor position (in model coordinates)
  cursorPosition: { x: number; y: number } | null;
  setCursorPosition: (position: { x: number; y: number } | null) => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
  activeTab: 'structure' as AppTab,
  activeTool: 'select' as Tool,
  view: {
    centerX: 0,    // World origin at canvas center
    centerY: 0,
    scale: 50,     // 50 pixels per meter
  },
  drawingElement: null,
  snap: {
    enabled: true,
    modes: ['endpoint', 'midpoint', 'grid'] as SnapMode[],
    gridSize: 1,      // 1m grid
    tolerance: 10,    // 10px snap tolerance
  },
  selectedNodes: [],
  selectedElements: [],
  selectionRect: null,
  moveCommand: null,
  commandInput: null,
  snapEnabled: true,
  snapToNodes: true,
  snapToElements: true,
  snapTolerance: 10,  // pixels
  hoveredNode: null,
  hoveredElement: null,
  showGrid: true,
  showLoads: true,
  showSupports: true,
  showDimensions: false,
  showResults: false,
  showDisplacedShape: false,
  showMomentDiagram: false,
  showShearDiagram: false,
  showAxialDiagram: false,
  displacementScale: 100,  // Auto-calculated but user can override
  diagramScale: 1,         // Auto-calculated but user can override
  coordinateInput: '',
  showPropertiesPanel: true,
  showResultsPanel: false,
  cursorPosition: null,
};

// ============================================================================
// STORE
// ============================================================================

export const useUIStore = create<UIState>()(
  devtools(
    immer((set, get) => ({
      ...initialState,

      // Tab actions
      setActiveTab: (tab) => {
        set({ activeTab: tab });
      },

      // Tool actions
      setTool: (tool) => {
        set({ activeTool: tool });
      },

      // View actions
      setView: (transform) => {
        set((state) => {
          Object.assign(state.view, transform);
        });
      },

      panView: (dx, dy) => {
        // Pan by screen pixel delta - convert to world coordinate delta
        set((state) => {
          const worldDx = dx / state.view.scale;
          const worldDy = -dy / state.view.scale; // Flip Y
          state.view.centerX -= worldDx;
          state.view.centerY -= worldDy;
        });
      },

      zoomView: (scaleMultiplier, centerX, centerY) => {
        // Zoom with optional world coordinate to zoom towards
        // centerX/centerY are in world coordinates
        set((state) => {
          const oldScale = state.view.scale;
          const newScale = Math.max(10, Math.min(500, oldScale * scaleMultiplier));

          if (centerX !== undefined && centerY !== undefined) {
            // Zoom towards a world point, keeping it stationary on screen
            const offsetX = centerX - state.view.centerX;
            const offsetY = centerY - state.view.centerY;
            const scaleRatio = oldScale / newScale;
            const newOffsetX = offsetX * scaleRatio;
            const newOffsetY = offsetY * scaleRatio;

            state.view.centerX = centerX - newOffsetX;
            state.view.centerY = centerY - newOffsetY;
            state.view.scale = newScale;
          } else {
            // Simple zoom at current center
            state.view.scale = newScale;
          }
        });
      },

      resetView: () => {
        set({ view: initialState.view });
      },

      zoomIn: () => {
        set((state) => {
          state.view.scale = Math.min(state.view.scale * 1.2, 500);
        });
      },

      zoomOut: () => {
        set((state) => {
          state.view.scale = Math.max(state.view.scale / 1.2, 10);
        });
      },

      zoomToFit: () => {
        // This will be called with model data from the component
        // Since store doesn't have direct access to canvas size, we just reset
        // The actual calculation happens in CanvasView
        set({ view: { centerX: 0, centerY: 0, scale: 50 } });
      },

      // Drawing state actions
      setDrawingElement: (data) => {
        set({ drawingElement: data });
      },

      clearDrawingElement: () => {
        set({ drawingElement: null });
      },

      // Snap actions
      toggleSnap: () => {
        set((state) => {
          state.snap.enabled = !state.snap.enabled;
        });
      },

      setSnapMode: (mode, enabled) => {
        set((state) => {
          if (enabled) {
            if (!state.snap.modes.includes(mode)) {
              state.snap.modes.push(mode);
            }
          } else {
            state.snap.modes = state.snap.modes.filter((m) => m !== mode);
          }
        });
      },

      setSnapGridSize: (size) => {
        set((state) => {
          state.snap.gridSize = size;
        });
      },

      // Selection rectangle actions
      setSelectionRect: (rect) => {
        set({ selectionRect: rect });
      },

      // Move command actions
      startMoveCommand: () => {
        set({
          moveCommand: {
            stage: 'awaiting-basepoint-click',
            basePoint: null,
          },
        });
      },

      setMoveBasePoint: (point) => {
        set((state) => {
          if (state.moveCommand) {
            state.moveCommand.basePoint = point;
            state.moveCommand.stage = 'awaiting-endpoint-click';
          }
        });
      },

      setMoveStage: (stage) => {
        set((state) => {
          if (state.moveCommand) {
            state.moveCommand.stage = stage;
          }
        });
      },

      clearMoveCommand: () => {
        set({ moveCommand: null });
      },

      // Command input actions
      setCommandInput: (input) => {
        set({ commandInput: input });
      },

      updateCommandInputValue: (value) => {
        set((state) => {
          if (state.commandInput) {
            state.commandInput.value = value;
          }
        });
      },

      // Snapping actions
      toggleSnapEnabled: () => {
        set((state) => {
          state.snapEnabled = !state.snapEnabled;
        });
      },

      toggleSnapToNodes: () => {
        set((state) => {
          state.snapToNodes = !state.snapToNodes;
        });
      },

      toggleSnapToElements: () => {
        set((state) => {
          state.snapToElements = !state.snapToElements;
        });
      },

      setSnapTolerance: (tolerance) => {
        set({ snapTolerance: tolerance });
      },

      // Hover state actions
      setHoveredNode: (name) => {
        set({ hoveredNode: name });
      },

      setHoveredElement: (name) => {
        set({ hoveredElement: name });
      },

      // Visibility toggles
      toggleGrid: () => {
        set((state) => {
          state.showGrid = !state.showGrid;
        });
      },

      toggleLoads: () => {
        set((state) => {
          state.showLoads = !state.showLoads;
        });
      },

      toggleSupports: () => {
        set((state) => {
          state.showSupports = !state.showSupports;
        });
      },

      toggleDimensions: () => {
        set((state) => {
          state.showDimensions = !state.showDimensions;
        });
      },

      toggleResults: () => {
        set((state) => {
          state.showResults = !state.showResults;
        });
      },

      toggleDisplacedShape: () => {
        set((state) => {
          state.showDisplacedShape = !state.showDisplacedShape;
        });
      },

      toggleMomentDiagram: () => {
        set((state) => {
          state.showMomentDiagram = !state.showMomentDiagram;
        });
      },

      toggleShearDiagram: () => {
        set((state) => {
          state.showShearDiagram = !state.showShearDiagram;
        });
      },

      toggleAxialDiagram: () => {
        set((state) => {
          state.showAxialDiagram = !state.showAxialDiagram;
        });
      },

      // Scale setters
      setDisplacementScale: (scale) => {
        set({ displacementScale: scale });
      },

      setDiagramScale: (scale) => {
        set({ diagramScale: scale });
      },

      // Coordinate input
      setCoordinateInput: (value) => {
        set({ coordinateInput: value });
      },

      // Panel toggles
      togglePropertiesPanel: () => {
        set((state) => {
          state.showPropertiesPanel = !state.showPropertiesPanel;
        });
      },

      toggleResultsPanel: () => {
        set((state) => {
          state.showResultsPanel = !state.showResultsPanel;
        });
      },

      // Cursor position
      setCursorPosition: (position) => {
        set({ cursorPosition: position });
      },
    })),
    { name: 'UIStore' }
  )
);
