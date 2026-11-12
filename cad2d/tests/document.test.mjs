/**
 * document.test.mjs — dokumentmodellen uten DOM: CRUD, stabile id-er, angre/gjør
 * om (én batch = ett steg), hendelser, egne entitetstyper og JSON fram og tilbake.
 *
 *   node cad2d/tests/document.test.mjs
 */

import { ok, section, done, load, R } from './harness.mjs';

const { CadDocument, DEFAULT_SNAPS, documentFromJSON, DOCUMENT_FORMAT } = await load('js/core/document.js');
const { SNAP_KEYS } = await load('js/input/snapping.js');

section('CRUD');
{
  const doc = new CadDocument();
  const a = doc.add('shape', { points: R(0, 0, 100, 50), name: 'A' });
  const b = doc.add('shape', { points: R(200, 0, 10, 10), role: 'void' });
  const l = doc.add('line', { points: [[0, 0], [10, 0], [10, 10]] });
  ok('id-er med prefiks og løpenummer', a.id === 's1' && b.id === 's2' && l.id === 'l1', [a.id, b.id, l.id].join());
  ok('get slår opp alle typer', doc.get('s1') === doc.state.shapes[1] && doc.get('l1').points.length === 3);
  ok('nyeste form øverst', doc.state.shapes[0].id === 's2');
  ok('rolle hull', doc.get('s2').role === 'void' && doc.get('s1').role === 'solid');
  ok('list(kind)', doc.list('shape').length === 2 && doc.list('line').length === 1);
  ok('list() gir alle som {kind,obj}', doc.list().map((e) => e.kind).join() === 'shape,shape,line');
  doc.update('s1', { name: 'B', id: 'hack' });
  ok('update fletter, id står', doc.get('s1').name === 'B' && !doc.get('hack'));
  doc.remove('s2');
  ok('remove(id)', !doc.get('s2') && doc.list('shape').length === 1);
  doc.remove(['s1', 'l1']);
  ok('remove(liste)', doc.list().length === 0);
  ok('utvalget renses ved sletting', doc.state.selection.length === 0);
  const c = doc.add('shape', { points: R(0, 0, 1, 1) });
  ok('id-er gjenbrukes ikke etter sletting', c.id === 's3', c.id);
}

section('To dokumenter deler ikke teller');
{
  const d1 = new CadDocument();
  const d2 = new CadDocument();
  d1.add('shape', { points: R(0, 0, 1, 1) });
  d1.add('shape', { points: R(0, 0, 1, 1) });
  const x = d2.add('shape', { points: R(0, 0, 1, 1) });
  ok('d2 starter på s1', x.id === 's1');
}

section('Angre / gjør om');
{
  const doc = new CadDocument();
  doc.add('shape', { points: R(0, 0, 100, 100) });
  doc.add('shape', { points: R(0, 0, 10, 10) });
  ok('to steg', doc.undoStack.length === 2 && doc.canUndo && !doc.canRedo);
  doc.undo();
  ok('angre fjerner siste', doc.list('shape').length === 1);
  doc.redo();
  ok('gjør om legger den tilbake', doc.list('shape').length === 2);

  const before = doc.undoStack.length;
  doc.batch(() => {
    doc.add('shape', { points: R(0, 0, 5, 5) });
    doc.add('line', { points: [[0, 0], [1, 1]] });
    doc.moveEntities(['s1'], 10, 0);
    doc.update('s2', { name: 'Omdøpt' });
  }, { reason: 'test-batch' });
  ok('batch = ett angresteg', doc.undoStack.length === before + 1, `${doc.undoStack.length - before}`);
  doc.undo();
  ok('ett angre tar hele batchen', doc.list('shape').length === 2 && doc.list('line').length === 0 && doc.get('s2').name !== 'Omdøpt'
    && doc.get('s1').points[0][0] === 0);
  doc.redo();
  ok('ett gjør om gir hele batchen igjen', doc.list('shape').length === 3 && doc.list('line').length === 1 && doc.get('s1').points[0][0] === 10);

  let threw = false;
  try {
    doc.batch(() => {
      doc.add('shape', { points: R(0, 0, 5, 5) });
      throw new Error('bom');
    });
  } catch (e) {
    threw = e.message === 'bom';
  }
  ok('batch som kaster rulles tilbake', threw && doc.list('shape').length === 3);

  const n = doc.undoStack.length;
  doc.batch(() => doc.select(['s1']));
  ok('batch uten endring i dokumentet gir intet angresteg', doc.undoStack.length === n);
}

