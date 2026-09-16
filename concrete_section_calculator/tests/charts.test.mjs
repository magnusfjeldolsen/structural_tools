/**
 * charts.test.mjs — M–κ, M–N og radiell utnyttelse.
 *
 * SVG-ene testes på STRUKTUR, ikke på piksler: at rot-elementet er et `<svg>`
 * med både `width` i forespurt enhet og `viewBox`, at kurven har like mange
 * punkter som datasettet, og at lastpunktet/strålen/M_Ed-linja faktisk er der.
 * En test som låser hele strengen ville feilet på hver eneste fargejustering
 * uten å ha fanget en eneste ekte feil.
 *
 * `radialUtilisation` testes derimot som rene tall, og det er hele grunnen til
 * at den er skilt ut fra `nmDomainSvg`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { momentCurvatureSvg, nmDomainSvg, radialUtilisation } from '../js/charts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const MC_BEAM = fixture('result-mc-beam-300x600.json').moment_curvature;
const MC_SLAB = fixture('result-mc-slab-1000x200.json').moment_curvature;
const DOM_BEAM = fixture('result-nmdomain-beam-300x600.json').nm_domain;
const DOM_SLAB = fixture('result-nmdomain-slab-1000x200.json').nm_domain;

/** `viewBox="0 0 w h"` -> `[0, 0, w, h]`. */
function viewBox(svg) {
  const m = /viewBox="([^"]+)"/.exec(svg);
  assert.ok(m, 'mangler viewBox');
  return m[1].trim().split(/\s+/).map(Number);
}

function countPoints(svg, role) {
  const m = new RegExp(`<polyline data-role="${role}" points="([^"]*)"`).exec(svg);
  assert.ok(m, `mangler polyline ${role}`);
  return m[1].trim().split(/\s+/).filter(Boolean).length;
}

/* ================================================================== *
 * radialUtilisation — ren tallfunksjon
 * ================================================================== */

/**
 * Syntetisk, bevisst IKKE-KONVEKS omhylling, i motorens enheter (N/Nmm) og med
 * FORTEGNSATT `m`. Formen er en «kam» som omslutter origo: randen går opp,
 * tilbake ned forbi strålen, og opp igjen.
 *
 * Den loddrette strålen (N_Ed = 0, M_Ed > 0) krysser den ved m = 60, 30 og
 * 10 kNm. **60 kommer FØRST i arrayet, 10 er det riktige svaret.** Det er
 * nettopp fella planen §6 advarer mot: punktrekkefølgen følger EC2-feltene og
 * sier ingenting om hvor strålen treffer først.
 *
 * Origo ligger innenfor: langs `n = 0` krysser randen ved m = −20, 10, 30 og
 * 60 — tre kryssinger over origo, altså et oddetall.
 */
const NONCONVEX = {
  n: [100, 100, -60, -60, 60, 60, -60, -100, -100, 100].map((v) => v * 1000),
  m: [-20, 60, 60, 30, 30, 10, 10, 10, -20, -20].map((v) => v * 1e6),
  N_min: -100 * 1000,
  N_max: 100 * 1000,
};

test('radialUtilisation: lastpunkt i origo gir ingen stråle', () => {
  assert.deepEqual(radialUtilisation(DOM_BEAM, 0, 0),
    { eta: 0, lambda: Infinity, hitN: null, hitM: null });
  // Også når omhyllingen er tom — ingen stråle å tegne, ingen NaN.
  assert.deepEqual(radialUtilisation({ n: [], m: [] }, 0, 0),
    { eta: 0, lambda: Infinity, hitN: null, hitM: null });
});

test('radialUtilisation: ikke-konveks kryssing velger MINSTE positive lambda', () => {
  const res = radialUtilisation(NONCONVEX, 0, 1);
  assert.equal(res.lambda, 10);            // ikke 60 (først i arrayet), ikke 30
  assert.equal(res.eta, 1 / 10);
  assert.ok(Math.abs(res.hitN - 0) < 1e-9);
  assert.ok(Math.abs(res.hitM - 10) < 1e-9);
});

