"""
Test torsion force calculations against technical notes example

Example from torsion.md section 9:
- Square fastener pattern at (±50, ±50) mm
- Centroid at (0, 0)
- r_i = 70.71 mm for all fasteners
- Applied +Mz (CCW)
- Expected force magnitude F_i = 35355 N

Expected results for +Mz = 250 kNm:
| x (mm) | y (mm) | Fx (N)    | Fy (N)    |
|--------|--------|-----------|-----------|
|  50    |  50    | −25,000   | +25,000   |
| −50    |  50    | −25,000   | −25,000   |
| −50    | −50    | +25,000   | −25,000   |
|  50    | −50    | +25,000   | +25,000   |
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'codes', 'python'))

from fastener_design.calculations.planar_bending import (
    distribute_loads_with_bending,
    verify_torsion_forces
)

def test_square_pattern_torsion():
    """Test with square pattern from technical notes"""

    # Square pattern at (±50, ±50) mm
    positions = [
        (50.0, 50.0),    # Top right
        (-50.0, 50.0),   # Top left
        (-50.0, -50.0),  # Bottom left
        (50.0, -50.0)    # Bottom right
    ]

    # Assume equal areas (doesn't affect torsion since we use Σr² not J)
    areas = [100.0] * 4  # mm²

    # Apply pure torsion
    N = 0.0
    Vx = 0.0
    Vy = 0.0
    Mx = 0.0
    My = 0.0
    Mz = 10.0  # kNm (positive = CCW) - gives F_i = 35.355 kN, components = 25 kN

    # Calculate distribution
    distribution = distribute_loads_with_bending(
        positions, areas, N, Vx, Vy, Mx, My, Mz,
        application_type='centroid'
    )

    print("=" * 80)
    print("TORSION VERIFICATION TEST")
    print("=" * 80)
    print(f"\nInput: Mz = {Mz} kNm (CCW)")
    print("\nSquare pattern: (+/-50, +/-50) mm")
    print(f"Centroid: (0, 0) mm")
    print(f"r_i = 70.71 mm for all fasteners")
    print(f"Sum(r^2) = {4 * (50**2 + 50**2)} mm^2")

    # Expected values (from technical notes)
    expected = {
        (50.0, 50.0): (-25.0, 25.0),    # Fx, Fy in kN
        (-50.0, 50.0): (-25.0, -25.0),
        (-50.0, -50.0): (25.0, -25.0),
        (50.0, -50.0): (25.0, 25.0)
    }

    print("\n" + "-" * 80)
    print(f"{'x (mm)':<10} {'y (mm)':<10} {'Fx (kN)':<12} {'Fy (kN)':<12} {'Expected Fx':<12} {'Expected Fy':<12} {'Match':<6}")
    print("-" * 80)

    all_match = True
    for result in distribution:
        x = result['x']
        y = result['y']
        Fx = result['Vx_torsion']
        Fy = result['Vy_torsion']

        exp_Fx, exp_Fy = expected[(x, y)]

        # Check if within tolerance (0.1 kN = 100 N)
        match_Fx = abs(Fx - exp_Fx) < 0.1
        match_Fy = abs(Fy - exp_Fy) < 0.1
        match = match_Fx and match_Fy
        all_match = all_match and match

        match_str = 'OK' if match else 'FAIL'
        print(f"{x:<10.1f} {y:<10.1f} {Fx:<12.3f} {Fy:<12.3f} {exp_Fx:<12.1f} {exp_Fy:<12.1f} {match_str:<6}")

    # Run verification checks
    print("\n" + "=" * 80)
    print("VERIFICATION CHECKS (from technical notes section 10)")
    print("=" * 80)

    Vx_torsion = [r['Vx_torsion'] for r in distribution]
    Vy_torsion = [r['Vy_torsion'] for r in distribution]

    verification = verify_torsion_forces(
        positions,
        (0.0, 0.0),  # centroid
        Vx_torsion,
        Vy_torsion,
        Mz,
        tolerance=1e-3  # 0.001 kN = 1 N tolerance
    )

    print(f"\n1. Perpendicularity Check: {'PASSED' if verification['perpendicularity_passed'] else 'FAILED'}")
    print(f"   (Forces perpendicular to radius: Fx*x + Fy*y = 0)")
    if verification['perpendicularity_errors']:
        max_error = max(verification['perpendicularity_errors'])
        print(f"   Max error: {max_error:.2e} N*mm")

    print(f"\n2. Force Equilibrium Check: {'PASSED' if verification['force_equilibrium_passed'] else 'FAILED'}")
    print(f"   (Sum of forces = 0)")
    sum_Fx, sum_Fy = verification['force_sum']
    print(f"   Sum(Fx) = {sum_Fx:.6f} kN")
    print(f"   Sum(Fy) = {sum_Fy:.6f} kN")

    print(f"\n3. Moment Recovery Check: {'PASSED' if verification['moment_recovery_passed'] else 'FAILED'}")
    print(f"   (Recovered moment = Applied moment)")
    print(f"   Applied Mz:    {Mz:.3f} kNm")
    print(f"   Recovered Mz:  {verification['moment_recovered']:.3f} kNm")
    print(f"   Difference:    {abs(Mz - verification['moment_recovered']):.6f} kNm")

    print("\n" + "=" * 80)
    if all_match and all(verification[k] for k in ['perpendicularity_passed', 'force_equilibrium_passed', 'moment_recovery_passed']):
        print("ALL TESTS PASSED - Implementation matches technical notes!")
    else:
        print("SOME TESTS FAILED - Review implementation")
    print("=" * 80)

    return all_match and all(verification[k] for k in ['perpendicularity_passed', 'force_equilibrium_passed', 'moment_recovery_passed'])


if __name__ == '__main__':
    success = test_square_pattern_torsion()
    sys.exit(0 if success else 1)
