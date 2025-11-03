 #Example of a simply supported beam with a uniform distributed load.
# Units used in this example are inches and kips
# This example does not use load combinations. The program will create a
# default load combindation called 'Combo 1'
#%%
# Import `FEModel3D` from `Pynite`
from Pynite import FEModel3D

# Create a new finite element model
beam = FEModel3D()

# Add nodes (14 ft = 168 inches apart)
beam.add_node('N1', 0, 0, 0)
beam.add_node('N2', 168, 0, 0)
beam.add_node('N3', 168, -100, 0)  # Mid-span node for better results

# Define a material
E = 29000       # Modulus of elasticity (ksi)
G = 11200       # Shear modulus of elasticity (ksi)
nu = 0.3        # Poisson's ratio
rho = 2.836e-4  # Density (kci)
beam.add_material('Steel', E, G, nu, rho)

# Add a section with the following properties:
# Iy = 100 in^4, Iz = 150 in^4, J = 250 in^4, A = 20 in^2
beam.add_section('MySection', 20, 100, 150, 250)

#Add a member
beam.add_member('M1', 'N1', 'N2', 'Steel', 'MySection')
beam.add_member('M2', 'N2', 'N3', 'Steel', 'MySection')

# Provide simple supports
beam.def_support('N1', True, True, True, False, False, False)
beam.def_support('N2', True, True, True, True, False, False)

# Add a uniform load of 200 lbs/ft to the beam (from 0 in to 168 in)
beam.add_member_dist_load('M1', 'Fy', -200/1000/12, -200/1000/12, 0, 168)

# Alternatively the following line would do apply the load to the full
# length of the member as well
# beam.add_member_dist_load('M1', 'Fy', -200/1000/12, -200/1000/12)

# Analyze the beam
beam.analyze()
# %%
