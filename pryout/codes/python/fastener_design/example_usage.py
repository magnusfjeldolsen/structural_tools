"""
Example usage of FastenerDesign system

This script demonstrates how to use the fastener design system
with different configurations. Perfect for understanding the API
before building a UI.
"""

import sys
from pathlib import Path

from core.fastener import Fastener
from core.concrete import ConcreteProperties
from core.fastener_group import FastenerGroup
from design import FastenerDesign


def example_1_single_fastener_tension():
    """Example 1: Single fastener in tension"""
    print("\n" + "="*70)
    print("EXAMPLE 1: Single M16 Fastener in Tension")
    print("="*70)

    # Create fastener
    fastener = Fastener(
        diameter=16,
        embedment_depth=100,
        steel_grade=500,
        area=157,  # Threaded area
        fastener_type='headed'
    )

    # Create concrete
    concrete = ConcreteProperties(
        strength_class='C25/30',
        thickness=200,
        cracked=True  # Assume cracked
    )

    # Create design
    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 50000},  # 50 kN
        edge_distances={'c1': 150, 'c2': 150}
    )

    # Check all modes
    results = design.check_all_modes()

    # Print summary
    print(results['summary'])

    return results


def example_2_combined_loading():
    """Example 2: Fastener with combined tension and shear"""
    print("\n" + "="*70)
    print("EXAMPLE 2: M20 Fastener with Combined Loading")
    print("="*70)

    fastener = Fastener(
        diameter=20,
        embedment_depth=150,
        steel_grade=500,
        area=245
    )

    concrete = ConcreteProperties(
        fck=30,
        thickness=250,
        cracked=False  # Non-cracked
    )

    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 80000, 'shear': 35000},  # 80 kN, 35 kN
        edge_distances={'c1': 200, 'c2': 200}
    )

    results = design.check_all_modes()
    print(results['summary'])

    # Show detailed info for one mode
    print("\nDetailed Steel Tension Info:")
    steel_info = results['tension']['steel']['info']
    for key, value in steel_info.items():
        print(f"  {key}: {value}")

    return results


def example_3_fastener_group():
    """Example 3: 2x2 Fastener Group"""
    print("\n" + "="*70)
    print("EXAMPLE 3: 2x2 Group of M16 Fasteners")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=None)
    concrete = ConcreteProperties(strength_class='C25/30', thickness=250, cracked=True)

    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={
            'tension': 0,  # 0 kN total
            'shear': 50000,     # 50 kN total
            'n_fasteners': 4
        },
        spacings={'sx': 200, 'sy': 200},
        edge_distances={'c1': 150, 'c2': 150}
    )

    results = design.check_all_modes()
    print(results['summary'])

    return results


def example_4_selective_modes():
    """Example 4: Checking only specific failure modes"""
    print("\n" + "="*70)
    print("EXAMPLE 4: Selective Failure Mode Checking")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=157)
    concrete = ConcreteProperties(strength_class='C30/37', thickness=200, cracked=True)

    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 60000, 'shear': 25000},
        edge_distances={'c1': 180}
    )

    # Check only specific modes
    print("\nChecking ONLY steel modes:")
    results = design.check_all_modes(
        tension_modes=['steel'],
        shear_modes=['steel']
    )
    print(results['summary'])

    # Get available modes
    available = design.get_available_modes()
    print("\nAvailable failure modes:")
    print(f"  Tension (implemented): {available['tension']['implemented']}")
    print(f"  Shear (implemented): {available['shear']['implemented']}")

    return results


def example_5_seismic_loading():
    """Example 5: Seismic loading (reduced safety factors)"""
    print("\n" + "="*70)
    print("EXAMPLE 5: Seismic Loading")
    print("="*70)

    fastener = Fastener(20, 150, 500, area=245)

    # Concrete always cracked for seismic!
    concrete = ConcreteProperties(strength_class='C30/37', thickness=250, cracked=True)

    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 100000, 'shear': 40000},
        edge_distances={'c1': 200, 'c2': 200},
        loading_type='seismic'  # <-- Seismic factors
    )

    print(f"Material factors (seismic):")
    print(f"  γMs = {design.gamma_Ms}")  # 1.0
    print(f"  γMc = {design.gamma_Mc}")  # 1.2

    results = design.check_all_modes()
    print(results['summary'])

    return results


def example_6_edge_effects():
    """Example 6: Fastener near edge (edge effects)"""
    print("\n" + "="*70)
    print("EXAMPLE 6: Fastener Near Edge")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=157)
    concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

    # Small edge distance
    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 40000, 'shear': 20000},
        edge_distances={'c1': 100}  # Small! (ccr,N = 150)
    )

    results = design.check_all_modes()
    print(results['summary'])

    # Show psi factors
    cone_info = results['tension']['cone']['info']
    print("\nPsi factors (concrete cone):")
    for key, value in cone_info['psi_factors'].items():
        print(f"  {key} = {value:.3f}")

    return results


