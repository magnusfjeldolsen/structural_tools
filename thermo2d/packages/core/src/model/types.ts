/**
 * thermo2d data model — the single source of truth for the editor, the mesher,
 * the solver and the MCP server. One serialisable `Project` document; every
 * entity has a stable id so references survive edits, undo/redo and round-trips.
 *
 * Units in the model: mm for geometry; °C; s; SI for material properties
 * (W/mK, J/kgK, kg/m³) and fluxes (W/m², W/m³). The solver converts geometry
 * to metres internally.
 *
 * Conventions:
 *  - Rings are arrays of [x, y] in mm, NOT closed (first point is not repeated).
 *  - Outer rings are counter-clockwise, holes are clockwise (normalised on save).
 *  - Edge k of a ring runs from point k to point (k + 1) mod n.
 *  - Regions may NEST (a rebar circle inside a concrete outline). They must not
 *    partially overlap. The mesher assigns each triangle to the smallest region
 *    that contains its centroid.
 */

export type Vec2 = [number, number];
export type Ring = Vec2[];

export interface Polygon {
  outer: Ring;
  holes: Ring[];
}

export type EntityId = string;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type RegionSource = 'drawn' | 'derived' | 'template' | 'imported';

export interface TemplateRef {
  templateId: string;
  params: Record<string, number | string | boolean>;
}

export interface Region {
  id: EntityId;
  name: string;
  polygon: Polygon;
  materialId: EntityId | null;
  source: RegionSource;
  /** Present while a parametric template can still drive the polygon. */
  template?: TemplateRef;
  visible?: boolean;
  locked?: boolean;
  /** Optional colour override for the editor (CSS colour). */
  color?: string;
}

/** Address of one ring edge in a region. ring 0 = outer, ring k>=1 = holes[k-1]. */
export interface EdgeRef {
  regionId: EntityId;
  ring: number;
  edgeIndex: number;
  /**
   * Geometric fingerprint (see geometry/fingerprint.ts) so a boundary condition can
   * be re-attached after vertex edits that keep the edge. Optional on input;
   * filled in by the command layer.
   */
  fingerprint?: string;
}

// ---------------------------------------------------------------------------
// Reinforcement (optional RC module)
// ---------------------------------------------------------------------------

export type RebarSetKind = 'edge' | 'corner' | 'stirrup' | 'grid' | 'ring' | 'manual';

export interface RebarSet {
  id: EntityId;
  name: string;
  kind: RebarSetKind;
  /** Host region. */
  regionId: EntityId;
  /** For kind 'edge': host edge. */
  edgeRef?: EdgeRef;
  /** For kind 'corner': vertex indices on the outer ring of the host region. */
  corners?: number[];
  diameter: number;
  materialId: EntityId;
  /** Steel strength-class id for k_s(θ) (a ReductionTable id on the material); optional. */
  strengthClassId?: string;
  /** Cover in mm to the LONGITUDINAL bar (surface or centre per project.settings.coverReference). */
  cover: number;
  /** Diameter of transverse reinforcement (stirrups, distribution bars) between the surface and this set, mm. Added as distance only; never meshed. Default 0. */
  transverseDiameter?: number;
  count?: number;
  /** Centre-to-centre spacing in mm (alternative to count). */
  spacing?: number;
  /** For 'grid': spacing in x and y. */
  spacingX?: number;
  spacingY?: number;
  /** For 'edge': distance from the edge ends to the first/last bar centre, measured along the edge (mm). Default = cover + Ø/2. */
  startOffset?: number;
  endOffset?: number;
  /** For 'stirrup': bend radius (mm), optional. Stirrups are only meshed when `meshed` is true. */
  bendRadius?: number;
  meshed?: boolean;
}

