#!/usr/bin/env node
/**
 * Investigation: Verify rho formula against PDF manual calculations
 *
 * Key question: Why does the PDF get different rho values?
 *
 * EN 1993-1-5 Section 4.4:
 * For internal compression elements (ψ = 1.0):
 *   ρ = (λ_p - 0.055(3 + ψ)) / λ_p²
 *   ρ = (λ_p - 0.22) / λ_p²  (for ψ = 1.0)
 *
 * Where:
 *   λ_p = (c/t) / (28.4 × ε × sqrt(k_σ))
 *
 * And k_σ depends on stress ratio ψ (EN 1993-1-5 Table 4.1)
 */

console.log('='.repeat(80));
console.log('INVESTIGATION: Rho Formula and PDF Calculations');
console.log('='.repeat(80));
console.log();

// ============================================================================
// IPE450 Case
// ============================================================================

console.log('█'.repeat(80));
console.log('TEST CASE: IPE450 Web');
console.log('█'.repeat(80));

const fy = 460;
const epsilon = Math.sqrt(235 / fy);
const h = 450;
const tw = 9.4;
const tf = 14.6;
const r = 21;

const bp = h - 2*tf - 2*r;  // 378.8 mm
const psi = 1.0;  // Pure compression

console.log(`ε = ${epsilon.toFixed(4)}`);
console.log(`bp = ${bp} mm`);
console.log(`ψ = ${psi}`);
console.log();

// EN 1993-1-5 Table 4.1: k_σ for internal compression elements
const k_sigma = 4.0;  // For ψ = 1.0
console.log(`k_σ = ${k_sigma} (from EN 1993-1-5 Table 4.1, ψ = 1.0)`);
console.log();

// Method 1: Using EN 1993-1-5 formula
console.log('--- METHOD 1: EN 1993-1-5 Formula ---');
const tp_method1 = tw;
const lambda_p_method1 = (bp / tp_method1) / (28.4 * epsilon * Math.sqrt(k_sigma));
const rho_method1 = (lambda_p_method1 - 0.055 * (3 + psi)) / (lambda_p_method1 * lambda_p_method1);
const rho_method1_capped = Math.min(Math.max(rho_method1, 0), 1.0);

console.log(`tp = tw = ${tp_method1} mm`);
console.log(`λ_p = (bp/tp) / (28.4 × ε × sqrt(k_σ))`);
console.log(`λ_p = ${(bp/tp_method1).toFixed(4)} / ${(28.4 * epsilon * Math.sqrt(k_sigma)).toFixed(4)}`);
console.log(`λ_p = ${lambda_p_method1.toFixed(4)}`);
console.log();
console.log(`ρ = (λ_p - 0.055(3 + ψ)) / λ_p²`);
console.log(`ρ = (${lambda_p_method1.toFixed(4)} - 0.055 × 4) / ${lambda_p_method1.toFixed(4)}²`);
console.log(`ρ = (${lambda_p_method1.toFixed(4)} - 0.22) / ${(lambda_p_method1**2).toFixed(4)}`);
console.log(`ρ = ${rho_method1.toFixed(4)} → ${rho_method1_capped.toFixed(4)} (capped to [0, 1])`);
console.log();

// Method 2: PDF calculation (uses tp = tw/2)
console.log('--- METHOD 2: PDF Calculation (tp = tw/2) ---');
const tp_method2 = tw / 2;  // 4.7 mm
const lambda_p_method2 = (bp / tp_method2) / (28.4 * epsilon * Math.sqrt(k_sigma));
const rho_method2 = (lambda_p_method2 - 0.055 * (3 + psi)) / (lambda_p_method2 * lambda_p_method2);
const rho_method2_capped = Math.min(Math.max(rho_method2, 0), 1.0);

console.log(`tp = tw/2 = ${tp_method2} mm`);
console.log(`λ_p = ${(bp/tp_method2).toFixed(4)} / ${(28.4 * epsilon * Math.sqrt(k_sigma)).toFixed(4)}`);
console.log(`λ_p = ${lambda_p_method2.toFixed(4)}`);
console.log();
console.log(`ρ = (${lambda_p_method2.toFixed(4)} - 0.22) / ${(lambda_p_method2**2).toFixed(4)}`);
console.log(`ρ = ${rho_method2.toFixed(4)} → ${rho_method2_capped.toFixed(4)}`);
console.log();

