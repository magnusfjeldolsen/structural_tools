/**
 * solver-client.js — håndtaket mot `workers/solver-worker.mjs`.
 *
 * HVORFOR DENNE FILA FINNES
 * Protokollen i plan §3.3 er frosset, og den har tre detaljer som gir STILLE
 * svikt hvis de gjøres feil. De ligger derfor samlet her, ett sted, i stedet
 * for å være spredt i `ui.js`:
 *
 * 1. **`cancel` MÅ bære `payload.target`.** Uten den vet ikke workeren hvilket
 *    løp som skal kastes ut av køa, og «Avbryt» blir en knapp som svarer «ok»
 *    uten å avbryte noe.
 * 2. **`{ok: false}` fra motoren kommer som `type: 'result'`, ikke `error`.**
 *    `axial_out_of_range` er et SVAR brukeren skal lese, ikke en krasj.
 *    Behandlet som en feil ville den forsvunnet i en rød boks uten tallene.
 *    `error` er reservert for worker-/kjøretidssvikt.
 * 3. **`pct` er et heltall 0–100.** Ikke 0–1. En klient som ganger med 100 én
 *    gang for mye får en framdriftslinje som står på 100 % fra første sekund.
 *
 * MOMENT–KRUMNING DRIVES HERFRA, ETT PUNKT OM GANGEN
 * Se `runMomentCurvature()`. Det er den eneste analysen som tar mer enn et
 * blunk, og den eneste som derfor får ekte framdrift og ekte avbrudd.
 *
 * «RUN ALL» DRIVES OGSÅ HERFRA, UTEN EN ENESTE MOTORENDRING
 * Se `runAll()`. Motoren kjenner bare sine tre analysenavn; `analysis: 'all'`
 * ville gitt `unknown_analysis` fra `engine.py` sin egen sjekk. Klienten kjører
 * derfor de LOVLIGE analysene etter hverandre og fletter blokkene til ett
 * §5.2-formet resultat med `analysis: 'all'` og en `primary`-peker. At
 * flettingen bor her og ikke i `main.js`, er samme begrunnelse som for resten
 * av fila: det er protokollarbeid, og protokollarbeid skal ha ett sted.
 *
 * DOM-fri: fila rører verken `document` eller `localStorage`. Den bruker
 * `Worker`, `URL` og (for oppvarmingsvalget) `navigator` — alt sammen
 * kjøretidsting, ikke DOM.
 */

/* ================================================================== *
 * Protokollkonstanter
 * ================================================================== */

/**
 * Fasene i `progress.phase` (plan §3.3), som tekst til statuspilla.
 *
 * BRUKERVENDT, ALTSAA ENGELSK. Disse sto på norsk og gikk rett ut i statuspilla
 * øverst og i bunnlinja — «Laster Python-kjernen» i et grensesnitt som ellers er
 * engelsk. Språktestene fantes, men dekket `charts.js`, `report.js` og
 * `results.js`, ikke denne fila; derfor sto det i fem runder uten å falle.
 * Testen er nå utvidet til å lese herfra også.
 */
export const PHASE_LABELS = Object.freeze({
  runtime: 'Loading the Python runtime',
  packages: 'Loading numpy, shapely and structuralcodes',
  engine: 'Starting the calculation engine',
  section: 'Building the cross-section',
  solve: 'Solving',
});

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || 'Working';
}

/**
 * Samlet nedlasting over nettet, målt i plan §3.2: Pyodide-kjerne 6,21 MB +
 * numpy 2,93 + shapely 0,85 + det vendored hjulet 0,21.
 */
export const TOTAL_DOWNLOAD_BYTES = 10.2e6;

/**
 * pct -> anslått nedlastet mengde.
 *
 * HVORFOR ET ANSLAG OG IKKE MÅLT
 * Workeren teller bare de hentene den gjør SELV (`fetchCounted`), og det er
 * bare `engine.py` og `wasm_stubs.py` — noen få kB. Pyodides egne henter går
 * gjennom Pyodides eget lastesystem og kan ikke måles utenfra, og workeren
 * sender derfor `bytes: null` framfor et tall den gjetter (§3.3).
 *
 * Men §3.9 krav 1 er tydelig: «10 MB uanmeldt er uhøflig». Alternativet til et
 * anslag er å ikke vise noe, og det er en dårligere handel. Anslaget bygger på
 * de MÅLTE størrelsene i §3.2 og workerens egne faseterskler (2/45/68/82/100),
 * og vises alltid med «≈» slik at det ikke forveksles med en måling.
 *
 * @param {number} pct heltall 0–100 fra protokollen
 * @returns {number} byte
 */
