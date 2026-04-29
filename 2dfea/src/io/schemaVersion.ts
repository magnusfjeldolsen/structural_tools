/**
 * Save / load JSON — schema-version constant + dedicated error class.
 *
 * The single source of truth for the file format's version string. Bumping
 * this constant requires either:
 *   - registering a migration entry (MAJOR or MINOR — see migrations.ts), or
 *   - documenting the change as PATCH in docs/file-format.md.
 *
 * SemVer policy is documented in docs/plans/save-load-json.md §5.3.
 */

export const CURRENT_SCHEMA_VERSION = '1.0.0' as const;
export type CurrentSchemaVersion = typeof CURRENT_SCHEMA_VERSION;

/**
 * v1 unit policy — locked. Lives here (not in schema.ts) so the export
 * path can use the canonical values without pulling Zod into the eager
 * bundle. The Zod schema mirrors these via z.literal() in schema.ts.
 *
 * Future versions MAY allow user-selected units; v1 is unit-fixed.
 */
export const V1_UNITS = {
  length: 'm',
  force: 'kN',
  moment: 'kNm',
  stress: 'GPa',
  areaMomentOfInertia: 'm4',
  area: 'm2',
} as const;

/**
 * Thrown when an imported file declares a `schemaVersion` that the running
 * app doesn't know how to migrate to `CURRENT_SCHEMA_VERSION`. Carries the
 * received version so the toast handler can surface it to the user.
 */
export class SchemaVersionError extends Error {
  public readonly receivedVersion: string;

  constructor(message: string, receivedVersion: string) {
    super(message);
    this.name = 'SchemaVersionError';
    this.receivedVersion = receivedVersion;
  }
}
