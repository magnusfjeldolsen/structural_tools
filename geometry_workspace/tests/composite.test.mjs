/**
 * composite.test.mjs — fasit for samvirkegrad, festemiddelstivhet, biaksiell
 * bøyning og forankringskontroll (bølge A i samvirkeplanen).
 *
 *   node geometry_workspace/tests/composite.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Dekker §3 (festemiddelstivhet), §4 (γ-metoden), §8.2 (forankringskontroll)
 * og §1 (hovedakser / skjev bøyning) i
 * `global-devspecs/geometry_workspace-composite-plan.md`, pluss den
 * biaksielle omskrivingen av skjærstrømmen som fulgte av at lastene skal
 * kunne virke om begge akser.
 *
 * Som i de to andre testfilene: hver forventet verdi er REGNET FOR HÅND i
 * kommentaren over sjekken, med mellomregning, slik at et avvik kan spores
 * til enten koden eller håndregningen — ikke bare til «noe».
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Modullasting — samme data-URL-triks som reinforcement.test.mjs.
 * `reinforcement.js` og `connection-stiffness.js` importerer med vilje
 * ingenting, så ingen omskriving av relative specifiers trengs.
 * ------------------------------------------------------------------ */

async function loadModule(relPath) {
  const url = new URL(relPath, import.meta.url);
  const src = await readFile(fileURLToPath(url), 'utf8');
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64'));
}

const geom = await loadModule('../js/geometry.js');
const rf = await loadModule('../js/reinforcement.js');
const cs = await loadModule('../js/connection-stiffness.js');

const { ringProps, rectPoints } = geom;
const {
  sectionEA, shearFlow, shearFlowBiaxial, stiffnessMatrix, curvatures,
  groupFirstMoments, axialInGroup, principalEI, axesComparison,
  gammaMethod, effectiveLength, fastenerForce, jointCapacityFlow, anchorageCheck,
  connectorCheck, kNtoN, kNmToNmm, SKEW_THRESHOLD,
} = rf;
const {
  ec5Kser, etaKser, slipModulus, meanDensity, glueStiffness, jointStiffness,
  interfaceStiffness, contactFactor, stateFactor,
} = cs;

/* ------------------------------------------------------------------ *
 * Minimal testløper — identisk med den i de to andre testfilene
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
  const okNow = Number.isFinite(actual) && dev <= tol;
  if (!okNow) failedInCurrent++;
  lines.push(
    `      ${okNow ? 'ok  ' : 'FEIL'} ${label.padEnd(38)} = ${fmt(actual).padStart(15)}` +
    `  (fasit ${fmt(expected)}, avvik ${dev.toExponential(1)})`
  );
}

/** Sannhetssjekk for det som ikke er tall. */
function ok(label, cond, note = '') {
  if (!cond) failedInCurrent++;
  lines.push(`      ${cond ? 'ok  ' : 'FEIL'} ${label}${note ? '  (' + note + ')' : ''}`);
}

/* ------------------------------------------------------------------ *
 * Felles geometri og materialer
 * ------------------------------------------------------------------ */

const props = (pts) => ringProps(pts);
const E_STEEL = 210000; // N/mm²

/* ================================================================== *
 * §6.1–§6.4 — festemiddelstivhet etter EC5 tabell 7.1
 * ================================================================== */

test('1. K_ser etter EC5: ρ_m = 420 kg/m³, d = 8 mm, skrue ⟹ 2993,8917 N/mm', () => {
  // HÅNDREGNING, med mellomregning (EC5 tabell 7.1, rad 1 — dybler, bolter,
  // skruer og spiker med forboring):
  //   K_ser = ρ_m^1,5 · d / 23
  //   √420      = 20.493901531919196
  //   420^1,5   = 420 · 20.493901531919196 = 8607.438643406062
  //   · d = 8   = 68859.50914724850
  //   / 23      = 2993.891702054283 N/mm
  const exact = (Math.pow(420, 1.5) * 8) / 23;
  const r = ec5Kser({ fastener: 'dowel', rho: 420, d: 8 });

  ok('gyldig', r.valid === true, r.substituted);
  close('ρ_m [kg/m³]', r.rhoMean, 420, 0);
  close('420^1.5', Math.pow(420, 1.5), 8607.438643406062, 1e-12);
  close('K_ser [N/mm] mot symbolsk uttrykk', r.Kser, exact, 1e-15);
  close('K_ser [N/mm] mot håndregning', r.Kser, 2993.891702054283, 1e-12);
  close('K (SLS er standard) [N/mm]', r.K, r.Kser, 0);
  ok('kilden er merket EC5', r.source === 'ec5');
  ok('hjelpeteksten om at formlene gjelder trevirke følger med',
    r.notes.some((t) => /TREVIRKE/.test(t)));

  // De andre radene i tabellen, samme ρ og d — kontrollerer at hver formel er
  // koblet til riktig nøkkel og ikke bare gjenbruker rad 1.
  //   spiker uten forboring:  420^1,5 · 8^0,8 / 30
  //   8^0,8 = e^(0.8·ln8) = e^(0.8·2.0794415) = e^1.6635532 = 5.278031643091577
  close('8^0.8', Math.pow(8, 0.8), 5.278031643091577, 1e-12);
  close('spiker uten forboring [N/mm]',
    ec5Kser({ fastener: 'nail', rho: 420, d: 8 }).Kser,
    (Math.pow(420, 1.5) * Math.pow(8, 0.8)) / 30, 1e-15);
  close('klammer [N/mm]',
    ec5Kser({ fastener: 'staple', rho: 420, d: 8 }).Kser,
    (Math.pow(420, 1.5) * Math.pow(8, 0.8)) / 80, 1e-15);
  // ringdybel: ρ_m·d_c/2 = 420·65/2 = 13650 N/mm
  close('ringdybel d_c = 65 mm [N/mm]',
    ec5Kser({ fastener: 'splitring', rho: 420, dc: 65 }).Kser, 13650, 1e-12);
  // tannplatedybel: 1,5·ρ_m·d_c/4 = 1.5·420·65/4 = 40950/4 = 10237.5 N/mm
  close('tannplatedybel d_c = 65 mm [N/mm]',
    ec5Kser({ fastener: 'toothedplate', rho: 420, dc: 65 }).Kser, 10237.5, 1e-12);

  // Manglende diameter skal si fra, ikke gi NaN i et regnskap.
  const bad = ec5Kser({ fastener: 'dowel', rho: 420 });
  ok('manglende d gir valid=false og K = 0, ikke NaN', bad.valid === false && bad.K === 0);
});

test('2. Stål-mot-tre og betong-mot-tre dobler K_ser (EC5 7.1(3))', () => {
  // HÅNDREGNING: 2993.891702054283 · 2 = 5987.783404108566 N/mm
  const base = ec5Kser({ fastener: 'dowel', rho: 420, d: 8 });
  const steel = ec5Kser({ fastener: 'dowel', rho: 420, d: 8, contact: 'steel-timber' });
  const concrete = ec5Kser({ fastener: 'dowel', rho: 420, d: 8, contact: 'concrete-timber' });

  close('faktoren for stål mot tre', contactFactor('steel-timber'), 2, 0);
  close('faktoren for betong mot tre', contactFactor('concrete-timber'), 2, 0);
  close('faktoren for tre mot tre', contactFactor('timber-timber'), 1, 0);
  close('K_ser, stål mot tre [N/mm]', steel.Kser, 5987.783404108566, 1e-12);
  close('nøyaktig dobbelt av tre-mot-tre', steel.Kser / base.Kser, 2, 1e-15);
  close('betong mot tre gir det samme [N/mm]', concrete.Kser, steel.Kser, 0);
  ok('doblingen står i hjelpeteksten', steel.notes.some((t) => /multipliseres med 2/.test(t)));

  // Ukjent kontaktflate skal IKKE doble i stillhet.
  close('ukjent kontaktflate gir faktor 1', contactFactor('stål-mot-stål'), 1, 0);
});

