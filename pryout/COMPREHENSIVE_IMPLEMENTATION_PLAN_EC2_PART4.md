# COMPREHENSIVE IMPLEMENTATION PLAN
## EC2 Part 4 Fastener Design Web Interface with Pyodide

**Created:** 2026-01-07
**Scope:** Complete web-based EC2 Part 4 fastener design calculator
**Technology:** Python (via Pyodide) + JavaScript + HTML5 Canvas

---

## 🎯 **EXECUTIVE SUMMARY**

Create a professional web-based interface for EC2 Part 4 fastener design calculations that:
- Uses the existing Python codebase via Pyodide (WebAssembly)
- Provides full control over fastener geometry, concrete properties, and material parameters
- Offers instant visual feedback with 2D geometry plots
- Allows load application at centroid or arbitrary points
- Fixes existing load distribution errors in the current implementation
- Provides a competitive alternative to commercial software (HILTI PROFIS, etc.)

**Key Innovation:** Leverage production-ready Python code (45 passing tests, full validation) directly in the browser without rewriting to JavaScript.

---

## 📋 **CURRENT STATE ANALYSIS**

### Python Codebase (`pryout/codes/python/fastener_design/`)
**Status:** ✅ Production-ready, fully tested

**8 Failure Modes Implemented:**
- **Tension (5 modes):** Steel, Concrete cone, Pull-out, Splitting, Blow-out
- **Shear (3 modes):** Steel, Concrete edge, Pry-out

**Key Features:**
- Complete `FastenerDesign` class with selectable failure modes
- `FastenerGroup` for multiple fasteners with spatial layout
- Material safety factors (static, fatigue, seismic)
- N-V interaction checking (combined loading)
- 45 passing tests across all modules
- Full documentation and validation against HILTI PROFIS

**Key Classes:**
```python
Fastener(diameter, embedment_depth, steel_grade, area, ...)
FastenerGroup(fasteners, spacings, edge_distances, layout)
ConcreteProperties(fck, thickness, cracked, reinforced, ...)
MaterialFactors  # Safety factors
FastenerDesign(fastener, concrete, loading, ...)  # Main interface
```

### Current Web Interface (`pryout/index.html`, `script.js`)
**Status:** ⚠️ Basic pry-out calculator only

**Current Capabilities:**
- Elastic force distribution for shear studs
- Torsion calculations
- Load cases management
- 2D canvas visualization

**Issues Identified:**
1. ❌ **Load Distribution Error:** Lever arm calculations have sign/coordinate errors - **Must verify against EC2 1992-4 formulas**
2. ❌ **Limited Scope:** Only pry-out resistance, not full EC2 Part 4
3. ❌ **No Python Integration:** All calculations in JavaScript (code duplication)
4. ❌ **Missing Mz torsion distribution:** Need to implement torsion load distribution per EC2 1992-4

**Example Error Case:**
```
Load: Vx = 10kN at (0,0)
Fastener 1 at (0,-100)
Fastener 2 at (0,-300)

Expected:
  F1 = 15kN (opposite direction to load)
  F2 = 5kN (same direction as load)

Current: ❌ Incorrect due to coordinate system sign errors
```

---

