/**
 * Simple test for classification - directly load section data
 */

const fs = require('fs');
const path = require('path');

// Load section data
const ipeData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'ipe.json'), 'utf8'));
const heaData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'hea.json'), 'utf8'));
const cshsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'cshs.json'), 'utf8'));

// Extract test sections
const ipe220 = ipeData.profiles.find(p => p.profile === 'IPE220');
const ipe550 = ipeData.profiles.find(p => p.profile === 'IPE550');
const hea800 = heaData.profiles.find(p => p.profile === 'HEA800');
const hea500 = heaData.profiles.find(p => p.profile === 'HEA500');
const cshs200x4 = cshsData.profiles.find(p => p.profile === 'CSHS200X4');
const cshs200x5 = cshsData.profiles.find(p => p.profile === 'CSHS200X5');

if (!ipe220 || !ipe550) {
  console.error('Could not find IPE sections in database');
  process.exit(1);
}
if (!hea800 || !hea500) {
  console.error('Could not find HEA sections in database');
  process.exit(1);
}
if (!cshs200x4 || !cshs200x5) {
  console.error('Could not find CSHS sections in database');
  process.exit(1);
}

console.log('='.repeat(80));
console.log('MANUAL CLASSIFICATION VERIFICATION');
console.log('='.repeat(80));

// Test 1: IPE 220 / S460
console.log('\nTEST 1: IPE 220 with S460');
console.log('-'.repeat(80));
console.log('Section properties:', { h: ipe220.h, b: ipe220.b, tw: ipe220.tw, tf: ipe220.tf, r: ipe220.r });

const epsilon_460 = Math.sqrt(235 / 460);
const c_web_220 = ipe220.h - 2 * ipe220.tf - 2 * ipe220.r;
const c_flange_220 = ipe220.b / 2 - ipe220.tw / 2 - ipe220.r;

const web_slenderness_220 = c_web_220 / ipe220.tw;
const flange_slenderness_220 = c_flange_220 / ipe220.tf;

const web_limit_cl3_220 = 42 * epsilon_460;
const flange_limit_cl3_220 = 14 * epsilon_460;

console.log('\nCalculations:');
console.log(`  ε = √(235/460) = ${epsilon_460.toFixed(4)}`);
console.log('\n  WEB (internal element):');
console.log(`    c = h - 2×tf - 2×r = ${ipe220.h} - 2×${ipe220.tf} - 2×${ipe220.r} = ${c_web_220.toFixed(2)} mm`);
console.log(`    t = tw = ${ipe220.tw} mm`);
console.log(`    c/t = ${web_slenderness_220.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${web_limit_cl3_220.toFixed(2)}`);
console.log(`    Result: ${web_slenderness_220.toFixed(2)} ${web_slenderness_220 > web_limit_cl3_220 ? '>' : '≤'} ${web_limit_cl3_220.toFixed(2)}`);
console.log(`    → Class ${web_slenderness_220 > web_limit_cl3_220 ? '4' : '3 or better'}`);

console.log('\n  FLANGE (outstand element):');
console.log(`    c = b/2 - tw/2 - r = ${ipe220.b}/2 - ${ipe220.tw}/2 - ${ipe220.r} = ${c_flange_220.toFixed(2)} mm`);
console.log(`    t = tf = ${ipe220.tf} mm`);
console.log(`    c/t = ${flange_slenderness_220.toFixed(2)}`);
console.log(`    Class 3 limit = 14ε = ${flange_limit_cl3_220.toFixed(2)}`);
console.log(`    Result: ${flange_slenderness_220.toFixed(2)} ${flange_slenderness_220 > flange_limit_cl3_220 ? '>' : '≤'} ${flange_limit_cl3_220.toFixed(2)}`);
console.log(`    → Class ${flange_slenderness_220 > flange_limit_cl3_220 ? '4' : '3 or better'}`);

const overall_class_220_s460 = Math.max(
  web_slenderness_220 > web_limit_cl3_220 ? 4 : 3,
  flange_slenderness_220 > flange_limit_cl3_220 ? 4 : 3
);
console.log(`\n  OVERALL CLASS: ${overall_class_220_s460}`);
console.log(`  Expected: Class 4 (web governs)`);

// Test 2: IPE 550 / S235
console.log('\n' + '='.repeat(80));
console.log('TEST 2: IPE 550 with S235');
console.log('-'.repeat(80));
console.log('Section properties:', { h: ipe550.h, b: ipe550.b, tw: ipe550.tw, tf: ipe550.tf, r: ipe550.r });

