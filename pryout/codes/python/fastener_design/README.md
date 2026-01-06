# EC2 Part 4 Fastener Design System

Python implementation for calculating fastener capacities according to Eurocode 2 Part 4-1 (General) and Part 4-2 (Headed Fasteners).

## Project Status

### Phase 1: Core Infrastructure ✅ COMPLETE

**Implemented:**
- ✅ Core classes (Fastener, FastenerGroup, ConcreteProperties, MaterialFactors)
- ✅ Input validation utilities
- ✅ Unit tests (33 tests, all passing)
- ✅ Comprehensive docstrings with standard references

### Phase 2: Basic Failure Modes ✅ COMPLETE

**Implemented:**
- ✅ Steel failure (tension and shear)
- ✅ Concrete cone failure with all ψ factors
- ✅ Concrete edge failure with all ψ factors
- ✅ Psi factor calculations module
- ✅ Geometry calculations module
- ✅ Main FastenerDesign class with UI-friendly interface
- ✅ Selectable failure modes
- ✅ Comprehensive testing (47 tests total, all passing)
- ✅ Example usage script

### Phase 3: Additional Failure Modes ✅ COMPLETE

**Implemented:**
- ✅ Pull-out failure with head bearing area calculations
- ✅ Pry-out failure related to concrete cone capacity
- ✅ Splitting failure with risk assessment
- ✅ Blow-out failure with relevance checking
- ✅ Updated FastenerDesign class with all modes
- ✅ All failure modes selectable through UI interface
- ✅ Comprehensive testing (25 tests total, all passing)

### Phase 4: Combined Loading & Integration ✅ COMPLETE

**Implemented:**
- ✅ N-V interaction check with configurable exponents (α=β=1.5 default)
- ✅ Automatic interaction check when both tension and shear loads present
- ✅ Integration with FastenerDesign class
- ✅ Detailed interaction results with governing modes
- ✅ Comprehensive testing (14 tests total, all passing)
- ✅ Example usage demonstrating interaction checks

**Next Phases:**
- Phase 5: Validation & Documentation

## Installation

```bash
# Navigate to fastener_design directory
cd pryout/codes/python/fastener_design

# Run tests
python tests/test_core.py
```

## Quick Start

### Example 1: Single Fastener

```python
from fastener_design import Fastener, ConcreteProperties, MaterialFactors

# Create a fastener
fastener = Fastener(
    diameter=16,           # M16 fastener
    embedment_depth=100,   # 100mm embedment
    steel_grade=500,       # fuk = 500 MPa
    fastener_type='headed'
)

# Create concrete properties
concrete = ConcreteProperties(
    strength_class='C25/30',  # C25/30 concrete
    thickness=200,            # 200mm thick member
    cracked=True              # Assume cracked concrete
)

# Get material factors
factors = MaterialFactors.get_all_factors('static')
print(f"γMs = {factors['gamma_Ms']}")  # 1.2
print(f"γMc = {factors['gamma_Mc']}")  # 1.5

# Get characteristic values
scr_N = fastener.get_characteristic_spacing()
ccr_N = fastener.get_characteristic_edge_distance()
print(f"Characteristic spacing: {scr_N}mm")  # 300mm
print(f"Characteristic edge distance: {ccr_N}mm")  # 150mm
```

### Example 2: Complete Design Check (NEW in Phase 2!)

```python
from design import FastenerDesign

# Create fastener and concrete
fastener = Fastener(16, 100, 500, area=157)
concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

# Create design with loading
design = FastenerDesign(
    fastener=fastener,
    concrete=concrete,
    loading={'tension': 50000, 'shear': 20000},  # 50 kN tension, 20 kN shear
    edge_distances={'c1': 150, 'c2': 150}
)

# Check all failure modes
results = design.check_all_modes()

# Print summary
print(results['summary'])

# Output:
# ==============================================================
# FASTENER DESIGN CHECK SUMMARY
# ==============================================================
#
# Fastener: Headed Fastener: M16×100mm, fuk=500MPa
# Concrete: Concrete: C25/30, h=200mm, Cracked
#
# Loading (static):
#   Tension: NEd = 50.0 kN
#   Shear:   VEd = 20.0 kN
#
# TENSION FAILURE MODES:
#   Steel       : NRd =   65.4 kN, Util =  0.76 [OK]
#   Cone        : NRd =   31.0 kN, Util =  1.61 [FAIL]
#   Governing: cone - FAIL
#
# SHEAR FAILURE MODES:
#   Steel       : NRd =   39.3 kN, Util =  0.51 [OK]
#   Edge        : NRd =   45.2 kN, Util =  0.44 [OK]
#   Governing: steel - OK
#
# OVERALL STATUS: FAIL
# ==============================================================
```

