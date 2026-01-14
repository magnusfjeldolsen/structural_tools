# Python Implementation Plan for EC2 Part 4 Fastener Design

**Generated from**: EC2 Part 4-1 (General) and Part 4-2 (Headed Fasteners)
**Purpose**: Complete specification for implementing fastener capacity calculations in Python
**Date**: 2026-01-06

---

## Document Purpose

This document provides a complete roadmap for implementing ALL necessary Python code to calculate fastener capacities according to EC2 Part 4-1 and 4-2. The detailed formulas are extracted in `FASTENER_DESIGN_SPEC.md` (2104 lines, 74 formulas extracted).

---

## Extracted Information Summary

### From Part 4-2 (Headed Fasteners):

**Tension Failure Modes**:
1. **Steel failure** (6.2.3) - Lines 375-378
2. **Pull-out failure** (6.2.4) - Needs better extraction
3. **Concrete cone failure** (6.2.5) - Lines 394-582 (188 lines, 20 formulas) ✓
4. **Splitting failure** (6.2.6) - Lines 582-658 (76 lines, 5 formulas) ✓
5. **Blow-out failure** (6.2.7) - Lines 658-779 (121 lines, 14 formulas) ✓

**Shear Failure Modes**:
1. **Steel failure** (6.3.3) - Lines 910-943 (33 lines, 4 formulas) ✓
2. **Concrete pry-out failure** (6.3.4) - Needs better extraction
3. **Concrete edge failure** (6.3.5) - Lines 986-1289 (303 lines, 31 formulas) ✓

**Combined Loading**:
- **Tension-shear interaction** (6.4) - Needs extraction

---

## Required Python Module Structure

```
pryout/codes/python/
├── __init__.py
├── core/
│   ├── __init__.py
│   ├── fastener.py          # Fastener class
│   ├── fastener_group.py    # FastenerGroup class
│   ├── concrete.py          # ConcreteProperties class
│   ├── loading.py           # Loading class
│   └── factors.py           # Material and partial factors
├── failure_modes/
│   ├── __init__.py
│   ├── tension/
│   │   ├── __init__.py
│   │   ├── steel_failure.py      # Steel tensile failure
│   │   ├── pullout_failure.py    # Pull-out failure
│   │   ├── concrete_cone.py      # Concrete cone failure
│   │   ├── splitting.py          # Splitting failure
│   │   └── blowout.py            # Blow-out failure
│   └── shear/
│       ├── __init__.py
│       ├── steel_failure.py      # Steel shear failure
│       ├── pryout.py             # Pry-out failure
│       └── concrete_edge.py      # Concrete edge failure
├── calculations/
│   ├── __init__.py
│   ├── geometry.py          # Spacing, edge distance calculations
│   ├── psi_factors.py       # ψ factors for geometry effects
│   ├── interaction.py       # N-V interaction
│   └── supplementary_reinf.py  # Supplementary reinforcement
├── design.py                # Main FastenerDesign class
├── validation.py            # Input validation
└── utils.py                 # Utility functions
```

---

## Detailed Function Specifications

### 1. Core Classes (`core/`)

#### 1.1 `fastener.py`

```python
class Fastener:
    """
    Represents a single fastener with geometry and material properties

    Attributes:
        d: Fastener diameter [mm]
        hef: Effective embedment depth [mm]
        fuk: Characteristic tensile strength of steel [N/mm²]
        As: Stressed cross-sectional area [mm²]
        fastener_type: Type ('headed', 'expansion', 'bonded', 'screw')

    Standard: EC2-4-1, EC2-4-2
    """

    def __init__(self, diameter: float, embedment_depth: float,
                 steel_grade: float, area: float = None,
                 fastener_type: str = 'headed'):
        pass

    def validate_geometry(self) -> bool:
        """Validate fastener geometry meets minimum requirements"""
        pass
```

#### 1.2 `fastener_group.py`

