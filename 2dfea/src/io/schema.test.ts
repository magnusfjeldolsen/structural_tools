/**
 * Tests for the v1 Zod schema.
 *
 * Coverage:
 *   - valid fixture parses
 *   - tamper cases each reject with the expected ZodError issue path
 *   - envelope is strict; passthrough layers are NOT strict
 */
import { describe, it, expect } from 'vitest';
import { ModelFileV1Schema } from './schema';
import { makeCantileverV1 } from './__fixtures__/cantileverV1';

describe('ModelFileV1Schema', () => {
  it('parses the canonical cantilever fixture', () => {
    const result = ModelFileV1Schema.safeParse(makeCantileverV1());
    expect(result.success).toBe(true);
  });

  it('rejects when schemaVersion is missing', () => {
    const f: any = makeCantileverV1();
    delete f.schemaVersion;
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['schemaVersion']);
    }
  });

  it('rejects when metadata.units.length is wrong', () => {
    const f: any = makeCantileverV1();
    f.metadata.units.length = 'mm';
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0].path;
      expect(path).toEqual(['metadata', 'units', 'length']);
    }
  });

  it('rejects element with non-string nodeI', () => {
    const f: any = makeCantileverV1();
    f.model.elements[0].nodeI = 123;
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
    if (!result.success) {
      // First issue path should reach into the offending element.
      const path = result.error.issues[0].path;
      expect(path).toEqual(['model', 'elements', 0, 'nodeI']);
    }
  });

  it('rejects NaN in a numeric field via .finite()', () => {
    const f: any = makeCantileverV1();
    f.model.nodes[0].x_m = Number.NaN;
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Path should land on the offending node coordinate.
      const path = result.error.issues[0].path;
      expect(path[0]).toBe('model');
      expect(path[1]).toBe('nodes');
    }
  });

  it('rejects unknown top-level envelope keys', () => {
    const f: any = makeCantileverV1();
    f.garbage = true;
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
  });

  it('rejects wrong schemaVersion literal', () => {
    const f: any = makeCantileverV1();
    f.schemaVersion = '9.9.9';
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(false);
  });

  it('accepts unknown keys on `model` (passthrough)', () => {
    const f: any = makeCantileverV1();
    f.model.materials = []; // Future MINOR addition
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(true);
  });

  it('accepts unknown keys on element entities (passthrough)', () => {
    const f: any = makeCantileverV1();
    f.model.elements[0].sectionRef = 'IPE 200'; // Future MINOR addition
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(true);
  });

  it('accepts unknown loads.* keys via catchall', () => {
    const f: any = makeCantileverV1();
    f.model.loads.thermal = []; // Future MINOR additional load type
    const result = ModelFileV1Schema.safeParse(f);
    expect(result.success).toBe(true);
  });
});
