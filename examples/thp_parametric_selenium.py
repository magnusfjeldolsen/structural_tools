#!/usr/bin/env python3
"""
THP Steel Profile Parametric Analysis Example (Selenium API)

This example demonstrates modern API integration using Selenium WebDriver
for the THP (Tapered H-Profile) steel section calculator.

Features:
- Parametric study varying profile dimensions
- Unit weight optimization analysis  
- Moment resistance calculations
- Steel density impact analysis
- Comprehensive visualization and reporting

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


class THPCalculator:
    """Modern Selenium-based interface to THP Calculator API."""
    
    def __init__(self, headless: bool = True, url: str = None):
        """
        Initialize the THP Calculator interface.
        
        Args:
            headless: Run browser in headless mode (no GUI)
            url: Custom URL for THP calculator (defaults to local)
        """
        self.headless = headless
        self.url = url or "file://" + str(Path(__file__).parent.parent / "THP" / "index.html")
        self.driver = None
        
    def __enter__(self):
        """Context manager entry - setup WebDriver."""
        try:
            options = Options()
            if self.headless:
                options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            
            self.driver = webdriver.Chrome(options=options)
            self.driver.get(self.url)
            
            # Wait for page to load and API to be ready
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "diagram"))
            )
            
            # Give additional time for JavaScript to initialize
            time.sleep(2)
            
            # Verify API is available
            api_ready = self.driver.execute_script("return typeof window.thpCalculate === 'function';")
            if not api_ready:
                raise RuntimeError("THP API not loaded")
                
            return self
            
        except (WebDriverException, TimeoutException) as e:
            if self.driver:
                self.driver.quit()
            raise RuntimeError(f"Failed to initialize THP Calculator: {e}")
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup WebDriver."""
        if self.driver:
            self.driver.quit()
    
    def calculate_single(self, params: Dict) -> Dict:
        """
        Calculate single THP profile configuration.
        
        Args:
            params: THP calculation parameters
            
        Returns:
            Calculation results dictionary
        """
        try:
            result = self.driver.execute_script(
                "return window.thpCalculate(arguments[0]);", 
                params
            )
            return result
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "input": params
            }
    
    def calculate_batch(self, params_list: List[Dict], progress_callback=None) -> Dict:
        """
        Calculate batch of THP configurations.
        
        Args:
            params_list: List of parameter dictionaries
            progress_callback: Optional function to call with progress updates
            
        Returns:
            Batch calculation results
        """
        results = []
        total = len(params_list)
        
        for i, params in enumerate(params_list):
            result = self.calculate_single(params)
            result["batch_index"] = i
            results.append(result)
            
            if progress_callback:
                progress_callback(i + 1, total)
        
        # Calculate summary statistics
        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]
        
        return {
            "success": len(failed) == 0,
            "batch_size": total,
            "successful": len(successful),
            "failed": len(failed),
            "results": results,
            "summary": {
                "total": total,
                "success_rate": len(successful) / total * 100 if total > 0 else 0
            }
        }
    
    def parametric_study(self, base_params: Dict, variable_param: str, 
                        values: List[float], progress_callback=None) -> Dict:
        """
        Perform parametric study varying single parameter.
        
        Args:
            base_params: Base parameter dictionary
            variable_param: Parameter to vary (dot notation supported, e.g., 'geometry.b_u')
            values: List of values for the variable parameter
            progress_callback: Optional progress callback
            
        Returns:
            Parametric study results
        """
        scenarios = []
        for value in values:
            scenario = base_params.copy()
            
            # Handle dot notation for nested parameters
            keys = variable_param.split('.')
            if len(keys) == 1:
                scenario[keys[0]] = value
            else:
                # Navigate to nested parameter
                current = scenario
                for key in keys[:-1]:
                    if key not in current:
                        current[key] = {}
                    current = current[key]
                current[keys[-1]] = value
            
            scenario["_study_info"] = {
                "parameter": variable_param,
                "value": value
            }
            scenarios.append(scenario)
        
        return self.calculate_batch(scenarios, progress_callback)


