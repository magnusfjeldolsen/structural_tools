/**
 * Test Find Lightest Candidate with Class 4 section support
 *
 * Expected behavior:
 * - IPE/S460 high compression → finds lightest Class 4 section with A_eff if allowed
 * - IPE/S460 avoid Class 4 → skips to heavier non-Class 4 section
 * - Console shows detailed Class 4 tracking and A_eff reduction
 */

const fs = require('fs');
const path = require('path');

// Load the API
const apiCode = fs.readFileSync(path.join(__dirname, 'flexural_buckling_api.js'), 'utf8');
eval(apiCode);

// Load steel database synchronously for Node.js testing
function loadSteelDatabaseSync() {
  const dbPath = path.join(__dirname, '..', 'steel_cross_section_database');
  const profileTypes = ['hea', 'heb', 'hem', 'ipe', 'hrhs', 'hshs', 'hchs', 'crhs', 'cshs', 'cchs'];

  steelDatabase = {}; // Reset global variable

  for (const type of profileTypes) {
    try {
      const filepath = path.join(dbPath, `${type}.json`);
      if (!fs.existsSync(filepath)) {
        console.log(`⚠ Skipping ${type}.json (not found)`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

      if (data.profiles && Array.isArray(data.profiles)) {
        const profilesObj = {};

        data.profiles.forEach(profile => {
          const name = profile.profile;

          profilesObj[name] = {
            ...profile,
            area: profile.A / 100,
            iy_moment: profile.Iy / 10000,
            iz_moment: profile.Iz / 10000,
            iy: profile.iy / 10,
            iz: profile.iz / 10,
            buckling_curve_y: profile.alpha_yy || 'b',
            buckling_curve_z: profile.alpha_zz || 'c'
          };
        });

        steelDatabase[type] = profilesObj;
        console.log(`✓ Loaded ${type}.json: ${data.profiles.length} profiles`);
      }
    } catch (error) {
      console.error(`✗ Failed to load ${type}.json:`, error.message);
    }
  }

  console.log(`\nDatabase loaded: ${Object.keys(steelDatabase).length} profile types\n`);
}

// Load database before tests
loadSteelDatabaseSync();

// Debug: Check database loading
console.log('\n' + '-'.repeat(80));
console.log('Database verification:');
console.log(`  Steel database keys: ${Object.keys(steelDatabase).join(', ')}`);
console.log(`  IPE profiles count: ${steelDatabase.ipe ? Object.keys(steelDatabase.ipe).length : 'NOT LOADED'}`);
if (steelDatabase.ipe) {
  const ipeProfiles = Object.keys(steelDatabase.ipe);
  console.log(`  First 5 IPE profiles: ${ipeProfiles.slice(0, 5).join(', ')}`);
}
console.log('-'.repeat(80));

console.log('\n' + '='.repeat(80));
console.log('FIND LIGHTEST CANDIDATE - CLASS 4 SUPPORT TEST');
console.log('='.repeat(80));

// Test Case 1: IPE with S460, high compression, ALLOW Class 4
console.log('\nTEST 1: IPE/S460/NEd=500kN, Ly=3m - ALLOW Class 4');
console.log('-'.repeat(80));
console.log('Expected: Find lightest IPE (likely Class 4 web), use A_eff\n');

const test1 = findLightestSection({
  profileType: 'ipe',
  Ly: '3.0',
  Lz: '3.0',
  steelGrade: 'S460',
  fy: '460',
  gamma_M1: '1.0',
  NEd_ULS: '500',
  allowClass4: true,
  fireEnabled: false
});

if (test1.success) {
  console.log('\n✓ SUCCESS: Found lightest section');
  console.log(`  Profile: ${test1.section.profileName}`);
  console.log(`  Tested: ${test1.testedCount} of ${test1.totalCount} profiles`);
  console.log(`  Class 4 sections skipped: ${test1.skippedClass4Count}`);
  console.log(`  Message: ${test1.message}`);

  const ulsResults = test1.section.results.ulsResults;
  console.log(`\n  Classification: Class ${ulsResults.classification.class}`);
  console.log(`  Is Class 4: ${ulsResults.classification.is_class4}`);
  console.log(`  Using effective properties: ${ulsResults.is_using_effective}`);

  if (ulsResults.is_using_effective) {
    const effProps = ulsResults.effective_properties;
    const reduction = ((1 - effProps.area / effProps.gross_area) * 100).toFixed(1);
    console.log(`  A_gross = ${effProps.gross_area.toFixed(2)} cm²`);
    console.log(`  A_eff = ${effProps.area.toFixed(2)} cm² (${reduction}% reduction)`);
  }

  console.log(`  Utilization: ${(ulsResults.utilization * 100).toFixed(1)}%`);
} else {
  console.log(`\n✗ FAILED: ${test1.error}`);
  console.log(`  Tested: ${test1.testedCount || 'unknown'} profiles`);
  console.log(`  Class 4 sections skipped: ${test1.skippedClass4Count || 0}`);
  if (test1.skippedClass4 && test1.skippedClass4.length > 0) {
    console.log('\n  Skipped Class 4 sections:');
    test1.skippedClass4.slice(0, 5).forEach(s => {
      console.log(`    - ${s.profileName}: ${s.governingElement}`);
    });
  }
}

// Test Case 2: IPE with S460, high compression, AVOID Class 4
console.log('\n' + '='.repeat(80));
console.log('TEST 2: IPE/S460/NEd=500kN, Ly=3m - AVOID Class 4');
console.log('-'.repeat(80));
console.log('Expected: Skip Class 4 sections, find heavier non-Class 4 section\n');

const test2 = findLightestSection({
  profileType: 'ipe',
  Ly: '3.0',
  Lz: '3.0',
  steelGrade: 'S460',
  fy: '460',
  gamma_M1: '1.0',
  NEd_ULS: '500',
  allowClass4: false,  // AVOID Class 4
  fireEnabled: false
});

if (test2.success) {
  console.log('\n✓ SUCCESS: Found lightest non-Class 4 section');
  console.log(`  Profile: ${test2.section.profileName}`);
  console.log(`  Tested: ${test2.testedCount} of ${test2.totalCount} profiles`);
  console.log(`  Class 4 sections skipped: ${test2.skippedClass4Count}`);
  console.log(`  Message: ${test2.message}`);

  const ulsResults = test2.section.results.ulsResults;
  console.log(`\n  Classification: Class ${ulsResults.classification.class}`);
  console.log(`  Is Class 4: ${ulsResults.classification.is_class4}`);
  console.log(`  A = ${ulsResults.classification.effective_properties.gross_area.toFixed(2)} cm²`);
  console.log(`  Utilization: ${(ulsResults.utilization * 100).toFixed(1)}%`);

  if (test2.skippedClass4Count > 0) {
    console.log(`\n  Note: ${test2.skippedClass4Count} lighter Class 4 sections were skipped`);
    console.log('  First 3 skipped:');
    test2.skippedClass4.slice(0, 3).forEach(s => {
      console.log(`    - ${s.profileName}: ${s.governingElement}`);
    });
  }
} else {
  console.log(`\n✗ FAILED: ${test2.error}`);
  console.log(`  Tested: ${test2.testedCount} profiles`);
  console.log(`  Class 4 sections skipped: ${test2.skippedClass4Count}`);

  if (test2.skippedClass4.length > 0) {
    console.log('\n  All skipped Class 4 sections:');
    test2.skippedClass4.slice(0, 10).forEach(s => {
      console.log(`    - ${s.profileName}: ${s.governingElement}`);
    });
    if (test2.skippedClass4.length > 10) {
      console.log(`    ... and ${test2.skippedClass4.length - 10} more`);
    }
  }
}

// Test Case 3: Lower compression, should work without Class 4
console.log('\n' + '='.repeat(80));
console.log('TEST 3: IPE/S460/NEd=200kN, Ly=3m - AVOID Class 4');
console.log('-'.repeat(80));
console.log('Expected: Find small IPE that is NOT Class 4 (lower compression)\n');

const test3 = findLightestSection({
  profileType: 'ipe',
  Ly: '3.0',
  Lz: '3.0',
  steelGrade: 'S460',
  fy: '460',
  gamma_M1: '1.0',
  NEd_ULS: '200',
  allowClass4: false,
  fireEnabled: false
});

if (test3.success) {
  console.log('\n✓ SUCCESS: Found lightest non-Class 4 section');
  console.log(`  Profile: ${test3.section.profileName}`);
  console.log(`  Tested: ${test3.testedCount} of ${test3.totalCount} profiles`);
  console.log(`  Class 4 sections skipped: ${test3.skippedClass4Count}`);

  const ulsResults = test3.section.results.ulsResults;
  console.log(`\n  Classification: Class ${ulsResults.classification.class}`);
  console.log(`  Is Class 4: ${ulsResults.classification.is_class4}`);
  console.log(`  Utilization: ${(ulsResults.utilization * 100).toFixed(1)}%`);
} else {
  console.log(`\n✗ FAILED: ${test3.error}`);
}

// Comparison between Test 1 and Test 2
console.log('\n' + '='.repeat(80));
console.log('COMPARISON: Allow vs Avoid Class 4 (NEd=500kN)');
console.log('-'.repeat(80));

if (test1.success && test2.success) {
  const profile1 = test1.section.profileName;
  const profile2 = test2.section.profileName;
  const A1 = test1.section.results.ulsResults.effective_properties.area;
  const A2 = test2.section.results.ulsResults.effective_properties.gross_area;
  const util1 = test1.section.results.ulsResults.utilization;
  const util2 = test2.section.results.ulsResults.utilization;

  console.log(`\nWith "Allow Class 4" enabled:`);
  console.log(`  → Found: ${profile1} (A_eff = ${A1.toFixed(2)} cm²) @ ${(util1*100).toFixed(1)}% utilization`);
  console.log(`  → Skipped: ${test1.skippedClass4Count} Class 4 sections`);

  console.log(`\nWith "Avoid Class 4" enabled:`);
  console.log(`  → Found: ${profile2} (A = ${A2.toFixed(2)} cm²) @ ${(util2*100).toFixed(1)}% utilization`);
  console.log(`  → Skipped: ${test2.skippedClass4Count} Class 4 sections`);

  if (A2 > A1) {
    const increase = ((A2 / A1 - 1) * 100).toFixed(1);
    console.log(`\n✓ Result: Avoiding Class 4 required ${increase}% more steel (${profile2} vs ${profile1})`);
  } else {
    console.log(`\n⚠ Warning: Expected heavier section when avoiding Class 4!`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
