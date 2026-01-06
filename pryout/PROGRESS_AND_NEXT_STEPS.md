# Pryout Module - Current Progress and Next Steps

**Last Updated**: 2026-01-05
**Branch**: `pryout`
**Status**: Core functionality complete, styling and polish in progress

---

## ✅ COMPLETED FEATURES

### Core Functionality (100% Complete)
- ✅ **Elastic force distribution** - Correctly implements EC2-1-4 formulas
- ✅ **Torsion handling** - Accounts for eccentric force application
- ✅ **Multiple load cases** - Add/edit/delete load cases with dropdown selector
- ✅ **Centroid calculation** - Auto-calculates from stud positions
- ✅ **Polar moment calculation** - For torsional resistance
- ✅ **Pry-out resistance** - Per EC2-1-4 with psi factors (edge, spacing, group)
- ✅ **Results per load case** - Stores all results for switching between cases
- ✅ **Envelope calculation** - Max/min forces across all load cases
- ✅ **Utilization calculation** - Color-coded (green/yellow/red)

### Smart Spacing Feature (100% Complete)
- ✅ **Vectorized spacing calculation** - Automatically finds minimum distance between studs
- ✅ **Auto-calculated spacing** - Updates live as studs are added/moved
- ✅ **Manual override** - Checkbox to allow user-specified spacing
- ✅ **Visual feedback** - Light blue background when auto-calculated
- ✅ **Read-only when auto** - Prevents accidental edits to calculated value

### UI Components (80% Complete)
- ✅ **Material properties inputs** - All EC2 parameters with validation
- ✅ **Stud table** - Add/edit/delete studs with X,Y coordinates
- ✅ **Load case management** - Modal dialog for add/edit
- ✅ **Force application** - Radio buttons for centroid vs. point
- ✅ **Results table** - Shows Vx, Vy, Vres, V_Rd, utilization%
- ✅ **Canvas visualization** - Basic geometry display
- ✅ **EC2 warnings** - Spacing and edge distance validation
- 🚧 **Dark theme** - Partially implemented (50%)
- ❌ **Detailed report** - Not yet implemented
- ❌ **Force vector display** - Not yet implemented

### Pre-loaded Example
- ✅ 8 studs from pryout4.py example
- ✅ Default load case "Dead Load" (-50, -50, 0)
- ✅ Material properties (fck=30, hef=100, d=19)

---

## 🚧 IN PROGRESS

### Dark Theme Styling (50% Complete)
**What's Done:**
- ✅ HTML `class="dark"` added
- ✅ Meta tags and SEO (Open Graph, Twitter Card)
- ✅ Centralized CSS links (common.css, forms.css, components.css, print.css, report-print.css)
- ✅ Custom CSS styles updated for dark theme:
  - `.input-field` → bg-gray-600, border-gray-500, text-gray-100
  - `.btn-*` → Dark theme colors with transitions
  - `table`, `th`, `td` → Gray backgrounds with proper borders
  - `.util-ok/warning/fail` → Bright colors (green-400, yellow-400, red-400)
  - `canvas` → border-gray-600, bg-gray-900
- ✅ Body background → bg-gray-900, text-gray-100
- ✅ Main container → bg-gray-800, rounded-xl
- ✅ Header → text-white, text-gray-300 subtitle
- ✅ "Back to Tools" link → text-blue-400 hover:text-blue-300
- ✅ Material Properties section → bg-gray-700 rounded-lg

**What's Remaining:**
- ❌ Studs section → Change to `bg-gray-700 rounded-lg p-6`
- ❌ Studs section header → `text-xl font-semibold text-cyan-400 mb-4`
- ❌ Load Cases section → `bg-gray-700 rounded-lg p-6`
- ❌ Load Cases header → `text-xl font-semibold text-cyan-400 mb-4`
- ❌ Tabs section → `bg-gray-700 rounded-lg p-6`
- ❌ Canvas section → `bg-gray-700 rounded-lg p-6`
- ❌ Results section → `bg-gray-700 rounded-lg p-6`
- ❌ Results header → `text-xl font-semibold text-green-400 mb-4`
- ❌ Warning boxes → Use yellow/red backgrounds (bg-yellow-900/50, bg-red-900/50)
- ❌ Load case dialog → Dark theme (bg-gray-800)
- ❌ Spacing info text → Update color for dark theme (text-cyan-400)
- ❌ Manual spacing checkbox label → text-gray-300

**Action Required:** Replace all remaining `section-card` divs with `bg-gray-700 rounded-lg p-6` and update headers to use colored text (blue-400, cyan-400, green-400).

---

## ❌ NOT YET STARTED

### 1. Negative Coordinates Support
**Current**: Validation prevents negative X/Y values
**Required**: Allow negative coordinates for studs