```python
class FastenerGroup:
    """
    Represents a group of fasteners with layout geometry

    Attributes:
        fasteners: List of Fastener objects
        s_x: Spacing in x-direction [mm]
        s_y: Spacing in y-direction [mm]
        c1: Edge distance in direction of load [mm]
        c2: Edge distance perpendicular to load [mm]
        layout: '2x2', '1x4', etc.
    """

    def __init__(self, fasteners: List[Fastener], spacings: Dict, edge_distances: Dict):
        pass

    def calculate_projected_area(self, failure_mode: str) -> float:
        """
        Calculate projected concrete area

        Standard: EC2-4-2 Section 6.2.5.2 (Concrete cone)
                  EC2-4-2 Section 6.3.5.2 (Concrete edge)
        """
        pass
```

#### 1.3 `concrete.py`

```python
class ConcreteProperties:
    """
    Concrete member properties

    Attributes:
        fck: Characteristic cylinder strength [N/mm²]
        fck_cube: Characteristic cube strength [N/mm²]
        h: Member thickness [mm]
        cracked: True if cracked concrete
        reinforced: True if supplementary reinforcement present

    Standard: EC2-4-1 Section 5.1
    """

    def __init__(self, fck: float, thickness: float, cracked: bool = False):
        self.fck = fck
        self.fck_cube = self.cylinder_to_cube(fck)  # Conversion
        self.h = thickness
        self.cracked = cracked

    @staticmethod
    def cylinder_to_cube(fck: float) -> float:
        """Convert cylinder strength to cube strength"""
        # fck_cube ≈ 1.25 * fck (approximate, check standard)
        pass
```

#### 1.4 `factors.py`

```python
class MaterialFactors:
    """
    Material partial safety factors

    Standard: EC2-4-1 Section 4.4.3
    """

    # Default values (can be overridden by National Annex)
    GAMMA_MS = 1.2   # Steel material factor
    GAMMA_MC = 1.5   # Concrete material factor
    GAMMA_MINST = 1.0  # Installation safety factor

    @classmethod
    def get_steel_factor(cls, loading_type: str = 'static') -> float:
        """
        Get partial factor for steel

        Args:
            loading_type: 'static', 'fatigue', or 'seismic'

        Returns:
            γMs value

        Standard: EC2-4-1 Table 1
        """
        pass

    @classmethod
    def get_concrete_factor(cls, loading_type: str = 'static') -> float:
        """Get partial factor for concrete"""
        pass
```

---

### 2. Tension Failure Modes (`failure_modes/tension/`)

#### 2.1 `steel_failure.py`

```python
def steel_failure_tension(fastener: Fastener, gamma_Ms: float = 1.2) -> float:
    """
    Calculate characteristic steel failure resistance in tension

    Formula: NRk,s = As × fuk

    Args:
        fastener: Fastener object with As and fuk
        gamma_Ms: Partial factor for steel (default 1.2)

    Returns:
        NRk_s: Characteristic resistance [N]

    Standard: EC2-4-2 Section 6.2.3
    Formula: Referenced in European Technical Specification

    Design resistance: NRd,s = NRk,s / γMs
    """
    NRk_s = fastener.As * fastener.fuk
    return NRk_s
```

#### 2.2 `pullout_failure.py`

```python
def pullout_failure(fastener: Fastener, concrete: ConcreteProperties) -> float:
    """
    Calculate characteristic pull-out failure resistance

    Args:
        fastener: Fastener with head diameter, embedment
        concrete: Concrete properties

    Returns:
        NRk_p: Characteristic pull-out resistance [N]

    Standard: EC2-4-2 Section 6.2.4
    Formula: To be extracted from standard (needs better extraction)

    Note: This formula depends on head bearing area and concrete strength
    """
    # TODO: Extract exact formula from standard
    pass
```

#### 2.3 `concrete_cone.py`

