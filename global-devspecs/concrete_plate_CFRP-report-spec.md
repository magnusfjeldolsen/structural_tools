# Concrete Plate CFRP - Detailed Report Specification

## Module Overview
- **Module Name**: concrete_plate_CFRP
- **Purpose**: Carbon fiber reinforcement calculator for concrete plates - CFRP strengthening analysis
- **Priority**: MEDIUM (Phase 2)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description (e.g., "CFRP strengthening design for existing slab")

#### 2. Title & Timestamp
```
CFRP Concrete Plate Reinforcement Calculation
Carbon fiber strengthening analysis
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Plate & CFRP Properties**
- Plate thickness h = [value] mm
- Existing steel reinforcement As = [value] mm²/m
- Effective depth d = [value] mm
- CFRP type = [value]
- CFRP thickness tCFRP = [value] mm
- CFRP width bCFRP = [value] mm
- CFRP spacing sCFRP = [value] mm
- CFRP modulus ECFRP = [value] GPa

**Column 2: Material Properties & Loading**
- Concrete grade = [value]
- fck = [value] MPa
- fcd = [value] MPa
- Steel grade = [value]
- fyk = [value] MPa
- fyd = [value] MPa
- CFRP tensile strength fCFRP,k = [value] MPa
- Existing moment MEd,existing = [value] kNm/m
- Target moment MEd,target = [value] kNm/m

#### 4. PLOT (Yellow heading)
Chart showing:
- Moment capacity before strengthening
- Moment capacity after strengthening
- Existing loading
- Target loading
- Strengthening effectiveness (%)
- Optional: Strain distribution diagram

**Note**: Need to convert Chart.js canvas to SVG for print compatibility.

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
MRd,CFRP = [value] kNm/m
Strengthened Moment Capacity
```

**3-Column Grid for Utilizations:**

| Strengthening Effectiveness | Before Strengthening | After Strengthening |
|---------------------------|---------------------|---------------------|
| +[XX.X%]                  | [XX.X%]            | [XX.X%]             |
| Capacity increase         | MEd / MRd,existing  | MEd / MRd,CFRP      |

Color coding:
- Green (≤85%): text-green-900
- Yellow (85-100%): text-yellow-900
- Red (>100%): text-red-900

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Existing Condition (bg-gray-50 box)
**Heading**: Capacity Before Strengthening

```
Existing steel reinforcement:
As,existing = [value] mm²/m

Neutral axis depth (before CFRP):
x = (As × fyd) / (0.8 × fcd × 1000)
x = ([value] × [value]) / (0.8 × [value] × 1000)
x = [result] mm

Lever arm:
z = d - 0.4 × x
z = [value] - 0.4 × [value]
z = [result] mm

Existing moment capacity:
MRd,existing = As × fyd × z / 10^6
MRd,existing = [value] × [value] × [value] / 10^6
MRd,existing = [result] kNm/m

Existing utilization (before strengthening):
η_existing = MEd,target / MRd,existing × 100%
η_existing = [value] / [value] × 100%
η_existing = [result]%
```

#### Section 2: CFRP Properties (bg-gray-50 box)
**Heading**: Carbon Fiber Reinforcement

```
CFRP area per meter width:
ACFRP = (1000 / sCFRP) × (tCFRP × bCFRP)
ACFRP = (1000 / [value]) × ([value] × [value])
ACFRP = [result] mm²/m

CFRP design strength (with reduction factors):
- Environmental factor ηenv = [value] (typical 0.85-0.95)
- Conversion factor ηa = [value] (typically 0.85)
- Partial safety factor γf = [value] (typically 1.2-1.5)

fCFRP,d = ηenv × ηa × fCFRP,k / γf
fCFRP,d = [value] × [value] × [value] / [value]
fCFRP,d = [result] MPa

CFRP force capacity:
FCFRP,max = ACFRP × fCFRP,d / 1000
FCFRP,max = [value] × [value] / 1000
FCFRP,max = [result] kN/m
```

#### Section 3: Compatibility Analysis (bg-gray-50 box)
**Heading**: Strain Compatibility

