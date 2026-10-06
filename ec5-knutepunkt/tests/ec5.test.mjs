import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateConnection, fastenerRules } from '../src/engine/ec5.js';
import { ulsCombinations, angleToGrain } from '../src/engine/combos.js';
import { minSpacings } from '../src/engine/spacing.js';

const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} ≉ ${b}`);

test('Bolt M12 4.6, C24 45/95/45 dobbeltsnitt: håndregnet Johansen', () => {
  const r = calculateConnection({
    connection: { kind: 'tt-double' },
    members: { m1: { grade: 'C24', t: 45 }, m2: { grade: 'C24', t: 95 } },
    fastener: { type: 'bolt', d: 12, f_u: 400, washer: 36, predrilled: true },
    pattern: { n1: 1, n2: 1, a1: 60, a2: 48, a3t: 84, a3c: 84, a4t: 36, a4c: 36, alpha1: 0, alpha2: 0 },
    serviceClass: 1,
  });
  near(r.fh1, 25.26);                 // 0,082·(1−0,12)·350
  near(r.My, 76740, 0.01);            // 0,3·400·12^2,6
  const g = r.modes.find((m) => m.id === 'g'); near(g.value, 13640);
  const h = r.modes.find((m) => m.id === 'h'); near(h.value, 14398);
  const j = r.modes.find((m) => m.id === 'j'); near(j.johansen, 6423, 0.03);
  assert.equal(r.governing.id, 'j');
  assert.ok(j.rope <= 0.25 * j.johansen + 1e-6, 'taueffekt bolt ≤ 25 %');
  assert.equal(r.planes, 2);
  const dc = r.designCapacity('medium');
  near(dc.Rd, 0.8 * r.RkTot / 1.3, 1e-9);
});

test('Treskrue Ø8 (d1 = 5,2) → d_ef = 5,72 ≤ 6 → spikerregler', () => {
  const rules = fastenerRules({ type: 'screw', d: 8, d1: 5.2 });
  assert.equal(rules.rule, 'nail');
  near(rules.d, 5.72, 1e-6);
});

test('Treskrue Ø8 tre-mot-tre ett snitt: taueffekt begrenset til 100 % og Fax/4', () => {
  const r = calculateConnection({
    connection: { kind: 'tt-single' },
    members: { m1: { grade: 'C24', t: 48 }, m2: { grade: 'GL30c', t: 140 } },
    fastener: { type: 'screw', d: 8, d1: 5.2, d_head: 15, f_u: 800, f_tensk: 20000, l: 160, fullyThreaded: true },
    pattern: { n1: 2, n2: 2, a1: 60, a2: 30, a3t: 100, a3c: 100, a4t: 30, a4c: 30, alpha1: 0, alpha2: 0 },
    serviceClass: 2,
  });
  assert.ok(r.Fax > 0);
  r.modes.filter((m) => m.rope > 0).forEach((m) => assert.ok(m.rope <= r.Fax / 4 + 1e-6));
  assert.ok(r.nef_row < 2 && r.nef_row > 1, 'n_ef mellom 1 og n');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
});

test('Stål-mot-tre: tynn og tykk plate gir ulike moduser, interpolasjon mellom', () => {
  const base = {
    connection: { kind: 'st-single' },
    members: { m1: { grade: 'C24', t: 90 }, m2: { grade: 'C24', t: 90 }, steel: { grade: 'S355', t_s: 5 } },
    fastener: { type: 'bolt', d: 12, f_u: 800, washer: 36 },
    pattern: { n1: 1, n2: 1, a1: 60, a2: 48, a3t: 84, a3c: 84, a4t: 36, a4c: 36, alpha1: 0, alpha2: 0 },
    serviceClass: 1,
  };
  const thin = calculateConnection({ ...base, members: { ...base.members, steel: { grade: 'S355', t_s: 5 } } });
  const thick = calculateConnection({ ...base, members: { ...base.members, steel: { grade: 'S355', t_s: 12 } } });
  const mid = calculateConnection({ ...base, members: { ...base.members, steel: { grade: 'S355', t_s: 9 } } });
  assert.ok(['a', 'b'].includes(thin.governing.id));
  assert.ok(['c', 'd', 'e'].includes(thick.governing.id));
  assert.ok(mid.FvRk > thin.FvRk && mid.FvRk < thick.FvRk);
});

test('Lastkombinasjoner NS-EN 1990 NA: 6.10a og 6.10b', () => {
  const combos = ulsCombinations([
    { name: 'G', category: 'G', Fx: 10, Fy: 0 },
    { name: 'S', category: 'S', Fx: 20, Fy: 0 },
    { name: 'W', category: 'W', Fx: 0, Fy: 5 },
  ]);
  assert.equal(combos.length, 3);
  const k1 = combos[0];
  near(k1.Fx, 1.35 * 10 + 1.5 * 0.7 * 20, 1e-9);
  near(k1.Fy, 1.5 * 0.6 * 5, 1e-9);
  assert.equal(k1.duration, 'instant');
  const k2 = combos[1];
  near(k2.Fx, 1.2015 * 10 + 1.5 * 20, 1e-3);
  assert.equal(angleToGrain(10, 10), 45);
});

test('Minsteavstander bolt tabell 8.4, α = 0', () => {
  const s = minSpacings({ rule: 'bolt', d: 12 }, { type: 'bolt' }, 0, true, 350);
  assert.equal(s.a1, 60); assert.equal(s.a2, 48); assert.equal(s.a3t, 84); assert.equal(s.a4c, 36);
});

test('Spikerforbindelse ikke forboret: minste tykkelse og inntrengning kontrolleres', () => {
  const r = calculateConnection({
    connection: { kind: 'tt-single' },
    members: { m1: { grade: 'C24', t: 19 }, m2: { grade: 'C24', t: 48 } },
    fastener: { type: 'nail', d: 3.1, f_u: 600, l: 90, predrilled: false },
    pattern: { n1: 3, n2: 2, a1: 32, a2: 16, a3t: 47, a3c: 47, a4t: 16, a4c: 16, alpha1: 0, alpha2: 0 },
    serviceClass: 1,
  });
  assert.ok(r.warnings.some((w) => w.ref.includes('8.18')));
  assert.equal(r.errors.length, 0);
  assert.ok(r.nef_row < 3);
});
