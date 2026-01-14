# User Guide - EC2 Part 4 Fastener Design System

Complete guide for using the EC2 Part 4 fastener design Python library.

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Complete Workflow](#complete-workflow)
6. [API Reference](#api-reference)
7. [Advanced Usage](#advanced-usage)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

This library implements fastener design calculations according to:
- **CEN/TS 1992-4-1:2009** - Design of fastenings for use in concrete (General)
- **CEN/TS 1992-4-2:2009** - Design of fastenings for use in concrete (Headed fasteners)

### Features

✅ **8 Failure Modes**:
- Tension: Steel, Concrete cone, Pull-out, Splitting, Blow-out
- Shear: Steel, Concrete edge, Pry-out

✅ **Combined Loading**: Automatic N-V interaction check

✅ **UI-Friendly**: Selectable failure modes for interface integration

✅ **Comprehensive**: All ψ factors, material factors, geometric calculations

✅ **Well-Tested**: 39 unit tests covering all functionality

### Typical Applications

- Building structural connections
- Equipment anchorage
- Facade attachments
- Seismic retrofits
- Industrial installations

---

## Installation

### Requirements

- Python 3.7+
- No external dependencies (pure Python)

### Setup

```bash
# Navigate to the fastener_design directory
cd pryout/codes/python/fastener_design

# Run tests to verify installation
python tests/test_core.py
python tests/test_failure_modes.py
python tests/test_interaction.py
```

All tests should pass ✅

---

## Quick Start

### Minimal Example

```python
from fastener_design import Fastener, ConcreteProperties, FastenerDesign

# 1. Define fastener
fastener = Fastener(
    diameter=16,           # M16 fastener
    embedment_depth=100,   # 100mm embedment
    steel_grade=500        # fuk = 500 MPa
)

# 2. Define concrete
concrete = ConcreteProperties(
    strength_class='C25/30',  # Standard strength class
    thickness=200,            # 200mm thick member
    cracked=True              # Assume cracked
)

# 3. Create design
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'tension': 50000},  # 50 kN
    edge_distances={'c1': 150}
)

# 4. Check all failure modes
results = design.check_all_modes()

# 5. Print summary
print(results['summary'])
```

### Output

```
============================================================
FASTENER DESIGN CHECK SUMMARY
============================================================

Fastener: Headed Fastener: M16×100mm, fuk=500MPa
Concrete: Concrete: C25/30, h=200mm, Cracked

Loading (static):
  Tension: NEd = 50.0 kN

TENSION FAILURE MODES:
  Steel       : NRd =   65.4 kN, Util =  0.76 [OK]
  Cone        : NRd =   31.0 kN, Util =  1.61 [FAIL]
  Pullout     : NRd =   60.1 kN, Util =  0.83 [OK]
  Splitting   : NRd = 666666.7 kN, Util =  0.00 [OK]
  Blowout     : NRd = 666666.7 kN, Util =  0.00 [OK]
  Governing: cone - FAIL

OVERALL STATUS: FAIL
============================================================
```

---

## Core Concepts

### 1. Fastener Properties

The `Fastener` class defines the anchor geometry and steel properties:

```python
fastener = Fastener(
    diameter=16,              # Nominal diameter [mm]
    embedment_depth=100,      # Effective embedment hef [mm]
    steel_grade=500,          # Characteristic steel strength fuk [MPa]
    area=157,                 # Stress area As [mm²] (optional)
    fastener_type='headed',   # Type: 'headed', 'hooked', etc.
    d_head=28.8,              # Head diameter [mm] (optional)
    material_grade='8.8'      # Steel grade (optional)
)
```

**Key Properties**:
- `d`: Nominal diameter
- `hef`: Effective embedment depth (critical for capacity)
- `fuk`: Ultimate steel strength
- `As`: Stress area (calculated from d if not provided)

**Characteristic Values**:
```python
scr_N = fastener.get_characteristic_spacing()       # = 3 × hef
ccr_N = fastener.get_characteristic_edge_distance() # = 1.5 × hef
```

### 2. Concrete Properties

The `ConcreteProperties` class defines concrete material:

```python
# Method 1: Using strength class (preferred)
concrete = ConcreteProperties(
    strength_class='C25/30',  # Eurocode notation
    thickness=200,            # Member thickness h [mm]
    cracked=True              # Cracked assumption
)

# Method 2: Direct strength values
concrete = ConcreteProperties(
    fck=25,                   # Cylinder strength [MPa]
    fck_cube=30,              # Cube strength [MPa]
    thickness=200,
    cracked=False
)
```

**Standard Strength Classes**:
- C12/15, C16/20, C20/25, C25/30, C30/37, C35/45, C40/50, C45/55, C50/60

**K-Factors** (for concrete cone):
- Cracked: kcr = 8.5
- Non-cracked: kucr = 11.9

### 3. Material Safety Factors

From `MaterialFactors` class:

| Loading Type | γMs (Steel) | γMc (Concrete) |
|-------------|-------------|----------------|
| Static      | 1.2         | 1.5            |
| Fatigue     | 1.4         | 1.8            |
| Seismic     | 1.0         | 1.2            |

**Important**: For seismic loading:
- Always assume cracked concrete
- Use reduced safety factors (accidental limit state)

### 4. Failure Modes

#### Tension Modes

1. **Steel Failure**
   ```
   NRk,s = As × fuk
   NRd,s = NRk,s / γMs
   ```

2. **Concrete Cone Failure**
   ```
   NRk,c = NRk,c⁰ × (Ac,N/Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N
   NRk,c⁰ = k × √fck,cube × hef^1.5
   ```

3. **Pull-out Failure**
   ```
   NRk,p = k_p × Ah × fck
   Ah = π/4 × (dh² - d²)
   ```

4. **Splitting Failure**
   - Prevented if: c ≥ 1.5d, s ≥ 2d, h ≥ 2hef
   - Or supplementary reinforcement present

5. **Blow-out Failure**
   - Relevant when c < 0.5 × hef
   - Near-edge fasteners with deep embedment

#### Shear Modes

1. **Steel Shear Failure**
   ```
   VRk,s = k × As × fuk
   k = 0.6 (typical for headed fasteners)
   ```

2. **Concrete Edge Failure**
   ```
   VRk,c = VRk,c⁰ × ψs,V × ψh,V × ψα,V × ψec,V
   VRk,c⁰ = k × √(d/25) × √fck,cube × c1^1.5
   ```

3. **Pry-out Failure**
   ```
   VRk,cp = k × NRk,c
   k = 1.0 (single), 2.0 (group)
   ```

### 5. Combined Loading (N-V Interaction)

When both tension and shear loads are present:

```
(NEd/NRd)^α + (VEd/VRd)^β ≤ 1.0
```

Default: α = β = 1.5

**Important**: This is automatically checked by `check_all_modes()` when both loads exist.

---

## Complete Workflow

### Step-by-Step Design Process

#### 1. Gather Input Data

**Fastener Data**:
- Diameter, embedment depth
- Steel grade
- Head diameter (if applicable)

**Concrete Data**:
- Strength class or fck
- Member thickness
- Cracked/non-cracked assumption

**Loading**:
- Tension load NEd [N]
- Shear load VEd [N]
- Loading type (static/fatigue/seismic)

**Geometry**:
- Edge distances c1, c2 [mm]
- Spacings sx, sy [mm] (if group)

#### 2. Create Objects

```python
from fastener_design import Fastener, ConcreteProperties, FastenerDesign

fastener = Fastener(16, 100, 500, area=157)
concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)
```

#### 3. Define Loading

**Single Fastener**:
```python
loading = {'tension': 50000}  # 50 kN tension only
loading = {'shear': 30000}    # 30 kN shear only
loading = {'tension': 50000, 'shear': 30000}  # Combined
```

**Fastener Group**:
```python
loading = {
    'tension': 200000,    # Total load on group
    'shear': 80000,
    'n_fasteners': 4      # Number of fasteners
}

spacings = {'sx': 200, 'sy': 200}  # Spacing between fasteners [mm]
```

#### 4. Create Design

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading=loading,
    edge_distances={'c1': 150, 'c2': 150},
    spacings=spacings,  # If group
    loading_type='static',  # 'static', 'fatigue', or 'seismic'
    eccentricity={'eN': 0, 'eV': 0},  # Optional
    load_angle=0  # Angle of shear load [degrees]
)
```

#### 5. Run Calculations

**Option A: Check All Modes (Recommended)**:
```python
results = design.check_all_modes()
```

**Option B: Check Specific Modes**:
```python
results = design.check_all_modes(
    tension_modes=['steel', 'cone'],  # Only these tension modes
    shear_modes=['steel']             # Only steel shear
)
```

**Option C: Check Only Tension or Shear**:
```python
tension_results = design.check_tension_modes()
shear_results = design.check_shear_modes()
```

#### 6. Interpret Results

**Print Summary**:
```python
print(results['summary'])
```

**Access Individual Results**:
```python
# Tension results
if results['tension']:
    steel_capacity = results['tension']['steel']['NRd_kN']
    cone_capacity = results['tension']['cone']['NRd_kN']
    governing_mode = results['tension']['governing']

# Shear results
if results['shear']:
    shear_capacity = results['shear']['steel']['VRd_kN']

# Interaction (if both loads present)
if results['interaction']:
    interaction_ratio = results['interaction']['interaction_ratio']
    interaction_status = results['interaction']['status']

# Overall status
overall = results['overall_status']  # 'OK' or 'FAIL'
```

#### 7. Detailed Information

Each failure mode includes an 'info' dictionary:

```python
steel_info = results['tension']['steel']['info']
print(f"As = {steel_info['As']} mm²")
print(f"fuk = {steel_info['fuk']} MPa")
print(f"Formula: {steel_info['formula']}")

cone_info = results['tension']['cone']['info']
print(f"Psi factors: {cone_info['psi_factors']}")
print(f"k-factor: {cone_info['k_factor']}")
```

---

## API Reference

### Fastener Class

#### Constructor
```python
Fastener(
    diameter: float,              # [mm]
    embedment_depth: float,       # hef [mm]
    steel_grade: float,           # fuk [MPa]
    area: float = None,           # As [mm²]
    fastener_type: str = 'headed',
    d_head: float = None,         # Head diameter [mm]
    material_grade: str = None    # e.g., '8.8'
)
```

#### Methods
- `get_effective_area()` → As [mm²]
- `get_characteristic_spacing()` → scr,N [mm]
- `get_characteristic_edge_distance()` → ccr,N [mm]
- `to_dict()` → Dictionary of properties

### ConcreteProperties Class

#### Constructor
```python
ConcreteProperties(
    fck: float = None,              # [MPa]
    thickness: float = 0,           # h [mm]
    cracked: bool = False,
    reinforced: bool = False,
    strength_class: str = None,     # e.g., 'C25/30'
    fck_cube: float = None          # [MPa]
)
```

#### Methods
- `is_cracked()` → bool
- `set_cracked(cracked: bool)`
- `get_k_factor()` → kcr or kucr
- `cylinder_to_cube(fck)` → fck,cube [MPa] (static)
- `cube_to_cylinder(fck_cube)` → fck [MPa] (static)

### FastenerDesign Class

#### Constructor
```python
FastenerDesign(
    fastener: Fastener,
    concrete: ConcreteProperties,
    loading: Dict[str, float],         # {'tension': NEd, 'shear': VEd} [N]
    edge_distances: Dict[str, float] = None,  # {'c1': ..., 'c2': ...} [mm]
    spacings: Dict[str, float] = None,  # {'sx': ..., 'sy': ...} [mm]
    loading_type: str = 'static',      # 'static', 'fatigue', 'seismic'
    eccentricity: Dict[str, float] = None,  # {'eN': ..., 'eV': ...} [mm]
    load_angle: float = 0.0            # [degrees]
)
```

#### Methods

**Check All Modes**:
```python
check_all_modes(
    tension_modes: List[str] = None,  # None = all
    shear_modes: List[str] = None
) → Dict
```

**Check Tension Only**:
```python
check_tension_modes(
    modes: List[str] = None  # ['steel', 'cone', 'pullout', 'splitting', 'blowout']
) → Dict
```

**Check Shear Only**:
```python
check_shear_modes(
    modes: List[str] = None  # ['steel', 'edge', 'pryout']
) → Dict
```

**Get Available Modes**:
```python
get_available_modes() → Dict
```

Returns:
```python
{
    'tension': {
        'all': ['steel', 'cone', 'pullout', 'splitting', 'blowout'],
        'implemented': ['steel', 'cone', 'pullout', 'splitting', 'blowout'],
        'not_implemented': []
    },
    'shear': {
        'all': ['steel', 'edge', 'pryout'],
        'implemented': ['steel', 'edge', 'pryout'],
        'not_implemented': []
    }
}
```

### Results Dictionary Structure

```python
results = {
    'tension': {
        'steel': {
            'NRk': float,      # Characteristic resistance [N]
            'NRk_kN': float,   # [kN]
            'NRd': float,      # Design resistance [N]
            'NRd_kN': float,   # [kN]
            'utilization': float,  # NEd/NRd
            'gamma_M': float,  # Safety factor used
            'info': dict       # Detailed calculation info
        },
        'cone': {...},
        'pullout': {...},
        'splitting': {...},
        'blowout': {...},
        'governing': str,      # Name of governing mode
        'min_capacity': float, # [N]
        'min_capacity_kN': float,  # [kN]
        'status': str         # 'OK' or 'FAIL'
    },
    'shear': {
        'steel': {...},
        'edge': {...},
        'pryout': {...},
        'governing': str,
        'min_capacity': float,
        'status': str
    },
    'interaction': {       # Only if both tension and shear present
        'interaction_ratio': float,  # Should be ≤ 1.0
        'tension_term': float,       # (NEd/NRd)^α
        'shear_term': float,         # (VEd/VRd)^β
        'tension_utilization': float,
        'shear_utilization': float,
        'status': str,
        'alpha': float,    # Exponent (default 1.5)
        'beta': float,     # Exponent (default 1.5)
        'governing_tension_mode': str,
        'governing_shear_mode': str,
        'NRd': float,
        'VRd': float,
        'formula': str,
        'standard_ref': str
    },
    'overall_status': str,  # 'OK' or 'FAIL'
    'summary': str         # Formatted text summary
}
```

---

## Advanced Usage

### 1. Fastener Groups

#### Rectangular Pattern

```python
from fastener_design import FastenerGroup

# Create 2×3 group (6 fasteners)
fastener = Fastener(16, 100, 500, area=157)

group = FastenerGroup(
    fasteners=[fastener] * 6,
    spacings={'sx': 200, 'sy': 150},
    edge_distances={'c1': 150, 'c2': 150},
    layout='2x3'  # Optional: helps with visualization
)

# Group properties
n = group.n_fasteners  # 6
max_spacing = group.get_max_spacing()  # 200mm
min_edge = group.get_min_edge_distance()  # 150mm

# Projected areas
Ac_N, Ac_N0 = group.calculate_projected_area_cone()
Ac_V, Ac_V0 = group.calculate_projected_area_edge()
```

#### Using with FastenerDesign

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={
        'tension': 300000,  # Total load on group
        'n_fasteners': 6
    },
    spacings={'sx': 200, 'sy': 150},
    edge_distances={'c1': 150, 'c2': 150}
)
```

The `FastenerGroup` is automatically created internally.

### 2. Load Eccentricity

For loads applied with eccentricity from the fastener group centroid:

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'tension': 100000, 'shear': 50000},
    spacings={'sx': 200, 'sy': 200},
    edge_distances={'c1': 150, 'c2': 150},
    eccentricity={'eN': 50, 'eV': 30}  # [mm] from centroid
)
```

This affects ψec,N and ψec,V factors.

### 3. Shear Load Angle

For shear loads not parallel to an edge:

```python
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'shear': 40000},
    edge_distances={'c1': 100},
    load_angle=45  # 45° from edge
)
```

This affects ψα,V factor:
- 0° (parallel): ψα,V = 1.0
- 90° (perpendicular): ψα,V = 0.5
- Between: Interpolated

### 4. Custom Material Factors

For special cases (not recommended without justification):

```python
from calculations.interaction import check_nv_interaction

