/**
 * Tests for canonicalStringify — deterministic JSON serialization.
 *
 * This file also acts as the sanity-check that establishes the Vitest
 * convention: tests live next to source as `<name>.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { canonicalStringify } from './canonicalStringify';

describe('canonicalStringify', () => {
  it('sorts top-level object keys alphabetically', () => {
    const out = canonicalStringify({ b: 1, a: 2 }, 0);
    // No indent → newline at EOF only.
    expect(out).toBe('{"a":2,"b":1}\n');
  });

  it('sorts nested object keys alphabetically', () => {
    const out = canonicalStringify({ z: { c: 3, a: 1, b: 2 }, a: 0 }, 0);
    expect(out).toBe('{"a":0,"z":{"a":1,"b":2,"c":3}}\n');
  });

  it('preserves array order (insertion is meaningful)', () => {
    const out = canonicalStringify({ arr: [3, 1, 2] }, 0);
    expect(out).toBe('{"arr":[3,1,2]}\n');
  });

  it('handles arrays of objects with sorted keys per element', () => {
    const out = canonicalStringify({ arr: [{ b: 1, a: 2 }, { d: 3, c: 4 }] }, 0);
    expect(out).toBe('{"arr":[{"a":2,"b":1},{"c":4,"d":3}]}\n');
  });

  it('uses 2-space indent by default and ends with newline', () => {
    const out = canonicalStringify({ a: 1, b: 2 });
    expect(out).toBe('{\n  "a": 1,\n  "b": 2\n}\n');
  });

  it('omits undefined values (default JSON.stringify behaviour)', () => {
    const out = canonicalStringify({ a: 1, b: undefined, c: 3 }, 0);
    expect(out).toBe('{"a":1,"c":3}\n');
  });

  it('emits null explicitly', () => {
    const out = canonicalStringify({ a: null }, 0);
    expect(out).toBe('{"a":null}\n');
  });

  it('round-trips parse-stringify byte-identically', () => {
    const original = canonicalStringify({ z: 1, a: { c: 2, b: 3 }, m: [1, 2, 3] });
    const reparsed = JSON.parse(original);
    const reserialised = canonicalStringify(reparsed);
    expect(reserialised).toBe(original);
  });
});
