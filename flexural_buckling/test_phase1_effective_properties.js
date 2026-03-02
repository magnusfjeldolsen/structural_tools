#!/usr/bin/env node
/**
 * Test Phase 1: Class 4 Effective Properties with Plate Metadata
 *
 * Validates that the new plate_elements-based calculation produces
 * accurate results with proper parallel axis theorem.
 *
 * Test cases:
 * 1. IPE220 / S460 - Class 4 web (pure compression)
 * 2. HEA800 / S235 - Class 4 web (pure compression)
 */

const fs = require('fs');
const path = require('path');

// Load database
const ipeData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'ipe.json'), 'utf8'));
const heaData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'hea.json'), 'utf8'));

// Load API functions (we'll need to extract and run them)
const apiCode = fs.readFileSync(path.join(__dirname, 'flexural_buckling_api.js'), 'utf8');

// Extract the functions we need
eval(apiCode.match(/function classifySection[\s\S]*?^}/m)[0]);
eval(apiCode.match(/function calculateRemovedStrips[\s\S]*?^}/m)[0]);
eval(apiCode.match(/function calculateNeutralAxisShift[\s\S]*?^}/m)[0]);
eval(apiCode.match(/function calculateClass4EffectiveProperties[\s\S]*?^}/m)[0]);

console.log('\n========================================');
console.log('Phase 1: Effective Properties Test');
console.log('========================================\n');

// Test 1: IPE220 / S460
console.log('Test 1: IPE220 / S460 (Class 4 web expected)');
console.log('─────────────────────────────────────────');

const ipe220 = ipeData.profiles.find(p => p.profile === 'IPE220');
if (!ipe220) {
  console.error('IPE220 not found!');
  process.exit(1);
}

// Convert database units
const ipe220_section = {
  profile: ipe220.profile,
  h: ipe220.h,
  b: ipe220.b,
  tw: ipe220.tw,
  tf: ipe220.tf,
  r: ipe220.r,
  area: ipe220.A / 100,  // mm² → cm²
  iy_moment: ipe220.Iy / 10000,  // mm⁴ → cm⁴
  iz_moment: ipe220.Iz / 10000,  // mm⁴ → cm⁴
  iy: ipe220.iy / 10,  // mm → cm
  iz: ipe220.iz / 10,  // mm → cm
  plate_elements: ipe220.plate_elements
};

console.log(`\nGross properties:`);
console.log(`  A = ${ipe220_section.area.toFixed(2)} cm²`);
console.log(`  Iy = ${ipe220_section.iy_moment.toFixed(2)} cm⁴`);
console.log(`  Iz = ${ipe220_section.iz_moment.toFixed(2)} cm⁴`);

const fy_460 = 460;
const classification_ipe220_460 = classifySection(ipe220_section, fy_460, 'ipe');

console.log(`\nClassification (S${fy_460}):`);
console.log(`  Overall: Class ${classification_ipe220_460.class}`);
for (const elem of classification_ipe220_460.element_results) {
  console.log(`  ${elem.id}: Class ${elem.class} (c/t = ${elem.slenderness.toFixed(1)}, limit = ${elem.limit_class3.toFixed(1)})`);
}

if (classification_ipe220_460.class === 4) {
  const effective_ipe220 = calculateClass4EffectiveProperties(ipe220_section, classification_ipe220_460, 'ipe');

  console.log(`\nEffective properties:`);
  console.log(`  A_eff = ${effective_ipe220.area.toFixed(2)} cm² (${effective_ipe220.area_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  I_eff,y = ${effective_ipe220.iy_moment.toFixed(2)} cm⁴ (${effective_ipe220.iy_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  I_eff,z = ${effective_ipe220.iz_moment.toFixed(2)} cm⁴ (${effective_ipe220.iz_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_eff,y = ${effective_ipe220.iy.toFixed(2)} cm`);
  console.log(`  i_eff,z = ${effective_ipe220.iz.toFixed(2)} cm`);
  console.log(`\nNeutral axis shift:`);
  console.log(`  e_N,y = ${effective_ipe220.neutral_axis_shift_y.toFixed(4)} cm`);
  console.log(`  e_N,z = ${effective_ipe220.neutral_axis_shift_z.toFixed(4)} cm`);
  console.log(`\nStrips removed: ${effective_ipe220.removed_strips_count}`);

  // Expected: e_N ≈ 0 for symmetric web reduction
  if (Math.abs(effective_ipe220.neutral_axis_shift_y) < 0.01 && Math.abs(effective_ipe220.neutral_axis_shift_z) < 0.01) {
    console.log(`✓ Neutral axis shift is near zero (symmetric reduction)`);
  } else {
    console.log(`⚠️  WARNING: Neutral axis shift is not zero (expected for pure compression)`);
  }

  // Expected: I_eff,y reduction should be small (web at centroid)
  if (effective_ipe220.iy_reduction_percent < 2.0) {
    console.log(`✓ I_y reduction is small (${effective_ipe220.iy_reduction_percent.toFixed(2)}%)`);
  } else {
    console.log(`⚠️  I_y reduction larger than expected (${effective_ipe220.iy_reduction_percent.toFixed(2)}%)`);
  }
} else {
  console.log(`\n✗ Section is not Class 4 (expected Class 4 for S460)`);
}

