#!/usr/bin/env python3
"""
Example THP (Two-sided Hat Profile) Input Parameters
===================================================

This file demonstrates the dictionary structure for THP steel profile calculations.
Use these parameter dictionaries with the structural_tools API.

Author: Magnus Fjeld Olsen
License: MIT
"""

# Basic THP example - standard profile
basic_thp = {
    "b_o": 188,         # Upper flange width (mm)
    "t_o": 25,          # Upper flange thickness (mm)  
    "H": 200,           # Web height (mm)
    "t_w": 6,           # Web thickness (mm)
    "b_u": 450,         # Lower flange width (mm)
    "t_u": 15,          # Lower flange thickness (mm)
    "f_yk": 355,        # Steel yield strength (MPa) - S355 steel
    "gamma_M0": 1.05,   # Safety factor for resistance
    "rho_steel": 7850   # Steel density (kg/m³) - standard carbon steel
}

# Heavy duty THP - increased dimensions for higher loads
heavy_duty_thp = {
    "b_o": 200,         # Wider upper flange
    "t_o": 30,          # Thicker upper flange
    "H": 300,           # Taller web
    "t_w": 8,           # Thicker web
    "b_u": 600,         # Much wider lower flange
    "t_u": 20,          # Thicker lower flange
    "f_yk": 355,        # S355 steel
    "gamma_M0": 1.05,   
    "rho_steel": 7850
}

# Lightweight THP - optimized for weight savings
lightweight_thp = {
    "b_o": 150,         # Narrower upper flange
    "t_o": 20,          # Thinner upper flange
    "H": 150,           # Shorter web
    "t_w": 5,           # Thinner web
    "b_u": 300,         # Narrower lower flange
    "t_u": 12,          # Thinner lower flange
    "f_yk": 355,        # S355 steel
    "gamma_M0": 1.05,
    "rho_steel": 7850
}

# High strength steel THP - S460 grade
high_strength_thp = {
    "b_o": 188,
    "t_o": 22,          # Reduced thickness due to higher strength
    "H": 200,
    "t_w": 5,           # Thinner web possible
    "b_u": 450,
    "t_u": 13,          # Reduced thickness
    "f_yk": 460,        # S460 steel - higher yield strength
    "gamma_M0": 1.05,
    "rho_steel": 7850
}

# Stainless steel THP
stainless_steel_thp = {
    "b_o": 188,
    "t_o": 25,
    "H": 200,
    "t_w": 6,
    "b_u": 450,
    "t_u": 15,
    "f_yk": 240,        # Stainless steel 1.4301 (304)
    "gamma_M0": 1.05,
    "rho_steel": 8000   # Higher density for stainless steel
}

# Parametric study example - varying lower flange width
parametric_study_b_u = [
    {**basic_thp, "b_u": 350},   # Small lower flange
    {**basic_thp, "b_u": 400},   # Medium-small
    {**basic_thp, "b_u": 450},   # Standard (base case)  
    {**basic_thp, "b_u": 500},   # Medium-large
    {**basic_thp, "b_u": 550},   # Large lower flange
    {**basic_thp, "b_u": 600}    # Very large
]

# Parametric study example - varying web height
parametric_study_H = [
    {**basic_thp, "H": 150},     # Short web
    {**basic_thp, "H": 175},     # Medium-short
    {**basic_thp, "H": 200},     # Standard (base case)
    {**basic_thp, "H": 225},     # Medium-tall  
    {**basic_thp, "H": 250},     # Tall web
    {**basic_thp, "H": 300}      # Very tall
]

# Steel grade comparison
steel_grade_comparison = [
    {**basic_thp, "f_yk": 235},  # S235 - basic structural steel
    {**basic_thp, "f_yk": 275},  # S275 - medium strength
    {**basic_thp, "f_yk": 355},  # S355 - high strength (most common)
    {**basic_thp, "f_yk": 420},  # S420 - very high strength
    {**basic_thp, "f_yk": 460}   # S460 - ultra high strength
]

# Usage examples with the structural_tools library
if __name__ == "__main__":
    print("<×  THP Input Examples")
    print("=" * 50)
    
    # Show example parameter structures
    examples = {
        "Basic THP": basic_thp,
        "Heavy Duty THP": heavy_duty_thp,
        "Lightweight THP": lightweight_thp,
        "High Strength THP": high_strength_thp,
        "Stainless Steel THP": stainless_steel_thp
    }
    
    for name, params in examples.items():
        print(f"\n=Ë {name}:")
        print(f"   " Dimensions: {params['b_o']}×{params['t_o']} | {params['H']}×{params['t_w']} | {params['b_u']}×{params['t_u']}")
        print(f"   " Steel: S{params['f_yk']}, Á={params['rho_steel']} kg/m³")
        print(f"   " Dictionary: {params}")
    
    print(f"\n=Ê Parametric Studies Available:")
    print(f"   " Lower flange width variation: {len(parametric_study_b_u)} cases")
    print(f"   " Web height variation: {len(parametric_study_H)} cases")
    print(f"   " Steel grade comparison: {len(steel_grade_comparison)} grades")
    
    print(f"\n=¡ Usage with structural_tools:")
    print(f"   from structural_tools import calculate")
    print(f"   from example_thp_input import basic_thp")
    print(f"   ")
    print(f"   result = calculate('thp', basic_thp)")
    print(f"   print(f'Unit Weight: {{result[\"results\"][\"unit_weight\"]}} kg/m')")
    print(f"   print(f'Moment Capacity: {{result[\"results\"][\"M_Rd\"]}} kNm')")
    
    # Try to run actual calculation if structural_tools is available
    try:
        import sys
        sys.path.append('.')
        from structural_tools import calculate, health_check
        
        if health_check():
            print(f"\n>ê Running test calculation...")
            result = calculate("thp", basic_thp)
            if result['success']:
                r = result['results']
                print(f" Success!")
                print(f"   " Unit Weight: {r['unit_weight']} {r['unit_weight_unit']}")
                print(f"   " Moment Resistance: {r['M_Rd']} {r['M_Rd_unit']}")
                print(f"   " Classification: {r['overall_classification']}")
            else:
                print(f"L Calculation failed: {result['error']}")
        else:
            print(f"\n   API server not running. Start with: python structural_api_server.py")
            
    except ImportError:
        print(f"\n   structural_tools not found. Make sure you're in the right directory.")