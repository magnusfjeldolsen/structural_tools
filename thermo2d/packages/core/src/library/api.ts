/**
 * Library access: search, lookup, resolve a library item into a project Material,
 * hashing for reproducibility, and user-library parsing/merging (text in, items out —
 * the server does the file reading).
 */
import type { LibraryItem, Material, MaterialCategory } from '../model/types.js';
import { CURVE_LIBRARY } from './curves.js';
import { MATERIAL_LIBRARY } from './materials.js';
import { evaluateModel } from './models.js';

/** Canonical JSON (sorted keys) so the hash does not depend on property order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** 64-bit FNV-1a as 16 hex chars (two 32-bit lanes for speed and determinism). */
export function fnv1a(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x01000193) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function libraryHash(item: LibraryItem): string {
  const { hash: _h, ...rest } = item;
  return fnv1a(canonicalJson(rest));
}

function withHash(item: LibraryItem): LibraryItem {
  return { ...item, hash: libraryHash(item) };
}

export const BUILTIN_LIBRARY: LibraryItem[] = [...MATERIAL_LIBRARY, ...CURVE_LIBRARY].map(withHash);

/**
 * The active library = built-ins plus whatever user/company libraries the shell has merged in
 * (see mergeLibraries). Defaults to BUILTIN_LIBRARY; the server sets it after reading the
 * workspace folders. getLibraryItem and searchLibrary use it when no explicit list is given.
 */
let activeLibrary: LibraryItem[] = BUILTIN_LIBRARY;

export function setActiveLibrary(items: LibraryItem[]): void {
  activeLibrary = items;
}

export function getActiveLibrary(): LibraryItem[] {
  return activeLibrary;
}