## 🏗️ **ARCHITECTURE DESIGN**

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         JavaScript Frontend (UI Layer)              │    │
│  │  - Input tables for fasteners/concrete/loads       │    │
│  │  - 2D Canvas visualization                         │    │
│  │  - Results display                                 │    │
│  │  - Load case management                            │    │
│  └──────────────┬─────────────────────────────────────┘    │
│                 │                                            │
│                 │ JSON (schema-validated)                    │
│                 ↓                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │    Pyodide Bridge (Python-JS Interface)            │    │
│  │  - Input validation & parsing                      │    │
│  │  - JSON serialization/deserialization              │    │
│  │  - Error handling & user feedback                  │    │
│  └──────────────┬─────────────────────────────────────┘    │
│                 │                                            │
│                 │ Python API calls                           │
│                 ↓                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │   Pyodide Runtime (WebAssembly Python 3.11)        │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │  fastener_design Python Package          │     │    │
│  │  │  - FastenerDesign (main interface)       │     │    │
│  │  │  - Fastener, FastenerGroup               │     │    │
│  │  │  - ConcreteProperties                    │     │    │
│  │  │  - All 8 failure modes (tested)          │     │    │
│  │  │  - N-V interaction                       │     │    │
│  │  │  - MaterialFactors                       │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User inputs → JavaScript state
2. JavaScript serializes to JSON
3. Pyodide bridge calls Python `web_interface.run_analysis(json_string)`
4. Python deserializes, runs calculations, returns JSON results
5. JavaScript updates visualization & results display

---

## 📡 **JSON COMMUNICATION SCHEMA**

### Input Schema: JavaScript → Python

```json
{
  "fasteners": [
    {
      "id": 1,
      "x": 0.0,               // mm (global coordinates)
      "y": 0.0,               // mm
      "diameter": 16.0,        // mm
      "embedment_depth": 100.0,  // mm (hef)
      "steel_grade": 500.0,    // MPa (fuk)
      "area": null,            // mm² (auto-calculated if null, can override)
      "area_override": 157.0,  // mm² (optional manual override)
      "fastener_type": "headed",
      "d_head": 28.8           // mm (optional, auto-calculated from diameter if null)
    }
  ],

  "concrete": {
    "strength_class": "C25/30",  // or provide fck directly
    "fck": 25.0,                 // MPa (optional)
    "thickness": 200.0,          // mm
    "cracked": true,             // boolean
    "reinforced": false          // boolean
  },

  "edge_distances": {
    "c1": 150.0,  // mm (primary edge)
    "c2": 150.0,  // mm (perpendicular)
    "c3": null,
    "c4": null
  },

  "spacings": {
    "auto_calculate": true,  // Calculate from positions
    "sx": 200.0,             // mm (override)
    "sy": 200.0
  },

  "loading": {
    "load_cases": [
      {
        "id": 1,
        "name": "LC1: Dead Load",
        "application_type": "centroid",  // or "point" (default: centroid)
        "application_point": {           // only used if application_type="point"
          "x": 0.0,  // mm
          "y": 0.0   // mm
        },
        "Vx": -50.0,     // kN (shear in X direction)
        "Vy": -50.0,     // kN (shear in Y direction)
        "Mz": 0.0,       // kNm (torsion about Z axis - distributed per EC2 1992-4)
        "N": 0.0         // kN (tension, positive = tension, negative = compression)
      }
    ]
    // Note: load_angle removed - users decompose loads into Vx, Vy themselves
    // Note: eccentricity removed - handled via application_point instead
  },

  "analysis_options": {
    "loading_type": "static",  // "fatigue", "seismic"
    "failure_modes": {
      "tension": ["steel", "cone", "pullout", "splitting", "blowout"],
      "shear": ["steel", "edge", "pryout"]
    },
    "include_interaction": true,  // Check N-V interaction
    "interaction_exponents": {
      "alpha_N": 1.5,  // Exponent for tension (N) - user override allowed
      "beta_V": 1.5    // Exponent for shear (V) - user override allowed
      // Formula: (NEd/NRd)^alpha_N + (VEd/VRd)^beta_V ≤ 1.0
    }
  }
}
```

### Output Schema: Python → JavaScript

