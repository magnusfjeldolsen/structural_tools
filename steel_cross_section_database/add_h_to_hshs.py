#!/usr/bin/env python3
"""
Add 'h' parameter to HSHS (Hot-formed Square Hollow Sections).
For square sections: h = b
"""

import json

# Read the file
with open('hshs.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Add h = b to each profile
count = 0
for profile in data['profiles']:
    if 'b' in profile and 'h' not in profile:
        # Insert h right after b
        b_value = profile['b']
        # Create new dict with h inserted after b
        new_profile = {}
        for key, value in profile.items():
            new_profile[key] = value
            if key == 'b':
                new_profile['h'] = b_value

        # Replace old profile with new one
        profile.clear()
        profile.update(new_profile)
        count += 1
        print(f"OK {profile['profile']}: Added h = {b_value}")

# Write back to file
with open('hshs.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\nDone! Added 'h' to {count} profiles")
