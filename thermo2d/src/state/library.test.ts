// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_LIBRARY, getLibraryItem } from '@thermo2d/core';
import type { Material } from '@thermo2d/core';
import { MY_LIBRARY_KEY, combineLibraries, loadMyLibrary, materialToLibraryItem, refreshActiveLibrary, removeFromMyLibrary, saveToMyLibrary } from './library.js';

const custom: Material = {
  id: 'my-eps',
  name: 'EPS 80',
  category: 'insulation',
  model: { kind: 'constant', lambda: 0.038, cp: 1450, rho: 20 },
  emissivity: 0.9,
  validRange: [-30, 80],
  source: { text: 'Datablad EPS 80, 2026-01' },
  quality: 'manufacturer',
  tags: ['eps'],
  origin: 'user',
};

describe('library sources', () => {
  beforeEach(() => localStorage.clear());

  it('converts a project material into a hashed library item', () => {
    const item = materialToLibraryItem(custom);
    expect(item.id).toBe('my-eps');
    expect(item.category).toBe('material');
    expect(item.material?.model).toEqual(custom.model);
    expect(item.hash).toHaveLength(16);
    expect((item.material as { id?: string }).id).toBeUndefined();
  });

  it('merges built-in, company and personal items; personal collisions get the user: prefix', () => {
    const builtinId = BUILTIN_LIBRARY[0].id;
    const colliding = { ...materialToLibraryItem(custom), id: builtinId };
    const all = combineLibraries(BUILTIN_LIBRARY, [], [colliding, materialToLibraryItem(custom)]);
    expect(all.length).toBe(BUILTIN_LIBRARY.length + 2);
    expect(all.some((i) => i.id === `user:${builtinId}`)).toBe(true);
    expect(all.some((i) => i.id === 'my-eps')).toBe(true);
  });

  it('saves to and removes from the personal library and refreshes the active library', () => {
    saveToMyLibrary(materialToLibraryItem(custom));
    expect(loadMyLibrary().map((i) => i.id)).toEqual(['my-eps']);
    expect(JSON.parse(localStorage.getItem(MY_LIBRARY_KEY)!)).toHaveLength(1);
    expect(getLibraryItem('my-eps')?.name).toBe('EPS 80');
    // saving again replaces, never duplicates
    saveToMyLibrary(materialToLibraryItem({ ...custom, name: 'EPS 80 v2' }));
    expect(loadMyLibrary()).toHaveLength(1);
    expect(getLibraryItem('my-eps')?.name).toBe('EPS 80 v2');
    removeFromMyLibrary('my-eps');
    refreshActiveLibrary();
    expect(getLibraryItem('my-eps')).toBeUndefined();
  });

  it('survives corrupt localStorage', () => {
    localStorage.setItem(MY_LIBRARY_KEY, '{not json');
    expect(loadMyLibrary()).toEqual([]);
  });
});