test('radialUtilisation: lastpunkt utenfor omhyllingen gir eta > 1', () => {
  const ute = radialUtilisation(NONCONVEX, 0, 100);
  assert.ok(ute.lambda < 1, `lambda = ${ute.lambda}`);
  assert.ok(ute.eta > 1, `eta = ${ute.eta}`);
  assert.equal(ute.eta, 1 / ute.lambda);

  const inne = radialUtilisation(NONCONVEX, 0, 5);
  assert.ok(inne.lambda > 1);
  assert.ok(inne.eta < 1);
});

test('fixturene bærer et FORTEGNSATT moment, ikke en størrelse', () => {
  // Kontraktsvakt. Brettes `nm_domain.m` sammen til `abs` igjen — i motoren
  // eller i en «opprydding» her — feiler denne først, og med en melding som
  // sier hva som er galt i stedet for et plausibelt galt eta.
  for (const [navn, dom] of [['bjelke', DOM_BEAM], ['plate', DOM_SLAB]]) {
    const m = dom.m.map((v) => v / 1e6);
    assert.ok(Math.min(...m) < 0, `${navn}: støttegrenen skal ligge i -M`);
    assert.ok(Math.max(...m) > 0, `${navn}: feltgrenen skal ligge i +M`);
  }
  // Moment–krumning har bare én gren og forblir en STØRRELSE.
  assert.ok(Math.min(...MC_BEAM.moment) > 0, 'M–κ er fortsatt størrelser');
});

test('radialUtilisation: ren aksial last — omhyllingen styrer, ikke n_min', () => {
  // I den syntetiske kammen krysser randen M = 0 nøyaktig ved n = ±100, som
  // også er n_min/n_max. Da skal svaret være det samme uansett hvilken av dem
  // som «vinner».
  const trykk = radialUtilisation(NONCONVEX, -50, 0);
  assert.equal(trykk.lambda, 2);
  assert.equal(trykk.hitN, -100);
  assert.ok(Math.abs(trykk.hitM) < 1e-9);

  const strekk = radialUtilisation(NONCONVEX, 50, 0);
  assert.equal(strekk.lambda, 2);
  assert.equal(strekk.hitN, 100);

  // På ekte data er de IKKE like, og det er hele poenget: n_min = -4010,4 kN
  // er aksialkapasiteten ved uniform tøyning og bærer et moment for et
  // enkeltarmert snitt, mens omhyllingen krysser m = 0 allerede ved
  // n = -3567,1 kN. Returnerte funksjonen n_min, ville svaret vært 12 % på
  // usikker side.
  const ekte = radialUtilisation(DOM_BEAM, -2000, 0);
  assert.ok(Math.abs(ekte.hitN - (-3567.11)) < 0.5, `hitN = ${ekte.hitN}`);
  assert.ok(Math.abs(ekte.hitM) < 1e-9);
  assert.ok(ekte.lambda < 4010.438409731036 / 2000,
    'aksialgrensa skal aldri overstyre omhyllingen');
});

test('radialUtilisation: M_Ed = 0 og M_Ed nesten 0 gir praktisk talt samme svar', () => {
  // Kontinuitet over den degenererte saken: spranget i koden skal ikke være et
  // sprang i tallene. Dette er testen som fanger et gap mellom omhyllingen og
  // lukkingen langs M = 0.
  const eksakt = radialUtilisation(DOM_BEAM, -2000, 0);
  const nesten = radialUtilisation(DOM_BEAM, -2000, 1e-6);
  assert.ok(Math.abs(eksakt.lambda - nesten.lambda) / eksakt.lambda < 1e-6,
    `${eksakt.lambda} mot ${nesten.lambda}`);
});

test('radialUtilisation: nesten ren trykklast gir et ekte treff, ikke eta = 0', () => {
  // Lukkekjeden er sikringen mot at strålen smetter gjennom gapet mellom
  // omhyllingens ytterpunkt (n = -3977 kN) og n_min = -4010,4 kN.
  const res = radialUtilisation(DOM_BEAM, -2000, 1);
  assert.ok(Number.isFinite(res.lambda), 'strålen skal treffe randen');
  assert.ok(res.lambda > 1.7 && res.lambda < 1.9, `lambda = ${res.lambda}`);
  assert.ok(res.eta > 0.5 && res.eta < 0.6, `eta = ${res.eta}`);
});

