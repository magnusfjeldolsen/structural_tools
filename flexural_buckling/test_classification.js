/**
 * Test script for section classification
 * Run with: node test_classification.js
 */

// Load the API file
const fs = require('fs');
const apiCode = fs.readFileSync('./flexural_buckling_api.js', 'utf8');

// Execute the API code in this context
eval(apiCode);

console.log('='.repeat(80));
console.log('SECTION CLASSIFICATION TESTS');
console.log('='.repeat(80));

// Load steel database
async function runTests() {
  await loadSteelDatabase();

  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: IPE 220 with S460 (expect Class 4 web)');
  console.log('='.repeat(80));

  const ipe220 = getSectionProperties('ipe', 'IPE 220');
  console.log('\nSection properties:', {
    h: ipe220.h,
    b: ipe220.b,
    tw: ipe220.tw,
    tf: ipe220.tf,
    r: ipe220.r
  });

  const classification_ipe220_s460 = classifySection(ipe220, 460, 'ipe');
  console.log('\nClassification Result:');
  console.log('  Overall Class:', classification_ipe220_s460.class);
  console.log('  Epsilon:', classification_ipe220_s460.epsilon.toFixed(3));
  console.log('  Governing Element:', classification_ipe220_s460.governing_element);
  console.log('  Is Class 4:', classification_ipe220_s460.is_class4);

  console.log('\n  Element Details:');
  for (const elem of classification_ipe220_s460.element_results) {
    console.log(`    ${elem.id}:`);
    console.log(`      c = ${elem.c.toFixed(2)} mm, t = ${elem.t.toFixed(2)} mm`);
    console.log(`      c/t = ${elem.slenderness.toFixed(2)}`);
    console.log(`      Limit Class 3 = ${elem.limit_class3.toFixed(2)}`);
    console.log(`      Class = ${elem.class}`);
  }

  // Manual verification for IPE 220 / S460
  const epsilon_460 = Math.sqrt(235 / 460);
  const web_height = ipe220.h - 2 * ipe220.tf - 2 * ipe220.r;
  const web_slenderness = web_height / ipe220.tw;
  const web_limit_class3 = 42 * epsilon_460;

  console.log('\n  Manual Verification (Web):');
  console.log(`    ε = √(235/460) = ${epsilon_460.toFixed(3)}`);
  console.log(`    c_web = h - 2×tf - 2×r = ${ipe220.h} - 2×${ipe220.tf} - 2×${ipe220.r} = ${web_height.toFixed(2)} mm`);
  console.log(`    c_web/t_web = ${web_height.toFixed(2)} / ${ipe220.tw} = ${web_slenderness.toFixed(2)}`);
  console.log(`    Class 3 limit = 42ε = 42 × ${epsilon_460.toFixed(3)} = ${web_limit_class3.toFixed(2)}`);
  console.log(`    ${web_slenderness.toFixed(2)} > ${web_limit_class3.toFixed(2)} ? ${web_slenderness > web_limit_class3 ? 'YES → Class 4' : 'NO → Class 3 or better'}`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: IPE 550 with S235 (expect Class 4 web)');
  console.log('='.repeat(80));

  const ipe550 = getSectionProperties('ipe', 'IPE 550');
  console.log('\nSection properties:', {
    h: ipe550.h,
    b: ipe550.b,
    tw: ipe550.tw,
    tf: ipe550.tf,
    r: ipe550.r
  });

  const classification_ipe550_s235 = classifySection(ipe550, 235, 'ipe');
  console.log('\nClassification Result:');
  console.log('  Overall Class:', classification_ipe550_s235.class);
  console.log('  Epsilon:', classification_ipe550_s235.epsilon.toFixed(3));
  console.log('  Governing Element:', classification_ipe550_s235.governing_element);
  console.log('  Is Class 4:', classification_ipe550_s235.is_class4);

  console.log('\n  Element Details:');
  for (const elem of classification_ipe550_s235.element_results) {
    console.log(`    ${elem.id}:`);
    console.log(`      c = ${elem.c.toFixed(2)} mm, t = ${elem.t.toFixed(2)} mm`);
    console.log(`      c/t = ${elem.slenderness.toFixed(2)}`);
    console.log(`      Limit Class 3 = ${elem.limit_class3.toFixed(2)}`);
    console.log(`      Class = ${elem.class}`);
  }

  // Manual verification for IPE 550 / S235
  const epsilon_235 = Math.sqrt(235 / 235);
  const web_height_550 = ipe550.h - 2 * ipe550.tf - 2 * ipe550.r;
  const web_slenderness_550 = web_height_550 / ipe550.tw;
  const web_limit_class3_550 = 42 * epsilon_235;

  console.log('\n  Manual Verification (Web):');
  console.log(`    ε = √(235/235) = ${epsilon_235.toFixed(3)}`);
  console.log(`    c_web = h - 2×tf - 2×r = ${ipe550.h} - 2×${ipe550.tf} - 2×${ipe550.r} = ${web_height_550.toFixed(2)} mm`);
  console.log(`    c_web/t_web = ${web_height_550.toFixed(2)} / ${ipe550.tw} = ${web_slenderness_550.toFixed(2)}`);
  console.log(`    Class 3 limit = 42ε = 42 × ${epsilon_235.toFixed(3)} = ${web_limit_class3_550.toFixed(2)}`);
  console.log(`    ${web_slenderness_550.toFixed(2)} > ${web_limit_class3_550.toFixed(2)} ? ${web_slenderness_550 > web_limit_class3_550 ? 'YES → Class 4' : 'NO → Class 3 or better'}`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: HEA 200 with S355 (expect Class 1 or 2)');
  console.log('='.repeat(80));

  const hea200 = getSectionProperties('hea', 'HEA 200');
  console.log('\nSection properties:', {
    h: hea200.h,
    b: hea200.b,
    tw: hea200.tw,
    tf: hea200.tf,
    r: hea200.r
  });

  const classification_hea200_s355 = classifySection(hea200, 355, 'hea');
  console.log('\nClassification Result:');
  console.log('  Overall Class:', classification_hea200_s355.class);
  console.log('  Epsilon:', classification_hea200_s355.epsilon.toFixed(3));
  console.log('  Governing Element:', classification_hea200_s355.governing_element);
  console.log('  Is Class 4:', classification_hea200_s355.is_class4);

  console.log('\n  Element Details:');
  for (const elem of classification_hea200_s355.element_results) {
    console.log(`    ${elem.id}:`);
    console.log(`      c = ${elem.c.toFixed(2)} mm, t = ${elem.t.toFixed(2)} mm`);
    console.log(`      c/t = ${elem.slenderness.toFixed(2)}`);
    console.log(`      Limit Class 3 = ${elem.limit_class3.toFixed(2)}`);
    console.log(`      Class = ${elem.class}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(80));
}

runTests().catch(console.error);
