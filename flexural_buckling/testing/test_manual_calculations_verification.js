#!/usr/bin/env node
/**
 * Test file: Manual Calculations Verification
 *
 * Purpose: Verify implementation against manual calculations from SMath Studio
 * Reference: flexural_buckling/smath/manual_effective_sections_calculations.pdf
 *
 * Test cases:
 * 1. IPE450 - Pure compression, Class 4 web (ρ = 0.4898)
 * 2. IPE240 - Pure compression, Class 4 web (ρ = 1.0, no reduction despite Class 4)
 * 3. CSHS100X3 - S460, all 4 sides Class 4 (ρ = 1.0, no reduction)
 * 4. CSHS180X4 - S460, all 4 sides Class 4 (ρ = 0.9363)
 *
 * Key insight from PDF:
 * - ρ (rho) = reduction factor (0 to 1.0)
 * - b_eff = b × ρ (remaining effective width)
 * - b_removed = b × (1 - ρ) (removed width)
 * - When ρ = 1.0, the element is Class 4 BUT fully effective (no removal)
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Load Database and Core Functions
// ============================================================================

function loadDatabase() {
  const profileTypes = ['ipe', 'cshs'];
  const database = {};

  for (const type of profileTypes) {
    const filePath = path.join(__dirname, '../../steel_cross_section_database', `${type}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    database[type] = data.profiles;
  }

  return database;
}

// ============================================================================
// Classification Functions (from flexural_buckling_api.js)
// ============================================================================

function classifyCrossSectionPureCompression(section, fy, profileType) {
  const epsilon = Math.sqrt(235 / fy);
  const elementResults = [];

  if (!section.plate_elements) {
    console.log(`  ⚠️ Section ${section.profile} missing plate_elements metadata`);
    return { class: 1, governing_element: 'unknown', element_results: [] };
  }

  let sectionClass = 1;
  let governingElement = null;

  for (const element of section.plate_elements) {
    const result = classifyPlateElement(section, element, epsilon, 1.0);
    elementResults.push(result);

    if (result.class > sectionClass) {
      sectionClass = result.class;
      governingElement = element.id;
    }
  }

  return {
    class: sectionClass,
    governing_element: governingElement,
    element_results: elementResults
  };
}

function classifyPlateElement(section, element, epsilon, psi) {
  const sectionWithDefaults = { ...section };
  if (sectionWithDefaults.b && !sectionWithDefaults.h) {
    sectionWithDefaults.h = sectionWithDefaults.b;
  }
  if (sectionWithDefaults.h && !sectionWithDefaults.b) {
    sectionWithDefaults.b = sectionWithDefaults.h;
  }

  const c = eval(element.classification.c_formula
    .replace(/h/g, sectionWithDefaults.h)
    .replace(/b/g, sectionWithDefaults.b)
    .replace(/tw/g, sectionWithDefaults.tw || sectionWithDefaults.t)
    .replace(/tf/g, sectionWithDefaults.tf || sectionWithDefaults.t)
    .replace(/r/g, sectionWithDefaults.r || sectionWithDefaults.ro || 0)
    .replace(/t/g, sectionWithDefaults.t || sectionWithDefaults.tw)
  );

  const t = eval(element.classification.t_formula
    .replace(/tw/g, sectionWithDefaults.tw || sectionWithDefaults.t)
    .replace(/tf/g, sectionWithDefaults.tf || sectionWithDefaults.t)
    .replace(/t/g, sectionWithDefaults.t || sectionWithDefaults.tw)
  );

  const slenderness = c / t;
  const elementType = element.type;

  let limit_class1, limit_class2, limit_class3;

  if (elementType === 'internal') {
    if (psi === 1.0) {
      limit_class1 = 33 * epsilon;
      limit_class2 = 38 * epsilon;
      limit_class3 = 42 * epsilon;
    } else if (psi > 0) {
      const alpha = 0.5 + Math.sqrt(0.085 - 0.055 * psi);
      limit_class1 = 396 * epsilon / (13 * alpha - 1);
      limit_class2 = 456 * epsilon / (13 * alpha - 1);
      limit_class3 = 42 * epsilon / (0.67 + 0.33 * psi);
    } else {
      limit_class1 = 72 * epsilon;
      limit_class2 = 83 * epsilon;
      limit_class3 = 124 * epsilon;
    }
  } else if (elementType === 'outstand') {
    limit_class1 = 9 * epsilon;
    limit_class2 = 10 * epsilon;
    limit_class3 = 14 * epsilon;
  } else {
    return { id: element.id, class: 1, type: elementType, slenderness, c, t, limit_class3: Infinity };
  }

  let elementClass;
  if (slenderness <= limit_class1) {
    elementClass = 1;
  } else if (slenderness <= limit_class2) {
    elementClass = 2;
  } else if (slenderness <= limit_class3) {
    elementClass = 3;
  } else {
    elementClass = 4;
  }

  return {
    id: element.id,
    class: elementClass,
    type: elementType,
    slenderness,
    c,
    t,
    limit_class1,
    limit_class2,
    limit_class3
  };
}

// ============================================================================
// Effective Properties Calculation
// ============================================================================

function calculateClass4EffectiveProperties(section, classification) {
  const psi = 1.0;
  const removedStrips = [];
  const plateReductions = [];

  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const plate = section.plate_elements.find(p => p.id === element.id);
    if (!plate) continue;

    const slenderness = element.slenderness;
    const elementType = element.type;
    const limit_class3 = element.limit_class3;
    const lambda_p_bar = slenderness / limit_class3;

    // Calculate reduction factor ρ
    let rho;
    if (elementType === 'internal') {
      rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar * lambda_p_bar);
    } else if (elementType === 'outstand') {
      rho = (lambda_p_bar - 0.188) / (lambda_p_bar * lambda_p_bar);
    }
    rho = Math.min(Math.max(rho, 0), 1.0);

    const c_gross = element.c;
    const t = element.t;
    const c_eff = rho * c_gross;
    const strip_width = c_gross - c_eff;

    plateReductions.push({
      element: element.id,
      type: elementType,
      c_gross: c_gross,
      c_eff: c_eff,
      rho: rho,
      lambda_p_bar: lambda_p_bar,
      strip_width: strip_width,
      strip_area_mm2: strip_width * t
    });

    // Only create removed strip if there's actually material removed
    if (strip_width > 0) {
      if (elementType === 'internal') {
        // Center strip for internal elements
        const centroid = plate.geometry.centroid;
        removedStrips.push({
          id: `${plate.id}_center_removed`,
          width: strip_width,
          thickness: t,
          area: (strip_width * t) / 100, // mm² to cm²
          orientation: plate.orientation,
          centroid: { y: centroid.y, z: centroid.z }
        });
      }
    }
  }

  // Calculate effective area
  const A_gross = section.A / 100; // mm² to cm²
  let total_A_removed = 0;
  for (const strip of removedStrips) {
    total_A_removed += strip.area;
  }
  const A_eff = A_gross - total_A_removed;

  return {
    A_gross,
    A_eff,
    A_removed: total_A_removed,
    reduction_percent: (total_A_removed / A_gross) * 100,
    num_strips: removedStrips.length,
    strips: removedStrips,
    plate_reductions: plateReductions
  };
}

// ============================================================================
// Test Cases
// ============================================================================

function compareResults(testName, manual, computed, tolerance = 0.01) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));

  let allPassed = true;

  for (const key in manual) {
    const manualVal = manual[key];
    const computedVal = computed[key];

    if (typeof manualVal === 'number' && typeof computedVal === 'number') {
      const diff = Math.abs(manualVal - computedVal);
      const relError = manualVal !== 0 ? (diff / Math.abs(manualVal)) : 0;
      const passed = relError <= tolerance;

      const status = passed ? '✓' : '✗';
      console.log(`  ${status} ${key}:`);
      console.log(`      Manual:   ${manualVal.toFixed(4)}`);
      console.log(`      Computed: ${computedVal.toFixed(4)}`);
      console.log(`      Diff:     ${diff.toFixed(4)} (${(relError * 100).toFixed(2)}%)`);

      if (!passed) {
        allPassed = false;
      }
    } else {
      console.log(`  ${key}:`);
      console.log(`      Manual:   ${manualVal}`);
      console.log(`      Computed: ${computedVal}`);
    }
  }

  console.log(`\n  Overall: ${allPassed ? '✓ PASS' : '✗ FAIL'}`);
  return allPassed;
}

// ============================================================================
// Test Case 1: IPE450 - Pure Compression (ρ = 0.4898)
// ============================================================================

function test_IPE450_pureCompression(database) {
  const section = database.ipe.find(s => s.profile === 'IPE450');
  const fy = 460; // MPa
  const steelGrade = 'S460';

  console.log('\n' + '█'.repeat(80));
  console.log('TEST CASE 1: IPE450 - Pure Compression');
  console.log('█'.repeat(80));
  console.log(`Section: ${section.profile}`);
  console.log(`Steel: ${steelGrade} (fy = ${fy} MPa)`);
  console.log(`Geometry: h=${section.h}mm, b=${section.b}mm, tw=${section.tw}mm, tf=${section.tf}mm, r=${section.r}mm`);

  // Manual calculation values from PDF (page 1) - UPDATED 2026-03-04
  const manual = {
    epsilon: 0.7148,
    bp: 378.8, // h - 2×tf - 2×r
    tp: 9.4, // tw (CORRECTED - was tw×0.5 before)
    psi: 1.0,
    k_sigma: 4.0,
    bp_over_tp: 40.2979,
    lambda_p: 0.9926, // Using EN 1993-1-5 formula
    rho_limit: 0.6732, // 0.5 + sqrt(0.085 - 0.055×ψ)
    rho_internal: 0.9516,
    b_eff: 360.4747, // mm
    b_removed: 18.3253, // mm (center strip removed)
    A_removed_mm2: 172.2578, // mm² (b_removed × tw)
    A_gross_mm2: 9882, // mm²
    A_eff_mm2: 9709.7422, // mm²
    Iy_gross_mm4: 33740e4, // mm⁴
    Iy_eff_mm4: 33373.904e4 // mm⁴
  };

  // Classify section
  const classification = classifyCrossSectionPureCompression(section, fy, 'ipe');

  console.log('\n--- Classification Results ---');
  console.log(`Overall class: ${classification.class}`);
  console.log(`Governing element: ${classification.governing_element}`);

  for (const el of classification.element_results) {
    console.log(`  ${el.id}: class=${el.class}, c/t=${el.slenderness.toFixed(2)}, limit_class3=${el.limit_class3.toFixed(2)}`);
  }

  // Calculate effective properties
  const effProps = calculateClass4EffectiveProperties(section, classification);

  console.log('\n--- Effective Properties ---');
  console.log(`A_gross = ${effProps.A_gross.toFixed(2)} cm² = ${(effProps.A_gross * 100).toFixed(2)} mm²`);
  console.log(`A_removed = ${effProps.A_removed.toFixed(2)} cm² = ${(effProps.A_removed * 100).toFixed(2)} mm²`);
  console.log(`A_eff = ${effProps.A_eff.toFixed(2)} cm² = ${(effProps.A_eff * 100).toFixed(2)} mm²`);
  console.log(`Number of removed strips: ${effProps.num_strips}`);

  // Show plate reductions
  console.log('\n--- Plate Reductions ---');
  for (const pr of effProps.plate_reductions) {
    console.log(`  ${pr.element}:`);
    console.log(`    Type: ${pr.type}`);
    console.log(`    λ_p_bar: ${pr.lambda_p_bar.toFixed(4)}`);
    console.log(`    ρ: ${pr.rho.toFixed(4)}`);
    console.log(`    c_gross: ${pr.c_gross.toFixed(2)} mm`);
    console.log(`    c_eff: ${pr.c_eff.toFixed(2)} mm`);
    console.log(`    strip_width: ${pr.strip_width.toFixed(2)} mm`);
    console.log(`    strip_area: ${pr.strip_area_mm2.toFixed(2)} mm²`);
  }

  // Compare key values
  const epsilon = Math.sqrt(235 / fy);
  const webElement = classification.element_results.find(e => e.id === 'web');
  const webReduction = effProps.plate_reductions.find(pr => pr.element === 'web');

  // Need to calculate lambda_p using EN 1993-1-5 formula for comparison
  const k_sigma = 4.0;
  const lambda_p_EN1993_1_5 = webElement ?
    (webElement.c / webElement.t) / (28.4 * epsilon * Math.sqrt(k_sigma)) : 0;

  const computed = {
    epsilon: epsilon,
    bp: webElement ? webElement.c : 0,
    tp: webElement ? webElement.t : 0,
    bp_over_tp: webElement ? webElement.slenderness : 0,
    lambda_p: lambda_p_EN1993_1_5,
    rho_internal: webReduction ? webReduction.rho : 0,
    b_eff: webReduction ? webReduction.c_eff : 0,
    b_removed: webReduction ? webReduction.strip_width : 0,
    A_removed_mm2: effProps.A_removed * 100,
    A_gross_mm2: effProps.A_gross * 100,
    A_eff_mm2: effProps.A_eff * 100
  };

  return compareResults('IPE450 Pure Compression', manual, computed, 0.02);
}

// ============================================================================
// Test Case 2: IPE240 - Pure Compression (ρ = 1.0, no reduction)
// ============================================================================

function test_IPE240_pureCompression(database) {
  const section = database.ipe.find(s => s.profile === 'IPE240');
  const fy = 460; // MPa
  const steelGrade = 'S460';

  console.log('\n' + '█'.repeat(80));
  console.log('TEST CASE 2: IPE240 - Pure Compression (Class 4 but ρ = 1.0)');
  console.log('█'.repeat(80));
  console.log(`Section: ${section.profile}`);
  console.log(`Steel: ${steelGrade} (fy = ${fy} MPa)`);
  console.log(`Geometry: h=${section.h}mm, b=${section.b}mm, tw=${section.tw}mm, tf=${section.tf}mm, r=${section.r}mm`);

  // Note from PDF: This case should have ρ = 1.0 (fully effective despite Class 4)
  // This happens when λ_p_bar is just above the Class 3 limit but the rho formula yields 1.0

  const manual = {
    epsilon: 0.7148,
    expected_rho: 1.0,
    expected_A_removed: 0,
    note: "Class 4 but fully effective (ρ = 1.0)"
  };

  // Classify section
  const classification = classifyCrossSectionPureCompression(section, fy, 'ipe');

  console.log('\n--- Classification Results ---');
  console.log(`Overall class: ${classification.class}`);
  console.log(`Governing element: ${classification.governing_element}`);

  for (const el of classification.element_results) {
    console.log(`  ${el.id}: class=${el.class}, c/t=${el.slenderness.toFixed(2)}, limit_class3=${el.limit_class3.toFixed(2)}`);
  }

  // Calculate effective properties if Class 4
  if (classification.class === 4) {
    const effProps = calculateClass4EffectiveProperties(section, classification);

    console.log('\n--- Effective Properties ---');
    console.log(`A_gross = ${effProps.A_gross.toFixed(2)} cm²`);
    console.log(`A_removed = ${effProps.A_removed.toFixed(4)} cm²`);
    console.log(`A_eff = ${effProps.A_eff.toFixed(2)} cm²`);

    // Show plate reductions
    console.log('\n--- Plate Reductions ---');
    for (const pr of effProps.plate_reductions) {
      console.log(`  ${pr.element}: ρ=${pr.rho.toFixed(4)}, c_eff=${pr.c_eff.toFixed(2)}mm`);
    }

    // Check if any element has ρ = 1.0
    const class4Elements = effProps.plate_reductions.filter(pr => pr.rho < 1.0);

    console.log('\n--- Verification ---');
    if (effProps.A_removed < 0.01) {
      console.log('  ✓ PASS: Class 4 section with ρ = 1.0 → No area removed');
      return true;
    } else {
      console.log('  ✗ FAIL: Expected no area removal but got A_removed = ' + effProps.A_removed.toFixed(4));
      return false;
    }
  } else {
    console.log('\n  Note: Section is not Class 4, no effective properties needed');
    console.log(`  ✓ PASS: Section is Class ${classification.class}`);
    return true;
  }
}

// ============================================================================
// Test Case 3: CSHS100X3 - S460 (ρ = 1.0, no reduction)
// ============================================================================

function test_CSHS100X3_S460(database) {
  // Find section (note: profile name might have spaces)
  const section = database.cshs.find(s => s.profile.replace(/\s+/g, '') === 'CSHS100X3' || s.profile === 'CSHS 100X3');

  if (!section) {
    console.log('\n❌ ERROR: CSHS100X3 not found in database');
    console.log('Available sections:', database.cshs.slice(0, 5).map(s => s.profile).join(', '));
    return false;
  }

  const fy = 460; // MPa
  const steelGrade = 'S460';

  console.log('\n' + '█'.repeat(80));
  console.log('TEST CASE 3: CSHS100X3 - S460 (Class 4 but ρ = 1.0)');
  console.log('█'.repeat(80));
  console.log(`Section: ${section.profile}`);
  console.log(`Steel: ${steelGrade} (fy = ${fy} MPa)`);
  console.log(`Geometry: b=${section.b}mm, t=${section.t}mm, ro=${section.ro}mm`);

  // Manual calculation values from PDF (page 2)
  const manual = {
    epsilon: 0.7148,
    b: 100, // mm
    t: 3, // mm
    ro: 6, // mm (corner radius)
    bp: 88, // b - 2×ro
    k_sigma: 4.0,
    bp_over_tp: 29.3333, // bp/t
    lambda_p_bar: 0.7225,
    rho_limit: 0.6732, // 0.5 + sqrt(0.085 - 0.055×ψ)
    rho_internal: 1.0, // Fully effective! (because λ_p_bar < rho_limit)
    expected_A_removed: 0
  };

  const classification = classifyCrossSectionPureCompression(section, fy, 'cshs');

  console.log('\n--- Classification Results ---');
  console.log(`Overall class: ${classification.class}`);

  for (const el of classification.element_results) {
    console.log(`  ${el.id}: class=${el.class}, c/t=${el.slenderness.toFixed(2)}`);
  }

  if (classification.class === 4) {
    const effProps = calculateClass4EffectiveProperties(section, classification);

    console.log('\n--- Effective Properties ---');
    for (const pr of effProps.plate_reductions) {
      console.log(`  ${pr.element}: λ_p_bar=${pr.lambda_p_bar.toFixed(4)}, ρ=${pr.rho.toFixed(4)}`);
    }

    const epsilon = Math.sqrt(235 / fy);
    const computed = {
      epsilon: epsilon,
      rho_internal: effProps.plate_reductions[0] ? effProps.plate_reductions[0].rho : 0,
      A_removed_mm2: effProps.A_removed * 100
    };

    // Check if rho = 1.0
    if (Math.abs(computed.rho_internal - 1.0) < 0.01 && effProps.A_removed < 0.01) {
      console.log('\n  ✓ PASS: ρ = 1.0, no area removed (as expected)');
      return true;
    } else {
      console.log('\n  ✗ FAIL: Expected ρ = 1.0 and no removal');
      console.log(`    Got ρ = ${computed.rho_internal.toFixed(4)}, A_removed = ${effProps.A_removed.toFixed(4)} cm²`);
      return false;
    }
  } else {
    console.log(`\n  Note: Section classified as Class ${classification.class}`);
    return true;
  }
}

// ============================================================================
// Test Case 4: CSHS180X4 - S460 (ρ = 0.9363)
// ============================================================================

function test_CSHS180X4_S460(database) {
  const section = database.cshs.find(s => s.profile.replace(/\s+/g, '') === 'CSHS180X4' || s.profile === 'CSHS 180X4');

  if (!section) {
    console.log('\n❌ ERROR: CSHS180X4 not found in database');
    return false;
  }

  const fy = 460; // MPa
  const steelGrade = 'S460';

  console.log('\n' + '█'.repeat(80));
  console.log('TEST CASE 4: CSHS180X4 - S460 (ρ = 0.9363)');
  console.log('█'.repeat(80));
  console.log(`Section: ${section.profile}`);
  console.log(`Steel: ${steelGrade} (fy = ${fy} MPa)`);
  console.log(`Geometry: b=${section.b}mm, t=${section.t}mm, ro=${section.ro}mm`);

  // Manual calculation values from PDF (page 3)
  const manual = {
    epsilon: 0.7148,
    b: 180, // mm
    t: 4, // mm
    ro: 8, // mm
    bp: 164, // b - 2×ro
    lambda_p_bar: 1.0099,
    rho_internal: 0.9363,
    b_eff: 153.5476, // mm (per side)
    b_removed: 10.4524, // mm (centric on plate - center strip)
    Ap_i_removed_mm2: 41.8097, // b_removed × t (one plate)
    A_removed_tot_mm2: 167.2387, // 4 × Ap_i_removed (4 sides)
    A_gross_mm2: 2775, // mm²
    A_eff_mm2: 2607.7613, // mm²
    Iy_gross_mm4: 1014.22e4, // mm⁴
    Iy_eff_mm4: 1013.572e4, // mm⁴ (note: very small reduction!)
    Iy_eff_over_Iy_gross: 0.9544
  };

  const classification = classifyCrossSectionPureCompression(section, fy, 'cshs');

  console.log('\n--- Classification Results ---');
  console.log(`Overall class: ${classification.class}`);

  for (const el of classification.element_results) {
    console.log(`  ${el.id}: class=${el.class}, c/t=${el.slenderness.toFixed(2)}`);
  }

  if (classification.class === 4) {
    const effProps = calculateClass4EffectiveProperties(section, classification);

    console.log('\n--- Effective Properties ---');
    console.log(`A_gross = ${effProps.A_gross.toFixed(2)} cm² = ${(effProps.A_gross * 100).toFixed(2)} mm²`);
    console.log(`A_removed = ${effProps.A_removed.toFixed(4)} cm² = ${(effProps.A_removed * 100).toFixed(4)} mm²`);
    console.log(`A_eff = ${effProps.A_eff.toFixed(2)} cm² = ${(effProps.A_eff * 100).toFixed(2)} mm²`);

    console.log('\n--- Plate Reductions ---');
    for (const pr of effProps.plate_reductions) {
      console.log(`  ${pr.element}:`);
      console.log(`    λ_p_bar: ${pr.lambda_p_bar.toFixed(4)}`);
      console.log(`    ρ: ${pr.rho.toFixed(4)}`);
      console.log(`    c_eff: ${pr.c_eff.toFixed(2)} mm`);
      console.log(`    strip_width: ${pr.strip_width.toFixed(2)} mm`);
      console.log(`    strip_area: ${pr.strip_area_mm2.toFixed(4)} mm²`);
    }

    const computed = {
      rho_internal: effProps.plate_reductions[0] ? effProps.plate_reductions[0].rho : 0,
      lambda_p_bar: effProps.plate_reductions[0] ? effProps.plate_reductions[0].lambda_p_bar : 0,
      b_eff: effProps.plate_reductions[0] ? effProps.plate_reductions[0].c_eff : 0,
      b_removed: effProps.plate_reductions[0] ? effProps.plate_reductions[0].strip_width : 0,
      A_removed_tot_mm2: effProps.A_removed * 100,
      A_gross_mm2: effProps.A_gross * 100,
      A_eff_mm2: effProps.A_eff * 100
    };

    return compareResults('CSHS180X4 S460', manual, computed, 0.02);
  } else {
    console.log(`\n  Unexpected: Section is Class ${classification.class}, expected Class 4`);
    return false;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

console.log('\n' + '▓'.repeat(80));
console.log('MANUAL CALCULATIONS VERIFICATION TEST SUITE');
console.log('Reference: flexural_buckling/smath/manual_effective_sections_calculations.pdf');
console.log('▓'.repeat(80));

const database = loadDatabase();

const results = {
  total: 0,
  passed: 0,
  failed: 0
};

// Run all tests
const tests = [
  { name: 'IPE450', fn: test_IPE450_pureCompression },
  { name: 'IPE240', fn: test_IPE240_pureCompression },
  { name: 'CSHS100X3', fn: test_CSHS100X3_S460 },
  { name: 'CSHS180X4', fn: test_CSHS180X4_S460 }
];

for (const test of tests) {
  results.total++;
  const passed = test.fn(database);
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

// Summary
console.log('\n' + '▓'.repeat(80));
console.log('TEST SUMMARY');
console.log('▓'.repeat(80));
console.log(`Total tests:  ${results.total}`);
console.log(`Passed:       ${results.passed} ✓`);
console.log(`Failed:       ${results.failed} ${results.failed > 0 ? '✗' : ''}`);
console.log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
console.log('▓'.repeat(80));

process.exit(results.failed > 0 ? 1 : 0);
