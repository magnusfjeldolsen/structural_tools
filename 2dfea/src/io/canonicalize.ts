/**
 * Pure transformation between Zustand `ModelState` and the v1 file shape.
 *
 * No store imports here — these functions are deterministic and unit-testable
 * in isolation. The store integration lives in applyToStore.ts.
 *
 * Unit-suffix mapping (the runtime store uses bare names; the file uses
 * unit-suffixed names per plan §5.2 rule 1):
 *
 *   Node.x      → x_m
 *   Node.y      → y_m
 *   Element.E   → E_GPa
 *   Element.I   → I_m4
 *   Element.A   → A_m2
 *   NodalLoad.fx/fy   → fx_kN/fy_kN
 *   NodalLoad.mz      → mz_kNm
 *   DistributedLoad.w1/w2 → w1_kN_per_m / w2_kN_per_m
 *   DistributedLoad.x1/x2 → x1_m / x2_m
 *   ElementPointLoad.distance  → distance_m
 *   ElementPointLoad.magnitude → magnitude_kN_or_kNm  (unit varies by direction)
 */

import type {
  Node,
  Element,
  NodalLoad,
  DistributedLoad,
  ElementPointLoad,
  LoadCase,
  LoadCombinationDefinition,
} from '../analysis/types';
import type { ModelFileV1 } from './schema';
import { CURRENT_SCHEMA_VERSION } from './schemaVersion';
import { V1_UNITS } from './schema';

/**
 * Subset of the runtime ModelState that we serialize. Kept narrow on
 * purpose — UI-only / solver-only fields are intentionally excluded.
 */
export interface SerializableModelState {
  nodes: Node[];
  elements: Element[];
  loads: {
    nodal: NodalLoad[];
    distributed: DistributedLoad[];
    elementPoint: ElementPointLoad[];
  };
  loadCases: LoadCase[];
  loadCombinations: LoadCombinationDefinition[];
  activeLoadCase: string | null;
  activeResultView: { type: 'case' | 'combination'; name: string | null };
  nextNodeNumber: number;
  nextElementNumber: number;
  nextNodalLoadNumber: number;
  nextPointLoadNumber: number;
  nextDistributedLoadNumber: number;
  nextLineLoadNumber: number;
  comments?: {
    nodes: Record<string, string>;
    elements: Record<string, string>;
    loads: Record<string, string>;
    loadCases: Record<string, string>;
    loadCombinations: Record<string, string>;
  };
}

export interface ModelFileOptions {
  name?: string;
  description?: string;
  /** Override `metadata.exportedAt` (used by tests for determinism). */
  exportedAt?: string;
}

/**
 * Drop empty inner records from a comments map. If every inner record is
 * empty, returns `undefined` so the canonical output omits `_comments`
 * entirely (per plan §5.2 rule 4 — no null-vs-undefined ambiguity).
 */
function buildCommentsBlock(
  comments: SerializableModelState['comments']
): ModelFileV1['_comments'] {
  if (!comments) return undefined;
  const out: NonNullable<ModelFileV1['_comments']> = {};
  if (Object.keys(comments.nodes).length > 0) out.nodes = { ...comments.nodes };
  if (Object.keys(comments.elements).length > 0) out.elements = { ...comments.elements };
  if (Object.keys(comments.loads).length > 0) out.loads = { ...comments.loads };
  if (Object.keys(comments.loadCases).length > 0) out.loadCases = { ...comments.loadCases };
  if (Object.keys(comments.loadCombinations).length > 0) {
    out.loadCombinations = { ...comments.loadCombinations };
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

/**
 * Pure: convert the live ModelState to the v1 file shape. No store reads,
 * no DOM, no network. Safe to call from worker / SSR contexts if ever needed.
 */
export function modelStateToFile(
  state: SerializableModelState,
  opts: ModelFileOptions = {}
): ModelFileV1 {
  // TODO(appVersion): wire `import.meta.env.VITE_APP_VERSION` (read from
  // package.json via vite.config.ts). v1.0.0 ships with the literal
  // "unknown" — see plan §11 follow-up TODO #1. The schema accepts any
  // string here, so the wiring does NOT require a schema bump.
  const appVersion = 'unknown';

  const file: ModelFileV1 = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      appVersion,
      exportedAt: opts.exportedAt ?? new Date().toISOString(),
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      author: null,
      units: { ...V1_UNITS },
    },
    model: {
      nodes: state.nodes.map((n) => ({
        name: n.name,
        x_m: n.x,
        y_m: n.y,
        support: n.support,
      })),
      elements: state.elements.map((e) => ({
        name: e.name,
        nodeI: e.nodeI,
        nodeJ: e.nodeJ,
        E_GPa: e.E,
        I_m4: e.I,
        A_m2: e.A,
      })),
      loads: {
        nodal: state.loads.nodal.map((l) => ({
          id: l.id,
          node: l.node,
          fx_kN: l.fx,
          fy_kN: l.fy,
          mz_kNm: l.mz,
          ...(l.case !== undefined ? { case: l.case } : {}),
        })),
        distributed: state.loads.distributed.map((l) => ({
          id: l.id,
          element: l.element,
          direction: l.direction,
          w1_kN_per_m: l.w1,
          w2_kN_per_m: l.w2,
          x1_m: l.x1,
          x2_m: l.x2,
          ...(l.case !== undefined ? { case: l.case } : {}),
        })),
        elementPoint: state.loads.elementPoint.map((l) => ({
          id: l.id,
          element: l.element,
          distance_m: l.distance,
          direction: l.direction,
          magnitude_kN_or_kNm: l.magnitude,
          ...(l.case !== undefined ? { case: l.case } : {}),
        })),
      },
      loadCases: state.loadCases.map((c) => ({ ...c })),
      loadCombinations: state.loadCombinations.map((c) => ({
        name: c.name,
        ...(c.description !== undefined ? { description: c.description } : {}),
        factors: { ...c.factors },
      })),
      activeLoadCase: state.activeLoadCase,
      activeResultView: { ...state.activeResultView },
      idCounters: {
        nextNodeNumber: state.nextNodeNumber,
        nextElementNumber: state.nextElementNumber,
        nextNodalLoadNumber: state.nextNodalLoadNumber,
        nextPointLoadNumber: state.nextPointLoadNumber,
        nextDistributedLoadNumber: state.nextDistributedLoadNumber,
        nextLineLoadNumber: state.nextLineLoadNumber,
      },
    },
  };

  const commentsBlock = buildCommentsBlock(state.comments);
  if (commentsBlock !== undefined) {
    file._comments = commentsBlock;
  }

  return file;
}