### Example 3: Selective Failure Mode Checking

```python
# Check only specific modes (useful for UI checkboxes!)
results = design.check_all_modes(
    tension_modes=['steel', 'cone'],  # Only check these
    shear_modes=['steel']              # Only steel shear
)

# Get available modes (for UI display)
available = design.get_available_modes()
print(available['tension']['implemented'])  # ['steel', 'cone', 'pullout', 'splitting', 'blowout']
print(available['shear']['implemented'])    # ['steel', 'edge', 'pryout']
```

### Example 3: Using Strength Classes

```python
from fastener_design import ConcreteProperties

# Using predefined strength class
concrete = ConcreteProperties(
    strength_class='C30/37',
    thickness=250,
    cracked=False
)

print(f"fck = {concrete.fck} MPa")  # 30 MPa
print(f"fck,cube = {concrete.fck_cube} MPa")  # 37 MPa
print(f"k-factor = {concrete.get_k_factor()}")  # 11.9 (non-cracked)

# Change to cracked
concrete.set_cracked(True)
print(f"k-factor (cracked) = {concrete.get_k_factor()}")  # 8.5
```

### Example 4: Design Resistance Calculations

```python
from fastener_design import MaterialFactors

# Characteristic resistance from calculation (example)
NRk = 100000  # 100 kN

# Calculate design resistance
NRd = MaterialFactors.calculate_design_resistance(
    characteristic_resistance=NRk,
    failure_mode='concrete',
    loading_type='static'
)
print(f"Design resistance: {NRd/1000:.1f} kN")  # 66.7 kN

# Calculate utilization
NEd = 50000  # 50 kN design load

utilization = MaterialFactors.calculate_utilization(
    design_load=NEd,
    characteristic_resistance=NRk,
    failure_mode='concrete',
    loading_type='static'
)
print(f"Utilization: {utilization:.1%}")  # 75.0%
print(f"Status: {'OK' if utilization <= 1.0 else 'FAIL'}")
```

### Example 5: Seismic Loading

```python
from fastener_design import MaterialFactors, ConcreteProperties

# For seismic loading, concrete is always cracked
concrete = ConcreteProperties(
    fck=30,
    thickness=250,
    cracked=True  # Always true for seismic!
)

# Get seismic factors
factors = MaterialFactors.get_all_factors('seismic')
print(f"γMs (seismic) = {factors['gamma_Ms']}")  # 1.0
print(f"γMc (seismic) = {factors['gamma_Mc']}")  # 1.2

# Reduced safety factors for seismic
# (because seismic is accidental limit state)
```

## API Reference

### Fastener Class

```python
Fastener(
    diameter: float,              # Fastener diameter [mm]
    embedment_depth: float,       # Effective embedment hef [mm]
    steel_grade: float,           # Characteristic strength fuk [MPa]
    area: float = None,           # Cross-sectional area As [mm²]
    fastener_type: str = 'headed',  # Type of fastener
    d_head: float = None,         # Head diameter [mm]
    material_grade: str = None    # e.g., '8.8'
)
```

**Methods:**
- `get_effective_area()` → As [mm²]
- `get_characteristic_spacing()` → scr,N = 3×hef [mm]
- `get_characteristic_edge_distance()` → ccr,N = 1.5×hef [mm]
- `to_dict()` → Dict with all properties

### FastenerGroup Class

```python
FastenerGroup(
    fasteners: List[Fastener],      # List of Fastener objects
    spacings: Dict[str, float],     # {'sx': ..., 'sy': ...} [mm]
    edge_distances: Dict[str, float],  # {'c1': ..., 'c2': ...} [mm]
    layout: str = None              # e.g., '2x2', '1x4'
)
```

**Methods:**
- `get_max_spacing()` → Maximum spacing [mm]
- `get_min_edge_distance()` → Minimum edge distance [mm]
- `get_max_edge_distance()` → Maximum edge distance [mm]
- `calculate_projected_area_cone()` → (Ac,N, Ac,N0) [mm²]

