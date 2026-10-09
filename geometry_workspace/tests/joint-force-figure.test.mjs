/**
 * joint-force-figure.test.mjs — forklaringsfiguren bak (?) ved «Krefter i skjøtene».
 *
 *   node geometry_workspace/tests/joint-force-figure.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const src = await readFile(fileURLToPath(new URL('../js/joint-force-figure.js', import.meta.url)), 'utf8');
const { jointForceFigureSvg } = await import(
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64')
);

let failed = 0;
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failed++;
    console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('Med tall');
const svg = jointForceFigureSvg({ q: 91.55, NG: 45.78, qReq: 45.78, L: 1000, name: 'Betong ↔ Limtre' });
ok('er en SVG', svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'));
ok('tre paneler', ['1 · Snitt i felt', '2 · Forsterkningen slutter der M ≠ 0', '3 · Forsterkningen går til et momentnullpunkt'].every((t) => svg.includes(t)));
// nb-NO, én desimal: 91,55 → «91,6»; 45,78 → «45,8»; L uten desimaler, med tusenskille (nb-NO bruker hardt mellomrom)
ok('q med én desimal og komma', svg.includes('q = 91,6 kN/m'), svg.match(/q = [^<]*/)?.[0]);
ok('N_G', svg.includes('N_G = 45,8 kN'));
ok('N_G/L og L', /N_G\/L = 45,8 kN\/m over L = 1\s000 mm/.test(svg));
ok('skjøtenavnet står, og er escapet', svg.includes('tall for Betong ↔ Limtre'));
ok('M ≠ 0 og M = 0 er merket', svg.includes('M ≠ 0') && svg.includes('M = 0'));

console.log('Uten tall');
const empty = jointForceFigureSvg();
ok('manglende verdier blir «…», ikke NaN', !/NaN|undefined/.test(empty) && empty.includes('q = … kN/m'));
ok('ingen skjøtenavn-linje uten navn', !empty.includes('tall for'));

const xss = jointForceFigureSvg({ name: '<script>' });
ok('navnet escapes', !xss.includes('<script>') && xss.includes('&lt;script&gt;'));

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
