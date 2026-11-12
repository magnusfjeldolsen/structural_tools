/**
 * wasm-verify.mjs - kjoerer motoren under EKTE Pyodide og sammenlikner med fixturene.
 *
 * HVORFOR DENNE FINNES VED SIDEN AV tests/python/test_engine.py
 * Den testen kjoerer engine.py under skrivebords-CPython med ekte scipy og ekte triangle.
 * Den sier ingenting om WebAssembly-veien: at det vendored hjulet godtas av loadPackage
 * over HTTP, at stubbene installeres foer structuralcodes importeres, eller at tallene
 * overlever emscripten. Det er nettopp der en feil ville vaert usynlig til noen aapnet
 * sida.
 *
 * KJOERES IKKE AV npm run test:concrete-section (globben tar bare *.test.mjs), fordi den
 * krever `npm install pyodide` og en statisk server. Slik:
 *
 *   node <et-sted>/serve.js            # serverer worktree-rota paa :8099
 *   cd <et-sted-med-pyodide>
 *   node wasm-verify.mjs
 *
 * Maalt 2026-09-16, pyodide 314.0.7: hele kjeden paa 2,1 s, og M_Rd bit-identisk med
 * skrivebordet - relativt avvik 0.000e+0, ikke bare innenfor toleranse.
 *
 * Det ENESTE denne ikke dekker er DOM-worker-innpakningen i solver-worker.mjs:
 * `new Worker(url, {type:'module'})` og meldingsprotokollen. Til det trengs en nettleser,
 * og tests/browser-smoke.html er harnisket for det.
 */
import { loadPyodide } from 'pyodide';

import { ENGINE_DIR, ENTRY_MODULE, PYTHON_MODULES } from '../js/python-manifest.js';

// Porten kan overstyres, som i `serve-local.js` — ellers kan ikke to kjøringer
// (eller CI og et lokalt vindu) leve side om side.
const BASE = `http://localhost:${process.env.CSC_PORT || 8099}/concrete_section_calculator`;
const t0 = Date.now();
const log = (s) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${s}`);

const text = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
};

log('laster Pyodide 314.0.7 …');
const pyodide = await loadPyodide();

log('loadPackage numpy + shapely …');
await pyodide.loadPackage(['numpy', 'shapely']);

log('loadPackage vendored hjul over HTTP …');
await pyodide.loadPackage(`${BASE}/vendor/structuralcodes-0.7.2-py3-none-any.whl`, {
  checkIntegrity: false,
});

// SAMME LISTE SOM WORKEREN. Sto før som to håndskrevne filnavn her og to til i
// `workers/solver-worker.mjs`; da kunne denne verifiseringen gå grønn på en
// annen motor enn den nettleseren faktisk laster — og det er nøyaktig det
// verifiseringen finnes for å utelukke.
log(`henter ${PYTHON_MODULES.join(', ')} …`);
const sources = await Promise.all(
  PYTHON_MODULES.map((name) => text(`${BASE}/python/${name}`))
);

pyodide.FS.mkdirTree(ENGINE_DIR);
PYTHON_MODULES.forEach((name, i) => {
  pyodide.FS.writeFile(`${ENGINE_DIR}/${name}`, sources[i]);
});

log('installerer stubber og importerer structuralcodes …');
const info = await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, ${JSON.stringify(ENGINE_DIR)})
import wasm_stubs
wasm_stubs.install_stubs()
import ${ENTRY_MODULE}
import scipy, triangle
n_scipy = len([m for m in sys.modules if m == 'scipy' or m.startswith('scipy.')])
f"{${ENTRY_MODULE}.structuralcodes.__version__}|{n_scipy}|{scipy.__version__}|{triangle.__version__}"
`);
const [scVer, nScipy, scipyVer, triVer] = info.split('|');
log(`structuralcodes ${scVer}, scipy-stub ${scipyVer} (${nScipy} undermoduler), triangle-stub ${triVer}`);

const payload = await (await fetch(`${BASE}/tests/fixtures/payload-beam-300x600.json`)).json();
const expect = await (await fetch(`${BASE}/tests/fixtures/result-bending-beam-300x600.json`)).json();

const ticks = [];
const progress = (phase, done, total) => { ticks.push(`${phase}:${done}/${total}`); };

const runJson = pyodide.runPython(`${ENTRY_MODULE}.run_json`);
log('kjoerer boeyekapasitet …');
const out = JSON.parse(runJson(JSON.stringify(payload), progress));