```json
{
  "status": "success",  // or "error"
  "error_message": null,

  "input_summary": {
    "n_fasteners": 4,
    "centroid": {"x": 100.0, "y": 100.0},
    "concrete_k_factor": 8.5,
    "gamma_Ms": 1.2,
    "gamma_Mc": 1.5
  },

  "load_distribution": [
    {
      "fastener_id": 1,
      "position": {"x": 0.0, "y": 0.0},
      "forces": {
        "Vx_direct": -25.0,    // kN (direct shear component)
        "Vy_direct": -25.0,    // kN (direct shear component)
        "Vx_torsion": 10.0,    // kN (from Mz torsion per EC2 1992-4)
        "Vy_torsion": -5.0,    // kN (from Mz torsion per EC2 1992-4)
        "Vx_total": -15.0,     // kN (Vx_direct + Vx_torsion)
        "Vy_total": -12.5,     // kN (Vy_direct + Vy_torsion)
        "N": 10.0              // kN (tension load on this fastener)
      },
      "resultants": {
        "V_resultant": 19.6,        // kN (√(Vx_total² + Vy_total²))
        "total_resultant": 22.1     // kN (√(Vx_total² + Vy_total² + N²))
      }
    }
  ],

  "failure_modes": {
    "tension": {
      "steel": {
        "NRk_kN": 78.5,
        "NRd_kN": 65.4,
        "utilization": 0.76,
        "status": "OK",
        "gamma_M": 1.2,
        "info": {
          "As": 157.0,
          "fuk": 500.0,
          "formula": "NRk,s = As × fuk"
        }
      },
      "cone": {
        "NRk_kN": 46.5,
        "NRd_kN": 31.0,
        "utilization": 1.61,
        "status": "FAIL",
        "gamma_M": 1.5,
        "info": {
          "Ac_N": 141372.0,
          "Ac_N0": 282743.0,
          "psi_factors": {
            "psi_s,N": 1.0,
            "psi_re,N": 0.85,
            "psi_ec,N": 1.0,
            "psi_M,N": 1.0
          },
          "k_factor": 8.5
        }
      },
      "governing_mode": "cone",
      "min_capacity_kN": 31.0,
      "status": "FAIL"
    },
    "shear": {
      "steel": {
        "VRk_kN": 47.1,
        "VRd_kN": 39.3,
        "utilization": 0.51,
        "status": "OK"
      },
      "governing_mode": "steel",
      "status": "OK"
    }
  },

  "interaction": {
    "applicable": true,
    "formula": "(NEd/NRd)^alpha_N + (VEd/VRd)^beta_V ≤ 1.0",
    "interaction_ratio": 0.892,
    "alpha_N": 1.5,  // Tension exponent (user can override)
    "beta_V": 1.5,   // Shear exponent (user can override)
    "NEd_kN": 50.0,
    "VEd_kN": 20.0,
    "NRd_kN": 31.0,  // Governing tension capacity
    "VRd_kN": 39.3,  // Governing shear capacity
    "status": "OK",
    "governing_tension_mode": "cone",
    "governing_shear_mode": "steel"
  },

  "overall_status": "FAIL"
}
```

---

## 🎨 **FRONTEND DESIGN**

### Layout Structure (2-Column Responsive)

