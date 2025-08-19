#!/usr/bin/env python3
"""
Quick API Integration Test

Tests the basic functionality of both concrete beam and slab APIs
to verify the integration is working correctly.
"""

import sys
import subprocess
from pathlib import Path


def test_node_js():
    """Test if Node.js is available."""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True, check=True)
        print(f"✓ Node.js version: {result.stdout.strip()}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("✗ Node.js not found. Please install from https://nodejs.org/")
        return False


def test_api_files():
    """Test if API files exist."""
    base_path = Path(__file__).parent.parent
    
    beam_api = base_path / "concrete_beam_design" / "concrete_beam_api.js"
    slab_api = base_path / "concrete_slab_design" / "concrete_slab_api.js"
    
    if beam_api.exists():
        print(f"✓ Beam API found: {beam_api}")
    else:
        print(f"✗ Beam API not found: {beam_api}")
        return False
    
    if slab_api.exists():
        print(f"✓ Slab API found: {slab_api}")
    else:
        print(f"✗ Slab API not found: {slab_api}")
        return False
    
    return True


def test_beam_api():
    """Test basic beam API functionality."""
    try:
        from examples.concrete_beam_analysis import ConcreteBeamAPI
        
        api = ConcreteBeamAPI()
        
        inputs = {
            "geometry": {"b": 250, "h": 500, "c": 25},
            "loads": {"MEd": 62.5, "VEd": 150},
            "longitudinal_reinforcement": {"phi_l": 20, "n_l": 2},
            "shear_reinforcement": {"phi_b": 12, "cc_b": 185, "n_snitt": 2},
            "material": {"fck": 35, "fyk": 500, "alpha_cc": 0.85, "gamma_c": 1.5, "gamma_s": 1.25}
        }
        
        result = api.calculate(inputs)
        
        if result.get("success"):
            print("✓ Beam API test successful")
            print(f"  • Moment capacity: {result['results']['moment_capacity']['MRd']:.1f} kNm")
            print(f"  • Shear capacity: {result['results']['shear_capacity']['VRd_s']:.1f} kN")
            print(f"  • Moment utilization: {result['status']['utilizations']['moment']:.1f}%")
            return True
        else:
            print(f"✗ Beam API test failed: {result.get('error', 'Unknown error')}")
            return False
    
    except Exception as e:
        print(f"✗ Beam API test error: {e}")
        return False


def test_slab_api():
    """Test basic slab API functionality."""
    try:
        from concrete_slab_parametric import ConcreteSlabAPI
        
        api = ConcreteSlabAPI()
        
        inputs = {
            "geometry": {"MEd": 20, "t": 200, "c": 35},
            "material": {"fcd": 19.8, "fyd": 435},
            "reinforcement": {"phi_l": 12, "cc_l": 150}
        }
        
        result = api.calculate(inputs)
        
        if result.get("success"):
            print("✓ Slab API test successful")
            print(f"  • Moment capacity: {result['results']['moment_capacity']['MRd']:.1f} kNm")
            print(f"  • Utilization: {result['status']['utilization']:.1f}%")
            return True
        else:
            print(f"✗ Slab API test failed: {result.get('error', 'Unknown error')}")
            return False
    
    except Exception as e:
        print(f"✗ Slab API test error: {e}")
        return False


def main():
    """Run all tests."""
    print("🔧 Structural Tools API Integration Test")
    print("=" * 50)
    
    all_passed = True
    
    print("\n1. Testing Node.js availability...")
    if not test_node_js():
        all_passed = False
    
    print("\n2. Testing API file availability...")
    if not test_api_files():
        all_passed = False
    
    print("\n3. Testing Beam API...")
    if not test_beam_api():
        all_passed = False
    
    print("\n4. Testing Slab API...")
    if not test_slab_api():
        all_passed = False
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All tests passed! API integration is working correctly.")
        print("\nYou can now run the full examples:")
        print("  • python concrete_beam_analysis.py")
        print("  • python concrete_slab_parametric.py")
    else:
        print("❌ Some tests failed. Please check the requirements:")
        print("  • Install Node.js from https://nodejs.org/")
        print("  • Ensure API files are present in parent directories")
        print("  • Check Python dependencies: pip install -r requirements.txt")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())