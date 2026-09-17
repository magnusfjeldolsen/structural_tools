/**
 * perf-mc.mjs — akseptansekravet i planens punkt E, festet som en maaling.
 * Krever at tests/serve-local.js kjoerer paa :8099.
 *
 * KRAVET: «M–kappa med standardoppsettet skal kjoere uten synlig hakking, og
 * hovedtraaden skal ikke ha oppgaver over 50 ms.»
 *
 * HVORFOR EN KONTROLLBLOKKERING I SAMME SIDE
 * Foerste maaling i boelge 1 rapporterte 0 lange oppgaver ogsaa da observeren
 * IKKE virket: en busy-loop inne i page.evaluate kjoerer som en CDP-oppgave og
 * telles ikke som 'longtask'. En nullmaaling uten en positiv kontroll er derfor
 * verdiloes. Denne fila blokkerer 300 ms fra sidens EGEN setTimeout foer hver
 * maaling, og AVBRYTER hvis observeren ikke fanget den. Av samme grunn startes
 * beregningen med et ekte klikk paa #btn-run-bar, ikke fra page.evaluate.
 *
 * ETTER RUNDE 6 PUNKT 2.5 finnes «Beregn», «Avbryt» og motorstatusen BARE i
 * bunnlinja: seksjon 6 med #btn-run, #btn-cancel og #engine-card er slettet.
 * Denne fila er ytelsesharnisket og kjoeres ikke av `npm run test:concrete-section`,
 * saa den ville roeket STILLE hvis selektorene ikke fulgte med.
 *
 * DEN MAALER OGSAA det som faktisk ble endret i denne runden: at «Avbryt»
 * fortsatt virker midt i en kjoering, og at «Run all» (planens punkt D) gir den
 * flettede formen mot den EKTE motoren — ikke bare mot den falske workeren i
 * tests/solver-client.test.mjs.
 *
 * Kjoeres manuelt:  node concrete_section_calculator/tests/perf-mc.mjs
 */

const BASE = 'http://localhost:8099/concrete_section_calculator';
const LONGTASK_LIMIT_MS = 50;

// playwright ligger ikke i repoets node_modules; browser-verify.mjs importerer
// 'playwright' rett, og boelge 1 maalte med playwright-core fra cmdscripts.
// Vi proever begge framfor aa laase fila til én maskins oppsett.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import(
    'file:///C:/Python/cmdscripts/node_modules/playwright-core/index.mjs'
  ));
}

const fail = [];
const t0 = Date.now();
const log = (s) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${s}`);
const check = (name, ok, detail = '') => {
  log(`${ok ? 'OK  ' : 'FEIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail.push(name);
};

/**
 * Observerne. `longtask` er kravet; `long-animation-frame` fanger i tillegg
 * layout og paint, altsaa det stedet DOM-arbeid ville dukket opp selv naar
 * ingen enkeltoppgave passerer 50 ms.
 */
const INIT = `
window.__lt = []; window.__frames = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }); })
  .observe({ entryTypes: ['longtask'] });
try {
  window.__loaf = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: e.startTime, d: e.duration }); })
    .observe({ type: 'long-animation-frame', buffered: false });
} catch (e) { window.__loaf = null; }
(function raf() { let last = performance.now();
  requestAnimationFrame(function tick(now) { window.__frames.push(+(now - last).toFixed(2)); last = now; requestAnimationFrame(tick); });
})();
window.__reset = () => { window.__lt.length = 0; window.__frames.length = 0; if (window.__loaf) window.__loaf.length = 0; };
`;

/** Blokkerer 300 ms fra sidens egen oppgavekoe. Skal SES av observeren. */
const CONTROL = `(() => new Promise((res) => setTimeout(() => {
  const end = performance.now() + 300; while (performance.now() < end) {}
  setTimeout(res, 50);
}, 0)))()`;

