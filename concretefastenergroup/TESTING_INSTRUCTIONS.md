# Testing Instructions for Torsion Fix

## Issue Summary

You reported two problems:
1. **Magnitude issue**: Forces show 0.176 kN instead of 35.355 kN (factor of ~201 = bolt area)
2. **Arrow direction**: Green arrows point opposite to calculated force values

## Testing Steps

### 1. Hard Refresh Browser
**CRITICAL**: Clear Python code cache
- Press **Ctrl + Shift + R** (or Cmd + Shift + R on Mac)
- This forces browser to reload all Python files with latest code

### 2. Open Browser Console
- Press **F12**
- Go to "Console" tab
- Keep it open during testing

### 3. Create Test Pattern
- Go to Fasteners tab
- Create 100×100mm square pattern:
  - Fastener 1: (0, 0)
  - Fastener 2: (100, 0)
  - Fastener 3: (100, 100)
  - Fastener 4: (0, 100)
- All fasteners: M16 (diameter = 16mm)

### 4. Apply Torsion Load
- Go to Loads tab
- Set load case:
  - Vx = 0
  - Vy = 0
  - Mx = 0
  - My = 0
  - **Mz = 10 kNm**
  - N = 0

### 5. Run Analysis
- Click "Run Analysis"
- **Check console** for DEBUG output:
  ```
  DEBUG Torsion: Mz=10 kNm, r_i=70.71 mm, sum_r²=20000 mm², F_i=35355.34 N
  ```

### 6. Expected Results

#### Force Magnitudes (in table):
```
ID  Vx (kN)   Vy (kN)   V_tot (kN)  N (kN)
1   +25.000   -25.000   35.355      0
2   +25.000   +25.000   35.355      0
3   -25.000   +25.000   35.355      0
4   -25.000   -25.000   35.355      0
```

**Note**: Exact values may have small sign variations depending on which fastener is ID 1

#### Arrow Directions (on plot):
For +Mz (counter-clockwise moment), fastener reactions should form a **clockwise pattern** (opposing the CCW rotation):

```
Fastener positions and expected arrow directions:

(0,100) ←↓ SW        (100,100) ↓→ SE
      4                    3



      1                    2
(0,0) →↓ SE          (100,0) →↑ NE
```

Green arrows should point:
- Fastener 1 (0,0): SE (↘) - forces: Vx=+, Vy=-
- Fastener 2 (100,0): NE (↗) - forces: Vx=+, Vy=+
- Fastener 3 (100,100): NW (↖) - forces: Vx=-, Vy=+
- Fastener 4 (0,100): SW (↙) - forces: Vx=-, Vy=-

## Diagnosis Guide

### Problem: Still seeing 0.176 kN instead of 35.355 kN

**Cause**: Browser is loading old cached Python code

**Solutions**:
1. Hard refresh again (Ctrl + Shift + R)
2. Clear all browser cache for localhost
3. Stop and restart the Python HTTP server:
   ```bash
   # Find and kill the server
   taskkill /F /IM python.exe /FI "WINDOWTITLE eq *http.server*"
   # Restart
   cd concretefastenergroup
   python -m http.server 8000
   ```
4. Check console - if NO DEBUG output appears, Python code didn't reload

### Problem: Arrows point opposite direction

**Current logic** (in script.js lines 1514-1515):
```javascript
const totalVx = -Vx_direct + Vx_torsion;
const totalVy = -Vy_direct + Vy_torsion;
```

This assumes:
- `Vx_direct`, `Vy_direct` = applied forces (need negation to show reactions)
- `Vx_torsion`, `Vy_torsion` = resisting forces (use as-is)

**If arrows point wrong direction**, we need to negate torsion forces:
```javascript
const totalVx = -Vx_direct - Vx_torsion;  // Negate both
const totalVy = -Vy_direct - Vy_torsion;  // Negate both
```

### Problem: Magnitudes correct but signs wrong

Check the force table values. If magnitudes are 25 kN but signs don't match expected pattern, the issue is in the Python calculation formula signs (planar_bending.py lines 498-499).

## Verification Checklist

- [ ] Hard refresh completed (Ctrl + Shift + R)
- [ ] Console shows DEBUG output with F_i ≈ 35355 N
- [ ] Force table shows V_tot ≈ 35.355 kN (not 0.176 kN)
- [ ] Individual force components ≈ ±25 kN
- [ ] Green arrows form clockwise pattern (opposing CCW moment)
- [ ] Arrow magnitudes proportional to force magnitudes
- [ ] Perpendicularity: arrows tangent to circles around centroid

## Additional Tests

Once basic test works, try:
1. Negative moment: Mz = -10 kNm → arrows should reverse (CCW pattern)
2. Different pattern: rectangular instead of square
3. Eccentric load: Apply at different point than centroid
4. Combined loading: Add Vx or Vy with Mz

## Debug Commands

If still having issues, add to browser console:
```javascript
// Check what forces Python returned
console.log(state.lastResults.load_distribution[0]);

// Check input data sent to Python
const inputData = buildInputJSON();
console.log('Input:', inputData);
```

## Files to Check

If problems persist, verify these files match the fix:
1. `planar_bending.py` lines 488-499: Torsion formula
2. `script.js` lines 1510-1517: Arrow visualization
3. Cache bust working: script.js line 153

## Contact/Report

If issues remain after following all steps, report:
1. Console DEBUG output (if any)
2. Actual force values from table
3. Screenshot of arrow directions
4. Browser and OS version
