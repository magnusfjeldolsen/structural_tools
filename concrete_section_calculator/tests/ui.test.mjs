/**
 * ui.test.mjs — de RENE strengbyggerne i `ui.js`.
 *
 * HVORFOR DENNE FILA FINNES
 * `ui.js` er DOM-bundet og kan ikke kjøres i `node --test` som helhet. Men
 * funksjonene som testes her rører ikke DOM-en — de leser bare `result` — og
 * det er nettopp der endringsrunde 5 fant en feil som hadde levd usett:
 * `governingLabel` slo opp `governing`/`combinations` på TOPPNIVÅ, mens
 * motoren legger dem i analyseblokka (`engine.py:1299-1301`). Den returnerte
 * derfor alltid `null`, og merkelappen «governing ULS 2» har aldri stått i
 * grensesnittet. Ingen test kunne nå den så lenge funksjonen lå inne i
 * `createUI`.
 *
 * `slsSection`/`slsSummarySuffix` (spec §6.2) følger nøyaktig samme mønster:
 * rene strengbyggere, flyttet UT av `createUI` for at nettopp denne fila kan
 * teste innholdet uten en nettleser. Selve MONTERINGEN i `renderResult()` —
 * at kortet faktisk havner i DOM-en på rett sted, og at `#sls-derivation`
 * husker om den var åpen — verifiseres i nettleseren, som resten av `ui.js`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { governingLabel, shearBadge, shearPanel, slsSection, slsSummarySuffix } from '../js/ui.js';

/** Én kombinasjonsrad slik motoren gir den, med skjærblokka fra §4.2. */
const combo = (patch = {}) => ({
  id: 'C1',
  name: 'ULS 1',
  utilisation: 0.81,
  within_limits: true,
  shear: {
    evaluated: true,
    V_Ed: 180000,
    V_Rd: 210000,
    V_Rd_c: 95000,
    V_Rd_s: 210000,
    V_Rd_max: 640000,
    governing_mode: 'stirrups',
    utilisation: 0.857,
    Asl: 942.5,
    d: 547,
    bw: 300,
    z: 492.3,
    asw_s: 0.6702,
    asw_s_min: 0.2629,
    asw_s_required: 0.5,
    sl_max: 410.2,
    st_max: 410.2,
  },
  ...patch,
});

/**
 * Et resultat med analyseblokka på riktig plass. `analysis` og nøkkelen MÅ
 * være det samme navnet — det er hele poenget med `analysisBlock`.
 */
const resultFor = (analysis, blockPatch = {}) => ({
  ok: true,
  analysis,
  [analysis]: {
    M_Rd: 3.2e8,
    M_Ed: 2.6e8,
    utilisation: 0.81,
    combinations: [combo(), combo({ id: 'C2', name: 'ULS 2' })],
    governing: 'C1',
    shear_governing: 'C2',
    ...blockPatch,
  },
});

const ANALYSES = ['bending', 'moment_curvature', 'nm_domain'];

/* ---------------- governingLabel ---------------- */

for (const analysis of ANALYSES) {
  test(`governingLabel leser ANALYSEBLOKKA, ikke toppnivå — ${analysis}`, () => {
    // Feilet før endringsrunde 5: funksjonen leste `result.governing`, som
    // motoren aldri har satt, og svarte `null` for alle tre analysene.
    assert.equal(governingLabel(resultFor(analysis)), 'ULS 1 (C1)');
  });
}

test('governingLabel faller tilbake på id-en når raden ikke har navn', () => {
  const r = resultFor('bending', { combinations: [combo({ name: '' })], governing: 'C1' });
  assert.equal(governingLabel(r), 'C1');
});

test('governingLabel er null når INGEN kombinasjon var innenfor [N_min, N_max]', () => {
  // `governing: null` betyr at toppnivåfeltene er hentet fra den første raden,
  // men at ingen er dimensjonerende. Da skal det ikke stå et navn der.
  assert.equal(governingLabel(resultFor('bending', { governing: null })), null);
  assert.equal(governingLabel(null), null);
  assert.equal(governingLabel({ ok: true, analysis: 'bending' }), null);
});

/* ---------------- skjærmerket ---------------- */

for (const analysis of ANALYSES) {
  test(`skjærmerket vises uansett analyse — ${analysis}`, () => {
    // Motoren fyller `shear` i ALLE tre analyseblokkene. Panelet og merket
    // skal derfor ikke kunne forsvinne fordi brukeren valgte M–κ.
    const html = shearBadge(resultFor(analysis));
    assert.match(html, /η<sub>V<\/sub>/, 'merket skal ha sin EGEN etikett');
    assert.match(html, /0\.86/, 'η_V = 0,857 avrundet til to desimaler');
    assert.match(html, /ULS 2/, 'skjær kan styres av en HELT annen rad enn bøying');
  });
}

