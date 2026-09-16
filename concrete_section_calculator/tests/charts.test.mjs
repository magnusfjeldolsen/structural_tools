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
 * **Polaritet (endringsrunde 4):** denne kammen er ren algoritme-fixture og
 * har ALDRI representert sagging/hogging — den tester bare at strålemetoden
 * finner riktig kryssing i en ikke-konveks rand, uavhengig av hva fortegnet
 * «betyr». Verdiene under er derfor uendret av at §1.1 snudde motorens egen
 * konvensjon. Det som ER nytt: `radialUtilisation` tar ikke lenger `abs()` av
 * `M_Ed`-argumentet, så en NEGATIV stråle prøver nå den motsatte halvdelen av
 * kammen i stedet for å bli speilet til den positive — se testen rett under
 * som prøver akkurat det.
 *
 * Den loddrette strålen (N_Ed = 0, M_Ed > 0) krysser den ved m = 60, 30 og
 * 10 kNm. **60 kommer FØRST i arrayet, 10 er det riktige svaret.** Det er
 * nettopp fella punkt 3 i `charts.js` sin hodekommentar advarer mot:
 * punktrekkefølgen følger EC2-feltene og sier ingenting om hvor strålen
 * treffer først.
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

test('radialUtilisation: negativ M_Ed treffer den MOTSATTE halvdelen, ikke en speilet positiv', () => {
  // Regresjonsvakt for `Math.abs()`-fjerningen (§5.2): en positiv og en
  // negativ stråle langs samme akse skal IKKE lenger gi samme svar — det ville
  // de gjort dersom noen la `abs()` tilbake på argumentet inn i funksjonen.
  const pos = radialUtilisation(NONCONVEX, 0, 1);
  const neg = radialUtilisation(NONCONVEX, 0, -1);
  assert.ok(neg.hitM < 0, `negativ stråle skal treffe i -M, fikk ${neg.hitM}`);
  assert.notEqual(neg.lambda, pos.lambda);
  assert.ok(Math.abs(neg.hitM - (-20)) < 1e-9, `hitM = ${neg.hitM}`);
  assert.equal(neg.lambda, 20);
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
  //
  // Polariteten er snudd i forhold til forrige runde (endringsrunde 4, §1.1):
  // sagging (felt) er nå NEGATIV, hogging (støtte) er POSITIV.
  for (const [navn, dom] of [['bjelke', DOM_BEAM], ['plate', DOM_SLAB]]) {
    const m = dom.m.map((v) => v / 1e6);
    assert.ok(Math.min(...m) < 0, `${navn}: feltgrenen skal ligge i -M`);
    assert.ok(Math.max(...m) > 0, `${navn}: støttegrenen skal ligge i +M`);
  }
  // Moment–krumning er RÅ på samme måte (§1.4) — bare én gren, men fortegnet
  // følger likevel motoren. `momentCurvatureSvg` er den eneste som tar `abs()`.
  assert.ok(Math.max(...MC_BEAM.moment) < 0, 'M–κ for referansebjelken er rå og sagging-negativ');
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

test('radialUtilisation: (-500 kN, -150 kNm) treffer FELTGRENEN, ikke støttegrenen', () => {
  // Regresjonen som ga navn til kontraktsendringen — nå med rå,
  // sagging-negativ konvensjon (§1.1). Tas `abs()` på `M_Ed`-argumentet
  // (ELLER på `dom.m`) et sted i kjeden, faller strålen ned mot
  // støttegrenens bitte små kapasitet i stedet, og eta blir ~3,7 mot en gren
  // lasten aldri går i, i stedet for riktig ~0,41 mot feltgrenen.
  const res = radialUtilisation(DOM_BEAM, -500, -150);
  assert.ok(res.hitM < 0, `treffet skal ligge i -M, fikk ${res.hitM}`);
  assert.ok(res.hitN < 0, `treffet skal ligge i trykk, fikk ${res.hitN}`);
  assert.ok(res.eta > 0.35 && res.eta < 0.6, `eta = ${res.eta} (skal IKKE være ~3,7)`);
  assert.ok(res.lambda > 1.9 && res.lambda < 2.9, `lambda = ${res.lambda}`);
  // Treffet skal ligge på feltgrenen, altså i nærheten av toppmomentet
  // -364,3 kNm ved n = -1238 kN — ikke oppe på støttegrenens ~+40 kNm.
  assert.ok(res.hitM < -200, `hitM = ${res.hitM}`);
});

/** §9 i planen: den eksplisitte akseptpåstanden, ordrett. */
test('radialUtilisation: akseptpunkt §9 — DOM_BEAM ved (-500, -150) gir eta ~ 0.413', () => {
  const res = radialUtilisation(DOM_BEAM, -500, -150);
  assert.ok(Math.abs(res.eta - 0.413) < 0.01, `eta = ${res.eta}, forventet ~0.413`);
  assert.ok(Math.abs(res.eta - 3.67) > 1, 'skal IKKE være den gamle, feilaktige 3.67');
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

test('radialUtilisation: fortegnet på M_Ed AVGJØR halvplanet — invertert akseptpåstand', () => {
  // Denne testen påsto tidligere det STIKK MOTSATTE: at fortegnet på `M_Ed`
  // var likegyldig fordi det ble tolket som en størrelse. Etter
  // endringsrunde 4 (§1, §5.2) er `M_Ed` rå, og fortegnet er nøyaktig det
  // som velger hvilken av de to grenene lasten prøves mot — +60 kNm er
  // støttegrenen, -60 kNm er feltgrenen for denne plata. Er denne testen
  // fortsatt grønn med `assert.deepEqual(a, b)`, er fortegnsendringen IKKE
  // gjennomført (planens §9-akseptliste).
  const a = radialUtilisation(DOM_SLAB, -300, 60);
  const b = radialUtilisation(DOM_SLAB, -300, -60);
  assert.notDeepEqual(a, b);
  assert.ok(a.hitM > 0, `+60 kNm skal treffe støttegrenen (+M), fikk hitM=${a.hitM}`);
  assert.ok(b.hitM < 0, `-60 kNm skal treffe feltgrenen (-M), fikk hitM=${b.hitM}`);
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

test('momentCurvatureSvg: aksene står i kNm, som STØRRELSER (§5.1)', () => {
  const svg = momentCurvatureSvg(MC_BEAM, {});
  // `|M|`/`|κ|`: MC_BEAM sitt datasett er rått og sagging-negativt (§1.4), men
  // M–κ har bare én gren og viser derfor absoluttverdier, med aksetitler som
  // sier det uttrykkelig.
  assert.match(svg, />\|M\| \[kNm\]</);
  assert.match(svg, />\|κ\| \[10⁻⁶\/mm\]</);
  // Toppmomentet er 215,0 kNm; en akse i Nmm ville hatt merkelapper i 10^8.
  assert.match(svg, />200</);
});

test('momentCurvatureSvg: opplysningslinja om størrelser/fortegn er alltid med', () => {
  // §5.1: den ENESTE tillatte `abs()` i fila skal forklares for leseren, ikke
  // bare i kildekoden.
  const svg = momentCurvatureSvg(MC_BEAM, {});
  assert.match(svg, /data-role="caption"/);
  assert.match(svg, /Magnitudes shown; sagging moment is negative\./);
});

/**
 * §9 i planen: «M–κ-figuren har innhold innenfor viewBox» — egen påstand.
 * Dette er nøyaktig den stille feilen unntaket i §5.1 skal forhindre: med rå
 * (negative) verdier og akser som starter i 0 uten lokal `abs()`, ville
 * `xHi`/`yHi` blitt et bitte lite negativt-nær-null-tall, og HELE kurven
 * havnet utenfor lerretet — uten en eneste feilmelding.
 */
test('momentCurvatureSvg: kurven har faktisk innhold innenfor viewBox', () => {
  const svg = momentCurvatureSvg(MC_BEAM, {});
  const [, , vbW, vbH] = viewBox(svg);
  const m = /<polyline data-role="curve" points="([^"]*)"/.exec(svg);
  assert.ok(m, 'mangler kurven');
  const coords = m[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  assert.ok(coords.length > 1, 'kurven skal ha flere punkter');
  for (const [x, y] of coords) {
    assert.ok(x >= -1e-6 && x <= vbW + 1e-6, `x = ${x} utenfor [0, ${vbW}]`);
    assert.ok(y >= -1e-6 && y <= vbH + 1e-6, `y = ${y} utenfor [0, ${vbH}]`);
  }
  // Kurven skal faktisk BRUKE lerretet, ikke bare tilfeldigvis ligge i ett hjørne.
  const xs = coords.map((c) => c[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > vbW * 0.3, 'kurven er mistenkelig smal i x');
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

/**
 * Erstatter de to «hogging speiles»/«domain_theta»-testene fra forrige runde.
 * Den forrige runden holdt `nm_domain.m` i den ANALYSERTE retningen og måtte
 * derfor speile hver kombinasjon etter `cb.theta` vs. `dom.domain_theta` for
 * å havne i riktig halvplan (se den slettede logikken, git-historikken).
 * Etter endringsrunde 4 (§1, §5.2) er BÅDE `dom.m` og `cb.M_Ed` rå i samme
 * konvensjon fra motoren, så det trengs ingen sammenligning i det hele tatt
 * — hver kombinasjon plottes rett på sin egen `M_Ed`. Testen under beviser
 * nettopp DET: to kombinasjoner med samme `M_Ed`-størrelse men motsatt
 * fortegn havner på hver sin side av m = 0, UAVHENGIG av om `theta`/
 * `domain_theta` er til stede i det hele tatt.
 */
test('nmDomainSvg: hver kombinasjon plottes på sin egen rå M_Ed, uavhengig av theta/domain_theta', () => {
  const SIGNED = {
    ...DOM_BEAM,
    domain_theta: 0,        // til stede i responsen, men skal IKKE lenger leses her
    combinations: [
      { id: 'C1', name: 'Sagging', N_Ed: -500000, M_Ed: -150000000, theta: 0, within_limits: true },
      { id: 'C2', name: 'Hogging', N_Ed: -500000, M_Ed: 150000000, theta: Math.PI, within_limits: true },
    ],
    governing: 'C1',
    N_Ed: -500000,
    M_Ed: -150000000,
  };
  const svg = nmDomainSvg(SIGNED, {});
  const zeroX = axesZeroLineX(svg);
  const [sagCx] = firstCircle(svg, 'load-point-governing');   // C1, M_Ed < 0
  const [hogCx] = firstCircle(svg, 'load-point');              // C2, M_Ed > 0

  // `cx` er M-aksen i dette diagrammet (M er horisontal, N er vertikal — se
  // hodekommentaren og `axes(o, f, mLo.., 'M [kNm]', 'N [kN]..')`).
  assert.ok(sagCx < zeroX, `sagging (M_Ed<0) skal ligge i -M: cx=${sagCx}, m=0 ved cx=${zeroX}`);
  assert.ok(hogCx > zeroX, `hogging (M_Ed>0) skal ligge i +M: cx=${hogCx}, m=0 ved cx=${zeroX}`);

  // Fjernes `theta`/`domain_theta` helt fra svaret, skal plasseringen være
  // BYTE FOR BYTE den samme — funksjonen bruker dem ikke lenger.
  const stripped = { ...SIGNED, domain_theta: undefined,
    combinations: SIGNED.combinations.map(({ theta, ...rest }) => rest) };
  const svg2 = nmDomainSvg(stripped, {});
  const [sagCx2] = firstCircle(svg2, 'load-point-governing');
  const [hogCx2] = firstCircle(svg2, 'load-point');
  assert.ok(Math.abs(sagCx - sagCx2) < 1e-6, 'theta/domain_theta skal ikke påvirke plasseringen');
  assert.ok(Math.abs(hogCx - hogCx2) < 1e-6, 'theta/domain_theta skal ikke påvirke plasseringen');
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

/* ================================================================== *
 * Treffflater for pekeren (hover)
 * ================================================================== */

/** Alle `data-hit`-elementer av én type, med attributtene sine. */
function hits(svg, kind) {
  return [...svg.matchAll(/<circle([^>]* data-hit="([^"]+)"[^>]*)\/>/g)]
    .filter((m) => m[2] === kind)
    .map((m) => Object.fromEntries(
      [...m[1].matchAll(/data-([a-z]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
}

test('momentCurvatureSvg: ett treffpunkt per kurvepunkt, med kappa og moment', () => {
  const mc = MC_BEAM;
  const svg = momentCurvatureSvg(mc, { width: 600, unit: 'px' });
  const h = hits(svg, 'mc');
  assert.equal(h.length, mc.kappa.length, 'ett treffpunkt per punkt paa kurven');
  // Siste punkt skal baere bruddmomentet, som er selve invarianten i kurven.
  // `mc.M_Rd` er raatt (negativt for sagging, §1.4); treffpunktet baerer
  // STOERRELSEN som vises paa figuren (§5.1), derfor abs() paa fasiten her.
  const last = h[h.length - 1];
  assert.ok(Math.abs(Number(last.moment) - Math.abs(mc.M_Rd) / 1e6) < 1e-6,
    `siste treffpunkt baerer |M_Rd|: ${last.moment} vs ${Math.abs(mc.M_Rd) / 1e6}`);
  assert.ok(Number(last.kappa) > 0, 'kappa er med og positiv');
});

test('nmDomainSvg: treffpunkt for hvert omhyllingspunkt, med EC2-feltnummer', () => {
  const dom = DOM_BEAM;
  const svg = nmDomainSvg(dom, { width: 600, unit: 'px' });
  const h = hits(svg, 'env');
  assert.equal(h.length, dom.n.length, 'ett treffpunkt per punkt i omhyllingen');
  assert.ok(Math.abs(Number(h[0].n) - dom.n[0] / 1000) < 1e-6, 'N i kN');
  assert.ok(Math.abs(Number(h[0].m) - dom.m[0] / 1e6) < 1e-6, 'M i kNm, FORTEGNSATT');
  if (Array.isArray(dom.field_num) && dom.field_num.length) {
    assert.equal(Number(h[0].field), dom.field_num[0], 'EC2-feltnummeret foelger med');
  }
});

test('nmDomainSvg: treffpunkt per lastkombinasjon, governing merket', () => {
  const dom = {
    ...DOM_BEAM,
    governing: 'C2',
    combinations: [
      { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 150e6, theta: 0, within_limits: true },
      { id: 'C2', name: 'ULS 2', N_Ed: -500e3, M_Ed: 250e6, theta: 0, within_limits: true },
    ],
  };
  const h = hits(nmDomainSvg(dom, { width: 600, unit: 'px' }), 'load');
  assert.equal(h.length, 2);
  assert.equal(h[0].combo, 'ULS 1');
  assert.equal(h[0].governing, '0');
  assert.equal(h[1].combo, 'ULS 2');
  assert.equal(h[1].governing, '1', 'governing er merket, og det er den strålen peker paa');
  assert.ok(Math.abs(Number(h[1].n) - (-500)) < 1e-6, 'N_Ed i kN');
});

test('treffflatene er usynlige — de skal ikke tegne noe paa papiret', () => {
  const svg = nmDomainSvg(DOM_BEAM, { width: 600, unit: 'px' });
  const g = svg.match(/<g data-role="hits"[^>]*>/);
  assert.ok(g, 'treffpunktene ligger i en egen gruppe');
  assert.match(g[0], /fill="transparent"/, 'gjennomsiktig fyll tegner ingenting');
  assert.match(g[0], /stroke="none"/, 'ingen strek');
  assert.match(g[0], /pointer-events="all"/,
    'uten denne faar et ufylt element ikke pekerhendelser i sitt indre');
});

/**
 * Regresjon: figurens strålemerking må bruke SAMME navn som resten av siden.
 *
 * `radialUtilisation` returnerer `{lambda}` = faktoren ut til omhyllingen og
 * `{eta}` = 1/λ. Utad heter den radielle utnyttelsen λ (results.js sin
 * `RADIAL_UTILISATION_LABEL`), og η er ALLTID den vertikale utnyttelsen i
 * resultatboksen. Figuren skrev feltnavnene rått, og et skjermbilde viste
 * derfor «λ = 1,24, η = 0,81» rett over en bildetekst som sa «λ = 0,81» og en
 * resultatboks som sa «η = 0,78» — tre tall, to symboler, ingen samsvar.
 */
test('nmDomainSvg: strålemerkingen kaller den radielle utnyttelsen λ, ikke η', () => {
  const dom = { ...DOM_BEAM, N_Ed: -900e3, M_Ed: -250e6 };
  const rad = radialUtilisation(dom, -900, -250);
  const svg = nmDomainSvg(dom, {});
  const label = /<text data-role="ray-label"[^>]*>([^<]*)<\/text>/.exec(svg);
  assert.ok(label, 'fant ikke strålemerkingen');
  const text = label[1];
  assert.ok(rad.eta < 1 && rad.lambda > 1, 'forutsetningen: lasten ligger innenfor');
  assert.match(text, new RegExp(`λ = ${rad.eta.toFixed(2)}`),
    `λ skal være den radielle utnyttelsen (${rad.eta.toFixed(2)}), ikke faktoren`);
  assert.ok(!/η/.test(text), 'η er den vertikale utnyttelsen og hører ikke hjemme i figuren');
});
