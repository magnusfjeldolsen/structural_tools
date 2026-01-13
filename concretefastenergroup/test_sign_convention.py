"""
Test sign conventions for Mx, My, Mz with 4 fasteners in a square

Test case: 4 fasteners at corners of 100mm x 100mm square
- Fastener 1: (-50, -50) - bottom left
- Fastener 2: (+50, -50) - bottom right
- Fastener 3: (+50, +50) - top right
- Fastener 4: (-50, +50) - top left

Expected results:
1. Mx = 10 kNm (bending about x-axis):
   - Top fasteners (y=+50): Tension, N = +50 kN
   - Bottom fasteners (y=-50): Compression, N = -50 kN

2. My = 10 kNm (bending about y-axis):
   - Left fasteners (x=-50): Tension, N = +50 kN
   - Right fasteners (x=+50): Compression, N = -50 kN

3. Mz = 10 kNm (torsion, CCW applied):
   - Each fastener: ~35 kN resultant resisting force
   - RESISTING forces create CW torque (opposite to applied CCW)
   - Fastener 1 (-50,-50): Resisting force towards (-x, +y) at 135deg
   - Fastener 2 (+50,-50): Resisting force towards (-x, -y) at -135deg
   - Fastener 3 (+50,+50): Resisting force towards (+x, -y) at -45deg
   - Fastener 4 (-50,+50): Resisting force towards (+x, +y) at +45deg
   - |Vx_torsion| = |Vy_torsion| ≈ 25 kN (35/√2)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'codes' / 'python' / 'fastener_design'))

from calculations.planar_bending import (
    calculate_centroid,
    calculate_section_properties,
    calculate_bending_forces,
    distribute_loads_with_bending
)
import math

def test_mx_bending():
    """Test Mx = 10 kNm - should create tension at top (positive y)"""
    print("\n" + "="*70)
    print("TEST 1: Mx = 10 kNm (Bending about x-axis)")
    print("="*70)
    print("Expected: Tension (+50 kN) at top (y=+50), Compression (-50 kN) at bottom (y=-50)")

    # 4 fasteners in square, 100mm apart
    positions = [
        (-50, -50),  # Bottom left
        (50, -50),   # Bottom right
        (50, 50),    # Top right
        (-50, 50)    # Top left
    ]
    areas = [100.0] * 4  # mm²

    # Calculate properties
    centroid = calculate_centroid(positions, areas)
    section_props = calculate_section_properties(positions, areas, centroid)

    print(f"Centroid: {centroid}")
    print(f"Ix = {section_props['Ix']:.0f} mm^4")
    print(f"Iy = {section_props['Iy']:.0f} mm^4")
    print(f"J = {section_props['J']:.0f} mm^4")

    # Apply Mx = 10 kNm
    Mx = 10.0  # kNm
    My = 0.0

    forces = calculate_bending_forces(positions, areas, Mx, My, centroid, section_props)

    print(f"\nResults for Mx = {Mx} kNm:")
    for i, ((x, y), N) in enumerate(zip(positions, forces)):
        print(f"  Fastener {i+1} at ({x:+4.0f}, {y:+4.0f}): N = {N:+6.1f} kN")

    # Verify
    print("\nVerification:")
    top_fasteners = [forces[2], forces[3]]  # y = +50
    bottom_fasteners = [forces[0], forces[1]]  # y = -50

    avg_top = sum(top_fasteners) / len(top_fasteners)
    avg_bottom = sum(bottom_fasteners) / len(bottom_fasteners)

    print(f"  Average top (y=+50): {avg_top:+6.1f} kN (expected: +50 kN)")
    print(f"  Average bottom (y=-50): {avg_bottom:+6.1f} kN (expected: -50 kN)")

    if abs(avg_top - 50) < 1 and abs(avg_bottom + 50) < 1:
        print("  [PASS] Mx sign convention correct")
        return True
    else:
        print("  [FAIL] Mx sign convention incorrect")
        return False

def test_my_bending():
    """Test My = 10 kNm - should create tension at left (negative x)"""
    print("\n" + "="*70)
    print("TEST 2: My = 10 kNm (Bending about y-axis)")
    print("="*70)
    print("Expected: Tension (+50 kN) at left (x=-50), Compression (-50 kN) at right (x=+50)")

    positions = [
        (-50, -50),  # Bottom left
        (50, -50),   # Bottom right
        (50, 50),    # Top right
        (-50, 50)    # Top left
    ]
    areas = [100.0] * 4

    centroid = calculate_centroid(positions, areas)
    section_props = calculate_section_properties(positions, areas, centroid)

    # Apply My = 10 kNm
    Mx = 0.0
    My = 10.0  # kNm

    forces = calculate_bending_forces(positions, areas, Mx, My, centroid, section_props)

    print(f"\nResults for My = {My} kNm:")
    for i, ((x, y), N) in enumerate(zip(positions, forces)):
        print(f"  Fastener {i+1} at ({x:+4.0f}, {y:+4.0f}): N = {N:+6.1f} kN")

    # Verify
    print("\nVerification:")
    left_fasteners = [forces[0], forces[3]]  # x = -50
    right_fasteners = [forces[1], forces[2]]  # x = +50

    avg_left = sum(left_fasteners) / len(left_fasteners)
    avg_right = sum(right_fasteners) / len(right_fasteners)

    print(f"  Average left (x=-50): {avg_left:+6.1f} kN (expected: +50 kN)")
    print(f"  Average right (x=+50): {avg_right:+6.1f} kN (expected: -50 kN)")

    if abs(avg_left - 50) < 1 and abs(avg_right + 50) < 1:
        print("  [PASS] My sign convention correct")
        return True
    else:
        print("  [FAIL] My sign convention incorrect")
        return False

def test_mz_torsion():
    """Test Mz = 10 kNm - should create tangential forces following right-hand rule"""
    print("\n" + "="*70)
    print("TEST 3: Mz = 10 kNm (Torsion, CCW)")
    print("="*70)
    print("Expected: Each fastener ~35 kN resisting forces")
    print("RESISTING forces (create CW torque to resist CCW applied moment):")
    print("  F1 (-50,-50): Force towards (-x, +y) at 135deg")
    print("  F2 (+50,-50): Force towards (-x, -y) at -135deg")
    print("  F3 (+50,+50): Force towards (+x, -y) at -45deg")
    print("  F4 (-50,+50): Force towards (+x, +y) at +45deg")

    positions = [
        (-50, -50),  # Bottom left
        (50, -50),   # Bottom right
        (50, 50),    # Top right
        (-50, 50)    # Top left
    ]
    areas = [100.0] * 4

    centroid = calculate_centroid(positions, areas)
    section_props = calculate_section_properties(positions, areas, centroid)

    # Apply Mz = 10 kNm
    Vx = 0.0
    Vy = 0.0
    N = 0.0
    Mx = 0.0
    My = 0.0
    Mz = 10.0  # kNm

    result = distribute_loads_with_bending(
        positions, areas, Vx, Vy, N, Mx, My, Mz
    )

    print(f"\nResults for Mz = {Mz} kNm:")
    print(f"J = {section_props['J']:.0f} mm^4")

    for i, dist in enumerate(result):
        x, y = positions[i]
        Vx_t = dist['Vx_torsion']
        Vy_t = dist['Vy_torsion']
        V_resultant = math.sqrt(Vx_t**2 + Vy_t**2)
        angle = math.atan2(Vy_t, Vx_t) * 180 / math.pi

        print(f"  Fastener {i+1} at ({x:+4.0f}, {y:+4.0f}):")
        print(f"    Vx_torsion = {Vx_t:+6.1f} kN")
        print(f"    Vy_torsion = {Vy_t:+6.1f} kN")
        print(f"    Resultant = {V_resultant:6.1f} kN at {angle:+6.1f}°")

    # Verify resisting forces create CW torque
    print("\nVerification:")

    # Expected RESISTING force directions for CCW applied Mz (positive):
    # Forces must create CW (negative) torque to resist
    # Fastener at (-50, -50): resisting force towards (-x, +y) at 135deg
    # Fastener at (+50, -50): resisting force towards (-x, -y) at -135deg
    # Fastener at (+50, +50): resisting force towards (+x, -y) at -45deg
    # Fastener at (-50, +50): resisting force towards (+x, +y) at +45deg

    checks = []

    # F1: (-50, -50) -> expect (-Vx, +Vy) at 135deg
    Vx1 = result[0]['Vx_torsion']
    Vy1 = result[0]['Vy_torsion']
    check1 = Vx1 < 0 and Vy1 > 0
    print(f"  F1 (-50,-50): Vx={Vx1:+.1f}, Vy={Vy1:+.1f} -> expect (-,+): {'[OK]' if check1 else '[FAIL]'}")
    checks.append(check1)

    # F2: (+50, -50) -> expect (-Vx, -Vy) at -135deg
    Vx2 = result[1]['Vx_torsion']
    Vy2 = result[1]['Vy_torsion']
    check2 = Vx2 < 0 and Vy2 < 0
    print(f"  F2 (+50,-50): Vx={Vx2:+.1f}, Vy={Vy2:+.1f} -> expect (-,-): {'[OK]' if check2 else '[FAIL]'}")
    checks.append(check2)

    # F3: (+50, +50) -> expect (+Vx, -Vy) at -45deg
    Vx3 = result[2]['Vx_torsion']
    Vy3 = result[2]['Vy_torsion']
    check3 = Vx3 > 0 and Vy3 < 0
    print(f"  F3 (+50,+50): Vx={Vx3:+.1f}, Vy={Vy3:+.1f} -> expect (+,-): {'[OK]' if check3 else '[FAIL]'}")
    checks.append(check3)

    # F4: (-50, +50) -> expect (+Vx, +Vy) at +45deg
    Vx4 = result[3]['Vx_torsion']
    Vy4 = result[3]['Vy_torsion']
    check4 = Vx4 > 0 and Vy4 > 0
    print(f"  F4 (-50,+50): Vx={Vx4:+.1f}, Vy={Vy4:+.1f} -> expect (+,+): {'[OK]' if check4 else '[FAIL]'}")
    checks.append(check4)

    # Check magnitude
    avg_resultant = sum([math.sqrt(d['Vx_torsion']**2 + d['Vy_torsion']**2) for d in result]) / 4
    expected_resultant = 35.0  # Approximately
    mag_check = abs(avg_resultant - expected_resultant) < 5
    print(f"\n  Average resultant: {avg_resultant:.1f} kN (expected: ~35 kN): {'[OK]' if mag_check else '[FAIL]'}")
    checks.append(mag_check)

    if all(checks):
        print("\n  [PASS] Mz sign convention and magnitude correct")
        return True
    else:
        print("\n  [FAIL] Mz sign convention or magnitude incorrect")
        return False

if __name__ == '__main__':
    print("\n" + "="*70)
    print("SIGN CONVENTION TEST SUITE")
    print("4 fasteners in 100mm x 100mm square")
    print("="*70)

    results = []

    results.append(("Mx bending", test_mx_bending()))
    results.append(("My bending", test_my_bending()))
    results.append(("Mz torsion", test_mz_torsion()))

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{name:20s}: {status}")

    all_passed = all(r[1] for r in results)
    print("\n" + ("="*70))
    if all_passed:
        print("[PASS] ALL TESTS PASSED")
    else:
        print("[FAIL] SOME TESTS FAILED - Sign conventions need correction")
    print("="*70)
