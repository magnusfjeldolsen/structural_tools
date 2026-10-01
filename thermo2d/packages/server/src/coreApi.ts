/**
 * Typed adapter to the @thermo2d/core functions the server uses.
 *
 * The signatures below are the contract the server was written against (see the
 * lead's brief). They are bound at runtime so this package type-checks while the
 * core is still landing; a missing export throws a clear error at call time. When
 * a core signature differs, fix it HERE, not in the tools.
 */
import * as core from '@thermo2d/core';
import type {
  Analysis,
  BoundaryCondition,
  Command,
  CommandResult,
  Issue,
  LibraryItem,
  Material,
  MaterialEvaluator,
  Mesh,
  MeshInput,
  Metric,
  Polygon,
  Project,
  RunResult,
  SeriesEvaluator,
  SolveInput,
  TimeSeries,
  Vec2,
  EdgeRef,
} from '@thermo2d/core';

type AnyFn = (...args: any[]) => any;

function bind<T extends AnyFn>(name: string): T {
  const f = (core as unknown as Record<string, unknown>)[name];
  if (typeof f === 'function') return f as T;
  return ((..._args: unknown[]) => {
    throw new Error(`Core function "${name}" is not available in this build of @thermo2d/core.`);
  }) as unknown as T;
}

function value<T>(name: string, fallback: T): T {
  const v = (core as unknown as Record<string, unknown>)[name];
  return (v === undefined ? fallback : v) as T;
}

export interface TemplateParamDef {
  key: string;
  label: string;
  labelNb?: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
  unit?: string;
  kind?: 'number' | 'select' | 'boolean';
  options?: (string | number)[];
}

export interface TemplateDef {
  id: string;
  name: string;
  nameNb?: string;
  params: TemplateParamDef[];
  build(params: Record<string, number | string | boolean>): { regions: { name: string; polygon: Polygon; materialHint?: string }[] };
}

export interface ImportReport {
  series?: [number, number][];
  points?: [number, number][];
  columns?: string[];
  separator?: string;
  decimal?: string;
  timeUnit?: string;
  valueUnit?: string;
  range?: [number, number];
  step?: number | null;
  gaps?: [number, number][];
  warnings: string[];
  rows?: number;
}

export interface RebarRowCore {
  rebarId: string;
  name: string;
  x: number;
  y: number;
  diameter: number;
  temps: number[];
  ks: (number | null)[];
}

export interface MetricResultCore {
  metricId: string;
  name: string;
  kind: string;
  value: number | null;
  unit?: string;
  time?: number;
  details?: string;
}

export interface PrepareRunResult {
  meshInput: MeshInput;
  buildSolveInput(mesh: Mesh): SolveInput;
}

// Commands / project
export const applyCommands = bind<(project: Project, commands: Command[]) => CommandResult>('applyCommands');
export const validateProject = bind<(project: Project) => Issue[]>('validateProject');
export const resolveScenario = bind<(project: Project, scenarioId: string | null) => Project>('resolveScenario');
export const describeCommands = bind<() => { type: string; description: string; fields: Record<string, string> }[]>('describeCommands');
export const parseProject = bind<(json: unknown) => Project>('parseProject');
export const serializeProject = bind<(project: Project) => string>('serializeProject');
export const projectHash = bind<(project: Project) => string>('projectHash');
export const encodeResults = bind<(result: RunResult) => Uint8Array>('encodeResults');
export const decodeResults = bind<(bytes: Uint8Array) => RunResult>('decodeResults');
export const prepareRun = bind<(project: Project, analysisId: string, scenarioId?: string | null) => PrepareRunResult>('prepareRun');
export const runProject = bind<(project: Project, opts: { analysisId?: string; scenarioId?: string | null; onProgress?: (p: core.RunProgress) => void; shouldCancel?: () => boolean }) => RunResult>('runProject');
export const createEmptyProject = core.createEmptyProject;
export const CORE_VERSION: string = value('CORE_VERSION', '0.0.0');

