"""
Planar bending calculations for fastener groups

Handles bending moments Mx (about x-axis) and My (about y-axis) that cause
axial forces (tension/compression) in fasteners.

Standard: Based on elastic beam theory and discrete inertia approach
"""

import numpy as np
from typing import List, Tuple, Dict


def calculate_centroid(positions: List[Tuple[float, float]],
                       areas: List[float]) -> Tuple[float, float]:
    """
    Calculate centroid of fastener group

    Args:
        positions: List of (x, y) coordinates [mm]
        areas: List of fastener areas [mm²]

    Returns:
        (xc, yc): Centroid coordinates [mm]

    Formula:
        xc = Σ(Ai × xi) / ΣAi
        yc = Σ(Ai × yi) / ΣAi
    """
    if not positions or not areas:
        return (0.0, 0.0)

    positions = np.array(positions)
    areas = np.array(areas)

    total_area = np.sum(areas)
    if total_area == 0:
        return (0.0, 0.0)

    xc = np.sum(areas * positions[:, 0]) / total_area
    yc = np.sum(areas * positions[:, 1]) / total_area

    return (float(xc), float(yc))


def calculate_section_properties(
    positions: List[Tuple[float, float]],
    areas: List[float],
    centroid: Tuple[float, float]
) -> Dict[str, float]:
    """
    Calculate section properties (moments of inertia) for fastener group

    Args:
        positions: List of (x, y) coordinates [mm]
        areas: List of fastener areas [mm²]
        centroid: (xc, yc) centroid position [mm]

    Returns:
        Dictionary with:
            'Ix': Moment of inertia about x-axis [mm⁴]
            'Iy': Moment of inertia about y-axis [mm⁴]
            'Ixy': Product of inertia [mm⁴]
            'J': Polar moment of inertia [mm⁴]

    Formulas (discrete inertia):
        Ix = Σ(yi² × Ai)   - resistance to bending about x-axis
        Iy = Σ(xi² × Ai)   - resistance to bending about y-axis
        Ixy = Σ(xi × yi × Ai) - coupling term
        J = Ix + Iy        - polar moment for torsion

    Where xi, yi are distances from centroid

    Note:
        - Positive Mx causes tension on +y side (top)
        - Positive My causes tension on +x side (right)
    """
    if not positions or not areas:
        return {'Ix': 0.0, 'Iy': 0.0, 'Ixy': 0.0, 'J': 0.0}

    positions = np.array(positions)
    areas = np.array(areas)
    xc, yc = centroid

    # Distances from centroid
    x = positions[:, 0] - xc
    y = positions[:, 1] - yc

    # Calculate moments of inertia
    Ix = np.sum(y**2 * areas)
    Iy = np.sum(x**2 * areas)
    Ixy = np.sum(x * y * areas)
    J = Ix + Iy  # Polar moment

    return {
        'Ix': float(Ix),
        'Iy': float(Iy),
        'Ixy': float(Ixy),
        'J': float(J)
    }


