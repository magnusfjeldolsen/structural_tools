#!/usr/bin/env python3
"""
Concrete Slab Parametric Analysis Example

This example demonstrates API integration for parametric analysis of a 6m simply supported slab.
- Varying MEd along the slab length
- Different reinforcement zones: middle 2m has cc=75mm, outer sections have cc=150mm
- Generates capacity utilization plots and optimization recommendations

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


class ConcreteSlabAPI:
    """Interface to the JavaScript concrete slab API."""
    
    def __init__(self, api_path: str = None):
        """Initialize the API interface."""
        if api_path is None:
            # Default to the concrete_slab_api.js in the parent directory
            self.api_path = Path(__file__).parent.parent / "concrete_slab_design" / "concrete_slab_api.js"
        else:
            self.api_path = Path(api_path)
    
    def calculate(self, inputs: Dict) -> Dict:
        """Call the concrete slab calculation API."""
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
            const result = calculateConcreteSlab(inputs);

            // Output result as JSON
            console.log(JSON.stringify(result, null, 2));
            """
            
            # Write temporary script
            temp_script = Path(__file__).parent / "temp_slab_calc.js"
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


def generate_moment_distribution(length: float, positions: np.ndarray) -> np.ndarray:
    """
    Generate moment distribution for a simply supported slab with uniform load.
    
    Args:
        length: Slab length in meters
        positions: Array of positions along slab (0 to length)
    
    Returns:
        Array of moments at each position in kNm
    """
    # For a simply supported beam/slab with uniform load q:
    # M(x) = q*x*(L-x)/2
    # Here we'll assume a distributed load that gives reasonable moments
    q = 20  # kN/m (uniform load)
    
    moments = []
    for x in positions:
        if 0 <= x <= length:
            M = q * x * (length - x) / 2  # kNm
            moments.append(M)
        else:
            moments.append(0)
    
    return np.array(moments)


def get_reinforcement_spacing(position: float, slab_length: float) -> float:
    """
    Get reinforcement center-to-center spacing based on position.
    
    Args:
        position: Position along slab (0 to slab_length)
        slab_length: Total slab length
    
    Returns:
        Center-to-center spacing in mm
    """
    # Middle 2m of 6m slab has cc=75mm, outer sections have cc=150mm
    middle_start = (slab_length - 2) / 2  # 2m middle section
    middle_end = middle_start + 2
    
    if middle_start <= position <= middle_end:
        return 75.0  # mm
    else:
        return 150.0  # mm


def analyze_slab_section(position: float, MEd: float, cc_l: float, api: ConcreteSlabAPI) -> Dict:
    """
    Analyze a single slab section at given position.
    
    Args:
        position: Position along slab in meters
        MEd: Applied moment in kNm
        cc_l: Reinforcement spacing in mm
        api: ConcreteSlabAPI instance
    
    Returns:
        Calculation result dictionary
    """
    inputs = {
        "geometry": {
            "MEd": MEd,
            "t": 200,  # mm slab thickness
            "c": 35    # mm concrete cover
        },
        "material": {
            "fcd": 19.8,  # MPa design concrete strength
            "fyd": 435    # MPa design steel strength
        },
        "reinforcement": {
            "phi_l": 12,    # mm bar diameter
            "cc_l": cc_l    # mm center-to-center spacing
        }
    }
    
    result = api.calculate(inputs)
    
    if result.get("success"):
        # Add position information
        result["position"] = position
        result["cc_l_used"] = cc_l
    
    return result


def run_parametric_analysis():
    """Run the complete parametric analysis."""
    
    print("🔧 Concrete Slab Parametric Analysis")
    print("=" * 50)
    print("Analyzing 6m simply supported slab with variable reinforcement")
    print("• Middle 2m: cc = 75mm")
    print("• Outer sections: cc = 150mm")
    print()
    
    # Initialize API
    api = ConcreteSlabAPI()
    
    # Slab parameters
    slab_length = 6.0  # meters
    num_points = 31    # Analysis points along slab
    
    # Generate analysis positions
    positions = np.linspace(0, slab_length, num_points)
    
    # Generate moment distribution
    moments = generate_moment_distribution(slab_length, positions)
    
    # Run analysis for each position
    print("🔍 Running calculations...")
    results = []
    
    for i, (pos, MEd) in enumerate(zip(positions, moments)):
        cc_l = get_reinforcement_spacing(pos, slab_length)
        result = analyze_slab_section(pos, MEd, cc_l, api)
        
        if result.get("success"):
            results.append(result)
            print(f"✓ Position {pos:.1f}m: MEd={MEd:.1f} kNm, cc={cc_l}mm, "
                  f"Util={result['status']['utilization']:.1f}%")
        else:
            print(f"✗ Position {pos:.1f}m: Calculation failed")
            print(f"  Error: {result.get('error', 'Unknown error')}")
    
    if not results:
        print("❌ No successful calculations. Check Node.js installation and API files.")
        return
    
    print(f"\n✅ Completed {len(results)} calculations")
    
    # Create visualization
    create_analysis_plots(results, slab_length)
    
    # Generate summary report
    generate_summary_report(results, slab_length)
    
    # Export results to CSV
    export_to_csv(results)
    
    print("\n📊 Analysis complete! Check the generated files:")
    print("  • slab_analysis_plots.png - Visualization")
    print("  • slab_analysis_summary.txt - Summary report") 
    print("  • slab_analysis_results.csv - Raw data")


