"""
Test multi-load case functionality in web_interface.py
"""

import sys
import json

# Add the codes/python directory to path
sys.path.insert(0, 'codes/python')

from fastener_design.web_interface import run_analysis

def test_multi_load_cases():
    """Test with multiple load cases"""
    print("\n" + "="*70)
    print("TEST: Multi-Load Case Analysis")
    print("="*70)

    input_data = {
        'fasteners': [
            {
                'id': 1,
                'x': 0.0,
                'y': 0.0,
                'diameter': 16.0,
                'embedment_depth': 100.0,
                'steel_grade': 500.0,
                'area': None,
                'fastener_type': 'headed'
            }
        ],
        'concrete': {
            'strength_class': 'C25/30',
            'thickness': 200.0,
            'cracked': True,
            'reinforced': False
        },
        'edge_distances': {
            'c1': 150.0,
            'c2': 150.0
        },
        'spacings': {
            'auto_calculate': True
        },
        'loading': {
            'load_cases': [
                {
                    'id': 'LC1',
                    'name': 'LC1: Dead Load',
                    'application_type': 'centroid',
                    'Vx': 0.0,
                    'Vy': 0.0,
                    'Mz': 0.0,
                    'N': 10.0
                },
                {
                    'id': 'LC2',
                    'name': 'LC2: Live Load',
                    'application_type': 'centroid',
                    'Vx': 5.0,
                    'Vy': 5.0,
                    'Mz': 0.0,
                    'N': 20.0
                },
                {
                    'id': 'LC3',
                    'name': 'LC3: Wind Load',
                    'application_type': 'centroid',
                    'Vx': 10.0,
                    'Vy': 0.0,
                    'Mz': 0.0,
                    'N': 5.0
                }
            ]
        },
        'analysis_options': {
            'loading_type': 'static',
            'failure_modes': {
                'tension': ['steel', 'cone', 'pullout'],
                'shear': ['steel', 'pryout']
            },
            'interaction_exponents': {
                'alpha_N': 1.5,
                'beta_V': 1.5
            },
            'material_factors': {
                'gamma_Ms': 1.25,
                'gamma_Mc': 1.5
            }
        }
    }

    # Run analysis
    result_json = run_analysis(json.dumps(input_data, indent=2))
    result = json.loads(result_json)

    # Check results
    if result['status'] == 'error':
        print(f"\n[ERROR] {result['error_message']}")
        print(f"Error Type: {result.get('error_type')}")
        return False

    print(f"\n[OK] Status: {result['status']}")
    print(f"[OK] Overall Status: {result['overall_status']}")
    print(f"\n[OK] Number of load cases analyzed: {len(result['load_cases'])}")

    # Check load case results
    for i, lc in enumerate(result['load_cases']):
        print(f"\n  Load Case {i+1}: {lc['load_case_name']}")
        print(f"    Overall Status: {lc['overall_status']}")

        if lc['failure_modes'].get('tension'):
            tension_modes = [k for k in lc['failure_modes']['tension'].keys()
                           if k not in ['governing', 'min_capacity', 'min_capacity_kN', 'status', 'overall_status']]
            print(f"    Tension modes checked: {', '.join(tension_modes)}")

        if lc['failure_modes'].get('shear'):
            shear_modes = [k for k in lc['failure_modes']['shear'].keys()
                         if k not in ['governing', 'min_capacity', 'min_capacity_kN', 'status', 'overall_status']]
            print(f"    Shear modes checked: {', '.join(shear_modes)}")

    # Check max utilizations
    print(f"\n[OK] Max Utilizations:")

    if result['max_utilizations'].get('tension'):
        print(f"  Tension:")
        for mode, data in result['max_utilizations']['tension'].items():
            print(f"    {mode.upper()}: util={data['utilization']:.3f}, governing_case={data['governing_case']}")

    if result['max_utilizations'].get('shear'):
        print(f"  Shear:")
        for mode, data in result['max_utilizations']['shear'].items():
            print(f"    {mode.upper()}: util={data['utilization']:.3f}, governing_case={data['governing_case']}")

    if result['max_utilizations'].get('interaction'):
        int_data = result['max_utilizations']['interaction']
        print(f"  Interaction: ratio={int_data.get('interaction_ratio', 0):.3f}, governing_case={int_data.get('governing_case', 'N/A')}")

    print(f"\n[PASS] TEST PASSED - Multi-load case analysis working correctly")
    return True


if __name__ == '__main__':
    success = test_multi_load_cases()
    sys.exit(0 if success else 1)