def example_7_all_failure_modes():
    """Example 7: Check all failure modes including Phase 3 additions"""
    print("\n" + "="*70)
    print("EXAMPLE 7: All Failure Modes (Phase 1-3)")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=157, d_head=28.8)
    concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 40000, 'shear': 20000},  # 40 kN, 20 kN
        edge_distances={'c1': 150, 'c2': 150}
    )

    # Check ALL failure modes (default behavior)
    results = design.check_all_modes()
    print(results['summary'])

    print("\nDETAILED FAILURE MODE INFO:")

    # Show pullout info
    if 'pullout' in results['tension']:
        print("\nPull-out failure:")
        pullout_info = results['tension']['pullout']['info']
        print(f"  Head bearing area: {pullout_info['Ah']:.1f} mm²")
        print(f"  Capacity: {pullout_info['NRk_p_kN']:.1f} kN")

    # Show splitting info
    if 'splitting' in results['tension']:
        print("\nSplitting failure:")
        split_info = results['tension']['splitting']['info']
        print(f"  Risk level: {split_info['risk_level']}")
        print(f"  Prevented: {split_info['splitting_prevented']}")

    # Show blowout info
    if 'blowout' in results['tension']:
        print("\nBlow-out failure:")
        blowout_info = results['tension']['blowout']['info']
        print(f"  Relevant: {blowout_info['relevance']['relevant']}")
        print(f"  Threshold: {blowout_info['relevance']['c_threshold']:.1f} mm")

    # Show pryout info
    if 'pryout' in results['shear']:
        print("\nPry-out failure:")
        pryout_info = results['shear']['pryout']['info']
        print(f"  k-factor: {pryout_info['k_factor']:.1f}")
        print(f"  Capacity: {pryout_info['VRk_cp_kN']:.1f} kN")

    return results


def example_8_combined_loading_interaction():
    """Example 8: N-V interaction check (Phase 4)"""
    print("\n" + "="*70)
    print("EXAMPLE 8: Combined Loading with N-V Interaction (Phase 4)")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=157)
    concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

    # Design with both tension and shear
    design = FastenerDesign(
        fastener=fastener,
        concrete=concrete,
        loading={'tension': 30000, 'shear': 20000},  # 30 kN, 20 kN
        edge_distances={'c1': 150, 'c2': 150}
    )

    results = design.check_all_modes()
    print(results['summary'])

    # Show detailed interaction check
    if results['interaction']:
        print("\nDETAILED INTERACTION CHECK:")
        interaction = results['interaction']
        print(f"  Governing tension mode: {interaction['governing_tension_mode']}")
        print(f"  NRd = {interaction['NRd_kN']:.1f} kN")
        print(f"  Governing shear mode: {interaction['governing_shear_mode']}")
        print(f"  VRd = {interaction['VRd_kN']:.1f} kN")
        print(f"\n  Interaction formula:")
        print(f"    (NEd/NRd)^{interaction['alpha']} + (VEd/VRd)^{interaction['beta']} ≤ 1.0")
        print(f"    ({interaction['NEd_kN']:.1f}/{interaction['NRd_kN']:.1f})^{interaction['alpha']} + "
              f"({interaction['VEd_kN']:.1f}/{interaction['VRd_kN']:.1f})^{interaction['beta']} = {interaction['interaction_ratio']:.3f}")
        print(f"\n  Individual utilizations:")
        print(f"    Tension: {interaction['tension_utilization']:.3f}")
        print(f"    Shear:   {interaction['shear_utilization']:.3f}")
        print(f"\n  Status: {interaction['status']}")

    return results


def compare_cracked_vs_noncracked():
    """Bonus: Compare cracked vs non-cracked concrete"""
    print("\n" + "="*70)
    print("COMPARISON: Cracked vs Non-Cracked Concrete")
    print("="*70)

    fastener = Fastener(16, 100, 500, area=157)

    # Cracked
    concrete_cr = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)
    design_cr = FastenerDesign(
        fastener=fastener,
        concrete=concrete_cr,
        loading={'tension': 50000},
        edge_distances={'c1': 150}
    )
    results_cr = design_cr.check_tension_modes(modes=['cone'])

    # Non-cracked
    concrete_ncr = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=False)
    design_ncr = FastenerDesign(
        fastener=fastener,
        concrete=concrete_ncr,
        loading={'tension': 50000},
        edge_distances={'c1': 150}
    )
    results_ncr = design_ncr.check_tension_modes(modes=['cone'])

    print(f"\nConcrete Cone Capacity:")
    print(f"  Cracked:     NRd = {results_cr['cone']['NRd_kN']:.1f} kN "
          f"(k = {concrete_cr.get_k_factor()})")
    print(f"  Non-cracked: NRd = {results_ncr['cone']['NRd_kN']:.1f} kN "
          f"(k = {concrete_ncr.get_k_factor()})")
    print(f"  Ratio: {results_ncr['cone']['NRd']/results_cr['cone']['NRd']:.2f}x")


def main():
    """Run all examples"""
    print("\n" + "#"*70)
    print("# EC2 PART 4 FASTENER DESIGN - EXAMPLE USAGE")
    print("#"*70)

    example_1_single_fastener_tension()
    example_2_combined_loading()
    example_3_fastener_group()
    example_4_selective_modes()
    example_5_seismic_loading()
    example_6_edge_effects()
    example_7_all_failure_modes()  # NEW: Phase 3 modes
    example_8_combined_loading_interaction()  # NEW: Phase 4 N-V interaction
    compare_cracked_vs_noncracked()

    print("\n" + "#"*70)
    print("# ALL EXAMPLES COMPLETE")
    print("#"*70 + "\n")


if __name__ == '__main__':
    main()