**Changes Needed:**
```javascript
// In addStud() - Remove the check:
// REMOVE: if (isNaN(x) || isNaN(y) || x < 0 || y < 0)
// REPLACE WITH: if (isNaN(x) || isNaN(y))

// In updateStudFromTable() - Remove the check:
// REMOVE: if (isNaN(numValue) || numValue < 0)
// REPLACE WITH: if (isNaN(numValue))

// In drawModelView() - Already handles negative correctly via min/max
```

**Files to Edit:**
- `script.js` - Remove `|| x < 0 || y < 0` checks
- `index.html` - Remove `min="0"` from stud X/Y inputs

---

### 2. Change Tabs to Dropdown Selector
**Current**: Three tab buttons (Model, Results, Envelope)
**Required**: Single dropdown to select view mode

**HTML Changes:**
```html
<!-- REPLACE the tab buttons section with: -->
<div class="bg-gray-700 rounded-lg p-4 mb-4">
    <div class="flex items-center gap-3">
        <label class="text-sm font-medium text-gray-300">View:</label>
        <select id="view-selector" onchange="switchView()" class="input-field flex-1">
            <option value="model">Model Geometry</option>
            <option value="results">Results (Active Load Case)</option>
            <option value="envelope">Envelope (All Cases)</option>
        </select>
    </div>
</div>
```

**JavaScript Changes:**
```javascript
// Replace switchTab() with:
function switchView() {
    const view = document.getElementById('view-selector').value;
    state.ui.activeTab = view;

    // Auto-update results view dropdown
    if (view === 'envelope') {
        document.getElementById('results-view').value = 'envelope';
    } else if (view === 'results') {
        document.getElementById('results-view').value = 'active';
    }

    updateResultsView();
    refreshCanvas();
}
```

**Files to Edit:**
- `index.html` - Replace tab buttons with dropdown
- `script.js` - Replace `switchTab()` with `switchView()`

---

### 3. Show Force Vectors on Canvas (Results View Only)
**Current**: Canvas only shows geometry (studs, centroid, edges)
**Required**: Draw force vectors when in Results or Envelope view

**Implementation:**
```javascript
// In drawResultsView()
function drawResultsView(ctx, canvas) {
    const results = state.results[state.activeLoadCaseId];
    if (!results) {
        drawModelView(ctx, canvas);
        return;
    }

    // First draw model geometry
    drawModelView(ctx, canvas);

    // Then overlay force vectors
    const edgeDist = parseFloat(document.getElementById('edge_dist').value) || 100;
    const xs = state.studs.map(s => s.x);
    const ys = state.studs.map(s => s.y);
    const minX = Math.min(...xs) - edgeDist;
    const maxX = Math.max(...xs) - edgeDist;
    const minY = Math.min(...ys) - edgeDist;
    const maxY = Math.max(...ys) - edgeDist;

    const modelWidth = maxX - minX;
    const modelHeight = maxY - minY;
    const padding = 60;
    const availWidth = canvas.width - 2 * padding;
    const availHeight = canvas.height - 2 * padding;
    const scale = Math.min(availWidth / modelWidth, availHeight / modelHeight);

    const toCanvasX = (x) => padding + (x - minX) * scale;
    const toCanvasY = (y) => padding + (y - minY) * scale;

    // Determine force scale (scale forces to be visible)
    const maxForce = Math.max(...results.results.map(r => r.Vres_kN));
    const forceScale = 50 / maxForce; // 50 pixels for max force

    // Draw force vectors for each stud
    results.results.forEach((r, index) => {
        const stud = state.studs[index];
        const x = toCanvasX(stud.x);
        const y = toCanvasY(stud.y);

        // Draw force arrow (orange)
        const dx = -r.Vx_kN * forceScale;
        const dy = -r.Vy_kN * forceScale;

        drawArrow(ctx, x, y, x + dx, y + dy, '#fb923c', 2);

        // Optionally label with force magnitude
        ctx.fillStyle = '#fb923c';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${r.Vres_kN.toFixed(1)} kN`, x + dx + 5, y + dy);
    });

    // Draw applied force at application point
    const lc = state.loadCases.find(l => l.id === state.activeLoadCaseId);
    const appPoint = results.applicationPoint;
    const appX = toCanvasX(appPoint.x);
    const appY = toCanvasY(appPoint.y);

    const appliedDx = lc.Vx * forceScale;
    const appliedDy = lc.Vy * forceScale;

    drawArrow(ctx, appX, appY, appX + appliedDx, appY + appliedDy, '#ef4444', 3);

    // Draw moment circle if non-zero
    if (Math.abs(results.MTotal) > 0.01) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(appX, appY, 30, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#a855f7';
        ctx.font = '12px sans-serif';
        ctx.fillText(`Mz = ${results.MTotal.toFixed(1)} kNm`, appX + 35, appY);
    }
}

