#%%
# ============================================================
# EC2-1-4 Pry-Out Resistance of Shear Stud Groups
# Elastic shear + torsion distribution with optional application point
# ============================================================

import math
from typing import List, Tuple
import matplotlib.pyplot as plt

# ------------------------------------------------------------
# Stud definition
# ------------------------------------------------------------
class Stud:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
        self.Vx = 0.0
        self.Vy = 0.0
        self.Vres = 0.0

# ------------------------------------------------------------
# Stud group with elastic force distribution
# ------------------------------------------------------------
class StudGroup:
    def __init__(self, studs: List[Stud]):
        self.studs = studs
        self.n = len(studs)

    def centroid(self) -> Tuple[float,float]:
        Xc = sum(s.x for s in self.studs) / self.n
        Yc = sum(s.y for s in self.studs) / self.n
        return Xc, Yc

    def polar_moment(self, Xc: float, Yc: float) -> float:
        return sum((s.x - Xc)**2 + (s.y - Yc)**2 for s in self.studs)

    def apply_actions(self, Vx: float, Vy: float, Mz: float,
                      apply_at_centroid: bool=True, Px: float=0.0, Py: float=0.0):
        # centroid of the group
        Xc, Yc = self.centroid()

        # determine point of application
        if apply_at_centroid:
            Px, Py = Xc, Yc

        # torsion contribution due to offset
        M_offset = Vx * (Py - Yc) - Vy * (Px - Xc)
        M_total = Mz + M_offset

        # polar moment
        J = self.polar_moment(Xc, Yc)
        if J <= 0:
            raise ValueError("Polar moment must be > 0")

        # direct shear per stud
        for s in self.studs:
            s.Vx = Vx / self.n
            s.Vy = Vy / self.n

        # torsional shear per stud
        for s in self.studs:
            x_rel = s.x - Xc
            y_rel = s.y - Yc
            Vtx = -M_total * y_rel / J
            Vty =  M_total * x_rel / J
            s.Vx += Vtx
            s.Vy += Vty

        # resultant shear
        for s in self.studs:
            s.Vres = math.sqrt(s.Vx**2 + s.Vy**2)

# ------------------------------------------------------------
# EC2-1-4 Pry-out resistance model with stud diameter
# ------------------------------------------------------------
class PryOutEC2:
    def __init__(self, fck: float, hef: float, d: float,
                 edge_dist: float, spacing: float, n: int,
                 gamma_Mc: float = 1.5, k_cp: float = 1.0):
        self.fck = fck
        self.hef = hef
        self.d = d
        self.edge_dist = edge_dist
        self.spacing = spacing
        self.n = n
        self.gamma_Mc = gamma_Mc
        self.k_cp = k_cp
        self._check_spacing_edge()

    def _check_spacing_edge(self):
        s_min = max(3*self.d, 100)
        c_min = max(1.5*self.hef, 2*self.d)
        if self.spacing < s_min:
            print(f"Warning: Stud spacing ({self.spacing} mm) < recommended minimum ({s_min} mm)")
        if self.edge_dist < c_min:
            print(f"Warning: Edge distance ({self.edge_dist} mm) < recommended minimum ({c_min} mm)")

    def psi_edge(self): return min(1.0, (self.edge_dist / (1.5*self.hef)) ** 1.5)
    def psi_spacing(self): return min(1.0, (self.spacing / (3*self.hef)) ** 1.5)
    def psi_group(self): return 1.0 / math.sqrt(self.n)
    def characteristic_cone_resistance(self): return 7.2 * math.sqrt(self.fck) * self.hef**1.5 / 1000.0
    def design_pryout_resistance(self):
        N_Rk_c0 = self.characteristic_cone_resistance()
        psi = self.psi_edge() * self.psi_spacing() * self.psi_group()
        return self.k_cp * (N_Rk_c0 * psi / self.gamma_Mc)

# ------------------------------------------------------------
# Calculator interface
# ------------------------------------------------------------
class PryOutCalculator:
    def __init__(self, stud_coords: List[Tuple[float,float]],
                 fck: float, hef: float, d: float,
                 edge_dist: float, spacing: float):
        self.studs = [Stud(x,y) for x,y in stud_coords]
        self.group = StudGroup(self.studs)
        self.pryout = PryOutEC2(fck=fck, hef=hef, d=d,
                                edge_dist=edge_dist, spacing=spacing, n=len(self.studs))

    def run(self, Vx, Vy, Mz=0.0, apply_at_centroid=True, Px=0.0, Py=0.0):
        self.group.apply_actions(Vx, Vy, Mz,
                                 apply_at_centroid=apply_at_centroid,
                                 Px=Px, Py=Py)
        V_Rd_cp = self.pryout.design_pryout_resistance()
        results = []
        for i,s in enumerate(self.studs):
            results.append({
                "stud": i+1,
                "x_mm": s.x,
                "y_mm": s.y,
                "Vx_kN": s.Vx,
                "Vy_kN": s.Vy,
                "Vres_kN": s.Vres,
                "V_Rd_cp_kN": V_Rd_cp,
                "utilization": s.Vres / V_Rd_cp
            })
        return results

