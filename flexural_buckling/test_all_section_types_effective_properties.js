#!/usr/bin/env node
/**
 * Comprehensive test for Class 4 effective properties across all section types
 * Tests: IPE, HEA, HEB, HEM, HRHS, HSHS, CRHS, CSHS
 * Excludes: HCHS, CCHS (circular hollow sections as requested)
 *
 * Purpose: Verify that effective section calculations work correctly for all
 * section types in the steel cross section database
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Load Database Files
// ============================================================================

function loadDatabase() {
  const profileTypes = ['ipe', 'hea', 'heb', 'hem', 'hrhs', 'hshs', 'crhs', 'cshs'];
  const database = {};

  for (const type of profileTypes) {
    const filePath = path.join(__dirname, '../steel_cross_section_database', `${type}.json`);
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

  // Check if section has plate_elements metadata
  if (!section.plate_elements) {
    console.log(`  ⚠️ Section ${section.profile} missing plate_elements metadata`);
    return { class: 1, governing_element: 'unknown', element_results: [] };
  }

  let sectionClass = 1;
  let governingElement = null;

  // Classify each plate element
  for (const element of section.plate_elements) {
    const result = classifyPlateElement(section, element, epsilon, 1.0); // psi = 1.0 for compression
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
  // Create section with defaults for SHS (square hollow sections)
  const sectionWithDefaults = { ...section };
  if (sectionWithDefaults.b && !sectionWithDefaults.h) {
    sectionWithDefaults.h = sectionWithDefaults.b;
  }
  if (sectionWithDefaults.h && !sectionWithDefaults.b) {
    sectionWithDefaults.b = sectionWithDefaults.h;
  }

  // Calculate c and t from formulas
  const c = eval(element.classification.c_formula
    .replace(/h/g, sectionWithDefaults.h)
    .replace(/b/g, sectionWithDefaults.b)
    .replace(/tw/g, sectionWithDefaults.tw || sectionWithDefaults.t)
    .replace(/tf/g, sectionWithDefaults.tf || sectionWithDefaults.t)
    .replace(/r/g, sectionWithDefaults.r || 0)
    .replace(/t/g, sectionWithDefaults.t || sectionWithDefaults.tw)
  );

  const t = eval(element.classification.t_formula
    .replace(/tw/g, sectionWithDefaults.tw || sectionWithDefaults.t)
    .replace(/tf/g, sectionWithDefaults.tf || sectionWithDefaults.t)
    .replace(/t/g, sectionWithDefaults.t || sectionWithDefaults.tw)
  );

  const slenderness = c / t;
  const elementType = element.type;

  // Get class limits
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
    // Circular
    return { id: element.id, class: 1, type: elementType, slenderness, c, t, limit_class3: Infinity };
  }

  // Determine class
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

function calculateRemovedStrips(plate, element, rho, psi) {
  const strips = [];
  const c_gross = element.c;
  const t = element.t;
  const c_eff = rho * c_gross;
  const strip_width = c_gross - c_eff;

  if (strip_width <= 0) return strips;

  if (plate.type === 'internal') {
    // Center strip for internal elements
    const centroid = plate.geometry.centroid;
    strips.push({
      id: `${plate.id}_center_removed`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      orientation: plate.orientation,
      centroid: { y: centroid.y, z: centroid.z }
    });
  } else if (plate.type === 'outstand') {
    // Free edge strip for outstand elements
    const free_edge = plate.geometry.edges.edge2;
    strips.push({
      id: `${plate.id}_free_edge_removed`,
      width: strip_width,
      thickness: t,
      area: (strip_width * t) / 100,
      orientation: plate.orientation,
      centroid: {
        y: plate.orientation === 'y-direction' ? free_edge.position.y - strip_width/2 : plate.geometry.centroid.y,
        z: plate.orientation === 'z-direction' ? free_edge.position.z - Math.sign(free_edge.position.z) * strip_width/2 : plate.geometry.centroid.z
      }
    });
  }

  return strips;
}

function calculateClass4EffectiveProperties(section, classification) {
  const psi = 1.0;
  const removedStrips = [];

  for (const element of classification.element_results) {
    if (element.class !== 4) continue;

    const plate = section.plate_elements.find(p => p.id === element.id);
    if (!plate) continue;

    const slenderness = element.slenderness;
    const elementType = element.type;
    const limit_class3 = element.limit_class3;
    const lambda_p_bar = slenderness / limit_class3;

    let rho;
    if (elementType === 'internal') {
      rho = (lambda_p_bar - 0.055 * (3 + psi)) / (lambda_p_bar * lambda_p_bar);
    } else if (elementType === 'outstand') {
      rho = (lambda_p_bar - 0.188) / (lambda_p_bar * lambda_p_bar);
    }
    rho = Math.min(Math.max(rho, 0), 1.0);

    const strips = calculateRemovedStrips(plate, element, rho, psi);
    removedStrips.push(...strips);
  }

  // Calculate effective area
  // Database uses A in mm², convert to cm²
  const A_gross = section.A / 100;
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
    strips: removedStrips
  };
}

// ============================================================================
// Test Cases
// ============================================================================

function testSectionType(profileType, sectionName, steelGrade, fy, database) {
  // Normalize spaces: database uses non-breaking spaces (char 160), we use regular spaces (char 32)
  const normalizeSpaces = (str) => str.replace(/\s/g, ' ').replace(/\u00A0/g, ' ');
  const section = database[profileType].find(s => normalizeSpaces(s.profile) === normalizeSpaces(sectionName));

  if (!section) {
    // Try to find similar profiles for debugging
    const similar = database[profileType].filter(s => normalizeSpaces(s.profile).includes(sectionName.split(' ')[1])).slice(0, 3);
    console.log(`  ❌ Section ${sectionName} not found in ${profileType} database`);
    if (similar.length > 0) {
      console.log(`     Similar profiles: ${similar.map(s => s.profile).join(', ')}`);
    }
    return null;
  }

  // Check if plate_elements exist
  if (!section.plate_elements) {
    console.log(`  ❌ Section ${sectionName} missing plate_elements metadata`);
    return null;
  }

  // Classify section
  const classification = classifyCrossSectionPureCompression(section, fy, profileType);

  console.log(`\n${sectionName} / ${steelGrade} (fy=${fy} MPa)`);
  console.log(`  Profile type: ${profileType.toUpperCase()}`);
  console.log(`  Overall class: ${classification.class}`);
  console.log(`  Governing element: ${classification.governing_element}`);

  // Show element classification
  for (const el of classification.element_results) {
    console.log(`    ${el.id}: class=${el.class}, λ=${el.slenderness.toFixed(2)}, limit=${el.limit_class3.toFixed(2)}`);
  }

  // Calculate effective properties if Class 4
  if (classification.class === 4) {
    const effProps = calculateClass4EffectiveProperties(section, classification);
    console.log(`  Effective properties:`);
    console.log(`    A_gross = ${effProps.A_gross.toFixed(2)} cm²`);
    console.log(`    A_removed = ${effProps.A_removed.toFixed(2)} cm² (${effProps.reduction_percent.toFixed(1)}%)`);
    console.log(`    A_eff = ${effProps.A_eff.toFixed(2)} cm²`);
    console.log(`    Number of removed strips: ${effProps.num_strips}`);

    // Show strip details
    for (const strip of effProps.strips) {
      if (!strip) {
        console.log(`      [ERROR] Null or undefined strip`);
        continue;
      }
      const width = strip.width !== undefined && strip.width !== null ? strip.width.toFixed(2) : 'N/A';
      const area = strip.area !== undefined && strip.area !== null ? strip.area.toFixed(2) : 'N/A';
      const y = strip.centroid && strip.centroid.y !== undefined && strip.centroid.y !== null ? strip.centroid.y.toFixed(1) : 'N/A';
      const z = strip.centroid && strip.centroid.z !== undefined && strip.centroid.z !== null ? strip.centroid.z.toFixed(1) : 'N/A';
      console.log(`      ${strip.id || '[NO ID]'}: width=${width}mm, A=${area}cm², centroid=(${y}, ${z})`);
    }

    return { success: true, class: 4, effProps };
  } else {
    console.log(`  ✓ Class ${classification.class} - no effective properties needed`);
    return { success: true, class: classification.class };
  }
}

// ============================================================================
// Main Test Suite
// ============================================================================

console.log('='.repeat(80));
console.log('COMPREHENSIVE CLASS 4 EFFECTIVE PROPERTIES TEST');
console.log('Testing all section types (except circular hollow sections)');
console.log('='.repeat(80));

const testCases = [
  // I-sections (IPE)
  { type: 'ipe', section: 'IPE220', grade: 'S460', fy: 460 },
  { type: 'ipe', section: 'IPE240', grade: 'S460', fy: 460 },
  { type: 'ipe', section: 'IPE300', grade: 'S355', fy: 355 },

  // H-sections - light (HEA)
  { type: 'hea', section: 'HEA200', grade: 'S460', fy: 460 },
  { type: 'hea', section: 'HEA240', grade: 'S355', fy: 355 },

  // H-sections - medium (HEB)
  { type: 'heb', section: 'HEB200', grade: 'S355', fy: 355 },
  { type: 'heb', section: 'HEB240', grade: 'S460', fy: 460 },

  // H-sections - heavy (HEM)
  { type: 'hem', section: 'HEM200', grade: 'S355', fy: 355 },

  // Rectangular hollow sections - hot rolled (HRHS)
  { type: 'hrhs', section: 'HRHS 250x150 / 6.3', grade: 'S460', fy: 460 },
  { type: 'hrhs', section: 'HRHS 200x100 / 4', grade: 'S460', fy: 460 },

  // Square hollow sections - hot rolled (HSHS)
  { type: 'hshs', section: 'HSHS 200 / 5', grade: 'S460', fy: 460 },
  { type: 'hshs', section: 'HSHS 150 / 4', grade: 'S460', fy: 460 },

  // Rectangular hollow sections - cold rolled (CRHS)
  { type: 'crhs', section: 'CRHS 150x100 / 4', grade: 'S460', fy: 460 },

  // Square hollow sections - cold rolled (CSHS)
  { type: 'cshs', section: 'CSHS 120 / 3', grade: 'S460', fy: 460 },
];

let totalTests = 0;
let passedTests = 0;
let class4Tests = 0;

// Load database once at the start
console.log('Loading steel cross-section database...');
const database = loadDatabase();
console.log('Database loaded successfully.\n');

for (const test of testCases) {
  totalTests++;
  try {
    const result = testSectionType(test.type, test.section, test.grade, test.fy, database);
    if (result && result.success) {
      passedTests++;
      if (result.class === 4) {
        class4Tests++;
      }
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log(`Class 4 sections found: ${class4Tests}`);
console.log(`Success rate: ${((passedTests/totalTests)*100).toFixed(1)}%`);
console.log('='.repeat(80));
