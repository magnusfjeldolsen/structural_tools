/**
 * materials.test.mjs — de avledede materialverdiene måles mot motorens egne.
 *
 * Testen sammenligner `derivedMaterials()` med `materials`-blokken i
 * resultatfixturen, som er skrevet av `structuralcodes` selv. Det er den eneste
 * måten å fange at JS-siden og motoren har begynt å regne forskjellig — en
 * drift som ellers bare ville vist seg som to litt ulike tall i rapporten.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONCRETE_GRADES,
  CONCRETE_LAWS,
  STEEL_GRADES,
  STEEL_LAWS,
  concreteProps,
  concreteStrainLimits,
  derivedMaterials,
  Ecm,
  fcm,
  fctm,
  ftkOf,
  matchConcreteGrade,
  matchSteelGrade,
  steelProps,
} from '../js/materials.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

/** Samme materialdata som referansebjelken — merk α_cc = 1,0 (plan §3.6). */
const REF_STATE = {
  concrete: { fck: 30, gamma_c: 1.5, alpha_cc: 1.0, law: 'parabolarectangle' },
  steel: {
    fyk: 500,
    Es: 200000,
    k: 1.08,
    epsuk: 0.075,
    gamma_eps: 0.9,
    gamma_s: 1.15,
    law: 'elasticplastic',
  },
};

test('derivedMaterials stemmer med det structuralcodes selv rapporterte', () => {
  const ours = derivedMaterials(REF_STATE);
  const theirs = fixture('result-bending-beam-300x600').materials;
  for (const [key, expected] of Object.entries(theirs)) {
    assert.ok(key in ours, `mangler avledet verdi: ${key}`);
    if (typeof expected === 'number') {
      assert.ok(
        Math.abs(ours[key] - expected) <= Math.abs(expected) * 1e-12,
        `${key}: ${ours[key]} != ${expected}`
      );
    } else {
      assert.equal(ours[key], expected, `${key}`);
    }
  }
});

test('fcd = α_cc·f_ck/γ_c — α_cc slår faktisk gjennom', () => {
  assert.equal(concreteProps(REF_STATE.concrete).fcd, 20);
  // Norsk NA-standard 0,85 skal gi 17,0 — ikke stille falle tilbake til 1,0.
  assert.equal(concreteProps({ ...REF_STATE.concrete, alpha_cc: 0.85 }).fcd, 17);
});

test('fcm, fctm og Ecm følger EC2 tabell 3.1', () => {
  assert.equal(fcm(30), 38);
  assert.equal(fctm(30), 0.3 * Math.pow(30, 2 / 3));
  assert.ok(Math.abs(fctm(30) - 2.896468153816889) < 1e-12);
  assert.ok(Math.abs(Ecm(30) - 32836.56803133079) < 1e-9);
  // Over C50/60 bytter fctm til det logaritmiske uttrykket.
  assert.ok(Math.abs(fctm(60) - 2.12 * Math.log(1 + 68 / 10)) < 1e-12);
});

test('tøyningsgrensene bærer NAVNET sitt, og navnet følger loven', () => {
  const pr = concreteStrainLimits(30, 'parabolarectangle');
  assert.deepEqual(pr, {
    eps_c: 0.002,
    eps_cu: 0.0035,
    eps_c_name: 'eps_c2',
    eps_cu_name: 'eps_cu2',
  });
  const bl = concreteStrainLimits(30, 'bilinearcompression');
  assert.deepEqual(bl, {
    eps_c: 0.00175,
    eps_cu: 0.0035,
    eps_c_name: 'eps_c3',
    eps_cu_name: 'eps_cu3',
  });
  // Uten navnet ville rapporten trykket «ε_cu2» selv når motoren brukte ε_cu3.
  assert.notEqual(pr.eps_c_name, bl.eps_c_name);
  assert.notEqual(pr.eps_c, bl.eps_c);
});

test('ftk = k·fyk, og k er alltid satt', () => {
  assert.equal(ftkOf({ fyk: 500, k: 1.08 }), 540);
  assert.equal(ftkOf({ fyk: 500, k: 1.05 }), 525);
  // Tomt k skal gi NaN, ikke stille 1 — motoren ville ellers fått ftk = fyk.
  assert.ok(Number.isNaN(ftkOf({ fyk: 500, k: '' })));
});

test('steelProps: fyd, ftd, eps_yd og eps_ud', () => {
  const s = steelProps(REF_STATE.steel);
  assert.equal(s.fyd, 500 / 1.15);
  assert.equal(s.ftd, 540 / 1.15);
  assert.equal(s.eps_yd, 500 / 1.15 / 200000);
  // epsud() = epsuk · gamma_eps. Uten gamma_eps i tilstanden bruker motoren
  // stille 0,9 mens rapporten kan trykke noe annet (plan §3.6).
  assert.equal(s.eps_ud, 0.0675);
  assert.equal(steelProps({ ...REF_STATE.steel, gamma_eps: 1.0 }).eps_ud, 0.075);
});