test('3. Bruddgrensetilstand: K_u = ⅔·K_ser (EC5 2.2.2(1))', () => {
  // HÅNDREGNING: (2/3)·2993.891702054283 = 1995.9278013695222 N/mm
  const sls = ec5Kser({ fastener: 'dowel', rho: 420, d: 8, state: 'SLS' });
  const uls = ec5Kser({ fastener: 'dowel', rho: 420, d: 8, state: 'ULS' });

  close('K_ser er den samme uansett tilstand', uls.Kser, sls.Kser, 0);
  close('K_u [N/mm]', uls.Ku, 1995.9278013695222, 1e-12);
  close('K_u / K_ser', uls.Ku / uls.Kser, 2 / 3, 1e-15);
  close('K i bruk ved ULS er K_u', uls.K, uls.Ku, 0);
  close('K i bruk ved SLS er K_ser', sls.K, sls.Kser, 0);
  ok('valgt tilstand er tydelig merket', uls.state === 'ULS' && sls.state === 'SLS');
  close('stateFactor ULS', stateFactor('ULS'), 2 / 3, 1e-15);

  // Fritt innlagt fra ETA skal være LIKESTILT, ikke gjemt bort (§3.2), og
  // følge den samme ⅔-regelen når bare K_ser er oppgitt.
  const eta = etaKser({ Kser: 12000, state: 'ULS' });
  ok('ETA-verdien er gyldig uten noen EC5-inndata', eta.valid === true);
  close('ETA: K_ser [N/mm]', eta.Kser, 12000, 0);
  close('ETA: K_u = ⅔·K_ser [N/mm]', eta.K, 8000, 1e-12);
  // Er K_u oppgitt direkte i godkjenningen, brukes den som den er.
  close('ETA med eksplisitt K_u [N/mm]', etaKser({ Kser: 12000, Ku: 9000, state: 'ULS' }).K, 9000, 0);
  ok('slipModulus velger riktig kilde', slipModulus({ source: 'eta', Kser: 12000 }).source === 'eta');
  ok('slipModulus faller tilbake på EC5', slipModulus({ rho: 420, d: 8 }).source === 'ec5');
});

test('4. To ulike treslag: ρ_m = √(ρ_1·ρ_2) — geometrisk, ikke aritmetisk middel', () => {
  // HÅNDREGNING: ρ_1 = 380, ρ_2 = 460
  //   ρ_1·ρ_2 = 174800
  //   √174800 = 418.09089920733743 kg/m³
  //   (det ARITMETISKE middelet ville vært 420 — forskjellen er liten her, men
  //    den er systematisk, og testen skiller de to.)
  close('ρ_m [kg/m³]', meanDensity(380, 460), 418.09089920733743, 1e-12);
  ok('geometrisk ≠ aritmetisk middel', Math.abs(meanDensity(380, 460) - 420) > 1e-6,
    `√(380·460) = ${fmt(meanDensity(380, 460))}, (380+460)/2 = 420`);
  close('ett treslag brukes som det er', meanDensity(420), 420, 0);

  const r = ec5Kser({ fastener: 'dowel', rho1: 380, rho2: 460, d: 8 });
  close('ρ_m i resultatet [kg/m³]', r.rhoMean, Math.sqrt(380 * 460), 1e-15);
  close('K_ser [N/mm]', r.Kser, (Math.pow(Math.sqrt(380 * 460), 1.5) * 8) / 23, 1e-15);
  // Håndregnet videre: 418.09089920733743^1,5 = 8548.8180 , ·8 = 68390.544 ,
  //   /23 = 2973.5019127244627 N/mm  (mot 2993.8917 for ρ_m = 420 — de to
  //   treslagene gir altså 0,7 % lavere stivhet enn granverdien alene)
  close('K_ser mot håndregning [N/mm]', r.Kser, 2973.5019127244627, 1e-10);
  ok('mellomregningen for ρ_m står i «innsatte tall»', /√/.test(r.substituted), r.substituted.split('\n')[0]);
});

/* ================================================================== *
 * §6.5–§6.7 — γ-metoden
 *
 * FELLES EKSEMPEL for test 5, 6 og 7 — tall valgt slik at EA-ene blir like
 * og mellomregningen er til å følge for hånd:
 *
 *   Del 1 (eksisterende): trebjelke 100 x 200 mm, y = 0..200, E = 10 000 N/mm²
 *       A  = 20 000 mm²        EA₁ = 2.0e8 N
 *       I  = 100·200³/12 = 6.6666667e7 mm⁴      E₁I₁ = 6.6666667e11 Nmm²
 *       y₁ = 100 mm
 *   Del 2 (ny): stålplate 100 x 10 mm, y = 200..210, E = 200 000 N/mm²
 *       A  = 1 000 mm²         EA₂ = 2.0e8 N
 *       I  = 100·10³/12 = 8333.333 mm⁴          E₂I₂ = 1.6666667e9 Nmm²
 *       y₂ = 205 mm
 *
 *   a      = y₂ − y₁ = 105 mm
 *   EA*    = EA₁EA₂/(EA₁+EA₂) = 2e8·2e8/4e8 = 1.0e8 N
 *   ΣE_iI_i = 6.6666667e11 + 1.6666667e9 = 6.6833333e11 Nmm²   («ingen samvirkning»)
 *   Steiner: EA*·a² = 1e8·11025 = 1.1025e12 Nmm²
 *   EI_full = 6.6833333e11 + 1.1025e12 = 1.7708333e12 Nmm²      («full samvirkning»)
 * ================================================================== */

const G_EXISTING = [{ id: 'tre', props: props(rectPoints(0, 0, 100, 200)), E: 10000 }];
const G_NEW = [{ id: 'stål', props: props(rectPoints(0, 200, 100, 10)), E: 200000 }];
const G_SPAN = 5000; // mm, fritt opplagt ⟹ L_ef = 5000 mm
const EI_NONE = 6.6666666666666667e11 + 1.6666666666666667e9;
const EI_FULL = EI_NONE + 1e8 * 105 * 105;

