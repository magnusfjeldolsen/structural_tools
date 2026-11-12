/**
 * Skriver `fixtures/payload-custom-hd265-prestressed.json` = `buildPayload` av
 * referansetilstanden i `prestress.test.mjs`. Kjøres for hånd når tilstanden endres med
 * vilje:  node concrete_section_calculator/tests/gen-prestress-fixture.mjs
 * Testen `payload-custom-hd265-prestressed.json er buildPayload ...` holder fila ærlig.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPayload } from '../js/payload.js';
import { prestressedStore } from './prestress.test.mjs';

const out = fileURLToPath(new URL('./fixtures/payload-custom-hd265-prestressed.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(buildPayload(prestressedStore().getState()), null, 2)}\n`);
console.log(`wrote ${out}`);
