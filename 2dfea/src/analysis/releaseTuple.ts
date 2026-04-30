/**
 * Pure helper that converts an `Element`'s flat-sibling release flags into
 * the (Rzi, Rzj) tuple consumed by the PyNite analyzer's `def_releases(...)`
 * call.
 *
 * In 2D we only ever touch `Rzi` and `Rzj` — every other DOF in the 12-arg
 * PyNite signature stays rigid. This is the single point in the JS-side
 * codebase that maps the user-facing flags to the analyzer payload contract,
 * so unit tests against this function are a cheap regression guard.
 *
 * See:
 *   - docs/plans/member-end-releases-mz.md §5.8
 *   - https://pynite.readthedocs.io/en/latest/member.html (def_releases signature)
 */
import type { Element } from './types';

/**
 * Returns `[Rzi, Rzj]` — the per-end Mz release flags coerced to booleans.
 * Absent / undefined inputs map to `false` (the rigid default).
 */
export function elementReleaseTuple(el: Element): [boolean, boolean] {
  return [Boolean(el.releaseStartMz), Boolean(el.releaseEndMz)];
}