test('5. Grensene: γ → 1 når K → ∞, γ → 0 når K → 0', () => {
  // Kontroll av forutsetningene først — hele resten hviler på dem.
  const s1 = sectionEA(G_EXISTING);
  const s2 = sectionEA(G_NEW);
  close('EA₁ [N]', s1.EA, 2e8, 1e-12);
  close('EA₂ [N]', s2.EA, 2e8, 1e-12);
  close('y₁ [mm]', s1.yc, 100, 1e-12);
  close('y₂ [mm]', s2.yc, 205, 1e-12);
  close('E₁I₁ [Nmm²]', s1.EIx, 6.6666666666666667e11, 1e-12);
  close('E₂I₂ [Nmm²]', s2.EIx, 1.6666666666666667e9, 1e-12);
  close('L_ef fritt opplagt [mm]', effectiveLength(G_SPAN, 'simple').Lef, 5000, 0);
  close('L_ef kontinuerlig felt [mm]', effectiveLength(G_SPAN, 'continuous').Lef, 4000, 0);
  close('L_ef utkraget [mm]', effectiveLength(G_SPAN, 'cantilever').Lef, 10000, 0);

  const run = (k) => gammaMethod({ groups: [G_EXISTING, G_NEW], ids: ['tre', 'stål'], k, span: G_SPAN });

  // --- K → ∞: stiv forbindelse ⟹ full samvirkning, EKSAKT.
  // ψ = π²/(k·L_ef²) → 0, altså γ = 1/(1+0) = 1.
  const rigid = run(Infinity);
  ok('k = ∞ er anvendelig', rigid.applicable === true, rigid.reason || '');
  close('γ_eff ved k = ∞', rigid.gammaEff, 1, 0);
  close('(EI)_ef ved k = ∞ [Nmm²]', rigid.EI_ef, EI_FULL, 1e-12);
  close('(EI)_ef = EI_full eksakt', rigid.EI_ef / rigid.EI_full, 1, 1e-15);
  close('y_ef = y_c ved full samvirkning [mm]', rigid.y_ef, rigid.y_full, 1e-12);
  // HÅNDREGNING av y_full: (2e8·100 + 2e8·205)/4e8 = 305/2 = 152.5 mm
  close('y_full [mm]', rigid.y_full, 152.5, 1e-12);

  // --- K → 0: ingen forbindelse ⟹ ingen samvirkning, EKSAKT.
  // ψ → ∞, altså γ = 1/(1+∞) = 0 for den delen som ikke er referanse.
  const free = run(0);
  close('γ_eff ved k = 0', free.gammaEff, 0, 0);
  close('(EI)_ef ved k = 0 [Nmm²]', free.EI_ef, EI_NONE, 1e-12);
  close('γ for den ikke-refererte delen', free.parts[1].gamma, 0, 0);
  close('y_ef faller sammen med referansedelen [mm]', free.y_ef, 100, 1e-12);

  // --- Monotoni og de asymptotiske grensene innenfra.
  // k = 1e6 N/mm²: ψ·EA* = π²·1e8/(1e6·2.5e7) = 9.8696e8/2.5e13 = 3.94784e-5
  //   ⟹ γ_eff = 1/(1 + 3.94784e-5) = 0.99996052...
  const stiff = run(1e6);
  close('γ_eff ved k = 1e6 [-]', stiff.gammaEff, 1 / (1 + (Math.PI * Math.PI * 1e8) / (1e6 * 2.5e7)), 1e-15);
  close('γ_eff ved k = 1e6 mot håndregning', stiff.gammaEff, 0.9999605231, 1e-9);
  // k = 1e-3 N/mm²: ψ·EA* = 9.8696e8/(1e-3·2.5e7) = 39478.4 ⟹ γ_eff = 2.533e-5
  const soft = run(1e-3);
  close('γ_eff ved k = 1e-3 [-]', soft.gammaEff, 1 / (1 + (Math.PI * Math.PI * 1e8) / (1e-3 * 2.5e7)), 1e-15);
  ok('γ_eff ved k = 1e-3 er nær null', soft.gammaEff < 1e-4, `γ = ${fmt(soft.gammaEff)}`);

  const ks = [1e-3, 1, 10, 40, 100, 1000, 1e6];
  const gs = ks.map((k) => run(k).gammaEff);
  ok('γ_eff vokser monotont med k', gs.every((g, i) => i === 0 || g > gs[i - 1]),
    gs.map((g) => g.toFixed(6)).join(' < '));
  ok('γ_eff ligger i [0, 1] for alle k', gs.every((g) => g >= 0 && g <= 1));
});

test('6. (EI)_ef ligger STRENGT mellom ingen og full samvirkning — den viktigste kontrollen', () => {
  // HÅNDREGNING for k = 40 N/mm per mm (den ene verdien det regnes helt ut for):
  //   ψ    = π²/(k·L_ef²) = 9.8696044010893586/(40·5000²) = 9.869604401e-9 1/N
  //   γ₂   = 1/(1 + ψ·EA₂) = 1/(1 + 9.869604401e-9·2e8) = 1/(1 + 1.9739208802)
  //        = 1/2.9739208802 = 0.3362564238517130
  //   (referansedelen er del 1, den eksisterende ⟹ γ₁ = 1, EC5 tillegg B)
  //   y_ef = (1·2e8·100 + 0.3362564239·2e8·205)/(1·2e8 + 0.3362564239·2e8)
  //        = (100 + 68.93256689)/1.3362564239 = 168.9325669/1.3362564239
  //        = 126.4222673689073 mm
  //   a₁   = 100 − 126.4222674 = −26.4222673689073 mm
  //   a₂   = 205 − 126.4222674 = +78.5777326310927 mm
  //   (EI)_ef = 6.6833333333e11
  //           + 1·2e8·26.4222673689²          = 2e8·698.1362 = 1.39627e11
  //           + 0.3362564239·2e8·78.5777326²  = 6.72513e7·6174.4599 = 4.15200e11
  //           = 1.223200948080386e12 Nmm²
  //
  //   KRYSSKONTROLL med den lukkede topartsformelen:
  //   γ_eff = 1/(1 + ψ·EA*) = 1/(1 + 9.869604401e-9·1e8) = 1/1.9869604401
  //         = 0.5032812832172817
  //   (EI)_ef = ΣE_iI_i + γ_eff·EA*·a² = 6.6833333333e11 + 0.5032812832·1.1025e12
  //           = 6.6833333333e11 + 5.548676148e11 = 1.223200948e12  ✓ samme tall
  const r = gammaMethod({ groups: [G_EXISTING, G_NEW], ids: ['tre', 'stål'], k: 40, span: G_SPAN });

  close('ψ·EA₂ [-]', (Math.PI * Math.PI * 2e8) / (40 * 25e6), 1.9739208802178716, 1e-12);
  close('γ₁ (referansedelen, EC5 tillegg B)', r.parts[0].gamma, 1, 0);
  close('γ₂', r.parts[1].gamma, 0.3362564238517130, 1e-12);
  close('γ_eff (samvirkegrad)', r.gammaEff, 0.5032812832172817, 1e-12);
  close('y_ef [mm]', r.y_ef, 126.4222673689073, 1e-12);
  close('a₁ [mm]', r.parts[0].a, -26.4222673689073, 1e-11);
  close('a₂ [mm]', r.parts[1].a, 78.5777326310927, 1e-12);

  close('EI_none = Σ E_iI_i [Nmm²]', r.EI_none, EI_NONE, 1e-12);
  close('EI_full (Steiner) [Nmm²]', r.EI_full, EI_FULL, 1e-12);
  close('EI_full mot håndregning [Nmm²]', r.EI_full, 1.7708333333333333e12, 1e-12);
  close('(EI)_ef [Nmm²]', r.EI_ef, 1.2232009480803862e12, 1e-12);

  // DEN VIKTIGSTE KONTROLLEN — strengt mellom grensene. Et fortegnsfeil på a_i
  // (eller a_i målt fra feil akse) bryter denne umiddelbart, fordi
  // Σγ_iEA_ia_i² da enten blir for stor eller kollapser mot null.
  ok('EI_none < (EI)_ef', r.EI_none < r.EI_ef, `${fmt(r.EI_none)} < ${fmt(r.EI_ef)}`);
  ok('(EI)_ef < EI_full', r.EI_ef < r.EI_full, `${fmt(r.EI_ef)} < ${fmt(r.EI_full)}`);

  // Samme kontroll over hele k-området, ikke bare i ett punkt.
  for (const k of [1e-2, 1, 10, 40, 500, 1e5]) {
    const g = gammaMethod({ groups: [G_EXISTING, G_NEW], k, span: G_SPAN });
    ok(`k = ${k}: EI_none < EI_ef < EI_full`,
      g.EI_ef > g.EI_none && g.EI_ef < g.EI_full,
      `γ = ${fmt(g.gammaEff)}, EI_ef = ${fmt(g.EI_ef)}`);
  }

  // EC5-dekomposisjonen og den lukkede topartsformelen skal gi SAMME (EI)_ef.
  // Dette er testen som fanger den nærliggende feilen: å bruke
  // γ_i = 1/(1+π²E_iA_i s/(K L²)) på BEGGE delene. Da telles ettergivenheten
  // to ganger, og EI_ef blir lavere enn den lukkede formelen.
  close('(EI)_ef = lukket topartsform', r.EI_ef, r.EI_ef_series, 1e-13);
  // Og samvirkningsgraden regnet ut av tallene skal treffe γ_eff eksakt.
  close('(EI_ef − EI_none)/(EI_full − EI_none) = γ_eff', r.efficiency, r.gammaEff, 1e-12);

  // Referansevalget skal IKKE endre (EI)_ef — bare dekomposisjonen.
  const swapped = gammaMethod({ groups: [G_EXISTING, G_NEW], k: 40, span: G_SPAN, referenceIndex: 1 });
  close('(EI)_ef er uavhengig av hvilken del som er referanse', swapped.EI_ef, r.EI_ef, 1e-13);
  ok('men y_ef er det IKKE (det er referansedelens nullpunkt)',
    Math.abs(swapped.y_ef - r.y_ef) > 1,
    `y_ef: ${fmt(r.y_ef)} mot ${fmt(swapped.y_ef)}`);

  // γ-metodens ES*-analog: lik tallverdi, motsatt fortegn på de to sidene.
  close('|γ₁EA₁a₁| = |γ₂EA₂a₂|', Math.abs(r.parts[0].ESgamma), Math.abs(r.parts[1].ESgamma), 1e-12);
  ok('fortegnene er motsatte', Math.sign(r.parts[0].ESgamma) === -Math.sign(r.parts[1].ESgamma));
});

