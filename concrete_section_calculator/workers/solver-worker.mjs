/**
 * solver-worker.mjs — Pyodide-verten for `python/engine.py`.
 *
 * HVORFOR DETTE ER EN MODULWORKER, OG HVORFOR MØNSTERET FRA `cable_designer/worker.js`
 * OG `2dfea` IKKE KAN KOPIERES
 * Pyodide 314 drepte klassiske workers: `pyodide.asm.js` ble `pyodide.asm.mjs`, og hele
 * runtimen er nå en ES-modul. `importScripts()` finnes ikke i en modulworker, og
 * `pyodide.js` finnes ikke lenger i distribusjonen. Denne fila MÅ derfor opprettes med
 * `new Worker(url, { type: 'module' })`. De andre modulene i repoet kjører eldre Pyodide
 * og er ikke en mal for denne.
 *
 * HVORFOR ALLE STIER LØSES RELATIVT
 * `new URL('../python/engine.py', import.meta.url)` virker både på localhost og under
 * `/structural_tools/` på GitHub Pages. En absolutt sti som `/python/engine.py` ville
 * virket perfekt lokalt og gitt 404 i produksjon — den feilen står eksplisitt i
 * DEPLOYMENT.md fordi den har skjedd før.
 *
 * HVORFOR JSON-STRENGER I STEDET FOR PYODIDES PROXY-KONVERTERING
 * `engine.run()` er bundet til `json.dumps(..., allow_nan=False)`, og det er den sikringen
 * som garanterer at `JSON.parse` på denne siden aldri kaster. Sender vi i stedet en
 * PyProxy gjennom `toJs()`, går `NaN` og `Infinity` rett videre og sikringen er borte.
 * Derfor går både payload og resultat over grensa som tekst.
 *
 * HVORFOR WORKEREN ALDRI KASTER
 * Hver innkommende melding får nøyaktig ett svar, og en feil er en `error`-melding med
 * `msgId` ekkoet tilbake. En worker som dør stille låser «Beregn»-knappen for godt, og
 * brukeren har ingen måte å oppdage at det skjedde.
 */

import { ENGINE_DIR, ENTRY_MODULE, PYTHON_MODULES } from '../js/python-manifest.js';

const PYODIDE_VERSION = '314.0.7';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// Hjulet er vendored. Oppgradering av structuralcodes er å bytte denne ene fila og
// bumpe navnet her — ingen byggesteg, ingen kjøretidsavhengighet til PyPI.
// Filnavnet MÅ være et gyldig wheel-navn, ellers svarer Pyodide `InvalidWheelFilename`.
const SC_WHEEL_URL = new URL(
  '../vendor/structuralcodes-0.7.2-py3-none-any.whl',
  import.meta.url,
).href;
// HVILKE Python-filer motoren består av, står i `js/python-manifest.js` og INGEN
// ANDRE STEDER. `tests/wasm-verify.mjs` gjør nøyaktig den samme lastingen for å
// bevise at den virker i en ekte Pyodide, og hadde sin egen kopi av lista — to
// beskrivelser av den samme motoren, hvorav bare den ene blir rettet når noe
// endrer seg. Verifiseringen ville da sagt «motoren laster» om en motor
// brukeren ikke får.
//
// Rekkefølgen i lista er en SEKVENS: stubbene må ligge der før `engine.py`
// importerer `structuralcodes`.
const PYTHON_URLS = PYTHON_MODULES.map((name) => ({
  name,
  url: new URL(`../python/${name}`, import.meta.url).href,
}));

/* ------------------------------------------------------------------ *
 * Meldinger ut
 * ------------------------------------------------------------------ */

let downloadedBytes = 0;

function send(type, msgId, payload) {
  self.postMessage({ type, msgId, payload });
}

/**
 * `pct` er et HELTALL 0–100, ikke 0–1. Protokollen er frosset på det, og en klient som
 * ganger med 100 én gang for mye gir en framdriftslinje som står på 100 % fra første
 * sekund — synlig feil, men bare hvis noen ser etter.
 */
function progress(msgId, phase, pct, { done = null, total = null, message = '' } = {}) {
  send('progress', msgId, {
    phase,
    pct: Math.max(0, Math.min(100, Math.round(pct))),
    done,
    total,
    message,
    bytes: downloadedBytes || null,
  });
}

function fail(msgId, code, error) {
  send('error', msgId, {
    code,
    message: NORWEGIAN_ERRORS[code] || NORWEGIAN_ERRORS.unknown,
    detail: error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error),
  });
}