// Helper function to draw arrow
function drawArrow(ctx, x1, y1, x2, y2, color, lineWidth) {
    const headlen = 8;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}
```

**Files to Edit:**
- `script.js` - Update `drawResultsView()` and `drawEnvelopeView()` to include force vectors

---

### 4. Auto-Switch to Results After Calculate
**Current**: Stays on current tab after clicking Calculate
**Required**: Automatically switch to Results view after analysis completes

**Implementation:**
```javascript
// In runAnalysis(), after calculations complete:
function runAnalysis() {
    // ... existing code ...

    try {
        // ... existing calculations ...

        // Calculate all load cases and envelope
        calculateAllLoadCases(fck, hef, d, edgeDist, spacing);
        calculateEnvelope();

        // Update UI
        updateResultsView();

        // AUTO-SWITCH TO RESULTS VIEW
        state.ui.activeTab = 'results';
        document.getElementById('view-selector').value = 'results';
        document.getElementById('results-view').value = 'active';

        refreshCanvas();

        console.log('Analysis complete for', lc.name);
    } catch (error) {
        alert('Calculation error: ' + error.message);
        console.error(error);
    }
}
```

**Files to Edit:**
- `script.js` - Add view switching at end of `runAnalysis()`

---

### 5. Add Ctrl+Space Keyboard Shortcut
**Current**: Must click Calculate button
**Required**: Press Ctrl+Space to run analysis

**Implementation:**
```javascript
// Add to existing keydown event listener:
document.addEventListener('keydown', (e) => {
    // Ctrl+Space to calculate
    if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        runAnalysis();
        return;
    }

    // ... existing keyboard handlers (Delete, Escape, etc.) ...
});
```

**Files to Edit:**
- `script.js` - Add to `keydown` event listener at bottom of file

---

### 6. Implement Detailed Report (Like Dowels Module)
**Current**: No report generation
**Required**: Professional PDF-ready report with all calculations

**Structure** (based on dowels module):
1. **Calculation Description** (optional textarea input)
2. **Title & Timestamp**
3. **INPUT PARAMETERS** (blue heading #1d4ed8)
   - Material properties (2-column grid)
   - Stud positions (table)
   - Load case details
4. **GEOMETRY PLOT** (yellow heading #a16207)
   - Canvas screenshot or SVG export
5. **RESULTS SUMMARY** (green heading #15803d)
   - Utilizations per stud (3-column grid)
   - Max utilization highlighted
   - Color-coded (green ≤85%, yellow ≤100%, red >100%)
6. **DETAILED CALCULATIONS** (purple heading #6b21a8)
   - Centroid calculation
   - Polar moment calculation
   - Force distribution per stud
   - Psi factors (edge, spacing, group)
   - Resistance calculation
   - Utilization checks

**HTML Addition:**
```html
<!-- Add after main content, before closing </main> -->
<div class="mt-8">
    <div class="flex gap-2">
        <button onclick="toggleReport()" class="btn-secondary">
            📄 View Detailed Report
        </button>
        <button onclick="printReport()" class="btn-secondary hidden" id="print-report-btn">
            🖨️ Print Report
        </button>
    </div>
</div>

<!-- Report Container (Hidden by default) -->
<div id="detailed-report" class="hidden mt-6 bg-white text-gray-900 p-8 rounded-lg print:block">
    <!-- Report content generated by JavaScript -->
</div>
```

**JavaScript Functions Needed:**
```javascript
function generateDetailedReport() {
    // Create comprehensive HTML report with all sections
    // Similar to dowels module report structure
}

function toggleReport() {
    const report = document.getElementById('detailed-report');
    const printBtn = document.getElementById('print-report-btn');

    if (report.classList.contains('hidden')) {
        generateDetailedReport();
        report.classList.remove('hidden');
        printBtn.classList.remove('hidden');
    } else {
        report.classList.add('hidden');
        printBtn.classList.add('hidden');
    }
}

function printReport() {
    window.print(); // report-print.css will handle hiding everything except #detailed-report
}
```

**Files to Edit:**
- `index.html` - Add report container and buttons
- `script.js` - Add report generation functions

**Estimated Effort**: 3-4 hours

---

### 7. Add to Front Page and Module Registry
**Current**: Not listed on main index.html
**Required**: Add button and update searchable registry

**Front Page Changes (`index.html` in root):**
Add under **Concrete** category:
```html
<a href="pryout/index.html" class="tool-card">
    <h3>EC2-1-4 Pry-Out Analyzer</h3>
    <p class="tool-description">Shear stud groups with elastic force distribution and torsion</p>
    <div class="tool-tags">
        <span class="tool-tag">EC2-1-4</span>
        <span class="tool-tag">Studs</span>
        <span class="tool-tag">Connections</span>
    </div>