if (!out.ok) { log(`FEIL: ${out.error?.message}`); process.exit(1); }

const got = out.bending.M_Rd;
const want = expect.bending.M_Rd;
const rel = Math.abs(got - want) / Math.abs(want);
log(`M_Rd  = ${got}`);
log(`fasit = ${want}`);
log(`relativt avvik = ${rel.toExponential(3)}`);
log(`x = ${out.bending.x}  x/d = ${out.bending.x_over_d}  ${out.bending.failure_mode}`);
log(`d_eff = ${out.section_props.d_eff}  As_min = ${out.section_props.As_min}  rho = ${out.section_props.rho}`);
log(`meta: runtime=${out.meta.runtime} scipy=${out.meta.scipy} integrator=${out.meta.integrator}`);
log(`progress-tikk: ${ticks.length} (${ticks.slice(0, 3).join(', ')}${ticks.length > 3 ? ', …' : ''})`);

// M-N-diagram: sjekker fortegnsregelen under WebAssembly
const dom = JSON.parse(runJson(JSON.stringify({ ...payload, analysis: 'nm_domain' }), progress));
const m = dom.nm_domain.m;
log(`M-N: ${m.length} punkter, m fra ${(Math.min(...m) / 1e6).toFixed(1)} til ${(Math.max(...m) / 1e6).toFixed(1)} kNm`);
const neg = m.filter((v) => v < 0).length;
log(`negative m-verdier: ${neg} (fortegnsregelen holder om > 0)`);

// FORSPENT HULLDEKKE (sak #84): stegene og M_Rd med initialtoeyning, under WebAssembly.
// Fasiten er CPython-kjoeringen av den samme fila (2026-11-12), som igjen treffer
// haandregningen `docs/prestress-hand-calc.py` til avrunding (`test_prestress.py`).
// Sjekker baade det lineaere snittet, det rissede (polygonklipping i shapely under
// Pyodide) og at pakka integrerer initialtoeyningen likt.
const psPayload = await (await fetch(`${BASE}/tests/fixtures/payload-custom-hd265-prestressed.json`)).json();
const ps = JSON.parse(runJson(JSON.stringify(psPayload), null));
const PS_CPYTHON = {
  M_Rd: -279721953.3032998,
  transfer: [-3.105560635025654, 1065.8435619020174],
  long_term: [-3.466376648853844, 867.7230364329582],
  loaded_150: [-9.864063466113663, 889.5697077677253],
  loaded_200_cracked: [-22.184776622666057, 1106.0471273246303],
};
let psOk = !!ps.ok && !!ps.prestress;
if (!psOk) {
  log(`FORSPENT: FEIL ${ps.error?.code} ${ps.error?.message}`);
} else {
  const st = ps.prestress.stages;
  const pairs = [
    ['M_Rd', ps.bending.M_Rd, PS_CPYTHON.M_Rd],
    ['t0 σ_c,o.k.', st[0].sigma_c_top, PS_CPYTHON.transfer[0]],
    ['t0 σ_p', st[0].tendons[0].sigma_p, PS_CPYTHON.transfer[1]],
    ['t∞ σ_c,o.k.', st[1].sigma_c_top, PS_CPYTHON.long_term[0]],
    ['t∞ σ_p', st[1].tendons[0].sigma_p, PS_CPYTHON.long_term[1]],
    ['−150 σ_c,o.k.', st[2].sigma_c_top, PS_CPYTHON.loaded_150[0]],
    ['−150 σ_p', st[2].tendons[0].sigma_p, PS_CPYTHON.loaded_150[1]],
    ['−200 risset σ_c,o.k.', st[3].sigma_c_top, PS_CPYTHON.loaded_200_cracked[0]],
    ['−200 risset σ_p', st[3].tendons[0].sigma_p, PS_CPYTHON.loaded_200_cracked[1]],
  ];
  for (const [name, got2, want2] of pairs) {
    const r = Math.abs(got2 - want2) / Math.abs(want2);
    log(`FORSPENT ${name}: ${got2}  (CPython ${want2}, avvik ${r.toExponential(3)})`);
    if (!(r < 1e-9)) psOk = false;
  }
  if (st[3].uncracked !== false) psOk = false;
}

const ok = rel < 1e-9 && neg > 0 && psOk;
log(ok ? 'VERIFISERT' : 'AVVIK');
process.exit(ok ? 0 : 1);
