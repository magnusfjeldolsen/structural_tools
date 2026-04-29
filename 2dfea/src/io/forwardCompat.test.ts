/**
 * Forward-compatibility contract test.
 *
 * Verifies the §5.3 forward-compat policy of the save/load JSON plan,
 * locked in at master commit b7731ac. A v1 reader given a hypothetical
 * v1.1.0-shaped fixture must:
 *
 *   1. Parse it successfully (passthrough at each extensible layer).
 *   2. Emit exactly one console.warn per unknown key (deduplicated).
 *   3. applyToStore must succeed (unknown fields are silently dropped from
 *      the runtime store — there is nowhere in v1 to put them).
 *   4. A subsequent re-export must NOT include the unknown fields.
 *      Unknown fields are NOT preserved through v1 round-trip; they are only
 *      ignored on import. A v1.1.0 reader would preserve them. This is the
 *      correct trade-off for v1 — there is nowhere in the v1 runtime store
 *      to put them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelFileV1Schema, collectUnknownKeys, warnUnknownKeys } from './schema';
import { applyToStore } from './applyToStore';
import { modelStateToFile } from './canonicalize';
import { useModelStore } from '../store/useModelStore';
import { makeCantileverV1 } from './__fixtures__/cantileverV1';

/** Build a v1.1.0-flavoured fixture with extra MINOR-bump fields. */
function makeV1_1_0_Fixture(): any {
  const base: any = makeCantileverV1();
  base.model.elements[0].sectionRef = 'IPE 200';
  base.model.elements[0].materialRef = 'S275';
  base.model.elements[0].releases = {
    nodeI: { Mz: false },
    nodeJ: { Mz: true },
  };
  base.model.loads.thermal = [
    { id: 'TL1', element: 'E1', deltaT_C: 10 },
  ];
  base.model.idCounters.nextSectionRefNumber = 2;
  return base;
}

describe('Forward compatibility (v1 reader on v1.1.0-shaped fixture)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('parses successfully — passthrough at every extensible layer', () => {
    const result = ModelFileV1Schema.safeParse(makeV1_1_0_Fixture());
    expect(result.success).toBe(true);
  });

  it('collectUnknownKeys lists every unknown key (deduped, sorted)', () => {
    const fixture = makeV1_1_0_Fixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');
    const keys = collectUnknownKeys(result.data);

    expect(keys).toContain('model.elements[].sectionRef');
    expect(keys).toContain('model.elements[].materialRef');
    expect(keys).toContain('model.elements[].releases');
    expect(keys).toContain('model.loads.thermal');
    expect(keys).toContain('model.idCounters.nextSectionRefNumber');
  });

  it('warnUnknownKeys emits exactly one console.warn (deduplicated)', () => {
    const fixture = makeV1_1_0_Fixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');
    warnUnknownKeys(result.data);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('applyToStore succeeds and the model loads', () => {
    const fixture = makeV1_1_0_Fixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');

    applyToStore(result.data);

    const state = useModelStore.getState();
    expect(state.nodes.length).toBe(2);
    expect(state.elements.length).toBe(1);
    expect(state.elements[0].name).toBe('E1');
  });

  it('re-export does NOT include the unknown fields (drop-on-round-trip in v1)', () => {
    // Unknown fields are NOT preserved through v1 round-trip; they are only
    // ignored on import. A v1.1.0 reader would preserve them. This is the
    // correct trade-off for v1 — there is nowhere in the v1 runtime store
    // to put them.
    const fixture = makeV1_1_0_Fixture();
    const result = ModelFileV1Schema.safeParse(fixture);
    if (!result.success) throw new Error('precondition: parse must succeed');

    applyToStore(result.data);
    const reexported = modelStateToFile(useModelStore.getState());

    // Element no longer carries sectionRef / materialRef / releases.
    expect((reexported.model.elements[0] as any).sectionRef).toBeUndefined();
    expect((reexported.model.elements[0] as any).materialRef).toBeUndefined();
    expect((reexported.model.elements[0] as any).releases).toBeUndefined();

    // loads.thermal is gone from the re-export.
    expect((reexported.model.loads as any).thermal).toBeUndefined();

    // idCounters.nextSectionRefNumber is gone.
    expect(
      (reexported.model.idCounters as any).nextSectionRefNumber
    ).toBeUndefined();
  });
});