```
┌──────────────────────────────────────────────────────────────┐
│  EC2 Part 4 Fastener Design         [? Help] [Back to Tools] │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  LEFT (40%)          │  │  RIGHT (60%)                 │ │
│  │  ═══════════         │  │  ═══════════                 │ │
│  │                      │  │                              │ │
│  │  🔩 FASTENERS        │  │  📊 GEOMETRY PLOT           │ │
│  │  ┌────┬────┬────┐   │  │  ┌────────────────────────┐ │ │
│  │  │ID│X│Y│⌀│hef│     │  │  │         •F2             │ │ │
│  │  │1 │0│0│16│100│     │  │  │  •F1            •F3     │ │ │
│  │  │2 │..│..│..│...│   │  │  │        ⊗C               │ │ │
│  │  └────┴────┴────┘   │  │  │  •F4                    │ │ │
│  │  [+ Add Fastener]    │  │  └────────────────────────┘ │ │
│  │                      │  │  h = 200mm | C = (100,100)  │ │
│  │  🏗️ CONCRETE         │  │                              │ │
│  │  Strength: [C25/30▼] │  │  ──────────────────────────│ │
│  │  Thickness: [200]mm  │  │  📋 RESULTS                 │ │
│  │  ☑ Cracked           │  │  [Utilization▼][Details]    │ │
│  │  ☐ Reinforced        │  │                              │ │
│  │                      │  │  Tension Modes:             │ │
│  │  📐 GEOMETRY         │  │  Steel   65.4kN │███░░│76%  │ │
│  │  c1: [150] mm        │  │  Cone    31.0kN │█████│161% │ │
│  │  c2: [150] mm        │  │  Pullout 45.2kN │████░│110% │ │
│  │  ☑ Auto spacing      │  │  → Governing: Cone ✗        │ │
│  │                      │  │                              │ │
│  │  ⚡ LOADING          │  │  Shear Modes:               │ │
│  │  [LC1: Dead Load ▼]  │  │  Steel   39.3kN │██░░░│51%  │ │
│  │  ◉ At centroid       │  │  → Governing: Steel ✓       │ │
│  │  ○ At point (x,y)    │  │                              │ │
│  │  Vx: [-50] kN        │  │  N-V Interaction: 0.89 ✓    │ │
│  │  Vy: [-50] kN        │  │                              │ │
│  │  Mz: [0] kNm         │  │  ═════════════════════════  │ │
│  │  N:  [0] kN          │  │  OVERALL STATUS: FAIL ✗     │ │
│  │                      │  │                              │ │
│  │  ⚙️ OPTIONS          │  │  [📄 Export Report]         │ │
│  │  Type: [Static ▼]    │  │                              │ │
│  │  ☑ All failure modes │  │                              │ │
│  │                      │  │                              │ │
│  │  [🔍 CALCULATE]      │  │                              │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### UI Components Detail

#### 1. Fasteners Table
- **Columns:** ID, X(mm), Y(mm), ⌀(mm), hef(mm), fuk(MPa), As(mm²), [Delete]
- **Inline editing** with validation
- **Area column (As):** Auto-calculated from diameter, shown in gray italic
  - User can override by clicking and typing (turns black/bold)
  - Clear button to reset to auto-calculated value
- **Add row** button
- **Delete row** button (can delete ALL fasteners, no minimum)
- **Highlight on hover** (syncs with plot)
- **Copy/paste** support from Excel

#### 2. Concrete Properties
- **Strength class dropdown:** C20/25 → C90/105
- **Or manual fck input**
- **Thickness input** with units
- **Checkboxes:** Cracked, Reinforced
- **Display:** k-factor (calculated)

#### 3. Geometry Panel
- **Edge distances:** c1, c2 (c3, c4 optional)
- **Spacing:** Auto-checkbox + manual override
- **Warnings:** Red text if < minimum

#### 4. Loading Panel (Wide Table Format)
- **Load case table** with columns:
  - Name | Apply At | Point X | Point Y | Vx(kN) | Vy(kN) | Mz(kNm) | N(kN) | [Edit] [Delete]
- **Apply At:** Dropdown per load case (Centroid / Point)
  - If "Centroid": Point X, Point Y grayed out
  - If "Point": Point X, Point Y editable
- **Default:** All loads at centroid unless overridden
- **Add load case** button below table
- **No load angle field** (users decompose loads into Vx, Vy)
- **No eccentricity inputs** (handled via application point)
- **Wide enough to avoid overlap with right column**

#### 5. Analysis Options
- **Loading type dropdown:** Static/Fatigue/Seismic
- **Failure mode checkboxes** (all checked by default)
- **N-V Interaction section:**
  - Checkbox: Include interaction check
  - Input: α_N (tension exponent, default 1.5)
  - Input: β_V (shear exponent, default 1.5)
  - Label: "Formula: (NEd/NRd)^α_N + (VEd/VRd)^β_V ≤ 1.0"
  - Always visible (not collapsible)

#### 6. 2D Geometry Plot (Canvas)
**Coordinate System:** X→right, Y→up

**Elements:**
- Fasteners: Blue circles (⚫) with ID labels
- Centroid: Red cross (⊗) with "C"
- Edges: Dashed rectangle
- Load point: Orange marker (if not centroid)
- Force vectors on fasteners: Orange arrows (from load distribution)
- Applied load vectors: Red arrows (at application point)
- Axes: X(red), Y(green) with labels

**Scaling Controls (Above Plot):**
- **Force scale input:** Default = 1/20 of plot area for max force
  - Label: "Force scale: [____] (1/20 = default)"
  - User can override to zoom in/out on force vectors
- **Applied load scale:** Separate scale for applied loads (Vx, Vy arrows)

**Scaling Formula:**
- Max resultant force = max(all fastener forces)
- Arrow length = (Force / Max force) × (Plot size / 20) × scale_override

**Interactions:**
- Hover: Highlight + tooltip with force values
- Click: Select for editing
- Pan/Zoom: Future enhancement

#### 7. Results Display
**Tab 1: Utilization Bars**
- Horizontal bars per mode
- Color: Green(<85%), Yellow(85-100%), Red(>100%)
- Show NRd and utilization %

**Tab 2: Detailed Info**
- Expandable sections per mode
- Show all ψ factors
- Formulas and standard references
- Raw calculation values

**Tab 3: Table View**
- Fastener-by-fastener breakdown
- Export to CSV

---

## 🔧 **IMPLEMENTATION PHASES**

### Phase 1: Foundation (1-2 days)
**Goal:** Set up Pyodide environment and archive old code

**Tasks:**
1. Create `/pryout/old/` folder
2. Move `index.html` and `script.js` to `/old/`
3. Create `pyodide_loader.js` for Pyodide initialization
4. Test basic Python execution in browser console
5. Create skeleton HTML with layout structure

**Deliverables:**
- `old/index.html`, `old/script.js` (archived)
- `pyodide_loader.js` (Pyodide setup)
- `index_new.html` (skeleton layout)

### Phase 2: Python Bridge (2-3 days)
**Goal:** Create Python-JavaScript communication layer

**Tasks:**
1. Create `web_interface.py` in fastener_design package
2. Implement JSON parsing functions
3. Implement `run_analysis(json_str) → json_str`
4. Test round-trip data conversion
5. Handle errors gracefully

**Key Functions:**
```python
def create_fastener_from_dict(data: dict) -> Fastener
def create_concrete_from_dict(data: dict) -> ConcreteProperties
def create_fastener_group(fasteners, data: dict) -> FastenerGroup
def run_analysis(input_json: str) -> str  # Main entry point
```

**Test Cases:**
- Parse valid JSON → create objects
- Invalid JSON → error message
- Run simple calculation → return results

### Phase 3: Core UI (3-4 days)
**Goal:** Build input panels and state management

**Tasks:**
1. Fasteners table (add/edit/delete)
2. Concrete properties panel
3. Geometry panel with auto-spacing
4. Loading panel with load cases
5. Analysis options panel
6. Calculate button with loading spinner
7. State management (JavaScript object)

**State Structure:**
```javascript
const state = {
  fasteners: [...],
  concrete: {...},
  edge_distances: {...},
  load_cases: [...],
  active_load_case_id: 1,
  analysis_options: {...},
  results: null
};
```

### Phase 4: Visualization (2-3 days)
**Goal:** Interactive 2D plot with force vectors

**Tasks:**
1. Canvas setup with coordinate system
2. Draw fasteners + labels
3. Draw centroid and edges
4. Real-time updates on input change
5. Force vector arrows (after calculation)
6. Interactive hover/tooltips
7. **Fix load distribution bug** (see below)

**Load Distribution Implementation (Per EC2 1992-4):**
```javascript
/**
 * Distribute loads to fasteners per EC2 1992-4 formulas
 *
 * CRITICAL: Verify formulas against CEN/TS 1992-4-1:2009
 *
 * @param {Array} fasteners - Array of fastener objects with {id, x, y}
 * @param {number} Vx - Applied shear force X [kN]
 * @param {number} Vy - Applied shear force Y [kN]
 * @param {number} Mz - Applied torsion about Z [kNm]
 * @param {number} pointX - Load application point X [mm]
 * @param {number} pointY - Load application point Y [mm]
 * @returns {Array} Forces on each fastener
 */
