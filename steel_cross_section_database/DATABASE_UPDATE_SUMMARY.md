# Database Update Summary - Added 'h' Parameter to SHS Sections

**Date:** 2026-03-04

## Problem

Square Hollow Sections (CSHS and HSHS) were missing the `h` (height) parameter in the database.

For square sections: **h = b** (height equals width by definition)

This caused Am/V fire design calculations to fail for non-4-sided exposure configurations because the calculation formulas require both `h` and `b` dimensions.

## Solution

Added the missing `h` parameter to all square hollow section profiles in both database files.

## Changes Made

### 1. CSHS (Cold-formed Square Hollow Sections)
**File:** `cshs.json`
**Sections updated:** 148 profiles

**Script used:** `add_h_to_cshs.py`

### 2. HSHS (Hot-formed Square Hollow Sections)
**File:** `hshs.json`
**Sections updated:** 148 profiles

**Script used:** `add_h_to_hshs.py`

## Example Change

**Before:**
```json
{
  "profile": "CSHS100X10",
  "b": 100,
  "t": 10,
  "ro": 25,
  ...
}
```

**After:**
```json
{
  "profile": "CSHS100X10",
  "b": 100,
  "h": 100,
  "t": 10,
  "ro": 25,
  ...
}
```

## Scripts Created

### add_h_to_cshs.py
Simple Python script that:
1. Reads `cshs.json`
2. For each profile where `h` is missing:
   - Inserts `"h": b` right after the `"b"` property
3. Writes the updated JSON back to file

### add_h_to_hshs.py
Identical script for `hshs.json`

## Verification

Run the scripts to see the changes:
```bash
cd steel_cross_section_database
python add_h_to_cshs.py
python add_h_to_hshs.py
```

**Output:**
- CSHS: Added 'h' to 148 profiles ✓
- HSHS: Added 'h' to 148 profiles ✓

## Impact

### Before Fix
- ❌ Am/V calculations failed for SHS with non-4-sided exposure
- ❌ Calculation returned `Am = - mm` (undefined)
- ❌ Console warning: "Missing section dimensions (h=undefined, b=600)"

### After Fix
- ✅ All SHS sections now have both `h` and `b` defined
- ✅ Am/V calculations work for all exposure configurations
- ✅ No console warnings for missing dimensions

## Testing

1. **Reload application** at http://localhost:8000/index.html
2. **Select CSHS or HSHS section** (e.g., CSHS600X20)
3. **Enable fire design** with Am/V filter
4. **Select non-4-sided exposure** (e.g., "3 sides - Left side protected")
5. **Verify calculation works** - should show proper `Am` value, not `-`

## Files Modified

- ✅ `cshs.json` - All 148 profiles updated with `h` parameter
- ✅ `hshs.json` - All 148 profiles updated with `h` parameter

## Files Created

- ✅ `add_h_to_cshs.py` - Script to update CSHS database
- ✅ `add_h_to_hshs.py` - Script to update HSHS database
- ✅ `DATABASE_UPDATE_SUMMARY.md` - This summary document

## Notes

- The `h` parameter is placed immediately after `b` in the JSON structure
- For square sections, `h` always equals `b`
- This is a one-time database fix - future sections should include `h` from the start
- The scripts can be re-run safely (they skip sections that already have `h`)

## Status

✅ **COMPLETE** - Database successfully updated and ready for use