const epsilon_235 = Math.sqrt(235 / 235);
const c_web_550 = ipe550.h - 2 * ipe550.tf - 2 * ipe550.r;
const c_flange_550 = ipe550.b / 2 - ipe550.tw / 2 - ipe550.r;

const web_slenderness_550 = c_web_550 / ipe550.tw;
const flange_slenderness_550 = c_flange_550 / ipe550.tf;

const web_limit_cl3_550 = 42 * epsilon_235;
const flange_limit_cl3_550 = 14 * epsilon_235;

console.log('\nCalculations:');
console.log(`  ε = √(235/235) = ${epsilon_235.toFixed(4)}`);
console.log('\n  WEB (internal element):');
console.log(`    c = h - 2×tf - 2×r = ${ipe550.h} - 2×${ipe550.tf} - 2×${ipe550.r} = ${c_web_550.toFixed(2)} mm`);
console.log(`    t = tw = ${ipe550.tw} mm`);
console.log(`    c/t = ${web_slenderness_550.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${web_limit_cl3_550.toFixed(2)}`);
console.log(`    Result: ${web_slenderness_550.toFixed(2)} ${web_slenderness_550 > web_limit_cl3_550 ? '>' : '≤'} ${web_limit_cl3_550.toFixed(2)}`);
console.log(`    → Class ${web_slenderness_550 > web_limit_cl3_550 ? '4' : '3 or better'}`);

console.log('\n  FLANGE (outstand element):');
console.log(`    c = b/2 - tw/2 - r = ${ipe550.b}/2 - ${ipe550.tw}/2 - ${ipe550.r} = ${c_flange_550.toFixed(2)} mm`);
console.log(`    t = tf = ${ipe550.tf} mm`);
console.log(`    c/t = ${flange_slenderness_550.toFixed(2)}`);
console.log(`    Class 3 limit = 14ε = ${flange_limit_cl3_550.toFixed(2)}`);
console.log(`    Result: ${flange_slenderness_550.toFixed(2)} ${flange_slenderness_550 > flange_limit_cl3_550 ? '>' : '≤'} ${flange_limit_cl3_550.toFixed(2)}`);
console.log(`    → Class ${flange_slenderness_550 > flange_limit_cl3_550 ? '4' : '3 or better'}`);

const overall_class_550_s235 = Math.max(
  web_slenderness_550 > web_limit_cl3_550 ? 4 : 3,
  flange_slenderness_550 > flange_limit_cl3_550 ? 4 : 3
);
console.log(`\n  OVERALL CLASS: ${overall_class_550_s235}`);
console.log(`  Expected: Class 4 (web governs)`);

// Test 3: HEA 800 / S235
console.log('\n' + '='.repeat(80));
console.log('TEST 3: HEA 800 with S235');
console.log('-'.repeat(80));
console.log('Section properties:', { h: hea800.h, b: hea800.b, tw: hea800.tw, tf: hea800.tf, r: hea800.r });

const epsilon_235_hea = Math.sqrt(235 / 235);
const c_web_800 = hea800.h - 2 * hea800.tf - 2 * hea800.r;
const c_flange_800 = hea800.b / 2 - hea800.tw / 2 - hea800.r;

const web_slenderness_800 = c_web_800 / hea800.tw;
const flange_slenderness_800 = c_flange_800 / hea800.tf;

const web_limit_cl3_800 = 42 * epsilon_235_hea;
const flange_limit_cl3_800 = 14 * epsilon_235_hea;

console.log('\nCalculations:');
console.log(`  ε = √(235/235) = ${epsilon_235_hea.toFixed(4)}`);
console.log('\n  WEB (internal element):');
console.log(`    c = h - 2×tf - 2×r = ${hea800.h} - 2×${hea800.tf} - 2×${hea800.r} = ${c_web_800.toFixed(2)} mm`);
console.log(`    t = tw = ${hea800.tw} mm`);
console.log(`    c/t = ${web_slenderness_800.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${web_limit_cl3_800.toFixed(2)}`);
console.log(`    Result: ${web_slenderness_800.toFixed(2)} ${web_slenderness_800 > web_limit_cl3_800 ? '>' : '≤'} ${web_limit_cl3_800.toFixed(2)}`);
console.log(`    → Class ${web_slenderness_800 > web_limit_cl3_800 ? '4' : '3 or better'}`);

