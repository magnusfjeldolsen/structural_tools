"""
cable_analyzer.py — Pure calculation engine for Cable Designer.

No matplotlib, no print statements.
Called by worker.js via Pyodide.

Entry point:  run_analysis(params: dict) -> dict
All arrays are returned as plain Python lists for JSON serialization.

INTERNAL UNITS (what this module receives and works with):
  span        : m
  n_segments  : int
  a_eff       : m²  (converted from mm² by caller)
  e_modulus   : kN/m²  (converted from MPa by caller: 1 MPa = 1e3 kN/m²)
  point_loads : list of {position [m], magnitude [kN]}
  line_loads  : list of {start_pos [m], end_pos [m], start_mag [kN/m], end_mag [kN/m]}
  method      : 'rootfinding' | 'fixed_point'
"""

import json
import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import brentq


# ─────────────────────────────────────────────────────────────────────────────
# Core analysis class (adapted from script.py, matplotlib/print removed)
# ─────────────────────────────────────────────────────────────────────────────

class CableAnalysis:
    def __init__(self, L, A_eff_m2, E_kn_m2, n_segments=200):
        self.L = L
        self.A_eff = A_eff_m2       # already in m²
        self.E = E_kn_m2            # already in kN/m²
        self.n_segments = n_segments
        self.n_nodes = n_segments + 1
        self.x = np.linspace(0, L, self.n_nodes)
        self.dx = L / n_segments
        self.point_loads = []
        self.line_loads = []

    def add_point_load(self, position, magnitude):
        if position < 0 or position > self.L:
            raise ValueError(f"Point load position {position} outside span [0, {self.L}]")
        self.point_loads.append({'position': position, 'magnitude': magnitude})

    def add_line_load(self, start_pos, end_pos, start_mag, end_mag):
        if start_pos < 0 or end_pos > self.L or start_pos >= end_pos:
            raise ValueError(
                f"Invalid line load: start_pos={start_pos}, end_pos={end_pos}, span={self.L}"
            )
        self.line_loads.append({
            'start_pos': start_pos, 'end_pos': end_pos,
            'start_mag': start_mag, 'end_mag': end_mag
        })

    def _nodal_loads(self):
        P = np.zeros(self.n_nodes)
        for pl in self.point_loads:
            idx = int(np.argmin(np.abs(self.x - pl['position'])))
            P[idx] += pl['magnitude']
        for ll in self.line_loads:
            mask = (self.x >= ll['start_pos']) & (self.x <= ll['end_pos'])
            indices = np.where(mask)[0]
            if len(indices) < 2:
                continue
            span = ll['end_pos'] - ll['start_pos']
            for i in range(len(indices) - 1):
                i1, i2 = indices[i], indices[i + 1]
                t1 = (self.x[i1] - ll['start_pos']) / span
                t2 = (self.x[i2] - ll['start_pos']) / span
                q1 = ll['start_mag'] + t1 * (ll['end_mag'] - ll['start_mag'])
                q2 = ll['start_mag'] + t2 * (ll['end_mag'] - ll['start_mag'])
                seg_load = 0.5 * (q1 + q2) * (self.x[i2] - self.x[i1])
                P[i1] += seg_load / 2
                P[i2] += seg_load / 2
        return P

    def _distributed_load(self):
        q = np.zeros(self.n_nodes)
        for ll in self.line_loads:
            mask = (self.x >= ll['start_pos']) & (self.x <= ll['end_pos'])
            x_in = self.x[mask]
            if len(x_in) == 0:
                continue
            t = (x_in - ll['start_pos']) / (ll['end_pos'] - ll['start_pos'])
            q[mask] = ll['start_mag'] + t * (ll['end_mag'] - ll['start_mag'])
        return q

    def _cable_shape(self, H, P):
        q = self._distributed_load()
        p = q.copy()
        for i, Pi in enumerate(P):
            if Pi > 0 and 0 < i < self.n_nodes - 1:
                p[i] += Pi / self.dx
        y_prime_H = -cumulative_trapezoid(p, self.x, initial=0)
        y_H = cumulative_trapezoid(y_prime_H, self.x, initial=0)
        linear_correction = (y_H[-1] / self.L) * self.x
        y_H -= linear_correction
        return y_H / H if H != 0 else y_H

    def _cable_length(self, dy_dx):
        return float(np.trapz(np.sqrt(1 + dy_dx ** 2), self.x))

    def _strain_for_H(self, H, P):
        y = self._cable_shape(H, P)
        dy_dx = np.gradient(y, self.x)
        s = self._cable_length(dy_dx)
        return (s - self.L) / self.L

    def _residual(self, H, P):
        strain = self._strain_for_H(H, P)
        return H - self.E * self.A_eff * strain

    def _solve_rootfinding(self, P, total_load, R_left, R_right):
        f_max = self.L / 10
        f_min = self.L / 1000
        H_min = total_load * self.L / (8 * f_max)
        H_max = total_load * self.L / (8 * f_min)

        try:
            H, br = brentq(
                self._residual, H_min, H_max, args=(P,),
                full_output=True, xtol=1e-6, rtol=1e-6, maxiter=100
            )
            converged = bool(br.converged)
            iterations = int(br.iterations)
        except ValueError:
            H, converged, iterations = self._bisection(P, H_min, H_max)

        y = self._cable_shape(H, P)
        strain = self._strain_for_H(H, P)
        return self._build_results(H, y, strain, P, total_load, R_left, R_right,
                                   converged, iterations, 'rootfinding', history=None)

    def _bisection(self, P, H_min, H_max, tol=1e-6, max_iter=100):
        H_mid = H_min
        for i in range(max_iter):
            H_mid = (H_min + H_max) / 2
            r = self._residual(H_mid, P)
            if abs(r) < tol:
                return H_mid, True, i + 1
            if r * self._residual(H_min, P) < 0:
                H_max = H_mid
            else:
                H_min = H_mid
        return H_mid, False, max_iter

    def _solve_fixed_point(self, P, total_load, R_left, R_right,
                           f_initial=None, max_iter=100, tol=1e-6, omega=0.7):
        f_guess = f_initial if f_initial is not None else self.L / 50
        H = total_load * self.L / (8 * f_guess)

        history = {
            'iteration': [], 'f': [], 'f_position': [],
            'H_equilibrium': [], 'H_material': [],
            'strain': [], 'stress': [], 'error': []
        }
        converged = False

        for i in range(max_iter):
            y = self._cable_shape(H, P)
            idx_f = int(np.argmax(y))
            f_actual = float(y[idx_f])
            x_f = float(self.x[idx_f])
            dy_dx = np.gradient(y, self.x)
            s = self._cable_length(dy_dx)
            strain = (s - self.L) / self.L
            stress_MPa = (self.E * strain) / 1e3
            H_material = self.E * self.A_eff * strain
            error = abs(H - H_material) / H if H != 0 else 1.0

            history['iteration'].append(i)
            history['f'].append(f_actual)
            history['f_position'].append(x_f)
            history['H_equilibrium'].append(float(H))
            history['H_material'].append(float(H_material))
            history['strain'].append(float(strain))
            history['stress'].append(float(stress_MPa))
            history['error'].append(float(error * 100))

            if error < tol:
                converged = True
                break
            H = H * (1 - omega) + omega * H_material

        y = self._cable_shape(H, P)
        strain = self._strain_for_H(H, P)
        return self._build_results(H, y, strain, P, total_load, R_left, R_right,
                                   converged, i + 1, 'fixed_point', history=history)

    def _build_results(self, H, y, strain, P, total_load, R_left, R_right,
                       converged, iterations, method, history):
        dy_dx = np.gradient(y, self.x)
        idx_f = int(np.argmax(y))
        f_final = float(y[idx_f])
        x_f = float(self.x[idx_f])

        alpha = np.arctan(dy_dx)
        T = H / np.cos(alpha)
        V = H * np.tan(alpha)

        idx_Tmax = int(np.argmax(T))
        T_max = float(T[idx_Tmax])

        s = self._cable_length(dy_dx)
        stress_MPa = float((self.E * strain) / 1e3)

        # Distributed load intensity at each node (for load diagram)
        q_dist = self._distributed_load()

        # Stress distribution: T(x) / A_eff in MPa
        stress_dist = (T / (self.A_eff * 1e6)) * 1e3  # kN/(m²·1e6·1e-3) … simpler:
        # T [kN] / A_eff [m²] = kN/m² ; / 1e3 = MPa
        stress_dist_mpa = T / self.A_eff / 1e3

        return {
            'converged': converged,
            'iterations': iterations,
            'method': method,
            # Scalars
            'f': f_final,
            'f_position': x_f,
            'sag_ratio': float(f_final / self.L),
            'H': float(H),
            'T_max': T_max,
            'T_max_position': float(self.x[idx_Tmax]),
            'angle_left': float(np.degrees(alpha[1])),
            'angle_right': float(np.degrees(alpha[-2])),
            'R_left': float(R_left),
            'R_right': float(R_right),
            'total_load': float(total_load),
            'strain': float(strain),
            'stress': stress_MPa,
            'cable_length': float(s),
            'elongation': float(s - self.L),
            # Arrays (as lists for JSON)
            'x': self.x.tolist(),
            'y': y.tolist(),
            'T': T.tolist(),
            'alpha': np.degrees(alpha).tolist(),
            'V': V.tolist(),
            'H_array': (np.ones_like(self.x) * H).tolist(),
            'nodal_loads': P.tolist(),
            'q_dist': q_dist.tolist(),
            'stress_dist': stress_dist_mpa.tolist(),
            # Iteration history (fixed_point only, else None)
            'history': history,
        }

    def solve(self, method='rootfinding', f_initial=None,
              max_iter=100, tol=1e-6, omega=0.7):
        P = self._nodal_loads()
        total_load = float(np.sum(P))
        if total_load <= 0:
            raise ValueError("No downward loads applied. Add at least one load.")
        R_left = float(np.sum(P * (self.L - self.x)) / self.L)
        R_right = float(np.sum(P * self.x) / self.L)

        if method == 'rootfinding':
            return self._solve_rootfinding(P, total_load, R_left, R_right)
        else:
            return self._solve_fixed_point(P, total_load, R_left, R_right,
                                           f_initial, max_iter, tol, omega)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point called from worker.js
# ─────────────────────────────────────────────────────────────────────────────

def run_analysis(params_json):
    """
    params_json: JSON string with keys:
      span         [m]
      n_segments   int
      a_eff        [m²]   (already converted)
      e_modulus    [kN/m²] (already converted)
      point_loads  list of {position, magnitude}
      line_loads   list of {start_pos, end_pos, start_mag, end_mag}
      method       'rootfinding' | 'fixed_point'

    Returns: JSON string of results dict
    """
    params = json.loads(params_json)

    analysis = CableAnalysis(
        L=params['span'],
        A_eff_m2=params['a_eff'],
        E_kn_m2=params['e_modulus'],
        n_segments=params['n_segments'],
    )

    for pl in params.get('point_loads', []):
        analysis.add_point_load(pl['position'], pl['magnitude'])

    for ll in params.get('line_loads', []):
        analysis.add_line_load(ll['start_pos'], ll['end_pos'],
                               ll['start_mag'], ll['end_mag'])

    results = analysis.solve(
        method=params.get('method', 'rootfinding'),
    )

    return json.dumps(results)
