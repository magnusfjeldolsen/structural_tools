# Steel Beam Relative Design - Detailed Report Specification

## Module Overview
- **Module Name**: steel_beam_relative_deisgn
- **Purpose**: Compare IPE, HEA, and HEB steel profiles for optimal weight and structural performance
- **Priority**: MEDIUM (Phase 2)

---

## Report Structure

### Page 1

#### 1. Calculation Description (Optional)

#### 2. Title & Timestamp
```
Steel Profile Comparison Calculation
Compare IPE, HEA, and HEB profiles for optimal design
Calculation Date: [timestamp]
```

#### 3. INPUT PARAMETERS (Blue heading, 2-column grid)

**Column 1: Loading Requirements**
- Design moment MEd = [value] kNm
- Design shear VEd = [value] kN
- Beam length L = [value] m
- Deflection limit L/[value]

**Column 2: Material Properties**
- Steel grade = [value]
- fy = [value] MPa
- E = [value] GPa
- γM0 = [value]
- γM1 = [value]

#### 4. PLOT (Yellow heading)
Optional: Comparison chart showing profiles

#### 5. RESULTS SUMMARY (Green heading)

**Large Result Box (Blue background)**
```
Recommended Profile: [IPE/HEA/HEB] [size]
Optimal based on weight and utilization
```

**Comparison Table (3+ columns):**

| Profile | Weight (kg/m) | Moment Util. (%) | Deflection Util. (%) | Overall Score |
|---------|---------------|------------------|----------------------|---------------|
| IPE xxx | [value]       | [XX.X%]         | [XX.X%]              | [value]       |
| HEA xxx | [value]       | [XX.X%]         | [XX.X%]              | [value]       |
| HEB xxx | [value]       | [XX.X%]         | [XX.X%]              | [value]       |

---

### Page 2: DETAILED CALCULATIONS (Purple heading, page break)

#### Section 1-N: Individual Profile Analysis
For each profile type (IPE, HEA, HEB):

```
Profile: [IPE/HEA/HEB] [size]

Section properties:
- h = [value] mm
- b = [value] mm
- tw = [value] mm
- tf = [value] mm
- A = [value] cm²
- Iy = [value] cm⁴
- Wel,y = [value] cm³
- Wpl,y = [value] cm³
- Weight = [value] kg/m

Moment capacity:
Mc,Rd = Wpl,y × fy / γM0 = [result] kNm
Utilization = MEd / Mc,Rd = [XX.X%]

Deflection check:
δmax = 5 × wEd × L⁴ / (384 × E × Iy)
δmax = [result] mm
Limit = L / [value] = [value] mm
Utilization = δmax / limit = [XX.X%]

Overall utilization = max(moment, deflection) = [XX.X%]
```

#### Final Section: Recommendation
```
Comparison summary:
[Analysis of which profile is most efficient]

Recommendation: [Profile type and size]
Reason: [Lightest/Most efficient/Best utilization balance]
```

---

## Testing Checklist

- [ ] Profile database included
- [ ] Multiple profiles compared
- [ ] Moment and deflection checks
- [ ] Weight comparison
- [ ] Recommendation logic
- [ ] Comparison table formatted
- [ ] Print output clean
