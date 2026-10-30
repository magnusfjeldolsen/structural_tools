/**
 * ec8-core.test.mjs — beregningskjernen i seismic_ec8.
 *
 * Tallene her er oppdiktede testverdier, ikke verdier fra NS-EN 1998-1 / NA:
 * kjernen skal regne riktig med hva brukeren enn taster inn.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, designSd, spectrumCurve, simplifiedT1, enSpectrum } from '../js/ec8-core.js';

const SPECTRUM = { S: 1.2, TB: 0.1, TC: 0.3, TD: 1.5 };
const LIMITS = { agS: 0.6, ag: 0.4, life: 3, Sd: 0.7, qMax: 1.6 };

const base = {
  seismicClass: 'II', gammaI: 1.0, agR: 0.5, spectrumType: '2', groundType: 'A',
  ...SPECTRUM, q: 1.5, beta: 0.25, life: 50, limits: LIMITS,
  sdMethod: 'none', Ct: 0.06, h: 20,
  T1Modal: null, SdModal: null, noStiffnessReduction: false, soilStiffnessBounds: false
};
const run = over => compute({ ...base, ...over });
const status = (r, id) => r.criteria.find(c => c.id === id).status;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const sp = (over = {}) => ({ ag: 1.0, ...SPECTRUM, q: 1.5, beta: 0.25, ...over });

test('ag·S under grensen: kriterium 2 oppfylt, utelatelse oppfylt', () => {
  const r = run({});
  close(r.ag, 0.5);
  close(r.spectrum.agS, 0.6);
  assert.equal(status(r, 1), 'not_met');
  assert.equal(status(r, 2), 'met');
  assert.equal(status(r, 3), 'not_met');
  assert.equal(status(r, 4), 'not_met');
  assert.equal(status(r, 5), 'not_evaluated');
  assert.equal(r.conclusion, 'avoided');
});

test('ag = agR·γI', () => {
  close(run({ gammaI: 1.3 }).ag, 0.65);
});

test('manglende tabellverdier gir feilmelding som lister dem, ikke tall', () => {
  const r = run({ agR: null, gammaI: null, S: null, beta: null });
  assert.equal(r.conclusion, 'invalid');
  assert.deepEqual(r.missing, ['agR', 'γI', 'S', 'β']);
  assert.match(r.errors[0], /Oppgi agR, γI, S, β/);
  assert.deepEqual(r.criteria, []);
});

test('periodene må komme i rekkefølgen TB < TC < TD', () => {
  const r = run({ TB: 0.4, TC: 0.3 });
  assert.equal(r.conclusion, 'invalid');
  assert.match(r.errors.join(' '), /TB < TC < TD/);
});

test('grense som ikke er oppgitt gir «ikke vurdert», ikke «nei»', () => {
  const r = run({ limits: { ...LIMITS, agS: null } });
  assert.equal(status(r, 2), 'not_evaluated');
  assert.equal(r.criteria.find(c => c.id === 2).limit, 'ikke oppgitt');
  assert.equal(r.conclusion, 'required');
});

test('IIIb og IV: utelatelseskriteriene gjelder ikke, påvisning kreves', () => {
  for (const seismicClass of ['IIIb', 'IV']) {
    const r = run({ seismicClass, agR: 0.05 });
    assert.equal(r.conclusion, 'required', seismicClass);
    assert.ok(r.criteria.every(c => c.status === 'not_applicable'), seismicClass);
  }
});

test('grenseverdier treffes uten flyttallsfeil', () => {
  // 0,5 · 1,2 = 0,6000000000000001 i flyttall
  assert.equal(status(run({}), 2), 'met');
  assert.equal(status(run({ agR: 0.4 }), 3), 'met');
});

test('designSd: grenene (3.13)–(3.16) henger sammen i TB, TC og TD', () => {
  const p = sp();
  close(designSd(0, p).Sd, 1.2 * 2 / 3);
  close(designSd(p.TB, p).Sd, 1.2 * 2.5 / 1.5);
  close(designSd(p.TC, p).Sd, 1.2 * 2.5 / 1.5);
  close(designSd(p.TC + 1e-12, p).Sd, designSd(p.TC, p).Sd, 1e-9);
  close(designSd(p.TD, p).Sd, designSd(p.TD + 1e-12, p).Sd, 1e-9);
  assert.equal(designSd(0.2, p).eq, '3.14');
  assert.equal(designSd(1.0, p).eq, '3.15');
  assert.equal(designSd(2.0, p).eq, '3.16');
});

test('designSd: nedre grense β·ag', () => {
  const r = designSd(4.0, sp({ q: 4.0 }));
  close(r.Sd, 0.25);
  assert.equal(r.floored, true);
});

test('spectrumCurve tar med knekkpunktene eksakt', () => {
  const p = sp({ TB: 0.13, TC: 0.37, TD: 1.73 });
  const Ts = spectrumCurve(p, 4).map(pt => pt.T);
  for (const T of [0, p.TB, p.TC, p.TD, 4]) assert.ok(Ts.includes(T), `mangler ${T}`);
  assert.deepEqual(Ts, [...Ts].sort((a, b) => a - b));
});

test('forenklet metode: T1 = Ct·h^0,75 og Sd(T1) fra spekteret', () => {
  const r = run({ sdMethod: 'simplified', h: 20 });
  close(r.sd.T1, simplifiedT1(0.06, 20));
  close(r.sd.T1, 0.06 * Math.pow(20, 0.75));
  assert.equal(r.sd.valid, true);
  assert.equal(status(r, 5), r.sd.Sd <= 0.7 ? 'met' : 'not_met');
});

test('forenklet metode uten Ct vurderes ikke', () => {
  const r = run({ sdMethod: 'simplified', Ct: null });
  assert.equal(status(r, 5), 'not_evaluated');
  assert.match(r.sd.notes.join(' '), /Ct og h/);
});

test('forenklet metode med h > 40 m vurderes ikke', () => {
  const r = run({ sdMethod: 'simplified', h: 45, agR: 0.1 });
  assert.equal(r.sd.valid, false);
  assert.equal(status(r, 5), 'not_evaluated');
  assert.match(r.sd.notes.join(' '), /40 m/);
});

test('q over grensen, eller grensen ikke oppgitt: Sd-kriteriet vurderes ikke', () => {
  const high = run({ sdMethod: 'simplified', q: 2.0, agR: 0.1 });
  assert.equal(high.sd.conditions.find(c => c.key === 'q').ok, false);
  assert.equal(status(high, 5), 'not_evaluated');

  const noLimit = run({ sdMethod: 'simplified', agR: 0.1, limits: { ...LIMITS, qMax: null } });
  assert.equal(status(noLimit, 5), 'not_evaluated');
});

test('modalanalyse: Sd teller bare når begge betingelsene er bekreftet', () => {
  const over = { sdMethod: 'modalSd', SdModal: 0.65, agR: 2.0, groundType: 'C' };
  const without = run(over);
  assert.equal(status(without, 5), 'not_evaluated');
  assert.equal(without.conclusion, 'required');

  const withBoth = run({ ...over, noStiffnessReduction: true, soilStiffnessBounds: true });
  assert.equal(status(withBoth, 5), 'met');
  assert.equal(withBoth.conclusion, 'avoided');

  const tooHigh = run({ ...over, SdModal: 0.71, noStiffnessReduction: true, soilStiffnessBounds: true });
  assert.equal(status(tooHigh, 5), 'not_met');
});

test('modalanalyse med T1: Sd leses av spekteret', () => {
  const r = run({ sdMethod: 'modalT1', T1Modal: 0.8, agR: 0.8, noStiffnessReduction: true, soilStiffnessBounds: true });
  close(r.sd.Sd, designSd(0.8, sp({ ag: 0.8 })).Sd);
  assert.equal(r.sd.eq, '3.15');
});

test('brukstid innenfor grensen oppfyller kriterium 4', () => {
  const r = run({ life: 3, agR: 2.0 });
  assert.equal(status(r, 4), 'met');
  assert.equal(r.conclusion, 'avoided');
});

test('enSpectrum gir anbefalte verdier fra EN 1998-1 Tabell 3.2/3.3', () => {
  assert.deepEqual(enSpectrum('1', 'C'), { S: 1.15, TB: 0.20, TC: 0.6, TD: 2.0, ref: 'EN 1998-1 Tabell 3.2 (anbefalte verdier)' });
  assert.deepEqual(enSpectrum('2', 'D'), { S: 1.80, TB: 0.10, TC: 0.30, TD: 1.2, ref: 'EN 1998-1 Tabell 3.3 (anbefalte verdier)' });
  assert.throws(() => enSpectrum('2', 'S1'));
});
