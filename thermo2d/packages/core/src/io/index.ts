/**
 * Project and results IO: zod schema with migration, canonical serialisation,
 * a stable content hash, and the binary results container.
 */
import { z } from 'zod';
import type { Project } from '../model/types.js';
import { CORE_VERSION, createEmptyProject, defaultAnalysis } from '../model/defaults.js';
import type { Mesh } from '../mesh/types.js';
import type { RunResult } from '../solver/types.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const vec2 = z.tuple([z.number(), z.number()]);
const ring = z.array(vec2).min(3);
const polygon = z.object({ outer: ring, holes: z.array(ring).default([]) });
const edgeRef = z.object({ regionId: z.string(), ring: z.number().int().min(0).default(0), edgeIndex: z.number().int().min(0), fingerprint: z.string().optional() });
const citation = z.object({ text: z.string(), url: z.string().optional(), crossCheck: z.string().optional() });
const reductionTable = z.object({ id: z.string(), name: z.string(), points: z.array(z.tuple([z.number(), z.number()])), source: citation });

const materialModel = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('constant'), lambda: z.number().positive(), cp: z.number().positive(), rho: z.number().positive() }),
  z.object({ kind: z.literal('table'), rows: z.array(z.object({ theta: z.number(), lambda: z.number(), cp: z.number(), rho: z.number() })).min(1) }),
  z.object({ kind: z.literal('concrete-en1992-1-2'), aggregate: z.enum(['siliceous', 'calcareous']), moisture: z.number().min(0).max(10), conductivity: z.enum(['lower', 'upper']), rho20: z.number().positive() }),
  z.object({ kind: z.literal('steel-en1993-1-2'), rho: z.number().positive() }),
  z.object({ kind: z.literal('timber-en1995-1-2'), rho0: z.number().positive(), moisture: z.number().min(0) }),
  z.object({ kind: z.literal('air-layer-iso6946'), thickness: z.number().positive(), direction: z.enum(['horizontal', 'upward', 'downward']), ventilation: z.enum(['unventilated', 'slightly']) }),
]);

const material = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane', 'custom']),
  model: materialModel,
  emissivity: z.number().min(0).max(1),
  absorptance: z.number().min(0).max(1).optional(),
  validRange: z.tuple([z.number(), z.number()]),
  source: citation,
  quality: z.enum(['standard', 'manufacturer', 'typical', 'user']),
  tags: z.array(z.string()).default([]),
  origin: z.enum(['builtin', 'user']),
  strength: z.array(reductionTable).optional(),
  libraryHash: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

const timeSeries = z.object({
  id: z.string(),
  name: z.string(),
  points: z.array(z.tuple([z.number(), z.number()])).min(1),
  interpolation: z.enum(['linear', 'step']).default('linear'),
  afterEnd: z.enum(['hold', 'repeat', 'ambient']).default('hold'),
  unit: z.enum(['°C', 'W/m²']).default('°C'),
  source: z.object({
    kind: z.enum(['preset', 'csv', 'manual', 'generated', 'epw']),
    ref: z.string().optional(),
    citation: citation.optional(),
    params: z.record(z.union([z.number(), z.string()])).optional(),
  }),
  notes: z.string().optional(),
});

const bcBase = { id: z.string(), name: z.string(), edgeRefs: z.array(edgeRef).default([]), color: z.string().optional() };
const boundaryCondition = z.discriminatedUnion('type', [
  z.object({ ...bcBase, type: z.literal('fixed'), temperatureSeriesId: z.string() }),
  z.object({ ...bcBase, type: z.literal('convection'), airSeriesId: z.string(), alpha: z.number().nonnegative().optional(), surfaceResistance: z.number().positive().optional() }),
  z.object({ ...bcBase, type: z.literal('convection-radiation'), gasSeriesId: z.string(), radiationSeriesId: z.string().optional(), alphaC: z.number().nonnegative(), phi: z.number().min(0).max(1), epsM: z.number().min(0).max(1).optional(), epsF: z.number().min(0).max(1) }),
  z.object({ ...bcBase, type: z.literal('flux'), fluxSeriesId: z.string() }),
  z.object({ ...bcBase, type: z.literal('insulated') }),
]);

