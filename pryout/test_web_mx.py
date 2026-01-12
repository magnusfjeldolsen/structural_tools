"""
Test web interface with Mx moment
"""

import sys
sys.path.insert(0, 'codes/python')

from fastener_design.web_interface import run_analysis
import json

# Create input data
input_data = {
    "fasteners": [
        {"id": 1, "x": 100, "y": 100, "d": 16, "hef": 100, "fuk": 500},
        {"id": 2, "x": -100, "y": 100, "d": 16, "hef": 100, "fuk": 500},
        {"id": 3, "x": -100, "y": -100, "d": 16, "hef": 100, "fuk": 500},
        {"id": 4, "x": 100, "y": -100, "d": 16, "hef": 100, "fuk": 500}
    ],
    "concrete": {
        "fck": 30,
        "h": 200
    },
    "loading": {
        "load_cases": [
            {
                "name": "LC1",
                "description": "Mx = 10 kNm",
                "Vx": 0,
                "Vy": 0,
                "Mx": 10.0,  # 10 kNm
                "My": 0,
                "Mz": 0,
                "N": 0,
                "application_type": "centroid"
            }
        ]
    },
    "edge_distances": {"c1": 150, "c2": 150},
    "spacings": {"auto_calculate": True},
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

print("=" * 70)
print("TEST: Web Interface with Mx = 10 kNm")
print("=" * 70)

# Run analysis
result_json = run_analysis(json.dumps(input_data))
result = json.loads(result_json)

print(f"\nStatus: {result['status']}")

if result['status'] == 'success':
    lc = result['load_cases'][0]

    print(f"\nLoad Case: {lc['load_case_name']}")
    print(f"Load Distribution:")
    print(f"{'ID':<4} {'X':>8} {'Y':>8} {'Vx':>10} {'Vy':>10} {'N':>10}")
    print("-" * 50)

    for fastener in lc['load_distribution']:
        fid = fastener['fastener_id']
        x = fastener['position']['x']
        y = fastener['position']['y']
        Vx = fastener['forces']['Vx_total']
        Vy = fastener['forces']['Vy_total']
        N = fastener['forces']['N']

        print(f"{fid:<4} {x:>8.1f} {y:>8.1f} {Vx:>10.3f} {Vy:>10.3f} {N:>10.3f}")

        # Check if N forces are correct
        if y > 0:  # Top fasteners
            expected = 25.0  # Approximately
            if abs(N - expected) > 1.0:
                print(f"  WARNING: Expected ~{expected:.1f} kN, got {N:.3f} kN")
        elif y < 0:  # Bottom fasteners
            expected = -25.0
            if abs(N - expected) > 1.0:
                print(f"  WARNING: Expected ~{expected:.1f} kN, got {N:.3f} kN")

    print("\n✓ Test complete - check forces above")
else:
    print(f"\nERROR: {result.get('error_message', 'Unknown error')}")
