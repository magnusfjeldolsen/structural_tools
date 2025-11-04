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
  | 'add-support'
  | 'support-fixed'
  | 'support-pinned'
  | 'support-roller-x'
  | 'support-roller-y';

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
  hoveredLoad: { type: 'nodal' | 'distributed' | 'elementPoint'; index: number } | null;
  setHoveredNode: (name: string | null) => void;
  setHoveredElement: (name: string | null) => void;
  setHoveredLoad: (load: { type: 'nodal' | 'distributed' | 'elementPoint'; index: number } | null) => void;

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
  displacementScale: number;  // Automatic multiplier for displaced shape
  displacementScaleManual: number;  // User-set multiplier (if useManualDisplacementScale is true)
  useManualDisplacementScale: boolean;  // Whether to use manual or automatic scale
  momentDiagramScale: number;  // Automatic multiplier for moment diagram
  momentDiagramScaleManual: number;  // User-set multiplier
  useManualMomentDiagramScale: boolean;  // Whether to use manual or automatic scale
  shearDiagramScale: number;  // Automatic multiplier for shear diagram
  shearDiagramScaleManual: number;  // User-set multiplier
  useManualShearDiagramScale: boolean;  // Whether to use manual or automatic scale
  axialDiagramScale: number;  // Automatic multiplier for axial diagram
  axialDiagramScaleManual: number;  // User-set multiplier
  useManualAxialDiagramScale: boolean;  // Whether to use manual or automatic scale

  // Scale setters
  setDisplacementScale: (scale: number) => void;  // Sets automatic scale
  setDisplacementScaleManual: (scale: number) => void;  // Sets manual scale and switches to manual mode
  resetDisplacementScale: () => void;  // Resets to automatic mode
  setMomentDiagramScale: (scale: number) => void;  // Sets automatic scale
  setMomentDiagramScaleManual: (scale: number) => void;  // Sets manual scale
  resetMomentDiagramScale: () => void;  // Resets to automatic mode
  setShearDiagramScale: (scale: number) => void;  // Sets automatic scale
  setShearDiagramScaleManual: (scale: number) => void;  // Sets manual scale
  resetShearDiagramScale: () => void;  // Resets to automatic mode
  setAxialDiagramScale: (scale: number) => void;  // Sets automatic scale
  setAxialDiagramScaleManual: (scale: number) => void;  // Sets manual scale
  resetAxialDiagramScale: () => void;  // Resets to automatic mode

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

  // Load input dialog
  loadDialogOpen: boolean;
  loadDialogType?: 'nodal' | 'point' | 'distributed' | 'lineLoad';
  editingLoadData?: {
    type: 'nodal' | 'point' | 'distributed';
    index: number;
  };
  openLoadDialog: (type?: 'nodal' | 'point' | 'distributed' | 'lineLoad', editData?: { type: 'nodal' | 'point' | 'distributed'; index: number }) => void;
  closeLoadDialog: () => void;

  // Load creation mode (interactive selection on canvas)
  loadCreationMode: null | 'nodal' | 'point' | 'distributed' | 'lineLoad';
  loadParameters: {
    fx?: number;
    fy?: number;
    mz?: number;
    distance?: number;
    direction?: 'Fx' | 'Fy' | 'Mz';
    magnitude?: number;
    w1?: number;
    w2?: number;
    x1?: number;
    x2?: number;
    case?: string;
  } | null;
  setLoadCreationMode: (mode: null | 'nodal' | 'point' | 'distributed' | 'lineLoad', params?: any) => void;
  cancelLoadCreation: () => void;

  // Copied data (for paste) - generic system supporting loads, elements, etc.
  copiedData?: {
    entityType: 'load' | 'element';  // Extensible for future entity types
    loadType?: 'nodal' | 'distributed' | 'elementPoint';  // For loads only
    properties: any;
  };
  setCopiedData: (data?: { entityType: 'load' | 'element'; loadType?: 'nodal' | 'distributed' | 'elementPoint'; properties: any }) => void;

  // Paste mode - automatically activated when data is copied
  pasteMode: boolean;
  setPasteMode: (enabled: boolean) => void;
  clearPasteData: () => void;  // Clears both copiedData and pasteMode
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
  hoveredLoad: null,
  showGrid: true,
  showLoads: true,
  showSupports: true,
  showDimensions: false,
  showResults: false,
  showDisplacedShape: false,
  showMomentDiagram: false,
  showShearDiagram: false,
  showAxialDiagram: false,
  displacementScale: 1,  // Auto-calculated value
  displacementScaleManual: 1,  // User-set value
  useManualDisplacementScale: false,  // Start with automatic
  momentDiagramScale: 1,  // Auto-calculated value
  momentDiagramScaleManual: 1,  // User-set value
  useManualMomentDiagramScale: false,  // Start with automatic
  shearDiagramScale: 1,  // Auto-calculated value
  shearDiagramScaleManual: 1,  // User-set value
  useManualShearDiagramScale: false,  // Start with automatic
  axialDiagramScale: 1,  // Auto-calculated value
  axialDiagramScaleManual: 1,  // User-set value
  useManualAxialDiagramScale: false,  // Start with automatic
  coordinateInput: '',
  showPropertiesPanel: true,
  showResultsPanel: false,
  cursorPosition: null,
  loadDialogOpen: false,
  loadDialogType: undefined,
  editingLoadData: undefined,
  loadCreationMode: null,
  loadParameters: null,
  copiedData: undefined,
  pasteMode: false,
};

