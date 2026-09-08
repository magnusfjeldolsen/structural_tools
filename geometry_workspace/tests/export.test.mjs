/**
 * export.test.mjs — eksportformatet, særlig den oppløste geometrien.
 *
 *   node geometry_workspace/tests/export.test.mjs
 *
 * Ingen avhengigheter utover vendorede `polygon-clipping`. Exit 0 / 1.
 *
 * Det denne fila passer på: at et mottakende verktøy (FEM-mesher, MCP-server)
 * kan lese `resolved` uten å kjenne én av redigeringsverktøyets konvensjoner.
 * Hull skal være ekte innerringer, alt i millimeter, omløpsretningen fast.
 */

import { createRequire } from 'node:module';

globalThis.window = globalThis;
globalThis.polygonClipping = createRequire(import.meta.url)('../vendor/polygon-clipping.umd.js');

const geom = await import('../js/geometry.js');
const { resolvedRegions, signedArea } = geom;

let failures = 0;
const tests = [];
let lines = [];
let bad = 0;
const test = (name, fn) => tests.push({ name, fn });

function ok(label, cond, note = '') {
  if (!cond) bad++;
  lines.push(`      ${cond ? 'ok  ' : 'FEIL'} ${label}${note ? '  (' + note + ')' : ''}`);
}

function close(label, actual, expected, tol = 1e-6) {
  const d = Math.abs(actual - expected);
  const rel = Math.abs(expected) > 1e-12 ? d / Math.abs(expected) : d;
  const good = Number.isFinite(actual) && rel <= tol;
  if (!good) bad++;
  lines.push(`      ${good ? 'ok  ' : 'FEIL'} ${label.padEnd(34)} = ${actual}  (fasit ${expected})`);
}

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// Steg 10 × 30 med en 4 × 10 utsparing, og en lask som overlapper 10 × 2.
// Arealer i arbeidsenheten: steg 300, hull 40, lask 70, overlapp 20.
const SHAPES = [
  {
    id: 's1', name: 'Steg', stage: 'existing', material: { name: 'GL30c', E: 13000 },
    points: rect(0, 0, 10, 30),
  },
  { id: 'v1', name: 'Hull', role: 'void', points: rect(3, 10, 4, 10) },
  {
    id: 's3', name: 'Lask', stage: 'new', material: { name: 'C24', E: 11000 },
    points: rect(0, 28, 10, 7),
  },
];

/** Netto areal av én region: ytterring minus hullene. */
function ringArea(ring) {
  return (
    Math.abs(signedArea(ring.outer)) -
    ring.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0)
  );
}

test('1. Hullet blir en ekte innerring i formen det ligger i', () => {
  const r = resolvedRegions(SHAPES, 'sum', 1);
  ok('void-formen er ikke en egen region', !r.regions.some((x) => x.id === 'v1'));
  const steg = r.regions.find((x) => x.id === 's1');
  ok('steget finnes', !!steg);
  ok('steget har én region', steg.rings.length === 1, `fikk ${steg.rings.length}`);
  ok('steget har ett hull', steg.rings[0].holes.length === 1, `fikk ${steg.rings[0].holes.length}`);
  // Ytterringen 300, hullet 40, netto 260.
  close('ytterring', Math.abs(signedArea(steg.rings[0].outer)), 300);
  close('innerring', Math.abs(signedArea(steg.rings[0].holes[0])), 40);
  close('netto for steget', ringArea(steg.rings[0]), 260);
});

test('2. Alt skaleres til millimeter, uansett arbeidsenhet', () => {
  // cm ⟹ k = 10, altså 100× på areal.
  const mm = resolvedRegions(SHAPES, 'sum', 1);
  const cm = resolvedRegions(SHAPES, 'sum', 10);
  close('areal skalerer med k²',
    Math.abs(signedArea(cm.regions[0].rings[0].outer)),
    Math.abs(signedArea(mm.regions[0].rings[0].outer)) * 100);
  close('netArea skalerer med k²', cm.netArea, mm.netArea * 100);
  // Og punktene er faktisk ganget opp, ikke bare arealet — det er den feilen
  // som ser plausibel ut i mm-modus og først dukker opp i meter.
  const pts = cm.regions.find((x) => x.id === 's1').rings[0].outer;
  ok('koordinat 10 → 100', pts.some(([x]) => Math.abs(x - 100) < 1e-9),
    JSON.stringify(pts.slice(0, 3)));
});