```python
def concrete_cone_single_fastener(fastener: Fastener,
                                  concrete: ConcreteProperties) -> float:
    """
    Calculate characteristic resistance for single fastener concrete cone failure

    For cracked concrete:
        NRk,c⁰ = kcr × fck,cube^0.5 × hef^1.5  [N]

    For non-cracked concrete:
        NRk,c⁰ = kucr × fck,cube^0.5 × hef^1.5  [N]

    Args:
        fastener: Fastener with embedment depth hef
        concrete: Concrete properties (fck_cube, cracked)

    Returns:
        NRk_c0: Characteristic resistance of single fastener [N]

    Standard: EC2-4-2 Section 6.2.5.1
    Formula: (5) for cracked, (6) for non-cracked

    Notes:
        - kcr = 8.5 for headed fasteners (typical)
        - kucr = 11.9 for headed fasteners (typical)
        - Values may vary per European Technical Specification
    """
    if concrete.cracked:
        k = 8.5  # kcr for headed fasteners
    else:
        k = 11.9  # kucr for headed fasteners

    NRk_c0 = k * (concrete.fck_cube ** 0.5) * (fastener.hef ** 1.5)
    return NRk_c0


def concrete_cone_group(fastener: Fastener,
                       concrete: ConcreteProperties,
                       group: FastenerGroup,
                       eccentricity: float = 0.0) -> float:
    """
    Calculate characteristic resistance for fastener group concrete cone failure

    Formula:
        NRk,c = NRk,c⁰ × (Ac,N / Ac,N⁰) × ψs,N × ψre,N × ψec,N × ψM,N

    Where:
        Ac,N / Ac,N⁰: Ratio of projected areas (spacing/edge effect)
        ψs,N: Shell spalling factor
        ψre,N: Reinforcement edge effect factor
        ψec,N: Eccentricity factor
        ψM,N: Position/member thickness factor

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: FastenerGroup with layout geometry
        eccentricity: Load eccentricity [mm]

    Returns:
        NRk_c: Characteristic resistance for group [N]

    Standard: EC2-4-2 Section 6.2.5
    Formula: (4)
    """
    # Base resistance
    NRk_c0 = concrete_cone_single_fastener(fastener, concrete)

    # Geometric effect (Ac,N / Ac,N⁰)
    area_ratio = calculate_concrete_cone_area_ratio(fastener, group)

    # ψs,N - Shell spalling factor (Section 6.2.5.4)
    psi_s_N = calculate_shell_spalling_factor(concrete, fastener)

    # ψre,N - Edge effect factor (Section 6.2.5.3)
    psi_re_N = calculate_edge_disturbance_factor(group, fastener)

    # ψec,N - Eccentricity factor (Section 6.2.5.5)
    psi_ec_N = calculate_eccentricity_factor_tension(eccentricity, group)

    # ψM,N - Position factor (Section 6.2.5.6, 6.2.5.7)
    psi_M_N = calculate_position_factor_tension(concrete, fastener)

    NRk_c = NRk_c0 * area_ratio * psi_s_N * psi_re_N * psi_ec_N * psi_M_N

    return NRk_c
```

#### 2.4 `splitting.py`

```python
def check_splitting_installation(fastener: Fastener,
                                 concrete: ConcreteProperties,
                                 edge_distance: float,
                                 spacing: float) -> bool:
    """
    Check splitting failure risk during installation

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        edge_distance: Minimum edge distance [mm]
        spacing: Minimum spacing [mm]

    Returns:
        safe: True if splitting is prevented

    Standard: EC2-4-2 Section 6.2.6.1

    Requirements:
        - Minimum edge distance ccr,sp
        - Minimum spacing scr,sp
        - Member thickness requirements
    """
    # TODO: Extract exact requirements from standard
    pass


def splitting_failure_loaded(fastener: Fastener,
                             concrete: ConcreteProperties,
                             group: FastenerGroup) -> float:
    """
    Calculate resistance for splitting failure under loading

    Standard: EC2-4-2 Section 6.2.6.2
    Formula: Extracted from lines 582-658

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Fastener group layout

    Returns:
        NRk,sp: Characteristic splitting resistance [N]
    """
    # TODO: Extract exact formulas from detailed spec
    pass
```

#### 2.5 `blowout.py`

