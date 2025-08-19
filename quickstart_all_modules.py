#!/usr/bin/env python3
"""
Quickstart Guide - All Structural Calculation Modules
=====================================================

This comprehensive example demonstrates how to use the unified structural tools API
for all calculation modules: THP, concrete beam, and concrete slab.

Super simple usage - just dictionaries in, results out!

Requirements:
- Start the API server first: python structural_api_server.py
- Install requests: pip install requests

Author: Magnus Fjeld Olsen  
License: MIT
"""

import json
import sys
from pathlib import Path

try:
    # Import our structural tools API
    from structural_tools import (
        calculate, calculate_batch, print_results, quick_results,
        calculate_thp, health_check, get_supported_modules
    )
    
    # Import example parameter sets
    from example_thp_input import basic_thp, parametric_study_b_u
    from example_concrete_beam_input import basic_concrete_beam, parametric_study_depth
    from example_concrete_slab_input import basic_concrete_slab, parametric_study_thickness
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("\nMake sure you have:")
    print("1. Started the API server: python structural_api_server.py")
    print("2. Installed requests: pip install requests")
    print("3. All example files in the same directory")
    sys.exit(1)


def demo_basic_usage():
    """Demonstrate basic usage of the API for all modules."""
    
    print("🏗️  BASIC USAGE DEMO")
    print("=" * 60)
    print("Super simple API - just dictionaries in, results out!")
    print()
    
    # THP Calculation - The main working example
    print("🔧 THP (Two-sided Hat Profile) Steel Section:")
    print("-" * 50)
    
    try:
        # Method 1: Using the generic calculate function
        thp_result = calculate("thp", basic_thp)
        print("✅ THP calculation successful!")
        
        # Show quick results
        results = quick_results(thp_result)
        print(f"   • Unit Weight: {results['unit_weight']} {results['unit_weight_unit']}")
        print(f"   • Moment Resistance: {results['M_Rd']} {results['M_Rd_unit']}")
        print(f"   • Total Area: {results['A_total']} {results['A_total_unit']}")
        print(f"   • Classification: {results['overall_classification']}")
        
        # Method 2: Using the specific function  
        thp_result2 = calculate_thp(basic_thp)
        print(f"   • Both methods identical: {thp_result['success'] == thp_result2['success']}")
        
    except Exception as e:
        print(f"❌ THP calculation failed: {e}")
    
    print()
    
    # Concrete Beam Calculation - May not be implemented yet
    print("🏢 Concrete Beam ULS Design:")
    print("-" * 50)
    
    try:
        beam_result = calculate("concrete_beam", basic_concrete_beam)
        if beam_result['success']:
            print("✅ Concrete beam calculation successful!")
            results = quick_results(beam_result)
            # Print whatever results are available
            for key, value in results.items():
                if not key.endswith('_unit'):
                    unit = results.get(f"{key}_unit", "")
                    print(f"   • {key.replace('_', ' ').title()}: {value} {unit}")
        else:
            print(f"⚠️  {beam_result['error']}")
            note = beam_result.get('note', '')
            if note:
                print(f"   Note: {note}")
                
    except Exception as e:
        print(f"❌ Concrete beam calculation failed: {e}")
        
    print()
    
    # Concrete Slab Calculation - May not be implemented yet  
    print("🏗️  Concrete Slab ULS Design:")
    print("-" * 50)
    
    try:
        slab_result = calculate("concrete_slab", basic_concrete_slab)
        if slab_result['success']:
            print("[SUCCESS] Concrete slab calculation successful!")
            results = quick_results(slab_result)
            # Print whatever results are available
            for key, value in results.items():
                if not key.endswith('_unit'):
                    unit = results.get(f"{key}_unit", "")
                    print(f"   • {key.replace('_', ' ').title()}: {value} {unit}")
        else:
            print(f"⚠️  {slab_result['error']}")
            note = slab_result.get('note', '')
            if note:
                print(f"   Note: {note}")
                
    except Exception as e:
        print(f"❌ Concrete slab calculation failed: {e}")


