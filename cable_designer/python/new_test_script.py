import numpy as np
import matplotlib.pyplot as plt
from dataclasses import dataclass
from typing import List, Tuple, Optional
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import brentq, fsolve

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

@dataclass
class SupportProperties:
    """Horizontal support stiffness properties"""
    H_max: Optional[float] = None  # Maximum horizontal capacity [kN]
    K_h: Optional[float] = None    # Horizontal stiffness [kN/m]
    # If K_h is None but H_max is given, assumes rigid-plastic behavior

class CableAnalysis:
    """
    General cable analysis with arbitrary loading.
    Handles point loads, linearly varying line loads, and limited horizontal support capacity.
    """
    
    def __init__(self, L: float, A_eff: float, E: float, 
                 self_weight: float = 0.0, 
                 support: Optional[SupportProperties] = None,
                 n_segments: int = 200):
        """
        Parameters:
        -----------
        L : float
            Span length [m]
        A_eff : float
            Effective tension area (reinforcement area) [mm²]
        E : float
            Modulus of elasticity [MPa]
        self_weight : float
            Cable self-weight per unit length [kN/m] (along cable length)
        support : SupportProperties, optional
            Horizontal support properties (capacity and stiffness)
        n_segments : int
            Number of segments for discretization
        """
        self.L = L
        self.A_eff = A_eff / 1e6  # Convert to m²
        self.E = E * 1e3  # Convert to kN/m²
        self.self_weight = self_weight
        self.support = support if support is not None else SupportProperties()
        self.n_segments = n_segments
        
        # Discretization
        self.n_nodes = n_segments + 1
        self.x = np.linspace(0, L, self.n_nodes)
        self.dx = L / n_segments
        
        # Loads
        self.point_loads: List[PointLoad] = []
        self.line_loads: List[LineLoad] = []
        
        # Initial catenary shape
        self.y_initial = None
        self.H_initial = None
        self.f_initial = None
        
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
    
    def calculate_catenary_shape(self, H: float, w: float) -> Tuple[np.ndarray, float]:
        """Calculate catenary shape for given H and weight w"""
        if w == 0 or H == 0:
            return np.zeros_like(self.x), 0.0
        
        a = H / w
        x_centered = self.x - self.L/2
        y_cat = a * (np.cosh(x_centered / a) - 1)
        y_offset = y_cat[0]
        y = y_cat - y_offset
        f = np.max(y)
        
        return y, f
    
    def solve_initial_catenary(self, f_target: float, tol: float = 1e-6, 
                               verbose: bool = False):
        """Find H to achieve target sag f_target under self-weight"""
        if self.self_weight <= 0:
            if verbose:
                print("No self-weight specified, skipping initial catenary.")
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0
            return
        
        def residual(H):
            if H <= 0:
                return 1e10
            y, f = self.calculate_catenary_shape(H, self.self_weight)
            return f_target - f
        
        H_guess = self.self_weight * self.L**2 / (8 * f_target)
        H_min = H_guess * 0.1
        H_max = H_guess * 10
        
        try:
            H_solution = brentq(residual, H_min, H_max, xtol=tol)
            self.y_initial, self.f_initial = self.calculate_catenary_shape(
                H_solution, self.self_weight
            )
            self.H_initial = H_solution
            
            if verbose:
                print(f"\n{'='*70}")
                print("INITIAL CATENARY FROM SELF-WEIGHT")
                print(f"{'='*70}")
                print(f"Self-weight:        {self.self_weight:.4f} kN/m")
                print(f"Target sag:         {f_target:.6f} m")
                print(f"Achieved sag:       {self.f_initial:.6f} m")
                print(f"Horizontal tension: {self.H_initial:.2f} kN")
                
                dy_dx = np.gradient(self.y_initial, self.x)
                s_initial = np.trapz(np.sqrt(1 + dy_dx**2), self.x)
                print(f"Cable length:       {s_initial:.6f} m")
                print(f"Initial strain:     {(s_initial - self.L)/self.L:.6e}")
                print(f"{'='*70}\n")
                
        except ValueError as e:
            if verbose:
                print(f"Could not solve for initial catenary: {e}")
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0
    
    def calculate_nodal_loads(self) -> np.ndarray:
        """Calculate equivalent nodal loads (excluding self-weight)"""
        P = np.zeros(self.n_nodes)
        
        for pl in self.point_loads:
            idx = np.argmin(np.abs(self.x - pl.position))
            P[idx] += pl.magnitude
        
        for ll in self.line_loads:
            mask = (self.x >= ll.start_pos) & (self.x <= ll.end_pos)
            indices = np.where(mask)[0]
            
            if len(indices) < 2:
                continue
            
            for i in range(len(indices) - 1):
                idx1, idx2 = indices[i], indices[i + 1]
                x1, x2 = self.x[idx1], self.x[idx2]
                
                t1 = (x1 - ll.start_pos) / (ll.end_pos - ll.start_pos)
                t2 = (x2 - ll.start_pos) / (ll.end_pos - ll.start_pos)
                q1 = ll.start_mag + t1 * (ll.end_mag - ll.start_mag)
                q2 = ll.start_mag + t2 * (ll.end_mag - ll.start_mag)
                
                segment_length = x2 - x1
                segment_load = 0.5 * (q1 + q2) * segment_length
                
                P[idx1] += segment_load / 2
                P[idx2] += segment_load / 2
        
        return P
    
    def calculate_distributed_load(self) -> np.ndarray:
        """Calculate distributed load intensity (excluding self-weight)"""
        q = np.zeros(self.n_nodes)
        
        for ll in self.line_loads:
            mask = (self.x >= ll.start_pos) & (self.x <= ll.end_pos)
            x_in_range = self.x[mask]
            
            if len(x_in_range) > 0:
                t = (x_in_range - ll.start_pos) / (ll.end_pos - ll.start_pos)
                q_values = ll.start_mag + t * (ll.end_mag - ll.start_mag)
                q[mask] = q_values
        
        return q
    
    def calculate_additional_deflection(self, H: float, P: np.ndarray) -> np.ndarray:
        """Calculate additional deflection from applied loads"""
        q = self.calculate_distributed_load()
        
        p = q.copy()
        for i, P_i in enumerate(P):
            if P_i > 0 and i > 0 and i < self.n_nodes - 1:
                p[i] += P_i / self.dx
        
        y_prime_H = -cumulative_trapezoid(p, self.x, initial=0)
        y_H = cumulative_trapezoid(y_prime_H, self.x, initial=0)
        
        linear_correction = (y_H[-1] / self.L) * self.x
        y_H = y_H - linear_correction
        
        y_additional = y_H / H if H != 0 else y_H
        
        return y_additional
    
    def calculate_total_shape(self, H: float, P: np.ndarray) -> np.ndarray:
        """Calculate total cable shape"""
        if self.y_initial is not None:
            y_total = self.y_initial.copy()
        else:
            y_total = np.zeros_like(self.x)
        
        y_additional = self.calculate_additional_deflection(H, P)
        y_total += y_additional
        
        return y_total
    
    def calculate_strain_for_H(self, H: float, P: np.ndarray) -> float:
        """Calculate total strain for given H"""
        y = self.calculate_total_shape(H, P)
        dy_dx = np.gradient(y, self.x)
        s = np.trapz(np.sqrt(1 + dy_dx**2), self.x)
        strain = (s - self.L) / self.L
        return strain
    
    def calculate_horizontal_displacement(self, H: float) -> float:
        """
        Calculate horizontal displacement at support.
        
        Δ_h = H × L / (K_h)  if K_h is provided
        Δ_h = 0              if rigid support
        """
        if self.support.K_h is not None and self.support.K_h > 0:
            return H * self.L / self.support.K_h
        else:
            return 0.0
    
    def residual_function(self, H: float, P: np.ndarray) -> float:
        """Residual: H - E*A*strain"""
        strain = self.calculate_strain_for_H(H, P)
        H_material = self.E * self.A_eff * strain
        return H - H_material
    
    def solve_with_H_limit(self, P: np.ndarray, H_max: float, verbose: bool = True):
        """
        Solve when horizontal capacity is limited.
        
        Strategy: Find sag such that equilibrium H equals H_max
        """
        if verbose:
            print(f"\n{'='*70}")
            print(f"SOLVING WITH LIMITED HORIZONTAL CAPACITY: H_max = {H_max:.2f} kN")
            print(f"{'='*70}")
        
        # For limited H, we need to find the sag that satisfies:
        # 1. Equilibrium: H is determined by shape and loads
        # 2. Material: H = E*A*strain
        # 3. Constraint: H ≤ H_max
        
        # Check if unconstrained solution violates H_max
        total_load = np.sum(P) + self.self_weight * self.L
        
        # Minimum sag for equilibrium (parabolic approximation)
        # H_max = total_load × L / (8 × f_min)
        # → f_min = total_load × L / (8 × H_max)
        f_min_equilibrium = total_load * self.L / (8 * H_max)
        
        if verbose:
            print(f"Minimum sag for H={H_max:.2f} kN: {f_min_equilibrium:.6f} m")
        
        # We need to find H and corresponding shape where:
        # - H from equilibrium matches H from material
        # - H = H_max (or less if material is softer)
        
        # Strategy: Search over range of H from 0 to H_max
        # Find H where material capacity equals equilibrium requirement
        
        def residual_with_limit(H_test):
            """Residual for constrained case"""
            if H_test <= 0 or H_test > H_max * 1.001:  # Small tolerance
                return 1e10
            return self.residual_function(H_test, P)
        
        # Search range
        H_search_min = max(H_max * 0.1, 1.0)
        H_search_max = H_max
        
        try:
            # Check if residual has opposite signs at bounds
            r_min = residual_with_limit(H_search_min)
            r_max = residual_with_limit(H_search_max)
            
            if r_min * r_max > 0:
                # Same sign - probably hits limit
                if verbose:
                    print(f"Material constraint allows H={H_max:.2f} kN")
                H_solution = H_max
                converged = True
            else:
                H_solution = brentq(
                    residual_with_limit,
                    H_search_min,
                    H_search_max,
                    xtol=1e-6,
                    maxiter=100
                )
                converged = True
                if verbose:
                    print(f"Solved with H={H_solution:.2f} kN < H_max")
        except ValueError as e:
            if verbose:
                print(f"Using H_max as solution: {e}")
            H_solution = H_max
            converged = True
        
        return H_solution, converged
    
    def solve(self, initial_sag: float = None, verbose: bool = True):
        """
        Solve for cable equilibrium.
        
        Considers horizontal support capacity if specified.
        """
        # Step 1: Initial catenary
        if self.self_weight > 0:
            if initial_sag is None:
                initial_sag = self.L / 100
            self.solve_initial_catenary(initial_sag, verbose=verbose)
        else:
            self.y_initial = np.zeros_like(self.x)
            self.H_initial = 0.0
            self.f_initial = 0.0
        
        # Step 2: Get applied loads
        P = self.calculate_nodal_loads()
        total_applied_load = np.sum(P)
        
        # Step 3: Calculate reactions
        R_left = np.sum(P * (self.L - self.x)) / self.L
        R_right = np.sum(P * self.x) / self.L
        
        if self.self_weight > 0:
            total_self_weight = self.self_weight * self.L
            R_left += total_self_weight / 2
            R_right += total_self_weight / 2
        
        # Step 4: Solve considering H_max constraint
        if self.support.H_max is not None:
            H_solution, converged = self.solve_with_H_limit(P, self.support.H_max, verbose)
            constrained = True
        else:
            # Unconstrained solution
            if verbose:
                print("\n" + "="*70)
                print("SOLVING FOR UNCONSTRAINED EQUILIBRIUM")
                print("="*70)
            
            total_load = abs(total_applied_load) + self.self_weight * self.L
            f_max = self.L / 10
            H_min = max(total_load * self.L / (8 * f_max), 1.0)
            
            f_min = self.L / 1000
            H_max = total_load * self.L / (8 * f_min)
            
            try:
                H_solution = brentq(
                    self.residual_function,
                    H_min,
                    H_max,
                    args=(P,),
                    xtol=1e-6,
                    maxiter=100
                )
                converged = True
            except ValueError as e:
                if verbose:
                    print(f"Root finding failed: {e}")
                H_solution = H_min
                converged = False
            
            constrained = False
        
        # Step 5: Calculate horizontal displacement
        delta_h = self.calculate_horizontal_displacement(H_solution)
        
        # Step 6: Final results
        y_total = self.calculate_total_shape(H_solution, P)
        strain = self.calculate_strain_for_H(H_solution, P)
        dy_dx = np.gradient(y_total, self.x)
        
        idx_f_max = np.argmax(y_total)
        f_final = y_total[idx_f_max]
        x_f_final = self.x[idx_f_max]
        
        alpha = np.arctan(dy_dx)
        T = H_solution / np.cos(alpha)
        V = H_solution * np.tan(alpha)
        
        T_max = np.max(T)
        idx_max = np.argmax(T)
        
        angle_left = np.degrees(alpha[1])
        angle_right = np.degrees(alpha[-2])
        
        s = np.trapz(np.sqrt(1 + dy_dx**2), self.x)
        elongation = s - self.L
        
        stress_MPa = (self.E * strain) / 1e3
        
        # Check if H_max was active constraint
        H_utilization = H_solution / self.support.H_max if self.support.H_max else 0.0
        
        if verbose:
            print(f"\n{'='*70}")
            print("SOLUTION SUMMARY")
            print(f"{'='*70}")
            print(f"Converged: {converged}")
            print(f"H = {H_solution:.2f} kN")
            if self.support.H_max:
                print(f"H_max = {self.support.H_max:.2f} kN")
                print(f"H utilization: {H_utilization*100:.1f}%")
                print(f"Constrained by H_max: {constrained and H_utilization > 0.99}")
            print(f"Max sag f = {f_final:.6f} m at x = {x_f_final:.3f} m")
            print(f"Horizontal displacement: {delta_h*1000:.3f} mm")
            print(f"{'='*70}")
        
        results = {
            'converged': converged,
            'method': 'rootfinding',
            'constrained_by_H_max': constrained and H_utilization > 0.99,
            'H_utilization': H_utilization,
            'has_initial_sag': self.self_weight > 0,
            'f_initial': self.f_initial,
            'H_initial': self.H_initial,
            'f': f_final,
            'f_position': x_f_final,
            'H': H_solution,
            'H_max': self.support.H_max,
            'delta_h': delta_h,
            'T_max': T_max,
            'T_max_position': self.x[idx_max],
            'strain': strain,
            'stress': stress_MPa,
            'angle_left': angle_left,
            'angle_right': angle_right,
            'cable_length': s,
            'elongation': elongation,
            'sag_ratio': f_final / self.L,
            'total_load': total_applied_load,
            'self_weight_load': self.self_weight * self.L,
            'R_left': R_left,
            'R_right': R_right,
            'x': self.x,
            'y_initial': self.y_initial,
            'y_total': y_total,
            'T': T,
            'alpha': np.degrees(alpha),
            'V': V,
            'H_array': np.ones_like(self.x) * H_solution,
            'nodal_loads': P
        }
        
        return results
    
    def plot_loading(self):
        """Plot the applied loading diagram"""
        fig, ax = plt.subplots(figsize=(12, 4))
        
        if self.self_weight > 0:
            ax.fill_between([0, self.L], 0, -self.self_weight, 
                          alpha=0.2, color='gray', 
                          label=f'Self-weight: {self.self_weight:.3f} kN/m')
        
        for ll in self.line_loads:
            x_load = np.linspace(ll.start_pos, ll.end_pos, 50)
            q_load = ll.start_mag + (x_load - ll.start_pos) / (ll.end_pos - ll.start_pos) * (ll.end_mag - ll.start_mag)
            ax.fill_between(x_load, 0, -q_load, alpha=0.3, 
                          label=f'Line load {ll.start_mag:.1f}-{ll.end_mag:.1f} kN/m')
            ax.plot(x_load, -q_load, 'b-', linewidth=2)
        
        for pl in self.point_loads:
            max_load = max([abs(p.magnitude) for p in self.point_loads] + [20])
            ax.arrow(pl.position, 0, 0, -pl.magnitude*0.8, head_width=0.1, 
                    head_length=max(abs(pl.magnitude)*0.1, 2), 
                    fc='red', ec='red', linewidth=2)
            ax.plot(pl.position, 0, 'ro', markersize=8)
            ax.text(pl.position, pl.magnitude*0.15, f'{pl.magnitude:.1f} kN', 
                   ha='center', fontsize=10)
        
        ax.axhline(y=0, color='k', linewidth=1)
        ax.plot([0, self.L], [0, 0], 'ko', markersize=10)
        ax.set_xlabel('Position [m]')
        ax.set_ylabel('Load [kN or kN/m]')
        ax.set_title('Applied Loading')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.invert_yaxis()
        plt.tight_layout()
        plt.show()