def create_base_thp_config() -> Dict:
    """Create base THP configuration for parametric studies."""
    return {
        "b_o": 188,      # Upper flange width (mm)
        "t_o": 25,       # Upper flange thickness (mm) 
        "H": 200,        # Web height (mm)
        "t_w": 6,        # Web thickness (mm)
        "b_u": 450,      # Lower flange width (mm)
        "t_u": 15,       # Lower flange thickness (mm)
        "f_yk": 355,     # Steel yield strength (MPa)
        "gamma_M0": 1.05, # Safety factor
        "rho_steel": 7850 # Steel density (kg/m³)
    }


def run_thp_parametric_analysis():
    """Run comprehensive THP parametric analysis."""
    
    print("🔧 THP Steel Profile Parametric Analysis")
    print("=" * 50)
    print("Analyzing tapered H-profiles with varying dimensions")
    print("Using modern Selenium WebDriver API integration")
    print()
    
    base_config = create_base_thp_config()
    
    print("📋 Base THP Configuration:")
    print(f"  • Upper flange: {base_config['b_o']}×{base_config['t_o']}mm")
    print(f"  • Web: H={base_config['H']}mm, t={base_config['t_w']}mm") 
    print(f"  • Lower flange: {base_config['b_u']}×{base_config['t_u']}mm")
    print(f"  • Steel grade: S{base_config['f_yk']}")
    print(f"  • Steel density: {base_config['rho_steel']} kg/m³")
    print()
    
    # Progress callback
    def progress_callback(current, total):
        progress = current / total * 100
        print(f"\r🔍 Progress: {current}/{total} ({progress:.1f}%)", end="", flush=True)
    
    try:
        with THPCalculator(headless=True) as calc:
            
            # Study 1: Vary lower flange width
            print("📊 Study 1: Lower flange width optimization...")
            b_u_values = np.linspace(350, 550, 11)  # 350 to 550mm
            study1 = calc.parametric_study(base_config, "b_u", b_u_values, progress_callback)
            print(f"\n✅ Completed: {study1['successful']}/{study1['batch_size']} calculations")
            
            # Study 2: Vary steel density (different steel types)
            print("\n📊 Study 2: Steel density impact analysis...")
            rho_values = [7700, 7800, 7850, 7900, 8000]  # Different steel compositions
            study2 = calc.parametric_study(base_config, "rho_steel", rho_values, progress_callback)
            print(f"\n✅ Completed: {study2['successful']}/{study2['batch_size']} calculations")
            
            # Study 3: Vary web height
            print("\n📊 Study 3: Web height optimization...")
            H_values = np.linspace(150, 300, 11)  # 150 to 300mm
            study3 = calc.parametric_study(base_config, "H", H_values, progress_callback)
            print(f"\n✅ Completed: {study3['successful']}/{study3['batch_size']} calculations")
            
            # Combined optimization study
            print("\n📊 Study 4: Combined optimization matrix...")
            combined_scenarios = []
            b_u_opt = [400, 450, 500]  # Selected flange widths
            H_opt = [180, 200, 220]    # Selected web heights
            
            for b_u in b_u_opt:
                for H in H_opt:
                    scenario = base_config.copy()
                    scenario["b_u"] = b_u
                    scenario["H"] = H
                    scenario["_study_info"] = {
                        "parameter": "b_u_H_combined",
                        "b_u": b_u,
                        "H": H
                    }
                    combined_scenarios.append(scenario)
            
            study4 = calc.calculate_batch(combined_scenarios, progress_callback)
            print(f"\n✅ Completed: {study4['successful']}/{study4['batch_size']} calculations")
        
        print("\n🎨 Generating comprehensive analysis...")
        
        # Generate analysis and visualizations
        create_parametric_visualizations(study1, study2, study3, study4)
        generate_optimization_report(study1, study2, study3, study4, base_config)
        export_analysis_data(study1, study2, study3, study4)
        
        print("\n📊 Analysis complete! Generated files:")
        print("  • thp_parametric_analysis.png - Comprehensive visualization")
        print("  • thp_optimization_report.txt - Engineering analysis report")
        print("  • thp_parametric_data.csv - Raw calculation data")
        print("  • thp_design_matrix.csv - Optimization matrix results")
        
    except Exception as e:
        print(f"\n❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()


def create_parametric_visualizations(study1, study2, study3, study4):
    """Create comprehensive parametric analysis visualization."""
    
    fig = plt.figure(figsize=(20, 16))
    fig.suptitle("THP Steel Profile Parametric Analysis", fontsize=20, fontweight='bold')
    
    # Study 1: Lower flange width impact
    ax1 = plt.subplot(3, 3, 1)
    s1_results = [r for r in study1["results"] if r.get("success")]
    if s1_results:
        b_u_vals = [r["_study_info"]["value"] for r in s1_results]
        unit_weights = [float(r["results"]["results"]["unit_weight"]) for r in s1_results]
        moment_resist = [float(r["results"]["results"]["M_Rd"]) for r in s1_results]
        
        ax1.plot(b_u_vals, unit_weights, 'b-o', linewidth=2, markersize=6)
        ax1.set_xlabel("Lower Flange Width b_u (mm)")
        ax1.set_ylabel("Unit Weight (kg/m)", color='blue')
        ax1.tick_params(axis='y', labelcolor='blue')
        ax1.grid(True, alpha=0.3)
        ax1.set_title("Impact of Lower Flange Width")
        
        # Secondary y-axis for moment resistance
        ax1_twin = ax1.twinx()
        ax1_twin.plot(b_u_vals, moment_resist, 'r-s', linewidth=2, markersize=6)
        ax1_twin.set_ylabel("Moment Resistance (kNm)", color='red')
        ax1_twin.tick_params(axis='y', labelcolor='red')
    
    # Study 2: Steel density impact
    ax2 = plt.subplot(3, 3, 2)
    s2_results = [r for r in study2["results"] if r.get("success")]
    if s2_results:
        rho_vals = [r["_study_info"]["value"] for r in s2_results]
        unit_weights = [float(r["results"]["results"]["unit_weight"]) for r in s2_results]
        
        ax2.bar(rho_vals, unit_weights, width=25, alpha=0.7, color='green')
        ax2.set_xlabel("Steel Density (kg/m³)")
        ax2.set_ylabel("Unit Weight (kg/m)")
        ax2.set_title("Steel Density Impact")
        ax2.grid(True, alpha=0.3)
        
        # Add value labels on bars
        for i, (rho, weight) in enumerate(zip(rho_vals, unit_weights)):
            ax2.text(rho, weight + max(unit_weights)*0.01, f'{weight:.1f}', 
                    ha='center', va='bottom', fontsize=9)
    
    # Study 3: Web height impact
    ax3 = plt.subplot(3, 3, 3)
    s3_results = [r for r in study3["results"] if r.get("success")]
    if s3_results:
        H_vals = [r["_study_info"]["value"] for r in s3_results]
        unit_weights = [float(r["results"]["results"]["unit_weight"]) for r in s3_results]
        moment_resist = [float(r["results"]["results"]["M_Rd"]) for r in s3_results]
        
        ax3.plot(H_vals, unit_weights, 'g-o', linewidth=2, markersize=6, label='Unit Weight')
        ax3.set_xlabel("Web Height H (mm)")
        ax3.set_ylabel("Unit Weight (kg/m)", color='green')
        ax3.tick_params(axis='y', labelcolor='green')
        ax3.grid(True, alpha=0.3)
        ax3.set_title("Impact of Web Height")
        
        # Secondary y-axis
        ax3_twin = ax3.twinx()
        ax3_twin.plot(H_vals, moment_resist, 'purple', linestyle='--', linewidth=2, marker='^', markersize=6)
        ax3_twin.set_ylabel("Moment Resistance (kNm)", color='purple')
        ax3_twin.tick_params(axis='y', labelcolor='purple')
    
    # Study 4: Optimization matrix heatmap
    ax4 = plt.subplot(3, 2, 3)
    s4_results = [r for r in study4["results"] if r.get("success")]
    if s4_results:
        # Create optimization matrix
        b_u_values = sorted(list(set([r["_study_info"]["b_u"] for r in s4_results])))
        H_values = sorted(list(set([r["_study_info"]["H"] for r in s4_results])))
        
        weight_matrix = np.zeros((len(H_values), len(b_u_values)))
        moment_matrix = np.zeros((len(H_values), len(b_u_values)))
        
        for r in s4_results:
            i = H_values.index(r["_study_info"]["H"])
            j = b_u_values.index(r["_study_info"]["b_u"])
            weight_matrix[i, j] = float(r["results"]["results"]["unit_weight"])
            moment_matrix[i, j] = float(r["results"]["results"]["M_Rd"])
        
        im1 = ax4.imshow(weight_matrix, cmap='viridis', aspect='auto')
        ax4.set_xlabel("Lower Flange Width b_u (mm)")
        ax4.set_ylabel("Web Height H (mm)")
        ax4.set_title("Unit Weight Optimization Matrix")
        ax4.set_xticks(range(len(b_u_values)))
        ax4.set_xticklabels([f'{int(x)}' for x in b_u_values])
        ax4.set_yticks(range(len(H_values)))
        ax4.set_yticklabels([f'{int(x)}' for x in H_values])
        
        # Add colorbar
        plt.colorbar(im1, ax=ax4, label='Unit Weight (kg/m)')
        
        # Add text annotations
        for i in range(len(H_values)):
            for j in range(len(b_u_values)):
                ax4.text(j, i, f'{weight_matrix[i, j]:.1f}', 
                        ha='center', va='center', color='white', fontsize=8)
    
    # Moment resistance matrix
    ax5 = plt.subplot(3, 2, 4)
    if s4_results:
        im2 = ax5.imshow(moment_matrix, cmap='plasma', aspect='auto')
        ax5.set_xlabel("Lower Flange Width b_u (mm)")
        ax5.set_ylabel("Web Height H (mm)")
        ax5.set_title("Moment Resistance Matrix")
        ax5.set_xticks(range(len(b_u_values)))
        ax5.set_xticklabels([f'{int(x)}' for x in b_u_values])
        ax5.set_yticks(range(len(H_values)))
        ax5.set_yticklabels([f'{int(x)}' for x in H_values])
        
        plt.colorbar(im2, ax=ax5, label='Moment Resistance (kNm)')
        
        # Add text annotations
        for i in range(len(H_values)):
            for j in range(len(b_u_values)):
                ax5.text(j, i, f'{moment_matrix[i, j]:.1f}', 
                        ha='center', va='center', color='white', fontsize=8)
    
    # Efficiency analysis (Moment/Weight ratio)
    ax6 = plt.subplot(3, 1, 3)
    all_successful = []
    for study in [study1, study3]:  # Use studies with continuous variables
        all_successful.extend([r for r in study["results"] if r.get("success")])
    
    if all_successful:
        weights = [float(r["results"]["results"]["unit_weight"]) for r in all_successful]
        moments = [float(r["results"]["results"]["M_Rd"]) for r in all_successful]
        efficiency = [m/w for m, w in zip(moments, weights)]
        
        # Create scatter plot colored by parameter type
        colors = []
        labels = []
        for r in all_successful:
            if "_study_info" in r and "parameter" in r["_study_info"]:
                if "b_u" in r["_study_info"]["parameter"]:
                    colors.append('blue')
                    labels.append(f'b_u={r["_study_info"]["value"]:.0f}')
                elif "H" in r["_study_info"]["parameter"]:
                    colors.append('red')
                    labels.append(f'H={r["_study_info"]["value"]:.0f}')
                else:
                    colors.append('gray')
                    labels.append('Other')
            else:
                colors.append('gray')
                labels.append('Unknown')
        
        scatter = ax6.scatter(weights, moments, c=efficiency, cmap='RdYlGn', s=80, alpha=0.7)
        ax6.set_xlabel("Unit Weight (kg/m)")
        ax6.set_ylabel("Moment Resistance (kNm)")
        ax6.set_title("Structural Efficiency Analysis (Moment/Weight Ratio)")
        ax6.grid(True, alpha=0.3)
        
        # Add colorbar for efficiency
        cbar = plt.colorbar(scatter, ax=ax6)
        cbar.set_label('Efficiency (kNm per kg/m)')
        
        # Find and highlight most efficient design
        max_eff_idx = efficiency.index(max(efficiency))
        ax6.scatter(weights[max_eff_idx], moments[max_eff_idx], 
                   s=200, facecolors='none', edgecolors='black', linewidth=3, 
                   label=f'Most Efficient: {efficiency[max_eff_idx]:.2f}')
        ax6.legend()
    
    plt.tight_layout()
    plt.savefig("thp_parametric_analysis.png", dpi=300, bbox_inches='tight')
    print("📈 Parametric visualizations saved to: thp_parametric_analysis.png")


def generate_optimization_report(study1, study2, study3, study4, base_config):
    """Generate comprehensive optimization report."""
    
    report = f"""
THP STEEL PROFILE PARAMETRIC ANALYSIS REPORT
===========================================

Project: THP Profile Optimization Study
Date: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}
Analysis Method: Selenium WebDriver API Integration

BASE CONFIGURATION:
==================
• Upper flange: {base_config['b_o']} × {base_config['t_o']} mm
• Web: H = {base_config['H']} mm, t = {base_config['t_w']} mm  
• Lower flange: {base_config['b_u']} × {base_config['t_u']} mm
• Steel grade: S{base_config['f_yk']} (γM0 = {base_config['gamma_M0']})
• Steel density: {base_config['rho_steel']} kg/m³

PARAMETRIC STUDY RESULTS:
========================

Study 1: Lower Flange Width Optimization (b_u = 350-550mm)
----------------------------------------------------------
"""
    
    # Analyze Study 1 results
    s1_successful = [r for r in study1["results"] if r.get("success")]
    if s1_successful:
        weights = [float(r["results"]["results"]["unit_weight"]) for r in s1_successful]
        moments = [float(r["results"]["results"]["M_Rd"]) for r in s1_successful]
        b_u_vals = [r["_study_info"]["value"] for r in s1_successful]
        
        min_weight_idx = weights.index(min(weights))
        max_moment_idx = moments.index(max(moments))
        
        efficiencies = [m/w for m, w in zip(moments, weights)]
        max_eff_idx = efficiencies.index(max(efficiencies))
        
        report += f"• Minimum weight: {weights[min_weight_idx]:.2f} kg/m at b_u = {b_u_vals[min_weight_idx]:.0f}mm\n"
        report += f"• Maximum moment: {moments[max_moment_idx]:.2f} kNm at b_u = {b_u_vals[max_moment_idx]:.0f}mm\n"
        report += f"• Best efficiency: {efficiencies[max_eff_idx]:.3f} kNm/(kg/m) at b_u = {b_u_vals[max_eff_idx]:.0f}mm\n"
        report += f"• Weight range: {min(weights):.2f} - {max(weights):.2f} kg/m ({(max(weights)-min(weights))/min(weights)*100:.1f}% variation)\n"
        report += f"• Moment range: {min(moments):.2f} - {max(moments):.2f} kNm ({(max(moments)-min(moments))/min(moments)*100:.1f}% variation)\n"
    
    report += f"\nStudy 2: Steel Density Impact Analysis\n"
    report += f"-------------------------------------\n"
    
    s2_successful = [r for r in study2["results"] if r.get("success")]
    if s2_successful:
        densities = [r["_study_info"]["value"] for r in s2_successful]
        weights = [float(r["results"]["results"]["unit_weight"]) for r in s2_successful]
        
        # Linear relationship expected
        weight_change_per_density = (max(weights) - min(weights)) / (max(densities) - min(densities))
        
        report += f"• Density range tested: {min(densities):.0f} - {max(densities):.0f} kg/m³\n"
        report += f"• Unit weight range: {min(weights):.2f} - {max(weights):.2f} kg/m\n"
        report += f"• Weight sensitivity: {weight_change_per_density:.4f} (kg/m)/(kg/m³)\n"
        report += f"• Standard steel (7850 kg/m³) vs lightweight (7700 kg/m³): {weight_change_per_density * 150:.2f} kg/m difference\n"
    
    report += f"\nStudy 3: Web Height Optimization (H = 150-300mm)\n"
    report += f"-----------------------------------------------\n"
    
    s3_successful = [r for r in study3["results"] if r.get("success")]
    if s3_successful:
        H_vals = [r["_study_info"]["value"] for r in s3_successful]
        weights = [float(r["results"]["results"]["unit_weight"]) for r in s3_successful]
        moments = [float(r["results"]["results"]["M_Rd"]) for r in s3_successful]
        
        min_weight_idx = weights.index(min(weights))
        max_moment_idx = moments.index(max(moments))
        
        report += f"• Minimum weight: {weights[min_weight_idx]:.2f} kg/m at H = {H_vals[min_weight_idx]:.0f}mm\n"
        report += f"• Maximum moment: {moments[max_moment_idx]:.2f} kNm at H = {H_vals[max_moment_idx]:.0f}mm\n"
        report += f"• Weight increase per mm height: {(max(weights)-min(weights))/(max(H_vals)-min(H_vals)):.3f} kg/m/mm\n"
        report += f"• Moment increase per mm height: {(max(moments)-min(moments))/(max(H_vals)-min(H_vals)):.3f} kNm/mm\n"
    
    report += f"\nStudy 4: Combined Optimization Matrix\n"
    report += f"------------------------------------\n"
    
    s4_successful = [r for r in study4["results"] if r.get("success")]
    if s4_successful:
        weights = [float(r["results"]["results"]["unit_weight"]) for r in s4_successful]
        moments = [float(r["results"]["results"]["M_Rd"]) for r in s4_successful]
        efficiencies = [m/w for m, w in zip(moments, weights)]
        
        min_weight_idx = weights.index(min(weights))
        max_moment_idx = moments.index(max(moments))
        max_eff_idx = efficiencies.index(max(efficiencies))
        
        report += f"• Configurations tested: {len(s4_successful)}\n"
        report += f"• Minimum weight config: b_u={s4_successful[min_weight_idx]['_study_info']['b_u']:.0f}mm, H={s4_successful[min_weight_idx]['_study_info']['H']:.0f}mm ({weights[min_weight_idx]:.2f} kg/m)\n"
        report += f"• Maximum moment config: b_u={s4_successful[max_moment_idx]['_study_info']['b_u']:.0f}mm, H={s4_successful[max_moment_idx]['_study_info']['H']:.0f}mm ({moments[max_moment_idx]:.2f} kNm)\n"
        report += f"• Most efficient config: b_u={s4_successful[max_eff_idx]['_study_info']['b_u']:.0f}mm, H={s4_successful[max_eff_idx]['_study_info']['H']:.0f}mm ({efficiencies[max_eff_idx]:.3f} kNm/(kg/m))\n"
    
    report += f"""

DESIGN RECOMMENDATIONS:
======================

1. WEIGHT OPTIMIZATION:
   • For minimum weight: Use smaller lower flange width (b_u ≈ 350-400mm)
   • Reduce web height where moment capacity permits
   • Consider lightweight steel alloys (ρ < 7850 kg/m³)

2. STRENGTH OPTIMIZATION:
   • For maximum moment resistance: Increase lower flange width (b_u > 500mm)
   • Increase web height (H > 250mm) for better section properties
   • Standard steel density (7850 kg/m³) provides good balance

3. EFFICIENCY OPTIMIZATION:
   • Best strength-to-weight ratio typically achieved with:
     - Moderate lower flange width (b_u ≈ 450-500mm)
     - Balanced web height (H ≈ 200-220mm)
   • Fine-tune based on specific load requirements

4. PRACTICAL CONSIDERATIONS:
   • Manufacturing constraints may limit extreme dimensions
   • Connection details affect flange width selection
   • Transportation and handling favor moderate weights
   • Standard steel grades recommended for cost efficiency

NEXT STEPS:
==========
1. Validate optimal configurations with detailed FEA
2. Consider local buckling effects for thin elements  
3. Evaluate fabrication costs vs material savings
4. Perform connection design with selected profile
5. Consider dynamic effects and fatigue if applicable

API PERFORMANCE:
===============
• Total calculations performed: {sum([s['batch_size'] for s in [study1, study2, study3, study4]])}
• Success rate: {sum([s['successful'] for s in [study1, study2, study3, study4]]) / sum([s['batch_size'] for s in [study1, study2, study3, study4]]) * 100:.1f}%
• Analysis method: Selenium WebDriver automation
• Browser: Chrome (headless mode)

"""
    
    with open("thp_optimization_report.txt", "w") as f:
        f.write(report)
    
    print("📝 Optimization report saved to: thp_optimization_report.txt")


def export_analysis_data(study1, study2, study3, study4):
    """Export detailed analysis data to CSV files."""
    
    # Export parametric data
    all_data = []
    for study_name, study in [("flange_width", study1), ("steel_density", study2), 
                             ("web_height", study3)]:
        for result in study["results"]:
            if result.get("success"):
                row = {
                    "study": study_name,
                    "parameter": result.get("_study_info", {}).get("parameter", "unknown"),
                    "value": result.get("_study_info", {}).get("value", 0),
                    "unit_weight_kg_per_m": float(result["results"]["results"]["unit_weight"]),
                    "moment_resistance_kNm": float(result["results"]["results"]["M_Rd"]),
                    "total_area_mm2": float(result["results"]["results"]["A_total"]),
                    "neutral_axis_mm": float(result["results"]["results"]["z_NA"]),
                    "moment_of_inertia_e8_mm4": float(result["results"]["results"]["I_y"]),
                    "section_modulus_e3_mm3": float(result["results"]["results"]["W_el"]),
                    "efficiency_kNm_per_kg_per_m": float(result["results"]["results"]["M_Rd"]) / float(result["results"]["results"]["unit_weight"])
                }
                all_data.append(row)
    
    df_parametric = pd.DataFrame(all_data)
    df_parametric.to_csv("thp_parametric_data.csv", index=False)
    print("📊 Parametric data exported to: thp_parametric_data.csv")
    
    # Export optimization matrix
    matrix_data = []
    for result in study4["results"]:
        if result.get("success"):
            row = {
                "b_u_mm": result["_study_info"]["b_u"],
                "H_mm": result["_study_info"]["H"],
                "unit_weight_kg_per_m": float(result["results"]["results"]["unit_weight"]),
                "moment_resistance_kNm": float(result["results"]["results"]["M_Rd"]),
                "total_area_mm2": float(result["results"]["results"]["A_total"]),
                "efficiency": float(result["results"]["results"]["M_Rd"]) / float(result["results"]["results"]["unit_weight"]),
                "overall_class": result["results"]["classification"]["overall_class"]
            }
            matrix_data.append(row)
    
    df_matrix = pd.DataFrame(matrix_data)
    df_matrix.to_csv("thp_design_matrix.csv", index=False)
    print("📊 Design matrix exported to: thp_design_matrix.csv")


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
        run_thp_parametric_analysis()
    except KeyboardInterrupt:
        print("\n⚠️  Analysis interrupted by user")
    except Exception as e:
        print(f"\n❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()