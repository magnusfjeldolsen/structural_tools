/**
 * geometry.test.mjs — geometrilaget: arealegenskaper, hullregelen og søm av linjer.
 *
 *   node cad2d/tests/geometry.test.mjs
 */

import { ok, section, done, load, near, R } from './harness.mjs';

const { ringProps, analyze, circlePoints } = await load('js/geometry/polygon.js');
const { contoursFromLines } = await load('js/geometry/linework.js');
const { stitchPaths, nestRings } = await load('js/geometry/stitch.js');
const { circleRing } = await load('js/geometry/curves.js');
const { detectCircle, detectRect } = await load('js/geometry/params.js');

const solid = (id, points) => ({ id, points, role: 'solid', include: true, factor: 1 });
const hole = (id, points) => ({ id, points, role: 'void', include: true, factor: 1 });
const A = (shapes, mode) => analyze(shapes, mode).result.A;

section('Arealegenskaper');
{
  const p = ringProps(R(0, 0, 300, 600));
  ok('A = b·h', near(Math.abs(p.A), 180000));
}

section('Hullregelen: et hull skjærer alt fast areal det overlapper, uansett rekkefølge');
{
  const plate = solid('p', R(0, 0, 1000, 200));
  const web = solid('w', R(400, -400, 200, 400));
  const h = hole('h', R(450, -100, 100, 200)); // ligger over skjøten mellom plate og steg
  const expected = 1000 * 200 + 200 * 400 - 100 * 200;
  for (const mode of ['sum', 'priority']) {
    ok(`${mode}: hull først`, near(A([h, plate, web], mode), expected), `${A([h, plate, web], mode)}`);
    ok(`${mode}: hull sist`, near(A([plate, web, h], mode), expected), `${A([plate, web, h], mode)}`);
    ok(`${mode}: hull i midten`, near(A([plate, h, web], mode), expected));
  }
  const outside = hole('o', R(900, 150, 200, 100)); // halvt utenfor plata
  ok('hull som stikker ut trekker bare fra det det dekker', near(A([plate, outside], 'sum'), 200000 - 100 * 50));
}

section('Hulldekke: 1200×265 med 7 × Ø140');
{
  const shapes = [solid('p', R(-600, 0, 1200, 265))];
  for (let i = 0; i < 7; i++) shapes.push(hole(`h${i}`, circleRing([-495 + 165 * i, 132.5], 70, 48)));
  const exact = 1200 * 265 - 7 * Math.PI * 70 * 70;
  ok('areallik diskretisering gir analytisk areal', near(A(shapes, 'sum'), exact, 1e-9), `${A(shapes, 'sum')} mot ${exact}`);
}

section('Søm av linjer til konturer');
{
  const lines = [
    { id: 'a', points: [[0, 0], [100, 0]] },
    { id: 'b', points: [[100, 50], [100, 0]] },
    { id: 'c', points: [[100, 50], [0, 50]] },
    { id: 'd', points: [[0, 50], [0, 0]] },
    { id: 'løs', points: [[500, 500], [600, 600]] },
  ];
  const r = contoursFromLines(lines);
  ok('én kontur av fire linjer i vilkårlig retning', r.rings.length === 1 && near(Math.abs(ringProps(r.rings[0]).A), 5000));
  ok('løs linje rapporteres', r.unusedIds.join() === 'løs');
  const st = stitchPaths(lines.slice(0, 4).map((l) => ({ points: l.points, closed: false })));
  ok('stitchPaths lukker ringen', st.rings.length === 1);
  const nested = nestRings([R(0, 0, 100, 100), R(10, 10, 10, 10)]);
  ok('nestRings: ring i ring blir hull', nested.length === 1 && nested[0].holes.length === 1);
}

section('Parametriske former');
{
  ok('rektangel gjenkjennes', !!detectRect(R(0, 0, 30, 20)));
  ok('sirkel gjenkjennes', !!detectCircle(circlePoints(5, 5, 10)));
}

done();