def plot_results(results, analysis):
    """Plot comprehensive results"""
    fig = plt.figure(figsize=(16, 10))
    gs = fig.add_gridspec(2, 3, hspace=0.3, wspace=0.3)
    
    # Plot 1: Cable shapes
    ax1 = fig.add_subplot(gs[0, :])
    
    if results['has_initial_sag']:
        ax1.plot(results['x'], -results['y_initial'], 'g--', linewidth=2, 
                label=f'Initial catenary (f={results["f_initial"]:.4f} m)')
    
    ax1.plot(results['x'], -results['y_total'], 'b-', linewidth=2, 
            label=f'Final shape (f={results["f"]:.4f} m)')
    ax1.plot([0, analysis.L], [0, 0], 'k--', linewidth=1, label='Original position')
    
    ax1.plot(results['f_position'], -results['f'], 'ro', markersize=10, 
            label=f'Max deflection at x={results["f_position"]:.3f} m')
    
    # Show horizontal displacement
    if results['delta_h'] > 0:
        ax1.annotate('', xy=(analysis.L + results['delta_h'], 0), 
                    xytext=(analysis.L, 0),
                    arrowprops=dict(arrowstyle='<->', color='purple', lw=2))
        ax1.text(analysis.L + results['delta_h']/2, 0.05*results['f'], 
                f'Δ_h={results["delta_h"]*1000:.1f}mm', 
                ha='center', color='purple', fontweight='bold')
    
    max_y = max(results['y_total']) if max(results['y_total']) > 0 else 1.0
    for i, (x, P) in enumerate(zip(results['x'], results['nodal_loads'])):
        if abs(P) > 0.01:
            scale = 0.015 * max_y
            ax1.arrow(x, 0, 0, -P*scale, head_width=0.1, 
                     head_length=max(abs(P)*scale*0.15, 0.01), 
                     fc='red', ec='red', alpha=0.6, linewidth=1)
    
    title = f'Cable Shape (sag/span = {results["sag_ratio"]:.4f})'
    if results.get('constrained_by_H_max', False):
        title += f' - CONSTRAINED BY H_max'
    ax1.set_title(title, fontweight='bold' if results.get('constrained_by_H_max') else 'normal')
    
    ax1.set_xlabel('x [m]')
    ax1.set_ylabel('Deflection [m]')
    ax1.grid(True, alpha=0.3)
    ax1.legend()
    ax1.invert_yaxis()
    
    # Plot 2: Tension forces
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.plot(results['x'], results['T'], 'r-', linewidth=2, label='Total tension T')
    ax2.plot(results['x'], results['H_array'], 'b--', linewidth=2, label=f'Horizontal H={results["H"]:.1f} kN')
    ax2.plot(results['x'], np.abs(results['V']), 'g--', linewidth=2, label='Vertical |V|')
    ax2.axhline(y=results['T_max'], color='r', linestyle=':', alpha=0.5, 
               label=f'T_max = {results["T_max"]:.2f} kN')
    
    if results['H_max']:
        ax2.axhline(y=results['H_max'], color='orange', linestyle='--', linewidth=2,
                   label=f'H_max = {results["H_max"]:.2f} kN')
    
    ax2.plot(results['T_max_position'], results['T_max'], 'ro', markersize=8)
    ax2.set_xlabel('Position x [m]')
    ax2.set_ylabel('Force [kN]')
    ax2.set_title('Tension Force Distribution')
    ax2.grid(True, alpha=0.3)
    ax2.legend()
    
    # Plot 3: Cable angle
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.plot(results['x'], results['alpha'], 'b-', linewidth=2)
    ax3.axhline(y=0, color='k', linestyle=':', alpha=0.3)
    ax3.axvline(x=results['f_position'], color='r', linestyle='--', alpha=0.3,
               label=f'Max deflection at x={results["f_position"]:.3f} m')
    ax3.set_xlabel('Position x [m]')
    ax3.set_ylabel('Angle α [degrees]')
    ax3.set_title('Cable Inclination Angle')
    ax3.grid(True, alpha=0.3)
    ax3.legend()
    
    # Plot 4: Capacity utilization
    ax4 = fig.add_subplot(gs[1, 2])
    
    if results['H_max']:
        # Bar chart showing H vs H_max
        bars = ax4.bar(['H', 'H_max'], [results['H'], results['H_max']], 
                      color=['blue', 'orange'], alpha=0.7)
        ax4.set_ylabel('Horizontal Force [kN]')
        ax4.set_title(f'H Utilization: {results["H_utilization"]*100:.1f}%')
        ax4.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars
        for bar in bars:
            height = bar.get_height()
            ax4.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.1f} kN',
                    ha='center', va='bottom')
    else:
        stress_dist = results['T'] / (analysis.A_eff * 1e6) * 1e3
        ax4.plot(results['x'], stress_dist, 'purple', linewidth=2)
        ax4.axhline(y=results['stress'], color='r', linestyle='--', 
                   label=f'Avg: {results["stress"]:.2f} MPa')
        ax4.set_xlabel('Position x [m]')
        ax4.set_ylabel('Stress [MPa]')
        ax4.set_title('Stress Distribution')
        ax4.grid(True, alpha=0.3)
        ax4.legend()
    
    plt.show()