# ------------------------------------------------------------
# Plotting
# ------------------------------------------------------------
def plot_stud_geometry(studs, edge_dist):
    fig,ax = plt.subplots()
    ax.set_aspect("equal")
    xs = [s.x for s in studs]; ys = [s.y for s in studs]
    ax.scatter(xs, ys, s=80, color="blue")
    for i,s in enumerate(studs): ax.text(s.x+5, s.y+5,f"{i+1}")
    xmin, xmax = min(xs), max(xs); ymin, ymax = min(ys), max(ys)
    ex_min = xmin - edge_dist; ex_max = xmax + edge_dist
    ey_min = ymin - edge_dist; ey_max = ymax + edge_dist
    ax.plot([ex_min,ex_max,ex_max,ex_min,ex_min],
            [ey_min,ey_min,ey_max,ey_max,ey_min], linestyle="--", color="black")
    ax.arrow(0,0,40,0,head_width=5,color="red",length_includes_head=True)
    ax.arrow(0,0,0,40,head_width=5,color="green",length_includes_head=True)
    ax.text(42,0,"x"); ax.text(0,42,"y")
    ax.set_xlabel("x [mm]"); ax.set_ylabel("y [mm]"); ax.set_title("Stud layout and concrete edges")
    plt.grid(True); plt.show()

def plot_stud_forces(studs, Vx, Vy, Mz,
                     apply_at_centroid=True, Px=0.0, Py=0.0,
                     annotate_forces=False, decimals=1):
    fig,ax = plt.subplots(); ax.set_aspect("equal")
    xs = [s.x for s in studs]; ys = [s.y for s in studs]
    ax.scatter(xs, ys, s=80, color="blue")
    # plot torsion arrows
    scale = 10
    for s in studs:
        ax.arrow(s.x, s.y, -s.Vx*scale, -s.Vy*scale, head_width=4, color="orange", length_includes_head=True)
        if annotate_forces:
            ax.text(s.x+2, s.y+2, f"{s.Vres:.{decimals}f} kN", color="orange")
    # applied force arrow at point
    Xc = sum(xs)/len(xs); Yc = sum(ys)/len(ys)
    if apply_at_centroid: Px, Py = Xc, Yc
    ax.arrow(Px, Py, Vx*scale, Vy*scale, head_width=6, color="red", length_includes_head=True)
    ax.text(Px + Vx*scale, Py + Vy*scale,"V")
    # moment circle
    circle = plt.Circle((Px,Py),30,fill=False,color="purple",linestyle="--")
    ax.add_patch(circle)
    ax.text(Px+30,Py+30,f"Mz = {Mz} kNm")
    # axes
    ax.arrow(0,0,40,0,head_width=5,color="red",length_includes_head=True)
    ax.arrow(0,0,0,40,head_width=5,color="green",length_includes_head=True)
    ax.text(42,0,"x"); ax.text(0,42,"y")
    ax.set_xlabel("x [mm]"); ax.set_ylabel("y [mm]"); ax.set_title("Applied and resisting forces on studs")
    plt.grid(True); plt.show()

#%% Example usage
if __name__ == "__main__":
    stud_coords = [
        (90,420),
        (90,1710),
        ( 420, 90),
        ( 420,  2070),
        (2580,90),
        (2580,2070),
        (2910,420),
        (2910,1710)
    ]
    stud_d = 12.0
    calculator = PryOutCalculator(stud_coords, fck=30, hef=100, d=stud_d, edge_dist=100, spacing=120)
    # Applied actions
    Vx, Vy, Mz = -50, -50, 0
    # apply at centroid
    results = calculator.run(Vx, Vy, Mz, apply_at_centroid=False,Px = 0, Py = 500)
    print("Applied at centroid:\n")
    for r in results:
        print(f"Stud {r['stud']}: Vres={r['Vres_kN']:.1f} kN, V_Rd={r['V_Rd_cp_kN']:.1f} kN, Util={r['utilization']:.1f}")

    # Plot
    plot_stud_geometry(calculator.studs, edge_dist=100)
    plot_stud_forces(calculator.studs, Vx, Vy, Mz, apply_at_centroid=True,
                     annotate_forces=True, decimals=1)




# %%
