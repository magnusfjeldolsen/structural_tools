#!/usr/bin/env python3
"""
Concrete Beam Load Envelope Analysis Example

This example demonstrates API integration for load envelope analysis of a 6m simply supported beam.
- Calculates moment and shear using standard beam formulas (MEd = qL²/8, VEd = qL/2)
- Varies distributed load from 10-50 kN/m
- Performs capacity checks and design optimization
- Generates comprehensive reports with design recommendations

Author: Magnus Fjeld Olsen
License: MIT
"""

import json
import subprocess
import sys
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from pathlib import Path
from typing import List, Dict, Tuple
import warnings
warnings.filterwarnings('ignore')


class ConcreteBeamAPI:
    """Interface to the JavaScript concrete beam API."""
    
    def __init__(self, api_path: str = None):
        """Initialize the API interface."""
        if api_path is None:
            # Default to the concrete_beam_api.js in the parent directory
            self.api_path = Path(__file__).parent.parent / "concrete_beam_design" / "concrete_beam_api.js"
        else:
            self.api_path = Path(api_path)
    
    def calculate(self, inputs: Dict) -> Dict:
        """Call the concrete beam calculation API."""
        try:
            # Create a temporary Node.js script to call the API
            node_script = f"""
            const fs = require('fs');
            const path = require('path');

            // Load the API module
            eval(fs.readFileSync('{self.api_path}', 'utf8'));

            // Get inputs from command line
            const inputs = JSON.parse(process.argv[2]);

            // Calculate using the API
            const result = calculateConcreteBeam(inputs);

            // Output result as JSON
            console.log(JSON.stringify(result, null, 2));
            """
            
            # Write temporary script
            temp_script = Path(__file__).parent / "temp_beam_calc.js"
            with open(temp_script, 'w') as f:
                f.write(node_script)
            
            # Run Node.js script
            result = subprocess.run(
                ['node', str(temp_script), json.dumps(inputs)],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Clean up
            temp_script.unlink()
            
            return json.loads(result.stdout)
            
        except subprocess.CalledProcessError as e:
            print(f"Error calling API: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            print(f"Unexpected error: {e}")
            return {"success": False, "error": str(e)}
    
    def calculate_batch(self, inputs_list: List[Dict]) -> List[Dict]:
        """Calculate multiple beam configurations in batch."""
        results = []
        for i, inputs in enumerate(inputs_list):
            result = self.calculate(inputs)
            result["batch_index"] = i
            results.append(result)
        return results


def calculate_beam_forces(q: float, L: float) -> Tuple[float, float]:
    """
    Calculate maximum moment and shear for simply supported beam with uniform load.
    
    Args:
        q: Uniform distributed load in kN/m
        L: Beam span in m
    
    Returns:
        Tuple of (MEd in kNm, VEd in kN)
    """
    MEd = q * L**2 / 8  # Maximum moment at midspan
    VEd = q * L / 2     # Maximum shear at supports
    return MEd, VEd


def create_beam_inputs(q: float, beam_config: Dict) -> Dict:
    """
    Create API inputs for a given load and beam configuration.
    
    Args:
        q: Distributed load in kN/m
        beam_config: Dictionary with beam geometry and material properties
    
    Returns:
        API input dictionary
    """
    L = beam_config["span"]
    MEd, VEd = calculate_beam_forces(q, L)
    
    inputs = {
        "geometry": {
            "b": beam_config["width"],
            "h": beam_config["height"], 
            "c": beam_config["cover"]
        },
        "loads": {
            "MEd": MEd,
            "VEd": VEd
        },
        "longitudinal_reinforcement": {
            "phi_l": beam_config["long_bar_dia"],
            "n_l": beam_config["num_long_bars"]
        },
        "shear_reinforcement": {
            "phi_b": beam_config["stirrup_dia"],
            "cc_b": beam_config["stirrup_spacing"],
            "n_snitt": beam_config["stirrup_legs"]
        },
        "material": {
            "fck": beam_config["fck"],
            "fyk": beam_config["fyk"],
            "alpha_cc": beam_config["alpha_cc"],
            "gamma_c": beam_config["gamma_c"],
            "gamma_s": beam_config["gamma_s"]
        }
    }
    
    # Add load information for tracking
    inputs["_load_info"] = {
        "q": q,
        "span": L
    }
    
    return inputs


def run_load_envelope_analysis():
    """Run the complete load envelope analysis."""
    
    print("🔧 Concrete Beam Load Envelope Analysis")
    print("=" * 50)
    print("Analyzing 6m simply supported beam under varying distributed loads")
    print("Load range: 10-50 kN/m")
    print()
    
    # Initialize API
    api = ConcreteBeamAPI()
    
    # Beam configuration
    beam_config = {
        "span": 6.0,           # m
        "width": 250,          # mm
        "height": 500,         # mm
        "cover": 25,           # mm
        "long_bar_dia": 20,    # mm
        "num_long_bars": 2,    # number
        "stirrup_dia": 12,     # mm
        "stirrup_spacing": 185, # mm
        "stirrup_legs": 2,     # number
        "fck": 35,             # MPa
        "fyk": 500,            # MPa
        "alpha_cc": 0.85,      # factor
        "gamma_c": 1.5,        # safety factor
        "gamma_s": 1.25        # safety factor
    }
    
    # Load range
    loads = np.linspace(10, 50, 21)  # 10 to 50 kN/m, 21 points
    
    print("📋 Beam Configuration:")
    print(f"  • Dimensions: {beam_config['width']}×{beam_config['height']}mm")
    print(f"  • Span: {beam_config['span']}m")
    print(f"  • Longitudinal reinforcement: {beam_config['num_long_bars']}φ{beam_config['long_bar_dia']}")
    print(f"  • Stirrups: φ{beam_config['stirrup_dia']}@{beam_config['stirrup_spacing']}mm")
    print(f"  • Materials: C{beam_config['fck']}/{beam_config['fyk']}")
    print()
    
    # Generate input cases
    print("🔍 Generating load cases...")
    input_cases = []
    for q in loads:
        inputs = create_beam_inputs(q, beam_config)
        input_cases.append(inputs)
    
    print(f"Generated {len(input_cases)} load cases")
    
    # Run batch analysis
    print("\n🔍 Running calculations...")
    results = api.calculate_batch(input_cases)
    
    # Process results
    successful_results = [r for r in results if r.get("success")]
    failed_results = [r for r in results if not r.get("success")]
    
    if failed_results:
        print(f"⚠️  {len(failed_results)} calculations failed:")
        for r in failed_results:
            idx = r.get("batch_index", "?")
            error = r.get("error", "Unknown error")
            print(f"  Load case {idx}: {error}")
    
    if not successful_results:
        print("❌ No successful calculations. Check Node.js installation and API files.")
        return
    
    print(f"✅ Completed {len(successful_results)} successful calculations")
    
    # Create comprehensive analysis
    create_load_envelope_plots(successful_results, beam_config)
    generate_design_report(successful_results, beam_config)
    export_detailed_results(successful_results)
    
    # Design optimization analysis
    run_optimization_analysis(successful_results, beam_config)
    
    print("\n📊 Analysis complete! Generated files:")
    print("  • beam_load_envelope.png - Load envelope visualization")
    print("  • beam_design_report.txt - Comprehensive design report") 
    print("  • beam_analysis_results.csv - Detailed calculation data")
    print("  • beam_optimization.txt - Design optimization recommendations")


def create_load_envelope_plots(results: List[Dict], beam_config: Dict):
    """Create comprehensive load envelope visualization."""
    
    # Extract data
    loads = [r["inputs"]["_load_info"]["q"] for r in results]
    moments_applied = [r["inputs"]["loads"]["MEd"] for r in results]
    shears_applied = [r["inputs"]["loads"]["VEd"] for r in results]
    
    moment_capacity_concrete = [r["results"]["moment_capacity"]["MRd_c"] for r in results]
    moment_capacity_steel = [r["results"]["moment_capacity"]["MRd_s"] for r in results]
    moment_capacity = [r["results"]["moment_capacity"]["MRd"] for r in results]
    shear_capacity = [r["results"]["shear_capacity"]["VRd_s"] for r in results]
    
    moment_utilization = [r["status"]["utilizations"]["moment"] for r in results]
    shear_utilization = [r["status"]["utilizations"]["shear"] for r in results]
    tensile_utilization = [r["status"]["utilizations"]["tensile"] for r in results]
    
    # Create comprehensive plot
    fig = plt.figure(figsize=(16, 12))
    
    # Layout: 2x3 grid
    ax1 = plt.subplot(3, 2, 1)
    ax2 = plt.subplot(3, 2, 2)
    ax3 = plt.subplot(3, 2, 3)
    ax4 = plt.subplot(3, 2, 4)
    ax5 = plt.subplot(3, 2, 5)
    ax6 = plt.subplot(3, 2, 6)
    
    fig.suptitle(f"Concrete Beam Load Envelope Analysis\n{beam_config['width']}×{beam_config['height']}mm, {beam_config['span']}m span", 
                 fontsize=16, fontweight='bold')
    
    # Plot 1: Moment envelope
    ax1.fill_between(loads, moments_applied, alpha=0.3, color='red', label='Applied Moment')
    ax1.plot(loads, moments_applied, 'r-', linewidth=2, label='MEd')
    ax1.plot(loads, moment_capacity_concrete, 'b--', linewidth=2, label='MRd,c (Concrete)')
    ax1.plot(loads, moment_capacity_steel, 'g--', linewidth=2, label='MRd,s (Steel)')
    ax1.plot(loads, moment_capacity, 'k-', linewidth=3, label='MRd (Design)')
    ax1.set_xlabel("Distributed Load (kN/m)")
    ax1.set_ylabel("Moment (kNm)")
    ax1.set_title("Moment Envelope")
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Plot 2: Shear envelope  
    ax2.fill_between(loads, shears_applied, alpha=0.3, color='red', label='Applied Shear')
    ax2.plot(loads, shears_applied, 'r-', linewidth=2, label='VEd')
    ax2.plot(loads, shear_capacity, 'g-', linewidth=2, label='VRd,s')
    ax2.set_xlabel("Distributed Load (kN/m)")
    ax2.set_ylabel("Shear (kN)")
    ax2.set_title("Shear Envelope")
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # Plot 3: Moment utilization
    colors_moment = ['green' if u <= 85 else 'orange' if u <= 100 else 'red' for u in moment_utilization]
    ax3.bar(loads, moment_utilization, width=(loads[1]-loads[0])*0.8, color=colors_moment, alpha=0.7)
    ax3.axhline(y=85, color='orange', linestyle='--', label='High utilization')
    ax3.axhline(y=100, color='red', linestyle='--', label='Capacity limit')
    ax3.set_xlabel("Distributed Load (kN/m)")
    ax3.set_ylabel("Utilization (%)")
    ax3.set_title("Moment Utilization")
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    # Plot 4: Shear utilization
    colors_shear = ['green' if u <= 85 else 'orange' if u <= 100 else 'red' for u in shear_utilization]
    ax4.bar(loads, shear_utilization, width=(loads[1]-loads[0])*0.8, color=colors_shear, alpha=0.7)
    ax4.axhline(y=85, color='orange', linestyle='--', label='High utilization')
    ax4.axhline(y=100, color='red', linestyle='--', label='Capacity limit')
    ax4.set_xlabel("Distributed Load (kN/m)")
    ax4.set_ylabel("Utilization (%)")
    ax4.set_title("Shear Utilization")
    ax4.legend()
    ax4.grid(True, alpha=0.3)
    
    # Plot 5: Combined utilization comparison
    ax5.plot(loads, moment_utilization, 'b-', linewidth=2, marker='o', label='Moment')
    ax5.plot(loads, shear_utilization, 'r-', linewidth=2, marker='s', label='Shear') 
    ax5.plot(loads, tensile_utilization, 'g-', linewidth=2, marker='^', label='Tensile')
    ax5.axhline(y=85, color='orange', linestyle='--', alpha=0.7)
    ax5.axhline(y=100, color='red', linestyle='--', alpha=0.7)
    ax5.set_xlabel("Distributed Load (kN/m)")
    ax5.set_ylabel("Utilization (%)")
    ax5.set_title("Utilization Comparison")
    ax5.legend()
    ax5.grid(True, alpha=0.3)
    
    # Plot 6: Load capacity summary
    # Find maximum allowable loads for each criterion
    max_load_moment = max([loads[i] for i, u in enumerate(moment_utilization) if u <= 100] + [0])
    max_load_shear = max([loads[i] for i, u in enumerate(shear_utilization) if u <= 100] + [0])
    max_load_tensile = max([loads[i] for i, u in enumerate(tensile_utilization) if u <= 100] + [0])
    max_load_overall = min(max_load_moment, max_load_shear, max_load_tensile)
    
    categories = ['Moment', 'Shear', 'Tensile', 'Overall']
    capacities = [max_load_moment, max_load_shear, max_load_tensile, max_load_overall]
    colors_cap = ['blue', 'red', 'green', 'purple']
    
    bars = ax6.bar(categories, capacities, color=colors_cap, alpha=0.7)
    ax6.set_ylabel("Maximum Load (kN/m)")
    ax6.set_title("Load Capacity by Criterion")
    ax6.grid(True, alpha=0.3)
    
    # Add value labels on bars
    for bar, capacity in zip(bars, capacities):
        height = bar.get_height()
        ax6.text(bar.get_x() + bar.get_width()/2., height + 1,
                f'{capacity:.1f}', ha='center', va='bottom', fontweight='bold')
    
    plt.tight_layout()
    plt.savefig("beam_load_envelope.png", dpi=300, bbox_inches='tight')
    print("📈 Load envelope plots saved to: beam_load_envelope.png")


def generate_design_report(results: List[Dict], beam_config: Dict):
    """Generate comprehensive design report."""
    
    # Extract key data
    loads = [r["inputs"]["_load_info"]["q"] for r in results]
    moment_utils = [r["status"]["utilizations"]["moment"] for r in results]
    shear_utils = [r["status"]["utilizations"]["shear"] for r in results]
    tensile_utils = [r["status"]["utilizations"]["tensile"] for r in results]
    
    # Find capacity limits
    max_load_moment = max([loads[i] for i, u in enumerate(moment_utils) if u <= 100] + [0])
    max_load_shear = max([loads[i] for i, u in enumerate(shear_utils) if u <= 100] + [0])
    max_load_tensile = max([loads[i] for i, u in enumerate(tensile_utils) if u <= 100] + [0])
    max_load_overall = min(max_load_moment, max_load_shear, max_load_tensile)
    
    # Determine governing criterion
    governing = "moment" if max_load_overall == max_load_moment else "shear" if max_load_overall == max_load_shear else "tensile"
    
    # Find first failure points
    fail_moment = next((loads[i] for i, u in enumerate(moment_utils) if u > 100), None)
    fail_shear = next((loads[i] for i, u in enumerate(shear_utils) if u > 100), None)
    fail_tensile = next((loads[i] for i, u in enumerate(tensile_utils) if u > 100), None)
    
    report = f"""
CONCRETE BEAM LOAD ENVELOPE ANALYSIS REPORT
==========================================

Project: 6m Simply Supported Beam Design Verification
Date: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}
Analysis Points: {len(results)}

BEAM CONFIGURATION:
==================
Geometry:
- Span: {beam_config['span']} m
- Cross-section: {beam_config['width']} × {beam_config['height']} mm
- Cover: {beam_config['cover']} mm

Reinforcement:
- Longitudinal: {beam_config['num_long_bars']}φ{beam_config['long_bar_dia']} mm
- Stirrups: φ{beam_config['stirrup_dia']}@{beam_config['stirrup_spacing']}mm c/c, {beam_config['stirrup_legs']} legs

Materials:
- Concrete: C{beam_config['fck']} (fck = {beam_config['fck']} MPa)
- Steel: B{beam_config['fyk']} (fyk = {beam_config['fyk']} MPa)
- Safety factors: γc = {beam_config['gamma_c']}, γs = {beam_config['gamma_s']}

LOAD ENVELOPE RESULTS:
=====================

Maximum Allowable Loads:
- Moment-controlled: {max_load_moment:.1f} kN/m
- Shear-controlled: {max_load_shear:.1f} kN/m  
- Tensile-controlled: {max_load_tensile:.1f} kN/m
- Overall capacity: {max_load_overall:.1f} kN/m

Governing Design Criterion: {governing.upper()}

First Failure Loads:
- Moment failure: {fail_moment:.1f if fail_moment else 'No failure'} kN/m
- Shear failure: {fail_shear:.1f if fail_shear else 'No failure'} kN/m
- Tensile failure: {fail_tensile:.1f if fail_tensile else 'No failure'} kN/m

LOAD ANALYSIS:
=============

Standard Load Cases (Eurocode):
"""

    # Calculate standard load cases
    dead_load = 5.0  # kN/m (assumed)
    live_load_residential = 2.0  # kN/m
    live_load_office = 3.0  # kN/m
    live_load_commercial = 5.0  # kN/m
    
    uls_residential = 1.35 * dead_load + 1.5 * live_load_residential
    uls_office = 1.35 * dead_load + 1.5 * live_load_office
    uls_commercial = 1.35 * dead_load + 1.5 * live_load_commercial
    
    report += f"\nAssuming dead load = {dead_load} kN/m:\n"
    report += f"• Residential (2.0 kN/m live): ULS = {uls_residential:.1f} kN/m - "
    report += f"{'✓ PASS' if uls_residential <= max_load_overall else '✗ FAIL'}\n"
    
    report += f"• Office (3.0 kN/m live): ULS = {uls_office:.1f} kN/m - "
    report += f"{'✓ PASS' if uls_office <= max_load_overall else '✗ FAIL'}\n"
    
    report += f"• Commercial (5.0 kN/m live): ULS = {uls_commercial:.1f} kN/m - "
    report += f"{'✓ PASS' if uls_commercial <= max_load_overall else '✗ FAIL'}\n"

    # Design recommendations
    report += f"\nDESIGN RECOMMENDATIONS:\n"
    report += f"======================\n"

    if governing == "moment":
        report += f"MOMENT-CONTROLLED DESIGN:\n"
        report += f"• Consider increasing longitudinal reinforcement\n"
        report += f"• Alternative: Increase beam height to {beam_config['height'] + 50}mm\n"
        report += f"• Alternative: Use higher strength steel (B{beam_config['fyk'] + 100})\n"
    elif governing == "shear":
        report += f"SHEAR-CONTROLLED DESIGN:\n"
        report += f"• Reduce stirrup spacing to {max(100, int(beam_config['stirrup_spacing'] * 0.75))}mm\n"
        report += f"• Alternative: Increase stirrup diameter to φ{beam_config['stirrup_dia'] + 2}mm\n"
        report += f"• Alternative: Add more stirrup legs (current: {beam_config['stirrup_legs']})\n"
    else:
        report += f"TENSILE-CONTROLLED DESIGN:\n"
        report += f"• Increase longitudinal reinforcement area\n"
        report += f"• Consider {beam_config['num_long_bars'] + 1}φ{beam_config['long_bar_dia']} or {beam_config['num_long_bars']}φ{beam_config['long_bar_dia'] + 5}\n"

    report += f"\nOPTIMIZATION OPPORTUNITIES:\n"
    if max_load_overall > 25:  # If capacity is high
        report += f"• Current design has good capacity ({max_load_overall:.1f} kN/m)\n"
        report += f"• Consider optimization to reduce reinforcement:\n"
        report += f"  - Reduce to {beam_config['num_long_bars']}φ{max(12, beam_config['long_bar_dia'] - 2)}mm longitudinal bars\n"
        report += f"  - Increase stirrup spacing to {min(300, int(beam_config['stirrup_spacing'] * 1.2))}mm\n"
    else:
        report += f"• Current capacity is limiting ({max_load_overall:.1f} kN/m)\n"
        report += f"• Strengthening required for higher loads\n"

    # Detailed load table
    report += f"\nDETAILED RESULTS TABLE:\n"
    report += f"======================\n"
    report += f"Load   |  MEd  |  VEd  | M-Util | V-Util | T-Util | Status\n"
    report += f"(kN/m) | (kNm) | (kN)  |   (%)  |   (%)  |   (%)  |\n"
    report += f"-" * 62 + "\n"

    for r in results:
        q = r["inputs"]["_load_info"]["q"]
        MEd = r["inputs"]["loads"]["MEd"] 
        VEd = r["inputs"]["loads"]["VEd"]
        m_util = r["status"]["utilizations"]["moment"]
        v_util = r["status"]["utilizations"]["shear"] 
        t_util = r["status"]["utilizations"]["tensile"]
        status = r["status"]["overall"]
        
        report += f"{q:6.1f} | {MEd:5.1f} | {VEd:5.1f} | {m_util:6.1f} | {v_util:6.1f} | {t_util:6.1f} | {status:>6}\n"

    # Save report
    with open("beam_design_report.txt", "w") as f:
        f.write(report)
    
    print("📝 Design report saved to: beam_design_report.txt")


def export_detailed_results(results: List[Dict]):
    """Export detailed calculation results to CSV."""
    
    data = []
    for r in results:
        if r.get("success"):
            row = {
                "Load_kN_per_m": r["inputs"]["_load_info"]["q"],
                "Span_m": r["inputs"]["_load_info"]["span"],
                "MEd_kNm": r["inputs"]["loads"]["MEd"],
                "VEd_kN": r["inputs"]["loads"]["VEd"],
                "MRd_c_kNm": r["results"]["moment_capacity"]["MRd_c"],
                "MRd_s_kNm": r["results"]["moment_capacity"]["MRd_s"],
                "MRd_kNm": r["results"]["moment_capacity"]["MRd"],
                "VRd_s_kN": r["results"]["shear_capacity"]["VRd_s"],
                "F_Ed_kN": r["results"]["tensile_force"]["F_Ed"],
                "F_Rd_kN": r["results"]["tensile_force"]["F_Rd"],
                "Moment_Util_pct": r["status"]["utilizations"]["moment"],
                "Shear_Util_pct": r["status"]["utilizations"]["shear"],
                "Tensile_Util_pct": r["status"]["utilizations"]["tensile"],
                "Overall_Status": r["status"]["overall"],
                "d_mm": r["intermediate_calculations"]["geometry"]["d"],
                "Asl_mm2": r["intermediate_calculations"]["geometry"]["Asl"],
                "z_mm": r["intermediate_calculations"]["geometry"]["z"],
                "Asw_mm2": r["intermediate_calculations"]["shear"]["Asw"],
                "cot_theta_final": r["intermediate_calculations"]["shear"]["cot_theta_final"],
                "angle_status": r["intermediate_calculations"]["shear"]["angle_status"]
            }
            data.append(row)
    
    df = pd.DataFrame(data)
    df.to_csv("beam_analysis_results.csv", index=False)
    print("📊 Detailed results exported to: beam_analysis_results.csv")


def run_optimization_analysis(results: List[Dict], beam_config: Dict):
    """Run design optimization analysis."""
    
    loads = [r["inputs"]["_load_info"]["q"] for r in results]
    moment_utils = [r["status"]["utilizations"]["moment"] for r in results]
    shear_utils = [r["status"]["utilizations"]["shear"] for r in results]
    
    max_load = min(
        max([loads[i] for i, u in enumerate(moment_utils) if u <= 100] + [0]),
        max([loads[i] for i, u in enumerate(shear_utils) if u <= 100] + [0])
    )
    
    optimization_report = f"""
BEAM DESIGN OPTIMIZATION ANALYSIS
=================================

Current Design Capacity: {max_load:.1f} kN/m

OPTIMIZATION SCENARIOS:
======================

Scenario 1: Reduce Longitudinal Reinforcement
• Current: {beam_config['num_long_bars']}φ{beam_config['long_bar_dia']}mm
• Proposed: {beam_config['num_long_bars']}φ{max(12, beam_config['long_bar_dia']-3)}mm
• Steel saving: ~{((beam_config['long_bar_dia']**2 - max(12, beam_config['long_bar_dia']-3)**2) / beam_config['long_bar_dia']**2 * 100):.0f}%
• Estimated capacity reduction: ~10-15%

Scenario 2: Increase Stirrup Spacing
• Current: φ{beam_config['stirrup_dia']}@{beam_config['stirrup_spacing']}mm
• Proposed: φ{beam_config['stirrup_dia']}@{min(300, int(beam_config['stirrup_spacing']*1.3))}mm
• Steel saving: ~{((beam_config['stirrup_spacing']*1.3 - beam_config['stirrup_spacing']) / beam_config['stirrup_spacing'] * 100):.0f}%
• Estimated capacity reduction: ~5-10%

Scenario 3: Optimize Cross-Section
• Current: {beam_config['width']}×{beam_config['height']}mm
• Proposed: {beam_config['width']}×{beam_config['height']-25}mm (reduced height)
• Concrete saving: ~5%
• Estimated capacity reduction: ~8-12%

STRENGTHENING OPTIONS (if higher capacity needed):
================================================

Option 1: Additional Longitudinal Steel
• Add 1 more bar: {beam_config['num_long_bars']+1}φ{beam_config['long_bar_dia']}mm
• Estimated capacity increase: ~15-20%

Option 2: Larger Longitudinal Bars
• Upgrade to: {beam_config['num_long_bars']}φ{beam_config['long_bar_dia']+5}mm
• Estimated capacity increase: ~25-30%

Option 3: Increased Cross-Section
• Increase height to: {beam_config['width']}×{beam_config['height']+50}mm
• Estimated capacity increase: ~20-25%

COST-BENEFIT RECOMMENDATIONS:
============================

For loads up to {max_load*0.8:.1f} kN/m:
• Consider Scenario 1 + 2 for material savings
• Maintain safety margins

For loads up to {max_load:.1f} kN/m:
• Current design is optimal
• No changes recommended

For loads above {max_load:.1f} kN/m:
• Implement Option 1 or Option 2
• Re-analyze with API after modifications

"""

    with open("beam_optimization.txt", "w") as f:
        f.write(optimization_report)
    
    print("🎯 Optimization analysis saved to: beam_optimization.txt")


if __name__ == "__main__":
    # Check dependencies
    try:
        import matplotlib.pyplot as plt
        import pandas as pd
        import numpy as np
    except ImportError as e:
        print(f"❌ Missing required package: {e}")
        print("Install with: pip install matplotlib pandas numpy")
        sys.exit(1)
    
    # Check Node.js availability  
    try:
        subprocess.run(['node', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Node.js is required but not found.")
        print("Please install Node.js from https://nodejs.org/")
        sys.exit(1)
    
    # Run the analysis
    try:
        run_load_envelope_analysis()
    except KeyboardInterrupt:
        print("\n⚠️  Analysis interrupted by user")
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()