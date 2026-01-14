"""
Test planar bending implementation

Verifies that the planar_bending module correctly calculates
forces in fasteners from Mx and My moments.

This test matches the example script provided by the user.
"""

import sys
sys.path.insert(0, 'codes/python')

import numpy as np
from fastener_design.calculations import planar_bending


def test_example_case():
    """Test case matching user's example"""

    print("=" * 70)
    print("TEST: Planar Bending - User Example")
    print("=" * 70)

    # Fastener coordinates relative to centroid (x, y)
    # Example: 4 fasteners
    positions = [
        (50, 50),
        (-50, 50),
        (-50, -50),
        (50, -50)
    ]

    # Fastener area (or influence area) in mm²
    areas = [100, 100, 100, 100]

    # Bending moments in kNm (converted from N·mm in example)
    Mx_Nmm = 1e6  # N·mm
    My_Nmm = 0.5e6  # N·mm

    Mx = Mx_Nmm / 1e6  # kNm
    My = My_Nmm / 1e6  # kNm

    print(f"\nInputs:")
    print(f"  Fastener positions: {positions}")
    print(f"  Fastener areas: {areas} mm²")
    print(f"  Mx = {Mx} kNm = {Mx_Nmm} N·mm")
    print(f"  My = {My} kNm = {My_Nmm} N·mm")

    # Calculate using numpy (reference solution)
    print("\n" + "-" * 70)
    print("NUMPY REFERENCE SOLUTION:")
    print("-" * 70)

    positions_np = np.array(positions, dtype=float)
    areas_np = np.array(areas, dtype=float)

    x = positions_np[:, 0]
    y = positions_np[:, 1]

    Ix = np.sum(y**2 * areas_np)
    Iy = np.sum(x**2 * areas_np)
    Ixy = np.sum(x * y * areas_np)

    print(f"Ix  = {Ix:.0f} mm^4")
    print(f"Iy  = {Iy:.0f} mm^4")
    print(f"Ixy = {Ixy:.0f} mm^4")

    I_matrix = np.array([[Ix, Ixy],
                         [Ixy, Iy]])

    I_inv = np.linalg.inv(I_matrix)

    print(f"\nInertia matrix inverse:")
    print(I_inv)

    M = np.array([Mx_Nmm, My_Nmm])

    print(f"\nForces in each fastener:")
    forces_numpy = []
    for i in range(len(positions)):
        stress = positions_np[i] @ I_inv @ M  # N/mm²
        force_N = stress * areas_np[i]  # N
        force_kN = force_N / 1000.0  # kN
        forces_numpy.append(force_kN)
        print(f"  Fastener {i+1}: Force = {force_N:.2f} N = {force_kN:.3f} kN")

    # Calculate using planar_bending module
    print("\n" + "-" * 70)
    print("PLANAR_BENDING MODULE:")
    print("-" * 70)

    centroid = planar_bending.calculate_centroid(positions, areas)
    print(f"Centroid: {centroid}")

    section_props = planar_bending.calculate_section_properties(
        positions, areas, centroid
    )
    print(f"Ix  = {section_props['Ix']:.0f} mm^4")
    print(f"Iy  = {section_props['Iy']:.0f} mm^4")
    print(f"Ixy = {section_props['Ixy']:.0f} mm^4")
    print(f"J   = {section_props['J']:.0f} mm^4")

    forces_module = planar_bending.calculate_bending_forces(
        positions, areas, Mx, My, centroid, section_props
    )

    print(f"\nForces in each fastener:")
    for i, force_kN in enumerate(forces_module):
        force_N = force_kN * 1000
        print(f"  Fastener {i+1}: Force = {force_N:.2f} N = {force_kN:.3f} kN")

    # Compare
    print("\n" + "-" * 70)
    print("COMPARISON:")
    print("-" * 70)

    max_diff = max(abs(forces_numpy[i] - forces_module[i]) for i in range(len(forces_numpy)))
    print(f"Maximum difference: {max_diff:.6f} kN")

    if max_diff < 0.001:  # 1 N tolerance
        print("[PASS] Forces match within tolerance")
        return True
    else:
        print("[FAIL] Forces do not match")
        return False