export interface Rebar {
  id: EntityId;
  /** Stable label, e.g. "B1"; numbering is by set, then left-to-right, bottom-to-top. */
  name: string;
  centre: Vec2;
  diameter: number;
  materialId: EntityId;
  strengthClassId?: string;
  /** Set that generated this bar; absent for manual/detached bars. */
  setId?: EntityId;
  /** Index within the set, for stable numbering across regeneration. */
  setIndex?: number;
  /** Automatic centre probe on (default true). */
  probe?: boolean;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** One row of a tabulated material: θ in °C, λ in W/mK, cp in J/kgK, ρ in kg/m³. */
export interface MaterialTableRow {
  theta: number;
  lambda: number;
  cp: number;
  rho: number;
}

export type MaterialModel =
  | { kind: 'constant'; lambda: number; cp: number; rho: number }
  | { kind: 'table'; rows: MaterialTableRow[] }
  | {
      kind: 'concrete-en1992-1-2';
      aggregate: 'siliceous' | 'calcareous';
      /** Moisture content, % by weight (0, 1.5, 3 or 10 are the tabulated values; interpolated). */
      moisture: number;
      /** Conductivity bound per EN 1992-1-2 §3.3.3: lower (normal design) or upper. */
      conductivity: 'lower' | 'upper';
      /** Density at 20 °C, kg/m³ (default 2300). */
      rho20: number;
    }
  | { kind: 'steel-en1993-1-2'; rho: number }
  | {
      kind: 'timber-en1995-1-2';
      /** Dry density, kg/m³. */
      rho0: number;
      /** Moisture content, % by weight (default 12). */
      moisture: number;
    }
  | {
      /** Equivalent conductivity of an air layer per EN ISO 6946 (thickness and heat-flow direction). */
      kind: 'air-layer-iso6946';
      thickness: number;
      direction: 'horizontal' | 'upward' | 'downward';
      ventilation: 'unventilated' | 'slightly';
    };

export type MaterialCategory =
  | 'concrete'
  | 'insulation'
  | 'wood'
  | 'gypsum'
  | 'metal'
  | 'masonry'
  | 'air'
  | 'ground'
  | 'membrane'
  | 'custom';

export type QualityFlag = 'standard' | 'manufacturer' | 'typical' | 'user';

export interface Citation {
  /** e.g. "EN 1992-1-2:2004 §3.3.2, Figure 3.6" or a manufacturer datasheet with document name and date. */
  text: string;
  url?: string;
  /** Second source used for cross-check, if any. */
  crossCheck?: string;
}

/** Temperature-dependent strength reduction table, θ in °C, k in [0, 1]. */
export interface ReductionTable {
  id: string;
  name: string;
  points: [number, number][];
  source: Citation;
}

export interface Material {
  id: EntityId;
  name: string;
  category: MaterialCategory;
  model: MaterialModel;
  /** Surface emissivity ε_m used by convection+radiation boundaries (0.7 for concrete per EN 1992-1-2, 0.8 general). */
  emissivity: number;
  /** Solar absorptance for climate work (optional). */
  absorptance?: number;
  /** Valid temperature range [min, max] in °C; use outside shows a warning. */
  validRange: [number, number];
  source: Citation;
  quality: QualityFlag;
  tags: string[];
  origin: 'builtin' | 'user';
  /** Strength reduction tables (k_s for steel classes, k_c for concrete). Optional. */
  strength?: ReductionTable[];
  /** Content hash of the library item this was resolved from, for reproducibility. */
  libraryHash?: string;
  color?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Time series and boundary conditions
// ---------------------------------------------------------------------------

export type SeriesInterpolation = 'linear' | 'step';
export type SeriesAfterEnd = 'hold' | 'repeat' | 'ambient';

export interface TimeSeries {
  id: EntityId;
  name: string;
  /** [t in s, value] pairs, strictly increasing t. */
  points: [number, number][];
  interpolation: SeriesInterpolation;
  afterEnd: SeriesAfterEnd;
  unit: '°C' | 'W/m²';
  source: {
    kind: 'preset' | 'csv' | 'manual' | 'generated' | 'epw';
    /** Library id or generator name. */
    ref?: string;
    citation?: Citation;
    /** Generator parameters, so the series can be regenerated (e.g. ISO 834 to 7200 s). */
    params?: Record<string, number | string>;
  };
  notes?: string;
}

export type BoundaryConditionType =
  | 'fixed'
  | 'convection'
  | 'convection-radiation'
  | 'flux'
  | 'insulated';

interface BoundaryConditionBase {
  id: EntityId;
  name: string;
  edgeRefs: EdgeRef[];
  color?: string;
}

export type BoundaryCondition = BoundaryConditionBase &
  (
    | { type: 'fixed'; temperatureSeriesId: EntityId }
    | {
        type: 'convection';
        airSeriesId: EntityId;
        /** Film coefficient W/m²K. Exactly one of alpha or surfaceResistance (m²K/W). */
        alpha?: number;
        surfaceResistance?: number;
      }
    | {
        type: 'convection-radiation';
        gasSeriesId: EntityId;
        /** Radiation temperature series; defaults to gas temperature. */
        radiationSeriesId?: EntityId;
        alphaC: number;
        phi: number;
        /** Surface emissivity ε_m; when omitted the region material's emissivity is used. */
        epsM?: number;
        epsF: number;
      }
    | { type: 'flux'; fluxSeriesId: EntityId }
    | { type: 'insulated' }
  );

export interface HeatSource {
  id: EntityId;
  name: string;
  regionId: EntityId;
  /** Constant volumetric source W/m³, or a time series whose values are W/m³. */
  q?: number;
  seriesId?: EntityId;
}

// ---------------------------------------------------------------------------
// Probes, analyses, scenarios, metrics
// ---------------------------------------------------------------------------

export type ProbeKind = 'manual' | 'click' | 'rebar' | 'depth';

export interface Probe {
  id: EntityId;
  name: string;
  position: Vec2;
  kind: ProbeKind;
  linkedRebarId?: EntityId;
  /** For kind 'depth': the probe sits on the inward normal of the edge at `depth` mm, at fraction `along` (0..1, default 0.5) of the edge. */
  depth?: { edgeRef: EdgeRef; depth: number; along?: number };
  enabled?: boolean;
}

export interface LineProbe {
  id: EntityId;
  name: string;
  from: Vec2;
  to: Vec2;
  /** Number of samples along the line (default 50). */
  samples?: number;
}

export type AnalysisMode = 'steady' | 'transient' | 'periodic';

export interface Analysis {
  id: EntityId;
  name: string;
  mode: AnalysisMode;
  /** Duration in s (transient) or period length in s (periodic). Ignored for steady. */
  duration: number;
  /** Time step in s. */
  dt: number;
  /** Initial (uniform) temperature °C. Also the steady-state starting guess. */
  initialTemperature: number;
  /** Snapshot interval in s (full nodal field stored); probe histories are stored every step. */
  outputInterval: number;
  /** Newton convergence: relative residual and max temperature change [K]. */
  tolerance: { residual: number; deltaTheta: number };
  maxNewtonIterations: number;
  timeIntegration: 'backward-euler' | 'crank-nicolson';
  capacity: 'lumped' | 'consistent';
  /** Adaptive step control (shorten when Newton fails or the change per step exceeds maxDeltaPerStep). */
  adaptive: { enabled: boolean; maxDeltaPerStep: number; minDt: number };
  /** Periodic mode: max number of cycles and convergence criterion (K) for cycle-to-cycle change. */
  periodic?: { maxCycles: number; tolerance: number };
}

/** A scenario overrides fields on entities of the base project by shallow merge. */
export interface Override {
  collection:
    | 'regions'
    | 'materials'
    | 'boundaryConditions'
    | 'timeSeries'
    | 'rebarSets'
    | 'heatSources'
    | 'analyses'
    | 'settings'
    | 'mesh';
  /** Entity id; ignored for 'settings' and 'mesh'. */
  id?: EntityId;
  patch: Record<string, unknown>;
}

export interface Scenario {
  id: EntityId;
  name: string;
  overrides: Override[];
  notes?: string;
}

export type MetricKind =
  | 'heat-flow'
  | 'u-value'
  | 'psi-value'
  | 'min-surface-temperature'
  | 'mean-surface-temperature'
  | 'f-rsi'
  | 'time-to-threshold'
  | 'max-temperature'
  | 'probe-temperature';

export interface Metric {
  id: EntityId;
  name: string;
  kind: MetricKind;
  /** Edges over which heat flow / surface temperature is evaluated. */
  edgeRefs?: EdgeRef[];
  probeId?: EntityId;
  threshold?: number;
  /** Time (s) at which to evaluate, when relevant (default: end of run). */
  time?: number;
  /**
   * kind-specific parameters:
   *  u-value:   length (mm, defaults to total edge length), thetaInside, thetaOutside (°C; default from the two series)
   *  psi-value: u1, l1, u2, l2 (W/m²K and mm) for the 1D parts to subtract; thetaInside, thetaOutside
   *  f-rsi:     thetaInside, thetaOutside
   */
  params?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Mesh settings and project
// ---------------------------------------------------------------------------

export interface MeshSettings {
  preset: 'coarse' | 'normal' | 'fine' | 'custom';
  /** Target element size at exposed (non-insulated) boundary edges, mm. */
  boundarySize?: number;
  /** Target element size in the interior, mm. */
  interiorSize?: number;
  /** Geometric growth rate per element from the boundary inward (e.g. 1.3). */
  growth?: number;
  /** Target element size around rebars, mm. */
  rebarSize?: number;
  /** Segments per rebar circle (12–24). */
  rebarSegments?: number;
  minAngle?: number;
  maxElements?: number;
}

export interface ProjectSettings {
  coverReference: 'surface' | 'centre';
  /** Coordinate origin shown to the user: bounding-box minimum, centroid, or a fixed point. */
  origin: 'bbox-min' | 'centroid' | Vec2;
  ambientTemperature: number;
  language: 'nb' | 'en';
  /** Mesh stirrups as steel (advanced); default false = location reference only. */
  meshStirrups: boolean;
  /** CSV export locale. */
  csv: { separator: ',' | ';'; decimal: '.' | ',' };
}

export interface Project {
  schemaVersion: 1;
  id: EntityId;
  name: string;
  units: { length: 'mm'; temperature: 'C'; time: 's' };
  settings: ProjectSettings;
  regions: Region[];
  rebarSets: RebarSet[];
  rebars: Rebar[];
  materials: Material[];
  boundaryConditions: BoundaryCondition[];
  timeSeries: TimeSeries[];
  heatSources: HeatSource[];
  probes: Probe[];
  lineProbes: LineProbe[];
  analyses: Analysis[];
  scenarios: Scenario[];
  metrics: Metric[];
  mesh: MeshSettings;
  meta: {
    created: string;
    modified: string;
    coreVersion: string;
    notes?: string;
  };
}

// ---------------------------------------------------------------------------
// Library items (materials and curves as shipped / user-defined)
// ---------------------------------------------------------------------------

export type LibraryCategory = 'material' | 'fire-curve' | 'climate-series';

export interface LibraryItem {
  id: string;
  category: LibraryCategory;
  name: string;
  /** Norwegian name, optional. */
  nameNb?: string;
  tags: string[];
  origin: 'builtin' | 'user';
  source: Citation;
  quality: QualityFlag;
  /** For category 'material'. */
  material?: Omit<Material, 'id' | 'origin' | 'libraryHash'>;
  /** For curves: generator kind and default parameters. */
  curve?: {
    generator: string;
    params: Record<string, number | string>;
    unit: '°C' | 'W/m²';
    /** Parameter validity limits, e.g. for the parametric fire. */
    limits?: Record<string, [number, number]>;
    description?: string;
  };
  /** Content hash, filled by the library loader. */
  hash?: string;
}