section('Transient og rollback (drag, Esc)');
{
  const doc = new CadDocument();
  const s = doc.add('shape', { points: R(0, 0, 10, 10) });
  const n = doc.undoStack.length;
  doc.setManyEntityPoints([{ id: s.id, points: R(5, 0, 10, 10) }], { transient: true });
  doc.setManyEntityPoints([{ id: s.id, points: R(7, 0, 10, 10) }], { transient: true });
  ok('transient gir intet steg', doc.undoStack.length === n && doc.isTransient);
  doc.commit('drag');
  ok('commit gir ett steg', doc.undoStack.length === n + 1 && !doc.isTransient);
  doc.setManyEntityPoints([{ id: s.id, points: R(50, 0, 10, 10) }], { transient: true });
  doc.rollback();
  ok('rollback setter tilbake', doc.get(s.id).points[0][0] === 7);
}

section('Hendelser');
{
  const doc = new CadDocument();
  const seen = [];
  const off = doc.on('change', (_st, reason) => seen.push(reason));
  const onlyUndo = [];
  doc.on('undo', (_st, reason) => onlyUndo.push(reason));
  doc.add('shape', { points: R(0, 0, 1, 1) });
  doc.batch(() => {
    doc.add('shape', { points: R(0, 0, 1, 1) });
    doc.add('shape', { points: R(0, 0, 1, 1) });
  }, { reason: 'two' });
  doc.undo();
  ok('change får alle grunner, batch som én', seen.join() === 'add,two,undo', seen.join());
  ok('on(reason) filtrerer', onlyUndo.join() === 'undo');
  off();
  doc.redo();
  ok('avmelding virker', seen.length === 3);
}

section('Egen entitetstype (utvidelsespunkt)');
{
  const doc = new CadDocument();
  doc.registerKind('dim', {
    collection: 'dims',
    prefix: 'd',
    toPoints: (o) => [o.p, o.q],
    fromPoints: (o, pts) => { o.p = pts[0]; o.q = pts[1]; },
  });
  const d = doc.add('dim', { p: [0, 0], q: [100, 0], text: 'L' });
  ok('id fra eget prefiks', d.id === 'd1');
  ok('get', doc.get('d1').text === 'L');
  doc.moveEntities(['d1'], 5, 5);
  ok('flytt går via toPoints/fromPoints', doc.get('d1').p[0] === 5 && doc.get('d1').q[1] === 5);
  const [copy] = doc.copyEntities(['d1'], [[0, 10]]);
  ok('kopi får ny id og egne punkt', copy.id === 'd2' && copy.p[1] === 15 && doc.get('d1').p[1] === 5);
  ok('entityPoints', JSON.stringify(doc.entityPoints('d2')) === '[[5,15],[105,15]]');
  doc.undo();
  ok('angre fjerner kopien', !doc.get('d2'));
  doc.remove('d1');
  ok('remove', doc.list('dim').length === 0);
}

section('JSON fram og tilbake');
{
  const doc = new CadDocument();
  doc.add('shape', { points: R(0, 0, 1200, 265), name: 'Plate' });
  doc.add('shape', { points: R(100, 50, 140, 140), role: 'void', name: 'Hull' });
  doc.addLines([{ points: [[0, 0], [5, 5]], closed: false }]);
  doc.setUnit('m');
  doc.setTitle('Tittel');
  doc.commit();
  const text = doc.toJSON();
  const obj = JSON.parse(text);
  ok('format og versjon', obj.format === DOCUMENT_FORMAT && obj.version === 1);
  const back = documentFromJSON(text);
  ok('samme former, linjer og enhet', JSON.stringify(back.state.shapes) === JSON.stringify(doc.state.shapes)
    && JSON.stringify(back.state.lines) === JSON.stringify(doc.state.lines) && back.state.unit === 'm' && back.state.title === 'Tittel');
  ok('fersk historikk', back.undoStack.length === 0);
  const n = back.add('shape', { points: R(0, 0, 1, 1) });
  ok('tellerne er synket etter lesing', n.id === 's3', n.id);
  ok('toJSON(fromJSON(x)) = x', JSON.stringify(back.toObject().shapes.slice(1)) === JSON.stringify(doc.toObject().shapes));

  let err = null;
  try { new CadDocument().fromJSON('{"format":"x"}'); } catch (e) { err = e.message; }
  ok('ugyldig fil gir melding', /shapes/.test(err || ''));
}

section('Snap-standarden følger snap-typene');
{
  ok('DEFAULT_SNAPS har de samme nøklene som SNAP_KEYS', JSON.stringify(Object.keys(DEFAULT_SNAPS).sort()) === JSON.stringify([...SNAP_KEYS].sort()));
}

done();