def demo_batch_calculations():
    """Demonstrate batch calculations for parametric studies."""
    
    print("\n📊 BATCH CALCULATIONS DEMO")
    print("=" * 60)
    print("Parametric studies made easy - send arrays of parameters!")
    print()
    
    # THP Parametric Study
    print("🔧 THP Parametric Study - Varying Lower Flange Width:")
    print("-" * 55)
    
    try:
        # Use smaller subset for demo
        study_params = parametric_study_b_u[:4]  # First 4 cases only
        
        batch_result = calculate_batch("thp", study_params)
        
        if batch_result['success']:
            print(f"✅ Batch calculation successful!")
            print(f"   • Cases processed: {batch_result['batch_size']}")
            print(f"   • Successful: {batch_result['successful']}")
            print(f"   • Failed: {batch_result['failed']}")
            print()
            
            # Show results table
            print("📋 Results Summary:")
            print(f"{'b_u (mm)':<10} {'Weight (kg/m)':<15} {'M_Rd (kNm)':<12} {'Class':<8}")
            print("-" * 50)
            
            for result in batch_result['results']:
                if result['success']:
                    b_u = result['input']['b_u']
                    weight = result['results']['unit_weight']
                    moment = result['results']['M_Rd']  
                    cls = result['results']['overall_classification']
                    print(f"{b_u:<10} {weight:<15} {moment:<12} {cls:<8}")
                else:
                    print(f"❌ Error: {result['error']}")
        else:
            print(f"❌ Batch calculation failed: {batch_result['error']}")
            
    except Exception as e:
        print(f"❌ Batch calculation error: {e}")


def demo_detailed_calculations():
    """Demonstrate accessing detailed step-by-step calculations."""
    
    print("\n🔍 DETAILED CALCULATIONS DEMO")
    print("=" * 60)
    print("Access every calculation step with formulas and substitutions!")
    print()
    
    try:
        # Get full calculation details for THP
        full_result = calculate("thp", basic_thp)
        
        if full_result['success']:
            print("🔧 THP Detailed Calculation Steps:")
            print("-" * 40)
            
            details = full_result.get('detailed_calculations', {})
            
            # Show derived dimensions
            if 'derived_dimensions' in details:
                print("\n📏 Derived Dimensions:")
                for name, calc in details['derived_dimensions']['calculations'].items():
                    print(f"   • {calc['description']}: {calc['formula']}")
                    print(f"     = {calc['substitution']} = {calc['value']} {calc['unit']}")
            
            # Show areas
            if 'cross_sectional_areas' in details:
                print("\n📐 Cross-Sectional Areas:")
                for name, calc in details['cross_sectional_areas']['calculations'].items():
                    print(f"   • {calc['description']}: {calc['formula']}")
                    print(f"     = {calc['substitution']} = {calc['value']} {calc['unit']}")
            
            # Show final capacities
            if 'capacities' in details:
                print("\n⚡ Design Capacities:")
                for name, calc in details['capacities']['calculations'].items():
                    print(f"   • {calc['description']}: {calc['formula']}")
                    print(f"     = {calc['substitution']} = {calc['value']} {calc['unit']}")
            
            # Show classification details
            if 'classification' in details:
                print("\n📋 Element Classification:")
                elements = details['classification']['elements']
                for elem_name, elem_data in elements.items():
                    if elem_name != 'overall':
                        print(f"   • {elem_name.replace('_', ' ').title()}: Class {elem_data.get('class', 'N/A')}")
                        if 'check' in elem_data:
                            print(f"     Check: c/t = {elem_data.get('c_over_t', 'N/A'):.1f} ≤ {elem_data.get('limit', 'N/A'):.1f} → {elem_data['check']}")
        
        else:
            print(f"❌ Calculation failed: {full_result['error']}")
            
    except Exception as e:
        print(f"❌ Detailed calculation error: {e}")