function distributeLoads(fasteners, Vx, Vy, Mz, pointX, pointY) {
  const centroid = calculateCentroid(fasteners);

  // Eccentricity from load point to centroid
  const ex = pointX - centroid.x;  // mm
  const ey = pointY - centroid.y;  // mm

  // Total moment (applied + eccentric) per EC2 1992-4
  // M_total = Mz + Vx × ey - Vy × ex
  const M_total = Mz + (Vx * ey / 1000.0) - (Vy * ex / 1000.0);  // kNm

  // Convert to kNmm for calculations
  const M_total_mm = M_total * 1000.0;  // kNmm

  // Polar moment of inertia [mm²]
  const J = fasteners.reduce((sum, f) => {
    const dx = f.x - centroid.x;
    const dy = f.y - centroid.y;
    return sum + dx*dx + dy*dy;
  }, 0);

  if (J === 0) {
    throw new Error('Invalid geometry: all fasteners at same point');
  }

  return fasteners.map(f => {
    const dx = f.x - centroid.x;  // mm
    const dy = f.y - centroid.y;  // mm

    // Direct shear (equal distribution)
    const Vx_direct = Vx / fasteners.length;  // kN
    const Vy_direct = Vy / fasteners.length;  // kN

    // Torsional shear (perpendicular to radius) per EC2 1992-4
    // V_torsion = (M_total × r) / J, perpendicular to radius vector
    // For CCW positive Mz: Vx_torsion = -Mz × dy / J
    //                      Vy_torsion = +Mz × dx / J
    const Vx_torsion = -M_total_mm * dy / J;  // kN (VERIFY AGAINST STANDARD)
    const Vy_torsion =  M_total_mm * dx / J;  // kN (VERIFY AGAINST STANDARD)

    const Vx_total = Vx_direct + Vx_torsion;
    const Vy_total = Vy_direct + Vy_torsion;

    return {
      id: f.id,
      Vx_direct: Vx_direct,
      Vy_direct: Vy_direct,
      Vx_torsion: Vx_torsion,
      Vy_torsion: Vy_torsion,
      Vx_total: Vx_total,
      Vy_total: Vy_total,
      V_res: Math.sqrt(Vx_total*Vx_total + Vy_total*Vy_total)
    };
  });
}

