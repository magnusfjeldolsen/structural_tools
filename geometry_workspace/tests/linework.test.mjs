/**
 * linework.test.mjs — hull-knappen og linjearbeidet (#86).
 *
 *   node geometry_workspace/tests/linework.test.mjs
 *
 * Brukerens arbeidsflyt, hele veien gjennom store: importer hulldekket som
 * «Bare linjer» → velg alt → «Lag geometri» (1 ytre + 7 sirkler) → slett de 7
 * → crossing-velg kanalene → «Lag hull» → A = 210 243 mm², og eksporten er
 * lik den automatiske importen. Pluss: utvalg (vindu/crossing/pick), angre
 * som ett steg, lagring, linjeverktøyet og hull-modus i tegneverktøyene.
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const vendor = await readFile(fileURLToPath(new URL('../../cad2d/vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { analyze } = await import(url('../../cad2d/js/geometry/polygon.js'));
const { exportSection, sectionProps } = await import(url('../../cad2d/js/io/section-export.js'));
const { importDxf, importDxfLines, shapeList, describeLineImport } = await import(url('../../cad2d/js/io/dxf.js'));
const { lineInBox, boxFromDrag, pickLine, contoursFromLines } = await import(url('../../cad2d/js/geometry/linework.js'));
const { Store } = await import(url('../js/store.js'));
const { ToolController } = await import(url('../js/tools.js'));

let failed = 0;
let passed = 0;
function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok  ${label}`); }
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const A_HD = 1200 * 265 - 7 * Math.PI * 4900;
const fixture = await readFile(fileURLToPath(new URL('./fixtures/hulldekke.dxf', import.meta.url)), 'utf8');

/* ---------------- utvalg ---------------- */

console.log('Vindu og crossing');
{
  const l = { id: 'l', points: [[0, 0], [100, 0]], closed: false };
  ok('vindu: helt inne', lineInBox(l, boxFromDrag([-1, -1], [101, 1])));
  ok('vindu: delvis inne → nei', !lineInBox(l, boxFromDrag([-1, -1], [50, 1])));
  const cr = boxFromDrag([50, 1], [-1, -1]);
  ok('høyre→venstre er crossing', cr.crossing === true && boxFromDrag([0, 0], [1, 1]).crossing === false);
  ok('crossing: delvis inne → ja', lineInBox(l, cr, true));
  ok('crossing: boksen midt på linja, ingen punkt inne → ja', lineInBox(l, boxFromDrag([60, 5], [40, -5]), true));
  ok('crossing: ved siden av → nei', !lineInBox(l, boxFromDrag([60, 20], [40, 10]), true));
  ok('pick innenfor toleranse', pickLine([50, 0.5], [l], 1) === l && pickLine([50, 3], [l], 1) === null);
}

/* ---------------- «Bare linjer» ---------------- */

console.log('DXF som bare linjer');
{
  const r = importDxfLines(fixture);
  ok('4 linjer + 7 sirkler = 11 stier', r.paths.length === 11, String(r.paths.length));
  ok('7 lukkede', r.paths.filter((p) => p.closed).length === 7);
  ok('meldingen ber om «Lag geometri»', /Lag geometri/.test(describeLineImport(r)));
  // Doble linjer fjernes også her
  const dup = importDxfLines('0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n10\n21\n0\n0\nLINE\n10\n10\n20\n0\n11\n0\n21\n0\n0\nENDSEC\n0\nEOF');
  ok('dobbel linje slått sammen', dup.paths.length === 1 && dup.duplicates.segments === 1);
}

console.log('Konturer av linjer: ingen nøsting');
{
  const rect = { id: 'r', points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true };
  const inner = { id: 'i', points: [[2, 2], [4, 2], [4, 4], [2, 4]], closed: true };
  const loose = { id: 'x', points: [[20, 0], [30, 0]], closed: false };
  const c = contoursFromLines([rect, inner, loose]);
  ok('to konturer, hver for seg', c.rings.length === 2);
  ok('den løse linja er ubrukt', c.unusedIds.length === 1 && c.unusedIds[0] === 'x');
}