test('3. Omløpsretningen er fast, og ringene er lukket', () => {
  const r = resolvedRegions(SHAPES, 'sum', 1);
  for (const reg of r.regions) {
    for (const ring of reg.rings) {
      ok(`${reg.id}: ytterring mot klokka`, signedArea(ring.outer) > 0);
      const o = ring.outer;
      ok(`${reg.id}: ytterring lukket`,
        o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]);
      for (const h of ring.holes) {
        ok(`${reg.id}: innerring med klokka`, signedArea(h) < 0);
        ok(`${reg.id}: innerring lukket`,
          h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1]);
      }
    }
  }
});

test('4. Overlappet er oppgitt, slik at grossArea ≠ netArea kan forklares', () => {
  const r = resolvedRegions(SHAPES, 'sum', 1);
  // grossArea er skallmodellens: 300 + 70 = 370 (hullet ikke trukket fra der).
  close('grossArea', r.grossArea, 370);
  // netArea er det fysiske: union(300, 70) − 40 hull = 350 − 40 = 310.
  close('netArea', r.netArea, 310);
  close('overlapArea', r.overlapArea, 20);
  // Summen av regionene skal overstige netArea med NØYAKTIG overlappet. Det er
  // dette et mottakende verktøy trenger for å skjønne hvorfor dets eget A ikke
  // er verktøyets A — uten det blir avviket oppdaget som en «feil» senere.
  const sum = r.regions.reduce((acc, reg) => acc + reg.rings.reduce((a, ring) => a + ringArea(ring), 0), 0);
  close('Σ regioner = netArea + overlapp', sum, r.netArea + r.overlapArea);
});

test('5. Materiale og tilstand følger hver region', () => {
  const r = resolvedRegions(SHAPES, 'sum', 1);
  const steg = r.regions.find((x) => x.id === 's1');
  const lask = r.regions.find((x) => x.id === 's3');
  ok('steg er eksisterende', steg.stage === 'existing');
  ok('lask er ny', lask.stage === 'new');
  ok('steg har E = 13000', steg.material.E === 13000);
  ok('lask har E = 11000', lask.material.E === 11000);
});

test('6. priority-modus gir ikke-overlappende regioner', () => {
  // I priority-modus er array-rekkefølgen prioritet: steget kommer først og
  // beholder sitt, laska klippes mot det. Da er regionene disjunkte, og summen
  // av dem ER netArea — ingen overlapp å forklare.
  const r = resolvedRegions(SHAPES, 'priority', 1);
  close('overlapArea er fortsatt målt', r.overlapArea, 20);
  const sum = r.regions.reduce((acc, reg) => acc + reg.rings.reduce((a, ring) => a + ringArea(ring), 0), 0);
  close('Σ regioner = netArea', sum, r.netArea);
});

test('7. Tom modell gir ingen regioner, ikke et unntak', () => {
  const r = resolvedRegions([], 'sum', 1);
  ok('regions er tom', Array.isArray(r.regions) && r.regions.length === 0);
  close('netArea', r.netArea, 0);
});

console.log('\nexport.test.mjs — eksportformatet (oppløst geometri)\n');
for (const t of tests) {
  lines = [];
  bad = 0;
  try {
    t.fn();
  } catch (err) {
    bad++;
    lines.push(`      FEIL unntak: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err}`);
  }
  if (bad) failures++;
  console.log(`  ${bad ? '[FEIL]' : '[ OK ]'} ${t.name}`);
  for (const l of lines) console.log(l);
  console.log('');
}
console.log(`  ${tests.length - failures} av ${tests.length} tester bestått.\n`);
process.exit(failures > 0 ? 1 : 0);