### ConcreteProperties Class

```python
ConcreteProperties(
    fck: float = None,                # Cylinder strength [MPa]
    thickness: float = 0,             # Member thickness h [mm]
    cracked: bool = False,            # Cracked concrete assumption
    reinforced: bool = False,         # Supplementary reinforcement
    strength_class: str = None,       # e.g., 'C25/30'
    fck_cube: float = None            # Cube strength [MPa]
)
```

**Methods:**
- `is_cracked()` → bool
- `set_cracked(cracked: bool)` → None
- `get_k_factor()` → k-factor for cone failure (kcr or kucr)
- `cylinder_to_cube(fck)` → fck,cube [MPa] (static method)
- `cube_to_cylinder(fck_cube)` → fck [MPa] (static method)

### MaterialFactors Class

All methods are class methods:

```python
MaterialFactors.get_steel_factor(loading_type='static') → γMs
MaterialFactors.get_concrete_factor(loading_type='static') → γMc
MaterialFactors.get_all_factors(loading_type='static') → Dict
MaterialFactors.calculate_design_resistance(Rk, failure_mode, loading_type) → Rd
MaterialFactors.calculate_utilization(Ed, Rk, failure_mode, loading_type) → ratio
```

## Standards References

All code includes docstring references to:
- **EC2-4-1**: CEN/TS 1992-4-1:2009 (General)
- **EC2-4-2**: CEN/TS 1992-4-2:2009 (Headed Fasteners)

Example:
```python
def get_characteristic_spacing(self) -> float:
    """
    Get characteristic spacing scr,N for concrete cone

    scr,N = 3 × hef

    Returns:
        scr_N: Characteristic spacing [mm]

    Standard: EC2-4-2 Section 6.2.5.2
    """
    return 3.0 * self.hef
```

## Testing

Run all unit tests:

```bash
python tests/test_core.py
```

**Test Coverage:**
- 9 tests for Fastener class
- 7 tests for FastenerGroup class
- 9 tests for ConcreteProperties class
- 8 tests for MaterialFactors class

**Total: 33 tests, all passing ✅**

## Project Structure

```
fastener_design/
├── __init__.py                    # Package initialization
├── README.md                      # This file
├── core/
│   ├── __init__.py
│   ├── fastener.py               # Fastener class
│   ├── fastener_group.py         # FastenerGroup class
│   ├── concrete.py               # ConcreteProperties class
│   └── factors.py                # MaterialFactors class
├── failure_modes/                # To be implemented (Phase 2-3)
│   ├── tension/
│   │   ├── steel_failure.py
│   │   ├── concrete_cone.py
│   │   ├── pullout.py
│   │   ├── splitting.py
│   │   └── blowout.py
│   └── shear/
│       ├── steel_failure.py
│       ├── pryout.py
│       └── concrete_edge.py
├── calculations/                  # To be implemented (Phase 2-4)
│   ├── geometry.py
│   ├── psi_factors.py
│   └── interaction.py
├── validation.py                  # Validation utilities
├── design.py                      # Main design class (Phase 4)
└── tests/
    ├── __init__.py
    └── test_core.py              # Unit tests
```

## Development Roadmap

### ✅ Phase 1: Core Infrastructure (COMPLETE)
- Core classes with full validation
- Material and safety factors
- Unit tests
- Documentation

### ✅ Phase 2: Basic Failure Modes (COMPLETE)
- Steel failure (tension and shear)
- Concrete cone failure
- Concrete edge failure
- Basic ψ factors

### ✅ Phase 3: Additional Failure Modes (COMPLETE)
- Pull-out failure
- Pry-out failure
- Splitting failure
- Blow-out failure
- All ψ factors

### ✅ Phase 4: Integration (COMPLETE)
- Combined loading (N-V interaction)
- Automatic interaction checks
- Integrated with FastenerDesign class
- Integration tests

### 🔄 Phase 5: Validation (Next)
- Worked examples from standards
- Validation against commercial software
- Comprehensive documentation
- User guide

## License

Part of structural_tools project.
Generated from EC2 Part 4 standards.

## Contributors

Implementation based on:
- CEN/TS 1992-4-1:2009 (General)
- CEN/TS 1992-4-2:2009 (Headed Fasteners)

Generated: 2026-01-06
