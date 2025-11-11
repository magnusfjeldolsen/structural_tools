# Concrete Minimum Reinforcement - Detailed Report Specification

## Module Overview
- **Module Name**: concrete_minimum_reinforcement
- **Purpose**: Calculate minimum reinforcement for concrete structures (plates, beams, columns, gulv på grunn)
- **Priority**: MEDIUM (Phase 2)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description (e.g., "Minimum reinforcement check for slab S1")

#### 2. Title & Timestamp
```
Concrete Minimum Reinforcement Calculation
According to EC2 and other standards
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Element Properties**
- Element type = [Plate/Beam/Column/Gulv på grunn]
- Width/Diameter b = [value] mm
- Height/Thickness h = [value] mm
- Effective depth d = [value] mm
- Concrete cover = [value] mm

**Column 2: Material Properties & Design**
- Concrete grade = [value]
- fck = [value] MPa
- fctm = [value] MPa (calculated)
- Steel grade = [value]
- fyk = [value] MPa
- Bar diameter φ = [value] mm
- Bar spacing s = [value] mm
- As,provided = [value] mm²/m (or total mm²)

#### 4. PLOT (Yellow heading)
No plot needed for this calculator.

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
As,min = [value] mm²/m
Minimum Reinforcement Required
```

**3-Column Grid for Utilizations:**

| Reinforcement Compliance | Spacing Compliance | Area Ratio |
|-------------------------|-------------------|------------|
| [XX.X%]                 | [OK/NOT OK]       | ρ = [value]% |
| As,provided / As,min    | s ≤ smax          | As / (b×h) |

Color coding:
- Green (≥100%): text-green-900 (compliance met)
- Red (<100%): text-red-900 (non-compliant)

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Material Properties (bg-gray-50 box)
**Heading**: Concrete Tensile Strength

```
Mean tensile strength (EC2 Table 3.1):
fctm = 0.30 × fck^(2/3) for fck ≤ 50 MPa
fctm = 0.30 × [value]^0.667
fctm = [result] MPa

Alternatively (if given directly):
fctm = [value] MPa (from table)
```

#### Section 2: Minimum Reinforcement (bg-gray-50 box)
**Heading**: Required Minimum Area

**For Plates (EC2 9.3.1.1):**
```
As,min = max(0.26 × (fctm/fyk) × b × d, 0.0013 × b × d)

Option 1:
As,min,1 = 0.26 × (fctm/fyk) × b × d
As,min,1 = 0.26 × ([value]/[value]) × [value] × [value]
As,min,1 = [result] mm²/m

Option 2:
As,min,2 = 0.0013 × b × d
As,min,2 = 0.0013 × [value] × [value]
As,min,2 = [result] mm²/m

Governing:
As,min = max([value], [value]) = [result] mm²/m
```

**For Beams (EC2 9.2.1.1):**
```
As,min = 0.26 × (fctm/fyk) × bt × d ≥ 0.0013 × bt × d

Where bt = width of tension zone

As,min,1 = 0.26 × ([value]/[value]) × [value] × [value] = [result] mm²
As,min,2 = 0.0013 × [value] × [value] = [result] mm²

As,min = max([value], [value]) = [result] mm²
```

**For Columns (EC2 9.5.2):**
```
As,min = max(0.10 × NEd/fyd, 0.002 × Ac)

Where:
- NEd = design axial force = [value] kN
- fyd = fyk/γs = [value] MPa
- Ac = gross cross-section area = b × h = [value] mm²

Option 1:
As,min,1 = 0.10 × NEd/fyd
As,min,1 = 0.10 × ([value]×1000)/[value]
As,min,1 = [result] mm²

Option 2:
As,min,2 = 0.002 × Ac
As,min,2 = 0.002 × [value]
As,min,2 = [result] mm²

Governing:
As,min = max([value], [value]) = [result] mm²
```

**For Gulv på grunn (NS 3473 or similar):**
```
Typically based on crack control:
As,min = k × Act

Where:
- k = coefficient (typically 0.001 to 0.002)
- Act = area of concrete in tension zone

As,min = [value] × [value] = [result] mm²/m
```

#### Section 3: Provided Reinforcement (bg-gray-50 box)
**Heading**: Actual Reinforcement Area