// TODO: Double-check torsion formulas against CEN/TS 1992-4-1:2009 Section [X.X]
```

### Phase 5: Results Display (2-3 days)
**Goal:** Professional results presentation

**Tasks:**
1. Results tabs structure
2. Utilization bar chart (Canvas or SVG)
3. Detailed results with expandable sections
4. Results table view
5. Export to JSON/CSV
6. Print-friendly styling

### Phase 6: Integration & Testing (2-3 days)
**Goal:** Connect all pieces and validate

**Tasks:**
1. Wire Calculate button to Pyodide
2. Parse results and update UI
3. Test all 8 failure modes
4. Test load distribution fix (validation case)
5. Test against HILTI PROFIS examples
6. Cross-browser testing
7. Performance optimization
8. Error handling polish

**Validation Tests:**
- Load distribution: 2 fasteners, eccentric load
- HILTI comparison: Example 1 from docs
- Group effects: 2×2 group
- N-V interaction: Combined loading
- Edge effects: Small c1
- Seismic: Reduced safety factors

### Phase 7: Documentation & Polish (1-2 days)
**Goal:** User-friendly and professional

**Tasks:**
1. Help tooltips on all inputs
2. Inline explanations for failure modes
3. Example cases (load button)
4. User guide page (linked from app)
5. Mobile responsive adjustments
6. Accessibility (ARIA labels)
7. Final styling polish

### Phase 8: Deployment (1 day)
**Goal:** Live on GitHub Pages

**Deployment Strategy:**
- **Branch workflow:** Commit to `pryout` branch → auto-deploy to `gh-pages` via GitHub Actions
- **Live URL:** https://magnusfjeldolsen.github.io/structural_tools/pryout/

**Tasks:**
1. Rename `index_new.html` → `index.html`
2. Test locally with HTTP server (`python -m http.server 8000`)
3. Verify Pyodide loads and calculations work offline
4. Commit all changes to `pryout` branch
5. Push to GitHub
6. Verify GitHub Actions workflow runs successfully
7. Check deployment to `gh-pages` branch
8. Test live URL (may take 1-2 minutes for cache refresh)
9. Update main tools index page with link
10. Test cross-browser (Chrome, Firefox, Safari)

**GitHub Actions Verification:**
- Check workflow at: https://github.com/magnusfjeldolsen/structural_tools/actions
- Verify `gh-pages` branch updated
- Check deployment logs for errors

---

## 🧪 **VALIDATION & TESTING**

### ⚠️ CRITICAL: EC2 1992-4 Formula Verification

**BEFORE IMPLEMENTATION - Verify torsion distribution formulas:**

1. **Source Document:** CEN/TS 1992-4-1:2009
   - Located in: `pryout/1992-4-1/` directory
   - Section: [TO BE IDENTIFIED] - Load distribution for fastener groups

2. **Formulas to Verify:**
   ```
   M_total = Mz + Vx × ey - Vy × ex
   Vx_torsion = -M_total × dy / J
   Vy_torsion =  M_total × dx / J
   ```

3. **Sign Convention Check:**
   - Coordinate system: X-right, Y-up, Z-out (right-hand rule)
   - Positive Mz: Counter-clockwise when viewed from +Z
   - Verify perpendicular force directions match standard

4. **Validation Method:**
   - Hand calculate simple 2-fastener case
   - Verify equilibrium: ΣFx = 0, ΣFy = 0, ΣMz = 0
   - Compare against current implementation in `script.js`
   - Check if current code has correct or incorrect signs

**ACTION ITEM:** Review EC2 1992-4-1 document BEFORE coding load distribution

---

### Test Case 1: Load Distribution Fix
```
Setup:
  Fasteners: F1(0, -100), F2(0, -300)
  Load: Vx = 10kN at (0, 0)

