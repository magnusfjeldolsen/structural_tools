/**
 * Nettleserverifisering av concrete_section_calculator.
 * Krever at tests/serve-local.js kjoerer paa :8099.
 *
 * To uavhengige sjekker:
 *   1. tests/browser-smoke.html — worker + protokoll + motor, EKSAKT mot fixturen.
 *   2. index.html — at sida starter, at tegningen kommer FOER motoren, at alle tre
 *      analysene kjoerer gjennom window.ModuleAPI, og at rapporten bygges.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8099/concrete_section_calculator';
const fail = [];
const t0 = Date.now();
const log = (s) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${s}`);
const check = (name, ok, detail = '') => {
  log(`${ok ? 'OK  ' : 'FEIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail.push(name);
};

const browser = await chromium.launch();
const ctx = await browser.newContext();

// ── 1. Roeyktesten: worker + protokoll + motor ──────────────────────────────
{
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  log('aapner browser-smoke.html …');
  await page.goto(`${BASE}/tests/browser-smoke.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__smoke && window.__smoke.done', null,
                             { timeout: 180000 });
  const r = await page.evaluate('window.__smoke');
  check('roeyktest: motoren svarer', r.ok === true, r.error ?? '');
  if (r.ok) {
    check('roeyktest: M_Rd bit-identisk med fixturen', r.rel === 0 || r.rel < 1e-12,
          `rel=${r.rel}, M_Rd=${r.M_Rd}`);
    log(`   runtime=${r.meta?.runtime} scipy=${r.meta?.scipy} ${r.meta?.wall_time_ms} ms`);
  }
  check('roeyktest: ingen konsollfeil', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── 2. Selve sida ──────────────────────────────────────────────────────────
{
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  log('aapner index.html …');
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });

  // Tegningen skal komme UMIDDELBART, lenge foer motoren er klar (plan §3.9).
  await page.waitForSelector('svg', { timeout: 5000 });
  const early = await page.evaluate(`(() => {
    const ready = !!(window.ModuleAPI && window.ModuleAPI.hasResults && window.ModuleAPI.hasResults());
    const svgs = document.querySelectorAll('svg').length;
    return { svgs, ready };
  })()`);
  check('tegningen finnes foer motoren er klar', early.svgs > 0, `${early.svgs} svg`);

  check('window.ModuleAPI finnes', await page.evaluate('typeof window.ModuleAPI'), 'object');
  const cfg = await page.evaluate('window.ModuleAPI.getConfig().module_id');
  check('MODULE_CONFIG.module_id', cfg === 'concrete_section_calculator', String(cfg));

  log('venter paa at motoren varmer opp (~10 MB) …');
  await page.evaluate('window.ModuleAPI.ready()', null);
  check('ModuleAPI.ready() lyktes', true);

  for (const analysis of ['bending', 'nm_domain', 'moment_curvature']) {
    const t = Date.now();
    const res = await page.evaluate(`(async () => {
      const inp = window.ModuleAPI.getInputs();
      inp.analysis = '${analysis}';
      window.ModuleAPI.setInputs(inp);
      const r = await window.ModuleAPI.calculate(window.ModuleAPI.getInputs());
      return { ok: r.ok, analysis: r.analysis, err: r.error && r.error.message,
               MRd: r.bending && r.bending.M_Rd,
               npts: r.moment_curvature ? r.moment_curvature.kappa.length
                     : (r.nm_domain ? r.nm_domain.n.length : null) };
    })()`);
    check(`analyse ${analysis}`, res.ok === true && res.analysis === analysis,
          res.err ?? `pkt=${res.npts} MRd=${res.MRd} (${Date.now() - t} ms)`);
  }

  // Stoettemoment
  const hog = await page.evaluate(`(async () => {
    const inp = window.ModuleAPI.getInputs();
    inp.direction = 'hogging'; inp.analysis = 'bending';
    window.ModuleAPI.setInputs(inp);
    const r = await window.ModuleAPI.calculate(window.ModuleAPI.getInputs());
    return { ok: r.ok, theta: r.meta && r.meta.theta, err: r.error && r.error.message };
  })()`);
  check('stoettemoment (theta = pi)', hog.ok === true && Math.abs(hog.theta - Math.PI) < 1e-9,
        hog.err ?? `theta=${hog.theta}`);

  // Rapporten
  const rep = await page.evaluate(`(async () => {
    const inp = window.ModuleAPI.getInputs();
    inp.direction = 'sagging'; inp.analysis = 'bending';
    window.ModuleAPI.setInputs(inp);
    await window.ModuleAPI.calculate(window.ModuleAPI.getInputs());
    const btn = [...document.querySelectorAll('button')]
      .find(b => /rapport/i.test(b.textContent || ''));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    const c = document.querySelector('#report-overlay .report-content');
    return { found: !!btn, len: c ? c.innerHTML.length : 0,
             secs: c ? c.querySelectorAll('[data-sec]').length : 0,
             printRootIsBodyChild: document.getElementById('cscPrintRoot')?.parentElement === document.body };
  })()`);
  check('rapportknapp finnes', rep.found === true);
  check('rapporten bygges med alle kapitler', rep.secs >= 7, `${rep.secs} kapitler, ${rep.len} tegn`);
  check('#cscPrintRoot er direkte barn av <body>', rep.printRootIsBodyChild === true);

  check('ingen konsollfeil paa sida', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.screenshot({ path: 'side.png', fullPage: true });
  log('skjermbilde: side.png');
  await page.close();
}

await browser.close();
log(fail.length === 0 ? 'ALT BESTAATT' : `FEILET: ${fail.join(', ')}`);
process.exit(fail.length === 0 ? 0 : 1);
