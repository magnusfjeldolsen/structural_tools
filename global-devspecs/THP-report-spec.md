# THP (Two-Sided Hat Profile) - Detailed Report Specification

## Module Overview
- **Module Name**: THP
- **Purpose**: Calculate structural capacities and cross-sectional classifications for two-sided hat profiles according to Eurocode 3
- **Priority**: HIGH (Phase 1)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description (e.g., "Hat profile beam design for roof structure")

#### 2. Title & Timestamp
```
Two-Sided Hat Profile Calculation
Structural capacities and cross-sectional classifications according to Eurocode 3
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Profile Geometry**
- Total height H = [value] mm
- Top flange width bf = [value] mm
- Web height hw = [value] mm
- Bottom flange width bb = [value] mm
- Plate thickness t = [value] mm
- Inner radius r = [value] mm

**Column 2: Material Properties & Loading**
- Steel grade = [value]
- fy = [value] MPa
- fu = [value] MPa
- E = [value] GPa
- γM0 = [value]
- γM1 = [value]
- Applied moment MEd = [value] kNm
- Applied axial force NEd = [value] kN
- Applied shear VEd = [value] kN

#### 4. PLOT (Yellow heading)
Cross-section diagram showing:
- Hat profile geometry
- Dimensions labeled (H, bf, hw, bb, t, r)
- Neutral axis location
- Centroid position
- Element classifications (Class 1/2/3/4 color-coded)

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
Cross-Section Classification: Class [1/2/3/4]
Based on element slenderness ratios
```

**3-Column Grid for Utilizations:**

| Moment Utilization | Axial Utilization | Shear Utilization |
|-------------------|-------------------|-------------------|
| [XX.X%]           | [XX.X%]          | [XX.X%]           |
| MEd / Mc,Rd       | NEd / Nc,Rd      | VEd / Vc,Rd       |

Color coding:
- Green (≤85%): text-green-900
- Yellow (85-100%): text-yellow-900
- Red (>100%): text-red-900

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Section Properties (bg-gray-50 box)
**Heading**: Geometric Properties

```
Cross-sectional area:
A = 2 × (bf × t) + 2 × (hw × t) + (bb × t) - corner corrections
A = [calculation] = [result] mm²

Moment of inertia (major axis):
Iy = [calculation based on parallel axis theorem]
Iy = [result] mm⁴

Section modulus (elastic):
Wel,y = Iy / ymax = [value] / [value] = [result] mm³

Section modulus (plastic, if applicable):
Wpl,y = [calculation] = [result] mm³

Centroid location:
ȳ = [calculation] = [result] mm from bottom
```

#### Section 2: Element Classification (bg-gray-50 box)
**Heading**: Cross-Section Class Determination (EC3-1-1 Table 5.2)

**Top Flange (outstand)**
```
c = bf/2 - r - t = [calculation] = [value] mm
c/t = [value] / [value] = [result]
ε = √(235/fy) = √(235/[value]) = [result]

Outstand limits:
- Class 1: c/t ≤ 9ε = [value]
- Class 2: c/t ≤ 10ε = [value]
- Class 3: c/t ≤ 14ε = [value]

Classification: c/t = [value] → Class [1/2/3/4]
```

**Web (internal compression)**
```
c = hw - 2×(r + t) = [calculation] = [value] mm
c/t = [value] / [value] = [result]

Assuming ψ = [stress ratio based on loading]

Internal element limits:
- Class 1: c/t ≤ 72ε = [value]
- Class 2: c/t ≤ 83ε = [value]
- Class 3: c/t ≤ 124ε = [value]

Classification: c/t = [value] → Class [1/2/3/4]
```

**Bottom Flange (internal)**
```
c = bb - 2×(r + t) = [calculation] = [value] mm
c/t = [value] / [value] = [result]

Internal element limits:
- Class 1: c/t ≤ 33ε = [value]
- Class 2: c/t ≤ 38ε = [value]
- Class 3: c/t ≤ 42ε = [value]

Classification: c/t = [value] → Class [1/2/3/4]
```

**Overall Section Class**
```
Governing element: [element name]
Cross-section class: Class [max of all elements]
```

#### Section 3: Moment Capacity (bg-gray-50 box)
**Heading**: Bending Resistance

**For Class 1 or 2:**
```
Mc,Rd = Wpl,y × fy / γM0
Mc,Rd = [value] × [value] / [value]
Mc,Rd = [result] kNm
```

**For Class 3:**
```
Mc,Rd = Wel,y × fy / γM0
Mc,Rd = [value] × [value] / [value]
Mc,Rd = [result] kNm
```


