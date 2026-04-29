/**
 * Tests for canonicalize.ts — the pure ModelState ↔ ModelFileV1 transform.
 *
 * Note: these tests do not touch the Zustand store; they exercise
 * modelStateToFile / fileToStorePatch as pure functions over the
 * SerializableModelState shape.
 */
import { describe, it, expect } from 'vitest';
import { modelStateToFile, fileToStorePatch } from './canonicalize';
import type { SerializableModelState } from './canonicalize';
import { CURRENT_SCHEMA_VERSION } from './schemaVersion';

function makeMinimalState(): SerializableModelState {
  return {
    nodes: [
      { name: 'N1', x: 0, y: 0, support: 'fixed' },
      { name: 'N2', x: 4, y: 0, support: 'free' },
    ],
    elements: [
      { name: 'E1', nodeI: 'N1', nodeJ: 'N2', E: 210, I: 1e-4, A: 1e-3 },
    ],
    loads: {
      nodal: [{ id: 'NL1', node: 'N2', fx: 0, fy: -10, mz: 0, case: 'Dead' }],
      distributed: [],
      elementPoint: [],
    },
    loadCases: [
      { name: 'Dead', description: 'Dead loads' },
      { name: 'Live', description: 'Live loads' },
    ],
    loadCombinations: [],
    activeLoadCase: 'Dead',
    activeResultView: { type: 'case', name: 'Dead' },
    nextNodeNumber: 3,
    nextElementNumber: 2,
    nextNodalLoadNumber: 2,
    nextPointLoadNumber: 1,
    nextDistributedLoadNumber: 1,
    nextLineLoadNumber: 1,
    comments: {
      nodes: {},
      elements: {},
      loads: {},
      loadCases: {},
      loadCombinations: {},
    },
  };
}

describe('modelStateToFile', () => {
  it('emits schemaVersion and metadata.units pinned to v1 values', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(file.metadata.units).toEqual({
      length: 'm',
      force: 'kN',
      moment: 'kNm',
      stress: 'GPa',
      areaMomentOfInertia: 'm4',
      area: 'm2',
    });
  });

  it('defaults appVersion to "unknown" until the package.json wiring lands', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(file.metadata.appVersion).toBe('unknown');
  });

  it('emits a valid ISO 8601 string for metadata.exportedAt', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(() => new Date(file.metadata.exportedAt).toISOString()).not.toThrow();
    // Round-trips back to itself when reparsed.
    const parsed = new Date(file.metadata.exportedAt);
    expect(parsed.toISOString()).toBe(parsed.toISOString());
  });

  it('honours opts.exportedAt for deterministic tests', () => {
    const file = modelStateToFile(makeMinimalState(), {
      exportedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(file.metadata.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps every numeric field to its unit-suffixed counterpart', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(file.model.nodes[0]).toMatchObject({ x_m: 0, y_m: 0 });
    expect(file.model.elements[0]).toMatchObject({
      E_GPa: 210,
      I_m4: 1e-4,
      A_m2: 1e-3,
    });
    expect(file.model.loads.nodal[0]).toMatchObject({
      fx_kN: 0,
      fy_kN: -10,
      mz_kNm: 0,
    });
  });

  it('emits idCounters from the next*Number fields', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(file.model.idCounters).toEqual({
      nextNodeNumber: 3,
      nextElementNumber: 2,
      nextNodalLoadNumber: 2,
      nextPointLoadNumber: 1,
      nextDistributedLoadNumber: 1,
      nextLineLoadNumber: 1,
    });
  });

  it('omits _comments when every inner record is empty', () => {
    const file = modelStateToFile(makeMinimalState());
    expect(file._comments).toBeUndefined();
  });

  it('emits _comments when at least one inner record is non-empty', () => {
    const state = makeMinimalState();
    state.comments!.nodes['N1'] = 'Fixed support';
    const file = modelStateToFile(state);
    expect(file._comments?.nodes?.['N1']).toBe('Fixed support');
  });
});

describe('fileToStorePatch', () => {
  it('round-trips state → file → patch with byte-equivalent data shape', () => {
    const original = makeMinimalState();
    const file = modelStateToFile(original);
    const patch = fileToStorePatch(file);

    expect(patch.nodes).toEqual(original.nodes);
    expect(patch.elements).toEqual(original.elements);
    expect(patch.loads).toEqual(original.loads);
    expect(patch.loadCases).toEqual(original.loadCases);
    expect(patch.loadCombinations).toEqual(original.loadCombinations);
    expect(patch.activeLoadCase).toBe(original.activeLoadCase);
    expect(patch.activeResultView).toEqual(original.activeResultView);
    expect(patch.nextNodeNumber).toBe(original.nextNodeNumber);
    expect(patch.nextElementNumber).toBe(original.nextElementNumber);
    expect(patch.nextNodalLoadNumber).toBe(original.nextNodalLoadNumber);
    expect(patch.nextPointLoadNumber).toBe(original.nextPointLoadNumber);
    expect(patch.nextDistributedLoadNumber).toBe(original.nextDistributedLoadNumber);
    expect(patch.nextLineLoadNumber).toBe(original.nextLineLoadNumber);
  });
});
