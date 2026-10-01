/** Autosave (localStorage), project files (File System Access API with download fallback). */
import { parseProject, serializeProject } from '@thermo2d/core';
import type { Project } from '@thermo2d/core';

const AUTOSAVE_KEY = 'thermo2d.autosave.v1';

export interface Autosave {
  json: string;
  savedAt: string;
  name: string;
}

export function readAutosave(): Autosave | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as Autosave) : null;
  } catch {
    return null;
  }
}

export function writeAutosave(project: Project): void {
  try {
    const a: Autosave = { json: serializeProject(project), savedAt: new Date().toISOString(), name: project.name };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(a));
  } catch {
    /* storage may be unavailable (private mode); the file save is the real copy */
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

// --- File System Access API (Chromium) with fallbacks -----------------------

interface FSWritable {
  write(data: Blob | string | ArrayBuffer | ArrayBufferView): Promise<void>;
  close(): Promise<void>;
}
export interface FSFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FSWritable>;
}
interface PickerWindow {
  showSaveFilePicker?: (opts: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FSFileHandle>;
  showOpenFilePicker?: (opts: { multiple?: boolean; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FSFileHandle[]>;
}

const PROJECT_TYPE = [{ description: 'thermo2d project', accept: { 'application/json': ['.json'] } }];

export function fileNameFor(project: Project): string {
  const base = (project.name || 'project').replace(/[^\w\-æøåÆØÅ ]+/g, '_').trim() || 'project';
  return `${base}.thermo.json`;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save; returns the handle when the picker API was used (for later plain "Save"). */
export async function saveProjectFile(project: Project, handle: FSFileHandle | null, forcePicker = false): Promise<FSFileHandle | null> {
  const json = serializeProject(project);
  const w = window as unknown as PickerWindow;
  let h = handle;
  if ((forcePicker || !h) && w.showSaveFilePicker) {
    try {
      h = await w.showSaveFilePicker({ suggestedName: fileNameFor(project), types: PROJECT_TYPE });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return handle;
      h = null;
    }
  }
  if (h) {
    const writable = await h.createWritable();
    await writable.write(json);
    await writable.close();
    return h;
  }
  downloadBlob(fileNameFor(project), new Blob([json], { type: 'application/json' }));
  return null;
}

export async function openProjectFile(): Promise<{ project: Project; handle: FSFileHandle | null } | null> {
  const w = window as unknown as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ multiple: false, types: PROJECT_TYPE });
      const file = await h.getFile();
      return { project: parseProject(JSON.parse(await file.text())), handle: h };
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return null;
      throw e;
    }
  }
  const file = await pickFileFallback('.json,.thermo.json');
  if (!file) return null;
  return { project: parseProject(JSON.parse(await file.text())), handle: null };
}

export function pickFileFallback(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