test('7. F per festemiddel: ved γ → 1 nærmer den seg q_full·s/(rader·skjærplan)', () => {
  // HÅNDREGNING av full samvirkning, samme tverrsnitt:
  //   ES* for stålplata om det sammensatte tyngdepunktet (y_c = 152.5 mm):
  //      ES* = EA₂·(y₂ − y_c) = 2e8·(205 − 152.5) = 2e8·52.5 = 1.05e10 Nmm
  //   (samme tall som EA*·a = 1e8·105 = 1.05e10 — som det skal være for to deler)
  //   V = 60 kN = 60000 N
  //   q_full = V·ES*/EI_full = 60000·1.05e10/1.7708333333e12 = 355.7647058823529 N/mm
  const V = kNtoN(60);
  const combined = [...G_EXISTING, ...G_NEW];
  const section = sectionEA(combined);
  close('y_c ved full samvirkning [mm]', section.yc, 152.5, 1e-12);
  const flowFull = shearFlow({ V, groupParts: G_NEW, section });
  close('ES* [Nmm]', flowFull.EStar, 1.05e10, 1e-12);
  close('q_full [N/mm]', flowFull.qAbs, 355.7647058823529, 1e-12);

  // γ-metoden med k = ∞ må treffe nøyaktig det samme.
  const rigid = gammaMethod({ groups: [G_EXISTING, G_NEW], k: Infinity, span: G_SPAN, V });
  close('q fra γ-metoden ved k = ∞ [N/mm]', rigid.q, flowFull.qAbs, 1e-12);
  close('q_full fra γ-metoden [N/mm]', rigid.q_full, flowFull.qAbs, 1e-12);

  // TOLERANSEN, begrunnet: med k = 1e9 N/mm² er
  //   ψ·EA* = π²·1e8/(1e9·2.5e7) = 3.9478e-8, altså γ_eff = 1 − 3.95e-8.
  // Både q og EI_ef avviker da fra full samvirkning i 8. desimal. 1e-6 er
  // derfor romslig nok til å ikke være flaky, og likevel 50 ganger strammere
  // enn selve avviket ville krevd — den ville fanget en reell formelfeil.
  const nearRigid = gammaMethod({ groups: [G_EXISTING, G_NEW], k: 1e9, span: G_SPAN, V });
  ok('γ_eff er nær 1, men ikke 1', nearRigid.gammaEff < 1 && nearRigid.gammaEff > 1 - 1e-6,
    `γ = ${nearRigid.gammaEff.toFixed(12)}`);
  close('q nærmer seg q_full [N/mm]', nearRigid.q, flowFull.qAbs, 1e-6);

  // §4.1 — kraft per festemiddel.
  // HÅNDREGNING: s = 150 mm, 2 rader, 1 skjærplan:
  //   F = q·s/(rader·skjærplan) = 355.7647059·150/2 = 26682.35294 N = 26.68235 kN
  //   Utnyttelse mot F_Rd = 30 kN: 26682.35294/30000 = 0.8894118
  //   s_max ved util = 1:  s = rader·skjærplan·F_Rd/q = 2·30000/355.7647059 = 168.6473 mm
  //   Antall per løpemeter: q·1000/F_Rd = 355.7647059·1000/30000 = 11.85882 stk/m
  const f = fastenerForce({ q: flowFull.qAbs, spacing: 150, rows: 2, shearPlanes: 1, FRd: 30 });
  close('F per festemiddel [N]', f.F, 26682.352941176472, 1e-12);
  close('F per festemiddel [kN]', f.F_kN, 26.682352941176472, 1e-12);
  close('utnyttelse mot F_Rd = 30 kN', f.util, 0.8894117647058824, 1e-12);
  close('s_max [mm]', f.sMax, 168.65079365079364, 1e-8);
  close('antall per løpemeter [1/m]', f.nPerMetre, 11.858823529411764, 1e-12);
  ok('utnyttelse ≤ 1 gir ok', f.ok === true);

  // Ved DELVIS samvirkning er q lavere, og dermed også kraften per festemiddel.
  // Det er et forventet (og litt kontraintuitivt) resultat: en mykere fuge
  // overfører mindre kraft, men gir større nedbøyning.
  const partial = gammaMethod({ groups: [G_EXISTING, G_NEW], k: 40, span: G_SPAN, V });
  const fPartial = fastenerForce({ q: partial.q, spacing: 150, rows: 2, shearPlanes: 1, FRd: 30 });
  ok('q ved delvis samvirkning er mindre enn ved full',
    partial.q < partial.q_full, `${fmt(partial.q)} < ${fmt(partial.q_full)}`);
  ok('F ved delvis samvirkning er mindre enn ved full',
    fPartial.F < f.F, `${fmt(fPartial.F)} < ${fmt(f.F)}`);
  // …men EI er også mindre, så nedbøyningen er større. Begge skal vises.
  close('EI_full er fortsatt tilgjengelig ved siden av EI_ef [Nmm²]', partial.EI_full, EI_FULL, 1e-12);
  ok('og EI_ef er den lavere av de to',
    partial.EI_ef < partial.EI_full, `${fmt(partial.EI_ef)} < ${fmt(partial.EI_full)}`);
});

/* ================================================================== *
 * §6.8 — hovedakserotasjon (§1 i planen)
 *
 * FELLES GEOMETRI for test 8, 10 og 11 — en ensidig påsveiset plate:
 *
 *   Eksisterende: rektangel 100 (x) x 300 (y), hjørne (0,0)
 *   Ny lamell:    rektangel 100 (x) x  20 (y), hjørne (100,300)
 *                 — altså oppe til høyre, forskjøvet i BÅDE x og y
 *   Samme E overalt (E = 210 000), så E forkorter bort i alle forhold.
 * ================================================================== */

const SKEW_EXISTING = [{ id: 'bjelke', props: props(rectPoints(0, 0, 100, 300)), E: E_STEEL }];
const SKEW_NEW = [{ id: 'lamell', props: props(rectPoints(100, 300, 100, 20)), E: E_STEEL }];
const SKEW_ALL = [...SKEW_EXISTING, ...SKEW_NEW];

