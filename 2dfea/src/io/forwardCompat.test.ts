/**
 * Forward-compatibility contract test.
 *
 * Verifies the §5.3 forward-compat policy of the save/load JSON plan. A v1
 * reader given a hypothetical-future-MINOR-bumped fixture must:
 *
 *   1. Parse it successfully (passthrough at each extensible layer).
 *   2. Emit exactly one console.warn per unknown key (deduplicated).
 *   3. applyToStore must succeed (unknown fields are silently dropped from
 *      the runtime store — there is nowhere to put them).
 *   4. A subsequent re-export must NOT include the unknown fields.
 *      Unknown fields are NOT preserved through round-trip; they are only
 *      ignored on import. A reader of the future MINOR would preserve them.
 *
 * In v1.1.0 (member-end-releases), `releaseStartMz` and `releaseEndMz` are
 * promoted from "unknown" to "known" element fields. The forward-compat
 * fixture below therefore uses fields still unknown to v1.1.0 (sectionRef,
 * materialRef, plate buckling, thermal loads, future ID counter) — these
 * stand in for any v1.2.0+ MINOR additions.
 *
 * A second test exercises the v1.0.0-reader-on-v1.1.0-file scenario: a
 * v1.0.0 reader (which we simulate by stripping the post-1.0.0 known keys
 * from the recognized set) silently passes through `releaseEndMz` rather
 * than rejecting it. The end-to-end import path also covers this via
 * `migrateToCurrent` then `safeParse`, but here we want the per-key
 * passthrough contract demonstrated in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelFileV1Schema, collectUnknownKeys, warnUnknownKeys } from './schema';
import { applyToStore } from './applyToStore';
import { modelStateToFile, fileToStorePatch } from './canonicalize';
import { useModelStore } from '../store/useModelStore';
import {
  makeCantileverV1,
  makeCantileverV1WithReleasedEnd,
} from './__fixtures__/cantileverV1';

/**
 * Build a fixture with fields still unknown to v1.1.0 — stand-ins for any
 * future MINOR additions. None of these fields collide with v1.1.0 known
 * keys (`releaseStartMz`, `releaseEndMz`).
 */
function makeFutureMinorFixture(): any {
  const base: any = makeCantileverV1();
  base.model.elements[0].sectionRef = 'IPE 200';
  base.model.elements[0].materialRef = 'S275';
  base.model.elements[0].plateBuckling = { class: 3 };
  base.model.loads.thermal = [
    { id: 'TL1', element: 'E1', deltaT_C: 10 },
  ];
  base.model.idCounters.nextSectionRefNumber = 2;
  return base;
}

describe('Forward compatibility (v1.1.0 reader on future-MINOR fixture)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('parses successfully — passthrough at every extensible layer', () => {
    const result = ModelFileV1Schema.safeParse(makeFutureMinorFixture());
    expect(result.success).toBe(true);
  });

  it('collectUnknownKeys lists every unknown key (deduped, sorted)', () => {
    const fixture = makeFutureMinorFixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');
    const keys = collectUnknownKeys(result.data);

    expect(keys).toContain('model.elements[].sectionRef');
    expect(keys).toContain('model.elements[].materialRef');
    expect(keys).toContain('model.elements[].plateBuckling');
    expect(keys).toContain('model.loads.thermal');
    expect(keys).toContain('model.idCounters.nextSectionRefNumber');
  });

  it('warnUnknownKeys emits exactly one console.warn (deduplicated)', () => {
    const fixture = makeFutureMinorFixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');
    warnUnknownKeys(result.data);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('applyToStore succeeds and the model loads', () => {
    const fixture = makeFutureMinorFixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');

    applyToStore(result.data);

    const state = useModelStore.getState();
    expect(state.nodes.length).toBe(2);
    expect(state.elements.length).toBe(1);
    expect(state.elements[0].name).toBe('E1');
  });

  it('re-export does NOT include the unknown fields (drop-on-round-trip)', () => {
    // Unknown fields are NOT preserved through round-trip; they are only
    // ignored on import. A reader of the future MINOR would preserve them.
    const fixture = makeFutureMinorFixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');

    applyToStore(result.data);
    const reexported = modelStateToFile(useModelStore.getState());

    // Element no longer carries sectionRef / materialRef / plateBuckling.
    expect((reexported.model.elements[0] as any).sectionRef).toBeUndefined();
    expect((reexported.model.elements[0] as any).materialRef).toBeUndefined();
    expect((reexported.model.elements[0] as any).plateBuckling).toBeUndefined();

    // loads.thermal is gone from the re-export.
    expect((reexported.model.loads as any).thermal).toBeUndefined();

    // idCounters.nextSectionRefNumber is gone.
    expect(
      (reexported.model.idCounters as any).nextSectionRefNumber
    ).toBeUndefined();
  });
});

describe('v1.0.0 reader given a v1.1.0 file (release fields silently ignored)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  /**
   * Simulates a v1.0.0 reader's known-element-key set (no `releaseStartMz` /
   * `releaseEndMz`). We use this set to assert that a v1.0.0 reader would
   * have classified the new fields as unknown — exactly as it would have
   * classified any other forward-compat field.
   */
  const V1_0_0_KNOWN_ELEMENT_KEYS = new Set([
    'name',
    'nodeI',
    'nodeJ',
    'E_GPa',
    'I_m4',
    'A_m2',
  ]);

  it('Element schema (passthrough) accepts releaseEndMz on a v1.1.0 file', () => {
    const fixture = makeCantileverV1WithReleasedEnd();
    const result = ModelFileV1Schema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('a v1.0.0 reader (simulated) would classify releaseEndMz as unknown', () => {
    // Synthesise a v1.0.0 reader's perspective: replay the unknown-keys walk
    // against the v1.1.0 fixture but with the v1.0.0 known-element-keys set.
    const fixture = makeCantileverV1WithReleasedEnd();
    const el = fixture.model.elements[0] as Record<string, unknown>;
    const elementUnknowns = Object.keys(el).filter(
      (k) => !V1_0_0_KNOWN_ELEMENT_KEYS.has(k)
    );
    expect(elementUnknowns).toContain('releaseEndMz');
  });

  it('releaseEndMz round-trips losslessly through canonicalize → parse → patch', () => {
    const fixture = makeCantileverV1WithReleasedEnd();
    const result = ModelFileV1Schema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const patch = fileToStorePatch(result.data);
    expect(patch.elements[0].releaseEndMz).toBe(true);
    expect(patch.elements[0].releaseStartMz).toBeUndefined();

    // Now build a state from the patch and re-export — the released-end
    // flag must survive round-trip.
    const reexported = modelStateToFile(
      {
        ...patch,
        comments: patch.comments,
      },
      { exportedAt: '2026-01-01T00:00:00Z' }
    );
    expect(reexported.model.elements[0].releaseEndMz).toBe(true);
    expect((reexported.model.elements[0] as any).releaseStartMz).toBeUndefined();
  });

  it('rigid elements omit both release fields on canonicalize', () => {
    // A default-rigid element (both flags absent) must produce a canonical
    // output that omits the new fields entirely — keeping default-rigid
    // files byte-clean.
    const fixture = makeCantileverV1();
    const result = ModelFileV1Schema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const patch = fileToStorePatch(result.data);
    const reexported = modelStateToFile(
      {
        ...patch,
        comments: patch.comments,
      },
      { exportedAt: '2026-01-01T00:00:00Z' }
    );
    expect('releaseStartMz' in reexported.model.elements[0]).toBe(false);
    expect('releaseEndMz' in reexported.model.elements[0]).toBe(false);
  });
});
