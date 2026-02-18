import numpy as np
import matplotlib.pyplot as plt
from dataclasses import dataclass
from typing import List, Tuple
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import brentq

@dataclass
class PointLoad:
    """Point load definition"""
    position: float  # Position along span [m]
    magnitude: float  # Load magnitude [kN] (positive = downward)

@dataclass
class LineLoad:
    """Linearly varying line load definition"""
    start_pos: float  # Start position [m]
    end_pos: float    # End position [m]
    start_mag: float  # Load at start [kN/m]
    end_mag: float    # Load at end [kN/m]

class CableAnalysis:
    """
    General cable analysis with arbitrary loading.
    Handles point loads and linearly varying line loads.
    Uses normalized formulation for better stability.
    """
    
    def __init__(self, L: float, A_eff: float, E: float, n_segments: int = 200):
        """
        Parameters:
        -----------
        L : float
            Span length [m]
        A_eff : float
            Effective tension area (reinforcement area) [mm²]
        E : float
            Modulus of elasticity [MPa]
        n_segments : int
            Number of segments for discretization
        """
        self.L = L
        self.A_eff = A_eff / 1e6  # Convert to m²
        self.E = E * 1e3  # Convert to kN/m²
        self.n_segments = n_segments
        
        # Discretization
        self.n_nodes = n_segments + 1
        self.x = np.linspace(0, L, self.n_nodes)
        self.dx = L / n_segments
        
        # Loads
        self.point_loads: List[PointLoad] = []
        self.line_loads: List[LineLoad] = []
        
    def add_point_load(self, position: float, magnitude: float):
        """Add a point load"""
        if position < 0 or position > self.L:
            raise ValueError(f"Point load position {position} outside span [0, {self.L}]")
        self.point_loads.append(PointLoad(position, magnitude))
        
    def add_line_load(self, start_pos: float, end_pos: float, 
                      start_mag: float, end_mag: float):
        """Add a linearly varying line load"""
        if start_pos < 0 or end_pos > self.L or start_pos >= end_pos:
            raise ValueError("Invalid line load positions")
        self.line_loads.append(LineLoad(start_pos, end_pos, start_mag, end_mag))
    
    def calculate_nodal_loads(self) -> np.ndarray:
        """
        Calculate equivalent nodal loads from distributed and point loads.
        Returns array of loads at each node [kN]
        """
        P = np.zeros(self.n_nodes)
        
        # Add point loads
        for pl in self.point_loads:
            # Find nearest node
            idx = np.argmin(np.abs(self.x - pl.position))
            P[idx] += pl.magnitude
        
        # Add line loads (convert to equivalent nodal loads)
        for ll in self.line_loads:
            # Find nodes within line load range
            mask = (self.x >= ll.start_pos) & (self.x <= ll.end_pos)
            indices = np.where(mask)[0]
            
            if len(indices) < 2:
                continue
            
            # Linear interpolation of load magnitude along length
            for i in range(len(indices) - 1):
                idx1, idx2 = indices[i], indices[i + 1]
                x1, x2 = self.x[idx1], self.x[idx2]
                
                # Load magnitude at nodes
                t1 = (x1 - ll.start_pos) / (ll.end_pos - ll.start_pos)
                t2 = (x2 - ll.start_pos) / (ll.end_pos - ll.start_pos)
                q1 = ll.start_mag + t1 * (ll.end_mag - ll.start_mag)
                q2 = ll.start_mag + t2 * (ll.end_mag - ll.start_mag)
                
                # Trapezoidal load over segment
                segment_length = x2 - x1
                segment_load = 0.5 * (q1 + q2) * segment_length
                
                # Distribute to nodes
                P[idx1] += segment_load / 2
                P[idx2] += segment_load / 2
        
        return P
    
    def calculate_distributed_load(self) -> np.ndarray:
        """
        Calculate distributed load intensity at each node [kN/m].
        Used for direct integration of cable equation.
        """
        q = np.zeros(self.n_nodes)
        
        # Add line loads
        for ll in self.line_loads:
            mask = (self.x >= ll.start_pos) & (self.x <= ll.end_pos)
            x_in_range = self.x[mask]
            
            if len(x_in_range) > 0:
                # Linear interpolation
                t = (x_in_range - ll.start_pos) / (ll.end_pos - ll.start_pos)
                q_values = ll.start_mag + t * (ll.end_mag - ll.start_mag)
                q[mask] = q_values
        
        return q
    
    def calculate_cable_shape(self, H: float, P: np.ndarray) -> np.ndarray:
        """
        Calculate cable shape y(x) given horizontal force H and nodal loads P.
        Solves: H × y'' = -p(x) with boundary conditions y(0) = y(L) = 0
        
        Uses direct integration method.
        """
        # Get distributed load
        q = self.calculate_distributed_load()
        
        # Total load per unit length (distributed + point loads as concentrated)
        p = q.copy()
        for i, P_i in enumerate(P):
            if P_i > 0 and i > 0 and i < self.n_nodes - 1:
                # Approximate point load as distributed over dx
                p[i] += P_i / self.dx
        
        # Integrate twice: H × y'' = -p(x)
        # First integration: H × y' = -∫p dx + C1
        y_prime_H = -cumulative_trapezoid(p, self.x, initial=0)
        
        # Second integration: H × y = -∫∫p dx dx + C1×x + C2
        y_H = cumulative_trapezoid(y_prime_H, self.x, initial=0)
        
        # Apply boundary conditions:
        # y(0) = 0 → C2 = 0 (already satisfied)
        # y(L) = 0 → need to adjust with linear term
        
        # Add linear correction to satisfy y(L) = 0
        linear_correction = (y_H[-1] / self.L) * self.x
        y_H = y_H - linear_correction
        
        # Divide by H to get actual y
        y = y_H / H if H != 0 else y_H
        
        return y
    
    def calculate_strain_for_H(self, H: float, P: np.ndarray) -> float:
        """
        Calculate strain given horizontal force H.
        Returns strain value.
        """
        y = self.calculate_cable_shape(H, P)
        dy_dx = np.gradient(y, self.x)
        s = self._calculate_cable_length(dy_dx)
        strain = (s - self.L) / self.L
        return strain
    
    def residual_function(self, H: float, P: np.ndarray) -> float:
        """
        Residual function for root finding.
        Returns: H - E*A*strain
        When this equals zero, we have equilibrium.
        """
        strain = self.calculate_strain_for_H(H, P)
        H_material = self.E * self.A_eff * strain
        return H - H_material
    
    def solve_direct_rootfinding(self, P: np.ndarray, H_min: float, H_max: float, 
                                 verbose: bool = True) -> Tuple[float, dict]:
        """
        Solve using Brent's method (root finding).
        Much more stable than fixed-point iteration.
        """
        try:
            # Use Brent's method to find H where residual = 0
            H_solution, result = brentq(
                self.residual_function, 
                H_min, 
                H_max, 
                args=(P,),
                full_output=True,
                xtol=1e-6,
                rtol=1e-6,
                maxiter=100
            )
            
            converged = result.converged
            iterations = result.iterations
            
        except ValueError as e:
            if verbose:
                print(f"Root finding failed: {e}")
                print("Trying bisection method...")
            
            # Fallback to manual bisection
            H_solution, converged, iterations = self._bisection_solve(P, H_min, H_max)
        
        # Calculate final results
        y = self.calculate_cable_shape(H_solution, P)
        strain = self.calculate_strain_for_H(H_solution, P)
        
        info = {
            'converged': converged,
            'iterations': iterations,
            'H': H_solution,
            'y': y,
            'strain': strain
        }
        
        return H_solution, info
    
    def _bisection_solve(self, P: np.ndarray, H_min: float, H_max: float, 
                        tol: float = 1e-6, max_iter: int = 100) -> Tuple[float, bool, int]:
        """
        Manual bisection solver as fallback.
        """
        for i in range(max_iter):
            H_mid = (H_min + H_max) / 2
            residual = self.residual_function(H_mid, P)
            
            if abs(residual) < tol:
                return H_mid, True, i+1
            
            residual_min = self.residual_function(H_min, P)
            
            if residual * residual_min < 0:
                H_max = H_mid
            else:
                H_min = H_mid
        
        return H_mid, False, max_iter
    
    def solve(self, f_initial: float = None, method: str = 'rootfinding',
              max_iter: int = 100, tol: float = 1e-6, omega: float = 0.7, 
              verbose: bool = True):
        """
        Solve for cable equilibrium with arbitrary loading.
        
        Parameters:
        -----------
        method : str
            'rootfinding' - Use Brent's method (recommended, most stable)
            'fixed_point' - Use fixed point iteration (original method)
        
        Returns:
        --------
        dict with results
        """
        # Get nodal loads
        P = self.calculate_nodal_loads()
        total_load = np.sum(P)
        
        if total_load <= 0:
            raise ValueError("No downward loads applied!")
        
        # Calculate vertical reactions (simply supported)
        R_left = np.sum(P * (self.L - self.x)) / self.L
        R_right = np.sum(P * self.x) / self.L
        
        if method == 'rootfinding':
            return self._solve_rootfinding(P, total_load, R_left, R_right, verbose)
        else:
            return self._solve_fixed_point(P, total_load, R_left, R_right, 
                                           f_initial, max_iter, tol, omega, verbose)
    
    def _solve_rootfinding(self, P: np.ndarray, total_load: float, 
                          R_left: float, R_right: float, verbose: bool = True):
        """
        Solve using root finding method (Brent's method).
        Most stable approach.
        """
        if verbose:
            print("\n" + "="*70)
            print("SOLVING USING ROOT FINDING METHOD (BRENT'S METHOD)")
            print("="*70)
        
        # Estimate H bounds
        # Lower bound: assume very flexible cable (large sag)
        f_max = self.L / 10  # Maximum reasonable sag
        H_min = total_load * self.L / (8 * f_max)
        
        # Upper bound: assume very stiff cable (small sag)
        f_min = self.L / 1000  # Minimum reasonable sag
        H_max = total_load * self.L / (8 * f_min)
        
        if verbose:
            print(f"H bounds: [{H_min:.2f}, {H_max:.2f}] kN")
            print("Solving...")
        
        # Solve
        H, info = self.solve_direct_rootfinding(P, H_min, H_max, verbose)
        
        if verbose:
            print(f"Converged: {info['converged']}")
            print(f"Iterations: {info['iterations']}")
            print(f"H = {H:.2f} kN")
        
        # Calculate final results
        y = info['y']
        strain = info['strain']
        dy_dx = np.gradient(y, self.x)
        
        # Find actual maximum deflection and its position
        idx_f_max = np.argmax(y)
        f_final = y[idx_f_max]
        x_f_final = self.x[idx_f_max]
        
        alpha = np.arctan(dy_dx)
        T = H / np.cos(alpha)
        V = H * np.tan(alpha)
        
        T_max = np.max(T)
        idx_max = np.argmax(T)
        
        # Angle at supports
        angle_left = np.degrees(alpha[1])
        angle_right = np.degrees(alpha[-2])
        
        s = self._calculate_cable_length(dy_dx)
        elongation = s - self.L
        
        stress_MPa = (self.E * strain) / 1e3
        
        results = {
            'converged': info['converged'],
            'iterations': info['iterations'],
            'method': 'rootfinding',
            'f': f_final,
            'f_position': x_f_final,
            'H': H,
            'T_max': T_max,
            'T_max_position': self.x[idx_max],
            'strain': strain,
            'stress': stress_MPa,
            'angle_left': angle_left,
            'angle_right': angle_right,
            'cable_length': s,
            'elongation': elongation,
            'sag_ratio': f_final / self.L,
            'total_load': total_load,
            'R_left': R_left,
            'R_right': R_right,
            'history': None,  # No iteration history for root finding
            'x': self.x,
            'y': y,
            'T': T,
            'alpha': np.degrees(alpha),
            'V': V,
            'H_array': np.ones_like(self.x) * H,
            'nodal_loads': P
        }
        
        return results
    
    def _solve_fixed_point(self, P: np.ndarray, total_load: float, 
                           R_left: float, R_right: float,
                           f_initial: float, max_iter: int, tol: float, 
                           omega: float, verbose: bool = True):
        """
        Solve using fixed point iteration (original method).
        Less stable but provides iteration history.
        """
        if verbose:
            print("\n" + "="*70)
            print("SOLVING USING FIXED POINT ITERATION")
            print("="*70)
        
        # Initial guess for H (horizontal force)
        if f_initial is None:
            f_guess = self.L / 50
        else:
            f_guess = f_initial
        
        # Initial H estimate
        H = total_load * self.L / (8 * f_guess)
        
        # Storage for iteration history
        history = {
            'iteration': [],
            'f': [],
            'f_position': [],
            'H_equilibrium': [],
            'H_material': [],
            'strain': [],
            'stress': [],
            'error': []
        }
        
        if verbose:
            print(f"{'Iter':<6} {'f [m]':<12} {'x_f [m]':<12} {'H [kN]':<14} {'H_mat [kN]':<14} "
                  f"{'ε [-]':<14} {'σ [MPa]':<14} {'Error [%]':<12}")
            print("-" * 110)
        
        converged = False
        
        for i in range(max_iter):
            # 1. Calculate cable shape for current H
            y = self.calculate_cable_shape(H, P)
            
            # 2. Find maximum deflection and its position
            idx_f_max = np.argmax(y)
            f_actual = y[idx_f_max]
            x_f_max = self.x[idx_f_max]
            
            # 3. Calculate cable slope
            dy_dx = np.gradient(y, self.x)
            
            # 4. Calculate cable length and strain
            s = self._calculate_cable_length(dy_dx)
            strain = (s - self.L) / self.L
            
            # 5. Calculate material capacity
            stress_kN_m2 = self.E * strain
            stress_MPa = stress_kN_m2 / 1e3
            H_material = stress_kN_m2 * self.A_eff
            
            # 6. Calculate error
            error = abs(H - H_material) / H if H != 0 else 1.0
            
            # Store history
            history['iteration'].append(i)
            history['f'].append(f_actual)
            history['f_position'].append(x_f_max)
            history['H_equilibrium'].append(H)
            history['H_material'].append(H_material)
            history['strain'].append(strain)
            history['stress'].append(stress_MPa)
            history['error'].append(error * 100)
            
            if verbose:
                print(f"{i:<6} {f_actual:<12.6f} {x_f_max:<12.3f} {H:<14.2f} {H_material:<14.2f} "
                      f"{strain:<14.6e} {stress_MPa:<14.2f} {error*100:<12.6f}")
            
            # 7. Check convergence
            if error < tol:
                converged = True
                if verbose:
                    print(f"\nConverged after {i+1} iterations!")
                break
            
            # 8. Update H for next iteration with relaxation
            H_new = H_material
            H = H * (1 - omega) + omega * H_new
        
        if not converged and verbose:
            print(f"\nWarning: Did not converge after {max_iter} iterations!")
        
        # Calculate final results (same as rootfinding method)
        y = self.calculate_cable_shape(H, P)
        dy_dx = np.gradient(y, self.x)
        
        idx_f_max = np.argmax(y)
        f_final = y[idx_f_max]
        x_f_final = self.x[idx_f_max]
        
        alpha = np.arctan(dy_dx)
        T = H / np.cos(alpha)
        V = H * np.tan(alpha)
        
        T_max = np.max(T)
        idx_max = np.argmax(T)
        
        angle_left = np.degrees(alpha[1])
        angle_right = np.degrees(alpha[-2])
        
        s = self._calculate_cable_length(dy_dx)
        elongation = s - self.L
        
        results = {
            'converged': converged,
            'iterations': i + 1,
            'method': 'fixed_point',
            'f': f_final,
            'f_position': x_f_final,
            'H': H,
            'T_max': T_max,
            'T_max_position': self.x[idx_max],
            'strain': strain,
            'stress': stress_MPa,
            'angle_left': angle_left,
            'angle_right': angle_right,
            'cable_length': s,
            'elongation': elongation,
            'sag_ratio': f_final / self.L,
            'total_load': total_load,
            'R_left': R_left,
            'R_right': R_right,
            'history': history,
            'x': self.x,
            'y': y,
            'T': T,
            'alpha': np.degrees(alpha),
            'V': V,
            'H_array': np.ones_like(self.x) * H,
            'nodal_loads': P
        }
        
        return results
    
    def _calculate_cable_length(self, dy_dx: np.ndarray) -> float:
        """Calculate cable length using trapezoidal integration"""
        integrand = np.sqrt(1 + dy_dx**2)
        s = np.trapz(integrand, self.x)
        return s
    
    def plot_loading(self):
        """Plot the applied loading diagram"""
        fig, ax = plt.subplots(figsize=(12, 4))
        
        # Plot line loads
        for ll in self.line_loads:
            x_load = np.linspace(ll.start_pos, ll.end_pos, 50)
            q_load = ll.start_mag + (x_load - ll.start_pos) / (ll.end_pos - ll.start_pos) * (ll.end_mag - ll.start_mag)
            ax.fill_between(x_load, 0, -q_load, alpha=0.3, label=f'Line load {ll.start_mag:.1f}-{ll.end_mag:.1f} kN/m')
            ax.plot(x_load, -q_load, 'b-', linewidth=2)
        
        # Plot point loads
        for pl in self.point_loads:
            max_load = max([p.magnitude for p in self.point_loads] + [20])
            ax.arrow(pl.position, 0, 0, -pl.magnitude*0.8, head_width=0.1, 
                    head_length=max(pl.magnitude*0.1, 2), fc='red', ec='red', linewidth=2)
            ax.plot(pl.position, 0, 'ro', markersize=8)
            ax.text(pl.position, pl.magnitude*0.15, f'{pl.magnitude:.1f} kN', 
                   ha='center', fontsize=10)
        
        ax.axhline(y=0, color='k', linewidth=1)
        ax.plot([0, self.L], [0, 0], 'ko', markersize=10)
        ax.set_xlabel('Position [m]')
        ax.set_ylabel('Load [kN or kN/m]')
        ax.set_title('Applied Loading')
        ax.grid(True, alpha=0.3)
        if self.line_loads:
            ax.legend()
        ax.invert_yaxis()
        plt.tight_layout()
        plt.show()


