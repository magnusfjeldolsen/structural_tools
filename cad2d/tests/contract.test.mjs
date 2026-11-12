/**
 * contract.test.mjs — kontrakten til CadDocument (review av #94, punkt 1 og 9).
 *
 *  - Det som sendes inn (fromJSON, konstruktør) eies av kalleren: dokumentet
 *    dypkopierer, så ingen mutasjon i dokumentet når tilbake til kalleren.
 *  - `get()`/`list()` gir kopier: endringer går bare gjennom `update()` o.l.,
 *    så de alltid er med i angrehistorikken og gir hendelser.
 *  - `update`/`remove` med ukjent id gir ikke et tomt angresteg.
 *  - `add(..., {select:false})` lar utvalget stå; `reason` følger med.
 *  - `registerKind` nekter et prefiks eller en samling som alt er i bruk.
 *
 *   node cad2d/tests/contract.test.mjs
 */

import { ok, section, done, load, R } from './harness.mjs';

const { CadDocument } = await load('js/core/document.js');

section('Innsendt dokument er urørt (punkt 1)');
{
  const src = new CadDocument();
  src.addShape(R(0, 0, 100, 100));
  src.addLines([{ points: [[0, 0], [5, 5]] }]);
  const stored = src.toObject();
  const before = JSON.stringify(stored);
  const doc = new CadDocument();
  doc.fromJSON(stored);
  doc.setSnaps({ endpoint: false });
  doc.setGrid({ step: 7 });
  doc.setOrtho(true);
  doc.setManyEntityPoints([{ id: doc.state.shapes[0].id, points: R(1, 1, 2, 2) }]);
  doc.state.shapes[0].points[0][0] = 999;
  doc.state.lines[0].points[0][0] = 999;
  doc.setUnit('m');
  ok('fromJSON(objekt) + vilkårlige endringer rører ikke objektet', JSON.stringify(stored) === before);
  const d2 = new CadDocument();
  d2.fromJSON(stored);
  ok('to dokumenter fra samme objekt deler ingenting', d2.state.snaps !== doc.state.snaps && d2.state.grid !== doc.state.grid
    && d2.state.shapes[0].points !== doc.state.shapes[0].points);
  const init = { grid: { step: 10, visible: true } };
  const d3 = new CadDocument({ state: init });
  d3.setGrid({ step: 99 });
  ok('konstruktørens state kopieres', init.grid.step === 10);
}

section('get()/list() gir kopier (punkt 9)');
{
  const doc = new CadDocument();
  doc.add('shape', { points: R(0, 0, 10, 10) });
  const n = doc.undoStack.length;
  let events = 0;
  doc.on('change', () => events++);
  doc.get('s1').points.push([9, 9]);
  doc.list('shape')[0].name = 'Hacket';
  doc.list()[0].obj.points.length = 0;
  ok('endring på returverdien når ikke dokumentet', doc.get('s1').points.length === 4 && doc.get('s1').name === 'Form');
  ok('og gir verken angresteg eller hendelse', doc.undoStack.length === n && events === 0);
  doc.update('s1', { name: 'Riktig' });
  ok('update er veien', doc.get('s1').name === 'Riktig' && doc.undoStack.length === n + 1 && events === 1);
}

section('Ukjent id gir ikke angresteg (punkt 9)');
{
  const doc = new CadDocument();
  doc.add('shape', { points: R(0, 0, 10, 10) });
  const n = doc.undoStack.length;
  doc.update('nope', { a: 1 });
  doc.remove('nope');
  doc.remove(['nope', 'nada']);
  ok('ingen tomme angresteg', doc.undoStack.length === n, `${doc.undoStack.length - n}`);
}

section('add: select og reason (punkt 9)');
{
  const doc = new CadDocument();
  doc.add('shape', { points: R(0, 0, 10, 10) });
  doc.select(['s1']);
  doc.add('shape', { points: R(0, 0, 5, 5) }, { select: false });
  ok('select:false lar utvalget stå', doc.state.selection.join() === 's1', doc.state.selection.join());
  doc.add('line', { points: [[0, 0], [1, 1]] }, { select: false });
  ok('også for linjer', doc.state.selection.join() === 's1');
  const reasons = [];
  doc.on('change', (_s, r) => reasons.push(r));
  doc.add('shape', { points: R(0, 0, 5, 5) }, { reason: 'mitt-steg' });
  doc.add('line', { points: [[0, 0], [1, 1]] }, { reason: 'min-linje' });
  ok('reason følger med', reasons.join() === 'mitt-steg,min-linje', reasons.join());
  ok('select (standard) markerer den nye', doc.state.selection.length === 1 && doc.state.selection[0].startsWith('l'));
}

section('registerKind: unike prefiks og samlinger (punkt 9)');
{
  const doc = new CadDocument();
  let err = null;
  try { doc.registerKind('label', { collection: 'labels', prefix: 'l' }); } catch (e) { err = e.message; }
  ok('prefikset «l» er linjenes', /prefiks/i.test(err || ''), err);
  err = null;
  try { doc.registerKind('ting', { collection: 'shapes', prefix: 't' }); } catch (e) { err = e.message; }
  ok('samlingen «shapes» er formenes', /samling/i.test(err || ''), err);
  doc.registerKind('label', { collection: 'labels', prefix: 'lb' });
  const ln = doc.add('line', { points: [[0, 0], [1, 1]] });
  const lb = doc.add('label', { points: [[0, 0], [1, 1]] });
  ok('ulike prefiks gir ulike id-er', ln.id !== lb.id, `${ln.id} ${lb.id}`);
  let again = null;
  try { doc.registerKind('label', { collection: 'labels', prefix: 'lb' }); } catch (e) { again = e.message; }
  ok('samme type på nytt er lov (idempotent)', again === null, again);
}

done();
