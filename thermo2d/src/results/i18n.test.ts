import { describe, expect, it } from 'vitest';
import { makeT, RESULTS_STRINGS } from './i18n.js';

describe('results strings', () => {
  it('has every key in both languages', () => {
    const nb = Object.keys(RESULTS_STRINGS.nb).sort();
    const en = Object.keys(RESULTS_STRINGS.en).sort();
    expect(en).toEqual(nb);
    for (const k of nb) {
      expect(RESULTS_STRINGS.en[k as keyof typeof RESULTS_STRINGS.en].length).toBeGreaterThan(0);
    }
  });

  it('substitutes variables', () => {
    const t = makeT('en');
    expect(t('hoverReadout', { x: 1, y: 2, v: 3 })).toBe('x 1 mm, y 2 mm: 3 °C');
    expect(makeT('nb')('pin')).toBe('Fest som målepunkt');
  });
});