console.log('\n  FLANGE (outstand element):');
console.log(`    c = b/2 - tw/2 - r = ${hea800.b}/2 - ${hea800.tw}/2 - ${hea800.r} = ${c_flange_800.toFixed(2)} mm`);
console.log(`    t = tf = ${hea800.tf} mm`);
console.log(`    c/t = ${flange_slenderness_800.toFixed(2)}`);
console.log(`    Class 3 limit = 14ε = ${flange_limit_cl3_800.toFixed(2)}`);
console.log(`    Result: ${flange_slenderness_800.toFixed(2)} ${flange_slenderness_800 > flange_limit_cl3_800 ? '>' : '≤'} ${flange_limit_cl3_800.toFixed(2)}`);
console.log(`    → Class ${flange_slenderness_800 > flange_limit_cl3_800 ? '4' : '3 or better'}`);

const overall_class_800_s235 = Math.max(
  web_slenderness_800 > web_limit_cl3_800 ? 4 : 3,
  flange_slenderness_800 > flange_limit_cl3_800 ? 4 : 3
);
console.log(`\n  OVERALL CLASS: ${overall_class_800_s235}`);
console.log(`  Expected: Class 4 (web governs)`);

// Test 4: HEA 500 / S460
console.log('\n' + '='.repeat(80));
console.log('TEST 4: HEA 500 with S460');
console.log('-'.repeat(80));
console.log('Section properties:', { h: hea500.h, b: hea500.b, tw: hea500.tw, tf: hea500.tf, r: hea500.r });

const epsilon_460_hea = Math.sqrt(235 / 460);
const c_web_500 = hea500.h - 2 * hea500.tf - 2 * hea500.r;
const c_flange_500 = hea500.b / 2 - hea500.tw / 2 - hea500.r;

const web_slenderness_500 = c_web_500 / hea500.tw;
const flange_slenderness_500 = c_flange_500 / hea500.tf;

const web_limit_cl3_500 = 42 * epsilon_460_hea;
const flange_limit_cl3_500 = 14 * epsilon_460_hea;

console.log('\nCalculations:');
console.log(`  ε = √(235/460) = ${epsilon_460_hea.toFixed(4)}`);
console.log('\n  WEB (internal element):');
console.log(`    c = h - 2×tf - 2×r = ${hea500.h} - 2×${hea500.tf} - 2×${hea500.r} = ${c_web_500.toFixed(2)} mm`);
console.log(`    t = tw = ${hea500.tw} mm`);
console.log(`    c/t = ${web_slenderness_500.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${web_limit_cl3_500.toFixed(2)}`);
console.log(`    Result: ${web_slenderness_500.toFixed(2)} ${web_slenderness_500 > web_limit_cl3_500 ? '>' : '≤'} ${web_limit_cl3_500.toFixed(2)}`);
console.log(`    → Class ${web_slenderness_500 > web_limit_cl3_500 ? '4' : '3 or better'}`);

console.log('\n  FLANGE (outstand element):');
console.log(`    c = b/2 - tw/2 - r = ${hea500.b}/2 - ${hea500.tw}/2 - ${hea500.r} = ${c_flange_500.toFixed(2)} mm`);
console.log(`    t = tf = ${hea500.tf} mm`);
console.log(`    c/t = ${flange_slenderness_500.toFixed(2)}`);
console.log(`    Class 3 limit = 14ε = ${flange_limit_cl3_500.toFixed(2)}`);
console.log(`    Result: ${flange_slenderness_500.toFixed(2)} ${flange_slenderness_500 > flange_limit_cl3_500 ? '>' : '≤'} ${flange_limit_cl3_500.toFixed(2)}`);
console.log(`    → Class ${flange_slenderness_500 > flange_limit_cl3_500 ? '4' : '3 or better'}`);

const overall_class_500_s460 = Math.max(
  web_slenderness_500 > web_limit_cl3_500 ? 4 : 3,
  flange_slenderness_500 > flange_limit_cl3_500 ? 4 : 3
);
console.log(`\n  OVERALL CLASS: ${overall_class_500_s460}`);
console.log(`  Expected: Class 4 (web governs)`);

// Test 5: CSHS 200x4 / S235 (expect Class 4)
console.log('\n' + '='.repeat(80));
console.log('TEST 5: CSHS 200x4 with S235');
console.log('-'.repeat(80));
console.log('Section properties:', { b: cshs200x4.b, t: cshs200x4.t });

