# Concrete Base Plate Compressive Design - Detailed Report Specification

## Module Overview
- **Module Name**: concrete_base_plate_compressive_design
- **Purpose**: Calculate compressive capacity of concrete base plates with detailed derivations
- **Priority**: HIGH (Phase 1)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description (e.g., "Column base plate design for Building A")

#### 2. Title & Timestamp
```
Concrete Base Plate Compressive Design Calculation
Calculate compressive capacity with detailed step-by-step derivations
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Plate Geometry**
- Plate length a = [value] mm
- Plate width b = [value] mm
- Plate thickness tp = [value] mm
- Column width c = [value] mm (if applicable)
- Column depth d = [value] mm (if applicable)

**Column 2: Material Properties & Loading**
- Concrete grade = [value]
- fck = [value] MPa
- αcc = [value]
- γc = [value]
- fcd = [value] MPa (calculated)
- Steel grade = [value]
- fy = [value] MPa
- γM0 = [value]
- Applied force NEd = [value] kN
- Grout thickness t_grout = [value] mm
- Grout load expansion angle theta = [value] deg

#### 4. PLOT (Yellow heading)
Base plate geometry diagram showing:
- Plate outline (a × b)
- Column footprint (c × d) if applicable
- Bearing area
- Effective cantilever lengths
- Load distribution pattern

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
FRd_pl_trykk = [value] kN
Compressive Bearing Capacity
```

**2-Column Grid for Utilizations:**

| Bearing Utilization | Effective Area |
|--------------------|----------------|
| [XX.X%]            | [value] mm²    |
| η = NEd / FRd      | Apl_eff        |

Color coding:
- Green (≤85%): text-green-900
- Yellow (85-100%): text-yellow-900
- Red (>100%): text-red-900

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Material Properties (bg-gray-50 box)
**Heading**: Design Strengths

```
Concrete design strength:
fcd = (αcc × fck) / γc
fcd = ([value] × [value]) / [value]
fcd = [result] MPa

Steel design strength:
fyd = fy / γM0
fyd = [value] / [value]
fyd = [result] MPa
```

#### Section 2: Steel Plate Spread (bg-gray-50 box)
**Heading**: Load Spread According to EC3-1-8 6.2.5(4)

```
Steel design strength:
fyd = fy / γM0
fyd = [value] / [value]
fyd = [result] MPa

Steel plate spread:
c = tpl × √(fyd / (3 × fcd))
c = [value] × √([value] / (3 × [value]))
c = [result] mm
```

#### Section 3: Grout Layer Extensions (bg-gray-50 box)
**Heading**: Grout Layer Load Distribution

```
Grout thickness: tgrout = [value] mm
Grout load expansion angle: θ = [value]°
θ (radians) = [value] × π / 180 = [result] rad

Length direction extension:
δl_eff_US = 2 × tgrout × sin(θ)
δl_eff_US = 2 × [value] × sin([value])
δl_eff_US = [result] mm

Width direction extension:
δb_eff_US = 2 × tgrout × sin(θ)
δb_eff_US = 2 × [value] × sin([value])
δb_eff_US = [result] mm
```

#### Section 4: Effective Plate Dimensions (bg-gray-50 box)
**Heading**: Effective Area Calculation

```
Effective plate length:
lpl_eff = min(lpl, lcl + 2 × c + δl_eff_US)
lpl_eff = min([value], [value] + 2 × [value] + [value])
lpl_eff = [result] mm

Effective plate width:
bpl_eff = min(bpl, bcl + 2 × c + δb_eff_US)
bpl_eff = min([value], [value] + 2 × [value] + [value])
bpl_eff = [result] mm

Effective area:
Apl_eff = lpl_eff × bpl_eff
Apl_eff = [value] × [value]
Apl_eff = [result] mm²
```

#### Section 5: Compressive Resistance (bg-gray-50 box)
**Heading**: Bearing Capacity

```
Compressive resistance:
FRd_pl_trykk = Apl_eff × fcd / 1000
FRd_pl_trykk = [value] × [value] / 1000
FRd_pl_trykk = [result] kN

Bearing utilization:
η = NEd / FRd_pl_trykk
η = [value] / [value]
η = [result] = [XX.X%]

Design check:
NEd ≤ FRd_pl_trykk
[value] ≤ [value]: [OK / NOT OK]
```

#### Section 6: Design Recommendations (bg-gray-50 box)
**Heading**: Summary and Recommendations

```
Applied force: NEd = [value] kN
Compressive capacity: FRd_pl_trykk = [value] kN
Bearing utilization: [XX.X%]

Recommendations:
- [If utilization high] Increase plate dimensions or column dimensions
- [If utilization high] Increase grout thickness to improve load spread
- [If OK] Design is adequate for bearing capacity
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Column C1 base plate - Foundation F1..."
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
  const results = calculateBasePlate(inputs);
  const plotHTML = generateBasePlatePlot(inputs); // SVG diagram

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters - 2 columns]
      [Plot section - base plate geometry]
      [Results summary - capacity + 3 utilizations]
      <div class="page-break-before">
        [Detailed calculations - 7 sections]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. Calculation Functions
```javascript
function calculateSteelSpread(tpl, fyd, fcd) {
  const c = tpl * Math.sqrt(fyd / (3 * fcd));
  return c;
}

function calculateGroutExtensions(tgrout, theta_deg) {
  const theta_rad = theta_deg * Math.PI / 180;
  const delta_l_eff_US = 2 * tgrout * Math.sin(theta_rad);
  const delta_b_eff_US = 2 * tgrout * Math.sin(theta_rad);
  return { delta_l_eff_US, delta_b_eff_US, theta_rad };
}

function calculateEffectiveDimensions(lpl, bpl, lcl, bcl, c, delta_l, delta_b) {
  const lpl_eff = Math.min(lpl, lcl + 2 * c + delta_l);
  const bpl_eff = Math.min(bpl, bcl + 2 * c + delta_b);
  const Apl_eff = lpl_eff * bpl_eff;
  return { lpl_eff, bpl_eff, Apl_eff };
}

function calculateCompressiveResistance(Apl_eff, fcd) {
  const FRd_pl_trykk = Apl_eff * fcd / 1000; // Convert to kN
  return FRd_pl_trykk;
}
```

---

## Plot/Visualization Requirements

Create base plate geometry diagram:
- Rectangle representing plate (a × b)
- Inner rectangle representing column (c × d) if applicable
- Dimension labels
- Cantilever lengths marked (ca, cb)
- Bearing pressure distribution (arrows/shading)
- Side view showing plate thickness

Use D3.js or SVG.

---

## Testing Checklist

- [ ] Description field added
- [ ] `generateDetailedReport()` implemented
- [ ] Steel plate spread calculation (EC3-1-8 6.2.5(4))
- [ ] Grout layer extensions
- [ ] Effective plate dimensions
- [ ] Compressive resistance calculation
- [ ] Bearing utilization check
- [ ] Design recommendations included
- [ ] Base plate plot generated
- [ ] Input parameters in 2-column grid
- [ ] Utilization color-coded
- [ ] 6 calculation sections formatted
- [ ] Page break works
- [ ] Print output clean

---

## Code References

- **EC2 Section 6.7**: Bearing stresses
- **EC2 Equation 6.63**: Concentrated forces
- **EN 1992-1-1**: Eurocode 2
