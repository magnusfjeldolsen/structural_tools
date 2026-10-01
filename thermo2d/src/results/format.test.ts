import { describe, expect, it } from 'vitest';
import { csvNumber, defaultReportTimes, formatTime, nearestIndex, parseTime, safeFileName, toCsv, toTsv } from './format.js';

describe('results formatting', () => {
  it('formats times in a readable unit', () => {
    expect(formatTime(45)).toBe('45 s');
    expect(formatTime(5400)).toBe('90 min');
    expect(formatTime(7200)).toBe('120 min');
    expect(formatTime(36000)).toBe('10 h');
    expect(formatTime(10 * 86400)).toBe('10 d');
  });

  it('parses typed times', () => {
    expect(parseTime('90')).toBe(5400);
    expect(parseTime('90 min')).toBe(5400);
    expect(parseTime('1,5h')).toBe(5400);
    expect(parseTime('3600 s')).toBe(3600);
    expect(parseTime('2 d')).toBe(172800);
    expect(parseTime('300', 's')).toBe(300);
    expect(parseTime('abc')).toBeNull();
  });

  it('honours the CSV locale', () => {
    const nb = { separator: ';' as const, decimal: ',' as const };
    const en = { separator: ',' as const, decimal: '.' as const };
    expect(csvNumber(12.345, nb, 1)).toBe('12,3');
    expect(csvNumber(NaN, nb)).toBe('');
    expect(toCsv([['t', 'B1'], [60, 21.5]], nb, 1)).toBe('t;B1\r\n60,0;21,5');
    expect(toCsv([['a;b', 1]], nb, 0)).toBe('"a;b";1');
    expect(toCsv([['x', 'y'], [1, 2]], en, 0)).toBe('x,y\r\n1,2');
    expect(toTsv([['a', 1.25]], nb, 2)).toBe('a\t1,25');
  });

  it('chooses report times inside the run', () => {
    expect(defaultReportTimes(5400)).toEqual([1800, 3600, 5400]);
    expect(defaultReportTimes(7200)).toEqual([1800, 3600, 5400, 7200]);
    expect(defaultReportTimes(9000)).toEqual([1800, 3600, 5400, 7200, 9000]);
    expect(defaultReportTimes(1200)).toEqual([300, 600, 900, 1200]);
  });

  it('finds the nearest snapshot', () => {
    expect(nearestIndex([0, 60, 120], 70)).toBe(1);
    expect(nearestIndex([0, 60, 120], 1000)).toBe(2);
  });

  it('makes safe file names', () => {
    expect(safeFileName('Bjelke 300×500 / brann')).toBe('Bjelke_300_500___brann');
    expect(safeFileName('')).toBe('thermo2d');
  });
});
