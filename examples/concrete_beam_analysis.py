#!/usr/bin/env python3
"""
Simple Concrete Beam ULS Design Analysis Example
===============================================

This example demonstrates how to use the structural tools API 
to perform concrete beam ULS design calculations.

Usage:
1. Start the API server: python api/structural_api_server.py
2. Run this script: python examples/concrete_beam_analysis.py

Author: Magnus Fjeld Olsen
License: MIT
"""

import sys
import os

# Add the api directory to the path so we can import structural_tools
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from structural_tools import calculate, health_check

def main():
    print("🏗️ Concrete Beam ULS Design Analysis")
    print("=" * 45)
    
    # Check if API server is running
    if not health_check():
        print("❌ API server not running!")
        print("Start the server with: python api/structural_api_server.py")
        return
    
    # Define concrete beam parameters
    beam_params = {
        "geometry": {
            "b": 300,           # Beam width (mm)
            "h": 500,           # Beam height (mm) 
            "c": 25             # Concrete cover (mm)
        },
        "loads": {
            "MEd": 150,         # Applied design moment (kNm)
            "VEd": 80           # Applied design shear (kN)
        },
        "longitudinal_reinforcement": {
            "phi_l": 20,        # Longitudinal bar diameter (mm)
            "n_l": 4            # Number of longitudinal bars
        },
        "shear_reinforcement": {
            "phi_b": 8,         # Stirrup diameter (mm)
            "cc_b": 200,        # Stirrup spacing (mm)
            "n_snitt": 2        # Number of stirrup legs
        },
        "material": {
            "fck": 25,          # Concrete characteristic strength (MPa) - C25/30
            "fyk": 500,         # Steel yield strength (MPa) - B500
            "gamma_c": 1.5,     # Concrete safety factor
            "gamma_s": 1.15     # Steel safety factor
        }
    }
    
    print("📋 Beam Configuration:")
    geom = beam_params['geometry']
    loads = beam_params['loads']
    long_rein = beam_params['longitudinal_reinforcement']
    shear_rein = beam_params['shear_reinforcement']
    mat = beam_params['material']
    
    print(f"   • Cross-section: {geom['b']}×{geom['h']}mm")
    print(f"   • Cover: {geom['c']}mm")
    print(f"   • Applied moment: {loads['MEd']}kNm")
    print(f"   • Applied shear: {loads['VEd']}kN")
    print(f"   • Materials: C{mat['fck']}/{int(mat['fck']*1.2)}, B{mat['fyk']}")
    print(f"   • Longitudinal bars: {long_rein['n_l']}φ{long_rein['phi_l']}mm")
    print(f"   • Stirrups: φ{shear_rein['phi_b']}@{shear_rein['cc_b']}mm, {shear_rein['n_snitt']} legs")
    print()
    
    # Perform calculation
    print("🔍 Calculating...")
    result = calculate("concrete_beam", beam_params)
    
    if result['success']:
        print("✅ Calculation successful!")
        print()
        
        # Display results (Note: This is a placeholder as concrete beam API may not be fully implemented)
        print("📊 Design Results:")
        print("   Note: Concrete beam analysis results would be displayed here")
        print("   This example shows the API structure for concrete beam calculations")
        print()
        print("🔍 Expected Results Would Include:")
        print("   • Effective depth and lever arm")
        print("   • Moment resistance capacity")
        print("   • Shear resistance capacity") 
        print("   • Steel area requirements")
        print("   • Design adequacy checks")
        print("   • Reinforcement detailing")
        
    else:
        print(f"❌ Calculation failed: {result['error']}")
        if 'note' in result:
            print(f"   Note: {result['note']}")
        
        # Show what the expected successful result would look like
        print()
        print("💡 This example demonstrates the API interface for concrete beam calculations.")
        print("   The actual calculation implementation is pending in the backend.")

if __name__ == "__main__":
    main()