```
Bar diameter: φ = [value] mm
Bar area: Ab = π × φ² / 4 = [calculation] = [result] mm²

Spacing: s = [value] mm

For slabs/plates (per meter width):
As,provided = (1000 / s) × Ab
As,provided = (1000 / [value]) × [value]
As,provided = [result] mm²/m

For beams (total in section):
Number of bars: n = [value]
As,provided = n × Ab = [value] × [value] = [result] mm²

Reinforcement ratio:
ρ = As,provided / (b × d) × 100%
ρ = [value] / ([value] × [value]) × 100%
ρ = [result]%
```

#### Section 4: Compliance Check (bg-gray-50 box)
**Heading**: Reinforcement Adequacy

```
Required: As,min = [value] mm²/m (or mm²)
Provided: As,provided = [value] mm²/m (or mm²)

Ratio: As,provided / As,min = [value] / [value] = [result]

Check: As,provided ≥ As,min
[value] ≥ [value]: [OK / NOT OK]

Compliance: [result × 100]% of required minimum
```

#### Section 5: Spacing Requirements (bg-gray-50 box)
**Heading**: Maximum Bar Spacing

**For Slabs (EC2 9.3.1.1):**
```
In principal direction:
smax = min(3×h, 400 mm)
smax = min(3×[value], 400)
smax = [result] mm

In secondary direction:
smax = min(3.5×h, 450 mm)
smax = min(3.5×[value], 450)
smax = [result] mm

Provided spacing: s = [value] mm

Spacing check:
s ≤ smax
[value] ≤ [value]: [OK / NOT OK]
```

**For Beams (EC2 9.2.1.1):**
```
Maximum bar spacing in tension zone:
smax = min(h, 300 mm) for high bond bars

smax = min([value], 300) = [result] mm

Clear spacing between bars: sclear = [value] mm

Spacing check:
sclear ≤ smax
[value] ≤ [value]: [OK / NOT OK]
```

#### Section 6: Design Recommendations (bg-gray-50 box)
**Heading**: Summary and Recommendations

```
Element type: [Plate/Beam/Column/Gulv på grunn]
Required minimum: As,min = [value] mm²/m
Provided reinforcement: As,provided = [value] mm²/m
Compliance: [XX.X%]

Spacing check: [OK / NOT OK]

Recommendations:
- [If non-compliant] Increase reinforcement to minimum [value] mm²/m
- [If spacing issue] Reduce bar spacing to maximum [value] mm
- [Suggestion] Use φ[value] @ [value] mm c/c to provide [value] mm²/m
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
              placeholder="Example: Minimum reinforcement check for deck slab..."
              class="w-full px-3 py-2 bg-gray-600 text-white border border-gray-500 rounded-md resize-y">
    </textarea>
    <span class="text-xs text-gray-400">This description will appear at the top of the detailed report</span>
  </div>
</div>
```

---

## JavaScript Functions to Implement

### 1. `generateDetailedReport()`
```javascript
function generateDetailedReport() {
  const description = document.getElementById('calc_description').value.trim();
  const inputs = gatherInputs();
  const results = calculateMinimumReinforcement(inputs);

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters - 2 columns]
      [Results summary - As,min + compliance checks]
      <div class="page-break-before">
        [Detailed calculations - 6 sections]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. Calculation Functions
```javascript
function calculateMinReinforcement(elementType, fctm, fyk, b, d, h) {
  let As_min;

  switch(elementType) {
    case 'plate':
      const option1 = 0.26 * (fctm / fyk) * b * d;
      const option2 = 0.0013 * b * d;
      As_min = Math.max(option1, option2);
      break;
    case 'beam':
      // Similar calculation
      break;
    case 'column':
      // Axial force based
      break;
    // ... other cases
  }

  return As_min;
}

function checkSpacing(elementType, h, s) {
  let smax;

  if (elementType === 'plate') {
    smax = Math.min(3 * h, 400);
  } else if (elementType === 'beam') {
    smax = Math.min(h, 300);
  }

  return { smax, compliant: s <= smax };
}
```

---

## Testing Checklist

- [ ] Description field added
- [ ] All element types supported (plate/beam/column/gulv)
- [ ] EC2 formulas correctly implemented
- [ ] Spacing checks included
- [ ] Compliance percentages calculated
- [ ] Design recommendations generated
- [ ] Color coding for compliance
- [ ] 6 calculation sections formatted
- [ ] Print output tested

---

## Code References

- **EC2 Section 9.2.1.1**: Minimum reinforcement (beams)
- **EC2 Section 9.3.1.1**: Minimum reinforcement (slabs)
- **EC2 Section 9.5.2**: Minimum reinforcement (columns)
- **EC2 Table 3.1**: Concrete tensile strength