Hand Calculation:
  Centroid: Yc = (-100 + -300)/2 = -200mm
  Eccentricity: ey = 0 - (-200) = 200mm
  Torsion: M = Vx × ey = 10 × 0.2 = 2.0 kNm
  J = 100² + 100² = 20,000 mm²

  F1: Vx = 10/2 + (-2000 × 100)/20000 = 5 + 10 = 15kN ✓
  F2: Vx = 10/2 + (-2000 × -100)/20000 = 5 - 10 = -5kN ✓

Expected Result:
  F1 pulls 15kN (opposes load)
  F2 pulls 5kN (assists load)
```

### Test Case 2: HILTI PROFIS Comparison
Use Example 1 from `docs/WORKED_EXAMPLES.md`:
- M16, hef=100mm, C25/30 cracked
- Tension: 50kN
- Compare: Steel (65.4kN), Cone (31.0kN), Pullout (45.2kN)
- Tolerance: ±5%

### Test Case 3: Fastener Group (2×2)
Use Example 2:
- 4 fasteners, 200mm spacing
- Verify ψs,N group factor
- Verify cone overlap effects

### Test Case 4: N-V Interaction
Use Example 6:
- NEd = 30kN, VEd = 25kN
- Verify interaction ratio
- Verify pass/fail logic

---

## 📁 **FILE STRUCTURE (Final)**

```
pryout/
├── old/                    # ARCHIVE
│   ├── index.html
│   ├── script.js
│   └── IMPLEMENTATION_PLAN.md
│
├── index.html              # NEW main page
├── script.js               # NEW main JavaScript
├── pyodide_loader.js       # Pyodide initialization
├── styles.css              # Additional CSS
│
├── codes/
│   └── python/
│       └── fastener_design/
│           ├── [all existing files]
│           └── web_interface.py  # NEW bridge module
│
├── examples/               # NEW example JSON files
│   ├── single_fastener.json
│   ├── group_2x2.json
│   └── combined_loading.json
│
└── docs/
    └── user_guide_web.md   # NEW web UI guide
