# Find Lightest Candidate - Class 4 Implementation Plan

**Date**: 2026-03-02
**Status**: Planning
**Branch**: class4-implementation

---

## 1. Problem Statement

Current `findLightestSection()` does not properly handle Class 4 sections:
- When `allowClass4 = false`, it skips Class 4 but doesn't log why
- When `allowClass4 = true`, it should use effective properties (already works via `calculateBuckling`)
- No distinction between ULS Class 4 and Fire Class 4
- User not informed when sections are skipped due to Class 4

---

## 2. Requirements

### 2.1 Core Logic

**Sorting**: Always by `A_gross` (price driver, not `A_eff`)

**Toggle 1: Allow/Avoid Class 4**
- **Allow** → Calculate with effective properties, accept if utilization ≤ 100%
- **Avoid** → Skip Class 4 sections, log reason, continue to next

**Toggle 2: Fire Design**
- **Specify θ**:
  - Classify with ε_fire = √(235/f_y,θ)
  - May be Class 4 in fire but not ULS (or vice versa)
  - Use max(util_ULS, util_fire) for acceptance

- **Find θ_cr**:
  - Brent's method iterates temperature
  - At each θ, classify with ε_fire = √(235/f_y,θ)
  - If Class 4 at that θ, use effective properties in resistance
  - Continue until N_Ed,fi / N_b,fi,Rd = 1.0

### 2.2 Effective Properties Reuse

**Key Insight** (from user):
> "the topology of removed plate parts is not considering stress level, only stress ratios σ₁ and σ₂"

**Critical Understanding**:
- **Higher f_y → MORE likely Class 4** (slenderness limits scale with ε = √(235/f_y))
- **In fire**: f_y,θ is REDUCED → ε_fire INCREASES → Section MORE LIKELY to be lower class
- **Therefore**: If ULS is Class 4, fire is **at least** Class 4 (or better: Class 3, 2, 1)

**Classification Possibilities**:
1. **ULS: Class 4, Fire: Class 4** → Reuse effective properties ✅
2. **ULS: Class 4, Fire: Class 3 or better** → Use GROSS properties in fire (not Class 4!)
3. **ULS: Class 3, Fire: Class 4** → IMPOSSIBLE (fire has lower f_y, so more favorable)
4. **ULS: Class 3, Fire: Class 3 or better** → Use gross properties for both

**Corrected Implementation**:
```javascript
// ULS classification (at f_y)
const ulsClassification = classifySection(section, fy_MPa, profileType);

// Fire classification (at f_y,θ - LOWER yield strength)
const fireClassification = classifySection(section, fy_theta, profileType);

// Determine which properties to use
if (ulsClassification.is_class4) {
  // ULS is Class 4 → fire is Class 4 OR BETTER
  if (fireClassification.is_class4) {
    // Both Class 4 → Reuse ULS effective properties (same topology)
    fireWorkingSection = ulsEffectiveProperties;
  } else {
    // ULS Class 4, but fire improved to Class 1-3 → Use GROSS in fire!
    fireWorkingSection = section; // Gross properties
  }
} else {
  // ULS is Class 1-3 → fire is definitely NOT Class 4 (lower fy → better class)
  fireWorkingSection = section; // Gross properties
}
```

**Why this matters**:
- At high temperatures (f_y,θ very low), ε_fire becomes large
- Slenderness limits become more forgiving
- Section that was Class 4 at room temp may become Class 1 at 800°C!
- Must use GROSS properties for fire calculation (not effective)

---

## 3. Data Flow

### 3.1 Input Gathering

**From UI** (flexural_buckling_ui.js):
```javascript
function gatherInputs() {
  return {
    // ... existing inputs ...
    allowClass4: document.getElementById('class4-toggle').checked,
    fireEnabled: document.getElementById('fire-toggle').checked,
    fireMode: getSelectedFireMode(), // 'specify' or 'find-critical'
    temperature_C: parseFloat(document.getElementById('temperature').value),
    NEd_fire_kN: parseFloat(document.getElementById('ned-fire').value)
  };
}
```

### 3.2 API Flow (calculateBuckling)

**Current behavior**:
```javascript
// Line 1041-1054 in flexural_buckling_api.js
if (classification.is_class4) {
  if (!allowClass4) {
    return { success: false, error: 'Section is Class 4...' };
  }
  effectiveProperties = calculateClass4EffectiveProperties(...);
  workingSection = effectiveProperties;
}
```

**No changes needed** - already correct!

### 3.3 Find Lightest Flow