def print_summary(results):
    """Print detailed results summary"""
    print("\n" + "="*70)
    print("CABLE ANALYSIS RESULTS SUMMARY")
    print("="*70)
    print(f"Solution method:          {results['method']}")
    print(f"Converged:                {results['converged']}")
    
    if results['H_max']:
        print(f"\n{'HORIZONTAL SUPPORT CAPACITY:':<30}")
        print(f"  H_max:                  {results['H_max']:.2f} kN")
        print(f"  H (actual):             {results['H']:.2f} kN")
        print(f"  Utilization:            {results['H_utilization']*100:.1f}%")
        print(f"  Constrained:            {results['constrained_by_H_max']}")
        print(f"  Horizontal displacement:{results['delta_h']*1000:.3f} mm")
    
    if results['has_initial_sag']:
        print(f"\n{'INITIAL STATE (SELF-WEIGHT):':<30}")
        print(f"  Self-weight load:       {results['self_weight_load']:.2f} kN")
        print(f"  Initial sag:            {results['f_initial']:.6f} m")
        print(f"  Initial H:              {results['H_initial']:.2f} kN")
    
    print(f"\n{'APPLIED LOADING:':<30}")
    print(f"  Applied loads:          {results['total_load']:.2f} kN")
    print(f"  Left reaction:          {results['R_left']:.2f} kN")
    print(f"  Right reaction:         {results['R_right']:.2f} kN")
    
    print(f"\n{'FINAL DEFLECTION:':<30}")
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
    
    # ============================================================================
    # EXAMPLE 1: Unconstrained (infinite horizontal capacity)
    # ============================================================================
    print("\n" + "#"*70)
    print("# EXAMPLE 1: UNCONSTRAINED HORIZONTAL SUPPORT")
    print("#"*70)
    
    L = 10.0
    A_eff = 1200.0
    E = 200000.0
    self_weight = 0.5
    
    cable1 = CableAnalysis(L, A_eff, E, self_weight=self_weight)
    cable1.add_point_load(position=5.0, magnitude=100.0)
    
    cable1.plot_loading()
    results1 = cable1.solve(initial_sag=0.25, verbose=True)
    print_summary(results1)
    plot_results(results1, cable1)
    
    # ============================================================================
    # EXAMPLE 2: Limited horizontal capacity (H_max = 500 kN, rigid)
    # ============================================================================
    print("\n" + "#"*70)
    print("# EXAMPLE 2: LIMITED HORIZONTAL CAPACITY (RIGID SUPPORT)")
    print("#"*70)
    
    support2 = SupportProperties(H_max=500.0)  # Rigid-plastic
    cable2 = CableAnalysis(L, A_eff, E, self_weight=self_weight, support=support2)
    cable2.add_point_load(position=5.0, magnitude=100.0)
    
    cable2.plot_loading()
    results2 = cable2.solve(initial_sag=0.15, verbose=True)
    print_summary(results2)
    plot_results(results2, cable2)
    
    # ============================================================================
    # EXAMPLE 3: Limited capacity with flexible support
    # ============================================================================
    print("\n" + "#"*70)
    print("# EXAMPLE 3: LIMITED CAPACITY WITH FLEXIBLE SUPPORT")
    print("#"*70)
    
    support3 = SupportProperties(H_max=500.0, K_h=50000.0)  # 50 kN/mm = 50000 kN/m
    cable3 = CableAnalysis(L, A_eff, E, self_weight=self_weight, support=support3)
    cable3.add_point_load(position=5.0, magnitude=100.0)
    
    cable3.plot_loading()
    results3 = cable3.solve(initial_sag=0.15, verbose=True)
    print_summary(results3)
    plot_results(results3, cable3)
    
    # ============================================================================
    # EXAMPLE 4: Very low H_max - forces large sag
    # ============================================================================
    print("\n" + "#"*70)
    print("# EXAMPLE 4: VERY LOW H_max (SOFT ANCHORAGE)")
    print("#"*70)
    
    support4 = SupportProperties(H_max=100.0)  # Very limited
    cable4 = CableAnalysis(L, A_eff, E, self_weight=self_weight, support=support4)
    cable4.add_point_load(position=5.0, magnitude=100.0)
    
    cable4.plot_loading()
    results4 = cable4.solve(initial_sag=0.15, verbose=True)
    print_summary(results4)
    plot_results(results4, cable4)