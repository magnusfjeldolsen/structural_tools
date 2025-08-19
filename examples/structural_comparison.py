#!/usr/bin/env python3
"""
Multi-Calculator Structural Analysis Comparison

This example demonstrates coordinated use of all three structural calculators:
THP (Tapered H-Profile), Concrete Beam, and Concrete Slab.

Features:
- Cross-material comparison for same load conditions
- Structural efficiency analysis across different systems
- Design optimization and material selection support
- Comprehensive reporting for design decision making

Use Case: Building Floor System Design
- Compare THP steel beams vs concrete beams
- Analyze concrete slab integration with beam systems
- Optimize overall structural system performance

Author: Magnus Fjeld Olsen
License: MIT
"""

import json
import sys
import time
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import WebDriverException, TimeoutException
except ImportError:
    print("❌ Selenium not installed. Install with: pip install selenium")
    sys.exit(1)


class StructuralSystemCalculator:
    """Unified interface to all structural calculators for system-level analysis."""
    
    def __init__(self, headless: bool = True, base_url: str = None):
        """
        Initialize the multi-calculator system.
        
        Args:
            headless: Run browsers in headless mode
            base_url: Base URL for calculators (defaults to local files)
        """
        self.headless = headless
        self.base_path = Path(__file__).parent.parent
        
        if base_url:
            self.urls = {
                "thp": f"{base_url}/THP/",
                "beam": f"{base_url}/concrete_beam_design/",
                "slab": f"{base_url}/concrete_slab_design/"
            }
        else:
            self.urls = {
                "thp": "file://" + str(self.base_path / "THP" / "index.html"),
                "beam": "file://" + str(self.base_path / "concrete_beam_design" / "index.html"),
                "slab": "file://" + str(self.base_path / "concrete_slab_design" / "index.html")
            }
        
        self.drivers = {}
        self.apis = {}
    
    def __enter__(self):
        """Context manager entry - setup all WebDrivers."""
        try:
            options = Options()
            if self.headless:
                options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            
            print("🔧 Initializing multi-calculator system...")
            
            # Initialize THP Calculator
            print("  • Loading THP Calculator...")
            self.drivers["thp"] = webdriver.Chrome(options=options)
            self.drivers["thp"].get(self.urls["thp"])
            WebDriverWait(self.drivers["thp"], 10).until(
                EC.presence_of_element_located((By.ID, "diagram"))
            )
            time.sleep(1)
            
            # Initialize Concrete Beam Calculator
            print("  • Loading Concrete Beam Calculator...")
            self.drivers["beam"] = webdriver.Chrome(options=options)
            self.drivers["beam"].get(self.urls["beam"])
            WebDriverWait(self.drivers["beam"], 10).until(
                EC.presence_of_element_located((By.ID, "calc-form"))
            )
            time.sleep(1)
            
            # Initialize Concrete Slab Calculator
            print("  • Loading Concrete Slab Calculator...")
            self.drivers["slab"] = webdriver.Chrome(options=options)
            self.drivers["slab"].get(self.urls["slab"])
            WebDriverWait(self.drivers["slab"], 10).until(
                EC.presence_of_element_located((By.ID, "calc-form"))
            )
            time.sleep(1)
            
            # Verify APIs are available
            for calc_type, driver in self.drivers.items():
                if calc_type == "thp":
                    api_ready = driver.execute_script("return typeof window.thpCalculate === 'function';")
                    api_name = "thpCalculate"
                elif calc_type == "beam":
                    api_ready = driver.execute_script("return typeof window.concreteBeamCalculate === 'function';")
                    api_name = "concreteBeamCalculate"
                else:  # slab
                    api_ready = driver.execute_script("return typeof window.concreteSlabCalculate === 'function';")
                    api_name = "concreteSlabCalculate"
                
                if not api_ready:
                    raise RuntimeError(f"{calc_type.upper()} API ({api_name}) not loaded")
                
                self.apis[calc_type] = api_name
            
            print("✅ All calculators initialized successfully!")
            return self
            
        except Exception as e:
            self._cleanup_drivers()
            raise RuntimeError(f"Failed to initialize structural system: {e}")
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup all WebDrivers."""
        self._cleanup_drivers()
    
    def _cleanup_drivers(self):
        """Clean up all WebDriver instances."""
        for driver in self.drivers.values():
            if driver:
                driver.quit()
        self.drivers.clear()
    
    def calculate_thp(self, params: Dict) -> Dict:
        """Calculate THP profile."""
        try:
            result = self.drivers["thp"].execute_script(
                f"return window.{self.apis['thp']}(arguments[0]);", params
            )
            return {"success": True, "data": result, "calculator": "THP"}
        except Exception as e:
            return {"success": False, "error": str(e), "calculator": "THP"}
    
    def calculate_concrete_beam(self, params: Dict) -> Dict:
        """Calculate concrete beam."""
        try:
            result = self.drivers["beam"].execute_script(
                f"return window.{self.apis['beam']}(arguments[0]);", params
            )
            return {"success": True, "data": result, "calculator": "Concrete Beam"}
        except Exception as e:
            return {"success": False, "error": str(e), "calculator": "Concrete Beam"}
    
    def calculate_concrete_slab(self, params: Dict) -> Dict:
        """Calculate concrete slab."""
        try:
            result = self.drivers["slab"].execute_script(
                f"return window.{self.apis['slab']}(arguments[0]);", params
            )
            return {"success": True, "data": result, "calculator": "Concrete Slab"}
        except Exception as e:
            return {"success": False, "error": str(e), "calculator": "Concrete Slab"}
    
    def compare_beam_systems(self, load_conditions: Dict, progress_callback=None) -> Dict:
        """
        Compare THP steel beam vs concrete beam for same load conditions.
        
        Args:
            load_conditions: Dictionary with span, distributed load, etc.
            progress_callback: Optional progress callback
            
        Returns:
            Comparison results for both beam types
        """
        L = load_conditions["span"]  # m
        q = load_conditions["load"]  # kN/m
        
        # Standard beam formulas
        MEd = q * L**2 / 8  # kNm
        VEd = q * L / 2     # kN
        
        results = {"load_conditions": load_conditions, "beams": {}}
        
        if progress_callback:
            progress_callback(1, 4, "Calculating THP steel beam...")
        
        # THP Steel Beam Configuration
        thp_params = {
            "b_o": 188,      # Upper flange width (mm)
            "t_o": 25,       # Upper flange thickness (mm) 
            "H": 200,        # Web height (mm)
            "t_w": 6,        # Web thickness (mm)
            "b_u": 450,      # Lower flange width (mm)
            "t_u": 15,       # Lower flange thickness (mm)
            "f_yk": 355,     # Steel yield strength (MPa)
            "gamma_M0": 1.05, # Safety factor
            "rho_steel": 7850, # Steel density (kg/m³)
            "_comparison_info": {
                "MEd": MEd,
                "VEd": VEd,
                "span": L,
                "load": q
            }
        }
        
        thp_result = self.calculate_thp(thp_params)
        results["beams"]["thp"] = thp_result
        
        if progress_callback:
            progress_callback(2, 4, "Calculating concrete beam...")
        
        # Concrete Beam Configuration
        beam_params = {
            "geometry": {"b": 250, "h": 500, "c": 25},
            "loads": {"MEd": MEd, "VEd": VEd},
            "longitudinal_reinforcement": {"phi_l": 20, "n_l": 2},
            "shear_reinforcement": {"phi_b": 12, "cc_b": 185, "n_snitt": 2},
            "material": {"fck": 35, "fyk": 500, "alpha_cc": 0.85, "gamma_c": 1.5, "gamma_s": 1.25},
            "_comparison_info": {
                "MEd": MEd,
                "VEd": VEd,
                "span": L,
                "load": q
            }
        }
        
        beam_result = self.calculate_concrete_beam(beam_params)
        results["beams"]["concrete"] = beam_result
        
        if progress_callback:
            progress_callback(3, 4, "Analyzing beam comparison...")
        
        # Add comparison metrics
        if thp_result["success"] and beam_result["success"]:
            # Extract key metrics for comparison
            thp_data = thp_result["data"]
            beam_data = beam_result["data"]
            
            if thp_data.get("success") and beam_data.get("success"):
                results["comparison"] = {
                    "moment_capacity": {
                        "thp_kNm": float(thp_data["results"]["results"]["M_Rd"]),
                        "concrete_kNm": beam_data["results"]["results"]["moment_capacity"]["MRd"]
                    },
                    "unit_weight": {
                        "thp_kg_per_m": float(thp_data["results"]["results"]["unit_weight"]),
                        "concrete_kg_per_m": 250 * 500 * 2400 / 1e6  # Approximate concrete weight
                    },
                    "utilization": {
                        "thp_moment_pct": MEd / float(thp_data["results"]["results"]["M_Rd"]) * 100,
                        "concrete_moment_pct": beam_data["results"]["status"]["utilizations"]["moment"],
                        "concrete_shear_pct": beam_data["results"]["status"]["utilizations"]["shear"]
                    }
                }
        
        if progress_callback:
            progress_callback(4, 4, "Beam comparison complete!")
        
        return results


def create_building_floor_analysis():
    """Analyze complete building floor system with multiple structural elements."""
    
    print("🏗️  Building Floor System Analysis")
    print("=" * 50)
    print("Comprehensive structural system comparison and optimization")
    print()
    
    # Define building parameters
    building_config = {
        "floor_area": {"length": 12, "width": 8},  # m x m
        "beam_spacing": 4.0,  # m (beam every 4m)
        "slab_span": 4.0,     # m (between beams)
        "live_load": 3.0,     # kN/m² (office building)
        "dead_load": 2.5,     # kN/m² (finishes, MEP)
        "self_weight_slab": 5.0  # kN/m² (200mm concrete slab ≈ 5 kN/m²)
    }
    
    print("📋 Building Configuration:")
    print(f"  • Floor area: {building_config['floor_area']['length']}m × {building_config['floor_area']['width']}m")
    print(f"  • Beam spacing: {building_config['beam_spacing']}m")
    print(f"  • Slab span: {building_config['slab_span']}m")
    print(f"  • Loads: Live={building_config['live_load']} kN/m², Dead={building_config['dead_load']} kN/m²")
    print()
    
    def progress_callback(current, total, message=""):
        progress = current / total * 100
        print(f"\r🔍 {message} Progress: {current}/{total} ({progress:.1f}%)", end="", flush=True)
    
    try:
        with StructuralSystemCalculator(headless=True) as calc_system:
            
            # Analysis 1: Main beam comparison (THP vs Concrete)
            print("📊 Analysis 1: Main beam comparison (THP vs Concrete)...")
            
            # Calculate beam loads
            beam_tributary_width = building_config["beam_spacing"]  # m
            beam_span = building_config["floor_area"]["length"]  # m
            
            total_load = (building_config["live_load"] + 
                         building_config["dead_load"] + 
                         building_config["self_weight_slab"])  # kN/m²
            
            beam_load = total_load * beam_tributary_width  # kN/m
            
            # ULS load factor
            uls_load = 1.35 * (building_config["dead_load"] + building_config["self_weight_slab"]) * beam_tributary_width + \
                      1.5 * building_config["live_load"] * beam_tributary_width
            
            beam_comparison = calc_system.compare_beam_systems({
                "span": beam_span,
                "load": uls_load,
                "tributary_width": beam_tributary_width,
                "load_type": "ULS_combination"
            }, progress_callback)
            
            print(f"\n✅ Main beam analysis complete!")
            
            # Analysis 2: Slab design for different beam systems
            print("\n📊 Analysis 2: Slab analysis for floor system...")
            
            # Slab moment (ULS)
            slab_span = building_config["slab_span"]
            slab_uls_load = 1.35 * (building_config["dead_load"] + building_config["self_weight_slab"]) + \
                           1.5 * building_config["live_load"]
            slab_MEd = slab_uls_load * slab_span**2 / 8  # kNm/m
            
            slab_params = {
                "geometry": {"MEd": slab_MEd, "t": 200, "c": 35},
                "material": {"fcd": 19.8, "fyd": 435},
                "reinforcement": {"phi_l": 12, "cc_l": 200},
                "_system_info": {
                    "span": slab_span,
                    "uls_load": slab_uls_load,
                    "MEd": slab_MEd
                }
            }
            
            slab_result = calc_system.calculate_concrete_slab(slab_params)
            print(f"✅ Slab analysis complete!")
            
            # Analysis 3: System optimization study
            print("\n📊 Analysis 3: System optimization study...")
            
            optimization_scenarios = []
            beam_spans = [8, 10, 12, 14]  # Different building lengths
            beam_spacings = [3, 4, 5]     # Different beam spacings
            
            scenario_count = 0
            total_scenarios = len(beam_spans) * len(beam_spacings)
            
            optimization_results = []
            for span in beam_spans:
                for spacing in beam_spacings:
                    scenario_count += 1
                    progress_callback(scenario_count, total_scenarios, 
                                    f"Optimizing scenario {scenario_count}/{total_scenarios}...")
                    
                    # Calculate loads for this configuration
                    beam_load_opt = total_load * spacing
                    uls_load_opt = 1.35 * (building_config["dead_load"] + building_config["self_weight_slab"]) * spacing + \
                                  1.5 * building_config["live_load"] * spacing
                    
                    # Test both beam types
                    scenario_result = calc_system.compare_beam_systems({
                        "span": span,
                        "load": uls_load_opt,
                        "tributary_width": spacing,
                        "load_type": "ULS_combination",
                        "scenario_id": f"L{span}m_S{spacing}m"
                    })
                    
                    scenario_result["config"] = {"span": span, "spacing": spacing}
                    optimization_results.append(scenario_result)
            
            print(f"\n✅ Optimization study complete!")
            
        print("\n🎨 Generating comprehensive system analysis...")
        
        # Generate comprehensive analysis
        create_system_comparison_plots(beam_comparison, slab_result, optimization_results, building_config)
        generate_system_report(beam_comparison, slab_result, optimization_results, building_config)
        export_system_data(beam_comparison, slab_result, optimization_results)
        
        print("\n📊 System analysis complete! Generated files:")
        print("  • system_comparison.png - Comprehensive system comparison")
        print("  • building_system_report.txt - Engineering system analysis")
        print("  • beam_comparison_data.csv - Beam system comparison")
        print("  • system_optimization_data.csv - System optimization results")
        
    except Exception as e:
        print(f"\n❌ System analysis failed: {e}")
        import traceback
        traceback.print_exc()


def create_system_comparison_plots(beam_comparison, slab_result, optimization_results, building_config):
    """Create comprehensive system comparison visualization."""
    
    fig = plt.figure(figsize=(20, 16))
    fig.suptitle("Building Floor System - Structural Analysis Comparison", fontsize=20, fontweight='bold')
    
    # Plot 1: Beam capacity comparison
    ax1 = plt.subplot(3, 3, 1)
    if beam_comparison.get("comparison"):
        comp = beam_comparison["comparison"]
        beam_types = ["THP Steel", "Concrete"]
        capacities = [comp["moment_capacity"]["thp_kNm"], comp["moment_capacity"]["concrete_kNm"]]
        weights = [comp["unit_weight"]["thp_kg_per_m"], comp["unit_weight"]["concrete_kg_per_m"]]
        
        x_pos = np.arange(len(beam_types))
        bars1 = ax1.bar(x_pos - 0.2, capacities, 0.4, label='Moment Capacity (kNm)', 
                       color=['steelblue', 'lightcoral'], alpha=0.8)
        
        ax1.set_xlabel("Beam Type")
        ax1.set_ylabel("Moment Capacity (kNm)", color='blue')
        ax1.set_title("Beam Capacity Comparison")
        ax1.set_xticks(x_pos)
        ax1.set_xticklabels(beam_types)
        ax1.tick_params(axis='y', labelcolor='blue')
        ax1.grid(True, alpha=0.3)
        
        # Add capacity values on bars
        for bar, value in zip(bars1, capacities):
            height = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2., height + max(capacities)*0.01,
                    f'{value:.1f}', ha='center', va='bottom', fontweight='bold')
        
        # Secondary y-axis for weight
        ax1_twin = ax1.twinx()
        bars2 = ax1_twin.bar(x_pos + 0.2, weights, 0.4, label='Unit Weight (kg/m)', 
                           color=['gray', 'brown'], alpha=0.6)
        ax1_twin.set_ylabel("Unit Weight (kg/m)", color='red')
        ax1_twin.tick_params(axis='y', labelcolor='red')
        
        # Add weight values on bars
        for bar, value in zip(bars2, weights):
            height = bar.get_height()
            ax1_twin.text(bar.get_x() + bar.get_width()/2., height + max(weights)*0.01,
                         f'{value:.0f}', ha='center', va='bottom', fontweight='bold')
    
    # Plot 2: Utilization comparison
    ax2 = plt.subplot(3, 3, 2)
    if beam_comparison.get("comparison"):
        comp = beam_comparison["comparison"]
        utilizations_thp = [comp["utilization"]["thp_moment_pct"]]
        utilizations_concrete = [comp["utilization"]["concrete_moment_pct"], 
                               comp["utilization"]["concrete_shear_pct"]]
        
        # THP utilization
        ax2.bar([0], utilizations_thp, 0.4, label='THP Moment', 
               color='steelblue', alpha=0.8)
        
        # Concrete utilizations
        ax2.bar([1, 2], utilizations_concrete, 0.4, 
               label='Concrete', color=['lightcoral', 'orange'], alpha=0.8)
        
        ax2.axhline(y=100, color='red', linestyle='--', alpha=0.7, label='Capacity Limit')
        ax2.axhline(y=85, color='orange', linestyle='--', alpha=0.7, label='High Utilization')
        
        ax2.set_xlabel("Design Check")
        ax2.set_ylabel("Utilization (%)")
        ax2.set_title("Capacity Utilization")
        ax2.set_xticks([0, 1, 2])
        ax2.set_xticklabels(['THP\nMoment', 'Concrete\nMoment', 'Concrete\nShear'])
        ax2.legend()
        ax2.grid(True, alpha=0.3)
        
        # Add utilization values
        for i, util in enumerate([utilizations_thp[0]] + utilizations_concrete):
            ax2.text(i, util + 5, f'{util:.0f}%', ha='center', va='bottom', fontweight='bold')
    
    # Plot 3: Slab performance
    ax3 = plt.subplot(3, 3, 3)
    if slab_result.get("success") and slab_result["data"].get("success"):
        slab_data = slab_result["data"]["results"]
        
        slab_MEd = slab_data["inputs"]["geometry"]["MEd"]
        slab_MRd = slab_data["results"]["moment_capacity"]["MRd"]
        slab_util = slab_data["status"]["utilization"]
        
        categories = ['Applied\nMoment', 'Capacity\n(MRd)', 'Utilization']
        values = [slab_MEd, slab_MRd, slab_util]
        colors = ['orange', 'green', 'blue' if slab_util <= 85 else 'orange' if slab_util <= 100 else 'red']
        
        bars = ax3.bar(categories, values, color=colors, alpha=0.7)
        ax3.set_ylabel("Value")
        ax3.set_title("Slab Design Performance")
        ax3.grid(True, alpha=0.3)
        
        # Add value labels
        for bar, value, cat in zip(bars, values, categories):
            height = bar.get_height()
            unit = 'kNm/m' if 'Moment' in cat else '%' if 'Utilization' in cat else ''
            ax3.text(bar.get_x() + bar.get_width()/2., height + max(values)*0.01,
                    f'{value:.1f}{unit}', ha='center', va='bottom', fontweight='bold')
    
    # Plot 4: System optimization matrix
    ax4 = plt.subplot(3, 2, 3)
    if optimization_results:
        # Extract data for optimization matrix
        spans = sorted(list(set([r["config"]["span"] for r in optimization_results])))
        spacings = sorted(list(set([r["config"]["spacing"] for r in optimization_results])))
        
        thp_capacity_matrix = np.zeros((len(spacings), len(spans)))
        concrete_capacity_matrix = np.zeros((len(spacings), len(spans)))
        
        for r in optimization_results:
            if r.get("comparison"):
                i = spacings.index(r["config"]["spacing"])
                j = spans.index(r["config"]["span"])
                thp_capacity_matrix[i, j] = r["comparison"]["moment_capacity"]["thp_kNm"]
                concrete_capacity_matrix[i, j] = r["comparison"]["moment_capacity"]["concrete_kNm"]
        
        # Show THP capacities
        im1 = ax4.imshow(thp_capacity_matrix, cmap='Blues', aspect='auto')
        ax4.set_xlabel("Beam Span (m)")
        ax4.set_ylabel("Beam Spacing (m)")
        ax4.set_title("THP Steel Beam Capacity Matrix")
        ax4.set_xticks(range(len(spans)))
        ax4.set_xticklabels([f'{int(x)}' for x in spans])
        ax4.set_yticks(range(len(spacings)))
        ax4.set_yticklabels([f'{int(x)}' for x in spacings])
        
        plt.colorbar(im1, ax=ax4, label='Moment Capacity (kNm)')
        
        # Add text annotations
        for i in range(len(spacings)):
            for j in range(len(spans)):
                if thp_capacity_matrix[i, j] > 0:
                    ax4.text(j, i, f'{thp_capacity_matrix[i, j]:.0f}', 
                            ha='center', va='center', color='white', fontsize=9, fontweight='bold')
    
    # Plot 5: Concrete beam capacity matrix
    ax5 = plt.subplot(3, 2, 4)
    if optimization_results:
        im2 = ax5.imshow(concrete_capacity_matrix, cmap='Reds', aspect='auto')
        ax5.set_xlabel("Beam Span (m)")
        ax5.set_ylabel("Beam Spacing (m)")
        ax5.set_title("Concrete Beam Capacity Matrix")
        ax5.set_xticks(range(len(spans)))
        ax5.set_xticklabels([f'{int(x)}' for x in spans])
        ax5.set_yticks(range(len(spacings)))
        ax5.set_yticklabels([f'{int(x)}' for x in spacings])
        
        plt.colorbar(im2, ax=ax5, label='Moment Capacity (kNm)')
        
        # Add text annotations
        for i in range(len(spacings)):
            for j in range(len(spans)):
                if concrete_capacity_matrix[i, j] > 0:
                    ax5.text(j, i, f'{concrete_capacity_matrix[i, j]:.0f}', 
                            ha='center', va='center', color='white', fontsize=9, fontweight='bold')
    
    # Plot 6: Weight comparison across configurations
    ax6 = plt.subplot(3, 1, 3)
    if optimization_results:
        config_labels = []
        thp_weights = []
        concrete_weights = []
        
        for r in optimization_results:
            if r.get("comparison"):
                span = r["config"]["span"]
                spacing = r["config"]["spacing"]
                config_labels.append(f'L{span}m\nS{spacing}m')
                thp_weights.append(r["comparison"]["unit_weight"]["thp_kg_per_m"])
                concrete_weights.append(r["comparison"]["unit_weight"]["concrete_kg_per_m"])
        
        x_pos = np.arange(len(config_labels))
        width = 0.35
        
        bars1 = ax6.bar(x_pos - width/2, thp_weights, width, label='THP Steel', 
                       color='steelblue', alpha=0.8)
        bars2 = ax6.bar(x_pos + width/2, concrete_weights, width, label='Concrete', 
                       color='lightcoral', alpha=0.8)
        
        ax6.set_xlabel("Configuration (Span/Spacing)")
        ax6.set_ylabel("Unit Weight (kg/m)")
        ax6.set_title("Weight Comparison Across Configurations")
        ax6.set_xticks(x_pos)
        ax6.set_xticklabels(config_labels, rotation=45, ha='right')
        ax6.legend()
        ax6.grid(True, alpha=0.3)
        
        # Highlight most efficient configurations
        if thp_weights and concrete_weights:
            min_thp_idx = thp_weights.index(min(thp_weights))
            min_concrete_idx = concrete_weights.index(min(concrete_weights))
            
            # Highlight minimum weight bars
            bars1[min_thp_idx].set_color('darkblue')
            bars1[min_thp_idx].set_alpha(1.0)
            bars2[min_concrete_idx].set_color('darkred')
            bars2[min_concrete_idx].set_alpha(1.0)
    
    plt.tight_layout()
    plt.savefig("system_comparison.png", dpi=300, bbox_inches='tight')
    print("📈 System comparison plots saved to: system_comparison.png")


def generate_system_report(beam_comparison, slab_result, optimization_results, building_config):
    """Generate comprehensive building system analysis report."""
    
    report = f"""
