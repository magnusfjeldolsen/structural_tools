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

const base = {
  seismicClass: 'II', gammaI: null, agR: 0.45, spectrumType: '2', groundType: 'A',
  q: 1.5, life: 50, sdMethod: 'none', ctMethod: 'concrete', Ct: 0.075, h: 20,
  T1Modal: null, SdModal: null, noStiffnessReduction: false, soilStiffnessBounds: false
};
const ctx = over => ({
  result: compute({ ...base, ...over }),
  location: { fromTable: true, kommune: 'Ålesund', nr: '1507', agR: 0.45 },
  project: { project: 'Testprosjekt <&>', projectNo: '5071.304', author: 'MFO' },
  notes: 'Grunntype fra RIG-notat.',
  generatedAt: new Date(2026, 9, 26, 12, 0)
});

const cases = {
  'Ålesund, ingen Sd': {},
  forenklet: { sdMethod: 'simplified' },
  'forenklet, h > 40': { sdMethod: 'simplified', h: 60 },
  'modal T1': { sdMethod: 'modalT1', T1Modal: 0.6, noStiffnessReduction: true, soilStiffnessBounds: true },
  'modal Sd uten avkrysning': { sdMethod: 'modalSd', SdModal: 0.4 },
  'klasse IIIb': { seismicClass: 'IIIb', agR: 1.0 },
  'type 1, grunntype D': { spectrumType: '1', groundType: 'D', agR: 1.2, q: 2.0, sdMethod: 'simplified' }
};

for (const [name, over] of Object.entries(cases)) {
  for (const kind of ['spectrum', 'avoidance']) {
    test(`${kind}: ${name}`, () => {
      const html = buildReport(kind, ctx(over));
      assert.doesNotMatch(html, /undefined|NaN|\[object/);
      assert.match(html, /NS-EN 1998-1:2004\+A1:2013\+NA:2021/);
      assert.match(html, /Tabell NA\.4\(901\)/);
      assert.match(html, /Tabell NA\.3\.2, kommune 1507/);
      assert.match(html, /Testprosjekt &lt;&amp;&gt;/, 'brukertekst skal escapes');
      assert.equal((html.match(/class="report-page"/g) || []).length, 1);
      if (kind === 'spectrum') {
        assert.match(html, /\(3\.13\)[\s\S]*\(3\.16\)/);
        assert.match(html, /Tabell 3\.[23] \(anbefalte verdier\)/);
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

test('klasse IV uten γI gir en feilside, ikke tall', () => {
  const html = buildReport('spectrum', ctx({ seismicClass: 'IV' }));
  assert.match(html, /Rapport kan ikke lages/);
  assert.doesNotMatch(html, /NaN/);
});
