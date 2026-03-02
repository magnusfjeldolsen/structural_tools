# Implementation Plans Overview
## Class 4 Section Classification & Effective Properties

**Status**: ✅ READY FOR IMPLEMENTATION
**Date**: 2026-03-02
**Branch**: `class4-pure-compression`

---

## Quick Navigation

### 🎯 Start Here
**[IMPLEMENTATION_MASTER_PLAN.md](IMPLEMENTATION_MASTER_PLAN.md)** - Complete implementation guide
- Database metadata structure
- Effective properties algorithms
- Neutral axis shift calculation
- Step-by-step implementation phases
- **USE THIS to implement the system**

### 📚 Supporting Documentation

**[PLATE_REDUCTION_PATTERNS.md](PLATE_REDUCTION_PATTERNS.md)** - Pattern reference
- 5 distinct reduction patterns from EN 1993-1-5
- Visual diagrams for each pattern
- Centroid calculation methods
- When to use which pattern

**[DATABASE_METADATA_ENHANCEMENT_PLAN.md](DATABASE_METADATA_ENHANCEMENT_PLAN.md)** - Database design
- Motivation for metadata
- Parallel axis theorem explanation
- Implementation phases
- Validation strategy

**[IMPLEMENTATION_ADDENDUM.md](IMPLEMENTATION_ADDENDUM.md)** - Critical fixes
- Why proper I_eff calculation matters
- Reduction factor ρ formulas corrected
- Subtraction vs. addition approach
- Impact analysis

**[section-classification-implementation-plan.md](section-classification-implementation-plan.md)** - Original plan
- Background theory
- Section classification concept
- Database enhancement overview
- Historical context

---

## Implementation Roadmap

### ✅ Completed (Current State)
- [x] Section classification engine (EN 1993-1-1 Table 5.2)
- [x] Reduction factor ρ (element-type specific)
- [x] Basic effective properties (A_eff, I_eff approximation)
- [x] UI with Class 4 toggle
- [x] Classification results display
- [x] Validation tests (6 test cases passing)

### 🔄 Phase 1: Database Metadata (Next)
- [ ] Create `scripts/generate_plate_metadata.js`
- [ ] Add plate_elements to all profiles (~1000 profiles)
- [ ] Validate metadata for each section type
- [ ] Update API to read plate_elements

**Time estimate**: 1-2 days
**Deliverable**: Database with plate geometry

### 🔄 Phase 2: Pure Compression (ψ=1)
- [ ] Implement neutral axis shift calculation
- [ ] Implement proper I_eff with parallel axis theorem
- [ ] Calculate removed strip centroids
- [ ] Patterns A (symmetric) and C (free edge)
- [ ] Update buckling calculations

**Time estimate**: 2-3 days
**Deliverable**: Accurate effective properties for compression

### 🔄 Phase 3: Bending (ψ≠1)
- [ ] Implement all 5 reduction patterns
- [ ] Stress ratio ψ calculation
- [ ] Neutral axis shift for unsymmetric cases
- [ ] Effective section modulus W_eff
- [ ] Bending verification

**Time estimate**: 3-4 days
**Deliverable**: Full bending support

### 🔄 Phase 4: Integration & Testing
- [ ] End-to-end testing
- [ ] Validation against commercial software
- [ ] UI updates (show e_N, W_eff)
- [ ] Documentation

**Time estimate**: 1-2 days
**Deliverable**: Production-ready system

---

## Key Concepts

### Neutral Axis Shift
When plate elements are removed **unsymmetrically**, the centroid shifts:

```
e_N = Σ(A_removed × d_removed) / A_eff

Where:
- A_removed = area of ineffective strip
- d_removed = distance from strip centroid to section centroid
- A_eff = effective area after reductions
```

**Effect**: Changes effective moment of inertia by `ΔI = A_eff × e_N²`

### Parallel Axis Theorem
For each removed strip:
```
ΔI_removed = ΔI_local + ΔI_parallel

Where:
- ΔI_local = (t/12) × (width³) - strip's own inertia
- ΔI_parallel = A_removed × d² - distance contribution

Usually: ΔI_parallel >> ΔI_local (can be 16,000:1 for flanges!)
```

### Reduction Patterns (ψ-dependent)
| Pattern | Type | ψ | Description | Strips |
|---------|------|---|-------------|--------|
| A | Internal | =1 | Symmetric edges | 2 equal |
| B | Internal | >0 | Asymmetric edges | 2 unequal |
| C | Outstand | ≥0 | Free edge | 1 |
| D | Outstand | <0 | Internal strip | 1 |
| E | Internal | <0 | Compression edge | 1 |

---

## File Structure

```
flexural_buckling/
├── plans/
│   ├── README_PLANS.md                          ← You are here
│   ├── IMPLEMENTATION_MASTER_PLAN.md            ← Start here for implementation
│   ├── PLATE_REDUCTION_PATTERNS.md              ← Pattern reference
│   ├── DATABASE_METADATA_ENHANCEMENT_PLAN.md    ← Database design
│   ├── IMPLEMENTATION_ADDENDUM.md               ← Critical corrections
│   └── section-classification-implementation-plan.md  ← Original plan
│
├── litterature/
│   └── plate_reduction_ec3_1-5.pdf              ← EN 1993-1-5 excerpt
│
├── scripts/ (to be created)
│   └── generate_plate_metadata.js               ← Database generator
│
├── flexural_buckling_api.js                     ← API implementation
├── flexural_buckling_ui.js                      ← UI implementation
├── index.html                                   ← Main UI
│
└── tests/ (to be created)
    ├── test_effective_properties.js
    ├── test_neutral_axis_shift.js
    └── test_reduction_patterns.js
```