test('radialUtilisation: (-500 kN, 150 kNm) treffer FELTGRENEN, ikke støttegrenen', () => {
  // Regresjonen som ga navn til kontraktsendringen. Med `abs(m_y)` ble
  // støttegrenen brettet opp i +M, havnet nærmest origo, og «minste positive
  // lambda» plukket den: eta ble ~3,7 mot en gren lasten aldri går i. Med
  // fortegnsatt m ligger støttegrenen i -M der den hører hjemme, og strålen
  // treffer feltgrenen ved n ~ -1150 kN.
  const res = radialUtilisation(DOM_BEAM, -500, 150);
  assert.ok(res.hitM > 0, `treffet skal ligge i +M, fikk ${res.hitM}`);
  assert.ok(res.hitN < 0, `treffet skal ligge i trykk, fikk ${res.hitN}`);
  assert.ok(res.eta > 0.35 && res.eta < 0.6, `eta = ${res.eta} (skal IKKE være ~3,7)`);
  assert.ok(res.lambda > 1.7 && res.lambda < 2.9, `lambda = ${res.lambda}`);
  // Treffet skal ligge på feltgrenen, altså i nærheten av toppmomentet
  // 364,3 kNm ved n = -1238 kN — ikke nede på støttegrenens ~40 kNm.
  assert.ok(res.hitM > 200, `hitM = ${res.hitM}`);
});

test('radialUtilisation: treffpunktet ligger på strålen', () => {
  for (const [n, m] of [[-500, 150], [0, 100], [200, 50], [-2500, 120]]) {
    const res = radialUtilisation(DOM_BEAM, n, m);
    assert.ok(Number.isFinite(res.lambda) && res.lambda > 0, `lambda for (${n}, ${m})`);
    assert.ok(Math.abs(res.hitN - res.lambda * n) < 1e-6 * (1 + Math.abs(res.hitN)));
    assert.ok(Math.abs(res.hitM - res.lambda * m) < 1e-6 * (1 + Math.abs(res.hitM)));
    assert.ok(Math.abs(res.eta - 1 / res.lambda) < 1e-12);
  }
});

test('radialUtilisation: fortegnet på M_Ed er likegyldig (M_Ed er en størrelse)', () => {
  const a = radialUtilisation(DOM_SLAB, -300, 60);
  const b = radialUtilisation(DOM_SLAB, -300, -60);
  assert.deepEqual(a, b);
});

/* ================================================================== *
 * momentCurvatureSvg
 * ================================================================== */

test('momentCurvatureSvg: rot-svg med width i forespurt enhet og viewBox', () => {
  const mm = momentCurvatureSvg(MC_BEAM, { width: 174, unit: 'mm' });
  assert.ok(mm.startsWith('<svg '), 'rot skal være <svg>');
  assert.ok(mm.trimEnd().endsWith('</svg>'));
  assert.match(mm, /width="174mm"/);
  const vb = viewBox(mm);
  assert.equal(vb.length, 4);
  assert.equal(vb[0], 0);
  assert.equal(vb[1], 0);
  assert.equal(vb[2], 174);            // 1 brukerenhet = 1 mm på papiret
  assert.ok(vb[3] > 0);

  const px = momentCurvatureSvg(MC_BEAM, { width: 600, unit: 'px' });
  assert.match(px, /width="600px"/);
  assert.equal(viewBox(px)[2], 600);
});

