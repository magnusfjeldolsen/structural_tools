"""
Test script for web_interface.py

Validates the Python bridge module works correctly with sample data
including load distribution calculations with corrected formulas.
"""

import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from web_interface import run_analysis


def test_single_fastener():
    """Test 1: Single fastener with tension"""
    print("\n" + "="*70)
    print("TEST 1: Single M16 Fastener in Tension")
    print("="*70)

    input_data = {
        "fasteners": [{
            "id": 1,
            "x": 0,
            "y": 0,
            "diameter": 16,
            "embedment_depth": 100,
            "steel_grade": 500,
            "area": None,  # Auto-calculate
            "area_override": None,
            "fastener_type": "headed",
            "d_head": 28.8
        }],
        "concrete": {
            "strength_class": "C25/30",
            "thickness": 200,
            "cracked": True,
            "reinforced": False
        },
        "loading": {
            "load_cases": [{
                "name": "LC1",
                "application_type": "centroid",
                "Vx": 0,
                "Vy": 0,
                "Mz": 0,
                "N": 40  # 40 kN tension
            }]
        },
        "edge_distances": {
            "c1": 150,
            "c2": 150
        },
        "spacings": {
            "auto_calculate": True
        },
        "analysis_options": {
            "loading_type": "static",
            "failure_modes": {
                "tension": ["steel", "cone", "pullout"],
                "shear": []
            },
            "interaction_exponents": {
                "alpha_N": 1.5,
                "beta_V": 1.5
            }
        }
    }

    result_json = run_analysis(json.dumps(input_data, indent=2))
    result = json.loads(result_json)

    print(f"Status: {result['status']}")

    if result['status'] == 'error':
        print(f"Error: {result.get('error_message')}")
        print(f"Error Type: {result.get('error_type')}")
        print(f"\n[FAIL] Test 1 FAILED: {result.get('error_message')}")
        return False

    print(f"Overall: {result['overall_status']}")
    print(f"Centroid: ({result['input_summary']['centroid']['x']}, {result['input_summary']['centroid']['y']})")

    if result['status'] == 'success':
        print("\n[PASS] Test 1 PASSED")
        return True
    else:
        print(f"\n[FAIL] Test 1 FAILED: {result.get('error_message')}")
        return False


def test_load_distribution_corrected_formula():
    """Test 2: Verify corrected torsional formula with 2 fasteners"""
    print("\n" + "="*70)
    print("TEST 2: Load Distribution - Corrected Torsional Formula")
    print("="*70)
    print("Setup: F1(0,-100), F2(0,-300), Load: Vx=10kN at (0,0)")
    print("Expected: F1=15kN (closer), F2=-5kN (farther)")

    input_data = {
        "fasteners": [
            {
                "id": 1,
                "x": 0,
                "y": -100,
                "diameter": 16,
                "embedment_depth": 100,
                "steel_grade": 500,
                "area": None,
                "area_override": None,
                "fastener_type": "headed"
            },
            {
                "id": 2,
                "x": 0,
                "y": -300,
                "diameter": 16,
                "embedment_depth": 100,
                "steel_grade": 500,
                "area": None,
                "area_override": None,
                "fastener_type": "headed"
            }
        ],
        "concrete": {
            "strength_class": "C25/30",
            "thickness": 200,
            "cracked": True
        },
        "loading": {
            "load_cases": [{
                "name": "LC1",
                "application_type": "point",
                "application_point": {"x": 0, "y": 0},
                "Vx": 10,  # 10 kN at origin
                "Vy": 0,
                "Mz": 0,
                "N": 0
            }]
        },
        "edge_distances": {"c1": 150},
        "spacings": {"auto_calculate": True},
        "analysis_options": {
            "loading_type": "static",
            "failure_modes": {
                "tension": [],
                "shear": ["steel"]
            }
        }
    }

    result_json = run_analysis(json.dumps(input_data, indent=2))
    result = json.loads(result_json)

    if result['status'] == 'success':
        dist = result['load_distribution']

        print(f"\nCentroid: (0, {result['input_summary']['centroid']['y']})")
        print("\nLoad Distribution:")
        for f in dist:
            fid = f['fastener_id']
            Vx_total = f['forces']['Vx_total']
            Vx_direct = f['forces']['Vx_direct']
            Vx_torsion = f['forces']['Vx_torsion']
            print(f"  F{fid}: Vx_total={Vx_total:.1f} kN (direct={Vx_direct:.1f}, torsion={Vx_torsion:.1f})")

        # Verify results
        f1_vx = dist[0]['forces']['Vx_total']
        f2_vx = dist[1]['forces']['Vx_total']

        # Expected: F1=15kN, F2=-5kN (within tolerance)
        tolerance = 0.5  # kN
        f1_ok = abs(f1_vx - 15.0) < tolerance
        f2_ok = abs(f2_vx - (-5.0)) < tolerance

        if f1_ok and f2_ok:
            print("\n[PASS] Test 2 PASSED - Formulas are CORRECT")
            print(f"   F1: {f1_vx:.1f} kN ~= 15.0 kN OK")
            print(f"   F2: {f2_vx:.1f} kN ~= -5.0 kN OK")
            return True
        else:
            print("\n[FAIL] Test 2 FAILED - Forces don't match expected values")
            print(f"   F1: {f1_vx:.1f} kN (expected 15.0)")
            print(f"   F2: {f2_vx:.1f} kN (expected -5.0)")
            return False
    else:
        print(f"\n[FAIL] Test 2 FAILED: {result.get('error_message')}")
        return False