def plot_results(results, analysis):
    """Plot comprehensive results"""
    history = results['history']
    
    if history is not None:
        # Plot with iteration history (fixed point method)
        fig = plt.figure(figsize=(16, 12))
        gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)
        
        # Plot 1: Sag convergence
        ax1 = fig.add_subplot(gs[0, 0])
        ax1.plot(history['iteration'], history['f'], 'b-o', linewidth=2, markersize=4)
        ax1.axhline(y=results['f'], color='r', linestyle='--', label=f'Final: {results["f"]:.4f} m')
        ax1.set_xlabel('Iteration')
        ax1.set_ylabel('Sag f [m]')
        ax1.set_title('Sag Convergence')
        ax1.grid(True, alpha=0.3)
        ax1.legend()
        
        # Plot 2: Force balance
        ax2 = fig.add_subplot(gs[0, 1])
        ax2.plot(history['iteration'], history['H_equilibrium'], 'b-o', 
                label='H equilibrium', linewidth=2, markersize=4)
        ax2.plot(history['iteration'], history['H_material'], 'r-s', 
                label='H material', linewidth=2, markersize=4)
        ax2.set_xlabel('Iteration')
        ax2.set_ylabel('Horizontal Force H [kN]')
        ax2.set_title('Force Balance Convergence')
        ax2.grid(True, alpha=0.3)
        ax2.legend()
        
        # Plot 3: Error convergence
        ax3 = fig.add_subplot(gs[0, 2])
        ax3.semilogy(history['iteration'], history['error'], 'g-o', linewidth=2, markersize=4)
        ax3.set_xlabel('Iteration')
        ax3.set_ylabel('Relative Error [%]')
        ax3.set_title('Error Convergence (log scale)')
        ax3.grid(True, alpha=0.3, which='both')
        
        ax4_span = gs[1, :]
        ax5_pos = gs[2, 0]
        ax6_pos = gs[2, 1]
        ax7_pos = gs[2, 2]
    else:
        # Plot without iteration history (root finding method)
        fig = plt.figure(figsize=(16, 8))
        gs = fig.add_gridspec(2, 3, hspace=0.3, wspace=0.3)
        
        ax4_span = gs[0, :]
        ax5_pos = gs[1, 0]
        ax6_pos = gs[1, 1]
        ax7_pos = gs[1, 2]
    
    # Plot 4: Cable shape with loading
    ax4 = fig.add_subplot(ax4_span)
    ax4.plot(results['x'], -results['y'], 'b-', linewidth=2, label='Cable shape')
    ax4.plot([0, analysis.L], [0, 0], 'k--', linewidth=1, label='Original position')
    
    # Mark maximum deflection point
    ax4.plot(results['f_position'], -results['f'], 'ro', markersize=10, 
            label=f'Max deflection: {results["f"]:.4f} m at x={results["f_position"]:.3f} m')
    
    # Plot nodal loads
    max_y = max(results['y']) if max(results['y']) > 0 else 1.0
    for i, (x, P) in enumerate(zip(results['x'], results['nodal_loads'])):
        if P > 0.01:
            scale = 0.015 * max_y
            ax4.arrow(x, 0, 0, -P*scale, head_width=0.1, head_length=max(P*scale*0.15, 0.01), 
                     fc='red', ec='red', alpha=0.6, linewidth=1)
    
    ax4.set_xlabel('x [m]')
    ax4.set_ylabel('Deflection [m]')
    ax4.set_title(f'Cable Shape and Loading (sag/span = {results["sag_ratio"]:.4f})')
    ax4.grid(True, alpha=0.3)
    ax4.legend()
    ax4.invert_yaxis()
    
    # Plot 5: Tension forces
    ax5 = fig.add_subplot(ax5_pos)
    ax5.plot(results['x'], results['T'], 'r-', linewidth=2, label='Total tension T')
    ax5.plot(results['x'], results['H_array'], 'b--', linewidth=2, label='Horizontal H')
    ax5.plot(results['x'], np.abs(results['V']), 'g--', linewidth=2, label='Vertical |V|')
    ax5.axhline(y=results['T_max'], color='r', linestyle=':', alpha=0.5, 
               label=f'T_max = {results["T_max"]:.2f} kN')
    ax5.plot(results['T_max_position'], results['T_max'], 'ro', markersize=8)
    ax5.set_xlabel('Position x [m]')
    ax5.set_ylabel('Force [kN]')
    ax5.set_title('Tension Force Distribution')
    ax5.grid(True, alpha=0.3)
    ax5.legend()
    
    # Plot 6: Cable angle
    ax6 = fig.add_subplot(ax6_pos)
    ax6.plot(results['x'], results['alpha'], 'b-', linewidth=2)
    ax6.axhline(y=0, color='k', linestyle=':', alpha=0.3)
    ax6.axvline(x=results['f_position'], color='r', linestyle='--', alpha=0.3,
               label=f'Max deflection at x={results["f_position"]:.3f} m')
    ax6.set_xlabel('Position x [m]')
    ax6.set_ylabel('Angle α [degrees]')
    ax6.set_title('Cable Inclination Angle')
    ax6.grid(True, alpha=0.3)
    ax6.legend()
    
    # Plot 7: Stress distribution
    ax7 = fig.add_subplot(ax7_pos)
    stress_dist = results['T'] / (analysis.A_eff * 1e6) * 1e3
    ax7.plot(results['x'], stress_dist, 'purple', linewidth=2)
    ax7.axhline(y=results['stress'], color='r', linestyle='--', 
               label=f'Avg: {results["stress"]:.2f} MPa')
    ax7.set_xlabel('Position x [m]')
    ax7.set_ylabel('Stress [MPa]')
    ax7.set_title('Stress Distribution')
    ax7.grid(True, alpha=0.3)
    ax7.legend()
    
    plt.show()


