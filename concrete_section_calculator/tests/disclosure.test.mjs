/**
 * disclosure.test.mjs — progressiv avdekking (runde 6 §2.1 og §2.6).
 *
 * HVORFOR DENNE FILA FINNES
 * Å skjule et inndatafelt er den farligste UX-endringen i hele verktøyet. Et
 * skjult `γ_c = 0` er ikke et ryddigere skjema, det er en kalkulator som lyver:
 * motoren leser 0 som 1,5, rapporten trykker 0, og feltet som forklarer
 * forskjellen er sammenfoldet. Planens to regler er derfor ikke råd, de er
 * betingelsene for at skjulingen i det hele tatt er lov:
 *
 *   1. En boks som inneholder et felt `validate()` klager på, MÅ åpnes.
 *   2. Automatikken får bare ÅPNE, aldri lukke.
 *   3. (i tillegg) En boks åpnes ved oppstart hvis en verdi inne i den avviker
 *      fra standarden — ellers skjuler en innlastet fil med θ = 30° nettopp
 *      det som gjør den fila spesiell.
 *
 * Regel 2 er DOM-atferd og måles i nettleseren. Regel 1 og 3 er rene
 * funksjoner, og det er dem som kan råtne i det stille: legger noen til en
 * `<details>` uten å føre den opp i `DISCLOSURE_BOXES`, eller endrer
 * `validate()` en feltsti, forsvinner koblingen uten at noe feiler.
 *
 * TESTENE GÅR GJENNOM DEN EKTE `validate()`, ikke gjennom oppdiktede
 * feltstier. Det er hele poenget: en oppdiktet sti ville bekreftet at
 * strengsammenlikningen virker, ikke at den treffer de stiene modulen faktisk
 * produserer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DISCLOSURE_BOXES, boxForField, boxesAlwaysOpen, boxesForIssues, boxesForNonDefaults }
  from '../js/ui.js';
import { defaultState } from '../js/store.js';
import { validate } from '../js/section.js';

/** Leser en punktsti. Leser DATATABELLEN, ikke tilstanden — testen under
 *  («hver sti peker på noe som finnes») er det eneste stedet den brukes. */
const read = (obj, path) =>
  path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/** Standardtilstanden med én verdi byttet ut, uten å røre originalen. */
function withPatch(patch) {
  const s = defaultState();
  return { ...s, ...patch };
}

/* ---------------------------------------------------------------- *
 * Selve tabellen
 * ---------------------------------------------------------------- */

test('hver sti i tabellen peker på noe som FINNES i tilstanden', () => {
  // En skrivefeil i en sti (`steel.epsUk`) gir `undefined` på begge sider av
  // sammenlikningen. Boksen ville da aldri åpnet seg for et avvik i det
  // feltet, og INGEN annen test ville sagt fra — feilen er taus per
  // konstruksjon.
  const base = defaultState();
  for (const box of DISCLOSURE_BOXES) {
    for (const p of box.paths) {
      assert.notEqual(read(base, p), undefined, `${box.id}: stien «${p}» finnes ikke i defaultState()`);
    }
    for (const p of box.derived || []) {
      assert.ok(box.paths.includes(p), `${box.id}: «${p}» er merket derived uten å være innhold`);
    }
  }
});

test('ingen boks eier et felt en annen boks også eier', () => {
  // To bokser over samme sti ville gitt to bokser åpnet av samme feil — og
  // dermed en åpen boks brukeren ikke kan se grunnen til.
  const seen = new Map();
  for (const box of DISCLOSURE_BOXES) {
    for (const p of box.paths) {
      assert.equal(seen.get(p), undefined, `«${p}» eies av både ${seen.get(p)} og ${box.id}`);
      seen.set(p, box.id);
    }
  }
});

test('boxForField treffer segmentvis, ikke på tegnprefiks', () => {
  assert.equal(boxForField('concrete.alpha_cc'), 'adv-material');
  assert.equal(boxForField('steel.gamma_s'), 'adv-material');
  // `validate()` gir indekserte stier ned i lista — de hører til samme boks.
  assert.equal(boxForField('shear.stirrups.0.spacing'), 'adv-shear');
  assert.equal(boxForField('shear.strut_angle_deg'), 'adv-shear');
  // Alltid synlige felt hører IKKE hjemme i noen boks. Svarte funksjonen en
  // boks her, ville en feil på `h` foldet ut materialfaktorene.
  assert.equal(boxForField('geometry.h'), null);
  assert.equal(boxForField('layers.3.dc'), null);
  assert.equal(boxForField('combos'), null);
  assert.equal(boxForField(''), null);
  assert.equal(boxForField(undefined), null);
  // Tegnprefiks er ikke nok: `concrete.gamma_c` skal ikke dekke
  // `concrete.gamma_cx`, som er et annet felt.
  assert.equal(boxForField('concrete.gamma_cx'), null);
});

/* ---------------------------------------------------------------- *
 * REGEL 1 — gjennom den EKTE validate()
 * ---------------------------------------------------------------- */

