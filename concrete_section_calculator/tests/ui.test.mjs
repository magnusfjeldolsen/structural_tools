/**
 * ui.test.mjs — de RENE strengbyggerne i `ui.js`.
 *
 * HVORFOR DENNE FILA FINNES
 * `ui.js` er DOM-bundet og kan ikke kjøres i `node --test` som helhet. Men de
 * tre funksjonene her rører ikke DOM-en — de leser bare `result` — og det er
 * nettopp der endringsrunde 5 fant en feil som hadde levd usett: `governingLabel`
 * slo opp `governing`/`combinations` på TOPPNIVÅ, mens motoren legger dem i
 * analyseblokka (`engine.py:1299-1301`). Den returnerte derfor alltid `null`, og
 * merkelappen «governing ULS 2» har aldri stått i grensesnittet. Ingen test
 * kunne nå den så lenge funksjonen lå inne i `createUI`.
 *
 * Resten av `ui.js` verifiseres i nettleseren (`tests/browser-verify.mjs`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { governingLabel, shearBadge, shearPanel } from '../js/ui.js';

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
