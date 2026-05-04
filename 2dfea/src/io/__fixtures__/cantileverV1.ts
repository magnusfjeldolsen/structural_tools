/**
 * Shared test fixture: a small but representative valid v1 file used by
 * schema / semantic / round-trip / forward-compat tests.
 *
 * Lives under `__fixtures__/` so the vitest include glob doesn't try to
 * run it as a test (the glob is `src/**​/*.{test,spec}.{ts,tsx}`).
 *
 * The fixture declares `schemaVersion: '1.1.0'` to match the current
 * `ModelFileV1Schema` literal — `ModelFileV1Schema.safeParse` rejects any
 * other version. Tests that need to verify the migration path should
 * synthesise a v1.0.0-shaped object directly rather than re-routing this
 * helper through `migrateToCurrent`.
 */

import type { ModelFileV1 } from '../schema';

export function makeCantileverV1(): ModelFileV1 {
  return {
    schemaVersion: '1.1.0',
    metadata: {
      appVersion: 'unknown',
      exportedAt: '2026-04-27T15:35:00Z',
      name: 'Cantilever sample',
      description: 'Single 4 m fixed-free beam under tip load',
      author: null,
      units: {
        length: 'm',
        force: 'kN',
        moment: 'kNm',
        stress: 'GPa',
        areaMomentOfInertia: 'm4',
        area: 'm2',
      },
    },
    model: {
      nodes: [
        { name: 'N1', x_m: 0, y_m: 0, support: 'fixed' },
        { name: 'N2', x_m: 4, y_m: 0, support: 'free' },
      ],
      elements: [
        { name: 'E1', nodeI: 'N1', nodeJ: 'N2', E_GPa: 210, I_m4: 1e-4, A_m2: 1e-3 },
      ],
      loads: {
        nodal: [
          { id: 'NL1', node: 'N2', fx_kN: 0, fy_kN: -10, mz_kNm: 0, case: 'Dead' },
        ],
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
      idCounters: {
        nextNodeNumber: 3,
        nextElementNumber: 2,
        nextNodalLoadNumber: 2,
        nextPointLoadNumber: 1,
        nextDistributedLoadNumber: 1,
        nextLineLoadNumber: 1,
      },
    },
  };
}

/**
 * v1.1.0 fixture with `releaseEndMz: true` on the cantilever beam — used by
 * round-trip tests for the new release fields. Identical to
 * `makeCantileverV1()` apart from the released-end flag.
 */
export function makeCantileverV1WithReleasedEnd(): ModelFileV1 {
  const file = makeCantileverV1();
  file.model.elements[0].releaseEndMz = true;
  return file;
}