test('momentCurvatureSvg: ingen ekstern CSS eller klassestyring', () => {
  for (const svg of [
    momentCurvatureSvg(MC_BEAM, {}),
    nmDomainSvg(DOM_BEAM, { theme: 'dark' }),
  ]) {
    assert.ok(!/<style/.test(svg), 'ingen <style>');
    assert.ok(!/ class="/.test(svg), 'ingen class-attributter');
    assert.ok(!/<link/.test(svg), 'ingen <link>');
  }
});

test('momentCurvatureSvg: kurven har like mange punkter som datasettet', () => {
  assert.equal(countPoints(momentCurvatureSvg(MC_BEAM, {}), 'curve'), MC_BEAM.kappa.length);
  assert.equal(countPoints(momentCurvatureSvg(MC_SLAB, {}), 'curve'), MC_SLAB.kappa.length);
});

test('momentCurvatureSvg: tegner flytpunktet og M_Ed-linja selv', () => {
  const uten = momentCurvatureSvg(MC_BEAM, {});
  assert.match(uten, /data-role="yield-point"/);
  assert.ok(!/data-role="med-line"/.test(uten), 'M_Ed = 0 skal ikke gi en falsk lastlinje');

  const med = momentCurvatureSvg({ ...MC_BEAM, M_Ed: 200e6 }, {});
  assert.match(med, /data-role="med-line"/);
  assert.match(med, /M_Ed = 200,0 kNm/);      // Nmm -> kNm, norsk desimaltegn
});

test('momentCurvatureSvg: aksene står i kNm', () => {
  const svg = momentCurvatureSvg(MC_BEAM, {});
  assert.match(svg, />M \[kNm\]</);
  assert.match(svg, />κ \[10⁻⁶\/mm\]</);
  // Toppmomentet er 215,0 kNm; en akse i Nmm ville hatt merkelapper i 10^8.
  assert.match(svg, />200</);
});

test('momentCurvatureSvg: tomt datasett gir fortsatt gyldig svg', () => {
  const svg = momentCurvatureSvg({ kappa: [], moment: [], M_Ed: 0 }, {});
  assert.ok(svg.startsWith('<svg '));
  assert.ok(!/data-role="curve"/.test(svg));
});

/* ================================================================== *
 * nmDomainSvg
 * ================================================================== */

test('nmDomainSvg: omhyllingen har alle 69 punktene', () => {
  assert.equal(countPoints(nmDomainSvg(DOM_BEAM, {}), 'envelope'), DOM_BEAM.n.length);
  assert.equal(countPoints(nmDomainSvg(DOM_SLAB, {}), 'envelope'), DOM_SLAB.n.length);
});

test('nmDomainSvg: lastpunkt og stråle tegnes når lasten ikke er null', () => {
  const tom = nmDomainSvg(DOM_BEAM, {});      // N_Ed = M_Ed = 0 i fixturen
  assert.ok(!/data-role="load-point"/.test(tom));
  assert.ok(!/data-role="ray"/.test(tom));

  const lastet = nmDomainSvg({ ...DOM_BEAM, N_Ed: -500e3, M_Ed: 150e6 }, {});
  assert.match(lastet, /data-role="load-point"/);
  assert.match(lastet, /data-role="ray"/);
  assert.match(lastet, /data-role="ray-hit"/);
  assert.match(lastet, /\(150,0 kNm; -500,0 kN\)/);
  // Strålen skal merkes som det sekundære tallet den er (§5.2).
  assert.match(lastet, /lastvei \(sekundær\)/);
});

test('nmDomainSvg: aksene står i kN og kNm, med fortegnet sagt uttrykkelig', () => {
  const svg = nmDomainSvg(DOM_BEAM, {});
  assert.match(svg, />M \[kNm\]</);
  assert.match(svg, />N \[kN\]  \(trykk negativ\)</);
});

test('nmDomainSvg: temaene bytter farge, ikke struktur', () => {
  const lys = nmDomainSvg({ ...DOM_BEAM, N_Ed: -500e3, M_Ed: 150e6 }, { theme: 'print' });
  const mork = nmDomainSvg({ ...DOM_BEAM, N_Ed: -500e3, M_Ed: 150e6 }, { theme: 'dark' });
  assert.notEqual(lys, mork);
  for (const role of ['envelope', 'load-point', 'ray', 'axes', 'grid']) {
    assert.match(lys, new RegExp(`data-role="${role}"`));
    assert.match(mork, new RegExp(`data-role="${role}"`));
  }
  assert.equal(countPoints(lys, 'envelope'), countPoints(mork, 'envelope'));
});