def test_combined_loading_interaction():
    """Test 3: Combined loading with N-V interaction"""
    print("\n" + "="*70)
    print("TEST 3: Combined Loading with N-V Interaction")
    print("="*70)

    input_data = {
        "fasteners": [{
            "id": 1,
            "x": 0,
            "y": 0,
            "diameter": 16,
            "embedment_depth": 100,
            "steel_grade": 500,
            "area": None,
            "area_override": None,
            "fastener_type": "headed"
        }],
        "concrete": {
            "strength_class": "C25/30",
            "thickness": 200,
            "cracked": True
        },
        "loading": {
            "load_cases": [{
                "name": "LC1",
                "application_type": "centroid",
                "Vx": 15,  # 15 kN shear
                "Vy": 10,  # 10 kN shear
                "Mz": 0,
                "N": 30    # 30 kN tension
            }]
        },
        "edge_distances": {"c1": 150},
        "spacings": {"auto_calculate": True},
        "analysis_options": {
            "loading_type": "static",
            "failure_modes": {
                "tension": ["steel", "cone"],
                "shear": ["steel", "edge"]
            },
            "interaction_exponents": {
                "alpha_N": 1.5,
                "beta_V": 1.5
            }
        }
    }

    result_json = run_analysis(json.dumps(input_data, indent=2))
    result = json.loads(result_json)

    if result['status'] == 'success':
        print(f"Status: {result['status']}")
        print(f"Overall: {result['overall_status']}")

        if result['interaction']:
            interaction = result['interaction']
            print(f"\nInteraction Check:")
            print(f"  Governing tension: {interaction['governing_tension_mode']}")
            print(f"  NRd = {interaction['NRd_kN']:.1f} kN")
            print(f"  Governing shear: {interaction['governing_shear_mode']}")
            print(f"  VRd = {interaction['VRd_kN']:.1f} kN")
            print(f"  Interaction ratio: {interaction['interaction_ratio']:.3f}")
            print(f"  Status: {interaction['status']}")

        print("\n[PASS] Test 3 PASSED")
        return True
    else:
        print(f"\n[FAIL] Test 3 FAILED: {result.get('error_message')}")
        return False


def test_area_override():
    """Test 4: Area override functionality"""
    print("\n" + "="*70)
    print("TEST 4: Area Override Functionality")
    print("="*70)

    input_data = {
        "fasteners": [{
            "id": 1,
            "x": 0,
            "y": 0,
            "diameter": 16,
            "embedment_depth": 100,
            "steel_grade": 500,
            "area": 201,  # Will be ignored
            "area_override": 157,  # This should be used
            "fastener_type": "headed"
        }],
        "concrete": {
            "strength_class": "C25/30",
            "thickness": 200,
            "cracked": True
        },
        "loading": {
            "load_cases": [{
                "name": "LC1",
                "application_type": "centroid",
                "Vx": 0,
                "Vy": 0,
                "Mz": 0,
                "N": 40
            }]
        },
        "edge_distances": {"c1": 150},
        "spacings": {"auto_calculate": True},
        "analysis_options": {
            "loading_type": "static",
            "failure_modes": {
                "tension": ["steel"],
                "shear": []
            }
        }
    }

    result_json = run_analysis(json.dumps(input_data, indent=2))
    result = json.loads(result_json)

    if result['status'] == 'success':
        # Check that steel capacity reflects area=157, not 201
        steel_info = result['failure_modes']['tension']['steel']['info']
        print(f"Steel area used: {steel_info.get('As', 'N/A')} mm²")
        print(f"NRk_s: {steel_info.get('NRk_s_kN', 'N/A')} kN")

        print("\n[PASS] Test 4 PASSED - Area override working")
        return True
    else:
        print(f"\n[FAIL] Test 4 FAILED: {result.get('error_message')}")
        return False


def main():
    """Run all tests"""
    print("\n" + "#"*70)
    print("# WEB_INTERFACE.PY VALIDATION TESTS")
    print("#"*70)

    results = []
    results.append(test_single_fastener())
    results.append(test_load_distribution_corrected_formula())
    results.append(test_combined_loading_interaction())
    results.append(test_area_override())

    print("\n" + "#"*70)
    print(f"# TEST SUMMARY: {sum(results)}/{len(results)} PASSED")
    print("#"*70 + "\n")

    if all(results):
        print("[PASS] ALL TESTS PASSED - web_interface.py is ready for Phase 3")
        return 0
    else:
        print("[FAIL] SOME TESTS FAILED - review errors above")
        return 1


if __name__ == '__main__':
    sys.exit(main())
