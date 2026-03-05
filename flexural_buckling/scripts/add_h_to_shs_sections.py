#!/usr/bin/env python3
"""
Add 'h' parameter to Square Hollow Sections (SHS) in database.

For square hollow sections, height h equals width b by definition.
This script adds the missing 'h' property to:
- CSHS (Cold-formed Square Hollow Sections)
- HSHS (Hot-formed Square Hollow Sections)

Usage:
    python add_h_to_shs_sections.py
"""

import json
import os
from pathlib import Path

def update_shs_sections(json_file_path):
    """
    Update SHS sections to add h = b where h is missing.

    Args:
        json_file_path: Path to the JSON database file

    Returns:
        tuple: (sections_updated, total_sections)
    """
    print(f"\n📁 Processing: {json_file_path}")

    # Read the JSON file
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sections_updated = 0
    total_sections = len(data)

    # Update each section
    for section in data:
        # Check if h is missing but b exists
        if 'b' in section and 'h' not in section:
            # For square hollow sections, h = b
            section['h'] = section['b']
            sections_updated += 1
            print(f"  ✓ Updated {section.get('designation', section.get('profile', 'Unknown'))}: h = {section['h']}")
        elif 'h' in section and 'b' in section:
            # Verify h = b for square sections
            if abs(section['h'] - section['b']) > 0.01:
                print(f"  ⚠️  Warning: {section.get('designation', 'Unknown')} has h={section['h']} ≠ b={section['b']}")

    # Write back to file with pretty formatting
    with open(json_file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  ✅ Updated {sections_updated}/{total_sections} sections")

    return sections_updated, total_sections


def main():
    """Main function to update all SHS database files."""

    print("=" * 70)
    print("Adding 'h' parameter to Square Hollow Sections (SHS)")
    print("=" * 70)

    # Get the script directory
    script_dir = Path(__file__).parent.parent

    # Define the database files to update
    # Adjust paths based on actual database structure
    database_files = [
        script_dir / 'data' / 'cshs.json',  # Cold-formed SHS
        script_dir / 'data' / 'hshs.json',  # Hot-formed SHS
    ]

    # Alternative: if database is embedded in API file, we'll need different approach
    # Check if data directory exists
    data_dir = script_dir / 'data'
    if not data_dir.exists():
        print(f"\n⚠️  Warning: Data directory not found at {data_dir}")
        print("The database might be embedded in flexural_buckling_api.js")
        print("\nSearching for database in API file...")

        # Try to find database in API file
        api_file = script_dir / 'flexural_buckling_api.js'
        if api_file.exists():
            print(f"\n📄 Found API file: {api_file}")
            print("\nTo extract and update the database:")
            print("1. Option A: Extract JSON data from API file manually")
            print("2. Option B: Use JavaScript to export the database")
            print("\nExample JavaScript (run in browser console):")
            print("```javascript")
            print("// Export CSHS")
            print("console.log(JSON.stringify(window.structuralSteelDatabase.cshs, null, 2));")
            print("// Export HSHS")
            print("console.log(JSON.stringify(window.structuralSteelDatabase.hshs, null, 2));")
            print("```")
            print("\nThen save the output to JSON files and run this script again.")

        return

    # Update each database file
    total_updated = 0
    total_sections = 0

    for db_file in database_files:
        if db_file.exists():
            updated, total = update_shs_sections(db_file)
            total_updated += updated
            total_sections += total
        else:
            print(f"\n⚠️  File not found: {db_file}")

    print("\n" + "=" * 70)
    print(f"✅ COMPLETE: Updated {total_updated}/{total_sections} total sections")
    print("=" * 70)

    if total_updated > 0:
        print("\n📝 Next steps:")
        print("1. Test the updated database in the application")
        print("2. Verify Am/V calculations work for all exposure configurations")
        print("3. Commit the updated database files")


if __name__ == '__main__':
    main()
