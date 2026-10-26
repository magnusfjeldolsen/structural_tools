/**
 * ec8-core.test.mjs — beregningskjernen i seismic_ec8.
 *
 * Fasit nr. 1 er Ålesund-arket i seismic_design_criteria_checker/Utelatelseskriterie.pdf:
 * klasse II, grunntype A, agR = 0,45 → ag·S = 0,45 ≤ 0,50 → utelatelse oppfylt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, designSd, spectrumCurve, simplifiedT1, spectrumParams } from '../js/ec8-core.js';
import { SEISMIC_CLASSES } from '../js/ec8-data.js';

const base = {
  seismicClass: 'II', gammaI: null, agR: 0.45, spectrumType: '2', groundType: 'A',
  q: 1.5, life: 50, sdMethod: 'none', ctMethod: 'concrete', Ct: null, h: 20,
  T1Modal: null, SdModal: null, noStiffnessReduction: false, soilStiffnessBounds: false
};
const run = over => compute({ ...base, ...over });
const status = (r, id) => r.criteria.find(c => c.id === id).status;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('Ålesund-arket: kriterium 2 oppfylt, de andre ikke, utelatelse oppfylt', () => {
  const r = run({});
  close(r.gammaI, 1.0);
  close(r.ag, 0.45);
  close(r.spectrum.agS, 0.45);
  assert.equal(status(r, 1), 'not_met');
  assert.equal(status(r, 2), 'met');
  assert.equal(status(r, 3), 'not_met');
  assert.equal(status(r, 4), 'not_met');
  assert.equal(status(r, 5), 'not_evaluated');
  assert.equal(r.conclusion, 'avoided');
});

test('γI følger Tabell NA.4(901)', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SEISMIC_CLASSES).map(([k, v]) => [k, v.gammaI])),
    { I: 0.70, II: 1.00, IIIa: 1.25, IIIb: 1.70, IV: null }
  );
});

test('IIIb og IV: utelatelseskriteriene gjelder ikke, påvisning kreves', () => {
  for (const seismicClass of ['IIIb', 'IV']) {
    const r = run({ seismicClass, gammaI: seismicClass === 'IV' ? 2.0 : null, agR: 0.05 });
    assert.equal(r.conclusion, 'required', seismicClass);
    assert.ok(r.criteria.every(c => c.status === 'not_applicable'), seismicClass);
  }
});

test('klasse IV uten oppgitt γI gir feilmelding, ikke et tall', () => {
  const r = run({ seismicClass: 'IV' });
  assert.equal(r.conclusion, 'invalid');
  assert.match(r.errors.join(' '), /γI/);
});

test('γI overstyrt av bruker merkes som ikke-tabellverdi', () => {
  const r = run({ gammaI: 1.1 });
  close(r.ag, 0.495);
  assert.equal(r.gammaIFromTable, false);
  assert.equal(run({}).gammaIFromTable, true);
});

test('grenseverdier treffes uten flyttallsfeil', () => {
  // 0,25 · 1,25 · ... : agR slik at ag·S er nøyaktig 0,50 i desimal
  const r = run({ agR: 0.5, groundType: 'A' });
  assert.equal(status(r, 2), 'met');
  const r2 = run({ agR: 0.3, seismicClass: 'II', groundType: 'B' });
  assert.equal(status(r2, 3), 'met');
});

test('designSd: grenene (3.13)–(3.16) henger sammen i TB, TC og TD', () => {
  const p = spectrumParams('2', 'B');
  const sp = { ag: 1.0, ...p, q: 1.5, beta: 0.2 };
  close(designSd(0, sp).Sd, 1.0 * 1.35 * 2 / 3);
  close(designSd(p.TB, sp).Sd, 1.35 * 2.5 / 1.5);
  close(designSd(p.TC, sp).Sd, 1.35 * 2.5 / 1.5);
  close(designSd(p.TC + 1e-12, sp).Sd, designSd(p.TC, sp).Sd, 1e-9);
  close(designSd(p.TD, sp).Sd, designSd(p.TD + 1e-12, sp).Sd, 1e-9);
  assert.equal(designSd(0.1, sp).eq, '3.14');
  assert.equal(designSd(1.0, sp).eq, '3.15');
  assert.equal(designSd(2.0, sp).eq, '3.16');
});

test('designSd: nedre grense β·ag', () => {
  const sp = { ag: 1.0, ...spectrumParams('2', 'A'), q: 4.0, beta: 0.2 };
  const r = designSd(4.0, sp);
  close(r.Sd, 0.2);
  assert.equal(r.floored, true);
});

test('spectrumCurve tar med knekkpunktene eksakt', () => {
  const sp = { ag: 1.0, ...spectrumParams('2', 'C'), q: 1.5, beta: 0.2 };
  const Ts = spectrumCurve(sp, 4).map(p => p.T);
  for (const T of [0, sp.TB, sp.TC, sp.TD, 4]) assert.ok(Ts.includes(T), `mangler ${T}`);
  assert.deepEqual(Ts, [...Ts].sort((a, b) => a - b));
});

test('forenklet metode: T1 = Ct·h^0,75 og Sd(T1) fra spekteret', () => {
  const r = run({ sdMethod: 'simplified', h: 20, agR: 1.0, groundType: 'B' });
  close(r.sd.T1, simplifiedT1(0.075, 20));
  close(r.sd.T1, 0.075 * Math.pow(20, 0.75));
  assert.equal(r.sd.valid, true);
  assert.equal(status(r, 5), r.sd.Sd <= 0.5 ? 'met' : 'not_met');
});

test('forenklet metode med h > 40 m vurderes ikke', () => {
  const r = run({ sdMethod: 'simplified', h: 45, agR: 0.1 });
  assert.equal(r.sd.valid, false);
  assert.equal(status(r, 5), 'not_evaluated');
  assert.match(r.sd.notes.join(' '), /40 m/);
});

test('q > 1,5: Sd-kriteriet vurderes ikke', () => {
  const r = run({ sdMethod: 'simplified', q: 2.0, agR: 0.1 });
  assert.equal(r.sd.conditions.find(c => c.key === 'q').ok, false);
  assert.equal(status(r, 5), 'not_evaluated');
});

test('modalanalyse: Sd teller bare når begge betingelsene er bekreftet', () => {
  const over = { sdMethod: 'modalSd', SdModal: 0.42, agR: 0.8, groundType: 'C' };
  const without = run(over);
  assert.equal(status(without, 5), 'not_evaluated');
  assert.equal(without.conclusion, 'required');

  const withBoth = run({ ...over, noStiffnessReduction: true, soilStiffnessBounds: true });
  assert.equal(status(withBoth, 5), 'met');
  assert.equal(withBoth.conclusion, 'avoided');

  const tooHigh = run({ ...over, SdModal: 0.51, noStiffnessReduction: true, soilStiffnessBounds: true });
  assert.equal(status(tooHigh, 5), 'not_met');
});

test('modalanalyse med T1: Sd leses av spekteret', () => {
  const r = run({ sdMethod: 'modalT1', T1Modal: 0.8, agR: 0.8, noStiffnessReduction: true, soilStiffnessBounds: true });
  const sp = { ag: 0.8, ...spectrumParams('2', 'A'), q: 1.5, beta: 0.2 };
  close(r.sd.Sd, designSd(0.8, sp).Sd);
  assert.equal(r.sd.eq, '3.15');
});

test('brukstid ≤ 2 år oppfyller kriterium 4', () => {
  const r = run({ life: 2, agR: 2.0 });
  assert.equal(status(r, 4), 'met');
  assert.equal(r.conclusion, 'avoided');
});
