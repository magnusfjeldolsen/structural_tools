/**
 * main.js — oppstart og orkestrering.
 *
 * HVA DENNE FILA GJØR, OG HVA DEN IKKE GJØR
 * Den kobler sammen de fire delene — tilstand (`store.js`), motorhåndtak
 * (`solver-client.js`), skjerm (`ui.js`) og rapport (`report.js`) — og eier de
 * tre beslutningene ingen av dem kan ta alene:
 *
 * 1. **Når motoren varmes opp.** Ved sidelast, parallelt med at brukeren fyller
 *    ut skjemaet (plan §3.9). Det er verdt mer enn alle byte-optimaliseringene
 *    til sammen: brukeren bruker 10–30 sekunder på skjemaet, og det skjuler
 *    hele kaldstarten. Unntaket er `navigator.connection.saveData` — da er
 *    10 MB uoppfordret ikke greit, og vi venter på første «Beregn», som er et
 *    samtykke.
 * 2. **Hvordan moment–krumning kjøres.** Punkt for punkt fra JS (§3.7), slik at
 *    framdriften er determinat og «Avbryt» ikke koster en runtime-omstart.
 * 3. **At `{ok: false}` er et RESULTAT.** En modellfeil som `axial_out_of_range`
 *    legges i `state.result` og tegnes i resultatseksjonen. Bare worker- og
 *    kjøretidssvikt blir en feilboks.
 *
 * Den regner INGENTING selv. Skulle det dukke opp et tall her, er det en feil:
 * da finnes det to steder å regne det samme, og det ene kommer til å sakke
 * etter uten at noen test merker det.
 */

import { MODULE_ID, MODULE_NAME, MODULE_VERSION, SCHEMA_VERSION, STRUCTURALCODES_VERSION }
  from './meta.js';
import { createStore, RUN_ALL } from './store.js';
import { buildPayload } from './payload.js';
import { validate } from './section.js';
import { createSolverClient, shouldDeferWarmup } from './solver-client.js';
import { createUI } from './ui.js';
import { buildReportHtml, clearPrintStage, OVERLAY_SELECTOR, stageReportForPrint } from './report.js';

/**
 * Starter modulen. Kalles fra `index.html`, som deretter bygger `MODULE_CONFIG`
 * og `window.ModuleAPI` rundt håndtaket som returneres (plan §9).
 *
 * @returns {object} `{store, client, ui, calculate, ready, openReport}`
 */
