# Concrete Anchorage Length Calculator
Based on Eurocode 2 (EC2) Section 8.4

## INPUTS

### Basic Parameters
- **SEd** [kN] - Design tension force
- **phi_l** [mm] - Diameter of rebar to be anchored
- **n_l** - Number of rebars
- **As_l** [mm²] - Total rebar area = n_l × π × phi_l² / 4 (calculated)
- **phi_t** [mm] - Diameter of rebars in transverse direction

### Material Properties
- **Concrete quality** - Dropdown selection (e.g., B30, from EC2 concrete module)
- **Rebar quality** - Manual input or dropdown (default: B500NC, fyk = 500 MPa)
- **gamma_c** - Concrete material factor (user input, standard: 1.5)
- **gamma_s** - Steel material factor (standard: 1.25)
- **alpha_cc** - Coefficient for concrete strength (standard: 0.85)

### Stress Parameters
- **sigma_sEd** [MPa] - Design stress in rebar
  - Default calculation: SEd × 1000 / As_l
  - Can be manually overwritten (highlight cell in orange if overwritten)
  - Mathematical expressions allowed
- **sigma_sd** [MPa] - Design stress used in calculations
  - If sigma_sEd is blank: use sigma_sd = fyd
  - Otherwise: sigma_sd = sigma_sEd

### Cover Settings
- **c** [mm] - Concrete cover (top/bottom)
- **c1** [mm] - Concrete cover at sides
- **cc_phi_l** [mm] - Center-to-center distance of main rebars

### Calculated Cover Parameters
- **a** [mm] - Clear spacing between rebars = cc_phi_l - phi_l
- **cd** [mm] - Minimum of (c, a/2)

### Bar Configuration (Dropdowns)
- **Tension/Compression** - Tension or compression anchoring
  - Options: "Tension", "Compression"
- **Bar Shape** - Straight or non-straight rebars
  - Options: "Straight", "Non-straight"
- **Bar Type** - Specific bar configuration (affects cd calculation)
  - Options:
    - "Straight bars" (rette stenger)
    - "Angle hooks or hooks" (vinkelkroker eller kroker)
    - "Loops" (sløyfer)
- **Element Type** - Structural element type
  - Options: "Slab", "Beam"

---

## CALCULATIONS

### 8.4.2 Design Bond Strength

#### Bond Conditions
- **eta_1** - Coefficient for bond conditions
  - 1.0 for good bond conditions
  - 0.7 for poor bond conditions
  - Default: 1.0

- **eta_2** - Coefficient for bar diameter
  - 1.0 for phi ≤ 32 mm
  - (132 - phi) / 100 for phi > 32 mm

- **fctk,0.05** [MPa] - Characteristic tensile strength of concrete (5% fractile)
  - From concrete quality selection

- **fctd** [MPa] - Design tensile strength
  - fctd = alpha_cc × fctk,0.05 / gamma_c

- **fbd** [MPa] - Design bond strength
  - fbd = 2.25 × eta_1 × eta_2 × fctd

### 8.4.3 Basic Required Anchorage Length (lb,rqd)

- **fyk** [MPa] - Characteristic yield strength of reinforcement
- **fyd** [MPa] - Design yield strength = fyk / gamma_s

- **lb,rqd** [mm] - Basic required anchorage length
  - lb,rqd = (phi_l / 4) × (sigma_sd / fbd)

### 8.4.4 Design Anchorage Length

#### Cd - Minimum Cover
The calculation of **cd** depends on the bar type selected:

**For Straight bars (rette stenger):**
- cd = min(a/2, c1, c)

**For Angle hooks or hooks (vinkelkroker eller kroker):**
- cd = min(a/2, c1)

**For Loops (sløyfer):**
- cd = c

Where:
- a = clear spacing between bars (cc_phi_l - phi_l)
- c = concrete cover (top/bottom)
- c1 = concrete cover at sides