/* ---------------- arbeidsflyten ---------------- */

console.log('Arbeidsflyten: linjer → geometri → slett sirkler → hull');
{
  const store = new Store();
  const imp = importDxfLines(fixture);
  store.addLines(imp.paths, { reason: 'import' });
  ok('11 linjer, ingen former', store.state.lines.length === 11 && store.state.shapes.length === 0);
  ok('linjer teller ikke i areal', !analyze(store.state.shapes, 'sum').result.valid);
  ok('import er ett angresteg', store.undo() && store.state.lines.length === 0 && store.redo() && store.state.lines.length === 11);

  // Velg alle linjer → Lag geometri
  store.select(store.state.lines.map((l) => l.id));
  const g = store.makeShapesFromLines(store.state.selection, 'solid');
  ok('8 former (1 ytre + 7 sirkler)', g.made === 8 && store.state.shapes.length === 8, JSON.stringify(g));
  ok('linjene er beholdt', store.state.lines.length === 11);
  const sumA = analyze(store.state.shapes, 'sum').result.A;
  ok(`dobbelt i kanalene: sum = 318 000 + 7πr² = ${sumA.toFixed(0)}`, rel(sumA, 318000 + 7 * Math.PI * 4900) < 1e-9);
  ok('Lag geometri er ett angresteg', store.undo() && store.state.shapes.length === 0 && store.redo() && store.state.shapes.length === 8);

  // Slett de 7 sirkelformene (alle unntatt den største)
  const big = store.state.shapes.reduce((m, s) => (Math.abs(ringArea(s.points)) > Math.abs(ringArea(m.points)) ? s : m));
  store.removeEntities(store.state.shapes.filter((s) => s !== big).map((s) => s.id));
  ok('én form igjen', store.state.shapes.length === 1);

  // Crossing høyre→venstre over kanalene, innenfor platekanten
  const box = boxFromDrag([1150, 200], [50, 60]);
  const picked = store.state.lines.filter((l) => lineInBox(l, box, box.crossing)).map((l) => l.id);
  ok('crossing tar de 7 kanalene og ingen kantlinjer', picked.length === 7, String(picked.length));
  store.select(picked);
  const h = store.makeShapesFromLines(store.state.selection, 'void');
  ok('7 hull', h.made === 7 && store.state.shapes.filter((s) => s.role === 'void').length === 7);
  for (const m of ['sum', 'priority']) {
    const a = analyze(store.state.shapes, m);
    ok(`${m}: A = ${a.result.A.toFixed(1)} = 210 243,4`, rel(a.result.A, A_HD) < 1e-9 && rel(a.netArea, A_HD) < 1e-9);
  }
  const e = exportSection(store.state.shapes, { unit: 'mm' });
  const auto = exportSection(
    shapeList(importDxf(fixture)).map((s, i) => ({ id: `a${i}`, include: true, factor: 1, ...s })),
    { unit: 'mm' }
  );
  const p = sectionProps(e.section);
  const q = sectionProps(auto.section);
  ok('eksport = automatisk import (A, I_y, I_z innen 1e-9)', e.ok && auto.ok && rel(p.A, q.A) < 1e-9 && rel(p.Iy, q.Iy) < 1e-9 && rel(p.Iz, q.Iz) < 1e-9, `${p.A} ${q.A}`);

  // Lagring tar med linjearbeidet
  const json = store.toJSON();
  const s2 = new Store();
  s2.fromJSON(json);
  ok('lagret fil har linjene', s2.state.lines.length === 11 && s2.state.lines[0].id && s2.state.shapes.length === 8);
  ok('linje-id-ene teller videre etter lasting', (() => { const [l] = s2.addLines([{ points: [[0, 0], [1, 1]] }]); return !s2.state.lines.slice(0, -1).some((x) => x.id === l.id); })());

  // Slett alt linjearbeid
  store.removeEntities(store.state.lines.map((l) => l.id));
  ok('linjearbeid slettet, formene står', store.state.lines.length === 0 && store.state.shapes.length === 8);
}