def test_pure_mx():
    """Test pure Mx bending"""

    print("\n" + "=" * 70)
    print("TEST: Pure Mx Bending")
    print("=" * 70)

    # 4 fasteners in a square
    positions = [
        (100, 100),
        (-100, 100),
        (-100, -100),
        (100, -100)
    ]

    # Equal areas
    d = 16  # mm
    area = np.pi * (d/2)**2
    areas = [area] * 4

    # Pure Mx moment (causes tension on +y side)
    Mx = 10.0  # kNm
    My = 0.0

    print(f"\nInputs:")
    print(f"  Fastener positions: {positions}")
    print(f"  Fastener diameter: {d} mm")
    print(f"  Mx = {Mx} kNm (tension on +y side)")
    print(f"  My = {My} kNm")

    centroid = planar_bending.calculate_centroid(positions, areas)
    section_props = planar_bending.calculate_section_properties(
        positions, areas, centroid
    )

    forces = planar_bending.calculate_bending_forces(
        positions, areas, Mx, My, centroid, section_props
    )

    print(f"\nForces:")
    for i, (pos, force) in enumerate(zip(positions, forces)):
        direction = "TENSION" if force > 0 else "COMPRESSION"
        print(f"  Fastener {i+1} at ({pos[0]:4.0f}, {pos[1]:4.0f}): {force:+8.3f} kN  {direction}")

    # Verify symmetry and signs for pure Mx
    # With square layout, Mx only creates forces based on y-position
    # Fasteners at same y should have same force magnitude but potentially different signs
    # Actually, with product of inertia Ixy=0 (symmetrical layout),
    # fasteners at same y-coordinate should have equal forces from Mx

    # For pure Mx, forces depend only on y-coordinate:
    # Fasteners 0,1 are at y=100 (should be equal)
    # Fasteners 2,3 are at y=-100 (should be equal)

    print(f"\n  forces[0] (100,100) = {forces[0]:.6f}")
    print(f"  forces[1] (-100,100) = {forces[1]:.6f}")
    print(f"  forces[2] (-100,-100) = {forces[2]:.6f}")
    print(f"  forces[3] (100,-100) = {forces[3]:.6f}")

    # Wait, for this symmetric case Ixy should be zero
    # But fasteners at opposite x still can have opposite forces if Ixy != 0
    # Let me check: for square centered at origin, Ixy = sum(x*y*A)
    # (100,100): 100*100 = 10000
    # (-100,100): -100*100 = -10000
    # (-100,-100): -100*-100 = 10000
    # (100,-100): 100*-100 = -10000
    # Sum = 0, so Ixy = 0

    # With Ixy=0, pure Mx creates equal forces on fasteners with same y
    assert abs(forces[0] - forces[1]) < 0.001, "Top fasteners should have equal force for symmetric layout"
    assert abs(forces[2] - forces[3]) < 0.001, "Bottom fasteners should have equal force for symmetric layout"
    assert forces[0] > 0, "Top fasteners should be in tension"
    assert forces[2] < 0, "Bottom fasteners should be in compression"

    print("\n[PASS] Pure Mx test passed")
    return True


def test_eccentric_axial():
    """Test eccentric axial load creating bending moments"""

    print("\n" + "=" * 70)
    print("TEST: Eccentric Axial Load")
    print("=" * 70)

    # 4 fasteners at corners
    positions = [
        (100, 100),
        (-100, 100),
        (-100, -100),
        (100, -100)
    ]

    d = 20  # mm
    area = np.pi * (d/2)**2
    areas = [area] * 4

    # Axial load applied eccentric to centroid
    N = 100.0  # kN
    load_point = (50.0, 30.0)  # mm (eccentric)
    centroid = (0.0, 0.0)  # at origin

    print(f"\nInputs:")
    print(f"  Axial load N = {N} kN")
    print(f"  Load applied at: {load_point} mm")
    print(f"  Centroid at: {centroid} mm")

    # Calculate eccentricity moments
    ecc_moments = planar_bending.calculate_eccentricity_moments(
        N=N,
        Vx=0,
        Vy=0,
        load_point=load_point,
        centroid=centroid
    )

    print(f"\nEccentricity moments:")
    print(f"  Mx_ecc = {ecc_moments['Mx_ecc']:.3f} kNm")
    print(f"  My_ecc = {ecc_moments['My_ecc']:.3f} kNm")
    print(f"  Mz_ecc = {ecc_moments['Mz_ecc']:.3f} kNm")

    # Expected: Mx = N × ey = 100 × 30 / 1000 = 3.0 kNm
    #           My = N × ex = 100 × 50 / 1000 = 5.0 kNm

    assert abs(ecc_moments['Mx_ecc'] - 3.0) < 0.001, "Mx_ecc should be 3.0 kNm"
    assert abs(ecc_moments['My_ecc'] - 5.0) < 0.001, "My_ecc should be 5.0 kNm"

    # Use full distribution function
    distribution = planar_bending.distribute_loads_with_bending(
        positions=positions,
        areas=areas,
        N=N,
        Vx=0,
        Vy=0,
        Mx=0,  # Will be added by eccentricity
        My=0,
        Mz=0,
        load_point=load_point,
        application_type='point'
    )

    print(f"\nFastener forces:")
    for data in distribution:
        print(f"  Fastener {data['fastener_id']} at ({data['x']:4.0f}, {data['y']:4.0f}):")
        print(f"    N_direct = {data['N_direct']:+7.3f} kN")
        print(f"    N_Mx     = {data['N_Mx']:+7.3f} kN")
        print(f"    N_My     = {data['N_My']:+7.3f} kN")
        print(f"    N_total  = {data['N']:+7.3f} kN")

    print("\n[PASS] Eccentric axial load test passed")
    return True


if __name__ == '__main__':
    all_passed = True

    try:
        if not test_example_case():
            all_passed = False
    except Exception as e:
        print(f"\n[FAIL] Example case test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False

    try:
        if not test_pure_mx():
            all_passed = False
    except Exception as e:
        print(f"\n[FAIL] Pure Mx test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False

    try:
        if not test_eccentric_axial():
            all_passed = False
    except Exception as e:
        print(f"\n[FAIL] Eccentric axial test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False

    print("\n" + "=" * 70)
    if all_passed:
        print("ALL TESTS PASSED [PASS]")
    else:
        print("SOME TESTS FAILED [FAIL]")
    print("=" * 70)