test('γ_c = 0 folder ut materialboksen — den skjulte nullen §2.6 finnes for', () => {
  const s = defaultState();
  s.concrete.gamma_c = 0;
  const issues = validate(s);
  assert.ok(issues.some((i) => i.code === 'invalid_gamma_c'), 'validate() ga ikke feilen testen bygger på');
  assert.deepEqual(boxesForIssues(issues), ['adv-material']);
});

test('α_cc = 0 og γ_s = 0 folder ut den samme boksen', () => {
  const a = defaultState();
  a.concrete.alpha_cc = 0;
  assert.deepEqual(boxesForIssues(validate(a)), ['adv-material']);
  const b = defaultState();
  b.steel.gamma_s = 0;
  assert.deepEqual(boxesForIssues(validate(b)), ['adv-material']);
});

test('k < 1 folder ut materialboksen — feltet BOR der, selv om nedtrekket setter det', () => {
  // `steel.k` er merket `derived` (kvaliteten bestemmer det), men INPUT-feltet
  // står inne i boksen. Regel 1 spør hvor feltet står, ikke hvem som skrev
  // verdien — ellers ville «k = f_tk/f_yk må være minst 1,0» pekt på et felt
  // ingen kan se.
  const s = defaultState();
  s.steel.k = 0.9;
  const issues = validate(s);
  assert.ok(issues.some((i) => i.code === 'invalid_k'));
  assert.deepEqual(boxesForIssues(issues), ['adv-material']);
});

test('en ugyldig trykkstavvinkel folder ut skjærboksen', () => {
  const s = defaultState();
  s.shear = { ...s.shear, strut_angle_deg: 10 };
  const issues = validate(s);
  assert.ok(issues.some((i) => i.code === 'invalid_strut_angle'));
  assert.deepEqual(boxesForIssues(issues), ['adv-shear']);
});

test('en bøyle med for stor senteravstand folder ut skjærboksen', () => {
  // Den indekserte stien `shear.stirrups.0.spacing`. Denne er grunnen til at
  // `pathCoveredBy` må matche prefikset `shear` og ikke bare hele stien.
  const s = defaultState();
  s.shear = {
    ...s.shear,
    stirrups: [{ id: 'S1', dia: 12, spacing: 900, legs: 2, fywk: 500, alpha: 90 }],
  };
  const issues = validate(s);
  assert.ok(issues.some((i) => i.code === 'stirrup_spacing_exceeds_max'));
  assert.ok(boxesForIssues(issues).includes('adv-shear'));
});

test('en feil på et ALLTID synlig felt folder ikke ut noe', () => {
  // Uten dette ville hver eneste geometrifeil åpnet alt — og en automatikk som
  // alltid åpner er en avdekking som ikke finnes.
  //
  // BØYLERADEN TAS BORT MED VILJE. Standardbjelken har én nå, og med h = 0 blir
  // `s_l,max = 0,75·d` null, så bøyleraden får sin EGEN feil
  // (`stirrup_spacing_exceeds_max`) — en følgefeil av høyden, ikke noe brukeren
  // har gjort. Den ville åpnet skjærboksen og skjult det testen faktisk måler:
  // at feilen på `geometry.h` i seg selv ikke folder ut noe. Følgefeilen er et
  // eget spørsmål, og hører ikke hjemme i denne testen.
  const s = defaultState();
  s.shear = { ...s.shear, stirrups: [] };
  s.geometry.h = 0;
  const issues = validate(s);
  assert.ok(issues.some((i) => i.code === 'invalid_height'));
  assert.ok(!issues.some((i) => String(i.field).startsWith('shear')), 'ingen skjærfeil å bli forstyrret av');
  assert.deepEqual(boxesForIssues(issues), []);
});

test('standardtilstanden gir ingen åpne bokser fra regel 1', () => {
  // Standardtilstanden har én advarsel (`no_load`, felt `combos`), og den skal
  // ikke folde ut noe. Åpnet den en boks, ville verktøyet startet med alt
  // utbrettet og §2.1 vært uten virkning.
  assert.deepEqual(boxesForIssues(validate(defaultState())), []);
});

/* ---------------------------------------------------------------- *
 * REGEL 3 — avvik fra standarden
 * ---------------------------------------------------------------- */

test('standardtilstanden avviker fra ingenting', () => {
  assert.deepEqual(boxesForNonDefaults(defaultState()), []);
});

test('θ = 30° folder ut skjærboksen — det som gjør fila spesiell', () => {
  const s = defaultState();
  s.shear = { ...s.shear, strut_angle_deg: 30 };
  assert.deepEqual(boxesForNonDefaults(s), ['adv-shear']);
});

test('en bøylerad folder ut skjærboksen — Ø og c/c skal alltid være synlige', () => {
  // Plan §2.1 setter bøyle-Ø og c/c blant de alltid synlige feltene. Boksen er
  // en `<details>`, og det henger sammen NØYAKTIG fordi denne regelen åpner
  // den i det øyeblikket det finnes en rad å vise. Ryker denne testen, er de
  // to feltene skjult bak et klikk i strid med planen.
  const s = defaultState();
  s.shear = {
    ...s.shear,
    stirrups: [{ id: 'S1', dia: 12, spacing: 200, legs: 2, fywk: 500, alpha: 90 }],
  };
  assert.deepEqual(boxesForNonDefaults(s), ['adv-shear']);
});