**For Class 4:**
```
For class 4, NOTIFY USER THAT CALCUALTIONS ARE INVALID.

#### Section 4: Axial Capacity (bg-gray-50 box)
**Heading**: Compression/Tension Resistance

**Gross section (Class 1/2/3):**
```
Nc,Rd = A × fy / γM0
Nc,Rd = [value] × [value] / [value]
Nc,Rd = [result] kN
```

**Effective section (Class 4):**
```
Nc,Rd = Aeff × fy / γM0
Nc,Rd = [value] × [value] / [value]
Nc,Rd = [result] kN
```

**Check for buckling (if applicable):**
```
Slenderness λ̄ = [calculation based on buckling length]
Reduction factor χ = [from buckling curves]
Nb,Rd = χ × A × fy / γM1 = [result] kN
```

#### Section 5: Shear Capacity (bg-gray-50 box)
**Heading**: Shear Resistance

```
Shear area:
Av = 2 × hw × t = [value] × [value] = [result] mm²

Shear capacity:
Vc,Rd = Av × (fy / √3) / γM0
Vc,Rd = [value] × ([value] / 1.732) / [value]
Vc,Rd = [result] kN
```

#### Section 6: Interaction Check (bg-gray-50 box)
**Heading**: Combined Loading Verification

**Moment-Axial Interaction (if both present):**
```
For Class 1/2 sections:
(NEd / Nc,Rd) + (MEd / Mc,Rd) ≤ 1.0
([value] / [value]) + ([value] / [value]) = [result]
Check: [result] ≤ 1.0 → [OK / NOT OK]
```

**Shear-Moment Interaction (if high shear):**
```
If VEd > 0.5 × Vc,Rd, moment capacity is reduced
VEd = [value] kN
0.5 × Vc,Rd = [value] kN
Interaction required: [YES / NO]

If required:
Mc,V,Rd = [reduced moment capacity] = [result] kNm
```

#### Section 7: Utilization Summary (bg-gray-50 box)
**Heading**: Capacity Checks

```
Moment: MEd / Mc,Rd = [value] / [value] = [XX.X%]
Axial: NEd / Nc,Rd = [value] / [value] = [XX.X%]
Shear: VEd / Vc,Rd = [value] / [value] = [XX.X%]
Combined loading check: [result] ≤ 1.0 → [OK / NOT OK]
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Hat profile beam for roof structure - Span 12m..."
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
  const results = calculateHatProfile(inputs);
  const plotHTML = generateCrossSectionPlot(); // SVG of hat profile

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters - 2 columns]
      [Plot section - cross-section with classifications]
      [Results summary - classification + 3 utilizations]
      <div class="page-break-before">
        [Detailed calculations - 7 sections]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. Cross-Section Classification Logic
```javascript
function classifyElement(c_over_t, elementType, psi, fy) {
  const epsilon = Math.sqrt(235 / fy);

  let limits;
  if (elementType === 'outstand') {
    limits = {
      class1: 9 * epsilon,
      class2: 10 * epsilon,
      class3: 14 * epsilon
    };
  } else if (elementType === 'internal_compression') {
    // Depends on stress ratio ψ
    limits = calculateInternalLimits(psi, epsilon);
  }

  if (c_over_t <= limits.class1) return 1;
  if (c_over_t <= limits.class2) return 2;
  if (c_over_t <= limits.class3) return 3;
  return 4;
}

function getOverallClass(topFlange, web, bottomFlange) {
  return Math.max(topFlange, web, bottomFlange);
}
```

---

## Plot/Visualization Requirements

Create cross-section diagram showing:
- Hat profile outline with accurate proportions
- All dimensions labeled (H, bf, hw, bb, t, r)
- Centroid marked with ⊕
- Neutral axis (dashed line)
- Element classifications color-coded:
  - Class 1: Green
  - Class 2: Blue
  - Class 3: Yellow
  - Class 4: Red

Use D3.js or inline SVG for drawing.

---

## Testing Checklist

- [ ] Description field added to form
- [ ] `generateDetailedReport()` function implemented
- [ ] Section properties calculations included
- [ ] Element classification logic (EC3 Table 5.2)
- [ ] All three capacity checks (M, N, V)
- [ ] Interaction checks implemented
- [ ] Cross-section plot with classifications
- [ ] Input parameters in 2-column grid
- [ ] Utilizations color-coded
- [ ] 7 calculation sections formatted
- [ ] Page break before detailed calculations
- [ ] Print CSS works correctly
- [ ] Multi-page print tested

---

## Code References

- **EC3-1-1 Section 5.5**: Classification of cross-sections
- **EC3-1-1 Table 5.2**: Maximum width-to-thickness ratios
- **EC3-1-1 Section 6.2**: Resistance of cross-sections
- **EC3-1-1 Section 6.2.5**: Bending moment
- **EC3-1-1 Section 6.2.6**: Shear
- **EC3-1-1 Section 6.2.9**: Bending and axial force
- **EC3-1-5**: Plated structural elements (for Class 4)