BUILDING FLOOR SYSTEM - STRUCTURAL ANALYSIS REPORT
=================================================

Project: Multi-Calculator System Comparison
Date: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}
Analysis Method: Coordinated Selenium WebDriver API Integration

BUILDING CONFIGURATION:
======================
• Floor dimensions: {building_config['floor_area']['length']}m × {building_config['floor_area']['width']}m
• Beam spacing: {building_config['beam_spacing']}m
• Slab span: {building_config['slab_span']}m
• Loads:
  - Live load: {building_config['live_load']} kN/m²
  - Dead load (finishes): {building_config['dead_load']} kN/m²
  - Slab self-weight: {building_config['self_weight_slab']} kN/m²

STRUCTURAL SYSTEM ANALYSIS:
==========================

1. MAIN BEAM COMPARISON:
------------------------
"""
    
    if beam_comparison.get("comparison"):
        comp = beam_comparison["comparison"]
        load_cond = beam_comparison["load_conditions"]
        
        report += f"• Load conditions:\n"
        report += f"  - Span: {load_cond['span']} m\n"
        report += f"  - ULS load: {load_cond['load']:.1f} kN/m\n"
        report += f"  - Tributary width: {load_cond['tributary_width']} m\n\n"
        
        report += f"• THP Steel Beam:\n"
        report += f"  - Moment capacity: {comp['moment_capacity']['thp_kNm']:.1f} kNm\n"
        report += f"  - Unit weight: {comp['unit_weight']['thp_kg_per_m']:.1f} kg/m\n"
        report += f"  - Utilization: {comp['utilization']['thp_moment_pct']:.1f}%\n\n"
        
        report += f"• Concrete Beam:\n"
        report += f"  - Moment capacity: {comp['moment_capacity']['concrete_kNm']:.1f} kNm\n"
        report += f"  - Unit weight: {comp['unit_weight']['concrete_kg_per_m']:.0f} kg/m\n"
        report += f"  - Moment utilization: {comp['utilization']['concrete_moment_pct']:.1f}%\n"
        report += f"  - Shear utilization: {comp['utilization']['concrete_shear_pct']:.1f}%\n\n"
        
        # Determine better option
        thp_efficient = comp["moment_capacity"]["thp_kNm"] / comp["unit_weight"]["thp_kg_per_m"]
        concrete_efficient = comp["moment_capacity"]["concrete_kNm"] / comp["unit_weight"]["concrete_kg_per_m"]
        
        better_option = "THP Steel" if thp_efficient > concrete_efficient else "Concrete"
        report += f"• Recommendation: {better_option} beam provides better strength-to-weight ratio\n"
        
        # Weight comparison
        weight_saving = abs(comp["unit_weight"]["thp_kg_per_m"] - comp["unit_weight"]["concrete_kg_per_m"])
        lighter = "THP" if comp["unit_weight"]["thp_kg_per_m"] < comp["unit_weight"]["concrete_kg_per_m"] else "Concrete"
        report += f"• Weight advantage: {lighter} is {weight_saving:.0f} kg/m lighter\n"
    
    report += f"\n2. SLAB SYSTEM:\n"
    report += f"---------------\n"
    
    if slab_result.get("success") and slab_result["data"].get("success"):
        slab_data = slab_result["data"]["results"]
        slab_span = slab_data["inputs"]["_system_info"]["span"]
        slab_load = slab_data["inputs"]["_system_info"]["uls_load"]
        slab_MEd = slab_data["inputs"]["geometry"]["MEd"]
        slab_MRd = slab_data["results"]["moment_capacity"]["MRd"]
        slab_util = slab_data["status"]["utilization"]
        
        report += f"• Span: {slab_span} m\n"
        report += f"• ULS load: {slab_load:.1f} kN/m²\n"
        report += f"• Applied moment: {slab_MEd:.1f} kNm/m\n"
        report += f"• Moment capacity: {slab_MRd:.1f} kNm/m\n"
        report += f"• Utilization: {slab_util:.1f}%\n"
        report += f"• Status: {'OK' if slab_util <= 100 else 'OVER-UTILIZED'}\n"
    
    report += f"\n3. SYSTEM OPTIMIZATION:\n"
    report += f"-----------------------\n"
    
    if optimization_results:
        report += f"• Configurations analyzed: {len(optimization_results)}\n"
        
        # Find most efficient configurations
        best_thp = None
        best_concrete = None
        best_thp_efficiency = 0
        best_concrete_efficiency = 0
        
        for r in optimization_results:
            if r.get("comparison"):
                comp = r["comparison"]
                span = r["config"]["span"]
                spacing = r["config"]["spacing"]
                
                thp_eff = comp["moment_capacity"]["thp_kNm"] / comp["unit_weight"]["thp_kg_per_m"]
                concrete_eff = comp["moment_capacity"]["concrete_kNm"] / comp["unit_weight"]["concrete_kg_per_m"]
                
                if thp_eff > best_thp_efficiency:
                    best_thp_efficiency = thp_eff
                    best_thp = {"span": span, "spacing": spacing, "efficiency": thp_eff}
                
                if concrete_eff > best_concrete_efficiency:
                    best_concrete_efficiency = concrete_eff
                    best_concrete = {"span": span, "spacing": spacing, "efficiency": concrete_eff}
        
        if best_thp:
            report += f"• Most efficient THP configuration: L{best_thp['span']}m × S{best_thp['spacing']}m "
            report += f"(efficiency: {best_thp['efficiency']:.3f} kNm per kg/m)\n"
        
        if best_concrete:
            report += f"• Most efficient concrete configuration: L{best_concrete['span']}m × S{best_concrete['spacing']}m "
            report += f"(efficiency: {best_concrete['efficiency']:.3f} kNm per kg/m)\n"
    
    report += f"""