// Feilene som kan oppstå FØR motoren finnes, og som derfor ikke kan få norsk tekst fra
// `results.js` sin kodetabell. Resten mapper klienten.
const NORWEGIAN_ERRORS = {
  runtime_load_failed:
    'Kunne ikke laste Python-kjernen. Er du frakoblet, eller blokkerer nettverket ' +
    'cdn.jsdelivr.net? Prøv igjen.',
  packages_load_failed:
    'Kunne ikke laste beregningsbibliotekene. Prøv igjen.',
  engine_load_failed:
    'Kunne ikke starte beregningsmotoren. Prøv igjen.',
  not_initialised:
    'Beregningsmotoren er ikke klar ennå.',
  cancelled: 'Beregningen ble avbrutt.',
  bad_message: 'Ukjent melding til beregningsmotoren.',
  unknown: 'Noe gikk galt i beregningsmotoren.',
};

/* ------------------------------------------------------------------ *
 * Nedlasting med byte-telling
 * ------------------------------------------------------------------ */

/**
 * 10 MB uanmeldt er uhøflig (§3.9 krav 1), så det vi selv henter teller vi.
 * Pyodides egne henter kan vi ikke måle, og da er `bytes` null framfor et tall vi gjetter.
 */
async function fetchCounted(url, as) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const buffer = await response.arrayBuffer();
  downloadedBytes += buffer.byteLength;
  if (as === 'text') return new TextDecoder('utf-8').decode(buffer);
  return buffer;
}

/* ------------------------------------------------------------------ *
 * Initialisering
 * ------------------------------------------------------------------ */

let pyodide = null;
let runJson = null; // PyProxy til engine.run_json
let scVersion = null;
let initPromise = null;

/**
 * Rekkefølgen her er ikke valgfri:
 *   1. runtime          — Pyodide er en ES-modul, lastes med dynamisk import
 *   2. numpy + shapely  — fra Pyodides egen lockfile
 *   3. det vendored hjulet — samme opphav, derfor `checkIntegrity: false`
 *   4. install_stubs()  — MÅ skje før `import structuralcodes`, ellers feiler importen
 *                         på `import triangle` og drar inn 13,9 MB scipy
 *   5. import engine    — varmes opp her, slik at første «Beregn» er ren regnetid
 */