test('skjærmerket er ALDRI slått sammen med η_M — to spørsmål, to tall', () => {
  const html = shearBadge(resultFor('bending'));
  assert.ok(!html.includes('M_Ed / M_Rd'), 'bøyeetiketten hører ikke hjemme i skjærmerket');
  // Bøyeutnyttelsen er 0,81 og skjærutnyttelsen 0,857 — merket skal vise den
  // SISTE. Står 0,81 her, er de to slått sammen.
  assert.ok(!html.includes('0.81'));
});

test('skjærmerket uteblir helt når ingen kombinasjon fikk skjær evaluert', () => {
  // En eldre fixtur uten `section.shear` i payloaden skal ikke gi et oppdiktet
  // merke med en tom verdi.
  assert.equal(shearBadge(resultFor('bending', { shear_governing: null })), '');
});

/* ---------------- skjærpanelet ---------------- */

for (const analysis of ANALYSES) {
  test(`skjærpanelet viser V_Rd-tallene og grensene — ${analysis}`, () => {
    const html = shearPanel(resultFor(analysis));
    for (const needle of ['V<sub>Ed</sub>', 'V<sub>Rd</sub>', 'V<sub>Rd,c</sub>',
      'V<sub>Rd,s</sub>', 'V<sub>Rd,max</sub>', 'A<sub>sw</sub>/s',
      's<sub>l,max</sub>', 's<sub>t,max</sub>']) {
      assert.ok(html.includes(needle), `mangler ${needle}`);
    }
    assert.match(html, /Stirrups govern/, 'styrende mode skal stå med ord, ikke som kode');
    assert.match(html, /never added/, 'V_Rd,c legges ALDRI til V_Rd,s (EC2 6.2.3(2))');
  });
}

test('skjærpanelet sier én ærlig setning når skjær ikke kunne regnes', () => {
  const r = resultFor('bending', {
    combinations: [combo({ id: 'C2', name: 'ULS 2', shear: { evaluated: false } })],
    shear_governing: 'C2',
  });
  const html = shearPanel(r);
  assert.match(html, /No shear capacity could be evaluated/);
  assert.ok(!html.includes('V<sub>Rd,max</sub>'), 'ingen tom tabell med oppdiktede rader');
});

/* ================================================================== *
 * Serviceability (SLS) — spec §6.2, §4
 *
 * Samme AC-tallene som `results.test.mjs`/`report.test.mjs` bruker, bygd i
 * kode av samme grunn (spec §0.6: fixturene regenereres BARE av
 * koordinatoren).
 * ================================================================== */

const AC3_ROW_UI = {
  id: 'C1', name: 'Characteristic 1', type: 'characteristic',
  N_Ed: 0, M_Ed: -120e6,
  sigma_ct_uncracked: 6.102077, cracked: true,
  Ec_used: 32836.568031, n_sec: 6.090770503,
  state: { x: 127.201637, sigma_c: -12.390138, sigma_s_max: 250.835483, layers: [] },
  state_reason: null,
  sigma_c_initial: null, sigma_c_initial_reason: null,
  stress: {
    sigma_c: -12.390138, sigma_c_limit: 18.0, sigma_c_util: 0.688341, sigma_c_ok: true,
    sigma_c_checked: 'state',
    sigma_s: 250.835483, sigma_s_limit: 400.0, sigma_s_util: 0.627089, sigma_s_ok: true,
  },
  crack: null, crack_reason: 'not_quasi_permanent',
};

const AC1_ROW_UI = {
  id: 'C2', name: 'Quasi-permanent 1', type: 'quasi_permanent',
  N_Ed: 0, M_Ed: -100e6,
  sigma_ct_uncracked: 5.085064, cracked: true,
  Ec_used: 10945.522677, n_sec: 18.272312,
  state: { x: 200.355056, sigma_c: -6.886016, sigma_s_max: 219.577827, layers: [] },
  state_reason: null,
  sigma_c_initial: -10.325115, sigma_c_initial_reason: null,
  stress: {
    sigma_c: -10.325115, sigma_c_limit: 13.5, sigma_c_util: 0.764823, sigma_c_ok: true,
    sigma_c_checked: 'initial',
    sigma_s: null, sigma_s_limit: null, sigma_s_util: null, sigma_s_ok: null,
  },
  crack: {
    h_c_eff: 125.0, h_c_eff_governing: '2.5(h-d)',
    eps_sm_eps_cm: 8.321121e-4, eps_governing: 'equation',
    sr_max: 271.281702, sr_max_branch: 'close',
    w_k: 0.225737, w_max: 0.3, utilisation: 0.752457, ok: true, ok_reason: null,
  },
  crack_reason: null,
};

const AC14_ROW_UI = {
  ...AC1_ROW_UI,
  id: 'C3', name: 'Quasi-permanent 2 (XD3)',
  crack: { ...AC1_ROW_UI.crack, w_max: null, utilisation: null, ok: null, ok_reason: 'no_crack_width_limit' },
};