console.log('Åpne linjer blir stående markert');
{
  const store = new Store();
  store.addLines([
    { points: [[0, 0], [10, 0]] }, { points: [[10, 0], [10, 10]] }, { points: [[10, 10], [0, 10]] }, { points: [[0, 10], [0, 0]] },
    { points: [[50, 0], [60, 0]] },
  ]);
  store.select(store.state.lines.map((l) => l.id));
  const r = store.makeShapesFromLines(store.state.selection, 'solid');
  ok('én form av fire løse linjer', r.made === 1 && Math.abs(analyze(store.state.shapes, 'sum').result.A - 100) < 1e-9);
  ok('den åpne linja er fortsatt markert', r.unusedIds.length === 1 && store.state.selection.length === 1 && store.state.selection[0] === r.unusedIds[0]);
  const before = store.undoStack.length;
  const none = store.makeShapesFromLines(store.state.selection, 'solid');
  ok('ingen kontur: ingen ny form, intet angresteg', none.made === 0 && store.undoStack.length === before);
}

console.log('Enhetsbytte og flytting tar med linjene');
{
  const store = new Store();
  store.addLines([{ points: [[0, 0], [1000, 0]] }]);
  store.setUnit('m');
  ok('mm → m', Math.abs(store.state.lines[0].points[1][0] - 1) < 1e-12);
  store.moveEntities([store.state.lines[0].id], 1, 2);
  ok('flyttet', store.state.lines[0].points[0][0] === 1 && store.state.lines[0].points[0][1] === 2);
}

/* ---------------- verktøy: hull-modus og linjeverktøy ---------------- */

function fakeViewport() {
  return { unitsPerPixel: 1, setPreview() {}, setHover() {}, setHoverJoint() {}, snap: (p) => ({ point: p, type: 'free' }) };
}

console.log('Hull-modus i tegneverktøyene');
{
  const store = new Store();
  const tools = new ToolController(store, fakeViewport());
  const click = (p) => tools._handlePoint(p, { world: p, shift: false, alt: false });
  tools.setVoidMode(true);
  ok('hull-modus på', tools.voidMode === true);
  for (const [tool, pts] of [
    ['rect', [[0, 0], [10, 10]]],
    ['circle', [[50, 50], [55, 50]]],
    ['shell', [[0, 100], [100, 100]]],
  ]) {
    tools.setTool(tool);
    pts.forEach(click);
    ok(`${tool}: tegnet som hull`, store.state.shapes[0].role === 'void', store.state.shapes[0].role);
  }
  tools.setTool('polygon');
  [[0, 0], [10, 0], [5, 8]].forEach(click);
  tools.keydown({ key: 'Enter' });
  ok('polygon: tegnet som hull', store.state.shapes[0].role === 'void' && store.state.shapes.length === 4);
  const n = store.state.shapes.length;
  store.undo();
  ok('ett angresteg per hull', store.state.shapes.length === n - 1);
  tools.setVoidMode(false);
  tools.setTool('rect');
  [[0, 0], [10, 10]].forEach(click);
  ok('av igjen: fast form', store.state.shapes[0].role === 'solid');
  ok('hull-modus overlever verktøybytte', (() => { tools.setVoidMode(true); tools.setTool('circle'); return tools.voidMode; })());
}