def calculate_bending_forces(
    positions: List[Tuple[float, float]],
    areas: List[float],
    Mx: float,
    My: float,
    centroid: Tuple[float, float],
    section_props: Dict[str, float]
) -> List[float]:
    """
    Calculate axial forces in fasteners due to bending moments Mx and My

    Args:
        positions: List of (x, y) coordinates [mm]
        areas: List of fastener areas [mm²]
        Mx: Bending moment about x-axis [kNm]
        My: Bending moment about y-axis [kNm]
        centroid: (xc, yc) centroid position [mm]
        section_props: Dictionary with Ix, Iy, Ixy [mm⁴]

    Returns:
        List of axial forces (tension +, compression -) [kN]

    Theory:
        The bending stress at position (x, y) is calculated using:

        σ = [x, y] @ I_inv @ [Mx, My]

        Where I_inv is the inverse of the inertia matrix:
        I = [[Ix,  Ixy],
             [Ixy, Iy ]]

        Force in each fastener: Fi = σi × Ai

    Sign Convention:
        - Positive Mx: Bending about x-axis (tension on +y side, compression on -y)
        - Positive My: Bending about y-axis (tension on +x side, compression on -x)
        - Positive force: Tension (↑)
        - Negative force: Compression (↓)
    """
    if not positions or not areas:
        return []

    n = len(positions)
    if Mx == 0 and My == 0:
        return [0.0] * n

    positions = np.array(positions)
    areas = np.array(areas)
    xc, yc = centroid

    # Distances from centroid
    x = positions[:, 0] - xc  # mm
    y = positions[:, 1] - yc  # mm

    # Get section properties
    Ix = section_props['Ix']
    Iy = section_props['Iy']
    Ixy = section_props['Ixy']

    # Check if section has bending resistance
    det = Ix * Iy - Ixy**2
    if abs(det) < 1e-10:
        # Degenerate case (all fasteners on a line)
        return [0.0] * n

    # Construct inertia matrix and its inverse
    I_matrix = np.array([[Ix, Ixy],
                         [Ixy, Iy]])

    I_inv = np.linalg.inv(I_matrix)

    # Convert moments to N·mm for calculation
    Mx_Nmm = Mx * 1e6  # kNm → Nmm
    My_Nmm = My * 1e6  # kNm → Nmm

    # Build moment vector
    # Due to the [y, x] position vector formulation (line 187), we need to negate My
    # to achieve correct sign convention: positive My → tension at left, compression at right
    M = np.array([Mx_Nmm, -My_Nmm])

    # Calculate stress (N/mm²) and force (N) at each fastener
    forces = []
    for i in range(n):
        # IMPORTANT: Mx creates stress prop to y, My creates stress prop to x
        # Position vector is [y, x] NOT [x, y]!
        pos_vec = np.array([y[i], x[i]])

        # Stress at this position: σ = [y, x] @ I_inv @ [Mx, My]
        # This gives: σ = y*(I_inv[0,0]*Mx + I_inv[0,1]*My) + x*(I_inv[1,0]*Mx + I_inv[1,1]*My)
        stress = pos_vec @ I_inv @ M  # N/mm²

        # Force = stress × area
        force_N = stress * areas[i]  # N
        force_kN = force_N / 1000.0  # kN

        forces.append(float(force_kN))

    return forces


def verify_torsion_forces(
    positions: List[Tuple[float, float]],
    centroid: Tuple[float, float],
    Vx_torsion_list: List[float],
    Vy_torsion_list: List[float],
    Mz: float,
    tolerance: float = 1e-6
) -> Dict[str, any]:
    """
    Verify torsional force calculations according to technical notes (torsion.md)

    Args:
        positions: List of (x, y) fastener coordinates [mm]
        centroid: (xc, yc) centroid position [mm]
        Vx_torsion_list: List of x-component torsional forces [kN]
        Vy_torsion_list: List of y-component torsional forces [kN]
        Mz: Applied torsional moment [kNm]
        tolerance: Tolerance for verification checks

    Returns:
        Dictionary with verification results:
            'perpendicularity_passed': bool
            'force_equilibrium_passed': bool
            'moment_recovery_passed': bool
            'perpendicularity_errors': List[float]
            'force_sum': Tuple[float, float]
            'moment_recovered': float

    Verification checks from technical notes section 10:
        1. Perpendicularity: Fx_i * x_i + Fy_i * y_i = 0
        2. Force equilibrium: Σ(Fx_i) = 0, Σ(Fy_i) = 0
        3. Moment recovery: Σ(x_i * Fy_i - y_i * Fx_i) = Mz
    """
    if not positions or Mz == 0:
        return {
            'perpendicularity_passed': True,
            'force_equilibrium_passed': True,
            'moment_recovery_passed': True,
            'perpendicularity_errors': [],
            'force_sum': (0.0, 0.0),
            'moment_recovered': 0.0
        }

    xc, yc = centroid
    n = len(positions)

    # Check 1: Perpendicularity (forces perpendicular to radius)
    perpendicularity_errors = []
    for i in range(n):
        x_i = positions[i][0] - xc  # mm
        y_i = positions[i][1] - yc  # mm
        Fx_i = Vx_torsion_list[i] * 1000.0  # kN → N
        Fy_i = Vy_torsion_list[i] * 1000.0  # kN → N

        # Dot product should be zero
        dot_product = Fx_i * x_i + Fy_i * y_i
        perpendicularity_errors.append(abs(dot_product))

    perp_passed = all(err < tolerance * 1e6 for err in perpendicularity_errors)  # Scale tolerance for N·mm

    # Check 2: Force equilibrium
    sum_Fx = sum(Vx_torsion_list)  # kN
    sum_Fy = sum(Vy_torsion_list)  # kN
    force_sum = (sum_Fx, sum_Fy)

    force_eq_passed = (abs(sum_Fx) < tolerance and abs(sum_Fy) < tolerance)

    # Check 3: Moment recovery
    moment_sum = 0.0
    for i in range(n):
        x_i = positions[i][0] - xc  # mm
        y_i = positions[i][1] - yc  # mm
        Fx_i = Vx_torsion_list[i]   # kN
        Fy_i = Vy_torsion_list[i]   # kN

        # Moment = x * Fy - y * Fx (in kN·mm)
        moment_sum += (x_i * Fy_i - y_i * Fx_i)

    moment_recovered = moment_sum / 1000.0  # kN·mm → kNm
    moment_passed = abs(moment_recovered - Mz) < tolerance

    return {
        'perpendicularity_passed': perp_passed,
        'force_equilibrium_passed': force_eq_passed,
        'moment_recovery_passed': moment_passed,
        'perpendicularity_errors': perpendicularity_errors,
        'force_sum': force_sum,
        'moment_recovered': float(moment_recovered)
    }


