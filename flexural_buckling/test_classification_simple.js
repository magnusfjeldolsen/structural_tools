/**
 * Simple test for classification - directly load section data
 */

const fs = require('fs');
const path = require('path');

// Load IPE section data
const ipeData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'steel_cross_section_database', 'ipe.json'), 'utf8'));

// Extract IPE 220 and IPE 550
const ipe220 = ipeData.profiles.find(p => p.profile === 'IPE220');
const ipe550 = ipeData.profiles.find(p => p.profile === 'IPE550');

if (!ipe220) {
  console.error('Could not find IPE220 in database');
  console.log('Available profiles:', ipeData.profiles.slice(0, 5).map(p => p.profile));
  process.exit(1);
}
if (!ipe550) {
  console.error('Could not find IPE550 in database');
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

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`IPE 220 / S460: Class ${overall_class_220_s460} ${overall_class_220_s460 === 4 ? '✓' : '✗'}`);
console.log(`IPE 550 / S235: Class ${overall_class_550_s235} ${overall_class_550_s235 === 4 ? '✓' : '✗'}`);