#### K - Coefficient for Transverse Reinforcement
User selects K value based on configuration (dropdown):
- **K = 0.1** - Bar inside bend
- **K = 0.05** - Orthogonal reinforcement outside anchored bars (default)
- **K = 0** - Anchored bar outside orthogonal bars

See EC2 Figure 8.4 for complete definition and selection guidance.

#### Alpha Factors

**α1 - Bar Shape Factor**
- 1.0 for straight bars
- 0.7 for other shapes (hooks, bends, loops)
- Depends on bar type selection

**α2 - Concrete Cover Factor**
Calculate: temp = 1 - 0.15 × (cd - phi_l) / phi_l
- α2 = min(max(temp, 0.7), 1.0)
- Limited to range [0.7, 1.0]

**α3 - Transverse Reinforcement Factor (not welded)**
User inputs:
- **n_langs** - Number of transverse bars along lbd (requires manual iteration)
- **ΣAst** [mm²] - Total area of transverse reinforcement = n_langs × π × phi_t² / 4
- **ΣAst,min** [mm²] - Minimum required area = 0.25 × As_l (for straight bars)

Calculate:
- λ = (ΣAst - ΣAst,min) / As_l
- temp = 1 - K × λ
- α3 = min(max(temp, 0.7), 1.0)

**α4 - Welded Transverse Reinforcement Factor**
- Default: 1.0 (no welded reinforcement)
- 0.7 if welded transverse reinforcement present (manual input)

**α5 - Transverse Pressure Factor**
User input:
- **p** [MPa] - Transverse pressure perpendicular to splitting plane

Calculate:
- temp = 1 - 0.04 × p
- α5 = min(max(temp, 0.7), 1.0)

**Constraint on Alpha Factors:**
- α2 × α3 × α5 ≥ 0.7
- If product < 0.7, adjust factors accordingly

#### Minimum Anchorage Length

For tension:
- **lb,min,tension** = max(0.3 × lb,rqd, 10 × phi_l, 100 mm)

For compression:
- **lb,min,compression** = max(0.6 × lb,rqd, 10 × phi_l, 100 mm)

Select **lb,min** based on tension/compression selection

#### Final Design Anchorage Length

- **lbd** [mm] = max(α1 × α2 × α3 × α4 × α5 × lb,rqd, lb,min)

---

## OUTPUTS

### Primary Output
- **lbd** [mm] - Design anchorage length (main result)

### Intermediate Results (for verification)
- fbd [MPa] - Design bond strength
- lb,rqd [mm] - Basic required anchorage length
- All alpha factors (α1 through α5)
- cd [mm] - Minimum cover
- Alpha product check: α2 × α3 × α5

---

## DROPDOWN LISTS

### Bond Conditions
- "Good" → eta_1 = 1.0
- "Poor" → eta_1 = 0.7

### Tension/Compression
- "Tension" → Use tension formulas
- "Compression" → Use compression formulas

### Straight/Non-straight
- "Straight" → α1 = 1.0
- "Non-straight" → α1 = 0.7 or other based on bar type

### Bar Type
- "Straight bars" (rette stenger) → α1 = 1.0, cd = min(a/2, c1, c)
- "Angle hooks or hooks" (vinkelkroker eller kroker) → α1 varies, cd = min(a/2, c1)
- "Loops" (sløyfer) → α1 varies, cd = c

### Element Type
- "Slab" - Slab structure
- "Beam" - Beam structure

### K Coefficient
- K = 0.1 - Bar inside bend
- K = 0.05 - Orthogonal reinforcement outside anchored bars (default)
- K = 0 - Anchored bar outside orthogonal bars

---

## NOTES

1. The calculation follows EC2 Section 8.4 for design of anchorages
2. Manual iteration may be required for n_langs to achieve desired lbd
3. Highlight cells in orange when values are manually overwritten
4. Include hover/info tooltips for complex parameters (cd, K, alpha factors)
5. Show relevant EC2 figures and diagrams as reference images