---

## Key Formulas Reference

### Classification (EN 1993-1-1 Table 5.2)
```
ε = √(235/fy)

Internal elements:
  Class 3 limit = 42ε

Outstand elements:
  Class 3 limit = 14ε

Class 4 if: c/t > Class 3 limit
```

### Reduction Factor (EN 1993-1-5 Section 4.4)
```
λ̄p = (c/t) / (limit_class3)

For internal elements:
  ρ = (λ̄p - 0.055(3+ψ)) / λ̄p²

For outstand elements:
  ρ = (λ̄p - 0.188) / λ̄p²

Clamp: 0 ≤ ρ ≤ 1.0
```

### Effective Width
```
c_eff = ρ × c_gross

For internal with ψ=1:
  b_c1 = 0.5 × c_eff
  b_c2 = 0.5 × c_eff

For outstand:
  b_eff = c_eff (from free edge)
```

### Effective Area
```
A_eff = A_gross - Σ A_removed

Where:
  A_removed = (c_gross - c_eff) × t
```

### Neutral Axis Shift
```
e_N,y = Σ(A_removed × y_strip) / A_eff
e_N,z = Σ(A_removed × z_strip) / A_eff
```

### Effective Moment of Inertia
```
Step 1: Remove strips
  For each strip:
    ΔI_local = (t/12) × (width_removed³)
    ΔI_parallel = A_removed × d²
    I_eff -= (ΔI_local + ΔI_parallel)

Step 2: Apply neutral axis shift
  I_eff,y -= A_eff × e_N,z²
  I_eff,z -= A_eff × e_N,y²

(Note: opposite axes!)
```

### Effective Section Modulus
```
W_eff = I_eff / c_max

Where:
  c_max = distance from NEW centroid to extreme fiber
  c_max = h/2 ± e_N,y  (for bending about Y)
```

---

## Validation Strategy

### Test Cases
1. **IPE220 / S460** - Class 4 web, pure compression
   - Expected: e_N ≈ 0, I_eff,y ≈ 2771.66 cm⁴

2. **HEA800 / S235** - Class 4 web, pure compression
   - Expected: e_N ≈ 0, larger reduction

3. **CSHS200X4 / S235** - Class 4 all walls
   - Expected: e_N ≈ 0 (symmetric), all walls reduced

4. **Hypothetical bending case** - ψ = -0.5
   - Expected: e_N ≠ 0, unsymmetric W_eff

### Comparison Targets
- Manual calculations
- Commercial software (SCIA, Robot, Tedds)
- Tolerance: ±2% for A_eff, I_eff, W_eff

---

## Common Pitfalls to Avoid

### ❌ Don't:
1. **Scale I_eff by area ratio**
   ```javascript
   I_eff = I_gross × (A_eff / A_gross)  // WRONG!
   ```
   → Use proper parallel axis theorem

2. **Use plate centroid for removed strip**
   ```javascript
   d = plate.centroid  // WRONG!
   ```
   → Calculate removed strip's own centroid

3. **Forget neutral axis shift correction**
   ```javascript
   I_eff = I_gross - Σ ΔI_strips  // INCOMPLETE!
   ```
   → Must also subtract A_eff × e_N²

4. **Mix up axes for e_N correction**
   ```javascript
   I_eff_y -= A_eff × e_N_y²  // WRONG!
   ```
   → Use opposite axis: I_eff_y -= A_eff × e_N_z²

### ✅ Do:
1. Read IMPLEMENTATION_MASTER_PLAN.md completely
2. Follow the phase sequence (don't skip Phase 1)
3. Test each phase before moving to next
4. Validate against manual calculations
5. Handle edge cases (missing metadata, negative values)

---

## Success Criteria

The implementation is complete when:

- [ ] All ~1000 profiles have plate_elements metadata
- [ ] Pure compression (ψ=1) accurate for all types
- [ ] Neutral axis shift correct (verified against Eurocode examples)
- [ ] I_eff within 2% of commercial software
- [ ] W_eff calculations correct for bending
- [ ] No crashes on edge cases
- [ ] All validation tests pass
- [ ] UI displays e_N and effective properties
- [ ] Documentation updated

---

## Questions?

1. **Where do I start?**
   → Read [IMPLEMENTATION_MASTER_PLAN.md](IMPLEMENTATION_MASTER_PLAN.md)

2. **Which pattern do I use?**
   → See [PLATE_REDUCTION_PATTERNS.md](PLATE_REDUCTION_PATTERNS.md) Table

3. **How do I calculate neutral axis shift?**
   → Formula in IMPLEMENTATION_MASTER_PLAN.md Section 2.2

4. **Why is parallel axis theorem important?**
   → See IMPLEMENTATION_ADDENDUM.md for impact analysis

5. **What if metadata is missing?**
   → Error handling in IMPLEMENTATION_MASTER_PLAN.md Section 6.1

---

**Last Updated**: 2026-03-02
**Status**: Ready for implementation
**Contact**: See git commit history for authors
