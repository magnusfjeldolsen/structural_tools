# Transversal Forces Stiffened Web - Detailed Report Specification

## Module Overview
- **Module Name**: transversal_forces_stiffened_web
- **Purpose**: Calculate capacity of transversally stiffened webs for vertical forces according to EC3
- **Priority**: MEDIUM (Phase 2)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)

#### 2. Title & Timestamp
```
Transversal Forces - Stiffened Web Calculation
Calculate capacity and slenderness check with detailed derivations
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Web Geometry**
- Web height hw = [value] mm
- Web thickness tw = [value] mm
- Flange thickness tf = [value] mm
- Flange width bf = [value] mm
- Stiffener spacing a = [value] mm
- Stiffener thickness ts = [value] mm
- Stiffener width bs = [value] mm

**Column 2: Material Properties & Loading**
- Steel grade = [value]
- fy = [value] MPa
- E = [value] GPa
- γM0 = [value]
- γM1 = [value]
- Applied force FEd = [value] kN
- Load application = [at flange / at distance c]

#### 4. PLOT (Yellow heading)
Web visualization showing:
- Web panel dimensions
- Stiffener locations
- Load application point
- Effective loaded length

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
FRd = [value] kN
Resistance to Transversal Forces
```

**3-Column Grid for Utilizations:**

| Force Utilization | Slenderness Check | Buckling Check |
|------------------|-------------------|----------------|
| [XX.X%]          | λ̄w = [value]    | χF = [value]   |
| FEd / FRd        | OK if < 0.5      | Reduction factor|

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Effective Loaded Length (bg-gray-50 box)
**Heading**: Load Distribution (EC3-1-5 Section 6.2)

```
For load applied at flange:
ss = √(bf × tf) × √(2 + √(tw/tf))
ss = √([value] × [value]) × √(2 + √([value]/[value]))
ss = [result] mm

Effective length:
ly = ss + 2×tf × (1 + √(bf×tf/(tw×hw)))
ly = [value] + 2×[value] × (1 + √([value]×[value]/([value]×[value])))
ly = [result] mm

If load NOT at flange (at distance c from flange):
ly = ly + c
ly = [value] + [value] = [result] mm
```

#### Section 2: Web Slenderness (bg-gray-50 box)
**Heading**: Slenderness Parameter

```
Web slenderness:
λ̄w = (hw / tw) / (37.4 × ε)
where ε = √(235/fy) = √(235/[value]) = [result]

λ̄w = ([value] / [value]) / (37.4 × [value])
λ̄w = [result]

Classification:
- If λ̄w < 0.5: No buckling check needed
- If λ̄w ≥ 0.5: Buckling check required

Result: λ̄w = [value] → [No buckling check / Buckling check required]
```

#### Section 3: Resistance Without Buckling (bg-gray-50 box)
**Heading**: Yield Resistance (EC3-1-5 Eq. 6.1)

```
For stiffened web (panel buckling):
FRd = ly × tw × fy / γM1
FRd = [value] × [value] × [value] / [value]
FRd = [result] kN
```

#### Section 4: Buckling Resistance (bg-gray-50 box)
**Heading**: Reduced Resistance (if λ̄w ≥ 0.5)

```
Buckling reduction factor:
If λ̄w < 0.5:
  χF = 1.0

If 0.5 ≤ λ̄w < 1.5:
  χF = 2 - 4×λ̄w²/(1.3 + 0.4×(λ̄w - 0.5))
  χF = 2 - 4×[value]²/(1.3 + 0.4×([value] - 0.5))
  χF = [result]

If λ̄w ≥ 1.5:
  χF = 0.9 / λ̄w
  χF = 0.9 / [value]
  χF = [result]

Design resistance:
FRd = χF × ly × tw × fy / γM1
FRd = [value] × [value] × [value] × [value] / [value]
FRd = [result] kN
```

#### Section 5: Stiffener Check (bg-gray-50 box)
**Heading**: Stiffener Adequacy

```
Minimum stiffener rigidity (EC3-1-5):
Is,min = 1.5 × hw³ × tw³ / a²
Is,min = 1.5 × [value]³ × [value]³ / [value]²
Is,min = [result] mm⁴

Provided stiffener inertia:
Is = ts × bs³ / 12
Is = [value] × [value]³ / 12
Is = [result] mm⁴

Stiffener check:
Is ≥ Is,min
[value] ≥ [value]: [OK / NOT OK]
```

#### Section 6: Utilization Check (bg-gray-50 box)
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
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Web bearing check for crane beam..."
              class="w-full px-3 py-2 bg-gray-600 text-white border border-gray-500 rounded-md resize-y">
    </textarea>
  </div>
</div>
```

---

## Testing Checklist

- [ ] EC3-1-5 Section 6 formulas implemented
- [ ] Effective length calculation
- [ ] Slenderness check
- [ ] Buckling reduction factors
- [ ] Stiffener rigidity check
- [ ] Web visualization
- [ ] Print output tested

---

## Code References

- **EC3-1-5 Section 6**: Resistance to transverse forces
- **EC3-1-5 Eq. 6.1-6.4**: Resistance formulas