**Enhanced logic**:
```javascript
for (const profileName of sortedProfiles) {
  const testInputs = { ...inputs, profileName };
  const results = calculateBuckling(testInputs);

  // Handle Class 4 detection
  if (!results.success) {
    // Check if failure is due to Class 4
    if (results.classification?.is_class4) {
      skippedClass4.push({
        profile: profileName,
        reason: 'Class 4 section (user chose to avoid)',
        classification: results.classification
      });
      console.log(`  ⊗ Skipped ${profileName}: Class 4 (avoid mode)`);
      continue; // Try next section
    }
    // Other failure → also skip
    continue;
  }

  // Section passed - check utilization
  let maxUtil = results.ulsResults.utilization;

  if (inputs.fireEnabled && inputs.fireMode === 'specify') {
    maxUtil = Math.max(maxUtil, results.fireResults.utilization);
  }

  if (maxUtil <= 1.0) {
    // Found lightest!
    return { success: true, profileName, results, skippedClass4 };
  }
}

// No valid section found
return {
  success: false,
  error: `No suitable section found. Tested ${testedCount} sections.`,
  skippedClass4: skippedClass4,
  reason: skippedClass4.length > 0
    ? `${skippedClass4.length} sections skipped (Class 4 avoid mode)`
    : 'All sections exceed 100% utilization'
};
```

---

## 4. Fire Classification Enhancement

### 4.1 Classify at Temperature

**New function needed**:
```javascript
function classifySectionAtTemperature(section, temperature_C, profileType) {
  const k_y_theta = getFireReductionFactor(temperature_C, 'k_y_theta');
  const fy_theta = section.fy * k_y_theta; // Note: fy should be passed or stored

  // Use fire-specific epsilon
  const epsilon_fire = Math.sqrt(235 / fy_theta);

  return classifySection(section, fy_theta, profileType);
}
```

### 4.2 Integration with Brent's Method

**Current** (line 1197-1230):
```javascript
function calculateCriticalTemperature(inputs) {
  const objectiveFunction = (temp) => {
    const k_y = getFireReductionFactor(temp, 'k_y_theta');
    const k_E = getFireReductionFactor(temp, 'k_E_theta');
    const fy_theta = inputs.fy_MPa * k_y;
    const E_theta = 210000 * k_E;

    // Calculate resistance at this temperature
    const Nb_Rd = calculateBucklingResistance(..., temp, ...);

    return inputs.NEd_fire_kN / Nb_Rd.Nb_Rd_kN - 1.0;
  };

  return brentRootFinder(objectiveFunction, 20, 1000);
}
```

**Enhanced**:
```javascript
const objectiveFunction = (temp) => {
  // Classify at this temperature
  const fireClassification = classifySectionAtTemperature(section, temp, profileType);

  // Determine section to use
  let workingSection = section;
  if (fireClassification.is_class4 && inputs.allowClass4) {
    // Check if can reuse ULS effective properties
    if (ulsClassification.is_class4) {
      workingSection = ulsEffectiveProperties; // Reuse!
    } else {
      // Calculate fresh effective properties for fire
      workingSection = calculateClass4EffectiveProperties(section, fireClassification, profileType);
    }
  } else if (fireClassification.is_class4 && !inputs.allowClass4) {
    // Class 4 at this temperature but user doesn't allow it
    return Infinity; // Force Brent to increase temperature
  }

  // Continue with material reduction and resistance calculation
  const k_y = getFireReductionFactor(temp, 'k_y_theta');
  const k_E = getFireReductionFactor(temp, 'k_E_theta');
  const fy_theta = inputs.fy_MPa * k_y;
  const E_theta = 210000 * k_E;

  const slenderness_y = calculateSlenderness(Ly_m, workingSection.iy, fy_theta, E_theta);
  // ... rest of calculation
};
```

---

## 5. UI Feedback

### 5.1 Find Lightest Results Display

**Enhanced display**:
```html
<div id="lightest-results">
  <h3>Lightest Section Found</h3>
  <p><strong>Profile:</strong> IPE300</p>
  <p><strong>Classification:</strong> Class 3 (ULS), Class 4 (Fire at 600°C)</p>
  <p><strong>Using:</strong> Effective properties (A_eff = 52.4 cm²)</p>
  <p><strong>Utilization:</strong> 98.5% (fire governs)</p>

  <!-- If sections were skipped -->
  <div class="warning">
    <p>⚠️ 12 lighter sections skipped (Class 4 - avoid mode enabled)</p>
    <button onclick="showSkippedSections()">View skipped sections</button>
  </div>
</div>
```

### 5.2 Progress Updates

**Enhanced logging**:
```javascript
console.log(`Testing ${profileName} (${testedCount}/${totalCount})`);
if (classification.is_class4) {
  console.log(`  → Class 4 detected: ${classification.governing_element}`);
  if (!allowClass4) {
    console.log(`  ⊗ Skipped (avoid mode)`);
  } else {
    console.log(`  ✓ Using effective properties (A_eff = ${A_eff.toFixed(2)} cm²)`);
  }
}
```

---

## 6. Implementation Steps

### Step 1: Update `findLightestSection()` to track Class 4 skips
**File**: flexural_buckling_api.js (lines 1387-1490)
- Add `skippedClass4` array
- Enhanced logging for Class 4 detection
- Return skipped sections in result

### Step 2: Add `classifySectionAtTemperature()` helper
**File**: flexural_buckling_api.js (new function ~line 600)
- Takes section, temperature, profileType
- Returns classification with fire-specific ε

### Step 3: Update `calculateBucklingResistance()` to accept pre-computed classification
**File**: flexural_buckling_api.js (line 1030)
- Optional parameter: `precomputedClassification`
- Skip classification if provided
- Allows Brent's method to classify once per iteration

