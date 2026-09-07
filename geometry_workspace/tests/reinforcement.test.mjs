/**
 * reinforcement.test.mjs — fasit for mekanikken i forsterkningsverktøyet.
 *
 *   node geometry_workspace/tests/reinforcement.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Testene er skrevet for å DOKUMENTERE mekanikken, ikke bare for å fange
 * regresjoner: hver forventet verdi er regnet for hånd i kommentaren over
 * sjekken, slik at et avvik kan spores til enten koden eller håndregningen.
 * Derfor står også mellomregningen (Q, I, y_c) i kommentarene og ikke bare
 * sluttsvaret.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Modullasting
 * ------------------------------------------------------------------ */

// Repoets rot-`package.json` har ingen `"type": "module"`, så `.js`-filene i
// `geometry_workspace/js/` er formelt CommonJS for Node. Nyere Node gjetter seg
// fram til ES-modul, men skriver en advarsel, og eldre Node feiler blankt.
// Vi laster derfor kildekoden som data-URL — det gjør testen uavhengig av både
// Node-versjon og av innholdet i package.json, uten å røre noen eksisterende
// fil. Modulene under `js/` importerer ingenting selv, så fraværet av relativ
// modulløsning i en data-URL er uproblematisk.
async function loadModule(relPath) {
  const url = new URL(relPath, import.meta.url);
  const src = await readFile(fileURLToPath(url), 'utf8');
  // `charset=utf-8` står der eksplisitt fordi standard tegnsett for `text/*` er
  // US-ASCII; kommentarene våre er fulle av ø, å og ∑.
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64'));
}

const geom = await loadModule('../js/geometry.js');
const mat = await loadModule('../js/materials.js');
const rf = await loadModule('../js/reinforcement.js');

const { ringProps, rectPoints, translatePoints } = geom;
const {
  sectionEA, compareStates, axialSplit, axialTransfer,
  shearFlow, anchorFlow, volkersen, connectorStiffness, connectorCheck,
  kNtoN,
} = rf;

/* ------------------------------------------------------------------ *
 * Minimal testløper
 * ------------------------------------------------------------------ */

const tests = [];
let lines = [];
let failedInCurrent = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

/** Relativt avvik, med absolutt fallback når fasiten er null. */
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

/** Tallsjekk mot fasit. `tol` er relativt avvik. */
function close(label, actual, expected, tol = 1e-9) {
  const dev = deviation(actual, expected);
  const ok = Number.isFinite(actual) && dev <= tol;
  if (!ok) failedInCurrent++;
  lines.push(
    `      ${ok ? 'ok  ' : 'FEIL'} ${label.padEnd(34)} = ${fmt(actual).padStart(14)}` +
    `  (fasit ${fmt(expected)}, avvik ${dev.toExponential(1)})`
  );
}

/** Sannhetssjekk for det som ikke er tall. */
function ok(label, cond, note = '') {
  if (!cond) failedInCurrent++;
  lines.push(`      ${cond ? 'ok  ' : 'FEIL'} ${label}${note ? '  (' + note + ')' : ''}`);
}

/* ================================================================== *
 * Felles geometri
 *
 * Alle rektangler ligger med nedre venstre hjørne der `rectPoints` sier,
 * altså i GLOBALE koordinater — `props` fra geometry.js er integrert om
 * globalt origo, og det er nettopp det `sectionEA` forventer.
 * ================================================================== */

const props = (pts) => ringProps(pts);
const E_STEEL = 210000; // N/mm²
const E_TIMBER = 10500; // N/mm²  — E_stål/20, se test 5

/* ------------------------------------------------------------------ *
 * 1. Homogent rektangel — q = VQ/I
 * ------------------------------------------------------------------ */