```

---

## ⚠️ **CRITICAL DESIGN DECISIONS**

### 1. Pyodide Loading Strategy
**Decision:** Load on page load, show spinner
**Rationale:** Avoid 3-5s delay on first calculate
**Trade-off:** Longer initial page load, but better UX

### 2. Coordinate System
**Decision:** X-right, Y-up (right-hand)
**Rationale:** Standard engineering convention
**Impact:** Fixes sign errors in torsion

### 3. Auto-Spacing
**Decision:** Calculate from positions by default
**Rationale:** More intuitive, fewer errors
**Override:** Manual checkbox available

### 4. Failure Mode Defaults
**Decision:** All modes checked initially
**Rationale:** Conservative, matches commercial software
**User control:** Can uncheck unwanted modes

### 5. Results Caching
**Decision:** Cache per load case
**Rationale:** Fast load case switching
**Memory:** Acceptable (~KB per case)

---

## 📊 **SUCCESS CRITERIA**

### Functionality ✅
- [ ] All 8 failure modes calculate correctly
- [ ] Load distribution matches hand calculations
- [ ] Results match HILTI within 5%
- [ ] N-V interaction works
- [ ] Load cases add/edit/delete
- [ ] Fasteners add/edit/delete
- [ ] Auto-spacing calculates correctly

### Usability ✅
- [ ] Intuitive for new users
- [ ] Visual feedback <100ms
- [ ] Clear error messages
- [ ] Professional appearance
- [ ] Help tooltips available
- [ ] Example cases loadable

### Performance ✅
- [ ] Page load <5s
- [ ] Calculation <500ms
- [ ] Canvas 60fps
- [ ] Works offline (after load)

### Reliability ✅
- [ ] Chrome, Firefox, Safari
- [ ] No crashes on invalid input
- [ ] Graceful error handling
- [ ] Mobile responsive

---

## 🚀 **DEPLOYMENT CHECKLIST**

- [ ] All validation tests passing
- [ ] Cross-browser tested
- [ ] Mobile layout verified
- [ ] Help documentation complete
- [ ] Example cases working
- [ ] Performance acceptable
- [ ] No console errors
- [ ] Accessibility checked
- [ ] Code commented
- [ ] README updated
- [ ] Committed to branch
- [ ] Pushed to GitHub
- [ ] GitHub Actions successful
- [ ] Live URL tested
- [ ] Main index updated

---

## 📚 **RESOURCES**

**Python Codebase:**
- `codes/python/fastener_design/design.py` - Main interface
- `codes/python/fastener_design/docs/USER_GUIDE.md` - API reference
- `codes/python/fastener_design/docs/WORKED_EXAMPLES.md` - Validation

**Standards:**
- CEN/TS 1992-4-1:2009 (General)
- CEN/TS 1992-4-2:2009 (Headed Fasteners)

**Technologies:**
- [Pyodide](https://pyodide.org/) - Python in browser
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- HTML5 Canvas - Visualization

---

**END OF COMPREHENSIVE IMPLEMENTATION PLAN**

This plan provides a complete roadmap for a production-ready web application that rivals commercial software while maintaining full transparency and leveraging the extensively tested Python codebase.

**Next Step:** Begin Phase 1 - Foundation (archive old code, set up Pyodide)

Would you like to proceed? (Y/N)