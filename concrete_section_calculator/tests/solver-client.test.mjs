/**
 * solver-client.test.mjs — protokollen og «Run all», uten nettleser.
 *
 * HVORFOR EN FALSK WORKER OG IKKE PLAYWRIGHT
 * `solver-client.js` er DOM-fri og rører bare `Worker`, `URL` og `navigator`.
 * Byttes `globalThis.Worker` ut med en falsk motor som svarer etter
 * protokollen i plan §3.3, kan HELE klientlogikken — kø, avbrudd, fletting av
 * «Run all», M–κ-løkka — kjøres i `node --test` på millisekunder. Den ekte
 * motoren dekkes av `tests/python` og `tests/browser-verify.mjs`; det som
 * testes her er utelukkende det klienten selv gjør med svarene.
 *
 * DEN FALSKE MOTOREN LYVER ALDRI OM FORMEN: den svarer med de samme nøklene
 * `engine.py` svarer med (`ok`, `schema`, `analysis`, `meta`, `materials`,
 * `section_props`, `checks`, `warnings` + analysens egen blokk). Testet mot en
 * form motoren ikke har, ville disse testene vært verdiløse.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSolverClient,
  isCancellable,
  runAllPlan,
  RUN_ALL_PARTIAL_CODE,
  SolverError,
} from '../js/solver-client.js';

/* ================================================================== *
 * Den falske workeren
 * ================================================================== */

/** §5.2-svaret motoren gir for én analyse. */
function engineResult(analysis, { chiPlan, chi, warnings = [] } = {}) {
  const common = {
    ok: true,
    schema: 1,
    analysis,
    meta: { engine_version: '1.0.0', runtime: 'fake', wall_time_ms: 10 },
    materials: { fck: 30, fyk: 500 },
    section_props: { Ag: 180000, As_min: 1 },
    checks: { all_ok: true, as_min_ok: true },
    // Bruksgrensen er IKKE en analyse: motoren regner den av lastkombinasjonene
    // og legger den ved uansett hvilken analyse som kjørte. Den falske motoren
    // gjør det samme, slik at flettetesten under kan se om den overlever.
    sls: { all_ok: true, rows: [{ id: 'K1', type: 'quasi_permanent' }], checks: {} },
    warnings,
  };
  if (analysis === 'bending') {
    common.bending = { M_Rd: 4.2e8, utilisation: 0.5, governing: 'K1', shear_governing: 'K1' };
  } else if (analysis === 'nm_domain') {
    common.nm_domain = { n: [-1, 0], m: [0, 1], M_Rd_at_N: 4.2e8, governing: 'K1' };
  } else {
    common.meta.mc_active_combo = 'K1';
    common.moment_curvature = {
      chi_plan: chiPlan,
      // Ett punkt per kall, nøyaktig som motoren svarer når `mc_chi` er satt.
      kappa: [chi ?? 0],
      moment: [(chi ?? 0) * 1e12],
      M_Rd: 4.2e8,
      governing: 'K1',
      shear_governing: 'K1',
    };
  }
  return common;
}

/**
 * En Worker-erstatning. `script` kalles med hver innkommende `run`-payload og
 * bestemmer hva motoren svarer: `undefined` gir standardsvaret, et objekt
 * sendes som `result`, og `{__error: {...}}` sendes som `error`.
 */
function installFakeWorker({ script = () => undefined, chiPlan = [1e-6, 2e-6] } = {}) {
  const sent = [];
  const cancelled = new Set();

  class FakeWorker {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this.onmessageerror = null;
      FakeWorker.instances.push(this);
    }

    postMessage({ type, msgId, payload }) {
      sent.push({ type, msgId, payload });
      if (type === 'cancel') {
        if (payload?.target != null) cancelled.add(payload.target);
        this.#reply('error', msgId, { code: 'cancelled', message: '', detail: '' });
        return;
      }
      if (type === 'init') {
        this.#reply('ready', msgId, { runtime: 'fake', structuralcodes_version: '0.7.2' });
        return;
      }
      if (type === 'run') {
        // Et løp som er kansellert FØR det startet kastes ut av køa, akkurat
        // som i `solver-worker.mjs` sin `drain()`.
        if (cancelled.has(msgId)) {
          cancelled.delete(msgId);
          this.#reply('error', msgId, { code: 'cancelled', message: '', detail: '' });
          return;
        }
        const scripted = script(payload, sent.filter((s) => s.type === 'run').length);
        if (scripted && scripted.__error) {
          this.#reply('error', msgId, scripted.__error);
          return;
        }
        const chi = payload?.options?.mc_chi;
        this.#reply('result', msgId, scripted
          || engineResult(payload.analysis, { chiPlan, chi }));
        return;
      }
      this.#reply('error', msgId, { code: 'bad_message', message: '', detail: '' });
    }

    terminate() {}

    #reply(type, msgId, payload) {
      // Asynkront, slik at svaret aldri kommer før `send()` har lagt jobben i
      // `pending` — en synkron worker ville skjult nettopp den feilen.
      queueMicrotask(() => {
        if (this.onmessage) this.onmessage({ data: { type, msgId, payload } });
      });
    }
  }
  FakeWorker.instances = [];

  const previous = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  return {
    sent,
    restore() { globalThis.Worker = previous; },
  };
}