const analysis = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['steady', 'transient', 'periodic']),
  duration: z.number().nonnegative(),
  dt: z.number().positive(),
  initialTemperature: z.number(),
  outputInterval: z.number().positive(),
  tolerance: z.object({ residual: z.number().positive(), deltaTheta: z.number().positive() }),
  maxNewtonIterations: z.number().int().positive(),
  timeIntegration: z.enum(['backward-euler', 'crank-nicolson']),
  capacity: z.enum(['lumped', 'consistent']),
  adaptive: z.object({ enabled: z.boolean(), maxDeltaPerStep: z.number().positive(), minDt: z.number().positive() }),
  periodic: z.object({ maxCycles: z.number().int().positive(), tolerance: z.number().positive() }).optional(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  units: z.object({ length: z.literal('mm'), temperature: z.literal('C'), time: z.literal('s') }),
  settings: z.object({
    coverReference: z.enum(['surface', 'centre']),
    origin: z.union([z.enum(['bbox-min', 'centroid']), vec2]),
    ambientTemperature: z.number(),
    language: z.enum(['nb', 'en']),
    meshStirrups: z.boolean(),
    csv: z.object({ separator: z.enum([',', ';']), decimal: z.enum(['.', ',']) }),
  }),
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      polygon,
      materialId: z.string().nullable(),
      source: z.enum(['drawn', 'derived', 'template', 'imported']),
      template: z.object({ templateId: z.string(), params: z.record(z.union([z.number(), z.string(), z.boolean()])) }).optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      color: z.string().optional(),
    }),
  ),
  rebarSets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['edge', 'corner', 'stirrup', 'grid', 'ring', 'manual']),
      regionId: z.string(),
      edgeRef: edgeRef.optional(),
      corners: z.array(z.number().int()).optional(),
      diameter: z.number().positive(),
      materialId: z.string(),
      strengthClassId: z.string().optional(),
      cover: z.number().nonnegative(),
      count: z.number().int().positive().optional(),
      spacing: z.number().positive().optional(),
      spacingX: z.number().positive().optional(),
      spacingY: z.number().positive().optional(),
      startOffset: z.number().optional(),
      endOffset: z.number().optional(),
      bendRadius: z.number().optional(),
      meshed: z.boolean().optional(),
    }),
  ),
  rebars: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      centre: vec2,
      diameter: z.number().positive(),
      materialId: z.string(),
      strengthClassId: z.string().optional(),
      setId: z.string().optional(),
      setIndex: z.number().int().optional(),
      probe: z.boolean().optional(),
    }),
  ),
  materials: z.array(material),
  boundaryConditions: z.array(boundaryCondition),
  timeSeries: z.array(timeSeries),
  heatSources: z.array(z.object({ id: z.string(), name: z.string(), regionId: z.string(), q: z.number().optional(), seriesId: z.string().optional() })),
  probes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: vec2,
      kind: z.enum(['manual', 'click', 'rebar', 'depth']),
      linkedRebarId: z.string().optional(),
      depth: z.object({ edgeRef, depth: z.number(), along: z.number().optional() }).optional(),
      enabled: z.boolean().optional(),
    }),
  ),
  lineProbes: z.array(z.object({ id: z.string(), name: z.string(), from: vec2, to: vec2, samples: z.number().int().positive().optional() })),
  analyses: z.array(analysis).min(1),
  scenarios: z.array(z.object({ id: z.string(), name: z.string(), overrides: z.array(z.object({ collection: z.string(), id: z.string().optional(), patch: z.record(z.unknown()) })), notes: z.string().optional() })),
  metrics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['heat-flow', 'u-value', 'psi-value', 'min-surface-temperature', 'mean-surface-temperature', 'f-rsi', 'time-to-threshold', 'max-temperature', 'probe-temperature']),
      edgeRefs: z.array(edgeRef).optional(),
      probeId: z.string().optional(),
      threshold: z.number().optional(),
      time: z.number().optional(),
      params: z.record(z.union([z.number(), z.string()])).optional(),
    }),
  ),
  mesh: z.object({
    preset: z.enum(['coarse', 'normal', 'fine', 'custom']),
    boundarySize: z.number().positive().optional(),
    interiorSize: z.number().positive().optional(),
    growth: z.number().min(1).optional(),
    rebarSize: z.number().positive().optional(),
    rebarSegments: z.number().int().min(6).optional(),
    minAngle: z.number().min(5).max(34).optional(),
    maxElements: z.number().int().positive().optional(),
  }),
  meta: z.object({ created: z.string(), modified: z.string(), coreVersion: z.string(), notes: z.string().optional() }),
});

export class ProjectParseError extends Error {
  constructor(message: string, public readonly issues: { path: string; message: string }[]) {
    super(message);
    this.name = 'ProjectParseError';
  }
}

/** Parse a project document (object or JSON text), migrate older schema versions, validate, and fill defaults. */
export function parseProject(input: unknown): Project {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      throw new ProjectParseError(`The file is not valid JSON: ${(e as Error).message}`, []);
    }
  }
  raw = migrate(raw);
  const res = projectSchema.safeParse(raw);
  if (!res.success) {
    const issues = res.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ProjectParseError(`The project file has ${res.error.issues.length} problem(s). First: ${issues[0]?.path || '(root)'}: ${issues[0]?.message}`, issues);
  }
  return res.data as Project;
}

function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') throw new ProjectParseError('The project file must be a JSON object.', []);
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion === undefined) {
    // Pre-release documents without a version: treat as v1 with defaults filled.
    const empty = createEmptyProject(String(o.name ?? 'Prosjekt'));
    return { ...empty, ...o, schemaVersion: 1, analyses: (o.analyses as unknown[])?.length ? o.analyses : [defaultAnalysis()] };
  }
  if (o.schemaVersion !== 1) throw new ProjectParseError(`Unknown schema version ${String(o.schemaVersion)}; this build reads version 1.`, []);
  return o;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/** Canonical JSON: sorted keys, no whitespace, numbers as-is. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/** FNV-1a 64-bit as 16 hex chars. */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/** Stable content hash of everything that affects results (meta timestamps excluded). */