// Mesh and solver
export const mesh = bind<(input: MeshInput) => Mesh>('mesh');
export const buildMeshInput = bind<(project: Project) => MeshInput>('buildMeshInput');
export const createRun = bind<(input: SolveInput) => core.Run>('createRun');
export const compileSeries = bind<(series: TimeSeries, ambient: number) => SeriesEvaluator>('compileSeries');
export const compileMaterial = bind<(m: Material) => MaterialEvaluator>('compileMaterial');

// Library
export const BUILTIN_LIBRARY: LibraryItem[] = value('BUILTIN_LIBRARY', []);
export const searchLibrary = bind<(query: { text?: string; category?: string; tags?: string[]; lambdaRange?: [number, number]; densityRange?: [number, number]; materialCategory?: string }, items?: LibraryItem[]) => LibraryItem[]>('searchLibrary');
export const getLibraryItem = bind<(id: string, items?: LibraryItem[]) => LibraryItem | undefined>('getLibraryItem');
export const materialFromLibrary = bind<(item: LibraryItem, id?: string) => Material>('materialFromLibrary');
export const seriesFromLibrary = bind<(item: LibraryItem, params?: Record<string, number | string>, duration?: number) => TimeSeries>('seriesFromLibrary');
export const generateCurve = bind<(generator: string, params: Record<string, number | string>, duration?: number) => [number, number][]>('generateCurve');
export const parseTimeSeriesText = bind<(text: string, opts?: Record<string, unknown>) => ImportReport>('parseTimeSeriesText');
export const parseEpw = bind<(text: string) => ImportReport>('parseEpw');
export const parseLibraryFile = bind<(text: string, filename: string) => LibraryItem[]>('parseLibraryFile');
export const mergeLibraries = bind<(builtin: LibraryItem[], user: LibraryItem[][]) => LibraryItem[]>('mergeLibraries');
export const evaluateMaterial = bind<(m: Material, theta: number) => { lambda: number; cp: number; rho: number }>('evaluateMaterial');
/** Makes getLibraryItem/searchLibrary default to the merged (built-in + user) library. Optional in core. */
export const setActiveLibrary: (items: LibraryItem[]) => void = hasCore('setActiveLibrary') ? bind('setActiveLibrary') : () => undefined;

// Post-processing
export const interpolateField = bind<(mesh: Mesh, field: ArrayLike<number>, point: Vec2) => number | null>('interpolateField');
export const fieldAtTime = bind<(result: RunResult, t: number) => ArrayLike<number>>('fieldAtTime');
export const reducedSection = bind<(mesh: Mesh, field: ArrayLike<number>, theta: number) => { area: number; width: number; height: number; bounds?: unknown }>('reducedSection');
export const rebarTable = bind<(project: Project, result: RunResult, times: number[]) => RebarRowCore[]>('rebarTable');
export const evaluateMetrics = bind<(project: Project, result: RunResult, series: Record<string, SeriesEvaluator>) => MetricResultCore[]>('evaluateMetrics');
export const timeToThreshold = bind<(times: ArrayLike<number>, values: ArrayLike<number>, threshold: number) => number | null>('timeToThreshold');
export const heatFlowAcrossEdges = bind<(result: RunResult, boundaryConditions: BoundaryCondition[], series: Record<string, SeriesEvaluator>, edgeRefs: EdgeRef[], time: number) => number>('heatFlowAcrossEdges');

// Templates and geometry
export const TEMPLATES: TemplateDef[] = value('TEMPLATES', []);
export const buildTemplate = bind<(id: string, params: Record<string, number | string | boolean>) => { regions: { name: string; polygon: Polygon; materialHint?: string }[] }>('buildTemplate');
export const polygonBounds = bind<(polygon: Polygon) => { minX: number; minY: number; maxX: number; maxY: number }>('polygonBounds');

export type { Analysis, Metric };

/** Series evaluators for every time series of a project (used by metrics and heat-flow queries). */
export function seriesEvaluators(project: Project): Record<string, SeriesEvaluator> {
  const out: Record<string, SeriesEvaluator> = {};
  for (const s of project.timeSeries) {
    try {
      out[s.id] = compileSeries(s, project.settings.ambientTemperature);
    } catch {
      // Left out; metrics that need it report null.
    }
  }
  return out;
}

export function hasCore(name: string): boolean {
  return typeof (core as unknown as Record<string, unknown>)[name] === 'function';
}
