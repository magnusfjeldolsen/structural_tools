#!/usr/bin/env python3
"""
Clean up CSHS JSON file:
1. Remove duplicate profiles
2. Standardize naming to "CSHS{size}X{thickness}" format
3. Keep all unique sections based on geometric properties
"""

import json
import sys
from pathlib import Path

def normalize_profile_name(name):
    """
    Normalize profile name to standard format: CSHS{size}X{thickness}
    Examples:
      "CSHS 20 / 2" -> "CSHS20X2"
      "CSHS25/2" -> "CSHS25X2"
      "CSHS 150 / 6.3" -> "CSHS150X6.3"
      "CSHS120x10" -> "CSHS120X10"
      "CSHS100 X 10" -> "CSHS100X10"
    """
    # Remove "CSHS" prefix temporarily (case insensitive)
    name_upper = name.upper()
    if name_upper.startswith("CSHS"):
        name = name[4:].strip()
    else:
        name = name.strip()

    # Remove all spaces (including non-breaking spaces \xa0)
    name = name.replace(" ", "").replace("\xa0", "")

    # Replace / or x (lowercase) with X (uppercase)
    # Handle both single x and uppercase X
    name = name.replace("/", "X").replace("x", "X")

    # Ensure uppercase
    name = name.upper()

    # Add back CSHS prefix
    return f"CSHS{name}"

def profiles_are_equal(p1, p2):
    """Check if two profiles have identical geometric properties"""
    # Compare key geometric properties
    keys_to_compare = ['b', 't', 'A', 'Iy', 'Iz', 'iy', 'iz']

    for key in keys_to_compare:
        if p1.get(key) != p2.get(key):
            return False
    return True

def clean_cshs_file(input_file, output_file=None):
    """
    Clean CSHS JSON file by:
    1. Standardizing names
    2. Removing duplicates based on geometric properties
    """
    # Read input file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Original profile count: {len(data['profiles'])}")

    # Track unique profiles
    unique_profiles = {}
    duplicate_count = 0
    renamed_count = 0

    for profile in data['profiles']:
        original_name = profile['profile']
        normalized_name = normalize_profile_name(original_name)

        if original_name != normalized_name:
            renamed_count += 1

        # Check if we already have this profile
        if normalized_name in unique_profiles:
            # Verify it's truly a duplicate (same geometric properties)
            if profiles_are_equal(profile, unique_profiles[normalized_name]):
                duplicate_count += 1
                print(f"  Duplicate found: {original_name} -> {normalized_name}")
                continue
            else:
                print(f"  WARNING: Different properties for same name: {original_name}")
                # Keep both but flag it
                print(f"    Existing: A={unique_profiles[normalized_name]['A']}, "
                      f"Iy={unique_profiles[normalized_name]['Iy']}")
                print(f"    New: A={profile['A']}, Iy={profile['Iy']}")
                continue

        # Add to unique profiles with normalized name
        profile['profile'] = normalized_name
        unique_profiles[normalized_name] = profile

    # Update data with unique profiles (sorted by name)
    data['profiles'] = [unique_profiles[name] for name in sorted(unique_profiles.keys())]

    print(f"\nCleaning summary:")
    print(f"  - Original profiles: {len(data['profiles']) + duplicate_count}")
    print(f"  - Duplicates removed: {duplicate_count}")
    print(f"  - Names standardized: {renamed_count}")
    print(f"  - Final profile count: {len(data['profiles'])}")

    # Write output
    output_path = output_file if output_file else input_file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nCleaned file written to: {output_path}")

    return data

if __name__ == "__main__":
    script_dir = Path(__file__).parent
    input_file = script_dir / "cshs.json"

    # Create backup
    backup_file = script_dir / "cshs.json.backup"
    import shutil
    shutil.copy(input_file, backup_file)
    print(f"Backup created: {backup_file}")

    # Clean the file
    clean_cshs_file(input_file)
