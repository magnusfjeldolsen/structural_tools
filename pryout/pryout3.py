#%%
# ============================================================
# EC2-1-4 Pry-Out Resistance of Shear Stud Groups
# Elastic shear + torsion distribution with plots and diameter warnings
# ============================================================

import math
from typing import List, Tuple
import matplotlib.pyplot as plt

# ------------------------------------------------------------
# Stud definition
# ------------------------------------------------------------
class Stud:
    def __init__(self, x: float, y: float):
        """
        Stud coordinates relative to group centroid [mm]
        """
        self.x = x
        self.y = y
        self.Vx = 0.0  # kN
        self.Vy = 0.0  # kN
        self.Vres = 0.0  # kN

# ------------------------------------------------------------
# Stud group with elastic force distribution
# ------------------------------------------------------------
class StudGroup:
    def __init__(self, studs: List[Stud]):
        self.studs = studs
        self.n = len(studs)

    def polar_moment(self) -> float:
        """
        Polar moment J = Σ(x² + y²) [mm²]
        """
        return sum(stud.x ** 2 + stud.y ** 2 for stud in self.studs)

    def apply_actions(self, Vx: float, Vy: float, Mz: float):
        """
        Apply shear forces and torsional moment
        Vx, Vy in kN
        Mz in kNm
        """
        J = self.polar_moment()
        if J <= 0.0:
            raise ValueError("Polar moment must be greater than zero")

        # Convert moment to kNmm
        Mz_kNmm = Mz * 1000.0  # correct unit conversion

        # Direct shear distribution
        for stud in self.studs:
            stud.Vx = Vx / self.n
            stud.Vy = Vy / self.n

        # Torsional shear distribution
        for stud in self.studs:
            Vtx = -Mz_kNmm * stud.y / J
            Vty =  Mz_kNmm * stud.x / J

            stud.Vx += Vtx
            stud.Vy += Vty

        # Resultant shear per stud
        for stud in self.studs:
            stud.Vres = math.sqrt(stud.Vx ** 2 + stud.Vy ** 2)

# ------------------------------------------------------------
# EC2-1-4 Pry-out resistance model with stud diameter warnings
# ------------------------------------------------------------
class PryOutEC2:
    def __init__(
        self,
        fck: float,        # MPa
        hef: float,        # mm
        d: float,          # stud diameter mm
        edge_dist: float,  # mm (minimum)
        spacing: float,    # mm (minimum)
        n: int,
        gamma_Mc: float = 1.5,
        k_cp: float = 1.0
    ):
        self.fck = fck
        self.hef = hef
        self.d = d
        self.edge_dist = edge_dist
        self.spacing = spacing
        self.n = n
        self.gamma_Mc = gamma_Mc
        self.k_cp = k_cp

        # Warn user if spacing or edge distance < EC2 recommendations
        self._check_spacing_edge()

    def _check_spacing_edge(self):
        s_min = max(3 * self.d, 100.0)
        c_min = max(1.5 * self.hef, 2 * self.d)

        if self.spacing < s_min:
            print(f"Warning: Stud spacing ({self.spacing} mm) < recommended minimum ({s_min} mm)")
        if self.edge_dist < c_min:
            print(f"Warning: Edge distance ({self.edge_dist} mm) < recommended minimum ({c_min} mm)")

    def psi_edge(self) -> float:
        c_cr = 1.5 * self.hef
        return min(1.0, (self.edge_dist / c_cr) ** 1.5)

    def psi_spacing(self) -> float:
        s_cr = 3.0 * self.hef
        return min(1.0, (self.spacing / s_cr) ** 1.5)

    def psi_group(self) -> float:
        return 1.0 / math.sqrt(self.n)

    def characteristic_cone_resistance(self) -> float:
        """
        N_Rk,c0 [kN]
        """
        return 7.2 * math.sqrt(self.fck) * self.hef ** 1.5 / 1000.0

    def design_pryout_resistance(self) -> float:
        """
        V_Rd,cp per stud [kN]
        """
        N_Rk_c0 = self.characteristic_cone_resistance()

        psi = self.psi_edge() * self.psi_spacing() * self.psi_group()
        N_Rk_c = N_Rk_c0 * psi
        N_Rd_c = N_Rk_c / self.gamma_Mc
        return self.k_cp * N_Rd_c