/** Payload med `n` kombinasjoner; `N_Ed` i N, som kontrakten krever. */
function payloadWith(combos, analysis = 'all') {
  return {
    schema: 1,
    analysis,
    section: { b: 300, h: 600 },
    loads: { combinations: combos, active: combos[0]?.id },
    options: { mc_pre_yield: 1, mc_post_yield: 1 },
  };
}

const NO_AXIAL = payloadWith([{ id: 'K1', N_Ed: 0, M_Ed: 2e8, theta: 0 }]);
const WITH_AXIAL = payloadWith([
  { id: 'K1', N_Ed: 0, M_Ed: 2e8, theta: 0 },
  { id: 'K2', N_Ed: -500e3, M_Ed: 2e8, theta: 0 },
]);

/* ================================================================== *
 * runAllPlan — hvilke analyser som er lovlige
 * ================================================================== */

test('runAllPlan: uten aksialkraft kjøres alle tre, med bending som primary', () => {
  const plan = runAllPlan(NO_AXIAL);
  assert.equal(plan.primary, 'bending');
  assert.deepEqual([...plan.analyses].sort(),
                   ['bending', 'moment_curvature', 'nm_domain']);
});

test('runAllPlan: aksialkraft i EN kombinasjon stenger bending helt ute', () => {
  const plan = runAllPlan(WITH_AXIAL);
  assert.equal(plan.primary, 'nm_domain');
  assert.ok(!plan.analyses.includes('bending'),
            'regelen fra runde 4 skal ikke kunne omgås via «Run all»');
  assert.deepEqual(plan.analyses, ['nm_domain', 'moment_curvature']);
});

test('runAllPlan: moment–krumning kjøres SIST, slik at et avbrudd bare koster kurven', () => {
  assert.equal(runAllPlan(NO_AXIAL).analyses.at(-1), 'moment_curvature');
  assert.equal(runAllPlan(WITH_AXIAL).analyses.at(-1), 'moment_curvature');
});

test('runAllPlan: tomt eller ugyldig N_Ed er IKKE aksialkraft', () => {
  const blank = payloadWith([{ id: 'K1', N_Ed: NaN, M_Ed: 1e8 }]);
  assert.equal(runAllPlan(blank).primary, 'bending');
  const missing = payloadWith([{ id: 'K1', M_Ed: 1e8 }]);
  assert.equal(runAllPlan(missing).primary, 'bending');
});

test('«Run all» er avbrytbar — den inneholder M–κ og er den lengste kjøringen', () => {
  assert.equal(isCancellable('all'), true);
  assert.equal(isCancellable('moment_curvature'), true);
  assert.equal(isCancellable('bending'), false);
  assert.equal(isCancellable('nm_domain'), false);
});

/* ================================================================== *
 * runAll — flettingen
 * ================================================================== */