```python
def blowout_failure_single(fastener: Fastener,
                           concrete: ConcreteProperties,
                           edge_distance: float) -> float:
    """
    Calculate characteristic blow-out resistance for single fastener

    Formula: Depends on edge distance c1 and concrete strength

    Args:
        fastener: Fastener properties (embedment, diameter)
        concrete: Concrete properties
        edge_distance: Edge distance c1 [mm]

    Returns:
        NRk,cb⁰: Characteristic blow-out resistance [N]

    Standard: EC2-4-2 Section 6.2.7.1
    Formula: From lines 672-689 in detailed spec
    """
    # TODO: Extract exact formula
    pass


def blowout_failure_group(fastener: Fastener,
                          concrete: ConcreteProperties,
                          group: FastenerGroup,
                          eccentricity: float = 0.0) -> float:
    """
    Calculate blow-out resistance for fastener group

    Includes geometric effects, corner effects, eccentricity

    Standard: EC2-4-2 Section 6.2.7
    Formulas: Lines 658-779 (14 formulas extracted)

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Fastener group with layout
        eccentricity: Load eccentricity [mm]

    Returns:
        NRk,cb: Characteristic blow-out resistance for group [N]
    """
    # TODO: Implement based on extracted formulas
    pass
```

---

### 3. Shear Failure Modes (`failure_modes/shear/`)

#### 3.1 `steel_failure.py` (shear)

```python
def steel_failure_shear_no_lever(fastener: Fastener,
                                 gamma_Ms: float = 1.2) -> float:
    """
    Calculate characteristic steel shear resistance without lever arm

    Formula: VRk,s = k1 × As × fuk

    where k1 depends on fastener ductility class

    Args:
        fastener: Fastener properties
        gamma_Ms: Partial factor for steel

    Returns:
        VRk_s: Characteristic shear resistance [N]

    Standard: EC2-4-2 Section 6.3.3.1
    Formula: Lines 910-919 in detailed spec
    """
    # TODO: Extract k1 factor from standard
    k1 = 0.6  # Placeholder - check standard
    VRk_s = k1 * fastener.As * fastener.fuk
    return VRk_s


def steel_failure_shear_with_lever(fastener: Fastener,
                                   lever_arm: float,
                                   gamma_Ms: float = 1.2) -> float:
    """
    Calculate steel shear resistance with lever arm

    Includes combined bending and shear effects

    Standard: EC2-4-2 Section 6.3.3.2
    Formula: Lines 919-943 (interaction formula)

    Args:
        fastener: Fastener properties
        lever_arm: Lever arm l [mm]
        gamma_Ms: Partial factor

    Returns:
        VRk_s: Characteristic shear resistance with lever arm [N]
    """
    # TODO: Extract interaction formula
    pass
```

#### 3.2 `pryout.py`

```python
def pryout_failure(fastener: Fastener,
                  concrete: ConcreteProperties,
                  group: FastenerGroup = None) -> float:
    """
    Calculate characteristic pry-out failure resistance

    Pry-out is related to concrete cone in tension:
        VRk,cp = k × NRk,c

    where k is a factor (typically 1 or 2) and NRk,c is the
    concrete cone capacity in tension

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Optional fastener group

    Returns:
        VRk_cp: Characteristic pry-out resistance [N]

    Standard: EC2-4-2 Section 6.3.4
    Formula: Needs extraction (lines around 944-986)

    Note: Pry-out forms concrete cone on opposite side to shear load
    """
    # TODO: Extract exact formula and k factor
    pass
```

#### 3.3 `concrete_edge.py`