const AC8A_ROW_UI = {
  id: 'C4', name: 'Quasi-permanent 3', type: 'quasi_permanent',
  N_Ed: 800e3, M_Ed: -100e6,
  sigma_ct_uncracked: 9.077837, cracked: true,
  Ec_used: 10945.522677, n_sec: 18.272312,
  state: null, state_reason: 'no_equilibrium_cracked',
  sigma_c_initial: null, sigma_c_initial_reason: 'no_equilibrium_cracked',
  stress: null, crack: null, crack_reason: 'no_equilibrium_cracked',
};

function slsResultUI(rows, checksOverrides = {}) {
  return {
    ok: true,
    sls: {
      phi_ef: 2.0, Ecm: 32836.568031, Ec_eff: 10945.522677, alpha_e: 6.090770503,
      f_ct_eff: 2.896468, exposure_class: 'XC3',
      w_max: 0.3, w_max_source: 'class', w_max_reason: null,
      limits: {
        sigma_c_char_factor: 0.6, sigma_c_char: 18.0,
        sigma_c_qp_factor: 0.45, sigma_c_qp: 13.5,
        sigma_s_char_factor: 0.8, sigma_s_char: 400.0,
        sigma_c_char_required: true,
      },
      rows,
      checks: { sigma_c_char_ok: true, sigma_s_char_ok: true, sigma_c_qp_ok: true, crack_width_ok: false },
      not_applicable: {},
      all_ok: false,
      ...checksOverrides,
    },
  };
}

test('slsSection: «» uten result.sls — ingen kort, ingen ekstra kostnad (spec §0.1)', () => {
  assert.equal(slsSection({ ok: true }), '');
  assert.equal(slsSection(null), '');
  assert.equal(slsSection(undefined), '');
});

test('slsSection: hver rad viser type, M_Ed og de tre grenvalgene FREMHEVET, ikke gjemt (spec §6.2/§3.3)', () => {
  const html = slsSection(slsResultUI([AC1_ROW_UI]));
  assert.match(html, /Quasi-permanent 1/);
  assert.match(html, /<b>125\.00<\/b>.*<b>2\.5\(h-d\)<\/b>/, 'h_c,eff-grenen');
  assert.match(html, /<b>close<\/b>/, 's_r,max-grenen');
  assert.match(html, /id="sls-derivation"/, 'DISCLOSURE-mønsteret, spec §6.2');
});

test('slsSection: en rad UTEN tilstand viser grunnen i klartekst, ikke en rekke tankestreker', () => {
  const html = slsSection(slsResultUI([AC8A_ROW_UI]));
  assert.match(html, /no equilibrium/i);
  // Ingen σ_c/σ_s-verdi skal late som den ble regnet for denne raden.
  assert.doesNotMatch(html, /σ<sub>c<\/sub> -?\d/, 'ingen σ_c-tall uten en tilstand');
});

test('slsSection: checks bruker samme hake/kryss/strek som ULS, not_applicable har GRUNN uten symbol (spec §10)', () => {
  const html = slsSection(slsResultUI([AC3_ROW_UI], {
    checks: { sigma_c_char_ok: true, sigma_s_char_ok: true },
    not_applicable: { crack_width_ok: 'no quasi-permanent load combination is present' },
  }));
  assert.match(html, /Concrete stress under characteristic load/);
  assert.match(html, /no quasi-permanent load combination is present/);
});

test('slsSection: AC14 — crack er FYLT med w_k selv når w_max/ok er null (spec §9, §3.5)', () => {
  const html = slsSection(slsResultUI([AC14_ROW_UI]));
  assert.match(html, /0\.2257/, 'w_k skal stå i sammendragslinja');
  assert.match(html, /no recommended crack width limit/i);
});

test('slsSummarySuffix: «· w_k 0.21/0.30 mm» med grense, ingenting uten en regnet rissvidde (spec §6.2)', () => {
  assert.equal(slsSummarySuffix(slsResultUI([AC1_ROW_UI])), ' · w<sub>k</sub> 0.23/0.30 mm');
  assert.equal(slsSummarySuffix(slsResultUI([AC3_ROW_UI])), '', 'ingen rissvidde regnet — ingenting, ikke DASH');
  assert.equal(slsSummarySuffix({ ok: true }), '');
});

test('slsSummarySuffix: uten w_max (f.eks. XD3) blir det bare «· w_k … mm», ingen skråstrek', () => {
  assert.equal(slsSummarySuffix(slsResultUI([AC14_ROW_UI])), ' · w<sub>k</sub> 0.23 mm');
});

test('slsSection/slsSummarySuffix: ingen norsk tekst i noen av grenene', () => {
  const NORDIC = /[æåÆÅø]/;
  const NORWEGIAN_WORDS = /\b(ikke|kapasitet|armering|tverrsnitt|beregning|utnyttelse|bjelke|krumning|overdekning)\b/i;
  for (const row of [AC3_ROW_UI, AC1_ROW_UI, AC14_ROW_UI, AC8A_ROW_UI]) {
    const html = slsSection(slsResultUI([row]));
    assert.doesNotMatch(html, NORDIC, `rad ${row.id}`);
    assert.doesNotMatch(html, NORWEGIAN_WORDS, `rad ${row.id}`);
  }
});