### Step 4: Enhance Brent's method objective function
**File**: flexural_buckling_api.js (lines 1197-1250)
- Classify at each temperature
- Use effective properties if Class 4 and allowed
- Handle Class 4 rejection

### Step 5: Update UI to display skipped sections
**File**: flexural_buckling_ui.js
- Show warning if sections were skipped
- Modal/expandable list of skipped sections
- Suggest enabling "Allow Class 4" if many skipped

### Step 6: Add tests
**File**: test_find_lightest_class4.js (new)
- Test with allowClass4 = true/false
- Test fire-only Class 4 (not ULS Class 4)
- Test effective properties reuse

---

## 7. Edge Cases

### 7.1 ULS Class 4, Fire Improves to Class 3
**Scenario**: IPE220/S460 at 800°C
- ULS: Class 4 (ε = 0.71, web slender)
- Fire: Class 3 (ε_fire = 1.62 at f_y,θ = 89 MPa, web now OK!)
- User: Allow Class 4

**Expected**:
- ULS uses A_eff (effective properties)
- Fire uses A_gross (section improved, no longer Class 4)
- Utilization may be governed by either ULS or fire

### 7.2 All sections Class 4
**Scenario**: All IPE sections with S460 have Class 4 webs
- User: Avoid Class 4

**Expected**: Error message "No suitable section found (all are Class 4)"

### 7.3 Lightest passes, but is Class 4
**Scenario**: IPE180/S460
- Class 4 web, but A_eff sufficient
- Utilization = 85%

**Expected with avoid**: Skip, try IPE200
**Expected with allow**: Accept IPE180 (lightest!)

---

## 8. Testing Strategy

### 8.1 Unit Tests

```javascript
// Test 1: Basic Class 4 handling
test('Find lightest - allow Class 4', () => {
  const inputs = {
    profileType: 'ipe',
    Ly: '3',
    Lz: '3',
    steelGrade: 'S460',
    NEd_ULS: '300',
    allowClass4: true
  };

  const result = findLightestSection(inputs);
  expect(result.success).toBe(true);
  expect(result.results.ulsResults.classification.is_class4).toBe(true);
  expect(result.results.ulsResults.is_using_effective).toBe(true);
});

// Test 2: Avoid Class 4
test('Find lightest - avoid Class 4', () => {
  const inputs = { /* same as above */, allowClass4: false };

  const result = findLightestSection(inputs);
  expect(result.success).toBe(true);
  expect(result.results.ulsResults.classification.is_class4).toBe(false);
  expect(result.skippedClass4.length).toBeGreaterThan(0);
});

// Test 3: Fire-only Class 4
test('Fire Class 4 but ULS Class 3', () => {
  const inputs = {
    profileType: 'ipe',
    Ly: '3',
    Lz: '3',
    steelGrade: 'S355',
    NEd_ULS: '300',
    fireEnabled: true,
    fireMode: 'specify',
    temperature_C: 700,
    NEd_fire: '180',
    allowClass4: false
  };

  const result = findLightestSection(inputs);
  // Should skip sections that are Class 4 in fire even if OK in ULS
  expect(result.skippedClass4.some(s => s.reason.includes('fire'))).toBe(true);
});
```

### 8.2 Integration Tests

1. **Manual UI test**:
   - Load IPE/S460/Ly=3m/NEd=200kN
   - Toggle "Avoid Class 4" → Should find heavier section (Class 1-3)
   - Toggle "Allow Class 4" → Should find lighter section (Class 4 with A_eff)

2. **Fire critical temperature**:
   - IPE220/S460/NEd_fi=120kN
   - Find θ_cr with "Allow Class 4" → Should use A_eff at high temps
   - Result should match manual calculation

---

## 9. Success Criteria

✅ **Find Lightest with Allow Class 4**:
- Uses effective properties in calculations
- Accepts section if utilization ≤ 100% with A_eff
- Shows A_eff in results

✅ **Find Lightest with Avoid Class 4**:
- Skips all Class 4 sections
- Logs skip reason
- Reports number of skipped sections
- Finds lightest Class 1-3 section

✅ **Fire Design Integration**:
- Classifies at fire temperature (ε_fire)
- Reuses ULS effective props if both Class 4
- Calculates fresh if only fire is Class 4
- Handles Class 4 in Brent's method

✅ **User Feedback**:
- Clear indication when Class 4 is used
- Warning when sections are skipped
- Suggestion to enable "Allow" if many skipped

---

## 10. Next Actions

1. ✅ **Push current work** to class4-implementation branch
2. **Implement Step 1**: Update findLightestSection() with Class 4 tracking
3. **Test locally** with IPE/S460 (known Class 4)
4. **Implement Steps 2-4**: Fire classification enhancement
5. **Update UI** (Step 5)
6. **Write tests** (Step 6)
7. **User testing** with real scenarios

---

**Implementation Priority**: Medium-High
**Estimated Effort**: 3-4 hours
**Dependencies**: Database metadata (plate_elements) must be loaded

