import pandas as pd
import json
import os

# Change to script directory to ensure correct path
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

sheet_name = 'HRHS'  # Hot formed Rectangular Hollow Sections

# Read the Excel file
df = pd.read_excel('eurocodeapplied.xlsx', sheet_name=sheet_name)

# Skip the first 5 rows and read from row 5 onwards (data starts at index 5)
df_data = pd.read_excel('eurocodeapplied.xlsx', sheet_name=sheet_name, skiprows=5)

# Get column names from row 3 (symbolic names like h, b, t, ro, etc.)
col_names = pd.read_excel('eurocodeapplied.xlsx', sheet_name=sheet_name, nrows=1, skiprows=3).iloc[0].tolist()

# Assign proper column names
df_data.columns = col_names

# First column should be the profile name (no column name in symbolic row)
# Rename the first NaN column to 'Profile'
if pd.isna(col_names[0]):
    col_names[0] = 'Profile'
    df_data.columns = col_names

# Filter only RHS profiles (rectangular hollow sections)
rhs_data = df_data[df_data['Profile'].notna() & df_data['Profile'].astype(str).str.contains('RHS', na=False)]

# Read existing JSON structure or create new one
json_file = sheet_name.lower() + '.json'
if os.path.exists(json_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        rhs_json = json.load(f)
else:
    # Create new structure based on sheet type
    profile_type = "HRHS"
    description = "Hot formed rectangular hollow sections"
    rhs_json = {
        "metadata": {
            "profile_type": profile_type,
            "description": description,
            "units": {
                "length": "mm",
                "mass": "kg/m",
                "area": "mm²",
                "moment_of_inertia": "mm⁴",
                "section_modulus": "mm³",
                "torsion_constant": "mm⁴",
                "torsion_modulus": "mm³"
            },
            "notes": "All geometric properties only - no material-dependent capacities included"
        },
        "profiles": []
    }

# Get existing profiles to avoid duplicates
existing_profiles = {p['profile'] for p in rhs_json['profiles']}

# Convert data to JSON structure
new_profiles = []

for _, row in rhs_data.iterrows():
    profile_name = row['Profile'].strip()

    # Skip if already exists
    if profile_name in existing_profiles:
        continue

    profile_dict = {
        "profile": profile_name,
        "h": float(row['h']) if pd.notna(row['h']) else None,
        "b": float(row['b']) if pd.notna(row['b']) else None,
        "t": float(row['t']) if pd.notna(row['t']) else None,
        "ro": float(row['ro']) if pd.notna(row['ro']) else None,
        "ri": float(row['ri']) if pd.notna(row['ri']) else None,
        "m": float(row['m']) if pd.notna(row['m']) else None,
        "P": float(row['P']) if pd.notna(row['P']) else None,
        "A": int(row['A']) if pd.notna(row['A']) else None,
        "Av_z": int(row['Av,z']) if pd.notna(row['Av,z']) else None,
        "Av_y": int(row['Av,y']) if pd.notna(row['Av,y']) else None,
        "Iy": float(row['Iy']) * 1e6 if pd.notna(row['Iy']) else None,  # Convert from mm⁴×10⁶ to mm⁴
        "Iz": float(row['Iz']) * 1e6 if pd.notna(row['Iz']) else None,  # Separate value for rectangular sections
        "iy": float(row['iy']) if pd.notna(row['iy']) else None,
        "iz": float(row['iz']) if pd.notna(row['iz']) else None,
        "Wel_y": float(row['Wel,y']) * 1e3 if pd.notna(row['Wel,y']) else None,  # Convert from mm³×10³ to mm³
        "Wel_z": float(row['Wel,z']) * 1e3 if pd.notna(row['Wel,z']) else None,
        "Wpl_y": float(row['Wpl,y']) * 1e3 if pd.notna(row['Wpl,y']) else None,
        "Wpl_z": float(row['Wpl,z']) * 1e3 if pd.notna(row['Wpl,z']) else None,
        "IT": float(row['IT']) * 1e3 if pd.notna(row['IT']) else None,  # Convert from mm⁴×10³ to mm⁴
        "WT": float(row['WT']) * 1e3 if pd.notna(row['WT']) else None,  # Convert from mm³×10³ to mm³
        "alpha_yy": "b",  # Typically 'b' for rectangular sections
        "alpha_zz": "c"
    }

    # Add section_class if available
    if 'Section class' in row and pd.notna(row['Section class']):
        profile_dict['section_class'] = int(row['Section class'])
    else:
        # Add buckling properties for older format
        profile_dict['web_bending_yy'] = 1
        profile_dict['web_compression'] = 1
        profile_dict['flange_compression'] = 1

    new_profiles.append(profile_dict)

# Add new profiles to existing ones
rhs_json['profiles'].extend(new_profiles)

# Sort profiles by size
def parse_profile_name(name):
    # Extract size from profile name like "RHS 50 x 30 / 2" or "RHS50x30x2"
    import re
    match = re.search(r'(\d+)[x\s]+(\d+)[x/\s]+(\d+\.?\d*)', name)
    if match:
        return (int(match.group(1)), int(match.group(2)), float(match.group(3)))
    return (0, 0, 0)

rhs_json['profiles'].sort(key=lambda x: parse_profile_name(x['profile']))

# Write updated JSON
output_file = sheet_name.lower() + '.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(rhs_json, f, indent=2, ensure_ascii=False)

print(f"Added {len(new_profiles)} new profiles to {output_file}")
print(f"Total profiles: {len(rhs_json['profiles'])}")