# ------------------------------------------------------------
# High-level calculator interface
# ------------------------------------------------------------
class PryOutCalculator:
    def __init__(
        self,
        stud_coords: List[Tuple[float, float]],
        fck: float,
        hef: float,
        d: float,
        edge_dist: float,
        spacing: float
    ):
        self.studs = [Stud(x, y) for x, y in stud_coords]
        self.group = StudGroup(self.studs)
        self.pryout = PryOutEC2(
            fck=fck,
            hef=hef,
            d=d,
            edge_dist=edge_dist,
            spacing=spacing,
            n=len(self.studs)
        )

    def run(self, Vx: float, Vy: float, Mz: float):
        """
        Vx, Vy in kN
        Mz in kNm
        """
        self.group.apply_actions(Vx, Vy, Mz)
        V_Rd_cp = self.pryout.design_pryout_resistance()

        results = []
        for i, stud in enumerate(self.studs):
            results.append({
                "stud": i + 1,
                "x_mm": stud.x,
                "y_mm": stud.y,
                "Vx_kN": stud.Vx,
                "Vy_kN": stud.Vy,
                "Vres_kN": stud.Vres,
                "V_Rd_cp_kN": V_Rd_cp,
                "utilization": stud.Vres / V_Rd_cp
            })
        return results

# ------------------------------------------------------------
# Plotting functions
# ------------------------------------------------------------
def plot_stud_geometry(studs, edge_dist):
    fig, ax = plt.subplots()
    ax.set_aspect("equal")

    xs = [s.x for s in studs]
    ys = [s.y for s in studs]
    ax.scatter(xs, ys, s=80, zorder=3, color="blue")

    for i, s in enumerate(studs):
        ax.text(s.x + 5, s.y + 5, f"{i+1}")

    # Concrete edges (rectangular)
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    ex_min = xmin - edge_dist
    ex_max = xmax + edge_dist
    ey_min = ymin - edge_dist
    ey_max = ymax + edge_dist
    ax.plot([ex_min, ex_max, ex_max, ex_min, ex_min],
            [ey_min, ey_min, ey_max, ey_max, ey_min],
            linestyle="--", color="black")

    # Coordinate axes
    ax.arrow(0, 0, 40, 0, head_width=5, color="red", length_includes_head=True)
    ax.arrow(0, 0, 0, 40, head_width=5, color="green", length_includes_head=True)
    ax.text(42, 0, "x")
    ax.text(0, 42, "y")

    ax.set_xlabel("x [mm]")
    ax.set_ylabel("y [mm]")
    ax.set_title("Stud layout and concrete edges")
    plt.grid(True)
    plt.show()


def plot_stud_forces(studs, Vx, Vy, Mz):
    fig, ax = plt.subplots()
    ax.set_aspect("equal")

    # Stud positions
    for s in studs:
        ax.scatter(s.x, s.y, s=80, color="blue")

    # Resultant resisting forces per stud
    scale = 10  # visualization scale
    for s in studs:
        ax.arrow(s.x, s.y, -s.Vx * scale, -s.Vy * scale,
                 head_width=4, color="orange", length_includes_head=True)

    # Applied shear at centroid
    ax.arrow(0, 0, Vx * scale, Vy * scale, head_width=6,
             color="red", length_includes_head=True)
    ax.text(Vx * scale, Vy * scale, "V")

    # Moment indication (circle)
    circle = plt.Circle((0, 0), 30, fill=False, color="purple", linestyle="--")
    ax.add_patch(circle)
    ax.text(30, 30, f"Mz = {Mz} kNm")

    # Coordinate axes
    ax.arrow(0, 0, 40, 0, head_width=5, color="red", length_includes_head=True)
    ax.arrow(0, 0, 0, 40, head_width=5, color="green", length_includes_head=True)
    ax.text(42, 0, "x")
    ax.text(0, 42, "y")

    ax.set_xlabel("x [mm]")
    ax.set_ylabel("y [mm]")
    ax.set_title("Applied and resisting forces on studs")
    plt.grid(True)
    plt.show()