const epsilon_235_cshs = Math.sqrt(235 / 235);
// For SHS: c = b - 3*t (internal element on all four sides)
const c_cshs_200x4 = cshs200x4.b - 3 * cshs200x4.t;
const slenderness_200x4 = c_cshs_200x4 / cshs200x4.t;
const limit_cl3_200x4 = 42 * epsilon_235_cshs;

console.log('\nCalculations:');
console.log(`  ε = √(235/235) = ${epsilon_235_cshs.toFixed(4)}`);
console.log('\n  INTERNAL ELEMENT (all sides):');
console.log(`    c = b - 3×t = ${cshs200x4.b} - 3×${cshs200x4.t} = ${c_cshs_200x4.toFixed(2)} mm`);
console.log(`    t = ${cshs200x4.t} mm`);
console.log(`    c/t = ${slenderness_200x4.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${limit_cl3_200x4.toFixed(2)}`);
console.log(`    Result: ${slenderness_200x4.toFixed(2)} ${slenderness_200x4 > limit_cl3_200x4 ? '>' : '≤'} ${limit_cl3_200x4.toFixed(2)}`);
console.log(`    → Class ${slenderness_200x4 > limit_cl3_200x4 ? '4' : '3 or better'}`);

const overall_class_200x4_s235 = slenderness_200x4 > limit_cl3_200x4 ? 4 : 3;
console.log(`\n  OVERALL CLASS: ${overall_class_200x4_s235}`);
console.log(`  Expected: Class 4`);

// Test 6: CSHS 200x5 / S235 (expect Class 2)
console.log('\n' + '='.repeat(80));
console.log('TEST 6: CSHS 200x5 with S235');
console.log('-'.repeat(80));
console.log('Section properties:', { b: cshs200x5.b, t: cshs200x5.t });

const c_cshs_200x5 = cshs200x5.b - 3 * cshs200x5.t;
const slenderness_200x5 = c_cshs_200x5 / cshs200x5.t;
const limit_cl2_200x5 = 38 * epsilon_235_cshs;
const limit_cl3_200x5 = 42 * epsilon_235_cshs;

console.log('\nCalculations:');
console.log(`  ε = √(235/235) = ${epsilon_235_cshs.toFixed(4)}`);
console.log('\n  INTERNAL ELEMENT (all sides):');
console.log(`    c = b - 3×t = ${cshs200x5.b} - 3×${cshs200x5.t} = ${c_cshs_200x5.toFixed(2)} mm`);
console.log(`    t = ${cshs200x5.t} mm`);
console.log(`    c/t = ${slenderness_200x5.toFixed(2)}`);
console.log(`    Class 2 limit = 38ε = ${limit_cl2_200x5.toFixed(2)}`);
console.log(`    Class 3 limit = 42ε = ${limit_cl3_200x5.toFixed(2)}`);
console.log(`    Result: ${slenderness_200x5.toFixed(2)} ${slenderness_200x5 > limit_cl3_200x5 ? '> 42ε → Class 4' : slenderness_200x5 > limit_cl2_200x5 ? '> 38ε → Class 3' : '≤ 38ε → Class 2 or better'}`);

let overall_class_200x5_s235;
if (slenderness_200x5 > limit_cl3_200x5) {
  overall_class_200x5_s235 = 4;
} else if (slenderness_200x5 > limit_cl2_200x5) {
  overall_class_200x5_s235 = 3;
} else {
  overall_class_200x5_s235 = 2;
}

console.log(`\n  OVERALL CLASS: ${overall_class_200x5_s235}`);
console.log(`  Expected: Class 2`);

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`IPE 220 / S460: Class ${overall_class_220_s460} ${overall_class_220_s460 === 4 ? '✓' : '✗'}`);
console.log(`IPE 550 / S235: Class ${overall_class_550_s235} ${overall_class_550_s235 === 4 ? '✓' : '✗'}`);
console.log(`HEA 800 / S235: Class ${overall_class_800_s235} ${overall_class_800_s235 === 4 ? '✓' : '✗'}`);
console.log(`HEA 500 / S460: Class ${overall_class_500_s460} ${overall_class_500_s460 === 4 ? '✓' : '✗'}`);
console.log(`CSHS 200x4 / S235: Class ${overall_class_200x4_s235} ${overall_class_200x4_s235 === 4 ? '✓' : '✗'}`);
console.log(`CSHS 200x5 / S235: Class ${overall_class_200x5_s235} ${overall_class_200x5_s235 === 2 ? '✓' : '✗'}`);
