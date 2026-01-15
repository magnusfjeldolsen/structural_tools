"""
Debug unit conversions in torsion calculation
"""

import sys
import os.path
import math as m

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'codes', 'python'))

from fastener_design.calculations.planar_bending import distribute_loads_with_bending

def test_100x100_square():
    """Test with 100x100 square (fasteners at corners: 0, 100)"""

    positions = [
        (0.0, 0.0),
        (100.0, 0.0),
        (100.0, 100.0),
        (0.0, 100.0)
    ]

    # M16 bolts: diameter = 16mm
    diameter = 16.0  # mm
    areas = [m.pi * (diameter/2)**2] * 4  # mm²

    print("="*80)
    print("DEBUG: 100x100 Square Pattern")
    print("="*80)
    print(f"\nPositions (mm): {positions}")
    print(f"Diameter: {diameter} mm")
    print(f"Areas: {areas[0]:.2f} mm² per fastener")

    # Centroid should be at (50, 50)
    print(f"\nExpected centroid: (50, 50) mm")

    # Expected calculations:
    # dx, dy from centroid: ±50, ±50 mm
    # r_i = sqrt(50² + 50²) = 70.71 mm
    # sum_r² = 4 × 5000 = 20,000 mm²
    print(f"Expected r_i: 70.71 mm")
    print(f"Expected sum(r²): 20,000 mm²")

    # Apply pure torsion
    N = 0.0
    Vx = 0.0
    Vy = 0.0
    Mx = 0.0
    My = 0.0
    Mz = 10.0  # kNm

    print(f"\nApplied Mz: {Mz} kNm = {Mz * 1e6} N·mm")

    # Expected force magnitude
    # F_i = (Mz_Nmm * r_i) / sum_r²
    # F_i = (10,000,000 * 70.71) / 20,000 = 35,355 N = 35.355 kN
    print(f"Expected F_i: 35.355 kN")
    print(f"Expected components: ±25 kN in X and Y")

    # Run calculation
    distribution = distribute_loads_with_bending(
        positions, areas, N, Vx, Vy, Mx, My, Mz,
        application_type='centroid'
    )

    print("\n" + "-"*80)
    print(f"{'x (mm)':<10} {'y (mm)':<10} {'Vx_torsion (kN)':<16} {'Vy_torsion (kN)':<16} {'V_tot (kN)':<12}")
    print("-"*80)

    for result in distribution:
        x = result['x']
        y = result['y']
        Vx_torsion = result['Vx_torsion']
        Vy_torsion = result['Vy_torsion']
        V_tot = result['V_total']

        print(f"{x:<10.1f} {y:<10.1f} {Vx_torsion:<16.6f} {Vy_torsion:<16.6f} {V_tot:<12.6f}")

    # Check first fastener (should be at (0, 0), centroid-shifted (-50, -50))
    first = distribution[0]
    print("\n" + "="*80)
    print("DETAILED CALCULATION CHECK (Fastener at 0, 0)")
    print("="*80)
    print(f"Position: ({first['x']}, {first['y']}) mm")
    print(f"Centroid-shifted: dx = {first['x'] - 50:.1f}, dy = {first['y'] - 50:.1f} mm")

    dx = first['x'] - 50
    dy = first['y'] - 50
    r_i = (dx**2 + dy**2)**0.5
    sum_r_squared = 4 * 5000  # Known value

    print(f"r_i = sqrt({dx}² + {dy}²) = {r_i:.2f} mm")
    print(f"sum(r²) = {sum_r_squared} mm²")

    Mz_Nmm = Mz * 1e6
    F_i_N = (Mz_Nmm * r_i) / sum_r_squared
    print(f"\nF_i = ({Mz_Nmm} * {r_i:.2f}) / {sum_r_squared} = {F_i_N:.2f} N = {F_i_N/1000:.6f} kN")

    Fx_expected = -F_i_N * (dy / r_i) / 1000.0
    Fy_expected = +F_i_N * (dx / r_i) / 1000.0

    print(f"\nExpected Fx = -{F_i_N:.2f} * ({dy}/{r_i:.2f}) / 1000 = {Fx_expected:.6f} kN")
    print(f"Expected Fy = +{F_i_N:.2f} * ({dx}/{r_i:.2f}) / 1000 = {Fy_expected:.6f} kN")

    print(f"\nActual Vx_torsion: {first['Vx_torsion']:.6f} kN")
    print(f"Actual Vy_torsion: {first['Vy_torsion']:.6f} kN")

    match_Fx = abs(first['Vx_torsion'] - Fx_expected) < 0.001
    match_Fy = abs(first['Vy_torsion'] - Fy_expected) < 0.001

    print(f"\nMatch: {'✓ PASS' if match_Fx and match_Fy else '✗ FAIL'}")

    if not (match_Fx and match_Fy):
        print(f"ERROR: Calculated values don't match expected!")
        print(f"Difference Fx: {first['Vx_torsion'] - Fx_expected:.6f} kN")
        print(f"Difference Fy: {first['Vy_torsion'] - Fy_expected:.6f} kN")

if __name__ == '__main__':
    test_100x100_square()