test('d_g og sidedekning folder ut avstandsboksen', () => {
  const a = defaultState();
  a.spacing = { ...a.spacing, d_g: 22 };
  assert.deepEqual(boxesForNonDefaults(a), ['adv-spacing']);
  assert.deepEqual(boxesForNonDefaults(withPatch({ cover_side: 40 })), ['adv-spacing']);
});

test('E_s ≠ 200 GPa folder ut materialboksen', () => {
  // E_s gikk rett inn i ε_yd, som rapporten trykker, og hadde ingen kontroll i
  // det hele tatt før denne runden. Nå har den både et felt og en avdekking.
  const s = defaultState();
  s.steel.Es = 210000;
  assert.deepEqual(boxesForNonDefaults(s), ['adv-material']);
});

test('en standard STÅLKVALITET folder IKKE ut materialboksen', () => {
  // B500NA setter `k` og `ε_uk`, men begge står allerede i nedtrekket og i
  // sammendraget over boksen. En åpning her ville vært en åpning uten en
  // eneste ny opplysning i — det er dét `derived` finnes for.
  const s = defaultState();
  s.steel.k = 1.05;
  s.steel.epsuk = 0.025;
  assert.deepEqual(boxesForNonDefaults(s), []);
});

test('en ikke-standard f_ck eller f_yk folder ikke ut noe — de har ingen felt inne i en boks', () => {
  const a = defaultState();
  a.concrete.fck = 45;
  assert.deepEqual(boxesForNonDefaults(a), []);
  const b = defaultState();
  b.steel.fyk = 400;
  assert.deepEqual(boxesForNonDefaults(b), []);
});

test('NØKKELREKKEFØLGE er ikke et avvik', () => {
  // En `JSON.stringify`-sammenlikning ville sagt «avvik» her. En lastet fil
  // kan fint gi `{z_factor, strut_angle_deg}` der standarden gir motsatt
  // rekkefølge, og boksen ville åpnet seg for en forskjell som ikke finnes —
  // hver gang, for hver fil.
  const s = defaultState();
  s.shear = { z_factor: s.shear.z_factor, stirrups: s.shear.stirrups, strut_angle_deg: s.shear.strut_angle_deg };
  assert.deepEqual(boxesForNonDefaults(s), []);
});

test('flere avvik gir flere bokser, hver bare én gang', () => {
  const s = defaultState();
  s.steel.Es = 210000;
  s.spacing = { ...s.spacing, k2: 8 };
  s.shear = { ...s.shear, z_factor: 0.85 };
  assert.deepEqual(boxesForNonDefaults(s).sort(), ['adv-material', 'adv-shear', 'adv-spacing']);
});

/* ---------------------------------------------------------------- *
 * §2.1 — felt som ALLTID skal være synlige
 * ---------------------------------------------------------------- */

test('en bøylerad holder skjærboksen åpen ved HVER opptegning, ikke bare ved oppstart', () => {
  // MÅLT I NETTLESEREN: `ModuleAPI.setInputs()` med en bøylerad lot boksen stå
  // lukket med raden inni — Ø og c/c usynlige, stikk i strid med §2.1, som
  // setter nettopp de to blant de alltid synlige feltene.
  // `boxesForNonDefaults` kunne ikke fange det: den kjøres bare ved oppstart
  // og lasting.
  //
  // STANDARDBJELKEN HAR EN BØYLERAD NÅ, så den er selv tilfellet «en rad
  // finnes»: skjærboksen skal stå åpen fra første opptegning, og Ø og c/c er
  // dermed synlige med det samme — som §2.1 krever, og som er forutsetningen
  // for at geometrifeltet «Stirrup Ø» kunne fjernes. En bjelke brukeren har
  // tømt for bøyler er motstykket: ingen rad, ingen Ø og c/c å vise.
  const beam = defaultState();
  assert.equal(beam.shear.stirrups.length, 1);
  assert.deepEqual(boxesAlwaysOpen(beam), ['adv-shear']);

  const utenBøyler = defaultState();
  utenBøyler.shear = { ...utenBøyler.shear, stirrups: [] };
  assert.deepEqual(boxesAlwaysOpen(utenBøyler), []);

  const flereRader = defaultState();
  flereRader.shear = {
    ...flereRader.shear,
    stirrups: [
      { id: 'S1', dia: 12, spacing: 200, legs: 2, fywk: 500, alpha: 90 },
      { id: 'S2', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 },
    ],
  };
  assert.deepEqual(boxesAlwaysOpen(flereRader), ['adv-shear'], 'én boks, ikke én per rad');
});

test('boxesAlwaysOpen tåler en halvferdig tilstand', () => {
  // Kalles fra `render()`, som også kjøres før en lastet fil er normalisert.
  assert.deepEqual(boxesAlwaysOpen(), []);
  assert.deepEqual(boxesAlwaysOpen({}), []);
  assert.deepEqual(boxesAlwaysOpen({ shear: {} }), []);
});
