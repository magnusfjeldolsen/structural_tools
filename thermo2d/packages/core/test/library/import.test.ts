import { describe, expect, it } from 'vitest';
import { parseEpw, parseTimeSeriesText, resample } from '../../src/library/index.js';

describe('parseTimeSeriesText', () => {
  it('Norwegian Excel: semicolon separator, decimal comma, header with unit', () => {
    const text = 'Tid [min];Temperatur [°C]\r\n0;20,0\r\n30;841,8\r\n60;945,3\r\n90;1005,8\r\n';
    const r = parseTimeSeriesText(text);
    expect(r.ok).toBe(true);
    expect(r.separator).toBe(';');
    expect(r.decimal).toBe(',');
    expect(r.timeUnit).toBe('min');
    expect(r.points).toEqual([
      [0, 20],
      [1800, 841.8],
      [3600, 945.3],
      [5400, 1005.8],
    ]);
    expect(r.valueUnit).toBe('°C');
    expect(r.step).toBe(1800);
    expect(r.gaps).toEqual([]);
    expect(r.columns).toEqual(['Tid [min]', 'Temperatur [°C]']);
  });

  it('tab-separated paste without header, seconds assumed with a warning', () => {
    const r = parseTimeSeriesText('0\t20\n10\t25\n20\t30\n');
    expect(r.ok).toBe(true);
    expect(r.separator).toBe('\t');
    expect(r.timeUnit).toBe('s');
    expect(r.points.length).toBe(3);
    expect(r.warnings.some((w) => /assumed to be seconds/.test(w))).toBe(true);
  });

  it('ISO 8601 timestamps become seconds from the first row; gaps are flagged', () => {
    const text = 'time,temp\n2024-01-01T00:00:00,1.5\n2024-01-01T01:00:00,1.0\n2024-01-01T02:00:00,0.5\n2024-01-01T05:00:00,-1\n';
    const r = parseTimeSeriesText(text);
    expect(r.ok).toBe(true);
    expect(r.timeUnit).toBe('iso8601');
    expect(r.points.map((p) => p[0])).toEqual([0, 3600, 7200, 18000]);
    expect(r.gaps).toEqual([[7200, 18000]]);
    expect(r.warnings.some((w) => /gap/.test(w))).toBe(true);
  });

  it('Excel serial dates are recognised', () => {
    const text = 'dato;verdi\n45292,0;5\n45292,041667;6\n45292,083333;7\n';
    const r = parseTimeSeriesText(text);
    expect(r.ok).toBe(true);
    expect(r.timeUnit).toBe('excel');
    expect(r.points[1][0]).toBeCloseTo(3600, -1);
    expect(r.points[2][0]).toBeCloseTo(7200, -1);
  });

  it('explicit options override detection; bad rows are skipped and counted', () => {
    const text = 'h;x;T\n0;a;10\n1;b;12\nfoo;c;13\n2;d;14\n';
    const r = parseTimeSeriesText(text, { timeUnit: 'h', valueColumn: 2 });
    expect(r.ok).toBe(true);
    expect(r.points).toEqual([
      [0, 10],
      [3600, 12],
      [7200, 14],
    ]);
    expect(r.skippedRows).toBe(1);
  });

  it('reports an error when nothing can be read', () => {
    const r = parseTimeSeriesText('hello\nworld');
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('resample onto a regular grid', () => {
    const pts = resample(
      [
        [0, 0],
        [10, 10],
        [30, 30],
      ],
      5,
    );
    expect(pts).toEqual([
      [0, 0],
      [5, 5],
      [10, 10],
      [15, 15],
      [20, 20],
      [25, 25],
      [30, 30],
    ]);
  });
});

describe('parseEpw', () => {
  it('reads dry-bulb temperature per hour after 8 header lines', () => {
    const header = [
      'LOCATION,Oslo,,NOR,IWEC,014920,59.9,10.75,1,94',
      'DESIGN CONDITIONS,0',
      'TYPICAL/EXTREME PERIODS,0',
      'GROUND TEMPERATURES,0',
      'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0',
      'COMMENTS 1,',
      'COMMENTS 2,',
      'DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31',
    ];
    const rows = [
      '2020,1,1,1,0,?9?9,-3.5,-5,80,101000',
      '2020,1,1,2,0,?9?9,-4.0,-5,80,101000',
      '2020,1,1,3,0,?9?9,99.9,-5,80,101000',
      '2020,1,1,4,0,?9?9,-4.5,-5,80,101000',
    ];
    const r = parseEpw([...header, ...rows].join('\n'));
    expect(r.ok).toBe(true);
    expect(r.points).toEqual([
      [0, -3.5],
      [3600, -4.0],
      [10800, -4.5],
    ]);
    expect(r.skippedRows).toBe(1);
    expect(r.gaps.length).toBe(1);
    expect(r.warnings.some((w) => /Oslo/.test(w))).toBe(true);
    expect(r.valueUnit).toBe('°C');
  });
});
