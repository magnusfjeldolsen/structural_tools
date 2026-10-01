import { describe, expect, it } from 'vitest';
import {
  bandColor,
  csvNumber,
  differenceFigure,
  explainResults,
  fieldFigure,
  fieldToCsv,
  interactiveHtml,
  isothermSegments,
  lineProfileFigure,
  modelFigure,
  overlayFigure,
  probesToCsv,
  reportHtml,
  sequentialColor,
  sweepFigure,
  tableToCsv,
  timeSeriesFigure,
} from '../src/index.js';
import { fixtureProject, fixtureResult, gridMesh } from './fixture.js';

/** Cheap well-formedness check: balanced tags, no unescaped ampersands, single root. */
function assertXml(svg: string) {
  expect(svg.startsWith('<svg ')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);
  const opens = (svg.match(/<([a-zA-Z]+)[\s>]/g) ?? []).map((m) => m.replace(/[<\s>]/g, ''));
  const closes = (svg.match(/<\/([a-zA-Z]+)>/g) ?? []).map((m) => m.replace(/[<>/]/g, ''));
  const selfClosing = (svg.match(/\/>/g) ?? []).length;
  expect(opens.length).toBe(closes.length + selfClosing);
  expect(/&(?!amp;|lt;|gt;|quot;|#)/.test(svg)).toBe(false);
}

const project = fixtureProject();
const result = fixtureResult(project);

describe('palette', () => {
  it('is monotonic in hue position and bands map in order', () => {
    const cols = [0, 0.2, 0.4, 0.6, 0.8, 1].map(sequentialColor);
    expect(new Set(cols).size).toBe(cols.length);
    expect(sequentialColor(0)).toBe('#1e3cc8');
    expect(sequentialColor(1)).toBe('#ffffff');
    const bands = { min: 0, max: 1100, step: 100 };
    expect(bandColor(-50, bands)).toBe(bandColor(50, bands));
    expect(bandColor(1250, bands)).toBe(bandColor(1050, bands));
    expect(bandColor(150, bands)).not.toBe(bandColor(250, bands));
  });
});

describe('timeSeriesFigure', () => {
  it('renders series, overlay, cursor and legend', () => {
    const svg = timeSeriesFigure({
      series: result.probes.map((p, k) => ({ name: p.id, t: result.probeTimes, v: result.probeValues[k] })),
      curveOverlay: { name: 'ISO 834', t: project.timeSeries[0].points.map((q) => q[0]), v: project.timeSeries[0].points.map((q) => q[1]) },
      title: 'Rebar temperatures',
      cursorTime: 1800,
      references: [{ value: 500, label: '500 °C' }],
    });
    assertXml(svg);
    expect(svg).toContain('data-series="p1"');
    expect(svg).toContain('data-series="ISO 834"');
    expect(svg).toContain('data-cursor="1"');
    expect(svg).toContain('500 °C');
    expect(svg).toContain('<title>Rebar temperatures</title>');
  });
  it('escapes user text', () => {
    const svg = timeSeriesFigure({ series: [{ name: 'a<b & "c"', t: [0, 1], v: [1, 2] }] });
    assertXml(svg);
    expect(svg).toContain('a&lt;b &amp; &quot;c&quot;');
  });
});

describe('fieldFigure', () => {
  it('draws every triangle, isotherm, probes and a colour bar', () => {
    const f = result.fields[result.fields.length - 1];
    const svg = fieldFigure({ mesh: result.mesh, field: f, isotherms: [500], probes: [{ name: 'B1', x: 45, y: 45, value: 456 }], title: 'Field', subtitle: 't = 90 min' });
    assertXml(svg);
    expect((svg.match(/<polygon /g) ?? []).length).toBe(result.mesh.stats.elementCount);
    expect(svg).toContain('data-isotherm="500"');
    expect(svg).toContain('B1: 456 °C');
    expect(svg).toContain('1100');
    expect(svg).toContain('mm</text>');
  });
  it('isotherm segments lie between the extremes', () => {
    const f = result.fields[result.fields.length - 1];
    const segs = isothermSegments(result.mesh, f, 500);
    expect(segs.length).toBeGreaterThan(0);
    for (const [a, b] of segs) for (const p of [a, b]) {
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(300);
      expect(p[1]).toBeGreaterThanOrEqual(0);
    }
  });
  it('smooth and diverging palettes render', () => {
    const f = result.fields[3];
    assertXml(fieldFigure({ mesh: result.mesh, field: f, smooth: true, showMesh: true, colorbar: false }));
    const d = differenceFigure({ a: { mesh: result.mesh, field: result.fields[2] }, b: { mesh: result.mesh, field: result.fields[5] } });
    assertXml(d);
    expect(d).toContain('ΔK');
  });
});

describe('modelFigure', () => {
  it('labels regions, materials, rebars, boundary conditions, probes and dimensions', () => {
    const svg = modelFigure({ project, title: 'Model', mesh: gridMesh(300, 500, 3, 5) });
    assertXml(svg);
    expect(svg).toContain('Beam – Concrete C30/37');
    expect(svg).toContain('B1 Ø20');
    expect(svg).toContain('data-bc="bc_fire"');
    expect(svg).toContain('Fire (convection + radiation)');
    expect(svg).toContain('300 mm');
    expect(svg).toContain('500 mm');
    expect(svg).toContain('Centre');
  });
  it('works for an empty project', () => {
    const p = fixtureProject();
    p.regions = []; p.rebars = []; p.probes = []; p.boundaryConditions = [];
    assertXml(modelFigure({ project: p }));
  });
});

describe('other charts', () => {
  it('line profile, overlay and sweep render', () => {
    assertXml(lineProfileFigure({ profiles: [{ name: 'depth', s: [0, 25, 50, 100], v: [900, 500, 300, 100] }], references: [{ value: 500, label: '500' }] }));
    const ov = overlayFigure({ results: [{ label: 'A', result }, { label: 'B', result }], title: 'Overlay' });
    assertXml(ov);
    expect(ov).toContain('p1 – A');
    expect(ov).toContain('p1 – B');
    const sw = sweepFigure({ points: [{ x: 25, y: 620 }, { x: 35, y: 540 }, { x: 45, y: 470 }], parameterLabel: 'cover [mm]', metricLabel: 'θ [°C]' });
    assertXml(sw);
    expect(sw).toContain('cover [mm]');
  });
});

describe('csv', () => {
  it('uses the requested locale and CRLF', () => {
    expect(csvNumber(12.5, { separator: ';', decimal: ',' })).toBe('12,5');
    expect(csvNumber(12.5, { separator: ',', decimal: '.' })).toBe('12.5');
    const csv = probesToCsv(result, project);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('t [s];t [min];B1 [°C];Centre [°C]');
    expect(lines[1].startsWith('0;0;20')).toBe(true);
    expect(lines.length).toBe(result.probeTimes.length + 2);
    const en = tableToCsv(['a', 'b'], [[1.25, 'x;y']], { separator: ',', decimal: '.' });
    expect(en).toBe('a,b\r\n1.25,"x;y"\r\n');
    const fc = fieldToCsv(result.mesh, result.fields[0]);
    expect(fc.split('\r\n').length).toBe(result.mesh.stats.nodeCount + 2);
  });
});

describe('explain and report', () => {
  it('explains in both languages with key numbers', () => {
    const nb = explainResults({ project, result, lang: 'nb', metrics: [{ name: 'U-verdi', value: 0.18, unit: 'W/m²K' }] });
    expect(nb).toContain('Inndata');
    expect(nb).toContain('EN 1991-1-2');
    expect(nb).toContain('U-verdi: 0.18 W/m²K');
    const en = explainResults({ project, result, lang: 'en', rebarRows: [{ name: 'B1', x: 45, y: 45, diameter: 20, temps: [300, 480], ks: [0.9, 0.78] }], rebarTimes: [1800, 5400] });
    expect(en).toContain('The hottest bar at 90 min is B1 at 480 °C, giving k_s = 0.78');
    expect(en).toContain('Energy balance: 0.5 % imbalance (below 1 %, fine)');
  });
  it('report is a complete HTML document with tables and figures', () => {
    const html = reportHtml({ project, results: [{ label: 'Base', result }], figures: [{ svg: timeSeriesFigure({ series: [{ name: 'a', t: [0, 1], v: [0, 1] }] }), caption: 'Probes' }], explanation: explainResults({ project, result }), metrics: [{ name: 'U', value: 0.2, unit: 'W/m²K' }], rebarRows: [{ name: 'B1', x: 45, y: 45, diameter: 20, temps: [480], ks: [0.78] }], rebarTimes: [5400], tableTimes: [1800, 3600, 5400], lang: 'en' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('Concrete C30/37');
    expect(html).toContain('Figure 1: Probes');
    expect(html).toContain('Rebar table');
    expect(html).toContain('convection + radiation');
    expect(html).toContain('</html>');
  });
});

describe('interactiveHtml', () => {
  it('is self-contained and embeds the data', () => {
    const html = interactiveHtml({ project, results: [{ label: 'Base', result }, { label: 'Alt', result }], lang: 'en' });
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link /);
    expect(html).toContain('id="data" type="application/json"');
    expect(html).toContain('"label":"Alt"');
    expect(html).toContain('Click in the section');
    const script = html.slice(html.lastIndexOf('<script>'), html.lastIndexOf('</script>'));
    expect(script.length).toBeLessThan(60 * 1024);
  });
  it('thins snapshots to the limit', () => {
    const big = fixtureResult(project, 200);
    const html = interactiveHtml({ project, results: [{ label: 'x', result: big }], maxSnapshots: 21 });
    const data = JSON.parse(html.slice(html.indexOf('type="application/json">') + 'type="application/json">'.length, html.indexOf('</script>')));
    expect(data.results[0].times.length).toBe(21);
    expect(data.results[0].times[20]).toBe(big.times[199]);
  });
});
