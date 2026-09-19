/**
 * combo-types.test.mjs — lastkombinasjonstypene står fire steder.
 *
 * `COMBO_TYPES` i `rebar.js` er den erklærte enekilden, men de tre andre stedene
 * kan ikke IMPORTERE den: `ui.js` bygger `<option>`-er som statisk markup,
 * `report.js` har en etikett per type, og `engine.py` er et annet språk. Å samle
 * dem i én modul ville betydd at Python leste fra JS, og det finnes ikke.
 *
 * Duplikatet er derfor tillatt — men bare fordi DENNE testen finnes. Legger noen
 * til en fjerde type uten å røre de andre tre, tilbyr ikke nedtrekket den,
 * rapporten skriver «–», og motoren normaliserer den bort. Alt stille.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COMBO_TYPES } from '../js/rebar.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('COMBO_TYPES er de tre EC2-tilstandene, i rekkefølge', () => {
  assert.deepEqual([...COMBO_TYPES], ['uls', 'characteristic', 'quasi_permanent']);
});

test('nedtrekket i index.html/ui.js tilbyr nøyaktig de typene som finnes', () => {
  const ui = read('js/ui.js');
  const options = [...ui.matchAll(/<option value="(uls|characteristic|quasi_permanent)"/g)]
    .map((m) => m[1]);
  assert.deepEqual(
    [...new Set(options)].sort(),
    [...COMBO_TYPES].sort(),
    'en type uten <option> kan ikke velges, og en <option> uten type blir normalisert bort'
  );
});

test('rapporten har en etikett for hver type', () => {
  const rep = read('js/report.js');
  const block = /const COMBO_TYPE_LABELS = Object\.freeze\(\{([\s\S]*?)\}\)/.exec(rep);
  assert.ok(block, 'fant ikke COMBO_TYPE_LABELS');
  for (const t of COMBO_TYPES) {
    assert.match(block[1], new RegExp(t + ':'), t + ' mangler etikett — rapporten ville skrevet tankestrek');
  }
});

test('motoren kjenner de samme typene', () => {
  const py = read('python/engine.py');
  const tuple = /combo_type in \(([^)]*)\)/.exec(py);
  assert.ok(tuple, 'fant ikke typelista i engine.py');
  for (const t of COMBO_TYPES) {
    assert.match(tuple[1], new RegExp(`'${t}'`), `${t} mangler i engine.py — den ville blitt normalisert til uls`);
  }
});