async function initialise(msgId) {
  progress(msgId, 'runtime', 2, { message: 'Laster Python-kjernen …' });
  let loadPyodide;
  try {
    ({ loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`));
    pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  } catch (error) {
    throw Object.assign(new Error('pyodide'), { code: 'runtime_load_failed', cause: error });
  }

  progress(msgId, 'packages', 45, { message: 'Laster numpy og shapely …' });
  try {
    await pyodide.loadPackage(['numpy', 'shapely'], {
      // Pyodides egne statuslinjer er engelske og tekniske; de hører hjemme i konsollen,
      // ikke i statuspilla. Vi holder vår egen norske tekst.
      messageCallback: () => {},
    });
    progress(msgId, 'packages', 68, { message: 'Laster structuralcodes …' });
    // `checkIntegrity: false` fordi hjulet er vårt eget, servert fra samme opphav, og
    // ikke står i noen lockfile med sha256.
    await pyodide.loadPackage(SC_WHEEL_URL, {
      checkIntegrity: false,
      messageCallback: () => {},
    });
  } catch (error) {
    throw Object.assign(new Error('packages'), { code: 'packages_load_failed', cause: error });
  }

  progress(msgId, 'engine', 82, { message: 'Starter beregningsmotoren …' });
  try {
    // Hentes PARALLELT, skrives i LISTAS REKKEFØLGE. Hentingen er nettverk og
    // har ingen rekkefølge å bryte; skrivingen har det (se manifestet).
    const sources = await Promise.all(
      PYTHON_URLS.map(({ url }) => fetchCounted(url, 'text'))
    );
    pyodide.FS.mkdirTree(ENGINE_DIR);
    PYTHON_URLS.forEach(({ name }, i) => {
      pyodide.FS.writeFile(`${ENGINE_DIR}/${name}`, sources[i]);
    });

    // Ingen bakoverfnutter i denne Python-kilden: den ligger i et template literal, og
    // en bakoverfnutt i en kommentar ville avsluttet strengen midt i koden.
    scVersion = await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, ${JSON.stringify(ENGINE_DIR)})

# Stubbene FOERST. Uten dem feiler import structuralcodes paa import triangle, og med
# ekte scipy koster den 13,9 MB og 2,2 s CPU for tre funksjoner vi ikke bruker.
import wasm_stubs
wasm_stubs.install_stubs()

import ${ENTRY_MODULE}
${ENTRY_MODULE}.structuralcodes.__version__
`);
    // Hentes som ett uttrykk framfor `globals.get('engine').run_json`: da finnes det bare
    // én proxy å holde styr på, og den lever like lenge som worker-en.
    runJson = pyodide.runPython(`${ENTRY_MODULE}.run_json`);
  } catch (error) {
    throw Object.assign(new Error('engine'), { code: 'engine_load_failed', cause: error });
  }

  progress(msgId, 'engine', 100, { message: 'Klar' });
  return { runtime: `pyodide ${PYODIDE_VERSION}`, structuralcodes_version: scVersion };
}

/* ------------------------------------------------------------------ *
 * Kjøring
 * ------------------------------------------------------------------ */

/**
 * `progress` går inn i Python som en vanlig callable. Pyodide pakker JS-funksjonen som en
 * kallbar proxy, og `engine.py` ser bare `progress(phase, done, total)` — den vet ikke at
 * den kjører i en nettleser, og det er nettopp det som gjør at skrivebordstesten kjører
 * den samme koden (§2.3 krav 1).
 */
function makeProgressCallback(msgId) {
  return (phase, done, total) => {
    const d = typeof done === 'number' ? done : null;
    const t = typeof total === 'number' && total > 0 ? total : null;
    // Forberedelse er 0–20 %, selve løsningen 20–100 %. Bøyekapasitet og M–N-diagram
    // hopper rett gjennom; bare moment–krumning har nok punkter til at tellingen betyr noe.
    const share = d !== null && t ? d / t : 0;
    const pct = phase === 'section' ? 5 + 15 * share : 20 + 80 * share;
    progress(msgId, phase, pct, { done: d, total: t });
  };
}

async function runAnalysis(msgId, payload) {
  if (!runJson) throw Object.assign(new Error('init'), { code: 'not_initialised' });

  const callback = makeProgressCallback(msgId);
  // `run_json` gir en ren streng, ikke en PyProxy, så det er ingenting å frigjøre her.
  // Det er hele grunnen til at grensa går på tekst: ingen proxy-livssyklus å holde styr
  // på i en løkke som kjøres 20 ganger for én moment–krumningskurve.
  const text = runJson(JSON.stringify(payload), callback);
  // `engine.run()` gir også feil som gyldig §5.2-resultat (`ok: false`). Det er
  // meningen: en modellfeil er et svar klienten skal vise, ikke en worker-krasj.
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ *
 * Meldingskø
 * ------------------------------------------------------------------ *
 * Pyodide er enkelttrådet inne i worker-en: to samtidige `run` ville kjørt Python om
 * hverandre. Køen serialiserer dem, og er samtidig det som gjør «Avbryt» mulig — et
 * avbrutt løp som ennå ikke er startet kan kastes ut av køa. Et løp som ALLEREDE regner
 * kan ikke stoppes; der er `worker.terminate()` + ny worker nødutgangen (§3.7).
 */

const queue = [];
const cancelled = new Set();
let draining = false;

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue.shift();
    if (cancelled.has(job.msgId)) {
      cancelled.delete(job.msgId);
      fail(job.msgId, 'cancelled', 'cancelled before start');
      continue;
    }
    try {
      await job.work();
    } catch (error) {
      fail(job.msgId, error?.code || 'unknown', error?.cause || error);
    }
  }
  draining = false;
}

function enqueue(msgId, work) {
  queue.push({ msgId, work });
  drain();
}

self.onmessage = (event) => {
  const { type, msgId, payload } = event.data || {};

  if (type === 'cancel') {
    // `payload.target` er løpet som skal avbrytes; uten den avbrytes ingenting, men vi
    // svarer likevel — en klient som venter på svar på ALT skal aldri henge.
    const target = payload?.target;
    if (target !== undefined && target !== null) cancelled.add(target);
    send('error', msgId, {
      code: 'cancelled',
      message: NORWEGIAN_ERRORS.cancelled,
      detail: `cancel requested for ${target ?? '(none)'}`,
    });
    return;
  }

  if (type === 'init') {
    enqueue(msgId, async () => {
      // Memoisert: `init` kan komme både fra oppvarmingen ved sidelast og fra en
      // «Prøv igjen»-knapp, og en feilet oppvarming skal kunne forsøkes på nytt.
      if (!initPromise) initPromise = initialise(msgId);
      try {
        const ready = await initPromise;
        send('ready', msgId, ready);
      } catch (error) {
        initPromise = null;
        throw error;
      }
    });
    return;
  }

  if (type === 'run') {
    enqueue(msgId, async () => {
      if (!initPromise) initPromise = initialise(msgId);
      try {
        await initPromise;
      } catch (error) {
        initPromise = null;
        throw error;
      }
      send('result', msgId, await runAnalysis(msgId, payload));
    });
    return;
  }

  send('error', msgId ?? null, {
    code: 'bad_message',
    message: NORWEGIAN_ERRORS.bad_message,
    detail: `unknown message type: ${String(type)}`,
  });
};
