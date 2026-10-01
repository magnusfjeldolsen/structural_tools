import type { Analysis, MeshSettings, Project, ProjectSettings } from './types.js';
import type { SizeField } from '../mesh/types.js';

export const CORE_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1 as const;

let counter = 0;
/** Short, stable-enough unique id: prefix + base36 time + counter + random. Deterministic ids may be passed explicitly instead. */
export function newId(prefix = 'e'): string {
  counter = (counter + 1) % 46656;
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
  return `${prefix}_${t}${counter.toString(36).padStart(3, '0')}${r}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  coverReference: 'surface',
  origin: 'bbox-min',
  ambientTemperature: 20,
  language: 'nb',
  meshStirrups: false,
  csv: { separator: ';', decimal: ',' },
};

export const DEFAULT_MESH: MeshSettings = { preset: 'normal' };

export const MESH_PRESETS: Record<'coarse' | 'normal' | 'fine', SizeField> = {
  coarse: { boundarySize: 6, interiorSize: 25, growth: 1.4, rebarSize: 4, rebarSegments: 12, minAngle: 22, maxElements: 60000 },
  normal: { boundarySize: 3, interiorSize: 12, growth: 1.3, rebarSize: 2.5, rebarSegments: 16, minAngle: 25, maxElements: 150000 },
  fine: { boundarySize: 1.5, interiorSize: 6, growth: 1.2, rebarSize: 1.5, rebarSegments: 24, minAngle: 27, maxElements: 400000 },
};

/** Fill every size-field value from the preset, then apply explicit overrides. */
export function resolveMeshSettings(settings: MeshSettings): SizeField {
  const base = MESH_PRESETS[settings.preset === 'custom' ? 'normal' : settings.preset];
  return {
    boundarySize: settings.boundarySize ?? base.boundarySize,
    interiorSize: settings.interiorSize ?? base.interiorSize,
    growth: settings.growth ?? base.growth,
    rebarSize: settings.rebarSize ?? base.rebarSize,
    rebarSegments: settings.rebarSegments ?? base.rebarSegments,
    minAngle: settings.minAngle ?? base.minAngle,
    maxElements: settings.maxElements ?? base.maxElements,
  };
}

export function defaultAnalysis(partial: Partial<Analysis> = {}): Analysis {
  return {
    id: partial.id ?? newId('an'),
    name: partial.name ?? 'Analyse',
    mode: 'transient',
    duration: 5400,
    dt: 5,
    initialTemperature: 20,
    outputInterval: 60,
    tolerance: { residual: 1e-6, deltaTheta: 0.01 },
    maxNewtonIterations: 25,
    timeIntegration: 'backward-euler',
    capacity: 'lumped',
    adaptive: { enabled: true, maxDeltaPerStep: 50, minDt: 0.25 },
    ...partial,
  };
}

export function createEmptyProject(name = 'Nytt prosjekt', id?: string): Project {
  const t = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id ?? newId('prj'),
    name,
    units: { length: 'mm', temperature: 'C', time: 's' },
    settings: { ...DEFAULT_SETTINGS, csv: { ...DEFAULT_SETTINGS.csv } },
    regions: [],
    rebarSets: [],
    rebars: [],
    materials: [],
    boundaryConditions: [],
    timeSeries: [],
    heatSources: [],
    probes: [],
    lineProbes: [],
    analyses: [defaultAnalysis({ id: 'an_main', name: 'Brann 90 min' })],
    scenarios: [],
    metrics: [],
    mesh: { ...DEFAULT_MESH },
    meta: { created: t, modified: t, coreVersion: CORE_VERSION },
  };
}