// Test 2: HEA800 / S235
console.log('\n\nTest 2: HEA800 / S235 (Class 4 web expected)');
console.log('─────────────────────────────────────────');

const hea800 = heaData.profiles.find(p => p.profile === 'HEA800');
if (!hea800) {
  console.error('HEA800 not found!');
  process.exit(1);
}

const hea800_section = {
  profile: hea800.profile,
  h: hea800.h,
  b: hea800.b,
  tw: hea800.tw,
  tf: hea800.tf,
  r: hea800.r,
  area: hea800.A / 100,
  iy_moment: hea800.Iy / 10000,
  iz_moment: hea800.Iz / 10000,
  iy: hea800.iy / 10,
  iz: hea800.iz / 10,
  plate_elements: hea800.plate_elements
};

console.log(`\nGross properties:`);
console.log(`  A = ${hea800_section.area.toFixed(2)} cm²`);
console.log(`  Iy = ${hea800_section.iy_moment.toFixed(2)} cm⁴`);
console.log(`  Iz = ${hea800_section.iz_moment.toFixed(2)} cm⁴`);

const fy_235 = 235;
const classification_hea800_235 = classifySection(hea800_section, fy_235, 'hea');

console.log(`\nClassification (S${fy_235}):`);
console.log(`  Overall: Class ${classification_hea800_235.class}`);
for (const elem of classification_hea800_235.element_results) {
  console.log(`  ${elem.id}: Class ${elem.class} (c/t = ${elem.slenderness.toFixed(1)}, limit = ${elem.limit_class3.toFixed(1)})`);
}

if (classification_hea800_235.class === 4) {
  const effective_hea800 = calculateClass4EffectiveProperties(hea800_section, classification_hea800_235, 'hea');

  console.log(`\nEffective properties:`);
  console.log(`  A_eff = ${effective_hea800.area.toFixed(2)} cm² (${effective_hea800.area_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  I_eff,y = ${effective_hea800.iy_moment.toFixed(2)} cm⁴ (${effective_hea800.iy_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  I_eff,z = ${effective_hea800.iz_moment.toFixed(2)} cm⁴ (${effective_hea800.iz_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_eff,y = ${effective_hea800.iy.toFixed(2)} cm`);
  console.log(`  i_eff,z = ${effective_hea800.iz.toFixed(2)} cm`);
  console.log(`\nNeutral axis shift:`);
  console.log(`  e_N,y = ${effective_hea800.neutral_axis_shift_y.toFixed(4)} cm`);
  console.log(`  e_N,z = ${effective_hea800.neutral_axis_shift_z.toFixed(4)} cm`);
  console.log(`\nStrips removed: ${effective_hea800.removed_strips_count}`);

  if (Math.abs(effective_hea800.neutral_axis_shift_y) < 0.01 && Math.abs(effective_hea800.neutral_axis_shift_z) < 0.01) {
    console.log(`✓ Neutral axis shift is near zero (symmetric reduction)`);
  } else {
    console.log(`⚠️  WARNING: Neutral axis shift is not zero`);
  }
} else {
  console.log(`\n✗ Section is not Class 4 (expected Class 4 for S235)`);
}

console.log('\n========================================');
console.log('Test Complete');
console.log('========================================\n');