```python
def concrete_edge_single_fastener(fastener: Fastener,
                                  concrete: ConcreteProperties,
                                  edge_distance: float,
                                  load_angle: float = 0.0) -> float:
    """
    Calculate characteristic concrete edge failure for single fastener

    Formula depends on:
        - Edge distance c1 (parallel to load direction)
        - Concrete strength fck,cube
        - Embedment depth hef
        - Load direction angle α

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        edge_distance: c1 distance to edge parallel to load [mm]
        load_angle: Angle between load and edge (0° = toward edge) [degrees]

    Returns:
        VRk,c⁰: Characteristic edge resistance for single fastener [N]

    Standard: EC2-4-2 Section 6.3.5.2.1
    Formula: Lines 1037-1091 in detailed spec
    """
    # TODO: Extract complete formula
    pass


def concrete_edge_group(fastener: Fastener,
                       concrete: ConcreteProperties,
                       group: FastenerGroup,
                       edge_distance: float,
                       load_angle: float = 0.0,
                       eccentricity: float = 0.0) -> float:
    """
    Calculate concrete edge failure for fastener group

    Formula:
        VRk,c = VRk,c⁰ × (Ac,V / Ac,V⁰) × ψs,V × ψh,V × ψec,V × ψα,V × ψre,V × ψM,V

    Where:
        Ac,V / Ac,V⁰: Projected area ratio
        ψs,V: Spacing effect factor
        ψh,V: Thickness effect factor
        ψec,V: Eccentricity factor
        ψα,V: Load direction factor
        ψre,V: Edge effect factor
        ψM,V: Position/member factor

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Fastener group layout
        edge_distance: Distance to edge c1 [mm]
        load_angle: Load direction angle [degrees]
        eccentricity: Load eccentricity [mm]

    Returns:
        VRk,c: Characteristic edge resistance for group [N]

    Standard: EC2-4-2 Section 6.3.5.2
    Formulas: Lines 986-1289 (31 formulas extracted)
    """
    # Base resistance for single fastener
    VRk_c0 = concrete_edge_single_fastener(fastener, concrete, edge_distance, load_angle)

    # All modification factors
    area_ratio = calculate_edge_area_ratio(fastener, group, edge_distance)
    psi_s_V = calculate_spacing_factor_shear(group, fastener)
    psi_h_V = calculate_thickness_factor_shear(concrete, fastener)
    psi_ec_V = calculate_eccentricity_factor_shear(eccentricity, group)
    psi_alpha_V = calculate_load_direction_factor(load_angle)
    psi_re_V = calculate_edge_reinforcement_factor(group)
    psi_M_V = calculate_position_factor_shear(concrete, fastener)

    VRk_c = VRk_c0 * area_ratio * psi_s_V * psi_h_V * psi_ec_V * psi_alpha_V * psi_re_V * psi_M_V

    return VRk_c
```

---

### 4. Geometry and Psi Factors (`calculations/`)

#### 4.1 `geometry.py`

```python
def calculate_concrete_cone_area_ratio(fastener: Fastener,
                                       group: FastenerGroup) -> float:
    """
    Calculate Ac,N / Ac,N⁰ for concrete cone failure

    Ac,N⁰ = scr,N² = (3 × hef)² = 9 × hef²  (single fastener)
    Ac,N = actual projected area considering spacing and edges

    Standard: EC2-4-2 Section 6.2.5.2
    Formula: (7), (8), (9) and Figures 3, 4

    Returns:
        Area ratio Ac,N / Ac,N⁰
    """
    # TODO: Implement based on Figure 3, 4 and formulas 7-9
    pass


def calculate_edge_area_ratio(fastener: Fastener,
                              group: FastenerGroup,
                              edge_distance: float) -> float:
    """
    Calculate Ac,V / Ac,V⁰ for concrete edge failure

    Standard: EC2-4-2 Section 6.3.5.2.2

    Returns:
        Area ratio for edge failure
    """
    # TODO: Implement based on edge failure geometry
    pass
```

#### 4.2 `psi_factors.py`

