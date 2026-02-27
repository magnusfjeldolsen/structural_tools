# Testing - Flexural Buckling Module

This folder contains test scripts for validating the flexural buckling module.

## Available Tests

### test_profile_names.py

Validates that all profile names in the steel section databases match the expected naming convention.

**Usage:**
```bash
cd testing
python test_profile_names.py
```

**Expected Behavior:**
- Each database file (hea.json, heb.json, etc.) should only contain profiles matching its type prefix
- Example: `cshs.json` should only contain profiles starting with "CSHS", not "SHS"

**Current Issues:**
- `cshs.json` contains 148 profiles with "SHS" prefix instead of "CSHS"
  - These should be renamed to use "CSHS" prefix for consistency

**Test Results Format:**
```
[PASS] - All profiles match expected pattern
[FAIL] - Some profiles don't match (shows mismatch details)
```

## Fixing Profile Name Issues

If the test fails for a specific database, the profile names in that JSON file need to be updated:

1. Open the JSON file (e.g., `steel_cross_section_database/cshs.json`)
2. Find all profiles with incorrect prefix (e.g., "SHS" instead of "CSHS")
3. Update the `"profile"` field to use the correct prefix
4. Re-run the test to verify

Alternatively, use a bulk find-replace in your editor:
- Find: `"profile": "SHS `
- Replace: `"profile": "CSHS `
