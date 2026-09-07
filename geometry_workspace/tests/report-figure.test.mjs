/**
 * report-figure.test.mjs — fasit for måltegningen i rapporten (§8.4 i
 * `global-devspecs/geometry_workspace-report-plan.md`).
 *
 *   node geometry_workspace/tests/report-figure.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Som i de tre andre testfilene er hver forventet verdi REGNET FOR HÅND i
 * kommentaren over sjekken, med mellomregning. To av testene finnes bare for å
 * fange feil som ser plausible ut helt til noen bytter enhet eller målestokk:
 *
 *   - «strekbredder uansett målestokk» fanger den skalerte gruppa (§7.4)
 *   - «meter gir samme papir som millimeter × 1000» fanger enhetsforvekslingen
 *     mellom arbeidsenhet og mm (§7.3)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Modullasting — data-URL-triks som i de andre testfilene, men her med
 * rekursiv innlining av relative importer: `report-figure.js` importerer
 * `unitInfo` fra `./units.js`, og en data-URL kan ikke løse `./`.
 * ------------------------------------------------------------------ */

function dataUrl(src) {
  return 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64');
}

async function inlineModule(relPath, from) {
  const url = new URL(relPath, from);
  let src = await readFile(fileURLToPath(url), 'utf8');
  const specs = new Set([...src.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map((m) => m[1]));
  for (const spec of specs) {
    const child = await inlineModule(spec, url);
    src = src.split(`'${spec}'`).join(`'${child}'`);
  }
  return dataUrl(src);
}

async function loadModule(relPath) {
  return import(await inlineModule(relPath, import.meta.url));
}

const fig = await loadModule('../js/report-figure.js');
const { buildFigureSvg, chooseScale, DRAW_BOX, LAYOUT, PAPER, SCALES } = fig;

/* ------------------------------------------------------------------ *
 * Minimal testløper — identisk med den i de tre andre testfilene
 * ------------------------------------------------------------------ */

const tests = [];
let lines = [];
let failedInCurrent = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function ok(label, cond, extra = '') {
  if (cond) {
    lines.push(`      ok  ${label}`);
  } else {
    failedInCurrent++;
    lines.push(`      FEIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, `fikk ${JSON.stringify(actual)}, ventet ${JSON.stringify(expected)}`);
}

function close(label, actual, expected, tol = 1e-9) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  ok(label, good, `fikk ${actual}, ventet ${expected} (±${tol})`);
}

/* ------------------------------------------------------------------ *
 * Modellbyggere
 * ------------------------------------------------------------------ */

function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

let shapeSeq = 0;
function shape(points, opts = {}) {
  shapeSeq++;
  return {
    id: opts.id || `s${shapeSeq}`,
    name: opts.name || `Form ${shapeSeq}`,
    points,
    role: opts.role || 'solid',
    stage: opts.stage || 'existing',
    color: opts.color || '#38bdf8',
    include: true,
    factor: 1,
    material: { name: opts.matName || 'S355', E: opts.E === undefined ? 210000 : opts.E },
  };
}

function model(over = {}) {
  return { unit: 'mm', mode: 'sum', shapes: [], joints: [], reference: null, analysis: null, res: null, ...over };
}

/* ------------------------------------------------------------------ *
 * Uttrekk fra SVG-strengen
 * ------------------------------------------------------------------ */

const partsGroup = (svg) => (/<g id="fig-parts">([\s\S]*?)<\/g>/.exec(svg) || [, ''])[1];
const pathTags = (frag) => frag.match(/<path\b[^>]*>/g) || [];
const strokeWidths = (svg) => [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => Number(m[1]));
// Figuren OPPGIR ikke lenger noen målestokk som synlig tekst — et oppgitt
// målestokkforhold er et løfte som brytes i det noen skriver ut med «tilpass
// til side». Den interne skaleringa finnes fortsatt (tegningen må passe i
// tegneflaten) og eksponeres som `data-scale`, som er det testene leser.
const scaleOf = (svg) => {
  const m = /data-scale="([0-9.]+)"/.exec(svg);
  return m ? Number(m[1]) : null;
};
/** Alle koordinatpar i et `d`-attributt. */
function dPoints(pathTag) {
  const d = (/ d="([^"]*)"/.exec(pathTag) || [, ''])[1];
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/* ================================================================== *
 * 1. Papirformatet
 * ================================================================== */

test('papirflaten er A4-trykkflatens 174 mm × 67 mm', () => {
  const svg = buildFigureSvg(model({ shapes: [shape(rect(0, 0, 200, 100))] }));
  ok('viewBox er «0 0 174 67»', svg.includes('viewBox="0 0 174 67"'), svg.slice(0, 200));
  ok('width="174mm"', svg.includes('width="174mm"'));
  ok('height="67mm"', svg.includes('height="67mm"'));
  ok('starter som <svg', svg.startsWith('<svg '));
  ok('avsluttes som </svg>', svg.trimEnd().endsWith('</svg>'));
  ok('har xmlns (kan lagres som frittstående .svg)', svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  // Høyden er justert flere ganger: 112 → 95 → 72 etter måling av hva side 1
  // rommer, og til slutt 67 da målestokkteksten forsvant og topplinja ble
  // frigitt. Tegneflaten er uendret 119,5 × 59 mm gjennom den siste endringen —
  // figuren ble lavere, ikke tegningen mindre.
  // Sjekken gjelder ATTRIBUTTENE, ikke hele strengen: et gammelt mål kunne ellers
  // dukke opp som en tilfeldig koordinat og gi falskt utslag.
  const head = svg.slice(0, svg.indexOf('>') + 1);
  ok('ingen rest av eldre format', !/112|"?(95|72)mm|0 0 174 (95|72)/.test(head), head);
  eq('PAPER.w', PAPER.w, 174);
  eq('PAPER.h', PAPER.h, 67);
});

/* ================================================================== *
 * 2. Tegneflaten — grunnlaget for alle målestokktallene under
 * ================================================================== */

test('tegneflaten er det som blir igjen etter tegnforklaringens kolonne', () => {
  // Håndregning, alt i mm i figurens eget viewBox:
  //   x = pad + marginLeft         = 2,5 + 3    =  5,5
  //   y = pad + headerH            = 2,5 + 0    =  2,5
  //   w = 174 − pad − rightW − gap − x = 174 − 2,5 − 44 − 2,5 −  5,5 = 119,5
  //   h =  67 − pad − marginBottom − y =  67 − 2,5 −  3 −  2,5       =  59
  close('DRAW_BOX.x', DRAW_BOX.x, 5.5);
  close('DRAW_BOX.y', DRAW_BOX.y, 2.5);
  close('DRAW_BOX.w', DRAW_BOX.w, 119.5);
  close('DRAW_BOX.h', DRAW_BOX.h, 59);
  eq('LAYOUT.rightW', LAYOUT.rightW, 44);
});

/* ================================================================== *
 * 3. Målestokkvalget — tabelldrevet (§7.5, punkt 2 og 4)
 * ================================================================== */

test('målestokken er den minste i lista der utsnittet får plass', () => {
  eq('lista er den i §7.4', SCALES.join(','), '1,2,2.5,5,10,20,25,50,100,200,250,500,1000');

  // Luftregelen (§7.5, punkt 2): 6 % på hver side, minst 10 mm i modellkoordinater.
  //
  //  # | form [mm]   | luft x/y [mm] | utsnitt [mm]   | / S ≤ 119,5 × 59   | S
  // ---+-------------+---------------+----------------+--------------------+----
  //  A |   60 ×  20  | 10   / 10     |    80 ×   40   | 80/1=80   40/1=40  | 1
  //  B |  300 × 100  | 18   / 10     |   336 ×  120   | 336/5=67,2  24     | 5
  //  C |  800 × 400  | 48   / 24     |   896 ×  448   | 896/10=89,6 44,8   | 10
  //  D | 3000 × 600  | 180  / 36     |  3360 ×  672   | 3360/50=67,2 13,4  | 50
  //  E |  100 ×1000  | 10   / 60     |   120 × 1120   | 1120/20=56 (høyden styrer) | 20
  //
  // Kontroll av at det er den MINSTE som velges:
  //  B: 336/2,5 = 134,4 > 119,5 ⟹ 2,5 er for fin, 5 er svaret
  //  C: 448/5   =  89,6 >  59   ⟹ 5 er for fin, 10 er svaret (høyden styrer)
  //  D: 3360/25 = 134,4 > 119,5 ⟹ 25 er for fin, 50 er svaret
  //  E: 1120/10 = 112   >  59   ⟹ 10 er for fin, 20 er svaret
  const table = [
    { w: 60, h: 20, S: 1 },
    { w: 300, h: 100, S: 5 },
    { w: 800, h: 400, S: 10 },
    { w: 3000, h: 600, S: 50 },
    { w: 100, h: 1000, S: 20 },
  ];
  for (const row of table) {
    const svg = buildFigureSvg(model({ shapes: [shape(rect(0, 0, row.w, row.h))] }));
    eq(`${row.w} × ${row.h} mm ⟹ 1:${row.S}`, scaleOf(svg), row.S);
  }

  // `chooseScale` direkte, uten luftregelen — 110,5 mm er akkurat 1:1.
  eq('chooseScale(119.5, 59) = 1', chooseScale(119.5, 59), 1);
  eq('chooseScale(119.6, 59) = 2', chooseScale(119.6, 59), 2);
  eq('chooseScale(239, 59) = 2', chooseScale(239, 59), 2);
  eq('chooseScale(1, 59.1) = 2', chooseScale(1, 59.1), 2);
  // Større enn den groveste målestokken: beskåret tegning slår ingen tegning.
  eq('chooseScale(1e9, 1e9) = 1000', chooseScale(1e9, 1e9), 1000);
});

test('skjøtelinjer utenfor konturen er med i utsnittet (§7.5, punkt 1)', () => {
  // Formen alene: 60 × 20 ⟹ 1:1 (rad A over).
  // Med en skjøt som stikker ut til x = 400 blir innholdet 0…400 × 0…20:
  //   luft x = maks(0,06·400; 10) = 24 ⟹ utsnitt 448 mm bredt
  //   448/2,5 = 179,2 > 110,5;  448/5 = 89,6 ≤ 110,5 ⟹ 1:5
  const shapes = [shape(rect(0, 0, 60, 20))];
  eq('uten skjøt', scaleOf(buildFigureSvg(model({ shapes }))), 1);
  const withJoint = buildFigureSvg(
    model({ shapes, joints: [{ id: 'j1', name: 'Skjøt 1', a: [0, 0], b: [400, 0] }] })
  );
  eq('med skjøt ut til x = 400 mm', scaleOf(withJoint), 5);
});

/* ================================================================== *
 * 4. Strekbredder — testen som fanger «skalert gruppe» (§7.4)
 * ================================================================== */

test('alle strekbredder ligger i [0,1; 1,0] mm uansett målestokk', () => {
  // Ville gruppa vært skalert med transform="scale(1/S)", ville 0,25 mm blitt
  // 0,25/S mm på papiret: 0,0125 mm ved 1:20 og 0,00025 mm ved 1:1000. Det er
  // under det en laserskriver kan sette, og er nettopp feilen §7.4 advarer mot.
  const cases = [
    { w: 60, h: 20, S: 1 },
    { w: 300, h: 100, S: 5 },
    { w: 3000, h: 600, S: 50 },
    { w: 300000, h: 60000, S: 1000 },
  ];
  for (const c of cases) {
    const svg = buildFigureSvg(
      model({
        shapes: [shape(rect(0, 0, c.w, c.h)), shape(rect(0, c.h, c.w / 2, c.h / 4), { stage: 'new', color: '#f472b6' })],
        joints: [{ id: 'j1', name: 'Skjøt 1', a: [0, c.h], b: [c.w / 2, c.h] }],
        res: {
          allExisting: false,
          parts: [],
          section: { xc: c.w / 2, yc: c.h / 2, valid: true },
          existingSection: { xc: c.w / 2, yc: c.h / 2.5, valid: true },
          axes: { after: { theta: 0.2, EI1: 2, EI2: 1, valid: true } },
          joints: [{ id: 'j1', existingOnly: false }],
        },
      })
    );
    eq(`målestokk 1:${c.S}`, scaleOf(svg), c.S);
    const ws = strokeWidths(svg);
    ok(`1:${c.S} — det finnes strekbredder å sjekke`, ws.length > 10, `fant ${ws.length}`);
    const bad = ws.filter((v) => !(v >= 0.1 && v <= 1.0));
    ok(`1:${c.S} — alle ${ws.length} strekbredder i [0,1; 1,0]`, bad.length === 0, `utenfor: ${bad.join(', ')}`);
  }
});

test('utdata inneholder ingen transform="scale("', () => {
  const svg = buildFigureSvg(
    model({
      shapes: [shape(rect(0, 0, 3000, 600)), shape(rect(0, 600, 1500, 200), { stage: 'new' })],
      joints: [{ id: 'j1', name: 'Skjøt 1', a: [0, 600], b: [1500, 600] }],
      reference: [0, 0],
      res: {
        allExisting: false,
        parts: [],
        section: { xc: 1500, yc: 320, valid: true },
        existingSection: { xc: 1500, yc: 300, valid: true },
        axes: { after: { theta: 0.05, EI1: 3, EI2: 1, valid: true } },
        joints: [{ id: 'j1', existingOnly: false }],
      },
    })
  );
  ok('ingen scale()', !svg.includes('transform="scale('), 'skalert gruppe funnet');
  ok('ingen skalering i det hele tatt', !/scale\s*\(/.test(svg));
  // `buildFigureSvg` skal ikke KUNNE ta imot lerretets kameratilstand (§7.5).
  eq('signaturen tar nøyaktig ett argument', buildFigureSvg.length, 1);
});

/* ================================================================== *
 * 5. Enhetene — testen som fanger arbeidsenhet vs. mm (§7.3)
 * ================================================================== */

test('geometri i meter gir samme papir som samme geometri i mm × 1000', () => {
  const mkShapes = (k) => [
    shape(rect(0, 0, 2 * k, 1 * k), { id: 'a', name: 'Steg', color: '#38bdf8' }),
    shape(rect(0, 1 * k, 1 * k, 0.2 * k), { id: 'b', name: 'Påstøp', color: '#f472b6', stage: 'new' }),
  ];
  const mkJoints = (k) => [{ id: 'j1', name: 'Skjøt 1', a: [0, 1 * k], b: [1 * k, 1 * k] }];
  const res = {
    allExisting: false,
    parts: [
      { id: 'a', E: 210000 },
      { id: 'b', E: 33000 },
    ],
    // Alt fra `computeReinforcement` er i MILLIMETER — også i m-modellen.
    section: { xc: 900, yc: 520, valid: true },
    existingSection: { xc: 1000, yc: 500, valid: true },
    axes: { after: { theta: 0.1, EI1: 5, EI2: 2, valid: true } },
    joints: [{ id: 'j1', existingOnly: false }],
  };
  const inMm = buildFigureSvg(model({ unit: 'mm', shapes: mkShapes(1000), joints: mkJoints(1000), reference: [0, 0], res }));
  const inM = buildFigureSvg(model({ unit: 'm', shapes: mkShapes(1), joints: mkJoints(1), reference: [0, 0], res }));
  eq('samme målestokk', scaleOf(inM), scaleOf(inMm));
  ok('byte for byte samme figur', inM === inMm, `mm: ${inMm.length} tegn, m: ${inM.length} tegn`);

  // Og i cm, for godt mål: 200 cm × 100 cm er de samme 2000 mm × 1000 mm.
  const inCm = buildFigureSvg(model({ unit: 'cm', shapes: mkShapes(100), joints: mkJoints(100), reference: [0, 0], res }));
  ok('cm gir også samme figur', inCm === inMm);
});

test('tyngdepunktet fra res (mm) lander på tverrsnittet, også i meter-modus', () => {
  // Formen er 0…2 m × 0…1 m, altså 0…2000 mm × 0…1000 mm. `res.section` er i
  // mm og peker på midten: (1000; 500). Merket skal derfor lande nøyaktig i
  // midten av den tegnede flaten. Glemmes mm-skaleringen av GEOMETRIEN, blir
  // formen 0…2 × 0…1 «mm» og korset havner 1000 «mm» ute i ingenting.
  const svg = buildFigureSvg(
    model({
      unit: 'm',
      shapes: [shape(rect(0, 0, 2, 1), { id: 'a' })],
      res: {
        allExisting: true,
        parts: [{ id: 'a', E: 210000 }],
        section: { xc: 1000, yc: 500, valid: true },
        existingSection: { xc: 1000, yc: 500, valid: true },
        axes: { after: { theta: 0, EI1: 2, EI2: 1, valid: true } },
        joints: [],
      },
    })
  );
  const pts = dPoints(pathTags(partsGroup(svg))[0]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const tp = /<g id="fig-centroid">[\s\S]*?<circle cx="([-\d.]+)" cy="([-\d.]+)"/.exec(svg);
  ok('tyngdepunktsmerket finnes', !!tp);
  if (tp) {
    close('TP x i midten av flaten [mm papir]', Number(tp[1]), midX, 0.002);
    close('TP y i midten av flaten [mm papir]', Number(tp[2]), midY, 0.002);
  }
});

/* ================================================================== *
 * 6. Hull (§7.3 / §7.4, punkt 1)
 * ================================================================== */

test('en form med ett hull gir ÉN <path> med to subpaths og evenodd', () => {
  // Hullmodellen: hullet er en EGEN form med role:'void', ikke en innerring.
  // Figuren skal likevel få ett hull, ikke to flater.
  const svg = buildFigureSvg(
    model({
      shapes: [
        shape(rect(0, 0, 200, 100), { id: 'plate', name: 'Plate' }),
        shape(rect(50, 25, 100, 50), { id: 'hull', name: 'Hull', role: 'void' }),
      ],
    })
  );
  const g = partsGroup(svg);
  const paths = pathTags(g);
  eq('nøyaktig én <path> i fig-parts', paths.length, 1);
  const d = (/ d="([^"]*)"/.exec(paths[0]) || [, ''])[1];
  eq('to subpaths (to M)', (d.match(/M/g) || []).length, 2);
  eq('to Z', (d.match(/Z/g) || []).length, 2);
  ok('fill-rule="evenodd"', paths[0].includes('fill-rule="evenodd"'));
  ok('hullformen er ikke tegnet som egen fylt flate', !g.includes('Hull'));
  // 4 hjørner i ytterringen + 4 i hullringen
  eq('åtte punkt i alt', dPoints(paths[0]).length, 8);

  // En void UTENFOR formen skal ikke punktere den — den ligger ikke inni.
  const outside = buildFigureSvg(
    model({
      shapes: [
        shape(rect(0, 0, 200, 100), { id: 'plate2' }),
        shape(rect(400, 0, 50, 50), { id: 'hull2', role: 'void' }),
      ],
    })
  );
  const p2 = pathTags(partsGroup(outside));
  eq('fortsatt bare én <path>', p2.length, 1);
  eq('bare én subpath', ((/ d="([^"]*)"/.exec(p2[0]) || [, ''])[1].match(/M/g) || []).length, 1);
});

test('har analysen alt trukket hullet fra, legges det ikke til én gang til', () => {
  // `analyze()` i 'priority'-modus (eller med polygon-clipping i nettleseren)
  // gir `parts[i].multi` en ekte innerring. Legger figuren i tillegg på
  // void-ringen, blir hullet krysset to ganger og evenodd fyller det igjen.
  const outer = [...rect(0, 0, 200, 100), [0, 0]];
  const inner = [...rect(50, 25, 100, 50), [50, 25]];
  const svg = buildFigureSvg(
    model({
      mode: 'priority',
      shapes: [
        shape(rect(50, 25, 100, 50), { id: 'hull', role: 'void' }),
        shape(rect(0, 0, 200, 100), { id: 'plate' }),
      ],
      analysis: {
        parts: [
          { id: 'hull', multi: [[inner]] },
          { id: 'plate', multi: [[outer, inner]] },
        ],
        netMulti: [[outer, inner]],
      },
    })
  );
  const paths = pathTags(partsGroup(svg));
  eq('én <path>', paths.length, 1);
  eq('to subpaths, ikke tre', (((/ d="([^"]*)"/.exec(paths[0]) || [, ''])[1]).match(/M/g) || []).length, 2);
});

/* ================================================================== *
 * 7. Nye deler skilles visuelt fra eksisterende (§7.4, punkt 2)
 * ================================================================== */

test('nye deler får stiplet kontur og skravur, eksisterende ikke', () => {
  const svg = buildFigureSvg(
    model({
      shapes: [
        shape(rect(0, 0, 200, 100), { id: 'old', name: 'Bjelke' }),
        shape(rect(0, 100, 200, 40), { id: 'new', name: 'Påstøp', stage: 'new', color: '#f472b6' }),
      ],
    })
  );
  const paths = pathTags(partsGroup(svg));
  eq('to former tegnet', paths.length, 2);
  ok('den eksisterende har hel strek', !paths[0].includes('stroke-dasharray'));
  ok('den nye er stiplet', paths[1].includes('stroke-dasharray="1.5 1"'));
  ok('den nye er skravert med et <pattern>', /fill="url\(#fig-hatch-1\)"/.test(paths[1]));
  ok('mønsteret er definert', svg.includes('<pattern id="fig-hatch-1"'));
  ok('id-prefikset kan byttes for to figurer på samme side', buildFigureSvg(
    model({ idPrefix: 'f2', shapes: [shape(rect(0, 0, 10, 10), { stage: 'new' })] })
  ).includes('<pattern id="f2-hatch-0"'));
  ok('tegnforklaringen nevner både ny og eksisterende', svg.includes('eksisterende') && svg.includes('· ny'));
});

/* ================================================================== *
 * 8. Skjøtene (§7.4, punkt 5)
 * ================================================================== */

test('skjøtene får J-merkelapper der typen står i teksten, ikke i streken', () => {
  const svg = buildFigureSvg(
    model({
      shapes: [
        shape(rect(0, 0, 200, 100), { id: 'a' }),
        shape(rect(0, 100, 200, 40), { id: 'b', stage: 'new' }),
      ],
      joints: [
        { id: 'j1', name: 'Skjøt 1', a: [0, 50], b: [200, 50] },
        { id: 'j2', name: 'Skjøt 2', a: [0, 100], b: [200, 100] },
      ],
      res: {
        allExisting: false,
        parts: [],
        section: { xc: 100, yc: 60, valid: true },
        existingSection: { xc: 100, yc: 50, valid: true },
        axes: { after: { theta: 0, EI1: 2, EI2: 1, valid: true } },
        joints: [
          { id: 'j1', existingOnly: true },
          { id: 'j2', existingOnly: false },
        ],
      },
    })
  );
  ok('J1 er merket eksisterende↔eksisterende', svg.includes('J1 ᴇ–ᴇ'));
  ok('J2 er merket mot ny del', svg.includes('J2 ᴇ–ɴ'));
  const jg = (/<g id="fig-joints">([\s\S]*?)<\/g>/.exec(svg) || [, ''])[1];
  // Begge skjøtestrekene er like brede og like farget — typen leses av merkelappen.
  const jointLines = jg.match(/stroke="#0d9488" stroke-width="0.6"/g) || [];
  eq('to like skjøtestreker', jointLines.length, 2);
  ok('ingen skjøtestrek er stiplet', !/stroke="#0d9488" stroke-width="0.6" stroke-dasharray/.test(jg));

  // Uten `res` finnes ikke typen, og merkelappen skal da være bare J1/J2.
  const bare = buildFigureSvg(
    model({ shapes: [shape(rect(0, 0, 200, 100))], joints: [{ id: 'j1', name: 'S', a: [0, 50], b: [200, 50] }] })
  );
  ok('uten res: bare «J1»', bare.includes('>J1<'));
  ok('uten res: ingen typekode', !bare.includes('ᴇ–'));
});

/* ================================================================== *
 * 9. Akser, tyngdepunkt og tegnforklaring
 * ================================================================== */

test('tegnforklaringen har maks 8 rader og teller resten', () => {
  const many = [];
  for (let i = 0; i < 11; i++) many.push(shape(rect(i * 100, 0, 80, 200), { name: `Del ${i + 1}`, E: 210000 }));
  const svg = buildFigureSvg(model({ shapes: many }));
  const rows = svg.match(/>Del \d+</g) || [];
  eq('åtte rader vist', rows.length, 8);
  ok('resten telles', svg.includes('… og 3 flere'), 'fant ikke overflytslinja');
  ok('E står i forklaringen', svg.includes('E = 210000 N/mm²'));
});

/* ================================================================== *
 * 10. Tomtilfellet
 * ================================================================== */

test('ingen former ⟹ gyldig SVG med «Ingen geometri i modellen»', () => {
  for (const m of [model(), model({ shapes: [] }), {}, undefined]) {
    const svg = buildFigureSvg(m);
    ok('teksten står der', svg.includes('Ingen geometri i modellen'));
    ok('riktig viewBox', svg.includes('viewBox="0 0 174 67"'));
    ok('riktig bredde', svg.includes('width="174mm"'));
    ok('balansert dokument', svg.startsWith('<svg ') && svg.endsWith('</svg>'));
    eq('ingen <path>', pathTags(svg).length, 0);
  }
  // Former uten nok punkt, eller avhuket bort, teller ikke som geometri.
  const skipped = buildFigureSvg(
    model({
      shapes: [
        { id: 'x', name: 'To punkt', points: [[0, 0], [1, 1]], role: 'solid', color: '#38bdf8' },
        { ...shape(rect(0, 0, 10, 10)), include: false },
      ],
    })
  );
  ok('degenererte/avhukede former gir tomtilfellet', skipped.includes('Ingen geometri i modellen'));
});

/* ================================================================== *
 * 11. Ren funksjon
 * ================================================================== */

test('samme modell gir samme figur, og modellen røres ikke', () => {
  const m = model({
    shapes: [shape(rect(0, 0, 300, 150), { id: 'a' }), shape(rect(0, 150, 300, 60), { id: 'b', stage: 'new' })],
    joints: [{ id: 'j1', name: 'Skjøt 1', a: [0, 150], b: [300, 150] }],
    reference: [0, 0],
  });
  const before = JSON.stringify(m);
  const a = buildFigureSvg(m);
  const b = buildFigureSvg(m);
  ok('deterministisk', a === b);
  eq('modellen er uendret', JSON.stringify(m), before);
  ok('ingen NaN i utdata', !a.includes('NaN'), 'NaN funnet i SVG-en');
  ok('ingen undefined i utdata', !a.includes('undefined'));
});

/* ================================================================== *
 * Kjøring
 * ================================================================== */

let failures = 0;
console.log('\nreport-figure.test.mjs — måltegningen av tverrsnittet (§7 i rapportplanen)\n');
for (const t of tests) {
  lines = [];
  failedInCurrent = 0;
  try {
    t.fn();
  } catch (err) {
    failedInCurrent++;
    lines.push(`      FEIL unntak: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err}`);
  }
  const bad = failedInCurrent > 0;
  if (bad) failures++;
  console.log(`  ${bad ? '[FEIL]' : '[ OK ]'} ${t.name}`);
  for (const l of lines) console.log(l);
  console.log('');
}

console.log(`  ${tests.length - failures} av ${tests.length} tester bestått.\n`);
process.exit(failures > 0 ? 1 : 0);
