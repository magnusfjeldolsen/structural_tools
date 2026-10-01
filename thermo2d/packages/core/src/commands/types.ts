/**
 * Command layer contract. Everything the UI can do is a command; the editor and
 * the MCP server both call `applyCommands`. Commands are pure: they take a
 * Project and return a new Project (structural sharing, never mutation), so
 * undo/redo is a history of project documents.
 */
import type {
  Analysis,
  BoundaryCondition,
  EdgeRef,
  HeatSource,
  LineProbe,
  Material,
  MeshSettings,
  Metric,
  Polygon,
  Probe,
  Project,
  ProjectSettings,
  Rebar,
  RebarSet,
  Ring,
  Scenario,
  TimeSeries,
  Vec2,
} from '../model/types.js';

/** Distributive so discriminated unions (BoundaryCondition) keep their discriminants. */
export type WithOptionalId<T extends { id: string }> = T extends unknown ? Omit<T, 'id'> & { id?: string } : never;

export type PrimitiveShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; segments?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; segments?: number }
  | { kind: 'regularPolygon'; cx: number; cy: number; r: number; n: number; rotationDeg?: number }
  | { kind: 'polygon'; points: Ring }
  | { kind: 'polygonWithHoles'; polygon: Polygon };

export type Transform =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'rotate'; cx: number; cy: number; angleDeg: number }
  | { kind: 'mirror'; axis: 'x' | 'y' | { p1: Vec2; p2: Vec2 } }
  | { kind: 'scale'; cx: number; cy: number; sx: number; sy: number };

export type ExposureSide = 'bottom' | 'top' | 'left' | 'right' | 'all' | 'exterior';
export type ExposureKind = 'fire' | 'fire-unexposed' | 'ambient' | 'insulated' | 'indoor' | 'outdoor';

export interface ExposureFace {
  side: ExposureSide;
  kind: ExposureKind;
  /** Series to use (gas/air temperature). For 'fire' without a series, `fireCurve` on the command is used. */
  seriesId?: string;
  /** Override coefficients (alphaC, phi, epsM, epsF, alpha, surfaceResistance). */
  params?: Record<string, number>;
}

