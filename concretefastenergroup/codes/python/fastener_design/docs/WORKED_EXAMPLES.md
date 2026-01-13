# Worked Examples - EC2 Part 4 Fastener Design

This document contains detailed worked examples demonstrating the fastener design system. Each example shows complete calculations with references to EC2 standards.

## Table of Contents

1. [Example 1: Single Fastener in Tension](#example-1-single-fastener-in-tension)
2. [Example 2: Fastener Group in Combined Loading](#example-2-fastener-group-in-combined-loading)
3. [Example 3: Edge Fastener in Shear](#example-3-edge-fastener-in-shear)
4. [Example 4: Seismic Loading Case](#example-4-seismic-loading-case)
5. [Example 5: Pull-out Failure Check](#example-5-pull-out-failure-check)
6. [Example 6: Combined Loading with Interaction](#example-6-combined-loading-with-interaction)

---

## Example 1: Single Fastener in Tension

### Problem Statement

Design a single M16 headed fastener with the following parameters:
- **Fastener**: M16, embedment depth hef = 100mm, steel grade fuk = 500 MPa
- **Concrete**: C25/30, cracked, member thickness h = 200mm
- **Loading**: Tension load NEd = 50 kN (static)
- **Geometry**: Edge distances c1 = c2 = 150mm

### Solution

#### Step 1: Define Fastener Properties

```python
from fastener_design import Fastener, ConcreteProperties, FastenerDesign

fastener = Fastener(
    diameter=16,           # M16
    embedment_depth=100,   # hef = 100mm
    steel_grade=500,       # fuk = 500 MPa
    area=157,              # As = 157 mm² (stress area)
    fastener_type='headed'
)
```

**Fastener Properties**:
- d = 16 mm
- hef = 100 mm
- As = 157 mm²
- fuk = 500 MPa

#### Step 2: Define Concrete Properties

```python
concrete = ConcreteProperties(
    strength_class='C25/30',  # fck = 25 MPa, fck,cube = 30 MPa
    thickness=200,            # h = 200mm
    cracked=True              # Cracked concrete
)
```

**Concrete Properties**:
- fck = 25 MPa (cylinder strength)
- fck,cube = 30 MPa (cube strength)
- kcr = 8.5 (cracked concrete)

#### Step 3: Create Design and Check All Modes

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'tension': 50000},  # NEd = 50 kN
    edge_distances={'c1': 150, 'c2': 150}
)

results = design.check_tension_modes()
```

#### Step 4: Manual Calculations

**a) Steel Failure (EC2-4-2 Section 6.2.3)**

Characteristic resistance:
```
NRk,s = As × fuk = 157 × 500 = 78,500 N = 78.5 kN
```

Design resistance (γMs = 1.2 for static):
```
NRd,s = NRk,s / γMs = 78,500 / 1.2 = 65,417 N = 65.4 kN
```

Utilization:
```
η = NEd / NRd,s = 50 / 65.4 = 0.76 ✓ OK
```

**b) Concrete Cone Failure (EC2-4-2 Section 6.2.5)**

Characteristic spacing and edge distance:
```
scr,N = 3 × hef = 3 × 100 = 300 mm
ccr,N = 1.5 × hef = 1.5 × 100 = 150 mm
```

Basic characteristic resistance:
```
NRk,c⁰ = kcr × √fck,cube × hef^1.5
      = 8.5 × √30 × 100^1.5
      = 8.5 × 5.477 × 1000
      = 46,555 N
```

Projected area (single fastener, far from edges):
```
Ac,N⁰ = scr,N² = 300² = 90,000 mm²
Ac,N = Ac,N⁰ = 90,000 mm² (no edge effects since c1,c2 ≥ ccr,N)
```

Psi factors:
- ψs,N = 1.0 (single fastener)
- ψre,N = 1.0 (c1 = 150mm ≥ ccr,N = 150mm)
- ψec,N = 1.0 (no eccentricity)
- ψM,N = 1.0 (h = 200mm ≥ 2×hef = 200mm)

Characteristic resistance:
```
NRk,c = NRk,c⁰ × (Ac,N/Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N
      = 46,555 × 1.0 × 1.0 × 1.0 × 1.0 × 1.0
      = 46,555 N = 46.6 kN
```

Design resistance (γMc = 1.5 for static):
```
NRd,c = NRk,c / γMc = 46,555 / 1.5 = 31,037 N = 31.0 kN
```

Utilization:
```
η = NEd / NRd,c = 50 / 31.0 = 1.61 ✗ FAIL
```

**c) Pull-out Failure (EC2-4-2 Section 6.2.7)**

Head diameter (assume dh = 1.8 × d):
```
dh = 1.8 × 16 = 28.8 mm
```

Head bearing area:
```
Ah = π/4 × (dh² - d²)
   = π/4 × (28.8² - 16²)
   = π/4 × (829.44 - 256)
   = 450.3 mm²
```

Characteristic resistance (k_p = 8.0 from ETS):
```
NRk,p = k_p × Ah × fck
      = 8.0 × 450.3 × 25
      = 90,060 N = 90.1 kN
```

Design resistance:
```
NRd,p = NRk,p / γMc = 90,060 / 1.5 = 60,040 N = 60.0 kN
```

Utilization:
```
η = NEd / NRd,p = 50 / 60.0 = 0.83 ✓ OK
```

#### Step 5: Results Summary

| Failure Mode | NRk (kN) | NRd (kN) | Utilization | Status |
|-------------|----------|----------|-------------|---------|
| Steel       | 78.5     | 65.4     | 0.76        | ✓ OK    |
| Cone        | 46.6     | 31.0     | 1.61        | ✗ FAIL  |
| Pull-out    | 90.1     | 60.0     | 0.83        | ✓ OK    |

**Governing Mode**: Concrete cone failure

**Conclusion**: Design FAILS due to concrete cone capacity. Recommendations:
1. Increase embedment depth hef
2. Increase concrete strength
3. Increase edge distances
4. Reduce applied load
5. Add supplementary reinforcement

---

## Example 2: Fastener Group in Combined Loading

### Problem Statement

Design a 2×2 group of M16 fasteners:
- **Fastener**: M16, hef = 100mm, fuk = 500 MPa
- **Concrete**: C25/30, cracked, h = 250mm
- **Loading**: NEd = 150 kN (total), VEd = 60 kN (total)
- **Geometry**: Spacing sx = sy = 200mm, edge distances c1 = c2 = 150mm

### Solution

#### Step 1: Setup

```python
fastener = Fastener(16, 100, 500, area=157)
concrete = ConcreteProperties(strength_class='C25/30', thickness=250, cracked=True)

design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={
        'tension': 150000,  # 150 kN total
        'shear': 60000,     # 60 kN total
        'n_fasteners': 4
    },
    spacings={'sx': 200, 'sy': 200},
    edge_distances={'c1': 150, 'c2': 150}
)

results = design.check_all_modes()
```

#### Step 2: Tension Check - Steel Failure

For 4 fasteners:
```
NRk,s = n × As × fuk = 4 × 157 × 500 = 314,000 N = 314 kN
NRd,s = 314,000 / 1.2 = 261,667 N = 261.7 kN
η = 150 / 261.7 = 0.57 ✓ OK
```

#### Step 3: Tension Check - Concrete Cone (Group Effect)

Projected area for 2×2 group:
```
scr,N = 300 mm
sx = 200 mm < scr,N (fasteners interact)

Ac,N⁰ = (sx + scr,N) × (sy + scr,N)
      = (200 + 300) × (200 + 300)
      = 500 × 500 = 250,000 mm²

For single fastener: Ac,N,1⁰ = 90,000 mm²
```

Spacing factor (EC2-4-2 Section 6.2.5.2):
```
ψs,N = Ac,N⁰ / (n × Ac,N,1⁰)
     = 250,000 / (4 × 90,000)
     = 0.694
```

Group characteristic resistance:
```
NRk,c = NRk,c⁰ × (Ac,N/Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N
      = 46,555 × 1.0 × 0.694 × 1.0 × 1.0 × 1.0
      = 32,309 N = 32.3 kN (per group)
```

Design resistance:
```
NRd,c = 32,309 / 1.5 = 21,539 N = 21.5 kN
η = 150 / 21.5 = 6.98 ✗ FAIL (severely overstressed)
```

#### Step 4: Shear Check - Steel Failure

```
VRk,s = n × k × As × fuk
      = 4 × 0.6 × 157 × 500
      = 188,400 N = 188.4 kN

VRd,s = 188,400 / 1.2 = 157,000 N = 157.0 kN
η = 60 / 157.0 = 0.38 ✓ OK
```

#### Step 5: Combined Loading Interaction

Governing capacities:
- NRd = 21.5 kN (concrete cone governs)
- VRd = 157.0 kN (steel shear governs)

Interaction check (α = β = 1.5):
```
(NEd/NRd)^α + (VEd/VRd)^β ≤ 1.0
(150/21.5)^1.5 + (60/157.0)^1.5 ≤ 1.0
(6.98)^1.5 + (0.38)^1.5 ≤ 1.0
18.44 + 0.24 = 18.68 ✗ FAIL
```

**Conclusion**: Design FAILS due to concrete cone capacity in tension. The group effect significantly reduces capacity.

---

## Example 3: Edge Fastener in Shear

### Problem Statement

Single M20 fastener near edge:
- **Fastener**: M20, hef = 150mm, fuk = 500 MPa
- **Concrete**: C30/37, non-cracked, h = 300mm
- **Loading**: VEd = 40 kN parallel to edge
- **Geometry**: Edge distance c1 = 100mm (towards edge)

### Solution

#### Step 1: Concrete Edge Failure Check

Characteristic edge distance:
```
ccr,V = 2 × hef = 2 × 150 = 300 mm
c1 = 100 mm < ccr,V (edge effect applies)
```

Basic characteristic resistance:
```
VRk,c⁰ = kucr × √(d/25) × √fck,cube × c1^1.5
       = 2.4 × √(20/25) × √37 × 100^1.5
       = 2.4 × 0.894 × 6.083 × 1000
       = 13,059 N = 13.1 kN
```

Psi factors:
- ψs,V = 1.0 (single fastener)
- ψh,V = √(1.5×c1/h) = √(150/300) = 0.707 (member thickness effect)
- ψα,V = 1.0 (load parallel to edge, α = 0°)
- ψec,V = 1.0 (no eccentricity)

Characteristic resistance:
```
VRk,c = VRk,c⁰ × ψs,V × ψh,V × ψα,V × ψec,V
      = 13,059 × 1.0 × 0.707 × 1.0 × 1.0
      = 9,233 N = 9.2 kN
```

Design resistance:
```
VRd,c = VRk,c / γMc = 9,233 / 1.5 = 6,155 N = 6.2 kN
η = 40 / 6.2 = 6.45 ✗ FAIL
```

**Conclusion**: Edge distance is too small for the applied shear load.

---

## Example 4: Seismic Loading Case

### Problem Statement

Single M20 fastener under seismic loading:
- **Fastener**: M20, hef = 150mm, fuk = 500 MPa
- **Concrete**: C30/37, **cracked** (always for seismic), h = 250mm
- **Loading**: NEd = 80 kN, VEd = 35 kN (seismic combination)
- **Edge distances**: c1 = c2 = 200mm

### Solution

#### Step 1: Material Factors (Seismic - EC2-4-1 Section 4.3)

For seismic loading (accidental limit state):
- γMs = 1.0 (reduced from 1.2)
- γMc = 1.2 (reduced from 1.5)

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'tension': 80000, 'shear': 35000},
    edge_distances={'c1': 200, 'c2': 200},
    loading_type='seismic'  # Important!
)
```

#### Step 2: Tension - Steel Failure

```
NRk,s = As × fuk = 245 × 500 = 122,500 N = 122.5 kN
NRd,s = 122,500 / 1.0 = 122,500 N = 122.5 kN (γMs = 1.0)
η = 80 / 122.5 = 0.65 ✓ OK
```

#### Step 3: Tension - Concrete Cone

```
NRk,c⁰ = kcr × √fck,cube × hef^1.5
       = 8.5 × √37 × 150^1.5
       = 8.5 × 6.083 × 1837
       = 94,959 N = 95.0 kN

NRd,c = 95,000 / 1.2 = 79,167 N = 79.2 kN (γMc = 1.2)
η = 80 / 79.2 = 1.01 ✗ marginal FAIL
```

#### Step 4: Combined Loading

```
NRd = 79.2 kN (concrete cone governs)
VRd = 61.2 kN (steel shear governs)

Interaction:
(80/79.2)^1.5 + (35/61.2)^1.5 = 1.009 + 0.440 = 1.449 ✗ FAIL
```

**Key Observation**: Even with reduced safety factors for seismic, the design still fails due to high utilization.

---

## Example 5: Pull-out Failure Check

### Problem Statement

Verify pull-out capacity for:
- **Fastener**: M16, hef = 80mm, dh = 30mm (head diameter)
- **Concrete**: C25/30, cracked
- **Loading**: NEd = 40 kN

### Solution

#### Step 1: Head Bearing Area

```
Ah = π/4 × (dh² - d²)
   = π/4 × (30² - 16²)
   = π/4 × (900 - 256)
   = 506 mm²
```

#### Step 2: Characteristic Resistance

Using k_p = 8.0 (from ETS):
```
NRk,p = k_p × Ah × fck
      = 8.0 × 506 × 25
      = 101,200 N = 101.2 kN
```

#### Step 3: Design Resistance

```
NRd,p = NRk,p / γMc = 101,200 / 1.5 = 67,467 N = 67.5 kN
η = 40 / 67.5 = 0.59 ✓ OK
```

**Observation**: Pull-out is adequate. Larger head diameter provides better bearing.

---

## Example 6: Combined Loading with Interaction

### Problem Statement

Demonstrate complete N-V interaction:
- **Fastener**: M16, hef = 100mm
- **Concrete**: C25/30, cracked, h = 200mm
- **Loading**: NEd = 30 kN, VEd = 20 kN
- **Edge distances**: c1 = c2 = 150mm

### Solution

#### Step 1: Individual Checks

From previous examples:
- Tension: NRd = 31.0 kN (concrete cone governs)
- Shear: VRd = 39.3 kN (steel shear governs)

Individual utilizations:
```
η_N = 30 / 31.0 = 0.968
η_V = 20 / 39.3 = 0.509
```

Both individually OK, but need interaction check!

#### Step 2: N-V Interaction

Formula (EC2-4-2 Section 6.7):
```
(NEd/NRd)^α + (VEd/VRd)^β ≤ 1.0

With α = β = 1.5:
(30/31.0)^1.5 + (20/39.3)^1.5
= (0.968)^1.5 + (0.509)^1.5
= 0.952 + 0.363
= 1.315 ✗ FAIL
```

**Critical Observation**:
- Tension alone: 96.8% → OK
- Shear alone: 50.9% → OK
- Combined: 131.5% → FAIL

The interaction formula is non-linear (exponents = 1.5), which accounts for the combined stress state in the concrete.

#### Step 3: Required Adjustment

To pass, interaction ratio must be ≤ 1.0. Options:
1. Reduce loads proportionally by factor of 1.315
2. Increase capacity (larger embedment, stronger concrete)
3. Use multiple fasteners

**Verification with reduced loads**:
```
NEd_new = 30 / 1.315 = 22.8 kN
VEd_new = 20 / 1.315 = 15.2 kN

Check: (22.8/31.0)^1.5 + (15.2/39.3)^1.5 = 0.652 + 0.216 = 0.868 ✓ OK
```

---

## Summary of Key Lessons

1. **Group Effects**: Spacing between fasteners significantly affects concrete capacity through the ψs factor

2. **Edge Effects**: Close edge distances dramatically reduce both tension (concrete cone) and shear (concrete edge) capacity

3. **Seismic Loading**: Reduced safety factors but concrete must be assumed cracked

4. **Interaction**: Combined loading requires non-linear interaction check even when individual checks pass

5. **Governing Modes**: Different failure modes govern under different conditions:
   - Small embedment → steel failure
   - Medium embedment → concrete failure
   - Large head → pull-out unlikely
   - Near edge → edge failure governs shear

6. **Psi Factors**: Critical for accurate capacity prediction:
   - ψs,N/V: Spacing effects
   - ψre,N: Edge distance effects
   - ψec,N/V: Load eccentricity
   - ψM,N: Member thickness
   - ψh,V: Member thickness for shear

---

## References

- CEN/TS 1992-4-1:2009 - Design of fastenings for use in concrete - Part 4-1: General
- CEN/TS 1992-4-2:2009 - Design of fastenings for use in concrete - Part 4-2: Headed fasteners
- ETAG 001 - Guideline for European Technical Approval of Metal Anchors for Use in Concrete

---

*Generated: 2026-01-07*
*Part of structural_tools EC2 Part 4 Implementation*
