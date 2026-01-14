"""
Test with the actual positions from the browser
"""

import sys
sys.path.insert(0, 'codes/python')

import numpy as np
from fastener_design.calculations import planar_bending

# Positions from browser console
positions = [
    (0, 0),
    (100, 0),
    (100, 100),
    (0, 100)
]

# Fastener diameter 16mm
d = 16  # mm
area = np.pi * (d/2)**2
areas = [area] * 4

print("=" * 70)
print("TEST: Actual Browser Positions")
print("=" * 70)

print(f"\nPositions: {positions}")
print(f"Fastener diameter: {d} mm")
print(f"Fastener area: {area:.2f} mm²")

# Applied moment
Mx = 10.0  # kNm
My = 0.0

print(f"\nApplied moments:")
print(f"  Mx = {Mx} kNm")
print(f"  My = {My} kNm")

# Calculate centroid
centroid = planar_bending.calculate_centroid(positions, areas)
print(f"\nCentroid: ({centroid[0]:.2f}, {centroid[1]:.2f}) mm")

# Calculate section properties
section_props = planar_bending.calculate_section_properties(positions, areas, centroid)
print(f"\nSection properties:")
print(f"  Ix  = {section_props['Ix']:.0f} mm^4")
print(f"  Iy  = {section_props['Iy']:.0f} mm^4")
print(f"  Ixy = {section_props['Ixy']:.0f} mm^4")

# Calculate forces
forces = planar_bending.calculate_bending_forces(
    positions, areas, Mx, My, centroid, section_props
)

print(f"\nForces from Mx bending:")
for i, (pos, force) in enumerate(zip(positions, forces)):
    direction = "TENSION" if force > 0 else "COMPRESSION" if force < 0 else "ZERO"
    print(f"  Fastener {i+1} at ({pos[0]:3.0f}, {pos[1]:3.0f}): {force:+8.3f} kN  {direction}")

# Use full distribution
print(f"\n" + "=" * 70)
print("Full Distribution:")
print("=" * 70)

distribution = planar_bending.distribute_loads_with_bending(
    positions=positions,
    areas=areas,
    N=0,
    Vx=0,
    Vy=0,
    Mx=Mx,
    My=My,
    Mz=0,
    application_type='centroid'
)

print(f"\n{'ID':<4} {'Position':>12} {'N_direct':>10} {'N_Mx':>10} {'N_My':>10} {'N_total':>10}")
print("-" * 60)
for d in distribution:
    print(f"{d['fastener_id']:<4} ({d['x']:3.0f},{d['y']:3.0f})      "
          f"{d['N_direct']:>10.3f} {d['N_Mx']:>10.3f} {d['N_My']:>10.3f} {d['N']:>10.3f}")