export function estimatedBytes(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  // Kjernen lastes i «runtime» (0–45 %), pakkene i «packages» (45–82 %),
  // motoren i «engine» (82–100 %) — se `initialise()` i solver-worker.mjs.
  const RUNTIME_END = 45;
  const PACKAGES_END = 82;
  const runtimeBytes = 6.21e6;
  const packageBytes = 3.78e6 + 0.21e6;
  if (p <= RUNTIME_END) return (p / RUNTIME_END) * runtimeBytes;
  if (p <= PACKAGES_END) {
    return runtimeBytes + ((p - RUNTIME_END) / (PACKAGES_END - RUNTIME_END)) * packageBytes;
  }
  return TOTAL_DOWNLOAD_BYTES;
}

/**
 * Krumningen probe-kallet bruker for å få tak i `chi_plan` (se
 * `runMomentCurvature`). Verdien er motorens egen `chi_first`, som er en
 * KONSTANT i `engine.py` — ikke noe som regnes ut av tverrsnittet. Punktet
 * kastes uansett, så tallet betyr ingenting utover å være billig.
 */
const PROBE_CHI = 1e-8;

/**
 * Analysene der «Avbryt» skal være DEAKTIVERT (plan §3.7).
 *
 * Bøyekapasitet er målt til 54 ms og M–N-diagrammet til 60–140 ms. Et avbrudd
 * der koster i praksis `worker.terminate()` og en ny 10 MB oppstart for å angre
 * en 50 ms jobb — et elendig bytte, og en knapp som lover noe den ikke kan
 * levere billig.
 *
 * `'all'` ER avbrytbar: den inneholder moment–krumning, og er derfor den
 * LENGSTE kjøringen i modulen. Uten denne oppføringen ville «Avbryt» stått grå
 * gjennom hele den kjøringen brukeren mest sannsynlig vil stoppe.
 */
/**
 * Samme streng som `store.js` sin `RUN_ALL` og `results.js` sin
 * `RUN_ALL_ANALYSIS`. Denne fila importerer med vilje ingenting — den skal
 * kunne kjøres uten resten av modulen — så duplikatet er tillatt NETTOPP fordi
 * testen i `tests/results.test.mjs` låser alle tre mot hverandre. Uten den
 * kunne `merged.analysis` blitt ulik `RUN_ALL_ANALYSIS`, og da ville
 * `analysisBlock()` returnert `null`: hele resultatpanelet og hele rapporten
 * til bindestrek, uten at en eneste test falt.
 */
export const RUN_ALL_ANALYSIS = 'all';

export const CANCELLABLE_ANALYSES = Object.freeze(['moment_curvature', RUN_ALL_ANALYSIS]);

export function isCancellable(analysis) {
  return CANCELLABLE_ANALYSES.includes(analysis);
}

/**
 * Advarselskoden «Run all» bruker når én av analysene falt ut.
 *
 * En delvis «Run all» er mye bedre enn ingen, men den skal ALDRI se komplett
 * ut: koden ligger i `result.warnings`, og `detail` navngir hvilken analyse som
 * mangler og hvorfor. `results.js` har kodetabellen og må ha en tekst for
 * denne koden — uten den faller `messageForCode` tilbake på plassholderen
 * «Unspecified message …», som er synlig, men stygg.
 */
export const RUN_ALL_PARTIAL_CODE = 'run_all_partial';

