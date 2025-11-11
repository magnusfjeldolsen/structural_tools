# Unit Conversion Policy - 2dfea

## 🎯 Core Principle: Pure Backend with Engineering Units

**The backend (`pynite_analyzer.py`) outputs engineering units directly.**
**The frontend receives ready-to-use values - NO conversion needed!**

---

## 📊 Unit Flow

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Browser)                                  │
│  ─────────────────                                   │
│  Input units: m, kN, kNm                            │
│  Display units: mm, kN, kNm, mrad                   │
│  NO CONVERSIONS IN UI CODE                          │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ JSON: {E: 210, I: 1e-4, loads: [...]}
                   ▼
┌──────────────────────────────────────────────────────┐
│  Worker (solverWorker.js)                           │
│  ───────────────────────                            │
│  Pass-through - no unit handling                    │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Same JSON
                   ▼
┌──────────────────────────────────────────────────────┐
│  Python Backend (pynite_analyzer.py)                │
│  ──────────────────────────────────                 │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  INPUT CONVERSION                          │    │
│  │  (create_model, _add_*_load methods)       │    │
│  ├────────────────────────────────────────────┤    │
│  │  kN → N          (×1000)                   │    │
│  │  kNm → Nm        (×1000)                   │    │
│  │  kN/m → N/m      (×1000)                   │    │
│  │  GPa → Pa        (×1e9)                    │    │
│  │  m, m², m⁴       (no change)               │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  PyNite Analysis                           │    │
│  │  ───────────────                           │    │
│  │  Internal units: m, N, Nm, Pa              │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  OUTPUT CONVERSION                         │    │
│  │  (_extract_results method ONLY)           │    │
│  ├────────────────────────────────────────────┤    │
│  │  m → mm          (×1000)                   │    │
│  │  rad → mrad      (×1000)                   │    │
│  │  N → kN          (÷1000)                   │    │
│  │  Nm → kNm        (÷1000)                   │    │
│  │  N/m → kN/m      (÷1000)                   │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ JSON: {DY: 5.23, max_moment: 40.5, ...}
                   │       (in mm, kN, kNm)
                   ▼
┌──────────────────────────────────────────────────────┐
│  Frontend Display                                    │
│  ────────────────                                    │
│  Display as-is: ${data.DY} mm                       │
│               ${data.max_moment} kNm                │
│  NO CONVERSIONS                                     │
└──────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Unit Reference

### Input (Frontend → Backend)

| Quantity | Input Unit | Notes |
|----------|-----------|-------|
| Coordinates (x, y) | m | |
| Length | m | |
| Cross-section area | m² | |
| Moment of inertia | m⁴ | |
| Elastic modulus | GPa | Backend converts to Pa |
| Point loads | kN | Backend converts to N |
| Moments | kNm | Backend converts to Nm |
| Distributed loads | kN/m | Backend converts to N/m |

### Output (Backend → Frontend)

| Quantity | Output Unit | Source Unit | Conversion |
|----------|------------|-------------|------------|
| Displacements (DX, DY, DZ) | mm | m | ×1000 |
| Rotations (RX, RY, RZ) | rad | rad | no change |
| Reaction forces | kN | N | ÷1000 |
| Reaction moments | kNm | Nm | ÷1000 |
| Element forces (axial, shear) | kN | N | ÷1000 |
| Element moments | kNm | Nm | ÷1000 |
| Deflections (diagrams) | mm | m | ×1000 |
| Lengths | m | m | no change |
| Coordinates | m | m | no change |

---

## 🔒 Centralization Rules

