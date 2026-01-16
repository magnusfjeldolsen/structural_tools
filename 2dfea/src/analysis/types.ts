/**
 * Analysis Type Definitions
 *
 * UNIT POLICY (see ../UNIT_CONVERSIONS.md):
 * - Input to backend: m, kN, kNm, GPa
 * - Output from backend: mm, kN, kNm, rad (engineering units)
 * - Frontend displays these values directly - NO conversion needed
 */

// ============================================================================
// GEOMETRY & MODEL
// ============================================================================

export type SupportType = 'fixed' | 'pinned' | 'roller-x' | 'roller-y' | 'free';

export interface Node {
  name: string;
  x: number;      // m
  y: number;      // m
  support: SupportType;
}

export interface Element {
  name: string;
  nodeI: string;  // Start node name
  nodeJ: string;  // End node name
  E: number;      // GPa (Young's modulus)
  I: number;      // m⁴ (Moment of inertia)
  A: number;      // m² (Cross-section area)
}

// ============================================================================
// LOADS
// ============================================================================

export interface NodalLoad {
  id: string;         // Unique load ID (e.g., "NL1", "NL2")
  node: string;
  fx: number;     // kN
  fy: number;     // kN
  mz: number;     // kNm
  case?: string;  // Optional load case name
}

export interface DistributedLoad {
  id: string;         // Unique load ID (e.g., "DL1", "DL2")
  element: string;
  direction: 'Fx' | 'Fy' | 'FX' | 'FY';  // Local (Fx, Fy) or Global (FX, FY) coordinate system
  w1: number;     // kN/m (start)
  w2: number;     // kN/m (end)
  x1: number;     // m (start position)
  x2: number;     // m (end position)
  case?: string;
}

export interface ElementPointLoad {
  id: string;         // Unique load ID (e.g., "PL1", "PL2")
  element: string;
  distance: number;   // m (from element start)
  direction: 'Fx' | 'Fy' | 'Mz' | 'FX' | 'FY' | 'MZ';  // Local (fx, fy, mz) or Global (FX, FY, MZ)
  magnitude: number;  // kN or kNm
  case?: string;
}

export interface Loads {
  nodal: NodalLoad[];
  distributed: DistributedLoad[];
  elementPoint: ElementPointLoad[];
}

// ============================================================================
// MODEL DATA (sent to worker)
// ============================================================================

export interface ModelData {
  nodes: Node[];
  elements: Element[];
  loads: Loads;
}

// ============================================================================
// ANALYSIS RESULTS (returned from worker)
// ============================================================================

export interface NodeResult {
  // Displacements (already in mm)
  DX: number;   // mm
  DY: number;   // mm
  DZ: number;   // mm

  // Rotations (already in rad)
  RX: number;   // rad
  RY: number;   // rad
  RZ: number;   // rad

  // Reactions (already in kN, kNm)
  reactions: {
    FX: number;  // kN
    FY: number;  // kN
    MZ: number;  // kNm
  };
}

export interface ElementResult {
  max_moment: number;      // kNm
  max_shear: number;       // kN
  max_axial: number;       // kN
  max_deflection: number;  // mm
  axial_force: number;     // kN
  length: number;          // m
  i_node: string;
  j_node: string;
}

export interface DiagramData {
  x_coordinates: number[];  // m
  moments: number[];        // kNm
  shears: number[];         // kN
  axials: number[];         // kN
  deflections_dx: number[]; // mm - local axial deflection
  deflections_dy: number[]; // mm - local perpendicular deflection
  length: number;           // m
}

export interface AnalysisResults {
  success: boolean;
  message: string;
  nodes: Record<string, NodeResult>;
  elements: Record<string, ElementResult>;
  diagrams: Record<string, DiagramData>;
  caseName?: string;           // If single load case
  combinationName?: string;    // If combination
}

// ============================================================================
// WORKER COMMUNICATION
// ============================================================================

export type AnalysisType = 'simple' | 'loadCase' | 'combination';

export interface AnalysisRequest {
  modelData: ModelData;
  analysisType: AnalysisType;
  targetName?: string | LoadCombination;  // Case name or combination object
}

export interface LoadCombination {
  name: string;
  factors: Record<string, number>;  // { 'Dead': 1.35, 'Live': 1.5 }
}

// Worker message types
export type WorkerMessageType = 'init' | 'analyze' | 'ping' | 'ready' | 'results' | 'error' | 'pong';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  msgId?: string;
}

export interface WorkerError {
  message: string;
  stack?: string;
  phase?: 'initialization' | 'analysis';
}

// ============================================================================
// LOAD CASES & COMBINATIONS
// ============================================================================

export interface LoadCase {
  name: string;
  description?: string;
}

export interface LoadCombinationDefinition {
  name: string;
  description?: string;
  factors: Record<string, number>;
}

// ============================================================================
// RESULTS CACHING & QUERYING
// ============================================================================

export interface AnalysisStatus {
  totalCases: number;
  totalCombinations: number;
  successfulCases: number;
  successfulCombinations: number;
  failedCases: Array<{ name: string; error: string }>;
  failedCombinations: Array<{ name: string; error: string }>;
}

export interface ResultsCache {
  // Indexed results by case/combination name for O(1) retrieval
  caseResults: Record<string, AnalysisResults>;
  combinationResults: Record<string, AnalysisResults>;

  // Metadata about the analysis run
  lastUpdated: number;  // Unix timestamp

  // Status tracking from last full analysis run
  analysisStatus: AnalysisStatus;
}

// ============================================================================
// UI STATE
// ============================================================================

export interface AnalysisState {
  isInitializing: boolean;
  isAnalyzing: boolean;
  results: AnalysisResults | null;
  error: string | null;
  activeCase: string | null;  // Currently viewing results for this case/combo
}
