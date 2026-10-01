/**
 * Solver contract. Deterministic, no UI imports, identical results in the
 * browser (Web Worker) and Node (CLI, MCP server) because it is the same code.
 *
 * `createRun(input)` returns a stepper so a worker can post progress and
 * snapshots between steps and cancel at any time; `runToEnd` is the
 * convenience wrapper used by tests, the CLI and the MCP server.
 */
import type { Analysis, BoundaryCondition, Vec2 } from '../model/types.js';
import type { Mesh } from '../mesh/types.js';

/** Compiled material: θ in °C → SI properties. `enthalpy` is ∫₀^θ ρ(θ')cp(θ') dθ' in J/m³. */
export interface MaterialEvaluator {
  lambda(theta: number): number;
  rhoCp(theta: number): number;
  enthalpy(theta: number): number;
  emissivity: number;
  /** Valid range in °C, for out-of-range warnings. */
  validRange: [number, number];
  name: string;
  /** True when λ, ρ and cp do not depend on θ (lets the solver assemble and factorise once). Optional; default false. */
  isConstant?: boolean;
}

export interface SeriesEvaluator {
  at(t: number): number;
  name: string;
}

export interface SolveHeatSource {
  regionId: string;
  /** W/m³, constant or a function of time. */
  q: number | SeriesEvaluator;
}

export interface SolveProbe {
  id: string;
  position: Vec2;
}

export interface SolveInput {
  mesh: Mesh;
  /** Compiled material per region id in mesh.regions. */
  materials: Record<string, MaterialEvaluator>;
  boundaryConditions: BoundaryCondition[];
  /** Series evaluators by time-series id. */
  series: Record<string, SeriesEvaluator>;
  heatSources: SolveHeatSource[];
  analysis: Analysis;
  probes: SolveProbe[];
  ambientTemperature: number;
  /** Optional initial nodal field (e.g. continue from a previous run). Length = node count. */
  initialField?: Float64Array;
}

export interface Snapshot {
  t: number;
  theta: Float32Array;
}

export interface RunStats {
  steps: number;
  rejectedSteps: number;
  newtonIterations: number;
  wallTimeMs: number;
  linearSolver: string;
  nodeCount: number;
  elementCount: number;
  /** Periodic mode: cycles run until convergence. */
  cycles?: number;
}

export interface EnergyBalance {
  /** Change in stored enthalpy over the run, J per metre depth. */
  storedChange: number;
  /** Net heat entering through boundaries, J/m. */
  boundaryIn: number;
  /** Heat from volumetric sources, J/m. */
  sourceIn: number;
  /** |stored − boundary − source| / max(|stored|, |boundary|, tiny). */
  relativeImbalance: number;
}

export interface RunResult {
  analysisId: string;
  scenarioId: string | null;
  mode: Analysis['mode'];
  mesh: Mesh;
  /** Snapshot times (s) and full nodal fields at those times. Steady mode: one snapshot at t = 0. */
  times: number[];
  fields: Float32Array[];
  probes: { id: string; position: Vec2; found: boolean; element: number }[];
  /** Probe histories at every accepted step. */
  probeTimes: Float64Array;
  /** One Float64Array per probe (same order as `probes`). */
  probeValues: Float64Array[];
  energy: EnergyBalance;
  stats: RunStats;
  warnings: string[];
  /** Filled by the caller (project hash, core version) for reproducibility stamps. */
  stamp?: { projectHash: string; coreVersion: string; createdAt: string };
}

export interface RunProgress {
  t: number;
  fraction: number;
  step: number;
  message?: string;
}

export interface Run {
  readonly t: number;
  readonly done: boolean;
  readonly theta: Float64Array;
  readonly progress: RunProgress;
  /** Advance one accepted time step (steady: one Newton solve; periodic: one step of the current cycle). Returns false when finished. */
  step(): boolean;
  /** Build the result from what has been computed so far (also valid after cancel). */
  result(): RunResult;
}

export interface RunOptions {
  onProgress?: (p: RunProgress) => void;
  onSnapshot?: (s: Snapshot) => void;
  shouldCancel?: () => boolean;
}
