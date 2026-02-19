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
  self_weight : kN/m (along cable length)
  initial_sag : m (target sag from self-weight only)
  support_h_max : kN (maximum horizontal capacity, optional)
  support_k_h   : kN/m (horizontal stiffness, optional)
  point_loads : list of {position [m], magnitude [kN]}
  line_loads  : list of {start_pos [m], end_pos [m], start_mag [kN/m], end_mag [kN/m]}
  method      : 'rootfinding' | 'fixed_point'
"""

import json
import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import brentq


# ─────────────────────────────────────────────────────────────────────────────
# Core analysis class (extended with catenary + support limits)
# ─────────────────────────────────────────────────────────────────────────────

class CableAnalysis:
    def __init__(self, L, A_eff_m2, E_kn_m2, self_weight=0.0, 
                 support_h_max=None, support_k_h=None, n_segments=200):
        self.L = L
        self.A_eff = A_eff_m2       # already in m²
        self.E = E_kn_m2            # already in kN/m²
        self.self_weight = self_weight  # kN/m along cable
        self.support_h_max = support_h_max  # kN (max horizontal capacity)
        self.support_k_h = support_k_h      # kN/m (horizontal stiffness)
        self.n_segments = n_segments
        self.n_nodes = n_segments + 1
        self.x = np.linspace(0, L, self.n_nodes)
        self.dx = L / n_segments
        self.point_loads = []
        self.line_loads = []
        
        # Initial catenary state
        self.y_initial = None
        self.H_initial = None
        self.f_initial = None

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

    def _calculate_catenary_shape(self, H, w):
        """
        Calculate catenary shape for given H and self-weight w.
        Returns (y, f_max)
        """
        if w == 0 or H == 0:
            return np.zeros_like(self.x), 0.0
        
        a = H / w
        x_centered = self.x - self.L / 2
        # y_cat has minimum at midspan (=0) and maximum at ends
        y_cat = a * (np.cosh(x_centered / a) - 1)
        # Positive-downward convention: flip so midspan is maximum (sag > 0)
        y = y_cat[0] - y_cat  # y(0)=y(L)=0, y(midspan)>0
        f = float(np.max(y))

        return y, f

    def _solve_initial_catenary(self, f_target, tol=1e-6):
        """
        Find H to achieve target sag f_target under self-weight only.
        Stores result in self.y_initial, self.H_initial, self.f_initial
        """
        if self.self_weight <= 0:
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0
            return
        
        def residual(H):
            if H <= 0:
                return 1e10
            _, f = self._calculate_catenary_shape(H, self.self_weight)
            return f_target - f
        
        # Estimate bounds
        H_guess = self.self_weight * self.L**2 / (8 * f_target)
        H_min = H_guess * 0.1
        H_max = H_guess * 10
        
        try:
            H_solution = brentq(residual, H_min, H_max, xtol=tol)
            self.y_initial, self.f_initial = self._calculate_catenary_shape(
                H_solution, self.self_weight
            )
            self.H_initial = float(H_solution)
        except ValueError:
            # Could not solve - use zeros
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0

    def _nodal_loads(self):
        """Calculate nodal loads from point and line loads (excluding self-weight)"""
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
        """Calculate distributed load intensity (excluding self-weight)"""
        q = np.zeros(self.n_nodes)
        for ll in self.line_loads:
            mask = (self.x >= ll['start_pos']) & (self.x <= ll['end_pos'])
            x_in = self.x[mask]
            if len(x_in) == 0:
                continue
            t = (x_in - ll['start_pos']) / (ll['end_pos'] - ll['start_pos'])
            q[mask] = ll['start_mag'] + t * (ll['end_mag'] - ll['start_mag'])
        return q

    def _additional_deflection(self, H, P):
        """
        Calculate additional deflection from applied loads (beyond initial catenary).
        """
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

    def _total_shape(self, H, P):
        """
        Calculate total cable shape = initial catenary + additional deflection
        """
        if self.y_initial is not None:
            y_total = self.y_initial.copy()
        else:
            y_total = np.zeros_like(self.x)
        
        y_add = self._additional_deflection(H, P)
        y_total += y_add
        
        return y_total

    def _cable_length(self, dy_dx):
        return float(np.trapz(np.sqrt(1 + dy_dx ** 2), self.x))

    def _strain_for_H(self, H, P):
        y = self._total_shape(H, P)
        dy_dx = np.gradient(y, self.x)
        s = self._cable_length(dy_dx)
        return (s - self.L) / self.L

    def _horizontal_displacement(self, H):
        """
        Calculate horizontal displacement at support.
        delta_h = H * L / K_h  if K_h provided
        """
        if self.support_k_h is not None and self.support_k_h > 0:
            return H * self.L / self.support_k_h
        return 0.0

    def _residual(self, H, P):
        strain = self._strain_for_H(H, P)
        return H - self.E * self.A_eff * strain

    def _solve_with_H_limit(self, P, H_max):
        """
        Solve when horizontal capacity is limited.
        Find H where material capacity meets equilibrium, subject to H <= H_max.
        """
        total_load = float(np.sum(P)) + self.self_weight * self.L
        if total_load <= 0:
            total_load = 1.0
        # Physics-based lower bound: sag capped at L/10
        H_search_min = max(total_load * self.L / (8 * (self.L / 10)), 1.0)
        H_search_max = H_max

        def residual_limited(H_test):
            if H_test <= 0 or H_test > H_max * 1.001:
                return 1e10
            return self._residual(H_test, P)

        try:
            r_min = residual_limited(H_search_min)
            r_max = residual_limited(H_search_max)

            if r_min * r_max > 0:
                # Same sign: if both are negative, H_max is not binding and
                # the unconstrained solution is below H_search_min.
                # Fall back to unconstrained solve within [1, H_max].
                H_unconstrained_min = max(total_load * self.L / (8 * (self.L / 5)), 1.0)
                try:
                    H_solution = brentq(
                        self._residual, H_unconstrained_min, H_max,
                        args=(P,), xtol=1e-6, maxiter=100
                    )
                    return float(H_solution), False  # not constrained
                except ValueError:
                    return H_max, True
            else:
                H_solution = brentq(
                    residual_limited, H_search_min, H_search_max,
                    xtol=1e-6, maxiter=100
                )
                # Constraint is active only if solution is at H_max
                is_constrained = float(H_solution) >= H_max * 0.99
                return float(H_solution), is_constrained
        except ValueError:
            return H_max, True

    def _solve_rootfinding(self, P, total_load, R_left, R_right):
        # Check if H_max constraint exists
        h_max_active = False
        if self.support_h_max is not None:
            H, h_max_active = self._solve_with_H_limit(P, self.support_h_max)
            converged = True
            iterations = -1  # Not tracked for limited case
        else:
            # Unconstrained solve
            f_max = self.L / 10
            f_min = self.L / 1000
            H_min = max(total_load * self.L / (8 * f_max), 1.0)
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

        y = self._total_shape(H, P)
        strain = self._strain_for_H(H, P)
        return self._build_results(H, y, strain, P, total_load, R_left, R_right,
                                   converged, iterations, 'rootfinding',
                                   history=None, h_max_active=h_max_active)

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
            y = self._total_shape(H, P)
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
            
            H_new = H_material
            
            # Apply H_max constraint if present
            if self.support_h_max is not None and H_new > self.support_h_max:
                H_new = self.support_h_max
            
            H = H * (1 - omega) + omega * H_new

        h_max_active = (self.support_h_max is not None and H >= self.support_h_max * 0.99)
        y = self._total_shape(H, P)
        strain = self._strain_for_H(H, P)
        return self._build_results(H, y, strain, P, total_load, R_left, R_right,
                                   converged, i + 1, 'fixed_point', history=history,
                                   h_max_active=h_max_active)

    def _build_results(self, H, y, strain, P, total_load, R_left, R_right,
                       converged, iterations, method, history, h_max_active=False):
        dy_dx = np.gradient(y, self.x)
        # y uses positive-downward convention; sag is the maximum
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

        # Distributed load intensity
        q_dist = self._distributed_load()

        # Stress distribution
        stress_dist_mpa = T / self.A_eff / 1e3

        # Horizontal displacement
        delta_h = self._horizontal_displacement(H)

        # H utilization (if H_max exists)
        H_utilization = H / self.support_h_max if self.support_h_max else 0.0
        constrained = bool(h_max_active) if self.support_h_max else False

        return {
            'converged': converged,
            'iterations': iterations,
            'method': method,
            # Support properties
            'has_initial_sag': self.self_weight > 0,
            'f_initial': float(self.f_initial) if self.f_initial is not None else 0.0,
            'H_initial': float(self.H_initial) if self.H_initial is not None else 0.0,
            'H_max': float(self.support_h_max) if self.support_h_max else None,
            'H_utilization': float(H_utilization),
            'constrained_by_H_max': constrained,
            'delta_h': float(delta_h),
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
            'self_weight_load': float(self.self_weight * self.L),
            'strain': float(strain),
            'stress': stress_MPa,
            'cable_length': float(s),
            'elongation': float(s - self.L),
            # Arrays (as lists for JSON)
            'x': self.x.tolist(),
            'y': y.tolist(),
            'y_initial': self.y_initial.tolist() if self.y_initial is not None else None,
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

    def solve(self, initial_sag=None, method='rootfinding', f_initial=None,
              max_iter=100, tol=1e-6, omega=0.7):
        """
        Solve for cable equilibrium.
        
        Parameters:
        -----------
        initial_sag : float, optional
            Target sag from self-weight only [m]. If None and self_weight > 0, uses L/100
        method : str
            'rootfinding' or 'fixed_point'
        """
        # Step 1: Solve for initial catenary if self-weight exists
        if self.self_weight > 0:
            if initial_sag is None:
                initial_sag = self.L / 100  # Default 1% sag
            self._solve_initial_catenary(initial_sag)
        else:
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0
        
        # Step 2: Get applied loads
        P = self._nodal_loads()
        total_load = float(np.sum(P))
        
        # Add self-weight to total load (approximation)
        total_load += self.self_weight * self.L
        
        if total_load <= 0:
            raise ValueError("No downward loads applied. Add at least one load.")
        
        # Step 3: Calculate reactions (including self-weight)
        R_left = float(np.sum(P * (self.L - self.x)) / self.L)
        R_right = float(np.sum(P * self.x) / self.L)
        
        if self.self_weight > 0:
            total_self_weight = self.self_weight * self.L
            R_left += total_self_weight / 2
            R_right += total_self_weight / 2

        # Step 4: Solve
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
      span          [m]
      n_segments    int
      a_eff         [m²]   (already converted)
      e_modulus     [kN/m²] (already converted)
      self_weight   [kN/m] (optional, default 0)
      initial_sag   [m] (optional, target sag from self-weight)
      support_h_max [kN] (optional, max horizontal capacity)
      support_k_h   [kN/m] (optional, horizontal stiffness)
      point_loads   list of {position, magnitude}
      line_loads    list of {start_pos, end_pos, start_mag, end_mag}
      method        'rootfinding' | 'fixed_point'

    Returns: JSON string of results dict
    """
    params = json.loads(params_json)

    analysis = CableAnalysis(
        L=params['span'],
        A_eff_m2=params['a_eff'],
        E_kn_m2=params['e_modulus'],
        self_weight=params.get('self_weight', 0.0),
        support_h_max=params.get('support_h_max', None),
        support_k_h=params.get('support_k_h', None),
        n_segments=params['n_segments'],
    )

    for pl in params.get('point_loads', []):
        analysis.add_point_load(pl['position'], pl['magnitude'])

    for ll in params.get('line_loads', []):
        analysis.add_line_load(ll['start_pos'], ll['end_pos'],
                               ll['start_mag'], ll['end_mag'])

    results = analysis.solve(
        initial_sag=params.get('initial_sag', None),
        method=params.get('method', 'rootfinding'),
    )

    return json.dumps(results)


