# Example of a simply supported beam with a point load.
# Units used for the model in this example are inches and kips
#%%
# Import `FEModel3D` from `Pynite`
from Pynite import FEModel3D

# Create a new finite element model
simple_beam = FEModel3D()

# Add nodes (14 ft apart)
simple_beam.add_node('N1', 0, 0, 0)
simple_beam.add_node('N2', 5, 0, 0)

# Define a material
E = 210*1e9       # Modulus of elasticity (ksi)
G = 81*1e9       # Shear modulus of elasticity (ksi)
nu = 0.3        # Poisson's ratio
rho = 7850  # Density (kci)
simple_beam.add_material('Steel', E, G, nu, rho)

# Add a section with the following properties:
# Iy = 100 in^4, Iz = 150 in^4, J = 250 in^4, A = 20 in^2
simple_beam.add_section('MySection', 20, 100, 150, 250)

#Add member
simple_beam.add_member('M1', 'N1', 'N2', 'Steel', 'MySection')

# Provide simple supports
simple_beam.def_support('N1', True, True, True, True, False, False)  # Constrained for torsion at 'N1'
simple_beam.def_support('N2', True, True, True, True, False, False) # Not constrained for torsion at 'N2'

# Add a downward point load of 5 kips at the midspan of the beam
simple_beam.add_member_pt_load('M1', 'Fy', -5000, 2.5, 'D') # 
#simple_beam.add_member_pt_load('M1', 'Fy', -8, 7*12, 'L') # 8 kips Live load

#%%
# # Add load combinations
# simple_beam.add_load_combo('1.4D', {'D':1.4})
# simple_beam.add_load_combo('1.2D+1.6L', {'D':1.2, 'L':1.6})

# Analyze the beam and perform a statics check
simple_beam.analyze(check_statics=True)

print(simple_beam.members['M1'].shear_array('Fy',n_points=11))
# %%
