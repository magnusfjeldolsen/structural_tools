/**
 * python-manifest.js — HVILKE PYTHON-FILER MOTOREN BESTÅR AV. Én liste.
 *
 * Lista sto to steder: i `workers/solver-worker.mjs` (som laster motoren i
 * nettleseren) og i `tests/wasm-verify.mjs` (som kjører den samme lastingen i
 * en ekte Pyodide for å bevise at det virker). To lister som beskriver det
 * samme, og som bare den ene av dem blir rettet når noe endrer seg.
 *
 * Det er ikke en teoretisk fare. `engine.py` er på vei til å bli delt i flere
 * moduler; med to lister ville delingen gått grønt i nettleseren og rødt i
 * verifiseringen — eller motsatt, som er verre, fordi verifiseringen da ville
 * sagt «motoren laster» om en motor brukeren ikke får.
 *
 * REKKEFØLGEN BETYR NOE: `wasm_stubs.py` må skrives før `engine.py`, fordi
 * importen av `structuralcodes` går gjennom stubbene (`triangle` og `scipy`
 * finnes ikke i Pyodide). Lista er derfor en SEKVENS, ikke et sett.
 *
 * `tests/python-manifest.test.mjs` sammenlikner lista med det som FAKTISK
 * ligger i `python/`, så en ny modul som ingen la inn her blir rød med én gang
 * i stedet for å mangle i nettleseren.
 */

/**
 * Filnavnene, i den rekkefølgen de skal skrives til Pyodides filsystem.
 * Navnene er relative til `concrete_section_calculator/python/`, og de skrives
 * med samme navn i `/csc` — motoren importerer hverandre med vanlige
 * `import`-setninger, og da må navnene stemme på begge sider.
 */
export const PYTHON_MODULES = Object.freeze([
  'wasm_stubs.py',
  // `csc_common` før `csc_sls` før `engine`: hver importerer den forrige, og
  // Pyodide leser dem fra filsystemet i den rekkefølgen de skrives.
  'csc_common.py',
  'csc_sls.py',
  'engine.py',
]);

/** Mappa i Pyodides virtuelle filsystem. Egen mappe, ikke site-packages. */
export const ENGINE_DIR = '/csc';

/**
 * Modulen `solver-client` ber Pyodide importere. Skilt fra lista fordi det er
 * ETT navn blant flere filer, og fordi en deling av `engine.py` ikke skal
 * kunne flytte inngangspunktet ved et uhell.
 */
export const ENTRY_MODULE = 'engine';
