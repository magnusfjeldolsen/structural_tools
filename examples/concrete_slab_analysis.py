#!/usr/bin/env python3
"""
Simple Concrete Slab ULS Design Analysis Example
===============================================

This example demonstrates how to use the structural tools API 
to perform concrete slab ULS design calculations.

Usage:
1. Start the API server: python api/structural_api_server.py
2. Run this script: python examples/concrete_slab_analysis.py

Author: Magnus Fjeld Olsen
License: MIT
"""

import sys
import os

# Add the api directory to the path so we can import structural_tools
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from structural_tools import calculate, health_check

def main():
    print("🏗️ Concrete Slab ULS Design Analysis")
    print("=" * 45)
    
    # Check if API server is running
    if not health_check():
        print("❌ API server not running!")
        print("Start the server with: python api/structural_api_server.py")
        return
    
    # Define concrete slab parameters
    slab_params = {
        "geometry": {
            "MEd": 50,          # Applied design moment (kNm/m)
            "t": 200,           # Slab thickness (mm)
            "c": 25             # Concrete cover (mm)
        },
        "material": {
            "fcd": 16.7,        # Design concrete strength (MPa) - C25/30
            "fyd": 435          # Design steel strength (MPa) - B500
        },
        "reinforcement": {
            "phi_l": 12,        # Bar diameter (mm)
            "cc_l": 200         # Bar spacing (mm)
        }
    }
    
    print("📋 Slab Configuration:")
    print(f"   • Thickness: {slab_params['geometry']['t']}mm")
    print(f"   • Cover: {slab_params['geometry']['c']}mm")
    print(f"   • Applied moment: {slab_params['geometry']['MEd']}kNm/m")
    print(f"   • Concrete: fcd = {slab_params['material']['fcd']}MPa (C25/30)")
    print(f"   • Steel: fyd = {slab_params['material']['fyd']}MPa (B500)")
    print(f"   • Reinforcement: φ{slab_params['reinforcement']['phi_l']}@{slab_params['reinforcement']['cc_l']}mm c/c")
    print()
    
    # Perform calculation
    print("🔍 Calculating...")
    result = calculate("concrete_slab", slab_params)
    
    if result['success']:
        print("✅ Calculation successful!")
        print()
        
        # Display results
        res = result['results']
        print("📊 Design Results:")
        print(f"   • Effective depth: {res['d']}mm")
        print(f"   • Required steel area: {res['As_req']} mm²/m")
        print(f"   • Provided steel area: {res['As_prov']} mm²/m")
        print(f"   • Steel ratio: {res['rho']*100:.3f}%")
        print(f"   • Design moment resistance: {res['MRd']} kNm/m")
        print()
        
        # Check design adequacy
        utilization = float(res['MEd']) / float(res['MRd']) * 100
        print("🔍 Design Check:")
        print(f"   • Applied moment: {res['MEd']} kNm/m")
        print(f"   • Moment capacity: {res['MRd']} kNm/m")
        print(f"   • Utilization: {utilization:.1f}%")
        
        if utilization <= 100:
            print("   • Status: ✅ Design OK")
        else:
            print("   • Status: ❌ Design inadequate - increase reinforcement or thickness")
        
        # Steel area check
        as_ratio = float(res['As_prov']) / float(res['As_req'])
        print()
        print("🔩 Reinforcement Check:")
        print(f"   • Required: {res['As_req']} mm²/m")
        print(f"   • Provided: {res['As_prov']} mm²/m")
        if as_ratio >= 1.0:
            print(f"   • Ratio: {as_ratio:.2f} - ✅ Adequate")
        else:
            print(f"   • Ratio: {as_ratio:.2f} - ❌ Insufficient steel")
        
    else:
        print(f"❌ Calculation failed: {result['error']}")
        if 'note' in result:
            print(f"   Note: {result['note']}")

if __name__ == "__main__":
    main()