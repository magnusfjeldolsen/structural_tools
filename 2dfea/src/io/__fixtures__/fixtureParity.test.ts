/**
 * Sanity test: the canonical fixture committed at
 * `docs/examples/cantilever-v1.json` parses against the v1 schema.
 *
 * Lives under `__fixtures__/` so the include glob can pick it up while
 * keeping it physically next to the shared TS fixture builder.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelFileV1Schema } from '../schema';
import { semanticValidate } from '../semanticValidator';

const __filename = fileURLToPath(import.meta.url);
const fixturesDir = resolve(__filename, '..');

describe('docs/examples/cantilever-v1.json', () => {
  it('parses against the v1 Zod schema with no errors', () => {
    const text = readFileSync(
      resolve(fixturesDir, '../../../docs/examples/cantilever-v1.json'),
      'utf8'
    );
    const parsed = JSON.parse(text);
    const result = ModelFileV1Schema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(
        'Schema parse failed: ' + JSON.stringify(result.error.issues, null, 2)
      );
    }
  });

  it('passes semantic validation with no errors', () => {
    const text = readFileSync(
      resolve(fixturesDir, '../../../docs/examples/cantilever-v1.json'),
      'utf8'
    );
    const parsed = JSON.parse(text);
    const result = ModelFileV1Schema.safeParse(parsed);
    if (!result.success) throw new Error('precondition: schema parse failed');
    expect(semanticValidate(result.data.model)).toEqual([]);
  });
});
