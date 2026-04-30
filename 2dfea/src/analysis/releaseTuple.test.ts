/**
 * Unit tests for `elementReleaseTuple` — the JS-side mapping from
 * `Element.releaseStartMz` / `Element.releaseEndMz` to the (Rzi, Rzj) pair
 * consumed by the analyzer.
 *
 * See docs/plans/member-end-releases-mz.md §8 (Vitest cases).
 */
import { describe, it, expect } from 'vitest';
import type { Element } from './types';
import { elementReleaseTuple } from './releaseTuple';

function makeElement(partial: Partial<Element> = {}): Element {
  return {
    name: 'E1',
    nodeI: 'N1',
    nodeJ: 'N2',
    E: 210,
    I: 1e-4,
    A: 1e-3,
    ...partial,
  };
}

describe('elementReleaseTuple', () => {
  it('returns [false, false] when both flags are absent (rigid default)', () => {
    expect(elementReleaseTuple(makeElement())).toEqual([false, false]);
  });

  it('returns [true, false] when only the start (i-end) is released', () => {
    expect(
      elementReleaseTuple(makeElement({ releaseStartMz: true }))
    ).toEqual([true, false]);
  });

  it('returns [false, true] when only the end (j-end) is released', () => {
    expect(
      elementReleaseTuple(makeElement({ releaseEndMz: true }))
    ).toEqual([false, true]);
  });

  it('returns [true, true] when both ends are released (truss / SS-beam case)', () => {
    expect(
      elementReleaseTuple(
        makeElement({ releaseStartMz: true, releaseEndMz: true })
      )
    ).toEqual([true, true]);
  });

  it('coerces explicit `false` flags to false (no-op vs absent)', () => {
    expect(
      elementReleaseTuple(
        makeElement({ releaseStartMz: false, releaseEndMz: false })
      )
    ).toEqual([false, false]);
  });
});
