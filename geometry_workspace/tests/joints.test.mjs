/**
 * joints.test.mjs — fasit for skjøtelogikken (naboskap, halvplan, grafen).
 *
 *   node geometry_workspace/tests/joints.test.mjs
 *
 * Ingen avhengigheter utover det som allerede ligger i repoet (vendorede
 * `polygon-clipping`). Exit-kode 0 når alt består, 1 ellers.
 *
 * VIKTIG: §8 i planen (global-devspecs/geometry_workspace-joints-plan.md)
 * overstyrer §2/§5.2 — `ES*` (og dermed `q_V`) regnes IKKE lenger ut fra
 * grafen, men ved å klippe geometrien mot et halvplan (se `joints.js`).
 * Grafen er beholdt, men bare for to ting: ΔN-ruting (`jointGroup`, matet inn
 * i `axialTransfer`) og advarslene (`danglingShapes`, `overConstrained`).
 * Testene under er organisert etter det skillet.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Modullasting — samme data-URL-triks som reinforcement.test.mjs, pluss ett
 * ekstra steg: geometry.js sin `intersectionMulti` (som halvplan-klippingen
 * i joints.js bruker) krever `window.polygonClipping`. I nettleseren kommer
 * det fra <script src="vendor/polygon-clipping.umd.js"> FØR geometry.js
 * lastes (se index.html). Vi gjør det samme her: setter `globalThis.window`
 * og laster vendor-fila FØR geometry.js, slik at `pc` i geometry.js blir satt.
 * ------------------------------------------------------------------ */

// `joints.js` importerer selv fra `./geometry.js` (i motsetning til
// reinforcement.test.mjs sine moduler, som ikke importerer noe internt) — en
// RELATIV specifier kan ikke løses fra en `data:`-URL (den har ingen katalog
// å løse imot; Node kaster ERR_UNSUPPORTED_RESOLVE_REQUEST). Løsningen:
// skriv om den relative importen til en absolutt `file://`-URL FØR vi koder
// kildeteksten som data-URL. Det er bare et testrigg-triks — selve
// `joints.js` er urørt, og importerer fortsatt relativt i nettleseren.
async function loadModule(relPath, rewrites = []) {
  const url = new URL(relPath, import.meta.url);
  let src = await readFile(fileURLToPath(url), 'utf8');
  for (const [specifier, targetRelPath] of rewrites) {
    const targetUrl = new URL(targetRelPath, import.meta.url).href;
    src = src.split(`from '${specifier}'`).join(`from '${targetUrl}'`);
  }
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64'));
}

globalThis.window = globalThis;
await loadModule('../vendor/polygon-clipping.umd.js');

const geom = await loadModule('../js/geometry.js');
const rf = await loadModule('../js/reinforcement.js');
const jt = await loadModule('../js/joints.js', [['./geometry.js', '../js/geometry.js']]);

const { rectPoints } = geom;
const { sectionEA, shearFlow, axialTransfer, anchorFlow, connectorCheck, weldCapacity, kNtoN } = rf;
const {
  shapesTouch, sidesOfJoint, buildGraph, jointGroup, danglingShapes, overConstrained,
  fullSectionParts, halfPlaneParts,
} = jt;

