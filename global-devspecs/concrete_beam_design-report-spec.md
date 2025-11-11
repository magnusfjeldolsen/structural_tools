# Concrete Beam Design - Detailed Report Specification

## Module Overview
- **Module Name**: concrete_beam_design
- **Purpose**: Calculate moment and shear capacity of concrete beams (ULS design)
- **Priority**: HIGH (Phase 1)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)
User-provided text description of the calculation (e.g., "Project ABC - Beam B1 at Grid 3")

#### 2. Title & Timestamp
```
Concrete Beam ULS Design Calculation
Calculate moment and shear capacity with detailed step-by-step derivations
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Geometry & Reinforcement**
- Width b = [value] mm
- Effective depth d = [value] mm
- Overall height h = [value] mm
- Concrete cover c = [value] mm
- Tension reinforcement As = [value] mm²
- Compression reinforcement As' = [value] mm²
- Stirrup area Asw = [value] mm²
- Stirrup spacing s = [value] mm

**Column 2: Material Properties & Loading**
- fck = [value] MPa
- fyk = [value] MPa
- γc = [value]
- γs = [value]
- fcd = [value] MPa (calculated)
- fyd = [value] MPa (calculated)
- Applied moment MEd = [value] kNm
- Applied shear VEd = [value] kN

#### 4. PLOT (Yellow heading)
- Cross-section diagram showing:
  - Beam dimensions (b × h)
  - Reinforcement positions (As and As')
  - Neutral axis location
  - Stress/strain distribution

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
MRd = [value] kNm
Moment Capacity of Beam Section
```

**3-Column Grid for Utilizations:**

| Moment Utilization | Shear Utilization | Reinforcement Ratio |
|-------------------|-------------------|---------------------|
| [XX.X%]           | [XX.X%]          | ρ = [value]%        |
| MEd / MRd         | VEd / VRd        | As / (b×d)          |

Color coding:
- Green (≤85%): text-green-900
- Yellow (85-100%): text-yellow-900
- Red (>100%): text-red-900

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1: Material Properties (bg-gray-50 box)
**Heading**: Design Strengths
```
fcd = (αcc × fck) / γc = [calculation] = [result] MPa
fyd = fyk / γs = [calculation] = [result] MPa
```

#### Section 2: Moment Capacity (bg-gray-50 box)
**Heading**: Ultimate Moment Capacity

**Step 1: Neutral Axis Depth**
```
x = (As × fyd - As' × fyd) / (0.8 × fcd × b)
x = [calculation] = [result] mm
```

**Step 2: Lever Arm**
```
z = d - 0.4 × x
z = [calculation] = [result] mm
```

**Step 3: Moment Capacity**
```
MRd = As × fyd × z
MRd = [calculation] = [result] kNm
```

**Step 4: Check Compression Zone**
```
xu,max = 0.45 × d = [value] mm
x ≤ xu,max: [OK/NOT OK]
```

#### Section 3: Shear Capacity (bg-gray-50 box)
**Heading**: Shear Resistance

**Step 1: Concrete Shear Capacity (VRd,c)**
```
k = 1 + √(200/d) ≤ 2.0 = [value]
ρl = As / (b × d) = [value]
vmin = 0.035 × k^1.5 × √fck = [value] MPa
VRd,c = max([vmin × b × d], [CRd,c × k × (100×ρl×fck)^(1/3) × b × d])
VRd,c = [result] kN
```

**Step 2: Shear Reinforcement Capacity (VRd,s)**
```
VRd,s = (Asw/s) × z × fyd × cot(θ)
Assuming θ = 45° (cot θ = 1.0)
VRd,s = [calculation] = [result] kN
```

**Step 3: Total Shear Capacity**
```
VRd = min(VRd,c + VRd,s, 0.5 × b × d × fcd)
VRd = [result] kN
```

#### Section 4: Utilization Checks (bg-gray-50 box)
**Heading**: Capacity Verification

```
Moment utilization = MEd / MRd = [value] / [value] = [XX.X%]
Shear utilization = VEd / VRd = [value] / [value] = [XX.X%]

Reinforcement ratio ρ = As / (b × d) = [value]%
Minimum reinforcement ρmin = 0.26 × (fctm / fyk) = [value]%
ρ ≥ ρmin: [OK/NOT OK]
```

---

## Input Fields to Add

```html
<div class="bg-gray-700 rounded-lg p-6">
  <h3 class="text-xl font-semibold text-cyan-400 mb-4">Calculation Description (Optional)</h3>
  <div class="space-y-2">
    <label for="calc_description" class="text-sm text-gray-300">Describe this calculation:</label>
    <textarea id="calc_description" rows="3"
              placeholder="Example: Project XYZ - Main beam B1..."
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
  const results = performCalculations(inputs);
  const plotHTML = capturePlot(); // Capture cross-section diagram

  const reportHTML = `
    <div class="report-content bg-white text-gray-900 p-8">
      ${description ? `[Description section]` : ''}
      [Title section]
      [Input parameters section - 2 columns]
      [Plot section]
      [Results summary section - utilizations in 3 columns]
      <div class="page-break-before">
        [Detailed calculations section]
      </div>
    </div>
  `;

  document.getElementById('detailed-report').innerHTML = reportHTML;
}
```

### 2. `toggleReport()`
```javascript
function toggleReport() {
  const report = document.getElementById('detailed-report');
  report.classList.toggle('hidden');
}
```

### 3. `printReport()`
```javascript
function printReport() {
  window.print();
}
```

---

## Plot/Visualization Requirements

Create or capture a cross-section diagram showing:
- Rectangular beam outline (b × h)
- Tension reinforcement (circles at bottom)
- Compression reinforcement if present (circles at top)
- Neutral axis line (dashed)
- Dimensions labeled
- Optional: Stress block diagram

Can use:
- D3.js (like concrete_dowels)
- SVG inline
- Canvas → SVG conversion

---

## Testing Checklist

- [ ] Description field added to form
- [ ] `generateDetailedReport()` function implemented
- [ ] Report HTML structure matches spec
- [ ] Plot/diagram captured and embedded
- [ ] All input parameters displayed in 2-column grid
- [ ] Utilizations in 3-column grid with color coding
- [ ] Detailed calculations formatted with proper subsections
- [ ] Page break before detailed calculations
- [ ] Print CSS hides everything except report
- [ ] Text is black on white background in print
- [ ] No borders/frames visible in print output
- [ ] Multi-page print works correctly