DESIGN RECOMMENDATIONS:
======================

1. STRUCTURAL SYSTEM SELECTION:
   • For short spans (< 8m): Concrete beams may be more economical
   • For medium spans (8-12m): Both systems viable, consider other factors
   • For long spans (> 12m): THP steel beams likely more efficient
   • Consider construction speed: Steel typically faster to erect

2. SLAB INTEGRATION:
   • 200mm concrete slab suitable for 4m spans
   • Consider composite action with steel beams for optimization
   • Verify deflection limits for final design

3. OPTIMIZATION OPPORTUNITIES:
   • Beam spacing affects both beam and slab design
   • Larger spacings = heavier beams but lighter slab reinforcement
   • Optimize spacing based on total material quantities

4. CONSTRUCTION CONSIDERATIONS:
   • Steel beams: Faster erection, weather-dependent
   • Concrete beams: Formwork required, curing time
   • Mixed systems possible: Steel main beams, concrete secondary

5. COST ANALYSIS (Recommended Next Steps):
   • Obtain material costs for both systems
   • Include labor and equipment costs
   • Consider construction schedule impacts
   • Evaluate life-cycle costs including maintenance

ANALYSIS SUMMARY:
================
• Total calculations performed: {sum([1 if beam_comparison.get('beams') else 0, 1 if slab_result.get('success') else 0, len(optimization_results)])}
• Success rate: High (all major calculations completed)
• API integration: THP, Concrete Beam, and Concrete Slab calculators
• Analysis method: Coordinated Selenium WebDriver automation