test('runAll: fletter alle tre blokkene til ett resultat med primary-peker', async () => {
  const fake = installFakeWorker();
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);

    assert.equal(res.ok, true);
    assert.equal(res.analysis, 'all');
    assert.equal(res.primary, 'bending');
    // Blokkene beholder motorens egne navn, og `result[result.primary]` er den
    // `analysisBlock()` skal peke på.
    assert.ok(res.bending && res.nm_domain && res.moment_curvature);
    assert.equal(res[res.primary], res.bending);
    assert.equal(res.schema, 1);
    assert.deepEqual(res.checks, { all_ok: true, as_min_ok: true });
    assert.ok(res.materials && res.section_props);
    // `mc_active_combo` overlever fra M–κ-kjøringen.
    assert.equal(res.meta.mc_active_combo, 'K1');

    // BRUKSGRENSEN OVERLEVER OGSÅ. `merged` bygges nøkkel for nøkkel, og
    // MÅLT før denne påstanden falt `sls` ut: «Run all» ga 0 SLS-rader der
    // «Bending resistance» ga 2, uten en eneste feilmelding. Et felt som blir
    // borte i et lag som bygger et objekt for hånd er samme form som resten av
    // dobbeltkildene — bare at her forsvinner tallet i stedet for å avvike.
    assert.ok(res.sls, '«Run all» mistet hele SLS-kapittelet');
    assert.equal(res.sls.rows.length, 1);
    assert.equal(res.sls.all_ok, true);

    // Hvert delkall gikk ut med motorens EGET analysenavn, aldri 'all'.
    const analyses = fake.sent.filter((s) => s.type === 'run').map((s) => s.payload.analysis);
    assert.ok(analyses.length > 0);
    assert.ok(!analyses.includes('all'), `motoren fikk «all»: ${analyses.join(',')}`);
    assert.deepEqual([...new Set(analyses)], ['bending', 'nm_domain', 'moment_curvature']);
  } finally {
    fake.restore();
  }
});

test('runAll: uten SLS-rader finnes nøkkelen ikke — svaret er BIT FOR BIT som før SLS', async () => {
  // Motstykket, og like viktig (spec §4/AC9): et snitt uten bruksgrenserader
  // skal gi nøyaktig det samme svaret som det gjorde før SLS fantes. En
  // `sls: undefined` som blir med i objektet ville brutt den påstanden, og
  // `'sls' in result` er den eneste måten å se forskjell på.
  const fake = installFakeWorker({
    script: () => {
      const r = engineResult('bending');
      delete r.sls;
      return r;
    },
  });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    assert.ok(!('sls' in res), 'sls-nøkkelen skal ikke finnes i det hele tatt');
  } finally {
    fake.restore();
  }
});

test('runAll: med aksialkraft sendes ALDRI en bending-payload til motoren', async () => {
  const fake = installFakeWorker();
  try {
    const client = createSolverClient();
    const res = await client.runAll(WITH_AXIAL);
    assert.equal(res.primary, 'nm_domain');
    assert.equal(res.bending, undefined);
    const analyses = fake.sent.filter((s) => s.type === 'run').map((s) => s.payload.analysis);
    assert.ok(!analyses.includes('bending'), analyses.join(','));
  } finally {
    fake.restore();
  }
});

test('runAll: summerer wall_time_ms over alle delkallene', async () => {
  const fake = installFakeWorker({ chiPlan: [1e-6, 2e-6] });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    // bending 10 + nm_domain 10 + M–κ (probe + 2 punkter) 30 = 50 ms.
    assert.equal(res.meta.wall_time_ms, 50);
  } finally {
    fake.restore();
  }
});

test('runAll: en analyse som feiler stopper ikke de andre, men blir en advarsel', async () => {
  const fake = installFakeWorker({
    script: (payload) => (payload.analysis === 'nm_domain'
      ? { ok: false, schema: 1, analysis: 'nm_domain',
          error: { code: 'axial_out_of_range', message: '', detail: '' },
          meta: {}, materials: {}, section_props: {}, checks: {}, warnings: [] }
      : undefined),
  });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    assert.equal(res.ok, true);
    assert.ok(res.bending, 'bøyekapasiteten skal fortsatt leveres');
    assert.ok(res.moment_curvature, 'M–κ skal fortsatt leveres');
    assert.equal(res.nm_domain, undefined);
    const partial = res.warnings.find((w) => w.code === RUN_ALL_PARTIAL_CODE);
    assert.ok(partial, `manglende ${RUN_ALL_PARTIAL_CODE}: ${JSON.stringify(res.warnings)}`);
    assert.match(partial.detail, /nm_domain/);
    assert.match(partial.detail, /axial_out_of_range/);
  } finally {
    fake.restore();
  }
});

test('runAll: en worker-svikt i én analyse tar ikke med seg de andre', async () => {
  const fake = installFakeWorker({
    script: (payload) => (payload.analysis === 'bending'
      ? { __error: { code: 'engine_error', message: '', detail: 'boom' } }
      : undefined),
  });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    assert.equal(res.ok, true);
    // Kapasitetskjøringen falt ut, så `checks`/`meta` tas fra den første som
    // kom gjennom — kontrollene er like i alle tre grenene.
    assert.equal(res.primary, 'bending');
    assert.equal(res.bending, undefined);
    assert.ok(res.nm_domain && res.moment_curvature);
    assert.ok(res.checks.all_ok);
    const partial = res.warnings.find((w) => w.code === RUN_ALL_PARTIAL_CODE);
    assert.match(partial.detail, /bending: engine_error/);
  } finally {
    fake.restore();
  }
});