### ✅ DO:
1. **Convert inputs** in `create_model()` and `_add_*_load()` methods
2. **Convert outputs** in `_extract_results()` method ONLY
3. **Document units** in docstrings and comments
4. **Display values as-is** in frontend (they're already in engineering units)

### ❌ DON'T:
1. **Never convert** in worker JavaScript
2. **Never convert** in frontend display code
3. **Never convert** in multiple places
4. **Never assume** units - always document

---

## 💡 Why This Approach?

### Benefits:
1. **Single Source of Truth** - All conversions in `pynite_analyzer.py`
2. **No Frontend Confusion** - UI devs just display values
3. **Type Safety** - Frontend TypeScript types document units
4. **Testability** - Easy to verify conversions in one place
5. **Maintainability** - Change conversions in one location

### Example Frontend Code:
```typescript
// ✅ CORRECT - No conversions needed
<div>Deflection: {result.nodes.N1.DY} mm</div>
<div>Moment: {result.elements.E1.max_moment} kNm</div>

// ❌ WRONG - Don't do this!
<div>Deflection: {result.nodes.N1.DY * 1000} mm</div>
```

---

## 🧪 Testing Unit Conversions

### Python Standalone Test:
```bash
cd public/python
python pynite_analyzer.py
```

Expected output should show:
- Displacements in mm (not m)
- Forces in kN (not N)
- Moments in kNm (not Nm)

### Browser Integration Test:
1. Open `http://localhost:8000/test/worker-test.html`
2. Run analysis
3. Check results show values in mm, kN, kNm
4. Verify no `×1000` or `÷1000` in display code

---

## 📝 Code Locations

### Input Conversions
- File: `public/python/pynite_analyzer.py`
- Methods:
  - `create_model()` - line ~63: `E_element = float(element['E']) * 1e9`
  - `_add_nodal_load()` - lines ~161-163: `fx/fy/mz * 1000`
  - `_add_distributed_load()` - lines ~176-177: `w1/w2 * 1000`
  - `_add_element_point_load()` - line ~191: `magnitude * 1000`

### Output Conversions
- File: `public/python/pynite_analyzer.py`
- Method: `_extract_results()` - lines ~208-301
  - Node displacements: `×1000` (m → mm)
  - Node rotations: `×1000` (rad → mrad)
  - Reactions: `÷1000` (N → kN, Nm → kNm)
  - Element forces: `÷1000` (N → kN)
  - Element moments: `÷1000` (Nm → kNm)
  - Diagram deflections: `×1000` (m → mm)

---

## ⚠️ Common Mistakes to Avoid

### Mistake 1: Converting in Frontend
```javascript
// ❌ WRONG
const displayValue = result.DY * 1000;  // Backend already did this!

// ✅ CORRECT
const displayValue = result.DY;  // Already in mm
```

### Mistake 2: Forgetting to Document Units
```typescript
// ❌ WRONG
interface NodeResult {
  DY: number;  // What unit?
}

// ✅ CORRECT
interface NodeResult {
  DY: number;  // mm (millimeters)
}
```

### Mistake 3: Partial Conversions
```python
# ❌ WRONG - Only converting some values
'moments': [m / 1000 for m in moments],  # kNm
'deflections': deflections,  # Still in m - INCONSISTENT!

# ✅ CORRECT - All or nothing
'moments': [m / 1000 for m in moments],  # kNm
'deflections': [d * 1000 for d in deflections],  # mm
```

---

## 📚 TypeScript Type Definitions (Future)

```typescript
/**
 * Analysis results with engineering units
 * All values are ready for direct display - NO conversion needed
 */
interface AnalysisResults {
  nodes: {
    [nodeId: string]: {
      DX: number;  // mm (millimeters)
      DY: number;  // mm
      DZ: number;  // mm
      RX: number;  // mrad (milliradians)
      RY: number;  // mrad
      RZ: number;  // mrad
      reactions: {
        FX: number;  // kN (kilonewtons)
        FY: number;  // kN
        MZ: number;  // kNm (kilonewton-meters)
      };
    };
  };
  elements: {
    [elemId: string]: {
      max_moment: number;      // kNm
      max_shear: number;       // kN
      max_axial: number;       // kN
      max_deflection: number;  // mm
      length: number;          // m (meters - no conversion)
    };
  };
  diagrams: {
    [elemId: string]: {
      x_coordinates: number[];  // m
      moments: number[];        // kNm
      shears: number[];         // kN
      axials: number[];         // kN
      deflections: number[];    // mm
    };
  };
}
```

---

**Last Updated:** 2025-10-29 (Step 1 Implementation)
**Review Status:** ✅ Centralized and documented
