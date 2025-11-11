import math

steel_weld_data = {
    "steel_grade": {
        "S235": {"f_y": 235, "f_u": 360, "beta_w": 0.8},
        "S275": {"f_y": 275, "f_u": 430, "beta_w": 0.85},
        "S355": {"f_y": 355, "f_u": 510, "beta_w": 0.9},
        "S420": {"f_y": 420, "f_u": 520, "beta_w": 1.0},
        "S460": {"f_y": 460, "f_u": 550, "beta_w": 1.0},
        }
}

def weld_stress_parallell_force(F, a, l):
    """Calculate the stress in a weld subjected to a force parallel to the weld line.

    Args:
        F (float): Applied force (N).
        a (float): Throat thickness of the weld (mm).
        l (float): Length of the weld (mm).

    Returns:
        float: Stress in the weld (N/mm² or MPa).
    """
    A = a * l  # Effective area of the weld
    sigma_orthogonal = 0
    tau_orthagonal = 0
    tau_parallell = F / A

    sigma_weld = [sigma_orthogonal, tau_orthagonal, tau_parallell]
    return sigma_weld

def weld_stress_perpendicular_force(F, a, l):
    """Calculate the stress in a weld subjected to a force perpendicular to the weld line.

    Args:
        F (float): Applied force (N).
        a (float): Throat thickness of the weld (mm).
        l (float): Length of the weld (mm).

    Returns:
        float: Stress in the weld (N/mm² or MPa).
    """
    A = a * l  # Effective area of the weld
    sigma_orthogonal = F/(math.sqrt(2)*A)
    tau_orthagonal = F/(math.sqrt(2)*A)
    tau_parallell = 0

    sigma_weld = [sigma_orthogonal, tau_orthagonal, tau_parallell]
    return sigma_weld

def weld_stress_moment(M,a,l):
    """Calculate the stress in a weld subjected to a moment.

    Args:
        M (float): Applied moment (Nmm).
        a (float): Throat thickness of the weld (mm).
        l (float): Length of the weld (mm).

    Returns:
        float: Stress in the weld (N/mm² or MPa).
    """

    I_weld = (a * l**3) / 12  # Moment of inertia of the weld
    sigma_orthogonal = M / (math.sqrt(2) * I_weld) * (l / 2)
    tau_orthagonal = M / (math.sqrt(2) * I_weld) * (l / 2)
    tau_parallell = 0

    sigma_weld = [sigma_orthogonal, tau_orthagonal, tau_parallell]
    return sigma_weld

# create a function for combined weld stress from N, V and M
def weld_stress_combined(N, V, M, a, l):
    """Calculate the combined stress in a weld subjected to normal force, shear force and moment.

    Args:
        N (float): Normal force (N).
        V (float): Shear force (N).
        M (float): Moment (Nmm).
        a (float): Throat thickness of the weld (mm).
        l (float): Length of the weld (mm).

    Returns:
        float: Combined stress in the weld (N/mm² or MPa).
    """
    A = a * l  # Effective area of the weld
    I_weld = (a * l**3) / 12  # Moment of inertia of the weld

    sigma_orthogonal_N = N/(math.sqrt(2)*A)
    tau_orthagonal_N = N/(math.sqrt(2)*A)
    tau_parallell_N = 0

    sigma_orthogonal_V = V/(math.sqrt(2)*A)
    tau_orthagonal_V = V/(math.sqrt(2)*A)
    tau_parallell_V = 0

    sigma_orthogonal_M = M / (math.sqrt(2) * I_weld) * (l / 2)
    tau_orthagonal_M = M / (math.sqrt(2) * I_weld) * (l / 2)
    tau_parallell_M = 0

    sigma_orthogonal = sigma_orthogonal_N + sigma_orthogonal_V + sigma_orthogonal_M
    tau_orthagonal = tau_orthagonal_N + tau_orthagonal_V + tau_orthagonal_M
    tau_parallell = tau_parallell_N + tau_parallell_V + tau_parallell_M

    sigma_weld = [sigma_orthogonal, tau_orthagonal, tau_parallell]
    return sigma_weld

def sigma_mises(sigma_weld):
    """Calculate the von Mises stress from the weld stress components.

    Args:
        sigma_weld (list): List containing the weld stress components [sigma_orthogonal, tau_orthagonal, tau_parallell].

    Returns:
        float: Von Mises stress (N/mm² or MPa).
    """
    sigma_orthogonal, tau_orthagonal, tau_parallell = sigma_weld

    sigma_von_mises = math.sqrt(sigma_orthogonal**2 + 3*tau_orthagonal**2 + 3*tau_parallell**2)
    return sigma_von_mises

if __name__=="__main__":
    V_weld = 100000 #N
    N_weld = 100000 #N
    M_weld = 10e6 #Nmm
    a_weld = 5 #mm
    l_weld = 100 #mm

    print(f"V_weld = {V_weld} N")
    print(f"N_weld = {N_weld} N")
    print(f"M_weld = {M_weld} Nmm")
    print(f"a_weld = {a_weld} mm")
    print(f"l_weld = {l_weld} mm")
    print("Weld stresses (sigma_orthogonal, tau_orthagonal, tau_parallell) in MPa:")

    print(f"Weld stresses for V_weld = {V_weld} N: {weld_stress_parallell_force(V_weld, a_weld, l_weld)}")
    print(f"Weld stresses for N_weld = {N_weld} N: {weld_stress_perpendicular_force(N_weld, a_weld, l_weld)}")
    print(f"Weld stresses for M_weld = {M_weld} Nmm: {weld_stress_moment(M_weld, a_weld, l_weld)}")
    print(f"Combined weld stresses for V_weld = {V_weld} N, N_weld = {N_weld} N and M_weld = {M_weld} Nmm: {weld_stress_combined(N_weld, V_weld, M_weld, a_weld, l_weld)}")
    print(f"Von Mises stress for combined weld stresses: {sigma_mises(weld_stress_combined(N_weld, V_weld, M_weld, a_weld, l_weld))} MPa")

