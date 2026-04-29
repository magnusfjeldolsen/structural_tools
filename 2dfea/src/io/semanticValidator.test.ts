/**
 * Tests for cross-entity semantic validation.
 */
import { describe, it, expect } from 'vitest';
import { semanticValidate } from './semanticValidator';
import { makeCantileverV1 } from './__fixtures__/cantileverV1';

describe('semanticValidate', () => {
  it('returns no errors for the valid cantilever fixture', () => {
    const errors = semanticValidate(makeCantileverV1().model);
    expect(errors).toEqual([]);
  });

  it('detects orphan element nodeI', () => {
    const f = makeCantileverV1();
    f.model.elements[0].nodeI = 'N99';
    const errors = semanticValidate(f.model);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/Element E1 references missing node "N99"/);
  });

  it('detects orphan element nodeJ', () => {
    const f = makeCantileverV1();
    f.model.elements[0].nodeJ = 'N99';
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /references missing node "N99"/.test(e))).toBe(true);
  });

  it('detects orphan distributed-load element ref', () => {
    const f = makeCantileverV1();
    f.model.loads.distributed.push({
      id: 'DL1',
      element: 'E99',
      direction: 'Fy',
      w1_kN_per_m: -1,
      w2_kN_per_m: -1,
      x1_m: 0,
      x2_m: 1,
    });
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /Distributed load DL1.*missing element "E99"/.test(e))).toBe(
      true
    );
  });

  it('detects combination factor referencing missing case', () => {
    const f = makeCantileverV1();
    f.model.loadCombinations.push({
      name: 'ULS',
      factors: { Dead: 1.35, Phantom: 1.5 },
    });
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /Combination ULS.*missing case "Phantom"/.test(e))).toBe(
      true
    );
  });

  it('detects activeLoadCase pointing at missing case', () => {
    const f = makeCantileverV1();
    f.model.activeLoadCase = 'Phantom';
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /activeLoadCase "Phantom" not in loadCases/.test(e))).toBe(
      true
    );
  });

  it('allows null activeLoadCase / null activeResultView.name', () => {
    const f = makeCantileverV1();
    f.model.activeLoadCase = null;
    f.model.activeResultView = { type: 'combination', name: null };
    expect(semanticValidate(f.model)).toEqual([]);
  });

  it('detects activeResultView pointing at missing combination', () => {
    const f = makeCantileverV1();
    f.model.activeResultView = { type: 'combination', name: 'Phantom' };
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /activeResultView combination\/"Phantom"/.test(e))).toBe(
      true
    );
  });

  it('detects duplicate nodal-load IDs', () => {
    const f = makeCantileverV1();
    f.model.loads.nodal.push({
      id: 'NL1', // duplicate of existing NL1
      node: 'N2',
      fx_kN: 0,
      fy_kN: -5,
      mz_kNm: 0,
    });
    const errors = semanticValidate(f.model);
    expect(errors.some((e) => /Duplicate nodal load id "NL1"/.test(e))).toBe(true);
  });
});
