/**
 * UI Store - Manages UI state (tools, view, snapping)
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
  x: number;      // Pan offset X
  y: number;      // Pan offset Y
  scale: number;  // Zoom level (1 = 100%)
}

export interface SnapSettings {
  enabled: boolean;
  modes: SnapMode[];
  gridSize: number;  // m
  tolerance: number; // pixels
}

export interface UIState {
  // Tool state
  activeTool: Tool;
  setTool: (tool: Tool) => void;

  // View state
  view: ViewTransform;
  setView: (transform: Partial<ViewTransform>) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;

  // Snap state
  snap: SnapSettings;
  toggleSnap: () => void;
  setSnapMode: (mode: SnapMode, enabled: boolean) => void;
  setSnapGridSize: (size: number) => void;

  // Selection
  selectedNodes: string[];
  selectedElements: string[];
  selectNode: (name: string, append?: boolean) => void;
  selectElement: (name: string, append?: boolean) => void;
  clearSelection: () => void;

  // UI visibility
  showGrid: boolean;
  showLoads: boolean;
  showSupports: boolean;
  showDimensions: boolean;
  showResults: boolean;
  toggleGrid: () => void;
  toggleLoads: () => void;
  toggleSupports: () => void;
  toggleDimensions: () => void;
  toggleResults: () => void;

  // Coordinate input
  coordinateInput: string;
  setCoordinateInput: (value: string) => void;

  // Panels
  showPropertiesPanel: boolean;
  showResultsPanel: boolean;
  togglePropertiesPanel: () => void;
  toggleResultsPanel: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
  activeTool: 'select' as Tool,
  view: {
    x: 0,
    y: 0,
    scale: 1,
  },
  snap: {
    enabled: true,
    modes: ['endpoint', 'midpoint', 'grid'] as SnapMode[],
    gridSize: 1,      // 1m grid
    tolerance: 10,    // 10px snap tolerance
  },
  selectedNodes: [],
  selectedElements: [],
  showGrid: true,
  showLoads: true,
  showSupports: true,
  showDimensions: false,
  showResults: false,
  coordinateInput: '',
  showPropertiesPanel: true,
  showResultsPanel: false,
};

// ============================================================================
// STORE
// ============================================================================

export const useUIStore = create<UIState>()(
  devtools(
    immer((set, get) => ({
      ...initialState,

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

      resetView: () => {
        set({ view: initialState.view });
      },

      zoomIn: () => {
        set((state) => {
          state.view.scale = Math.min(state.view.scale * 1.2, 10);
        });
      },

      zoomOut: () => {
        set((state) => {
          state.view.scale = Math.max(state.view.scale / 1.2, 0.1);
        });
      },

      zoomToFit: () => {
        // TODO: Calculate bounds and fit to canvas
        set({ view: { x: 0, y: 0, scale: 1 } });
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

      // Selection actions
      selectNode: (name, append = false) => {
        set((state) => {
          if (append) {
            if (state.selectedNodes.includes(name)) {
              state.selectedNodes = state.selectedNodes.filter((n) => n !== name);
            } else {
              state.selectedNodes.push(name);
            }
          } else {
            state.selectedNodes = [name];
          }
          state.selectedElements = []; // Clear element selection
        });
      },

      selectElement: (name, append = false) => {
        set((state) => {
          if (append) {
            if (state.selectedElements.includes(name)) {
              state.selectedElements = state.selectedElements.filter((e) => e !== name);
            } else {
              state.selectedElements.push(name);
            }
          } else {
            state.selectedElements = [name];
          }
          state.selectedNodes = []; // Clear node selection
        });
      },

      clearSelection: () => {
        set({ selectedNodes: [], selectedElements: [] });
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
    })),
    { name: 'UIStore' }
  )
);