# Custom interaction with different exponents
interaction = check_nv_interaction(
    NEd=50000,
    NRd=100000,
    VEd=30000,
    VRd=60000,
    alpha=2.0,  # Custom exponent
    beta=2.0
)
```

### 5. Selective Mode Checking

For optimization or specific design scenarios:

```python
# Check only concrete modes (not steel)
results = design.check_all_modes(
    tension_modes=['cone', 'pullout'],
    shear_modes=['edge']
)

# Useful for:
# - Checking if concrete limits design before adding more fasteners
# - Optimization loops
# - Sensitivity studies
```

### 6. Batch Processing

For parametric studies:

```python
import pandas as pd

# Vary embedment depth
results_list = []

for hef in range(80, 201, 20):  # 80, 100, 120, ..., 200mm
    fastener = Fastener(16, hef, 500, area=157)
    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 50000},
        edge_distances={'c1': 150}
    )

    res = design.check_tension_modes(modes=['cone'])

    results_list.append({
        'hef': hef,
        'NRd': res['cone']['NRd_kN'],
        'utilization': res['cone']['utilization'],
        'status': res['status']
    })

df = pd.DataFrame(results_list)
print(df)
```

---

## Troubleshooting

### Common Issues

#### 1. "ValueError: could not convert string to float"

**Problem**: Passing strength class as positional argument

```python
# ❌ Wrong
concrete = ConcreteProperties('C25/30', 200, True)

