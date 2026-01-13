#%%
# ============================================================
# EC2-1-4 Pry-Out Resistance of Shear Stud Groups
# Elastic shear + torsion distribution
# ============================================================

import math
from typing import List, Tuple


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
        Mz_kNmm = Mz * 1000.0

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
# EC2-1-4 Pry-out resistance model
# ------------------------------------------------------------
class PryOutEC2:
    def __init__(
        self,
        fck: float,        # MPa
        hef: float,        # mm
        edge_dist: float,  # mm (minimum)
        spacing: float,    # mm (minimum)
        n: int,
        gamma_Mc: float = 1.5,
        k_cp: float = 1.0
    ):
        self.fck = fck
        self.hef = hef
        self.edge_dist = edge_dist
        self.spacing = spacing
        self.n = n
        self.gamma_Mc = gamma_Mc
        self.k_cp = k_cp

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

        psi = (
            self.psi_edge()
            * self.psi_spacing()
            * self.psi_group()
        )

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
        edge_dist: float,
        spacing: float
    ):
        self.studs = [Stud(x, y) for x, y in stud_coords]
        self.group = StudGroup(self.studs)
        self.pryout = PryOutEC2(
            fck=fck,
            hef=hef,
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


#%%
# ============================================================
# Example calculation (VS Code cell)
# ============================================================

if __name__ == "__main__":

    # 2x2 stud group (coordinates in mm, relative to centroid)
    stud_coordinates = [
        (-60, -60),
        ( 60, -60),
        ( 60,  60),
        (-60,  60)
    ]

    calculator = PryOutCalculator(
        stud_coords=stud_coordinates,
        fck=30.0,        # MPa (C30/37)
        hef=100.0,       # mm
        edge_dist=100.0, # mm
        spacing=120.0    # mm
    )

    # Applied actions
    Vx = 40.0   # kN
    Vy = 20.0   # kN
    Mz = 10.0   # kNm

    results = calculator.run(Vx=Vx, Vy=Vy, Mz=Mz)

    print("EC2-1-4 Pry-out check results:\n")
    for r in results:
        print(
            f"Stud {r['stud']}: "
            f"Vres = {r['Vres_kN']:.2f} kN, "
            f"V_Rd,cp = {r['V_Rd_cp_kN']:.2f} kN, "
            f"Utilization = {r['utilization']:.2f}"
        )

# %%