test('8. Hovedakserotasjon: ensidig lamell gir EI_xy ≠ 0, θ = −7,3826° og tan β = 0,66055', () => {
  // HÅNDREGNING (E er felles og forkorter i alle forhold, så vi regner med
  // rene arealstørrelser og ganger med E til slutt):
  //   Del A: A = 30000 mm², tyngdepunkt (50, 150)
  //   Del B: A =  2000 mm², tyngdepunkt (150, 310)
  //   A_tot = 32000 mm²
  //   x_c = (30000·50 + 2000·150)/32000 = (1 500 000 + 300 000)/32000 = 56.25 mm
  //   y_c = (30000·150 + 2000·310)/32000 = (4 500 000 + 620 000)/32000 = 160.00 mm
  //
  //   I_x = [100·300³/12 + 30000·(150−160)²] + [100·20³/12 + 2000·(310−160)²]
  //       = [225 000 000 + 3 000 000] + [66 666.667 + 45 000 000]
  //       = 228 000 000 + 45 066 666.667 = 273 066 666.667 mm⁴   (= 819 200 000/3)
  //   I_y = [300·100³/12 + 30000·(50−56.25)²] + [20·100³/12 + 2000·(150−56.25)²]
  //       = [25 000 000 + 1 171 875] + [1 666 666.667 + 17 578 125]
  //       = 26 171 875 + 19 244 791.667 = 45 416 666.667 mm⁴     (= 136 250 000/3)
  //   I_xy = 30000·(50−56.25)(150−160) + 2000·(150−56.25)(310−160)
  //        = 30000·(−6.25)(−10) + 2000·(93.75)(150)
  //        = 1 875 000 + 28 125 000 = 30 000 000 mm⁴
  //
  //   θ = ½·atan2(−2·I_xy, I_x − I_y) = ½·atan2(−6.0e7, 227 650 000)
  //     = ½·(−0.25770206469954088) = −0.12885103234977044 rad = −7.3826203395°
  //   I_1,2 = (I_x+I_y)/2 ± √(((I_x−I_y)/2)² + I_xy²)
  //         = 159 241 666.667 ± 117 712 066.607
  //     I_1 = 276 953 733.274 mm⁴ , I_2 = 41 529 600.059 mm⁴
  //   tan β = I_xy/I_y = 3.0e7/45 416 666.667 = 0.6605504587155964
  //         ⟹ β = 33.4443°, og den sidevegse nedbøyningen er 66,06 % av den loddrette.
  const Ix = 819200000 / 3;
  const Iy = 136250000 / 3;
  const Ixy = 3.0e7;

  const sec = sectionEA(SKEW_ALL);
  close('x_c [mm]', sec.xc, 56.25, 1e-12);
  close('y_c [mm]', sec.yc, 160, 1e-12);
  close('EI_x [Nmm²]', sec.EIx, E_STEEL * Ix, 1e-12);
  close('EI_y [Nmm²]', sec.EIy, E_STEEL * Iy, 1e-12);
  close('EI_xy [Nmm²]', sec.EIxy, E_STEEL * Ixy, 1e-12);

  const p = principalEI(sec);
  close('θ [rad]', p.theta, -0.12885103234977044, 1e-12);
  close('θ [°]', p.thetaDeg, -7.382620339545484, 1e-12);
  close('EI_1 [Nmm²]', p.EI1, E_STEEL * 276953733.2741305, 1e-12);
  close('EI_2 [Nmm²]', p.EI2, E_STEEL * 41529600.05920285, 1e-12);
  close('EI_1 + EI_2 = EI_x + EI_y (invariant)', p.EI1 + p.EI2, sec.EIx + sec.EIy, 1e-15);
  close('tan β = EI_xy/EI_y', p.tanBeta, 0.6605504587155964, 1e-12);
  close('β [°]', p.betaDeg, 33.446774807714938, 1e-10);
  close('skjevhet |EI_xy|/√(EI_xEI_y)', p.skew, 0.2693886427184488, 1e-12);
  ok('flagget som skjevt (over terskelen 0,02)', p.coupled === true, `skew = ${fmt(p.skew)}`);

  // Sammenligningen før → etter: det er DENNE §1.2-advarselen som er poenget.
  const cmp = axesComparison({ existing: SKEW_EXISTING, combined: SKEW_ALL });
  // Det eksisterende rektangelet er dobbeltsymmetrisk ⟹ EI_xy = 0, θ = 0.
  close('EI_xy før [Nmm²]', cmp.before.EIxy, 0, 1e-9);
  close('θ før [°]', cmp.before.thetaDeg, 0, 1e-9);
  ok('ikke skjevt før forsterkning', cmp.before.coupled === false);
  close('Δx_c [mm]', cmp.dxc, 6.25, 1e-12);
  close('Δy_c [mm]', cmp.dyc, 10, 1e-12);
  close('Δθ [°]', cmp.dThetaDeg, -7.382620339545484, 1e-12);
  ok('ADVARSEL: forsterkningen har innført skjev bøyning', cmp.introducedSkew === true);
  close('sidevegs andel av nedbøyningen [%]', cmp.lateralPercent, 66.05504587155964, 1e-12);
  close('terskelen er den planen krever', SKEW_THRESHOLD, 0.02, 0);

  // Et dobbeltsymmetrisk tverrsnitt skal IKKE flagges.
  const sym = axesComparison({
    existing: SKEW_EXISTING,
    combined: [...SKEW_EXISTING, { id: 'topp', props: props(rectPoints(0, 300, 100, 20)), E: E_STEEL }],
  });
  ok('symmetrisk forsterkning gir ingen advarsel', sym.introducedSkew === false);
  close('EI_xy etter symmetrisk forsterkning [Nmm²]', sym.after.EIxy, 0, 1e-9);
});

/* ================================================================== *
 * Egne tilfeller — biaksiell skjærstrøm, N_G og forankring
 * ================================================================== */

