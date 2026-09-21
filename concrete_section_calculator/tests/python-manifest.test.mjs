/**
 * python-manifest.test.mjs — lista over motorens Python-filer skal være ÉN, og
 * den skal stemme med disken.
 *
 * Lista sto to steder før: i `workers/solver-worker.mjs` og i
 * `tests/wasm-verify.mjs`. Den som deler motoren i flere moduler kommer til å
 * rette den ene og glemme den andre — og den farligste rekkefølgen er at
 * verifiseringen rettes først, for da går den grønn på en motor nettleseren
 * ikke laster.
 *
 * Testene her lukker begge veier: manifestet må dekke alt som ligger i
 * `python/`, og ingen av de to forbrukerne får ha sin egen liste ved siden av.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ENGINE_DIR, ENTRY_MODULE, PYTHON_MODULES } from '../js/python-manifest.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const pythonDir = fileURLToPath(new URL('../python/', import.meta.url));

/** Kilden uten kommentarlinjer. Kommentarer forklarer; det er koden som binder. */
const codeOnly = (src) => src
  .split('\n')
  .filter((line) => !/^\s*(\*|\/\/|#)/.test(line))
  .join('\n');

const CONSUMERS = ['../workers/solver-worker.mjs', './wasm-verify.mjs'];

test('manifestet dekker HVER .py-fil i python/, og ingen som ikke finnes', () => {
  const onDisk = readdirSync(pythonDir).filter((f) => f.endsWith('.py')).sort();
  assert.deepEqual(
    [...PYTHON_MODULES].sort(),
    onDisk,
    'en modul i python/ som ikke står i manifestet blir aldri lastet i nettleseren; '
      + 'en i manifestet som ikke finnes gir 404 midt i oppstarten'
  );
});

test('stubbene står FØR motoren — rekkefølgen er en sekvens, ikke et sett', () => {
  // Inngangsmodulen importerer `structuralcodes`, som importerer `triangle`.
  // Den finnes ikke i Pyodide, så `wasm_stubs.install_stubs()` må ha kjørt
  // først. Rekkefølgen i lista ER skriverekkefølgen hos begge forbrukerne.
  const stubs = PYTHON_MODULES.indexOf('wasm_stubs.py');
  const entry = PYTHON_MODULES.indexOf(`${ENTRY_MODULE}.py`);
  assert.ok(stubs >= 0, 'wasm_stubs.py mangler i manifestet');
  assert.ok(entry >= 0, `${ENTRY_MODULE}.py mangler i manifestet`);
  assert.ok(stubs < entry, 'wasm_stubs.py må stå før inngangsmodulen');
});

test('verken workeren eller wasm-verify har sin egen liste ved siden av', () => {
  for (const rel of CONSUMERS) {
    const src = read(rel);
    assert.match(src, /python-manifest\.js'/, `${rel} leser ikke manifestet`);

    // Et hardkodet `.py`-navn i KODEN er nettopp den andre lista. Kommentarer
    // får nevne filene ved navn — det er slik man forklarer hva som lastes — så
    // de strippes bort først.
    const names = [...codeOnly(src).matchAll(/([a-z_][a-z0-9_]*\.py)/g)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(names)],
      [],
      `${rel} har filnavn i koden: ${[...new Set(names)].join(', ')} — de hører hjemme i manifestet`
    );
  }
});

test('ENGINE_DIR brukes, den er ikke skrevet som /csc i koden', () => {
  assert.equal(ENGINE_DIR, '/csc');
  for (const rel of CONSUMERS) {
    assert.ok(
      !/['"`]\/csc['"`]/.test(codeOnly(read(rel))),
      `${rel} skriver '/csc' i koden i stedet for å bruke ENGINE_DIR`
    );
  }
});

test('Python-limet binder modulen under NØYAKTIG det navnet det kaller etterpå', () => {
  // DEN MÅLTE FEILEN, gjort i denne runden: `import engine` ble til
  // `import engine as csc_engine` i oppvarmingen, mens linja etter fortsatt
  // hentet `engine.run_json`. Resultatet var `NameError: name 'engine' is not
  // defined` — motoren lastet ikke i det hele tatt.
  //
  // 665 JS-tester og 222 Python-tester var grønne gjennom hele feilen. Den ble
  // funnet ved å åpne sida. Python-limet i disse to filene er strenger, ikke
  // kode, og ingen tolk ser på det før en ekte Pyodide gjør det — så det er
  // denne testen, `tests/wasm-verify.mjs` (krever `npm install pyodide` og en
  // server) eller en nettleser. Denne er den eneste av de tre som kjører alltid.
  for (const rel of CONSUMERS) {
    const src = read(rel);
    const aliased = [...src.matchAll(/^import\s+\$\{ENTRY_MODULE\}\s+as\s+(\w+)/gm)];
    assert.deepEqual(
      aliased.map((m) => m[1]),
      [],
      `${rel} gir inngangsmodulen et alias — da må HVERT senere kall bruke aliaset, `
        + 'og det er nøyaktig den uoverensstemmelsen som ga NameError'
    );
    // Og ingen skal kalle et hardkodet modulnavn heller.
    assert.ok(
      !/runPython\(\s*'[a-z_]+\.run_json'/.test(src),
      `${rel} henter run_json fra et hardkodet modulnavn i stedet for ENTRY_MODULE`
    );
  }
});