console.log('Linjeverktøyet');
{
  const store = new Store();
  const tools = new ToolController(store, fakeViewport());
  const click = (p) => tools._handlePoint(p, { world: p, shift: false, alt: false });
  tools.setTool('line');
  [[0, 0], [100, 0], [100, 50]].forEach(click);
  tools.keydown({ key: 'Enter' });
  ok('én polylinje med tre punkt', store.state.lines.length === 1 && store.state.lines[0].points.length === 3 && !store.state.lines[0].closed);
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]].forEach(click);
  ok('klikk på startpunktet lukker', store.state.lines.length === 2 && store.state.lines[1].closed === true && store.state.lines[1].points.length === 4);
  ok('ingen former', store.state.shapes.length === 0);
  // Pick i velg-verktøyet
  tools.setTool('select');
  tools._handlePoint([50, 0.4], { world: [50, 0.4], shift: false, alt: false }, { point: [50, 0.4], type: 'free' });
  tools.pointerup({ world: [50, 0.4], shift: false });
  ok('klikk på linja velger den', store.state.selection.length === 1 && store.state.selection[0] === store.state.lines[0].id, JSON.stringify(store.state.selection));
  tools._handlePoint([10, 5], { world: [10, 5], shift: true, alt: false }, { point: [10, 5], type: 'free' });
  tools.pointerup({ world: [10, 5], shift: true });
  ok('shift-klikk legger til', store.state.selection.length === 2);
  // (Et nytt klikk nær et hjørne av en MARKERT linje tar hjørnet, som for
  // former — derfor fjernes l1 her ved et klikk midt på den.)
  tools._handlePoint([50, 0.4], { world: [50, 0.4], shift: true, alt: false }, { point: [50, 0.4], type: 'free' });
  tools.pointerup({ world: [50, 0.4], shift: true });
  ok('shift-klikk igjen fjerner', store.state.selection.length === 1 && store.state.selection[0] === store.state.lines[1].id);
  // Crossing med musa: høyre→venstre over bare den lukkede firkanten sin høyre kant
  store.select([]);
  tools._handlePoint([30, -20], { world: [30, -20], shift: false, alt: false }, { point: [30, -20], type: 'free' });
  tools.pointermove({ world: [8, 5], shift: false });
  tools.pointerup({ world: [8, 5], shift: false });
  ok('crossing-dra (høyre→venstre) velger linjene den berører', store.state.selection.length === 2, JSON.stringify(store.state.selection));
  store.select([]);
  tools._handlePoint([-30, -30], { world: [-30, -30], shift: false, alt: false }, { point: [-30, -30], type: 'free' });
  tools.pointermove({ world: [5, 5], shift: false });
  tools.pointerup({ world: [5, 5], shift: false });
  ok('vindu-dra (venstre→høyre) tar bare det som er helt inne', store.state.selection.length === 0);
}

console.log('Ctrl-dra tegner ramme også fra inni en form');
{
  const store = new Store();
  const tools = new ToolController(store, fakeViewport());
  store.addShape([[0, 0], [100, 0], [100, 100], [0, 100]], { name: 'Plate' });
  store.addLines([{ points: [[40, 50], [60, 50]] }, { points: [[0, 0], [100, 0]] }], { select: false });
  store.select([]);
  // Uten Ctrl: dra fra inni plata flytter den
  tools._handlePoint([80, 80], { world: [80, 80], shift: false, alt: false, ctrl: false }, { point: [80, 80], type: 'free' });
  ok('uten Ctrl: tar tak i plata', tools.drag && tools.drag.kind === 'move');
  tools.pointerup({ world: [80, 80], shift: false });
  store.select([]);
  // Med Ctrl: crossing høyre→venstre, inni plata, over den midterste linja
  tools._handlePoint([80, 60], { world: [80, 60], shift: false, alt: false, ctrl: true }, { point: [80, 60], type: 'free' });
  tools.pointermove({ world: [20, 40], shift: false });
  tools.pointerup({ world: [20, 40], shift: false });
  ok('med Ctrl: bare linja inni er valgt, ikke kantlinja eller plata', store.state.selection.length === 1 && store.state.selection[0] === store.state.lines[0].id, JSON.stringify(store.state.selection));
}

function ringArea(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return s / 2;
}

console.log(failed ? `\n${failed} FEIL, ${passed} ok` : `\nAlle tester bestått (${passed})`);
process.exit(failed ? 1 : 0);
