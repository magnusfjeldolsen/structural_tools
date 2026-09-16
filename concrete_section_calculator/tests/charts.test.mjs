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
import { drawSection } from '../js/section-draw.js';

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
  assert.match(med, /M_Ed = 200\.0 kNm/);      // Nmm -> kNm, engelsk desimalpunktum
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

/**
 * `DOM_BEAM` er regenerert etter bølge 1 og bærer nå selv én kombinasjon
 * (`C1`, `N_Ed = M_Ed = 0`, `governing: 'C1'`). Reserveveien (§7) testes derfor
 * ved eksplisitt å fjerne `combinations`/`governing` igjen — det er den eneste
 * måten å bevise at fraværet av feltet er det som styrer, ikke en tilfeldighet
 * ved fixturens tall.
 */
const noCombos = (dom, extra = {}) => ({ ...dom, combinations: undefined, governing: undefined, ...extra });

test('nmDomainSvg: uten dom.combinations er oppførselen den samme reserveveien som før', () => {
  const tom = nmDomainSvg(noCombos(DOM_BEAM), {});
  assert.ok(!/data-role="load-point"/.test(tom));
  assert.ok(!/data-role="load-point-governing"/.test(tom));
  assert.ok(!/data-role="ray"/.test(tom));

  const lastet = nmDomainSvg(noCombos(DOM_BEAM, { N_Ed: -500e3, M_Ed: 150e6 }), {});
  assert.match(lastet, /data-role="load-point"/);
  assert.ok(!/data-role="load-point-governing"/.test(lastet));
  assert.match(lastet, /data-role="ray"/);
  assert.match(lastet, /data-role="ray-hit"/);
  assert.match(lastet, /\(150\.0 kNm; -500\.0 kN\)/);
  // Strålen skal merkes som det sekundære tallet den er (§5.2).
  assert.match(lastet, /load path \(secondary\)/);
});

/**
 * Syntetisk sett med tre kombinasjoner, bygd oppå DOM_BEAM sin ekte omhylling:
 * C1 innenfor (ikke governing), C2 governing, C3 utenfor grensene og derfor
 * IKKE tegnet i det hele tatt (planen §7 sier «med `within_limits: true`»).
 */
const MULTI = {
  ...DOM_BEAM,
  combinations: [
    { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, within_limits: true },
    { id: 'C2', name: 'ULS 2', N_Ed: -500000, M_Ed: 150000000, within_limits: true },
    { id: 'C3', name: 'ULS 3', N_Ed: -5000000, M_Ed: 100000000, within_limits: false },
  ],
  governing: 'C2',
  // Toppnivåfeltene speiler governing (motorens §4.3) — akkurat som i ekte data.
  N_Ed: -500000,
  M_Ed: 150000000,
};

test('nmDomainSvg: hver kombinasjon med within_limits får et punkt; governing skiller seg ut', () => {
  const svg = nmDomainSvg(MULTI, {});

  const governingCount = (svg.match(/data-role="load-point-governing"/g) || []).length;
  const plainCount = (svg.match(/data-role="load-point"/g) || []).length;
  assert.equal(governingCount, 1, 'nøyaktig én governing-markør (C2)');
  assert.equal(plainCount, 1, 'nøyaktig én ikke-governing-markør (C1) — C3 er utenfor grensene');

  // Governing får etikett med navn, de øvrige ingen.
  assert.match(svg, />ULS 2</);
  assert.ok(!/>ULS 1</.test(svg), 'ikke-governing skal IKKE ha etikett');
  assert.ok(!/ULS 3/.test(svg), 'C3 er utenfor grensene og skal ikke tegnes i det hele tatt');

  // Strålen følger fortsatt bare governing (toppnivåfeltene speiler den).
  assert.match(svg, /data-role="ray"/);
});

test('nmDomainSvg: autoskaleringen inkluderer ALLE kombinasjonspunktene, ikke bare governing', () => {
  const OUTLIER = {
    ...DOM_BEAM,
    combinations: [
      { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, within_limits: true },
      // Godt utenfor omhyllingen (som topper ut rundt 364 kNm) — planens
      // regresjonseksempel på et punkt som i dag havner off-canvas.
      { id: 'C2', name: 'ULS 2 (utenfor)', N_Ed: 0, M_Ed: 800e6, within_limits: true },
    ],
    governing: 'C1',
    N_Ed: 0,
    M_Ed: 0,
  };
  const svg = nmDomainSvg(OUTLIER, { width: 174 });
  const vb = viewBox(svg);
  const m = /<g data-role="load-point" stroke="[^"]+" stroke-width="[^"]+"><circle cx="([-\d.]+)" cy="([-\d.]+)"/.exec(svg);
  assert.ok(m, 'fant ikke markøren for den ikke-governing kombinasjonen');
  const [cx, cy] = [Number(m[1]), Number(m[2])];
  assert.ok(cx >= -1e-6 && cx <= vb[2] + 1e-6, `punktet havnet off-canvas: cx=${cx}, bredde=${vb[2]}`);
  assert.ok(cy >= -1e-6 && cy <= vb[3] + 1e-6, `punktet havnet off-canvas: cy=${cy}, høyde=${vb[3]}`);
});

