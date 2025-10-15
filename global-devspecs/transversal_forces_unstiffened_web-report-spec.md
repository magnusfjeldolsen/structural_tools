# Transversal Forces Unstiffened Web - Detailed Report Specification

## Module Overview
- **Module Name**: transversal_forces_unstiffened_web
- **Purpose**: Calculate capacity of unstiffened webs for transversal forces according to EC3-1-5
- **Priority**: MEDIUM (Phase 2)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)

#### 2. Title & Timestamp
```
Transversal Forces - Unstiffened Web Calculation
Calculate capacity according to EC3-1-5 with detailed derivations
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Web Geometry**
- Web height hw = [value] mm
- Web thickness tw = [value] mm
- Flange thickness tf = [value] mm
- Flange width bf = [value] mm
- Root radius r = [value] mm
- Web angle θ = [value]° (if sloped)

**Column 2: Material Properties & Loading**
- Steel grade = [value]
- fy = [value] MPa
- E = [value] GPa
- γM0 = [value]
- γM1 = [value]
- Applied force FEd = [value] kN
- Load location = [End / Interior]
- Distance from support ss = [value] mm (if interior)

#### 4. PLOT (Yellow heading)
Web visualization showing:
- Web panel
- Load application
- Effective loaded length
- Critical section

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
FRd = [value] kN
Resistance to Transversal Forces
```

**3-Column Grid for Utilizations:**

| Force Utilization | Web Crippling | Web Buckling |
|------------------|---------------|--------------|
| [XX.X%]          | FRd,cr = [value] kN | FRd,buck = [value] kN |
| FEd / FRd        | Crippling resistance | Buckling resistance |

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Effective Loaded Length (bg-gray-50 box)
**Heading**: Load Distribution (EC3-1-5 Section 6.3-6.4)

```
Stiff bearing length:
ss = [value] mm (given or calculated from load application)

For welded I-sections:
ly = ss + 2×tf × (1 + √(bf×tf/(tw×hw)))
ly = [value] + 2×[value] × (1 + √([value]×[value]/([value]×[value])))
ly = [result] mm

For rolled sections with root radius:
ly = ss + 2×tf + 2×r × √(2)
ly = [value] + 2×[value] + 2×[value] × 1.414
ly = [result] mm
```

#### Section 2: Web Crippling (bg-gray-50 box)
**Heading**: Crushing Resistance (EC3-1-5 Section 6.3)

```
For load NOT close to end (ss > hw/2):

Web slenderness parameter:
λ̄F = ly / (tw × √(fy/E × hw/tf))
λ̄F = [value] / ([value] × √([value]/[value] × [value]/[value]))
λ̄F = [result]

Reduction factor for web crippling:
If λ̄F ≤ 0.5:
  χF = 1.0

If 0.5 < λ̄F ≤ 1.5:
  χF = 1.5 - λ̄F
  χF = 1.5 - [value]
  χF = [result]

If λ̄F > 1.5:
  χF = 0.66 / λ̄F
  χF = 0.66 / [value]
  χF = [result]

Crippling resistance:
FRd,cr = χF × ly × tw × fy / γM1
FRd,cr = [value] × [value] × [value] × [value] / [value]
FRd,cr = [result] kN
```

#### Section 3: Web Buckling (bg-gray-50 box)
**Heading**: Buckling Resistance (EC3-1-5 Section 6.4)

```
Web slenderness for buckling:
λ̄w = (hw / tw) / (37.4 × ε)
where ε = √(235/fy) = √(235/[value]) = [result]

λ̄w = ([value] / [value]) / (37.4 × [value])
λ̄w = [result]

For load at support (or close to end):

Buckling reduction:
If λ̄w ≤ 0.5:
  χF = 1.0

If 0.5 < λ̄w ≤ 1.5:
  χF = (λ̄w + 0.2) / λ̄w²
  χF = ([value] + 0.2) / [value]²
  χF = [result]

If λ̄w > 1.5:
  χF = 0.9 / λ̄w
  χF = 0.9 / [value]
  χF = [result]

Buckling resistance:
FRd,buck = χF × ly × tw × fy / γM1
FRd,buck = [value] × [value] × [value] × [value] / [value]
FRd,buck = [result] kN
```

#### Section 4: Governing Resistance (bg-gray-50 box)
**Heading**: Design Resistance

```
Crippling resistance: FRd,cr = [value] kN
Buckling resistance: FRd,buck = [value] kN

Governing:
FRd = min(FRd,cr, FRd,buck)
FRd = min([value], [value])
FRd = [result] kN

Critical failure mode: [Crippling / Buckling]
```

#### Section 5: Utilization Check (bg-gray-50 box)
**Heading**: Capacity Verification

```
Applied force: FEd = [value] kN
Design resistance: FRd = [value] kN

Utilization:
η = FEd / FRd × 100%
η = [value] / [value] × 100%
η = [result]%

Check: FEd ≤ FRd
[value] ≤ [value]: [OK / NOT OK]

Safety margin: [result] kN ([XX.X%])
```

#### Section 6: Recommendations (bg-gray-50 box)
**Heading**: Design Guidance

```
Load location: [End / Interior]
Critical mode: [Crippling / Buckling]
Web slenderness: λ̄w = [value]

Recommendations:
- [If high utilization] Consider web stiffener at load point
- [If crippling critical] Increase bearing length ss
- [If buckling critical] Reduce web slenderness (thicker web)
- [If OK] Design is adequate
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Beam support reaction check..."
              class="w-full px-3 py-2 bg-gray-600 text-white border border-gray-500 rounded-md resize-y">
    </textarea>
  </div>
</div>
```

---

## Testing Checklist

- [ ] EC3-1-5 formulas implemented
- [ ] Crippling and buckling checks
- [ ] Load location handling (end vs interior)
- [ ] Effective length for different sections
- [ ] Governing resistance determination
- [ ] Recommendations logic
- [ ] Web visualization
- [ ] Print output tested

---

## Code References

- **EC3-1-5 Section 6.3**: Resistance to crushing
- **EC3-1-5 Section 6.4**: Resistance to buckling
- **EC3-1-5 Eq. 6.9-6.14**: Resistance formulas