def create_analysis_plots(results: List[Dict], slab_length: float):
    """Create comprehensive analysis plots."""
    
    # Extract data for plotting
    positions = [r["position"] for r in results]
    moments_applied = [r["inputs"]["geometry"]["MEd"] for r in results]
    moments_capacity = [r["results"]["moment_capacity"]["MRd"] for r in results]
    utilizations = [r["status"]["utilization"] for r in results]
    reinforcement = [r["cc_l_used"] for r in results]
    
    # Create figure with subplots
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 10))
    fig.suptitle("Concrete Slab Parametric Analysis - 6m Simply Supported Slab", fontsize=16, fontweight='bold')
    
    # Plot 1: Moment diagram
    ax1.fill_between(positions, moments_applied, alpha=0.3, color='red', label='Applied Moment')
    ax1.plot(positions, moments_applied, 'r-', linewidth=2, label='MEd')
    ax1.plot(positions, moments_capacity, 'g-', linewidth=2, label='MRd (Capacity)')
    ax1.set_xlabel("Position along slab (m)")
    ax1.set_ylabel("Moment (kNm)")
    ax1.set_title("Applied Moment vs Capacity")
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    ax1.set_xlim(0, slab_length)
    
    # Plot 2: Utilization
    colors = ['green' if u <= 85 else 'orange' if u <= 100 else 'red' for u in utilizations]
    bars = ax2.bar(positions, utilizations, width=slab_length/(len(positions)*1.5), color=colors, alpha=0.7)
    ax2.axhline(y=85, color='orange', linestyle='--', label='High utilization (85%)')
    ax2.axhline(y=100, color='red', linestyle='--', label='Capacity limit (100%)')
    ax2.set_xlabel("Position along slab (m)")
    ax2.set_ylabel("Utilization (%)")
    ax2.set_title("Capacity Utilization Along Slab")
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    ax2.set_xlim(0, slab_length)
    ax2.set_ylim(0, max(utilizations) * 1.1)
    
    # Plot 3: Reinforcement spacing
    ax3.step(positions, reinforcement, 'b-', linewidth=3, where='mid')
    ax3.fill_between(positions, reinforcement, alpha=0.3, color='blue', step='mid')
    ax3.set_xlabel("Position along slab (m)")
    ax3.set_ylabel("Reinforcement Spacing (mm)")
    ax3.set_title("Reinforcement Layout")
    ax3.grid(True, alpha=0.3)
    ax3.set_xlim(0, slab_length)
    ax3.set_ylim(60, 160)
    
    # Annotate reinforcement zones
    ax3.text(1, 140, "cc = 150mm", ha='center', va='center', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue"))
    ax3.text(3, 90, "cc = 75mm", ha='center', va='center', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgreen"))
    ax3.text(5, 140, "cc = 150mm", ha='center', va='center', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue"))
    
    # Plot 4: Safety factor (inverse of utilization)
    safety_factors = [100/u if u > 0 else float('inf') for u in utilizations]
    # Cap safety factors for plotting
    safety_factors_capped = [min(sf, 5) for sf in safety_factors]
    
    ax4.plot(positions, safety_factors_capped, 'purple', linewidth=2, marker='o', markersize=4)
    ax4.axhline(y=1, color='red', linestyle='--', label='Minimum safety (γ=1.0)')
    ax4.axhline(y=1.18, color='orange', linestyle='--', label='Target safety (γ≈1.2)')
    ax4.set_xlabel("Position along slab (m)")
    ax4.set_ylabel("Safety Factor (MRd/MEd)")
    ax4.set_title("Safety Factor Distribution")
    ax4.legend()
    ax4.grid(True, alpha=0.3)
    ax4.set_xlim(0, slab_length)
    ax4.set_ylim(0.8, 5)
    
    plt.tight_layout()
    plt.savefig("slab_analysis_plots.png", dpi=300, bbox_inches='tight')
    print("📈 Plots saved to: slab_analysis_plots.png")


def generate_summary_report(results: List[Dict], slab_length: float):
    """Generate a comprehensive text summary report."""
    
    # Calculate statistics
    utilizations = [r["status"]["utilization"] for r in results]
    max_util = max(utilizations)
    avg_util = np.mean(utilizations)
    min_util = min(utilizations)
    
    # Find critical sections
    max_util_pos = [r["position"] for r in results if r["status"]["utilization"] == max_util][0]
    over_limit = [r for r in results if r["status"]["utilization"] > 100]
    high_util = [r for r in results if 85 < r["status"]["utilization"] <= 100]
    
    report = f"""
CONCRETE SLAB PARAMETRIC ANALYSIS REPORT
========================================

Project: 6m Simply Supported Slab with Variable Reinforcement
Date: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}
Analysis Points: {len(results)}

SLAB CONFIGURATION:
- Length: {slab_length} m
- Thickness: 200 mm
- Cover: 35 mm  
- Reinforcement: φ12 bars
- Middle 2m zone: cc = 75 mm spacing
- Outer zones: cc = 150 mm spacing

MATERIAL PROPERTIES:
- Design concrete strength (fcd): 19.8 MPa
- Design steel strength (fyd): 435 MPa

ANALYSIS RESULTS:
================

Utilization Statistics:
- Maximum utilization: {max_util:.1f}% at position {max_util_pos:.1f}m
- Average utilization: {avg_util:.1f}%
- Minimum utilization: {min_util:.1f}%

Design Status:
- Sections over capacity limit (>100%): {len(over_limit)}
- Sections with high utilization (85-100%): {len(high_util)}
- Acceptable sections (<85%): {len(results) - len(over_limit) - len(high_util)}

"""

    if over_limit:
        report += "\n❌ CRITICAL SECTIONS (Utilization > 100%):\n"
        for r in over_limit:
            report += f"  Position {r['position']:.1f}m: {r['status']['utilization']:.1f}% utilization\n"
            report += f"    MEd = {r['inputs']['geometry']['MEd']:.1f} kNm, MRd = {r['results']['moment_capacity']['MRd']:.1f} kNm\n"

    if high_util:
        report += "\n⚠️  HIGH UTILIZATION SECTIONS (85-100%):\n"
        for r in high_util:
            report += f"  Position {r['position']:.1f}m: {r['status']['utilization']:.1f}% utilization\n"

    # Recommendations
    report += "\nRECOMMENDations:\n"
    report += "===============\n"

    if over_limit:
        report += "• IMMEDIATE ACTION REQUIRED: Some sections exceed capacity\n"
        report += "  - Increase slab thickness to 250mm, or\n"
        report += "  - Reduce reinforcement spacing to cc=60mm in critical zones, or\n"
        report += "  - Use higher strength reinforcement (fyd=500 MPa)\n"
    elif high_util:
        report += "• Consider design optimization for high utilization sections\n"
        report += "  - Reduce reinforcement spacing in middle zone to cc=60mm\n"
        report += "  - Consider slight thickness increase to 220mm for extra margin\n"
    else:
        report += "• Design is acceptable with good safety margins\n"
        report += "• Consider optimization to reduce reinforcement if economical\n"

    report += f"\nDETAILED RESULTS:\n"
    report += "================\n"
    report += "Position | MEd    | MRd    | Spacing | Utilization | Status\n"
    report += "  (m)    | (kNm)  | (kNm)  |  (mm)   |     (%)     |\n"
    report += "-" * 60 + "\n"

    for r in results:
        status = "FAIL" if r["status"]["utilization"] > 100 else "HIGH" if r["status"]["utilization"] > 85 else "OK"
        report += f"{r['position']:6.1f}   {r['inputs']['geometry']['MEd']:6.1f}   "
        report += f"{r['results']['moment_capacity']['MRd']:6.1f}   {r['cc_l_used']:7.0f}   "
        report += f"{r['status']['utilization']:9.1f}   {status:>6}\n"

    # Save report
    with open("slab_analysis_summary.txt", "w") as f:
        f.write(report)
    
    print("📝 Summary report saved to: slab_analysis_summary.txt")


def export_to_csv(results: List[Dict]):
    """Export detailed results to CSV file."""
    
    data = []
    for r in results:
        if r.get("success"):
            row = {
                "Position_m": r["position"],
                "MEd_kNm": r["inputs"]["geometry"]["MEd"],
                "MRd_kNm": r["results"]["moment_capacity"]["MRd"],
                "MRd_c_kNm": r["results"]["moment_capacity"]["MRd_c"],
                "MRd_s_kNm": r["results"]["moment_capacity"]["MRd_s"],
                "Spacing_mm": r["cc_l_used"],
                "Utilization_pct": r["status"]["utilization"],
                "Status": r["status"]["overall"],
                "Governing_capacity": r["results"]["moment_capacity"]["governing"],
                "d_mm": r["intermediate_calculations"]["geometry"]["d"],
                "As_mm2": r["intermediate_calculations"]["reinforcement"]["As"],
                "z_mm": r["intermediate_calculations"]["lever_arm"]["z"]
            }
            data.append(row)
    
    df = pd.DataFrame(data)
    df.to_csv("slab_analysis_results.csv", index=False)
    print("📊 Raw data exported to: slab_analysis_results.csv")


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
        run_parametric_analysis()
    except KeyboardInterrupt:
        print("\n⚠️  Analysis interrupted by user")
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()