// ============================================================================
// STORE
// ============================================================================

export const useUIStore = create<UIState>()(
  devtools(
    immer((set) => ({
      ...initialState,

      // Tab actions
      setActiveTab: (tab) => {
        set({ activeTab: tab, activeTool: 'select' });
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

      setHoveredLoad: (load) => {
        set({ hoveredLoad: load });
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

      // Scale setters - Displacement
      setDisplacementScale: (scale) => {
        set({ displacementScale: scale });
      },

      setDisplacementScaleManual: (scale) => {
        set({ displacementScaleManual: scale, useManualDisplacementScale: true });
      },

      resetDisplacementScale: () => {
        set({ useManualDisplacementScale: false });
      },

      // Scale setters - Moment Diagram
      setMomentDiagramScale: (scale) => {
        set({ momentDiagramScale: scale });
      },

      setMomentDiagramScaleManual: (scale) => {
        set({ momentDiagramScaleManual: scale, useManualMomentDiagramScale: true });
      },

      resetMomentDiagramScale: () => {
        set({ useManualMomentDiagramScale: false });
      },

      // Scale setters - Shear Diagram
      setShearDiagramScale: (scale) => {
        set({ shearDiagramScale: scale });
      },

      setShearDiagramScaleManual: (scale) => {
        set({ shearDiagramScaleManual: scale, useManualShearDiagramScale: true });
      },

      resetShearDiagramScale: () => {
        set({ useManualShearDiagramScale: false });
      },

      // Scale setters - Axial Diagram
      setAxialDiagramScale: (scale) => {
        set({ axialDiagramScale: scale });
      },

      setAxialDiagramScaleManual: (scale) => {
        set({ axialDiagramScaleManual: scale, useManualAxialDiagramScale: true });
      },

      resetAxialDiagramScale: () => {
        set({ useManualAxialDiagramScale: false });
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

      // Load dialog actions
      openLoadDialog: (type, editData) => {
        set({ loadDialogOpen: true, loadDialogType: type, editingLoadData: editData });
      },

      closeLoadDialog: () => {
        set({ loadDialogOpen: false, loadDialogType: undefined, editingLoadData: undefined });
      },

      // Load creation mode actions
      setLoadCreationMode: (mode, params) => {
        set({ loadCreationMode: mode, loadParameters: params || null });
      },

      cancelLoadCreation: () => {
        set({ loadCreationMode: null, loadParameters: null });
      },

      // Generic copy/paste system (supports loads, elements, and future entities)
      setCopiedData: (data) => {
        set({ copiedData: data });
      },

      setPasteMode: (enabled) => {
        set({ pasteMode: enabled });
      },

      clearPasteData: () => {
        set({ copiedData: undefined, pasteMode: false });
      },
    })),
    { name: 'UIStore' }
  )
);