```python
def calculate_shell_spalling_factor(concrete: ConcreteProperties,
                                    fastener: Fastener) -> float:
    """
    Calculate ψs,N (shell spalling factor)

    Standard: EC2-4-2 Section 6.2.5.4
    Formula: Extracted from lines ~490-516

    Depends on:
        - Concrete cover c
        - Embedment depth hef
        - Member thickness h

    Returns:
        ψs,N: Shell spalling factor (≤ 1.0)
    """
    # TODO: Extract exact formula
    pass


def calculate_eccentricity_factor_tension(eccentricity: float,
                                          group: FastenerGroup) -> float:
    """
    Calculate ψec,N (eccentricity factor for tension)

    Standard: EC2-4-2 Section 6.2.5.5
    Formula: Function of eN and scr,N

    Args:
        eccentricity: Load eccentricity eN [mm]
        group: Fastener group (for scr,N calculation)

    Returns:
        ψec,N: Eccentricity factor (≤ 1.0)
    """
    # TODO: Extract formula
    pass


def calculate_eccentricity_factor_shear(eccentricity: float,
                                        group: FastenerGroup) -> float:
    """
    Calculate ψec,V (eccentricity factor for shear)

    Standard: EC2-4-2 Section 6.3.5.2.5

    Returns:
        ψec,V: Eccentricity factor for shear
    """
    # TODO: Extract formula
    pass


def calculate_position_factor_tension(concrete: ConcreteProperties,
                                      fastener: Fastener) -> float:
    """
    Calculate ψM,N (position/member factor for tension)

    Standard: EC2-4-2 Sections 6.2.5.6, 6.2.5.7

    Accounts for:
        - Position of fastening (surface vs embedded)
        - Narrow member effects

    Returns:
        ψM,N: Position factor
    """
    # TODO: Extract formula
    pass


def calculate_position_factor_shear(concrete: ConcreteProperties,
                                    fastener: Fastener) -> float:
    """
    Calculate ψM,V (position factor for shear)

    Standard: EC2-4-2 Section 6.3.5.2.7

    Returns:
        ψM,V: Position factor for shear
    """
    # TODO: Extract formula
    pass


def calculate_load_direction_factor(angle: float) -> float:
    """
    Calculate ψα,V (load direction factor)

    Standard: EC2-4-2 Section 6.3.5.2.6

    Args:
        angle: Angle between load and edge [degrees]

    Returns:
        ψα,V: Load direction factor
    """
    # TODO: Extract formula
    pass


def calculate_thickness_factor_shear(concrete: ConcreteProperties,
                                     fastener: Fastener) -> float:
    """
    Calculate ψh,V (member thickness factor for shear)

    Standard: EC2-4-2 Section 6.3.5.2.4

    Returns:
        ψh,V: Thickness factor
    """
    # TODO: Extract formula
    pass
```

---

### 5. Main Design Class (`design.py`)

