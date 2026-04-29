/**
 * Shared test fixture: a small but representative valid v1 file used by
 * schema / semantic / round-trip / forward-compat tests.
 *
 * Lives under `__fixtures__/` so the vitest include glob doesn't try to
 * run it as a test (the glob is `src/**​/*.{test,spec}.{ts,tsx}`).
 */

import type { ModelFileV1 } from '../schema';

export function makeCantileverV1(): ModelFileV1 {
  return {
    schemaVersion: '1.0.0',
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