def print_summary(results):
    """Print detailed results summary"""
    print("\n" + "="*70)
    print("CABLE ANALYSIS RESULTS SUMMARY")
    print("="*70)
    print(f"Solution method:          {results['method']}")
    print(f"Converged:                {results['converged']}")
    print(f"Iterations:               {results['iterations']}")
    print(f"Total applied load:       {results['total_load']:.2f} kN")
    print(f"Left reaction:            {results['R_left']:.2f} kN")
    print(f"Right reaction:           {results['R_right']:.2f} kN")
    print(f"\n{'DEFLECTION:':<30}")
    print(f"  Maximum sag:            {results['f']:.6f} m")
    print(f"  Sag location:           {results['f_position']:.3f} m")
    print(f"  Sag ratio f/L:          {results['sag_ratio']:.6f}")
    print(f"\n{'FORCES:':<30}")
    print(f"  Horizontal H:           {results['H']:.2f} kN")
    print(f"  Maximum tension:        {results['T_max']:.2f} kN")
    print(f"  T_max location:         {results['T_max_position']:.3f} m")
    print(f"  Angle at left support:  {results['angle_left']:.2f}°")
    print(f"  Angle at right support: {results['angle_right']:.2f}°")
    print(f"\n{'MATERIAL RESPONSE:':<30}")
    print(f"  Strain ε:               {results['strain']:.6e}")
    print(f"  Average stress σ:       {results['stress']:.2f} MPa")
    print(f"\n{'GEOMETRY:':<30}")
    print(f"  Cable length:           {results['cable_length']:.6f} m")
    print(f"  Elongation:             {results['elongation']:.6f} m")
    print("="*70)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    
    # CREATE ANALYSIS OBJECT
    # ============================================================================
    L = 5.0          # Span [m]
    A_eff = 565*2    # Reinforcement area [mm²]
    E = 200000.0      # Elastic modulus [MPa]
    n_segments = 200  # Number of segments
    
    cable = CableAnalysis(L, A_eff, E, n_segments)
    
    # DEFINE LOADING
    # ============================================================================
    
    # # Example 1: Single asymmetric point load
    # cable.add_point_load(position=3.0, magnitude=100.0)
    
    #Example 2: Uniform load + asymmetric point load (uncomment to test)
    cable.add_line_load(start_pos=0.0, end_pos=L, 
                       start_mag=11.8, end_mag=11.8)
    # cable.add_point_load(position=3.0, magnitude=50.0)
    
    # Example 3: Linearly varying load (triangular)
    # cable.add_line_load(start_pos=0.0, end_pos=10.0, 
    #                    start_mag=0.0, end_mag=40.0)
    
    # ============================================================================
    
    # VISUALIZE LOADING
    cable.plot_loading()
    
    # SOLVE - Choose method
    # ============================================================================
    
    # METHOD 1: Root finding (RECOMMENDED - most stable, fast)
    print("\n### USING ROOT FINDING METHOD ###")
    results = cable.solve(method='rootfinding', verbose=True)
    
    # METHOD 2: Fixed point iteration (original method - less stable)
    # print("\n### USING FIXED POINT ITERATION ###")
    # results = cable.solve(method='fixed_point', f_initial=None, 
    #                      max_iter=200, tol=1e-6, omega=0.6, verbose=True)
    
    # ============================================================================
    
    # PRINT SUMMARY
    print_summary(results)
    
    # PLOT RESULTS
    plot_results(results, cable)