def plot_stud_forces(studs, Vx, Vy, Mz, annotate_forces: bool = False, decimals: int = 1,scale: float = 10):
    """
    Plot applied shear/moment and resulting resisting forces on studs.

    Parameters
    ----------
    studs : list of Stud
    Vx : float : applied shear in x [kN]
    Vy : float : applied shear in y [kN]
    Mz : float : applied moment about centroid [kNm]
    annotate_forces : bool : if True, annotate each stud with its Vres [kN]
    decimals : int : number of decimals for annotation
    """
    fig, ax = plt.subplots()
    ax.set_aspect("equal")

    # Plot studs
    for s in studs:
        ax.scatter(s.x, s.y, s=80, color="blue")

    # Resultant resisting forces per stud
    
    for s in studs:
        ax.arrow(
            s.x, s.y,
            -s.Vx * scale, -s.Vy * scale,
            head_width=4, color="orange", length_includes_head=True
        )
        if annotate_forces:
            ax.text(s.x + 2, s.y + 2, f"{s.Vres:.{decimals}f} kN", color="orange")

    # Applied shear at centroid
    ax.arrow(0, 0, Vx * scale, Vy * scale, head_width=6,
             color="red", length_includes_head=True)
    ax.text(Vx * scale, Vy * scale, "V")

    # Moment indication (circle)
    circle = plt.Circle((0, 0), 30, fill=False, color="purple", linestyle="--")
    ax.add_patch(circle)
    ax.text(30, 30, f"Mz = {Mz} kNm")

    # Coordinate axes
    ax.arrow(0, 0, 40, 0, head_width=5, color="red", length_includes_head=True)
    ax.arrow(0, 0, 0, 40, head_width=5, color="green", length_includes_head=True)
    ax.text(42, 0, "x")
    ax.text(0, 42, "y")

    ax.set_xlabel("x [mm]")
    ax.set_ylabel("y [mm]")
    ax.set_title("Applied and resisting forces on studs")
    plt.grid(True)
    plt.show()


#%% 
# ============================================================
# Example calculation
# ============================================================

if __name__ == "__main__":

    # 2x2 stud group (coordinates in mm, relative to centroid)
    stud_coordinates = [
        (90,420),
        (90,1710),
        ( 420, 90),
        ( 420,  2070),
        (2580,90),
        (2580,2070),
        (2910,420),
        (2910,1710)
    ]

    stud_diameter = 12.0  # mm

    calculator = PryOutCalculator(
        stud_coords=stud_coordinates,
        fck=35.0,           # MPa (C30/37)
        hef=150.0,          # mm
        d=stud_diameter,    # mm
        edge_dist=1000.0,    # mm
        spacing=1000.0       # mm
    )

    # Applied actions
    Vx = 0.0   # kN
    Vy = 0.0   # kN
    Mz = 140.0   # kNm

    results = calculator.run(Vx=Vx, Vy=Vy, Mz=Mz)

    print("EC2-1-4 Pry-out check results:\n")
    for r in results:
        print(
            f"Stud {r['stud']}: "
            f"Vres = {r['Vres_kN']:.2f} kN, "
            f"V_Rd,cp = {r['V_Rd_cp_kN']:.2f} kN, "
            f"Utilization = {r['utilization']:.2f}"
        )

    # Plot geometry and forces
    plot_stud_geometry(calculator.studs, edge_dist=100)
    plot_stud_forces(calculator.studs, Vx=Vx, Vy=Vy, Mz=Mz,
                     annotate_forces=True,decimals=1,scale=100)

# %%
