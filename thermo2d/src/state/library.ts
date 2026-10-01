/**
 * Library sources for the app:
 *  1. built-in items (core),
 *  2. the company library: JSON files in thermo2d/library/ bundled at build time (Git, PR-reviewed),
 *  3. "my library": items the user saved in this browser (localStorage).
 * They are merged once at start and whenever the user saves an item; user ids that collide
 * with built-ins get the `user:` prefix (core's mergeLibraries rule).
 */
import { BUILTIN_LIBRARY, libraryHash, mergeLibraries, parseLibraryFile, setActiveLibrary } from '@thermo2d/core';
import type { LibraryItem, Material } from '@thermo2d/core';

export const MY_LIBRARY_KEY = 'thermo2d.myLibrary';

/** Company library files, bundled by Vite. Each file is one item or a list. */
function companyLibraryItems(): LibraryItem[] {
  const files = import.meta.glob('../../library/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  const items: LibraryItem[] = [];
  for (const [path, text] of Object.entries(files)) {
    try {
      items.push(...parseLibraryFile(text, path.split('/').pop() ?? 'library.json'));
    } catch (e) {
      console.warn(`[thermo2d] company library file ${path} skipped: ${(e as Error).message}`);
    }
  }
  return items;
}

export function loadMyLibrary(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(MY_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LibraryItem[]) : [];
  } catch {
    return [];
  }
}

function storeMyLibrary(items: LibraryItem[]): void {
  try {
    localStorage.setItem(MY_LIBRARY_KEY, JSON.stringify(items));
  } catch {
    /* private window or quota: the item still lives in the project */
  }
}

/** Pure: combine the three sources into the active list (built-ins first, then company, then mine). */
export function combineLibraries(builtin: LibraryItem[], company: LibraryItem[], mine: LibraryItem[]): LibraryItem[] {
  return mergeLibraries(builtin, [company, mine]);
}

/** Convert a project material into a library item (origin user, hash filled). */
export function materialToLibraryItem(m: Material): LibraryItem {
  const { id, origin: _origin, libraryHash: _hash, ...material } = m;
  void _origin;
  void _hash;
  const item: LibraryItem = {
    id: id.replace(/^user:/, ''),
    category: 'material',
    name: m.name,
    nameNb: m.name,
    tags: m.tags,
    origin: 'user',
    source: m.source,
    quality: m.quality === 'standard' ? 'user' : m.quality,
    material: { ...material, origin: 'user' } as LibraryItem['material'],
  };
  item.hash = libraryHash(item);
  return item;
}

/** Save (or replace by id) in the browser's personal library and refresh the active library. */
export function saveToMyLibrary(item: LibraryItem): LibraryItem[] {
  const mine = loadMyLibrary().filter((x) => x.id !== item.id);
  mine.push(item);
  storeMyLibrary(mine);
  refreshActiveLibrary();
  return mine;
}

export function removeFromMyLibrary(id: string): void {
  storeMyLibrary(loadMyLibrary().filter((x) => x.id !== id));
  refreshActiveLibrary();
}

/** Download an item as `<id>.json`, ready for thermo2d/library/ in Git. */
export function downloadLibraryItem(item: LibraryItem): void {
  const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${item.id.replace(/[^a-z0-9_-]+/gi, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let company: LibraryItem[] | null = null;

export function refreshActiveLibrary(): LibraryItem[] {
  company ??= companyLibraryItems();
  const all = combineLibraries(BUILTIN_LIBRARY, company, loadMyLibrary());
  setActiveLibrary(all);
  return all;
}

/** Call once before the first render. */
export function initLibraries(): void {
  try {
    const all = refreshActiveLibrary();
    const extra = all.length - BUILTIN_LIBRARY.length;
    if (extra > 0) console.info(`[thermo2d] library: ${BUILTIN_LIBRARY.length} built-in + ${extra} company/personal items`);
  } catch (e) {
    console.warn('[thermo2d] library init failed; using built-ins only', e);
    setActiveLibrary(BUILTIN_LIBRARY);
  }
}
