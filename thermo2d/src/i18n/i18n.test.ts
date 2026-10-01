import { describe, expect, it } from 'vitest';
import { en, nb, translate } from './index.js';

describe('i18n', () => {
  it('has the same keys in nb and en', () => {
    const nbKeys = Object.keys(nb).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(nbKeys);
  });
  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(nb)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(en)) expect(v.length, k).toBeGreaterThan(0);
  });
  it('substitutes parameters', () => {
    expect(translate('nb', 'selectedCount', { n: 3 })).toBe('3 valgt');
    expect(translate('en', 'checkMeshResult', { delta: '1.2', verdict: 'ok' })).toContain('1.2 K');
  });
});