test('runAll: feiler ALLE, returneres motorens eget {ok:false} uendret', async () => {
  const fake = installFakeWorker({
    script: () => ({ ok: false, schema: 1, analysis: 'bending',
                     error: { code: 'axial_out_of_range', message: '', detail: 'n_min=…' },
                     meta: {}, materials: {}, section_props: {}, checks: {}, warnings: [] }),
  });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    assert.equal(res.ok, false);
    // IKKE 'all': feilvisningen i ui.js og results.js skal virke som før, uten
    // å kjenne til «Run all».
    assert.equal(res.analysis, 'bending');
    assert.equal(res.error.code, 'axial_out_of_range');
  } finally {
    fake.restore();
  }
});

test('runAll: advarsler fra alle analysene samles, uten å dublere samme kode+kombinasjon', async () => {
  const fake = installFakeWorker({
    script: (payload) => {
      if (payload.analysis === 'bending') {
        return engineResult('bending', {
          warnings: [{ code: 'asw_below_minimum', severity: 'warning', combo: 'K1' }],
        });
      }
      if (payload.analysis === 'nm_domain') {
        return engineResult('nm_domain', {
          warnings: [
            // Samme kode, SAMME rad: en dublett, som skal falle bort.
            { code: 'asw_below_minimum', severity: 'warning', combo: 'K1' },
            // Samme kode, ANNEN rad: en egen beskjed, som skal overleve.
            { code: 'asw_below_minimum', severity: 'warning', combo: 'K2' },
          ],
        });
      }
      return undefined;
    },
  });
  try {
    const client = createSolverClient();
    const res = await client.runAll(NO_AXIAL);
    const asw = res.warnings.filter((w) => w.code === 'asw_below_minimum');
    assert.equal(asw.length, 2, JSON.stringify(res.warnings));
    assert.deepEqual(asw.map((w) => w.combo), ['K1', 'K2']);
  } finally {
    fake.restore();
  }
});

test('runAll: avbrudd stopper de gjenstående analysene og sier hvilke', async () => {
  const fake = installFakeWorker();
  try {
    const client = createSolverClient();
    let runs = 0;
    const res = await client.runAll(NO_AXIAL, {
      // Avbrytes etter den første analysen: kapasiteten er da allerede levert.
      isCancelled: () => runs >= 1,
      onProgress: (p) => { if (p.pct === 0) runs = p.step; },
    });
    assert.equal(res.ok, true);
    assert.ok(res.bending, 'den fullførte analysen skal leveres');
    assert.equal(res.moment_curvature, undefined);
    const partial = res.warnings.find((w) => w.code === RUN_ALL_PARTIAL_CODE);
    assert.match(partial.detail, /moment_curvature: cancelled/);
  } finally {
    fake.restore();
  }
});

test('runAll: avbrudd FØR noe er regnet gir en cancelled-feil, ikke et tomt resultat', async () => {
  const fake = installFakeWorker();
  try {
    const client = createSolverClient();
    await assert.rejects(
      () => client.runAll(NO_AXIAL, { isCancelled: () => true }),
      (err) => err instanceof SolverError && err.code === 'cancelled',
    );
  } finally {
    fake.restore();
  }
});

test('runAll: framdriften er tre faser etter hverandre, ikke én sammenslått prosent', async () => {
  const fake = installFakeWorker();
  try {
    const client = createSolverClient();
    const seen = [];
    await client.runAll(NO_AXIAL, { onProgress: (p) => seen.push(p) });
    // Hver fase melder seg med `analysis`, `step` og `steps` …
    const starts = seen.filter((p) => p.pct === 0 && p.done === null);
    assert.deepEqual(starts.map((p) => p.analysis),
                     ['bending', 'nm_domain', 'moment_curvature']);
    assert.deepEqual(starts.map((p) => p.step), [1, 2, 3]);
    assert.ok(starts.every((p) => p.steps === 3));
    // … og M–κ sin egen punkttelling går fra 1 og oppover INNENFOR sin fase,
    // ikke som en andel av alle tre.
    const mc = seen.filter((p) => p.analysis === 'moment_curvature' && p.done);
    assert.deepEqual(mc.map((p) => p.done), [1, 2]);
    assert.equal(mc.at(-1).pct, 100);
  } finally {
    fake.restore();
  }
});