# ✓ Correct
concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)
```

#### 2. Very High Capacity (1e9) for Some Modes

**Explanation**: This is normal! Modes like splitting and blow-out return very high values when they are "not relevant":

- **Splitting**: Returns 1e9 when geometric requirements are met
- **Blow-out**: Returns 1e9 when edge distance is large enough

This is intentional – it means the mode doesn't govern.

#### 3. Interaction Check Missing

**Problem**: No 'interaction' in results

**Cause**: Interaction only calculated when BOTH tension and shear loads present

```python
# ❌ Only tension – no interaction
loading = {'tension': 50000}

# ✓ Both loads – interaction calculated
loading = {'tension': 50000, 'shear': 20000}
```

#### 4. Unexpected FAIL Status

**Check**:
1. Are you using correct loading type? (seismic has different factors)
2. Is concrete cracked assumption correct?
3. Are edge distances sufficient? (c1 ≥ ccr,N)
4. Is embedment depth adequate?

**Debug**:
```python
# Check individual mode details
for mode, data in results['tension'].items():
    if mode not in ['governing', 'min_capacity', 'status']:
        print(f"{mode}: {data['NRd_kN']:.1f} kN, util={data['utilization']:.2f}")
        print(f"  Info: {data['info']}")
```

#### 5. Group Capacity Lower Than Expected

**Explanation**: Group effects reduce capacity through ψs factor

For closely spaced fasteners (s < scr):
```
ψs,N = Ac,N⁰ / (n × Ac,N,1⁰) < 1.0
```

This is correct per EC2! The concrete cone areas overlap, reducing efficiency.

**Solution**: Increase spacing or accept lower efficiency.

---

## Best Practices

### 1. Design Workflow

1. **Start conservative**: Use cracked concrete, check all modes
2. **Identify governing mode**: Focus optimization there
3. **Check interaction**: Don't rely on individual checks alone
4. **Verify assumptions**: Concrete state, edge distances, etc.
5. **Document**: Use the 'info' dictionaries for reports

### 2. Concrete State Assumption

**Use cracked when**:
- Seismic loading (always)
- Flexural zones
- Near expansion joints
- No analysis proving otherwise

**Use non-cracked when**:
- Confirmed by structural analysis
- Compression zones
- Prestressed concrete
- Documented in design basis

**When in doubt**: Use cracked (conservative)

### 3. Edge Distance Selection

Minimum recommended:
- Tension: c ≥ 1.5 × hef (= ccr,N)
- Shear: c1 ≥ 2.0 × hef (= ccr,V)

For better performance:
- c ≥ 2.0 × ccr for tension
- c1 ≥ 1.5 × ccr,V for shear

### 4. Fastener Group Layout

**Optimize spacing**:
- Too small: Reduced efficiency (ψs < 1.0)
- Too large: Increased moment on base plate
- Recommended: s = (1.5 to 2.0) × scr,N

**Edge distances**:
- Keep symmetric when possible
- Minimum c ≥ ccr
- Check blow-out if c < 0.5 × hef

### 5. Load Path

Ensure:
- Load transfer mechanism is clear
- Base plate thickness adequate
- Welds/connections designed
- Grout layer considered

### 6. Quality Control

**Before production**:
- [ ] Verify all input parameters
- [ ] Check governing failure mode makes sense
- [ ] Review psi factors (should all be ≤ 1.0)
- [ ] Confirm safety factors correct for loading type
- [ ] Document design basis

**Output checks**:
- [ ] Utilization ≤ 1.0 (or < 0.9 if desired)
- [ ] No modes show unrealistic capacities
- [ ] Interaction check included if combined loading
- [ ] Results match hand calculation spot checks

---

## Frequently Asked Questions

### General

**Q: What standards does this implement?**
A: CEN/TS 1992-4-1:2009 and CEN/TS 1992-4-2:2009 (EC2 Part 4)

**Q: Can I use this for production design?**
A: Yes, but verify critical calculations and follow your jurisdiction's requirements. The code is well-tested but engineering judgment is still required.

**Q: What about other fastener types (expansion, undercut, etc.)?**
A: Currently implements headed fasteners per EC2-4-2. Expansion anchors follow similar principles but have different k-factors per ETAs.

### Technical

**Q: Why is concrete cone capacity so low?**
A: Concrete failure modes have higher safety factors (γMc = 1.5 vs γMs = 1.2). Also check:
- Is concrete cracked? (kcr = 8.5 vs kucr = 11.9)
- Are edge distances adequate?
- Is embedment depth sufficient?

**Q: When should I check splitting?**
A: Always include it, but it's typically only critical when:
- Thin members (h < 2×hef)
- Close edge distances (c < 1.5×d)
- No supplementary reinforcement
- Non-cracked concrete

**Q: How do I model dynamic loading?**
A: Use 'fatigue' loading type (γMs=1.4, γMc=1.8) and refer to EC2-4-1 Section 7 for additional fatigue checks.

**Q: Can I use this for masonry?**
A: No, this implements concrete design only. Masonry has different failure mechanisms.

### Results Interpretation

**Q: One mode shows very high capacity (1e9), is this wrong?**
A: No, it means that mode is "not relevant" for your geometry. For example:
- Blow-out when c ≥ 0.5×hef
- Splitting when requirements are met

**Q: Individual checks pass but interaction fails. Why?**
A: Interaction is non-linear (exponents = 1.5). Combined stresses interact in a way that's more severe than simple addition. This is correct per EC2.

**Q: What's the difference between NRk and NRd?**
A:
- NRk = Characteristic resistance (mean value - safety factor)
- NRd = Design resistance = NRk / γM (with safety factor applied)
- Always check against NRd!

---

## Further Reading

### Standards
- CEN/TS 1992-4-1:2009 - General provisions
- CEN/TS 1992-4-2:2009 - Headed fasteners
- ETAG 001 Annex C - European Technical Approval Guideline

### Technical Papers
- Eligehausen, R., Mallée, R., Silva, J.F. (2006). "Anchorage in Concrete Construction"
- fib Bulletin 58 (2011). "Design of anchorages in concrete"

### Online Resources
- [structural_tools GitHub](https://github.com/magnusfjeldolsen/structural_tools)
- [Example Usage Script](../example_usage.py)
- [Worked Examples](WORKED_EXAMPLES.md)

---

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/magnusfjeldolsen/structural_tools/issues
- Documentation: See README.md in project root

---

*User Guide Version: 1.0*
*Last Updated: 2026-01-07*
*Part of structural_tools EC2 Part 4 Implementation*
