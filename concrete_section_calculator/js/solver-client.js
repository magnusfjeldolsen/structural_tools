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
 * DOM-fri: fila rører verken `document` eller `localStorage`. Den bruker
 * `Worker`, `URL` og (for oppvarmingsvalget) `navigator` — alt sammen
 * kjøretidsting, ikke DOM.
 */

/* ================================================================== *
 * Protokollkonstanter
 * ================================================================== */

/** Fasene i `progress.phase` (plan §3.3), med norsk tekst til statuspilla. */
export const PHASE_LABELS = Object.freeze({
  runtime: 'Laster Python-kjernen',
  packages: 'Laster numpy, shapely og structuralcodes',
  engine: 'Starter beregningsmotoren',
  section: 'Bygger tverrsnittet',
  solve: 'Regner',
});

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || 'Arbeider';
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
 */
export const CANCELLABLE_ANALYSES = Object.freeze(['moment_curvature']);

export function isCancellable(analysis) {
  return CANCELLABLE_ANALYSES.includes(analysis);
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
   * Sant mens `runMomentCurvature` driver løkka. Da er HVERT punkt et eget
   * `result`, og uten dette flagget ville statusen blinket «klar» 20 ganger
   * midt i en beregning som pågår.
   */
  let driving = false;

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
      if (!driving) emit({ state: 'ready', phase: null, pct: 100, message: '' });
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

      driving = true;
      try {
        return await drive();
      } finally {
        driving = false;
        emit({ state: 'ready', phase: null, pct: 100, message: '' });
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
        const seen = new Set(warnings.map((w) => w?.code));
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
            if (w && !seen.has(w.code)) { seen.add(w.code); warnings.push(w); }
          }
          const pct = Math.round((kappa.length / total) * 100);
          report({ done: kappa.length, total, pct });
          emit({ state: 'solving', phase: 'solve', pct, done: kappa.length, total });
        }

        const got = kappa.length;
        const truncated = got < total;
        if (truncated && !seen.has('mc_truncated')) {
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
  };

  return client;
}
