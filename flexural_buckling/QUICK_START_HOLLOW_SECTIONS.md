# Quick Start: Hollow Sections in Flexural Buckling Calculator

**Ready to use NOW!** 🚀

---

## 🎯 How to Use Hollow Sections

### Step 1: Open the Calculator
Open `flexural_buckling/index.html` in your browser

### Step 2: Select a Hollow Section

**Profile Type Dropdown** now includes:

| Code | Description | Profile Count |
|------|-------------|---------------|
| CSHS | Cold formed Square Hollow | 478 profiles |
| HSHS | Hot formed Square Hollow | 481 profiles |
| CRHS | Cold formed Rectangular Hollow | 372 profiles |
| HRHS | Hot formed Rectangular Hollow | 372 profiles |
| CCHS | Cold formed Circular Hollow | 162 profiles |
| HCHS | Hot formed Circular Hollow | 158 profiles |

**Total**: 2,023 hollow section profiles available!

### Step 3: Select Size and Calculate

Example: **CSHS100X3 with S460**

```
Profile Type: CSHS - Cold formed square hollow sections
Profile Size: CSHS100X3
Steel Grade: S460
Column Length: 3000 mm
Boundary: Pinned-Pinned
```

Click **Calculate** → See results with section visualization!

---

## 🎨 What You'll See

### For Class 4 Sections (RHS/SHS)
- Blue rectangular/square tube with rounded corners
- Red hatched strips showing removed portions
- Corner radius shown in label: `ro=6.0 mm`
- Legend indicating % area reduction

### For Class 4 Sections (CHS)
- Blue concentric circles
- Red annular ring with radial hatching (uniform reduction)
- Diameter shown in label: `D=139.7 mm`
- Effective wall thickness visualization

### For Class 1-3 Sections
- Clean blue outline (no reduction)
- Accurate geometry with corner radii
- Full section is effective

---

## 📋 Quick Test Examples

### Example 1: Compact Square Section
```
CSHS100X10 + S355 + 2m → Class 1-2 (no reduction)
```
**See**: Blue square tube, no red hatching

### Example 2: Slender Square Section
```
CSHS100X3 + S460 + 3m → Class 4 (high reduction)
```
**See**: Blue square + red strips on all 4 plates

### Example 3: Rectangular Section
```
CRHS 50x30 / 2.6 + S355 + 2m → Class 4
```
**See**: Blue rectangle + red strips clipped to flat portions

### Example 4: Small Circular
```
CCHS 21.3 / 2 + S355 + 1.5m → Class 1 (compact)
```
**See**: Small blue circles, thick wall, no reduction

### Example 5: Large Thin Circular
```
CCHS 139.7 / 2 + S460 + 4m → Class 4 (slender)
```
**See**: Large blue circles + red ring with radial lines

---

## ✅ Features Working Now

- ✅ Full database of 2,023 hollow sections
- ✅ Automatic classification (Class 1-4)
- ✅ Class 4 effective properties calculation
- ✅ Section visualization with accurate geometry
- ✅ Corner radius visualization
- ✅ Removed strip visualization (RHS/SHS)
- ✅ Uniform reduction visualization (CHS)
- ✅ Detailed calculation report
- ✅ Print-friendly reports

---

## 🐛 Troubleshooting

### "Section plot not appearing"
- ✅ **Fixed!** Aspect ratio now handles CHS (D) and SHS (h=b)
- Refresh the page and try again

### "Console shows errors"
- ✅ **Fixed!** Null centroids handled for CSHS
- ✅ **Fixed!** Edge positions prevent corner overlap
- Should see no errors in F12 console

### "Removed strips look wrong"
- ✅ **Fixed!** Strips now clipped to edge positions
- They should NOT extend into rounded corners

---

## 📖 Technical Details

For developers:

**Section Detection**:
```javascript
// Automatic type detection
if (section.D && section.t) → CHS (circular)
if (section.tw && section.tf) → I/H section
if (section.t && h===b) → SHS (square)
if (section.t && h!==b) → RHS (rectangular)
```

**Visualization Logic**:
- CHS Class 4: Radial hatched annular ring on inner face
- RHS/SHS Class 4: Diagonal hatched rectangles (clipped to edges)
- All: Rounded corners using database `ro` values
- All: Labels show relevant dimensions (D, h, b, t, ro)

---

## 📚 Documentation

**Full details**:
- `COMPLETE_IMPLEMENTATION_SUMMARY.md` - Complete technical summary
- `HOLLOW_SECTION_PLOTTER_IMPLEMENTATION_SUMMARY.md` - Plotter features
- `INTEGRATION_TEST_HOLLOW_SECTIONS.md` - Test procedures
- `plans/HOLLOW_SECTION_PLOTTER_IMPLEMENTATION_PLAN.md` - Original plan

**Test file**:
- `test_hollow_section_plotting.html` - Standalone test suite

---

## 🎉 That's It!

Hollow sections are fully integrated and ready to use. Just select them from the dropdown like any other section type!

**All 10 section families now supported**:
- IPE, HEA, HEB, HEM (I/H sections) ✅
- CSHS, HSHS, CRHS, HRHS (Rectangular/Square hollow) ✅
- CCHS, HCHS (Circular hollow) ✅

**Happy calculating!** 🏗️
