#!/usr/bin/env python3
"""
Simple API Test - Minimal Example
=================================

Quick test to verify the API is working without complex demos.
Run this AFTER starting the server in a separate terminal.
"""

from structural_tools import calculate, health_check

def simple_test():
    print("🧪 Simple API Test")
    print("=" * 30)
    
    # Check if server is running
    if not health_check():
        print("❌ Server not available!")
        print("\nStart server first:")
        print("python structural_api_server.py")
        return
    
    print("✅ Server is healthy!")
    
    # Simple THP calculation
    thp_params = {
        "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
        "b_u": 450, "t_u": 15, "f_yk": 355,
        "gamma_M0": 1.05, "rho_steel": 7850
    }
    
    print("\n🔧 Testing THP calculation...")
    try:
        result = calculate("thp", thp_params)
        
        if result['success']:
            print("✅ Success!")
            r = result['results']
            print(f"   Unit Weight: {r['unit_weight']} {r['unit_weight_unit']}")
            print(f"   Moment Resistance: {r['M_Rd']} {r['M_Rd_unit']}")
            print(f"   Classification: {r['overall_classification']}")
        else:
            print(f"❌ Failed: {result['error']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    simple_test()