export interface LibraryQuery {
  text?: string;
  category?: LibraryItem['category'];
  materialCategory?: MaterialCategory;
  tags?: string[];
  /** λ at 20 °C within [min, max] W/mK. */
  lambdaRange?: [number, number];
  /** ρ at 20 °C within [min, max] kg/m³. */
  densityRange?: [number, number];
  quality?: LibraryItem['quality'][];
  limit?: number;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Search by free text (name, Norwegian name, tags, source), category, tags, λ and ρ ranges. Ranked by match quality. */
export function searchLibrary(query: LibraryQuery = {}, items: LibraryItem[] = activeLibrary): LibraryItem[] {
  const words = query.text ? norm(query.text).split(/\s+/).filter(Boolean) : [];
  const scored: { item: LibraryItem; score: number }[] = [];
  for (const it of items) {
    if (query.category && it.category !== query.category) continue;
    if (query.materialCategory && it.material?.category !== query.materialCategory) continue;
    if (query.quality && !query.quality.includes(it.quality)) continue;
    if (query.tags && !query.tags.every((t) => it.tags.map(norm).includes(norm(t)))) continue;
    if (query.lambdaRange || query.densityRange) {
      if (!it.material) continue;
      const p = evaluateModel(it.material.model, 20);
      if (query.lambdaRange && (p.lambda < query.lambdaRange[0] || p.lambda > query.lambdaRange[1])) continue;
      if (query.densityRange && (p.rho < query.densityRange[0] || p.rho > query.densityRange[1])) continue;
    }
    let score = 1;
    if (words.length) {
      const hay = norm([it.id, it.name, it.nameNb ?? '', ...it.tags, it.source.text].join(' '));
      const nameHay = norm(`${it.id} ${it.name} ${it.nameNb ?? ''}`);
      score = 0;
      for (const w of words) {
        if (nameHay.includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      if (score === 0) continue;
    }
    scored.push({ item: it, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const out = scored.map((s) => s.item);
  return query.limit ? out.slice(0, query.limit) : out;
}

export function getLibraryItem(id: string, items: LibraryItem[] = activeLibrary): LibraryItem | undefined {
  return items.find((it) => it.id === id);
}

/** Resolve a material library item into a project Material (a hashed copy, so old results stay reproducible). Default id = item.id. */
export function materialFromLibrary(item: LibraryItem, id?: string): Material {
  if (!item.material) throw new Error(`Library item '${item.id}' is not a material`);
  const m = item.material;
  return {
    id: id ?? item.id,
    name: m.name,
    category: m.category,
    model: structuredClone(m.model),
    emissivity: m.emissivity,
    absorptance: m.absorptance,
    validRange: [m.validRange[0], m.validRange[1]],
    source: { ...m.source },
    quality: m.quality,
    tags: [...m.tags],
    origin: item.origin,
    strength: m.strength ? structuredClone(m.strength) : undefined,
    libraryHash: item.hash ?? libraryHash(item),
    color: m.color,
    notes: m.notes,
  };
}

const CATEGORIES: MaterialCategory[] = ['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane', 'custom'];

function slug(s: string): string {
  return norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a user library file. JSON: an array of LibraryItem, an object with `items`, or a single item.
 * CSV (semicolon or comma): name;category;lambda;cp;rho;emissivity;source — constant materials, decimal comma allowed.
 */
export function parseLibraryFile(text: string, filename = 'library.json'): LibraryItem[] {
  const lower = filename.toLowerCase();
  const items: LibraryItem[] = [];
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const lines = text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'));
    const sep = (lines[0] ?? '').includes(';') ? ';' : (lines[0] ?? '').includes('\t') ? '\t' : ',';
    const start = /^name/i.test(lines[0] ?? '') ? 1 : 0;
    for (const line of lines.slice(start)) {
      const cells = line.split(sep).map((s) => s.trim());
      const [name, cat, l, cp, rho, eps, source] = cells;
      const n = (s: string | undefined, fb?: number) => {
        const raw = (s ?? '').trim();
        if (raw === '' && fb !== undefined) return fb;
        const v = Number(raw.replace(',', '.'));
        if (raw !== '' && Number.isFinite(v)) return v;
        if (fb !== undefined) return fb;
        throw new Error(`Library CSV: cannot read a number in line "${line}"`);
      };
      if (!name) continue;
      const category = (CATEGORIES.includes(cat as MaterialCategory) ? cat : 'custom') as MaterialCategory;
      const src = { text: source || `User library file ${filename}` };
      items.push({
        id: `user-${slug(name)}`,
        category: 'material',
        name,
        tags: ['user', category],
        origin: 'user',
        source: src,
        quality: 'user',
        material: {
          name,
          category,
          model: { kind: 'constant', lambda: n(l), cp: n(cp), rho: n(rho) },
          emissivity: n(eps, 0.9),
          validRange: [-40, 100],
          source: src,
          quality: 'user',
          tags: ['user', category],
        },
      });
    }
  } else {
    const parsed = JSON.parse(text) as unknown;
    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
        ? ((parsed as { items: unknown[] }).items)
        : [parsed];
    for (const raw of arr) {
      const it = raw as Partial<LibraryItem>;
      if (!it || typeof it !== 'object' || !it.name) throw new Error(`Library JSON in ${filename}: every item needs a 'name'`);
      if (!it.material && !it.curve) throw new Error(`Library item '${it.name}' needs a 'material' or a 'curve'`);
      if (it.material) {
        const m = it.material;
        if (!m.model) throw new Error(`Library item '${it.name}': material.model is required`);
        // sanity: evaluate once
        evaluateModel(m.model, 20);
        m.name ??= it.name;
        m.category ??= 'custom';
        m.emissivity ??= 0.9;
        m.validRange ??= [-40, 100];
        m.source ??= it.source ?? { text: `User library file ${filename}` };
        m.quality ??= 'user';
        m.tags ??= it.tags ?? [];
      }
      items.push({
        id: it.id ?? `user-${slug(it.name)}`,
        category: it.category ?? (it.material ? 'material' : 'climate-series'),
        name: it.name,
        nameNb: it.nameNb,
        tags: it.tags ?? [],
        origin: 'user',
        source: it.source ?? it.material?.source ?? { text: `User library file ${filename}` },
        quality: it.quality ?? 'user',
        material: it.material as LibraryItem['material'],
        curve: it.curve,
      });
    }
  }
  return items.map(withHash);
}

/** Merge user libraries over the built-ins. Built-ins are read-only: a user id that collides is prefixed 'user:'. */
export function mergeLibraries(builtin: LibraryItem[], user: LibraryItem[][]): LibraryItem[] {
  const out = [...builtin];
  const ids = new Set(out.map((i) => i.id));
  for (const lib of user) {
    for (const it of lib) {
      let id = it.id;
      if (ids.has(id)) id = `user:${id}`;
      let k = 2;
      while (ids.has(id)) id = `user:${it.id}-${k++}`;
      ids.add(id);
      out.push({ ...it, id, origin: 'user' });
    }
  }
  return out;
}
