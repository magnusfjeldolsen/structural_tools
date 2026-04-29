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
import { showToast } from '../store/useToastStore';

// Heavy import-side modules are dynamic-imported from `promptUserForImport`
// (plan §7 Phase 9 — bundle-size guard). See `./importPath.ts`. Tests
// import `handleImportText` directly via the static re-export below;
// runtime UI goes through the lazy code-split.

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

// handleImportText lives in `./importPath` and is dynamic-imported from
// `promptUserForImport` to keep Zod + semantic validator + applyToStore
// off the eager bundle. Tests and other non-UI consumers should import
// directly from `./importPath`.

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
  // Lazy-load the validator + apply chain (Zod, semantic validator,
  // applyToStore). Runtime cost: a single async chunk fetch on the
  // first import click; insignificant compared to the file picker
  // round-trip.
  const { handleImportText } = await import('./importPath');
  await handleImportText(text);
}