/**
 * Hvilke analyser «Run all» kjører, og hvilken av dem som er KAPASITETS-
 * analysen (`primary`).
 *
 * REGELEN FRA RUNDE 4 GJELDER UENDRET og leses her ut av payloaden, ikke ut av
 * tilstanden: har en kombinasjon aksialkraft, er `bending` ett punkt plukket
 * fra en flate og skal ikke kjøres i det hele tatt. Å la «Run all» være
 * bakdøra inn til nettopp den analysen regelen stenger, ville vært å omgå
 * regelen — derfor er `'bending'` da ikke med i lista, ikke bare skjult.
 * Testen `axialForcesPresent` i `section.js` bruker samme kriterium
 * (`Number.isFinite(n) && n !== 0`); et tomt felt er ikke aksialkraft.
 *
 * REKKEFØLGEN ER VALGT, IKKE TILFELDIG: kapasitetsanalysen først, fordi det er
 * den `checks`, `warnings`, `meta`, `materials` og `section_props` hentes fra.
 * Moment–krumning SIST, fordi den er den eneste som tar sekunder og den eneste
 * «Avbryt» virker på — kjørt sist koster et avbrudd bare kurven, mens
 * kapasiteten og kontrollene allerede er levert.
 *
 * @param {object} payload §5.1-payload
 * @returns {{primary: 'bending'|'nm_domain', analyses: string[]}}
 */
export function runAllPlan(payload) {
  const combos = payload?.loads?.combinations || [];
  const axial = combos.some((c) => {
    const n = Number(c?.N_Ed);
    return Number.isFinite(n) && n !== 0;
  });
  return axial
    ? { primary: 'nm_domain', analyses: ['nm_domain', 'moment_curvature'] }
    : { primary: 'bending', analyses: ['bending', 'nm_domain', 'moment_curvature'] };
}

/**
 * Skal oppvarmingen utsettes? (plan §3.9 krav 2)
 *
 * `saveData` er brukerens uttrykkelige beskjed om at 10 MB ikke skal hentes
 * uoppfordret. Da venter vi til første «Beregn» — som er et samtykke.
 */
export function shouldDeferWarmup(nav) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  return Boolean(n && n.connection && n.connection.saveData);
}

/* ================================================================== *
 * Feil
 * ================================================================== */

/**
 * Nøkkelen to advarsler må dele for å regnes som DEN SAMME advarselen.
 *
 * HVORFOR IKKE BARE `code`: etter endringsrunde 4 regner alle tre analysene
 * skjær for ALLE kombinasjoner, og da er `stirrup_spacing_exceeds_max` for
 * rad K1 og for rad K2 to forskjellige beskjeder med samme kode. En dedupe på
 * kode alene ville stilnet den andre — i et verktøy som dimensjonerer betong
 * er en tapt advarsel verre enn en gjentatt.
 */
function warningKey(w) {
  return `${w?.code ?? ''}|${w?.combo ?? ''}`;
}

/**
 * En feil fra worker/kjøretid. Bærer `code` slik at `results.js` kan slå opp
 * norsk tekst, og `detail` for den som vil grave. Rå engelsk pakketekst skal
 * ALDRI bli hovedmelding (plan §3.5).
 */
export class SolverError extends Error {
  constructor({ code, message, detail } = {}) {
    super(message || code || 'worker_error');
    this.name = 'SolverError';
    this.code = code || 'worker_error';
    this.detail = detail || '';
  }
}

/* ================================================================== *
 * Klienten
 * ================================================================== */

/**
 * Lager et håndtak mot workeren.
 *
 * @param {object} [options]
 * @param {string|URL} [options.workerUrl] løses relativt til denne fila
 * @param {(status: object) => void} [options.onStatus] kalles ved hver
 *        tilstandsendring, inkludert framdrift
 */
