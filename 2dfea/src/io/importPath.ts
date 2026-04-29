/**
 * Heavy import-side validation chain — dynamic-imported from
 * `exportImport.ts#promptUserForImport` to keep the eager bundle small.
 *
 * Pulls in: Zod schema, semantic validator, migrations, applyToStore.
 * Eager use of these would push the main chunk over the bundle-size
 * budget (plan §7 Phase 9, goal #18). The export path stays eager for
 * Ctrl+S responsiveness — only import is lazy, since Ctrl+O already
 * blocks on a file picker dialog.
 *
 * Tests import `handleImportText` directly (they don't go through the
 * lazy entry); this file is therefore plain-static-importable from
 * tests but lazy-imported from runtime UI.
 */

import {
  ModelFileV1Schema,
  warnUnknownKeys,
  type ModelFileV1,
} from './schema';
import { semanticValidate } from './semanticValidator';
import { migrateToCurrent, type AnyVersionedModel } from './migrations';
import { SchemaVersionError } from './schemaVersion';
import { applyToStore } from './applyToStore';
import { showToast } from '../store/useToastStore';

/**
 * Validate, migrate, and apply a parsed JSON text to the store. See
 * docs/plans/save-load-json.md §5.9 / Phase 5 for the full chain.
 */
export async function handleImportText(text: string): Promise<void> {
  // 1. JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    showToast({
      kind: 'error',
      message: `Could not parse file: ${(err as Error).message}`,
    });
    return;
  }

  // 2. schemaVersion is a string
  const version = (parsed as { schemaVersion?: unknown })?.schemaVersion;
  if (typeof version !== 'string') {
    showToast({
      kind: 'error',
      message: 'File is missing schemaVersion or it is not a string.',
    });
    return;
  }

  // 3. migrate
  let migrated: AnyVersionedModel;
  try {
    migrated = migrateToCurrent(parsed as AnyVersionedModel);
  } catch (err) {
    if (err instanceof SchemaVersionError) {
      showToast({
        kind: 'error',
        message: `Unsupported schema version "${err.receivedVersion}". This file was created by a newer version of 2dfea — please update.`,
      });
    } else {
      showToast({
        kind: 'error',
        message: `Migration failed: ${(err as Error).message}`,
      });
    }
    return;
  }

  // 4. Zod parse
  const result = ModelFileV1Schema.safeParse(migrated);
  if (!result.success) {
    const issues = result.error.issues;
    const first = issues[0];
    const path = first.path.join('.');
    showToast({
      kind: 'error',
      message: `Invalid model file: ${path ? path + ' — ' : ''}${first.message}`,
    });
    console.warn('[Import] Zod validation errors:', issues);
    return;
  }

  // 5. semantic validate
  const semantic = semanticValidate(result.data.model);
  if (semantic.length > 0) {
    showToast({
      kind: 'error',
      message: `Model is structurally invalid: ${semantic[0]}${
        semantic.length > 1 ? ` (and ${semantic.length - 1} more — see console)` : ''
      }`,
    });
    console.warn('[Import] Semantic validation errors:', semantic);
    return;
  }

  // 6. emit unknown-keys diagnostic before mutating
  warnUnknownKeys(result.data as ModelFileV1);

  // 7. apply
  applyToStore(result.data as ModelFileV1);
  console.log(
    `[Import] Validation succeeded; applied ${result.data.model.nodes.length} nodes, ${result.data.model.elements.length} elements, ${result.data.model.loads.nodal.length + result.data.model.loads.distributed.length + result.data.model.loads.elementPoint.length} loads.`
  );
  showToast({ kind: 'info', message: 'Model imported successfully.' });
}