def demo_pretty_printing():
    """Demonstrate the built-in pretty printing functionality."""
    
    print("\n🎨 PRETTY PRINTING DEMO")
    print("=" * 60)
    print("Built-in formatted output for easy result interpretation!")
    print()
    
    try:
        # Calculate and pretty print THP results
        thp_result = calculate("thp", basic_thp)
        print_results(thp_result, "thp")
        
    except Exception as e:
        print(f"❌ Pretty printing error: {e}")


def demo_error_handling():
    """Demonstrate error handling with invalid inputs."""
    
    print("\n🚨 ERROR HANDLING DEMO")
    print("=" * 60)
    print("Robust error handling for invalid inputs and missing parameters!")
    print()
    
    # Test with invalid module
    try:
        result = calculate("invalid_module", {})
        print(f"Invalid module result: {result['error']}")
    except Exception as e:
        print(f"Invalid module error: {e}")
    
    # Test with missing parameters  
    try:
        result = calculate("thp", {"b_o": 100})  # Missing most parameters
        print(f"Missing parameters result: {result['error']}")
    except Exception as e:
        print(f"Missing parameters error: {e}")
    
    # Test with invalid parameter values
    try:
        invalid_thp = basic_thp.copy()
        invalid_thp['b_o'] = "invalid_value"  # String instead of number
        result = calculate("thp", invalid_thp)
        print(f"Invalid values result: {result['error']}")
    except Exception as e:
        print(f"Invalid values error: {e}")


def main():
    """Run all demonstration examples."""
    
    print("🎯 STRUCTURAL TOOLS - UNIFIED API DEMONSTRATION")
    print("=" * 80)
    print("Welcome to the super-simple structural engineering API!")
    print("This demo shows how to use THP, concrete beam, and concrete slab calculators")
    print("with just Python dictionaries - no Selenium complexity!")
    print()
    
    # Check server health first
    if not health_check():
        print("❌ API server is not available!")
        print("\nTo run this demo:")
        print("1. Start the server: python structural_api_server.py")
        print("2. Wait for 'Server ready' message")
        print("3. Run this demo: python quickstart_all_modules.py")
        print("\nThe server should show:")
        print("   🚀 Server running at: http://localhost:8000")
        print("   📋 API endpoint: /api/calculate")
        return
    
    print("✅ API server is healthy!")
    
    # Show supported modules
    modules = get_supported_modules()
    print(f"📋 Available modules: {', '.join(modules)}")
    print()
    
    # Run all demos
    demo_basic_usage()
    demo_batch_calculations() 
    demo_detailed_calculations()
    demo_pretty_printing()
    demo_error_handling()
    
    print("\n🎉 DEMO COMPLETE!")
    print("=" * 80)
    print("You now know how to:")
    print("✅ Perform single calculations with calculate(module, params)")
    print("✅ Run parametric studies with calculate_batch(module, params_list)")  
    print("✅ Access detailed step-by-step calculations")
    print("✅ Use built-in result formatting")
    print("✅ Handle errors gracefully")
    print()
    print("💡 Start building your own structural analysis scripts!")
    print("   The API is super simple - just dictionaries in, results out!")
    print()
    print("📚 Example files to explore:")
    print("   • example_thp_input.py - THP parameter examples")
    print("   • example_concrete_beam_input.py - Concrete beam examples")
    print("   • example_concrete_slab_input.py - Concrete slab examples")
    print("   • structural_tools.py - Main API client")
    print("   • structural_api_server.py - The server backend")
    
    # Save example results to file
    try:
        print("\n💾 Saving example results to 'demo_results.json'...")
        thp_result = calculate("thp", basic_thp)
        with open("demo_results.json", "w") as f:
            json.dump(thp_result, f, indent=2)
        print("✅ Results saved! Check demo_results.json for full calculation details.")
    except Exception as e:
        print(f"⚠️  Could not save results: {e}")


if __name__ == "__main__":
    main()