export function startApp() {
  const store = createStore();

  /** Satt mens en beregning pågår; leses av moment–krumningsløkka. */
  let cancelRequested = false;
  /** msgId-en for løpet som er i gang — `cancel` sin `payload.target` (§3.3). */
  let currentMsgId = null;
  /** Løftet for beregningen som pågår, slik at to «Beregn» ikke krysser hverandre. */
  let running = null;

  // `let`, ikke `const`: `onStatus` under kan fyre før `createUI` er ferdig
  // (allerede under `client.init()`), og et `const` i TDZ ville kastet
  // ReferenceError i stedet for å hoppe over en opptegning.
  let ui = null;

  const client = createSolverClient({
    onStatus: () => { if (ui) ui.renderEngine(); },
  });

  ui = createUI({
    store,
    client,
    onCalculate: () => { calculate(); },
    onCancel: () => cancel(),
    onReport: () => openReport(),
    onRetryWarmup: () => warmUp(),
  });

  /* ---------------------------------------------------------------- *
   * Oppvarming (plan §3.9)
   * ---------------------------------------------------------------- */

  function warmUp() {
    // Feiler den, nullstiller `solver-client` memoet sitt selv, slik at denne
    // funksjonen er nok for «Prøv igjen»-knappen. Ingen omlasting av sida.
    client.init().catch(() => { /* status og «Prøv igjen» tegnes av ui.js */ });
  }

  /* ---------------------------------------------------------------- *
   * Beregning
   * ---------------------------------------------------------------- */

  /**
   * Kjører den valgte analysen.
   *
   * VENTER SELV PÅ MOTOREN i stedet for å avvise (plan §9 avvik 1): trykker
   * brukeren «Beregn» ett sekund etter sidelast, skal knappen føles treg —
   * ikke feile.
   *
   * @returns {Promise<object|null>} §5.2-resultat, eller `null` når
   *          valideringen stoppet kjøringen før motoren ble spurt
   */
  async function calculate() {
    if (running) return running;

    const state = store.getState();
    const issues = validate(state);
    if (issues.some((i) => i.severity === 'error')) {
      // Valideringen er allerede tegnet ved «Beregn»; å kjøre videre ville gitt
      // et tøvete tall i stedet for en melding brukeren kan gjøre noe med.
      ui.render();
      // Seksjon 6 er slettet, og `#validation` bor nå øverst i resultatseksjonen.
      // Målet spørres derfor om fra `ui.js`, som eier DOM-en. En id skrevet her
      // ville pekt på en seksjon som ikke finnes lenger, og `?.` ville gjort den
      // manglende rullingen HELT taus — ingen feil, bare en bruker som ikke får
      // se meldingen som stoppet kjøringen.
      ui.scrollToValidation();
      return null;
    }

    let payload;
    try {
      payload = buildPayload(state);
    } catch (err) {
      // `payload.js` kaster på α_cc/γ_c/γ_s = 0 — i pakken blir de STILLE
      // standardverdier, og et resultat som ikke stemmer med det rapporten
      // trykker er verre enn ingen.
      store.setResult(errorResult(state, 'invalid_payload', String(err && err.message)));
      ui.render();
      return store.getState().result;
    }

    cancelRequested = false;
    currentMsgId = null;
    ui.setBusy(true);

    const onStart = (msgId) => { currentMsgId = msgId; };

    running = (async () => {
      try {
        if (state.analysis === RUN_ALL) {
          // «Run all» er KLIENTSIDE (plan §D): motoren kjenner bare sine tre
          // analysenavn, og `analysis: 'all'` ville kommet tilbake som
          // `unknown_analysis`. `runAll` overstyrer derfor `analysis` per
          // delkall og fletter blokkene selv — ingen motorendring.
          return await client.runAll(payload, {
            onStart,
            isCancelled: () => cancelRequested,
          });
        }
        if (state.analysis === 'moment_curvature') {
          return await client.runMomentCurvature(payload, {
            onStart,
            isCancelled: () => cancelRequested,
          });
        }
        return await client.run(payload, { onStart });
      } catch (err) {
        // Hit kommer bare worker-/kjøretidssvikt. Motorens egne «nei» kommer
        // som `type: 'result'` med `ok: false` og løses opp som et svar.
        return errorResult(state, err?.code || 'worker_error', err?.detail || String(err));
      }
    })();

    let result;
    try {
      result = await running;
    } finally {
      running = null;
      currentMsgId = null;
      ui.setBusy(false);
    }

    store.setResult(result);
    // Ingen `clearStale()` lenger: foreldelsesbegrepet er borte. Enhver endring i
    // `combos` ugyldiggjør resultatet med én gang (§4.7), fordi `governing` kan
    // bytte rad når en `M_Ed` endres — og da er både toppnivåfeltene og plottet
    // feil. Da finnes det ingen mellomtilstand å rydde opp i.
    // Speiling for arbeidsflyt-API-et (plan §7 og §9).
    window.lastCalculationResults = result;
    window.lastCalculationInputs = store.snapshot();
    ui.render();
    document.getElementById('s-res')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return result;
  }

  /**
   * Avbryter et pågående løp.
   *
   * To ting skjer, og begge trengs: flagget stopper moment–krumningsløkka i å
   * sende NESTE punkt, og `cancel`-meldingen — som ALLTID bærer `payload.target`
   * (§3.3) — kaster et punkt som alt ligger i workerens kø. Et punkt som
   * ALLEREDE regner kan ikke stoppes; det er derfor «Avbryt» er skrudd av for
   * analysene som er ferdige på 30–140 ms uansett (§3.7).
   */
  function cancel() {
    cancelRequested = true;
    if (currentMsgId) client.cancel(currentMsgId);
  }

  /** Et §5.2-formet feilsvar, slik at UI og rapport slipper en egen form. */
  function errorResult(state, code, detail) {
    return {
      ok: false,
      schema: SCHEMA_VERSION,
      analysis: state.analysis,
      error: { code, message: '', detail: detail || '' },
    };
  }

  /* ---------------------------------------------------------------- *
   * Rapport (plan §8 — `report.js` og `print.css` eies av A4b)
   * ---------------------------------------------------------------- */

  function fillReport() {
    const host = document.querySelector(OVERLAY_SELECTOR);
    if (!host) return;
    const state = store.getState();
    host.innerHTML = buildReportHtml(state, state.result);
  }

  function openReport() {
    const overlay = document.getElementById('report-overlay');
    if (!overlay) return;
    fillReport();
    overlay.hidden = false;
  }

  function closeReport() {
    const overlay = document.getElementById('report-overlay');
    if (overlay) overlay.hidden = true;
  }

  function setupReport() {
    const close = document.getElementById('report-close');
    if (close) close.onclick = closeReport;
    const print = document.getElementById('report-print');
    if (print) print.onclick = () => window.print();
    const guides = document.getElementById('report-guides');
    if (guides) {
      guides.onclick = () => {
        const content = document.querySelector(OVERLAY_SELECTOR);
        if (!content) return;
        const on = content.hasAttribute('data-page-guides');
        if (on) content.removeAttribute('data-page-guides');
        else content.setAttribute('data-page-guides', '');
        guides.dataset.on = String(!on);
      };
    }

    // Rapporten bygges på nytt RETT FØR utskrift, også når overlegget aldri ble
    // åpnet — ellers ville Ctrl+P gitt et tomt ark, eller et ark med tall fra
    // en tidligere tilstand.
    window.addEventListener('beforeprint', () => {
      fillReport();
      stageReportForPrint();
    });
    window.addEventListener('afterprint', clearPrintStage);
  }

  /* ---------------------------------------------------------------- *
   * Oppstart
   * ---------------------------------------------------------------- */

  ui.mount();
  setupReport();

  if (shouldDeferWarmup()) {
    // §3.9 krav 2. Motoren lastes først ved første «Beregn» — `client.run()`
    // initialiserer selv, så det trengs ingen egen gren for det.
    ui.renderEngine();
  } else {
    warmUp();
  }

  return {
    store,
    client,
    ui,
    calculate,
    cancel,
    ready: () => client.ready(),
    openReport,
    meta: { MODULE_ID, MODULE_NAME, MODULE_VERSION, SCHEMA_VERSION, STRUCTURALCODES_VERSION },
  };
}