def calculate_eccentricity_moments(
    N: float,
    Vx: float,
    Vy: float,
    load_point: Tuple[float, float],
    centroid: Tuple[float, float]
) -> Dict[str, float]:
    """
    Calculate additional moments due to eccentric load application

    Args:
        N: Axial force (tension +) [kN]
        Vx: Shear force in x-direction [kN]
        Vy: Shear force in y-direction [kN]
        load_point: (xp, yp) load application point [mm]
        centroid: (xc, yc) centroid of fastener group [mm]

    Returns:
        Dictionary with additional moments:
            'Mx_ecc': Additional moment about x-axis [kNm]
            'My_ecc': Additional moment about y-axis [kNm]
            'Mz_ecc': Additional torsional moment [kNm]

    Formulas:
        ex = xp - xc  (eccentricity in x)
        ey = yp - yc  (eccentricity in y)

        Mx += N × ey / 1000 + Vz × ex / 1000  (for vertical shear)
        My += N × ex / 1000 + Vz × ey / 1000  (for vertical shear)
        Mz += Vx × ey / 1000 - Vy × ex / 1000

    Note:
        - If N applied with eccentricity → creates Mx and My
        - If Vx, Vy applied with eccentricity → creates Mz (torsion)
        - Vertical shear would create additional Mx, My (not considered here)
    """
    xp, yp = load_point
    xc, yc = centroid

    # Eccentricities [mm]
    ex = xp - xc
    ey = yp - yc

    # Additional moments from eccentricity
    # N × e creates bending moment
    Mx_ecc = N * ey / 1000.0  # kN × mm / 1000 → kNm
    My_ecc = N * ex / 1000.0  # kN × mm / 1000 → kNm

    # Horizontal shear forces with eccentricity create torsion
    Mz_ecc = (Vx * ey - Vy * ex) / 1000.0  # kNm

    return {
        'Mx_ecc': float(Mx_ecc),
        'My_ecc': float(My_ecc),
        'Mz_ecc': float(Mz_ecc)
    }