"""
Hovedendringer
1. Nye constructor-parametere:
pythondef __init__(self, L, A_eff_m2, E_kn_m2, self_weight=0.0, 
             support_h_max=None, support_k_h=None, n_segments=200)
2. Katenary-funksjonalitet:

_calculate_catenary_shape(H, w): Beregner katenary-form
_solve_initial_catenary(f_target): Finner H for ønsket initial sag
Lagrer y_initial, H_initial, f_initial

3. Oppleggsbegrensninger:

_solve_with_H_limit(P, H_max): Løser med H ≤ H_max
_horizontal_displacement(H): Beregner Δ_h = H·L/K_h
Returnerer H_utilization, constrained_by_H_max, delta_h

4. Oppdatert solve() metode:
pythondef solve(self, initial_sag=None, method='rootfinding', ...)

Løser først for initial katenary
Deretter legger til ekstra defleksjon fra påførte laster

5. Nye returverdier:
python{
    'has_initial_sag': bool,
    'f_initial': float,
    'H_initial': float,
    'y_initial': list,
    'H_max': float or None,
    'H_utilization': float,
    'constrained_by_H_max': bool,
    'delta_h': float,
    'self_weight_load': float,
    ...
}
6. Oppdatert run_analysis() interface:
Nye valgfrie parametere:

self_weight [kN/m]
initial_sag [m]
support_h_max [kN]
support_k_h [kN/m]

Koden er nå klar for bruk i web-applikasjonen med full støtte for både initial sag fra egenvekt og begrensninger i horisontalopplegg!

"""