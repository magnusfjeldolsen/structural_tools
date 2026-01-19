// @ts-nocheck
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
  ResultsCache,
} from '../analysis/types';
import {
  SolverInterface,
  translateModelToWorker,
  validateModel,
} from '../analysis';
import { findNodesInRect, findElementsInRect } from '../geometry/selectionUtils';
import { renumberNodes, renumberElements, getNextNodeNumber, getNextElementNumber } from '../utils/renumberingUtils';

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface ModelState {
  // Geometry
  nodes: Node[];
  elements: Element[];
  nextNodeNumber: number;  // Counter for node naming (never decrements)
  nextElementNumber: number;  // Counter for element naming (never decrements)

  // Load ID counters (never decrement)
  nextNodalLoadNumber: number;        // Counter for nodal load IDs (e.g., "NL1", "NL2")
  nextPointLoadNumber: number;        // Counter for point load IDs (e.g., "PL1", "PL2")
  nextDistributedLoadNumber: number;  // Counter for distributed load IDs (e.g., "DL1", "DL2")
  nextLineLoadNumber: number;         // Counter for line load IDs (e.g., "LL1", "LL2")

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
  activeLoadCase: string | null;  // Active case for load creation
  activeResultView: {
    type: 'case' | 'combination';
    name: string | null;
  };  // Currently displayed results (can differ from activeLoadCase)

  // Analysis
  solver: SolverInterface | null;
  isInitializingSolver: boolean;
  isAnalyzing: boolean;
  analysisResults: AnalysisResults | null;
  analysisError: string | null;
  resultsCache: ResultsCache;  // Multi-result storage indexed by case/combo name

  // Actions - Geometry
  addNode: (node: Omit<Node, 'name'>) => void;
  updateNode: (name: string, updates: Partial<Omit<Node, 'name'>>) => void;
  deleteNode: (name: string) => void;
  clearNodes: () => void;
  renumberNodes: () => void;

  addElement: (element: Omit<Element, 'name'>) => void;
  updateElement: (name: string, updates: Partial<Omit<Element, 'name'>>) => void;
  deleteElement: (name: string) => void;
  clearElements: () => void;
  renumberElements: () => void;

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
  addNodalLoad: (load: Omit<NodalLoad, 'id'>) => void;
  updateNodalLoad: (index: number, updates: Partial<NodalLoad>) => void;
  deleteNodalLoad: (index: number) => void;

  addDistributedLoad: (load: Omit<DistributedLoad, 'id'>) => void;
  updateDistributedLoad: (index: number, updates: Partial<DistributedLoad>) => void;
  deleteDistributedLoad: (index: number) => void;

  addElementPointLoad: (load: Omit<ElementPointLoad, 'id'>) => void;
  updateElementPointLoad: (index: number, updates: Partial<ElementPointLoad>) => void;
  deleteElementPointLoad: (index: number) => void;

  // Paste load properties from copied data
  pasteLoadProperties: (
    targetType: 'nodal' | 'distributed' | 'elementPoint',
    targetIndex: number,
    properties: any
  ) => void;

  clearLoads: () => void;

  // Actions - Load Cases
  addLoadCase: (loadCase: LoadCase) => void;
  deleteLoadCase: (name: string) => void;
  setActiveLoadCase: (name: string | null) => void;
  setActiveResultView: (type: 'case' | 'combination', name: string | null) => void;

  // Actions - Load Combinations
  addLoadCombination: (combination: LoadCombinationDefinition) => void;
  updateLoadCombination: (name: string, updates: Partial<LoadCombinationDefinition>) => void;
  deleteLoadCombination: (name: string) => void;

  // Actions - Analysis
  initializeSolver: () => Promise<void>;
  runAnalysis: (caseOrCombo?: string | LoadCombinationDefinition) => Promise<void>;
  runFullAnalysis: () => Promise<void>;  // Run analysis for all cases and combinations
  getResultsForCase: (caseName: string) => AnalysisResults | null;
  getResultsForCombination: (comboName: string) => AnalysisResults | null;
  getActiveResults: () => AnalysisResults | null;  // Get currently selected results
  clearAnalysis: () => void;
  clearAnalysisCache: () => void;

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
  nextNodalLoadNumber: 1,
  nextPointLoadNumber: 1,
  nextDistributedLoadNumber: 1,
  nextLineLoadNumber: 1,
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
  activeResultView: {
    type: 'case',
    name: 'Dead',
  },
  solver: null,
  isInitializingSolver: false,
  isAnalyzing: false,
  analysisResults: null,
  analysisError: null,
  resultsCache: {
    caseResults: {},
    combinationResults: {},
    lastUpdated: 0,
    analysisStatus: {
      totalCases: 0,
      totalCombinations: 0,
      successfulCases: 0,
      successfulCombinations: 0,
      failedCases: [],
      failedCombinations: [],
    },
  },
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

              // Clear analysis cache if structural properties (E, I, A) are changed
              // This invalidates results and clears all diagrams until user re-runs analysis
              if ('E' in updates || 'I' in updates || 'A' in updates) {
                console.log(`[ModelStore] Element ${name} properties updated (E/I/A) - invalidating analysis cache`);
                state.analysisResults = null;
                state.analysisError = null;
                state.resultsCache = {
                  caseResults: {},
                  combinationResults: {},
                  lastUpdated: 0,
                  analysisStatus: {
                    totalCases: 0,
                    totalCombinations: 0,
                    successfulCases: 0,
                    successfulCombinations: 0,
                    failedCases: [],
                    failedCombinations: [],
                  },
                };
              }
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

        renumberNodes: () => {
          set((state) => {
            const result = renumberNodes(state.nodes, state.elements);

            // Create mapping for loads
            const nameMapping = new Map(result.mapping.map((m: any) => [m.oldName, m.newName]));

            // Update nodes
            state.nodes = result.updatedNodes;

            // Update elements
            state.elements = result.updatedElements;

            // Update loads to reference new node names
            state.loads.nodal = state.loads.nodal.map((load) => ({
              ...load,
              node: nameMapping.get(load.node) ?? load.node,
            }));

            // Update next node number to continue from highest existing
            state.nextNodeNumber = getNextNodeNumber(state.nodes);

            // Clear selection
            state.selectedNodes = [];
            state.selectedElements = [];
          });
        },

        renumberElements: () => {
          set((state) => {
            const result = renumberElements(state.elements, state.nodes);

            // Create mapping for loads
            const nameMapping = new Map(result.mapping.map((m: any) => [m.oldName, m.newName]));

            // Update elements
            state.elements = result.updatedElements;

            // Update loads to reference new element names
            state.loads.distributed = state.loads.distributed.map((load) => ({
              ...load,
              element: nameMapping.get(load.element) ?? load.element,
            }));

            state.loads.elementPoint = state.loads.elementPoint.map((load) => ({
              ...load,
              element: nameMapping.get(load.element) ?? load.element,
            }));

            // Update next element number to continue from highest existing
            state.nextElementNumber = getNextElementNumber(state.elements);

            // Clear selection
            state.selectedNodes = [];
            state.selectedElements = [];
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
            const id = `NL${state.nextNodalLoadNumber}`;
            state.loads.nodal.push({ ...loadData, id });
            state.nextNodalLoadNumber++;
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
            const id = `DL${state.nextDistributedLoadNumber}`;
            state.loads.distributed.push({ ...loadData, id });
            state.nextDistributedLoadNumber++;
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
            const id = `PL${state.nextPointLoadNumber}`;
            state.loads.elementPoint.push({ ...loadData, id });
            state.nextPointLoadNumber++;
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

        pasteLoadProperties: (targetType, targetIndex, properties) => {
          set((state) => {
            if (targetType === 'nodal') {
              const targetLoad = state.loads.nodal[targetIndex];
              if (targetLoad) {
                // Paste nodal load properties: fx, fy, mz (keep node and case)
                targetLoad.fx = properties.fx ?? targetLoad.fx;
                targetLoad.fy = properties.fy ?? targetLoad.fy;
                targetLoad.mz = properties.mz ?? targetLoad.mz;
              }
            } else if (targetType === 'elementPoint') {
              const targetLoad = state.loads.elementPoint[targetIndex];
              if (targetLoad) {
                // Paste element point load properties: direction, magnitude (keep element and distance)
                targetLoad.direction = properties.direction ?? targetLoad.direction;
                targetLoad.magnitude = properties.magnitude ?? targetLoad.magnitude;
              }
            } else if (targetType === 'distributed') {
              const targetLoad = state.loads.distributed[targetIndex];
              if (targetLoad) {
                // Paste distributed load properties: direction, w1, w2 (keep element and positions)
                targetLoad.direction = properties.direction ?? targetLoad.direction;
                targetLoad.w1 = properties.w1 ?? targetLoad.w1;
                targetLoad.w2 = properties.w2 ?? targetLoad.w2;
              }
            }
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
          set((state: ModelState) => {
            state.activeLoadCase = name;
            // Auto-sync result view to match active case (if currently viewing a case)
            if (state.activeResultView.type === 'case') {
              state.activeResultView.name = name;
            }
          });
        },

        setActiveResultView: (type, name) => {
          set((state: ModelState) => {
            state.activeResultView = { type, name };
          });
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
        // FULL ANALYSIS - RUN ALL CASES & COMBINATIONS
        // ====================================================================

        runFullAnalysis: async () => {
          const state = get();

          // Ensure solver is initialized
          if (!state.solver) {
            throw new Error('Solver not initialized. Call initializeSolver() first.');
          }

          set({ isAnalyzing: true, analysisError: null });

          const resultsCache: ResultsCache = {
            caseResults: {},
            combinationResults: {},
            lastUpdated: Date.now(),
            analysisStatus: {
              totalCases: state.loadCases.length,
              totalCombinations: state.loadCombinations.length,
              successfulCases: 0,
              successfulCombinations: 0,
              failedCases: [],
              failedCombinations: [],
            },
          };

          try {
            // Prepare model data once
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

            // Run analysis for each load case
            console.log('[FullAnalysis] Starting analysis for', state.loadCases.length, 'load cases...');
            for (const loadCase of state.loadCases) {
              try {
                const caseResults = await state.solver.runAnalysis(
                  modelData,
                  'loadCase',
                  loadCase.name
                );
                resultsCache.caseResults[loadCase.name] = caseResults;
                resultsCache.analysisStatus.successfulCases++;
                console.log(`[FullAnalysis] ✓ Analyzed load case: ${loadCase.name}`);
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                resultsCache.analysisStatus.failedCases.push({
                  name: loadCase.name,
                  error: errorMsg,
                });
                console.warn(`[FullAnalysis] ✗ Failed to analyze load case "${loadCase.name}":`, errorMsg);
              }
            }

            // Run analysis for each load combination
            console.log('[FullAnalysis] Starting analysis for', state.loadCombinations.length, 'load combinations...');
            for (const combination of state.loadCombinations) {
              try {
                const comboResults = await state.solver.runAnalysis(
                  modelData,
                  'combination',
                  combination
                );
                resultsCache.combinationResults[combination.name] = comboResults;
                resultsCache.analysisStatus.successfulCombinations++;
                console.log(`[FullAnalysis] ✓ Analyzed combination: ${combination.name}`);
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                resultsCache.analysisStatus.failedCombinations.push({
                  name: combination.name,
                  error: errorMsg,
                });
                console.warn(`[FullAnalysis] ✗ Failed to analyze combination "${combination.name}":`, errorMsg);
              }
            }

            // Store results cache
            set({
              resultsCache,
              isAnalyzing: false,
              analysisError: null,
            });

            // Log summary
            const totalSuccessful = resultsCache.analysisStatus.successfulCases +
                                   resultsCache.analysisStatus.successfulCombinations;
            const totalFailed = resultsCache.analysisStatus.failedCases.length +
                               resultsCache.analysisStatus.failedCombinations.length;
            console.log('[FullAnalysis] Complete:', {
              successful: totalSuccessful,
              failed: totalFailed,
              cases: `${resultsCache.analysisStatus.successfulCases}/${resultsCache.analysisStatus.totalCases}`,
              combinations: `${resultsCache.analysisStatus.successfulCombinations}/${resultsCache.analysisStatus.totalCombinations}`,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Full analysis failed';

            set({
              isAnalyzing: false,
              analysisError: errorMessage,
            });

            console.error('[FullAnalysis] Failed:', error);
            throw error;
          }
        },

        // ====================================================================
        // RESULTS QUERY FUNCTIONS
        // ====================================================================

        getResultsForCase: (caseName: string) => {
          const caseResults = get().resultsCache.caseResults[caseName];
          if (!caseResults) {
            return null;
          }
          return caseResults;
        },

        getResultsForCombination: (comboName: string) => {
          const comboResults = get().resultsCache.combinationResults[comboName];
          if (!comboResults) {
            return null;
          }
          return comboResults;
        },

        getActiveResults: () => {
          // This will be called by UI components that manage selectedResultType and selectedResultName
          // For now, return the current analysisResults for backward compatibility
          // TODO: Integrate with UI store to get selectedResultType and selectedResultName
          return get().analysisResults;
        },

        clearAnalysisCache: () => {
          set({
            resultsCache: {
              caseResults: {},
              combinationResults: {},
              lastUpdated: 0,
              analysisStatus: {
                totalCases: 0,
                totalCombinations: 0,
                successfulCases: 0,
                successfulCombinations: 0,
                failedCases: [],
                failedCombinations: [],
              },
            },
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
          activeResultView: state.activeResultView,
        }),
      }
    ),
    { name: 'ModelStore' }
  )
);
