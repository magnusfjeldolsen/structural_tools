/**
 * Round-trip determinism — the load-bearing test for save/load JSON.
 *
 * Contract: import → export → import → export yields a byte-identical
 * second export, after masking `metadata.exportedAt`. If this test fails,
 * the canonical serializer has regressed; debug `canonicalStringify` first.
 *
 * The fixture exercises non-default ID counters, comments, and a load
 * combination — all the round-trip-sensitive fields.
 */
import { describe, it, expect } from 'vitest';
import { canonicalStringify } from './canonicalStringify';
import { modelStateToFile, fileToStorePatch } from './canonicalize';
import type { SerializableModelState } from './canonicalize';
import { ModelFileV1Schema } from './schema';
import { semanticValidate } from './semanticValidator';

const STABLE_TS = '2026-01-01T00:00:00.000Z';

/** A non-trivial model: 5 nodes, 4 elements, 3 load types, 2 cases, 1 combo. */
function makeBiggerFixture(): SerializableModelState {
  return {
    nodes: [
      { name: 'N1', x: 0, y: 0, support: 'fixed' },
      { name: 'N2', x: 4, y: 0, support: 'free' },
      { name: 'N3', x: 4, y: 3, support: 'free' },
      { name: 'N4', x: 0, y: 3, support: 'pinned' },
      { name: 'N5', x: 8, y: 0, support: 'roller-x' },
    ],
    elements: [
      { name: 'E1', nodeI: 'N1', nodeJ: 'N2', E: 210, I: 1e-4, A: 1e-3 },
      { name: 'E2', nodeI: 'N2', nodeJ: 'N3', E: 210, I: 1e-4, A: 1e-3 },
      { name: 'E3', nodeI: 'N3', nodeJ: 'N4', E: 210, I: 1e-4, A: 1e-3 },
      { name: 'E4', nodeI: 'N2', nodeJ: 'N5', E: 210, I: 2e-4, A: 1.5e-3 },
    ],
    loads: {
      nodal: [
        { id: 'NL1', node: 'N3', fx: 0, fy: -10, mz: 0, case: 'Dead' },
        { id: 'NL2', node: 'N5', fx: 5, fy: 0, mz: 0, case: 'Live' },
      ],
      distributed: [
        {
          id: 'DL1',
          element: 'E2',
          direction: 'Fy',
          w1: -2,
          w2: -3,
          x1: 0,
          x2: 3,
          case: 'Dead',
        },
      ],
      elementPoint: [
        {
          id: 'PL1',
          element: 'E1',
          distance: 2,
          direction: 'Fy',
          magnitude: -5,
          case: 'Live',
        },
      ],
    },
    loadCases: [
      { name: 'Dead', description: 'Dead loads' },
      { name: 'Live', description: 'Live loads' },
    ],
    loadCombinations: [
      { name: 'ULS', description: '1.35D + 1.5L', factors: { Dead: 1.35, Live: 1.5 } },
    ],
    activeLoadCase: 'Dead',
    activeResultView: { type: 'combination', name: 'ULS' },
    nextNodeNumber: 99, // intentionally far from the highest used number
    nextElementNumber: 50,
    nextNodalLoadNumber: 3,
    nextPointLoadNumber: 2,
    nextDistributedLoadNumber: 2,
    nextLineLoadNumber: 1,
    comments: {
      nodes: { N1: 'Fixed at base', N5: 'Roller-x' },
      elements: { E2: 'Top chord' },
      loads: { NL1: 'Tip dead load' },
      loadCases: {},
      loadCombinations: {},
    },
  };
}

/** Mask the timestamp so two exports taken at different real times compare equal. */
function maskTimestamp(json: string): string {
  return json.replace(
    /"exportedAt":\s*"[^"]+"/,
    `"exportedAt": "${STABLE_TS}"`
  );
}

describe('round-trip determinism', () => {
  it('export → parse-as-patch → re-export is byte-identical (after timestamp mask)', () => {
    const original = makeBiggerFixture();

    const fileA = modelStateToFile(original, { exportedAt: STABLE_TS });
    const jsonA = canonicalStringify(fileA);

    // Validate (sanity)
    const parseA = ModelFileV1Schema.safeParse(JSON.parse(jsonA));
    expect(parseA.success).toBe(true);
    if (!parseA.success) return;

    expect(semanticValidate(parseA.data.model)).toEqual([]);

    // Round-trip via the patch helper — simulates applyToStore without
    // touching the live Zustand store.
    const patch = fileToStorePatch(parseA.data);

    // Reconstruct a SerializableModelState from the patch.
    const rebuilt: SerializableModelState = {
      ...patch,
      comments: patch.comments,
    };

    const fileB = modelStateToFile(rebuilt, { exportedAt: STABLE_TS });
    const jsonB = canonicalStringify(fileB);

    expect(maskTimestamp(jsonB)).toBe(maskTimestamp(jsonA));
  });

  it('preserves non-default idCounters across round-trip', () => {
    const original = makeBiggerFixture();
    const file = modelStateToFile(original, { exportedAt: STABLE_TS });
    const patch = fileToStorePatch(file);
    expect(patch.nextNodeNumber).toBe(99);
    expect(patch.nextElementNumber).toBe(50);
  });

  it('preserves comments across round-trip', () => {
    const original = makeBiggerFixture();
    const file = modelStateToFile(original, { exportedAt: STABLE_TS });
    const patch = fileToStorePatch(file);
    expect(patch.comments.nodes['N1']).toBe('Fixed at base');
    expect(patch.comments.elements['E2']).toBe('Top chord');
    expect(patch.comments.loads['NL1']).toBe('Tip dead load');
  });

  it('preserves load-combination factors across round-trip', () => {
    const original = makeBiggerFixture();
    const file = modelStateToFile(original, { exportedAt: STABLE_TS });
    const patch = fileToStorePatch(file);
    expect(patch.loadCombinations).toEqual([
      { name: 'ULS', description: '1.35D + 1.5L', factors: { Dead: 1.35, Live: 1.5 } },
    ]);
  });

  it('preserves activeResultView across round-trip', () => {
    const original = makeBiggerFixture();
    const file = modelStateToFile(original, { exportedAt: STABLE_TS });
    const patch = fileToStorePatch(file);
    expect(patch.activeResultView).toEqual({ type: 'combination', name: 'ULS' });
  });
});
