#!/usr/bin/env python3
"""
Profile Name Validation Test for Flexural Buckling Module
Tests that profile names in each database match the expected pattern
"""

import json
import os
import re
import sys
from pathlib import Path

# Expected patterns for each profile type
PROFILE_PATTERNS = {
    'hea': r'^HEA\s*\d+',
    'heb': r'^HEB\s*\d+',
    'hem': r'^HEM\s*\d+',
    'ipe': r'^IPE\s*\d+',
    'hrhs': r'^HRHS\s*\d+',
    'hshs': r'^HSHS\s*\d+',
    'hchs': r'^HCHS\s*\d+',
    'crhs': r'^CRHS\s*\d+',
    'cshs': r'^CSHS\s*\d+',
    'cchs': r'^CCHS\s*\d+'
}

def test_profile_database(profile_type, db_path):
    """Test a single profile database for correct naming"""

    print(f"\n{'='*60}")
    print(f"Testing: {profile_type.upper()}")
    print(f"{'='*60}")

    if not os.path.exists(db_path):
        print(f"❌ ERROR: Database file not found: {db_path}")
        return False

    # Load JSON
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ ERROR: Failed to load JSON: {e}")
        return False

    if 'profiles' not in data:
        print(f"❌ ERROR: No 'profiles' key in database")
        return False

    profiles = data['profiles']
    pattern = PROFILE_PATTERNS[profile_type]
    regex = re.compile(pattern, re.IGNORECASE)

    # Statistics
    total_profiles = len(profiles)
    matching_profiles = []
    mismatched_profiles = []

    # Test each profile
    for profile in profiles:
        profile_name = profile.get('profile', '')

        if regex.match(profile_name):
            matching_profiles.append(profile_name)
        else:
            mismatched_profiles.append(profile_name)

    # Report results
    print(f"Total profiles: {total_profiles}")
    print(f"[OK] Matching pattern '{pattern}': {len(matching_profiles)}")
    print(f"[!!] Not matching: {len(mismatched_profiles)}")

    if mismatched_profiles:
        print(f"\n[WARNING] MISMATCHED PROFILES:")
        for i, name in enumerate(mismatched_profiles[:10], 1):  # Show first 10
            print(f"  {i}. {name}")
        if len(mismatched_profiles) > 10:
            print(f"  ... and {len(mismatched_profiles) - 10} more")

        # Show what they start with
        print(f"\nPrefix analysis of mismatched profiles:")
        prefixes = {}
        for name in mismatched_profiles:
            prefix = name.split()[0] if ' ' in name else name[:4]
            prefixes[prefix] = prefixes.get(prefix, 0) + 1

        for prefix, count in sorted(prefixes.items(), key=lambda x: -x[1]):
            print(f"  '{prefix}': {count} profiles")

        return False

    print(f"\n[PASS] All profiles match expected pattern!")

    # Show sample profiles
    print(f"\nSample profiles (first 5):")
    for i, name in enumerate(matching_profiles[:5], 1):
        print(f"  {i}. {name}")

    return True

def main():
    """Run all tests"""

    # Get database directory (two levels up from this script, then into steel_cross_section_database)
    script_dir = Path(__file__).parent
    db_dir = script_dir.parent.parent / 'steel_cross_section_database'

    print("=" * 60)
    print("PROFILE NAME VALIDATION TEST")
    print("=" * 60)
    print(f"Database directory: {db_dir}")

    if not db_dir.exists():
        print(f"\n❌ ERROR: Database directory not found: {db_dir}")
        sys.exit(1)

    # Test all profile types
    all_passed = True
    results = {}

    for profile_type in PROFILE_PATTERNS.keys():
        db_path = db_dir / f"{profile_type}.json"
        passed = test_profile_database(profile_type, db_path)
        results[profile_type] = passed
        all_passed = all_passed and passed

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for profile_type, passed in results.items():
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{profile_type.upper():10s}: {status}")

    print("\n" + "=" * 60)

    if all_passed:
        print("[SUCCESS] ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("[FAILURE] SOME TESTS FAILED")
        print("\nRecommendation: Update database files to use consistent naming.")
        print("Example: All profiles in cshs.json should start with 'CSHS', not 'SHS'")
        sys.exit(1)

if __name__ == '__main__':
    main()
