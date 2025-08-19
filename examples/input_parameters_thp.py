#!/usr/bin/env python3
"""
THP (Tapered H-Profile) Input Parameters
========================================

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

# Parametric study example - varying lower flange width
parametric_study_b_u = [
    {**basic_thp, "b_u": 350},   # Small lower flange
    {**basic_thp, "b_u": 400},   # Medium-small
    {**basic_thp, "b_u": 450},   # Standard (base case)  
    {**basic_thp, "b_u": 500},   # Medium-large
    {**basic_thp, "b_u": 550},   # Large lower flange
]

if __name__ == "__main__":
    print("🔧 THP Input Parameters")
    print("=" * 30)
    
    # Show example parameter structures
    examples = {
        "Basic THP": basic_thp,
        "Heavy Duty THP": heavy_duty_thp,
        "Lightweight THP": lightweight_thp,
        "High Strength THP": high_strength_thp
    }
    
    for name, params in examples.items():
        print(f"\n📋 {name}:")
        print(f"   • Dimensions: {params['b_o']}×{params['t_o']} | {params['H']}×{params['t_w']} | {params['b_u']}×{params['t_u']}")
        print(f"   • Steel: S{params['f_yk']}, ρ={params['rho_steel']} kg/m³")
    
    print(f"\n📊 Parametric Studies Available:")
    print(f"   • Lower flange width variation: {len(parametric_study_b_u)} cases")
    
    print(f"\n💡 Usage with structural_tools:")
    print(f"   from input_parameters_thp import basic_thp")
    print(f"   # Then use with thp_analysis.py or directly with the API")