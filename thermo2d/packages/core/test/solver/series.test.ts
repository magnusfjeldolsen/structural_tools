import { describe, expect, it } from 'vitest';
import { compileSeries } from '../../src/solver/series.js';
import type { TimeSeries } from '../../src/model/types.js';

const base: Omit<TimeSeries, 'afterEnd' | 'interpolation'> = {
  id: 's',
  name: 's',
  points: [
    [0, 10],
    [10, 20],
    [30, 0],
  ],
  unit: '°C',
  source: { kind: 'manual' },
};

describe('compileSeries', () => {
  it('interpolates linearly and holds before the first point', () => {
    const s = compileSeries({ ...base, interpolation: 'linear', afterEnd: 'hold' }, 5);
    expect(s.at(-5)).toBe(10);
    expect(s.at(0)).toBe(10);
    expect(s.at(5)).toBeCloseTo(15);
    expect(s.at(20)).toBeCloseTo(10);
    expect(s.at(30)).toBe(0);
    expect(s.at(100)).toBe(0);
  });
  it('step interpolation holds the previous value', () => {
    const s = compileSeries({ ...base, interpolation: 'step', afterEnd: 'hold' }, 5);
    expect(s.at(5)).toBe(10);
    expect(s.at(10)).toBe(20);
    expect(s.at(29.9)).toBe(20);
  });
  it('repeats and falls back to ambient after the end', () => {
    const rep = compileSeries({ ...base, interpolation: 'linear', afterEnd: 'repeat' }, 5);
    expect(rep.at(35)).toBeCloseTo(15); // 35 → 5
    expect(rep.at(60)).toBeCloseTo(10); // 60 → 0
    const amb = compileSeries({ ...base, interpolation: 'linear', afterEnd: 'ambient' }, 5);
    expect(amb.at(31)).toBe(5);
    expect(amb.at(30)).toBe(0);
  });
  it('empty series returns ambient; unsorted points are sorted', () => {
    expect(compileSeries({ ...base, points: [], interpolation: 'linear', afterEnd: 'hold' }, 7).at(3)).toBe(7);
    const s = compileSeries({ ...base, points: [[10, 20], [0, 10]], interpolation: 'linear', afterEnd: 'hold' }, 0);
    expect(s.at(5)).toBeCloseTo(15);
  });
});