```python
class FastenerDesign:
    """
    Main class to perform complete fastener design

    Usage:
        design = FastenerDesign(
            fastener=my_fastener,
            concrete=my_concrete,
            loading={'tension': 50000, 'shear': 20000},
            edge_distances={'c1': 100, 'c2': 150},
            spacings={'sx': 200, 'sy': 200}
        )

        results = design.check_all()
        print(results['governing_mode'])
        print(results['utilization'])
    """

    def __init__(self, fastener, concrete, loading, edge_distances,
                 spacings=None, grout_thickness=0, supplementary_reinf=False):
        self.fastener = fastener
        self.concrete = concrete
        self.NEd = loading.get('tension', 0)
        self.VEd = loading.get('shear', 0)
        self.edge_distances = edge_distances
        self.spacings = spacings
        self.grout_thickness = grout_thickness
        self.supplementary_reinf = supplementary_reinf

        # Create group if spacings provided
        if spacings:
            self.group = FastenerGroup([fastener], spacings, edge_distances)
        else:
            self.group = None

    def check_tension(self, modes='all') -> Dict:
        """
        Check tension failure modes

        Args:
            modes: 'all' or list like ['steel', 'cone', 'pullout']

        Returns:
            {
                'steel': {'NRk': 150000, 'NRd': 125000, 'utilization': 0.40},
                'cone': {'NRk': 100000, 'NRd': 66667, 'utilization': 0.75},
                'governing': 'cone',
                'min_capacity': 66667,
                'status': 'OK' or 'FAIL'
            }
        """
        results = {}

        # Steel failure
        if modes == 'all' or 'steel' in modes:
            NRk_s = steel_failure_tension(self.fastener)
            NRd_s = NRk_s / MaterialFactors.GAMMA_MS
            results['steel'] = {
                'NRk': NRk_s,
                'NRd': NRd_s,
                'utilization': self.NEd / NRd_s if NRd_s > 0 else float('inf')
            }

        # Concrete cone
        if modes == 'all' or 'cone' in modes:
            if self.group:
                NRk_c = concrete_cone_group(self.fastener, self.concrete, self.group)
            else:
                NRk_c = concrete_cone_single_fastener(self.fastener, self.concrete)
            NRd_c = NRk_c / MaterialFactors.GAMMA_MC
            results['cone'] = {
                'NRk': NRk_c,
                'NRd': NRd_c,
                'utilization': self.NEd / NRd_c if NRd_c > 0 else float('inf')
            }

        # Pull-out
        if modes == 'all' or 'pullout' in modes:
            NRk_p = pullout_failure(self.fastener, self.concrete)
            NRd_p = NRk_p / MaterialFactors.GAMMA_MC
            results['pullout'] = {
                'NRk': NRk_p,
                'NRd': NRd_p,
                'utilization': self.NEd / NRd_p if NRd_p > 0 else float('inf')
            }

        # Splitting - if applicable
        # Blow-out - if edge distance is small

        # Find governing mode
        governing = min(results, key=lambda k: results[k]['NRd'])
        results['governing'] = governing
        results['min_capacity'] = results[governing]['NRd']
        results['status'] = 'OK' if self.NEd <= results['min_capacity'] else 'FAIL'

        return results

    def check_shear(self, modes='all') -> Dict:
        """Check shear failure modes"""
        results = {}

        # Steel failure
        if modes == 'all' or 'steel' in modes:
            VRk_s = steel_failure_shear_no_lever(self.fastener)
            VRd_s = VRk_s / MaterialFactors.GAMMA_MS
            results['steel'] = {
                'VRk': VRk_s,
                'VRd': VRd_s,
                'utilization': self.VEd / VRd_s if VRd_s > 0 else float('inf')
            }

        # Concrete edge
        if modes == 'all' or 'edge' in modes:
            c1 = self.edge_distances.get('c1', float('inf'))
            if self.group:
                VRk_c = concrete_edge_group(self.fastener, self.concrete,
                                           self.group, c1)
            else:
                VRk_c = concrete_edge_single_fastener(self.fastener, self.concrete, c1)
            VRd_c = VRk_c / MaterialFactors.GAMMA_MC
            results['edge'] = {
                'VRk': VRk_c,
                'VRd': VRd_c,
                'utilization': self.VEd / VRd_c if VRd_c > 0 else float('inf')
            }

        # Pry-out
        if modes == 'all' or 'pryout' in modes:
            VRk_cp = pryout_failure(self.fastener, self.concrete, self.group)
            VRd_cp = VRk_cp / MaterialFactors.GAMMA_MC
            results['pryout'] = {
                'VRk': VRk_cp,
                'VRd': VRd_cp,
                'utilization': self.VEd / VRd_cp if VRd_cp > 0 else float('inf')
            }

        # Find governing
        governing = min(results, key=lambda k: results[k]['VRd'])
        results['governing'] = governing
        results['min_capacity'] = results[governing]['VRd']
        results['status'] = 'OK' if self.VEd <= results['min_capacity'] else 'FAIL'

        return results

    def check_combined(self) -> Dict:
        """
        Check combined tension-shear interaction

        Formula: (NEd/NRd)^α + (VEd/VRd)^β ≤ 1.0

        where α, β are interaction exponents (typically 1.5 or 2.0)

        Standard: EC2-4-2 Section 6.4

        Returns:
            {
                'interaction_ratio': 0.85,
                'status': 'OK' or 'FAIL'
            }
        """
        # TODO: Extract exact interaction formula
        pass

    def check_all(self) -> Dict:
        """
        Perform all checks and return comprehensive results

        Returns:
            Complete design check results with all failure modes
        """
        results = {
            'tension': self.check_tension() if self.NEd > 0 else None,
            'shear': self.check_shear() if self.VEd > 0 else None,
            'combined': None
        }

        if self.NEd > 0 and self.VEd > 0:
            results['combined'] = self.check_combined()

        # Overall status
        statuses = []
        if results['tension']:
            statuses.append(results['tension']['status'])
        if results['shear']:
            statuses.append(results['shear']['status'])
        if results['combined']:
            statuses.append(results['combined']['status'])

        results['overall_status'] = 'OK' if all(s == 'OK' for s in statuses) else 'FAIL'

        return results

    def generate_report(self) -> str:
        """Generate formatted text report of design checks"""
        pass
```

