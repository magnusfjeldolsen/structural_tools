/**
 * High-level glue for save/load JSON. The store-touching helpers and DOM
 * helpers live here together so the rest of the codebase only imports
 * `exportCurrentModelToFile()` / `promptUserForImport()`.
 *
 * Validation chain (import path):
 *   1. JSON.parse — surface "Could not parse file"
 *   2. version-check — schemaVersion is a string
 *   3. migrateToCurrent — version-mismatch → SchemaVersionError → toast
 *   4. ModelFileV1Schema.safeParse — toast first ZodError, console.warn full
 *   5. semanticValidate — toast first issue, console.warn full
 *   6. applyToStore (which clears temporal history)
 *   7. success toast
 *
 * Export path:
 *   1. read store
 *   2. modelStateToFile
 *   3. canonicalStringify
 *   4. anchor-download (universal browser support)
 */

import { useModelStore } from '../store/useModelStore';
import { canonicalStringify } from './canonicalStringify';
import { modelStateToFile } from './canonicalize';
import { applyToStore } from './applyToStore';
import {
  ModelFileV1Schema,
  warnUnknownKeys,
  type ModelFileV1,
} from './schema';
import { semanticValidate } from './semanticValidator';
import {
  migrateToCurrent,
  type AnyVersionedModel,
} from './migrations';
import { SchemaVersionError } from './schemaVersion';
import { showToast } from '../store/useToastStore';

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

/**
 * Build a download-friendly filename: `2dfea-model-<YYYYMMDDTHHMM>.json`.
 * Colons are stripped (Windows doesn't allow them in filenames).
 */
function buildExportFilename(now: Date = new Date()): string {
  // 2026-04-27T15:35:00.000Z → 20260427T1535
  const iso = now.toISOString();
  const compact = iso.replace(/[:.-]/g, '').slice(0, 13); // 20260427T1535
  return `2dfea-model-${compact}.json`;
}

/**
 * Trigger a browser download via a transient anchor element. The blob URL
 * is revoked after a short delay to let the browser pick up the download.
 */
function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so async download triggers can still pick up the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export the live model to a downloaded `.json` file. Names the file
 * `2dfea-model-<timestamp>.json`. Writes pretty-printed, sorted-key JSON
 * with a trailing newline (canonicalStringify contract).
 *
 * Uses the universally supported anchor-download pattern (works in Firefox;
 * the File System Access API is Chromium-only).
 */
export async function exportCurrentModelToFile(): Promise<void> {
  const state = useModelStore.getState();
  const file = modelStateToFile(state as any);
  const json = canonicalStringify(file, 2);
  const filename = buildExportFilename();
  downloadJsonFile(filename, json);
  console.log(
    `[Export] Model exported as ${filename} (size: ${(json.length / 1024).toFixed(
      1
    )} KB, schemaVersion: ${file.schemaVersion})`
  );
  showToast({ kind: 'info', message: `Exported ${filename}` });
}

// ----------------------------------------------------------------------------
// Import
// ----------------------------------------------------------------------------

/** Open a hidden file picker; resolve with the selected file's text or null. */
function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve(text);
      } catch (err) {
        console.warn('[Import] file.text() failed:', err);
        resolve(null);
      }
    };
    // No `oncancel` event in older browsers; the user can re-press Ctrl+O.
    input.click();
  });
}

/**
 * Validate, migrate, and apply a parsed JSON text to the store. Pure
 * "given a string, do the import or surface the error". Public so the
 * round-trip helpers and tests can call it without the file-picker UI.
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

  // 6. emit unknown-keys diagnostic (single warn, deduped) before mutating
  warnUnknownKeys(result.data as ModelFileV1);

  // 7. apply
  applyToStore(result.data as ModelFileV1);
  console.log(
    `[Import] Validation succeeded; applied ${result.data.model.nodes.length} nodes, ${result.data.model.elements.length} elements, ${result.data.model.loads.nodal.length + result.data.model.loads.distributed.length + result.data.model.loads.elementPoint.length} loads.`
  );
  showToast({ kind: 'info', message: 'Model imported successfully.' });
}

/**
 * Top-level "user clicked Import" flow. Two confirm gates fire in order:
 *   1. Analysis-running confirm (goal #12)
 *   2. Confirm-before-overwrite (goal #13)
 *
 * Both use `window.confirm` for v1; styled-modal replacement is a
 * follow-up (plan §11 follow-up TODO #3).
 */
export async function promptUserForImport(): Promise<void> {
  const state = useModelStore.getState();

  // Gate 1 — analysis-running
  if (state.isAnalyzing) {
    const ok = window.confirm(
      'Analysis is running. Import anyway? Results will be discarded.'
    );
    if (!ok) return;
  }

  // Gate 2 — confirm-before-overwrite
  const totalLoads =
    state.loads.nodal.length +
    state.loads.distributed.length +
    state.loads.elementPoint.length;
  const isNonEmpty =
    state.nodes.length > 0 || state.elements.length > 0 || totalLoads > 0;
  if (isNonEmpty) {
    const ok = window.confirm(
      `Importing will replace your current model (${state.nodes.length} nodes, ${state.elements.length} elements, ${totalLoads} loads). Continue?`
    );
    if (!ok) return;
  }

  const text = await pickFile();
  if (text === null) return; // user cancelled or read failed
  await handleImportText(text);
}
