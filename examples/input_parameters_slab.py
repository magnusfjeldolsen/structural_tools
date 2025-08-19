#!/usr/bin/env python3
"""
Example Concrete Slab ULS Design Input Parameters
================================================

This file demonstrates the dictionary structure for concrete slab ULS design calculations.
Use these parameter dictionaries with the structural_tools API.

Author: Magnus Fjeld Olsen
License: MIT
"""

# Basic concrete slab example - residential floor
basic_concrete_slab = {
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

# Heavy load slab - commercial/office building
heavy_load_slab = {
    "geometry": {
        "MEd": 85,          # Higher moment due to increased loads
        "t": 250,           # Thicker slab
        "c": 30             # Increased cover for durability
    },
    "material": {
        "fcd": 20.0,        # Design strength from C30/37
        "fyd": 435          # B500 steel
    },
    "reinforcement": {
        "phi_l": 16,        # Larger bars
        "cc_l": 150         # Closer spacing
    }
}

# Parking garage slab - heavy vehicle loads
parking_slab = {
    "geometry": {
        "MEd": 120,         # High moment from vehicle loads
        "t": 300,           # Thick slab for durability
        "c": 35             # High cover for durability
    },
    "material": {
        "fcd": 23.3,        # Design strength from C35/45
        "fyd": 435
    },
    "reinforcement": {
        "phi_l": 20,        # Large bars
        "cc_l": 125         # Dense reinforcement
    }
}

# Lightweight slab - residential with reduced loads
lightweight_slab = {
    "geometry": {
        "MEd": 30,          # Lower moment
        "t": 160,           # Thinner slab
        "c": 20             # Standard cover
    },
    "material": {
        "fcd": 16.7,        # C25/30
        "fyd": 435
    },
    "reinforcement": {
        "phi_l": 10,        # Smaller bars
        "cc_l": 250         # Wider spacing
    }
}

# High-rise slab - premium construction
high_rise_slab = {
    "geometry": {
        "MEd": 75,
        "t": 220,
        "c": 30             # Higher cover for high-rise
    },
    "material": {
        "fcd": 26.7,        # Design strength from C40/50
        "fyd": 435
    },
    "reinforcement": {
        "phi_l": 14,
        "cc_l": 175
    }
}

# Industrial slab - factory floor
industrial_slab = {
    "geometry": {
        "MEd": 95,          # Equipment and storage loads
        "t": 280,           # Robust thickness
        "c": 40             # High durability requirements
    },
    "material": {
        "fcd": 23.3,        # C35/45 for durability
        "fyd": 435
    },
    "reinforcement": {
        "phi_l": 16,
        "cc_l": 150
    }
}

# Parametric study - varying slab thickness
parametric_study_thickness = [
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 150}},
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 175}},
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 200}},  # Base case
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 225}},
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 250}},
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "t": 300}}
]

# Parametric study - varying reinforcement
parametric_study_reinforcement = [
    {**basic_concrete_slab, "reinforcement": {"phi_l": 10, "cc_l": 250}},   # Light reinforcement
    {**basic_concrete_slab, "reinforcement": {"phi_l": 12, "cc_l": 200}},   # Base case
    {**basic_concrete_slab, "reinforcement": {"phi_l": 14, "cc_l": 175}},   # Medium reinforcement
    {**basic_concrete_slab, "reinforcement": {"phi_l": 16, "cc_l": 150}},   # Heavy reinforcement
    {**basic_concrete_slab, "reinforcement": {"phi_l": 20, "cc_l": 125}}    # Very heavy reinforcement
]

# Parametric study - varying applied moment
parametric_study_moment = [
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 25}},   # Low moment
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 35}},   # Medium-low
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 50}},   # Base case  
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 65}},   # Medium-high
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 85}},   # High moment
    {**basic_concrete_slab, "geometry": {**basic_concrete_slab["geometry"], "MEd": 100}}   # Very high
]

# Concrete strength comparison
concrete_strength_comparison = [
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 13.3}},  # C20/25
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 16.7}},  # C25/30 (base)
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 20.0}},  # C30/37
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 23.3}},  # C35/45
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 26.7}},  # C40/50
    {**basic_concrete_slab, "material": {**basic_concrete_slab["material"], "fcd": 30.0}}   # C45/55
]

if __name__ == "__main__":
    print("🏗️  Concrete Slab Input Examples")  
    print("=" * 50)
    
    # Show example parameter structures
    examples = {
        "Basic Slab": basic_concrete_slab,
        "Heavy Load Slab": heavy_load_slab,
        "Parking Slab": parking_slab,
        "Lightweight Slab": lightweight_slab,
        "High-Rise Slab": high_rise_slab,
        "Industrial Slab": industrial_slab
    }
    
    for name, params in examples.items():
        geom = params['geometry']
        mat = params['material']
        rein = params['reinforcement']
        print(f"\n📋 {name}:")
        print(f"   • Thickness: {geom['t']}mm, cover={geom['c']}mm")
        print(f"   • Applied moment: {geom['MEd']}kNm/m")
        print(f"   • Materials: fcd={mat['fcd']}MPa, fyd={mat['fyd']}MPa")
        print(f"   • Reinforcement: φ{rein['phi_l']}@{rein['cc_l']}mm c/c")
    
    print(f"\n📊 Parametric Studies Available:")
    print(f"   • Slab thickness variation: {len(parametric_study_thickness)} cases")
    print(f"   • Reinforcement variation: {len(parametric_study_reinforcement)} cases")
    print(f"   • Applied moment variation: {len(parametric_study_moment)} cases") 
    print(f"   • Concrete strength comparison: {len(concrete_strength_comparison)} grades")
    
    print(f"\n💡 Usage with structural_tools:")
    print(f"   from structural_tools import calculate")
    print(f"   from example_concrete_slab_input import basic_concrete_slab")
    print(f"   ")
    print(f"   result = calculate('concrete_slab', basic_concrete_slab)")
    print(f"   # Note: Concrete slab API implementation pending")
    
    # Try to run actual calculation if structural_tools is available
    try:
        import sys
        sys.path.append('.')
        from structural_tools import calculate, health_check
        
        if health_check():
            print(f"\n🧪 Testing concrete slab calculation...")
            result = calculate("concrete_slab", basic_concrete_slab)
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