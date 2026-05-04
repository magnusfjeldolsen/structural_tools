/**
 * Migration registry for cross-MAJOR/MINOR schemaVersion upgrades.
 *
 * v1.0.0 ships with the identity migration only. Real migrations are added
 * here when v2.0.0 lands.
 *
 * Adding a migration:
 *   MIGRATIONS['1.0.0'] = (input) => ({ ...input, schemaVersion: '2.0.0', ... });
 *
 * The migrate loop walks the chain until the file's `schemaVersion` matches
 * `CURRENT_SCHEMA_VERSION`. If at any point no migration is registered for
 * the encountered version, a `SchemaVersionError` is thrown carrying the
 * received version — the import path catches and shows the unsupported-version
 * toast.
 *
 * See docs/plans/save-load-json.md §5.6.
 */

import type { ModelFileV1 } from './schema';
import { CURRENT_SCHEMA_VERSION, SchemaVersionError } from './schemaVersion';

/**
 * Loose shape used during migration — every migration step works on
 * `{ schemaVersion, ... }` and the loop short-circuits when it reaches the
 * current version. Strong typing kicks in only after the final Zod parse.
 */
export interface AnyVersionedModel {
  schemaVersion: string;
  metadata?: unknown;
  model?: unknown;
  _comments?: unknown;
  [k: string]: unknown;
}

export type MigrationFn = (input: AnyVersionedModel) => AnyVersionedModel;

/**
 * Registry: `fromVersion → migrationFn` returning the next-version's shape.
 * Each entry returns the same input with a bumped `schemaVersion` (and any
 * structural transform required for the bump). The current version's own
 * identity entry terminates the loop.
 *
 * v1.0.0 → v1.1.0: identity migration. v1.1.0 adds two optional element
 * fields (`releaseStartMz`, `releaseEndMz`); absent = rigid, so v1.0.0
 * files load with the rigid default automatically. Only the version stamp
 * needs to change. See docs/plans/member-end-releases-mz.md §5.9.
 */
export const MIGRATIONS: Record<string, MigrationFn> = {
  '1.0.0': (input) => ({ ...input, schemaVersion: '1.1.0' }),
  '1.1.0': (input) => input,
};

/**
 * Walk the chain from `input.schemaVersion` to CURRENT_SCHEMA_VERSION,
 * applying each registered migration in turn.
 *
 * Throws `SchemaVersionError` if no migration is registered for an
 * encountered version (typically: the file is from a future version
 * the running app doesn't know about).
 */
export function migrateToCurrent(input: AnyVersionedModel): AnyVersionedModel {
  let current = input;
  let safety = 32; // hard upper bound on migration-chain length
  while (current.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    if (safety-- <= 0) {
      throw new Error(
        `Migration chain exceeded safety bound — likely a cycle in MIGRATIONS.`
      );
    }
    const fn = MIGRATIONS[current.schemaVersion];
    if (!fn) {
      throw new SchemaVersionError(
        `Unsupported schema version "${current.schemaVersion}".`,
        current.schemaVersion
      );
    }
    current = fn(current);
  }
  return current;
}

/**
 * Type-narrowing helper used by the import path post-migration. The shape
 * returned from `migrateToCurrent` is loose; this cast asserts the file
 * satisfies the v1 schema. Always validate with `ModelFileV1Schema.safeParse`
 * after calling — this cast is unsafe by design.
 */
export function asCurrentVersion(input: AnyVersionedModel): ModelFileV1 {
  return input as unknown as ModelFileV1;
}