</a>
```

**Module Registry Updates:**
Check if there's a `modules.json` or similar registry file that needs updating for search functionality.

**Files to Edit:**
- `index.html` (root) - Add tool card
- `modules.json` or registry file (if exists)

---

## 📊 PROGRESS SUMMARY

| Category | Progress | Status |
|----------|----------|--------|
| **Core Calculations** | 100% | ✅ Complete |
| **Smart Spacing** | 100% | ✅ Complete |
| **Load Cases** | 100% | ✅ Complete |
| **Results Tables** | 100% | ✅ Complete |
| **Canvas Geometry** | 100% | ✅ Complete |
| **Dark Theme** | 50% | 🚧 In Progress |
| **Force Vectors** | 0% | ❌ Not Started |
| **Negative Coords** | 0% | ❌ Not Started |
| **Dropdown View** | 0% | ❌ Not Started |
| **Auto-Switch Results** | 0% | ❌ Not Started |
| **Ctrl+Space Shortcut** | 0% | ❌ Not Started |
| **Detailed Report** | 0% | ❌ Not Started |
| **Front Page** | 0% | ❌ Not Started |

**Overall**: ~60% Complete

---

## 🎯 RECOMMENDED IMPLEMENTATION ORDER

1. **Finish Dark Theme** (30 mins)
   - Quick wins, improves visual consistency
   - Simply replace remaining section divs

2. **Negative Coordinates** (15 mins)
   - Remove validation checks
   - Simple fix, important for flexibility

3. **Dropdown View Selector** (30 mins)
   - Replace tabs with dropdown
   - Cleaner UI

4. **Force Vector Visualization** (2 hours)
   - Most valuable visual feature
   - Helps users understand results

5. **Auto-Switch to Results** (5 mins)
   - Trivial addition
   - Nice UX touch

6. **Ctrl+Space Shortcut** (5 mins)
   - Trivial addition
   - Power user feature

7. **Detailed Report** (3-4 hours)
   - Most time-consuming
   - Professional presentation
   - Reference dowels module

8. **Front Page Integration** (30 mins)
   - Final step for discoverability

**Total Remaining Effort**: ~7-8 hours

---

## 🐛 KNOWN ISSUES

1. **Spacing info color** - Currently blue-600 (light theme), should be cyan-400 (dark theme)
2. **Manual spacing checkbox label** - Currently gray-600, should be gray-300
3. **Warning boxes** - Need dark theme colors (bg-yellow-900/50 border-yellow-500)
4. **Load case dialog** - Needs dark theme background
5. **Auto-calculated spacing background** - Currently hardcoded #f0f9ff, should respect dark theme

---

## 📝 TESTING CHECKLIST

Before marking as complete:

- [ ] Test with 8-stud example from pryout4.py
- [ ] Verify results match Python implementation
- [ ] Test negative coordinates (all quadrants)
- [ ] Test single stud (edge case)
- [ ] Test collinear studs (edge case)
- [ ] Test multiple load cases (add, edit, delete, switch)
- [ ] Test envelope calculation accuracy
- [ ] Verify spacing warnings (< 3d or < 100mm)
- [ ] Verify edge distance warnings (< 1.5hef or < 2d)
- [ ] Test force vector visualization accuracy
- [ ] Test report generation (all sections)
- [ ] Test print layout (A4 size)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsive design

---

## 📦 DEPLOYMENT NOTES

**Current Branch**: `pryout`
**Deployment**: Automatic via GitHub Actions when pushed to `pryout` branch
**Live URL** (after merge): `https://magnusfjeldolsen.github.io/structural_tools/pryout/`

**To Deploy Updates:**
```bash
git add pryout/
git commit -m "Description of changes"
git push origin pryout
```

GitHub Actions will automatically:
1. Build if needed (not required for plain HTML)
2. Deploy to gh-pages branch
3. Publish to GitHub Pages (1-2 minutes)

---

## 🔄 WHEN RESUMING WORK

1. **Check out pryout branch**:
   ```bash
   git checkout pryout
   git pull origin pryout
   ```

2. **Start with quickest wins** (dark theme, negative coords, shortcuts)

3. **Test locally**: Open `pryout/index.html` directly in browser

4. **Reference modules for styling**:
   - `concrete_dowels/index.html` - Dark theme sections
   - `concrete_dowels/script.js` - Report generation

5. **Commit frequently**: Small, logical commits for easy rollback

---

**Questions or Issues?**
- Check pryout4.py for calculation reference
- Check IMPLEMENTATION_PLAN.md for original design decisions
- Check concrete_dowels module for report structure
- Check DEPLOYMENT.md for deployment workflow

---

**Last Worked On**: Dark theme styling (Material Properties section complete)
**Next Task**: Finish remaining dark theme sections (Studs, Load Cases, Results)
