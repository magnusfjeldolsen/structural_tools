# Flexural Buckling Testing Suite

**Created**: 2026-03-04
**Purpose**: Verify Class 4 effective property calculations against manual reference calculations

---

## 📁 Files in this Directory

### Test Scripts
- **`test_manual_calculations_verification.js`** - Main test suite (Node.js)
  - Compares implementation against manual SMath calculations
  - Tests IPE450, IPE240, CSHS100X3, CSHS180X4
  - Run: `node test_manual_calculations_verification.js`

- **`test_rho_formula_verification.js`** - Investigates rho formula
  - Compares EN 1993-1-1 vs EN 1993-1-5 formulas
  - Shows why different lambda definitions matter
  - Run: `node test_rho_formula_verification.js`

- **`test_lambda_formula_investigation.js`** - Lambda formula deep dive
  - Analyzes the lambda calculation discrepancy
  - Shows equivalence between different formula forms
  - Run: `node test_lambda_formula_investigation.js`

### HTML Test Runner
- **`test_manual_calculations.html`** - Visual test results
  - Open in browser to see formatted test results
  - Color-coded pass/fail indicators
  - Shows exact differences between manual and computed values

### Documentation
- **`CRITICAL_BUG_FOUND.md`** - Bug identification document
- **`TEST_SUITE_SUMMARY.md`** - Comprehensive test summary
- **`TEST_RESULTS_ANALYSIS.md`** - Initial analysis

---

## 🎯 Quick Start

```bash
cd flexural_buckling/testing
node test_manual_calculations_verification.js
```

Or view in browser:
```bash
start test_manual_calculations.html
```

---

## ❌ Current Status: ALL TESTS FAIL

The current implementation has a **CRITICAL BUG** that causes:
- **10-35% under-estimation** of Class 4 section capacity
- Wrong lambda formula used for rho calculation
- Mixes EN 1993-1-1 (classification) with EN 1993-1-5 (effective properties)

**See `CRITICAL_BUG_FOUND.md` for fix details.**

---

## 📚 References

- EN 1993-1-1: Classification
- EN 1993-1-5: Effective widths
- Manual calculations: `../smath/manual_effective_sections_calculations.pdf`
