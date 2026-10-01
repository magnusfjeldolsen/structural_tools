/**
 * Strength reduction tables (θ in °C → k in [0, 1]), separate from the thermal data.
 * Transcribed from EN 1992-1-2:2004 Tables 3.1, 3.2a and 3.3 and EN 1993-1-2:2005 Table 3.1.
 * The implementer must verify every value against the current EN text and the
 * National Annex before a material is marked as released.
 */
import type { ReductionTable } from '../model/types.js';
import { interpTable } from './models.js';

const T13 = [20, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
const T11 = [20, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

function table(id: string, name: string, temps: number[], values: number[], source: string): ReductionTable {
  if (temps.length !== values.length) throw new Error(`reduction table ${id}: length mismatch`);
  return { id, name, points: temps.map((t, i) => [t, values[i]]), source: { text: source } };
}

/** k_c(θ) for normal-weight concrete, EN 1992-1-2 Table 3.1. */
export const KC_SILICEOUS = table(
  'kc-siliceous',
  'k_c(θ) concrete, siliceous aggregate',
  T13,
  [1.0, 1.0, 0.95, 0.85, 0.75, 0.6, 0.45, 0.3, 0.15, 0.08, 0.04, 0.01, 0.0],
  'EN 1992-1-2:2004 Table 3.1 (siliceous aggregates)',
);
export const KC_CALCAREOUS = table(
  'kc-calcareous',
  'k_c(θ) concrete, calcareous aggregate',
  T13,
  [1.0, 1.0, 0.97, 0.91, 0.85, 0.74, 0.6, 0.43, 0.27, 0.15, 0.06, 0.02, 0.0],
  'EN 1992-1-2:2004 Table 3.1 (calcareous aggregates)',
);

/** k_s(θ) for reinforcing steel, EN 1992-1-2 Table 3.2a. */
export const KS_HOT_ROLLED = table(
  'hot-rolled',
  'k_s(θ) hot-rolled reinforcing steel, tension, ε_s,fi ≥ 2 % (Class N)',
  T13,
  [1.0, 1.0, 1.0, 1.0, 1.0, 0.78, 0.47, 0.23, 0.11, 0.06, 0.04, 0.02, 0.0],
  'EN 1992-1-2:2004 Table 3.2a, column "hot rolled, tension reinforcement, ε_s,fi ≥ 2 %"',
);
export const KS_COLD_WORKED = table(
  'cold-worked',
  'k_s(θ) cold-worked reinforcing steel, tension, ε_s,fi ≥ 2 % (Class X)',
  T13,
  [1.0, 1.0, 1.0, 1.0, 0.94, 0.67, 0.4, 0.12, 0.11, 0.08, 0.05, 0.03, 0.0],
  'EN 1992-1-2:2004 Table 3.2a, column "cold worked, tension reinforcement, ε_s,fi ≥ 2 %"',
);
export const KS_COMPRESSION = table(
  'compression',
  'k_s(θ) reinforcing steel, compression or tension with ε_s,fi < 2 %',
  T13,
  [1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.31, 0.13, 0.09, 0.07, 0.04, 0.02, 0.0],
  'EN 1992-1-2:2004 Table 3.2a, column "compression reinforcement and tension reinforcement with ε_s,fi < 2 %"',
);

/** k_p(θ) for prestressing steel, EN 1992-1-2 Table 3.3 (verify against the current text / NA). */
export const KP_COLD_WORKED_A = table(
  'kp-cold-worked-a',
  'k_p(θ) prestressing steel, cold-worked wires and strands, Class A',
  T11,
  [1.0, 1.0, 0.87, 0.72, 0.46, 0.22, 0.1, 0.08, 0.05, 0.03, 0.0],
  'EN 1992-1-2:2004 Table 3.3, cold worked (wires and strands) Class A — transcribed, verify',
);
export const KP_COLD_WORKED_B = table(
  'kp-cold-worked-b',
  'k_p(θ) prestressing steel, cold-worked wires and strands, Class B',
  T11,
  [1.0, 0.99, 0.87, 0.72, 0.46, 0.22, 0.1, 0.08, 0.05, 0.03, 0.0],
  'EN 1992-1-2:2004 Table 3.3, cold worked (wires and strands) Class B — transcribed, verify',
);
export const KP_QUENCHED = table(
  'kp-quenched-tempered',
  'k_p(θ) prestressing steel, quenched and tempered bars',
  T11,
  [1.0, 0.98, 0.92, 0.86, 0.69, 0.26, 0.21, 0.15, 0.09, 0.04, 0.0],
  'EN 1992-1-2:2004 Table 3.3, quenched and tempered (bars) — transcribed, verify',
);

/** Carbon steel, EN 1993-1-2 Table 3.1. */
export const KY_STRUCTURAL = table(
  'ky-structural-steel',
  'k_y,θ effective yield strength, structural carbon steel',
  T13,
  [1.0, 1.0, 1.0, 1.0, 1.0, 0.78, 0.47, 0.23, 0.11, 0.06, 0.04, 0.02, 0.0],
  'EN 1993-1-2:2005 Table 3.1 (k_y,θ)',
);
export const KE_STRUCTURAL = table(
  'ke-structural-steel',
  'k_E,θ slope of the linear elastic range, structural carbon steel',
  T13,
  [1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.31, 0.13, 0.09, 0.0675, 0.045, 0.0225, 0.0],
  'EN 1993-1-2:2005 Table 3.1 (k_E,θ)',
);

export const REDUCTION_TABLES: ReductionTable[] = [
  KC_SILICEOUS,
  KC_CALCAREOUS,
  KS_HOT_ROLLED,
  KS_COLD_WORKED,
  KS_COMPRESSION,
  KP_COLD_WORKED_A,
  KP_COLD_WORKED_B,
  KP_QUENCHED,
  KY_STRUCTURAL,
  KE_STRUCTURAL,
];

/** Linear interpolation in a reduction table; below the first θ → first value, above the last → last. */
export function lookupReduction(tbl: ReductionTable, theta: number): number {
  return interpTable(tbl.points, theta);
}

export function getReductionTable(id: string): ReductionTable | undefined {
  return REDUCTION_TABLES.find((t) => t.id === id);
}

/** k_s(θ) for a steel class id ('hot-rolled' | 'cold-worked' | 'compression' | prestressing ids). */
export function ksSteel(classId: string, theta: number): number {
  const t = getReductionTable(classId);
  if (!t) throw new Error(`Unknown steel class '${classId}'. Options: ${REDUCTION_TABLES.map((x) => x.id).join(', ')}`);
  return lookupReduction(t, theta);
}

/** k_c(θ) for concrete by aggregate type. */
export function kcConcrete(theta: number, aggregate: 'siliceous' | 'calcareous' = 'siliceous'): number {
  return lookupReduction(aggregate === 'calcareous' ? KC_CALCAREOUS : KC_SILICEOUS, theta);
}
