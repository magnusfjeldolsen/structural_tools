/**
 * Model Store - Central state management for 2D frame model
 *
 * Manages:
 * - Nodes (geometry + supports)
 * - Elements (beams)
 * - Loads (nodal, distributed, point)
 * - Analysis state and results
 * - Solver instance
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Node,
  Element,
  Loads,
  NodalLoad,
  DistributedLoad,
  ElementPointLoad,
  AnalysisResults,
  LoadCase,
  LoadCombinationDefinition,
} from '../analysis/types';
import {
  SolverInterface,
  translateModelToWorker,
  validateModel,
} from '../analysis';
import { findNodesInRect, findElementsInRect } from '../geometry/selectionUtils';

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface ModelState {
  // Geometry
  nodes: Node[];
  elements: Element[];
  nextNodeNumber: number;  // Counter for node naming (never decrements)
  nextElementNumber: number;  // Counter for element naming (never decrements)

  // Selection
  selectedNodes: string[];
  selectedElements: string[];
  selectedLoads: {
    nodal: number[];
    distributed: number[];
    elementPoint: number[];
  };

  // Loads
  loads: Loads;
  loadCases: LoadCase[];
  loadCombinations: LoadCombinationDefinition[];
  activeLoadCase: string | null;  // Currently viewing

  // Analysis
  solver: SolverInterface | null;
  isInitializingSolver: boolean;
  isAnalyzing: boolean;
  analysisResults: AnalysisResults | null;
  analysisError: string | null;

  // Actions - Geometry
  addNode: (node: Omit<Node, 'name'>) => void;
  updateNode: (name: string, updates: Partial<Omit<Node, 'name'>>) => void;
  deleteNode: (name: string) => void;
  clearNodes: () => void;

  addElement: (element: Omit<Element, 'name'>) => void;
  updateElement: (name: string, updates: Partial<Omit<Element, 'name'>>) => void;
  deleteElement: (name: string) => void;
  clearElements: () => void;

  // Actions - Selection
  selectNode: (name: string, additive: boolean) => void;
  selectElement: (name: string, additive: boolean) => void;
  selectNodesInRect: (rect: { x1: number; y1: number; x2: number; y2: number }, mode: 'window' | 'crossing') => void;
  selectElementsInRect: (rect: { x1: number; y1: number; x2: number; y2: number }, mode: 'window' | 'crossing') => void;
  selectLoad: (type: 'nodal' | 'distributed' | 'elementPoint', index: number, additive: boolean) => void;
  selectLoadsInRect: (rect: { x1: number; y1: number; x2: number; y2: number }, mode: 'window' | 'crossing') => void;
  clearSelection: () => void;
  clearLoadSelection: () => void;
  deleteSelectedLoads: () => void;

  // Actions - Movement
  moveNodes: (nodeNames: string[], dx: number, dy: number) => void;

  // Actions - Loads
  addNodalLoad: (load: Omit<NodalLoad, 'name'>) => void;
  updateNodalLoad: (index: number, updates: Partial<NodalLoad>) => void;
  deleteNodalLoad: (index: number) => void;

  addDistributedLoad: (load: Omit<DistributedLoad, 'name'>) => void;
  updateDistributedLoad: (index: number, updates: Partial<DistributedLoad>) => void;
  deleteDistributedLoad: (index: number) => void;

  addElementPointLoad: (load: Omit<ElementPointLoad, 'name'>) => void;
  updateElementPointLoad: (index: number, updates: Partial<ElementPointLoad>) => void;
  deleteElementPointLoad: (index: number) => void;

  clearLoads: () => void;

  // Actions - Load Cases
  addLoadCase: (loadCase: LoadCase) => void;
  deleteLoadCase: (name: string) => void;
  setActiveLoadCase: (name: string | null) => void;

  // Actions - Load Combinations
  addLoadCombination: (combination: LoadCombinationDefinition) => void;
  updateLoadCombination: (name: string, updates: Partial<LoadCombinationDefinition>) => void;
  deleteLoadCombination: (name: string) => void;

  // Actions - Analysis
  initializeSolver: () => Promise<void>;
  runAnalysis: (caseOrCombo?: string | LoadCombinationDefinition) => Promise<void>;
  clearAnalysis: () => void;

  // Actions - Model Management
  clearModel: () => void;
  loadExample: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
  nodes: [],
  elements: [],
  nextNodeNumber: 1,
  nextElementNumber: 1,
  selectedNodes: [],
  selectedElements: [],
  selectedLoads: {
    nodal: [],
    distributed: [],
    elementPoint: [],
  },
  loads: {
    nodal: [],
    distributed: [],
    elementPoint: [],
  },
  loadCases: [
    { name: 'Dead', description: 'Dead loads' },
    { name: 'Live', description: 'Live loads' },
  ],
  loadCombinations: [],
  activeLoadCase: 'Dead',
  solver: null,
  isInitializingSolver: false,
  isAnalyzing: false,
  analysisResults: null,
  analysisError: null,
};

// ============================================================================
// STORE
// ============================================================================

export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,

        // ====================================================================
        // GEOMETRY ACTIONS
        // ====================================================================

        addNode: (nodeData) => {
          set((state) => {
            const name = `N${state.nextNodeNumber}`;
            state.nodes.push({ name, ...nodeData });
            state.nextNodeNumber++;
          });
        },

        updateNode: (name, updates) => {
          set((state) => {
            const node = state.nodes.find((n) => n.name === name);
            if (node) {
              Object.assign(node, updates);
            }
          });
        },

        deleteNode: (name) => {
          set((state) => {
            // Remove node
            state.nodes = state.nodes.filter((n) => n.name !== name);

            // Remove connected elements
            state.elements = state.elements.filter(
              (e) => e.nodeI !== name && e.nodeJ !== name
            );

            // Remove loads on this node
            state.loads.nodal = state.loads.nodal.filter((l) => l.node !== name);
          });
        },

        clearNodes: () => {
          set((state) => {
            state.nodes = [];
            state.elements = [];
            state.loads.nodal = [];
          });
        },

        addElement: (elementData) => {
          set((state) => {
            const name = `E${state.nextElementNumber}`;
            state.elements.push({ name, ...elementData });
            state.nextElementNumber++;
          });
        },

        updateElement: (name, updates) => {
          set((state) => {
            const element = state.elements.find((e) => e.name === name);
            if (element) {
              Object.assign(element, updates);
            }
          });
        },

        deleteElement: (name) => {
          set((state) => {
            state.elements = state.elements.filter((e) => e.name !== name);

            // Remove loads on this element
            state.loads.distributed = state.loads.distributed.filter(
              (l) => l.element !== name
            );
            state.loads.elementPoint = state.loads.elementPoint.filter(
              (l) => l.element !== name
            );
          });
        },

        clearElements: () => {
          set((state) => {
            state.elements = [];
            state.loads.distributed = [];
            state.loads.elementPoint = [];
          });
        },

        // ====================================================================
        // SELECTION ACTIONS
        // ====================================================================

        selectNode: (name, additive) => {
          set((state) => {
            if (additive) {
              // Toggle: add if not selected, remove if selected
              if (state.selectedNodes.includes(name)) {
                state.selectedNodes = state.selectedNodes.filter((n) => n !== name);
              } else {
                state.selectedNodes.push(name);
              }
            } else {
              // Replace selection
              state.selectedNodes = [name];
              state.selectedElements = [];
            }
          });
        },

        selectElement: (name, additive) => {
          set((state) => {
            if (additive) {
              // Toggle: add if not selected, remove if selected
              if (state.selectedElements.includes(name)) {
                state.selectedElements = state.selectedElements.filter((e) => e !== name);
              } else {
                state.selectedElements.push(name);
              }
            } else {
              // Replace selection
              state.selectedElements = [name];
              state.selectedNodes = [];
            }
          });
        },

        selectNodesInRect: (rect) => {
          set((state) => {
            const nodeNames = findNodesInRect(state.nodes, rect);
            state.selectedNodes = nodeNames;
          });
        },

        selectElementsInRect: (rect, mode) => {
          set((state) => {
            const elementNames = findElementsInRect(state.nodes, state.elements, rect, mode);
            state.selectedElements = elementNames;
          });
        },

        clearSelection: () => {
          set((state) => {
            state.selectedNodes = [];
            state.selectedElements = [];
            state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };
          });
        },

        selectLoad: (type, index, additive) => {
          set((state) => {
            const selectedArray = state.selectedLoads[type];
            if (additive) {
              // Toggle: add if not selected, remove if selected
              if (selectedArray.includes(index)) {
                state.selectedLoads[type] = selectedArray.filter((i) => i !== index);
              } else {
                state.selectedLoads[type].push(index);
              }
            } else {
              // Replace selection (clear nodes/elements too)
              state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };
              state.selectedLoads[type] = [index];
              state.selectedNodes = [];
              state.selectedElements = [];
            }
          });
        },

        selectLoadsInRect: () => {
          // Simplified: just clear for now, can implement full rect selection later
          set((state) => {
            state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };
          });
        },

        clearLoadSelection: () => {
          set((state) => {
            state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };
          });
        },

        deleteSelectedLoads: () => {
          set((state) => {
            // Delete in reverse order to maintain indices
            state.selectedLoads.nodal
              .sort((a, b) => b - a)
              .forEach((index) => {
                state.loads.nodal.splice(index, 1);
              });
            state.selectedLoads.distributed
              .sort((a, b) => b - a)
              .forEach((index) => {
                state.loads.distributed.splice(index, 1);
              });
            state.selectedLoads.elementPoint
              .sort((a, b) => b - a)
              .forEach((index) => {
                state.loads.elementPoint.splice(index, 1);
              });
            state.selectedLoads = { nodal: [], distributed: [], elementPoint: [] };
          });
        },

        // ====================================================================
        // MOVEMENT ACTIONS
        // ====================================================================

        moveNodes: (nodeNames, dx, dy) => {
          set((state) => {
            for (const name of nodeNames) {
              const node = state.nodes.find((n) => n.name === name);
              if (node) {
                node.x += dx;
                node.y += dy;
              }
            }
          });
        },

        // ====================================================================
        // LOAD ACTIONS
        // ====================================================================

        addNodalLoad: (loadData) => {
          set((state) => {
            state.loads.nodal.push(loadData);
          });
        },

        updateNodalLoad: (index, updates) => {
          set((state) => {
            const load = state.loads.nodal[index];
            if (load) {
              Object.assign(load, updates);
            }
          });
        },

        deleteNodalLoad: (index) => {
          set((state) => {
            state.loads.nodal.splice(index, 1);
          });
        },

        addDistributedLoad: (loadData) => {
          set((state) => {
            state.loads.distributed.push(loadData);
          });
        },

        updateDistributedLoad: (index, updates) => {
          set((state) => {
            const load = state.loads.distributed[index];
            if (load) {
              Object.assign(load, updates);
            }
          });
        },

        deleteDistributedLoad: (index) => {
          set((state) => {
            state.loads.distributed.splice(index, 1);
          });
        },

        addElementPointLoad: (loadData) => {
          set((state) => {
            state.loads.elementPoint.push(loadData);
          });
        },

        updateElementPointLoad: (index, updates) => {
          set((state) => {
            const load = state.loads.elementPoint[index];
            if (load) {
              Object.assign(load, updates);
            }
          });
        },

        deleteElementPointLoad: (index) => {
          set((state) => {
            state.loads.elementPoint.splice(index, 1);
          });
        },

        clearLoads: () => {
          set((state) => {
            state.loads = {
              nodal: [],
              distributed: [],
              elementPoint: [],
            };
          });
        },

        // ====================================================================
        // LOAD CASE ACTIONS
        // ====================================================================

        addLoadCase: (loadCase) => {
          set((state) => {
            state.loadCases.push(loadCase);
          });
        },

        deleteLoadCase: (name) => {
          set((state) => {
            state.loadCases = state.loadCases.filter((lc) => lc.name !== name);

            // Remove loads with this case
            state.loads.nodal = state.loads.nodal.filter((l) => l.case !== name);
            state.loads.distributed = state.loads.distributed.filter(
              (l) => l.case !== name
            );
            state.loads.elementPoint = state.loads.elementPoint.filter(
              (l) => l.case !== name
            );

            // Update active case if deleted
            if (state.activeLoadCase === name) {
              state.activeLoadCase = state.loadCases[0]?.name || null;
            }
          });
        },

        setActiveLoadCase: (name) => {
          set({ activeLoadCase: name });
        },

        // ====================================================================
        // LOAD COMBINATION ACTIONS
        // ====================================================================

        addLoadCombination: (combination) => {
          set((state) => {
            state.loadCombinations.push(combination);
          });
        },

        updateLoadCombination: (name, updates) => {
          set((state) => {
            const combo = state.loadCombinations.find((c) => c.name === name);
            if (combo) {
              Object.assign(combo, updates);
            }
          });
        },

        deleteLoadCombination: (name) => {
          set((state) => {
            state.loadCombinations = state.loadCombinations.filter(
              (c) => c.name !== name
            );
          });
        },

        // ====================================================================
        // ANALYSIS ACTIONS
        // ====================================================================

        initializeSolver: async () => {
          const state = get();

          // Already initialized or initializing
          if (state.solver?.initialized || state.isInitializingSolver) {
            return;
          }

          set({ isInitializingSolver: true, analysisError: null });

          try {
            const solver = new SolverInterface();
            await solver.initialize();

            set({ solver, isInitializingSolver: false });
            console.log('[ModelStore] Solver initialized successfully');
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to initialize solver';

            set({
              isInitializingSolver: false,
              analysisError: errorMessage,
              solver: null,
            });

            console.error('[ModelStore] Solver initialization failed:', error);
            throw error;
          }
        },

        runAnalysis: async (caseOrCombo) => {
          const state = get();

          // Ensure solver is initialized
          if (!state.solver) {
            throw new Error('Solver not initialized. Call initializeSolver() first.');
          }

          set({ isAnalyzing: true, analysisError: null });

          try {
            // Prepare model data
            const modelData = translateModelToWorker(
              state.nodes,
              state.elements,
              state.loads
            );

            // Validate before sending
            const errors = validateModel(modelData);
            if (errors.length > 0) {
              throw new Error(`Model validation failed:\n${errors.join('\n')}`);
            }

            // Determine analysis type
            let analysisType: 'simple' | 'loadCase' | 'combination' = 'simple';
            let targetName: string | LoadCombinationDefinition | undefined;

            if (caseOrCombo) {
              if (typeof caseOrCombo === 'string') {
                analysisType = 'loadCase';
                targetName = caseOrCombo;
              } else {
                analysisType = 'combination';
                targetName = caseOrCombo;
              }
            }

            // Run analysis
            const results = await state.solver.runAnalysis(
              modelData,
              analysisType,
              targetName
            );

            set({
              analysisResults: results,
              isAnalyzing: false,
              analysisError: null,
            });

            console.log('[ModelStore] Analysis complete:', results);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Analysis failed';

            set({
              isAnalyzing: false,
              analysisError: errorMessage,
              analysisResults: null,
            });

            console.error('[ModelStore] Analysis failed:', error);
            throw error;
          }
        },

        clearAnalysis: () => {
          set({
            analysisResults: null,
            analysisError: null,
          });
        },

        // ====================================================================
        // MODEL MANAGEMENT
        // ====================================================================

        clearModel: () => {
          set({
            ...initialState,
            solver: get().solver,  // Keep solver instance
          });
        },

        loadExample: () => {
          set((state) => {
            // Simple cantilever beam example
            state.nodes = [
              { name: 'N1', x: 0, y: 0, support: 'fixed' },
              { name: 'N2', x: 4, y: 0, support: 'free' },
            ];
            state.nextNodeNumber = 3;  // Next node will be N3

            state.elements = [
              {
                name: 'E1',
                nodeI: 'N1',
                nodeJ: 'N2',
                E: 210,      // GPa
                I: 1e-4,     // m⁴
                A: 1e-3,     // m²
              },
            ];
            state.nextElementNumber = 2;  // Next element will be E2

            state.loads = {
              nodal: [
                {
                  node: 'N2',
                  fx: 0,
                  fy: -10,   // kN downward
                  mz: 0,
                  case: 'Dead',
                },
              ],
              distributed: [],
              elementPoint: [],
            };

            state.activeLoadCase = 'Dead';
            state.analysisResults = null;
            state.analysisError = null;
          });
        },
      })),
      {
        name: '2dfea-model-storage',
        partialize: (state) => ({
          // Only persist model data, not analysis state
          nodes: state.nodes,
          elements: state.elements,
          loads: state.loads,
          loadCases: state.loadCases,
          loadCombinations: state.loadCombinations,
          activeLoadCase: state.activeLoadCase,
        }),
      }
    ),
    { name: 'ModelStore' }
  )
);