if (!geom.hasClipper()) {
  console.error('polygon-clipping ble ikke funnet — halvplan-klippingen kan ikke testes. Se modullastingen øverst i fila.');
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Minimal testløper (identisk stil med reinforcement.test.mjs)
 * ------------------------------------------------------------------ */

const tests = [];
let lines = [];
let failedInCurrent = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function deviation(actual, expected) {
  const d = Math.abs(actual - expected);
  return Math.abs(expected) > 1e-12 ? d / Math.abs(expected) : d;
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  return a >= 1e6 || a < 1e-3 ? v.toExponential(6) : v.toFixed(6);
}

function close(label, actual, expected, tol = 1e-6) {
  const dev = deviation(actual, expected);
  const ok = Number.isFinite(actual) && dev <= tol;
  if (!ok) failedInCurrent++;
  lines.push(
    `      ${ok ? 'ok  ' : 'FEIL'} ${label.padEnd(38)} = ${fmt(actual).padStart(14)}` +
    `  (fasit ${fmt(expected)}, avvik ${dev.toExponential(1)})`
  );
}

function ok(label, cond, note = '') {
  if (!cond) failedInCurrent++;
  lines.push(`      ${cond ? 'ok  ' : 'FEIL'} ${label}${note ? '  (' + note + ')' : ''}`);
}

function eqIds(label, actual, expected) {
  const a = [...actual].sort().join(',');
  const b = [...expected].sort().join(',');
  ok(`${label} = [${b}]`, a === b, `fikk [${a}]`);
}

/* ==================================================================== *
 * 1. De fire gruppetilfellene i §2-tabellen (jointGroup — grafen, brukes nå
 *    kun til ΔN-ruting og advarsler, IKKE til ES*, men selve
 *    komponentsplittingen skal fortsatt stemme).
 * ==================================================================== */

test('1a. Bjelke + lamell i underkant, én skjøt -> gruppa er lamellen', () => {
  const beam = { id: 'beam', stage: 'existing', points: rectPoints(0, 50, 200, 100) };   // y 50..150
  const lamell = { id: 'lamell', stage: 'new', points: rectPoints(0, 30, 200, 20) };      // y 30..50, møter bjelken ved y=50
  const j1 = { id: 'j1', a: [0, 50], b: [200, 50] };
  const shapes = [beam, lamell];
  const graph = buildGraph(shapes, [j1], 0.1);
  const g = jointGroup(j1, graph);
  eqIds('groupIds', g.groupIds, ['lamell']);
  eqIds('otherIds', g.otherIds, ['beam']);
  ok('determinate', g.determinate === true);
});

test('1b. Bjelke + plate topp og plate bunn, to skjøter -> hver skjøt får sin egen plate', () => {
  const beam = { id: 'beam', stage: 'existing', points: rectPoints(0, 50, 200, 100) };     // y 50..150
  const plateTop = { id: 'plateTop', stage: 'new', points: rectPoints(0, 150, 200, 20) };  // y 150..170
  const plateBottom = { id: 'plateBottom', stage: 'new', points: rectPoints(0, 30, 200, 20) }; // y 30..50
  const jointTop = { id: 'jointTop', a: [0, 150], b: [200, 150] };
  const jointBottom = { id: 'jointBottom', a: [0, 50], b: [200, 50] };
  const shapes = [beam, plateTop, plateBottom];
  const graph = buildGraph(shapes, [jointTop, jointBottom], 0.1);

  const gTop = jointGroup(jointTop, graph);
  eqIds('jointTop groupIds', gTop.groupIds, ['plateTop']);
  ok('jointTop determinate', gTop.determinate === true);

  const gBottom = jointGroup(jointBottom, graph);
  eqIds('jointBottom groupIds', gBottom.groupIds, ['plateBottom']);
  ok('jointBottom determinate', gBottom.determinate === true);
});

test('1c. Kjede bjelke - påforing A - lamell B: skjøten bjelke-A får A + B', () => {
  const beam = { id: 'beam', stage: 'existing', points: rectPoints(0, 50, 200, 100) };  // y 50..150
  const A = { id: 'A', stage: 'new', points: rectPoints(0, 150, 200, 20) };              // y 150..170
  const B = { id: 'B', stage: 'new', points: rectPoints(0, 170, 200, 20) };              // y 170..190
  const jointBeamA = { id: 'jointBeamA', a: [0, 150], b: [200, 150] };
  const jointAB = { id: 'jointAB', a: [0, 170], b: [200, 170] };
  const shapes = [beam, A, B];
  const graph = buildGraph(shapes, [jointBeamA, jointAB], 0.1);

  const g = jointGroup(jointBeamA, graph);
  // Poenget: B henger ikke direkte på skjøten bjelke-A, men kobles inn via
  // jointAB (som IKKE kuttes), så komponenten på A-siden etter kuttet er A+B.
  eqIds('groupIds (bjelke-A)', g.groupIds, ['A', 'B']);
  ok('determinate', g.determinate === true);

  const g2 = jointGroup(jointAB, graph);
  eqIds('groupIds (A-B)', g2.groupIds, ['B']);
});

// Delt av 1d, 2, 3 og 4 — en IPE-lignende I-profil tegnet som tre rektangler,
// sveis KUN mellom steg og overflens. Steg-underflens er ikke sveist —
// den kanten skal komme inn implisitt (§2).
const E_ALL = 210000; // N/mm², samme materiale overalt
function ipeShapes() {
  return [
    { id: 'overflens', stage: 'existing', material: { E: E_ALL }, points: rectPoints(-50, 190, 100, 10) }, // y 190..200
    { id: 'steg', stage: 'existing', material: { E: E_ALL }, points: rectPoints(-3, 10, 6, 180) },          // y 10..190
    { id: 'underflens', stage: 'existing', material: { E: E_ALL }, points: rectPoints(-50, 0, 100, 10) },   // y 0..10
  ];
}
const IPE_WELD = { id: 'weld', a: [-3, 190], b: [3, 190] };
const IPE_TOL = 0.5; // << 6 mm (stegets bredde) og << 10 mm (flenstykkelsen)

test('1d. I-profil, sveis kun flens-steg: gruppa er overflensen (steg+underflens henger implisitt sammen)', () => {
  const shapes = ipeShapes();
  const graph = buildGraph(shapes, [IPE_WELD], IPE_TOL);

  // Kontroller selve grafbyggingen først: steg-underflens skal IKKE ha noen
  // skjøt, men SKAL telle som naboer (implisitt kant) — det er nettopp denne
  // implisitte kanten som gjør at IPE-svaret blir riktig.
  ok('steg og underflens berører hverandre', shapesTouch(shapes[1], shapes[2], IPE_TOL));
  ok('steg-underflens har en implisitt kant i grafen',
    graph.implicitEdges.some((e) => (e.a === 'steg' && e.b === 'underflens') || (e.a === 'underflens' && e.b === 'steg')));
  ok('steg-underflens har IKKE en eksplisitt skjøtkant',
    !graph.edges.some((e) => (e.a === 'steg' && e.b === 'underflens') || (e.a === 'underflens' && e.b === 'steg')));

  const g = jointGroup(IPE_WELD, graph);
  // Alle tre er eksisterende ⟹ velg minste komponent (§2): {overflens} (1
  // del) er mindre enn {steg, underflens} (2 deler).
  eqIds('groupIds', g.groupIds, ['overflens']);
  eqIds('otherIds', g.otherIds, ['steg', 'underflens']);
  ok('determinate', g.determinate === true);
});

/* ==================================================================== *
 * 2. I-profil, sveis flens-steg — ES* GJENNOM HALVPLANET (§8), med
 *    håndregnet fasit.
 * ==================================================================== */

test('2. I-profil: q i sveisen flens-steg via halvplanet — håndregnet fasit', () => {
  // ------------------------------------------------------------------
  // HÅNDREGNING (regnet fra bunnen av, ikke slått opp)
  // ------------------------------------------------------------------
  // Geometri: overflens 100x10 (y=190..200), steg 6x180 (y=10..190),
  // underflens 100x10 (y=0..10). E = 210000 N/mm² overalt, så nøytralaksen
  // og EI kan regnes som ren geometri og ganges med E til slutt.
  //
  // Areal:  A_of = 1000, A_w = 1080, A_uf = 1000   (mm²)
  // Tyngdepunkt hver del (fra y=0): ȳ_of=195, ȳ_w=100, ȳ_uf=5
  //
  // Statisk moment om y=0:
  //   S = 1000*195 + 1080*100 + 1000*5 = 195000 + 108000 + 5000 = 308000 mm³
  // Totalt areal: A = 1000+1080+1000 = 3080 mm²
  //   y_c = 308000/3080 = 100 mm   (nøyaktig — profilen er symmetrisk om
  //   midten, som den bør være med like flenser)
  //
  // Treghetsmoment om y_c (Steiner på hver del):
  //   I_egen,flens = 100*10³/12 = 25000/3 mm⁴
  //   d_of = 195-100 = 95  ⟹  I_of = 25000/3 + 1000*95² = 25000/3 + 9 025 000
  //                              = 27 100 000/3 mm⁴  (= 9 033 333.333...)
  //   d_uf = 5-100 = -95, samme areal og |d| ⟹ I_uf = 27 100 000/3 mm⁴
  //   I_egen,steg = 6*180³/12 = 34 992 000/12 = 2 916 000 mm⁴, d_w = 0
  //     (steget er symmetrisk om y_c) ⟹ I_w = 2 916 000 mm⁴
  //
  //   I_tot = 2 * 27 100 000/3 + 2 916 000
  //         = 54 200 000/3 + 8 748 000/3 = 62 948 000/3 = 20 982 666.667 mm⁴
  //
  //   EI = 210000 * 62 948 000/3 = 70000 * 62 948 000 = 4 406 360 000 000 Nmm²
  //   (210000/3 = 70000 er eksakt, så EI er et helt tall — ingen avrunding her)
  //
  // ES* for GRUPPA over sveisen (halvplanet y > 190, altså overflensen alene):
  //   ES*_of = E * A_of * (ȳ_of - y_c) = 210000 * 1000 * (195-100)
  //          = 210000 * 1000 * 95 = 19 950 000 000 Nmm  (= 1.995e10)
  //
  // q = V * ES* / EI, V = 100 kN = 100000 N:
  //   q = 100000 * 19 950 000 000 / 4 406 360 000 000
  //     = 199 500 000 000 000 000 / 4 406 360 000 000  (forkortet: 1.995e15/4.40636e12)
  //   Lang divisjon (199 500 000 / 440 636, forkortet med 4 til 49 875 000/110 159):
  //     452 |remainder 83132 -> 452.75465463...
  //   q ≈ 452.754655 N/mm
  const Q_HAND = 452.7546546; // se lang divisjon over, ~8 sikre siffer

  const shapes = ipeShapes();
  const graph = buildGraph(shapes, [IPE_WELD], IPE_TOL);
  const g = jointGroup(IPE_WELD, graph);
  eqIds('gruppa fra grafen (til info/ΔN — brukes IKKE til ES*)', g.groupIds, ['overflens']);

  const fullParts = fullSectionParts(shapes);
  const section = sectionEA(fullParts);
  close('y_c [mm]', section.yc, 100, 1e-9);
  close('EI_x [Nmm²]', section.EIx, 4406360000000, 1e-9);

  // Selve poenget: gruppa til ES* kommer fra HALVPLANET (§8), ikke fra grafen.
  const groupParts = halfPlaneParts(IPE_WELD, shapes, +1); // +1 = venstre for a→b = oppover her, dvs. over sveisen
  ok('halvplan-gruppa er nøyaktig overflensen (ett element)', groupParts.length === 1 && groupParts[0].id === 'overflens');
  close('klippet areal = hele overflensen [mm²]', Math.abs(groupParts[0].props.A), 1000, 1e-6);

  const flow = shearFlow({ V: kNtoN(100), groupParts, section });
  close('ES* [Nmm]', flow.EStar, 19950000000, 1e-6);
  close('q [N/mm] — halvplan mot håndregning', flow.qAbs, Q_HAND, 1e-6);
});

/* ==================================================================== *
 * 3. |q| uavhengig av hvilken side av halvplanet man velger
 * ==================================================================== */

test('3. Halvplan: |q| er identisk uansett hvilken side som velges (side=+1 vs side=-1)', () => {
  // ES* for HELE tverrsnittet er null per definisjon av nøytralaksen, og
  // side=+1-gruppa og side=-1-gruppa er hverandres komplement (opp til
  // klippetoleranse) — så ES*_(+1) = −ES*_(-1), og |q| er lik. Ingen side er
  // et brukervalg for q_V (§1).
  const shapes = ipeShapes();
  const fullParts = fullSectionParts(shapes);
  const section = sectionEA(fullParts);
  const V = kNtoN(100);

  const above = shearFlow({ V, groupParts: halfPlaneParts(IPE_WELD, shapes, +1), section });
  const below = shearFlow({ V, groupParts: halfPlaneParts(IPE_WELD, shapes, -1), section });

  ok('side=-1 gruppa er steg+underflens', (() => {
    const ids = halfPlaneParts(IPE_WELD, shapes, -1).map((p) => p.id).sort();
    return ids.join(',') === 'steg,underflens';
  })());
  close('ES* motsatt fortegn', above.EStar, -below.EStar, 1e-6);
  close('|q| likt fra begge sider', above.qAbs, below.qAbs, 1e-6);
  ok('fortegnene er motsatte', Math.sign(above.q) === -Math.sign(below.q));
});

/* ==================================================================== *
 * 4. Ren eksisterende konstruksjon: q_N = 0 uten spesialtilfelle
 * ==================================================================== */

test('4. Ren eksisterende konstruksjon gir q_N = 0 — faller ut naturlig, ikke spesialtilfelle', () => {
  // ΔN er aksialkraften som må inn i "nye" deler gjennom skjøten (§1, §3).
  // Grafen brukes bare til å plukke ut HVILKE deler som er "nye" og ligger
  // på riktig side av skjøten (jointGroup, §8.3) — når ALT er eksisterende,
  // er den mengden per definisjon tom, og axialTransfer summerer over et tomt
  // sett. Det gir dN = 0 av seg selv; ingen "if (alt eksisterende) return 0"
  // noe sted i koden.
  const shapes = ipeShapes(); // alle stage: 'existing'
  const graph = buildGraph(shapes, [IPE_WELD], IPE_TOL);
  const g = jointGroup(IPE_WELD, graph);

  const newIdsInGroup = g.groupIds.filter((id) => graph.shapesById.get(id).stage === 'new');
  ok('ingen nye deler i gruppa (alt er eksisterende)', newIdsInGroup.length === 0);

  const fullParts = fullSectionParts(shapes);
  const transfer = axialTransfer({ N: kNtoN(300), parts: fullParts, groupIds: newIdsInGroup });
  close('dN [N] — tomt sett gir 0 uten special-case', transfer.dN, 0, 0);

  const anchor = anchorFlow({ dN: transfer.dN, L: 1000 });
  close('q_N [N/mm]', anchor.q, 0, 0);
  ok('anchorFlow er fortsatt valid=true (L>0) — det er dN som er 0, ikke regnestykket som feiler', anchor.valid === true);
});

/* ==================================================================== *
 * 5. Superposisjon av "før" og "etter" (§3)
 * ==================================================================== */

test('5. Superposisjon: V_before=V_after=V/2 gir samme q_V,tot som V_before=0,V_after=V (rent eksisterende tverrsnitt)', () => {
  // Er alt eksisterende, er "før"- og "etter"-tverrsnittet det SAMME
  // tverrsnittet (ingen ny del er lagt til) — det er nettopp derfor
  // superposisjonen blir en triviell algebraisk identitet:
  //   |k·V/2| + |k·V/2| = |k|·V = |k·V|,   k = ES*/EI likt i begge ledd.
  // Testen kjører de faktiske funksjonene, ikke bare påstår identiteten.
  const rect = { id: 'r', stage: 'existing', material: { E: E_ALL }, points: rectPoints(0, 0, 100, 300) };
  const seam = { id: 'seam', a: [0, 150], b: [100, 150] }; // en gammel, eksisterende søm — illustrativ, ikke nødvendig for halvplanet
  const shapes = [rect];

  const fullParts = fullSectionParts(shapes);
  const section = sectionEA(fullParts);
  const groupParts = halfPlaneParts(seam, shapes, +1);

  const V = kNtoN(100);
  const qBeforeHalf = shearFlow({ V: V / 2, groupParts, section }).q;
  const qAfterHalf = shearFlow({ V: V / 2, groupParts, section }).q;
  const qTotA = Math.abs(qBeforeHalf) + Math.abs(qAfterHalf);

  const qBeforeZero = 0; // V_before = 0
  const qAfterFull = shearFlow({ V, groupParts, section }).q;
  const qTotB = Math.abs(qBeforeZero) + Math.abs(qAfterFull);

  close('q_V,tot like store i begge lasttilfeller [N/mm]', qTotA, qTotB, 1e-9);
  ok('begge er faktisk beregnet (ikke null av vanvare)', qTotA > 0);
});

/* ==================================================================== *
 * 6. Statisk ubestemt: del festet med to skjøter samtidig
 * ==================================================================== */

test('6. Statisk ubestemt (U-profil + plate, to skjøter): determinate=false, flagges, deles likt', () => {
  // "U-profilen": base (ryggen) + to flenser, alt eksisterende, tegnet som
  // tre rektangler som berører hverandre (ingen skjøt trengs internt — det
  // er samme fysiske stykke). En ny plate lukker profilen til en boks, festet
  // med separate skjøter til BEGGE flensene.
  const base = { id: 'base', stage: 'existing', points: rectPoints(0, 0, 10, 100) };           // x 0..10,  y 0..100
  const flangeTop = { id: 'flangeTop', stage: 'existing', points: rectPoints(10, 90, 90, 10) }; // x 10..100, y 90..100
  const flangeBottom = { id: 'flangeBottom', stage: 'existing', points: rectPoints(10, 0, 90, 10) }; // x 10..100, y 0..10
  const plate = { id: 'plate', stage: 'new', points: rectPoints(100, 0, 10, 100) };             // x 100..110, y 0..100

  const jointTop = { id: 'jointTop', a: [100, 90], b: [100, 100] };
  const jointBottom = { id: 'jointBottom', a: [100, 0], b: [100, 10] };
  const shapes = [base, flangeTop, flangeBottom, plate];
  const joints = [jointTop, jointBottom];
  const graph = buildGraph(shapes, joints, 0.1);

  // Sanity: platen berører begge flensene, men IKKE ryggen (base) direkte.
  ok('plate berører flangeTop', shapesTouch(plate, flangeTop, 0.1));
  ok('plate berører flangeBottom', shapesTouch(plate, flangeBottom, 0.1));
  ok('plate berører IKKE base direkte', !shapesTouch(plate, base, 0.1));

  const gTop = jointGroup(jointTop, graph);
  const gBottom = jointGroup(jointBottom, graph);
  ok('jointTop er IKKE en bro (kuttes den alene, holder jointBottom platen fast)', gTop.determinate === false);
  ok('jointBottom er IKKE en bro heller (symmetrisk situasjon)', gBottom.determinate === false);

  const flagged = overConstrained(shapes, joints, graph);
  ok('minst én kropp flagges som statisk ubestemt', flagged.length >= 1);
  const plateEntry = flagged.find((e) => e.shapeIds.includes('plate'));
  ok('platen er blant de flagget', !!plateEntry, JSON.stringify(flagged));
  if (plateEntry) {
    eqIds('platen er festet med akkurat disse to skjøtene', plateEntry.jointIds, ['jointTop', 'jointBottom']);
    // Automatisk fordeling: likt mellom de aktuelle skjøtene, inntil brukeren
    // overstyrer med `share` på hver skjøt (§2). Illustrert her, ikke en
    // funksjon i joints.js — `share` er et datafelt UI-laget setter.
    const autoShare = 1 / plateEntry.jointIds.length;
    close('automatisk andel pr. skjøt', autoShare, 0.5, 1e-12);
  }
});

/* ==================================================================== *
 * 7. Sveisekapasitet
 * ==================================================================== */

test('7. Sveisekapasitet: nWelds=2, a=4mm, fvwd=207 N/mm² gir qRd=1656 N/mm; q=828 gir 50 %', () => {
  // HÅNDREGNING: q_Rd = n·a·f_vw,d = 2*4*207 = 1656 N/mm
  const connector = { kind: 'weld', a_weld: 4, fvwd: 207, nWelds: 2 };
  const qRd = weldCapacity(connector);
  close('q_Rd [N/mm]', qRd, 1656, 1e-12);

  const check = connectorCheck({ q: 828, connector });
  close('utnyttelse', check.util, 0.5, 1e-12);
  ok('sReq er null for sveis (ikke Infinity — det finnes ingen senteravstand å kreve)', check.sReq === null);
  ok('ok=true ved 50 % utnyttelse', check.ok === true);

  // Eksplisitt qRd skal vinne over den avledede kapasiteten.
  const overridden = weldCapacity({ qRd: 999, a_weld: 4, fvwd: 207, nWelds: 2 });
  close('eksplisitt qRd overstyrer utledningen', overridden, 999, 1e-12);

  // Manglende data skal gi 0 / valid=false, ikke NaN.
  const missing = connectorCheck({ q: 100, connector: { kind: 'weld' } });
  ok('manglende sveisedata gir valid=false, ikke NaN', missing.valid === false && missing.util === null);
});

/* ==================================================================== *
 * 8. shapesTouch — delt kant, overlapp, og "nær men ikke i kontakt"
 * ==================================================================== */

test('8. shapesTouch: delt kant og overlapp er naboer; 1 mm avstand er det ikke (tol < 1 mm)', () => {
  const rectA = { points: rectPoints(0, 0, 10, 10) };          // x 0..10
  const sharedEdge = { points: rectPoints(10, 0, 10, 10) };    // x 10..20 — deler kanten x=10 med rectA
  const overlap = { points: rectPoints(5, 0, 10, 10) };        // x 5..15 — overlapper rectA
  const gap = { points: rectPoints(11, 0, 10, 10) };           // x 11..21 — 1 mm klaring til rectA

  ok('delt kant -> naboer', shapesTouch(rectA, sharedEdge, 0.01));
  ok('overlapp -> naboer', shapesTouch(rectA, overlap, 0.01));
  ok('1 mm avstand, tol = 0.5 mm -> IKKE naboer', !shapesTouch(rectA, gap, 0.5));
  ok('1 mm avstand, tol = 2 mm -> naboer (toleransen slår inn)', shapesTouch(rectA, gap, 2));
});

/* ==================================================================== *
 * 9. §8.4 punkt 9 — halvplanet på ETT udelt polygon
 * ==================================================================== */

test('9. Snitt gjennom én monolittisk form (ikke delt i to): q = 250 N/mm, samme som splittet geometri', () => {
  // Dette ER poenget med halvplanet (§8.2): brukeren skal ikke måtte dele
  // opp en importert profil for å kunne snitte i den. Rektangelet er
  // UDELT — ett eneste polygon, én "form" i modellen.
  //
  // HÅNDREGNING (samme tall som "1. Homogent rektangel" i
  // reinforcement.test.mjs, men der var det manuelt delt i to former):
  //   I = b·h³/12 = 100·300³/12 = 2.25e8 mm⁴
  //   Q = A_topphalvdel · avstand til NA = (100·150)·75 = 1.125e6 mm³
  //   V = 50 kN = 50000 N
  //   q = V·Q/I = 50000·1.125e6/2.25e8 = 250 N/mm
  const rect = { id: 'r', stage: 'existing', material: { E: E_ALL }, points: rectPoints(0, 0, 100, 300) };
  const cut = { id: 'cut', a: [0, 150], b: [100, 150] };
  const shapes = [rect];

  const fullParts = fullSectionParts(shapes);
  const section = sectionEA(fullParts);
  close('y_c [mm]', section.yc, 150, 1e-9);
  close('EI_x [Nmm²]', section.EIx, E_ALL * 2.25e8, 1e-9);

  const groupParts = halfPlaneParts(cut, shapes, +1);
  ok('halvplan-gruppa er ETT element (samme udelte form, klippet)', groupParts.length === 1 && groupParts[0].id === 'r');
  close('klippet areal = topphalvdelen [mm²]', Math.abs(groupParts[0].props.A), 15000, 1e-9);

  const flow = shearFlow({ V: kNtoN(50), groupParts, section });
  close('q [N/mm] — udelt form via halvplan', flow.qAbs, 250, 1e-9);
});

/* ==================================================================== *
 * 10. §8.4 punkt 10 — loddrett snitt, V_x
 * ==================================================================== */

test('10. Loddrett snitt i samme rektangel (halv bredde), V_x: håndregnet fasit', () => {
  // HÅNDREGNING
  //   Rektangelet er 100 (x) x 300 (y). Snittet er LODDRETT ved x = 50,
  //   altså halv bredde — det deler tverrsnittet i to 50x300-halvdeler.
  //   I_y = h·b³/12 = 300·100³/12 = 300·1 000 000/12 = 25 000 000 mm⁴ = 25e6 mm⁴
  //   Q  = A_halvdel · avstand fra x_c til halvdelens tyngdepunkt
  //      = (50·300) · |25 − 50| = 15000 · 25 = 375 000 mm³
  //   V_x = 50 kN = 50000 N
  //   q_x = V_x·Q/I_y = 50000 · 375000 / 25 000 000 = 50000 · 0.015 = 750 N/mm
  const rect = { id: 'r', stage: 'existing', material: { E: E_ALL }, points: rectPoints(0, 0, 100, 300) };
  const cut = { id: 'vcut', a: [50, 0], b: [50, 300] };
  const shapes = [rect];

  const fullParts = fullSectionParts(shapes);
  const section = sectionEA(fullParts);
  close('x_c [mm]', section.xc, 50, 1e-9);
  close('EI_y [Nmm²]', section.EIy, E_ALL * 25e6, 1e-9);

  const groupParts = halfPlaneParts(cut, shapes, +1); // venstre halvdel, x = 0..50
  close('klippet areal = venstre halvdel [mm²]', Math.abs(groupParts[0].props.A), 15000, 1e-9);

  const flow = shearFlow({ V: kNtoN(50), groupParts, section, axis: 'x' });
  ok('riktig akse merket', flow.axis === 'x');
  close('ES*_y [Nmm] mot håndregning', Math.abs(flow.EStar), E_ALL * 375000, 1e-9);
  close('q_x [N/mm] — håndregnet fasit', flow.qAbs, 750, 1e-9);
});

/* ================================================================== *
 * Kjøring
 * ================================================================== */

let failures = 0;
console.log('\njoints.test.mjs — skjøtelogikk (naboskap, halvplan, grafen)\n');
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