test('9. REGRESJON: EI_xy = 0 gir nøyaktig de gamle to uavhengige leddene', () => {
  // Dette er den viktigste regresjonssjekken etter omskrivingen til biaksiell
  // form. Den generelle formelen er
  //   q = [(V_y·EI_y − V_x·EI_xy)·ES*_x + (V_x·EI_x − V_y·EI_xy)·ES*_y] / D
  // og med EI_xy = 0 er D = EI_x·EI_y, altså
  //   q = V_y·ES*_x/EI_x + V_x·ES*_y/EI_y.
  const E = E_STEEL;

  // --- 9a) Det homogene 100x300-rektangelet, snitt i halv høyde: 250 N/mm.
  //   I = 100·300³/12 = 2.25e8 mm⁴ , Q = (100·150)·75 = 1.125e6 mm³
  //   q = 50000·1.125e6/2.25e8 = 250 N/mm
  const section300 = sectionEA([{ id: 'a', props: props(rectPoints(0, 0, 100, 300)), E }]);
  const top = [{ id: 'top', props: props(rectPoints(0, 150, 100, 150)), E }];
  close('EI_xy for et dobbeltsymmetrisk snitt', section300.EIxy, 0, 1e-9);
  close('q via shearFlow (gammel signatur) [N/mm]',
    shearFlow({ V: kNtoN(50), groupParts: top, section: section300 }).q, 250, 1e-12);
  close('q via shearFlowBiaxial [N/mm]',
    shearFlowBiaxial({ Vy: kNtoN(50), groupParts: top, section: section300 }).q, 250, 1e-12);

  // --- 9b) Loddrett snitt i samme rektangel, V_x: 750 N/mm.
  //   I_y = 300·100³/12 = 2.5e7 mm⁴ , Q = (50·300)·25 = 375 000 mm³
  //   q = 50000·375000/2.5e7 = 750 N/mm
  const right = [{ id: 'h', props: props(rectPoints(50, 0, 50, 300)), E }];
  close('q_x via gammel signatur (axis: "x") [N/mm]',
    shearFlow({ V: kNtoN(50), groupParts: right, section: section300, axis: 'x' }).qAbs, 750, 1e-12);
  close('q_x via shearFlowBiaxial [N/mm]',
    Math.abs(shearFlowBiaxial({ Vx: kNtoN(50), groupParts: right, section: section300 }).q), 750, 1e-12);

  // --- 9c) I-profilen fra joints.test.mjs, sveis flens–steg: 452,75 N/mm.
  //   overflens 100x10 (y 190..200), steg 6x180 (y 10..190), underflens 100x10 (y 0..10)
  //   y_c = 100 mm (symmetrisk)
  //   I = 2·[100·10³/12 + 1000·95²] + 6·180³/12
  //     = 2·[25 000/3 + 9 025 000] + 2 916 000 = 54 200 000/3 + 8 748 000/3
  //     = 62 948 000/3 = 20 982 666.667 mm⁴
  //   EI = 210000·62 948 000/3 = 70000·62 948 000 = 4 406 360 000 000 Nmm² (eksakt)
  //   ES*_flens = 210000·1000·95 = 1.995e10 Nmm ,  V = 100 kN
  //   q = 100000·1.995e10/4.40636e12 = 452.75465463557219 N/mm
  //   (samme fasit som test 2 i joints.test.mjs, som kommer dit via halvplan-
  //    klippingen — her bygges flensen som sin egen del, uten klipper)
  const ipe = [
    { id: 'overflens', props: props(rectPoints(-50, 190, 100, 10)), E },
    { id: 'steg', props: props(rectPoints(-3, 10, 6, 180)), E },
    { id: 'underflens', props: props(rectPoints(-50, 0, 100, 10)), E },
  ];
  const ipeSection = sectionEA(ipe);
  close('I-profil y_c [mm]', ipeSection.yc, 100, 1e-12);
  close('I-profil EI_x [Nmm²]', ipeSection.EIx, E * 20982666.666666668, 1e-12);
  close('I-profil q i sveisen [N/mm]',
    shearFlow({ V: kNtoN(100), groupParts: [ipe[0]], section: ipeSection }).qAbs, 452.75465463557219, 1e-12);

  // --- 9d) Superposisjon: to komponenter samtidig er summen når EI_xy = 0.
  const both = shearFlowBiaxial({ Vy: kNtoN(50), Vx: kNtoN(50), groupParts: top, section: section300 });
  close('q_y-bidraget [N/mm]', both.qy, 250, 1e-12);
  ok('q_x-bidraget er null for en gruppe som er symmetrisk om y-aksen',
    Math.abs(both.qx) < 1e-9, `q_x = ${fmt(both.qx)}`);
  ok('resultatet er IKKE flagget som koblet', both.coupled === false);
});

test('10. Biaksiell skjærstrøm med EI_xy ≠ 0 — håndregnet, og kontrollert mot hovedaksene', () => {
  // Geometrien fra test 8. Gruppa er lamellen (delen over/til høyre for snittet).
  // HÅNDREGNING (E forkorter overalt: både teller og nevner er ∝ E²):
  //   ES*_x = A_B·(y_B − y_c) = 2000·(310 − 160)  = 300 000 mm³ (·E)
  //   ES*_y = A_B·(x_B − x_c) = 2000·(150 − 56.25)= 187 500 mm³ (·E)
  //   D/E²  = I_x·I_y − I_xy² = 273 066 666.667·45 416 666.667 − 3.0e7²
  //         = 1.2401777778e16 − 9.0e14 = 1.1501777778e16 mm⁸
  //   Med V_y = 50 kN og V_x = 0:
  //     q = V_y·(I_y·ES*_x − I_xy·ES*_y)/D
  //       = 50000·(45 416 666.667·300 000 − 3.0e7·187 500)/1.1501777778e16
  //       = 50000·(1.3625e13 − 5.625e12)/1.1501777778e16
  //       = 50000·8.0e12/1.1501777778e16
  //       = 4.0e17/1.1501777778e16 = 34.77723250511998 N/mm
  //
  //   SAMMENLIGNING: den GAMLE, uavhengige formen ville gitt
  //     q_gammel = V_y·ES*_x/EI_x = 50000·300000/273 066 666.667 = 54.9316 N/mm
  //   altså 58 % for høyt. Det er nøyaktig den feilen omskrivingen retter.
  const Vy = kNtoN(50);
  const sec = sectionEA(SKEW_ALL);
  const m = stiffnessMatrix(sec);
  const g = groupFirstMoments(SKEW_NEW, sec);

  close('ES*_x [Nmm]', g.ESx, E_STEEL * 300000, 1e-12);
  close('ES*_y [Nmm]', g.ESy, E_STEEL * 187500, 1e-12);
  close('D [N²mm⁸]', m.D, E_STEEL * E_STEEL * 1.1501777777777778e16, 1e-12);
  ok('D > 0 for et fysisk tverrsnitt (Cauchy–Schwarz)', m.valid === true && m.D > 0);

  const flow = shearFlowBiaxial({ Vy, groupParts: SKEW_NEW, section: sec });
  close('q [N/mm] mot håndregning', flow.q, 34.77723250511998, 1e-12);
  ok('resultatet er flagget som koblet (EI_xy ≠ 0)', flow.coupled === true);
  ok('den gamle uavhengige formen ville bommet grovt',
    Math.abs(Vy * g.ESx / sec.EIx - flow.q) > 20,
    `gammel form ga ${fmt(Vy * g.ESx / sec.EIx)}, riktig er ${fmt(flow.q)}`);

  // UAVHENGIG KONTROLL via hovedaksene. I hovedaksesystemet er EI_x'y' = 0,
  // og da GJELDER de to uavhengige leddene. Utledning av transformasjonen:
  //   akser roteres θ mot klokka:  x' =  x·c + y·s ,  y' = −x·s + y·c
  //   invers:                      x  = x'·c − y'·s , y  = x'·s + y'·c
  //   ES*_x' = ∫_G E y' dA = ∫_G E(−x·s + y·c) dA = c·ES*_x − s·ES*_y
  //   ES*_y' = ∫_G E x' dA = ∫_G E( x·c + y·s) dA = c·ES*_y + s·ES*_x
  //   M_x = ∫σ y dA = ∫σ(x'·s + y'·c) dA = s·M_y' + c·M_x'
  //   M_y = ∫σ x dA = ∫σ(x'·c − y'·s) dA = c·M_y' − s·M_x'
  //   ⟹ M_x' = c·M_x − s·M_y  og  M_y' = s·M_x + c·M_y, og det samme for V
  //     (V er den deriverte av M langs bjelkeaksen, samme lineære kombinasjon).
  //   q er en skalar (kraft per lengde langs z) og må være den samme i begge
  //   systemene. Dette er en helt annen regnevei enn koden bruker.
  const p = principalEI(sec);
  const c = Math.cos(p.theta);
  const s = Math.sin(p.theta);
  const ESx1 = c * g.ESx - s * g.ESy;
  const ESy1 = c * g.ESy + s * g.ESx;
  const Vy1 = c * Vy; // V_x = 0
  const Vx1 = s * Vy;
  const qPrincipal = (Vy1 * ESx1) / p.EI1 + (Vx1 * ESy1) / p.EI2;
  close('q via hovedaksene (uavhengig regnevei) [N/mm]', qPrincipal, flow.q, 1e-12);

  // Og den motsatte lastretningen, som fanger et fortegnsbytte i koblingsleddet.
  // HÅNDREGNING med V_x = 50 kN, V_y = 0:
  //   q = V_x·(I_x·ES*_y − I_xy·ES*_x)/D
  //     = 50000·(273 066 666.667·187 500 − 3.0e7·300 000)/1.1501777778e16
  //     = 50000·(5.12000e13 − 9.0e12)/1.1501777778e16
  //     = 50000·4.22e13/1.1501777778e16 = 2.11e18/1.1501777778e16
  //     = 183.44990146450789 N/mm
  const Vx = kNtoN(50);
  const flowX = shearFlowBiaxial({ Vx, groupParts: SKEW_NEW, section: sec });
  const Ix = 819200000 / 3;
  const Ixy = 3.0e7;
  const D0 = 1.1501777777777778e16;
  close('q for V_x [N/mm] mot håndregning',
    flowX.q, (50000 * (Ix * 187500 - Ixy * 300000)) / D0, 1e-12);
  close('q for V_x [N/mm] mot håndregnet desimal', flowX.q, 183.44990146450789, 1e-12);
  const qPrincipalX = ((-s * Vx * ESx1) / p.EI1) + ((c * Vx * ESy1) / p.EI2);
  close('q for V_x via hovedaksene [N/mm]', qPrincipalX, flowX.q, 1e-12);

  // Superposisjon skal fortsatt gjelde (formelen er lineær i V).
  const flowBoth = shearFlowBiaxial({ Vy, Vx, groupParts: SKEW_NEW, section: sec });
  close('q(V_y + V_x) = q(V_y) + q(V_x)', flowBoth.q, flow.q + flowX.q, 1e-12);
});

