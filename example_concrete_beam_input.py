#!/usr/bin/env python3
"""
Example Concrete Beam ULS Design Input Parameters
================================================

This file demonstrates the dictionary structure for concrete beam ULS design calculations.
Use these parameter dictionaries with the structural_tools API.

Author: Magnus Fjeld Olsen
License: MIT
"""

# Basic concrete beam example - residential/office building
basic_concrete_beam = {
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

# Heavy load beam - industrial/parking structure
heavy_load_beam = {
    "geometry": {
        "b": 400,           # Wider beam
        "h": 700,           # Deeper beam
        "c": 30             # Increased cover for durability
    },
    "loads": {
        "MEd": 350,         # Higher moment
        "VEd": 200          # Higher shear
    },
    "longitudinal_reinforcement": {
        "phi_l": 25,        # Larger bars
        "n_l": 6            # More bars
    },
    "shear_reinforcement": {
        "phi_b": 10,        # Larger stirrups
        "cc_b": 150,        # Closer spacing
        "n_snitt": 4        # Four-legged stirrups
    },
    "material": {
        "fck": 35,          # Higher strength concrete - C35/45
        "fyk": 500,         # B500 steel
        "gamma_c": 1.5,
        "gamma_s": 1.15
    }
}

# High-rise beam - premium construction
high_rise_beam = {
    "geometry": {
        "b": 350,
        "h": 600,
        "c": 35             # Higher cover for high-rise durability
    },
    "loads": {
        "MEd": 280,
        "VEd": 150
    },
    "longitudinal_reinforcement": {
        "phi_l": 22,
        "n_l": 5
    },
    "shear_reinforcement": {
        "phi_b": 10,
        "cc_b": 175,
        "n_snitt": 2
    },
    "material": {
        "fck": 45,          # High strength concrete - C45/55
        "fyk": 500,
        "gamma_c": 1.5,
        "gamma_s": 1.15
    }
}

# Lightweight beam - span optimization
lightweight_beam = {
    "geometry": {
        "b": 250,           # Narrow width
        "h": 400,           # Moderate height
        "c": 25
    },
    "loads": {
        "MEd": 80,          # Lower loads
        "VEd": 45
    },
    "longitudinal_reinforcement": {
        "phi_l": 16,        # Smaller bars
        "n_l": 3            # Fewer bars
    },
    "shear_reinforcement": {
        "phi_b": 8,
        "cc_b": 250,        # Wider spacing
        "n_snitt": 2
    },
    "material": {
        "fck": 30,          # Standard strength - C30/37
        "fyk": 500,
        "gamma_c": 1.5,
        "gamma_s": 1.15
    }
}

# Precast beam example
precast_beam = {
    "geometry": {
        "b": 320,
        "h": 550,
        "c": 30             # Higher cover for precast durability
    },
    "loads": {
        "MEd": 200,
        "VEd": 110
    },
    "longitudinal_reinforcement": {
        "phi_l": 20,
        "n_l": 4
    },
    "shear_reinforcement": {
        "phi_b": 8,
        "cc_b": 180,
        "n_snitt": 2
    },
    "material": {
        "fck": 40,          # High early strength - C40/50
        "fyk": 500,
        "gamma_c": 1.5,
        "gamma_s": 1.15
    }
}

# Parametric study - varying beam depth
parametric_study_depth = [
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 400}},
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 450}},
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 500}},  # Base case
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 550}},
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 600}},
    {**basic_concrete_beam, "geometry": {**basic_concrete_beam["geometry"], "h": 700}}
]

# Parametric study - varying concrete strength
parametric_study_concrete = [
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 20}},   # C20/25
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 25}},   # C25/30 (base)
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 30}},   # C30/37
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 35}},   # C35/45
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 40}},   # C40/50
    {**basic_concrete_beam, "material": {**basic_concrete_beam["material"], "fck": 45}}    # C45/55
]

# Load combinations study
load_combinations = [
    {**basic_concrete_beam, "loads": {"MEd": 100, "VEd": 60}},    # Light loading
    {**basic_concrete_beam, "loads": {"MEd": 150, "VEd": 80}},    # Standard (base case)
    {**basic_concrete_beam, "loads": {"MEd": 200, "VEd": 100}},   # Heavy loading
    {**basic_concrete_beam, "loads": {"MEd": 250, "VEd": 120}},   # Very heavy loading
    {**basic_concrete_beam, "loads": {"MEd": 300, "VEd": 150}}    # Extreme loading
]

if __name__ == "__main__":
    print("🏗️  Concrete Beam Input Examples")
    print("=" * 50)
    
    # Show example parameter structures
    examples = {
        "Basic Beam": basic_concrete_beam,
        "Heavy Load Beam": heavy_load_beam,
        "High-Rise Beam": high_rise_beam,
        "Lightweight Beam": lightweight_beam,
        "Precast Beam": precast_beam
    }
    
    for name, params in examples.items():
        geom = params['geometry']
        loads = params['loads']
        mat = params['material']
        print(f"\n📋 {name}:")
        print(f"   • Dimensions: {geom['b']}×{geom['h']}mm, cover={geom['c']}mm")
        print(f"   • Loads: MEd={loads['MEd']}kNm, VEd={loads['VEd']}kN")
        print(f"   • Materials: C{mat['fck']}/{int(mat['fck']*1.2)}, B{mat['fyk']}")
    
    print(f"\n📊 Parametric Studies Available:")
    print(f"   • Beam depth variation: {len(parametric_study_depth)} cases")
    print(f"   • Concrete strength variation: {len(parametric_study_concrete)} grades") 
    print(f"   • Load combinations: {len(load_combinations)} cases")
    
    print(f"\n💡 Usage with structural_tools:")
    print(f"   from structural_tools import calculate")
    print(f"   from example_concrete_beam_input import basic_concrete_beam")
    print(f"   ")
    print(f"   result = calculate('concrete_beam', basic_concrete_beam)")
    print(f"   # Note: Concrete beam API implementation pending")
    
    # Try to run actual calculation if structural_tools is available
    try:
        import sys
        sys.path.append('.')
        from structural_tools import calculate, health_check
        
        if health_check():
            print(f"\n🧪 Testing concrete beam calculation...")
            result = calculate("concrete_beam", basic_concrete_beam)
            if result['success']:
                print(f"✅ Success!")
                print(f"   • Result: {result}")
            else:
                print(f"⚠️  {result['error']} - {result.get('note', '')}")
        else:
            print(f"\n⚠️  API server not running. Start with: python structural_api_server.py")
            
    except ImportError:
        print(f"\n⚠️  structural_tools not found. Make sure you're in the right directory.")
    except Exception as e:
        print(f"\n⚠️  Error: {e}")