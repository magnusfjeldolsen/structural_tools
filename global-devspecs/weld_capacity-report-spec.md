# Weld Capacity - Detailed Report Specification

## Module Overview
- **Module Name**: weld_capacity
- **Purpose**: Calculate weld capacity and utilization with von Mises stress analysis
- **Priority**: HIGH (Phase 1)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description (e.g., "Connection design for beam-column joint")

#### 2. Title & Timestamp
```
Weld Capacity Calculation
Comprehensive stress analysis with normal force, shear force, and moment combinations
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Weld Geometry**
- Weld length L = [value] mm
- Throat thickness a = [value] mm
- Effective area Aeff = [value] mm²

**Column 2: Material Properties & Loading**
- Steel grade = [value]
- fu = [value] MPa
- βw = [value]
- γM2 = [value]
- Normal force N = [value] kN
- Shear force parallel V∥ = [value] kN
- Shear force perpendicular V⊥ = [value] kN
- Moment M = [value] kNm

#### 4. PLOT (Yellow heading)
Optional: Weld stress distribution diagram showing:
- Weld geometry
- Force directions
- Stress components
- Critical point location

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
σvM = [value] MPa
von Mises Stress (Design Criterion)
```

**3-Column Grid for Utilizations:**

| von Mises Utilization | Normal Stress | Shear Stress Total |
|----------------------|---------------|-------------------|
| [XX.X%]              | σ⊥ = [value] MPa | τ = [value] MPa |
| σvM / fw,d           | N / Aeff      | √(τ∥² + τ⊥²)    |

Color coding:
- Green (≤85%): text-green-900
- Yellow (85-100%): text-yellow-900
- Red (>100%): text-red-900

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Weld Properties (bg-gray-50 box)
**Heading**: Geometry and Design Strength

```
Effective area: Aeff = L × a = [value] × [value] = [value] mm²
Section modulus: W = L² × a / 6 = [calculation] = [value] mm³

Design strength:
fw,d = fu / (βw × √3 × γM2)
fw,d = [value] / ([value] × 1.732 × [value])
fw,d = [result] MPa
```

#### Section 2: Stress Components (bg-gray-50 box)
**Heading**: Individual Stress Calculations

**Normal Stress (perpendicular to weld)**
```
σ⊥ = N / Aeff = [value] / [value] = [result] MPa
```

**Shear Stress from Parallel Force**
```
τ∥ = V∥ / Aeff = [value] / [value] = [result] MPa
```

**Shear Stress from Perpendicular Force**
```
τ⊥,V = V⊥ / Aeff = [value] / [value] = [result] MPa
```

**Shear Stress from Moment**
```
τ⊥,M = M / W = [value] / [value] = [result] MPa
```

**Total Perpendicular Shear Stress**
```
τ⊥ = τ⊥,V + τ⊥,M = [value] + [value] = [result] MPa
```

**Total Shear Stress**
```
τ = √(τ∥² + τ⊥²)
τ = √([value]² + [value]²)
τ = [result] MPa
```

#### Section 3: von Mises Criterion (bg-gray-50 box)
**Heading**: Combined Stress Check

```
σvM = √(σ⊥² + 3 × τ²)
σvM = √([value]² + 3 × [value]²)
σvM = [result] MPa

Design check:
σvM ≤ fw,d
[value] ≤ [value]: [OK / NOT OK]
```

#### Section 4: Utilization Analysis (bg-gray-50 box)
**Heading**: Capacity Verification

```
von Mises utilization = (σvM / fw,d) × 100%
                      = ([value] / [value]) × 100%
                      = [XX.X%]

Component utilizations:
- Normal stress: σ⊥ / fw,d = [XX.X%]
- Parallel shear: τ∥ / fw,d = [XX.X%]
- Perpendicular shear: τ⊥ / fw,d = [XX.X%]
- Combined shear: τ / fw,d = [XX.X%]
```

#### Section 5: Code Reference (bg-gray-50 box)
**Heading**: Design Standard

```
According to Eurocode 3 (EN 1993-1-8):
- Section 4.5: Design of welded connections
- Formula (4.1): σvM ≤ fu / (βw × √3 × γM2)

Correlation factor βw depends on steel grade:
- S235: βw = 0.8
- S275: βw = 0.85
- S355: βw = 0.9
- S420: βw = 1.0
- S460: βw = 1.0
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Beam-column connection - Joint J1..."
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
  const results = calculateWeldCapacity(inputs);
  const plotHTML = generateStressPlot(); // Optional stress diagram

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters - 2 columns]
      ${plotHTML ? `[Plot section]` : ''}
      [Results summary - von Mises stress + 3 utilizations]
      <div class="page-break-before">
        [Detailed calculations - 5 sections]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. Helper Functions
```javascript
function gatherInputs() {
  return {
    length: parseFloat(document.getElementById('weld_length').value),
    throat: parseFloat(document.getElementById('throat_thickness').value),
    fu: parseFloat(document.getElementById('fu').value),
    betaW: parseFloat(document.getElementById('beta_w').value),
    gammaM2: parseFloat(document.getElementById('gamma_m2').value),
    N: parseFloat(document.getElementById('normal_force').value),
    Vpar: parseFloat(document.getElementById('shear_parallel').value),
    Vperp: parseFloat(document.getElementById('shear_perp').value),
    M: parseFloat(document.getElementById('moment').value)
  };
}

function getUtilizationColor(utilization) {
  if (utilization <= 85) return 'text-green-900';
  if (utilization <= 100) return 'text-yellow-900';
  return 'text-red-900';
}
```

---

## Plot/Visualization Requirements (Optional)

Could add a stress distribution diagram showing:
- Weld outline
- Force vectors (N, V∥, V⊥, M)
- Stress distribution along weld
- Critical point indicator
- Color-coded stress levels

Technologies:
- D3.js for vector graphics
- SVG inline
- Or skip plot if complexity is too high

---

## Testing Checklist

- [ ] Description field added to form
- [ ] `generateDetailedReport()` function implemented
- [ ] All stress calculations included
- [ ] von Mises formula clearly shown
- [ ] Input parameters in 2-column grid
- [ ] Utilizations color-coded correctly
- [ ] Detailed calculations with all 5 sections
- [ ] Code reference section included
- [ ] Page break before detailed calculations
- [ ] Print CSS works (white background, black text)
- [ ] No frames/borders in print
- [ ] Multi-page print tested