test('11. Nøytralaksens helning for rent M_x, og N_G som integralet av q', () => {
  // §1.2: for et rent M_x er nøytralaksen y/x = EI_xy/EI_y.
  // UTLEDNING (se principalEI): M_y = 0 ⟹ κ_y = −κ_x·EI_xy/EI_y, og ε = 0 gir
  //   κ_x·y + κ_y·x = 0 ⟹ y/x = −κ_y/κ_x = EI_xy/EI_y.
  const sec = sectionEA(SKEW_ALL);
  const Mx = kNmToNmm(100); // 1e8 Nmm
  const cur = curvatures({ section: sec, Mx, My: 0 });
  ok('krumningene er gyldige', cur.valid === true);
  close('nøytralaksens helning −κ_y/κ_x', -cur.ky / cur.kx, sec.EIxy / sec.EIy, 1e-12);
  close('… mot håndregnet tan β', -cur.ky / cur.kx, 0.6605504587155964, 1e-12);
  ok('κ_y ≠ 0 selv om M_y = 0 — det ER den skjeve bøyningen',
    Math.abs(cur.ky) > 1e-14, `κ_y = ${fmt(cur.ky)}`);

  // N_G fra biaksiell bøyning (§8.2, som erstatter N_G = M·ES*/EI).
  // HÅNDREGNING: N_G = M_x·(I_y·ES*_x − I_xy·ES*_y)/D (E forkorter)
  //   = 1e8·8.0e12/1.1501777778e16 = 69554.46501023996 N = 69.5545 kN
  const a = axialInGroup({ Mx, My: 0, groupParts: SKEW_NEW, section: sec });
  close('N_G [N]', a.NG, 69554.46501023996, 1e-12);
  close('N_G [kN]', a.NG_kN, 69.55446501023996, 1e-12);

  // KONSISTENSKONTROLL, og hele begrunnelsen for §8.1: q = dN_G/dz. Siden
  // begge er lineære i lasten, må N_G/M_x være nøyaktig lik q/V_y.
  const flow = shearFlowBiaxial({ Vy: kNtoN(50), groupParts: SKEW_NEW, section: sec });
  close('N_G/M_x = q/V_y  [1/mm]', a.NG / Mx, flow.q / kNtoN(50), 1e-14);

  // Degenerert tverrsnitt: alt materialet på én linje gjennom tyngdepunktet.
  // Da er D = 0 (likhet i Cauchy–Schwarz), og vi skal si fra, ikke dele på null.
  // Praktisk versjon: et uendelig tynt, skrått bånd. Vi lager det som to
  // punktnære rektangler på en diagonal.
  const thin = sectionEA([
    { id: 'p1', props: props(rectPoints(0, 0, 1e-7, 1e-7)), E: E_STEEL },
    { id: 'p2', props: props(rectPoints(1000, 1000, 1e-7, 1e-7)), E: E_STEEL },
  ]);
  const mThin = stiffnessMatrix(thin);
  ok('degenerert tverrsnitt gir valid=false i stedet for deling på ~0',
    mThin.valid === false, `D = ${fmt(mThin.D)}, EI_x·EI_y = ${fmt(mThin.EIx * mThin.EIy)}`);
  const degFlow = shearFlowBiaxial({ Vy: 1000, groupParts: [{ id: 'p2', props: props(rectPoints(1000, 1000, 1e-7, 1e-7)), E: E_STEEL }], section: thin });
  ok('og skjærstrømmen svarer q = 0, valid=false', degFlow.valid === false && degFlow.q === 0);

  // Tom gruppe skal fortsatt si fra (uendret oppførsel fra før omskrivingen).
  ok('tom gruppe gir valid=false',
    shearFlowBiaxial({ Vy: 1000, groupParts: [], section: sec }).valid === false);
});

test('12. §8.2 forankringskontroll: L_req = N_G/q_Rd for lim, skruer og sveis', () => {
  // HÅNDREGNING av q_Rd for de tre forbindelsestypene, og L_req med
  // N_G = 120 kN = 120 000 N:
  //
  //   LIM:    q_Rd = τ_Rd·b = 4.0·150 = 600 N/mm
  //           L_req = 120000/600 = 200 mm
  //   SKRUE:  q_Rd = rader·F_Rd/s = 2·8000/200 = 80 N/mm   (F_Rd er lagret i kN)
  //           L_req = 120000/80 = 1500 mm
  //   SVEIS:  q_Rd = n·a·f_vw,d = 2·4·207 = 1656 N/mm
  //           L_req = 120000/1656 = 72.46376811594203 mm
  const NG = kNtoN(120);

  const glue = { kind: 'glue', tauRd: 4.0, Ga: 700, ta: 2 };
  close('q_Rd lim [N/mm]', jointCapacityFlow(glue, 150), 600, 1e-12);
  const aGlue = anchorageCheck({ NG, L: 150, connector: glue, bondWidth: 150 });
  close('L_req lim [mm]', aGlue.Lreq, 200, 1e-12);
  close('utnyttelse L_req/L ved L = 150 mm', aGlue.util, 4 / 3, 1e-12);
  ok('for kort forankring flagges', aGlue.ok === false);
  ok('advarselen står først i notatene', /ADVARSEL/.test(aGlue.notes[0]), aGlue.notes[0]);
  ok('middelverdiforbeholdet er med', aGlue.notes.some((t) => /middelverdi/.test(t)));
  ok('Volkersen-forbeholdet er med', aGlue.notes.some((t) => /Volkersen/.test(t)));

  const screw = { kind: 'screw', FRd: 8, rows: 2, spacing: 200 };
  close('q_Rd skrue [N/mm]', jointCapacityFlow(screw), 80, 1e-12);
  const aScrew = anchorageCheck({ NG, L: 2000, connector: screw });
  close('L_req skrue [mm]', aScrew.Lreq, 1500, 1e-12);
  close('utnyttelse ved L = 2000 mm', aScrew.util, 0.75, 1e-12);
  ok('lang nok forankring er ok', aScrew.ok === true);

  const weld = { kind: 'weld', a_weld: 4, fvwd: 207, nWelds: 2 };
  close('q_Rd sveis [N/mm]', jointCapacityFlow(weld), 1656, 1e-12);
  close('L_req sveis [mm]', anchorageCheck({ NG, L: 100, connector: weld }).Lreq,
    72.46376811594203, 1e-12);

  // q_Rd hentes fra `connectorCheck` og skal være IDENTISK med den kapasiteten
  // forbinderkontrollen selv bruker — ellers ville de to sagt ulike ting.
  close('q_Rd stemmer med connectorCheck (lim)',
    jointCapacityFlow(glue, 150),
    connectorCheck({ q: 600, bondWidth: 150, connector: glue }).qRd, 0);
  close('q_Rd stemmer med connectorCheck (skrue)',
    jointCapacityFlow(screw), connectorCheck({ q: 80, connector: screw }).qRd, 0);

  // N_G regnet ut av momentene i stedet for lagt inn direkte.
  const sec = sectionEA(SKEW_ALL);
  const fromM = anchorageCheck({
    Mx: kNmToNmm(100), My: 0, groupParts: SKEW_NEW, section: sec,
    L: 1000, connector: glue, bondWidth: 100,
  });
  close('N_G fra M_x [kN]', fromM.NG_kN, 69.55446501023996, 1e-12);
  // q_Rd = 4.0·100 = 400 N/mm ⟹ L_req = 69554.465/400 = 173.886 mm
  close('L_req fra M_x [mm]', fromM.Lreq, 69554.46501023996 / 400, 1e-12);
  close('utnyttelse ved L = 1000 mm', fromM.util, 0.17388616252559989, 1e-12);

  // Manglende kapasitet skal gi valid=false, ikke Infinity.
  const noCap = anchorageCheck({ NG, L: 1000, connector: { kind: 'glue' }, bondWidth: 150 });
  ok('manglende τ_Rd gir valid=false og L_req = null', noCap.valid === false && noCap.Lreq === null);
});

