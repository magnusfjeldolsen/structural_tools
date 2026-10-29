/**
 * report.test.mjs — begge rapportene bygges uten DOM for et spenn av tilfeller,
 * og skal aldri lekke `undefined`/`NaN` eller miste en tabellhenvisning.
 * Om innholdet får plass på én A4-side kan bare nettleseren svare på; det
 * sjekkes i forhåndsvisningen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../js/ec8-core.js';
import { buildReport } from '../js/report.js';

// Oppdiktede testverdier, ikke verdier fra NS-EN 1998-1 / NA.
const base = {
  seismicClass: 'II', gammaI: 1.0, agR: 0.5, spectrumType: '2', groundType: 'A',
  S: 1.2, TB: 0.1, TC: 0.3, TD: 1.5, q: 1.5, beta: 0.25, life: 50,
  limits: { agS: 0.6, ag: 0.4, life: 3, Sd: 0.7, qMax: 1.6 },
  sdMethod: 'none', Ct: 0.06, h: 20,
  T1Modal: null, SdModal: null, noStiffnessReduction: false, soilStiffnessBounds: false
};
const ctx = over => ({
  result: compute({ ...base, ...over }),
  place: 'Testby <1234>',
  project: { project: 'Testprosjekt <&>', projectNo: '5071.304', author: 'MFO' },
  notes: 'Grunntype fra RIG-notat.',
  generatedAt: new Date(2026, 9, 26, 12, 0)
});

const cases = {
  'ingen Sd': {},
  forenklet: { sdMethod: 'simplified' },
  'forenklet, h > 40': { sdMethod: 'simplified', h: 60 },
  'modal T1': { sdMethod: 'modalT1', T1Modal: 0.6, noStiffnessReduction: true, soilStiffnessBounds: true },
  'modal Sd uten avkrysning': { sdMethod: 'modalSd', SdModal: 0.4 },
  'klasse IIIb': { seismicClass: 'IIIb', agR: 1.0 },
  'type 1, grunntype D': { spectrumType: '1', groundType: 'D', agR: 1.2, q: 2.0, sdMethod: 'simplified' },
  'grenser ikke oppgitt': { limits: {} }
};

for (const [name, over] of Object.entries(cases)) {
  for (const kind of ['spectrum', 'avoidance']) {
    test(`${kind}: ${name}`, () => {
      const html = buildReport(kind, ctx(over));
      assert.doesNotMatch(html, /undefined|NaN|\[object/);
      assert.match(html, /NS-EN 1998-1:2004\+A1:2013\+NA:2021/);
      assert.match(html, /Oppgitt, jf\. Tabell NA\.4\(901\)/);
      assert.match(html, /Oppgitt, jf\. Tabell NA\.3\.2/);
      assert.match(html, /verktøyet inneholder ingen verdier fra standarden/);
      assert.match(html, /Testprosjekt &lt;&amp;&gt;/, 'brukertekst skal escapes');
      assert.match(html, /Testby &lt;1234&gt;/);
      assert.equal((html.match(/class="report-page"/g) || []).length, 1);
      if (kind === 'spectrum') {
        assert.match(html, /\(3\.13\)[\s\S]*\(3\.16\)/);
        assert.match(html, /Oppgitt, jf\. 3\.2\.2\.2 med NA/);
      } else {
        assert.match(html, /NA\.3\.2\.1\(5\)/);
        assert.equal((html.match(/<tr class="st-/g) || []).length, 5);
      }
    });
  }
}

test('konklusjon i kriterierapporten følger resultatet', () => {
  assert.match(buildReport('avoidance', ctx({})), /Utelatelseskriteriet er oppfylt/);
  assert.match(buildReport('avoidance', ctx({ agR: 2.0 })), /Utelatelseskriteriet er ikke oppfylt/);
  assert.match(buildReport('avoidance', ctx({ seismicClass: 'IIIb' })), /gjelder bare klasse I–IIIa/);
});

test('manglende verdier gir en feilside, ikke tall', () => {
  const html = buildReport('spectrum', ctx({ seismicClass: 'IV', gammaI: null }));
  assert.match(html, /Rapport kan ikke lages/);
  assert.match(html, /Oppgi γI/);
  assert.doesNotMatch(html, /NaN/);
});