function stats(a) {
  if (!a.length) return { n: 0, max: 0, median: 0 };
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, median: +s[s.length >> 1].toFixed(2), max: +s.at(-1).toFixed(2) };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript({ content: INIT });
log('aapner index.html …');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#btn-run-bar', { timeout: 10000 });
log('venter paa at motoren varmer opp (~10 MB) …');
await page.evaluate('window.ModuleAPI.ready()', null);

// ── Kontroll: beviser at observeren lever i NETTOPP denne sida ───────────────
await page.evaluate('window.__reset()');
await page.evaluate(CONTROL);
const control = await page.evaluate('window.__lt.map((e) => e.d)');
check('kontroll: observeren fanger en 300 ms blokkering',
      control.some((d) => d >= 200), `lange oppgaver: ${JSON.stringify(control)}`);
if (!control.some((d) => d >= 200)) {
  log('AVBRYTER: uten en fungerende observer er en nullmaaling verdiloes.');
  await browser.close();
  process.exit(1);
}

/** Setter analysen og kjoerer den med et EKTE klikk. Returnerer maalingen. */
async function measure(analysis) {
  await page.evaluate(`(() => {
    const inp = window.ModuleAPI.getInputs();
    inp.analysis = ${JSON.stringify(analysis)};
    window.ModuleAPI.setInputs(inp);
    window.lastCalculationResults = null;
  })()`);
  const chosen = await page.evaluate('window.ModuleAPI.getInputs().analysis');
  await page.evaluate('window.__reset()');
  const t = Date.now();
  await page.click('#btn-run-bar');
  await page.waitForFunction('window.lastCalculationResults !== null', null, { timeout: 180000 });
  const wall = Date.now() - t;
  const m = await page.evaluate(`(() => {
    const r = window.lastCalculationResults || {};
    return {
      lt: window.__lt.slice(), frames: window.__frames.slice(),
      loaf: window.__loaf ? window.__loaf.slice() : null,
      ok: r.ok, analysis: r.analysis, engine_ms: r.meta && r.meta.wall_time_ms,
      points: r.moment_curvature ? r.moment_curvature.kappa.length : null,
    };
  })()`);
  return { ...m, chosen, wall };
}

// ── 1. Moment–krumning, standardoppsettet ───────────────────────────────────
{
  const m = await measure('moment_curvature');
  check('M–kappa kjoerer gjennom', m.ok === true && m.points > 0,
        `${m.points} punkter, ${m.wall} ms vegg, motor ${Math.round(m.engine_ms)} ms`);
  const over = m.lt.filter((e) => e.d > LONGTASK_LIMIT_MS);
  const f = stats(m.frames);
  check(`ingen hovedtraadsoppgave over ${LONGTASK_LIMIT_MS} ms under M–kappa`,
        over.length === 0,
        `${m.lt.length} lange oppgaver totalt, verste ${stats(m.lt.map((e) => e.d)).max} ms`);
  check('ingen ramme over 50 ms', f.max <= 50,
        `${f.n} rammer, median ${f.median} ms, verste ${f.max} ms`);
  log(`   ms per punkt: ${(m.wall / m.points).toFixed(1)}  ·  ` +
      `long-animation-frame over 50 ms: ${m.loaf ? m.loaf.length : 'ikke stoettet'}`);
}

