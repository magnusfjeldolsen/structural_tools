/**
 * agr-norway.test.mjs — js/agr-norway.js skal speile agR_norway.csv rad for rad,
 * og hver kommune skal finnes én gang per fylke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AGR_NORWAY } from '../js/agr-norway.js';

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(here, '..', 'agR_norway.csv'), 'utf8')
  .trim().split(/\r?\n/).slice(1).map(l => l.split(','));

test('JS-data og CSV er like', () => {
  assert.equal(AGR_NORWAY.length, csv.length);
  csv.forEach(([fylke, kommune, nr, agR], i) => {
    assert.deepEqual(AGR_NORWAY[i], { fylke, kommune, nr, agR: Number(agR) });
  });
});

test('ingen kommune eller kommunenummer to ganger', () => {
  const names = AGR_NORWAY.map(r => `${r.fylke}|${r.kommune}`);
  const nrs = AGR_NORWAY.map(r => r.nr);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(nrs).size, nrs.length);
});

test('stikkprøve fra NA-arket: Ålesund 1507 = 0,45', () => {
  assert.deepEqual(AGR_NORWAY.find(r => r.nr === '1507'),
    { fylke: 'Møre og Romsdal', kommune: 'Ålesund', nr: '1507', agR: 0.45 });
});