def distribute_loads_with_bending(
    positions: List[Tuple[float, float]],
    areas: List[float],
    N: float,
    Vx: float,
    Vy: float,
    Mx: float,
    My: float,
    Mz: float,
    load_point: Tuple[float, float] = None,
    application_type: str = 'centroid'
) -> List[Dict[str, float]]:
    """
    Complete load distribution including bending moments Mx, My

    Args:
        positions: List of (x, y) fastener coordinates [mm]
        areas: List of fastener areas [mm²]
        N: Axial force (tension +) [kN]
        Vx: Shear force in x-direction [kN]
        Vy: Shear force in y-direction [kN]
        Mx: Bending moment about x-axis [kNm]
        My: Bending moment about y-axis [kNm]
        Mz: Torsional moment (about z-axis) [kNm]
        load_point: (xp, yp) load application point [mm]
        application_type: 'centroid' or 'point'

    Returns:
        List of dictionaries with forces per fastener:
            {
                'fastener_id': int,
                'x': float,
                'y': float,
                'N': float (total axial) [kN],
                'N_direct': float (from N/n),
                'N_Mx': float (from Mx bending),
                'N_My': float (from My bending),
                'Vx': float (total shear x) [kN],
                'Vx_direct': float,
                'Vx_torsion': float,
                'Vy': float (total shear y) [kN],
                'Vy_direct': float,
                'Vy_torsion': float,
                'V_total': float (resultant shear),
            }
    """
    if not positions or not areas:
        return []

    n = len(positions)

    # Calculate centroid
    centroid = calculate_centroid(positions, areas)
    xc, yc = centroid

    # Determine load application point
    if application_type == 'point' and load_point is not None:
        xp, yp = load_point
    else:
        xp, yp = xc, yc

    # Calculate additional moments from eccentricity
    ecc_moments = calculate_eccentricity_moments(N, Vx, Vy, (xp, yp), centroid)

    # Total moments (applied + eccentric)
    Mx_total = Mx + ecc_moments['Mx_ecc']
    My_total = My + ecc_moments['My_ecc']
    Mz_total = Mz + ecc_moments['Mz_ecc']

    # Calculate section properties
    section_props = calculate_section_properties(positions, areas, centroid)

    # Calculate bending forces from Mx and My
    N_bending = calculate_bending_forces(
        positions, areas, Mx_total, My_total, centroid, section_props
    )

    # Prepare result
    distribution = []

    for i in range(n):
        x, y = positions[i]
        dx = x - xc
        dy = y - yc

        # AXIAL FORCES (Tension/Compression)
        N_direct = N / n
        N_Mx = N_bending[i] if i < len(N_bending) else 0.0

        # Split bending contribution (for display)
        # This is approximate - actual implementation uses combined matrix
        if Mx_total != 0 or My_total != 0:
            # Recalculate individual contributions for display
            if Mx_total != 0:
                N_from_Mx_only = calculate_bending_forces(
                    positions, areas, Mx_total, 0.0, centroid, section_props
                )[i]
            else:
                N_from_Mx_only = 0.0

            if My_total != 0:
                N_from_My_only = calculate_bending_forces(
                    positions, areas, 0.0, My_total, centroid, section_props
                )[i]
            else:
                N_from_My_only = 0.0
        else:
            N_from_Mx_only = 0.0
            N_from_My_only = 0.0

        N_total = N_direct + N_Mx

        # SHEAR FORCES
        # Convention: All forces returned as REACTIONS (what fasteners provide)
        # This means we negate applied loads to show fastener reactions
        Vx_direct = Vx / n  # Applied load per fastener
        Vy_direct = Vy / n  # Applied load per fastener

        # Torsional shear from Mz
        # Following technical notes: torsion.md
        #
        # For +Mz (counter-clockwise when viewed from +z):
        #   F_i = (Mz * r_i) / Σ(r_j²)
        #   Fx_i = -F_i * (y_i / r_i)
        #   Fy_i = +F_i * (x_i / r_i)
        #
        # Where:
        #   - x_i, y_i are distances from centroid
        #   - r_i = sqrt(x_i² + y_i²)
        #   - Technical notes formulas give resisting forces (fastener reactions)
        sum_r_squared = sum([(positions[j][0] - centroid[0])**2 + (positions[j][1] - centroid[1])**2
                             for j in range(len(positions))])
        if sum_r_squared > 0 and Mz_total != 0:
            Mz_Nmm = Mz_total * 1e6  # kNm → Nmm

            # Distance from centroid
            r_i = (dx**2 + dy**2)**0.5  # mm

            if r_i > 0:
                # Torsional force magnitude at this fastener
                F_i_N = (Mz_Nmm * r_i) / sum_r_squared  # N

                # DEBUG OUTPUT (remove after testing)
                if i == 0:  # Only print for first fastener
                    print(f"DEBUG Torsion: Mz={Mz_total} kNm, r_i={r_i:.2f} mm, sum_r²={sum_r_squared:.0f} mm², F_i={F_i_N:.2f} N")

                # Force components (for +Mz, CCW)
                # Sign convention: these are resisting forces
                Vx_torsion = -F_i_N * (dy / r_i) / 1000.0  # kN
                Vy_torsion = +F_i_N * (dx / r_i) / 1000.0  # kN
            else:
                # Fastener at centroid has no torsional force
                Vx_torsion = 0.0
                Vy_torsion = 0.0
        else:
            Vx_torsion = 0.0
            Vy_torsion = 0.0

        # Total forces (sum direct + torsion)
        # Convention: Return forces as calculated
        # - Direct forces: applied loads (will need negation for reaction arrows)
        # - Torsion forces: resisting forces (will need negation for reaction arrows)
        Vx_total = Vx_direct + Vx_torsion
        Vy_total = Vy_direct + Vy_torsion
        V_resultant = (Vx_total**2 + Vy_total**2)**0.5

        distribution.append({
            'fastener_id': i + 1,
            'x': float(x),
            'y': float(y),
            'N': float(N_total),
            'N_direct': float(N_direct),
            'N_Mx': float(N_from_Mx_only),
            'N_My': float(N_from_My_only),
            'Vx': float(Vx_total),
            'Vx_direct': float(Vx_direct),
            'Vx_torsion': float(Vx_torsion),
            'Vy': float(Vy_total),
            'Vy_direct': float(Vy_direct),
            'Vy_torsion': float(Vy_torsion),
            'V_total': float(V_resultant)
        })

    return distribution