test('runAll: statusen melder aldri «klar» mellom to analyser', async () => {
  const fake = installFakeWorker();
  try {
    const states = [];
    const client = createSolverClient({ onStatus: (st) => states.push(st.state) });
    await client.runAll(NO_AXIAL);
    // Den siste er «klar»; ingen av de foregående skal være det, ellers
    // blinker statuspilla ferdig midt i en kjøring som pågår.
    assert.equal(states.at(-1), 'ready');
    assert.ok(!states.slice(0, -1).includes('ready'),
              `«klar» midt i kjøringen: ${states.join(' ')}`);
  } finally {
    fake.restore();
  }
});

test('runAll: status.analysis peker på fasen som går, og nullstilles etterpå', async () => {
  const fake = installFakeWorker();
  try {
    const seen = [];
    const client = createSolverClient({ onStatus: (st) => seen.push(st.analysis) });
    await client.runAll(NO_AXIAL);
    assert.deepEqual([...new Set(seen.filter(Boolean))],
                     ['bending', 'nm_domain', 'moment_curvature']);
    assert.equal(client.getStatus().analysis, null);
  } finally {
    fake.restore();
  }
});

/* ================================================================== *
 * runMomentCurvature — løkka «Run all» bygger på
 * ================================================================== */

test('runMomentCurvature: ett kall per planpunkt, med uendret fortegn på mc_chi', async () => {
  const fake = installFakeWorker({ chiPlan: [1e-6, 2e-6, 3e-6] });
  try {
    const client = createSolverClient();
    const res = await client.runMomentCurvature(
      payloadWith([{ id: 'K1', N_Ed: 0, M_Ed: -2e8, theta: Math.PI }], 'moment_curvature'),
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.moment_curvature.kappa, [1e-6, 2e-6, 3e-6]);
    assert.equal(res.moment_curvature.truncated, false);
    const chis = fake.sent.filter((s) => s.type === 'run').map((s) => s.payload.options.mc_chi);
    // Sonden først, så planen UENDRET — motoren tar `mc_chi` som en STØRRELSE
    // og setter fortegnet selv ut fra θ.
    assert.deepEqual(chis.slice(1), [1e-6, 2e-6, 3e-6]);
  } finally {
    fake.restore();
  }
});

test('runMomentCurvature: samme advarselkode på to kombinasjoner overlever som to', async () => {
  // Etter endringsrunde 4 skjær-løser M–κ ALLE kombinasjoner, så to rader kan gi
  // samme kode. En dedupe på kode alene stilnet den andre raden.
  const chiPlan = [1e-6, 2e-6];
  const fake = installFakeWorker({
    script: (payload, n) => engineResult('moment_curvature', {
      chiPlan,
      chi: payload.options.mc_chi,
      warnings: [{ code: 'asw_below_minimum', severity: 'warning', combo: n === 2 ? 'K2' : 'K1' }],
    }),
  });
  try {
    const client = createSolverClient();
    const res = await client.runMomentCurvature(
      payloadWith([{ id: 'K1', N_Ed: 0, M_Ed: 2e8, theta: 0 }], 'moment_curvature'),
    );
    const asw = res.warnings.filter((w) => w.code === 'asw_below_minimum');
    assert.deepEqual(asw.map((w) => w.combo), ['K1', 'K2'], JSON.stringify(res.warnings));
  } finally {
    fake.restore();
  }
});

test('runMomentCurvature: avbrudd beholder punktene som er regnet og merker kurven', async () => {
  const fake = installFakeWorker({ chiPlan: [1e-6, 2e-6, 3e-6, 4e-6] });
  try {
    const client = createSolverClient();
    let done = 0;
    const res = await client.runMomentCurvature(
      payloadWith([{ id: 'K1', N_Ed: 0, M_Ed: 2e8, theta: 0 }], 'moment_curvature'),
      { onProgress: (p) => { done = p.done; }, isCancelled: () => done >= 2 },
    );
    assert.equal(res.ok, true);
    assert.equal(res.moment_curvature.kappa.length, 2);
    assert.equal(res.moment_curvature.truncated, true);
    const w = res.warnings.find((x) => x.code === 'mc_truncated');
    assert.match(w.detail, /avbrutt av bruker etter 2 av 4/);
  } finally {
    fake.restore();
  }
});