export function projectHash(project: Project): string {
  const { meta, ...rest } = project;
  void meta;
  return fnv1a64(canonicalJson(rest));
}

// ---------------------------------------------------------------------------
// Results container: "T2DR" magic, u32 header length, JSON header, then raw buffers.
// ---------------------------------------------------------------------------

const MAGIC = 'T2DR';

interface ResultsHeader {
  version: 1;
  analysisId: string;
  scenarioId: string | null;
  mode: RunResult['mode'];
  times: number[];
  probes: RunResult['probes'];
  energy: RunResult['energy'];
  stats: RunResult['stats'];
  warnings: string[];
  stamp?: RunResult['stamp'];
  mesh: { regions: Mesh['regions']; boundary: Mesh['boundary']; stats: Mesh['stats']; warnings: Mesh['warnings']; nodeCount: number; elementCount: number };
  buffers: { name: string; kind: 'f64' | 'f32' | 'u32' | 'i32'; length: number; offset: number }[];
}

export function encodeResults(result: RunResult): Uint8Array {
  const buffers: { name: string; kind: ResultsHeader['buffers'][number]['kind']; data: ArrayBufferView }[] = [];
  buffers.push({ name: 'nodes', kind: 'f64', data: result.mesh.nodes });
  buffers.push({ name: 'triangles', kind: 'u32', data: result.mesh.triangles });
  buffers.push({ name: 'elementRegion', kind: 'i32', data: result.mesh.elementRegion });
  buffers.push({ name: 'probeTimes', kind: 'f64', data: result.probeTimes });
  result.fields.forEach((f, i) => buffers.push({ name: `field${i}`, kind: 'f32', data: f }));
  result.probeValues.forEach((v, i) => buffers.push({ name: `probe${i}`, kind: 'f64', data: v }));

  let offset = 0;
  const descriptors: ResultsHeader['buffers'] = [];
  for (const b of buffers) {
    offset = align8(offset);
    const length = (b.data as unknown as { length: number }).length;
    descriptors.push({ name: b.name, kind: b.kind, length, offset });
    offset += b.data.byteLength;
  }
  const header: ResultsHeader = {
    version: 1,
    analysisId: result.analysisId,
    scenarioId: result.scenarioId,
    mode: result.mode,
    times: result.times,
    probes: result.probes,
    energy: result.energy,
    stats: result.stats,
    warnings: result.warnings,
    stamp: result.stamp,
    mesh: {
      regions: result.mesh.regions,
      boundary: result.mesh.boundary,
      stats: result.mesh.stats,
      warnings: result.mesh.warnings,
      nodeCount: result.mesh.nodes.length / 2,
      elementCount: result.mesh.triangles.length / 3,
    },
    buffers: descriptors,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const dataStart = align8(8 + headerBytes.length);
  const out = new Uint8Array(dataStart + offset);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, true);
  out.set(headerBytes, 8);
  for (const [i, b] of buffers.entries()) {
    out.set(new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength), dataStart + descriptors[i].offset);
  }
  return out;
}

export function decodeResults(bytes: Uint8Array): RunResult {
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('Not a thermo2d results file.');
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as ResultsHeader;
  const dataStart = align8(8 + headerLength);
  const read = (name: string): ArrayBufferView => {
    const d = header.buffers.find((b) => b.name === name);
    if (!d) throw new Error(`Results file is missing buffer "${name}".`);
    // Copy into a fresh aligned buffer so typed-array constructors never see a misaligned offset.
    const byteLength = d.length * (d.kind === 'f32' || d.kind === 'u32' || d.kind === 'i32' ? 4 : 8);
    const copy = bytes.slice(bytes.byteOffset + dataStart + d.offset - bytes.byteOffset, bytes.byteOffset + dataStart + d.offset - bytes.byteOffset + byteLength);
    const buf = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    switch (d.kind) {
      case 'f64':
        return new Float64Array(buf);
      case 'f32':
        return new Float32Array(buf);
      case 'u32':
        return new Uint32Array(buf);
      case 'i32':
        return new Int32Array(buf);
    }
  };
  const mesh: Mesh = {
    nodes: read('nodes') as Float64Array,
    triangles: read('triangles') as Uint32Array,
    elementRegion: read('elementRegion') as Int32Array,
    regions: header.mesh.regions,
    boundary: header.mesh.boundary,
    stats: header.mesh.stats,
    warnings: header.mesh.warnings,
  };
  const fields = header.times.map((_, i) => read(`field${i}`) as Float32Array);
  const probeValues = header.probes.map((_, i) => read(`probe${i}`) as Float64Array);
  return {
    analysisId: header.analysisId,
    scenarioId: header.scenarioId,
    mode: header.mode,
    mesh,
    times: header.times,
    fields,
    probes: header.probes,
    probeTimes: read('probeTimes') as Float64Array,
    probeValues,
    energy: header.energy,
    stats: header.stats,
    warnings: header.warnings,
    stamp: header.stamp,
  };
}

function align8(n: number): number {
  return (n + 7) & ~7;
}

export { CORE_VERSION };