```
Concrete ultimate compression strain:
εcu = 0.0035 (EC2 assumption)

CFRP position (distance from compression face):
hCFRP = h + cover (typically h + 0-5 mm)
hCFRP = [value] mm

At ultimate:
Neutral axis depth (with CFRP):
Assuming steel yields and CFRP is at strain εCFRP:

Force equilibrium:
Fc = Fs + FCFRP
0.8 × fcd × x × 1000 = As × fyd + ACFRP × σCFRP

Strain in CFRP:
εCFRP = εcu × (hCFRP - x) / x
εCFRP = [value] × ([value] - [value]) / [value]
εCFRP = [result]

Stress in CFRP (limited by debonding):
σCFRP = min(εCFRP × ECFRP, fCFRP,d)
σCFRP = min([value] × [value], [value])
σCFRP = [result] MPa

Actual CFRP force:
FCFRP = ACFRP × σCFRP / 1000
FCFRP = [value] × [value] / 1000
FCFRP = [result] kN/m
```

#### Section 4: Strengthened Capacity (bg-gray-50 box)
**Heading**: Moment Capacity with CFRP

```
Revised neutral axis (iterative solution):
x_CFRP = [result from iteration] mm

Lever arms:
z_steel = d - 0.4 × x_CFRP = [result] mm
z_CFRP = hCFRP - 0.4 × x_CFRP = [result] mm

Strengthened moment capacity:
MRd,CFRP = (As × fyd × z_steel + ACFRP × σCFRP × z_CFRP) / 10^6
MRd,CFRP = ([value]×[value]×[value] + [value]×[value]×[value]) / 10^6
MRd,CFRP = [result] kNm/m
```

#### Section 5: Debonding Check (bg-gray-50 box)
**Heading**: Intermediate Crack Debonding

```
Maximum anchorable strain (simplified):
εCFRP,max = 0.41 × √(fctm / (ECFRP × tCFRP))
εCFRP,max = 0.41 × √([value] / ([value] × [value]))
εCFRP,max = [result]

Check:
εCFRP ≤ εCFRP,max
[value] ≤ [value]: [OK / DEBONDING RISK]

If debonding risk:
Need additional anchorage or reduced CFRP stress
Recommended: Reduce design strain to [value]
```

#### Section 6: Strengthening Effectiveness (bg-gray-50 box)
**Heading**: Performance Analysis

```
Before strengthening:
MRd,existing = [value] kNm/m

After strengthening:
MRd,CFRP = [value] kNm/m

Capacity increase:
ΔM = MRd,CFRP - MRd,existing
ΔM = [value] - [value]
ΔM = [result] kNm/m

Effectiveness:
Increase = (ΔM / MRd,existing) × 100%
Increase = ([value] / [value]) × 100%
Increase = [result]%

Target moment check:
MRd,CFRP ≥ MEd,target
[value] ≥ [value]: [OK / NOT OK]

Final utilization:
η_CFRP = MEd,target / MRd,CFRP × 100%
η_CFRP = [value] / [value] × 100%
η_CFRP = [result]%
```

#### Section 7: Design Recommendations (bg-gray-50 box)
**Heading**: Summary and Installation Notes

```
Existing capacity: [value] kNm/m
Strengthened capacity: [value] kNm/m
Capacity increase: +[XX.X%]

CFRP specification:
- Type: [value]
- Thickness: [value] mm
- Width: [value] mm
- Spacing: [value] mm c/c
- Area: [value] mm²/m

Installation recommendations:
- Surface preparation: Grind/blast to expose aggregate
- Prime with epoxy primer
- Apply CFRP laminate with structural adhesive
- Ensure proper curing time
- [If debonding risk] Install mechanical anchors at ends
- Quality control: Adhesion testing required
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: CFRP strengthening for parking deck slab..."
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
  const results = calculateCFRPStrengthening(inputs);
  const chartHTML = convertChartToSVG(); // Convert Chart.js to SVG

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters - 2 columns]
      [Chart section - before/after comparison]
      [Results summary - effectiveness + utilizations]
      <div class="page-break-before">
        [Detailed calculations - 7 sections]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. Chart Conversion for Print
```javascript
function convertChartToSVG() {
  // Get Chart.js canvas
  const canvas = document.getElementById('capacityChart');

  // Convert to data URL or SVG
  const dataURL = canvas.toDataURL('image/png');

  return `<img src="${dataURL}" alt="Capacity Chart" style="max-width: 100%;">`;
}
```

---

## Testing Checklist

- [ ] Description field added
- [ ] CFRP calculations implemented
- [ ] Debonding check included
- [ ] Chart.js to SVG conversion working
- [ ] Strain compatibility analysis
- [ ] Before/after comparison clear
- [ ] Installation recommendations
- [ ] Color-coded effectiveness
- [ ] 7 calculation sections formatted
- [ ] Print output tested

---

## Code References

- **fib Bulletin 90**: Externally applied FRP reinforcement
- **ACI 440.2R**: Guide for strengthening with FRP
- **EC2**: Concrete structures (for base calculations)