test('sargin og popovics tilbys IKKE — sikkerhetskutt, ikke forglemmelse', () => {
  const values = CONCRETE_LAWS.map((l) => l.value);
  assert.deepEqual(values, ['parabolarectangle', 'bilinearcompression']);
  assert.deepEqual(STEEL_LAWS.map((l) => l.value), [
    'elasticperfectlyplastic',
    'elasticplastic',
  ]);
});

test('tomme felt gir NaN, ikke 0', () => {
  // 0 ville sett ut som et svar. NaN forplanter seg synlig.
  assert.ok(Number.isNaN(concreteProps({ fck: '', gamma_c: 1.5, alpha_cc: 1 }).fcd));
  assert.ok(Number.isNaN(steelProps({ fyk: 500, gamma_s: '' }).fyd));
});

/* ================================================================== *
 * Å KJENNE IGJEN EN KVALITET (runde 6 §2.2)
 *
 * HVORFOR DISSE FINNES
 * Brikkeraden for stål skrev `fyk`, `k` OG `epsuk` i samme klikk, mens `k` og
 * `ε_uk` hadde sine egne felt rett under — to skrivere til samme verdi. Nå er
 * tilstanden kilden og kvaliteten avledningen, og HELE den avledningen ligger
 * i `matchSteelGrade`. Feiler den, viser nedtrekket feil kvalitet ved siden av
 * riktige tall, og det er en løgn ingen annen kontroll fanger.
 * ================================================================== */

test('matchSteelGrade finner kvaliteten bak tallene', () => {
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 0.075 }).label, 'B500NC (k = 1.08)');
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.05, epsuk: 0.025 }).label, 'B500NA (k = 1.05)');
});

test('B500NC og B500NB skilles KUN av ε_uk — og det skal holde', () => {
  // De to har samme `fyk` OG samme `k`. Ser oppslaget bort fra `epsuk`, blir
  // 5 % duktilitet vist som 7,5 % — 50 % feil på det tallet `ε_ud` og hele
  // duktilitetskontrollen hviler på, uten at noe annet endrer seg.
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 0.05 }).label, 'B500NB (k = 1.08)');
  assert.notEqual(
    matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 0.05 }).label,
    matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 0.075 }).label
  );
});

test('flyttallsstøy fra en JSON-tur er IKKE «Custom»', () => {
  // 0.075 skrevet som 7.5/100 i uttrykksfeltet, eller lest tilbake fra en
  // lagret fil, kommer fort som 0.07500000000000001. Med `===` ville en lagret
  // B500NC blitt lest tilbake som «Custom…» — riktige tall, feil merkelapp, og
  // ingen feilmelding.
  const noisy = 0.075 + Number.EPSILON * 0.075;
  assert.notEqual(noisy, 0.075, 'testen forutsetter at verdien FAKTISK avviker');
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: noisy }).label, 'B500NC (k = 1.08)');
  assert.equal(matchSteelGrade({ fyk: 500 + 1e-12, k: 1.08, epsuk: 0.075 }).label, 'B500NC (k = 1.08)');
});

test('toleransen er ikke så slapp at to ekte kvaliteter smelter sammen', () => {
  // k = 1,05 mot 1,08 er ~3 %. Blir toleransen noen gang løsnet til «nesten
  // like», forsvinner skillet mellom duktilitetsklasse A og C i stillhet.
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.0799, epsuk: 0.075 }), null);
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 0.0751 }), null);
  assert.equal(matchSteelGrade({ fyk: 499.9, k: 1.08, epsuk: 0.075 }), null);
});

test('egne tall gir null — det er «Custom», ikke nærmeste kvalitet', () => {
  // `null` er hele poenget: nedtrekket skal si «Custom…» og låse opp feltene,
  // ikke gjette på den kvaliteten som ligger nærmest og påstå den.
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.15, epsuk: 0.075 }), null);
  assert.equal(matchSteelGrade({ fyk: 400, k: 1.08, epsuk: 0.075 }), null);
});

test('manglende og ugyldige tall gir null, ikke et tilfeldig treff', () => {
  // Et felt under redigering er tomt. `Number('')` er 0, og en tabelloppføring
  // med 0 i ville da «truffet» — derfor går alt gjennom `num()` først.
  assert.equal(matchSteelGrade({}), null);
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: '' }), null);
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: 'abc' }), null);
  assert.equal(matchSteelGrade({ fyk: 500, k: 1.08, epsuk: null }), null);
});

test('hver kvalitet i tabellen kjenner seg selv igjen', () => {
  // Fanger en oppføring som legges inn med en verdi oppslaget ikke leser —
  // en kvalitet man kan VELGE, men som nedtrekket straks etter viser som
  // «Custom…».
  for (const g of STEEL_GRADES) {
    assert.equal(matchSteelGrade(g), g, `${g.label} fant ikke seg selv`);
  }
  for (const g of CONCRETE_GRADES) {
    assert.equal(matchConcreteGrade(g.fck), g, `${g.label} fant ikke seg selv`);
  }
});

test('matchConcreteGrade: klassen eller null, aldri nærmeste', () => {
  assert.equal(matchConcreteGrade(35).label, 'C35/45');
  assert.equal(matchConcreteGrade(33), null);
  assert.equal(matchConcreteGrade(''), null);
  assert.equal(matchConcreteGrade(undefined), null);
});
