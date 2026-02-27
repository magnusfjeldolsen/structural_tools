/**
 * Detailed test of Class 4 effective properties calculation
 * Tests reduction factors and moment of inertia reductions
 */

const fs = require('fs');
const path = require('path');

// Load the API
const apiCode = fs.readFileSync(path.join(__dirname, 'flexural_buckling_api.js'), 'utf8');
eval(apiCode);

console.log('='.repeat(80));
console.log('DETAILED EFFECTIVE PROPERTIES TEST');
console.log('='.repeat(80));

// Test Case 1: IPE 220 / S460 (Class 4 web)
console.log('\nTEST 1: IPE 220 with S460 (Class 4 web)');
console.log('-'.repeat(80));

const result1 = calculateBuckling({
  profileType: 'ipe',
  profileName: 'IPE220',
  Ly: '3.5',
  Lz: '3.5',
  steelGrade: 'S460',
  fy: '460',
  gamma_M1: '1.0',
  NEd_ULS: '500',
  allowClass4: true,
  fireEnabled: false
});

if (result1.success) {
  const classification = result1.ulsResults.classification;
  const effProps = classification.effective_properties;

  console.log('\nGROSS PROPERTIES:');
  console.log(`  A_gross = ${effProps.gross_area.toFixed(2)} cm²`);
  console.log(`  i_y,gross = ${effProps.gross_iy.toFixed(2)} cm`);
  console.log(`  i_z,gross = ${effProps.gross_iz.toFixed(2)} cm`);

  console.log('\nEFFECTIVE PROPERTIES:');
  console.log(`  A_eff = ${effProps.area.toFixed(2)} cm² (${effProps.area_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_y,eff = ${effProps.iy.toFixed(2)} cm (${effProps.iy_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_z,eff = ${effProps.iz.toFixed(2)} cm (${effProps.iz_reduction_percent.toFixed(2)}% reduction)`);

  console.log('\nPLATE ELEMENT REDUCTIONS:');
  for (const plate of effProps.plate_reductions) {
    console.log(`  ${plate.element}:`);
    console.log(`    Type: ${plate.type}`);
    console.log(`    c_gross = ${plate.c_gross.toFixed(2)} mm`);
    console.log(`    c_eff = ${plate.c_eff.toFixed(2)} mm`);
    console.log(`    ρ = ${plate.rho.toFixed(4)}`);
    console.log(`    λ̄p = ${plate.lambda_p_bar.toFixed(4)}`);
    console.log(`    Area reduction = ${plate.area_reduction.toFixed(2)} cm²`);
  }

  console.log('\nBUCKLING RESISTANCE:');
  console.log(`  λ̄y = ${result1.ulsResults.slenderness_y.lambda_bar.toFixed(3)}`);
  console.log(`  λ̄z = ${result1.ulsResults.slenderness_z.lambda_bar.toFixed(3)}`);
  console.log(`  χ_min = ${result1.ulsResults.chi_min.toFixed(3)}`);
  console.log(`  Nb,Rd = ${result1.ulsResults.Nb_Rd_kN.toFixed(1)} kN`);
} else {
  console.log(`ERROR: ${result1.error}`);
}

// Test Case 2: CSHS 200x4 / S235 (Class 4 all sides)
console.log('\n' + '='.repeat(80));
console.log('TEST 2: CSHS 200x4 with S235 (Class 4 all sides)');
console.log('-'.repeat(80));

const result2 = calculateBuckling({
  profileType: 'cshs',
  profileName: 'CSHS200X4',
  Ly: '3.5',
  Lz: '3.5',
  steelGrade: 'S235',
  fy: '235',
  gamma_M1: '1.0',
  NEd_ULS: '500',
  allowClass4: true,
  fireEnabled: false
});

if (result2.success) {
  const classification = result2.ulsResults.classification;
  const effProps = classification.effective_properties;

  console.log('\nGROSS PROPERTIES:');
  console.log(`  A_gross = ${effProps.gross_area.toFixed(2)} cm²`);
  console.log(`  i_y,gross = ${effProps.gross_iy.toFixed(2)} cm`);
  console.log(`  i_z,gross = ${effProps.gross_iz.toFixed(2)} cm`);

  console.log('\nEFFECTIVE PROPERTIES:');
  console.log(`  A_eff = ${effProps.area.toFixed(2)} cm² (${effProps.area_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_y,eff = ${effProps.iy.toFixed(2)} cm (${effProps.iy_reduction_percent.toFixed(2)}% reduction)`);
  console.log(`  i_z,eff = ${effProps.iz.toFixed(2)} cm (${effProps.iz_reduction_percent.toFixed(2)}% reduction)`);

  console.log('\nPLATE ELEMENT REDUCTIONS:');
  for (const plate of effProps.plate_reductions) {
    console.log(`  ${plate.element}:`);
    console.log(`    Type: ${plate.type}`);
    console.log(`    c_gross = ${plate.c_gross.toFixed(2)} mm`);
    console.log(`    c_eff = ${plate.c_eff.toFixed(2)} mm`);
    console.log(`    ρ = ${plate.rho.toFixed(4)}`);
    console.log(`    λ̄p = ${plate.lambda_p_bar.toFixed(4)}`);
    console.log(`    Area reduction = ${plate.area_reduction.toFixed(2)} cm²`);
  }

  console.log('\nBUCKLING RESISTANCE:');
  console.log(`  λ̄y = ${result2.ulsResults.slenderness_y.lambda_bar.toFixed(3)}`);
  console.log(`  λ̄z = ${result2.ulsResults.slenderness_z.lambda_bar.toFixed(3)}`);
  console.log(`  χ_min = ${result2.ulsResults.chi_min.toFixed(3)}`);
  console.log(`  Nb,Rd = ${result2.ulsResults.Nb_Rd_kN.toFixed(1)} kN`);
} else {
  console.log(`ERROR: ${result2.error}`);
}

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
