#!/usr/bin/env python3
"""
Simple THP (Tapered H-Profile) Analysis Example
==============================================

This example demonstrates how to use the structural tools API 
to perform THP steel profile calculations.

Usage:
1. Start the API server: python api/structural_api_server.py
2. Run this script: python examples/thp_analysis.py

Author: Magnus Fjeld Olsen
License: MIT
"""

import sys
import os

# Add the api directory to the path so we can import structural_tools
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from structural_tools import calculate, health_check

def main():
    print("🔧 THP Steel Profile Analysis")
    print("=" * 40)
    
    # Check if API server is running
    if not health_check():
        print("❌ API server not running!")
        print("Start the server with: python api/structural_api_server.py")
        return
    
    # Define THP profile parameters
    thp_params = {
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
    
    print("📋 Profile Configuration:")
    print(f"   • Upper flange: {thp_params['b_o']}×{thp_params['t_o']}mm")
    print(f"   • Web: H={thp_params['H']}mm, t={thp_params['t_w']}mm")
    print(f"   • Lower flange: {thp_params['b_u']}×{thp_params['t_u']}mm")
    print(f"   • Steel grade: S{thp_params['f_yk']}")
    print()
    
    # Perform calculation
    print("🔍 Calculating...")
    result = calculate("thp", thp_params)
    
    if result['success']:
        print("✅ Calculation successful!")
        print()
        
        # Display results
        res = result['results']
        print("📊 Results:")
        print(f"   • Unit Weight: {res['unit_weight']} kg/m")
        print(f"   • Total Area: {res['A_total']} mm²")
        print(f"   • Moment Resistance: {res['M_Rd']} kNm")
        print(f"   • Section Modulus: {res['W_el']} mm³")
        print(f"   • Moment of Inertia: {res['I_y']} mm⁴")
        print(f"   • Neutral Axis: {res['z_NA']} mm")
        print()
        
        # Display classification
        classification = result['classification']
        print("🏷️ Section Classification:")
        print(f"   • Upper flange: Class {classification['upper_flange_class']}")
        print(f"   • Web: Class {classification['web_class']}")
        print(f"   • Lower flange: Class {classification['lower_flange_class']}")
        print(f"   • Overall: Class {classification['overall_class']}")
        
        # Calculate efficiency
        efficiency = float(res['M_Rd']) / float(res['unit_weight'])
        print()
        print(f"💡 Structural Efficiency: {efficiency:.2f} kNm per kg/m")
        
    else:
        print(f"❌ Calculation failed: {result['error']}")

if __name__ == "__main__":
    main()