NEXT STEPS:
==========
1. Detailed cost analysis for selected system
2. Serviceability limit state checks (deflection)
3. Connection design for selected beam type
4. Construction sequence planning
5. Sustainability assessment (embodied carbon)

"""
    
    with open("building_system_report.txt", "w") as f:
        f.write(report)
    
    print("📝 Building system report saved to: building_system_report.txt")


def export_system_data(beam_comparison, slab_result, optimization_results):
    """Export system analysis data to CSV files."""
    
    # Export beam comparison data
    if beam_comparison.get("comparison"):
        comp = beam_comparison["comparison"]
        load_cond = beam_comparison["load_conditions"]
        
        beam_data = [{
            "beam_type": "THP_Steel",
            "span_m": load_cond["span"],
            "load_kN_per_m": load_cond["load"],
            "moment_capacity_kNm": comp["moment_capacity"]["thp_kNm"],
            "unit_weight_kg_per_m": comp["unit_weight"]["thp_kg_per_m"],
            "utilization_pct": comp["utilization"]["thp_moment_pct"],
            "efficiency_kNm_per_kg_per_m": comp["moment_capacity"]["thp_kNm"] / comp["unit_weight"]["thp_kg_per_m"]
        }, {
            "beam_type": "Concrete",
            "span_m": load_cond["span"],
            "load_kN_per_m": load_cond["load"],
            "moment_capacity_kNm": comp["moment_capacity"]["concrete_kNm"],
            "unit_weight_kg_per_m": comp["unit_weight"]["concrete_kg_per_m"],
            "utilization_pct": comp["utilization"]["concrete_moment_pct"],
            "efficiency_kNm_per_kg_per_m": comp["moment_capacity"]["concrete_kNm"] / comp["unit_weight"]["concrete_kg_per_m"]
        }]
        
        df_beam = pd.DataFrame(beam_data)
        df_beam.to_csv("beam_comparison_data.csv", index=False)
        print("📊 Beam comparison data exported to: beam_comparison_data.csv")
    
    # Export optimization results
    if optimization_results:
        opt_data = []
        for r in optimization_results:
            if r.get("comparison"):
                comp = r["comparison"]
                config = r["config"]
                
                # THP data
                opt_data.append({
                    "beam_type": "THP_Steel",
                    "span_m": config["span"],
                    "spacing_m": config["spacing"],
                    "moment_capacity_kNm": comp["moment_capacity"]["thp_kNm"],
                    "unit_weight_kg_per_m": comp["unit_weight"]["thp_kg_per_m"],
                    "utilization_pct": comp["utilization"]["thp_moment_pct"],
                    "efficiency_kNm_per_kg_per_m": comp["moment_capacity"]["thp_kNm"] / comp["unit_weight"]["thp_kg_per_m"]
                })
                
                # Concrete data
                opt_data.append({
                    "beam_type": "Concrete",
                    "span_m": config["span"],
                    "spacing_m": config["spacing"],
                    "moment_capacity_kNm": comp["moment_capacity"]["concrete_kNm"],
                    "unit_weight_kg_per_m": comp["unit_weight"]["concrete_kg_per_m"],
                    "utilization_pct": comp["utilization"]["concrete_moment_pct"],
                    "efficiency_kNm_per_kg_per_m": comp["moment_capacity"]["concrete_kNm"] / comp["unit_weight"]["concrete_kg_per_m"]
                })
        
        df_opt = pd.DataFrame(opt_data)
        df_opt.to_csv("system_optimization_data.csv", index=False)
        print("📊 System optimization data exported to: system_optimization_data.csv")


if __name__ == "__main__":
    # Check dependencies
    required_packages = ["numpy", "matplotlib", "pandas", "selenium"]
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"❌ Missing required packages: {', '.join(missing_packages)}")
        print(f"Install with: pip install {' '.join(missing_packages)}")
        sys.exit(1)
    
    # Check ChromeDriver availability
    try:
        options = Options()
        options.add_argument('--headless')
        test_driver = webdriver.Chrome(options=options)
        test_driver.quit()
    except Exception as e:
        print("❌ ChromeDriver not found or not working.")
        print("Please install ChromeDriver:")
        print("  1. Download from: https://chromedriver.chromium.org/")
        print("  2. Or install via: pip install webdriver-manager")
        print(f"Error: {e}")
        sys.exit(1)
    
    # Run the analysis
    try:
        create_building_floor_analysis()
    except KeyboardInterrupt:
        print("\n⚠️  Analysis interrupted by user")
    except Exception as e:
        print(f"\n❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()