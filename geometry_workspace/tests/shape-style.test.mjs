/**
 * shape-style.test.mjs — fasit for fylling etter tilstand og kontur etter
 * materialfamilie.
 *
 *   node geometry_workspace/tests/shape-style.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function dataUrl(src) {
  return 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64');
}

async function inlineModule(relPath, from) {
  const url = new URL(relPath, from);
  let src = await readFile(fileURLToPath(url), 'utf8');
  const specs = new Set([...src.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map((m) => m[1]));
  for (const spec of specs) {
    const child = await inlineModule(spec, url);
    src = src.split(`'${spec}'`).join(`'${child}'`);
  }
  return dataUrl(src);
}

const { STAGE_FILL, CONTOUR, materialFamily, shapeFill, contourStyle } = await import(
  await inlineModule('../js/shape-style.js', import.meta.url)
);

let failed = 0;
function eq(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.log(`  FEIL ${label} — fikk ${JSON.stringify(actual)}, ventet ${JSON.stringify(expected)}`);
  }
}

const steel = { stage: 'existing', color: '#38bdf8', material: { name: 'S355', E: 210000 } };
const concrete = { stage: 'existing', material: { name: 'C30/37' } };
const timber = { stage: 'new', color: '#f472b6', material: { name: 'GL30c' } };
const cfrp = { stage: 'new', material: { name: 'CFRP' } };
const freeE = { material: { name: '', E: 12345 } };

console.log('Fylling etter tilstand');
eq('eksisterende', shapeFill(steel), STAGE_FILL.existing);
eq('ny', shapeFill(timber), STAGE_FILL.new);
eq('manglende stage regnes som eksisterende', shapeFill(freeE), STAGE_FILL.existing);
eq('av: formens egen farge', shapeFill(timber, false), '#f472b6');
eq('av, uten egen farge: faller tilbake', shapeFill(concrete, false), STAGE_FILL.existing);
eq('ny og eksisterende har ulik farge', STAGE_FILL.new !== STAGE_FILL.existing, true);

console.log('Kontur etter materialfamilie');
eq('stål', materialFamily(steel), 'Stål');
eq('betong', materialFamily(concrete), 'Betong');
eq('tre', materialFamily(timber), 'Tre');
eq('CFRP er «Annet»', materialFamily(cfrp), 'Annet');
eq('fritt E uten preset er «Annet»', materialFamily(freeE), 'Annet');
eq('uten materiale er «Annet»', materialFamily({}), 'Annet');
eq('stål heltrukken', contourStyle(steel).kind, 'solid');
eq('betong tykk', contourStyle(concrete).kind, 'thick');
eq('betong tykkere enn stål', contourStyle(concrete).weight > contourStyle(steel).weight, true);
eq('tre stiplet', contourStyle(timber).kind, 'dashed');
eq('annet prikket', contourStyle(cfrp).kind, 'dotted');
eq('prikk kortere enn strek', CONTOUR.Annet.dash < CONTOUR.Tre.dash, true);

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
