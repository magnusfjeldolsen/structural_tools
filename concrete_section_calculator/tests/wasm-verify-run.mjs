/**
 * wasm-verify-run.mjs — starter serveren, kjører wasm-verifiseringen, rydder opp.
 *
 * HVORFOR DENNE FINNES. `wasm-verify.mjs` krevde at noen først startet en server
 * i et annet vindu og husket porten. En verifisering med to manuelle trinn foran
 * seg blir ikke kjørt, og denne ble det ikke: den skulle fanget at motoren ikke
 * lastet i det hele tatt (`NameError: name 'engine' is not defined`), og
 * feilen sto i stedet gjennom 665 grønne JS-tester til noen åpnet sida.
 *
 * Nå er det én kommando, og den kan derfor stå i CI.
 *
 * EGEN PORT, ikke 8099: en utvikler kan ha serveren gående mens dette kjører, og
 * to servere på samme port ville gitt en forvirrende `EADDRINUSE` i stedet for
 * et svar på det som faktisk ble spurt om.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = process.env.CSC_PORT || '8111';
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const server = spawn(process.execPath, [here('./serve-local.js')], {
  env: { ...process.env, CSC_PORT: PORT },
  stdio: ['ignore', 'pipe', 'inherit'],
});

/** Venter til serveren svarer — ikke en fast `sleep`, som enten sløser eller ryker. */
async function klar(forsok = 50) {
  for (let i = 0; i < forsok; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/concrete_section_calculator/index.html`);
      if (r.ok) return true;
    } catch { /* ikke oppe ennå */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

let kode = 1;
try {
  if (!await klar()) {
    console.error('serveren kom aldri opp på port ' + PORT);
  } else {
    kode = await new Promise((res) => {
      const v = spawn(process.execPath, [here('./wasm-verify.mjs')], {
        env: { ...process.env, CSC_PORT: PORT },
        stdio: 'inherit',
      });
      v.on('exit', (c) => res(c ?? 1));
    });
  }
} finally {
  server.kill();
}
process.exit(kode);
