/**
 * Analysis Module - Type-safe interface to PyNite solver
 *
 * Usage:
 *   import { SolverInterface, translateModelToWorker, parseAnalysisResults } from './analysis';
 *
 *   const solver = new SolverInterface();
 *   await solver.initialize();
 *
 *   const workerData = translateModelToWorker(nodes, elements, loads);
 *   const results = await solver.runAnalysis(workerData);
 *   const parsed = parseAnalysisResults(results);
 */

// Core interfaces
export type {
  Node,
  Element,
  Loads,
  NodalLoad,
  DistributedLoad,
  ElementPointLoad,
  ModelData,
  NodeResult,
  ElementResult,
  DiagramData,
  AnalysisResults,
  AnalysisType,
  LoadCombination,
  LoadCase,
  LoadCombinationDefinition,
  AnalysisState,
  SupportType,
  WorkerMessage,
  WorkerError,
} from './types';

// Solver interface
export { SolverInterface, getSolverInstance, resetSolverInstance } from './solverInterface';

// Data translation
export {
  translateModelToWorker,
  filterLoadsByCase,
  validateModel,
  getLoadCaseNames,
  countLoads,
  getSupportLabel,
  SupportTypeLabels,
} from './dataTranslator';

// Result parsing
export {
  parseAnalysisResults,
  getMaxDisplacement,
  getMaxRotation,
  getMaxMoment,
  getMaxShear,
  getMaxAxial,
  getTotalReactions,
  getSupportNodes,
  createResultSummary,
  formatValue,
} from './resultParser';

export type { ResultSummary } from './resultParser';
