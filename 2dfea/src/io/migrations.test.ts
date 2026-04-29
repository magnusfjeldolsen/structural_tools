/**
 * Tests for the migration registry. v1.0.0 has only the identity migration;
 * the registry plumbing is what we exercise.
 */
import { describe, it, expect } from 'vitest';
import { migrateToCurrent, MIGRATIONS } from './migrations';
import { SchemaVersionError, CURRENT_SCHEMA_VERSION } from './schemaVersion';
import { makeCantileverV1 } from './__fixtures__/cantileverV1';

describe('migrateToCurrent', () => {
  it('returns input unchanged for the current schema version (identity)', () => {
    const fixture = makeCantileverV1();
    const out = migrateToCurrent(fixture);
    expect(out).toBe(fixture); // identity returns same reference
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('throws SchemaVersionError for an unknown future version', () => {
    expect(() =>
      migrateToCurrent({
        schemaVersion: '9.9.9',
        metadata: {},
        model: {},
      } as any)
    ).toThrow(SchemaVersionError);
  });

  it('SchemaVersionError carries receivedVersion', () => {
    try {
      migrateToCurrent({
        schemaVersion: '9.9.9',
        metadata: {},
        model: {},
      } as any);
      throw new Error('did not throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaVersionError);
      expect((err as SchemaVersionError).receivedVersion).toBe('9.9.9');
    }
  });

  it('walks a multi-step migration chain', () => {
    // Locally register a hypothetical 0.9.0 → 1.0.0 step for the duration
    // of this test only. (Real future migrations live in MIGRATIONS proper.)
    const original = MIGRATIONS['0.9.0'];
    MIGRATIONS['0.9.0'] = (input) => ({ ...input, schemaVersion: '1.0.0' });
    try {
      const out = migrateToCurrent({ schemaVersion: '0.9.0' } as any);
      expect(out.schemaVersion).toBe('1.0.0');
    } finally {
      if (original === undefined) {
        delete MIGRATIONS['0.9.0'];
      } else {
        MIGRATIONS['0.9.0'] = original;
      }
    }
  });
});
