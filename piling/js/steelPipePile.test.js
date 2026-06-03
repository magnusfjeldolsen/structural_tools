/**
 * Behaviour-preservation test for SteelPipePile.
 *
 * Asserts the class reproduces the numbers the original
 * piling/tip-bearing-on-rock.html calc() produced for its default selection
 * (D=813 mm, t=14.2 mm, S355). Run with: `node piling/js/steelPipePile.test.js`
 */
import assert from 'node:assert/strict';
import { SteelPipePile } from './steelPipePile.js';

let passed = 0;
const approx = (actual, expected, label, rel = 1e-3) => {
  const tol = Math.abs(expected) * rel;
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: expected ≈ ${expected}, got ${actual}`);
  passed++;
};
const ok = (cond, label) => { assert.ok(cond, label); passed++; };

// Default selection from the original page
const pile = new SteelPipePile({ D: 813, t: 14.2 });

// Values the original calc() / catalogue note displayed
approx(pile.area_cm2, 356.34, 'area_cm2 (kat_A)');
approx(pile.massPerMetre, 279.73, 'massPerMetre (kat_kg)');
approx(pile.waveSpeed, 5172.19, 'waveSpeed c');
approx(pile.impedance / 1e6, 1.4468, 'impedance z [MN·s/m]');
approx(pile.slenderness, 57.2535, 'slenderness D/t');
approx(pile.classLimit, 59.569, 'classLimit 90·ε²');
ok(pile.sectionClassOK === true, 'sectionClassOK (D/t ≤ 90·ε²)');
approx(pile.fyd_MPa, 338.095, 'fyd_MPa');
ok(pile.secondMomentOfArea > 0, 'secondMomentOfArea > 0');

// mass for the original default driven length l = 17.2 m, m_pel = ρ·A·l
approx(pile.mass(17.2) / 1000, 4.81, 'mass(17.2 m) [t]', 5e-3);

// catalogue helpers
assert.deepEqual(
  SteelPipePile.availableDiameters(),
  [323.9, 406.4, 508, 610, 711, 813, 914, 1016, 1220],
  'availableDiameters sorted ascending');
passed++;
assert.deepEqual(SteelPipePile.thicknessesFor(813),
  [6.3, 8.0, 8.8, 10.0, 12.5, 14.2, 16.0], 'thicknessesFor(813)');
passed++;
assert.deepEqual(SteelPipePile.thicknessesFor(999), [], 'thicknessesFor(unknown) → []');
passed++;

// guards
assert.throws(() => new SteelPipePile({ D: 100, t: 60 }), 'rejects 2t ≥ D');
passed++;

console.log(`✓ SteelPipePile: ${passed} assertions passed`);
