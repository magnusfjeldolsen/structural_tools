"""
Simply supported beam with realistic SI units - should NOT crash
"""

#%%
from Pynite import FEModel3D

# Create model
beam = FEModel3D()

#%%
# Add nodes (5m span)
beam.add_node('N1', 0, 0, 0)
beam.add_node('N2', 5, 0, 0)

#%%
# Material: Steel (SI units)
E = 210*1e9      # Pa (210 GPa)
G = 81*1e9       # Pa (80 GPa)
nu = 0.3
rho = 7850     # kg/m³
beam.add_material('Steel', E, G, nu, rho)

#%%
# Section: W200x46 I-beam (realistic values in m)
A  = 5890e-6   # m² (5890 mm²)
Iy = 45.5e-6   # m⁴ (strong axis)
Iz = 1.55e-6   # m⁴ (weak axis)
J  = 0.30e-6   # m⁴ (torsion) - NOT tiny!
beam.add_section('W200x46', A, Iy, Iz, J)

# Add a section with the following properties:
# Iy = 100 in^4, Iz = 150 in^4, J = 250 in^4, A = 20 in^2
beam.add_section('MySection', 20, 100, 150, 250)


#%%
# Add member
beam.add_member('M1', 'N1', 'N2', 'Steel', 'MySection')

# Supports: pinned at N1, roller at N2
beam.def_support('N1', True, True, True, False, False, False)
beam.def_support('N2', False, True, True, False, False, False)

# Loads (SI units: N, N/m)
#beam.add_member_dist_load('M1', 'Fy', -10000, -10000, 0, 5)  # 10 kN/m
beam.add_member_pt_load('M1', 'Fy', -50000, 2.5)              # 50 kN at midspan

#%%
# Analyze
print("Running analysis...")
beam.analyze(check_statics=True)
print("✓ Analysis successful!")

# Results
print("\nReactions:")
print(f"  N1: FY = {beam.nodes['N1'].RxnFY['Combo 1']/1000:.2f} kN")
print(f"  N2: FY = {beam.nodes['N2'].RxnFY['Combo 1']/1000:.2f} kN")

print("\nMidspan results:")
member = beam.members['M1']
L = member.L()
print(f"  Moment:     {member.moment('Mz', L/2)/1000:.2f} kN·m")
print(f"  Shear:      {member.shear('Fy', L/2)/1000:.2f} kN")
print(f"  Deflection: {abs(member.deflection('dy', L/2))*1000:.3f} mm")

# %%