// ── 2. «Avbryt» midt i en kjoering ──────────────────────────────────────────
{
  await page.evaluate(`(() => {
    const inp = window.ModuleAPI.getInputs();
    inp.analysis = 'moment_curvature';
    window.ModuleAPI.setInputs(inp);
    window.lastCalculationResults = null;
  })()`);
  await page.click('#btn-run-bar');
  // Vent til kurven ER i gang, ellers avbryter vi noe som ikke har startet.
  // Punkttelleren fulgte med fra #engine-card til #bar-engine da seksjon 6 gikk
  // — den er fortsatt den ENESTE meldingen om at kurven beveger seg.
  await page.waitForFunction(
    "document.querySelector('#bar-engine')?.textContent?.includes('point')",
    null, { timeout: 60000 },
  );
  const cancelEnabled = await page.evaluate(
    "!document.querySelector('#btn-cancel-bar').disabled",
  );
  check('«Avbryt» er aktiv under M–kappa', cancelEnabled === true);
  await page.click('#btn-cancel-bar');
  await page.waitForFunction('window.lastCalculationResults !== null', null, { timeout: 60000 });
  const r = await page.evaluate(`(() => {
    const r = window.lastCalculationResults || {};
    const mc = r.moment_curvature || {};
    return { ok: r.ok, truncated: mc.truncated, points: (mc.kappa || []).length,
             warn: (r.warnings || []).map((w) => w.code),
             state: document.querySelector('#engine-pill')?.textContent || '' };
  })()`);
  check('avbrudd gir en avkortet kurve med punktene som er regnet',
        r.ok === true && r.truncated === true && r.points > 0 && r.warn.includes('mc_truncated'),
        `${r.points} punkter, warn=${r.warn.join(',')}`);
  check('motoren er «klar» etter et avbrudd, ikke havarert',
        /ready|klar/i.test(r.state), r.state);
}

// ── 3. «Run all» hele veien: chip -> main.js -> runAll -> ekte motor ────────
{
  log('«Run all» gjennom sidas egen knapp …');
  const m = await measure('all');
  check('«Run all» naar gjennom chip og tilstand', m.chosen === 'all',
        `state.analysis=${m.chosen}`);
  const r = await page.evaluate(`(() => {
    const res = window.lastCalculationResults || {};
    return {
      analysis: res.analysis, primary: res.primary, ok: res.ok,
      blocks: ['bending', 'moment_curvature', 'nm_domain'].filter((k) => res[k]),
      hasChecks: !!res.checks, hasMeta: !!res.meta, hasMaterials: !!res.materials,
      hasProps: !!res.section_props,
      points: res.moment_curvature ? res.moment_curvature.kappa.length : null,
      M_Rd: res[res.primary] && res[res.primary].M_Rd,
      mcCombo: res.meta && res.meta.mc_active_combo,
      wall: res.meta && res.meta.wall_time_ms,
      warn: (res.warnings || []).map((w) => w.code),
    };
  })()`);
  const over = m.lt.filter((e) => e.d > LONGTASK_LIMIT_MS);
  check('«Run all» gir ok med alle tre blokkene',
        r.ok === true && r.analysis === 'all' && r.blocks.length === 3,
        `blokker: ${r.blocks.join(',')} · warn=${r.warn.join(',') || 'ingen'}`);
  // `M_Rd` er SIGNERT etter endringsrunde 4 (feltmoment negativt), saa kravet er
  // at tallet FINNES og ikke er null — ikke at det er positivt.
  check('primary peker paa kapasitetsanalysen',
        (r.primary === 'bending' || r.primary === 'nm_domain')
        && Number.isFinite(r.M_Rd) && r.M_Rd !== 0,
        `primary=${r.primary}, M_Rd=${r.M_Rd}`);
  check('meta, materials, section_props og checks er med, og mc_active_combo overlevde',
        r.hasChecks && r.hasMeta && r.hasMaterials && r.hasProps && !!r.mcCombo,
        `mc_active_combo=${r.mcCombo}`);
  check(`heller ikke «Run all» gir en oppgave over ${LONGTASK_LIMIT_MS} ms`,
        over.length === 0, `${m.lt.length} lange oppgaver totalt`);
  log(`   ${r.points} M–kappa-punkter, ${m.wall} ms vegg, samlet motortid ${Math.round(r.wall)} ms`);
}

check('ingen konsollfeil', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
log(fail.length === 0 ? 'ALT BESTAATT' : `FEILET: ${fail.join(', ')}`);
process.exit(fail.length === 0 ? 0 : 1);