export function createSolverClient(options = {}) {
  const workerUrl = options.workerUrl
    ? String(options.workerUrl)
    : new URL('../workers/solver-worker.mjs', import.meta.url).href;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  /** @type {Worker|null} */
  let worker = null;
  let seq = 0;
  /** msgId -> {resolve, reject, onProgress, kind} */
  const pending = new Map();
  /** msgId-er vi har sendt `cancel` med; svaret deres skal ikke bli en feil. */
  const cancelIds = new Set();
  /** Memoisert init. Nullstilles ved feil, slik at «Prøv igjen» virker (§3.9 krav 3). */
  let initPromise = null;
  /**
   * Antall drivere som står over oss i stakken. `runMomentCurvature` sender
   * HVERT punkt som et eget `run`, og uten denne telleren ville statusen
   * blinket «klar» 20 ganger midt i en beregning som pågår.
   *
   * HVORFOR EN TELLER OG IKKE ET FLAGG: «Run all» driver `runMomentCurvature`
   * inne i sin egen løkke. Med et flagg ville M–κ sin `finally` skrudd det av
   * — og meldt «klar» — mens «Run all» fortsatt hadde analyser igjen.
   */
  let driving = 0;

  function beginDrive() {
    driving += 1;
  }

  /** Melder «klar» bare når den YTTERSTE driveren er ferdig. */
  function endDrive() {
    driving = Math.max(0, driving - 1);
    if (driving === 0) emit({ state: 'ready', phase: null, pct: 100, message: '' });
  }

  const status = {
    /** 'idle' | 'loading' | 'ready' | 'solving' | 'failed' */
    state: 'idle',
    phase: null,
    pct: 0,
    done: null,
    total: null,
    /** anslått nedlastet mengde [byte] under oppvarming */
    bytes: 0,
    message: '',
    /** siste feil, som `{code, message, detail}` — `null` når alt er bra */
    error: null,
    /** `{runtime, structuralcodes_version}` når motoren er klar */
    ready: null,
    /**
     * Hvilken analyse som kjører NÅ under «Run all» — `null` ellers.
     *
     * `message` kunne ikke brukes: `start()` nullstiller den ved hvert eneste
     * `run`, og «Run all» sender ett `run` per κ-punkt gjennom
     * `runMomentCurvature`. Feltet her røres bare av `runAll` og overlever
     * derfor hele fasen.
     */
    analysis: null,
  };

  function emit(patch) {
    Object.assign(status, patch);
    onStatus({ ...status });
  }

  function nextId() {
    seq += 1;
    return `m${seq}`;
  }

  function ensureWorker() {
    if (worker) return worker;
    // `{ type: 'module' }` er IKKE valgfritt: Pyodide 314 er en ES-modul, og
    // en klassisk worker finner verken `pyodide.mjs` eller `importScripts`.
    worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = onMessage;
    worker.onerror = (event) => failAll('worker_error', event?.message || 'worker error');
    worker.onmessageerror = () => failAll('worker_error', 'kunne ikke tolke melding fra worker');
    return worker;
  }

  function failAll(code, detail) {
    const err = new SolverError({ code, detail });
    for (const [, job] of pending) job.reject(err);
    pending.clear();
    initPromise = null;
    emit({ state: 'failed', error: { code, message: '', detail: String(detail || '') } });
  }

  function onMessage(event) {
    const { type, msgId, payload } = event.data || {};

    if (cancelIds.has(msgId)) {
      // Kvitteringen på selve `cancel`-meldingen. Den er ikke en feil hos oss.
      cancelIds.delete(msgId);
      return;
    }

    const job = pending.get(msgId);

    if (type === 'progress') {
      const pct = Math.max(0, Math.min(100, Math.round(Number(payload?.pct) || 0)));
      const phase = payload?.phase || null;
      const loading = phase === 'runtime' || phase === 'packages' || phase === 'engine';
      emit({
        state: status.state === 'failed' ? 'loading' : status.state,
        phase,
        pct,
        done: payload?.done ?? null,
        total: payload?.total ?? null,
        // Under oppvarming anslås mengden (se `estimatedBytes`); under en
        // beregning lastes ingenting ned, og tallet skal stå stille.
        bytes: loading ? estimatedBytes(pct) : status.bytes,
        message: payload?.message || '',
      });
      if (job && typeof job.onProgress === 'function') job.onProgress({ ...payload, pct });
      return;
    }

    if (!job) return;
    pending.delete(msgId);

    if (type === 'ready') {
      emit({ state: 'ready', phase: null, pct: 100, bytes: TOTAL_DOWNLOAD_BYTES,
             error: null, ready: payload || null, message: '' });
      job.resolve(payload);
      return;
    }

    if (type === 'result') {
      // §3.3: `ok: false` er et GYLDIG svar og løses opp, ikke avvises.
      if (driving === 0) emit({ state: 'ready', phase: null, pct: 100, message: '' });
      job.resolve(payload);
      return;
    }

    if (type === 'error') {
      const code = payload?.code || 'worker_error';
      // Et avbrudd er ikke en havarert motor: motoren er fortsatt klar.
      emit({
        state: code === 'cancelled' ? 'ready' : 'failed',
        error: code === 'cancelled' ? null : { code, message: payload?.message || '', detail: payload?.detail || '' },
      });
      job.reject(new SolverError({ code, message: payload?.message, detail: payload?.detail }));
      return;
    }

    job.reject(new SolverError({ code: 'worker_error', detail: `ukjent meldingstype: ${type}` }));
  }

  function send(type, payload, { onProgress } = {}) {
    const msgId = nextId();
    const promise = new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject, onProgress });
      try {
        ensureWorker().postMessage({ type, msgId, payload });
      } catch (err) {
        pending.delete(msgId);
        reject(new SolverError({ code: 'worker_error', detail: String(err) }));
      }
    });
    return { msgId, promise };
  }

  /* ---------------------------------------------------------------- *
   * Offentlig flate
   * ---------------------------------------------------------------- */

  const client = {
    getStatus() {
      return { ...status };
    },

    /**
     * Starter motoren. Memoisert, men memoet NULLSTILLES ved feil — det er det
     * som gjør «Prøv igjen» mulig uten å laste sida på nytt (§3.9 krav 3).
     * Workeren memoiserer på sin side også, så et nytt `init` etter et vellykket
     * oppstart koster ingenting.
     */
    init(onProgress) {
      if (initPromise) return initPromise;
      emit({ state: 'loading', phase: 'runtime', pct: 0, bytes: 0, error: null, message: '' });
      const { promise } = send('init', undefined, { onProgress });
      initPromise = promise.catch((err) => {
        initPromise = null;
        throw err;
      });
      return initPromise;
    },

    /** `ready(): Promise<void>` i arbeidsflyt-API-et (plan §9). */
    async ready() {
      await client.init();
    },

    isReady() {
      return status.state === 'ready';
    },

    /**
     * Ett motorkall. Venter selv på initialisering, slik at `calculate()` i
     * §9 aldri må avvise fordi motoren ikke var kommet opp ennå.
     *
     * @returns {{msgId: string, promise: Promise<object>}} `promise` løses med
     *          et §5.2-resultat — også når `ok` er `false`.
     */
    start(payload, { onProgress } = {}) {
      emit({ state: 'solving', phase: 'section', pct: 0, error: null, message: '' });
      return send('run', payload, { onProgress });
    },

    /**
     * @param {object} payload
     * @param {{onProgress?:Function, onStart?:(msgId:string)=>void}} [opts]
     *        `onStart` gir kalleren `msgId` — som er nøyaktig det `cancel`
     *        trenger som `payload.target` (§3.3).
     */
    async run(payload, opts = {}) {
      const job = client.start(payload, opts);
      if (typeof opts.onStart === 'function') opts.onStart(job.msgId);
      return job.promise;
    },

    /**
     * Avbryter et løp. `payload.target` er PÅKREVD av protokollen — se
     * hodekommentaren punkt 1.
     */
    cancel(target) {
      if (!worker) return;
      const msgId = nextId();
      cancelIds.add(msgId);
      worker.postMessage({ type: 'cancel', msgId, payload: { target } });
    },

    /**
     * Nødutgangen (plan §3.7): river ned workeren. Koster en full 10 MB
     * omstart, og brukes bare hvis Python har hengt seg — et løp som ALLEREDE
     * regner kan ikke stoppes på annen måte.
     */
    terminate() {
      if (worker) worker.terminate();
      worker = null;
      initPromise = null;
      for (const [, job] of pending) job.reject(new SolverError({ code: 'cancelled' }));
      pending.clear();
      cancelIds.clear();
      emit({ state: 'idle', phase: null, pct: 0, bytes: 0, error: null, ready: null });
    },

    /**
     * Moment–krumning, drevet herfra ett punkt om gangen (plan §3.7).
     *
     * HVORFOR IKKE BARE ETT KALL
     * Ett samlet kall tar 0,5–1,2 s uten at klienten vet hvor langt det er
     * kommet, og kan bare avbrytes ved å rive ned runtimen. Med ett punkt per
     * kall blir framdriften DETERMINAT (punkt 7 av 20) og «Avbryt» er å la
     * være å sende neste bit.
     *
     * ENHETENE ER STØRRELSER HELE VEIEN
     * `chi_plan` kommer som størrelser, og `mc_chi` TAS som størrelse: motoren
     * gjør `abs()` og setter fortegnet selv ut fra θ. JS skal derfor sende
     * planverdiene uendret. (Tidligere ganget denne fila med
     * `meta.moment_sign`, fordi motoren den gangen tolket `mc_chi` fortegnsatt
     * og et positivt tall ga et tøvete moment. Det er rettet i `engine.py`, og
     * kompensasjonen er fjernet — en kompensasjon for en feil som ikke finnes,
     * er selv en feil som venter.)
     *
     * @param {object} payload §5.1-payload med `analysis: 'moment_curvature'`
     * @param {object} [opts]
     * @param {(p: {done:number,total:number,pct:number}) => void} [opts.onProgress]
     * @param {() => boolean} [opts.isCancelled] spørres FØR hvert punkt
     * @param {(msgId:string) => void} [opts.onStart] `msgId` for hvert punkt,
     *        slik at `cancel` kan sendes med riktig `payload.target`
     * @returns {Promise<object>} §5.2-resultat
     */
    async runMomentCurvature(payload, opts = {}) {
      const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;
      const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
      const pre = Number(payload?.options?.mc_pre_yield) || 10;
      const post = Number(payload?.options?.mc_post_yield) || 10;
      const expected = pre + post;

      const withChi = (chi) => ({ ...payload, options: { ...payload.options, mc_chi: chi } });
      const onStart = typeof opts.onStart === 'function' ? opts.onStart : () => {};
      const step = (p) => client.run(p, { onStart });

      beginDrive();
      try {
        return await drive();
      } finally {
        endDrive();
      }

      async function drive() {
        // Probe: ett trivielt punkt, bare for å få `chi_plan`. Punktets egen
        // verdi KASTES — den hører ikke til rutenettet.
        report({ done: 0, total: expected, pct: 0 });
        emit({ state: 'solving', phase: 'solve', pct: 0, done: 0, total: expected });
        const probe = await step(withChi(PROBE_CHI));
        if (!probe || probe.ok !== true) return probe;

        const plan = probe.moment_curvature?.chi_plan;

        if (!Array.isArray(plan) || plan.length === 0) {
          // Plan §5.2: `chi_plan` er `null` hvis pakka endrer seg — rutenettet
          // bygges via en PRIVAT metode i `structuralcodes`, og forsvinner den
          // i en oppgradering, mister JS bare muligheten til å drive punktvis.
          // Da er ett samlet kall riktig svar, med ærlig ubestemt framdrift.
          // Dette er en reserve for en framtidig oppgradering, ikke for noe vi
          // forventer i dag.
          emit({ state: 'solving', phase: 'solve', pct: 0, done: null, total: null });
          return client.run(withChi(null), { onProgress: opts.onProgress, onStart });
        }

        // Fra nå av er PLANEN fasiten for hvor mange punkter kurven har, ikke
        // `pre + post`: det er planen vi faktisk kjører gjennom, og et samlet
        // kall ville brukt nøyaktig den samme.
        const total = plan.length;
        const kappa = [];
        const moment = [];
        const warnings = probe.warnings ? [...probe.warnings] : [];
        const seen = new Set(warnings.map(warningKey));
        let wallTime = Number(probe.meta?.wall_time_ms) || 0;
        let cancelled = false;

        for (let i = 0; i < total; i++) {
          // Avbrudd er å LA VÆRE Å SENDE neste bit — ikke å rive ned runtimen.
          if (isCancelled()) { cancelled = true; break; }
          // Uendret planverdi: `mc_chi` er en STØRRELSE, og motoren setter
          // fortegnet selv ut fra θ.
          const point = await step(withChi(plan[i]));
          if (!point || point.ok !== true) {
            // Et punkt som ikke lar seg regne avslutter kurven. Har vi ingen
            // punkter i det hele tatt, er motorens eget svar det beste vi har.
            if (kappa.length === 0) return point;
            break;
          }
          const block = point.moment_curvature || {};
          const k = Array.isArray(block.kappa) ? block.kappa : [];
          const m = Array.isArray(block.moment) ? block.moment : [];
          if (!k.length || !m.length) break;
          kappa.push(k[0]);
          moment.push(m[0]);
          wallTime += Number(point.meta?.wall_time_ms) || 0;
          for (const w of point.warnings || []) {
            if (w && !seen.has(warningKey(w))) { seen.add(warningKey(w)); warnings.push(w); }
          }
          const pct = Math.round((kappa.length / total) * 100);
          report({ done: kappa.length, total, pct });
          emit({ state: 'solving', phase: 'solve', pct, done: kappa.length, total });
        }

        const got = kappa.length;
        const truncated = got < total;
        if (truncated && !seen.has(warningKey({ code: 'mc_truncated' }))) {
          warnings.push({
            code: 'mc_truncated',
            severity: 'warning',
            message: '',
            detail: cancelled
              ? `avbrutt av bruker etter ${got} av ${total} punkter`
              : `kurven stoppet etter ${got} av ${total} punkter`,
          });
        }

        return {
          ...probe,
          meta: { ...probe.meta, wall_time_ms: wallTime },
          moment_curvature: {
            ...probe.moment_curvature,
            kappa,
            moment,
            // Motorens EGEN regel (`engine.py`): flytpunktet ligger på indeks
            // `pre - 1`, og finnes bare når vi faktisk kom så langt.
            yield_index: got >= pre ? pre - 1 : null,
            truncated,
          },
          warnings,
        };
      }
    },

    /**
     * «Run all» (plan §D): kjører hver LOVLIG analyse etter hverandre og
     * fletter blokkene til ett resultat.
     *
     * FORMEN, som `results.js` og `report.js` leser:
     *
     *   { ok: true, schema, analysis: 'all', primary: 'nm_domain'|'bending',
     *     bending?: {...}, moment_curvature?: {...}, nm_domain?: {...},
     *     meta, materials, section_props, checks, warnings }
     *
     * Analyseblokkene beholder NØYAKTIG navnet og innholdet motoren ga dem, og
     * `result[result.primary]` er derfor den blokka `analysisBlock()` skal
     * peke på. Ingenting er regnet om her; fletting er alt denne funksjonen
     * gjør. Regner den, finnes tallet to steder — og det ene sakker etter.
     *
     * EN DELVIS «RUN ALL» ER ET GYLDIG SVAR. Feiler én analyse, leveres de
     * andre, og `warnings` får en `run_all_partial` som navngir den som falt
     * ut. Faller ALLE ut, returneres motorens eget svar på kapasitetskjøringen
     * uendret — med sin egen `analysis` — slik at feilvisningen i `ui.js` og
     * `results.js` virker som før uten å kjenne til «Run all».
     *
     * FRAMDRIFTEN ER TRE FASER ETTER HVERANDRE, ikke én sammenslått prosent:
     * `pct` nullstilles ved hver analyse, og `onProgress` bærer `analysis`,
     * `step` og `steps` slik at kalleren kan si HVILKEN fase som går.
     *
     * @param {object} payload §5.1-payload; `analysis` overstyres per delkall
     * @param {object} [opts]
     * @param {(p: object) => void} [opts.onProgress]
     * @param {() => boolean} [opts.isCancelled] spørres FØR hver analyse
     * @param {(msgId: string) => void} [opts.onStart]
     * @returns {Promise<object>} §5.2-formet resultat
     */
    async runAll(payload, opts = {}) {
      const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;
      const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
      const onStart = typeof opts.onStart === 'function' ? opts.onStart : () => {};
      const { primary, analyses } = runAllPlan(payload);

      /** analysenavn -> svaret fra den kjøringen, `ok` eller ikke. */
      const answers = new Map();
      /** `{analysis, code}` for hver analyse som ikke ga et brukbart svar. */
      const lost = [];

      beginDrive();
      try {
        for (let i = 0; i < analyses.length; i++) {
          const analysis = analyses[i];
          // Avbrudd er å LA VÆRE Å SENDE neste analyse — samme prinsipp som
          // mellom to κ-punkter, og derfor like billig.
          if (isCancelled()) { lost.push({ analysis, code: 'cancelled' }); continue; }

          const step = { analysis, step: i + 1, steps: analyses.length };
          const sub = { ...payload, analysis };
          // Ny fase: `pct` tilbake til 0, ellers ville linja hoppet bakover
          // uten forklaring når analyse nummer to begynte.
          emit({ state: 'solving', phase: 'section', pct: 0, done: null, total: null,
                 error: null, analysis });
          report({ ...step, done: null, total: null, pct: 0 });

          let answer = null;
          try {
            answer = analysis === 'moment_curvature'
              ? await client.runMomentCurvature(sub, {
                  onStart,
                  isCancelled,
                  onProgress: (p) => report({ ...step, ...p }),
                })
              : await client.run(sub, { onStart, onProgress: (p) => report({ ...step, ...p }) });
          } catch (err) {
            // En worker-/kjøretidsfeil i ÉN analyse skal ikke kaste de to
            // andre: `run` avviser bare ved SVIKT, ikke ved motorens egne
            // «nei» (de kommer som `ok: false`).
            lost.push({ analysis, code: err?.code || 'worker_error' });
            continue;
          }
          if (!answer || answer.ok !== true) {
            lost.push({ analysis, code: answer?.error?.code || 'engine_error' });
            // Motorens eget `{ok:false}` beholdes: er det det ENESTE vi har,
            // er det svaret brukeren skal se.
            if (answer) answers.set(analysis, answer);
            continue;
          }
          answers.set(analysis, answer);
        }
      } finally {
        emit({ analysis: null });
        endDrive();
      }

      const done = analyses.filter((a) => answers.get(a)?.ok === true);
      if (done.length === 0) {
        const fallback = answers.get(primary) || answers.get(analyses.find((a) => answers.has(a)));
        // Ingen analyse kom gjennom OG ingen av dem rakk å svare: da er
        // avbrudd/svikt det eneste vi vet, og det skal bli en feil hos
        // kalleren, ikke et tomt «resultat».
        if (!fallback) {
          throw new SolverError({
            code: lost.every((l) => l.code === 'cancelled') ? 'cancelled' : lost[0]?.code || 'worker_error',
            detail: lost.map((l) => `${l.analysis}: ${l.code}`).join(', '),
          });
        }
        return fallback;
      }

      // Kapasitetskjøringen er kilden til `checks`, `warnings`, `meta`,
      // `materials` og `section_props` (plan §D). Falt DEN ut, tar vi den
      // første som kom gjennom — kontrollene er uansett like i alle tre
      // grenene (`engine.py:1119-1157`), så tallene er de samme.
      const base = answers.get(primary)?.ok === true ? answers.get(primary) : answers.get(done[0]);

      const warnings = base.warnings ? [...base.warnings] : [];
      const seen = new Set(warnings.map(warningKey));
      let wallTime = 0;
      let mcActiveCombo;
      for (const a of done) {
        const r = answers.get(a);
        wallTime += Number(r.meta?.wall_time_ms) || 0;
        if (r.meta?.mc_active_combo !== undefined) mcActiveCombo = r.meta.mc_active_combo;
        for (const w of r.warnings || []) {
          if (w && !seen.has(warningKey(w))) { seen.add(warningKey(w)); warnings.push(w); }
        }
      }
      if (lost.length) {
        warnings.push({
          code: RUN_ALL_PARTIAL_CODE,
          severity: 'warning',
          message: '',
          detail: lost.map((l) => `${l.analysis}: ${l.code}`).join(', '),
        });
      }

      const merged = {
        ok: true,
        schema: base.schema,
        analysis: RUN_ALL_ANALYSIS,
        primary,
        // `mc_active_combo` overlever fra M–κ-kjøringen: uten den kan ikke
        // kortet si HVILKEN kombinasjon kurven gjelder, og «for den aktive»
        // ville blitt lest som «for alle».
        meta: { ...base.meta, ...(mcActiveCombo !== undefined ? { mc_active_combo: mcActiveCombo } : {}),
                wall_time_ms: wallTime },
        materials: base.materials,
        section_props: base.section_props,
        checks: base.checks,
        warnings,
      };
      for (const a of done) {
        const block = answers.get(a)?.[a];
        if (block) merged[a] = block;
      }
      return merged;
    },
  };

  return client;
}