/**
 * Reverse of modelStateToFile — convert a validated v1 file into the patch
 * applied to ModelState. Returned object is plain data; the caller composes
 * it onto the store. See applyToStore.ts.
 */
export interface StorePatch {
  nodes: Node[];
  elements: Element[];
  loads: {
    nodal: NodalLoad[];
    distributed: DistributedLoad[];
    elementPoint: ElementPointLoad[];
  };
  loadCases: LoadCase[];
  loadCombinations: LoadCombinationDefinition[];
  activeLoadCase: string | null;
  activeResultView: { type: 'case' | 'combination'; name: string | null };
  nextNodeNumber: number;
  nextElementNumber: number;
  nextNodalLoadNumber: number;
  nextPointLoadNumber: number;
  nextDistributedLoadNumber: number;
  nextLineLoadNumber: number;
  comments: {
    nodes: Record<string, string>;
    elements: Record<string, string>;
    loads: Record<string, string>;
    loadCases: Record<string, string>;
    loadCombinations: Record<string, string>;
  };
}

export function fileToStorePatch(file: ModelFileV1): StorePatch {
  const m = file.model;
  return {
    nodes: m.nodes.map((n) => ({
      name: n.name,
      x: n.x_m,
      y: n.y_m,
      support: n.support,
    })),
    elements: m.elements.map((e) => ({
      name: e.name,
      nodeI: e.nodeI,
      nodeJ: e.nodeJ,
      E: e.E_GPa,
      I: e.I_m4,
      A: e.A_m2,
    })),
    loads: {
      nodal: m.loads.nodal.map((l) => ({
        id: l.id,
        node: l.node,
        fx: l.fx_kN,
        fy: l.fy_kN,
        mz: l.mz_kNm,
        ...(l.case !== undefined ? { case: l.case } : {}),
      })),
      distributed: m.loads.distributed.map((l) => ({
        id: l.id,
        element: l.element,
        direction: l.direction,
        w1: l.w1_kN_per_m,
        w2: l.w2_kN_per_m,
        x1: l.x1_m,
        x2: l.x2_m,
        ...(l.case !== undefined ? { case: l.case } : {}),
      })),
      elementPoint: m.loads.elementPoint.map((l) => ({
        id: l.id,
        element: l.element,
        distance: l.distance_m,
        direction: l.direction,
        magnitude: l.magnitude_kN_or_kNm,
        ...(l.case !== undefined ? { case: l.case } : {}),
      })),
    },
    loadCases: m.loadCases.map((c) => ({
      name: c.name,
      ...(c.description !== undefined ? { description: c.description } : {}),
    })),
    loadCombinations: m.loadCombinations.map((c) => ({
      name: c.name,
      ...(c.description !== undefined ? { description: c.description } : {}),
      factors: { ...c.factors },
    })),
    activeLoadCase: m.activeLoadCase,
    activeResultView: { ...m.activeResultView },
    nextNodeNumber: m.idCounters.nextNodeNumber,
    nextElementNumber: m.idCounters.nextElementNumber,
    nextNodalLoadNumber: m.idCounters.nextNodalLoadNumber,
    nextPointLoadNumber: m.idCounters.nextPointLoadNumber,
    nextDistributedLoadNumber: m.idCounters.nextDistributedLoadNumber,
    nextLineLoadNumber: m.idCounters.nextLineLoadNumber,
    comments: {
      nodes: { ...(file._comments?.nodes ?? {}) },
      elements: { ...(file._comments?.elements ?? {}) },
      loads: { ...(file._comments?.loads ?? {}) },
      loadCases: { ...(file._comments?.loadCases ?? {}) },
      loadCombinations: { ...(file._comments?.loadCombinations ?? {}) },
    },
  };
}