/**
 * Den vertikale nullinja `axes()` tegner for M (`xLo < 0 && xHi > 0`) er den
 * eksakte `px(0)`-referansen. Ved å lese den ut av selve akse-gruppa i stedet
 * for å anta noe om skaleringen, blir «hver sin side av m = 0» en påstand om
 * SVG-en, ikke om regnestykket bak den.
 */
function axesZeroLineX(svg) {
  const g = /<g data-role="axes"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  assert.ok(g, 'mangler akse-gruppe');
  const lines = [...g[1].matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"\/>/g)];
  const vertical = lines.find((m) => Math.abs(Number(m[1]) - Number(m[3])) < 1e-6);
  assert.ok(vertical, 'fant ikke M = 0-linja (den vertikale nullinja)');
  return Number(vertical[1]);
}

function firstCircle(svg, role) {
  const m = new RegExp(`<g data-role="${role}"[^>]*><circle cx="([-\\d.]+)" cy="([-\\d.]+)"`).exec(svg);
  assert.ok(m, `mangler ${role}`);
  return [Number(m[1]), Number(m[2])];
}

test('nmDomainSvg: hogging speiles til -M, sagging blir stående i +M (planens akseptpunkt 12)', () => {
  // Samme N_Ed/M_Ed-STØRRELSE, men motsatt retning. `domain_theta = 0` (sagging)
  // er omhyllingens egen retning — se DOM_BEAM/§4.3 sin `meta.domain_theta`.
  const SIGNED = {
    ...DOM_BEAM,
    domain_theta: 0,
    combinations: [
      { id: 'C1', name: 'Sagging', N_Ed: -500000, M_Ed: 150000000, theta: 0, within_limits: true },
      { id: 'C2', name: 'Hogging', N_Ed: -500000, M_Ed: 150000000, theta: Math.PI, within_limits: true },
    ],
    governing: 'C1',
    N_Ed: -500000,
    M_Ed: 150000000,
  };
  const svg = nmDomainSvg(SIGNED, {});
  const zeroX = axesZeroLineX(svg);
  const [sagCx] = firstCircle(svg, 'load-point-governing');   // C1, theta = domain_theta
  const [hogCx] = firstCircle(svg, 'load-point');              // C2, theta = domain_theta + pi

  // `cx` er M-aksen i dette diagrammet (M er horisontal, N er vertikal — se
  // hodekommentaren og `axes(o, f, mLo.., 'M [kNm]', 'N [kN]..')`). Punktene
  // skal derfor havne på HVER SIN SIDE av den vertikale m = 0-linja.
  assert.ok(sagCx > zeroX, `sagging skal ligge i +M: cx=${sagCx}, m=0 ved cx=${zeroX}`);
  assert.ok(hogCx < zeroX, `hogging skal ligge i -M: cx=${hogCx}, m=0 ved cx=${zeroX}`);
});

test('nmDomainSvg: mangler domain_theta eller cb.theta, faller punktet tilbake til abs()', () => {
  const noTheta = {
    ...DOM_BEAM,
    domain_theta: 0,
    combinations: [
      // `theta` mangler på selve kombinasjonen.
      { id: 'C1', name: 'Uten theta', N_Ed: -500000, M_Ed: 150000000, within_limits: true },
    ],
    governing: 'C1',
    N_Ed: -500000,
    M_Ed: 150000000,
  };
  const medDomainTheta = nmDomainSvg(noTheta, {});
  const utenDomainTheta = nmDomainSvg({ ...noTheta, domain_theta: undefined }, {});

  const [cx1] = firstCircle(medDomainTheta, 'load-point-governing');
  const [cx2] = firstCircle(utenDomainTheta, 'load-point-governing');
  assert.ok(Math.abs(cx1 - cx2) < 1e-6, 'domain_theta alene, uten cb.theta, skal ikke endre plasseringen');

  const zeroX = axesZeroLineX(medDomainTheta);
  assert.ok(cx1 > zeroX, 'uten cb.theta skal punktet plottes i +M, som abs() ville gitt');
});

test('nmDomainSvg: kombinasjonenes N_Ed/M_Ed konverteres likt som reserveveien (N, Nmm)', () => {
  const viaReserve = nmDomainSvg(noCombos(DOM_BEAM, { N_Ed: -500e3, M_Ed: 150e6 }), {});
  const viaCombo = nmDomainSvg({
    ...DOM_BEAM,
    combinations: [{ id: 'C1', name: '', N_Ed: -500e3, M_Ed: 150e6, within_limits: true }],
    governing: 'C1',
    N_Ed: -500e3,
    M_Ed: 150e6,
  }, {});
  const posOf = (svg, role) => {
    const m = new RegExp(`data-role="${role}"[^>]*><circle cx="([-\\d.]+)" cy="([-\\d.]+)"`).exec(svg);
    assert.ok(m, `mangler ${role}`);
    return [Number(m[1]), Number(m[2])];
  };
  const [rx, ry] = posOf(viaReserve, 'load-point');
  const [gx, gy] = posOf(viaCombo, 'load-point-governing');
  assert.ok(Math.abs(rx - gx) < 1e-6, `x: ${rx} mot ${gx}`);
  assert.ok(Math.abs(ry - gy) < 1e-6, `y: ${ry} mot ${gy}`);
});

test('nmDomainSvg: aksene står i kN og kNm, med fortegnet sagt uttrykkelig', () => {
  const svg = nmDomainSvg(DOM_BEAM, {});
  assert.match(svg, />M \[kNm\]</);
  assert.match(svg, />N \[kN\]  \(compression negative\)</);
});

test('nmDomainSvg: temaene bytter farge, ikke struktur', () => {
  const lastet = noCombos(DOM_BEAM, { N_Ed: -500e3, M_Ed: 150e6 });
  const lys = nmDomainSvg(lastet, { theme: 'print' });
  const mork = nmDomainSvg(lastet, { theme: 'dark' });
  assert.notEqual(lys, mork);
  for (const role of ['envelope', 'load-point', 'ray', 'axes', 'grid']) {
    assert.match(lys, new RegExp(`data-role="${role}"`));
    assert.match(mork, new RegExp(`data-role="${role}"`));
  }
  assert.equal(countPoints(lys, 'envelope'), countPoints(mork, 'envelope'));
});

/* ================================================================== *
 * §1.5 — mekanisk kontroll: ingen norsk brukersynlig tekst
 *
 * Kjøres her, mot ALLE TRE SVG-funksjonene i B5 sin eie (§1.5 «Hvor den
 * kjøres»), ikke bare mot `charts.js` sine to. `drawSection` bor i
 * `section-draw.js`, men testes i denne fila fordi kontrakten sier «tre
 * SVG-funksjoners utdata», ikke «denne filas funksjoner».
 * ================================================================== */

// Stor `Ø` er IKKE med: det er diametersymbolet, og står i helt korrekt engelsk
// utdata som «3Ø20» og «Ø12 c/c 113». Tas den med, kan testen aldri bli grønn.
const NORDIC = /[æåÆÅø]/;

// Kun ord som er norske og IKKE også engelske. «last», «tall», «lag» og «plate»
// er bevisst UTE — de er engelske ord og ville gitt falske treff på korrekt
// engelsk tekst som «the last point» eller «tall section».
const NORWEGIAN_WORDS = new RegExp(
  '\\b(' + [
    'ikke', 'kapasitet', 'armering', 'tverrsnitt', 'beregning', 'utnyttelse',
    'advarsel', 'merknad', 'bjelke', 'krumning', 'overdekning', 'lastvirkning',
    'avstand', 'bredde', 'verdi', 'tverrsnittet', 'armeringen',
  ].join('|') + ')\\b',
  'i',
);

function assertNoNorwegian(svg, label) {
  assert.ok(!NORDIC.test(svg), `${label}: fant et nordisk tegn (æ/å/Æ/Å/ø) i utdata`);
  assert.ok(!NORWEGIAN_WORDS.test(svg), `${label}: fant et norsk ord i utdata`);
}

const SECTION_BEAM = {
  sectionType: 'beam',
  geometry: { b: 300, h: 600 },
  cover: 22, cover_side: 32, stirrup_dia: 8,
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
};
const SECTION_SLAB = {
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25, cover_side: 25, stirrup_dia: 0,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
};

test('§1.5: ingen norsk brukersynlig tekst i noen av de tre SVG-funksjonene', () => {
  assertNoNorwegian(momentCurvatureSvg(MC_BEAM, {}), 'momentCurvatureSvg(beam)');
  assertNoNorwegian(momentCurvatureSvg(MC_SLAB, {}), 'momentCurvatureSvg(slab)');
  assertNoNorwegian(
    momentCurvatureSvg({ ...MC_BEAM, M_Ed: 200e6, truncated: true }, {}),
    'momentCurvatureSvg(med-line + truncated)',
  );

  assertNoNorwegian(nmDomainSvg(DOM_BEAM, {}), 'nmDomainSvg(beam, egen fixture-kombinasjon)');
  assertNoNorwegian(nmDomainSvg(DOM_SLAB, {}), 'nmDomainSvg(slab, egen fixture-kombinasjon)');
  assertNoNorwegian(nmDomainSvg(noCombos(DOM_BEAM, { N_Ed: -500e3, M_Ed: 150e6 }), {}), 'nmDomainSvg(reserve)');
  assertNoNorwegian(nmDomainSvg(MULTI, {}), 'nmDomainSvg(flere kombinasjoner)');

  assertNoNorwegian(drawSection(SECTION_BEAM, {}), 'drawSection(beam)');
  assertNoNorwegian(drawSection(SECTION_SLAB, {}), 'drawSection(slab)');
  assertNoNorwegian(
    drawSection(SECTION_BEAM, { overlay: { x: 86.089, theta: 0 } }),
    'drawSection(overlay, sagging)',
  );
  assertNoNorwegian(
    drawSection(SECTION_BEAM, { overlay: { x: 86.089, theta: Math.PI } }),
    'drawSection(overlay, hogging)',
  );
});