test('13. γ-metoden sier tydelig fra når den IKKE er anvendelig', () => {
  // Mer enn to grupper: planen krever at verktøyet sier fra, ikke gjetter på
  // en generalisering. (EC5 tillegg B har en treparts-form, men den
  // forutsetter en bestemt oppbygging med et sammenhengende steg i midten, og
  // den lar seg ikke uten videre overføre til «tre vilkårlige grupper».)
  const three = gammaMethod({
    groups: [G_EXISTING, G_NEW, [{ id: 'c', props: props(rectPoints(0, 210, 100, 10)), E: 200000 }]],
    k: 40, span: G_SPAN,
  });
  ok('tre grupper ⟹ applicable = false', three.applicable === false);
  ok('begrunnelsen nevner topartstilfellet', /topartstilfellet/.test(three.reason || ''), three.reason || '');
  ok('ingen tall lekker ut som om de var gyldige',
    three.valid === false && three.EI_ef === 0 && three.gammaEff === 0);

  const one = gammaMethod({ groups: [G_EXISTING], k: 40, span: G_SPAN });
  ok('én gruppe ⟹ applicable = false', one.applicable === false);

  const noSpan = gammaMethod({ groups: [G_EXISTING, G_NEW], k: 40 });
  ok('manglende spennvidde ⟹ applicable = false', noSpan.applicable === false);
  ok('begrunnelsen nevner L_ef', /L_ef/.test(noSpan.reason || ''), noSpan.reason || '');

  const noK = gammaMethod({ groups: [G_EXISTING, G_NEW], span: G_SPAN });
  ok('manglende fugestivhet ⟹ applicable = false', noK.applicable === false);

  const noEA = gammaMethod({ groups: [G_EXISTING, []], k: 40, span: G_SPAN });
  ok('tom gruppe ⟹ applicable = false', noEA.applicable === false);

  // Full samvirkning skal ALDRI erstattes stille: notatene sier det eksplisitt.
  const good = gammaMethod({ groups: [G_EXISTING, G_NEW], k: 40, span: G_SPAN });
  ok('notatene sier at full samvirkning fortsatt er standard',
    good.notes.some((t) => /Full samvirkning er fortsatt standard/.test(t)));
  ok('notatene forklarer hva y_ef er (og ikke er)',
    good.notes.some((t) => /ingen felles nøytralakse/.test(t)));
  ok('systemvalget er merket i resultatet', good.system === 'simple');
});

test('14. Fugestivhet k: lim, skruer og skjærplan — enhetene går opp', () => {
  // LIM: k = G_a·b/t_a = 700·150/2 = 52 500 N/mm per mm.  (N/mm²)·mm/mm = N/mm². ✓
  close('k for lim [N/mm²]', glueStiffness({ Ga: 700, ta: 2, bondWidth: 150 }), 52500, 1e-12);
  ok('manglende heftbredde gir 0, ikke NaN', glueStiffness({ Ga: 700, ta: 2 }) === 0);

  // SKRUE, §3.3: k = n_skjærplan·n_rader·K/s
  //   ett skjærplan, 2 rader, K = 5000 N/mm, s = 200 mm:  1·2·5000/200 = 50 N/mm²
  //   to skjærplan (samme skrue gjennom to fuger):        2·2·5000/200 = 100 N/mm²
  close('k for skrue, 1 skjærplan [N/mm²]',
    jointStiffness({ K: 5000, rows: 2, spacing: 200 }), 50, 1e-12);
  close('k for skrue, 2 skjærplan [N/mm²]',
    jointStiffness({ K: 5000, rows: 2, spacing: 200, shearPlanes: 2 }), 100, 1e-12);
  ok('manglende senteravstand gir 0', jointStiffness({ K: 5000, rows: 2 }) === 0);

  // Hele kjeden: EC5 → k. ρ_m = 420, d = 8, stål mot tre, ULS, 2 rader, s = 150.
  //   K_ser = 2993.891702054283 · 2 = 5987.783404108566 N/mm
  //   K_u   = ⅔ · 5987.783404 = 3991.855602739044 N/mm
  //   k     = 1·2·3991.855602739044/150 = 53.22474136985392 N/mm²
  const slip = ec5Kser({ fastener: 'dowel', rho: 420, d: 8, contact: 'steel-timber', state: 'ULS' });
  close('K_u [N/mm]', slip.K, 3991.8556027390444, 1e-12);
  const k = jointStiffness({ K: slip.K, rows: 2, spacing: 150 });
  close('k gjennom hele kjeden [N/mm²]', k, 53.224741369853925, 1e-12);

  // `interfaceStiffness` er den ene inngangen UI-et skal bruke.
  const viaConnector = interfaceStiffness({
    connector: { kind: 'screw', rows: 2, spacing: 150 }, slip,
  });
  close('samme tall via interfaceStiffness [N/mm²]', viaConnector.k, k, 1e-12);
  ok('utregningen kan vises', /53\.22/.test(viaConnector.substituted), viaConnector.substituted);

  const viaGlue = interfaceStiffness({ connector: { kind: 'glue', Ga: 700, ta: 2 }, bondWidth: 150 });
  close('lim via interfaceStiffness [N/mm²]', viaGlue.k, 52500, 1e-12);

  // SVEIS er stiv: k = ∞ ⟹ γ = 1 eksakt, ikke «0,9997».
  const viaWeld = interfaceStiffness({ connector: { kind: 'weld' } });
  ok('sveis gir k = ∞', viaWeld.k === Infinity);
  const weldGamma = gammaMethod({ groups: [G_EXISTING, G_NEW], k: viaWeld.k, span: G_SPAN });
  close('γ_eff for sveis', weldGamma.gammaEff, 1, 0);
  close('(EI)_ef for sveis = full samvirkning [Nmm²]', weldGamma.EI_ef, EI_FULL, 1e-12);
});

/* ================================================================== *
 * Kjøring
 * ================================================================== */

let failures = 0;
console.log('\ncomposite.test.mjs — samvirkegrad, festemiddelstivhet, biaksiell bøyning, forankring\n');
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