---

## Implementation Priority

### Phase 1: Core Infrastructure (Week 1)
1. Create module structure
2. Implement core classes (Fastener, FastenerGroup, ConcreteProperties, MaterialFactors)
3. Implement validation functions
4. Write unit tests for core classes

### Phase 2: Basic Failure Modes (Week 2)
1. Steel failure (tension and shear) - simplest
2. Concrete cone failure - most complex but well-documented
3. Concrete edge failure
4. Basic psi factors needed for above

### Phase 3: Additional Failure Modes (Week 3)
1. Pull-out failure
2. Pry-out failure
3. Splitting failure
4. Blow-out failure
5. Remaining psi factors

### Phase 4: Combined Loading & Integration (Week 4)
1. Tension-shear interaction
2. Supplementary reinforcement effects
3. Grout thickness corrections
4. Main FastenerDesign class
5. Integration testing

### Phase 5: Validation & Documentation (Week 5)
1. Validate against worked examples from standards
2. Create comprehensive test suite
3. Write user documentation
4. Create example calculations

---

## Next Steps

1. **Review FASTENER_DESIGN_SPEC.md** - Contains all 74 extracted formulas with context

2. **Extract Missing Sections**:
   - Pull-out failure (6.2.4) - Re-run extractor with better patterns
   - Pry-out failure (6.3.4) - Re-run extractor
   - Combined loading (6.4) - Add to extraction list
   - Part 4-1 material factors tables

3. **For Each Formula**:
   - Identify all variables
   - Determine units
   - Find any sub-formulas (ψ factors, etc.)
   - Note conditions of applicability
   - Write Python function with complete docstring

4. **Create Test Cases**:
   - Find worked examples in standards
   - Create validation test suite
   - Compare with commercial software if available

5. **Build Incrementally**:
   - Start with simplest failure mode (steel)
   - Test thoroughly
   - Add next failure mode
   - Test interaction with previous modes
   - Continue until complete

---

## Key Design Decisions

### Units
- All inputs in SI units: N, mm, N/mm² (MPa)
- Consistent throughout codebase
- Clear documentation in docstrings

### Error Handling
- Validate all inputs (geometry, materials)
- Check for division by zero
- Warn if outside code applicability range
- Provide clear error messages

### Code Organization
- One failure mode per file
- Clear naming conventions
- Comprehensive docstrings with standard references
- Type hints throughout

### Documentation Standard
Every function must have:
```python
def function_name(...):
    \"\"\"
    Brief description

    Detailed formula and explanation

    Args:
        param1: Description [units]
        param2: Description [units]

    Returns:
        result: Description [units]

    Standard: EC2-4-X Section X.X.X
    Formula: (X) or reference

    Notes:
        - Important assumptions
        - Limitations
        - Default values
    \"\"\"
```

---

## Files Generated

1. **FASTENER_SPEC.md** - Initial extraction (basic)
2. **FASTENER_DESIGN_SPEC.md** - Comprehensive extraction (2104 lines, 74 formulas)
3. **PYTHON_IMPLEMENTATION_PLAN.md** - This document (complete implementation guide)

---

## Contact / Questions

When implementing, refer to:
- EC2 Part 4-1 text file: `pryout/codes/1992-4-1.txt`
- EC2 Part 4-2 text file: `pryout/codes/1992-4-2.txt`
- Detailed formulas: `pryout/codes/FASTENER_DESIGN_SPEC.md`

For each formula, the spec file provides:
- Exact section in standard
- Line numbers in text file
- Formula context (surrounding text)
- Related formulas

---

**END OF IMPLEMENTATION PLAN**

Generate Python code incrementally using this plan as a guide.
Each function should cite its standard reference in the docstring.
