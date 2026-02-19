# Cable Designer v2 — Implementation Plan

## What changes vs v1

### New physics (from proposed_new_cable_analyzer.py)

| Feature | How it works |
|---------|-------------|
| **Self-weight** | Cable weight per unit length [kN/m]. Under self-weight alone the cable takes a true catenary shape (cosh). |
| **Initial sag** | User specifies target sag [m] under self-weight only. Solver finds the H that produces this shape and stores `y_initial`. |
| **Horizontal stiffness** | If `support_k_h` [kN/m] is given, supports displace horizontally: δ_h = H·L / K_h |
| **Max horizontal force** | If `support_h_max` [kN] is given, H is capped at this value. Cable sags more than the stiff-support equilibrium would predict. |

### New result fields
`f_initial`, `H_initial`, `y_initial[]`, `delta_h`, `H_utilization`, `constrained_by_H_max`

---

## Implementation checklist

### Phase 1 — Python engine

- [ ] **Replace** `cable_designer/python/cable_analyzer.py` with `proposed_new_cable_analyzer.py`
  - Delete the notes block at the bottom (lines 497–542)
  - Rename file in place (already same entry-point: `run_analysis`)
  - No other Python changes needed

### Phase 2 — units.js

Add two new unit keys:
```javascript
selfWeight:  { label: 'kN/m',  toInternal: v => v,       fromInternal: v => v  },
hStiffness:  { label: 'kN/m',  toInternal: v => v,       fromInternal: v => v  },
```
Both stay in kN/m internally. `hDisp` for horizontal displacement display uses `length` (m).

### Phase 3 — store.js

Add new state fields:
```javascript
// Cable initial state
selfWeight: 0.0,        // [kN/m]  — 0 means no self-weight / initial sag
initialSag: null,       // [m]     — null = use default (L/100 if selfWeight > 0)

// Support conditions
supportHMax: null,      // [kN]    — null = unconstrained
supportKH: null,        // [kN/m]  — null = rigid supports (no horizontal displacement)
```

Add corresponding setters: `setSelfWeight`, `setInitialSag`, `setSupportHMax`, `setSupportKH`
All setters clear `results` (same pattern as existing setters).

### Phase 4 — app.js

Extend payload building:
```javascript
const payload = {
  ...existing fields...,
  self_weight:   s.selfWeight  || 0.0,
  initial_sag:   s.initialSag  || null,
  support_h_max: s.supportHMax || null,
  support_k_h:   s.supportKH   || null,
};
```

Validation: if `selfWeight > 0` but no `initialSag`, Python defaults to L/100 — acceptable.

### Phase 5 — index.html (UI layout)

#### New input section: "Cable Initial State"
Insert between **Material** and **Loads** sections.

```
╔══════════════════════════════╗
║  3. CABLE INITIAL STATE      ║
╚══════════════════════════════╝
  Self-weight     [kN/m]   (0 = no self-weight / initial shape)
  Initial sag     [m]      (shown only when self-weight > 0; blank = L/100 default)
```

#### New input section: "Support Conditions"
Insert between **Loads** and **Solver Settings** (collapsible, like Solver).

```
╔══════════════════════════════╗
║  4. SUPPORT CONDITIONS       ║  (collapsible)
╚══════════════════════════════╝
  Max horiz. force   H_max  [kN]   (blank = unconstrained)
  Horiz. stiffness   K_h    [kN/m] (blank = rigid)
```

Both fields are optional — blank = not active. Use `null` in store when blank.

#### Dynamic visibility
- `Initial sag` input row: `display:none` when `selfWeight == 0`, visible otherwise
- `Support Conditions` section: always shown (collapsible) but labeled "(optional)"

### Phase 6 — ui.js

**New inputs to bind:**
- `input-self-weight` → `setSelfWeight`
- `input-initial-sag` → `setInitialSag` (show/hide based on selfWeight)
- `input-h-max` → `setSupportHMax` (blank input → store null)
- `input-k-h` → `setSupportKH` (blank input → store null)

**New result cards (in existing 8-card grid, expand to 10):**
- `delta_h` — Horizontal displacement [m] (shown only when support_k_h active)
- `H_utilization` — H / H_max [%] (shown only when support_h_max active)

**Constrained warning**: when `constrained_by_H_max === true`, show amber warning badge next to H card: "H limited by support capacity".

**Helper for optional numeric inputs:**
```javascript
function parseOptional(str) {
  const v = parseFloat(str);
  return isNaN(v) || str.trim() === '' ? null : v;
}
```

### Phase 7 — charts.js

**Cable shape plot (chart-shape)** — add initial catenary series:
```javascript
// New dataset alongside existing 'Cable shape' and 'Original position'
{
  label: `Initial shape (self-weight, f₀ = ${r.f_initial.toFixed(4)} m)`,
  data: _toXY(x, y_initial.map(v => -v)),
  borderColor: 'rgba(251,191,36,0.7)',  // amber — distinct from blue loaded shape
  borderDash: [4, 3],
  borderWidth: 1.5,
  pointRadius: 0,
}
```
Only added when `results.has_initial_sag === true` and `results.y_initial !== null`.

**Result summary additions:**
- If `delta_h > 0`: annotate cable shape x-axis with small arrow showing support displacement
- If `constrained_by_H_max`: add a horizontal dashed line on force plot at H_max

**No other chart changes needed** — existing 4 plots remain identical.

---

## UI layout change summary

```
LEFT PANEL (inputs)
├── 1. Geometry           (unchanged)
├── 2. Material           (unchanged)
├── 3. Cable Initial State  ← NEW
│      Self-weight [kN/m]
│      Initial sag [m]  (conditional)
├── 4. Loads              (unchanged)
├── 5. Support Conditions  ← NEW (collapsible)
│      Max H [kN]         (optional)
│      K_h [kN/m]         (optional)
├── 6. Solver Settings    (unchanged, collapsible)
└── [ANALYZE]

RIGHT PANEL (results)
├── Convergence bar       (+ constrained warning if H_max active)
├── Result cards          (10 cards: +delta_h, +H_utilization)
├── Load diagram          (unchanged)
├── Cable shape           (+ initial shape dashed amber line)
├── Force distribution    (+ H_max dashed line if active)
└── Stress distribution   (unchanged)
```

---

## Key design decisions

1. **All new fields are optional** — default store values of `0` / `null` keep v1 behaviour exactly intact. Existing test cases produce identical results.

2. **`y_initial` is shown only when self_weight > 0** — avoids confusing a flat zero-line with the unloaded shape.

3. **Blank inputs = null** — empty `H_max` field means unconstrained, not zero. Zero would be meaningless and cause solver errors.

4. **`delta_h` is a display-only output** — it doesn't feed back into the shape calculation (no geometric update for support movement). This is consistent with the Python model.

5. **Section ordering** — "Cable Initial State" comes before "Loads" because initial sag is a property of the cable geometry, not the loading.
