/**
 * harness.mjs — felles rigg for cad2d sine Node-tester. Ingen avhengigheter.
 *
 * Laster den vendorede polygon-clipping som i nettleseren (`window.polygonClipping`)
 * og gir `ok()`/`done()` med samme utskrift som testene i geometry_workspace.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));

/** `import()` av en fil i cad2d/js, relativt til cad2d/. */
export const load = (rel) => import(pathToFileURL(fileURLToPath(new URL(`../${rel}`, import.meta.url))).href);

let failed = 0;
let passed = 0;

export function ok(label, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

export function section(title) {
  console.log(title);
}

export function done() {
  if (failed) {
    console.log(`${failed} av ${failed + passed} tester feilet`);
    process.exit(1);
  }
  console.log(`Alle tester bestått (${passed})`);
}

export const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
export const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