export type Command =
  // project
  | { type: 'project.rename'; name: string }
  | { type: 'project.setSettings'; patch: Partial<ProjectSettings> }
  | { type: 'project.setMesh'; patch: Partial<MeshSettings> }
  // regions
  | { type: 'region.addPrimitive'; shape: PrimitiveShape; name?: string; materialId?: string | null; id?: string }
  | { type: 'region.add'; region: WithOptionalId<import('../model/types.js').Region> }
  | { type: 'region.update'; id: string; patch: Partial<Omit<import('../model/types.js').Region, 'id'>> }
  | { type: 'region.setVertex'; id: string; ring: number; index: number; point: Vec2 }
  | { type: 'region.insertVertex'; id: string; ring: number; edgeIndex: number; point?: Vec2 }
  | { type: 'region.deleteVertex'; id: string; ring: number; index: number }
  | { type: 'region.setMaterial'; ids: string[]; materialId: string | null }
  | { type: 'region.boolean'; op: 'union' | 'subtract' | 'intersect' | 'xor'; targetId: string; toolIds: string[]; keepTools?: boolean }
  | { type: 'region.subtractShape'; id: string; shape: PrimitiveShape }
  | { type: 'region.addHole'; id: string; ring: Ring }
  | { type: 'region.offset'; id: string; distance: number; asNew?: boolean; name?: string }
  | { type: 'region.split'; id: string; line: [Vec2, Vec2] }
  | { type: 'region.fillet'; id: string; ring?: number; vertexIndex: number; radius: number; segments?: number }
  | { type: 'region.chamfer'; id: string; ring?: number; vertexIndex: number; distance: number }
  | { type: 'region.mergeCollinear'; id: string; toleranceDeg?: number }
  | { type: 'region.delete'; ids: string[]; dependents?: 'delete' | 'detach' }
  // generic entity ops (regions, rebars, probes, lineProbes)
  | { type: 'entities.transform'; ids: string[]; transform: Transform }
  | { type: 'entities.copy'; ids: string[]; dx: number; dy: number; count?: number }
  | { type: 'entities.polarArray'; ids: string[]; cx: number; cy: number; count: number; angleDeg: number }
  | { type: 'entities.delete'; ids: string[] }
  // templates
  | { type: 'template.create'; templateId: string; params: Record<string, number | string | boolean>; materialId?: string | null; name?: string; id?: string }
  | { type: 'template.update'; regionId: string; params: Record<string, number | string | boolean> }
  // materials
  | { type: 'material.add'; material: WithOptionalId<Material> }
  | { type: 'material.addFromLibrary'; libraryId: string; id?: string; patch?: Partial<Material> }
  | { type: 'material.update'; id: string; patch: Partial<Omit<Material, 'id'>> }
  | { type: 'material.delete'; id: string }
  // reinforcement
  | { type: 'rebarSet.add'; set: WithOptionalId<RebarSet> }
  | { type: 'rebarSet.update'; id: string; patch: Partial<Omit<RebarSet, 'id'>> }
  | { type: 'rebarSet.delete'; id: string; keepBars?: boolean }
  | { type: 'rebar.add'; rebar: WithOptionalId<Rebar> }
  | { type: 'rebar.update'; id: string; patch: Partial<Omit<Rebar, 'id'>> }
  | { type: 'rebar.detach'; ids: string[] }
  | { type: 'rebar.delete'; ids: string[] }
  // time series
  | { type: 'series.add'; series: WithOptionalId<TimeSeries> }
  | { type: 'series.addFromLibrary'; libraryId: string; id?: string; name?: string; params?: Record<string, number | string>; duration?: number }
  | { type: 'series.generate'; generator: 'constant' | 'step' | 'ramp' | 'sinusoid' | 'repeat'; params: Record<string, number | string>; name: string; id?: string; unit?: '°C' | 'W/m²' }
  | { type: 'series.update'; id: string; patch: Partial<Omit<TimeSeries, 'id'>> }
  | { type: 'series.delete'; id: string }
  // boundary conditions
  | { type: 'bc.add'; bc: WithOptionalId<BoundaryCondition> }
  | { type: 'bc.update'; id: string; patch: Record<string, unknown> }
  | { type: 'bc.assignEdges'; id: string; edgeRefs: EdgeRef[]; mode?: 'set' | 'add' | 'remove' }
  | { type: 'bc.delete'; id: string }
  | { type: 'exposure.apply'; regionIds?: string[]; faces: ExposureFace[]; fireCurve?: string; fireDuration?: number }
  // heat sources
  | { type: 'heatSource.add'; source: WithOptionalId<HeatSource> }
  | { type: 'heatSource.update'; id: string; patch: Partial<Omit<HeatSource, 'id'>> }
  | { type: 'heatSource.delete'; id: string }
  // probes
  | { type: 'probe.add'; probe: WithOptionalId<Probe> }
  | { type: 'probe.addAtDepth'; edgeRef: EdgeRef; depth: number; along?: number; name?: string; id?: string }
  | { type: 'probe.addForRebars'; rebarIds?: string[] }
  | { type: 'probe.update'; id: string; patch: Partial<Omit<Probe, 'id'>> }
  | { type: 'probe.delete'; ids: string[] }
  | { type: 'lineProbe.add'; lineProbe: WithOptionalId<LineProbe> }
  | { type: 'lineProbe.update'; id: string; patch: Partial<Omit<LineProbe, 'id'>> }
  | { type: 'lineProbe.delete'; ids: string[] }
  // analyses, scenarios, metrics
  | { type: 'analysis.add'; analysis: WithOptionalId<Analysis> }
  | { type: 'analysis.update'; id: string; patch: Partial<Omit<Analysis, 'id'>> }
  | { type: 'analysis.delete'; id: string }
  | { type: 'scenario.add'; scenario: WithOptionalId<Scenario> }
  | { type: 'scenario.update'; id: string; patch: Partial<Omit<Scenario, 'id'>> }
  | { type: 'scenario.delete'; id: string }
  | { type: 'metric.add'; metric: WithOptionalId<Metric> }
  | { type: 'metric.update'; id: string; patch: Partial<Omit<Metric, 'id'>> }
  | { type: 'metric.delete'; id: string }
  // import
  | { type: 'import.geometryWorkspace'; json: unknown; materialId?: string | null }
  | { type: 'import.polygonCsv'; text: string; name?: string; materialId?: string | null }
  | { type: 'import.dxf'; text: string; materialId?: string | null };

export type CommandType = Command['type'];

export interface Change {
  collection: keyof Pick<
    Project,
    | 'regions'
    | 'rebarSets'
    | 'rebars'
    | 'materials'
    | 'boundaryConditions'
    | 'timeSeries'
    | 'heatSources'
    | 'probes'
    | 'lineProbes'
    | 'analyses'
    | 'scenarios'
    | 'metrics'
  > | 'settings' | 'mesh' | 'project';
  id?: string;
  kind: 'added' | 'updated' | 'deleted';
}

export type IssueSeverity = 'error' | 'warning' | 'info';

/** A validation problem in plain words, pointing at the entity on the canvas. */
export interface Issue {
  severity: IssueSeverity;
  code: string;
  message: string;
  messageNb?: string;
  entity?: { collection: Change['collection']; id: string };
  ring?: number;
  edgeIndex?: number;
  point?: Vec2;
  /** What to do about it. */
  suggestion?: string;
}

export interface CommandResult {
  project: Project;
  changes: Change[];
  /** Ids created by this batch, per command index (for chaining in MCP). */
  createdIds: string[][];
  warnings: Issue[];
}

/** Thrown by `applyCommands`; the whole batch is rejected (atomic). */
export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail: {
      commandIndex?: number;
      field?: string;
      value?: unknown;
      options?: unknown[];
      suggestion?: string;
    } = {},
  ) {
    super(message);
    this.name = 'CommandError';
  }
}
