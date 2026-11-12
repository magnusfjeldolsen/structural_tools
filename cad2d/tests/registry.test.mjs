/**
 * registry.test.mjs — cad2d/index.html havner i en fornuftig kategori i
 * modulregisteret (review av #94, punkt 12), uten å skrive module-registry.json.
 *
 * Leser funksjonene ut av generate-registry.js og kjører dem på sida, slik
 * generatoren gjør ved utrulling.
 *
 *   node cad2d/tests/registry.test.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ok, section, done } from './harness.mjs';

const gen = await readFile(fileURLToPath(new URL('../../module-registry/generate-registry.js', import.meta.url)), 'utf8');
const html = await readFile(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

// Bare de rene funksjonene (ingen fs, ingen skriving)
const pick = (name) => {
  const i = gen.indexOf(`function ${name}(`);
  let depth = 0;
  for (let j = gen.indexOf('{', i); j < gen.length; j++) {
    if (gen[j] === '{') depth++;
    if (gen[j] === '}' && --depth === 0) return gen.slice(i, j + 1);
  }
  throw new Error(name);
};
const cats = /const CATEGORIES = \[[^\]]*\];/.exec(gen)[0];
const api = new Function(`${cats}\n${pick('determineCategory')}\n${pick('extractMetaTag')}\n${pick('extractTitle')}\n${pick('parseKeywords')}\nreturn { determineCategory, extractMetaTag, extractTitle, parseKeywords };`)();

section('cad2d i registeret');
{
  const keywords = api.parseKeywords(api.extractMetaTag(html, 'keywords') || '');
  const category = api.determineCategory('cad2d', keywords, api.extractMetaTag(html, 'category'));
  ok('kategorien er ikke «structural-analysis»', category !== 'structural-analysis', category);
  ok('kategorien er «other» (satt eksplisitt)', category === 'other', category);
  ok('tittel uten «cad2d —»-mappenavn', /^2D CAD Editor/.test(api.extractTitle(html)), api.extractTitle(html));
  ok('beskrivelse og nøkkelord', (api.extractMetaTag(html, 'description') || '').length > 60 && keywords.includes('dxf import'));
  ok('uten meta-kategori gjettes det som før', api.determineCategory('2dfea', [], null) === 'structural-analysis'
    && api.determineCategory('concrete_x', [], null) === 'concrete');
  ok('ukjent meta-kategori ignoreres', api.determineCategory('cad2d', [], 'tull') === 'structural-analysis');
}

done();
