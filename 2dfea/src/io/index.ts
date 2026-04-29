/**
 * Barrel re-export for the save/load JSON module.
 */
export { CURRENT_SCHEMA_VERSION, SchemaVersionError } from './schemaVersion';
export { canonicalStringify } from './canonicalStringify';
export {
  ModelFileV1Schema,
  collectUnknownKeys,
  warnUnknownKeys,
  V1_UNITS,
  type ModelFileV1,
} from './schema';
export {
  MIGRATIONS,
  migrateToCurrent,
  asCurrentVersion,
  type MigrationFn,
  type AnyVersionedModel,
} from './migrations';
export { semanticValidate } from './semanticValidator';
export {
  modelStateToFile,
  fileToStorePatch,
  type SerializableModelState,
  type StorePatch,
  type ModelFileOptions,
} from './canonicalize';
export { applyToStore } from './applyToStore';
export { exportCurrentModelToFile, promptUserForImport } from './exportImport';
// handleImportText is dynamic-imported by promptUserForImport at runtime
// (bundle-size split — plan §7 Phase 9). Tests / non-UI consumers should
// import it directly from `./importPath` to bypass the dynamic import.
