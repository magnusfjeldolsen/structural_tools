import { describe, expect, it } from 'vitest';
import { autoTimeUnit, formatTick, linearScale, niceDomain, niceStep, niceTicks } from './scale.js';

describe('scale helpers', () => {
  it('linear scale maps and inverts', () => {
    const s = linearScale([0, 100], [10, 210]);
    expect(s(50)).toBe(110);
    expect(s.invert(110)).toBe(50);
    const flat = linearScale([5, 5], [0, 1]);
    expect(flat(5)).toBe(0);
    expect(flat.invert(0.5)).toBe(5);
  });

  it('nice steps are 1-2-5', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(1100, 11)).toBe(100);
    expect(niceStep(0.35, 5)).toBeCloseTo(0.05);
    expect(niceStep(0)).toBe(1);
  });

  it('ticks cover the domain without overshooting', () => {
    const t = niceTicks(0, 1100, 11);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(1100);
    expect(t).toHaveLength(12);
    expect(niceTicks(20, 20)).toEqual([20]);
    expect(niceTicks(3, 1)).toEqual(niceTicks(1, 3));
    const f = niceTicks(0.1, 0.9, 4);
    expect(f.every((v) => v >= 0.1 && v <= 0.9)).toBe(true);
  });

  it('nice domain extends outward', () => {
    expect(niceDomain(17, 812, 6)).toEqual([0, 900]);
    expect(niceDomain(2, 2)).toEqual([1, 3]);
  });

  it('formats ticks compactly', () => {
    expect(formatTick(100, 100)).toBe('100');
    expect(formatTick(0.5, 0.5)).toBe('0.5');
    expect(formatTick(0.30000000004, 0.1)).toBe('0.3');
    expect(formatTick(0, 0.1)).toBe('0');
  });

  it('picks a readable time unit', () => {
    expect(autoTimeUnit(300)).toBe('s');
    expect(autoTimeUnit(5400)).toBe('min');
    expect(autoTimeUnit(86400)).toBe('h');
    expect(autoTimeUnit(365 * 86400)).toBe('d');
  });
});