// Method 3: Current Code (uses EN 1993-1-1 limit_class3)
console.log('--- METHOD 3: Current Code (EN 1993-1-1) ---');
const limit_class3 = 42 * epsilon;  // EN 1993-1-1 Table 5.2
const tp_method3 = tw;
const lambda_p_bar_method3 = (bp / tp_method3) / limit_class3;
const rho_method3 = (lambda_p_bar_method3 - 0.055 * (3 + psi)) / (lambda_p_bar_method3 * lambda_p_bar_method3);
const rho_method3_capped = Math.min(Math.max(rho_method3, 0), 1.0);

console.log(`tp = tw = ${tp_method3} mm`);
console.log(`limit_class3 = 42 × ε = ${limit_class3.toFixed(4)} (EN 1993-1-1 Table 5.2)`);
console.log(`λ_p_bar = (bp/tp) / limit_class3`);
console.log(`λ_p_bar = ${(bp/tp_method3).toFixed(4)} / ${limit_class3.toFixed(4)}`);
console.log(`λ_p_bar = ${lambda_p_bar_method3.toFixed(4)}`);
console.log();
console.log(`ρ = (λ_p_bar - 0.22) / λ_p_bar²`);
console.log(`ρ = (${lambda_p_bar_method3.toFixed(4)} - 0.22) / ${(lambda_p_bar_method3**2).toFixed(4)}`);
console.log(`ρ = ${rho_method3.toFixed(4)} → ${rho_method3_capped.toFixed(4)}`);
console.log();

// PDF Manual value
const rho_PDF = 0.4898;
console.log('--- PDF MANUAL VALUE ---');
console.log(`ρ (from PDF) = ${rho_PDF}`);
console.log();

// Comparison
console.log('='.repeat(80));
console.log('COMPARISON');
console.log('='.repeat(80));
console.log(`Method 1 (1993-1-5, tp=tw):      ρ = ${rho_method1_capped.toFixed(4)}`);
console.log(`Method 2 (1993-1-5, tp=tw/2):    ρ = ${rho_method2_capped.toFixed(4)} ${'← PDF MATCH? ' + (Math.abs(rho_method2_capped - rho_PDF) < 0.01 ? '✓✓✓' : '✗')}`);
console.log(`Method 3 (1993-1-1, tp=tw):      ρ = ${rho_method3_capped.toFixed(4)}`);
console.log(`PDF Manual:                      ρ = ${rho_PDF}`);
console.log();

// Check if 1993-1-5 formula with tp=tw/2 matches PDF
if (Math.abs(rho_method2_capped - rho_PDF) < 0.01) {
  console.log('✓ CONFIRMED: PDF uses EN 1993-1-5 formula with tp = tw/2');
  console.log('  λ_p = (c/t) / (28.4 × ε × sqrt(k_σ))');
  console.log('  ρ = (λ_p - 0.22) / λ_p²');
} else {
  console.log('✗ No exact match found - need more investigation');
}

console.log();
console.log('='.repeat(80));
console.log('KEY FINDING');
console.log('='.repeat(80));
console.log('The PDF calculation has TWO differences from our code:');
console.log('1. Uses tp = tw/2 instead of tp = tw');
console.log('2. Uses EN 1993-1-5 formula instead of EN 1993-1-1');
console.log();
console.log('EN 1993-1-5 is for "Plated structural elements"');
console.log('EN 1993-1-1 is for "General rules"');
console.log();
console.log('Question: Which standard should we use for I-section webs?');
console.log('Answer: EN 1993-1-1 for classification, EN 1993-1-5 for effective properties');
console.log();

// Let's verify with the correct interpretation
console.log('='.repeat(80));
console.log('CORRECT INTERPRETATION');
console.log('='.repeat(80));
console.log('Classification: EN 1993-1-1 Table 5.2');
console.log('  - Uses c/t limit = 42ε for Class 3');
console.log('  - This determines IF the section is Class 4');
console.log();
console.log('Effective properties: EN 1993-1-5 Section 4.4');
console.log('  - Uses λ_p based on k_σ from stress distribution');
console.log('  - This calculates HOW MUCH reduction (ρ)');
console.log();
console.log('So we should:');
console.log('1. Classify using EN 1993-1-1 → determines class');
console.log('2. Calculate ρ using EN 1993-1-5 → determines reduction');
console.log();
console.log('Currently our code uses EN 1993-1-1 for both!');
console.log('This might be causing discrepancies.');
console.log('='.repeat(80));