test('1. Homogent rektangel 100x300, snitt i halv høyde: q = VQ/I = 250 N/mm', () => {
  // HÅNDREGNING
  //   I  = b·h³/12 = 100·300³/12 = 2.25e8 mm⁴
  //   Q  = A_topphalvdel · avstand til NA = (100·150)·75 = 1.125e6 mm³
  //   V  = 50 kN = 50000 N
  //   q  = V·Q/I = 50000·1.125e6/2.25e8 = 250 N/mm
  const full = rectPoints(0, 0, 100, 300);
  const top = rectPoints(0, 150, 100, 150);
  const V = kNtoN(50);

  for (const E of [E_STEEL, E_TIMBER]) {
    const section = sectionEA([{ id: 'a', props: props(full), E }]);
    const flow = shearFlow({ V, groupParts: [{ id: 'top', props: props(top), E }], section });

    close(`y_c (E=${E})`, section.yc, 150);
    // EI = E·I ⟹ ES*/EI skal være uavhengig av E. Det er hele poenget med
    // at q = V·ES*/EI reduserer seg til V·Q/I når E er lik overalt.
    close(`EI_x (E=${E})`, section.EIx, E * 2.25e8, 1e-12);
    close(`ES* (E=${E})`, flow.EStar, E * 1.125e6, 1e-12);
    close(`q (E=${E})`, flow.q, 250, 1e-12);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Aksialfordeling etter EA
 * ------------------------------------------------------------------ */

test('2. Aksialfordeling: like deler 50/50, med E2 = 2·E1 blir det 1/3 og 2/3', () => {
  // HÅNDREGNING
  //   N_i = N·E_iA_i/ΣE_jA_j.
  //   Like deler, lik E: begge EA = 210000·10000 = 2.1e9 ⟹ 50 % hver.
  //   Med E2 = 2E1: EA = [2.1e9, 4.2e9], Σ = 6.3e9 ⟹ 1/3 og 2/3.
  //   N = 300 kN = 300000 N ⟹ N_1 = 100000 N, N_2 = 200000 N.
  const p1 = props(rectPoints(0, 0, 100, 100)); // A = 10000 mm²
  const p2 = props(rectPoints(200, 0, 100, 100));
  const N = kNtoN(300);

  const equal = axialSplit({ N, parts: [{ id: 's1', props: p1, E: E_STEEL }, { id: 's2', props: p2, E: E_STEEL }] });
  close('lik E: andel del 1', equal.shares[0].share, 0.5);
  close('lik E: andel del 2', equal.shares[1].share, 0.5);
  close('lik E: N_1 [N]', equal.shares[0].N_i, 150000);

  const doubled = axialSplit({ N, parts: [{ id: 's1', props: p1, E: E_STEEL }, { id: 's2', props: p2, E: 2 * E_STEEL }] });
  close('E2=2E1: andel del 1', doubled.shares[0].share, 1 / 3);
  close('E2=2E1: andel del 2', doubled.shares[1].share, 2 / 3);
  close('E2=2E1: N_2 [N]', doubled.shares[1].N_i, 200000);
  close('E2=2E1: EA total [N]', doubled.EA, 6.3e9, 1e-12);

  // axialTransfer plukker ut «ny»-siden — det er denne ΔN som må gjennom fugen.
  const tr = axialTransfer({ N, parts: [{ id: 's1', props: p1, E: E_STEEL }, { id: 's2', props: p2, E: 2 * E_STEEL }], groupIds: ['s2'] });
  close('ΔN til del 2 [N]', tr.dN, 200000);
});

/* ------------------------------------------------------------------ *
 * 3. Forankring, q = ΔN/L
 * ------------------------------------------------------------------ */

test('3. Forankring: ΔN = 63.5 kN over L = 2000 mm gir q = 31.75 N/mm', () => {
  // HÅNDREGNING: 63500 N / 2000 mm = 31.75 N/mm
  const a = anchorFlow({ dN: kNtoN(63.5), L: 2000 });
  close('q_N', a.q, 31.75, 1e-12);
  ok('gyldig', a.valid === true);

  // L = 0 skal ikke gi Infinity midt i et regnskap, men si fra.
  const bad = anchorFlow({ dN: 63500, L: 0 });
  ok('L = 0 gir valid=false og q=0 i stedet for deling på null', bad.valid === false && bad.q === 0);
});

/* ------------------------------------------------------------------ *
 * 4. Volkersen — de tre grensetilfellene, verifisert numerisk
 * ------------------------------------------------------------------ */

test('4. Volkersen: integral = P, lambda->0 gir P/L, balansert topp = (λL/2)coth(λL/2)', () => {
  const P = kNtoN(100); // 100000 N
  const L = 1000;       // mm

  // --- 4a) Likevekt: ∫₀^L q dx = P, både balansert og ubalansert.
  // Det odde leddet integrerer eksakt til null, så integralet skal treffe P
  // uansett stivhetsforhold. Trapes over 2001 punkt gir < 1e-6 relativt avvik
  // her; kravet i planen er 0.1 %.
  for (const [EA1, EA2, tag] of [[1e8, 1e8, 'balansert'], [4e8, 1e8, 'ubalansert 4:1']]) {
    const v = volkersen({ P, L, k: 500, EA1, EA2, samples: 2001 });
    close(`4a ${tag}: ∫q dx [N]`, v.integral, P, 1e-3);
  }

  // --- 4b) Myk forbindelse: λ→0 ⟹ q → P/L overalt.
  // k = 1e-6 gir λ = sqrt(1e-6·2e-8) = 1.4142e-7 1/mm, λL/2 = 7.07e-5.
  // Det er over terskelen for den analytiske kortslutningen i koden, så
  // selve cosh/sinh-formelen blir faktisk brukt — det er den vi vil teste.
  // Toppfaktoren skal da være 1 + (λL/2)²/3 ≈ 1 + 1.67e-9.
  const soft = volkersen({ P, L, k: 1e-6, EA1: 1e8, EA2: 1e8, samples: 201 });
  ok('4b bruker den fulle formelen (ikke kortslutningen)', soft.uniform === false);
  close('4b lambda [1/mm]', soft.lambda, Math.sqrt(1e-6 * 2e-8), 1e-12);
  close('4b q i midten [N/mm]', soft.profile[100].q, P / L, 1e-6);
  close('4b q i enden [N/mm]', soft.profile[0].q, P / L, 1e-6);
  close('4b toppfaktor', soft.peakFactor, 1, 1e-6);

  // --- 4c) Balansert skjøt: q_max/q_avg = (λL/2)·coth(λL/2).
  // k = 500 N/mm², EA = 1e8 N hver:
  //   λ² = 500·(1/1e8 + 1/1e8) = 1e-5  ⟹  λ = 3.16228e-3 1/mm
  //   λL/2 = 1.5811388
  //   e^1.5811388 = 4.860635 , e^-1.5811388 = 0.2055935
  //   cosh = (4.860635 + 0.205594)/2 = 2.5331143
  //   sinh = (4.860635 − 0.205594)/2 = 2.3273736
  //   coth = 2.5331143/2.3273736 = 1.0884004
  //   toppfaktor = 1.5811388·1.0884004 = 1.7209121
  //   q_avg = 100000/1000 = 100 N/mm  ⟹  q_max = 172.09121 N/mm
  // Toppen er altså 72 % over middelverdien ΔN/L — nettopp det shear lag-
  // advarselen i UI-et skal si fra om.
  const bal = volkersen({ P, L, k: 500, EA1: 1e8, EA2: 1e8, samples: 2001 });
  const vHalf = (bal.lambda * L) / 2;
  const cothExact = Math.cosh(vHalf) / Math.sinh(vHalf);
  close('4c lambda [1/mm]', bal.lambda, 3.1622776601683794e-3, 1e-12);
  close('4c lambda·L/2', vHalf, 1.5811388300841898, 1e-12);
  close('4c q_avg [N/mm]', bal.qAvg, 100, 1e-12);
  close('4c toppfaktor', bal.peakFactor, vHalf * cothExact, 1e-9);
  close('4c toppfaktor mot håndregning', bal.peakFactor, 1.7209121, 1e-6);
  close('4c q_max [N/mm]', bal.qMax, 172.09121, 1e-6);

  // Ubalansert: toppen flytter seg mot enden ved den mykeste staven.
  // Med EA1 = 4·EA2 er (α−β)/(α+β) = 0.6 > 0, og det odde leddet er positivt
  // for x' > 0, altså i enden x = L. Kontrollen er kvalitativ, men den fanger
  // et fortegnsbytte i det andre leddet.
  const unb = volkersen({ P, L, k: 500, EA1: 4e8, EA2: 1e8, samples: 2001 });
  ok('4d ubalansert: største topp ligger i enden x = L',
    Math.abs(unb.profile[unb.profile.length - 1].q) > Math.abs(unb.profile[0].q),
    `q(0)=${fmt(unb.profile[0].q)}, q(L)=${fmt(unb.profile[unb.profile.length - 1].q)}`);

  // --- 4e) Stabilitet ved svært stiv skjøt.
  // k = 1e9 gir λ = sqrt(1e9·2e-8) = 4.472136 1/mm og λL/2 = 2236.07. En naiv
  // cosh/sinh ville her gitt Infinity/Infinity = NaN; den omskrevne formen i
  // koden holder seg endelig.
  // HÅNDREGNING: for λL/2 ≫ 1 er coth(λL/2) → 1, så
  //   q_max = (P·λ/2)·coth(λL/2) ≈ 100000·4.472136/2 = 223606.8 N/mm
  // Hele kraften går altså inn på de ytterste millimeterne — grensetilfellet
  // «uendelig stiv forbindelse», som er nettopp det ΔN/L IKKE beskriver.
  const stiff = volkersen({ P, L, k: 1e9, EA1: 1e8, EA2: 1e8, samples: 4001 });
  ok('4e ekstremt stiv skjøt gir endelige tall (ingen overflyt)',
    Number.isFinite(stiff.qMax) && stiff.qMax > 0, `λL/2 = ${fmt(stiff.lambdaL / 2)}`);
  close('4e q_max [N/mm] mot P·λ/2', stiff.qMax, (P * stiff.lambda) / 2, 1e-9);
  close('4e q_max [N/mm] håndregnet', stiff.qMax, 223606.8, 1e-6);

  // Likevekten holder også her, men grensesjiktet er bare 1/λ = 0.224 mm
  // bredt. Med 4001 punkt er punktavstanden 0.25 mm — trapesregelen strekker
  // endeverdien over et helt intervall og bommer med ~10 % (for høyt, siden
  // q er konveks der). Det er en oppløsningsfeil i
  // KONTROLLEN, ikke i formelen: med 0.01 mm punktavstand faller avviket til
  // (λ·h)²/12 ≈ 1.7e-4. Verdt å vite for agent C: `integral` fra `volkersen`
  // er bare en gyldig egenkontroll når λ·L/samples er liten.
  ok('4e grov oppløsning overvurderer integralet (forventet)',
    stiff.integral > 1.05 * P, `∫ = ${fmt(stiff.integral)} med 4001 punkt`);
  const stiffFine = volkersen({ P, L, k: 1e9, EA1: 1e8, EA2: 1e8, samples: 100001 });
  close('4e ∫q dx [N] med 100001 punkt', stiffFine.integral, P, 1e-3);
});

/* ------------------------------------------------------------------ *
 * 5. Transformert tverrsnitt — nøytralaksen
 * ------------------------------------------------------------------ */

test('5. Transformert tverrsnitt, tre på stål (E-forhold 1/20): y_c = 46.6667 mm', () => {
  // GEOMETRI
  //   Stålplate  100 x 20  mm, y = 0..20,    E_s = 210000 N/mm²
  //   Treprofil  100 x 200 mm, y = 20..220,  E_t = 10500 N/mm²  (= E_s/20)
  //
  // HÅNDREGNING med transformert bredde (transformert til stål, n = E_t/E_s = 1/20):
  //   stål:  A = 2000 mm²,  ȳ = 10 mm
  //   tre:   b' = 100/20 = 5 mm ⟹ A' = 5·200 = 1000 mm², ȳ = 120 mm
  //   y_c = (2000·10 + 1000·120)/(2000 + 1000) = 140000/3000 = 46.66667 mm
  //
  //   Samme svar via EA-vekting:
  //   EA  = 210000·2000 + 10500·20000 = 4.2e8 + 2.1e8 = 6.3e8 N
  //   ESx = 210000·2000·10 + 10500·20000·120 = 4.2e9 + 2.52e10 = 2.94e10 Nmm
  //   y_c = 2.94e10/6.3e8 = 46.66667 mm
  //
  // BØYESTIVHET om y_c:
  //   stål: I_egen = 100·20³/12 = 66666.67, d = 10 − 46.6667 = −36.6667
  //         I = 66666.67 + 2000·36.6667² = 66666.67 + 2688888.9 = 2755555.6 mm⁴
  //         E·I = 210000·2755555.6 = 5.786667e11 Nmm²
  //   tre:  I_egen = 100·200³/12 = 6.666667e7, d = 120 − 46.6667 = 73.3333
  //         I = 6.666667e7 + 20000·73.3333² = 6.666667e7 + 1.0755556e8 = 1.7422222e8 mm⁴
  //         E·I = 10500·1.7422222e8 = 1.8293333e12 Nmm²
  //   EI_x = 5.786667e11 + 1.8293333e12 = 2.408e12 Nmm²
  const steel = { id: 'steel', props: props(rectPoints(0, 0, 100, 20)), E: E_STEEL };
  const timber = { id: 'timber', props: props(rectPoints(0, 20, 100, 200)), E: E_TIMBER };
  const sec = sectionEA([steel, timber]);

  close('EA [N]', sec.EA, 6.3e8, 1e-12);
  close('ESx [Nmm]', sec.ESx, 2.94e10, 1e-12);
  close('y_c [mm]', sec.yc, 140 / 3, 1e-12);
  close('y_c mot håndregning [mm]', sec.yc, 46.666667, 1e-7);
  close('EI_x [Nmm²]', sec.EIx, 2.408e12, 1e-12);

  // compareStates: før forsterkning finnes bare stålplata, om SIN EGEN akse.
  //   EI_x,0 = 210000·(100·20³/12) = 210000·66666.67 = 1.4e10 Nmm²
  //   forhold = 2.408e12/1.4e10 = 172.0     EA-forhold = 6.3e8/4.2e8 = 1.5
  const cmp = compareStates({ existing: [steel], combined: [steel, timber] });
  close('EI_x eksisterende [Nmm²]', cmp.EIx0, 1.4e10, 1e-12);
  close('EI_x sammensatt [Nmm²]', cmp.EIx1, 2.408e12, 1e-12);
  close('EI-forhold', cmp.ratios.EIx, 172, 1e-12);
  close('EA-forhold', cmp.ratios.EA, 1.5, 1e-12);
  close('nøytralaksen flytter seg [mm]', cmp.dyc, 140 / 3 - 10, 1e-12);
});

/* ------------------------------------------------------------------ *
 * 6. Forbinderkontroll
 * ------------------------------------------------------------------ */

test('6. Forbinderkontroll: q = 100 N/mm, F_Rd = 8 kN, 1 rad gir s_req = 80 mm', () => {
  // HÅNDREGNING: s_req = rader·F_Rd·1000/q = 1·8·1000/100 = 80 mm
  const screw = connectorCheck({ q: 100, connector: { kind: 'screw', FRd: 8, rows: 1, spacing: 80 } });
  close('s_req [mm]', screw.sReq, 80, 1e-12);
  close('utnyttelse ved s = 80 mm', screw.util, 1, 1e-12);
  close('q_Rd ved s = 80 mm [N/mm]', screw.qRd, 100, 1e-12);
  ok('utnyttelse 1.0 regnes som ok', screw.ok === true);

  // Dobbelt så tett rad: s_req halveres ikke — den dobles, fordi kapasiteten
  // per lengde dobles. 2 rader ⟹ s_req = 160 mm.
  const twoRows = connectorCheck({ q: 100, connector: { kind: 'screw', FRd: 8, rows: 2, spacing: 200 } });
  close('s_req med 2 rader [mm]', twoRows.sReq, 160, 1e-12);
  close('utnyttelse ved s = 200 mm', twoRows.util, 100 * 200 / (2 * 8000), 1e-12);
  ok('for stor senteravstand gir ok=false', twoRows.ok === false, `util = ${fmt(twoRows.util)}`);

  // q = 0 skal ikke gi NaN.
  const noLoad = connectorCheck({ q: 0, connector: { kind: 'screw', FRd: 8, rows: 1, spacing: 200 } });
  ok('q = 0 gir s_req = Infinity, ikke NaN', noLoad.sReq === Infinity && noLoad.util === 0);
});

/* ================================================================== *
 * Egne tilfeller — dekker det de seks over ikke gjør
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * 7. Grensesnitt i ytterkant
 * ------------------------------------------------------------------ */

test('7. Grensesnitt i ytterkant gir q -> 0, og hele tverrsnittet gir ES* = 0', () => {
  // Fysikken: ES* = Σ E A (y − y_c) for gruppa. Legges snittet helt i
  // ytterkanten er gruppa tom, og det er ingen aksialkraft å overføre. Legges
  // det utenfor hele tverrsnittet er gruppa HELE tverrsnittet, og da er ES*
  // eksakt null per definisjonen av nøytralaksen — også da null å overføre.
  // Begge endene av intervallet skal altså gi q = 0; maksimum ligger i y_c.
  const full = rectPoints(0, 0, 100, 300);
  const E = E_STEEL;
  const section = sectionEA([{ id: 'a', props: props(full), E }]);
  const V = kNtoN(50);

  const q = (h) =>
    shearFlow({ V, groupParts: [{ id: 'g', props: props(rectPoints(0, 300 - h, 100, h)), E }], section }).qAbs;

  // Tynn stripe i toppen: q → 0 lineært i stripetykkelsen.
  //   q(h) = V·(100h)(150 − h/2)/2.25e8 → for h = 0.01: 50000·1·149.995/2.25e8
  //        = 0.033332 N/mm
  close('q for 0.01 mm stripe i toppen [N/mm]', q(0.01), 50000 * (100 * 0.01) * (150 - 0.005) / 2.25e8, 1e-9);
  ok('q avtar mot 0 når snittet nærmer seg ytterkanten',
    q(1) > q(0.1) && q(0.1) > q(0.01) && q(0.01) < 0.05);

  // Hele tverrsnittet som gruppe: ES* = 0 eksakt.
  const whole = shearFlow({ V, groupParts: [{ id: 'a', props: props(full), E }], section });
  ok('ES* for hele tverrsnittet er null', Math.abs(whole.EStar) < 1e-6 * Math.abs(section.EIx) / 300,
    `ES* = ${fmt(whole.EStar)}`);
  ok('q for hele tverrsnittet er null', Math.abs(whole.q) < 1e-9, `q = ${fmt(whole.q)}`);

  // Tom gruppe skal si fra, ikke dele på null.
  const empty = shearFlow({ V, groupParts: [], section });
  ok('tom gruppe gir valid=false og q=0', empty.valid === false && empty.q === 0);
});

/* ------------------------------------------------------------------ *
 * 8. Fortegn: de to sidene av samme snitt
 * ------------------------------------------------------------------ */

test('8. ES* fra hver side av samme snitt: samme tallverdi, motsatt fortegn', () => {
  // Bruker det usymmetriske tverrsnittet fra test 5 og snitter ved y = 60,
  // altså inne i treprofilen. Siden ES* for hele tverrsnittet er null, må
  // ES*_under = −ES*_over. Dermed er |q| lik uansett hvilken side man regner
  // fra — fortegnet sier bare hvilken vei kraften går.
  const E_s = E_STEEL;
  const E_t = E_TIMBER;
  const section = sectionEA([
    { id: 'steel', props: props(rectPoints(0, 0, 100, 20)), E: E_s },
    { id: 'timber', props: props(rectPoints(0, 20, 100, 200)), E: E_t },
  ]);
  const V = kNtoN(80);

  const below = shearFlow({
    V, section,
    groupParts: [
      { id: 'steel', props: props(rectPoints(0, 0, 100, 20)), E: E_s },
      { id: 't-lo', props: props(rectPoints(0, 20, 100, 40)), E: E_t }, // y = 20..60
    ],
  });
  const above = shearFlow({
    V, section,
    groupParts: [{ id: 't-hi', props: props(rectPoints(0, 60, 100, 160)), E: E_t }], // y = 60..220
  });

  close('ES* over snittet [Nmm]', above.EStar, -below.EStar, 1e-9);
  close('|q| fra hver side [N/mm]', above.qAbs, below.qAbs, 1e-9);
  ok('fortegnene er motsatte', Math.sign(above.q) === -Math.sign(below.q),
    `q_over = ${fmt(above.q)}, q_under = ${fmt(below.q)}`);

  // HÅNDREGNING for kontroll av tallverdien, gruppa over snittet:
  //   A = 100·160 = 16000 mm², ȳ = 140 mm, y_c = 46.66667 mm
  //   ES* = 10500·16000·(140 − 46.66667) = 10500·16000·93.33333 = 1.568e10 Nmm
  //   q   = 80000·1.568e10/2.408e12 = 520.93 N/mm
  close('ES* over, håndregnet [Nmm]', above.EStar, 10500 * 16000 * (140 - 140 / 3), 1e-12);
  close('q over, håndregnet [N/mm]', above.q, 80000 * (10500 * 16000 * (140 - 140 / 3)) / 2.408e12, 1e-12);
});

/* ------------------------------------------------------------------ *
 * 9. Uavhengighet av origo
 * ------------------------------------------------------------------ */

test('9. EI om nøytralaksen er uavhengig av hvor origo ligger', () => {
  // `props` fra geometry.js er integrert om GLOBALT origo, så Ix0 endrer seg
  // dramatisk når modellen flyttes. Steiners sats i sectionEA skal fjerne hele
  // den avhengigheten: EI om nøytralaksen, og dermed q, må være invariant.
  // Dette er den testen som ville fanget en glemt Steiner-korreksjon.
  const dx = 1234.5;
  const dy = -678.9;
  const E_s = E_STEEL;
  const E_t = E_TIMBER;

  const build = (ox, oy) => {
    const s = translatePoints(rectPoints(0, 0, 100, 20), ox, oy);
    const t = translatePoints(rectPoints(0, 20, 100, 200), ox, oy);
    const g = translatePoints(rectPoints(0, 60, 100, 160), ox, oy);
    return {
      section: sectionEA([{ id: 's', props: props(s), E: E_s }, { id: 't', props: props(t), E: E_t }]),
      group: [{ id: 'g', props: props(g), E: E_t }],
    };
  };

  const a = build(0, 0);
  const b = build(dx, dy);
  const V = kNtoN(80);

  ok('Ix0 (om origo) endrer seg faktisk ved flytting',
    deviation(b.section.EIx0, a.section.EIx0) > 1,
    `${fmt(a.section.EIx0)} -> ${fmt(b.section.EIx0)}`);
  close('EI_x om nøytralaksen', b.section.EIx, a.section.EIx, 1e-9);
  close('EI_y om nøytralaksen', b.section.EIy, a.section.EIy, 1e-9);
  close('y_c flytter seg med dy [mm]', b.section.yc - a.section.yc, dy, 1e-9);
  close('x_c flytter seg med dx [mm]', b.section.xc - a.section.xc, dx, 1e-9);

  const qa = shearFlow({ V, groupParts: a.group, section: a.section }).q;
  const qb = shearFlow({ V, groupParts: b.group, section: b.section }).q;
  close('q er uendret [N/mm]', qb, qa, 1e-9);
});

/* ------------------------------------------------------------------ *
 * 10. Skjærstrøm om den andre aksen
 * ------------------------------------------------------------------ */

test('10. axis = "x" gir samme svar som "y" på et tverrsnitt speilet om diagonalen', () => {
  // API-et skal støtte begge akser (§6). Enkleste uavhengige kontroll: samme
  // tverrsnitt, men med x og y byttet om. Da må V_x med ES*_y/EI_y gi nøyaktig
  // det samme tallet som V_y med ES*_x/EI_x gjorde i test 1 — 250 N/mm.
  const E = E_STEEL;
  const V = kNtoN(50);

  const liggende = sectionEA([{ id: 'a', props: props(rectPoints(0, 0, 300, 100)), E }]);
  const flow = shearFlow({
    V, section: liggende,
    groupParts: [{ id: 'hoyre', props: props(rectPoints(150, 0, 150, 100)), E }],
    axis: 'x',
  });
  close('x_c [mm]', liggende.xc, 150);
  close('EI_y [Nmm²]', liggende.EIy, E * 2.25e8, 1e-12);
  close('ES*_y [Nmm]', flow.EStar, E * 1.125e6, 1e-12);
  close('q_x [N/mm]', flow.q, 250, 1e-12);
  ok('resultatet er merket med riktig akse', flow.axis === 'x');
});

/* ------------------------------------------------------------------ *
 * 11. Forbindelsesstivhet og limkontroll
 * ------------------------------------------------------------------ */

test('11. connectorStiffness og limkontroll — enhetene går opp', () => {
  // LIM: k = G_a·b/t_a = 700·150/2 = 52500 N/mm per mm skjøtelengde.
  //      Enhet: (N/mm²)·mm/mm = N/mm². ✓
  const kGlue = connectorStiffness({ kind: 'glue', Ga: 700, ta: 2 }, 150);
  close('k for lim [N/mm²]', kGlue, 52500, 1e-12);

  // SKRUE: k = K_ser·rader/s = 5000·2/200 = 50 N/mm².  (N/mm)·(1/mm) = N/mm². ✓
  const kScrew = connectorStiffness({ kind: 'screw', Kser: 5000, rows: 2, spacing: 200 });
  close('k for skrue [N/mm²]', kScrew, 50, 1e-12);

  // LIMKONTROLL: τ = q/b = 600/150 = 4.0 N/mm², τ_Rd = 4.0 ⟹ utnyttelse 1.0.
  const glue = connectorCheck({ q: 600, bondWidth: 150, connector: { kind: 'glue', tauRd: 4.0 } });
  close('τ [N/mm²]', glue.tau, 4, 1e-12);
  close('utnyttelse', glue.util, 1, 1e-12);
  close('q_Rd [N/mm]', glue.qRd, 600, 1e-12);

  // Manglende heftbredde skal gi valid=false, ikke Infinity.
  const noB = connectorCheck({ q: 600, bondWidth: 0, connector: { kind: 'glue', tauRd: 4.0 } });
  ok('heftbredde 0 gir valid=false', noB.valid === false && noB.tau === null);
});

/* ------------------------------------------------------------------ *
 * 12. Materialpresets
 * ------------------------------------------------------------------ */

test('12. materials.js har alle presetene planen krever, i N/mm²', () => {
  const wanted = {
    S355: 210000, S235: 210000,
    'C25/30': 31000, 'C30/37': 33000, 'C35/45': 34000,
    GL30c: 13000, C24: 11000, CFRP: 165000, 'EN AW-6082': 70000,
  };
  for (const [name, E] of Object.entries(wanted)) {
    const m = mat.materialByName(name);
    ok(`${name} finnes`, !!m);
    if (m) close(`${name} E [N/mm²]`, m.E, E, 0);
  }
  ok('DEFAULT_MATERIAL er S355 med E = 210000', mat.DEFAULT_MATERIAL.name === 'S355' && mat.DEFAULT_MATERIAL.E === 210000);
  ok('ukjent navn gir null (ingen stille bytte av materiale)', mat.materialByName('finnes-ikke') === null);
  // Fritt E-felt skal vinne over presetet, ellers kan ikke brukeren regne med
  // langtids-E for betong eller avvikende trekvalitet.
  close('materialE lar egen E overstyre presetet', mat.materialE({ name: 'S355', E: 205000 }), 205000, 0);
  close('materialE faller tilbake på presetet', mat.materialE({ name: 'GL30c' }), 13000, 0);
});

/* ================================================================== *
 * Kjøring
 * ================================================================== */

let failures = 0;
console.log('\nreinforcement.test.mjs — mekanikk for forsterkningsverktøyet\n');
for (const t of tests) {
  lines = [];
  failedInCurrent = 0;
  try {
    t.fn();
  } catch (err) {
    failedInCurrent++;
    lines.push(`      FEIL unntak: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
  }
  const bad = failedInCurrent > 0;
  if (bad) failures++;
  console.log(`  ${bad ? '[FEIL]' : '[ OK ]'} ${t.name}`);
  for (const l of lines) console.log(l);
  console.log('');
}

console.log(`  ${tests.length - failures} av ${tests.length} tester bestått.\n`);
process.exit(failures > 0 ? 1 : 0);
