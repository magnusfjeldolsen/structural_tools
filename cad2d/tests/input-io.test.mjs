/**
 * input-io.test.mjs — tastaturkartet, verktøyenes utvidelsespunkt og I/O, uten DOM.
 *
 *   node cad2d/tests/input-io.test.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ok, section, done, load, near, R } from './harness.mjs';

const { CadDocument } = await load('js/core/document.js');
const { analyze } = await load('js/geometry/polygon.js');
const { ToolController, twoPointTool } = await load('js/input/tools.js');
const { TOOL_KEYS, createKeyHandler } = await load('js/input/keymap.js');
const { importDxfText, documentFromSection, sectionOf } = await load('js/io/project.js');
const { sectionProps } = await load('js/io/section-export.js');

const fakeViewport = () => ({
  unitsPerPixel: 1,
  setPreview() {},
  setHover() {},
  setHoverOf() {},
  hoverOf: () => null,
  zoomToFit() {},
  snap: (p) => ({ point: p, type: 'free' }),
});
const key = (k, extra = {}) => ({ key: k, code: '', target: {}, preventDefault() {}, ...extra });
const click = (tools, p, extra = {}) => {
  const e = { world: p, button: 0, shift: false, ctrl: false, alt: false, ...extra };
  tools.pointermove(e);
  tools.pointerdown(e);
  tools.pointerup(e);
};

section('Tastaturkartet er geometry_workspace sitt');
{
  ok('bokstavene', JSON.stringify(TOOL_KEYS) === JSON.stringify({
    v: 'select', m: 'move', c: 'copy', r: 'rotate', b: 'rect', s: 'shell', p: 'polygon', o: 'circle', n: 'reference', g: 'joint', x: 'splitline', l: 'line',
  }));
  const doc = new CadDocument();
  const vp = fakeViewport();
  const tools = new ToolController(doc, vp);
  const h = createKeyHandler({ doc, tools, viewport: vp });
  h(key('b'));
  ok('B gir rektangel', tools.tool === 'rect');
  click(tools, [0, 0]);
  click(tools, [100, 50]);
  ok('to klikk gir en form', doc.list('shape').length === 1);
  h(key('g'));
  ok('G uten skjøteutvidelse ignoreres', tools.tool === 'rect');
  h(key('h'));
  ok('H slår på hull-modus', tools.voidMode === true);
  click(tools, [10, 10]);
  click(tools, [20, 20]);
  ok('hull-modus gir role void', doc.state.shapes[0].role === 'void');
  h(key('h'));
  h(key('z', { ctrlKey: true }));
  ok('Ctrl+Z angrer', doc.list('shape').length === 1);
  h(key('y', { ctrlKey: true }));
  ok('Ctrl+Y gjør om', doc.list('shape').length === 2);
  h(key('z', { ctrlKey: true, shiftKey: true }));
  ok('Ctrl+Shift+Z gjør om (ingenting å gjøre om)', doc.list('shape').length === 2);
  h(key('a', { ctrlKey: true }));
  ok('Ctrl+A markerer alle former', doc.state.selection.length === 2);
  h(key('Delete'));
  ok('Del sletter utvalget', doc.list('shape').length === 0);
  h(key('z', { ctrlKey: true }));
  h(key('a', { ctrlKey: true }));
  h(key('Escape'));
  ok('Esc tømmer utvalget', doc.state.selection.length === 0);
  h(key('5', { altKey: true, code: 'Digit5' }));
  ok('Alt+5 slår av «på linje»-snap', doc.state.snaps.edge === false);
  h(key('F8'));
  ok('F8 orto', doc.state.ortho === true);
  const typing = h(key('b', { target: { tagName: 'INPUT' } }));
  ok('taster i et felt går ikke til verktøyene', !typing && tools.tool === 'rect');
}

section('registerTool / registerPicker');
{
  const doc = new CadDocument();
  doc.registerKind('dim', { collection: 'dims', prefix: 'd', toPoints: (o) => [o.a, o.b], fromPoints: (o, p) => { o.a = p[0]; o.b = p[1]; } });
  const vp = fakeViewport();
  const tools = new ToolController(doc, vp);
  tools.registerTool('dim', twoPointTool({ hint: 'Mål', finish: (a, b) => doc.add('dim', { a, b }) }));
  tools.setTool('dim');
  ok('registrert verktøy kan velges', tools.tool === 'dim' && tools.hint() === 'Mål');
  click(tools, [0, 0]);
  click(tools, [0, 500]);
  ok('to klikk gir entiteten', doc.list('dim').length === 1);
  doc.add('shape', { points: R(-100, -100, 200, 700) });
  let picked = null;
  tools.registerPicker({ kind: 'dim', hit: (w) => (Math.abs(w[0]) < 2 ? doc.list('dim')[0] : null), onPick: (id) => { picked = id; } });
  tools.setTool('select');
  click(tools, [0, 250]);
  ok('treffet vinner over formen under', picked === 'd1' && doc.state.selection.join() === 'd1');
  tools.setTool('move');
  click(tools, [0, 0]);
  click(tools, [10, 0]);
  ok('flytt virker på den nye typen', doc.get('d1').a[0] === 10);
}

section('DXF inn, tverrsnitt ut');
{
  const text = await readFile(fileURLToPath(new URL('../../geometry_workspace/tests/fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  const doc = new CadDocument();
  const r = importDxfText(doc, text);
  ok('automatisk import: 1 form + 7 hull', r.ok && doc.list('shape').length === 8, r.msg);
  const A = analyze(doc.state.shapes, 'sum').result.A;
  ok('A = 210 243 mm²', Math.round(A) === 210243, `${A}`);
  const s = sectionOf(doc);
  ok('tverrsnittet har 7 hull og samme A', s.ok && s.section.holes.length === 7 && near(sectionProps(s.section).A, A, 1e-9));

  const doc2 = new CadDocument();
  const r2 = importDxfText(doc2, text, { mode: 'lines' });
  ok('bare linjer', r2.ok && doc2.list('shape').length === 0 && doc2.list('line').length > 0);
  const all = doc2.list('line').map((l) => l.id);
  const made = doc2.makeShapesFromLines(all, 'solid');
  ok('lag geometri: 8 former', made.made === 8, JSON.stringify(made));
  // Slett sirkelformene (alle unntatt den største), og lag hull av kanalene
  const shapes = doc2.list('shape');
  const area = (sh) => Math.abs(analyze([sh], 'sum').result.A);
  const plate = shapes.reduce((a, b) => (area(a) > area(b) ? a : b));
  doc2.removeEntities(shapes.filter((x) => x !== plate).map((x) => x.id));
  const circles = doc2.list('line').filter((l) => l.points.length > 10).map((l) => l.id);
  const holes = doc2.makeShapesFromLines(circles, 'void');
  ok('lag hull: 7', holes.made === 7);
  ok('arbeidsflyten gir samme A', Math.round(analyze(doc2.state.shapes, 'sum').result.A) === 210243);

  const back = documentFromSection(s.section);
  ok('documentFromSection: samme A', near(analyze(back.state.shapes, 'sum').result.A, A, 1e-9));
  ok('documentFromSection: 1 fast + 7 hull, fersk historikk', back.list('shape').filter((x) => x.role === 'void').length === 7 && back.undoStack.length === 0);
}

done();
